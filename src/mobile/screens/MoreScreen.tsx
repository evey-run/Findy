import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRightOnRectangleIcon,
  ChartBarIcon,
  ChevronUpDownIcon,
  Cog6ToothIcon,
  FlagIcon,
  ServerStackIcon,
  TagIcon,
} from '@heroicons/react/24/outline';
import { ChevronRightIcon } from '@heroicons/react/20/solid';
import { useAppStore } from '../../store';
import { assetUrl } from '../../lib/url';
import { getServerUrl } from '../../lib/apiBase';
import { isNativeMobile } from '../../lib/platform';
import { ScreenBody, ScreenHeader, SectionHeader } from '../components/Screen';
import { ListCard, ListRow } from '../components/ListRow';
import { SettingRow } from '../components/Field';
import Avatar from '../components/Avatar';
import SpaceSheet from '../components/SpaceSheet';
import { cx, radii, surfaces } from '../theme';

/**
 * « Plus » — tout ce qui ne tient pas dans cinq onglets.
 *
 * La barre latérale desktop aligne dix destinations de même poids ; une barre
 * d'onglets n'en supporte que cinq avant de devenir un mur d'icônes muettes.
 * Les autres vivent donc ici, groupées par intention : ce qu'on gère, avec qui
 * on partage, et ce qui concerne l'application elle-même.
 *
 * L'espace courant est en tête plutôt que dans un menu : sur mobile il décide
 * de ce que montrent tous les autres écrans, et rien d'autre ne l'indique une
 * fois passé l'accueil.
 */

/**
 * Version du paquet installé.
 *
 * Elle n'a de sens qu'en application native : sur le web, chaque chargement
 * sert déjà la dernière version et le numéro n'apprend rien. L'import est
 * dynamique et son échec silencieux — hors Tauri, le pont IPC n'existe pas.
 */
function useAppVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import('@tauri-apps/api/app')
      .then(({ getVersion }) => getVersion())
      .then((value) => {
        if (!cancelled) setVersion(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return version;
}

export default function MoreScreen() {
  const navigate = useNavigate();
  const { authUser, currentSpace, spaces, loadSpaces, logout, requestConfirm } = useAppStore();

  const [spaceOpen, setSpaceOpen] = useState(false);
  const version = useAppVersion();

  useEffect(() => {
    if (spaces.length === 0) void loadSpaces();
  }, [spaces.length, loadSpaces]);

  /**
   * Les autres membres de l'espace regardé.
   *
   * Le tricount se tient toujours entre deux personnes : soi et quelqu'un
   * d'autre. Se proposer soi-même mènerait à une page de dettes vides, et les
   * membres d'un espace qu'on ne regarde pas n'ont rien à voir avec les
   * montants affichés partout ailleurs.
   */
  const others = useMemo(
    () => (currentSpace?.members ?? []).filter((member) => member.id !== authUser?.id),
    [currentSpace, authUser?.id],
  );

  // L'adresse est montrée sans son schéma : « http:// » n'apprend rien et
  // pousse la partie utile hors du cadre sur une ligne de réglage.
  const serverHost = getServerUrl().replace(/^https?:\/\//, '');

  const disconnect = async () => {
    const confirmed = await requestConfirm(
      'Vos données restent sur le serveur. Il faudra ressaisir votre mot de passe pour revenir.',
      { title: 'Se déconnecter ?', confirmLabel: 'Déconnexion', danger: true },
    );
    if (confirmed) logout();
  };

  return (
    <>
      <ScreenHeader title="Plus" />

      <ScreenBody>
        <div className="space-y-6">
          {/* ── Identité et portée ── */}
          <button
            type="button"
            onClick={() => setSpaceOpen(true)}
            className={cx(
              'tappable flex w-full items-center gap-3.5 px-4 py-4 text-left',
              radii.tile,
              surfaces.card,
            )}
          >
            {authUser?.avatar ? (
              <img
                src={assetUrl(authUser.avatar)}
                alt=""
                className="h-14 w-14 shrink-0 rounded-full object-cover ring-1 ring-white/10"
              />
            ) : (
              <Avatar label={authUser?.name ?? '?'} color="#7c3aed" size="lg" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[17px] font-semibold text-zinc-50">
                {authUser?.name ?? 'Findy'}
              </span>
              <span className="mt-0.5 block truncate text-[13px] text-zinc-500">
                {currentSpace?.name ?? 'Mon espace'}
                {currentSpace?.kind === 'SHARED' ? ' · Groupe partagé' : ''}
              </span>
            </span>
            <ChevronUpDownIcon className="h-5 w-5 shrink-0 text-zinc-500" aria-hidden="true" />
          </button>

          {/* ── Gérer ── */}
          <section>
            <SectionHeader title="Gérer" />
            <ListCard>
              <SettingRow
                icon={<FlagIcon className="h-5 w-5" />}
                title="Objectifs"
                subtitle="Budgets et projets d'épargne"
                trailing={<Chevron />}
                onClick={() => navigate('/budgets')}
              />
              <SettingRow
                icon={<TagIcon className="h-5 w-5" />}
                title="Catégories"
                subtitle="Classement des opérations"
                trailing={<Chevron />}
                onClick={() => navigate('/categories')}
              />
              <SettingRow
                icon={<ChartBarIcon className="h-5 w-5" />}
                title="Investissements"
                subtitle="Portefeuille et positions"
                trailing={<Chevron />}
                onClick={() => navigate('/investissement')}
              />
            </ListCard>
          </section>

          {/* ── Partagé ── */}
          {others.length > 0 && (
            <section>
              <SectionHeader title="Partagé" />
              <ListCard>
                {others.map((member) => (
                  <ListRow
                    key={member.id}
                    leading={
                      member.avatar ? (
                        <img
                          src={assetUrl(member.avatar)}
                          alt=""
                          className="h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-white/10"
                        />
                      ) : (
                        <Avatar label={member.name} />
                      )
                    }
                    title={member.name}
                    subtitle="Dettes partagées"
                    chevron
                    onClick={() => navigate(`/tricount/${member.id}`)}
                  />
                ))}
              </ListCard>
            </section>
          )}

          {/* ── Application ── */}
          <section>
            <SectionHeader title="Application" />
            <ListCard>
              <SettingRow
                icon={<Cog6ToothIcon className="h-5 w-5" />}
                title="Réglages"
                subtitle="Compte, espaces, données"
                trailing={<Chevron />}
                onClick={() => navigate('/settings')}
              />
              {/* Sur le web, l'API est servie par l'origine de la page : il n'y
                  a aucune adresse à choisir. */}
              {isNativeMobile() && (
                <SettingRow
                  icon={<ServerStackIcon className="h-5 w-5" />}
                  title="Serveur"
                  subtitle={serverHost || 'Aucune adresse enregistrée'}
                  trailing={<Chevron />}
                  onClick={() => navigate('/server')}
                />
              )}
            </ListCard>
          </section>

          <ListCard>
            <SettingRow
              icon={<ArrowRightOnRectangleIcon className="h-5 w-5" />}
              title="Déconnexion"
              danger
              onClick={disconnect}
            />
          </ListCard>

          {version && <p className="pt-1 text-center text-[12px] text-zinc-600">Findy v{version}</p>}
        </div>
      </ScreenBody>

      <SpaceSheet open={spaceOpen} onClose={() => setSpaceOpen(false)} />
    </>
  );
}

/**
 * Chevron de fin de ligne.
 *
 * `SettingRow` n'en pose pas de lui-même : une ligne qui porte un interrupteur
 * ne mène nulle part. Ici, toutes les lignes ouvrent un écran, et sans repère
 * à droite elles se lisent comme du texte inerte.
 */
function Chevron() {
  return <ChevronRightIcon className="h-5 w-5 shrink-0 text-zinc-600" aria-hidden="true" />;
}
