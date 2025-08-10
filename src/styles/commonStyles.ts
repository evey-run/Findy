/**
 * Fichier de styles communs pour harmoniser l'apparence de l'application
 * Contient des constantes et des classes pour les marges, paddings, tailles de texte et border-radius
 */

// Couleurs principales
export const colors = {
  primary: '#6226fa',
  primaryHover: '#7c3aed',
  background: '#202427',
  cardBackground: '#272a2f',
  inputBackground: '#1f2226',
  border: '#3a3d42',
  borderDashed: '#616875',
  textPrimary: '#ffffff',
  textSecondary: '#a0aec0',
  textMuted: '#616875',
  success: '#10b981',
  error: '#ef4444',
  warning: '#f59e0b',
};

// Border radius
export const borderRadius = {
  sm: 'rounded-md', // 0.375rem (6px)
  md: 'rounded-lg', // 0.5rem (8px)
  lg: 'rounded-xl', // 0.75rem (12px)
  xl: 'rounded-2xl', // 1rem (16px)
  full: 'rounded-full',
};

// Tailles de texte
export const textSizes = {
  xs: 'text-xs', // 0.75rem (12px)
  sm: 'text-sm', // 0.875rem (14px)
  base: 'text-base', // 1rem (16px)
  lg: 'text-lg', // 1.125rem (18px)
  xl: 'text-xl', // 1.25rem (20px)
  '2xl': 'text-2xl', // 1.5rem (24px)
};

// Espacements (marges et paddings)
export const spacing = {
  card: 'p-6',
  cardHeader: 'mb-4',
  section: 'mb-6',
  inputVertical: 'py-2',
  inputHorizontal: 'px-3',
  buttonSmall: 'px-2 py-1',
  buttonMedium: 'px-4 py-2',
  buttonLarge: 'px-6 py-3',
  gap: 'gap-2',
  gapLarge: 'gap-4',
};

// Classes composées pour les éléments communs
export const commonClasses = {
  // Cartes
  card: `shadow ${borderRadius.xl} overflow-hidden`,
  cardHeader: `flex items-center justify-between ${spacing.cardHeader}`,
  
  // Inputs
  input: `w-full ${borderRadius.md} border-none focus:ring-1 focus:ring-primary text-white`,
  select: `${borderRadius.md} border-none focus:ring-1 focus:ring-primary text-white`,
  
  // Boutons
  buttonPrimary: `${borderRadius.md} ${spacing.buttonMedium} font-medium text-white bg-primary hover:bg-primaryHover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary`,
  buttonSecondary: `${borderRadius.md} ${spacing.buttonMedium} font-medium text-white bg-inputBackground border border-border hover:bg-border focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary`,
  buttonDanger: `${borderRadius.md} ${spacing.buttonMedium} font-medium text-white bg-error hover:bg-opacity-80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-error`,
  
  // Textes
  title: `${textSizes.xl} font-bold text-white`,
  subtitle: `${textSizes.lg} font-medium text-white`,
  bodyText: `${textSizes.base} text-textSecondary`,
  smallText: `${textSizes.sm} text-textSecondary`,
  
  // Layouts
  flexRow: 'flex items-center',
  flexBetween: 'flex items-center justify-between',
  flexColumn: 'flex flex-col',
  grid: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6',
};

// Styles inline pour les éléments qui nécessitent des styles spécifiques
export const inlineStyles = {
  card: { backgroundColor: colors.cardBackground },
  input: { backgroundColor: colors.inputBackground, color: colors.textPrimary, borderColor: colors.border },
  primaryButton: { backgroundColor: colors.primary },
  dashedBorder: { borderColor: colors.borderDashed },
};
