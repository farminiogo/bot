import { type TokenData } from './coingecko';
import { calculateIndicators, calculateRiskLevels, predictNextPrice } from './technicalAnalysis';
import { binanceWS } from './binance';

export interface MarketIndicator {
  name: string;
  value: string;
  trend: 'up' | 'down' | 'neutral';
  confidence: number;
}

export interface AIInsight {
  type: 'buy' | 'sell' | 'hold' | 'warning';
  title: string;
  description: string;
  confidence: number;
}

export interface SentimentAnalysis {
  source: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  score: number;
}

function calculateMarketTrend(prices: number[]): { trend: 'up' | 'down' | 'neutral', strength: number } {
  const periods = [7, 25, 99]; // Short, medium, long term
  const trends = periods.map(period => {
    const slice = prices.slice(-period);
    if (slice.length < 2) return 0;
    return (slice[slice.length - 1] - slice[0]) / slice[0];
  });

  const avgTrend = trends.reduce((sum, trend) => sum + trend, 0) / trends.length;
  const strength = Math.abs(avgTrend);

  return {
    trend: avgTrend > 0.01 ? 'up' : avgTrend < -0.01 ? 'down' : 'neutral',
    strength: Math.min(strength * 100, 1)
  };
}

function analyzeVolume(volumes: number[]): { trend: 'up' | 'down' | 'neutral', strength: number } {
  const recentVolumes = volumes.slice(-24); // Last 24 periods
  if (recentVolumes.length < 2) return { trend: 'neutral', strength: 0 };

  const avgVolume = recentVolumes.reduce((sum, vol) => sum + vol, 0) / recentVolumes.length;
  const recentVolume = recentVolumes[recentVolumes.length - 1];
  const volumeChange = (recentVolume - avgVolume) / avgVolume;

  return {
    trend: volumeChange > 0.1 ? 'up' : volumeChange < -0.1 ? 'down' : 'neutral',
    strength: Math.min(Math.abs(volumeChange), 1)
  };
}

export async function analyzeToken(address: string): Promise<{
  indicators: MarketIndicator[];
  insights: AIInsight[];
  sentiment: SentimentAnalysis[];
}> {
  try {
    // Get price data from Binance WebSocket
    const btcData = binanceWS.getLastData('BTCUSDT');
    if (!btcData) {
      throw new Error('No price data available');
    }

    const historicalPrices: number[] = [];
    const historicalVolumes: number[] = [];

    // Collect historical data
    for (let i = 0; i < 100; i++) {
      const price = btcData.price * (1 + (Math.random() * 0.02 - 0.01)); // Simulate historical prices
      const volume = btcData.volume * (1 + (Math.random() * 0.1 - 0.05)); // Simulate historical volumes
      historicalPrices.push(price);
      historicalVolumes.push(volume);
    }

    // Calculate technical indicators
    const indicators = await calculateIndicators(historicalPrices);
    const marketTrend = calculateMarketTrend(historicalPrices);
    const volumeAnalysis = analyzeVolume(historicalVolumes);
    const prediction = await predictNextPrice(historicalPrices);

    // Market Indicators
    const marketIndicators: MarketIndicator[] = [
      {
        name: 'Market Trend',
        value: `${(marketTrend.strength * 100).toFixed(1)}% ${marketTrend.trend.toUpperCase()}`,
        trend: marketTrend.trend,
        confidence: marketTrend.strength
      },
      {
        name: 'Volume Analysis',
        value: `${(volumeAnalysis.strength * 100).toFixed(1)}% ${volumeAnalysis.trend.toUpperCase()}`,
        trend: volumeAnalysis.trend,
        confidence: volumeAnalysis.strength
      },
      {
        name: 'RSI',
        value: indicators.rsi.toFixed(1),
        trend: indicators.rsi > 70 ? 'down' : indicators.rsi < 30 ? 'up' : 'neutral',
        confidence: Math.abs((indicators.rsi - 50) / 50)
      }
    ];

    // Generate insights based on technical analysis
    const insights: AIInsight[] = [];

    // RSI-based insight
    if (indicators.rsi > 70) {
      insights.push({
        type: 'warning',
        title: 'Overbought Conditions',
        description: 'RSI indicates overbought conditions. Consider taking profits.',
        confidence: (indicators.rsi - 70) / 30
      });
    } else if (indicators.rsi < 30) {
      insights.push({
        type: 'buy',
        title: 'Oversold Conditions',
        description: 'RSI indicates oversold conditions. Potential buying opportunity.',
        confidence: (30 - indicators.rsi) / 30
      });
    }

    // MACD-based insight
    if (indicators.macd.histogram > 0 && marketTrend.trend === 'up') {
      insights.push({
        type: 'buy',
        title: 'Bullish MACD Crossover',
        description: 'MACD indicates strong upward momentum.',
        confidence: Math.min(Math.abs(indicators.macd.histogram) / 100, 0.9)
      });
    } else if (indicators.macd.histogram < 0 && marketTrend.trend === 'down') {
      insights.push({
        type: 'sell',
        title: 'Bearish MACD Crossover',
        description: 'MACD indicates strong downward momentum.',
        confidence: Math.min(Math.abs(indicators.macd.histogram) / 100, 0.9)
      });
    }

    // Bollinger Bands insight
    const price = historicalPrices[historicalPrices.length - 1];
    if (price > indicators.bollinger.upper) {
      insights.push({
        type: 'warning',
        title: 'Price Above Upper Band',
        description: 'Price is trading above the upper Bollinger Band. Potential resistance.',
        confidence: 0.8
      });
    } else if (price < indicators.bollinger.lower) {
      insights.push({
        type: 'buy',
        title: 'Price Below Lower Band',
        description: 'Price is trading below the lower Bollinger Band. Potential support.',
        confidence: 0.8
      });
    }

    // Calculate sentiment based on multiple indicators
    const sentiment: SentimentAnalysis[] = [
      {
        source: 'Technical Indicators',
        sentiment: indicators.rsi > 50 ? 'bullish' : 'bearish',
        score: Math.abs((indicators.rsi - 50) / 50)
      },
      {
        source: 'Price Action',
        sentiment: marketTrend.trend === 'up' ? 'bullish' : marketTrend.trend === 'down' ? 'bearish' : 'neutral',
        score: marketTrend.strength
      },
      {
        source: 'Volume Profile',
        sentiment: volumeAnalysis.trend === 'up' ? 'bullish' : volumeAnalysis.trend === 'down' ? 'bearish' : 'neutral',
        score: volumeAnalysis.strength
      }
    ];

    return {
      indicators: marketIndicators,
      insights,
      sentiment
    };
  } catch (error) {
    console.error('Error performing AI analysis:', error);
    throw new Error('Failed to perform AI analysis');
  }
}