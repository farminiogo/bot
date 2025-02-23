import WebSocket from 'ws';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

class BinanceWebSocket {
  private ws: WebSocket | null = null;
  private subscribers: Map<string, Set<(data: any) => void>> = new Map();
  private reconnectAttempts: number = 0;
  private readonly maxReconnectAttempts: number = 15;
  private readonly reconnectDelay: number = 5000;
  private readonly apiEndpoints: string[] = [
    'https://api1.binance.com/api/v3/ticker/24hr',
    'https://api2.binance.com/api/v3/ticker/24hr',
    'https://api3.binance.com/api/v3/ticker/24hr'
  ];

  constructor() {
    this.initializeConnection();
  }

  private async initializeConnection(): Promise<void> {
    try {
      await this.fetchInitialData();
      this.connect();
    } catch (error) {
      console.error('Initialization error:', error);
      setTimeout(() => this.initializeConnection(), this.reconnectDelay);
    }
  }

  private async fetchInitialData(): Promise<void> {
    for (const endpoint of this.apiEndpoints) {
      try {
        const response = await fetch(endpoint);
        if (!response.ok) continue;
        const data = await response.json();
        data.forEach((ticker: any) => this.notifySubscribers(ticker));
        console.log('Initial market data loaded successfully.');
        return;
      } catch (error) {
        console.error(`Failed to fetch data from ${endpoint}:`, error);
      }
    }
    throw new Error('Failed to fetch initial market data from all endpoints.');
  }

  private connect(): void {
    if (this.ws) this.ws.close();
    console.log('Connecting to Binance WebSocket...');

    this.ws = new WebSocket('wss://stream.binance.com:9443/ws');

    this.ws.on('open', () => {
      console.log('Connected to Binance WebSocket');
      this.reconnectAttempts = 0;
      this.resubscribeAll();
    });

    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.notifySubscribers(message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    this.ws.on('close', () => {
      console.warn('WebSocket connection closed. Reconnecting...');
      this.handleReconnect();
    });

    this.ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.handleReconnect();
    });
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached. Stopping retries.');
      return;
    }
    this.reconnectAttempts++;
    setTimeout(() => this.connect(), this.reconnectDelay);
  }

  private notifySubscribers(data: any): void {
    const symbol = data.s;
    if (!symbol || !this.subscribers.has(symbol)) return;
    this.subscribers.get(symbol)?.forEach((callback) => callback(data));
  }

  public subscribe(symbol: string, callback: (data: any) => void): void {
    if (!this.subscribers.has(symbol)) {
      this.subscribers.set(symbol, new Set());
    }
    this.subscribers.get(symbol)?.add(callback);
  }

  private resubscribeAll(): void {
    this.subscribers.forEach((_, symbol) => {
      this.subscribe(symbol, () => {});
    });
  }
}

export const binanceWS = new BinanceWebSocket();
