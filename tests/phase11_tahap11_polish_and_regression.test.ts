import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDemoState } from '../src/domain/seed';
import { validateMasterData, validateSchedule, buildScheduleFingerprint } from '../src/domain/validator';
import { SYSTEM_DOCUMENT_TEMPLATES } from '../src/domain/persuratan/templates/registry';
import {
  saveIntakeDraftToState,
  saveStudioDraftToState,
} from '../src/domain/persuratan/intake/draftEngine';
import { buildInitialStudioContentFromDraft } from '../src/domain/persuratan/studio/contentGenerator';
import {
  createRevisionDraftInState,
  finalizeDocumentTransaction,
} from '../src/domain/persuratan/finalization/finalizeEngine';
import { computeNextSequentialNumber } from '../src/domain/persuratan/finalization/numberingEngine';
import {
  clearMemoryFinalPdfStore,
  defaultFinalPdfStorageAdapter,
} from '../src/domain/persuratan/finalization/finalPdfStore';
import {
  clearMemoryAttachmentStore,
  getBinaryBlob,
} from '../src/domain/persuratan/attachments/attachmentStore';
import {
  archiveDocumentInState,
  attachFileToDocumentInState,
  restoreArchivedDocumentInState,
} from '../src/domain/persuratan/archive/archiveEngine';
import {
  createTemplateFromDocumentInState,
  toggleCustomTemplateStatusInState,
} from '../src/domain/persuratan/templates/templateManagerEngine';
import {
  ASSIGNMENT_STORE_NAME,
  AUDIT_STORE_NAME,
  DOCUMENT_ATTACHMENTS_STORE_NAME,
  DOCUMENT_TEMPLATES_STORE_NAME,
  DOCUMENT_VERSIONS_STORE_NAME,
  SNAPSHOT_STORE_NAME,
  STORE_NAME,
  buildBackupEnvelope,
  parseBackupContent,
  restoreWorkspaceSafelyWithDb,
  type SignalDbLike,
} from '../src/storage/db';
import { buildSignalContainer, parseSignalContent } from '../src/storage/snapshotEngine';
import { CommandPaletteModal } from '../src/components/CommandPaletteModal';
import { TimeMachineDrawer } from '../src/components/TimeMachineDrawer';
import { InspectorSlideDrawer } from '../src/components/InspectorSlideDrawer';
import { OperatorOverviewScreen } from '../src/App';
import { compactSubjectName, compactTeacherName } from '../src/utils/pdfExport';
import type { AppState, ScheduleVersion } from '../src/domain/types';

function createMemoryDb(): SignalDbLike {
  const stores = new Map<string, Map<string, unknown>>([
    [STORE_NAME, new Map()],
    [SNAPSHOT_STORE_NAME, new Map()],
    [AUDIT_STORE_NAME, new Map()],
    [ASSIGNMENT_STORE_NAME, new Map()],
    [DOCUMENT_VERSIONS_STORE_NAME, new Map()],
    [DOCUMENT_TEMPLATES_STORE_NAME, new Map()],
    [DOCUMENT_ATTACHMENTS_STORE_NAME, new Map()],
  ]);
  const ensure = (name: string) => {
    let map = stores.get(name);
    if (!map) {
      map = new Map<string, unknown>();
      stores.set(name, map);
    }
    return map;
  };
  const resolveKey = (value: unknown, explicitKey?: string): string => {
    if (explicitKey) return explicitKey;
    const rec = value as Record<string, unknown> | null;
    if (rec && typeof rec.storageKey === 'string') return rec.storageKey;
    if (rec && typeof rec.id === 'string') return rec.id;
    return 'default';
  };
  return {
    async get<T = unknown>(storeName: string, key: string): Promise<T | undefined> {
      return ensure(storeName).get(key) as T | undefined;
    },
    async put(storeName: string, value: unknown, key?: string): Promise<unknown> {
      const k = resolveKey(value, key);
      ensure(storeName).set(k, value);
      return k;
    },
    async getAll<T = unknown>(storeName: string): Promise<T[]> {
      return Array.from(ensure(storeName).values()) as T[];
    },
    async delete(storeName: string, key: string): Promise<void> {
      ensure(storeName).delete(key);
    },
    transaction(storeNames: string | string[]) {
      const names = Array.isArray(storeNames) ? storeNames : [storeNames];
      const txStores = new Map<string, Map<string, unknown>>();
      for (const n of names) txStores.set(n, ensure(n));
      return {
        objectStore(name: string) {
          const map = txStores.get(name) ?? ensure(name);
          return {
            async get<T = unknown>(key: string): Promise<T | undefined> {
              return map.get(key) as T | undefined;
            },
            async put(value: unknown, key?: string): Promise<unknown> {
              const k = resolveKey(value, key);
              map.set(k, value);
              return k;
            },
            async getAll<T = unknown>(): Promise<T[]> {
              return Array.from(map.values()) as T[];
            },
            async delete(key: string): Promise<void> {
              map.delete(key);
            },
            async clear(): Promise<void> {
              map.clear();
            },
          };
        },
        done: Promise.resolve(),
      };
    },
  };
}

function makeValidPdfBytes(label = 'SIGNAL-T11'): Uint8Array {
  return new TextEncoder().encode(
    `%PDF-1.4\n% ${label}\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n`
  );
}

function addVerifiedScheduleVersion(base: AppState): AppState {
  const entries = base.activeSchedule ?? [];
  const version: ScheduleVersion = {
    id: 'ver-official-t11',
    version: 1,
    createdAt: '2026-11-18T07:00:00.000Z',
    label: 'Jadwal Resmi Semester Ganjil 2026/2027',
    entryCount: entries.length,
    entries,
    fingerprint: buildScheduleFingerprint(entries),
    validatorVersion: '3.2.0',
    academicYear: base.settings.academicYear,
    semester: base.settings.semester,
  };
  return {
    ...base,
    draft: null,
    history: [version, ...(base.history ?? [])],
  };
}

async function buildSampleLifecycleState(sourceDb: SignalDbLike): Promise<{
  state: AppState;
  draftDocId: string;
  finalDocId: string;
  finalVersionId: string;
  attachmentStorageKey: string;
  attachmentSha256: string;
  customTemplateId: string;
}> {
  let state = addVerifiedScheduleVersion(createDemoState());
  state.settings.schoolName = 'MTs Negeri 1 Jewel Luxury';
  state.settings.headmasterName = 'Dr. H. Ahmad Fauzan, M.Pd.';
  state.settings.headmasterNip = '197504122005011004';
  state.settings.city = 'Bandung';

  const tpl = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-01')!;
  const teacher = state.teachers[0];

  // 1) Create a finalized document with verified attachment
  const intake1 = saveIntakeDraftToState(
    state,
    tpl,
    {
      documentTitle: 'Surat Tugas Olimpiade Sains Madrasah',
      documentDate: '2026-11-18',
      peserta: [teacher.id],
      nama_kegiatan: 'Pembinaan KSM Tingkat Provinsi',
      penyelenggara: 'Kanwil Kemenag Jawa Barat',
      tanggal_mulai: '2026-11-20',
      tanggal_selesai: '2026-11-21',
      lokasi: 'Bandung',
      dasar_surat: 'Undangan Resmi KSM 2026',
    },
    { timestamp: '2026-11-18T08:00:00.000Z' }
  );
  const initial1 = buildInitialStudioContentFromDraft(intake1.draft);
  const studio1 = saveStudioDraftToState(
    intake1.state,
    intake1.draft.id,
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
            content: [
              {
                type: 'text',
                text: `Menugaskan ${teacher.name} (NIP. 198204122008011015) untuk mengikuti Pembinaan KSM.`,
              },
            ],
          },
        ],
      },
      pageSettings: initial1.pageSettings,
      updatedAt: '2026-11-18T08:05:00.000Z',
    },
    { timestamp: '2026-11-18T08:05:00.000Z' }
  );

  const num = computeNextSequentialNumber({
    state: studio1.state,
    kind: 'SURAT_TUGAS',
    documentDate: studio1.draft.documentDate,
  });
  const fin = await finalizeDocumentTransaction({
    state: studio1.state,
    draft: studio1.draft,
    content: studio1.draft.studio!.content,
    pageSettings: studio1.draft.studio!.pageSettings,
    documentNumber: num.suggestedNumber,
    numberingMode: 'AUTO',
    demoAcknowledged: true,
    storageAdapter: defaultFinalPdfStorageAdapter,
    timestamp: '2026-11-18T08:10:00.000Z',
  });
  state = fin.state;

  // Attach verified PDF Blob
  const attachRes = await attachFileToDocumentInState({
    state,
    documentId: fin.documentRecord.id,
    versionId: fin.documentVersion.id,
    fileName: 'Undangan-KSM-Resmi.pdf',
    declaredMimeType: 'application/pdf',
    bytes: makeValidPdfBytes('UNDANGAN-KSM-2026'),
    dbOverride: sourceDb,
    timestamp: '2026-11-18T08:12:00.000Z',
  });
  state = attachRes.state;

  // 2) Create a second active draft document
  const intake2 = saveIntakeDraftToState(
    state,
    tpl,
    {
      documentTitle: 'Draft Surat Tugas Rapat Kerja',
      documentDate: '2026-11-18',
      peserta: [teacher.id],
      nama_kegiatan: 'Rapat Kerja Semester',
      penyelenggara: 'MTs Negeri 1 Jewel Luxury',
      tanggal_mulai: '2026-11-25',
      tanggal_selesai: '2026-11-25',
      lokasi: 'Aula Madrasah',
      dasar_surat: 'Program Kerja Tahunan',
    },
    { timestamp: '2026-11-18T08:20:00.000Z' }
  );
  state = intake2.state;

  // 3) Extract a sanitized custom template from finalized document
  const tplRes = createTemplateFromDocumentInState(state, {
    documentId: fin.documentRecord.id,
    name: 'Template Surat Tugas KSM Madrasah',
    description: 'Hasil ekstraksi aman tanpa PII',
    timestamp: '2026-11-18T08:25:00.000Z',
  });
  state = tplRes.state;

  return {
    state,
    draftDocId: intake2.documentRecord.id,
    finalDocId: fin.documentRecord.id,
    finalVersionId: fin.documentVersion.id,
    attachmentStorageKey: attachRes.attachment.storageKey,
    attachmentSha256: attachRes.attachment.sha256,
    customTemplateId: tplRes.template.id,
  };
}

describe('Tahap 11 — Polish, Aksesibilitas, Beranda, Command Palette & Regresi Akhir', () => {
  beforeEach(() => {
    clearMemoryFinalPdfStore();
    clearMemoryAttachmentStore();
  });

  it('CommandPaletteModal mengindeks aksi Persuratan, dokumen nyata, template aktif, ARIA lengkap, dan bebas eksposur NIP', async () => {
    const db = createMemoryDb();
    const { state, customTemplateId } = await buildSampleLifecycleState(db);

    // Ensure at least one teacher has an explicit NIP to prove zero NIP leakage
    const stateWithExplicitNip: AppState = {
      ...state,
      teachers: state.teachers.map((t, idx) =>
        idx === 0 ? { ...t, nip: '198809142015031007' } : t
      ),
    };

    // Archive one custom template and ensure archived template is NOT listed in Command Palette
    const toggled = toggleCustomTemplateStatusInState(
      stateWithExplicitNip,
      customTemplateId,
      '2026-11-18T08:30:00.000Z'
    );
    expect(toggled.template.status).toBe('ARCHIVED');

    const html = renderToStaticMarkup(
      React.createElement(CommandPaletteModal, {
        isOpen: true,
        onClose: () => {},
        state: toggled.state,
        onNavigate: () => {},
        onLaunchPersuratan: () => {},
        onLaunchTeachingSk: () => {},
      })
    );

    // Quick actions & Persuratan indexing
    expect(html).toContain('Buka Pusat Persuratan &amp; Arsip (S01)');
    expect(html).toContain('Buat Surat Baru — Galeri Template (S02)');
    expect(html).toContain('Kelola Template Madrasah (S07)');
    expect(html).toContain('Buat SK Pembagian Tugas Mengajar (SYS-TPL-03)');
    expect(html).toContain('Surat Tugas Olimpiade Sains Madrasah');
    expect(html).toContain('Draft Surat Tugas Rapat Kerja');

    // Archived custom template must be hidden
    expect(html).not.toContain('Template Surat Tugas KSM Madrasah');

    // ARIA accessibility semantics
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('role="listbox"');
    expect(html).toContain('role="option"');

    // Strict privacy hygiene: zero teacher NIP leaked in Command Palette
    expect(html).not.toContain('198809142015031007');
    for (const t of stateWithExplicitNip.teachers) {
      if (t.nip && t.nip.trim().length >= 8) {
        expect(html).not.toContain(t.nip.trim());
      }
    }
  });

  it('OperatorOverviewScreen menampilkan Ringkasan Persuratan & Arsip akurat (0 data palsu) dan status SK Mengajar jujur', async () => {
    // 1) Clean state without verified ScheduleVersion -> SK Mengajar locked, 0 documents
    const cleanState = createDemoState();
    cleanState.history = [];
    const cleanReport = validateSchedule(cleanState, cleanState.activeSchedule ?? []);
    const cleanMasterIssues = validateMasterData(cleanState);

    const cleanHtml = renderToStaticMarkup(
      React.createElement(OperatorOverviewScreen, {
        state: cleanState,
        report: cleanReport,
        masterIssues: cleanMasterIssues,
        readiness: 100,
        occupiedSlots: (cleanState.activeSchedule ?? []).length,
        totalWeeklyCapacity: Math.max(1, (cleanState.activeSchedule ?? []).length),
        onNavigate: () => {},
        onGenerate: () => {},
        isGenerating: false,
        onOpenPdfModal: () => {},
        onOpenValidationModal: () => {},
      })
    );

    expect(cleanHtml).toContain('Ringkasan Persuratan &amp; Arsip');
    expect(cleanHtml).toContain('Belum ada dokumen persuratan tersimpan pada workspace ini');
    expect(cleanHtml).toContain('is-locked');
    expect(cleanHtml).toContain('Terbitkan Jadwal');

    // 2) Populated state with verified ScheduleVersion + draft + finalized + attachment + custom template
    const db = createMemoryDb();
    const { state } = await buildSampleLifecycleState(db);
    const popReport = validateSchedule(state, state.activeSchedule ?? []);
    const popMasterIssues = validateMasterData(state);

    const popHtml = renderToStaticMarkup(
      React.createElement(OperatorOverviewScreen, {
        state,
        report: popReport,
        masterIssues: popMasterIssues,
        readiness: 100,
        occupiedSlots: (state.activeSchedule ?? []).length,
        totalWeeklyCapacity: Math.max(1, (state.activeSchedule ?? []).length),
        onNavigate: () => {},
        onGenerate: () => {},
        isGenerating: false,
        onOpenPdfModal: () => {},
        onOpenValidationModal: () => {},
        onLaunchPersuratan: () => {},
        onLaunchTeachingSk: () => {},
      })
    );

    expect(popHtml).toContain('Buat SK Mengajar');
    expect(popHtml).toContain('Jadwal Resmi Semester Ganjil 2026/2027');
    expect(popHtml).toContain('Surat Tugas Olimpiade Sains Madrasah');
    expect(popHtml).toContain('Draft Surat Tugas Rapat Kerja');
    expect(popHtml).toContain('1 lampiran terverifikasi tersimpan');
  });

  it('Regresi end-to-end penuh S01-S07 + Arsip + Revisi Non-Destruktif + Backup/Restore Blob JSON & .signal', async () => {
    const sourceDb = createMemoryDb();
    const targetDb = createMemoryDb();
    const { state: initialState, finalDocId, attachmentStorageKey, attachmentSha256 } =
      await buildSampleLifecycleState(sourceDb);

    // Archive and restore official document
    const archRes = archiveDocumentInState(initialState, finalDocId, '2026-11-18T08:40:00.000Z');
    expect(archRes.document.status).toBe('ARCHIVED');

    const unarchRes = restoreArchivedDocumentInState(
      archRes.state,
      finalDocId,
      '2026-11-18T08:45:00.000Z'
    );
    expect(unarchRes.document.status).toBe('FINAL');

    // Non-destructive revision must preserve finalized version immutable
    const revRes = createRevisionDraftInState(unarchRes.state, {
      sourceDocumentId: finalDocId,
      revisionReason: 'Pembaruan jadwal pelaksanaan kegiatan tingkat provinsi',
      timestamp: '2026-11-18T08:50:00.000Z',
    });
    const stateAfterRev = revRes.state;
    const originalDoc = (stateAfterRev.documents ?? []).find((d) => d.id === finalDocId);
    expect(originalDoc?.status).toBe('FINAL');
    expect(originalDoc?.currentVersionId).toBeTruthy();
    expect(revRes.revisionDocument.parentDocumentId).toBe(finalDocId);
    expect(revRes.revisionDocument.status).toBe('DRAFT');

    // Export JSON backup with manifest + attachment Blobs and restore to fresh DB
    const envelope = await buildBackupEnvelope(stateAfterRev, { dbOverride: sourceDb });
    expect(envelope.manifest?.totalDocuments).toBe(stateAfterRev.documents?.length);
    expect(envelope.manifest?.totalAttachments).toBe(1);
    expect((envelope.blobs ?? []).some((b) => b.storageKey === attachmentStorageKey)).toBe(true);

    const parsedJson = await parseBackupContent(JSON.stringify(envelope));
    expect(parsedJson.verification).toBe('verified');
    expect((parsedJson.blobs ?? []).length).toBeGreaterThanOrEqual(1);

    clearMemoryAttachmentStore();
    await restoreWorkspaceSafelyWithDb(targetDb, parsedJson.state, parsedJson.blobs);
    const restoredBlob = await getBinaryBlob(attachmentStorageKey, targetDb);
    expect(restoredBlob).not.toBeNull();
    expect(restoredBlob!.record.sha256).toBe(attachmentSha256);

    // Export & verify .signal container integrity
    const signalContainer = await buildSignalContainer(stateAfterRev, [], undefined, sourceDb);
    expect((signalContainer.data.blobs ?? []).length).toBeGreaterThanOrEqual(1);
    const parsedSignal = await parseSignalContent(JSON.stringify(signalContainer));
    expect(parsedSignal.verification).toBe('verified');
    expect((parsedSignal.blobs ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it('Aksesibilitas drawer dialog, aturan 1 menu sidebar Persuratan & Arsip, dan utilitas PDF lama bebas regresi', () => {
    const state = createDemoState();

    // TimeMachineDrawer ARIA dialog contract
    const tmHtml = renderToStaticMarkup(
      React.createElement(TimeMachineDrawer, {
        isOpen: true,
        onClose: () => {},
        currentState: state,
        onStateRestored: () => {},
        onNotify: () => {},
      })
    );
    expect(tmHtml).toContain('role="dialog"');
    expect(tmHtml).toContain('aria-modal="true"');

    // InspectorSlideDrawer ARIA dialog contract
    const inspHtml = renderToStaticMarkup(
      React.createElement(InspectorSlideDrawer, {
        isOpen: true,
        onClose: () => {},
        target: { type: 'teacher', data: state.teachers[0] },
        state,
        onNotify: () => {},
      })
    );
    expect(inspHtml).toContain('role="dialog"');
    expect(inspHtml).toContain('aria-modal="true"');

    // Single sidebar menu verification for Persuratan & Arsip in App.tsx
    const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf-8');
    const sidebarMatches = appSource.match(/id:\s*'persuratan'/g) ?? [];
    expect(sidebarMatches.length).toBe(1);

    // Legacy PDF utility helpers remain intact & pure (no disk side effects)
    expect(compactSubjectName('Pendidikan Agama Islam')).toBeTruthy();
    expect(compactTeacherName('Dr. H. Ahmad Fauzan, M.Pd.')).toBeTruthy();
  });
});
