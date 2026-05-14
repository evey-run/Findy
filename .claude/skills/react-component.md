---
name: react-component
description: Créer un nouveau composant React (page ou widget) connecté au store et à l'API
---

# React Component Creator

## Localisation

- Page principale : `src/components/<Name>.tsx`
- Sous-composant réutilisable : `src/components/<Domain>/<Name>.tsx` (créer le dossier si besoin)

## Template — Page connectée au store

```tsx
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus } from 'lucide-react';
import { useAppStore } from '../store';
import { colors, borderRadius, spacing } from '../styles/commonStyles';

export default function MyPage() {
  const items = useAppStore((s) => s.items);
  const loadItems = useAppStore((s) => s.loadItems);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadItems()
      .catch(() => toast.error('Impossible de charger les éléments'))
      .finally(() => setLoading(false));
  }, [loadItems]);

  if (loading) {
    return <div className="text-gray-400 p-6">Chargement...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 pb-10">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Mes éléments</h1>
        <button
          onClick={() => {/* ouvrir modal création */}}
          className={`bg-[${colors.primary}] hover:bg-[${colors.primaryHover}] text-white ${spacing.buttonMedium} ${borderRadius.lg} flex items-center gap-2`}
        >
          <Plus size={16} />
          Ajouter
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((item) => (
          <div
            key={item.id}
            className={`bg-[${colors.cardBackground}] ${borderRadius.xl} ${spacing.card}`}
          >
            <h3 className="text-white font-semibold">{item.name}</h3>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Template — Sous-composant typé

```tsx
import { colors, borderRadius } from '../styles/commonStyles';

interface BadgeProps {
  label: string;
  color?: string;
}

export function Badge({ label, color = colors.primary }: BadgeProps) {
  return (
    <span
      className={`inline-block px-2 py-1 text-xs ${borderRadius.full} text-white`}
      style={{ backgroundColor: color }}
    >
      {label}
    </span>
  );
}
```

## Patterns clés

### Lecture du store

```tsx
const banks = useAppStore((s) => s.banks);          // ✅ Slice ciblé
const { banks } = useAppStore();                    // ❌ Re-render à chaque change
```

### Mutation + feedback

```tsx
const addBank = async (data) => {
  try {
    const res = await fetch('/api/banks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Échec');
    const created = await res.json();
    useAppStore.getState().setBanks([...banks, created]);
    toast.success('Banque ajoutée');
  } catch (err) {
    toast.error('Impossible d\'ajouter la banque');
  }
};
```

### Format français

```tsx
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const fmtDate = (d: Date) => format(d, 'dd MMMM yyyy', { locale: fr });
const fmtMoney = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
```

## Routing

Si c'est une page, ajouter la route dans `src/App.tsx` :

```tsx
<Route path="/my-page" element={<MyPage />} />
```

Et un lien dans `src/components/Layout.tsx` (sidebar).

## Checklist

1. [ ] Créer le composant dans `src/components/`
2. [ ] Typer les props si sous-composant (interface au-dessus)
3. [ ] Utiliser les constantes de `commonStyles.ts` (pas de hardcode)
4. [ ] Sélectionner uniquement les slices du store nécessaires
5. [ ] UI en français, tutoyer l'utilisateur
6. [ ] Toasts `react-hot-toast` pour succès / erreur
7. [ ] Si c'est une page : route dans `App.tsx` + lien dans `Layout.tsx`
8. [ ] Tester dans le navigateur (`npm run dev`)
