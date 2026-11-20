import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '../../store';

/**
 * Prévision de fin de mois — le « reste à vivre ».
 *
 * Le calcul vit côté serveur (`server/src/lib/forecast.ts`) : il déduit les
 * échéances à venir, les budgets déjà entamés et les comptes non dépensables.
 * Le tableau de bord desktop l'appelle depuis son propre effet ; ce hook fait
 * la même requête pour les écrans mobiles, sans dupliquer la logique de portée
 * (espace courant) ni celle du fuseau.
 */

export interface Forecast {
  state: 'ok' | 'last-day' | 'projected-overdraft' | 'overdrawn' | 'blocked';
  perDay: number | null;
  daysLeft: number;
  availableNow?: number;
  projectedEndOfMonth?: number;
  limitedBy?: 'cash' | 'budget' | null;
  overdraftDay?: number | null;
  budgetsLeft?: number | null;
  runway?: { state: string; date: string | null; days: number | null; burnRate: number | null };
  warnings: string[];
  blockers: string[];
  accounts?: Array<{ id: string; name: string; balance: number }>;
  dormantAccounts?: Array<{ id: string; name: string; balance: number }>;
}

export function useForecast() {
  const { currentSpace, scopeParams } = useAppStore();
  const [data, setData] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(true);

  const spaceId = currentSpace?.id;

  const load = useCallback(async () => {
    const now = new Date();
    // Date civile locale : le serveur ne doit pas déduire le mois de son fuseau.
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate(),
    ).padStart(2, '0')}`;

    setLoading(true);
    try {
      const response = await fetch(
        `/api/dashboard/forecast?${new URLSearchParams({ today, ...scopeParams() })}`,
      );
      setData(response.ok ? await response.json() : null);
    } catch {
      // Serveur injoignable : la carte disparaît, le reste de l'écran tient.
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [scopeParams]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
    // `load` dépend de `scopeParams`, recréé à chaque rendu du magasin : c'est
    // le changement d'espace qui doit relancer la requête, pas chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId]);

  return { data, loading, reload: load };
}
