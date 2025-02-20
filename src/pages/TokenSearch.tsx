import React, { useState } from 'react';
import { Search, Shield, AlertTriangle, Info, TrendingUp, DollarSign, BarChart2 } from 'lucide-react';
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
  const [searchTrigger, setSearchTrigger] = useState(false);

  const { data: tokenInfo, isLoading, error } = useQuery<TokenData>({
    queryKey: ['tokenInfo', address],
    queryFn: () => getTokenByContract(address),
    enabled: searchTrigger && !!address,
    retry: 1,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchTrigger(true);
  };

  const formatNumber = (num: number) => {
    if (!num || isNaN(num)) return '$0.00';
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
  };

  const getMarketCapDescription = (tokenInfo: TokenData) => {
    const marketCap = tokenInfo.market_data.market_cap.usd;
    const fullyDiluted = tokenInfo.market_data.fully_diluted_valuation?.usd;
    const maxSupply = tokenInfo.market_data.max_supply;
    const circulatingSupply = tokenInfo.market_data.circulating_supply;
    const totalSupply = tokenInfo.market_data.total_supply;

    let description = `Current Market Cap: ${formatNumber(marketCap)}`;
    
    if (fullyDiluted && fullyDiluted > marketCap) {
      description += `\nFully Diluted: ${formatNumber(fullyDiluted)}`;
    }

    if (circulatingSupply && totalSupply) {
      const circulatingPercent = (circulatingSupply / totalSupply) * 100;
      description += `\n${circulatingPercent.toFixed(2)}% of total supply in circulation`;
    }

    return description;
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Token Search</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Search and analyze any token by contract address</p>
      </header>

      <form onSubmit={handleSearch} className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
        <div className="flex gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Enter token contract address (0x...)"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !address}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Search className="w-4 h-4" />
            {isLoading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </form>

      {error ? (
        <div className="bg-red-50 dark:bg-red-900 p-4 rounded-lg">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 dark:text-red-400" />
            <p className="text-red-700 dark:text-red-200">Failed to fetch token information. Please check the address and try again.</p>
          </div>
        </div>
      ) : null}

      {tokenInfo && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
            <div className="flex items-center gap-4 mb-6">
              {tokenInfo.image?.small && (
                <img
                  src={tokenInfo.image.small}
                  alt={tokenInfo.name}
                  className="w-12 h-12 rounded-full"
                />
              )}
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{tokenInfo.name}</h3>
                <p className="text-gray-600 dark:text-gray-400">{tokenInfo.symbol.toUpperCase()}</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">Price (USD)</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  ${tokenInfo.market_data.current_price.usd.toFixed(6)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">Market Cap</span>
                <div className="text-right">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatNumber(tokenInfo.market_data.market_cap.usd)}
                  </span>
                  {tokenInfo.market_data.fully_diluted_valuation?.usd > 0 && (
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      FDV: {formatNumber(tokenInfo.market_data.fully_diluted_valuation.usd)}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">24h Volume</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {formatNumber(tokenInfo.market_data.total_volume.usd)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">24h Change</span>
                <span className={`font-medium ${
                  tokenInfo.market_data.price_change_percentage_24h >= 0
                    ? 'text-green-500'
                    : 'text-red-500'
                }`}>
                  {tokenInfo.market_data.price_change_percentage_24h >= 0 ? '+' : ''}
                  {tokenInfo.market_data.price_change_percentage_24h.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">Circulating Supply</span>
                <div className="text-right">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {tokenInfo.market_data.circulating_supply.toLocaleString()}
                  </span>
                  {tokenInfo.market_data.max_supply && (
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      of {tokenInfo.market_data.max_supply.toLocaleString()} max
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-6">
              <a
                href={`https://etherscan.io/token/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
              >
                <Info className="w-4 h-4" />
                View on Etherscan
              </a>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Market Overview</h3>
              <div className="flex gap-2">
                <div className="flex items-center gap-1">
                  <DollarSign className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">Price</span>
                </div>
                <div className="flex items-center gap-1">
                  <BarChart2 className="w-4 h-4 text-blue-500" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">Volume</span>
                </div>
              </div>
            </div>
            <div className="space-y-6">
              <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400">Market Performance</h4>
                  <TrendingUp className={`w-4 h-4 ${
                    tokenInfo.market_data.price_change_percentage_24h >= 0
                      ? 'text-green-500'
                      : 'text-red-500'
                  }`} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Volume/Market Cap</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      {(tokenInfo.market_data.total_volume.usd / tokenInfo.market_data.market_cap.usd).toFixed(4)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Supply Status</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      {((tokenInfo.market_data.circulating_supply / (tokenInfo.market_data.total_supply || tokenInfo.market_data.max_supply || tokenInfo.market_data.circulating_supply)) * 100).toFixed(2)}%
                    </p>
                  </div>
                </div>
              </div>
              
              {tokenInfo.description?.en && (
                <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">About</h4>
                  <p className="text-sm text-gray-900 dark:text-white line-clamp-4">
                    {tokenInfo.description.en}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TokenSearch;