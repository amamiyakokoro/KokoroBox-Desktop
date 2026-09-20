# HeroUI v3 native-first UI contract

KokoroBox uses HeroUI v3 as its component design language. The application keeps ownership of
information architecture and desktop layout, while HeroUI owns the appearance and interaction of
its components.

This document defines the native-first contract established in Phase 6 and tightened in Phase 10.
Compatibility styling is not an approved extension point.

## Ownership boundary

KokoroBox owns:

- page and inspector layout
- desktop information density and content hierarchy
- sidebar architecture and navigation grouping
- container queries and resizable-window behavior
- Electron drag and no-drag regions
- product-specific status colors and data visualizations
- accessibility labels and product semantics

HeroUI v3 owns:

- button shape and press states
- card surface, radius, and elevation
- input and select appearance
- select, dropdown, modal, drawer, and tooltip overlays
- tabs indicators
- switch geometry
- focus rings
- component animation and internal spacing

The working rule is: **KokoroBox controls layout; HeroUI controls component appearance.**

## Rules for new work

1. Do not add selectors for HeroUI internal classes to `app-overrides.css`.
2. Prefer public component props, variants, sizes, slots, and application layout wrappers.
3. Do not add global radius or field-geometry token overrides.
4. A `Koko*` wrapper may normalize application data or behavior, but should not reproduce HeroUI v2
   appearance.
5. Product-specific status colors are allowed. Generic component states should use HeroUI tokens.
6. When an existing compatibility rule blocks a migration, remove or narrow it instead of adding a
   second override.
7. Renderer utility classes must use HeroUI v3 semantic colors such as `accent`, `surface`,
   `surface-secondary`, `muted`, and `separator`. Do not reintroduce the v2 `primary`, `content*`,
   numbered semantic scales, or `divider` vocabulary.

Run `pnpm run test:ui-native` when changing shared UI primitives or compatibility CSS.

## Phase 11 cutover baseline

### Runtime and styles

The renderer uses the canonical `@heroui/react` and `@heroui/styles` packages at HeroUI v3.
The temporary `@heroui-v3/*` aliases and the HeroUI v2 dependency have been removed.

HeroUI v3 does not require the former `HeroUIProvider`. The three renderer entrypoints preserve
locale semantics with React Aria `I18nProvider` and the existing `getLocale()` source:

- `src/renderer/src/main.tsx`
- `src/renderer/src/floating.tsx`
- `src/renderer/src/traymenu.tsx`

The shared `AppConfigProvider` also synchronizes the application's Reduce animations preference to
the document root as `data-reduce-motion="true"`. This gives HeroUI's native motion variants and
KokoroBox-owned transitions one source of truth in every renderer window. When the application
preference is off, the attribute is removed so the operating system's `prefers-reduced-motion`
setting remains authoritative.

Renderer styles now load only Tailwind and `@heroui/styles`. The legacy `hero.mjs` Tailwind plugin
and `@source` scan of `@heroui/theme` have been removed. Legacy `--heroui-*` runtime tokens are not
used by renderer UI. The renderer also uses only HeroUI v3 semantic utility names. The theme
resolver retains an explicitly isolated compatibility bridge for already-installed user themes;
that bridge is not an approved renderer styling API and is intended to retire with a future major
custom-theme format revision.

### KokoroBox desktop primitives

HeroUI v3 is the component engine. KokoroBox-owned primitives define stable desktop product
contracts such as density, alignment, overflow, and data mapping without repainting HeroUI's
appearance. Current `Koko*` exports are bounded to:

- `KokoTextField`
- `KokoSearchField`
- `KokoSelect`
- `KokoTabs`
- `KokoSegmentedControl`
- `KokoActionMenu`
- `KokoStatusIndicator`
- `KokoToolbar`
- `KokoToolbarIconButton`

Behavior worth preserving includes value normalization, concise selected-value rendering,
application option models, clear actions, and accessible menu identities. Native HeroUI Button,
Switch, and Tooltip APIs are used directly instead of preserving v2 vocabulary through adapters.

Phase 8 has established these thinner contracts:

- `KokoSearchField` is the single-line 36px desktop search control. It owns icon/value/clear-action
  alignment while HeroUI owns its secondary input surface and focus behavior.
- `KokoTabs` maps option data and selection for page or panel navigation. Labels never wrap; when
  the available width is exhausted, navigation scrolls instead of compressing text.
- `KokoSegmentedControl` maps compact 2–4 choice settings to the native HeroUI
  `ToggleButtonGroup`. Every mutually exclusive value remains visible, labels never wrap, and
  native ToggleButton selection, separators, focus, and keyboard behavior remain intact.
- `KokoSelect` owns option identity, selected-text rendering, multiple selection, label placement,
  density, and application control-width intent. Its native variant defaults to `primary`;
  consumers choose `secondary` for controls embedded in surfaces, inspectors, and toolbars.
- `KokoTextField` shares the same optional application control-width vocabulary: number (128px),
  short text (288px), select (224px), URL (480px maximum), or full width.
- `KokoActionMenu` maps application actions to native Dropdown items and uses a native v3 Button
  trigger. It does not translate v2 colors or variants and does not restyle the native popover.
- `KokoStatusIndicator` pairs visible status text with a compact semantic dot. It uses theme
  success, warning, danger, and neutral tokens so runtime state remains readable without relying
  on color alone.
- `KokoToolbar` and `KokoToolbarIconButton` define the 36px desktop toolbar alignment and action
  hierarchy while retaining native HeroUI Button, Tooltip, hover, press, and focus behavior.

Use `KokoTabs` for page, panel, and section navigation; use `KokoSegmentedControl` for 2–4 short,
mutually exclusive setting values that must remain visible together; use `KokoSelect` for numerous,
long, or low-frequency choices.

The former `KokoButton`, `KokoSwitch`, and `KokoTooltip` migration shims were removed in Phase 12.
The native contract test prevents these adapters from being reintroduced.

Phase 9 moves card-heavy management surfaces to native v3 Card anatomy. Dense rule and proxy rows
may choose compact application-level padding, while Card surface, radius, elevation, and focus
appearance remain native. Interactive cards expose an internal semantic button instead of
recreating the removed v2 `isPressable` behavior on the Card root.

### Application overrides after Phase 10

`main-compatible.css` was a migration artifact and has been replaced by `app-overrides.css`.
The renamed stylesheet contains application-owned layout and desktop behavior only:

- settings rows, settings grids, and container queries;
- page-inspector content density;
- updater release-note typography;
- application search feedback and reduced-motion handling;
- semantic `data-setting-input` width constraints; and
- native HTML number-input behavior.

Component appearance is no longer overridden there. The stylesheet has zero HeroUI internal
selectors and zero global `--radius*` / `--field-radius` declarations. Buttons, switches, tabs,
inputs, selects, list boxes, toasts, sliders, and drawer overlays therefore use their HeroUI v3
appearance. Component-specific intent belongs in public props, variants, slots, or local layout
classes—not global compatibility selectors.

## Phase exit criteria

The native-first baseline remains enforced when:

- the ownership contract is documented;
- renderer code imports canonical HeroUI v3 packages without migration aliases;
- locale is provided by React Aria and no legacy Tailwind plugin is loaded;
- application CSS contains zero HeroUI internal selectors and geometry-token overrides;
- current `Koko*` wrapper exports are bounded; and
- no visible application behavior or component appearance changes are introduced.
