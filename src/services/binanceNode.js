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
      const endpoints = [
        'https://api1.binance.com/api/v3/ticker/24hr',
        'https://api2.binance.com/api/v3/ticker/24hr',
        'https://api3.binance.com/api/v3/ticker/24hr'
      ];

      let response = null;
      let error = null;

      for (const endpoint of endpoints) {
        try {
          const res = await fetch(endpoint);
          if (res.ok) {
            response = res;
            break;
          }
        } catch (e) {
          error = e;
          continue;
        }
      }

      if (!response) throw error || new Error('Failed to fetch data from all endpoints');

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

        if (!Object.values(priceData).some(val => isNaN(val))) {
          this.lastData.set(ticker.symbol, priceData);
        }
      });

      this.initialDataFetched = true;
      console.log('✅ تم تحميل البيانات الأولية بنجاح');
    } catch (error) {
      console.error('❌ خطأ في تحميل البيانات الأولية:', error);
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
      console.log('🔄 جاري الاتصال بخادم Binance...');
      
      const url = 'wss://stream.binance.com:9443/ws';
      this.ws = new WebSocket(url, {
        perMessageDeflate: false,
        handshakeTimeout: this.connectionTimeout
      });

      const connectionTimeoutId = setTimeout(() => {
        if (this.ws?.readyState !== WebSocket.OPEN) {
          console.error('⏳ انتهت مهلة الاتصال');
          this.ws?.terminate();
          this.handleReconnect();
        }
      }, this.connectionTimeout);

      this.setupWebSocketHandlers(connectionTimeoutId);
    } catch (error) {
      console.error('❌ خطأ في إنشاء اتصال WebSocket:', error);
      this.handleReconnect();
    }
  }

  setupWebSocketHandlers(connectionTimeoutId) {
    if (!this.ws) return;

    this.ws.on('open', () => {
      clearTimeout(connectionTimeoutId);
      console.log('✅ تم الاتصال بنجاح');
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

        if (message.e === '24hrTicker') {
          this.processTicker(message);
        }
      } catch (error) {
        console.error('❌ خطأ في معالجة رسالة WebSocket:', error);
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
      console.error('❌ خطأ في WebSocket:', error);
      this.handleReconnect();
    });

    this.ws.on('close', () => {
      console.log('🔴 تم إغلاق اتصال WebSocket');
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
            console.error(`❌ خطأ في معالجة البيانات لـ ${ticker.s}:`, error);
          }
        });
      }
    }
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
        console.log(`🔄 محاولة إعادة الاتصال ${this.reconnectAttempts} خلال ${delay}ms`);
        
        setTimeout(() => {
          this.isReconnecting = false;
          this.connect();
        }, delay);
      } else {
        console.error('❌ تم الوصول للحد الأقصى من محاولات إعادة الاتصال');
        setTimeout(() => {
          this.reconnectAttempts = 0;
          this.isReconnecting = false;
          this.connect();
        }, 60000);
      }
    } catch (error) {
      console.error('❌ خطأ أثناء إعادة الاتصال:', error);
      this.isReconnecting = false;
    }
  }
}

export const binanceWS = new BinanceWebSocket();
