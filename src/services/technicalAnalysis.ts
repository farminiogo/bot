import { RSI, MACD, BollingerBands, EMA, ATR } from 'technicalindicators';
import * as tf from '@tensorflow/tfjs';

// Frozen trend values to prevent modification
const TRENDS = Object.freeze({
  UP: 'up' as const,
  DOWN: 'down' as const,
  NEUTRAL: 'neutral' as const
});

// Risk level types with expanded options
type RiskLevel = 'very_low' | 'low' | 'medium' | 'high' | 'very_high';

export interface TechnicalIndicators {
  rsi: number;
  macd: {
    MACD: number;
    signal: number;
    histogram: number;
  };
  bollinger: {
    upper: number;
    middle: number;
    lower: number;
  };
  ema: number;
  atr: number;
  volume: number;
  momentum: number;
  trendStrength: number;
}

export interface PricePrediction {
  nextPrice: number;
  confidence: number;
  trend: typeof TRENDS[keyof typeof TRENDS];
  supportLevels: number[];
  resistanceLevels: number[];
  timeframe: '1h' | '4h' | '1d';
}

export interface RiskAnalysis {
  stopLoss: number;
  takeProfit: number;
  riskLevel: RiskLevel;
  riskRatio: number;
  maxDrawdown: number;
  volatility: number;
  recommendation: {
    action: 'buy' | 'sell' | 'hold';
    confidence: number;
    reason: string;
  };
}

// Cache for model to avoid reloading
let modelCache: {
  model: tf.LayersModel | null;
  lastUpdate: number;
} = {
  model: null,
  lastUpdate: 0
};

const MODEL_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

function calculateATR(prices: number[], period: number = 14): number {
  try {
    const highs = prices.map(p => p * 1.001); // Simulate high prices
    const lows = prices.map(p => p * 0.999);  // Simulate low prices
    const closes = prices;

    const atr = ATR.calculate({
      high: highs,
      low: lows,
      close: closes,
      period
    });

    return Math.max(0, atr[atr.length - 1] || 0);
  } catch (error) {
    console.error('Error calculating ATR:', error);
    return 0;
  }
}

function calculateEMA(prices: number[], period: number): number[] {
  try {
    const ema = EMA.calculate({
      values: prices,
      period
    });
    return ema;
  } catch (error) {
    console.error('Error calculating EMA:', error);
    return prices;
  }
}

function calculateMomentum(prices: number[], period: number = 10): number {
  try {
    const recentPrices = prices.slice(-period);
    if (recentPrices.length < 2) return 0;

    const momentumValues = recentPrices.map((price, index) => {
      if (index === 0) return 0;
      return (price - recentPrices[index - 1]) / recentPrices[index - 1];
    });

    return momentumValues.reduce((sum, val) => sum + val, 0) / (period - 1);
  } catch (error) {
    console.error('Error calculating momentum:', error);
    return 0;
  }
}

function findSupportResistance(prices: number[], periods: number = 20): { supports: number[], resistances: number[] } {
  try {
    const supports: number[] = [];
    const resistances: number[] = [];
    const window = Math.min(periods, Math.floor(prices.length / 3));

    for (let i = window; i < prices.length - window; i++) {
      const currentPrice = prices[i];
      const leftPrices = prices.slice(i - window, i);
      const rightPrices = prices.slice(i + 1, i + window + 1);

      // Check for support
      if (currentPrice <= Math.min(...leftPrices) && currentPrice <= Math.min(...rightPrices)) {
        supports.push(currentPrice);
      }

      // Check for resistance
      if (currentPrice >= Math.max(...leftPrices) && currentPrice >= Math.max(...rightPrices)) {
        resistances.push(currentPrice);
      }
    }

    // Remove duplicates and sort
    return {
      supports: [...new Set(supports)].sort((a, b) => a - b),
      resistances: [...new Set(resistances)].sort((a, b) => b - a)
    };
  } catch (error) {
    console.error('Error finding support/resistance:', error);
    return { supports: [], resistances: [] };
  }
}

export async function calculateIndicators(prices: number[]): Promise<TechnicalIndicators | null> {
  try {
    // Validate input data
    if (!Array.isArray(prices) || prices.length < 50) {
      console.error('Error: Insufficient price data for technical analysis');
      return null;
    }

    if (prices.some(price => isNaN(price) || price <= 0)) {
      console.error('Error: Invalid price data detected');
      return null;
    }

    // Calculate all indicators with proper error handling
    const [rsi, macd, bollinger, ema, atr] = await Promise.all([
      Promise.resolve(RSI.calculate({
        values: prices,
        period: 14
      })),
      Promise.resolve(MACD.calculate({
        values: prices,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9
      })),
      Promise.resolve(BollingerBands.calculate({
        values: prices,
        period: 20,
        stdDev: 2
      })),
      Promise.resolve(calculateEMA(prices, 50)),
      Promise.resolve(calculateATR(prices))
    ]);

    // Calculate additional indicators
    const momentum = calculateMomentum(prices);
    const volume = prices.length > 1 ? Math.abs(prices[prices.length - 1] - prices[prices.length - 2]) : 0;
    const trendStrength = Math.abs(momentum);

    // Validate results
    if (!rsi.length || !macd.length || !bollinger.length || !ema.length) {
      console.error('Error: Failed to calculate one or more indicators');
      return null;
    }

    return {
      rsi: rsi[rsi.length - 1],
      macd: macd[macd.length - 1],
      bollinger: bollinger[bollinger.length - 1],
      ema: ema[ema.length - 1],
      atr,
      volume,
      momentum,
      trendStrength
    };
  } catch (error) {
    console.error('Error calculating technical indicators:', error);
    return null;
  }
}

export function calculateRiskLevels(
  currentPrice: number,
  indicators: TechnicalIndicators,
  volatility: number
): RiskAnalysis {
  try {
    // Validate inputs
    if (!currentPrice || currentPrice <= 0) {
      throw new Error('Invalid current price');
    }

    if (!indicators || !indicators.rsi || !indicators.macd || !indicators.bollinger || !indicators.ema) {
      throw new Error('Invalid technical indicators');
    }

    // Calculate ATR-based stop loss with dynamic multiplier
    const atrMultiplier = Math.max(2, volatility / 10);
    const stopLossAmount = indicators.atr * atrMultiplier;
    const stopLoss = Math.max(currentPrice * 0.95, currentPrice - stopLossAmount);

    // Calculate dynamic take profit based on volatility and ATR
    const riskAmount = currentPrice - stopLoss;
    const takeProfitRatio = volatility > 5 ? 3 : volatility > 3 ? 2.5 : 2;
    const takeProfit = currentPrice + (riskAmount * takeProfitRatio);

    // Calculate maximum drawdown
    const maxDrawdown = (currentPrice - stopLoss) / currentPrice * 100;

    // Enhanced risk level calculation
    let riskScore = 0;
    
    // RSI extremes
    if (indicators.rsi > 80 || indicators.rsi < 20) riskScore += 2;
    else if (indicators.rsi > 70 || indicators.rsi < 30) riskScore += 1;
    
    // Price vs Bollinger Bands
    if (currentPrice > indicators.bollinger.upper * 1.05) riskScore += 2;
    else if (currentPrice > indicators.bollinger.upper) riskScore += 1;
    else if (currentPrice < indicators.bollinger.lower * 0.95) riskScore += 2;
    else if (currentPrice < indicators.bollinger.lower) riskScore += 1;
    
    // MACD divergence
    if (Math.abs(indicators.macd.histogram) > indicators.macd.signal * 1.5) riskScore += 2;
    else if (Math.abs(indicators.macd.histogram) > indicators.macd.signal) riskScore += 1;
    
    // Volatility factor
    if (volatility > 10) riskScore += 2;
    else if (volatility > 5) riskScore += 1;

    // ATR volatility
    if (indicators.atr / currentPrice > 0.02) riskScore += 2;
    else if (indicators.atr / currentPrice > 0.01) riskScore += 1;

    // Determine risk level based on score
    const riskLevel: RiskLevel = 
      riskScore >= 8 ? 'very_high' :
      riskScore >= 6 ? 'high' :
      riskScore >= 4 ? 'medium' :
      riskScore >= 2 ? 'low' :
      'very_low';

    // Calculate risk ratio with ATR and EMA
    const riskRatio = Math.max(0, Math.min(1,
      (Math.abs((currentPrice - indicators.ema) / currentPrice) + 
       (indicators.atr / currentPrice)) / 2
    ));

    // Generate trading recommendation
    let recommendation = {
      action: 'hold' as const,
      confidence: 0,
      reason: ''
    };

    if (indicators.rsi < 30 && currentPrice < indicators.bollinger.lower && indicators.momentum > 0) {
      recommendation = {
        action: 'buy',
        confidence: 0.8,
        reason: 'Oversold conditions with positive momentum'
      };
    } else if (indicators.rsi > 70 && currentPrice > indicators.bollinger.upper && indicators.momentum < 0) {
      recommendation = {
        action: 'sell',
        confidence: 0.8,
        reason: 'Overbought conditions with negative momentum'
      };
    }

    return {
      stopLoss,
      takeProfit,
      riskLevel,
      riskRatio,
      maxDrawdown,
      volatility,
      recommendation
    };
  } catch (error) {
    console.error('Error calculating risk levels:', error.message);
    // Return safe default values
    return {
      stopLoss: currentPrice * 0.95,
      takeProfit: currentPrice * 1.1,
      riskLevel: 'high',
      riskRatio: 1,
      maxDrawdown: 5,
      volatility: 0,
      recommendation: {
        action: 'hold',
        confidence: 0,
        reason: 'Error calculating risk levels'
      }
    };
  }
}

async function createPriceModel(): Promise<tf.LayersModel> {
  const model = tf.sequential();
  
  // Input LSTM layer with dropout
  model.add(tf.layers.lstm({
    units: 50,
    inputShape: [30, 1],
    returnSequences: true
  }));
  
  model.add(tf.layers.dropout({ rate: 0.2 }));
  
  // Second LSTM layer
  model.add(tf.layers.lstm({
    units: 30,
    returnSequences: false
  }));
  
  model.add(tf.layers.dropout({ rate: 0.1 }));
  
  // Dense layers for better feature extraction
  model.add(tf.layers.dense({
    units: 20,
    activation: 'relu'
  }));
  
  model.add(tf.layers.dense({
    units: 10,
    activation: 'relu'
  }));
  
  // Output layer
  model.add(tf.layers.dense({ units: 1 }));

  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'meanSquaredError'
  });

  return model;
}

async function trainModel(
  model: tf.LayersModel,
  prices: number[]
): Promise<void> {
  try {
    // Prepare data
    const windowSize = 30;
    const X = [];
    const y = [];

    for (let i = 0; i < prices.length - windowSize; i++) {
      X.push(prices.slice(i, i + windowSize));
      y.push(prices[i + windowSize]);
    }

    // Convert to tensors
    const inputTensor = tf.tensor3d(X, [X.length, windowSize, 1]);
    const outputTensor = tf.tensor2d(y, [y.length, 1]);

    try {
      // Train model with early stopping
      await model.fit(inputTensor, outputTensor, {
        epochs: 50,
        batchSize: 32,
        shuffle: true,
        validationSplit: 0.1,
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            if (logs?.val_loss && logs.val_loss < 0.0001) {
              model.stopTraining = true;
            }
          }
        }
      });
    } finally {
      // Clean up tensors
      inputTensor.dispose();
      outputTensor.dispose();
    }
  } catch (error) {
    console.error('Error training model:', error);
    throw error;
  }
}

export async function predictNextPrice(prices: number[]): Promise<PricePrediction | null> {
  try {
    // Validate input data
    if (!Array.isArray(prices) || prices.length < 30) {
      console.error('Error: Insufficient data for price prediction');
      return null;
    }

    // Check model cache
    const now = Date.now();
    if (!modelCache.model || now - modelCache.lastUpdate > MODEL_CACHE_DURATION) {
      modelCache.model = await createPriceModel();
      modelCache.lastUpdate = now;
    }

    // Calculate EMAs for trend analysis
    const ema5 = calculateEMA(prices.slice(-10), 5);
    const ema20 = calculateEMA(prices.slice(-25), 20);

    // Calculate momentum using last 10 periods
    const momentum = calculateMomentum(prices, 10);

    // Find support and resistance levels
    const { supports, resistances } = findSupportResistance(prices);

    // Calculate ATR for volatility assessment
    const atr = calculateATR(prices);

    // Prepare input data
    const windowSize = 30;
    const inputData = prices.slice(-windowSize);
    const inputTensor = tf.tensor3d([inputData], [1, windowSize, 1]);

    try {
      // Make prediction
      const predictionTensor = modelCache.model.predict(inputTensor) as tf.Tensor;
      const prediction = await predictionTensor.data();
      const nextPrice = prediction[0];

      // Calculate confidence based on multiple factors
      const priceVolatility = atr / prices[prices.length - 1];
      const momentumStrength = Math.abs(momentum);
      const trendConsistency = ema5[ema5.length - 1] > ema20[ema20.length - 1] ? 1 : -1;
      
      const confidence = Math.max(0.1, Math.min(0.9,
        (1 - priceVolatility) * // Lower volatility = higher confidence
        (0.6 + 0.4 * momentumStrength) * // Strong momentum = higher confidence
        (0.7 + 0.3 * Math.abs(trendConsistency)) // Consistent trend = higher confidence
      ));

      // Enhanced trend detection
      const currentPrice = prices[prices.length - 1];
      const priceChange = (nextPrice - currentPrice) / currentPrice;
      
      let trend = TRENDS.NEUTRAL;
      let timeframe: PricePrediction['timeframe'] = '1h';
      
      if (priceChange > 0.01 && momentum > 0 && ema5[ema5.length - 1] > ema20[ema20.length - 1]) {
        trend = TRENDS.UP;
        timeframe = Math.abs(priceChange) > 0.05 ? '1d' : Math.abs(priceChange) > 0.02 ? '4h' : '1h';
      } else if (priceChange < -0.01 && momentum < 0 && ema5[ema5.length - 1] < ema20[ema20.length - 1]) {
        trend = TRENDS.DOWN;
        timeframe = Math.abs(priceChange) > 0.05 ? '1d' : Math.abs(priceChange) > 0.02 ? '4h' : '1h';
      }

      return {
        nextPrice,
        confidence,
        trend,
        supportLevels: supports.slice(0, 3), // Top 3 support levels
        resistanceLevels: resistances.slice(0, 3), // Top 3 resistance levels
        timeframe
      };
    } finally {
      // Clean up tensors
      inputTensor.dispose();
    }
  } catch (error) {
    console.error('Error predicting price:', error);
    return null;
  }
}