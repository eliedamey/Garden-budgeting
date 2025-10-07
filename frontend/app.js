// ------------------ STATE & PERSISTENCE ------------------
const LS_KEY = 'gardenBudgeting:v1';
const newId = () => Math.random().toString(36).slice(2, 10);

const defaultState = () => ({
  monthStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10),
  points: 0,
  buckets: [], // {id,type:'spending'|'savings'|'reserve',name,monthlyLimit,spentThisMonth,goal,savedTotal,lastMilestone,plantPoints}
  transactions: [] // {id,merchant,amount,bucketId,occurredAtISO}
});

function load() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || defaultState(); }
  catch { return defaultState(); }
}
function save() { localStorage.setItem(LS_KEY, JSON.stringify(state)); }

let state = load();

// Ensure exactly one reserve bucket exists
function ensureReserve() {
  const has = state.buckets.find(b => b.type === 'reserve');
  if (!has) {
    state.buckets.push({ id: newId(), type: 'reserve', name: 'Reserve', savedTotal: 0 });
    save();
  }
}
ensureReserve();

// ------------------ NAV ------------------
const tabs = Array.from(document.querySelectorAll('.tab-btn'));
const tabViews = {
  dashboard: document.getElementById('tab-dashboard'),
  buckets: document.getElementById('tab-buckets'),
  transactions: document.getElementById('tab-transactions'),
  garden: document.getElementById('tab-garden'),
  settings: document.getElementById('tab-settings'),
};
tabs.forEach(btn => btn.addEventListener('click', () => {
  tabs.forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const name = btn.dataset.tab;
  Object.entries(tabViews).forEach(([k, el]) => el.style.display = (k === name ? 'grid' : 'none'));
  renderAll();
}));

// ------------------ DOM GETTERS ------------------
const $ = (id) => document.getElementById(id);

// Dashboard els
const monthLabel = $('monthLabel');
const sumSpent = $('sumSpent');
const sumSaved = $('sumSaved');
const reserveBal = $('reserveBal');
const pointsBal = $('pointsBal');
const dashSpending = $('dashSpending');
const dashSavings = $('dashSavings');

// Buckets els
const bkName = $('bkName');
const bkType = $('bkType');
const bkLimit = $('bkLimit');
const bkGoal = $('bkGoal');
const bkLimitWrap = $('bkLimitWrap');
const bkGoalWrap = $('bkGoalWrap');
const bkCreate = $('bkCreate');
const bkSeed = $('bkSeed');
const bkList = $('bkList');

// Tx els
const txMerchant = $('txMerchant');
const txAmount = $('txAmount');
const txBucket = $('txBucket');
const txDate = $('txDate');
const txAdd = $('txAdd');
const txClear = $('txClear');
const txList = $('txList');
const txFilterBucket = $('txFilterBucket');
const txFilterReset = $('txFilterReset');

// Garden els
const gdPoints = $('gdPoints');
const gardenGrid = $('gardenGrid');

// Settings els
const closeMonthBtn = $('closeMonth');
const wipeDataBtn = $('wipeData');
const stMonth = $('stMonth');
const stPoints = $('stPoints');

// ------------------ HELPERS ------------------
const fmt$ = n => '$' + Number(n || 0).toFixed(2);
const todayISO = () => new Date().toISOString().slice(0,10);

function bucketById(id) { return state.buckets.find(b => b.id === id); }
function reserveBucket() { return state.buckets.find(b => b.type === 'reserve'); }

function totals() {
  let spent = 0, saved = 0;
  for (const b of state.buckets) {
    if (b.type === 'spending') spent += Number(b.spentThisMonth || 0);
    if (b.type === 'savings') saved += Number(b.savedTotal || 0);
  }
  return { spent, saved, reserve: Number(reserveBucket()?.savedTotal || 0) };
}

// ------------------ RENDERERS ------------------
function renderDashboard() {
  const { spent, saved, reserve } = totals();
  monthLabel.textContent = new Date(state.monthStart).toLocaleString(undefined, { month: 'long', year: 'numeric' });
  sumSpent.textContent = fmt$(spent);
  sumSaved.textContent = fmt$(saved);
  reserveBal.textContent = fmt$(reserve);
  pointsBal.textContent = String(state.points);

  dashSpending.innerHTML = state.buckets
    .filter(b => b.type === 'spending')
    .map(b => {
      const usedPct = b.monthlyLimit ? Math.min(100, Math.round((Number(b.spentThisMonth||0) / Number(b.monthlyLimit)) * 100)) : 0;
      const remaining = (Number(b.monthlyLimit||0) - Number(b.spentThisMonth||0));
      return `<div class="item">
          <div class="row space-between">
            <strong>${b.name}</strong>
            <span class="badge">Limit: ${fmt$(b.monthlyLimit||0)}</span>
          </div>
          <div class="row space-between mono" style="margin-top:6px">
            <div>Spent: ${fmt$(b.spentThisMonth||0)}</div>
            <div>Remaining: ${fmt$(remaining)}</div>
          </div>
          <div class="progress" style="margin-top:6px"><div class="fill ${remaining<0?'over':''}" style="width:${usedPct}%"></div></div>
        </div>`;
    }).join('');

  dashSavings.innerHTML = state.buckets
    .filter(b => b.type === 'savings')
    .map(b => {
      const pct = b.goal ? Math.min(100, Math.round((Number(b.savedTotal||0) / Number(b.goal)) * 100)) : 0;
      return `<div class="item">
          <div class="row space-between">
            <strong>${b.name}</strong>
            <span class="badge">Goal: ${fmt$(b.goal||0)}</span>
          </div>
          <div class="row space-between mono" style="margin-top:6px">
            <div>Saved: ${fmt$(b.savedTotal||0)}</div>
            <div>${pct}%</div>
          </div>
          <div class="progress" style="margin-top:6px"><div class="fill" style="width:${pct}%"></div></div>
        </div>`;
    }).join('');
}

function renderBuckets() {
  // Toggle inputs
  const t = bkType.value;
  bkLimitWrap.style.display = (t === 'spending') ? 'block' : 'none';
  bkGoalWrap.style.display  = (t === 'savings')  ? 'block' : 'none';

  bkList.innerHTML = state.buckets.map(b => {
    let meta = '';
    if (b.type === 'spending') meta = `Limit ${fmt$(b.monthlyLimit||0)} · Spent ${fmt$(b.spentThisMonth||0)}`;
    if (b.type === 'savings')  meta = `Goal ${fmt$(b.goal||0)} · Saved ${fmt$(b.savedTotal||0)}`;
    if (b.type === 'reserve')  meta = `Balance ${fmt$(b.savedTotal||0)}`;
    return `<div class="item">
      <div class="row space-between">
        <div>
          <strong>${b.name}</strong>
          <span class="badge">${b.type}</span>
        </div>
        <div class="row">
          <button class="btn secondary" data-edit="${b.id}">Edit</button>
          ${b.type!== 'reserve' ? `<button class="btn danger" data-del="${b.id}">Delete</button>`: ''}
        </div>
      </div>
      <div class="hint" style="margin-top:6px">${meta}</div>
    </div>`
  }).join('');

  // Wire edit/delete
  bkList.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.getAttribute('data-del');
    state.buckets = state.buckets.filter(b => b.id !== id);
    state.transactions = state.transactions.filter(t => t.bucketId !== id);
    save(); renderAll();
  }));

  bkList.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.getAttribute('data-edit');
    const b = bucketById(id);
    if (!b) return;
    const name = prompt('Rename bucket', b.name);
    if (name !== null && name.trim()) b.name = name.trim();
    if (b.type === 'spending') {
      const lim = prompt('Monthly limit', String(b.monthlyLimit||0));
      if (lim !== null) b.monthlyLimit = Number(lim)||0;
    }
    if (b.type === 'savings') {
      const goal = prompt('Savings goal', String(b.goal||0));
      if (goal !== null) b.goal = Number(goal)||0;
    }
    save(); renderAll();
  }));
}

function renderTx() {
  // Populate bucket selects
  const opts = state.buckets.map(b => `<option value="${b.id}">${b.name} (${b.type})</option>`).join('');
  txBucket.innerHTML = opts;
  txFilterBucket.innerHTML = `<option value="">All buckets</option>` + opts;
  if (!txDate.value) txDate.value = todayISO();

  const filterId = txFilterBucket.value;
  const list = state.transactions
    .slice()
    .sort((a,b)=> new Date(b.occurredAtISO) - new Date(a.occurredAtISO))
    .filter(t => !filterId || t.bucketId === filterId);

  txList.innerHTML = list.map(t => {
    const b = bucketById(t.bucketId);
    return `<div class="item row space-between">
      <div>
        <div><strong>${t.merchant || '(no merchant)'} </strong> <span class="hint">→ ${b?.name || 'Unknown'}</span></div>
        <div class="hint mono">${new Date(t.occurredAtISO).toLocaleString()}</div>
      </div>
      <div class="mono">${fmt$(t.amount)}</div>
    </div>`
  }).join('');
}

function renderGarden() {
  gdPoints.textContent = String(state.points);
  const stages = [
    {min:0, emoji:'🌱', name:'Seedling'},
    {min:50, emoji:'🌿', name:'Sprout'},
    {min:150, emoji:'🌳', name:'Tree'},
    {min:300, emoji:'🌲', name:'Majestic'}
  ];

  gardenGrid.innerHTML = state.buckets
    .filter(b => b.type !== 'reserve')
    .map(b => {
      const p = Number(b.plantPoints || 0);
      const stage = stages.slice().reverse().find(s => p >= s.min) || stages[0];
      return `<div class="col-3">
        <div class="plant">
          <div class="emoji">${stage.emoji}</div>
          <div class="label">${b.name} · ${p} pts — ${stage.name}</div>
        </div>
      </div>`
    }).join('');
}

function renderSettings() {
  stMonth.textContent = new Date(state.monthStart).toLocaleDateString();
  stPoints.textContent = String(state.points);
}

function renderAll() { renderDashboard(); renderBuckets(); renderTx(); renderGarden(); renderSettings(); save(); }

// ------------------ EVENT WIRING ------------------
bkType.addEventListener('change', renderBuckets);

bkCreate.addEventListener('click', () => {
  const name = (bkName.value||'').trim();
  if (!name) return alert('Enter a bucket name.');
  const type = bkType.value;
  if (type === 'spending') {
    const lim = Number(bkLimit.value||0);
    state.buckets.push({ id:newId(), type, name, monthlyLimit: lim, spentThisMonth:0 });
  } else if (type === 'savings') {
    const goal = Number(bkGoal.value||0);
    state.buckets.push({ id:newId(), type, name, goal, savedTotal:0, lastMilestone:0 });
  } else { // reserve
    const existing = reserveBucket();
    if (existing) return alert('Reserve bucket already exists.');
    state.buckets.push({ id:newId(), type:'reserve', name, savedTotal:0 });
  }
  bkName.value = ''; bkLimit.value=''; bkGoal.value='';
  save(); renderAll();
});

bkSeed.addEventListener('click', () => {
  // seed example buckets
  const already = state.buckets.filter(b=>b.type!=='reserve').length>0;
  if (already && !confirm('Seed demo data anyway?')) return;
  state.buckets = state.buckets.filter(b=>b.type==='reserve');
  state.buckets.push(
    { id:newId(), type:'spending', name:'Food', monthlyLimit:250, spentThisMonth:0 },
    { id:newId(), type:'spending', name:'Entertainment', monthlyLimit:100, spentThisMonth:0 },
    { id:newId(), type:'savings', name:'Emergency Fund', goal:1000, savedTotal:0, lastMilestone:0 }
  );
  state.transactions = [];
  save(); renderAll();
});

txAdd.addEventListener('click', () => {
  const merchant = (txMerchant.value||'').trim();
  const amount = Number(txAmount.value||0);
  const bucketId = txBucket.value;
  const dateISO = txDate.value || todayISO();
  if (!bucketId || !amount) return alert('Choose bucket and amount.');
  const b = bucketById(bucketId);
  if (!b) return alert('Bucket missing.');

  // Apply the transaction to the target pot
  if (b.type === 'spending') {
    b.spentThisMonth = Number(b.spentThisMonth||0) + amount;
  } else if (b.type === 'savings' || b.type === 'reserve') {
    b.savedTotal = Number(b.savedTotal||0) + amount;
  }

  // Record the transaction
  state.transactions.push({
    id: newId(),
    merchant,
    amount,
    bucketId,
    occurredAtISO: new Date(dateISO).toISOString()
  });

  // NEW: award 1 point for engaging with the app (adding a transaction)
  state.points = Number(state.points || 0) + 1;

  // Clear inputs and refresh
  txMerchant.value = '';
  txAmount.value = '';
  save();
  renderAll();
  // (optional) quick feedback
  // alert('+1 point!');
});

txClear.addEventListener('click', () => { txMerchant.value=''; txAmount.value=''; });
txFilterBucket.addEventListener('change', renderTx);
txFilterReset.addEventListener('click', () => { txFilterBucket.value=''; renderTx(); });

closeMonthBtn.addEventListener('click', () => {
  if (!confirm('Close month, award points, reset spending?')) return;
  awardPointsAndReset();
  save(); renderAll();
  alert('Month closed. Points awarded based on leftovers and milestones.');
});

wipeDataBtn.addEventListener('click', () => {
  if (!confirm('Wipe ALL local data?')) return;
  state = defaultState(); ensureReserve(); save(); renderAll();
});

// ------------------ REWARDS ENGINE ------------------
// Spending buckets (leftover tiers):
//   exact (0% leftover, not over): +10
//   >=5% leftover: +20
//   >=10% leftover: +35
//   >=20% leftover: +60
// Overspend: pull from reserve if available, then -20 points and small plant wilt

// Savings milestones since last close:
//   25%: +15, 50%: +30, 75%: +45, 100%: +80

function awardPointsAndReset() {
  let cyclePoints = 0;
  const res = reserveBucket();

  // Spending
  for (const b of state.buckets.filter(x => x.type==='spending')) {
    const lim = Number(b.monthlyLimit||0);
    const spent = Number(b.spentThisMonth||0);
    if (lim <= 0) continue;
    if (spent <= lim) {
      const leftover = lim - spent;
      const pct = leftover / lim;
      let pts = 0;
      if (pct === 0) pts = 10;        // exact use
      if (pct >= 0.05) pts = 20;
      if (pct >= 0.10) pts = 35;
      if (pct >= 0.20) pts = 60;
      cyclePoints += pts;
      b.plantPoints = Number(b.plantPoints||0) + pts;
    } else {
      const over = spent - lim;
      if (res) {
        const avail = Number(res.savedTotal||0);
        const covered = Math.min(over, avail);
        res.savedTotal = avail - covered;
      }
      cyclePoints -= 20;
      b.plantPoints = Math.max(0, Number(b.plantPoints||0) - 10);
    }
    // reset for next month
    b.spentThisMonth = 0;
  }

  // Savings
  for (const b of state.buckets.filter(x => x.type==='savings')) {
    const goal = Number(b.goal||0);
    const saved = Number(b.savedTotal||0);
    if (goal <= 0) continue;
    const pct = Math.min(1, saved / goal);
    const milestones = [0.25, 0.50, 0.75, 1.0];
    const awards = { 0.25:15, 0.5:30, 0.75:45, 1:80 };
    let last = Number(b.lastMilestone || 0);
    for (const m of milestones) {
      if (pct >= m && last < m) {
        const pts = awards[m] || 0;
        cyclePoints += pts;
        b.plantPoints = Number(b.plantPoints||0) + pts;
        last = m;
      }
    }
    b.lastMilestone = last;
  }

  state.points = Number(state.points||0) + cyclePoints;
  state.monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10);
}

// ------------------ INIT ------------------
renderAll();
