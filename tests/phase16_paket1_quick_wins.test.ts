import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CorrespondenceCenter } from '../src/components/persuratan/CorrespondenceCenter';
import { DocumentArchiveDetail } from '../src/components/persuratan/DocumentArchiveDetail';
import { DocumentIntakeForm } from '../src/components/persuratan/DocumentIntakeForm';
import { DocumentStudio } from '../src/components/persuratan/DocumentStudio';
import { FinalizationSlideDrawer } from '../src/components/persuratan/FinalizationSlideDrawer';
import { cloneOfficialDocumentToNewDraft } from '../src/domain/persuratan/archive/archiveEngine';
import { finalizeDocumentTransaction } from '../src/domain/persuratan/finalization/finalizeEngine';
import { renderOfficialDocumentPdf } from '../src/domain/persuratan/finalization/pdfRenderer';
import {
  createInitialIntakeFormValues,
  saveIntakeDraftToState,
} from '../src/domain/persuratan/intake/draftEngine';
import { getIntakeSchemaForTemplate } from '../src/domain/persuratan/intake/schemaRegistry';
import { buildInitialStudioContentFromDraft } from '../src/domain/persuratan/studio/contentGenerator';
import { extractPlainTextAndTokens } from '../src/domain/persuratan/studio/contentValidation';
import { SYSTEM_DOCUMENT_TEMPLATES } from '../src/domain/persuratan/templates/registry';
import { createDemoState } from '../src/domain/seed';
import type { AppState } from '../src/domain/types';

function makeDraftForTemplate(
  state: AppState,
  templateId: string,
  overrides: Record<string, unknown> = {}
) {
  const tpl = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === templateId)!;
  const schema = getIntakeSchemaForTemplate(tpl);
  const base = createInitialIntakeFormValues(tpl, state);
  const activeTeachers = state.teachers.filter((t) => t.isActive);
  const teacherId = activeTeachers[0]?.id ?? state.teachers[0].id;
  const classId = state.classes.find((c) => c.isActive)?.id ?? state.classes[0].id;
  const subjectId = state.subjects.find((s) => s.isActive)?.id ?? state.subjects[0].id;

  const filled: Record<string, unknown> = {
    ...base,
    documentDate: '2026-11-24',
  };

  for (const ctrl of schema.controls) {
    if (ctrl.controlType === 'auto_system') continue;
    if (ctrl.required === false) continue;
    if (ctrl.controlType === 'date_range') {
      filled[ctrl.startKey ?? `${ctrl.key}_mulai`] = '2026-11-24';
      filled[ctrl.endKey ?? `${ctrl.key}_selesai`] = '2026-11-26';
    } else if (ctrl.controlType === 'date') {
      filled[ctrl.key] = '2026-11-25';
    } else if (ctrl.controlType === 'number') {
      filled[ctrl.key] = '24';
    } else if (ctrl.controlType === 'teacher_multi_select') {
      filled[ctrl.key] = [teacherId];
    } else if (ctrl.controlType === 'teacher_single_select') {
      filled[ctrl.key] = teacherId;
    } else if (ctrl.controlType === 'class_single_select') {
      filled[ctrl.key] = classId;
    } else if (ctrl.controlType === 'subject_single_select') {
      filled[ctrl.key] = subjectId;
    } else if (ctrl.controlType === 'schedule_version') {
      filled[ctrl.key] = filled[ctrl.key] || state.history[0]?.id || '';
    } else if (ctrl.controlType === 'select') {
      filled[ctrl.key] = ctrl.options?.[0]?.value ?? 'Ya';
    } else {
      filled[ctrl.key] = `Isian Uji ${ctrl.label}`;
    }
  }

  Object.assign(filled, overrides);
  const saved = saveIntakeDraftToState(state, tpl, filled, {
    timestamp: '2026-11-24T08:00:00.000Z',
  });
  return { tpl, ...saved };
}

describe('Phase 16 — Paket 1 Quick Wins & Hidden Features Wiring', () => {
  it('1. Fixes snapshot lookup mismatch on SYS-TPL-14 (class) and SYS-TPL-18 (subject)', () => {
    const demo = createDemoState();
    const targetClass = demo.classes.find((c) => c.isActive)!;
    const targetSubject = demo.subjects.find((s) => s.isActive)!;

    const tpl14 = makeDraftForTemplate(demo, 'SYS-TPL-14', {
      kelas: targetClass.id,
      rombel: targetClass.id,
    });
    const studio14 = buildInitialStudioContentFromDraft(tpl14.draft, {
      activeTemplates: SYSTEM_DOCUMENT_TEMPLATES,
    });
    const { plainText: text14 } = extractPlainTextAndTokens(studio14.content);
    expect(text14).toContain(targetClass.name);
    expect(text14).not.toContain('{{KELAS}}');

    const tpl18 = makeDraftForTemplate(demo, 'SYS-TPL-18', {
      mapel: targetSubject.id,
      mata_pelajaran: targetSubject.id,
    });
    const studio18 = buildInitialStudioContentFromDraft(tpl18.draft, {
      activeTemplates: SYSTEM_DOCUMENT_TEMPLATES,
    });
    const { plainText: text18 } = extractPlainTextAndTokens(studio18.content);
    expect(text18).toContain(targetSubject.name);
    expect(text18).not.toContain('{{MATA_PELAJARAN}}');
  });

  it('2. Supports a.n. and Plt. delegated signatures from S03 intake through PDF output', async () => {
    const demo = createDemoState();

    const anDraft = makeDraftForTemplate(demo, 'SYS-TPL-07', {
      penandatangan_mode: 'an',
      penandatangan_delegasi_jabatan: 'Wakil Kepala Bidang Kurikulum',
      penandatangan_delegasi_nama: 'Ust. Muhammad Ridwan, M.Pd.',
    });
    expect(anDraft.draft.fieldValues.penandatangan_mode).toBe('an');

    const anStudio = buildInitialStudioContentFromDraft(anDraft.draft, {
      activeTemplates: SYSTEM_DOCUMENT_TEMPLATES,
    });
    const { plainText: anText } = extractPlainTextAndTokens(anStudio.content);
    expect(anText).toContain('a.n. Kepala Madrasah');
    expect(anText).toContain('Wakil Kepala Bidang Kurikulum,');
    expect(anText).toContain('Ust. Muhammad Ridwan, M.Pd.');

    const pltDraft = makeDraftForTemplate(demo, 'SYS-TPL-01', {
      penandatangan_mode: 'plt',
      penandatangan_delegasi_nama: 'H. Sulaiman, S.Ag.',
    });
    const pltStudio = buildInitialStudioContentFromDraft(pltDraft.draft, {
      activeTemplates: SYSTEM_DOCUMENT_TEMPLATES,
    });
    const { plainText: pltText } = extractPlainTextAndTokens(pltStudio.content);
    expect(pltText).toContain('Plt. Kepala Madrasah,');
    expect(pltText).toContain('H. Sulaiman, S.Ag.');

    const pdf = await renderOfficialDocumentPdf({
      draft: anDraft.draft,
      content: anStudio.content,
      pageSettings: anStudio.pageSettings,
      state: anDraft.state,
      officialNumber: '011/UND/MTs.DAH/XI/2026',
    });
    expect(new TextDecoder().decode(pdf.pdfBytes.slice(0, 8)).startsWith('%PDF-')).toBe(true);

    const intakeHtml = renderToStaticMarkup(
      createElement(DocumentIntakeForm, {
        state: anDraft.state,
        template: anDraft.tpl,
        existingDraft: anDraft.draft,
        onSaveDraft: () => {},
        onBackToTemplates: () => {},
        onOpenCenter: () => {},
      })
    );
    expect(intakeHtml).toContain('Pejabat Penandatangan Naskah');
    expect(intakeHtml).toContain('a.n. Kepala Madrasah');
  });

  it('3. Renders Audit Tata Naskah Dinas and F4 215 x 330 mm in DocumentStudio SSR', () => {
    const demo = createDemoState();
    const { draft, state } = makeDraftForTemplate(demo, 'SYS-TPL-01');
    const studio = buildInitialStudioContentFromDraft(draft, {
      activeTemplates: SYSTEM_DOCUMENT_TEMPLATES,
    });
    const studioHtml = renderToStaticMarkup(
      createElement(DocumentStudio, {
        state,
        draft: {
          ...draft,
          studio: {
            schemaVersion: 1,
            editorStatus: 'IN_PROGRESS',
            content: studio.content,
            pageSettings: {
              ...studio.pageSettings,
              paperSize: 'f4',
            },
            updatedAt: '2026-11-24T09:00:00.000Z',
          },
        },
        onPersistStudioState: () => {},
        onBackToIntake: () => {},
        onBackToCenter: () => {},
      })
    );
    expect(studioHtml).toContain('Audit Tata Naskah Dinas');
    expect(studioHtml).toContain('5/5 lolos');
    expect(studioHtml).toContain('F4 / Folio (215 × 330 mm)');
  });

  it('4. Exposes Terbitkan Ulang Serupa and 1-Click Finalize + Download/Print actions cleanly', async () => {
    const demo = createDemoState();
    const { state, draft } = makeDraftForTemplate(demo, 'SYS-TPL-07');
    const studio = buildInitialStudioContentFromDraft(draft, {
      activeTemplates: SYSTEM_DOCUMENT_TEMPLATES,
    });

    const drawerHtml = renderToStaticMarkup(
      createElement(FinalizationSlideDrawer, {
        open: true,
        state,
        draft,
        content: studio.content,
        pageSettings: studio.pageSettings,
        onClose: () => {},
        onPersistState: async () => {},
        onFinalized: () => {},
      })
    );
    expect(drawerHtml).toContain('Sahkan &amp; Terbitkan PDF Resmi');
    expect(drawerHtml).toContain('Terbitkan &amp; Unduh PDF');
    expect(drawerHtml).toContain('Terbitkan &amp; Cetak');
    expect(drawerHtml).toContain('001/SK/MTs.DAH/XI/2026');

    const memStore = new Map<string, any>();
    const finalized = await finalizeDocumentTransaction({
      state,
      draft,
      content: studio.content,
      pageSettings: studio.pageSettings,
      documentNumber: '002/UND/MTs.DAH/XI/2026',
      numberingMode: 'AUTO',
      demoAcknowledged: true,
      timestamp: '2026-11-24T09:10:00.000Z',
      storageAdapter: {
        saveFinalPdf: async (rec) => {
          memStore.set(rec.storageKey, rec);
        },
        getFinalPdf: async (key) => memStore.get(key) ?? null,
      },
    });

    const detailHtml = renderToStaticMarkup(
      createElement(DocumentArchiveDetail, {
        state: finalized.state,
        documentId: finalized.documentRecord.id,
        onPersistState: async () => {},
        onBackToCenter: () => {},
        onCloneSimilar: async () => {},
      })
    );
    expect(detailHtml).toContain('Terbitkan Ulang Serupa');

    const cloned = cloneOfficialDocumentToNewDraft({
      state: finalized.state,
      documentId: finalized.documentRecord.id,
      versionId: finalized.documentVersion.id,
      todayIso: '2026-11-25',
    });
    expect(cloned.documentRecord.status).toBe('DRAFT');
    expect(cloned.documentRecord.documentNumber).toBeNull();
    const { plainText: clonedText } = extractPlainTextAndTokens(cloned.draft.studio!.content);
    expect(clonedText).toContain('{{NOMOR_SURAT}}');
    expect(clonedText).not.toContain('002/UND/MTs.DAH/XI/2026');

    // Also verify CorrespondenceCenter compiles and renders finalized document
    const centerHtml = renderToStaticMarkup(
      createElement(CorrespondenceCenter, {
        state: finalized.state,
        onCloneOfficial: async () => {},
      })
    );
    expect(centerHtml).toContain('002/UND/MTs.DAH/XI/2026');
  });
});
