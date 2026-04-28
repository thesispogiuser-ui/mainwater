/* ═══════════════════════════════════════════════════════════════════════
   HYDRATRACK PATCH v2
   Apply by replacing/adding the following sections in hydratrack.js:

   1.  renderHistory / renderHistoryMonths / openHistoryDayView (REPLACE)
   2.  buildDailyPDFDoc   → pulls 24-h DB readings (REPLACE)
   3.  buildMonthlyPDFDoc → pulls day-by-day from DB (REPLACE)
   4.  manualCapture      → new function (ADD)
   5.  hourly auto-capture interval (REPLACE simulation block at end)
   ═══════════════════════════════════════════════════════════════════════ */


/* ══════════════════════════════════════════════════
   1. HISTORY — Month accordion + Day drill-down
══════════════════════════════════════════════════ */

async function renderHistory() { await renderHistoryMonths(); }

async function renderHistoryMonths() {
  const monthView = document.getElementById('historyMonthView');
  const dayView   = document.getElementById('historyDayView');
  const ul        = document.getElementById('historyMonthList');
  const empty     = document.getElementById('historyEmpty');
  if (!monthView || !ul) return;

  if (dayView)  dayView.style.display  = 'none';
  monthView.style.display = '';
  ul.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:24px">⏳ Loading history…</div>';
  if (empty) empty.style.display = 'none';

  // Populate submeter filter (once)
  const filterEl = document.getElementById('historySubmeterFilter');
  if (filterEl && filterEl.options.length === 1) {
    ['A','B'].forEach(b => {
      const subId = submetersMap[b];
      if (!subId) return;
      const opt = document.createElement('option');
      opt.value  = subId;
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
    if (!res.ok) throw new Error('API ' + res.status);
    const data = await res.json();

    ul.innerHTML = '';
    let hasAny = false;

    data.forEach(subData => {
      if (!subData.months || !subData.months.length) return;
      hasAny = true;

      const lbl = document.createElement('li');
      lbl.style.cssText = 'color:var(--text-muted);font-size:10px;font-weight:700;letter-spacing:.1em;padding:16px 0 6px;text-transform:uppercase;font-family:var(--font-mono);';
      lbl.textContent   = subData.type === 'A' ? '📟 Submeter 1' : '📟 Submeter 2';
      ul.appendChild(lbl);

      subData.months.forEach(m => {
        const li = document.createElement('li');
        li.className   = 'history-item';
        li.style.cursor = 'pointer';
        li.innerHTML = `
          <div class="history-meta" style="flex:1;">
            <span class="history-label">📅 ${m.month_name}</span>
            <span class="history-stats">
              ${m.days_with_data} day${m.days_with_data !== 1 ? 's' : ''} recorded
              &nbsp;·&nbsp; Total: <strong style="color:var(--cyan)">${m.total_m3.toFixed(3)} m³</strong>
              &nbsp;(${(m.total_m3 * 1000).toFixed(0)} L)
            </span>
          </div>
          <span style="font-size:18px;color:var(--text-muted);padding-left:8px;">›</span>`;
        li.addEventListener('click', () =>
          openHistoryDayView(subData.submeter_id, m.year, m.month, m.month_name)
        );
        ul.appendChild(li);
      });
    });

    if (!hasAny) {
      ul.innerHTML = '';
      if (empty) { empty.style.display = 'block'; empty.textContent = 'No history yet.'; }
    }
  } catch (e) {
    console.error('[History] load months:', e);
    ul.innerHTML = '<div style="color:var(--text-muted);padding:24px;text-align:center;">Failed to load — try refreshing.</div>';
  }
}

async function openHistoryDayView(submeterId, year, month, monthName) {
  const monthView = document.getElementById('historyMonthView');
  const dayView   = document.getElementById('historyDayView');
  const titleEl   = document.getElementById('historyDayTitle');
  const summaryEl = document.getElementById('historyDaySummary');
  const dayUl     = document.getElementById('historyDayList');
  if (!dayView) return;

  if (monthView) monthView.style.display = 'none';
  dayView.style.display = '';
  if (titleEl)   titleEl.textContent = monthName;
  if (summaryEl) summaryEl.innerHTML  = '<span style="color:var(--text-muted)">⏳ Loading…</span>';
  if (dayUl)     dayUl.innerHTML      = '';

  try {
    const res = await apiFetch(
      `/api/consumption/history/days?submeter_id=${submeterId}&year=${year}&month=${month}`
    );
    if (!res.ok) throw new Error('API ' + res.status);
    const data = await res.json();

    const activeDays = data.days.filter(d => d.consumption_m3 > 0).length;
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;gap:18px;font-size:13px;">
          <span>📅 <strong>${data.month_name}</strong></span>
          <span>💧 Total: <strong style="color:var(--cyan)">${data.total_m3.toFixed(3)} m³</strong>
            &nbsp;(${(data.total_m3 * 1000).toFixed(0)} L)</span>
          <span>📊 ${activeDays} active day${activeDays !== 1 ? 's' : ''}</span>
          <span>🔢 Baseline: ${data.baseline} m³</span>
        </div>`;
    }

    const MA = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    data.days.forEach(d => {
      const li = document.createElement('li');
      li.className   = 'history-item';
      if (!d.consumption_m3 && !d.meter_reading) li.style.opacity = '0.38';

      const mStr = d.meter_reading !== null
        ? `Meter: ${d.meter_reading.toFixed(3)} m³` : 'No meter reading';
      const cStr = d.consumption_m3 > 0
        ? `+${d.consumption_m3.toFixed(3)} m³ (${d.consumption_liters.toFixed(0)} L)` : '—';
      const tStr = d.meter_reading_time
        ? new Date(d.meter_reading_time).toLocaleString('en-PH', {
            timeZone:'Asia/Manila', hour:'2-digit', minute:'2-digit', hour12:true })
        : '';

      li.innerHTML = `
        <div class="history-meta" style="flex:1;">
          <span class="history-label">📸 ${MA[month]} ${d.day}, ${year}${tStr ? '&nbsp;·&nbsp;'+tStr : ''}</span>
          <span class="history-stats">${mStr}<span style="color:var(--cyan);margin-left:8px;">${cStr}</span></span>
        </div>`;
      dayUl.appendChild(li);
    });
  } catch (e) {
    console.error('[History] load days:', e);
    if (summaryEl) summaryEl.innerHTML = '<span style="color:red;">Failed to load days.</span>';
  }
}

function closeHistoryDayView() {
  const mv = document.getElementById('historyMonthView');
  const dv = document.getElementById('historyDayView');
  if (dv) dv.style.display = 'none';
  if (mv) mv.style.display = '';
}


/* ══════════════════════════════════════════════════
   2. DAILY PDF — 24 hourly readings from DB, no "Today Consumed"
      Groups readings by hour, shows hourly delta, totals the day
══════════════════════════════════════════════════ */

async function buildDailyPDFDoc() {
  const { jsPDF } = window.jspdf;
  const doc  = new jsPDF();
  const now  = new Date();
  const submeterName = currentBuilding === 'A' ? 'Submeter 1' : 'Submeter 2';
  const subId = submetersMap[currentBuilding] || 1;

  // ── Pull today's readings from DB ──
  // Use history/days API so data matches the history page exactly
  const phNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
  const year  = phNow.getFullYear();
  const month = phNow.getMonth() + 1;
  const day   = phNow.getDate();

  let dayData = null;
  try {
    const res = await apiFetch(
      `/api/consumption/history/days?submeter_id=${subId}&year=${year}&month=${month}`
    );
    if (res.ok) dayData = await res.json();
  } catch (e) {}

  // Today's entry from monthly days array
  const todayEntry = dayData ? dayData.days.find(d => d.day === day) : null;
  const baseline   = dayData ? dayData.baseline : 0;

  // Pull hourly meter readings for today from /api/readings/
  let hourlyReadings = [];
  try {
    const res = await apiFetch(`/api/readings/?submeter_id=${subId}&limit=500`);
    if (res.ok) {
      const all = await res.json();
      // Filter: today PHT
      const todayPHT = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      hourlyReadings = all.filter(r => {
        // Convert UTC reading_time to PHT date
        const phDate = new Date(r.reading_time)
          .toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }); // YYYY-MM-DD
        return phDate === todayPHT;
      });
      hourlyReadings.sort((a, b) => new Date(a.reading_time) - new Date(b.reading_time));
    }
  } catch (e) {}

  // Compute per-reading deltas and total
  let totalDayConsumed = 0;
  const readingRows = [];
  let prevVal = null;
  hourlyReadings.forEach(r => {
    const val = parseFloat(r.ocr_value);
    const delta = prevVal !== null ? Math.max(0, val - prevVal) : 0;
    totalDayConsumed += delta;
    readingRows.push({ time: r.reading_time, val, delta });
    prevVal = val;
  });

  // If no hourly readings today but todayEntry exists, use its consumption total
  const finalTotal = readingRows.length > 0
    ? totalDayConsumed
    : (todayEntry ? todayEntry.consumption_m3 : 0);

  const firstMeter = readingRows.length > 0 ? readingRows[0].val : (baseline || 0);
  const lastMeter  = readingRows.length > 0 ? readingRows[readingRows.length - 1].val : firstMeter;

  let remark = 'Normal — Consumption is within expected range.';
  let remarkColor = [0, 150, 80];
  if (readingRows.length === 0 && finalTotal === 0) {
    remark = 'No Reading — No hourly readings captured today. Check meter or camera.';
    remarkColor = [100, 100, 100];
  } else if (finalTotal > 5) {
    remark = 'High Usage — Daily consumption above average. Monitor closely.';
    remarkColor = [200, 120, 0];
  }

  const dateLabel = now.toLocaleDateString('en-PH', {
    timeZone:'Asia/Manila', weekday:'long', year:'numeric', month:'long', day:'numeric'
  });

  // ── PDF Header ──
  doc.setFillColor(8, 13, 26); doc.rect(0, 0, 210, 30, 'F');
  doc.setTextColor(0, 212, 255); doc.setFontSize(16); doc.setFont('helvetica','bold');
  doc.text('WATER MONITORING', 20, 13);
  doc.setFontSize(9); doc.setTextColor(180, 200, 220);
  doc.text('Daily Water Consumption Report', 20, 21);
  doc.setTextColor(150, 170, 190);
  doc.text(`${submeterName}  |  ${dateLabel}`, 20, 27);
  doc.setDrawColor(0, 212, 255); doc.setLineWidth(0.5); doc.line(20, 33, 190, 33);

  // ── Meter Readings Summary ──
  let y = 43;
  doc.setFontSize(11); doc.setTextColor(0, 212, 255); doc.setFont('helvetica','bold');
  doc.text('METER READINGS', 20, y); y += 10;
  doc.setFontSize(10);
  [
    ['First Reading', firstMeter.toFixed(3) + ' m³'],
    ['Latest Reading', lastMeter.toFixed(3) + ' m³'],
    ['Total Consumed', finalTotal.toFixed(3) + ' m³  (' + (finalTotal * 1000).toFixed(0) + ' L)'],
    ['Total Hourly Readings', readingRows.length.toString()],
  ].forEach(([l, v]) => {
    doc.setFont('helvetica','bold'); doc.setTextColor(80, 80, 80); doc.text(l + ':', 22, y);
    doc.setFont('helvetica','normal'); doc.setTextColor(20, 20, 20); doc.text(v, 100, y);
    y += 9;
  });
  doc.setDrawColor(220, 220, 220); doc.line(20, y + 2, 190, y + 2); y += 10;

  // ── Hourly Reading Log Table ──
  doc.setFontSize(11); doc.setTextColor(0, 212, 255); doc.setFont('helvetica','bold');
  doc.text('HOURLY READING LOG (24h)', 20, y); y += 8;
  doc.setFillColor(30, 40, 70); doc.rect(20, y, 170, 8, 'F');
  doc.setFontSize(8); doc.setTextColor(200, 220, 255); doc.setFont('helvetica','bold');
  doc.text('Time', 24, y + 5.5);
  doc.text('Meter (m³)', 75, y + 5.5);
  doc.text('Consumed (m³)', 115, y + 5.5);
  doc.text('Liters', 162, y + 5.5);
  y += 10;

  doc.setFont('helvetica','normal'); doc.setFontSize(8);

  if (readingRows.length > 0) {
    readingRows.forEach((r, i) => {
      if (y > 265) { doc.addPage(); y = 20; }
      const timeStr = new Date(r.time).toLocaleTimeString('en-PH', {
        timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second:'2-digit'
      });
      if (i % 2 === 0) { doc.setFillColor(245, 247, 252); doc.rect(20, y - 4, 170, 8, 'F'); }
      doc.setTextColor(40, 40, 40);
      doc.text(timeStr, 24, y + 1);
      doc.text(r.val.toFixed(3), 75, y + 1);
      doc.text(r.delta > 0 ? '+' + r.delta.toFixed(3) : '—', 115, y + 1);
      doc.text(r.delta > 0 ? (r.delta * 1000).toFixed(0) : '—', 162, y + 1);
      y += 8;
    });
    // Total row
    y += 2;
    doc.setFillColor(8, 13, 26); doc.rect(20, y, 170, 9, 'F');
    doc.setTextColor(0, 212, 255); doc.setFont('helvetica','bold'); doc.setFontSize(8);
    doc.text('TOTAL (24h)', 24, y + 6);
    doc.text(finalTotal.toFixed(3), 115, y + 6);
    doc.text((finalTotal * 1000).toFixed(0), 162, y + 6);
    y += 14;
  } else {
    doc.setTextColor(150, 150, 150);
    doc.text('No hourly readings captured today.', 24, y + 4);
    y += 14;
  }

  // ── Remark ──
  if (y > 255) { doc.addPage(); y = 20; }
  doc.setFontSize(11); doc.setTextColor(0, 212, 255); doc.setFont('helvetica','bold');
  doc.text('STATUS & REMARKS', 20, y); y += 10;
  doc.setFillColor(...remarkColor.map(c => Math.min(255, c * 0.1 + 240)));
  doc.roundedRect(20, y, 170, 18, 3, 3, 'F');
  doc.setDrawColor(...remarkColor); doc.setLineWidth(0.8);
  doc.roundedRect(20, y, 170, 18, 3, 3, 'S');
  doc.setFontSize(9); doc.setTextColor(...remarkColor); doc.setFont('helvetica','bold');
  doc.text('REMARK:', 25, y + 7);
  doc.setFont('helvetica','normal');
  doc.text(doc.splitTextToSize(remark, 130), 55, y + 7);

  // ── Footer ──
  const footerY = doc.internal.pageSize.height - 14;
  doc.setDrawColor(200, 200, 200); doc.line(20, footerY, 190, footerY);
  doc.setFontSize(8); doc.setTextColor(150, 150, 150);
  doc.text(
    `Generated by Water Monitoring System — BSU-Lipa  |  ${now.toLocaleString('en-PH',{timeZone:'Asia/Manila'})}`,
    20, footerY + 7
  );
  return doc;
}


/* ══════════════════════════════════════════════════
   3. MONTHLY PDF — day-by-day from DB, no month-over-month
      Matches History page data exactly
══════════════════════════════════════════════════ */

async function buildMonthlyPDFDoc() {
  const { jsPDF } = window.jspdf;
  const doc  = new jsPDF();
  const now  = new Date();
  const submeterName = currentBuilding === 'A' ? 'Submeter 1' : 'Submeter 2';
  const subId = submetersMap[currentBuilding] || 1;

  const phNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
  const year  = phNow.getFullYear();
  const month = phNow.getMonth() + 1;
  const monthLabel = now.toLocaleDateString('en-PH', {
    timeZone:'Asia/Manila', month:'long', year:'numeric'
  });

  // Pull from same API the history page uses
  let dayData = null;
  try {
    const res = await apiFetch(
      `/api/consumption/history/days?submeter_id=${subId}&year=${year}&month=${month}`
    );
    if (res.ok) dayData = await res.json();
  } catch (e) {}

  const days     = dayData ? dayData.days : [];
  const total    = dayData ? dayData.total_m3 : 0;
  const baseline = dayData ? dayData.baseline : 0;
  const activeDays = days.filter(d => d.consumption_m3 > 0).length;
  const avgDaily = activeDays > 0 ? total / activeDays : 0;

  let remark = 'Normal month — consumption within expected range.';
  let remarkColor = [0, 150, 80];
  if (total === 0) {
    remark = 'No data — No consumption recorded this month yet.';
    remarkColor = [100, 100, 100];
  } else if (avgDaily > 3) {
    remark = 'High monthly usage — Average daily consumption above expected range.';
    remarkColor = [200, 120, 0];
  }

  // ── Header ──
  doc.setFillColor(8, 13, 26); doc.rect(0, 0, 210, 30, 'F');
  doc.setTextColor(245, 197, 24); doc.setFontSize(16); doc.setFont('helvetica','bold');
  doc.text('WATER MONITORING', 20, 13);
  doc.setFontSize(9); doc.setTextColor(180, 200, 220);
  doc.text('Monthly Water Consumption Report', 20, 21);
  doc.setTextColor(150, 170, 190);
  doc.text(`${submeterName}  |  ${monthLabel}`, 20, 27);
  doc.setDrawColor(245, 197, 24); doc.setLineWidth(0.5); doc.line(20, 33, 190, 33);

  // ── Monthly Summary ──
  let y = 43;
  doc.setFontSize(11); doc.setTextColor(245, 197, 24); doc.setFont('helvetica','bold');
  doc.text('MONTHLY SUMMARY', 20, y); y += 10;
  doc.setFontSize(10);
  [
    ['Month',               monthLabel],
    ['Total Consumption',   total.toFixed(3) + ' m³  (' + (total * 1000).toFixed(0) + ' L)'],
    ['Average Daily',       avgDaily.toFixed(3) + ' m³/day'],
    ['Active Days',         activeDays.toString() + ' of ' + days.length + ' days'],
    ['Baseline',            baseline + ' m³'],
  ].forEach(([l, v]) => {
    doc.setFont('helvetica','bold'); doc.setTextColor(80, 80, 80); doc.text(l + ':', 22, y);
    doc.setFont('helvetica','normal'); doc.setTextColor(20, 20, 20); doc.text(v, 100, y);
    y += 9;
  });
  doc.setDrawColor(220, 220, 220); doc.line(20, y + 2, 190, y + 2); y += 10;

  // ── Daily Breakdown Table ──
  doc.setFontSize(11); doc.setTextColor(245, 197, 24); doc.setFont('helvetica','bold');
  doc.text('DAILY BREAKDOWN', 20, y); y += 8;
  doc.setFillColor(30, 40, 70); doc.rect(20, y, 170, 8, 'F');
  doc.setFontSize(8); doc.setTextColor(200, 220, 255); doc.setFont('helvetica','bold');
  doc.text('Day', 24, y + 5.5);
  doc.text('Date', 45, y + 5.5);
  doc.text('Meter Reading (m³)', 85, y + 5.5);
  doc.text('Consumed', 140, y + 5.5);
  doc.text('Liters', 168, y + 5.5);
  y += 10;

  doc.setFont('helvetica','normal'); doc.setFontSize(8);
  const MA = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  days.forEach((d, i) => {
    if (y > 265) { doc.addPage(); y = 20; }
    const hasData = d.consumption_m3 > 0 || d.meter_reading !== null;
    if (i % 2 === 0) {
      doc.setFillColor(hasData ? 245 : 250, hasData ? 247 : 250, hasData ? 252 : 250);
      doc.rect(20, y - 4, 170, 8, 'F');
    }
    doc.setTextColor(hasData ? 40 : 160, 40, 40);
    doc.text('Day ' + d.day, 24, y + 1);
    doc.text(`${MA[month]} ${d.day}`, 45, y + 1);
    doc.text(d.meter_reading !== null ? d.meter_reading.toFixed(3) : '—', 85, y + 1);
    doc.text(d.consumption_m3 > 0 ? '+' + d.consumption_m3.toFixed(3) : '—', 140, y + 1);
    doc.text(d.consumption_m3 > 0 ? d.consumption_liters.toFixed(0) : '—', 168, y + 1);
    y += 8;
  });

  // Total row
  y += 2;
  doc.setFillColor(8, 13, 26); doc.rect(20, y, 170, 9, 'F');
  doc.setTextColor(245, 197, 24); doc.setFont('helvetica','bold'); doc.setFontSize(8);
  doc.text('MONTHLY TOTAL', 24, y + 6);
  doc.text(total.toFixed(3), 140, y + 6);
  doc.text((total * 1000).toFixed(0), 168, y + 6);
  y += 14;

  // ── Remark ──
  if (y > 255) { doc.addPage(); y = 20; }
  doc.setFontSize(11); doc.setTextColor(245, 197, 24); doc.setFont('helvetica','bold');
  doc.text('REMARKS', 20, y); y += 10;
  doc.setFillColor(...remarkColor.map(c => Math.min(255, c * 0.1 + 235)));
  doc.roundedRect(20, y, 170, 20, 3, 3, 'F');
  doc.setDrawColor(...remarkColor); doc.setLineWidth(0.8);
  doc.roundedRect(20, y, 170, 20, 3, 3, 'S');
  doc.setFontSize(9); doc.setTextColor(...remarkColor); doc.setFont('helvetica','bold');
  doc.text('REMARK:', 25, y + 8);
  doc.setFont('helvetica','normal');
  doc.text(doc.splitTextToSize(remark, 125), 55, y + 8);

  // ── Footer ──
  const footerY = doc.internal.pageSize.height - 14;
  doc.setDrawColor(200, 200, 200); doc.line(20, footerY, 190, footerY);
  doc.setFontSize(8); doc.setTextColor(150, 150, 150);
  doc.text(
    `Generated by Water Monitoring System — BSU-Lipa  |  ${now.toLocaleString('en-PH',{timeZone:'Asia/Manila'})}`,
    20, footerY + 7
  );
  return doc;
}

// Override preview/download to use async buildMonthlyPDFDoc
async function previewMonthlyPDFCurrent() {
  const doc   = await buildMonthlyPDFDoc();
  const modal = document.getElementById('monthlyPdfModal');
  if (modal.parentElement !== document.body) document.body.appendChild(modal);
  document.getElementById('monthlyPdfFrame').src = doc.output('bloburl');
  modal.style.cssText = 'display:flex !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important;z-index:99999 !important;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;background:rgba(0,0,0,.85);';
}
async function downloadMonthlyPDFCurrent() {
  const doc = await buildMonthlyPDFDoc();
  doc.save(`Monthly_Report_${currentBuilding==='A'?'Submeter1':'Submeter2'}_${new Date().toISOString().slice(0,7)}.pdf`);
}


/* ══════════════════════════════════════════════════
   4. MANUAL CAPTURE — immediate ESP32 capture
      Does NOT wait for the 1-hour interval
══════════════════════════════════════════════════ */

async function manualCapture(btn) {
  const ip = buildingIPs[currentBuilding];
  if (!ip) {
    alert('No ESP32 IP configured. Open Device Settings first.');
    return;
  }
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="nav-btn-icon">⏳</span> Capturing…';
  }
  try {
    await captureFromESP32();
    if (btn) {
      btn.innerHTML = '<span class="nav-btn-icon">✅</span> Captured!';
      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = '<span class="nav-btn-icon">📷</span> Manual Capture';
      }, 2000);
    }
  } catch (e) {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="nav-btn-icon">📷</span> Manual Capture';
    }
  }
}


/* ══════════════════════════════════════════════════
   5. HOURLY AUTO-CAPTURE (replaces simulation block)
      Interval = 60 min, matching ESP32 config.ini
══════════════════════════════════════════════════ */

const CAPTURE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

setInterval(async () => {
  const ip = buildingIPs[currentBuilding];
  if (ip) {
    console.log('[HydraTrack] Hourly auto-capture — Submeter', currentBuilding);
    await captureFromESP32();
  }
  // Refresh history if open
  if (document.getElementById('historySection') &&
      document.getElementById('historySection').classList.contains('active')) {
    renderHistoryMonths();
  }
  // Refresh KPI totals
  loadReadingsHistoryFromAPI();
}, CAPTURE_INTERVAL_MS);
