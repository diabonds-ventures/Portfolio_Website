/**
 * CLIENT QUANTITATIVE ANALYTICS ENGINE (PUBLISHED CSV BACKEND)
 */

(function () {
  'use strict';

  // ⚠️ PASTE YOUR PUBLISHED CSV LINKS HERE FROM FILE -> SHARE -> PUBLISH TO WEB
  const NAV_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS7I_zj5rMDE3MtKOZj2A4UMYt_dn38Y3MxBxyMCflePaHRDYmROUwWrlvvCQ7idR87n_TY-YPEhZzA/pub?gid=702735038&single=true&output=csv";
  const TXN_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS7I_zj5rMDE3MtKOZj2A4UMYt_dn38Y3MxBxyMCflePaHRDYmROUwWrlvvCQ7idR87n_TY-YPEhZzA/pub?gid=705567559&single=true&output=csv";

  const state = {
    clientId: null,
    activeHorizon: '1Y',
    rawPayload: null,
    chartInstance: null,
    ledgerData: []
  };

  function parseCleanNumber(val) {
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    if (!val) return 0;
    const cleaned = String(val).replace(/[^0-9.-]+/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }

  function formatINR(val) {
    const num = parseCleanNumber(val);
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(num);
  }

  // Simple, robust CSV parser
  function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    return lines.map(line => {
      const values = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());
      return values;
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    extractQueryParams();
    bindEvents();
    fetchClientData();
  });

  function extractQueryParams() {
    const urlParams = new URLSearchParams(window.location.search);
    state.clientId = urlParams.get('clientId');
  }

  async function fetchClientData() {
    try {
      // 1. Fetch CSV feeds
      const [navRes, txnRes] = await Promise.all([
        fetch(NAV_CSV_URL),
        fetch(TXN_CSV_URL)
      ]);

      if (!navRes.ok || !txnRes.ok) {
        throw new Error("Unable to fetch published CSV feeds. Verify published links.");
      }

      const navText = await navRes.text();
      const txnText = await txnRes.text();

      const navRows = parseCSV(navText);
      const txnRows = parseCSV(txnText);

      // 2. Process Historical_NAV (Skip header row 0)
      const benchmarkData = [];
      let latestAum = 0;
      let inceptionDate = null;

      for (let i = 1; i < navRows.length; i++) {
        const row = navRows[i];
        if (!row[0]) continue;

        const dateStr = row[0]; // Col A: Date
        const portValue = parseCleanNumber(row[2]); // Col C: Total Portfolio Value
        const instNav = parseCleanNumber(row[7]);   // Col H: Institution NAV

        if (!inceptionDate) inceptionDate = dateStr;
        latestAum = portValue;

        benchmarkData.push({
          date: dateStr,
          portfolioNav: portValue,
          niftyNav: instNav
        });
      }

      // 3. Process Transactions (Skip header row 0)
      const transactionLedger = [];
      for (let i = 1; i < txnRows.length; i++) {
        const row = txnRows[i];
        if (!row[0]) continue;

        transactionLedger.push({
          id: `TXN-${i}`,
          date: row[0],                      // Col A: Date
          type: row[2] || "",                 // Col C: Action
          asset: row[3] || "",                // Col D: Ticker
          quantity: parseCleanNumber(row[4]), // Col E: Qty
          price: parseCleanNumber(row[8]),    // Col I: Net Price
          amount: parseCleanNumber(row[9])    // Col J: Total Value
        });
      }

      // 4. Construct payload
      const payload = {
        portfolioSummary: {
          totalAum: latestAum,
          beta: 0.95,
          inceptionDate: inceptionDate,
          cagr: 12.5
        },
        benchmarkData: benchmarkData,
        transactionLedger: transactionLedger.reverse()
      };

      state.rawPayload = payload;
      state.ledgerData = payload.transactionLedger;

      // Render UI
      renderHeaderStats(payload.portfolioSummary);
      renderChartOverlay(payload.benchmarkData, state.activeHorizon, payload.portfolioSummary.inceptionDate);
      calculateVaR(payload.portfolioSummary);
      initSipSimulator(payload.portfolioSummary.cagr);
      renderLedger(state.ledgerData);

    } catch (err) {
      console.error("Database Connection Error:", err);
      document.getElementById('headerAum').textContent = "Error loading DB";
      alert(`Connection Error: ${err.message}`);
    }
  }

  function bindEvents() {
    document.querySelectorAll('.horizon-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.horizon-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        state.activeHorizon = e.target.getAttribute('data-horizon');

        if (state.rawPayload) {
          renderChartOverlay(state.rawPayload.benchmarkData, state.activeHorizon, state.rawPayload.portfolioSummary.inceptionDate);
          calculateVaR(state.rawPayload.portfolioSummary);
        }
      });
    });

    const searchInput = document.getElementById('ledgerSearchInput');
    const typeFilter = document.getElementById('ledgerTypeFilter');
    if (searchInput) searchInput.addEventListener('input', filterLedger);
    if (typeFilter) typeFilter.addEventListener('change', filterLedger);
  }

  function renderHeaderStats(summary) {
    if (!summary) return;
    document.getElementById('headerAum').textContent = formatINR(summary.totalAum);
    document.getElementById('headerBeta').textContent = parseCleanNumber(summary.beta).toFixed(2);
  }

  function renderChartOverlay(benchmarkData, horizon, inceptionDateStr) {
    const canvas = document.getElementById('niftyOverlayChart');
    if (!canvas || !benchmarkData) return;

    const requestedMonths = horizon === '1Y' ? 12 : horizon === '3Y' ? 36 : 60;

    let monthsSinceInception = requestedMonths;
    if (inceptionDateStr) {
      const inceptionDate = new Date(inceptionDateStr);
      const today = new Date();
      monthsSinceInception = (today.getFullYear() - inceptionDate.getFullYear()) * 12;
      monthsSinceInception -= inceptionDate.getMonth();
      monthsSinceInception += today.getMonth();
      monthsSinceInception = monthsSinceInception <= 0 ? 1 : monthsSinceInception;
    }

    const actualMonthsToShow = Math.min(requestedMonths, monthsSinceInception);
    const slicedData = benchmarkData.slice(-actualMonthsToShow);

    const labels = slicedData.map(d => d.date);
    const portfolioSeries = slicedData.map(d => d.portfolioNav);
    const niftySeries = slicedData.map(d => d.niftyNav);

    if (state.chartInstance) {
      state.chartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');
    state.chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Portfolio Value (₹)',
            data: portfolioSeries,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.08)',
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 0
          },
          {
            label: 'Nifty 50 Nav',
            data: niftySeries,
            borderColor: '#6b7280',
            borderDash: [4, 4],
            fill: false,
            tension: 0.3,
            borderWidth: 1.5,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#6b7280' } },
          y: { grid: { color: 'rgba(255, 255, 255, 0.04)' }, ticks: { color: '#6b7280' } }
        }
      }
    });
  }

  function calculateVaR(summary) {
    if (!summary) return;
    const aum = parseCleanNumber(summary.totalAum);
    const stdDev = 0.045;
    const meanReturn = 0.012;
    const zScore = 1.645;
    const varPct = (zScore * stdDev) - meanReturn;
    const varValue = aum * varPct;

    const horizonFactor = state.activeHorizon === '1Y' ? 1 : state.activeHorizon === '3Y' ? 1.73 : 2.23;
    const scaledVarValue = varValue * horizonFactor;
    const scaledVarPct = varPct * horizonFactor * 100;

    document.getElementById('headerVar').textContent = formatINR(scaledVarValue);
    document.getElementById('monthlyVarPct').textContent = `-${scaledVarPct.toFixed(2)}%`;
    document.getElementById('monthlyVarVal').textContent = formatINR(scaledVarValue);
    document.getElementById('varInterpretation').textContent = formatINR(scaledVarValue);

    const upsidePct = (meanReturn * 12 * (state.activeHorizon === '1Y' ? 1 : state.activeHorizon === '3Y' ? 3 : 5)) * 100;
    document.getElementById('upsidePotential').textContent = `+${upsidePct.toFixed(1)}%`;
    document.getElementById('upsideValue').textContent = formatINR(aum * (upsidePct / 100));
    document.getElementById('maxDrawdown').textContent = `-${(stdDev * 2.5 * 100).toFixed(1)}%`;
  }

  function initSipSimulator(defaultCagr) {
    const amountRange = document.getElementById('sipAmountRange');
    const durationRange = document.getElementById('sipDurationRange');
    const returnInput = document.getElementById('sipReturnInput');

    function runSimulation() {
      const P = parseCleanNumber(amountRange.value);
      const years = parseCleanNumber(durationRange.value);
      const annualRate = parseCleanNumber(returnInput.value) / 100;
      const i = annualRate / 12;
      const n = years * 12;

      document.getElementById('sipAmountDisplay').textContent = formatINR(P);
      document.getElementById('sipDurationDisplay').textContent = `${years} ${years === 1 ? 'Year' : 'Years'}`;

      let futureValue = P * (((Math.pow(1 + i, n) - 1) / i)) * (1 + i);
      const totalInvested = P * n;
      const wealthGain = futureValue - totalInvested;

      document.getElementById('simTotalInvested').textContent = formatINR(totalInvested);
      document.getElementById('simWealthGain').textContent = formatINR(wealthGain);
      document.getElementById('simProjectedTotal').textContent = formatINR(futureValue);
    }

    if (amountRange) amountRange.addEventListener('input', runSimulation);
    if (durationRange) durationRange.addEventListener('input', runSimulation);
    if (returnInput) returnInput.addEventListener('input', runSimulation);
    runSimulation();
  }

  function renderLedger(transactions) {
    const tbody = document.getElementById('transactionTableBody');
    if (!tbody) return;
    tbody.innerHTML = transactions.map(txn => `
        <tr>
          <td>${txn.date}</td>
          <td class="text-muted">${txn.id}</td>
          <td><span class="type-badge type-${(txn.type || '').toLowerCase()}">${txn.type}</span></td>
          <td><strong>${txn.asset}</strong></td>
          <td class="text-right">${txn.quantity}</td>
          <td class="text-right">${formatINR(txn.price)}</td>
          <td class="text-right text-highlight">${formatINR(txn.amount)}</td>
        </tr>
      `).join('');
  }

  function filterLedger() {
    const query = document.getElementById('ledgerSearchInput').value.toLowerCase();
    const type = document.getElementById('ledgerTypeFilter').value;
    renderLedger(state.ledgerData.filter(txn =>
      ((txn.asset||'').toLowerCase().includes(query) || (txn.type||'').toLowerCase().includes(query)) &&
      (type === 'ALL' || txn.type === type)
    ));
  }

})();