import type { AppState } from '../../types';
import type {
  DocumentAttachmentMeta,
  DocumentIntakeDraft,
  DocumentKind,
  DocumentRecord,
  TipTapJSONContent,
  TipTapJSONNode,
} from '../types';
import {
  deleteBinaryBlob,
  saveBinaryBlob,
  validateAttachmentFile,
  type BinaryBlobStoreLike,
} from '../attachments/attachmentStore';
import {
  extractLeadingSequenceNumber,
  formatRomanMonth,
  normalizeDocumentNumberingConfig,
} from '../finalization/numberingEngine';

export interface DeleteProtectionCheck {
  allowed: boolean;
  reason?: string;
}

/**
 * Strict accidental-delete protection: official, numbered, finalized, revised, or archived
 * documents can NEVER be permanently deleted; only unnumbered DRAFT documents may be removed.
 */
export function canDeleteDocumentRecord(doc: DocumentRecord): DeleteProtectionCheck {
  if (doc.status !== 'DRAFT') {
    return {
      allowed: false,
      reason: `Dokumen berstatus ${doc.status} dilindungi dari penghapusan permanen. Gunakan arsip atau buat revisi non-destruktif.`,
    };
  }
  if (doc.documentNumber && doc.documentNumber.trim().length > 0) {
    return {
      allowed: false,
      reason: 'Dokumen yang sudah memiliki nomor surat resmi tidak dapat dihapus secara permanen.',
    };
  }
  if (doc.currentVersionId) {
    return {
      allowed: false,
      reason: 'Dokumen yang telah memiliki versi resmi (DocumentVersion) dilindungi dari penghapusan.',
    };
  }
  return { allowed: true };
}

/**
 * Archives an official FINAL/REVISED document (status -> ARCHIVED, sets archivedAt).
 * Preserves DocumentVersion snapshot, PDF checksum, and all attachments intact.
 */
export function archiveDocumentInState(
  state: AppState,
  documentId: string,
  timestamp: string = new Date().toISOString()
): { state: AppState; document: DocumentRecord } {
  const docs = state.documents ?? [];
  const target = docs.find((d) => d.id === documentId);
  if (!target) {
    throw new Error('Dokumen tidak ditemukan untuk diarsipkan.');
  }
  if (target.status === 'DRAFT') {
    throw new Error('Dokumen berstatus Draft belum dapat diarsipkan. Sahkan terlebih dahulu melalui S05.');
  }
  if (target.status === 'ARCHIVED') {
    return { state, document: target };
  }

  const updatedDoc: DocumentRecord = {
    ...target,
    status: 'ARCHIVED',
    archivedAt: timestamp,
    updatedAt: timestamp,
  };

  const nextVersions = (state.documentVersions ?? []).map((v) =>
    v.documentId === documentId ? { ...v, status: 'ARCHIVED' as const } : v
  );

  const nextAttachments = (state.documentAttachments ?? []).map((att) =>
    att.documentId === documentId ? { ...att, isLocked: true } : att
  );

  return {
    state: {
      ...state,
      documents: docs.map((d) => (d.id === documentId ? updatedDoc : d)),
      documentVersions: nextVersions,
      documentAttachments: nextAttachments,
    },
    document: updatedDoc,
  };
}

/**
 * Mengarsipkan banyak dokumen resmi (FINAL/REVISED/RECEIVED) sekaligus dalam satu pembaruan atomik.
 * Dokumen DRAFT atau yang sudah ARCHIVED dilewati secara aman tanpa melempar error.
 */
export function bulkArchiveDocumentsInState(
  state: AppState,
  documentIds: string[],
  timestamp: string = new Date().toISOString()
): { state: AppState; archivedIds: string[]; skippedIds: string[] } {
  const uniqueIds = Array.from(new Set(documentIds.filter(Boolean)));
  let nextState = state;
  const archivedIds: string[] = [];
  const skippedIds: string[] = [];

  for (const id of uniqueIds) {
    const found = (nextState.documents ?? []).find((d) => d.id === id);
    if (!found || found.status === 'DRAFT' || found.status === 'ARCHIVED') {
      skippedIds.push(id);
      continue;
    }
    const res = archiveDocumentInState(nextState, id, timestamp);
    nextState = res.state;
    archivedIds.push(id);
  }

  return { state: nextState, archivedIds, skippedIds };
}

/**
 * Restores an ARCHIVED document back to active FINAL archive status without modifying snapshots.
 */
export function restoreArchivedDocumentInState(
  state: AppState,
  documentId: string,
  timestamp: string = new Date().toISOString()
): { state: AppState; document: DocumentRecord } {
  const docs = state.documents ?? [];
  const target = docs.find((d) => d.id === documentId);
  if (!target) {
    throw new Error('Dokumen arsip tidak ditemukan untuk dipulihkan.');
  }
  if (target.status !== 'ARCHIVED') {
    throw new Error('Hanya dokumen berstatus Diarsipkan yang dapat dipulihkan.');
  }

  const restoredStatus = target.direction === 'INCOMING' ? ('RECEIVED' as const) : ('FINAL' as const);

  const updatedDoc: DocumentRecord = {
    ...target,
    status: restoredStatus,
    archivedAt: null,
    updatedAt: timestamp,
  };

  const nextVersions = (state.documentVersions ?? []).map((v) =>
    v.documentId === documentId ? { ...v, status: 'FINAL' as const } : v
  );

  return {
    state: {
      ...state,
      documents: docs.map((d) => (d.id === documentId ? updatedDoc : d)),
      documentVersions: nextVersions,
    },
    document: updatedDoc,
  };
}

/**
 * Validates and attaches a file Blob to a DocumentRecord (and optionally a specific DocumentVersion).
 */
export async function attachFileToDocumentInState(params: {
  state: AppState;
  documentId: string;
  versionId?: string | null;
  fileName: string;
  declaredMimeType?: string;
  bytes: Uint8Array;
  notes?: string;
  timestamp?: string;
  dbOverride?: BinaryBlobStoreLike;
}): Promise<{ state: AppState; attachment: DocumentAttachmentMeta }> {
  const {
    state,
    documentId,
    versionId = null,
    fileName,
    declaredMimeType,
    bytes,
    notes,
    timestamp = new Date().toISOString(),
    dbOverride,
  } = params;

  const doc = (state.documents ?? []).find((d) => d.id === documentId);
  if (!doc) {
    throw new Error('Dokumen tujuan lampiran tidak ditemukan.');
  }

  const validation = await validateAttachmentFile({
    fileName,
    declaredMimeType,
    bytes,
  });

  if (
    !validation.valid ||
    !validation.fileName ||
    !validation.extension ||
    !validation.mimeType ||
    !validation.sha256 ||
    validation.sizeBytes === undefined
  ) {
    throw new Error(validation.error ?? 'Berkas lampiran tidak memenuhi syarat keamanan.');
  }

  const resolvedVersionId = versionId ?? doc.currentVersionId ?? null;
  const suffix = `${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
  const attachmentId = `ATT-${suffix}`;
  const storageKey = `att:${documentId}:${resolvedVersionId ?? 'draft'}:${attachmentId}`;

  await saveBinaryBlob(
    {
      storageKey,
      kind: 'ATTACHMENT',
      documentId,
      versionId: resolvedVersionId,
      attachmentId,
      fileName: validation.fileName,
      mimeType: validation.mimeType,
      sha256: validation.sha256,
      createdAt: timestamp,
      bytes,
    },
    dbOverride
  );

  const meta: DocumentAttachmentMeta = {
    id: attachmentId,
    documentId,
    versionId: resolvedVersionId,
    fileName: validation.fileName,
    extension: validation.extension,
    mimeType: validation.mimeType,
    sizeBytes: validation.sizeBytes,
    sha256: validation.sha256,
    storageKey,
    uploadedAt: timestamp,
    isLocked: doc.status === 'FINAL' || doc.status === 'ARCHIVED',
    ...(notes?.trim() ? { notes: notes.trim() } : {}),
  };

  return {
    state: {
      ...state,
      documentAttachments: [meta, ...(state.documentAttachments ?? [])],
    },
    attachment: meta,
  };
}

/**
 * Removes an unlocked draft attachment cleanly (metadata + Blob).
 * Blocks removing attachments locked onto FINAL or ARCHIVED documents.
 */
export async function removeAttachmentFromDocumentInState(params: {
  state: AppState;
  attachmentId: string;
  dbOverride?: BinaryBlobStoreLike;
}): Promise<{ state: AppState; removed: DocumentAttachmentMeta }> {
  const { state, attachmentId, dbOverride } = params;
  const list = state.documentAttachments ?? [];
  const target = list.find((a) => a.id === attachmentId);
  if (!target) {
    throw new Error('Lampiran tidak ditemukan.');
  }
  const ownerDoc = (state.documents ?? []).find((d) => d.id === target.documentId);
  if (target.isLocked || ownerDoc?.status === 'FINAL' || ownerDoc?.status === 'ARCHIVED') {
    throw new Error(
      'Lampiran pada dokumen resmi (Final/Diarsipkan) bersifat terkunci dan tidak dapat dihapus.'
    );
  }

  await deleteBinaryBlob(target.storageKey, dbOverride);

  return {
    state: {
      ...state,
      documentAttachments: list.filter((a) => a.id !== attachmentId),
    },
    removed: target,
  };
}

function getDefaultNumberTokenForKind(kind: DocumentKind): string {
  if (kind === 'SK') return '{{NOMOR_SK}}';
  if (kind === 'BERITA_ACARA') return '{{NOMOR_BERITA_ACARA}}';
  if (kind === 'NOTULA') return '{{NOMOR_NOTULA}}';
  if (kind === 'LAPORAN') return '{{NOMOR_LAPORAN}}';
  if (kind === 'LAINNYA') return '{{NOMOR_NOTA_DINAS}}';
  return '{{NOMOR_SURAT}}';
}

function restoreOfficialNumberPlaceholderInContent(
  content: TipTapJSONContent,
  oldNumber: string | null | undefined,
  kind: DocumentKind
): TipTapJSONContent {
  const cloned = JSON.parse(JSON.stringify(content)) as TipTapJSONContent;
  const trimmedOld = (oldNumber ?? '').trim();
  if (!trimmedOld) return cloned;
  const token = getDefaultNumberTokenForKind(kind);

  const walk = (node: TipTapJSONNode) => {
    if (typeof node.text === 'string' && node.text.includes(trimmedOld)) {
      node.text = node.text.split(trimmedOld).join(token);
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        walk(child);
      }
    }
  };
  for (const child of cloned.content ?? []) {
    walk(child);
  }
  return cloned;
}

/**
 * Menggandakan dokumen resmi (FINAL / ARCHIVED / REVISED) menjadi draft baru ("Buat Surat Serupa")
 * dengan tanggal hari ini, tanpa nomor surat, dan mengembalikan placeholder nomor otomatis pada naskah,
 * tanpa menyentuh atau mengubah dokumen arsip asal yang terkunci.
 */
export function cloneOfficialDocumentToNewDraft(params: {
  state: AppState;
  documentId: string;
  versionId?: string | null;
  todayIso?: string;
  timestamp?: string;
}): {
  state: AppState;
  draft: DocumentIntakeDraft;
  documentRecord: DocumentRecord;
} {
  const {
    state,
    documentId,
    versionId = null,
    todayIso = new Date().toISOString().slice(0, 10),
    timestamp = new Date().toISOString(),
  } = params;

  const sourceDoc = (state.documents ?? []).find((d) => d.id === documentId);
  if (!sourceDoc) {
    throw new Error('Dokumen sumber tidak ditemukan untuk dibuat salinan serupa.');
  }

  const versions = (state.documentVersions ?? []).filter((v) => v.documentId === documentId);
  const sourceVersion =
    (versionId ? versions.find((v) => v.id === versionId) : null) ??
    (sourceDoc.currentVersionId
      ? versions.find((v) => v.id === sourceDoc.currentVersionId)
      : null) ??
    versions.sort((a, b) => b.versionNumber - a.versionNumber)[0] ??
    null;

  const sourceDraft =
    (sourceDoc.intakeDraftId
      ? (state.intakeDrafts ?? []).find((dr) => dr.id === sourceDoc.intakeDraftId)
      : null) ?? null;

  if (!sourceVersion && !sourceDraft) {
    throw new Error(
      'Dokumen ini tidak memiliki naskah sumber yang dapat disalin menjadi surat serupa.'
    );
  }

  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const newDraftId = `drf-clone-${suffix}`;
  const newDocId = `doc-clone-${suffix}`;

  const baseTitle = sourceVersion?.title ?? sourceDoc.title;
  const newTitle = baseTitle.startsWith('Salinan ') ? baseTitle : `${baseTitle} (Baru)`;
  const baseKind = sourceVersion?.documentKind ?? sourceDoc.documentType;

  const rawContent: TipTapJSONContent = sourceVersion
    ? restoreOfficialNumberPlaceholderInContent(
        sourceVersion.snapshotContent,
        sourceVersion.documentNumber,
        baseKind
      )
    : sourceDraft?.studio?.content
      ? (JSON.parse(JSON.stringify(sourceDraft.studio.content)) as TipTapJSONContent)
      : { type: 'doc', content: [{ type: 'paragraph' }] };

  const pageSettings = sourceVersion?.snapshotPageSettings
    ? JSON.parse(JSON.stringify(sourceVersion.snapshotPageSettings))
    : sourceDraft?.studio?.pageSettings
      ? JSON.parse(JSON.stringify(sourceDraft.studio.pageSettings))
      : {
          paperSize: 'a4' as const,
          orientation: 'portrait' as const,
          marginsMm: { top: 20, right: 20, bottom: 20, left: 25 },
        };

  const templateSnapshot = JSON.parse(
    JSON.stringify(sourceVersion?.templateSnapshot ?? sourceDraft!.templateSnapshot)
  );
  const sourceSnapshots = JSON.parse(
    JSON.stringify(sourceVersion?.sourceSnapshots ?? sourceDraft?.sourceSnapshots ?? [])
  );
  const fieldValues = JSON.parse(
    JSON.stringify({
      ...(sourceVersion?.fieldValues ?? sourceDraft?.fieldValues ?? {}),
      documentDate: todayIso,
    })
  );
  const fieldProvenance = sourceDraft?.fieldProvenance
    ? JSON.parse(JSON.stringify(sourceDraft.fieldProvenance))
    : {};

  const newDraft: DocumentIntakeDraft = {
    id: newDraftId,
    documentId: newDocId,
    templateId: sourceDoc.templateId ?? templateSnapshot.templateId ?? templateSnapshot.id,
    templateVersion: sourceDoc.templateVersion ?? templateSnapshot.version,
    intakeStatus: 'READY_FOR_EDITOR',
    title: newTitle,
    subject: sourceVersion?.subject ?? sourceDoc.subject,
    documentDate: todayIso,
    counterpartName: sourceVersion?.counterpartName ?? sourceDoc.counterpartName,
    relatedTeacherIds: [...(sourceVersion?.relatedTeacherIds ?? sourceDoc.relatedTeacherIds ?? [])],
    scheduleVersionId: sourceVersion?.scheduleVersionId ?? sourceDoc.scheduleVersionId ?? null,
    scheduleVersionFingerprint: sourceVersion?.scheduleVersionFingerprint ?? null,
    fieldValues,
    fieldProvenance,
    templateSnapshot,
    sourceSnapshots,
    studio: {
      schemaVersion: 1,
      editorStatus: 'IN_PROGRESS',
      content: rawContent,
      pageSettings,
      updatedAt: timestamp,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const newDocRecord: DocumentRecord = {
    id: newDocId,
    direction: 'OUTGOING',
    documentType: baseKind,
    documentNumber: null,
    title: newTitle,
    subject: newDraft.subject,
    documentDate: todayIso,
    counterpartName: newDraft.counterpartName,
    status: 'DRAFT',
    relatedTeacherIds: newDraft.relatedTeacherIds,
    tags: [...(sourceDoc.tags ?? [])],
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
    intakeDraftId: newDraftId,
    templateId: newDraft.templateId,
    templateVersion: newDraft.templateVersion,
    scheduleVersionId: newDraft.scheduleVersionId,
  };

  return {
    state: {
      ...state,
      documents: [newDocRecord, ...(state.documents ?? [])],
      intakeDrafts: [newDraft, ...(state.intakeDrafts ?? [])],
    },
    draft: newDraft,
    documentRecord: newDocRecord,
  };
}

/**
 * Menghitung saran Nomor Agenda Surat Masuk berikutnya secara deterministik berdasarkan periode
 * tanpa menyentuh urutan penomoran Surat Keluar / SK.
 */
export function computeNextIncomingAgendaNumber(
  state: AppState,
  receivedDate: string = new Date().toISOString().slice(0, 10)
): string {
  const config = normalizeDocumentNumberingConfig(
    state.settings.documentNumbering,
    state.settings
  );
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(receivedDate.trim());
  const now = new Date();
  const year = match ? match[1] : String(now.getUTCFullYear());
  const month = match ? Math.max(1, Math.min(12, Number(match[2]) || 1)) : now.getUTCMonth() + 1;
  const romanMonth = formatRomanMonth(month);
  const smCode = config.kindCodes.SURAT_MASUK ?? 'SM';

  let maxSeq = 0;
  for (const doc of state.documents ?? []) {
    if (doc.direction !== 'INCOMING') continue;
    const refDate = (doc.receivedDate || doc.documentDate || '').slice(0, 4);
    if (config.resetMode !== 'CONTINUOUS' && refDate && refDate !== year) continue;
    if (doc.incomingAgendaNumber) {
      const seq = extractLeadingSequenceNumber(doc.incomingAgendaNumber);
      if (seq !== null && seq > maxSeq) maxSeq = seq;
    }
  }

  const nextSeq = maxSeq + 1;
  const padded = String(nextSeq).padStart(config.seqPadding, '0');
  return `${padded}/${smCode}/${config.madrasahCode}/${romanMonth}/${year}`;
}

/**
 * Mencatat Surat Masuk baru ke dalam arsip persuratan dengan status RECEIVED
 * dan nomor agenda masuk terstruktur tanpa mengonsumsi nomor surat keluar.
 */
export function recordIncomingDocumentInState(params: {
  state: AppState;
  originalNumber: string;
  senderName: string;
  subject: string;
  title?: string;
  documentDate: string;
  receivedDate?: string;
  incomingAgendaNumber?: string;
  dispositionNote?: string;
  relatedTeacherIds?: string[];
  tags?: string[];
  timestamp?: string;
}): { state: AppState; document: DocumentRecord } {
  const {
    state,
    originalNumber,
    senderName,
    subject,
    title,
    documentDate,
    receivedDate,
    incomingAgendaNumber,
    dispositionNote,
    relatedTeacherIds = [],
    tags = [],
    timestamp = new Date().toISOString(),
  } = params;

  const cleanOrigNumber = originalNumber.trim();
  const cleanSender = senderName.trim();
  const cleanSubject = subject.trim();
  const cleanDocDate = documentDate.trim();
  const cleanReceivedDate = (receivedDate ?? cleanDocDate).trim() || cleanDocDate;

  if (!cleanOrigNumber) {
    throw new Error('Nomor surat asal wajib diisi untuk mencatat Surat Masuk.');
  }
  if (!cleanSender) {
    throw new Error('Asal instansi / pengirim wajib diisi.');
  }
  if (!cleanSubject) {
    throw new Error('Perihal / ringkasan isi surat masuk wajib diisi.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDocDate)) {
    throw new Error('Tanggal surat asal harus berformat valid (YYYY-MM-DD).');
  }

  const resolvedTitle = (title ?? '').trim() || cleanSubject;
  const resolvedAgenda =
    (incomingAgendaNumber ?? '').trim() ||
    computeNextIncomingAgendaNumber(state, cleanReceivedDate);

  const suffix = `${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
  const docId = `doc-sm-${suffix}`;

  const cleanTags = Array.from(
    new Set(
      ['Surat Masuk', ...(dispositionNote?.trim() ? ['Disposisi'] : []), ...tags]
        .map((t) => t.trim())
        .filter(Boolean)
    )
  );

  const newDoc: DocumentRecord = {
    id: docId,
    direction: 'INCOMING',
    documentType: 'SURAT_MASUK',
    documentNumber: cleanOrigNumber,
    title: resolvedTitle,
    subject: cleanSubject,
    documentDate: cleanDocDate,
    counterpartName: cleanSender,
    status: 'RECEIVED',
    relatedTeacherIds: Array.from(new Set(relatedTeacherIds.filter(Boolean))),
    tags: cleanTags,
    incomingAgendaNumber: resolvedAgenda,
    receivedDate: cleanReceivedDate,
    dispositionNote: dispositionNote?.trim() || null,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
  };

  return {
    state: {
      ...state,
      documents: [newDoc, ...(state.documents ?? [])],
    },
    document: newDoc,
  };
}

/**
 * Memperbarui catatan disposisi atau status tindak lanjut Surat Masuk (RECEIVED <-> IN_REVIEW).
 */
export function updateIncomingDispositionInState(params: {
  state: AppState;
  documentId: string;
  dispositionNote: string;
  nextStatus?: 'RECEIVED' | 'IN_REVIEW';
  timestamp?: string;
}): { state: AppState; document: DocumentRecord } {
  const {
    state,
    documentId,
    dispositionNote,
    nextStatus,
    timestamp = new Date().toISOString(),
  } = params;

  const docs = state.documents ?? [];
  const target = docs.find((d) => d.id === documentId);
  if (!target) {
    throw new Error('Dokumen Surat Masuk tidak ditemukan.');
  }
  if (target.direction !== 'INCOMING') {
    throw new Error('Catatan disposisi hanya berlaku untuk Surat Masuk.');
  }
  if (target.status === 'ARCHIVED') {
    throw new Error('Surat Masuk yang telah diarsipkan bersifat terkunci. Pulihkan arsip jika ingin mengubah disposisi.');
  }

  const cleanNote = dispositionNote.trim();
  const baseTags = (target.tags ?? []).filter((t) => t !== 'Disposisi');
  const nextTags = cleanNote ? [...baseTags, 'Disposisi'] : baseTags;

  const updatedDoc: DocumentRecord = {
    ...target,
    dispositionNote: cleanNote || null,
    status: nextStatus ?? target.status,
    tags: nextTags,
    updatedAt: timestamp,
  };

  return {
    state: {
      ...state,
      documents: docs.map((d) => (d.id === documentId ? updatedDoc : d)),
    },
    document: updatedDoc,
  };
}


