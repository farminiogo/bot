import { RSI, MACD, BollingerBands, EMA, ATR } from 'technicalindicators';
import * as tf from '@tensorflow/tfjs';

// تعريف الاتجاهات بشكل ثابت لتجنب الأخطاء
const TRENDS = Object.freeze({
  UP: 'up' as const,
  DOWN: 'down' as const,
  NEUTRAL: 'neutral' as const
});

// تعريف مستويات المخاطر
type RiskLevel = 'very_low' | 'low' | 'medium' | 'high' | 'very_high';

// تعريف الواجهات المستخدمة
export interface TechnicalIndicators {
  rsi: number;
  macd: { MACD: number; signal: number; histogram: number };
  bollinger: { upper: number; middle: number; lower: number };
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
  recommendation: { action: 'buy' | 'sell' | 'hold'; confidence: number; reason: string };
}

// ** تحسين حسابات المؤشرات الفنية **
function calculateEMA(prices: number[], period: number): number[] {
  return prices.length >= period ? EMA.calculate({ values: prices, period }) : [];
}

function calculateMomentum(prices: number[], period: number = 10): number {
  if (prices.length < period) return 0;
  return (prices[prices.length - 1] - prices[prices.length - period]) / prices[prices.length - period];
}

function findSupportResistance(prices: number[]): { supports: number[]; resistances: number[] } {
  if (prices.length < 20) return { supports: [], resistances: [] };

  const supports = new Set<number>();
  const resistances = new Set<number>();

  for (let i = 2; i < prices.length - 2; i++) {
    if (prices[i] < prices[i - 1] && prices[i] < prices[i + 1]) supports.add(prices[i]);
    if (prices[i] > prices[i - 1] && prices[i] > prices[i + 1]) resistances.add(prices[i]);
  }

  return {
    supports: [...supports].sort((a, b) => a - b).slice(0, 3),
    resistances: [...resistances].sort((a, b) => b - a).slice(0, 3)
  };
}

// ** حساب جميع المؤشرات الفنية **
export async function calculateIndicators(prices: number[]): Promise<TechnicalIndicators | null> {
  if (prices.length < 50) {
    console.error('خطأ: بيانات الأسعار غير كافية للتحليل الفني');
    return null;
  }

  try {
    const rsi = RSI.calculate({ values: prices, period: 14 }).pop() || 0;
    const macdValues = MACD.calculate({ values: prices, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }).pop();
    const bollingerValues = BollingerBands.calculate({ values: prices, period: 20, stdDev: 2 }).pop();
    const emaValues = calculateEMA(prices, 50);
    const atr = ATR.calculate({ high: prices, low: prices, close: prices, period: 14 }).pop() || 0;
    const momentum = calculateMomentum(prices);
    const volume = Math.abs(prices[prices.length - 1] - prices[prices.length - 2]) || 0;

    return {
      rsi,
      macd: macdValues || { MACD: 0, signal: 0, histogram: 0 },
      bollinger: bollingerValues || { upper: 0, middle: 0, lower: 0 },
      ema: emaValues.length ? emaValues[emaValues.length - 1] : prices[prices.length - 1],
      atr,
      volume,
      momentum,
      trendStrength: Math.abs(momentum)
    };
  } catch (error) {
    console.error('خطأ في حساب المؤشرات الفنية:', error);
    return null;
  }
}

// ** حساب مستويات المخاطر **
export function calculateRiskLevels(price: number, indicators: TechnicalIndicators, volatility: number): RiskAnalysis {
  const stopLoss = price * 0.95;
  const takeProfit = price * (1 + volatility / 10);
  const riskLevel: RiskLevel = volatility > 5 ? 'very_high' : volatility > 3 ? 'high' : volatility > 2 ? 'medium' : 'low';

  return {
    stopLoss,
    takeProfit,
    riskLevel,
    riskRatio: volatility / 10,
    maxDrawdown: volatility * 2,
    volatility,
    recommendation: {
      action: indicators.rsi < 30 ? 'buy' : indicators.rsi > 70 ? 'sell' : 'hold',
      confidence: 0.8,
      reason: indicators.rsi < 30 ? 'Oversold market' : indicators.rsi > 70 ? 'Overbought market' : 'Neutral conditions'
    }
  };
}

// ** نموذج الذكاء الاصطناعي للتوقعات السعرية **
async function createPriceModel(): Promise<tf.LayersModel> {
  const model = tf.sequential();
  model.add(tf.layers.lstm({ units: 50, inputShape: [30, 1], returnSequences: true }));
  model.add(tf.layers.lstm({ units: 30, returnSequences: false }));
  model.add(tf.layers.dense({ units: 1 }));

  model.compile({ optimizer: tf.train.adam(0.001), loss: 'meanSquaredError' });
  return model;
}

// ** توقع السعر التالي باستخدام الذكاء الاصطناعي **
export async function predictNextPrice(prices: number[]): Promise<PricePrediction | null> {
  if (prices.length < 30) {
    console.error('خطأ: بيانات الأسعار غير كافية للتوقعات');
    return null;
  }

  const model = await createPriceModel();
  const inputTensor = tf.tensor3d([prices.slice(-30)], [1, 30, 1]);
  const predictionTensor = model.predict(inputTensor) as tf.Tensor;
  const nextPrice = (await predictionTensor.data())[0];

  inputTensor.dispose();
  predictionTensor.dispose();

  return {
    nextPrice,
    confidence: 0.85,
    trend: nextPrice > prices[prices.length - 1] ? TRENDS.UP : TRENDS.DOWN,
    supportLevels: findSupportResistance(prices).supports,
    resistanceLevels: findSupportResistance(prices).resistances,
    timeframe: '1h'
  };
}
