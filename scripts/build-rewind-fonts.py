#!/usr/bin/env python3
"""Build Rewind's subset, renamed fonts and typesetting metrics (P2.13).

Run it in a virtualenv with the pinned tools, then commit what it writes:

    python3 -m venv .venv-fonts
    .venv-fonts/bin/pip install -r scripts/rewind-fonts.requirements.txt
    .venv-fonts/bin/python scripts/build-rewind-fonts.py

Neither CI nor Docker runs this script: the outputs are committed and
`scripts/__tests__/rewind-fonts.test.ts` checks them against the hashes it
records in `scripts/rewind-fonts.lock.json`.

Sources are the variable Archivo and Newsreader files from google/fonts at the
commit pinned in the lockfile. Each download is checked against its sha256;
`--sources DIR` reads already-downloaded files instead.

Outputs (design 5.4, 6.4):
  app/(app)/rewind/_fonts/     4 WOFF2 web fonts (Archivo variable at wght 600-900,
                               Newsreader statics) + OFL licences
  lib/rewind/cards/fonts/      11 static TTF card instances + OFL licences
  lib/rewind/typeset/metrics.json  advances, kerning, tnum digits, coverage
"""

import argparse
import hashlib
import json
import shutil
import sys
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
LOCK = ROOT / "scripts" / "rewind-fonts.lock.json"
WEB_DIR = ROOT / "app" / "(app)" / "rewind" / "_fonts"
CARD_DIR = ROOT / "lib" / "rewind" / "cards" / "fonts"
METRICS = ROOT / "lib" / "rewind" / "typeset" / "metrics.json"

# Latin, Latin-1 Supplement, Latin Extended-A and the punctuation and symbols
# the copy uses. Code points a font lacks are simply not covered.
UNICODES = (
    list(range(0x20, 0x7F))
    + list(range(0xA0, 0x180))
    + [0x2C6, 0x2DA, 0x2DC, 0x2009, 0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D,
       0x2022, 0x2026, 0x2032, 0x2033, 0x2039, 0x203A, 0x2044, 0x20AC, 0x2122,
       0x2190, 0x2191, 0x2192, 0x2193, 0x2212]
)
FEATURES = ["kern", "liga", "tnum", "lnum", "case"]

PAGE_WIDTHS = [62, 75, 87.5, 100, 112.5, 125]
PAGE_WEIGHTS = [700, 760, 850, 900]
WEB_WGHT_RANGE = (600, 900)
# (file stem, wdth, wght) — design 6.4's eight static Archivo card instances.
CARD_ARCHIVO = [
    ("RewindArchivo-W62-700", 62, 700), ("RewindArchivo-W62-900", 62, 900),
    ("RewindArchivo-W75-900", 75, 900), ("RewindArchivo-W87-700", 87.5, 700),
    ("RewindArchivo-W87-900", 87.5, 900), ("RewindArchivo-W100-600", 100, 600),
    ("RewindArchivo-W100-900", 100, 900), ("RewindArchivo-W125-900", 125, 900),
]
# (file stem, source, opsz, family name) — Newsreader statics at weight 400.
NEWSREADER = [
    ("RewindNewsreader-Italic-72", "newsreader-italic", 72, "Rewind Newsreader Display Italic"),
    ("RewindNewsreader-16", "newsreader", 16, "Rewind Newsreader Text"),
    ("RewindNewsreader-Italic-16", "newsreader-italic", 16, "Rewind Newsreader Text Italic"),
]
WEB_NAMES = {
    "RewindNewsreader-Italic-72": "newsreader-display-italic.woff2",
    "RewindNewsreader-16": "newsreader-text.woff2",
    "RewindNewsreader-Italic-16": "newsreader-text-italic.woff2",
}
PRELOADED = ["archivo-vf.woff2", "newsreader-display-italic.woff2"]
BUDGET_PRELOADED = 110 * 1024
BUDGET_TOTAL = 160 * 1024


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fetch_sources(lock: dict, sources_dir: Path | None, cache: Path) -> dict[str, Path]:
    commit = lock["source"]["commit"]
    out: dict[str, Path] = {}
    for key, entry in lock["source"]["files"].items():
        base = sources_dir or cache / commit
        path = base / f"{key}{Path(entry['path']).suffix}"
        if not path.exists():
            if sources_dir:
                sys.exit(f"missing source {path}")
            path.parent.mkdir(parents=True, exist_ok=True)
            url = lock["source"]["raw"].format(commit=commit, path=entry["path"].replace("[", "%5B").replace("]", "%5D"))
            print(f"download {url}")
            with urllib.request.urlopen(url) as res:
                path.write_bytes(res.read())
        if sha256(path) != entry["sha256"]:
            sys.exit(f"sha256 mismatch for {path}; expected {entry['sha256']}")
        out[key] = path
    return out


def subset_font(font: TTFont, flavor: str | None = None) -> TTFont:
    opts = subset.Options()
    opts.layout_features = FEATURES
    opts.name_IDs = ["*"]
    opts.name_languages = ["*"]
    opts.notdef_outline = True
    opts.recalc_timestamp = False
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=UNICODES)
    sub.subset(font)
    font.flavor = flavor
    return font


def rename(font: TTFont, family: str) -> None:
    """Give the font its own family name; OFL modified versions may keep the
    original name (no Reserved Font Name) but renaming keeps them distinct."""
    name = font["name"]
    ps = family.replace(" ", "")
    for nid in (16, 17, 21, 22, 25):
        name.removeNames(nameID=nid)
    for nid, value in ((1, family), (2, "Regular"), (3, f"{ps};rewind-2026"), (4, family), (6, ps)):
        name.setName(value, nid, 3, 1, 0x409)
        name.setName(value, nid, 1, 0, 0)
    if "fvar" in font:
        name.setName(ps, 25, 3, 1, 0x409)


def save(font: TTFont, path: Path) -> None:
    font.recalcTimestamp = False
    path.parent.mkdir(parents=True, exist_ok=True)
    font.save(path, reorderTables=True)


def instance(source: Path, axes: dict) -> TTFont:
    vf = TTFont(source)
    return instancer.instantiateVariableFont(vf, axes, inplace=False, updateFontNames=False)


def width_label(wdth: float) -> str:
    return f"W{int(wdth)}"


def kern_pairs(font: TTFont, glyph_to_cp: dict[str, int]) -> dict[str, int]:
    """Flatten GPOS `kern` (PairPos formats 1 and 2) to {"AB": units}."""
    gpos = font["GPOS"].table
    lookups = set()
    for fr in gpos.FeatureList.FeatureRecord:
        if fr.FeatureTag == "kern":
            lookups.update(fr.Feature.LookupListIndex)
    glyphs = [g for g in glyph_to_cp]
    pairs: dict[str, int] = {}
    for li in sorted(lookups):
        lookup = gpos.LookupList.Lookup[li]
        subtables = [st.ExtSubTable if lookup.LookupType == 9 else st for st in lookup.SubTable]
        seen: set[tuple[str, str]] = set()
        for st in subtables:
            if st.LookupType != 2:
                continue
            coverage = set(st.Coverage.glyphs)
            if st.Format == 1:
                for idx, first in enumerate(st.Coverage.glyphs):
                    if first not in glyph_to_cp:
                        continue
                    for rec in st.PairSet[idx].PairValueRecord:
                        second = rec.SecondGlyph
                        if second not in glyph_to_cp or (first, second) in seen:
                            continue
                        seen.add((first, second))
                        value = getattr(rec.Value1, "XAdvance", 0) if rec.Value1 else 0
                        if value:
                            key = chr(glyph_to_cp[first]) + chr(glyph_to_cp[second])
                            pairs[key] = pairs.get(key, 0) + value
            elif st.Format == 2:
                cd1 = st.ClassDef1.classDefs
                cd2 = st.ClassDef2.classDefs
                for first in glyphs:
                    if first not in coverage:
                        continue
                    row = st.Class1Record[cd1.get(first, 0)]
                    for second in glyphs:
                        if (first, second) in seen:
                            continue
                        seen.add((first, second))
                        rec = row.Class2Record[cd2.get(second, 0)]
                        value = getattr(rec.Value1, "XAdvance", 0) if rec.Value1 else 0
                        if value:
                            key = chr(glyph_to_cp[first]) + chr(glyph_to_cp[second])
                            pairs[key] = pairs.get(key, 0) + value
    return dict(sorted(pairs.items()))


def tnum_advances(font: TTFont, cmap: dict[int, str]) -> list[int]:
    """Advances of the digits 0-9 under `tnum` (single substitutions)."""
    hmtx = font["hmtx"]
    gsub = font["GSUB"].table
    mapping: dict[str, str] = {}
    for fr in gsub.FeatureList.FeatureRecord:
        if fr.FeatureTag != "tnum":
            continue
        for li in fr.Feature.LookupListIndex:
            lookup = gsub.LookupList.Lookup[li]
            for st in lookup.SubTable:
                st = st.ExtSubTable if lookup.LookupType == 7 else st
                if getattr(st, "LookupType", None) == 1:
                    mapping.update(st.mapping)
    return [hmtx[mapping.get(cmap[cp], cmap[cp])][0] for cp in range(0x30, 0x3A)]


def face_metrics(font: TTFont, codepoints: list[int]) -> dict:
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    glyph_to_cp = {}
    for cp in codepoints:
        glyph_to_cp.setdefault(cmap[cp], cp)
    return {
        "advances": [hmtx[cmap[cp]][0] for cp in codepoints],
        "tnum": tnum_advances(font, cmap),
        "kern": kern_pairs(font, glyph_to_cp),
    }


def group_kerning(faces: list[dict], cps: list[int]) -> tuple[list[int], list[int]]:
    """Replace each face's {"AB": units} pairs with a sparse class matrix.

    Code points whose kerning rows (or columns) are identical in every face
    share a class, so accented letters ride on their base letter's values and
    the JSON stays small. Each face's `kern` becomes a flat [left, right,
    units, ...] list over the shared `kernLeft` and `kernRight` classes.
    """
    chars = [chr(cp) for cp in cps]

    def classes(key) -> list[int]:
        ids: dict[tuple, int] = {}
        return [ids.setdefault(key(c), len(ids)) for c in chars]

    left = classes(lambda a: tuple(tuple(f["kern"].get(a + b, 0) for b in chars) for f in faces))
    right = classes(lambda b: tuple(tuple(f["kern"].get(a + b, 0) for a in chars) for f in faces))
    index = {c: i for i, c in enumerate(chars)}
    for face in faces:
        cells = {(left[index[p[0]]], right[index[p[1]]]): v for p, v in face["kern"].items()}
        face["kern"] = [n for cell, v in sorted(cells.items()) for n in (*cell, v)]
    return left, right


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--sources", type=Path, help="directory holding the pinned source files")
    parser.add_argument("--cache", type=Path, default=ROOT / ".cache" / "rewind-fonts")
    args = parser.parse_args()

    lock = json.loads(LOCK.read_text())
    src = fetch_sources(lock, args.sources, args.cache)
    outputs: dict[str, Path] = {}

    # Web: the variable Archivo, subset and renamed.
    # Pages use weights 600-900 only; dropping the light masters keeps the
    # file inside the NFR-5 budget now that Latin Extended-A is included.
    archivo_vf = instance(src["archivo"], {"wght": WEB_WGHT_RANGE})
    archivo_vf = subset_font(archivo_vf, flavor="woff2")
    rename(archivo_vf, "Rewind Archivo")
    path = WEB_DIR / "archivo-vf.woff2"
    save(archivo_vf, path)
    outputs[path.name] = path

    # Cards: eight static Archivo instances.
    for stem, wdth, wght in CARD_ARCHIVO:
        font = subset_font(instance(src["archivo"], {"wdth": wdth, "wght": wght}))
        label = "Bold" if wght == 700 else "SemiBold" if wght == 600 else "Black"
        rename(font, f"Rewind Archivo {width_label(wdth)} {label}")
        path = CARD_DIR / f"{stem}.ttf"
        save(font, path)
        outputs[path.name] = path

    # Newsreader statics at weight 400: TTF for cards, WOFF2 for the web.
    for stem, key, opsz, family in NEWSREADER:
        for flavor, path in ((None, CARD_DIR / f"{stem}.ttf"), ("woff2", WEB_DIR / WEB_NAMES[stem])):
            font = subset_font(instance(src[key], {"opsz": opsz, "wght": 400}), flavor=flavor)
            rename(font, family)
            save(font, path)
            outputs[path.name] = path

    for target in (WEB_DIR, CARD_DIR):
        for key in ("archivo", "newsreader"):
            shutil.copyfile(src[f"ofl-{key}"], target / f"OFL-{key}.txt")

    # Metrics from the exact fonts that draw the text.
    archivo_cps = sorted(TTFont(WEB_DIR / "archivo-vf.woff2").getBestCmap())
    text_cps = set(TTFont(CARD_DIR / "RewindNewsreader-16.ttf").getBestCmap())
    covered = [cp for cp in archivo_cps if cp in text_cps]
    page = {}
    for wght in PAGE_WEIGHTS:
        for wdth in PAGE_WIDTHS:
            font = instance(WEB_DIR / "archivo-vf.woff2", {"wdth": wdth, "wght": wght})
            page[f"{wdth:g}/{wght}"] = face_metrics(font, archivo_cps)
    card = {}
    for stem, wdth, wght in CARD_ARCHIVO:
        card[f"{wdth:g}/{wght}"] = face_metrics(TTFont(CARD_DIR / f"{stem}.ttf"), archivo_cps)
    left, right = group_kerning([*page.values(), *card.values()], archivo_cps)
    metrics = {
        "source": f"google/fonts@{lock['source']['commit']}",
        "unitsPerEm": TTFont(CARD_DIR / "RewindArchivo-W62-700.ttf")["head"].unitsPerEm,
        "codepoints": archivo_cps,
        "covered": covered,
        "kernLeft": left,
        "kernRight": right,
        "page": page,
        "card": card,
    }
    METRICS.parent.mkdir(parents=True, exist_ok=True)
    METRICS.write_text(json.dumps(metrics, separators=(",", ":"), ensure_ascii=False) + "\n")
    outputs[METRICS.name] = METRICS

    preloaded = sum((WEB_DIR / n).stat().st_size for n in PRELOADED)
    total = sum(p.stat().st_size for p in WEB_DIR.glob("*.woff2"))
    print(f"web fonts: {preloaded / 1024:.0f} KB preloaded, {total / 1024:.0f} KB in total")
    print(f"metrics.json: {METRICS.stat().st_size / 1024:.0f} KB")

    lock["outputs"] = {str(p.relative_to(ROOT)): sha256(p) for p in sorted(outputs.values())}
    lock["budget"] = {"preloaded": preloaded, "total": total}
    LOCK.write_text(json.dumps(lock, indent=2) + "\n")

    if preloaded > BUDGET_PRELOADED or total > BUDGET_TOTAL:
        sys.exit(f"over the NFR-5 font budget ({BUDGET_PRELOADED} B preloaded, {BUDGET_TOTAL} B total)")


if __name__ == "__main__":
    main()
