import type { AppState } from '../../types';
import { verifyScheduleVersion } from '../../scheduleSources';
import { extractPlainTextAndTokens } from '../studio/contentValidation';
import type { TipTapJSONContent } from '../studio/types';
import type {
  DocumentIntakeDraft,
  DocumentRecord,
  FinalizationChecklistItem,
  FinalizationChecklistReport,
} from '../types';

/**
 * Daftar token nomor dokumen yang memang baru diterbitkan secara resmi saat finalisasi S05.
 * Token ini TIDAK memblokir checklist sebelum nomor resmi disahkan.
 */
export const AUTO_FINALIZATION_NUMBER_TOKENS = new Set<string>([
  'NOMOR_SURAT',
  'NO_SURAT',
  'NOMOR_SK',
  'NO_SK',
  'NOMOR_DOKUMEN',
  'NO_DOKUMEN',
  'NOMOR_URUT',
  'NOMOR_ARSIP',
  'NOMOR_NOTA_DINAS',
  'NOMOR_BERITA_ACARA',
  'NOMOR_LAPORAN',
  'NOMOR_NOTULA',
  'NOMOR_NOTULAN',
]);

function readSnapshotRecord(
  draft: DocumentIntakeDraft,
  sourceKey: string
): Record<string, unknown> | null {
  const entry = draft.sourceSnapshots.find((s) => s.sourceKey === sourceKey);
  if (!entry || !entry.capturedValue || typeof entry.capturedValue !== 'object') {
    return null;
  }
  return entry.capturedValue as Record<string, unknown>;
}

function isIsoDateValid(isoDate: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test((isoDate ?? '').trim())) return false;
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(isoDate);
}

/**
 * Mengaudit kelengkapan administrasi naskah sebelum pengesahan final di S05:
 * - Kelengkapan naskah & pembersihan token selain nomor surat S05
 * - Kelengkapan Kop & Penandatangan (sesuai opsi template)
 * - Validitas tanggal surat
 * - Khusus SK Penugasan Mengajar / dokumen terikat jadwal: wajib merujuk ScheduleVersion terverifikasi
 * - Transparansi Dataset Demo aktif (membutuhkan pengakuan operator sebelum sah)
 */
export function evaluateFinalizationChecklist(params: {
  draft: DocumentIntakeDraft;
  content: TipTapJSONContent;
  state: AppState;
  documentRecord?: DocumentRecord | null;
}): FinalizationChecklistReport {
  const { draft, content, state, documentRecord } = params;
  const items: FinalizationChecklistItem[] = [];

  // 1. Kelengkapan isi naskah
  const textAnalysis = extractPlainTextAndTokens(content);
  items.push({
    id: 'content_meaningful',
    label: 'Kelengkapan Naskah Surat',
    severity: textAnalysis.hasMeaningfulText ? 'ok' : 'blocker',
    passed: textAnalysis.hasMeaningfulText,
    detail: textAnalysis.hasMeaningfulText
      ? 'Naskah dokumen terisi dan siap diperiksa sebelum pengesahan.'
      : 'Naskah surat masih kosong. Isi badan surat pada Editor Naskah terlebih dahulu.',
    fixTarget: textAnalysis.hasMeaningfulText ? null : 's04',
  });

  // 2. Placeholder / Token belum terurai (kecuali token nomor surat resmi S05)
  const blockingTokens = textAnalysis.unresolvedTokens.filter(
    (token) => !AUTO_FINALIZATION_NUMBER_TOKENS.has(token)
  );
  items.push({
    id: 'unresolved_tokens',
    label: 'Kebersihan Placeholder / Token Variabel',
    severity: blockingTokens.length === 0 ? 'ok' : 'blocker',
    passed: blockingTokens.length === 0,
    detail:
      blockingTokens.length === 0
        ? 'Tidak ada token {{...}} selain placeholder nomor surat yang menunggu penerbitan S05.'
        : `Masih terdapat ${blockingTokens.length} token belum diisi pada naskah: ${blockingTokens
            .map((t) => `{{${t}}}`)
            .join(', ')}.`,
    fixTarget: blockingTokens.length === 0 ? null : 's04',
  });

  // 3. Validitas tanggal dokumen
  const dateOk = isIsoDateValid(draft.documentDate);
  items.push({
    id: 'valid_date',
    label: 'Tanggal Penetapan Dokumen Valid',
    severity: dateOk ? 'ok' : 'blocker',
    passed: dateOk,
    detail: dateOk
      ? `Tanggal dokumen valid (${draft.documentDate}).`
      : `Tanggal dokumen "${draft.documentDate || 'kosong'}" belum berformat ISO YYYY-MM-DD yang valid.`,
    fixTarget: dateOk ? null : 's03',
  });

  // 4. Identitas Madrasah / Kop Surat
  const includeKop = draft.templateSnapshot.documentHeader?.includeKopSurat !== false;
  const kopSnap = readSnapshotRecord(draft, 'settings.madrasah_identity_signatory');
  const schoolName = String(kopSnap?.schoolName ?? state.settings.schoolName ?? '').trim();
  const address = String(kopSnap?.address ?? state.settings.address ?? '').trim();
  const city = String(kopSnap?.city ?? state.settings.city ?? '').trim();

  if (includeKop) {
    const missingKopFields: string[] = [];
    if (!schoolName) missingKopFields.push('Nama Madrasah');
    if (!address) missingKopFields.push('Alamat Madrasah');
    if (!city) missingKopFields.push('Kota/Kabupaten');
    const kopOk = missingKopFields.length === 0;
    items.push({
      id: 'kop_identity',
      label: 'Identitas Madrasah & Kop Surat Resmi',
      severity: kopOk ? 'ok' : 'blocker',
      passed: kopOk,
      detail: kopOk
        ? `Kop surat lengkap atas nama ${schoolName} (${city}).`
        : `Kop surat diaktifkan, namun field berikut belum terisi: ${missingKopFields.join(', ')}.`,
      fixTarget: kopOk ? null : 'settings',
    });
  } else {
    items.push({
      id: 'kop_identity',
      label: 'Identitas Dokumen Tanpa Kop Surat',
      severity: 'ok',
      passed: true,
      detail: 'Template disetel tanpa Kop Surat resmi madrasah.',
      fixTarget: null,
    });
  }

  // 5. Identitas Penandatangan Resmi
  const headmasterName = String(
    kopSnap?.signatoryName ?? kopSnap?.headmasterName ?? state.settings.headmasterName ?? ''
  ).trim();
  const signatoryOk = headmasterName.length >= 2;
  items.push({
    id: 'official_signatory',
    label: 'Identitas Pejabat Penandatangan',
    severity: signatoryOk ? 'ok' : 'blocker',
    passed: signatoryOk,
    detail: signatoryOk
      ? `Penandatangan tercatat: ${headmasterName}.`
      : 'Nama Kepala Madrasah / penandatangan belum diisi pada Identitas Madrasah (Pengaturan Umum).',
    fixTarget: signatoryOk ? null : 'settings',
  });

  // 6. Khusus SK Pembagian Tugas Mengajar atau dokumen yang terikat ScheduleVersion
  const requiresPublishedSchedule =
    draft.templateSnapshot.code === 'TPL-03' ||
    draft.templateId === 'SYS-TPL-03' ||
    Boolean(draft.scheduleVersionId) ||
    Boolean(documentRecord?.scheduleVersionId);

  if (requiresPublishedSchedule) {
    const targetScheduleId = draft.scheduleVersionId ?? documentRecord?.scheduleVersionId ?? null;
    const matchedVersion = (state.history ?? []).find((v) => v.id === targetScheduleId);
    const verification = matchedVersion ? verifyScheduleVersion(matchedVersion) : null;
    const scheduleOk = Boolean(matchedVersion && verification?.isValidForOfficialUse);

    items.push({
      id: 'published_schedule_source',
      label: 'Validasi Sumber Jadwal Resmi',
      severity: scheduleOk ? 'ok' : 'blocker',
      passed: scheduleOk,
      detail: scheduleOk && matchedVersion
        ? `Terikat resmi ke Jadwal Terbit v${matchedVersion.version} (${matchedVersion.label}).`
        : !targetScheduleId
        ? 'Dokumen SK/Penugasan Jadwal belum terikat ke jadwal terbit resmi (tidak diperbolehkan memakai jadwal draft).'
        : !matchedVersion
        ? `Versi jadwal rujukan "${targetScheduleId}" tidak ditemukan di riwayat jadwal terbit.`
        : `Versi jadwal "${targetScheduleId}" tidak lolos verifikasi integritas: ${
            verification?.integrityIssues.join('; ') ?? 'data tidak valid'
          }.`,
      fixTarget: scheduleOk ? null : 's03',
    });
  }

  // 7. Peringatan jujur bila masih memakai Dataset Demo
  const hasDemoSnapshot =
    state.dataMode === 'demo' || draft.sourceSnapshots.some((s) => s.isDemoData);
  if (hasDemoSnapshot) {
    items.push({
      id: 'demo_data_notice',
      label: 'Transparansi Sumber Data Simulasi (Demo)',
      severity: 'warning',
      passed: false,
      detail:
        'Workspace atau snapshot dokumen masih memakai dataset simulasi demo. Operator wajib mencentang persetujuan pengakuan data simulasi sebelum memfinalkan.',
      fixTarget: 'acknowledge_demo',
    });
  } else {
    items.push({
      id: 'demo_data_notice',
      label: 'Integritas Sumber Data Operasional (Custom)',
      severity: 'ok',
      passed: true,
      detail: 'Dokumen bersumber dari data operasional kustom madrasah.',
      fixTarget: null,
    });
  }

  const blockersCount = items.filter((i) => !i.passed && i.severity === 'blocker').length;
  const warningsCount = items.filter((i) => !i.passed && i.severity === 'warning').length;

  return {
    canFinalize: blockersCount === 0,
    blockersCount,
    warningsCount,
    requiresDemoAck: hasDemoSnapshot,
    unresolvedTokens: blockingTokens,
    items,
  };
}
