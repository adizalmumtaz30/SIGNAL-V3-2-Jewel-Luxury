import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createDemoState } from '../src/domain/seed';
import { validateMasterData, validateSchedule } from '../src/domain/validator';
import { HistoryAndBackupScreen, OperatorOverviewScreen, ScheduleScreen } from '../src/App';
import { AttendanceScreen } from '../src/components/AttendanceScreen';
import { SettingsScreen } from '../src/components/SettingsScreen';
import { TableRowActions } from '../src/components/TableRowActions';
import { WorkloadDashboard } from '../src/components/WorkloadDashboard';

const readWorkspaceFile = (relPath: string) =>
  fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf8');

describe('Phase 21: 5 TINGGI Forensic UI/UX & System Consolidation', () => {
  it('1. Standardizes page headers into EditorialPageHeader across Overview, Schedule, Attendance, Workload, History, and Settings', () => {
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
    expect(overviewHtml).toContain('s5-editorial-header');
    expect(overviewHtml).toContain('is-featured');
    expect(overviewHtml).toContain('s5-header-readiness-box');

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
    expect(scheduleHtml).toContain('s5-editorial-header');
    expect(scheduleHtml).toContain('s5-rule-info-btn');

    const attendanceHtml = renderToStaticMarkup(
      React.createElement(AttendanceScreen, {
        state: demo,
        onUpdateState: () => {},
        onNotify: () => {},
      })
    );
    expect(attendanceHtml).toContain('s5-editorial-header');
    expect(attendanceHtml).not.toContain('s5-att-hero-bar');
    expect(attendanceHtml).toContain('s5-rule-info-btn');

    const workloadHtml = renderToStaticMarkup(
      React.createElement(WorkloadDashboard, {
        state: demo,
      })
    );
    expect(workloadHtml).toContain('s5-editorial-header');
    expect(workloadHtml).not.toContain('workload-hero');
    expect(workloadHtml).toContain('s5-rule-info-btn');

    const settingsHtml = renderToStaticMarkup(
      React.createElement(SettingsScreen, {
        state: demo,
        onSettingsChange: () => {},
        onApplyWeeklyLimitToAllTeachers: () => {},
        onReset: () => {},
        onNotify: () => {},
        saved: true,
        onDirtyChange: () => {},
        onRegisterSave: () => {},
      })
    );
    expect(settingsHtml).toContain('s5-editorial-header');
    expect(settingsHtml).not.toContain('s5-settings-lux-header');

    const historyHtml = renderToStaticMarkup(
      React.createElement(HistoryAndBackupScreen, {
        state: demo,
        onRestore: () => {},
        onNavigate: () => {},
        onBackup: () => {},
        onImport: () => {},
        onExportCSV: () => {},
        onExportJSON: () => {},
      })
    );
    expect(historyHtml).toContain('s5-editorial-header');
    expect(historyHtml).toContain('Riwayat Versi &amp; Cadangan Data');

    const appSource = readWorkspaceFile('src/App.tsx');
    expect(appSource).not.toContain('master-prestige-hero');
  });

  it('2. Consolidates actions: removes redundant Beranda Langkah Berikutnya CTAs and uses Attio-style TableRowActions in tables', () => {
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
    expect(overviewHtml).not.toContain('s5-priority-actions');
    const kpiCardMatches = overviewHtml.match(/class="stat-card\b/g) ?? [];
    expect(kpiCardMatches.length).toBe(4);
    expect(overviewHtml).toContain('s5-editorial-summary-bar');

    const workloadHtml = renderToStaticMarkup(
      React.createElement(WorkloadDashboard, {
        state: demo,
      })
    );
    expect(workloadHtml).toContain('s5-row-actions');
    expect(workloadHtml).toContain('s5-row-action-primary');

    const rowActionsHtml = renderToStaticMarkup(
      React.createElement(TableRowActions, {
        ariaLabel: 'Opsi Baris Uji',
        primary: {
          label: 'Edit',
          onClick: () => {},
        },
        items: [
          { id: 'detail', label: 'Detail', onClick: () => {} },
          { id: 'delete', label: 'Hapus', tone: 'danger', onClick: () => {} },
        ],
      })
    );
    expect(rowActionsHtml).toContain('s5-row-actions');
    expect(rowActionsHtml).toContain('s5-row-action-primary');
    expect(rowActionsHtml).toContain('s5-row-kebab-btn');

    expect(readWorkspaceFile('src/screens/MasterScreen.tsx')).toContain('<TableRowActions');
    expect(readWorkspaceFile('src/screens/RequirementsScreen.tsx')).toContain('<TableRowActions');
    expect(readWorkspaceFile('src/components/AttendanceScreen.tsx')).toContain('<TableRowActions');
  });

  it('3. Applies human-grade short microcopy and moves technical rule details out of inline banners', () => {
    const appSource = readWorkspaceFile('src/App.tsx');
    const workloadSource = readWorkspaceFile('src/components/WorkloadDashboard.tsx');
    const settingsSource = readWorkspaceFile('src/components/SettingsScreen.tsx');

    expect(appSource).not.toContain('Validator deterministik langsung memeriksa bentrok guru');
    expect(readWorkspaceFile('src/screens/ScheduleScreen.tsx')).not.toContain('Validator deterministik langsung memeriksa bentrok guru');
    expect(workloadSource).not.toContain('Beban mengajar dari jadwal terbit tidak tercampur');
    expect(settingsSource).toContain('Ringkasan solusi konflik opsional tanpa kunci API di browser.');
  });

  it('4. Enforces Figma Pro whitespace scale tokens and removes nested double-bordered boxes in sakala-design-system.css', () => {
    const designSysCss = readWorkspaceFile('src/styles/sakala-design-system.css');
    expect(designSysCss).toContain('--sakala-gap-section: 26px');
    expect(designSysCss).toContain('--sakala-card-pad: 24px');
    expect(designSysCss).toContain('--sakala-row-min-h: 54px');
    expect(designSysCss).toContain('.s5-editorial-header');
    expect(designSysCss).toContain('.s5-row-actions');
  });

  it('5. Standardizes server.ts branding from legacy SIGNAL strings to SAKALA', () => {
    const serverSource = readWorkspaceFile('server.ts');
    expect(serverSource).toContain("app: 'SAKALA'");
    expect(serverSource).toContain('SAKALA');
    expect(serverSource).not.toMatch(/\bSIGNAL\b/);
  });
});
