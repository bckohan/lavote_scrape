# Projections in the Viewer — Design Spec

**Date:** 2026-11-03
**Status:** Approved
**Primary spec:** `lavote_modeling/docs/superpowers/specs/2026-11-03-live-projections-design.md`
(private repo). This document covers only the `lavote_scrape` side.

## Goal

Render model projections (projected final share with a 90% band, win probability, and
per-update trajectory) produced by `lavote_modeling`, only when they are available for a
contest, and with a one-line switch to hide them all. The scraper and its workflow are
untouched.

## Changes to this repo

| Path | Change |
|---|---|
| `config.json` (new) | `{ "projections": { "enabled": true, "url": "https://bckohan.github.io/lavote_modeling" } }` |
| `projections.js` (new) | All projection fetch/render logic |
| `index.html` | Fetch `config.json`; two mount points; `<script src="projections.js">`; three small hooks |
| `.github/workflows/notify-modeling.yml` (new) | On push to `main` touching `data/**` or `index.json`, send `repository_dispatch` (`new-drop`) to `bckohan/lavote_modeling` using secret `MODELING_DISPATCH_TOKEN` |
| `docs/fixtures/projections/` (new) | Sample `index.json`, `turnout.json`, one contest file, `movers.json` for local testing |
| `CLAUDE.md`, `README.md` | Document the switch and the new files |

`scrape.py`, `scrape.yml`, `index.json`, and `data/` are not modified.

## Gating (both must pass)

1. **Local switch.** `config.json` is fetched with `cache: 'no-store'` at startup and on
   every 60 s poll. Missing file, parse error, or `enabled: false` → no projections, no
   network calls to the model host. `?projections=off` in the URL forces off for a
   session; `?projections=on` forces on (still requires the remote manifest).
2. **Remote gate.** `${url}/index.json` is fetched with `cache: 'no-store'`. A contest
   renders only if `elections[eid].contests[contestId].publish === true` and
   `schema_version` major equals 1. Any fetch error or shape mismatch → that part is
   silently omitted; the rest of the viewer is unaffected.

## Detail page

When gated on for the contest, a new `chart-section` titled **Projection** is inserted
directly after Current Totals:

- **Summary line:** `Projected final: {leader} {mean}% ({p05}–{p95}) · {p_win}% chance of
  winning` (measures: "of passing"). A `confidence: "prior"` file adds "(early, mostly
  prior)" and a muted style.
- **Chart:** Chart.js line chart. Observed cumulative share per candidate as today
  (solid), then the projected cumulative share after each pending update (dashed) with a
  filled band between p05 and p95 (semi-transparent fill of the candidate's color). X
  labels: observed drop stamps followed by scheduled update labels (e.g. "Thu 11/5 9am").
  A vertical divider marks "now".
- **Caveat label:** "Model estimate, not an official count." linking to
  `${url}/methods.html`.
- **Drop table:** gains a "Projected final" column (mean with band) for candidates with a
  projection; unchanged otherwise.

Multi-county contests keep their existing warning; the projection is of LA County votes
only and the summary says so when `contest.multiCounty` is set.

## Index page

When gated on and `movers.json` loads, a collapsible **Movers** panel renders above the
contest list: top 10 rows by projected movement — title, leader, current margin,
projected margin (with band), flip probability — each linking to `#/{eid}/{contestId}`.
Rows whose contest is not publishable show the numbers but no per-contest projection on
click (the detail page simply has no Projection section). Collapsed state is remembered
in `localStorage`.

## Code shape

`projections.js` exposes a single global:

```js
window.Projections = {
  async init(eid),                 // loads config + manifest; returns enabled boolean
  isPublishable(eid, contestId),
  async renderDetail(eid, contestId, mountEl, electionData, qualified, colors),
  async renderMovers(eid, mountEl),
  destroy(),                       // tears down its charts
};
```

`index.html` hooks: call `Projections.init` in `init()` and on each poll; call
`renderMovers` at the end of `renderIndex()`; call `renderDetail` at the end of
`renderDetail()` after the existing charts; call `destroy()` in `destroyActiveCharts()`.
No existing chart or layout code changes.

## Failure behavior

Everything fails open to the current viewer: no projections section, no movers panel, no
console noise beyond a single `console.info`. The scraper's `index.json` is never
affected by anything in this feature.

## Testing

- Serve locally with `python3 -m http.server 8000` and
  `config.json.url` pointed at `docs/fixtures/projections` to exercise rendering without
  the model host.
- Manual checks: switch off via `config.json`, via `?projections=off`, remote 404, and a
  contest with `publish: false`.
