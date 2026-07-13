import { useState, useCallback } from 'react';
import type { Transaction } from '../types';

const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  BNB: 'binancecoin',
  ADA: 'cardano',
  DOT: 'polkadot',
  AVAX: 'avalanche-2',
  MATIC: 'matic-network',
  POL: 'matic-network',
  LINK: 'chainlink',
  UNI: 'uniswap',
  XRP: 'ripple',
  LTC: 'litecoin',
  DOGE: 'dogecoin',
  SHIB: 'shiba-inu',
  ATOM: 'cosmos',
  NEAR: 'near',
  FTM: 'fantom',
  ALGO: 'algorand',
  VET: 'vechain',
  XLM: 'stellar',
  TRX: 'tron',
  ETC: 'ethereum-classic',
  BCH: 'bitcoin-cash',
  SAND: 'the-sandbox',
  MANA: 'decentraland',
  CRO: 'crypto-com-chain',
  FIL: 'filecoin',
  ICP: 'internet-computer',
  AAVE: 'aave',
  MKR: 'maker',
  COMP: 'compound-governance-token',
  OP: 'optimism',
  ARB: 'arbitrum',
  APT: 'aptos',
  SUI: 'sui',
  INJ: 'injective-protocol',
};

const QUOTE_CURRENCIES = ['EUR', 'USDT', 'USDC', 'BUSD', 'USD', 'BTC', 'ETH', 'BNB'];

export function extractTickerFromDescription(description: string): string | null {
  const upper = description.toUpperCase();

  // Try to find a known pair like "BTCEUR", "ETHUSDT" etc.
  for (const quote of QUOTE_CURRENCIES) {
    for (const ticker of Object.keys(COINGECKO_IDS)) {
      if (upper.includes(ticker + quote) || upper.includes(ticker + '/' + quote)) {
        return ticker;
      }
    }
  }

  // Fallback: look for standalone ticker symbols
  const words = upper.split(/\s+/);
  for (const word of words) {
    const clean = word.replace(/[^A-Z]/g, '');
    if (COINGECKO_IDS[clean]) return clean;
  }

  return null;
}

export function extractUniqueTickersFromTransactions(transactions: Transaction[]): string[] {
  const tickers = new Set<string>();
  for (const tx of transactions) {
    const ticker = extractTickerFromDescription(tx.description);
    if (ticker) tickers.add(ticker);
  }
  return Array.from(tickers);
}

export interface CryptoPrices {
  prices: Record<string, number>;
  loading: boolean;
  lastUpdated: Date | null;
  error: string | null;
  refresh: () => Promise<void>;
  getCoinGeckoId: (ticker: string) => string | null;
}

export function useCryptoPrices(tickers: string[]): CryptoPrices {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getCoinGeckoId = useCallback((ticker: string) => {
    return COINGECKO_IDS[ticker.toUpperCase()] ?? null;
  }, []);

  const refresh = useCallback(async () => {
    const uniqueTickers = [...new Set(tickers)].filter(t => COINGECKO_IDS[t]);
    if (uniqueTickers.length === 0) return;

    const ids = uniqueTickers.map(t => COINGECKO_IDS[t]).join(',');
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=eur`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
      const data: Record<string, { eur: number }> = await res.json();

      const newPrices: Record<string, number> = {};
      for (const ticker of uniqueTickers) {
        const id = COINGECKO_IDS[ticker];
        if (data[id]?.eur != null) {
          newPrices[ticker] = data[id].eur;
        }
      }
      setPrices(newPrices);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur réseau');
    } finally {
      setLoading(false);
    }
  }, [tickers.join(',')]);

  return { prices, loading, lastUpdated, error, refresh, getCoinGeckoId };
}
