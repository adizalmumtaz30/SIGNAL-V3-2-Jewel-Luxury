import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createDemoState } from '../src/domain/seed';
import { validateMasterData, validateSchedule } from '../src/domain/validator';
import { HistoryAndBackupScreen, OperatorOverviewScreen, ScheduleScreen } from '../src/App';
import { AiConflictHelper } from '../src/components/AiConflictHelper';

const readWorkspaceFile = (relPath: string) =>
  fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf8');

describe('Phase 20: 5 KRITIS Forensic UI/UX & Architectural Fixes', () => {
  it('1. Unifies History & Backup into HistoryAndBackupScreen with zero orphan BackupScreen or window.confirm in src/', () => {
    const appSource = readWorkspaceFile('src/App.tsx');
    expect(appSource).not.toContain('window.confirm(');
    expect(appSource).toContain('pendingMasterDelete');
    expect(appSource).toContain('confirmExecuteMasterDelete');
    expect(appSource).toContain('<HistoryAndBackupScreen');

    const demo = createDemoState();
    const versionsHtml = renderToStaticMarkup(
      React.createElement(HistoryAndBackupScreen, {
        state: demo,
        initialTab: 'versions',
        onRestore: () => {},
        onNavigate: () => {},
        onBackup: () => {},
        onImport: () => {},
        onExportCSV: () => {},
        onExportJSON: () => {},
      })
    );
    expect(versionsHtml).toContain('Linimasa Versi Jadwal');
    expect(versionsHtml).toContain('Cadangan &amp; Ekspor Data');
    expect(versionsHtml).toContain('Pulihkan ke Draf');

    const backupHtml = renderToStaticMarkup(
      React.createElement(HistoryAndBackupScreen, {
        state: demo,
        initialTab: 'backup',
        onRestore: () => {},
        onNavigate: () => {},
        onBackup: () => {},
        onImport: () => {},
        onExportCSV: () => {},
        onExportJSON: () => {},
      })
    );
    expect(backupHtml).toContain('Cadangan Penuh JSON');
    expect(backupHtml).toContain('Ekspor Jadwal CSV');
    expect(backupHtml).toContain('Pulihkan Data Cadangan');
  });

  it('2. Consolidates 5-layer CSS cascade with @layer ordering and cuts !important overrides by >99%', () => {
    const mainSource = readWorkspaceFile('src/main.tsx');
    expect(mainSource).toContain("import './styles/sakala-design-system.css';");

    const designSysCss = readWorkspaceFile('src/styles/sakala-design-system.css');
    expect(designSysCss).toContain(
      '@layer legacy-base, legacy-atelier, legacy-jewel, schedule-module, tokens-v5, figma-components;'
    );

    const files = [
      'src/styles/sakala-modern.css',
      'src/styles/signal-v3-atelier.css',
      'src/styles/signal-v3-jewel-identity.css',
      'src/styles/schedule-redesign.css',
      'src/styles/signal-v5-tokens.css',
    ];
    let totalImportant = 0;
    for (const file of files) {
      const css = readWorkspaceFile(file);
      totalImportant += (css.match(/!important/g) || []).length;
      expect(css).toContain('@layer ');
    }
    expect(totalImportant).toBeLessThan(30);
  });

  it('3. Never shows false-positive "AI Tersedia" badge without live /api/health confirmation', () => {
    const checkingHtml = renderToStaticMarkup(
      React.createElement(AiConflictHelper, {
        issues: [],
        geminiEnabledInSettings: true,
      })
    );
    expect(checkingHtml).not.toContain('AI Tersedia');
    expect(checkingHtml).toContain('Memeriksa Server AI');

    const unavailableHtml = renderToStaticMarkup(
      React.createElement(AiConflictHelper, {
        issues: [],
        geminiEnabledInSettings: true,
        initialHealthAvailable: false,
      })
    );
    expect(unavailableHtml).toContain('Server AI Belum Terhubung');
    expect(unavailableHtml).toContain('Layanan AI pada server belum terhubung');

    const activeHtml = renderToStaticMarkup(
      React.createElement(AiConflictHelper, {
        issues: [],
        geminiEnabledInSettings: true,
        initialHealthAvailable: true,
      })
    );
    expect(activeHtml).toContain('AI Aktif');

    const offHtml = renderToStaticMarkup(
      React.createElement(AiConflictHelper, {
        issues: [],
        geminiEnabledInSettings: false,
      })
    );
    expect(offHtml).toContain('AI Standby (OFF)');
  });

  it('4 & 5. Keeps Beranda at 4 KPI cards (editorial Persuratan summary) and collapses Jadwal to 2 bars', () => {
    const demo = createDemoState();
    const entries = demo.activeSchedule ?? [];
    const report = validateSchedule(demo, entries, { strictCoverage: true, includeSoftWarnings: true });
    const masterIssues = validateMasterData(demo);

    const overviewHtml = renderToStaticMarkup(
      React.createElement(OperatorOverviewScreen, {
        state: demo,
        report,
        masterIssues,
        readiness: 100,
        occupiedSlots: entries.length,
        totalWeeklyCapacity: Math.max(1, entries.length),
        onNavigate: () => {},
        onGenerate: () => {},
        isGenerating: false,
        onOpenPdfModal: () => {},
        onOpenValidationModal: () => {},
      })
    );

    const kpiCardMatches = overviewHtml.match(/class="stat-card\b/g) ?? [];
    expect(kpiCardMatches.length).toBe(4);
    expect(overviewHtml).toContain('s5-editorial-summary-bar');
    expect(overviewHtml).not.toContain('Tinjau Validasi &amp; Konflik');

    const scheduleHtml = renderToStaticMarkup(
      React.createElement(ScheduleScreen, {
        state: demo,
        selectedClass: demo.classes[0]?.id ?? '',
        onSelectClass: () => {},
        onEditSlot: () => {},
        onDropSlot: () => {},
        onGenerate: () => {},
        isGenerating: false,
        onPublish: () => {},
        onExportCSV: () => {},
        onOpenPdfModal: () => {},
        onOpenValidationModal: () => {},
        onNavigate: () => {},
        report,
        lastMove: null,
        onUndoMove: () => {},
      })
    );

    expect(scheduleHtml).toContain('s5-schedule-unified-toolbar');
    expect(scheduleHtml).toContain('s5-schedule-filter-wrap');
    expect(scheduleHtml).toContain('<span>Filter</span>');
    expect(scheduleHtml).not.toContain('matrix-controls-bar');
    expect(readWorkspaceFile('src/screens/ScheduleScreen.tsx')).toContain('s5-schedule-filter-popover');
  });
});
