# lavote_scrape

Polls LA County election results and saves time-series snapshots as JSON. A GitHub Actions workflow runs hourly and commits new drops automatically. A static viewer on GitHub Pages visualises vote share and batch composition across drops.

**Live viewer → [bckohan.github.io/lavote_scrape](https://bckohan.github.io/lavote_scrape/)**

---

## How it works

The scraper hits the [LA County results API](https://results.lavote.gov) for a given election ID and saves a new snapshot whenever the server timestamp advances. Snapshots are named `{eid}_{datetime}.json` and committed to the repo root. An `index.json` manifest is kept in sync so the viewer always knows what files exist.

CI runs on the hour via GitHub Actions, cancels the previous run, and exits after ~65 minutes — so there is always exactly one active scrape during an election.

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

## GitHub Actions

The workflow (`.github/workflows/scrape.yml`) runs hourly with `--no-moo --commit --max-runtime 3900`. The default election ID is `4338`; override it via **Actions → Run workflow**.

To scrape a different election long-term, update the `EID` default in the workflow file.

## Data format

| File | Contents |
|---|---|
| `election_{eid}.json` | Contest/candidate metadata from `GetElectionData` |
| `{eid}_{datetime}.json` | Vote count snapshot from `GetCounterData` |
| `index.json` | Scraper-maintained manifest of all elections and result files |
