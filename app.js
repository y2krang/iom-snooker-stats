// IOM Snooker Stats: reads the CSV files in data/ and works everything out in the browser.
'use strict';

const S = { matches: [], pf: [], breaks: [], seasons: [], players: [], teams: [], season: '' };
const $ = (q) => document.querySelector(q);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (w, n) => (n ? (100 * w / n).toFixed(1) : '–');
const pl = (n) => `<a href="#player/${encodeURIComponent(n)}">${esc(n)}</a>`;
const tm = (n) => `<a href="#team/${encodeURIComponent(n)}">${esc(n)}</a>`;
const fmtDate = (d) => new Date(d + 'T12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// ---------- CSV ----------
function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift().map((h) => h.trim().replace(/^﻿/, ''));
  return rows.filter((r) => r.some((x) => x.trim())).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
}
async function load(name, optional) {
  const r = await fetch('data/' + name, { cache: 'no-cache' });
  if (!r.ok) { if (optional) return null; throw new Error(name + ' not found'); }
  return name.endsWith('.json') ? r.json() : parseCSV(await r.text());
}

// ---------- Data ----------
async function init() {
  const names = ['matches.csv', 'frames.csv', 'breaks.csv', 'info.json', 'seasons.csv', 'cups.csv', 'tables.csv', 'squads.csv', 'handicaps.csv', 'honours.csv', 'coverage.csv'];
  const [m, f, b, info, se, cu, tb, sq, hc, ho, cv] = await Promise.all(names.map((n, i) => load(n, i > 1)));
  const byId = {};
  const num = (v) => (v === '' || v == null ? null : +v);
  S.matches = m.map((x) => ({ id: x.match_id, season: x.season, date: x.date, comp: x.competition || 'League', home: x.home_team, away: x.away_team, hf: +x.home_frames, af: +x.away_frames, note: x.note || '', approx: x.date_from_report === '1' }))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));
  S.matches.forEach((x, i) => { x.order = i; byId[x.id] = x; });
  for (const r of f) {
    const mt = byId[r.match_id]; if (!mt) continue;
    const n = +r.frame, hw = r.winner === 'home', hp = num(r.home_points), ap = num(r.away_points);
    const base = { m: mt, n, season: mt.season, date: mt.date, sort: mt.order * 100 + n };
    S.pf.push({ ...base, player: r.home_player, team: mt.home, opp: r.away_player, oppTeam: mt.away, won: hw, home: true, pts: hp, oppPts: ap });
    S.pf.push({ ...base, player: r.away_player, team: mt.away, opp: r.home_player, oppTeam: mt.home, won: !hw, home: false, pts: ap, oppPts: hp });
  }
  S.pf = S.pf.filter((x) => x.player && x.opp && !/walk ?over/i.test(x.player + x.opp)).sort((a, b) => a.sort - b.sort);
  S.breaks = (b || []).map((x) => ({ m: byId[x.match_id], season: x.season, date: x.date, player: x.player, team: x.team, val: +x.break, source: x.source || '' })).filter((x) => x.val > 0);
  S.cups = (cu || []).map((x) => ({ id: x.match_id, season: x.season, date: x.date, comp: x.competition, kind: x.kind, type: x.type, round: x.round, home: x.home, away: x.away, hs: +x.home_score, as: +x.away_score, note: x.note }))
    .sort((a, b) => a.date.localeCompare(b.date));
  // player-side view of singles matches (individual leagues and cups)
  S.pm = S.cups.filter((x) => x.kind === 'singles').flatMap((x) => [
    { ...x, player: x.home, opp: x.away, f: x.hs, a: x.as, won: x.hs > x.as },
    { ...x, player: x.away, opp: x.home, f: x.as, a: x.hs, won: x.as > x.hs }]);
  S.tables = (tb || []).map((x) => ({ season: x.season, comp: x.competition, kind: x.kind, pos: +x.pos, name: x.name, p: num(x.P), w: num(x.W), d: num(x.D), l: num(x.L), f: num(x.F), a: num(x.A), gd: num(x.diff), pts: num(x.pts) }));
  S.squads = (sq || []).map((x) => ({ season: x.season, team: x.team, player: x.player, hcap: num(x.handicap) }));
  S.hcaps = (hc || []).map((x) => ({ date: x.date, season: x.season, player: x.player, hcap: +x.handicap }));
  S.honours = ho || [];
  S.coverage = cv || [];
  S.seasons = [...new Set([...(se || []).map((x) => x.season), ...S.matches.map((x) => x.season)])].filter(Boolean).sort().reverse();
  S.players = [...new Set([...S.pf.map((x) => x.player), ...S.squads.map((x) => x.player), ...S.pm.map((x) => x.player)])].filter(Boolean).sort();
  S.teams = [...new Set([...S.matches.flatMap((x) => [x.home, x.away]), ...S.tables.filter((t) => t.kind === 'teams').map((t) => t.name)])].sort();

  $('#season').innerHTML = `<option value="">All seasons</option>` + S.seasons.map((s) => `<option>${esc(s)}</option>`).join('');
  S.season = S.seasons[0] || '';
  $('#season').value = S.season;
  $('#names').innerHTML = [...S.players, ...S.teams].map((n) => `<option value="${esc(n)}">`).join('');
  if (info && info.sample) { $('#banner').hidden = false; $('#banner').textContent = 'Demo: made-up sample players and teams, not real results.'; }
  $('#updated').innerHTML = 'Last updated ' + esc(info && info.updated ? info.updated : fmtDate(S.matches.at(-1).date)) + ' · <a href="#about">About the data</a>';
  route();
}

const inSeason = (x) => !S.season || x.season === S.season;
const seasonLabel = () => S.season || 'all seasons';

// Frame record summary for a list of player-frames
function rec(list) {
  const w = list.filter((x) => x.won).length;
  return { p: list.length, w, l: list.length - w, pc: list.length ? w / list.length : 0 };
}
function runs(list) { // longest winning run and current run (list sorted oldest first)
  let best = 0, cur = 0;
  for (const x of list) { cur = x.won ? cur + 1 : 0; if (cur > best) best = cur; }
  let now = 0, kind = '';
  for (let i = list.length - 1; i >= 0; i--) { const k = list[i].won ? 'W' : 'L'; if (!kind) kind = k; if (k !== kind) break; now++; }
  return { best, now: now ? now + ' ' + (kind === 'W' ? 'won' : 'lost') : '–' };
}
const formStrip = (list, n = 10) => `<div class="form" title="Last ${n} frames, newest on the right">${list.slice(-n).map((x) => `<span class="${x.won ? 'W' : 'L'}" title="${esc(fmtDate(x.date) + ' v ' + x.opp)}">${x.won ? 'W' : 'L'}</span>`).join('') || '<span class="dim">No frames</span>'}</div>`;

// Sortable table: cols = [{k, label, r (right align), f (format)}]
function table(id, cols, rows, sortKey, desc = true) {
  const st = (S.sort[id] ||= { k: sortKey, d: desc });
  const sorted = [...rows].sort((a, b) => { const x = a[st.k], y = b[st.k]; const c = typeof x === 'number' ? x - y : String(x).localeCompare(String(y)); return st.d ? -c : c; });
  return `<div class="scroll"><table data-id="${id}"><thead><tr>${cols.map((c) => `<th data-k="${c.k}" class="${c.r ? 'r' : ''}">${c.label}${st.k === c.k ? (st.d ? ' ▾' : ' ▴') : ''}</th>`).join('')}</tr></thead><tbody>${
    sorted.map((r) => `<tr>${cols.map((c) => `<td class="${c.r ? 'r' : ''} ${c.cls ? c.cls(r) : ''}">${c.f ? c.f(r[c.k], r) : esc(r[c.k])}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}" class="dim">Nothing yet</td></tr>`}</tbody></table></div>`;
}
S.sort = {};
document.addEventListener('click', (e) => {
  const th = e.target.closest('th[data-k]'); if (!th) return;
  const id = th.closest('table').dataset.id, k = th.dataset.k, st = S.sort[id];
  S.sort[id] = st && st.k === k ? { k, d: !st.d } : { k, d: true };
  route();
});

function playerRows(list, minFrames = 0) {
  const g = {};
  for (const x of list) (g[x.player] ||= []).push(x);
  return Object.entries(g).map(([name, l]) => { const r = rec(l); const tms = [...new Set(l.map((x) => x.team))]; return { name, team: tms.at(-1), p: r.p, w: r.w, l: r.l, pc: r.pc, run: runs(l).best }; }).filter((r) => r.p >= minFrames);
}
const PCOLS = [
  { k: 'name', label: 'Player', f: (v) => pl(v) },
  { k: 'team', label: 'Team', f: (v) => tm(v) },
  { k: 'p', label: 'Frames', r: 1 }, { k: 'w', label: 'Won', r: 1 }, { k: 'l', label: 'Lost', r: 1 },
  { k: 'pc', label: 'Win %', r: 1, f: (v) => (100 * v).toFixed(1) },
];

// League table for a season: the league's own table when we have it, else worked out from results
function leagueTable(season) {
  const own = S.tables.filter((t) => t.season === season && t.kind === 'teams');
  if (own.length) {
    const comp = own[0].comp;
    return own.filter((t) => t.comp === comp).sort((a, b) => a.pos - b.pos).map((t) => ({ ...t, team: t.name, official: true }));
  }
  return computedTable(season);
}
function computedTable(season) {
  const t = {};
  for (const m of S.matches.filter((x) => x.season === season)) {
    for (const [me, f, a, home] of [[m.home, m.hf, m.af, 1], [m.away, m.af, m.hf, 0]]) {
      const r = (t[me] ||= { team: me, p: 0, w: 0, l: 0, f: 0, a: 0, hw: 0, hl: 0, aw: 0, al: 0 });
      r.p++; r.f += f; r.a += a;
      if (f > a) { r.w++; home ? r.hw++ : r.aw++; } else { r.l++; home ? r.hl++ : r.al++; }
    }
  }
  return Object.values(t).map((r) => ({ ...r, gd: r.f - r.a, pts: r.f })).sort((a, b) => b.pts - a.pts || b.gd - a.gd || a.team.localeCompare(b.team)).map((r, i) => ({ ...r, pos: i + 1 }));
}

// Coverage: how much of a season's league results we have
function coverageOf(season) {
  const c = S.coverage.filter((x) => x.season === season);
  if (!c.length) return null;
  const played = c.reduce((a, x) => a + +x.matches_played, 0), have = c.reduce((a, x) => a + Math.min(+x.matches_with_results, +x.matches_played), 0);
  return { played, have, full: have >= played, frames: c.reduce((a, x) => a + +x.frames_with_players, 0) };
}
function coverageNote(season) {
  const c = season && coverageOf(season);
  if (!c || c.full) return '';
  return `<p class="note warn">Only ${c.have} of ${c.played} league matches in ${esc(season)} have a published result, so some numbers here are incomplete. <a href="#about">Why?</a></p>`;
}
const squadOf = (player, season) => S.squads.filter((x) => x.player === player && (!season || x.season === season));
const latestSquad = (player, season) => squadOf(player, season).sort((a, b) => a.season.localeCompare(b.season)).at(-1);
const cupRec = (l) => ({ p: l.length, w: l.filter((x) => x.won).length, l: l.filter((x) => !x.won).length });
const titlesOf = (name) => S.honours.filter((h) => h.winner === name);

// ---------- Pages ----------
const pages = {
  players() {
    const fr = S.pf.filter(inSeason), pm = S.pm.filter(inSeason), sq = S.squads.filter(inSeason);
    const names = [...new Set([...fr.map((x) => x.player), ...pm.map((x) => x.player), ...sq.map((x) => x.player)])];
    const g = {}; for (const x of fr) (g[x.player] ||= []).push(x);
    const c = {}; for (const x of pm) (c[x.player] ||= []).push(x);
    const rows = names.map((n) => {
      const r = rec(g[n] || []), q = cupRec(c[n] || []), s = latestSquad(n, S.season);
      return { name: n, team: s ? s.team : (g[n] ? g[n].at(-1).team : ''), hcap: s && s.hcap != null ? s.hcap : '', p: r.p, w: r.w, l: r.l, pc: r.p ? r.pc : -1, cw: q.w, cl: q.l };
    });
    return `<div class="card"><h2>Players · ${esc(seasonLabel())}</h2><p class="dim">Search above or pick a name. Click a heading to sort. Frames are league frames from the match reports; cup matches are individual events.</p>${table('players', [
      { k: 'name', label: 'Player', f: (v) => pl(v) }, { k: 'team', label: 'Team', f: (v) => (v ? tm(v) : '') }, { k: 'hcap', label: 'Handicap', r: 1 },
      { k: 'p', label: 'Frames', r: 1 }, { k: 'w', label: 'Won', r: 1 }, { k: 'l', label: 'Lost', r: 1 }, { k: 'pc', label: 'Win %', r: 1, f: (v) => (v < 0 ? '–' : (100 * v).toFixed(1)) },
      { k: 'cw', label: 'Cup won', r: 1 }, { k: 'cl', label: 'Cup lost', r: 1 }], rows, 'name', false)}</div>`;
  },

  player(name) {
    if (!S.players.includes(name)) return `<div class="card">No player called “${esc(name)}”.</div>`;
    const all = S.pf.filter((x) => x.player === name);
    const list = all.filter(inSeason), r = rec(list), ru = runs(list);
    const br = S.breaks.filter((x) => x.player === name && inSeason(x)).sort((a, b) => b.val - a.val);
    const sqs = squadOf(name).sort((a, b) => b.season.localeCompare(a.season));
    const teams = [...new Set([...squadOf(name, S.season).map((x) => x.team), ...list.map((x) => x.team)])];
    const home = rec(list.filter((x) => x.home)), away = rec(list.filter((x) => !x.home));
    const cm = S.pm.filter((x) => x.player === name), cms = cm.filter(inSeason), cr = cupRec(cms);
    const titles = titlesOf(name), finals = S.honours.filter((h) => h.runner_up === name);
    const withPts = list.filter((x) => x.pts != null);
    const avgPts = withPts.length ? withPts.reduce((a, x) => a + x.pts, 0) / withPts.length : null;
    const hcNow = latestSquad(name, S.season);
    const bySeason = S.seasons.map((s) => {
      const l = all.filter((x) => x.season === s), c = cupRec(cm.filter((x) => x.season === s)), sq = squadOf(name, s);
      if (!l.length && !c.p && !sq.length) return null;
      const q = rec(l); const b = S.breaks.filter((x) => x.player === name && x.season === s);
      return { season: s, team: [...new Set([...sq.map((x) => x.team), ...l.map((x) => x.team)])].join(', '), hcap: sq.length && sq[0].hcap != null ? sq[0].hcap : '', p: q.p, w: q.w, l: q.l, pc: q.p ? q.pc : -1, cup: c.p ? `${c.w}–${c.l}` : '', hb: b.length ? Math.max(...b.map((x) => x.val)) : 0 };
    }).filter(Boolean);
    const g = {}; for (const x of list) (g[x.opp] ||= []).push(x);
    const byOpp = Object.entries(g).map(([o, l]) => { const q = rec(l); return { opp: o, team: l.at(-1).oppTeam, p: q.p, w: q.w, l: q.l, pc: q.pc }; });
    const h2hSel = S.h2h && S.h2h !== name ? S.h2h : '';
    const fmtPc = (v) => (v < 0 ? '–' : (100 * v).toFixed(1));
    return `<div class="grid"><section class="card">
      <h1>${esc(name)}</h1><div class="sub">${teams.map(tm).join(', ') || 'No team listed'} · ${esc(seasonLabel())}${titles.length ? ` · <span class="gold">${titles.length} title${titles.length === 1 ? '' : 's'}</span>` : ''}</div>
      <div class="tiles">
        <div class="tile"><div class="n">${r.p ? `${r.w}–${r.l}` : '–'}</div><div class="l">League frames won–lost</div></div>
        <div class="tile"><div class="n">${r.p ? pct(r.w, r.p) + '%' : '–'}</div><div class="l">League frame win %</div></div>
        <div class="tile"><div class="n">${cr.p ? `${cr.w}–${cr.l}` : '–'}</div><div class="l">Cup and individual matches</div></div>
        <div class="tile"><div class="n">${hcNow && hcNow.hcap != null ? hcNow.hcap : '–'}</div><div class="l">Handicap${hcNow ? ' ' + esc(hcNow.season) : ''}</div></div>
        <div class="tile"><div class="n">${br.length ? br[0].val : '–'}</div><div class="l">Best break reported</div></div>
        <div class="tile"><div class="n">${avgPts != null ? avgPts.toFixed(0) : '–'}</div><div class="l">Points per frame</div></div>
        <div class="tile"><div class="n">${r.p ? ru.best : '–'}</div><div class="l">Longest winning run</div></div>
        <div class="tile"><div class="n">${r.p ? ru.now : '–'}</div><div class="l">Current run</div></div>
      </div>
      ${r.p ? `<h2>Form, last 10 league frames</h2>${formStrip(list)}` : `<p class="dim">No league frames from match reports${S.season ? ' this season' : ''}.</p>`}
      <h2>By season</h2>${table('p-season', [{ k: 'season', label: 'Season' }, { k: 'team', label: 'Team' }, { k: 'hcap', label: 'Hcap', r: 1 }, { k: 'p', label: 'Frames', r: 1 }, { k: 'w', label: 'Won', r: 1 }, { k: 'l', label: 'Lost', r: 1 }, { k: 'pc', label: 'Win %', r: 1, f: fmtPc }, { k: 'cup', label: 'Cup W–L', r: 1 }, { k: 'hb', label: 'Best break', r: 1, f: (v) => v || '–' }], bySeason, 'season')}
      ${byOpp.length ? `<h2 style="margin-top:16px">League frames by opponent</h2>${table('p-opp', [{ k: 'opp', label: 'Opponent', f: (v) => pl(v) }, { k: 'team', label: 'Their team', f: (v) => tm(v) }, { k: 'p', label: 'Frames', r: 1 }, { k: 'w', label: 'Won', r: 1 }, { k: 'l', label: 'Lost', r: 1 }, { k: 'pc', label: 'Win %', r: 1, f: fmtPc }], byOpp, 'p')}` : ''}
      ${cms.length ? `<h2 style="margin-top:16px">Cup and individual matches</h2>${table('p-cups', [{ k: 'date', label: 'Date', f: (v) => (v ? fmtDate(v) : '') }, { k: 'comp', label: 'Competition' }, { k: 'round', label: 'Round' }, { k: 'opp', label: 'Opponent', f: (v) => pl(v) }, { k: 'score', label: 'Score', r: 1, cls: (x) => (x.won ? 'won' : 'lost') }], cms.map((x) => ({ ...x, score: `${x.f}–${x.a}` })), 'date')}` : ''}
    </section><aside style="display:grid;gap:16px;align-content:start">
      ${titles.length || finals.length ? `<div class="card"><h2 class="gold">Titles</h2><table>${titles.map((h) => `<tr><td>${esc(h.season)}</td><td>${esc(h.competition)}</td></tr>`).join('')}${finals.map((h) => `<tr class="dim"><td>${esc(h.season)}</td><td>Runner-up, ${esc(h.competition)}</td></tr>`).join('')}</table></div>` : ''}
      <div class="card"><h2>Head-to-head</h2><div class="h2h"><span>v</span><input id="h2h" list="pnames" value="${esc(h2hSel)}" placeholder="Pick a player"><datalist id="pnames">${S.players.filter((p) => p !== name).map((p) => `<option value="${esc(p)}">`).join('')}</datalist></div>${h2hSel ? h2hBox(name, h2hSel) : '<p class="dim">Every league frame and cup match between the two, all seasons.</p>'}</div>
      ${r.p ? `<div class="card"><h2>Home and away</h2><table><tr><td>Home</td><td class="r">${home.w}–${home.l}</td><td class="r">${pct(home.w, home.p)}%</td></tr><tr><td>Away</td><td class="r">${away.w}–${away.l}</td><td class="r">${pct(away.w, away.p)}%</td></tr></table></div>` : ''}
      <div class="card"><h2 class="gold">Top breaks</h2><p class="note">From the written match reports.</p><table>${br.slice(0, 8).map((x) => `<tr title="${esc(x.source)}"><td>${fmtDate(x.date)}</td><td class="r">${x.val}</td></tr>`).join('') || '<tr><td class="dim">None reported</td></tr>'}</table></div>
      ${sqs.length ? `<div class="card"><h2>Teams and handicaps</h2><table>${sqs.map((x) => `<tr><td>${esc(x.season)}</td><td>${tm(x.team)}</td><td class="r">${x.hcap ?? ''}</td></tr>`).join('')}</table><p class="note">Lower handicap = stronger player.</p></div>` : ''}
    </aside></div>`;
  },

  teams() {
    const season = S.season || S.seasons[0];
    const all = [...new Set(S.tables.filter((t) => t.kind === 'teams').map((t) => t.name))].sort();
    return `<div class="card"><h2>Teams · ${esc(season)}</h2><div class="list">${leagueTable(season).map((r) => tm(r.team)).join('')}</div></div>
      <div class="card" style="margin-top:16px"><h2>Every team since ${esc(S.seasons.at(-1))}</h2><div class="list">${all.map(tm).join('')}</div></div>`;
  },

  team(name) {
    const season = S.season || S.seasons[0];
    const lt = leagueTable(season), me = lt.find((r) => r.team === name);
    const squad = S.squads.filter((x) => x.team === name && x.season === season).sort((a, b) => (a.hcap ?? 999) - (b.hcap ?? 999));
    const cupT = S.cups.filter((x) => x.kind === 'team' && (x.home === name || x.away === name) && inSeason(x));
    const hist = S.seasons.map((s) => { const t = leagueTable(s).find((x) => x.team === name); return t ? `<tr><td>${esc(s)}</td><td class="r">${ordinal(t.pos)}</td><td class="r">${t.w}–${t.l}</td><td class="r">${t.f}–${t.a}</td></tr>` : ''; }).join('');
    const tTitles = S.honours.filter((h) => h.winner === name);
    const ms = S.matches.filter((m) => (m.home === name || m.away === name) && inSeason(m));
    const res = ms.map((m) => { const h = m.home === name; const f = h ? m.hf : m.af, a = h ? m.af : m.hf; return { date: m.date, ha: h ? 'H' : 'A', opp: h ? m.away : m.home, score: `${f}–${a}`, won: f > a, season: m.season }; });
    const pr = playerRows(S.pf.filter((x) => x.team === name && inSeason(x)));
    const br = S.breaks.filter((x) => x.team === name && inSeason(x)).sort((a, b) => b.val - a.val).slice(0, 6);
    const home = res.filter((x) => x.ha === 'H'), away = res.filter((x) => x.ha === 'A');
    const wl = (l) => `${l.filter((x) => x.won).length}–${l.filter((x) => !x.won).length}`;
    return `<div class="grid"><section class="card">
      <h1>${esc(name)}</h1><div class="sub">${me ? `${ordinal(me.pos)} in ${esc(season)} · ${me.pts != null ? me.pts + ' pts' : me.f + ' frames won'}` : 'Not in the league in ' + esc(season)} ${S.season ? '' : '· results from all seasons'}</div>
      ${coverageNote(S.season)}
      <div class="tiles">
        ${me ? `<div class="tile"><div class="n">${me.w}–${me.l}</div><div class="l">League table won–lost</div></div>` : ''}
        <div class="tile"><div class="n">${wl(res)}</div><div class="l">Results we have, won–lost</div></div>
        <div class="tile"><div class="n">${wl(home)}</div><div class="l">Home</div></div>
        <div class="tile"><div class="n">${wl(away)}</div><div class="l">Away</div></div>
        <div class="tile"><div class="n">${res.filter((x) => x.score === '5–0').length}</div><div class="l">5–0 wins</div></div>
      </div>
      <h2>Form, last 6 matches</h2>${formStrip(res.map((x) => ({ ...x, opp: x.opp })), 6)}
      <h2>Best players</h2>${table('t-players', PCOLS.filter((c) => c.k !== 'team'), pr, 'pc')}
    </section><aside style="display:grid;gap:16px;align-content:start">
      <div class="card"><h2>Results</h2>${table('t-res', [{ k: 'date', label: 'Date', f: (v) => fmtDate(v) }, { k: 'ha', label: '' }, { k: 'opp', label: 'Opponent', f: (v) => tm(v) }, { k: 'score', label: 'Score', r: 1, cls: (r) => (r.won ? 'won' : 'lost') }], res, 'date')}</div>
      ${squad.length ? `<div class="card"><h2>Squad ${esc(season)}</h2><table>${squad.map((x) => `<tr><td>${pl(x.player)}</td><td class="r">${x.hcap ?? ''}</td></tr>`).join('')}</table><p class="note">Number is the handicap; lower = stronger.</p></div>` : ''}
      ${tTitles.length ? `<div class="card"><h2 class="gold">Titles</h2><table>${tTitles.map((h) => `<tr><td>${esc(h.season)}</td><td>${esc(h.competition)}</td></tr>`).join('')}</table></div>` : ''}
      <div class="card"><h2>League finishes</h2><table>${hist}</table><p class="note">Position, matches won–lost, frames for–against.</p></div>
      ${cupT.length ? `<div class="card"><h2>Team cup matches</h2><table>${cupT.map((x) => { const h = x.home === name, w = h ? x.hs > x.as : x.as > x.hs; return `<tr><td>${esc(x.round)}</td><td>${tm(h ? x.away : x.home)}</td><td class="r ${w ? 'won' : 'lost'}">${w ? 'Won' : 'Lost'}</td></tr>`; }).join('')}</table></div>` : ''}
      <div class="card"><h2 class="gold">Top breaks</h2><table>${br.map((x) => `<tr><td>${pl(x.player)}</td><td class="r">${x.val}</td></tr>`).join('') || '<tr><td class="dim">None reported</td></tr>'}</table></div>
    </aside></div>`;
  },

  table() {
    const season = S.season || S.seasons[0], lt = leagueTable(season);
    const cols = (link) => [{ k: 'pos', label: '#', r: 1 }, { k: 'team', label: link === pl ? 'Player' : 'Team', f: (v) => link(v) }, { k: 'p', label: 'P', r: 1 }, { k: 'w', label: 'W', r: 1 }, { k: 'l', label: 'L', r: 1 },
      { k: 'f', label: 'F', r: 1 }, { k: 'a', label: 'A', r: 1 }, { k: 'gd', label: '+/−', r: 1 }, { k: 'pts', label: 'Pts', r: 1, f: (v) => v ?? '' }];
    const ind = [...new Set(S.tables.filter((t) => t.season === season && t.kind === 'players').map((t) => t.comp))];
    return `<div class="card"><h2>${esc(lt[0] && lt[0].comp ? lt[0].comp : 'League table')} · ${esc(season)}</h2><p class="dim">${lt[0] && lt[0].official ? "The league's own table." : 'Worked out from the results.'} F and A are frames for and against.</p>${table('table', cols(tm), lt, 'pos', false)}</div>
      ${ind.map((c, i) => `<div class="card" style="margin-top:16px"><h2>${esc(c)}</h2><p class="dim">Individual league.</p>${table('ind' + i, cols(pl), S.tables.filter((t) => t.season === season && t.comp === c).sort((a, b) => a.pos - b.pos).map((t) => ({ ...t, team: t.name })), 'pos', false)}</div>`).join('')}`;
  },

  leaders() {
    const list = S.pf.filter(inSeason);
    const most = Math.max(0, ...playerRows(list).map((r) => r.p));
    const min = Math.max(3, Math.round(most * 0.4)); // a fair share of the most frames anyone has played
    const rows = playerRows(list, min);
    const top = (k, n = 10) => [...rows].sort((a, b) => b[k] - a[k] || b.p - a.p).slice(0, n);
    const br = S.breaks.filter(inSeason).sort((a, b) => b.val - a.val).slice(0, 10);
    const form = playerRows(list, Math.min(10, min)).map((r) => { const l = list.filter((x) => x.player === r.name).slice(-10); return { ...r, f: l.filter((x) => x.won).length }; }).sort((a, b) => b.f - a.f).slice(0, 10);
    const bar = (v, max) => `<div class="bar" style="width:${Math.max(4, 100 * v / max)}%"></div>`;
    const box = (title, rs, val, max, note = '') => `<div class="card"><h2>${title}</h2>${note}<table>${rs.map((r, i) => `<tr><td class="r dim">${i + 1}</td><td>${pl(r.name || r.player)}</td><td class="barc">${bar(val(r), max)}</td><td class="r">${r.label || val(r)}</td></tr>`).join('')}</table></div>`;
    const t1 = top('pc'), t2 = top('w');
    return `<h2>Leaderboards · ${esc(seasonLabel())}</h2>${list.length ? '' : '<p class="note warn">No league frames from the match reports for this season yet, so the frame leaderboards are empty. Try another season or All seasons.</p>'}<div class="cols">
      ${box('Win %', t1.map((r) => ({ ...r, label: (100 * r.pc).toFixed(1) })), (r) => r.pc, 1, `<p class="dim">At least ${min} frames.</p>`)}
      ${box('Most frames won', t2, (r) => r.w, t2[0] ? t2[0].w : 1)}
      ${box('<span class="gold">Top breaks</span>', br, (x) => x.val, br[0] ? br[0].val : 1)}
      ${box('In form (wins in last 10 frames)', form.map((r) => ({ ...r, label: r.f + '/10' })), (r) => r.f, 10, `<p class="dim">At least ${Math.min(10, min)} frames.</p>`)}
    </div>`;
  },

  records() {
    const all = S.pf, g = {};
    for (const x of all) (g[x.player] ||= []).push(x);
    const run = Object.entries(g).map(([n, l]) => ({ name: n, v: runs(l).best })).sort((a, b) => b.v - a.v)[0];
    const hb = [...S.breaks].sort((a, b) => b.val - a.val)[0];
    const seasonBest = S.seasons.flatMap((s) => playerRows(all.filter((x) => x.season === s), 10).map((r) => ({ ...r, season: s })));
    const mostW = [...seasonBest].sort((a, b) => b.w - a.w)[0], bestPc = [...seasonBest].sort((a, b) => b.pc - a.pc)[0];
    const whites = {}; for (const m of S.matches) { if (m.hf === 5 && m.af === 0) whites[m.home] = (whites[m.home] || 0) + 1; if (m.af === 5 && m.hf === 0) whites[m.away] = (whites[m.away] || 0) + 1; }
    const wh = Object.entries(whites).sort((a, b) => b[1] - a[1])[0];
    const tr = {}; for (const m of S.matches) for (const [t, w] of [[m.home, m.hf > m.af], [m.away, m.af > m.hf]]) { const r = (tr[t] ||= { cur: 0, best: 0 }); r.cur = w ? r.cur + 1 : 0; r.best = Math.max(r.best, r.cur); }
    const trun = Object.entries(tr).sort((a, b) => b[1].best - a[1].best)[0];
    const champs = S.seasons.map((s) => { const t = leagueTable(s)[0]; return t ? `<tr><td>${esc(s)}</td><td>${tm(t.team)}</td><td class="r">${t.pts != null ? t.pts + ' pts' : t.w + ' wins'}</td></tr>` : ''; }).join('');
    const pf = S.pf.filter((x) => x.pts != null && x.home);
    const hiF = [...pf].sort((a, b) => Math.max(b.pts, b.oppPts) - Math.max(a.pts, a.oppPts))[0];
    const big = [...pf].sort((a, b) => Math.abs(b.pts - b.oppPts) - Math.abs(a.pts - a.oppPts))[0];
    const tc = {}; for (const h of S.honours.filter((h) => h.kind === 'singles')) tc[h.winner] = (tc[h.winner] || 0) + 1;
    const mt = Object.entries(tc).sort((a, b) => b[1] - a[1])[0];
    const fr = (x) => { const hw = x.pts >= x.oppPts; return `${pl(hw ? x.player : x.opp)} ${Math.max(x.pts, x.oppPts)}–${Math.min(x.pts, x.oppPts)} ${pl(hw ? x.opp : x.player)} · ${fmtDate(x.date)}`; };
    const card = (label, big, sub) => `<div class="card"><div class="dim">${label}</div><div class="big">${big}</div><div>${sub}</div></div>`;
    return `<h2>Records · all seasons</h2><div class="cols">
      ${hb ? card('Highest break', `<span class="gold">${hb.val}</span>`, `${pl(hb.player)} · ${fmtDate(hb.date)}`) : ''}
      ${run ? card('Longest winning run (frames)', run.v, pl(run.name)) : ''}
      ${mostW ? card('Most frames won in a season', mostW.w, `${pl(mostW.name)} · ${esc(mostW.season)}`) : ''}
      ${bestPc ? card('Best season win % (10+ frames)', (100 * bestPc.pc).toFixed(1) + '%', `${pl(bestPc.name)} · ${esc(bestPc.season)}`) : ''}
      ${trun ? card('Longest team winning run (matches)', trun[1].best, tm(trun[0])) : ''}
      ${wh ? card('Most 5–0 wins (results we have)', wh[1], tm(wh[0])) : ''}
      ${mt ? card('Most individual titles', mt[1], pl(mt[0])) : ''}
      ${hiF ? card('Most points in a league frame', Math.max(hiF.pts, hiF.oppPts), fr(hiF)) : ''}
      ${big ? card('Biggest winning margin in a frame', Math.abs(big.pts - big.oppPts), fr(big)) : ''}
      <div class="card"><h2>Top of the table by season</h2><table>${champs}</table><p class="dim">The current season is still being played.</p></div>
    </div>`;
  },
};

function h2hBox(a, b) {
  const l = S.pf.filter((x) => x.player === a && x.opp === b), r = rec(l);
  const c = S.pm.filter((x) => x.player === a && x.opp === b), q = cupRec(c);
  if (!l.length && !c.length) return `<p class="dim">No league frames or cup matches between ${esc(a)} and ${esc(b)} in the data.</p>`;
  return `${l.length ? `<div class="big">${r.w} – ${r.l}</div><p class="dim">League frames v ${pl(b)}</p><table>${l.slice().reverse().map((x) => `<tr><td>${fmtDate(x.date)}</td><td class="r">${x.pts != null ? `${x.pts}–${x.oppPts}` : ''}</td><td class="r ${x.won ? 'won' : 'lost'}">${x.won ? 'Won' : 'Lost'}</td></tr>`).join('')}</table>` : ''}
    ${c.length ? `<div class="big" style="margin-top:10px">${q.w} – ${q.l}</div><p class="dim">Cup matches v ${pl(b)}</p><table>${c.slice().reverse().map((x) => `<tr><td>${esc(x.comp)}</td><td class="r ${x.won ? 'won' : 'lost'}">${x.f}–${x.a}</td></tr>`).join('')}</table>` : ''}`;
}
const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

// ---------- Routing and controls ----------
function route() {
  const [tab, ...rest] = (location.hash.slice(1) || 'players').split('/');
  const arg = decodeURIComponent(rest.join('/'));
  const fn = pages[tab] || pages.players;
  $('#app').innerHTML = fn(arg);
  const navTab = { player: 'players', team: 'teams' }[tab] || tab;
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('on', a.dataset.tab === navTab));
  document.title = (arg ? arg + ' · ' : '') + 'IOM Snooker Stats';
  const h = $('#h2h'); if (h) h.addEventListener('change', () => { S.h2h = h.value; route(); });
}
window.addEventListener('hashchange', () => { window.scrollTo(0, 0); route(); });
$('#season').addEventListener('change', (e) => { S.season = e.target.value; route(); });
$('#search').addEventListener('change', (e) => {
  const v = e.target.value.trim().toLowerCase(); if (!v) return;
  const p = S.players.find((x) => x.toLowerCase() === v) || S.players.find((x) => x.toLowerCase().includes(v));
  const t = S.teams.find((x) => x.toLowerCase() === v) || (!p && S.teams.find((x) => x.toLowerCase().includes(v)));
  if (t && (!p || t.toLowerCase() === v)) location.hash = 'team/' + encodeURIComponent(t);
  else if (p) location.hash = 'player/' + encodeURIComponent(p);
  e.target.value = '';
});
$('#theme').addEventListener('click', () => {
  const r = document.documentElement, t = r.dataset.theme === 'light' ? 'dark' : 'light';
  r.dataset.theme = t; try { localStorage.setItem('theme', t); } catch (e) { /* private mode */ }
});

// wait until every script (graphs.js too) has loaded
window.addEventListener('DOMContentLoaded', () => init().catch((e) => { $('#app').innerHTML = `<div class="card">Couldn't load the data: ${esc(e.message)}</div>`; }));
