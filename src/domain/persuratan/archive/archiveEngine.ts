import type { AppState } from '../../types';
import type { DocumentAttachmentMeta, DocumentRecord } from '../types';
import {
  deleteBinaryBlob,
  saveBinaryBlob,
  validateAttachmentFile,
  type BinaryBlobStoreLike,
} from '../attachments/attachmentStore';

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

  const updatedDoc: DocumentRecord = {
    ...target,
    status: 'FINAL',
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
