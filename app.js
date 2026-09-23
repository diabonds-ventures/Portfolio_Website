// ==========================================
// 1. THE CENTRAL DATABASE
// ==========================================
const clientDatabase = {
  'DiabondsVentures':  { pin: '0000', name: 'Diabonds Ventures' },
  'ashwin': { pin: '5678', name: 'Ashwin' },
};

// ==========================================
// 2. THE PAGE ROUTER & SECURITY
// ==========================================

// SECURITY: Detect if the user clicked the browser "Back" button
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    window.location.reload(); // Forces the page to wake up and run the security checks again
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const currentPath = window.location.pathname.toLowerCase();

  if (currentPath.includes('login')) {
    setupLoginPage();
    hideLoader(); 
  } else if (currentPath.includes('clientdaashboard')) { 
    setupClientDashboard();
  } else if (currentPath.includes('portfolios')) {
    setupPortfoliosPage();
  } else if (currentPath.includes('firm') || currentPath === '/' || currentPath === '') {
    setupFirmDashboard();
  } else {
    hideLoader();
  }
});

// ==========================================
// 3. HELPER UTILITIES & ICON GENERATORS
// ==========================================
const formatCurrency = (num) => {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);
};

const formatPercent = (num) => {
  if (isNaN(num)) return '--%';
  const sign = num >= 0 ? '+' : '';
  return `${sign}${num.toFixed(2)}%`;
};

function updateMetricUI(elementId, value) {
  const el = document.getElementById(elementId);
  if (!el) return;
  
  el.innerText = formatPercent(value);
  if (value >= 0) {
    el.classList.add('text-green');
    el.classList.remove('text-red');
  } else {
    el.classList.add('text-red');
    el.classList.remove('text-green');
  }
}

function hideLoader() {
  const loader = document.getElementById('global-loader');
  if (loader) {
    loader.style.opacity = '0';
    setTimeout(() => loader.style.display = 'none', 400); 
  }
}

// ------------------------------------------
// a. HELPER: GENERATE 2-LETTER INITIALS
// ------------------------------------------
function getAssetInitials(fullName) {
  if (!fullName) return 'AS';
  
  // Clean special characters and trim spaces
  const cleanName = fullName.trim().replace(/[^a-zA-Z0-9\s]/g, '');
  const words = cleanName.split(/\s+/).filter(Boolean);

  if (words.length >= 2) {
    // Take 1st letter of 1st word + 1st letter of 2nd word (e.g., "Diabonds Ventures" -> "DV")
    return (words[0][0] + words[1][0]).toUpperCase();
  } else if (words.length === 1 && words[0].length >= 2) {
    // Take first 2 letters if single word (e.g., "Gold" -> "GO", "Cash" -> "CA")
    return words[0].substring(0, 2).toUpperCase();
  } else if (words.length === 1 && words[0].length === 1) {
    return (words[0][0] + 'X').toUpperCase();
  }
  
  return 'AS';
}

// ------------------------------------------
// b. DYNAMIC ICON WITH AUTOMATIC INITIALS FALLBACK
// ------------------------------------------
function getAssetIcon(assetFullName) {
  const name = assetFullName || 'Asset';
  const initials = getAssetInitials(name);
  
  // Path matching exact asset full name from Master_Holdings (Column C)
  const imagePath = `images/${name}.png`;

  return `
    <div class="asset-icon-wrapper" style="position: relative; width: 32px; height: 32px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;">
      <!-- Primary: Local Image from images/ folder -->
      <img 
        src="${imagePath}" 
        alt="${name}"
        style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; display: block;"
        onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
      />
      
      <!-- Fallback: 2-Letter Badge (Shows automatically if image missing/fails to load) -->
      <div 
        class="asset-initials-badge" 
        style="display: none; width: 32px; height: 32px; border-radius: 50%; background: #1E293B; color: #C8F33D; border: 1px solid rgba(255,255,255,0.1); font-weight: 700; font-size: 0.75rem; align-items: center; justify-content: center; letter-spacing: 0.5px; text-transform: uppercase; box-shadow: 0 2px 5px rgba(0,0,0,0.15);"
      >
        ${initials}
      </div>
    </div>
  `;
}

// ==========================================
// 4. THE DATA ENGINE (CSV Fetcher)
// ==========================================
const CSV_URLS = {
  liveSummary: "https://docs.google.com/spreadsheets/d/e/2PACX-1vS7I_zj5rMDE3MtKOZj2A4UMYt_dn38Y3MxBxyMCflePaHRDYmROUwWrlvvCQ7idR87n_TY-YPEhZzA/pub?gid=1329581510&single=true&output=csv",
  historicalNav: "https://docs.google.com/spreadsheets/d/e/2PACX-1vS7I_zj5rMDE3MtKOZj2A4UMYt_dn38Y3MxBxyMCflePaHRDYmROUwWrlvvCQ7idR87n_TY-YPEhZzA/pub?gid=702735038&single=true&output=csv",
  masterHoldings: "https://docs.google.com/spreadsheets/d/e/2PACX-1vS7I_zj5rMDE3MtKOZj2A4UMYt_dn38Y3MxBxyMCflePaHRDYmROUwWrlvvCQ7idR87n_TY-YPEhZzA/pub?gid=347377208&single=true&output=csv"
};

async function fetchCSV(url) {
  try {
    const timestamp = new Date().getTime();
    
    // 1. Safely check if the URL needs a '?' or '&' for the cache-buster
    const separator = url.includes('?') ? '&' : '?';
    const cacheBusterUrl = `${url}${separator}_cb=${timestamp}`;
    
    const response = await fetch(cacheBusterUrl, { cache: 'no-store' });
    let data = await response.text();
    
    // 2. Clean out the \r characters that were showing up in your console
    data = data.replace(/\r/g, ''); 
    
    // 3. Split by new line, then split by comma, and trim every individual cell
    return data
      .trim()
      .split('\n')
      .map(row => {
        return row.split(',').map(cell => cell.trim());
      });
      
  } catch (error) {
    console.error("Error fetching data:", error);
    return null;
  }

}

// ==========================================
// 5. LOGIN PAGE LOGIC
// ==========================================
function setupLoginPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const urlClientId = urlParams.get('client'); 

  const welcomeMessage = document.getElementById('welcome-message');
  const usernameInput = document.getElementById('username-input');
  const loginForm = document.getElementById('login-form');
  const errorMessage = document.getElementById('error-message');

  if (urlClientId && clientDatabase[urlClientId]) {
    if(welcomeMessage) welcomeMessage.innerText = `Welcome, ${clientDatabase[urlClientId].name}`;
    if(usernameInput) usernameInput.style.display = 'none'; 
  } else {
    if(welcomeMessage) welcomeMessage.innerText = "Login....";
    if(usernameInput) {
      usernameInput.style.display = 'block'; 
      usernameInput.required = true;         
    }
  }

  if(loginForm) {
    loginForm.addEventListener('submit', function(event) {
      event.preventDefault(); 
      
      const attemptId = urlClientId || (usernameInput ? usernameInput.value.trim() : '');
      const enteredPin = document.getElementById('pin-input').value.trim();

      if (clientDatabase[attemptId] && clientDatabase[attemptId].pin === enteredPin) {
        sessionStorage.setItem('loggedInClientId', attemptId);
        sessionStorage.setItem('loggedInClientName', clientDatabase[attemptId].name);
        window.location.href = 'clientDaashboard.html'; 
      } else {
        if(errorMessage) {
          errorMessage.style.display = 'block'; 
          errorMessage.innerText = 'Incorrect Client ID or PIN.';
        }
        document.getElementById('pin-input').value = ''; 
      }
    });
  }
}

// ==========================================
// 6. PORTFOLIOS ROSTER PAGE
// ==========================================
async function setupPortfoliosPage() {
  const summaryData = await fetchCSV(CSV_URLS.liveSummary);
  const historyData = await fetchCSV(CSV_URLS.historicalNav);
  
  const container = document.getElementById('portfolio-rows-container');
  
  if (!container || !summaryData || !historyData) {
    hideLoader();
    return;
  }

  let html = '';
  const clientsToChart = []; 
  
  for (let i = 1; i < summaryData.length; i++) {
    const clientId = summaryData[i][0];
    if (!clientId) continue;

    const clientName = clientDatabase[clientId] ? clientDatabase[clientId].name : clientId;
    const clientHistory = historyData.filter(row => row[1] === clientId);
    
    let nav1D = 0, nav1W = 0, nav1M = 0, navMax = 0;
    let isDowntrend = false;
    let navData = []; 

    if (clientHistory.length > 0) {
      const currentNAV = parseFloat(clientHistory.at(-1)[4]); 
      const initialNAV = parseFloat(clientHistory[0][4]);     
      
      const past1D = clientHistory.length > 1 ? parseFloat(clientHistory.at(-2)[4]) : initialNAV;
      const past1W = clientHistory.length > 7 ? parseFloat(clientHistory.at(-8)[4]) : initialNAV;
      const past1M = clientHistory.length > 30 ? parseFloat(clientHistory.at(-31)[4]) : initialNAV;

      nav1D = ((currentNAV - past1D) / past1D) * 100;
      nav1W = ((currentNAV - past1W) / past1W) * 100;
      nav1M = ((currentNAV - past1M) / past1M) * 100;
      navMax = ((currentNAV - initialNAV) / initialNAV) * 100;
      
      isDowntrend = currentNAV < initialNAV;
      navData = clientHistory.map(row => parseFloat(row[4])); 
    }

    const getColorClass = (val) => val >= 0 ? 'text-green' : 'text-red';
    const canvasId = `spark-${clientId}`; 

    html += `
      <a href="login.html?client=${clientId}" class="table-row dia-grid">
        <div class="client-name">${clientName}</div>
        <div class="${getColorClass(nav1D)}">${formatPercent(nav1D)}</div>
        <div class="${getColorClass(nav1W)}">${formatPercent(nav1W)}</div>
        <div class="${getColorClass(nav1M)}">${formatPercent(nav1M)}</div>
        <div class="${getColorClass(navMax)}">${formatPercent(navMax)}</div>
        <div class="sparkline-container">
          <canvas id="${canvasId}"></canvas>
        </div>
      </a>
    `;

    clientsToChart.push({ canvasId, navData, isDowntrend });
  }

  container.innerHTML = html;
  
  clientsToChart.forEach(client => {
    if (client.navData.length > 0) {
      drawSparkline(client.canvasId, client.navData, client.isDowntrend);
    }
  });

  hideLoader();
}

// ==========================================
// 7. FIRM DASHBOARD STATE & LOGIC
// ==========================================
let isDetailedView = false;
let globalHoldingsData = [];
let globalTotalAUM = 0;
let firmAllocationChartInstance = null;

async function setupFirmDashboard() {
  const summaryData = await fetchCSV(CSV_URLS.liveSummary);
  const historyData = await fetchCSV(CSV_URLS.historicalNav);
  const holdingsData = await fetchCSV(CSV_URLS.masterHoldings); 

  if (!summaryData || !historyData || !holdingsData) {
    hideLoader();
    return;
  }

  // 1. Calculate Total Firm AUM
  let totalAUM = 0;
  for (let i = 1; i < summaryData.length; i++) {
    const row = summaryData[i];
    if (row[0]) totalAUM += parseFloat(row[2]) || 0; 
  }

  const aumElement = document.getElementById('firm-total-aum');
  if (aumElement) aumElement.innerText = formatCurrency(totalAUM);

  // Store globally for interactive toggling
  globalHoldingsData = holdingsData;
  globalTotalAUM = totalAUM;

  // 2. Firm Historical Chart (Reading 'Diabonds' from Columns G and H)
  const firmHistory = [];
  historyData.forEach(row => {
    const date = row[6];       
    const instNAV = row[7];    
    if (date && instNAV && instNAV !== "Institution Nav" && instNAV !== "NAV") {
      firmHistory.push([date, 'Diabonds', 0, 0, instNAV]); 
    }
  });

  if (firmHistory.length > 0) {
    const currentNAV = parseFloat(firmHistory.at(-1)[4]); 
    const initialNAV = parseFloat(firmHistory[0][4]);     
    
    const nav1D = firmHistory.length > 1 ? parseFloat(firmHistory.at(-2)[4]) : initialNAV;
    const nav1W = firmHistory.length > 7 ? parseFloat(firmHistory.at(-8)[4]) : initialNAV;
    const nav1M = firmHistory.length > 30 ? parseFloat(firmHistory.at(-31)[4]) : initialNAV;

    const calcReturn = (pastNAV) => ((currentNAV - pastNAV) / pastNAV) * 100;

    updateMetricUI('firm-1d', calcReturn(nav1D));
    updateMetricUI('firm-1w', calcReturn(nav1W));
    updateMetricUI('firm-1m', calcReturn(nav1M));
    updateMetricUI('firm-max', calcReturn(initialNAV));

    drawLineChart('firm-chart', firmHistory, 'Firm NAV Growth');
  }

  // 3. Setup Toggle Button Listener
  const toggleBtn = document.getElementById('view-toggle-btn');
  if (toggleBtn) {
    toggleBtn.onclick = () => {
      isDetailedView = !isDetailedView;
      toggleBtn.innerText = isDetailedView ? 'View Asset Classes' : 'View Detailed Assets';
      const chartTitleEl = document.getElementById('chart-title');
      if (chartTitleEl) chartTitleEl.innerText = isDetailedView ? 'INDIVIDUAL ASSET ALLOCATION' : 'ASSET CLASS ALLOCATION';
      renderFirmHoldingsHierarchy();
    };
  }

  // 4. Initial Render of Hierarchical Table & Donut Chart
  renderFirmHoldingsHierarchy();
  
  hideLoader(); 
}

// ==========================================
// 8. CLIENT DASHBOARD STATE & LOGIC
// ==========================================
let isClientDetailedView = false;
let globalClientHoldingsData = [];
let globalClientTotalAUM = 0;
let clientAllocationChartInstance = null;

async function setupClientDashboard() {
  const clientId = sessionStorage.getItem('loggedInClientId');
  
  if (!clientId) {
    window.location.href = 'login.html'; 
    return;
  }

  const clientName = clientDatabase[clientId] ? clientDatabase[clientId].name : clientId;
  
  const greetingEl = document.getElementById('client-greeting');
  if(greetingEl) greetingEl.innerText = `Welcome, ${clientName}`;
  
  const logoutBtn = document.getElementById('logout-btn');
  if(logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      sessionStorage.clear();
      window.location.replace('login.html'); 
    });
  }

  const summaryData = await fetchCSV(CSV_URLS.liveSummary);
  const historyData = await fetchCSV(CSV_URLS.historicalNav);
  const holdingsData = await fetchCSV(CSV_URLS.masterHoldings);

  if (!summaryData || !historyData || !holdingsData) {
    hideLoader();
    return;
  }

  // Set Top Card Info
  const clientSummary = summaryData.find(row => row[0] === clientId);
  if (clientSummary) {
    const grossValue = parseFloat(clientSummary[2]) || 0;
    const netValue = parseFloat(clientSummary[3]) || 0;
    
    globalClientTotalAUM = grossValue; 

    const grossEl = document.getElementById('client-gross-value');
    const netEl = document.getElementById('client-net-value');
    if(grossEl) grossEl.innerText = formatCurrency(grossValue);
    if(netEl) netEl.innerText = formatCurrency(netValue);
  }

  // Draw Line Chart
  const clientHistory = historyData.filter(row => row[1] === clientId);
  if (clientHistory.length > 0) {
    const currentNAV = parseFloat(clientHistory.at(-1)[4]); 
    const initialNAV = parseFloat(clientHistory[0][4]);     
    
    const nav1D = clientHistory.length > 1 ? parseFloat(clientHistory.at(-2)[4]) : initialNAV;
    const nav1W = clientHistory.length > 7 ? parseFloat(clientHistory.at(-8)[4]) : initialNAV;
    const nav1M = clientHistory.length > 30 ? parseFloat(clientHistory.at(-31)[4]) : initialNAV;

    const calcReturn = (pastNAV) => ((currentNAV - pastNAV) / pastNAV) * 100;

    updateMetricUI('client-1d', calcReturn(nav1D));
    updateMetricUI('client-1w', calcReturn(nav1W));
    updateMetricUI('client-1m', calcReturn(nav1M));
    updateMetricUI('client-max', calcReturn(initialNAV));

    drawLineChart('client-line-chart', clientHistory, 'Portfolio Growth');
  }

  // Store client holdings globally and setup Toggle Button
  globalClientHoldingsData = holdingsData.filter(row => row[0] === clientId);
  
  const toggleBtn = document.getElementById('client-view-toggle-btn');
  if (toggleBtn) {
    toggleBtn.onclick = () => {
      isClientDetailedView = !isClientDetailedView;
      toggleBtn.innerText = isClientDetailedView ? 'View Asset Classes' : 'View Detailed Assets';
      renderClientHoldingsHierarchy();
    };
  }

  // Initial Render of Table and Donut Chart
  renderClientHoldingsHierarchy();
  
  hideLoader(); 
}

// ==========================================
// 9. CHARTING & HIERARCHICAL RENDERING FUNCTIONS
// ==========================================

// ==========================================
// HELPER: SAFE NUMBER PARSER
// Strips commas, currency symbols, and spaces before parsing
// ==========================================
function parseCleanNumber(value) {
  if (value === null || value === undefined) return 0;
  const str = value.toString().trim();
  if (!str) return 0;
  const cleaned = str.replace(/[^0-9.-]+/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

// ==========================================
// 9. CHARTING & HIERARCHICAL RENDERING FUNCTIONS
// ==========================================

function renderFirmHoldingsHierarchy() {
  const container = document.getElementById('firm-assets-container');
  const headerContainer = document.getElementById('table-header-container');
  if (!container || !headerContainer) return;

  const macroMap = {};
  const assetMap = {};

  globalHoldingsData.forEach((row, index) => {
    if (index === 0) return; 
    
    const assetName = row[2] ? row[2].toString().trim() : '';  
    const macroClass = row[3] ? row[3].toString().trim() : 'Uncategorized'; 
    const subCategory = row[4] ? row[4].toString().trim() : 'General';
    
    // Safely parse numeric fields without comma truncation
    const shares = parseCleanNumber(row[6]);
    const avgPrice = parseCleanNumber(row[7]);
    const livePrice = parseCleanNumber(row[8]) || avgPrice;
    
    // Use explicit Column J value if present; otherwise auto-calculate
    const explicitValue = parseCleanNumber(row[9]);
    const value = explicitValue > 0 ? explicitValue : (shares * livePrice);

    if (assetName && shares > 0) {
      if (!macroMap[macroClass]) macroMap[macroClass] = 0;
      macroMap[macroClass] += value;

      if (!assetMap[assetName]) {
        assetMap[assetName] = { name: assetName, assetClass: macroClass, value: 0, subCategories: {} };
      }
      assetMap[assetName].value += value;
      
      if (!assetMap[assetName].subCategories[subCategory]) {
        assetMap[assetName].subCategories[subCategory] = 0;
      }
      assetMap[assetName].subCategories[subCategory] += value;
    }
  });

  // Dynamically compute total AUM to prevent 0.00% allocation bugs
  const computedTotalAUM = Object.values(macroMap).reduce((acc, curr) => acc + curr, 0);
  if (typeof globalTotalAUM !== 'undefined') {
    globalTotalAUM = computedTotalAUM;
  }

  let html = '';
  let chartLabels = [];
  let chartValues = [];

  if (!isDetailedView) {
    // --- FIRM MODE 1: ASSET CLASS (MACRO) VIEW ---
    headerContainer.innerHTML = `
      <div class="table-header macro-table-grid" style="margin-bottom: 1rem; padding: 0 1.5rem;">
        <div style="text-align: center;">Rank</div>
        <div style="text-align: left;">Asset Class</div>
        <div style="text-align: left;">Allocation</div>
      </div>
    `;

    const sortedClasses = Object.entries(macroMap).sort((a, b) => b[1] - a[1]);
    
    sortedClasses.forEach(([className, val], i) => {
      const rank = i + 1;
      const allocPercent = computedTotalAUM > 0 ? ((val / computedTotalAUM) * 100).toFixed(2) : '0.00';
      const highlight = rank <= 3 ? 'background-color: rgba(200, 243, 61, 0.15);' : 'background-color: #F8F9FB;';

      chartLabels.push(className);
      chartValues.push(val);

      html += `
        <div class="table-row macro-table-grid" style="${highlight} padding: 1rem 1.5rem; margin-bottom: 0.8rem; border-radius: 16px;">
          <div style="font-weight: 800; color: #1A1A1A; text-align: center;">${rank}</div>
          
          <div style="font-weight: 700; color: #1A1A1A; display: flex; align-items: center; gap: 12px; text-align: left;">
            ${typeof getAssetIcon === 'function' ? getAssetIcon(className) : ''}
            <span>${className}</span>
          </div>
          
          <div class="alloc-bar-container">
            <div class="alloc-track">
              <div class="alloc-fill" style="width: ${allocPercent}%; background: ${rank === 1 ? '#C8F33D' : '#1A1A1A'};"></div>
            </div>
            <span style="font-weight: 700; font-size: 0.9rem; min-width: 55px; text-align: right; color: #16A34A;">${allocPercent}%</span>
          </div>
        </div>
      `;
    });

  } else {
    // --- FIRM MODE 2: DETAILED ASSET VIEW ---
    headerContainer.innerHTML = `
      <div class="table-header detailed-table-grid" style="margin-bottom: 1rem; padding: 0 1.5rem;">
        <div style="text-align: center;">Rank</div>
        <div style="text-align: left;">Asset Name</div>
        <div style="text-align: left;">Asset Class</div>
        <div style="text-align: left;">Allocation</div>
      </div>
    `;

    const sortedAssets = Object.values(assetMap).sort((a, b) => b.value - a.value);

    sortedAssets.forEach((asset, i) => {
      const rank = i + 1;
      const allocPercent = computedTotalAUM > 0 ? ((asset.value / computedTotalAUM) * 100).toFixed(2) : '0.00';
      const highlight = rank <= 3 ? 'background-color: rgba(200, 243, 61, 0.15);' : 'background-color: #F8F9FB;';
      const uniqueId = `asset-row-${i}`;

      chartLabels.push(asset.name);
      chartValues.push(asset.value);

      let subCategoryHTML = '';
      for (const [subCat, subVal] of Object.entries(asset.subCategories)) {
        const subPercent = asset.value > 0 ? ((subVal / asset.value) * 100).toFixed(2) : '0.00';
        subCategoryHTML += `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0; border-bottom: 1px solid #E5E5E5;">
            <span style="font-weight: 500;">Sub-Category: <strong style="color: #1A1A1A;">${subCat}</strong></span>
            <span style="color: #16A34A; font-weight: 700;">${subPercent}%</span>
          </div>
        `;
      }

      html += `
        <div class="asset-row-wrapper" id="${uniqueId}">
          <div class="table-row detailed-table-grid" style="${highlight} padding: 1rem 1.5rem; border-radius: 16px; cursor: pointer;" onclick="toggleAssetDropdown('${uniqueId}')">
            <div style="font-weight: 800; color: #1A1A1A; text-align: center;">${rank}</div>
            
            <div style="font-weight: 700; color: #1A1A1A; display: flex; align-items: center; gap: 12px; text-align: left;">
              ${typeof getAssetIcon === 'function' ? getAssetIcon(asset.name) : ''}
              <span>${asset.name}</span>
              <span class="dropdown-arrow">▼</span>
            </div>

            <div style="color: #666; font-size: 0.9rem; font-weight: 600; text-align: left;">${asset.assetClass}</div>
            
            <div class="alloc-bar-container">
              <div class="alloc-track">
                <div class="alloc-fill" style="width: ${allocPercent}%; background: ${rank === 1 ? '#C8F33D' : '#1A1A1A'};"></div>
              </div>
              <span style="font-weight: 700; font-size: 0.9rem; min-width: 55px; text-align: right; color: #16A34A;">${allocPercent}%</span>
            </div>
          </div>

          <div class="sub-category-dropdown">
            ${subCategoryHTML}
          </div>
        </div>
      `;
    });
  }

  container.innerHTML = html;
  drawFirmMacroChart(chartLabels, chartValues);
}

function toggleAssetDropdown(rowId) {
  const rowWrapper = document.getElementById(rowId);
  if (rowWrapper) {
    rowWrapper.classList.toggle('expanded');
  }
}

function drawFirmMacroChart(labels, data) {
  const canvas = document.getElementById('firm-allocation-chart');
  if (!canvas) return;

  const existingChart = Chart.getChart(canvas);
  if (existingChart) existingChart.destroy();

  const firmColors = ['#C8F33D', '#1A1A1A', '#404040', '#737373', '#A3A3A3', '#E5E5E5'];

  firmAllocationChartInstance = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: firmColors,
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { padding: 15, font: { family: '-apple-system', size: 11, weight: '600' } }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const dataset = context.dataset.data;
              const total = dataset.reduce((acc, val) => acc + val, 0);
              const currentValue = context.raw;
              const percentage = total > 0 ? ((currentValue / total) * 100).toFixed(2) : 0;
              return ` ${percentage}%`;
            }
          }
        }
      },
      cutout: '75%'
    }
  });
}

function drawLineChart(canvasId, historyData, labelStr) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const existingChart = Chart.getChart(canvas);
  if (existingChart) existingChart.destroy();

  const labels = historyData.map(row => row[0]); 
  const navData = historyData.map(row => parseCleanNumber(row[4])); 

  const isDowntrend = navData.length > 1 && navData[navData.length - 1] < navData[0];
  const lineColor = isDowntrend ? '#DC2626' : '#C8F33D'; 
  const bgColor = isDowntrend ? 'rgba(220, 38, 38, 0.1)' : 'rgba(200, 243, 61, 0.1)';

  const dotSize = navData.length === 1 ? 5 : 0;

  new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: labelStr,
        data: navData,
        borderColor: lineColor,
        backgroundColor: bgColor,
        borderWidth: 3,
        fill: true,
        pointRadius: dotSize, 
        tension: 0.2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { display: false },
        y: { display: false }
      }
    }
  });
}

function drawClientAllocationChart(labels, data) {
  const canvas = document.getElementById('client-allocation-chart');
  if (!canvas) return;

  const existingChart = Chart.getChart(canvas);
  if (existingChart) existingChart.destroy();

  clientAllocationChartInstance = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: ['#C8F33D', '#1A1A1A', '#666666', '#E5E5E5'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { padding: 20, font: { family: '-apple-system', size: 12 } }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return typeof formatCurrency === 'function' ? ` ${formatCurrency(context.raw)}` : ` ${context.raw}`;
            }
          }
        }
      },
      cutout: '75%'
    }
  });
}

function drawSparkline(canvasId, navData, isDowntrend) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const existingChart = Chart.getChart(canvas);
  if (existingChart) existingChart.destroy();

  const lineColor = isDowntrend ? '#DC2626' : '#16A34A'; 
  const dotSize = navData.length === 1 ? 3 : 0;

  new Chart(canvas, {
    type: 'line',
    data: {
      labels: navData.map((_, i) => i), 
      datasets: [{
        data: navData,
        borderColor: lineColor,
        borderWidth: 2, 
        fill: false,    
        pointRadius: dotSize,
        tension: 0.2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false, 
      plugins: { 
        legend: { display: false },
        tooltip: { enabled: false } 
      },
      scales: {
        x: { display: false },
        y: { display: false }
      },
      layout: { padding: 0 } 
    }
  });
}
// ==========================================
// 10. CLIENT DASHBOARD RENDERING
// ==========================================
function renderClientHoldingsHierarchy() {
  const container = document.getElementById('client-assets-container');
  const headerContainer = document.getElementById('client-table-header-container');
  if (!container || !headerContainer) return;

  const macroMap = {};
  const assetMap = {};

  globalClientHoldingsData.forEach((row) => {
    const assetName = row[2];  
    const macroClass = row[3]; 
    const subCategory = row[4];
    const value = parseFloat(row[9]) || 0; 

    if (assetName && value > 0) {
      if (!macroMap[macroClass]) macroMap[macroClass] = 0;
      macroMap[macroClass] += value;

      if (!assetMap[assetName]) {
        assetMap[assetName] = { name: assetName, assetClass: macroClass, value: 0, subCategories: {} };
      }
      assetMap[assetName].value += value;
      
      if (!assetMap[assetName].subCategories[subCategory]) {
        assetMap[assetName].subCategories[subCategory] = 0;
      }
      assetMap[assetName].subCategories[subCategory] += value;
    }
  });

  let html = '';
  let chartLabels = [];
  let chartValues = [];

  if (!isClientDetailedView) {
    // --- CLIENT MODE 1: ASSET CLASS (MACRO) VIEW ---
    headerContainer.innerHTML = `
      <div class="table-header client-macro-table-grid" style="margin-bottom: 1rem; padding: 0 1.5rem;">
        <div style="text-align: center;">Rank</div>
        <div style="text-align: left;">Asset Class</div>
        <div style="text-align: left;">Current Value</div>
        <div style="text-align: left;">Allocation</div>
      </div>
    `;

    const sortedClasses = Object.entries(macroMap).sort((a, b) => b[1] - a[1]);

    sortedClasses.forEach(([className, val], i) => {
      const rank = i + 1;
      const allocPercent = globalClientTotalAUM > 0 ? ((val / globalClientTotalAUM) * 100).toFixed(2) : '0.00';
      const highlight = rank <= 3 ? 'background-color: rgba(200, 243, 61, 0.15);' : 'background-color: #F8F9FB;';

      chartLabels.push(className);
      chartValues.push(val);

      html += `
        <div class="table-row client-macro-table-grid" style="${highlight} padding: 1rem 1.5rem; margin-bottom: 0.8rem; border-radius: 16px;">
          <div style="font-weight: 800; color: #1A1A1A; text-align: center;">${rank}</div>
          
          <!-- ICON AND NAME -->
          <div style="font-weight: 700; color: #1A1A1A; display: flex; align-items: center; gap: 12px; text-align: left;">
            ${getAssetIcon(className)}
            <span>${className}</span>
          </div>

          <div style="font-weight: 700; color: #1A1A1A; text-align: left;">${formatCurrency(val)}</div>
          
          <div class="alloc-bar-container">
            <div class="alloc-track">
              <div class="alloc-fill" style="width: ${allocPercent}%; background: ${rank === 1 ? '#C8F33D' : '#1A1A1A'};"></div>
            </div>
            <span style="font-weight: 700; font-size: 0.9rem; min-width: 55px; text-align: right; color: #16A34A;">${allocPercent}%</span>
          </div>
        </div>
      `;
    });

  } else {
    // --- CLIENT MODE 2: DETAILED ASSET VIEW ---
    headerContainer.innerHTML = `
      <div class="table-header client-detailed-table-grid" style="margin-bottom: 1rem; padding: 0 1.5rem;">
        <div style="text-align: center;">Rank</div>
        <div style="text-align: left;">Asset Name</div>
        <div style="text-align: left;">Asset Class</div>
        <div style="text-align: left;">Current Value</div>
        <div style="text-align: left;">Allocation</div>
      </div>
    `;

    const sortedAssets = Object.values(assetMap).sort((a, b) => b.value - a.value);

    sortedAssets.forEach((asset, i) => {
      const rank = i + 1;
      const allocPercent = globalClientTotalAUM > 0 ? ((asset.value / globalClientTotalAUM) * 100).toFixed(2) : '0.00';
      const highlight = rank <= 3 ? 'background-color: rgba(200, 243, 61, 0.15);' : 'background-color: #F8F9FB;';
      const uniqueId = `client-asset-row-${i}`;

      chartLabels.push(asset.name);
      chartValues.push(asset.value);

      let subCategoryHTML = '';
      for (const [subCat, subVal] of Object.entries(asset.subCategories)) {
        const subPercent = asset.value > 0 ? ((subVal / asset.value) * 100).toFixed(2) : '0.00';
        subCategoryHTML += `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0; border-bottom: 1px solid #E5E5E5;">
            <span style="font-weight: 500;">Sub-Category: <strong style="color: #1A1A1A;">${subCat}</strong> (${formatCurrency(subVal)})</span>
            <span style="color: #16A34A; font-weight: 700;">${subPercent}%</span>
          </div>
        `;
      }

      html += `
        <div class="asset-row-wrapper" id="${uniqueId}">
          <div class="table-row client-detailed-table-grid" style="${highlight} padding: 1rem 1.5rem; border-radius: 16px; cursor: pointer;" onclick="toggleAssetDropdown('${uniqueId}')">
            <div style="font-weight: 800; color: #1A1A1A; text-align: center;">${rank}</div>
            
            <!-- ICON AND NAME -->
            <div style="font-weight: 700; color: #1A1A1A; display: flex; align-items: center; gap: 12px; text-align: left;">
              ${getAssetIcon(asset.name)}
              <span>${asset.name}</span>
              <span class="dropdown-arrow">▼</span>
            </div>

            <div style="color: #666; font-size: 0.9rem; font-weight: 600; text-align: left;">${asset.assetClass}</div>

            <div style="font-weight: 700; color: #1A1A1A; text-align: left;">${formatCurrency(asset.value)}</div>
            
            <div class="alloc-bar-container">
              <div class="alloc-track">
                <div class="alloc-fill" style="width: ${allocPercent}%; background: ${rank === 1 ? '#C8F33D' : '#1A1A1A'};"></div>
              </div>
              <span style="font-weight: 700; font-size: 0.9rem; min-width: 55px; text-align: right; color: #16A34A;">${allocPercent}%</span>
            </div>
          </div>

          <div class="sub-category-dropdown">
            ${subCategoryHTML}
          </div>
        </div>
      `;
    });
  }

  container.innerHTML = html;
  drawClientAllocationChart(chartLabels, chartValues);
}