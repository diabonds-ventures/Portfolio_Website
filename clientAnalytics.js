/**
 * CLIENT QUANTITATIVE ANALYTICS ENGINE (LIVE GOOGLE SHEETS CALCULATOR)
 */

(function () {
  'use strict';

  // ⚠️ PUBLISHED CSV LINKS FROM FILE -> SHARE -> PUBLISH TO WEB
  const NAV_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS7I_zj5rMDE3MtKOZj2A4UMYt_dn38Y3MxBxyMCflePaHRDYmROUwWrlvvCQ7idR87n_TY-YPEhZzA/pub?gid=702735038&single=true&output=csv";
  const TXN_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS7I_zj5rMDE3MtKOZj2A4UMYt_dn38Y3MxBxyMCflePaHRDYmROUwWrlvvCQ7idR87n_TY-YPEhZzA/pub?gid=705567559&single=true&output=csv";

  const state = {
    clientId: null,
    activeHorizon: '1Y',
    rawPayload: null,
    chartInstance: null,
    ledgerData: [],
    quantMetrics: null
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

      // Process Historical_NAV (Skip header row 0)
      const benchmarkData = [];
      let latestAum = 0;
      let inceptionDate = null;

      for (let i = 1; i < navRows.length; i++) {
        const row = navRows[i];
        if (!row || !row[0] || row[0].trim() === '') continue;

        const dateStr = row[0].trim();              // Col A: Date
        const totalValue = parseCleanNumber(row[2]);// Col C: Total Portfolio Value (AUM)
        const portNav = parseCleanNumber(row[4]);   // Col E: Portfolio Unit NAV
        const niftyNav = parseCleanNumber(row[8]);  // Col I: Nifty 50 NAV

        if (!inceptionDate) inceptionDate = dateStr;
        latestAum = totalValue;

        benchmarkData.push({
          date: dateStr,
          portfolioNav: portNav,
          niftyNav: niftyNav
        });
      }

      // Process Transactions (Skip header row 0)
      const transactionLedger = [];
      for (let i = 1; i < txnRows.length; i++) {
        const row = txnRows[i];
        if (!row || !row[0] || row[0].trim() === '') continue;

        transactionLedger.push({
          id: `TXN-${i}`,
          date: row[0].trim(),               // Col A: Date
          type: row[2] || "",                // Col C: Action
          asset: row[3] || "",               // Col D: Ticker
          quantity: parseCleanNumber(row[4]),// Col E: Qty
          price: parseCleanNumber(row[8]),   // Col I: Net Price
          amount: parseCleanNumber(row[9])   // Col J: Total Value
        });
      }

      // Calculate Real Mathematical Quantitative Metrics from Live Data
      state.quantMetrics = computeQuantMetrics(benchmarkData, latestAum);

      const payload = {
        portfolioSummary: {
          totalAum: latestAum,
          beta: state.quantMetrics.beta,
          inceptionDate: inceptionDate,
          cagr: state.quantMetrics.cagr
        },
        benchmarkData: benchmarkData,
        transactionLedger: transactionLedger.reverse()
      };

      state.rawPayload = payload;
      state.ledgerData = payload.transactionLedger;

      // Render Dashboard
      renderHeaderStats(payload.portfolioSummary, state.quantMetrics);
      renderChartOverlay(payload.benchmarkData, state.activeHorizon);
      calculateVaR(payload.portfolioSummary, state.quantMetrics);
      initSipSimulator(state.quantMetrics.cagr);
      renderLedger(state.ledgerData);

    } catch (err) {
      console.error("Database Connection Error:", err);
      const aumEl = document.getElementById('headerAum');
      if (aumEl) aumEl.textContent = "Error loading DB";
      alert(`Connection Error: ${err.message}`);
    }
  }

  /**
   * DYNAMIC QUANTITATIVE MATHEMATICS ENGINE
   */
  function computeQuantMetrics(benchmarkData, totalAum) {
    if (!benchmarkData || benchmarkData.length < 2) {
      return {
        cagr: 12.0,
        beta: 1.00,
        varPct: 0.02,
        varValue: totalAum * 0.02,
        maxDrawdownPct: 0,
        monthlyStdDev: 0.02,
        meanMonthlyReturn: 0.01
      };
    }

    const pReturns = [];
    const mReturns = [];
    let maxPeak = benchmarkData[0].portfolioNav;
    let maxDrawdown = 0;

    for (let i = 1; i < benchmarkData.length; i++) {
      const prevP = benchmarkData[i - 1].portfolioNav;
      const currP = benchmarkData[i].portfolioNav;
      const prevM = benchmarkData[i - 1].niftyNav;
      const currM = benchmarkData[i].niftyNav;

      const rP = prevP > 0 ? (currP - prevP) / prevP : 0;
      const rM = prevM > 0 ? (currM - prevM) / prevM : 0;

      pReturns.push(rP);
      mReturns.push(rM);

      if (currP > maxPeak) {
        maxPeak = currP;
      }
      const dd = maxPeak > 0 ? (currP - maxPeak) / maxPeak : 0;
      if (dd < maxDrawdown) {
        maxDrawdown = dd;
      }
    }

    // Mean daily returns
    const meanP = pReturns.reduce((a, b) => a + b, 0) / pReturns.length;
    const meanM = mReturns.reduce((a, b) => a + b, 0) / mReturns.length;

    // Covariance and Variances
    let cov = 0;
    let varM = 0;
    let varP = 0;
    for (let i = 0; i < pReturns.length; i++) {
      const diffP = pReturns[i] - meanP;
      const diffM = mReturns[i] - meanM;
      cov += diffP * diffM;
      varM += diffM * diffM;
      varP += diffP * diffP;
    }

    const n = pReturns.length;
    const stdDevP_daily = Math.sqrt(varP / (n > 1 ? n - 1 : 1));
    const beta = varM > 0 ? (cov / varM) : 1.00;

    // CAGR Calculation
    const startDate = new Date(benchmarkData[0].date);
    const endDate = new Date(benchmarkData[benchmarkData.length - 1].date);
    const diffDays = Math.max(1, (endDate - startDate) / (1000 * 60 * 60 * 24));

    const startNav = benchmarkData[0].portfolioNav;
    const endNav = benchmarkData[benchmarkData.length - 1].portfolioNav;
    const totalReturnRatio = startNav > 0 ? endNav / startNav : 1;

    let cagrPct = 0;
    if (diffDays >= 365) {
      cagrPct = (Math.pow(totalReturnRatio, 365 / diffDays) - 1) * 100;
    } else {
      cagrPct = ((totalReturnRatio - 1) * (365 / diffDays)) * 100;
    }

    // Monthly Standard Deviation & 95% Parametric VaR
    const stdDevMonthly = stdDevP_daily * Math.sqrt(21);
    const meanMonthly = meanP * 21;
    const zScore = 1.645; // 95% Confidence Level

    let varPct = (zScore * stdDevMonthly) - meanMonthly;
    if (varPct < 0) varPct = Math.abs(varPct);

    return {
      cagr: cagrPct,
      beta: Math.max(0, beta),
      varPct: varPct,
      varValue: totalAum * varPct,
      maxDrawdownPct: maxDrawdown * 100,
      monthlyStdDev: stdDevMonthly,
      meanMonthlyReturn: meanMonthly
    };
  }

  function bindEvents() {
    document.querySelectorAll('.horizon-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.horizon-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        state.activeHorizon = e.target.getAttribute('data-horizon');

        if (state.rawPayload && state.quantMetrics) {
          renderChartOverlay(state.rawPayload.benchmarkData, state.activeHorizon);
          calculateVaR(state.rawPayload.portfolioSummary, state.quantMetrics);
        }
      });
    });

    const searchInput = document.getElementById('ledgerSearchInput');
    const typeFilter = document.getElementById('ledgerTypeFilter');
    if (searchInput) searchInput.addEventListener('input', filterLedger);
    if (typeFilter) typeFilter.addEventListener('change', filterLedger);
  }

  function renderHeaderStats(summary, quant) {
    if (!summary || !quant) return;
    const aumEl = document.getElementById('headerAum');
    const betaEl = document.getElementById('headerBeta');
    const varEl = document.getElementById('headerVar');

    if (aumEl) aumEl.textContent = formatINR(summary.totalAum);
    if (betaEl) betaEl.textContent = parseCleanNumber(quant.beta).toFixed(2);
    if (varEl) varEl.textContent = formatINR(quant.varValue);
  }

  function renderChartOverlay(benchmarkData, horizon) {
    const canvas = document.getElementById('niftyOverlayChart');
    if (!canvas || !benchmarkData || benchmarkData.length === 0) return;

    const cutoffDate = new Date();
    if (horizon === '1Y') cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);
    else if (horizon === '3Y') cutoffDate.setFullYear(cutoffDate.getFullYear() - 3);
    else if (horizon === '5Y') cutoffDate.setFullYear(cutoffDate.getFullYear() - 5);

    const activeDataset = benchmarkData.filter(d => {
      const itemDate = new Date(d.date);
      return isNaN(itemDate.getTime()) || itemDate >= cutoffDate;
    });

    const datasetToRender = activeDataset.length > 0 ? activeDataset : benchmarkData;

    const labels = datasetToRender.map(d => d.date);
    const portfolioSeries = datasetToRender.map(d => d.portfolioNav);
    const niftySeries = datasetToRender.map(d => d.niftyNav);

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
            label: 'Portfolio NAV',
            data: portfolioSeries,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.08)',
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 3
          },
          {
            label: 'Nifty 50 NAV',
            data: niftySeries,
            borderColor: '#6b7280',
            borderDash: [4, 4],
            fill: false,
            tension: 0.3,
            borderWidth: 1.5,
            pointRadius: 3
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

  function calculateVaR(summary, quant) {
    if (!summary || !quant) return;
    const aum = parseCleanNumber(summary.totalAum);

    const horizonFactor = state.activeHorizon === '1Y' ? 1 : state.activeHorizon === '3Y' ? 1.73 : 2.23;
    const scaledVarValue = quant.varValue * horizonFactor;
    const scaledVarPct = quant.varPct * horizonFactor * 100;

    const mVarPct = document.getElementById('monthlyVarPct');
    const mVarVal = document.getElementById('monthlyVarVal');
    const varInterp = document.getElementById('varInterpretation');
    const upsidePot = document.getElementById('upsidePotential');
    const upsideVal = document.getElementById('upsideValue');
    const maxDraw = document.getElementById('maxDrawdown');

    if (mVarPct) mVarPct.textContent = `-${scaledVarPct.toFixed(2)}%`;
    if (mVarVal) mVarVal.textContent = formatINR(scaledVarValue);
    if (varInterp) varInterp.textContent = formatINR(scaledVarValue);

    // Upside potential based on calculated annual return
    const years = state.activeHorizon === '1Y' ? 1 : state.activeHorizon === '3Y' ? 3 : 5;
    const projectedUpsidePct = Math.max(0, quant.cagr * years);
    const projectedUpsideValue = aum * (projectedUpsidePct / 100);

    if (upsidePot) upsidePot.textContent = `+${projectedUpsidePct.toFixed(1)}%`;
    if (upsideVal) upsideVal.textContent = formatINR(projectedUpsideValue);
    if (maxDraw) maxDraw.textContent = `${quant.maxDrawdownPct.toFixed(1)}%`;
  }

  function initSipSimulator(cagrRate) {
    const amountRange = document.getElementById('sipAmountRange');
    const durationRange = document.getElementById('sipDurationRange');
    const returnInput = document.getElementById('sipReturnInput');

    if (returnInput && cagrRate) {
      // Set default simulator CAGR to match portfolio's actual calculated rate
      const boundedCagr = Math.max(5, Math.min(30, cagrRate));
      returnInput.value = boundedCagr.toFixed(1);
    }

    function runSimulation() {
      const P = parseCleanNumber(amountRange ? amountRange.value : 10000);
      const years = parseCleanNumber(durationRange ? durationRange.value : 5);
      const annualRate = parseCleanNumber(returnInput ? returnInput.value : 12) / 100;
      const i = annualRate / 12;
      const n = years * 12;

      const amtDisp = document.getElementById('sipAmountDisplay');
      const durDisp = document.getElementById('sipDurationDisplay');
      if (amtDisp) amtDisp.textContent = formatINR(P);
      if (durDisp) durDisp.textContent = `${years} ${years === 1 ? 'Year' : 'Years'}`;

      let futureValue = P * (((Math.pow(1 + i, n) - 1) / i)) * (1 + i);
      const totalInvested = P * n;
      const wealthGain = futureValue - totalInvested;

      const totalInvEl = document.getElementById('simTotalInvested');
      const wealthGainEl = document.getElementById('simWealthGain');
      const projTotalEl = document.getElementById('simProjectedTotal');

      if (totalInvEl) totalInvEl.textContent = formatINR(totalInvested);
      if (wealthGainEl) wealthGainEl.textContent = formatINR(wealthGain);
      if (projTotalEl) projTotalEl.textContent = formatINR(futureValue);
    }

    if (amountRange) amountRange.addEventListener('input', runSimulation);
    if (durationRange) durationRange.addEventListener('input', runSimulation);
    if (returnInput) returnInput.addEventListener('input', runSimulation);
    runSimulation();
  }

  function renderLedger(transactions) {
    const tbody = document.getElementById('transactionTableBody');
    if (!tbody) return;

    if (!transactions || transactions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center">No transactions found.</td></tr>`;
      return;
    }

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
    const searchInput = document.getElementById('ledgerSearchInput');
    const typeFilter = document.getElementById('ledgerTypeFilter');
    const query = searchInput ? searchInput.value.toLowerCase() : '';
    const type = typeFilter ? typeFilter.value : 'ALL';

    renderLedger(state.ledgerData.filter(txn =>
      ((txn.asset||'').toLowerCase().includes(query) || (txn.type||'').toLowerCase().includes(query)) &&
      (type === 'ALL' || txn.type === type)
    ));
  }

})();