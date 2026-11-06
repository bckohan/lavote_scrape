# Projections Viewer Implementation Plan (lavote_scrape, branch `modeling`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render lavote_modeling's published projections in the public viewer behind a one-line switch, and notify lavote_modeling on every data push, without touching the scraper.

**Architecture:** A new `projections.js` owns all fetch/gating/rendering; `index.html` gets a config fetch, two mount points, and four one-line hooks. A new workflow sends `repository_dispatch` to the private repo.

**Tech Stack:** Vanilla JS, Chart.js (already loaded), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-03-projections-viewer-design.md`
**Work in:** `/Users/bckohan/Development/elections/lavote_scrape-modeling` (worktree, branch `modeling`). Never commit to `main` here.
**Commits:** GPG-signed via terminal pinentry. Stage, then hand the user `! git -C /Users/bckohan/Development/elections/lavote_scrape-modeling commit -m "..."`.

---

## File Map

| File | Role |
|---|---|
| `config.json` (new) | projections switch + base URL |
| `projections.js` (new) | fetch, gate, render detail section + movers panel |
| `index.html` | config fetch, mount points, hooks, script tag, CSS for new elements |
| `.github/workflows/notify-modeling.yml` (new) | dispatch to lavote_modeling |
| `docs/fixtures/projections/index.json`, `4348/turnout.json`, `4348/movers.json`, `4348/contests/10776.json` (new) | local test data |
| `README.md`, `CLAUDE.md` | document switch and files |

---

### Task 1: Switch, dispatch workflow, fixtures

**Goal:** Land the inert plumbing: `config.json`, the dispatch workflow, and fixture JSON matching the published schema.

**Files:**
- Create: `config.json`, `.github/workflows/notify-modeling.yml`, `docs/fixtures/projections/**`

**Acceptance Criteria:**
- [ ] `config.json` parses and has `projections.enabled` and `projections.url`
- [ ] Workflow YAML is valid (`gh workflow view` after push, or `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/notify-modeling.yml'))"`)
- [ ] Fixtures validate as JSON and contain `schema_version: 1`

**Verify:** `python3 -c "import json,glob; [json.load(open(f)) for f in ['config.json']+glob.glob('docs/fixtures/projections/**/*.json', recursive=True)]; print('ok')"` → `ok`

**Steps:**

- [ ] **Step 1: config.json**

```json
{ "projections": { "enabled": true, "url": "https://bckohan.github.io/lavote_modeling" } }
```

- [ ] **Step 2: Workflow**

```yaml
# .github/workflows/notify-modeling.yml
name: Notify modeling repo
on:
  push:
    branches: [main]
    paths: ['data/**', 'index.json']
jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Dispatch new-drop to lavote_modeling
        env:
          GH_TOKEN: ${{ secrets.MODELING_DISPATCH_TOKEN }}
        run: >
          gh api repos/bckohan/lavote_modeling/dispatches
          -f event_type=new-drop
          -F 'client_payload[sha]=${{ github.sha }}'
```
User action (cannot be automated): create a fine-grained PAT at https://github.com/settings/personal-access-tokens/new with Repository access = `bckohan/lavote_modeling` only, Permissions → Repository → Contents: Read and write. Then:
```
gh secret set MODELING_DISPATCH_TOKEN --repo bckohan/lavote_scrape
```

- [ ] **Step 3: Fixtures**

```json
// docs/fixtures/projections/index.json
{ "schema_version": 1, "generated_at": "2026-11-05T16:20:00-08:00", "model_version": "fixture",
  "elections": { "4348": { "source_commit": "abc123", "latest_drop": "2026-11-05T16:12:00-08:00",
    "turnout": "4348/turnout.json", "movers": "4348/movers.json",
    "contests": { "10776": { "file": "4348/contests/10776.json", "publish": true, "confidence": "data" } } } } }
```
```json
// docs/fixtures/projections/4348/contests/10776.json
{ "schema_version": 1, "contest_id": 10776, "title": "STATE SENATOR, 26th District", "contest_type": "D_v_D",
  "publish": true, "confidence": "data", "gate_reasons": [], "primary_contest_id": 10090,
  "as_of": "2026-11-05T16:12:00-08:00",
  "candidates": [
    { "id": 25544, "name": "SARAH RASCÓN", "party": "Democratic", "votes": 41200, "share": 0.471,
      "final": { "mean": 0.512, "p05": 0.489, "p95": 0.536 }, "p_win": 0.79 },
    { "id": 25545, "name": "SARA HERNANDEZ", "party": "Democratic", "votes": 46270, "share": 0.529,
      "final": { "mean": 0.488, "p05": 0.464, "p95": 0.511 }, "p_win": 0.21 } ],
  "trajectory": [
    { "ts": "2026-11-06T09:00:00", "label": "fri 11/06 9am", "drop_size": { "mean": 110000, "p05": 70000, "p95": 160000 },
      "candidates": { "25544": { "share": { "mean": 0.480, "p05": 0.470, "p95": 0.490 } }, "25545": { "share": { "mean": 0.520, "p05": 0.510, "p95": 0.530 } } } },
    { "ts": "2026-11-27T12:00:00", "label": "fri 11/27 12pm", "drop_size": { "mean": 20000, "p05": 5000, "p95": 60000 },
      "candidates": { "25544": { "share": { "mean": 0.512, "p05": 0.489, "p95": 0.536 } }, "25545": { "share": { "mean": 0.488, "p05": 0.464, "p95": 0.511 } } } } ],
  "history": [ { "as_of": "2026-11-04T16:10:00-08:00", "candidates": { "25544": { "final_mean": 0.505, "p05": 0.47, "p95": 0.54, "p_win": 0.62 } } } ],
  "diagnostics": { "divergences": 0.0, "rhat_max": 1.01, "drops_observed": 9 } }
```
```json
// docs/fixtures/projections/4348/movers.json
{ "schema_version": 1, "as_of": "2026-11-05T16:12:00-08:00", "rows": [
  { "contest_id": 10776, "title": "STATE SENATOR, 26th District", "leader": "SARA HERNANDEZ",
    "current_margin": 0.058, "projected_margin": { "mean": -0.024, "p05": -0.072, "p95": 0.022 },
    "p_flip": 0.79, "on_allowlist": true, "publish": true } ] }
```
```json
// docs/fixtures/projections/4348/turnout.json
{ "schema_version": 1, "prior": { "pdi_county": null, "pdi_city": null },
  "history": [ { "ts": "2026-11-05T16:12:00-08:00", "counted": 2650000, "county": { "mean": 3210000, "p05": 3050000, "p95": 3380000 },
                 "city": { "mean": 1230000, "p05": 1150000, "p95": 1310000 }, "model_used": "ratio" } ],
  "pending": [ { "ts": "2026-11-06T09:00:00", "label": "fri 11/06 9am", "new_ballots": { "mean": 110000, "p05": 70000, "p95": 160000 } } ] }
```

- [ ] **Step 4: Verify, stage; user commits** `feat: projections switch, dispatch workflow, fixtures`

---

### Task 2: `projections.js` — load and gate

**Goal:** Implement `Projections.init`, config and manifest fetching, URL override, and `isPublishable`, with no rendering yet.

**Files:**
- Create: `projections.js`
- Modify: `index.html` (script tag before the closing `</body>`; call `Projections.init(state.currentEid)` at the end of `init()` after `await route()`, and inside `startPolling()`'s refresh path)

**Acceptance Criteria:**
- [ ] With `config.json.url` set to `docs/fixtures/projections`, `Projections.isPublishable('4348', 10776)` is true in the browser console and `Projections.isPublishable('4348', 1)` is false
- [ ] With `?projections=off`, `init` resolves false and no request to the model URL is made (check Network tab)
- [ ] With the remote URL 404ing, `init` resolves false and the page is otherwise unchanged

**Verify:** `python3 -m http.server 8000` then console checks above.

**Steps:**

- [ ] **Step 1: Write projections.js (loader half)**

```js
// projections.js — model projections overlay for the LA Vote viewer.
// Fails open: any error → behaves as if projections are disabled.
(function () {
  const SCHEMA_MAJOR = 1;
  const S = { enabled: false, url: null, manifest: null, cache: new Map(), charts: [] };

  function override() {
    const v = new URLSearchParams(location.search).get('projections');
    return v === 'off' ? false : v === 'on' ? true : null;
  }

  async function getJSON(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.json();
  }

  async function init(eid) {
    S.enabled = false; S.manifest = null; S.cache.clear();
    try {
      const ov = override();
      if (ov === false) return false;
      const cfg = await getJSON('config.json').catch(() => null);
      const p = cfg && cfg.projections;
      if (!p || !p.url || (!p.enabled && ov !== true)) return false;
      S.url = p.url.replace(/\/$/, '');
      const m = await getJSON(`${S.url}/index.json`);
      if (!m || Math.floor(m.schema_version) !== SCHEMA_MAJOR || !m.elections) return false;
      S.manifest = m; S.enabled = true;
      console.info('[projections] enabled', m.generated_at);
      return true;
    } catch (e) { console.info('[projections] disabled:', e.message); return false; }
  }

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

  window.Projections = { init, isPublishable, load, destroy, _state: S,
    renderDetail: async () => {}, renderMovers: async () => {} };
})();
```

- [ ] **Step 2: Hooks in index.html**

At the end of `init()` after `await route();`:
```js
    if (window.Projections) await Projections.init(state.currentEid);
```
In `startPolling()`, where a fresh index is detected and the view re-renders, add before the re-render:
```js
      if (window.Projections) await Projections.init(state.currentEid);
```
Also in the `election-select` change handler after `state.currentEid = sel.value;`:
```js
      if (window.Projections) await Projections.init(state.currentEid);
```
Before `</body>`:
```html
<script src="projections.js"></script>
```
Note `projections.js` must load *after* the inline script defines `state`, but `init()` runs on `DOMContentLoaded`/load, so the order above is fine.

- [ ] **Step 3: Verify in browser with the fixture URL** (temporarily edit `config.json.url` to `docs/fixtures/projections`, then restore).
- [ ] **Step 4: Stage; user commits** `feat: projections loader and gating`

---

### Task 3: Detail-page projection section

**Goal:** Render summary line, projected trajectory chart with 90% band, caveat link, and a "Projected final" column in the drop table.

**Files:**
- Modify: `projections.js` (add `renderDetail`), `index.html` (mount point + hook + CSS)

**Acceptance Criteria:**
- [ ] On `#/4348/10776` with fixtures, a "Projection" section appears after Current Totals with the summary "Projected final: SARAH RASCÓN 51.2% (48.9–53.6) · 79% chance of winning"
- [ ] The chart shows solid observed lines, dashed projected lines, and a shaded band per candidate, with x labels continuing into schedule labels
- [ ] A contest with `publish: false` or not in the manifest renders no section and logs nothing

**Verify:** manual with fixtures; `?projections=off` removes the section.

**Steps:**

- [ ] **Step 1: Mount point + hook in `renderDetail()`** — in the template string, directly after the `#totals-section` div:
```html
        <div class="chart-section" id="projection-section" hidden></div>
```
At the very end of `renderDetail()`:
```js
  if (window.Projections) Projections.renderDetail(eid, contestId, document.getElementById('projection-section'),
    electionData, qualified, qualifiedColors, series);
```
And in `destroyActiveCharts()` add `if (window.Projections) Projections.destroy();`.

- [ ] **Step 2: CSS** (add near `.multi-county-warning`):
```css
    .proj-summary { font-size: 1rem; margin: 4px 0 8px; }
    .proj-summary.prior { color: #94a3b8; }
    .proj-caveat { font-size: 0.75rem; color: #94a3b8; margin-top: 6px; }
    .proj-caveat a { color: #7dd3fc; }
```

- [ ] **Step 3: renderDetail in projections.js** (replace the stub)

```js
  const pct = x => (x * 100).toFixed(1);
  function fmtShare(s) { return `${pct(s.mean)}% (${pct(s.p05)}–${pct(s.p95)})`; }

  async function renderDetail(eid, contestId, mount, electionData, qualified, colors, series) {
    if (!mount) return;
    const e = entry(eid, contestId);
    if (!e || !e.publish) { mount.hidden = true; return; }
    const data = await load(e.file);
    if (!data || Math.floor(data.schema_version) !== SCHEMA_MAJOR) { mount.hidden = true; return; }
    const contest = electionData.contestById.get(contestId);
    const byId = Object.fromEntries(data.candidates.map(c => [c.id, c]));
    const leader = [...data.candidates].sort((a, b) => b.final.mean - a.final.mean)[0];
    const verb = contest && contest.type === 'Measure' ? 'of passing' : 'of winning';
    const winP = contest && contest.type === 'Measure'
      ? (byId[leader.id] && /^yes$/i.test(leader.name) ? leader.p_win : 1 - (data.candidates.find(c => /^yes$/i.test(c.name)) || { p_win: 0 }).p_win)
      : leader.p_win;
    const prior = data.confidence === 'prior';
    mount.hidden = false;
    mount.innerHTML = `
      <h3>Projection</h3>
      <div class="proj-summary ${prior ? 'prior' : ''}">Projected final: <strong>${escHtml(leader.name)}</strong>
        ${fmtShare(leader.final)} · ${Math.round(winP * 100)}% chance ${verb}${prior ? ' <em>(early, mostly prior)</em>' : ''}
        ${contest && contest.multiCounty ? ' · LA County votes only' : ''}</div>
      <div class="chart-wrap"><canvas id="chart-projection"></canvas></div>
      <div class="proj-caveat">Model estimate, not an official count. 90% band. Updated ${escHtml(data.as_of)}.
        <a href="${S.url}/methods.html" target="_blank" rel="noopener">How this works</a></div>`;

    const obsLabels = series.map(s => s.ts);
    const futLabels = data.trajectory.map(t => t.label);
    const labels = [...obsLabels, ...futLabels];
    const datasets = [];
    qualified.forEach((cid, idx) => {
      const color = colors[idx % colors.length];
      const obs = series.map(s => { const tot = Object.values(s.votes).reduce((a, b) => a + b, 0); return tot ? (s.votes[cid] || 0) / tot * 100 : null; });
      const proj = data.trajectory.map(t => t.candidates[String(cid)] ? t.candidates[String(cid)].share : null);
      if (!proj.some(Boolean)) return;
      const lastObs = obs[obs.length - 1];
      const pad = n => Array(n).fill(null);
      const mean = [...pad(obs.length - 1), lastObs, ...proj.map(p => p ? p.mean * 100 : null)];
      const lo = [...pad(obs.length - 1), lastObs, ...proj.map(p => p ? p.p05 * 100 : null)];
      const hi = [...pad(obs.length - 1), lastObs, ...proj.map(p => p ? p.p95 * 100 : null)];
      const name = (electionData.candidateById.get(cid) || {}).name || String(cid);
      datasets.push({ label: name, data: [...obs, ...pad(futLabels.length)], borderColor: color, backgroundColor: color, pointRadius: 3, borderWidth: 2, tension: 0.1 });
      datasets.push({ label: `${name} (projected)`, data: mean, borderColor: color, borderDash: [6, 4], pointRadius: 0, borderWidth: 2, tension: 0.1 });
      datasets.push({ label: `${name} p95`, data: hi, borderColor: 'transparent', backgroundColor: color + '33', pointRadius: 0, fill: '+1', tension: 0.1 });
      datasets.push({ label: `${name} p05`, data: lo, borderColor: 'transparent', pointRadius: 0, fill: false, tension: 0.1 });
    });
    const chart = new Chart(mount.querySelector('#chart-projection'), {
      type: 'line', data: { labels, datasets },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { color: '#e2e8f0', boxWidth: 12,
                     filter: item => !/p05|p95$/.test(item.text) } },
                   tooltip: { mode: 'index', intersect: false, filter: i => !/p05|p95$/.test(i.dataset.label),
                     callbacks: { label: c => c.parsed.y == null ? null : ` ${c.dataset.label}: ${c.parsed.y.toFixed(1)}%` } } },
        scales: { x: { ticks: { color: '#94a3b8', maxRotation: 45 }, grid: { color: '#1e293b' } },
                  y: { title: { display: true, text: 'Vote share (%)', color: '#94a3b8' }, ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } } } }
    });
    S.charts.push(chart);

    // Drop table column
    const table = document.querySelector('#drop-table-section table');
    if (table) {
      const head = table.querySelector('thead tr'); if (head) { const th = document.createElement('th'); th.textContent = 'Projected final'; head.appendChild(th); }
      // rows are per drop; projected final is per candidate — append a footer row instead
      const tfoot = document.createElement('tfoot'); const tr = document.createElement('tr');
      const td = document.createElement('td'); td.colSpan = (head ? head.children.length : 1);
      td.textContent = 'Projected final: ' + data.candidates.map(c => `${c.name} ${fmtShare(c.final)}`).join(' · ');
      tr.appendChild(td); tfoot.appendChild(tr); table.appendChild(tfoot);
    }
  }
```
`escHtml` is defined in index.html's inline script and is global; if it is not (check `function escHtml` is top-level), copy a local version into projections.js.

- [ ] **Step 4: Verify with fixtures**, including a contest absent from the manifest (`#/4348/10775` → no section).
- [ ] **Step 5: Stage; user commits** `feat: detail-page projection section with 90% band`

---

### Task 4: Movers panel on the index

**Goal:** Collapsible panel above the contest list listing top movers with links.

**Files:**
- Modify: `projections.js` (`renderMovers`), `index.html` (mount + hook + CSS)

**Acceptance Criteria:**
- [ ] With fixtures, the index shows a "Movers" panel with one row linking to `#/4348/10776`
- [ ] Collapsed state persists across reloads (`localStorage['projMoversCollapsed']`)
- [ ] With projections off, no panel

**Steps:**

- [ ] **Step 1: Mount** — in `index.html`, inside `#screen-index` immediately before the `contest-list` container:
```html
      <section id="movers-panel" hidden></section>
```
At the end of `renderIndex()`:
```js
  if (window.Projections) Projections.renderMovers(state.currentEid, document.getElementById('movers-panel'));
```

- [ ] **Step 2: CSS**
```css
    #movers-panel { margin: 12px 16px 0; background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; }
    #movers-panel summary { cursor: pointer; padding: 10px 14px; font-weight: 600; }
    .movers-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    .movers-table td, .movers-table th { padding: 6px 10px; border-top: 1px solid #1e293b; text-align: left; }
    .movers-table a { color: #7dd3fc; text-decoration: none; }
```

- [ ] **Step 3: renderMovers**
```js
  async function renderMovers(eid, mount) {
    if (!mount) return;
    const el = S.enabled && S.manifest.elections[String(eid)];
    if (!el || !el.movers) { mount.hidden = true; return; }
    const data = await load(el.movers);
    if (!data || !Array.isArray(data.rows) || !data.rows.length) { mount.hidden = true; return; }
    const rows = data.rows.slice(0, 10);
    const collapsed = localStorage.getItem('projMoversCollapsed') === '1';
    const m = x => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}`;
    mount.hidden = false;
    mount.innerHTML = `<details ${collapsed ? '' : 'open'}><summary>Movers — races the model expects to shift most</summary>
      <table class="movers-table"><thead><tr><th>Contest</th><th>Leader</th><th>Now</th><th>Projected</th><th>Flip</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td><a href="#/${eid}/${r.contest_id}">${escHtml(r.title)}</a></td><td>${escHtml(r.leader)}</td>
        <td>${m(r.current_margin)}</td><td>${m(r.projected_margin.mean)} (${m(r.projected_margin.p05)}…${m(r.projected_margin.p95)})</td>
        <td>${Math.round(r.p_flip * 100)}%</td></tr>`).join('')}</tbody></table>
      <div class="proj-caveat" style="padding:6px 14px">Margins are leader minus runner-up, in points. Model estimates.</div></details>`;
    mount.querySelector('details').addEventListener('toggle', ev => localStorage.setItem('projMoversCollapsed', ev.target.open ? '0' : '1'));
  }
```

- [ ] **Step 4: Verify; stage; user commits** `feat: movers panel`

---

### Task 5: Docs, final checks, PR

**Goal:** Document the switch, run the manual test matrix, open the PR from `modeling` to `main`.

**Files:**
- Modify: `README.md`, `CLAUDE.md`

**Acceptance Criteria:**
- [ ] README has a "Projections" section explaining `config.json`, `?projections=off`, and that the data comes from a separate model repo
- [ ] CLAUDE.md lists `config.json`, `projections.js`, and `notify-modeling.yml`
- [ ] Manual matrix passes: switch on with real URL (after lavote_modeling Task 10 publishes), switch off, `?projections=off`, remote 404, non-published contest
- [ ] PR opened with `gh pr create --base main --head modeling`

**Steps:**

- [ ] **Step 1: README section**
```markdown
## Projections

When `config.json` has `projections.enabled: true`, the viewer fetches model projections from the
URL in `projections.url` (a separate, private modeling repo publishes them to GitHub Pages) and shows
a "Projection" section on contests the model marks publishable, plus a "Movers" panel on the index.
Set `enabled` to `false` and commit to hide all projections within a minute. `?projections=off` in the
URL disables them for one session; `?projections=on` forces the fetch even when disabled (for testing).
```

- [ ] **Step 2: CLAUDE.md additions** under "Election Results Viewer": the three files, the gating rule, and "scrape.py is never involved in projections".

- [ ] **Step 3: Run the matrix; stage; user commits** `docs: projections switch and files`

- [ ] **Step 4: PR**
```bash
git -C /Users/bckohan/Development/elections/lavote_scrape-modeling push -u origin modeling
gh pr create --repo bckohan/lavote_scrape --base main --head modeling --title "Render model projections behind a switch" --body "..."
```
Merge when lavote_modeling's Pages is live and the matrix passes with the real URL. Until merged, the public site shows no projections.
