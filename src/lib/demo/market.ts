/**
 * Cotations de la démo.
 *
 * Le portefeuille de démonstration doit afficher des plus-values plausibles
 * sans interroger ni Yahoo Finance (via `/api/market/price`) ni CoinGecko : les
 * cours du jour sont donc fixes, et l'historique qui a servi aux achats passés
 * en est déduit. Les valeurs sont fictives — aucun de ces titres n'existe.
 */

export type DemoAssetType = 'ETF' | 'ACTION' | 'CRYPTO';

export interface DemoAsset {
  ticker: string;
  /** Libellé des opérations : c'est lui que l'écran Investissements affiche. */
  name: string;
  type: DemoAssetType;
  /** Cours du jour, en euros. */
  price: number;
  /**
   * Trajectoire du cours, en fraction du cours du jour : `[jours écoulés, ratio]`.
   * Elle est volontairement haussière dans l'ensemble — c'est une vitrine —
   * avec une ligne en moins-value pour que le rouge existe aussi.
   */
  path: ReadonlyArray<readonly [number, number]>;
}

export const DEMO_ASSETS: readonly DemoAsset[] = [
  {
    ticker: 'MNDE.PA',
    name: 'Tracker Monde',
    type: 'ETF',
    price: 113.42,
    path: [[0, 1], [120, 0.95], [240, 0.91], [365, 0.88], [540, 0.83], [730, 0.79]],
  },
  {
    ticker: 'EMRG.PA',
    name: 'Tracker Émergents',
    type: 'ETF',
    price: 44.18,
    path: [[0, 1], [120, 0.97], [240, 0.93], [365, 0.9], [540, 0.88], [730, 0.84]],
  },
  {
    ticker: 'AURE.PA',
    name: 'Aurore Énergie',
    type: 'ACTION',
    price: 52.6,
    path: [[0, 1], [120, 0.93], [240, 0.96], [365, 0.91], [540, 0.87], [730, 0.85]],
  },
  {
    ticker: 'NRDS.PA',
    name: 'Nordis Industrie',
    type: 'ACTION',
    price: 35.1,
    path: [[0, 1], [120, 1.03], [240, 1.06], [365, 1.09], [540, 1.12], [730, 1.11]],
  },
  {
    ticker: 'BTC',
    name: 'Bitcoin',
    type: 'CRYPTO',
    price: 86_420,
    path: [[0, 1], [90, 0.94], [180, 0.9], [270, 0.86], [365, 0.83], [540, 0.76], [730, 0.71]],
  },
  {
    ticker: 'ETH',
    name: 'Ethereum',
    type: 'CRYPTO',
    price: 3_180,
    path: [[0, 1], [90, 0.91], [180, 0.87], [270, 0.84], [365, 0.82], [540, 0.74], [730, 0.69]],
  },
];

const BY_TICKER = new Map(DEMO_ASSETS.map((asset) => [asset.ticker, asset]));

export function demoAsset(ticker: string): DemoAsset {
  const asset = BY_TICKER.get(ticker);
  if (!asset) throw new Error(`Actif de démo inconnu : ${ticker}`);
  return asset;
}

/**
 * Cours d'un actif il y a `daysAgo` jours.
 *
 * Interpolation linéaire entre les jalons de la trajectoire, plus un bruit de
 * ±2,5 % fourni par l'appelant (`noise` dans [0, 1[) : sans lui, des achats
 * mensuels tomberaient tous exactement sur la droite et trahiraient la fiction.
 */
export function demoPriceAt(ticker: string, daysAgo: number, noise: number): number {
  const { path, price } = demoAsset(ticker);
  let ratio = path[path.length - 1][1];

  for (let index = 1; index < path.length; index += 1) {
    const [toDays, toRatio] = path[index];
    if (daysAgo <= toDays) {
      const [fromDays, fromRatio] = path[index - 1];
      const progress = (daysAgo - fromDays) / (toDays - fromDays);
      ratio = fromRatio + (toRatio - fromRatio) * progress;
      break;
    }
  }

  const wiggle = daysAgo === 0 ? 1 : 1 + 0.025 * (noise * 2 - 1);
  return Math.round(price * ratio * wiggle * 100) / 100;
}

/** Réponse de `/api/market/price` pour les titres (ETF et actions) de la démo. */
export function demoMarketQuotes(symbols: string[]): Record<string, { price: number; currency: string }> {
  const quotes: Record<string, { price: number; currency: string }> = {};
  for (const symbol of symbols) {
    const asset = BY_TICKER.get(symbol);
    if (asset && asset.type !== 'CRYPTO') quotes[symbol] = { price: asset.price, currency: 'EUR' };
  }
  return quotes;
}

/** Cours des cryptomonnaies, à la place de CoinGecko. */
export function demoCryptoPrices(tickers: string[]): Record<string, number> {
  const prices: Record<string, number> = {};
  for (const ticker of tickers) {
    const asset = BY_TICKER.get(ticker);
    if (asset?.type === 'CRYPTO') prices[ticker] = asset.price;
  }
  return prices;
}
