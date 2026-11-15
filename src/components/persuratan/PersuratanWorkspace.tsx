import { useState } from 'react';
import { FileStack, Inbox } from 'lucide-react';
import type { AppState } from '../../domain/types';
import {
  DEFAULT_CORRESPONDENCE_FILTERS,
} from '../../domain/persuratan/selectors';
import type {
  CorrespondenceFilterState,
  CorrespondenceSortKey,
  SortDirection,
} from '../../domain/persuratan/types';
import { CorrespondenceCenter } from './CorrespondenceCenter';
import { TemplateGallery } from './TemplateGallery';
import './TemplateGallery.css';

export type PersuratanSubView = 'center' | 'templates';

export interface PersuratanWorkspaceProps {
  state: AppState;
  initialView?: PersuratanSubView;
  storageError?: string | null;
  onRetryStorage?: () => void;
  onUpdateState?: (updater: (prev: AppState) => AppState) => void;
  onNotify?: (message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

export function PersuratanWorkspace({
  state,
  initialView = 'center',
  storageError = null,
  onRetryStorage,
  onUpdateState,
  onNotify,
}: PersuratanWorkspaceProps) {
  const [subView, setSubView] = useState<PersuratanSubView>(initialView);

  // Lift S01 filter/sort/pagination state so switching S01 <-> S02 never loses user context
  const [s01Filters, setS01Filters] = useState<CorrespondenceFilterState>(DEFAULT_CORRESPONDENCE_FILTERS);
  const [s01SortKey, setS01SortKey] = useState<CorrespondenceSortKey>('documentDate');
  const [s01SortDir, setS01SortDir] = useState<SortDirection>('desc');
  const [s01Page, setS01Page] = useState<number>(1);
  const [s01PageSize, setS01PageSize] = useState<number>(10);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
      <nav className="s02-subnav-bar" aria-label="Sub-layar Persuratan dan Arsip">
        <div className="s02-subnav-tabs" role="tablist" aria-label="Navigasi internal Persuratan">
          <button
            type="button"
            role="tab"
            aria-selected={subView === 'center'}
            className={`s02-subnav-tab ${subView === 'center' ? 'is-active' : ''}`}
            onClick={() => setSubView('center')}
          >
            <Inbox size={15} aria-hidden="true" />
            <span>Pusat Persuratan &amp; Arsip (S01)</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subView === 'templates'}
            className={`s02-subnav-tab ${subView === 'templates' ? 'is-active' : ''}`}
            onClick={() => setSubView('templates')}
          >
            <FileStack size={15} aria-hidden="true" />
            <span>Galeri Template (S02 · 30 Katalog)</span>
          </button>
        </div>
        <span className="s02-subnav-note">
          Satu modul Persuratan &amp; Arsip · Posisi filter S01 tetap tersimpan saat berpindah tab
        </span>
      </nav>

      {subView === 'center' ? (
        <CorrespondenceCenter
          state={state}
          storageError={storageError}
          onRetryStorage={onRetryStorage}
          onOpenTemplateGallery={() => setSubView('templates')}
          controlledFilters={s01Filters}
          onControlledFiltersChange={setS01Filters}
          controlledSortKey={s01SortKey}
          onControlledSortKeyChange={setS01SortKey}
          controlledSortDir={s01SortDir}
          onControlledSortDirChange={setS01SortDir}
          controlledPage={s01Page}
          onControlledPageChange={setS01Page}
          controlledPageSize={s01PageSize}
          onControlledPageSizeChange={setS01PageSize}
        />
      ) : (
        <TemplateGallery
          state={state}
          onUpdateState={onUpdateState}
          onBackToCenter={() => setSubView('center')}
          onNotify={onNotify}
        />
      )}
    </div>
  );
}
