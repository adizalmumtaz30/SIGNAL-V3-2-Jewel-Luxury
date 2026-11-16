import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileEdit, FileStack, FileText, Inbox } from 'lucide-react';
import type { AppState } from '../../domain/types';
import type { DocumentIntakeDraft } from '../../domain/persuratan/types';
import type { DocumentTemplate } from '../../domain/persuratan/templates/types';
import { collectAllTemplates } from '../../domain/persuratan/templates/selectors';
import { DEFAULT_CORRESPONDENCE_FILTERS } from '../../domain/persuratan/selectors';
import type {
  CorrespondenceFilterState,
  CorrespondenceSortKey,
  SortDirection,
} from '../../domain/persuratan/types';
import { CorrespondenceCenter } from './CorrespondenceCenter';
import { TemplateGallery } from './TemplateGallery';
import { DocumentIntakeForm } from './DocumentIntakeForm';
import { DocumentStudio } from './DocumentStudio';
import './TemplateGallery.css';

export type PersuratanSubView = 'center' | 'templates' | 'intake' | 'studio';
export type PersuratanDirtySource = 'intake' | 'studio' | null;

export interface PersuratanWorkspaceProps {
  state: AppState;
  initialView?: PersuratanSubView;
  initialTemplateId?: string | null;
  initialDraftId?: string | null;
  storageError?: string | null;
  onRetryStorage?: () => void;
  onUpdateState?: (updater: (prev: AppState) => AppState) => void;
  onPersistState?: (nextState: AppState) => Promise<void>;
  onDirtyChange?: (dirty: boolean, source?: PersuratanDirtySource) => void;
  onNotify?: (message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

interface PendingTransition {
  targetView: PersuratanSubView;
  targetDraftId?: string | null;
  targetTemplateId?: string | null;
  bumpIntakeSession?: boolean;
  bumpStudioSession?: boolean;
}

export function PersuratanWorkspace({
  state,
  initialView = 'center',
  initialTemplateId = null,
  initialDraftId = null,
  storageError = null,
  onRetryStorage,
  onUpdateState,
  onPersistState,
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
  const [studioSessionKey, setStudioSessionKey] = useState<number>(1);
  const [dirtySource, setDirtySource] = useState<PersuratanDirtySource>(null);
  const [pendingTransition, setPendingTransition] = useState<PendingTransition | null>(null);
  const [pendingEditS03WarningDraft, setPendingEditS03WarningDraft] =
    useState<DocumentIntakeDraft | null>(null);
  const stayOnScreenBtnRef = useRef<HTMLButtonElement | null>(null);

  // Lift S01 filter/sort/pagination state so switching S01 <-> S02 <-> S03 <-> S04 keeps user context
  const [s01Filters, setS01Filters] = useState<CorrespondenceFilterState>(
    DEFAULT_CORRESPONDENCE_FILTERS
  );
  const [s01SortKey, setS01SortKey] = useState<CorrespondenceSortKey>('documentDate');
  const [s01SortDir, setS01SortDir] = useState<SortDirection>('desc');
  const [s01Page, setS01Page] = useState<number>(1);
  const [s01PageSize, setS01PageSize] = useState<number>(10);

  useEffect(() => {
    if (pendingTransition) {
      stayOnScreenBtnRef.current?.focus();
    }
  }, [pendingTransition]);

  const isDirty = dirtySource !== null;

  const setDirtyFlag = (dirty: boolean, source: 'intake' | 'studio') => {
    const nextSource: PersuratanDirtySource = dirty ? source : null;
    setDirtySource(nextSource);
    onDirtyChange?.(dirty, nextSource);
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

  const executeTransition = (transition: PendingTransition) => {
    if (transition.targetTemplateId !== undefined) {
      setActiveTemplateId(transition.targetTemplateId);
    }
    if (transition.targetDraftId !== undefined) {
      setEditingDraftId(transition.targetDraftId);
    }
    if (transition.bumpIntakeSession) {
      setIntakeSessionKey((k) => k + 1);
    }
    if (transition.bumpStudioSession) {
      setStudioSessionKey((k) => k + 1);
    }
    setDirtySource(null);
    onDirtyChange?.(false, null);
    setSubView(transition.targetView);
  };

  const requestTransition = (transition: PendingTransition) => {
    const currentlyInDirtyView =
      (subView === 'intake' && dirtySource === 'intake') ||
      (subView === 'studio' && dirtySource === 'studio');

    if (currentlyInDirtyView && transition.targetView !== subView) {
      setPendingTransition(transition);
      return;
    }
    executeTransition(transition);
  };

  const requestSubViewChange = (target: PersuratanSubView) => {
    requestTransition({ targetView: target });
  };

  const handleUseTemplateFromGallery = (tpl: DocumentTemplate) => {
    executeTransition({
      targetView: 'intake',
      targetTemplateId: tpl.id,
      targetDraftId: null,
      bumpIntakeSession: true,
    });
  };

  const openIntakeForDraft = (draft: DocumentIntakeDraft) => {
    requestTransition({
      targetView: 'intake',
      targetTemplateId: draft.templateId,
      targetDraftId: draft.id,
      bumpIntakeSession: true,
    });
  };

  const handleEditExistingIntakeDraft = (draftId: string) => {
    const found = (state.intakeDrafts ?? []).find((d) => d.id === draftId);
    if (!found) {
      onNotify?.('Draft data awal S03 tidak ditemukan di workspace.', 'warning');
      return;
    }
    if (found.studio?.editorStatus === 'IN_PROGRESS' && found.studio.content) {
      setPendingEditS03WarningDraft(found);
      return;
    }
    openIntakeForDraft(found);
  };

  const handleOpenStudio = (draftId: string) => {
    const found = (state.intakeDrafts ?? []).find((d) => d.id === draftId);
    if (!found) {
      onNotify?.('Draft data awal S03 belum ditemukan untuk dibuka di Document Studio.', 'warning');
      return;
    }
    requestTransition({
      targetView: 'studio',
      targetTemplateId: found.templateId,
      targetDraftId: found.id,
      bumpStudioSession: true,
    });
  };

  const handleSaveIntakeDraft = (
    nextState: AppState,
    savedDraft: DocumentIntakeDraft
  ) => {
    setEditingDraftId(savedDraft.id);
    setActiveTemplateId(savedDraft.templateId);
    setDirtyFlag(false, 'intake');
    onUpdateState?.(() => nextState);
  };

  const handlePersistStudioState = async (
    nextState: AppState,
    savedDraft: DocumentIntakeDraft
  ) => {
    setEditingDraftId(savedDraft.id);
    setActiveTemplateId(savedDraft.templateId);
    if (onPersistState) {
      await onPersistState(nextState);
    } else {
      onUpdateState?.(() => nextState);
    }
    setDirtyFlag(false, 'studio');
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
          {subView === 'studio' && (
            <button
              type="button"
              role="tab"
              aria-selected={true}
              className="s02-subnav-tab is-active"
              onClick={() => requestSubViewChange('studio')}
            >
              <FileText size={15} aria-hidden="true" />
              <span>Document Studio (S04)</span>
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
          onOpenStudio={handleOpenStudio}
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
          onOpenStudio={handleOpenStudio}
          onBackToTemplates={() => requestSubViewChange('templates')}
          onOpenCenter={() => requestSubViewChange('center')}
          onDirtyChange={(dirty) => setDirtyFlag(dirty, 'intake')}
          onNotify={onNotify}
        />
      )}

      {subView === 'studio' && activeDraft && (
        <DocumentStudio
          key={`${activeDraft.id}-${studioSessionKey}`}
          state={state}
          draft={activeDraft}
          storageError={storageError}
          onRetryStorage={onRetryStorage}
          onPersistStudioState={handlePersistStudioState}
          onBackToIntake={() => openIntakeForDraft(activeDraft)}
          onBackToCenter={() => requestSubViewChange('center')}
          onDirtyChange={(dirty) => setDirtyFlag(dirty, 'studio')}
          onNotify={onNotify}
        />
      )}

      {subView === 'studio' && !activeDraft && (
        <div className="s04-banner is-warning" role="region" aria-label="Draft Document Studio tidak ditemukan">
          <div>
            Draft data awal S03 tidak ditemukan atau belum dipilih. Kembali ke Pusat Persuratan untuk
            memilih draft yang tersedia.
          </div>
          <button
            type="button"
            className="s02-btn-primary"
            onClick={() => requestSubViewChange('center')}
          >
            Kembali ke Pusat Persuratan
          </button>
        </div>
      )}

      {/* Warning Modal when Clicking "Edit S03" on a Draft with Existing S04 Studio Content */}
      {pendingEditS03WarningDraft && (
        <div
          className="s01-modal-scrim"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPendingEditS03WarningDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setPendingEditS03WarningDraft(null);
            }
          }}
        >
          <div
            className="s01-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="s03-s04-warning-title"
          >
            <div className="s01-modal-head">
              <div className="s01-modal-title-wrap">
                <div className="s01-modal-icon" aria-hidden="true">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h2 id="s03-s04-warning-title">Naskah Document Studio (S04) Sudah Ada</h2>
                  <p>Draft ini sudah memiliki naskah yang sedang disunting di S04.</p>
                </div>
              </div>
            </div>
            <div className="s01-modal-body">
              <p style={{ margin: 0 }}>
                Menyunting Form Data Awal (S03) akan memperbarui snapshot sumber, sementara naskah S04
                yang sudah Anda tulis akan tetap dipertahankan (tidak tertimpa otomatis). Saat membuka
                S04 kembali, Anda dapat memilih tetap memakai naskah lama atau menyusun ulang dari data S03 baru.
              </p>
            </div>
            <div
              className="s01-modal-foot"
              style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}
            >
              <button
                type="button"
                className="s02-btn-secondary"
                onClick={() => setPendingEditS03WarningDraft(null)}
              >
                Batal
              </button>
              <button
                type="button"
                className="s02-btn-secondary"
                onClick={() => {
                  const target = pendingEditS03WarningDraft;
                  setPendingEditS03WarningDraft(null);
                  handleOpenStudio(target.id);
                }}
              >
                Lanjutkan ke S04
              </button>
              <button
                type="button"
                className="s02-btn-primary"
                onClick={() => {
                  const target = pendingEditS03WarningDraft;
                  setPendingEditS03WarningDraft(null);
                  openIntakeForDraft(target);
                }}
              >
                Edit S03 (Pertahankan S04)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved S03/S04 Changes Guard Modal */}
      {pendingTransition && (
        <div
          className="s01-modal-scrim"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPendingTransition(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setPendingTransition(null);
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
                  <h2 id="s03-unsaved-modal-title">
                    {isDirty && dirtySource === 'studio'
                      ? 'Perubahan Naskah S04 Belum Disimpan'
                      : 'Isian Data Awal Belum Disimpan'}
                  </h2>
                  <p>
                    {dirtySource === 'studio'
                      ? 'Perubahan pada Document Studio (S04) belum disimpan sebagai draft.'
                      : 'Perubahan sementara pada Form Data Awal (S03) belum disimpan sebagai draft.'}
                  </p>
                </div>
              </div>
            </div>
            <div className="s01-modal-body">
              <p style={{ margin: 0 }}>
                Jika Anda keluar sekarang, perubahan yang belum disimpan tidak akan tersimpan ke
                penyimpanan lokal. Lanjutkan keluar tanpa menyimpan?
              </p>
            </div>
            <div
              className="s01-modal-foot"
              style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}
            >
              <button
                ref={stayOnScreenBtnRef}
                type="button"
                className="s02-btn-secondary"
                onClick={() => setPendingTransition(null)}
              >
                {dirtySource === 'studio' ? 'Lanjutkan Menyunting S04' : 'Lanjutkan Mengisi Form'}
              </button>
              <button
                type="button"
                className="s02-btn-primary"
                onClick={() => {
                  const target = pendingTransition;
                  setPendingTransition(null);
                  executeTransition(target);
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
