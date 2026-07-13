import express from 'express';

const router = express.Router();

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://finance.yahoo.com',
  'Referer': 'https://finance.yahoo.com/',
};

async function fetchYahooQuotes(symbols: string): Promise<any[] | null> {
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/quote?symbols=${encodeURIComponent(symbols)}&lang=en-US&region=US`,
    `https://query2.finance.yahoo.com/v8/finance/quote?symbols=${encodeURIComponent(symbols)}&lang=en-US&region=US`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers: YF_HEADERS });
      if (!res.ok) {
        console.warn(`Yahoo Finance ${res.status} on ${url}`);
        continue;
      }
      const data = await res.json() as any;
      const quotes: any[] = data?.quoteResponse?.result ?? [];
      if (quotes.length > 0) return quotes;
    } catch (e) {
      console.warn('Yahoo Finance fetch error:', e);
    }
  }
  return null;
}

// GET /api/market/price?symbols=AAPL,AMUNDI.PA
router.get('/price', async (req, res) => {
  const { symbols } = req.query;
  if (!symbols || typeof symbols !== 'string') {
    return res.status(400).json({ error: 'symbols query param required' });
  }

  const quotes = await fetchYahooQuotes(symbols);

  if (!quotes) {
    // Return empty result with a soft error flag — don't crash the UI
    return res.json({ _error: 'Prix indisponibles (service Yahoo Finance inaccessible)' });
  }

  const result: Record<string, { price: number; currency: string }> = {};
  for (const quote of quotes) {
    if (quote.symbol && quote.regularMarketPrice != null) {
      result[quote.symbol] = {
        price: quote.regularMarketPrice,
        currency: quote.currency ?? 'USD'
      };
    }
  }
  res.json(result);
});

export default router;
