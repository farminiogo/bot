import WebSocket from 'ws';
import dotenv from 'dotenv';

dotenv.config();

class BinanceWebSocket {
  constructor() {
    this.ws = null;
    this.subscribers = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 15;
    this.baseReconnectDelay = 2000;
    this.lastData = new Map();
    this.isReconnecting = false;
    this.heartbeatInterval = null;
    this.connectionCheckInterval = null;
    this.lastMessageTime = Date.now();
    this.pendingSubscriptions = new Set();
    this.connectionTimeout = 15000;
    this.pingInterval = 10000;
    this.pongTimeout = 8000;
    this.lastPongTime = Date.now();
    this.backoffMultiplier = 1.5;
    this.maxBackoffDelay = 45000;
    this.initialDataFetched = false;

    this.initializeConnection();
  }

  async initializeConnection() {
    try {
      // Fetch initial market data via REST API
      await this.fetchInitialData();
      this.connect();
      this.startConnectionCheck();
    } catch (error) {
      console.error('خطأ في التهيئة الأولية:', error);
      setTimeout(() => this.initializeConnection(), 5000);
    }
  }

  async fetchInitialData() {
    try {
      const response = await fetch('https://api1.binance.com/api/v3/ticker/24hr');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      
      data.forEach(ticker => {
        const priceData = {
          symbol: ticker.symbol,
          price: parseFloat(ticker.lastPrice),
          priceChange: parseFloat(ticker.priceChange),
          priceChangePercent: parseFloat(ticker.priceChangePercent),
          volume: parseFloat(ticker.volume),
          high24h: parseFloat(ticker.highPrice),
          low24h: parseFloat(ticker.lowPrice),
          lastUpdate: Date.now()
        };

        this.lastData.set(ticker.symbol, priceData);
      });

      this.initialDataFetched = true;
      console.log('تم تحميل البيانات الأولية بنجاح');
    } catch (error) {
      console.error('خطأ في تحميل البيانات الأولية:', error);
      throw error;
    }
  }

  connect() {
    if (this.isReconnecting) {
      console.warn('محاولة اتصال جارية بالفعل');
      return;
    }

    this.isReconnecting = true;

    try {
      this.cleanup();
      console.log('جاري الاتصال بخادم Binance...');
      
      // Use a more reliable endpoint
      const url = 'wss://stream.binance.com:9443/ws';

      this.ws = new WebSocket(url, {
        perMessageDeflate: false,
        handshakeTimeout: this.connectionTimeout,
        headers: {
          'User-Agent': 'Mozilla/5.0'
        }
      });

      const connectionTimeoutId = setTimeout(() => {
        if (this.ws?.readyState !== WebSocket.OPEN) {
          console.error('انتهت مهلة الاتصال');
          this.ws?.terminate();
          this.handleReconnect();
        }
      }, this.connectionTimeout);

      this.setupWebSocketHandlers(connectionTimeoutId);
    } catch (error) {
      console.error('خطأ في إنشاء اتصال WebSocket:', error);
      this.handleReconnect();
    }
  }

  setupWebSocketHandlers(connectionTimeoutId) {
    if (!this.ws) return;

    this.ws.on('open', () => {
      clearTimeout(connectionTimeoutId);
      console.log('تم الاتصال بنجاح');
      this.reconnectAttempts = 0;
      this.isReconnecting = false;
      this.lastMessageTime = Date.now();
      this.lastPongTime = Date.now();
      this.startHeartbeat();
      this.resubscribeAll();
    });

    this.ws.on('message', (data) => {
      try {
        this.lastMessageTime = Date.now();
        const message = JSON.parse(data.toString());

        if (message.pong) {
          this.lastPongTime = Date.now();
          return;
        }

        if (message.e === '24hrTicker') {
          this.processTicker(message);
        }
      } catch (error) {
        console.error('خطأ في معالجة رسالة WebSocket:', error);
      }
    });

    this.ws.on('ping', () => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.pong();
      }
    });

    this.ws.on('pong', () => {
      this.lastPongTime = Date.now();
    });

    this.ws.on('error', (error) => {
      clearTimeout(connectionTimeoutId);
      console.error('خطأ في WebSocket:', error);
      this.handleReconnect();
    });

    this.ws.on('close', () => {
      clearTimeout(connectionTimeoutId);
      console.log('تم إغلاق اتصال WebSocket');
      this.handleReconnect();
    });
  }

  processTicker(ticker) {
    if (!ticker || !ticker.s) return;

    const priceData = {
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
      this.lastData.set(ticker.s, priceData);
      const subscribers = this.subscribers.get(ticker.s);
      if (subscribers) {
        subscribers.forEach(callback => {
          try {
            callback(priceData);
          } catch (error) {
            console.error(`خطأ في معالجة البيانات لـ ${ticker.s}:`, error);
          }
        });
      }
    }
  }

  cleanup() {
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.terminate();
        }
      } catch (e) {
        console.warn('خطأ في التنظيف:', e);
      }
      this.ws = null;
    }

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  startHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        // Send ping
        this.ws.ping();

        // Check if we received pong
        setTimeout(() => {
          if (Date.now() - this.lastPongTime > this.pongTimeout) {
            console.warn('لم يتم استلام رد، جاري إعادة الاتصال...');
            this.handleReconnect();
          }
        }, this.pongTimeout);
      }
    }, this.pingInterval);
  }

  startConnectionCheck() {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }

    this.connectionCheckInterval = setInterval(() => {
      const now = Date.now();
      if (now - this.lastMessageTime > 60000 && !this.isReconnecting) {
        console.warn('لم يتم استلام بيانات لمدة دقيقة، جاري إعادة الاتصال...');
        this.connect();
      }
    }, 30000);
  }

  handleReconnect() {
    if (this.isReconnecting) return;

    try {
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = Math.min(
          this.baseReconnectDelay * Math.pow(this.backoffMultiplier, this.reconnectAttempts),
          this.maxBackoffDelay
        );
        console.log(`محاولة إعادة الاتصال ${this.reconnectAttempts} خلال ${delay}ms`);
        
        setTimeout(() => {
          this.isReconnecting = false;
          this.connect();
        }, delay);
      } else {
        console.error('تم الوصول للحد الأقصى من محاولات إعادة الاتصال');
        setTimeout(() => {
          this.reconnectAttempts = 0;
          this.isReconnecting = false;
          this.connect();
        }, 60000);
      }
    } catch (error) {
      console.error('خطأ أثناء إعادة الاتصال:', error);
      this.isReconnecting = false;
    }
  }

  resubscribeAll() {
    if (this.ws?.readyState === WebSocket.OPEN && this.subscribers.size > 0) {
      const streams = Array.from(this.subscribers.keys())
        .map(symbol => `${symbol.toLowerCase()}@ticker`);

      if (streams.length > 0) {
        const subscribeMsg = {
          method: 'SUBSCRIBE',
          params: streams,
          id: Date.now()
        };

        this.ws.send(JSON.stringify(subscribeMsg));
        console.log('تم إعادة الاشتراك في:', streams);
      }
    }
  }

  subscribe(symbol, callback) {
    if (!this.subscribers.has(symbol)) {
      this.subscribers.set(symbol, new Set());
      this.pendingSubscriptions.add(symbol);
    }
    
    this.subscribers.get(symbol).add(callback);

    // Send initial data if available
    const lastData = this.lastData.get(symbol);
    if (lastData) {
      callback(lastData);
    } else if (this.initialDataFetched) {
      // If we have initial data but not for this symbol, fetch it specifically
      this.fetchSymbolData(symbol).then(data => {
        if (data) callback(data);
      });
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.connect();
    } else {
      const subscribeMsg = {
        method: 'SUBSCRIBE',
        params: [`${symbol.toLowerCase()}@ticker`],
        id: Date.now()
      };
      this.ws.send(JSON.stringify(subscribeMsg));
      console.log(`تم الاشتراك في ${symbol}`);
    }
  }

  async fetchSymbolData(symbol) {
    try {
      const response = await fetch(`https://api1.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const ticker = await response.json();
      
      const priceData = {
        symbol: ticker.symbol,
        price: parseFloat(ticker.lastPrice),
        priceChange: parseFloat(ticker.priceChange),
        priceChangePercent: parseFloat(ticker.priceChangePercent),
        volume: parseFloat(ticker.volume),
        high24h: parseFloat(ticker.highPrice),
        low24h: parseFloat(ticker.lowPrice),
        lastUpdate: Date.now()
      };

      this.lastData.set(symbol, priceData);
      return priceData;
    } catch (error) {
      console.error(`خطأ في تحميل بيانات ${symbol}:`, error);
      return null;
    }
  }

  unsubscribe(symbol, callback) {
    const subscribers = this.subscribers.get(symbol);
    if (subscribers) {
      subscribers.delete(callback);
      
      if (subscribers.size === 0) {
        this.subscribers.delete(symbol);
        this.pendingSubscriptions.delete(symbol);
        
        if (this.ws?.readyState === WebSocket.OPEN) {
          const unsubscribeMsg = {
            method: 'UNSUBSCRIBE',
            params: [`${symbol.toLowerCase()}@ticker`],
            id: Date.now()
          };
          this.ws.send(JSON.stringify(unsubscribeMsg));
          console.log(`تم إلغاء الاشتراك من ${symbol}`);
        }
      }
    }
  }

  getLastData(symbol) {
    return this.lastData.get(symbol) || null;
  }

  close() {
    console.log('جاري إغلاق اتصال WebSocket');
    this.cleanup();
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }
    this.subscribers.clear();
    this.lastData.clear();
    this.pendingSubscriptions.clear();
  }
}

export const binanceWS = new BinanceWebSocket();