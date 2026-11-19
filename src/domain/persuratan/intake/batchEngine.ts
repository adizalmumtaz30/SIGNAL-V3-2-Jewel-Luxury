import type { AppState } from '../../types';
import type { DocumentRecord } from '../types';
import type { DocumentTemplate } from '../templates/types';
import type { IntakeFormValues } from './types';
import { getIntakeSchemaForTemplate } from './schemaRegistry';
import { saveIntakeDraftToState, saveStudioDraftToState } from './draftEngine';
import { buildInitialStudioContentFromDraft } from '../studio/contentGenerator';
import { computeNextSequentialNumber } from '../finalization/numberingEngine';
import { finalizeDocumentTransaction } from '../finalization/finalizeEngine';
import type { FinalPdfStorageAdapter } from '../finalization/finalPdfStore';
import { collectAllTemplates } from '../templates/selectors';

export interface BatchRecipientItem {
  id: string;
  label: string;
  teacherId?: string;
  secondaryValue?: string; // e.g. NISN / Kelas / Jabatan
}

export interface BatchIssueResult {
  state: AppState;
  createdCount: number;
  finalizedCount: number;
  createdDocuments: DocumentRecord[];
  assignedNumbers: string[];
  errors: Array<{ recipientLabel: string; message: string }>;
}

/**
 * Mem-parsing teks daftar penerima (satu baris satu nama; opsional pisah dengan `|` untuk NISN/Jabatan).
 */
export function parseManualRecipientsText(rawText: string): BatchRecipientItem[] {
  const lines = (rawText ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line, idx) => {
    const [primary, secondary] = line.split('|').map((p) => p.trim());
    return {
      id: `manual-${idx + 1}`,
      label: primary || line,
      ...(secondary ? { secondaryValue: secondary } : {}),
    };
  });
}

function applyRecipientToIntakeValues(
  template: DocumentTemplate,
  baseValues: IntakeFormValues,
  recipient: BatchRecipientItem
): IntakeFormValues {
  const schema = getIntakeSchemaForTemplate(template);
  const next: IntakeFormValues = { ...baseValues };

  const baseTitle =
    typeof baseValues.documentTitle === 'string' && baseValues.documentTitle.trim()
      ? baseValues.documentTitle.trim()
      : template.name;

  next.documentTitle = `${baseTitle} — ${recipient.label}`;

  if (recipient.teacherId) {
    const teacherMulti = schema.controls.find((c) => c.controlType === 'teacher_multi_select');
    const teacherSingle = schema.controls.find((c) => c.controlType === 'teacher_single_select');
    if (teacherMulti) {
      next[teacherMulti.key] = [recipient.teacherId];
    } else if (teacherSingle) {
      next[teacherSingle.key] = recipient.teacherId;
    } else {
      next.pihak_tujuan = recipient.label;
      next.kepada = recipient.label;
    }
    return next;
  }

  // Manual recipient (siswa / pihak luar / penerima undangan / subjek rekomendasi)
  const preferredKeys = [
    'nama_siswa',
    'kepada',
    'pihak_tujuan',
    'penerima',
    'instansi_tujuan',
    'subjek_rekomendasi',
    'sasaran',
  ];

  let applied = false;
  for (const key of preferredKeys) {
    if (schema.controls.some((c) => c.key === key)) {
      next[key] = recipient.label;
      applied = true;
      break;
    }
  }
  if (!applied) {
    const firstText = schema.controls.find(
      (c) => c.controlType === 'text' && c.key !== 'documentTitle'
    );
    if (firstText) {
      next[firstText.key] = recipient.label;
    }
  }

  if (recipient.secondaryValue) {
    if (schema.controls.some((c) => c.key === 'nisn')) {
      next.nisn = recipient.secondaryValue;
    } else if (schema.controls.some((c) => c.key === 'ttl_siswa') && !next.ttl_siswa) {
      next.ttl_siswa = recipient.secondaryValue;
    }
  }

  return next;
}

/**
 * Menerbitkan paket surat massal (Mail Merge) dari satu template + daftar penerima.
 * - Mode DRAFT: membuat draft S03 + kanvas naskah siap buka untuk masing-masing penerima.
 * - Mode FINALIZE: menerbitkan & mengesahkan setiap surat dengan nomor urut unik berurutan + PDF SHA-256.
 */
export async function generateBatchDocumentsInState(params: {
  state: AppState;
  template: DocumentTemplate;
  baseValues: IntakeFormValues;
  recipients: BatchRecipientItem[];
  finalizeImmediately?: boolean;
  demoAcknowledged?: boolean;
  timestamp?: string;
  pdfStoreOverride?: FinalPdfStorageAdapter;
}): Promise<BatchIssueResult> {
  const {
    template,
    baseValues,
    recipients,
    finalizeImmediately = false,
    demoAcknowledged = false,
    timestamp = new Date().toISOString(),
    pdfStoreOverride,
  } = params;

  if (!recipients || recipients.length === 0) {
    throw new Error('Pilih minimal satu penerima untuk penerbitan surat massal.');
  }

  let workingState = params.state;
  const activeTemplates = collectAllTemplates(workingState.customTemplates ?? []);
  const createdDocuments: DocumentRecord[] = [];
  const assignedNumbers: string[] = [];
  const errors: Array<{ recipientLabel: string; message: string }> = [];
  let finalizedCount = 0;

  for (let i = 0; i < recipients.length; i += 1) {
    const recipient = recipients[i];
    const perValues = applyRecipientToIntakeValues(template, baseValues, recipient);

    try {
      const saved = saveIntakeDraftToState(workingState, template, perValues, {
        timestamp,
      });
      workingState = saved.state;

      const built = buildInitialStudioContentFromDraft(saved.draft, {
        activeTemplates,
      });

      const withStudio = saveStudioDraftToState(
        workingState,
        saved.draft.id,
        {
          schemaVersion: 1,
          editorStatus: 'IN_PROGRESS',
          content: built.content,
          pageSettings: built.pageSettings,
          updatedAt: timestamp,
        },
        { timestamp }
      );
      workingState = withStudio.state;

      if (finalizeImmediately) {
        const nextNum = computeNextSequentialNumber({
          state: workingState,
          kind: withStudio.draft.templateSnapshot.documentKind,
          documentDate: withStudio.draft.documentDate,
          excludeDocumentId: withStudio.draft.documentId,
        });
        const fin = await finalizeDocumentTransaction({
          state: workingState,
          draft: withStudio.draft,
          content: built.content,
          pageSettings: built.pageSettings,
          documentNumber: nextNum.suggestedNumber,
          numberingMode: 'AUTO',
          demoAcknowledged,
          timestamp,
          storageAdapter: pdfStoreOverride,
        });
        workingState = fin.state;
        createdDocuments.push(fin.documentRecord);
        assignedNumbers.push(fin.documentVersion.documentNumber);
        finalizedCount += 1;
      } else {
        createdDocuments.push(withStudio.documentRecord);
      }
    } catch (err) {
      errors.push({
        recipientLabel: recipient.label,
        message: err instanceof Error ? err.message : 'Gagal membuat dokumen untuk penerima ini.',
      });
    }
  }

  return {
    state: workingState,
    createdCount: createdDocuments.length,
    finalizedCount,
    createdDocuments,
    assignedNumbers,
    errors,
  };
}
