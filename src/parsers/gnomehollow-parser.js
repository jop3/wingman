/**
 * Gnome Hollow Game Parser
 * Transforms BGA WebSocket data into normalized game state
 *
 * Gnome Hollow is a worker placement/resource management game
 * where players build a gnome village.
 */

class GnomeHollowParser {
  constructor() {
    this.gameState = {
      round: 1,
      season: 'spring', // spring, summer, fall, winter
      phase: 'placement', // placement, resolution, cleanup
      myWorkers: {
        available: 0,
        placed: []
      },
      myResources: {
        mushrooms: 0,
        berries: 0,
        wood: 0,
        stone: 0,
        gold: 0
      },
      myBuildings: [],
      myGnomes: [],
      myScore: 0,
      availableActions: [],
      marketCards: [],
      opponents: [],
      yourTurn: false
    };

    // Action locations
    this.actionLocations = [
      'forest', 'meadow', 'quarry', 'market', 'workshop', 'tavern'
    ];

    // Resource types
    this.resourceTypes = ['mushrooms', 'berries', 'wood', 'stone', 'gold'];
  }

  parse(data) {
    if (!data || typeof data !== 'object') return null;
    this.logForTraining('gnomehollow', data);
    this.extractGameState(data);
    return this.gameState;
  }

  extractGameState(data) {
    const dataStr = JSON.stringify(data).toLowerCase();

    // Round/Season detection
    if (data.round !== undefined) {
      this.gameState.round = parseInt(data.round) || 1;
    }
    if (data.season) {
      this.gameState.season = data.season.toLowerCase();
    }

    // Phase detection
    if (dataStr.includes('place') || dataStr.includes('worker')) {
      this.gameState.phase = 'placement';
    } else if (dataStr.includes('resolve') || dataStr.includes('action')) {
      this.gameState.phase = 'resolution';
    } else if (dataStr.includes('cleanup') || dataStr.includes('end')) {
      this.gameState.phase = 'cleanup';
    }

    // Turn detection
    if (data.active_player !== undefined || data.activePlayer !== undefined) {
      const activePlayer = data.active_player || data.activePlayer;
      this.gameState.yourTurn = this.isCurrentPlayer(activePlayer, data);
    }

    // Workers
    if (data.workers || data.myWorkers) {
      this.parseWorkers(data.workers || data.myWorkers);
    }

    // Resources
    if (data.resources || data.myResources) {
      this.parseResources(data.resources || data.myResources);
    }

    // Buildings
    if (data.buildings || data.myBuildings) {
      this.gameState.myBuildings = this.parseBuildings(data.buildings || data.myBuildings);
    }

    // Gnomes/Characters
    if (data.gnomes || data.characters) {
      this.gameState.myGnomes = this.parseGnomes(data.gnomes || data.characters);
    }

    // Score
    if (data.score !== undefined || data.myScore !== undefined) {
      this.gameState.myScore = parseInt(data.score || data.myScore) || 0;
    }

    // Available actions
    if (data.availableActions || data.actions) {
      this.gameState.availableActions = data.availableActions || data.actions || [];
    }

    // Market
    if (data.market || data.marketCards) {
      this.gameState.marketCards = this.parseCards(data.market || data.marketCards);
    }

    // Opponents
    if (data.players || data.opponents) {
      this.extractOpponents(data);
    }
  }

  parseWorkers(workers) {
    if (typeof workers === 'number') {
      this.gameState.myWorkers.available = workers;
    } else if (typeof workers === 'object') {
      this.gameState.myWorkers.available = workers.available || workers.remaining || 0;
      this.gameState.myWorkers.placed = workers.placed || [];
    }
  }

  parseResources(resources) {
    if (typeof resources === 'object') {
      for (const type of this.resourceTypes) {
        if (resources[type] !== undefined) {
          this.gameState.myResources[type] = parseInt(resources[type]) || 0;
        }
      }
    }
  }

  parseBuildings(buildings) {
    if (!buildings) return [];
    if (!Array.isArray(buildings)) {
      buildings = Object.values(buildings);
    }
    return buildings.map(b => ({
      id: b.id || b.building_id,
      name: b.name || b.building_name,
      type: b.type,
      bonus: b.bonus,
      cost: b.cost,
      points: b.points || b.vp || 0
    }));
  }

  parseGnomes(gnomes) {
    if (!gnomes) return [];
    if (!Array.isArray(gnomes)) {
      gnomes = Object.values(gnomes);
    }
    return gnomes.map(g => ({
      id: g.id || g.gnome_id,
      name: g.name,
      ability: g.ability,
      location: g.location
    }));
  }

  parseCards(cards) {
    if (!cards) return [];
    if (!Array.isArray(cards)) {
      cards = Object.values(cards);
    }
    return cards.map(card => ({
      id: card.id || card.card_id,
      type: card.type,
      name: card.name,
      cost: card.cost,
      effect: card.effect
    }));
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
        workers: p.workers,
        buildings: p.buildings ? this.parseBuildings(p.buildings) : [],
        visibleResources: p.resources
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
      season: 'spring',
      phase: 'placement',
      myWorkers: { available: 0, placed: [] },
      myResources: { mushrooms: 0, berries: 0, wood: 0, stone: 0, gold: 0 },
      myBuildings: [],
      myGnomes: [],
      myScore: 0,
      availableActions: [],
      marketCards: [],
      opponents: [],
      yourTurn: false
    };
  }
}

if (typeof window !== 'undefined') {
  window.GnomeHollowParser = GnomeHollowParser;
}
