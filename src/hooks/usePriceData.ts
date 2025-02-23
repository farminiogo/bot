import { useQuery } from '@tanstack/react-query';

// دالة لجلب بيانات الأسعار من API
const fetchPriceData = async (symbol: string) => {
  try {
    const apiEndpoints = [
      `https://api1.binance.com/api/v3/ticker/24hr?symbol=${symbol}`,
      `https://api2.binance.com/api/v3/ticker/24hr?symbol=${symbol}`,
      `https://api3.binance.com/api/v3/ticker/24hr?symbol=${symbol}`
    ];
    
    for (const endpoint of apiEndpoints) {
      const response = await fetch(endpoint);
      if (response.ok) {
        const data = await response.json();
        return {
          symbol: data.symbol,
          price: parseFloat(data.lastPrice),
          priceChange: parseFloat(data.priceChange),
          priceChangePercent: parseFloat(data.priceChangePercent),
          volume: parseFloat(data.volume),
          high24h: parseFloat(data.highPrice),
          low24h: parseFloat(data.lowPrice),
          lastUpdate: Date.now()
        };
      }
    }
    throw new Error('Failed to fetch price data from all endpoints');
  } catch (error) {
    console.error('Error fetching price data:', error);
    throw error;
  }
};

// هوك يستخدم React Query لجلب البيانات وتحديثها تلقائيًا
export const usePriceData = (symbol: string) => {
  return useQuery([
    'priceData',
    symbol
  ], () => fetchPriceData(symbol), {
    staleTime: 60000, // يجعل البيانات غير قديمة لمدة 60 ثانية لتجنب الطلبات المتكررة
    cacheTime: 300000, // يحتفظ بالبيانات المخزنة مؤقتًا لمدة 5 دقائق
    retry: 2, // إعادة المحاولة مرتين فقط إذا فشل الطلب
    refetchInterval: 60000, // إعادة جلب البيانات كل 60 ثانية تلقائيًا
    onError: (error) => console.error(`Error fetching ${symbol} price data:`, error)
  });
};
