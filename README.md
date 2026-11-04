# lavote_scrape

Polls LA County election results and saves time-series snapshots as JSON. A GitHub Actions workflow runs hourly and commits new drops automatically. A static viewer on GitHub Pages visualises vote share and batch composition across drops.

**Live viewer → [bckohan.github.io/lavote_scrape](https://bckohan.github.io/lavote_scrape/)**

---

## How it works

The scraper hits the [LA County results API](https://results.lavote.gov) for a given election ID and saves a new snapshot whenever the server timestamp advances. Snapshots are named `{eid}_{datetime}.json` and committed under `data/{eid}/`. An `index.json` manifest is kept in sync so the viewer always knows what files exist.

CI runs on the hour via GitHub Actions and each new run cancels the previous one, so there is always exactly one active scrape during an election.

## Setup

Requires [uv](https://docs.astral.sh/uv/).

```bash
git clone https://github.com/bckohan/lavote_scrape
cd lavote_scrape
uv sync
```

## Usage

```bash
# Poll election 4338 with defaults (60s delay, moo on new results)
uv run scrape 4338

# Common options
uv run scrape 4338 --delay 30          # poll every 30s
uv run scrape 4338 --no-moo            # silence the moo
uv run scrape 4338 --commit            # git commit + push each new file
uv run scrape 4338 --max-runtime 3600  # exit after 1 hour
```

The election ID is in the URL on [results.lavote.gov](https://results.lavote.gov) — e.g. `electionID=4338`.

## Viewer

`index.html` at the repo root is a static single-page app (Chart.js, no build step).

- **Index screen** — all contests grouped by type, searchable by contest or candidate name, sparkline of leading candidate's share over time
- **Detail screen** — current vote totals, cumulative share line chart, per-drop batch composition, drop size histogram; winners highlighted for multi-seat contests

To run locally:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Projections

When `config.json` has `projections.enabled: true`, the viewer fetches model projections from the
URL in `projections.url` (a separate, private modeling repo publishes them to GitHub Pages) and shows
a "Projection" section on contests the model marks publishable, plus a "Movers" panel on the index.
Set `enabled` to `false` and commit to hide all projections within a minute. `?projections=off` in the
URL disables them for one session; `?projections=on` forces the fetch even when disabled (for testing).

## GitHub Actions

The workflow (`.github/workflows/scrape.yml`) runs hourly with `--no-moo --commit` (no `--max-runtime`; each hourly run cancels the previous one). The default election ID is `4348`; override it via **Actions → Run workflow**.

To scrape a different election long-term, update the `4348` defaults in the workflow file.

A second workflow, `.github/workflows/notify-modeling.yml`, runs on each data push to `main` and sends a `repository_dispatch` to the private `lavote_modeling` repo, which publishes projections to GitHub Pages.

## Data format

| File | Contents |
|---|---|
| `data/{eid}/election_{eid}.json` | Contest/candidate metadata from `GetElectionData` |
| `data/{eid}/{eid}_{datetime}.json` | Vote count snapshot from `GetCounterData` |
| `index.json` | Scraper-maintained manifest of all elections and result files |
| `config.json` | Viewer switch for model projections; see [Projections](#projections) |
