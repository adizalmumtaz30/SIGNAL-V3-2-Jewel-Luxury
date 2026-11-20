import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createDemoState } from '../src/domain/seed';
import type { AppState } from '../src/domain/types';
import { SYSTEM_DOCUMENT_TEMPLATES } from '../src/domain/persuratan/templates/registry';
import { getIntakeSchemaForTemplate } from '../src/domain/persuratan/intake/schemaRegistry';
import {
  createInitialIntakeFormValues,
  saveIntakeDraftToState,
} from '../src/domain/persuratan/intake/draftEngine';
import { buildInitialStudioContentFromDraft } from '../src/domain/persuratan/studio/contentGenerator';
import { PersuratanWorkspace } from '../src/components/persuratan/PersuratanWorkspace';
import { TemplateGallery } from '../src/components/persuratan/TemplateGallery';
import { DocumentIntakeForm } from '../src/components/persuratan/DocumentIntakeForm';
import { DocumentStudio } from '../src/components/persuratan/DocumentStudio';
import { FinalizationSlideDrawer } from '../src/components/persuratan/FinalizationSlideDrawer';
import { CorrespondenceCenter } from '../src/components/persuratan/CorrespondenceCenter';
import { DocumentPreviewFinalize } from '../src/components/persuratan/DocumentPreviewFinalize';
import { DocumentArchiveDetail } from '../src/components/persuratan/DocumentArchiveDetail';
import { TemplateManager } from '../src/components/persuratan/TemplateManager';
import { finalizeDocumentTransaction } from '../src/domain/persuratan/finalization/finalizeEngine';

function makeDraftForTemplate(state: AppState, templateId: string) {
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
      filled[ctrl.key] = `Isian uji ${ctrl.label}`;
    }
  }

  return saveIntakeDraftToState(state, tpl, filled, {
    timestamp: '2026-11-24T08:00:00.000Z',
  });
}

describe('Phase 18 — To-Be Figma Pro Golden Flow UX & Architecture', () => {
  it('1. Unified 2-Tab Subnav + Utility Kelola Template + Clickable Creation Stepper without duplicate tabs', () => {
    const demo = createDemoState();
    const saved = makeDraftForTemplate(demo, 'SYS-TPL-07');

    // Browse view: 2 primary tabs inside .s02-subnav-tabs, Kelola Template is quiet utility on right
    const browseHtml = renderToStaticMarkup(
      createElement(PersuratanWorkspace, {
        state: saved.state,
        initialView: 'center',
      })
    );
    expect(browseHtml).toContain('Arsip &amp; Surat');
    expect(browseHtml).toContain('Galeri Template');
    expect(browseHtml).toContain('s02-subnav-util-btn');
    expect(browseHtml).toContain('Kelola Template');

    // Studio view: clickable stepper (p5-step-btn) lets user jump back to Step 1 or forward to Step 3 cleanly
    const studioHtml = renderToStaticMarkup(
      createElement(PersuratanWorkspace, {
        state: saved.state,
        launchRequest: {
          view: 'studio',
          draftId: saved.draft.id,
          nonce: 1801,
        },
        onPersistState: async () => {},
      })
    );
    expect(studioHtml).toContain('p5-step-trail');
    expect(studioHtml).toContain('p5-step-btn');
    expect(studioHtml).toContain('1. Data Surat');
    expect(studioHtml).toContain('2. Editor Naskah');
    expect(studioHtml).toContain('3. Pratinjau &amp; Sahkan');
    // Duplicate Kelola Template tab is hidden during creation flow to maximize focus
    expect(studioHtml).not.toContain('s02-subnav-util-btn');
  });

  it('2. TemplateGallery cards are decluttered (1-click Pakai + click card to preview) & DocumentIntakeForm shows proactive Kop readiness quick-fill', () => {
    const demo = createDemoState();
    const galleryHtml = renderToStaticMarkup(
      createElement(TemplateGallery, {
        state: demo,
        onUseTemplate: () => {},
        onOpenTemplateManager: () => {},
      })
    );
    expect(galleryHtml).toContain('s02-card-use-btn');
    expect(galleryHtml).toContain('Pakai');
    // Card-level duplicate Pratinjau button removed
    expect(galleryHtml).not.toContain('is-previewing');

    // Missing schoolName / headmasterName triggers proactive Kop readiness banner at Stage 1
    const incompleteSettingsState = {
      ...demo,
      settings: {
        ...demo.settings,
        schoolName: '',
        headmasterName: '',
      },
    };
    const tpl07 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-07')!;
    const intakeHtml = renderToStaticMarkup(
      createElement(DocumentIntakeForm, {
        state: incompleteSettingsState,
        template: tpl07,
        onSaveDraft: () => {},
        onPersistState: async () => {},
        onOpenStudio: () => {},
        onBackToTemplates: () => {},
        onOpenCenter: () => {},
      })
    );
    expect(intakeHtml).toContain('s03-readiness-card');
    expect(intakeHtml).toContain('Identitas &amp; Penandatangan Madrasah belum lengkap');
    expect(intakeHtml).toContain('Lengkapi Identitas Sekarang');
    expect(intakeHtml).toContain('Sunting Bebas');
  });

  it('3. DocumentStudio keeps single focal Sahkan & Terbitkan CTA in header (not repeated in footer) and FinalizationSlideDrawer elevates Download/Print first', () => {
    const demo = createDemoState();
    const saved = makeDraftForTemplate(demo, 'SYS-TPL-07');
    const studioBuilt = buildInitialStudioContentFromDraft(saved.draft, {
      activeTemplates: SYSTEM_DOCUMENT_TEMPLATES,
    });

    const studioHtml = renderToStaticMarkup(
      createElement(DocumentStudio, {
        state: saved.state,
        draft: saved.draft,
        onPersistStudioState: () => {},
        onPersistState: async () => {},
        onFinalizedToArchive: () => {},
        onBackToIntake: () => {},
        onBackToCenter: () => {},
      })
    );
    const matches = studioHtml.match(/Sahkan &amp; Terbitkan/g) ?? [];
    expect(matches.length).toBe(1);

    const drawerHtml = renderToStaticMarkup(
      createElement(FinalizationSlideDrawer, {
        open: true,
        state: saved.state,
        draft: saved.draft,
        content: studioBuilt.content,
        pageSettings: studioBuilt.pageSettings,
        onClose: () => {},
        onPersistState: async () => {},
        onFinalized: () => {},
      })
    );
    expect(drawerHtml).toContain('fsd-primary-btn');
    expect(drawerHtml).toContain('Terbitkan &amp; Unduh PDF');
    expect(drawerHtml).toContain('fsd-primary-outline-btn');
    expect(drawerHtml).toContain('Terbitkan &amp; Cetak');
    expect(drawerHtml).toContain('fsd-archive-only-btn');
    // Download & Print buttons precede Archive-only fallback button in DOM order
    expect(drawerHtml.indexOf('Terbitkan &amp; Unduh PDF')).toBeLessThan(
      drawerHtml.indexOf('Sahkan &amp; Terbitkan PDF Resmi')
    );
  });

  it('4. CorrespondenceCenter removes redundant Ringkasan button on finalized archive rows while keeping Buka Arsip & PDF', async () => {
    const demo = createDemoState();
    const saved = makeDraftForTemplate(demo, 'SYS-TPL-07');
    const studioBuilt = buildInitialStudioContentFromDraft(saved.draft, {
      activeTemplates: SYSTEM_DOCUMENT_TEMPLATES,
    });
    const finalized = await finalizeDocumentTransaction({
      state: saved.state,
      draft: saved.draft,
      content: studioBuilt.content,
      pageSettings: studioBuilt.pageSettings,
      documentNumber: '099/MTs.DAH/XI/2026',
      numberingMode: 'MANUAL',
      demoAcknowledged: true,
    });

    const centerHtml = renderToStaticMarkup(
      createElement(CorrespondenceCenter, {
        state: finalized.state,
        onOpenArchiveDetail: () => {},
      })
    );
    expect(centerHtml).toContain('Buka Arsip &amp; PDF');
    expect(centerHtml).not.toContain('<span>Ringkasan</span>');
  });

  it('5. Enforces 6 Redesign Pillars: Live Composer switch, Proactive Schedule Blocker, Split Finalize CTA, Nav separation, and Human Copy', async () => {
    const demo = createDemoState();
    const saved = makeDraftForTemplate(demo, 'SYS-TPL-07');
    const studioBuilt = buildInitialStudioContentFromDraft(saved.draft, {
      activeTemplates: SYSTEM_DOCUMENT_TEMPLATES,
    });

    // Pillar 1: Live Paper Composer mode switch between Form Terstruktur and Kanvas Naskah Bebas
    const intakeHtml = renderToStaticMarkup(
      createElement(DocumentIntakeForm, {
        state: saved.state,
        template: SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-07')!,
        existingDraft: saved.draft,
        onSaveDraft: () => {},
        onPersistState: async () => {},
        onOpenStudio: () => {},
        onBackToTemplates: () => {},
        onOpenCenter: () => {},
      })
    );
    expect(intakeHtml).toContain('s03-composer-switch');
    expect(intakeHtml).toContain('Form Terstruktur');
    expect(intakeHtml).toContain('Kanvas Naskah · Sunting Bebas');

    const studioHtml = renderToStaticMarkup(
      createElement(DocumentStudio, {
        state: saved.state,
        draft: saved.draft,
        onPersistStudioState: () => {},
        onPersistState: async () => {},
        onFinalizedToArchive: () => {},
        onBackToIntake: () => {},
        onBackToCenter: () => {},
      })
    );
    expect(studioHtml).toContain('s04-composer-switch');
    expect(studioHtml).toContain('Kanvas Naskah Bebas');

    // Pillar 5: Proactive Schedule Blocker on SYS-TPL-03 when history is empty, plus CorrespondenceCenter readiness banner
    const noScheduleState: AppState = {
      ...demo,
      history: [],
    };
    const tpl03 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-03')!;
    const intakeScheduleBlockerHtml = renderToStaticMarkup(
      createElement(DocumentIntakeForm, {
        state: noScheduleState,
        template: tpl03,
        onSaveDraft: () => {},
        onPersistState: async () => {},
        onOpenStudio: () => {},
        onBackToTemplates: () => {},
        onOpenCenter: () => {},
      })
    );
    expect(intakeScheduleBlockerHtml).toContain('s03-readiness-card is-blocker');
    expect(intakeScheduleBlockerHtml).toContain('Belum ada Versi Jadwal Resmi yang diterbitkan');

    const incompleteCenterHtml = renderToStaticMarkup(
      createElement(CorrespondenceCenter, {
        state: {
          ...demo,
          settings: { ...demo.settings, schoolName: '', headmasterName: '' },
        },
        onOpenSettings: () => {},
      })
    );
    expect(incompleteCenterHtml).toContain('Kop Surat &amp; Nama Kepala Madrasah belum lengkap');
    expect(incompleteCenterHtml).toContain('Lengkapi Identitas');

    // Pillar 2, 3 & 6: DocumentPreviewFinalize Split Primary Action after finalizing & clean copy
    const finalized = await finalizeDocumentTransaction({
      state: saved.state,
      draft: saved.draft,
      content: studioBuilt.content,
      pageSettings: studioBuilt.pageSettings,
      documentNumber: '101/MTs.DAH/XI/2026',
      numberingMode: 'MANUAL',
      demoAcknowledged: true,
    });
    const docRecord = finalized.state.documents!.find((d) => d.id === saved.draft.documentId)!;
    const previewLockedHtml = renderToStaticMarkup(
      createElement(DocumentPreviewFinalize, {
        state: finalized.state,
        draft: saved.draft,
        documentRecord: docRecord,
        activeVersion: finalized.documentVersion,
        onPersistState: async () => {},
        onFinalizedToArchive: () => {},
        onBackToStudio: () => {},
        onBackToIntake: () => {},
        onBackToCenter: () => {},
      })
    );
    expect(previewLockedHtml).toContain('s05-split-cta-group');
    expect(previewLockedHtml).toContain('Unduh PDF Final');
    expect(previewLockedHtml).toContain('Cetak');
    expect(previewLockedHtml).not.toContain('Simulasi Tampilan S05');
    expect(previewLockedHtml).not.toContain('Snapshot Naskah Resmi');

    // Pillar 4 & 6: PersuratanWorkspace separates Galeri Template from Kelola Template, and clean copy in ArchiveDetail & TemplateManager
    const tmWorkspaceHtml = renderToStaticMarkup(
      createElement(PersuratanWorkspace, {
        state: finalized.state,
        launchRequest: { view: 'template-manager', nonce: 1802 },
        onPersistState: async () => {},
      })
    );
    expect(tmWorkspaceHtml).toContain('PENGATURAN TEMPLATE · FORMAT NASKAH');
    expect(tmWorkspaceHtml).toContain('s02-subnav-util-btn is-active');
    expect(tmWorkspaceHtml).not.toContain('Gunakan di S03');

    const tmHtml = renderToStaticMarkup(
      createElement(TemplateManager, {
        state: finalized.state,
        onPersistState: async () => {},
        onBackToGallery: () => {},
        onUseTemplate: () => {},
      })
    );
    expect(tmHtml).toContain('Pakai Template Ini');
    expect(tmHtml).not.toContain('Gunakan di S03');

    const archiveDetailHtml = renderToStaticMarkup(
      createElement(DocumentArchiveDetail, {
        state: finalized.state,
        documentId: docRecord.id,
        onPersistState: async () => {},
        onBackToCenter: () => {},
      })
    );
    expect(archiveDetailHtml).toContain('Naskah Resmi Versi');
    expect(archiveDetailHtml).not.toContain('Snapshot Naskah Resmi');
    expect(archiveDetailHtml).not.toContain('Magic Bytes');
  });
});
