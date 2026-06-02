# Election Results Time Series Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static GitHub Pages site (`index.html`) that visualises LA County election result drops as time series per contest, with a scraper-maintained `index.json` manifest to make the files discoverable.

**Architecture:** Single `index.html` served from repo root on the `main` branch; Chart.js from CDN, no build step. The scraper maintains `index.json` (keyed by election ID) to tell the page what files exist. Two screens: a contest index and a per-contest detail with a cumulative-share line chart stacked above a per-drop batch composition bar chart.

**Tech Stack:** Python (scraper), vanilla JS, Chart.js 4.4, CSS (dark theme, mobile-first), GitHub Pages.

---

## File Map

| File | Change | Responsibility |
|---|---|---|
| `lavote_scrape/scrape.py` | Modify | `update_index()`, `backfill_index()`, updated `git_commit()` |
| `index.json` | Create (at runtime) | Manifest of elections and their result files |
| `index.html` | Create | Full single-page viewer app |
| `CLAUDE.md` | Modify | Add local dev server note |

---

## Task 0: Scraper — index manifest

**Goal:** Add `update_index()` and `backfill_index()` to the scraper so `index.json` is kept in sync with every file write, and backfilled automatically for existing elections on startup.

**Files:**
- Modify: `lavote_scrape/scrape.py`
- Creates at runtime: `index.json`

**Acceptance Criteria:**
- [ ] After `uv run scrape 4338 --max-runtime 5 --no-moo`, `index.json` exists with a valid entry for `4338`
- [ ] `index.json` also has a backfilled entry for `4324` with all 30 result files listed
- [ ] `git_commit` stages `index.json` alongside the result file

**Verify:** `uv run scrape 4338 --max-runtime 5 --no-moo --delay 1` → then `python3 -c "import json; d=json.load(open('index.json')); print(list(d.keys()), len(d['4324']['result_files']))"` → `['4324', '4338'] 30`

**Steps:**

- [ ] **Step 1: Add `update_index()` and `backfill_index()` above `git_commit` in `scrape.py`**

```python
def update_index(
    eid: int,
    title: str = None,
    election_date: str = None,
    meta_file: str = None,
    result_file: str = None,
):
    path = Path("index.json")
    index = json.loads(path.read_text()) if path.exists() else {}
    key = str(eid)
    entry = index.setdefault(
        key, {"title": "", "election_date": "", "meta_file": "", "result_files": []}
    )
    if title is not None:
        entry["title"] = title
    if election_date is not None:
        entry["election_date"] = election_date
    if meta_file is not None:
        entry["meta_file"] = meta_file
    if result_file and result_file not in entry["result_files"]:
        entry["result_files"].append(result_file)
    path.write_text(json.dumps(index, indent=2))


def backfill_index(eid: int):
    path = Path("index.json")
    index = json.loads(path.read_text()) if path.exists() else {}
    if str(eid) in index:
        return
    meta_file = f"election_{eid}.json"
    if not Path(meta_file).exists():
        return
    meta = json.loads(Path(meta_file).read_text())
    data = meta["Data"]
    update_index(
        eid,
        title=data["Title"],
        election_date=data["Date"][:10],
        meta_file=meta_file,
    )
    for f in sorted(glob(f"{eid}_*.json")):
        update_index(eid, result_file=f)
```

- [ ] **Step 2: Update `git_commit` to also stage `index.json`**

Replace the existing `git_commit` function body:

```python
def git_commit(filename: str):
    """Stage, commit and push a results file together with the updated index."""
    try:
        subprocess.run(["git", "add", filename, "index.json"], check=True)
        subprocess.run(
            ["git", "commit", "-m", f"Add results {filename}"], check=True
        )
        subprocess.run(["git", "push"], check=True)
        print(f"Committed {filename}")
    except subprocess.CalledProcessError as e:
        print(f"git commit/push failed: {e}")
```

- [ ] **Step 3: Wire `backfill_index` and `update_index` into `scrape()`**

At the top of `scrape()`, after the `last_timestamp` block and before `election_file =`, add:

```python
    backfill_index(eid)
```

After `json.dump(election, f)` in the election metadata save block, add:

```python
        update_index(
            eid,
            title=election["Data"]["Title"],
            election_date=election["Data"]["Date"][:10],
            meta_file=election_file,
        )
```

After `json.dump(results, f)` in the poll loop, add:

```python
            update_index(eid, result_file=filename)
```

- [ ] **Step 4: Verify**

Run: `uv run scrape 4338 --max-runtime 5 --no-moo --delay 1`

Then check:
```bash
python3 -c "
import json
d = json.load(open('index.json'))
print('elections:', list(d.keys()))
print('4324 files:', len(d['4324']['result_files']))
print('4324 title:', d['4324']['title'])
print('4338 meta:', d['4338']['meta_file'])
"
```

Expected output:
```
elections: ['4324', '4338']
4324 files: 30
4324 title: General Election
4338 meta: election_4338.json
```

- [ ] **Step 5: Commit**

```bash
git add lavote_scrape/scrape.py index.json
git commit -m "Add update_index/backfill_index and keep index.json in sync with scraper"
```

---

## Task 1: `index.html` — skeleton, CSS, and data loading

**Goal:** Create `index.html` with the full page structure, dark-theme CSS, and all data-loading JS functions. The page renders a loading state then logs the parsed election data to the console.

**Files:**
- Create: `index.html`

**Acceptance Criteria:**
- [ ] `python3 -m http.server 8000` + open `http://localhost:8000/` shows "Loading…" then no errors in DevTools console
- [ ] `window.__state.elections` contains loaded data for the default election
- [ ] `contestById` has at least 20 contests; `series` has a time series for each

**Verify:** Open DevTools → Console, run `Object.keys(window.__state.elections['4338'].contestById).length` → number > 0

**Steps:**

- [ ] **Step 1: Create `index.html` with structure and CSS**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LA County Election Results</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f0f1a; color: #e2e8f0; min-height: 100vh; }

    /* ── Header ── */
    .site-header { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: #0a0a14; border-bottom: 1px solid #1e1e30; flex-wrap: wrap; }
    .site-header h1 { font-size: 1rem; font-weight: 600; flex: 1; white-space: nowrap; }
    #election-select { background: #1a1a2e; color: #e2e8f0; border: 1px solid #2a2a40; border-radius: 6px; padding: 5px 10px; font-size: 0.85rem; cursor: pointer; }

    /* ── Search ── */
    .search-wrap { padding: 10px 16px; border-bottom: 1px solid #1a1a2e; }
    #search-input { width: 100%; background: #1a1a2e; color: #e2e8f0; border: 1px solid #2a2a40; border-radius: 6px; padding: 7px 12px; font-size: 0.9rem; }
    #search-input::placeholder { color: #4a5568; }
    #search-input:focus { outline: none; border-color: #3b82f6; }

    /* ── Contest list ── */
    .contest-group.hidden { display: none; }
    .group-header { padding: 10px 16px 3px; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #475569; }
    .contest-row { display: flex; align-items: center; padding: 10px 16px; border-bottom: 1px solid #141420; cursor: pointer; gap: 10px; min-height: 52px; text-decoration: none; color: inherit; }
    .contest-row:hover { background: #15152a; }
    .contest-row.hidden { display: none; }
    .contest-info { flex: 1; min-width: 0; }
    .contest-title { display: block; font-size: 0.82rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .contest-leader { display: block; font-size: 0.72rem; color: #64748b; margin-top: 2px; }
    .match-note { display: block; font-size: 0.68rem; color: #3b82f6; margin-top: 2px; font-style: italic; }
    .sparkline-canvas { flex-shrink: 0; display: block; }

    /* ── Detail screen ── */
    .detail-header { display: flex; align-items: center; gap: 10px; padding: 11px 16px; background: #0a0a14; border-bottom: 1px solid #1e1e30; flex-wrap: wrap; }
    #back-btn { background: none; border: 1px solid #2a2a40; color: #94a3b8; padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 0.82rem; white-space: nowrap; flex-shrink: 0; }
    #back-btn:hover { background: #1a1a2e; color: #e2e8f0; }
    .detail-meta { min-width: 0; }
    .detail-meta h2 { font-size: 0.92rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .detail-election-name { font-size: 0.72rem; color: #64748b; }
    .chart-section { padding: 14px 16px 0; }
    .chart-section + .chart-section { padding-top: 14px; }
    .chart-label { font-size: 0.68rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #475569; margin-bottom: 6px; }
    .annotation { padding: 6px 16px 14px; font-size: 0.72rem; color: #475569; }

    /* ── Loading / error ── */
    .status-msg { padding: 32px 16px; text-align: center; color: #475569; font-size: 0.9rem; }

    @media (min-width: 600px) {
      .site-header { padding: 12px 24px; }
      .search-wrap { padding: 10px 24px; }
      .group-header { padding: 10px 24px 3px; }
      .contest-row { padding: 10px 24px; }
      .detail-header { padding: 11px 24px; }
      .chart-section { padding: 16px 24px 0; }
      .annotation { padding: 6px 24px 16px; }
    }
  </style>
</head>
<body>

<!-- Index screen -->
<div id="screen-index">
  <header class="site-header">
    <h1>LA County Election Results</h1>
    <select id="election-select"></select>
  </header>
  <div class="search-wrap">
    <input type="search" id="search-input" placeholder="Search contests or candidates…" autocomplete="off">
  </div>
  <main id="contest-list"><p class="status-msg">Loading…</p></main>
</div>

<!-- Detail screen -->
<div id="screen-detail" hidden>
  <header class="detail-header">
    <button id="back-btn">← Back</button>
    <div class="detail-meta">
      <h2 id="detail-title"></h2>
      <span class="detail-election-name" id="detail-election-name"></span>
    </div>
  </header>
  <div id="detail-body"></div>
</div>

<script>
// ─────────────────────────── Constants ───────────────────────────

const PARTY_COLORS = {
  'Democratic':            '#3b82f6',
  'Republican':            '#ef4444',
  'Green':                 '#22c55e',
  'Libertarian':           '#eab308',
  'Peace and Freedom':     '#a855f7',
  'American Independent':  '#f97316',
  'No Party Preference':   '#94a3b8',
};
const FALLBACK_COLORS = ['#60a5fa','#f472b6','#34d399','#fbbf24','#a78bfa','#fb923c','#4ade80','#e879f9'];
const OTHERS_COLOR = '#6b7280';

function candidateColor(party, index) {
  return PARTY_COLORS[party] || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

// ─────────────────────────── State ───────────────────────────────

const state = {
  index: null,       // raw index.json: { eid: { title, election_date, meta_file, result_files } }
  currentEid: null,  // string
  elections: {},     // eid -> { candidateById, contestById, groupOrder, series }
};
window.__state = state; // expose for dev verification

// ─────────────────────────── Utilities ───────────────────────────

function encodeFilename(f) {
  return f.replace(/ /g, '%20');
}

function parseLabel(filename) {
  const m = filename.match(/_(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/);
  if (!m) return filename;
  const [, date, time] = m;
  const [, mo, dy] = date.split('-');
  return `${parseInt(mo)}/${parseInt(dy)} ${time}`;
}

// ─────────────────────────── Data loading ────────────────────────

async function loadIndex() {
  const resp = await fetch('index.json');
  if (!resp.ok) throw new Error(`index.json: ${resp.status}`);
  state.index = await resp.json();
}

function buildLookups(meta) {
  const candidateById = new Map();  // id -> { name, party }
  const contestById   = new Map();  // id -> { title, groupName, candidateIds }
  const groupOrder    = [];         // [{ name, contestIds }]

  for (const group of meta.Data.ContestGroups) {
    const contestIds = [];
    for (const contest of group.Contests) {
      const candidateIds = [];
      for (const c of contest.Candidates) {
        candidateById.set(c.ID, { name: c.Name, party: c.Party || '' });
        candidateIds.push(c.ID);
      }
      contestById.set(contest.ID, {
        title: contest.Title,
        groupName: group.Name,
        candidateIds,
      });
      contestIds.push(contest.ID);
    }
    groupOrder.push({ name: group.Name, contestIds });
  }

  return { candidateById, contestById, groupOrder };
}

function buildTimeSeries(filenames, responses, contestById) {
  // Pair filenames with valid (array-Data) responses and sort by filename
  const drops = filenames
    .map((f, i) => ({ filename: f, resp: responses[i] }))
    .filter(({ resp }) => resp && Array.isArray(resp.Data))
    .sort((a, b) => a.filename < b.filename ? -1 : 1);

  // For each drop, build candidateId -> votes lookup
  const parsedDrops = drops.map(({ filename, resp }) => {
    const voteMap = new Map();
    for (const row of resp.Data) {
      if (row.ReferenceType === 'CAND') voteMap.set(row.ReferenceID, row.Value);
    }
    return { ts: parseLabel(filename), voteMap };
  });

  // Build per-contest time series
  const series = new Map();
  for (const [contestId, contest] of contestById) {
    series.set(contestId, parsedDrops.map(({ ts, voteMap }) => {
      const votes = {};
      for (const cid of contest.candidateIds) votes[cid] = voteMap.get(cid) ?? 0;
      return { ts, votes };
    }));
  }

  return series;
}

async function loadElection(eid) {
  if (state.elections[eid]) return state.elections[eid];

  const entry = state.index[eid];
  const [meta, ...resultResps] = await Promise.all([
    fetch(encodeFilename(entry.meta_file)).then(r => r.json()),
    ...entry.result_files.map(f =>
      fetch(encodeFilename(f)).then(r => r.json()).catch(() => null)
    ),
  ]);

  const { candidateById, contestById, groupOrder } = buildLookups(meta);
  const series = buildTimeSeries(entry.result_files, resultResps, contestById);

  state.elections[eid] = { candidateById, contestById, groupOrder, series,
                           title: entry.title, election_date: entry.election_date };
  return state.elections[eid];
}

// ─────────────────────────── Router + init ───────────────────────

function parseHash() {
  const hash = location.hash.replace(/^#\/?/, '');
  if (!hash) return { screen: 'index' };
  const parts = hash.split('/');
  if (parts.length === 2) return { screen: 'detail', eid: parts[0], contestId: parseInt(parts[1]) };
  return { screen: 'index' };
}

async function route() {
  const { screen, eid, contestId } = parseHash();

  if (screen === 'detail') {
    const resolvedEid = eid || state.currentEid;
    if (!state.elections[resolvedEid]) await loadElection(resolvedEid);
    renderDetail(resolvedEid, contestId);
  } else {
    if (!state.elections[state.currentEid]) await loadElection(state.currentEid);
    renderIndex();
  }
}

async function init() {
  try {
    await loadIndex();

    // Default to most recent election (highest numeric eid)
    const eids = Object.keys(state.index).sort((a, b) => parseInt(b) - parseInt(a));
    state.currentEid = eids[0];

    // Populate election dropdown
    const sel = document.getElementById('election-select');
    for (const e of eids) {
      const opt = document.createElement('option');
      opt.value = e;
      opt.textContent = `${state.index[e].title} (${state.index[e].election_date})`;
      if (e === state.currentEid) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', async () => {
      state.currentEid = sel.value;
      location.hash = '#/';
      if (!state.elections[state.currentEid]) await loadElection(state.currentEid);
      renderIndex();
    });

    document.getElementById('search-input').addEventListener('input', e => {
      filterContests(e.target.value);
    });

    document.getElementById('back-btn').addEventListener('click', () => {
      location.hash = '#/';
    });

    window.addEventListener('hashchange', route);
    await route();
  } catch (err) {
    document.getElementById('contest-list').innerHTML =
      `<p class="status-msg">Error loading data: ${err.message}</p>`;
    console.error(err);
  }
}

// ─────────────────────────── Stubs (filled in Tasks 2 & 3) ──────

function renderIndex() {
  console.log('renderIndex — election:', state.currentEid,
    'contests:', state.elections[state.currentEid]?.contestById.size);
}

function renderDetail(eid, contestId) {
  console.log('renderDetail — eid:', eid, 'contestId:', contestId);
}

function filterContests(query) {}

// ─────────────────────────── Boot ────────────────────────────────

init();
</script>
</body>
</html>
```

- [ ] **Step 2: Run and verify in browser**

Start a local server from the repo root:
```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/` in a browser. Open DevTools → Console tab.

Expected: no errors, then run:
```javascript
Object.keys(window.__state.elections).length        // > 0
window.__state.elections['4338'].contestById.size   // > 0
window.__state.elections['4324'].series.size        // matches contestById.size
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "Add index.html skeleton with data loading"
```

---

## Task 2: Index screen — contest list, search, sparklines

**Goal:** Implement `renderIndex()` and `filterContests()` so the contest index screen shows grouped contests with sparklines and real-time search by contest title or candidate name.

**Files:**
- Modify: `index.html` (replace the `renderIndex` and `filterContests` stubs)

**Acceptance Criteria:**
- [ ] Contests appear grouped under section headers (e.g. "Governor", "State Legislature")
- [ ] Each row shows contest title, current leader with %, and a sparkline
- [ ] Typing "villaraigosa" in search filters to contests containing that candidate and shows the name as a match note
- [ ] Clicking a contest row navigates to `#/{eid}/{contestId}`

**Verify:** Load page, type "governor" in search, see only Governor-group contests remain visible.

**Steps:**

- [ ] **Step 1: Add `getLeader` and `drawSparkline` helpers before the stubs**

```javascript
function getLeader(contestId, electionData) {
  const { candidateById, contestById, series } = electionData;
  const contest = contestById.get(contestId);
  const points = series.get(contestId);
  if (!points || points.length === 0) return { name: '—', pct: 0, sparkData: [] };

  const lastVotes = points[points.length - 1].votes;
  const total = Object.values(lastVotes).reduce((s, v) => s + v, 0);

  let topId = null, topVotes = -1;
  for (const cid of contest.candidateIds) {
    if ((lastVotes[cid] ?? 0) > topVotes) { topVotes = lastVotes[cid] ?? 0; topId = cid; }
  }

  const cand = topId ? candidateById.get(topId) : null;
  const pct = total > 0 ? (topVotes / total * 100).toFixed(1) : 0;

  // Sparkline: leading candidate's % at each drop (downsample to ≤8 points)
  const step = Math.max(1, Math.floor(points.length / 8));
  const sparkData = points
    .filter((_, i) => i % step === 0 || i === points.length - 1)
    .map(p => {
      const t = Object.values(p.votes).reduce((s, v) => s + v, 0);
      return t > 0 ? (p.votes[topId] ?? 0) / t * 100 : 0;
    });

  return { name: cand?.name ?? '—', pct, sparkData, party: cand?.party ?? '' };
}

function drawSparkline(canvas, data, party) {
  new Chart(canvas, {
    type: 'line',
    data: {
      labels: data.map((_, i) => i),
      datasets: [{ data, borderColor: candidateColor(party, 0), borderWidth: 1.5,
                   pointRadius: 0, tension: 0.3, fill: false }],
    },
    options: {
      responsive: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } },
    },
  });
}
```

- [ ] **Step 2: Replace the `renderIndex` stub**

```javascript
function renderIndex() {
  document.getElementById('screen-index').hidden = false;
  document.getElementById('screen-detail').hidden = true;

  const eid = state.currentEid;
  const el = state.elections[eid];
  const list = document.getElementById('contest-list');
  list.innerHTML = '';

  for (const group of el.groupOrder) {
    const section = document.createElement('section');
    section.className = 'contest-group';
    section.dataset.group = group.name;

    const header = document.createElement('h3');
    header.className = 'group-header';
    header.textContent = group.name;
    section.appendChild(header);

    for (const contestId of group.contestIds) {
      const contest = el.contestById.get(contestId);
      const { name, pct, sparkData, party } = getLeader(contestId, el);

      const row = document.createElement('div');
      row.className = 'contest-row';
      row.dataset.eid = eid;
      row.dataset.contestId = contestId;
      row.dataset.title = contest.title.toLowerCase();

      row.innerHTML = `
        <div class="contest-info">
          <span class="contest-title">${contest.title}</span>
          <span class="contest-leader">${name} ${pct}%</span>
        </div>
        <canvas class="sparkline-canvas" width="72" height="28"></canvas>
      `;

      row.addEventListener('click', () => {
        location.hash = `#/${eid}/${contestId}`;
      });

      section.appendChild(row);

      // Draw sparkline after element is in DOM
      requestAnimationFrame(() => {
        const canvas = row.querySelector('.sparkline-canvas');
        if (sparkData.length > 1) drawSparkline(canvas, sparkData, party);
      });
    }

    list.appendChild(section);
  }

  // Re-apply current search if any
  const q = document.getElementById('search-input').value;
  if (q) filterContests(q);
}
```

- [ ] **Step 3: Replace the `filterContests` stub**

```javascript
function filterContests(query) {
  const q = query.toLowerCase().trim();
  const eid = state.currentEid;
  const el = state.elections[eid];

  document.querySelectorAll('.contest-row').forEach(row => {
    const contestId = parseInt(row.dataset.contestId);
    const contest = el?.contestById.get(contestId);

    // Remove any previous match note
    row.querySelector('.match-note')?.remove();

    if (!q) {
      row.classList.remove('hidden');
      return;
    }

    const titleMatch = row.dataset.title.includes(q);
    const matchingCands = (contest?.candidateIds || [])
      .map(cid => el.candidateById.get(cid))
      .filter(c => c?.name.toLowerCase().includes(q));

    const visible = titleMatch || matchingCands.length > 0;
    row.classList.toggle('hidden', !visible);

    if (visible && !titleMatch && matchingCands.length > 0) {
      const note = document.createElement('span');
      note.className = 'match-note';
      note.textContent = matchingCands.map(c => c.name).join(', ');
      row.querySelector('.contest-info').appendChild(note);
    }
  });

  // Hide group headers whose contests are all hidden
  document.querySelectorAll('.contest-group').forEach(group => {
    const anyVisible = [...group.querySelectorAll('.contest-row')]
      .some(r => !r.classList.contains('hidden'));
    group.classList.toggle('hidden', !anyVisible);
  });
}
```

- [ ] **Step 4: Verify in browser**

Reload `http://localhost:8000/`. Expected:
- Contests appear in groups with sparklines on the right
- Typing "bass" in search shows only Mayor contests (Karen Ruth Bass) with a blue match-note
- Clearing search restores all contests
- Clicking a row changes the URL hash (detail screen stub logs to console)

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "Add contest index screen with search and sparklines"
```

---

## Task 3: Detail screen — dual charts

**Goal:** Implement `renderDetail()` with the cumulative-share line chart and per-drop stacked batch bar chart, including the 5% filter and "All Others" aggregate.

**Files:**
- Modify: `index.html` (replace the `renderDetail` stub; add helpers above it)

**Acceptance Criteria:**
- [ ] Clicking PRESIDENT AND VICE PRESIDENT in the 2024 election shows a line chart with Harris and Trump lines (others aggregated into dashed "All Others" if <5%)
- [ ] The batch bar chart shows one bar per drop from the 2nd drop onward
- [ ] Annotation reads "Showing N of M candidates (≥5% final share)…"
- [ ] Mobile: both charts are full-width and readable on a 375px wide screen
- [ ] Back button returns to index screen

**Verify:** Navigate to `#/4324/9857` (presidential contest). Both charts render. Resize browser to 375px wide — charts remain legible.

**Steps:**

- [ ] **Step 1: Add `getQualifying`, `buildLineData`, and `buildBatchData` helpers before the `renderDetail` stub**

```javascript
function getQualifying(contestId, electionData) {
  const { contestById, series } = electionData;
  const contest = contestById.get(contestId);
  const points = series.get(contestId);
  if (!points || points.length === 0) return { qualified: [], others: [], contestTotal: 0 };

  const lastVotes = points[points.length - 1].votes;
  const contestTotal = contest.candidateIds.reduce((s, cid) => s + (lastVotes[cid] ?? 0), 0);

  const qualified = [], others = [];
  for (const cid of contest.candidateIds) {
    const final = lastVotes[cid] ?? 0;
    if (contestTotal > 0 && final / contestTotal >= 0.05) qualified.push(cid);
    else others.push(cid);
  }
  return { qualified, others, contestTotal };
}

function buildLineData(contestId, electionData) {
  const { candidateById, series } = electionData;
  const { qualified, others } = getQualifying(contestId, electionData);
  const points = series.get(contestId);

  const totalAt = p => Object.values(p.votes).reduce((s, v) => s + v, 0);

  const datasets = qualified.map((cid, i) => {
    const cand = candidateById.get(cid);
    return {
      label: cand.name,
      data: points.map(p => {
        const t = totalAt(p);
        return t > 0 ? +((p.votes[cid] ?? 0) / t * 100).toFixed(2) : 0;
      }),
      borderColor: candidateColor(cand.party, i),
      backgroundColor: 'transparent',
      borderWidth: 2,
      pointRadius: 3,
      tension: 0.3,
    };
  });

  if (others.length > 0) {
    datasets.push({
      label: 'All Others',
      data: points.map(p => {
        const t = totalAt(p);
        const ov = others.reduce((s, cid) => s + (p.votes[cid] ?? 0), 0);
        return t > 0 ? +(ov / t * 100).toFixed(2) : 0;
      }),
      borderColor: OTHERS_COLOR,
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderDash: [5, 3],
      pointRadius: 2,
      tension: 0.3,
    });
  }

  return { labels: points.map(p => p.ts), datasets };
}

function buildBatchData(contestId, electionData) {
  const { candidateById, series } = electionData;
  const { qualified, others } = getQualifying(contestId, electionData);
  const points = series.get(contestId);
  if (!points || points.length < 2) return null;

  const totalAt = p => Object.values(p.votes).reduce((s, v) => s + v, 0);

  function batchPct(p, prev, cids) {
    const batchTotal = totalAt(p) - totalAt(prev);
    if (batchTotal <= 0) return cids.map(() => 0);
    return cids.map(cid => {
      const delta = Math.max(0, (p.votes[cid] ?? 0) - (prev.votes[cid] ?? 0));
      return +(delta / batchTotal * 100).toFixed(2);
    });
  }

  const datasets = qualified.map((cid, i) => {
    const cand = candidateById.get(cid);
    const color = candidateColor(cand.party, i);
    return {
      label: cand.name,
      data: points.slice(1).map((p, ti) => batchPct(p, points[ti], [cid])[0]),
      backgroundColor: color + 'bb',
      borderColor: color,
      borderWidth: 0.5,
      stack: 'batch',
    };
  });

  if (others.length > 0) {
    datasets.push({
      label: 'All Others',
      data: points.slice(1).map((p, ti) => {
        const prev = points[ti];
        const batchTotal = totalAt(p) - totalAt(prev);
        if (batchTotal <= 0) return 0;
        const od = others.reduce((s, cid) =>
          s + Math.max(0, (p.votes[cid] ?? 0) - (prev.votes[cid] ?? 0)), 0);
        return +(od / batchTotal * 100).toFixed(2);
      }),
      backgroundColor: OTHERS_COLOR + '99',
      borderColor: OTHERS_COLOR,
      borderWidth: 0.5,
      stack: 'batch',
    });
  }

  return { labels: points.slice(1).map(p => p.ts), datasets };
}
```

- [ ] **Step 2: Add chart instance tracker and shared Chart.js options above the stubs**

```javascript
let activeCharts = [];

function destroyActiveCharts() {
  activeCharts.forEach(c => c.destroy());
  activeCharts = [];
}

const CHART_BASE_OPTS = {
  responsive: true,
  maintainAspectRatio: true,
  plugins: {
    legend: { labels: { color: '#94a3b8', boxWidth: 12, font: { size: 11 } } },
  },
  scales: {
    x: { ticks: { color: '#475569', font: { size: 10 }, maxTicksLimit: 8, maxRotation: 35 },
         grid: { color: '#1a1a2e' } },
    y: { ticks: { color: '#475569', font: { size: 10 }, callback: v => v + '%' },
         grid: { color: '#1a1a2e' } },
  },
};
```

- [ ] **Step 3: Replace the `renderDetail` stub**

```javascript
function renderDetail(eid, contestId) {
  destroyActiveCharts();

  const el = state.elections[eid];
  if (!el) return;
  const contest = el.contestById.get(contestId);
  if (!contest) return;

  document.getElementById('screen-index').hidden = true;
  document.getElementById('screen-detail').hidden = false;

  document.getElementById('detail-title').textContent = contest.title;
  document.getElementById('detail-election-name').textContent =
    `${el.title} · ${el.election_date}`;

  const { qualified, others } = getQualifying(contestId, el);
  const total = el.contestById.get(contestId).candidateIds.length;
  const body = document.getElementById('detail-body');
  body.innerHTML = '';

  // ── Line chart ──
  const lineSection = document.createElement('div');
  lineSection.className = 'chart-section';
  lineSection.innerHTML = '<div class="chart-label">Cumulative vote share</div><canvas id="chart-line"></canvas>';
  body.appendChild(lineSection);

  const lineData = buildLineData(contestId, el);
  activeCharts.push(new Chart(document.getElementById('chart-line'), {
    type: 'line',
    data: lineData,
    options: {
      ...CHART_BASE_OPTS,
      scales: {
        ...CHART_BASE_OPTS.scales,
        y: { ...CHART_BASE_OPTS.scales.y, min: 0, max: 100,
             ticks: { ...CHART_BASE_OPTS.scales.y.ticks, callback: v => v + '%' } },
      },
    },
  }));

  // ── Batch bar chart ──
  const batchData = buildBatchData(contestId, el);
  if (batchData) {
    const barSection = document.createElement('div');
    barSection.className = 'chart-section';
    barSection.innerHTML = '<div class="chart-label">Batch composition (votes added per drop)</div><canvas id="chart-bar"></canvas>';
    body.appendChild(barSection);

    activeCharts.push(new Chart(document.getElementById('chart-bar'), {
      type: 'bar',
      data: batchData,
      options: {
        ...CHART_BASE_OPTS,
        scales: {
          x: { ...CHART_BASE_OPTS.scales.x, stacked: true },
          y: { ...CHART_BASE_OPTS.scales.y, stacked: true, min: 0, max: 100,
               ticks: { ...CHART_BASE_OPTS.scales.y.ticks, callback: v => v + '%' } },
        },
      },
    }));
  }

  // ── Annotation ──
  const ann = document.createElement('p');
  ann.className = 'annotation';
  if (others.length === 0) {
    ann.textContent = `Showing all ${qualified.length} candidates.`;
  } else {
    ann.textContent =
      `Showing ${qualified.length} of ${total} candidates (≥5% final share). ` +
      `${others.length} candidate${others.length > 1 ? 's' : ''} aggregated into "All Others".`;
  }
  body.appendChild(ann);
}
```

- [ ] **Step 4: Verify in browser**

Navigate to `http://localhost:8000/#/4324/9857` (presidential contest, 2024 election).

Expected:
- Header shows "PRESIDENT AND VICE PRESIDENT · General Election · 2024-11-05"
- Line chart shows Harris and Trump lines; others below 5% may appear as dashed "All Others"
- Batch bars show 28 bars (drops 2–29), stacked
- Annotation shows correct counts
- Resize to 375px — both charts are full-width and legible

Also test a primary contest with many candidates: `http://localhost:8000/#/4338/{contestId}` where `contestId` is the GOVERNOR contest ID. Find it with:
```javascript
[...window.__state.elections['4338'].contestById.entries()].find(([,v]) => v.title === 'GOVERNOR')[0]
```

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "Add contest detail screen with cumulative share and batch composition charts"
```

---

## Task 4: GitHub Pages + CLAUDE.md

**Goal:** Enable the viewer on GitHub Pages and document the local dev workflow.

**Files:**
- Modify: `CLAUDE.md`

**Acceptance Criteria:**
- [ ] `CLAUDE.md` has a "Viewer" section with local dev and GitHub Pages instructions
- [ ] GitHub Pages is enabled for the repo (main branch, root folder) — user action

**Verify:** After enabling GitHub Pages, `https://{user}.github.io/lavote_scrape/` loads the viewer.

**Steps:**

- [ ] **Step 1: Add viewer section to `CLAUDE.md`**

Add to `CLAUDE.md`:

```markdown
## Viewer

A static GitHub Pages site served from `index.html` at the repo root.

**Local dev** (fetch requires same-origin, can't use `file://`):
```bash
python3 -m http.server 8000
# open http://localhost:8000/
```

**GitHub Pages:** In the repo Settings → Pages, set Source to "Deploy from a branch", branch `main`, folder `/root`. The viewer will be live at `https://{username}.github.io/lavote_scrape/`.
```

- [ ] **Step 2: Enable GitHub Pages** (manual step — user action)

In the GitHub repo → Settings → Pages:
- Source: "Deploy from a branch"
- Branch: `main`
- Folder: `/ (root)`
- Click Save

- [ ] **Step 3: Commit CLAUDE.md**

```bash
git add CLAUDE.md
git commit -m "Document viewer local dev and GitHub Pages setup"
```
