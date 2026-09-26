/**
 * CLIENT QUANTITATIVE ANALYTICS ENGINE (LIVE GOOGLE SHEETS CALCULATOR)
 * Features 52-Week SOTP High/Low Range, Historical Drawdown, CAGR, & Integrated SIP Simulator
 */

(function () {
  'use strict';

  // PUBLISHED CSV LINKS FROM FILE -> SHARE -> PUBLISH TO WEB
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

  // --- UTILS ---

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

  // Safe date parser for DD/MM/YYYY or standard formats
  function parseAppDate(dateStr) {
    if (!dateStr) return new Date();
    if (typeof dateStr === 'string' && dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      }
    }
    return new Date(dateStr);
  }

  // --- INITIALIZATION ---

  document.addEventListener('DOMContentLoaded', () => {
    extractQueryParams();
    bindEvents();
    fetchClientData();
  });

  function extractQueryParams() {
    const urlParams = new URLSearchParams(window.location.search);
    state.clientId = urlParams.get('clientId');
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

  // --- DATA FETCHING & PARSING ---

  async function fetchClientData() {
    try {
      const cb = `&t=${new Date().getTime()}`;
      const fetchPromises = [fetch(NAV_CSV_URL + cb), fetch(TXN_CSV_URL + cb)];
      
      if (LIVE_PRICES_CSV_URL && !LIVE_PRICES_CSV_URL.includes("PASTE_YOUR")) {
        fetchPromises.push(fetch(LIVE_PRICES_CSV_URL + cb));
      }

      const responses = await Promise.all(fetchPromises);
      if (!responses[0].ok || !responses[1].ok) {
        throw new Error("Unable to fetch primary CSV feeds.");
      }

      const navText = await responses[0].text();
      const txnText = await responses[1].text();
      let priceText = null;
      if (responses[2] && responses[2].ok) priceText = await responses[2].text();

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
        latestAum = parseCleanNumber(row[2]);
        if (!inceptionDate) inceptionDate = dateStr;
        benchmarkData.push({
          date: dateStr,
          portfolioNav: parseCleanNumber(row[4]),
          niftyNav: parseCleanNumber(row[8])
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

      // 3. Process Live Prices & Asset Names (Cols F, G, H, I -> Indices 5, 6, 7, 8)
      const livePricesMap = {};
      const assetNames = {};
      
      for (let i = 1; i < priceRows.length; i++) {
        const row = priceRows[i];
        if (!row || !row[0] || row[0].trim() === '') continue;
        
        const ticker = row[0].toString().trim();
        const cleanTicker = ticker.replace(/^(NSE:|BSE:)/i, '').trim().toUpperCase();
        
        // Asset Names from Column B (Index 1)
        assetNames[cleanTicker] = row[1] ? row[1].toString().trim() : cleanTicker;

        livePricesMap[cleanTicker] = {
          livePrice: parseCleanNumber(row[5]),
          low52: parseCleanNumber(row[6]),
          high52: parseCleanNumber(row[7]),
          change1D: parseCleanNumber(row[8]) 
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

      // 5. Render Everything
      renderHeaderStats(payload.portfolioSummary, state.quantMetrics, state.sotpMetrics);
      renderChartOverlay(payload.benchmarkData, state.activeHorizon);
      renderRiskAndStressMetrics(payload.portfolioSummary, state.quantMetrics, state.sotpMetrics);
      initSipSimulator(state.quantMetrics.cagr);
      
      renderLedger(state.ledgerData);
      renderDetailedHoldings(payload.transactionLedger, livePricesMap, assetNames);

    } catch (err) {
      console.error("Database Connection Error:", err);
      const aumEl = document.getElementById('headerAum');
      if (aumEl) aumEl.textContent = "Error loading DB";
    }
  }

  // --- MATH & QUANT LOGIC ---

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
      ? (totalReturnRatio - 1) * 100 
      : (Math.pow(totalReturnRatio, 365 / diffDays) - 1) * 100; 

    return {
      cagr: returnPct,
      beta: Math.max(0, beta),
      maxDrawdownPct: maxDrawdown * 100,
      isShortTerm: isShortTerm
    };
  }

  function computeSOTPStressTest(holdings, livePricesMap, totalAum) {
    if (!livePricesMap || Object.keys(livePricesMap).length === 0) return null;

    let totalAssetValue = 0;
    let maxDownsideAssets = 0;
    let maxUpsideAssets = 0;
    let matchedCount = 0;
    let hasLoadingErrors = false;

    for (const rawTicker in holdings) {
      const ticker = rawTicker.replace(/^(NSE:|BSE:)/i, '').trim().toUpperCase();
      const qty = holdings[rawTicker];
      
      if (qty > 0 && livePricesMap[ticker]) {
        const assetData = livePricesMap[ticker];
        
        if (assetData.livePrice <= 0 || assetData.low52 <= 0 || assetData.high52 <= 0) {
          hasLoadingErrors = true;
        }

        totalAssetValue += qty * assetData.livePrice;
        maxDownsideAssets += qty * assetData.low52;
        maxUpsideAssets += qty * assetData.high52;
        matchedCount++;
      }
    }

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

  function calculateXIRR(cashflows, guess = 0.1) {
    const maxIter = 100;
    const tol = 1e-6;
    let rate = guess; 
    
    let hasPos = false, hasNeg = false;
    for (let cf of cashflows) {
      if (cf.amount > 0) hasPos = true;
      if (cf.amount < 0) hasNeg = true;
    }
    if (!hasPos || !hasNeg) return NaN;

    const t0 = cashflows[0].date.getTime();
    
    for (let i = 0; i < maxIter; i++) {
      let f = 0;
      let df = 0;
      for (let j = 0; j < cashflows.length; j++) {
        const cf = cashflows[j];
        const t = (cf.date.getTime() - t0) / (1000 * 3600 * 24 * 365);
        f += cf.amount / Math.pow(1 + rate, t);
        // Avoid division by zero on same-day purchases
        if (t > 0) df -= (t * cf.amount) / Math.pow(1 + rate, t + 1); 
      }
      if (Math.abs(df) < 1e-8) return NaN; // Failsafe
      
      const nextRate = rate - f / df;
      if (Math.abs(nextRate - rate) < tol) return nextRate;
      rate = nextRate;
    }
    return NaN;
  }

  // --- UI & RENDERING ---

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

    if (maxDraw) {
      if (upsidePot) maxDraw.textContent = `${quant.maxDrawdownPct.toFixed(1)}%`;
    }

    if (varInterp) {
      if (sotp) {
        varInterp.innerHTML = `<strong>Quantitative Interpretation:</strong> If all current portfolio assets simultaneously drop to their respective 52-week lows under extreme market distress, the total portfolio AUM would decline to <strong>${formatINR(sotp.downsideTotal)}</strong>.`;
      } else {
        varInterp.innerHTML = `<strong>Quantitative Interpretation:</strong> Projected risk envelope under standard historical market volatility parameters.`;
      }
    }
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
    const tbody = document.getElementById('transactionTableBody') || document.getElementById('ledgerTableBody');
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

  function renderDetailedHoldings(ledger, livePricesMap, assetNames = {}) {
    const tbody = document.getElementById('holdingsTableBody');
    const countBadge = document.getElementById('activeAssetCount');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    const assetData = {};

    const normalizeTicker = (t) => (t || "").replace(/^(NSE:|BSE:)/i, '').trim().toUpperCase();

    const normalizedPrices = {};
    if (livePricesMap) {
      for (const key in livePricesMap) {
        normalizedPrices[normalizeTicker(key)] = livePricesMap[key];
      }
    }

    const normalizedNames = {};
    for (const key in assetNames) {
      normalizedNames[normalizeTicker(key)] = assetNames[key];
    }
    
    // 1. Group ledger cashflows by asset
    ledger.forEach(txn => {
      const rawAsset = (txn.asset || "").trim();
      const lookupKey = normalizeTicker(rawAsset);
      if (!lookupKey || lookupKey === 'CASH') return; // Skip cash or empty

      if (!assetData[lookupKey]) {
        assetData[lookupKey] = {
          displayName: rawAsset, 
          qty: 0,
          totalBuyCost: 0,
          totalBuyShares: 0,
          firstDate: txn.date,
          cashflows: []
        };
      }
      
      const dateObj = parseAppDate(txn.date);
      
      if (txn.type === 'BUY') {
        assetData[lookupKey].qty += txn.quantity;
        assetData[lookupKey].totalBuyShares += txn.quantity;
        assetData[lookupKey].totalBuyCost += txn.amount;
        assetData[lookupKey].cashflows.push({ amount: -txn.amount, date: dateObj });
        
        if (dateObj < parseAppDate(assetData[lookupKey].firstDate)) {
           assetData[lookupKey].firstDate = txn.date;
        }
      } else if (txn.type === 'SELL') {
        assetData[lookupKey].qty -= txn.quantity;
        assetData[lookupKey].cashflows.push({ amount: txn.amount, date: dateObj });
      }
    });
    
    const activeAssets = [];
    
    // 2. Compute individual asset metrics
    for (const lookupKey in assetData) {
      const data = assetData[lookupKey];
      const live = normalizedPrices[lookupKey];

      if (data.qty <= 0 || !live) continue; 
      
      const avgBuy = data.totalBuyShares > 0 ? (data.totalBuyCost / data.totalBuyShares) : 0;
      const invested = data.qty * avgBuy;
      const current = data.qty * live.livePrice;
      const pnl = current - invested;
      const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
      
      const msPerDay = 1000 * 60 * 60 * 24;
      const daysHeld = Math.floor((new Date() - parseAppDate(data.firstDate)) / msPerDay);
      const ageStr = daysHeld > 365 ? `${(daysHeld/365).toFixed(1)} Yrs` : `${Math.max(0, daysHeld)} Days`;
      
      let rangePct = 50;
      if (live.high52 > live.low52) {
        rangePct = ((live.livePrice - live.low52) / (live.high52 - live.low52)) * 100;
        rangePct = Math.max(0, Math.min(100, rangePct));
      }
      
      const finalFlows = [...data.cashflows, { amount: current, date: new Date() }];
      const xirrPct = calculateXIRR(finalFlows);
      const xirrStr = isNaN(xirrPct) ? (pnlPct > 0 ? '+' : '') + pnlPct.toFixed(2) + '% (Abs)' : (xirrPct > 0 ? '+' : '') + (xirrPct * 100).toFixed(2) + '%';
      
      const pnlColor = pnl >= 0 ? '#10b981' : '#ef4444';
      const changeColor = live.change1D >= 0 ? '#10b981' : '#ef4444';
      const sign = live.change1D > 0 ? '+' : '';
      
      const rawTicker = data.displayName;
      const properName = normalizedNames[lookupKey] || rawTicker;

      // Push into array to sort later
      activeAssets.push({
        properName,
        rawTicker,
        ageStr,
        live,
        data,
        avgBuy,
        current,
        pnl,
        pnlColor,
        changeColor,
        sign,
        rangePct,
        xirrStr
      });
    }
    
    // 3. Sort assets from highest allocation/valuation to lowest allocation/valuation
    activeAssets.sort((a, b) => b.current - a.current);

    // 4. Render sorted rows
    activeAssets.forEach(item => {
      const { properName, rawTicker, ageStr, live, data, avgBuy, current, pnl, pnlColor, changeColor, sign, rangePct, xirrStr } = item;
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="width: 26%;">
          <div class="asset-name-wrapper" style="display: flex; align-items: center; gap: 12px;">
            <!-- Dynamic Asset Icon -->
            <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(properName)}&background=random&color=fff&rounded=true&size=32&bold=true" 
                 alt="icon" 
                 style="width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;" />
            
            <div style="display: flex; flex-direction: column;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="tier-main" title="${properName}" style="font-weight: 600;">${properName}</span>
                <svg class="info-icon" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px; stroke: #94a3b8; cursor: pointer;">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
              </div>
              <span class="tier-sub" style="color: #94a3b8; font-size: 0.8rem; display: block; margin-top: 4px;">${rawTicker} • Held: ${ageStr}</span>
            </div>
          </div>
        </td>
        <td class="text-right" style="width: 18%; text-align: right;">
          <span class="tier-main mono" style="display: block;">₹${live.livePrice.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
          <span class="tier-sub mono" style="color: ${changeColor}; font-size: 0.8rem; display: block; margin-top: 4px;">${sign}${live.change1D.toFixed(2)}% (1D)</span>
        </td>
        <td class="text-right" style="width: 18%; text-align: right;">
          <span class="tier-main mono" style="display: block;">${data.qty}</span>
          <span class="tier-sub mono" style="color: #94a3b8; font-size: 0.8rem; display: block; margin-top: 4px;">Avg: ₹${avgBuy.toLocaleString('en-IN', {maximumFractionDigits: 2})}</span>
        </td>
        <td class="text-right" style="width: 20%; text-align: right;">
          <span class="tier-main mono" style="display: block;">₹${current.toLocaleString('en-IN', {maximumFractionDigits: 0})}</span>
          <span class="tier-sub mono" style="color: ${pnlColor}; font-size: 0.8rem; display: block; margin-top: 4px;">${pnl > 0 ? '+' : ''}₹${pnl.toLocaleString('en-IN', {maximumFractionDigits: 0})} | ${xirrStr}</span>
        </td>
        <td class="text-center" style="width: 18%; vertical-align: middle;">
          <div class="range-container" style="position: relative; width: 100%; max-width: 120px; margin: 0 auto;">
            <div class="range-track" style="height: 4px; background: #334155; border-radius: 2px; position: relative; margin-bottom: 6px;">
              <div class="range-pin" style="position: absolute; top: -4px; width: 12px; height: 12px; background: #3b82f6; border-radius: 50%; left: ${rangePct}%; transform: translateX(-50%); box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>
            </div>
            <div class="range-labels" style="display: flex; justify-content: space-between; font-size: 0.7rem; color: #64748b; font-family: monospace;">
              <span>₹${live.low52.toFixed(1)}</span>
              <span>₹${live.high52.toFixed(1)}</span>
            </div>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
    
    if (countBadge) countBadge.textContent = `${activeAssets.length} Assets`;
  }

})();