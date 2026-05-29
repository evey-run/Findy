# Brand

## Product

**Name:** Tally
**Domain:** usetally.app (fictitious example)
**Category:** Personal finance / Privacy software (local-first)
**Tagline:** All your finances. None of the cloud.
**Sub-tagline:** A local-first, self-hostable dashboard for your accounts, budgets, and investments — your data never leaves your machine.

## Positioning

Tally fills the gap between cloud budgeting apps that monetize your financial data (the Mint lineage, YNAB, Copilot) and the lonely spreadsheet that's private but tedious to maintain. The decisive differentiator: **it's local-first and fully self-hostable**. No bank passwords, no third-party aggregators (Plaid, GoCardless), no call-home telemetry. You import a CSV, Tally categorizes it, and everything lives on a machine you control. A managed cloud option exists for people who'd rather not run a server.

**Target personas:**

| Persona | Pain | How Tally solves it |
|---|---|---|
| Privacy-conscious individual | Budget apps harvest and resell financial data; linking a bank login feels invasive | 100% local, CSV import, no bank credentials ever leave your device |
| Solopreneur / freelancer | Personal and business money scattered across banks; stacking SaaS subscriptions | One private dashboard, self-host for free, own your books in open files |
| Developer / self-hoster | Vendor lock-in and proprietary data formats | `docker compose up`, open portable files, MIT license, own your data |

## Tone of voice

- **Confident, not arrogant.** State facts, show the product, skip the hype.
- **Privacy as a principle, not fear.** Calm and factual — explain *why* local-first matters without scaremongering.
- **Honest about trade-offs.** CSV import is more manual than bank-sync — say so. Cloud is easier than self-hosting — say so too.
- **Concise.** Developer-friendly but readable by anyone who's managed a budget. One clear idea per sentence.

**Avoid:** "revolutionary", "game-changer", "bank-grade", "seamless", "powerful", "robust", "leverage", "AI-powered" (unless literally true)
**Use:** "import", "track", "own", "categorize", "self-host", "private", "local", "net worth", "export"

## Visual identity

### Colors

```
Primary (violet-700):       #7c3aed
Accent (violet-400):        #a78bfa  ← highlights, glow effects
Background (zinc-950):      #09090b
Surface (zinc-900):        #18181b
Border (zinc-800):         #27272a
Text primary (zinc-50):    #fafafa
Text muted (zinc-400):     #a1a1aa
Positive / income (green-500): #22c55e
Negative / expense (red-500):  #ef4444
Warning / over budget (amber-500): #f59e0b
```

Violet drives the brand and all UI chrome. Green/red/amber are reserved strictly for **financial semantics** — gains vs. losses, income vs. expense, under vs. over budget — never for decoration.

### Logo

Wordmark "tally" in lowercase, Inter font, semibold. A small violet tally-mark glyph (four vertical strokes crossed by a diagonal — the universal counting mark) sits just before the wordmark as the logo mark. No tagline in the logo lockup — the tagline lives in page copy only.

### Glassmorphism signature

```
bg-white/5 backdrop-blur-xl border border-white/10
```

Glow signature: `shadow-[0_0_60px_rgba(124,58,237,0.3)]`

### Photography / visuals

- Dark UI dashboard mockups framed in glass cards with **window chrome showing a local URL** (`localhost:5757`, `tally.local`) to reinforce the local-first story.
- No stock photography of people.
- Abstract violet gradient blobs as background decorations.
- Net-worth line/area charts, account rows with balances, budget rings, and **count-up animated numbers** to make the dashboard feel alive.
- Green for income/gains, red for expense/loss — used sparingly, only on real financial figures.
