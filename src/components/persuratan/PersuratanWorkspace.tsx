import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileEdit, FileStack, Inbox } from 'lucide-react';
import type { AppState } from '../../domain/types';
import type { DocumentIntakeDraft } from '../../domain/persuratan/types';
import type { DocumentTemplate } from '../../domain/persuratan/templates/types';
import { collectAllTemplates } from '../../domain/persuratan/templates/selectors';
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
import { DocumentIntakeForm } from './DocumentIntakeForm';
import './TemplateGallery.css';

export type PersuratanSubView = 'center' | 'templates' | 'intake';

export interface PersuratanWorkspaceProps {
  state: AppState;
  initialView?: PersuratanSubView;
  initialTemplateId?: string | null;
  initialDraftId?: string | null;
  storageError?: string | null;
  onRetryStorage?: () => void;
  onUpdateState?: (updater: (prev: AppState) => AppState) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onNotify?: (message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

export function PersuratanWorkspace({
  state,
  initialView = 'center',
  initialTemplateId = null,
  initialDraftId = null,
  storageError = null,
  onRetryStorage,
  onUpdateState,
  onDirtyChange,
  onNotify,
}: PersuratanWorkspaceProps) {
  const allTemplates = useMemo(
    () => collectAllTemplates(state.customTemplates ?? []),
    [state.customTemplates]
  );

  const [subView, setSubView] = useState<PersuratanSubView>(initialView);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(
    () => initialTemplateId ?? state.templatePreferences?.selectedTemplateId ?? null
  );
  const [editingDraftId, setEditingDraftId] = useState<string | null>(initialDraftId);
  const [intakeSessionKey, setIntakeSessionKey] = useState<number>(1);
  const [s03Dirty, setS03Dirty] = useState<boolean>(false);
  const [pendingTargetView, setPendingTargetView] = useState<PersuratanSubView | null>(null);
  const stayOnIntakeBtnRef = useRef<HTMLButtonElement | null>(null);

  // Lift S01 filter/sort/pagination state so switching S01 <-> S02 <-> S03 never loses user context
  const [s01Filters, setS01Filters] = useState<CorrespondenceFilterState>(DEFAULT_CORRESPONDENCE_FILTERS);
  const [s01SortKey, setS01SortKey] = useState<CorrespondenceSortKey>('documentDate');
  const [s01SortDir, setS01SortDir] = useState<SortDirection>('desc');
  const [s01Page, setS01Page] = useState<number>(1);
  const [s01PageSize, setS01PageSize] = useState<number>(10);

  useEffect(() => {
    if (pendingTargetView) {
      stayOnIntakeBtnRef.current?.focus();
    }
  }, [pendingTargetView]);

  const setDirtyFlag = (dirty: boolean) => {
    setS03Dirty(dirty);
    onDirtyChange?.(dirty);
  };

  const activeDraft: DocumentIntakeDraft | null = useMemo(() => {
    if (!editingDraftId) return null;
    return (state.intakeDrafts ?? []).find((d) => d.id === editingDraftId) ?? null;
  }, [editingDraftId, state.intakeDrafts]);

  const activeIntakeTemplate: DocumentTemplate | null = useMemo(() => {
    const targetTplId = activeDraft?.templateId ?? activeTemplateId;
    if (targetTplId) {
      const found = allTemplates.find((t) => t.id === targetTplId);
      if (found) return found;
    }
    return allTemplates[0] ?? null;
  }, [activeDraft, activeTemplateId, allTemplates]);

  const requestSubViewChange = (target: PersuratanSubView) => {
    if (subView === 'intake' && s03Dirty && target !== 'intake') {
      setPendingTargetView(target);
      return;
    }
    if (target !== 'intake') {
      setDirtyFlag(false);
    }
    setSubView(target);
  };

  const handleUseTemplateFromGallery = (tpl: DocumentTemplate) => {
    setActiveTemplateId(tpl.id);
    setEditingDraftId(null);
    setDirtyFlag(false);
    setIntakeSessionKey((k) => k + 1);
    setSubView('intake');
  };

  const handleEditExistingIntakeDraft = (draftId: string) => {
    const found = (state.intakeDrafts ?? []).find((d) => d.id === draftId);
    if (!found) {
      onNotify?.('Draft data awal S03 tidak ditemukan di workspace.', 'warning');
      return;
    }
    setActiveTemplateId(found.templateId);
    setEditingDraftId(found.id);
    setDirtyFlag(false);
    setIntakeSessionKey((k) => k + 1);
    setSubView('intake');
  };

  const handleSaveIntakeDraft = (
    nextState: AppState,
    savedDraft: DocumentIntakeDraft
  ) => {
    setEditingDraftId(savedDraft.id);
    setActiveTemplateId(savedDraft.templateId);
    setDirtyFlag(false);
    onUpdateState?.(() => nextState);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
      <nav className="s02-subnav-bar" aria-label="Sub-layar Persuratan dan Arsip">
        <div className="s02-subnav-tabs" role="tablist" aria-label="Navigasi internal Persuratan">
          <button
            type="button"
            role="tab"
            aria-selected={subView === 'center'}
            className={`s02-subnav-tab ${subView === 'center' ? 'is-active' : ''}`}
            onClick={() => requestSubViewChange('center')}
          >
            <Inbox size={15} aria-hidden="true" />
            <span>Pusat Persuratan &amp; Arsip (S01)</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subView === 'templates'}
            className={`s02-subnav-tab ${subView === 'templates' ? 'is-active' : ''}`}
            onClick={() => requestSubViewChange('templates')}
          >
            <FileStack size={15} aria-hidden="true" />
            <span>Galeri Template (S02 · 30 Katalog)</span>
          </button>
          {subView === 'intake' && (
            <button
              type="button"
              role="tab"
              aria-selected={true}
              className="s02-subnav-tab is-active"
              onClick={() => requestSubViewChange('intake')}
            >
              <FileEdit size={15} aria-hidden="true" />
              <span>Form Data Awal (S03)</span>
            </button>
          )}
        </div>
        <span className="s02-subnav-note">
          Satu modul Persuratan &amp; Arsip · Posisi filter S01 tetap tersimpan saat berpindah tab
        </span>
      </nav>

      {subView === 'center' && (
        <CorrespondenceCenter
          state={state}
          storageError={storageError}
          onRetryStorage={onRetryStorage}
          onOpenTemplateGallery={() => requestSubViewChange('templates')}
          onEditIntakeDraft={handleEditExistingIntakeDraft}
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
      )}

      {subView === 'templates' && (
        <TemplateGallery
          state={state}
          onUpdateState={onUpdateState}
          onBackToCenter={() => requestSubViewChange('center')}
          onUseTemplate={handleUseTemplateFromGallery}
          onNotify={onNotify}
        />
      )}

      {subView === 'intake' && activeIntakeTemplate && (
        <DocumentIntakeForm
          key={`${activeIntakeTemplate.id}-${activeDraft?.id ?? 'new'}-${intakeSessionKey}`}
          state={state}
          template={activeIntakeTemplate}
          existingDraft={activeDraft}
          storageError={storageError}
          onRetryStorage={onRetryStorage}
          onSaveDraft={handleSaveIntakeDraft}
          onBackToTemplates={() => requestSubViewChange('templates')}
          onOpenCenter={() => requestSubViewChange('center')}
          onDirtyChange={setDirtyFlag}
          onNotify={onNotify}
        />
      )}

      {/* Unsaved Intake Changes Guard Modal (Internal S03 -> S01/S02) */}
      {pendingTargetView && (
        <div
          className="s01-modal-scrim"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPendingTargetView(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setPendingTargetView(null);
            }
          }}
        >
          <div
            className="s01-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="s03-unsaved-modal-title"
          >
            <div className="s01-modal-head">
              <div className="s01-modal-title-wrap">
                <div className="s01-modal-icon" aria-hidden="true">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h2 id="s03-unsaved-modal-title">Isian Data Awal Belum Disimpan</h2>
                  <p>Perubahan sementara pada Form Data Awal (S03) belum disimpan sebagai draft.</p>
                </div>
              </div>
            </div>
            <div className="s01-modal-body">
              <p style={{ margin: 0 }}>
                Jika Anda keluar sekarang, isian yang belum disimpan tidak akan tersimpan ke daftar dokumen. Lanjutkan keluar tanpa menyimpan?
              </p>
            </div>
            <div className="s01-modal-foot" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                ref={stayOnIntakeBtnRef}
                type="button"
                className="s02-btn-secondary"
                onClick={() => setPendingTargetView(null)}
              >
                Lanjutkan Mengisi Form
              </button>
              <button
                type="button"
                className="s02-btn-primary"
                onClick={() => {
                  const target = pendingTargetView;
                  setPendingTargetView(null);
                  setDirtyFlag(false);
                  setSubView(target);
                }}
              >
                Keluar Tanpa Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
