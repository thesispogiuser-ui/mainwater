/* ═══════════════════════════════════════════════════════════════════
   HYDRATRACK v3 ADDITIONS
   Add these functions to hydratrack.js (append at bottom, or replace
   matching functions)

   1. openReportsModal / closeReportsModal — merged report picker
   2. rptGoYear / rptGoMonth — breadcrumb navigation
   3. rptLoadYearView — Jan–Dec grid
   4. rptLoadMonthView — day-by-day breakdown
   5. rptPreviewPDF — inline PDF preview
   6. rptDownloadPDF — download current report PDF
   7. manualCapture (fixed) — works with new capture button HTML
   8. previewDailyPDF / closeDailyPdfModal (stubs kept for compat)
   9. openDeviceSettings / closeDeviceSettings (fixed)
   ═══════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════
   MERGED REPORTS MODAL
   Jan–Dec year overview → click month → day list
   → Preview PDF inline → Download
══════════════════════════════════════════════════ */

const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun',
                     'Jul','Aug','Sep','Oct','Nov','Dec'];

// Current state of the reports modal
let _rpt = {
  view:       'year',   // 'year' | 'month' | 'pdf'
  year:       new Date().getFullYear(),
  month:      null,     // 1-based
  monthName:  '',
  dayData:    null,     // full API response for selected month
  pdfDoc:     null,     // current jsPDF doc
  pdfType:    null,     // 'daily' | 'monthly'
};

function openReportsModal() {
  // Sync submeter select with current building
  const sel = document.getElementById('rptSubmeterSel');
  if (sel) sel.value = currentBuilding || 'A';

  document.getElementById('reportsModal').style.display = 'flex';
  _rpt.view = 'year';
  _rpt.month = null;
  _rpt.pdfDoc = null;
  rptShowView('year');
  rptLoadYearView();
}

function closeReportsModal() {
  document.getElementById('reportsModal').style.display = 'none';
  // Clear iframe to free memory
  const frame = document.getElementById('rptPdfFrame');
  if (frame) frame.src = '';
}

function rptReload() {
  // When submeter changes, sync the building and reload current view
  const sel = document.getElementById('rptSubmeterSel');
  if (sel) switchBuilding(sel.value);
  if (_rpt.view === 'year') rptLoadYearView();
  else if (_rpt.view === 'month' && _rpt.month) rptLoadMonthView(_rpt.year, _rpt.month, _rpt.monthName);
}

function rptShowView(view) {
  ['rptYearView','rptMonthView','rptPdfView','rptLoading'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const pdfBar = document.getElementById('rptPdfBar');
  if (pdfBar) pdfBar.style.display = 'none';

  const dlBtn = document.getElementById('rptDownloadBtn');

  if (view === 'loading') {
    document.getElementById('rptLoading').style.display = 'block';
    if (dlBtn) dlBtn.style.display = 'none';
  } else if (view === 'year') {
    document.getElementById('rptYearView').style.display = 'block';
    if (dlBtn) dlBtn.style.display = 'none';
    // Breadcrumb
    document.getElementById('rpt-crumb-month').style.display = 'none';
    document.getElementById('rpt-crumb-day').style.display = 'none';
  } else if (view === 'month') {
    document.getElementById('rptMonthView').style.display = 'block';
    if (dlBtn) dlBtn.style.display = 'inline-block';
    document.getElementById('rpt-crumb-month').style.display = 'inline';
    document.getElementById('rpt-crumb-day').style.display = 'none';
  } else if (view === 'pdf') {
    document.getElementById('rptPdfView').style.display = 'block';
    if (pdfBar) pdfBar.style.display = 'flex';
    if (dlBtn) dlBtn.style.display = 'inline-block';
  }
  _rpt.view = view;
}

function rptGoYear() {
  _rpt.month = null;
  _rpt.pdfDoc = null;
  rptShowView('year');
  rptLoadYearView();
}

function rptGoMonth() {
  if (_rpt.month) {
    rptShowView('month');
    if (_rpt.dayData) rptRenderMonthView(_rpt.dayData);
  }
}

/* ── Year view: Jan–Dec grid ── */
async function rptLoadYearView() {
  rptShowView('loading');
  const subId = submetersMap[currentBuilding] || 1;
  let monthsWithData = [];

  try {
    const res = await apiFetch('/api/consumption/history/months?submeter_id=' + subId);
    if (res.ok) {
      const data = await res.json();
      const subData = data.find(s => s.submeter_id === subId) || data[0];
      if (subData && subData.months) monthsWithData = subData.months;
    }
  } catch (e) { console.error('[Reports] year load:', e); }

  // Build a lookup: month number → data
  const dataByMonth = {};
  monthsWithData.forEach(m => { dataByMonth[m.month] = m; });

  const grid = document.getElementById('rptYearGrid');
  grid.innerHTML = '';

  const currentMonth = new Date().getMonth() + 1;
  const currentYear  = new Date().getFullYear();

  for (let m = 1; m <= 12; m++) {
    const mData   = dataByMonth[m];
    const hasData = !!mData;
    const isCurrent = (m === currentMonth && _rpt.year === currentYear);

    const card = document.createElement('div');
    card.style.cssText = [
      'padding:14px 16px',
      'border-radius:10px',
      'border:1px solid ' + (hasData ? 'rgba(56,189,248,0.25)' : 'rgba(255,255,255,0.06)'),
      'background:' + (isCurrent ? 'rgba(56,189,248,0.08)' : hasData ? 'rgba(56,189,248,0.04)' : 'rgba(255,255,255,0.02)'),
      'cursor:' + (hasData ? 'pointer' : 'default'),
      'transition:all .15s',
      'position:relative',
    ].join(';');

    if (hasData) {
      card.onmouseenter = () => { card.style.background = 'rgba(56,189,248,0.14)'; card.style.transform = 'translateY(-2px)'; };
      card.onmouseleave = () => { card.style.background = isCurrent ? 'rgba(56,189,248,0.08)' : 'rgba(56,189,248,0.04)'; card.style.transform = ''; };
      card.onclick = () => rptLoadMonthView(_rpt.year, m, MONTH_NAMES[m - 1] + ' ' + _rpt.year);
    }

    card.innerHTML = `
      <div style="font-size:11px;font-weight:700;font-family:var(--font-mono,monospace);color:${hasData ? 'var(--cyan,#38bdf8)' : 'var(--text-muted,#64748b)'};letter-spacing:.04em;margin-bottom:6px;">
        ${MONTH_SHORT[m - 1].toUpperCase()} ${_rpt.year}
        ${isCurrent ? '<span style="font-size:9px;background:rgba(56,189,248,0.2);color:var(--cyan,#38bdf8);padding:1px 5px;border-radius:3px;margin-left:4px;">NOW</span>' : ''}
      </div>
      ${hasData ? `
        <div style="font-size:13px;font-weight:800;color:var(--text,#e2e8f0);font-family:var(--font-mono,monospace);">${mData.total_m3.toFixed(3)} m³</div>
        <div style="font-size:10px;color:var(--text-muted,#64748b);margin-top:2px;">${mData.days_with_data} days · ${(mData.total_m3*1000).toFixed(0)} L</div>
        <div style="font-size:9px;color:var(--cyan,#38bdf8);margin-top:6px;opacity:.7;">Click to view ›</div>
      ` : `
        <div style="font-size:11px;color:var(--text-muted,#64748b);opacity:.5;">No data</div>
      `}
    `;
    grid.appendChild(card);
  }

  rptShowView('year');
}

/* ── Month view: day-by-day list ── */
async function rptLoadMonthView(year, month, monthName) {
  _rpt.month = month;
  _rpt.monthName = monthName;
  rptShowView('loading');

  // Update breadcrumb
  const lbl = document.getElementById('rpt-crumb-month-label');
  if (lbl) lbl.textContent = monthName;

  const subId = submetersMap[currentBuilding] || 1;
  let dayData = null;
  try {
    const res = await apiFetch(`/api/consumption/history/days?submeter_id=${subId}&year=${year}&month=${month}`);
    if (res.ok) dayData = await res.json();
  } catch (e) { console.error('[Reports] month load:', e); }

  if (!dayData) {
    document.getElementById('rptMonthSummary').innerHTML = '<span style="color:red;">Failed to load data.</span>';
    rptShowView('month');
    return;
  }

  _rpt.dayData = dayData;
  rptRenderMonthView(dayData);
}

function rptRenderMonthView(data) {
  // Summary
  const activeDays = data.days.filter(d => d.consumption_m3 > 0).length;
  document.getElementById('rptMonthSummary').innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:20px;">
      <span>📅 <strong style="color:var(--text,#e2e8f0);">${data.month_name}</strong></span>
      <span>💧 Total: <strong style="color:var(--cyan,#38bdf8);">${data.total_m3.toFixed(3)} m³</strong> (${(data.total_m3*1000).toFixed(0)} L)</span>
      <span>📊 ${activeDays} active day${activeDays!==1?'s':''} of ${data.days.length}</span>
      <span>📐 Avg: ${activeDays>0?(data.total_m3/activeDays).toFixed(3):0} m³/day</span>
      <span>🔢 Baseline: ${data.baseline} m³</span>
    </div>`;

  // Day list
  const list = document.getElementById('rptDayList');
  list.innerHTML = '';
  const MA = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mn = data.month;

  data.days.forEach(d => {
    const hasData = d.consumption_m3 > 0 || d.meter_reading !== null;
    const row = document.createElement('div');
    row.style.cssText = [
      'display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px',
      'padding:10px 14px',
      'border-radius:8px',
      'border:1px solid ' + (hasData ? 'rgba(56,189,248,0.12)' : 'rgba(255,255,255,0.04)'),
      'background:' + (hasData ? 'rgba(56,189,248,0.03)' : 'rgba(255,255,255,0.01)'),
      'opacity:' + (hasData ? '1' : '.38'),
      'transition:background .12s',
    ].join(';');

    const timeStr = d.meter_reading_time
      ? new Date(d.meter_reading_time).toLocaleTimeString('en-PH',{timeZone:'Asia/Manila',hour:'2-digit',minute:'2-digit',hour12:true})
      : '';
    const meterStr = d.meter_reading !== null ? `${d.meter_reading.toFixed(3)} m³` : '—';
    const consumedStr = d.consumption_m3 > 0 ? `+${d.consumption_m3.toFixed(3)} m³` : '—';
    const litersStr = d.consumption_m3 > 0 ? `${d.consumption_liters.toFixed(0)} L` : '';

    row.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-family:var(--font-mono,monospace);font-size:10px;font-weight:700;color:var(--text-muted,#64748b);min-width:40px;">Day ${String(d.day).padStart(2,'0')}</span>
        <span style="font-family:var(--font-mono,monospace);font-size:11px;color:var(--text,#e2e8f0);">${MA[mn]} ${d.day}${timeStr?' · '+timeStr:''}</span>
      </div>
      <div style="display:flex;align-items:center;gap:14px;font-family:var(--font-mono,monospace);font-size:11px;">
        <span style="color:var(--text-muted,#64748b);">${meterStr}</span>
        <span style="color:var(--cyan,#38bdf8);font-weight:700;">${consumedStr}</span>
        ${litersStr?`<span style="color:var(--text-muted,#64748b);font-size:10px;">${litersStr}</span>`:''}
      </div>`;
    list.appendChild(row);
  });

  rptShowView('month');
}

/* ── PDF generation for reports modal ── */
async function rptDownloadPDF() {
  if (!_rpt.month || !_rpt.dayData) { alert('Select a month first.'); return; }

  const dlBtn = document.getElementById('rptDownloadBtn');
  if (dlBtn) { dlBtn.disabled = true; dlBtn.textContent = '⏳ Generating…'; }

  try {
    // Build monthly PDF using the same function from the patch
    const doc = await buildMonthlyPDFDoc_forMonth(_rpt.year, _rpt.month, _rpt.dayData);
    _rpt.pdfDoc = doc;

    // Show inline preview
    rptShowView('pdf');
    document.getElementById('rptPdfFrame').src = doc.output('bloburl');

    if (dlBtn) {
      dlBtn.disabled = false;
      dlBtn.textContent = '⬇ Download PDF';
      dlBtn.onclick = () => {
        const sub = currentBuilding === 'A' ? 'Submeter1' : 'Submeter2';
        doc.save(`Report_${sub}_${_rpt.dayData.month_name.replace(' ','_')}.pdf`);
      };
    }
  } catch (e) {
    console.error('[Reports] PDF error:', e);
    if (dlBtn) { dlBtn.disabled = false; dlBtn.textContent = '⬇ Download PDF'; }
  }
}

/* ── Monthly PDF builder for any month (not just current) ── */
async function buildMonthlyPDFDoc_forMonth(year, month, dayData) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const submeterName = currentBuilding === 'A' ? 'Submeter 1' : 'Submeter 2';
  const now = new Date();

  const days      = dayData.days;
  const total     = dayData.total_m3;
  const baseline  = dayData.baseline;
  const activeDays = days.filter(d => d.consumption_m3 > 0).length;
  const avgDaily  = activeDays > 0 ? total / activeDays : 0;

  let remark = 'Normal month — consumption within expected range.';
  let remarkColor = [0, 150, 80];
  if (total === 0) { remark = 'No data recorded this month.'; remarkColor = [100,100,100]; }
  else if (avgDaily > 3) { remark = 'High monthly usage — average daily above expected range.'; remarkColor = [200,120,0]; }

  // Header
  doc.setFillColor(8,13,26); doc.rect(0,0,210,30,'F');
  doc.setTextColor(245,197,24); doc.setFontSize(16); doc.setFont('helvetica','bold');
  doc.text('WATER MONITORING',20,13);
  doc.setFontSize(9); doc.setTextColor(180,200,220);
  doc.text('Monthly Water Consumption Report',20,21);
  doc.setTextColor(150,170,190);
  doc.text(`${submeterName}  |  ${dayData.month_name}`,20,27);
  doc.setDrawColor(245,197,24); doc.setLineWidth(0.5); doc.line(20,33,190,33);

  // Summary
  let y = 43;
  doc.setFontSize(11); doc.setTextColor(245,197,24); doc.setFont('helvetica','bold');
  doc.text('MONTHLY SUMMARY',20,y); y+=10; doc.setFontSize(10);
  [
    ['Month',             dayData.month_name],
    ['Total Consumption', total.toFixed(3)+' m³  ('+(total*1000).toFixed(0)+' L)'],
    ['Average Daily',     avgDaily.toFixed(3)+' m³/day'],
    ['Active Days',       activeDays+' of '+days.length+' days'],
    ['Baseline',          baseline+' m³'],
  ].forEach(([l,v])=>{
    doc.setFont('helvetica','bold'); doc.setTextColor(80,80,80); doc.text(l+':',22,y);
    doc.setFont('helvetica','normal'); doc.setTextColor(20,20,20); doc.text(v,100,y);
    y+=9;
  });
  doc.setDrawColor(220,220,220); doc.line(20,y+2,190,y+2); y+=10;

  // Daily breakdown table
  doc.setFontSize(11); doc.setTextColor(245,197,24); doc.setFont('helvetica','bold');
  doc.text('DAILY BREAKDOWN',20,y); y+=8;
  doc.setFillColor(30,40,70); doc.rect(20,y,170,8,'F');
  doc.setFontSize(8); doc.setTextColor(200,220,255); doc.setFont('helvetica','bold');
  doc.text('Day',24,y+5.5); doc.text('Date',45,y+5.5);
  doc.text('Meter (m³)',85,y+5.5); doc.text('Consumed',140,y+5.5); doc.text('Liters',168,y+5.5);
  y+=10;
  doc.setFont('helvetica','normal'); doc.setFontSize(8);
  const MA2=['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  days.forEach((d,i)=>{
    if(y>265){doc.addPage();y=20;}
    const has=d.consumption_m3>0||d.meter_reading!==null;
    if(i%2===0){doc.setFillColor(has?245:250,has?247:250,has?252:250);doc.rect(20,y-4,170,8,'F');}
    doc.setTextColor(has?40:160,40,40);
    doc.text('Day '+d.day,24,y+1);
    doc.text(MA2[month]+' '+d.day,45,y+1);
    doc.text(d.meter_reading!==null?d.meter_reading.toFixed(3):'—',85,y+1);
    doc.text(d.consumption_m3>0?'+'+d.consumption_m3.toFixed(3):'—',140,y+1);
    doc.text(d.consumption_m3>0?d.consumption_liters.toFixed(0):'—',168,y+1);
    y+=8;
  });
  y+=2;
  doc.setFillColor(8,13,26); doc.rect(20,y,170,9,'F');
  doc.setTextColor(245,197,24); doc.setFont('helvetica','bold'); doc.setFontSize(8);
  doc.text('MONTHLY TOTAL',24,y+6);
  doc.text(total.toFixed(3),140,y+6);
  doc.text((total*1000).toFixed(0),168,y+6);
  y+=14;

  // Remark
  if(y>255){doc.addPage();y=20;}
  doc.setFontSize(11); doc.setTextColor(245,197,24); doc.setFont('helvetica','bold');
  doc.text('REMARKS',20,y); y+=10;
  doc.setFillColor(...remarkColor.map(c=>Math.min(255,c*0.1+235)));
  doc.roundedRect(20,y,170,20,3,3,'F');
  doc.setDrawColor(...remarkColor); doc.setLineWidth(0.8); doc.roundedRect(20,y,170,20,3,3,'S');
  doc.setFontSize(9); doc.setTextColor(...remarkColor); doc.setFont('helvetica','bold');
  doc.text('REMARK:',25,y+8); doc.setFont('helvetica','normal');
  doc.text(doc.splitTextToSize(remark,125),55,y+8);

  // Footer
  const footerY=doc.internal.pageSize.height-14;
  doc.setDrawColor(200,200,200); doc.line(20,footerY,190,footerY);
  doc.setFontSize(8); doc.setTextColor(150,150,150);
  doc.text(`Generated by Water Monitoring System — BSU-Lipa  |  ${now.toLocaleString('en-PH',{timeZone:'Asia/Manila'})}`,20,footerY+7);
  return doc;
}

/* ══════════════════════════════════════════════════
   FIXED manualCapture — works with new capture button
   HTML in dash_main (uses .capture-btn-main class)
══════════════════════════════════════════════════ */
async function manualCapture(btn) {
  const ip = buildingIPs[currentBuilding];
  if (!ip) {
    // Try to get from device settings inputs as fallback
    const inp = document.getElementById('esp32IpInput' + currentBuilding);
    const fallbackIp = inp ? inp.value.trim() : '';
    if (!fallbackIp) {
      alert('No ESP32 IP configured.\n\nGo to Settings → Device Settings and enter the ESP32 IP address.');
      return;
    }
    buildingIPs[currentBuilding] = fallbackIp;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="cb-icon">⏳</span> Capturing…';
  }

  try {
    await captureFromESP32();
    if (btn) {
      btn.innerHTML = '<span class="cb-icon">✅</span> Captured!';
      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = '<span class="cb-icon">📷</span> Manual Capture';
      }, 2500);
    }
  } catch (e) {
    console.error('[manualCapture]', e);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="cb-icon">📷</span> Manual Capture';
    }
  }
}

/* ══════════════════════════════════════════════════
   OCR BADGE FIX — also update #captureOcrFallback
   when the OCR badge text is set
══════════════════════════════════════════════════ */
(function patchOcrBadge() {
  // Monitor captureOcrBadge content and mirror it to the fallback span
  const observer = new MutationObserver(() => {
    const badge    = document.getElementById('captureOcrBadge');
    const fallback = document.getElementById('captureOcrFallback');
    if (!badge || !fallback) return;
    const txt = badge.textContent.trim();
    if (txt) {
      fallback.textContent = txt;
      fallback.style.color = txt.includes('⚠') ? 'var(--gold)' : 'var(--cyan)';
    }
  });
  // Start observing once DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    const badge = document.getElementById('captureOcrBadge');
    if (badge) observer.observe(badge, { childList:true, characterData:true, subtree:true });
  });
})();

/* ══════════════════════════════════════════════════
   COMPAT STUBS — legacy button calls still work
══════════════════════════════════════════════════ */
function previewDailyPDF()          { openReportsModal(); }
function previewMonthlyPDFCurrent() { openReportsModal(); }
function closeDailyPdfModal()       {
  const m = document.getElementById('dailyPdfModal');
  if (m) { m.style.cssText=''; m.classList.remove('show'); }
  const f = document.getElementById('dailyPdfFrame');
  if (f) f.src='';
}
function closeMonthlyPdfModal() {
  const m = document.getElementById('monthlyPdfModal');
  if (m) { m.style.cssText=''; m.classList.remove('show'); }
  const f = document.getElementById('monthlyPdfFrame');
  if (f) f.src='';
}
async function generateDailyPDF() {
  const doc = await buildDailyPDFDoc();
  doc.save(`Daily_Report_${currentBuilding==='A'?'Submeter1':'Submeter2'}_${new Date().toISOString().slice(0,10)}.pdf`);
}
async function downloadMonthlyPDFCurrent() {
  openReportsModal();
}

/* ══════════════════════════════════════════════════
   FIXED openDeviceSettings — pre-fills fields correctly
══════════════════════════════════════════════════ */
function openDeviceSettings() {
  const ipA = buildingIPs['A'] || '';
  const ipB = buildingIPs['B'] || '';
  const inpA = document.getElementById('esp32IpInputA');
  const inpB = document.getElementById('esp32IpInputB');
  if (inpA) inpA.value = ipA;
  if (inpB) inpB.value = ipB;
  const blA = document.getElementById('baselineInputA');
  const blB = document.getElementById('baselineInputB');
  if (blA) blA.value = buildings && buildings.A ? (buildings.A.baseline || 0) : 0;
  if (blB) blB.value = buildings && buildings.B ? (buildings.B.baseline || 0) : 0;
  const modal = document.getElementById('deviceSettingsModal');
  if (modal) modal.classList.add('show');
}
function closeDeviceSettings() {
  const modal = document.getElementById('deviceSettingsModal');
  if (modal) modal.classList.remove('show');
}
