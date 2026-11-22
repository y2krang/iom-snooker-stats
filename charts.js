// Small SVG chart helpers (no libraries). Colours come from CSS variables in style.css.
'use strict';
const Chart = (() => {
  const W = 520, M = { l: 48, r: 14, t: 12, b: 32 };
  const e = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)'];

  // A round top value and whole-number ticks (about 4 steps) for counts
  function scale(v) {
    if (!(v > 0)) return { max: 1, ticks: [0, 1] };
    const raw = v / 4, p = 10 ** Math.floor(Math.log10(raw)), n = raw / p;
    const step = Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p);
    const max = Math.ceil(v / step) * step;
    return { max, ticks: Array.from({ length: max / step + 1 }, (_, i) => i * step) };
  }
  const auto = (o, v) => (o.yMax != null ? { max: o.yMax, ticks: o.yTicks } : scale(v));
  // y axis + gridlines; returns {svg, y()} for a value range
  function yAxis(min, max, h, fmt, invert, ticks) {
    const ph = h - M.t - M.b;
    const y = (v) => M.t + (invert ? (v - min) / (max - min) : 1 - (v - min) / (max - min)) * ph;
    const vals = ticks || Array.from({ length: 5 }, (_, i) => min + (i * (max - min)) / 4);
    const svg = vals.map((v) => `<line class="grid" x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${M.l - 6}" y="${y(v) + 4}" text-anchor="end">${e(fmt(v))}</text>`).join('')
      + `<line class="axis" x1="${M.l}" x2="${W - M.r}" y1="${M.t + ph}" y2="${M.t + ph}"/>`;
    return { svg, y };
  }
  const open = (h, label) => `<svg viewBox="0 0 ${W} ${h}" role="img" aria-label="${e(label || 'chart')}">`;
  const legend = (series) => series.length < 2 ? '' : `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${e(s.name)}</span>`).join('')}</div>`;
  const barPath = (x, y, w, h, r) => { if (h <= 0) return ''; r = Math.min(r, w / 2, h); return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; };
  const empty = (msg) => `<p class="dim">${e(msg || 'Not enough data yet.')}</p>`;

  // Line chart. series: [{name, color, width, points:[{x, y, tip}]}]; xTicks: [{x, label}]
  function line(o) {
    const pts = o.series.flatMap((s) => s.points);
    if (pts.length < 2) return empty(o.empty);
    const h = o.h || 230, fmt = o.fmt || ((v) => Math.round(v));
    let x0 = Math.min(...pts.map((p) => p.x)), x1 = Math.max(...pts.map((p) => p.x)); if (x0 === x1) { x0 -= 1; x1 += 1; }
    const sc = auto(o, Math.max(...pts.map((p) => p.y)));
    const y0 = o.yMin ?? 0, y1 = sc.max;
    const ax = yAxis(y0, y1, h, fmt, o.invert, o.yTicks || sc.ticks);
    const x = (v) => M.l + ((v - x0) / (x1 - x0)) * (W - M.l - M.r);
    let svg = open(h, o.label) + ax.svg;
    for (const t of o.xTicks || []) svg += `<text x="${x(t.x)}" y="${h - 10}" text-anchor="middle">${e(t.label)}</text>`;
    for (const s of o.series) {
      const ps = s.points;
      if (!o.dotsOnly && ps.length > 1) svg += `<path class="ln" d="${ps.map((p, i) => (i ? 'L' : 'M') + x(p.x).toFixed(1) + ',' + ax.y(p.y).toFixed(1)).join('')}" style="stroke:${s.color};stroke-width:${s.width || 2}"/>`;
      const showDots = o.dotsOnly || (ps.length <= 24 && o.series.filter((z) => z.points.length).length === 1);
      for (const p of ps) {
        if (s.muted && !p.tip) continue;
        svg += `<circle cx="${x(p.x).toFixed(1)}" cy="${ax.y(p.y).toFixed(1)}" r="${showDots ? 4 : 7}" class="${showDots ? 'dot' : 'hit'}" style="fill:${showDots ? s.color : 'transparent'}" data-tip="${e(p.tip || '')}"/>`;
      }
    }
    return legend(o.series.filter((s) => s.name)) + svg + '</svg>';
  }

  // Vertical bars. data: [{label, value, tip}]
  function bars(o) {
    const d = o.data; if (!d.length) return empty(o.empty);
    const h = o.h || 220, fmt = o.fmt || ((v) => Math.round(v));
    const sc = auto(o, Math.max(...d.map((b) => b.value))), max = sc.max;
    const ax = yAxis(0, max, h, fmt, false, sc.ticks);
    const band = (W - M.l - M.r) / d.length, bw = Math.min(band - 2, 56);
    const every = Math.ceil(d.length / 8);
    let svg = open(h, o.label) + ax.svg;
    d.forEach((b, i) => {
      const cx = M.l + band * i + band / 2, top = ax.y(b.value);
      svg += `<path class="bar" d="${barPath(cx - bw / 2, top, bw, ax.y(0) - top, 4)}" style="fill:${b.color || o.color || 'var(--s1)'}" data-tip="${e(b.tip || b.label + ': ' + fmt(b.value))}"/>`;
      svg += `<rect class="hit" x="${cx - band / 2}" y="${M.t}" width="${band}" height="${ax.y(0) - M.t}" data-tip="${e(b.tip || b.label + ': ' + fmt(b.value))}"/>`;
      if (i % every === 0) svg += `<text x="${cx}" y="${h - 10}" text-anchor="middle">${e(b.label)}</text>`;
    });
    return svg + '</svg>';
  }

  // Grouped bars. labels: [..]; series: [{name, color, values:[..]}]
  function grouped(o) {
    if (!o.labels.length) return empty(o.empty);
    const h = o.h || 230, fmt = o.fmt || ((v) => Math.round(v));
    const sc = auto(o, Math.max(...o.series.flatMap((s) => s.values))), max = sc.max;
    const ax = yAxis(0, max, h, fmt, false, sc.ticks);
    const band = (W - M.l - M.r) / o.labels.length, n = o.series.length;
    const bw = Math.min((band - 10) / n - 2, 40), gw = n * (bw + 2) - 2;
    let svg = open(h, o.label) + ax.svg;
    o.labels.forEach((lab, i) => {
      const gx = M.l + band * i + (band - gw) / 2;
      o.series.forEach((s, j) => {
        const v = s.values[i], top = ax.y(v), tip = `${lab} · ${s.name}: ${fmt(v)}`;
        svg += `<path class="bar" d="${barPath(gx + j * (bw + 2), top, bw, ax.y(0) - top, 4)}" style="fill:${s.color}" data-tip="${e(tip)}"/>`;
      });
      svg += `<text x="${M.l + band * i + band / 2}" y="${h - 10}" text-anchor="middle">${e(lab)}</text>`;
    });
    return legend(o.series) + svg + '</svg>';
  }

  // Horizontal bars as HTML rows. data: [{label (html ok), value, text, tip}]
  function hbars(o) {
    const d = o.data; if (!d.length) return empty(o.empty);
    const max = o.max ?? Math.max(...d.map((r) => r.value)), fmt = o.fmt || ((v) => v);
    return `<div class="hbars">${d.map((r) => `<div class="hrow" data-tip="${e(r.tip || '')}"><span class="hl">${r.label}</span><span class="ht"><span class="hb" style="width:${Math.max(1.5, (100 * r.value) / (max || 1))}%;background:${r.color || o.color || 'var(--s1)'}"></span></span><span class="hv">${r.text ?? fmt(r.value)}</span></div>`).join('')}</div>`;
  }

  // Shared hover tooltip for anything with data-tip
  function tooltips() {
    const tip = document.createElement('div'); tip.id = 'tip'; tip.hidden = true; document.body.appendChild(tip);
    document.addEventListener('pointerover', (ev) => { const t = ev.target.closest('[data-tip]'); if (!t || !t.dataset.tip) { tip.hidden = true; return; } tip.textContent = t.dataset.tip; tip.hidden = false; });
    document.addEventListener('pointermove', (ev) => {
      if (tip.hidden) return;
      const x = Math.min(ev.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
      tip.style.left = x + 'px'; tip.style.top = (ev.clientY + 16) + 'px';
    });
    document.addEventListener('scroll', () => { tip.hidden = true; }, true);
  }

  return { line, bars, grouped, hbars, tooltips, SERIES };
})();
