/**
 * Sushi Go Game Parser
 * Transforms BGA WebSocket data into normalized game state
 *
 * NOTE: This parser needs refinement based on actual BGA WebSocket data.
 * Use Training Mode (Alt+T) to capture real messages and update patterns.
 */

class SushiGoParser {
  constructor() {
    this.gameState = {
      round: 1,
      phase: 'drafting',
      myHand: [],
      myPlayedCards: [],
      opponents: [],
      opponentPlays: [],
      myScore: 0,
      pudding_count: 0,
      maki_count: 0,
      tempura_count: 0,
      sashimi_count: 0,
      dumpling_count: 0,
      has_wasabi: false,
      has_chopsticks: false,
      yourTurn: false
    };

    // Card type mappings
    this.cardTypes = {
      // Nigiri
      'egg': 'nigiri1',
      'salmon': 'nigiri2',
      'squid': 'nigiri3',
      'nigiri_egg': 'nigiri1',
      'nigiri_salmon': 'nigiri2',
      'nigiri_squid': 'nigiri3',
      // Maki
      'maki1': 'maki1',
      'maki2': 'maki2',
      'maki3': 'maki3',
      'maki_1': 'maki1',
      'maki_2': 'maki2',
      'maki_3': 'maki3',
      // Sets
      'tempura': 'tempura',
      'sashimi': 'sashimi',
      'dumpling': 'dumpling',
      // Specials
      'wasabi': 'wasabi',
      'chopsticks': 'chopsticks',
      'pudding': 'pudding'
    };

    // Pass direction by round (1=left, 2=right, 3=left)
    this.passDirection = {
      1: 'left',
      2: 'right',
      3: 'left'
    };
  }

  /**
   * Parse incoming WebSocket message
   */
  parse(data) {
    if (!data || typeof data !== 'object') return null;

    // Log raw data for training
    this.logForTraining('sushigo', data);

    // Try to extract game state from various message formats
    this.extractGameState(data);

    return this.gameState;
  }

  /**
   * Extract game state from message
   */
  extractGameState(data) {
    const dataStr = JSON.stringify(data).toLowerCase();

    // Check for round information
    if (data.round !== undefined) {
      this.gameState.round = parseInt(data.round) || this.gameState.round;
    }
    if (data.currentRound !== undefined) {
      this.gameState.round = parseInt(data.currentRound) || this.gameState.round;
    }

    // Check for turn/phase
    if (data.active_player !== undefined || data.activePlayer !== undefined) {
      const activePlayer = data.active_player || data.activePlayer;
      this.gameState.yourTurn = this.isCurrentPlayer(activePlayer, data);
    }
    if (dataStr.includes('yourturn') || data.isYourTurn) {
      this.gameState.yourTurn = true;
    }

    // Extract hand
    if (data.hand || data.cards || data.myHand) {
      const hand = data.hand || data.cards || data.myHand;
      this.gameState.myHand = this.normalizeCards(hand);
    }

    // Extract played cards
    if (data.playedCards || data.played || data.tableau) {
      const played = data.playedCards || data.played || data.tableau;
      this.gameState.myPlayedCards = this.normalizeCards(played);
      this.updateCardCounts();
    }

    // Extract score
    if (data.score !== undefined || data.myScore !== undefined) {
      this.gameState.myScore = parseInt(data.score || data.myScore) || 0;
    }

    // Extract opponents
    if (data.players || data.opponents) {
      this.extractOpponents(data);
    }

    // Extract card plays (for tracking what opponents took)
    if (data.cardPlayed || data.play || data.action === 'playCard') {
      this.extractCardPlay(data);
    }
  }

  /**
   * Normalize card data to consistent format
   */
  normalizeCards(cards) {
    if (!cards) return [];
    if (!Array.isArray(cards)) {
      cards = typeof cards === 'object' ? Object.values(cards) : [cards];
    }

    return cards.map(card => {
      const type = this.normalizeCardType(card);
      return {
        type: type,
        id: card.id || card.card_id || Math.random().toString(36).substr(2, 9)
      };
    });
  }

  /**
   * Normalize card type to internal format
   */
  normalizeCardType(card) {
    if (typeof card === 'string') {
      return this.cardTypes[card.toLowerCase()] || card.toLowerCase();
    }
    if (card.type) {
      return this.cardTypes[card.type.toLowerCase()] || card.type.toLowerCase();
    }
    if (card.name) {
      return this.cardTypes[card.name.toLowerCase()] || card.name.toLowerCase();
    }
    if (card.card_type) {
      return this.cardTypes[card.card_type.toLowerCase()] || card.card_type.toLowerCase();
    }
    return 'unknown';
  }

  /**
   * Update card counts from played cards
   */
  updateCardCounts() {
    const counts = {
      pudding: 0,
      maki: 0,
      tempura: 0,
      sashimi: 0,
      dumpling: 0,
      wasabi: false,
      chopsticks: false
    };

    for (const card of this.gameState.myPlayedCards) {
      switch (card.type) {
        case 'pudding':
          counts.pudding++;
          break;
        case 'maki1':
          counts.maki += 1;
          break;
        case 'maki2':
          counts.maki += 2;
          break;
        case 'maki3':
          counts.maki += 3;
          break;
        case 'tempura':
          counts.tempura++;
          break;
        case 'sashimi':
          counts.sashimi++;
          break;
        case 'dumpling':
          counts.dumpling++;
          break;
        case 'wasabi':
          counts.wasabi = true;
          break;
        case 'chopsticks':
          counts.chopsticks = true;
          break;
      }
    }

    this.gameState.pudding_count = counts.pudding;
    this.gameState.maki_count = counts.maki;
    this.gameState.tempura_count = counts.tempura;
    this.gameState.sashimi_count = counts.sashimi;
    this.gameState.dumpling_count = counts.dumpling;
    this.gameState.has_wasabi = counts.wasabi;
    this.gameState.has_chopsticks = counts.chopsticks;
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
        score: p.score || 0,
        playedCards: this.normalizeCards(p.playedCards || p.played || p.tableau || [])
      }));
  }

  /**
   * Extract a card play action
   */
  extractCardPlay(data) {
    const play = {
      round: this.gameState.round,
      playerName: data.playerName || data.player_name || 'Unknown',
      playerId: data.playerId || data.player_id,
      card: this.normalizeCardType(data.cardPlayed || data.card || data.play)
    };

    this.gameState.opponentPlays.push(play);

    // Keep only recent plays (last 20)
    if (this.gameState.opponentPlays.length > 20) {
      this.gameState.opponentPlays.shift();
    }
  }

  /**
   * Check if the active player is the current user
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
      round: 1,
      phase: 'drafting',
      myHand: [],
      myPlayedCards: [],
      opponents: [],
      opponentPlays: [],
      myScore: 0,
      pudding_count: 0,
      maki_count: 0,
      tempura_count: 0,
      sashimi_count: 0,
      dumpling_count: 0,
      has_wasabi: false,
      has_chopsticks: false,
      yourTurn: false
    };
  }
}

// Export for content script
if (typeof window !== 'undefined') {
  window.SushiGoParser = SushiGoParser;
}
