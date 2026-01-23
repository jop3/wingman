// BGA AI Assistant - Background Service Worker
// Hanterar LLM-kommunikation med OpenRouter

console.log('🤖 BGA AI Assistant background worker loaded');

// === CONFIGURATION ===
const CONFIG = {
  OPENROUTER_URL: 'https://openrouter.ai/api/v1/chat/completions',
  DEFAULT_MODEL: 'meta-llama/llama-3.1-8b-instruct:free',
  MAX_TOKENS: 1000,
  TEMPERATURE: 0.7
};

// === GAME RULES DATABASE ===
const GAME_RULES = {
  sushigo: {
    name: 'Sushi Go!',
    description: 'Draft-kortspel där du väljer kort och passerar resten',
    cardTypes: {
      pudding: 'Samla flest för bonuspoäng i slutet',
      dumpling: '1st=1p, 2st=3p, 3st=6p, 4st=10p, 5st=15p',
      tempura: '2 st = 5 poäng (annars 0)',
      sashimi: '3 st = 10 poäng (annars 0)',
      maki1: '1 rulle (flest rullar = 6p, näst flest = 3p)',
      maki2: '2 rullar',
      maki3: '3 rullar',
      wasabi: 'Nästa nigiri ger 3x poäng',
      chopsticks: 'Spela 2 kort samtidigt nästa gång',
      nigiri1: '1 poäng (3 med wasabi)',
      nigiri2: '2 poäng (6 med wasabi)',
      nigiri3: '3 poäng (9 med wasabi)'
    },
    strategy: `
Nyckelstrategier:
1. PUDDING - Behåll koll på andras pudding-count. Viktigt i slutet!
2. SETS - Prioritera att slutföra tempura/sashimi/dumpling-sets
3. MAKI - Sikta på 6p (flest) eller 3p (näst flest), annars skippa
4. WASABI - Spara för nigiri3 om möjligt
5. CHOPSTICKS - Använd för att ta 2 bra kort samtidigt
6. MEMORY - Kom ihåg vilka kort som passerades (de kommer tillbaka!)
7. BLOCKING - Stjäl kort som motståndare behöver
`
  }
};

// === DEFAULT SETTINGS ===
const DEFAULT_SETTINGS = {
  autoDetectGame: true,
  showOpponentAnalysis: true,
  trainingMode: false,
  enabledGames: ['sushigo', 'tickettoride', 'wingspan']
};

// In-memory settings cache
let cachedSettings = { ...DEFAULT_SETTINGS };

// Load settings on startup
chrome.storage.sync.get(['wingman_settings'], (result) => {
  if (result.wingman_settings) {
    cachedSettings = { ...DEFAULT_SETTINGS, ...result.wingman_settings };
  }
});

// === MESSAGE HANDLER ===
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.type);

  switch (message.type) {
    case 'GET_SETTINGS':
      sendResponse({ success: true, settings: cachedSettings });
      break;

    case 'UPDATE_SETTINGS':
      cachedSettings = { ...cachedSettings, ...message.data };
      chrome.storage.sync.set({ wingman_settings: cachedSettings }, () => {
        // Notify all tabs of settings update
        chrome.tabs.query({ url: '*://*.boardgamearena.com/*' }, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
              type: 'SETTINGS_UPDATED',
              data: cachedSettings
            }).catch(() => {}); // Ignore errors for inactive tabs
          });
        });
        sendResponse({ success: true });
      });
      return true; // Async response

    case 'GAME_DETECTED':
      console.log('Game detected:', message.data);
      sendResponse({ success: true });
      break;

    case 'TRAINING_MODE_LOG':
      if (cachedSettings.trainingMode) {
        console.log('Training data:', message.data);
        storeTrainingData(message.data);
      }
      sendResponse({ success: true });
      break;

    case 'TRAINING_DATA':
      if (cachedSettings.trainingMode && message.entry) {
        console.log('📊 Training data received:', message.entry.game);
        storeTrainingData(message.entry);
      }
      sendResponse({ success: true });
      break;

    case 'GET_TRAINING_DATA':
      getTrainingData(message.gameId)
        .then(data => sendResponse({ success: true, data }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Async response

    case 'CLEAR_TRAINING_DATA':
      clearTrainingData(message.gameId)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Async response

    case 'REQUEST_ADVICE':
      handleAdviceRequest(
        message.gameState,
        message.gameTemplate,
        message.cardTracking,
        sender.tab.id
      )
        .then(advice => sendResponse({ advice }))
        .catch(error => sendResponse({ error: error.message }));
      return true; // Async response

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }
});

// === ADVICE REQUEST HANDLER ===
async function handleAdviceRequest(gameState, gameTemplate, cardTracking, tabId) {
  console.log('🎯 Processing advice request...', gameState);
  
  // Kontrollera API-nyckel
  const apiKey = await getAPIKey();
  if (!apiKey) {
    return 'Fel: Ingen API-nyckel konfigurerad. Gå till inställningar och lägg till din OpenRouter API-nyckel.';
  }
  
  // Bygg prompt (med template om tillgänglig)
  const prompt = gameTemplate 
    ? buildPromptFromTemplate(gameState, gameTemplate, cardTracking)
    : buildPrompt(gameState);
    
  console.log('📝 Prompt:', prompt);
  
  // Anropa LLM
  try {
    const advice = await callLLM(prompt, apiKey);
    console.log('✅ Advice received:', advice);
    
    // Skicka till content script
    chrome.tabs.sendMessage(tabId, {
      type: 'AI_ADVICE',
      advice: advice
    });
    
    return advice;
  } catch (error) {
    console.error('❌ LLM error:', error);
    return `Fel vid LLM-anrop: ${error.message}`;
  }
}

// === BUILD PROMPT FROM TEMPLATE ===
function buildPromptFromTemplate(gameState, template, cardTracking) {
  const prompts = template.prompts || {};
  let userPrompt = prompts.user_prompt_template || '';
  
  // Bygg card tracking summary
  let cardTrackingText = '';
  if (cardTracking && cardTracking.recommendations) {
    cardTrackingText = '\n\nKORTRÄKNING & MINNESHJÄLP:\n';
    
    // Recommendations
    if (cardTracking.recommendations.length > 0) {
      cardTrackingText += cardTracking.recommendations
        .slice(0, 5)
        .map(r => `- ${r.message}`)
        .join('\n');
    }
    
    // Critical/scarce cards
    const importantCards = [
      ...cardTracking.scarcity.critical,
      ...cardTracking.scarcity.scarce
    ].slice(0, 5);
    
    if (importantCards.length > 0) {
      cardTrackingText += '\n\nViktiga kort kvar:\n';
      cardTrackingText += importantCards
        .map(c => `- ${c.card}: ${c.remaining}/${c.total} (${c.percentage}%)`)
        .join('\n');
    }
  }
  
  // Bygg variables
  const variables = {
    game_name: template.game_name || gameState.gameName,
    round: gameState.currentRound,
    max_rounds: template.game_mechanics?.rounds || 3,
    my_score: gameState.myScore,
    my_hand: gameState.myHand?.map(c => c.type).join(', ') || 'Ingen hand',
    cards_in_hand: gameState.myHand?.length || 0,
    current_round: gameState.currentRound,
    total_players: (gameState.opponents?.length || 0) + 1,
    my_position: calculatePosition(gameState),
    win_probability: gameState.winProbability?.probability || 50,
    my_played_cards: gameState.myPlayedCards?.map(c => c.type).join(', ') || 'Inga',
    
    // Opponent data
    opponent_plays: formatOpponentPlays(gameState),
    leader_name: getLeaderName(gameState),
    leader_score: getLeaderScore(gameState),
    
    // Card types summary
    card_types_summary: formatCardTypes(template.card_types),
    
    // Analysis summary
    analysis_summary: formatAnalysis(gameState, template),
    
    // Card tracking
    card_tracking_summary: cardTrackingText,
    
    // Pudding analysis (Sushi Go specific)
    my_puddings: countCardType(gameState.myPlayedCards, 'pudding'),
    leader_puddings: getLeaderPuddings(gameState),
    
    // Maki analysis
    my_makis: countMakis(gameState.myPlayedCards),
    leader_makis: getLeaderMakis(gameState),
    
    // Set progress
    tempura_progress: countCardType(gameState.myPlayedCards, 'tempura'),
    sashimi_progress: countCardType(gameState.myPlayedCards, 'sashimi'),
    dumpling_count: countCardType(gameState.myPlayedCards, 'dumpling'),
    
    // Utilities
    has_wasabi: countCardType(gameState.myPlayedCards, 'wasabi') > 0,
    has_chopsticks: countCardType(gameState.myPlayedCards, 'chopsticks') > 0
  };
  
  // Ersätt alla ${variable} i template
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\$\\{${key}\\}`, 'g');
    userPrompt = userPrompt.replace(regex, String(value));
  }
  
  // Om det finns kvar ${...} som inte ersatts, använd fallback
  userPrompt = userPrompt.replace(/\$\{[^}]+\}/g, '—');
  
  return userPrompt;
}

// Helper functions for buildPromptFromTemplate
function calculatePosition(state) {
  const myScore = state.myScore || 0;
  const allScores = [myScore, ...(state.opponents?.map(o => o.score) || [])];
  allScores.sort((a, b) => b - a);
  return allScores.indexOf(myScore) + 1;
}

function formatOpponentPlays(state) {
  const plays = state.opponentPlays || [];
  const currentRound = state.currentRound;
  const currentRoundPlays = plays.filter(p => p.round === currentRound);
  
  if (currentRoundPlays.length === 0) return 'Inga drag än';
  
  return currentRoundPlays
    .map(p => `- ${p.playerName}: ${p.card}`)
    .join('\n');
}

function getLeaderName(state) {
  const opponents = state.opponents || [];
  if (opponents.length === 0) return 'Okänd';
  
  const allPlayers = [
    { name: 'Jag', score: state.myScore || 0 },
    ...opponents.map(o => ({ name: o.name, score: o.score }))
  ];
  
  allPlayers.sort((a, b) => b.score - a.score);
  return allPlayers[0].name;
}

function getLeaderScore(state) {
  const opponents = state.opponents || [];
  const myScore = state.myScore || 0;
  const maxScore = Math.max(myScore, ...opponents.map(o => o.score || 0));
  return maxScore;
}

function formatCardTypes(cardTypes) {
  if (!cardTypes) return 'Se spelregler';
  
  return Object.entries(cardTypes)
    .map(([type, info]) => `- ${type}: ${info.strategy || info.name}`)
    .join('\n');
}

function formatAnalysis(state, template) {
  if (!template.prompts?.analysis_template) return '';
  
  let analysis = template.prompts.analysis_template;
  
  // Ersätt variables i analysis template
  const variables = {
    my_puddings: countCardType(state.myPlayedCards, 'pudding'),
    leader_puddings: getLeaderPuddings(state),
    my_makis: countMakis(state.myPlayedCards),
    leader_makis: getLeaderMakis(state),
    tempura_progress: countCardType(state.myPlayedCards, 'tempura'),
    sashimi_progress: countCardType(state.myPlayedCards, 'sashimi'),
    dumpling_count: countCardType(state.myPlayedCards, 'dumpling'),
    has_wasabi: countCardType(state.myPlayedCards, 'wasabi') > 0,
    has_chopsticks: countCardType(state.myPlayedCards, 'chopsticks') > 0
  };
  
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\$\\{${key}\\}`, 'g');
    analysis = analysis.replace(regex, String(value));
  }
  
  return analysis;
}

function countCardType(cards, type) {
  if (!cards) return 0;
  return cards.filter(c => c.type === type).length;
}

function countMakis(cards) {
  if (!cards) return 0;
  let total = 0;
  cards.forEach(card => {
    if (card.type === 'maki1') total += 1;
    if (card.type === 'maki2') total += 2;
    if (card.type === 'maki3') total += 3;
  });
  return total;
}

function getLeaderPuddings(state) {
  const opponents = state.opponents || [];
  const myPuddings = countCardType(state.myPlayedCards, 'pudding');
  const allPuddings = [myPuddings, ...opponents.map(o => countCardType(o.playedCards, 'pudding'))];
  return Math.max(...allPuddings);
}

function getLeaderMakis(state) {
  const opponents = state.opponents || [];
  const myMakis = countMakis(state.myPlayedCards);
  const allMakis = [myMakis, ...opponents.map(o => countMakis(o.playedCards))];
  return Math.max(...allMakis);
}

// === BUILD PROMPT ===
function buildPrompt(gameState) {
  const game = GAME_RULES[gameState.gameName];
  if (!game) {
    return `Analysera detta speltillstånd:\n${JSON.stringify(gameState, null, 2)}`;
  }
  
  // Sushi Go-specifik prompt
  const myHand = gameState.myHand.map(c => c.type).join(', ');
  const handCount = gameState.myHand.length;
  
  // Sammanställ motståndares drag
  const recentPlays = gameState.opponentPlays
    .filter(p => p.round === gameState.currentRound)
    .map(p => `- ${p.playerName}: ${p.card}`)
    .join('\n');
  
  const prompt = `Du är en expert på ${game.name}. Ge KORT och KONKRET strategiskt råd (max 3-4 meningar).

SPELREGLER:
${game.strategy}

KORTTYPER:
${Object.entries(game.cardTypes).map(([type, desc]) => `- ${type}: ${desc}`).join('\n')}

AKTUELL SITUATION:
- Runda: ${gameState.currentRound}/3
- Min poäng: ${gameState.myScore}
- Kort kvar i hand: ${handCount}

MIN HAND:
${myHand}

MOTSTÅNDARES DRAG (denna runda):
${recentPlays || 'Inga drag än'}

GE KONKRET RÅD:
1. Vilket kort ska jag spela? (motivera kort)
2. Vad ska jag bevaka?
3. En kort strategisk observation

Håll svaret kort och actionable!`;

  return prompt;
}

// === CALL LLM ===
async function callLLM(prompt, apiKey) {
  const model = await getModel();
  
  const response = await fetch(CONFIG.OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'chrome-extension://bga-ai-assistant',
      'X-Title': 'BGA AI Assistant'
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: 'system',
          content: 'Du är en strategisk brädspelsexpert. Ge kort, konkreta råd utan onödigt prat.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: CONFIG.MAX_TOKENS,
      temperature: CONFIG.TEMPERATURE
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  
  if (data.error) {
    throw new Error(data.error.message || 'Unknown API error');
  }
  
  if (!data.choices || !data.choices[0]) {
    throw new Error('Invalid API response: no choices');
  }
  
  return data.choices[0].message.content;
}

// === STORAGE HELPERS ===
async function getAPIKey() {
  const result = await chrome.storage.sync.get(['openrouter_api_key']);
  return result.openrouter_api_key || null;
}

async function setAPIKey(apiKey) {
  await chrome.storage.sync.set({ openrouter_api_key: apiKey });
}

async function getModel() {
  const result = await chrome.storage.sync.get(['selected_model']);
  return result.selected_model || CONFIG.DEFAULT_MODEL;
}

async function setModel(model) {
  await chrome.storage.sync.set({ selected_model: model });
}

// === INSTALLATION ===
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('🎉 BGA AI Assistant installed!');
    // Öppna popup istället för options page
    // (options_ui är inte definierad i manifest)
  }
});

// === TRAINING DATA STORAGE ===
// Store training data in chrome.storage.local (has more space than sync)

const MAX_TRAINING_ENTRIES_PER_GAME = 500;
let trainingDataCache = {};

async function storeTrainingData(entry) {
  const gameId = entry.game || 'unknown';

  // Initialize cache for this game if needed
  if (!trainingDataCache[gameId]) {
    const stored = await chrome.storage.local.get([`training_${gameId}`]);
    trainingDataCache[gameId] = stored[`training_${gameId}`] || [];
  }

  // Add new entry
  trainingDataCache[gameId].push({
    timestamp: entry.timestamp || Date.now(),
    data: entry.data,
    url: entry.url
  });

  // Trim to max size
  if (trainingDataCache[gameId].length > MAX_TRAINING_ENTRIES_PER_GAME) {
    trainingDataCache[gameId] = trainingDataCache[gameId].slice(-MAX_TRAINING_ENTRIES_PER_GAME);
  }

  // Save to storage (debounced - save every 10 entries)
  if (trainingDataCache[gameId].length % 10 === 0) {
    await chrome.storage.local.set({
      [`training_${gameId}`]: trainingDataCache[gameId]
    });
    console.log(`Saved ${trainingDataCache[gameId].length} training entries for ${gameId}`);
  }
}

async function getTrainingData(gameId) {
  if (gameId) {
    const stored = await chrome.storage.local.get([`training_${gameId}`]);
    return stored[`training_${gameId}`] || [];
  }

  // Get all training data
  const allKeys = await chrome.storage.local.get(null);
  const trainingData = {};
  for (const [key, value] of Object.entries(allKeys)) {
    if (key.startsWith('training_')) {
      const game = key.replace('training_', '');
      trainingData[game] = value;
    }
  }
  return trainingData;
}

async function clearTrainingData(gameId) {
  if (gameId) {
    delete trainingDataCache[gameId];
    await chrome.storage.local.remove([`training_${gameId}`]);
    console.log(`Cleared training data for ${gameId}`);
  } else {
    // Clear all training data
    const allKeys = await chrome.storage.local.get(null);
    const keysToRemove = Object.keys(allKeys).filter(k => k.startsWith('training_'));
    trainingDataCache = {};
    await chrome.storage.local.remove(keysToRemove);
    console.log('Cleared all training data');
  }
}

// Save any pending training data when extension unloads
self.addEventListener('beforeunload', async () => {
  for (const [gameId, entries] of Object.entries(trainingDataCache)) {
    if (entries.length > 0) {
      await chrome.storage.local.set({
        [`training_${gameId}`]: entries
      });
    }
  }
});

// Exportera för testing
if (typeof self !== 'undefined') {
  self.bgaAIBackground = {
    callLLM,
    buildPrompt,
    getAPIKey,
    setAPIKey,
    getTrainingData,
    clearTrainingData
  };
}

console.log('🎮 Wingman background worker ready');
