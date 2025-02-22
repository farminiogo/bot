import type { PriceData } from './types';

// Enhanced logging utility with English messages
class Logger {
  static info(message: string, ...args: any[]) {
    console.log(`ℹ️ [${new Date().toISOString()}]: ${message}`, ...args);
  }

  static warn(message: string, ...args: any[]) {
    console.warn(`⚠️ [${new Date().toISOString()}]: ${message}`, ...args);
  }

  static error(message: string, error?: any) {
    console.error(`❌ [${new Date().toISOString()}]: ${message}`, error || '');
  }
}

class BinanceWebSocket {
  private ws: WebSocket | null = null;
  private subscriptionCounts: Map<string, number> = new Map();
  private lastData: Map<string, CachedData> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 15;
  private baseReconnectDelay = 2000;
  private isReconnecting = false;
  private lastMessageTime = Date.now();
  private heartbeatInterval: number | null = null;
  private connectionCheckInterval: number | null = null;
  private lastPongTime = Date.now();
  private backoffMultiplier = 1.5;
  private maxBackoffDelay = 45000;
  private isInitialized = false;
  private isOnline = true;
  private pendingSubscriptions = new Set<string>();
  private callbacks = new Map<string, Set<(data: PriceData) => void>>();
  private connectionTimeout = 15000;
  private pingInterval = 10000;
  private pongTimeout = 8000;
  private defaultSymbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];
  private retryQueue: (() => void)[] = [];
  private maxQueueSize = 50;

  constructor() {
    this.initializeConnection();
    this.setupNetworkListeners();
  }

  private setupNetworkListeners() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true;
        Logger.info('Network connection restored');
        this.reconnectAttempts = 0;
        this.processRetryQueue();
        this.connect();
      });

      window.addEventListener('offline', () => {
        this.isOnline = false;
        Logger.warn('Network connection lost');
        this.cleanup(false);
      });

      window.addEventListener('focus', () => {
        if (this.isOnline) {
          this.verifyConnection();
        }
      });
    }
  }

  private verifyConnection() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.connect();
    } else {
      this.ping();
    }
  }

  private async initializeConnection() {
    try {
      // Initialize with default data
      this.initializeDefaultData();
      
      if (this.isOnline) {
        // Try to fetch real data
        await this.fetchInitialData();
      }
      
      // Setup connection
      this.connect();
      this.startConnectionCheck();
      
      this.isInitialized = true;
    } catch (error) {
      Logger.warn('Failed to load initial data, using default data');
    }
  }

  private initializeDefaultData() {
    const now = Date.now();
    this.defaultSymbols.forEach(symbol => {
      const defaultData: PriceData = {
        symbol,
        price: 0,
        priceChange: 0,
        priceChangePercent: 0,
        volume: 0,
        high24h: 0,
        low24h: 0,
        lastUpdate: now
      };

      this.lastData.set(symbol, {
        data: defaultData,
        timestamp: now
      });
    });
  }

  private async fetchInitialData() {
    if (!this.isOnline) {
      throw new Error('No network connection');
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch('https://api.binance.com/api/v3/ticker/24hr', {
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      data.forEach((ticker: any) => {
        if (!ticker || typeof ticker.symbol !== 'string') return;

        const priceData: PriceData = {
          symbol: ticker.symbol,
          price: parseFloat(ticker.lastPrice) || 0,
          priceChange: parseFloat(ticker.priceChange) || 0,
          priceChangePercent: parseFloat(ticker.priceChangePercent) || 0,
          volume: parseFloat(ticker.volume) || 0,
          high24h: parseFloat(ticker.highPrice) || 0,
          low24h: parseFloat(ticker.lowPrice) || 0,
          lastUpdate: Date.now()
        };

        if (!Object.values(priceData).some(val => isNaN(val as number))) {
          this.lastData.set(ticker.symbol, {
            data: priceData,
            timestamp: Date.now()
          });
        }
      });

      Logger.info('Initial data loaded successfully');
    } catch (error) {
      Logger.warn('Failed to load initial data, will retry later');
      this.addToRetryQueue(() => this.fetchInitialData());
      throw error;
    }
  }

  private addToRetryQueue(operation: () => void) {
    if (this.retryQueue.length < this.maxQueueSize) {
      this.retryQueue.push(operation);
    }
  }

  private processRetryQueue() {
    while (this.retryQueue.length > 0 && this.isOnline) {
      const operation = this.retryQueue.shift();
      if (operation) {
        try {
          operation();
        } catch (error) {
          Logger.error('Error processing retry operation:', error);
        }
      }
    }
  }

  private connect() {
    if (this.isReconnecting || !this.isOnline) {
      return;
    }

    this.isReconnecting = true;

    try {
      this.cleanup(false);
      
      // Fix: Change URL format to use single stream with multiple symbols
      const streams = Array.from(this.subscriptionCounts.keys())
        .map(symbol => `${symbol.toLowerCase()}@ticker`);
      
      const url = `wss://stream.binance.com:9443/stream?streams=${streams.join('/')}`;

      this.ws = new WebSocket(url);
      this.ws.binaryType = 'blob';

      const connectionTimeoutId = setTimeout(() => {
        if (this.ws?.readyState !== WebSocket.OPEN) {
          Logger.error('Connection timeout');
          this.cleanup(true);
          this.handleReconnect();
        }
      }, this.connectionTimeout);

      this.setupWebSocketHandlers(connectionTimeoutId);
    } catch (error) {
      Logger.error('Error creating WebSocket connection:', error);
      this.handleReconnect();
    }
  }

  private setupWebSocketHandlers(connectionTimeoutId: number) {
    if (!this.ws) return;

    this.ws.onopen = () => {
      clearTimeout(connectionTimeoutId);
      Logger.info('Connected successfully');
      this.reconnectAttempts = 0;
      this.isReconnecting = false;
      this.lastMessageTime = Date.now();
      this.lastPongTime = Date.now();
      this.startHeartbeat();
      this.resubscribeAll();
      this.processRetryQueue();
    };

    this.ws.onmessage = (event) => {
      try {
        this.lastMessageTime = Date.now();
        const data = JSON.parse(event.data);

        if (data.pong) {
          this.lastPongTime = Date.now();
          return;
        }

        // Fix: Handle stream data format
        if (data.stream && data.data) {
          this.processTicker(data.data);
        } else if (Array.isArray(data)) {
          data.forEach(ticker => this.processTicker(ticker));
        } else if (data.e === '24hrTicker') {
          this.processTicker(data);
        }
      } catch (error) {
        Logger.error('Error processing WebSocket message:', error);
      }
    };

    this.ws.onerror = (error) => {
      clearTimeout(connectionTimeoutId);
      Logger.error('WebSocket error:', error);
      this.handleReconnect();
    };

    this.ws.onclose = () => {
      clearTimeout(connectionTimeoutId);
      this.handleReconnect();
    };
  }

  private ping() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ ping: Date.now() }));
    }
  }

  private cleanup(reconnect = true) {
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.close();
        }
      } catch (e) {
        Logger.warn('Error during cleanup:', e);
      }
      this.ws = null;
    }

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (reconnect) {
      this.handleReconnect();
    }
  }

  private startHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ping();

        setTimeout(() => {
          if (Date.now() - this.lastPongTime > this.pongTimeout) {
            Logger.warn('No pong received, reconnecting...');
            this.cleanup(true);
          }
        }, this.pongTimeout);
      }
    }, this.pingInterval);
  }

  private startConnectionCheck() {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }

    this.connectionCheckInterval = window.setInterval(() => {
      const now = Date.now();
      if (now - this.lastMessageTime > 60000 && !this.isReconnecting && this.isOnline) {
        Logger.warn('No data received for 1 minute, reconnecting...');
        this.connect();
      }
    }, 30000);
  }

  private handleReconnect() {
    if (this.isReconnecting || !this.isOnline) return;

    try {
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = Math.min(
          this.baseReconnectDelay * Math.pow(this.backoffMultiplier, this.reconnectAttempts),
          this.maxBackoffDelay
        );
        
        Logger.info(`Reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);
        
        setTimeout(() => {
          this.isReconnecting = false;
          this.connect();
        }, delay);
      } else {
        Logger.error('Maximum reconnection attempts reached');
        setTimeout(() => {
          this.reconnectAttempts = 0;
          this.isReconnecting = false;
          this.connect();
        }, 60000);
      }
    } catch (error) {
      Logger.error('Error during reconnection:', error);
      this.isReconnecting = false;
    }
  }

  private processTicker(ticker: any) {
    if (!ticker || !ticker.s) return;

    const priceData: PriceData = {
      symbol: ticker.s,
      price: parseFloat(ticker.c) || 0,
      priceChange: parseFloat(ticker.p) || 0,
      priceChangePercent: parseFloat(ticker.P) || 0,
      volume: parseFloat(ticker.v) || 0,
      high24h: parseFloat(ticker.h) || 0,
      low24h: parseFloat(ticker.l) || 0,
      lastUpdate: Date.now()
    };

    if (priceData.price > 0) {
      this.lastData.set(ticker.s, {
        data: priceData,
        timestamp: Date.now()
      });

      const callbacks = this.callbacks.get(ticker.s);
      if (callbacks) {
        callbacks.forEach(callback => {
          try {
            callback(priceData);
          } catch (error) {
            Logger.error('Error in price update callback:', error);
          }
        });
      }
    }
  }

  private resubscribeAll() {
    if (this.ws?.readyState === WebSocket.OPEN && this.subscriptionCounts.size > 0) {
      const streams = Array.from(this.subscriptionCounts.keys())
        .map(symbol => `${symbol.toLowerCase()}@ticker`);

      if (streams.length > 0) {
        // Fix: Use correct subscription format
        const subscribeMsg = {
          method: 'SUBSCRIBE',
          params: streams,
          id: Date.now()
        };

        this.ws.send(JSON.stringify(subscribeMsg));
        Logger.info('Resubscribed to:', streams);
      }
    }
  }

  public subscribe(symbol: string, callback: (data: PriceData) => void) {
    const count = this.subscriptionCounts.get(symbol) || 0;
    this.subscriptionCounts.set(symbol, count + 1);

    let callbacks = this.callbacks.get(symbol);
    if (!callbacks) {
      callbacks = new Set();
      this.callbacks.set(symbol, callbacks);
    }
    callbacks.add(callback);

    if (count === 0) {
      this.pendingSubscriptions.add(symbol);
      this.connect();
    }

    const lastData = this.lastData.get(symbol);
    if (lastData) {
      callback(lastData.data);
    }
  }

  public unsubscribe(symbol: string, callback: (data: PriceData) => void) {
    const count = this.subscriptionCounts.get(symbol) || 0;
    if (count > 0) {
      this.subscriptionCounts.set(symbol, count - 1);
      
      if (count === 1) {
        this.pendingSubscriptions.delete(symbol);
        
        if (this.ws?.readyState === WebSocket.OPEN) {
          const unsubscribeMsg = {
            method: 'UNSUBSCRIBE',
            params: [`${symbol.toLowerCase()}@ticker`],
            id: Date.now()
          };
          this.ws.send(JSON.stringify(unsubscribeMsg));
        }
        this.subscriptionCounts.delete(symbol);
      }
    }

    const callbacks = this.callbacks.get(symbol);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.callbacks.delete(symbol);
      }
    }
  }

  public getLastData(symbol: string): PriceData | null {
    const cachedData = this.lastData.get(symbol);
    if (!cachedData) {
      return {
        symbol,
        price: 0,
        priceChange: 0,
        priceChangePercent: 0,
        volume: 0,
        high24h: 0,
        low24h: 0,
        lastUpdate: Date.now()
      };
    }
    return cachedData.data;
  }

  public close() {
    Logger.info('Closing WebSocket connection');
    this.cleanup(false);
    
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }
    
    this.callbacks.clear();
    this.subscriptionCounts.clear();
    this.lastData.clear();
    this.pendingSubscriptions.clear();
    this.retryQueue = [];
  }
}

interface CachedData {
  data: PriceData;
  timestamp: number;
}

// Singleton instance
export const binanceWS = new BinanceWebSocket();