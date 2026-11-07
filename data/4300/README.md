November 8, 2022 General Election (lavote election 4300). The 15 snapshots from 8:24 PM on election night through the December 5 certified count, plus `election_4300.json`, are the scraper's archive; note this archive uses its own candidate and contest ID numbering (60000 and up), which the registrar's current feed for this election no longer matches.

Two further files are not scraper payloads. `4300_2022-11-08 21:00:00.000000.json` (9:00 PM, 979,859 ballots counted) and `4300_2022-11-08 22:47:00.000000.json` (10:47 PM, 992,026 ballots counted) are a contributor's extracts of the feed, written down during election night: the `EBLT` ballots-counted row plus candidate totals for five contests, using this archive's IDs. Each covered contest has every candidate present, and every value lies between the 8:24 PM and 3:35 AM scraper snapshots, so the viewer adds these two points to those five contests and leaves the rest of the ballot unchanged:

- Supervisor, 3rd District
- Los Angeles City Attorney
- Los Angeles City Mayor
- Los Angeles City Council, 11th District
- Los Angeles City Council, 13th District

Timestamps are the feed's own `TimeStamp` at the time of capture.
