import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from '../src/App';
import { CorrespondenceCenter } from '../src/components/persuratan/CorrespondenceCenter';
import { DocumentIntakeForm } from '../src/components/persuratan/DocumentIntakeForm';
import { PersuratanWorkspace } from '../src/components/persuratan/PersuratanWorkspace';
import {
  createInitialIntakeFormValues,
  saveIntakeDraftToState,
} from '../src/domain/persuratan/intake/draftEngine';
import {
  getIntakeSchemaForTemplate,
  resolveSystemAutoData,
  validateIntakeForm,
} from '../src/domain/persuratan/intake/schemaRegistry';
import { SYSTEM_DOCUMENT_TEMPLATES } from '../src/domain/persuratan/templates/registry';
import { cloneTemplateToMadrasah } from '../src/domain/persuratan/templates/selectors';
import { createDemoState, createEmptyState } from '../src/domain/seed';
import type { AppState } from '../src/domain/types';
import { computeCanonicalSha256 } from '../src/storage/checksum';
import {
  buildBackupEnvelope,
  migrateAppStateSchema,
  parseBackupContent,
  validateAppStateStructure,
} from '../src/storage/db';
import { buildSignalContainer, parseSignalContent } from '../src/storage/snapshotEngine';

describe('Tahap 4 — Form Data Awal / Context Form (S03)', () => {
  it('1. Semua 30 template SYSTEM dan salinan MADRASAH memiliki skema S03 valid tanpa crash', () => {
    expect(SYSTEM_DOCUMENT_TEMPLATES).toHaveLength(30);
    for (const tpl of SYSTEM_DOCUMENT_TEMPLATES) {
      const schema = getIntakeSchemaForTemplate(tpl);
      expect(schema.templateId).toBe(tpl.id);
      expect(schema.controls.length).toBeGreaterThan(0);
    }

    const cloned = cloneTemplateToMadrasah(
      SYSTEM_DOCUMENT_TEMPLATES[0],
      'Surat Tugas Bimtek Custom Madrasah',
      [],
      '2026-11-16T08:00:00Z'
    );
    const clonedSchema = getIntakeSchemaForTemplate(cloned);
    expect(clonedSchema.baseTemplateId).toBe('SYS-TPL-01');
    expect(clonedSchema.controls.some((c) => c.controlType === 'teacher_multi_select')).toBe(true);
  });

  it('2. Validasi SYS-TPL-01: menolak field wajib kosong, tanggal akhir < mulai, & tanggal kalender invalid', () => {
    const state = createDemoState();
    const tpl01 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-01')!;
    const schema01 = getIntakeSchemaForTemplate(tpl01);
    expect(schema01.supportsAttachmentNotice).toBe(true);

    // Kosong semua -> wajib gagal
    const emptyRes = validateIntakeForm(tpl01, {}, state);
    expect(emptyRes.valid).toBe(false);
    expect(emptyRes.fieldErrors.peserta).toBeTruthy();
    expect(emptyRes.fieldErrors.nama_kegiatan).toBeTruthy();
    expect(emptyRes.fieldErrors.penyelenggara).toBeTruthy();
    expect(emptyRes.fieldErrors.tanggal_mulai).toBeTruthy();
    expect(emptyRes.fieldErrors.lokasi).toBeTruthy();
    expect(() => saveIntakeDraftToState(state, tpl01, {})).toThrow();

    // Tanggal selesai lebih awal dari tanggal mulai -> gagal
    const reversedRes = validateIntakeForm(
      tpl01,
      {
        peserta: [state.teachers[0].id],
        nama_kegiatan: 'Bimtek Kurikulum',
        penyelenggara: 'Kankemenag Kab. Malang',
        tanggal_mulai: '2026-11-25',
        tanggal_selesai: '2026-11-20',
        lokasi: 'Aula Kemenag',
      },
      state
    );
    expect(reversedRes.valid).toBe(false);
    expect(reversedRes.fieldErrors.tanggal_mulai).toMatch(/lebih awal/i);

    // Tanggal kalender invalid (Feb 30) -> gagal
    const invalidCalRes = validateIntakeForm(
      tpl01,
      {
        peserta: [state.teachers[0].id],
        nama_kegiatan: 'Bimtek Kurikulum',
        penyelenggara: 'Kankemenag Kab. Malang',
        tanggal_mulai: '2026-02-30',
        tanggal_selesai: '2026-03-02',
        lokasi: 'Aula Kemenag',
      },
      state
    );
    expect(invalidCalRes.valid).toBe(false);
    expect(invalidCalRes.fieldErrors.tanggal_mulai).toMatch(/valid/i);
  });

  it('3. Pemilih peserta hanya menampilkan guru aktif, menolak guru nonaktif, dan TIDAK mengekspos NIP di picker/summary', () => {
    const state = createDemoState();
    const activeTeacher = state.teachers[0];
    const inactiveTeacher = state.teachers[1];
    inactiveTeacher.isActive = false;

    const tpl01 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-01')!;

    // Inject inactive teacher -> ditolak validasi
    const invalidInactive = validateIntakeForm(
      tpl01,
      {
        peserta: [inactiveTeacher.id],
        nama_kegiatan: 'Workshop Pembelajaran',
        penyelenggara: 'Balai Diklat',
        tanggal_mulai: '2026-11-20',
        tanggal_selesai: '2026-11-21',
        lokasi: 'Surabaya',
      },
      state
    );
    expect(invalidInactive.valid).toBe(false);
    expect(invalidInactive.fieldErrors.peserta).toMatch(/nonaktif/i);

    // Render UI -> guru aktif muncul, guru nonaktif TIDAK muncul di opsi picker, NIP peserta TIDAK muncul
    const html = renderToStaticMarkup(
      createElement(DocumentIntakeForm, {
        state,
        template: tpl01,
        onSaveDraft: () => {},
        onBackToTemplates: () => {},
        onOpenCenter: () => {},
      })
    );
    expect(html).toContain(activeTeacher.name);
    expect(html).not.toContain(inactiveTeacher.name);
    expect(html).not.toContain(activeTeacher.nip!);
    expect(html).not.toContain(inactiveTeacher.nip!);
  });

  it('4. Template korespondensi eksternal (SYS-TPL-08/23/28) menggunakan input penerima teks tanpa memaksa multi-select guru', () => {
    const state = createDemoState();
    const tpl08 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-08')!;
    const schema08 = getIntakeSchemaForTemplate(tpl08);
    expect(schema08.controls.some((c) => c.controlType === 'teacher_multi_select')).toBe(false);

    const saved = saveIntakeDraftToState(
      state,
      tpl08,
      {
        instansi_tujuan: 'Kepala Kantor Kementerian Agama Kab. Malang',
        sifat_surat: 'Penting',
        perihal: 'Penyampaian Laporan Bulanan Madrasah',
        isi_pokok: 'Dengan hormat, kami sampaikan laporan operasional bulan berjalan.',
        documentDate: '2026-11-16',
      },
      { timestamp: '2026-11-16T10:00:00Z' }
    );
    expect(saved.documentRecord.counterpartName).toBe(
      'Kepala Kantor Kementerian Agama Kab. Malang'
    );
    expect(saved.draft.relatedTeacherIds).toEqual([]);
  });

  it('5. Sistem tidak pernah memfabrikasi identitas/penandatangan kosong; SYS-TPL-30 tetap bisa memilih Tanpa Kop', () => {
    const blankIdentityState = createEmptyState();
    blankIdentityState.settings.schoolName = '';
    blankIdentityState.settings.headmasterName = '';
    blankIdentityState.settings.headmasterNip = '';

    const tpl01 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-01')!;
    const check01 = validateIntakeForm(tpl01, {}, blankIdentityState);
    expect(check01.valid).toBe(false);
    expect(check01.fieldErrors.kop_madrasah).toMatch(/belum lengkap/i);

    const html01 = renderToStaticMarkup(
      createElement(DocumentIntakeForm, {
        state: blankIdentityState,
        template: tpl01,
        onSaveDraft: () => {},
        onBackToTemplates: () => {},
        onOpenCenter: () => {},
      })
    );
    expect(html01).toContain('Belum tersedia');
    expect(html01).toContain('Belum ada guru aktif pada Data Master');

    // SYS-TPL-30 dengan tampilkan_kop = 'Tidak' boleh disimpan walau kop belum lengkap
    const tpl30 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-30')!;
    const savedFree = saveIntakeDraftToState(
      blankIdentityState,
      tpl30,
      {
        judul_dokumen: 'Catatan Internal Sementara',
        tampilkan_kop: 'Tidak',
        documentDate: '2026-11-16',
      },
      { timestamp: '2026-11-16T10:05:00Z' }
    );
    expect(savedFree.draft.title).toContain('Catatan Internal Sementara');
  });

  it('6. SYS-TPL-03 (SK Pembagian Tugas) mengikat ScheduleVersion resmi terverifikasi dan menolak draft/activeSchedule polos/versi rusak', () => {
    const demo = createDemoState();
    const tpl03 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-03')!;

    // A. Valid published ScheduleVersion -> sukses + snapshot beban JP tersimpan
    const initValues = createInitialIntakeFormValues(tpl03, demo);
    expect(initValues.schedule_version_id).toBe('VER-DEMO-01');
    const saved = saveIntakeDraftToState(
      demo,
      tpl03,
      {
        ...initValues,
        tanggal_penetapan: '2026-11-16',
        documentDate: '2026-11-16',
      },
      { timestamp: '2026-11-16T10:10:00Z' }
    );
    expect(saved.draft.scheduleVersionId).toBe('VER-DEMO-01');
    expect(saved.draft.scheduleVersionFingerprint).toBe(demo.history[0].fingerprint);
    expect(
      saved.sourceSnapshots.some((s) => s.sourceKey === 'history.schedule_version' && s.status === 'VERIFIED')
    ).toBe(true);

    // B. Tanpa history ScheduleVersion walau ada activeSchedule & draft -> DITOLAK
    const noHistoryState: AppState = {
      ...demo,
      history: [],
      draft: demo.activeSchedule,
    };
    const autoNoHistory = resolveSystemAutoData(noHistoryState);
    expect(autoNoHistory.verifiedScheduleVersions).toHaveLength(0);
    expect(autoNoHistory.hasLooseActiveScheduleWithoutVersion).toBe(true);
    const rejectedNoHistory = validateIntakeForm(
      tpl03,
      { schedule_version_id: 'DRAFT-LOCAL', tanggal_penetapan: '2026-11-16' },
      noHistoryState
    );
    expect(rejectedNoHistory.valid).toBe(false);
    expect(rejectedNoHistory.fieldErrors.schedule_version_id).toBeTruthy();

    // C. ScheduleVersion dengan fingerprint korup -> DITOLAK
    const tamperedHistoryState: AppState = {
      ...demo,
      history: [{ ...demo.history[0], fingerprint: 'TAMPERED-FP-000' }],
    };
    const autoTampered = resolveSystemAutoData(tamperedHistoryState);
    expect(autoTampered.verifiedScheduleVersions).toHaveLength(0);
    expect(autoTampered.invalidScheduleVersionCount).toBe(1);
    const rejectedTampered = validateIntakeForm(
      tpl03,
      { schedule_version_id: 'VER-DEMO-01', tanggal_penetapan: '2026-11-16' },
      tamperedHistoryState
    );
    expect(rejectedTampered.valid).toBe(false);
  });

  it('7. Snapshot sumber & template dibekukan tanpa live-binding terhadap perubahan Data Master/Pengaturan berikutnya', () => {
    const state = createDemoState();
    const tpl01 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-01')!;
    const targetTeacher = state.teachers[0];
    const originalTeacherName = targetTeacher.name;
    const originalSchoolName = state.settings.schoolName;

    const saved = saveIntakeDraftToState(
      state,
      tpl01,
      {
        peserta: [targetTeacher.id],
        nama_kegiatan: 'Bimtek Pengelolaan Arsip Digital',
        penyelenggara: 'Kanwil Kemenag Provinsi',
        tanggal_mulai: '2026-11-24',
        tanggal_selesai: '2026-11-25',
        lokasi: 'Malang',
        dasar_surat: 'Undangan No. 77/Kw.13/2026',
        catatan_khusus: 'Membawa laptop',
        documentDate: '2026-11-16',
      },
      { timestamp: '2026-11-16T10:15:00Z' }
    );

    expect(saved.draft.intakeStatus).toBe('READY_FOR_EDITOR');
    expect(saved.documentRecord.status).toBe('DRAFT');
    expect(saved.documentRecord.documentNumber).toBeNull();
    expect(saved.draft.fieldProvenance.nama_kegiatan).toBe('OPERATOR_INPUT');
    expect(saved.draft.fieldProvenance.kop_madrasah).toBe('AUTO_SYSTEM');

    const kopSnapBefore = saved.draft.sourceSnapshots.find(
      (s) => s.sourceKey === 'settings.madrasah_identity_signatory'
    )!;
    expect(kopSnapBefore.isDemoData).toBe(true);
    expect((kopSnapBefore.capturedValue as { schoolName: string }).schoolName).toBe(originalSchoolName);

    // Mutasi state asal SETELAH draft disimpan
    saved.state.teachers[0].name = 'NAMA GURU BERUBAH TOTAL';
    saved.state.settings.schoolName = 'MADRASAH LAIN BERUBAH';

    // Snapshot tersimpan pada draft TIDAK boleh ikut berubah
    const persistedDraft = saved.state.intakeDrafts![0];
    const teacherSnap = persistedDraft.sourceSnapshots.find(
      (s) => s.sourceKey === 'master.teachers.selected'
    )!;
    const kopSnapAfter = persistedDraft.sourceSnapshots.find(
      (s) => s.sourceKey === 'settings.madrasah_identity_signatory'
    )!;

    expect((teacherSnap.capturedValue as Array<{ name: string }>)[0].name).toBe(originalTeacherName);
    expect((kopSnapAfter.capturedValue as { schoolName: string }).schoolName).toBe(originalSchoolName);
  });

  it('8. Upsert berbasis draftId stabil tidak membuat draft/dokumen duplikat saat edit ulang', () => {
    const state = createDemoState();
    const tpl01 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-01')!;

    const firstSave = saveIntakeDraftToState(
      state,
      tpl01,
      {
        peserta: [state.teachers[0].id],
        nama_kegiatan: 'Pelatihan Tahap Awal',
        penyelenggara: 'Kemenag',
        tanggal_mulai: '2026-11-20',
        tanggal_selesai: '2026-11-21',
        lokasi: 'Aula Utama',
        documentDate: '2026-11-16',
      },
      { timestamp: '2026-11-16T10:20:00Z' }
    );
    expect(firstSave.isUpdate).toBe(false);
    expect(firstSave.state.intakeDrafts).toHaveLength(1);
    expect(firstSave.state.documents).toHaveLength(1);

    const secondSave = saveIntakeDraftToState(
      firstSave.state,
      tpl01,
      {
        peserta: [state.teachers[0].id, state.teachers[1].id],
        nama_kegiatan: 'Pelatihan Tahap Awal (Direvisi)',
        penyelenggara: 'Kemenag Provinsi',
        tanggal_mulai: '2026-11-20',
        tanggal_selesai: '2026-11-22',
        lokasi: 'Aula Provinsi',
        documentDate: '2026-11-16',
      },
      {
        existingDraftId: firstSave.draft.id,
        existingDocumentId: firstSave.documentRecord.id,
        timestamp: '2026-11-16T10:25:00Z',
      }
    );

    expect(secondSave.isUpdate).toBe(true);
    expect(secondSave.state.intakeDrafts).toHaveLength(1);
    expect(secondSave.state.documents).toHaveLength(1);
    expect(secondSave.draft.id).toBe(firstSave.draft.id);
    expect(secondSave.documentRecord.id).toBe(firstSave.documentRecord.id);
    expect(secondSave.documentRecord.relatedTeacherIds).toHaveLength(2);
    expect(secondSave.documentRecord.title).toContain('Direvisi');
  });

  it('9. Backup JSON & .signal ber-SHA-256 mempertahankan intakeDrafts, menolak tampering, dan migrasi backup lama tetap valid', async () => {
    const state = createDemoState();
    const tpl01 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-01')!;
    const { state: withDraft } = saveIntakeDraftToState(
      state,
      tpl01,
      {
        peserta: [state.teachers[2].id],
        nama_kegiatan: 'Workshop Sains Madrasah',
        penyelenggara: 'MGMP IPA',
        tanggal_mulai: '2026-12-01',
        tanggal_selesai: '2026-12-02',
        lokasi: 'Lab Terpadu',
        documentDate: '2026-11-16',
      },
      { timestamp: '2026-11-16T10:30:00Z' }
    );

    // Backup JSON round-trip
    const backup = await buildBackupEnvelope(withDraft);
    const parsedBackup = await parseBackupContent(JSON.stringify(backup));
    expect(parsedBackup.verification).toBe('verified');
    expect(parsedBackup.state.intakeDrafts).toEqual(withDraft.intakeDrafts);
    expect(parsedBackup.state.documents).toEqual(withDraft.documents);

    // Tamper 1 karakter di intakeDrafts -> wajib ditolak SHA-256
    const tamperedBackup = JSON.parse(JSON.stringify(backup));
    tamperedBackup.payload.intakeDrafts[0].title += '!';
    await expect(parseBackupContent(JSON.stringify(tamperedBackup))).rejects.toThrow(/SHA-256/i);

    // .signal SEAL round-trip
    const seal = await buildSignalContainer(withDraft, []);
    const parsedSeal = await parseSignalContent(JSON.stringify(seal));
    expect(parsedSeal.verification).toBe('verified');
    expect(parsedSeal.state.intakeDrafts).toEqual(withDraft.intakeDrafts);

    // Struktur korup ditolak validateAppStateStructure
    const corrupt = JSON.parse(JSON.stringify(withDraft)) as AppState;
    (corrupt.intakeDrafts as unknown[]) = [{ id: '' }];
    expect(() => validateAppStateStructure(corrupt)).toThrow();

    // Backup lama tanpa field intakeDrafts tetap lolos SHA-256 dan ter-normalisasi idempoten
    const legacyPayload = JSON.parse(JSON.stringify(state)) as AppState;
    delete legacyPayload.intakeDrafts;
    const legacyBody = {
      formatName: 'SIGNAL-LOCAL-BACKUP' as const,
      formatVersion: 2,
      schemaVersion: 2,
      appVersion: '1.2.1',
      checksumAlgorithm: 'SHA-256' as const,
      exportedAt: '2026-11-16T03:00:00Z',
      payload: legacyPayload,
    };
    const checksum = await computeCanonicalSha256(legacyBody);
    const parsedLegacy = await parseBackupContent(JSON.stringify({ ...legacyBody, checksum }));
    expect(parsedLegacy.verification).toBe('verified');
    expect(parsedLegacy.state.intakeDrafts).toEqual([]);
    expect(migrateAppStateSchema(parsedLegacy.state).changed).toBe(false);
  });

  it('10. Render SSR S03, PersuratanWorkspace, CorrespondenceCenter, dan App menjaga integritas shell serta batas jujur Tahap 4', () => {
    const empty = createEmptyState();
    expect(empty.documents).toEqual([]);
    expect(empty.intakeDrafts).toEqual([]);

    const demo = createDemoState();
    const tpl01 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-01')!;
    const intakeHtml = renderToStaticMarkup(
      createElement(PersuratanWorkspace, {
        state: demo,
        initialView: 'intake',
        initialTemplateId: tpl01.id,
      })
    );

    expect(intakeHtml).toContain('Isian Konteks');
    expect(intakeHtml).toContain('Sumber Data Sistem');
    expect(intakeHtml).toContain('Simpan sebagai Draft');
    expect(intakeHtml).toContain('Kembali ke Template');
    expect(intakeHtml).toContain('Lampiran Undangan');
    expect(intakeHtml).toContain('Dataset Demo Aktif');
    // Batas jujur Tahap 4: tidak boleh ada tombol finalisasi/cetak S05 di S03
    expect(intakeHtml).not.toContain('Terbitkan Nomor');
    expect(intakeHtml).not.toContain('Finalisasi Dokumen');

    // Render S01 setelah draft S03 tersimpan -> menampilkan status jujur & aksi Edit S03
    const saved = saveIntakeDraftToState(
      demo,
      tpl01,
      {
        peserta: [demo.teachers[0].id],
        nama_kegiatan: 'Rapat Kerja Tahunan',
        penyelenggara: 'KKM Kabupaten',
        tanggal_mulai: '2026-12-05',
        tanggal_selesai: '2026-12-06',
        lokasi: 'Aula Madrasah',
        documentDate: '2026-11-16',
      },
      { timestamp: '2026-11-16T10:35:00Z' }
    );

    const s01Html = renderToStaticMarkup(
      createElement(CorrespondenceCenter, {
        state: saved.state,
        onEditIntakeDraft: () => {},
        onOpenStudio: () => {},
      })
    );
    expect(s01Html).toContain('Data awal S03 tersimpan');
    expect(s01Html).toContain('s5-action-dock');
    expect(s01Html).toContain('Aksi lainnya untuk');
    expect(s01Html).toContain('Buka S04');
    expect(s01Html).toContain('Belum Bernomor');

    // Subnav PersuratanWorkspace & App shell tetap merender aman
    expect(intakeHtml).toContain('Arsip &amp; Surat');
    expect(intakeHtml).toContain('Isian Konteks');
    expect(intakeHtml).toContain('Ganti Template');
    const appHtml = renderToStaticMarkup(createElement(App));
    expect(appHtml).toContain('SIGNAL');
  });
});
