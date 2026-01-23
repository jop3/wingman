/**
 * Ticket to Ride Game Parser
 * Transforms BGA WebSocket data into normalized game state
 *
 * NOTE: This parser needs refinement based on actual BGA WebSocket data.
 * Use Training Mode (Alt+T) to capture real messages and update patterns.
 */

class TicketToRideParser {
  constructor() {
    this.gameState = {
      phase: 'playing',
      trains_remaining: 45,
      hand_cards: [],
      destinations: [],
      claimed_routes: [],
      visible_cards: [],
      opponents: [],
      myScore: 0,
      longest_route_length: 0,
      completed_destinations: 0,
      yourTurn: false,
      variant: 'usa' // usa, europe, nordic, etc.
    };

    // Card colors
    this.cardColors = [
      'red', 'blue', 'green', 'yellow',
      'orange', 'pink', 'white', 'black', 'locomotive'
    ];

    // Key cities for blocking detection
    this.keyCities = {
      usa: ['chicago', 'denver', 'new york', 'los angeles', 'seattle', 'miami'],
      europe: ['paris', 'berlin', 'vienna', 'budapest', 'rome', 'moscow']
    };

    // Bottleneck routes
    this.bottlenecks = {
      usa: ['las vegas', 'phoenix', 'calgary', 'winnipeg', 'el paso'],
      europe: ['zurich', 'venice', 'sarajevo']
    };
  }

  /**
   * Parse incoming WebSocket message
   */
  parse(data) {
    if (!data || typeof data !== 'object') return null;

    // Log raw data for training
    this.logForTraining('tickettoride', data);

    // Try to extract game state from various message formats
    this.extractGameState(data);

    return this.gameState;
  }

  /**
   * Extract game state from message
   */
  extractGameState(data) {
    const dataStr = JSON.stringify(data).toLowerCase();

    // Detect variant
    this.detectVariant(dataStr);

    // Check for turn information
    if (data.active_player !== undefined || data.activePlayer !== undefined) {
      const activePlayer = data.active_player || data.activePlayer;
      this.gameState.yourTurn = this.isCurrentPlayer(activePlayer, data);
    }
    if (dataStr.includes('yourturn') || data.isYourTurn) {
      this.gameState.yourTurn = true;
    }

    // Extract trains remaining
    if (data.trains !== undefined || data.trainsRemaining !== undefined || data.trains_remaining !== undefined) {
      this.gameState.trains_remaining = parseInt(data.trains || data.trainsRemaining || data.trains_remaining) || 45;
    }

    // Extract hand cards
    if (data.hand || data.cards || data.trainCards) {
      const hand = data.hand || data.cards || data.trainCards;
      this.gameState.hand_cards = this.normalizeCards(hand);
    }

    // Extract destinations
    if (data.destinations || data.tickets || data.destinationCards) {
      const dests = data.destinations || data.tickets || data.destinationCards;
      this.gameState.destinations = this.normalizeDestinations(dests);
    }

    // Extract claimed routes
    if (data.routes || data.claimedRoutes || data.claimed) {
      const routes = data.routes || data.claimedRoutes || data.claimed;
      this.gameState.claimed_routes = this.normalizeRoutes(routes);
      this.calculateLongestRoute();
    }

    // Extract visible cards (face-up)
    if (data.visibleCards || data.faceUp || data.displayCards) {
      const visible = data.visibleCards || data.faceUp || data.displayCards;
      this.gameState.visible_cards = this.normalizeCards(visible);
    }

    // Extract score
    if (data.score !== undefined || data.myScore !== undefined) {
      this.gameState.myScore = parseInt(data.score || data.myScore) || 0;
    }

    // Extract opponents
    if (data.players || data.opponents) {
      this.extractOpponents(data);
    }

    // Track route claims
    if (data.action === 'claimRoute' || data.routeClaimed) {
      this.trackRouteClaim(data);
    }

    // Track card draws
    if (data.action === 'drawCard' || data.cardDrawn) {
      this.trackCardDraw(data);
    }
  }

  /**
   * Detect game variant from data
   */
  detectVariant(dataStr) {
    if (dataStr.includes('europe') || dataStr.includes('station') || dataStr.includes('tunnel')) {
      this.gameState.variant = 'europe';
    } else if (dataStr.includes('nordic')) {
      this.gameState.variant = 'nordic';
    } else if (dataStr.includes('asia')) {
      this.gameState.variant = 'asia';
    } else if (dataStr.includes('india')) {
      this.gameState.variant = 'india';
    }
    // Default is 'usa'
  }

  /**
   * Normalize card data
   */
  normalizeCards(cards) {
    if (!cards) return [];
    if (!Array.isArray(cards)) {
      cards = typeof cards === 'object' ? Object.values(cards) : [cards];
    }

    return cards.map(card => {
      if (typeof card === 'string') {
        return { color: card.toLowerCase(), count: 1 };
      }
      return {
        color: (card.color || card.type || 'unknown').toLowerCase(),
        count: card.count || card.quantity || 1
      };
    });
  }

  /**
   * Normalize destination tickets
   */
  normalizeDestinations(destinations) {
    if (!destinations) return [];
    if (!Array.isArray(destinations)) {
      destinations = typeof destinations === 'object' ? Object.values(destinations) : [destinations];
    }

    return destinations.map(dest => {
      if (typeof dest === 'string') {
        return { name: dest, points: 0, completed: false };
      }
      return {
        name: dest.name || `${dest.from || dest.city1} - ${dest.to || dest.city2}`,
        from: dest.from || dest.city1,
        to: dest.to || dest.city2,
        points: dest.points || dest.value || 0,
        completed: dest.completed || false
      };
    });
  }

  /**
   * Normalize routes
   */
  normalizeRoutes(routes) {
    if (!routes) return [];
    if (!Array.isArray(routes)) {
      routes = typeof routes === 'object' ? Object.values(routes) : [routes];
    }

    return routes.map(route => ({
      from: route.from || route.city1,
      to: route.to || route.city2,
      color: route.color,
      length: route.length || route.trains || 0,
      points: this.calculateRoutePoints(route.length || route.trains || 0)
    }));
  }

  /**
   * Calculate points for a route based on length
   */
  calculateRoutePoints(length) {
    const pointsTable = {
      1: 1, 2: 2, 3: 4, 4: 7, 5: 10, 6: 15
    };
    return pointsTable[length] || 0;
  }

  /**
   * Calculate longest continuous route
   */
  calculateLongestRoute() {
    // Simplified - just sum up route lengths for now
    // Real implementation would need graph traversal
    let total = 0;
    for (const route of this.gameState.claimed_routes) {
      total += route.length || 0;
    }
    this.gameState.longest_route_length = total;
  }

  /**
   * Extract opponent data
   */
  extractOpponents(data) {
    let players = data.players || data.opponents;
    if (!Array.isArray(players) && typeof players === 'object') {
      players = Object.values(players);
    }

    const playerId = data.playerId || data.player_id || data.currentPlayerId;

    this.gameState.opponents = players
      .filter(p => {
        const id = p.id || p.player_id;
        return id !== playerId;
      })
      .map(p => ({
        id: p.id || p.player_id,
        name: p.name || p.player_name,
        trains_remaining: p.trains || p.trainsRemaining || 45,
        cards_in_hand: p.cardCount || p.handSize || 0,
        score: p.score || 0,
        routes_claimed: p.routeCount || 0
      }));
  }

  /**
   * Track route claim for opponent analysis
   */
  trackRouteClaim(data) {
    const claim = {
      playerId: data.playerId || data.player_id,
      playerName: data.playerName || data.player_name,
      route: {
        from: data.from || data.city1,
        to: data.to || data.city2,
        color: data.color,
        length: data.length || data.trains
      },
      timestamp: Date.now()
    };

    // Send to opponent analyzer
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: 'OPPONENT_ACTION',
        gameId: 'tickettoride',
        action: 'claim_route',
        data: claim
      }).catch(() => {});
    }
  }

  /**
   * Track card draw for opponent analysis
   */
  trackCardDraw(data) {
    const draw = {
      playerId: data.playerId || data.player_id,
      playerName: data.playerName || data.player_name,
      cardType: data.cardType || data.color || 'deck', // 'deck' if from draw pile
      isVisible: data.isVisible || data.faceUp || false,
      timestamp: Date.now()
    };

    // Send to opponent analyzer
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: 'OPPONENT_ACTION',
        gameId: 'tickettoride',
        action: 'draw_card',
        data: draw
      }).catch(() => {});
    }
  }

  /**
   * Check if active player is current user
   */
  isCurrentPlayer(activePlayer, data) {
    if (data.playerId && activePlayer === data.playerId) return true;
    if (data.player_id && activePlayer === data.player_id) return true;
    return false;
  }

  /**
   * Log data for training mode
   */
  logForTraining(gameId, data) {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: 'TRAINING_DATA',
        gameId: gameId,
        data: data,
        timestamp: Date.now()
      }).catch(() => {});
    }
  }

  /**
   * Reset parser state for new game
   */
  reset() {
    this.gameState = {
      phase: 'playing',
      trains_remaining: 45,
      hand_cards: [],
      destinations: [],
      claimed_routes: [],
      visible_cards: [],
      opponents: [],
      myScore: 0,
      longest_route_length: 0,
      completed_destinations: 0,
      yourTurn: false,
      variant: 'usa'
    };
  }
}

// Export for content script
if (typeof window !== 'undefined') {
  window.TicketToRideParser = TicketToRideParser;
}
