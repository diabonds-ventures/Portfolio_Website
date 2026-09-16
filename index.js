// ==========================================
// 1. THE CENTRAL DATABASE
// ==========================================
// If you add a new friend, just add them here. 
// The rest of the app will update automatically.
const clientDatabase = {
  'rahul':  { pin: '1234', name: 'Rahul' },
  'ashwin': { pin: '5678', name: 'Ashwin' }
};


// ==========================================
// 2. THE PAGE ROUTER
// ==========================================
// This checks which HTML file the browser is currently looking at
const currentPath = window.location.pathname;

if (currentPath.includes('login.html')) {
  setupLoginPage();
}

//===============

//================
function setupLoginPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const urlClientId = urlParams.get('client'); // Might be null if clicked from navbar

  const welcomeMessage = document.getElementById('welcome-message');
  const usernameInput = document.getElementById('username-input');
  const loginForm = document.getElementById('login-form');
  const errorMessage = document.getElementById('error-message');

  // A. Check how they arrived at the login page
  if (urlClientId && clientDatabase[urlClientId]) {
    // Scenario 1: They clicked a specific name on the roster
    welcomeMessage.innerText = `Welcome, ${clientDatabase[urlClientId].name}`;
    usernameInput.style.display = 'none'; // Hide the username box
  } else {
    // Scenario 2: They clicked the generic Navbar Login button
    welcomeMessage.innerText = "Client Login";
    usernameInput.style.display = 'block'; // Show the username box
    usernameInput.required = true;         // Make it mandatory
  }

  // B. Handle the form submission
  loginForm.addEventListener('submit', function(event) {
    event.preventDefault(); 
    
    // If we have a URL ID, use it. Otherwise, read what they typed in the box.
    const attemptId = urlClientId || usernameInput.value.toLowerCase().trim();
    const enteredPin = document.getElementById('pin-input').value;

    // C. Verify against the database
    if (clientDatabase[attemptId] && clientDatabase[attemptId].pin === enteredPin) {
      
      // SUCCESS
      sessionStorage.setItem(`dia_auth_${attemptId}`, 'verified');
      window.location.href = `client-dashboard.html?client=${attemptId}`;
      
    } else {
      
      // FAIL
      errorMessage.innerText = 'Incorrect Client ID or PIN.';
      document.getElementById('pin-input').value = ''; 
    }
  });
}