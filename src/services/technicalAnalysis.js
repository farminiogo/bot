import { RSI, MACD, BollingerBands, EMA, ATR } from 'technicalindicators';
import * as tf from '@tensorflow/tfjs';

// تعريف نوع الاتجاه
type Trend = 'up' | 'down' | 'neutral';

// تعريف مستويات المخاطر
type RiskLevel = 'very_low' | 'low' | 'medium' | 'high' | 'very_high';

// **1️⃣ - دوال حساب المؤشرات الفنية**
export function calculateIndicators(prices: number[]) {
  if (prices.length < 50) {
    throw new Error('❌ بيانات غير كافية لحساب المؤشرات');
  }

  const rsi = RSI.calculate({ values: prices, period: 14 }).pop() || 50;
  const macd = MACD.calculate({ values: prices, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }).pop() || { MACD: 0, signal: 0 };
  const bollinger = BollingerBands.calculate({ values: prices, period: 20, stdDev: 2 }).pop() || { upper: 0, middle: 0, lower: 0 };
  const ema = EMA.calculate({ values: prices, period: 50 }).pop() || prices[prices.length - 1];
  const atr = ATR.calculate({ high: prices, low: prices, close: prices, period: 14 }).pop() || 0;

  return { rsi, macd, bollinger, ema, atr };
}

// **2️⃣ - تحليل المخاطر ووقف الخسارة**
export function calculateRisk(currentPrice: number, indicators: ReturnType<typeof calculateIndicators>) {
  const riskMultiplier = 2;
  const stopLoss = currentPrice - indicators.atr * riskMultiplier;
  const takeProfit = currentPrice + indicators.atr * riskMultiplier * 2;
  const riskRatio = (currentPrice - stopLoss) / (takeProfit - currentPrice);
  const riskLevel: RiskLevel = riskRatio > 1.5 ? 'high' : riskRatio > 1 ? 'medium' : 'low';

  return { stopLoss, takeProfit, riskLevel };
}

// **3️⃣ - توقع السعر القادم باستخدام التعلم العميق**
export async function predictNextPrice(prices: number[]): Promise<{ nextPrice: number; confidence: number; trend: Trend }> {
  if (prices.length < 30) {
    throw new Error('❌ بيانات غير كافية لتوقع السعر');
  }

  // إنشاء نموذج التعلم العميق
  const model = tf.sequential();
  model.add(tf.layers.lstm({ units: 50, inputShape: [30, 1], returnSequences: true }));
  model.add(tf.layers.lstm({ units: 30, returnSequences: false }));
  model.add(tf.layers.dense({ units: 1 }));

  model.compile({ optimizer: 'adam', loss: 'meanSquaredError' });

  // تجهيز البيانات للنموذج
  const input = tf.tensor3d([prices.slice(-30)], [1, 30, 1]);
  const prediction = (model.predict(input) as tf.Tensor).dataSync()[0];

  // تحليل الاتجاه المتوقع
  const trend: Trend = prediction > prices[prices.length - 1] ? 'up' : prediction < prices[prices.length - 1] ? 'down' : 'neutral';
  const confidence = Math.abs(prediction - prices[prices.length - 1]) / prices[prices.length - 1];

  return { nextPrice: prediction, confidence, trend };
}

// **4️⃣ - إنشاء توصية التداول (شراء/بيع/انتظار)**
export function generateRecommendation(indicators: ReturnType<typeof calculateIndicators>, currentPrice: number) {
  let action: 'buy' | 'sell' | 'hold' = 'hold';
  let confidence = 0.5;
  let reason = 'استقرار السوق';

  if (indicators.rsi < 30 && indicators.macd.MACD > indicators.macd.signal) {
    action = 'buy';
    confidence = 0.85;
    reason = 'السوق في منطقة شراء قوية (Oversold)';
  } else if (indicators.rsi > 70 && indicators.macd.MACD < indicators.macd.signal) {
    action = 'sell';
    confidence = 0.85;
    reason = 'السوق في منطقة بيع قوية (Overbought)';
  }

  return { action, confidence, reason };
}

// **5️⃣ - التحليل الفني الكامل**
export async function analyzeMarket(prices: number[]) {
  try {
    const indicators = calculateIndicators(prices);
    const risk = calculateRisk(prices[prices.length - 1], indicators);
    const prediction = await predictNextPrice(prices);
    const recommendation = generateRecommendation(indicators, prices[prices.length - 1]);

    return { indicators, risk, prediction, recommendation };
  } catch (error) {
    console.error('❌ خطأ أثناء تحليل السوق:', error);
    return null;
  }
}
