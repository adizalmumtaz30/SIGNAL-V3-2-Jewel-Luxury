# SIGNAL Brand Identity V3.2

## Brand idea

SIGNAL is a modern academic operations workspace for madrasahs. Its visual identity combines institutional confidence with a contemporary jewel-luxury finish: deep emerald, warm ivory, antique gold, and carefully selected midnight blue and plum accents.

## Logo system

- `public/signal-mark.svg` — primary emblem for sidebar, loading state, app icon and small placements.
- `public/signal-logo.svg` — horizontal wordmark for documents, title pages and brand presentation.
- `public/favicon.svg` — browser favicon derived from the primary emblem.

The S monogram is drawn as a continuous path to communicate connected school operations. The small gold terminal accent gives the mark a distinct signature. The mark is designed to remain legible at small sizes and on both dark and light surfaces.

## Core palette

| Token | Hex | Use |
|---|---|---|
| Heritage Night | `#173D32` | Sidebar, premium dark surfaces |
| Heritage Green | `#245748` | Primary actions and brand surfaces |
| Jade | `#5F8D79` | Secondary emphasis |
| Midnight Blue | `#334F70` | Analytical metrics |
| Deep Plum | `#4C3455` | Secondary premium metric family |
| Antique Gold | `#B39A68` | Borders, fine rules, signature details |
| Gold Light | `#E5C97A` | High-contrast jewel highlights |
| Warm Ivory | `#F7F4ED` | Workspace canvas |
| Paper | `#FFFEFA` | Readable content surfaces |

## Premium material language

- **Enamel:** rich jewel gradients for high-priority hero surfaces.
- **Engraving:** subtle geometric linework and radial medallions, used as background texture only.
- **Metal detail:** antique-gold borders, rules and small highlights; avoid thick gold frames.
- **Relief:** restrained inner highlights and layered shadows to add depth without reducing legibility.
- **Metric families:** emerald, midnight blue, plum and warm gold. Keep labels, units and supporting context visible.

## UX guardrails

1. Never allow an ornament to overlap a title, number, status or action.
2. Decorative layers must be `pointer-events: none` and must not affect layout flow.
3. No metric is invented for visual balance. KPI values must come from application state.
4. Use color with text labels. Status must never depend on color alone.
5. Respect `prefers-reduced-motion` and keep hover effects short.
6. Keep the timetable, tables, filters, generator controls, validation messages and forms operationally clear.
7. Do not alter scheduling, attendance, validation, persistence, backup or PDF business logic as part of a visual refresh.

## Implementation

The application loads `sakala-modern.css` as the operational component foundation, then `signal-v3-atelier.css`, then `signal-v3-jewel-identity.css`. The final stylesheet intentionally overrides only visual tokens and layout decoration while retaining base styles for existing screens.
