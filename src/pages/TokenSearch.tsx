import React, { useState } from 'react';
import { Search, AlertTriangle, Info, TrendingUp, DollarSign, BarChart2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getTokenByContract, type TokenData } from '../services/coingecko';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

function TokenSearch() {
  const [address, setAddress] = useState('');
  const [searchTriggered, setSearchTriggered] = useState(false);

  const { data: tokenInfo, isLoading, error } = useQuery<TokenData>(
    ['tokenInfo', address],
    () => getTokenByContract(address),
    {
      enabled: searchTriggered && !!address,
      retry: 2,
      staleTime: 60000,
    }
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchTriggered(true);
  };

  const formatNumber = (num: number) => {
    if (!num || isNaN(num)) return '$0.00';
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Token Search</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Search and analyze any token by contract address</p>
      </header>

      <form onSubmit={handleSearch} className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <div className="flex gap-4">
          <input
            type="text"
            placeholder="Enter token contract address (0x...)"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500"
          />
          <button
            type="submit"
            disabled={isLoading || !address}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2"
          >
            <Search className="w-4 h-4" />
            {isLoading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </form>

      {error && (
        <div className="bg-red-50 dark:bg-red-900 p-4 rounded-lg">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 dark:text-red-400" />
            <p className="text-red-700 dark:text-red-200">Failed to fetch token information. Please check the address and try again.</p>
          </div>
        </div>
      )}

      {tokenInfo && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <div className="flex items-center gap-4 mb-6">
            {tokenInfo.image?.small && (
              <img src={tokenInfo.image.small} alt={tokenInfo.name} className="w-12 h-12 rounded-full" />
            )}
            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{tokenInfo.name}</h3>
              <p className="text-gray-600 dark:text-gray-400">{tokenInfo.symbol.toUpperCase()}</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Price (USD)</span>
              <span className="font-medium text-gray-900 dark:text-white">
                ${tokenInfo.market_data.current_price.usd.toFixed(6)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Market Cap</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {formatNumber(tokenInfo.market_data.market_cap.usd)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TokenSearch;