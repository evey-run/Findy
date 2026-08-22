// Utilitaires partagés pour l'import CSV de transactions.
//
// Ces fonctions sont volontairement « pures » : elles reçoivent une ligne CSV
// brute, l'identifiant du compte de destination et un tableau d'erreurs à
// alimenter, puis renvoient un objet transaction prêt à être envoyé à l'API
// (ou `null` si la ligne doit être ignorée). Toute l'orchestration (parsing du
// fichier, appels réseau, progression) est faite par le composant appelant.

export interface ParsedTransaction {
  amount: number;
  description: string;
  date: string;
  createdAt: string;
  bankId: string;
  categoryId?: string | null;
  checked: boolean;
  unitPrice?: number | null;
  quantity?: number | null;
  metadata?: Record<string, unknown>;
}

const normalizeKey = (key: string): string =>
  key
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '');

const parseAmount = (value: unknown): number => {
  const amountStr = String(value).trim().replace(/\s/g, '');
  if (amountStr.includes(',') && !amountStr.includes('.')) {
    // Format français : 1 234,56
    return parseFloat(amountStr.replace(/[^0-9,-]/g, '').replace(',', '.'));
  }
  // Format anglais : 1,234.56 ou simple : 1234.56
  return parseFloat(amountStr.replace(/[^0-9.-]/g, ''));
};

const parseFrenchDate = (dateValue: unknown): Date | null => {
  const dateStr = String(dateValue).trim();
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return new Date(dateStr);
  }
  if (dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
    const [day, month, year] = dateStr.split('/');
    return new Date(`${year}-${month}-${day}`);
  }
  if (dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
    const [day, month, year] = dateStr.split('-');
    return new Date(`${year}-${month}-${day}`);
  }
  return null;
};

// ---------------------------------------------------------------------------
// Comptes courants / épargne : import de transactions bancaires classiques
// ---------------------------------------------------------------------------

export function parseStandardCsvRow(
  row: Record<string, any>,
  bankId: string,
  importErrors: string[],
  rowIndex: number
): ParsedTransaction | null {
  // Normaliser les noms de colonnes (enlever espaces, accents, casse)
  const normalizedRow: Record<string, any> = {};
  Object.keys(row).forEach(key => {
    normalizedRow[normalizeKey(key)] = row[key];

    // Gestion des caractères mal encodés (ex: "libell�" du Crédit Mutuel)
    if (key.includes('libell') || key.includes('Libell')) {
      normalizedRow['libelle'] = row[key];
    }
    if (key.includes('debit') || key.includes('débit') || key.includes('d�bit')) {
      normalizedRow['debit'] = row[key];
    }
    if (key.includes('credit') || key.includes('crédit') || key.includes('cr�dit')) {
      normalizedRow['credit'] = row[key];
    }
  });

  // Détecter les colonnes de date, description et montant
  let dateValue: any;
  let descriptionValue: any;
  let amountValue: any;

  const dateKeys = ['date', 'dateoperaton', 'dateval', 'datevaleur', 'date_operation', 'date_valeur', 'date_compta', 'datecomptable', 'dateop', 'datedevaleur'];
  const descriptionKeys = ['description', 'libelle', 'intitule', 'operation', 'designation', 'motif', 'reference', 'communication', 'label'];
  const amountKeys = ['montant', 'amount', 'debit', 'credit', 'somme', 'valeur'];

  for (const key of dateKeys) {
    if (normalizedRow[key] !== undefined && normalizedRow[key] !== '') { dateValue = normalizedRow[key]; break; }
  }
  for (const key of descriptionKeys) {
    if (normalizedRow[key] !== undefined && normalizedRow[key] !== '') { descriptionValue = normalizedRow[key]; break; }
  }
  for (const key of amountKeys) {
    if (normalizedRow[key] !== undefined && normalizedRow[key] !== '') { amountValue = normalizedRow[key]; break; }
  }

  // Si on n'a pas trouvé de montant, essayer de combiner débit et crédit
  if (amountValue === undefined) {
    let debitValue: any = null;
    let creditValue: any = null;
    for (const key in normalizedRow) {
      if (key.includes('debit')) debitValue = normalizedRow[key];
      if (key.includes('credit')) creditValue = normalizedRow[key];
    }
    if (debitValue !== undefined && debitValue !== '' && debitValue !== null) {
      amountValue = `-${Math.abs(parseFloat(String(debitValue).replace(/[^0-9.,-]/g, '').replace(',', '.')))}`;
    } else if (creditValue !== undefined && creditValue !== '' && creditValue !== null) {
      amountValue = Math.abs(parseFloat(String(creditValue).replace(/[^0-9.,-]/g, '').replace(',', '.')));
    }
  }

  if (!dateValue || !descriptionValue || amountValue === undefined) {
    const missingFields = [];
    if (!dateValue) missingFields.push('date');
    if (!descriptionValue) missingFields.push('description');
    if (amountValue === undefined) missingFields.push('montant');
    importErrors.push(`Ligne ${rowIndex + 2}: Données manquantes (${missingFields.join(', ')}) - Colonnes disponibles: ${Object.keys(normalizedRow).join(', ')}`);
    return null;
  }

  const parsedDate = parseFrenchDate(dateValue);
  if (!parsedDate) {
    importErrors.push(`Ligne ${rowIndex + 2}: Format de date non reconnu (${String(dateValue).trim()})`);
    return null;
  }
  if (isNaN(parsedDate.getTime())) {
    importErrors.push(`Ligne ${rowIndex + 2}: Date invalide (${String(dateValue).trim()})`);
    return null;
  }

  const amount = parseAmount(amountValue);
  if (isNaN(amount)) {
    importErrors.push(`Ligne ${rowIndex + 2}: Montant invalide (${String(amountValue).trim()})`);
    return null;
  }

  return {
    amount,
    description: String(descriptionValue).trim(),
    date: parsedDate.toISOString(),
    createdAt: parsedDate.toISOString(),
    bankId,
    categoryId: null,
    checked: false,
  };
}

// ---------------------------------------------------------------------------
// Comptes d'investissement : détection de formats spécifiques + fallback
// ---------------------------------------------------------------------------

export interface InvestmentFormats {
  boursobank: boolean;
  binance: boolean;
  peerberry: boolean;
}

export function detectInvestmentFormats(firstRow: Record<string, any> | undefined): InvestmentFormats {
  return {
    boursobank: detectBoursobankInvestmentFormat(firstRow),
    binance: detectBinanceFormat(firstRow),
    peerberry: detectPeerBerryFormat(firstRow),
  };
}

function detectBoursobankInvestmentFormat(row: Record<string, any> | undefined): boolean {
  if (!row) return false;
  const normalizedKeys = Object.keys(row).map(normalizeKey);
  const requiredColumns = ['name', 'isin', 'quantity', 'buyingprice', 'lastprice', 'amount'];
  const hasRequiredColumns = requiredColumns.every(col =>
    normalizedKeys.some(key => key === col || key.includes(col))
  );
  const userFormatColumns = ['name', 'isin', 'quantity', 'buyingprice', 'lastprice', 'intradayvariation', 'amount', 'amountvariation', 'variation', 'lastmovementdate', 'compensation'];
  const isUserFormat = userFormatColumns.every(col =>
    normalizedKeys.some(key => key === col || key.includes(col))
  );
  return hasRequiredColumns || isUserFormat;
}

function detectBinanceFormat(row: Record<string, any> | undefined): boolean {
  if (!row) return false;
  const normalizedKeys = Object.keys(row).map(normalizeKey);
  const requiredColumns = ['dateutc', 'date(utc)', 'orderno', 'pair', 'type', 'side', 'tradingtotal', 'trading_total'];
  const matchCount = requiredColumns.filter(col =>
    normalizedKeys.some(key => key === col || key.includes(col))
  ).length;
  return matchCount >= 4;
}

function detectPeerBerryFormat(row: Record<string, any> | undefined): boolean {
  if (!row) return false;
  const normalizedKeys = Object.keys(row).map(normalizeKey);
  const candidates = ['date', 'type', 'project', 'title', 'loanname', 'loanid', 'amount', 'sum', 'cashflow', 'paymentamount', 'currency', 'comment', 'note', 'balance', 'id'];
  const hasDate = normalizedKeys.some(k => k === 'date' || k.includes('date'));
  const hasAmount = normalizedKeys.some(k => k === 'amount' || k.includes('amount') || k === 'sum' || k.includes('cashflow') || k.includes('paymentamount'));
  const hasDescriptor = normalizedKeys.some(k => ['type', 'project', 'title', 'loanname'].some(t => k === t || k.includes(t)));
  const matchCount = candidates.filter(col => normalizedKeys.some(k => k === col || k.includes(col))).length;
  return hasDate && hasAmount && hasDescriptor && matchCount >= 3;
}

export function parseInvestmentCsvRow(
  row: Record<string, any>,
  bankId: string,
  importErrors: string[],
  rowIndex: number,
  formats: InvestmentFormats
): ParsedTransaction | null {
  const normalizedRow: Record<string, any> = {};
  Object.keys(row).forEach(key => {
    normalizedRow[normalizeKey(key)] = row[key];
  });

  const allEmpty = Object.values(normalizedRow).every(v => v === null || v === undefined || String(v).trim() === '');
  if (allEmpty) return null;

  if (formats.boursobank) return processBoursobankInvestmentRow(normalizedRow, bankId, importErrors, rowIndex);
  if (formats.binance) return processBinanceRow(normalizedRow, bankId, importErrors, rowIndex);
  if (formats.peerberry) return processPeerBerryRow(normalizedRow, bankId, importErrors, rowIndex);

  // Format générique d'investissement
  let dateValue: any;
  let descriptionValue: any;
  let amountValue: any;
  const dateKeys = ['date', 'dateoperaton', 'dateval', 'datevaleur', 'date_operation', 'date_valeur', 'date_compta', 'datecomptable', 'dateop', 'lastmovementdate'];
  const descriptionKeys = ['description', 'libelle', 'intitule', 'operation', 'designation', 'motif', 'reference', 'communication', 'label', 'name', 'title', 'project', 'type'];
  const amountKeys = ['montant', 'amount', 'debit', 'credit', 'somme', 'valeur', 'amountvariation', 'sum', 'cashflow', 'paymentamount'];
  const unitPriceKeys = ['unitprice', 'prixunitaire', 'prix_unitaire', 'prix', 'price', 'lastprice', 'coursunitaire', 'cours'];
  const quantityKeys = ['quantity', 'quantite', 'nombre', 'nombre_parts', 'parts', 'qte', 'qty'];

  for (const key of dateKeys) { if (normalizedRow[key] !== undefined && normalizedRow[key] !== '') { dateValue = normalizedRow[key]; break; } }
  for (const key of descriptionKeys) { if (normalizedRow[key] !== undefined && normalizedRow[key] !== '') { descriptionValue = normalizedRow[key]; break; } }
  if (!descriptionValue) {
    const keyWithProject = Object.keys(normalizedRow).find(k => k.includes('projecttitle') || k.includes('projectname'));
    if (keyWithProject && normalizedRow[keyWithProject]) descriptionValue = normalizedRow[keyWithProject];
  }
  for (const key of amountKeys) { if (normalizedRow[key] !== undefined && normalizedRow[key] !== '') { amountValue = normalizedRow[key]; break; } }
  let unitPriceValue: any;
  for (const key of unitPriceKeys) { if (normalizedRow[key] !== undefined && normalizedRow[key] !== '') { unitPriceValue = normalizedRow[key]; break; } }
  let quantityValue: any;
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
    importErrors.push(`Ligne ${rowIndex + 2}: Données manquantes (${missingFields.join(', ')}) - Colonnes: ${Object.keys(normalizedRow).join(', ')}`);
    return null;
  }

  const parsedDate = parseFrenchDate(dateValue);
  if (!parsedDate) {
    importErrors.push(`Ligne ${rowIndex + 2}: Format de date non reconnu (${String(dateValue).trim()})`);
    return null;
  }
  if (isNaN(parsedDate.getTime())) {
    importErrors.push(`Ligne ${rowIndex + 2}: Date invalide (${String(dateValue).trim()})`);
    return null;
  }

  let amount = parseAmount(amountValue);
  if (isNaN(amount)) {
    importErrors.push(`Ligne ${rowIndex + 2}: Montant invalide (${String(amountValue).trim()})`);
    return null;
  }
  const upperDesc = String(descriptionValue || '').trim().toUpperCase();
  if ((upperDesc === 'INVESTEMENT' || upperDesc === 'INVESTMENT') && amount > 0) amount = -amount;

  let unitPrice: number | null = null;
  if (unitPriceValue !== undefined) {
    unitPrice = parseAmount(unitPriceValue);
    if (isNaN(unitPrice)) unitPrice = null;
  }
  let quantity: number | null = null;
  if (quantityValue !== undefined) {
    quantity = parseAmount(quantityValue);
    if (isNaN(quantity)) quantity = null;
  }

  return {
    amount,
    description: String(descriptionValue || 'Import CSV').trim(),
    date: parsedDate.toISOString(),
    createdAt: parsedDate.toISOString(),
    bankId,
    checked: false,
    unitPrice,
    quantity,
  };
}

function processPeerBerryRow(row: Record<string, any>, bankId: string, importErrors: string[], rowIndex: number): ParsedTransaction | null {
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
    let amount = parseAmount(amountValue);
    if (isNaN(amount)) { importErrors.push(`Ligne ${rowIndex + 2}: Montant PeerBerry invalide (${String(amountValue).trim()})`); return null; }
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
      metadata: { platform: 'PeerBerry', currency: currency || 'EUR', type: type || undefined, project: project || undefined },
    };
  } catch (e) {
    console.error(`Error processing PeerBerry row ${rowIndex + 1}:`, e);
    importErrors.push(`Ligne ${rowIndex + 2}: Erreur traitement PeerBerry`);
    return null;
  }
}

function processBinanceRow(row: Record<string, any>, bankId: string, importErrors: string[], rowIndex: number): ParsedTransaction | null {
  try {
    if (!bankId) { importErrors.push(`Ligne ${rowIndex + 2}: Compte non spécifié`); return null; }
    const dateValue = row['date(utc)'] || row['dateutc'] || row['date'] || row['utcdate'] || row['time'] || row['timestamp'];
    const orderNo = row['orderno'] || row['order_no'] || row['orderid'] || row['order_id'] || row['id'] || row['transaction_id'];
    const pair = row['pair'] || row['symbol'] || row['market'] || row['coin'] || row['asset'];
    const type = row['type'] || row['ordertype'] || row['order_type'] || row['operation'] || row['operation_type'];
    const side = row['side'] || row['direction'] || row['tradeside'] || row['trade_side'] || row['operation'];
    let amountValue: any;
    const possibleAmountFields = ['tradingtotal', 'trading_total', 'total', 'amount', 'value', 'eur', 'usd', 'fiat_amount', 'fiat', 'cost', 'total_cost'];
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
          (val: string) => { const p = val.split('/'); return new Date(parseInt(p[2]), parseInt(p[0]) - 1, parseInt(p[1])); },
        ];
        for (const fmt of formats) {
          try { const d = fmt(dateValue); if (!isNaN(d.getTime())) { parsedDate = d; break; } } catch (e) { /* try next */ }
        }
        if (isNaN(parsedDate.getTime())) { parsedDate = new Date(); }
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
        const upperSide = String(side).toUpperCase();
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
      } catch (error) { /* ignore */ }
    }
    let quantity: number | null = null;
    const quantityValue = row['executed'] || row['quantity'] || row['qty'] || row['size'] || row['volume'] || row['amount'];
    if (quantityValue) {
      try {
        const quantityStr = String(quantityValue).trim().replace(/\s/g, '');
        quantity = parseFloat(quantityStr.replace(/[^0-9.-]/g, '').replace(',', '.'));
        if (isNaN(quantity)) quantity = null;
      } catch (error) { /* ignore */ }
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
      quantity,
    };
  } catch (error) {
    console.error('Erreur lors du traitement de la ligne Binance:', error);
    importErrors.push(`Ligne ${rowIndex + 2}: Erreur traitement Binance: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    return { amount: 0, description: `Transaction Binance (ligne ${rowIndex + 2})`, date: new Date().toISOString(), createdAt: new Date().toISOString(), bankId, checked: false };
  }
}

function processBoursobankInvestmentRow(row: Record<string, any>, bankId: string, importErrors: string[], rowIndex: number): ParsedTransaction | null {
  try {
    const name = row['name'] || '';
    const isin = row['isin'] || '';
    let quantity = 0;
    if (row['quantity'] !== undefined && row['quantity'] !== '') quantity = parseAmount(row['quantity']);
    let lastPrice = 0;
    if (row['lastprice'] !== undefined && row['lastprice'] !== '') lastPrice = parseAmount(row['lastprice']);
    let amount = 0;
    const amountValue = row['amount'] || row['amountvariation'];
    if (amountValue !== undefined && amountValue !== '') amount = parseAmount(amountValue);
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
    const parsedDate = parseFrenchDate(lastMovementDate) || new Date();
    let buyingPrice = 0;
    if (row['buyingprice'] !== undefined && row['buyingprice'] !== '') buyingPrice = parseAmount(row['buyingprice']);
    const description = `${name} (${isin})`;
    return {
      amount,
      description,
      date: parsedDate.toISOString(),
      createdAt: parsedDate.toISOString(),
      bankId,
      checked: false,
      unitPrice: lastPrice,
      quantity,
      metadata: { isin, buyingPrice, lastPrice, type: 'investment' },
    };
  } catch (error) {
    console.error(`Error processing Boursobank row ${rowIndex + 1}:`, error);
    importErrors.push(`Ligne ${rowIndex + 2}: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    return null;
  }
}
