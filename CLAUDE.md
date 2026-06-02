# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A single-script Python tool that polls LA County election results from `results.lavote.gov` and saves snapshots as JSON files. Results files are named `{eid}_{datetime}.json` and committed directly to the repo root. A GitHub Actions workflow runs hourly, cancels the previous run, and self-exits after ~65 min via `--max-runtime`.

## Commands

```bash
# Install dependencies
uv sync

# Run the scraper locally (election ID required)
uv run scrape 4338

# With options
uv run scrape 4338 --delay 30 --no-moo --commit --max-runtime 3600
```

There are no tests or linting commands in this project.

## Architecture

All logic lives in `lavote_scrape/scrape.py`. The `scrape` Typer command:

1. Finds the newest existing `{eid}_*.json` file to determine the last known timestamp.
2. Polls `https://results.lavote.gov/ElectionResults/GetCounterData?electionID={eid}` on `--delay` interval.
3. Saves a new JSON snapshot when the `TimeStamp` field in the response advances.
4. Optionally plays `moo.mp3` (via `python-vlc`) and/or git-commits + pushes the new file.
5. Exits cleanly when `--max-runtime` seconds have elapsed (0 = run forever).

## CI Behavior

The workflow (`.github/workflows/scrape.yml`) uses `concurrency: cancel-in-progress` so each hourly trigger kills the previous run. It always passes `--no-moo --commit --max-runtime 3900`. The default election ID is `4338`; override via `workflow_dispatch` input.
