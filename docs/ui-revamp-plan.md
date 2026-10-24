# UI revamp plan (Member B)

Goal: one consistent theme across the app, a proper mobile layout at 390 px, and standard React/CSS practice, without changing behaviour or the data and router seams (`src/data/load.ts`, `src/data/planner.ts`).

## Theme: "Lagoon"

The palette draws on Maldivian water and sand: deep lagoon teal as the primary colour, warm sand-tinted neutrals, and clear status colours. It supports light and dark: it follows `prefers-color-scheme` by default, a header toggle sets `data-theme="light|dark"` on `<html>`, and the choice is stored in `localStorage` (guarded with try/catch). Fonts are system fonts only, because the app must work offline (NFR-2).

Every colour, space, radius and font size comes from a token in `src/styles/tokens.css`. Components never hard-code hex values. The one exception is MapLibre paint, which reads the same tokens at runtime with `getComputedStyle`.

| Token group | Names |
|---|---|
| Surface | `--color-bg`, `--color-surface`, `--color-surface-2`, `--color-border`, `--color-border-strong` |
| Text | `--color-text`, `--color-text-muted`, `--color-text-subtle`, `--color-on-primary` |
| Brand | `--color-primary`, `--color-primary-hover`, `--color-primary-soft`, `--color-focus` |
| Status | `--color-safe(-soft)`, `--color-possible(-soft)`, `--color-longwait(-soft)`, `--color-danger(-soft)`, `--color-info(-soft)`, `--color-sample(-soft)` |
| Map | `--map-water`, `--map-official`, `--map-inferred`, `--map-highlight`, `--map-cancelled`, `--map-stop`, `--map-hub`, `--map-halo` |
| Scale | `--space-1..8` (4 px steps), `--radius-sm/md/lg/pill`, `--shadow-1/2`, `--text-xs/sm/md/lg/xl`, `--font-sans`, `--font-mono`, `--header-h`, `--tabbar-h` |

The status colours always come with a text label (Safe, Possible, Long wait, Inferred, Cancelled), as NFR-6 requires.

## Structure and practices

- CSS lives next to its component (`Component.tsx` plus `Component.css`, imported by the component). Shared layers live in `src/styles/`: `tokens.css` holds the variables, `base.css` the reset, typography, focus ring and `.visually-hidden`, and `ui.css` the shared primitives `.btn`, `.btn-primary`, `.btn-ghost`, `.field`, `.input`, `.select`, `.pill` with status modifiers, and `.card`. `main.tsx` imports `styles/index.css`, which pulls in all three.
- CSS is mobile first. The base rules target small screens and `@media (min-width: 768px)` adds the desktop layout. No fixed widths wider than the screen, no horizontal scroll at 390 px, and `100dvh` with safe-area insets for the full-height mobile views.
- Components are function components with named exports and typed props. Inline styles are allowed only for values computed at runtime. Markup is semantic (`header`, `main`, `nav`, `section`, `form`, `details`). Every control has a label, focus stays visible, and content that changes uses `aria-live`.
- ESLint (typescript-eslint, react-hooks, jsx-a11y) and Prettier get `npm run lint` and `npm run format` scripts. `npm test` and `npm run build` must keep passing.

## Mobile layout (below 768 px)

- **Header:** a compact bar with the title, a SAMPLE DATA pill (shown when the data is a fixture) and the theme toggle.
- **Honesty banner:** always visible with the full FR-23 text, in a smaller size.
- **Tab bar:** a bottom bar `nav` with two buttons, **Plan** and **Map** (`aria-pressed`). Only one panel shows at a time, and the map fills the remaining height. On desktop both panels show side by side and the tab bar is hidden.

## Work split (4 Sonnet subagents in parallel, after the foundation step)

The foundation comes first, done by the lead agent. It covers `tokens.css`, `base.css`, `ui.css` and `index.css`, and it splits the old `styles.css` into one CSS file per component, so each agent owns separate files.

| Agent | Owns | Delivers |
|---|---|---|
| R-A Shell | `App.tsx`, `App.css`, `components/Header.tsx/.css`, `components/Banner.tsx/.css`, `components/MobileTabs.tsx/.css`, `hooks/useTheme.ts` | The app shell, the theme toggle, the banners, the mobile Plan/Map tabs, and wiring for `JourneyList` and `HowItWorks` through the agreed props |
| R-B Planner | `components/PlannerForm.tsx/.css`, `components/JourneyList.tsx/.css` | A restyled form that stacks on mobile with large touch targets, and `JourneyList` (taken out of App) with empty and loading states |
| R-C Map | `components/MapView.tsx/.css`, `components/Legend.tsx/.css` | Map colours read from tokens that update when the theme changes, a legend that collapses on mobile, label halos, and focusable stop buttons in the SVG fallback |
| R-D Standards | `package.json`, `eslint.config.js`, `.prettierrc`, `.editorconfig`, `components/HowItWorks.tsx/.css` | Lint and format tooling, plus the "How this works" panel (FR-25) as a `<details>` disclosure |

Agreed interfaces:

```ts
// JourneyList.tsx (R-B builds it, R-A renders it)
export function JourneyList(props: { journeys: Journey[]; searched: boolean }): JSX.Element;
// HowItWorks.tsx (R-D builds it, R-A renders it at the bottom of the Plan panel)
export function HowItWorks(props: { config: Config }): JSX.Element;
// MobileTabs.tsx (R-A)
export type View = 'plan' | 'map';
```

Integration is done by the lead agent: run Prettier and ESLint across `src`, fix what they report, run `npm test` and `npm run build`, check 390 px and 1280 px in the dev server, and make one commit per agent task.
