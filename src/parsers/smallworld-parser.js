/**
 * Small World Game Parser
 * Transforms BGA WebSocket data into normalized game state
 *
 * Small World is an area control game with fantasy races and special powers.
 */

class SmallWorldParser {
  constructor() {
    this.gameState = {
      round: 1,
      totalRounds: 10,
      phase: 'conquest', // conquest, redeployment, scoring
      myRace: null,
      myPower: null,
      myTokens: {
        active: 0,
        inHand: 0,
        onBoard: 0
      },
      myRegions: [],
      myScore: 0,
      inDecline: false,
      declineRace: null,
      availableRaces: [],    // Race/power combos available
      opponents: [],
      mapRegions: {},
      yourTurn: false
    };

    // Common races
    this.races = [
      'amazons', 'dwarves', 'elves', 'giants', 'halflings', 'humans',
      'orcs', 'ratmen', 'skeletons', 'sorcerers', 'tritons', 'trolls', 'wizards'
    ];

    // Common powers
    this.powers = [
      'alchemist', 'berserk', 'bivouacking', 'commando', 'diplomat',
      'dragonmaster', 'flying', 'forest', 'fortified', 'heroic',
      'hill', 'merchant', 'mounted', 'pillaging', 'seafaring',
      'spirit', 'stout', 'swamp', 'underworld', 'wealthy'
    ];

    // Region types
    this.regionTypes = ['farmland', 'forest', 'hill', 'mountain', 'swamp', 'sea', 'lake'];
  }

  parse(data) {
    if (!data || typeof data !== 'object') return null;
    this.logForTraining('smallworld', data);
    this.extractGameState(data);
    return this.gameState;
  }

  extractGameState(data) {
    const dataStr = JSON.stringify(data).toLowerCase();

    // Round detection
    if (data.round !== undefined || data.turn !== undefined) {
      this.gameState.round = parseInt(data.round || data.turn) || 1;
    }
    if (data.totalRounds !== undefined || data.maxTurns !== undefined) {
      this.gameState.totalRounds = parseInt(data.totalRounds || data.maxTurns) || 10;
    }

    // Phase detection
    if (dataStr.includes('conquer') || dataStr.includes('attack')) {
      this.gameState.phase = 'conquest';
    } else if (dataStr.includes('redeploy') || dataStr.includes('fortify')) {
      this.gameState.phase = 'redeployment';
    } else if (dataStr.includes('score') || dataStr.includes('coin')) {
      this.gameState.phase = 'scoring';
    }

    // Turn detection
    if (data.active_player !== undefined || data.activePlayer !== undefined) {
      const activePlayer = data.active_player || data.activePlayer;
      this.gameState.yourTurn = this.isCurrentPlayer(activePlayer, data);
    }

    // Current race and power
    if (data.race || data.myRace || data.activeRace) {
      this.gameState.myRace = (data.race || data.myRace || data.activeRace).toLowerCase();
    }
    if (data.power || data.myPower || data.activePower) {
      this.gameState.myPower = (data.power || data.myPower || data.activePower).toLowerCase();
    }

    // Tokens
    if (data.tokens || data.myTokens) {
      this.parseTokens(data.tokens || data.myTokens);
    }

    // Regions controlled
    if (data.regions || data.myRegions || data.territories) {
      this.gameState.myRegions = this.parseRegions(data.regions || data.myRegions || data.territories);
    }

    // Score
    if (data.score !== undefined || data.coins !== undefined || data.myScore !== undefined) {
      this.gameState.myScore = parseInt(data.score || data.coins || data.myScore) || 0;
    }

    // Decline status
    if (data.inDecline !== undefined || data.declined !== undefined) {
      this.gameState.inDecline = data.inDecline || data.declined || false;
    }
    if (data.declineRace) {
      this.gameState.declineRace = data.declineRace.toLowerCase();
    }

    // Available race/power combos
    if (data.availableRaces || data.racePowerCombos || data.combos) {
      this.gameState.availableRaces = this.parseRaceCombos(
        data.availableRaces || data.racePowerCombos || data.combos
      );
    }

    // Map state
    if (data.map || data.board || data.mapRegions) {
      this.gameState.mapRegions = data.map || data.board || data.mapRegions;
    }

    // Opponents
    if (data.players || data.opponents) {
      this.extractOpponents(data);
    }
  }

  parseTokens(tokens) {
    if (typeof tokens === 'number') {
      this.gameState.myTokens.active = tokens;
    } else if (typeof tokens === 'object') {
      this.gameState.myTokens.active = tokens.active || tokens.available || 0;
      this.gameState.myTokens.inHand = tokens.inHand || tokens.hand || 0;
      this.gameState.myTokens.onBoard = tokens.onBoard || tokens.deployed || 0;
    }
  }

  parseRegions(regions) {
    if (!regions) return [];
    if (!Array.isArray(regions)) {
      regions = Object.values(regions);
    }
    return regions.map(r => ({
      id: r.id || r.region_id,
      name: r.name,
      type: r.type || r.terrain,
      tokens: r.tokens || r.units || 0,
      hasLair: r.hasLair || r.lair || false,
      hasFortress: r.hasFortress || r.fortress || false,
      hasMountain: r.hasMountain || r.mountain || false,
      adjacent: r.adjacent || r.neighbors || []
    }));
  }

  parseRaceCombos(combos) {
    if (!combos) return [];
    if (!Array.isArray(combos)) {
      combos = Object.values(combos);
    }
    return combos.map((combo, index) => ({
      race: combo.race?.toLowerCase() || 'unknown',
      power: combo.power?.toLowerCase() || 'unknown',
      tokens: combo.tokens || combo.baseTokens || 0,
      coins: combo.coins || index,  // Coins on combo from previous passes
      position: index
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
        score: p.score || p.coins || 0,
        race: p.race?.toLowerCase(),
        power: p.power?.toLowerCase(),
        regions: p.regions ? this.parseRegions(p.regions) : [],
        regionCount: p.regionCount || 0,
        inDecline: p.inDecline || false,
        declineRace: p.declineRace?.toLowerCase()
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
      totalRounds: 10,
      phase: 'conquest',
      myRace: null,
      myPower: null,
      myTokens: { active: 0, inHand: 0, onBoard: 0 },
      myRegions: [],
      myScore: 0,
      inDecline: false,
      declineRace: null,
      availableRaces: [],
      opponents: [],
      mapRegions: {},
      yourTurn: false
    };
  }
}

if (typeof window !== 'undefined') {
  window.SmallWorldParser = SmallWorldParser;
}
