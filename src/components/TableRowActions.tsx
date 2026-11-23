import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';

export interface RowKebabItem {
  id: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}

export interface TableRowActionsProps {
  primary?: {
    label: string;
    icon?: ReactNode;
    onClick: () => void;
    disabled?: boolean;
    title?: string;
    ariaLabel?: string;
  };
  items: RowKebabItem[];
  ariaLabel?: string;
}

/**
 * Attio / Linear Style Row Actions:
 * - Hover/focus reveal agar tabel tampak lapang tanpa deretan tombol berjajar
 * - Maksimal 1 aksi cepat saat hover + 1 tombol kebab ⋯ untuk aksi lanjutan & hapus
 */
export function TableRowActions({ primary, items, ariaLabel = 'Opsi baris' }: TableRowActionsProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`s5-row-actions ${open ? 'is-open' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      {primary && (
        <button
          type="button"
          className="s5-row-action-primary"
          disabled={primary.disabled}
          title={primary.title ?? primary.label}
          aria-label={primary.ariaLabel ?? primary.label}
          onClick={primary.onClick}
        >
          {primary.icon}
          <span>{primary.label}</span>
        </button>
      )}

      {items.length > 0 && (
        <div className="s5-row-kebab-wrap">
          <button
            type="button"
            className={`s5-row-kebab-btn ${open ? 'is-active' : ''}`}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={ariaLabel}
            title="Menu aksi"
            onClick={() => setOpen((prev) => !prev)}
          >
            <MoreHorizontal size={15} aria-hidden="true" />
          </button>

          {open && (
            <div className="s5-row-kebab-menu" role="menu" aria-label={ariaLabel}>
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  className={`s5-menu-item ${item.tone === 'danger' ? 'danger' : ''}`}
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
