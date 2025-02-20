import type { PriceData } from './types';

// Enhanced logging utility with Arabic support
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
  private priceThreshold = 0.001;
  private cacheTimeout = 5000;
  private pendingSubscriptions: Set<string> = new Set();
  private callbacks: Map<string, Set<(data: PriceData) => void>> = new Map();
  private connectionTimeout: number = 15000;
  private pingInterval: number = 10000;
  private pongTimeout: number = 8000;
  private lastPongTime: number = Date.now();
  private backoffMultiplier: number = 1.5;
  private maxBackoffDelay: number = 45000;
  private initialDataFetched: boolean = false;

  constructor() {
    this.initializeConnection();
  }

  private async initializeConnection() {
    try {
      // Fetch initial market data via REST API
      await this.fetchInitialData();
      this.connect();
      this.startConnectionCheck();
      window.addEventListener('online', () => this.handleOnline());
      window.addEventListener('offline', () => this.handleOffline());
    } catch (error) {
      Logger.error('خطأ في التهيئة الأولية:', error);
      setTimeout(() => this.initializeConnection(), 5000);
    }
  }

  private async fetchInitialData() {
    try {
      const response = await fetch('https://api.binance.com/api/v3/ticker/24hr');
      const data = await response.json();
      
      data.forEach((ticker: any) => {
        const priceData: PriceData = {
          symbol: ticker.symbol,
          price: parseFloat(ticker.lastPrice),
          priceChange: parseFloat(ticker.priceChange),
          priceChangePercent: parseFloat(ticker.priceChangePercent),
          volume: parseFloat(ticker.volume),
          high24h: parseFloat(ticker.highPrice),
          low24h: parseFloat(ticker.lowPrice),
          lastUpdate: Date.now()
        };

        this.lastData.set(ticker.symbol, {
          data: priceData,
          timestamp: Date.now()
        });
      });

      this.initialDataFetched = true;
      Logger.info('تم تحميل البيانات الأولية بنجاح');
    } catch (error) {
      Logger.error('خطأ في تحميل البيانات الأولية:', error);
      throw error;
    }
  }

  private handleOnline() {
    Logger.info('اتصال الإنترنت متوفر، جاري إعادة الاتصال...');
    this.reconnectAttempts = 0;
    this.connect();
  }

  private handleOffline() {
    Logger.warn('انقطع اتصال الإنترنت، في انتظار عودة الاتصال...');
    this.cleanup();
  }

  private getExponentialBackoff(): number {
    return Math.min(
      this.baseReconnectDelay * Math.pow(this.backoffMultiplier, this.reconnectAttempts),
      this.maxBackoffDelay
    );
  }

  private connect() {
    if (this.isReconnecting) {
      Logger.warn('محاولة اتصال جارية بالفعل');
      return;
    }

    this.isReconnecting = true;

    try {
      this.cleanup();
      Logger.info('جاري الاتصال بخادم Binance...');
      
      const streams = Array.from(this.subscriptionCounts.keys())
        .map(symbol => `${symbol.toLowerCase()}@ticker`);
      
      const url = streams.length > 0
        ? `wss://stream.binance.com:9443/ws/${streams.join('/')}`
        : 'wss://stream.binance.com:9443/ws';

      this.ws = new WebSocket(url);

      const connectionTimeoutId = setTimeout(() => {
        if (this.ws?.readyState !== WebSocket.OPEN) {
          Logger.error('انتهت مهلة الاتصال');
          this.ws?.close();
          this.handleReconnect();
        }
      }, this.connectionTimeout);

      this.setupWebSocketHandlers(connectionTimeoutId);
    } catch (error) {
      Logger.error('خطأ في إنشاء اتصال WebSocket:', error);
      this.handleReconnect();
    }
  }

  private setupWebSocketHandlers(connectionTimeoutId: number) {
    if (!this.ws) return;

    this.ws.onopen = () => {
      clearTimeout(connectionTimeoutId);
      Logger.info('تم الاتصال بنجاح');
      this.reconnectAttempts = 0;
      this.isReconnecting = false;
      this.lastMessageTime = Date.now();
      this.lastPongTime = Date.now();
      this.startHeartbeat();
      this.resubscribeAll();
    };

    this.ws.onmessage = (event) => {
      try {
        this.lastMessageTime = Date.now();
        const data = JSON.parse(event.data);

        if (data.pong) {
          this.lastPongTime = Date.now();
          return;
        }

        if (Array.isArray(data)) {
          data.forEach(ticker => this.processTicker(ticker));
        } else if (data.data) {
          this.processTicker(data.data);
        } else if (data.e === '24hrTicker') {
          this.processTicker(data);
        }
      } catch (error) {
        Logger.error('خطأ في معالجة رسالة WebSocket:', error);
      }
    };

    this.ws.onerror = (error) => {
      clearTimeout(connectionTimeoutId);
      Logger.error('خطأ في WebSocket:', error);
      this.handleReconnect();
    };

    this.ws.onclose = (event) => {
      clearTimeout(connectionTimeoutId);
      Logger.warn(`تم إغلاق اتصال WebSocket. Code: ${event.code}, Reason: ${event.reason}`);
      this.handleReconnect();
    };
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
      const lastCachedData = this.lastData.get(priceData.symbol);

      if (!lastCachedData || 
          this.shouldUpdatePrice(lastCachedData.data.price, priceData.price) ||
          Date.now() - lastCachedData.timestamp > this.cacheTimeout) {
        
        this.lastData.set(priceData.symbol, {
          data: priceData,
          timestamp: Date.now()
        });

        const callbacks = this.callbacks.get(priceData.symbol);
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
  }

  private shouldUpdatePrice(oldPrice: number, newPrice: number): boolean {
    return Math.abs((newPrice - oldPrice) / oldPrice) >= this.priceThreshold;
  }

  private cleanup() {
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
        Logger.warn('Cleanup error:', e);
      }
      this.ws = null;
    }

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private startHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        // Send ping
        this.ws.send(JSON.stringify({ ping: Date.now() }));

        // Check if we received pong
        setTimeout(() => {
          if (Date.now() - this.lastPongTime > this.pongTimeout) {
            Logger.warn('No pong received, reconnecting...');
            this.handleReconnect();
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
      if (now - this.lastMessageTime > 60000 && !this.isReconnecting) {
        Logger.warn('No messages received for 60 seconds, reconnecting...');
        this.connect();
      }
    }, 30000);
  }

  private handleReconnect() {
    if (this.isReconnecting) return;

    try {
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        Logger.info(`Reconnecting... Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        
        setTimeout(() => {
          this.isReconnecting = false;
          this.connect();
        }, this.getExponentialBackoff());
      } else {
        Logger.error('Max reconnection attempts reached, resetting in 60 seconds');
        setTimeout(() => {
          this.reconnectAttempts = 0;
          this.isReconnecting = false;
          this.connect();
        }, 60000);
      }
    } catch (error) {
      Logger.error('Error during reconnection:', error);
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

        this.ws.send(JSON.stringify(subscribeMsg));
        Logger.info('Resubscribed to streams:', streams);
      }
    }
  }

  public subscribe(symbol: string, callback: (data: PriceData) => void) {
    const count = this.subscriptionCounts.get(symbol) || 0;
    this.subscriptionCounts.set(symbol, count + 1);

    if (count === 0) {
      this.pendingSubscriptions.add(symbol);
      
      if (this.ws?.readyState === WebSocket.OPEN) {
        const subscribeMsg = {
          method: 'SUBSCRIBE',
          params: [`${symbol.toLowerCase()}@ticker`],
          id: Date.now()
        };
        this.ws.send(JSON.stringify(subscribeMsg));
      } else {
        this.connect();
      }
    }

    let callbacks = this.callbacks.get(symbol);
    if (!callbacks) {
      callbacks = new Set();
      this.callbacks.set(symbol, callbacks);
    }
    callbacks.add(callback);

    // Send initial data if available
    const lastData = this.lastData.get(symbol);
    if (lastData) {
      callback(lastData.data);
    } else if (this.initialDataFetched) {
      // If we have initial data but not for this symbol, fetch it specifically
      this.fetchSymbolData(symbol).then(data => {
        if (data) callback(data);
      });
    }
  }

  private async fetchSymbolData(symbol: string): Promise<PriceData | null> {
    try {
      const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
      const ticker = await response.json();
      
      const priceData: PriceData = {
        symbol: ticker.symbol,
        price: parseFloat(ticker.lastPrice),
        priceChange: parseFloat(ticker.priceChange),
        priceChangePercent: parseFloat(ticker.priceChangePercent),
        volume: parseFloat(ticker.volume),
        high24h: parseFloat(ticker.highPrice),
        low24h: parseFloat(ticker.lowPrice),
        lastUpdate: Date.now()
      };

      this.lastData.set(symbol, {
        data: priceData,
        timestamp: Date.now()
      });

      return priceData;
    } catch (error) {
      Logger.error(`خطأ في تحميل بيانات ${symbol}:`, error);
      return null;
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
    if (!cachedData) return null;

    if (Date.now() - cachedData.timestamp > this.cacheTimeout) {
      Logger.warn(`Cached data for ${symbol} is stale`);
      return null;
    }

    return cachedData.data;
  }

  public close() {
    Logger.info('Closing WebSocket connection');
    this.cleanup();
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }
    this.callbacks.clear();
    this.subscriptionCounts.clear();
    this.lastData.clear();
    this.pendingSubscriptions.clear();
  }
}

// Singleton instance
export const binanceWS = new BinanceWebSocket();

interface CachedData {
  data: PriceData;
  timestamp: number;
}