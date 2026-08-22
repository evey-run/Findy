import React, { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../store';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useCryptoPrices, extractTickerFromDescription } from '../hooks/useCryptoPrices';
import { useMarketPrices } from '../hooks/useMarketPrices';
import type { Transaction } from '../types';

interface AssetGroup {
  key: string;
  name: string;
  ticker: string | null;
  assetType: 'CRYPTO' | 'ETF' | 'ACTION' | null;
  transactions: Transaction[];
  netQuantity: number;
  avgBuyPrice: number;
  totalCost: number;
  lastPurchaseDate: string;
}

type AssetType = 'CRYPTO' | 'ETF' | 'ACTION';

const formatAmount = (amount: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString('fr-FR');

export default function Investissement() {
  const {
    transactions,
    banks,
    loadTransactions,
    loadBanks,
    addTransaction,
    removeTransaction,
    requestConfirm,
  } = useAppStore();

  const [localSelectedBank, setLocalSelectedBank] = useState<any>(null);
  const [_loading, setLoading] = useState(true);

  // Add asset modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAsset, setNewAsset] = useState({
    name: '',
    ticker: '',
    assetType: 'CRYPTO' as AssetType,
    quantity: '',
    unitPrice: '',
    date: new Date().toISOString().split('T')[0],
    bankId: ''
  });
  const [addLoading, setAddLoading] = useState(false);

  // Drill-down: selected asset group
  const [selectedGroup, setSelectedGroup] = useState<AssetGroup | null>(null);

  const investmentTransactions = transactions;

  // Group transactions into asset cards
  const assetGroups = useMemo<AssetGroup[]>(() => {
    const map = new Map<string, AssetGroup>();

    for (const tx of investmentTransactions) {
      const txTicker = tx.ticker;
      const txAssetType = tx.assetType;
      const extractedTicker = extractTickerFromDescription(tx.description);
      const ticker = txTicker || extractedTicker || null;
      const key = ticker || tx.description;
      const assetType: AssetGroup['assetType'] = txAssetType || (extractedTicker ? 'CRYPTO' : null);

      if (!map.has(key)) {
        map.set(key, {
          key,
          name: tx.description,
          ticker,
          assetType,
          transactions: [],
          netQuantity: 0,
          avgBuyPrice: 0,
          totalCost: 0,
          lastPurchaseDate: tx.date
        });
      }

      const group = map.get(key)!;
      group.transactions.push(tx);

      // Prefer explicit values from modal-added transactions
      if (txTicker && !group.ticker) group.ticker = txTicker;
      if (txAssetType && !group.assetType) group.assetType = txAssetType;
      if (txTicker) group.name = tx.description;

      // Track most recent purchase date
      if (tx.amount < 0 && new Date(tx.date) > new Date(group.lastPurchaseDate)) {
        group.lastPurchaseDate = tx.date;
      }
    }

    // Calculate KPIs in second pass
    for (const group of map.values()) {
      let buyQty = 0, buyCost = 0, sellQty = 0;
      for (const tx of group.transactions) {
        if (tx.amount < 0) {
          buyQty += tx.quantity || 0;
          buyCost += Math.abs(tx.amount);
        } else {
          sellQty += tx.quantity || 0;
        }
      }
      group.netQuantity = buyQty - sellQty;
      group.totalCost = buyCost;
      group.avgBuyPrice = buyQty > 0 ? buyCost / buyQty : 0;
    }

    return Array.from(map.values()).filter(g => g.netQuantity > 0.0000001);
  }, [investmentTransactions]);

  // Crypto live prices
  const cryptoTickers = useMemo(
    () => assetGroups
      .filter(g => g.assetType === 'CRYPTO' || (!g.assetType && g.ticker))
      .map(g => g.ticker!)
      .filter(Boolean),
    [assetGroups]
  );
  const { prices: cryptoPrices, loading: cryptoLoading, lastUpdated: pricesUpdatedAt, refresh: refreshCryptoPrices } =
    useCryptoPrices(cryptoTickers);

  // Stock/ETF live prices
  const marketSymbols = useMemo(
    () => assetGroups
      .filter(g => g.assetType === 'ETF' || g.assetType === 'ACTION')
      .map(g => g.ticker!)
      .filter(Boolean),
    [assetGroups]
  );
  const { prices: marketPrices, loading: marketLoading, refresh: refreshMarketPrices } = useMarketPrices(marketSymbols);

  const pricesLoading = cryptoLoading || marketLoading;

  const refreshAllPrices = () => {
    if (cryptoTickers.length > 0) refreshCryptoPrices();
    if (marketSymbols.length > 0) refreshMarketPrices();
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        await loadBanks();
        await loadTransactions({ accountType: 'INVESTMENT', forceIgnoreSelectedBank: true } as any);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (cryptoTickers.length > 0) refreshCryptoPrices();
  }, [cryptoTickers.length]);

  useEffect(() => {
    if (marketSymbols.length > 0) refreshMarketPrices();
  }, [marketSymbols.length]);

  const handleBankSelect = async (bank: any) => {
    setLocalSelectedBank(bank);
    await loadTransactions({
      accountType: 'INVESTMENT',
      forceIgnoreSelectedBank: true,
      bankId: bank ? bank.id : undefined
    } as any);
  };

  const handleAddAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseFloat(newAsset.quantity);
    const unitP = parseFloat(newAsset.unitPrice);
    if (isNaN(qty) || qty <= 0) { alert('Quantité invalide.'); return; }
    if (isNaN(unitP) || unitP <= 0) { alert('Prix unitaire invalide.'); return; }
    if (!newAsset.bankId) { alert('Veuillez sélectionner un compte.'); return; }

    setAddLoading(true);
    try {
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: newAsset.name,
          ticker: newAsset.ticker.toUpperCase(),
          assetType: newAsset.assetType,
          quantity: qty,
          unitPrice: unitP,
          amount: -(qty * unitP),
          date: newAsset.date,
          bankId: newAsset.bankId
        })
      });
      if (response.ok) {
        const tx = await response.json();
        addTransaction(tx);
        setShowAddModal(false);
        setNewAsset({
          name: '',
          ticker: '',
          assetType: 'CRYPTO',
          quantity: '',
          unitPrice: '',
          date: new Date().toISOString().split('T')[0],
          bankId: ''
        });
      } else {
        const err = await response.json().catch(() => ({ error: `Erreur HTTP ${response.status}` }));
        alert(`Erreur : ${err.error || response.statusText}`);
      }
    } catch (error) {
      alert(`Erreur réseau : ${error instanceof Error ? error.message : 'inconnue'}`);
    } finally {
      setAddLoading(false);
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    if (!(await requestConfirm('Supprimer cette transaction ?', { title: 'Supprimer la transaction', confirmLabel: 'Supprimer', danger: true }))) return;
    try {
      const response = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
      if (response.ok) {
        removeTransaction(id);
        // If the group becomes empty after deletion, go back to portfolio
        setSelectedGroup(prev => {
          if (!prev) return null;
          const remaining = prev.transactions.filter(t => t.id !== id);
          if (remaining.length === 0) return null;
          return { ...prev, transactions: remaining };
        });
      }
    } catch (error) {
      console.error('Error deleting transaction:', error);
    }
  };

  const getAssetCurrentPrice = (group: AssetGroup): number | undefined => {
    if (!group.ticker) return undefined;
    if (group.assetType === 'CRYPTO' || !group.assetType) return cryptoPrices[group.ticker];
    return marketPrices[group.ticker]?.price;
  };

  const assetTypeBadge = (type: AssetGroup['assetType']) => {
    switch (type) {
      case 'CRYPTO': return { label: 'CRYPTO', cls: 'bg-orange-500/20 text-orange-400 border-orange-500/30' };
      case 'ETF':    return { label: 'ETF',    cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30' };
      case 'ACTION': return { label: 'ACTION', cls: 'bg-green-500/20 text-green-400 border-green-500/30' };
      default:       return { label: 'AUTRE',  cls: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' };
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 gap-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div className="flex-1 min-w-0">
          {selectedGroup ? (
            <>
              <button
                onClick={() => setSelectedGroup(null)}
                className="flex items-center gap-1 text-sm text-zinc-400 hover:text-white transition-colors mb-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Portefeuille
              </button>
              <h2 className="text-2xl font-bold leading-7 text-white sm:text-3xl sm:truncate">
                {selectedGroup.ticker || selectedGroup.name}
              </h2>
              {selectedGroup.ticker && selectedGroup.name !== selectedGroup.ticker && (
                <p className="text-sm text-zinc-400 mt-0.5 truncate">{selectedGroup.name}</p>
              )}
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold leading-7 text-white sm:text-3xl sm:truncate">Investissements</h2>
              <p className="text-sm text-zinc-300 mt-1">Portefeuille par actif</p>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {pricesUpdatedAt && (
            <span className="text-xs text-zinc-400 hidden sm:block">
              Prix : {formatDistanceToNow(pricesUpdatedAt, { addSuffix: true, locale: fr })}
            </span>
          )}
          <button
            onClick={refreshAllPrices}
            disabled={pricesLoading || (cryptoTickers.length === 0 && marketSymbols.length === 0)}
            className="px-3 py-2 text-sm font-medium text-white border border-white/10 rounded-md hover:opacity-80 flex items-center disabled:opacity-40"
            style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
          >
            <svg className={`w-4 h-4 mr-2 ${pricesLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Prix live
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-2 text-sm font-medium text-white border border-transparent rounded-md hover:opacity-80 flex items-center"
            style={{ backgroundColor: '#7c3aed' }}
          >
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Ajouter un actif
          </button>
        </div>
      </div>

      {selectedGroup ? (
        /* ── Drill-down: transaction table for a single asset ── */
        <div className="flex-1 min-h-0 flex flex-col gap-4">
          {/* KPI summary bar */}
          {(() => {
            const currentPrice = getAssetCurrentPrice(selectedGroup);
            const currentValue = currentPrice != null ? selectedGroup.netQuantity * currentPrice : undefined;
            const profitAmount = currentValue != null ? currentValue - selectedGroup.totalCost : undefined;
            const profitPct = profitAmount != null && selectedGroup.totalCost > 0 ? (profitAmount / selectedGroup.totalCost) * 100 : undefined;
            const isProfit = profitAmount != null ? profitAmount >= 0 : undefined;
            const badge = assetTypeBadge(selectedGroup.assetType);
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                  <p className="text-xs text-zinc-400 mb-1">Type</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${badge.cls}`}>
                    {badge.label}
                  </span>
                </div>
                <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                  <p className="text-xs text-zinc-400 mb-1">Quantité nette</p>
                  <p className="text-white font-semibold">{selectedGroup.netQuantity.toLocaleString('fr-FR', { maximumFractionDigits: 6 })}</p>
                </div>
                <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                  <p className="text-xs text-zinc-400 mb-1">Coût total</p>
                  <p className="text-white font-semibold">{formatAmount(selectedGroup.totalCost)}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Moy. {formatAmount(selectedGroup.avgBuyPrice)}</p>
                </div>
                <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                  <p className="text-xs text-zinc-400 mb-1">Valeur actuelle</p>
                  {pricesLoading && currentValue == null ? (
                    <div className="h-5 w-20 bg-white/10 rounded animate-pulse" />
                  ) : currentValue != null ? (
                    <>
                      <p className="text-white font-semibold">{formatAmount(currentValue)}</p>
                      {profitPct != null && (
                        <p className={`text-xs mt-0.5 ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                          {isProfit ? '+' : ''}{formatAmount(profitAmount!)} ({isProfit ? '+' : ''}{profitPct.toFixed(2)}%)
                        </p>
                      )}
                    </>
                  ) : selectedGroup.ticker ? (
                    <p className="text-xs text-zinc-500 italic mt-0.5">Prix non disponible</p>
                  ) : (
                    <p className="text-zinc-500 text-sm">—</p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Transaction table */}
          <div className="flex-1 min-h-0 rounded-2xl overflow-hidden bg-white/5 backdrop-blur-xl border border-white/10">
            <div className="overflow-y-auto h-full custom-scrollbar">
              <table className="w-full divide-y divide-zinc-800">
                <thead className="sticky top-0 z-10 bg-zinc-900/80 backdrop-blur">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Description</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Compte</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-zinc-400 uppercase tracking-wider">Quantité</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-zinc-400 uppercase tracking-wider">Prix unit.</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-zinc-400 uppercase tracking-wider">Montant</th>
                    <th className="px-4 py-3 w-12" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {selectedGroup.transactions
                    .slice()
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map(tx => (
                      <tr key={tx.id} className="hover:bg-white/[0.03] transition-colors group">
                        <td className="px-4 py-3 text-sm text-zinc-300 whitespace-nowrap">
                          {formatDate(tx.date)}
                        </td>
                        <td className="px-4 py-3 text-sm text-white max-w-xs truncate">
                          {tx.description}
                        </td>
                        <td className="px-4 py-3 text-sm text-zinc-300 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: tx.bank.color }}
                            />
                            {tx.bank.shortName || tx.bank.name}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-zinc-300 text-right whitespace-nowrap">
                          {tx.quantity != null ? tx.quantity.toLocaleString('fr-FR', { maximumFractionDigits: 6 }) : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-zinc-300 text-right whitespace-nowrap">
                          {tx.unitPrice != null ? formatAmount(tx.unitPrice) : '—'}
                        </td>
                        <td className={`px-4 py-3 text-sm font-medium text-right whitespace-nowrap ${tx.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {tx.amount >= 0 ? '+' : ''}{formatAmount(tx.amount)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleDeleteTransaction(tx.id)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-red-400"
                            title="Supprimer"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {selectedGroup.transactions.length === 0 && (
                <div className="text-center py-12 text-zinc-500 text-sm">Aucune transaction pour cet actif.</div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ── Portfolio view ── */
        <>
          {/* Bank filter */}
          <div className="flex items-center gap-3">
            <select
              value={localSelectedBank?.id || ''}
              onChange={e => {
                const bank = banks.find(b => b.id === e.target.value);
                handleBankSelect(bank || null);
              }}
              className="rounded-lg text-sm text-white border-none focus:ring-0 py-2 px-3"
              style={{ backgroundColor: '#18191c' }}
            >
              <option value="" style={{ backgroundColor: '#18191c' }}>Tous les comptes</option>
              {banks.filter(b => b.accountType === 'INVESTMENT').map(b => (
                <option key={b.id} value={b.id} style={{ backgroundColor: '#18191c' }}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* Asset cards */}
          {assetGroups.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 py-16">
              <svg className="h-12 w-12 text-zinc-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <p className="text-zinc-400 text-sm">Aucun actif détecté. Ajoutez un actif ou importez un CSV.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {assetGroups.map(group => {
                const currentPrice = getAssetCurrentPrice(group);
                const currentValue = currentPrice != null ? group.netQuantity * currentPrice : undefined;
                const profitAmount = currentValue != null ? currentValue - group.totalCost : undefined;
                const profitPct = profitAmount != null && group.totalCost > 0 ? (profitAmount / group.totalCost) * 100 : undefined;
                const isProfit = profitAmount != null ? profitAmount >= 0 : undefined;
                const badge = assetTypeBadge(group.assetType);

                return (
                  <div
                    key={group.key}
                    onClick={() => setSelectedGroup(group)}
                    className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-5 flex flex-col gap-3 cursor-pointer hover:bg-white/[0.08] hover:border-white/20 transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${badge.cls}`}>
                          {badge.label}
                        </span>
                        <h3 className="text-white font-semibold mt-1 text-sm leading-tight truncate">
                          {group.ticker || group.name}
                        </h3>
                        {group.ticker && group.name !== group.ticker && (
                          <p className="text-zinc-400 text-xs truncate">{group.name}</p>
                        )}
                      </div>
                      {profitPct != null && (
                        <span className={`text-sm font-bold shrink-0 ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                          {isProfit ? '+' : ''}{profitPct.toFixed(2)}%
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-400">Quantité</span>
                        <span className="text-white">{group.netQuantity.toLocaleString('fr-FR', { maximumFractionDigits: 6 })}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-400">Prix moy.</span>
                        <span className="text-white">{formatAmount(group.avgBuyPrice)}</span>
                      </div>
                      {pricesLoading && currentPrice == null ? (
                        <div className="h-4 w-24 bg-white/10 rounded animate-pulse mt-1" />
                      ) : currentPrice != null ? (
                        <>
                          <div className="flex justify-between text-sm">
                            <span className="text-zinc-400">Prix act.</span>
                            <span className={isProfit ? 'text-green-400' : 'text-red-400'}>{formatAmount(currentPrice)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-zinc-400">Valeur</span>
                            <span className="text-white font-medium">{formatAmount(currentValue!)}</span>
                          </div>
                          {profitAmount != null && (
                            <div className="flex justify-between text-sm">
                              <span className="text-zinc-400">P&amp;L</span>
                              <span className={isProfit ? 'text-green-400' : 'text-red-400'}>
                                {isProfit ? '+' : ''}{formatAmount(profitAmount)}
                              </span>
                            </div>
                          )}
                        </>
                      ) : group.ticker ? (
                        <p className="text-xs text-zinc-500 italic mt-0.5">Prix non disponible</p>
                      ) : null}
                    </div>

                    <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                      <p className="text-xs text-zinc-500">
                        Dernier achat : {formatDate(group.lastPurchaseDate)}
                      </p>
                      <p className="text-xs text-zinc-600">{group.transactions.length} tx →</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Add Asset Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
            <div className="px-6 py-4 flex items-center justify-between border-b border-white/10">
              <h3 className="text-lg font-bold text-white">Ajouter un actif</h3>
              <button onClick={() => setShowAddModal(false)} className="text-zinc-400 hover:text-white transition-colors">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleAddAsset} className="px-6 py-5 space-y-4 overflow-y-auto max-h-[70vh]">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Nom / Label *</label>
                <input
                  type="text"
                  value={newAsset.name}
                  onChange={e => setNewAsset(p => ({ ...p, name: e.target.value }))}
                  placeholder="ex: Bitcoin, Apple Inc."
                  required
                  className="w-full rounded-lg text-white text-sm py-2 px-3 border-none focus:ring-0"
                  style={{ backgroundColor: '#18191c' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Ticker *</label>
                <input
                  type="text"
                  value={newAsset.ticker}
                  onChange={e => setNewAsset(p => ({ ...p, ticker: e.target.value.toUpperCase() }))}
                  placeholder="ex: BTC, AAPL, AMUNDI.PA"
                  required
                  className="w-full rounded-lg text-white text-sm py-2 px-3 border-none focus:ring-0"
                  style={{ backgroundColor: '#18191c' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">Type *</label>
                <div className="flex gap-4">
                  {(['CRYPTO', 'ETF', 'ACTION'] as AssetType[]).map(t => (
                    <label key={t} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="assetType"
                        value={t}
                        checked={newAsset.assetType === t}
                        onChange={() => setNewAsset(p => ({ ...p, assetType: t }))}
                        className="accent-violet-500"
                      />
                      <span className="text-sm text-zinc-300">{t}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Quantité *</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={newAsset.quantity}
                  onChange={e => setNewAsset(p => ({ ...p, quantity: e.target.value }))}
                  placeholder="0"
                  required
                  className="w-full rounded-lg text-white text-sm py-2 px-3 border-none focus:ring-0"
                  style={{ backgroundColor: '#18191c' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Prix unitaire (€) *</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={newAsset.unitPrice}
                  onChange={e => setNewAsset(p => ({ ...p, unitPrice: e.target.value }))}
                  placeholder="0.00"
                  required
                  className="w-full rounded-lg text-white text-sm py-2 px-3 border-none focus:ring-0"
                  style={{ backgroundColor: '#18191c' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Date *</label>
                <input
                  type="date"
                  value={newAsset.date}
                  onChange={e => setNewAsset(p => ({ ...p, date: e.target.value }))}
                  required
                  className="w-full rounded-lg text-white text-sm py-2 px-3 border-none focus:ring-0"
                  style={{ backgroundColor: '#18191c' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Compte *</label>
                <select
                  value={newAsset.bankId}
                  onChange={e => setNewAsset(p => ({ ...p, bankId: e.target.value }))}
                  required
                  className="w-full rounded-lg text-white text-sm py-2 px-3 border-none focus:ring-0"
                  style={{ backgroundColor: '#18191c' }}
                >
                  <option value="" style={{ backgroundColor: '#18191c' }}>Sélectionner un compte...</option>
                  {banks.filter(b => b.accountType === 'INVESTMENT').map(b => (
                    <option key={b.id} value={b.id} style={{ backgroundColor: '#18191c' }}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm text-zinc-300 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="px-4 py-2 text-sm text-white rounded-lg hover:opacity-80 disabled:opacity-50 transition-opacity"
                  style={{ backgroundColor: '#7c3aed' }}
                >
                  {addLoading ? 'Ajout...' : 'Ajouter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
