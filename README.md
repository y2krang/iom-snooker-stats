# IOM Snooker Stats

A static page (no server, no build) that works out player and team stats from CSV
files in `data/`. Open `index.html` through any web server.

## Updating the data

The files in `data/` are made from the league data export by
`tools/import-export.ps1`:

    powershell -File tools\import-export.ps1 -Export "<export folder>\csv"

It only reads the export's CSV files. Names are tidied to Title Case; the same name
is treated as the same player or team.

## Data files

| file | one row per | main columns |
| --- | --- | --- |
| `seasons.csv` | season | season (2026-27), name, current |
| `matches.csv` | team league match | match_id, season, date, competition, home_team, away_team, home_frames, away_frames, note, date_from_report |
| `frames.csv` | league frame | match_id, frame, home_player, away_player, winner (home/away), home_points, away_points |
| `cups.csv` | cup or individual match | season, date, competition, kind (singles/pairs/team), type (cup/league), round, home, away, home_score, away_score |
| `tables.csv` | league table row | season, competition, kind (teams/players), pos, name, P, W, D, L, F, A, diff, pts |
| `squads.csv` | player in a team squad | season, team, player, handicap |
| `handicaps.csv` | published handicap change | date, season, player, handicap |
| `honours.csv` | title | season, competition, kind, winner, runner_up, score |
| `breaks.csv` | break in a match report | season, date, player, team, break, source |
| `coverage.csv` | league season | matches_played, matches_with_results, frames_with_players |
| `info.json` | | updated, source (add `"sample": true` for demo data) |

`date_from_report = 1` means the match date is the report's date, not the match's.
Frame points include handicap starts. Breaks are read from report wording and can be
wrong or missing.

`tools/make-sample-data.ps1` makes the old made-up demo data (matches, frames, breaks).
