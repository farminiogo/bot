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

  // Update historical prices with validation
  useEffect(() => {
    if (!priceData?.price) return;

    const now = Date.now();
    if (now - lastUpdateTime.current < PRICE_UPDATE_INTERVAL) return;

    setHistoricalPrices(prev => {
      if (isNaN(priceData.price) || priceData.price <= 0) return prev;
      const lastPrice = prev[prev.length - 1];
      if (lastPrice && Math.abs((priceData.price - lastPrice) / lastPrice) < 0.001) {
        return prev;
      }
      return [...prev, priceData.price].slice(-100);
    });

    lastUpdateTime.current = now;
  }, [priceData?.price]);

  // Validate Ethereum address
  const validateAddress = useCallback((address: string) => {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }, []);

  // Perform technical analysis
  const { data: technicalData, error: technicalError } = useQuery({
    queryKey: ['technicalAnalysis', historicalPrices],
    queryFn: async () => {
      if (historicalPrices.length < MIN_PRICES_REQUIRED) {
        throw new Error(`Need at least ${MIN_PRICES_REQUIRED} price points for analysis`);
      }
      const indicators = await calculateIndicators(historicalPrices);
      const riskAnalysis = calculateRiskLevels(priceData?.price || 0, indicators, Math.abs(priceData?.priceChangePercent || 0));
      const prediction = await predictNextPrice(historicalPrices);
      return { indicators, riskAnalysis, prediction, timestamp: Date.now() };
    },
    enabled: historicalPrices.length >= MIN_PRICES_REQUIRED && !!priceData?.price,
    staleTime: 5000,
    cacheTime: 30000,
    retry: 2
  });

  // Perform AI token analysis
  const { data: analysis, isLoading, error: analysisError } = useQuery({
    queryKey: ['aiAnalysis', address],
    queryFn: () => {
      if (!validateAddress(address)) throw new Error('Invalid Ethereum address format');
      return analyzeToken(address);
    },
    enabled: searchTrigger && !!address,
    retry: 2,
    staleTime: 30000,
    cacheTime: 300000
  });

  const handleAnalyze = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateAddress(address)) {
      alert('Please enter a valid Ethereum address');
      return;
    }
    setSearchTrigger(true);
  };

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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Contract Address (Optional)</label>
            <div className="flex gap-2">
              <input type="text" placeholder="Enter token contract address (0x...)" value={address} onChange={(e) => setAddress(e.target.value)} className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
              <button onClick={handleAnalyze} disabled={isLoading || !address} className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
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
            <p className="text-red-700 dark:text-red-200">{error.message}</p>
          </div>
        </div>
      )}

      {technicalData && priceData && (
        <TechnicalAnalysis symbol="BTCUSDT" currentPrice={priceData.price} indicators={technicalData.indicators} riskAnalysis={technicalData.riskAnalysis} prediction={technicalData.prediction} historicalPrices={historicalPrices} />
      )}
    </div>
  );
}

export default AIAnalysis;
