import { useState } from 'react';
import Papa from 'papaparse';
import {
  parseStandardCsvRow,
  parseInvestmentCsvRow,
  detectInvestmentFormats,
} from '../lib/csvImport';

interface ImportCsvModalProps {
  bankId: string;
  bankName: string;
  accountType: 'CURRENT' | 'SAVINGS' | 'INVESTMENT';
  onClose: () => void;
  /** Appelé après un import réussi pour rafraîchir les données. */
  onImported?: () => void | Promise<void>;
}

export default function ImportCsvModal({ bankId, bankName, accountType, onClose, onImported }: ImportCsvModalProps) {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importProgress, setImportProgress] = useState<{
    isImporting: boolean;
    imported: number;
    total: number;
    errors: string[];
  }>({ isImporting: false, imported: 0, total: 0, errors: [] });

  const isInvestment = accountType === 'INVESTMENT';

  const handleImportCSV = async () => {
    if (!csvFile) {
      alert('Veuillez sélectionner un fichier CSV');
      return;
    }

    setImportProgress({ isImporting: true, imported: 0, total: 0, errors: [] });

    try {
      Papa.parse(csvFile, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          const { data, errors } = results as { data: Record<string, any>[]; errors: any[] };
          let importErrors: string[] = [];
          if (errors.length > 0) {
            importErrors = errors.map(err => `Ligne ${err.row}: ${err.message}`);
          }

          setImportProgress(prev => ({ ...prev, total: data.length }));

          const formats = isInvestment ? detectInvestmentFormats(data[0]) : null;

          for (let i = 0; i < data.length; i++) {
            const row = data[i];
            try {
              const transactionData = isInvestment
                ? parseInvestmentCsvRow(row, bankId, importErrors, i, formats!)
                : parseStandardCsvRow(row, bankId, importErrors, i);

              if (transactionData) {
                const response = await fetch('/api/transactions', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(transactionData),
                });
                if (!response.ok) {
                  const errorData = await response.json().catch(() => ({}));
                  importErrors.push(`Ligne ${i + 2}: ${errorData.error || 'Erreur lors de la création'}`);
                }
              }
            } catch (error) {
              console.error(`Error processing row ${i + 1}:`, error);
              importErrors.push(`Ligne ${i + 2}: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
            }
            setImportProgress(prev => ({ ...prev, imported: i + 1, errors: importErrors }));
          }

          if (onImported) await onImported();

          setImportProgress(prev => ({ ...prev, isImporting: false, errors: importErrors }));

          if (importErrors.length === 0) {
            alert(`✅ Import terminé avec succès!\n${data.length} transaction(s) importée(s).`);
            onClose();
          } else {
            alert(`⚠️ Import terminé avec ${importErrors.length} erreur(s).\nConsultez les détails dans la fenêtre.`);
          }
        },
        error: (error) => {
          console.error('CSV parsing error:', error);
          setImportProgress(prev => ({ ...prev, isImporting: false, errors: [`Erreur de parsing CSV: ${error.message}`] }));
        },
      });
    } catch (error) {
      console.error('Import error:', error);
      setImportProgress({ isImporting: false, imported: 0, total: 0, errors: [`Erreur: ${error instanceof Error ? error.message : 'Erreur inconnue'}`] });
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="p-0 w-80 md:w-[24rem] lg:w-[28rem] xl:w-[32rem] max-h-[80vh] shadow-2xl rounded-xl overflow-y-auto bg-white/5 backdrop-blur-xl border border-white/10" style={{ maxHeight: '80vh' }}>
        <div className="rounded-t-xl px-6 py-4 flex items-center justify-between bg-zinc-900/60">
          <h3 className="text-lg font-bold text-white">
            Importer des transactions depuis un fichier CSV
          </h3>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-6">
          {/* Compte de destination (fixé au compte choisi) */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Compte de destination
            </label>
            <div className="rounded-md px-3 py-2 text-white" style={{ backgroundColor: '#18191c' }}>
              {bankName}
            </div>
          </div>

          {/* Zone de fichier */}
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
                  <label htmlFor="csv-upload" className="relative cursor-pointer bg-zinc-900/60 rounded-md font-medium text-violet-400 hover:text-violet-300 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-violet-500 px-2 py-1">
                    <span>Choisir un fichier</span>
                    <input
                      id="csv-upload"
                      name="csv-upload"
                      type="file"
                      accept=".csv"
                      className="sr-only"
                      onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
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

          {/* Boutons d'action */}
          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm font-medium text-zinc-300 bg-zinc-900/60 border border-zinc-800 rounded-md hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
            >
              Annuler
            </button>
            <button
              onClick={handleImportCSV}
              disabled={!csvFile || importProgress.isImporting}
              className="px-3 py-1.5 text-sm font-medium text-white border border-transparent rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: '#7c3aed' }}
            >
              {importProgress.isImporting ? 'Import en cours...' : 'Importer'}
            </button>
          </div>

          {/* Barre de progression */}
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

          {/* Erreurs */}
          {importProgress.errors.length > 0 && (
            <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <h4 className="text-sm font-medium text-red-400 mb-2">Erreurs rencontrées :</h4>
              <ul className="text-sm text-red-300 space-y-1 max-h-32 overflow-y-auto">
                {importProgress.errors.map((error, index) => (
                  <li key={index}>• {error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
