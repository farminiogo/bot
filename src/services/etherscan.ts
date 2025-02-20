import axios, { AxiosError } from 'axios';
import { formatUnits } from 'viem';

const ETHERSCAN_API_KEY = 'I6CZ13ZCM2EMNAUY73WR1FJW6U9M3RCGTS';
const ETHERSCAN_API_URL = 'https://api.etherscan.io/api';
const CACHE_TTL = 30000; // 30 seconds
const DEFAULT_TIMEOUT = 10000; // 10 seconds

export interface TokenInfo {
  name: string;
  symbol: string;
  totalSupply: string;
  decimals: number;
  holdersCount: number;
  contractUrl: string;
  isVerified: boolean;
  ownerAddress: string | null;
  transactions: number;
  price: number | null;
}

export interface TokenTransaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  timestamp: number;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class TokenCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private readonly ttl: number;

  constructor(ttl: number) {
    this.ttl = ttl;
    // Cleanup expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  set(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

const tokenCache = new TokenCache(CACHE_TTL);

async function fetchWithRetry(
  params: Record<string, string>,
  maxRetries: number = 3
): Promise<any> {
  let lastError: Error | null = null;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

      const response = await axios.get(ETHERSCAN_API_URL, {
        params: {
          ...params,
          apikey: ETHERSCAN_API_KEY
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.data.status === '0') {
        throw new Error(response.data.message || 'API request failed');
      }

      return response.data.result;
    } catch (error) {
      lastError = error as Error;
      retryCount++;

      if (error instanceof AxiosError) {
        // Handle specific error cases
        if (error.response?.status === 429) {
          // Rate limit exceeded - wait longer
          await new Promise(resolve => setTimeout(resolve, 5000));
          continue;
        }

        if (error.response?.status === 404) {
          throw new Error('Contract not found');
        }

        if (error.response?.status >= 500) {
          // Server error - use exponential backoff
          const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 10000);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
          continue;
        }
      }

      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }

      // Network errors - use exponential backoff
      if (retryCount < maxRetries) {
        const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 10000);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        continue;
      }
    }
  }

  throw lastError || new Error('Failed to fetch data after multiple retries');
}

function validateAndEnhanceTokenInfo(contractData: any, totalSupply: string, transactions: any[]): TokenInfo {
  // Extract and validate decimals from ABI if available
  let decimals = 18; // Default to 18
  try {
    if (contractData.ABI && contractData.ABI !== 'Contract source code not verified') {
      const abi = JSON.parse(contractData.ABI);
      const decimalsFunc = abi.find((item: any) => 
        item.name === 'decimals' && item.type === 'function'
      );
      if (decimalsFunc) {
        decimals = parseInt(contractData.decimals || '18');
      }
    }
  } catch (e) {
    console.warn('Failed to parse ABI for decimals:', e);
  }

  // Validate and format total supply
  const formattedSupply = totalSupply && !isNaN(Number(totalSupply))
    ? formatUnits(BigInt(totalSupply), decimals)
    : '0';

  // Estimate holders count from transactions
  const uniqueAddresses = new Set<string>();
  transactions.forEach(tx => {
    uniqueAddresses.add(tx.from.toLowerCase());
    uniqueAddresses.add(tx.to.toLowerCase());
  });
  const estimatedHolders = Math.max(100, uniqueAddresses.size);

  return {
    name: contractData.ContractName || 'Unknown Token',
    symbol: (contractData.ContractName || 'UNKNOWN').slice(0, 5).toUpperCase(),
    totalSupply: formattedSupply,
    decimals,
    holdersCount: estimatedHolders,
    contractUrl: `https://etherscan.io/token/${contractData.Address}`,
    isVerified: contractData.ABI !== 'Contract source code not verified',
    ownerAddress: contractData.ContractCreator || null,
    transactions: transactions.length,
    price: null
  };
}

export async function getTokenInfo(contractAddress: string): Promise<TokenInfo> {
  try {
    // Check cache first
    const cacheKey = `token_info_${contractAddress}`;
    const cachedData = tokenCache.get(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    // Fetch all required data concurrently
    const [contractData, supplyData, transactionsData] = await Promise.allSettled([
      fetchWithRetry({
        module: 'contract',
        action: 'getsourcecode',
        address: contractAddress
      }),
      fetchWithRetry({
        module: 'stats',
        action: 'tokensupply',
        contractaddress: contractAddress
      }),
      fetchWithRetry({
        module: 'account',
        action: 'tokentx',
        contractaddress: contractAddress,
        page: '1',
        offset: '100',
        sort: 'desc'
      })
    ]);

    // Handle individual request results
    const contract = contractData.status === 'fulfilled' ? contractData.value[0] : null;
    const supply = supplyData.status === 'fulfilled' ? supplyData.value : '0';
    const transactions = transactionsData.status === 'fulfilled' ? transactionsData.value : [];

    if (!contract) {
      throw new Error('Failed to fetch contract data');
    }

    const tokenInfo = validateAndEnhanceTokenInfo(contract, supply, transactions);

    // Cache the result
    tokenCache.set(cacheKey, tokenInfo);

    return tokenInfo;
  } catch (error) {
    console.error('Failed to fetch token information:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to fetch token information');
  }
}

export async function getTokenTransactions(
  contractAddress: string,
  page: number = 1,
  limit: number = 100
): Promise<TokenTransaction[]> {
  try {
    // Check cache first
    const cacheKey = `token_tx_${contractAddress}_${page}_${limit}`;
    const cachedData = tokenCache.get(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const transactions = await fetchWithRetry({
      module: 'account',
      action: 'tokentx',
      contractaddress: contractAddress,
      page: page.toString(),
      offset: limit.toString(),
      sort: 'desc'
    });

    if (!Array.isArray(transactions)) {
      throw new Error('Invalid transaction data received');
    }

    const formattedTransactions = transactions.map(tx => ({
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: formatUnits(
        BigInt(tx.value || '0'),
        parseInt(tx.tokenDecimal || '18')
      ),
      timestamp: parseInt(tx.timeStamp || '0')
    }));

    // Cache the result
    tokenCache.set(cacheKey, formattedTransactions);

    return formattedTransactions;
  } catch (error) {
    console.error('Failed to fetch token transactions:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to fetch token transactions');
  }
}