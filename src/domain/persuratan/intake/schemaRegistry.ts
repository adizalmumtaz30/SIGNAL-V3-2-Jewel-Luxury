import type { AppState } from '../../types';
import {
  aggregateTeacherWorkloadFromEntries,
  getPublishedScheduleVersions,
} from '../../scheduleSources';
import { isValidIsoDate } from '../../teacherAssignments';
import type { DocumentTemplate } from '../templates/types';
import type {
  IntakeControlDefinition,
  IntakeFormValues,
  IntakeTemplateSchema,
  IntakeValidationError,
  IntakeValidationResult,
  ResolvedKopSystemData,
  ResolvedScheduleVersionSummary,
  ResolvedSystemAutoData,
} from './types';

function resolveBaseTemplateId(template: DocumentTemplate): string {
  if (template.source === 'SYSTEM') return template.id;
  if (template.sourceTemplateId && template.sourceTemplateId.startsWith('SYS-TPL-')) {
    return template.sourceTemplateId;
  }
  return template.id;
}

const DEFAULT_KOP_CONTROL: IntakeControlDefinition = {
  key: 'kop_madrasah',
  label: 'Kop Surat & Pejabat Penandatangan',
  controlType: 'auto_system',
  provenance: 'AUTO_SYSTEM',
  required: true,
  sourceHint: 'Pengaturan Identitas Madrasah',
  autoSourceKey: 'kop_madrasah',
  helperText: 'Diambil otomatis dari Pengaturan Identitas Madrasah dan dibekukan sebagai snapshot saat draft disimpan.',
};

type SchemaPatchBuilder = (template: DocumentTemplate) => Omit<IntakeTemplateSchema, 'baseTemplateId' | 'templateId' | 'templateName'>;

const SYSTEM_SCHEMA_OVERRIDES: Record<string, SchemaPatchBuilder> = {
  'SYS-TPL-01': () => ({
    supportsAttachmentNotice: true,
    attachmentNoticeText:
      'Lampiran undangan (PDF/JPG/PNG) akan menggunakan penyimpanan Blob IndexedDB khusus yang baru diaktifkan pada tahap lanjutan. Saat ini (Tahap 4), jangan unggah file lampiran base64 ke draft; cantumkan nomor/tanggal surat undangan pada kolom Dasar Surat atau Catatan Khusus.',
    controls: [
      {
        key: 'peserta',
        label: 'Peserta Tugas (Guru / Tendik Aktif)',
        controlType: 'teacher_multi_select',
        provenance: 'OPERATOR_INPUT',
        required: true,
        minItems: 1,
        sourceHint: 'Data Master Guru Aktif',
        helperText: 'Pilih minimal satu guru aktif. Guru nonaktif tidak ditampilkan pada pemilih peserta baru.',
      },
      {
        key: 'nama_kegiatan',
        label: 'Nama Pelatihan / Bimtek / Workshop',
        controlType: 'text',
        provenance: 'OPERATOR_INPUT',
        required: true,
        placeholder: 'Misal: Bimbingan Teknis Implementasi Kurikulum Merdeka Madrasah',
      },
      {
        key: 'penyelenggara',
        label: 'Instansi Penyelenggara',
        controlType: 'text',
        provenance: 'OPERATOR_INPUT',
        required: true,
        placeholder: 'Misal: Balai Diklat Keagamaan / Kankemenag Kabupaten',
      },
      {
        key: 'tanggal_mulai',
        label: 'Tanggal Mulai & Selesai Pelaksanaan',
        controlType: 'date_range',
        provenance: 'OPERATOR_INPUT',
        required: true,
        startKey: 'tanggal_mulai',
        endKey: 'tanggal_selesai',
        startLabel: 'Tanggal Mulai',
        endLabel: 'Tanggal Selesai',
        helperText: 'Tanggal selesai tidak boleh lebih awal dari tanggal mulai.',
      },
      {
        key: 'lokasi',
        label: 'Tempat / Lokasi Pelaksanaan',
        controlType: 'text',
        provenance: 'OPERATOR_INPUT',
        required: true,
        placeholder: 'Misal: Aula Kankemenag Kabupaten / Hotel Santika',
      },
      {
        key: 'dasar_surat',
        label: 'Dasar Penugasan (Nomor & Tanggal Surat Undangan)',
        controlType: 'text',
        provenance: 'OPERATOR_INPUT',
        required: false,
        placeholder: 'Opsional · Misal: Surat Undangan No. B-412/Kk.13/XI/2026 tgl 10 Nov 2026',
      },
      {
        key: 'catatan_khusus',
        label: 'Catatan Khusus (Opsional)',
        controlType: 'textarea',
        provenance: 'OPERATOR_INPUT',
        required: false,
        placeholder: 'Ketentuan pakaian, laporan hasil pelatihan, atau informasi tambahan lain (opsional).',
      },
      DEFAULT_KOP_CONTROL,
    ],
  }),

  'SYS-TPL-02': () => ({
    supportsAttachmentNotice: true,
    attachmentNoticeText:
      'Lampiran surat undangan dinas (PDF/JPG/PNG) menggunakan IndexedDB Blob Store yang diaktifkan pada tahap lampiran berikutnya; tulis nomor surat rujukan pada form ini.',
    controls: [
      {
        key: 'peserta',
        label: 'Pegawai yang Ditugaskan',
        controlType: 'teacher_multi_select',
        provenance: 'OPERATOR_INPUT',
        required: true,
        minItems: 1,
        sourceHint: 'Data Master Guru Aktif',
      },
      {
        key: 'agenda',
        label: 'Agenda / Maksud Tugas Dinas',
        controlType: 'textarea',
        provenance: 'OPERATOR_INPUT',
        required: true,
        placeholder: 'Uraikan maksud penugasan rapat koordinasi, monitoring, atau dinas luar.',
      },
      {
        key: 'tanggal_dinas',
        label: 'Tanggal Pelaksanaan Dinas',
        controlType: 'date',
        provenance: 'OPERATOR_INPUT',
        required: true,
      },
      {
        key: 'tempat_tujuan',
        label: 'Instansi / Lokasi Tujuan',
        controlType: 'text',
        provenance: 'OPERATOR_INPUT',
        required: true,
        placeholder: 'Misal: Kantor Kementerian Agama Kabupaten',
      },
      DEFAULT_KOP_CONTROL,
    ],
  }),

  'SYS-TPL-03': () => ({
    supportsAttachmentNotice: false,
    controls: [
      {
        key: 'schedule_version_id',
        label: 'Versi Jadwal Resmi Terbit (ScheduleVersion)',
        controlType: 'schedule_version',
        provenance: 'OPERATOR_INPUT',
        required: true,
        sourceHint: 'Riwayat Jadwal Terbit Terverifikasi (History)',
        helperText:
          'Wajib memilih ScheduleVersion terbit dengan fingerprint tervalidasi. Draft kerja, activeSchedule tanpa versi, dan Rencana Kebutuhan JP ditolak sebagai dasar SK.',
      },
      {
        key: 'daftar_beban_jp',
        label: 'Lampiran Rekap Beban JP per Guru (Snapshot ScheduleVersion)',
        controlType: 'auto_system',
        provenance: 'AUTO_SYSTEM',
        required: true,
        autoSourceKey: 'schedule_workload',
        sourceHint: 'ScheduleVersion Terpilih',
      },
      {
        key: 'tanggal_penetapan',
        label: 'Tanggal Penetapan SK',
        controlType: 'date',
        provenance: 'OPERATOR_INPUT',
        required: true,
      },
      {
        key: 'dasar_hukum',
        label: 'Rujukan Regulasi & Rapat Dewan Guru (Opsional)',
        controlType: 'textarea',
        provenance: 'OPERATOR_INPUT',
        required: false,
        placeholder: 'Contoh: Hasil Rapat Pembagian Tugas Dewan Guru tanggal ... dan PMA/KMA terkait.',
      },
      DEFAULT_KOP_CONTROL,
    ],
  }),

  'SYS-TPL-04': () => ({
    supportsAttachmentNotice: false,
    controls: [
      {
        key: 'daftar_penugasan',
        label: 'Guru Penerima Tugas Tambahan',
        controlType: 'teacher_multi_select',
        provenance: 'OPERATOR_INPUT',
        required: true,
        minItems: 1,
        sourceHint: 'Data Master Guru Aktif / TeacherAssignment',
        helperText: 'Pilih guru aktif yang ditetapkan dalam SK Tugas Tambahan (Wali Kelas, Pembina, Koordinator).',
      },
      {
        key: 'tmt_berlaku',
        label: 'Terhitung Mulai Tanggal (TMT) Berlaku',
        controlType: 'date',
        provenance: 'OPERATOR_INPUT',
        required: true,
      },
      {
        key: 'tanggal_penetapan',
        label: 'Tanggal Penetapan SK',
        controlType: 'date',
        provenance: 'OPERATOR_INPUT',
        required: true,
      },
      {
        key: 'catatan_khusus',
        label: 'Rincian Tugas Tambahan per Guru (Opsional)',
        controlType: 'textarea',
        provenance: 'OPERATOR_INPUT',
        required: false,
        placeholder: 'Misal: Wali Kelas VII-A, Pembina OSIS, Kepala Perpustakaan.',
      },
      DEFAULT_KOP_CONTROL,
    ],
  }),

  'SYS-TPL-05': () => ({
    supportsAttachmentNotice: false,
    controls: [
      {
        key: 'nama_kepanitiaan',
        label: 'Nama Kegiatan Kepanitiaan',
        controlType: 'text',
        provenance: 'OPERATOR_INPUT',
        required: true,
        placeholder: 'Misal: Panitia Asesmen Sumatif Akhir Semester Ganjil',
      },
      {
        key: 'susunan_panitia',
        label: 'Personel Panitia (Dari Master Guru)',
        controlType: 'teacher_multi_select',
        provenance: 'OPERATOR_INPUT',
        required: true,
        minItems: 1,
        sourceHint: 'Data Master Guru Aktif',
      },
      {
        key: 'masa_kerja',
        label: 'Masa Berlaku Kepanitiaan',
        controlType: 'text',
        provenance: 'OPERATOR_INPUT',
        required: true,
        placeholder: 'Misal: 1 November s.d. 20 Desember 2026',
      },
      {
        key: 'catatan_khusus',
        label: 'Rincian Jabatan Kepanitiaan (Opsional)',
        controlType: 'textarea',
        provenance: 'OPERATOR_INPUT',
        required: false,
        placeholder: 'Catatan pembagian Ketua, Sekretaris, Bendahara, dan Seksi untuk disusun di Document Studio.',
      },
      DEFAULT_KOP_CONTROL,
    ],
  }),

  'SYS-TPL-06': () => ({
    supportsAttachmentNotice: false,
    controls: [
      {
        key: 'jenis_ujian',
        label: 'Nama Ujian / Asesmen',
        controlType: 'text',
        provenance: 'OPERATOR_INPUT',
        required: true,
        placeholder: 'Misal: Asesmen Sumatif Akhir Semester (ASAS) Ganjil',
      },
      {
        key: 'periode_ujian',
        label: 'Rentang Tanggal Ujian',
        controlType: 'date_range',
        provenance: 'OPERATOR_INPUT',
        required: true,
        startKey: 'periode_ujian_mulai',
        endKey: 'periode_ujian_selesai',
        startLabel: 'Tanggal Mulai Ujian',
        endLabel: 'Tanggal Selesai Ujian',
      },
      {
        key: 'daftar_pengawas',
        label: 'Daftar Pengawas / Panitia Ujian',
        controlType: 'teacher_multi_select',
        provenance: 'OPERATOR_INPUT',
        required: true,
        minItems: 1,
        sourceHint: 'Data Master Guru Aktif',
      },
      DEFAULT_KOP_CONTROL,
    ],
  }),

  'SYS-TPL-08': () => ({
    supportsAttachmentNotice: true,
    attachmentNoticeText:
      'Lampiran dokumen pendukung menggunakan penyimpanan Blob IndexedDB tahap berikutnya; cantumkan daftar lampiran pada isi pokok bila ada.',
    controls: [
      {
        key: 'instansi_tujuan',
        label: 'Tujuan Instansi / Pejabat Penerima',
        controlType: 'text',
        provenance: 'OPERATOR_INPUT',
        required: true,
        placeholder: 'Misal: Kepala Kantor Kemenag Kabupaten Malang',
      },
      {
        key: 'sifat_surat',
        label: 'Sifat Surat',
        controlType: 'select',
        provenance: 'OPERATOR_INPUT',
        required: false,
        options: [
          { value: 'Biasa', label: 'Biasa' },
          { value: 'Penting', label: 'Penting' },
          { value: 'Segera', label: 'Segera' },
          { value: 'Rahasia', label: 'Rahasia' },
        ],
      },
      {
        key: 'perihal',
        label: 'Perihal Surat',
        controlType: 'text',
        provenance: 'OPERATOR_INPUT',
        required: true,
      },
      {
        key: 'isi_pokok',
        label: 'Isi Pokok Korespondensi',
        controlType: 'textarea',
        provenance: 'OPERATOR_INPUT',
        required: true,
      },
      DEFAULT_KOP_CONTROL,
    ],
  }),

  'SYS-TPL-11': () => ({
    supportsAttachmentNotice: false,
    controls: [
      {
        key: 'teacher_id',
        label: 'Pendidik Bersangkutan',
        controlType: 'teacher_single_select',
        provenance: 'OPERATOR_INPUT',
        required: true,
        sourceHint: 'Data Master Guru Aktif',
      },
      {
        key: 'schedule_version_id',
        label: 'Rujukan ScheduleVersion Beban Mengajar (Opsional)',
        controlType: 'schedule_version',
        provenance: 'OPERATOR_INPUT',
        required: false,
        sourceHint: 'Riwayat Jadwal Terbit Resmi',
      },
      {
        key: 'tmt_mengajar',
        label: 'Terhitung Mulai Tanggal (TMT) Mengajar',
        controlType: 'date',
        provenance: 'OPERATOR_INPUT',
        required: true,
      },
      {
        key: 'keperluan',
        label: 'Keperluan Surat Keterangan (Opsional)',
        controlType: 'text',
        provenance: 'OPERATOR_INPUT',
        required: false,
        placeholder: 'Misal: Persyaratan administrasi Tunjangan Profesi Guru / Sympatika',
      },
      DEFAULT_KOP_CONTROL,
    ],
  }),

  'SYS-TPL-12': () => ({
    supportsAttachmentNotice: false,
    controls: [
      {
        key: 'teacher_id',
        label: 'Pendidik Bersangkutan',
        controlType: 'teacher_single_select',
        provenance: 'OPERATOR_INPUT',
        required: true,
        sourceHint: 'Data Master Guru Aktif',
      },
      {
        key: 'uraian_tugas',
        label: 'Rincian Tugas Tambahan / Jabatan',
        controlType: 'textarea',
        provenance: 'OPERATOR_INPUT',
        required: true,
      },
      {
        key: 'nomor_sk_rujukan',
        label: 'Nomor SK Rujukan (Opsional)',
        controlType: 'text',
        provenance: 'OPERATOR_INPUT',
        required: false,
      },
      {
        key: 'schedule_version_id',
        label: 'Rujukan ScheduleVersion Terbit (Opsional)',
        controlType: 'schedule_version',
        provenance: 'OPERATOR_INPUT',
        required: false,
      },
      DEFAULT_KOP_CONTROL,
    ],
  }),

  'SYS-TPL-14': () => ({
    supportsAttachmentNotice: false,
    controls: [
      {
        key: 'nama_siswa',
        label: 'Nama Lengkap Peserta Didik',
        controlType: 'text',
        provenance: 'OPERATOR_INPUT',
        required: true,
      },
      {
        key: 'nisn',
        label: 'NIS / NISN',
        controlType: 'text',
        provenance: 'OPERATOR_INPUT',
        required: true,
      },
      {
        key: 'ttl_siswa',
        label: 'Tempat, Tanggal Lahir',
        controlType: 'text',
        provenance: 'OPERATOR_INPUT',
        required: true,
        placeholder: 'Misal: Malang, 12 Mei 2012',
      },
      {
        key: 'kelas_id',
        label: 'Kelas / Rombel Saat Ini',
        controlType: 'class_single_select',
        provenance: 'OPERATOR_INPUT',
        required: true,
        sourceHint: 'Data Master Kelas',
      },
      {
        key: 'keperluan',
        label: 'Keperluan Surat Keterangan',
        controlType: 'text',
        provenance: 'OPERATOR_INPUT',
        required: true,
      },
      DEFAULT_KOP_CONTROL,
    ],
  }),

  'SYS-TPL-16': () => ({
    supportsAttachmentNotice: false,
    controls: [
      {
        key: 'pihak_pertama',
        label: 'Pihak Pertama (Yang Menyerahkan)',
        controlType: 'text',
        provenance: 'OPERATOR_INPUT',
        required: true,
      },
      {
        key: 'pihak_kedua',
        label: 'Pihak Kedua (Yang Menerima)',
        controlType: 'text',
        provenance: 'OPERATOR_INPUT',
        required: true,
      },
      {
        key: 'objek_serah_terima',
        label: 'Daftar Objek / Berkas / Barang',
        controlType: 'textarea',
        provenance: 'OPERATOR_INPUT',
        required: true,
      },
      {
        key: 'tanggal_ba',
        label: 'Tanggal Pelaksanaan Serah Terima',
        controlType: 'date',
        provenance: 'OPERATOR_INPUT',
        required: true,
      },
      DEFAULT_KOP_CONTROL,
    ],
  }),

  'SYS-TPL-17': () => ({
    supportsAttachmentNotice: false,
    controls: [
      {
        key: 'judul_rapat',
        label: 'Judul Rapat Resmi',
        controlType: 'text',
        provenance: 'OPERATOR_INPUT',
        required: true,
      },
      {
        key: 'waktu_tempat',
        label: 'Tanggal, Jam & Lokasi Rapat',
        controlType: 'text',
        provenance: 'OPERATOR_INPUT',
        required: true,
      },
      {
        key: 'jumlah_peserta',
        label: 'Jumlah Peserta Hadir (Orang)',
        controlType: 'number',
        provenance: 'OPERATOR_INPUT',
        required: true,
      },
      {
        key: 'hasil_keputusan',
        label: 'Butir Keputusan Rapat',
        controlType: 'textarea',
        provenance: 'OPERATOR_INPUT',
        required: true,
      },
      DEFAULT_KOP_CONTROL,
    ],
  }),

  'SYS-TPL-18': () => ({
    supportsAttachmentNotice: false,
    controls: [
      {
        key: 'nama_ujian',
        label: 'Nama Ujian / Asesmen',
        controlType: 'text',
        provenance: 'OPERATOR_INPUT',
        required: true,
      },
      {
        key: 'mapel',
        label: 'Mata Pelajaran',
        controlType: 'subject_single_select',
        provenance: 'OPERATOR_INPUT',
        required: true,
        sourceHint: 'Data Master Mata Pelajaran',
      },
      {
        key: 'ruang_ujian',
        label: 'Ruang / Rombel Ujian',
        controlType: 'text',
        provenance: 'OPERATOR_INPUT',
        required: true,
      },
      {
        key: 'rekap_peserta',
        label: 'Rekap Jumlah Terdaftar / Hadir / Tidak Hadir',
        controlType: 'text',
        provenance: 'OPERATOR_INPUT',
        required: true,
      },
      {
        key: 'kejadian_khusus',
        label: 'Catatan Kejadian Selama Ujian (Opsional)',
        controlType: 'textarea',
        provenance: 'OPERATOR_INPUT',
        required: false,
      },
      DEFAULT_KOP_CONTROL,
    ],
  }),

  'SYS-TPL-21': () => ({
    supportsAttachmentNotice: false,
    controls: [
      {
        key: 'pelaksana',
        label: 'Pegawai Pelaksana Laporan',
        controlType: 'teacher_single_select',
        provenance: 'OPERATOR_INPUT',
        required: true,
        sourceHint: 'Data Master Guru Aktif',
      },
      {
        key: 'nomor_surat_tugas',
        label: 'Nomor Surat Tugas Rujukan',
        controlType: 'text',
        provenance: 'OPERATOR_INPUT',
        required: true,
      },
      {
        key: 'ringkasan_materi',
        label: 'Ringkasan Materi & Rencana Implementasi',
        controlType: 'textarea',
        provenance: 'OPERATOR_INPUT',
        required: true,
      },
      DEFAULT_KOP_CONTROL,
    ],
  }),

  'SYS-TPL-30': () => ({
    supportsAttachmentNotice: false,
    controls: [
      {
        key: 'judul_dokumen',
        label: 'Judul Dokumen',
        controlType: 'text',
        provenance: 'OPERATOR_INPUT',
        required: true,
        placeholder: 'Misal: Lembar Catatan Koordinasi Khusus Madrasah',
      },
      {
        key: 'tampilkan_kop',
        label: 'Sertakan Kop Surat Madrasah',
        controlType: 'select',
        provenance: 'OPERATOR_INPUT',
        required: true,
        options: [
          { value: 'Ya', label: 'Ya — Sertakan Kop Surat Madrasah' },
          { value: 'Tidak', label: 'Tidak — Kanvas Kosong Tanpa Kop' },
        ],
      },
      {
        ...DEFAULT_KOP_CONTROL,
        required: false,
        helperText: 'Kop Surat disertakan otomatis jika opsi "Ya" dipilih di atas.',
      },
    ],
  }),
};

function buildGenericControls(template: DocumentTemplate): IntakeControlDefinition[] {
  const mapped: IntakeControlDefinition[] = [];
  let hasKop = false;

  for (const field of template.fields) {
    if (field.key === 'kop_madrasah') hasKop = true;

    if (field.kind === 'AUTO_SYSTEM') {
      mapped.push({
        key: field.key,
        label: field.label,
        controlType: 'auto_system',
        provenance: 'AUTO_SYSTEM',
        required: field.required,
        sourceHint: field.sourceHint ?? 'Data Otomatis Sistem',
        autoSourceKey: field.key === 'daftar_beban_jp' ? 'schedule_workload' : 'kop_madrasah',
      });
      continue;
    }

    let controlType: IntakeControlDefinition['controlType'] = 'text';
    const lowerKey = field.key.toLowerCase();
    const lowerHint = (field.sourceHint ?? '').toLowerCase();

    if (lowerHint.includes('guru') && (lowerKey.includes('peserta') || lowerKey.includes('daftar') || lowerKey.includes('panitia'))) {
      controlType = 'teacher_multi_select';
    } else if (lowerHint.includes('guru')) {
      controlType = 'teacher_single_select';
    } else if (lowerHint.includes('kelas')) {
      controlType = 'class_single_select';
    } else if (lowerHint.includes('mapel')) {
      controlType = 'subject_single_select';
    } else if (lowerKey.startsWith('tanggal_') && !lowerKey.includes('waktu')) {
      controlType = 'date';
    } else if (
      lowerKey.includes('isi') ||
      lowerKey.includes('agenda') ||
      lowerKey.includes('ringkasan') ||
      lowerKey.includes('rincian') ||
      lowerKey.includes('capaian') ||
      lowerKey.includes('evaluasi') ||
      lowerKey.includes('hasil') ||
      lowerKey.includes('daftar_berkas') ||
      lowerKey.includes('dasar_pertimbangan') ||
      lowerKey.includes('ruang_lingkup')
    ) {
      controlType = 'textarea';
    }

    mapped.push({
      key: field.key,
      label: field.label,
      controlType,
      provenance: 'OPERATOR_INPUT',
      required: field.required,
      sourceHint: field.sourceHint,
    });
  }

  if (!hasKop && template.documentHeader.includeKopSurat) {
    mapped.push(DEFAULT_KOP_CONTROL);
  }

  return mapped;
}

export function getIntakeSchemaForTemplate(template: DocumentTemplate): IntakeTemplateSchema {
  const baseTemplateId = resolveBaseTemplateId(template);
  const overrideBuilder = SYSTEM_SCHEMA_OVERRIDES[baseTemplateId];
  if (overrideBuilder) {
    const built = overrideBuilder(template);
    return {
      baseTemplateId,
      templateId: template.id,
      templateName: template.name,
      ...built,
    };
  }

  return {
    baseTemplateId,
    templateId: template.id,
    templateName: template.name,
    supportsAttachmentNotice: false,
    controls: buildGenericControls(template),
  };
}

export function resolveSystemAutoData(state: AppState): ResolvedSystemAutoData {
  const s = state.settings;
  const schoolName = (s.schoolName ?? '').trim();
  const ministry = (s.ministry ?? '').trim();
  const regionalOffice = (s.regionalOffice ?? '').trim();
  const address = (s.address ?? '').trim();
  const city = (s.city ?? '').trim();
  const signatoryTitle = (s.headmasterTitle ?? '').trim() || 'Kepala Madrasah';
  const signatoryName = (s.headmasterName ?? '').trim();
  const signatoryNip = (s.headmasterNip ?? '').trim();

  const hasSchoolIdentity = schoolName.length > 0;
  const hasSignatory = signatoryName.length > 0;
  const isDemoData = state.dataMode === 'demo';

  const kop: ResolvedKopSystemData = {
    schoolName,
    ministry,
    regionalOffice,
    address,
    city,
    academicYear: (s.academicYear ?? '').trim(),
    semester: s.semester,
    signatoryTitle,
    signatoryName,
    signatoryNip,
    hasSchoolIdentity,
    hasSignatory,
    isComplete: hasSchoolIdentity && hasSignatory,
    isDemoData,
  };

  const publishedAll = getPublishedScheduleVersions(state);
  const verifiedScheduleVersions: ResolvedScheduleVersionSummary[] = [];
  let invalidScheduleVersionCount = 0;

  for (const item of publishedAll) {
    if (!item.isValidForOfficialUse) {
      invalidScheduleVersionCount += 1;
      continue;
    }
    const workloadStats = aggregateTeacherWorkloadFromEntries(
      state.teachers,
      item.version.entries,
      state.settings.activeDays,
      state.settings.periodMinutes || 40
    );
    verifiedScheduleVersions.push({
      id: item.version.id,
      versionNumber: item.version.version,
      label: item.version.label,
      createdAt: item.version.createdAt,
      academicYearText: item.metadata.academicYearText,
      semesterText: item.metadata.semesterText,
      fingerprint: item.version.fingerprint,
      entryCount: item.metadata.actualEntryLength,
      isValidForOfficialUse: true,
      teacherWorkloads: workloadStats
        .filter((w) => w.totalJP > 0)
        .map((w) => ({
          teacherId: w.teacher.id,
          teacherName: w.teacher.name,
          totalJP: w.totalJP,
          classesCount: w.classesTaught.length,
        })),
    });
  }

  const activeTeachersCount = state.teachers.filter((t) => t.isActive).length;
  const inactiveTeachersCount = state.teachers.filter((t) => !t.isActive).length;
  const activeAssignmentsCount = (state.teacherAssignments ?? []).filter(
    (a) => a.status === 'ACTIVE'
  ).length;

  return {
    kop,
    verifiedScheduleVersions,
    invalidScheduleVersionCount,
    hasLooseActiveScheduleWithoutVersion:
      verifiedScheduleVersions.length === 0 &&
      Array.isArray(state.activeSchedule) &&
      state.activeSchedule.length > 0,
    hasUnpublishedDraft: Array.isArray(state.draft) && state.draft.length > 0,
    activeTeachersCount,
    inactiveTeachersCount,
    activeAssignmentsCount,
    isDemoData,
  };
}

export function getControlDomId(key: string): string {
  return `s03-field-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

export function validateIntakeForm(
  template: DocumentTemplate,
  values: IntakeFormValues,
  state: AppState
): IntakeValidationResult {
  const schema = getIntakeSchemaForTemplate(template);
  const autoData = resolveSystemAutoData(state);
  const errors: IntakeValidationError[] = [];
  const fieldErrors: Record<string, string> = {};

  const pushError = (fieldKey: string, label: string, message: string, domKey?: string) => {
    if (!fieldErrors[fieldKey]) {
      fieldErrors[fieldKey] = message;
      errors.push({
        fieldKey,
        fieldId: getControlDomId(domKey ?? fieldKey),
        label,
        message,
      });
    }
  };

  if (values.documentDate !== undefined && String(values.documentDate).trim() !== '') {
    const docDateStr = String(values.documentDate).trim();
    if (!isValidIsoDate(docDateStr)) {
      pushError(
        'documentDate',
        'Tanggal Dokumen',
        'Tanggal dokumen harus berupa tanggal kalender yang valid (format YYYY-MM-DD).'
      );
    }
  }

  const teacherById = new Map(state.teachers.map((t) => [t.id, t]));
  const verifiedVersionIds = new Set(autoData.verifiedScheduleVersions.map((v) => v.id));

  for (const ctrl of schema.controls) {
    if (ctrl.controlType === 'date_range') {
      const startKey = ctrl.startKey ?? `${ctrl.key}_mulai`;
      const endKey = ctrl.endKey ?? `${ctrl.key}_selesai`;
      const startVal = typeof values[startKey] === 'string' ? values[startKey].trim() : '';
      const endVal = typeof values[endKey] === 'string' ? values[endKey].trim() : '';

      if (ctrl.required && !startVal) {
        pushError(
          ctrl.key,
          ctrl.label,
          `${ctrl.startLabel ?? 'Tanggal mulai'} wajib diisi.`,
          startKey
        );
        continue;
      }
      if (ctrl.required && !endVal) {
        pushError(
          ctrl.key,
          ctrl.label,
          `${ctrl.endLabel ?? 'Tanggal selesai'} wajib diisi.`,
          endKey
        );
        continue;
      }
      if (startVal && !isValidIsoDate(startVal)) {
        pushError(
          ctrl.key,
          ctrl.label,
          `${ctrl.startLabel ?? 'Tanggal mulai'} bukan tanggal kalender yang valid.`,
          startKey
        );
        continue;
      }
      if (endVal && !isValidIsoDate(endVal)) {
        pushError(
          ctrl.key,
          ctrl.label,
          `${ctrl.endLabel ?? 'Tanggal selesai'} bukan tanggal kalender yang valid.`,
          endKey
        );
        continue;
      }
      if (startVal && endVal && endVal < startVal) {
        pushError(
          ctrl.key,
          ctrl.label,
          'Tanggal selesai tidak boleh lebih awal dari tanggal mulai.',
          endKey
        );
      }
      continue;
    }

    if (ctrl.controlType === 'teacher_multi_select') {
      const rawArr = Array.isArray(values[ctrl.key]) ? (values[ctrl.key] as unknown[]) : [];
      const ids = rawArr.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
      const uniqueIds = Array.from(new Set(ids));

      if (ctrl.required && uniqueIds.length < (ctrl.minItems ?? 1)) {
        pushError(
          ctrl.key,
          ctrl.label,
          autoData.activeTeachersCount === 0
            ? 'Belum ada guru aktif di Data Master. Tambahkan guru aktif terlebih dahulu sebelum membuat dokumen ini.'
            : `Pilih minimal ${ctrl.minItems ?? 1} peserta dari Data Master Guru aktif.`
        );
        continue;
      }

      const invalidTeacher = uniqueIds.find((id) => {
        const found = teacherById.get(id);
        return !found || !found.isActive;
      });
      if (invalidTeacher) {
        const found = teacherById.get(invalidTeacher);
        pushError(
          ctrl.key,
          ctrl.label,
          found
            ? `Guru "${found.name}" berstatus nonaktif dan tidak dapat dipilih untuk penugasan baru.`
            : 'Terdapat ID guru yang tidak ditemukan di Data Master Guru.'
        );
      }
      continue;
    }

    if (ctrl.controlType === 'teacher_single_select') {
      const rawVal = values[ctrl.key];
      const val = typeof rawVal === 'string' ? rawVal.trim() : '';
      if (ctrl.required && !val) {
        pushError(ctrl.key, ctrl.label, `${ctrl.label} wajib dipilih dari Data Master Guru aktif.`);
        continue;
      }
      if (val) {
        const found = teacherById.get(val);
        if (!found || !found.isActive) {
          pushError(
            ctrl.key,
            ctrl.label,
            found
              ? `Guru "${found.name}" berstatus nonaktif dan tidak dapat dipilih.`
              : 'Pendidik yang dipilih tidak ditemukan di Data Master Guru.'
          );
        }
      }
      continue;
    }

    if (ctrl.controlType === 'schedule_version') {
      const rawVal = values[ctrl.key];
      const val = typeof rawVal === 'string' ? rawVal.trim() : '';
      if (ctrl.required && !val) {
        pushError(
          ctrl.key,
          ctrl.label,
          autoData.verifiedScheduleVersions.length === 0
            ? 'Belum ada ScheduleVersion terbit yang sah. Publikasikan jadwal resmi terlebih dahulu sebelum membuat SK Pembagian Tugas Mengajar.'
            : 'Pilih salah satu ScheduleVersion resmi terverifikasi sebagai dasar beban mengajar SK.'
        );
        continue;
      }
      if (val && !verifiedVersionIds.has(val)) {
        pushError(
          ctrl.key,
          ctrl.label,
          'Versi jadwal yang dipilih tidak sah, rusak/fingerprint gagal, atau berasal dari draft non-resmi.'
        );
      }
      continue;
    }

    if (ctrl.controlType === 'auto_system') {
      if (ctrl.autoSourceKey === 'kop_madrasah') {
        const kopRequired =
          schema.baseTemplateId === 'SYS-TPL-30'
            ? values.tampilkan_kop !== 'Tidak'
            : ctrl.required;
        if (kopRequired && !autoData.kop.isComplete) {
          const missingParts: string[] = [];
          if (!autoData.kop.hasSchoolIdentity) missingParts.push('Nama Madrasah');
          if (!autoData.kop.hasSignatory) missingParts.push('Nama Pejabat Penandatangan / Kepala Madrasah');
          pushError(
            ctrl.key,
            ctrl.label,
            `Data sistem belum lengkap (${missingParts.join(' & ')} masih kosong). Lengkapi di menu Pengaturan agar Kop & Penandatangan tersedia tanpa fabrikasi.`
          );
        }
      } else if (ctrl.autoSourceKey === 'schedule_workload' && ctrl.required) {
        const verId =
          typeof values.schedule_version_id === 'string' ? values.schedule_version_id.trim() : '';
        const foundVer = autoData.verifiedScheduleVersions.find((v) => v.id === verId);
        if (!foundVer || foundVer.entryCount === 0) {
          pushError(
            ctrl.key,
            ctrl.label,
            'Rekap beban JP otomatis memerlukan ScheduleVersion terverifikasi yang valid.'
          );
        }
      }
      continue;
    }

    if (ctrl.controlType === 'date') {
      const rawVal = values[ctrl.key];
      const val = typeof rawVal === 'string' ? rawVal.trim() : '';
      if (ctrl.required && !val) {
        pushError(ctrl.key, ctrl.label, `${ctrl.label} wajib diisi.`);
      } else if (val && !isValidIsoDate(val)) {
        pushError(ctrl.key, ctrl.label, `${ctrl.label} bukan tanggal kalender yang valid.`);
      }
      continue;
    }

    if (ctrl.controlType === 'number') {
      const raw = values[ctrl.key];
      const strVal = raw === undefined || raw === null ? '' : String(raw).trim();
      if (ctrl.required && !strVal) {
        pushError(ctrl.key, ctrl.label, `${ctrl.label} wajib diisi.`);
      } else if (strVal && (!Number.isFinite(Number(strVal)) || Number(strVal) <= 0)) {
        pushError(ctrl.key, ctrl.label, `${ctrl.label} harus berupa angka positif.`);
      }
      continue;
    }

    const rawTextVal = values[ctrl.key];
    const textVal = typeof rawTextVal === 'string' ? rawTextVal.trim() : '';
    if (ctrl.required && !textVal) {
      pushError(ctrl.key, ctrl.label, `${ctrl.label} wajib diisi.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    fieldErrors,
    resolvedAutoData: autoData,
  };
}
