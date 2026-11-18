import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CorrespondenceCenter } from '../src/components/persuratan/CorrespondenceCenter';
import { TemplateGallery } from '../src/components/persuratan/TemplateGallery';
import { DocumentIntakeForm } from '../src/components/persuratan/DocumentIntakeForm';
import { DocumentStudio } from '../src/components/persuratan/DocumentStudio';
import { PersuratanWorkspace } from '../src/components/persuratan/PersuratanWorkspace';
import { createDemoState } from '../src/domain/seed';
import type { AppState } from '../src/domain/types';
import { SYSTEM_DOCUMENT_TEMPLATES } from '../src/domain/persuratan/templates/registry';
import {
  deleteDraftFromState,
  saveIntakeDraftToState,
  saveStudioDraftToState,
} from '../src/domain/persuratan/intake/draftEngine';
import { buildInitialStudioContentFromDraft } from '../src/domain/persuratan/studio/contentGenerator';
import { buildBackupEnvelope, parseBackupContent } from '../src/storage/db';
import { buildSignalContainer, parseSignalContent } from '../src/storage/snapshotEngine';

describe('Paket 2 — Modernisasi Pola Interaksi Figma Pro & Hapus Draft Aman', () => {
  it('1. deleteDraftFromState menghapus draft S03+S04+DocumentRecord berstatus DRAFT tanpa merusak data lain', () => {
    const demo = createDemoState();
    const tpl01 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-01')!;

    const first = saveIntakeDraftToState(
      demo,
      tpl01,
      {
        peserta: [demo.teachers[0].id],
        nama_kegiatan: 'Workshop KKM',
        penyelenggara: 'Kemenag Kab',
        tanggal_mulai: '2026-12-01',
        tanggal_selesai: '2026-12-02',
        lokasi: 'Aula Utama',
        documentDate: '2026-11-16',
      },
      { timestamp: '2026-11-16T08:00:00Z' }
    );

    const second = saveIntakeDraftToState(
      first.state,
      tpl01,
      {
        peserta: [demo.teachers[1].id],
        nama_kegiatan: 'Rapat Kurikulum',
        penyelenggara: 'Madrasah',
        tanggal_mulai: '2026-12-10',
        tanggal_selesai: '2026-12-10',
        lokasi: 'Ruang Guru',
        documentDate: '2026-11-16',
      },
      { timestamp: '2026-11-16T09:00:00Z' }
    );

    const studioContent = buildInitialStudioContentFromDraft(first.draft);
    const withStudio = saveStudioDraftToState(
      second.state,
      first.draft.id,
      {
        schemaVersion: 1,
        editorStatus: 'IN_PROGRESS',
        content: studioContent.content,
        pageSettings: studioContent.pageSettings,
        updatedAt: '2026-11-16T09:15:00Z',
      },
      { timestamp: '2026-11-16T09:15:00Z' }
    );

    expect(withStudio.state.documents).toHaveLength(2);
    expect(withStudio.state.intakeDrafts).toHaveLength(2);

    const afterDelete = deleteDraftFromState(withStudio.state, {
      draftId: first.draft.id,
      documentId: first.documentRecord.id,
    });

    expect(afterDelete.deletedDraftId).toBe(first.draft.id);
    expect(afterDelete.deletedDocumentId).toBe(first.documentRecord.id);
    expect(afterDelete.state.documents).toHaveLength(1);
    expect(afterDelete.state.intakeDrafts).toHaveLength(1);
    expect(afterDelete.state.documents![0].id).toBe(second.documentRecord.id);
    expect(afterDelete.state.intakeDrafts![0].id).toBe(second.draft.id);
    // Data master & jadwal tetap utuh
    expect(afterDelete.state.teachers).toEqual(demo.teachers);
    expect(afterDelete.state.activeSchedule).toEqual(demo.activeSchedule);
  });

  it('2. deleteDraftFromState menolak penghapusan dokumen FINAL, ARCHIVED, RECEIVED, atau yang sudah bernomor', () => {
    const demo = createDemoState();
    const stateWithFinal: AppState = {
      ...demo,
      documents: [
        {
          id: 'DOC-FINAL-1',
          direction: 'OUTGOING',
          documentType: 'SURAT_KELUAR',
          documentNumber: '005/MTs/XI/2026',
          title: 'Surat Resmi Terbit',
          subject: 'Undangan Resmi',
          documentDate: '2026-11-16',
          status: 'FINAL',
          createdAt: '2026-11-16T08:00:00Z',
          updatedAt: '2026-11-16T08:00:00Z',
          archivedAt: null,
        },
        {
          id: 'DOC-NUMBERED-DRAFT',
          direction: 'OUTGOING',
          documentType: 'SURAT_KELUAR',
          documentNumber: '006/MTs/XI/2026',
          title: 'Draft Bernomor',
          subject: 'Pengujian',
          documentDate: '2026-11-16',
          status: 'DRAFT',
          createdAt: '2026-11-16T08:00:00Z',
          updatedAt: '2026-11-16T08:00:00Z',
          archivedAt: null,
        },
      ],
    };

    expect(() => deleteDraftFromState(stateWithFinal, { documentId: 'DOC-FINAL-1' })).toThrow(
      /DRAFT yang belum bernomor/i
    );
    expect(() =>
      deleteDraftFromState(stateWithFinal, { documentId: 'DOC-NUMBERED-DRAFT' })
    ).toThrow(/DRAFT yang belum bernomor/i);
    expect(() => deleteDraftFromState(stateWithFinal, { documentId: 'DOC-MISSING' })).toThrow(
      /tidak ditemukan/i
    );
  });

  it('3. State setelah penghapusan draft tetap lolos backup JSON & .signal ber-SHA-256', async () => {
    const demo = createDemoState();
    const tpl01 = SYSTEM_DOCUMENT_TEMPLATES[0];
    const saved = saveIntakeDraftToState(
      demo,
      tpl01,
      {
        peserta: [demo.teachers[0].id],
        nama_kegiatan: 'Simposium Guru',
        penyelenggara: 'Kanwil',
        tanggal_mulai: '2026-12-01',
        tanggal_selesai: '2026-12-01',
        lokasi: 'Hotel Merpati',
        documentDate: '2026-11-16',
      },
      { timestamp: '2026-11-16T10:00:00Z' }
    );

    const cleaned = deleteDraftFromState(saved.state, {
      draftId: saved.draft.id,
      documentId: saved.documentRecord.id,
    });

    const backup = await buildBackupEnvelope(cleaned.state);
    const parsedBackup = await parseBackupContent(JSON.stringify(backup));
    expect(parsedBackup.verification).toBe('verified');
    expect(parsedBackup.state.documents).toEqual([]);
    expect(parsedBackup.state.intakeDrafts).toEqual([]);

    const signalArchive = await buildSignalContainer(cleaned.state, []);
    const parsedSignal = await parseSignalContent(JSON.stringify(signalArchive));
    expect(parsedSignal.verification).toBe('verified');
    expect(parsedSignal.state.documents).toEqual([]);
    expect(parsedSignal.state.intakeDrafts).toEqual([]);
  });

  it('4. S01 Adaptive Action Dock, S02 Simplified Cards, S03 2-Card Panel + Progress Bar, dan S04 Delete Trigger ter-render rapi tanpa bocor NIP', () => {
    const demo = createDemoState();
    const tpl01 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-01')!;
    const ahmad = demo.teachers.find((t) => Boolean(t.nip));

    const saved = saveIntakeDraftToState(
      demo,
      tpl01,
      {
        peserta: [demo.teachers[0].id],
        nama_kegiatan: 'Rapat Koordinasi',
        penyelenggara: 'Madrasah',
        tanggal_mulai: '2026-12-03',
        tanggal_selesai: '2026-12-03',
        lokasi: 'Ruang Rapat',
        documentDate: '2026-11-16',
      },
      { timestamp: '2026-11-16T10:30:00Z' }
    );

    // S01 Adaptive Action Dock + Zero NIP leakage
    const s01Html = renderToStaticMarkup(
      createElement(CorrespondenceCenter, {
        state: saved.state,
        onOpenStudio: () => {},
        onEditIntakeDraft: () => {},
        onDeleteDraft: () => {},
      })
    );
    expect(s01Html).toContain('s5-action-dock');
    expect(s01Html).toContain('Buka Naskah');
    expect(s01Html).toContain('Detail');
    expect(s01Html).toContain('Aksi lainnya untuk');
    if (ahmad?.nip) {
      expect(s01Html).not.toContain(ahmad.nip);
    }

    // S02 Simplified Template Cards + Above-the-fold CTA + Disclosure
    const s02Html = renderToStaticMarkup(createElement(TemplateGallery, { state: demo }));
    expect(s02Html).toContain('s02-preview-cta-row');
    expect(s02Html).toContain('s02-specs-disclosure');
    expect(s02Html).toContain('Rincian Data &amp; Format Kertas');
    expect(s02Html).not.toContain('s02-card-specs');

    // S03 Consolidated 2-card right panel + progress bar + Hapus Draft
    const s03Html = renderToStaticMarkup(
      createElement(DocumentIntakeForm, {
        state: saved.state,
        template: tpl01,
        existingDraft: saved.draft,
        onSaveDraft: () => {},
        onOpenStudio: () => {},
        onDeleteDraft: () => {},
        onBackToTemplates: () => {},
        onOpenCenter: () => {},
      })
    );
    expect(s03Html).toContain('Sumber Data Sistem');
    expect(s03Html).toContain('Konteks &amp; Peserta Terpilih');
    expect(s03Html).toContain('role="progressbar"');
    expect(s03Html).toContain('Hapus Draft');

    // S04 Studio Delete Draft button
    const s04Html = renderToStaticMarkup(
      createElement(DocumentStudio, {
        state: saved.state,
        draft: saved.draft,
        onPersistStudioState: () => {},
        onDeleteDraft: () => {},
        onBackToIntake: () => {},
        onBackToCenter: () => {},
      })
    );
    expect(s04Html).toContain('Hapus Draft');

    // PersuratanWorkspace integration check
    const workspaceHtml = renderToStaticMarkup(
      createElement(PersuratanWorkspace, {
        state: saved.state,
        initialView: 'center',
      })
    );
    expect(workspaceHtml).toContain('s5-action-dock');
  });
});
