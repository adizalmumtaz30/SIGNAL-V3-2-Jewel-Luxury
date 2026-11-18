import { isSha256Hex } from '../../../storage/checksum';
import {
  clearMemoryAttachmentStore,
  getBinaryBlob,
  saveBinaryBlob,
} from '../attachments/attachmentStore';

export interface StoredFinalPdfRecord {
  storageKey: string;
  versionId: string;
  documentId: string;
  documentNumber: string;
  sha256: string;
  sizeBytes: number;
  mimeType: 'application/pdf';
  createdAt: string;
  bytes: Uint8Array;
}

export interface FinalPdfStorageAdapter {
  saveFinalPdf: (record: StoredFinalPdfRecord) => Promise<void>;
  getFinalPdf: (storageKey: string) => Promise<StoredFinalPdfRecord | null>;
}

const memoryPdfStore = new Map<string, StoredFinalPdfRecord>();

export async function computeUint8ArraySha256(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function isPdfBytesSignatureValid(bytes: Uint8Array): boolean {
  if (!bytes || bytes.length < 8) return false;
  // "%PDF-"
  return (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

/**
 * Store PDF final terintegrasi dengan IndexedDB `document_attachments` (v4) dan mirror memori.
 * Memastikan PDF final bertahan saat aplikasi direload dan ikut tercakup dalam manifest Backup/Restore.
 */
export const defaultFinalPdfStorageAdapter: FinalPdfStorageAdapter = {
  async saveFinalPdf(record: StoredFinalPdfRecord): Promise<void> {
    if (!isPdfBytesSignatureValid(record.bytes)) {
      throw new Error('Berkas PDF final tidak memiliki header %PDF- yang valid.');
    }
    if (!isSha256Hex(record.sha256)) {
      throw new Error('Checksum SHA-256 PDF final tidak valid.');
    }
    const copy = new Uint8Array(record.bytes);
    memoryPdfStore.set(record.storageKey, {
      ...record,
      bytes: copy,
    });
    await saveBinaryBlob({
      storageKey: record.storageKey,
      kind: 'FINAL_PDF',
      documentId: record.documentId,
      versionId: record.versionId,
      fileName: `${record.documentNumber.replace(/[/\\:*?"<>|]/g, '_')}.pdf`,
      mimeType: 'application/pdf',
      sha256: record.sha256,
      createdAt: record.createdAt,
      bytes: copy,
    });
  },
  async getFinalPdf(storageKey: string): Promise<StoredFinalPdfRecord | null> {
    const found = memoryPdfStore.get(storageKey);
    if (found) {
      return {
        ...found,
        bytes: new Uint8Array(found.bytes),
      };
    }
    const blobFound = await getBinaryBlob(storageKey);
    if (!blobFound) return null;
    return {
      storageKey: blobFound.record.storageKey,
      versionId: blobFound.record.versionId ?? '',
      documentId: blobFound.record.documentId,
      documentNumber: blobFound.record.fileName.replace(/\.pdf$/i, ''),
      sha256: blobFound.record.sha256,
      sizeBytes: blobFound.bytes.byteLength,
      mimeType: 'application/pdf',
      createdAt: blobFound.record.createdAt,
      bytes: new Uint8Array(blobFound.bytes),
    };
  },
};

export function clearMemoryFinalPdfStore(): void {
  memoryPdfStore.clear();
  clearMemoryAttachmentStore();
}

export function triggerPdfBytesDownload(bytes: Uint8Array, fileName: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
