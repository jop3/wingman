/**
 * Game Detector
 * Identifierar vilket spel som spelas på Board Game Arena
 */

class GameDetector {
  constructor() {
    this.detectedGame = null;
    this.detectedVariant = null;
    this.confidence = 0;
    this.tableId = null;
  }
  
  /**
   * Detect game from WebSocket message
   */
  detectFromMessage(message) {
    // BGA WebSocket messages har ofta game identifiers
    
    // Method 1: Direct game ID in message
    if (message.game) {
      return this.identifyGame(message.game, message.variant);
    }
    
    // Method 2: Table information
    if (message.table) {
      this.tableId = message.table;
    }
    
    // Method 3: Game-specific message patterns
    const gamePatterns = {
      sushigo: [
        { key: 'pudding', confidence: 0.9 },
        { key: 'maki', confidence: 0.8 },
        { key: 'wasabi', confidence: 0.8 },
        { key: 'chopsticks', confidence: 0.7 },
        { pattern: /tempura|sashimi|dumpling/i, confidence: 0.8 }
      ],
      
      tickettoride: [
        { key: 'trains', confidence: 0.8 },
        { key: 'routes', confidence: 0.8 },
        { key: 'destinations', confidence: 0.9 },
        { key: 'stations', confidence: 0.7 },
        { pattern: /locomotive|tunnel|ferry/i, confidence: 0.8 }
      ],
      
      wingspan: [
        { key: 'birds', confidence: 0.7 },
        { key: 'eggs', confidence: 0.7 },
        { key: 'food', confidence: 0.5 }, // Common word, low confidence
        { key: 'habitat', confidence: 0.8 },
        { key: 'nectar', confidence: 0.9 },
        { pattern: /forest|grassland|wetland/i, confidence: 0.8 },
        { pattern: /tuck|cache/i, confidence: 0.9 }
      ],

      azul: [
        { key: 'factory', confidence: 0.7 },
        { key: 'patternline', confidence: 0.9 },
        { key: 'floorline', confidence: 0.9 },
        { key: 'wall', confidence: 0.5 },
        { pattern: /firstplayer.*marker/i, confidence: 0.8 },
        { pattern: /tile.*color/i, confidence: 0.7 }
      ],

      bunnykingdom: [
        { key: 'bunny', confidence: 0.8 },
        { key: 'fief', confidence: 0.9 },
        { key: 'parchment', confidence: 0.9 },
        { key: 'territory', confidence: 0.6 },
        { pattern: /tower|city.*strength/i, confidence: 0.8 },
        { pattern: /golden.*carrot/i, confidence: 0.95 }
      ],

      gnomehollow: [
        { key: 'gnome', confidence: 0.9 },
        { key: 'mushroom', confidence: 0.7 },
        { key: 'berries', confidence: 0.7 },
        { pattern: /worker.*placement/i, confidence: 0.6 },
        { pattern: /spring|summer|fall|winter.*season/i, confidence: 0.8 }
      ],

      smallworld: [
        { key: 'decline', confidence: 0.8 },
        { key: 'conquest', confidence: 0.7 },
        { pattern: /race.*power/i, confidence: 0.9 },
        { pattern: /amazons|dwarves|elves|orcs|trolls|wizards/i, confidence: 0.85 },
        { pattern: /flying|mounted|commando|diplomat/i, confidence: 0.8 },
        { key: 'tokens', confidence: 0.5 }
      ],

      catan: [
        { key: 'settlement', confidence: 0.8 },
        { key: 'robber', confidence: 0.9 },
        { pattern: /brick|lumber|wool|grain|ore/i, confidence: 0.7 },
        { pattern: /longest.*road/i, confidence: 0.95 },
        { pattern: /largest.*army/i, confidence: 0.95 },
        { key: 'knight', confidence: 0.7 },
        { key: 'harbor', confidence: 0.8 }
      ]
    };
    
    // Check patterns
    for (const [gameId, patterns] of Object.entries(gamePatterns)) {
      let matchConfidence = 0;
      let matchCount = 0;
      
      for (const pattern of patterns) {
        if (this.messageMatchesPattern(message, pattern)) {
          matchConfidence += pattern.confidence;
          matchCount++;
        }
      }
      
      // Average confidence if multiple matches
      if (matchCount > 0) {
        const avgConfidence = matchConfidence / matchCount;
        
        if (avgConfidence > this.confidence) {
          this.detectedGame = gameId;
          this.confidence = avgConfidence;
          
          // Detect variant if possible
          this.detectVariant(message, gameId);
        }
      }
    }
    
    return this.getDetectedGame();
  }
  
  /**
   * Detect game from URL
   */
  detectFromURL(url) {
    // BGA URLs: https://boardgamearena.com/table?table=123456789
    // Or: https://boardgamearena.com/1/sushigo?table=123456789
    
    const urlPatterns = {
      sushigo: /\/sushigo/i,
      tickettoride: /\/tickettoride/i,
      wingspan: /\/wingspan/i,
      sevenwonders: /\/sevenwonders/i,
      splendor: /\/splendor/i,
      carcassonne: /\/carcassonne/i,
      azul: /\/azul/i,
      bunnykingdom: /\/bunnykingdom/i,
      gnomehollow: /\/gnomehollow/i,
      smallworld: /\/smallworld/i,
      catan: /\/catan/i
    };
    
    for (const [gameId, pattern] of Object.entries(urlPatterns)) {
      if (pattern.test(url)) {
        this.detectedGame = gameId;
        this.confidence = 1.0; // High confidence from URL
        return this.getDetectedGame();
      }
    }
    
    // Extract table ID from URL
    const tableMatch = url.match(/table=(\d+)/);
    if (tableMatch) {
      this.tableId = tableMatch[1];
    }
    
    return null;
  }
  
  /**
   * Check if message matches pattern
   */
  messageMatchesPattern(message, pattern) {
    const messageStr = JSON.stringify(message).toLowerCase();
    
    if (pattern.key) {
      return messageStr.includes(pattern.key.toLowerCase());
    }
    
    if (pattern.pattern) {
      return pattern.pattern.test(messageStr);
    }
    
    return false;
  }
  
  /**
   * Detect game variant
   */
  detectVariant(message, gameId) {
    const variantPatterns = {
      tickettoride: {
        'usa': /usa|america/i,
        'europe': /europe|stations|tunnels/i,
        'nordic': /nordic/i,
        'asia': /asia/i,
        'india': /india/i
      },
      wingspan: {
        'base': /^((?!europe|oceania|asia).)*$/i,
        'european': /europe/i,
        'oceanian': /oceania/i,
        'asian': /asia/i
      }
    };
    
    const patterns = variantPatterns[gameId];
    if (!patterns) return;
    
    const messageStr = JSON.stringify(message);
    
    for (const [variant, pattern] of Object.entries(patterns)) {
      if (pattern.test(messageStr)) {
        this.detectedVariant = variant;
        break;
      }
    }
  }
  
  /**
   * Identify game by direct ID
   */
  identifyGame(gameId, variant = null) {
    // Map BGA game IDs to our internal IDs
    const gameMapping = {
      'sushigo': 'sushigo',
      'tickettoride': 'tickettoride',
      'wingspan': 'wingspan',
      '7wonders': 'sevenwonders',
      'splendor': 'splendor',
      'carcassonne': 'carcassonne',
      'azul': 'azul',
      'bunnykingdom': 'bunnykingdom',
      'gnomehollow': 'gnomehollow',
      'smallworld': 'smallworld',
      'catan': 'catan',
      'catanbase': 'catan',
      'settlersofcatan': 'catan'
    };
    
    const mappedId = gameMapping[gameId.toLowerCase()] || gameId.toLowerCase();
    
    this.detectedGame = mappedId;
    this.confidence = 1.0;
    
    if (variant) {
      this.detectedVariant = variant;
    }
    
    return this.getDetectedGame();
  }
  
  /**
   * Get detected game info
   */
  getDetectedGame() {
    if (!this.detectedGame) return null;
    
    return {
      gameId: this.detectedGame,
      variant: this.detectedVariant || 'base',
      confidence: this.confidence,
      tableId: this.tableId
    };
  }
  
  /**
   * Check if game is supported
   */
  isSupported(gameId) {
    const supportedGames = [
      'sushigo', 'tickettoride', 'wingspan',
      'azul', 'bunnykingdom', 'gnomehollow', 'smallworld', 'catan'
    ];
    return supportedGames.includes(gameId);
  }
  
  /**
   * Reset detection
   */
  reset() {
    this.detectedGame = null;
    this.detectedVariant = null;
    this.confidence = 0;
    this.tableId = null;
  }
  
  /**
   * Get game display name
   */
  getDisplayName(gameId) {
    const displayNames = {
      'sushigo': 'Sushi Go',
      'tickettoride': 'Ticket to Ride',
      'wingspan': 'Wingspan',
      'sevenwonders': '7 Wonders',
      'splendor': 'Splendor',
      'carcassonne': 'Carcassonne',
      'azul': 'Azul',
      'bunnykingdom': 'Bunny Kingdom',
      'gnomehollow': 'Gnome Hollow',
      'smallworld': 'Small World',
      'catan': 'Settlers of Catan'
    };

    return displayNames[gameId] || gameId;
  }
}

// Export for use in content script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GameDetector;
}
