import { RSI, MACD, BollingerBands, EMA, ATR } from 'technicalindicators';
import * as tf from '@tensorflow/tfjs';

// أنواع الاتجاهات
const TRENDS = Object.freeze({
  UP: 'up' as const,
  DOWN: 'down' as const,
  NEUTRAL: 'neutral' as const
});

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
  trendStrength: number;
}

export interface PricePrediction {
  nextPrice: number;
  confidence: number;
  trend: typeof TRENDS[keyof typeof TRENDS];
  supportLevels: number[];
  resistanceLevels: number[];
}

async function createLSTMModel(): Promise<tf.LayersModel> {
  const model = tf.sequential();
  model.add(tf.layers.lstm({ units: 50, inputShape: [30, 1], returnSequences: true }));
  model.add(tf.layers.lstm({ units: 30, returnSequences: false }));
  model.add(tf.layers.dense({ units: 1 }));
  model.compile({ optimizer: tf.train.adam(), loss: 'meanSquaredError' });
  return model;
}

export async function predictNextPrice(prices: number[]): Promise<PricePrediction | null> {
  if (prices.length < 30) return null;

  const model = await createLSTMModel();
  const input = tf.tensor3d([prices.slice(-30)], [1, 30, 1]);
  const output = (model.predict(input) as tf.Tensor).dataSync();
  const nextPrice = output[0];
  input.dispose();

  return {
    nextPrice,
    confidence: 0.8,
    trend: nextPrice > prices[prices.length - 1] ? TRENDS.UP : TRENDS.DOWN,
    supportLevels: [],
    resistanceLevels: []
  };
}

export function calculateIndicators(prices: number[]): TechnicalIndicators | null {
  if (prices.length < 50) return null;
  
  const rsi = RSI.calculate({ values: prices, period: 14 }).pop() || 0;
  const macdData = MACD.calculate({ values: prices, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }).pop();
  const macd = macdData ? macdData : { MACD: 0, signal: 0, histogram: 0 };
  const bollinger = BollingerBands.calculate({ values: prices, period: 20, stdDev: 2 }).pop() || { upper: 0, middle: 0, lower: 0 };
  const ema = EMA.calculate({ values: prices, period: 50 }).pop() || 0;
  const atr = ATR.calculate({ high: prices, low: prices, close: prices, period: 14 }).pop() || 0;
  
  return { rsi, macd, bollinger, ema, atr, volume: 0, trendStrength: 0 };
}

export function calculateRiskLevels(price: number, indicators: TechnicalIndicators): RiskLevel {
  if (price < indicators.bollinger.lower) return 'very_low';
  if (price > indicators.bollinger.upper) return 'very_high';
  return 'medium';
}
