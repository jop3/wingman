/**
 * Wingspan Game Parser
 * Transforms BGA WebSocket data into normalized game state
 *
 * NOTE: This parser needs refinement based on actual BGA WebSocket data.
 * Use Training Mode (Alt+T) to capture real messages and update patterns.
 */

class WingspanParser {
  constructor() {
    this.gameState = {
      round: 1,
      actions_remaining: 8,
      phase: 'playing',
      birds_played: [],
      cached_food_total: 0,
      tucked_cards_total: 0,
      eggs_on_birds: 0,
      when_activated_powers: 0,
      forest_birds: 0,
      grassland_birds: 0,
      wetland_birds: 0,
      hand: [],
      food: [],
      opponents: [],
      yourTurn: false
    };

    // Known message patterns from BGA (to be refined with training data)
    this.messagePatterns = {
      gameStart: ['gamestart', 'startgame', 'setupgame'],
      roundChange: ['newround', 'roundstart', 'round'],
      playBird: ['playbird', 'placebird', 'bird_played'],
      layEggs: ['layeggs', 'eggs', 'egg_laid'],
      gainFood: ['gainfood', 'food', 'getfood'],
      drawCards: ['drawcards', 'draw', 'cards'],
      activateBird: ['activate', 'power', 'triggered'],
      tuckCard: ['tuck', 'tucked'],
      cacheFood: ['cache', 'cached'],
      turnChange: ['yourturn', 'turn', 'activeplayer', 'nextturn']
    };

    // Key birds to track
    this.keyBirds = {
      ravens: ['common raven', 'chihuahuan raven', 'american crow'],
      tuckers: ['chipmunk', "franklin's gull", 'killdeer'],
      predators: ['peregrine falcon', 'red-tailed hawk', 'cooper\'s hawk'],
      eggLayers: ['american goldfinch', 'house finch', 'killdeer']
    };
  }

  /**
   * Parse incoming WebSocket message
   */
  parse(data) {
    if (!data || typeof data !== 'object') return null;

    // Log raw data for training
    this.logForTraining('wingspan', data);

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

    // Check for turn information
    if (data.active_player !== undefined || data.activePlayer !== undefined) {
      const activePlayer = data.active_player || data.activePlayer;
      this.gameState.yourTurn = this.isCurrentPlayer(activePlayer, data);
    }
    if (dataStr.includes('yourturn') || data.isYourTurn) {
      this.gameState.yourTurn = true;
    }

    // Extract player data
    if (data.players) {
      this.extractPlayerData(data.players, data);
    }

    // Extract bird plays
    if (data.bird || data.playedBird || data.birds) {
      this.extractBirdData(data);
    }

    // Extract resources
    if (data.food !== undefined) {
      this.gameState.food = Array.isArray(data.food) ? data.food : [data.food];
    }
    if (data.hand !== undefined || data.cards !== undefined) {
      this.gameState.hand = data.hand || data.cards || [];
    }
    if (data.eggs !== undefined) {
      this.gameState.eggs_on_birds = parseInt(data.eggs) || 0;
    }

    // Extract tucking/caching
    if (data.tuckedCards !== undefined) {
      this.gameState.tucked_cards_total = parseInt(data.tuckedCards) || 0;
    }
    if (data.cachedFood !== undefined) {
      this.gameState.cached_food_total = parseInt(data.cachedFood) || 0;
    }

    // Check for opponent threats
    this.detectOpponentThreats(data);

    // Update actions based on round
    const actionsPerRound = [8, 7, 6, 5];
    if (this.gameState.round >= 1 && this.gameState.round <= 4) {
      this.gameState.actions_remaining = actionsPerRound[this.gameState.round - 1];
    }
  }

  /**
   * Check if the active player is the current user
   */
  isCurrentPlayer(activePlayer, data) {
    // Try various ways to identify current player
    if (data.playerId && activePlayer === data.playerId) return true;
    if (data.player_id && activePlayer === data.player_id) return true;
    if (data.currentPlayerId && activePlayer === data.currentPlayerId) return true;
    // If we can't determine, assume it might be our turn (will be refined)
    return false;
  }

  /**
   * Extract player data
   */
  extractPlayerData(players, data) {
    if (!Array.isArray(players) && typeof players === 'object') {
      players = Object.values(players);
    }

    this.gameState.opponents = players
      .filter(p => p.id !== data.playerId && p.id !== data.player_id)
      .map(p => ({
        id: p.id || p.player_id,
        name: p.name || p.player_name,
        birds: p.birds || [],
        score: p.score || 0
      }));
  }

  /**
   * Extract bird data
   */
  extractBirdData(data) {
    const bird = data.bird || data.playedBird;
    if (bird) {
      const birdInfo = {
        name: bird.name || bird.bird_name || 'Unknown',
        habitat: bird.habitat || this.detectHabitat(bird),
        powerType: bird.power_type || bird.powerType || 'none'
      };

      this.gameState.birds_played.push(birdInfo);

      // Update habitat counts
      if (birdInfo.habitat === 'forest') this.gameState.forest_birds++;
      if (birdInfo.habitat === 'grassland') this.gameState.grassland_birds++;
      if (birdInfo.habitat === 'wetland') this.gameState.wetland_birds++;

      // Count when-activated powers
      if (birdInfo.powerType === 'when_activated' || birdInfo.powerType === 'brown') {
        this.gameState.when_activated_powers++;
      }
    }
  }

  /**
   * Detect habitat from bird data
   */
  detectHabitat(bird) {
    const habitats = ['forest', 'grassland', 'wetland'];
    for (const h of habitats) {
      if (bird[h] || bird.habitat === h) return h;
    }
    return 'unknown';
  }

  /**
   * Detect opponent threats
   */
  detectOpponentThreats(data) {
    const dataStr = JSON.stringify(data).toLowerCase();

    // Check for ravens (food stealers)
    const hasRaven = this.keyBirds.ravens.some(r => dataStr.includes(r));

    // Check for predators
    const hasPredator = this.keyBirds.predators.some(p => dataStr.includes(p));

    if (this.gameState.opponents.length > 0) {
      this.gameState.opponent = {
        has_raven: hasRaven,
        has_predator: hasPredator
      };
    }
  }

  /**
   * Log data for training mode
   */
  logForTraining(gameId, data) {
    // Send to background for storage
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: 'TRAINING_DATA',
        gameId: gameId,
        data: data,
        timestamp: Date.now()
      }).catch(() => {}); // Ignore errors
    }
  }

  /**
   * Reset parser state for new game
   */
  reset() {
    this.gameState = {
      round: 1,
      actions_remaining: 8,
      phase: 'playing',
      birds_played: [],
      cached_food_total: 0,
      tucked_cards_total: 0,
      eggs_on_birds: 0,
      when_activated_powers: 0,
      forest_birds: 0,
      grassland_birds: 0,
      wetland_birds: 0,
      hand: [],
      food: [],
      opponents: [],
      yourTurn: false
    };
  }
}

// Export for content script
if (typeof window !== 'undefined') {
  window.WingspanParser = WingspanParser;
}
