# Noto Sans card faces (safe mode)

Static Bold (700) instances of Noto Sans that the Rewind cards use for titles
the Archivo card subset cannot set (design 4.9, plan step P7.6). They are read
on the server by `lib/rewind/cards/noto.ts`, cut to each card's glyphs with
`subset-font`, and never sent to a browser.

| File | Family | Covers | Licence | Copyright |
|---|---|---|---|---|
| `NotoSans-Bold.ttf` | Noto Sans | Latin, Latin Extended, Greek, Cyrillic, Vietnamese | OFL 1.1 (`OFL-noto-sans.txt`) | The Noto Project Authors |
| `NotoSansJP-Bold.ttf` | Noto Sans JP | Japanese (kana, kanji) | OFL 1.1 (`OFL-noto-sans-jp.txt`) | Adobe |
| `NotoSansSC-Bold.ttf` | Noto Sans SC | Simplified Chinese | OFL 1.1 (`OFL-noto-sans-sc.txt`) | Adobe |
| `NotoSansKR-Bold.ttf` | Noto Sans KR | Korean (Hangul) | OFL 1.1 (`OFL-noto-sans-kr.txt`) | Adobe |
| `NotoSansArabic-Bold.ttf` | Noto Sans Arabic | Arabic | OFL 1.1 (`OFL-noto-sans-arabic.txt`) | The Noto Project Authors |
| `NotoSansHebrew-Bold.ttf` | Noto Sans Hebrew | Hebrew | OFL 1.1 (`OFL-noto-sans-hebrew.txt`) | The Noto Project Authors |
| `NotoSansDevanagari-Bold.ttf` | Noto Sans Devanagari | Devanagari | OFL 1.1 (`OFL-noto-sans-devanagari.txt`) | The Noto Project Authors |
| `NotoSansThai-Bold.ttf` | Noto Sans Thai | Thai | OFL 1.1 (`OFL-noto-sans-thai.txt`) | The Noto Project Authors |

**Source.** The Google Fonts static instances as published on npm by the
`@expo-google-fonts/*` packages: `noto-sans@0.4.2`, `noto-sans-jp@0.4.4`,
`noto-sans-sc@0.4.4`, `noto-sans-kr@0.4.4`, `noto-sans-arabic@0.4.3`,
`noto-sans-hebrew@0.4.1`, `noto-sans-devanagari@0.4.1` and
`noto-sans-thai@0.4.2`, each `700Bold/<Family>_700Bold.ttf`, renamed. The
licence files are each package's `LICENSE_FONT`, unchanged.

**Updating.** Replace a file with the same family's static Bold TTF, keep
its licence beside it, then run `npm run rewind:card-version`: the font hash
in `CARD_VERSION` covers this folder, so cached cards re-render.
