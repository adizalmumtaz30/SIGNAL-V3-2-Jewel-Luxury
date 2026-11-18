import type { AppState } from '../../types';
import { computeCanonicalSha256 } from '../../../storage/checksum';
import { validateStudioPageSettings, validateTipTapContent } from '../studio/contentValidation';
import type { DocumentStudioPageSettings, TipTapJSONContent } from '../studio/types';
import type {
  DocumentIntakeDraft,
  DocumentRecord,
  DocumentVersion,
} from '../types';
import { evaluateFinalizationChecklist } from './checklist';
import {
  defaultFinalPdfStorageAdapter,
  type FinalPdfStorageAdapter,
} from './finalPdfStore';
import { validateOfficialDocumentNumber } from './numberingEngine';
import { renderOfficialDocumentPdf } from './pdfRenderer';
import { syncTeacherAssignmentsOnFinalize } from '../assignments/teacherIntegration';

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export interface FinalizeDocumentParams {
  state: AppState;
  draft: DocumentIntakeDraft;
  content: TipTapJSONContent;
  pageSettings: DocumentStudioPageSettings;
  documentNumber: string;
  numberingMode: 'AUTO' | 'MANUAL';
  finalizedBy?: string;
  demoAcknowledged?: boolean;
  timestamp?: string;
  storageAdapter?: FinalPdfStorageAdapter;
}

export interface FinalizeDocumentResult {
  state: AppState;
  documentRecord: DocumentRecord;
  documentVersion: DocumentVersion;
  pdfBytes: Uint8Array;
}

/**
 * Transaksi pengesahan & finalisasi dokumen S05 yang aman:
 * 1. Menolak dokumen yang sudah berstatus FINAL/ARCHIVED/REVISED.
 * 2. Memvalidasi keunikan nomor surat & kelengkapan checklist administrasi.
 * 3. Merender PDF final berpagination eksak + menyisipkan nomor surat pada salinan beku.
 * 4. Menyimpan Blob PDF final ke adapter penyimpanan TERLEBIH DAHULU sebelum mengubah status menjadi FINAL.
 *    Jika penyimpanan snapshot/PDF gagal, fungsi melempar error dan status dokumen tetap DRAFT.
 */
export async function finalizeDocumentTransaction(
  params: FinalizeDocumentParams
): Promise<FinalizeDocumentResult> {
  const {
    state,
    draft,
    content,
    pageSettings,
    documentNumber,
    numberingMode,
    finalizedBy = state.settings.headmasterName?.trim() || 'Operator Persuratan',
    demoAcknowledged = false,
    timestamp = new Date().toISOString(),
    storageAdapter = defaultFinalPdfStorageAdapter,
  } = params;

  const existingDocs = Array.isArray(state.documents) ? state.documents : [];
  const existingDoc = existingDocs.find((d) => d.id === draft.documentId) ?? null;

  if (
    existingDoc &&
    (existingDoc.status === 'FINAL' ||
      existingDoc.status === 'ARCHIVED' ||
      existingDoc.status === 'REVISED')
  ) {
    throw new Error(
      'Dokumen ini sudah difinalisasi atau diarsipkan dan bersifat read-only. Gunakan fitur Buat Revisi untuk menerbitkan versi baru.'
    );
  }

  const contentCheck = validateTipTapContent(content);
  if (!contentCheck.valid) {
    throw new Error(contentCheck.error ?? 'Struktur naskah dokumen tidak valid untuk difinalisasi.');
  }

  const pageCheck = validateStudioPageSettings(pageSettings);
  if (!pageCheck.valid || !pageCheck.normalized) {
    throw new Error(pageCheck.error ?? 'Pengaturan halaman dokumen tidak valid.');
  }

  const numberCheck = validateOfficialDocumentNumber(documentNumber, state, draft.documentId);
  if (!numberCheck.valid) {
    throw new Error(numberCheck.error ?? 'Nomor surat resmi tidak valid.');
  }

  const checklist = evaluateFinalizationChecklist({
    draft,
    content,
    state,
    documentRecord: existingDoc,
  });
  if (!checklist.canFinalize) {
    const firstBlocker = checklist.items.find((i) => !i.passed && i.severity === 'blocker');
    throw new Error(
      firstBlocker?.detail ?? 'Checklist kelengkapan administrasi masih memiliki kendala wajib.'
    );
  }
  if (checklist.requiresDemoAck && !demoAcknowledged) {
    throw new Error(
      'Dokumen menggunakan dataset simulasi demo. Centang konfirmasi pengakuan data demo terlebih dahulu.'
    );
  }

  const normalizedNumber = numberCheck.normalized;
  const rendered = await renderOfficialDocumentPdf({
    draft,
    content,
    pageSettings: pageCheck.normalized,
    state,
    officialNumber: normalizedNumber,
  });

  if (!rendered.pdfBytes || rendered.pdfBytes.byteLength === 0) {
    throw new Error('Berkas PDF final kosong; finalisasi dibatalkan demi keamanan arsip.');
  }

  const existingVersions = Array.isArray(state.documentVersions) ? state.documentVersions : [];
  const rootDocumentId = existingDoc?.rootDocumentId ?? draft.documentId;
  const versionNumber = existingDoc?.versionNumber ?? 1;
  const versionId = `VER-${rootDocumentId}-V${versionNumber}-${Date.now().toString(36).toUpperCase()}`;
  const pdfStorageKey = `PDF-${versionId}`;

  const contentChecksum = await computeCanonicalSha256({
    snapshotContent: rendered.resolvedContent,
    snapshotPageSettings: pageCheck.normalized,
    sourceSnapshots: draft.sourceSnapshots,
    templateSnapshot: draft.templateSnapshot,
    fieldValues: draft.fieldValues,
    documentNumber: normalizedNumber,
  });

  const versionRecord: DocumentVersion = {
    id: versionId,
    documentId: draft.documentId,
    rootDocumentId,
    parentVersionId: existingDoc?.parentVersionId ?? null,
    versionNumber,
    status: 'FINAL',
    documentNumber: normalizedNumber,
    numberingMode,
    title: draft.title,
    subject: draft.subject,
    documentDate: draft.documentDate,
    documentKind: draft.templateSnapshot.documentKind,
    counterpartName: draft.counterpartName,
    relatedTeacherIds: [...draft.relatedTeacherIds],
    scheduleVersionId: draft.scheduleVersionId ?? null,
    scheduleVersionFingerprint: draft.scheduleVersionFingerprint ?? null,
    templateSnapshot: deepClone(draft.templateSnapshot),
    sourceSnapshots: deepClone(draft.sourceSnapshots),
    fieldValues: deepClone(draft.fieldValues),
    snapshotContent: rendered.resolvedContent,
    snapshotPageSettings: pageCheck.normalized,
    contentChecksum,
    pdfChecksum: rendered.sha256,
    pdfStorageKey,
    pdfSizeBytes: rendered.pdfBytes.byteLength,
    pdfPageCount: rendered.pageCount,
    finalizedAt: timestamp,
    finalizedBy,
    revisionReason: existingDoc?.revisionReason ?? null,
    demoAcknowledged: checklist.requiresDemoAck ? demoAcknowledged : false,
  };

  // Simpan PDF Blob terlebih dahulu; bila gagal, transaksi berhenti tanpa memutasi AppState
  await storageAdapter.saveFinalPdf({
    storageKey: pdfStorageKey,
    versionId,
    documentId: draft.documentId,
    documentNumber: normalizedNumber,
    sha256: rendered.sha256,
    sizeBytes: rendered.pdfBytes.byteLength,
    mimeType: 'application/pdf',
    createdAt: timestamp,
    bytes: rendered.pdfBytes,
  });

  const finalizedDraft: DocumentIntakeDraft = {
    ...deepClone(draft),
    studio: {
      schemaVersion: 1,
      editorStatus: 'IN_PROGRESS',
      content: rendered.resolvedContent,
      pageSettings: pageCheck.normalized,
      updatedAt: timestamp,
    },
    s03EditedAfterStudioAt: null,
    updatedAt: timestamp,
  };

  const finalizedDoc: DocumentRecord = existingDoc
    ? {
        ...deepClone(existingDoc),
        documentNumber: normalizedNumber,
        status: 'FINAL',
        tags: Array.from(new Set([...(existingDoc.tags ?? []), 'Final-S05'])),
        updatedAt: timestamp,
        currentVersionId: versionId,
        versionNumber,
        rootDocumentId,
        finalizedAt: timestamp,
        finalPdfChecksum: rendered.sha256,
      }
    : {
        id: draft.documentId,
        direction: 'OUTGOING',
        documentType: draft.templateSnapshot.documentKind,
        documentNumber: normalizedNumber,
        title: draft.title,
        subject: draft.subject,
        documentDate: draft.documentDate,
        counterpartName: draft.counterpartName,
        status: 'FINAL',
        relatedTeacherIds: [...draft.relatedTeacherIds],
        tags: [draft.templateSnapshot.code, 'Context-S03', 'Studio-S04', 'Final-S05'],
        createdAt: draft.createdAt,
        updatedAt: timestamp,
        archivedAt: null,
        intakeDraftId: draft.id,
        templateId: draft.templateId,
        templateVersion: draft.templateVersion,
        scheduleVersionId: draft.scheduleVersionId ?? null,
        currentVersionId: versionId,
        versionNumber,
        rootDocumentId,
        parentDocumentId: null,
        parentVersionId: null,
        finalizedAt: timestamp,
        finalPdfChecksum: rendered.sha256,
      };

  const nextIntakeDrafts = (state.intakeDrafts ?? []).map((d) =>
    d.id === finalizedDraft.id ? finalizedDraft : d
  );
  const nextDocuments = existingDoc
    ? existingDocs.map((d) => (d.id === finalizedDoc.id ? finalizedDoc : d))
    : [finalizedDoc, ...existingDocs];
  const nextVersions = [versionRecord, ...existingVersions];

  const baseFinalState: AppState = {
    ...state,
    documents: nextDocuments,
    documentVersions: nextVersions,
    intakeDrafts: nextIntakeDrafts,
  };

  const syncedState = syncTeacherAssignmentsOnFinalize(baseFinalState, {
    draft: finalizedDraft,
    documentRecord: finalizedDoc,
    documentVersion: versionRecord,
    timestamp,
  });

  return {
    state: syncedState,
    documentRecord: finalizedDoc,
    documentVersion: versionRecord,
    pdfBytes: rendered.pdfBytes,
  };
}

export interface CreateRevisionResult {
  state: AppState;
  revisionDocument: DocumentRecord;
  revisionDraft: DocumentIntakeDraft;
  sourceVersion: DocumentVersion;
}

/**
 * Membuat versi revisi baru (DRAFT) secara non-destruktif dari dokumen FINAL/ARCHIVED.
 * Dokumen & versi lama tetap utuh bersifat read-only dan tidak pernah tertimpa.
 */
export function createRevisionDraftInState(
  state: AppState,
  params: {
    sourceDocumentId: string;
    sourceVersionId?: string | null;
    revisionReason: string;
    timestamp?: string;
  }
): CreateRevisionResult {
  const {
    sourceDocumentId,
    sourceVersionId,
    revisionReason,
    timestamp = new Date().toISOString(),
  } = params;

  const cleanReason = revisionReason.trim();
  if (cleanReason.length < 4) {
    throw new Error('Alasan revisi wajib diisi minimal 4 karakter.');
  }

  const docs = state.documents ?? [];
  const versions = state.documentVersions ?? [];
  const drafts = state.intakeDrafts ?? [];

  const sourceDoc = docs.find((d) => d.id === sourceDocumentId);
  if (!sourceDoc) {
    throw new Error('Dokumen sumber revisi tidak ditemukan.');
  }
  if (sourceDoc.status !== 'FINAL' && sourceDoc.status !== 'ARCHIVED' && sourceDoc.status !== 'REVISED') {
    throw new Error('Revisi non-destruktif hanya dapat dibuat dari dokumen yang sudah Final atau Diarsipkan.');
  }

  const targetVersion =
    (sourceVersionId
      ? versions.find((v) => v.id === sourceVersionId)
      : undefined) ??
    versions.find((v) => v.id === sourceDoc.currentVersionId) ??
    versions.find((v) => v.documentId === sourceDoc.id);

  if (!targetVersion) {
    throw new Error('Snapshot DocumentVersion resmi tidak ditemukan untuk dijadikan dasar revisi.');
  }

  const rootId = targetVersion.rootDocumentId ?? sourceDoc.rootDocumentId ?? sourceDoc.id;
  const chainMaxDocVersion = docs
    .filter((d) => (d.rootDocumentId ?? d.id) === rootId)
    .reduce((max, d) => Math.max(max, d.versionNumber ?? 1), 1);
  const chainMaxVer = versions
    .filter((v) => v.rootDocumentId === rootId)
    .reduce((max, v) => Math.max(max, v.versionNumber), 1);
  const nextVersionNumber = Math.max(chainMaxDocVersion, chainMaxVer) + 1;

  const suffix = `${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 5)
    .toUpperCase()}`;
  const newDocId = `DOC-REV${nextVersionNumber}-${suffix}`;
  const newDraftId = `INTK-REV${nextVersionNumber}-${suffix}`;

  const revisionDraft: DocumentIntakeDraft = {
    id: newDraftId,
    documentId: newDocId,
    templateId: targetVersion.templateSnapshot.templateId,
    templateVersion: targetVersion.templateSnapshot.version,
    intakeStatus: 'READY_FOR_EDITOR',
    title: targetVersion.title,
    subject: targetVersion.subject,
    documentDate: targetVersion.documentDate,
    counterpartName: targetVersion.counterpartName,
    relatedTeacherIds: [...targetVersion.relatedTeacherIds],
    scheduleVersionId: targetVersion.scheduleVersionId ?? null,
    scheduleVersionFingerprint: targetVersion.scheduleVersionFingerprint ?? null,
    fieldValues: deepClone(targetVersion.fieldValues),
    fieldProvenance: {},
    templateSnapshot: deepClone(targetVersion.templateSnapshot),
    sourceSnapshots: deepClone(targetVersion.sourceSnapshots),
    studio: {
      schemaVersion: 1,
      editorStatus: 'IN_PROGRESS',
      content: deepClone(targetVersion.snapshotContent),
      pageSettings: deepClone(targetVersion.snapshotPageSettings),
      updatedAt: timestamp,
    },
    s03EditedAfterStudioAt: null,
    ...(sourceDoc.linkedAssignmentId ? { linkedAssignmentId: sourceDoc.linkedAssignmentId } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const revisionDocument: DocumentRecord = {
    id: newDocId,
    direction: sourceDoc.direction,
    documentType: sourceDoc.documentType,
    documentNumber: null,
    title: targetVersion.title,
    subject: targetVersion.subject,
    documentDate: targetVersion.documentDate,
    counterpartName: targetVersion.counterpartName,
    status: 'DRAFT',
    relatedTeacherIds: [...targetVersion.relatedTeacherIds],
    tags: Array.from(new Set([...(sourceDoc.tags ?? []).filter((t) => t !== 'Final-S05'), `Revisi-v${nextVersionNumber}`])),
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
    intakeDraftId: newDraftId,
    templateId: sourceDoc.templateId ?? targetVersion.templateSnapshot.templateId,
    templateVersion: sourceDoc.templateVersion ?? targetVersion.templateSnapshot.version,
    scheduleVersionId: targetVersion.scheduleVersionId ?? sourceDoc.scheduleVersionId ?? null,
    currentVersionId: null,
    versionNumber: nextVersionNumber,
    rootDocumentId: rootId,
    parentDocumentId: sourceDoc.id,
    parentVersionId: targetVersion.id,
    finalizedAt: null,
    finalPdfChecksum: null,
    revisionReason: cleanReason,
    ...(sourceDoc.linkedAssignmentId ? { linkedAssignmentId: sourceDoc.linkedAssignmentId } : {}),
  };

  // Pastikan sourceDoc & targetVersion LAMA sama sekali TIDAK berubah status maupun isinya!
  return {
    state: {
      ...state,
      documents: [revisionDocument, ...docs],
      intakeDrafts: [revisionDraft, ...drafts],
    },
    revisionDocument,
    revisionDraft,
    sourceVersion: targetVersion,
  };
}

export function getDocumentVersionChain(
  state: AppState,
  documentId: string
): {
  rootDocumentId: string;
  versions: DocumentVersion[];
  documents: DocumentRecord[];
} {
  const docs = state.documents ?? [];
  const versions = state.documentVersions ?? [];
  const targetDoc = docs.find((d) => d.id === documentId);
  const rootId = targetDoc?.rootDocumentId ?? targetDoc?.id ?? documentId;

  const chainDocs = docs
    .filter((d) => (d.rootDocumentId ?? d.id) === rootId)
    .sort((a, b) => (b.versionNumber ?? 1) - (a.versionNumber ?? 1));

  const chainVersions = versions
    .filter((v) => v.rootDocumentId === rootId || v.documentId === documentId)
    .sort((a, b) => b.versionNumber - a.versionNumber);

  return {
    rootDocumentId: rootId,
    versions: chainVersions,
    documents: chainDocs,
  };
}
