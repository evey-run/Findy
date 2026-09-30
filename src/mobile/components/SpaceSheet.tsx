import { useEffect } from 'react';
import { CheckIcon, UsersIcon } from '@heroicons/react/24/outline';
import { useAppStore } from '../../store';
import { assetUrl } from '../../lib/url';
import Sheet from './Sheet';
import { ListRow } from './ListRow';
import Avatar from './Avatar';
import { cx } from '../theme';

/**
 * Choix de l'espace de travail.
 *
 * Le sélecteur desktop vit dans la barre latérale, qui n'existe pas ici. Il
 * change la PORTÉE des données, pas l'identité : on reste connecté en tant que
 * soi — ce dont dépendent les dettes « qui a payé » — et on choisit seulement
 * ce qu'on regarde, son espace ou un groupe dont on est membre.
 */
export default function SpaceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { spaces, currentSpace, setCurrentSpace, loadSpaces } = useAppStore();

  useEffect(() => {
    if (open && spaces.length === 0) void loadSpaces();
  }, [open, spaces.length, loadSpaces]);

  return (
    <Sheet open={open} onClose={onClose} title="Espace" subtitle="Ce que vous regardez">
      <div className="divide-y divide-white/[0.05]">
        {spaces.map((space) => {
          const active = currentSpace?.id === space.id;
          const members = space.members ?? [];
          const shared = space.kind === 'SHARED' && members.length > 1;

          return (
            <ListRow
              key={space.id}
              leading={
                shared ? (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-violet-500/30 bg-violet-600/20">
                    <UsersIcon className="h-5 w-5 text-violet-300" />
                  </span>
                ) : members[0]?.avatar ? (
                  <img
                    src={assetUrl(members[0].avatar)}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-white/10"
                  />
                ) : (
                  <Avatar label={members[0]?.name ?? space.name} />
                )
              }
              title={space.name}
              subtitle={shared ? members.map((member) => member.name).join(', ') : 'Mon espace'}
              trailing={
                active ? (
                  <CheckIcon className={cx('h-5 w-5 text-violet-400')} aria-hidden="true" />
                ) : undefined
              }
              onClick={() => {
                setCurrentSpace(space);
                onClose();
              }}
            />
          );
        })}
      </div>
    </Sheet>
  );
}
