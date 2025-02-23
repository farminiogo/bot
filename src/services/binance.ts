import type { PriceData } from './types';

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
  private readonly wsEndpoints = [
    'wss://stream.binance.com:9443/ws',
    'wss://ws-api.binance.com:443/ws-api/v3'
  ];
  private readonly apiEndpoints = [
    'https://api1.binance.com/api/v3',
    'https://api2.binance.com/api/v3',
    'https://api3.binance.com/api/v3'
  ];

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

  private async fetchWithRetry(endpoint: string, options: RequestInit = {}, retries = 3): Promise<Response> {
    let lastError: Error | null = null;
    
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(endpoint, {
          ...options,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0',
            ...options.headers
          }
        });

        if (response.ok) {
          return response;
        }

        throw new Error(`HTTP error! status: ${response.status}`);
      } catch (error) {
        lastError = error as Error;
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
        }
      }
    }

    throw lastError || new Error('Failed to fetch after multiple retries');
  }

  private async fetchFromMultipleEndpoints(path: string): Promise<Response> {
    let lastError: Error | null = null;

    for (const baseUrl of this.apiEndpoints) {
      try {
        const response = await this.fetchWithRetry(`${baseUrl}${path}`);
        if (response.ok) {
          return response;
        }
      } catch (error) {
        lastError = error as Error;
        continue;
      }
    }

    throw lastError || new Error('Failed to fetch from all endpoints');
  }

  private async initializeConnection() {
    try {
      this.initializeDefaultData();
      
      if (this.isOnline) {
        await this.fetchInitialData();
      }
      
      this.connect();
      this.startConnectionCheck();
      
      this.isInitialized = true;
      Logger.info('WebSocket connection initialized');
    } catch (error) {
      Logger.warn('Failed to initialize connection, using default data');
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
    try {
      const response = await this.fetchFromMultipleEndpoints('/ticker/24hr');
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

      Logger.info('Initial market data loaded successfully');
    } catch (error) {
      Logger.error('Failed to fetch initial market data:', error);
      throw error;
    }
  }

  private connect() {
    if (this.isReconnecting || !this.isOnline) {
      return;
    }

    this.isReconnecting = true;

    const tryConnect = async (endpoint: string): Promise<boolean> => {
      try {
        this.cleanup(false);
        
        this.ws = new WebSocket(endpoint);
        this.ws.binaryType = 'blob';

        return new Promise((resolve) => {
          const timeoutId = setTimeout(() => {
            if (this.ws?.readyState !== WebSocket.OPEN) {
              this.cleanup(false);
              resolve(false);
            }
          }, this.connectionTimeout);

          this.setupWebSocketHandlers(() => {
            clearTimeout(timeoutId);
            resolve(true);
          });
        });
      } catch (error) {
        Logger.error(`Failed to connect to ${endpoint}:`, error);
        return false;
      }
    };

    const connectToEndpoints = async () => {
      for (const endpoint of this.wsEndpoints) {
        if (await tryConnect(endpoint)) {
          return true;
        }
      }
      return false;
    };

    connectToEndpoints().then(success => {
      if (!success) {
        Logger.error('Failed to connect to all WebSocket endpoints');
        this.handleReconnect();
      }
    });
  }

  private setupWebSocketHandlers(onOpen: () => void) {
    if (!this.ws) return;

    this.ws.onopen = () => {
      Logger.info('WebSocket connected successfully');
      this.reconnectAttempts = 0;
      this.isReconnecting = false;
      this.lastMessageTime = Date.now();
      this.lastPongTime = Date.now();
      this.startHeartbeat();
      this.resubscribeAll();
      onOpen();
    };

    this.ws.onmessage = (event) => {
      try {
        this.lastMessageTime = Date.now();
        const data = JSON.parse(event.data);

        if (data.pong) {
          this.lastPongTime = Date.now();
          return;
        }

        if (data.e === '24hrTicker') {
          this.processTicker(data);
        }
      } catch (error) {
        Logger.error('Error processing WebSocket message:', error);
      }
    };

    this.ws.onerror = (error) => {
      Logger.error('WebSocket error:', error);
      this.handleReconnect();
    };

    this.ws.onclose = () => {
      this.handleReconnect();
    };
  }

  private startHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ ping: Date.now() }));

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
        const subscribeMsg = {
          method: 'SUBSCRIBE',
          params: streams,
          id: Date.now()
        };

        try {
          this.ws.send(JSON.stringify(subscribeMsg));
          Logger.info('Resubscribed to:', streams);
        } catch (error) {
          Logger.error('Error resubscribing:', error);
          this.handleReconnect();
        }
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
      if (this.ws?.readyState === WebSocket.OPEN) {
        const subscribeMsg = {
          method: 'SUBSCRIBE',
          params: [`${symbol.toLowerCase()}@ticker`],
          id: Date.now()
        };
        this.ws.send(JSON.stringify(subscribeMsg));
      }
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
          try {
            const unsubscribeMsg = {
              method: 'UNSUBSCRIBE',
              params: [`${symbol.toLowerCase()}@ticker`],
              id: Date.now()
            };
            this.ws.send(JSON.stringify(unsubscribeMsg));
          } catch (error) {
            Logger.error('Error unsubscribing:', error);
          }
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