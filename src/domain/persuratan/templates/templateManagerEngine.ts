import type { AppState } from '../../types';
import type { DocumentKind, TipTapJSONContent, TipTapJSONNode } from '../types';
import type {
  DocumentTemplate,
  TemplateCategory,
  TemplateFieldDefinition,
  TemplateOrientation,
  TemplatePaperSize,
  TemplatePreviewBlock,
  TemplateStatus,
} from './types';
import { SYSTEM_DOCUMENT_TEMPLATES } from './registry';
import {
  DEFAULT_TEMPLATE_PREFERENCES,
  VALID_TEMPLATE_CATEGORIES,
  collectAllTemplates,
  sanitizeTemplatePreferences,
} from './selectors';
import {
  createEmptyPiiReport,
  detectPotentialPiiWarningsInTemplate,
  sanitizePreviewBlocksForTemplate,
  sanitizeTextForReusableTemplate,
  type PiiSanitizationReport,
} from './piiSanitizer';

export interface TemplateValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
  detectedPlaceholders: string[];
}

const SYSTEM_ID_SET = new Set(SYSTEM_DOCUMENT_TEMPLATES.map((t) => t.id));

function collectStringsFromPreviewBlocks(blocks: TemplatePreviewBlock[]): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.type === 'heading' || b.type === 'paragraph') {
      out.push(b.text);
    } else if (b.type === 'meta_grid') {
      for (const r of b.rows) out.push(r.label, r.value);
    } else if (b.type === 'list') {
      out.push(...b.items);
    } else if (b.type === 'table') {
      out.push(...b.columns);
      for (const row of b.sampleRows) out.push(...row);
    } else if (b.type === 'signature') {
      if (b.leftTitle) out.push(b.leftTitle);
      if (b.leftName) out.push(b.leftName);
      out.push(b.rightTitle, b.rightName);
      if (b.rightIdLabel) out.push(b.rightIdLabel);
    }
  }
  return out;
}

export function extractTemplatePlaceholders(tpl: Pick<DocumentTemplate, 'documentHeader' | 'previewBlocks'>): string[] {
  const texts = [
    tpl.documentHeader.title,
    tpl.documentHeader.numberPlaceholder,
    ...collectStringsFromPreviewBlocks(tpl.previewBlocks),
  ];
  const tokens = new Set<string>();
  const re = /\{\{([A-Z0-9_]+)\}\}/g;
  for (const text of texts) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      tokens.add(`{{${m[1]}}}`);
    }
  }
  return Array.from(tokens);
}

/**
 * Validates structure, metadata, placeholder syntax, required/optional fields, and PII hygiene
 * of a DocumentTemplate before saving or activating it in S07.
 */
export function validateTemplateStructure(tpl: DocumentTemplate): TemplateValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!tpl.name || tpl.name.trim().length < 3) {
    errors.push('Nama template wajib diisi minimal 3 karakter.');
  }
  if (!tpl.code || tpl.code.trim().length < 2) {
    errors.push('Kode template wajib diisi minimal 2 karakter.');
  }
  if (!VALID_TEMPLATE_CATEGORIES.has(tpl.category)) {
    errors.push('Kategori template tidak valid.');
  }
  if (!tpl.description || tpl.description.trim().length < 5) {
    errors.push('Deskripsi singkat template wajib diisi minimal 5 karakter.');
  }
  if (!tpl.documentHeader || !tpl.documentHeader.title.trim()) {
    errors.push('Judul header dokumen pada struktur template wajib diisi.');
  }
  if (!Array.isArray(tpl.previewBlocks) || tpl.previewBlocks.length === 0) {
    errors.push('Template wajib memiliki minimal satu blok struktur isi dokumen.');
  }

  // Check unbalanced braces in header or preview blocks
  const allTexts = [
    tpl.documentHeader?.title ?? '',
    tpl.documentHeader?.numberPlaceholder ?? '',
    ...collectStringsFromPreviewBlocks(tpl.previewBlocks ?? []),
  ];
  for (const t of allTexts) {
    const opens = (t.match(/\{\{/g) ?? []).length;
    const closes = (t.match(/\}\}/g) ?? []).length;
    if (opens !== closes) {
      errors.push('Ditemukan kurung kurawal placeholder {{ ... }} yang tidak berpasangan.');
      break;
    }
    if (/\{\{[^A-Z0-9_}]+\}\}/.test(t)) {
      warnings.push('Gunakan HURUF_BESAR_SNAKE_CASE untuk nama placeholder di dalam {{...}}.');
    }
  }

  // Field validation (duplicate keys & empty labels)
  const seenKeys = new Set<string>();
  for (const f of tpl.fields ?? []) {
    const key = f.key.trim();
    if (!key) {
      errors.push('Setiap field template wajib memiliki kunci (key) yang valid.');
    } else if (seenKeys.has(key)) {
      errors.push(`Kunci field duplikat terdeteksi: "${key}".`);
    } else {
      seenKeys.add(key);
    }
    if (!f.label.trim()) {
      errors.push(`Field "${key || '(tanpa kunci)'}" wajib memiliki label.`);
    }
  }

  const piiWarnings = detectPotentialPiiWarningsInTemplate(allTexts);
  warnings.push(...piiWarnings);

  const detectedPlaceholders = extractTemplatePlaceholders(tpl);
  if (detectedPlaceholders.length === 0) {
    warnings.push('Template belum menggunakan placeholder dinamis (contoh: {{NOMOR_SURAT}} atau {{TANGGAL_SURAT}}).');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    detectedPlaceholders,
  };
}

export interface CustomTemplateDraftInput {
  name: string;
  code?: string;
  category: TemplateCategory;
  documentKind: DocumentKind;
  description: string;
  purpose?: string;
  paperSize?: TemplatePaperSize;
  orientation?: TemplateOrientation;
  includeKopSurat?: boolean;
  headerTitle: string;
  numberPlaceholder?: string;
  fields?: TemplateFieldDefinition[];
  previewBlocks: TemplatePreviewBlock[];
  legalNotice?: string;
  status?: TemplateStatus;
}

export function createCustomTemplateInState(
  state: AppState,
  input: CustomTemplateDraftInput,
  timestamp: string = new Date().toISOString()
): { state: AppState; template: DocumentTemplate; validation: TemplateValidationReport } {
  const existingCustom = state.customTemplates ?? [];
  const nextOrder = 100 + existingCustom.length + 1;
  const suffix = `${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 5)
    .toUpperCase()}`;

  const fields: TemplateFieldDefinition[] =
    input.fields && input.fields.length > 0
      ? input.fields.map((f) => ({
          ...f,
          key: f.key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'),
          label: f.label.trim(),
        }))
      : [
          {
            key: 'perihal',
            label: 'Perihal / Pokok Surat',
            kind: 'OPERATOR_INPUT',
            required: true,
          },
          {
            key: 'pihak_tujuan',
            label: 'Pihak / Instansi Tujuan',
            kind: 'OPERATOR_INPUT',
            required: false,
          },
        ];

  const tpl: DocumentTemplate = {
    id: `MAD-CUSTOM-${suffix}`,
    code:
      input.code?.trim().toUpperCase().replace(/[^A-Z0-9._-]/g, '-') ||
      `MAD-TPL-${String(existingCustom.length + 1).padStart(2, '0')}`,
    catalogOrder: nextOrder,
    name: input.name.trim(),
    category: input.category,
    description: input.description.trim(),
    purpose: input.purpose?.trim() || input.description.trim(),
    documentKind: input.documentKind,
    version: '1.0.0',
    status: input.status ?? 'ACTIVE',
    source: 'MADRASAH',
    isReadOnly: false,
    sourceTemplateId: null,
    sourceTemplateVersion: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    autoDataSources: fields.filter((f) => f.kind === 'AUTO_SYSTEM').map((f) => f.label),
    requiredInputs: fields
      .filter((f) => f.kind === 'OPERATOR_INPUT' && f.required)
      .map((f) => f.label),
    fields,
    initialPageSettings: {
      paperSize: input.paperSize ?? 'a4',
      orientation: input.orientation ?? 'portrait',
      marginsMm: { top: 20, right: 20, bottom: 20, left: 25 },
    },
    documentHeader: {
      includeKopSurat: input.includeKopSurat ?? true,
      title: input.headerTitle.trim(),
      numberPlaceholder: input.numberPlaceholder?.trim() || 'Nomor: {{NOMOR_SURAT}}',
    },
    previewBlocks: input.previewBlocks,
    ...(input.legalNotice?.trim() ? { legalNotice: input.legalNotice.trim() } : {}),
  };

  const validation = validateTemplateStructure(tpl);
  if (!validation.valid) {
    throw new Error(validation.errors[0] ?? 'Struktur template tidak valid.');
  }

  return {
    state: {
      ...state,
      customTemplates: [tpl, ...existingCustom],
    },
    template: tpl,
    validation,
  };
}

function bumpMinorVersion(ver: string): string {
  const parts = ver.split('.').map((n) => Number.parseInt(n, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return '1.1.0';
  return `${parts[0]}.${parts[1] + 1}.0`;
}

/**
 * Updates an existing MADRASAH/USER template without touching SYSTEM templates
 * and without altering any existing DocumentRecord / DocumentIntakeDraft / DocumentVersion
 * (each document preserves its own frozen templateSnapshot).
 */
export function updateCustomTemplateInState(
  state: AppState,
  templateId: string,
  patch: Partial<CustomTemplateDraftInput>,
  timestamp: string = new Date().toISOString()
): { state: AppState; template: DocumentTemplate; validation: TemplateValidationReport } {
  if (SYSTEM_ID_SET.has(templateId)) {
    throw new Error(
      'Template bawaan SIGNAL bersifat baca-saja dan tidak dapat diubah. Kloning ke Template Madrasah terlebih dahulu.'
    );
  }

  const existingCustom = state.customTemplates ?? [];
  const current = existingCustom.find((t) => t.id === templateId);
  if (!current) {
    throw new Error('Template madrasah tidak ditemukan.');
  }
  if (current.source === 'SYSTEM' || current.isReadOnly) {
    throw new Error('Template baca-saja tidak dapat disunting.');
  }

  const nextFields = patch.fields ?? current.fields;
  const updated: DocumentTemplate = {
    ...current,
    name: patch.name !== undefined ? patch.name.trim() : current.name,
    code:
      patch.code !== undefined
        ? patch.code.trim().toUpperCase().replace(/[^A-Z0-9._-]/g, '-')
        : current.code,
    category: patch.category ?? current.category,
    documentKind: patch.documentKind ?? current.documentKind,
    description: patch.description !== undefined ? patch.description.trim() : current.description,
    purpose:
      patch.purpose !== undefined
        ? patch.purpose.trim()
        : patch.description !== undefined
        ? patch.description.trim()
        : current.purpose,
    status: patch.status ?? current.status,
    version: bumpMinorVersion(current.version),
    updatedAt: timestamp,
    fields: nextFields,
    autoDataSources: nextFields.filter((f) => f.kind === 'AUTO_SYSTEM').map((f) => f.label),
    requiredInputs: nextFields
      .filter((f) => f.kind === 'OPERATOR_INPUT' && f.required)
      .map((f) => f.label),
    initialPageSettings: {
      ...current.initialPageSettings,
      paperSize: patch.paperSize ?? current.initialPageSettings.paperSize,
      orientation: patch.orientation ?? current.initialPageSettings.orientation,
    },
    documentHeader: {
      includeKopSurat: patch.includeKopSurat ?? current.documentHeader.includeKopSurat,
      title:
        patch.headerTitle !== undefined ? patch.headerTitle.trim() : current.documentHeader.title,
      numberPlaceholder:
        patch.numberPlaceholder !== undefined
          ? patch.numberPlaceholder.trim()
          : current.documentHeader.numberPlaceholder,
    },
    previewBlocks: patch.previewBlocks ?? current.previewBlocks,
    legalNotice:
      patch.legalNotice !== undefined ? patch.legalNotice.trim() || undefined : current.legalNotice,
  };

  const validation = validateTemplateStructure(updated);
  if (!validation.valid) {
    throw new Error(validation.errors[0] ?? 'Struktur template tidak valid.');
  }

  return {
    state: {
      ...state,
      customTemplates: existingCustom.map((t) => (t.id === templateId ? updated : t)),
    },
    template: updated,
    validation,
  };
}

export function toggleCustomTemplateStatusInState(
  state: AppState,
  templateId: string,
  timestamp: string = new Date().toISOString()
): { state: AppState; template: DocumentTemplate } {
  if (SYSTEM_ID_SET.has(templateId)) {
    throw new Error('Template bawaan SIGNAL tidak dapat dinonaktifkan atau diubah.');
  }
  const existingCustom = state.customTemplates ?? [];
  const current = existingCustom.find((t) => t.id === templateId);
  if (!current || current.source === 'SYSTEM') {
    throw new Error('Template madrasah tidak ditemukan.');
  }
  const nextStatus: TemplateStatus = current.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE';
  const updated: DocumentTemplate = {
    ...current,
    status: nextStatus,
    updatedAt: timestamp,
  };
  return {
    state: {
      ...state,
      customTemplates: existingCustom.map((t) => (t.id === templateId ? updated : t)),
    },
    template: updated,
  };
}

export function deleteCustomTemplateInState(
  state: AppState,
  templateId: string
): { state: AppState; deletedName: string } {
  if (SYSTEM_ID_SET.has(templateId)) {
    throw new Error('Template bawaan SIGNAL bersifat permanen dan tidak dapat dihapus.');
  }
  const existingCustom = state.customTemplates ?? [];
  const target = existingCustom.find((t) => t.id === templateId);
  if (!target || target.source === 'SYSTEM') {
    throw new Error('Template madrasah tidak ditemukan.');
  }

  const nextCustom = existingCustom.filter((t) => t.id !== templateId);
  const available = collectAllTemplates(nextCustom);
  const nextPrefs = sanitizeTemplatePreferences(
    state.templatePreferences ?? DEFAULT_TEMPLATE_PREFERENCES,
    available
  );

  return {
    state: {
      ...state,
      customTemplates: nextCustom,
      templatePreferences: nextPrefs,
    },
    deletedName: target.name,
  };
}

function extractNodePlainText(node: TipTapJSONNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  return (node.content ?? []).map(extractNodePlainText).join('');
}

function convertTipTapContentToPreviewBlocks(content: TipTapJSONContent): TemplatePreviewBlock[] {
  const blocks: TemplatePreviewBlock[] = [];
  for (const node of content.content ?? []) {
    if (node.type === 'heading') {
      const txt = extractNodePlainText(node).trim();
      if (txt) {
        blocks.push({
          type: 'heading',
          text: txt,
          align: node.attrs?.textAlign === 'center' ? 'center' : 'left',
        });
      }
    } else if (node.type === 'paragraph') {
      const txt = extractNodePlainText(node).trim();
      if (txt) {
        blocks.push({ type: 'paragraph', text: txt });
      }
    } else if (node.type === 'bulletList' || node.type === 'orderedList') {
      const items = (node.content ?? [])
        .map((li) => extractNodePlainText(li).trim())
        .filter(Boolean);
      if (items.length > 0) {
        blocks.push({
          type: 'list',
          ordered: node.type === 'orderedList',
          items,
        });
      }
    } else if (node.type === 'table') {
      const rows = node.content ?? [];
      if (rows.length > 0) {
        const parsedRows = rows.map((row) =>
          (row.content ?? []).map((cell) => extractNodePlainText(cell).trim())
        );
        const columns = parsedRows[0] ?? ['Kolom'];
        const sampleRows = parsedRows.slice(1, 5);
        blocks.push({
          type: 'table',
          columns,
          sampleRows: sampleRows.length > 0 ? sampleRows : [columns.map(() => '{{DATA}}')],
        });
      }
    }
  }
  return blocks.length > 0
    ? blocks
    : [{ type: 'paragraph', text: 'Isi naskah resmi madrasah dengan placeholder {{PERIHAL}}.' }];
}

/**
 * Converts an existing document (Draft S04 or finalized DocumentVersion) into a clean
 * reusable MADRASAH template after automatically scrubbing personal data (names, NIP,
 * phone, email, document numbers, and specific dates).
 */
export function createTemplateFromDocumentInState(
  state: AppState,
  params: {
    documentId: string;
    name: string;
    category?: TemplateCategory;
    description?: string;
    timestamp?: string;
  }
): {
  state: AppState;
  template: DocumentTemplate;
  piiReport: PiiSanitizationReport;
  validation: TemplateValidationReport;
} {
  const { documentId, name, timestamp = new Date().toISOString() } = params;
  const doc = (state.documents ?? []).find((d) => d.id === documentId);
  if (!doc) {
    throw new Error('Dokumen sumber untuk pembuatan template tidak ditemukan.');
  }

  const version =
    (doc.currentVersionId
      ? (state.documentVersions ?? []).find((v) => v.id === doc.currentVersionId)
      : undefined) ?? (state.documentVersions ?? []).find((v) => v.documentId === doc.id);
  const draft = (state.intakeDrafts ?? []).find(
    (d) => d.documentId === doc.id || d.id === doc.intakeDraftId
  );

  const sourceContent = version?.snapshotContent ?? draft?.studio?.content ?? null;
  const sourceTemplateSnap = version?.templateSnapshot ?? draft?.templateSnapshot ?? null;
  const rawBlocks = sourceContent
    ? convertTipTapContentToPreviewBlocks(sourceContent)
    : sourceTemplateSnap?.previewBlocks && sourceTemplateSnap.previewBlocks.length > 0
    ? JSON.parse(JSON.stringify(sourceTemplateSnap.previewBlocks)) as TemplatePreviewBlock[]
    : [{ type: 'paragraph' as const, text: doc.subject || doc.title }];

  const extraNames = [doc.counterpartName ?? ''].filter(Boolean);
  const extraDocumentNumbers = [doc.documentNumber ?? '', version?.documentNumber ?? ''].filter(Boolean);

  const piiContext = {
    state,
    extraNames,
    extraDocumentNumbers,
  };

  const { blocks: sanitizedBlocks, report } = sanitizePreviewBlocksForTemplate(rawBlocks, piiContext);
  const headerReport = createEmptyPiiReport();
  const rawHeaderTitle = sourceTemplateSnap?.documentHeader.title ?? doc.title.toUpperCase();
  const sanitizedHeaderTitle = sanitizeTextForReusableTemplate(rawHeaderTitle, piiContext, headerReport);

  const mergedReport: PiiSanitizationReport = {
    redactionCount: report.redactionCount + headerReport.redactionCount,
    categories: {
      nip: report.categories.nip + headerReport.categories.nip,
      personName: report.categories.personName + headerReport.categories.personName,
      email: report.categories.email + headerReport.categories.email,
      phone: report.categories.phone + headerReport.categories.phone,
      documentNumber: report.categories.documentNumber + headerReport.categories.documentNumber,
      date: report.categories.date + headerReport.categories.date,
    },
  };

  const derivedCategory: TemplateCategory =
    params.category ??
    (sourceTemplateSnap && VALID_TEMPLATE_CATEGORIES.has(sourceTemplateSnap.category as TemplateCategory)
      ? (sourceTemplateSnap.category as TemplateCategory)
      : 'KORESPONDENSI');

  const created = createCustomTemplateInState(
    state,
    {
      name,
      category: derivedCategory,
      documentKind: doc.documentType,
      description:
        params.description?.trim() ||
        `Template madrasah disusun dari dokumen "${doc.title}" dengan sanitasi data personal otomatis.`,
      paperSize:
        version?.snapshotPageSettings.paperSize ??
        draft?.studio?.pageSettings.paperSize ??
        sourceTemplateSnap?.initialPageSettings.paperSize ??
        'a4',
      orientation:
        version?.snapshotPageSettings.orientation ??
        draft?.studio?.pageSettings.orientation ??
        sourceTemplateSnap?.initialPageSettings.orientation ??
        'portrait',
      includeKopSurat: sourceTemplateSnap?.documentHeader.includeKopSurat ?? true,
      headerTitle: sanitizedHeaderTitle || name.toUpperCase(),
      numberPlaceholder: 'Nomor: {{NOMOR_SURAT}}',
      previewBlocks: sanitizedBlocks,
    },
    timestamp
  );

  return {
    state: created.state,
    template: created.template,
    piiReport: mergedReport,
    validation: created.validation,
  };
}
