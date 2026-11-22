# Makes made-up sample data in the same CSV format the real data will use.
# Run: powershell -File make-sample-data.ps1   (writes ..\data\*.csv)
$ErrorActionPreference = 'Stop'
$rng = [System.Random]::new(42)
$out = Join-Path $PSScriptRoot '..\data'
New-Item -ItemType Directory -Force $out | Out-Null

$teams = 'Blue Ball Club','Pink Pots','Green Baize','Cushion Kings','Long Pots',
         'Safety First','Black Ball','Rest and Spider','Brown Bears','Yellow Jackets'
$venues = 'Sample Hall','Sample Club','Sample Bar','Sample Legion','Sample Inn'
$first = 'Alex','Ben','Callum','Dan','Ed','Finn','Gary','Harry','Ian','Jack','Kev','Liam',
         'Mark','Nick','Owen','Paul','Rob','Sam','Tom','Will'
$last  = 'Ambers','Baize','Cueman','Draw','Endcush','Fluke','Gully','Hazard','Inoff',
         'Jaws','Kiss','Longpot','Masse','Nap','Plant','Rester','Screw','Swerve','Topspin','Wedge'

# 8 players per team, each with a hidden skill
$players = @{}
$skill = @{}
$used = @{}
foreach ($t in $teams) {
  $players[$t] = @()
  while ($players[$t].Count -lt 8) {
    $n = $first[$rng.Next($first.Count)] + ' ' + $last[$rng.Next($last.Count)]
    if ($used[$n]) { continue }
    $used[$n] = 1; $players[$t] += $n; $skill[$n] = 0.25 + $rng.NextDouble() * 0.75
  }
}

$matches = [System.Collections.Generic.List[string]]::new()
$frames  = [System.Collections.Generic.List[string]]::new()
$breaks  = [System.Collections.Generic.List[string]]::new()
$matches.Add('match_id,season,date,competition,home_team,away_team,venue,home_frames,away_frames')
$frames.Add('match_id,frame,home_player,away_player,winner')
$breaks.Add('match_id,season,date,player,team,break')

function Q($s) { if ($s -match '[",]') { '"' + ($s -replace '"','""') + '"' } else { $s } }

$id = 0
foreach ($startYear in 2024, 2025, 2026) {
  $season = "$startYear-$((($startYear + 1) % 100).ToString('00'))"
  $weeks = if ($startYear -eq 2026) { 6 } else { 18 }   # current season part-played
  # round robin (circle method), home and away
  $list = @($teams)
  $rounds = @()
  for ($r = 0; $r -lt 9; $r++) {
    $pairs = @()
    for ($i = 0; $i -lt 5; $i++) { $pairs += ,@($list[$i], $list[9 - $i]) }
    $rounds += ,$pairs
    $list = @($list[0]) + @($list[9]) + $list[1..8]
  }
  $all = @($rounds) + @($rounds | ForEach-Object { ,@($_ | ForEach-Object { ,@($_[1], $_[0]) }) })
  $date = Get-Date "$startYear-10-07"
  for ($w = 0; $w -lt $weeks; $w++) {
    foreach ($p in $all[$w]) {
      $id++; $h = $p[0]; $a = $p[1]
      $hp = $players[$h] | Sort-Object { $rng.Next() } | Select-Object -First 5
      $ap = $players[$a] | Sort-Object { $rng.Next() } | Select-Object -First 5
      $hw = 0; $aw = 0
      for ($f = 0; $f -lt 5; $f++) {
        $x = $hp[$f]; $y = $ap[$f]
        $chance = $skill[$x] / ($skill[$x] + $skill[$y]) + 0.04   # small home edge
        $win = if ($rng.NextDouble() -lt $chance) { 'home' } else { 'away' }
        if ($win -eq 'home') { $hw++ } else { $aw++ }
        $frames.Add("$id,$($f + 1),$(Q $x),$(Q $y),$win")
        foreach ($pl in @(@($x, $h), @($y, $a))) {
          if ($rng.NextDouble() -lt ($skill[$pl[0]] * 0.35)) {
            $b = 20 + [int]([math]::Pow($rng.NextDouble(), 2.2) * 90 * $skill[$pl[0]])
            $breaks.Add("$id,$season,$($date.ToString('yyyy-MM-dd')),$(Q $pl[0]),$(Q $pl[1]),$b")
          }
        }
      }
      $v = $venues[[array]::IndexOf($teams, $h) % $venues.Count]
      $matches.Add("$id,$season,$($date.ToString('yyyy-MM-dd')),League,$(Q $h),$(Q $a),$(Q $v),$hw,$aw")
    }
    $date = $date.AddDays(7)
  }
}

$enc = [System.Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllLines((Join-Path $out 'matches.csv'), $matches, $enc)
[IO.File]::WriteAllLines((Join-Path $out 'frames.csv'), $frames, $enc)
[IO.File]::WriteAllLines((Join-Path $out 'breaks.csv'), $breaks, $enc)
"matches: $($matches.Count - 1)  frames: $($frames.Count - 1)  breaks: $($breaks.Count - 1)"
