# IOM Snooker Stats

A static page (no server, no build) that works out player and team stats from three
CSV files in `data/`. Open `index.html` through any web server.

## Data files

`matches.csv`: one row per match.

| column | example |
| --- | --- |
| match_id | 101 |
| season | 2026-27 |
| date | 2026-11-18 (year-month-day) |
| competition | League |
| home_team, away_team | team names, spelt the same every time |
| venue | where it was played |
| home_frames, away_frames | 3, 2 |

`frames.csv`: one row per frame.

| column | example |
| --- | --- |
| match_id | matches the row in matches.csv |
| frame | 1 to 5 |
| home_player, away_player | player names, spelt the same every time |
| winner | `home` or `away` |

`breaks.csv` (optional): `match_id, season, date, player, team, break`.

`info.json` (optional): `{ "sample": true, "updated": "text" }`. Remove `sample` for
real data.

The data in `data/` now is made up by `tools/make-sample-data.ps1`.
League table points are frames won, as on the league's own table.
