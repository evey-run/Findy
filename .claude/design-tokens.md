# Design Tokens & Visual System

## Tailwind config (`tailwind.config.ts`)

```ts
import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#7c3aed',
          light:   '#a78bfa',
          dark:    '#5b21b6',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'float':      'float 6s ease-in-out infinite',
        'fade-in':    'fadeIn 0.4s ease-out forwards',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-8px)'  },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'translateY(0)'    },
        },
      },
    },
  },
} satisfies Config
```

---

## CSS custom properties (`src/app/globals.css`)

```css
@import "tailwindcss";

:root {
  --bg:           #09090b;
  --surface:      #18181b;
  --border:       #27272a;
  --brand:        #7c3aed;
  --brand-light:  #a78bfa;
  --text:         #fafafa;
  --text-muted:   #a1a1aa;
}

body {
  background-color: var(--bg);
  color: var(--text);
  font-family: 'Inter', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}

::selection {
  background-color: rgba(124, 58, 237, 0.3);
}

/* Custom scrollbar */
::-webkit-scrollbar       { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 3px; }
```

---

## Glassmorphism recipes

All glass variants use `backdrop-blur-xl`. Stack with `rounded-2xl` for cards, `rounded-xl` for nested elements.

**Standard glass card** (most used):
```
bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl
```

**Subtle glass** (nested elements, inner panels):
```
bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-xl
```

**Violet glass** (highlighted cards, pricing Pro, cloud card):
```
bg-violet-500/10 backdrop-blur-xl border border-violet-500/30 rounded-2xl
```

**Glow on violet glass:**
```
shadow-[0_0_60px_rgba(124,58,237,0.25)]
```

**Hover glow** (feature cards, interactive glass):
```
transition-all duration-300
hover:border-violet-500/30
hover:shadow-[0_0_40px_rgba(167,139,250,0.15)]
```

---

## Typography scale

| Role | Tailwind classes |
|---|---|
| Display / H1 | `text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-none` |
| Section H2 | `text-3xl md:text-4xl font-bold tracking-tight` |
| Card H3 | `text-base font-semibold text-white` |
| Body | `text-sm md:text-base text-zinc-400 leading-relaxed` |
| Small / caption | `text-sm text-zinc-500` |
| Section label | `text-xs font-medium uppercase tracking-widest text-violet-400` |
| Code | `font-mono text-sm text-violet-300` |
| Quote | `text-sm text-zinc-300 leading-relaxed italic` |

---

## Gradient text

Used on H1 key words and section headlines. The hero gradient word is **"machine"**.

```tsx
<span className="bg-gradient-to-r from-violet-400 to-violet-200 bg-clip-text text-transparent">
  machine
</span>
```

For a stronger left-to-right sweep:
```tsx
<span className="bg-gradient-to-br from-white via-violet-200 to-violet-400 bg-clip-text text-transparent">
  money
</span>
```

---

## Background decorations

**Radial violet glow** (hero, CTA section):
```tsx
<div className="pointer-events-none absolute inset-0 bg-gradient-radial from-violet-900/25 via-transparent to-transparent" />
```

**Dot grid** (hero, CTA section):
```tsx
<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,#3f3f46_1px,transparent_1px)] bg-[size:28px_28px] opacity-60" />
```

**Section gradient blob** (behind screenshots):
```tsx
<div className="pointer-events-none absolute -z-10 h-72 w-72 rounded-full bg-violet-700/20 blur-[80px]" />
```

---

## Framer Motion presets

Copy these into `src/lib/motion.ts` and import where needed.

```ts
export const fadeInUp = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
}

export const fadeInRight = {
  hidden:  { opacity: 0, x: 40 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.55, ease: 'easeOut' } },
}

export const fadeInLeft = {
  hidden:  { opacity: 0, x: -40 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.55, ease: 'easeOut' } },
}

export const staggerContainer = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.08 } },
}

export const staggerContainerSlow = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.15 } },
}
```

**Standard usage:**
```tsx
<motion.div
  variants={fadeInUp}
  initial="hidden"
  whileInView="visible"
  viewport={{ once: true, margin: '-80px' }}
>
```

**Stagger wrapper + children:**
```tsx
<motion.div variants={staggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true }}>
  <motion.div variants={fadeInUp}>Card 1</motion.div>
  <motion.div variants={fadeInUp}>Card 2</motion.div>
</motion.div>
```

---

## Button variants

**Primary** (main CTA):
```
inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500
text-white font-medium text-sm px-5 py-2.5 rounded-lg
transition-colors duration-200 cursor-pointer
```

**Ghost** (secondary nav CTA, link-style):
```
inline-flex items-center gap-2 text-zinc-400 hover:text-white
hover:bg-white/5 font-medium text-sm px-5 py-2.5 rounded-lg
transition-colors duration-200 cursor-pointer
```

**Outline** (secondary CTA in sections):
```
inline-flex items-center gap-2 border border-zinc-700 hover:border-zinc-500
text-zinc-300 hover:text-white font-medium text-sm px-5 py-2.5 rounded-lg
transition-colors duration-200 cursor-pointer
```

---

## Financial semantic colors

Green / red / amber are reserved for money semantics only (gains vs. losses, income vs. expense, under vs. over budget) — never decoration. Violet remains the brand/UI color.

### Indicator dots

Inline dots used in account rows and budget bars within dashboard mocks.

```tsx
// Positive / income / under budget
<span className="inline-block h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]" />

// Negative / expense / over budget
<span className="inline-block h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />

// Warning / near budget limit
<span className="inline-block h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
```

### TrendPill (UI atom)

Small pill showing a percentage change with direction arrow — used next to net worth and on holdings. `up` = green, `down` = red.

```tsx
// up
<span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
  <TrendingUp className="h-3 w-3" /> +2.4%
</span>

// down
<span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
  <TrendingDown className="h-3 w-3" /> −1.1%
</span>
```

---

## Code block style

```
bg-zinc-900 border border-zinc-800 rounded-xl p-4
font-mono text-sm leading-relaxed
```

Prompt character `$` → `text-zinc-500`
Command text → `text-violet-300`
Comments → `text-zinc-600`

Example:
```tsx
<div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 font-mono text-sm">
  <span className="text-zinc-500">$ </span>
  <span className="text-violet-300">docker compose up -d</span>
</div>
```

---

## Badge / chip

**Label chip** (section label above headlines):
```
inline-block text-xs font-medium uppercase tracking-widest
text-violet-400 bg-violet-500/10 border border-violet-500/20
px-3 py-1 rounded-full mb-4
```

**"Recommended" / "Most popular" badge** (pricing card top-right):
```
absolute -top-3 left-1/2 -translate-x-1/2
text-xs font-medium text-violet-200
bg-violet-600 px-3 py-1 rounded-full whitespace-nowrap
```

---

## Section spacing

Consistent vertical rhythm across all sections:

```
py-24 md:py-32    ← standard sections
py-16 md:py-20    ← SocialProof strip (tighter)
py-32 md:py-40    ← Hero (more generous)
```

Max content width: `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`
Narrow centered content (headlines, FAQ): `max-w-3xl mx-auto text-center`
