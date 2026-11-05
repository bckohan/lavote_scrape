These are not full `GetCounterData` payloads. Each file is an extract of the feed that the contributor wrote down during election night (November 8, 2022): the election's ballots-counted total (`EBLT`) and the candidate totals for a handful of contests (11 rows). They are here for posterity and so the time series has two more points, and are kept out of the viewer because most contests are missing.

Timestamps are the feed's own `TimeStamp` at the time of capture, so they are exact:

| File | Feed time | Ballots counted |
|---|---|---|
| `4300_2022-11-08 21:00:00.000000.json` | 9:00 PM | 979,859 |
| `4300_2022-11-08 22:47:00.000000.json` | 10:47 PM | 992,026 |

The scraper's first 2022 snapshot is at 8:24 PM and its next is at 3:35 AM, so these two fall in between. Candidate IDs are the ones in `election_4300.json`.
