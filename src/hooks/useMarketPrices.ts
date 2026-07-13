import { useState, useCallback } from 'react';

export interface MarketPrices {
  prices: Record<string, { price: number; currency: string }>;
  loading: boolean;
  fetched: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useMarketPrices(symbols: string[]): MarketPrices {
  const [prices, setPrices] = useState<Record<string, { price: number; currency: string }>>({});
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const unique = [...new Set(symbols)].filter(Boolean);
    if (unique.length === 0) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/market/price?symbols=${unique.join(',')}`, {
        signal: AbortSignal.timeout(12000)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Server may return { _error: '...' } when Yahoo Finance is down
      if (data._error) {
        setError(data._error);
        setPrices({});
      } else {
        setPrices(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur réseau');
    } finally {
      setLoading(false);
      setFetched(true);
    }
  }, [symbols.join(',')]);

  return { prices, loading, fetched, error, refresh };
}
