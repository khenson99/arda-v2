# Arda V2 — Project Rules

## Architecture

- **Monorepo**: Turbo-powered with `packages/*` (shared), `services/*` (backend), `apps/*` (frontend)
- **Frontend**: `apps/web` — React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Express + PostgreSQL (Drizzle ORM) + Redis + JWT auth
- **Package scope**: `@arda/*` (e.g., `@arda/web`, `@arda/config`, `@arda/db`)
- **Node**: >= 20, npm >= 10

## Commands

```bash
npm run dev          # Start all services (Turbo)
npm run build        # Build all packages
npm run dev --filter=@arda/web  # Frontend only
npm run db:studio    # Drizzle Studio
```

---

## Frontend Design System

**Figma source of truth**: "Arda MVP 2.0 - Hi-Fi Mockups" (`JJJ5Yb7t8hMe2LfCX0W5gQ`)

All frontend work MUST follow these rules extracted from Figma.

### Colors (CSS variables — HSL without `hsl()` wrapper)

| Token | Hex | CSS Variable |
|---|---|---|
| **Primary (Arda Orange)** | `#fc5a29` | `--primary: 14 93% 57%` |
| Primary hover | `#e84f20` | `--arda-orange-hover: 14 93% 52%` |
| **Link / Active (Arda Blue)** | `#0a68f3` | `--link: 216 94% 50%` |
| Background | `#ffffff` | `--background: 0 0% 100%` |
| Foreground | `#0a0a0a` | `--foreground: 0 0% 4%` |
| Muted foreground | `#737373` | `--muted-foreground: 0 0% 45%` |
| Border / Input | `#e5e5e5` | `--border: 0 0% 90%` |
| Sidebar background | `#0a0a0a` | `--sidebar-background: 0 0% 4%` |

**Do NOT use** `#FF6B4A` or `#3B82F6` — those are from older mockups.

### Typography

- **Font**: `Open Sans` (400, 500, 600, 700). **Not Inter.**
- **Base size**: 14px / line-height 20px (`text-sm`)
- **Small**: 12px (`text-xs`)
- Headings: Open Sans SemiBold (600) or Bold (700)

### Spacing

- 4px base unit. Use Tailwind spacing scale: `gap-1`=4px, `gap-2`=8px, `gap-3`=12px, `gap-4`=16px, `gap-6`=24px

### Border Radius

- Buttons / inputs: `rounded-md` (8px)
- Cards (Order Queue Items): `rounded-xl` (14px)

### Shadows

- Cards: `shadow-sm` — `0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.1)`
- Subtle: `shadow-xs` — `0 1px 2px rgba(0,0,0,0.05)`

---

### Component Rules

- Use **shadcn/ui** for all base components. Components live in `apps/web/src/components/ui/`.
- **Buttons**:
  - Primary = arda-orange bg (`bg-primary`), white text
  - Outline = border, white bg, hover muted
  - Link variant = arda-blue text, underline on hover
  - Accent = arda-blue bg, white text
- **Cards**:
  - White bg, 1px border `border-border`, `shadow-sm`, `rounded-xl`
  - Optional blue accent bar: use `.card-arda` class (adds 4px blue bar at top)
  - Order Queue Item cards: `rounded-xl shadow-sm px-4 py-1`
- **Links**: Arda Blue `#0a68f3`, `font-semibold`, underline on hover. Use `link-arda` class or `text-[hsl(var(--link))]`.
- **Name-Value pairs**: "Label: **Value**" inline pattern. Label = `text-muted-foreground`, Value = `font-semibold text-card-foreground`. Use `.name-value-pair` class.
- **Status badges**: Colored background at 10% opacity + matching text. Use `<Badge variant="success|warning|accent">`.
- **Tables**: Header bg `bg-muted`, row hover `hover:bg-muted/50`, links in `text-[hsl(var(--table-link))]`.

### Figma Variable → Tailwind Mapping

| Figma Variable | Tailwind Class |
|---|---|
| `var(--base/primary)` | `bg-primary` / `text-primary` |
| `var(--base/link)` | `text-[hsl(var(--link))]` |
| `var(--base/border)` | `border-border` |
| `var(--base/muted-foreground)` | `text-muted-foreground` |
| `var(--font/font-sans)` | `font-sans` (Open Sans) |
| `var(--text/sm/font-size)` | `text-sm` (14px) |
| `var(--spacing/4)` | `p-4` / `gap-4` (16px) |
| `var(--border-radius/rounded-md)` | `rounded-md` (8px) |
| `var(--border-radius/rounded-xl)` | `rounded-xl` (14px) |
| `var(--shadow/xs)` | `shadow-xs` |
| `var(--shadow/sm)` | `shadow-sm` |

### Density System

Three presets via CSS class on a parent element:
- `.density-comfortable` (default): 40px rows, 12px cell padding, 14px font, 18px icons
- `.density-compact`: 32px rows, 8px cell padding, 13px font, 16px icons
- `.density-dense`: 24px rows, 4px cell padding, 12px font, 14px icons

### Dark Mode

- Toggle via `.dark` class on `<html>`
- All colors are defined as CSS custom properties with dark overrides in `index.css`
- Sidebar is always dark regardless of mode

### File Structure

```
apps/web/src/
  components/ui/   ← shadcn/ui components (Button, Card, Badge, Input, etc.)
  components/      ← App-specific components
  hooks/           ← Custom React hooks
  lib/utils.ts     ← cn() utility (clsx + tailwind-merge)
  index.css        ← Design system CSS variables + component classes
  main.tsx         ← React entry point
  App.tsx          ← Root component
```

### Adding New shadcn/ui Components

```bash
cd apps/web
npx shadcn@latest add <component-name>
```

This reads `components.json` and places components in `src/components/ui/`.
