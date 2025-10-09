// ================= BASE STATE =================
const LS_KEY = 'garden:v2';
const $ = (id) => document.getElementById(id);
const todayISO = () => new Date().toISOString().slice(0,10);
const fmt$ = n => '$' + Number(n||0).toFixed(2);
const newId = () => Math.random().toString(36).slice(2,10);

// ---- Stages & Costs (Terrarium-inspired) ----
const STAGES = [
  { name:'Seedling', emoji:'🌱' }, // 0
  { name:'Sprout',   emoji:'🌿' }, // 1
  { name:'Bush',     emoji:'🌳' }, // 2
  { name:'Tree',     emoji:'🌲' }, // 3
  { name:'Majestic', emoji:'🌲✨' } // 4
];
const STAGE_COST = [0,20,50,100,200];
const isMaxStage = (b) => Number(b.stage||0) >= STAGES.length-1;
const nextStageCost = (b) => STAGE_COST[Math.min(Number(b.stage||0)+1, STAGE_COST.length-1)];

// ---- Savings milestones (instant + month close) ----
const SAVINGS_MILESTONES = [0.25,0.50,0.75,1.0];
const SAVINGS_AWARDS = { 0.25:15, 0.5:30, 0.75:45, 1.0:80 };

// ---- Default state ----
const defaultState = () => ({
  monthStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10),
  points: 0,
  incomeMonthly: 0,
  pots: [], // {id,name,type:'spending'|'savings'|'investment'|'reserve', monthlyLimit?, monthlyContrib?, goal?, savedTotal?, spentThisMonth?, stage, plantPoints, lastMilestone}
  txns: []  // {id,merchant,amount,potId,occurredAtISO}
});

let state = load();
ensureReserve();
renderAll();
wireEvents();

// ================= PERSIST =================
function load(){
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || defaultState(); }
  catch { return defaultState(); }
}
function save(){ localStorage.setItem(LS_KEY, JSON.stringify(state)); }

// ================= CORE HELPERS =================
const potById = (id) => state.pots.find(p => p.id === id);
function ensureReserve(){
  if(!state.pots.find(p => p.type==='reserve')){
    state.pots.push({ id:newId(), name:'Reserve', type:'reserve', savedTotal:0 });
    save();
  }
}
function assignedPlanned(){
  // Spending uses monthlyLimit; Savings/Investment use monthlyContrib; Reserve not counted
  let a = 0;
  for(const p of state.pots){
    if(p.type==='spending') a += Number(p.monthlyLimit||0);
    if(p.type==='savings' || p.type==='investment') a += Number(p.monthlyContrib||0);
  }
  return a;
}
function totalsSnapshot(){
  let spent=0, saved=0, invested=0, reserve=0;
  for(const p of state.pots){
    if(p.type==='spending') spent += Number(p.spentThisMonth||0);
    if(p.type==='savings')  saved += Number(p.savedTotal||0);
    if(p.type==='investment') invested += Number(p.savedTotal||0);
    if(p.type==='reserve')  reserve += Number(p.savedTotal||0);
  }
  return { spent, saved, invested, reserve };
}

// ================= RENDER: NAV =================
document.querySelectorAll('.tab').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.querySelectorAll('main > section').forEach(s => s.style.display = 'none');
    document.getElementById(`tab-${tab}`).style.display = 'grid';
    renderAll();
  });
});
$('quickAddBtn').addEventListener('click', ()=> {
  document.querySelector('[data-tab="transactions"]').click();
  $('txMerchant').focus();
});

// ================= RENDER: DASHBOARD =================
function renderDashboard(){
  // header mirrors
  $('pointsTop').textContent = state.points;
  $('incomeMonthly').textContent = fmt$(state.incomeMonthly);

  // total balance = Savings + Investments + Reserve (spending pots are monthly envelopes, not cash)
  const snap = totalsSnapshot();
  const total = Number(snap.saved) + Number(snap.invested) + Number(snap.reserve);
  $('totalBalance').textContent = fmt$(total);

  // today labels
  const today = new Date();
  $('todayLabel').textContent = today.toLocaleDateString(undefined,{month:'short', day:'2-digit', year:'numeric'});

  // today spending (sum of spending txns today)
  const todayISOstr = today.toISOString().slice(0,10);
  const todaySpent = state.txns
    .filter(t => t.occurredAtISO.slice(0,10) === todayISOstr)
    .filter(t => (potById(t.potId)?.type === 'spending'))
    .reduce((a,t)=>a + Number(t.amount||0), 0);
  $('todaySpent').textContent = fmt$(todaySpent);
  // we’re not tracking income txns yet; keep 0.00 for now
  $('todayIncome').textContent = fmt$(0);

  // unassigned = income - planned (no separate "Assigned" card)
  const assigned = assignedPlanned();
  const left = Math.max(0, Number(state.incomeMonthly||0) - assigned);
  $('leftDisplay').textContent = fmt$(left);
  const pct = state.incomeMonthly ? Math.min(100, Math.round((assigned/state.incomeMonthly)*100)) : 0;
  $('assignBar').style.width = pct + '%';

  // nice message when unassigned is zero
  const note = $('unassignedNote');
  if (left === 0 && state.incomeMonthly > 0) {
    note.textContent = 'All set — every dollar has a job ✨';
    note.className = 'chip positive mt-6';
  } else if (state.incomeMonthly > 0 && left > 0) {
    note.textContent = 'You still have money to assign';
    note.className = 'chip neutral mt-6';
  } else {
    note.textContent = '';
    note.className = 'chip mt-6'; // hidden visually by empty text
  }

  // key pots (top 6)
  $('dashboardPots').innerHTML = state.pots
    .filter(p=>p.type!=='reserve')
    .slice(0,6)
    .map(p => potCardHTML(p, {compact:true}))
    .join('');

  // alerts
  const alerts = [];
  for(const p of state.pots){
    if(p.type==='spending' && Number(p.monthlyLimit||0) > 0){
      const used = Number(p.spentThisMonth||0)/Number(p.monthlyLimit||1);
      if(used >= 1.0) alerts.push(`❗ ${p.name} is over the limit`);
      else if(used >= 0.9) alerts.push(`⚠️ ${p.name} is ${Math.round(used*100)}% used`);
    }
    if(p.type==='savings' && p.goal){
      const pct = Math.round(Math.min(100, (Number(p.savedTotal||0)/p.goal)*100));
      if([25,50,75,100].includes(pct)) alerts.push(`🎉 ${p.name} hit ${pct}%`);
    }
  }
  $('alerts').innerHTML = alerts.length
    ? alerts.map(a=>`<div class="item">${a}</div>`).join('')
    : `<div class="item">No alerts right now.</div>`;

  // mini list: last 5 txns
  const last5 = state.txns
    .slice()
    .sort((a,b)=> new Date(b.occurredAtISO) - new Date(a.occurredAtISO))
    .slice(0,5);
  $('dashTxList').innerHTML = last5.map(t=>{
    const p = potById(t.potId);
    return `<div class="item row space-between">
      <div>
        <strong>${t.merchant || '(no merchant)'} </strong>
        <span class="tiny">${new Date(t.occurredAtISO).toLocaleDateString()}</span>
        <span class="tiny" style="margin-left:6px">· ${p?.name || 'Unknown'}</span>
      </div>
      <div class="amount">${fmt$(t.amount)}</div>
    </div>`;
  }).join('');
}

// ================= RENDER: POTS =================
function potCardHTML(p, {compact=false}={}){
  const stageName = STAGES[Number(p.stage||0)]?.name || 'Seedling';
  const stageEmoji = STAGES[Number(p.stage||0)]?.emoji || '🌱';
  let meta = '';
  if(p.type==='spending') meta = `Limit ${fmt$(p.monthlyLimit||0)} · Spent ${fmt$(p.spentThisMonth||0)}`;
  if(p.type==='savings')  meta = `Goal ${fmt$(p.goal||0)} · Saved ${fmt$(p.savedTotal||0)} · Plan ${fmt$(p.monthlyContrib||0)}/mo`;
  if(p.type==='investment') meta = `Invested ${fmt$(p.savedTotal||0)} · Plan ${fmt$(p.monthlyContrib||0)}/mo`;
  if(p.type==='reserve')  meta = `Balance ${fmt$(p.savedTotal||0)}`;

  // progress bars
  let barHTML = '';
  if(p.type==='spending' && p.monthlyLimit){
    const usedPct = Math.min(100, Math.round((Number(p.spentThisMonth||0)/Number(p.monthlyLimit))*100));
    const remaining = Number(p.monthlyLimit||0) - Number(p.spentThisMonth||0);
    barHTML = `
      <div class="row"><div class="label">Remaining</div><div>${fmt$(remaining)}</div></div>
      <div class="progress"><div class="fill ${remaining<0?'over':''}" style="width:${usedPct}%"></div></div>`;
  }
  if((p.type==='savings' && p.goal) ){
    const pct = Math.min(100, Math.round((Number(p.savedTotal||0)/Number(p.goal))*100));
    barHTML = `
      <div class="row"><div class="label">Progress</div><div>${pct}%</div></div>
      <div class="progress"><div class="fill" style="width:${pct}%"></div></div>`;
  }

  return `
    <div class="card soft col-4 pot-card">
      <div class="pot-head">
        <div class="pot-name">${p.name}</div>
        <div class="pot-tags">
          <span class="tag">${p.type}</span>
          <span class="tag">${stageName} ${stageEmoji}</span>
        </div>
      </div>
      <div class="label">${meta}</div>
      ${barHTML}
      ${!compact ? `
      <div class="row mt">
        ${p.type!=='reserve' ? `<button class="btn ghost" data-edit="${p.id}">Edit</button>`:''}
        ${p.type!=='reserve' ? `<button class="btn" data-delete="${p.id}">Delete</button>`:''}
      </div>`:''}
    </div>
  `;
}

function renderPots(){
  // toggle input blocks based on type
  const t = $('potType').value;
  $('spendingWrap').style.display = (t==='spending') ? 'block' : 'none';
  $('contribWrap').style.display  = (t==='savings' || t==='investment') ? 'block' : 'none';
  $('goalWrap').style.display     = (t==='savings') ? 'block' : 'none';

  $('potList').innerHTML = state.pots.map(p => potCardHTML(p)).join('');

  // wire edit/delete
  document.querySelectorAll('[data-delete]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.getAttribute('data-delete');
      state.pots = state.pots.filter(p=>p.id!==id);
      state.txns = state.txns.filter(t=>t.potId!==id);
      save(); renderAll();
    });
  });
  document.querySelectorAll('[data-edit]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.getAttribute('data-edit');
      const p = potById(id);
      if(!p) return;
      const name = prompt('Rename pot', p.name);
      if(name!==null && name.trim()) p.name = name.trim();
      if(p.type==='spending'){
        const lim = prompt('Monthly limit', String(p.monthlyLimit||0));
        if(lim!==null) p.monthlyLimit = Number(lim)||0;
      }
      if(p.type==='savings'){
        const goal = prompt('Goal', String(p.goal||0));
        if(goal!==null) p.goal = Number(goal)||0;
        const plan = prompt('Monthly contribution', String(p.monthlyContrib||0));
        if(plan!==null) p.monthlyContrib = Number(plan)||0;
      }
      if(p.type==='investment'){
        const plan = prompt('Monthly investment', String(p.monthlyContrib||0));
        if(plan!==null) p.monthlyContrib = Number(plan)||0;
      }
      save(); renderAll();
    });
  });
}

// ================= RENDER: TXNS =================
function renderTxns(){
  // selects
  const opts = state.pots.map(p => `<option value="${p.id}">${p.name} (${p.type})</option>`).join('');
  $('txPot').innerHTML = opts;
  $('txFilterPot').innerHTML = `<option value="">All</option>` + opts;
  if(!$('txDate').value) $('txDate').value = todayISO();

  const filterId = $('txFilterPot').value;
  const list = state.txns
    .slice()
    .sort((a,b)=> new Date(b.occurredAtISO) - new Date(a.occurredAtISO))
    .filter(t => !filterId || t.potId === filterId);

  $('txList').innerHTML = list.map(t=>{
    const p = potById(t.potId);
    return `<div class="item row space-between">
      <div>
        <strong>${t.merchant || '(no merchant)'} </strong>
        <span class="label">→ ${p?.name || 'Unknown'}</span>
        <div class="label">${new Date(t.occurredAtISO).toLocaleString()}</div>
      </div>
      <div>${fmt$(t.amount)}</div>
    </div>`;
  }).join('');
}

// ================= RENDER: GARDEN =================
function renderGarden(){
  $('pointsGarden').textContent = state.points;
  $('gardenGrid').innerHTML = state.pots
    .filter(p=>p.type!=='reserve')
    .map(p=>{
      const sIdx = Number(p.stage||0);
      const s = STAGES[sIdx] || STAGES[0];
      const maxed = isMaxStage(p);
      const cost = nextStageCost(p);
      const can = Number(state.points||0) >= cost;
      return `<div class="col-4">
        <div class="plant">
          <div class="emoji">${s.emoji}</div>
          <div class="label">${p.name} — ${s.name}</div>
          <button class="btn ${maxed?'':'primary'} mt" data-upgrade="${p.id}" ${maxed||!can?'disabled':''}>
            ${maxed?'Max Stage':`Upgrade (${cost} pts)`}
          </button>
        </div>
      </div>`;
    }).join('');

  // wire upgrades
  document.querySelectorAll('[data-upgrade]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.getAttribute('data-upgrade');
      upgradePlant(id);
    });
  });
}

// ================= RENDER: REPORTS (text summaries for now) =================
function renderReports(){
  // planned allocation
  const planned = {};
  for(const p of state.pots){
    if(p.type==='spending') planned.Spending = (planned.Spending||0) + Number(p.monthlyLimit||0);
    if(p.type==='savings') planned.Savings = (planned.Savings||0) + Number(p.monthlyContrib||0);
    if(p.type==='investment') planned.Investment = (planned.Investment||0) + Number(p.monthlyContrib||0);
  }
  planned.Total = Object.values(planned).reduce((a,b)=>a+b,0);
  $('allocPlanned').innerHTML = Object.entries(planned).map(([k,v])=>`<div class="item">${k}: <strong>${fmt$(v)}</strong></div>`).join('');

  // progress snapshot
  const snap = totalsSnapshot();
  $('allocProgress').innerHTML = `
    <div class="item">Spending used this month: <strong>${fmt$(snap.spent)}</strong></div>
    <div class="item">Savings balance: <strong>${fmt$(snap.saved)}</strong></div>
    <div class="item">Investments balance: <strong>${fmt$(snap.invested)}</strong></div>
    <div class="item">Reserve balance: <strong>${fmt$(snap.reserve)}</strong></div>
  `;
}

// ================= RENDER: SETTINGS =================
function renderSettings(){
  $('pointsSettings').textContent = state.points;
  $('monthStartBadge').textContent = new Date(state.monthStart).toLocaleDateString();
}

// ================= RENDER ALL =================
function renderAll(){
  // header mirrors
  $('pointsTop').textContent = state.points;
  renderDashboard();
  renderPots();
  renderTxns();
  renderGarden();
  renderReports();
  renderSettings();
  save();
}

// ================= ACTIONS =================
$('setIncome').addEventListener('click', ()=>{
  const n = Number($('incomeInput').value||0);
  state.incomeMonthly = n;
  $('incomeInput').value = '';
  save(); renderAll();
});

$('potType').addEventListener('change', renderPots);

$('createPot').addEventListener('click', ()=>{
  const name = ($('potName').value||'').trim();
  if(!name) return alert('Name required');
  const type = $('potType').value;

  if(type==='reserve'){
    if(state.pots.find(p=>p.type==='reserve')) return alert('Reserve already exists.');
    state.pots.push({ id:newId(), name, type:'reserve', savedTotal:0 });
  }
  if(type==='spending'){
    const lim = Number($('spendingLimit').value||0);
    state.pots.push({ id:newId(), name, type, monthlyLimit:lim, spentThisMonth:0, stage:0, plantPoints:0, lastMilestone:0 });
  }
  if(type==='savings'){
    const contrib = Number($('monthlyContrib').value||0);
    const goal = Number($('goalInput').value||0);
    state.pots.push({ id:newId(), name, type, monthlyContrib:contrib, goal, savedTotal:0, stage:0, plantPoints:0, lastMilestone:0 });
  }
  if(type==='investment'){
    const contrib = Number($('monthlyContrib').value||0);
    state.pots.push({ id:newId(), name, type, monthlyContrib:contrib, savedTotal:0, stage:0, plantPoints:0, lastMilestone:0 });
  }

  // reset form
  $('potName').value=''; $('spendingLimit').value=''; $('monthlyContrib').value=''; $('goalInput').value='';
  save(); renderAll();
});

$('seedDemo').addEventListener('click', ()=>{
  if(!confirm('Replace current pots/txns with demo data?')) return;
  state = defaultState();
  ensureReserve();
  state.incomeMonthly = 3000;
  state.pots.push(
    { id:newId(), name:'Food', type:'spending', monthlyLimit:350, spentThisMonth:0, stage:0, plantPoints:0, lastMilestone:0 },
    { id:newId(), name:'Rent', type:'spending', monthlyLimit:1200, spentThisMonth:0, stage:0, plantPoints:0, lastMilestone:0 },
    { id:newId(), name:'Emergency Fund', type:'savings', monthlyContrib:200, goal:2000, savedTotal:0, stage:0, plantPoints:0, lastMilestone:0 },
    { id:newId(), name:'S&P 500', type:'investment', monthlyContrib:150, savedTotal:0, stage:0, plantPoints:0, lastMilestone:0 }
  );
  save(); renderAll();
});

// --- Instant milestone award for savings
function awardSavingsMilestonesNow(pot, prevSaved, newSaved){
  if(pot.type !== 'savings') return 0;
  const goal = Number(pot.goal||0); if(goal<=0) return 0;
  const prevPct = Math.min(1, prevSaved/goal);
  const newPct  = Math.min(1, newSaved/goal);
  let pts = 0;
  let last = Number(pot.lastMilestone||0);
  for(const m of SAVINGS_MILESTONES){
    if(prevPct < m && newPct >= m && last < m){
      pts += (SAVINGS_AWARDS[m] || 0);
      last = m;
    }
  }
  if(pts>0){
    pot.lastMilestone = last;
    pot.plantPoints = Number(pot.plantPoints||0) + pts;
    state.points = Number(state.points||0) + pts;
  }
  return pts;
}

// --- Add transaction
$('txAdd').addEventListener('click', ()=>{
  const merchant = ($('txMerchant').value||'').trim();
  const amount = Number($('txAmount').value||0);
  const potId = $('txPot').value;
  const dateISO = $('txDate').value || todayISO();
  if(!potId || !amount) return alert('Choose pot and amount');
  const p = potById(potId); if(!p) return alert('Pot missing');

  if(p.type==='spending'){
    p.spentThisMonth = Number(p.spentThisMonth||0) + amount;
  } else if(p.type==='savings'){
    const prev = Number(p.savedTotal||0);
    p.savedTotal = prev + amount;
    awardSavingsMilestonesNow(p, prev, p.savedTotal);
  } else if(p.type==='investment' || p.type==='reserve'){
    p.savedTotal = Number(p.savedTotal||0) + amount;
  }

  state.txns.push({ id:newId(), merchant, amount, potId, occurredAtISO:new Date(dateISO).toISOString() });

  // engagement +1
  state.points = Number(state.points||0) + 5;

  // reset form
  $('txMerchant').value=''; $('txAmount').value='';
  save(); renderAll();
});
$('txClear').addEventListener('click', ()=>{ $('txMerchant').value=''; $('txAmount').value=''; });
$('txFilterPot').addEventListener('change', renderTxns);
$('txFilterReset').addEventListener('click', ()=>{ $('txFilterPot').value=''; renderTxns(); });

// --- Upgrade plant
function upgradePlant(potId){
  const p = potById(potId); if(!p || p.type==='reserve') return;
  if(isMaxStage(p)) return alert(`${p.name} is already maxed`);
  const cost = nextStageCost(p);
  if(Number(state.points||0) < cost) return alert(`Need ${cost} points`);
  state.points -= cost;
  p.stage = Number(p.stage||0)+1;
  p.plantPoints = Number(p.plantPoints||0) + Math.round(cost/2);
  save(); renderAll();
}

// --- Close month: awards + reset spending
$('closeMonth').addEventListener('click', ()=>{
  if(!confirm('Close month, award points, reset spending?')) return;
  let cyclePoints = 0;
  const reserve = state.pots.find(p=>p.type==='reserve');

  for(const p of state.pots.filter(x=>x.type==='spending')){
    const lim = Number(p.monthlyLimit||0);
    const spent = Number(p.spentThisMonth||0);
    if(lim>0){
      if(spent <= lim){
        const leftover = lim - spent;
        const pct = leftover/lim;
        let pts = 0;
        if(pct===0) pts=10;
        if(pct>=0.05) pts=20;
        if(pct>=0.10) pts=35;
        if(pct>=0.20) pts=60;
        cyclePoints += pts; p.plantPoints = Number(p.plantPoints||0)+pts;
      } else {
        const over = spent - lim;
        if(reserve){
          const avail = Number(reserve.savedTotal||0);
          const cover = Math.min(over, avail);
          reserve.savedTotal = avail - cover;
        }
        cyclePoints -= 20;
        p.plantPoints = Math.max(0, Number(p.plantPoints||0)-10);
      }
    }
    p.spentThisMonth = 0;
  }

  // savings milestones catch-up (guarded by lastMilestone so no double award)
  for(const p of state.pots.filter(x=>x.type==='savings')){
    const goal = Number(p.goal||0); if(goal<=0) continue;
    const saved = Number(p.savedTotal||0);
    const pct = Math.min(1, saved/goal);
    let last = Number(p.lastMilestone||0);
    for(const m of SAVINGS_MILESTONES){
      if(pct>=m && last < m){
        const pts = SAVINGS_AWARDS[m]||0;
        cyclePoints += pts;
        p.plantPoints = Number(p.plantPoints||0)+pts;
        last = m;
      }
    }
    p.lastMilestone = last;
  }

  state.points = Number(state.points||0) + cyclePoints;
  state.monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10);
  save(); renderAll();
  alert('Month closed ✅');
});

// --- Wipe
$('wipeData').addEventListener('click', ()=>{
  if(!confirm('Really wipe all local data?')) return;
  state = defaultState(); ensureReserve(); save(); renderAll();
});

// --- Quick nav helper inputs
$('incomeInput').addEventListener('keydown',(e)=>{ if(e.key==='Enter') $('setIncome').click(); });

// ================= EVENT WIRING =================
function wireEvents(){
  // already wired above where needed
}
// ---- SIDEBAR / NAV WIRING ----
function showTab(tab){
  document.querySelectorAll('main > section').forEach(s => s.style.display = 'none');
  const el = document.getElementById(`tab-${tab}`);
  if (el) el.style.display = 'grid';
  document.querySelectorAll('.side-link').forEach(b=>b.classList.remove('active'));
  const btn = document.querySelector(`.side-link[data-tab="${tab}"]`);
  if (btn) btn.classList.add('active');
  renderAll();
}

// Sidebar icons
document.querySelectorAll('.side-link').forEach(btn=>{
  btn.addEventListener('click', ()=> showTab(btn.dataset.tab));
});

// “See all” jumpers
document.querySelectorAll('[data-tab-jump]').forEach(b=>{
  b.addEventListener('click', ()=> showTab(b.getAttribute('data-tab-jump')));
});

// Header quick add jumps to Transactions
document.getElementById('quickAddBtn')?.addEventListener('click', ()=>{
  showTab('transactions');
  document.getElementById('txMerchant')?.focus();
});

// Default tab on load
showTab('dashboard');