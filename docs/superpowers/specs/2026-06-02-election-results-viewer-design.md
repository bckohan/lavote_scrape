# Election Results Time Series Viewer — Design Spec

**Date:** 2026-06-02
**Project:** lavote_scrape

## Overview

A static GitHub Pages site (`index.html` at repo root) that visualises LA County election result drops as time series. The goal is to make correlated candidate movement across drops cognizable — early mail, in-person, and late provisional votes each have characteristic demographic skews, and later drops shift shares in predictable correlated patterns.

---

## Architecture

Three pieces:

1. **`index.json`** — scraper-maintained manifest, keyed by election ID. Source of truth for what files exist on disk/GitHub Pages.
2. **`index.html`** — single self-contained static page. Chart.js from CDN. No build step. Client-side routing via URL hash.
3. **Scraper update** — `update_index()` helper wired into existing save logic.

GitHub Pages is configured to serve from the `main` branch root. No separate `gh-pages` branch needed.

---

## `index.json` Schema

```json
{
  "4324": {
    "title": "General Election",
    "election_date": "2024-11-05",
    "meta_file": "election_4324.json",
    "result_files": [
      "4324_2024-11-05 20:36:00.000000.json",
      "4324_2024-11-06 00:26:23.521214.json"
    ]
  },
  "4338": {
    "title": "Statewide Direct Primary Election",
    "election_date": "2026-06-03",
    "meta_file": "election_4338.json",
    "result_files": [
      "4338_2026-06-02 16:58:25.835135.json"
    ]
  }
}
```

`title` and `election_date` are sourced from `election_{eid}.json` → `Data.Title` and `Data.Date`.

---

## Scraper Changes

### `update_index(eid, title, election_date, meta_file, result_file=None)`

- Reads `index.json` (or initialises empty dict).
- Upserts the entry for `eid`: sets `title`, `election_date`, `meta_file`.
- If `result_file` is provided, appends it to `result_files` (idempotent — skip if already present).
- Writes `index.json` back.
- Does **not** commit itself; `git_commit()` in `scrape.py` is updated to stage `index.json` alongside the result file in the same commit.

### Call sites

| Where | What's passed |
|---|---|
| After saving `election_{eid}.json` | `meta_file`, no `result_file` |
| After saving `{eid}_{timestamp}.json` | `result_file`, no `meta_file` update needed (already set) |

### Backfill on startup

At scraper startup, before the poll loop: if `election_{eid}.json` exists but `index.json` has no entry for that `eid`, call `update_index()` with metadata from the file and scan `{eid}_*.json` glob to populate `result_files`. This handles existing elections (4324) without a manual migration step.

### `git_commit` update

When `--commit` is set, stage and commit `index.json` alongside each new result file in a single commit.

---

## Page: Two-Screen App

### Routing

Client-side via URL hash:
- `#/` — contest index
- `#/{eid}/{contestId}` — contest detail

### Index Screen

**Header:**
- Election dropdown (options built from `index.json` keys, sorted by `election_date` desc; most recent selected by default)
- Search input (filters by contest title or any candidate name)

**Body:**
- Contests grouped under ContestGroup section headers
- Each contest row: title, current leader + %, tiny sparkline of leading candidate's share over drops
- Minimum 44px tap target height for mobile
- Clicking a row navigates to `#/{eid}/{contestId}`
- Search filters rows in real-time; a match on a candidate name highlights that row

### Detail Screen

**Header:** Back button (`#/`), contest title, election name

**Chart — Top (cumulative share):**
- Line chart, one series per candidate with ≥5% of final contest total
- One additional dashed "All Others" aggregate line if any candidates are excluded
- Y-axis: 0–100%
- Annotation: "Showing N of M candidates (≥5% final share). X candidates aggregated into 'All Others'."

**Chart — Bottom (batch composition):**
- Stacked bar chart; one bar per drop (skipping the first since there's no previous to diff from)
- Each bar segment = votes added that drop for a candidate, expressed as % of total new votes in that drop
- Same filtered candidates + "All Others" segment
- Makes it immediately visible which candidate/bloc dominated each batch

**Mobile:** Both charts full-width, stacked vertically. Header elements wrap to full-width.

---

## Data Processing (Client-Side JS)

### Load sequence

1. `fetch('index.json')` → pick default election (highest numeric `eid`)
2. In parallel: `fetch(meta_file)` + `fetch` all `result_files`
3. Build lookups from metadata; build time series from result files

### Metadata lookups

From `election_{eid}.json`:
- `candidateId → { name, party }`
- `contestId → { title, groupName, candidateIds: [...] }`

### Time series construction

For each result file where `Data` is an array (skip files where it is not — there is one malformed file in election 4324):
- Extract `{ ReferenceID, Value }` rows where `ReferenceType === 'CAND'`
- Parse timestamp from filename: `{eid}_{datetime}.json`
- Build: `contestId → [ { timestamp, votes: { candidateId: N } } ]`, sorted by timestamp

### Per-contest rendering

1. Final totals: last drop's `votes` object, summed across all candidates in the contest
2. Contest total: sum of all candidate finals
3. Qualifying candidates: those where `final / contestTotal >= 0.05`
4. "All Others": sum of non-qualifying candidates (omitted if none)
5. Batch bars: for each drop `t > 0`, `batchVotes[cid] = votes[t][cid] - votes[t-1][cid]`; express each as % of `sum(batchVotes)`

### Index sparkline

Leading candidate's cumulative % across all drops (5–8 data points, no axes).

---

## Constraints & Notes

- No build tooling — Chart.js loaded from CDN (`cdn.jsdelivr.net/npm/chart.js@4`)
- Must work as a local `file://` open for development (no CORS issues; all fetches are same-origin on GitHub Pages, but local dev requires a simple HTTP server)
- The 5% threshold is applied to **final share** (last drop), not peak or average
- Malformed result files (where `Data` is not an array) are silently skipped
