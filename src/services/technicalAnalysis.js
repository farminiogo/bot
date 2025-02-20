import { RSI, MACD, BollingerBands, EMA } from 'technicalindicators';

// Calculate standard deviation for volatility
function calculateStandardDeviation(values, mean) {
  const squareDiffs = values.map(value => Math.pow(value - mean, 2));
  const avgSquareDiff = squareDiffs.reduce((sum, diff) => sum + diff, 0) / values.length;
  return Math.sqrt(avgSquareDiff);
}

export async function calculateIndicators(prices) {
  if (!Array.isArray(prices) || prices.length < 50) {
    throw new Error('Insufficient price data for technical analysis');
  }

  // Convert prices to numbers and validate
  const validPrices = prices.map(price => Number(price)).filter(price => !isNaN(price));
  if (validPrices.length < 50) {
    throw new Error('Invalid price data');
  }

  try {
    const rsi = RSI.calculate({
      values: validPrices,
      period: 14
    });

    const macd = MACD.calculate({
      values: validPrices,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9
    });

    const bollinger = BollingerBands.calculate({
      values: validPrices,
      period: 20,
      stdDev: 2
    });

    const ema = EMA.calculate({
      values: validPrices,
      period: 50
    });

    // Calculate volatility
    const returns = validPrices.slice(1).map((price, i) => 
      (price - validPrices[i]) / validPrices[i]
    );
    
    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const volatility = calculateStandardDeviation(returns, mean);

    return {
      rsi: rsi[rsi.length - 1] || 50,
      macd: macd[macd.length - 1] || { MACD: 0, signal: 0, histogram: 0 },
      bollinger: bollinger[bollinger.length - 1] || {
        upper: validPrices[validPrices.length - 1] * 1.02,
        middle: validPrices[validPrices.length - 1],
        lower: validPrices[validPrices.length - 1] * 0.98
      },
      ema: ema[ema.length - 1] || validPrices[validPrices.length - 1],
      volatility: volatility || 0
    };
  } catch (error) {
    console.error('Error calculating indicators:', error);
    throw error;
  }
}

export function calculateRiskLevels(currentPrice, indicators, volatility) {
  try {
    // Enhanced risk calculation using multiple factors
    let riskScore = 0;
    
    // RSI extremes
    if (indicators.rsi > 80) riskScore += 3;
    else if (indicators.rsi > 70) riskScore += 2;
    else if (indicators.rsi < 20) riskScore += 3;
    else if (indicators.rsi < 30) riskScore += 2;
    
    // MACD divergence
    if (Math.abs(indicators.macd.histogram) > indicators.macd.signal * 1.5) {
      riskScore += 2;
    }
    
    // Bollinger Band position
    if (currentPrice > indicators.bollinger.upper * 1.05) riskScore += 3;
    else if (currentPrice > indicators.bollinger.upper) riskScore += 2;
    else if (currentPrice < indicators.bollinger.lower * 0.95) riskScore += 3;
    else if (currentPrice < indicators.bollinger.lower) riskScore += 2;
    
    // Volatility factor
    if (volatility > 0.05) riskScore += 2;
    else if (volatility > 0.03) riskScore += 1;

    // Calculate stop loss and take profit levels
    const atrMultiplier = Math.max(2, volatility * 100);
    const stopLoss = currentPrice * (1 - (atrMultiplier * 0.01));
    const takeProfit = currentPrice + ((currentPrice - stopLoss) * 2); // 1:2 risk/reward

    // Determine risk level
    let riskLevel;
    if (riskScore >= 12) riskLevel = 'very_high';
    else if (riskScore >= 8) riskLevel = 'high';
    else if (riskScore >= 5) riskLevel = 'medium';
    else if (riskScore >= 2) riskLevel = 'low';
    else riskLevel = 'very_low';

    return {
      stopLoss,
      takeProfit,
      riskLevel,
      riskRatio: riskScore / 15 // Normalize to 0-1 range
    };
  } catch (error) {
    console.error('Error calculating risk levels:', error);
    // Return safe default values
    return {
      stopLoss: currentPrice * 0.95,
      takeProfit: currentPrice * 1.05,
      riskLevel: 'medium',
      riskRatio: 0.5
    };
  }
}

export async function predictNextPrice(prices) {
  try {
    const windowSize = 30;
    if (!Array.isArray(prices) || prices.length < windowSize) {
      throw new Error('Insufficient data for prediction');
    }

    // Convert prices to numbers and validate
    const validPrices = prices.map(price => Number(price)).filter(price => !isNaN(price));
    if (validPrices.length < windowSize) {
      throw new Error('Invalid price data');
    }

    // Calculate simple moving average
    const sma = validPrices.slice(-windowSize).reduce((sum, price) => sum + price, 0) / windowSize;
    
    // Calculate momentum
    const recentPrices = validPrices.slice(-5);
    const momentum = (recentPrices[recentPrices.length - 1] - recentPrices[0]) / recentPrices[0];
    
    // Predict next price using SMA and momentum
    const nextPrice = sma * (1 + momentum);
    
    // Calculate prediction confidence based on volatility
    const returns = validPrices.slice(1).map((price, i) => 
      (price - validPrices[i]) / validPrices[i]
    );
    
    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const volatility = calculateStandardDeviation(returns, mean);
    const confidence = Math.max(0.1, Math.min(0.9, 1 - volatility));

    // Determine trend
    const currentPrice = validPrices[validPrices.length - 1];
    const trend = nextPrice > currentPrice * 1.01 ? 'up' :
                 nextPrice < currentPrice * 0.99 ? 'down' : 
                 'neutral';

    return {
      nextPrice,
      confidence,
      trend
    };
  } catch (error) {
    console.error('Error predicting price:', error);
    
    // Return a fallback prediction based on simple moving average
    const currentPrice = prices[prices.length - 1];
    return {
      nextPrice: currentPrice,
      confidence: 0.5,
      trend: 'neutral'
    };
  }
}

// Add Math.std helper function
Math.std = function(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return calculateStandardDeviation(values, mean);
};