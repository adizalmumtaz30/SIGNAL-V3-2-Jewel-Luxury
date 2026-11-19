import type { DocumentIntakeDraft, SourceSnapshotEntry } from '../types';
import type { DocumentTemplate, TemplatePreviewBlock } from '../templates/types';
import {
  formatKopAddressLine,
  formatKopRegistryLine,
} from '../../kopIdentity';
import { SYSTEM_DOCUMENT_TEMPLATES } from '../templates/registry';
import { extractPlainTextAndTokens, validateStudioPageSettings } from './contentValidation';
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
}

interface FrozenTeacherSnapshot {
  id: string;
  code: string | null;
  name: string;
  roleTitle: string | null;
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

/**
 * Resolusi template untuk draft S03 baru maupun draft lama yang belum menyimpan `previewBlocks`.
 * - Jika `templateSnapshot.previewBlocks` ada: selalu gunakan snapshot beku (terisolasi dari edit template).
 * - Jika `templateSnapshot.previewBlocks` tidak ada (draft legacy): cocokkan terhadap template aktif
 *   dengan syarat `version` sama. Jika versi berbeda, minta konfirmasi eksplisit ke pengguna.
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
          text: draft.subject || 'Silakan lanjutkan penyusunan naskah dokumen di Document Studio (S04).',
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
              text: draft.subject || 'Silakan susun isi dokumen berdasarkan data awal S03 yang tersimpan.',
            },
          ],
      templateName: snapshot.name,
      snapshotVersion: snapshot.version,
      activeVersion: matched.version,
      matchedTemplate: matched,
      requiresConfirmation: !options?.allowVersionMismatchFallback,
      notice: `Draft S03 ini menggunakan template versi ${snapshot.version}, sedangkan template aktif saat ini adalah versi ${matched.version}.`,
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
 * TIDAK melakukan tebakan fuzzy dan TIDAK membaca state Data Master hidup.
 * Token penomoran resmi (`NOMOR_SURAT`, `NOMOR_SK`, dll.) sengaja dipertahankan sebagai placeholder belum terisi.
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

  const kopSchool = strOrNull(kopVal.schoolName);
  const kopTitle = strOrNull(kopVal.signatoryTitle);
  const kopName = strOrNull(kopVal.signatoryName);
  // NIP penandatangan hanya diambil jika ada di snapshot beku; tidak pernah fetch live NIP
  const kopNip = strOrNull(kopVal.signatoryNip);

  const primaryTeacher = teachers[0];
  const secondTeacher = teachers[1];

  const docLongDate = formatIndonesianLongDate(draft.documentDate);
  const periodeUjianMulai = formatIndonesianLongDate(strOrNull(fv.periode_ujian_mulai));
  const periodeUjianSelesai = formatIndonesianLongDate(strOrNull(fv.periode_ujian_selesai));
  const periodeUjianText =
    periodeUjianMulai && periodeUjianSelesai
      ? `${periodeUjianMulai} s.d. ${periodeUjianSelesai}`
      : null;

  const map: Record<string, string | null> = {
    // 1. Identitas & Penandatangan (hanya dari snapshot settings.madrasah_identity_signatory)
    NAMA_MADRASAH: kopSchool,
    JABATAN_KEPALA_MADRASAH: kopTitle,
    NAMA_KEPALA_MADRASAH: kopName,
    NIP_KEPALA_MADRASAH: kopNip ? `NIP. ${kopNip}` : null,
    JABATAN_PENANDATANGAN: kopTitle,
    NAMA_PENANDATANGAN: kopName,
    NIP_ATAU_NPK_PENANDATANGAN: kopNip ? `NIP/NPK ${kopNip}` : null,
    JABATAN_PENGIRIM: kopTitle,
    TAHUN_AJARAN: strOrNull(kopVal.academicYear),
    SEMESTER: strOrNull(kopVal.semester),

    // 2. Penomoran resmi sengaja BELUM diisi pada S04 (ditangani S05 Tahap 8)
    NOMOR_SURAT: null,
    NOMOR_SK: null,
    NOMOR_BERITA_ACARA: null,
    NOMOR_LAPORAN: null,
    NOMOR_NOTA_DINAS: null,
    NOMOR_NOTULAN: null,
    NOMOR_NOTULA: null,
    NOMOR_DOKUMEN: null,

    // 3. Field Form Data Awal S03 (Penugasan, Pelatihan, SK)
    NAMA_KEGIATAN: strOrNull(fv.nama_kegiatan) ?? strOrNull(fv.nama_kepanitiaan),
    INSTANSI_PENYELENGGARA: strOrNull(fv.penyelenggara),
    PENYELENGGARA: strOrNull(fv.penyelenggara),
    TANGGAL_MULAI: formatIndonesianLongDate(strOrNull(fv.tanggal_mulai)),
    TANGGAL_SELESAI: formatIndonesianLongDate(strOrNull(fv.tanggal_selesai)),
    LOKASI_KEGIATAN: strOrNull(fv.lokasi),
    DASAR_PENUGASAN: strOrNull(fv.dasar_surat),

    NAMA_PEGAWAI: primaryTeacher?.name ?? null,
    JABATAN_PEGAWAI: primaryTeacher?.roleTitle ?? (primaryTeacher ? 'Pendidik / Pegawai' : null),
    AGENDA_KEGIATAN_DINAS: strOrNull(fv.agenda),
    TANGGAL_TUGAS: formatIndonesianLongDate(strOrNull(fv.tanggal_dinas)),
    TEMPAT_TUJUAN: strOrNull(fv.tempat_tujuan),

    VERSI_JADWAL_TERBIT: scheduleVer
      ? `Versi ${scheduleVer.versionNumber} (${scheduleVer.label})`
      : null,
    FINGERPRINT_JADWAL: scheduleVer?.fingerprint ?? strOrNull(draft.scheduleVersionFingerprint),

    PERIODE_TMT: formatIndonesianLongDate(strOrNull(fv.tmt_berlaku)),

    NAMA_KETUA_PANITIA: primaryTeacher?.name ?? null,
    JABATAN_ASAL_1: primaryTeacher?.roleTitle ?? (primaryTeacher ? 'Pendidik' : null),
    NAMA_SEKRETARIS_PANITIA: secondTeacher?.name ?? null,
    JABATAN_ASAL_2: secondTeacher?.roleTitle ?? (secondTeacher ? 'Pendidik' : null),

    NAMA_UJIAN: strOrNull(fv.jenis_ujian) ?? strOrNull(fv.nama_ujian),
    PERIODE_UJIAN: periodeUjianText,
    NAMA_PENGAWAS_1: primaryTeacher?.name ?? null,
    NAMA_PENGAWAS_2: secondTeacher?.name ?? null,

    // 4. Korespondensi (S07–S10)
    PENERIMA_UNDANGAN: strOrNull(fv.kepada),
    AGENDA_RAPAT: strOrNull(fv.agenda_rapat) ?? strOrNull(fv.judul_rapat),
    TEMPAT_RAPAT: strOrNull(fv.tempat_rapat),
    HARI_TANGGAL_RAPAT: strOrNull(fv.waktu_rapat),
    PEJABAT_INSTANSI_TUJUAN: strOrNull(fv.instansi_tujuan),
    INSTANSI_PENERIMA: strOrNull(fv.penerima),
    SIFAT_SURAT: strOrNull(fv.sifat_surat),
    PERIHAL: strOrNull(fv.perihal),
    POKOK_ISI_SURAT_DINAS: strOrNull(fv.isi_pokok),
    SASARAN_PENGUMUMAN: strOrNull(fv.sasaran),
    TOPIK_PEMBERITAHUAN: strOrNull(fv.topik),
    PEJABAT_PENERIMA_INTERNAL: strOrNull(fv.yth_internal),
    PEJABAT_PENGIRIM_INTERNAL: strOrNull(fv.dari_internal),
    JABATAN_PENGIRIM_INTERNAL: strOrNull(fv.dari_internal),
    TANGGAL_NOTA: docLongDate,
    HAL_NOTA: strOrNull(fv.hal_nota),
    ISI_KOORDINASI_INTERNAL_MADRASAH: strOrNull(fv.isi_nota),

    // 5. Keterangan & Pengantar (S11–S15)
    NAMA_GURU: primaryTeacher?.name ?? null,
    // IDENTITAS_KEPEGAWAIAN_GURU & NIP_GURU sengaja tidak diisi dari live state karena S03 tidak membekukan NIP guru
    IDENTITAS_KEPEGAWAIAN_GURU: null,
    NIP_GURU: null,
    TMT_MENGAJAR: formatIndonesianLongDate(strOrNull(fv.tmt_mengajar)),
    KEPERLUAN_SURAT: strOrNull(fv.keperluan),
    URAIAN_TUGAS_GURU: strOrNull(fv.uraian_tugas),
    NOMOR_SK_RUJUKAN: strOrNull(fv.nomor_sk_rujukan),
    NAMA_LENGKAP_SISWA: strOrNull(fv.nama_siswa),
    NAMA_SISWA: strOrNull(fv.nama_siswa),
    NOMOR_INDUK_SISWA: strOrNull(fv.nisn),
    TTL_SISWA: strOrNull(fv.ttl_siswa),
    NAMA_KELAS: className,
    KEPERLUAN_SISWA: strOrNull(fv.keperluan),
    NAMA_YANG_DIREKOMENDASIKAN: strOrNull(fv.subjek_rekomendasi),
    PROGRAM_TUJUAN_REKOMENDASI: strOrNull(fv.tujuan_program),
    DASAR_PERTIMBANGAN_REKOMENDASI: strOrNull(fv.dasar_pertimbangan),

    // 6. Berita Acara & Laporan (S16–S22)
    HARI_TANGGAL_BA: formatIndonesianLongDate(strOrNull(fv.tanggal_ba)),
    PIHAK_PERTAMA: strOrNull(fv.pihak_pertama),
    PIHAK_KEDUA: strOrNull(fv.pihak_kedua),
    NAMA_PIHAK_KEDUA: strOrNull(fv.pihak_kedua),
    JUDUL_RAPAT: strOrNull(fv.judul_rapat),
    WAKTU_TEMPAT_RAPAT: strOrNull(fv.waktu_tempat),
    JUMLAH_PESERTA: strOrNull(fv.jumlah_peserta),
    NAMA_MAPEL: subjectName,
    RUANG_UJIAN: strOrNull(fv.ruang_ujian),
    CATATAN_KEJADIAN_KHUSUS: strOrNull(fv.kejadian_khusus),
    NAMA_PELAKSANA: primaryTeacher?.name ?? null,
    NOMOR_SURAT_TUGAS: strOrNull(fv.nomor_surat_tugas),
    RINGKASAN_MATERI_DAN_RENCANA_DISEMINASI: strOrNull(fv.ringkasan_materi),

    // 7. Administrasi & Kanvas Kosong (S23–S30)
    PIHAK_PEMBERI_IZIN: strOrNull(fv.pihak_tujuan),
    NAMA_ATAU_INSTANSI_NARASUMBER: strOrNull(fv.narasumber),
    TEMA_MATERI: strOrNull(fv.tema_materi),
    WAKTU_SESI: strOrNull(fv.waktu_sesi),
    KELAS_SASARAN: strOrNull(fv.sasaran_wali),
    AGENDA_PERTEMUAN_WALI: strOrNull(fv.agenda),
    WAKTU_PANGGILAN: strOrNull(fv.waktu_panggilan),
    PEJABAT_YANG_DITEMUI: strOrNull(fv.menemui),
    SASARAN_KELAS: strOrNull(fv.sasaran_orang_tua),
    POKOK_PEMBERITAHUAN_KEPADA_ORANG_TUA: strOrNull(fv.isi_pemberitahuan),
    INSTANSI_CALON_MITRA: strOrNull(fv.instansi_mitra),
    RUANG_LINGKUP_KERJA_SAMA: strOrNull(fv.ruang_lingkup),
    NAMA_PIHAK_MENYATAKAN: strOrNull(fv.pihak_menyatakan),
    JUDUL_DOKUMEN_BEBAS: strOrNull(fv.judul_dokumen) ?? strOrNull(draft.title),
    KONTEN_DOKUMEN_BEBAS_DIMULAI_DI_DOCUMENT_STUDIO:
      'Tuliskan isi naskah dokumen Anda di sini sesuai kebutuhan administrasi madrasah.',
  };

  // Alias peserta dinamis 1..N berdasarkan snapshot guru terpilih
  teachers.forEach((t, idx) => {
    const n = idx + 1;
    map[`NAMA_PESERTA_${n}`] = t.name;
    map[`JABATAN_PESERTA_${n}`] = t.roleTitle ?? 'Pendidik / Pegawai';
    map[`IDENTITAS_PESERTA_${n}`] = null; // NIP/NUPTK guru tidak dibekukan di S03
    map[`NAMA_GURU_${n}`] = t.name;
    map[`UNIT_ROMBEL_${n}`] = t.roleTitle ?? null;
  });

  // Alias beban kerja SK Pembagian Tugas dari ScheduleVersion snapshot
  if (scheduleVer?.teacherWorkloads) {
    scheduleVer.teacherWorkloads.forEach((w, idx) => {
      const n = idx + 1;
      map[`NAMA_GURU_${n}`] = w.teacherName;
      map[`TOTAL_JP_${n}`] = String(w.totalJP);
      map[`ROMBEL_GURU_${n}`] = `${w.classesCount} rombel`;
      map[`MAPEL_GURU_${n}`] = `Sesuai Jadwal (${scheduleVer.label})`;
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
    if (typeof resolved === 'string' && resolved.trim().length > 0) {
      resolvedTracker.add(tokenName);
      return resolved;
    }
    unresolvedTracker.add(tokenName);
    return `{{${tokenName}}} [Belum diisi]`;
  });
}

function createTextNode(text: string, marks?: TipTapJSONMark[]): TipTapJSONNode {
  return marks && marks.length > 0
    ? { type: 'text', text, marks }
    : { type: 'text', text };
}

function createParagraphNode(
  text: string,
  options?: { align?: 'left' | 'center' | 'right' | 'justify'; bold?: boolean }
): TipTapJSONNode {
  const attrs = options?.align ? { textAlign: options.align } : undefined;
  const marks: TipTapJSONMark[] | undefined = options?.bold ? [{ type: 'bold' }] : undefined;
  return {
    type: 'paragraph',
    ...(attrs ? { attrs } : {}),
    content: text ? [createTextNode(text, marks)] : [],
  };
}

function createHeadingNode(
  text: string,
  level: 1 | 2 | 3,
  align?: 'left' | 'center' | 'right' | 'justify'
): TipTapJSONNode {
  return {
    type: 'heading',
    attrs: { level, ...(align ? { textAlign: align } : {}) },
    content: [createTextNode(text)],
  };
}

function buildKopSuratNodes(draft: DocumentIntakeDraft): TipTapJSONNode[] {
  const kopSnap = findSnapshot(draft, 'settings.madrasah_identity_signatory');
  const kop = (kopSnap?.capturedValue ?? {}) as FrozenKopSnapshot;

  const nodes: TipTapJSONNode[] = [];
  nodes.push(
    createParagraphNode((strOrNull(kop.schoolName) ?? '{{NAMA_MADRASAH}} [Belum diisi]').toUpperCase(), {
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
      content: [createParagraphNode(col, { bold: true })],
    })),
  };

  const bodyRows: TipTapJSONNode[] = rows.map((row) => ({
    type: 'tableRow',
    content: columns.map((_, colIdx) => ({
      type: 'tableCell',
      content: [createParagraphNode(row[colIdx] ?? '')],
    })),
  }));

  return {
    type: 'table',
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
      `{{IDENTITAS_PESERTA_${idx + 1}}} [Belum diisi]`,
      t.roleTitle || 'Pendidik / Pegawai',
    ]);
  }

  // 2. Tabel SK Pembagian Tugas Mengajar (SYS-TPL-03) berbasis ScheduleVersion snapshot
  if (
    firstSampleJoined.includes('{{TOTAL_JP_1}}') &&
    scheduleVer?.teacherWorkloads &&
    scheduleVer.teacherWorkloads.length > 0
  ) {
    return scheduleVer.teacherWorkloads.map((w, idx) => [
      String(idx + 1),
      w.teacherName,
      `Sesuai Jadwal Terbit (${scheduleVer.label})`,
      `${w.classesCount} rombel`,
      `${w.totalJP} JP`,
    ]);
  }

  // 3. Tabel pengawas / tugas tambahan dari daftar guru terpilih bila lebih dari sample
  if (firstSampleJoined.includes('{{NAMA_PENGAWAS_1}}') && teachers.length > 0) {
    return teachers.map((t, idx) => [
      String(idx + 1),
      t.name,
      'Pengawas Ruang',
      interpolateTokens(`{{RUANG_${idx + 1}}}`, aliasMap, resolvedSet, unresolvedSet),
      interpolateTokens('{{PERIODE_UJIAN}}', aliasMap, resolvedSet, unresolvedSet),
    ]);
  }

  if (firstSampleJoined.includes('{{JABATAN_TAMBAHAN_1}}') && teachers.length > 0) {
    return teachers.map((t, idx) => [
      String(idx + 1),
      t.name,
      t.roleTitle || interpolateTokens(`{{JABATAN_TAMBAHAN_${idx + 1}}}`, aliasMap, resolvedSet, unresolvedSet),
      interpolateTokens(`{{UNIT_ROMBEL_${idx + 1}}}`, aliasMap, resolvedSet, unresolvedSet),
      interpolateTokens('{{PERIODE_TMT}}', aliasMap, resolvedSet, unresolvedSet),
    ]);
  }

  // Default: interpolasi setiap sel sampleRows secara deterministik
  return block.sampleRows.map((row) =>
    row.map((cell) => interpolateTokens(cell, aliasMap, resolvedSet, unresolvedSet))
  );
}

function buildSignatureNodes(
  block: Extract<TemplatePreviewBlock, { type: 'signature' }>,
  draft: DocumentIntakeDraft,
  aliasMap: Record<string, string | null>,
  resolvedSet: Set<string>,
  unresolvedSet: Set<string>
): TipTapJSONNode[] {
  const kopSnap = findSnapshot(draft, 'settings.madrasah_identity_signatory');
  const kop = (kopSnap?.capturedValue ?? {}) as FrozenKopSnapshot;
  const city = strOrNull(kop.city);
  const dateText = formatIndonesianLongDate(draft.documentDate) ?? draft.documentDate;
  const titimangsa = city ? `${city}, ${dateText}` : dateText;

  const rightTitle = interpolateTokens(block.rightTitle, aliasMap, resolvedSet, unresolvedSet);
  const rightName = interpolateTokens(block.rightName, aliasMap, resolvedSet, unresolvedSet);
  const rightId = block.rightIdLabel
    ? interpolateTokens(block.rightIdLabel, aliasMap, resolvedSet, unresolvedSet)
    : '';

  if (block.leftTitle) {
    const leftTitle = interpolateTokens(block.leftTitle, aliasMap, resolvedSet, unresolvedSet);
    const leftName = interpolateTokens(block.leftName ?? '', aliasMap, resolvedSet, unresolvedSet);
    return [
      createParagraphNode(''),
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [
                  createParagraphNode(leftTitle),
                  createParagraphNode(''),
                  createParagraphNode(''),
                  createParagraphNode(leftName, { bold: true }),
                ],
              },
              {
                type: 'tableCell',
                content: [
                  createParagraphNode(titimangsa),
                  createParagraphNode(rightTitle),
                  createParagraphNode(''),
                  createParagraphNode(''),
                  createParagraphNode(rightName, { bold: true }),
                  ...(rightId ? [createParagraphNode(rightId)] : []),
                ],
              },
            ],
          },
        ],
      },
    ];
  }

  return [
    createParagraphNode(''),
    createParagraphNode(titimangsa, { align: 'right' }),
    createParagraphNode(rightTitle, { align: 'right' }),
    createParagraphNode('', { align: 'right' }),
    createParagraphNode('', { align: 'right' }),
    createParagraphNode(rightName, { align: 'right', bold: true }),
    ...(rightId ? [createParagraphNode(rightId, { align: 'right' })] : []),
  ];
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

  // 2. Judul Dokumen & Placeholder Nomor Resmi
  const rawHeaderTitle = draft.templateSnapshot?.documentHeader?.title || draft.title;
  const titleLines = interpolateTokens(rawHeaderTitle, aliasMap, resolvedSet, unresolvedSet)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  titleLines.forEach((line, idx) => {
    nodes.push(createHeadingNode(line, idx === 0 ? 1 : 2, 'center'));
  });

  const rawNumberLine = draft.templateSnapshot?.documentHeader?.numberPlaceholder;
  if (rawNumberLine) {
    const numLine = interpolateTokens(rawNumberLine, aliasMap, resolvedSet, unresolvedSet);
    nodes.push(createParagraphNode(numLine, { align: 'center' }));
  }

  // 3. Konversi deterministik setiap TemplatePreviewBlock -> node TipTap
  for (const block of resolution.previewBlocks) {
    if (block.type === 'heading') {
      const text = interpolateTokens(block.text, aliasMap, resolvedSet, unresolvedSet);
      nodes.push(createHeadingNode(text, 2, block.align ?? 'left'));
    } else if (block.type === 'paragraph') {
      const text = interpolateTokens(block.text, aliasMap, resolvedSet, unresolvedSet);
      nodes.push(createParagraphNode(text));
    } else if (block.type === 'list') {
      const listType = block.ordered ? 'orderedList' : 'bulletList';
      nodes.push({
        type: listType,
        ...(block.ordered ? { attrs: { start: 1 } } : {}),
        content: block.items.map((item) => ({
          type: 'listItem',
          content: [
            createParagraphNode(interpolateTokens(item, aliasMap, resolvedSet, unresolvedSet)),
          ],
        })),
      });
    } else if (block.type === 'meta_grid') {
      const metaRows = block.rows.map((r) => [
        r.label,
        `: ${interpolateTokens(r.value, aliasMap, resolvedSet, unresolvedSet)}`,
      ]);
      nodes.push({
        type: 'table',
        content: metaRows.map(([k, v]) => ({
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [createParagraphNode(k, { bold: true })] },
            { type: 'tableCell', content: [createParagraphNode(v)] },
          ],
        })),
      });
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
      // Sisipkan catatan_khusus / dasar_hukum operator sebelum blok tanda tangan bila ada
      const extraNote =
        strOrNull(draft.fieldValues?.catatan_khusus) ?? strOrNull(draft.fieldValues?.dasar_hukum);
      if (extraNote) {
        nodes.push(createParagraphNode(`Catatan: ${extraNote}`));
      }
      nodes.push(...buildSignatureNodes(block, draft, aliasMap, resolvedSet, unresolvedSet));
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
    leadingText.includes('DARUTTAFSIR') ||
    leadingText.includes('KEMENTERIAN AGAMA')
  ) {
    return nodes.slice(firstHrIdx + 1);
  }
  return nodes;
}
