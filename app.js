// ==========================================
// 1. THE CENTRAL DATABASE
// ==========================================
const clientDatabase = {
  'Diabonds_Ventures':  { pin: '0000', name: 'Diabonds Ventures' },
  'ashwin': { pin: '5678', name: 'Ashwin' },
  'rahul': { pin: '9999', name: 'Rahul' }
};

/// ==========================================
// 2. THE PAGE ROUTER
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  // Convert the URL path to lowercase so capital letters don't break the app
  const currentPath = window.location.pathname.toLowerCase();

  if (currentPath.includes('login')) {
    setupLoginPage();
  } else if (currentPath.includes('clientdaashboard')) { 
    setupClientDashboard();
  } else if (currentPath.includes('firm') || currentPath === '/' || currentPath === '') {
    setupFirmDashboard();
  }
});
// ==========================================
// 3. LOGIN PAGE LOGIC
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
      
      const attemptId = urlClientId || (usernameInput ? usernameInput.value.trim() : '');
      const enteredPin = document.getElementById('pin-input').value;

      if (clientDatabase[attemptId] && clientDatabase[attemptId].pin === enteredPin) {
        // SUCCESS: Save the exact keys the Dashboard is looking for
        sessionStorage.setItem('loggedInClientId', attemptId);
        sessionStorage.setItem('loggedInClientName', clientDatabase[attemptId].name);
        
        // Send them to the exactly spelled dashboard file
        window.location.href = 'clientDaashboard.html'; // <-- Updated spelling
      } else {
        // FAIL
        if(errorMessage) errorMessage.innerText = 'Incorrect Client ID or PIN.';
        document.getElementById('pin-input').value = ''; 
      }
    });
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
    const response = await fetch(url);
    const data = await response.text();
    return data.split('\n').map(row => row.split(','));
  } catch (error) {
    console.error("Error fetching data:", error);
    return null;
  }
}

// ==========================================
// 5. HELPER UTILITIES
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

// ==========================================
// 6. FIRM DASHBOARD LOGIC
// ==========================================
async function setupFirmDashboard() {
  const summaryData = await fetchCSV(CSV_URLS.liveSummary);
  const historyData = await fetchCSV(CSV_URLS.historicalNav);

  if (!summaryData || !historyData) return;

  let totalAUM = 0;
  for (let i = 1; i < summaryData.length; i++) {
    const row = summaryData[i];
    if (row[0]) { 
      totalAUM += parseFloat(row[2]) || 0; // Column C: Current Value
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
}

// ==========================================
// 7. CLIENT DASHBOARD LOGIC
// ==========================================
async function setupClientDashboard() {
  const clientId = sessionStorage.getItem('loggedInClientId');
  const clientName = sessionStorage.getItem('loggedInClientName');
  
  if (!clientId) {
    window.location.href = 'login.html'; 
    return;
  }

  const greetingEl = document.getElementById('client-greeting');
  if(greetingEl) greetingEl.innerText = `Welcome, ${clientName}`;
  
  const logoutBtn = document.getElementById('logout-btn');
  if(logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      sessionStorage.clear();
      window.location.href = 'login.html';
    });
  }

  const summaryData = await fetchCSV(CSV_URLS.liveSummary);
  const historyData = await fetchCSV(CSV_URLS.historicalNav);
  const holdingsData = await fetchCSV(CSV_URLS.masterHoldings);

  if (!summaryData || !historyData || !holdingsData) return;

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
}

// ==========================================
// 8. CHARTING FUNCTIONS
// ==========================================
function drawLineChart(canvasId, historyData, labelStr) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const labels = historyData.map(row => row[0]); 
  const navData = historyData.map(row => parseFloat(row[4])); 

  new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: labelStr,
        data: navData,
        borderColor: '#C8F33D',
        backgroundColor: 'rgba(200, 243, 61, 0.1)',
        borderWidth: 3,
        fill: true,
        pointRadius: 0,
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
  
  // Skip the header row if it exists
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