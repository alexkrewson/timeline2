# Timeline

A zoomable, editable timeline chart tool. Local-first, no accounts, no server.
Events render as horizontal bars on a shared time axis, grouped into rows you
configure. The engine represents any span from a single day to the age of the
universe.

It exists to replace a hand-maintained Excel→PDF workflow, so **editing** is the
point, not viewing. Entry speed is a first-class requirement.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173/timeline/
npm test         # 74 tests, headless
npm run build
```

## The one idea

There is exactly one data type: the **event**. An event has a start day, an end
day, and tags.

A **row is not data** — it is a view configuration that selects events by tag and
says how to pack and draw them. The same event appears in every row whose filter
matches it, on purpose. Switching between "one row per home" and "all homes in a
single lane" is a view change over identical data, never a data migration.

## Time

Every date is an **integer day count**, day 0 = 1970-01-01, held in a float64.

`Date` is never used for storage or arithmetic anywhere in the model layer. It is
milliseconds in a float64 and caps at ±273,790 years from the epoch — a wall you
hit almost immediately going backwards, and it fails silently. Integer days
across 14 Gy is ≈ 5.11 × 10¹²; float64 holds integers exactly to 9.007 × 10¹⁵,
about 1,760× headroom, so `+`, `-` and `*` are exact across the whole range.

Civil dates exist only at render time and only within roughly ±10,000 years of
the epoch, via a pure proleptic-Gregorian converter (Howard Hinnant's
`civil_from_days` / `days_from_civil`) — no `Date`, no Julian switchover. Above
that window, and above the millennium tick rung, the app renders years computed
arithmetically as `day / 365.2425`. That boundary is one function,
`unitSystemFor`, and it is a deliberate architectural seam.

Years are astronomical internally: year 0 = 1 BCE. Display says "1 BCE".

## Zoom

Scale is `pxPerDay`, held as `log(pxPerDay)`. One scroll notch multiplies scale
by 1.2, so a notch feels identical at day scale and at billion-year scale. Zoom
is anchored at the cursor. Day → 14 Gy is about 130 notches.

Grid ticks step through a fixed ladder (1d … 5Gy) chosen so pixel spacing always
lands in a **55–200px band**. The band ratio (3.64) must stay above the largest
ratio between adjacent rungs (3.5, at 2d→1w); `ladder.test.ts` asserts this, so
adding a rung can't quietly break the ladder into oscillating.

## Layout

Within a lane, overlapping bars split the lane height vertically instead of
colliding, assigned by a boundary sweep. A bar is a **polygon**, not a rectangle
— its height steps across its span, which reads as "something else was going on
here" before you've parsed what. Order is by start date, earliest on top, and
stays stable through every segment.

If a split would produce a sub-band under `minSubBandPx`, the lowest-priority
event moves to a new lane. Spilling past `maxLanes` is allowed and flagged in the
gutter, never a hard error — it might be a data error, or something you'd
forgotten.

## Layout of the source

```
src/time/      headless time core — days, calendar, zoom, tick ladder    (no DOM)
src/model/     events, packing sweep, date parsing, recommendation, files
src/render/    model → pixels: layout, labels, bar styling                (no DOM)
src/components/ React surface
src/data/      generated corpus.json
scripts/       corpus source list + its build step
```

The time core is separately testable and has no DOM dependency. It is the part
that is expensive to get wrong.

## Editing

| Key | Does |
|---|---|
| `N` | New event, from anywhere |
| `Enter` | Save and close |
| `Shift+Enter` | Save and reopen with the same tags — the bulk-entry path |
| `Ctrl+D` | Duplicate the selected event into a prefilled form |
| `Esc` | Cancel |
| `Ctrl+S` / `Ctrl+O` | Save / open |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| `←` `→` | Pan (hold Shift to pan further) |
| `+` `−` | Zoom |
| `Home` | Back to the present |
| Double-click a bar | Edit it |
| Right-click / long-press a bar | Edit · duplicate · zoom to fit · delete |

Every shortcut has an on-screen equivalent; nothing core is keyboard-only.

Date fields accept `2005`, `mar 2012`, `2012-03-03`, `3/3/2012`, `-3000`,
`3000 BCE`, `540 mya`, `today`. A partial date fills forward in Start and
backward in End, so `2005` means 1 January in Start and 31 December in End. The
resolved date is echoed in plain language under the field before you save.

A bare negative year is read the way people mean it: `-3000` is 3000 BCE. An ISO
`-3000-01-01` stays astronomical (3001 BCE), per ISO 8601. The echo removes the
ambiguity either way.

Mark an event **ongoing** and its end is recomputed at load rather than stored,
so a chart built today still reads correctly in five years without an edit.

## Files

A local JSON file is the source of truth. On Chromium desktop the File System
Access API writes straight back to the same file; elsewhere it falls back to
download/upload. The document is autosaved to IndexedDB every 30s as a crash
buffer — offered on load if it's newer, never restored silently.

The document carries a `schema` number and a migration chain. A file from a
higher schema is refused with a plain explanation rather than partially loaded.

`startPrecision` / `endPrecision` are reserved in the schema and unused in v1;
adding fuzzy dates later is two nullable columns and a render branch.

## Historical context

A hand-curated corpus of 343 entries ships with the app — geological eons
through eras, periods and epochs (ICS 2023, which tile without gaps), plus
historical periods and events. Turn it on in the Context tab.

Candidates are anything that **overlaps** the viewport, never "starts within":
viewing 1960–1970, the Cold War (1947–1991) has no start in view but is exactly
the context you want.

Ranking is duration-aware, because popularity alone is scale-blind — rank 1969
by raw significance and you get the Cold War, the Vietnam War and the 20th
century, the same rows you'd get for 1953. Scoring is
`significance × durationFactor(log10(duration / viewportSpan), mode)`:

| Mode | Effect |
|---|---|
| Raw popularity | No discount |
| Matching this zoom | Decade views surface decade-shaped events |
| What era am I in | Selects *for* events far longer than the view |

The third is not the absence of the discount, it's its inverse. Its results are
near-always full width, so they render as a pinned backdrop strip — the semantic
twin of the grid header. Zoom out and the tick labels reinterpret from years to
centuries while the band reinterprets from "Cold War" to "Holocene".

Personal events are always visible at every zoom and carry no rating.
Significance exists only for corpus data; the two never share an axis.

To edit the corpus, change `scripts/corpus-source.mjs` and run:

```bash
node scripts/build-corpus.mjs
```

`entityId` is reserved for a Wikidata Q-id, so a future ingestion pipeline lands
as an import rather than a migration.

## Export

SVG (primary — vector, editable, prints clean), PNG at a selectable DPI, and PDF
generated from the SVG. The export dialog carries the settings that don't belong
in the live view: date range, which rows, maximum height, and label density. It
reuses the same layout and label functions as the live chart, so what you export
is what you saw.

## Design

Follows the shared conventions in `../apps-shared/` — the Ember dark-first
palette, hand-authored BEM-ish CSS, 44px minimum touch targets, explicit
persistent light/dark rather than following the OS, and the eight-preset accent
theme picker with hover preview and click-to-commit.

Nothing encodes meaning in hue alone. Tag colour is the fill channel; the
modifier channels are shape-based — a faded fill, an underline stripe, a dashed
outline — one channel, one meaning, and each legible without colour perception.

## Not in v1

Fuzzy-date precision rendering · Wikidata ingestion · lazy-loaded corpus tiers ·
instant-event clustering at low zoom · manual sub-band ordering · multi-person
comparison · cloud sync. Saved views are in the schema but have no UI yet, and
rows reorder with buttons rather than drag.
