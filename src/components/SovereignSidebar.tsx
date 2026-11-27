import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronRight, HardDrive, Search, ShieldCheck, X, type LucideIcon } from 'lucide-react';

export interface SovereignSidebarItem {
  id: string;
  label: string;
  icon: LucideIcon;
  badgeCount?: number;
  statusHint?: string;
}

export interface SovereignSidebarGroup {
  sectionTitle: string;
  items: SovereignSidebarItem[];
}

export interface SovereignSidebarProps {
  activeScreen: string;
  navGroups: SovereignSidebarGroup[];
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  schoolName: string;
  academicYear: string;
  semester: string;
  historyCount: number;
  documentCount: number;
  scheduleReady: boolean;
  onNavigate: (screenId: string) => void;
  onToggleCollapse: () => void;
  onCloseMobile: () => void;
  onOpenCommandPalette: () => void;
  onClickVault: () => void;
}

const RAIL_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

interface TooltipCoords {
  top: number;
  left: number;
}

function SidebarPortalTooltip({
  label,
  hint,
  shortcut,
  enabled = true,
  inline = false,
  children,
}: {
  label: string;
  hint?: string;
  shortcut?: string;
  enabled?: boolean;
  inline?: boolean;
  children: ReactNode;
}) {
  const [coords, setCoords] = useState<TooltipCoords | null>(null);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (!enabled) {
      setCoords(null);
      return;
    }
    if (!coords) return;
    const hide = () => setCoords(null);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [enabled, coords]);

  if (!enabled) {
    return <>{children}</>;
  }

  const showFromElement = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    setCoords({
      top: rect.top + rect.height / 2,
      left: rect.right + 12,
    });
  };

  const portalTarget = typeof document !== 'undefined' ? document.body : null;

  return (
    <div
      className={`sakala-tooltip-anchor ${inline ? 'is-inline' : ''}`}
      onMouseEnter={(e) => showFromElement(e.currentTarget)}
      onMouseLeave={() => setCoords(null)}
      onFocus={(e) => showFromElement(e.currentTarget)}
      onBlur={() => setCoords(null)}
    >
      {children}
      {portalTarget &&
        createPortal(
          <AnimatePresence>
            {coords && (
              <motion.div
                role="tooltip"
                className="sakala-portal-tooltip"
                style={{ top: coords.top, left: coords.left }}
                initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, x: -6, scale: 0.96 }}
                animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, x: 0, scale: 1 }}
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -4, scale: 0.97 }}
                transition={{ duration: 0.16, ease: RAIL_EASE }}
              >
                <span className="sakala-portal-tooltip-arrow" aria-hidden="true" />
                <div className="sakala-portal-tooltip-body">
                  <span className="sakala-portal-tooltip-label">{label}</span>
                  {hint && <span className="sakala-portal-tooltip-hint">{hint}</span>}
                </div>
                {shortcut && <kbd className="sakala-portal-tooltip-kbd">{shortcut}</kbd>}
              </motion.div>
            )}
          </AnimatePresence>,
          portalTarget
        )}
    </div>
  );
}

function SidebarKhatamOrnament({ position }: { position: 'top' | 'bottom' }) {
  return (
    <svg
      className={`sakala-sidebar-ornament is-${position}`}
      viewBox="0 0 180 180"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="90" cy="90" r="82" stroke="#CBD8D1" strokeWidth="0.75" strokeDasharray="3 4" />
      <circle cx="90" cy="90" r="62" stroke="#CBD8D1" strokeWidth="0.75" />
      <rect x="44" y="44" width="92" height="92" stroke="#CBD8D1" strokeWidth="0.7" />
      <rect
        x="44"
        y="44"
        width="92"
        height="92"
        transform="rotate(45 90 90)"
        stroke="#CBD8D1"
        strokeWidth="0.7"
      />
      <circle cx="90" cy="90" r="24" stroke="#CBD8D1" strokeWidth="0.65" strokeDasharray="2 3" />
    </svg>
  );
}

export function SovereignSidebar({
  activeScreen,
  navGroups,
  sidebarOpen,
  sidebarCollapsed,
  schoolName,
  academicYear,
  semester,
  historyCount,
  documentCount,
  scheduleReady,
  onNavigate,
  onToggleCollapse,
  onCloseMobile,
  onOpenCommandPalette,
  onClickVault,
}: SovereignSidebarProps) {
  const shouldReduceMotion = useReducedMotion();
  const effectiveCollapsed = sidebarCollapsed && !sidebarOpen;

  return (
    <>
      <div
        className={`sidebar-backdrop ${sidebarOpen ? 'is-visible' : ''}`}
        onClick={onCloseMobile}
        aria-hidden="true"
      />

      <aside
        className={`sidebar ${sidebarOpen ? 'is-open' : ''} ${effectiveCollapsed ? 'sidebar-collapsed' : ''}`}
        aria-label="Navigasi utama"
      >
        <div className="sakala-sidebar-ambient" aria-hidden="true" />
        <SidebarKhatamOrnament position="top" />
        <SidebarKhatamOrnament position="bottom" />

        {/* 1. Sovereign Brand Lockup + Semantic Sibling Rail Toggle */}
        <div className="sakala-brand">
          <SidebarPortalTooltip
            label="SAKALA — Beranda"
            hint={`${schoolName || 'Madrasah'} · TA ${academicYear}`}
            enabled={effectiveCollapsed}
          >
            <button
              type="button"
              className="sakala-brand-btn"
              onClick={() => onNavigate('overview')}
              aria-label="SAKALA — Kembali ke Beranda"
            >
              <div className="v3-brandmark">
                <img src="/sakala-mark.png" alt="Logo SAKALA" />
                <span className="v3-brandmark-sheen" aria-hidden="true" />
              </div>

              <AnimatePresence initial={false}>
                {!effectiveCollapsed && (
                  <motion.div
                    className="sakala-brand-info"
                    initial={shouldReduceMotion ? false : { opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -6 }}
                    transition={{ duration: 0.16, ease: RAIL_EASE }}
                  >
                    <h2 className="sakala-brand-title">SAKALA</h2>
                    <span className="sakala-brand-subtitle">MANAJEMEN MADRASAH</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          </SidebarPortalTooltip>

          <SidebarPortalTooltip
            label={sidebarOpen ? 'Tutup menu' : effectiveCollapsed ? 'Perluas Sidebar' : 'Perkecil Sidebar'}
            inline
            enabled={!sidebarOpen}
          >
            <button
              type="button"
              className="sidebar-collapse-toggle"
              aria-label={sidebarOpen ? 'Tutup menu' : effectiveCollapsed ? 'Perluas menu' : 'Perkecil menu'}
              aria-expanded={sidebarOpen ? true : !effectiveCollapsed}
              onClick={() => {
                if (sidebarOpen) {
                  onCloseMobile();
                } else {
                  onToggleCollapse();
                }
              }}
            >
              <AnimatePresence mode="wait" initial={false}>
                {sidebarOpen ? (
                  <motion.span
                    key="sb-close"
                    className="sakala-toggle-chevron"
                    initial={shouldReduceMotion ? false : { opacity: 0, rotate: -90, scale: 0.7 }}
                    animate={{ opacity: 1, rotate: 0, scale: 1 }}
                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, rotate: 90, scale: 0.7 }}
                    transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.19, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <X size={14} aria-hidden="true" />
                  </motion.span>
                ) : (
                  <motion.span
                    key="sb-chevron"
                    className="sakala-toggle-chevron"
                    initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.78 }}
                    animate={{ opacity: 1, scale: 1, rotate: effectiveCollapsed ? 0 : 180 }}
                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.78 }}
                    transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.21, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <ChevronRight size={13} aria-hidden="true" />
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </SidebarPortalTooltip>
        </div>

        {/* 2. Unboxed Institutional Context Line & Engraved Command Trigger */}
        <AnimatePresence initial={false}>
          {!effectiveCollapsed && (
            <motion.div
              className="sakala-brand-context"
              initial={shouldReduceMotion ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={{ duration: 0.16, ease: RAIL_EASE }}
            >
              <span className="sakala-brand-context-school" title={schoolName}>
                {schoolName}
              </span>
              <span className="sakala-brand-context-sep" aria-hidden="true">·</span>
              <span className="sakala-brand-context-term s5-tnum">
                {semester} {academicYear}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <SidebarPortalTooltip
          label="Pencarian Cepat"
          hint="Guru, kelas, surat & menu"
          shortcut="Ctrl K"
          enabled={effectiveCollapsed}
        >
          <button
            type="button"
            className={`sakala-sidebar-search ${effectiveCollapsed ? 'is-collapsed' : ''}`}
            onClick={onOpenCommandPalette}
            aria-label="Buka pencarian cepat Command Palette"
          >
            <Search size={14} className="sakala-sidebar-search-icon" aria-hidden="true" />
            {!effectiveCollapsed && (
              <>
                <span className="sakala-sidebar-search-label">Pencarian Cepat…</span>
                <kbd className="sakala-sidebar-search-kbd">Ctrl K</kbd>
              </>
            )}
          </button>
        </SidebarPortalTooltip>

        {/* 3. Sole Scrollable Navigation Rail with Sliding Gold Jewel Indicator */}
        <nav className="sakala-nav" aria-label="Navigasi alur kerja">
          {navGroups.map((group) => (
            <div key={group.sectionTitle} className="sakala-nav-group">
              {!effectiveCollapsed ? (
                <div className="sakala-nav-section-title">{group.sectionTitle}</div>
              ) : (
                <div className="sakala-nav-collapsed-divider" aria-hidden="true" />
              )}

              {group.items.map((item) => {
                const isActive = activeScreen === item.id;
                const badgeCount = item.badgeCount ?? 0;
                const Icon = item.icon;
                const tooltipHint =
                  badgeCount > 0
                    ? `${badgeCount} bentrok perlu dicek`
                    : item.statusHint;

                return (
                  <SidebarPortalTooltip
                    key={item.id}
                    label={item.label}
                    hint={tooltipHint}
                    enabled={effectiveCollapsed}
                  >
                    <motion.button
                      type="button"
                      className={`sakala-nav-item ${isActive ? 'active' : ''}`}
                      onClick={() => onNavigate(item.id)}
                      aria-current={isActive ? 'page' : undefined}
                      aria-label={item.label}
                      whileHover={shouldReduceMotion ? undefined : { x: effectiveCollapsed ? 0 : 2 }}
                      whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
                      transition={{ duration: 0.14, ease: RAIL_EASE }}
                    >
                      {isActive && (
                        <>
                          <motion.span
                            layoutId="sakala-sidebar-active-pill"
                            className="sakala-nav-active-bg"
                            aria-hidden="true"
                            transition={
                              shouldReduceMotion
                                ? { duration: 0 }
                                : { type: 'spring', stiffness: 380, damping: 32 }
                            }
                          />
                          <motion.span
                            layoutId="sakala-sidebar-active-bar"
                            className="sakala-nav-active-bar"
                            aria-hidden="true"
                            transition={
                              shouldReduceMotion
                                ? { duration: 0 }
                                : { type: 'spring', stiffness: 420, damping: 30 }
                            }
                          />
                        </>
                      )}

                      <span className="sakala-nav-icon-wrap" aria-hidden="true">
                        <Icon
                          className="icon"
                          strokeWidth={isActive ? 2.2 : 1.75}
                        />
                      </span>

                      <AnimatePresence initial={false}>
                        {!effectiveCollapsed && (
                          <motion.span
                            className="sakala-nav-item-label"
                            initial={shouldReduceMotion ? false : { opacity: 0, x: -4 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -4 }}
                            transition={{ duration: 0.12, ease: RAIL_EASE }}
                          >
                            {item.label}
                          </motion.span>
                        )}
                      </AnimatePresence>

                      {badgeCount > 0 && (
                        <span className="sakala-nav-badge s5-tnum">{badgeCount}</span>
                      )}
                    </motion.button>
                  </SidebarPortalTooltip>
                );
              })}
            </div>
          ))}
        </nav>

        {/* 4. Interactive Sovereign Vault Status Footer */}
        <SidebarPortalTooltip
          label="Vault Penyimpanan Lokal"
          hint={`${historyCount} versi jadwal · ${documentCount} dokumen · ${scheduleReady ? 'Jadwal Siap' : 'Mode Penyusunan'}`}
          enabled={effectiveCollapsed}
        >
          <button
            type="button"
            className={`sidebar-status-footer ${effectiveCollapsed ? 'is-collapsed' : ''}`}
            onClick={onClickVault}
            aria-label={`Vault Penyimpanan Lokal aktif (${historyCount} versi jadwal, ${documentCount} dokumen). Klik untuk membuka Riwayat dan Backup.`}
          >
            <div className="sidebar-status-indicator">
              <span className="sidebar-vault-emblem" aria-hidden="true">
                {scheduleReady ? (
                  <ShieldCheck size={14} className="s5-sidebar-db-icon" />
                ) : (
                  <HardDrive size={14} className="s5-sidebar-db-icon" />
                )}
              </span>

              {!effectiveCollapsed && (
                <div className="sidebar-status-text">
                  <span className="sidebar-status-label">Vault Lokal Aman</span>
                  <span className="sidebar-status-meta s5-tnum">
                    {historyCount} versi · {documentCount} arsip
                  </span>
                </div>
              )}
            </div>

            {!effectiveCollapsed && (
              <ChevronRight size={13} className="sidebar-vault-arrow" aria-hidden="true" />
            )}
          </button>
        </SidebarPortalTooltip>
      </aside>
    </>
  );
}
