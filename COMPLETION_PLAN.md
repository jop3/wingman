# Wingman Completion Plan

This document outlines the remaining work needed to complete the Wingman extension.

## Current Status: 75% Complete

### What's Done
- Core engines (RuleEngine.js, OpponentAnalyzer.js)
- Chrome Extension infrastructure
- WebSocket interception and game detection
- UI components (sidebar, popup)
- Wingspan: rules + opponent patterns
- Sushi Go: opponent patterns
- Ticket to Ride: opponent patterns

---

## Phase 1: Critical Missing Pieces

### 1.1 Game Parsers (Required for functionality)

Each parser transforms raw BGA WebSocket messages into a normalized game state that the RuleEngine and OpponentAnalyzer can understand.

**Files to create:**

#### `src/parsers/wingspan-parser.js`
```javascript
// Transforms Wingspan WebSocket data to game state
function parseWingspanState(wsData) {
  return {
    round: wsData.currentRound || 1,
    actions_remaining: wsData.actionsLeft,
    birds_played: wsData.birds || [],
    cached_food_total: wsData.cachedFood || 0,
    tucked_cards_total: wsData.tuckedCards || 0,
    eggs_on_birds: wsData.totalEggs || 0,
    forest_birds: countHabitatBirds(wsData.birds, 'forest'),
    grassland_birds: countHabitatBirds(wsData.birds, 'grassland'),
    wetland_birds: countHabitatBirds(wsData.birds, 'wetland'),
    opponent: {
      has_raven: wsData.opponents?.some(o => hasBird(o, 'Common Raven')),
      has_predator: wsData.opponents?.some(o => hasPredator(o))
    },
    yourTurn: wsData.activePlayer === wsData.playerId
  };
}
```

#### `src/parsers/sushigo-parser.js`
```javascript
// Transforms Sushi Go WebSocket data to game state
function parseSushiGoState(wsData) {
  return {
    round: wsData.round || 1,
    myHand: wsData.hand || [],
    myPlayedCards: wsData.playedCards || [],
    opponents: wsData.opponents || [],
    yourTurn: wsData.activePlayer === wsData.playerId
  };
}
```

#### `src/parsers/tickettoride-parser.js`
```javascript
// Transforms Ticket to Ride WebSocket data to game state
function parseTicketToRideState(wsData) {
  return {
    trains_remaining: wsData.trainsLeft || 45,
    hand_cards: wsData.hand || [],
    destinations: wsData.destinations || [],
    claimed_routes: wsData.claimedRoutes || [],
    opponents: wsData.opponents?.map(o => ({
      id: o.id,
      trains_remaining: o.trainsLeft,
      cards_in_hand: o.handSize
    })),
    yourTurn: wsData.activePlayer === wsData.playerId
  };
}
```

**How to develop parsers:**
1. Go to BGA and start a game
2. Open DevTools (F12) → Network → WS
3. Play the game and observe WebSocket messages
4. Document the message format for key actions
5. Write parser to extract relevant data

### 1.2 Game Rules JSON (For strategy recommendations)

#### `src/games/sushigo-rules.json`

Use `wingspan-rules.json` as template. Key rules needed:

```json
{
  "gameId": "sushigo",
  "gameName": "Sushi Go",
  "trackers": {
    "current_round": { "type": "counter", "initial": 1 },
    "pudding_count": { "type": "counter", "initial": 0 },
    "maki_count": { "type": "counter", "initial": 0 }
  },
  "rules": [
    {
      "id": "pudding_crisis",
      "priority": 95,
      "conditions": {
        "and": [
          { "tracker.current_round.value": { "equals": 3 } },
          { "tracker.pudding_count.value": { "lessThan": 2 } }
        ]
      },
      "action": {
        "recommend": "take_pudding",
        "message": "KRITISKT: Du har för få puddings - ta pudding nu eller riskera -6p!",
        "alertLevel": "critical"
      }
    },
    // ... more rules
  ]
}
```

**Suggested rules for Sushi Go:**
1. Pudding crisis (round 3, low pudding count)
2. Maki majority check
3. Tempura completion (have 1, take 2nd)
4. Sashimi completion (have 2, take 3rd)
5. Wasabi + nigiri combo
6. Dumpling optimization (4-5 is sweet spot)
7. Chopsticks usage timing
8. Blocking opponent sets

#### `src/games/tickettoride-rules.json`

**Suggested rules for Ticket to Ride:**
1. Train count warning (< 10 trains)
2. Destination completion priority
3. Long route bonus awareness
4. Blocking bottleneck routes
5. Color hoarding detection
6. Endgame timing
7. Station usage (Europe variant)

### 1.3 Extension Icons

Create PNG icons in these sizes:
- `src/icons/icon16.png` (16x16)
- `src/icons/icon32.png` (32x32)
- `src/icons/icon48.png` (48x48)
- `src/icons/icon128.png` (128x128)

**Quick solution:** Use an online tool like favicon.io or realfavicongenerator.net to convert the SVG.

---

## Phase 2: Integration & Testing

### 2.1 Wire Up Parsers

Update `content.js` to use game-specific parsers:

```javascript
// In parseGameState function
function parseGameState(data) {
  let gameState;

  switch (currentGame.gameId) {
    case 'wingspan':
      gameState = parseWingspanState(data);
      break;
    case 'sushigo':
      gameState = parseSushiGoState(data);
      break;
    case 'tickettoride':
      gameState = parseTicketToRideState(data);
      break;
    default:
      console.warn('No parser for game:', currentGame.gameId);
      return;
  }

  // Update trackers
  if (ruleEngine) {
    for (const [key, value] of Object.entries(gameState)) {
      ruleEngine.updateTracker(key, value);
    }
  }

  // Track opponent actions
  if (data.player && data.action && opponentAnalyzer) {
    opponentAnalyzer.trackAction(data.player, gameState);
  }

  // Generate recommendations on your turn
  if (gameState.yourTurn) {
    generateRecommendations(gameState);
  }
}
```

### 2.2 Test on BGA

1. Load extension in Chrome
2. Go to boardgamearena.com
3. Start a Wingspan game (most complete support)
4. Verify:
   - Game detection works
   - Sidebar appears (Alt+B)
   - Recommendations show when it's your turn
   - Opponent tracking updates

### 2.3 Debug Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Game not detected" | URL pattern mismatch | Check game-detector.js patterns |
| "No recommendations" | JSON file not loading | Check console for fetch errors |
| Sidebar not showing | CSS conflict | Check z-index, press Alt+B |
| WebSocket not captured | Timing issue | Ensure run_at: document_start |

---

## Phase 3: Polish & Enhancement

### 3.1 UI Improvements

- Add game info to sidebar header (detected game, variant)
- Show recommendation source (rules vs opponent analysis)
- Add "why" explanations for recommendations
- Improve mobile/responsive design

### 3.2 Additional Features

- Export training data (for developing new game support)
- Statistics tracking across sessions
- Customizable recommendation filters
- Sound/visual alerts for high-priority recommendations

### 3.3 Performance

- Debounce WebSocket parsing
- Lazy-load game templates
- Minimize DOM updates

---

## Task Priority Matrix

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| P0 | Game parsers (3 files) | Medium | Required |
| P0 | Icons (4 PNGs) | Low | Required |
| P1 | Sushi Go rules | Medium | High |
| P1 | Ticket to Ride rules | Medium | High |
| P2 | BGA testing | Medium | High |
| P2 | Wire up parsers | Low | High |
| P3 | UI polish | Medium | Medium |
| P3 | Additional features | High | Medium |

---

## Estimated Time to Completion

| Phase | Tasks | Time |
|-------|-------|------|
| Phase 1 | Parsers + Rules + Icons | 4-6 hours |
| Phase 2 | Integration + Testing | 2-3 hours |
| Phase 3 | Polish | 2-4 hours |
| **Total** | | **8-13 hours** |

---

## Quick Start Commands

```bash
# Run local tests
node src/core/RuleEngine.js  # Test rule engine
node src/core/OpponentAnalyzer.js  # Test analyzer

# Load in Chrome
1. chrome://extensions
2. Enable Developer mode
3. Load unpacked → select src/

# Debug on BGA
1. Open game on BGA
2. F12 → Console → filter "BGA Assistant"
3. F12 → Network → WS → watch messages
```

---

## Success Criteria

Extension is complete when:

- [ ] All 3 games have working parsers
- [ ] All 3 games have rules JSON (Wingspan done)
- [ ] Extension loads without errors
- [ ] Game detection works reliably
- [ ] Recommendations appear on your turn
- [ ] Opponent tracking updates in real-time
- [ ] Icons display correctly
- [ ] Settings persist across sessions
