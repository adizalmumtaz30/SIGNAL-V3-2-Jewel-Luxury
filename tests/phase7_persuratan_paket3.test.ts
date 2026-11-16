import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CorrespondenceCenter } from '../src/components/persuratan/CorrespondenceCenter';
import { DocumentStudio } from '../src/components/persuratan/DocumentStudio';
import { PersuratanWorkspace } from '../src/components/persuratan/PersuratanWorkspace';
import { TemplateGallery } from '../src/components/persuratan/TemplateGallery';
import {
  duplicateDraftInState,
  saveIntakeDraftToState,
  saveStudioDraftToState,
} from '../src/domain/persuratan/intake/draftEngine';
import { buildInitialStudioContentFromDraft } from '../src/domain/persuratan/studio/contentGenerator';
import { SYSTEM_DOCUMENT_TEMPLATES } from '../src/domain/persuratan/templates/registry';
import { createDemoState } from '../src/domain/seed';
import { buildBackupEnvelope, parseBackupContent } from '../src/storage/db';
import { buildSignalContainer, parseSignalContent } from '../src/storage/snapshotEngine';

describe('Paket 3 — Duplikasi Draft Aman, Produktivitas Studio S04, & Polish Responsif', () => {
  it('1. duplicateDraftInState menggandakan draft S03+S04 ke DRAFT baru tanpa nomor surat dan tanpa memutasi sumber', () => {
    const demo = createDemoState();
    const tpl01 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-01')!;

    const saved = saveIntakeDraftToState(
      demo,
      tpl01,
      {
        peserta: [demo.teachers[0].id],
        nama_kegiatan: 'Pelatihan Kurikulum',
        penyelenggara: 'Kemenag Kab',
        tanggal_mulai: '2026-12-05',
        tanggal_selesai: '2026-12-06',
        lokasi: 'Aula Utama',
        documentDate: '2026-11-16',
      },
      { timestamp: '2026-11-16T08:00:00Z' }
    );

    const studioInit = buildInitialStudioContentFromDraft(saved.draft);
    const withStudio = saveStudioDraftToState(
      saved.state,
      saved.draft.id,
      {
        schemaVersion: 1,
        editorStatus: 'IN_PROGRESS',
        content: studioInit.content,
        pageSettings: studioInit.pageSettings,
        updatedAt: '2026-11-16T08:30:00Z',
      },
      { timestamp: '2026-11-16T08:30:00Z' }
    );

    const dup1 = duplicateDraftInState(
      withStudio.state,
      { draftId: withStudio.draft.id, documentId: withStudio.documentRecord.id },
      { timestamp: '2026-11-16T09:00:00Z' }
    );

    expect(dup1.draft.id).not.toBe(withStudio.draft.id);
    expect(dup1.documentRecord.id).not.toBe(withStudio.documentRecord.id);
    expect(dup1.draft.documentId).toBe(dup1.documentRecord.id);
    expect(dup1.documentRecord.intakeDraftId).toBe(dup1.draft.id);
    expect(dup1.documentRecord.status).toBe('DRAFT');
    expect(dup1.documentRecord.documentNumber).toBeNull();
    expect(dup1.documentRecord.archivedAt).toBeNull();
    expect(dup1.draft.title).toBe(`${withStudio.draft.title} (Salinan)`);
    expect(dup1.draft.studio?.editorStatus).toBe('IN_PROGRESS');
    expect(dup1.draft.studio?.content).toEqual(withStudio.draft.studio?.content);
    expect(dup1.state.documents).toHaveLength(2);
    expect(dup1.state.intakeDrafts).toHaveLength(2);

    // Duplikasi kedua terhadap hasil salinan menghasilkan indeks berurutan rapi (Salinan 2)
    const dup2 = duplicateDraftInState(
      dup1.state,
      { draftId: dup1.draft.id },
      { timestamp: '2026-11-16T09:05:00Z' }
    );
    expect(dup2.draft.title).toBe(`${withStudio.draft.title} (Salinan 2)`);
    expect(dup2.state.documents).toHaveLength(3);
    expect(dup2.state.intakeDrafts).toHaveLength(3);

    // Master & jadwal resmi tetap tidak berubah
    expect(dup2.state.teachers).toEqual(demo.teachers);
    expect(dup2.state.activeSchedule).toEqual(demo.activeSchedule);
  });

  it('2. duplicateDraftInState menolak parameter kosong atau draft yang tidak ada', () => {
    const demo = createDemoState();
    expect(() => duplicateDraftInState(demo, {})).toThrow(/wajib diisi/i);
    expect(() => duplicateDraftInState(demo, { draftId: 'INTK-MISSING' })).toThrow(/tidak ditemukan/i);
  });

  it('3. Draft hasil duplikasi S03+S04 tetap lolos backup JSON & .signal ber-SHA-256', async () => {
    const demo = createDemoState();
    const tpl01 = SYSTEM_DOCUMENT_TEMPLATES[0];

    const saved = saveIntakeDraftToState(
      demo,
      tpl01,
      {
        peserta: [demo.teachers[0].id],
        nama_kegiatan: 'Lokakarya Evaluasi',
        penyelenggara: 'Madrasah',
        tanggal_mulai: '2026-12-08',
        tanggal_selesai: '2026-12-08',
        lokasi: 'Ruang Meeting',
        documentDate: '2026-11-16',
      },
      { timestamp: '2026-11-16T09:30:00Z' }
    );

    const dup = duplicateDraftInState(
      saved.state,
      { draftId: saved.draft.id },
      { timestamp: '2026-11-16T09:40:00Z' }
    );

    const backup = await buildBackupEnvelope(dup.state);
    const parsedBackup = await parseBackupContent(JSON.stringify(backup));
    expect(parsedBackup.verification).toBe('verified');
    expect(parsedBackup.state.intakeDrafts).toHaveLength(2);
    expect(parsedBackup.state.documents).toHaveLength(2);

    const seal = await buildSignalContainer(dup.state, []);
    const parsedSeal = await parseSignalContent(JSON.stringify(seal));
    expect(parsedSeal.verification).toBe('verified');
    expect(parsedSeal.state.intakeDrafts).toHaveLength(2);
  });

  it('4. S04 DocumentStudio merender penghitung kata/karakter, Susun Ulang Snapshot, dan menjaga batas Tahap 5', () => {
    const demo = createDemoState();
    const tpl01 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-01')!;
    const ahmad = demo.teachers.find((t) => Boolean(t.nip));

    const saved = saveIntakeDraftToState(
      demo,
      tpl01,
      {
        peserta: [demo.teachers[0].id],
        nama_kegiatan: 'Koordinasi MGMP',
        penyelenggara: 'Kemenag',
        tanggal_mulai: '2026-12-11',
        tanggal_selesai: '2026-12-11',
        lokasi: 'Aula Madrasah',
        documentDate: '2026-11-16',
      },
      { timestamp: '2026-11-16T10:00:00Z' }
    );

    const studioHtml = renderToStaticMarkup(
      createElement(DocumentStudio, {
        state: saved.state,
        draft: saved.draft,
        onPersistStudioState: () => {},
        onDeleteDraft: () => {},
        onBackToIntake: () => {},
        onBackToCenter: () => {},
      })
    );

    expect(studioHtml).toContain('kata');
    expect(studioHtml).toContain('karakter');
    expect(studioHtml).toContain('Susun Ulang dari Snapshot S03');
    expect(studioHtml).not.toContain('Terbitkan Nomor');
    expect(studioHtml).not.toContain('Finalisasi Dokumen');

    const s01Html = renderToStaticMarkup(
      createElement(CorrespondenceCenter, {
        state: saved.state,
        onOpenStudio: () => {},
        onEditIntakeDraft: () => {},
        onDuplicateDraft: () => {},
        onDeleteDraft: () => {},
      })
    );
    expect(s01Html).toContain('s5-action-dock');
    if (ahmad?.nip) {
      expect(s01Html).not.toContain(ahmad.nip);
    }

    const s02Html = renderToStaticMarkup(createElement(TemplateGallery, { state: demo }));
    expect(s02Html).toContain('Cari template surat');

    const wsHtml = renderToStaticMarkup(
      createElement(PersuratanWorkspace, {
        state: saved.state,
        initialView: 'studio',
        initialDraftId: saved.draft.id,
      })
    );
    expect(wsHtml).toContain('Susun Ulang dari Snapshot S03');
  });
});
