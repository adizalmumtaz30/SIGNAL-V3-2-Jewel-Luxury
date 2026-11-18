import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createDemoState } from '../src/domain/seed';
import {
  ASSIGNMENT_STORE_NAME,
  AUDIT_STORE_NAME,
  CURRENT_APP_SCHEMA_VERSION,
  CURRENT_BACKUP_FORMAT_VERSION,
  DB_VERSION,
  DOCUMENT_ATTACHMENTS_STORE_NAME,
  DOCUMENT_TEMPLATES_STORE_NAME,
  DOCUMENT_VERSIONS_STORE_NAME,
  SNAPSHOT_STORE_NAME,
  STORE_NAME,
  applySignalDatabaseUpgrade,
  buildBackupEnvelope,
  migrateAppStateSchema,
  parseBackupContent,
  restoreWorkspaceSafelyWithDb,
  type SignalDbLike,
  type UpgradeDbLike,
  type UpgradeStoreLike,
} from '../src/storage/db';
import { buildSignalContainer, parseSignalContent } from '../src/storage/snapshotEngine';
import {
  ATTACHMENT_MAX_BYTES,
  clearMemoryAttachmentStore,
  getBinaryBlob,
  isSafeRasterPreviewMime,
  validateAttachmentFile,
} from '../src/domain/persuratan/attachments/attachmentStore';
import {
  archiveDocumentInState,
  attachFileToDocumentInState,
  canDeleteDocumentRecord,
  removeAttachmentFromDocumentInState,
  restoreArchivedDocumentInState,
} from '../src/domain/persuratan/archive/archiveEngine';
import {
  createCustomTemplateInState,
  createTemplateFromDocumentInState,
  deleteCustomTemplateInState,
  toggleCustomTemplateStatusInState,
  updateCustomTemplateInState,
  validateTemplateStructure,
} from '../src/domain/persuratan/templates/templateManagerEngine';
import { SYSTEM_DOCUMENT_TEMPLATES } from '../src/domain/persuratan/templates/registry';
import {
  saveIntakeDraftToState,
  saveStudioDraftToState,
} from '../src/domain/persuratan/intake/draftEngine';
import { buildInitialStudioContentFromDraft } from '../src/domain/persuratan/studio/contentGenerator';
import { finalizeDocumentTransaction } from '../src/domain/persuratan/finalization/finalizeEngine';
import { computeNextSequentialNumber } from '../src/domain/persuratan/finalization/numberingEngine';
import {
  clearMemoryFinalPdfStore,
  defaultFinalPdfStorageAdapter,
} from '../src/domain/persuratan/finalization/finalPdfStore';
import { DocumentArchiveDetail } from '../src/components/persuratan/DocumentArchiveDetail';
import { TemplateManager } from '../src/components/persuratan/TemplateManager';
import { TemplateGallery } from '../src/components/persuratan/TemplateGallery';
import { PersuratanWorkspace } from '../src/components/persuratan/PersuratanWorkspace';
import type { AppState } from '../src/domain/types';

function makeValidPdfBytes(label = 'SIGNAL-TEST-PDF'): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.4\n% ${label}\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n`);
}

function makeValidPngBytes(): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  ]);
}

function makeValidJpegBytes(): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
}

function makeValidWebpBytes(): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
  ]);
}

function makeValidDocxBytes(): Uint8Array {
  return new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00, 0x08, 0x00]);
}

function createFakeSignalDb(): {
  db: SignalDbLike;
  stores: Map<string, Map<string, unknown>>;
} {
  const stores = new Map<string, Map<string, unknown>>([
    [STORE_NAME, new Map()],
    [SNAPSHOT_STORE_NAME, new Map()],
    [AUDIT_STORE_NAME, new Map()],
    [ASSIGNMENT_STORE_NAME, new Map()],
    [DOCUMENT_VERSIONS_STORE_NAME, new Map()],
    [DOCUMENT_TEMPLATES_STORE_NAME, new Map()],
    [DOCUMENT_ATTACHMENTS_STORE_NAME, new Map()],
  ]);

  const getStore = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name)!;
  };

  const db: SignalDbLike = {
    get: async (storeName: string, key: string) => getStore(storeName).get(key),
    put: async (storeName: string, value: unknown) => {
      const store = getStore(storeName);
      const rec = value as Record<string, unknown>;
      const resolvedKey =
        (typeof rec?.storageKey === 'string' && rec.storageKey) ||
        (typeof rec?.id === 'string' && rec.id) ||
        'default';
      store.set(resolvedKey, value);
      return resolvedKey;
    },
    delete: async (storeName: string, key: string) => {
      getStore(storeName).delete(key);
    },
    getAll: async (storeName: string) => Array.from(getStore(storeName).values()),
    transaction: (_storeNames: string[], _mode: 'readonly' | 'readwrite') => {
      const makeAccess = (name: string) => ({
        get: async (key: string) => getStore(name).get(key),
        put: async (value: unknown) => {
          const store = getStore(name);
          const rec = value as Record<string, unknown>;
          const resolvedKey =
            (typeof rec?.storageKey === 'string' && rec.storageKey) ||
            (typeof rec?.id === 'string' && rec.id) ||
            'default';
          store.set(resolvedKey, value);
          return resolvedKey;
        },
        clear: async () => {
          getStore(name).clear();
        },
        getAll: async () => Array.from(getStore(name).values()),
      });
      return {
        objectStore: (name: string) => makeAccess(name),
        done: Promise.resolve(),
      };
    },
  };

  return { db, stores };
}

async function createStateWithFinalizedDocument(): Promise<{
  state: AppState;
  documentId: string;
  versionId: string;
  draftId: string;
}> {
  const base = createDemoState();
  base.settings.schoolName = 'MTs Negeri 1 Jewel Luxury';
  base.settings.headmasterName = 'Dr. H. Ahmad Fauzan, M.Pd.';
  base.settings.headmasterNip = '197504122005011004';
  base.settings.city = 'Bandung';
  base.settings.email = 'tatausaha@mtsn1jewel.sch.id';
  base.settings.phone = '0812-3456-7890';

  const tpl = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-01')!;
  const teacher = base.teachers[0];

  const savedIntake = saveIntakeDraftToState(
    base,
    tpl,
    {
      documentTitle: 'Surat Tugas Evaluasi Kurikulum',
      documentDate: '2026-11-18',
      peserta: [teacher.id],
      nama_kegiatan: 'Rapat Koordinasi Evaluasi Kurikulum',
      penyelenggara: 'MTs Negeri 1 Jewel Luxury',
      tanggal_mulai: '2026-11-19',
      tanggal_selesai: '2026-11-19',
      lokasi: 'Aula Utama Madrasah',
      dasar_surat: 'Agenda Kerja Semester Ganjil 2026',
    },
    { timestamp: '2026-11-18T08:00:00.000Z' }
  );

  const initial = buildInitialStudioContentFromDraft(savedIntake.draft);
  const studioSaved = saveStudioDraftToState(
    savedIntake.state,
    savedIntake.draft.id,
    {
      schemaVersion: 1,
      editorStatus: 'IN_PROGRESS',
      content: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1, textAlign: 'center' },
            content: [{ type: 'text', text: 'SURAT TUGAS RESMI' }],
          },
          {
            type: 'paragraph',
            attrs: { textAlign: 'center' },
            content: [{ type: 'text', text: 'Nomor: {{NOMOR_SURAT}} [Belum diisi]' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: `Menugaskan ${teacher.name} (NIP. 198103152008011009), email tatausaha@mtsn1jewel.sch.id, HP 0812-3456-7890 pada tanggal 18 November 2026.`,
              },
            ],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: `Mengetahui Kepala Madrasah, ${base.settings.headmasterName}, NIP. ${base.settings.headmasterNip}.`,
              },
            ],
          },
        ],
      },
      pageSettings: initial.pageSettings,
      updatedAt: '2026-11-18T08:10:00.000Z',
    },
    { timestamp: '2026-11-18T08:10:00.000Z' }
  );

  const nextNum = computeNextSequentialNumber({
    state: studioSaved.state,
    kind: 'SURAT_TUGAS',
    documentDate: studioSaved.draft.documentDate,
  });

  const finalized = await finalizeDocumentTransaction({
    state: studioSaved.state,
    draft: studioSaved.draft,
    content: studioSaved.draft.studio!.content,
    pageSettings: studioSaved.draft.studio!.pageSettings,
    documentNumber: nextNum.suggestedNumber,
    numberingMode: 'AUTO',
    demoAcknowledged: true,
    storageAdapter: defaultFinalPdfStorageAdapter,
    timestamp: '2026-11-18T09:00:00.000Z',
  });

  return {
    state: finalized.state,
    documentId: finalized.documentRecord.id,
    versionId: finalized.documentVersion.id,
    draftId: studioSaved.draft.id,
  };
}

describe('Tahap 10 — S06 Archive Detail, S07 Template Manager, Attachment Blob Store & IDB v4 Backup', () => {
  beforeEach(() => {
    clearMemoryAttachmentStore();
    clearMemoryFinalPdfStore();
  });

  it('1. Controlled IDB v0/v3 -> v4 upgrade creates new stores idempotently without losing legacy stores', () => {
    expect(DB_VERSION).toBe(4);
    expect(CURRENT_APP_SCHEMA_VERSION).toBe(2);
    expect(CURRENT_BACKUP_FORMAT_VERSION).toBe(2);

    const createdStores = new Map<string, { indices: string[] }>();
    const fakeUpgradeDb: UpgradeDbLike = {
      objectStoreNames: {
        contains: (name) => createdStores.has(name),
      },
      createObjectStore: (name) => {
        const meta = { indices: [] as string[] };
        createdStores.set(name, meta);
        const storeLike: UpgradeStoreLike = {
          createIndex: (idx) => {
            meta.indices.push(idx);
          },
        };
        return storeLike;
      },
    };

    // Simulate legacy v3 database already having 4 stores
    createdStores.set(STORE_NAME, { indices: [] });
    createdStores.set(SNAPSHOT_STORE_NAME, { indices: ['by-timestamp'] });
    createdStores.set(AUDIT_STORE_NAME, { indices: ['by-timestamp'] });
    createdStores.set(ASSIGNMENT_STORE_NAME, { indices: ['by-teacherId', 'by-classId'] });

    // Upgrade v3 -> v4
    applySignalDatabaseUpgrade(fakeUpgradeDb, 3);
    expect(createdStores.has(STORE_NAME)).toBe(true);
    expect(createdStores.has(DOCUMENT_VERSIONS_STORE_NAME)).toBe(true);
    expect(createdStores.has(DOCUMENT_TEMPLATES_STORE_NAME)).toBe(true);
    expect(createdStores.has(DOCUMENT_ATTACHMENTS_STORE_NAME)).toBe(true);
    expect(createdStores.get(DOCUMENT_ATTACHMENTS_STORE_NAME)?.indices).toContain('documentId');

    // Re-running upgrade is idempotent
    expect(() => applySignalDatabaseUpgrade(fakeUpgradeDb, 4)).not.toThrow();

    // Legacy AppState migration preserves existing fields and heals corrupt non-array fields
    const legacyState = createDemoState();
    (legacyState as unknown as Record<string, unknown>).documentAttachments = 'corrupt';
    const migrated = migrateAppStateSchema(legacyState);
    expect(Array.isArray(migrated.state.documentAttachments)).toBe(true);
    expect(migrated.state.teachers.length).toBe(legacyState.teachers.length);
  });

  it('2. Attachment Store enforces extension, MIME, size <= 10MB, magic bytes, and blocks active HTML/SVG/JS', async () => {
    const validPdf = await validateAttachmentFile({
      fileName: 'sk-lampiran.pdf',
      declaredMimeType: 'application/pdf',
      bytes: makeValidPdfBytes(),
    });
    expect(validPdf.valid).toBe(true);
    expect(validPdf.mimeType).toBe('application/pdf');
    expect(isSafeRasterPreviewMime(validPdf.mimeType!)).toBe(false);

    const validPng = await validateAttachmentFile({
      fileName: 'foto-kegiatan.png',
      declaredMimeType: 'image/png',
      bytes: makeValidPngBytes(),
    });
    expect(validPng.valid).toBe(true);
    expect(isSafeRasterPreviewMime(validPng.mimeType!)).toBe(true);

    const validJpg = await validateAttachmentFile({
      fileName: 'scan.jpg',
      declaredMimeType: 'image/jpeg',
      bytes: makeValidJpegBytes(),
    });
    expect(validJpg.valid).toBe(true);
    expect(isSafeRasterPreviewMime(validJpg.mimeType!)).toBe(true);

    const validWebp = await validateAttachmentFile({
      fileName: 'stempel.webp',
      declaredMimeType: 'image/webp',
      bytes: makeValidWebpBytes(),
    });
    expect(validWebp.valid).toBe(true);
    expect(isSafeRasterPreviewMime(validWebp.mimeType!)).toBe(true);

    const validDocx = await validateAttachmentFile({
      fileName: 'lampiran.docx',
      declaredMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      bytes: makeValidDocxBytes(),
    });
    expect(validDocx.valid).toBe(true);
    expect(isSafeRasterPreviewMime(validDocx.mimeType!)).toBe(false);

    // Blocked dangerous extensions
    const htmlAttack = await validateAttachmentFile({
      fileName: 'evil.html',
      declaredMimeType: 'text/html',
      bytes: new TextEncoder().encode('<!doctype html><script>alert(1)</script>'),
    });
    expect(htmlAttack.valid).toBe(false);

    const svgAttack = await validateAttachmentFile({
      fileName: 'logo.svg',
      declaredMimeType: 'image/svg+xml',
      bytes: new TextEncoder().encode('<svg onload="alert(1)"></svg>'),
    });
    expect(svgAttack.valid).toBe(false);
    expect(isSafeRasterPreviewMime('image/svg+xml')).toBe(false);
    expect(isSafeRasterPreviewMime('text/html')).toBe(false);

    // Spoofed extension: HTML payload renamed to .pdf
    const spoofedPdf = await validateAttachmentFile({
      fileName: 'laporan.pdf',
      declaredMimeType: 'application/pdf',
      bytes: new TextEncoder().encode('<html><body><script>evil()</script></body></html>'),
    });
    expect(spoofedPdf.valid).toBe(false);

    // Spoofed extension: PNG bytes renamed to .pdf
    const mismatchedBytes = await validateAttachmentFile({
      fileName: 'bukan-pdf.pdf',
      declaredMimeType: 'application/pdf',
      bytes: makeValidPngBytes(),
    });
    expect(mismatchedBytes.valid).toBe(false);

    // Oversized > 10MB
    const oversized = await validateAttachmentFile({
      fileName: 'terlalu-besar.pdf',
      declaredMimeType: 'application/pdf',
      bytes: new Uint8Array(ATTACHMENT_MAX_BYTES + 16),
    });
    expect(oversized.valid).toBe(false);
  });

  it('3. S06 Archive Detail Engine supports archive/restore, strict delete protection, and attachment locking', async () => {
    const { state: finalizedState, documentId, versionId } = await createStateWithFinalizedDocument();
    const finalDoc = (finalizedState.documents ?? []).find((d) => d.id === documentId)!;

    // Finalized official document MUST be protected from accidental deletion
    const delFinalCheck = canDeleteDocumentRecord(finalDoc);
    expect(delFinalCheck.allowed).toBe(false);

    // Attach valid PDF to finalized document -> locked immediately
    const { db } = createFakeSignalDb();
    const attached = await attachFileToDocumentInState({
      state: finalizedState,
      documentId,
      versionId,
      fileName: 'daftar-hadir.pdf',
      declaredMimeType: 'application/pdf',
      bytes: makeValidPdfBytes('DAFTAR-HADIR'),
      dbOverride: db,
    });
    expect(attached.attachment.isLocked).toBe(true);
    expect(attached.attachment.versionId).toBe(versionId);

    const storedBlob = await getBinaryBlob(attached.attachment.storageKey, db);
    expect(storedBlob).not.toBeNull();
    expect(storedBlob?.record.sha256).toBe(attached.attachment.sha256);

    // Locked attachment cannot be deleted
    await expect(
      removeAttachmentFromDocumentInState({
        state: attached.state,
        attachmentId: attached.attachment.id,
        dbOverride: db,
      })
    ).rejects.toThrow(/terkunci/i);

    // Archive FINAL -> ARCHIVED
    const archived = archiveDocumentInState(attached.state, documentId, '2026-11-18T10:00:00.000Z');
    expect(archived.document.status).toBe('ARCHIVED');
    expect(archived.document.archivedAt).toBe('2026-11-18T10:00:00.000Z');
    expect(canDeleteDocumentRecord(archived.document).allowed).toBe(false);

    // Restore ARCHIVED -> FINAL
    const restored = restoreArchivedDocumentInState(archived.state, documentId, '2026-11-18T11:00:00.000Z');
    expect(restored.document.status).toBe('FINAL');
    expect(restored.document.archivedAt).toBeNull();

    // Unnumbered DRAFT allows deletion and unlocked attachment add/remove
    const tpl01 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-01')!;
    const draftSaved = saveIntakeDraftToState(restored.state, tpl01, {
      documentTitle: 'Draft Uji Lampiran',
      documentDate: '2026-11-18',
      peserta: [restored.state.teachers[0].id],
      nama_kegiatan: 'Uji Lampiran Draft',
      penyelenggara: 'Madrasah',
      tanggal_mulai: '2026-11-20',
      tanggal_selesai: '2026-11-20',
      lokasi: 'Ruang Guru',
      dasar_surat: 'Agenda',
    });
    const draftDoc = (draftSaved.state.documents ?? []).find((d) => d.id === draftSaved.draft.documentId)!;
    expect(canDeleteDocumentRecord(draftDoc).allowed).toBe(true);

    const draftAtt = await attachFileToDocumentInState({
      state: draftSaved.state,
      documentId: draftDoc.id,
      fileName: 'lampiran-draft.png',
      declaredMimeType: 'image/png',
      bytes: makeValidPngBytes(),
      dbOverride: db,
    });
    expect(draftAtt.attachment.isLocked).toBe(false);

    const removed = await removeAttachmentFromDocumentInState({
      state: draftAtt.state,
      attachmentId: draftAtt.attachment.id,
      dbOverride: db,
    });
    expect((removed.state.documentAttachments ?? []).some((a) => a.id === draftAtt.attachment.id)).toBe(false);
  });

  it('4. S07 Template Manager protects SYSTEM templates, isolates existing document snapshots, validates structure, and scrubs PII', async () => {
    const { state: finalizedState, documentId, versionId } = await createStateWithFinalizedDocument();
    const systemTpl = SYSTEM_DOCUMENT_TEMPLATES[0];

    // SYSTEM templates are strictly read-only
    expect(() =>
      updateCustomTemplateInState(finalizedState, systemTpl.id, { name: 'Ubah Paksa' })
    ).toThrow(/baca-saja/i);
    expect(() => toggleCustomTemplateStatusInState(finalizedState, systemTpl.id)).toThrow(
      /Template bawaan SIGNAL/i
    );
    expect(() => deleteCustomTemplateInState(finalizedState, systemTpl.id)).toThrow(
      /Template bawaan SIGNAL/i
    );

    // Validation catches unbalanced placeholders and duplicate field keys
    const invalidReport = validateTemplateStructure({
      ...systemTpl,
      id: 'MAD-INVALID-1',
      source: 'MADRASAH',
      isReadOnly: false,
      documentHeader: { ...systemTpl.documentHeader, title: 'SURAT {{BROKEN' },
      fields: [
        { key: 'dup_key', label: 'A', kind: 'OPERATOR_INPUT', required: true },
        { key: 'dup_key', label: 'B', kind: 'OPERATOR_INPUT', required: false },
      ],
    });
    expect(invalidReport.valid).toBe(false);
    expect(invalidReport.errors.some((e) => e.includes('tidak berpasangan'))).toBe(true);
    expect(invalidReport.errors.some((e) => e.includes('duplikat'))).toBe(true);

    // Create custom MADRASAH template
    const created = createCustomTemplateInState(finalizedState, {
      name: 'Surat Edaran Khusus MTs',
      category: 'KORESPONDENSI',
      documentKind: 'SURAT_KELUAR',
      description: 'Template edaran internal madrasah untuk wali murid.',
      headerTitle: 'SURAT EDARAN MADRASAH',
      fields: [
        { key: 'perihal', label: 'Perihal', kind: 'OPERATOR_INPUT', required: true },
        { key: 'catatan', label: 'Catatan Opsional', kind: 'OPERATOR_INPUT', required: false },
      ],
      previewBlocks: [
        { type: 'paragraph', text: 'Nomor: {{NOMOR_SURAT}} pada {{TANGGAL_SURAT}}.' },
      ],
    });
    expect(created.template.source).toBe('MADRASAH');
    expect(created.template.status).toBe('ACTIVE');

    // Update custom template bumps version without affecting finalized doc's templateSnapshot
    const beforeDocVersion = (created.state.documentVersions ?? []).find((v) => v.id === versionId)!;
    const beforeSnapshotJson = JSON.stringify(beforeDocVersion.templateSnapshot);

    const updated = updateCustomTemplateInState(created.state, created.template.id, {
      name: 'Surat Edaran Khusus MTs Rev 2',
    });
    expect(updated.template.version).toBe('1.1.0');
    const afterDocVersion = (updated.state.documentVersions ?? []).find((v) => v.id === versionId)!;
    expect(JSON.stringify(afterDocVersion.templateSnapshot)).toBe(beforeSnapshotJson);

    // Disabling template hides it from S02 TemplateGallery
    const toggled = toggleCustomTemplateStatusInState(updated.state, created.template.id);
    expect(toggled.template.status).toBe('ARCHIVED');
    const galleryHtml = renderToStaticMarkup(
      React.createElement(TemplateGallery, { state: toggled.state })
    );
    expect(galleryHtml).not.toContain('Surat Edaran Khusus MTs Rev 2');

    // Extract reusable template from finalized document with automatic PII sanitization
    const extracted = createTemplateFromDocumentInState(toggled.state, {
      documentId,
      name: 'Template Undangan Rapat Terstandar',
      category: 'KORESPONDENSI',
    });
    expect(extracted.piiReport.redactionCount).toBeGreaterThanOrEqual(4);
    expect(extracted.piiReport.categories.nip).toBeGreaterThanOrEqual(1);
    expect(extracted.piiReport.categories.personName).toBeGreaterThanOrEqual(1);
    expect(extracted.piiReport.categories.email).toBeGreaterThanOrEqual(1);
    expect(extracted.piiReport.categories.phone).toBeGreaterThanOrEqual(1);

    const serializedTemplate = JSON.stringify(extracted.template);
    expect(serializedTemplate).not.toContain('198103152008011009');
    expect(serializedTemplate).not.toContain('197504122005011004');
    expect(serializedTemplate).not.toContain('tatausaha@mtsn1jewel.sch.id');
    expect(serializedTemplate).not.toContain('0812-3456-7890');
    expect(serializedTemplate).not.toContain('Dr. H. Ahmad Fauzan, M.Pd.');
    expect(serializedTemplate).toContain('{{NIP_PEJABAT}}');
    expect(serializedTemplate).toContain('{{EMAIL_MADRASAH}}');
  });

  it('5. Backup & Restore preserves manifest, metadata, snapshots, and binary Blobs (plus legacy backup compatibility)', async () => {
    const { state: finalizedState, documentId, versionId } = await createStateWithFinalizedDocument();
    const { db: sourceDb } = createFakeSignalDb();

    const pdfBytes = makeValidPdfBytes('OFFICIAL-ATTACHMENT-BLOB');
    const withAtt = await attachFileToDocumentInState({
      state: finalizedState,
      documentId,
      versionId,
      fileName: 'lampiran-resmi.pdf',
      declaredMimeType: 'application/pdf',
      bytes: pdfBytes,
      dbOverride: sourceDb,
    });

    // Build JSON BackupEnvelope with manifest + Blobs
    const envelope = await buildBackupEnvelope(withAtt.state, { dbOverride: sourceDb });
    expect(envelope.formatVersion).toBe(2);
    expect(envelope.schemaVersion).toBe(2);
    expect(envelope.manifest?.totalAttachments).toBe(1);
    expect((envelope.blobs ?? []).some((b) => b.storageKey === withAtt.attachment.storageKey)).toBe(true);

    // Parse & verify intact backup
    const parsed = await parseBackupContent(JSON.stringify(envelope));
    expect(parsed.verification).toBe('verified');
    expect((parsed.blobs ?? []).length).toBeGreaterThanOrEqual(1);

    // Tampering a Blob base64 payload MUST fail SHA-256 verification
    const tamperedEnvelope = JSON.parse(JSON.stringify(envelope));
    tamperedEnvelope.blobs[0].dataBase64 = 'AAAA';
    await expect(parseBackupContent(JSON.stringify(tamperedEnvelope))).rejects.toThrow(/checksum|integritas/i);

    // Restore into a brand-new database and verify both AppState & binary Blob are restored
    const { db: targetDb } = createFakeSignalDb();
    clearMemoryAttachmentStore();
    await restoreWorkspaceSafelyWithDb(targetDb, parsed.state, parsed.blobs);
    const restoredBlob = await getBinaryBlob(withAtt.attachment.storageKey, targetDb);
    expect(restoredBlob).not.toBeNull();
    expect(restoredBlob?.record.sha256).toBe(withAtt.attachment.sha256);
    expect(new TextDecoder().decode(restoredBlob!.bytes)).toContain('OFFICIAL-ATTACHMENT-BLOB');

    // .signal container round-trip with Blobs
    const signalContainer = await buildSignalContainer(withAtt.state, [], undefined, sourceDb);
    expect((signalContainer.data.blobs ?? []).length).toBeGreaterThanOrEqual(1);
    const parsedSignal = await parseSignalContent(JSON.stringify(signalContainer));
    expect(parsedSignal.verification).toBe('verified');
    expect((parsedSignal.blobs ?? []).length).toBeGreaterThanOrEqual(1);

    // Legacy v1 SIGNAL-LOCAL-BACKUP envelope without checksum or blobs still restores safely
    const legacyRaw = createDemoState();
    delete (legacyRaw as Partial<AppState>).documentAttachments;
    const legacyEnvelope = {
      formatName: 'SIGNAL-LOCAL-BACKUP',
      schemaVersion: 1,
      appVersion: '1.0.0',
      exportedAt: '2026-08-01T00:00:00.000Z',
      payload: legacyRaw,
    };
    const parsedLegacy = await parseBackupContent(JSON.stringify(legacyEnvelope));
    expect(parsedLegacy.verification).toBe('legacy_unverified');
    expect(parsedLegacy.state.teachers.length).toBe(legacyRaw.teachers.length);
  });

  it('6. SSR smoke render of S06 DocumentArchiveDetail, S07 TemplateManager, and PersuratanWorkspace subviews', async () => {
    const { state: finalizedState, documentId, versionId } = await createStateWithFinalizedDocument();

    const s06Html = renderToStaticMarkup(
      React.createElement(DocumentArchiveDetail, {
        state: finalizedState,
        documentId,
        initialVersionId: versionId,
        onPersistState: async () => {},
        onBackToCenter: () => {},
        onSaveAsTemplate: () => {},
      })
    );
    expect(s06Html).toContain('S06 · DETAIL DOKUMEN &amp; ARSIP DIGITAL');
    expect(s06Html).toContain('Unduh PDF Final');
    expect(s06Html).toContain('Arsipkan');
    expect(s06Html).toContain('Buat Revisi');
    expect(s06Html).toContain('Dilindungi dari Penghapusan Tidak Sengaja');

    const s07Html = renderToStaticMarkup(
      React.createElement(TemplateManager, {
        state: finalizedState,
        onPersistState: async () => {},
        onBackToGallery: () => {},
      })
    );
    expect(s07Html).toContain('Template Manager Madrasah');
    expect(s07Html).toContain('Buat Template Baru');
    expect(s07Html).toContain('Ekstrak dari Dokumen');

    const wsDetailHtml = renderToStaticMarkup(
      React.createElement(PersuratanWorkspace, {
        state: finalizedState,
        launchRequest: {
          view: 'detail',
          documentId,
          versionId,
          nonce: 101,
        },
      })
    );
    expect(wsDetailHtml).toContain('Detail Arsip (S06)');
    expect(wsDetailHtml).toContain('Kelola Template');

    const wsTplMgrHtml = renderToStaticMarkup(
      React.createElement(PersuratanWorkspace, {
        state: finalizedState,
        launchRequest: {
          view: 'template-manager',
          nonce: 102,
        },
      })
    );
    expect(wsTplMgrHtml).toContain('Template Manager Madrasah');
  });
});
