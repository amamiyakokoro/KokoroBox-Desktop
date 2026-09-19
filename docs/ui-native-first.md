# HeroUI v3 native-first UI contract

KokoroBox uses HeroUI v3 as its component design language. The application keeps ownership of
information architecture and desktop layout, while HeroUI owns the appearance and interaction of
its components.

This document is the Phase 6 baseline. It records existing compatibility debt; it does not approve
new compatibility styling.

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

1. Do not add selectors for HeroUI internal classes to `main-compatible.css`.
2. Prefer public component props, variants, sizes, slots, and application layout wrappers.
3. Do not add global radius or field-geometry token overrides.
4. A `Koko*` wrapper may normalize application data or behavior, but should not reproduce HeroUI v2
   appearance.
5. Product-specific status colors are allowed. Generic component states should use HeroUI tokens.
6. When an existing compatibility rule blocks a migration, remove or narrow it instead of adding a
   second override.

Run `pnpm run test:ui-native` when changing shared UI primitives or compatibility CSS.

## Phase 6 baseline

### HeroUI v2 imports

There are 15 renderer files importing `@heroui/react`. This allowlist can shrink but must not grow.

Provider/bootstrap entries:

- `src/renderer/src/main.tsx`
- `src/renderer/src/floating.tsx`
- `src/renderer/src/traymenu.tsx`

Application entries:

- `src/renderer/src/pages/connections.tsx`
- `src/renderer/src/pages/override.tsx`
- `src/renderer/src/pages/profiles.tsx`
- `src/renderer/src/pages/settings.tsx`

Higher-risk feature surfaces:

- `src/renderer/src/pages/app-routing.tsx`
- `src/renderer/src/components/app-routing/rule-row.tsx`
- `src/renderer/src/components/proxies/proxy-item.tsx`
- `src/renderer/src/components/rules/rule-item.tsx`
- `src/renderer/src/components/override/override-item.tsx`
- `src/renderer/src/components/profiles/kokoro-default-rules.tsx`
- `src/renderer/src/components/profiles/kokoro-subscription-modal.tsx`
- `src/renderer/src/components/resources/geo-data.tsx`

The v2 Tailwind plugin remains in `hero.mjs` and is loaded by `main.css`, `floating.css`, and
`traymenu.css`. It is removed only during final cutover after all v2 consumers are gone.

### Compatibility wrappers

Current `Koko*` exports are frozen to:

- `KokoTextField`
- `KokoSelect`
- `KokoSwitch`
- `KokoButton`
- `KokoTooltip`
- `KokoTabs`
- `KokoActionMenu`

Behavior worth preserving includes value normalization, concise selected-value rendering,
application option models, clear actions, and accessible menu identities. Legacy color/variant
mapping and internal appearance classes are migration debt to remove in Phase 8.

Phase 8 has established these thinner contracts:

- `KokoTabs` only maps option data, selection, and the native `primary` / `secondary` variant. It
  does not accept indicator or internal spacing classes.
- `KokoSelect` owns option identity, selected-text rendering, multiple selection, label placement,
  and density. Its native variant defaults to `primary`; consumers choose `secondary` for controls
  embedded in surfaces, inspectors, and toolbars.
- `KokoActionMenu` maps application actions to native Dropdown items and uses a native v3 Button
  trigger. It does not translate v2 colors or variants and does not restyle the native popover.

`KokoButton`, `KokoSwitch`, and `KokoTooltip` remain temporary migration shims. Their consumer
counts are now bounded at 27, 16, and 15 renderer files respectively. These allowlists may shrink
in later phases; new consumers are not permitted.

### Compatibility CSS classification

| Area                                                | Classification                | Planned action                                          |
| --------------------------------------------------- | ----------------------------- | ------------------------------------------------------- |
| `.setting-item*`, settings grids, container queries | Application layout            | Keep                                                    |
| Electron drag regions and platform window layout    | Application behavior/layout   | Keep                                                    |
| Product status tones and traffic visualization      | Product semantics             | Keep                                                    |
| Root `--radius*` and `--field-radius` overrides     | HeroUI appearance override    | Remove in Phase 10                                      |
| `.button*`, `.close-button`                         | HeroUI appearance override    | Remove in Phase 10                                      |
| `.switch*` geometry                                 | HeroUI appearance override    | Remove in Phase 10                                      |
| `.tabs*` geometry and indicators                    | HeroUI appearance override    | Remove in Phase 10                                      |
| `.select*`, `.list-box*`, `.input*` appearance      | Mixed layout/appearance       | Move widths to layout props, then remove in Phases 8–10 |
| `.toast*` internals                                 | HeroUI appearance override    | Remove in Phase 10                                      |
| tray icon modal slider/input internals              | Local high-risk compatibility | Revisit in Phases 9–10                                  |
| drawer width and page placement                     | Application layout            | Keep                                                    |
| drawer backdrop and animation internals             | HeroUI appearance/motion      | Remove in Phase 10                                      |

The automated baseline currently permits 88 existing internal-selector occurrences and eight
radius/field token declarations. Both limits may decrease; they must not increase.

## Phase exit criteria

Phase 6 is complete when:

- the ownership contract is documented;
- existing v2 import sites and style entry points are bounded;
- current HeroUI internal CSS overrides are measured and prevented from expanding;
- current `Koko*` wrapper exports are bounded; and
- no visible application behavior or component appearance changes are introduced.
