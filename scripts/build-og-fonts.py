#!/usr/bin/env python3
"""Build the subset fonts for the app icons and the default OG image (P3.9).

Run it in a virtualenv with the pinned tools, then commit what it writes:

    python3 -m venv .venv-fonts
    .venv-fonts/bin/pip install -r scripts/rewind-fonts.requirements.txt
    .venv-fonts/bin/python scripts/build-og-fonts.py

Neither CI nor Docker runs this script. `lib/og/__tests__/fonts.test.ts` checks
the committed files against the 300 KB budget (ui-design-system 7.5).

Sources are IBM's own npm releases of IBM Plex Sans and IBM Plex Mono, pinned
below by version and by the sha256 of the registry tarball. `--sources DIR`
reads already-downloaded tarballs instead.

The licence reserves the font name "Plex", and a subset is a Modified Version,
so the outputs carry their own family names, "OG Sans" and "OG Mono".

Outputs, in lib/og/fonts/:
  OgSans-400.ttf, OgSans-500.ttf, OgSans-600.ttf, OgMono-500.ttf
  OFL.txt         the IBM Plex licence
  coverage.json   the code points every face covers, as [first, last] ranges
"""

import argparse
import hashlib
import io
import json
import sys
import tarfile
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "lib" / "og" / "fonts"

SOURCES = {
    "sans": {
        "package": "@ibm/plex-sans",
        "version": "1.1.0",
        "url": "https://registry.npmjs.org/@ibm/plex-sans/-/plex-sans-1.1.0.tgz",
        "sha256": "c3818979c2a2c82927ea3e7c485e389a18de0b7462887dd4f7acc9a525568962",
    },
    "mono": {
        "package": "@ibm/plex-mono",
        "version": "1.1.0",
        "url": "https://registry.npmjs.org/@ibm/plex-mono/-/plex-mono-1.1.0.tgz",
        "sha256": "744157918f504d2ec10ef2a26b7ec080e362743dda99618c8ff547e946e40d45",
    },
}

# (output stem, source, member in the tarball, family, weight)
FACES = [
    ("OgSans-400", "sans", "package/fonts/complete/woff/IBMPlexSans-Regular.woff", "OG Sans", 400),
    ("OgSans-500", "sans", "package/fonts/complete/woff/IBMPlexSans-Medium.woff", "OG Sans", 500),
    ("OgSans-600", "sans", "package/fonts/complete/woff/IBMPlexSans-SemiBold.woff", "OG Sans", 600),
    ("OgMono-500", "mono", "package/fonts/complete/woff/IBMPlexMono-Medium.woff", "OG Mono", 500),
]
WEIGHT_NAME = {400: "Regular", 500: "Medium", 600: "SemiBold"}

# Latin, Latin-1 Supplement, Latin Extended-A, Greek and Cyrillic, plus the
# punctuation server names and OG text use. Code points a face lacks are
# simply not covered, and coverage.json says so.
UNICODES = (
    list(range(0x20, 0x7F))
    + list(range(0xA0, 0x180))
    + list(range(0x370, 0x400))
    + list(range(0x400, 0x500))
    + [0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x20AC, 0x2122]
)
FEATURES = ["kern", "liga", "tnum", "lnum", "case"]
BUDGET = 300 * 1024


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fetch(key: str, sources_dir: Path | None) -> tarfile.TarFile:
    source = SOURCES[key]
    if sources_dir:
        path = sources_dir / Path(source["url"]).name
        if not path.exists():
            sys.exit(f"missing source {path}")
        data = path.read_bytes()
    else:
        print(f"download {source['url']}")
        with urllib.request.urlopen(source["url"]) as res:
            data = res.read()
    if sha256(data) != source["sha256"]:
        sys.exit(f"sha256 mismatch for {source['package']}@{source['version']}")
    return tarfile.open(fileobj=io.BytesIO(data), mode="r:gz")


def rename(font: TTFont, family: str, weight: int) -> None:
    style = WEIGHT_NAME[weight]
    full = f"{family} {style}"
    ps = f"{family.replace(' ', '')}-{style}"
    name = font["name"]
    for nid in (16, 17, 21, 22, 25):
        name.removeNames(nameID=nid)
    # Name IDs 1 and 2 follow the four-style model: anything but Regular is its own family.
    legacy = family if weight == 400 else full
    for nid, value in ((1, legacy), (2, "Regular"), (3, f"{ps};p39"), (4, full), (6, ps), (16, family), (17, style)):
        name.setName(value, nid, 3, 1, 0x409)
    font["OS/2"].usWeightClass = weight


def ranges(codepoints: list[int]) -> list[list[int]]:
    out: list[list[int]] = []
    for cp in sorted(codepoints):
        if out and cp == out[-1][1] + 1:
            out[-1][1] = cp
        else:
            out.append([cp, cp])
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--sources", type=Path, help="directory holding the pinned npm tarballs")
    args = parser.parse_args()

    tars = {key: fetch(key, args.sources) for key in SOURCES}
    OUT.mkdir(parents=True, exist_ok=True)
    coverage: dict[str, list[list[int]]] = {}

    for stem, key, member, family, weight in FACES:
        raw = tars[key].extractfile(member)
        if raw is None:
            sys.exit(f"{member} missing from {SOURCES[key]['package']}")
        font = TTFont(io.BytesIO(raw.read()))
        opts = subset.Options()
        opts.layout_features = FEATURES
        opts.name_IDs = ["*"]
        opts.notdef_outline = True
        opts.hinting = False
        opts.recalc_timestamp = False
        sub = subset.Subsetter(opts)
        sub.populate(unicodes=UNICODES)
        sub.subset(font)
        font.flavor = None
        rename(font, family, weight)
        font.recalcTimestamp = False
        path = OUT / f"{stem}.ttf"
        font.save(path, reorderTables=True)
        coverage[stem] = ranges(list(TTFont(path).getBestCmap()))

    licence = tars["sans"].extractfile("package/LICENSE.txt")
    assert licence is not None
    (OUT / "OFL.txt").write_bytes(licence.read())

    manifest = {
        "sources": {k: f"{v['package']}@{v['version']}" for k, v in SOURCES.items()},
        "faces": coverage,
    }
    (OUT / "coverage.json").write_text(json.dumps(manifest, separators=(",", ":")) + "\n")

    total = sum(p.stat().st_size for p in OUT.iterdir() if p.is_file())
    print(f"lib/og/fonts: {total / 1024:.0f} KB")
    if total > BUDGET:
        sys.exit(f"over the {BUDGET} B OG font budget")


if __name__ == "__main__":
    main()
