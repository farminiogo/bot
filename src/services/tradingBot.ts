import { RSI, MACD, BollingerBands, EMA, ATR } from 'technicalindicators';
import { binanceWS, type PriceData } from './binance';
import { calculateIndicators, calculateRiskLevels, predictNextPrice } from './technicalAnalysis';

// Enhanced logging utility
class Logger {
  static info(message: string, ...args: any[]) {
    console.log(`ℹ️ INFO [${new Date().toISOString()}]: ${message}`, ...args);
  }

  static warn(message: string, ...args: any[]) {
    console.warn(`⚠️ WARNING [${new Date().toISOString()}]: ${message}`, ...args);
  }

  static error(message: string, error?: any) {
    console.error(`❌ ERROR [${new Date().toISOString()}]: ${message}`, error || '');
  }
}

interface TradingConfig {
  maxPositions: number;
  maxRiskPerTrade: number; // Percentage of portfolio
  stopLossPercent: number;
  takeProfitRatio: number; // Risk:Reward ratio
  minConfidence: number;
  rsiOverbought: number;
  rsiOversold: number;
  enabled: boolean;
  symbols: string[]; // Dynamic symbol list
}

interface Position {
  symbol: string;
  entryPrice: number;
  quantity: number;
  stopLoss: number;
  takeProfit: number;
  timestamp: number;
  currentPrice: number;
  initialStopLoss: number; // For trailing stop
  highestPrice: number; // For trailing stop
  profitLockThreshold: number; // Percentage of take profit to trigger trailing stop
}

class TradingBot {
  private config: TradingConfig;
  private positions: Map<string, Position>;
  private historicalPrices: Map<string, number[]>;
  private subscribers: Set<(symbol: string, data: PriceData) => void>;
  private lastUpdate: Map<string, number>;
  private readonly updateInterval = 1000; // 1 second minimum between updates
  private readonly maxHistoricalPrices = 100;
  private readonly profitLockPercentage = 0.5; // 50% of take profit

  constructor() {
    this.config = {
      maxPositions: 3,
      maxRiskPerTrade: 2, // 2% max risk per trade
      stopLossPercent: 2,
      takeProfitRatio: 2,
      minConfidence: 0.7,
      rsiOverbought: 70,
      rsiOversold: 30,
      enabled: false,
      symbols: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT']
    };

    this.positions = new Map();
    this.historicalPrices = new Map();
    this.subscribers = new Set();
    this.lastUpdate = new Map();
    
    this.initializeBot();
  }

  private async initializeBot() {
    try {
      this.setupDataStructures();
      await this.subscribeToSymbols();
      Logger.info('Trading bot initialized successfully');
    } catch (error) {
      Logger.error('Failed to initialize trading bot:', error);
      throw error;
    }
  }

  private setupDataStructures() {
    this.config.symbols.forEach(symbol => {
      this.historicalPrices.set(symbol, []);
      this.lastUpdate.set(symbol, 0);
    });
  }

  private async subscribeToSymbols() {
    this.config.symbols.forEach(symbol => {
      binanceWS.subscribe(symbol, (data) => this.handlePriceUpdate(symbol, data));
    });
  }

  private async handlePriceUpdate(symbol: string, data: PriceData) {
    try {
      const now = Date.now();
      const lastUpdateTime = this.lastUpdate.get(symbol) || 0;
      
      // Throttle updates
      if (now - lastUpdateTime < this.updateInterval) {
        return;
      }
      
      this.lastUpdate.set(symbol, now);

      // Update historical prices
      const prices = this.historicalPrices.get(symbol) || [];
      prices.push(data.price);
      this.historicalPrices.set(symbol, prices.slice(-this.maxHistoricalPrices));

      // Update existing position
      const position = this.positions.get(symbol);
      if (position) {
        position.currentPrice = data.price;
        position.highestPrice = Math.max(position.highestPrice, data.price);
        await this.checkPositionExit(symbol, data, position);
      } else if (this.config.enabled) {
        await this.checkNewEntry(symbol, data);
      }

      // Notify subscribers
      this.subscribers.forEach(callback => callback(symbol, data));
    } catch (error) {
      Logger.error(`Error handling price update for ${symbol}:`, error);
    }
  }

  private async checkPositionExit(symbol: string, data: PriceData, position: Position) {
    try {
      const { price } = data;
      const { 
        entryPrice, 
        stopLoss, 
        takeProfit, 
        quantity, 
        highestPrice,
        profitLockThreshold
      } = position;

      // Calculate current profit/loss
      const currentPnL = ((price - entryPrice) / entryPrice) * 100;

      // Check if we should activate trailing stop
      if (price >= profitLockThreshold) {
        // Calculate new trailing stop (lock in 50% of current profits)
        const newStopLoss = Math.max(
          stopLoss,
          price * (1 - (this.config.stopLossPercent / 200)) // Half the original stop loss percentage
        );

        if (newStopLoss > stopLoss) {
          position.stopLoss = newStopLoss;
          await this.sendNotification(
            `🔄 Trailing Stop Updated\n` +
            `Symbol: ${symbol}\n` +
            `New Stop Loss: $${newStopLoss.toFixed(2)}\n` +
            `Current Profit: ${currentPnL.toFixed(2)}%`
          );
        }
      }

      // Check stop loss
      if (price <= position.stopLoss) {
        const loss = ((position.stopLoss - entryPrice) / entryPrice) * 100;
        this.positions.delete(symbol);
        
        await this.sendNotification(
          `🔴 Stop Loss Hit\n` +
          `Symbol: ${symbol}\n` +
          `Entry: $${entryPrice.toFixed(2)}\n` +
          `Exit: $${price.toFixed(2)}\n` +
          `Loss: ${loss.toFixed(2)}%\n` +
          `Quantity: ${quantity}`
        );
      }
      // Check take profit
      else if (price >= takeProfit) {
        const profit = ((takeProfit - entryPrice) / entryPrice) * 100;
        this.positions.delete(symbol);
        
        await this.sendNotification(
          `🟢 Take Profit Hit\n` +
          `Symbol: ${symbol}\n` +
          `Entry: $${entryPrice.toFixed(2)}\n` +
          `Exit: $${price.toFixed(2)}\n` +
          `Profit: ${profit.toFixed(2)}%\n` +
          `Quantity: ${quantity}`
        );
      }
    } catch (error) {
      Logger.error(`Error checking position exit for ${symbol}:`, error);
    }
  }

  private async checkNewEntry(symbol: string, data: PriceData) {
    try {
      if (this.positions.size >= this.config.maxPositions) return;

      const prices = this.historicalPrices.get(symbol);
      if (!prices || prices.length < 50) return;

      // Calculate technical indicators
      const indicators = await calculateIndicators(prices);
      if (!indicators) return;

      const riskAnalysis = calculateRiskLevels(data.price, indicators, Math.abs(data.priceChangePercent));
      const prediction = await predictNextPrice(prices);
      if (!prediction) return;

      // Enhanced entry conditions
      const isOversold = indicators.rsi <= this.config.rsiOversold;
      const isBelowBB = data.price < indicators.bollinger.lower;
      const hasConfidence = prediction.confidence >= this.config.minConfidence;
      const isBullish = prediction.trend === 'up';
      const macdBullish = indicators.macd.histogram > 0 && indicators.macd.histogram > indicators.macd.signal;
      const emaSupport = data.price > indicators.ema;

      if (isOversold && isBelowBB && hasConfidence && isBullish && macdBullish && emaSupport) {
        // Calculate position size based on ATR
        const atrRisk = indicators.atr * 2; // Use 2x ATR for risk calculation
        const accountRisk = (this.config.maxRiskPerTrade / 100) * 10000; // Example account size
        const quantity = accountRisk / atrRisk;

        // Calculate profit lock threshold
        const profitLockThreshold = data.price + (riskAnalysis.takeProfit - data.price) * this.profitLockPercentage;

        // Open position
        const position: Position = {
          symbol,
          entryPrice: data.price,
          quantity,
          stopLoss: riskAnalysis.stopLoss,
          takeProfit: riskAnalysis.takeProfit,
          timestamp: Date.now(),
          currentPrice: data.price,
          initialStopLoss: riskAnalysis.stopLoss,
          highestPrice: data.price,
          profitLockThreshold
        };

        this.positions.set(symbol, position);

        await this.sendNotification(
          `🟢 New Long Position\n` +
          `Symbol: ${symbol}\n` +
          `Entry: $${data.price.toFixed(2)}\n` +
          `Stop Loss: $${riskAnalysis.stopLoss.toFixed(2)}\n` +
          `Take Profit: $${riskAnalysis.takeProfit.toFixed(2)}\n` +
          `Quantity: ${quantity.toFixed(8)}\n` +
          `Confidence: ${(prediction.confidence * 100).toFixed(1)}%`
        );
      }
    } catch (error) {
      Logger.error(`Error checking new entry for ${symbol}:`, error);
    }
  }

  private async sendNotification(message: string) {
    try {
      Logger.info('Trading notification:', message);
      // In production, implement actual notification system
    } catch (error) {
      Logger.error('Error sending notification:', error);
    }
  }

  public setConfig(newConfig: Partial<TradingConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): TradingConfig {
    return { ...this.config };
  }

  public getPositions(): Map<string, Position> {
    return new Map(this.positions);
  }

  public async start() {
    try {
      this.config.enabled = true;
      await this.sendNotification('🚀 Trading Bot Started\n\nMonitoring markets for opportunities...');
    } catch (error) {
      Logger.error('Error starting trading bot:', error);
      throw error;
    }
  }

  public async stop() {
    try {
      this.config.enabled = false;
      
      // Unsubscribe from all symbols
      this.config.symbols.forEach(symbol => {
        binanceWS.unsubscribe(symbol, (data) => this.handlePriceUpdate(symbol, data));
      });

      await this.sendNotification('🛑 Trading Bot Stopped\n\nNo new positions will be opened.');
    } catch (error) {
      Logger.error('Error stopping trading bot:', error);
      throw error;
    }
  }

  public addSymbol(symbol: string) {
    if (!this.config.symbols.includes(symbol)) {
      this.config.symbols.push(symbol);
      this.historicalPrices.set(symbol, []);
      this.lastUpdate.set(symbol, 0);
      binanceWS.subscribe(symbol, (data) => this.handlePriceUpdate(symbol, data));
    }
  }

  public removeSymbol(symbol: string) {
    const index = this.config.symbols.indexOf(symbol);
    if (index !== -1) {
      this.config.symbols.splice(index, 1);
      this.historicalPrices.delete(symbol);
      this.lastUpdate.delete(symbol);
      binanceWS.unsubscribe(symbol, (data) => this.handlePriceUpdate(symbol, data));
    }
  }
}

// Create singleton instance
export const tradingBot = new TradingBot();