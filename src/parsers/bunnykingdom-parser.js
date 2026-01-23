/**
 * Bunny Kingdom Game Parser
 * Transforms BGA WebSocket data into normalized game state
 */

class BunnyKingdomParser {
  constructor() {
    this.gameState = {
      round: 1,
      phase: 'drafting', // drafting, placing, scoring
      myHand: [],
      myTerritories: [],   // Grid positions owned
      myFiefs: [],         // Connected territory groups
      myResources: {
        cities: 0,         // Tower levels
        farms: 0,          // Carrot production
        camps: 0,
        resources: []      // Wood, fish, carrots, etc.
      },
      parchments: [],      // Secret objective cards
      buildingCards: [],   // Building/sky tower cards
      opponents: [],
      gridState: {},       // Full 10x10 grid state
      yourTurn: false
    };

    // Resource types
    this.resourceTypes = ['wood', 'fish', 'carrot', 'mushroom', 'golden_carrot'];

    // Building types
    this.buildingTypes = ['city1', 'city2', 'city3', 'farm', 'camp', 'sky_tower'];
  }

  parse(data) {
    if (!data || typeof data !== 'object') return null;
    this.logForTraining('bunnykingdom', data);
    this.extractGameState(data);
    return this.gameState;
  }

  extractGameState(data) {
    const dataStr = JSON.stringify(data).toLowerCase();

    // Round detection
    if (data.round !== undefined) {
      this.gameState.round = parseInt(data.round) || 1;
    }

    // Phase detection
    if (dataStr.includes('draft') || dataStr.includes('select') || dataStr.includes('pick')) {
      this.gameState.phase = 'drafting';
    } else if (dataStr.includes('place') || dataStr.includes('build')) {
      this.gameState.phase = 'placing';
    } else if (dataStr.includes('score') || dataStr.includes('harvest')) {
      this.gameState.phase = 'scoring';
    }

    // Turn detection
    if (data.active_player !== undefined || data.activePlayer !== undefined) {
      const activePlayer = data.active_player || data.activePlayer;
      this.gameState.yourTurn = this.isCurrentPlayer(activePlayer, data);
    }

    // Hand cards
    if (data.hand || data.cards || data.myHand) {
      this.gameState.myHand = this.parseCards(data.hand || data.cards || data.myHand);
    }

    // Territories
    if (data.territories || data.myTerritories || data.positions) {
      this.gameState.myTerritories = this.parseTerritories(
        data.territories || data.myTerritories || data.positions
      );
    }

    // Fiefs (connected groups)
    if (data.fiefs || data.myFiefs) {
      this.gameState.myFiefs = this.parseFiefs(data.fiefs || data.myFiefs);
    }

    // Resources
    if (data.resources || data.myResources) {
      this.parseResources(data.resources || data.myResources);
    }

    // Parchments (secret objectives)
    if (data.parchments || data.objectives || data.secretCards) {
      this.gameState.parchments = this.parseCards(
        data.parchments || data.objectives || data.secretCards
      );
    }

    // Buildings
    if (data.buildings || data.buildingCards) {
      this.gameState.buildingCards = this.parseCards(data.buildings || data.buildingCards);
    }

    // Grid state
    if (data.grid || data.board || data.map) {
      this.gameState.gridState = data.grid || data.board || data.map;
    }

    // Opponents
    if (data.players || data.opponents) {
      this.extractOpponents(data);
    }
  }

  parseCards(cards) {
    if (!cards) return [];
    if (!Array.isArray(cards)) {
      cards = typeof cards === 'object' ? Object.values(cards) : [cards];
    }
    return cards.map(card => {
      if (typeof card === 'string') {
        return { type: card, id: card };
      }
      return {
        id: card.id || card.card_id,
        type: card.type || card.card_type,
        name: card.name,
        position: card.position || card.coord,
        value: card.value,
        resource: card.resource
      };
    });
  }

  parseTerritories(territories) {
    if (!territories) return [];
    if (!Array.isArray(territories)) {
      territories = Object.values(territories);
    }
    return territories.map(t => ({
      position: t.position || t.coord || `${t.x},${t.y}`,
      x: t.x,
      y: t.y,
      building: t.building,
      resource: t.resource,
      cityLevel: t.cityLevel || t.towers || 0
    }));
  }

  parseFiefs(fiefs) {
    if (!fiefs) return [];
    if (!Array.isArray(fiefs)) {
      fiefs = Object.values(fiefs);
    }
    return fiefs.map(fief => ({
      territories: fief.territories || fief.positions || [],
      totalTowers: fief.towers || fief.cityStrength || 0,
      resources: fief.resources || [],
      score: fief.score || 0
    }));
  }

  parseResources(resources) {
    if (typeof resources === 'object') {
      this.gameState.myResources = {
        cities: resources.cities || resources.towers || 0,
        farms: resources.farms || 0,
        camps: resources.camps || 0,
        resources: resources.resourceTypes || []
      };
    }
  }

  extractOpponents(data) {
    let players = data.players || data.opponents;
    if (!Array.isArray(players) && typeof players === 'object') {
      players = Object.values(players);
    }

    const playerId = data.playerId || data.player_id;

    this.gameState.opponents = players
      .filter(p => (p.id || p.player_id) !== playerId)
      .map(p => ({
        id: p.id || p.player_id,
        name: p.name || p.player_name,
        score: p.score || 0,
        territories: p.territories ? this.parseTerritories(p.territories) : [],
        fiefCount: p.fiefCount || 0,
        visibleResources: p.resources || []
      }));
  }

  isCurrentPlayer(activePlayer, data) {
    if (data.playerId && activePlayer === data.playerId) return true;
    if (data.player_id && activePlayer === data.player_id) return true;
    return false;
  }

  logForTraining(gameId, data) {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: 'TRAINING_DATA',
        gameId: gameId,
        data: data,
        timestamp: Date.now()
      }).catch(() => { });
    }
  }

  reset() {
    this.gameState = {
      round: 1,
      phase: 'drafting',
      myHand: [],
      myTerritories: [],
      myFiefs: [],
      myResources: { cities: 0, farms: 0, camps: 0, resources: [] },
      parchments: [],
      buildingCards: [],
      opponents: [],
      gridState: {},
      yourTurn: false
    };
  }
}

if (typeof window !== 'undefined') {
  window.BunnyKingdomParser = BunnyKingdomParser;
}
