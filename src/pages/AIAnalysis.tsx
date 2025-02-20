import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Brain, TrendingUp, MessageSquare, BarChart2, AlertTriangle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { usePriceData } from '../hooks/usePriceData';
import { analyzeToken } from '../services/aiAnalysis';
import TechnicalAnalysis from '../components/TechnicalAnalysis';
import { calculateIndicators, calculateRiskLevels, predictNextPrice } from '../services/technicalAnalysis';

const MIN_PRICES_REQUIRED = 50;
const PRICE_UPDATE_INTERVAL = 1000; // 1 second

function AIAnalysis() {
  const [address, setAddress] = useState('');
  const [searchTrigger, setSearchTrigger] = useState(false);
  const [historicalPrices, setHistoricalPrices] = useState<number[]>([]);
  const lastUpdateTime = useRef<number>(0);

  const priceData = usePriceData('BTCUSDT');

  // Update historical prices with debouncing and validation
  useEffect(() => {
    if (!priceData?.price) return;

    const now = Date.now();
    if (now - lastUpdateTime.current < PRICE_UPDATE_INTERVAL) return;

    setHistoricalPrices(prev => {
      // Validate new price
      if (isNaN(priceData.price) || priceData.price <= 0) return prev;

      // Check if price is significantly different (0.1% threshold)
      const lastPrice = prev[prev.length - 1];
      if (lastPrice && Math.abs((priceData.price - lastPrice) / lastPrice) < 0.001) {
        return prev;
      }

      const newPrices = [...prev, priceData.price];
      // Keep last 100 prices (more than needed for analysis)
      return newPrices.slice(-100);
    });

    lastUpdateTime.current = now;
  }, [priceData?.price]);

  // Memoized validation function
  const validateAddress = useCallback((address: string) => {
    if (!address) return false;
    // Basic Ethereum address validation
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }, []);

  // Technical Analysis Query with proper validation
  const { data: technicalData, error: technicalError } = useQuery({
    queryKey: ['technicalAnalysis', historicalPrices],
    queryFn: async () => {
      if (historicalPrices.length < MIN_PRICES_REQUIRED) {
        throw new Error(`Need at least ${MIN_PRICES_REQUIRED} price points for analysis`);
      }

      try {
        const indicators = await calculateIndicators(historicalPrices);
        const riskAnalysis = calculateRiskLevels(
          priceData?.price || 0,
          indicators,
          Math.abs(priceData?.priceChangePercent || 0)
        );
        const prediction = await predictNextPrice(historicalPrices);

        return {
          indicators,
          riskAnalysis,
          prediction,
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('Technical analysis error:', error);
        throw new Error('Failed to perform technical analysis');
      }
    },
    enabled: historicalPrices.length >= MIN_PRICES_REQUIRED && !!priceData?.price,
    staleTime: 5000, // Consider data stale after 5 seconds
    cacheTime: 30000, // Keep in cache for 30 seconds
    retry: 2
  });

  // Token Analysis Query with validation
  const { data: analysis, isLoading, error: analysisError } = useQuery({
    queryKey: ['aiAnalysis', address],
    queryFn: () => {
      if (!validateAddress(address)) {
        throw new Error('Invalid Ethereum address format');
      }
      return analyzeToken(address);
    },
    enabled: searchTrigger && !!address,
    retry: 2,
    staleTime: 30000, // Consider token analysis stale after 30 seconds
    cacheTime: 300000 // Keep in cache for 5 minutes
  });

  const handleAnalyze = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateAddress(address)) {
      alert('Please enter a valid Ethereum address');
      return;
    }
    setSearchTrigger(true);
  };

  // Combine errors for display
  const error = technicalError || analysisError;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">AI Analysis</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Advanced market analysis powered by artificial intelligence</p>
      </header>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Contract Address (Optional)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter token contract address (0x...)"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <button
                onClick={handleAnalyze}
                disabled={isLoading || !address}
                className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Brain className="w-4 h-4" />
                {isLoading ? 'Analyzing...' : 'Analyze'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900 p-4 rounded-lg">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 dark:text-red-400" />
            <p className="text-red-700 dark:text-red-200">Failed to perform AI analysis. Please check the address and try again.</p>
          </div>
        </div>
      )}

      {technicalData && priceData && (
        <TechnicalAnalysis
          symbol="BTCUSDT"
          currentPrice={priceData.price}
          indicators={technicalData.indicators}
          riskAnalysis={technicalData.riskAnalysis}
          prediction={technicalData.prediction}
          historicalPrices={historicalPrices}
        />
      )}

      {analysis && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <BarChart2 className="w-5 h-5 text-primary-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Market Indicators</h3>
            </div>
            <div className="space-y-4">
              {analysis.indicators.map((indicator, index) => (
                <div key={index} className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">{indicator.name}</span>
                  <span className={`font-medium ${
                    indicator.trend === 'up' ? 'text-green-500' :
                    indicator.trend === 'down' ? 'text-red-500' :
                    'text-yellow-500'
                  }`}>
                    {indicator.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <MessageSquare className="w-5 h-5 text-primary-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Sentiment Analysis</h3>
            </div>
            <div className="space-y-4">
              {analysis.sentiment.map((item, index) => (
                <div key={index} className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">{item.source}</span>
                  <span className={`font-medium ${
                    item.sentiment === 'bullish' ? 'text-green-500' :
                    item.sentiment === 'bearish' ? 'text-red-500' :
                    'text-yellow-500'
                  }`}>
                    {item.sentiment.charAt(0).toUpperCase() + item.sentiment.slice(1)} ({Math.round(item.score * 100)}%)
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <TrendingUp className="w-5 h-5 text-primary-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Price Analysis</h3>
            </div>
            {priceData && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">Current Price</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    ${priceData.price.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">24h Change</span>
                  <span className={`font-medium ${
                    priceData.priceChangePercent > 0 ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {priceData.priceChangePercent > 0 ? '+' : ''}
                    {priceData.priceChangePercent.toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">24h Volume</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    ${(priceData.volume * priceData.price).toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {analysis && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <Brain className="w-5 h-5 text-primary-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">AI Insights</h3>
          </div>
          <div className="space-y-4">
            {analysis.insights.map((insight, index) => (
              <div key={index} className={`p-4 rounded-lg ${
                insight.type === 'buy' ? 'bg-green-50 dark:bg-green-900 text-green-700 dark:text-green-100' :
                insight.type === 'sell' ? 'bg-red-50 dark:bg-red-900 text-red-700 dark:text-red-100' :
                insight.type === 'warning' ? 'bg-yellow-50 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-100' :
                'bg-blue-50 dark:bg-blue-900 text-blue-700 dark:text-blue-100'
              }`}>
                <h4 className="font-medium">{insight.title}</h4>
                <p className="text-sm mt-1">{insight.description}</p>
                <div className="text-xs mt-2">
                  Confidence: {Math.round(insight.confidence * 100)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default AIAnalysis;