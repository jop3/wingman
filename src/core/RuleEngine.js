/**
 * Universal Rule Engine for Board Game Assistant
 * Works with any game's JSON rule definition
 */

class RuleEngine {
  constructor(gameTemplate) {
    this.template = gameTemplate;
    this.trackers = {};
    this.variantTrackers = {};
    this.activeVariant = gameTemplate.variant || 'base';
    this.initializeTrackers();
  }

  initializeTrackers() {
    // Initialize base trackers
    for (const [name, config] of Object.entries(this.template.trackers)) {
      this.trackers[name] = this.createTracker(config);
    }

    // Initialize variant-specific trackers if applicable
    if (this.template.variantTrackers && this.template.variantTrackers[this.activeVariant]) {
      for (const [name, config] of Object.entries(this.template.variantTrackers[this.activeVariant])) {
        this.variantTrackers[name] = this.createTracker(config);
      }
    }
  }

  createTracker(config) {
    switch (config.type) {
      case 'counter':
        return { value: config.initial || 0, type: 'counter' };
      case 'cumulative':
        return { value: 0, type: 'cumulative' };
      case 'list':
        return { items: [], type: 'list' };
      case 'collection':
        return { items: {}, type: 'collection' };
      case 'set_completion':
        return { count: 0, target: config.target, type: 'set_completion' };
      default:
        return { value: null, type: config.type };
    }
  }

  updateTracker(name, value) {
    if (this.trackers[name]) {
      const tracker = this.trackers[name];
      if (tracker.type === 'counter' || tracker.type === 'cumulative') {
        tracker.value = value;
      } else if (tracker.type === 'list') {
        tracker.items.push(value);
      }
    }
  }

  /**
   * Evaluate a condition against current game state
   */
  evaluateCondition(condition, context) {
    if (!condition) return true;

    // Handle logical operators
    if (condition.and) {
      return condition.and.every(c => this.evaluateCondition(c, context));
    }
    if (condition.or) {
      return condition.or.some(c => this.evaluateCondition(c, context));
    }

    // Handle single condition
    const [path, operation] = Object.entries(condition)[0];
    const [operator, expectedValue] = Object.entries(operation)[0];
    
    const actualValue = this.resolveValue(path, context);
    
    return this.compare(actualValue, operator, expectedValue, context);
  }

  /**
   * Resolve a value from a path like "tracker.trains_remaining"
   */
  resolveValue(path, context) {
    const parts = path.split('.');
    let value = context;

    // Special handling for tracker references
    if (parts[0] === 'tracker' && this.trackers[parts[1]]) {
      value = this.trackers[parts[1]];
      // Navigate remaining path
      for (let i = 2; i < parts.length; i++) {
        if (value === undefined || value === null) return null;
        value = value[parts[i]];
      }
      return value;
    }

    // Normal path resolution
    for (const part of parts) {
      if (value === undefined || value === null) return null;
      value = value[part];
    }

    return value;
  }

  /**
   * Compare values with different operators
   */
  compare(actual, operator, expected, context) {
    // Resolve expected value if it's a reference
    if (typeof expected === 'string' && expected.includes('.')) {
      expected = this.resolveValue(expected, context);
    }

    switch (operator) {
      case 'equals':
        return actual === expected;
      case 'lessThan':
        return actual < expected;
      case 'greaterThan':
        return actual > expected;
      case 'lessThanOrEqual':
        return actual <= expected;
      case 'greaterThanOrEqual':
        return actual >= expected;
      case 'in':
        return Array.isArray(expected) && expected.includes(actual);
      case 'contains':
        return actual && actual.includes(expected);
      case 'containsAny':
        return Array.isArray(expected) && expected.some(item => 
          actual && actual.includes(item)
        );
      default:
        console.warn(`Unknown operator: ${operator}`);
        return false;
    }
  }

  /**
   * Calculate derived values
   */
  calculate(calcDef, context) {
    if (!calcDef) return {};

    const results = {};
    for (const [key, def] of Object.entries(calcDef)) {
      if (def.expression) {
        // Simple expression evaluation
        // In production, use a safe eval library
        results[key] = this.evaluateExpression(def.expression, context, def);
      }
    }
    return results;
  }

  /**
   * Simple expression evaluator
   */
  evaluateExpression(expression, context, extraData) {
    // This is simplified - in production use a proper expression parser
    try {
      // Replace references with actual values
      let processedExpr = expression;
      
      // Find all references like {variable}
      const refs = expression.match(/\{([^}]+)\}/g) || [];
      for (const ref of refs) {
        const varName = ref.slice(1, -1);
        const value = this.resolveValue(varName, context) || extraData[varName];
        processedExpr = processedExpr.replace(ref, value);
      }

      // For safety, only allow basic arithmetic
      if (/^[\d\s+\-*/().]+$/.test(processedExpr)) {
        return eval(processedExpr);
      }
      
      return processedExpr;
    } catch (e) {
      console.error('Expression evaluation error:', e);
      return null;
    }
  }

  /**
   * Get all recommendations for current game state
   */
  getRecommendations(gameState, options = {}) {
    const context = {
      ...gameState,
      tracker: this.trackers,
      variantTracker: this.variantTrackers,
      ...options
    };

    // Get base rules
    let applicableRules = this.template.rules || [];

    // Add variant-specific rules
    if (this.template.variantRules && this.template.variantRules[this.activeVariant]) {
      applicableRules = [...applicableRules, ...this.template.variantRules[this.activeVariant]];
    }

    // Add phase-specific rules if applicable
    if (gameState.phase === 'endgame' && this.template.endgameRules) {
      applicableRules = [...applicableRules, ...this.template.endgameRules];
    }

    // Evaluate all rules
    const activeRules = applicableRules
      .filter(rule => {
        // Check if rule applies to current phase
        if (rule.phase && rule.phase !== gameState.phase) {
          return false;
        }
        return this.evaluateCondition(rule.conditions, context);
      })
      .map(rule => {
        const calculatedValues = rule.calculate ? 
          this.calculate(rule.calculate, context) : {};
        
        return {
          ...rule,
          calculatedValues,
          message: this.interpolateMessage(rule.action.message, {
            ...context,
            ...calculatedValues
          })
        };
      })
      .sort((a, b) => b.priority - a.priority);

    return activeRules;
  }

  /**
   * Interpolate variables in message strings
   */
  interpolateMessage(message, context) {
    if (!message) return '';
    
    return message.replace(/\{([^}]+)\}/g, (match, path) => {
      const value = this.resolveValue(path, context);
      return value !== null && value !== undefined ? value : match;
    });
  }

  /**
   * Get scarcity alerts
   */
  getScarcityAlerts(gameState) {
    if (!this.template.scarcityAlerts) return [];

    const context = {
      ...gameState,
      tracker: this.trackers,
      remaining: gameState.remaining || {}
    };

    return this.template.scarcityAlerts
      .filter(alert => this.evaluateCondition(alert.condition, context))
      .map(alert => ({
        ...alert,
        message: this.interpolateMessage(alert.message, context)
      }));
  }

  /**
   * Change active variant
   */
  setVariant(variantName) {
    if (this.template.supportedVariants && this.template.supportedVariants[variantName]) {
      this.activeVariant = variantName;
      this.initializeTrackers();
      return true;
    }
    return false;
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RuleEngine;
}
