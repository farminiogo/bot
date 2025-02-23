import axios from 'axios';

const COINGECKO_API_BASE_URL = 'https://api.coingecko.com/api/v3';

class CoinGeckoService {
  private static instance: CoinGeckoService;
  private requestTimeout: number = 10000; // 10 seconds timeout

  private constructor() {}

  static getInstance(): CoinGeckoService {
    if (!CoinGeckoService.instance) {
      CoinGeckoService.instance = new CoinGeckoService();
    }
    return CoinGeckoService.instance;
  }

  async fetchCoinData(coinId: string): Promise<any> {
    try {
      const response = await axios.get(`${COINGECKO_API_BASE_URL}/coins/${coinId}`, {
        timeout: this.requestTimeout,
      });
      return response.data;
    } catch (error) {
      console.error(`❌ Error fetching coin data for ${coinId}:`, error);
      return null;
    }
  }

  async fetchMarketData(vsCurrency: string = 'usd', perPage: number = 10): Promise<any> {
    try {
      const response = await axios.get(`${COINGECKO_API_BASE_URL}/coins/markets`, {
        params: {
          vs_currency: vsCurrency,
          order: 'market_cap_desc',
          per_page: perPage,
          page: 1,
          sparkline: false,
        },
        timeout: this.requestTimeout,
      });
      return response.data;
    } catch (error) {
      console.error('❌ Error fetching market data:', error);
      return null;
    }
  }

  async fetchHistoricalData(coinId: string, days: number = 30, vsCurrency: string = 'usd'): Promise<any> {
    try {
      const response = await axios.get(`${COINGECKO_API_BASE_URL}/coins/${coinId}/market_chart`, {
        params: {
          vs_currency: vsCurrency,
          days: days,
          interval: 'daily',
        },
        timeout: this.requestTimeout,
      });
      return response.data;
    } catch (error) {
      console.error(`❌ Error fetching historical data for ${coinId}:`, error);
      return null;
    }
  }
}

export const coinGeckoService = CoinGeckoService.getInstance();
