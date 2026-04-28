/* ═══════════════════════════════════════════════════════════════
   HYDRATRACK PATCH — Apply to hydratrack.js
   Changes:
     1. renderHistory() → replaced with month-accordion renderHistoryMonths()
     2. captureFromESP32 interval → 1 hour (3,600,000 ms)
     3. No simulation mode in production
   ═══════════════════════════════════════════════════════════════ */

/* ──────────────────────────────────────────────────────────────
   HISTORY: Month list with Day drill-down
   ────────────────────────────────────────────────────────────── */

// Called when history section opens (replaces renderHistory)
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

  // Populate submeter filter
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
    if (!res.ok) throw new Error('API error');
    const data = await res.json();

    ul.innerHTML = '';
    let hasAny = false;

    data.forEach(subData => {
      if (!subData.months || subData.months.length === 0) return;
      hasAny = true;

      const subLabel = document.createElement('li');
      subLabel.style.cssText = 'color:var(--text-muted);font-size:11px;font-weight:600;letter-spacing:.08em;padding:14px 0 6px;text-transform:uppercase;';
      subLabel.textContent = subData.submeter_code === 'SUB-A' || subData.type === 'A'
        ? '📟 Submeter 1' : '📟 Submeter 2';
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
              · Total: <strong style="color:var(--cyan)">${m.total_m3.toFixed(3)} m³</strong>
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
    ul.innerHTML = '<div style="color:var(--text-muted);padding:20px;text-align:center;">Failed to load history. Try again.</div>';
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
  if (titleEl) titleEl.textContent = monthName;
  if (summaryEl) summaryEl.innerHTML = '<span style="color:var(--text-muted)">Loading day-by-day data…</span>';
  if (dayUl) dayUl.innerHTML = '';

  try {
    const res = await apiFetch(
      `/api/consumption/history/days?submeter_id=${submeterId}&year=${year}&month=${month}`
    );
    if (!res.ok) throw new Error('API error');
    const data = await res.json();

    // Summary banner
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;gap:18px;">
          <span>📅 <strong>${data.month_name}</strong></span>
          <span>💧 Total: <strong style="color:var(--cyan)">${data.total_m3.toFixed(3)} m³</strong> (${(data.total_m3*1000).toFixed(0)} L)</span>
          <span>📊 ${data.days.filter(d=>d.consumption_m3>0).length} active days</span>
          <span>🔢 Baseline: ${data.baseline} m³</span>
        </div>
      `;
    }

    dayUl.innerHTML = '';
    const MONTH_NAMES = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthAbbr = MONTH_NAMES[month] || '';

    data.days.forEach(d => {
      const hasData = d.consumption_m3 > 0 || d.meter_reading !== null;
      const li = document.createElement('li');
      li.className = 'history-item';
      if (!hasData) li.style.opacity = '0.45';

      const meterStr = d.meter_reading !== null
        ? `Meter: ${d.meter_reading.toFixed(3)} m³`
        : 'No meter reading';

      const consumedStr = d.consumption_m3 > 0
        ? `+${d.consumption_m3.toFixed(3)} m³ (${d.consumption_liters.toFixed(0)} L)`
        : '—';

      const timeStr = d.meter_reading_time
        ? new Date(d.meter_reading_time).toLocaleString('en-PH', {
            timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true
          })
        : '';

      li.innerHTML = `
        <div class="history-meta" style="flex:1;">
          <span class="history-label">
            📸 ${monthAbbr} ${d.day}, ${year}${timeStr ? ' · ' + timeStr : ''}
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
    if (summaryEl) summaryEl.innerHTML = '<span style="color:red;">Failed to load days. Try again.</span>';
  }
}

function closeHistoryDayView() {
  const monthView = document.getElementById('historyMonthView');
  const dayView   = document.getElementById('historyDayView');
  if (dayView)   dayView.style.display = 'none';
  if (monthView) monthView.style.display = '';
}

/* ──────────────────────────────────────────────────────────────
   AUTO-CAPTURE: 1 hour interval
   The ESP32 also captures every 60 min; this ensures the website
   polls at the same cadence. When the ESP32 posts via Webhook,
   the server auto-saves — this is just a UI refresh trigger.
   ────────────────────────────────────────────────────────────── */
const CAPTURE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// Cancel any existing capture interval and set 1-hour schedule
(function setupHourlyCapture() {
  // Clear all existing OCR intervals
  ['A','B'].forEach(b => {
    if (ocrIntervals[b]) { clearInterval(ocrIntervals[b]); ocrIntervals[b] = null; }
  });

  // Set 1-hour interval for dashboard capture refresh
  setInterval(async () => {
    // Only trigger if a submeter IP is configured
    const ip = buildingIPs[currentBuilding];
    if (ip) {
      console.log('[HydraTrack] Hourly capture triggered for Submeter', currentBuilding);
      await captureFromESP32();
    }
    // Also reload history if the history section is open
    if (document.getElementById('historySection').classList.contains('active')) {
      renderHistoryMonths();
    }
    // Refresh dashboard consumption totals
    loadReadingsHistoryFromAPI();
  }, CAPTURE_INTERVAL_MS);
})();
