# Turns the league data export (folder of CSVs) into the files the page reads (data\*.csv).
# Run: powershell -File import-export.ps1 -Export "<export folder>\csv"
# Reads CSV only. Never runs anything from the export.
param([Parameter(Mandatory)][string]$Export, [string]$Out = '')
$ErrorActionPreference = 'Stop'
if (-not $Out) { $Out = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..\data' }
$ti = (Get-Culture).TextInfo
function L($f) { Import-Csv (Join-Path $Export "$f.csv") -Encoding UTF8 }
$ACR = @('DSC', 'DSB', 'PSM', 'IOM', 'IOMBSA', 'NFU', 'II', 'III', 'L6', 'L8', 'L12')
function Nice([string]$s) {
  $s = ($s -replace '\s+', ' ').Trim(); if (-not $s) { return '' }
  $w = foreach ($t in $s.Split(' ')) {
    if ($ACR -contains $t.ToUpper()) { $t.ToUpper(); continue }
    $x = $ti.ToTitleCase($t.ToLower())
    $x = [regex]::Replace($x, "(?<=^|[-'’])(\w)(?=\w\w)", { param($m) $m.Value.ToUpper() })
    $x = [regex]::Replace($x, '(?<=^|-)(Mc|Mac(?=[bcdfghklmnrtvwz][a-z]{2}))(\w)', { param($m) $m.Groups[1].Value + $m.Groups[2].Value.ToUpper() })
    $x
  }
  # small joining words stay lower case (not as the first word)
  $w = @($w); for ($i = 1; $i -lt $w.Count; $i++) { if ($w[$i] -in 'Of', 'And', 'The', 'In', 'At', 'For') { $w[$i] = $w[$i].ToLower() } }
  $w -join ' '
}
function Key([string]$s) { ($s.ToLower() -replace '\(.*?\)', '' -replace '[^a-z0-9]', '') }
function Q($v) { $s = [string]$v; if ($s -match '[",\r\n]') { '"' + ($s -replace '"', '""') + '"' } else { $s } }
function Save($name, $cols, $rows) {
  $lines = [Collections.Generic.List[string]]::new(); $lines.Add($cols -join ',')
  foreach ($r in $rows) { $lines.Add((($cols | ForEach-Object { Q $r.$_ }) -join ',')) }
  [IO.File]::WriteAllLines((Join-Path $Out "$name.csv"), $lines, [Text.UTF8Encoding]::new($false))
  "{0,-12} {1,6} rows" -f $name, ($lines.Count - 1)
}
New-Item -ItemType Directory -Force $Out | Out-Null

# ---------- seasons ----------
$season = @{}; $seasonRows = @()
foreach ($s in L 'seasons') {
  $lab = '{0}-{1:00}' -f [int]$s.start_year, ([int]$s.end_year % 100)
  $season[$s.season_id] = $lab
  $seasonRows += [pscustomobject]@{ season = $lab; name = $s.name; current = $(if ($s.is_current -eq 'Y') { 1 } else { 0 }) }
}
function SeasonOfDate([string]$d) { $y = [int]$d.Substring(0, 4); $m = [int]$d.Substring(5, 2); $sy = if ($m -ge 8) { $y } else { $y - 1 }; '{0}-{1:00}' -f $sy, (($sy + 1) % 100) }

# ---------- competitions ----------
$comp = @{}
foreach ($c in L 'divisions') { $comp[$c.competition_id] = $c }

# ---------- players (same name = same person) ----------
$pname = @{}; $pkey = @{}
foreach ($p in L 'players') { if ($p.name -match '^WALK ?OVER$') { continue }; $n = Nice $p.name; $pname[$p.player_id] = $n; $pkey[(Key $n)] = $n }
function Player([string]$id, [string]$text) {
  if ($id -and $pname[$id]) { return $pname[$id] }
  $t = ($text -replace '^\(\d+\)\s*', '').Trim(); if (-not $t) { return '' }
  $k = Key $t; if ($pkey[$k]) { return $pkey[$k] }
  $n = Nice $t; $pkey[$k] = $n; $n
}

# ---------- teams (same name = same team) ----------
$tname = @{}; $tkey = @{}
foreach ($t in L 'teams') { $n = Nice $t.name; $tname[$t.team_id] = $n; $tkey[(Key $n)] = $n }
foreach ($t in L 'team_seasons') { if (-not $tname[$t.team_id]) { $n = Nice $t.team_name; $tname[$t.team_id] = $n; $tkey[(Key $n)] = $n } }
function Team([string]$id, [string]$text) {
  if ($id -and $tname[$id]) { return $tname[$id] }
  $k = Key $text; if ($tkey[$k]) { return $tkey[$k] }
  Nice ($text -replace '\(.*?\)', '')
}
function IsTeam([string]$id, [string]$text) { ($id -and $tname[$id]) -or $tkey[(Key $text)] }

# ---------- results: team league, cups ----------
$tm = [Collections.Generic.List[object]]::new(); $cups = [Collections.Generic.List[object]]::new()
$byPair = @{}   # season|home|away -> list of matches (for linking reports)
$matchById = @{}
foreach ($r in L 'results') {
  if ($r.home_score -notmatch '^\d+$' -or $r.away_score -notmatch '^\d+$') { continue }
  $c = $comp[$r.competition_id]; $sl = $season[$r.season_id]
  $note = if ($r.score_note -match 'walkover') { 'walkover' } else { '' }
  if ($c.type -eq 'team league') {
    $m = [pscustomobject]@{ match_id = $r.match_id; season = $sl; date = $r.date; competition = (Nice $c.name); home_team = (Team $r.home_team_id $r.home_name); away_team = (Team $r.away_team_id $r.away_name); home_frames = $r.home_score; away_frames = $r.away_score; note = $note; date_from_report = 0 }
    $tm.Add($m); $matchById[$m.match_id] = $m
    $k = "$sl|$($m.home_team)|$($m.away_team)"; if (-not $byPair[$k]) { $byPair[$k] = @() }; $byPair[$k] += $m
  } else {
    $kind = if ((IsTeam $r.home_team_id $r.home_name) -and (IsTeam $r.away_team_id $r.away_name)) { 'team' } elseif ("$($r.home_name)$($r.away_name)" -match '&| and |/') { 'pairs' } else { 'singles' }
    $h = if ($kind -eq 'team') { Team $r.home_team_id $r.home_name } elseif ($kind -eq 'pairs') { Nice $r.home_name } else { Player $r.home_player_id $r.home_name }
    $a = if ($kind -eq 'team') { Team $r.away_team_id $r.away_name } elseif ($kind -eq 'pairs') { Nice $r.away_name } else { Player $r.away_player_id $r.away_name }
    if ($h -match '^(Bye|Tbc|Tba)$' -or $a -match '^(Bye|Tbc|Tba)$') { continue }
    $cups.Add([pscustomobject]@{ match_id = $r.fixture_id; season = $sl; date = $r.date; competition = (Nice $c.name); kind = $kind; type = $(if ($c.type -eq 'individual league') { 'league' } else { 'cup' }); round = $r.round; home = $h; away = $a; home_score = $r.home_score; away_score = $r.away_score; note = $note })
  }
}

# ---------- match reports: link or add, then frames ----------
# Reports use the team names of the time; the site shows today's names. Learn the old
# names: same night (report within 14 days), same score, same opponent = same team.
$reports = @(L 'report_matches' | ForEach-Object { $_.home_team_text = ($_.home_team_text -replace '^(?i)late result:\s*', ''); $_ })
$votes = @{}
foreach ($rm in $reports) {
  $sl = if ($rm.season_id) { $season[$rm.season_id] } else { SeasonOfDate $rm.report_date }
  foreach ($side in 'home', 'away') {
    $uid = $rm."$($side)_team_id"; if ($uid) { continue }
    $u = $rm."$($side)_team_text"; $o = if ($side -eq 'home') { 'away' } else { 'home' }
    if (-not $rm."$($o)_team_id") { continue }
    $k = Team $rm."$($o)_team_id" ''
    $uf = $rm."$($side)_frames"; $kf = $rm."$($o)_frames"
    $cands = @($tm | Where-Object { $_.season -eq $sl -and $_."$($o)_team" -eq $k -and $_."$($side)_frames" -eq $uf -and $_."$($o)_frames" -eq $kf -and (([datetime]$rm.report_date - [datetime]$_.date).TotalDays -in 0..14) })
    if ($cands.Count -eq 1) { $vk = "$sl|$(Key $u)"; if (-not $votes[$vk]) { $votes[$vk] = @{} }; $t = $cands[0]."$($side)_team"; $votes[$vk][$t] = 1 + $votes[$vk][$t] }
  }
}
$alias = @{}
foreach ($vk in $votes.Keys) { $best = $votes[$vk].GetEnumerator() | Sort-Object Value -Descending; $tot = ($best | Measure-Object Value -Sum).Sum; if ($best[0].Value -ge 2 -and $best[0].Value / $tot -ge 0.7) { $alias[$vk] = $best[0].Key } }
"team names learned from reports: " + (($alias.GetEnumerator() | ForEach-Object { "$($_.Key) = $($_.Value)" }) -join '; ')
function ReportTeam($id, $text, $sl) { if ($id) { return Team $id $text }; $a = $alias["$sl|$(Key $text)"]; if ($a) { $a } else { Team '' $text } }

$inTable = @{}; $skipped = 0
foreach ($t in L 'league_tables') { if ($comp[$t.competition_id].type -eq 'team league') { $inTable["$($season[$t.season_id])|$(Team $t.team_id $t.team_name)"] = 1 } }
$reportTo = @{}   # report_match_id -> @{ id; swap }
$n = 0
foreach ($rm in $reports) {
  $c = $comp[$rm.competition_id]; if ($c -and $c.type -ne 'team league') { continue }
  $sl = if ($rm.season_id) { $season[$rm.season_id] } else { SeasonOfDate $rm.report_date }
  $h = ReportTeam $rm.home_team_id $rm.home_team_text $sl; $a = ReportTeam $rm.away_team_id $rm.away_team_text $sl
  if ($rm.match_id -and $matchById[$rm.match_id]) { $m = $matchById[$rm.match_id]; $reportTo[$rm.report_match_id] = @{ id = $m.match_id; swap = ($m.home_team -eq $a -and $m.away_team -eq $h) }; continue }
  # each team is at home to each other team once a season: same home and away teams = same match
  $found = $null; $swap = $false
  $same = @($byPair["$sl|$h|$a"] | Where-Object { $_ })
  if ($same.Count) { $found = $same | Sort-Object { [math]::Abs(([datetime]$rm.report_date - [datetime]$_.date).TotalDays) } | Select-Object -First 1 }
  else {
    # report may name the teams the other way round: only if the score fits that way too
    $rev = @($byPair["$sl|$a|$h"] | Where-Object { $_ -and ([datetime]$rm.report_date - [datetime]$_.date).TotalDays -in 0..21 -and $_.home_frames -eq $rm.away_frames })
    if ($rev.Count) { $found = $rev[0]; $swap = $true }
  }
  if ($found) { $reportTo[$rm.report_match_id] = @{ id = $found.match_id; swap = $swap }; continue }
  if ($rm.home_frames -notmatch '^\d+$') { continue }
  # don't invent teams: both must be in that season's league table
  if (-not ($inTable["$sl|$h"] -and $inTable["$sl|$a"])) { $skipped++; continue }
  $n++; $id = "rep$n"
  $m = [pscustomobject]@{ match_id = $id; season = $sl; date = $rm.report_date; competition = $(if ($c) { Nice $c.name } else { 'League' }); home_team = $h; away_team = $a; home_frames = $rm.home_frames; away_frames = $rm.away_frames; note = ''; date_from_report = 1 }
  $tm.Add($m); $matchById[$id] = $m
  $k = "$sl|$h|$a"; if (-not $byPair[$k]) { $byPair[$k] = @() }; $byPair[$k] += $m
  $reportTo[$rm.report_match_id] = @{ id = $id; swap = $false }
}
"report matches left out (team not identified): $skipped"
$frames = [Collections.Generic.List[object]]::new()
foreach ($f in L 'frames') {
  $to = $reportTo[$f.report_match_id]; if (-not $to) { continue }
  $hp = Player $f.home_player_id $f.home_player; $ap = Player $f.away_player_id $f.away_player
  if (-not $hp -or -not $ap) { continue }
  $w = $f.winner; $hpt = $f.home_points; $apt = $f.away_points
  if ($to.swap) { $hp, $ap = $ap, $hp; $hpt, $apt = $apt, $hpt; $w = @{ home = 'away'; away = 'home' }[$w] }
  if ($w -notin 'home', 'away') { continue }
  $frames.Add([pscustomobject]@{ match_id = $to.id; frame = $f.frame_no; home_player = $hp; away_player = $ap; winner = $w; home_points = $hpt; away_points = $apt })
}

# ---------- tables ----------
$tables = foreach ($t in L 'league_tables') {
  $c = $comp[$t.competition_id]; if (-not $c -or $c.type -eq 'cup/knockout/individual event') { continue }
  $ind = $c.type -eq 'individual league'
  [pscustomobject]@{ season = $season[$t.season_id]; competition = (Nice $c.name); kind = $(if ($ind) { 'players' } else { 'teams' }); pos = $t.'#'; name = $(if ($ind) { Player '' $t.team_name } else { Team $t.team_id $t.team_name }); P = $t.P; W = $t.W; D = $t.D; L = $t.L; F = $t.F; A = $t.A; diff = $t.'+-'; pts = $t.PTS }
}
# individual-league entrants carry player ids
$ent = @{}; foreach ($e in L 'competition_entrants') { if ($e.player_id) { $ent["$($e.competition_id)|$(Key $e.entrant_name)"] = $pname[$e.player_id] } }

# ---------- squads and handicaps ----------
$squads = foreach ($s in L 'squads') { if ($s.player_name -match '^WALK ?OVER$') { continue }; [pscustomobject]@{ season = $season[$s.season_id]; team = (Team $s.team_id ''); player = (Player $s.player_id $s.player_name); handicap = $s.handicap } }
$squads = $squads | Sort-Object season, team, player -Unique
$hc = foreach ($h in L 'handicap_changes') { if ($h.new_handicap -notmatch '^-?\d+$') { continue }; [pscustomobject]@{ date = $h.date; season = (SeasonOfDate $h.date); player = (Player '' $h.player_name); handicap = $h.new_handicap } }

# ---------- honours: finals and league winners ----------
$honours = [Collections.Generic.List[object]]::new()
foreach ($m in $cups) {
  if ($m.round -notmatch '^Finals?$' -or $m.type -ne 'cup') { continue }
  # a final can appear twice (e.g. a part score); keep the one with most frames played
  $prev = $honours | Where-Object { $_.season -eq $m.season -and $_.competition -eq $m.competition } | Select-Object -First 1
  $tot = [int]$m.home_score + [int]$m.away_score
  if ($prev) { if ($prev.frames -ge $tot) { continue } else { [void]$honours.Remove($prev) } }
  $hw = [int]$m.home_score -gt [int]$m.away_score
  $honours.Add([pscustomobject]@{ season = $m.season; competition = $m.competition; kind = $m.kind; winner = $(if ($hw) { $m.home } else { $m.away }); runner_up = $(if ($hw) { $m.away } else { $m.home }); score = $(if ($hw) { "$($m.home_score)-$($m.away_score)" } else { "$($m.away_score)-$($m.home_score)" }); date = $m.date; frames = $tot })
}
$cur = ($seasonRows | Where-Object current -eq 1).season
foreach ($t in $tables | Where-Object pos -eq '1') { if ($t.season -eq $cur) { continue }; $honours.Add([pscustomobject]@{ season = $t.season; competition = $t.competition; kind = $(if ($t.kind -eq 'teams') { 'league' } else { 'individual league' }); winner = $t.name; runner_up = (($tables | Where-Object { $_.season -eq $t.season -and $_.competition -eq $t.competition -and $_.pos -eq '2' }).name); score = ''; date = '' }) }

# ---------- breaks from news reports (best effort) ----------
$surname = @{}; foreach ($pn in ($pname.Values | Sort-Object -Unique)) { $sn = ($pn.Split(' ')[-1]).ToLower(); if ($surname[$sn]) { $surname[$sn] = '?' } else { $surname[$sn] = $pn } }
$fullRe = [regex]::new('\b(' + ((($pname.Values | Sort-Object -Unique | Sort-Object Length -Descending) | ForEach-Object { [regex]::Escape($_) }) -join '|') + ')\b', 'IgnoreCase')
$squadTeam = @{}; foreach ($s in $squads) { $squadTeam["$($s.season)|$($s.player)"] = $s.team }
$breaks = [Collections.Generic.List[object]]::new(); $recent = @{}
$numList = '(\d{2,3})((?:\s*(?:,|and|&)\s*\d{2,3})*)'
$pats = @("breaks? of $numList", "(\d{2,3}) (?:clearance|break)\b", "(?:top|highest|best) break[^0-9.]{0,40}?(\d{2,3})")
foreach ($a in L 'news') {
  $txt = $a.body_text; if (-not $txt -or $txt -notmatch '(?i)break') { continue }
  $inArticle = @{}; foreach ($m in $fullRe.Matches($txt)) { $inArticle[$pkey[(Key $m.Value)]] = 1 }
  if (-not $inArticle.Count) { continue }
  $seen = @{}; $last = ''
  foreach ($sent in [regex]::Split($txt, '(?<=[.!?])\s+|\n')) {
    # who is mentioned, in order (full names, or surnames/first names of people named in this article)
    $mentions = @()
    foreach ($m in $fullRe.Matches($sent)) { $mentions += [pscustomobject]@{ i = $m.Index; p = $pkey[(Key $m.Value)] } }
    foreach ($m in [regex]::Matches($sent, '\b[A-Z][a-z]+\b')) {
      $w = $m.Value.ToLower(); $cand = @($inArticle.Keys | Where-Object { $_.Split(' ')[-1].ToLower() -eq $w -or $_.Split(' ')[0].ToLower() -eq $w })
      if ($cand.Count -eq 1) { $mentions += [pscustomobject]@{ i = $m.Index; p = $cand[0] } }
    }
    foreach ($re in $pats) {
      foreach ($m in [regex]::Matches($sent, $re, 'IgnoreCase')) {
        if ($sent.Substring(0, $m.Index) -match '(?i)(start|lead|leading|by|ahead|points?|behind)\s*$') { continue }
        $before = @($mentions | Where-Object { $_.i -lt $m.Index } | Sort-Object i)
        $who = ($before | Select-Object -Last 1).p
        # "...against X and he hit breaks of": the pronoun points back to the sentence's subject
        if ($before.Count -gt 1 -and $sent.Substring($before[-1].i, $m.Index - $before[-1].i) -match '(?i)\b(he|his)\b') { $who = $before[0].p }
        # "a break of 33 for Sean": the name comes straight after
        $after = $sent.Substring($m.Index + $m.Length)
        if ($after -match '^\s*(?:for|by|from)\s') { $nx = $mentions | Where-Object { $_.i -ge $m.Index + $m.Length -and $_.i -le $m.Index + $m.Length + 12 } | Sort-Object i | Select-Object -First 1; if ($nx) { $who = $nx.p } }
        if (-not $who) { $who = $last }
        if (-not $who) { continue }
        $vals = @([int]$m.Groups[1].Value) + @([regex]::Matches($m.Groups[2].Value, '\d{2,3}') | ForEach-Object { [int]$_.Value })
        foreach ($v in $vals) {
          if ($v -lt 20 -or $v -gt 147) { continue }
          $k = "$who|$v"; if ($seen[$k]) { continue }; $seen[$k] = 1
          # the same break told again in another article within 10 days
          $dd = [datetime]$a.date; $again = $false
          if (-not $recent.ContainsKey("$who|$v")) { $recent["$who|$v"] = [Collections.Generic.List[datetime]]::new() }
          foreach ($o in $recent["$who|$v"]) { if ([math]::Abs(($dd - $o).TotalDays) -le 10) { $again = $true } }
          if ($again) { continue }; $recent["$who|$v"].Add($dd)
          $sl = SeasonOfDate $a.date
          $breaks.Add([pscustomobject]@{ match_id = ''; season = $sl; date = $a.date; player = $who; team = $squadTeam["$sl|$who"]; break = $v; source = $a.title })
        }
      }
    }
    $lm = $mentions | Sort-Object i | Select-Object -Last 1; if ($lm) { $last = $lm.p }
  }
}

# ---------- coverage: results we have v matches played (from the tables) ----------
$coverage = foreach ($g in ($tables | Where-Object kind -eq 'teams' | Group-Object season, competition)) {
  $played = ($g.Group | Measure-Object P -Sum).Sum / 2
  $first = $g.Group[0]
  $have = @($tm | Where-Object { $_.season -eq $first.season -and $_.competition -eq $first.competition }).Count
  $fr = @($frames | Where-Object { $matchById[$_.match_id].season -eq $first.season }).Count
  [pscustomobject]@{ season = $first.season; competition = $first.competition; matches_played = $played; matches_with_results = $have; frames_with_players = $fr }
}

# ---------- write ----------
Save 'seasons' 'season', 'name', 'current' ($seasonRows | Sort-Object season)
Save 'matches' 'match_id', 'season', 'date', 'competition', 'home_team', 'away_team', 'home_frames', 'away_frames', 'note', 'date_from_report' ($tm | Sort-Object date, match_id)
Save 'frames' 'match_id', 'frame', 'home_player', 'away_player', 'winner', 'home_points', 'away_points' $frames
Save 'cups' 'match_id', 'season', 'date', 'competition', 'kind', 'type', 'round', 'home', 'away', 'home_score', 'away_score', 'note' ($cups | Sort-Object date, match_id)
Save 'tables' 'season', 'competition', 'kind', 'pos', 'name', 'P', 'W', 'D', 'L', 'F', 'A', 'diff', 'pts' $tables
Save 'squads' 'season', 'team', 'player', 'handicap' $squads
Save 'handicaps' 'date', 'season', 'player', 'handicap' ($hc | Sort-Object date, player)
Save 'honours' 'season', 'competition', 'kind', 'winner', 'runner_up', 'score', 'date' ($honours | Sort-Object season, competition)
Save 'breaks' 'match_id', 'season', 'date', 'player', 'team', 'break', 'source' ($breaks | Sort-Object date, player)
Save 'coverage' 'season', 'competition', 'matches_played', 'matches_with_results', 'frames_with_players' ($coverage | Sort-Object season)
[IO.File]::WriteAllText((Join-Path $Out 'info.json'), (@{ updated = (Get-Date -Format 'd MMM yyyy'); source = 'League data export ' + (Split-Path (Split-Path $Export) -Leaf) } | ConvertTo-Json -Compress))
