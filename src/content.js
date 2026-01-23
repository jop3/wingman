/**
 * Wingman Content Script - Main Integration
 * Runs on BGA pages and connects all components
 */

console.log('🎮 Wingman: Content script loading...');

// Global state
let wsInterceptor = null;
let gameDetector = null;
let ruleEngine = null;
let opponentAnalyzer = null;
let gameParser = null;
let sidebar = null;
let currentGame = null;
let settings = {
  autoDetectGame: true,
  showOpponentAnalysis: true,
  trainingMode: false,
  enabledGames: ['sushigo', 'tickettoride', 'wingspan']
};

// Training data buffer
let trainingDataBuffer = [];
const MAX_TRAINING_BUFFER = 100;

/**
 * Initialize extension
 */
async function initialize() {
  console.log('Wingman: Initializing...');

  // Get settings from background
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    if (response && response.success) {
      settings = { ...settings, ...response.settings };
      console.log('Wingman: Settings loaded', settings);
    }
  } catch (e) {
    console.log('Wingman: Using default settings');
  }

  // Initialize game detector
  gameDetector = new GameDetector();

  // Try to detect game from URL first
  const urlDetection = gameDetector.detectFromURL(window.location.href);
  if (urlDetection) {
    console.log('Wingman: Game detected from URL:', urlDetection);
    await initializeGame(urlDetection);
  }

  // Initialize WebSocket interceptor
  wsInterceptor = new WebSocketInterceptor(handleWebSocketMessage);
  wsInterceptor.setTrainingMode(settings.trainingMode);

  // Wait for page to be fully loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onPageReady);
  } else {
    onPageReady();
  }

  console.log('✅ Wingman: Initialized');
}

/**
 * Handle page ready
 */
function onPageReady() {
  console.log('Wingman: Page ready, injecting UI...');

  // Inject sidebar
  injectSidebar();

  // Listen for keyboard shortcuts
  document.addEventListener('keydown', handleKeyboardShortcut);

  // Show initial status
  setTimeout(() => {
    if (sidebar) {
      if (currentGame) {
        sidebar.updateStatus({
          status: 'ready',
          message: `${gameDetector.getDisplayName(currentGame.gameId)} detected`
        });
      } else {
        sidebar.updateStatus({
          status: 'waiting',
          message: 'Waiting for game to start...'
        });
      }
    }
  }, 1000);
}

/**
 * Handle WebSocket messages - AUTOMATIC CAPTURE
 */
function handleWebSocketMessage(data) {
  // Always log for training (when enabled)
  if (settings.trainingMode) {
    logTrainingData(data);
  }

  // Try to detect game if not yet detected
  if (!currentGame && settings.autoDetectGame) {
    const detection = gameDetector.detectFromMessage(data);
    if (detection && detection.confidence > 0.7) {
      console.log('Wingman: Game detected from WebSocket:', detection);
      initializeGame(detection);
    }
  }

  // Parse game-specific data
  if (currentGame && gameParser) {
    try {
      const gameState = gameParser.parse(data);
      if (gameState) {
        processGameState(gameState, data);
      }
    } catch (e) {
      console.error('Wingman: Parse error:', e);
    }
  }
}

/**
 * Log training data for later analysis
 */
function logTrainingData(data) {
  const entry = {
    timestamp: Date.now(),
    game: currentGame?.gameId || 'unknown',
    url: window.location.href,
    data: data
  };

  trainingDataBuffer.push(entry);

  // Keep buffer size manageable
  if (trainingDataBuffer.length > MAX_TRAINING_BUFFER) {
    trainingDataBuffer.shift();
  }

  // Send to background for storage
  chrome.runtime.sendMessage({
    type: 'TRAINING_DATA',
    entry: entry
  }).catch(() => { });

  // Also log to console for easy access in DevTools
  console.log('📊 Training:', data);
}

/**
 * Initialize game systems
 */
async function initializeGame(gameInfo) {
  currentGame = gameInfo;

  // Notify background
  chrome.runtime.sendMessage({
    type: 'GAME_DETECTED',
    data: gameInfo
  }).catch(() => { });

  // Check if game is supported
  if (!gameDetector.isSupported(gameInfo.gameId)) {
    console.warn('Wingman: Game not yet fully supported:', gameInfo.gameId);
    updateSidebar({
      status: 'unsupported',
      message: `${gameDetector.getDisplayName(gameInfo.gameId)} - Training Mode Active`
    });
    // Still initialize parser for training data capture
    initializeParser(gameInfo.gameId);
    return;
  }

  // Initialize parser
  initializeParser(gameInfo.gameId);

  // Load game templates
  try {
    const [rulesData, opponentData] = await Promise.all([
      loadGameRules(gameInfo.gameId),
      loadOpponentPatterns(gameInfo.gameId)
    ]);

    // Initialize engines
    if (rulesData) {
      ruleEngine = new RuleEngine(rulesData);
      console.log('Wingman: RuleEngine initialized');
    }

    if (opponentData) {
      opponentAnalyzer = new OpponentAnalyzer(opponentData);
      console.log('Wingman: OpponentAnalyzer initialized');
    }

    console.log('✅ Wingman: Game engines initialized:', gameInfo.gameId);

    // Update UI
    updateSidebar({
      status: 'ready',
      game: gameDetector.getDisplayName(gameInfo.gameId),
      variant: gameInfo.variant
    });

  } catch (error) {
    console.error('Wingman: Error loading game templates:', error);
    updateSidebar({
      status: 'partial',
      message: `${gameDetector.getDisplayName(gameInfo.gameId)} - Some features limited`
    });
  }
}

/**
 * Initialize game-specific parser
 */
function initializeParser(gameId) {
  switch (gameId) {
    case 'wingspan':
      if (typeof WingspanParser !== 'undefined') {
        gameParser = new WingspanParser();
        console.log('Wingman: WingspanParser initialized');
      }
      break;
    case 'sushigo':
      if (typeof SushiGoParser !== 'undefined') {
        gameParser = new SushiGoParser();
        console.log('Wingman: SushiGoParser initialized');
      }
      break;
    case 'tickettoride':
      if (typeof TicketToRideParser !== 'undefined') {
        gameParser = new TicketToRideParser();
        console.log('Wingman: TicketToRideParser initialized');
      }
      break;
    default:
      console.log('Wingman: No parser for', gameId);
  }
}

/**
 * Load game rules JSON
 */
async function loadGameRules(gameId) {
  try {
    const url = chrome.runtime.getURL(`games/${gameId}-rules.json`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } catch (e) {
    console.warn('Wingman: Could not load rules for', gameId, e);
    return null;
  }
}

/**
 * Load opponent patterns JSON
 */
async function loadOpponentPatterns(gameId) {
  try {
    const url = chrome.runtime.getURL(`opponents/opponent-patterns-${gameId}.json`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } catch (e) {
    console.warn('Wingman: Could not load opponent patterns for', gameId, e);
    return null;
  }
}

/**
 * Process parsed game state
 */
function processGameState(gameState, rawData) {
  // Update trackers in rule engine
  if (ruleEngine && gameState) {
    for (const [key, value] of Object.entries(gameState)) {
      if (key !== 'opponents' && key !== 'yourTurn') {
        ruleEngine.updateTracker(key, value);
      }
    }
  }

  // Track opponent actions
  if (opponentAnalyzer && settings.showOpponentAnalysis) {
    if (rawData.player && rawData.action) {
      opponentAnalyzer.trackAction(rawData.player, {
        action: rawData.action,
        ...gameState
      });
      updateOpponentProfiles();
    }

    // Also track from parsed opponent data
    if (gameState.opponents) {
      for (const opp of gameState.opponents) {
        if (opp.lastAction) {
          opponentAnalyzer.trackAction(opp.id || opp.name, opp.lastAction);
        }
      }
      updateOpponentProfiles();
    }
  }

  // Generate recommendations when it's your turn
  if (gameState.yourTurn) {
    generateRecommendations(gameState);
  }

  // Update game info in sidebar
  if (sidebar) {
    updateGameInfo(gameState);
  }
}

/**
 * Update game info display
 */
function updateGameInfo(gameState) {
  if (!sidebar) return;

  const gameNameEl = sidebar.container.querySelector('.game-name');
  const variantEl = sidebar.container.querySelector('.variant-name');

  if (gameNameEl && currentGame) {
    gameNameEl.textContent = gameDetector.getDisplayName(currentGame.gameId);
  }
  if (variantEl && currentGame) {
    variantEl.textContent = currentGame.variant || 'Standard';
  }
}

/**
 * Generate recommendations
 */
function generateRecommendations(gameState) {
  const recommendations = [];

  // Get rule-based recommendations
  if (ruleEngine) {
    try {
      const ruleRecs = ruleEngine.getRecommendations(gameState);
      recommendations.push(...ruleRecs.map(r => ({
        ...r,
        source: 'rules',
        message: r.message || r.action?.message
      })));
    } catch (e) {
      console.error('Wingman: Rule engine error:', e);
    }
  }

  // Get opponent-based recommendations
  if (opponentAnalyzer && settings.showOpponentAnalysis) {
    try {
      const opponentRecs = opponentAnalyzer.getOpponentBasedRecommendations(gameState);
      recommendations.push(...opponentRecs.map(r => ({
        ...r,
        source: 'opponents',
        message: r.message || r.action?.message
      })));
    } catch (e) {
      console.error('Wingman: Opponent analyzer error:', e);
    }
  }

  // Sort by priority
  recommendations.sort((a, b) => (b.priority || 0) - (a.priority || 0));

  // Update sidebar
  if (sidebar && recommendations.length > 0) {
    sidebar.updateRecommendations(recommendations);
  }
}

/**
 * Update opponent profiles in sidebar
 */
function updateOpponentProfiles() {
  if (!opponentAnalyzer || !sidebar) return;

  const profiles = opponentAnalyzer.getAllProfiles();
  sidebar.updateOpponents(profiles);

  // Update stats
  const totalOppsEl = sidebar.container.querySelector('#total-opponents');
  if (totalOppsEl) {
    totalOppsEl.textContent = profiles.length;
  }
}

/**
 * Inject sidebar UI
 */
function injectSidebar() {
  // Create sidebar container
  const sidebarContainer = document.createElement('div');
  sidebarContainer.id = 'wingman-sidebar';
  sidebarContainer.className = 'bga-assistant-sidebar collapsed';

  // Load sidebar HTML
  const sidebarUrl = chrome.runtime.getURL('ui/sidebar.html');
  fetch(sidebarUrl)
    .then(response => response.text())
    .then(html => {
      sidebarContainer.innerHTML = html;
      document.body.appendChild(sidebarContainer);

      // Initialize sidebar controller
      initializeSidebarController(sidebarContainer);

      console.log('Wingman: Sidebar injected');
    })
    .catch(error => {
      console.error('Wingman: Error loading sidebar:', error);
    });
}

/**
 * Initialize sidebar controller
 */
function initializeSidebarController(container) {
  sidebar = {
    container,
    collapsed: true,

    toggle() {
      this.collapsed = !this.collapsed;
      this.container.classList.toggle('collapsed', this.collapsed);
    },

    updateStatus(status) {
      const statusEl = this.container.querySelector('.status');
      if (statusEl) {
        statusEl.textContent = status.message || status;
        statusEl.className = `status ${status.status || 'ready'}`;
      }
    },

    updateRecommendations(recommendations) {
      const recsEl = this.container.querySelector('.recommendations');
      if (!recsEl) return;

      if (recommendations.length === 0) {
        recsEl.innerHTML = `
          <div class="empty-state">
            <p>No recommendations yet.</p>
            <p class="hint">Waiting for your turn...</p>
          </div>
        `;
        return;
      }

      recsEl.innerHTML = recommendations
        .slice(0, 10)
        .map(rec => {
          const priority = rec.priority || 50;
          const priorityClass = priority >= 90 ? 'priority-critical' :
            priority >= 75 ? 'priority-high' :
              priority >= 60 ? 'priority-medium' : 'priority-low';

          return `
            <div class="recommendation ${priorityClass}">
              <span class="alert-level ${rec.action?.alertLevel || 'info'}">
                ${this.getAlertIcon(rec.action?.alertLevel || (priority >= 90 ? 'critical' : priority >= 75 ? 'high' : 'medium'))}
              </span>
              <div class="rec-content">
                <p class="rec-message">${rec.message || 'No message'}</p>
                ${rec.action?.reasoning ? `<p class="rec-reason">${rec.action.reasoning}</p>` : ''}
                <span class="rec-source">${rec.source || 'system'}</span>
              </div>
            </div>
          `;
        }).join('');

      // Update stats
      const totalRecsEl = this.container.querySelector('#total-recs');
      if (totalRecsEl) {
        totalRecsEl.textContent = recommendations.length;
      }
    },

    updateOpponents(profiles) {
      const oppsEl = this.container.querySelector('.opponents');
      if (!oppsEl) return;

      if (profiles.length === 0) {
        oppsEl.innerHTML = `
          <div class="empty-state">
            <p>No opponents tracked yet.</p>
            <p class="hint">Analyzing player moves...</p>
          </div>
        `;
        return;
      }

      oppsEl.innerHTML = profiles.map(profile => `
        <div class="opponent threat-${profile.threatLevel || 'unknown'}">
          <div class="opp-header">
            <span class="opp-name">${profile.playerId || 'Unknown'}</span>
            <span class="threat-badge">${this.getThreatIcon(profile.threatLevel)}</span>
          </div>
          <p class="opp-strategy">${profile.classifiedStrategy || 'Analyzing...'}</p>
          <p class="opp-confidence">${Math.round((profile.confidence || 0) * 100)}% confidence</p>
        </div>
      `).join('');
    },

    getAlertIcon(level) {
      const icons = {
        'critical': '🔴',
        'high': '🟠',
        'medium': '🟡',
        'low': '⚪',
        'info': 'ℹ️'
      };
      return icons[level] || '📌';
    },

    getThreatIcon(level) {
      const icons = {
        'critical': '🔴',
        'high': '🟠',
        'medium': '🟡',
        'low': '🟢',
        'unknown': '⚫'
      };
      return icons[level] || '⚫';
    }
  };

  // Add toggle button listener
  const toggleBtn = container.querySelector('.toggle-btn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => sidebar.toggle());
  }

  // Add training mode indicator
  if (settings.trainingMode) {
    const header = container.querySelector('.sidebar-header h2');
    if (header) {
      header.innerHTML += ' <span style="color: #ff9800; font-size: 12px;">📊 TRAINING</span>';
    }
  }
}

/**
 * Update sidebar with status/message
 */
function updateSidebar(update) {
  if (sidebar) {
    sidebar.updateStatus(update);
  }
}

/**
 * Handle keyboard shortcuts
 */
function handleKeyboardShortcut(e) {
  // Alt+B = Toggle sidebar
  if (e.altKey && e.key === 'b') {
    e.preventDefault();
    if (sidebar) {
      sidebar.toggle();
    }
  }

  // Alt+T = Toggle training mode
  if (e.altKey && e.key === 't') {
    e.preventDefault();
    settings.trainingMode = !settings.trainingMode;
    if (wsInterceptor) {
      wsInterceptor.setTrainingMode(settings.trainingMode);
    }

    // Update background
    chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      data: settings
    }).catch(() => { });

    // Visual feedback
    const status = settings.trainingMode ? 'Training Mode ON 📊' : 'Training Mode OFF';
    console.log('Wingman:', status);
    if (sidebar) {
      sidebar.updateStatus({ status: 'info', message: status });
    }
  }

  // Alt+D = Download training data
  if (e.altKey && e.key === 'd') {
    e.preventDefault();
    downloadTrainingData();
  }
}

/**
 * Download captured training data
 */
function downloadTrainingData() {
  if (trainingDataBuffer.length === 0) {
    console.log('Wingman: No training data to download');
    alert('No training data captured yet. Enable Training Mode (Alt+T) and play some moves.');
    return;
  }

  const data = {
    exportedAt: new Date().toISOString(),
    game: currentGame?.gameId || 'unknown',
    url: window.location.href,
    entries: trainingDataBuffer
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `wingman-training-${currentGame?.gameId || 'unknown'}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log('Wingman: Training data downloaded', trainingDataBuffer.length, 'entries');
}

/**
 * Listen for messages from background
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Wingman: Received message:', message.type);

  switch (message.type) {
    case 'GAME_REGISTERED':
      console.log('Wingman: Game registered by background');
      sendResponse({ success: true });
      break;

    case 'SETTINGS_UPDATED':
      settings = { ...settings, ...message.data };
      if (wsInterceptor) {
        wsInterceptor.setTrainingMode(settings.trainingMode);
      }
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }
});

// Initialize when script loads
initialize().catch(console.error);

console.log('🎮 Wingman: Content script ready');
