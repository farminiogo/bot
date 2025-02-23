import * as tf from '@tensorflow/tfjs';
import { calculateIndicators } from './technicalAnalysis';

// تعريف أنواع الاتجاهات
const TRENDS = Object.freeze({
  UP: 'up' as const,
  DOWN: 'down' as const,
  NEUTRAL: 'neutral' as const,
});

export interface PricePrediction {
  nextPrice: number;
  confidence: number;
  trend: typeof TRENDS[keyof typeof TRENDS];
  supportLevels: number[];
  resistanceLevels: number[];
  timeframe: '1h' | '4h' | '1d';
}

let modelCache: { model: tf.LayersModel | null; lastUpdate: number } = {
  model: null,
  lastUpdate: 0,
};

const MODEL_CACHE_DURATION = 5 * 60 * 1000; // 5 دقائق

async function createPriceModel(): Promise<tf.LayersModel> {
  const model = tf.sequential();

  model.add(tf.layers.lstm({
    units: 50,
    inputShape: [30, 1],
    returnSequences: true,
  }));
  model.add(tf.layers.dropout({ rate: 0.2 }));

  model.add(tf.layers.lstm({
    units: 30,
    returnSequences: false,
  }));
  model.add(tf.layers.dropout({ rate: 0.1 }));

  model.add(tf.layers.dense({ units: 20, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 10, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 1 }));

  model.compile({ optimizer: tf.train.adam(0.001), loss: 'meanSquaredError' });
  return model;
}

async function trainModel(model: tf.LayersModel, prices: number[]): Promise<void> {
  const windowSize = 30;
  const X = [];
  const y = [];

  for (let i = 0; i < prices.length - windowSize; i++) {
    X.push(prices.slice(i, i + windowSize));
    y.push(prices[i + windowSize]);
  }

  const inputTensor = tf.tensor3d(X, [X.length, windowSize, 1]);
  const outputTensor = tf.tensor2d(y, [y.length, 1]);

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
      },
    },
  });

  inputTensor.dispose();
  outputTensor.dispose();
}

export async function predictNextPrice(prices: number[]): Promise<PricePrediction | null> {
  if (prices.length < 30) {
    console.error('Error: Insufficient data for price prediction');
    return null;
  }

  const now = Date.now();
  if (!modelCache.model || now - modelCache.lastUpdate > MODEL_CACHE_DURATION) {
    modelCache.model = await createPriceModel();
    modelCache.lastUpdate = now;
  }

  const inputData = prices.slice(-30);
  const inputTensor = tf.tensor3d([inputData], [1, 30, 1]);

  const predictionTensor = modelCache.model.predict(inputTensor) as tf.Tensor;
  const prediction = await predictionTensor.data();
  const nextPrice = prediction[0];
  inputTensor.dispose();

  const indicators = await calculateIndicators(prices);
  if (!indicators) return null;

  const priceChange = (nextPrice - prices[prices.length - 1]) / prices[prices.length - 1];
  const trend = priceChange > 0.01 ? TRENDS.UP : priceChange < -0.01 ? TRENDS.DOWN : TRENDS.NEUTRAL;

  return {
    nextPrice,
    confidence: 0.8,
    trend,
    supportLevels: [],
    resistanceLevels: [],
    timeframe: '1h',
  };
}
