import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Check,
  FileStack,
  Inbox,
  SlidersHorizontal,
} from 'lucide-react';
import type { AppState } from '../../domain/types';
import type { DocumentIntakeDraft } from '../../domain/persuratan/types';
import type { DocumentTemplate } from '../../domain/persuratan/templates/types';
import { collectAllTemplates } from '../../domain/persuratan/templates/selectors';
import { DEFAULT_CORRESPONDENCE_FILTERS } from '../../domain/persuratan/selectors';
import type {
  CorrespondenceFilterState,
  CorrespondenceSortKey,
  PersuratanLaunchRequest,
  SortDirection,
} from '../../domain/persuratan/types';
import { CorrespondenceCenter } from './CorrespondenceCenter';
import { TemplateGallery } from './TemplateGallery';
import { DocumentIntakeForm } from './DocumentIntakeForm';
import { DocumentStudio } from './DocumentStudio';
import { DocumentPreviewFinalize } from './DocumentPreviewFinalize';
import { DocumentArchiveDetail } from './DocumentArchiveDetail';
import { TemplateManager } from './TemplateManager';
import {
  deleteDraftFromState,
  duplicateDraftInState,
  type DeleteDraftTarget,
  type DuplicateDraftTarget,
} from '../../domain/persuratan/intake/draftEngine';
import { cloneOfficialDocumentToNewDraft } from '../../domain/persuratan/archive/archiveEngine';
import './PersuratanLuxuryPrimitives.css';
import './TemplateGallery.css';

export type PersuratanSubView =
  | 'center'
  | 'templates'
  | 'intake'
  | 'studio'
  | 'preview'
  | 'detail'
  | 'template-manager';
export type PersuratanDirtySource = 'intake' | 'studio' | null;

export interface PersuratanWorkspaceProps {
  state: AppState;
  initialView?: PersuratanSubView;
  initialTemplateId?: string | null;
  initialDraftId?: string | null;
  launchRequest?: PersuratanLaunchRequest | null;
  storageError?: string | null;
  onRetryStorage?: () => void;
  onUpdateState?: (updater: (prev: AppState) => AppState) => void;
  onPersistState?: (nextState: AppState) => Promise<void>;
  onDirtyChange?: (dirty: boolean, source?: PersuratanDirtySource) => void;
  onNavigateToSettings?: () => void;
  onNotify?: (message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

interface PendingTransition {
  targetView: PersuratanSubView;
  targetDraftId?: string | null;
  targetTemplateId?: string | null;
  targetDocumentId?: string | null;
  targetVersionId?: string | null;
  targetPrefillValues?: Record<string, unknown> | null;
  targetLinkedAssignmentId?: string | null;
  targetTemplateSourceDocId?: string | null;
  bumpIntakeSession?: boolean;
  bumpStudioSession?: boolean;
}

export function PersuratanWorkspace({
  state,
  initialView = 'center',
  initialTemplateId = null,
  initialDraftId = null,
  launchRequest = null,
  storageError = null,
  onRetryStorage,
  onUpdateState,
  onPersistState,
  onDirtyChange,
  onNavigateToSettings,
  onNotify,
}: PersuratanWorkspaceProps) {
  const allTemplates = useMemo(
    () => collectAllTemplates(state.customTemplates ?? []),
    [state.customTemplates]
  );

  const [subView, setSubView] = useState<PersuratanSubView>(
    () => launchRequest?.view ?? initialView
  );
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(
    () =>
      launchRequest?.templateId ??
      initialTemplateId ??
      state.templatePreferences?.selectedTemplateId ??
      null
  );
  const [editingDraftId, setEditingDraftId] = useState<string | null>(
    launchRequest?.draftId ?? initialDraftId
  );
  const [previewDocumentId, setPreviewDocumentId] = useState<string | null>(
    launchRequest?.documentId ?? null
  );
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(
    launchRequest?.versionId ?? null
  );
  const [activePrefillValues, setActivePrefillValues] = useState<Record<string, unknown> | null>(
    launchRequest?.prefillValues ?? null
  );
  const [activeLinkedAssignmentId, setActiveLinkedAssignmentId] = useState<string | null>(
    launchRequest?.linkedAssignmentId ?? null
  );
  const [templateManagerSourceDocId, setTemplateManagerSourceDocId] = useState<string | null>(null);
  const [intakeSessionKey, setIntakeSessionKey] = useState<number>(1);
  const [studioSessionKey, setStudioSessionKey] = useState<number>(1);
  const [dirtySource, setDirtySource] = useState<PersuratanDirtySource>(null);
  const [isStudioFocusMode, setIsStudioFocusMode] = useState<boolean>(false);
  const [pendingTransition, setPendingTransition] = useState<PendingTransition | null>(null);
  const stayOnScreenBtnRef = useRef<HTMLButtonElement | null>(null);
  const handledLaunchNonceRef = useRef<number | null>(launchRequest?.nonce ?? null);

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
    if (transition.targetDocumentId !== undefined) {
      setPreviewDocumentId(transition.targetDocumentId);
    }
    if (transition.targetVersionId !== undefined) {
      setPreviewVersionId(transition.targetVersionId);
    }
    if (transition.targetPrefillValues !== undefined) {
      setActivePrefillValues(transition.targetPrefillValues);
    }
    if (transition.targetLinkedAssignmentId !== undefined) {
      setActiveLinkedAssignmentId(transition.targetLinkedAssignmentId);
    }
    if (transition.targetTemplateSourceDocId !== undefined) {
      setTemplateManagerSourceDocId(transition.targetTemplateSourceDocId);
    }
    if (transition.bumpIntakeSession) {
      setIntakeSessionKey((k) => k + 1);
    }
    if (transition.bumpStudioSession) {
      setStudioSessionKey((k) => k + 1);
    }
    setDirtySource(null);
    onDirtyChange?.(false, null);
    if (transition.targetView !== 'studio') {
      setIsStudioFocusMode(false);
    }
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

  useEffect(() => {
    if (!launchRequest) return;
    if (handledLaunchNonceRef.current === launchRequest.nonce) return;
    handledLaunchNonceRef.current = launchRequest.nonce;
    executeTransition({
      targetView: launchRequest.view,
      targetTemplateId: launchRequest.templateId ?? null,
      targetDraftId: launchRequest.draftId ?? null,
      targetDocumentId: launchRequest.documentId ?? null,
      targetVersionId: launchRequest.versionId ?? null,
      targetPrefillValues: launchRequest.prefillValues ?? null,
      targetLinkedAssignmentId: launchRequest.linkedAssignmentId ?? null,
      bumpIntakeSession: launchRequest.view === 'intake',
      bumpStudioSession: launchRequest.view === 'studio',
    });
  }, [launchRequest]);

  const requestSubViewChange = (target: PersuratanSubView) => {
    requestTransition({
      targetView: target,
      targetPrefillValues: null,
      targetLinkedAssignmentId: null,
    });
  };

  const handleUseTemplateFromGallery = (tpl: DocumentTemplate) => {
    executeTransition({
      targetView: 'intake',
      targetTemplateId: tpl.id,
      targetDraftId: null,
      targetPrefillValues: null,
      targetLinkedAssignmentId: null,
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
      onNotify?.('Draft data surat tidak ditemukan di workspace.', 'warning');
      return;
    }
    openIntakeForDraft(found);
  };

  const handleOpenStudio = (draftId: string) => {
    const found = (state.intakeDrafts ?? []).find((d) => d.id === draftId);
    if (!found) {
      onNotify?.('Draft surat belum ditemukan untuk dibuka di Editor Naskah.', 'warning');
      return;
    }
    requestTransition({
      targetView: 'studio',
      targetTemplateId: found.templateId,
      targetDraftId: found.id,
      bumpStudioSession: true,
    });
  };

  const handleOpenPreview = (target: {
    documentId: string;
    draftId?: string | null;
    versionId?: string | null;
  }) => {
    requestTransition({
      targetView: 'preview',
      targetDocumentId: target.documentId,
      targetDraftId: target.draftId ?? editingDraftId ?? null,
      targetVersionId: target.versionId ?? null,
    });
  };

  const handleOpenArchiveDetail = (documentId: string, versionId?: string | null) => {
    requestTransition({
      targetView: 'detail',
      targetDocumentId: documentId,
      targetVersionId: versionId ?? null,
    });
  };

  const handleOpenTemplateManager = (sourceDocId?: string | null) => {
    requestTransition({
      targetView: 'template-manager',
      targetTemplateSourceDocId: sourceDocId ?? null,
    });
  };

  const persistStateUnified = async (nextState: AppState) => {
    if (onPersistState) {
      await onPersistState(nextState);
    } else {
      onUpdateState?.(() => nextState);
    }
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

  const handleDeleteDraft = async (
    target: DeleteDraftTarget,
    options?: { redirectToCenter?: boolean }
  ) => {
    try {
      const deleted = deleteDraftFromState(state, target);
      if (onPersistState) {
        await onPersistState(deleted.state);
      } else {
        onUpdateState?.(() => deleted.state);
      }
      if (deleted.deletedDraftId && deleted.deletedDraftId === editingDraftId) {
        setEditingDraftId(null);
      }
      setDirtySource(null);
      onDirtyChange?.(false, null);
      if (options?.redirectToCenter) {
        setSubView('center');
      }
      onNotify?.(`Draft "${deleted.deletedTitle}" dihapus dari arsip lokal.`, 'info');
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Gagal menghapus draft dokumen.';
      onNotify?.(msg, 'error');
    }
  };

  const handleDuplicateDraft = async (target: DuplicateDraftTarget) => {
    try {
      const duplicated = duplicateDraftInState(state, target);
      if (onPersistState) {
        await onPersistState(duplicated.state);
      } else {
        onUpdateState?.(() => duplicated.state);
      }
      setS01Page(1);
      onNotify?.(
        `Draft "${duplicated.sourceTitle}" berhasil diduplikasi sebagai "${duplicated.draft.title}".`,
        'success'
      );
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Gagal menduplikasi draft dokumen.';
      onNotify?.(msg, 'error');
    }
  };

  const handleCloneOfficialToNewDraft = async (
    documentId: string,
    versionId?: string | null
  ) => {
    try {
      const cloned = cloneOfficialDocumentToNewDraft({
        state,
        documentId,
        versionId: versionId ?? null,
      });
      await persistStateUnified(cloned.state);
      setS01Page(1);
      onNotify?.(
        `Draft baru "${cloned.draft.title}" dibuat dari salinan dokumen resmi dan siap disunting.`,
        'success'
      );
      executeTransition({
        targetView: 'studio',
        targetTemplateId: cloned.draft.templateId,
        targetDraftId: cloned.draft.id,
        targetDocumentId: cloned.documentRecord.id,
        targetVersionId: null,
        bumpStudioSession: true,
      });
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : 'Gagal membuat draft baru dari dokumen resmi.';
      onNotify?.(msg, 'error');
    }
  };

  const activeStepIndex =
    subView === 'center'
      ? 1
      : subView === 'templates' || subView === 'template-manager'
      ? 2
      : subView === 'intake'
      ? 3
      : subView === 'studio'
      ? 4
      : subView === 'preview'
      ? 5
      : 6;

  const isCreationFlow = subView === 'intake' || subView === 'studio' || subView === 'preview';
  const customTemplatesCount = (state.customTemplates ?? []).length;

  return (
    <div className="p5-persuratan-shell">
      {!(subView === 'studio' && isStudioFocusMode) && (
      <nav className="s02-subnav-bar" aria-label="Navigasi Modul Persuratan dan Arsip">
        <div className="s02-subnav-left">
          <div className="s02-subnav-tabs" role="tablist" aria-label="Area kerja Persuratan">
            <button
              type="button"
              role="tab"
              aria-selected={subView === 'center'}
              className={`s02-subnav-tab ${subView === 'center' ? 'is-active' : ''}`}
              onClick={() => requestSubViewChange('center')}
            >
              <Inbox size={15} aria-hidden="true" />
              <span>Arsip &amp; Surat</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={subView === 'templates'}
              className={`s02-subnav-tab ${
                subView === 'templates' ? 'is-active' : ''
              }`}
              onClick={() => requestSubViewChange('templates')}
            >
              <FileStack size={15} aria-hidden="true" />
              <span>Galeri Template</span>
              <span className="s02-subnav-count s5-tnum">{allTemplates.length}</span>
            </button>
            {subView === 'detail' && (
              <button
                type="button"
                role="tab"
                aria-selected={true}
                className="s02-subnav-tab is-active"
                onClick={() => requestSubViewChange('detail')}
              >
                <Archive size={15} aria-hidden="true" />
                <span>Detail &amp; Arsip</span>
              </button>
            )}
          </div>
        </div>

        <div className="s02-subnav-right">
          {isCreationFlow ? (
            <ol className="p5-step-trail s5-tnum" aria-label="Alur pembuatan dokumen">
              <li className={activeStepIndex > 3 ? 'is-done' : activeStepIndex === 3 ? 'is-current' : ''}>
                {activeDraft && subView !== 'intake' ? (
                  <button
                    type="button"
                    className="p5-step-btn"
                    onClick={() => openIntakeForDraft(activeDraft)}
                    title="Kembali ke isian data & parameter surat"
                  >
                    <Check size={12} aria-hidden="true" />
                    <span>1. Data Surat</span>
                  </button>
                ) : (
                  <span className="p5-step-label">
                    {activeStepIndex > 3 && <Check size={12} aria-hidden="true" />}
                    <span>1. Data Surat</span>
                  </span>
                )}
              </li>
              <li aria-hidden="true" className="p5-step-sep">/</li>
              <li className={activeStepIndex > 4 ? 'is-done' : activeStepIndex === 4 ? 'is-current' : ''}>
                {activeDraft && subView !== 'studio' ? (
                  <button
                    type="button"
                    className="p5-step-btn"
                    onClick={() => handleOpenStudio(activeDraft.id)}
                    title="Buka Editor Naskah"
                  >
                    {activeStepIndex > 4 && <Check size={12} aria-hidden="true" />}
                    <span>2. Editor Naskah</span>
                  </button>
                ) : (
                  <span className="p5-step-label">
                    {activeStepIndex > 4 && <Check size={12} aria-hidden="true" />}
                    <span>2. Editor Naskah</span>
                  </span>
                )}
              </li>
              <li aria-hidden="true" className="p5-step-sep">/</li>
              <li className={activeStepIndex >= 5 ? 'is-current' : ''}>
                {activeDraft && subView !== 'preview' ? (
                  <button
                    type="button"
                    className="p5-step-btn"
                    onClick={() =>
                      handleOpenPreview({
                        documentId: activeDraft.documentId,
                        draftId: activeDraft.id,
                        versionId: null,
                      })
                    }
                    title="Buka pratinjau penuh & pengesahan"
                  >
                    <span>3. Pratinjau &amp; Sahkan</span>
                  </button>
                ) : (
                  <span className="p5-step-label">
                    <span>3. Pratinjau &amp; Sahkan</span>
                  </span>
                )}
              </li>
            </ol>
          ) : (
            <button
              type="button"
              className={`s02-subnav-util-btn ${subView === 'template-manager' ? 'is-active' : ''}`}
              onClick={() => handleOpenTemplateManager(null)}
              title="Kelola template khusus madrasah"
            >
              <SlidersHorizontal size={14} aria-hidden="true" />
              <span>Kelola Template</span>
              {customTemplatesCount > 0 && (
                <span className="s02-subnav-count s5-tnum">{customTemplatesCount}</span>
              )}
            </button>
          )}
        </div>
      </nav>
      )}

      <div key={subView} className="p5-view-stage">
      {subView === 'center' && (
        <CorrespondenceCenter
          state={state}
          storageError={storageError}
          onRetryStorage={onRetryStorage}
          onPersistState={persistStateUnified}
          onNotify={onNotify}
          onOpenTemplateGallery={() => requestSubViewChange('templates')}
          onOpenSettings={onNavigateToSettings}
          onEditIntakeDraft={handleEditExistingIntakeDraft}
          onOpenStudio={handleOpenStudio}
          onOpenPreview={handleOpenPreview}
          onOpenArchiveDetail={handleOpenArchiveDetail}
          onDuplicateDraft={(target) => handleDuplicateDraft(target)}
          onCloneOfficial={handleCloneOfficialToNewDraft}
          onDeleteDraft={(target) => handleDeleteDraft(target)}
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
          onOpenTemplateManager={() => handleOpenTemplateManager(null)}
          onNotify={onNotify}
        />
      )}

      {subView === 'template-manager' && (
        <TemplateManager
          state={state}
          initialSourceDocumentId={templateManagerSourceDocId}
          onPersistState={persistStateUnified}
          onBackToGallery={() => requestSubViewChange('templates')}
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
          prefillValues={activePrefillValues}
          linkedAssignmentId={activeLinkedAssignmentId}
          storageError={storageError}
          onRetryStorage={onRetryStorage}
          onSaveDraft={handleSaveIntakeDraft}
          onPersistState={persistStateUnified}
          onFinalizedToArchive={(docId, verId) => handleOpenArchiveDetail(docId, verId)}
          onOpenPreview={handleOpenPreview}
          onOpenStudio={handleOpenStudio}
          onDeleteDraft={
            activeDraft
              ? () =>
                  handleDeleteDraft(
                    { draftId: activeDraft.id, documentId: activeDraft.documentId },
                    { redirectToCenter: true }
                  )
              : undefined
          }
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
          onPersistState={persistStateUnified}
          onFinalizedToArchive={(docId, verId) => handleOpenArchiveDetail(docId, verId)}
          isFocusMode={isStudioFocusMode}
          onToggleFocusMode={setIsStudioFocusMode}
          onDeleteDraft={() =>
            handleDeleteDraft(
              { draftId: activeDraft.id, documentId: activeDraft.documentId },
              { redirectToCenter: true }
            )
          }
          onBackToIntake={() => openIntakeForDraft(activeDraft)}
          onBackToCenter={() => requestSubViewChange('center')}
          onOpenPreview={() =>
            handleOpenPreview({
              documentId: activeDraft.documentId,
              draftId: activeDraft.id,
              versionId: null,
            })
          }
          onDirtyChange={(dirty) => setDirtyFlag(dirty, 'studio')}
          onNotify={onNotify}
        />
      )}

      {subView === 'preview' && (
        <DocumentPreviewFinalize
          state={state}
          draft={activeDraft}
          documentRecord={
            (state.documents ?? []).find(
              (d) => d.id === (previewDocumentId ?? activeDraft?.documentId)
            ) ?? null
          }
          activeVersion={
            previewVersionId
              ? (state.documentVersions ?? []).find((v) => v.id === previewVersionId) ?? null
              : null
          }
          onPersistState={async (nextState) => {
            if (onPersistState) {
              await onPersistState(nextState);
            } else {
              onUpdateState?.(() => nextState);
            }
          }}
          onFinalizedToArchive={(docId, verId) => handleOpenArchiveDetail(docId, verId)}
          onBackToStudio={(draftId) => handleOpenStudio(draftId)}
          onBackToIntake={(draftId) => handleEditExistingIntakeDraft(draftId)}
          onBackToCenter={() => requestSubViewChange('center')}
          onOpenSettings={onNavigateToSettings}
          onOpenRevisionInStudio={(revDraftId) => {
            setEditingDraftId(revDraftId);
            setPreviewVersionId(null);
            setPreviewDocumentId(null);
            setStudioSessionKey((k) => k + 1);
            setSubView('studio');
          }}
          onSelectVersion={(verId) => {
            const ver = (state.documentVersions ?? []).find((v) => v.id === verId);
            if (ver) {
              setPreviewVersionId(ver.id);
              setPreviewDocumentId(ver.documentId);
            }
          }}
          onNotify={onNotify}
        />
      )}

      {subView === 'detail' && (previewDocumentId || activeDraft?.documentId) && (
        <DocumentArchiveDetail
          state={state}
          documentId={previewDocumentId ?? activeDraft?.documentId ?? ''}
          initialVersionId={previewVersionId}
          onPersistState={persistStateUnified}
          onBackToCenter={() => requestSubViewChange('center')}
          onOpenStudio={(draftId) => handleOpenStudio(draftId)}
          onOpenPreview={handleOpenPreview}
          onOpenRevisionInStudio={(revDraftId) => {
            setEditingDraftId(revDraftId);
            setPreviewVersionId(null);
            setPreviewDocumentId(null);
            setStudioSessionKey((k) => k + 1);
            setSubView('studio');
          }}
          onDeleteDraft={(target) => handleDeleteDraft(target, { redirectToCenter: true })}
          onSaveAsTemplate={(docId) => handleOpenTemplateManager(docId)}
          onCloneSimilar={handleCloneOfficialToNewDraft}
          onNotify={onNotify}
        />
      )}

      {subView === 'detail' && !previewDocumentId && !activeDraft?.documentId && (
        <div className="s04-banner is-warning" role="region" aria-label="Dokumen arsip tidak dipilih">
          <div>
            Belum ada dokumen arsip yang dipilih. Kembali ke Pusat Persuratan untuk memilih dokumen.
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

      {subView === 'studio' && !activeDraft && (
        <div className="s04-banner is-warning" role="region" aria-label="Draft Editor Naskah tidak ditemukan">
          <div>
            Draft data surat tidak ditemukan atau belum dipilih. Kembali ke Arsip &amp; Surat untuk
            memilih draft yang tersedia.
          </div>
          <button
            type="button"
            className="s02-btn-primary"
            onClick={() => requestSubViewChange('center')}
          >
            Kembali ke Arsip &amp; Surat
          </button>
        </div>
      )}
      </div>

      {/* Unsaved Form / Editor Changes Guard Modal (Safe Emerald Stay CTA + Quiet Danger Leave) */}
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
                      ? 'Perubahan Naskah Belum Disimpan'
                      : 'Isian Data Surat Belum Disimpan'}
                  </h2>
                  <p>
                    {dirtySource === 'studio'
                      ? 'Perubahan pada Editor Naskah belum disimpan sebagai draft.'
                      : 'Perubahan sementara pada Data Surat belum disimpan sebagai draft.'}
                  </p>
                </div>
              </div>
            </div>
            <div className="s01-modal-body">
              <p style={{ margin: 0 }}>
                Jika Anda keluar sekarang, perubahan yang belum disimpan tidak akan tersimpan ke
                penyimpanan lokal.
              </p>
            </div>
            <div
              className="s01-modal-foot"
              style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}
            >
              <button
                type="button"
                className="s02-btn-danger-outline"
                onClick={() => {
                  const target = pendingTransition;
                  setPendingTransition(null);
                  executeTransition(target);
                }}
              >
                Keluar Tanpa Simpan
              </button>
              <button
                ref={stayOnScreenBtnRef}
                type="button"
                className="s02-btn-primary"
                onClick={() => setPendingTransition(null)}
              >
                {dirtySource === 'studio' ? 'Lanjutkan Menyunting Naskah' : 'Lanjutkan Mengisi Form'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
