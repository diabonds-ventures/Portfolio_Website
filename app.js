// ==========================================
// 1. THE CENTRAL DATABASE
// ==========================================
const clientDatabase = {
  'Diabonds_Ventures':  { pin: '0000', name: 'Diabonds Ventures' },
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
// 3. HELPER UTILITIES
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
    // CACHE BUSTER: Attaches the current exact time to the URL so the browser NEVER uses old data
    const timestamp = new Date().getTime();
    const response = await fetch(`${url}&_cb=${timestamp}`, { cache: 'no-store' });
    
    const data = await response.text();
    return data.split('\n').map(row => row.split(','));
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
    if(welcomeMessage) welcomeMessage.innerText = "Client Login";
    if(usernameInput) {
      usernameInput.style.display = 'block'; 
      usernameInput.required = true;         
    }
  }

  if(loginForm) {
    loginForm.addEventListener('submit', function(event) {
      event.preventDefault(); 
      
      const attemptId = urlClientId || (usernameInput ? usernameInput.value.trim().toLowerCase() : '');
      const enteredPin = document.getElementById('pin-input').value;

      if (clientDatabase[attemptId] && clientDatabase[attemptId].pin === enteredPin) {
        sessionStorage.setItem('loggedInClientId', attemptId);
        sessionStorage.setItem('loggedInClientName', clientDatabase[attemptId].name);
        window.location.href = 'clientDaashboard.html'; 
      } else {
        if(errorMessage) errorMessage.innerText = 'Incorrect Client ID or PIN.';
        document.getElementById('pin-input').value = ''; 
      }
    });
  }
}

// ==========================================
// 6. PORTFOLIOS ROSTER PAGE (UPGRADED)
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
  const clientsToChart = []; // Stores data to draw charts AFTER the HTML is built
  
  for (let i = 1; i < summaryData.length; i++) {
    const clientId = summaryData[i][0];
    if (!clientId) continue;

    const clientName = clientDatabase[clientId] ? clientDatabase[clientId].name : clientId;
    const clientHistory = historyData.filter(row => row[1] === clientId);
    
    let nav1D = 0, nav1W = 0, nav1M = 0, navMax = 0;
    let isDowntrend = false;
    let navData = []; // Array to hold the history points for the sparkline

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
      navData = clientHistory.map(row => parseFloat(row[4])); // Extract just the NAV values
    }

    const getColorClass = (val) => val >= 0 ? 'text-green' : 'text-red';
    const canvasId = `spark-${clientId}`; // Unique ID for every client's mini chart

    // Dropped the MODE column, replaced TREND emoji with a Canvas container
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

    // Save the info needed to draw the chart in the next step
    clientsToChart.push({ canvasId, navData, isDowntrend });
  }

  // 1. Inject the HTML into the page
  container.innerHTML = html;
  
  // 2. Loop through the array and draw all the sparklines
  clientsToChart.forEach(client => {
    if (client.navData.length > 0) {
      drawSparkline(client.canvasId, client.navData, client.isDowntrend);
    }
  });

  hideLoader();
}

// ==========================================
// 7. FIRM DASHBOARD LOGIC
// ==========================================
async function setupFirmDashboard() {
  const summaryData = await fetchCSV(CSV_URLS.liveSummary);
  const historyData = await fetchCSV(CSV_URLS.historicalNav);

  if (!summaryData || !historyData) {
    hideLoader();
    return;
  }

  let totalAUM = 0;
  for (let i = 1; i < summaryData.length; i++) {
    const row = summaryData[i];
    if (row[0]) { 
      totalAUM += parseFloat(row[2]) || 0; 
    }
  }

  const aumElement = document.getElementById('firm-total-aum');
  if (aumElement) aumElement.innerText = formatCurrency(totalAUM);

  const firmHistory = historyData.filter(row => row[1] === 'Diabonds_Ventures');

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
  
  hideLoader(); // Success: Hide Loader
}

// ==========================================
// 8. CLIENT DASHBOARD LOGIC
// ==========================================
async function setupClientDashboard() {
  // SECURITY UPDATE: Strictly require a verified session PIN entry
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
      // Using .replace() instead of .href deletes the current page from the browser's Back Button history
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

  const clientSummary = summaryData.find(row => row[0] === clientId);
  
  if (clientSummary) {
    const grossValue = parseFloat(clientSummary[2]) || 0;
    const netValue = parseFloat(clientSummary[3]) || 0;
    
    const grossEl = document.getElementById('client-gross-value');
    const netEl = document.getElementById('client-net-value');
    
    if(grossEl) grossEl.innerText = formatCurrency(grossValue);
    if(netEl) netEl.innerText = formatCurrency(netValue);
  }

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

  const clientHoldings = holdingsData.filter(row => row[0] === clientId);
  drawClientAllocationChart(clientHoldings);
  
  hideLoader(); // Success: Hide Loader
}

// ==========================================
// 9. CHARTING FUNCTIONS
// ==========================================
function drawLineChart(canvasId, historyData, labelStr) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const labels = historyData.map(row => row[0]); 
  const navData = historyData.map(row => parseFloat(row[4])); 

  // Check trend to assign Red or Green colors
  const isDowntrend = navData.length > 1 && navData[navData.length - 1] < navData[0];
  const lineColor = isDowntrend ? '#DC2626' : '#C8F33D'; 
  const bgColor = isDowntrend ? 'rgba(220, 38, 38, 0.1)' : 'rgba(200, 243, 61, 0.1)';

  // Fix invisible chart bug on Day 1
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

function drawClientAllocationChart(clientHoldings) {
  const canvas = document.getElementById('client-allocation-chart');
  if (!canvas) return;

  const allocationMap = {};
  
  clientHoldings.forEach((row, index) => {
    if (index === 0 && row[2] === 'Class') return; 
    
    const assetClass = row[2];
    const value = parseFloat(row[9]) || 0;
    
    if (assetClass && value > 0) {
      if (allocationMap[assetClass]) {
        allocationMap[assetClass] += value;
      } else {
        allocationMap[assetClass] = value;
      }
    }
  });

  const labels = Object.keys(allocationMap);
  const data = Object.values(allocationMap);

  new Chart(canvas, {
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
        }
      },
      cutout: '75%'
    }
  });
}
function drawSparkline(canvasId, navData, isDowntrend) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  // Use a darker green (#16A34A) for uptrends so it is highly visible on the white table rows
  const lineColor = isDowntrend ? '#DC2626' : '#16A34A'; 
  
  // Fix invisible chart bug on Day 1
  const dotSize = navData.length === 1 ? 3 : 0;

  new Chart(canvas, {
    type: 'line',
    data: {
      labels: navData.map((_, i) => i), // Dummy labels just to make the chart work
      datasets: [{
        data: navData,
        borderColor: lineColor,
        borderWidth: 2, // Slightly thinner than the main charts
        fill: false,    // No shading underneath for a clean sparkline look
        pointRadius: dotSize,
        tension: 0.2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false, // Turn off animation so the list loads instantly
      plugins: { 
        legend: { display: false },
        tooltip: { enabled: false } // No hover popups on sparklines
      },
      scales: {
        x: { display: false },
        y: { display: false }
      },
      layout: { padding: 0 } // Removes all margins
    }
  });
}