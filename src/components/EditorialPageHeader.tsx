import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, HelpCircle, MoreHorizontal } from 'lucide-react';

export interface EditorialHeaderAction {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  title?: string;
  shortcut?: string;
}

export interface EditorialOverflowItem {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}

export interface EditorialRuleInfo {
  title?: string;
  items: string[];
  ariaLabel?: string;
}

export interface EditorialPageHeaderProps {
  kicker?: string;
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  ruleInfo?: EditorialRuleInfo;
  primaryAction?: EditorialHeaderAction;
  secondaryAction?: EditorialHeaderAction;
  overflowLabel?: string;
  overflowIcon?: ReactNode;
  overflowActions?: EditorialOverflowItem[];
  rightSlot?: ReactNode;
  variant?: 'default' | 'featured';
  className?: string;
  ariaLabel?: string;
}

/**
 * Standar Header Editorial SAKALA (Figma Pro Quiet Authority)
 * - Maksimal 1 baris subjudul human-grade
 * - Detail aturan/ketentuan dipindah ke popover ?
 * - Maksimal 1 Primary CTA + 1 Secondary/Menu (+ overflow dropdown opsional)
 */
export function EditorialPageHeader({
  kicker,
  title,
  subtitle,
  meta,
  ruleInfo,
  primaryAction,
  secondaryAction,
  overflowLabel = 'Lainnya',
  overflowIcon,
  overflowActions,
  rightSlot,
  variant = 'default',
  className = '',
  ariaLabel,
}: EditorialPageHeaderProps) {
  const [ruleOpen, setRuleOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const ruleRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const rulePopoverId = useId();

  useEffect(() => {
    if (!ruleOpen && !menuOpen) return;

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (ruleOpen && ruleRef.current && !ruleRef.current.contains(target)) {
        setRuleOpen(false);
      }
      if (menuOpen && menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setRuleOpen(false);
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [ruleOpen, menuOpen]);

  const visibleOverflow = (overflowActions ?? []).filter(Boolean);
  const hasSecondaryOrMenu = Boolean(secondaryAction) || visibleOverflow.length > 0;
  const hasAnyActions = Boolean(primaryAction) || hasSecondaryOrMenu || Boolean(rightSlot);

  return (
    <header
      className={`s5-editorial-header ${variant === 'featured' ? 'is-featured' : ''} ${className}`.trim()}
      aria-label={ariaLabel ?? title}
    >
      <div className="s5-editorial-header-copy">
        {kicker && <div className="s5-page-kicker">{kicker}</div>}
        <div className="s5-editorial-title-row">
          <h1 className="s5-page-title">{title}</h1>
          {ruleInfo && ruleInfo.items.length > 0 && (
            <div className="s5-rule-info-wrap" ref={ruleRef}>
              <button
                type="button"
                className={`s5-rule-info-btn s5-tooltip-bottom ${ruleOpen ? 'is-active' : ''}`}
                aria-expanded={ruleOpen}
                aria-controls={rulePopoverId}
                aria-label={ruleInfo.ariaLabel ?? 'Lihat ringkasan aturan halaman'}
                data-s5-tooltip="Ketentuan & panduan singkat"
                onClick={() => setRuleOpen((prev) => !prev)}
              >
                <HelpCircle size={15} aria-hidden="true" />
              </button>
              {ruleOpen && (
                <div
                  id={rulePopoverId}
                  className="s5-rule-popover"
                  role="dialog"
                  aria-label={ruleInfo.title ?? 'Ketentuan Halaman'}
                >
                  <div className="s5-rule-popover-title">{ruleInfo.title ?? 'Ketentuan'}</div>
                  <ul className="s5-rule-popover-list">
                    {ruleInfo.items.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
        {subtitle && <p className="s5-page-subtitle s5-editorial-subtitle">{subtitle}</p>}
        {meta && <div className="s5-editorial-meta">{meta}</div>}
      </div>

      {hasAnyActions && (
        <div className="s5-editorial-header-right">
          {rightSlot && <div className="s5-editorial-right-slot">{rightSlot}</div>}

          {(primaryAction || secondaryAction || visibleOverflow.length > 0) && (
            <div className="s5-editorial-header-actions">
              {visibleOverflow.length > 0 && (
                <div className="s5-header-overflow-wrap" ref={menuRef}>
                  <button
                    type="button"
                    className={`button button-secondary ${menuOpen ? 'is-active' : ''}`}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    onClick={() => setMenuOpen((prev) => !prev)}
                  >
                    {overflowIcon ?? <MoreHorizontal size={15} aria-hidden="true" />}
                    <span>{overflowLabel}</span>
                    {overflowLabel !== '⋯' && (
                      <ChevronDown
                        size={13}
                        aria-hidden="true"
                        style={{
                          transform: menuOpen ? 'rotate(180deg)' : 'none',
                          transition: 'transform 140ms ease',
                        }}
                      />
                    )}
                  </button>

                  {menuOpen && (
                    <div className="s5-header-overflow-menu" role="menu" aria-label={overflowLabel}>
                      {visibleOverflow.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          role="menuitem"
                          disabled={item.disabled}
                          className={`s5-menu-item ${item.tone === 'danger' ? 'danger' : ''}`}
                          onClick={() => {
                            setMenuOpen(false);
                            item.onClick();
                          }}
                        >
                          {item.icon && <span className="s5-menu-item-icon">{item.icon}</span>}
                          <span className="s5-menu-item-copy">
                            <strong>{item.label}</strong>
                            {item.description && <small>{item.description}</small>}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {secondaryAction && (
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={secondaryAction.disabled}
                  title={secondaryAction.title}
                  onClick={secondaryAction.onClick}
                >
                  {secondaryAction.icon}
                  <span>{secondaryAction.label}</span>
                </button>
              )}

              {primaryAction && (
                <button
                  type="button"
                  className="button button-primary"
                  disabled={primaryAction.disabled}
                  title={primaryAction.title}
                  onClick={primaryAction.onClick}
                >
                  {primaryAction.icon}
                  <span>{primaryAction.label}</span>
                  {primaryAction.shortcut && (
                    <kbd className="s5-btn-kbd">{primaryAction.shortcut}</kbd>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
