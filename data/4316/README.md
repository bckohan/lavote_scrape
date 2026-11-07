March 5, 2024 Presidential Primary (lavote election 4316). The scraper was not running for this election, so the archive here is assembled from two sources:

- `election_4316.json` and `4316_2024-03-29 12:19:39.000000.json` are the registrar's own election metadata and the certified `GetCounterData` payload, fetched from `results.lavote.gov` on 2026-11-06. The counter file is complete (every contest, every candidate) and is the only full snapshot for this election.
- The eleven `4316_2024-03-05 …` through `4316_2024-03-13 …` files are a contributor's capture of the feed, written down by hand during and after election night and then entered into a spreadsheet. Each is a partial extract (75 to 80 rows: `EBLT` ballots counted plus candidate totals for the contests that were being tracked), not a full payload. Contest and candidate IDs are the registrar's; every ID resolves in `election_4316.json`, and no value exceeds the certified total.

The viewer only lets a file contribute a point to a contest when the file has a row for every candidate in that contest, so these extracts add election-night history to the contests they fully cover and leave everything else at the single certified point. Fully covered: State Senate 25, Assembly 52 and 57, Supervisor 5, District Attorney, LAUSD Board District 5, LA City Council Districts 4, 10 and 12, Glendale USD Areas A and E, and LA City Measure HLA (two files). Tracked with only their leading candidates, so shown from the certified file alone: US House 30 and 34, US Senate, LA City Council Districts 2 and 14.

Feed times are exact for the first six extracts. For the last five, the contributor's notes record only the date, so the time is approximate. They are all 4:30 PM, the county's usual afternoon update time, and the real feed time may be earlier or later that day:

| File | Time | Exact? |
|---|---|---|
| `4316_2024-03-05 20:55:00.000000.json` | 8:55 PM Mar 5 | yes |
| `4316_2024-03-05 23:00:00.000000.json` | 11:00 PM Mar 5 | yes |
| `4316_2024-03-06 01:00:00.000000.json` | 1:00 AM Mar 6 | yes |
| `4316_2024-03-06 14:02:00.000000.json` | 2:02 PM Mar 6 | yes |
| `4316_2024-03-06 16:40:00.000000.json` | 4:40 PM Mar 6 | yes |
| `4316_2024-03-07 16:30:00.000000.json` | 4:30 PM Mar 7 | yes |
| `4316_2024-03-08 16:30:00.000000.json` | Mar 8, ~4:30 PM | approximate |
| `4316_2024-03-09 16:30:00.000000.json` | Mar 9, ~4:30 PM | approximate |
| `4316_2024-03-11 16:30:00.000000.json` | Mar 11, ~4:30 PM | approximate |
| `4316_2024-03-12 16:30:00.000000.json` | Mar 12, ~4:30 PM | approximate |
| `4316_2024-03-13 16:30:00.000000.json` | Mar 13, ~4:30 PM | approximate |
| `4316_2024-03-29 12:19:39.000000.json` | 12:19 PM Mar 29 (certified) | yes |
