/**
 * Opponent Analyzer - Tracks and predicts opponent behavior
 * Works with JSON-defined patterns for each game
 */

class OpponentAnalyzer {
  constructor(opponentPatterns) {
    this.patterns = opponentPatterns;
    this.opponentProfiles = new Map(); // player_id -> profile
    this.actionHistory = new Map(); // player_id -> [actions]
  }

  /**
   * Track an opponent's action
   */
  trackAction(playerId, action) {
    if (!this.actionHistory.has(playerId)) {
      this.actionHistory.set(playerId, []);
      this.opponentProfiles.set(playerId, {
        playerId,
        classifiedStrategy: null,
        confidence: 0,
        tendencies: {},
        threatLevel: 'unknown',
        predictedNextMoves: []
      });
    }

    const history = this.actionHistory.get(playerId);
    history.push({
      ...action,
      timestamp: Date.now()
    });

    // Keep only recent history (last 20 actions)
    if (history.length > 20) {
      history.shift();
    }

    // Re-analyze after each action
    this.analyzeOpponent(playerId);
  }

  /**
   * Analyze opponent based on their action history
   */
  analyzeOpponent(playerId) {
    const history = this.actionHistory.get(playerId);
    const profile = this.opponentProfiles.get(playerId);

    if (!history || history.length < 3) {
      profile.confidence = 0;
      return; // Not enough data
    }

    // Detect patterns
    const detectedPatterns = this.detectPatterns(history);
    
    // Classify strategy
    const strategyScores = this.calculateStrategyScores(detectedPatterns);
    const topStrategy = this.getTopStrategy(strategyScores);

    // Update profile
    profile.classifiedStrategy = topStrategy.name;
    profile.confidence = topStrategy.score;
    profile.tendencies = detectedPatterns;
    profile.threatLevel = this.assessThreatLevel(profile, history);
    profile.predictedNextMoves = this.predictNextMoves(profile, history);

    this.opponentProfiles.set(playerId, profile);
  }

  /**
   * Detect behavioral patterns from action history
   */
  detectPatterns(history) {
    const patterns = {};

    // Run all pattern detectors defined in JSON
    for (const [patternName, detector] of Object.entries(this.patterns.detectors)) {
      patterns[patternName] = this.evaluatePattern(detector, history);
    }

    return patterns;
  }

  /**
   * Evaluate a single pattern detector
   */
  evaluatePattern(detector, history) {
    const recentActions = history.slice(-detector.sample_size || -10);
    
    switch (detector.type) {
      case 'frequency':
        return this.calculateFrequency(recentActions, detector.match);
      
      case 'sequence':
        return this.detectSequence(recentActions, detector.sequence);
      
      case 'ratio':
        return this.calculateRatio(recentActions, detector.numerator, detector.denominator);
      
      case 'trend':
        return this.detectTrend(history, detector.metric);
      
      case 'average':
        return this.calculateAverage(recentActions, detector.field);
      
      default:
        return null;
    }
  }

  calculateFrequency(actions, matchCriteria) {
    const matches = actions.filter(action => this.matchesCriteria(action, matchCriteria));
    return matches.length / Math.max(actions.length, 1);
  }

  detectSequence(actions, sequence) {
    // Check if a specific sequence of actions occurred
    let sequenceCount = 0;
    for (let i = 0; i <= actions.length - sequence.length; i++) {
      const slice = actions.slice(i, i + sequence.length);
      if (slice.every((action, idx) => this.matchesCriteria(action, sequence[idx]))) {
        sequenceCount++;
      }
    }
    return sequenceCount > 0;
  }

  calculateRatio(actions, numeratorCriteria, denominatorCriteria) {
    const numerator = actions.filter(a => this.matchesCriteria(a, numeratorCriteria)).length;
    const denominator = actions.filter(a => this.matchesCriteria(a, denominatorCriteria)).length;
    return denominator > 0 ? numerator / denominator : 0;
  }

  detectTrend(history, metric) {
    if (history.length < 5) return 'stable';
    
    const recent = history.slice(-5).map(a => a[metric] || 0);
    const earlier = history.slice(-10, -5).map(a => a[metric] || 0);
    
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;
    
    if (recentAvg > earlierAvg * 1.2) return 'increasing';
    if (recentAvg < earlierAvg * 0.8) return 'decreasing';
    return 'stable';
  }

  calculateAverage(actions, field) {
    const values = actions.map(a => a[field]).filter(v => v !== undefined);
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  }

  matchesCriteria(action, criteria) {
    for (const [key, value] of Object.entries(criteria)) {
      if (action[key] !== value) return false;
    }
    return true;
  }

  /**
   * Calculate strategy scores based on detected patterns
   */
  calculateStrategyScores(patterns) {
    const scores = {};

    for (const [strategyName, strategy] of Object.entries(this.patterns.strategies)) {
      let score = 0;
      let maxScore = 0;

      for (const indicator of strategy.indicators) {
        const patternValue = patterns[indicator.pattern];
        maxScore += indicator.weight;

        if (patternValue !== null && patternValue !== undefined) {
          if (indicator.threshold) {
            if (this.meetsThreshold(patternValue, indicator.threshold)) {
              score += indicator.weight;
            }
          } else {
            // Direct value contribution
            score += patternValue * indicator.weight;
          }
        }
      }

      scores[strategyName] = maxScore > 0 ? score / maxScore : 0;
    }

    return scores;
  }

  meetsThreshold(value, threshold) {
    if (threshold.min !== undefined && value < threshold.min) return false;
    if (threshold.max !== undefined && value > threshold.max) return false;
    if (threshold.equals !== undefined && value !== threshold.equals) return false;
    return true;
  }

  getTopStrategy(scores) {
    let topName = 'unknown';
    let topScore = 0;

    for (const [name, score] of Object.entries(scores)) {
      if (score > topScore) {
        topScore = score;
        topName = name;
      }
    }

    return { name: topName, score: topScore };
  }

  /**
   * Assess threat level based on profile and game state
   */
  assessThreatLevel(profile, history) {
    const threatRules = this.patterns.threatAssessment || [];
    
    for (const rule of threatRules) {
      if (rule.strategy && rule.strategy !== profile.classifiedStrategy) continue;
      
      let matches = true;
      for (const [pattern, threshold] of Object.entries(rule.conditions || {})) {
        if (!this.meetsThreshold(profile.tendencies[pattern], threshold)) {
          matches = false;
          break;
        }
      }
      
      if (matches) return rule.level;
    }
    
    return 'medium';
  }

  /**
   * Predict opponent's next likely moves
   */
  predictNextMoves(profile, history) {
    const predictions = [];
    const strategyDef = this.patterns.strategies[profile.classifiedStrategy];
    
    if (!strategyDef || !strategyDef.predictedBehaviors) return predictions;

    for (const behavior of strategyDef.predictedBehaviors) {
      predictions.push({
        action: behavior.action,
        probability: behavior.probability || 0.5,
        reasoning: behavior.reasoning
      });
    }

    return predictions;
  }

  /**
   * Get counter-strategies for an opponent
   */
  getCounterStrategies(playerId) {
    const profile = this.opponentProfiles.get(playerId);
    if (!profile || !profile.classifiedStrategy) return [];

    const strategyDef = this.patterns.strategies[profile.classifiedStrategy];
    return strategyDef?.counterStrategies || [];
  }

  /**
   * Get all opponent profiles
   */
  getAllProfiles() {
    return Array.from(this.opponentProfiles.values());
  }

  /**
   * Get specific opponent profile
   */
  getProfile(playerId) {
    return this.opponentProfiles.get(playerId);
  }

  /**
   * Get recommendations based on opponent analysis
   */
  getOpponentBasedRecommendations(gameState) {
    const recommendations = [];
    
    for (const profile of this.opponentProfiles.values()) {
      // High threat opponents
      if (profile.threatLevel === 'critical' || profile.threatLevel === 'high') {
        const counterStrategies = this.getCounterStrategies(profile.playerId);
        
        for (const counter of counterStrategies) {
          recommendations.push({
            priority: counter.priority || 70,
            opponent: profile.playerId,
            action: {
              recommend: counter.action,
              message: `${profile.playerId}: ${counter.description}`,
              alertLevel: profile.threatLevel === 'critical' ? 'high' : 'medium',
              reasoning: `Motverka ${profile.classifiedStrategy}-strategi`
            }
          });
        }
      }

      // Predicted moves
      for (const prediction of profile.predictedNextMoves) {
        if (prediction.probability > 0.7) {
          recommendations.push({
            priority: 60,
            opponent: profile.playerId,
            action: {
              recommend: 'prepare_counter',
              message: `${profile.playerId} kommer troligen: ${prediction.action}`,
              alertLevel: 'info',
              reasoning: prediction.reasoning
            }
          });
        }
      }
    }

    return recommendations.sort((a, b) => b.priority - a.priority);
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OpponentAnalyzer;
}
