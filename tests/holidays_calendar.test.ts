import { describe, expect, it } from 'vitest';
import {
  computeEffectiveAttendanceDates,
  getOfficialEventByDate,
  getOfficialEventsForYear,
  isOfficialRedDate,
} from '../src/domain/indonesianHolidays';

describe('Kalender Libur Nasional SKB 3 Menteri & Kaldik Kemenag RI', () => {
  it('menyediakan daftar hari libur resmi untuk tahun 2025, 2026, dan 2027', () => {
    const events2025 = getOfficialEventsForYear(2025);
    const events2026 = getOfficialEventsForYear(2026);
    const events2027 = getOfficialEventsForYear(2027);

    expect(events2025.filter((e) => e.category === 'NASIONAL').length).toBeGreaterThanOrEqual(16);
    expect(events2026.filter((e) => e.category === 'NASIONAL').length).toBe(17);
    expect(events2027.filter((e) => e.category === 'NASIONAL').length).toBe(18);

    // Kaldik Kemenag RI check
    expect(getOfficialEventByDate('2026-10-22')?.category).toBe('KALDIK_KEMENAG');
    expect(getOfficialEventByDate('2026-08-17')?.category).toBe('NASIONAL');
    expect(getOfficialEventByDate('2027-03-10')?.name).toContain('Idulfitri 1448');
  });

  it('otomatis mengecualikan tanggal merah, libur nasional, cuti bersama, dan hari Minggu pada rentang input massal', () => {
    // Mei 2026:
    // - 1 Mei 2026 (Jumat) = Hari Buruh Internasional (Libur Nasional)
    // - 3, 10, 17, 24, 31 Mei = Hari Minggu (31 Mei juga Waisak)
    // - 14 Mei 2026 (Kamis) = Kenaikan Yesus Kristus (Libur Nasional)
    // - 15 Mei 2026 (Jumat) = Cuti Bersama Kenaikan Yesus Kristus
    // - 27 Mei 2026 (Rabu) = Iduladha 1447 H (Libur Nasional)
    // - 28 Mei 2026 (Kamis) = Cuti Bersama Iduladha 1447 H
    // Total kalender = 31 hari; Minggu = 5 hari; Libur non-Minggu = 1, 14, 15, 27, 28 Mei (5 hari) -> Efektif = 21 hari
    const summaryWithCuti = computeEffectiveAttendanceDates({
      startDate: '2026-05-01',
      endDate: '2026-05-31',
      registeredHolidays: [],
      includeOfficialRedDates: true,
      includeCutiBersama: true,
    });

    expect(summaryWithCuti.totalCalendarDays).toBe(31);
    expect(summaryWithCuti.skippedSundays).toEqual([
      '2026-05-03',
      '2026-05-10',
      '2026-05-17',
      '2026-05-24',
      '2026-05-31',
    ]);
    expect(summaryWithCuti.skippedOfficialHolidays.map((h) => h.date)).toEqual([
      '2026-05-01',
      '2026-05-14',
      '2026-05-15',
      '2026-05-27',
      '2026-05-28',
    ]);
    expect(summaryWithCuti.effectiveDates).not.toContain('2026-05-01');
    expect(summaryWithCuti.effectiveDates).not.toContain('2026-05-14');
    expect(summaryWithCuti.effectiveDates).not.toContain('2026-05-27');
    expect(summaryWithCuti.effectiveDates.length).toBe(21);

    // Jika Cuti Bersama tidak dikecualikan, 15 Mei & 28 Mei tetap masuk hari efektif
    const summaryWithoutCuti = computeEffectiveAttendanceDates({
      startDate: '2026-05-01',
      endDate: '2026-05-31',
      registeredHolidays: [],
      includeOfficialRedDates: true,
      includeCutiBersama: false,
    });
    expect(summaryWithoutCuti.effectiveDates).toContain('2026-05-15');
    expect(summaryWithoutCuti.effectiveDates).toContain('2026-05-28');
    expect(summaryWithoutCuti.effectiveDates).not.toContain('2026-05-01');
    expect(summaryWithoutCuti.effectiveDates.length).toBe(23);
  });

  it('tetap mengecualikan hari libur kustom madrasah dan mendeteksi tanggal merah resmi', () => {
    expect(isOfficialRedDate('2026-08-17')?.name).toContain('Kemerdekaan');
    expect(isOfficialRedDate('2026-10-22')).toBeUndefined(); // Hari Santri bukan tanggal merah libur nasional

    const result = computeEffectiveAttendanceDates({
      startDate: '2026-08-16',
      endDate: '2026-08-19',
      registeredHolidays: [
        { id: 'HOL-M', date: '2026-08-18', name: 'Rapat Kerja Madrasah' },
      ],
      includeOfficialRedDates: true,
      includeCutiBersama: true,
    });

    // 16 Agu = Minggu, 17 Agu = HUT RI (otomatis dilewati), 18 Agu = Rapat Kerja (registered), 19 Agu = efektif
    expect(result.skippedSundays).toEqual(['2026-08-16']);
    expect(result.skippedOfficialHolidays.map((h) => h.date)).toEqual(['2026-08-17']);
    expect(result.skippedRegisteredHolidays.map((h) => h.date)).toEqual(['2026-08-18']);
    expect(result.effectiveDates).toEqual(['2026-08-19']);
  });

  it('mendukung kalender resmi tahun 2028 dan pengecualian libur Kaldik Kemenag RI secara otomatis', () => {
    const events2028 = getOfficialEventsForYear(2028);
    expect(events2028.filter((e) => e.category === 'NASIONAL').length).toBeGreaterThanOrEqual(16);
    expect(getOfficialEventByDate('2028-01-28')?.category).toBe('KALDIK_KEMENAG');

    // Januari 2028: 26 Jan (Imlek), 28 Jan (Awal Puasa Ramadan Kaldik Kemenag), 30 Jan (Minggu)
    const result = computeEffectiveAttendanceDates({
      startDate: '2028-01-26',
      endDate: '2028-01-31',
      registeredHolidays: [],
      includeOfficialRedDates: true,
      includeCutiBersama: true,
      includeKaldikLibur: true,
    });

    expect(result.skippedOfficialHolidays.map((h) => h.date)).toEqual([
      '2028-01-26',
      '2028-01-28',
    ]);
    expect(result.skippedSundays).toEqual(['2028-01-30']);
    expect(result.effectiveDates).toEqual(['2028-01-27', '2028-01-29', '2028-01-31']);
  });
});

