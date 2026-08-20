import React, { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../store';
import Papa from 'papaparse';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useCryptoPrices, extractTickerFromDescription } from '../hooks/useCryptoPrices';
import { useMarketPrices } from '../hooks/useMarketPrices';
import type { Transaction } from '../types';
import { otherBankOwnersSuffix } from '../lib/bankOwners';

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
    authUser,
  } = useAppStore();

  const [localSelectedBank, setLocalSelectedBank] = useState<any>(null);
  const [_loading, setLoading] = useState(true);

  // CSV import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importBankId, setImportBankId] = useState<string>('');
  const [importProgress, setImportProgress] = useState<{
    isImporting: boolean;
    imported: number;
    total: number;
    errors: string[];
  }>({ isImporting: false, imported: 0, total: 0, errors: [] });

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

  const handleOpenImportModal = () => {
    setShowImportModal(true);
    setCsvFile(null);
    setImportBankId(localSelectedBank?.id || '');
    setImportProgress({ isImporting: false, imported: 0, total: 0, errors: [] });
  };

  const handleImportCSV = async () => {
    if (!csvFile || !importBankId) {
      alert("Veuillez sélectionner un fichier CSV et un compte d'investissement");
      return;
    }

    setImportProgress({ isImporting: true, imported: 0, total: 0, errors: [] });

    try {
      Papa.parse(csvFile, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          console.log('📄 CSV parsed:', results);
          const { data, errors } = results;
          let importErrors: string[] = [];
          if (errors.length > 0) {
            importErrors = errors.map(err => `Ligne ${err.row}: ${err.message}`);
          }
          if (data.length > 0) {
            const firstRow = data[0] as any;
            console.log('🔍 Colonnes détectées:', Object.keys(firstRow));
            console.log('🔍 Premier échantillon de données:', firstRow);
          }
          setImportProgress(prev => ({ ...prev, total: data.length }));
          const chosenBankId = importBankId || localSelectedBank?.id || (banks.find(b => b.accountType === 'INVESTMENT')?.id || '');
          if (!chosenBankId) {
            const errMsg = "Aucun compte d'investissement sélectionné.";
            setImportProgress(prev => ({ ...prev, isImporting: false, errors: [errMsg] }));
            return;
          }
          const isBoursobankInvestmentFormat = detectBoursobankInvestmentFormat(data[0]);
          const isBinanceFormat = detectBinanceFormat(data[0]);
          const isPeerBerryFormat = detectPeerBerryFormat(data[0]);
          console.log('Format Boursobank:', isBoursobankInvestmentFormat);
          console.log('Format Binance:', isBinanceFormat);
          console.log('Format PeerBerry:', isPeerBerryFormat);

          for (let i = 0; i < data.length; i++) {
            const row = data[i] as any;
            try {
              const normalizedRow: any = {};
              Object.keys(row).forEach(key => {
                const normalizedKey = key.toLowerCase()
                  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '');
                normalizedRow[normalizedKey] = row[key];
              });
              const allEmpty = Object.values(normalizedRow).every(v => v === null || v === undefined || String(v).trim() === '');
              if (allEmpty) {
                setImportProgress(prev => ({ ...prev, imported: i + 1 }));
                continue;
              }

              let transactionData;
              if (isBoursobankInvestmentFormat) {
                transactionData = processBoursobankInvestmentRow(normalizedRow, chosenBankId, importErrors, i);
                if (!transactionData) continue;
              } else if (isBinanceFormat) {
                transactionData = processBinanceRow(normalizedRow, chosenBankId, importErrors, i);
                if (!transactionData) continue;
              } else if (isPeerBerryFormat) {
                transactionData = processPeerBerryRow(normalizedRow, chosenBankId, importErrors, i);
                if (!transactionData) continue;
              } else {
                let dateValue, descriptionValue, amountValue;
                const dateKeys = ['date','dateoperaton','dateval','datevaleur','date_operation','date_valeur','date_compta','datecomptable','dateop','lastmovementdate'];
                const descriptionKeys = ['description','libelle','intitule','operation','designation','motif','reference','communication','label','name','title','project','type'];
                const amountKeys = ['montant','amount','debit','credit','somme','valeur','amountvariation','sum','cashflow','paymentamount'];
                const unitPriceKeys = ['unitprice','prixunitaire','prix_unitaire','prix','price','lastprice','coursunitaire','cours'];
                const quantityKeys = ['quantity','quantite','nombre','nombre_parts','parts','qte','qty'];
                for (const key of dateKeys) { if (normalizedRow[key] !== undefined && normalizedRow[key] !== '') { dateValue = normalizedRow[key]; break; } }
                for (const key of descriptionKeys) { if (normalizedRow[key] !== undefined && normalizedRow[key] !== '') { descriptionValue = normalizedRow[key]; break; } }
                if (!descriptionValue) {
                  const keyWithProject = Object.keys(normalizedRow).find(k => k.includes('projecttitle') || k.includes('projectname'));
                  if (keyWithProject && normalizedRow[keyWithProject]) descriptionValue = normalizedRow[keyWithProject];
                }
                for (const key of amountKeys) { if (normalizedRow[key] !== undefined && normalizedRow[key] !== '') { amountValue = normalizedRow[key]; break; } }
                let unitPriceValue;
                for (const key of unitPriceKeys) { if (normalizedRow[key] !== undefined && normalizedRow[key] !== '') { unitPriceValue = normalizedRow[key]; break; } }
                let quantityValue;
                for (const key of quantityKeys) { if (normalizedRow[key] !== undefined && normalizedRow[key] !== '') { quantityValue = normalizedRow[key]; break; } }
                if (amountValue === undefined) {
                  const debitValue = normalizedRow['debit'] || normalizedRow['debits'];
                  const creditValue = normalizedRow['credit'] || normalizedRow['credits'];
                  if (debitValue !== undefined && debitValue !== '') {
                    amountValue = `-${Math.abs(parseFloat(String(debitValue).replace(/[^0-9.,-]/g, '').replace(',', '.')))}`;
                  } else if (creditValue !== undefined && creditValue !== '') {
                    amountValue = Math.abs(parseFloat(String(creditValue).replace(/[^0-9.,-]/g, '').replace(',', '.')));
                  }
                }
                console.log(`🔍 Ligne ${i + 1} - Date: "${dateValue}", Description: "${descriptionValue}", Montant: "${amountValue}"`);
                if (!descriptionValue) {
                  const typeVal = normalizedRow['type'] || normalizedRow['operation'] || normalizedRow['category'];
                  const projectVal = normalizedRow['project'] || normalizedRow['title'] || normalizedRow['loanname'] || normalizedRow['name'];
                  const commentVal = normalizedRow['comment'] || normalizedRow['note'] || normalizedRow['details'];
                  const parts = [typeVal, projectVal, commentVal].map(v => (v !== undefined && v !== null ? String(v).trim() : '')).filter(Boolean);
                  if (parts.length > 0) descriptionValue = parts.join(' - ');
                }
                if (!dateValue || amountValue === undefined) {
                  const missingFields = [] as string[];
                  if (!dateValue) missingFields.push('date');
                  if (amountValue === undefined) missingFields.push('montant');
                  importErrors.push(`Ligne ${i + 2}: Données manquantes (${missingFields.join(', ')}) - Colonnes: ${Object.keys(normalizedRow).join(', ')}`);
                  continue;
                }
                let parsedDate: Date;
                const dateStr = String(dateValue).trim();
                if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                  parsedDate = new Date(dateStr);
                } else if (dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
                  const [day, month, year] = dateStr.split('/');
                  parsedDate = new Date(`${year}-${month}-${day}`);
                } else if (dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
                  const [day, month, year] = dateStr.split('-');
                  parsedDate = new Date(`${year}-${month}-${day}`);
                } else {
                  importErrors.push(`Ligne ${i + 2}: Format de date non reconnu (${dateStr})`);
                  continue;
                }
                if (isNaN(parsedDate.getTime())) {
                  importErrors.push(`Ligne ${i + 2}: Date invalide (${dateStr})`);
                  continue;
                }
                let amount: number;
                const amountStr = String(amountValue).trim().replace(/\s/g, '');
                if (amountStr.includes(',') && !amountStr.includes('.')) {
                  amount = parseFloat(amountStr.replace(/[^0-9,-]/g, '').replace(',', '.'));
                } else {
                  amount = parseFloat(amountStr.replace(/[^0-9.-]/g, ''));
                }
                if (isNaN(amount)) {
                  importErrors.push(`Ligne ${i + 2}: Montant invalide (${amountStr})`);
                  continue;
                }
                const upperDesc = String(descriptionValue || '').trim().toUpperCase();
                if ((upperDesc === 'INVESTEMENT' || upperDesc === 'INVESTMENT') && amount > 0) amount = -amount;
                let unitPrice: number | null = null;
                if (unitPriceValue !== undefined) {
                  const unitPriceStr = String(unitPriceValue).trim().replace(/\s/g, '');
                  if (unitPriceStr.includes(',') && !unitPriceStr.includes('.')) {
                    unitPrice = parseFloat(unitPriceStr.replace(/[^0-9,-]/g, '').replace(',', '.'));
                  } else {
                    unitPrice = parseFloat(unitPriceStr.replace(/[^0-9.-]/g, ''));
                  }
                  if (isNaN(unitPrice)) unitPrice = null;
                }
                let quantity: number | null = null;
                if (quantityValue !== undefined) {
                  const quantityStr = String(quantityValue).trim().replace(/\s/g, '');
                  if (quantityStr.includes(',') && !quantityStr.includes('.')) {
                    quantity = parseFloat(quantityStr.replace(/[^0-9,-]/g, '').replace(',', '.'));
                  } else {
                    quantity = parseFloat(quantityStr.replace(/[^0-9.-]/g, ''));
                  }
                  if (isNaN(quantity)) quantity = null;
                }
                transactionData = {
                  amount,
                  description: String(descriptionValue || 'Import CSV').trim(),
                  date: parsedDate.toISOString(),
                  createdAt: parsedDate.toISOString(),
                  bankId: chosenBankId,
                  checked: false,
                  unitPrice,
                  quantity
                };
              }

              if (!transactionData) {
                importErrors.push(`Ligne ${i + 2}: Impossible de créer la transaction`);
                continue;
              }
              if (!transactionData.amount && transactionData.amount !== 0) {
                importErrors.push(`Ligne ${i + 2}: Montant manquant`);
                continue;
              }
              if (!transactionData.description || transactionData.description.trim() === '') {
                importErrors.push(`Ligne ${i + 2}: Description manquante`);
                continue;
              }
              if (!transactionData.bankId) {
                importErrors.push(`Ligne ${i + 2}: ID de compte manquant`);
                continue;
              }

              console.log(`📝 Creating transaction ${i + 1}:`, transactionData);
              const response = await fetch('/api/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(transactionData)
              });
              if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                importErrors.push(`Ligne ${i + 2}: ${errorData.error || 'Erreur lors de la création'}`);
              }
            } catch (error) {
              console.error(`Error processing row ${i + 1}:`, error);
              importErrors.push(`Ligne ${i + 2}: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
            }
            setImportProgress(prev => ({ ...prev, imported: i + 1, errors: importErrors }));
          }

          await loadTransactions();
          setImportProgress(prev => ({ ...prev, isImporting: false, errors: importErrors }));

          if (importErrors.length === 0) {
            alert(`✅ Import terminé avec succès!\n${data.length} transaction(s) importée(s).`);
            setShowImportModal(false);
            setCsvFile(null);
          } else {
            alert(`⚠️ Import terminé avec ${importErrors.length} erreur(s).`);
          }
        },
        error: (error) => {
          console.error('CSV parsing error:', error);
          setImportProgress(prev => ({ ...prev, isImporting: false, errors: [`Erreur de parsing CSV: ${error.message}`] }));
        }
      });
    } catch (error) {
      console.error('Import error:', error);
      setImportProgress({ isImporting: false, imported: 0, total: 0, errors: [`Erreur: ${error instanceof Error ? error.message : 'Erreur inconnue'}`] });
    }
  };

  const detectBoursobankInvestmentFormat = (row: any): boolean => {
    if (!row) return false;
    const normalizedKeys = Object.keys(row).map(key =>
      key.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '')
    );
    console.log('Colonnes normalisées pour détection format:', normalizedKeys);
    const requiredColumns = ['name', 'isin', 'quantity', 'buyingprice', 'lastprice', 'amount'];
    const hasRequiredColumns = requiredColumns.every(col =>
      normalizedKeys.some(key => key === col || key.includes(col))
    );
    const userFormatColumns = ['name','isin','quantity','buyingprice','lastprice','intradayvariation','amount','amountvariation','variation','lastmovementdate','compensation'];
    const isUserFormat = userFormatColumns.every(col =>
      normalizedKeys.some(key => key === col || key.includes(col))
    );
    return hasRequiredColumns || isUserFormat;
  };

  const detectBinanceFormat = (row: any): boolean => {
    if (!row) return false;
    const normalizedKeys = Object.keys(row).map(key =>
      key.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '')
    );
    const requiredColumns = ['dateutc','date(utc)','orderno','pair','type','side','tradingtotal','trading_total'];
    const matchCount = requiredColumns.filter(col =>
      normalizedKeys.some(key => key === col || key.includes(col))
    ).length;
    return matchCount >= 4;
  };

  const detectPeerBerryFormat = (row: any): boolean => {
    if (!row) return false;
    const normalizedKeys = Object.keys(row).map(key =>
      key.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '')
    );
    const candidates = ['date','type','project','title','loanname','loanid','amount','sum','cashflow','paymentamount','currency','comment','note','balance','id'];
    const hasDate = normalizedKeys.some(k => k === 'date' || k.includes('date'));
    const hasAmount = normalizedKeys.some(k => k === 'amount' || k.includes('amount') || k === 'sum' || k.includes('cashflow') || k.includes('paymentamount'));
    const hasDescriptor = normalizedKeys.some(k => ['type','project','title','loanname'].some(t => k === t || k.includes(t)));
    const matchCount = candidates.filter(col => normalizedKeys.some(k => k === col || k.includes(col))).length;
    const isPeerBerry = hasDate && hasAmount && hasDescriptor && matchCount >= 3;
    if (isPeerBerry) console.log('Détection format PeerBerry - colonnes:', normalizedKeys);
    return isPeerBerry;
  };

  const processPeerBerryRow = (row: any, bankId: string, importErrors: string[], rowIndex: number): any => {
    try {
      if (!bankId) { importErrors.push(`Ligne ${rowIndex + 2}: Compte non spécifié`); return null; }
      const dateValue = row['date'] || row['transactiondate'] || row['dateoperation'] || row['dateop'];
      const amountValue = row['amount'] || row['montant'] || row['sum'] || row['cashflow'] || row['paymentamount'];
      const currency = row['currency'] || row['devise'];
      const type = row['type'] || row['operation'] || row['category'];
      const project = row['project'] || row['title'] || row['loanname'] || row['projet'] || row['name'];
      const comment = row['comment'] || row['note'] || row['description'] || row['details'];
      if (!dateValue || amountValue === undefined) {
        importErrors.push(`Ligne ${rowIndex + 2}: Données manquantes (date ou montant)`);
        return null;
      }
      let parsedDate: Date | null = null;
      const rawDate = String(dateValue).trim();
      if (/^\d{2}\.\d{2}\.\d{4}(\s+\d{2}:\d{2}(:\d{2})?)?$/.test(rawDate)) {
        const [dpart, tpart] = rawDate.split(/\s+/);
        const [d, m, y] = dpart.split('.');
        parsedDate = new Date(`${y}-${m}-${d}${tpart ? 'T' + tpart : ''}`);
      } else if (/^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
        parsedDate = new Date(rawDate);
      } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(rawDate)) {
        const [d, m, y] = rawDate.split('/');
        parsedDate = new Date(`${y}-${m}-${d}`);
      }
      if (!parsedDate || isNaN(parsedDate.getTime())) {
        importErrors.push(`Ligne ${rowIndex + 2}: Format de date PeerBerry non reconnu (${rawDate})`);
        return null;
      }
      let amount: number;
      const amountStr = String(amountValue).trim().replace(/\s/g, '');
      if (amountStr.includes(',') && !amountStr.includes('.')) {
        amount = parseFloat(amountStr.replace(/[^0-9,-]/g, '').replace(',', '.'));
      } else {
        amount = parseFloat(amountStr.replace(/[^0-9.-]/g, ''));
      }
      if (isNaN(amount)) { importErrors.push(`Ligne ${rowIndex + 2}: Montant PeerBerry invalide (${amountStr})`); return null; }
      const upperType = String(type || '').trim().toUpperCase();
      if ((upperType === 'INVESTEMENT' || upperType === 'INVESTMENT') && amount > 0) amount = -amount;
      const parts = [type, project, comment].map(v => (v !== undefined && v !== null ? String(v).trim() : '')).filter(Boolean);
      const description = parts.length > 0 ? parts.join(' - ') : 'PeerBerry';
      const cleanDescription = description.replace(/\s*-\s*$/, '').trim();
      return {
        amount,
        description: cleanDescription,
        date: parsedDate.toISOString(),
        createdAt: parsedDate.toISOString(),
        bankId,
        checked: false,
        unitPrice: null,
        quantity: null,
        metadata: { platform: 'PeerBerry', currency: currency || 'EUR', type: type || undefined, project: project || undefined }
      };
    } catch (e) {
      console.error(`Error processing PeerBerry row ${rowIndex + 1}:`, e);
      importErrors.push(`Ligne ${rowIndex + 2}: Erreur traitement PeerBerry`);
      return null;
    }
  };

  const processBinanceRow = (row: any, bankId: string, importErrors: string[], rowIndex: number): any => {
    try {
      console.log('Traitement ligne CSV format Binance:', row);
      if (!bankId) { importErrors.push(`Ligne ${rowIndex + 2}: Compte non spécifié`); return null; }
      const dateValue = row['date(utc)'] || row['dateutc'] || row['date'] || row['utcdate'] || row['time'] || row['timestamp'];
      const orderNo = row['orderno'] || row['order_no'] || row['orderid'] || row['order_id'] || row['id'] || row['transaction_id'];
      const pair = row['pair'] || row['symbol'] || row['market'] || row['coin'] || row['asset'];
      const type = row['type'] || row['ordertype'] || row['order_type'] || row['operation'] || row['operation_type'];
      const side = row['side'] || row['direction'] || row['tradeside'] || row['trade_side'] || row['operation'];
      let amountValue;
      const possibleAmountFields = ['tradingtotal','trading_total','total','amount','value','eur','usd','fiat_amount','fiat','cost','total_cost'];
      for (const field of possibleAmountFields) {
        const variants = [field, field.toLowerCase(), field.toUpperCase(), field.charAt(0).toUpperCase() + field.slice(1)];
        for (const variant of variants) {
          if (row[variant] !== undefined && row[variant] !== '') { amountValue = row[variant]; break; }
        }
        if (amountValue !== undefined) break;
      }
      if ((!amountValue && amountValue !== 0) || amountValue === '') {
        const priceValue = row['averageprice'] || row['average_price'] || row['price'] || row['unitprice'] || row['unit_price'] || row['price_eur'] || row['price_usd'];
        const quantityValue = row['executed'] || row['quantity'] || row['qty'] || row['size'] || row['volume'] || row['amount'];
        if (priceValue && quantityValue) {
          try {
            const price = parseFloat(String(priceValue).replace(/[^0-9.-]/g, '').replace(',', '.'));
            const qty = parseFloat(String(quantityValue).replace(/[^0-9.-]/g, '').replace(',', '.'));
            amountValue = price * qty;
          } catch (e) { console.warn('Failed to calculate amount:', e); }
        }
      }
      let parsedDate: Date;
      try {
        parsedDate = dateValue ? new Date(dateValue) : new Date();
        if (isNaN(parsedDate.getTime())) {
          const formats = [
            (val: string) => new Date(parseInt(val)),
            (val: string) => { const p = val.split('/'); return new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0])); },
            (val: string) => { const p = val.split('/'); return new Date(parseInt(p[2]), parseInt(p[0]) - 1, parseInt(p[1])); }
          ];
          for (const fmt of formats) {
            try { const d = fmt(dateValue); if (!isNaN(d.getTime())) { parsedDate = d; break; } } catch (e) {}
          }
          if (isNaN(parsedDate.getTime())) { console.warn(`Format de date non reconnu (${dateValue})`); parsedDate = new Date(); }
        }
      } catch (error) { parsedDate = new Date(); }
      let amount: number;
      try {
        if (amountValue !== undefined && amountValue !== null && amountValue !== '') {
          const amountStr = String(amountValue).trim().replace(/\s/g, '');
          amount = parseFloat(amountStr.replace(/[^0-9.-]/g, '').replace(',', '.'));
          if (isNaN(amount)) amount = 0;
        } else { amount = 0; }
        if (side) {
          const upperSide = side.toUpperCase();
          if (upperSide === 'BUY' || upperSide === 'PURCHASE' || upperSide === 'ACHAT') {
            amount = -Math.abs(amount);
          } else if (upperSide === 'SELL' || upperSide === 'SALE' || upperSide === 'VENTE') {
            amount = Math.abs(amount);
          }
        }
      } catch (error) { amount = 0; }
      let unitPrice: number | null = null;
      const priceValue = row['averageprice'] || row['average_price'] || row['price'] || row['unitprice'] || row['unit_price'] || row['price_eur'] || row['price_usd'];
      if (priceValue) {
        try {
          const priceStr = String(priceValue).trim().replace(/\s/g, '');
          unitPrice = parseFloat(priceStr.replace(/[^0-9.-]/g, '').replace(',', '.'));
          if (isNaN(unitPrice)) unitPrice = null;
        } catch (error) { console.warn(`Invalid unit price at row ${rowIndex + 2}: ${priceValue}`); }
      }
      let quantity: number | null = null;
      const quantityValue = row['executed'] || row['quantity'] || row['qty'] || row['size'] || row['volume'] || row['amount'];
      if (quantityValue) {
        try {
          const quantityStr = String(quantityValue).trim().replace(/\s/g, '');
          quantity = parseFloat(quantityStr.replace(/[^0-9.-]/g, '').replace(',', '.'));
          if (isNaN(quantity)) quantity = null;
        } catch (error) { console.warn(`Invalid quantity at row ${rowIndex + 2}: ${quantityValue}`); }
      }
      let description = '';
      if (side && pair) {
        description = `${side || ''} ${pair || ''} ${type || ''}`.trim();
        if (orderNo) description += ` (${orderNo})`;
      } else if (pair) {
        description = `Transaction ${pair} ${type || ''}`.trim();
      } else {
        description = 'Transaction Binance';
      }
      if (!description || description.trim() === '') description = 'Transaction Binance';
      return {
        amount,
        description: description.trim(),
        date: parsedDate.toISOString(),
        createdAt: parsedDate.toISOString(),
        bankId,
        checked: false,
        unitPrice,
        quantity
      };
    } catch (error) {
      console.error('Erreur lors du traitement de la ligne Binance:', error);
      importErrors.push(`Ligne ${rowIndex + 2}: Erreur traitement Binance: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
      return { amount: 0, description: `Transaction Binance (ligne ${rowIndex + 2})`, date: new Date().toISOString(), createdAt: new Date().toISOString(), bankId, checked: false };
    }
  };

  const processBoursobankInvestmentRow = (row: any, bankId: string, importErrors: string[], rowIndex: number): any => {
    try {
      console.log('Traitement ligne CSV format Boursobank:', row);
      const name = row['name'] || '';
      const isin = row['isin'] || '';
      let quantity = 0;
      if (row['quantity'] !== undefined && row['quantity'] !== '') {
        const quantityStr = String(row['quantity']).trim().replace(/\s/g, '');
        if (quantityStr.includes(',') && !quantityStr.includes('.')) {
          quantity = parseFloat(quantityStr.replace(/[^0-9,-]/g, '').replace(',', '.'));
        } else {
          quantity = parseFloat(quantityStr.replace(/[^0-9.-]/g, ''));
        }
      }
      let lastPrice = 0;
      if (row['lastprice'] !== undefined && row['lastprice'] !== '') {
        const priceStr = String(row['lastprice']).trim().replace(/\s/g, '');
        if (priceStr.includes(',') && !priceStr.includes('.')) {
          lastPrice = parseFloat(priceStr.replace(/[^0-9,-]/g, '').replace(',', '.'));
        } else {
          lastPrice = parseFloat(priceStr.replace(/[^0-9.-]/g, ''));
        }
      }
      let amount = 0;
      const amountValue = row['amount'] || row['amountvariation'];
      if (amountValue !== undefined && amountValue !== '') {
        const amountStr = String(amountValue).trim().replace(/\s/g, '');
        if (amountStr.includes(',') && !amountStr.includes('.')) {
          amount = parseFloat(amountStr.replace(/[^0-9,-]/g, '').replace(',', '.'));
        } else {
          amount = parseFloat(amountStr.replace(/[^0-9.-]/g, ''));
        }
      }
      const lastMovementDate = row['lastmovementdate'] || new Date().toISOString().split('T')[0];
      if (!name || !isin || isNaN(quantity) || isNaN(lastPrice) || isNaN(amount)) {
        const missingFields = [];
        if (!name) missingFields.push('name');
        if (!isin) missingFields.push('isin');
        if (isNaN(quantity)) missingFields.push('quantity');
        if (isNaN(lastPrice)) missingFields.push('lastPrice');
        if (isNaN(amount)) missingFields.push('amount');
        importErrors.push(`Ligne ${rowIndex + 2}: Données manquantes ou invalides (${missingFields.join(', ')})`);
        return null;
      }
      let parsedDate: Date;
      const dateStr = String(lastMovementDate).trim();
      if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        parsedDate = new Date(dateStr);
      } else if (dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        const [day, month, year] = dateStr.split('/');
        parsedDate = new Date(`${year}-${month}-${day}`);
      } else if (dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
        const [day, month, year] = dateStr.split('-');
        parsedDate = new Date(`${year}-${month}-${day}`);
      } else {
        parsedDate = new Date();
      }
      let buyingPrice = 0;
      if (row['buyingprice'] !== undefined && row['buyingprice'] !== '') {
        const buyingPriceStr = String(row['buyingprice']).trim().replace(/\s/g, '');
        if (buyingPriceStr.includes(',') && !buyingPriceStr.includes('.')) {
          buyingPrice = parseFloat(buyingPriceStr.replace(/[^0-9,-]/g, '').replace(',', '.'));
        } else {
          buyingPrice = parseFloat(buyingPriceStr.replace(/[^0-9.-]/g, ''));
        }
      }
      const description = `${name} (${isin})`;
      console.log(`CSV import: Création transaction pour ${name}, unitPrice=${lastPrice}, quantity=${quantity}`);
      return {
        amount,
        description,
        date: parsedDate.toISOString(),
        createdAt: parsedDate.toISOString(),
        bankId,
        checked: false,
        unitPrice: lastPrice,
        quantity,
        metadata: { isin, buyingPrice, lastPrice, type: 'investment' }
      };
    } catch (error) {
      console.error(`Error processing Boursobank row ${rowIndex + 1}:`, error);
      importErrors.push(`Ligne ${rowIndex + 2}: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
      return null;
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
          <button
            onClick={handleOpenImportModal}
            className="px-3 py-2 text-sm font-medium text-white border border-white/10 rounded-md hover:opacity-80 flex items-center"
            style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
          >
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Importer CSV
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

      {/* CSV Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="p-0 w-80 md:w-[24rem] lg:w-[28rem] xl:w-[32rem] max-h-[80vh] shadow-2xl rounded-xl overflow-y-auto bg-white/5 backdrop-blur-xl border border-white/10">
            <div className="rounded-t-xl px-6 py-4 flex items-center justify-between bg-zinc-900/60">
              <h3 className="text-lg font-bold text-white">
                Importer des transactions depuis un fichier CSV
              </h3>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-6">
              <div className="mb-6">
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Compte d'investissement de destination *
                </label>
                <select
                  value={importBankId}
                  onChange={e => setImportBankId(e.target.value)}
                  className="block w-full rounded-md border-none focus:ring-0 bg-transparent py-2 px-3 text-white h-10 min-h-[2.5rem]"
                  style={{ backgroundColor: '#18191c' }}
                  required
                >
                  <option value="">Sélectionnez un compte...</option>
                  {banks.filter(bank => bank.accountType === 'INVESTMENT').map(bank => {
                    const bankUsersText = otherBankOwnersSuffix(bank.users, authUser?.id);
                    return (
                      <option key={bank.id} value={bank.id}>{bank.name}{bankUsersText}</option>
                    );
                  })}
                </select>
                {!importBankId && (
                  <p className="mt-1 text-sm text-red-400">
                    Veuillez sélectionner un compte avant d'importer
                  </p>
                )}
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Fichier CSV *
                </label>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-zinc-800 border-dashed rounded-lg hover:border-zinc-600 transition-colors bg-zinc-900/40">
                  <div className="space-y-1 text-center">
                    <svg className="mx-auto h-12 w-12 text-zinc-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                      <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <div className="flex text-sm text-zinc-400">
                      <label htmlFor="csv-upload" className="relative cursor-pointer bg-zinc-900/80 rounded-md font-medium text-violet-400 hover:text-violet-300 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-violet-500 px-2 py-1">
                        <span>Choisir un fichier</span>
                        <input
                          id="csv-upload"
                          name="csv-upload"
                          type="file"
                          accept=".csv"
                          className="sr-only"
                          onChange={e => setCsvFile(e.target.files?.[0] || null)}
                        />
                      </label>
                      <p className="pl-1">ou glisser-déposer</p>
                    </div>
                    <p className="text-xs text-zinc-500">CSV uniquement (max 10MB)</p>
                  </div>
                </div>
                {csvFile && (
                  <div className="mt-2 text-sm text-green-400">
                    ✓ Fichier sélectionné: {csvFile.name}
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 text-sm font-medium text-zinc-300 bg-zinc-900/60 border border-zinc-800 rounded-md hover:bg-zinc-700 focus:outline-none"
                >
                  Annuler
                </button>
                <button
                  onClick={handleImportCSV}
                  disabled={!csvFile || !importBankId || importProgress.isImporting}
                  className="px-4 py-2 text-sm font-medium text-white border border-transparent rounded-md focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: '#7c3aed' }}
                >
                  {importProgress.isImporting ? 'Import en cours...' : 'Importer'}
                </button>
              </div>

              {importProgress.isImporting && (
                <div className="mt-4">
                  <div className="flex justify-between text-sm text-zinc-400 mb-1">
                    <span>Import en cours...</span>
                    <span>{importProgress.imported}/{importProgress.total}</span>
                  </div>
                  <div className="w-full bg-zinc-800 rounded-full h-2">
                    <div
                      className="bg-violet-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${importProgress.total > 0 ? (importProgress.imported / importProgress.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )}

              {importProgress.errors.length > 0 && (
                <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <h4 className="text-sm font-medium text-red-400 mb-2">Erreurs rencontrées :</h4>
                  <ul className="text-sm text-red-300 space-y-1">
                    {importProgress.errors.map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
