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
  const [m, f, b, info] = await Promise.all([load('matches.csv'), load('frames.csv'), load('breaks.csv', true), load('info.json', true)]);
  const byId = {};
  S.matches = m.map((x) => ({ id: x.match_id, season: x.season, date: x.date, comp: x.competition || 'League', home: x.home_team, away: x.away_team, venue: x.venue, hf: +x.home_frames, af: +x.away_frames }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  S.matches.forEach((x, i) => { x.order = i; byId[x.id] = x; });
  for (const r of f) {
    const mt = byId[r.match_id]; if (!mt) continue;
    const n = +r.frame, hw = r.winner === 'home';
    const base = { m: mt, n, season: mt.season, date: mt.date, sort: mt.order * 100 + n };
    S.pf.push({ ...base, player: r.home_player, team: mt.home, opp: r.away_player, oppTeam: mt.away, won: hw, home: true });
    S.pf.push({ ...base, player: r.away_player, team: mt.away, opp: r.home_player, oppTeam: mt.home, won: !hw, home: false });
  }
  S.pf = S.pf.filter((x) => x.player && x.opp && !/walk ?over/i.test(x.player + x.opp)).sort((a, b) => a.sort - b.sort);
  S.breaks = (b || []).map((x) => ({ m: byId[x.match_id], season: x.season, date: x.date, player: x.player, team: x.team, val: +x.break })).filter((x) => x.val > 0);
  S.seasons = [...new Set(S.matches.map((x) => x.season))].sort().reverse();
  S.players = [...new Set(S.pf.map((x) => x.player))].sort();
  S.teams = [...new Set(S.matches.flatMap((x) => [x.home, x.away]))].sort();

  $('#season').innerHTML = `<option value="">All seasons</option>` + S.seasons.map((s) => `<option>${esc(s)}</option>`).join('');
  S.season = S.seasons[0] || '';
  $('#season').value = S.season;
  $('#names').innerHTML = [...S.players, ...S.teams].map((n) => `<option value="${esc(n)}">`).join('');
  if (info && info.sample) { $('#banner').hidden = false; $('#banner').textContent = 'Demo: made-up sample players and teams, not real results.'; }
  $('#updated').textContent = 'Last updated ' + (info && info.updated ? info.updated : fmtDate(S.matches.at(-1).date));
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

// League table for a season (points = frames won, as on the league's own table)
function leagueTable(season) {
  const t = {};
  for (const m of S.matches.filter((x) => x.season === season && x.comp === 'League')) {
    for (const [me, f, a, home] of [[m.home, m.hf, m.af, 1], [m.away, m.af, m.hf, 0]]) {
      const r = (t[me] ||= { team: me, p: 0, w: 0, l: 0, f: 0, a: 0, hw: 0, hl: 0, aw: 0, al: 0 });
      r.p++; r.f += f; r.a += a;
      if (f > a) { r.w++; home ? r.hw++ : r.aw++; } else { r.l++; home ? r.hl++ : r.al++; }
    }
  }
  return Object.values(t).map((r) => ({ ...r, gd: r.f - r.a, pts: r.f })).sort((a, b) => b.pts - a.pts || b.gd - a.gd || a.team.localeCompare(b.team)).map((r, i) => ({ ...r, pos: i + 1 }));
}

// ---------- Pages ----------
const pages = {
  players() {
    const rows = playerRows(S.pf.filter(inSeason));
    return `<div class="card"><h2>Players · ${esc(seasonLabel())}</h2><p class="dim">Search above or pick a name. Click a heading to sort.</p>${table('players', [...PCOLS, { k: 'run', label: 'Best run', r: 1 }], rows, 'name', false)}</div>`;
  },

  player(name) {
    const all = S.pf.filter((x) => x.player === name);
    if (!all.length) return `<div class="card">No player called “${esc(name)}”.</div>`;
    const list = all.filter(inSeason), r = rec(list), ru = runs(list);
    const br = S.breaks.filter((x) => x.player === name && inSeason(x)).sort((a, b) => b.val - a.val);
    const teams = [...new Set(list.map((x) => x.team))];
    const home = rec(list.filter((x) => x.home)), away = rec(list.filter((x) => !x.home));
    const bySeason = S.seasons.map((s) => { const l = all.filter((x) => x.season === s); if (!l.length) return null; const q = rec(l); const b = S.breaks.filter((x) => x.player === name && x.season === s); return { season: s, team: [...new Set(l.map((x) => x.team))].join(', '), p: q.p, w: q.w, l: q.l, pc: q.pc, hb: b.length ? Math.max(...b.map((x) => x.val)) : 0 }; }).filter(Boolean);
    const g = {}; for (const x of list) (g[x.opp] ||= []).push(x);
    const byOpp = Object.entries(g).map(([o, l]) => { const q = rec(l); return { opp: o, team: l.at(-1).oppTeam, p: q.p, w: q.w, l: q.l, pc: q.pc }; });
    const h2hSel = S.h2h && S.h2h !== name ? S.h2h : '';
    return `<div class="grid"><section class="card">
      <h1>${esc(name)}</h1><div class="sub">${teams.map(tm).join(', ') || 'No frames'} · ${esc(seasonLabel())}</div>
      <div class="tiles">
        <div class="tile"><div class="n">${r.w}–${r.l}</div><div class="l">Frames won–lost</div></div>
        <div class="tile"><div class="n">${pct(r.w, r.p)}%</div><div class="l">Win %</div></div>
        <div class="tile"><div class="n">${br.length ? br[0].val : '–'}</div><div class="l">Best break</div></div>
        <div class="tile"><div class="n">${ru.best}</div><div class="l">Longest winning run</div></div>
        <div class="tile"><div class="n">${ru.now}</div><div class="l">Current run</div></div>
      </div>
      <h2>Form, last 10 frames</h2>${formStrip(list)}
      <h2>By season</h2>${table('p-season', [{ k: 'season', label: 'Season' }, { k: 'team', label: 'Team' }, { k: 'p', label: 'Frames', r: 1 }, { k: 'w', label: 'Won', r: 1 }, { k: 'l', label: 'Lost', r: 1 }, { k: 'pc', label: 'Win %', r: 1, f: (v) => (100 * v).toFixed(1) }, { k: 'hb', label: 'Best break', r: 1, f: (v) => v || '–' }], bySeason, 'season')}
      <h2 style="margin-top:16px">By opponent</h2>${table('p-opp', [{ k: 'opp', label: 'Opponent', f: (v) => pl(v) }, { k: 'team', label: 'Their team', f: (v) => tm(v) }, { k: 'p', label: 'Frames', r: 1 }, { k: 'w', label: 'Won', r: 1 }, { k: 'l', label: 'Lost', r: 1 }, { k: 'pc', label: 'Win %', r: 1, f: (v) => (100 * v).toFixed(1) }], byOpp, 'p')}
    </section><aside style="display:grid;gap:16px;align-content:start">
      <div class="card"><h2>Head-to-head</h2><div class="h2h"><span>v</span><input id="h2h" list="pnames" value="${esc(h2hSel)}" placeholder="Pick a player"><datalist id="pnames">${S.players.filter((p) => p !== name).map((p) => `<option value="${esc(p)}">`).join('')}</datalist></div>${h2hSel ? h2hBox(name, h2hSel) : '<p class="dim">Every frame between the two, all seasons.</p>'}</div>
      <div class="card"><h2>Home and away</h2><table><tr><td>Home</td><td class="r">${home.w}–${home.l}</td><td class="r">${pct(home.w, home.p)}%</td></tr><tr><td>Away</td><td class="r">${away.w}–${away.l}</td><td class="r">${pct(away.w, away.p)}%</td></tr></table></div>
      <div class="card"><h2 class="gold">Top breaks</h2><table>${br.slice(0, 8).map((x) => `<tr><td>${fmtDate(x.date)}</td><td class="r">${x.val}</td></tr>`).join('') || '<tr><td class="dim">None recorded</td></tr>'}</table></div>
    </aside></div>`;
  },

  teams() {
    const season = S.season || S.seasons[0];
    return `<div class="card"><h2>Teams · ${esc(season)}</h2><div class="list">${leagueTable(season).map((r) => tm(r.team)).join('')}</div></div>`;
  },

  team(name) {
    const season = S.season || S.seasons[0];
    const lt = leagueTable(season), me = lt.find((r) => r.team === name);
    const ms = S.matches.filter((m) => (m.home === name || m.away === name) && inSeason(m));
    const res = ms.map((m) => { const h = m.home === name; const f = h ? m.hf : m.af, a = h ? m.af : m.hf; return { date: m.date, ha: h ? 'H' : 'A', opp: h ? m.away : m.home, score: `${f}–${a}`, won: f > a, season: m.season }; });
    const pr = playerRows(S.pf.filter((x) => x.team === name && inSeason(x)));
    const br = S.breaks.filter((x) => x.team === name && inSeason(x)).sort((a, b) => b.val - a.val).slice(0, 6);
    const home = res.filter((x) => x.ha === 'H'), away = res.filter((x) => x.ha === 'A');
    const wl = (l) => `${l.filter((x) => x.won).length}–${l.filter((x) => !x.won).length}`;
    return `<div class="grid"><section class="card">
      <h1>${esc(name)}</h1><div class="sub">${me ? `${ordinal(me.pos)} in ${esc(season)} · ${me.pts} pts` : 'No league matches in ' + esc(season)} ${S.season ? '' : '· results from all seasons'}</div>
      <div class="tiles">
        <div class="tile"><div class="n">${wl(res)}</div><div class="l">Matches won–lost</div></div>
        <div class="tile"><div class="n">${wl(home)}</div><div class="l">Home</div></div>
        <div class="tile"><div class="n">${wl(away)}</div><div class="l">Away</div></div>
        <div class="tile"><div class="n">${res.filter((x) => x.score === '5–0').length}</div><div class="l">5–0 wins</div></div>
      </div>
      <h2>Form, last 6 matches</h2>${formStrip(res.map((x) => ({ ...x, opp: x.opp })), 6)}
      <h2>Best players</h2>${table('t-players', PCOLS.filter((c) => c.k !== 'team'), pr, 'pc')}
    </section><aside style="display:grid;gap:16px;align-content:start">
      <div class="card"><h2>Results</h2>${table('t-res', [{ k: 'date', label: 'Date', f: (v) => fmtDate(v) }, { k: 'ha', label: '' }, { k: 'opp', label: 'Opponent', f: (v) => tm(v) }, { k: 'score', label: 'Score', r: 1, cls: (r) => (r.won ? 'won' : 'lost') }], res, 'date')}</div>
      <div class="card"><h2 class="gold">Top breaks</h2><table>${br.map((x) => `<tr><td>${pl(x.player)}</td><td class="r">${x.val}</td></tr>`).join('') || '<tr><td class="dim">None recorded</td></tr>'}</table></div>
    </aside></div>`;
  },

  table() {
    const season = S.season || S.seasons[0];
    return `<div class="card"><h2>League table · ${esc(season)}</h2><p class="dim">Points are frames won, as on the league's own table.</p>${table('table', [
      { k: 'pos', label: '#', r: 1 }, { k: 'team', label: 'Team', f: (v) => tm(v) }, { k: 'p', label: 'P', r: 1 }, { k: 'w', label: 'W', r: 1 }, { k: 'l', label: 'L', r: 1 },
      { k: 'f', label: 'F', r: 1 }, { k: 'a', label: 'A', r: 1 }, { k: 'gd', label: '+/−', r: 1 }, { k: 'pts', label: 'Pts', r: 1 }], leagueTable(season), 'pos', false)}</div>`;
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
    return `<h2>Leaderboards · ${esc(seasonLabel())}</h2><div class="cols">
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
    const champs = S.seasons.map((s) => { const t = leagueTable(s)[0]; return t ? `<tr><td>${esc(s)}</td><td>${tm(t.team)}</td><td class="r">${t.pts} pts</td></tr>` : ''; }).join('');
    const card = (label, big, sub) => `<div class="card"><div class="dim">${label}</div><div class="big">${big}</div><div>${sub}</div></div>`;
    return `<h2>Records · all seasons</h2><div class="cols">
      ${hb ? card('Highest break', `<span class="gold">${hb.val}</span>`, `${pl(hb.player)} · ${fmtDate(hb.date)}`) : ''}
      ${run ? card('Longest winning run (frames)', run.v, pl(run.name)) : ''}
      ${mostW ? card('Most frames won in a season', mostW.w, `${pl(mostW.name)} · ${esc(mostW.season)}`) : ''}
      ${bestPc ? card('Best season win % (10+ frames)', (100 * bestPc.pc).toFixed(1) + '%', `${pl(bestPc.name)} · ${esc(bestPc.season)}`) : ''}
      ${trun ? card('Longest team winning run (matches)', trun[1].best, tm(trun[0])) : ''}
      ${wh ? card('Most 5–0 wins', wh[1], tm(wh[0])) : ''}
      <div class="card"><h2>Top of the table by season</h2><table>${champs}</table><p class="dim">The current season is still being played.</p></div>
    </div>`;
  },
};

function h2hBox(a, b) {
  const l = S.pf.filter((x) => x.player === a && x.opp === b), r = rec(l);
  if (!l.length) return `<p class="dim">${esc(a)} and ${esc(b)} haven't played each other.</p>`;
  return `<div class="big">${r.w} – ${r.l}</div><p class="dim">${esc(a)} v ${pl(b)}, ${r.p} frame${r.p === 1 ? '' : 's'}, all seasons</p><table>${l.slice().reverse().map((x) => `<tr><td>${fmtDate(x.date)}</td><td class="r ${x.won ? 'won' : 'lost'}">${x.won ? 'Won' : 'Lost'}</td></tr>`).join('')}</table>`;
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
