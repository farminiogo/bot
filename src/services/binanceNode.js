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
      console.error('⚠️ خطأ في التهيئة الأولية:', error);
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

      let data = null;
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint);
          if (response.ok) {
            data = await response.json();
            break;
          }
        } catch (error) {
          console.warn(`⚠️ فشل الاتصال بـ ${endpoint}, المحاولة التالية...`);
        }
      }

      if (!data) throw new Error('❌ فشل تحميل البيانات الأولية!');

      data.forEach(ticker => {
        this.lastData.set(ticker.symbol, {
          symbol: ticker.symbol,
          price: parseFloat(ticker.lastPrice),
          priceChange: parseFloat(ticker.priceChange),
          priceChangePercent: parseFloat(ticker.priceChangePercent),
          volume: parseFloat(ticker.volume),
          high24h: parseFloat(ticker.highPrice),
          low24h: parseFloat(ticker.lowPrice),
          lastUpdate: Date.now()
        });
      });
      
      this.initialDataFetched = true;
      console.log('✅ تم تحميل البيانات الأولية بنجاح');
    } catch (error) {
      console.error('❌ خطأ أثناء تحميل البيانات الأولية:', error);
    }
  }

  connect() {
    if (this.isReconnecting) return;
    this.isReconnecting = true;

    try {
      this.cleanup();
      console.log('🔗 جاري الاتصال بـ Binance...');

      const wsURL = 'wss://stream.binance.com:9443/ws';
      this.ws = new WebSocket(wsURL);

      this.ws.on('open', () => {
        console.log('✅ تم الاتصال بنجاح');
        this.reconnectAttempts = 0;
        this.isReconnecting = false;
        this.lastMessageTime = Date.now();
        this.lastPongTime = Date.now();
        this.startHeartbeat();
        this.resubscribeAll();
      });

      this.ws.on('message', (data) => {
        this.lastMessageTime = Date.now();
        try {
          const message = JSON.parse(data.toString());
          if (message.e === '24hrTicker') this.processTicker(message);
        } catch (error) {
          console.error('⚠️ خطأ في معالجة البيانات:', error);
        }
      });

      this.ws.on('error', (error) => {
        console.error('❌ خطأ في WebSocket:', error);
        this.handleReconnect();
      });

      this.ws.on('close', () => {
        console.warn('⚠️ تم إغلاق الاتصال بـ Binance!');
        this.handleReconnect();
      });
    } catch (error) {
      console.error('❌ خطأ في إنشاء الاتصال:', error);
      this.handleReconnect();
    }
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
    
    this.lastData.set(ticker.s, priceData);
  }

  handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ تم الوصول للحد الأقصى لمحاولات إعادة الاتصال!');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(this.backoffMultiplier, this.reconnectAttempts),
      this.maxBackoffDelay
    );
    
    console.log(`🔄 محاولة إعادة الاتصال (${this.reconnectAttempts}) خلال ${delay / 1000} ثواني...`);
    setTimeout(() => {
      this.isReconnecting = false;
      this.connect();
    }, delay);
  }

  cleanup() {
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.terminate();
      this.ws = null;
    }
  }

  resubscribeAll() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    console.log('🔄 إعادة الاشتراك في جميع الرموز...');
    this.subscribers.forEach((callbacks, symbol) => {
      this.subscribe(symbol, [...callbacks][0]);
    });
  }

  subscribe(symbol, callback) {
    if (!this.subscribers.has(symbol)) {
      this.subscribers.set(symbol, new Set());
    }
    this.subscribers.get(symbol).add(callback);
  }
}

export const binanceWS = new BinanceWebSocket();
