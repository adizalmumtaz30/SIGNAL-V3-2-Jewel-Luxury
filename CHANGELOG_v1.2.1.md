# Changelog — SIGNAL v1.2.1

## Visual identity refresh V3.2

- Introduced the Signature Jewel Luxury interface layer across the app shell, shared page headings, hero surfaces, overview KPIs, workload, generator, and requirements metrics.
- Added the custom SIGNAL emblem, light/dark horizontal wordmarks, high-resolution PNG exports, and SVG favicon.
- Reworked the sidebar lower area into an ornamented local-first brand panel that remains visible when the sidebar is collapsed.
- Restored the operational component stylesheet as the first CSS layer, then applied V3 and V3.2 overrides to maintain existing feature styling.
- Updated title, description, theme color, and favicon metadata.
- Updated AI Studio master prompt and design documents to make V3.2 the visual source of truth and supersede historical Bento/quiet-luxury instructions.
- No intended changes to scheduling, generator, validation, attendance, IndexedDB, history, backup/restore, or PDF business logic.

## Verification

- 20 TypeScript/TSX files parsed without syntax diagnostics.
- 3 CSS files parsed without syntax errors.
- SVG assets parsed as valid XML; PNG exports verified.
- 18 protected domain/storage/utility/test files remained byte-identical to the uploaded source archive.
- Full dependency installation/build/test could not be completed in this environment because npm registry access timed out (`EAI_AGAIN`). See `docs/QA_VISUAL_REFRESH_V3_2.md`.
