import type { AppState } from '../../types';
import type {
  AttachmentAllowedMime,
  BackupBlobManifestEntry,
  DocumentAttachmentMeta,
} from '../types';
import { computeUint8ArraySha256 } from '../finalization/finalPdfStore';
import { isSha256Hex } from '../../../storage/checksum';

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export const BLOCKED_ATTACHMENT_EXTENSIONS = new Set([
  'html',
  'htm',
  'xhtml',
  'svg',
  'svgz',
  'js',
  'mjs',
  'cjs',
  'ts',
  'jsx',
  'tsx',
  'exe',
  'msi',
  'bat',
  'cmd',
  'sh',
  'ps1',
  'php',
  'jsp',
  'asp',
  'xml',
]);

export const BLOCKED_ATTACHMENT_MIMES = new Set([
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
  'application/javascript',
  'text/javascript',
  'application/x-msdownload',
  'application/x-sh',
]);

export const ALLOWED_EXTENSION_TO_MIME: Record<string, AttachmentAllowedMime> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export interface StoredBinaryBlobRecord {
  storageKey: string;
  kind: 'FINAL_PDF' | 'ATTACHMENT';
  documentId: string;
  versionId: string | null;
  attachmentId?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
  blob?: Blob;
  bytes?: Uint8Array;
}

export interface BinaryBlobStoreLike {
  get: (storeName: string, key: string) => Promise<unknown>;
  put: (storeName: string, value: unknown) => Promise<unknown>;
  delete: (storeName: string, key: string) => Promise<void>;
  getAll?: (storeName: string) => Promise<unknown[]>;
}

const ATTACHMENT_STORE_NAME_LOCAL = 'document_attachments';
const memoryBlobStore = new Map<string, StoredBinaryBlobRecord>();

export function detectAllowedMimeFromMagicBytes(bytes: Uint8Array): AttachmentAllowedMime | null {
  if (!bytes || bytes.length < 4) return null;

  // PDF: %PDF-
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return 'application/pdf';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // WEBP: RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  // DOCX (ZIP container): PK 03 04
  if (
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  ) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }

  return null;
}

/**
 * Checks leading bytes for active HTML, SVG, or script markers disguised under another filename.
 */
export function containsActiveHtmlOrScriptSignature(bytes: Uint8Array): boolean {
  const sampleLen = Math.min(bytes.length, 512);
  let text = '';
  for (let i = 0; i < sampleLen; i++) {
    text += String.fromCharCode(bytes[i]);
  }
  const lower = text.trimStart().toLowerCase();
  return (
    lower.startsWith('<!doctype html') ||
    lower.startsWith('<html') ||
    lower.startsWith('<script') ||
    lower.startsWith('<svg') ||
    lower.includes('<script') ||
    lower.includes('javascript:')
  );
}

export function extractSafeFileExtension(fileName: string): string {
  const clean = fileName.trim();
  const dotIdx = clean.lastIndexOf('.');
  if (dotIdx <= 0 || dotIdx === clean.length - 1) return '';
  return clean.slice(dotIdx + 1).toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function sanitizeAttachmentFileName(fileName: string): string {
  const trimmed = fileName.trim().replace(/[/\\]/g, '_');
  const safe = trimmed.replace(/[^\w.\- ()]/g, '_').slice(0, 140);
  return safe || 'lampiran.bin';
}

export function isSafeRasterPreviewMime(mimeType: string): boolean {
  return mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/webp';
}

export interface AttachmentValidationResult {
  valid: boolean;
  error?: string;
  fileName?: string;
  extension?: string;
  mimeType?: AttachmentAllowedMime;
  sizeBytes?: number;
  sha256?: string;
}

/**
 * Strictly validates an attachment file by filename extension, declared MIME, size,
 * active HTML/SVG/script blocking, and binary magic bytes.
 */
export async function validateAttachmentFile(input: {
  fileName: string;
  declaredMimeType?: string;
  bytes: Uint8Array;
  maxBytes?: number;
}): Promise<AttachmentValidationResult> {
  const maxBytes = input.maxBytes ?? ATTACHMENT_MAX_BYTES;
  const safeName = sanitizeAttachmentFileName(input.fileName);
  const ext = extractSafeFileExtension(safeName);
  const declared = (input.declaredMimeType ?? '').trim().toLowerCase();

  if (!ext) {
    return {
      valid: false,
      error: 'Berkas lampiran wajib memiliki ekstensi yang jelas (.pdf, .png, .jpg, .webp, atau .docx).',
    };
  }

  if (BLOCKED_ATTACHMENT_EXTENSIONS.has(ext) || (declared && BLOCKED_ATTACHMENT_MIMES.has(declared))) {
    return {
      valid: false,
      error: `Tipe berkas berbahaya atau aktif (.${ext}${declared ? ` / ${declared}` : ''}) ditolak demi keamanan arsip.`,
    };
  }

  const expectedMime = ALLOWED_EXTENSION_TO_MIME[ext];
  if (!expectedMime) {
    return {
      valid: false,
      error: `Format .${ext} tidak diizinkan. Gunakan PDF, PNG, JPG/JPEG, WEBP, atau DOCX.`,
    };
  }

  if (declared && declared !== 'application/octet-stream' && declared !== expectedMime) {
    // Allow image/jpg alias for jpeg
    const normalizedDeclared = declared === 'image/jpg' ? 'image/jpeg' : declared;
    if (normalizedDeclared !== expectedMime) {
      return {
        valid: false,
        error: `MIME type berkas (${declared}) tidak sesuai dengan ekstensi .${ext}.`,
      };
    }
  }

  if (!input.bytes || input.bytes.byteLength === 0) {
    return {
      valid: false,
      error: 'Berkas lampiran kosong (0 byte) tidak dapat disimpan.',
    };
  }

  if (input.bytes.byteLength > maxBytes) {
    const maxMb = (maxBytes / (1024 * 1024)).toFixed(0);
    return {
      valid: false,
      error: `Ukuran berkas melebihi batas maksimum ${maxMb} MB.`,
    };
  }

  if (containsActiveHtmlOrScriptSignature(input.bytes)) {
    return {
      valid: false,
      error: 'Isi berkas terdeteksi memuat markup HTML/SVG atau skrip aktif dan ditolak.',
    };
  }

  const detectedMime = detectAllowedMimeFromMagicBytes(input.bytes);
  if (!detectedMime || detectedMime !== expectedMime) {
    return {
      valid: false,
      error: `Magic bytes berkas tidak sesuai dengan format .${ext} (${expectedMime}). Berkas ditolak.`,
    };
  }

  const sha256 = await computeUint8ArraySha256(input.bytes);
  return {
    valid: true,
    fileName: safeName,
    extension: ext,
    mimeType: detectedMime,
    sizeBytes: input.bytes.byteLength,
    sha256,
  };
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    const chunkSize = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      for (let j = 0; j < slice.length; j++) {
        binary += String.fromCharCode(slice[j]);
      }
    }
    return btoa(binary);
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triplet = (b0 << 16) | (b1 << 8) | b2;
    out += BASE64_ALPHABET[(triplet >> 18) & 0x3f];
    out += BASE64_ALPHABET[(triplet >> 12) & 0x3f];
    out += i + 1 < bytes.length ? BASE64_ALPHABET[(triplet >> 6) & 0x3f] : '=';
    out += i + 2 < bytes.length ? BASE64_ALPHABET[triplet & 0x3f] : '=';
  }
  return out;
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.replace(/\s+/g, '');
  if (typeof atob === 'function') {
    const binary = atob(clean);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  }
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const byteLen = Math.floor((clean.length * 3) / 4) - padding;
  const out = new Uint8Array(Math.max(0, byteLen));
  let ptr = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = BASE64_ALPHABET.indexOf(clean[i]);
    const c1 = BASE64_ALPHABET.indexOf(clean[i + 1]);
    const c2 = clean[i + 2] === '=' ? 0 : BASE64_ALPHABET.indexOf(clean[i + 2]);
    const c3 = clean[i + 3] === '=' ? 0 : BASE64_ALPHABET.indexOf(clean[i + 3]);
    const triplet = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (ptr < byteLen) out[ptr++] = (triplet >> 16) & 0xff;
    if (ptr < byteLen) out[ptr++] = (triplet >> 8) & 0xff;
    if (ptr < byteLen) out[ptr++] = triplet & 0xff;
  }
  return out;
}

async function extractBytesFromRecord(record: StoredBinaryBlobRecord): Promise<Uint8Array | null> {
  if (record.bytes && record.bytes.byteLength > 0) {
    return new Uint8Array(record.bytes);
  }
  if (record.blob && typeof record.blob.arrayBuffer === 'function') {
    const buf = await record.blob.arrayBuffer();
    return new Uint8Array(buf);
  }
  return null;
}

async function resolveOptionalIdb(dbOverride?: BinaryBlobStoreLike): Promise<BinaryBlobStoreLike | null> {
  if (dbOverride) return dbOverride;
  if (typeof indexedDB === 'undefined') return null;
  try {
    const { openSignalDB } = await import('../../../storage/db');
    const db = await openSignalDB();
    return db as unknown as BinaryBlobStoreLike;
  } catch {
    return null;
  }
}

export async function saveBinaryBlob(
  record: {
    storageKey: string;
    kind: 'FINAL_PDF' | 'ATTACHMENT';
    documentId: string;
    versionId: string | null;
    attachmentId?: string;
    fileName: string;
    mimeType: string;
    sha256: string;
    createdAt: string;
    bytes: Uint8Array;
  },
  dbOverride?: BinaryBlobStoreLike
): Promise<void> {
  if (!isSha256Hex(record.sha256)) {
    throw new Error('Checksum SHA-256 lampiran/PDF tidak valid.');
  }
  const copy = new Uint8Array(record.bytes.byteLength);
  copy.set(record.bytes);
  const blob =
    typeof Blob !== 'undefined'
      ? new Blob([copy.buffer], { type: record.mimeType })
      : undefined;

  const stored: StoredBinaryBlobRecord = {
    storageKey: record.storageKey,
    kind: record.kind,
    documentId: record.documentId,
    versionId: record.versionId,
    attachmentId: record.attachmentId,
    fileName: record.fileName,
    mimeType: record.mimeType,
    sizeBytes: copy.byteLength,
    sha256: record.sha256,
    createdAt: record.createdAt,
    blob,
    bytes: copy,
  };

  memoryBlobStore.set(record.storageKey, stored);

  const db = await resolveOptionalIdb(dbOverride);
  if (db) {
    try {
      await db.put(ATTACHMENT_STORE_NAME_LOCAL, stored);
    } catch {
      // Keep memory mirror intact even if IDB store is absent in custom mock DB
    }
  }
}

export async function getBinaryBlob(
  storageKey: string,
  dbOverride?: BinaryBlobStoreLike
): Promise<{ record: StoredBinaryBlobRecord; bytes: Uint8Array } | null> {
  const db = await resolveOptionalIdb(dbOverride);
  if (db) {
    try {
      const fromDb = (await db.get(ATTACHMENT_STORE_NAME_LOCAL, storageKey)) as
        | StoredBinaryBlobRecord
        | undefined;
      if (fromDb) {
        const bytes = await extractBytesFromRecord(fromDb);
        if (bytes) {
          memoryBlobStore.set(storageKey, { ...fromDb, bytes });
          return { record: fromDb, bytes };
        }
      }
    } catch {
      // Fallback to memory mirror
    }
  }

  const fromMem = memoryBlobStore.get(storageKey);
  if (!fromMem) return null;
  const bytes = await extractBytesFromRecord(fromMem);
  if (!bytes) return null;
  return { record: fromMem, bytes };
}

export async function deleteBinaryBlob(
  storageKey: string,
  dbOverride?: BinaryBlobStoreLike
): Promise<void> {
  memoryBlobStore.delete(storageKey);
  const db = await resolveOptionalIdb(dbOverride);
  if (db) {
    try {
      await db.delete(ATTACHMENT_STORE_NAME_LOCAL, storageKey);
    } catch {
      // ignore if store absent
    }
  }
}

export function clearMemoryAttachmentStore(): void {
  memoryBlobStore.clear();
}

export function triggerBinaryDownload(bytes: Uint8Array, fileName: string, mimeType: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = sanitizeAttachmentFileName(fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Collects all available binary blobs referenced by DocumentVersions (PDF final)
 * and DocumentAttachmentMeta entries for inclusion in SHA-256 verified backup envelopes.
 */
export async function collectBackupBlobsForState(
  state: AppState,
  dbOverride?: BinaryBlobStoreLike
): Promise<BackupBlobManifestEntry[]> {
  const entries: BackupBlobManifestEntry[] = [];
  const seenKeys = new Set<string>();

  for (const version of state.documentVersions ?? []) {
    if (!version.pdfStorageKey || seenKeys.has(version.pdfStorageKey)) continue;
    const found = await getBinaryBlob(version.pdfStorageKey, dbOverride);
    if (!found) continue;
    seenKeys.add(version.pdfStorageKey);
    entries.push({
      storageKey: version.pdfStorageKey,
      kind: 'FINAL_PDF',
      documentId: version.documentId,
      versionId: version.id,
      fileName: `${version.documentNumber.replace(/[/\\:*?"<>|]/g, '_')}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: found.bytes.byteLength,
      sha256: version.pdfChecksum,
      base64Data: uint8ArrayToBase64(found.bytes),
      createdAt: version.finalizedAt,
    });
  }

  for (const att of state.documentAttachments ?? []) {
    if (!att.storageKey || seenKeys.has(att.storageKey)) continue;
    const found = await getBinaryBlob(att.storageKey, dbOverride);
    if (!found) continue;
    seenKeys.add(att.storageKey);
    entries.push({
      storageKey: att.storageKey,
      kind: 'ATTACHMENT',
      documentId: att.documentId,
      versionId: att.versionId ?? null,
      attachmentId: att.id,
      fileName: att.fileName,
      mimeType: att.mimeType,
      sizeBytes: found.bytes.byteLength,
      sha256: att.sha256,
      base64Data: uint8ArrayToBase64(found.bytes),
      createdAt: att.uploadedAt,
    });
  }

  return entries;
}

/**
 * Validates every blob manifest entry (SHA-256 + magic bytes + non-HTML/script check)
 * BEFORE writing any blob into IndexedDB/memory store. Atomic verify-first guarantee.
 */
export async function validateAndRestoreBackupBlobs(
  blobs: BackupBlobManifestEntry[] | undefined,
  dbOverride?: BinaryBlobStoreLike
): Promise<{ restoredCount: number }> {
  if (!Array.isArray(blobs) || blobs.length === 0) {
    return { restoredCount: 0 };
  }

  const verifiedItems: Array<{ entry: BackupBlobManifestEntry; bytes: Uint8Array }> = [];

  for (const entry of blobs) {
    if (
      !entry ||
      typeof entry.storageKey !== 'string' ||
      !entry.storageKey.trim() ||
      typeof entry.base64Data !== 'string' ||
      typeof entry.sha256 !== 'string' ||
      !isSha256Hex(entry.sha256)
    ) {
      throw new Error('Entri manifest Blob lampiran pada berkas cadangan tidak valid.');
    }

    const bytes = base64ToUint8Array(entry.base64Data);
    const computedSha = await computeUint8ArraySha256(bytes);
    if (computedSha.toLowerCase() !== entry.sha256.toLowerCase()) {
      throw new Error(
        `Verifikasi SHA-256 Blob "${entry.fileName}" gagal. Pemulihan cadangan dibatalkan.`
      );
    }

    if (containsActiveHtmlOrScriptSignature(bytes)) {
      throw new Error(
        `Blob "${entry.fileName}" memuat konten HTML/skrip berbahaya dan ditolak saat pemulihan.`
      );
    }

    const detected = detectAllowedMimeFromMagicBytes(bytes);
    if (!detected) {
      throw new Error(
        `Magic bytes Blob "${entry.fileName}" tidak sesuai dengan format aman yang diizinkan.`
      );
    }

    verifiedItems.push({ entry, bytes });
  }

  for (const { entry, bytes } of verifiedItems) {
    await saveBinaryBlob(
      {
        storageKey: entry.storageKey,
        kind: entry.kind,
        documentId: entry.documentId,
        versionId: entry.versionId ?? null,
        attachmentId: entry.attachmentId,
        fileName: sanitizeAttachmentFileName(entry.fileName),
        mimeType: entry.mimeType,
        sha256: entry.sha256,
        createdAt: entry.createdAt,
        bytes,
      },
      dbOverride
    );
  }

  return { restoredCount: verifiedItems.length };
}

export function formatBytesReadable(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function getAttachmentsForDocument(
  state: AppState,
  documentId: string,
  versionId?: string | null
): DocumentAttachmentMeta[] {
  return (state.documentAttachments ?? [])
    .filter((att) => {
      if (att.documentId !== documentId) return false;
      if (versionId !== undefined && versionId !== null && att.versionId && att.versionId !== versionId) {
        return false;
      }
      return true;
    })
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}
