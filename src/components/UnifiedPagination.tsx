import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface UnifiedPaginationProps {
  totalItems: number;
  page: number;
  pageSize: number;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange: (nextSize: number) => void;
  pageSizeOptions?: number[];
  allowShowAll?: boolean;
  itemLabel?: string;
  selectAriaLabel?: string;
  navAriaLabel?: string;
  topSlot?: React.ReactNode;
  leftExtra?: React.ReactNode;
  rightExtra?: React.ReactNode;
  className?: string;
}

function buildPaginationItems(current: number, total: number): Array<number | 'ellipsis'> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, idx) => idx + 1);
  }
  const items: Array<number | 'ellipsis'> = [1];
  if (current > 3) items.push('ellipsis');
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let p = start; p <= end; p += 1) {
    items.push(p);
  }
  if (current < total - 2) items.push('ellipsis');
  items.push(total);
  return items;
}

export const UnifiedPagination: React.FC<UnifiedPaginationProps> = ({
  totalItems,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
  allowShowAll = false,
  itemLabel = 'data',
  selectAriaLabel,
  navAriaLabel,
  topSlot,
  leftExtra,
  rightExtra,
  className = '',
}) => {
  const effectiveSize = pageSize > 0 ? pageSize : Math.max(1, totalItems);
  const totalPages = pageSize <= 0 ? 1 : Math.max(1, Math.ceil(totalItems / effectiveSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIdx = totalItems === 0 ? 0 : (safePage - 1) * effectiveSize + 1;
  const endIdx = totalItems === 0 ? 0 : Math.min(totalItems, safePage * effectiveSize);
  const pageItems = buildPaginationItems(safePage, totalPages);

  return (
    <div className={`s5-unified-pagination ${className}`.trim()}>
      {topSlot}
      <div className="s5-unified-pag-row">
        <div className="s5-unified-pag-meta">
          <div className="s5-unified-pag-select-wrap">
            <select
              aria-label={selectAriaLabel ?? `Jumlah ${itemLabel} per halaman`}
              className="s5-unified-pag-select s5-tnum"
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
              }}
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size} Baris
                </option>
              ))}
              {allowShowAll && (
                <option value={0}>Semua ({totalItems})</option>
              )}
            </select>
          </div>
          <span className="s5-unified-pag-summary s5-tnum">
            {totalItems === 0 ? (
              <>0 {itemLabel}</>
            ) : (
              <>
                Menampilkan <strong>{startIdx}–{endIdx}</strong> dari{' '}
                <strong>{totalItems}</strong> {itemLabel}
              </>
            )}
          </span>
          {leftExtra && <div className="s5-unified-pag-extra">{leftExtra}</div>}
        </div>

        <div className="s5-unified-pag-controls">
          {pageSize > 0 && totalPages > 1 && (
            <nav
              className="s5-unified-pag-pages"
              aria-label={navAriaLabel ?? `Navigasi halaman ${itemLabel}`}
            >
              <button
                type="button"
                className="s5-unified-pag-btn"
                disabled={safePage <= 1}
                onClick={() => onPageChange(Math.max(1, safePage - 1))}
                aria-label="Halaman sebelumnya"
                title="Halaman sebelumnya"
              >
                <ChevronLeft size={14} aria-hidden="true" />
              </button>

              {pageItems.map((item, idx) =>
                item === 'ellipsis' ? (
                  <span
                    key={`u-ell-${idx}`}
                    className="s5-unified-pag-ellipsis"
                    aria-hidden="true"
                  >
                    …
                  </span>
                ) : (
                  <button
                    key={`u-pg-${item}`}
                    type="button"
                    className={`s5-unified-pag-btn s5-tnum ${safePage === item ? 'is-active' : ''}`}
                    aria-current={safePage === item ? 'page' : undefined}
                    onClick={() => onPageChange(item)}
                  >
                    {item}
                  </button>
                ),
              )}

              <button
                type="button"
                className="s5-unified-pag-btn"
                disabled={safePage >= totalPages}
                onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
                aria-label="Halaman berikutnya"
                title="Halaman berikutnya"
              >
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            </nav>
          )}

          {totalPages > 1 && (
            <span className="s5-unified-pag-indicator s5-tnum">
              Halaman {safePage} dari {totalPages}
            </span>
          )}

          {rightExtra}
        </div>
      </div>
    </div>
  );
};
