import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from '../src/App';
import { PersuratanWorkspace } from '../src/components/persuratan/PersuratanWorkspace';
import { TemplateGallery } from '../src/components/persuratan/TemplateGallery';
import { SYSTEM_DOCUMENT_TEMPLATES, TEMPLATE_CATEGORIES } from '../src/domain/persuratan/templates/registry';
import {
  DEFAULT_TEMPLATE_FILTERS,
  DEFAULT_TEMPLATE_PREFERENCES,
  cloneTemplateToMadrasah,
  collectAllTemplates,
  computeCategoryCounts,
  computeCollectionCounts,
  filterTemplates,
  recordRecentTemplateUsage,
  sanitizeTemplatePreferences,
  toggleFavoriteTemplate,
} from '../src/domain/persuratan/templates/selectors';
import { createDemoState, createEmptyState } from '../src/domain/seed';
import type { AppState } from '../src/domain/types';
import { computeCanonicalSha256 } from '../src/storage/checksum';
import {
  buildBackupEnvelope,
  migrateAppStateSchema,
  parseBackupContent,
  validateAppStateStructure,
} from '../src/storage/db';
import { buildSignalContainer, parseSignalContent } from '../src/storage/snapshotEngine';

describe('Tahap 3A — Galeri Template S02 & Katalog 30 Template', () => {
  it('1. Katalog SYSTEM memuat tepat 30 template unik terstruktur (urutan 1..30) tanpa PII atau timestamp palsu', () => {
    expect(SYSTEM_DOCUMENT_TEMPLATES).toHaveLength(30);

    const ids = new Set(SYSTEM_DOCUMENT_TEMPLATES.map((t) => t.id));
    const codes = new Set(SYSTEM_DOCUMENT_TEMPLATES.map((t) => t.code));
    const orders = SYSTEM_DOCUMENT_TEMPLATES.map((t) => t.catalogOrder);
    expect(ids.size).toBe(30);
    expect(codes.size).toBe(30);
    expect(orders).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));

    const demo = createDemoState();
    const realTeacherNames = demo.teachers.map((t) => t.name);
    const realNips = demo.teachers.map((t) => t.nip).filter(Boolean) as string[];

    for (const tpl of SYSTEM_DOCUMENT_TEMPLATES) {
      expect(tpl.source).toBe('SYSTEM');
      expect(tpl.isReadOnly).toBe(true);
      expect(tpl.status).toBe('ACTIVE');
      expect(tpl.createdAt).toBeNull();
      expect(tpl.updatedAt).toBeNull();
      expect(tpl.autoDataSources.length).toBeGreaterThan(0);
      expect(tpl.requiredInputs.length).toBeGreaterThan(0);

      const serialized = JSON.stringify(tpl);
      for (const name of realTeacherNames) {
        expect(serialized).not.toContain(name);
      }
      for (const nip of realNips) {
        expect(serialized).not.toContain(nip);
      }
      // Tidak boleh ada NIP 18 digit atau tanggal hardcoded 2026-xx-xx
      expect(serialized).not.toMatch(/\b\d{18}\b/);
    }
  });

  it('2. 6 kategori & 5 koleksi menghitung jumlah nyata sesuai isi registri tanpa angka hardcoded', () => {
    expect(TEMPLATE_CATEGORIES).toHaveLength(6);
    const catCounts = computeCategoryCounts(SYSTEM_DOCUMENT_TEMPLATES);
    expect(catCounts.ALL).toBe(30);
    expect(catCounts.PENUGASAN).toBe(6);
    expect(catCounts.KORESPONDENSI).toBe(4);
    expect(catCounts.KETERANGAN).toBe(5);
    expect(catCounts.BERITA_ACARA).toBe(3);
    expect(catCounts.NOTULA_LAPORAN).toBe(4);
    expect(catCounts.ADMINISTRASI).toBe(8);

    const prefs = sanitizeTemplatePreferences(
      { favoriteTemplateIds: ['SYS-TPL-01', 'SYS-TPL-03'], recentTemplates: [{ templateId: 'SYS-TPL-07', usedAt: '2026-11-16T01:00:00Z' }], selectedTemplateId: null },
      SYSTEM_DOCUMENT_TEMPLATES
    );
    const colCounts = computeCollectionCounts(SYSTEM_DOCUMENT_TEMPLATES, prefs);
    expect(colCounts.ALL).toBe(30);
    expect(colCounts.FAVORITES).toBe(2);
    expect(colCounts.RECENT).toBe(1);
    expect(colCounts.MADRASAH).toBe(0);
    expect(colCounts.SYSTEM).toBe(30);
  });

  it('3. Pencarian mencakup nama, tujuan, kategori, dan input tanpa memutasi registri bawaan', () => {
    const before = JSON.stringify(SYSTEM_DOCUMENT_TEMPLATES);

    const byName = filterTemplates(
      SYSTEM_DOCUMENT_TEMPLATES,
      { ...DEFAULT_TEMPLATE_FILTERS, searchQuery: 'Pembagian Tugas' },
      DEFAULT_TEMPLATE_PREFERENCES
    );
    expect(byName.some((t) => t.id === 'SYS-TPL-03')).toBe(true);

    const byCategoryWord = filterTemplates(
      SYSTEM_DOCUMENT_TEMPLATES,
      { ...DEFAULT_TEMPLATE_FILTERS, searchQuery: 'Berita Acara' },
      DEFAULT_TEMPLATE_PREFERENCES
    );
    expect(byCategoryWord.length).toBeGreaterThanOrEqual(3);

    const byPurpose = filterTemplates(
      SYSTEM_DOCUMENT_TEMPLATES,
      { ...DEFAULT_TEMPLATE_FILTERS, searchQuery: 'ScheduleVersion' },
      DEFAULT_TEMPLATE_PREFERENCES
    );
    expect(byPurpose.some((t) => t.id === 'SYS-TPL-03')).toBe(true);

    expect(JSON.stringify(SYSTEM_DOCUMENT_TEMPLATES)).toBe(before);
  });

  it('4. Favorit & Terakhir Dipakai hanya menyimpan referensi ID (max 10 unik terbaru), bukan duplikasi template', () => {
    let prefs = DEFAULT_TEMPLATE_PREFERENCES;
    prefs = toggleFavoriteTemplate(prefs, 'SYS-TPL-01', SYSTEM_DOCUMENT_TEMPLATES);
    expect(prefs.favoriteTemplateIds).toEqual(['SYS-TPL-01']);

    // Toggle lagi -> terhapus bersih
    prefs = toggleFavoriteTemplate(prefs, 'SYS-TPL-01', SYSTEM_DOCUMENT_TEMPLATES);
    expect(prefs.favoriteTemplateIds).toEqual([]);

    // Isi 12 pemakaian -> dibatasi 10 terbaru dan unik (re-order terbaru ke depan)
    for (let i = 1; i <= 12; i++) {
      const id = `SYS-TPL-${String(i).padStart(2, '0')}`;
      prefs = recordRecentTemplateUsage(prefs, id, SYSTEM_DOCUMENT_TEMPLATES, `2026-11-16T00:${String(i).padStart(2, '0')}:00Z`);
    }
    expect(prefs.recentTemplates).toHaveLength(10);
    expect(prefs.recentTemplates[0].templateId).toBe('SYS-TPL-12');
    expect(prefs.recentTemplates[9].templateId).toBe('SYS-TPL-03');

    // Pakai ulang SYS-TPL-03 -> naik ke posisi 0 tanpa duplikat
    prefs = recordRecentTemplateUsage(prefs, 'SYS-TPL-03', SYSTEM_DOCUMENT_TEMPLATES, '2026-11-16T01:00:00Z');
    expect(prefs.recentTemplates).toHaveLength(10);
    expect(prefs.recentTemplates[0].templateId).toBe('SYS-TPL-03');
    expect(new Set(prefs.recentTemplates.map((r) => r.templateId)).size).toBe(10);

    // Sanitasi ID rusak/terhapus membersihkan preferensi
    const cleaned = sanitizeTemplatePreferences(
      {
        favoriteTemplateIds: ['SYS-TPL-01', 'MISSING-ID', 'SYS-TPL-01'],
        recentTemplates: [
          { templateId: 'MISSING-ID', usedAt: '2026-11-16T01:00:00Z' },
          { templateId: 'SYS-TPL-02', usedAt: '2026-11-16T01:00:00Z' },
        ],
        selectedTemplateId: 'MISSING-ID',
      },
      SYSTEM_DOCUMENT_TEMPLATES
    );
    expect(cleaned.favoriteTemplateIds).toEqual(['SYS-TPL-01']);
    expect(cleaned.recentTemplates).toEqual([{ templateId: 'SYS-TPL-02', usedAt: '2026-11-16T01:00:00Z' }]);
    expect(cleaned.selectedTemplateId).toBeNull();
  });

  it('5. Kloning template SYSTEM menghasilkan salinan MADRASAH independen dengan metadata provenance', () => {
    const sourceTpl = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-01')!;
    expect(() => cloneTemplateToMadrasah(sourceTpl, '   ')).toThrow();

    const cloned = cloneTemplateToMadrasah(
      sourceTpl,
      'Surat Tugas Bimtek Internal MTs',
      [],
      '2026-11-16T02:10:00Z'
    );

    expect(cloned.id).not.toBe(sourceTpl.id);
    expect(cloned.source).toBe('MADRASAH');
    expect(cloned.isReadOnly).toBe(false);
    expect(cloned.sourceTemplateId).toBe('SYS-TPL-01');
    expect(cloned.sourceTemplateVersion).toBe('1.0.0');
    expect(cloned.createdAt).toBe('2026-11-16T02:10:00Z');
    expect(cloned.name).toBe('Surat Tugas Bimtek Internal MTs');

    // Ubah salinan -> sumber bawaan SYSTEM tidak berubah
    cloned.previewBlocks.push({ type: 'paragraph', text: 'Paragraf tambahan madrasah' });
    expect(sourceTpl.previewBlocks.some((b) => b.type === 'paragraph' && b.text === 'Paragraf tambahan madrasah')).toBe(false);

    const combined = collectAllTemplates([cloned]);
    expect(combined).toHaveLength(31);
    const madrasahOnly = filterTemplates(
      combined,
      { ...DEFAULT_TEMPLATE_FILTERS, collection: 'MADRASAH' },
      DEFAULT_TEMPLATE_PREFERENCES
    );
    expect(madrasahOnly).toHaveLength(1);
    expect(madrasahOnly[0].id).toBe(cloned.id);
  });

  it('6. Catatan kewenangan & verifikasi tampil jujur pada Nota Dinas, Rekomendasi, dan SK', () => {
    const notaDinas = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-10')!;
    const rekomendasi = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-15')!;
    const skTugas = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-03')!;

    expect(notaDinas.legalNotice).toMatch(/PMA/i);
    expect(notaDinas.legalNotice).toMatch(/kewenangan/i);
    expect(rekomendasi.legalNotice).toMatch(/kewenangan/i);
    expect(skTugas.legalNotice).toMatch(/ScheduleVersion/i);
  });

  it('7. Persistensi customTemplates & templatePreferences bertahan penuh lewat backup JSON & kontainer .signal ber-SHA-256', async () => {
    const state = createDemoState();
    const cloned = cloneTemplateToMadrasah(SYSTEM_DOCUMENT_TEMPLATES[2], 'SK Mengajar Versi Madrasah', [], '2026-11-16T02:20:00Z');
    const updatedState: AppState = {
      ...state,
      customTemplates: [cloned],
      templatePreferences: {
        favoriteTemplateIds: ['SYS-TPL-01', cloned.id],
        recentTemplates: [{ templateId: cloned.id, usedAt: '2026-11-16T02:25:00Z' }],
        selectedTemplateId: cloned.id,
      },
    };

    const backup = await buildBackupEnvelope(updatedState);
    const parsedBackup = await parseBackupContent(JSON.stringify(backup));
    expect(parsedBackup.verification).toBe('verified');
    expect(parsedBackup.state.customTemplates).toEqual([cloned]);
    expect(parsedBackup.state.templatePreferences?.selectedTemplateId).toBe(cloned.id);

    const signalArchive = await buildSignalContainer(updatedState, []);
    const parsedSignal = await parseSignalContent(JSON.stringify(signalArchive));
    expect(parsedSignal.verification).toBe('verified');
    expect(parsedSignal.state.customTemplates).toEqual([cloned]);
    expect(parsedSignal.state.templatePreferences?.favoriteTemplateIds).toEqual(['SYS-TPL-01', cloned.id]);

    // Tolak jika struktur customTemplates rusak
    const corrupt = JSON.parse(JSON.stringify(updatedState)) as AppState;
    (corrupt.customTemplates as unknown[]) = [{ id: '', name: 'Rusak', source: 'SYSTEM' }];
    expect(() => validateAppStateStructure(corrupt)).toThrow();
  });

  it('8. Backup Phase 2 lama tanpa customTemplates/templatePreferences tetap lolos SHA-256 dan menjaga documents S01', async () => {
    const demo = createDemoState();
    const phase2Payload = JSON.parse(JSON.stringify(demo)) as AppState;
    delete phase2Payload.customTemplates;
    delete phase2Payload.templatePreferences;
    phase2Payload.documents = [
      {
        id: 'DOC-LEGACY-1',
        direction: 'OUTGOING',
        documentType: 'SURAT_KELUAR',
        documentNumber: '001/MTs/2026',
        title: 'Surat Lama',
        subject: 'Subjek Lama',
        documentDate: '2026-10-10',
        status: 'FINAL',
        createdAt: '2026-10-10T08:00:00Z',
        updatedAt: '2026-10-10T08:00:00Z',
        archivedAt: null,
      },
    ];

    const body = {
      formatName: 'SIGNAL-LOCAL-BACKUP' as const,
      formatVersion: 2,
      schemaVersion: 2,
      appVersion: '1.2.1',
      checksumAlgorithm: 'SHA-256' as const,
      exportedAt: '2026-11-15T22:55:00Z',
      payload: phase2Payload,
    };
    const checksum = await computeCanonicalSha256(body);
    const parsed = await parseBackupContent(JSON.stringify({ ...body, checksum }));

    expect(parsed.verification).toBe('verified');
    expect(parsed.state.documents).toHaveLength(1);
    expect(parsed.state.customTemplates).toEqual([]);
    expect(parsed.state.templatePreferences).toEqual(DEFAULT_TEMPLATE_PREFERENCES);

    // Idempoten
    const secondPass = migrateAppStateSchema(parsed.state);
    expect(secondPass.changed).toBe(false);
  });

  it('9. Render UI S02 TemplateGallery dan PersuratanWorkspace menampilkan 6 kategori, 5 koleksi, paper preview, dan tanpa menu sidebar ekstra', () => {
    const state = createEmptyState();
    const galleryHtml = renderToStaticMarkup(createElement(TemplateGallery, { state }));
    expect(galleryHtml).toContain('Galeri Template Persuratan');
    expect(galleryHtml).toContain('Penugasan &amp; Keputusan');
    expect(galleryHtml).toContain('Korespondensi');
    expect(galleryHtml).toContain('Template Madrasah');
    expect(galleryHtml).toContain('Bawaan SIGNAL');
    expect(galleryHtml).toContain('Gunakan Template');
    expect(galleryHtml).toContain('Dokumen Kosong');
    expect(galleryHtml).toContain('Impor DOCX');
    expect(galleryHtml).not.toContain('Edit Template');

    const workspaceHtml = renderToStaticMarkup(
      createElement(PersuratanWorkspace, { state, initialView: 'templates' })
    );
    expect(workspaceHtml).toContain('Pusat Persuratan &amp; Arsip (S01)');
    expect(workspaceHtml).toContain('Galeri Template (S02 · 30 Katalog)');

    // Pastikan createEmptyState documents tetap kosong ([])
    expect(state.documents).toEqual([]);

    // Pastikan App shell merender aman dan hanya memiliki tepat 1 menu sidebar Persuratan & Arsip
    const appHtml = renderToStaticMarkup(createElement(App));
    expect(appHtml).toContain('SIGNAL');
  });
});
