/**
 * Settlers of Catan Game Parser
 * Transforms BGA WebSocket data into normalized game state
 *
 * Catan is a resource trading/building game where players settle an island.
 */

class CatanParser {
  constructor() {
    this.gameState = {
      turn: 1,
      phase: 'setup', // setup, roll, trade, build, robber
      diceResult: null,
      myResources: {
        brick: 0,
        lumber: 0,
        wool: 0,
        grain: 0,
        ore: 0
      },
      mySettlements: [],
      myCities: [],
      myRoads: [],
      myDevCards: [],
      myVictoryPoints: 0,
      longestRoad: false,
      largestArmy: false,
      knightsPlayed: 0,
      roadLength: 0,
      robberPosition: null,
      availableBuildSpots: [],
      opponents: [],
      bankTrades: {
        default: 4, // 4:1 base rate
        harbors: []   // 3:1 generic or 2:1 specific
      },
      yourTurn: false
    };

    // Resource types
    this.resourceTypes = ['brick', 'lumber', 'wool', 'grain', 'ore'];

    // Development card types
    this.devCardTypes = ['knight', 'victoryPoint', 'roadBuilding', 'yearOfPlenty', 'monopoly'];

    // Building costs
    this.buildingCosts = {
      road: { brick: 1, lumber: 1 },
      settlement: { brick: 1, lumber: 1, wool: 1, grain: 1 },
      city: { grain: 2, ore: 3 },
      devCard: { wool: 1, grain: 1, ore: 1 }
    };
  }

  parse(data) {
    if (!data || typeof data !== 'object') return null;
    this.logForTraining('catan', data);
    this.extractGameState(data);
    return this.gameState;
  }

  extractGameState(data) {
    const dataStr = JSON.stringify(data).toLowerCase();

    // Turn detection
    if (data.turn !== undefined || data.round !== undefined) {
      this.gameState.turn = parseInt(data.turn || data.round) || 1;
    }

    // Phase detection
    if (dataStr.includes('setup') || dataStr.includes('initial')) {
      this.gameState.phase = 'setup';
    } else if (dataStr.includes('roll') || dataStr.includes('dice')) {
      this.gameState.phase = 'roll';
    } else if (dataStr.includes('trade') || dataStr.includes('offer')) {
      this.gameState.phase = 'trade';
    } else if (dataStr.includes('build') || dataStr.includes('construct')) {
      this.gameState.phase = 'build';
    } else if (dataStr.includes('robber') || dataStr.includes('steal')) {
      this.gameState.phase = 'robber';
    }

    // Dice result
    if (data.dice !== undefined || data.diceResult !== undefined) {
      this.gameState.diceResult = data.dice || data.diceResult;
    }

    // Turn detection
    if (data.active_player !== undefined || data.activePlayer !== undefined) {
      const activePlayer = data.active_player || data.activePlayer;
      this.gameState.yourTurn = this.isCurrentPlayer(activePlayer, data);
    }

    // Resources
    if (data.resources || data.myResources || data.hand) {
      this.parseResources(data.resources || data.myResources || data.hand);
    }

    // Settlements
    if (data.settlements || data.mySettlements) {
      this.gameState.mySettlements = this.parseBuildings(data.settlements || data.mySettlements);
    }

    // Cities
    if (data.cities || data.myCities) {
      this.gameState.myCities = this.parseBuildings(data.cities || data.myCities);
    }

    // Roads
    if (data.roads || data.myRoads) {
      this.gameState.myRoads = this.parseRoads(data.roads || data.myRoads);
    }

    // Development cards
    if (data.devCards || data.developmentCards || data.cards) {
      this.gameState.myDevCards = this.parseDevCards(data.devCards || data.developmentCards || data.cards);
    }

    // Victory points
    if (data.victoryPoints !== undefined || data.vp !== undefined || data.score !== undefined) {
      this.gameState.myVictoryPoints = parseInt(data.victoryPoints || data.vp || data.score) || 0;
    }

    // Special achievements
    if (data.longestRoad !== undefined) {
      this.gameState.longestRoad = data.longestRoad;
    }
    if (data.largestArmy !== undefined) {
      this.gameState.largestArmy = data.largestArmy;
    }
    if (data.knightsPlayed !== undefined || data.knights !== undefined) {
      this.gameState.knightsPlayed = parseInt(data.knightsPlayed || data.knights) || 0;
    }
    if (data.roadLength !== undefined) {
      this.gameState.roadLength = parseInt(data.roadLength) || 0;
    }

    // Robber position
    if (data.robber !== undefined || data.robberPosition !== undefined) {
      this.gameState.robberPosition = data.robber || data.robberPosition;
    }

    // Harbors
    if (data.harbors || data.ports) {
      this.parseHarbors(data.harbors || data.ports);
    }

    // Available build spots
    if (data.availableSpots || data.buildSpots) {
      this.gameState.availableBuildSpots = data.availableSpots || data.buildSpots || [];
    }

    // Opponents
    if (data.players || data.opponents) {
      this.extractOpponents(data);
    }
  }

  parseResources(resources) {
    if (typeof resources === 'object') {
      for (const type of this.resourceTypes) {
        if (resources[type] !== undefined) {
          this.gameState.myResources[type] = parseInt(resources[type]) || 0;
        }
        // Handle alternative names
        if (type === 'lumber' && resources.wood !== undefined) {
          this.gameState.myResources.lumber = parseInt(resources.wood) || 0;
        }
        if (type === 'grain' && resources.wheat !== undefined) {
          this.gameState.myResources.grain = parseInt(resources.wheat) || 0;
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
      position: b.position || b.location || b.vertex,
      adjacentTiles: b.adjacentTiles || b.tiles || [],
      numbers: b.numbers || []
    }));
  }

  parseRoads(roads) {
    if (!roads) return [];
    if (!Array.isArray(roads)) {
      roads = Object.values(roads);
    }
    return roads.map(r => ({
      id: r.id || r.road_id,
      edge: r.edge || r.position,
      connects: r.connects || []
    }));
  }

  parseDevCards(cards) {
    if (!cards) return [];
    if (!Array.isArray(cards)) {
      cards = Object.values(cards);
    }
    return cards.map(c => ({
      id: c.id || c.card_id,
      type: c.type || c.cardType,
      playable: c.playable !== false
    }));
  }

  parseHarbors(harbors) {
    if (!harbors) return;
    if (!Array.isArray(harbors)) {
      harbors = Object.values(harbors);
    }
    this.gameState.bankTrades.harbors = harbors.map(h => ({
      type: h.type || 'generic', // 'generic' for 3:1, resource name for 2:1
      ratio: h.ratio || (h.type ? 2 : 3),
      position: h.position
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
        victoryPoints: p.victoryPoints || p.vp || p.score || 0,
        resourceCount: p.resourceCount || p.cardCount || 0,
        settlements: p.settlementCount || (p.settlements ? p.settlements.length : 0),
        cities: p.cityCount || (p.cities ? p.cities.length : 0),
        roads: p.roadCount || (p.roads ? p.roads.length : 0),
        knights: p.knightsPlayed || p.knights || 0,
        longestRoad: p.longestRoad || false,
        largestArmy: p.largestArmy || false,
        devCards: p.devCardCount || 0
      }));
  }

  canBuild(type) {
    const cost = this.buildingCosts[type];
    if (!cost) return false;
    for (const [resource, amount] of Object.entries(cost)) {
      if ((this.gameState.myResources[resource] || 0) < amount) {
        return false;
      }
    }
    return true;
  }

  getTotalResources() {
    return Object.values(this.gameState.myResources).reduce((a, b) => a + b, 0);
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
      turn: 1,
      phase: 'setup',
      diceResult: null,
      myResources: { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 },
      mySettlements: [],
      myCities: [],
      myRoads: [],
      myDevCards: [],
      myVictoryPoints: 0,
      longestRoad: false,
      largestArmy: false,
      knightsPlayed: 0,
      roadLength: 0,
      robberPosition: null,
      availableBuildSpots: [],
      opponents: [],
      bankTrades: { default: 4, harbors: [] },
      yourTurn: false
    };
  }
}

if (typeof window !== 'undefined') {
  window.CatanParser = CatanParser;
}
