import type { AppState } from '../../types';
import type { TemplatePreviewBlock } from './types';

export interface PiiSanitizationContext {
  state: AppState;
  extraNames?: string[];
  extraDocumentNumbers?: string[];
}

export interface PiiSanitizationReport {
  redactionCount: number;
  categories: {
    nip: number;
    personName: number;
    email: number;
    phone: number;
    documentNumber: number;
    date: number;
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const INDONESIAN_MONTHS =
  '(?:Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)';

/**
 * Scrubs personal/sensitive operational data (NIP, personal names from Master/Settings,
 * email addresses, Indonesian phone numbers, explicit document numbers, and specific dates)
 * into neutral placeholders when saving an existing document as a reusable template.
 */
export function sanitizeTextForReusableTemplate(
  rawText: string,
  context: PiiSanitizationContext,
  report: PiiSanitizationReport
): string {
  if (!rawText) return rawText;
  let out = rawText;

  // 1. Explicit document numbers from existing records
  const docNumbers = new Set<string>(
    [
      ...(context.extraDocumentNumbers ?? []),
      ...(context.state.documents ?? [])
        .map((d) => d.documentNumber ?? '')
        .filter((n) => n.trim().length >= 5),
    ].filter(Boolean)
  );
  for (const num of docNumbers) {
    const re = new RegExp(escapeRegExp(num.trim()), 'gi');
    if (re.test(out)) {
      out = out.replace(re, () => {
        report.redactionCount += 1;
        report.categories.documentNumber += 1;
        return '{{NOMOR_SURAT}}';
      });
    }
  }

  // 2. NIP / NPK 18-digit or labeled NIP strings
  const labeledNipRe = /\b(?:NIP|NPK|NUPTK|NIK)\s*[.:]?\s*\d[\d\s-]{7,22}\d\b/gi;
  out = out.replace(labeledNipRe, () => {
    report.redactionCount += 1;
    report.categories.nip += 1;
    return 'NIP. {{NIP_PEJABAT}}';
  });

  const bare18DigitRe = /\b\d{18}\b/g;
  out = out.replace(bare18DigitRe, () => {
    report.redactionCount += 1;
    report.categories.nip += 1;
    return '{{NIP_PEJABAT}}';
  });

  // 3. Explicit Headmaster / Curriculum Leader / Teacher Names (longest first to avoid partial match)
  const headmasterName = context.state.settings.headmasterName?.trim();
  const curriculumLeaderName = context.state.settings.curriculumLeaderName?.trim();
  const teacherNames = (context.state.teachers ?? [])
    .map((t) => t.name.trim())
    .filter((n) => n.length >= 3);

  if (headmasterName && headmasterName.length >= 3) {
    const re = new RegExp(escapeRegExp(headmasterName), 'gi');
    out = out.replace(re, () => {
      report.redactionCount += 1;
      report.categories.personName += 1;
      return '{{NAMA_KEPALA_MADRASAH}}';
    });
  }

  if (curriculumLeaderName && curriculumLeaderName.length >= 3) {
    const re = new RegExp(escapeRegExp(curriculumLeaderName), 'gi');
    out = out.replace(re, () => {
      report.redactionCount += 1;
      report.categories.personName += 1;
      return '{{NAMA_WAKA_KURIKULUM}}';
    });
  }

  const allPersonalNames = Array.from(
    new Set([...teacherNames, ...(context.extraNames ?? []).map((n) => n.trim()).filter((n) => n.length >= 3)])
  ).sort((a, b) => b.length - a.length);

  for (const name of allPersonalNames) {
    if (name === headmasterName || name === curriculumLeaderName) continue;
    const re = new RegExp(escapeRegExp(name), 'gi');
    out = out.replace(re, () => {
      report.redactionCount += 1;
      report.categories.personName += 1;
      return '{{NAMA_GURU}}';
    });
  }

  // 4. Email addresses
  const emailRe = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  out = out.replace(emailRe, () => {
    report.redactionCount += 1;
    report.categories.email += 1;
    return '{{EMAIL_MADRASAH}}';
  });

  // 5. Indonesian phone numbers (08xx, +62, (0xxx))
  const phoneRe = /(?:\+62|08\d{1,2}|\(0\d{2,3}\))[\s.-]?\d{2,4}[\s.-]?\d{3,5}(?:[\s.-]?\d{2,4})?/g;
  out = out.replace(phoneRe, () => {
    report.redactionCount += 1;
    report.categories.phone += 1;
    return '{{TELEPON_MADRASAH}}';
  });

  // 6. Specific Indonesian dates ("17 November 2026") or ISO dates ("2026-11-17")
  const idDateRe = new RegExp(`\\b\\d{1,2}\\s+${INDONESIAN_MONTHS}\\s+20\\d{2}\\b`, 'gi');
  out = out.replace(idDateRe, () => {
    report.redactionCount += 1;
    report.categories.date += 1;
    return '{{TANGGAL_SURAT}}';
  });

  const isoDateRe = /\b20\d{2}-\d{2}-\d{2}\b/g;
  out = out.replace(isoDateRe, () => {
    report.redactionCount += 1;
    report.categories.date += 1;
    return '{{TANGGAL_SURAT}}';
  });

  return out;
}

export function createEmptyPiiReport(): PiiSanitizationReport {
  return {
    redactionCount: 0,
    categories: {
      nip: 0,
      personName: 0,
      email: 0,
      phone: 0,
      documentNumber: 0,
      date: 0,
    },
  };
}

export function sanitizePreviewBlocksForTemplate(
  blocks: TemplatePreviewBlock[],
  context: PiiSanitizationContext
): { blocks: TemplatePreviewBlock[]; report: PiiSanitizationReport } {
  const report = createEmptyPiiReport();
  const scrub = (s: string) => sanitizeTextForReusableTemplate(s, context, report);

  const sanitized: TemplatePreviewBlock[] = blocks.map((blk) => {
    if (blk.type === 'heading') {
      return { ...blk, text: scrub(blk.text) };
    }
    if (blk.type === 'paragraph') {
      return { ...blk, text: scrub(blk.text) };
    }
    if (blk.type === 'meta_grid') {
      return {
        ...blk,
        rows: blk.rows.map((r) => ({ label: r.label, value: scrub(r.value) })),
      };
    }
    if (blk.type === 'list') {
      return {
        ...blk,
        items: blk.items.map((item) => scrub(item)),
      };
    }
    if (blk.type === 'table') {
      return {
        ...blk,
        columns: blk.columns.map((c) => scrub(c)),
        sampleRows: blk.sampleRows.map((row) => row.map((cell) => scrub(cell))),
      };
    }
    return {
      ...blk,
      ...(blk.leftTitle ? { leftTitle: scrub(blk.leftTitle) } : {}),
      ...(blk.leftName ? { leftName: scrub(blk.leftName) } : {}),
      rightTitle: scrub(blk.rightTitle),
      rightName: scrub(blk.rightName),
      ...(blk.rightIdLabel ? { rightIdLabel: scrub(blk.rightIdLabel) } : {}),
    };
  });

  return { blocks: sanitized, report };
}

/**
 * Checks whether a template's text still contains raw 18-digit NIP or raw email addresses.
 */
export function detectPotentialPiiWarningsInTemplate(texts: string[]): string[] {
  const warnings: string[] = [];
  const joined = texts.join('\n');
  if (/\b\d{18}\b/.test(joined) || /\b(?:NIP|NPK)\s*[.:]?\s*\d{8,}/i.test(joined)) {
    warnings.push(
      'Terdeteksi angka NIP/NPK eksplisit pada isi template. Sebaiknya ganti dengan placeholder {{NIP_PEJABAT}}.'
    );
  }
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(joined)) {
    warnings.push(
      'Terdeteksi alamat email eksplisit pada isi template. Pertimbangkan mengganti dengan {{EMAIL_MADRASAH}}.'
    );
  }
  return warnings;
}
