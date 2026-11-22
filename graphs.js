// Graphs for players, teams, seasons and breaks. Uses data and helpers from app.js.
'use strict';

const gcard = (title, note, html) => `<div class="card chart"><h2>${title}</h2>${note ? `<p class="note">${note}</p>` : ''}${html}</div>`;
const pctFmt = (v) => Math.round(v) + '%';
const shortDate = (d) => new Date(d + 'T12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const curSeason = () => S.season || S.seasons[0];
const seasonsAsc = () => [...S.seasons].reverse();
const PCT_TICKS = [0, 25, 50, 75, 100];
const SCORES = ['5–0', '4–1', '3–2', '2–3', '1–4', '0–5'];

// Standings after each league night of a season
function weekly(season) {
  const ms = S.matches.filter((m) => m.season === season && m.comp === 'League');
  const dates = [...new Set(ms.map((m) => m.date))].sort();
  const t = {};
  for (const m of ms) { t[m.home] ||= { pts: 0, gd: 0 }; t[m.away] ||= { pts: 0, gd: 0 }; }
  const rows = dates.map((d) => {
    for (const m of ms.filter((x) => x.date === d)) { t[m.home].pts += m.hf; t[m.home].gd += m.hf - m.af; t[m.away].pts += m.af; t[m.away].gd += m.af - m.hf; }
    const st = Object.entries(t).map(([team, v]) => ({ team, ...v })).sort((a, b) => b.pts - a.pts || b.gd - a.gd || a.team.localeCompare(b.team));
    return { date: d, st: Object.fromEntries(st.map((r, i) => [r.team, { ...r, pos: i + 1 }])) };
  });
  return { dates, rows, teams: Object.keys(t) };
}
const seasonTicks = (items, getSeason, getX) => seasonsAsc().map((s) => { const it = items.find((x) => getSeason(x) === s); return it ? { x: getX(it), label: s } : null; }).filter(Boolean);

// ---------- Player ----------
function playerCharts(name) {
  const all = S.pf.filter((x) => x.player === name), list = all.filter(inSeason);
  const bys = seasonsAsc().map((s) => ({ s, ...rec(all.filter((x) => x.season === s)) })).filter((r) => r.p);
  let w = 0; const cum = [], roll = [];
  all.forEach((x, i) => {
    if (x.won) w++;
    cum.push({ x: i + 1, y: (100 * w) / (i + 1), tip: `Frame ${i + 1}, ${fmtDate(x.date)} v ${x.opp}: ${x.won ? 'won' : 'lost'}. Overall ${pct(w, i + 1)}%` });
    if (i >= 9) { const k = all.slice(i - 9, i + 1).filter((z) => z.won).length; roll.push({ x: i + 1, y: k * 10, tip: `Last 10 frames to ${fmtDate(x.date)}: ${k} won` }); }
  });
  const ticks = seasonTicks(all.map((x, i) => ({ ...x, i })), (x) => x.season, (x) => x.i + 1);
  const brAll = S.breaks.filter((b) => b.player === name);
  const byTeam = {}; for (const x of list) (byTeam[x.oppTeam] ||= []).push(x);
  const vsTeam = Object.entries(byTeam).map(([t, l]) => ({ t, ...rec(l) })).sort((a, b) => b.pc - a.pc || b.p - a.p);
  const byFrame = [1, 2, 3, 4, 5].map((n) => ({ n, ...rec(list.filter((x) => x.n === n)) }));
  const ha = [['Home', list.filter((x) => x.home)], ['Away', list.filter((x) => !x.home)]].map(([k, l]) => ({ k, ...rec(l) }));
  const opp = {}; for (const x of all) (opp[x.opp] ||= []).push(x);
  const most = Object.entries(opp).map(([o, l]) => ({ o, ...rec(l) })).sort((a, b) => b.p - a.p || b.w - a.w).slice(0, 10);

  return `<div class="charts">
    ${gcard('Win % over time', 'Every frame, all seasons. Blue is the overall win %, orange is the last 10 frames.', Chart.line({ series: [{ name: 'Overall win %', color: 'var(--s1)', points: cum }, { name: 'Last 10 frames', color: 'var(--s2)', points: roll }], yMax: 100, yTicks: PCT_TICKS, fmt: pctFmt, xTicks: ticks }))}
    ${gcard('Win % by season', '', Chart.bars({ data: bys.map((r) => ({ label: r.s, value: 100 * r.pc, tip: `${r.s}: ${pct(r.w, r.p)}% (${r.w} won, ${r.l} lost)` })), yMax: 100, fmt: pctFmt }))}
    ${gcard('Frames won and lost by season', '', Chart.grouped({ labels: bys.map((r) => r.s), series: [{ name: 'Won', color: 'var(--s1)', values: bys.map((r) => r.w) }, { name: 'Lost', color: 'var(--s2)', values: bys.map((r) => r.l) }] }))}
    ${gcard('Breaks', 'Every break recorded, all seasons.', Chart.line({ dotsOnly: true, series: [{ name: '', color: 'var(--s1)', points: brAll.map((b) => ({ x: Date.parse(b.date), y: b.val, tip: `${b.val} on ${fmtDate(b.date)}` })) }], xTicks: seasonTicks(brAll, (b) => b.season, (b) => Date.parse(b.date)), empty: 'No breaks recorded.' }))}
    ${gcard('Win % against each team', esc(seasonLabel()), Chart.hbars({ data: vsTeam.map((r) => ({ label: tm(r.t), value: 100 * r.pc, text: `${pct(r.w, r.p)}%`, tip: `${r.w} won, ${r.l} lost` })), max: 100 }))}
    ${gcard('Most-played opponents', 'All seasons. Bar is frames played.', Chart.hbars({ data: most.map((r) => ({ label: pl(r.o), value: r.p, text: `${r.w}–${r.l}`, tip: `${r.p} frames: ${r.w} won, ${r.l} lost` })) }))}
    ${gcard('Win % by frame number', `Which frame of the match they play. ${esc(seasonLabel())}`, Chart.bars({ data: byFrame.map((r) => ({ label: 'Frame ' + r.n, value: 100 * r.pc, tip: `Frame ${r.n}: ${r.p ? pct(r.w, r.p) + '%' : 'not played'} (${r.w}–${r.l})` })), yMax: 100, fmt: pctFmt }))}
    ${gcard('Home and away', esc(seasonLabel()), Chart.bars({ data: ha.map((r) => ({ label: r.k, value: 100 * r.pc, tip: `${r.k}: ${pct(r.w, r.p)}% (${r.w}–${r.l})` })), yMax: 100, fmt: pctFmt }))}
  </div>`;
}

// ---------- Team ----------
function teamCharts(name) {
  const season = curSeason(), wk = weekly(season), n = wk.teams.length;
  const pos = wk.rows.filter((r) => r.st[name]).map((r, i) => ({ x: i + 1, y: r.st[name].pos, tip: `${fmtDate(r.date)}: ${ordinal(r.st[name].pos)}, ${r.st[name].pts} pts` }));
  const last = wk.rows.at(-1);
  let rival = '';
  if (last && last.st[name]) { const order = Object.values(last.st).sort((a, b) => a.pos - b.pos); rival = order[0].team === name ? (order[1] || {}).team : order[0].team; }
  const ptsLine = (t) => wk.rows.map((r, i) => ({ x: i + 1, y: r.st[t] ? r.st[t].pts : 0, tip: `${t} after ${fmtDate(r.date)}: ${r.st[t] ? r.st[t].pts : 0} pts` }));
  const ms = S.matches.filter((m) => m.season === season && (m.home === name || m.away === name));
  const res = ms.map((m) => { const h = m.home === name; return { m, f: h ? m.hf : m.af, a: h ? m.af : m.hf, opp: h ? m.away : m.home, ha: h ? 'home' : 'away' }; });
  const lines = SCORES.map((s) => ({ s, c: res.filter((r) => `${r.f}–${r.a}` === s).length }));
  const bys = seasonsAsc().map((s) => { let w = 0, l = 0; for (const m of S.matches.filter((x) => x.season === s)) { if (m.home === name) { w += m.hf; l += m.af; } else if (m.away === name) { w += m.af; l += m.hf; } } return { s, w, l }; }).filter((r) => r.w + r.l);
  const pr = playerRows(S.pf.filter((x) => x.team === name && inSeason(x))).sort((a, b) => b.pc - a.pc || b.p - a.p);
  const ha = ['home', 'away'].map((k) => { const l = res.filter((r) => r.ha === k); const w = l.filter((r) => r.f > r.a).length; return { k, w, p: l.length }; });
  const br = S.breaks.filter((b) => b.team === name && inSeason(b)), bp = {};
  for (const b of br) (bp[b.player] ||= []).push(b.val);

  return `<div class="charts">
    ${gcard('League position each week', esc(season), Chart.line({ series: [{ name: '', color: 'var(--s1)', points: pos }], yMin: 1, yMax: n, invert: true, yTicks: [...new Set([1, Math.ceil(n / 2), n])], fmt: (v) => ordinal(v), xTicks: pos.length > 1 ? [{ x: 1, label: 'Week 1' }, { x: pos.length, label: 'Week ' + pos.length }] : [] }))}
    ${rival ? gcard('Points race', `${esc(name)} against ${esc(rival)}, ${esc(season)}.`, Chart.line({ series: [{ name, color: 'var(--s1)', points: ptsLine(name) }, { name: rival, color: 'var(--s2)', points: ptsLine(rival) }], xTicks: [{ x: 1, label: 'Week 1' }, { x: wk.rows.length, label: 'Week ' + wk.rows.length }] })) : ''}
    ${gcard('Frames won each match', esc(season), Chart.bars({ data: res.map((r) => ({ label: shortDate(r.m.date), value: r.f, tip: `${fmtDate(r.m.date)} ${r.ha} v ${r.opp}: ${r.f}–${r.a}` })), yMax: 5, yTicks: [0, 1, 2, 3, 4, 5] }))}
    ${gcard('Score-lines', `How often each result happened, ${esc(season)}.`, Chart.bars({ data: lines.map((r) => ({ label: r.s, value: r.c, tip: `${r.s}: ${r.c} match${r.c === 1 ? '' : 'es'}`, color: r.s[0] > r.s[2] ? 'var(--s1)' : 'var(--s2)' })) }))}
    ${gcard('Frames won and lost by season', '', Chart.grouped({ labels: bys.map((r) => r.s), series: [{ name: 'Won', color: 'var(--s1)', values: bys.map((r) => r.w) }, { name: 'Lost', color: 'var(--s2)', values: bys.map((r) => r.l) }] }))}
    ${gcard("Players' win %", esc(seasonLabel()), Chart.hbars({ data: pr.map((r) => ({ label: pl(r.name), value: 100 * r.pc, text: `${(100 * r.pc).toFixed(0)}%`, tip: `${r.w} won, ${r.l} lost` })), max: 100 }))}
    ${gcard('Matches won, home and away', esc(season), Chart.bars({ data: ha.map((r) => ({ label: r.k === 'home' ? 'Home' : 'Away', value: r.p ? (100 * r.w) / r.p : 0, tip: `${r.w} of ${r.p} won` })), yMax: 100, fmt: pctFmt }))}
    ${gcard('Breaks by player', esc(seasonLabel()) + '. Bar is the number of breaks; number is the best.', Chart.hbars({ data: Object.entries(bp).map(([p, v]) => ({ label: pl(p), value: v.length, text: Math.max(...v), tip: `${v.length} breaks, best ${Math.max(...v)}` })).sort((a, b) => b.value - a.value), empty: 'No breaks recorded.' }))}
  </div>`;
}

// ---------- Seasons ----------
pages.seasons = function () {
  const season = curSeason(), wk = weekly(season), last = wk.rows.at(-1);
  const order = last ? Object.values(last.st).sort((a, b) => a.pos - b.pos) : [];
  const top = order.slice(0, 4).map((r) => r.team);
  const ptsLine = (t) => wk.rows.map((r, i) => ({ x: i + 1, y: r.st[t] ? r.st[t].pts : 0, tip: `${t} after ${fmtDate(r.date)}: ${r.st[t] ? r.st[t].pts : 0} pts` }));
  const race = [
    ...wk.teams.filter((t) => !top.includes(t)).map((t) => ({ name: '', color: 'var(--muted)', width: 1, muted: true, points: ptsLine(t).map((p) => ({ ...p, tip: '' })) })),
    ...top.map((t, i) => ({ name: t, color: Chart.SERIES[i], points: ptsLine(t) })),
  ];
  const legendOnly = wk.teams.length > 4 ? [{ name: 'Other teams', color: 'var(--muted)', points: [] }] : [];
  const sa = seasonsAsc();
  const per = sa.map((s) => {
    const ms = S.matches.filter((m) => m.season === s), fr = S.pf.filter((x) => x.season === s && x.home), br = S.breaks.filter((b) => b.season === s);
    const champ = Object.values((weekly(s).rows.at(-1) || { st: {} }).st).sort((a, b) => a.pos - b.pos)[0];
    return { s, ms: ms.length, frames: fr.length, homeW: fr.filter((x) => x.won).length, close: ms.filter((m) => Math.abs(m.hf - m.af) === 1).length,
      players: new Set(S.pf.filter((x) => x.season === s).map((x) => x.player)).size, br: br.length, hb: br.length ? Math.max(...br.map((b) => b.val)) : 0,
      avg: br.length ? br.reduce((a, b) => a + b.val, 0) / br.length : 0, champ };
  });
  const sm = S.matches.filter((m) => m.season === season);
  const lines = SCORES.map((s) => ({ s, c: sm.filter((m) => `${m.hf}–${m.af}` === s).length }));
  const nowNote = season === S.seasons[0] ? ' The latest season is still being played.' : '';

  return `<h2>Seasons</h2><div class="charts">
    ${gcard('Title race', `Points after each league night, ${esc(season)}. Top four in colour.${nowNote}`, Chart.line({ series: [...race, ...legendOnly], xTicks: wk.rows.length > 1 ? [{ x: 1, label: 'Week 1' }, { x: wk.rows.length, label: 'Week ' + wk.rows.length }] : [] }))}
    ${gcard('Points', esc(season), Chart.hbars({ data: order.map((r) => ({ label: tm(r.team), value: r.pts, text: r.pts, tip: `${ordinal(r.pos)}, ${r.pts} pts` })) }))}
    ${gcard('Top team’s points by season', 'The latest season is not finished.', Chart.bars({ data: per.filter((r) => r.champ).map((r) => ({ label: r.s, value: r.champ.pts, tip: `${r.s}: ${r.champ.team}, ${r.champ.pts} pts` })) }))}
    ${gcard('Home advantage', 'Share of frames won by the home player.', Chart.bars({ data: per.map((r) => ({ label: r.s, value: r.frames ? (100 * r.homeW) / r.frames : 0, tip: `${r.s}: home won ${r.homeW} of ${r.frames} frames` })), yMax: 100, fmt: pctFmt }))}
    ${gcard('Close matches', 'Share of matches decided 3–2.', Chart.bars({ data: per.map((r) => ({ label: r.s, value: r.ms ? (100 * r.close) / r.ms : 0, tip: `${r.s}: ${r.close} of ${r.ms} matches were 3–2` })), yMax: 100, fmt: pctFmt }))}
    ${gcard('Score-lines', `All matches, home score first, ${esc(season)}.`, Chart.bars({ data: lines.map((r) => ({ label: r.s, value: r.c, tip: `${r.s}: ${r.c} matches` })) }))}
    ${gcard('Frames played', 'By season.', Chart.bars({ data: per.map((r) => ({ label: r.s, value: r.frames, tip: `${r.s}: ${r.frames} frames in ${r.ms} matches` })) }))}
    ${gcard('Players taking part', 'By season.', Chart.bars({ data: per.map((r) => ({ label: r.s, value: r.players })) }))}
    ${gcard('Breaks by season', 'Average and highest break.', Chart.grouped({ labels: per.map((r) => r.s), series: [{ name: 'Average', color: 'var(--s1)', values: per.map((r) => Math.round(r.avg)) }, { name: 'Highest', color: 'var(--s2)', values: per.map((r) => r.hb) }] }))}
    ${gcard('Breaks recorded', 'By season.', Chart.bars({ data: per.map((r) => ({ label: r.s, value: r.br })) }))}
  </div>`;
};

// ---------- Breaks ----------
pages.breaks = function () {
  const br = S.breaks.filter(inSeason);
  if (!br.length) return `<div class="card">No breaks recorded for ${esc(seasonLabel())}.</div>`;
  const hi = Math.max(...br.map((b) => b.val)), lo = Math.floor(Math.min(...br.map((b) => b.val)) / 10) * 10;
  const bins = []; for (let b = lo; b <= hi; b += 10) bins.push({ label: `${b}s`, value: br.filter((x) => x.val >= b && x.val < b + 10).length, tip: '' });
  bins.forEach((b) => { b.tip = `${b.label}: ${b.value} breaks`; });
  const by = (key) => { const g = {}; for (const b of br) (g[b[key]] ||= []).push(b.val); return Object.entries(g).map(([k, v]) => ({ k, n: v.length, best: Math.max(...v), avg: v.reduce((a, c) => a + c, 0) / v.length })); };
  const players = by('player'), teams = by('team');
  const top = [...br].sort((a, b) => b.val - a.val).slice(0, 15);
  const day = {}; for (const b of br) day[b.date] = Math.max(day[b.date] || 0, b.val);
  const best = Object.entries(day).sort().map(([d, v]) => ({ x: Date.parse(d), y: v, tip: `${fmtDate(d)}: best ${v}` }));
  const avg = br.reduce((a, b) => a + b.val, 0) / br.length;
  const fifty = seasonsAsc().map((s) => ({ label: s, value: S.breaks.filter((b) => b.season === s && b.val >= 50).length, tip: '' }));
  fifty.forEach((r) => { r.tip = `${r.label}: ${r.value} breaks of 50 or more`; });

  return `<h2>Breaks · ${esc(seasonLabel())}</h2>
    <div class="tiles"><div class="tile"><div class="n">${br.length}</div><div class="l">Breaks recorded</div></div><div class="tile"><div class="n gold">${hi}</div><div class="l">Highest</div></div><div class="tile"><div class="n">${avg.toFixed(1)}</div><div class="l">Average</div></div><div class="tile"><div class="n">${br.filter((b) => b.val >= 50).length}</div><div class="l">50 or more</div></div></div>
    <div class="charts">
    ${gcard('Break sizes', 'How many breaks fell in each band.', Chart.bars({ data: bins }))}
    ${gcard('Best break each league night', '', Chart.line({ series: [{ name: '', color: 'var(--s1)', points: best }], xTicks: S.season ? (best.length > 1 ? [best[0], best.at(-1)].map((p) => ({ x: p.x, label: shortDate(new Date(p.x).toISOString().slice(0, 10)) })) : []) : seasonTicks(Object.keys(day).sort().map((d) => ({ d, s: (S.matches.find((m) => m.date === d) || {}).season })), (x) => x.s, (x) => Date.parse(x.d)) }))}
    ${gcard('Top 15 breaks', '', Chart.hbars({ data: top.map((b) => ({ label: pl(b.player), value: b.val, tip: `${b.team}, ${fmtDate(b.date)}` })) }))}
    ${gcard('Highest break by player', 'Top 15.', Chart.hbars({ data: players.sort((a, b) => b.best - a.best).slice(0, 15).map((r) => ({ label: pl(r.k), value: r.best, tip: `${r.n} breaks, average ${r.avg.toFixed(0)}` })) }))}
    ${gcard('Most breaks recorded', 'Top 15.', Chart.hbars({ data: players.sort((a, b) => b.n - a.n || b.best - a.best).slice(0, 15).map((r) => ({ label: pl(r.k), value: r.n, tip: `best ${r.best}, average ${r.avg.toFixed(0)}` })) }))}
    ${gcard('Breaks by team', 'Bar is the number of breaks; number is the best.', Chart.hbars({ data: teams.sort((a, b) => b.n - a.n).map((r) => ({ label: tm(r.k), value: r.n, text: r.best, tip: `${r.n} breaks, best ${r.best}, average ${r.avg.toFixed(0)}` })) }))}
    ${gcard('Breaks of 50 or more', 'By season.', Chart.bars({ data: fifty }))}
    ${gcard('Every break', 'Hover a dot for who made it.', Chart.line({ dotsOnly: true, series: [{ name: '', color: 'var(--s1)', points: br.map((b) => ({ x: Date.parse(b.date), y: b.val, tip: `${b.player}: ${b.val}, ${fmtDate(b.date)}` })) }] }))}
    </div>`;
};

// ---------- Leaderboards extra ----------
function leaderCharts() {
  const rows = playerRows(S.pf.filter(inSeason), 3);
  const teams = {}; for (const x of S.pf.filter(inSeason)) { const t = (teams[x.team] ||= { w: 0, p: 0 }); t.p++; if (x.won) t.w++; }
  return `<div class="charts">
    ${gcard('Win % against frames played', 'Each dot is a player with 3 or more frames. Top right is best.', Chart.line({ dotsOnly: true, yMax: 100, yTicks: PCT_TICKS, fmt: pctFmt, series: [{ name: '', color: 'var(--s1)', points: rows.map((r) => ({ x: r.p, y: 100 * r.pc, tip: `${r.name} (${r.team}): ${(100 * r.pc).toFixed(0)}% from ${r.p} frames` })) }], xTicks: rows.length ? [{ x: Math.min(...rows.map((r) => r.p)), label: Math.min(...rows.map((r) => r.p)) + ' frames' }, { x: Math.max(...rows.map((r) => r.p)), label: Math.max(...rows.map((r) => r.p)) + ' frames' }] : [] }))}
    ${gcard('Frame win % by team', esc(seasonLabel()), Chart.hbars({ data: Object.entries(teams).map(([t, v]) => ({ label: tm(t), value: (100 * v.w) / v.p, text: `${((100 * v.w) / v.p).toFixed(0)}%`, tip: `${v.w} of ${v.p} frames` })).sort((a, b) => b.value - a.value), max: 100 }))}
  </div>`;
}

// Add graphs under the existing pages
{
  const base = { player: pages.player, team: pages.team, leaders: pages.leaders };
  pages.player = (n) => base.player(n) + (S.pf.some((x) => x.player === n) ? playerCharts(n) : '');
  pages.team = (n) => base.team(n) + (S.teams.includes(n) ? teamCharts(n) : '');
  pages.leaders = () => base.leaders() + leaderCharts();
}
Chart.tooltips();
