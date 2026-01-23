/**
 * Azul Game Parser
 * Transforms BGA WebSocket data into normalized game state
 */

class AzulParser {
  constructor() {
    this.gameState = {
      round: 1,
      phase: 'drafting', // drafting, placing, scoring
      factories: [],      // Array of factory displays with tiles
      centerPool: [],     // Tiles in the center
      myBoard: {
        patternLines: [[], [], [], [], []], // 5 pattern lines (1-5 slots)
        wall: [],          // 5x5 wall grid
        floorLine: [],     // Penalty tiles
        score: 0
      },
      opponents: [],
      firstPlayerToken: null, // Who has/took first player
      tilesRemaining: true,
      yourTurn: false
    };

    // Tile colors
    this.tileColors = ['blue', 'yellow', 'red', 'black', 'white', 'cyan'];

    // Wall pattern (standard Azul)
    this.wallPattern = [
      ['blue', 'yellow', 'red', 'black', 'white'],
      ['white', 'blue', 'yellow', 'red', 'black'],
      ['black', 'white', 'blue', 'yellow', 'red'],
      ['red', 'black', 'white', 'blue', 'yellow'],
      ['yellow', 'red', 'black', 'white', 'blue']
    ];
  }

  parse(data) {
    if (!data || typeof data !== 'object') return null;
    this.logForTraining('azul', data);
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
    if (dataStr.includes('draft') || dataStr.includes('select') || dataStr.includes('take')) {
      this.gameState.phase = 'drafting';
    } else if (dataStr.includes('place') || dataStr.includes('pattern')) {
      this.gameState.phase = 'placing';
    } else if (dataStr.includes('score') || dataStr.includes('wall')) {
      this.gameState.phase = 'scoring';
    }

    // Turn detection
    if (data.active_player !== undefined || data.activePlayer !== undefined) {
      const activePlayer = data.active_player || data.activePlayer;
      this.gameState.yourTurn = this.isCurrentPlayer(activePlayer, data);
    }

    // Factory displays
    if (data.factories || data.factoryDisplays) {
      this.gameState.factories = this.parseFactories(data.factories || data.factoryDisplays);
    }

    // Center pool
    if (data.center || data.centerPool || data.middle) {
      this.gameState.centerPool = this.parseTiles(data.center || data.centerPool || data.middle);
    }

    // Player board
    if (data.board || data.myBoard || data.playerBoard) {
      this.parsePlayerBoard(data.board || data.myBoard || data.playerBoard);
    }

    // Pattern lines
    if (data.patternLines || data.lines) {
      this.gameState.myBoard.patternLines = this.parsePatternLines(data.patternLines || data.lines);
    }

    // Wall
    if (data.wall) {
      this.gameState.myBoard.wall = this.parseWall(data.wall);
    }

    // Floor line
    if (data.floorLine || data.floor || data.penalty) {
      this.gameState.myBoard.floorLine = this.parseTiles(data.floorLine || data.floor || data.penalty);
    }

    // Score
    if (data.score !== undefined || data.myScore !== undefined) {
      this.gameState.myBoard.score = parseInt(data.score || data.myScore) || 0;
    }

    // First player token
    if (data.firstPlayer !== undefined) {
      this.gameState.firstPlayerToken = data.firstPlayer;
    }

    // Opponents
    if (data.players || data.opponents) {
      this.extractOpponents(data);
    }

    // Check if tiles remain
    this.gameState.tilesRemaining = this.gameState.factories.some(f => f.length > 0) ||
      this.gameState.centerPool.length > 0;
  }

  parseFactories(factories) {
    if (!factories) return [];
    if (!Array.isArray(factories)) {
      factories = Object.values(factories);
    }
    return factories.map(f => this.parseTiles(f));
  }

  parseTiles(tiles) {
    if (!tiles) return [];
    if (!Array.isArray(tiles)) {
      tiles = typeof tiles === 'object' ? Object.values(tiles) : [tiles];
    }
    return tiles.map(t => {
      if (typeof t === 'string') return t.toLowerCase();
      return (t.color || t.type || t.tile || 'unknown').toLowerCase();
    });
  }

  parsePatternLines(lines) {
    if (!lines) return [[], [], [], [], []];
    if (!Array.isArray(lines)) {
      lines = Object.values(lines);
    }
    return lines.map(line => this.parseTiles(line));
  }

  parseWall(wall) {
    if (!wall) return [];
    // Wall is typically a 5x5 grid
    if (Array.isArray(wall) && wall.length === 5) {
      return wall.map(row => this.parseTiles(row));
    }
    return wall;
  }

  parsePlayerBoard(board) {
    if (board.patternLines) {
      this.gameState.myBoard.patternLines = this.parsePatternLines(board.patternLines);
    }
    if (board.wall) {
      this.gameState.myBoard.wall = this.parseWall(board.wall);
    }
    if (board.floorLine || board.floor) {
      this.gameState.myBoard.floorLine = this.parseTiles(board.floorLine || board.floor);
    }
    if (board.score !== undefined) {
      this.gameState.myBoard.score = parseInt(board.score) || 0;
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
        patternLines: p.patternLines ? this.parsePatternLines(p.patternLines) : null,
        wall: p.wall ? this.parseWall(p.wall) : null,
        floorLine: p.floorLine ? this.parseTiles(p.floorLine) : []
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
      factories: [],
      centerPool: [],
      myBoard: {
        patternLines: [[], [], [], [], []],
        wall: [],
        floorLine: [],
        score: 0
      },
      opponents: [],
      firstPlayerToken: null,
      tilesRemaining: true,
      yourTurn: false
    };
  }
}

if (typeof window !== 'undefined') {
  window.AzulParser = AzulParser;
}
