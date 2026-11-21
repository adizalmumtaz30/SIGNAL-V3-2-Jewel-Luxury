import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import jsPDF from 'jspdf';
import { createDemoState } from '../src/domain/seed';
import {
  exportAllClassesSinglePageA4PDF,
  exportAllClassesWeeklyPDF,
  exportAttendanceRecapPDF,
  exportScheduleClassPDF,
  exportScheduleMasterPDF,
  exportScheduleTeacherPDF,
} from '../src/utils/pdfExport';

describe('Pengaman Sentral Ekspor PDF Vitest (Tanpa Penulisan Disk)', () => {
  it('1. jsPDF tetap merender dokumen %PDF- valid di memori dan .save() tidak menulis file ke root', async () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    doc.text('Uji Pengaman Memori PDF', 14, 20);

    const buffer = doc.output('arraybuffer');
    const bytes = new Uint8Array(buffer);
    const header = String.fromCharCode(...bytes.slice(0, 5));
    expect(header).toBe('%PDF-');
    expect(bytes.byteLength).toBeGreaterThan(500);

    const probeFile = '__vitest_pdf_guard_probe_sync__.pdf';
    const probePath = path.resolve(process.cwd(), probeFile);
    expect(fs.existsSync(probePath)).toBe(false);

    const ret = doc.save(probeFile);
    expect(ret).toBe(doc);
    expect(fs.existsSync(probePath)).toBe(false);

    const probePromiseFile = '__vitest_pdf_guard_probe_async__.pdf';
    const probePromisePath = path.resolve(process.cwd(), probePromiseFile);
    await expect(doc.save(probePromiseFile, { returnPromise: true })).resolves.toBeUndefined();
    expect(fs.existsSync(probePromisePath)).toBe(false);
  });

  it('2. Seluruh fungsi export*PDF memanggil save tanpa menulis berkas baru ke direktori kerja', () => {
    const state = createDemoState();
    const marker = 'REGRESSION_NO_WRITE_999';
    state.settings = {
      ...state.settings,
      academicYear: marker,
    };
    state.classes = state.classes.map((c, idx) => (idx === 0 ? { ...c, name: marker } : c));
    state.teachers = state.teachers.map((t, idx) => (idx === 0 ? { ...t, name: marker } : t));

    const rootBefore = new Set(fs.readdirSync(process.cwd()));
    const saveSpy = (jsPDF.API as unknown as { save: ReturnType<typeof vi.fn> }).save;

    exportScheduleMasterPDF(state);
    exportScheduleClassPDF(state, state.classes[0]!.id);
    exportAllClassesWeeklyPDF(state, { academicYear: marker });
    exportAllClassesSinglePageA4PDF(state, { academicYear: marker });
    const teacherDoc = exportScheduleTeacherPDF(state, state.teachers[0]!.id);
    exportAttendanceRecapPDF(state, '2099-01', state.teachers.map((t) => t.id));

    expect(teacherDoc).toBeDefined();
    const teacherBuffer = teacherDoc!.output('arraybuffer');
    expect(String.fromCharCode(...new Uint8Array(teacherBuffer).slice(0, 5))).toBe('%PDF-');

    expect(saveSpy).toHaveBeenCalledTimes(6);
    const savedNames = saveSpy.mock.calls.map((c) => String(c[0] ?? ''));
    expect(savedNames.some((n) => n.includes(`SAKALA_Jadwal_Semua_Kelas_A4_${marker}.pdf`))).toBe(true);
    expect(savedNames.some((n) => n.includes(`SAKALA_Jadwal_Mingguan_Kelas_${marker}_A4.pdf`))).toBe(true);
    expect(savedNames.some((n) => n.includes(`SAKALA_Jadwal_Mingguan_Semua_Kelas_A4_${marker}.pdf`))).toBe(true);
    expect(savedNames.some((n) => n.includes(`SAKALA_Jadwal_Guru_${marker}.pdf`))).toBe(true);
    expect(savedNames.some((n) => n.includes('SAKALA_Rekap_Presensi_Guru_A4_'))).toBe(true);

    const rootAfter = fs.readdirSync(process.cwd());
    const createdPdfs = rootAfter.filter((f) => !rootBefore.has(f) && f.endsWith('.pdf'));
    expect(createdPdfs).toEqual([]);
  });

  it('3. Tetap aman memblokir penulisan disk meskipun vi.restoreAllMocks() dipanggil', () => {
    vi.restoreAllMocks();
    const doc = new jsPDF();
    doc.text('Pasca restoreAllMocks', 10, 10);

    const probeAfterRestore = '__vitest_after_restore_guard__.pdf';
    const probePath = path.resolve(process.cwd(), probeAfterRestore);
    doc.save(probeAfterRestore);
    expect(fs.existsSync(probePath)).toBe(false);
  });
});
