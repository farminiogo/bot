import { useState, useEffect, useRef } from 'react';
import { binanceWS, type PriceData } from '../services/binance';

export function usePriceData(symbol: string) {
  const [priceData, setPriceData] = useState<PriceData | null>(() => 
    binanceWS.getLastData(symbol)
  );
  const lastPriceRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    if (!symbol) return;

    const handlePriceUpdate = (data: PriceData) => {
      if (mountedRef.current) {
        // Only update if price has changed
        if (data.price !== lastPriceRef.current) {
          lastPriceRef.current = data.price;
          setPriceData(data);
        }
      }
    };

    // Get initial data
    const initialData = binanceWS.getLastData(symbol);
    if (initialData) {
      lastPriceRef.current = initialData.price;
      setPriceData(initialData);
    }

    binanceWS.subscribe(symbol, handlePriceUpdate);

    return () => {
      mountedRef.current = false;
      binanceWS.unsubscribe(symbol, handlePriceUpdate);
    };
  }, [symbol]);

  return priceData;
}