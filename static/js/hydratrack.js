
/* ══════════════════════════════════════════════════
   UTILITY
══════════════════════════════════════════════════ */
function showPage(id) {
  document.querySelectorAll('.app-page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if (id === 'adminPage') renderAdminUsers();
}
function setSidebarActive(btn) {
  document.querySelectorAll('.dash-sidebar .nav-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}
function setSidebarActiveById() {
  document.querySelectorAll('.dash-sidebar .nav-btn').forEach((b,i) => {
    if (i===0) b.classList.add('active'); else b.classList.remove('active');
  });
}
function togglePw(id, btn) {
  const inp = document.getElementById(id);
  inp.type = inp.type==='password'?'text':'password';
  btn.textContent = inp.type==='password'?'👁':'🙈';
}
function updateAllClocks() {
  const now=new Date();
  const phOpts={timeZone:'Asia/Manila',month:'numeric',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true};
  const str=now.toLocaleString('en-PH',phOpts);
  ['loginClock','registerClock','dashClock','adminClock'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.innerText=str;
  });
}
setInterval(updateAllClocks,1000); updateAllClocks();
function phTime(d){return new Date(d||Date.now()).toLocaleTimeString('en-PH',{timeZone:'Asia/Manila',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});}
function phDateTime(d){return new Date(d||Date.now()).toLocaleString('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});}

/* ══════════════════════════════════════════════════
   API HELPERS
══════════════════════════════════════════════════ */
const API = '';
function getToken()  { return sessionStorage.getItem('ht_token'); }
function setToken(t) { sessionStorage.setItem('ht_token', t); }
function clearToken(){ sessionStorage.removeItem('ht_token'); sessionStorage.removeItem('ht_user'); }
function setUser(u)  { sessionStorage.setItem('ht_user', JSON.stringify(u)); }
function getUser()   { try { return JSON.parse(sessionStorage.getItem('ht_user')||'null'); } catch { return null; } }

async function apiFetch(path, opts={}) {
  const token = getToken();
  const headers = {'Content-Type':'application/json',...(opts.headers||{})};
  if (token) headers['Authorization'] = 'Bearer '+token;
  return fetch(API+path, {...opts, headers});
}

/* ══════════════════════════════════════════════════
   AUTH
══════════════════════════════════════════════════ */
async function handleLogin() {
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  const errorEl  = document.getElementById('loginError');
  const pendEl   = document.getElementById('pendingNotice');
  const spinner  = document.getElementById('loginSpinner');
  errorEl.classList.remove('show'); pendEl.classList.remove('show');
  if (!username||!password) { errorEl.textContent='⚠ Please enter both username and password.'; errorEl.classList.add('show'); return; }
  spinner.classList.add('show');
  try {
    const res  = await apiFetch('/api/auth/login',{method:'POST',body:JSON.stringify({username,password})});
    const data = await res.json();
    spinner.classList.remove('show');
    if (res.status===403) { pendEl.classList.add('show'); document.getElementById('loginPass').value=''; return; }
    if (!res.ok) { errorEl.textContent='⚠ '+(data.error||'Invalid credentials.'); errorEl.classList.add('show'); document.getElementById('loginPass').value=''; return; }
    setToken(data.token); setUser(data.user);
    sessionStorage.setItem('loggedIn','true');
    sessionStorage.setItem('username',data.user.username);
    showPage('dashboardPage');
    if (data.user.is_admin) {document.getElementById('adminBtn').style.display='inline-block';}
    else {document.getElementById('adminBtn').style.display='none';const ac=document.getElementById('adminEdgeControls');if(ac)ac.style.display='none';}
    
    await loadDeviceIPsFromAPI();
    autoConnectAllCameras();
    startAutoCapture();
    loadReadingsHistoryFromAPI();
    setTimeout(preInitChartsIfNeeded,400);
    loadDashRecommendations();
  } catch(e) {
    spinner.classList.remove('show');
    errorEl.textContent='⚠ Could not reach server. Is Flask running?';
    errorEl.classList.add('show');
  }
}

async function handleRegister() {
  const first=document.getElementById('regFirst')?document.getElementById('regFirst').value.trim():'';
  const last=document.getElementById('regLast')?document.getElementById('regLast').value.trim():'';
  const username=document.getElementById('regUser').value.trim();
  const email=document.getElementById('regEmail').value.trim();
  const password=document.getElementById('regPass').value;
  const confirm=document.getElementById('regConfirm').value;
  const spinner=document.getElementById('regSpinner');
  if (!username||!email||!password||!confirm) { showRegError('⚠ Please fill in all fields.'); return; }
  if (username.length<3) { showRegError('⚠ Username must be at least 3 characters.'); return; }
  if (!email.includes('@')||!email.includes('.')) { showRegError('⚠ Please enter a valid email address.'); return; }
  if (password.length<6) { showRegError('⚠ Password must be at least 6 characters.'); return; }
  if (password!==confirm) { showRegError('⚠ Passwords do not match.'); return; }
  if (username.toLowerCase()==='admin') { showRegError('⚠ This username is reserved.'); return; }
  spinner.classList.add('show');
  document.getElementById('regBtn').disabled=true;
  try {
    const res=await apiFetch('/api/auth/register',{method:'POST',body:JSON.stringify({first_name:first||username,last_name:last||'User',username,email,password})});
    const data=await res.json();
    console.log('Registration response:',res.status,data);
    spinner.classList.remove('show');
    document.getElementById('regBtn').disabled=false;
    if (!res.ok) { showRegError('⚠ '+(data.error||'Registration failed.')); return; }
    console.log('Registration successful! User ID:',data.user?.id);
    document.getElementById('regFormContainer').style.display='none';
    document.getElementById('regSuccess').classList.add('show');
  } catch(e) {
    spinner.classList.remove('show');
    document.getElementById('regBtn').disabled=false;
    showRegError('⚠ Could not reach server.');
  }
}
function showRegError(msg) { const el=document.getElementById('regError'); el.textContent=msg; el.classList.add('show'); }
function logOut()           { document.getElementById('logoutModal').classList.add('show'); }
function closeLogoutModal() { document.getElementById('logoutModal').classList.remove('show'); }
function confirmLogout()    { clearToken(); sessionStorage.removeItem('loggedIn'); sessionStorage.removeItem('username'); showPage('loginPage'); document.getElementById('adminBtn').style.display='none'; }
document.addEventListener('keydown', e => {
  if (e.key!=='Enter') return;
  const active=document.querySelector('.app-page.active');
  if (!active) return;
  if (active.id==='loginPage')    handleLogin();
  if (active.id==='registerPage') handleRegister();
});

/* ══════════════════════════════════════════════════
   CHARTS
══════════════════════════════════════════════════ */
const DT = {
  key:        t=>new Date(t).toISOString().slice(0,10),
  dateShort:  t=>new Date(t).toLocaleDateString('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric'}),
  monthKey:   t=>new Date(t).toISOString().slice(0,7),
  monthLabel: k=>{const[y,m]=k.split('-');return new Date(+y,+m-1).toLocaleDateString('en-PH',{month:'long',year:'numeric'});},
  weekStart:  t=>{const x=new Date(t);x.setDate(x.getDate()-x.getDay());x.setHours(0,0,0,0);return x;},
  weekKey:    t=>DT.key(DT.weekStart(t)),
  weekLabel:  k=>{const s=new Date(k);const e=new Date(s);e.setDate(s.getDate()+6);return `${DT.dateShort(s)}–${DT.dateShort(e)}`;},
  today:      ()=>DT.key(new Date()),
  ago:        n=>{const x=new Date();x.setDate(x.getDate()-n);return x;},
};
let readingsHistory={A:[],B:[]};

function groupByDay(arr) {
  const m={};
  arr.forEach(r=>{const k=DT.key(r.ts);if(!m[k])m[k]={items:[],total:0,anomalies:0};m[k].items.push(r);m[k].total+=r.consumption;m[k].anomalies+=r.anomaly?1:0;});
  return m;
}
function groupByWeek(byDay) {
  const m={};
  Object.entries(byDay).forEach(([dk,dd])=>{const wk=DT.weekKey(new Date(dk));if(!m[wk])m[wk]={days:{},total:0};m[wk].days[dk]=dd;m[wk].total+=dd.total;});
  return m;
}
function groupByMonth(byDay) {
  const m={};
  Object.entries(byDay).forEach(([dk,dd])=>{const mk=DT.monthKey(new Date(dk));if(!m[mk])m[mk]={days:{},total:0};m[mk].days[dk]=dd;m[mk].total+=dd.total;});
  return m;
}

let chartsSectionInited=false;
const cgAxis={
  x:{grid:{color:'rgba(45,63,84,0.5)'},ticks:{color:'#64748B',font:{family:'IBM Plex Mono',size:9}}},
  y:{beginAtZero:true,grid:{color:'rgba(45,63,84,0.5)'},ticks:{color:'#64748B',font:{family:'IBM Plex Mono',size:9}}}
};
const cgTT={callbacks:{title:items=>items[0].label,label:ctx=>` ${ctx.dataset.label}: ${ctx.formattedValue}`}};

function initChartsSection() {
  cgHourlyChart=new Chart(document.getElementById('cgHourlyChart').getContext('2d'),{type:'line',data:{labels:[],datasets:[{label:'m³',data:[],fill:true,borderColor:'#38BDF8',backgroundColor:'rgba(56,189,248,0.10)',tension:0.4,pointRadius:3,pointHoverRadius:6,pointBackgroundColor:'#38BDF8',pointBorderColor:'#1E2A3A',pointBorderWidth:2,borderWidth:2}]},options:{responsive:true,animation:{duration:400},scales:cgAxis,plugins:{legend:{display:false},tooltip:cgTT}}});
  cg30DayChart=new Chart(document.getElementById('cg30DayChart').getContext('2d'),{type:'line',data:{labels:[],datasets:[{label:'m³/day',data:[],fill:true,borderColor:'#06b6d4',backgroundColor:'rgba(6,182,212,0.10)',tension:0.4,pointRadius:2.5,pointHoverRadius:5,pointBackgroundColor:'#06b6d4',pointBorderColor:'#1E2A3A',pointBorderWidth:2,borderWidth:2}]},options:{responsive:true,animation:{duration:400},scales:cgAxis,plugins:{legend:{display:false},tooltip:cgTT}}});
  cgWeeklyChart=new Chart(document.getElementById('cgWeeklyChart').getContext('2d'),{type:'bar',data:{labels:[],datasets:[{label:'m³',data:[],backgroundColor:'rgba(167,139,250,0.55)',borderColor:'#a78bfa',borderWidth:2,borderRadius:5,borderSkipped:false}]},options:{responsive:true,animation:{duration:400},scales:cgAxis,plugins:{legend:{display:false},tooltip:cgTT}}});
  syncChartsSection();
}

function syncChartsSection() {
  const arr=readingsHistory[currentBuilding]||[];
  const byDay=groupByDay(arr),byWeek=groupByWeek(byDay),byMonth=groupByMonth(byDay);
  const dayKeys=Object.keys(byDay).sort().reverse();
  const weekKeys=Object.keys(byWeek).sort().reverse();
  const monthKeys=Object.keys(byMonth).sort().reverse();
  const todayKey=DT.today();
  const todayData=byDay[todayKey]||{items:[],total:0,anomalies:0};
  const monthData=byMonth[DT.monthKey(new Date())]||{days:{},total:0};
  document.getElementById('cgToday').innerText=todayData.total.toFixed(3)+' m³';
  document.getElementById('cgTodayReadings').innerText=todayData.items.length+' readings today';
  document.getElementById('cgMonthTotal').innerText=monthData.total.toFixed(3)+' m³';
  document.getElementById('cgMonthDays').innerText=Object.keys(monthData.days).length+' days recorded';
  const dateEl=document.getElementById('cgHourlyDate');
  if(dateEl) dateEl.textContent=new Date().toLocaleDateString('en-PH',{weekday:'short',month:'short',day:'numeric',year:'numeric'});
  const _now=new Date();
  const prevMonthDate=new Date(_now.getFullYear(),_now.getMonth()-1,1);
  const prevMonthKey=DT.monthKey(prevMonthDate);
  const prevMonthData=byMonth[prevMonthKey]||null;
  const prevMonthName=prevMonthDate.toLocaleDateString('en-PH',{month:'long',year:'numeric'});
  const prevLabelEl=document.getElementById('cgPrevMonthLabel');
  const prevTotalEl=document.getElementById('cgPrevMonthTotal');
  const prevDaysEl=document.getElementById('cgPrevMonthDays');
  const momEl=document.getElementById('cgMoMChange');
  const momSubEl=document.getElementById('cgMoMSub');
  if(prevLabelEl) prevLabelEl.textContent=prevMonthName;
  if(prevMonthData&&prevMonthData.total>0) {
    const prevTotal=prevMonthData.total;
    const prevDays=Object.keys(prevMonthData.days).length;
    if(prevTotalEl) prevTotalEl.textContent=prevTotal.toFixed(3)+' m³';
    if(prevDaysEl)  prevDaysEl.textContent=prevDays+' days recorded';
    const currTotal=monthData.total;
    if(momEl&&momSubEl) {
      if(currTotal>0) {
        const diff=currTotal-prevTotal,pct=((diff/prevTotal)*100).toFixed(1),up=diff>=0;
        momEl.textContent=(up?'▲ ':'▼ ')+Math.abs(pct)+'%';
        momEl.style.color=up?'var(--red)':'var(--green)';
        momSubEl.textContent=(up?'+':'')+diff.toFixed(3)+' m³ vs last month';
      } else { momEl.textContent='—'; momEl.style.color='var(--text-muted)'; momSubEl.textContent='no current month data yet'; }
    }
  } else {
    if(prevTotalEl) prevTotalEl.textContent='— m³';
    if(prevDaysEl)  prevDaysEl.textContent='no data for '+prevMonthName;
    if(momEl)       { momEl.textContent='—'; momEl.style.color='var(--text-muted)'; }
    if(momSubEl)    momSubEl.textContent='vs. previous month';
  }
  if(cgHourlyChart) {
    const hBins={};for(let i=0;i<24;i++)hBins[i]={m3:0};
    (todayData.items||[]).forEach(r=>{const h=new Date(r.ts).getHours();hBins[h].m3+=r.consumption;});
    cgHourlyChart.data.labels=Object.keys(hBins).map(h=>String(h).padStart(2,'0')+':00');
    cgHourlyChart.data.datasets[0].data=Object.values(hBins).map(v=>+v.m3.toFixed(3));
    cgHourlyChart.update();
  }
  if(cg30DayChart) {
    const slice=dayKeys.slice(0,30).reverse();
    cg30DayChart.data.labels=slice.map(k=>new Date(k).getDate());
    cg30DayChart.data.datasets[0].data=slice.map(k=>+(byDay[k]?.total||0).toFixed(2));
    cg30DayChart.update();
  }
  if(cgWeeklyChart) {
    const slice=weekKeys.slice(0,8).reverse();
    cgWeeklyChart.data.labels=slice.map(k=>DT.weekLabel(k).split('–')[0].trim());
    cgWeeklyChart.data.datasets[0].data=slice.map(k=>+(byWeek[k]?.total||0).toFixed(1));
    cgWeeklyChart.update();
  }
}

function pushToReadingsHistory(submeter,consumedM3,anomaly) {
  readingsHistory[submeter].push({ts:new Date().toISOString(),consumption:consumedM3,anomaly:anomaly});
  if(chartsSectionInited) syncChartsSection();
}

/* ══════════════════════════════════════════════════
   DASHBOARD STATE
══════════════════════════════════════════════════ */
let currentBuilding='A';
let buildings={
  A:{monthlyData:[],total:0,previous:0,currentDay:1,baseline:0},
  B:{monthlyData:[],total:0,previous:0,currentDay:1,baseline:0}
};
let monthlyHistory=[];
let submetersMap={A:1,B:2}; // submeter_id per building key

const commonOptions={
  responsive:true,animation:{duration:500},
  scales:{
    x:{grid:{color:'rgba(45,63,84,0.5)',lineWidth:1},ticks:{color:'#64748B',font:{family:'IBM Plex Mono',size:10}}},
    y:{beginAtZero:true,grid:{color:'rgba(45,63,84,0.5)',lineWidth:1},ticks:{color:'#64748B',font:{family:'IBM Plex Mono',size:10}}}
  },
  plugins:{legend:{labels:{color:'#8EA8C8',font:{family:'Syne',size:12}}}}
};

const consumptionChart=new Chart(document.getElementById('consumptionChart').getContext('2d'),{type:'line',data:{labels:[],datasets:[{label:'Consumption (m³)',data:[],borderColor:'#38BDF8',backgroundColor:'rgba(56,189,248,0.07)',fill:true,tension:0.4,pointRadius:4,pointHoverRadius:7,pointBackgroundColor:'#38BDF8',pointBorderColor:'#1E2A3A',pointBorderWidth:2,borderWidth:2}]},options:{...commonOptions,scales:{...commonOptions.scales,y:{...commonOptions.scales.y,suggestedMax:1}}}});
window.consumptionChartInstance=consumptionChart;


function resetCharts() {
  consumptionChart.data.labels=[];consumptionChart.data.datasets[0].data=[];consumptionChart.update();
}

function switchBuilding(id) {
  saveCaptureToCache(currentBuilding);
  currentBuilding=id;
  const data=buildings[id];
  document.querySelectorAll('.submeter-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('btn-'+id).classList.add('active');
  const names={A:'Submeter 1',B:'Submeter 2'};
  document.getElementById('active-bldg-label').textContent='Monitoring: '+names[id];
  const camLbl=document.getElementById('camActiveLabel');
  if(camLbl) camLbl.textContent=names[id];
  document.getElementById('totalConsumption').innerText=data.total.toFixed(3)+' m³';
  const lastDaily=data.monthlyData.length>0?data.monthlyData[data.monthlyData.length-1]:0;
  document.getElementById('dailyConsumption').innerText=lastDaily.toFixed(3)+' m³';
  const dlEl2=document.getElementById('dailyLiters'); if(dlEl2) dlEl2.innerText=(lastDaily*1000).toFixed(0)+' L today';
  resetCharts();
  data.monthlyData.forEach((val,i)=>{
    consumptionChart.data.labels.push('Day '+(i+1));consumptionChart.data.datasets[0].data.push(val);
  });
  consumptionChart.update();
  reconnectCameraForBuilding(id);
  loadDashRecommendations();
  if(chartsSectionInited) syncChartsSection();
  // Re-render history if that page is currently visible
  if(document.getElementById('historySection').classList.contains('active')) renderHistory();
}


/* ── Load readings history from DB ── */
async function loadReadingsHistoryFromAPI() {
  try {
    // Load readings for each submeter, sorted oldest first
    for(const bldg of ['A','B']) {
      const subId=submetersMap[bldg];
      if(!subId) continue;
      const res=await apiFetch(`/api/readings/?submeter_id=${subId}&limit=500`);
      if(!res.ok) continue;
      const readings=await res.json();
      if(!readings.length) continue;

      // Sort oldest first (API returns newest first)
      readings.sort((a,b)=>new Date(a.reading_time)-new Date(b.reading_time));

      // Calculate consumption deltas between sequential readings
      let prevReading=null;
      readings.forEach(r=>{
        const val=parseFloat(r.ocr_value);
        if(isNaN(val)||val<=0) return;
        let consumption=0;
        if(prevReading!==null && val>prevReading) {
          consumption=parseFloat((val-prevReading).toFixed(4));
          if(consumption>50) consumption=0; // reject obvious misreads
        }
        readingsHistory[bldg].push({
          ts:r.reading_time,
          reading:val,
          consumption:consumption,
          anomaly:false
        });
        if(consumption>0) {
          // Populate dashboard chart with historical data
          const timeLabel=phTime(r.reading_time);
          consumptionChart.data.labels.push(timeLabel);
          consumptionChart.data.datasets[0].data.push(parseFloat(consumption.toFixed(3)));
        }
        prevReading=val;
      });
      consumptionChart.update();

      // Set _lastPolledValue so live polling continues from the latest reading
      const latestReading=parseFloat(readings[readings.length-1].ocr_value);
      if(!isNaN(latestReading)&&latestReading>0) {
        _lastPolledValue[bldg]=latestReading;
        ocrPreviousValue[bldg]=latestReading;
        buildings[bldg].previous=latestReading;
      }
    }

    // Load daily/monthly consumption totals from DB
    const resD=await apiFetch('/api/consumption/summary');
    if(resD.ok){
      const summary=await resD.json();
      summary.forEach(s=>{
        const sub=s.type==='A'?'A':'B';
        buildings[sub].total=s.month_m3||0;
        if(s.daily_totals&&Array.isArray(s.daily_totals)){
          _dailyTotals[sub]=s.daily_totals.map(d=>d.total||0);
        }
      });
      // Update KPIs for current submeter
      const cur=buildings[currentBuilding];
      document.getElementById('totalConsumption').innerText=cur.total.toFixed(3)+' m³';
      document.getElementById('dailyConsumption').innerText=cur.total.toFixed(3)+' m³';
      const dlEl=document.getElementById('dailyLiters');
      if(dlEl) dlEl.innerText=(cur.total*1000).toFixed(0)+' L today';
    }
    if(chartsSectionInited) syncChartsSection();
  } catch(e){ console.error('[HydraTrack] Failed to load readings history:',e); }
}

function processReading(prev,current) {
  const bldg=buildings[currentBuilding];
  const consumedM3=parseFloat((current-prev).toFixed(4));
  if(consumedM3<0) return;
  if(consumedM3<0.0001) return;
  if(consumedM3>50) return;
  const consumedLiters=consumedM3*1000;
  bldg.total+=consumedM3;
  document.getElementById('dailyConsumption').innerText=bldg.total.toFixed(3)+' m³';
  const dlEl=document.getElementById('dailyLiters'); if(dlEl) dlEl.innerText=(bldg.total*1000).toFixed(0)+' L today';
  document.getElementById('totalConsumption').innerText=bldg.total.toFixed(3)+' m³';
  document.getElementById('percentageChange').innerText='Meter: '+current.toFixed(3)+' m³  |  +'+consumedM3.toFixed(3)+' m³ ('+consumedLiters.toFixed(0)+' L)';
  const timeLabel=phTime();
  consumptionChart.data.labels.push(timeLabel);consumptionChart.data.datasets[0].data.push(parseFloat(consumedM3.toFixed(3)));consumptionChart.update();
  bldg.monthlyData.push(consumedM3);bldg.currentDay++;
  buildings[currentBuilding].previous=current;
  pushToReadingsHistory(currentBuilding,consumedM3,false);
  saveReadingToDB(current,currentBuilding);
}

async function saveReadingToDB(ocrValue,bldg) {
  try {
    const subId=submetersMap[bldg]||1;
    await apiFetch('/api/readings/ingest',{method:'POST',body:JSON.stringify({submeter_id:subId,ocr_value:ocrValue})});
  } catch(e){}
}

/* ══════════════════════════════════════════════════
   ESP32 CAMERA STREAMING
══════════════════════════════════════════════════ */
let streamRetryTimers={A:null,B:null};
let ocrIntervals={A:null,B:null};
let ocrPreviousValue={};
let streamActiveFlags={A:false,B:false};
let buildingIPs={A:'',B:''};
let cameraMode={A:'ai_edge',B:'ai_edge'};
let captureCache={
  A:{src:'',timestamp:'',ocrText:'',ocrDisplay:'none'},
  B:{src:'',timestamp:'',ocrText:'',ocrDisplay:'none'}
};

function getESP32IP()         { return document.getElementById('esp32IpInput'+currentBuilding).value.trim(); }
function connectESP32()       { connectESP32Dual(currentBuilding); }
function disconnectESP32()    { disconnectESP32Dual(currentBuilding); }

async function loadDeviceIPsFromAPI() {
  try {
    const res=await apiFetch('/api/devices/');
    if(!res.ok) return;
    const devices=await res.json();
    if(!devices.length) return;
    const subRes=await apiFetch('/api/devices/submeters/');
    if(!subRes.ok) return;
    const subs=await subRes.json();
    subs.forEach(s=>{
      const key=s.type==='A'?'A':'B';
      submetersMap[key]=s.id;
      if(s.baseline) buildings[key].baseline=s.baseline;
    });
    devices.forEach((dev,idx)=>{
      const key=idx===0?'A':'B';
      if(dev.ip_address){
        buildingIPs[key]=dev.ip_address;
        const inp=document.getElementById('esp32IpInput'+key);
        if(inp) inp.value=dev.ip_address;
      }
    });
    if(devices.length===1 && devices[0].ip_address){
      buildingIPs['A']=devices[0].ip_address;
      const inpA=document.getElementById('esp32IpInputA');
      if(inpA) inpA.value=devices[0].ip_address;
    }
    const sbA=document.getElementById('sidebarIpA'); if(sbA&&buildingIPs['A']) sbA.value=buildingIPs['A'];
    const sbB=document.getElementById('sidebarIpB'); if(sbB&&buildingIPs['B']) sbB.value=buildingIPs['B'];
    // Load baselines
    try {
      const bRes=await apiFetch('/api/consumption/baseline');
      if(bRes.ok){
        const baselines=await bRes.json();
        baselines.forEach(b=>{
          const key=b.type==='A'?'A':'B';
          buildings[key].baseline=b.baseline||0;
          const inp=document.getElementById('baselineInput'+key);
          if(inp) inp.value=b.baseline||0;
        });
      }
    } catch(e){}
  } catch(e){}
}

function saveAndReconnectIP() {
  applyDeviceSettings();
}

function openDeviceSettings() {
  const ipA=buildingIPs['A']||document.getElementById('esp32IpInputA')?.value||'';
  const ipB=buildingIPs['B']||document.getElementById('esp32IpInputB')?.value||'';
  document.getElementById('esp32IpInputA').value=ipA;
  document.getElementById('esp32IpInputB').value=ipB;
  const blA=document.getElementById('baselineInputA'); if(blA) blA.value=buildings.A.baseline||0;
  const blB=document.getElementById('baselineInputB'); if(blB) blB.value=buildings.B.baseline||0;
  document.getElementById('deviceSettingsModal').classList.add('show');
}
function closeDeviceSettings() { document.getElementById('deviceSettingsModal').classList.remove('show'); }
async function applyDeviceSettings() {
  for(const bldg of ['A','B']){
    const inp=document.getElementById('esp32IpInput'+bldg);
    const ip=inp?inp.value.trim():'';
    if(ip){
      buildingIPs[bldg]=ip;
      const sb=document.getElementById('sidebarIp'+bldg);if(sb)sb.value=ip;
      saveDeviceIPtoDB(bldg,ip);
    }
    // Save baseline
    const blInp=document.getElementById('baselineInput'+bldg);
    if(blInp){
      const baseline=parseFloat(blInp.value)||0;
      buildings[bldg].baseline=baseline;
      const subId=submetersMap[bldg];
      if(subId){
        try { await apiFetch('/api/consumption/baseline',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({submeter_id:subId,baseline:baseline})}); } catch(e){}
      }
    }
  }
  closeDeviceSettings();
  captureFromESP32();
  refreshAIEdgeStatus();
}

function quickConnect(bldg) {
  const sidebarInput = document.getElementById('sidebarIp'+bldg);
  const ip = sidebarInput ? sidebarInput.value.trim() : '';
  if(!ip) { alert('Enter the ESP32 IP address first.'); return; }
  document.getElementById('esp32IpInput'+bldg).value = ip;
  buildingIPs[bldg] = ip;
  switchBuilding(bldg);
  saveDeviceIPtoDB(bldg, ip);
  // Don't start MJPEG stream — trigger AI capture instead
  captureFromESP32();
  refreshAIEdgeStatus();
}

function setCameraMode(bldg,mode) {
  cameraMode[bldg]=mode;
  const aiBtn=document.getElementById('camModeAI'+bldg);
  const plainBtn=document.getElementById('camModePlain'+bldg);
  if(aiBtn)    aiBtn.style.background=mode==='ai_edge'?'rgba(56,189,248,0.3)':'var(--bg3)';
  if(plainBtn) plainBtn.style.background=mode==='plain'?'rgba(56,189,248,0.3)':'var(--bg3)';
  const ocrCard=document.getElementById('aiEdgeStatusCard');
  if(ocrCard&&bldg===currentBuilding) ocrCard.style.display=mode==='ai_edge'?'':'none';
  if(streamActiveFlags[bldg]){
    const ip=buildingIPs[bldg]||document.getElementById('esp32IpInput'+bldg)?.value.trim();
    if(ip) startDualStream(bldg,ip);
  }
}

function autoConnectAllCameras() {
  setTimeout(()=>{
    ['A','B'].forEach(bldg=>{
      const ipInput=document.getElementById('esp32IpInput'+bldg);
      const ip=ipInput?ipInput.value.trim():buildingIPs[bldg];
      if(ip){buildingIPs[bldg]=ip;}
    });
    // Don't start MJPEG stream — only AI capture polling
    startAutoCapture();
  },800);
}

function reconnectCameraForBuilding(buildingId) {
  const names={A:'Submeter 1',B:'Submeter 2'};
  const other=buildingId==='A'?'B':'A';
  const lbl=document.getElementById('camActiveLabel');
  if(lbl) lbl.textContent=names[buildingId]||buildingId;
  document.getElementById('cameraWrapper'+buildingId).style.display='';
  document.getElementById('cameraWrapper'+other).style.display='';
  const ipLbl=document.getElementById('ipBuildingLabel');
  if(ipLbl) ipLbl.textContent='('+names[buildingId]+')';
  document.getElementById('camStatus'+buildingId).style.display='';
  document.getElementById('camStatus'+other).style.display='none';
  document.getElementById('ocrValueDisplay'+buildingId).style.display='';
  document.getElementById('ocrValueDisplay'+other).style.display='none';
  const capImg=document.getElementById('captureImg');
  const capPh=document.getElementById('capturePlaceholder');
  const capTs=document.getElementById('captureTimestamp');
  const ocrBadge=document.getElementById('captureOcrBadge');
  const cache=captureCache[buildingId];
  if(cache&&cache.src){
    capImg.src=cache.src;capImg.style.display='block';
    if(capPh) capPh.style.display='none';
    if(capTs) capTs.textContent=cache.timestamp;
    if(ocrBadge){ocrBadge.textContent=cache.ocrText;ocrBadge.style.display=cache.ocrDisplay;}
  } else {
    if(capImg) capImg.style.display='none';
    if(capPh) capPh.style.display='block';
    if(capTs) capTs.textContent='';
    if(ocrBadge) ocrBadge.style.display='none';
  }
  // Update AI edge status card visibility
  const ocrCard=document.getElementById('aiEdgeStatusCard');
  if(ocrCard) ocrCard.style.display=cameraMode[buildingId]==='ai_edge'?'':'none';
}

function connectESP32Dual(bldg) {
  const ip=document.getElementById('esp32IpInput'+bldg).value.trim();
  if(!ip){alert('Enter the ESP32-CAM IP for Submeter '+(bldg==='A'?'1':'2'));return;}
  buildingIPs[bldg]=ip;
  // Save IP to DB
  saveDeviceIPtoDB(bldg,ip);
  startDualStream(bldg,ip);
}

async function saveDeviceIPtoDB(bldg,ip) {
  try {
    const res=await apiFetch('/api/devices/');
    if(!res.ok) return;
    const devices=await res.json();
    const idx=bldg==='A'?0:1;
    if(devices[idx]) await apiFetch(`/api/devices/${devices[idx].id}`,{method:'PUT',body:JSON.stringify({ip_address:ip})});
  } catch(e){}
}

function startDualStream(bldg,ip) {
  const img=document.getElementById('esp32Stream'+bldg);
  const status=document.getElementById('camStatus'+bldg);
  const offline=document.getElementById('camOfflineMsg'+bldg);
  const connBtn=document.getElementById('camConnectBtn'+bldg);
  const stopBtn=document.getElementById('camStopBtn'+bldg);
  if(streamRetryTimers[bldg]){clearTimeout(streamRetryTimers[bldg]);streamRetryTimers[bldg]=null;}
  streamActiveFlags[bldg]=true;
  const mode=cameraMode[bldg]||'ai_edge';
  const streamPort=mode==='plain'?81:80;
  const streamUrl=`/api/proxy/stream?ip=${ip}&port=${streamPort}&t=${Date.now()}`;
  status.innerHTML='🟡 Connecting…';status.className='cam-status-pill cam-status-connecting';
  img.style.display='none';offline.style.display='block';
  offline.textContent=`Connecting to http://${ip}:${streamPort}/stream…`;
  if(connBtn) connBtn.style.display='none';
  if(stopBtn) stopBtn.style.display='inline-block';
  img.crossOrigin='anonymous';img.src=streamUrl;
  img.onload=()=>{
    offline.style.display='none';img.style.display='block';
    status.innerHTML='⬤ Live';status.className='cam-status-pill cam-status-live';
    if(connBtn) connBtn.style.display='none';
    if(stopBtn) stopBtn.style.display='inline-block';
    startOCRDual(bldg,ip);
  };
  img.onerror=()=>{
    if(!streamActiveFlags[bldg]) return;
    status.innerHTML='⬤ Error';status.className='cam-status-pill cam-status-offline';
    offline.style.display='block';
    offline.textContent=`❌ Cannot reach ESP32 at ${ip}:${streamPort} — check IP and click Connect.`;
    img.style.display='none';
    if(connBtn) connBtn.style.display='inline-block';
    if(stopBtn) stopBtn.style.display='none';
    streamActiveFlags[bldg]=false;
    streamRetryTimers[bldg]=setTimeout(()=>{startDualStream(bldg,ip);},5000);
  };
}

function disconnectESP32Dual(bldg) {
  streamActiveFlags[bldg]=false;
  if(streamRetryTimers[bldg]){clearTimeout(streamRetryTimers[bldg]);streamRetryTimers[bldg]=null;}
  stopOCRDual(bldg);
  const img=document.getElementById('esp32Stream'+bldg);
  const status=document.getElementById('camStatus'+bldg);
  const offline=document.getElementById('camOfflineMsg'+bldg);
  const connBtn=document.getElementById('camConnectBtn'+bldg);
  const stopBtn=document.getElementById('camStopBtn'+bldg);
  img.src='';img.style.display='none';
  offline.style.display='block';offline.textContent='📡 Camera Offline — click ▶ Connect to start stream';
  status.innerHTML='⬤ Offline';status.className='cam-status-pill cam-status-offline';
  if(connBtn) connBtn.style.display='inline-block';
  if(stopBtn) stopBtn.style.display='none';
}

function startOCRDual(bldg,ip) { const badge=document.getElementById('ocrModeBadge'+bldg); if(badge) badge.style.display='inline'; }
function stopOCRDual(bldg) { if(ocrIntervals[bldg]){clearInterval(ocrIntervals[bldg]);ocrIntervals[bldg]=null;} const badge=document.getElementById('ocrModeBadge'+bldg); if(badge) badge.style.display='none'; }
function stopOCR() { stopOCRDual('A');stopOCRDual('B'); }

function simulateLiveReading(btn) {
  const bldg=currentBuilding;
  const history=readingsHistory[bldg];
  const lastEntry=history[history.length-1];
  // Use actual ESP32 reading if available, otherwise use last known
  const lastReading=_lastPolledValue[bldg]||(lastEntry?(lastEntry.reading||2181):(bldg==='A'?2181:540));
  const delta=+(0.005+Math.random()*0.05).toFixed(4);
  const newReading=+(lastReading+delta).toFixed(4);
  history.push({ts:new Date().toISOString(),reading:newReading,consumption:delta,anomaly:false});
  const prev=buildings[bldg].previous||lastReading;
  buildings[bldg].previous=newReading;
  _lastPolledValue[bldg]=newReading;
  ocrPreviousValue[bldg]=newReading;
  processReading(prev,newReading);
  syncChartsSection();
  if(btn){const orig=btn.innerHTML;btn.innerHTML='✅ +'+delta.toFixed(4)+' m³';btn.style.background='var(--green)';btn.style.color='var(--bg)';setTimeout(()=>{btn.innerHTML=orig;btn.style.background='';btn.style.color='';},1500);}
}

function preInitChartsIfNeeded() {
  if(!chartsSectionInited){initChartsSection();chartsSectionInited=true;}
  syncChartsSection();
}

function showDashPage(id) {
  document.querySelectorAll('#dashboardPage .page').forEach(p=>p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if(id==='historySection') renderHistory();
  if(id==='chartsSection'){if(!chartsSectionInited){initChartsSection();chartsSectionInited=true;}else syncChartsSection();}
  if(id==='recommendSection') loadAIRecommendations();
}

/* ══════════════════════════════════════════════════
   AI RECOMMENDATIONS
══════════════════════════════════════════════════ */
async function loadDashRecommendations() {
  const panel=document.getElementById('dashRecoPanel');
  const content=document.getElementById('dashRecoContent');
  if(!panel||!content) return;
  panel.style.display=''; // Always show

  const bldg=buildings[currentBuilding];
  
  const statusEl=document.getElementById('deviceStatusDisplay');
  const statusText=statusEl?statusEl.textContent.trim():'';
  const isOffline=statusText.toLowerCase().includes('offline')||statusText.toLowerCase().includes('connecting');
  const errorEl=document.getElementById('aiEdgeError');
  const errorText=errorEl?errorEl.textContent.trim():'';
  const hasError=errorText&&errorText!=='—'&&errorText!=='no error';
  const ocrBadge=document.getElementById('captureOcrBadge');
  const ocrText=ocrBadge?ocrBadge.textContent:'';
  const hasReadingError=ocrText.includes('⚠')||ocrText.includes('No AI result')||ocrText.includes('Invalid');

  let situation='';let cssClass='ok';
  if(isOffline){situation+=`ESP device for Submeter ${currentBuilding==='A'?'1':'2'} is OFFLINE. Status: "${statusText}". `;cssClass='warn';}
  if(hasError){situation+=`Device error: "${errorText}". `;cssClass='warn';}
  if(hasReadingError){situation+=`Camera reading issue: "${ocrText}". `;cssClass='warn';}
  if(!situation){situation=`System running normally. Submeter ${currentBuilding==='A'?'1':'2'} active. Total: ${bldg.total.toFixed(3)} m³. `;cssClass='ok';}

  if(isOffline){
    content.innerHTML='<div class="reco-ai-item warn">⚠ Device offline. Check WiFi and power.</div><div class="reco-ai-item">Verify ESP IP in Device Settings.</div><div class="reco-ai-item">Ensure ESP bridge is running.</div><div class="reco-ai-loading">🤖 Getting AI analysis…</div>';
  } else if(hasReadingError){
    content.innerHTML='<div class="reco-ai-item warn">⚠ Camera could not read meter.</div><div class="reco-ai-item">Wait for next cycle (10s).</div><div class="reco-ai-loading">🤖 Getting AI analysis…</div>';
  } else {
    content.innerHTML='<div class="reco-ai-item ok">✅ System operating normally.</div><div class="reco-ai-loading">🤖 Loading tips…</div>';
  }

  try {
    const prompt=`You are an AI assistant for a university water monitoring system (BSU-Lipa). Uses ESP32-CAM with AI-on-the-Edge firmware to read digital water meter counters. Current: ${situation} Give exactly 4 brief recommendations (1 short sentence each, max 15 words). If offline: troubleshooting. If reading error: camera/meter checks. If normal: water conservation tips. Plain text, one per line, no numbering.`;
    const html=await callClaudeAPI(prompt);
    const lines=html.replace(/<[^>]+>/g,'').split('\n').map(s=>s.trim()).filter(s=>s.length>10).slice(0,4);
    if(lines.length>0){content.innerHTML=lines.map((l,i)=>`<div class="reco-ai-item ${i===0?cssClass:''}">${l}</div>`).join('');}
  } catch(e){
    const loadingEl=content.querySelector('.reco-ai-loading');
    if(loadingEl) loadingEl.remove();
  }
}

async function loadAIRecommendations() {
  const panel=document.querySelector('.reco-panel');
  if(!panel) return;
  try {
    const bldg=buildings[currentBuilding];
    
    panel.innerHTML='<h2>🤖 AI Recommendations</h2><div class="reco-ai-loading">Analyzing your data…</div>';
    const prompt=leakCount>0
      ?`Water monitoring: Submeter ${currentBuilding}, total ${bldg.total.toFixed(3)} m³, ${leakCount} leaks. Give 6 detailed recommendations. HTML with <ul><li>.`
      :`Water monitoring: Submeter ${currentBuilding}, total ${bldg.total.toFixed(3)} m³, no leaks. Give 6 water conservation recommendations. HTML with <ul><li>.`;
    const html=await callClaudeAPI(prompt);
    panel.innerHTML='<h2>🤖 AI Recommendations</h2>'+html;
  } catch(e){
    // Keep existing content on error
  }
}

function openAIRecommendModal() {
  document.getElementById('aiRecommendModal').classList.add('show');
  document.getElementById('aiLoading').style.display='flex';
  document.getElementById('aiContent').innerHTML='';
  const bldg=buildings[currentBuilding];
  
  callClaudeAPI(`Water monitoring system alert for Submeter ${currentBuilding}. Total consumption: ${bldg.total.toFixed(2)} m³. Leak events: ${leakCount}. Provide recommendations in HTML with <h3> headings and <ul><li> items.`)
    .then(html=>{document.getElementById('aiLoading').style.display='none';document.getElementById('aiContent').innerHTML=html;})
    .catch(e=>{document.getElementById('aiLoading').style.display='none';document.getElementById('aiContent').innerHTML='<div class="ai-error">⚠ AI unavailable: '+e.message+'</div>';});
}
function closeAIRecommendModal() { document.getElementById('aiRecommendModal').classList.remove('show'); }

async function callClaudeAPI(prompt) {
  const res=await apiFetch('/api/ai/recommend',{method:'POST',body:JSON.stringify({prompt})});
  if(!res.ok) throw new Error('API error '+res.status);
  const data=await res.json();
  return data.result||'';
}

/* ══════════════════════════════════════════════════
   HISTORY — Month accordion with Day drill-down
══════════════════════════════════════════════════ */

// Entry point: called when history section opens
async function renderHistory() {
  await renderHistoryMonths();
}

async function renderHistoryMonths() {
  const monthView = document.getElementById('historyMonthView');
  const dayView   = document.getElementById('historyDayView');
  const ul        = document.getElementById('historyMonthList');
  const empty     = document.getElementById('historyEmpty');
  if (!monthView || !ul) return;

  dayView  && (dayView.style.display = 'none');
  monthView.style.display = '';
  ul.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px">Loading history…</div>';
  if (empty) empty.style.display = 'none';

  // Populate submeter filter dropdown on first load
  const filterEl = document.getElementById('historySubmeterFilter');
  if (filterEl && filterEl.options.length === 1) {
    ['A','B'].forEach(b => {
      const subId = submetersMap[b];
      if (!subId) return;
      const opt = document.createElement('option');
      opt.value = subId;
      opt.textContent = b === 'A' ? 'Submeter 1' : 'Submeter 2';
      filterEl.appendChild(opt);
    });
  }
  const filterVal = filterEl ? filterEl.value : 'all';

  try {
    const url = filterVal !== 'all'
      ? `/api/consumption/history/months?submeter_id=${filterVal}`
      : '/api/consumption/history/months';

    const res = await apiFetch(url);
    if (!res.ok) throw new Error('API error ' + res.status);
    const data = await res.json();

    ul.innerHTML = '';
    let hasAny = false;

    data.forEach(subData => {
      if (!subData.months || subData.months.length === 0) return;
      hasAny = true;

      // Sub-header label
      const subLabel = document.createElement('li');
      subLabel.style.cssText = 'color:var(--text-muted);font-size:11px;font-weight:600;letter-spacing:.08em;padding:14px 0 6px;text-transform:uppercase;';
      subLabel.textContent = (subData.type === 'A') ? '📟 Submeter 1' : '📟 Submeter 2';
      ul.appendChild(subLabel);

      subData.months.forEach(m => {
        const li = document.createElement('li');
        li.className = 'history-item';
        li.style.cursor = 'pointer';
        li.innerHTML = `
          <div class="history-meta" style="flex:1;">
            <span class="history-label">📅 ${m.month_name}</span>
            <span class="history-stats">
              ${m.days_with_data} day${m.days_with_data !== 1 ? 's' : ''} recorded
              &nbsp;·&nbsp; Total: <strong style="color:var(--cyan)">${m.total_m3.toFixed(3)} m³</strong>
              (${(m.total_m3 * 1000).toFixed(0)} L)
            </span>
          </div>
          <span style="color:var(--text-muted);font-size:18px;padding-left:8px;">›</span>
        `;
        li.addEventListener('click', () => {
          openHistoryDayView(subData.submeter_id, m.year, m.month, m.month_name);
        });
        ul.appendChild(li);
      });
    });

    if (!hasAny) {
      ul.innerHTML = '';
      if (empty) { empty.style.display = 'block'; empty.textContent = 'No history recorded yet.'; }
    }

  } catch (e) {
    console.error('[History] Failed to load months:', e);
    ul.innerHTML = '<div style="color:var(--text-muted);padding:20px;text-align:center;">Failed to load history. Try refreshing.</div>';
  }
}

async function openHistoryDayView(submeterId, year, month, monthName) {
  const monthView = document.getElementById('historyMonthView');
  const dayView   = document.getElementById('historyDayView');
  const titleEl   = document.getElementById('historyDayTitle');
  const summaryEl = document.getElementById('historyDaySummary');
  const dayUl     = document.getElementById('historyDayList');
  if (!dayView || !dayUl) return;

  monthView && (monthView.style.display = 'none');
  dayView.style.display = '';
  if (titleEl)   titleEl.textContent = monthName;
  if (summaryEl) summaryEl.innerHTML = '<span style="color:var(--text-muted)">Loading day-by-day data…</span>';
  dayUl.innerHTML = '';

  try {
    const res = await apiFetch(
      `/api/consumption/history/days?submeter_id=${submeterId}&year=${year}&month=${month}`
    );
    if (!res.ok) throw new Error('API error ' + res.status);
    const data = await res.json();

    if (summaryEl) {
      const activeDays = data.days.filter(d => d.consumption_m3 > 0).length;
      summaryEl.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;gap:18px;font-size:13px;">
          <span>📅 <strong>${data.month_name}</strong></span>
          <span>💧 Total: <strong style="color:var(--cyan)">${data.total_m3.toFixed(3)} m³</strong> (${(data.total_m3*1000).toFixed(0)} L)</span>
          <span>📊 ${activeDays} active day${activeDays!==1?'s':''}</span>
          <span>🔢 Baseline: ${data.baseline} m³</span>
        </div>
      `;
    }

    const MONTHS_ABBR = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthAbbr = MONTHS_ABBR[month] || '';

    data.days.forEach(d => {
      const hasData = d.consumption_m3 > 0 || d.meter_reading !== null;
      const li = document.createElement('li');
      li.className = 'history-item';
      if (!hasData) li.style.opacity = '0.4';

      const meterStr = d.meter_reading !== null
        ? `Meter: ${d.meter_reading.toFixed(3)} m³` : 'No meter reading';
      const consumedStr = d.consumption_m3 > 0
        ? `+${d.consumption_m3.toFixed(3)} m³ (${d.consumption_liters.toFixed(0)} L)` : '—';
      const timeStr = d.meter_reading_time
        ? new Date(d.meter_reading_time).toLocaleString('en-PH', {
            timeZone:'Asia/Manila', hour:'2-digit', minute:'2-digit', hour12:true
          })
        : '';

      li.innerHTML = `
        <div class="history-meta" style="flex:1;">
          <span class="history-label">
            📸 ${monthAbbr} ${d.day}, ${year}${timeStr ? '&nbsp;·&nbsp;' + timeStr : ''}
          </span>
          <span class="history-stats">
            ${meterStr}
            <span style="color:var(--cyan);margin-left:8px;">${consumedStr}</span>
          </span>
        </div>
      `;
      dayUl.appendChild(li);
    });

  } catch (e) {
    console.error('[History] Failed to load days:', e);
    if (summaryEl) summaryEl.innerHTML = '<span style="color:red;">Failed to load. Try again.</span>';
  }
}

function closeHistoryDayView() {
  const monthView = document.getElementById('historyMonthView');
  const dayView   = document.getElementById('historyDayView');
  if (dayView)   dayView.style.display = 'none';
  if (monthView) monthView.style.display = '';
}

/* ══════════════════════════════════════════════════
   PDF GENERATION
══════════════════════════════════════════════════ */
async function buildDailyPDFDoc() {
  const {jsPDF}=window.jspdf;const doc=new jsPDF();
  const now=new Date();
  const submeterName=currentBuilding==='A'?'Submeter 1':'Submeter 2';
  const subId=submetersMap[currentBuilding]||1;

  // Load actual readings from database
  let readings=[];
  try {
    const res=await apiFetch(`/api/readings/?submeter_id=${subId}&limit=500`);
    if(res.ok) readings=await res.json();
  } catch(e){}
  readings.sort((a,b)=>new Date(a.reading_time)-new Date(b.reading_time));

  // Filter today's readings
  const todayStr=now.toISOString().slice(0,10);
  const todayReadings=readings.filter(r=>r.reading_time&&r.reading_time.slice(0,10)===todayStr);
  const allReadings=readings.length>0?readings:todayReadings;

  // Calculate totals
  const firstReading=allReadings.length>0?parseFloat(allReadings[0].ocr_value):0;
  const lastReading=allReadings.length>0?parseFloat(allReadings[allReadings.length-1].ocr_value):0;
  const totalConsumed=Math.max(0,lastReading-firstReading);
  const todayFirst=todayReadings.length>0?parseFloat(todayReadings[0].ocr_value):0;
  const todayLast=todayReadings.length>0?parseFloat(todayReadings[todayReadings.length-1].ocr_value):0;
  const todayConsumed=Math.max(0,todayLast-todayFirst);

  let remark='Normal — Consumption is within expected range.',remarkColor=[0,150,80];
  if(todayConsumed>20){remark='High Usage — Consumption is above average. Monitor closely.';remarkColor=[200,120,0];}
  else if(todayReadings.length===0){remark='No Reading — No consumption recorded today. Check meter or camera.';remarkColor=[100,100,100];}

  // Header
  doc.setFillColor(8,13,26);doc.rect(0,0,210,30,'F');
  doc.setTextColor(0,212,255);doc.setFontSize(16);doc.setFont('helvetica','bold');doc.text('WATER MONITORING',20,13);
  doc.setFontSize(9);doc.setTextColor(180,200,220);doc.text('Daily Water Consumption Report',20,21);
  doc.setTextColor(150,170,190);doc.text(`${submeterName}  |  ${now.toLocaleDateString('en-PH',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}`,20,27);
  doc.setDrawColor(0,212,255);doc.setLineWidth(0.5);doc.line(20,33,190,33);

  // Meter Readings section
  doc.setFontSize(11);doc.setTextColor(0,212,255);doc.setFont('helvetica','bold');doc.text('METER READINGS',20,43);
  doc.setFontSize(10);let y=51;
  [['First Reading',firstReading.toFixed(3)+' m³'],['Latest Reading',lastReading.toFixed(3)+' m³'],['Total Consumed',totalConsumed.toFixed(3)+' m³  ('+(totalConsumed*1000).toFixed(0)+' L)'],['Today Consumed',todayConsumed.toFixed(3)+' m³  ('+(todayConsumed*1000).toFixed(0)+' L)'],['Total Readings',allReadings.length.toString()]].forEach(([l,v])=>{doc.setFont('helvetica','bold');doc.setTextColor(80,80,80);doc.text(l+':',22,y);doc.setFont('helvetica','normal');doc.setTextColor(20,20,20);doc.text(v,100,y);y+=9;});
  doc.setDrawColor(220,220,220);doc.line(20,y+2,190,y+2);y+=10;

  // Reading log table
  if(allReadings.length>0){
    doc.setFontSize(11);doc.setTextColor(0,212,255);doc.setFont('helvetica','bold');doc.text('READING LOG',20,y);y+=8;
    doc.setFillColor(30,40,70);doc.rect(20,y,170,8,'F');doc.setFontSize(8);doc.setTextColor(200,220,255);doc.setFont('helvetica','bold');
    doc.text('Time',24,y+5.5);doc.text('Meter (m³)',80,y+5.5);doc.text('Consumed (m³)',120,y+5.5);doc.text('Liters',165,y+5.5);y+=10;
    doc.setFont('helvetica','normal');doc.setFontSize(8);
    let prev=null;
    allReadings.forEach((r,i)=>{
      if(y>265){doc.addPage();y=20;}
      const val=parseFloat(r.ocr_value);
      const delta=prev!==null?Math.max(0,val-prev):0;
      const time=new Date(r.reading_time).toLocaleTimeString('en-PH',{timeZone:'Asia/Manila',hour:'2-digit',minute:'2-digit',second:'2-digit'});
      if(i%2===0){doc.setFillColor(245,247,252);doc.rect(20,y-4,170,8,'F');}
      doc.setTextColor(40,40,40);
      doc.text(time,24,y+1);
      doc.text(val.toFixed(3),80,y+1);
      doc.text(delta>0?'+'+delta.toFixed(3):'—',120,y+1);
      doc.text(delta>0?(delta*1000).toFixed(0):'—',165,y+1);
      y+=8;
      prev=val;
    });
    y+=4;
  }

  // Remark
  if(y>255){doc.addPage();y=20;}
  doc.setFontSize(11);doc.setTextColor(0,212,255);doc.setFont('helvetica','bold');doc.text('STATUS & REMARKS',20,y);y+=10;
  doc.setFillColor(...remarkColor.map(c=>c*0.15+240));doc.roundedRect(20,y,170,18,3,3,'F');doc.setDrawColor(...remarkColor);doc.setLineWidth(0.8);doc.roundedRect(20,y,170,18,3,3,'S');doc.setFontSize(9);doc.setTextColor(...remarkColor);doc.setFont('helvetica','bold');doc.text('REMARK:',25,y+7);doc.setFont('helvetica','normal');doc.text(doc.splitTextToSize(remark,130),55,y+7);

  // Footer
  const footerY=doc.internal.pageSize.height-14;doc.setDrawColor(200,200,200);doc.line(20,footerY,190,footerY);doc.setFontSize(8);doc.setTextColor(150,150,150);doc.text(`Generated by Water Monitoring System — BSU-Lipa  |  ${now.toLocaleString('en-PH',{timeZone:'Asia/Manila'})}`,20,footerY+7);
  return doc;
}

async function previewDailyPDF() {
  const doc=await buildDailyPDFDoc();
  const modal=document.getElementById('dailyPdfModal');
  if(modal.parentElement!==document.body) document.body.appendChild(modal);
  document.getElementById('dailyPdfFrame').src=doc.output('bloburl');
  modal.style.cssText='display:flex !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important;z-index:99999 !important;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;background:rgba(0,0,0,.85);';
}
function closeDailyPdfModal() { const modal=document.getElementById('dailyPdfModal');modal.style.cssText='';modal.classList.remove('show');document.getElementById('dailyPdfFrame').src=''; }
async function generateDailyPDF() { const doc=await buildDailyPDFDoc();doc.save(`Daily_Report_${currentBuilding==='A'?'Submeter1':'Submeter2'}_${new Date().toISOString().slice(0,10)}.pdf`); }

function buildMonthlyPDFDoc() {
  const {jsPDF}=window.jspdf;const doc=new jsPDF();
  const bldg=buildings[currentBuilding];const now=new Date();
  const submeterName=currentBuilding==='A'?'Submeter 1':'Submeter 2';
  const monthLabel=now.toLocaleDateString('en-PH',{month:'long',year:'numeric'});
  const totalConsumed=bldg.total;
  const totalReadings=bldg.monthlyData.length;
  const avgDaily=totalReadings>0?totalConsumed/totalReadings:0;
  const arr=readingsHistory[currentBuilding]||[];
  const byDay=groupByDay(arr),byMonth=groupByMonth(byDay);
  const prevMonthDate=new Date(now.getFullYear(),now.getMonth()-1,1);
  const prevMonthKey=DT.monthKey(prevMonthDate);
  const prevMonthData=byMonth[prevMonthKey];
  const prevTotal=prevMonthData?prevMonthData.total:null;
  const momPct=prevTotal&&prevTotal>0?(((totalConsumed-prevTotal)/prevTotal)*100).toFixed(1):null;
  let remark='Normal month — consumption within expected range.',remarkColor=[0,150,80];
  if(momPct&&parseFloat(momPct)>20){remark=`High usage — ${momPct}% increase vs last month.`;remarkColor=[200,120,0];}
  doc.setFillColor(8,13,26);doc.rect(0,0,210,30,'F');
  doc.setTextColor(245,197,24);doc.setFontSize(16);doc.setFont('helvetica','bold');doc.text('WATER MONITORING',20,13);
  doc.setFontSize(9);doc.setTextColor(180,200,220);doc.text('Monthly Water Consumption Report',20,21);
  doc.setTextColor(150,170,190);doc.text(`${submeterName}  |  ${monthLabel}`,20,27);
  doc.setDrawColor(245,197,24);doc.setLineWidth(0.5);doc.line(20,33,190,33);
  let y=43;doc.setFontSize(11);doc.setTextColor(245,197,24);doc.setFont('helvetica','bold');doc.text('MONTHLY SUMMARY',20,y);y+=10;doc.setFontSize(10);
  [['Month',monthLabel],['Total Consumption',totalConsumed.toFixed(3)+' m³  ('+(totalConsumed*1000).toFixed(0)+' L)'],['Average Daily',avgDaily.toFixed(3)+' m³/day'],['Total Readings',totalReadings.toString()],['Prev. Month Total',prevTotal?prevTotal.toFixed(3)+' m³':'— (no data)'],['Month-over-Month',momPct?(parseFloat(momPct)>=0?'+':'')+momPct+'%':'—']].forEach(([l,v])=>{doc.setFont('helvetica','bold');doc.setTextColor(80,80,80);doc.text(l+':',22,y);doc.setFont('helvetica','normal');doc.setTextColor(20,20,20);doc.text(v,100,y);y+=9;});
  doc.setDrawColor(220,220,220);doc.line(20,y+2,190,y+2);y+=10;
  if(bldg.monthlyData.length>0){
    doc.setDrawColor(220,220,220);doc.line(20,y+2,190,y+2);y+=10;
    doc.setFontSize(11);doc.setTextColor(245,197,24);doc.setFont('helvetica','bold');doc.text('DAILY BREAKDOWN',20,y);y+=8;
    doc.setFillColor(30,40,70);doc.rect(20,y,170,8,'F');doc.setFontSize(8);doc.setTextColor(200,220,255);doc.setFont('helvetica','bold');doc.text('Day',24,y+5.5);doc.text('Consumption (m³)',60,y+5.5);doc.text('Status',120,y+5.5);y+=10;
    doc.setFont('helvetica','normal');doc.setFontSize(8);
    bldg.monthlyData.forEach((val,i)=>{if(y>265){doc.addPage();y=20;}const leak=false;if(i%2===0){doc.setFillColor(245,247,252);doc.rect(20,y-4,170,8,'F');}doc.setTextColor(leak?180:40,leak?30:40,40);doc.text('Day '+(i+1),24,y+1);doc.text(val.toFixed(3),60,y+1);doc.text((val*1000).toFixed(0)+' L',120,y+1);y+=8;});y+=4;
  }
  if(y>255){doc.addPage();y=20;}
  doc.setFillColor(...remarkColor.map(c=>Math.min(255,c*0.15+235)));doc.roundedRect(20,y,170,20,3,3,'F');doc.setDrawColor(...remarkColor);doc.setLineWidth(0.8);doc.roundedRect(20,y,170,20,3,3,'S');doc.setFontSize(9);doc.setTextColor(...remarkColor);doc.setFont('helvetica','bold');doc.text('REMARK:',25,y+8);doc.setFont('helvetica','normal');doc.text(doc.splitTextToSize(remark,125),55,y+8);
  const footerY=doc.internal.pageSize.height-14;doc.setDrawColor(200,200,200);doc.line(20,footerY,190,footerY);doc.setFontSize(8);doc.setTextColor(150,150,150);doc.text(`Generated by Water Monitoring System — BSU-Lipa  |  ${now.toLocaleString('en-PH',{timeZone:'Asia/Manila'})}`,20,footerY+7);
  return doc;
}

function previewMonthlyPDFCurrent() {
  const doc=buildMonthlyPDFDoc();
  const modal=document.getElementById('monthlyPdfModal');
  if(modal.parentElement!==document.body) document.body.appendChild(modal);
  document.getElementById('monthlyPdfFrame').src=doc.output('bloburl');
  modal.style.cssText='display:flex !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important;z-index:99999 !important;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;background:rgba(0,0,0,.85);';
}
function closeMonthlyPdfModal() { const modal=document.getElementById('monthlyPdfModal');modal.style.cssText='';modal.classList.remove('show');document.getElementById('monthlyPdfFrame').src=''; }
function downloadMonthlyPDFCurrent() { const doc=buildMonthlyPDFDoc();doc.save(`Monthly_Report_${currentBuilding==='A'?'Submeter1':'Submeter2'}_${new Date().toISOString().slice(0,7)}.pdf`); }
function closePdfModal() { document.getElementById('pdfModal').classList.remove('show');document.getElementById('pdfFrame').src=''; }

/* ══════════════════════════════════════════════════
   ADMIN
══════════════════════════════════════════════════ */
let pendingAction=null;
async function renderAdminUsers() {
  const pList=document.getElementById('pendingList');
  const aList=document.getElementById('approvedList');
  pList.innerHTML='<div style="text-align:center;padding:20px;color:var(--text-muted);">Loading users…</div>';
  try {
    const allRes=await apiFetch('/api/admin/users');
    console.log('Admin users response status:',allRes.status);
    if(!allRes.ok){
      const errData=await allRes.json().catch(()=>({}));
      console.error('Admin users API error:',allRes.status,errData);
      const dbg=document.getElementById('adminDebugLine');
      if(dbg) dbg.textContent=`⚠ API Error ${allRes.status}: ${errData.error||'Unknown'}`;
      if(dbg) dbg.style.color='var(--red)';
      pList.innerHTML=`<div style="text-align:center;padding:20px;color:var(--red);">⚠ API Error ${allRes.status}: ${errData.error||'Unknown'}</div>`;
      return;
    }
    const allUsers=await allRes.json();
    console.log('All users from API:',allUsers);
    const dbg=document.getElementById('adminDebugLine');
    if(dbg) dbg.textContent=`API OK — ${allUsers.length} total users in database`;
    if(!Array.isArray(allUsers)){
      console.error('Admin API returned non-array',allUsers);
      pList.innerHTML='<div style="text-align:center;padding:20px;color:var(--red);">⚠ Unexpected API response</div>';
      return;
    }
    const pendRes=await apiFetch('/api/admin/users/pending');
    if(!pendRes.ok){
      const errData=await pendRes.json().catch(()=>({}));
      console.error('Pending API error:',pendRes.status,errData);
      return;
    }
    const pending=await pendRes.json();
    console.log('Pending users from API:',pending);
    if(!Array.isArray(pending)){return;}
    const nonAdmin=allUsers.filter(u=>!u.is_admin);
    const approved=nonAdmin.filter(u=>u.is_approved);
    const pendingNonAdmin=pending.filter(u=>!u.is_admin);
    document.getElementById('totalUsers').textContent=nonAdmin.length;
    document.getElementById('pendingCount').textContent=pendingNonAdmin.length;
    document.getElementById('approvedCount').textContent=approved.length;
    document.getElementById('pendingBadge').textContent=pendingNonAdmin.length;
    pList.innerHTML=pendingNonAdmin.length===0?'<div class="empty-state"><div class="empty-state-icon">📭</div><p>No pending verification requests</p></div>':pendingNonAdmin.map(u=>`<div class="user-card" id="ucard-${u.id}"><div class="user-info"><h4>👤 ${u.first_name||''} ${u.last_name||''} <span style="opacity:.5;font-size:12px;">@${u.username}</span></h4><p>📧 ${u.email} · 🕐 ${u.created_at?u.created_at.slice(0,16).replace('T',' '):''}</p></div><div class="user-actions"><button class="btn-approve" onclick="adminApprove(${u.id})">✓ Verify & Approve</button><button class="btn-reject" onclick="adminReject(${u.id})">✗ Reject</button></div></div>`).join('');
    aList.innerHTML=approved.length===0?'<div class="empty-state"><div class="empty-state-icon">👥</div><p>No verified users yet</p></div>':approved.map(u=>`<div class="user-card"><div class="user-info"><h4>👤 ${u.first_name||''} ${u.last_name||''} <span style="opacity:.5;font-size:12px;">@${u.username}</span></h4><p>📧 ${u.email}</p></div><div style="display:flex;align-items:center;gap:12px;"><span class="user-status status-approved">✅ Verified</span><button class="btn-remove" onclick="adminRemove(${u.id})">🗑 Remove</button></div></div>`).join('');
  } catch(e){
    console.error('Failed to load admin users:',e);
    const dbg=document.getElementById('adminDebugLine');
    if(dbg){dbg.textContent='⚠ '+e.message;dbg.style.color='var(--red)';}
    pList.innerHTML=`<div style="text-align:center;padding:20px;color:var(--red);">⚠ Network error: ${e.message}</div>`;
  }
}
async function adminApprove(id) {
  try{const res=await apiFetch(`/api/admin/users/${id}/approve`,{method:'PATCH'});const data=await res.json();if(res.ok){showAdminToast('✅ User approved!');renderAdminUsers();}else showAdminToast('⚠ '+data.error,true);}catch(e){showAdminToast('⚠ Network error',true);}
}
function adminReject(id) { pendingAction={type:'reject',id};document.getElementById('confirmModalTitle').textContent='Reject User?';document.getElementById('confirmModalMsg').textContent='Reject this user? This cannot be undone.';document.getElementById('confirmModal').classList.add('show'); }
function adminRemove(id) { pendingAction={type:'remove',id};document.getElementById('confirmModalTitle').textContent='Remove User?';document.getElementById('confirmModalMsg').textContent='Remove this user? They will need to re-register.';document.getElementById('confirmModal').classList.add('show'); }
function closeConfirmModal() { pendingAction=null;document.getElementById('confirmModal').classList.remove('show'); }
async function doConfirmAction() {
  if(!pendingAction) return;
  const{type,id}=pendingAction;pendingAction=null;document.getElementById('confirmModal').classList.remove('show');
  try{const endpoint=type==='reject'?`/api/admin/users/${id}/reject`:`/api/admin/users/${id}`;const method=type==='remove'?'DELETE':'PATCH';const res=await apiFetch(endpoint,{method});const data=await res.json();if(res.ok){showAdminToast(type==='reject'?'❌ User rejected':'🗑 User removed',true);renderAdminUsers();}else showAdminToast('⚠ '+data.error,true);}catch(e){showAdminToast('⚠ Network error',true);}
}
document.getElementById('confirmModal').addEventListener('click',e=>{if(e.target===document.getElementById('confirmModal'))closeConfirmModal();});
function showAdminToast(msg,isError=false){const t=document.getElementById('adminToast');t.textContent=msg;t.className='toast'+(isError?' error':'');t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3000);}

/* ══════════════════════════════════════════════════
   AUTO CAPTURE & COUNTDOWN
══════════════════════════════════════════════════ */
let autoCaptureTimer=null,countdownTimer=null,captureCountdownVal=10;

function startAutoCapture() {
  if(autoCaptureTimer){clearInterval(autoCaptureTimer);autoCaptureTimer=null;}
  if(countdownTimer){clearInterval(countdownTimer);countdownTimer=null;}
  document.getElementById('captureCountdown').style.display='flex';
  document.getElementById('capturePlaceholder').style.display='block';
  document.getElementById('capturePlaceholder').innerHTML='📸 Capturing every 10s…';
  startCountdownRing();
}

function stopAutoCapture() {
  if(autoCaptureTimer){clearInterval(autoCaptureTimer);autoCaptureTimer=null;}
  if(countdownTimer){clearInterval(countdownTimer);countdownTimer=null;}
  const captureImg=document.getElementById('captureImg');
  captureImg.src='';captureImg.style.display='none';
  document.getElementById('captureCountdown').style.display='none';
  document.getElementById('capturePlaceholder').style.display='block';
  document.getElementById('capturePlaceholder').innerHTML='⏳ Waiting…';
  document.getElementById('captureTimestamp').textContent='';
  document.getElementById('captureOcrBadge').style.display='none';
}

function saveCaptureToCache(bldg) {
  const capImg=document.getElementById('captureImg');const capTs=document.getElementById('captureTimestamp');const ocrBadge=document.getElementById('captureOcrBadge');
  captureCache[bldg]={src:capImg?capImg.src:'',timestamp:capTs?capTs.textContent:'',ocrText:ocrBadge?ocrBadge.textContent:'',ocrDisplay:ocrBadge?ocrBadge.style.display:'none'};
}

/* ══════════════════════════════════════════════════
   AI-ON-THE-EDGE INTEGRATION
══════════════════════════════════════════════════ */
async function fetchAIEdgeJSON(ip) {
  try {
    const resp=await fetch(`/api/proxy/edge/json?ip=${ip}`,{signal:AbortSignal.timeout(5000)});
    if(!resp.ok) return null;
    const data=await resp.json();
    const keys=Object.keys(data);
    for(const k of keys){if(data[k]&&typeof data[k].value!=='undefined')return{...data[k],flowName:k};}
    return null;
  } catch{return null;}
}

async function fetchAIEdgeImage(ip,useAnnotated=true) {
  const endpoint=useAnnotated?'alg_roi':'raw';
  try {
    const resp=await fetch(`/api/proxy/edge/${endpoint}?ip=${ip}&t=${Date.now()}`,{signal:AbortSignal.timeout(8000)});
    if(!resp.ok) throw new Error('HTTP '+resp.status);
    return await resp.blob();
  } catch{if(useAnnotated)return fetchAIEdgeImage(ip,false);return null;}
}

async function triggerAIEdgeFlow(ip) {
  try{await fetch(`/api/proxy/edge/flow_start?ip=${ip}`,{signal:AbortSignal.timeout(3000)});}catch{}
}

async function captureFromESP32() {
  const bldg=currentBuilding;
  const captureImg=document.getElementById('captureImg');
  const tsEl=document.getElementById('captureTimestamp');
  const ocrBadge=document.getElementById('captureOcrBadge');
  const placeholder=document.getElementById('capturePlaceholder');
  const ip=buildingIPs[bldg];
  const mode=cameraMode[bldg]||'ai_edge';
  if(!ip){
    if(placeholder){placeholder.style.display='block';placeholder.innerHTML='⏳ No IP configured…';}
    return;
  }
  const now=new Date();const tsText='📸 '+now.toLocaleTimeString('en-PH',{timeZone:'Asia/Manila'});
  ocrBadge.style.display='inline-flex';tsEl.textContent=tsText;

  try {
    if(mode==='plain') {
      ocrBadge.textContent='📷 Snapshot…';
      const resp=await fetch(`/api/proxy/capture?ip=${ip}&port=80&t=${Date.now()}`,{signal:AbortSignal.timeout(8000)});
      if(resp.ok){
        const blob=await resp.blob();const imgUrl=URL.createObjectURL(blob);
        captureImg.src=imgUrl;captureImg.style.display='block';
        if(placeholder) placeholder.style.display='none';
        setTimeout(()=>URL.revokeObjectURL(imgUrl),60000);
        ocrBadge.textContent='📷 Snapshot (switch to AI-on-the-Edge mode for meter readings)';
        captureCache[bldg].src=captureImg.src;captureCache[bldg].timestamp=tsText;captureCache[bldg].ocrText=ocrBadge.textContent;captureCache[bldg].ocrDisplay='inline-flex';
      } else { ocrBadge.textContent='⚠ Snapshot failed'; }
      saveCaptureToCache(bldg);return;
    }

    // AI-on-the-edge mode
    ocrBadge.textContent='🤖 AI reading…';
    const[imgBlob,jsonResult]=await Promise.all([fetchAIEdgeImage(ip,true),fetchAIEdgeJSON(ip)]);

    if(imgBlob){
      const imgUrl=URL.createObjectURL(imgBlob);
      captureImg.src=imgUrl;captureImg.style.display='block';
      if(placeholder) placeholder.style.display='none';
      captureImg.style.transition='opacity .15s';captureImg.style.opacity='0.3';
      setTimeout(()=>{captureImg.style.opacity='1';},120);
      setTimeout(()=>URL.revokeObjectURL(imgUrl),60000);
    }

    if(jsonResult){
      const reading=parseFloat(jsonResult.value);
      const hasValidReading=!isNaN(reading)&&reading>0;
      const hasError=jsonResult.error&&jsonResult.error!=='no error';
      
      if(hasValidReading){
        // Show the reading even if ESP flagged "Rate too high" — value is still valid
        const rateStr=jsonResult.rate?` • ${parseFloat(jsonResult.rate).toFixed(4)} m³/h`:'';
        const errorNote=hasError?` (${jsonResult.error})`:'';
        const ocrText=`🤖 ${reading.toFixed(3)} m³${rateStr}${errorNote}`;
        if(currentBuilding===bldg) ocrBadge.textContent=ocrText;
        captureCache[bldg].ocrText=ocrText;captureCache[bldg].ocrDisplay='inline-flex';
        if(ocrPreviousValue[bldg]===undefined){ocrPreviousValue[bldg]=reading;}
        else if(reading>ocrPreviousValue[bldg]){ocrPreviousValue[bldg]=reading;}
      } else if(hasError){
        const ocrText=`⚠ ${jsonResult.error}`;
        if(currentBuilding===bldg) ocrBadge.textContent=ocrText;
        captureCache[bldg].ocrText=ocrText;captureCache[bldg].ocrDisplay='inline-flex';
      } else {
        const ocrText='⚠ No AI result — device busy?';
        if(currentBuilding===bldg) ocrBadge.textContent=ocrText;
        captureCache[bldg].ocrText=ocrText;
      }
    } else {
      const ocrText='⚠ No AI result — device busy?';
      if(currentBuilding===bldg) ocrBadge.textContent=ocrText;
      captureCache[bldg].ocrText=ocrText;
    }

    saveCaptureToCache(bldg);
    triggerAIEdgeFlow(ip);

  } catch(err){
    console.error('[AI-EDGE] Capture failed:',err);
    tsEl.textContent='⚠ Capture failed — retrying…';ocrBadge.style.display='none';
    if(placeholder&&captureImg.style.display==='none'){placeholder.style.display='block';placeholder.innerHTML='⚠ Cannot reach AI-on-the-edge — retrying…';}
  }
}

async function refreshAIEdgeStatus() {
  const bldg=currentBuilding;const ip=buildingIPs[bldg];if(!ip) return;
  document.getElementById('aiEdgeFlowStatus').textContent='⏳ loading…';
  document.getElementById('aiEdgeLastValue').textContent='⏳';
  document.getElementById('aiEdgeError').textContent='—';
  try {
    const[jsonResult,flowResp]=await Promise.all([
      fetchAIEdgeJSON(ip),
      fetch(`/api/proxy/edge/statusflow?ip=${ip}`,{signal:AbortSignal.timeout(4000)}).then(r=>r.json()).then(j=>j.raw||j.status||JSON.stringify(j)).catch(()=>null)
    ]);
    if(jsonResult){
      const hasValue=jsonResult.value&&!isNaN(parseFloat(jsonResult.value))&&parseFloat(jsonResult.value)>0;
      const reading=hasValue?parseFloat(jsonResult.value).toFixed(3):'—';
      document.getElementById('aiEdgeLastValue').textContent=hasValue?`${reading} m³`:'—';
      document.getElementById('aiEdgeRate').textContent=jsonResult.rate?`${parseFloat(jsonResult.rate).toFixed(4)} m³/h`:'0.0000 m³/h';
      document.getElementById('aiEdgeError').textContent=jsonResult.error||'—';
      document.getElementById('aiEdgeTimestamp').textContent=jsonResult.timestamp?jsonResult.timestamp.replace('T',' ').substring(0,19):'—';
      const meterDisp=document.getElementById('meterReadingDisplay');if(meterDisp)meterDisp.textContent=hasValue?reading:'—';
      const statusDisp=document.getElementById('deviceStatusDisplay');
      if(statusDisp){
        if(hasValue){statusDisp.innerHTML='<span class="status-dot" style="color:var(--green);background:var(--green);"></span>Online';statusDisp.style.color='var(--green)';}
        else{statusDisp.innerHTML='<span class="status-dot" style="color:var(--gold);background:var(--gold);"></span>'+(jsonResult.error||'Unknown');statusDisp.style.color='var(--gold)';}
      }
    } else {
      document.getElementById('aiEdgeLastValue').textContent='⚠ offline';
      document.getElementById('aiEdgeError').textContent='Cannot reach device';
      const meterDisp=document.getElementById('meterReadingDisplay');if(meterDisp)meterDisp.textContent='—';
      const statusDisp=document.getElementById('deviceStatusDisplay');
      if(statusDisp){statusDisp.innerHTML='<span class="status-dot" style="color:var(--red);background:var(--red);"></span>Offline';statusDisp.style.color='var(--red)';}
    }
    if(flowResp) document.getElementById('aiEdgeFlowStatus').textContent=flowResp.trim()||'—';
    else document.getElementById('aiEdgeFlowStatus').textContent='—';
  } catch(e){document.getElementById('aiEdgeFlowStatus').textContent='⚠ Error';document.getElementById('aiEdgeLastValue').textContent='—';}
}

async function manualTriggerFlow() {
  const ip=buildingIPs[currentBuilding];if(!ip) return;
  const btn=event.target;btn.textContent='⏳ Triggering…';btn.disabled=true;
  await triggerAIEdgeFlow(ip);
  setTimeout(()=>{btn.textContent='▶ Trigger Flow';btn.disabled=false;},1500);
  setTimeout(refreshAIEdgeStatus,3000);
}
async function lightOnEdge()  { const ip=buildingIPs[currentBuilding];if(ip)await fetch(`/api/proxy/edge/lighton?ip=${ip}`).catch(()=>{}); }
async function lightOffEdge() { const ip=buildingIPs[currentBuilding];if(ip)await fetch(`/api/proxy/edge/lightoff?ip=${ip}`).catch(()=>{}); }

async function setPreValueOnDevice() {
  const ip=buildingIPs[currentBuilding];
  if(!ip){alert('No ESP32 IP configured.');return;}
  try {
    const result=await fetchAIEdgeJSON(ip);
    let currentVal=0;
    if(result&&result.value) currentVal=parseFloat(result.value);
    const val=prompt('Set PreValue to match current meter reading.\n\nCurrent AI reading: '+(currentVal||'unknown')+' m³\n\nEnter the correct meter value:',currentVal?currentVal.toFixed(3):'0');
    if(val===null||val==='') return;
    const numVal=parseFloat(val);
    if(isNaN(numVal)){alert('Please enter a valid number.');return;}
    // Use proxy to set PreValue on ESP32
    await fetch(`/api/proxy/edge/setprevalue?ip=${ip}&value=${numVal.toFixed(4)}`,{signal:AbortSignal.timeout(5000)}).catch(()=>{});
    alert('PreValue set to '+numVal.toFixed(3)+' m³.\n\nClick "Trigger Flow" to verify.');
    _lastPolledValue[currentBuilding]=numVal;
    ocrPreviousValue[currentBuilding]=numVal;
    buildings[currentBuilding].previous=numVal;
    setTimeout(refreshAIEdgeStatus,2000);
  } catch(e){alert('Error: '+e.message);}
}

setInterval(()=>{
  const dashActive=document.getElementById('dashboardPage')?.classList.contains('active');
  if(dashActive) refreshAIEdgeStatus();
},30000);

/* ── REAL-TIME CHART POLLING ─────────────────────── */
/* Polls AI-on-the-Edge every 30s and processes any new readings into charts */
let _lastPolledValue={A:null,B:null};
async function pollEdgeForCharts() {
  for(const bldg of ['A','B']) {
    const ip=buildingIPs[bldg];
    if(!ip) continue;
    try {
      const result=await fetchAIEdgeJSON(ip);
      if(!result) continue;
      
      // Accept reading even if error is "Rate too high" — the value is still valid
      // Only skip if there's truly no value
      const reading=parseFloat(result.value);
      if(isNaN(reading)||reading<=0) continue;

      // Log rate errors but still use the reading
      if(result.error&&result.error!=='no error') {
        console.log('[HydraTrack] ESP returned:',result.error,'but value',reading,'is valid — using it');
      }

      // Initialize previous value if first poll
      if(_lastPolledValue[bldg]===null) {
        _lastPolledValue[bldg]=reading;
        ocrPreviousValue[bldg]=reading;
        buildings[bldg].previous=reading;
        if(bldg===currentBuilding) {
          const rateStr=result.rate?parseFloat(result.rate).toFixed(4)+' m³/h':'0.0000 m³/h';
          document.getElementById('percentageChange').innerText='Meter: '+reading.toFixed(3)+' m³  |  Rate: '+rateStr;
        }
        continue;
      }

      // Process if reading changed (water is flowing)
      if(reading>_lastPolledValue[bldg]) {
        const delta=reading-_lastPolledValue[bldg];
        // Reject spikes > 50 m³ per poll cycle (obviously misread)
        if(delta>50) { console.warn('[HydraTrack] Spike rejected:',delta,'m³ for',bldg); continue; }
        const savedBuilding=currentBuilding;
        currentBuilding=bldg;
        processReading(_lastPolledValue[bldg],reading);
        syncChartsSection();
        currentBuilding=savedBuilding;
        _lastPolledValue[bldg]=reading;
      }

      // Always update meter display for active submeter
      if(bldg===currentBuilding) {
        const rateStr=result.rate?parseFloat(result.rate).toFixed(4)+' m³/h':'0.0000 m³/h';
        document.getElementById('percentageChange').innerText='Meter: '+reading.toFixed(3)+' m³  |  Rate: '+rateStr;
      }
    } catch(e){}
  }
}
setInterval(pollEdgeForCharts,15000);
setInterval(loadDashRecommendations,60000); // Refresh AI recommendations every 60s
setTimeout(pollEdgeForCharts,5000);

function startCountdownRing() {
  if(countdownTimer) clearInterval(countdownTimer);
  captureCountdownVal=10;
  const numEl=document.getElementById('countdownNum');
  const ring=document.getElementById('countdownRing');
  const circum=75.4;
  const cdEl=document.getElementById('captureCountdown');
  if(cdEl) cdEl.style.display='flex';
  if(numEl) numEl.textContent='10';
  if(ring)  ring.style.strokeDashoffset='0';
  countdownTimer=setInterval(()=>{
    captureCountdownVal--;
    if(numEl) numEl.textContent=Math.max(captureCountdownVal,0);
    if(ring)  ring.style.strokeDashoffset=((10-Math.max(captureCountdownVal,0))/10*circum).toFixed(1);
    if(captureCountdownVal<=0){
      captureCountdownVal=10;
      if(numEl) numEl.textContent='10';
      if(ring)  ring.style.strokeDashoffset='0';
      captureFromESP32();
    }
  },1000);
}

/* ══════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════ */
(async function init() {
  if(sessionStorage.getItem('loggedIn')==='true'&&getToken()){
    try {
      const res=await apiFetch('/api/auth/me');
      if(res.ok){
        const user=await res.json();setUser(user);
        sessionStorage.setItem('username',user.username);
        showPage('dashboardPage');
        if(user.is_admin) {document.getElementById('adminBtn').style.display='inline-block';}
        else {document.getElementById('adminBtn').style.display='none';const ac=document.getElementById('adminEdgeControls');if(ac)ac.style.display='none';}
        
        await loadDeviceIPsFromAPI();
        autoConnectAllCameras();
        startAutoCapture();
        loadReadingsHistoryFromAPI();
        setTimeout(preInitChartsIfNeeded,400);
        loadDashRecommendations();
        return;
      }
    } catch(e){}
    clearToken();
  }
  showPage('loginPage');
})();

/* ══════════════════════════════════════════════════
   SIMULATION MODE — Demo for thesis defense
   Simulates 2 water meters with realistic readings
   Submeter 1 (Herco-Tech): starts at 19 m³
   Submeter 2 (Aqua Jet): starts at 1754 m³
══════════════════════════════════════════════════ */
let SIM_MODE=false, SIM_TIMER=null, SIM_TICK=0, SIM_SPEED=8000;
let SIM_READINGS={A:19.000, B:1754.000};

function startSimulation() {
  if(SIM_MODE) return;
  SIM_MODE=true; SIM_TICK=0;
  SIM_READINGS={A:19.000, B:1754.000};
  _lastPolledValue.A=SIM_READINGS.A; _lastPolledValue.B=SIM_READINGS.B;
  buildings.A.previous=SIM_READINGS.A; buildings.B.previous=SIM_READINGS.B;
  buildings.A.total=0; buildings.B.total=0;
  ocrPreviousValue.A=SIM_READINGS.A; ocrPreviousValue.B=SIM_READINGS.B;
  resetCharts();
  const statusEl=document.getElementById('deviceStatusDisplay');
  if(statusEl) statusEl.innerHTML='<span class="status-dot" style="background:var(--green);"></span>Online (Sim)';
  const btn=document.getElementById('simToggleBtn');
  if(btn){btn.textContent='⏹ Stop Sim';btn.style.background='var(--red-dim)';btn.style.color='var(--red)';btn.style.borderColor='rgba(248,113,113,0.3)';}
  SIM_TIMER=setInterval(simTick, SIM_SPEED);
  setTimeout(simTick, 500);
}

function stopSimulation() {
  SIM_MODE=false;
  if(SIM_TIMER){clearInterval(SIM_TIMER);SIM_TIMER=null;}
  const btn=document.getElementById('simToggleBtn');
  if(btn){btn.textContent='▶ Start Sim';btn.style.background='var(--cyan-dim)';btn.style.color='var(--cyan)';btn.style.borderColor='rgba(56,189,248,0.3)';}
  const statusEl=document.getElementById('deviceStatusDisplay');
  if(statusEl) statusEl.innerHTML='<span class="status-dot" style="background:var(--text-muted);"></span>Sim Stopped';
}

function toggleSimulation() { if(SIM_MODE) stopSimulation(); else startSimulation(); }

function simTick() {
  SIM_TICK++;
  for(const bldg of ['A','B']) {
    const prev=SIM_READINGS[bldg];
    let delta=0.001 + Math.random()*0.007;
    if(SIM_TICK % 12 === 0) delta=0.02 + Math.random()*0.03;
    SIM_READINGS[bldg]=+(prev+delta).toFixed(4);
    const savedBuilding=currentBuilding;
    currentBuilding=bldg;
    processReading(prev, SIM_READINGS[bldg]);
    currentBuilding=savedBuilding;
    _lastPolledValue[bldg]=SIM_READINGS[bldg];
  }
  const meterEl=document.getElementById('meterReadingDisplay');
  if(meterEl) meterEl.textContent=SIM_READINGS[currentBuilding].toFixed(3);
  const lastValEl=document.getElementById('aiEdgeLastValue');
  if(lastValEl) lastValEl.textContent=SIM_READINGS[currentBuilding].toFixed(3)+' m³';
  const tsEl=document.getElementById('aiEdgeTimestamp');
  if(tsEl) tsEl.textContent=phDateTime();
  const statusEl=document.getElementById('deviceStatusDisplay');
  if(statusEl) statusEl.innerHTML='<span class="status-dot" style="background:var(--green);"></span>Online (Sim)';
  document.getElementById('percentageChange').innerText='Meter: '+SIM_READINGS[currentBuilding].toFixed(3)+' m³';
  const captureImg=document.getElementById('captureImg');
  const placeholder=document.getElementById('capturePlaceholder');
  if(placeholder) placeholder.style.display='none';
  const ocrBadge=document.getElementById('captureOcrBadge');
  if(ocrBadge){ocrBadge.style.display='inline-flex';ocrBadge.textContent='🤖 '+SIM_READINGS[currentBuilding].toFixed(3)+' m³';}
  const tsCapEl=document.getElementById('captureTimestamp');
  if(tsCapEl) tsCapEl.textContent='📸 '+phTime();
  if(chartsSectionInited) syncChartsSection();
}

/* ══════════════════════════════════════════════════
   HOURLY AUTO-CAPTURE
   ESP32 captures every 60 min (config.ini Interval=60).
   Website polls at the same cadence to refresh the UI.
   Server-side Claude Vision handles the OCR — ESP32
   only posts the JPEG image via Webhook.
══════════════════════════════════════════════════ */
const CAPTURE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

setInterval(async () => {
  const ip = buildingIPs[currentBuilding];
  if (ip) {
    console.log('[HydraTrack] Hourly capture poll — Submeter', currentBuilding);
    await captureFromESP32();
  }
  // Refresh history if it's open
  if (document.getElementById('historySection') &&
      document.getElementById('historySection').classList.contains('active')) {
    renderHistoryMonths();
  }
  // Refresh dashboard totals
  loadReadingsHistoryFromAPI();
}, CAPTURE_INTERVAL_MS);
