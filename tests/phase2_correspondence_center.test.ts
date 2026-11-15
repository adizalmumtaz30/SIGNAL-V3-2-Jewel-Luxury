import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from '../src/App';
import { CorrespondenceCenter } from '../src/components/persuratan/CorrespondenceCenter';
import { createDemoState, createEmptyState } from '../src/domain/seed';
import type { AppState } from '../src/domain/types';
import type { DocumentRecord } from '../src/domain/persuratan/types';
import {
  DEFAULT_CORRESPONDENCE_FILTERS,
  collectAvailableYears,
  computeCorrespondenceStats,
  filterCorrespondenceDocuments,
  paginateCorrespondenceDocuments,
  sortCorrespondenceDocuments,
} from '../src/domain/persuratan/selectors';
import { computeCanonicalSha256 } from '../src/storage/checksum';
import {
  buildBackupEnvelope,
  migrateAppStateSchema,
  parseBackupContent,
  validateAppStateStructure,
} from '../src/storage/db';
import { buildSignalContainer, parseSignalContent } from '../src/storage/snapshotEngine';

function buildTestFixtures(): DocumentRecord[] {
  return [
    {
      id: 'DOC-2026-001',
      direction: 'INCOMING',
      documentType: 'SURAT_MASUK',
      documentNumber: 'B-120/Kk.13.07/08/2026',
      title: 'Edaran Pemutakhiran Emis Semester Ganjil',
      subject: 'Instruksi verifikasi data pendidik dan rombel',
      documentDate: '2026-08-12',
      counterpartName: 'Kankemenag Kabupaten Malang',
      status: 'RECEIVED',
      relatedTeacherIds: ['TCH-001'],
      tags: ['Kemenag', 'EMIS'],
      createdAt: '2026-08-12T08:00:00Z',
      updatedAt: '2026-08-12T08:15:00Z',
      archivedAt: null,
    },
    {
      id: 'DOC-2026-002',
      direction: 'OUTGOING',
      documentType: 'SK',
      documentNumber: null,
      title: 'Rancangan SK Pembagian Tugas Mengajar Ganjil',
      subject: 'Pembagian beban mengajar guru semester ganjil',
      documentDate: '2026-07-20',
      counterpartName: 'Dewan Guru MTs',
      status: 'DRAFT',
      relatedTeacherIds: ['TCH-001', 'TCH-002'],
      tags: ['SK', 'Kurikulum'],
      createdAt: '2026-07-20T09:00:00Z',
      updatedAt: '2026-07-21T10:00:00Z',
      archivedAt: null,
    },
    {
      id: 'DOC-2026-003',
      direction: 'OUTGOING',
      documentType: 'SURAT_TUGAS',
      documentNumber: '045/MTs-CN/ST/IX/2026',
      title: 'Surat Tugas Pelatihan Kurikulum Madrasah',
      subject: 'Penugasan mengikuti BIMTEK tingkat kabupaten',
      documentDate: '2026-09-05',
      counterpartName: 'Balai Diklat Keagamaan',
      status: 'FINAL',
      relatedTeacherIds: ['TCH-003'],
      tags: ['Tugas', 'BIMTEK'],
      createdAt: '2026-09-05T07:30:00Z',
      updatedAt: '2026-09-05T11:00:00Z',
      archivedAt: null,
    },
    {
      id: 'DOC-2025-099',
      direction: 'OUTGOING',
      documentType: 'UNDANGAN',
      documentNumber: '099/MTs-CN/UND/XI/2025',
      title: 'Undangan Rapat Komite Akhir Tahun 2025',
      subject: 'Evaluasi program tahun ajaran 2025/2026',
      documentDate: '2025-11-18',
      counterpartName: 'Komite Madrasah',
      status: 'ARCHIVED',
      relatedTeacherIds: ['TCH-002'],
      tags: ['Komite', 'Arsip 2025'],
      createdAt: '2025-11-18T08:00:00Z',
      updatedAt: '2025-12-01T15:00:00Z',
      archivedAt: '2025-12-01T15:00:00Z',
    },
    {
      id: 'DOC-2025-050',
      direction: 'INCOMING',
      documentType: 'BERITA_ACARA',
      documentNumber: 'BA-012/DISDIK/2025',
      title: 'Berita Acara Serah Terima Dokumen Akreditasi',
      subject: 'Arsip akreditasi tahun 2025',
      documentDate: '2025-05-10',
      counterpartName: 'BAN-PDM Provinsi',
      status: 'ARCHIVED',
      relatedTeacherIds: [],
      tags: ['Akreditasi'],
      createdAt: '2025-05-10T09:00:00Z',
      updatedAt: '2025-05-20T12:00:00Z',
      archivedAt: '2025-05-20T12:00:00Z',
    },
  ];
}

describe('Tahap 2 — Pusat Persuratan & Arsip (S01)', () => {
  it('1. Menginisialisasi documents kosong ([]) di seed dan migrasi non-destruktif tanpa menyentuh jadwal/guru', () => {
    const demo = createDemoState();
    const empty = createEmptyState();
    expect(demo.documents).toEqual([]);
    expect(empty.documents).toEqual([]);

    const legacyWithoutDocuments = JSON.parse(JSON.stringify(demo)) as AppState;
    delete legacyWithoutDocuments.documents;
    legacyWithoutDocuments.schemaVersion = 1;

    const first = migrateAppStateSchema(legacyWithoutDocuments, '2026-11-15T15:00:00Z');
    expect(first.changed).toBe(true);
    expect(first.state.documents).toEqual([]);
    expect(first.state.activeSchedule).toEqual(demo.activeSchedule);
    expect(first.state.attendance).toEqual(demo.attendance);
    expect(first.state.holidays).toEqual(demo.holidays);
    expect(first.state.settings).toEqual(demo.settings);

    const second = migrateAppStateSchema(first.state, '2026-11-15T15:05:00Z');
    expect(second.changed).toBe(false);
    expect(second.state.documents).toEqual([]);
  });

  it('2. Menghitung 4 kartu statistik secara akurat tanpa penghitungan ganda dalam kartu', () => {
    const fixtures = buildTestFixtures();
    // Tambahkan duplikat ID untuk memastikan deduplikasi per kartu berjalan
    const withDuplicate = [...fixtures, { ...fixtures[0] }];
    const stats = computeCorrespondenceStats(withDuplicate);

    expect(stats.total).toBe(5);
    expect(stats.incoming).toBe(2); // DOC-2026-001, DOC-2025-050
    expect(stats.outgoing).toBe(3); // DOC-2026-002 (DRAFT), DOC-2026-003 (FINAL), DOC-2025-099 (ARCHIVED)
    expect(stats.draft).toBe(1); // DOC-2026-002
    expect(stats.archived).toBe(2); // DOC-2025-099, DOC-2025-050
  });

  it('3. Tab kategori (Semua, Surat Masuk, Surat Keluar, Arsip) memfilter dokumen secara ketat', () => {
    const state = createDemoState();
    const fixtures = buildTestFixtures();

    const all = filterCorrespondenceDocuments(fixtures, { ...DEFAULT_CORRESPONDENCE_FILTERS, tab: 'ALL' }, state.teachers);
    const incoming = filterCorrespondenceDocuments(
      fixtures,
      { ...DEFAULT_CORRESPONDENCE_FILTERS, tab: 'INCOMING' },
      state.teachers
    );
    const outgoing = filterCorrespondenceDocuments(
      fixtures,
      { ...DEFAULT_CORRESPONDENCE_FILTERS, tab: 'OUTGOING' },
      state.teachers
    );
    const archived = filterCorrespondenceDocuments(
      fixtures,
      { ...DEFAULT_CORRESPONDENCE_FILTERS, tab: 'ARCHIVED' },
      state.teachers
    );

    expect(all.map((d) => d.id)).toHaveLength(5);
    expect(incoming.map((d) => d.id)).toEqual(['DOC-2026-001', 'DOC-2025-050']);
    expect(outgoing.map((d) => d.id)).toEqual(['DOC-2026-002', 'DOC-2026-003', 'DOC-2025-099']);
    expect(archived.map((d) => d.id)).toEqual(['DOC-2025-099', 'DOC-2025-050']);
  });

  it('4. Pencarian mencakup nomor/ID/judul/perihal/pihak terkait/nama guru/tag dan TIDAK membocorkan NIP guru', () => {
    const state = createDemoState();
    const fixtures = buildTestFixtures();
    const ahmad = state.teachers.find((t) => t.id === 'TCH-001');
    expect(ahmad?.nip).toBeTruthy();

    // Cari berdasarkan nomor surat
    expect(
      filterCorrespondenceDocuments(
        fixtures,
        { ...DEFAULT_CORRESPONDENCE_FILTERS, searchQuery: 'B-120/Kk.13.07' },
        state.teachers
      ).map((d) => d.id)
    ).toEqual(['DOC-2026-001']);

    // Cari berdasarkan nama guru terkait
    expect(
      filterCorrespondenceDocuments(
        fixtures,
        { ...DEFAULT_CORRESPONDENCE_FILTERS, searchQuery: 'Budi Santoso' },
        state.teachers
      ).map((d) => d.id)
    ).toEqual(['DOC-2026-003']);

    // Cari berdasarkan NIP guru -> TIDAK boleh cocok agar NIP tidak terekspos
    expect(
      filterCorrespondenceDocuments(
        fixtures,
        { ...DEFAULT_CORRESPONDENCE_FILTERS, searchQuery: ahmad!.nip! },
        state.teachers
      )
    ).toEqual([]);

    // Render UI dengan data uji: NIP tidak pernah muncul di tabel S01
    const markup = renderToStaticMarkup(
      createElement(CorrespondenceCenter, {
        state: { ...state, documents: fixtures },
      })
    );
    expect(markup).toContain('Ahmad Fauzi, S.Pd.');
    expect(markup).not.toContain(ahmad!.nip!);
  });

  it('5. Filter tahun, status, rentang tanggal, sorting, dan pagination 10/20/50 bekerja presisi', () => {
    const state = createDemoState();
    const fixtures = buildTestFixtures();

    expect(collectAvailableYears(fixtures)).toEqual(['2026', '2025']);

    const filtered2025 = filterCorrespondenceDocuments(
      fixtures,
      { ...DEFAULT_CORRESPONDENCE_FILTERS, yearFilter: '2025' },
      state.teachers
    );
    expect(filtered2025.map((d) => d.id)).toEqual(['DOC-2025-099', 'DOC-2025-050']);

    const byDateRange = filterCorrespondenceDocuments(
      fixtures,
      { ...DEFAULT_CORRESPONDENCE_FILTERS, dateFrom: '2026-08-01', dateTo: '2026-09-30' },
      state.teachers
    );
    expect(byDateRange.map((d) => d.id)).toEqual(['DOC-2026-001', 'DOC-2026-003']);

    const sortedAsc = sortCorrespondenceDocuments(fixtures, 'documentDate', 'asc');
    expect(sortedAsc[0].id).toBe('DOC-2025-050');
    expect(sortedAsc[sortedAsc.length - 1].id).toBe('DOC-2026-003');

    const sortedByTitle = sortCorrespondenceDocuments(fixtures, 'title', 'asc');
    expect(sortedByTitle[0].title.startsWith('Berita Acara')).toBe(true);

    // Uji pagination dengan 25 item
    const manyDocs = Array.from({ length: 25 }, (_, i) => ({
      ...fixtures[0],
      id: `DOC-PAG-${String(i + 1).padStart(3, '0')}`,
      documentNumber: `NO-${i + 1}`,
    }));

    const p10 = paginateCorrespondenceDocuments(manyDocs, 2, 10);
    expect(p10.totalPages).toBe(3);
    expect(p10.startIndex).toBe(11);
    expect(p10.endIndex).toBe(20);
    expect(p10.rows).toHaveLength(10);

    const p20 = paginateCorrespondenceDocuments(manyDocs, 2, 20);
    expect(p20.totalPages).toBe(2);
    expect(p20.startIndex).toBe(21);
    expect(p20.endIndex).toBe(25);
    expect(p20.rows).toHaveLength(5);

    const clamped = paginateCorrespondenceDocuments(manyDocs, 99, 50);
    expect(clamped.currentPage).toBe(1);
    expect(clamped.rows).toHaveLength(25);
  });

  it('6. State kosong nyata (documents = []) menampilkan 0 pada seluruh statistik dan empty state jujur', () => {
    const emptyWorkspace = createEmptyState();
    const html = renderToStaticMarkup(createElement(CorrespondenceCenter, { state: emptyWorkspace }));

    expect(html).toContain('Pusat Persuratan &amp; Arsip');
    expect(html).toContain('Belum ada surat atau dokumen');
    expect(html).toContain('Buat Dokumen');
    expect(html).not.toContain('Rancangan SK Pembagian Tugas');
  });

  it('7. Kondisi storage error dan loading skeleton ter-render jujur dengan tombol coba ulang', () => {
    const state = createDemoState();

    const errorHtml = renderToStaticMarkup(
      createElement(CorrespondenceCenter, {
        state,
        storageError: 'IndexedDB penuh atau diblokir oleh mode privat.',
        onRetryStorage: () => {},
      })
    );
    expect(errorHtml).toContain('Penyimpanan lokal tidak tersedia');
    expect(errorHtml).toContain('Coba Simpan Ulang');

    const loadingHtml = renderToStaticMarkup(
      createElement(CorrespondenceCenter, {
        state,
        isLoading: true,
      })
    );
    expect(loadingHtml).toContain('Memuat daftar dokumen persuratan');
  });

  it('8. Struktur tabel S01 lengkap (7 kolom + tombol Detail) dan validasi backup/restore menjaga AppState.documents', async () => {
    const state = createDemoState();
    const fixtures = buildTestFixtures();
    const populated: AppState = { ...state, documents: fixtures };

    const html = renderToStaticMarkup(createElement(CorrespondenceCenter, { state: populated }));
    expect(html).toContain('Nomor / ID');
    expect(html).toContain('Nama Dokumen');
    expect(html).toContain('Jenis');
    expect(html).toContain('Tanggal');
    expect(html).toContain('Pihak Terkait');
    expect(html).toContain('Status');
    expect(html).toContain('Aksi');
    expect(html).toContain('Detail');
    expect(html).toContain('Menampilkan <strong>1–5</strong> dari <strong>5</strong> dokumen');

    // Validasi round-trip JSON backup ber-SHA-256
    const backupEnv = await buildBackupEnvelope(populated);
    const parsedBackup = await parseBackupContent(JSON.stringify(backupEnv));
    expect(parsedBackup.verification).toBe('verified');
    expect(parsedBackup.state.documents).toEqual(fixtures);

    // Validasi round-trip kontainer .signal ber-SHA-256
    const signalContainer = await buildSignalContainer(populated, []);
    const parsedSignal = await parseSignalContent(JSON.stringify(signalContainer));
    expect(parsedSignal.verification).toBe('verified');
    expect(parsedSignal.state.documents).toEqual(fixtures);

    // Validasi penolakan metadata dokumen korup pada backup
    const brokenState = JSON.parse(JSON.stringify(populated)) as AppState;
    (brokenState.documents as unknown[]) = [{ id: '', title: 123 }];
    expect(() => validateAppStateStructure(brokenState)).toThrow();
  });

  it('9. Backup Fase 1 asli tanpa field documents tetap lolos verifikasi SHA-256 dan ter-normalisasi menjadi []', async () => {
    const state = createDemoState();
    const legacyPhase1Payload = JSON.parse(JSON.stringify(state)) as AppState;
    delete legacyPhase1Payload.documents;

    const envelopeBody = {
      formatName: 'SIGNAL-LOCAL-BACKUP' as const,
      formatVersion: 2,
      schemaVersion: 2,
      appVersion: '1.2.1',
      checksumAlgorithm: 'SHA-256' as const,
      exportedAt: '2026-11-15T14:00:00Z',
      payload: legacyPhase1Payload,
    };
    const checksum = await computeCanonicalSha256(envelopeBody);
    const parsed = await parseBackupContent(JSON.stringify({ ...envelopeBody, checksum }));

    expect(parsed.verification).toBe('verified');
    expect(parsed.state.documents).toEqual([]);
    expect(parsed.state.activeSchedule).toEqual(state.activeSchedule);
  });

  it('10. Shell App merender aman dan S01 tidak memutasi documents maupun memunculkan draft palsu', () => {
    const appHtml = renderToStaticMarkup(createElement(App));
    expect(appHtml).toContain('SIGNAL');

    const emptyState = createEmptyState();
    const snapshotBefore = JSON.stringify(emptyState.documents);
    const s01Html = renderToStaticMarkup(
      createElement(CorrespondenceCenter, {
        state: emptyState,
        loadError: 'Gagal mengakses pembacaan dokumen sementara.',
        onRetryLoad: () => {},
      })
    );
    expect(s01Html).toContain('Muat Ulang Data');
    expect(s01Html).toContain('Buat Dokumen');
    expect(JSON.stringify(emptyState.documents)).toBe(snapshotBefore);
  });
});
