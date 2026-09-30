import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  BellIcon,
  ChartPieIcon,
  ChevronDownIcon,
  FlagIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import { useAppStore } from '../../store';
import type { Transaction } from '../../types';
import { assetUrl } from '../../lib/url';
import { formatMoneyCompact, formatMonthYear } from '../../lib/format';
import { ScreenBody, ScreenHeader, SectionHeader } from '../components/Screen';
import BalanceCard from '../components/BalanceCard';
import { IconButton, LightPill } from '../components/Controls';
import { ListCard } from '../components/ListRow';
import TransactionRow from '../components/TransactionRow';
import TransactionSheet from '../components/TransactionSheet';
import TransactionTraceSheet from '../components/TransactionTraceSheet';
import TransactionGroupRow from '../components/TransactionGroupRow';
import { groupTransactions } from '../../lib/groupTransactions';
import SpaceSheet from '../components/SpaceSheet';
import Amount from '../components/Amount';
import Avatar from '../components/Avatar';
import { EmptyState, SkeletonHero, SkeletonList } from '../components/Feedback';
import { useForecast } from '../hooks/useForecast';
import { cx, radii, surfaces, text } from '../theme';

/**
 * Accueil.
 *
 * Le tableau de bord desktop est un cockpit : quatre indicateurs de même poids,
 * deux graphiques et trois listes, tous visibles d'un coup dans une fenêtre de
 * 1280 points. Sur un téléphone, cette égalité de traitement ne donne que dix
 * petits chiffres illisibles.
 *
 * L'écran mobile hiérarchise donc : un solde en très grand, ce qu'il reste à
 * vivre juste dessous — la question qu'on se pose en sortant son téléphone —
 * puis les entrées/sorties du mois, et enfin les dernières opérations. Le
 * détail (graphiques, répartition) vit dans l'onglet Analyse.
 */
export default function Home() {
  const navigate = useNavigate();
  const {
    authUser,
    currentSpace,
    banks,
    dashboardData,
    loadDashboardOverview,
    loadBanks,
  } = useAppStore();

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  /** L'opération dont on regarde le trajet de l'argent. */
  const [tracing, setTracing] = useState<Transaction | null>(null);
  const [spaceOpen, setSpaceOpen] = useState(false);
  const forecast = useForecast();

  useEffect(() => {
    void loadBanks();
    void loadDashboardOverview();
  }, [loadBanks, loadDashboardOverview, currentSpace?.id]);

  /**
   * Solde affiché : les comptes courants et l'épargne, hors investissements.
   *
   * Un portefeuille d'actions monte et descend sans qu'un euro n'ait bougé ;
   * l'inclure ferait varier le « solde total » de plusieurs centaines d'euros
   * d'un jour à l'autre sans qu'aucune opération ne l'explique.
   */
  const totalBalance = useMemo(
    () =>
      banks
        .filter((bank) => !bank.archived && bank.accountType !== 'INVESTMENT')
        .reduce((sum, bank) => sum + (bank.balance ?? 0), 0),
    [banks],
  );

  const summary = dashboardData?.summary;
  const income = summary?.currentMonthIncome ?? 0;
  const expense = summary?.currentMonthExpense ?? 0;
  const recent = dashboardData?.recentTransactions ?? [];
  const upcoming = dashboardData?.upcomingRecurrences ?? [];
  const loading = !dashboardData;

  const greeting = authUser?.name?.split(' ')[0] ?? '';

  return (
    <>
      <ScreenHeader
        title={formatMonthYear(new Date())}
        above={
          <div className="flex items-center gap-3 pt-1">
            {authUser?.avatar ? (
              <img
                src={assetUrl(authUser.avatar)}
                alt=""
                className="h-11 w-11 rounded-full object-cover ring-1 ring-white/10"
              />
            ) : (
              <Avatar label={authUser?.name ?? '?'} color="#7c3aed" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-zinc-500">Bonjour{greeting ? ',' : ''}</p>
              <p className="truncate text-[15px] font-semibold text-zinc-50">{greeting || 'Findy'}</p>
            </div>
            <IconButton label="Prochaines échéances" onClick={() => navigate('/more')}>
              <BellIcon className="h-5 w-5" />
            </IconButton>
          </div>
        }
      />

      <ScreenBody>
        <div className="space-y-5">
          {loading ? (
            <SkeletonHero />
          ) : (
            <BalanceCard
              label="Solde total"
              amount={totalBalance}
              selector={
                <LightPill onClick={() => setSpaceOpen(true)}>
                  <span className="truncate">{currentSpace?.name ?? 'Mon espace'}</span>
                  <ChevronDownIcon className="h-4 w-4 shrink-0" />
                </LightPill>
              }
              footer={
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5 text-[13px] font-medium text-white/85">
                    <ArrowDownLeftIcon className="h-4 w-4 text-emerald-300" />
                    {formatMoneyCompact(income)}
                  </span>
                  <span className="flex items-center gap-1.5 text-[13px] font-medium text-white/85">
                    <ArrowUpRightIcon className="h-4 w-4 text-red-300" />
                    {formatMoneyCompact(expense)}
                  </span>
                </div>
              }
            />
          )}

          {/* ── Actions rapides ── */}
          <div className="grid grid-cols-3 gap-2.5">
            <QuickAction
              label="Ajouter"
              icon={<PlusIcon className="h-5 w-5" />}
              onClick={() => setAdding(true)}
              accent
            />
            <QuickAction
              label="Analyse"
              icon={<ChartPieIcon className="h-5 w-5" />}
              onClick={() => navigate('/stats')}
            />
            <QuickAction
              label="Objectifs"
              icon={<FlagIcon className="h-5 w-5" />}
              onClick={() => navigate('/budgets')}
            />
          </div>

          {/* ── Reste à vivre ── */}
          {forecast.data && forecast.data.state !== 'blocked' && (
            <button
              type="button"
              onClick={() => navigate('/stats')}
              className={cx(
                'tappable w-full text-left',
                radii.tile,
                surfaces.card,
                'flex items-center justify-between gap-4 px-4 py-4',
              )}
            >
              <div className="min-w-0">
                <p className={text.label}>Reste à vivre</p>
                <p className="mt-1.5 text-[22px] font-semibold leading-none tabular-nums text-zinc-50">
                  {forecast.data.perDay !== null
                    ? `${formatMoneyCompact(forecast.data.perDay)} / jour`
                    : '—'}
                </p>
              </div>
              {forecast.data.projectedEndOfMonth !== undefined && (
                <div className="shrink-0 text-right">
                  <p className="text-[11px] text-zinc-500">fin de mois</p>
                  <Amount
                    value={forecast.data.projectedEndOfMonth}
                    compact
                    tone={forecast.data.projectedEndOfMonth < 0 ? 'negative' : 'neutral'}
                    className="text-[17px] font-semibold"
                  />
                </div>
              )}
            </button>
          )}

          {/* ── Dernières opérations ── */}
          <section>
            <SectionHeader
              title="Dernières opérations"
              actionLabel="Tout voir"
              onAction={() => navigate('/transactions')}
            />
            {loading ? (
              <SkeletonList rows={4} />
            ) : recent.length === 0 ? (
              <div className={cx(radii.tile, surfaces.card)}>
                <EmptyState
                  icon="💳"
                  title="Aucune opération"
                  description="Ajoutez votre première dépense pour voir votre suivi démarrer."
                />
              </div>
            ) : (
              <ListCard>
                {groupTransactions(recent.slice(0, 6)).map((row) =>
                  row.kind === 'single' ? (
                    <TransactionRow
                      key={row.key}
                      transaction={row.transaction}
                      showDate
                      onPress={setTracing}
                    />
                  ) : (
                    <TransactionGroupRow
                      key={row.key}
                      merchant={row.merchant}
                      total={row.total}
                      items={row.items}
                      showDate
                      onPressItem={setTracing}
                    />
                  ),
                )}
              </ListCard>
            )}
          </section>

          {/* ── Prochaines échéances ── */}
          {upcoming.length > 0 && (
            <section>
              <SectionHeader title="Prochaines échéances" />
              <ListCard>
                {upcoming.slice(0, 4).map((recurrence) => (
                  <div key={recurrence.id} className="flex min-h-[60px] items-center gap-3 py-2.5">
                    <Avatar
                      label={recurrence.description}
                      emoji={recurrence.category?.icon}
                      color={recurrence.category?.color}
                    />
                    <div className="min-w-0 flex-1">
                      <p className={cx(text.rowTitle, 'truncate')}>{recurrence.description}</p>
                      <p className={cx(text.rowSubtitle, 'mt-0.5 truncate')}>
                        {new Date(recurrence.nextDue).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'short',
                        })}
                        {recurrence.category?.name ? ` · ${recurrence.category.name}` : ''}
                      </p>
                    </div>
                    <Amount value={recurrence.amount} signed className={text.rowAmount} />
                  </div>
                ))}
              </ListCard>
            </section>
          )}
        </div>
      </ScreenBody>

      <TransactionSheet open={adding} onClose={() => setAdding(false)} />
      <TransactionSheet
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        transaction={editing}
      />
      <TransactionTraceSheet
        open={Boolean(tracing)}
        transaction={tracing}
        onClose={() => setTracing(null)}
        onEdit={() => {
          setEditing(tracing);
          setTracing(null);
        }}
      />
      <SpaceSheet open={spaceOpen} onClose={() => setSpaceOpen(false)} />
    </>
  );
}

/**
 * Tuile d'action rapide.
 *
 * L'action principale est en clair sur fond sombre, comme le « Top Up » des
 * applications bancaires : sur un écran noir, c'est le seul contraste qui la
 * distingue vraiment de ses voisines.
 */
function QuickAction({
  label,
  icon,
  onClick,
  accent = false,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'tappable flex h-[84px] flex-col items-center justify-center gap-2',
        radii.tile,
        accent ? 'bg-white text-zinc-900' : cx(surfaces.card, 'text-zinc-300'),
      )}
    >
      {icon}
      <span className="text-[13px] font-medium">{label}</span>
    </button>
  );
}
