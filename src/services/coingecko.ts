import axios, { AxiosError } from 'axios';

const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3';
const CACHE_TTL = 30000; // 30 seconds cache TTL
const DEFAULT_TIMEOUT = 10000; // 10 second timeout

export interface TokenData {
  id: string;
  symbol: string;
  name: string;
  image: {
    thumb: string;
    small: string;
    large: string;
  };
  market_data: {
    current_price: {
      usd: number;
    };
    market_cap: {
      usd: number;
    };
    total_volume: {
      usd: number;
    };
    price_change_percentage_24h: number;
    total_supply: number;
    circulating_supply: number;
    max_supply: number | null;
    fully_diluted_valuation: {
      usd: number;
    };
  };
  description: {
    en: string;
  };
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class TokenDataCache {
  private cache: Map<string, CacheEntry<TokenData>> = new Map();
  private readonly ttl: number;

  constructor(ttl: number) {
    this.ttl = ttl;
    // Cleanup expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  set(key: string, data: TokenData): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  get(key: string): TokenData | null {
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

const tokenCache = new TokenDataCache(CACHE_TTL);

class RateLimiter {
  private lastRequestTime: number = 0;
  private requestCount: number = 0;
  private readonly minRequestInterval: number = 100; // Minimum 100ms between requests
  private readonly maxRequestsPerMinute: number = 50;

  async checkRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    // Reset counter if a minute has passed
    if (timeSinceLastRequest > 60000) {
      this.requestCount = 0;
    }

    // Check rate limits
    if (this.requestCount >= this.maxRequestsPerMinute) {
      const waitTime = 60000 - timeSinceLastRequest;
      if (waitTime > 0) {
        throw new Error(`Rate limit exceeded. Please wait ${Math.ceil(waitTime / 1000)} seconds.`);
      }
      this.requestCount = 0;
    }

    // Ensure minimum interval between requests
    if (timeSinceLastRequest < this.minRequestInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest));
    }

    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  async handleRateLimit(retryAfter?: number): Promise<void> {
    const waitTime = retryAfter ? retryAfter * 1000 : 60000;
    await new Promise(resolve => setTimeout(resolve, waitTime));
    this.requestCount = 0;
  }
}

const rateLimiter = new RateLimiter();

function validateTokenData(data: any): TokenData {
  // Ensure required fields exist with default values if missing
  const validatedData: TokenData = {
    id: data.id || '',
    symbol: data.symbol || '',
    name: data.name || 'Unknown Token',
    image: {
      thumb: data.image?.thumb || '',
      small: data.image?.small || '',
      large: data.image?.large || ''
    },
    market_data: {
      current_price: {
        usd: data.market_data?.current_price?.usd || 0
      },
      market_cap: {
        usd: data.market_data?.market_cap?.usd || 0
      },
      total_volume: {
        usd: data.market_data?.total_volume?.usd || 0
      },
      price_change_percentage_24h: data.market_data?.price_change_percentage_24h || 0,
      total_supply: data.market_data?.total_supply || 0,
      circulating_supply: data.market_data?.circulating_supply || 0,
      max_supply: data.market_data?.max_supply || null,
      fully_diluted_valuation: {
        usd: data.market_data?.fully_diluted_valuation?.usd || 0
      }
    },
    description: {
      en: data.description?.en || ''
    }
  };

  // Calculate missing market data
  if (validatedData.market_data.current_price.usd > 0) {
    // Calculate market cap if missing
    if (validatedData.market_data.market_cap.usd === 0 && validatedData.market_data.circulating_supply > 0) {
      validatedData.market_data.market_cap.usd = 
        validatedData.market_data.current_price.usd * validatedData.market_data.circulating_supply;
    }

    // Calculate fully diluted valuation if missing
    if (validatedData.market_data.fully_diluted_valuation.usd === 0 && validatedData.market_data.max_supply) {
      validatedData.market_data.fully_diluted_valuation.usd = 
        validatedData.market_data.current_price.usd * validatedData.market_data.max_supply;
    }
  }

  return validatedData;
}

async function fetchWithRetry(
  url: string,
  options: any,
  maxRetries: number = 3
): Promise<any> {
  let lastError: Error | null = null;
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
      await rateLimiter.checkRateLimit();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

      const response = await axios.get(url, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return response.data;
    } catch (error) {
      lastError = error as Error;
      retryCount++;

      if (error instanceof AxiosError) {
        // Handle specific error cases
        if (error.response?.status === 429) {
          // Rate limit exceeded
          const retryAfter = parseInt(error.response.headers['retry-after'] || '60');
          await rateLimiter.handleRateLimit(retryAfter);
          continue;
        }

        if (error.response?.status === 404) {
          throw new Error('Token not found');
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

export async function getTokenByContract(contractAddress: string): Promise<TokenData> {
  try {
    // Check cache first
    const cachedData = tokenCache.get(contractAddress);
    if (cachedData) {
      return cachedData;
    }

    const data = await fetchWithRetry(
      `${COINGECKO_API_URL}/coins/ethereum/contract/${contractAddress}`,
      {
        headers: {
          'Accept': 'application/json',
        }
      }
    );

    // Validate and enhance data
    const validatedData = validateTokenData(data);

    // Cache the validated data
    tokenCache.set(contractAddress, validatedData);

    return validatedData;
  } catch (error) {
    console.error('Failed to fetch token data:', error);
    
    // Return fallback data with proper error handling
    const fallbackData = validateTokenData({
      id: contractAddress,
      symbol: 'UNKNOWN',
      name: 'Unknown Token',
      market_data: {
        current_price: { usd: 0 },
        market_cap: { usd: 0 },
        total_volume: { usd: 0 },
        price_change_percentage_24h: 0,
        total_supply: 0,
        circulating_supply: 0,
        max_supply: null,
        fully_diluted_valuation: { usd: 0 }
      }
    });

    return fallbackData;
  }
}