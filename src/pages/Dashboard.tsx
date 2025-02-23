import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Activity, AlertTriangle, RefreshCw, PlayCircle, Square, Settings } from 'lucide-react';
import { usePriceData } from '../hooks/usePriceData';
import { tradingBot } from '../services/tradingBot';

const TOKENS = [
  { name: 'Bitcoin', symbol: 'BTCUSDT', baseSymbol: 'BTC', coingeckoId: 'bitcoin', marketCap: 1.86e12 },
  { name: 'Ethereum', symbol: 'ETHUSDT', baseSymbol: 'ETH', coingeckoId: 'ethereum', marketCap: 317.24e9 },
  { name: 'BNB', symbol: 'BNBUSDT', baseSymbol: 'BNB', coingeckoId: 'binancecoin', marketCap: 106.74e9 }
];

const CHART_COLORS = ['#F7931A', '#627EEA', '#F3BA2F'];

const formatNumber = (num) => {
  if (!num || isNaN(num)) return '$0.00';
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
};

const Dashboard = () => {
  const [historicalData, setHistoricalData] = useState([]);
  const [error, setError] = useState(null);
  const [isBotEnabled, setIsBotEnabled] = useState(false);
  const [positions, setPositions] = useState(new Map());

  const priceDataMap = TOKENS.reduce((acc, token) => {
    acc[token.symbol] = usePriceData(token.symbol);
    return acc;
  }, {});

  useEffect(() => {
    const interval = setInterval(() => setPositions(tradingBot.getPositions()), 1000);
    return () => clearInterval(interval);
  }, []);

  const toggleBot = async () => {
    if (isBotEnabled) await tradingBot.stop();
    else await tradingBot.start();
    setIsBotEnabled((prev) => !prev);
  };

  useEffect(() => {
    const updateHistoricalData = () => {
      const timestamp = new Date().toLocaleTimeString();
      const priceData = TOKENS.reduce((acc, token) => {
        acc[token.symbol] = priceDataMap[token.symbol]?.price || 0;
        return acc;
      }, {});
      setHistoricalData((prev) => [...prev.slice(-19), { time: timestamp, ...priceData }]);
    };
    const interval = setInterval(updateHistoricalData, 5000);
    return () => clearInterval(interval);
  }, [priceDataMap]);

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Market Overview</h1>
        <button onClick={toggleBot} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium ${isBotEnabled ? 'bg-red-500' : 'bg-green-500'} text-white`}>
          {isBotEnabled ? <><Square className="w-4 h-4" /> Stop Bot</> : <><PlayCircle className="w-4 h-4" /> Start Bot</>}
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {TOKENS.map((token, index) => {
          const priceData = priceDataMap[token.symbol];
          return (
            <div key={token.symbol} className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{token.name}</h3>
              <p className="text-gray-600 dark:text-gray-400">Price: {formatNumber(priceData?.price)}</p>
            </div>
          );
        })}
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Price Trends</h3>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={historicalData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis domain={['auto', 'auto']} />
            <Tooltip />
            {TOKENS.map((token, index) => (
              <Line key={token.symbol} type="monotone" dataKey={token.symbol} stroke={CHART_COLORS[index]} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default Dashboard;
