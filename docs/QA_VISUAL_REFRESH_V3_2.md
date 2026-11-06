# SIGNAL V3.2 — Visual Refresh QA Report

## Scope completed

- Added a custom scalable SVG SIGNAL emblem, horizontal wordmarks for light and dark surfaces, high-resolution PNG exports, and browser favicon.
- Replaced the text-only sidebar monogram and plain sidebar footer with a brand panel; the compact/collapsed rail retains the emblem.
- Added jewel-enamel hero surfaces and subtle engraved geometry for Overview and Workload.
- Applied distinct emerald, midnight blue, plum, and warm-gold metric treatments across Overview, Workload, Schedule Generator, Data Master, Requirements & Allocation, Validation, and schedule context summaries.
- Added a signature motif to shared feature headings without increasing the amount of user-facing copy.
- Improved the Requirements metric grouping so labels, values, and supporting context remain stacked and readable.
- Restored the operational component stylesheet as the base layer before V3 and V3.2 overrides. This supplies existing workload and feature component styles that were not loaded by the earlier entry point.
- Updated page metadata, browser theme color, and favicon metadata.
- Updated the AI Studio master prompt and design docs so V3.2 is the active visual source of truth; historical Bento/quiet-luxury decisions are explicitly superseded.

## Static checks

- TypeScript / TSX source parse: 20 files, zero syntax diagnostics.
- CSS parse using tinycss2: all 3 application stylesheets parsed with zero top-level parse errors.
- SVG/XML parse: all 4 SVG assets valid.
- PNG exports verified: 512 × 512 emblem and 1720 × 384 wordmarks.
- Source references for stylesheet imports and public brand assets exist.
- Domain, storage, utility, test, Workload and Attendance source files were not changed for the visual refresh. `src/App.tsx` edits are limited to brand mark, sidebar footer, loading emblem, and metric content grouping.

## Not run / environment limitation

A full `npm install` was attempted but package registry access timed out (`EAI_AGAIN` while resolving `registry.npmjs.org`). The project has no installed `node_modules` in the delivered source, so `npm run build` and `npm test` could not be executed here. A headless Chromium preview attempt also timed out before producing a screenshot. Do not interpret static parsing as a successful browser rendering, integration, or production test.

## User verification

After extracting the ZIP:

```bash
npm install
npm run build
npm test
npm run dev
```

Review desktop and mobile shell, sidebar collapsed state, Overview hero/KPIs, Workload KPIs, Generator metrics, Data Master metrics, Requirements metrics, Validation metrics, and the complete timetable. Test schedule editing, validation, publish, presensi, backup/restore, and PDF export with a copy of the workspace before entering real school data.
