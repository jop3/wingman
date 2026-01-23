/**
 * WebSocket Interceptor
 * Intercepts och parsar WebSocket-trafik från Board Game Arena
 */

class WebSocketInterceptor {
  constructor(onMessageCallback) {
    this.onMessageCallback = onMessageCallback;
    this.originalWebSocket = null;
    this.activeConnections = new Set();
    this.messageBuffer = [];
    this.isTrainingMode = false;
    
    this.inject();
  }
  
  /**
   * Injicera WebSocket interceptor i page context
   */
  inject() {
    console.log('🔌 WebSocket Interceptor: Injecting...');
    
    // Save original WebSocket
    this.originalWebSocket = window.WebSocket;
    
    // Create proxy WebSocket
    const self = this;
    
    window.WebSocket = new Proxy(window.WebSocket, {
      construct(target, args) {
        console.log('WebSocket connection created:', args[0]);
        
        // Create actual WebSocket connection
        const ws = new target(...args);
        self.activeConnections.add(ws);
        
        // Intercept messages
        const originalAddEventListener = ws.addEventListener.bind(ws);
        
        ws.addEventListener = function(type, listener, options) {
          if (type === 'message') {
            // Wrap listener to intercept messages
            const wrappedListener = function(event) {
              self.handleMessage(event.data, ws);
              // Call original listener
              return listener.call(this, event);
            };
            return originalAddEventListener(type, wrappedListener, options);
          }
          return originalAddEventListener(type, listener, options);
        };
        
        // Intercept onmessage setter
        let originalOnMessage = null;
        Object.defineProperty(ws, 'onmessage', {
          get() {
            return originalOnMessage;
          },
          set(handler) {
            originalOnMessage = handler;
            const wrappedHandler = function(event) {
              self.handleMessage(event.data, ws);
              if (handler) {
                return handler.call(this, event);
              }
            };
            // Set on actual WebSocket
            Object.getOwnPropertyDescriptor(target.prototype, 'onmessage')
              .set.call(ws, wrappedHandler);
          }
        });
        
        // Handle connection close
        ws.addEventListener('close', () => {
          self.activeConnections.delete(ws);
          console.log('WebSocket connection closed');
        });
        
        return ws;
      }
    });
    
    console.log('✅ WebSocket Interceptor: Injected successfully');
  }
  
  /**
   * Handle intercepted WebSocket message
   */
  handleMessage(rawData, ws) {
    try {
      // BGA sends JSON messages
      let data;
      try {
        data = JSON.parse(rawData);
      } catch (e) {
        // Not JSON, might be binary or other format
        return;
      }
      
      // Log in training mode
      if (this.isTrainingMode) {
        this.logTrainingData(data);
      }
      
      // Buffer message
      this.messageBuffer.push({
        data,
        timestamp: Date.now(),
        url: ws.url
      });
      
      // Keep only last 50 messages
      if (this.messageBuffer.length > 50) {
        this.messageBuffer.shift();
      }
      
      // Call callback
      if (this.onMessageCallback) {
        this.onMessageCallback(data);
      }
      
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  }
  
  /**
   * Log data for training mode (creating game templates)
   */
  logTrainingData(data) {
    // Send to background script for storage
    chrome.runtime.sendMessage({
      type: 'TRAINING_MODE_LOG',
      data: {
        message: data,
        timestamp: Date.now()
      }
    });
  }
  
  /**
   * Enable/disable training mode
   */
  setTrainingMode(enabled) {
    this.isTrainingMode = enabled;
    console.log(`Training mode: ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }
  
  /**
   * Get recent messages (for debugging)
   */
  getRecentMessages(count = 10) {
    return this.messageBuffer.slice(-count);
  }
  
  /**
   * Get all active connections
   */
  getActiveConnections() {
    return Array.from(this.activeConnections);
  }
  
  /**
   * Restore original WebSocket
   */
  restore() {
    if (this.originalWebSocket) {
      window.WebSocket = this.originalWebSocket;
      console.log('WebSocket interceptor restored');
    }
  }
}

// Export for use in content script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WebSocketInterceptor;
}
