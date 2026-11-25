import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createDemoState } from '../src/domain/seed';
import { AttendancePdfExportModal } from '../src/components/AttendancePdfExportModal';
import { SchedulePdfExportModal } from '../src/components/SchedulePdfExportModal';
import { SettingsScreen } from '../src/components/SettingsScreen';
import { TeacherGenderToggle } from '../src/components/TeacherGenderToggle';
import { NumberingFormatModal } from '../src/components/persuratan/NumberingFormatModal';
import {
  GeneratorScreen,
  HistoryAndBackupScreen,
  MasterScreen,
  OperatorOverviewScreen,
  RequirementsScreen,
  ScheduleScreen,
  ValidationScreen,
} from '../src/App';

const readWorkspaceFile = (relPath: string) =>
  fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf8');

describe('Phase 22: 5 SEDANG Polish, Operator Efficiency & Modularity Improvements', () => {
  it('1. Removes duplicate Quick Search (Ctrl K) trigger from Topbar while keeping single Command Bar in SovereignSidebar', () => {
    const appSource = readWorkspaceFile('src/App.tsx');
    const sidebarSource = readWorkspaceFile('src/components/SovereignSidebar.tsx');

    expect(appSource).not.toContain('s5-command-trigger');
    expect(sidebarSource).toContain('sakala-sidebar-search');
    expect(sidebarSource).toContain('Ctrl K');
  });

  it('2. Replaces raw teacher gender emojis (👳‍♂️/🧕) with editorial SVG TeacherGenderToggle using MadrasahTeacherAvatar', () => {
    const checkedFiles = [
      'src/App.tsx',
      'src/screens/MasterScreen.tsx',
      'src/components/EntityEditModal.tsx',
      'src/components/InspectorSlideDrawer.tsx',
    ];
    for (const file of checkedFiles) {
      const src = readWorkspaceFile(file);
      expect(src).not.toMatch(/👳|🧕/);
    }

    const html = renderToStaticMarkup(
      React.createElement(TeacherGenderToggle, {
        value: 'male',
        onChange: () => {},
      })
    );
    expect(html).toContain('s5-teacher-gender-group');
    expect(html).toContain('<svg');
    expect(html).toContain('Asatidz');
    expect(html).toContain('Ustadzah');
  });

  it('3. Progressively refactors MasterScreen (unified filter+search bar), SettingsScreen & NumberingFormatModal (collapsible technical disclosures), and WorkloadDashboard', () => {
    const masterSource = readWorkspaceFile('src/screens/MasterScreen.tsx');
    expect(masterSource).toContain('master-unified-controls');
    expect(masterSource).toContain('master-unified-chips');
    expect(masterSource).toContain('master-unified-search');

    const demo = createDemoState();
    const renderSettingsTab = (initialTab: 'time' | 'general' | 'ai') =>
      renderToStaticMarkup(
        React.createElement(SettingsScreen, {
          state: demo,
          initialTab,
          onSettingsChange: () => {},
          onApplyWeeklyLimitToAllTeachers: () => {},
          onReset: () => {},
          onNotify: () => {},
          saved: true,
          onDirtyChange: () => {},
          onRegisterSave: () => {},
        })
      );
    const settingsHtml = `${renderSettingsTab('time')}${renderSettingsTab('general')}${renderSettingsTab('ai')}`;
    expect(settingsHtml).toContain('s5-collapsible-section');
    expect(settingsHtml).toContain('s5-collapsible-trigger');
    expect(settingsHtml).toContain('Parameter Teknis Interval &amp; Cascade');
    expect(settingsHtml).toContain('Parameter Teknis Penomoran Surat Otomatis');
    expect(settingsHtml).toContain('Parameter Teknis Penyusun Jadwal (Search Limit)');
    expect(settingsHtml).toContain('aria-expanded="false"');

    const numberingModalSource = readWorkspaceFile('src/components/persuratan/NumberingFormatModal.tsx');
    expect(numberingModalSource).toContain('Pola Kustom & Variabel Token');
    expect(numberingModalSource).toContain('nfm-kinds-disclosure');

    const workloadSource = readWorkspaceFile('src/components/WorkloadDashboard.tsx');
    expect(workloadSource).toContain('s5-workload-filter-bar');
  });

  it('4. Standardizes SchedulePdfExportModal and AttendancePdfExportModal on unified PdfExportStudioShell components', () => {
    const demo = createDemoState();
    const schedulePdfHtml = renderToStaticMarkup(
      React.createElement(SchedulePdfExportModal, {
        state: demo,
        selectedClassId: demo.classes[0]?.id ?? '',
        isOpen: true,
        onClose: () => {},
        onNotify: () => {},
        hardErrorCount: 0,
        warningCount: 0,
      })
    );
    const attendancePdfHtml = renderToStaticMarkup(
      React.createElement(AttendancePdfExportModal, {
        state: demo,
        initialMonth: '2026-04',
        initialEndMonth: '2026-04',
        isOpen: true,
        onClose: () => {},
        onNotify: () => {},
      })
    );

    for (const html of [schedulePdfHtml, attendancePdfHtml]) {
      expect(html).toContain('s5-pdf-modal-head');
      expect(html).toContain('s5-pdf-studio-grid');
      expect(html).toContain('s5-pdf-kpi-strip');
    }

    const schedulePdfSrc = readWorkspaceFile('src/components/SchedulePdfExportModal.tsx');
    const attendancePdfSrc = readWorkspaceFile('src/components/AttendancePdfExportModal.tsx');
    expect(schedulePdfSrc).toContain('PdfExportStudioShell');
    expect(schedulePdfSrc).toContain('PdfKopSignerContentEditor');
    expect(attendancePdfSrc).toContain('PdfExportStudioShell');
    expect(attendancePdfSrc).toContain('PdfKopSignerContentEditor');
  });

  it('5. Decomposes src/App.tsx into 7 modular screen files under src/screens/ while preserving re-exports', () => {
    const screenFiles = [
      'src/screens/OperatorOverviewScreen.tsx',
      'src/screens/ScheduleScreen.tsx',
      'src/screens/GeneratorScreen.tsx',
      'src/screens/MasterScreen.tsx',
      'src/screens/RequirementsScreen.tsx',
      'src/screens/ValidationScreen.tsx',
      'src/screens/HistoryAndBackupScreen.tsx',
    ];
    for (const file of screenFiles) {
      expect(fs.existsSync(path.resolve(process.cwd(), file))).toBe(true);
    }

    const appSource = readWorkspaceFile('src/App.tsx');
    const lineCount = appSource.split('\n').length;
    expect(lineCount).toBeLessThan(2500);

    expect(typeof OperatorOverviewScreen).toBe('function');
    expect(typeof ScheduleScreen).toBe('function');
    expect(typeof GeneratorScreen).toBe('function');
    expect(typeof MasterScreen).toBe('function');
    expect(typeof RequirementsScreen).toBe('function');
    expect(typeof ValidationScreen).toBe('function');
    expect(typeof HistoryAndBackupScreen).toBe('function');
  });
});
