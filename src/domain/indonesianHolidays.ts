import type { Holiday } from './types';

export type OfficialHolidayCategory = 'NASIONAL' | 'CUTI_BERSAMA' | 'KALDIK_KEMENAG';

export interface OfficialCalendarEvent {
  date: string; // 'YYYY-MM-DD'
  name: string;
  year: number;
  category: OfficialHolidayCategory;
  decree: string;
  isRedDate: boolean; // true = hari libur / non-KBM efektif
  notes?: string;
}

export interface EffectiveRangeSummary {
  totalCalendarDays: number;
  effectiveDates: string[];
  skippedSundays: string[];
  skippedRegisteredHolidays: Array<{ date: string; name: string }>;
  skippedOfficialHolidays: OfficialCalendarEvent[];
}

/**
 * Kalender Resmi Hari Libur Nasional & Cuti Bersama (SKB 3 Menteri RI)
 * serta Kalender Pendidikan Madrasah Kementerian Agama RI (Kaldik Pendis)
 * Tahun 2025, 2026, dan 2027.
 */
export const OFFICIAL_CALENDAR_EVENTS: OfficialCalendarEvent[] = [
  // =========================================================================
  // TAHUN 2025 — SKB 3 MENTERI RI & KALDIK KEMENAG PENDIS
  // =========================================================================
  {
    date: '2025-01-01',
    name: 'Tahun Baru 2025 Masehi',
    year: 2025,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri 2025',
    isRedDate: true,
  },
  {
    date: '2025-01-03',
    name: 'Hari Amal Bakti (HAB) Kementerian Agama RI',
    year: 2025,
    category: 'KALDIK_KEMENAG',
    decree: 'Kaldik Kemenag RI',
    isRedDate: false,
    notes: 'Agenda peringatan resmi madrasah (KBM/Upacara HAB).',
  },
  {
    date: '2025-01-27',
    name: 'Isra Mikraj Nabi Muhammad SAW',
    year: 2025,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri 2025',
    isRedDate: true,
  },
  {
    date: '2025-01-28',
    name: 'Cuti Bersama Tahun Baru Imlek 2576 Kongzili',
    year: 2025,
    category: 'CUTI_BERSAMA',
    decree: 'SKB 3 Menteri 2025',
    isRedDate: true,
  },
  {
    date: '2025-01-29',
    name: 'Tahun Baru Imlek 2576 Kongzili',
    year: 2025,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri 2025',
    isRedDate: true,
  },
  {
    date: '2025-03-28',
    name: 'Cuti Bersama Hari Suci Nyepi (Tahun Baru Saka 1947)',
    year: 2025,
    category: 'CUTI_BERSAMA',
    decree: 'SKB 3 Menteri 2025',
    isRedDate: true,
  },
  {
    date: '2025-03-29',
    name: 'Hari Suci Nyepi (Tahun Baru Saka 1947)',
    year: 2025,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri 2025',
    isRedDate: true,
  },
  {
    date: '2025-03-31',
    name: 'Hari Raya Idulfitri 1446 Hijriah (Hari Pertama)',
    year: 2025,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri 2025',
    isRedDate: true,
  },
  {
    date: '2025-04-01',
    name: 'Hari Raya Idulfitri 1446 Hijriah (Hari Kedua)',
    year: 2025,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri 2025',
    isRedDate: true,
  },
  {
    date: '2025-04-02',
    name: 'Cuti Bersama Idulfitri 1446 Hijriah',
    year: 2025,
    category: 'CUTI_BERSAMA',
    decree: 'SKB 3 Menteri 2025',
    isRedDate: true,
  },
  {
    date: '2025-04-03',
    name: 'Cuti Bersama Idulfitri 1446 Hijriah',
    year: 2025,
    category: 'CUTI_BERSAMA',
    decree: 'SKB 3 Menteri 2025',
    isRedDate: true,
  },
  {
    date: '2025-04-04',
    name: 'Cuti Bersama Idulfitri 1446 Hijriah',
    year: 2025,
    category: 'CUTI_BERSAMA',
    decree: 'SKB 3 Menteri 2025',
    isRedDate: true,
  },
  {
    date: '2025-04-07',
    name: 'Cuti Bersama Idulfitri 1446 Hijriah',
    year: 2025,
    category: 'CUTI_BERSAMA',
    decree: 'SKB 3 Menteri 2025',
    isRedDate: true,
  },
  {
    date: '2025-04-18',
    name: 'Wafat Yesus Kristus',
    year: 2025,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri 2025',
    isRedDate: true,
  },
  {
    date: '2025-04-20',
    name: 'Kebangkitan Yesus Kristus (Paskah)',
    year: 2025,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri 2025',
    isRedDate: true,
  },
  {
    date: '2025-05-01',
    name: 'Hari Buruh Internasional',
    year: 2025,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri 2025',
    isRedDate: true,
  },
  {
    date: '2025-05-12',
    name: 'Hari Raya Waisak 2569 BE',
    year: 2025,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri 2025',
    isRedDate: true,
  },
  {
    date: '2025-05-13',
    name: 'Cuti Bersama Hari Raya Waisak 2569 BE',
    year: 2025,
    category: 'CUTI_BERSAMA',
    decree: 'SKB 3 Menteri 2025',
    isRedDate: true,
  },
  {
    date: '2025-05-29',
    name: 'Kenaikan Yesus Kristus',
    year: 2025,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri 2025',
    isRedDate: true,
  },
  {
    date: '2025-05-30',
    name: 'Cuti Bersama Kenaikan Yesus Kristus',
    year: 2025,
    category: 'CUTI_BERSAMA',
    decree: 'SKB 3 Menteri 2025',
    isRedDate: true,
  },
  {
    date: '2025-06-01',
    name: 'Hari Lahir Pancasila',
    year: 2025,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri 2025',
    isRedDate: true,
  },
  {
    date: '2025-06-06',
    name: 'Hari Raya Iduladha 1446 Hijriah',
    year: 2025,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri 2025',
    isRedDate: true,
  },
  {
    date: '2025-06-09',
    name: 'Cuti Bersama Hari Raya Iduladha 1446 Hijriah',
    year: 2025,
    category: 'CUTI_BERSAMA',
    decree: 'SKB 3 Menteri 2025',
    isRedDate: true,
  },
  {
    date: '2025-06-27',
    name: '1 Muharam Tahun Baru Islam 1447 Hijriah',
    year: 2025,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri 2025',
    isRedDate: true,
  },
  {
    date: '2025-07-14',
    name: 'Awal Tahun Ajaran Baru Madrasah TA 2025/2026',
    year: 2025,
    category: 'KALDIK_KEMENAG',
    decree: 'KEPDIRJEN Pendis No. 4261/2025',
    isRedDate: false,
    notes: 'Hari pertama masuk madrasah & MATSAMA Semester Ganjil.',
  },
  {
    date: '2025-08-17',
    name: 'Proklamasi Kemerdekaan Republik Indonesia ke-80',
    year: 2025,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri 2025',
    isRedDate: true,
  },
  {
    date: '2025-08-18',
    name: 'Cuti Bersama HUT ke-80 Kemerdekaan RI',
    year: 2025,
    category: 'CUTI_BERSAMA',
    decree: 'SKB 3 Menteri Perubahan 2025',
    isRedDate: true,
  },
  {
    date: '2025-09-05',
    name: 'Maulid Nabi Muhammad SAW 1447 H',
    year: 2025,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri 2025',
    isRedDate: true,
  },
  {
    date: '2025-10-22',
    name: 'Hari Santri Nasional (HSN)',
    year: 2025,
    category: 'KALDIK_KEMENAG',
    decree: 'Kaldik Kemenag RI',
    isRedDate: false,
    notes: 'Upacara Hari Santri & agenda penguatan karakter madrasah.',
  },
  {
    date: '2025-12-22',
    name: 'Mulai Libur Semester Ganjil Madrasah TA 2025/2026',
    year: 2025,
    category: 'KALDIK_KEMENAG',
    decree: 'KEPDIRJEN Pendis No. 4261/2025',
    isRedDate: true,
    notes: 'Libur pembelajaran semester ganjil madrasah (22 Des 2025 – 3 Jan 2026).',
  },
  {
    date: '2025-12-25',
    name: 'Kelahiran Yesus Kristus (Hari Natal)',
    year: 2025,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri 2025',
    isRedDate: true,
  },
  {
    date: '2025-12-26',
    name: 'Cuti Bersama Kelahiran Yesus Kristus',
    year: 2025,
    category: 'CUTI_BERSAMA',
    decree: 'SKB 3 Menteri 2025',
    isRedDate: true,
  },

  // =========================================================================
  // TAHUN 2026 — SKB 3 MENTERI NO. 1497/2025 & KALDIK KEMENAG PENDIS
  // =========================================================================
  {
    date: '2026-01-01',
    name: 'Tahun Baru 2026 Masehi',
    year: 2026,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1497/2025',
    isRedDate: true,
  },
  {
    date: '2026-01-03',
    name: 'Hari Amal Bakti (HAB) Kementerian Agama RI ke-80',
    year: 2026,
    category: 'KALDIK_KEMENAG',
    decree: 'KEPDIRJEN Pendis No. 4261/2025',
    isRedDate: false,
    notes: 'Peringatan Hari Amal Bakti Kemenag & awal persiapan Semester Genap.',
  },
  {
    date: '2026-01-05',
    name: 'Hari Pertama Masuk Semester Genap TA 2025/2026',
    year: 2026,
    category: 'KALDIK_KEMENAG',
    decree: 'KEPDIRJEN Pendis No. 4261/2025',
    isRedDate: false,
    notes: 'Awal efektif KBM Semester Genap Madrasah.',
  },
  {
    date: '2026-01-16',
    name: 'Isra Mikraj Nabi Muhammad SAW 1447 H',
    year: 2026,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1497/2025',
    isRedDate: true,
  },
  {
    date: '2026-02-16',
    name: 'Cuti Bersama Tahun Baru Imlek 2577 Kongzili',
    year: 2026,
    category: 'CUTI_BERSAMA',
    decree: 'SKB 3 Menteri No. 1497/2025',
    isRedDate: true,
  },
  {
    date: '2026-02-17',
    name: 'Tahun Baru Imlek 2577 Kongzili',
    year: 2026,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1497/2025',
    isRedDate: true,
  },
  {
    date: '2026-02-18',
    name: 'Perkiraan Libur Awal Ramadhan 1447 H (Kaldik Madrasah)',
    year: 2026,
    category: 'KALDIK_KEMENAG',
    decree: 'KEPDIRJEN Pendis No. 4261/2025',
    isRedDate: true,
    notes: 'Penyesuaian KBM awal Ramadhan sesuai ketetapan Kemenag wilayah.',
  },
  {
    date: '2026-03-18',
    name: 'Cuti Bersama Hari Suci Nyepi (Tahun Baru Saka 1948)',
    year: 2026,
    category: 'CUTI_BERSAMA',
    decree: 'SKB 3 Menteri No. 1497/2025',
    isRedDate: true,
  },
  {
    date: '2026-03-19',
    name: 'Hari Suci Nyepi (Tahun Baru Saka 1948)',
    year: 2026,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1497/2025',
    isRedDate: true,
  },
  {
    date: '2026-03-20',
    name: 'Cuti Bersama Idulfitri 1447 Hijriah',
    year: 2026,
    category: 'CUTI_BERSAMA',
    decree: 'SKB 3 Menteri No. 1497/2025',
    isRedDate: true,
  },
  {
    date: '2026-03-21',
    name: 'Hari Raya Idulfitri 1447 Hijriah (Hari Pertama)',
    year: 2026,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1497/2025',
    isRedDate: true,
  },
  {
    date: '2026-03-22',
    name: 'Hari Raya Idulfitri 1447 Hijriah (Hari Kedua)',
    year: 2026,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1497/2025',
    isRedDate: true,
  },
  {
    date: '2026-03-23',
    name: 'Cuti Bersama Idulfitri 1447 Hijriah',
    year: 2026,
    category: 'CUTI_BERSAMA',
    decree: 'SKB 3 Menteri No. 1497/2025',
    isRedDate: true,
  },
  {
    date: '2026-03-24',
    name: 'Cuti Bersama Idulfitri 1447 Hijriah',
    year: 2026,
    category: 'CUTI_BERSAMA',
    decree: 'SKB 3 Menteri No. 1497/2025',
    isRedDate: true,
  },
  {
    date: '2026-04-03',
    name: 'Wafat Yesus Kristus',
    year: 2026,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1497/2025',
    isRedDate: true,
  },
  {
    date: '2026-04-05',
    name: 'Hari Kebangkitan Yesus Kristus (Paskah)',
    year: 2026,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1497/2025',
    isRedDate: true,
  },
  {
    date: '2026-05-01',
    name: 'Hari Buruh Internasional',
    year: 2026,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1497/2025',
    isRedDate: true,
  },
  {
    date: '2026-05-14',
    name: 'Kenaikan Yesus Kristus',
    year: 2026,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1497/2025',
    isRedDate: true,
  },
  {
    date: '2026-05-15',
    name: 'Cuti Bersama Kenaikan Yesus Kristus',
    year: 2026,
    category: 'CUTI_BERSAMA',
    decree: 'SKB 3 Menteri No. 1497/2025',
    isRedDate: true,
  },
  {
    date: '2026-05-27',
    name: 'Hari Raya Iduladha 1447 Hijriah',
    year: 2026,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1497/2025',
    isRedDate: true,
  },
  {
    date: '2026-05-28',
    name: 'Cuti Bersama Hari Raya Iduladha 1447 Hijriah',
    year: 2026,
    category: 'CUTI_BERSAMA',
    decree: 'SKB 3 Menteri No. 1497/2025',
    isRedDate: true,
  },
  {
    date: '2026-05-31',
    name: 'Hari Raya Waisak 2570 BE',
    year: 2026,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1497/2025',
    isRedDate: true,
  },
  {
    date: '2026-06-01',
    name: 'Hari Lahir Pancasila',
    year: 2026,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1497/2025',
    isRedDate: true,
  },
  {
    date: '2026-06-16',
    name: '1 Muharam Tahun Baru Islam 1448 Hijriah',
    year: 2026,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1497/2025',
    isRedDate: true,
  },
  {
    date: '2026-06-22',
    name: 'Libur Akhir Semester Genap Madrasah TA 2025/2026',
    year: 2026,
    category: 'KALDIK_KEMENAG',
    decree: 'KEPDIRJEN Pendis No. 4261/2025',
    isRedDate: true,
    notes: 'Libur akhir tahun pelajaran madrasah menuju TA 2026/2027.',
  },
  {
    date: '2026-07-13',
    name: 'Awal Tahun Ajaran Baru Madrasah TA 2026/2027',
    year: 2026,
    category: 'KALDIK_KEMENAG',
    decree: 'KEPDIRJEN Pendis No. 4860/2026',
    isRedDate: false,
    notes: 'Hari pertama masuk madrasah Semester Ganjil & MATSAMA.',
  },
  {
    date: '2026-08-17',
    name: 'Proklamasi Kemerdekaan Republik Indonesia ke-81',
    year: 2026,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1497/2025',
    isRedDate: true,
  },
  {
    date: '2026-08-25',
    name: 'Maulid Nabi Muhammad SAW 1448 H',
    year: 2026,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1497/2025',
    isRedDate: true,
  },
  {
    date: '2026-10-22',
    name: 'Hari Santri Nasional (HSN)',
    year: 2026,
    category: 'KALDIK_KEMENAG',
    decree: 'KEPDIRJEN Pendis No. 4860/2026',
    isRedDate: false,
    notes: 'Peringatan Hari Santri Nasional di lingkungan madrasah.',
  },
  {
    date: '2026-12-21',
    name: 'Libur Semester Ganjil Madrasah TA 2026/2027',
    year: 2026,
    category: 'KALDIK_KEMENAG',
    decree: 'KEPDIRJEN Pendis No. 4860/2026',
    isRedDate: true,
    notes: 'Libur semester ganjil madrasah (21 Des 2026 – 2 Jan 2027).',
  },
  {
    date: '2026-12-24',
    name: 'Cuti Bersama Kelahiran Yesus Kristus',
    year: 2026,
    category: 'CUTI_BERSAMA',
    decree: 'SKB 3 Menteri No. 1497/2025',
    isRedDate: true,
  },
  {
    date: '2026-12-25',
    name: 'Kelahiran Yesus Kristus (Hari Natal)',
    year: 2026,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1497/2025',
    isRedDate: true,
  },

  // =========================================================================
  // TAHUN 2027 — SKB 3 MENTERI NO. 1205/2026 & KALDIK KEMENAG PENDIS
  // =========================================================================
  {
    date: '2027-01-01',
    name: 'Tahun Baru 2027 Masehi',
    year: 2027,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1205/2026',
    isRedDate: true,
  },
  {
    date: '2027-01-03',
    name: 'Hari Amal Bakti (HAB) Kementerian Agama RI ke-81',
    year: 2027,
    category: 'KALDIK_KEMENAG',
    decree: 'KEPDIRJEN Pendis No. 4860/2026',
    isRedDate: false,
    notes: 'Peringatan resmi Hari Amal Bakti Kemenag RI.',
  },
  {
    date: '2027-01-04',
    name: 'Hari Pertama Masuk Semester Genap TA 2026/2027',
    year: 2027,
    category: 'KALDIK_KEMENAG',
    decree: 'KEPDIRJEN Pendis No. 4860/2026',
    isRedDate: false,
    notes: 'Pembelajaran efektif awal Semester Genap Madrasah.',
  },
  {
    date: '2027-01-05',
    name: 'Isra Mikraj Nabi Muhammad SAW 1448 H',
    year: 2027,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1205/2026',
    isRedDate: true,
  },
  {
    date: '2027-02-05',
    name: 'Cuti Bersama Tahun Baru Imlek 2578 Kongzili',
    year: 2027,
    category: 'CUTI_BERSAMA',
    decree: 'SKB 3 Menteri No. 1205/2026',
    isRedDate: true,
  },
  {
    date: '2027-02-06',
    name: 'Tahun Baru Imlek 2578 Kongzili',
    year: 2027,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1205/2026',
    isRedDate: true,
  },
  {
    date: '2027-02-08',
    name: 'Perkiraan Libur Awal Ramadhan 1448 H (Kaldik Madrasah)',
    year: 2027,
    category: 'KALDIK_KEMENAG',
    decree: 'KEPDIRJEN Pendis No. 4860/2026',
    isRedDate: true,
    notes: 'Penyesuaian KBM awal Ramadhan sesuai ketetapan Kemenag.',
  },
  {
    date: '2027-03-08',
    name: 'Hari Suci Nyepi (Tahun Baru Saka 1949)',
    year: 2027,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1205/2026',
    isRedDate: true,
  },
  {
    date: '2027-03-09',
    name: 'Cuti Bersama Idulfitri 1448 Hijriah',
    year: 2027,
    category: 'CUTI_BERSAMA',
    decree: 'SKB 3 Menteri No. 1205/2026',
    isRedDate: true,
  },
  {
    date: '2027-03-10',
    name: 'Hari Raya Idulfitri 1448 Hijriah (Hari Pertama)',
    year: 2027,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1205/2026',
    isRedDate: true,
  },
  {
    date: '2027-03-11',
    name: 'Hari Raya Idulfitri 1448 Hijriah (Hari Kedua)',
    year: 2027,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1205/2026',
    isRedDate: true,
  },
  {
    date: '2027-03-12',
    name: 'Cuti Bersama Idulfitri 1448 Hijriah',
    year: 2027,
    category: 'CUTI_BERSAMA',
    decree: 'SKB 3 Menteri No. 1205/2026',
    isRedDate: true,
  },
  {
    date: '2027-03-15',
    name: 'Cuti Bersama Idulfitri 1448 Hijriah',
    year: 2027,
    category: 'CUTI_BERSAMA',
    decree: 'SKB 3 Menteri No. 1205/2026',
    isRedDate: true,
  },
  {
    date: '2027-03-25',
    name: 'Cuti Bersama Wafat Yesus Kristus',
    year: 2027,
    category: 'CUTI_BERSAMA',
    decree: 'SKB 3 Menteri No. 1205/2026',
    isRedDate: true,
  },
  {
    date: '2027-03-26',
    name: 'Wafat Yesus Kristus',
    year: 2027,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1205/2026',
    isRedDate: true,
  },
  {
    date: '2027-03-28',
    name: 'Hari Kebangkitan Yesus Kristus (Paskah)',
    year: 2027,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1205/2026',
    isRedDate: true,
  },
  {
    date: '2027-05-01',
    name: 'Hari Buruh Internasional',
    year: 2027,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1205/2026',
    isRedDate: true,
  },
  {
    date: '2027-05-06',
    name: 'Kenaikan Yesus Kristus',
    year: 2027,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1205/2026',
    isRedDate: true,
  },
  {
    date: '2027-05-17',
    name: 'Hari Raya Iduladha 1448 Hijriah',
    year: 2027,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1205/2026',
    isRedDate: true,
  },
  {
    date: '2027-05-18',
    name: 'Cuti Bersama Hari Raya Iduladha 1448 Hijriah',
    year: 2027,
    category: 'CUTI_BERSAMA',
    decree: 'SKB 3 Menteri No. 1205/2026',
    isRedDate: true,
  },
  {
    date: '2027-05-19',
    name: 'Cuti Bersama Hari Raya Waisak 2571 BE',
    year: 2027,
    category: 'CUTI_BERSAMA',
    decree: 'SKB 3 Menteri No. 1205/2026',
    isRedDate: true,
  },
  {
    date: '2027-05-20',
    name: 'Hari Raya Waisak 2571 BE',
    year: 2027,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1205/2026',
    isRedDate: true,
  },
  {
    date: '2027-06-01',
    name: 'Hari Lahir Pancasila',
    year: 2027,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1205/2026',
    isRedDate: true,
  },
  {
    date: '2027-06-06',
    name: '1 Muharam Tahun Baru Islam 1449 Hijriah',
    year: 2027,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1205/2026',
    isRedDate: true,
  },
  {
    date: '2027-06-21',
    name: 'Libur Akhir Semester Genap Madrasah TA 2026/2027',
    year: 2027,
    category: 'KALDIK_KEMENAG',
    decree: 'KEPDIRJEN Pendis No. 4860/2026',
    isRedDate: true,
    notes: 'Libur akhir semester genap madrasah.',
  },
  {
    date: '2027-08-15',
    name: 'Maulid Nabi Muhammad SAW 1449 H',
    year: 2027,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1205/2026',
    isRedDate: true,
  },
  {
    date: '2027-08-17',
    name: 'Proklamasi Kemerdekaan Republik Indonesia ke-82',
    year: 2027,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1205/2026',
    isRedDate: true,
  },
  {
    date: '2027-10-22',
    name: 'Hari Santri Nasional (HSN)',
    year: 2027,
    category: 'KALDIK_KEMENAG',
    decree: 'Kaldik Kemenag RI',
    isRedDate: false,
    notes: 'Peringatan Hari Santri Nasional di lingkungan madrasah.',
  },
  {
    date: '2027-12-24',
    name: 'Cuti Bersama Kelahiran Yesus Kristus',
    year: 2027,
    category: 'CUTI_BERSAMA',
    decree: 'SKB 3 Menteri No. 1205/2026',
    isRedDate: true,
  },
  {
    date: '2027-12-25',
    name: 'Kelahiran Yesus Kristus (Hari Natal)',
    year: 2027,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1205/2026',
    isRedDate: true,
  },
  {
    date: '2027-12-26',
    name: 'Isra Mikraj Nabi Muhammad SAW 1449 H',
    year: 2027,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri No. 1205/2026',
    isRedDate: true,
  },

  // =========================================================================
  // TAHUN 2028 — SKB 3 MENTERI & KALDIK KEMENAG RI (TA 2027/2028 – 2028/2029)
  // =========================================================================
  {
    date: '2028-01-01',
    name: 'Tahun Baru 2028 Masehi',
    year: 2028,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri (Proyeksi Resmi 2028)',
    isRedDate: true,
  },
  {
    date: '2028-01-26',
    name: 'Tahun Baru Imlek 2579 Kongzili',
    year: 2028,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri (Proyeksi Resmi 2028)',
    isRedDate: true,
  },
  {
    date: '2028-01-28',
    name: 'Libur Awal Puasa Ramadan 1449 H (Kemenag)',
    year: 2028,
    category: 'KALDIK_KEMENAG',
    decree: 'Kaldik Kemenag RI TA 2027/2028',
    isRedDate: true,
    notes: 'Penyesuaian awal pembelajaran bulan Ramadan madrasah.',
  },
  {
    date: '2028-02-26',
    name: 'Hari Raya Idulfitri 1449 Hijriah (Hari 1)',
    year: 2028,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri (Proyeksi Resmi 2028)',
    isRedDate: true,
  },
  {
    date: '2028-02-27',
    name: 'Hari Raya Idulfitri 1449 Hijriah (Hari 2)',
    year: 2028,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri (Proyeksi Resmi 2028)',
    isRedDate: true,
  },
  {
    date: '2028-02-28',
    name: 'Cuti Bersama Idulfitri 1449 H',
    year: 2028,
    category: 'CUTI_BERSAMA',
    decree: 'SKB 3 Menteri (Proyeksi Resmi 2028)',
    isRedDate: true,
  },
  {
    date: '2028-02-29',
    name: 'Cuti Bersama Idulfitri 1449 H',
    year: 2028,
    category: 'CUTI_BERSAMA',
    decree: 'SKB 3 Menteri (Proyeksi Resmi 2028)',
    isRedDate: true,
  },
  {
    date: '2028-03-26',
    name: 'Hari Suci Nyepi Tahun Baru Saka 1950',
    year: 2028,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri (Proyeksi Resmi 2028)',
    isRedDate: true,
  },
  {
    date: '2028-04-14',
    name: 'Wafat Yesus Kristus',
    year: 2028,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri (Proyeksi Resmi 2028)',
    isRedDate: true,
  },
  {
    date: '2028-04-16',
    name: 'Kebangkitan Yesus Kristus (Hari Paskah)',
    year: 2028,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri (Proyeksi Resmi 2028)',
    isRedDate: true,
  },
  {
    date: '2028-05-01',
    name: 'Hari Buruh Internasional',
    year: 2028,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri (Proyeksi Resmi 2028)',
    isRedDate: true,
  },
  {
    date: '2028-05-05',
    name: 'Hari Raya Iduladha 1449 Hijriah',
    year: 2028,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri (Proyeksi Resmi 2028)',
    isRedDate: true,
  },
  {
    date: '2028-05-09',
    name: 'Hari Raya Waisak 2572 BE',
    year: 2028,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri (Proyeksi Resmi 2028)',
    isRedDate: true,
  },
  {
    date: '2028-05-25',
    name: 'Kenaikan Yesus Kristus & 1 Muharam 1450 H',
    year: 2028,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri (Proyeksi Resmi 2028)',
    isRedDate: true,
  },
  {
    date: '2028-06-01',
    name: 'Hari Lahir Pancasila',
    year: 2028,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri (Proyeksi Resmi 2028)',
    isRedDate: true,
  },
  {
    date: '2028-06-19',
    name: 'Libur Akhir Semester Genap Madrasah TA 2027/2028',
    year: 2028,
    category: 'KALDIK_KEMENAG',
    decree: 'Kaldik Kemenag RI TA 2027/2028',
    isRedDate: true,
    notes: 'Libur akhir semester genap madrasah.',
  },
  {
    date: '2028-08-03',
    name: 'Maulid Nabi Muhammad SAW 1450 H',
    year: 2028,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri (Proyeksi Resmi 2028)',
    isRedDate: true,
  },
  {
    date: '2028-08-17',
    name: 'Proklamasi Kemerdekaan Republik Indonesia ke-83',
    year: 2028,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri (Proyeksi Resmi 2028)',
    isRedDate: true,
  },
  {
    date: '2028-10-22',
    name: 'Hari Santri Nasional (HSN)',
    year: 2028,
    category: 'KALDIK_KEMENAG',
    decree: 'Kaldik Kemenag RI',
    isRedDate: false,
    notes: 'Peringatan Hari Santri Nasional di lingkungan madrasah.',
  },
  {
    date: '2028-12-14',
    name: 'Isra Mikraj Nabi Muhammad SAW 1450 H',
    year: 2028,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri (Proyeksi Resmi 2028)',
    isRedDate: true,
  },
  {
    date: '2028-12-18',
    name: 'Libur Semester Ganjil Madrasah TA 2028/2029',
    year: 2028,
    category: 'KALDIK_KEMENAG',
    decree: 'Kaldik Kemenag RI TA 2028/2029',
    isRedDate: true,
    notes: 'Libur pergantian semester ganjil madrasah.',
  },
  {
    date: '2028-12-25',
    name: 'Kelahiran Yesus Kristus (Hari Natal)',
    year: 2028,
    category: 'NASIONAL',
    decree: 'SKB 3 Menteri (Proyeksi Resmi 2028)',
    isRedDate: true,
  },
  {
    date: '2028-12-26',
    name: 'Cuti Bersama Hari Natal',
    year: 2028,
    category: 'CUTI_BERSAMA',
    decree: 'SKB 3 Menteri (Proyeksi Resmi 2028)',
    isRedDate: true,
  },
];

export const AVAILABLE_HOLIDAY_YEARS = [2025, 2026, 2027, 2028] as const;

export function getOfficialEventsForYear(year: number): OfficialCalendarEvent[] {
  return OFFICIAL_CALENDAR_EVENTS.filter((e) => e.year === year).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

export function getOfficialEventsForMonth(yearMonth: string): OfficialCalendarEvent[] {
  return OFFICIAL_CALENDAR_EVENTS.filter((e) => e.date.startsWith(yearMonth)).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

export function getOfficialEventByDate(dateStr: string): OfficialCalendarEvent | undefined {
  // Prioritize NASIONAL > CUTI_BERSAMA > KALDIK_KEMENAG if multiple fall on the same date
  const matches = OFFICIAL_CALENDAR_EVENTS.filter((e) => e.date === dateStr);
  if (matches.length === 0) return undefined;
  return (
    matches.find((m) => m.category === 'NASIONAL') ??
    matches.find((m) => m.category === 'CUTI_BERSAMA') ??
    matches[0]
  );
}

export function isOfficialRedDate(
  dateStr: string,
  options: { includeCutiBersama?: boolean; includeKaldikLibur?: boolean } = {},
): OfficialCalendarEvent | undefined {
  const { includeCutiBersama = true, includeKaldikLibur = false } = options;
  const matches = OFFICIAL_CALENDAR_EVENTS.filter((e) => e.date === dateStr && e.isRedDate);
  for (const m of matches) {
    if (m.category === 'NASIONAL') return m;
    if (m.category === 'CUTI_BERSAMA' && includeCutiBersama) return m;
    if (m.category === 'KALDIK_KEMENAG' && includeKaldikLibur) return m;
  }
  return undefined;
}

/**
 * Menghitung hari efektif KBM dalam rentang [startDate .. endDate]
 * dengan melewati hari Minggu, hari libur madrasah terdaftar,
 * serta otomatis mengecualikan tanggal merah / Libur Nasional SKB 3 Menteri.
 */
export function computeEffectiveAttendanceDates(params: {
  startDate: string;
  endDate: string;
  registeredHolidays: Holiday[];
  includeOfficialRedDates?: boolean;
  includeCutiBersama?: boolean;
  includeKaldikLibur?: boolean;
}): EffectiveRangeSummary {
  const {
    startDate,
    endDate,
    registeredHolidays,
    includeOfficialRedDates = true,
    includeCutiBersama = true,
    includeKaldikLibur = false,
  } = params;

  const empty: EffectiveRangeSummary = {
    totalCalendarDays: 0,
    effectiveDates: [],
    skippedSundays: [],
    skippedRegisteredHolidays: [],
    skippedOfficialHolidays: [],
  };

  if (!startDate || !endDate || startDate > endDate) {
    return empty;
  }

  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  if (!sy || !sm || !sd || !ey || !em || !ed) return empty;

  // Use UTC calendar date iteration so there is never a local timezone day-shift
  const cursor = new Date(Date.UTC(sy, sm - 1, sd));
  const endUtc = new Date(Date.UTC(ey, em - 1, ed));

  const effectiveDates: string[] = [];
  const skippedSundays: string[] = [];
  const skippedRegisteredHolidays: Array<{ date: string; name: string }> = [];
  const skippedOfficialHolidays: OfficialCalendarEvent[] = [];
  let totalCalendarDays = 0;

  while (cursor.getTime() <= endUtc.getTime()) {
    totalCalendarDays++;
    const yyyy = cursor.getUTCFullYear();
    const mm = String(cursor.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(cursor.getUTCDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const dayOfWeek = cursor.getUTCDay(); // 0 = Sunday

    const manualHol = registeredHolidays.find((h) => h.date === dateStr);
    const officialHol = includeOfficialRedDates
      ? isOfficialRedDate(dateStr, { includeCutiBersama, includeKaldikLibur })
      : undefined;

    if (dayOfWeek === 0) {
      skippedSundays.push(dateStr);
    } else if (manualHol) {
      skippedRegisteredHolidays.push({ date: dateStr, name: manualHol.name });
    } else if (officialHol) {
      skippedOfficialHolidays.push(officialHol);
    } else {
      effectiveDates.push(dateStr);
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return {
    totalCalendarDays,
    effectiveDates,
    skippedSundays,
    skippedRegisteredHolidays,
    skippedOfficialHolidays,
  };
}
