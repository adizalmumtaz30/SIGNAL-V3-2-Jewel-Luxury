import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createDemoState } from '../src/domain/seed';
import {
  applyMassAttendanceRecords,
  computeMonthlyAttendanceRecap,
  computeRangeAttendanceRecap,
  enumerateMonthsInRange,
} from '../src/domain/attendanceRecap';
import { computeEffectiveAttendanceDates } from '../src/domain/indonesianHolidays';
import { exportAttendanceRecapPDF } from '../src/utils/pdfExport';
import { AttendanceScreen } from '../src/components/AttendanceScreen';
import type { AttendanceRecord, Teacher } from '../src/domain/types';

describe('Rekap Kehadiran Guru & Input Massal (Anti-Penalti 96% Palsu)', () => {
  it('menghitung 100% jika guru baru memiliki 24 hari Hadir (0 Sakit/Izin/Alpa) sementara guru lama 25 hari', () => {
    const state = createDemoState();
    const extraTeachers: Teacher[] = [
      {
        id: 'TCH-010',
        code: 'T-10',
        name: 'H. Mad Budi, M.Pd.I',
        subjectIds: ['SUB-PAI'],
        maxWeeklyJP: 24,
        isActive: true,
        roleTitle: 'Kepala Madrasah',
      },
      {
        id: 'TCH-011',
        code: 'T-11',
        name: 'Abdul Hadi, S.Ag',
        subjectIds: ['SUB-QUR'],
        maxWeeklyJP: 24,
        isActive: true,
        roleTitle: 'Guru Mapel',
      },
      {
        id: 'TCH-012',
        code: 'T-12',
        name: 'Fajrin Nurilman, S.S',
        subjectIds: ['SUB-IND'],
        maxWeeklyJP: 24,
        isActive: true,
        roleTitle: 'Guru Mapel',
      },
    ];
    const allTeachers = [...state.teachers, ...extraTeachers];

    const janSummary = computeEffectiveAttendanceDates({
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      registeredHolidays: [],
      includeOfficialRedDates: true,
      includeCutiBersama: true,
      includeKaldikLibur: true,
    });
    expect(janSummary.effectiveDates.length).toBe(25);

    const records: AttendanceRecord[] = [];
    // Guru T-01..T-09 tercatat 25 hari Hadir
    for (const d of janSummary.effectiveDates) {
      for (const t of state.teachers) {
        records.push({
          id: `ATT-${d}-${t.id}`,
          date: d,
          teacherId: t.id,
          status: 'HADIR',
          recordedAt: '2026-01-31T08:00:00Z',
        });
      }
    }
    // Guru baru T-10..T-12 tercatat 24 hari Hadir (tanpa Sakit/Izin/Alpa)
    for (const d of janSummary.effectiveDates.slice(1)) {
      for (const t of extraTeachers) {
        records.push({
          id: `ATT-${d}-${t.id}`,
          date: d,
          teacherId: t.id,
          status: 'HADIR',
          recordedAt: '2026-01-31T08:00:00Z',
        });
      }
    }

    const recap = computeMonthlyAttendanceRecap(records, allTeachers, '2026-01');
    expect(recap.recordedDaysCount).toBe(25);
    expect(recap.overallAvgRate).toBe(100);
    expect(recap.overallPredikat).toBe('Sangat Baik (A)');

    const t10 = recap.rows.find((r) => r.teacher.id === 'TCH-010')!;
    const t11 = recap.rows.find((r) => r.teacher.id === 'TCH-011')!;
    const t12 = recap.rows.find((r) => r.teacher.id === 'TCH-012')!;
    expect(t10.hadir).toBe(24);
    expect(t10.rate).toBe(100);
    expect(t11.rate).toBe(100);
    expect(t12.rate).toBe(100);

    // Ekspor PDF tidak melempar error
    state.teachers = allTeachers;
    state.attendance = records;
    expect(() =>
      exportAttendanceRecapPDF(state, '2026-01', allTeachers.map((t) => t.id)),
    ).not.toThrow();
  });

  it('tetap menurunkan persentase ke 96% jika memang ada 1 hari ketidakhadiran riil (Sakit/Izin/Alpa)', () => {
    const state = createDemoState();
    const teacher = state.teachers[0]!;
    const janSummary = computeEffectiveAttendanceDates({
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      registeredHolidays: [],
      includeOfficialRedDates: true,
      includeCutiBersama: true,
      includeKaldikLibur: true,
    });

    const records: AttendanceRecord[] = janSummary.effectiveDates.map((d, idx) => ({
      id: `ATT-${d}-${teacher.id}`,
      date: d,
      teacherId: teacher.id,
      status: idx === 0 ? 'SAKIT' : 'HADIR',
      recordedAt: '2026-01-31T08:00:00Z',
    }));

    const recap = computeMonthlyAttendanceRecap(records, [teacher], '2026-01');
    expect(recap.rows[0]!.hadir).toBe(24);
    expect(recap.rows[0]!.sakit).toBe(1);
    expect(recap.rows[0]!.rate).toBe(96);
  });

  it('membersihkan catatan yatim pada tanggal libur di rentang input massal dan menyertakan guru baru secara seragam', () => {
    const state = createDemoState();
    const newTeacher: Teacher = {
      id: 'TCH-010',
      code: 'T-10',
      name: 'H. Mad Budi, M.Pd.I',
      subjectIds: ['SUB-PAI'],
      maxWeeklyJP: 24,
      isActive: true,
      roleTitle: 'Kepala Madrasah',
    };
    const allTeachers = [...state.teachers, newTeacher];

    // Sebelumnya guru lama sempat punya catatan pada 2026-01-01 (libur) dan 2026-01-02..31
    const oldSummary = computeEffectiveAttendanceDates({
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      registeredHolidays: [],
      includeOfficialRedDates: true,
      includeCutiBersama: true,
      includeKaldikLibur: true,
    });
    const staleDate = '2026-01-03';
    const preExisting: AttendanceRecord[] = [];
    for (const t of state.teachers) {
      for (const d of oldSummary.effectiveDates) {
        preExisting.push({
          id: `ATT-${d}-${t.id}`,
          date: d,
          teacherId: t.id,
          status: 'HADIR',
          recordedAt: '2026-01-31T08:00:00Z',
        });
      }
    }

    // User mendaftarkan 2026-01-03 sebagai hari libur tambahan lalu menjalankan Input Massal ulang
    const newSummary = computeEffectiveAttendanceDates({
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      registeredHolidays: [{ id: 'HOL-HAB', date: staleDate, name: 'Hari Amal Bakti' }],
      includeOfficialRedDates: true,
      includeCutiBersama: true,
      includeKaldikLibur: true,
    });
    expect(newSummary.effectiveDates.length).toBe(24);

    const updated = applyMassAttendanceRecords({
      existingAttendance: preExisting,
      targetTeacherIds: allTeachers.map((t) => t.id),
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      effectiveDates: newSummary.effectiveDates,
      status: 'HADIR',
      notes: 'Input massal Hadir',
      recordedAt: '2026-01-31T09:00:00Z',
    });

    const recap = computeMonthlyAttendanceRecap(updated, allTeachers, '2026-01');
    expect(recap.recordedDaysCount).toBe(24);
    for (const row of recap.rows) {
      expect(row.hadir).toBe(24);
      expect(row.rate).toBe(100);
    }
    expect(updated.some((a) => a.date === staleDate)).toBe(false);
  });

  it('mendeduplikasi entri ganda di tanggal dan guru yang sama agar tidak menggandakan hitungan', () => {
    const state = createDemoState();
    const teacher = state.teachers[0]!;
    const dupRecords: AttendanceRecord[] = [
      {
        id: 'ATT-1',
        date: '2026-01-05',
        teacherId: teacher.id,
        status: 'ALPA',
        recordedAt: '2026-01-05T07:00:00Z',
      },
      {
        id: 'ATT-2',
        date: '2026-01-05',
        teacherId: teacher.id,
        status: 'HADIR',
        recordedAt: '2026-01-05T08:00:00Z',
      },
    ];

    const recap = computeMonthlyAttendanceRecap(dupRecords, [teacher], '2026-01');
    expect(recap.rows[0]!.totalRecorded).toBe(1);
    expect(recap.rows[0]!.hadir).toBe(1);
    expect(recap.rows[0]!.alpa).toBe(0);
    expect(recap.rows[0]!.rate).toBe(100);
  });

  it('menghitung rekap rentang multi-bulan (Dari Bulan – Sampai Bulan) beserta rincian per bulan', () => {
    const state = createDemoState();
    const teachers = state.teachers.slice(0, 2);
    const [t1, t2] = teachers;

    expect(enumerateMonthsInRange('2026-09', '2026-07')).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(enumerateMonthsInRange('2026-11', '2027-02')).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ]);

    const rangeRecords: AttendanceRecord[] = [
      // Juli 2026: t1 hadir 2 hari, t2 hadir 1 + sakit 1 (50%)
      { id: 'R1', date: '2026-07-13', teacherId: t1!.id, status: 'HADIR', recordedAt: '2026-07-13T08:00:00Z' },
      { id: 'R2', date: '2026-07-14', teacherId: t1!.id, status: 'HADIR', recordedAt: '2026-07-14T08:00:00Z' },
      { id: 'R3', date: '2026-07-13', teacherId: t2!.id, status: 'HADIR', recordedAt: '2026-07-13T08:00:00Z' },
      { id: 'R4', date: '2026-07-14', teacherId: t2!.id, status: 'SAKIT', recordedAt: '2026-07-14T08:00:00Z' },
      // Agustus 2026: t1 dinas luar 1 + hadir 1 (100%), t2 hadir 2 (100%)
      { id: 'R5', date: '2026-08-03', teacherId: t1!.id, status: 'DINAS_LUAR', recordedAt: '2026-08-03T08:00:00Z' },
      { id: 'R6', date: '2026-08-04', teacherId: t1!.id, status: 'HADIR', recordedAt: '2026-08-04T08:00:00Z' },
      { id: 'R7', date: '2026-08-03', teacherId: t2!.id, status: 'HADIR', recordedAt: '2026-08-03T08:00:00Z' },
      { id: 'R8', date: '2026-08-04', teacherId: t2!.id, status: 'HADIR', recordedAt: '2026-08-04T08:00:00Z' },
      // September 2026: t1 hadir 1 (100%), t2 belum tercatat (atau alpa 0)
      { id: 'R9', date: '2026-09-01', teacherId: t1!.id, status: 'HADIR', recordedAt: '2026-09-01T08:00:00Z' },
      // Bulan di luar rentang (Oktober) tidak boleh ikut terhitung
      { id: 'R10', date: '2026-10-01', teacherId: t2!.id, status: 'ALPA', recordedAt: '2026-10-01T08:00:00Z' },
    ];

    const summary = computeRangeAttendanceRecap(rangeRecords, teachers, '2026-07', '2026-09');
    expect(summary.isMultiMonth).toBe(true);
    expect(summary.months).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(summary.recordedDaysCount).toBe(5);
    expect(summary.periodLabel).toContain('Juli');
    expect(summary.periodLabel).toContain('September 2026');

    const row1 = summary.rows.find((r) => r.teacher.id === t1!.id)!;
    expect(row1.hadir).toBe(5);
    expect(row1.dinas).toBe(1);
    expect(row1.rate).toBe(100);
    expect(row1.monthlyBreakdown['2026-07']?.hadir).toBe(2);
    expect(row1.monthlyBreakdown['2026-08']?.hadir).toBe(2);
    expect(row1.monthlyBreakdown['2026-09']?.rate).toBe(100);

    const row2 = summary.rows.find((r) => r.teacher.id === t2!.id)!;
    expect(row2.hadir).toBe(3);
    expect(row2.sakit).toBe(1);
    expect(row2.alpa).toBe(0);
    expect(row2.rate).toBe(75);
    expect(row2.monthlyBreakdown['2026-07']?.rate).toBe(50);
    expect(row2.monthlyBreakdown['2026-08']?.rate).toBe(100);
    expect(row2.monthlyBreakdown['2026-09']?.hasData).toBe(false);
  });

  it('merender kartu KPI Presensi Guru dengan model kartu permata yang seragam dengan Persuratan & Arsip', () => {
    const state = createDemoState();
    const html = renderToStaticMarkup(
      createElement(AttendanceScreen, {
        state,
        onUpdateState: () => {},
        onNotify: () => {},
      }),
    );

    expect(html).toContain('s5-att-kpi-grid');
    expect(html).toContain('s5-att-kpi-card stat-card');
    expect(html).toContain('tone-gold');
    expect(html).toContain('tone-slate');
    expect(html).toContain('s5-att-kpi-jewel-icon');
    expect(html).toContain('s5-att-kpi-jewel-ring');
    expect(html).toContain('s5-att-kpi-body');
    expect(html).toContain('Guru Hadir Hari Ini');
    expect(html).toContain('Tingkat Kehadiran');
    expect(html).toContain('Dinas Luar / Izin / Sakit');
    expect(html).toContain('Tanpa Keterangan (Alpa)');
  });
});

