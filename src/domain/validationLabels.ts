import type { ValidationIssue } from './types';

export type ValidationCategoryGroup = 'teacher' | 'class' | 'time' | 'allocation';

const CODE_LABEL_MAP: Record<string, string> = {
  'HC-UNKNOWN-CLASS': 'Data Kelas',
  'HC-UNKNOWN-TEACHER': 'Data Guru',
  'HC-UNKNOWN-SUBJECT': 'Data Mapel',
  'HC-INVALID-SLOT': 'Struktur Slot KBM',
  'HC-TEACHER-UNAVAILABLE-DAY': 'Hari Mengajar Guru',
  'HC-DAILY-LIMIT': 'Batas JP Harian',
  'HC-TEACHER-QUALIFICATION': 'Kualifikasi Guru',
  'HC-CLASS-COLLISION': 'Bentrok Kelas',
  'HC-TEACHER-COLLISION': 'Bentrok Guru',
  'HC-TEACHER-WEEKLY-LIMIT': 'Beban Mingguan Guru',
  'HC-SUBJECT-BLOCK-OVERFLOW': 'Panjang Blok Mapel',
  'HC-THREE-JP-BLOCK-LIMIT': 'Batas Blok 3 JP',
  'HC-MULTISUBJECT-POST-BREAK': 'Jeda Guru Multimapel',
  'HC-REQUIREMENT-COVERAGE': 'Pemenuhan Alokasi JP',
  'HC-UNALLOCATED-ENTRY': 'Penempatan Tanpa Alokasi',
  'HC-SUBJECT-COVERAGE': 'Kelengkapan Mapel',
  'SC-NO-DOUBLE-BLOCK': 'Preferensi Blok 2 JP',
  'DATA-CLASS-LIMIT': 'Skala Rombel Aktif',
  'DATA-NO-CLASSES': 'Rombel Belum Aktif',
  'DATA-NO-DAYS': 'Hari Aktif KBM',
  'DATA-CLASS-DEMAND-CAPACITY': 'Kapasitas Rombel',
  'DATA-CLASS-NO-DEMAND': 'Alokasi Rombel Kosong',
  'DATA-INVALID-REQUIREMENT-REFERENCE': 'Referensi Alokasi',
  'DATA-UNQUALIFIED-ALLOCATION': 'Kualifikasi Pengampu',
  'DATA-INVALID-JP': 'Nominal JP Alokasi',
  'DATA-TEACHER-LOAD-OVER': 'Beban Maksimal Guru',
  'DATA-TEACHER-UNAVAILABLE-DAYS': 'Hari Siap Mengajar',
  'DATA-TEACHER-DAY-CAPACITY': 'Kapasitas Hari Guru',
};

export function formatValidationCategoryLabel(code: string): string {
  if (CODE_LABEL_MAP[code]) return CODE_LABEL_MAP[code];
  if (code.startsWith('HC-TEACHER') || code.includes('MULTISUBJECT')) return 'Aturan Guru';
  if (code.startsWith('HC-CLASS') || code.includes('BLOCK')) return 'Aturan Kelas & Blok';
  if (code.startsWith('SC-')) return 'Saran Optimalisasi';
  if (code.startsWith('DATA-')) return 'Data Master & Alokasi';
  return 'Aturan Jadwal';
}

export function getValidationCategoryGroup(issue: ValidationIssue): ValidationCategoryGroup {
  const code = issue.code;
  if (
    code.includes('TEACHER-COLLISION') ||
    code.includes('TEACHER-WEEKLY-LIMIT') ||
    code.includes('TEACHER-LOAD') ||
    code.includes('MULTISUBJECT') ||
    code.includes('UNKNOWN-TEACHER')
  ) {
    return 'teacher';
  }
  if (
    code.includes('CLASS-COLLISION') ||
    code.includes('SUBJECT-BLOCK') ||
    code.includes('THREE-JP-BLOCK') ||
    code.includes('NO-DOUBLE-BLOCK') ||
    code.includes('UNKNOWN-CLASS')
  ) {
    return 'class';
  }
  if (
    code.includes('INVALID-SLOT') ||
    code.includes('DAILY-LIMIT') ||
    code.includes('UNAVAILABLE') ||
    code.includes('DAY-CAPACITY') ||
    code.includes('NO-DAYS') ||
    code.includes('BLOCKED-ACTIVITY')
  ) {
    return 'time';
  }
  return 'allocation';
}

export function getTargetScreenForIssue(
  issue: ValidationIssue,
): 'schedule' | 'requirements' | 'master' | 'settings' {
  if (issue.targetScreen) return issue.targetScreen;
  if (issue.targetSlot) return 'schedule';
  const code = issue.code;
  if (code.includes('COLLISION') || code.includes('SLOT') || code.includes('BLOCK') || code.includes('MULTISUBJECT')) {
    return 'schedule';
  }
  if (code.includes('REQUIREMENT') || code.includes('DEMAND') || code.includes('LOAD-OVER') || code.includes('UNALLOCATED')) {
    return 'requirements';
  }
  if (code.includes('NO-DAYS') || code.includes('CLASS-LIMIT')) {
    return 'settings';
  }
  return 'master';
}

export function getActionLabelForIssue(issue: ValidationIssue): string {
  if (issue.targetSlot) return 'Sorot di Jadwal';
  const screen = getTargetScreenForIssue(issue);
  switch (screen) {
    case 'schedule':
      return 'Buka Jadwal';
    case 'requirements':
      return 'Perbaiki di Kebutuhan JP';
    case 'settings':
      return 'Buka Pengaturan';
    case 'master':
    default:
      return 'Perbaiki di Data Master';
  }
}
