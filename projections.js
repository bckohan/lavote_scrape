// projections.js — model projections overlay for the LA Vote viewer.
// Fails open: any error → behaves as if projections are disabled.
(function () {
  const SCHEMA_MAJOR = 1;
  // When true, the movers panel only lists rows the model marked publishable.
  const MOVERS_PUBLISHED_ONLY = true;
  // https://host/path, or a relative path (./x, ../x, /x, x/y). No quotes, angle brackets or whitespace.
  const URL_RE = /^(https:\/\/[\w.-]+(\/[^"'<>\s]*)?|\.{0,2}\/[^"'<>\s]*|[\w.-]+(\/[^"'<>\s]*)?)$/;
  const S = { enabled: false, url: null, manifest: null, cache: new Map(), charts: [], moversSeq: 0 };

  function override() {
    const v = new URLSearchParams(location.search).get('projections');
    return v === 'off' ? false : v === 'on' ? true : null;
  }

  // ?projections_url=http://localhost:8001 — local preview of a `lavote serve-site`; localhost only.
  function urlOverride() {
    const v = new URLSearchParams(location.search).get('projections_url');
    return v && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/[\w./-]*)?$/.test(v) ? v : null;
  }

  async function getJSON(url, ms = 8000) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms);
    try {
      const r = await fetch(url, { cache: 'no-store', signal: ac.signal });
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  function disable() { S.enabled = false; S.manifest = null; }

  // Computes the new state into locals and only swaps S at the end, so a render that is
  // in flight while we re-init (poll) never observes a half-cleared state.
  async function init(eid) {
    try {
      const ov = override();
      if (ov === false) { disable(); return false; }
      const cfg = await getJSON('config.json').catch(() => null);
      const p = cfg && cfg.projections;
      if (!p || typeof p.url !== 'string' || !URL_RE.test(p.url) || (!p.enabled && ov !== true)) { disable(); return false; }
      const url = (urlOverride() || p.url).replace(/\/$/, '');
      const m = await getJSON(`${url}/index.json`);
      if (!m || Math.floor(m.schema_version) !== SCHEMA_MAJOR || !m.elections || typeof m.elections !== 'object') {
        disable(); return false;
      }
      S.url = url; S.manifest = m; S.enabled = true; S.cache.clear();
      console.info('[projections] enabled', m.generated_at);
      return true;
    } catch (e) { disable(); console.info('[projections] disabled:', e.message); return false; }
  }

  function version() { return S.manifest ? S.manifest.generated_at : null; }

  function entry(eid, contestId) {
    const el = S.enabled && S.manifest.elections[String(eid)];
    return el && el.contests && el.contests[String(contestId)] || null;
  }
  function isPublishable(eid, contestId) { const e = entry(eid, contestId); return !!(e && e.publish); }

  async function load(rel) {
    if (!S.cache.has(rel)) S.cache.set(rel, getJSON(`${S.url}/${rel}`).catch(() => null));
    return S.cache.get(rel);
  }

  function destroy() { for (const c of S.charts) { try { c.destroy(); } catch (_) {} } S.charts = []; }

  function hide(mount, e) {
    mount.hidden = true; mount.innerHTML = '';
    if (e) console.info('[projections] render skipped:', e.message);
  }
  const lsGet = k => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fin = x => Number.isFinite(x);
  const pct = x => (x * 100).toFixed(1);
  const shareOk = s => !!s && fin(s.mean) && fin(s.p05) && fin(s.p95);
  // Returns null when any component is not a finite number.
  function fmtShare(s) { return shareOk(s) ? `${pct(s.mean)}% (${pct(s.p05)}–${pct(s.p95)})` : null; }
  const band = color => /^#[0-9a-f]{6}$/i.test(color) ? color + '33' : color;

  // Vertical divider at the last observed drop ("now"), separating observed from projected.
  const nowLine = {
    id: 'projNowLine',
    afterDatasetsDraw(chart, _args, opts) {
      const x = chart.scales.x, y = chart.scales.y;
      if (!x || !y || opts.index == null) return;
      const px = x.getPixelForValue(opts.index);
      const ctx = chart.ctx; ctx.save();
      ctx.strokeStyle = '#64748b'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, y.top); ctx.lineTo(px, y.bottom); ctx.stroke();
      ctx.fillStyle = '#94a3b8'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('now', px + 4, y.top + 10);
      ctx.restore();
    },
  };

  async function renderDetail(eid, contestId, mount, electionData, qualified, colors, series) {
    if (!mount) return;
    const e = entry(eid, contestId);
    if (!e || !e.publish) { hide(mount); return; }
    const data = await load(e.file);
    // The detail view may have been re-rendered while the fetch was in flight; our mount is then detached.
    if (mount.isConnected === false) return;
    try {
      if (!data || Math.floor(data.schema_version) !== SCHEMA_MAJOR
          || !Array.isArray(data.candidates) || !data.candidates.length || !Array.isArray(data.trajectory)) {
        hide(mount); return;
      }
      const contest = electionData.contestById.get(contestId);
      const isMeasure = !!(contest && contest.type === 'Measure');
      const cands = data.candidates.filter(c => c && shareOk(c.final));
      if (!cands.length) { hide(mount); return; }
      const leader = [...cands].sort((a, b) => b.final.mean - a.final.mean)[0];
      const yes = isMeasure ? cands.find(c => /^yes$/i.test(c.name)) : null;
      // Measures: always report YES's chance of passing, whichever side leads.
      const subject = yes || leader;
      const winP = subject.p_win;
      if (!fin(winP)) { hide(mount); return; }
      const verb = yes ? 'of passing' : 'of winning';
      const prior = data.confidence === 'prior';

      // Chart data.
      const obsLabels = series.map(s => s.ts);
      const futLabels = data.trajectory.map(t => t.label);
      const labels = [...obsLabels, ...futLabels];
      const pad = n => Array(n).fill(null);
      const datasets = [];
      const num = x => (fin(x) ? x * 100 : null);
      qualified.forEach((cid, idx) => {
        const color = colors[idx % colors.length];
        const obs = series.map(s => {
          const tot = Object.values(s.votes).reduce((a, b) => a + b, 0);
          return tot ? (s.votes[cid] || 0) / tot * 100 : null;
        });
        const proj = data.trajectory.map(t => {
          const c = t && t.candidates && t.candidates[String(cid)];
          return c && shareOk(c.share) ? c.share : null;
        });
        if (!proj.some(Boolean)) return;
        const lastObs = obs[obs.length - 1];
        const mean = [...pad(obs.length - 1), lastObs, ...proj.map(p => p ? num(p.mean) : null)];
        const lo = [...pad(obs.length - 1), lastObs, ...proj.map(p => p ? num(p.p05) : null)];
        const hi = [...pad(obs.length - 1), lastObs, ...proj.map(p => p ? num(p.p95) : null)];
        const name = (electionData.candidateById.get(cid) || {}).name || String(cid);
        datasets.push({ label: name, data: [...obs, ...pad(futLabels.length)], borderColor: color, backgroundColor: color, pointRadius: 3, borderWidth: 2, tension: 0.1 });
        datasets.push({ label: `${name} (projected)`, data: mean, borderColor: color, borderDash: [6, 4], pointRadius: 0, borderWidth: 2, tension: 0.1 });
        datasets.push({ label: `${name} p95`, projBand: true, data: hi, borderColor: 'transparent', backgroundColor: band(color), pointRadius: 0, fill: '+1', tension: 0.1 });
        datasets.push({ label: `${name} p05`, projBand: true, data: lo, borderColor: 'transparent', pointRadius: 0, fill: false, tension: 0.1 });
      });
      // No candidate id matched the model output: nothing to chart, so skip the section entirely.
      if (!datasets.length) { hide(mount); return; }

      const html = `
      <h3>Projection</h3>
      <div class="proj-summary${prior ? ' prior' : ''}">Projected final: <strong>${esc(subject.name)}</strong>
        ${fmtShare(subject.final)} · ${Math.round(winP * 100)}% chance ${verb}${prior ? ' <em>(early, mostly prior)</em>' : ''}${contest && contest.multiCounty ? ' · LA County votes only' : ''}</div>
      <div class="chart-wrap"><canvas id="chart-projection"></canvas></div>
      <div class="proj-caveat">Model estimate, not an official count. 90% band. Updated ${esc(data.as_of)}.
        <a href="${esc(S.url)}/methods.html" target="_blank" rel="noopener">How this works</a></div>`;
      mount.innerHTML = html;
      mount.hidden = false;

      const chart = new Chart(mount.querySelector('#chart-projection'), {
        type: 'line', data: { labels, datasets },
        options: { responsive: true, maintainAspectRatio: false,
          plugins: {
            projNowLine: { index: obsLabels.length - 1 },
            legend: { position: 'top', labels: { color: '#e2e8f0', boxWidth: 12,
              filter: (item, chartData) => !(chartData.datasets[item.datasetIndex] || {}).projBand } },
            tooltip: { mode: 'index', intersect: false, filter: i => !i.dataset.projBand,
              callbacks: { label: c => c.parsed.y == null ? null : ` ${c.dataset.label}: ${c.parsed.y.toFixed(1)}%` } } },
          scales: { x: { ticks: { color: '#94a3b8', maxRotation: 45 }, grid: { color: '#1e293b' } },
                    y: { title: { display: true, text: 'Vote share (%)', color: '#94a3b8' }, ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } } } },
        plugins: [nowLine],
      });
      S.charts.push(chart);

      // Drop table: rows are per candidate, so add a "Projected final" column (mean with 90% band).
      const table = document.querySelector('#drop-table-section table');
      if (table && !table.querySelector('th[data-proj]')) {
        const head = table.querySelector('thead tr');
        if (head) { const th = document.createElement('th'); th.dataset.proj = '1'; th.textContent = 'Projected final'; head.appendChild(th); }
        const byName = new Map(cands.map(c => [c.name, c]));
        for (const c of cands) {
          const cand = electionData.candidateById.get(c.id);
          if (cand && cand.name) byName.set(cand.name, c);
        }
        table.querySelectorAll('tbody tr').forEach(tr => {
          const name = tr.firstElementChild ? tr.firstElementChild.textContent : '';
          const c = byName.get(name);
          const td = document.createElement('td');
          td.textContent = (c && fmtShare(c.final)) || '';
          tr.appendChild(td);
        });
        table.querySelectorAll('tfoot tr').forEach(tr => tr.appendChild(document.createElement('td')));
      }
    } catch (err) { hide(mount, err); }
  }

  async function renderMovers(eid, mount) {
    if (!mount) return;
    const el = S.enabled && S.manifest.elections[String(eid)];
    if (!el || !el.movers) { hide(mount); return; }
    // The panel is persistent; a newer renderMovers call supersedes this one once its fetch resolves.
    const seq = ++S.moversSeq;
    const data = await load(el.movers);
    if (seq !== S.moversSeq) return;
    try {
      if (!data || Math.floor(data.schema_version) !== SCHEMA_MAJOR || !Array.isArray(data.rows)) { hide(mount); return; }
      let rows = data.rows.filter(r => r && typeof r === 'object');
      if (MOVERS_PUBLISHED_ONLY) rows = rows.filter(r => r.publish !== false);
      rows = rows.slice(0, 10);
      const m = x => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}`;
      const body = rows.map(r => {
        const cid = Number(r.contest_id);
        if (!Number.isFinite(cid)) return '';
        const pm = r.projected_margin;
        if (!fin(r.current_margin) || !shareOk(pm) || !fin(r.p_flip)) return '';
        return `<tr><td><a href="#/${esc(eid)}/${cid}">${esc(r.title)}</a></td><td>${esc(r.leader)}</td>
        <td>${m(r.current_margin)}</td><td>${m(pm.mean)} (${m(pm.p05)}…${m(pm.p95)})</td>
        <td>${Math.round(r.p_flip * 100)}%</td></tr>`;
      }).filter(Boolean);
      if (!body.length) { hide(mount); return; }
      const collapsed = lsGet('projMoversCollapsed') === '1';
      const html = `<details ${collapsed ? '' : 'open'}><summary>Movers — races the model expects to shift most</summary>
      <table class="movers-table"><thead><tr><th>Contest</th><th>Leader</th><th>Now</th><th>Projected</th><th>Flip</th></tr></thead><tbody>
      ${body.join('')}</tbody></table>
      <div class="proj-caveat" style="padding:6px 14px">Margins are leader minus runner-up, in points. Model estimates.</div></details>`;
      mount.innerHTML = html;
      mount.hidden = false;
      // innerHTML above recreated <details>, so this listener never stacks on a persistent element.
      const det = mount.querySelector('details');
      if (det) det.addEventListener('toggle', ev => lsSet('projMoversCollapsed', ev.target.open ? '0' : '1'));
    } catch (err) { hide(mount, err); }
  }

  window.Projections = { init, version, isPublishable, load, destroy, renderDetail, _state: S, renderMovers };
})();
