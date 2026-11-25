import type { DocumentIntakeDraft, SourceSnapshotEntry } from '../types';
import type { DocumentTemplate, TemplatePreviewBlock } from '../templates/types';
import {
  formatKopAddressLine,
  formatKopRegistryLine,
} from '../../kopIdentity';
import { SYSTEM_DOCUMENT_TEMPLATES } from '../templates/registry';
import { extractPlainTextAndTokens, validateStudioPageSettings } from './contentValidation';
import {
  buildDelegatedSignatureTable,
  formatBeritaAcaraOpeningDate,
  type SignatoryDelegationMode,
} from './tataNaskahHelpers';
import type {
  DocumentStudioPageSettings,
  LegacyTemplateResolution,
  StudioInitialContentResult,
  TipTapJSONContent,
  TipTapJSONMark,
  TipTapJSONNode,
} from './types';

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const INDONESIAN_MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const INDONESIAN_DAYS = [
  'Minggu',
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
];

export function formatIndonesianLongDate(isoDate?: string | null): string | null {
  if (!isoDate || typeof isoDate !== 'string') return null;
  const trimmed = isoDate.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIdx = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (monthIdx < 0 || monthIdx > 11 || day < 1 || day > 31) return null;
  return `${day} ${INDONESIAN_MONTHS[monthIdx]} ${year}`;
}

export function getIndonesianDayName(isoDate?: string | null): string | null {
  if (!isoDate || typeof isoDate !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return null;
  const dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(dt.getTime())) return null;
  return INDONESIAN_DAYS[dt.getUTCDay()] ?? null;
}

export function formatIndonesianDayDate(isoDate?: string | null): string | null {
  const longDate = formatIndonesianLongDate(isoDate);
  if (!longDate) return null;
  const dayName = getIndonesianDayName(isoDate);
  return dayName ? `${dayName}, ${longDate}` : longDate;
}

/**
 * Format rentang tanggal alami berbahasa Indonesia:
 * - Jika tanggal mulai == selesai -> "Rabu, 25 November 2026"
 * - Jika berbeda -> "Selasa–Kamis, 24 November 2026 s.d. 26 November 2026"
 */
export function formatIndonesianDateRange(
  startIso?: string | null,
  endIso?: string | null
): string | null {
  const startLong = formatIndonesianLongDate(startIso);
  const endLong = formatIndonesianLongDate(endIso);
  if (!startLong && !endLong) return null;
  if (startLong && (!endLong || startIso?.trim() === endIso?.trim())) {
    return formatIndonesianDayDate(startIso);
  }
  if (!startLong && endLong) {
    return formatIndonesianDayDate(endIso);
  }
  const startDay = getIndonesianDayName(startIso);
  const endDay = getIndonesianDayName(endIso);
  const dayPrefix = startDay && endDay ? `${startDay}–${endDay}, ` : '';
  return `${dayPrefix}${startLong} s.d. ${endLong}`;
}

interface FrozenKopSnapshot {
  schoolName?: string | null;
  ministry?: string | null;
  regionalOffice?: string | null;
  legalDecree?: string | null;
  accreditation?: string | null;
  nsm?: string | null;
  npsn?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  academicYear?: string | null;
  semester?: string | null;
  signatoryTitle?: string | null;
  signatoryName?: string | null;
  signatoryNip?: string | null;
  curriculumLeaderTitle?: string | null;
  curriculumLeaderName?: string | null;
}

interface FrozenTeacherSnapshot {
  id: string;
  code: string | null;
  name: string;
  roleTitle: string | null;
  subjectsText?: string | null;
}

interface FrozenScheduleVersionSnapshot {
  id: string;
  versionNumber: number;
  label: string;
  createdAt: string;
  academicYearText: string;
  semesterText: string;
  fingerprint: string;
  entryCount: number;
  teacherWorkloads?: Array<{
    teacherId: string;
    teacherName: string;
    totalJP: number;
    classesCount: number;
    subjectsTaught?: string[];
    classesTaught?: string[];
  }>;
}

function findSnapshot(draft: DocumentIntakeDraft, key: string): SourceSnapshotEntry | undefined {
  return (draft.sourceSnapshots ?? []).find((s) => s.sourceKey === key);
}

function strOrNull(val: unknown): string | null {
  if (typeof val === 'string') {
    const t = val.trim();
    return t.length > 0 ? t : null;
  }
  if (typeof val === 'number' && Number.isFinite(val)) {
    return String(val);
  }
  return null;
}

function getBaseTemplateId(draft: DocumentIntakeDraft): string {
  if (draft.templateId.startsWith('SYS-TPL-')) return draft.templateId;
  const srcId = draft.templateSnapshot?.sourceTemplateId;
  if (typeof srcId === 'string' && srcId.startsWith('SYS-TPL-')) return srcId;
  return draft.templateId;
}

function splitOperatorLines(raw: string | null, fallbackItems: string[]): string[] {
  if (!raw) return fallbackItems;
  const items = raw
    .split(/\r?\n|;/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
  return items.length > 0 ? items : fallbackItems;
}

function parseDelimitedCells(rawLine: string): string[] {
  if (!rawLine.includes('|')) return [rawLine.trim()];
  return rawLine.split('|').map((cell) => cell.trim());
}

const NUMBER_TOKENS = new Set<string>([
  'NOMOR_SURAT',
  'NO_SURAT',
  'NOMOR_SK',
  'NO_SK',
  'NOMOR_BERITA_ACARA',
  'NOMOR_LAPORAN',
  'NOMOR_NOTA_DINAS',
  'NOMOR_NOTULAN',
  'NOMOR_NOTULA',
  'NOMOR_DOKUMEN',
  'NO_DOKUMEN',
]);

/**
 * Resolusi template untuk draft S03 baru maupun draft lama yang belum menyimpan `previewBlocks`.
 */
export function resolveTemplateBlocksForDraft(
  draft: DocumentIntakeDraft,
  activeTemplates: readonly DocumentTemplate[] = SYSTEM_DOCUMENT_TEMPLATES,
  options?: { allowVersionMismatchFallback?: boolean }
): LegacyTemplateResolution {
  const snapshot = draft.templateSnapshot;
  if (Array.isArray(snapshot.previewBlocks) && snapshot.previewBlocks.length > 0) {
    return {
      status: 'FROZEN_SNAPSHOT',
      previewBlocks: deepClone(snapshot.previewBlocks),
      templateName: snapshot.name,
      snapshotVersion: snapshot.version,
      requiresConfirmation: false,
    };
  }

  const matched =
    activeTemplates.find((t) => t.id === draft.templateId) ??
    (snapshot.sourceTemplateId
      ? activeTemplates.find((t) => t.id === snapshot.sourceTemplateId)
      : undefined) ??
    SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === draft.templateId) ??
    null;

  if (!matched) {
    return {
      status: 'NOT_FOUND',
      previewBlocks: [
        {
          type: 'paragraph',
          text: draft.subject || 'Silakan lanjutkan penyusunan naskah dokumen di Editor Naskah.',
        },
        {
          type: 'signature',
          rightTitle: '{{JABATAN_KEPALA_MADRASAH}}',
          rightName: '{{NAMA_KEPALA_MADRASAH}}',
          rightIdLabel: '{{NIP_KEPALA_MADRASAH}}',
        },
      ],
      templateName: snapshot.name,
      snapshotVersion: snapshot.version,
      matchedTemplate: null,
      requiresConfirmation: false,
      notice:
        'Template asal tidak lagi ditemukan dan draft lama belum menyimpan struktur blok; kanvas dasar aman disiapkan dari ringkasan draft.',
    };
  }

  if (matched.version !== snapshot.version) {
    return {
      status: 'VERSION_MISMATCH',
      previewBlocks: options?.allowVersionMismatchFallback
        ? deepClone(matched.previewBlocks)
        : [
            {
              type: 'paragraph',
              text: draft.subject || 'Silakan susun isi dokumen berdasarkan data awal yang tersimpan.',
            },
          ],
      templateName: snapshot.name,
      snapshotVersion: snapshot.version,
      activeVersion: matched.version,
      matchedTemplate: matched,
      requiresConfirmation: !options?.allowVersionMismatchFallback,
      notice: `Draft ini menggunakan template versi ${snapshot.version}, sedangkan template aktif saat ini adalah versi ${matched.version}.`,
    };
  }

  return {
    status: 'ACTIVE_MATCH',
    previewBlocks: deepClone(matched.previewBlocks),
    templateName: snapshot.name,
    snapshotVersion: matched.version,
    activeVersion: matched.version,
    matchedTemplate: matched,
    requiresConfirmation: false,
  };
}

/**
 * Peta alias token eksplisit `{{TOKEN}}` -> nilai dari snapshot beku S03 & fieldValues.
 * Semua 30 template sistem terpetakan lengkap (zero orphan `[Belum diisi]` untuk field opsional/non-PNS).
 * Token penomoran resmi sengaja dipertahankan agar disubstitusi saat pengesahan S05.
 */
function buildExplicitTokenAliasMap(draft: DocumentIntakeDraft): Record<string, string | null> {
  const fv = draft.fieldValues ?? {};
  const kopSnap = findSnapshot(draft, 'settings.madrasah_identity_signatory');
  const kopVal = (kopSnap?.capturedValue ?? {}) as FrozenKopSnapshot;

  const teacherSnap = findSnapshot(draft, 'master.teachers.selected');
  const teachers = Array.isArray(teacherSnap?.capturedValue)
    ? (teacherSnap!.capturedValue as FrozenTeacherSnapshot[])
    : [];

  const verSnap = findSnapshot(draft, 'history.schedule_version');
  const scheduleVer = (verSnap?.capturedValue ?? null) as FrozenScheduleVersionSnapshot | null;

  const classSnap = findSnapshot(draft, 'master.classes.selected');
  const classVal = (classSnap?.capturedValue ?? null) as { name?: string } | string | null;
  const className =
    typeof classVal === 'string' ? classVal : strOrNull(classVal?.name);

  const subjSnap = findSnapshot(draft, 'master.subjects.selected');
  const subjVal = (subjSnap?.capturedValue ?? null) as { name?: string } | string | null;
  const subjectName =
    typeof subjVal === 'string' ? subjVal : strOrNull(subjVal?.name);

  const kopSchool = strOrNull(kopVal.schoolName) ?? 'Madrasah Tsanawiyah';
  const kopTitle = strOrNull(kopVal.signatoryTitle) ?? 'Kepala Madrasah';
  const kopName = strOrNull(kopVal.signatoryName);
  const kopNip = strOrNull(kopVal.signatoryNip);

  const primaryTeacher = teachers[0];
  const secondTeacher = teachers[1];

  const docLongDate = formatIndonesianLongDate(draft.documentDate);
  const docDayDate = formatIndonesianDayDate(draft.documentDate);
  const periodeUjianText =
    formatIndonesianDateRange(
      strOrNull(fv.periode_ujian_mulai),
      strOrNull(fv.periode_ujian_selesai)
    ) ?? strOrNull(fv.periode_ujian);

  const rincianLines = splitOperatorLines(strOrNull(fv.rincian), []);
  const keputusanLines = splitOperatorLines(strOrNull(fv.hasil_keputusan), []);
  const pernyataanLines = splitOperatorLines(strOrNull(fv.isi_pernyataan), []);

  const pimpinanRaw = strOrNull(fv.pimpinan_notulis) ?? '';
  const pimpinanParts = pimpinanRaw.split(/[/,&\n]+/).map((p) => p.trim()).filter(Boolean);

  // Mata pelajaran diampu guru terpilih (dari ScheduleVersion atau snapshot guru)
  const matchedTeacherWorkload = primaryTeacher
    ? scheduleVer?.teacherWorkloads?.find((w) => w.teacherId === primaryTeacher.id)
    : undefined;
  const resolvedPrimarySubjects =
    (matchedTeacherWorkload?.subjectsTaught && matchedTeacherWorkload.subjectsTaught.length > 0
      ? matchedTeacherWorkload.subjectsTaught.join(', ')
      : null) ??
    strOrNull(primaryTeacher?.subjectsText) ??
    'Sesuai SK Pembagian Tugas Mengajar';

  const map: Record<string, string | null> = {
    // 1. Identitas & Penandatangan (dari snapshot beku)
    NAMA_MADRASAH: kopSchool,
    JABATAN_KEPALA_MADRASAH: kopTitle,
    NAMA_KEPALA_MADRASAH: kopName,
    NIP_KEPALA_MADRASAH: kopNip ? `NIP. ${kopNip}` : '',
    JABATAN_PENANDATANGAN: kopTitle,
    JABATAN_PENANDATANGAN_OPSIONAL: kopTitle,
    NAMA_PENANDATANGAN: kopName,
    NIP_ATAU_NPK_PENANDATANGAN: kopNip ? `NIP. ${kopNip}` : '',
    JABATAN_PENGIRIM: kopTitle,
    TAHUN_AJARAN: strOrNull(kopVal.academicYear) ?? '-',
    SEMESTER: strOrNull(kopVal.semester) ?? '-',

    // 2. Penomoran resmi tetap placeholder eksplisit hingga S05
    NOMOR_SURAT: null,
    NOMOR_SK: null,
    NOMOR_BERITA_ACARA: null,
    NOMOR_LAPORAN: null,
    NOMOR_NOTA_DINAS: null,
    NOMOR_NOTULAN: null,
    NOMOR_NOTULA: null,
    NOMOR_DOKUMEN: null,

    // 3. Penugasan, Pelatihan, SK (S01–S06)
    NAMA_KEGIATAN:
      strOrNull(fv.nama_kegiatan) ??
      strOrNull(fv.nama_kepanitiaan) ??
      strOrNull(fv.detail_kegiatan) ??
      strOrNull(fv.tema_materi) ??
      draft.subject,
    INSTANSI_PENYELENGGARA: strOrNull(fv.penyelenggara) ?? kopSchool,
    PENYELENGGARA: strOrNull(fv.penyelenggara) ?? kopSchool,
    TANGGAL_MULAI: formatIndonesianLongDate(strOrNull(fv.tanggal_mulai)) ?? docLongDate,
    TANGGAL_SELESAI:
      formatIndonesianLongDate(strOrNull(fv.tanggal_selesai)) ??
      formatIndonesianLongDate(strOrNull(fv.tanggal_mulai)) ??
      docLongDate,
    LOKASI_KEGIATAN: strOrNull(fv.lokasi) ?? strOrNull(fv.detail_kegiatan) ?? kopSchool,
    DASAR_PENUGASAN: strOrNull(fv.dasar_surat) ?? 'program kerja dan kebutuhan kedinasan madrasah',

    NAMA_PEGAWAI: primaryTeacher?.name ?? null,
    JABATAN_PEGAWAI: primaryTeacher?.roleTitle ?? (primaryTeacher ? 'Pendidik / Pegawai' : null),
    AGENDA_KEGIATAN_DINAS: strOrNull(fv.agenda),
    TANGGAL_TUGAS: formatIndonesianDayDate(strOrNull(fv.tanggal_dinas)) ?? docDayDate,
    PUKUL_TUGAS: strOrNull(fv.pukul_tugas) ?? '08.00 WIB s.d. selesai',
    TEMPAT_TUJUAN: strOrNull(fv.tempat_tujuan) ?? 'Tempat',

    VERSI_JADWAL_TERBIT: scheduleVer
      ? `${scheduleVer.label} (Versi ${scheduleVer.versionNumber})`
      : 'Jadwal Pelajaran Resmi',
    FINGERPRINT_JADWAL: scheduleVer?.fingerprint ?? strOrNull(draft.scheduleVersionFingerprint) ?? '-',

    PERIODE_TMT: formatIndonesianLongDate(strOrNull(fv.tmt_berlaku)) ?? docLongDate,
    MASA_KERJA: strOrNull(fv.masa_kerja) ?? `Tahun Ajaran ${strOrNull(kopVal.academicYear) ?? ''}`.trim(),

    NAMA_KETUA_PANITIA: primaryTeacher?.name ?? 'Ketua Panitia',
    JABATAN_ASAL_1: primaryTeacher?.roleTitle ?? 'Pendidik',
    NAMA_SEKRETARIS_PANITIA: secondTeacher?.name ?? primaryTeacher?.name ?? 'Sekretaris Panitia',
    JABATAN_ASAL_2: secondTeacher?.roleTitle ?? 'Pendidik',

    NAMA_UJIAN: strOrNull(fv.jenis_ujian) ?? strOrNull(fv.nama_ujian) ?? 'Asesmen Madrasah',
    PERIODE_UJIAN: periodeUjianText ?? docLongDate,
    NAMA_PENGAWAS_1: primaryTeacher?.name ?? null,
    NAMA_PENGAWAS_2: secondTeacher?.name ?? null,

    // 4. Korespondensi (S07–S10)
    PENERIMA_UNDANGAN: strOrNull(fv.kepada) ?? 'Bapak/Ibu Dewan Guru dan Tenaga Kependidikan',
    LAMPIRAN: strOrNull(fv.lampiran) ?? '-',
    PERIHAL_RAPAT: strOrNull(fv.agenda_rapat) ? `Undangan ${strOrNull(fv.agenda_rapat)}` : 'Undangan Rapat Dinas',
    AGENDA_RAPAT: strOrNull(fv.agenda_rapat) ?? strOrNull(fv.judul_rapat) ?? 'Rapat Koordinasi Madrasah',
    TEMPAT_RAPAT: strOrNull(fv.tempat_rapat) ?? `Ruang Rapat ${kopSchool}`,
    HARI_TANGGAL_RAPAT: strOrNull(fv.waktu_rapat) ?? strOrNull(fv.waktu_tempat) ?? docDayDate,
    PUKUL_RAPAT: strOrNull(fv.pukul_rapat) ?? 'Sesuai jadwal tersebut',
    PEJABAT_INSTANSI_TUJUAN: strOrNull(fv.instansi_tujuan),
    ALAMAT_TUJUAN: strOrNull(fv.alamat_tujuan) ?? 'Tempat',
    INSTANSI_PENERIMA: strOrNull(fv.penerima),
    SIFAT_SURAT: strOrNull(fv.sifat_surat) ?? 'Biasa',
    SIFAT_NOTA: strOrNull(fv.sifat_nota) ?? 'Biasa',
    PERIHAL: strOrNull(fv.perihal) ?? draft.subject,
    POKOK_ISI_SURAT_DINAS: strOrNull(fv.isi_pokok),
    SASARAN_PENGUMUMAN: strOrNull(fv.sasaran) ?? 'seluruh warga madrasah',
    TOPIK_PEMBERITAHUAN: strOrNull(fv.topik) ?? draft.subject,
    POIN_KETENTUAN_1: rincianLines[0] ?? strOrNull(fv.rincian) ?? 'Ketentuan berlaku sejak tanggal ditetapkan.',
    POIN_KETENTUAN_2: rincianLines[1] ?? 'Hal-hal yang belum diatur akan disampaikan kemudian.',
    PEJABAT_PENERIMA_INTERNAL: strOrNull(fv.yth_internal),
    PEJABAT_PENGIRIM_INTERNAL: strOrNull(fv.dari_internal),
    JABATAN_PENGIRIM_INTERNAL: strOrNull(fv.dari_internal) ?? kopTitle,
    TANGGAL_NOTA: docLongDate,
    HAL_NOTA: strOrNull(fv.hal_nota),
    ISI_KOORDINASI_INTERNAL_MADRASAH: strOrNull(fv.isi_nota),

    // 5. Keterangan & Pengantar (S11–S15)
    NAMA_GURU: primaryTeacher?.name ?? null,
    // Privasi NIP guru terjaga; gunakan Kode Pegawai non-PII agar bebas kolom kosong
    IDENTITAS_KEPEGAWAIAN_GURU: primaryTeacher?.code ?? '-',
    NIP_GURU: primaryTeacher?.code ?? '-',
    MAPEL_DIAMPUNYA: resolvedPrimarySubjects,
    TMT_MENGAJAR: formatIndonesianLongDate(strOrNull(fv.tmt_mengajar)) ?? docLongDate,
    KEPERLUAN_SURAT: strOrNull(fv.keperluan) ?? 'kelengkapan administrasi yang bersangkutan',
    URAIAN_TUGAS_GURU: strOrNull(fv.uraian_tugas),
    NOMOR_SK_RUJUKAN: strOrNull(fv.nomor_sk_rujukan) ?? 'Penetapan Kepala Madrasah yang berlaku',
    NAMA_LENGKAP_SISWA: strOrNull(fv.nama_siswa),
    NAMA_SISWA: strOrNull(fv.nama_siswa),
    NOMOR_INDUK_SISWA: strOrNull(fv.nisn),
    TTL_SISWA: strOrNull(fv.ttl_siswa),
    NAMA_KELAS: className ?? strOrNull(fv.kelas_id) ?? 'Aktif Terdaftar',
    KEPERLUAN_SISWA: strOrNull(fv.keperluan) ?? 'kelengkapan administrasi peserta didik',
    NAMA_YANG_DIREKOMENDASIKAN: strOrNull(fv.subjek_rekomendasi),
    STATUS_PENERIMA_REKOMENDASI: strOrNull(fv.status_penerima) ?? `Warga ${kopSchool}`,
    PROGRAM_TUJUAN_REKOMENDASI: strOrNull(fv.tujuan_program),
    DASAR_PERTIMBANGAN_REKOMENDASI: strOrNull(fv.dasar_pertimbangan),

    // 6. Berita Acara & Laporan (S16–S22)
    HARI_TANGGAL_BA: formatIndonesianDayDate(strOrNull(fv.tanggal_ba)) ?? docDayDate,
    LOKASI_BA: strOrNull(fv.lokasi_ba) ?? kopSchool,
    PIHAK_PERTAMA: strOrNull(fv.pihak_pertama),
    PIHAK_KEDUA: strOrNull(fv.pihak_kedua),
    NAMA_PIHAK_KEDUA: strOrNull(fv.pihak_kedua) ?? primaryTeacher?.name ?? 'Penerima / Petugas',
    JUDUL_RAPAT: strOrNull(fv.judul_rapat),
    WAKTU_TEMPAT_RAPAT: strOrNull(fv.waktu_tempat) ?? `${docDayDate ?? ''}, bertempat di ${kopSchool}`,
    JUMLAH_PESERTA: strOrNull(fv.jumlah_peserta) ?? 'seluruh',
    BUTIR_KEPUTUSAN_1: keputusanLines[0] ?? strOrNull(fv.hasil_keputusan) ?? 'Ketentuan dan keputusan rapat dicatat sesuai hasil musyawarah.',
    BUTIR_KEPUTUSAN_2: keputusanLines[1] ?? 'Keputusan mulai berlaku sejak tanggal ditetapkan.',
    NAMA_MAPEL: subjectName ?? strOrNull(fv.mapel) ?? '-',
    HARI_TANGGAL_SESI: docDayDate ?? docLongDate,
    RUANG_UJIAN: strOrNull(fv.ruang_ujian),
    JUMLAH_HADIR: strOrNull(fv.rekap_peserta) ?? '-',
    JUMLAH_TERDAFTAR: 'terdaftar',
    CATATAN_KEJADIAN_KHUSUS:
      strOrNull(fv.kejadian_khusus) ?? 'Sesuai catatan pengawas ruang.',
    PIMPINAN_RAPAT: pimpinanParts[0] ?? kopName ?? kopTitle,
    NAMA_NOTULIS: pimpinanParts[1] ?? 'Notulis Rapat',
    LATAR_BELAKANG_DAN_TUJUAN_KEGIATAN:
      strOrNull(fv.pelaksanaan) ??
      `Laporan ini disusun sebagai bentuk pertanggungjawaban pelaksanaan kegiatan ${strOrNull(fv.nama_kegiatan) ?? draft.title} di lingkungan ${kopSchool}.`,
    NAMA_PELAKSANA: primaryTeacher?.name ?? 'Pelaksana Tugas',
    NAMA_PELATIHAN: strOrNull(fv.nama_kegiatan) ?? draft.title.replace(/^Laporan[^:]*:\s*/i, ''),
    NOMOR_SURAT_TUGAS: strOrNull(fv.nomor_surat_tugas) ?? '-',
    RINGKASAN_MATERI_DAN_RENCANA_DISEMINASI: strOrNull(fv.ringkasan_materi),

    // 7. Administrasi & Kanvas Kosong (S23–S30)
    PIHAK_PEMBERI_IZIN: strOrNull(fv.pihak_tujuan),
    TANGGAL_KEGIATAN: strOrNull(fv.detail_kegiatan) ?? docDayDate,
    NAMA_ATAU_INSTANSI_NARASUMBER: strOrNull(fv.narasumber),
    NAMA_ACARA: strOrNull(fv.tema_materi) ?? draft.title,
    TEMA_MATERI: strOrNull(fv.tema_materi),
    WAKTU_SESI: strOrNull(fv.waktu_sesi),
    TEMPAT_ACARA: kopSchool,
    SASARAN_PESERTA: `Pendidik dan Peserta Didik ${kopSchool}`,
    KELAS_SASARAN: strOrNull(fv.sasaran_wali),
    HARI_TANGGAL_PERTEMUAN: strOrNull(fv.jadwal_pertemuan) ?? docDayDate,
    PUKUL_PERTEMUAN: 'Sesuai jadwal',
    TEMPAT_PERTEMUAN: kopSchool,
    AGENDA_PERTEMUAN_WALI: strOrNull(fv.agenda),
    WAKTU_PANGGILAN: strOrNull(fv.waktu_panggilan),
    RUANG_KONSULTASI: `Ruang BK / Kantor ${kopSchool}`,
    PEJABAT_YANG_DITEMUI: strOrNull(fv.menemui),
    SASARAN_KELAS: strOrNull(fv.sasaran_orang_tua),
    POKOK_PEMBERITAHUAN_KEPADA_ORANG_TUA: strOrNull(fv.isi_pemberitahuan),
    INSTANSI_CALON_MITRA: strOrNull(fv.instansi_mitra),
    LOKASI_MITRA: 'Tempat',
    RUANG_LINGKUP_KERJA_SAMA: strOrNull(fv.ruang_lingkup),
    NAMA_PIHAK_MENYATAKAN: strOrNull(fv.pihak_menyatakan),
    JABATAN_PIHAK_MENYATAKAN: strOrNull(fv.keperluan_pernyataan) ?? `Unsur ${kopSchool}`,
    BUTIR_PERNYATAAN_1: pernyataanLines[0] ?? strOrNull(fv.isi_pernyataan) ?? 'Data yang disampaikan adalah benar dan dapat dipertanggungjawabkan.',
    BUTIR_PERNYATAAN_2: pernyataanLines[1] ?? 'Apabila di kemudian hari ditemukan ketidaksesuaian, saya bersedia mempertanggungjawabkannya sesuai ketentuan.',
    JUDUL_DOKUMEN_BEBAS: strOrNull(fv.judul_dokumen) ?? strOrNull(draft.title),
    ISI_NASKAH_DOKUMEN:
      'Tuliskan isi naskah dokumen resmi madrasah pada bagian ini.',
    KONTEN_DOKUMEN_BEBAS_DIMULAI_DI_DOCUMENT_STUDIO:
      'Tuliskan isi naskah dokumen resmi madrasah pada bagian ini.',
  };

  // Alias peserta dinamis 1..N berdasarkan snapshot guru terpilih
  teachers.forEach((t, idx) => {
    const n = idx + 1;
    map[`NAMA_PESERTA_${n}`] = t.name;
    map[`JABATAN_PESERTA_${n}`] = t.roleTitle ?? 'Pendidik / Pegawai';
    map[`IDENTITAS_PESERTA_${n}`] = t.code ?? '-';
    map[`NAMA_GURU_${n}`] = t.name;
    map[`JABATAN_TAMBAHAN_${n}`] = t.roleTitle ?? 'Tugas Tambahan Pendidik';
    map[`UNIT_ROMBEL_${n}`] = kopSchool;
    map[`RUANG_${n}`] = `Ruang ${String(n).padStart(2, '0')}`;
  });

  // Alias beban kerja SK Pembagian Tugas dari ScheduleVersion snapshot
  if (scheduleVer?.teacherWorkloads) {
    scheduleVer.teacherWorkloads.forEach((w, idx) => {
      const n = idx + 1;
      const realSubjects =
        w.subjectsTaught && w.subjectsTaught.length > 0
          ? w.subjectsTaught.join(', ')
          : `Sesuai Jadwal (${scheduleVer.label})`;
      const realClasses =
        w.classesTaught && w.classesTaught.length > 0
          ? `${w.classesTaught.join(', ')} (${w.classesCount} rombel)`
          : `${w.classesCount} rombel`;
      map[`NAMA_GURU_${n}`] = w.teacherName;
      map[`TOTAL_JP_${n}`] = String(w.totalJP);
      map[`ROMBEL_GURU_${n}`] = realClasses;
      map[`MAPEL_GURU_${n}`] = realSubjects;
    });
  }

  return map;
}

function interpolateTokens(
  rawText: string,
  aliasMap: Record<string, string | null>,
  resolvedTracker: Set<string>,
  unresolvedTracker: Set<string>
): string {
  return rawText.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_match, tokenName: string) => {
    const resolved = aliasMap[tokenName];
    if (typeof resolved === 'string') {
      if (resolved.trim().length > 0) {
        resolvedTracker.add(tokenName);
        return resolved;
      }
      // Empty string intentional (e.g., no NIP for private madrasah headmaster)
      return '';
    }
    unresolvedTracker.add(tokenName);
    // Tampilkan token bersih agar checklist dapat melacak kekosongan tanpa teks teknis "[Belum diisi]" di kertas surat
    if (NUMBER_TOKENS.has(tokenName)) {
      return `{{${tokenName}}}`;
    }
    return `{{${tokenName}}}`;
  });
}

function createTextNode(text: string, marks?: TipTapJSONMark[]): TipTapJSONNode {
  return marks && marks.length > 0
    ? { type: 'text', text, marks }
    : { type: 'text', text };
}

function createRichParagraphNode(
  segments: Array<{ text: string; bold?: boolean; italic?: boolean; underline?: boolean }>,
  options?: { align?: 'left' | 'center' | 'right' | 'justify' }
): TipTapJSONNode {
  const attrs = options?.align ? { textAlign: options.align } : undefined;
  const content: TipTapJSONNode[] = [];
  for (const seg of segments) {
    if (!seg.text) continue;
    const marks: TipTapJSONMark[] = [];
    if (seg.bold) marks.push({ type: 'bold' });
    if (seg.italic) marks.push({ type: 'italic' });
    if (seg.underline) marks.push({ type: 'underline' });
    content.push(createTextNode(seg.text, marks));
  }
  return {
    type: 'paragraph',
    ...(attrs ? { attrs } : {}),
    content,
  };
}

function createParagraphNode(
  text: string,
  options?: { align?: 'left' | 'center' | 'right' | 'justify'; bold?: boolean; italic?: boolean; underline?: boolean }
): TipTapJSONNode {
  const attrs = options?.align ? { textAlign: options.align } : undefined;
  const marks: TipTapJSONMark[] = [];
  if (options?.bold) marks.push({ type: 'bold' });
  if (options?.italic) marks.push({ type: 'italic' });
  if (options?.underline) marks.push({ type: 'underline' });
  return {
    type: 'paragraph',
    ...(attrs ? { attrs } : {}),
    content: text ? [createTextNode(text, marks)] : [],
  };
}

function createHeadingNode(
  text: string,
  level: 1 | 2 | 3,
  align?: 'left' | 'center' | 'right' | 'justify',
  underline?: boolean
): TipTapJSONNode {
  const marks: TipTapJSONMark[] | undefined = underline ? [{ type: 'underline' }] : undefined;
  return {
    type: 'heading',
    attrs: { level, ...(align ? { textAlign: align } : {}) },
    content: [createTextNode(text, marks)],
  };
}

function buildBorderlessMetaTable(
  rows: Array<{ label: string; value: string }>
): TipTapJSONNode {
  return {
    type: 'table',
    attrs: { tableLayout: 'meta', repeatHeader: false },
    content: rows.map((r) => ({
      type: 'tableRow',
      content: [
        { type: 'tableCell', content: [createParagraphNode(r.label)] },
        { type: 'tableCell', content: [createParagraphNode(':')] },
        { type: 'tableCell', content: [createParagraphNode(r.value, { align: 'justify' })] },
      ],
    })),
  };
}

function buildCorrespondenceLetterHeader(params: {
  numberToken: string;
  sifat?: string | null;
  lampiran?: string | null;
  hal: string;
  titimangsa: string;
}): TipTapJSONNode {
  const leftRows: Array<[string, string]> = [['Nomor', params.numberToken]];
  if (params.sifat && params.sifat.trim()) {
    leftRows.push(['Sifat', params.sifat.trim()]);
  }
  leftRows.push(['Lampiran', params.lampiran?.trim() || '-']);
  leftRows.push(['Hal', params.hal]);

  return {
    type: 'table',
    attrs: { tableLayout: 'letter_header', repeatHeader: false },
    content: leftRows.map(([label, val], idx) => ({
      type: 'tableRow',
      content: [
        { type: 'tableCell', content: [createParagraphNode(label)] },
        { type: 'tableCell', content: [createParagraphNode(':')] },
        {
          type: 'tableCell',
          content: [createParagraphNode(val, { bold: label === 'Hal' })],
        },
        {
          type: 'tableCell',
          content: [
            createParagraphNode(idx === 0 ? params.titimangsa : '', { align: 'right' }),
          ],
        },
      ],
    })),
  };
}

function buildRecipientAddressBlock(recipient: string, location = 'Tempat'): TipTapJSONNode[] {
  return [
    createParagraphNode(''),
    createParagraphNode(`Yth. ${recipient}`),
    createParagraphNode('di'),
    createParagraphNode(location),
    createParagraphNode(''),
  ];
}

function buildKopSuratNodes(draft: DocumentIntakeDraft): TipTapJSONNode[] {
  const kopSnap = findSnapshot(draft, 'settings.madrasah_identity_signatory');
  const kop = (kopSnap?.capturedValue ?? {}) as FrozenKopSnapshot;

  const nodes: TipTapJSONNode[] = [];
  nodes.push(
    createParagraphNode((strOrNull(kop.schoolName) ?? '{{NAMA_MADRASAH}}').toUpperCase(), {
      align: 'center',
      bold: true,
    })
  );
  if (strOrNull(kop.ministry)) {
    nodes.push(createParagraphNode(strOrNull(kop.ministry)!, { align: 'center', bold: true }));
  }
  if (strOrNull(kop.regionalOffice)) {
    nodes.push(createParagraphNode(strOrNull(kop.regionalOffice)!, { align: 'center' }));
  }
  if (strOrNull(kop.legalDecree)) {
    nodes.push(createParagraphNode(strOrNull(kop.legalDecree)!, { align: 'center' }));
  }
  const regLine = formatKopRegistryLine(strOrNull(kop.nsm) ?? undefined, strOrNull(kop.npsn) ?? undefined);
  if (regLine) {
    nodes.push(createParagraphNode(regLine, { align: 'center' }));
  }
  if (strOrNull(kop.accreditation)) {
    nodes.push(createParagraphNode(strOrNull(kop.accreditation)!.toUpperCase(), { align: 'center', bold: true }));
  }
  const addrLine = formatKopAddressLine({
    address: strOrNull(kop.address) ?? undefined,
    city: strOrNull(kop.city) ?? undefined,
    postalCode: strOrNull(kop.postalCode) ?? undefined,
    phone: strOrNull(kop.phone) ?? undefined,
    email: strOrNull(kop.email) ?? undefined,
    website: strOrNull(kop.website) ?? undefined,
  });
  if (addrLine) {
    nodes.push(createParagraphNode(addrLine, { align: 'center' }));
  }
  nodes.push({ type: 'horizontalRule' });
  return nodes;
}

function buildTableNode(
  columns: string[],
  rows: string[][]
): TipTapJSONNode {
  const headerRow: TipTapJSONNode = {
    type: 'tableRow',
    content: columns.map((col) => ({
      type: 'tableHeader',
      content: [createParagraphNode(col, { bold: true, align: col === 'No' ? 'center' : 'left' })],
    })),
  };

  const bodyRows: TipTapJSONNode[] = rows.map((row) => ({
    type: 'tableRow',
    content: columns.map((col, colIdx) => ({
      type: 'tableCell',
      content: [
        createParagraphNode(row[colIdx] ?? '', {
          align: col === 'No' || col === 'Total JP' ? 'center' : 'left',
        }),
      ],
    })),
  }));

  return {
    type: 'table',
    attrs: { tableLayout: 'grid', repeatHeader: true },
    content: [headerRow, ...bodyRows],
  };
}

function buildExpandedTableRows(
  block: Extract<TemplatePreviewBlock, { type: 'table' }>,
  draft: DocumentIntakeDraft,
  aliasMap: Record<string, string | null>,
  resolvedSet: Set<string>,
  unresolvedSet: Set<string>
): string[][] {
  const fv = draft.fieldValues ?? {};
  const teacherSnap = findSnapshot(draft, 'master.teachers.selected');
  const teachers = Array.isArray(teacherSnap?.capturedValue)
    ? (teacherSnap!.capturedValue as FrozenTeacherSnapshot[])
    : [];

  const verSnap = findSnapshot(draft, 'history.schedule_version');
  const scheduleVer = (verSnap?.capturedValue ?? null) as FrozenScheduleVersionSnapshot | null;

  const firstSampleJoined = block.sampleRows[0]?.join(' ') ?? '';

  // 1. Tabel peserta Surat Tugas (SYS-TPL-01 / 02)
  if (firstSampleJoined.includes('{{NAMA_PESERTA_1}}') && teachers.length > 0) {
    return teachers.map((t, idx) => [
      String(idx + 1),
      t.name,
      t.code || '-',
      t.roleTitle || 'Pendidik / Pegawai',
    ]);
  }

  // 2. Tabel SK Pembagian Tugas Mengajar (SYS-TPL-03) berbasis ScheduleVersion snapshot dengan Mapel & Rombel nyata
  if (
    firstSampleJoined.includes('{{TOTAL_JP_1}}') &&
    scheduleVer?.teacherWorkloads &&
    scheduleVer.teacherWorkloads.length > 0
  ) {
    return scheduleVer.teacherWorkloads.map((w, idx) => [
      String(idx + 1),
      w.teacherName,
      w.subjectsTaught && w.subjectsTaught.length > 0
        ? w.subjectsTaught.join(', ')
        : `Sesuai Jadwal (${scheduleVer.label})`,
      w.classesTaught && w.classesTaught.length > 0
        ? `${w.classesTaught.join(', ')} (${w.classesCount} rombel)`
        : `${w.classesCount} rombel`,
      `${w.totalJP} JP`,
    ]);
  }

  // 3. Tabel pengawas ujian (SYS-TPL-06)
  if (firstSampleJoined.includes('{{NAMA_PENGAWAS_1}}') && teachers.length > 0) {
    return teachers.map((t, idx) => [
      String(idx + 1),
      t.name,
      'Pengawas Ruang',
      `Ruang ${String(idx + 1).padStart(2, '0')}`,
      interpolateTokens('{{PERIODE_UJIAN}}', aliasMap, resolvedSet, unresolvedSet),
    ]);
  }

  // 4. Tabel SK Tugas Tambahan (SYS-TPL-04)
  if (firstSampleJoined.includes('{{JABATAN_TAMBAHAN_1}}') && teachers.length > 0) {
    const customRoles = splitOperatorLines(strOrNull(fv.catatan_khusus), []);
    return teachers.map((t, idx) => [
      String(idx + 1),
      t.name,
      customRoles[idx] || t.roleTitle || 'Tugas Tambahan Pendidik',
      interpolateTokens(`{{UNIT_ROMBEL_${idx + 1}}}`, aliasMap, resolvedSet, unresolvedSet),
      interpolateTokens('{{PERIODE_TMT}}', aliasMap, resolvedSet, unresolvedSet),
    ]);
  }

  // 5. Tabel SK Panitia (SYS-TPL-05)
  if (firstSampleJoined.includes('{{NAMA_KETUA_PANITIA}}') && teachers.length > 0) {
    const defaultPanitiaRoles = ['Ketua Panitia', 'Sekretaris', 'Bendahara', 'Anggota'];
    const customRoles = splitOperatorLines(strOrNull(fv.catatan_khusus), []);
    return teachers.map((t, idx) => [
      String(idx + 1),
      t.name,
      t.roleTitle || 'Pendidik / Pegawai',
      customRoles[idx] || defaultPanitiaRoles[Math.min(idx, defaultPanitiaRoles.length - 1)],
    ]);
  }

  // 6. Tabel Surat Pengantar (SYS-TPL-13)
  if (firstSampleJoined.includes('{{NAMA_BERKAS_1}}')) {
    const items = splitOperatorLines(strOrNull(fv.daftar_berkas), ['-']);
    const qtyDefault = strOrNull(fv.banyaknya_satuan) ?? '-';
    const noteDefault = strOrNull(fv.keterangan_pengantar) ?? '-';
    return items.map((item, idx) => {
      const cols = parseDelimitedCells(item);
      return [
        String(idx + 1),
        cols[0] || item,
        cols[1] || qtyDefault,
        cols[2] || noteDefault,
      ];
    });
  }

  // 7. Tabel Berita Acara Serah Terima (SYS-TPL-16)
  if (firstSampleJoined.includes('{{OBJEK_ITEM_1}}')) {
    const items = splitOperatorLines(strOrNull(fv.objek_serah_terima), ['-']);
    const condDefault = strOrNull(fv.kondisi_barang) ?? '-';
    return items.map((item, idx) => {
      const cols = parseDelimitedCells(item);
      return [
        String(idx + 1),
        cols[0] || item,
        cols[1] || '-',
        cols[2] || condDefault,
      ];
    });
  }

  // 8. Tabel Notula Rapat (SYS-TPL-19)
  if (firstSampleJoined.includes('{{TINDAK_LANJUT_1}}')) {
    const items = splitOperatorLines(strOrNull(fv.ringkasan_bahasan), ['-']);
    const pjDefault = strOrNull(fv.pj_tindak_lanjut) ?? '-';
    const targetDefault = strOrNull(fv.target_waktu_rtl) ?? '-';
    return items.map((item, idx) => {
      const cols = parseDelimitedCells(item);
      return [
        String(idx + 1),
        cols[0] || item,
        cols[1] || pjDefault,
        cols[2] || targetDefault,
      ];
    });
  }

  // 9. Tabel Laporan Kegiatan (SYS-TPL-20)
  if (firstSampleJoined.includes('{{INDIKATOR_1}}')) {
    const items = splitOperatorLines(strOrNull(fv.capaian), ['-']);
    const realisasiDefault = strOrNull(fv.status_realisasi) ?? '-';
    const evalDefault = strOrNull(fv.catatan_evaluasi) ?? '-';
    return items.map((item) => {
      const cols = parseDelimitedCells(item);
      return [
        cols[0] || item,
        cols[1] || '-',
        cols[2] || realisasiDefault,
        cols[3] || evalDefault,
      ];
    });
  }

  // 10. Tabel Laporan Ujian (SYS-TPL-22)
  if (firstSampleJoined.includes('{{ROMBEL_1}}')) {
    const items = splitOperatorLines(strOrNull(fv.rekap_kelas), ['-']);
    const attendanceDefault = strOrNull(fv.tingkat_kehadiran) ?? '-';
    return items.map((item, idx) => {
      const cols = parseDelimitedCells(item);
      return [
        String(idx + 1),
        cols[0] || item,
        cols[1] || '-',
        cols[2] || attendanceDefault,
        cols[3] || '-',
      ];
    });
  }

  // Default: interpolasi setiap sel sampleRows secara deterministik
  return block.sampleRows.map((row) =>
    row.map((cell) => interpolateTokens(cell, aliasMap, resolvedSet, unresolvedSet))
  );
}

/**
 * Blok tanda tangan resmi Tata Naskah Dinas Indonesia:
 * - Borderless (`tableLayout: 'signature'`)
 * - Posisi kolom kanan (~55% dari kiri) dengan teks RATA KIRI di dalamnya (bukan align right!).
 * - Jika penandatangan tidak memiliki NIP (umum di madrasah swasta/yayasan), nama otomatis tebal + garis bawah.
 */
function buildSignatureNodes(
  block: Extract<TemplatePreviewBlock, { type: 'signature' }>,
  draft: DocumentIntakeDraft,
  aliasMap: Record<string, string | null>,
  resolvedSet: Set<string>,
  unresolvedSet: Set<string>,
  options?: { omitTitimangsa?: boolean; ditetapkanStyle?: boolean; tembusan?: string[] }
): TipTapJSONNode[] {
  const kopSnap = findSnapshot(draft, 'settings.madrasah_identity_signatory');
  const kop = (kopSnap?.capturedValue ?? {}) as FrozenKopSnapshot;
  const city = strOrNull(kop.city) ?? '[Kota Madrasah]';
  const dateText = formatIndonesianLongDate(draft.documentDate) ?? draft.documentDate;
  const titimangsa = `${city}, ${dateText}`;

  const delegationModeRaw = strOrNull(draft.fieldValues?.penandatangan_mode);
  const delegationMode: SignatoryDelegationMode =
    delegationModeRaw === 'an' || delegationModeRaw === 'plt' ? delegationModeRaw : 'direct';
  const targetsHeadmaster =
    block.rightName.includes('NAMA_KEPALA_MADRASAH') ||
    block.rightTitle.includes('JABATAN_KEPALA_MADRASAH');

  if (delegationMode !== 'direct' && targetsHeadmaster) {
    const headTitle = strOrNull(kop.signatoryTitle) ?? 'Kepala Madrasah';
    const headName = strOrNull(kop.signatoryName) ?? 'Kepala Madrasah';
    const headNip = strOrNull(kop.signatoryNip) ?? '';
    const customDelTitle = strOrNull(draft.fieldValues?.penandatangan_delegasi_jabatan);
    const customDelName = strOrNull(draft.fieldValues?.penandatangan_delegasi_nama);
    const delegateTitle =
      customDelTitle ??
      strOrNull(kop.curriculumLeaderTitle) ??
      'Wakil Kepala Bidang Kurikulum';
    const delegateName =
      customDelName ??
      (delegationMode === 'an'
        ? strOrNull(kop.curriculumLeaderName) ?? headName
        : strOrNull(kop.curriculumLeaderName) ?? headName);

    const leftTitle = block.leftTitle
      ? interpolateTokens(block.leftTitle, aliasMap, resolvedSet, unresolvedSet)
      : undefined;
    const leftName = block.leftTitle
      ? interpolateTokens(block.leftName ?? '', aliasMap, resolvedSet, unresolvedSet)
      : undefined;

    const customDelNip = strOrNull(draft.fieldValues?.penandatangan_delegasi_nip);
    const delegatedTable = buildDelegatedSignatureTable({
      mode: delegationMode,
      city,
      dateText,
      headTitle,
      headName,
      headNip,
      delegateTitle,
      delegateName,
      delegateNip: customDelNip ?? (customDelName ? '' : undefined),
      omitTitimangsa: options?.omitTitimangsa,
      ditetapkanStyle: options?.ditetapkanStyle,
      leftTitle,
      leftName,
    });

    const out: TipTapJSONNode[] = [createParagraphNode(''), delegatedTable];
    if (options?.tembusan && options.tembusan.length > 0) {
      out.push(createParagraphNode(''));
      out.push(createParagraphNode('Tembusan:', { bold: true }));
      out.push({
        type: 'orderedList',
        attrs: { start: 1 },
        content: options.tembusan.map((t) => ({
          type: 'listItem',
          content: [createParagraphNode(t)],
        })),
      });
    }
    return out;
  }

  const rawRightTitle = interpolateTokens(block.rightTitle, aliasMap, resolvedSet, unresolvedSet);
  const rightTitle = rawRightTitle.endsWith(',') ? rawRightTitle : `${rawRightTitle},`;
  const rightName = interpolateTokens(block.rightName, aliasMap, resolvedSet, unresolvedSet);
  const rightId = block.rightIdLabel
    ? interpolateTokens(block.rightIdLabel, aliasMap, resolvedSet, unresolvedSet).trim()
    : '';
  const hasNip = Boolean(rightId);

  const rightCellNodes: TipTapJSONNode[] = [];
  if (options?.ditetapkanStyle) {
    rightCellNodes.push(createParagraphNode(`Ditetapkan di : ${city}`));
    rightCellNodes.push(createParagraphNode(`Pada tanggal  : ${dateText}`));
    rightCellNodes.push(createParagraphNode(rightTitle));
  } else {
    if (!options?.omitTitimangsa) {
      rightCellNodes.push(createParagraphNode(titimangsa));
    }
    rightCellNodes.push(createParagraphNode(rightTitle));
  }
  const rightIsBlankSlot = /^\(\s*\.+\s*\)$/.test(rightName.trim());
  rightCellNodes.push(createParagraphNode(''));
  rightCellNodes.push(createParagraphNode(''));
  rightCellNodes.push(createParagraphNode(''));
  rightCellNodes.push(
    createParagraphNode(rightName, {
      bold: !rightIsBlankSlot,
      underline: !hasNip && !rightIsBlankSlot,
    })
  );
  if (hasNip) {
    rightCellNodes.push(createParagraphNode(rightId));
  }

  let leftCellNodes: TipTapJSONNode[];
  if (block.leftTitle) {
    const leftTitle = interpolateTokens(block.leftTitle, aliasMap, resolvedSet, unresolvedSet);
    const leftName = interpolateTokens(block.leftName ?? '', aliasMap, resolvedSet, unresolvedSet);
    const leftIsBlankSlot = /^\(\s*\.+\s*\)$/.test(leftName.trim());
    leftCellNodes = [
      ...(options?.omitTitimangsa ? [] : [createParagraphNode('')]),
      createParagraphNode(leftTitle),
      createParagraphNode(''),
      createParagraphNode(''),
      createParagraphNode(''),
      createParagraphNode(leftName, {
        bold: !leftIsBlankSlot,
        underline: !leftIsBlankSlot,
      }),
    ];
  } else {
    leftCellNodes = [createParagraphNode('')];
  }

  const out: TipTapJSONNode[] = [
    createParagraphNode(''),
    {
      type: 'table',
      attrs: { tableLayout: 'signature', repeatHeader: false },
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: leftCellNodes },
            { type: 'tableCell', content: rightCellNodes },
          ],
        },
      ],
    },
  ];

  if (options?.tembusan && options.tembusan.length > 0) {
    out.push(createParagraphNode(''));
    out.push(createParagraphNode('Tembusan:', { bold: true }));
    out.push({
      type: 'orderedList',
      attrs: { start: 1 },
      content: options.tembusan.map((t) => ({
        type: 'listItem',
        content: [createParagraphNode(t)],
      })),
    });
  }

  return out;
}

export function normalizeInitialPageSettings(draft: DocumentIntakeDraft): DocumentStudioPageSettings {
  const raw = draft.templateSnapshot?.initialPageSettings;
  const check = validateStudioPageSettings(raw);
  if (check.valid && check.normalized) {
    return check.normalized;
  }
  return {
    paperSize: 'a4',
    orientation: 'portrait',
    marginsMm: { top: 20, right: 20, bottom: 20, left: 25 },
  };
}

/**
 * Membangun naskah autentik Tata Naskah Dinas khusus untuk template inti yang punya anatomi baku Kemenag
 * (Surat Tugas adaptif, SK Pembagian Tugas Mengajar lengkap Menimbang–Mengingat–Diktum–Lampiran,
 * serta Surat Korespondensi & Undangan ber-Nomor/Lampiran/Hal).
 * Mengembalikan `null` bila template menggunakan pipeline blok standar.
 */
function buildSpecializedAuthenticNodes(params: {
  baseTplId: string;
  draft: DocumentIntakeDraft;
  aliasMap: Record<string, string | null>;
  resolvedSet: Set<string>;
  unresolvedSet: Set<string>;
}): TipTapJSONNode[] | null {
  const { baseTplId, draft, aliasMap, resolvedSet, unresolvedSet } = params;
  const fv = draft.fieldValues ?? {};
  const kopSnap = findSnapshot(draft, 'settings.madrasah_identity_signatory');
  const kop = (kopSnap?.capturedValue ?? {}) as FrozenKopSnapshot;
  const teacherSnap = findSnapshot(draft, 'master.teachers.selected');
  const teachers = Array.isArray(teacherSnap?.capturedValue)
    ? (teacherSnap!.capturedValue as FrozenTeacherSnapshot[])
    : [];
  const verSnap = findSnapshot(draft, 'history.schedule_version');
  const scheduleVer = (verSnap?.capturedValue ?? null) as FrozenScheduleVersionSnapshot | null;

  const schoolName = strOrNull(kop.schoolName) ?? 'Madrasah Tsanawiyah';
  const city = strOrNull(kop.city) ?? '[Kota Madrasah]';
  const dateText = formatIndonesianLongDate(draft.documentDate) ?? draft.documentDate;
  const titimangsa = `${city}, ${dateText}`;
  const academicYear = strOrNull(kop.academicYear) ?? '-';
  const semester = strOrNull(kop.semester) ?? '-';

  const sigBlock: Extract<TemplatePreviewBlock, { type: 'signature' }> = {
    type: 'signature',
    rightTitle: '{{JABATAN_KEPALA_MADRASAH}}',
    rightName: '{{NAMA_KEPALA_MADRASAH}}',
    rightIdLabel: '{{NIP_KEPALA_MADRASAH}}',
  };

  // =========================================================================
  // 1. SYS-TPL-01: SURAT TUGAS PELATIHAN / BIMTEK / WORKSHOP (ADAPTIF 1 vs N GURU)
  // =========================================================================
  if (baseTplId === 'SYS-TPL-01') {
    const nodes: TipTapJSONNode[] = [];
    nodes.push(createHeadingNode('SURAT TUGAS', 1, 'center', true));
    nodes.push(
      createParagraphNode(
        interpolateTokens('Nomor : {{NOMOR_SURAT}}', aliasMap, resolvedSet, unresolvedSet),
        { align: 'center' }
      )
    );
    nodes.push(createParagraphNode(''));

    const dasarSurat = strOrNull(fv.dasar_surat);
    const pembuka = dasarSurat
      ? `Yang bertanda tangan di bawah ini, ${strOrNull(kop.signatoryTitle) ?? 'Kepala Madrasah'} ${schoolName}, berdasarkan ${dasarSurat}, dengan ini menugaskan kepada:`
      : `Yang bertanda tangan di bawah ini, ${strOrNull(kop.signatoryTitle) ?? 'Kepala Madrasah'} ${schoolName}, dengan ini menugaskan kepada:`;
    nodes.push(createParagraphNode(pembuka, { align: 'justify' }));

    // Adaptif: 1 peserta -> blok key-value borderless elegan; 2+ peserta -> tabel bernomor
    if (teachers.length === 1) {
      const t = teachers[0];
      nodes.push(
        buildBorderlessMetaTable([
          { label: 'Nama', value: t.name },
          { label: 'Jabatan / Peran', value: t.roleTitle || 'Pendidik / Pegawai' },
          { label: 'Unit Kerja', value: schoolName },
        ])
      );
    } else if (teachers.length > 1) {
      nodes.push(
        buildTableNode(
          ['No', 'Nama Pendidik / Pegawai', 'Kode Pegawai', 'Jabatan / Peran'],
          teachers.map((t, idx) => [
            String(idx + 1),
            t.name,
            t.code || '-',
            t.roleTitle || 'Pendidik / Pegawai',
          ])
        )
      );
    }

    const kegiatan = strOrNull(fv.nama_kegiatan) ?? '-';
    const penyelenggara = strOrNull(fv.penyelenggara) ?? '-';
    const tanggalRentang =
      formatIndonesianDateRange(strOrNull(fv.tanggal_mulai), strOrNull(fv.tanggal_selesai)) ??
      dateText;
    const lokasi = strOrNull(fv.lokasi) ?? '-';

    nodes.push(createParagraphNode('Untuk melaksanakan tugas mengikuti kegiatan sebagai berikut:', { align: 'justify' }));
    nodes.push(
      buildBorderlessMetaTable([
        { label: 'Nama Kegiatan', value: kegiatan },
        { label: 'Penyelenggara', value: penyelenggara },
        { label: 'Hari / Tanggal', value: tanggalRentang },
        { label: 'Tempat', value: lokasi },
      ])
    );

    const catatan = strOrNull(fv.catatan_khusus);
    if (catatan) {
      nodes.push(createParagraphNode(`Catatan: ${catatan}`, { align: 'justify' }));
    }

    nodes.push(
      createParagraphNode(
        'Demikian surat tugas ini dibuat untuk dilaksanakan dengan penuh tanggung jawab, dan setelah selesai melaksanakan tugas agar menyampaikan laporan kepada Kepala Madrasah.',
        { align: 'justify' }
      )
    );
    nodes.push(...buildSignatureNodes(sigBlock, draft, aliasMap, resolvedSet, unresolvedSet));
    return nodes;
  }

  // =========================================================================
  // 2. SYS-TPL-03: SK PEMBAGIAN TUGAS MENGAJAR GURU (ANATOMI HUKUM BAKU KEMENAG)
  // =========================================================================
  if (baseTplId === 'SYS-TPL-03') {
    const nodes: TipTapJSONNode[] = [];
    nodes.push(createHeadingNode(`KEPUTUSAN KEPALA ${schoolName.toUpperCase()}`, 1, 'center'));
    nodes.push(
      createParagraphNode(
        interpolateTokens('NOMOR : {{NOMOR_SK}}', aliasMap, resolvedSet, unresolvedSet),
        { align: 'center', bold: true }
      )
    );
    nodes.push(createParagraphNode('TENTANG', { align: 'center', bold: true }));
    nodes.push(
      createParagraphNode(
        `PEMBAGIAN TUGAS GURU DALAM KEGIATAN BELAJAR MENGAJAR\nTAHUN AJARAN ${academicYear.toUpperCase()} SEMESTER ${semester.toUpperCase()}`,
        { align: 'center', bold: true }
      )
    );
    nodes.push(createParagraphNode(''));
    nodes.push(createParagraphNode(`KEPALA ${schoolName.toUpperCase()},`, { align: 'center', bold: true }));
    nodes.push(createParagraphNode(''));

    const dasarTambahan = strOrNull(fv.dasar_hukum);
    const konsideranRows: Array<{ label: string; value: string }> = [
      {
        label: 'Menimbang',
        value: `a. bahwa dalam rangka memperlancar pelaksanaan proses kegiatan belajar mengajar di ${schoolName} Tahun Ajaran ${academicYear} Semester ${semester}, dipandang perlu menetapkan pembagian tugas mengajar guru;\nb. bahwa berdasarkan pertimbangan sebagaimana dimaksud pada huruf a, perlu menetapkan Keputusan Kepala Madrasah tentang Pembagian Tugas Mengajar Guru.`,
      },
      {
        label: 'Mengingat',
        value: `1. Undang-Undang Nomor 20 Tahun 2003 tentang Sistem Pendidikan Nasional;\n2. Peraturan Pemerintah Nomor 19 Tahun 2005 tentang Standar Nasional Pendidikan beserta perubahannya;\n3. Peraturan Menteri Agama Republik Indonesia tentang Penyelenggaraan Pendidikan Madrasah dan Kurikulum Madrasah yang berlaku.`,
      },
      {
        label: 'Memperhatikan',
        value: dasarTambahan
          ? `${dasarTambahan}; serta hasil penetapan jadwal pelajaran resmi ${scheduleVer ? scheduleVer.label : `Tahun Ajaran ${academicYear} Semester ${semester}`}.`
          : `Hasil Rapat Dewan Guru dan penetapan jadwal pelajaran resmi ${schoolName} Tahun Ajaran ${academicYear} Semester ${semester}.`,
      },
    ];
    nodes.push(buildBorderlessMetaTable(konsideranRows));

    nodes.push(createParagraphNode(''));
    nodes.push(createParagraphNode('MEMUTUSKAN :', { align: 'center', bold: true }));
    nodes.push(createParagraphNode(''));

    nodes.push(
      buildBorderlessMetaTable([
        {
          label: 'Menetapkan',
          value: `KEPUTUSAN KEPALA ${schoolName.toUpperCase()} TENTANG PEMBAGIAN TUGAS GURU DALAM KEGIATAN BELAJAR MENGAJAR TAHUN AJARAN ${academicYear.toUpperCase()} SEMESTER ${semester.toUpperCase()}.`,
        },
        {
          label: 'KESATU',
          value: `Menetapkan pembagian tugas guru dalam kegiatan belajar mengajar Tahun Ajaran ${academicYear} Semester ${semester} sebagaimana tercantum dalam Lampiran yang merupakan bagian tidak terpisahkan dari Keputusan ini.`,
        },
        {
          label: 'KEDUA',
          value: 'Masing-masing guru melaporkan pelaksanaan tugasnya secara tertulis dan berkala kepada Kepala Madrasah.',
        },
        {
          label: 'KETIGA',
          value: 'Segala biaya yang timbul akibat pelaksanaan Keputusan ini dibebankan pada anggaran madrasah yang sesuai.',
        },
        {
          label: 'KEEMPAT',
          value: 'Keputusan ini mulai berlaku pada tanggal ditetapkan, dengan ketentuan apabila di kemudian hari terdapat kekeliruan akan diadakan perbaikan sebagaimana mestinya.',
        },
      ])
    );

    const regionalOffice = strOrNull(kop.regionalOffice);
    nodes.push(
      ...buildSignatureNodes(sigBlock, draft, aliasMap, resolvedSet, unresolvedSet, {
        ditetapkanStyle: true,
        tembusan: [
          'Ketua Yayasan / Penyelenggara Madrasah',
          regionalOffice
            ? `Pengawas Madrasah ${regionalOffice}`
            : 'Pengawas Madrasah Kantor Kementerian Agama Setempat',
          'Yang bersangkutan untuk dilaksanakan sebagaimana mestinya',
          'Arsip',
        ],
      })
    );

    // Halaman Lampiran SK berisi jadwal & mapel nyata per guru
    nodes.push({ type: 'pageBreak' });
    nodes.push(
      buildBorderlessMetaTable([
        { label: 'Lampiran', value: `Keputusan Kepala ${schoolName}` },
        {
          label: 'Nomor',
          value: interpolateTokens('{{NOMOR_SK}}', aliasMap, resolvedSet, unresolvedSet),
        },
        { label: 'Tanggal', value: dateText },
        {
          label: 'Tentang',
          value: `Pembagian Tugas Mengajar Guru Tahun Ajaran ${academicYear} Semester ${semester}`,
        },
      ])
    );
    nodes.push(createParagraphNode(''));
    nodes.push(
      createHeadingNode(
        `DAFTAR PEMBAGIAN TUGAS MENGAJAR GURU TAHUN AJARAN ${academicYear.toUpperCase()} SEMESTER ${semester.toUpperCase()}`,
        2,
        'center'
      )
    );

    const workloads = scheduleVer?.teacherWorkloads ?? [];
    if (workloads.length > 0) {
      nodes.push(
        buildTableNode(
          ['No', 'Nama Guru', 'Mata Pelajaran', 'Kelas / Rombel', 'Total JP'],
          workloads.map((w, idx) => [
            String(idx + 1),
            w.teacherName,
            w.subjectsTaught && w.subjectsTaught.length > 0
              ? w.subjectsTaught.join(', ')
              : `Sesuai Jadwal (${scheduleVer?.label ?? 'Resmi'})`,
            w.classesTaught && w.classesTaught.length > 0
              ? `${w.classesTaught.join(', ')} (${w.classesCount} rombel)`
              : `${w.classesCount} rombel`,
            `${w.totalJP} JP`,
          ])
        )
      );
    }

    nodes.push(...buildSignatureNodes(sigBlock, draft, aliasMap, resolvedSet, unresolvedSet));
    return nodes;
  }

  // =========================================================================
  // 3. SYS-TPL-07: SURAT UNDANGAN RAPAT (TATA NASKAH KORESPONDENSI KEMENAG)
  // =========================================================================
  if (baseTplId === 'SYS-TPL-07') {
    const agenda = strOrNull(fv.agenda_rapat) ?? 'Rapat Koordinasi Madrasah';
    const recipient = strOrNull(fv.kepada) ?? 'Bapak/Ibu Dewan Guru dan Staf Tata Usaha';
    const waktuRapat = strOrNull(fv.waktu_rapat) ?? dateText;
    const tempatRapat = strOrNull(fv.tempat_rapat) ?? `Ruang Rapat ${schoolName}`;

    const nodes: TipTapJSONNode[] = [];
    nodes.push(
      buildCorrespondenceLetterHeader({
        numberToken: interpolateTokens('{{NOMOR_SURAT}}', aliasMap, resolvedSet, unresolvedSet),
        lampiran: '-',
        hal: `Undangan ${agenda}`,
        titimangsa,
      })
    );
    nodes.push(...buildRecipientAddressBlock(recipient, 'Tempat'));
    nodes.push(
      createRichParagraphNode([
        { text: 'Assalamu’alaikum warahmatullahi wabarakatuh.', italic: true },
      ])
    );
    nodes.push(
      createParagraphNode(
        `Puji syukur kita panjatkan ke hadirat Allah SWT atas segala limpahan rahmat dan karunia-Nya. Sehubungan dengan agenda kegiatan di lingkungan ${schoolName}, kami mengharap kehadiran Bapak/Ibu pada:`,
        { align: 'justify' }
      )
    );
    nodes.push(
      buildBorderlessMetaTable([
        { label: 'Hari / Tanggal & Waktu', value: waktuRapat },
        { label: 'Tempat', value: tempatRapat },
        { label: 'Acara / Agenda', value: agenda },
      ])
    );
    nodes.push(
      createParagraphNode(
        'Mengingat pentingnya acara tersebut, dimohon Bapak/Ibu berkenan hadir tepat pada waktunya. Atas perhatian dan kehadiran Bapak/Ibu, kami ucapkan terima kasih.',
        { align: 'justify' }
      )
    );
    nodes.push(
      createRichParagraphNode([
        { text: 'Wassalamu’alaikum warahmatullahi wabarakatuh.', italic: true },
      ])
    );
    nodes.push(
      ...buildSignatureNodes(sigBlock, draft, aliasMap, resolvedSet, unresolvedSet, {
        omitTitimangsa: true,
      })
    );
    return nodes;
  }

  // =========================================================================
  // 4. SYS-TPL-08: SURAT DINAS KELUAR (TATA NASKAH KORESPONDENSI KEMENAG)
  // =========================================================================
  if (baseTplId === 'SYS-TPL-08') {
    const instansi = strOrNull(fv.instansi_tujuan) ?? 'Pimpinan Instansi Tujuan';
    const sifat = strOrNull(fv.sifat_surat) ?? 'Biasa';
    const perihal = strOrNull(fv.perihal) ?? draft.subject;
    const isiPokok = strOrNull(fv.isi_pokok) ?? '';

    const nodes: TipTapJSONNode[] = [];
    nodes.push(
      buildCorrespondenceLetterHeader({
        numberToken: interpolateTokens('{{NOMOR_SURAT}}', aliasMap, resolvedSet, unresolvedSet),
        sifat,
        lampiran: '-',
        hal: perihal,
        titimangsa,
      })
    );
    nodes.push(...buildRecipientAddressBlock(instansi, 'Tempat'));
    nodes.push(
      createRichParagraphNode([
        { text: 'Assalamu’alaikum warahmatullahi wabarakatuh.', italic: true },
      ])
    );
    nodes.push(
      createParagraphNode(
        `Dengan hormat, bersama surat ini kami sampaikan hal-hal terkait ${perihal} di lingkungan ${schoolName} sebagai berikut:`,
        { align: 'justify' }
      )
    );
    if (isiPokok) {
      nodes.push(createParagraphNode(isiPokok, { align: 'justify' }));
    }
    nodes.push(
      createParagraphNode(
        'Demikian surat ini kami sampaikan. Atas perhatian, dukungan, dan kerja sama Bapak/Ibu, kami ucapkan terima kasih.',
        { align: 'justify' }
      )
    );
    nodes.push(
      createRichParagraphNode([
        { text: 'Wassalamu’alaikum warahmatullahi wabarakatuh.', italic: true },
      ])
    );
    nodes.push(
      ...buildSignatureNodes(sigBlock, draft, aliasMap, resolvedSet, unresolvedSet, {
        omitTitimangsa: true,
      })
    );
    return nodes;
  }

  // =========================================================================
  // 5. SYS-TPL-23..28: SURAT KORESPONDENSI ADMINISTRASI MADRASAH
  // =========================================================================
  if (
    baseTplId === 'SYS-TPL-23' ||
    baseTplId === 'SYS-TPL-24' ||
    baseTplId === 'SYS-TPL-25' ||
    baseTplId === 'SYS-TPL-26' ||
    baseTplId === 'SYS-TPL-27' ||
    baseTplId === 'SYS-TPL-28'
  ) {
    const nodes: TipTapJSONNode[] = [];
    let hal = draft.subject;
    let sifat: string | null = 'Biasa';
    let recipient = 'Bapak/Ibu';
    const bodyNodes: TipTapJSONNode[] = [];

    if (baseTplId === 'SYS-TPL-23') {
      hal = `Permohonan Izin Kegiatan`;
      recipient = strOrNull(fv.pihak_tujuan) ?? 'Pimpinan Instansi';
      bodyNodes.push(
        createParagraphNode(
          `Dengan hormat, dalam rangka mendukung pelaksanaan program pendidikan di ${schoolName}, kami bermaksud mengajukan permohonan izin penyelenggaraan kegiatan dengan rincian sebagai berikut:`,
          { align: 'justify' }
        ),
        buildBorderlessMetaTable([
          { label: 'Kegiatan / Jadwal', value: strOrNull(fv.detail_kegiatan) ?? '-' },
          { label: 'Jumlah Peserta', value: strOrNull(fv.jumlah_peserta) ?? '-' },
        ]),
        createParagraphNode(
          'Demikian permohonan izin ini kami sampaikan. Atas perhatian dan berkenannya Bapak/Ibu memberikan izin, kami ucapkan terima kasih.',
          { align: 'justify' }
        )
      );
    } else if (baseTplId === 'SYS-TPL-24') {
      hal = `Permohonan Narasumber`;
      recipient = strOrNull(fv.narasumber) ?? 'Calon Narasumber';
      bodyNodes.push(
        createParagraphNode(
          `Dengan hormat, dalam rangka peningkatan mutu dan pengembangan wawasan di lingkungan ${schoolName}, kami bermaksud mengundang Bapak/Ibu untuk berkenan menjadi narasumber pada kegiatan berikut:`,
          { align: 'justify' }
        ),
        buildBorderlessMetaTable([
          { label: 'Tema / Materi', value: strOrNull(fv.tema_materi) ?? '-' },
          { label: 'Waktu & Tempat', value: strOrNull(fv.waktu_sesi) ?? '-' },
          { label: 'Peserta', value: `Pendidik dan/atau Peserta Didik ${schoolName}` },
        ]),
        createParagraphNode(
          'Besar harapan kami Bapak/Ibu berkenan memenuhi permohonan ini. Atas kesediaan dan kerja samanya, kami ucapkan terima kasih.',
          { align: 'justify' }
        )
      );
    } else if (baseTplId === 'SYS-TPL-25') {
      hal = `Undangan Pertemuan Orang Tua / Wali Peserta Didik`;
      recipient = `Bapak/Ibu Orang Tua/Wali Peserta Didik ${strOrNull(fv.sasaran_wali) ?? schoolName}`;
      bodyNodes.push(
        createParagraphNode(
          `Puji syukur ke hadirat Allah SWT. Dalam rangka mempererat silaturahmi dan komunikasi pendidikan antara madrasah dengan orang tua/wali peserta didik ${schoolName}, kami mengundang Bapak/Ibu untuk hadir pada:`,
          { align: 'justify' }
        ),
        buildBorderlessMetaTable([
          { label: 'Hari / Tanggal & Tempat', value: strOrNull(fv.jadwal_pertemuan) ?? dateText },
          { label: 'Agenda Pertemuan', value: strOrNull(fv.agenda) ?? '-' },
        ]),
        createParagraphNode(
          'Demikian undangan ini kami sampaikan. Atas perhatian dan kehadiran Bapak/Ibu, kami ucapkan terima kasih.',
          { align: 'justify' }
        )
      );
    } else if (baseTplId === 'SYS-TPL-26') {
      sifat = 'Penting';
      hal = `Panggilan Orang Tua / Wali Peserta Didik`;
      recipient = `Bapak/Ibu Orang Tua/Wali dari ${strOrNull(fv.nama_siswa) ?? 'Peserta Didik'}`;
      bodyNodes.push(
        createParagraphNode(
          `Dengan hormat, dalam rangka koordinasi dan pembinaan pendidikan peserta didik ${strOrNull(fv.nama_siswa) ?? ''}, kami mengharap kehadiran Bapak/Ibu pada:`,
          { align: 'justify' }
        ),
        buildBorderlessMetaTable([
          { label: 'Hari / Tanggal & Pukul', value: strOrNull(fv.waktu_panggilan) ?? dateText },
          { label: 'Tempat', value: `Ruang Konsultasi / Kantor ${schoolName}` },
          { label: 'Menemui', value: strOrNull(fv.menemui) ?? 'Wali Kelas / Guru BK' },
        ]),
        createParagraphNode(
          'Mengingat pentingnya komunikasi demi kebaikan ananda, besar harapan kami Bapak/Ibu berkenan hadir tepat waktu. Atas perhatian dan kerja samanya, kami ucapkan terima kasih.',
          { align: 'justify' }
        )
      );
    } else if (baseTplId === 'SYS-TPL-27') {
      hal = `Pemberitahuan Kegiatan Madrasah`;
      recipient = `Bapak/Ibu Orang Tua/Wali Peserta Didik ${strOrNull(fv.sasaran_orang_tua) ?? schoolName}`;
      bodyNodes.push(
        createParagraphNode(
          `Dengan hormat, bersama surat ini kami beritahukan kepada Bapak/Ibu Orang Tua/Wali peserta didik ${schoolName} hal-hal sebagai berikut:`,
          { align: 'justify' }
        ),
        createParagraphNode(strOrNull(fv.isi_pemberitahuan) ?? '-', { align: 'justify' }),
        createParagraphNode(
          'Demikian surat pemberitahuan ini kami sampaikan agar menjadi maklum. Atas perhatian dan kerja sama Bapak/Ibu, kami ucapkan terima kasih.',
          { align: 'justify' }
        )
      );
    } else if (baseTplId === 'SYS-TPL-28') {
      hal = `Permohonan Kerja Sama Program`;
      recipient = `Pimpinan ${strOrNull(fv.instansi_mitra) ?? 'Instansi Mitra'}`;
      const kontak = strOrNull(fv.kontak_pj);
      bodyNodes.push(
        createParagraphNode(
          `Dengan hormat, dalam rangka meningkatkan mutu layanan pendidikan dan pengembangan program di ${schoolName}, kami bermaksud mengajukan permohonan kerja sama kelembagaan dengan ruang lingkup sebagai berikut:`,
          { align: 'justify' }
        ),
        createParagraphNode(strOrNull(fv.ruang_lingkup) ?? '-', { align: 'justify' }),
        ...(kontak
          ? [createParagraphNode(`Untuk koordinasi lebih lanjut dapat menghubungi narahubung kami: ${kontak}.`, { align: 'justify' })]
          : []),
        createParagraphNode(
          'Demikian permohonan kerja sama ini kami sampaikan. Atas perhatian dan tanggapan Bapak/Ibu, kami ucapkan terima kasih.',
          { align: 'justify' }
        )
      );
    }

    nodes.push(
      buildCorrespondenceLetterHeader({
        numberToken: interpolateTokens('{{NOMOR_SURAT}}', aliasMap, resolvedSet, unresolvedSet),
        sifat,
        lampiran: '-',
        hal,
        titimangsa,
      })
    );
    nodes.push(...buildRecipientAddressBlock(recipient, 'Tempat'));
    nodes.push(
      createRichParagraphNode([
        { text: 'Assalamu’alaikum warahmatullahi wabarakatuh.', italic: true },
      ])
    );
    nodes.push(...bodyNodes);
    nodes.push(
      createRichParagraphNode([
        { text: 'Wassalamu’alaikum warahmatullahi wabarakatuh.', italic: true },
      ])
    );
    nodes.push(
      ...buildSignatureNodes(sigBlock, draft, aliasMap, resolvedSet, unresolvedSet, {
        omitTitimangsa: true,
      })
    );
    return nodes;
  }

  // =========================================================================
  // 6. SYS-TPL-02: SURAT TUGAS KEGIATAN DINAS / RAPAT / MONITORING (ADAPTIF 1 vs N GURU)
  // =========================================================================
  if (baseTplId === 'SYS-TPL-02') {
    const nodes: TipTapJSONNode[] = [];
    nodes.push(createHeadingNode('SURAT TUGAS', 1, 'center', true));
    nodes.push(
      createParagraphNode(
        interpolateTokens('Nomor : {{NOMOR_SURAT}}', aliasMap, resolvedSet, unresolvedSet),
        { align: 'center' }
      )
    );
    nodes.push(createParagraphNode(''));
    nodes.push(
      createParagraphNode(
        `Yang bertanda tangan di bawah ini, ${strOrNull(kop.signatoryTitle) ?? 'Kepala Madrasah'} ${schoolName}, dengan ini menugaskan kepada:`,
        { align: 'justify' }
      )
    );

    if (teachers.length === 1) {
      const t = teachers[0];
      nodes.push(
        buildBorderlessMetaTable([
          { label: 'Nama', value: t.name },
          { label: 'Jabatan / Peran', value: t.roleTitle || 'Pendidik / Pegawai' },
          { label: 'Unit Kerja', value: schoolName },
        ])
      );
    } else if (teachers.length > 1) {
      nodes.push(
        buildTableNode(
          ['No', 'Nama Pendidik / Pegawai', 'Kode Pegawai', 'Jabatan / Peran'],
          teachers.map((t, idx) => [
            String(idx + 1),
            t.name,
            t.code || '-',
            t.roleTitle || 'Pendidik / Pegawai',
          ])
        )
      );
    }

    const agenda = strOrNull(fv.agenda) ?? '-';
    const tanggalDinas = strOrNull(fv.tanggal_dinas) ?? dateText;
    const tempatTujuan = strOrNull(fv.tempat_tujuan) ?? '-';

    nodes.push(createParagraphNode('Untuk melaksanakan tugas kedinasan dengan rincian sebagai berikut:', { align: 'justify' }));
    nodes.push(
      buildBorderlessMetaTable([
        { label: 'Maksud / Agenda', value: agenda },
        { label: 'Hari / Tanggal & Waktu', value: tanggalDinas },
        { label: 'Tempat / Instansi Tujuan', value: tempatTujuan },
      ])
    );
    nodes.push(
      createParagraphNode(
        'Demikian surat tugas ini dibuat untuk dilaksanakan dengan sebaik-baiknya, dan setelah selesai melaksanakan tugas agar melaporkan hasilnya kepada Kepala Madrasah.',
        { align: 'justify' }
      )
    );
    nodes.push(...buildSignatureNodes(sigBlock, draft, aliasMap, resolvedSet, unresolvedSet));
    return nodes;
  }

  // =========================================================================
  // 7. SYS-TPL-04: SK TUGAS TAMBAHAN GURU & SYS-TPL-05: SK PEMBENTUKAN PANITIA
  // =========================================================================
  if (baseTplId === 'SYS-TPL-04' || baseTplId === 'SYS-TPL-05') {
    const isPanitia = baseTplId === 'SYS-TPL-05';
    const judulTentang = isPanitia
      ? `PEMBENTUKAN PANITIA ${(strOrNull(fv.nama_kepanitiaan) ?? 'KEGIATAN MADRASAH').toUpperCase()}\nTAHUN AJARAN ${academicYear.toUpperCase()}`
      : `PENETAPAN TUGAS TAMBAHAN PENDIDIK DAN TENAGA KEPENDIDIKAN\nTAHUN AJARAN ${academicYear.toUpperCase()} SEMESTER ${semester.toUpperCase()}`;

    const periodeBerlaku = isPanitia
      ? strOrNull(fv.masa_kerja) ?? `Tahun Ajaran ${academicYear}`
      : strOrNull(fv.tmt_berlaku) ?? `Tahun Ajaran ${academicYear} Semester ${semester}`;

    const nodes: TipTapJSONNode[] = [];
    nodes.push(createHeadingNode(`KEPUTUSAN KEPALA ${schoolName.toUpperCase()}`, 1, 'center'));
    nodes.push(
      createParagraphNode(
        interpolateTokens('NOMOR : {{NOMOR_SK}}', aliasMap, resolvedSet, unresolvedSet),
        { align: 'center', bold: true }
      )
    );
    nodes.push(createParagraphNode('TENTANG', { align: 'center', bold: true }));
    nodes.push(createParagraphNode(judulTentang, { align: 'center', bold: true }));
    nodes.push(createParagraphNode(''));
    nodes.push(createParagraphNode(`KEPALA ${schoolName.toUpperCase()},`, { align: 'center', bold: true }));
    nodes.push(createParagraphNode(''));

    nodes.push(
      buildBorderlessMetaTable([
        {
          label: 'Menimbang',
          value: isPanitia
            ? `a. bahwa dalam rangka kelancaran dan ketertiban pelaksanaan ${strOrNull(fv.nama_kepanitiaan) ?? 'kegiatan madrasah'} di ${schoolName}, dipandang perlu membentuk panitia pelaksana;\nb. bahwa nama-nama yang tercantum dalam lampiran keputusan ini dipandang cakap dan mampu melaksanakan tugas kepanitiaan dimaksud.`
            : `a. bahwa guna mendukung kelancaran tata kelola kurikulum, kesiswaan, dan layanan penunjang di ${schoolName} Tahun Ajaran ${academicYear}, dipandang perlu menetapkan tugas tambahan pendidik;\nb. bahwa nama-nama yang tercantum dalam lampiran keputusan ini dipandang cakap dan memenuhi syarat untuk mengemban tugas tambahan dimaksud.`,
        },
        {
          label: 'Mengingat',
          value:
            '1. Undang-Undang Nomor 20 Tahun 2003 tentang Sistem Pendidikan Nasional;\n2. Peraturan Menteri Agama Republik Indonesia tentang Penyelenggaraan Pendidikan Madrasah;\n3. Program Kerja Madrasah dan hasil rapat pimpinan dewan guru.',
        },
      ])
    );

    nodes.push(createParagraphNode(''));
    nodes.push(createParagraphNode('MEMUTUSKAN :', { align: 'center', bold: true }));
    nodes.push(createParagraphNode(''));

    nodes.push(
      buildBorderlessMetaTable([
        {
          label: 'Menetapkan',
          value: `KEPUTUSAN KEPALA ${schoolName.toUpperCase()} TENTANG ${judulTentang.replace(/\n/g, ' ')}.`,
        },
        {
          label: 'KESATU',
          value: isPanitia
            ? `Membentuk dan menetapkan susunan Panitia ${strOrNull(fv.nama_kepanitiaan) ?? 'Kegiatan Madrasah'} sebagaimana tercantum dalam Lampiran yang merupakan bagian tidak terpisahkan dari Keputusan ini.`
            : `Menetapkan pembagian tugas tambahan pendidik dan tenaga kependidikan sebagaimana tercantum dalam Lampiran Keputusan ini, berlaku untuk masa tugas ${periodeBerlaku}.`,
        },
        {
          label: 'KEDUA',
          value: isPanitia
            ? `Panitia bertugas mempersiapkan, melaksanakan, dan melaporkan hasil kegiatan kepada Kepala Madrasah pada masa kerja ${periodeBerlaku}.`
            : 'Pendidik yang diberi tugas tambahan melaksanakan tugas sesuai uraian kerja masing-masing dan melaporkannya secara berkala kepada Kepala Madrasah.',
        },
        {
          label: 'KETIGA',
          value: 'Segala biaya yang timbul akibat pelaksanaan Keputusan ini dibebankan pada anggaran madrasah yang sesuai.',
        },
        {
          label: 'KEEMPAT',
          value: 'Keputusan ini mulai berlaku pada tanggal ditetapkan, dengan ketentuan apabila di kemudian hari terdapat kekeliruan akan diadakan perbaikan sebagaimana mestinya.',
        },
      ])
    );

    nodes.push(
      ...buildSignatureNodes(sigBlock, draft, aliasMap, resolvedSet, unresolvedSet, {
        ditetapkanStyle: true,
        tembusan: [
          'Ketua Yayasan / Penyelenggara Madrasah',
          'Yang bersangkutan untuk dilaksanakan sebagaimana mestinya',
          'Arsip',
        ],
      })
    );

    // Lampiran SK
    nodes.push({ type: 'pageBreak' });
    nodes.push(
      buildBorderlessMetaTable([
        { label: 'Lampiran', value: `Keputusan Kepala ${schoolName}` },
        {
          label: 'Nomor',
          value: interpolateTokens('{{NOMOR_SK}}', aliasMap, resolvedSet, unresolvedSet),
        },
        { label: 'Tanggal', value: dateText },
        {
          label: 'Tentang',
          value: isPanitia
            ? `Susunan Panitia ${strOrNull(fv.nama_kepanitiaan) ?? 'Kegiatan Madrasah'}`
            : `Penetapan Tugas Tambahan Pendidik Tahun Ajaran ${academicYear}`,
        },
      ])
    );
    nodes.push(createParagraphNode(''));
    nodes.push(
      createHeadingNode(
        isPanitia
          ? `SUSUNAN PANITIA ${(strOrNull(fv.nama_kepanitiaan) ?? 'KEGIATAN MADRASAH').toUpperCase()}`
          : `DAFTAR PENETAPAN TUGAS TAMBAHAN PENDIDIK TAHUN AJARAN ${academicYear.toUpperCase()}`,
        2,
        'center'
      )
    );

    const customRoles = splitOperatorLines(strOrNull(fv.catatan_khusus), []);
    if (isPanitia) {
      const defaultPanitiaRoles = ['Ketua Panitia', 'Sekretaris', 'Bendahara', 'Anggota'];
      const rows =
        teachers.length > 0
          ? teachers.map((t, idx) => [
              String(idx + 1),
              t.name,
              t.roleTitle || 'Pendidik / Pegawai',
              customRoles[idx] || defaultPanitiaRoles[Math.min(idx, defaultPanitiaRoles.length - 1)],
            ])
          : [['1', '-', '-', 'Ketua Panitia']];
      nodes.push(buildTableNode(['No', 'Nama', 'Jabatan Dinas', 'Jabatan dalam Panitia'], rows));
    } else {
      const rows =
        teachers.length > 0
          ? teachers.map((t, idx) => [
              String(idx + 1),
              t.name,
              customRoles[idx] || t.roleTitle || 'Tugas Tambahan Pendidik',
              t.subjectsText || schoolName,
              periodeBerlaku,
            ])
          : [['1', '-', '-', schoolName, periodeBerlaku]];
      nodes.push(
        buildTableNode(['No', 'Nama Pendidik', 'Jenis Tugas Tambahan', 'Bidang / Unit', 'Masa Berlaku'], rows)
      );
    }

    nodes.push(...buildSignatureNodes(sigBlock, draft, aliasMap, resolvedSet, unresolvedSet));
    return nodes;
  }

  // =========================================================================
  // 8. SYS-TPL-10: NOTA DINAS / MEMORANDUM INTERNAL KEMENAG
  // =========================================================================
  if (baseTplId === 'SYS-TPL-10') {
    const yth = strOrNull(fv.yth_internal) ?? 'Pejabat / Unit Internal';
    const dari = strOrNull(fv.dari_internal) ?? (strOrNull(kop.signatoryTitle) ?? 'Kepala Madrasah');
    const halNota = strOrNull(fv.hal_nota) ?? draft.subject;
    const isiNota = strOrNull(fv.isi_nota) ?? '-';

    const nodes: TipTapJSONNode[] = [];
    nodes.push(createHeadingNode('NOTA DINAS', 1, 'center', true));
    nodes.push(
      createParagraphNode(
        interpolateTokens('Nomor : {{NOMOR_NOTA_DINAS}}', aliasMap, resolvedSet, unresolvedSet),
        { align: 'center' }
      )
    );
    nodes.push(createParagraphNode(''));
    nodes.push(
      buildBorderlessMetaTable([
        { label: 'Yth.', value: yth },
        { label: 'Dari', value: dari },
        { label: 'Tanggal', value: dateText },
        { label: 'Sifat', value: 'Biasa' },
        { label: 'Lampiran', value: '-' },
        { label: 'Hal', value: halNota },
      ])
    );
    nodes.push({ type: 'horizontalRule' });
    nodes.push(createParagraphNode(isiNota, { align: 'justify' }));
    nodes.push(
      createParagraphNode(
        'Demikian nota dinas ini disampaikan untuk menjadi perhatian dan ditindaklanjuti sebagaimana mestinya. Atas perhatian dan kerja samanya diucapkan terima kasih.',
        { align: 'justify' }
      )
    );
    const headTitleRaw = strOrNull(kop.signatoryTitle) ?? 'Kepala Madrasah';
    const currTitleRaw = strOrNull(kop.curriculumLeaderTitle);
    const currNameRaw = strOrNull(kop.curriculumLeaderName);
    const dariNorm = dari.toLowerCase();
    const isHeadSender =
      dariNorm === headTitleRaw.toLowerCase() || /kepala\s+madrasah/i.test(dariNorm);
    const isCurriculumSender =
      Boolean(currTitleRaw && currNameRaw) &&
      dariNorm === currTitleRaw!.toLowerCase();
    const notaRightName = isHeadSender
      ? '{{NAMA_KEPALA_MADRASAH}}'
      : isCurriculumSender
        ? currNameRaw!
        : '( .................................... )';
    const notaRightIdLabel = isHeadSender ? '{{NIP_KEPALA_MADRASAH}}' : undefined;

    nodes.push(
      ...buildSignatureNodes(
        {
          type: 'signature',
          rightTitle: dari,
          rightName: notaRightName,
          rightIdLabel: notaRightIdLabel,
        },
        draft,
        aliasMap,
        resolvedSet,
        unresolvedSet,
        { omitTitimangsa: true }
      )
    );
    return nodes;
  }

  // =========================================================================
  // 9. SYS-TPL-11, 12, 14: SURAT KETERANGAN (AKTIF MENGAJAR / TUGAS GURU / SISWA AKTIF)
  // =========================================================================
  if (baseTplId === 'SYS-TPL-11' || baseTplId === 'SYS-TPL-12' || baseTplId === 'SYS-TPL-14') {
    const titleMap: Record<string, string> = {
      'SYS-TPL-11': 'SURAT KETERANGAN AKTIF MENGAJAR',
      'SYS-TPL-12': 'SURAT KETERANGAN TUGAS GURU',
      'SYS-TPL-14': 'SURAT KETERANGAN SISWA AKTIF',
    };
    const nodes: TipTapJSONNode[] = [];
    nodes.push(createHeadingNode(titleMap[baseTplId], 1, 'center', true));
    nodes.push(
      createParagraphNode(
        interpolateTokens('Nomor : {{NOMOR_SURAT}}', aliasMap, resolvedSet, unresolvedSet),
        { align: 'center' }
      )
    );
    nodes.push(createParagraphNode(''));
    nodes.push(createParagraphNode('Yang bertanda tangan di bawah ini:', { align: 'justify' }));
    nodes.push(
      buildBorderlessMetaTable([
        { label: 'Nama', value: strOrNull(kop.signatoryName) ?? 'Kepala Madrasah' },
        { label: 'Jabatan', value: `${strOrNull(kop.signatoryTitle) ?? 'Kepala Madrasah'} ${schoolName}` },
        { label: 'Alamat Madrasah', value: strOrNull(kop.address) ?? city },
      ])
    );

    if (baseTplId === 'SYS-TPL-14') {
      const classSnap =
        findSnapshot(draft, 'master.classes.selected') ??
        findSnapshot(draft, 'master.class.selected');
      const cls = (classSnap?.capturedValue ?? null) as { name?: string | null } | null;
      const namaSiswa = strOrNull(fv.nama_siswa) ?? '-';
      const nisn = strOrNull(fv.nisn) ?? '-';
      const ttl = strOrNull(fv.ttl_siswa) ?? '-';
      const kelasName = strOrNull(cls?.name) ?? strOrNull(fv.kelas_id) ?? '-';
      const keperluan = strOrNull(fv.keperluan) ?? 'keperluan administrasi pendidikan';

      nodes.push(createParagraphNode('Dengan ini menerangkan dengan sesungguhnya bahwa:', { align: 'justify' }));
      nodes.push(
        buildBorderlessMetaTable([
          { label: 'Nama Lengkap', value: namaSiswa },
          { label: 'NIS / NISN', value: nisn },
          { label: 'Tempat, Tanggal Lahir', value: ttl },
          { label: 'Kelas / Rombel', value: kelasName },
          { label: 'Tahun Ajaran', value: `${academicYear} Semester ${semester}` },
        ])
      );
      nodes.push(
        createParagraphNode(
          `Adalah benar peserta didik yang terdaftar dan aktif mengikuti kegiatan belajar mengajar di ${schoolName}. Surat keterangan ini diberikan untuk keperluan ${keperluan}.`,
          { align: 'justify' }
        )
      );
    } else {
      const t = teachers[0];
      const teacherName = t?.name ?? '-';
      const teacherRole = t?.roleTitle || 'Guru / Pendidik';
      const teacherSubjects = t?.subjectsText || 'Sesuai Pembagian Tugas Mengajar';

      nodes.push(createParagraphNode('Dengan ini menerangkan dengan sesungguhnya bahwa:', { align: 'justify' }));
      if (baseTplId === 'SYS-TPL-11') {
        const tmt = formatIndonesianLongDate(strOrNull(fv.tmt_mengajar)) ?? strOrNull(fv.tmt_mengajar) ?? '-';
        const keperluan = strOrNull(fv.keperluan) ?? 'administrasi kepegawaian dan pendidik';
        nodes.push(
          buildBorderlessMetaTable([
            { label: 'Nama Pendidik', value: teacherName },
            { label: 'Jabatan', value: teacherRole },
            { label: 'Mata Pelajaran Diampu', value: teacherSubjects },
            { label: 'Unit Kerja', value: schoolName },
            { label: 'Terhitung Mulai Tanggal', value: tmt },
          ])
        );
        nodes.push(
          createParagraphNode(
            `Adalah benar pendidik aktif yang melaksanakan tugas mengajar pada ${schoolName} Tahun Ajaran ${academicYear} Semester ${semester}. Surat keterangan ini dibuat untuk keperluan ${keperluan}.`,
            { align: 'justify' }
          )
        );
      } else {
        const uraian = strOrNull(fv.uraian_tugas) ?? '-';
        const skRujukan = strOrNull(fv.nomor_sk_rujukan);
        nodes.push(
          buildBorderlessMetaTable([
            { label: 'Nama Pendidik', value: teacherName },
            { label: 'Jabatan', value: teacherRole },
            { label: 'Mata Pelajaran', value: teacherSubjects },
            { label: 'Uraian Tugas', value: uraian },
            ...(skRujukan ? [{ label: 'Dasar SK Rujukan', value: skRujukan }] : []),
          ])
        );
        nodes.push(
          createParagraphNode(
            `Adalah benar pendidik pada ${schoolName} yang melaksanakan tugas kedinasan sebagaimana tersebut di atas pada Tahun Ajaran ${academicYear} Semester ${semester}.`,
            { align: 'justify' }
          )
        );
      }
    }

    nodes.push(
      createParagraphNode(
        'Demikian surat keterangan ini dibuat dengan sebenarnya untuk dapat dipergunakan sebagaimana mestinya.',
        { align: 'justify' }
      )
    );
    nodes.push(...buildSignatureNodes(sigBlock, draft, aliasMap, resolvedSet, unresolvedSet));
    return nodes;
  }

  // =========================================================================
  // 10. SYS-TPL-13: SURAT PENGANTAR DOKUMEN (TATA NASKAH KEMENAG)
  // =========================================================================
  if (baseTplId === 'SYS-TPL-13') {
    const penerima = strOrNull(fv.penerima) ?? 'Pimpinan Instansi Penerima';
    const items = splitOperatorLines(strOrNull(fv.daftar_berkas), ['Berkas Administrasi Madrasah']);

    const nodes: TipTapJSONNode[] = [];
    nodes.push(
      buildCorrespondenceLetterHeader({
        numberToken: interpolateTokens('{{NOMOR_SURAT}}', aliasMap, resolvedSet, unresolvedSet),
        lampiran: `${items.length} jenis berkas`,
        hal: 'Pengantar Pengiriman Berkas / Dokumen',
        titimangsa,
      })
    );
    nodes.push(...buildRecipientAddressBlock(penerima, 'Tempat'));
    nodes.push(createHeadingNode('SURAT PENGANTAR', 2, 'center', true));
    nodes.push(createParagraphNode(''));
    const qtyDefault = strOrNull(fv.banyaknya_satuan) ?? '-';
    const pengantarNoteDefault = strOrNull(fv.keterangan_pengantar) ?? '-';
    nodes.push(
      buildTableNode(
        ['No', 'Jenis Naskah / Berkas yang Dikirim', 'Banyaknya', 'Keterangan'],
        items.map((item, idx) => {
          const cols = parseDelimitedCells(item);
          return [
            String(idx + 1),
            cols[0] || item,
            cols[1] || qtyDefault,
            cols[2] || pengantarNoteDefault,
          ];
        })
      )
    );
    nodes.push(
      ...buildSignatureNodes(
        {
          type: 'signature',
          leftTitle: 'Diterima tanggal ......................,\nPenerima,',
          leftName: '( .................................... )',
          rightTitle: '{{JABATAN_KEPALA_MADRASAH}}',
          rightName: '{{NAMA_KEPALA_MADRASAH}}',
          rightIdLabel: '{{NIP_KEPALA_MADRASAH}}',
        },
        draft,
        aliasMap,
        resolvedSet,
        unresolvedSet,
        { omitTitimangsa: true }
      )
    );
    return nodes;
  }

  // =========================================================================
  // 11. SYS-TPL-16, 17, 18: BERITA ACARA (AUTO-TERBILANG TANGGAL BAKU KEMENAG)
  // =========================================================================
  if (baseTplId === 'SYS-TPL-16' || baseTplId === 'SYS-TPL-17' || baseTplId === 'SYS-TPL-18') {
    const baIsoDate =
      (baseTplId === 'SYS-TPL-16' ? strOrNull(fv.tanggal_ba) : null) ?? draft.documentDate;
    const openingDatePhrase = formatBeritaAcaraOpeningDate(baIsoDate);

    const nodes: TipTapJSONNode[] = [];
    if (baseTplId === 'SYS-TPL-16') {
      const pihak1 = strOrNull(fv.pihak_pertama) ?? 'Pihak Pertama';
      const pihak2 = strOrNull(fv.pihak_kedua) ?? 'Pihak Kedua';
      const items = splitOperatorLines(strOrNull(fv.objek_serah_terima), ['Dokumen / Barang Inventaris']);

      nodes.push(createHeadingNode('BERITA ACARA SERAH TERIMA', 1, 'center', true));
      nodes.push(
        createParagraphNode(
          interpolateTokens('Nomor : {{NOMOR_BERITA_ACARA}}', aliasMap, resolvedSet, unresolvedSet),
          { align: 'center' }
        )
      );
      nodes.push(createParagraphNode(''));
      nodes.push(
        createParagraphNode(
          `Pada hari ini, ${openingDatePhrase}, bertempat di ${schoolName}, kami yang bertanda tangan di bawah ini:`,
          { align: 'justify' }
        )
      );
      nodes.push(
        buildBorderlessMetaTable([
          { label: 'Pihak Pertama', value: `${pihak1} (selaku Pihak yang Menyerahkan)` },
          { label: 'Pihak Kedua', value: `${pihak2} (selaku Pihak yang Menerima)` },
        ])
      );
      nodes.push(
        createParagraphNode(
          'Dengan ini menyatakan telah melaksanakan serah terima dokumen/barang inventaris sebagaimana rincian berikut:',
          { align: 'justify' }
        )
      );
      const baConditionDefault = strOrNull(fv.kondisi_barang) ?? '-';
      nodes.push(
        buildTableNode(
          ['No', 'Uraian Objek / Dokumen', 'Jumlah', 'Kondisi / Keterangan'],
          items.map((item, idx) => {
            const cols = parseDelimitedCells(item);
            return [
              String(idx + 1),
              cols[0] || item,
              cols[1] || '-',
              cols[2] || baConditionDefault,
            ];
          })
        )
      );
      nodes.push(
        createParagraphNode(
          'Demikian Berita Acara Serah Terima ini dibuat dengan sebenarnya untuk dapat dipergunakan sebagaimana mestinya.',
          { align: 'justify' }
        )
      );
      nodes.push(
        ...buildSignatureNodes(
          {
            type: 'signature',
            leftTitle: 'Pihak Kedua,\nYang Menerima,',
            leftName: pihak2,
            rightTitle: 'Pihak Pertama,\nYang Menyerahkan,',
            rightName: pihak1,
          },
          draft,
          aliasMap,
          resolvedSet,
          unresolvedSet
        )
      );
      return nodes;
    }

    if (baseTplId === 'SYS-TPL-17') {
      const judulRapat = strOrNull(fv.judul_rapat) ?? 'Rapat Dinas Madrasah';
      const waktuTempat = strOrNull(fv.waktu_tempat) ?? `Ruang Rapat ${schoolName}`;
      const jumlahPeserta = strOrNull(fv.jumlah_peserta) ?? 'seluruh';
      const notulisName = strOrNull(fv.nama_notulis) ?? '( .................................... )';
      const keputusanItems = splitOperatorLines(strOrNull(fv.hasil_keputusan), [
        'Menyetujui hasil pembahasan rapat sesuai agenda yang ditetapkan.',
      ]);

      nodes.push(createHeadingNode('BERITA ACARA RAPAT', 1, 'center', true));
      nodes.push(
        createParagraphNode(
          interpolateTokens('Nomor : {{NOMOR_BERITA_ACARA}}', aliasMap, resolvedSet, unresolvedSet),
          { align: 'center' }
        )
      );
      nodes.push(createParagraphNode(''));
      nodes.push(
        createParagraphNode(
          `Pada hari ini, ${openingDatePhrase}, telah diselenggarakan ${judulRapat} di lingkungan ${schoolName} dengan rincian sebagai berikut:`,
          { align: 'justify' }
        )
      );
      nodes.push(
        buildBorderlessMetaTable([
          { label: 'Nama / Agenda Rapat', value: judulRapat },
          { label: 'Waktu & Tempat', value: waktuTempat },
          { label: 'Jumlah Peserta Hadir', value: `${jumlahPeserta} orang (daftar hadir terlampir)` },
        ])
      );
      nodes.push(createParagraphNode('Adapun pokok-pokok keputusan yang disepakati dalam rapat tersebut adalah sebagai berikut:', { align: 'justify' }));
      nodes.push({
        type: 'orderedList',
        attrs: { start: 1 },
        content: keputusanItems.map((it) => ({
          type: 'listItem',
          content: [createParagraphNode(it, { align: 'justify' })],
        })),
      });
      nodes.push(
        createParagraphNode(
          'Demikian Berita Acara Rapat ini dibuat dengan sebenarnya sebagai bahan pertanggungjawaban dan dokumentasi resmi madrasah.',
          { align: 'justify' }
        )
      );
      nodes.push(
        ...buildSignatureNodes(
          {
            type: 'signature',
            leftTitle: 'Notulis / Sekretaris Rapat,',
            leftName: notulisName,
            rightTitle: 'Pimpinan Rapat,\n{{JABATAN_KEPALA_MADRASAH}}',
            rightName: '{{NAMA_KEPALA_MADRASAH}}',
            rightIdLabel: '{{NIP_KEPALA_MADRASAH}}',
          },
          draft,
          aliasMap,
          resolvedSet,
          unresolvedSet
        )
      );
      return nodes;
    }

    // SYS-TPL-18: Berita Acara Pelaksanaan Ujian
    const subjectSnap =
      findSnapshot(draft, 'master.subjects.selected') ??
      findSnapshot(draft, 'master.subject.selected');
    const subj = (subjectSnap?.capturedValue ?? null) as { name?: string | null } | null;
    const namaUjian = strOrNull(fv.nama_ujian) ?? 'Asesmen / Ujian Madrasah';
    const mapelName = strOrNull(subj?.name) ?? strOrNull(fv.mapel) ?? '-';
    const ruangUjian = strOrNull(fv.ruang_ujian) ?? '-';
    const rekapPeserta = strOrNull(fv.rekap_peserta) ?? '-';
    const kejadian = strOrNull(fv.kejadian_khusus) ?? '-';
    const pengawas2Name = strOrNull(fv.pengawas_2) ?? '( .................................... )';
    const pengawas1Name = strOrNull(fv.pengawas_1) ?? '( .................................... )';

    nodes.push(createHeadingNode('BERITA ACARA PELAKSANAAN UJIAN', 1, 'center', true));
    nodes.push(
      createParagraphNode(
        interpolateTokens('Nomor : {{NOMOR_BERITA_ACARA}}', aliasMap, resolvedSet, unresolvedSet),
        { align: 'center' }
      )
    );
    nodes.push(createParagraphNode(''));
    nodes.push(
      createParagraphNode(
        `Pada hari ini, ${openingDatePhrase}, di ${schoolName} telah dilaksanakan ${namaUjian} Tahun Ajaran ${academicYear} Semester ${semester} dengan keterangan sebagai berikut:`,
        { align: 'justify' }
      )
    );
    nodes.push(
      buildBorderlessMetaTable([
        { label: 'Nama Ujian / Asesmen', value: namaUjian },
        { label: 'Mata Pelajaran', value: mapelName },
        { label: 'Ruang / Rombel', value: ruangUjian },
        { label: 'Rekap Kehadiran Peserta', value: rekapPeserta },
        { label: 'Catatan Selama Ujian', value: kejadian },
      ])
    );
    nodes.push(
      createParagraphNode(
        'Demikian Berita Acara Pelaksanaan Ujian ini dibuat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.',
        { align: 'justify' }
      )
    );
    nodes.push(
      ...buildSignatureNodes(
        {
          type: 'signature',
          leftTitle: 'Pengawas Ruang II,',
          leftName: pengawas2Name,
          rightTitle: 'Pengawas Ruang I,',
          rightName: pengawas1Name,
        },
        draft,
        aliasMap,
        resolvedSet,
        unresolvedSet
      )
    );
    return nodes;
  }

  // =========================================================================
  // 12. SYS-TPL-06: SURAT TUGAS PENGAWAS / PANITIA UJIAN (ADAPTIF 1 vs N GURU)
  // =========================================================================
  if (baseTplId === 'SYS-TPL-06') {
    const jenisUjian = strOrNull(fv.jenis_ujian) ?? 'Asesmen / Ujian Madrasah';
    const periodeUjian =
      formatIndonesianDateRange(strOrNull(fv.periode_ujian_mulai), strOrNull(fv.periode_ujian_selesai)) ??
      dateText;

    const nodes: TipTapJSONNode[] = [];
    nodes.push(createHeadingNode('SURAT TUGAS PENGAWAS UJIAN', 1, 'center', true));
    nodes.push(
      createParagraphNode(
        interpolateTokens('Nomor : {{NOMOR_SURAT}}', aliasMap, resolvedSet, unresolvedSet),
        { align: 'center' }
      )
    );
    nodes.push(createParagraphNode(''));
    nodes.push(
      createParagraphNode(
        `Yang bertanda tangan di bawah ini, ${strOrNull(kop.signatoryTitle) ?? 'Kepala Madrasah'} ${schoolName}, dalam rangka pelaksanaan ${jenisUjian} Tahun Ajaran ${academicYear} Semester ${semester}, dengan ini menugaskan kepada:`,
        { align: 'justify' }
      )
    );

    if (teachers.length === 1) {
      const t = teachers[0];
      nodes.push(
        buildBorderlessMetaTable([
          { label: 'Nama Pendidik', value: t.name },
          { label: 'Jabatan / Peran', value: t.roleTitle || 'Pengawas Ruang Ujian' },
          { label: 'Ruang / Tugas', value: 'Pengawas Ruang 01' },
          { label: 'Periode Ujian', value: periodeUjian },
        ])
      );
    } else if (teachers.length > 1) {
      nodes.push(
        buildTableNode(
          ['No', 'Nama Pengawas', 'Peran / Tugas', 'Ruang / Rombel', 'Periode'],
          teachers.map((t, idx) => [
            String(idx + 1),
            t.name,
            t.roleTitle || 'Pengawas Ruang',
            `Ruang ${String(idx + 1).padStart(2, '0')}`,
            periodeUjian,
          ])
        )
      );
    } else {
      nodes.push(
        buildBorderlessMetaTable([
          { label: 'Jenis Ujian / Asesmen', value: jenisUjian },
          { label: 'Periode Pelaksanaan', value: periodeUjian },
          { label: 'Tempat', value: schoolName },
        ])
      );
    }

    nodes.push(
      createParagraphNode(
        `Untuk melaksanakan tugas pengawasan ruang dan ketertiban pelaksanaan ${jenisUjian} pada tanggal ${periodeUjian} bertempat di ${schoolName} sesuai jadwal pengawasan yang telah ditetapkan.`,
        { align: 'justify' }
      )
    );
    nodes.push(
      createParagraphNode(
        'Demikian surat tugas ini dibuat untuk dilaksanakan dengan penuh rasa tanggung jawab, dan melaporkan hasilnya setelah selesai bertugas.',
        { align: 'justify' }
      )
    );
    nodes.push(...buildSignatureNodes(sigBlock, draft, aliasMap, resolvedSet, unresolvedSet));
    return nodes;
  }

  // =========================================================================
  // 13. SYS-TPL-09: SURAT PEMBERITAHUAN / PENGUMUMAN RESMI
  // =========================================================================
  if (baseTplId === 'SYS-TPL-09') {
    const sasaran = strOrNull(fv.sasaran) ?? `Seluruh Warga ${schoolName}`;
    const topik = strOrNull(fv.topik) ?? draft.subject;
    const poinList = splitOperatorLines(strOrNull(fv.rincian), [
      'Pelaksanaan kegiatan mengikuti jadwal resmi madrasah yang berlaku.',
    ]);

    const nodes: TipTapJSONNode[] = [];
    nodes.push(createHeadingNode('PENGUMUMAN', 1, 'center', true));
    nodes.push(
      createParagraphNode(
        interpolateTokens('Nomor : {{NOMOR_SURAT}}', aliasMap, resolvedSet, unresolvedSet),
        { align: 'center' }
      )
    );
    nodes.push(createParagraphNode(''));
    nodes.push(
      createRichParagraphNode(
        [
          { text: 'Tentang: ', bold: true },
          { text: topik, bold: true },
        ],
        { align: 'center' }
      )
    );
    nodes.push(createParagraphNode(''));
    nodes.push(
      createRichParagraphNode([{ text: 'Assalamu’alaikum warahmatullahi wabarakatuh.', italic: true }])
    );
    nodes.push(
      createParagraphNode(
        `Diberitahukan dengan hormat kepada ${sasaran} di lingkungan ${schoolName} Tahun Ajaran ${academicYear} Semester ${semester}, sehubungan dengan ${topik}, disampaikan ketentuan sebagai berikut:`,
        { align: 'justify' }
      )
    );
    nodes.push({
      type: 'orderedList',
      attrs: { start: 1 },
      content: poinList.map((item) => ({
        type: 'listItem',
        content: [createParagraphNode(item, { align: 'justify' })],
      })),
    });
    nodes.push(
      createParagraphNode(
        'Demikian pengumuman ini disampaikan agar diketahui dan dilaksanakan sebagaimana mestinya. Atas perhatian dan kerja samanya diucapkan terima kasih.',
        { align: 'justify' }
      )
    );
    nodes.push(
      createRichParagraphNode([{ text: 'Wassalamu’alaikum warahmatullahi wabarakatuh.', italic: true }])
    );
    nodes.push(...buildSignatureNodes(sigBlock, draft, aliasMap, resolvedSet, unresolvedSet));
    return nodes;
  }

  // =========================================================================
  // 14. SYS-TPL-15: SURAT REKOMENDASI RESMI KEPALA MADRASAH
  // =========================================================================
  if (baseTplId === 'SYS-TPL-15') {
    const subjek = strOrNull(fv.subjek_rekomendasi) ?? 'Pendidik / Peserta Didik Madrasah';
    const tujuanProgram = strOrNull(fv.tujuan_program) ?? 'Program Pendidikan / Kemitraan';
    const dasarPertimbangan =
      strOrNull(fv.dasar_pertimbangan) ??
      `Berdasarkan catatan administrasi pada ${schoolName}, yang bersangkutan memenuhi ketentuan administratif untuk mengikuti program tersebut.`;

    const nodes: TipTapJSONNode[] = [];
    nodes.push(createHeadingNode('SURAT REKOMENDASI', 1, 'center', true));
    nodes.push(
      createParagraphNode(
        interpolateTokens('Nomor : {{NOMOR_SURAT}}', aliasMap, resolvedSet, unresolvedSet),
        { align: 'center' }
      )
    );
    nodes.push(createParagraphNode(''));
    nodes.push(createParagraphNode('Yang bertanda tangan di bawah ini:', { align: 'justify' }));
    nodes.push(
      buildBorderlessMetaTable([
        { label: 'Nama', value: strOrNull(kop.signatoryName) ?? 'Kepala Madrasah' },
        { label: 'Jabatan', value: `${strOrNull(kop.signatoryTitle) ?? 'Kepala Madrasah'} ${schoolName}` },
        { label: 'Alamat Madrasah', value: strOrNull(kop.address) ?? city },
      ])
    );
    nodes.push(createParagraphNode('Dengan ini memberikan rekomendasi kepada:', { align: 'justify' }));
    nodes.push(
      buildBorderlessMetaTable([
        { label: 'Nama / Identitas', value: subjek },
        { label: 'Asal Satuan Pendidikan', value: schoolName },
        { label: 'Tujuan / Program', value: tujuanProgram },
      ])
    );
    nodes.push(createParagraphNode(dasarPertimbangan, { align: 'justify' }));
    nodes.push(
      createParagraphNode(
        'Demikian surat rekomendasi ini diberikan untuk dapat dipergunakan sebagaimana mestinya dalam pengajuan program dimaksud.',
        { align: 'justify' }
      )
    );
    nodes.push(...buildSignatureNodes(sigBlock, draft, aliasMap, resolvedSet, unresolvedSet));
    return nodes;
  }

  // =========================================================================
  // 15. SYS-TPL-19: NOTULA RAPAT DINAS MADRASAH
  // =========================================================================
  if (baseTplId === 'SYS-TPL-19') {
    const judulRapat = strOrNull(fv.judul_rapat) ?? draft.subject;
    const pimpinanNotulis = strOrNull(fv.pimpinan_notulis) ?? `${strOrNull(kop.signatoryTitle) ?? 'Kepala Madrasah'} / Sekretaris`;
    const pimpinanSplit = pimpinanNotulis.split(/[/,&\n]+/).map((p) => p.trim()).filter(Boolean);
    const notulisDisplay =
      pimpinanSplit[1] && !/^sekretaris$/i.test(pimpinanSplit[1])
        ? pimpinanSplit[1]
        : '( .................................... )';
    const bahasanItems = splitOperatorLines(strOrNull(fv.ringkasan_bahasan), [
      'Pembahasan agenda rapat sesuai program kerja madrasah',
    ]);

    const nodes: TipTapJSONNode[] = [];
    nodes.push(createHeadingNode('NOTULA RAPAT', 1, 'center', true));
    nodes.push(
      createParagraphNode(
        interpolateTokens('Nomor Arsip : {{NOMOR_NOTULA}}', aliasMap, resolvedSet, unresolvedSet),
        { align: 'center' }
      )
    );
    nodes.push(createParagraphNode(''));
    nodes.push(
      buildBorderlessMetaTable([
        { label: 'Agenda Rapat', value: judulRapat },
        { label: 'Hari / Tanggal', value: dateText },
        { label: 'Tempat', value: `Ruang Rapat ${schoolName}` },
        { label: 'Pimpinan / Notulis', value: pimpinanNotulis },
      ])
    );
    nodes.push(createHeadingNode('I. JALANNYA RAPAT & POKOK PEMBAHASAN', 2, 'left'));
    nodes.push(
      createParagraphNode(
        `Rapat dibuka secara resmi dan membahas agenda "${judulRapat}" bersama unsur pimpinan, dewan guru, dan tenaga kependidikan ${schoolName}.`,
        { align: 'justify' }
      )
    );
    nodes.push(createHeadingNode('II. KESIMPULAN & RENCANA TINDAK LANJUT', 2, 'left'));
    const pjNotulaDefault = strOrNull(fv.pj_tindak_lanjut) ?? '-';
    const targetNotulaDefault = strOrNull(fv.target_waktu_rtl) ?? '-';
    nodes.push(
      buildTableNode(
        ['No', 'Pokok Bahasan / Tindak Lanjut', 'Penanggung Jawab', 'Target Waktu'],
        bahasanItems.map((item, idx) => {
          const cols = parseDelimitedCells(item);
          return [
            String(idx + 1),
            cols[0] || item,
            cols[1] || pjNotulaDefault,
            cols[2] || targetNotulaDefault,
          ];
        })
      )
    );
    nodes.push(
      ...buildSignatureNodes(
        {
          type: 'signature',
          leftTitle: 'Notulis Rapat,',
          leftName: notulisDisplay,
          rightTitle: 'Mengetahui,\n{{JABATAN_KEPALA_MADRASAH}}',
          rightName: '{{NAMA_KEPALA_MADRASAH}}',
          rightIdLabel: '{{NIP_KEPALA_MADRASAH}}',
        },
        draft,
        aliasMap,
        resolvedSet,
        unresolvedSet
      )
    );
    return nodes;
  }

  // =========================================================================
  // 16. SYS-TPL-20: LAPORAN PELAKSANAAN KEGIATAN MADRASAH
  // =========================================================================
  if (baseTplId === 'SYS-TPL-20') {
    const namaKegiatan = strOrNull(fv.nama_kegiatan) ?? draft.title;
    const pelaksanaan = strOrNull(fv.pelaksanaan) ?? `${dateText} di ${schoolName}`;
    const capaianItems = splitOperatorLines(strOrNull(fv.capaian), [
      'Kegiatan dilaksanakan sesuai program kerja madrasah.',
    ]);

    const nodes: TipTapJSONNode[] = [];
    nodes.push(createHeadingNode('LAPORAN PELAKSANAAN KEGIATAN', 1, 'center', true));
    nodes.push(
      createParagraphNode(
        interpolateTokens('Nomor : {{NOMOR_LAPORAN}}', aliasMap, resolvedSet, unresolvedSet),
        { align: 'center' }
      )
    );
    nodes.push(createParagraphNode(''));
    nodes.push(createHeadingNode('I. PENDAHULUAN', 2, 'left'));
    nodes.push(
      createParagraphNode(
        `Laporan ini disusun sebagai bentuk pertanggungjawaban pelaksanaan kegiatan "${namaKegiatan}" di lingkungan ${schoolName} Tahun Ajaran ${academicYear} Semester ${semester}.`,
        { align: 'justify' }
      )
    );
    nodes.push(createHeadingNode('II. PELAKSANAAN KEGIATAN', 2, 'left'));
    nodes.push(
      buildBorderlessMetaTable([
        { label: 'Nama Kegiatan', value: namaKegiatan },
        { label: 'Waktu, Lokasi & Sasaran', value: pelaksanaan },
        { label: 'Penyelenggara', value: schoolName },
      ])
    );
    nodes.push(createHeadingNode('III. HASIL CAPAIAN, KENDALA & EVALUASI', 2, 'left'));
    const realisasiLapDefault = strOrNull(fv.status_realisasi) ?? '-';
    const evalLapDefault = strOrNull(fv.catatan_evaluasi) ?? '-';
    const penyusunName = strOrNull(fv.nama_penyusun) ?? '( .................................... )';
    nodes.push(
      buildTableNode(
        ['No', 'Aspek / Uraian Capaian', 'Realisasi', 'Catatan Evaluasi'],
        capaianItems.map((item, idx) => {
          const cols = parseDelimitedCells(item);
          return [
            String(idx + 1),
            cols[0] || item,
            cols[1] || realisasiLapDefault,
            cols[2] || evalLapDefault,
          ];
        })
      )
    );
    nodes.push(createHeadingNode('IV. PENUTUP', 2, 'left'));
    nodes.push(
      createParagraphNode(
        'Demikian laporan pelaksanaan kegiatan ini disampaikan sebagai bahan evaluasi dan arsip resmi madrasah.',
        { align: 'justify' }
      )
    );
    nodes.push(
      ...buildSignatureNodes(
        {
          type: 'signature',
          leftTitle: 'Ketua Pelaksana / Penyusun,',
          leftName: penyusunName,
          rightTitle: 'Mengetahui,\n{{JABATAN_KEPALA_MADRASAH}}',
          rightName: '{{NAMA_KEPALA_MADRASAH}}',
          rightIdLabel: '{{NIP_KEPALA_MADRASAH}}',
        },
        draft,
        aliasMap,
        resolvedSet,
        unresolvedSet
      )
    );
    return nodes;
  }

  // =========================================================================
  // 17. SYS-TPL-21: LAPORAN HASIL PELATIHAN / PERJALANAN DINAS
  // =========================================================================
  if (baseTplId === 'SYS-TPL-21') {
    const pelaksana = teachers[0];
    const namaPelaksana = pelaksana?.name ?? strOrNull(fv.pelaksana) ?? 'Pendidik / Pegawai Madrasah';
    const jabatanPelaksana = pelaksana?.roleTitle || 'Pendidik / Tenaga Kependidikan';
    const nomorSt = strOrNull(fv.nomor_surat_tugas) ?? '-';
    const materiLines = splitOperatorLines(strOrNull(fv.ringkasan_materi), [
      'Penyampaian pokok materi kegiatan dan rencana tindak lanjut di madrasah.',
    ]);

    const nodes: TipTapJSONNode[] = [];
    nodes.push(createHeadingNode('LAPORAN HASIL PELATIHAN / PERJALANAN DINAS', 1, 'center', true));
    nodes.push(
      createParagraphNode(
        interpolateTokens('Nomor Arsip : {{NOMOR_LAPORAN}}', aliasMap, resolvedSet, unresolvedSet),
        { align: 'center' }
      )
    );
    nodes.push(createParagraphNode(''));
    nodes.push(
      buildBorderlessMetaTable([
        { label: 'Nama Pelaksana', value: namaPelaksana },
        { label: 'Jabatan / Peran', value: jabatanPelaksana },
        { label: 'Unit Kerja', value: schoolName },
        { label: 'Dasar Penugasan', value: `Surat Tugas Nomor ${nomorSt}` },
        { label: 'Tanggal Laporan', value: dateText },
      ])
    );
    nodes.push(createHeadingNode('I. RINGKASAN MATERI & HASIL KEGIATAN', 2, 'left'));
    nodes.push({
      type: 'orderedList',
      attrs: { start: 1 },
      content: materiLines.map((line) => ({
        type: 'listItem',
        content: [createParagraphNode(line, { align: 'justify' })],
      })),
    });
    nodes.push(createHeadingNode('II. RENCANA IMPLEMENTASI & DISEMINASI', 2, 'left'));
    nodes.push(
      createParagraphNode(
        `Hasil kegiatan tersebut akan didiseminasikan kepada rekan sejawat dewan guru serta diimplementasikan secara bertahap pada pembelajaran di ${schoolName} Tahun Ajaran ${academicYear}.`,
        { align: 'justify' }
      )
    );
    nodes.push(
      createParagraphNode(
        'Demikian laporan hasil pelaksanaan tugas ini disampaikan untuk dapat dipergunakan sebagai bahan pertimbangan dan arsip madrasah.',
        { align: 'justify' }
      )
    );
    nodes.push(
      ...buildSignatureNodes(
        {
          type: 'signature',
          leftTitle: 'Mengetahui,\n{{JABATAN_KEPALA_MADRASAH}}',
          leftName: '{{NAMA_KEPALA_MADRASAH}}',
          rightTitle: 'Pelapor,',
          rightName: namaPelaksana,
        },
        draft,
        aliasMap,
        resolvedSet,
        unresolvedSet
      )
    );
    return nodes;
  }

  // =========================================================================
  // 18. SYS-TPL-22: LAPORAN PELAKSANAAN UJIAN / ASESMEN MADRASAH
  // =========================================================================
  if (baseTplId === 'SYS-TPL-22') {
    const jenisUjian = strOrNull(fv.jenis_ujian) ?? `Asesmen / Ujian Madrasah Tahun Ajaran ${academicYear}`;
    const rekapLines = splitOperatorLines(strOrNull(fv.rekap_kelas), [
      'Seluruh Rombel Kelas VII, VIII, dan IX',
    ]);
    const evaluasi =
      strOrNull(fv.evaluasi) ??
      'Pelaksanaan ujian diselenggarakan sesuai jadwal dan tata tertib pengawasan pada masing-masing ruang ujian.';

    const nodes: TipTapJSONNode[] = [];
    nodes.push(createHeadingNode('LAPORAN PELAKSANAAN UJIAN MADRASAH', 1, 'center', true));
    nodes.push(
      createParagraphNode(
        interpolateTokens('Nomor : {{NOMOR_LAPORAN}}', aliasMap, resolvedSet, unresolvedSet),
        { align: 'center' }
      )
    );
    nodes.push(createParagraphNode(''));
    nodes.push(createHeadingNode('I. PENDAHULUAN', 2, 'left'));
    nodes.push(
      createParagraphNode(
        `Sebagai bentuk pertanggungjawaban panitia pelaksana ${jenisUjian} pada ${schoolName} Tahun Ajaran ${academicYear} Semester ${semester}, bersama ini disampaikan laporan pelaksanaan ujian sebagai berikut:`,
        { align: 'justify' }
      )
    );
    nodes.push(createHeadingNode('II. REKAPITULASI PESERTA PER ROMBEL', 2, 'left'));
    const attendanceUjianDefault = strOrNull(fv.tingkat_kehadiran) ?? '-';
    const ketuaPanitiaName = strOrNull(fv.ketua_panitia) ?? '( .................................... )';
    nodes.push(
      buildTableNode(
        ['No', 'Tingkat / Rombel', 'Jumlah Peserta', 'Hadir (%)', 'Keterangan'],
        rekapLines.map((line, idx) => {
          const cols = parseDelimitedCells(line);
          return [
            String(idx + 1),
            cols[0] || line,
            cols[1] || '-',
            cols[2] || attendanceUjianDefault,
            cols[3] || '-',
          ];
        })
      )
    );
    nodes.push(createHeadingNode('III. EVALUASI & REKOMENDASI', 2, 'left'));
    nodes.push(createParagraphNode(evaluasi, { align: 'justify' }));
    nodes.push(
      createParagraphNode(
        'Demikian laporan pelaksanaan ujian ini dibuat dengan sebenarnya untuk digunakan sebagaimana mestinya.',
        { align: 'justify' }
      )
    );
    nodes.push(
      ...buildSignatureNodes(
        {
          type: 'signature',
          leftTitle: 'Ketua Panitia Ujian,',
          leftName: ketuaPanitiaName,
          rightTitle: 'Mengetahui,\n{{JABATAN_KEPALA_MADRASAH}}',
          rightName: '{{NAMA_KEPALA_MADRASAH}}',
          rightIdLabel: '{{NIP_KEPALA_MADRASAH}}',
        },
        draft,
        aliasMap,
        resolvedSet,
        unresolvedSet
      )
    );
    return nodes;
  }

  // =========================================================================
  // 19. SYS-TPL-29: SURAT PERNYATAAN RESMI
  // =========================================================================
  if (baseTplId === 'SYS-TPL-29') {
    const pihakMenyatakan =
      strOrNull(fv.pihak_menyatakan) ?? (strOrNull(kop.signatoryName) ?? 'Penanggung Jawab Madrasah');
    const keperluan = strOrNull(fv.keperluan_pernyataan) ?? 'kelengkapan administrasi madrasah';
    const butirList = splitOperatorLines(strOrNull(fv.isi_pernyataan), [
      'Seluruh data dan dokumen yang disampaikan adalah benar serta dapat dipertanggungjawabkan.',
    ]);

    const nodes: TipTapJSONNode[] = [];
    nodes.push(createHeadingNode('SURAT PERNYATAAN', 1, 'center', true));
    nodes.push(
      createParagraphNode(
        interpolateTokens('Nomor : {{NOMOR_SURAT}}', aliasMap, resolvedSet, unresolvedSet),
        { align: 'center' }
      )
    );
    nodes.push(createParagraphNode(''));
    nodes.push(createParagraphNode('Yang bertanda tangan di bawah ini:', { align: 'justify' }));
    nodes.push(
      buildBorderlessMetaTable([
        { label: 'Nama / Identitas', value: pihakMenyatakan },
        { label: 'Satuan Pendidikan', value: schoolName },
        { label: 'Keperluan', value: keperluan },
      ])
    );
    nodes.push(createParagraphNode('Dengan ini menyatakan dengan sesungguhnya bahwa:', { align: 'justify' }));
    nodes.push({
      type: 'orderedList',
      attrs: { start: 1 },
      content: butirList.map((item) => ({
        type: 'listItem',
        content: [createParagraphNode(item, { align: 'justify' })],
      })),
    });
    nodes.push(
      createParagraphNode(
        `Demikian surat pernyataan ini dibuat dengan sebenarnya dalam keadaan sadar untuk keperluan ${keperluan}, dan apabila di kemudian hari pernyataan ini tidak benar saya bersedia menerima sanksi sesuai ketentuan yang berlaku.`,
        { align: 'justify' }
      )
    );
    nodes.push(
      ...buildSignatureNodes(
        {
          type: 'signature',
          rightTitle: 'Yang Menyatakan,',
          rightName: pihakMenyatakan,
        },
        draft,
        aliasMap,
        resolvedSet,
        unresolvedSet
      )
    );
    return nodes;
  }

  return null;
}

/**
 * Mengonversi DocumentIntakeDraft (hasil S03 + templateSnapshot + sourceSnapshots) menjadi konten awal
 * TipTap JSON secara deterministik dan murni. Tidak memutasi draft maupun membaca Data Master hidup.
 */
export function buildInitialStudioContentFromDraft(
  draft: DocumentIntakeDraft,
  options?: {
    activeTemplates?: readonly DocumentTemplate[];
    allowVersionMismatchFallback?: boolean;
  }
): StudioInitialContentResult {
  const resolution = resolveTemplateBlocksForDraft(
    draft,
    options?.activeTemplates ?? SYSTEM_DOCUMENT_TEMPLATES,
    { allowVersionMismatchFallback: options?.allowVersionMismatchFallback }
  );

  const baseTplId = getBaseTemplateId(draft);
  const rawIncludeKop = draft.templateSnapshot?.documentHeader?.includeKopSurat !== false;
  const includeKopSurat =
    rawIncludeKop && !(baseTplId === 'SYS-TPL-30' && draft.fieldValues?.tampilkan_kop === 'Tidak');

  const aliasMap = buildExplicitTokenAliasMap(draft);
  const resolvedSet = new Set<string>();
  const unresolvedSet = new Set<string>();

  const nodes: TipTapJSONNode[] = [];

  // 1. Kop Surat (jika aktif sesuai template & pilihan S03)
  if (includeKopSurat) {
    nodes.push(...buildKopSuratNodes(draft));
  }

  // 2. Gunakan builder Tata Naskah Dinas autentik untuk template sistem baku maupun kloningan yang strukturnya belum diubah
  const systemOriginTpl = baseTplId.startsWith('SYS-TPL-')
    ? SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === baseTplId) ?? null
    : null;
  const isUnmodifiedClone =
    draft.templateSnapshot?.source === 'MADRASAH' &&
    systemOriginTpl !== null &&
    JSON.stringify(draft.templateSnapshot.previewBlocks ?? []) ===
      JSON.stringify(systemOriginTpl.previewBlocks);
  const canUseSpecialized =
    draft.templateSnapshot?.source === 'SYSTEM' || isUnmodifiedClone;
  const specialized = canUseSpecialized
    ? buildSpecializedAuthenticNodes({
        baseTplId,
        draft,
        aliasMap,
        resolvedSet,
        unresolvedSet,
      })
    : null;

  if (specialized) {
    nodes.push(...specialized);
  } else {
    // 2B. Fallback tata letak baku untuk template kustom / termodifikasi
    const kopSnapFallback = findSnapshot(draft, 'settings.madrasah_identity_signatory');
    const kopFallback = (kopSnapFallback?.capturedValue ?? {}) as FrozenKopSnapshot;
    const cityFallback = strOrNull(kopFallback.city) ?? '[Kota Madrasah]';
    const dateFallback = formatIndonesianLongDate(draft.documentDate) ?? draft.documentDate;
    const titimangsaFallback = `${cityFallback}, ${dateFallback}`;

    const rawNumberLine = draft.templateSnapshot?.documentHeader?.numberPlaceholder;
    const numSegments = rawNumberLine
      ? interpolateTokens(rawNumberLine, aliasMap, resolvedSet, unresolvedSet)
          .split(/\r?\n|\s*·\s*/g)
          .map((seg) => seg.trim())
          .filter(Boolean)
      : [];
    const isCorrespondenceDoc =
      draft.templateSnapshot?.documentKind === 'SURAT_KELUAR' ||
      draft.templateSnapshot?.documentKind === 'UNDANGAN';
    const hasLetterHeaderMetadata =
      isCorrespondenceDoc &&
      numSegments.length > 1 &&
      numSegments.some((seg) => /^(Sifat|Lampiran|Hal)\s*:/i.test(seg));

    if (hasLetterHeaderMetadata) {
      let nomorVal = '{{NOMOR_SURAT}}';
      let sifatVal: string | null = null;
      let lampiranVal: string | null = null;
      let halVal = draft.subject || draft.title;
      for (const seg of numSegments) {
        if (/^Nomor\s*:/i.test(seg)) {
          nomorVal = seg.replace(/^Nomor\s*:\s*/i, '').trim() || nomorVal;
        } else if (/^Sifat\s*:/i.test(seg)) {
          sifatVal = seg.replace(/^Sifat\s*:\s*/i, '').trim() || null;
        } else if (/^Lampiran\s*:/i.test(seg)) {
          lampiranVal = seg.replace(/^Lampiran\s*:\s*/i, '').trim() || null;
        } else if (/^Hal\s*:/i.test(seg)) {
          halVal = seg.replace(/^Hal\s*:\s*/i, '').trim() || halVal;
        }
      }
      nodes.push(
        buildCorrespondenceLetterHeader({
          numberToken: nomorVal,
          sifat: sifatVal,
          lampiran: lampiranVal,
          hal: halVal,
          titimangsa: titimangsaFallback,
        })
      );
      nodes.push(createParagraphNode(''));
    } else {
      const rawHeaderTitle = draft.templateSnapshot?.documentHeader?.title || draft.title;
      const titleLines = interpolateTokens(rawHeaderTitle, aliasMap, resolvedSet, unresolvedSet)
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

      const underlineTitle = titleLines.length === 1 && baseTplId !== 'SYS-TPL-30';
      titleLines.forEach((line, idx) => {
        nodes.push(createHeadingNode(line, idx === 0 ? 1 : 2, 'center', idx === 0 && underlineTitle));
      });

      if (numSegments.length > 0) {
        nodes.push(createParagraphNode(numSegments.join('\n'), { align: 'center' }));
      }
      nodes.push(createParagraphNode(''));
    }

    // 3. Konversi deterministik setiap TemplatePreviewBlock -> node TipTap autentik
    const fv = draft.fieldValues ?? {};
    for (const block of resolution.previewBlocks) {
      if (block.type === 'heading') {
        const text = interpolateTokens(block.text, aliasMap, resolvedSet, unresolvedSet);
        nodes.push(createHeadingNode(text, 2, block.align ?? 'left'));
      } else if (block.type === 'paragraph') {
        const text = interpolateTokens(block.text, aliasMap, resolvedSet, unresolvedSet);
        nodes.push(createParagraphNode(text, { align: 'justify' }));
      } else if (block.type === 'list') {
        const listType = block.ordered ? 'orderedList' : 'bulletList';
        // Ekspansi cerdas untuk daftar multi-baris dari input operator (SYS-TPL-09, 17, 29)
        const joinedItems = block.items.join(' ');
        let resolvedItems: string[];
        if (joinedItems.includes('{{POIN_KETENTUAN_1}}') && strOrNull(fv.rincian)) {
          resolvedItems = splitOperatorLines(strOrNull(fv.rincian), []);
        } else if (joinedItems.includes('{{BUTIR_KEPUTUSAN_1}}') && strOrNull(fv.hasil_keputusan)) {
          resolvedItems = splitOperatorLines(strOrNull(fv.hasil_keputusan), []);
        } else if (joinedItems.includes('{{BUTIR_PERNYATAAN_1}}') && strOrNull(fv.isi_pernyataan)) {
          resolvedItems = splitOperatorLines(strOrNull(fv.isi_pernyataan), []);
        } else {
          resolvedItems = block.items.map((item) =>
            interpolateTokens(item, aliasMap, resolvedSet, unresolvedSet)
          );
        }

        nodes.push({
          type: listType,
          ...(block.ordered ? { attrs: { start: 1 } } : {}),
          content: resolvedItems.map((itemText) => ({
            type: 'listItem',
            content: [createParagraphNode(itemText, { align: 'justify' })],
          })),
        });
      } else if (block.type === 'meta_grid') {
        const metaRows = block.rows.map((r) => ({
          label: r.label,
          value: interpolateTokens(r.value, aliasMap, resolvedSet, unresolvedSet)
            .replace(/\s*·\s*-\s*$/g, '')
            .replace(/\s*·\s*$/g, '')
            .trim(),
        }));
        nodes.push(buildBorderlessMetaTable(metaRows));
      } else if (block.type === 'table') {
        const expandedRows = buildExpandedTableRows(
          block,
          draft,
          aliasMap,
          resolvedSet,
          unresolvedSet
        );
        nodes.push(buildTableNode(block.columns, expandedRows));
      } else if (block.type === 'signature') {
        const extraNote =
          strOrNull(draft.fieldValues?.catatan_khusus) ?? strOrNull(draft.fieldValues?.dasar_hukum);
        if (extraNote && baseTplId !== 'SYS-TPL-04' && baseTplId !== 'SYS-TPL-05') {
          nodes.push(createParagraphNode(`Catatan: ${extraNote}`, { align: 'justify' }));
        }
        const isDecree = draft.templateSnapshot?.documentKind === 'SK';
        nodes.push(
          ...buildSignatureNodes(block, draft, aliasMap, resolvedSet, unresolvedSet, {
            ditetapkanStyle: isDecree,
          })
        );
      }
    }
  }

  const content: TipTapJSONContent = {
    type: 'doc',
    content: nodes.length > 0 ? nodes : [createParagraphNode('')],
  };

  // Sinkronkan unresolvedTokens dari hasil dokumen final
  const extracted = extractPlainTextAndTokens(content);
  for (const tok of extracted.unresolvedTokens) {
    unresolvedSet.add(tok);
  }

  return {
    content,
    pageSettings: normalizeInitialPageSettings(draft),
    placeholderReport: {
      resolvedTokens: Array.from(resolvedSet).sort(),
      unresolvedTokens: Array.from(unresolvedSet).sort(),
    },
    resolution,
    includeKopSurat,
  };
}

function collectPlainTextRecursive(node: TipTapJSONNode): string {
  if (node.type === 'text' && typeof node.text === 'string') return node.text;
  if (node.type === 'hardBreak') return '\n';
  if (Array.isArray(node.content)) {
    return node.content.map(collectPlainTextRecursive).join('');
  }
  return '';
}

/**
 * Menghapus blok Kop Surat teks polos otomatis di awal dokumen (hingga garis `horizontalRule` pertama)
 * saat Kop Surat grafis resmi (OfficialKopSuratPreview / renderOfficialKopSurat) sudah ditampilkan,
 * sehingga Kop Surat tidak tampil ganda.
 */
export function stripAutoGeneratedKopNodes(
  nodes: TipTapJSONNode[],
  schoolName?: string | null
): TipTapJSONNode[] {
  if (!Array.isArray(nodes) || nodes.length < 2) return nodes;
  const firstHrIdx = nodes.findIndex((n, idx) => idx <= 10 && n.type === 'horizontalRule');
  if (firstHrIdx <= 0) return nodes;
  const leadingText = nodes
    .slice(0, firstHrIdx)
    .map(collectPlainTextRecursive)
    .join(' ')
    .toUpperCase();
  const cleanSchool = (schoolName ?? '').trim().toUpperCase();
  const schoolKey = cleanSchool.slice(0, Math.min(18, cleanSchool.length));
  if (
    (schoolKey && leadingText.includes(schoolKey)) ||
    leadingText.includes('MADRASAH TSANAWIYAH') ||
    leadingText.includes('MADRASAH ALIYAH') ||
    leadingText.includes('MADRASAH IBTIDAIYAH') ||
    leadingText.includes('KEMENTERIAN AGAMA')
  ) {
    return nodes.slice(firstHrIdx + 1);
  }
  return nodes;
}
