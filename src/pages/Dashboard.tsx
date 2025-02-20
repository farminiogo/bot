import React, { useEffect, useState, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Activity, AlertTriangle, RefreshCw, PlayCircle, Square, Settings } from 'lucide-react';
import { usePriceData } from '../hooks/usePriceData';
import { tradingBot } from '../services/tradingBot';
import { getTokenByContract, type TokenData } from '../services/coingecko';

interface Token {
  name: string;
  symbol: string;
  contract: string;
  baseSymbol: string;
  coingeckoId: string;
  marketCap: number;
}

const TOKENS: Token[] = [
  {
    name: 'Bitcoin',
    symbol: 'BTCUSDT',
    baseSymbol: 'BTC',
    contract: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
    coingeckoId: 'bitcoin',
    marketCap: 1.86e12
  },
  {
    name: 'Ethereum',
    symbol: 'ETHUSDT',
    baseSymbol: 'ETH',
    contract: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    coingeckoId: 'ethereum',
    marketCap: 317.24e9
  },
  {
    name: 'BNB',
    symbol: 'BNBUSDT',
    baseSymbol: 'BNB',
    contract: '0xB8c77482e45F1F44dE1745F52C74426C631bDD52',
    coingeckoId: 'binancecoin',
    marketCap: 106.74e9
  }
];

const CHART_COLORS = [
  '#F7931A',
  '#627EEA',
  '#F3BA2F',
] as const;

const formatNumber = (num: number): string => {
  if (!num || isNaN(num)) return '$0.00';
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
};

function Dashboard() {
  const [historicalData, setHistoricalData] = useState<any[]>([]);
  const [tokenData, setTokenData] = useState<{[key: string]: TokenData}>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isBotEnabled, setIsBotEnabled] = useState(false);
  const [botConfig, setBotConfig] = useState(tradingBot.getConfig());
  const [positions, setPositions] = useState<Map<string, any>>(new Map());

  const btcPrice = usePriceData('BTCUSDT');
  const ethPrice = usePriceData('ETHUSDT');
  const bnbPrice = usePriceData('BNBUSDT');

  const priceDataMap = {
    BTCUSDT: btcPrice,
    ETHUSDT: ethPrice,
    BNBUSDT: bnbPrice
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setPositions(tradingBot.getPositions());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleStartBot = async () => {
    await tradingBot.start();
    setIsBotEnabled(true);
  };

  const handleStopBot = async () => {
    await tradingBot.stop();
    setIsBotEnabled(false);
  };

  const fetchTokenData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const tokenDataMap = TOKENS.reduce((acc, token) => {
        const priceData = priceDataMap[token.symbol];
        acc[token.symbol] = {
          id: token.coingeckoId,
          symbol: token.baseSymbol,
          name: token.name,
          image: { thumb: '', small: '', large: '' },
          market_data: {
            current_price: { usd: priceData?.price || 0 },
            market_cap: { usd: token.marketCap },
            total_volume: { usd: priceData ? priceData.volume * priceData.price : 0 },
            price_change_percentage_24h: priceData?.priceChangePercent || 0,
            total_supply: 0,
            circulating_supply: 0,
            max_supply: null,
            fully_diluted_valuation: { usd: 0 }
          },
          description: { en: '' }
        };
        return acc;
      }, {} as {[key: string]: TokenData});
      
      setTokenData(tokenDataMap);
    } catch (error) {
      setError('Failed to fetch token data. Please try again later.');
      console.error('Error fetching token data:', error);
    } finally {
      setLoading(false);
    }
  }, [btcPrice, ethPrice, bnbPrice]);

  useEffect(() => {
    fetchTokenData();
    const interval = setInterval(fetchTokenData, 60000);
    return () => clearInterval(interval);
  }, [fetchTokenData]);

  useEffect(() => {
    const updateHistoricalData = () => {
      const timestamp = new Date().toLocaleTimeString();
      const priceData = TOKENS.reduce((acc, token) => {
        const data = priceDataMap[token.symbol];
        acc[token.symbol] = data?.price || 0;
        return acc;
      }, {} as { [key: string]: number });

      setHistoricalData(prev => [...prev, { time: timestamp, ...priceData }].slice(-20));
    };

    const interval = setInterval(updateHistoricalData, 5000);
    updateHistoricalData();
    
    return () => clearInterval(interval);
  }, [btcPrice, ethPrice, bnbPrice]);

  const sortedTokens = TOKENS;

  if (error) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-red-50 dark:bg-red-900/50 rounded-lg">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-200">
            <AlertTriangle className="w-5 h-5" />
            <p>{error}</p>
          </div>
        </div>
        <button
          onClick={fetchTokenData}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Market Overview</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Real-time crypto market analysis and trends</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={isBotEnabled ? handleStopBot : handleStartBot}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium ${
              isBotEnabled
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-green-500 hover:bg-green-600 text-white'
            }`}
          >
            {isBotEnabled ? (
              <>
                <Square className="w-4 h-4" />
                Stop Bot
              </>
            ) : (
              <>
                <PlayCircle className="w-4 h-4" />
                Start Bot
              </>
            )}
          </button>
          <button
            onClick={() => {/* Open settings modal */}}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {isBotEnabled && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Trading Bot Status</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-600 dark:text-gray-400">Active Positions</span>
              <span className="font-medium text-gray-900 dark:text-white">{positions.size}</span>
            </div>
            {Array.from(positions.entries()).map(([symbol, position]) => (
              <div key={symbol} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-gray-900 dark:text-white">{symbol}</span>
                  <span className={`text-sm ${
                    position.entryPrice > position.currentPrice ? 'text-red-500' : 'text-green-500'
                  }`}>
                    {((position.currentPrice - position.entryPrice) / position.entryPrice * 100).toFixed(2)}%
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Entry:</span>
                    <span className="ml-2 text-gray-900 dark:text-white">${position.entryPrice.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Stop Loss:</span>
                    <span className="ml-2 text-red-500">${position.stopLoss.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Take Profit:</span>
                    <span className="ml-2 text-green-500">${position.takeProfit.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Quantity:</span>
                    <span className="ml-2 text-gray-900 dark:text-white">{position.quantity.toFixed(8)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Tracked Tokens</h3>
            <TrendingUp className="w-5 h-5 text-green-500" />
          </div>
          <div className="mt-4 space-y-3">
            {sortedTokens.map((token) => {
              const priceData = priceDataMap[token.symbol];
              return (
                <div key={token.contract} className="flex items-center justify-between">
                  <span className="text-gray-600 dark:text-gray-400">{token.name}</span>
                  <div className="text-right">
                    <div className="font-medium text-gray-900 dark:text-white">
                      ${priceData?.price?.toFixed(2) || '0.00'}
                    </div>
                    <div className={`text-sm ${
                      (priceData?.priceChangePercent || 0) >= 0 ? 'text-green-500' : 'text-red-500'
                    }`}>
                      {(priceData?.priceChangePercent || 0) >= 0 ? '+' : ''}
                      {(priceData?.priceChangePercent || 0).toFixed(2)}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Market Activity</h3>
            <Activity className="w-5 h-5 text-yellow-500" />
          </div>
          <div className="mt-4 space-y-3">
            {sortedTokens.map((token) => {
              const priceData = priceDataMap[token.symbol];
              return (
                <div key={token.contract} className="flex items-center justify-between">
                  <span className="text-gray-600 dark:text-gray-400">{token.name}</span>
                  <div className="text-right">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {formatNumber((priceData?.volume || 0) * (priceData?.price || 0))}
                    </div>
                    <div className="text-sm text-gray-500">
                      24h Volume
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Market Cap</h3>
            <TrendingDown className="w-5 h-5 text-blue-500" />
          </div>
          <div className="mt-4 space-y-3">
            {sortedTokens.map((token) => {
              return (
                <div key={token.contract} className="flex items-center justify-between">
                  <span className="text-gray-600 dark:text-gray-400">{token.name}</span>
                  <div className="text-right">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {formatNumber(token.marketCap)}
                    </div>
                    <div className="text-sm text-gray-500">
                      Market Cap
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Price Trends</h3>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={historicalData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              {sortedTokens.map((token, index) => (
                <Line
                  key={token.contract}
                  type="monotone"
                  dataKey={token.symbol}
                  name={token.name}
                  stroke={CHART_COLORS[index]}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;