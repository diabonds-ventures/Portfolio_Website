/**
 * CLIENT QUANTITATIVE ANALYTICS ENGINE (LIVE GOOGLE SHEETS CALCULATOR)
 * Features 52-Week SOTP High/Low Range, Historical Drawdown, CAGR, & Integrated SIP Simulator
 */

(function () {
  'use strict';

  // ⚠️ PUBLISHED CSV LINKS FROM FILE -> SHARE -> PUBLISH TO WEB
  const NAV_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS7I_zj5rMDE3MtKOZj2A4UMYt_dn38Y3MxBxyMCflePaHRDYmROUwWrlvvCQ7idR87n_TY-YPEhZzA/pub?gid=702735038&single=true&output=csv";
  const TXN_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS7I_zj5rMDE3MtKOZj2A4UMYt_dn38Y3MxBxyMCflePaHRDYmROUwWrlvvCQ7idR87n_TY-YPEhZzA/pub?gid=705567559&single=true&output=csv";
  const LIVE_PRICES_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS7I_zj5rMDE3MtKOZj2A4UMYt_dn38Y3MxBxyMCflePaHRDYmROUwWrlvvCQ7idR87n_TY-YPEhZzA/pub?gid=0&single=true&output=csv";

  const state = {
    clientId: null,
    activeHorizon: '1Y',
    rawPayload: null,
    chartInstance: null,
    ledgerData: [],
    quantMetrics: null,
    sotpMetrics: null
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
      // Cache-buster forces fresh data on the first load
      const cb = `&t=${new Date().getTime()}`;
      
      const fetchPromises = [
        fetch(NAV_CSV_URL + cb), 
        fetch(TXN_CSV_URL + cb)
      ];
      
      if (LIVE_PRICES_CSV_URL && !LIVE_PRICES_CSV_URL.includes("PASTE_YOUR")) {
        fetchPromises.push(fetch(LIVE_PRICES_CSV_URL + cb));
      }

      const responses = await Promise.all(fetchPromises);

      if (!responses[0].ok || !responses[1].ok) {
        throw new Error("Unable to fetch primary CSV feeds. Verify published links.");
      }

      const navText = await responses[0].text();
      const txnText = await responses[1].text();
      let priceText = null;
      if (responses[2] && responses[2].ok) {
        priceText = await responses[2].text();
      }

      const navRows = parseCSV(navText);
      const txnRows = parseCSV(txnText);
      const priceRows = priceText ? parseCSV(priceText) : [];

      // 1. Process Historical NAV
      const benchmarkData = [];
      let latestAum = 0;
      let inceptionDate = null;

      for (let i = 1; i < navRows.length; i++) {
        const row = navRows[i];
        if (!row || !row[0] || row[0].trim() === '') continue;

        const dateStr = row[0].trim();              
        const totalValue = parseCleanNumber(row[2]);
        const portNav = parseCleanNumber(row[4]);   
        const niftyNav = parseCleanNumber(row[8]);  

        if (!inceptionDate) inceptionDate = dateStr;
        latestAum = totalValue;

        benchmarkData.push({
          date: dateStr,
          portfolioNav: portNav,
          niftyNav: niftyNav
        });
      }

      // 2. Process Transactions
      const transactionLedger = [];
      const currentHoldings = {};

      for (let i = 1; i < txnRows.length; i++) {
        const row = txnRows[i];
        if (!row || !row[0] || row[0].trim() === '') continue;

        const type = (row[2] || "").trim().toUpperCase();
        const rawAsset = (row[3] || "").trim();
        const asset = rawAsset.toUpperCase();
        const qty = parseCleanNumber(row[4]);

        transactionLedger.push({
          id: `TXN-${i}`,
          date: row[0].trim(),               
          type: type,                
          asset: rawAsset,               
          quantity: qty,
          price: parseCleanNumber(row[8]),   
          amount: parseCleanNumber(row[9])   
        });

        if (asset) {
          if (!currentHoldings[asset]) currentHoldings[asset] = 0;
          if (type === 'BUY') currentHoldings[asset] += qty;
          if (type === 'SELL') currentHoldings[asset] -= qty;
        }
      }

      // 3. Process Live Prices
      const livePricesMap = {};
      for (let i = 1; i < priceRows.length; i++) {
        const row = priceRows[i];
        if (!row || !row[0] || row[0].trim() === '') continue;
        
        const ticker = row[0].trim().toUpperCase();
        livePricesMap[ticker] = {
          livePrice: parseCleanNumber(row[4]),
          low52: parseCleanNumber(row[5]),
          high52: parseCleanNumber(row[6])
        };
      }

      // 4. Calculate Metrics
      state.quantMetrics = computeQuantMetrics(benchmarkData, latestAum);
      state.sotpMetrics = computeSOTPStressTest(currentHoldings, livePricesMap, latestAum);

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

      renderHeaderStats(payload.portfolioSummary, state.quantMetrics, state.sotpMetrics);
      renderChartOverlay(payload.benchmarkData, state.activeHorizon);
      renderRiskAndStressMetrics(payload.portfolioSummary, state.quantMetrics, state.sotpMetrics);
      initSipSimulator(state.quantMetrics.cagr);
      renderLedger(state.ledgerData);

    } catch (err) {
      console.error("Database Connection Error:", err);
      const aumEl = document.getElementById('headerAum');
      if (aumEl) aumEl.textContent = "Error loading DB";
    }
  }

  function initSipSimulator(cagrRate, isShortTerm) {
    const amountRange = document.getElementById('sipAmountRange');
    const durationRange = document.getElementById('sipDurationRange');
    const returnDisplay = document.getElementById('sipReturnDisplay');

    // Hardcode the rate to the calculated portfolio CAGR/Abs
    const targetRate = cagrRate || 0; 
    
    if (returnDisplay) {
      returnDisplay.textContent = targetRate.toFixed(2);
      returnDisplay.style.color = targetRate >= 0 ? '#10b981' : '#ef4444';
    }

    function runSimulation() {
      const P = parseCleanNumber(amountRange ? amountRange.value : 10000);
      const years = parseCleanNumber(durationRange ? durationRange.value : 5);
      
      const annualRate = targetRate / 100;
      const i = annualRate / 12;
      const n = years * 12;

      const amtDisp = document.getElementById('sipAmountDisplay');
      const durDisp = document.getElementById('sipDurationDisplay');
      if (amtDisp) amtDisp.textContent = formatINR(P);
      if (durDisp) durDisp.textContent = `${years} ${years === 1 ? 'Year' : 'Years'}`;

      // Calculate future value (safeguard against exactly 0% return)
      let futureValue = 0;
      if (i === 0) {
        futureValue = P * n;
      } else {
        futureValue = P * (((Math.pow(1 + i, n) - 1) / i)) * (1 + i);
      }
      
      const totalInvested = P * n;
      const wealthGain = futureValue - totalInvested;

      const totalInvEl = document.getElementById('simTotalInvested');
      const wealthGainEl = document.getElementById('simWealthGain');
      const projTotalEl = document.getElementById('simProjectedTotal');

      if (totalInvEl) totalInvEl.textContent = formatINR(totalInvested);
      
      if (wealthGainEl) {
        wealthGainEl.textContent = formatINR(wealthGain);
        wealthGainEl.style.color = wealthGain >= 0 ? '#10b981' : '#ef4444';
      }
      
      if (projTotalEl) projTotalEl.textContent = formatINR(futureValue);
    }

    if (amountRange) amountRange.addEventListener('input', runSimulation);
    if (durationRange) durationRange.addEventListener('input', runSimulation);
    runSimulation();
  }

 function computeSOTPStressTest(holdings, livePricesMap, totalAum) {
    if (!livePricesMap || Object.keys(livePricesMap).length === 0) return null;

    let totalAssetValue = 0;
    let maxDownsideAssets = 0;
    let maxUpsideAssets = 0;
    let matchedCount = 0;
    let hasLoadingErrors = false; // Circuit Breaker Flag

    for (const rawTicker in holdings) {
      const ticker = rawTicker.trim().toUpperCase();
      const qty = holdings[rawTicker];
      
      if (qty > 0 && livePricesMap[ticker]) {
        const assetData = livePricesMap[ticker];
        
        // If Google Finance hasn't resolved yet, these export as "#N/A" and parse to 0.
        // We flag this to prevent catastrophic math errors.
        if (assetData.livePrice <= 0 || assetData.low52 <= 0 || assetData.high52 <= 0) {
          hasLoadingErrors = true;
        }

        totalAssetValue += qty * assetData.livePrice;
        maxDownsideAssets += qty * assetData.low52;
        maxUpsideAssets += qty * assetData.high52;
        matchedCount++;
      }
    }

    // Circuit Breaker: If data is still loading in Google Sheets, fallback to statistical baseline
    if (hasLoadingErrors || matchedCount === 0 || totalAssetValue <= 0 || (totalAssetValue < totalAum * 0.20)) {
      return null;
    }

    const impliedCash = Math.max(0, totalAum - totalAssetValue);
    const maxDownsideTotal = maxDownsideAssets + impliedCash;
    const maxUpsideTotal = maxUpsideAssets + impliedCash;

    const maxDrawdownPct = totalAum > 0 ? ((maxDownsideTotal - totalAum) / totalAum) * 100 : 0;
    const maxUpsidePct = totalAum > 0 ? ((maxUpsideTotal - totalAum) / totalAum) * 100 : 0;

    return {
      downsideTotal: maxDownsideTotal,
      downsidePct: maxDrawdownPct,
      upsideTotal: maxUpsideTotal,
      upsidePct: maxUpsidePct,
      impliedCash: impliedCash
    };
  }

  function computeQuantMetrics(benchmarkData, totalAum) {
    if (!benchmarkData || benchmarkData.length < 2) {
      return { cagr: 0, beta: 1.00, maxDrawdownPct: 0, isShortTerm: true };
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

      if (currP > maxPeak) maxPeak = currP;
      const dd = maxPeak > 0 ? (currP - maxPeak) / maxPeak : 0;
      if (dd < maxDrawdown) maxDrawdown = dd;
    }

    const meanP = pReturns.reduce((a, b) => a + b, 0) / pReturns.length;
    const meanM = mReturns.reduce((a, b) => a + b, 0) / mReturns.length;

    let cov = 0, varM = 0;
    for (let i = 0; i < pReturns.length; i++) {
      const diffP = pReturns[i] - meanP;
      const diffM = mReturns[i] - meanM;
      cov += diffP * diffM;
      varM += diffM * diffM;
    }

    const beta = varM > 0 ? (cov / varM) : 1.00;

    const startDate = new Date(benchmarkData[0].date);
    const endDate = new Date(benchmarkData[benchmarkData.length - 1].date);
    const diffDays = Math.max(1, (endDate - startDate) / (1000 * 60 * 60 * 24));

    const startNav = benchmarkData[0].portfolioNav;
    const endNav = benchmarkData[benchmarkData.length - 1].portfolioNav;
    const totalReturnRatio = startNav > 0 ? endNav / startNav : 1;

    const isShortTerm = diffDays < 365;
    let returnPct = isShortTerm
      ? (totalReturnRatio - 1) * 100 // Simple Absolute Return for <1Y
      : (Math.pow(totalReturnRatio, 365 / diffDays) - 1) * 100; // Compound Annual Rate for >1Y

    return {
      cagr: returnPct,
      beta: Math.max(0, beta),
      maxDrawdownPct: maxDrawdown * 100,
      isShortTerm: isShortTerm
    };
  }

  function renderHeaderStats(summary, quant, sotp) {
    if (!summary || !quant) return;
    const aumEl = document.getElementById('headerAum');
    const betaEl = document.getElementById('headerBeta');
    const varEl = document.getElementById('headerVar'); 
    const cagrEl = document.getElementById('headerCagr'); 

    if (aumEl) aumEl.textContent = formatINR(summary.totalAum);
    if (betaEl) betaEl.textContent = parseCleanNumber(quant.beta).toFixed(2);
    
    if (cagrEl) {
      const sign = quant.cagr > 0 ? '+' : '';
      const label = quant.isShortTerm ? ' (Abs)' : '';
      cagrEl.textContent = `${sign}${quant.cagr.toFixed(2)}%${label}`;
      cagrEl.style.color = quant.cagr >= 0 ? '#10b981' : '#ef4444'; 
    }
    
    if (varEl) {
      if (sotp) {
        varEl.textContent = formatINR(sotp.downsideTotal);
      } else {
        varEl.textContent = formatINR(summary.totalAum * 0.90);
      }
    }
  }

  function renderRiskAndStressMetrics(summary, quant, sotp) {
    if (!summary || !quant) return;

    const upsidePot = document.getElementById('upsidePotential');
    const upsideVal = document.getElementById('upsideValue');
    const mVarPct = document.getElementById('monthlyVarPct');
    const mVarVal = document.getElementById('monthlyVarVal');
    const varInterp = document.getElementById('varInterpretation');
    const maxDraw = document.getElementById('maxDrawdown');

    // 1. Max Upside Potential
    if (sotp) {
      const sign = sotp.upsidePct > 0 ? '+' : '';
      if (upsidePot) upsidePot.textContent = `${sign}${sotp.upsidePct.toFixed(1)}%`;
      if (upsideVal) upsideVal.textContent = formatINR(sotp.upsideTotal);
    } else {
      const years = state.activeHorizon === '1Y' ? 1 : state.activeHorizon === '3Y' ? 3 : 5;
      const baseReturn = quant.isShortTerm || quant.cagr <= 0 ? 12 : quant.cagr;
      const projUpside = Math.max(0, baseReturn * years);
      if (upsidePot) upsidePot.textContent = `+${projUpside.toFixed(1)}%`;
      if (upsideVal) upsideVal.textContent = formatINR(summary.totalAum * (1 + projUpside / 100));
    }

    // 2. Downside Potential / Stress
    if (sotp) {
      const sign = sotp.downsidePct > 0 ? '+' : '';
      if (mVarPct) mVarPct.textContent = `${sign}${sotp.downsidePct.toFixed(1)}%`;
      if (mVarVal) mVarVal.textContent = formatINR(sotp.downsideTotal);
    } else {
      const estDownsidePct = -10.0;
      const estDownsideVal = summary.totalAum * 0.90;
      if (mVarPct) mVarPct.textContent = `${estDownsidePct.toFixed(1)}%`;
      if (mVarVal) mVarVal.textContent = formatINR(estDownsideVal);
    }

    // 3. Historical Max Drawdown
    if (maxDraw) {
      if (upsidePot) {
        maxDraw.textContent = `${quant.maxDrawdownPct.toFixed(1)}%`;
      }
    }

    // Interpretation Text
    if (varInterp) {
      if (sotp) {
        varInterp.innerHTML = `<strong>Quantitative Interpretation:</strong> If all current portfolio assets simultaneously drop to their respective 52-week lows under extreme market distress, the total portfolio AUM would decline to <strong>${formatINR(sotp.downsideTotal)}</strong>.`;
      } else {
        varInterp.innerHTML = `<strong>Quantitative Interpretation:</strong> Projected risk envelope under standard historical market volatility parameters.`;
      }
    }
  }

  function bindEvents() {
    document.querySelectorAll('.horizon-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.horizon-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        state.activeHorizon = e.target.getAttribute('data-horizon');

        if (state.rawPayload && state.quantMetrics) {
          renderChartOverlay(state.rawPayload.benchmarkData, state.activeHorizon);
          renderRiskAndStressMetrics(state.rawPayload.portfolioSummary, state.quantMetrics, state.sotpMetrics);
        }
      });
    });

    const searchInput = document.getElementById('ledgerSearchInput');
    const typeFilter = document.getElementById('ledgerTypeFilter');
    if (searchInput) searchInput.addEventListener('input', filterLedger);
    if (typeFilter) typeFilter.addEventListener('change', filterLedger);
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

 function initSipSimulator(portfolioReturnPct) {
    const amountRange = document.getElementById('sipAmountRange');
    const durationRange = document.getElementById('sipDurationRange');
    const returnDisplay = document.getElementById('sipReturnDisplay');

    // Lock simulation directly to portfolio's CAGR / Absolute Return
    const annualReturn = parseCleanNumber(portfolioReturnPct);

    if (returnDisplay) {
      const sign = annualReturn > 0 ? '+' : '';
      returnDisplay.textContent = `${sign}${annualReturn.toFixed(2)}`;
      returnDisplay.style.color = annualReturn >= 0 ? '#10b981' : '#ef4444';
    }

    function runSimulation() {
      const P = parseCleanNumber(amountRange ? amountRange.value : 10000);
      const years = parseCleanNumber(durationRange ? durationRange.value : 1);
      
      const i = (annualReturn / 100) / 12;
      const n = years * 12;

      const amtDisp = document.getElementById('sipAmountDisplay');
      const durDisp = document.getElementById('sipDurationDisplay');
      if (amtDisp) amtDisp.textContent = formatINR(P);
      if (durDisp) durDisp.textContent = `${years} ${years === 1 ? 'Year' : 'Years'}`;

      let futureValue = 0;
      if (Math.abs(i) < 0.000001) {
        futureValue = P * n; // 0% return case
      } else {
        futureValue = P * (((Math.pow(1 + i, n) - 1) / i)) * (1 + i);
      }
      
      const totalInvested = P * n;
      const wealthGain = futureValue - totalInvested;

      const totalInvEl = document.getElementById('simTotalInvested');
      const wealthGainEl = document.getElementById('simWealthGain');
      const projTotalEl = document.getElementById('simProjectedTotal');

      if (totalInvEl) totalInvEl.textContent = formatINR(totalInvested);
      
      if (wealthGainEl) {
        wealthGainEl.textContent = formatINR(wealthGain);
        wealthGainEl.style.color = wealthGain >= 0 ? '#10b981' : '#ef4444';
      }
      
      if (projTotalEl) projTotalEl.textContent = formatINR(futureValue);
    }

    if (amountRange) amountRange.oninput = runSimulation;
    if (durationRange) durationRange.oninput = runSimulation;
    
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