import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Home, CalendarDays, ShieldCheck } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { SovereignSidebar } from '../src/components/SovereignSidebar';

const readWorkspaceFile = (relPath: string) =>
  fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf8');

describe('Phase 19: Sovereign Atelier Pro Sidebar Architecture', () => {
  it('wires SovereignSidebar, Database icon, 3 nav groups, effectiveCollapsed, and Escape close in App.tsx', () => {
    const appSource = readWorkspaceFile('src/App.tsx');

    expect(appSource).toContain('const effectiveCollapsed = sidebarCollapsed && !sidebarOpen;');
    expect(appSource).toContain('<SovereignSidebar');
    expect(appSource).toContain('const DatabaseIcon: LucideIcon = Database;');
    expect(appSource).toContain("sectionTitle: 'PERENCANAAN & MASTER'");
    expect(appSource).toContain("sectionTitle: 'OPERASIONAL & VALIDASI'");
    expect(appSource).toContain("sectionTitle: 'TATA NASKAH & SISTEM'");
    expect((appSource.match(/id:\s*'persuratan'/g) ?? []).length).toBe(1);
    expect(appSource).toContain("if (e.key === 'Escape')");
    expect(appSource).not.toContain('<div className="sakala-brand" onClick=');
    expect(appSource).not.toContain('sidebar-quick-settings-btn');
  });

  it('implements semantic controls, Khatam ornaments, Framer Motion active indicator, portal tooltip, and interactive vault footer in SovereignSidebar', () => {
    const sidebarSource = readWorkspaceFile('src/components/SovereignSidebar.tsx');

    expect(sidebarSource).toContain('createPortal');
    expect(sidebarSource).toContain('sakala-portal-tooltip');
    expect(sidebarSource).toContain('layoutId="sakala-sidebar-active-pill"');
    expect(sidebarSource).toContain('layoutId="sakala-sidebar-active-bar"');
    expect(sidebarSource).toContain('src="/sakala-mark.png"');
    expect(sidebarSource).toContain('aria-expanded={sidebarOpen ? true : !effectiveCollapsed}');
    expect(sidebarSource).toContain('useReducedMotion');

    const sampleGroups = [
      {
        sectionTitle: 'PERENCANAAN & MASTER',
        items: [{ id: 'overview', label: 'Beranda', icon: Home }],
      },
      {
        sectionTitle: 'OPERASIONAL & VALIDASI',
        items: [
          { id: 'schedule', label: 'Jadwal Pelajaran', icon: CalendarDays, statusHint: '10 slot aktif' },
          { id: 'validation', label: 'Validasi & Konflik', icon: ShieldCheck, badgeCount: 2 },
        ],
      },
    ];

    const expandedHtml = renderToStaticMarkup(
      createElement(SovereignSidebar, {
        activeScreen: 'schedule',
        navGroups: sampleGroups,
        sidebarOpen: false,
        sidebarCollapsed: false,
        schoolName: 'MAN Insan Cendekia',
        academicYear: '2025/2026',
        semester: 'Ganjil',
        historyCount: 4,
        documentCount: 7,
        scheduleReady: true,
        onNavigate: () => {},
        onToggleCollapse: () => {},
        onCloseMobile: () => {},
        onOpenCommandPalette: () => {},
        onClickVault: () => {},
      })
    );

    expect(expandedHtml).toContain('SAKALA');
    expect(expandedHtml).toContain('MANAJEMEN MADRASAH');
    expect(expandedHtml).toContain('MAN Insan Cendekia');
    expect(expandedHtml).toContain('Pencarian Cepat');
    expect(expandedHtml).toContain('Ctrl K');
    expect(expandedHtml).toContain('sakala-sidebar-ornament');
    expect(expandedHtml).toContain('sakala-nav-active-bg');
    expect(expandedHtml).toContain('sakala-nav-active-bar');
    expect(expandedHtml).toContain('Vault Lokal Aman');
    expect(expandedHtml).toContain('4 versi · 7 arsip');

    const collapsedHtml = renderToStaticMarkup(
      createElement(SovereignSidebar, {
        activeScreen: 'validation',
        navGroups: sampleGroups,
        sidebarOpen: false,
        sidebarCollapsed: true,
        schoolName: 'MAN Insan Cendekia',
        academicYear: '2025/2026',
        semester: 'Ganjil',
        historyCount: 4,
        documentCount: 7,
        scheduleReady: false,
        onNavigate: () => {},
        onToggleCollapse: () => {},
        onCloseMobile: () => {},
        onOpenCommandPalette: () => {},
        onClickVault: () => {},
      })
    );

    expect(collapsedHtml).toContain('sidebar-collapsed');
    expect(collapsedHtml).toContain('sakala-nav-collapsed-divider');
    expect(collapsedHtml).toContain('aria-expanded="false"');
    expect(collapsedHtml).not.toContain('Pencarian Cepat…');
  });

  it('removes dead .side-foot, .status-dot-pulse, and duplicate legacy sidebar block in schedule-redesign.css', () => {
    const jewelCss = readWorkspaceFile('src/styles/signal-v3-jewel-identity.css');
    const atelierCss = readWorkspaceFile('src/styles/signal-v3-atelier.css');
    const redesignCss = readWorkspaceFile('src/styles/schedule-redesign.css');
    const v5Css = readWorkspaceFile('src/styles/signal-v5-tokens.css');

    expect(jewelCss).not.toContain('.side-foot');
    expect(atelierCss).not.toContain('.side-foot');
    expect(atelierCss).not.toContain('.sidebar-toggle-btn');
    expect(atelierCss).not.toContain('.sakala-brand-logo');
    expect(redesignCss).not.toContain('.status-dot-pulse');
    expect(redesignCss).not.toContain('.sidebar-quick-settings-btn');
    expect(redesignCss).not.toContain('.sakala-brand');
    expect(v5Css).not.toContain('.side-foot');
  });

  it('defines unified Sovereign Atelier Pro sidebar architecture in signal-v5-tokens.css', () => {
    const v5Css = readWorkspaceFile('src/styles/signal-v5-tokens.css');

    expect(v5Css).toContain('25. UNIFIED SOVEREIGN SIDEBAR ARCHITECTURE — "SOVEREIGN ATELIER PRO"');
    expect(v5Css).toContain('.sakala-sidebar-ornament');
    expect(v5Css).toContain('.sakala-portal-tooltip');
    expect(v5Css).toContain('.sakala-nav-active-bar');
    expect(v5Css).toContain('.sakala-sidebar-search');
    expect(v5Css).toContain('font-size: 11px !important;');
    expect(v5Css).toContain('.sidebar.sidebar-collapsed .sakala-brand');
    expect(v5Css).toContain('flex-direction: column !important;');
    expect(v5Css).toContain('.sidebar.sidebar-collapsed .sakala-nav-badge');
    expect(v5Css).toContain('color: #A8C8BA !important;');
    expect(v5Css).toContain('letter-spacing: 0.1em !important;');
    expect(v5Css).toContain('width: 264px !important;');
  });
});

