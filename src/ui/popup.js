/**
 * Popup Script - Settings Management
 */

// Default settings
const defaultSettings = {
  autoDetectGame: true,
  showOpponentAnalysis: true,
  trainingMode: false,
  enabledGames: ['sushigo', 'tickettoride', 'wingspan']
};

// Load settings on popup open
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Loading settings...');
  
  try {
    // Get settings from background
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    
    if (response.success) {
      loadSettings(response.settings);
    } else {
      loadSettings(defaultSettings);
    }
  } catch (error) {
    console.error('Error loading settings:', error);
    loadSettings(defaultSettings);
  }
  
  // Setup event listeners
  setupEventListeners();
});

/**
 * Load settings into UI
 */
function loadSettings(settings) {
  // General settings
  document.getElementById('autoDetectGame').checked = settings.autoDetectGame ?? true;
  document.getElementById('showOpponentAnalysis').checked = settings.showOpponentAnalysis ?? true;
  document.getElementById('trainingMode').checked = settings.trainingMode ?? false;
  
  // Enabled games
  const enabledGames = settings.enabledGames || defaultSettings.enabledGames;
  enabledGames.forEach(gameId => {
    const checkbox = document.getElementById(`game-${gameId}`);
    if (checkbox) {
      checkbox.checked = true;
    }
  });
  
  console.log('Settings loaded:', settings);
}

/**
 * Get current settings from UI
 */
function getCurrentSettings() {
  // Get all enabled games
  const enabledGames = [];
  document.querySelectorAll('.game-item input[type="checkbox"]:checked').forEach(checkbox => {
    if (!checkbox.disabled) {
      enabledGames.push(checkbox.value);
    }
  });
  
  return {
    autoDetectGame: document.getElementById('autoDetectGame').checked,
    showOpponentAnalysis: document.getElementById('showOpponentAnalysis').checked,
    trainingMode: document.getElementById('trainingMode').checked,
    enabledGames
  };
}

/**
 * Save settings
 */
async function saveSettings() {
  const settings = getCurrentSettings();
  
  console.log('Saving settings:', settings);
  
  try {
    // Send to background script
    const response = await chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      data: settings
    });
    
    if (response.success) {
      showStatus('Inställningar sparade!', 'success');
    } else {
      showStatus('Kunde inte spara inställningar', 'error');
    }
  } catch (error) {
    console.error('Error saving settings:', error);
    showStatus('Fel vid sparning', 'error');
  }
}

/**
 * Reset settings to defaults
 */
function resetSettings() {
  if (confirm('Återställa till standardinställningar?')) {
    loadSettings(defaultSettings);
    showStatus('Inställningar återställda', 'success');
  }
}

/**
 * Show status message
 */
function showStatus(message, type = 'success') {
  const statusEl = document.getElementById('statusMessage');
  statusEl.textContent = message;
  statusEl.className = `status-message ${type}`;
  
  // Hide after 3 seconds
  setTimeout(() => {
    statusEl.className = 'status-message';
  }, 3000);
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Save button
  document.getElementById('saveBtn').addEventListener('click', saveSettings);
  
  // Reset button
  document.getElementById('resetBtn').addEventListener('click', resetSettings);
  
  // Training mode warning
  document.getElementById('trainingMode').addEventListener('change', (e) => {
    if (e.target.checked) {
      alert('Training Mode aktiverat!\n\nWebSocket-trafik kommer att loggas för att skapa nya spel-templates.\n\nNotera: Detta kan påverka prestanda.');
    }
  });
}

console.log('Popup script loaded');
