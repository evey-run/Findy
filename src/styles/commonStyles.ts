// Design tokens — aligned with brand.md and design-tokens.md

export const colors = {
  primary:         '#7c3aed',
  primaryLight:    '#a78bfa',
  primaryHover:    '#6d28d9',
  background:      '#09090b',
  surface:         '#18181b',
  cardBackground:  '#18181b',
  inputBackground: '#18181b',
  border:          '#27272a',
  borderDashed:    '#3f3f46',
  textPrimary:     '#fafafa',
  textSecondary:   '#a1a1aa',
  textMuted:       '#71717a',
  success:         '#22c55e',
  error:           '#ef4444',
  warning:         '#f59e0b',
};

export const glass = {
  card:   'bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl',
  subtle: 'bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-xl',
  violet: 'bg-violet-500/10 backdrop-blur-xl border border-violet-500/30 rounded-2xl',
  glow:   'shadow-[0_0_60px_rgba(124,58,237,0.25)]',
  hover:  'transition-all duration-300 hover:border-violet-500/30 hover:shadow-[0_0_40px_rgba(167,139,250,0.15)]',
};

export const borderRadius = {
  sm:   'rounded-md',
  md:   'rounded-lg',
  lg:   'rounded-xl',
  xl:   'rounded-2xl',
  full: 'rounded-full',
};

export const textSizes = {
  xs:    'text-xs',
  sm:    'text-sm',
  base:  'text-base',
  lg:    'text-lg',
  xl:    'text-xl',
  '2xl': 'text-2xl',
};

export const spacing = {
  card:            'p-6',
  cardHeader:      'mb-4',
  section:         'mb-6',
  inputVertical:   'py-2',
  inputHorizontal: 'px-3',
  buttonSmall:     'px-2 py-1',
  buttonMedium:    'px-4 py-2.5',
  buttonLarge:     'px-6 py-3',
  gap:             'gap-2',
  gapLarge:        'gap-4',
};

export const commonClasses = {
  // Glassmorphism cards
  card:       `${glass.card} overflow-hidden`,
  cardViolet: `${glass.violet} ${glass.glow} overflow-hidden`,
  cardHeader: `flex items-center justify-between ${spacing.cardHeader}`,

  // Inputs
  input:  `w-full ${borderRadius.md} bg-zinc-900 border border-zinc-800 text-zinc-50 placeholder-zinc-500 focus:ring-1 focus:ring-violet-600 focus:border-violet-600`,
  select: `${borderRadius.md} bg-zinc-900 border border-zinc-800 text-zinc-50 focus:ring-1 focus:ring-violet-600 focus:border-violet-600`,

  // Buttons
  buttonPrimary:  `inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-medium text-sm px-5 py-2.5 ${borderRadius.md} transition-colors duration-200 cursor-pointer`,
  buttonGhost:    `inline-flex items-center gap-2 text-zinc-400 hover:text-white hover:bg-white/5 font-medium text-sm px-5 py-2.5 ${borderRadius.md} transition-colors duration-200 cursor-pointer`,
  buttonOutline:  `inline-flex items-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white font-medium text-sm px-5 py-2.5 ${borderRadius.md} transition-colors duration-200 cursor-pointer`,
  buttonSecondary:`inline-flex items-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white font-medium text-sm px-5 py-2.5 ${borderRadius.md} transition-colors duration-200 cursor-pointer`,
  buttonDanger:   `inline-flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white font-medium text-sm px-5 py-2.5 ${borderRadius.md} transition-colors duration-200 cursor-pointer`,

  // Typography
  title:     `text-xl font-bold text-zinc-50`,
  subtitle:  `text-lg font-semibold text-zinc-50`,
  bodyText:  `text-sm text-zinc-400 leading-relaxed`,
  smallText: `text-xs text-zinc-500`,
  label:     `text-xs font-medium uppercase tracking-widest text-violet-400`,

  // Layouts
  flexRow:     'flex items-center',
  flexBetween: 'flex items-center justify-between',
  flexColumn:  'flex flex-col',
  grid:        'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6',
};

export const inlineStyles = {
  card:          { background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(24px)' },
  input:         { backgroundColor: colors.inputBackground, color: colors.textPrimary, borderColor: colors.border },
  primaryButton: { backgroundColor: colors.primary },
  dashedBorder:  { borderColor: colors.borderDashed },
};
