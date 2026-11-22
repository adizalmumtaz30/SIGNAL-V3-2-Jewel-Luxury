import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { AppState, ScheduleEntry, SchoolClass } from '../domain/types';
import {
  computeRangeAttendanceRecap,
  formatMonthShortYear,
} from '../domain/attendanceRecap';
import { getTimelineRows, isSlotBlocked, jpToAstronomical } from '../domain/time';
import {
  OFFICIAL_KOP_ASPECT_RATIO,
  resolveEffectiveKopData,
} from '../domain/kopIdentity';
import {
  getDefaultMadrasahLogo,
  getOfficialKopBannerDataUrl,
} from './madrasahLogo';
import { groupClassesForMasterMatrix } from './matrixGrouping';

// Color palette matching SAKALA branding
const TEAL = [11, 52, 53] as [number, number, number]; // #0b3435
const TEAL_LIGHT = [235, 244, 240] as [number, number, number];
const GOLD = [188, 148, 94] as [number, number, number]; // #bc945e
const INK = [23, 54, 55] as [number, number, number];
const MUTED = [117, 133, 130] as [number, number, number];

export interface OfficialDocCustomTexts {
  // Kop Surat Overrides
  kopSurat?: boolean;
  includeKop?: boolean;
  ministry?: string;
  regionalOffice?: string;
  legalDecree?: string;
  accreditation?: string;
  districtOffice?: string;
  schoolName?: string;
  nsm?: string;
  npsn?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  website?: string;
  logoUrl?: string;
  kopMode?: 'structured' | 'image';
  kopImageUrl?: string;

  // Document Title & Heading Overrides
  documentTitle?: string;
  academicYear?: string;
  semester?: string;
  extraNotes?: string;

  // Signature Block Overrides
  signerCity?: string;
  signerDate?: string;
  principalTitle?: string;
  principalName?: string;
  principalNip?: string;
  coordinatorTitle?: string;
  coordinatorName?: string;
  coordinatorNip?: string;
  officerTitle?: string;
  officerName?: string;
  officerNip?: string;
  leftTitle?: string;
  leftName?: string;
  leftNip?: string;
  rightTitle?: string;
  rightName?: string;
  rightNip?: string;
}

export type PaperSize = 'a4' | 'f4';

/**
 * Returns exact dimensions in millimeters for supported paper sizes:
 * - A4: 210 x 297 mm
 * - F4 / Folio (Indonesia standard): 215 x 330 mm
 */
export function getPaperDimensions(
  paperSize: PaperSize = 'a4',
  orientation: 'landscape' | 'portrait' = 'landscape',
): [number, number] {
  if (paperSize === 'f4') {
    return orientation === 'landscape' ? [330, 215] : [215, 330];
  }
  return orientation === 'landscape' ? [297, 210] : [210, 297];
}

/**
 * Creates a calibrated jsPDF instance configured for A4 or F4 with landscape/portrait
 */
export function createJsPDFDocument(
  orientation: 'landscape' | 'portrait' = 'landscape',
  paperSize: PaperSize = 'a4',
): jsPDF {
  const format = getPaperDimensions(paperSize, orientation);
  return new jsPDF({
    orientation,
    unit: 'mm',
    format,
  });
}

/**
 * Convert CSS Hex color string to [R, G, B] tuple
 */
export function hexToRgb(hex: string): [number, number, number] {
  let c = hex.replace('#', '').trim();
  if (c.length === 3) {
    c = c.split('').map((char) => char + char).join('');
  }
  const num = parseInt(c, 16);
  if (isNaN(num)) return [240, 244, 242];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/**
 * Produces soft, high-contrast, easily printable pastel tints for table cells.
 * Tested for both crisp color laser printing and grayscale clarity.
 */
export function getPrintableCellColor(hex: string): { bg: [number, number, number]; text: [number, number, number] } {
  const [r, g, b] = hexToRgb(hex);
  // Blend with white: 20% hue, 80% white for high legibility
  const bgR = Math.round(r * 0.20 + 255 * 0.80);
  const bgG = Math.round(g * 0.20 + 255 * 0.80);
  const bgB = Math.round(b * 0.20 + 255 * 0.80);

  // Deep contrasting text tone from darker shade of the subject
  const textR = Math.round(r * 0.50);
  const textG = Math.round(g * 0.50);
  const textB = Math.round(b * 0.50);

  return { bg: [bgR, bgG, bgB], text: [textR, textG, textB] };
}

/**
 * Common abbreviations for Indonesian school subjects to optimize print table space
 */
export function compactSubjectName(fullName: string, code?: string): string {
  if (!fullName) return code || '—';
  const trimmed = fullName.trim();

  const knownMap: Record<string, string> = {
    'Al-Qur\'an Hadis': 'Al-Qur\'an',
    'Al-Qur’an Hadis': 'Al-Qur\'an',
    'Al-Qur\'an Hadits': 'Al-Qur\'an',
    'Akidah Akhlak': 'Akidah',
    'Aqidah Akhlak': 'Akidah',
    'Sejarah Kebudayaan Islam': 'SKI',
    'Pendidikan Agama Islam': 'PAI',
    'Pendidikan Agama Islam dan Budi Pekerti': 'PAI & BP',
    'Pendidikan Pancasila': 'P. Pancasila',
    'Pendidikan Pancasila dan Kewarganegaraan': 'PPKn',
    'Pendidikan Kewarganegaraan': 'PKn',
    'Bahasa Indonesia': 'B. Indo',
    'Bahasa Inggris': 'B. Ingg',
    'Bahasa Arab': 'B. Arab',
    'Bahasa Jawa': 'B. Jawa',
    'Matematika': 'Matematika',
    'Ilmu Pengetahuan Alam': 'IPA',
    'Ilmu Pengetahuan Sosial': 'IPS',
    'Pendidikan Jasmani, Olahraga, dan Kesehatan': 'PJOK',
    'Pendidikan Jasmani Olahraga dan Kesehatan': 'PJOK',
    'Pendidikan Jasmani dan Kesehatan': 'Penjasorkes',
    'Teknologi Informasi dan Komunikasi': 'Informatika',
    'Informatika': 'Informatika',
    'Seni Budaya dan Keterampilan': 'Seni Budaya',
    'Seni Budaya': 'Seni Budaya',
    'Bimbingan dan Konseling': 'BK',
    'Bimbingan Konseling': 'BK',
    'Prakarya dan Kewirausahaan': 'Prakarya',
    'Prakarya': 'Prakarya',
    'Fikih': 'Fikih',
    'Fiqih': 'Fikih',
    'Tahfiz': 'Tahfiz',
    'Tahfidz': 'Tahfiz',
    'Ke-NU-an / Aswaja': 'Aswaja',
    'Aswaja': 'Aswaja',
  };

  for (const [key, val] of Object.entries(knownMap)) {
    if (trimmed.toLowerCase() === key.toLowerCase()) return val;
  }

  if (trimmed.startsWith('Bahasa ')) {
    return 'B. ' + trimmed.slice(7);
  }
  if (trimmed.length > 14 && code) {
    return code;
  }
  return trimmed;
}

/**
 * Compact teacher name for dense schedule cells:
 * e.g. "H. Ahmad Fauzi, S.Ag., M.Pd.I." -> "A. Fauzi"
 */
export function compactTeacherName(fullName: string, code?: string): string {
  if (!fullName) return code || '—';
  const trimmed = fullName.trim();
  // Strip trailing academic degrees
  const nameWithoutDegrees = trimmed.split(',')[0].trim();
  const parts = nameWithoutDegrees.split(/\s+/).filter(Boolean);
  if (parts.length > 2) {
    // Abbreviate first name if multiple words: "Ahmad Fauzi Ridwan" -> "A. Fauzi Ridwan"
    return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
  }
  return nameWithoutDegrees;
}

/**
 * Render Official Kop Surat Madrasah (Formal Letterhead)
 * Includes Ministry, Regional Office, Madrasah Name, NSM, NPSN, Address, Contacts, and Official Logo.
 * Fully supports live text overrides and compact layout for single-page documents.
 */
export function renderOfficialKopSurat(
  doc: jsPDF,
  state: AppState,
  startY = 10,
  overrides?: Partial<OfficialDocCustomTexts>,
  isCompact = false,
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const s = state.settings;
  const kop = resolveEffectiveKopData(s, overrides);
  const marginX = 12;
  const usableWidth = pageWidth - marginX * 2;

  // Mode 1: Full-width Official Kop Banner Image (when kopMode === 'image' & PNG data URL is ready)
  if (kop.kopMode === 'image') {
    const bannerData = getOfficialKopBannerDataUrl(kop.kopImageUrl);
    if (bannerData) {
      try {
        const naturalHeightMm = usableWidth / OFFICIAL_KOP_ASPECT_RATIO;
        const maxBannerHeight = isCompact ? 26 : 44;
        const drawHeight = Math.min(naturalHeightMm, maxBannerHeight);
        const drawWidth = Math.min(usableWidth, drawHeight * OFFICIAL_KOP_ASPECT_RATIO);
        const drawX = marginX + (usableWidth - drawWidth) / 2;
        doc.addImage(bannerData, 'PNG', drawX, startY, drawWidth, drawHeight);
        return startY + drawHeight + (isCompact ? 3.5 : 5);
      } catch (e) {
        console.warn('Could not render full Kop banner image to PDF, falling back to structured Kop:', e);
      }
    }
  }

  // Mode 2: Structured Official Letterhead matching the uploaded MTs Daruttafsir Al-Husaini layout 1:1
  const logoData = kop.logoUrl || getDefaultMadrasahLogo();
  const logoSize = isCompact ? 18.5 : 27; // mm
  const logoX = marginX + (isCompact ? 1 : 2);
  const logoY = startY + (isCompact ? 0.5 : 1);

  if (logoData) {
    try {
      const imgFmt = /^data:image\/jpeg/i.test(logoData)
        ? 'JPEG'
        : /^data:image\/webp/i.test(logoData)
        ? 'WEBP'
        : 'PNG';
      doc.addImage(logoData, imgFmt, logoX, logoY, logoSize, logoSize * 0.97);
    } catch (e) {
      console.warn('Could not render logo to PDF:', e);
    }
  }

  const textLeft = logoX + logoSize + (isCompact ? 3 : 5);
  const textRight = pageWidth - marginX;
  const textCenter = (textLeft + textRight) / 2;

  let y = startY + (isCompact ? 3.2 : 4.6);

  // 1 & 2. Judul Madrasah (2 baris Times Bold Besar — sesuai gambar Kop resmi)
  doc.setFont('times', 'bold');
  doc.setFontSize(isCompact ? 11.2 : 16);
  doc.setTextColor(0, 0, 0);
  doc.text(kop.titleLine1, textCenter, y, { align: 'center' });

  if (kop.titleLine2) {
    y += isCompact ? 4.1 : 5.8;
    doc.text(kop.titleLine2, textCenter, y, { align: 'center' });
  }

  // 3. Nama Yayasan / Lembaga Menaungi
  if (kop.foundationLine) {
    y += isCompact ? 3.2 : 4.5;
    doc.setFont('times', 'bold');
    doc.setFontSize(isCompact ? 8.4 : 11.2);
    doc.setTextColor(12, 12, 12);
    doc.text(kop.foundationLine, textCenter, y, { align: 'center' });
  }

  // 4. Akte Notaris / Kankemenag
  if (kop.notaryLine) {
    y += isCompact ? 2.7 : 3.7;
    doc.setFont('times', 'normal');
    doc.setFontSize(isCompact ? 7.1 : 9.2);
    doc.setTextColor(18, 18, 18);
    doc.text(kop.notaryLine, textCenter, y, { align: 'center' });
  }

  // 5. Keputusan Menkumham RI / SK Legalitas
  if (kop.decreeLine) {
    y += isCompact ? 2.6 : 3.6;
    doc.setFont('times', 'normal');
    doc.setFontSize(isCompact ? 7.1 : 9.2);
    doc.setTextColor(18, 18, 18);
    doc.text(kop.decreeLine, textCenter, y, { align: 'center' });
  }

  // 6. NSM & NPSN
  if (kop.registryLine) {
    y += isCompact ? 2.6 : 3.6;
    doc.setFont('times', 'normal');
    doc.setFontSize(isCompact ? 7.3 : 9.4);
    doc.setTextColor(18, 18, 18);
    doc.text(kop.registryLine, textCenter, y, { align: 'center' });
  }

  // 7. Status Akreditasi (Bold)
  if (kop.accreditationLine) {
    y += isCompact ? 2.7 : 3.7;
    doc.setFont('times', 'bold');
    doc.setFontSize(isCompact ? 7.6 : 9.8);
    doc.setTextColor(0, 0, 0);
    doc.text(kop.accreditationLine.toUpperCase(), textCenter, y, { align: 'center' });
  }

  // Pastikan pita alamat berada di bawah logo maupun teks
  const bandTopY = Math.max(y + (isCompact ? 1.8 : 2.6), logoY + logoSize + (isCompact ? 0.6 : 1.4));

  // Garis atas hitam penuh pita alamat
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(isCompact ? 0.45 : 0.6);
  doc.line(marginX, bandTopY, pageWidth - marginX, bandTopY);

  let bandBottomY = bandTopY;
  if (kop.addressBandLine) {
    const addrTextY = bandTopY + (isCompact ? 3.1 : 4.1);
    doc.setFont('times', 'normal');
    doc.setFontSize(isCompact ? 7.3 : 9.4);
    doc.setTextColor(12, 12, 12);
    doc.text(kop.addressBandLine, pageWidth / 2, addrTextY, { align: 'center' });
    bandBottomY = addrTextY + (isCompact ? 1.4 : 1.9);

    // Garis bawah hitam penuh pita alamat
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(isCompact ? 0.45 : 0.6);
    doc.line(marginX, bandBottomY, pageWidth - marginX, bandBottomY);
  } else {
    bandBottomY = bandTopY + 1.0;
    doc.setLineWidth(0.35);
    doc.line(marginX, bandBottomY, pageWidth - marginX, bandBottomY);
  }

  // Kembalikan font default ke helvetica agar tabel & badan dokumen tetap konsisten
  doc.setFont('helvetica', 'normal');
  return bandBottomY + (isCompact ? 4.2 : 6.0);
}

function addDocHeader(
  doc: jsPDF,
  title: string,
  subtitle: string,
  schoolName: string,
  academicYear: string,
  semester: string,
) {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Top header banner
  doc.setFillColor(...TEAL);
  doc.rect(0, 0, pageWidth, 24, 'F');

  // Gold accent line
  doc.setFillColor(...GOLD);
  doc.rect(0, 24, pageWidth, 2, 'F');

  // Title text inside banner
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('SAKALA · SISTEM PENJADWALAN & PRESENSI', 14, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(220, 235, 230);
  doc.text(`${schoolName.toUpperCase()} — T.A. ${academicYear} (${semester})`, 14, 18);

  // Subtitle / Document Title
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title, 14, 36);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(subtitle, 14, 43);

  // Divider line
  doc.setDrawColor(220, 225, 220);
  doc.setLineWidth(0.5);
  doc.line(14, 46, pageWidth - 14, 46);
}

function addDocFooter(doc: jsPDF, schoolName: string, printMetaText?: string) {
  const pageCount = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(...MUTED);

    // Footer rule
    doc.setDrawColor(220, 228, 224);
    doc.setLineWidth(0.2);
    doc.line(14, pageHeight - 10.5, pageWidth - 14, pageHeight - 10.5);
    const cleanSchool = schoolName || 'Madrasah Tsanawiyah';
    doc.text(cleanSchool, 14, pageHeight - 6);
    if (printMetaText) {
      doc.setFontSize(7.2);
      doc.text(printMetaText, pageWidth / 2, pageHeight - 6, { align: 'center' });
    }
    doc.setFontSize(7.8);
    doc.text(`Halaman ${i} dari ${pageCount}`, pageWidth - 14, pageHeight - 6, { align: 'right' });
  }
}

function formatCleanNip(nip?: string): string {
  const cleaned = (nip ?? '').trim();
  if (!cleaned || /^[.\-—_\s]+$/.test(cleaned)) return '';
  return cleaned;
}

function toTitleCasePreservingAcronyms(text: string): string {
  if (!text) return '';
  if (text !== text.toUpperCase() || text.length <= 6) return text;
  const preserve = new Set(['MTS', 'MA', 'MI', 'SD', 'SMP', 'SMA', 'SMK', 'RI', 'II', 'III', 'IV']);
  return text
    .split(/\s+/)
    .map((word) => {
      const bare = word.replace(/[^A-Z0-9]/g, '');
      if (preserve.has(bare)) return word;
      if (word.includes('-')) {
        return word
          .split('-')
          .map((part) => (part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : ''))
          .join('-');
      }
      return word[0].toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

export function buildRightSignerTitle(principalTitle?: string, schoolName?: string): string {
  const title = (principalTitle ?? '').trim() || 'Kepala Madrasah';
  const rawSchool = (schoolName ?? '').trim();
  if (!rawSchool) return title;
  const formattedSchool = toTitleCasePreservingAcronyms(rawSchool);
  const lowerTitle = title.toLowerCase();
  const lowerSchool = formattedSchool.toLowerCase();
  if (
    lowerTitle.endsWith('madrasah') &&
    (lowerSchool.startsWith('madrasah ') || lowerSchool.startsWith('mts ') || lowerSchool.startsWith('ma ') || lowerSchool.startsWith('mi '))
  ) {
    const prefix = title.slice(0, -'madrasah'.length).trim() || 'Kepala';
    return `${prefix} ${formattedSchool}`;
  }
  return `${title} ${formattedSchool}`;
}

function addSignatureBlock(
  doc: jsPDF,
  state: AppState,
  startY: number,
  customSigners?: {
    city?: string;
    date?: string;
    leftTitle?: string;
    leftName?: string;
    leftNip?: string;
    rightTitle?: string;
    rightName?: string;
    rightNip?: string;
  },
  forceCurrentPage = false,
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const s = state.settings;

  const isLandscape = pageWidth > 250;
  const sigMarginX = 18;
  const sigColWidth = isLandscape ? 88 : 70;
  const leftX = sigMarginX;
  const rightX = pageWidth - sigMarginX - sigColWidth;

  const dateStr =
    customSigners?.date ||
    new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

  const city = customSigners?.city || s.city || 'Kota Madrasah';
  const leftTitle = (customSigners?.leftTitle || s.curriculumLeaderTitle || 'Waka Bidang Kurikulum').trim();
  const leftName = (customSigners?.leftName || s.curriculumLeaderName || 'Ahmad Fauzi, S.Pd.').trim();
  const leftNip = formatCleanNip(customSigners?.leftNip ?? s.curriculumLeaderNip);

  const rightTitle = (
    customSigners?.rightTitle ||
    buildRightSignerTitle(s.headmasterTitle, s.schoolName)
  ).trim();
  const rightName = (customSigners?.rightName || s.headmasterName || 'Drs. H. M. Zainuddin, M.Pd.I').trim();
  const rightNip = formatCleanNip(customSigners?.rightNip ?? s.headmasterNip);

  const bodyFontSize = forceCurrentPage ? 7.4 : 8.0;
  const nipFontSize = forceCurrentPage ? 6.8 : 7.2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(bodyFontSize);

  const leftTitleLines = doc.splitTextToSize(leftTitle, sigColWidth) as string[];
  const rightTitleLines = doc.splitTextToSize(rightTitle, sigColWidth) as string[];
  const maxTitleLines = Math.max(leftTitleLines.length, rightTitleLines.length, 1);
  const titleLineStep = forceCurrentPage ? 3.2 : 3.5;

  let topGap = forceCurrentPage ? 1.8 : 3.8;
  let sigGapAfterTitle = forceCurrentPage ? 8.5 : 11.5;
  const blockCoreHeight = 3.8 + maxTitleLines * titleLineStep + 4.2;
  const footerLimitY = pageHeight - 11.2;

  let y = startY + topGap;
  if (forceCurrentPage) {
    // Anchor cleanly on current page without overflowing footer
    const totalSigH = blockCoreHeight + sigGapAfterTitle;
    if (y + totalSigH > footerLimitY) {
      sigGapAfterTitle = Math.max(6.2, footerLimitY - y - blockCoreHeight);
      if (y + blockCoreHeight + sigGapAfterTitle > footerLimitY) {
        y = Math.max(startY, footerLimitY - blockCoreHeight - sigGapAfterTitle);
      }
    }
  } else if (y + blockCoreHeight + sigGapAfterTitle > footerLimitY) {
    // Try fitting gracefully on the current page with tighter spacing before spawning an orphan signature page
    const compactTopGap = 1.6;
    const compactSigGap = 8.0;
    if (startY + compactTopGap + blockCoreHeight + compactSigGap <= footerLimitY) {
      topGap = compactTopGap;
      sigGapAfterTitle = compactSigGap;
      y = startY + topGap;
    } else {
      doc.addPage();
      y = 20;
    }
  }

  doc.setTextColor(...INK);

  // Left signature
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(bodyFontSize);
  doc.text('Mengetahui / Memeriksa,', leftX, y);
  doc.setFont('helvetica', 'bold');
  leftTitleLines.forEach((line, idx) => {
    doc.text(line, leftX, y + 3.8 + idx * titleLineStep);
  });

  const nameY = y + 3.8 + maxTitleLines * titleLineStep + sigGapAfterTitle;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(bodyFontSize);
  doc.text(leftName, leftX, nameY);
  const leftNameWidth = Math.min(sigColWidth, doc.getTextWidth(leftName));
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.22);
  doc.line(leftX, nameY + 0.85, leftX + leftNameWidth, nameY + 0.85);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(nipFontSize);
  doc.setTextColor(...MUTED);
  doc.text(leftNip ? `NIP. ${leftNip}` : 'NIP. —', leftX, nameY + 4.2);

  // Right signature
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(bodyFontSize);
  doc.text(`${city}, ${dateStr}`, rightX, y);
  doc.setFont('helvetica', 'bold');
  rightTitleLines.forEach((line, idx) => {
    doc.text(line, rightX, y + 3.8 + idx * titleLineStep);
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(bodyFontSize);
  doc.text(rightName, rightX, nameY);
  const rightNameWidth = Math.min(sigColWidth, doc.getTextWidth(rightName));
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.22);
  doc.line(rightX, nameY + 0.85, rightX + rightNameWidth, nameY + 0.85);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(nipFontSize);
  doc.setTextColor(...MUTED);
  doc.text(rightNip ? `NIP. ${rightNip}` : 'NIP. —', rightX, nameY + 4.2);
}

/**
 * 1. Export Master School Schedule PDF (A4 Landscape)
 */
export function exportScheduleMasterPDF(state: AppState, options?: { paperSize?: PaperSize }): void {
  exportAllClassesSinglePageA4PDF(state, {
    paperSize: options?.paperSize,
    documentTitle: 'JADWAL PELAJARAN INDUK MADRASAH',
    includeTeacherRecapPage: true,
  });
}

export interface WeeklyClassSchedulePdfOptions extends Partial<OfficialDocCustomTexts> {
  paperSize?: PaperSize;
  orientation?: 'landscape' | 'portrait';
  layoutMode?: 'single_page' | 'two_pages';
  kopSurat?: boolean;
  principalTitle?: string;
  principalName?: string;
  principalNip?: string;
  coordinatorTitle?: string;
  coordinatorName?: string;
  coordinatorNip?: string;
  includeTeacherRecapPage?: boolean;
  colorizeSubjects?: boolean;
  compactNames?: boolean;
}

/**
 * Render Weekly Class Schedule:
 * - Single-Page Mode: Timetable Matrix + Compact Teacher Allocation Recap + Signatures all on 1 page!
 * - Two-Page Mode: Page 1 Timetable Matrix with KPI cards, Page 2 Detailed Teacher Breakdown with Signatures.
 * Fully supports A4 and F4 (Folio Indonesia) with automatic layout adjustments.
 */
function renderClassWeeklyPages(
  doc: jsPDF,
  state: AppState,
  cls: SchoolClass,
  options?: WeeklyClassSchedulePdfOptions,
  isFirstClass = true,
): void {
  const orientation = options?.orientation ?? 'landscape';
  const paperSize = options?.paperSize ?? 'a4';
  const isSinglePage = options?.layoutMode === 'single_page' || options?.includeTeacherRecapPage === false;

  if (!isFirstClass) {
    const format = getPaperDimensions(paperSize, orientation);
    doc.addPage(format, orientation);
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const allEntries = state.draft ?? state.activeSchedule ?? [];
  const classEntries = allEntries.filter((e) => e.classId === cls.id);
  const activeDays = state.settings.activeDays;
  const periodMinutes = state.settings.periodMinutes ?? 40;
  const astro = jpToAstronomical(classEntries.length, periodMinutes);
  const colorize = options?.colorizeSubjects !== false;
  const compact = options?.compactNames !== false;

  const teacherIdsInClass = [...new Set(classEntries.map((e) => e.teacherId))];
  const subjectIdsInClass = [...new Set(classEntries.map((e) => e.subjectId))];
  const academicYear = options?.academicYear || state.settings.academicYear;
  const semester = options?.semester || state.settings.semester;
  const schoolName = options?.schoolName || state.settings.schoolName;

  // ==========================================
  // HALAMAN 1: MATRIKS JADWAL MINGGUAN KELAS
  // ==========================================
  let currentY = isSinglePage ? 5.2 : 10;

  if (options?.kopSurat !== false) {
    currentY = renderOfficialKopSurat(doc, state, currentY, options, isSinglePage);
    if (isSinglePage) currentY -= 1.6;
  } else {
    currentY = isSinglePage ? 9 : 16;
  }

  // Document Title & Class Subtitle
  const defaultTitle = `JADWAL PELAJARAN MINGGUAN — KELAS ${cls.name}`;
  const docTitle = options?.documentTitle ? `${options.documentTitle} — KELAS ${cls.name}` : defaultTitle;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isSinglePage ? 10.2 : 13);
  doc.setTextColor(17, 45, 42);
  doc.text(docTitle, pageWidth / 2, currentY, { align: 'center' });

  currentY += isSinglePage ? 3.2 : 4.2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(isSinglePage ? 7.2 : 8.5);
  doc.setTextColor(80, 95, 90);
  const subtitleText = isSinglePage
    ? `Tingkat ${cls.level} · T.A. ${academicYear} (${semester}) · Alokasi: ${classEntries.length} JP (${astro.hours} Jam Efektif) · ${teacherIdsInClass.length} Guru Pengajar · ${schoolName}`
    : `Tingkat ${cls.level} · Tahun Ajaran ${academicYear} · Semester ${semester}`;
  doc.text(subtitleText, pageWidth / 2, currentY, { align: 'center' });

  currentY += isSinglePage ? 2.6 : 5.5;

  // KPI Summary Bar (4 Cards) - Rendered only in two-page mode
  const boxWidth = (pageWidth - 28) / 4;
  const boxHeight = 11.5;

  if (!isSinglePage) {
    const kpisPage1 = [
      { label: 'TOTAL ALOKASI JP', value: `${classEntries.length} JP Mingguan` },
      { label: 'WAKTU ASTRONOMIS', value: `${astro.hours} Jam (${astro.minutes} Mnt)` },
      { label: 'GURU PENGAJAR', value: `${teacherIdsInClass.length} Pendidik` },
      { label: 'MATA PELAJARAN', value: `${subjectIdsInClass.length} Bidang Studi` },
    ];

    kpisPage1.forEach((kpi, kIdx) => {
      const x = 14 + kIdx * boxWidth;
      doc.setFillColor(248, 251, 249);
      doc.setDrawColor(215, 230, 222);
      doc.roundedRect(x, currentY, boxWidth - 3, boxHeight, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(80, 105, 95);
      doc.text(kpi.label, x + (boxWidth - 3) / 2, currentY + 4, { align: 'center' });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(11, 52, 53);
      doc.text(kpi.value, x + (boxWidth - 3) / 2, currentY + 9, { align: 'center' });
    });

    currentY += boxHeight + 4;
  }

  // Timetable Matrix AutoTable
  const tableHeaders = ['Jam / JP', ...activeDays];
  const tableData: string[][] = [];
  const cellSubjectMap: Record<number, Record<number, string>> = {};
  const isRowNonKbm: Record<number, boolean> = {};

  const timelineRows = getTimelineRows(state.slots, state.settings.teachingPeriodsPerDay);

  timelineRows.forEach((tRow, rIdx) => {
    if (!tRow.isKbm) {
      isRowNonKbm[rIdx] = true;
      const timeLabel = `${tRow.defaultLabel}\n${tRow.start} - ${tRow.end}`;
      const row = [timeLabel];
      activeDays.forEach((day) => {
        const slot = state.slots.find((s) => s.day === day && s.order === tRow.order);
        row.push(slot?.activityName || slot?.label || tRow.defaultLabel);
      });
      tableData.push(row);
      return;
    }

    const jp = tRow.jpNo!;
    const timeLabel = `JP ${jp}\n${tRow.start} - ${tRow.end}`;
    const row = [timeLabel];

    activeDays.forEach((day, dIdx) => {
      const entry = classEntries.find((e) => e.day === day && e.jpNo === jp);
      const colIdx = dIdx + 1;
      if (entry) {
        const sub = state.subjects.find((s) => s.id === entry.subjectId);
        const tch = state.teachers.find((t) => t.id === entry.teacherId);
        const subName = compact ? compactSubjectName(sub?.name ?? '', sub?.code) : (sub?.name ?? 'Mapel');
        const tchInfo = tch ? (compact ? `(${compactTeacherName(tch.name, tch.code)})` : (tch.code ? `[${tch.code}] ${tch.name}` : tch.name)) : '—';
        row.push(`${subName}\n${tchInfo}`);
        if (!cellSubjectMap[rIdx]) cellSubjectMap[rIdx] = {};
        cellSubjectMap[rIdx][colIdx] = entry.subjectId;
      } else {
        row.push('—');
      }
    });
    tableData.push(row);
  });

  // Calculate day column width based on available paper width (A4 vs F4)
  const timeColWidth = orientation === 'landscape' ? 24 : 18;
  const dayColWidth = (pageWidth - 28 - timeColWidth) / activeDays.length;

  const colStyles: Record<number, { halign: 'center' | 'left' | 'right'; cellWidth: number; fontStyle?: 'bold' | 'normal'; fillColor?: [number, number, number] }> = {
    0: { halign: 'center', cellWidth: timeColWidth, fontStyle: 'bold', fillColor: [248, 250, 248] },
  };
  activeDays.forEach((_, idx) => {
    colStyles[idx + 1] = { halign: 'center', cellWidth: dayColWidth };
  });

  const cellPaddingVal = isSinglePage ? (timelineRows.length >= 11 ? 1.05 : 1.35) : 2.5;

  autoTable(doc, {
    startY: currentY,
    head: [tableHeaders],
    body: tableData,
    theme: 'grid',
    tableLineWidth: 0.3,
    tableLineColor: [11, 52, 53],
    headStyles: {
      fillColor: [11, 52, 53],
      textColor: 255,
      fontSize: isSinglePage ? 7.3 : 8.5,
      fontStyle: 'bold',
      halign: 'center',
      cellPadding: isSinglePage ? 1.45 : 2.8,
      lineWidth: 0.25,
      lineColor: [11, 52, 53],
    },
    bodyStyles: {
      fontSize: orientation === 'landscape' ? (isSinglePage ? 6.5 : 7.5) : (isSinglePage ? 5.9 : 6.5),
      halign: 'center',
      valign: 'middle',
      cellPadding: cellPaddingVal,
      textColor: [20, 35, 33],
      lineColor: [215, 225, 220],
      lineWidth: 0.18,
    },
    columnStyles: colStyles,
    didParseCell: (data) => {
      if (data.section === 'body') {
        if (isRowNonKbm[data.row.index]) {
          data.cell.styles.fillColor = [240, 246, 243];
          data.cell.styles.textColor = [16, 63, 62];
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fontSize = isSinglePage ? 6.2 : 6.8;
        } else if (data.column.index >= 1) {
          const subId = cellSubjectMap[data.row.index]?.[data.column.index];
          if (subId && colorize) {
            const subject = state.subjects.find((s) => s.id === subId);
            if (subject?.color) {
              const { bg, text } = getPrintableCellColor(subject.color);
              data.cell.styles.fillColor = bg;
              data.cell.styles.textColor = text;
              data.cell.styles.fontStyle = 'bold';
            }
          }
        }
      }
    },
    alternateRowStyles: {
      fillColor: [253, 254, 253],
    },
    margin: { left: 14, right: 14 },
  });

  const lastTableP1 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable;

  // Single-Page Layout: Compact Teacher Allocation Recap & Signatures cleanly fitted on Page 1
  if (isSinglePage) {
    let p1AfterTableY = lastTableP1.finalY + 2.4;

    // Header label for compact teacher allocation
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.1);
    doc.setTextColor(11, 52, 53);
    doc.text(`REKAPITULASI PEMBAGIAN TUGAS MENGAJAR KELAS ${cls.name}`, 14, p1AfterTableY);

    p1AfterTableY += 1.6;

    // Build compact teacher recap data
    const teachersInClassObj = teacherIdsInClass
      .map((tid) => state.teachers.find((t) => t.id === tid))
      .filter((t): t is typeof state.teachers[0] => Boolean(t))
      .sort((a, b) => a.name.localeCompare(b.name));

    const compactTeacherRows: Array<Array<string | number>> = [];
    teachersInClassObj.forEach((teacher, idx) => {
      const tEntries = classEntries.filter((e) => e.teacherId === teacher.id);
      const taughtSubNames = [...new Set(
        tEntries.map((e) => state.subjects.find((s) => s.id === e.subjectId)?.name ?? 'Mapel'),
      )].join(', ');

      const teachingDays = [...new Set(tEntries.map((e) => e.day))];
      teachingDays.sort((a, b) => activeDays.indexOf(a) - activeDays.indexOf(b));
      const daysStr = teachingDays.join(', ');

      const totalSchoolJp = allEntries.filter((e) => e.teacherId === teacher.id).length;

      const teacherMax = teacher.maxWeeklyJP > 0 ? teacher.maxWeeklyJP : (state.settings.maxWeeklyJP ?? 24);
      compactTeacherRows.push([
        idx + 1,
        teacher.code,
        teacher.nip ? `${teacher.name} (NIP. ${teacher.nip})` : teacher.name,
        taughtSubNames,
        daysStr,
        `${tEntries.length} JP`,
        `${totalSchoolJp} / ${teacherMax} JP`,
      ]);
    });

    // Total summary row
    compactTeacherRows.push([
      '',
      '',
      `TOTAL BEBAN KELAS ${cls.name}`,
      `${subjectIdsInClass.length} Mata Pelajaran`,
      `${activeDays.length} Hari KBM`,
      `${classEntries.length} JP`,
      '100% Terpenuhi',
    ]);

    const compactHeaders = ['No', 'Kode', 'Nama & NIP Pendidik', 'Mata Pelajaran', 'Hari KBM', 'Beban Kelas', 'Total Madrasah'];
    const availSingleW = pageWidth - 28;
    const baseSingleColW = orientation === 'landscape'
      ? [9, 12, 68, 66, 44, 24, 28]
      : [8, 10, 44, 42, 28, 18, 22];
    const singleScale = availSingleW / baseSingleColW.reduce((a, b) => a + b, 0);
    const singleDensePadding = teachersInClassObj.length >= 8 ? 0.78 : 1.05;

    autoTable(doc, {
      startY: p1AfterTableY,
      head: [compactHeaders],
      body: compactTeacherRows,
      theme: 'grid',
      tableLineWidth: 0.22,
      tableLineColor: [11, 52, 53],
      headStyles: {
        fillColor: [11, 52, 53],
        textColor: 255,
        fontSize: 6.4,
        fontStyle: 'bold',
        halign: 'center',
        cellPadding: 1.1,
      },
      bodyStyles: {
        fontSize: teachersInClassObj.length >= 8 ? 5.9 : 6.2,
        halign: 'center',
        cellPadding: singleDensePadding,
        textColor: [20, 35, 33],
        lineColor: [215, 225, 220],
        lineWidth: 0.15,
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: baseSingleColW[0] * singleScale },
        1: { halign: 'center', cellWidth: baseSingleColW[1] * singleScale },
        2: { halign: 'left', cellWidth: baseSingleColW[2] * singleScale, fontStyle: 'bold' },
        3: { halign: 'left', cellWidth: baseSingleColW[3] * singleScale },
        4: { halign: 'center', cellWidth: baseSingleColW[4] * singleScale },
        5: { halign: 'center', cellWidth: baseSingleColW[5] * singleScale, fontStyle: 'bold' },
        6: { halign: 'center', cellWidth: baseSingleColW[6] * singleScale },
      },
      didParseCell: (data) => {
        if (data.row.index === compactTeacherRows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [232, 244, 238];
          data.cell.styles.textColor = [11, 52, 53];
        }
      },
      alternateRowStyles: {
        fillColor: [253, 254, 253],
      },
      margin: { left: 14, right: 14 },
    });

    const lastTableTeacher = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable;

    // Single-Page Official Signature Block cleanly positioned without spawning an orphan Page 2
    addSignatureBlock(doc, state, lastTableTeacher.finalY + 1.2, {
      city: options?.signerCity,
      date: options?.signerDate,
      leftTitle: options?.leftTitle || options?.coordinatorTitle || `Wali Kelas ${cls.name} / Koordinator Kurikulum`,
      leftName: options?.leftName || options?.coordinatorName,
      leftNip: options?.leftNip || options?.coordinatorNip,
      rightTitle: options?.rightTitle || buildRightSignerTitle(options?.principalTitle || state.settings.headmasterTitle, options?.schoolName || state.settings.schoolName),
      rightName: options?.rightName || options?.principalName,
      rightNip: options?.rightNip || options?.principalNip,
    }, true);

    return;
  }

  // Two-Page Mode: Page 1 Notice Callout
  const p1NoticeY = Math.min(lastTableP1.finalY + 4, pageHeight - 20);

  doc.setFillColor(243, 248, 245);
  doc.setDrawColor(205, 230, 220);
  doc.roundedRect(14, p1NoticeY, pageWidth - 28, 9, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(17, 65, 55);
  doc.text(
    'Rincian Lengkap & Rekapitulasi Beban JP Guru Tercantum Pada Lampiran Pengesahan',
    20,
    p1NoticeY + 4,
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(90, 110, 105);
  doc.text(
    `Catatan: 1 JP = ${periodMinutes} menit waktu efektif KBM. Jadwal ini disahkan untuk pembelajaran semester berjalan.`,
    20,
    p1NoticeY + 7.3,
  );

  // =========================================================================
  // HALAMAN 2: TABEL REKAPITULASI JP PER GURU (SEPARATE DEDICATED PAGE)
  // =========================================================================
  if (options?.includeTeacherRecapPage !== false) {
    doc.addPage(getPaperDimensions(paperSize, orientation), orientation);
    let p2Y = 12;

    if (options?.kopSurat !== false) {
      p2Y = renderOfficialKopSurat(doc, state, 10, options, false);
    } else {
      p2Y = 16;
    }

    // Header Page 2 Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(17, 45, 42);
    doc.text(`REKAPITULASI ALOKASI JP & BEBAN MENGAJAR GURU`, pageWidth / 2, p2Y, { align: 'center' });

    p2Y += 4.2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(80, 95, 90);
    doc.text(
      `Lampiran Resmi Jadwal Mingguan Kelas ${cls.name} (Tingkat ${cls.level}) · Semester ${semester} T.A. ${academicYear}`,
      pageWidth / 2,
      p2Y,
      { align: 'center' },
    );

    p2Y += 5.5;

    // KPI Cards Page 2
    const kpisPage2 = [
      { label: 'TOTAL BEBAN KELAS', value: `${classEntries.length} Jam Pelajaran` },
      { label: 'GURU TERLIBAT', value: `${teacherIdsInClass.length} Pendidik` },
      { label: 'RATA-RATA BEBAN', value: `${(classEntries.length / (teacherIdsInClass.length || 1)).toFixed(1)} JP / Guru` },
      { label: 'STATUS DISTRIBUSI', value: '100% Terstruktur' },
    ];

    kpisPage2.forEach((kpi, kIdx) => {
      const x = 14 + kIdx * boxWidth;
      doc.setFillColor(248, 251, 249);
      doc.setDrawColor(215, 230, 222);
      doc.roundedRect(x, p2Y, boxWidth - 3, boxHeight, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(80, 105, 95);
      doc.text(kpi.label, x + (boxWidth - 3) / 2, p2Y + 4, { align: 'center' });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(11, 52, 53);
      doc.text(kpi.value, x + (boxWidth - 3) / 2, p2Y + 9, { align: 'center' });
    });

    p2Y += boxHeight + 4;

    // Build Teacher Recap Breakdown Data with Jabatan and NIP
    const teacherDataRows: Array<Array<string | number>> = [];

    const teachersInClassObj = teacherIdsInClass
      .map((tid) => state.teachers.find((t) => t.id === tid))
      .filter((t): t is typeof state.teachers[0] => Boolean(t))
      .sort((a, b) => a.name.localeCompare(b.name));

    teachersInClassObj.forEach((teacher, idx) => {
      const tEntries = classEntries.filter((e) => e.teacherId === teacher.id);
      const taughtSubjectNames = [...new Set(
        tEntries.map((e) => state.subjects.find((s) => s.id === e.subjectId)?.name ?? 'Mapel'),
      )].join(', ');

      const teachingDays = [...new Set(tEntries.map((e) => e.day))];
      teachingDays.sort((a, b) => activeDays.indexOf(a) - activeDays.indexOf(b));
      const daysStr = teachingDays.join(', ');

      const totalSchoolJp = allEntries.filter((e) => e.teacherId === teacher.id).length;
      const teacherMax = teacher.maxWeeklyJP > 0 ? teacher.maxWeeklyJP : (state.settings.maxWeeklyJP ?? 24);

      let status = 'Sesuai Kuota';
      if (totalSchoolJp > teacherMax) status = 'Melebihi Batas';
      else if (totalSchoolJp === teacherMax) status = 'Maksimal';

      const teacherDisplayName = teacher.nip
        ? `${teacher.name}\nNIP. ${teacher.nip}`
        : teacher.name;

      teacherDataRows.push([
        idx + 1,
        teacher.code,
        teacherDisplayName,
        teacher.roleTitle || 'Guru Mapel',
        taughtSubjectNames,
        daysStr,
        `${tEntries.length} JP`,
        `${totalSchoolJp} / ${teacherMax} JP`,
        status,
      ]);
    });

    // Summary Total Row
    teacherDataRows.push([
      '',
      '',
      `TOTAL & RATA-RATA KELAS ${cls.name}`,
      '—',
      `${subjectIdsInClass.length} Mata Pelajaran`,
      `${activeDays.length} Hari KBM`,
      `${classEntries.length} JP`,
      '—',
      '100% Terpenuhi',
    ]);

    const p2Headers = [
      'No',
      'Kode',
      'Nama & NIP Pendidik',
      'Jabatan',
      'Mata Pelajaran yang Diampu',
      'Hari Mengajar',
      'Beban Kelas',
      'Beban Madrasah',
      'Status Alokasi',
    ];

    const availP2W = pageWidth - 28;
    const baseP2ColW = orientation === 'landscape'
      ? [8, 12, 54, 40, 48, 28, 20, 29, 30]
      : [6, 9, 36, 26, 32, 20, 15, 20, 18];
    const totalP2ColW = baseP2ColW.reduce((a, b) => a + b, 0);
    const p2Scale = availP2W / totalP2ColW;

    autoTable(doc, {
      startY: p2Y,
      head: [p2Headers],
      body: teacherDataRows,
      theme: 'grid',
      headStyles: {
        fillColor: [11, 52, 53],
        textColor: 255,
        fontSize: 7.8,
        fontStyle: 'bold',
        halign: 'center',
        cellPadding: 2.8,
      },
      bodyStyles: {
        fontSize: 7.5,
        halign: 'center',
        cellPadding: 2.2,
        textColor: [20, 35, 33],
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: baseP2ColW[0] * p2Scale },
        1: { halign: 'center', cellWidth: baseP2ColW[1] * p2Scale },
        2: { halign: 'left', cellWidth: baseP2ColW[2] * p2Scale, fontStyle: 'bold' },
        3: { halign: 'left', cellWidth: baseP2ColW[3] * p2Scale },
        4: { halign: 'left', cellWidth: baseP2ColW[4] * p2Scale },
        5: { halign: 'center', cellWidth: baseP2ColW[5] * p2Scale },
        6: { halign: 'center', cellWidth: baseP2ColW[6] * p2Scale, fontStyle: 'bold' },
        7: { halign: 'center', cellWidth: baseP2ColW[7] * p2Scale },
        8: { halign: 'center', cellWidth: baseP2ColW[8] * p2Scale },
      },
      didParseCell: (data) => {
        if (data.row.index === teacherDataRows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [232, 244, 238];
          data.cell.styles.textColor = [11, 52, 53];
        }
      },
      alternateRowStyles: {
        fillColor: [253, 254, 253],
      },
      margin: { left: 14, right: 14 },
    });

    const lastTableP2 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable;
    let nextP2Y = lastTableP2.finalY + 3.5;

    // Small notes below Page 2
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(90, 105, 100);
    doc.text(
      `* Catatan: Beban JP dihitung otomatis berdasarkan alokasi kurikulum resmi madrasah (1 JP = ${periodMinutes} menit).`,
      14,
      nextP2Y,
    );
    nextP2Y += 3.2;
    doc.text(
      `* Kolom 'Hari Mengajar' merinci jadwal tatap muka guru di rombongan belajar Kelas ${cls.name}.`,
      14,
      nextP2Y,
    );

    addSignatureBlock(doc, state, nextP2Y + 4, {
      city: options?.signerCity,
      date: options?.signerDate,
      leftTitle: options?.leftTitle || options?.coordinatorTitle || `Wali Kelas ${cls.name} / Koordinator Kurikulum`,
      leftName: options?.leftName || options?.coordinatorName,
      leftNip: options?.leftNip || options?.coordinatorNip,
      rightTitle: options?.rightTitle || `${options?.principalTitle || 'Kepala Madrasah'} ${options?.schoolName || state.settings.schoolName}`,
      rightName: options?.rightName || options?.principalName,
      rightNip: options?.rightNip || options?.principalNip,
    });
  }
}

/**
 * 2. Export Weekly Class Schedule PDF (A4 Clean Layout with Separate Page Teacher JP Recap)
 */
export function exportScheduleClassPDF(
  state: AppState,
  classId: string,
  options?: WeeklyClassSchedulePdfOptions,
): void {
  const cls = state.classes.find((c) => c.id === classId) ?? state.classes[0];
  if (!cls) return;

  const orientation = options?.orientation ?? 'landscape';
  const paperSize = options?.paperSize ?? 'a4';
  const doc = createJsPDFDocument(orientation, paperSize);

  renderClassWeeklyPages(doc, state, cls, options, true);

  addDocFooter(doc, options?.schoolName || state.settings.schoolName);

  const cleanName = cls.name.replace(/[^a-zA-Z0-9]/g, '_');
  const paperSuffix = paperSize.toUpperCase();
  doc.save(`SAKALA_Jadwal_Mingguan_Kelas_${cleanName}_${paperSuffix}.pdf`);
}

/**
 * Export All Classes Weekly Schedule PDF (A4/F4 Clean Layout Bundle)
 */
export function exportAllClassesWeeklyPDF(
  state: AppState,
  options?: WeeklyClassSchedulePdfOptions,
): void {
  const classes = state.classes.filter((c) => c.isActive);
  if (classes.length === 0) return;

  const orientation = options?.orientation ?? 'landscape';
  const paperSize = options?.paperSize ?? 'a4';
  const doc = createJsPDFDocument(orientation, paperSize);

  classes.forEach((cls, idx) => {
    renderClassWeeklyPages(doc, state, cls, options, idx === 0);
  });

  addDocFooter(doc, options?.schoolName || state.settings.schoolName);

  const cleanYear = (options?.academicYear || state.settings.academicYear).replace(/[^a-zA-Z0-9]/g, '_');
  const paperSuffix = paperSize.toUpperCase();
  doc.save(`SAKALA_Jadwal_Mingguan_Semua_Kelas_${paperSuffix}_${cleanYear}.pdf`);
}

export interface AllClassesSinglePagePdfOptions extends Partial<OfficialDocCustomTexts> {
  paperSize?: PaperSize;
  colorizeSubjects?: boolean;
  compactNames?: boolean;
  includeKop?: boolean;
  includeTeacherRecapPage?: boolean;
  principalTitle?: string;
  coordinatorTitle?: string;
  coordinatorName?: string;
  coordinatorNip?: string;
}

/**
 * 2B. Export All Classes in Single Page Landscape (A4 or F4) + Dedicated Teacher JP Recap Page
 * - Page 1 (Landscape): Master Timetable containing all classes on 1 page with compact names & colorized subject cells
 * - Page 2 (Landscape): Comprehensive Teacher JP Allocation Recap Table with Official Signature Block at Footer
 */
export function exportAllClassesSinglePageA4PDF(
  state: AppState,
  options?: AllClassesSinglePagePdfOptions,
): void {
  const paperSize = options?.paperSize ?? 'a4';
  const doc = createJsPDFDocument('landscape', paperSize);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const entries = state.draft ?? state.activeSchedule ?? [];
  const classes = state.classes.filter((c) => c.isActive);
  const activeDays = state.settings.activeDays;
  const periodMinutes = state.settings.periodMinutes ?? 40;
  const colorize = options?.colorizeSubjects !== false;
  const compact = options?.compactNames !== false;

  const academicYear = options?.academicYear || state.settings.academicYear;
  const semester = options?.semester || state.settings.semester;
  const schoolName = options?.schoolName || state.settings.schoolName;

  // =========================================================================
  // HALAMAN 1: MATRIKS SELURUH KELAS TERPADU (BLOK MINGGUAN SENIN - SABTU)
  // =========================================================================
  let currentY = 7;
  if (options?.includeKop !== false && options?.kopSurat !== false) {
    currentY = renderOfficialKopSurat(doc, state, 7, options, true);
  } else {
    currentY = 12;
  }

  // Document Heading - Adaptive title (NO misleading "(SATU HALAMAN A4)" on F4 or multi-page)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...TEAL);
  const docTitle = options?.documentTitle || 'JADWAL PELAJARAN SELURUH KELAS';
  doc.text(docTitle.toUpperCase(), pageWidth / 2, currentY, { align: 'center' });

  currentY += 3.6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(70, 90, 85);
  const subHeading = `Tahun Ajaran ${academicYear} · Semester ${semester} · Rombel Aktif: ${classes.map((c) => c.name).join(', ')} · ${schoolName}`;
  doc.text(subHeading, pageWidth / 2, currentY, { align: 'center' });
  currentY += 4.5;

  // Group classes into parallel rombel rows (Baris 1 — Kelompok A: VII-A, VIII-A, IX-A; Baris 2 — Kelompok B: VII-B, VIII-B, IX-B)
  const rombelRows = groupClassesForMasterMatrix(classes);

  // Available vertical space for matrix blocks
  const legendSpaceNeeded = colorize ? 13 : 8;
  const bottomMargin = 12; // footer room
  const availableMatrixHeight = pageHeight - currentY - legendSpaceNeeded - bottomMargin;

  // Determine rows per page: if rombelRows.length <= 2, all fit comfortably on Page 1
  const maxRowsPerPage = rombelRows.length <= 2 ? 2 : 2;
  const gapBetweenRows = 3.8;

  // Calculate uniform height for class weekly blocks
  const blockH = Math.min(
    48,
    Math.max(
      38,
      (availableMatrixHeight - (Math.min(rombelRows.length, maxRowsPerPage) - 1) * gapBetweenRows) /
        Math.min(rombelRows.length, maxRowsPerPage),
    ),
  );

  const marginX = 10;
  const availableW = pageWidth - marginX * 2;

  rombelRows.forEach((row, rIdx) => {
    // If more rows than can fit on page 1, add a structured page break
    if (rIdx > 0 && rIdx % maxRowsPerPage === 0) {
      doc.addPage(getPaperDimensions(paperSize, 'landscape'), 'landscape');
      currentY = 10;
      if (options?.includeKop !== false && options?.kopSurat !== false) {
        currentY = renderOfficialKopSurat(doc, state, 8, options, true);
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...TEAL);
      doc.text(`${docTitle.toUpperCase()} (LANJUTAN)`, pageWidth / 2, currentY, { align: 'center' });
      currentY += 5;
    }

    // Row Header Banner (Kelompok A, Kelompok B, etc.)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(15, 55, 50);
    doc.text(`${row.label.toUpperCase()} · ${row.classes.map((c) => c.name).join(' | ')}`, marginX, currentY + 1.2);
    currentY += 2.8;

    const numCols = Math.max(1, row.classes.length);
    const gapX = 3.5;
    const blockW = (availableW - (numCols - 1) * gapX) / numCols;

    // Render each class weekly block side-by-side
    row.classes.forEach((cls, cIdx) => {
      const blockX = marginX + cIdx * (blockW + gapX);
      const blockY = currentY;
      const classEntries = entries.filter((e) => e.classId === cls.id);

      // 1. Block Title Bar
      const titleH = 4.0;
      doc.setFillColor(11, 52, 53); // Deep Teal
      doc.roundedRect(blockX, blockY, blockW, titleH, 0.6, 0.6, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(255, 255, 255);
      doc.text(`Kelas ${cls.name}`, blockX + 2.5, blockY + 2.8);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.5);
      doc.setTextColor(220, 238, 230);
      doc.text(`Tingkat ${cls.level} · ${classEntries.length} JP`, blockX + blockW - 2.5, blockY + 2.8, { align: 'right' });

      // 2. Day Sub-header
      const subHeaderH = 3.2;
      const subHeaderY = blockY + titleH;
      doc.setFillColor(232, 243, 238);
      doc.rect(blockX, subHeaderY, blockW, subHeaderH, 'F');

      const jpW = paperSize === 'f4' ? 6.2 : 5.5;
      const timeW = paperSize === 'f4' ? 12.0 : 10.8;
      const dayW = (blockW - jpW - timeW) / activeDays.length;

      // JP col header
      doc.setDrawColor(210, 225, 218);
      doc.setLineWidth(0.18);
      doc.rect(blockX, subHeaderY, jpW, subHeaderH, 'D');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(4.8);
      doc.setTextColor(11, 52, 53);
      doc.text('JP', blockX + jpW / 2, subHeaderY + 2.2, { align: 'center' });

      // Waktu col header
      doc.rect(blockX + jpW, subHeaderY, timeW, subHeaderH, 'D');
      doc.setFontSize(4.6);
      doc.text('WAKTU', blockX + jpW + timeW / 2, subHeaderY + 2.2, { align: 'center' });

      // Day cols headers
      activeDays.forEach((day, dIdx) => {
        const dX = blockX + jpW + timeW + dIdx * dayW;
        doc.rect(dX, subHeaderY, dayW, subHeaderH, 'D');
        doc.setFontSize(4.8);
        doc.text(day.slice(0, 3).toUpperCase(), dX + dayW / 2, subHeaderY + 2.2, { align: 'center' });
      });

      // 3. JP Rows
      const headerH = titleH + subHeaderH;
      const timelineRows = getTimelineRows(state.slots, state.settings.teachingPeriodsPerDay);
      const rowH = (blockH - headerH) / timelineRows.length;

      timelineRows.forEach((tRow, pIdx) => {
        const rowY = blockY + headerH + pIdx * rowH;

        // JP No cell
        doc.setFillColor(246, 250, 248);
        doc.setDrawColor(215, 228, 222);
        doc.setLineWidth(0.15);
        doc.rect(blockX, rowY, jpW, rowH, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(4.8);
        doc.setTextColor(11, 52, 53);
        const jpLabel = tRow.isKbm ? String(tRow.jpNo).padStart(2, '0') : '—';
        doc.text(jpLabel, blockX + jpW / 2, rowY + rowH * 0.65, { align: 'center' });

        // Waktu cell
        const timeStr = `${tRow.start}-${tRow.end}`;
        doc.setFillColor(250, 252, 251);
        doc.rect(blockX + jpW, rowY, timeW, rowH, 'FD');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(3.8);
        doc.setTextColor(85, 100, 95);
        doc.text(timeStr, blockX + jpW + timeW / 2, rowY + rowH * 0.65, { align: 'center' });

        // Days cells
        activeDays.forEach((day, dIdx) => {
          const cellX = blockX + jpW + timeW + dIdx * dayW;
          const slotDef = state.slots.find((s) => s.day === day && s.order === tRow.order);
          const blocked = !tRow.isKbm || isSlotBlocked(slotDef);

          if (blocked) {
            // Non-KBM activity
            const actType = (slotDef?.activityType || tRow.activityType || 'ISTIRAHAT').toUpperCase();
            let actBg: [number, number, number] = [254, 248, 230]; // warm yellow for istirahat
            let actBorder: [number, number, number] = [230, 205, 140];
            let actText: [number, number, number] = [130, 95, 30];
            let actShort = 'ISTIRAHAT';

            if (actType.includes('UPACARA')) {
              actBg = [253, 242, 240];
              actBorder = [235, 185, 178];
              actText = [160, 60, 48];
              actShort = 'UPACARA';
            } else if (actType.includes('RELIGI') || actType.includes('SHOLAT')) {
              actBg = [247, 239, 253];
              actBorder = [218, 190, 242];
              actText = [99, 43, 142];
              actShort = 'RELIGI';
            }

            doc.setFillColor(...actBg);
            doc.setDrawColor(...actBorder);
            doc.setLineWidth(0.15);
            doc.rect(cellX, rowY, dayW, rowH, 'FD');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(4.0);
            doc.setTextColor(...actText);
            if (doc.getTextWidth(actShort) > dayW - 0.5) actShort = actShort.slice(0, 4);
            doc.text(actShort, cellX + dayW / 2, rowY + rowH * 0.65, { align: 'center' });
          } else {
            // KBM slot
            const jpNo = tRow.jpNo!;
            const entry = entries.find((e) => e.classId === cls.id && e.day === day && e.jpNo === jpNo);
            if (!entry) {
              doc.setFillColor(255, 255, 255);
              doc.setDrawColor(220, 230, 225);
              doc.setLineWidth(0.15);
              doc.rect(cellX, rowY, dayW, rowH, 'FD');
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(4.8);
              doc.setTextColor(180, 195, 190);
              doc.text('—', cellX + dayW / 2, rowY + rowH * 0.65, { align: 'center' });
            } else {
              const subject = state.subjects.find((s) => s.id === entry.subjectId);
              const teacher = state.teachers.find((t) => t.id === entry.teacherId);

              let cellBg: [number, number, number] = [246, 250, 248];
              let cellText: [number, number, number] = [17, 50, 48];

              if (colorize && subject?.color) {
                const printable = getPrintableCellColor(subject.color);
                cellBg = printable.bg;
                cellText = printable.text;
              }

              doc.setFillColor(...cellBg);
              doc.setDrawColor(215, 228, 222);
              doc.setLineWidth(0.15);
              doc.rect(cellX, rowY, dayW, rowH, 'FD');

              // Line 1: Subject Name
              let subLabel = compact ? compactSubjectName(subject?.name || '', subject?.code) : (subject?.name || 'Mapel');
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(4.6);
              doc.setTextColor(...cellText);
              if (doc.getTextWidth(subLabel) > dayW - 0.6) {
                subLabel = subject?.code || subLabel.slice(0, 5);
              }
              doc.text(subLabel, cellX + dayW / 2, rowY + rowH * 0.44, { align: 'center' });

              // Line 2: Teacher Name
              let tchLabel = compact ? compactTeacherName(teacher?.name || '', teacher?.code) : (teacher?.name || '—');
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(3.7);
              doc.setTextColor(Math.min(cellText[0] + 35, 110), Math.min(cellText[1] + 35, 120), Math.min(cellText[2] + 35, 115));
              if (doc.getTextWidth(tchLabel) > dayW - 0.6) {
                tchLabel = teacher?.code || tchLabel.slice(0, 6);
              }
              doc.text(tchLabel, cellX + dayW / 2, rowY + rowH * 0.82, { align: 'center' });
            }
          }
        });
      });

      // 4. Outer Class Block Border
      doc.setDrawColor(11, 52, 53);
      doc.setLineWidth(0.5);
      doc.roundedRect(blockX, blockY, blockW, blockH, 0.6, 0.6, 'D');
    });

    currentY += blockH + gapBetweenRows;
  });

  // Color Swatch Legend Strip & Non-KBM Activity indicators
  let legendY = Math.min(currentY + 1, pageHeight - 16);
  if (colorize && legendY < pageHeight - 13) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.8);
    doc.setTextColor(11, 52, 53);
    doc.text('LEGENDA MAPEL & KEGIATAN:', marginX, legendY);
    legendY += 2.4;

    let curLegendX = marginX;
    const activeSubjects = state.subjects.filter((s) => s.isActive);
    for (const sub of activeSubjects) {
      const { bg, text } = getPrintableCellColor(sub.color || '#2f7771');
      const label = `${sub.code}: ${compactSubjectName(sub.name, sub.code)}`;
      doc.setFontSize(5.2);
      doc.setFont('helvetica', 'normal');
      const textWidth = doc.getTextWidth(label);
      const pillWidth = textWidth + 5;

      if (curLegendX + pillWidth > pageWidth - marginX) {
        curLegendX = marginX;
        legendY += 3.2;
        if (legendY > pageHeight - 8) break;
      }

      doc.setFillColor(...bg);
      doc.setDrawColor(...text);
      doc.setLineWidth(0.2);
      doc.roundedRect(curLegendX, legendY - 1.8, pillWidth, 2.6, 0.5, 0.5, 'FD');

      doc.setTextColor(...text);
      doc.text(label, curLegendX + 2.5, legendY);
      curLegendX += pillWidth + 2.5;
    }

    // Activity Badges
    const actBadges = [
      { label: 'ISTIRAHAT', bg: [254, 248, 230], border: [230, 205, 140], text: [130, 95, 30] },
      { label: 'UPACARA', bg: [253, 242, 240], border: [235, 185, 178], text: [160, 60, 48] },
      { label: 'SHOLAT / RELIGI', bg: [247, 239, 253], border: [218, 190, 242], text: [99, 43, 142] },
    ];

    actBadges.forEach((act) => {
      doc.setFontSize(5.0);
      doc.setFont('helvetica', 'bold');
      const w = doc.getTextWidth(act.label) + 5;
      if (curLegendX + w < pageWidth - marginX) {
        doc.setFillColor(...(act.bg as [number, number, number]));
        doc.setDrawColor(...(act.border as [number, number, number]));
        doc.setLineWidth(0.2);
        doc.roundedRect(curLegendX, legendY - 1.8, w, 2.6, 0.5, 0.5, 'FD');
        doc.setTextColor(...(act.text as [number, number, number]));
        doc.text(act.label, curLegendX + 2.5, legendY);
        curLegendX += w + 2.5;
      }
    });
  }

  // Official Note
  if (legendY + 3.2 < pageHeight - 7) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(85, 105, 100);
    doc.text(
      `* Catatan: 1 JP = ${periodMinutes} menit waktu efektif KBM. Jadwal terstruktur per kelompok rombel paralel. Lembar rekapitulasi alokasi & pengesahan tercantum pada halaman berikutnya.`,
      marginX,
      legendY + 3.2,
    );
  }

  // =========================================================================
  // HALAMAN 2: REKAPITULASI ALOKASI JP & BEBAN MENGAJAR GURU (HALAMAN TERPISAH)
  // =========================================================================
  if (options?.includeTeacherRecapPage !== false) {
    doc.addPage(getPaperDimensions(paperSize, 'landscape'), 'landscape');
    let p2Y = 6;
    if (options?.includeKop !== false && options?.kopSurat !== false) {
      p2Y = renderOfficialKopSurat(doc, state, 6, options, true);
      p2Y -= 1.2;
    } else {
      p2Y = 12;
    }

    // Title Page 2
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...TEAL);
    doc.text('REKAPITULASI ALOKASI JP & BEBAN MENGAJAR GURU (SELURUH KELAS)', pageWidth / 2, p2Y, { align: 'center' });

    p2Y += 3.8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    doc.setTextColor(80, 95, 90);
    doc.text(
      `Lampiran Resmi Pengesahan Jadwal Pelajaran · Tahun Ajaran ${academicYear} Semester ${semester} · ${schoolName}`,
      pageWidth / 2,
      p2Y,
      { align: 'center' },
    );

    p2Y += 4;

    // KPI Summary Bar Page 2 (Architectural Left-Accent Style matching Attendance Report)
    const totalSchoolJp = entries.length;
    const activeTeachers = state.teachers.filter((t) => t.isActive);
    const astroTotal = jpToAstronomical(totalSchoolJp, periodMinutes);
    const boxGap = 3.5;
    const totalAvailKpiW = pageWidth - 24;
    const boxW = (totalAvailKpiW - boxGap * 3) / 4;
    const boxH = 9.4;

    const kpisPage2 = [
      { label: 'TOTAL ALOKASI JP MADRASAH', value: `${totalSchoolJp} Jam Pelajaran`, accent: TEAL },
      { label: 'WAKTU EFEKTIF ASTRONOMIS', value: `${astroTotal.hours} Jam (${astroTotal.minutes} Mnt)`, accent: TEAL },
      { label: 'JUMLAH TENAGA PENDIDIK', value: `${activeTeachers.length} Guru Aktif`, accent: [27, 94, 67] as [number, number, number] },
      { label: 'RATA-RATA BEBAN MENGAJAR', value: `${(totalSchoolJp / (activeTeachers.length || 1)).toFixed(1)} JP / Guru`, accent: GOLD },
    ];

    kpisPage2.forEach((kpi, kIdx) => {
      const x = 12 + kIdx * (boxW + boxGap);
      doc.setFillColor(249, 251, 250);
      doc.setDrawColor(214, 225, 220);
      doc.setLineWidth(0.24);
      doc.roundedRect(x, p2Y, boxW, boxH, 1.5, 1.5, 'FD');

      doc.setFillColor(...kpi.accent);
      doc.roundedRect(x + 1.8, p2Y + 1.8, 1.1, boxH - 3.6, 0.5, 0.5, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.8);
      doc.setTextColor(92, 112, 105);
      doc.text(kpi.label, x + 5.0, p2Y + 3.6);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.4);
      doc.setTextColor(11, 52, 53);
      doc.text(kpi.value, x + 5.0, p2Y + 7.7);
    });

    p2Y += boxH + 3.2;

    // Teacher Recap Table
    const p2Headers = [
      'No',
      'Kode',
      'Nama & NIP Pendidik',
      'Jabatan',
      'Mata Pelajaran',
      ...classes.map((c) => c.name),
      'Total JP',
      'Maks JP',
      'Jam Astro',
      'Status Beban',
    ];

    const p2Rows: Array<Array<string | number>> = [];
    const classJpTotals: Record<string, number> = {};
    classes.forEach((c) => { classJpTotals[c.id] = 0; });

    activeTeachers.forEach((t, idx) => {
      const tEntries = entries.filter((e) => e.teacherId === t.id);
      const taughtSubjectNames = [...new Set(
        tEntries.map((e) => {
          const s = state.subjects.find((sub) => sub.id === e.subjectId);
          return s ? (compact ? compactSubjectName(s.name, s.code) : s.name) : 'Mapel';
        }),
      )].join(', ');

      const classJpCols: number[] = classes.map((c) => {
        const count = tEntries.filter((e) => e.classId === c.id).length;
        classJpTotals[c.id] = (classJpTotals[c.id] || 0) + count;
        return count;
      });

      const totalTeacherJp = tEntries.length;
      const teacherMax = t.maxWeeklyJP > 0 ? t.maxWeeklyJP : (state.settings.maxWeeklyJP ?? 24);
      const tAstro = jpToAstronomical(totalTeacherJp, periodMinutes);
      let status = 'Sesuai Kuota';
      if (totalTeacherJp > teacherMax) status = 'Melebihi Batas';
      else if (totalTeacherJp === teacherMax) status = 'Maksimal';

      const cleanNip = formatCleanNip(t.nip);
      const teacherDisplayName = cleanNip ? `${t.name}\nNIP. ${cleanNip}` : t.name;

      p2Rows.push([
        idx + 1,
        t.code,
        teacherDisplayName,
        t.roleTitle || 'Guru Mapel',
        taughtSubjectNames || '—',
        ...classJpCols.map((jp) => (jp > 0 ? `${jp} JP` : '—')),
        `${totalTeacherJp} JP`,
        `${teacherMax} JP`,
        `${tAstro.hours} Jam (${tAstro.minutes}m)`,
        status,
      ]);
    });

    // Summary Total Row
    p2Rows.push([
      '',
      '',
      'TOTAL ALOKASI JP KELAS',
      '—',
      `${state.subjects.length} Mata Pelajaran`,
      ...classes.map((c) => `${classJpTotals[c.id] || 0} JP`),
      `${totalSchoolJp} JP`,
      '—',
      `${astroTotal.hours} Jam (${astroTotal.minutes}m)`,
      '100% Terdistribusi',
    ]);

    const availRecapW = pageWidth - 24;
    const baseFixedCols = [9.5, 13, 44, 34, 32]; // No (never wraps!), Kode, Nama, Jabatan, Mapel
    const classColBase = classes.length <= 6 ? 13.5 : 10.5;
    const tailCols = [15, 14, 23, 22]; // Total JP, Maks JP, Jam Astro, Status Beban
    const totalBaseRecapW =
      baseFixedCols.reduce((a, b) => a + b, 0) +
      classes.length * classColBase +
      tailCols.reduce((a, b) => a + b, 0);
    const scaleFactor = availRecapW / totalBaseRecapW;

    const recapColStyles: Record<number, { halign: 'center' | 'left' | 'right'; cellWidth: number; fontStyle?: 'bold' | 'normal' }> = {
      0: { halign: 'center', cellWidth: baseFixedCols[0] * scaleFactor },
      1: { halign: 'center', cellWidth: baseFixedCols[1] * scaleFactor, fontStyle: 'bold' },
      2: { halign: 'left', cellWidth: baseFixedCols[2] * scaleFactor, fontStyle: 'bold' },
      3: { halign: 'left', cellWidth: baseFixedCols[3] * scaleFactor },
      4: { halign: 'left', cellWidth: baseFixedCols[4] * scaleFactor },
    };

    let nextCol = 5;
    classes.forEach(() => {
      recapColStyles[nextCol] = { halign: 'center', cellWidth: classColBase * scaleFactor };
      nextCol++;
    });

    recapColStyles[nextCol] = { halign: 'center', cellWidth: tailCols[0] * scaleFactor, fontStyle: 'bold' };
    recapColStyles[nextCol + 1] = { halign: 'center', cellWidth: tailCols[1] * scaleFactor };
    recapColStyles[nextCol + 2] = { halign: 'center', cellWidth: tailCols[2] * scaleFactor };
    recapColStyles[nextCol + 3] = { halign: 'center', cellWidth: tailCols[3] * scaleFactor };

    const compactRecapPadding = activeTeachers.length <= 15 ? 1.25 : 1.65;

    autoTable(doc, {
      startY: p2Y,
      head: [p2Headers],
      body: p2Rows,
      theme: 'grid',
      tableLineWidth: 0.24,
      tableLineColor: [212, 223, 217],
      headStyles: {
        fillColor: TEAL,
        textColor: 255,
        fontSize: 7.0,
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
        cellPadding: { top: 1.8, bottom: 1.8, left: 1.4, right: 1.4 },
      },
      bodyStyles: {
        fontSize: 6.7,
        halign: 'center',
        valign: 'middle',
        cellPadding: { top: compactRecapPadding, bottom: compactRecapPadding, left: 1.5, right: 1.5 },
        textColor: [20, 35, 33],
        lineColor: [223, 232, 227],
      },
      columnStyles: recapColStyles,
      didParseCell: (data) => {
        if (data.row.index === p2Rows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [232, 244, 238];
          data.cell.styles.textColor = [11, 52, 53];
        }
      },
      alternateRowStyles: {
        fillColor: [251, 253, 252],
      },
      margin: { left: 12, right: 12 },
    });

    const lastTableP2 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable;
    const nextP2Y = lastTableP2.finalY + 2.8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(90, 105, 100);
    doc.text(
      `* Catatan: Beban JP dihitung otomatis berdasarkan alokasi kurikulum madrasah (1 JP = ${periodMinutes} menit).`,
      12,
      nextP2Y,
    );

    // Official Signature Block anchored cleanly on Page 2 when space allows (no lonely Page 3!)
    addSignatureBlock(doc, state, nextP2Y + 1.5, {
      city: options?.signerCity,
      date: options?.signerDate,
      leftTitle: options?.leftTitle || options?.coordinatorTitle || 'Waka Bidang Kurikulum',
      leftName: options?.leftName || options?.coordinatorName,
      leftNip: options?.leftNip || options?.coordinatorNip,
      rightTitle:
        options?.rightTitle ||
        buildRightSignerTitle(options?.principalTitle || state.settings.headmasterTitle, schoolName),
      rightName: options?.rightName || options?.principalName,
      rightNip: options?.rightNip || options?.principalNip,
    });
  }

  addDocFooter(doc, schoolName);

  const cleanYear = academicYear.replace(/[^a-zA-Z0-9]/g, '_');
  const paperSuffix = paperSize.toUpperCase();
  doc.save(`SAKALA_Jadwal_Semua_Kelas_${paperSuffix}_${cleanYear}.pdf`);
}

/**
 * 3. Export Teacher Schedule PDF (A4/F4 Portrait)
 */
export function exportScheduleTeacherPDF(
  state: AppState,
  teacherId: string,
  options?: {
    paperSize?: PaperSize;
    entriesOverride?: ScheduleEntry[];
    sourceMode?: 'PUBLISHED' | 'DRAFT';
    versionInfo?: {
      id: string;
      version: number;
      createdAt: string;
      fingerprint: string;
      academicYear?: string;
      semester?: 'Ganjil' | 'Genap';
    };
    skipSave?: boolean;
  },
): jsPDF | undefined {
  const teacher = state.teachers.find((t) => t.id === teacherId) ?? state.teachers[0];
  if (!teacher) return undefined;

  const paperSize = options?.paperSize ?? 'a4';
  const doc = createJsPDFDocument('portrait', paperSize);
  const rawEntries = options?.entriesOverride ?? state.draft ?? state.activeSchedule ?? [];
  const entries = rawEntries.filter((e) => e.teacherId === teacher.id);
  const activeDays = state.settings.activeDays;
  const astro = jpToAstronomical(entries.length, state.settings.periodMinutes ?? 40);

  let currentY = renderOfficialKopSurat(doc, state, 10);

  const pageWidth = doc.internal.pageSize.getWidth();
  const isDraftMode =
    options?.sourceMode === 'DRAFT' ||
    (options?.sourceMode === undefined && options?.entriesOverride === undefined && state.draft !== null);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...TEAL);
  doc.text(
    isDraftMode
      ? `JADWAL MENGAJAR INDIVIDUAL GURU (PRATINJAU DRAFT)`
      : `JADWAL MENGAJAR INDIVIDUAL GURU`,
    pageWidth / 2,
    currentY,
    { align: 'center' },
  );

  currentY += 4.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text(`${teacher.name} (${teacher.code}) — ${teacher.roleTitle || 'Guru Mapel'}`, pageWidth / 2, currentY, { align: 'center' });

  currentY += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  const nipText = teacher.nip ? `NIP. ${teacher.nip} · ` : '';
  doc.text(
    `${nipText}Total Beban: ${entries.length} JP (${astro.hours} Jam Astronomis) · Kuota Maksimum: ${teacher.maxWeeklyJP > 0 ? teacher.maxWeeklyJP : (state.settings.maxWeeklyJP ?? 24)} JP/minggu`,
    pageWidth / 2,
    currentY,
    { align: 'center' },
  );

  if (isDraftMode) {
    currentY += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(143, 45, 36);
    doc.text(
      'PRATINJAU DRAFT - BELUM DITERBITKAN; BUKAN DOKUMEN RESMI ATAU DASAR SK',
      pageWidth / 2,
      currentY,
      { align: 'center' },
    );
  } else if (options?.versionInfo) {
    currentY += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...TEAL);
    const periodText =
      options.versionInfo.academicYear && options.versionInfo.semester
        ? `TA ${options.versionInfo.academicYear} ${options.versionInfo.semester}`
        : 'Periode tidak tercatat pada versi lama';
    const publishedStamp = options.versionInfo.createdAt.slice(0, 10);
    doc.text(
      `Sumber Resmi: Versi ${options.versionInfo.version} (${options.versionInfo.id}) · Terbit ${publishedStamp} · ${periodText} · FP ${options.versionInfo.fingerprint}`,
      pageWidth / 2,
      currentY,
      { align: 'center' },
    );
  }

  currentY += 6;

  const tableHeaders = ['Jam / JP', ...activeDays];
  const tableData: string[][] = [];
  const isRowNonKbm: Record<number, boolean> = {};

  const timelineRows = getTimelineRows(state.slots, state.settings.teachingPeriodsPerDay);

  timelineRows.forEach((tRow, rIdx) => {
    if (!tRow.isKbm) {
      isRowNonKbm[rIdx] = true;
      const timeLabel = `${tRow.defaultLabel}\n${tRow.start} - ${tRow.end}`;
      const row = [timeLabel];
      activeDays.forEach((day) => {
        const slot = state.slots.find((s) => s.day === day && s.order === tRow.order);
        row.push(slot?.activityName || slot?.label || tRow.defaultLabel);
      });
      tableData.push(row);
      return;
    }

    const jp = tRow.jpNo!;
    const timeLabel = `JP ${jp}\n${tRow.start} - ${tRow.end}`;
    const row = [timeLabel];

    for (const day of activeDays) {
      const entry = entries.find((e) => e.day === day && e.jpNo === jp);
      if (entry) {
        const cls = state.classes.find((c) => c.id === entry.classId);
        const sub = state.subjects.find((s) => s.id === entry.subjectId);
        row.push(`Kelas ${cls?.name ?? ''}\n${sub?.name ?? ''}`);
      } else {
        row.push('—');
      }
    }
    tableData.push(row);
  });

  autoTable(doc, {
    startY: currentY,
    head: [tableHeaders],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: TEAL,
      textColor: 255,
      fontSize: 8.5,
      fontStyle: 'bold',
      halign: 'center',
    },
    bodyStyles: {
      fontSize: 8,
      halign: 'center',
      valign: 'middle',
      cellPadding: 3,
    },
    didParseCell: (data) => {
      if (data.section === 'body') {
        if (isRowNonKbm[data.row.index]) {
          data.cell.styles.fillColor = [240, 246, 243];
          data.cell.styles.textColor = [16, 63, 62];
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fontSize = 7.2;
        }
      }
    },
    alternateRowStyles: {
      fillColor: [248, 250, 248],
    },
    margin: { left: 14, right: 14 },
  });

  const lastTable = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable;

  // Breakdown per class
  const classBreakdown: Array<{ className: string; subject: string; jp: number }> = [];
  const classIds = [...new Set(entries.map((e) => e.classId))];

  for (const cid of classIds) {
    const cls = state.classes.find((c) => c.id === cid);
    const classEntries = entries.filter((e) => e.classId === cid);
    const subNames = [...new Set(classEntries.map((e) => state.subjects.find((s) => s.id === e.subjectId)?.name ?? ''))].join(', ');
    if (cls) {
      classBreakdown.push({
        className: cls.name,
        subject: subNames,
        jp: classEntries.length,
      });
    }
  }

  let nextY = lastTable.finalY + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...TEAL);
  doc.text('Rincian Beban Mengajar per Kelas:', 14, nextY);
  nextY += 3;

  autoTable(doc, {
    startY: nextY,
    head: [['Kelas', 'Mata Pelajaran', 'Alokasi Terjadwal']],
    body: classBreakdown.map((b) => [`Kelas ${b.className}`, b.subject, `${b.jp} JP`]),
    theme: 'plain',
    headStyles: {
      fillColor: TEAL_LIGHT,
      textColor: TEAL,
      fontSize: 8,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: 8,
      cellPadding: 2,
    },
    margin: { left: 14, right: 14 },
  });

  const finalTable = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable;
  addSignatureBlock(doc, state, finalTable.finalY);
  addDocFooter(doc, state.settings.schoolName);

  const cleanName = teacher.name.replace(/[^a-zA-Z0-9]/g, '_');
  if (!options?.skipSave) {
    doc.save(`SAKALA_Jadwal_Guru_${cleanName}.pdf`);
  }
  return doc;
}

export interface AttendanceRecapPdfOptions extends Partial<OfficialDocCustomTexts> {
  paperSize?: PaperSize;
  orientation?: 'landscape' | 'portrait';
  endMonth?: string;
  kopSurat?: boolean;
  includeSignature?: boolean;
  includeNotes?: boolean;
  includePrintMeta?: boolean;
  layoutDensity?: 'compact' | 'standard';
  principalTitle?: string;
  officerTitle?: string;
  officerName?: string;
  officerNip?: string;
}

/**
 * 4. Export Monthly or Multi-Month Range Teacher Attendance Recap PDF
 * Integrated directly with real `state.attendance` records (Hadir, Sakit, Izin, Alpa).
 * Supports single month ("2026-07") OR multi-month range ("2026-07" .. "2026-12") via `options.endMonth`.
 */
export function exportAttendanceRecapPDF(
  state: AppState,
  monthYear: string, // start month, e.g. "2026-07"
  selectedTeacherIds: string[],
  options?: AttendanceRecapPdfOptions,
): void {
  const orientation = options?.orientation ?? 'landscape';
  const paperSize = options?.paperSize ?? 'a4';
  const doc = createJsPDFDocument(orientation, paperSize);
  const pageWidth = doc.internal.pageSize.getWidth();

  const allTeachers = state.teachers.filter(
    (t) => t.isActive !== false && selectedTeacherIds.includes(t.id),
  );
  const attendanceList = state.attendance ?? [];
  const recapSummary = computeRangeAttendanceRecap(
    attendanceList,
    allTeachers,
    monthYear,
    options?.endMonth,
  );

  const {
    months,
    isMultiMonth,
    periodLabel,
    recordedDaysCount,
    sumHadirAll,
    sumSakitAll,
    sumIzinAll,
    sumAlpaAll,
    teachersWithRecordsCount,
    overallAvgRate,
    overallPredikat,
  } = recapSummary;

  const printCity = (options?.signerCity || state.settings.city || 'Madrasah').trim();

  let currentY = 8;

  // 1. KOP SURAT RESMI MADRASAH (COMPACT FORMAL LETTERHEAD)
  if (options?.kopSurat !== false) {
    currentY = renderOfficialKopSurat(doc, state, 8, options, true);
  } else {
    addDocHeader(
      doc,
      options?.documentTitle ||
        (isMultiMonth
          ? `REKAPITULASI PRESENSI GURU · ${periodLabel.toUpperCase()}`
          : `REKAPITULASI PRESENSI GURU · BULAN ${periodLabel.toUpperCase()}`),
      `Laporan kehadiran riil untuk ${allTeachers.length} pendidik aktif`,
      options?.schoolName || state.settings.schoolName,
      options?.academicYear || state.settings.academicYear,
      options?.semester || state.settings.semester,
    );
    currentY = 54;
  }

  // 2. DOCUMENT TITLE & PERIODE (generous clearance below kop divider)
  currentY += 1.4;
  const defaultTitle = isMultiMonth
    ? 'LAPORAN REKAPITULASI KEHADIRAN GURU MULTI-BULAN'
    : 'LAPORAN REKAPITULASI KEHADIRAN GURU BULANAN';
  const attTitle = options?.documentTitle || defaultTitle;
  const attSemester = options?.semester || state.settings.semester;
  const attYear = options?.academicYear || state.settings.academicYear;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.0);
  doc.setTextColor(11, 52, 53);
  doc.text(attTitle.toUpperCase(), pageWidth / 2, currentY, { align: 'center' });

  currentY += 4.3;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(80, 95, 90);
  doc.text(
    `Periode: ${periodLabel}  ·  Semester ${attSemester}  ·  Tahun Ajaran ${attYear}`,
    pageWidth / 2,
    currentY,
    { align: 'center' },
  );

  // Subtle centered gold accent divider beneath header
  currentY += 2.1;
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.5);
  doc.line(pageWidth / 2 - 22, currentY, pageWidth / 2 + 22, currentY);

  currentY += 3.5;

  const isLand = orientation === 'landscape';
  const inlineMonthlyColumns = isMultiMonth && isLand && months.length <= 5;
  const appendMonthlyAppendixPage = isMultiMonth && !inlineMonthlyColumns;

  const hasAnyRecordedData = teachersWithRecordsCount > 0;

  // 3. EXECUTIVE 4-CARD SUMMARY STRIP (CLEAN ARCHITECTURAL LEFT-ACCENT STYLE)
  const cardGap = 3.5;
  const totalContentW = pageWidth - 28;
  const boxWidth = (totalContentW - cardGap * 3) / 4;
  const boxHeight = 10.4;

  const kpis = [
    { label: 'PENDIDIK TERDATA', value: `${allTeachers.length} Guru`, accent: TEAL },
    {
      label: isMultiMonth ? 'CAKUPAN & HARI PRESENSI' : 'HARI TERCATAT PRESENSI',
      value: isMultiMonth
        ? `${months.length} Bln · ${recordedDaysCount} Hari`
        : recordedDaysCount > 0
        ? `${recordedDaysCount} Hari`
        : 'Belum Tercatat',
      accent: TEAL,
    },
    {
      label: 'RATA-RATA KEHADIRAN',
      value: hasAnyRecordedData ? `${overallAvgRate}%` : '—',
      accent:
        overallAvgRate >= 85
          ? ([27, 94, 67] as [number, number, number])
          : ([166, 58, 46] as [number, number, number]),
    },
    { label: 'PREDIKAT MADRASAH', value: overallPredikat, accent: GOLD },
  ];

  kpis.forEach((kpi, kIdx) => {
    const x = 14 + kIdx * (boxWidth + cardGap);
    doc.setFillColor(249, 251, 250);
    doc.setDrawColor(214, 225, 220);
    doc.setLineWidth(0.24);
    doc.roundedRect(x, currentY, boxWidth, boxHeight, 1.6, 1.6, 'FD');

    doc.setFillColor(...kpi.accent);
    doc.roundedRect(x + 1.8, currentY + 1.9, 1.15, boxHeight - 3.8, 0.5, 0.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.8);
    doc.setTextColor(92, 112, 105);
    doc.text(kpi.label, x + 5.1, currentY + 4.0);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.1);
    doc.setTextColor(11, 41, 35);
    doc.text(kpi.value, x + 5.1, currentY + 8.5);
  });

  currentY += boxHeight + 3.5;

  // 4. BUILD MAIN TABLE ROWS
  const tableData: Array<Array<string | number>> = [];
  const rowRates: number[] = [];

  recapSummary.rows.forEach((row) => {
    const { teacher, hadir, sakit, izin, alpa, hasData, rate, predikat, monthlyBreakdown } = row;
    rowRates.push(hasData ? rate : -1);

    const cleanTeacherNip = formatCleanNip(teacher.nip);
    const teacherDisplayName = cleanTeacherNip
      ? `${teacher.name}\nNIP. ${cleanTeacherNip}`
      : teacher.name;

    const monthCells = inlineMonthlyColumns
      ? months.map((ym) => {
          const b = monthlyBreakdown[ym];
          if (!b || !b.hasData) return '—';
          return `${b.rate}%\n(${b.hadir}H)`;
        })
      : [];

    tableData.push([
      row.no,
      teacher.code,
      teacherDisplayName,
      teacher.roleTitle || 'Guru Mapel',
      ...monthCells,
      hadir,
      sakit,
      izin,
      alpa,
      hasData ? `${rate}%` : '—',
      predikat,
    ]);
  });

  const headers = [
    'No',
    'Kode',
    'Nama Lengkap & NIP',
    'Jabatan',
    ...(inlineMonthlyColumns ? months.map((ym) => formatMonthShortYear(ym)) : []),
    'Hadir (H)',
    'Sakit (S)',
    'Izin (I)',
    'Alpa (A)',
    '% Hadir',
    'Predikat',
  ];

  // Append summary row
  const monthSummaryCells = inlineMonthlyColumns
    ? recapSummary.monthSummaries.map((ms) =>
        ms.recordedDaysCount > 0 ? `${ms.overallAvgRate}%\n(${ms.recordedDaysCount}h)` : '—',
      )
    : [];

  tableData.push([
    '',
    '',
    'TOTAL & RATA-RATA MADRASAH',
    `${allTeachers.length} Pendidik`,
    ...monthSummaryCells,
    sumHadirAll,
    sumSakitAll,
    sumIzinAll,
    sumAlpaAll,
    hasAnyRecordedData ? `${overallAvgRate}%` : '—',
    overallPredikat,
  ]);

  const availAttW = pageWidth - 28;
  const useCompactTable =
    options?.layoutDensity === 'compact' ||
    (options?.layoutDensity !== 'standard' && allTeachers.length <= 13);

  const monthColCount = inlineMonthlyColumns ? months.length : 0;
  const monthColWidthBase = inlineMonthlyColumns ? (months.length <= 3 ? 21 : 17) : 0;
  const baseColW = isLand
    ? [
        10,
        14,
        inlineMonthlyColumns ? 54 : 68,
        inlineMonthlyColumns ? 38 : 52,
        ...Array(monthColCount).fill(monthColWidthBase),
        16,
        14,
        14,
        14,
        18,
        25,
      ]
    : [9, 13, 48, 34, 14, 13, 13, 13, 15, 19];

  const totalBaseW = baseColW.reduce((a, b) => a + b, 0);
  const scale = availAttW / totalBaseW;

  const colStylesObj: Record<
    number,
    { halign: 'center' | 'left' | 'right'; cellWidth: number; fontStyle?: 'bold' | 'normal' }
  > = {
    0: { halign: 'center', cellWidth: baseColW[0] * scale },
    1: { halign: 'center', cellWidth: baseColW[1] * scale, fontStyle: 'bold' },
    2: { halign: 'left', cellWidth: baseColW[2] * scale },
    3: { halign: 'left', cellWidth: baseColW[3] * scale },
  };
  let colPtr = 4;
  for (let mIdx = 0; mIdx < monthColCount; mIdx++) {
    colStylesObj[colPtr] = { halign: 'center', cellWidth: baseColW[colPtr] * scale };
    colPtr++;
  }
  const hadirColIdx = colPtr;
  const alpaColIdx = colPtr + 3;
  const rateColIdx = colPtr + 4;
  const predColIdx = colPtr + 5;

  colStylesObj[hadirColIdx] = { halign: 'center', cellWidth: baseColW[hadirColIdx] * scale, fontStyle: 'bold' };
  colStylesObj[colPtr + 1] = { halign: 'center', cellWidth: baseColW[colPtr + 1] * scale };
  colStylesObj[colPtr + 2] = { halign: 'center', cellWidth: baseColW[colPtr + 2] * scale };
  colStylesObj[alpaColIdx] = { halign: 'center', cellWidth: baseColW[alpaColIdx] * scale };
  colStylesObj[rateColIdx] = { halign: 'center', cellWidth: baseColW[rateColIdx] * scale, fontStyle: 'bold' };
  colStylesObj[predColIdx] = { halign: 'center', cellWidth: baseColW[predColIdx] * scale };

  autoTable(doc, {
    startY: currentY,
    head: [headers],
    body: tableData,
    theme: 'grid',
    tableLineWidth: 0.24,
    tableLineColor: [212, 223, 217],
    headStyles: {
      fillColor: [11, 52, 53],
      textColor: 255,
      fontSize: isLand ? (inlineMonthlyColumns ? 6.8 : 7.5) : 6.9,
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
      cellPadding: { top: 2.0, bottom: 2.0, left: 1.4, right: 1.4 },
      lineWidth: 0.24,
      lineColor: [11, 52, 53],
    },
    bodyStyles: {
      fontSize: isLand ? (inlineMonthlyColumns ? 6.6 : useCompactTable ? 7.1 : 7.4) : 6.7,
      halign: 'center',
      valign: 'middle',
      cellPadding: useCompactTable
        ? { top: 1.3, bottom: 1.3, left: 1.5, right: 1.5 }
        : { top: 1.8, bottom: 1.8, left: 1.6, right: 1.6 },
      textColor: [20, 35, 33],
      lineWidth: 0.2,
      lineColor: [223, 232, 227],
    },
    columnStyles: colStylesObj,
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const isTotalRow = data.row.index === tableData.length - 1;
      if (isTotalRow) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [232, 244, 238];
        data.cell.styles.textColor = [11, 52, 53];
        data.cell.styles.lineColor = [180, 208, 195];
        return;
      }

      if (data.column.index === rateColIdx) {
        const rate = rowRates[data.row.index] ?? -1;
        if (rate >= 90) {
          data.cell.styles.fillColor = [235, 246, 240];
          data.cell.styles.textColor = [27, 94, 67];
        } else if (rate >= 75) {
          data.cell.styles.fillColor = [251, 244, 232];
          data.cell.styles.textColor = [156, 111, 40];
        } else if (rate >= 0) {
          data.cell.styles.fillColor = [253, 240, 238];
          data.cell.styles.textColor = [166, 58, 46];
        }
      }

      if (data.column.index === alpaColIdx) {
        const rawVal = Number(data.cell.raw);
        if (rawVal > 0) {
          data.cell.styles.textColor = [166, 58, 46];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    alternateRowStyles: {
      fillColor: [251, 253, 252],
    },
    margin: { left: 14, right: 14 },
  });

  const lastTable = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable;
  let nextY = lastTable.finalY + 3.0;

  // 5. OFFICIAL NOTES
  if (options?.includeNotes !== false) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.6);
    doc.setTextColor(90, 105, 100);
    doc.text(
      '* Keterangan: H = Hadir Bertugas, S = Sakit, I = Izin, A = Alpa / Tanpa Keterangan.',
      14,
      nextY,
    );
    nextY += 2.8;
    doc.text(
      isMultiMonth
        ? `* Persentase Kehadiran dihitung kumulatif dari data riil Presensi Guru sepanjang periode ${periodLabel}.`
        : '* Persentase Kehadiran dihitung langsung dari data riil Presensi Guru tercatat pada bulan berjalan.',
      14,
      nextY,
    );
    nextY += 1.4;
  }

  // 6. FORMAL SIGNATURE BLOCK
  if (options?.includeSignature !== false) {
    const resolvedSchoolName = options?.schoolName || state.settings.schoolName;
    const resolvedPrincipalTitle = options?.principalTitle || state.settings.headmasterTitle || 'Kepala Madrasah';
    addSignatureBlock(doc, state, nextY + 1.4, {
      city: printCity,
      date: options?.signerDate,
      leftTitle: options?.leftTitle || options?.officerTitle || 'Koordinator Akademik & Kurikulum',
      leftName: options?.leftName || options?.officerName,
      leftNip: options?.leftNip || options?.officerNip,
      rightTitle:
        options?.rightTitle ||
        buildRightSignerTitle(resolvedPrincipalTitle, resolvedSchoolName),
      rightName: options?.rightName || options?.principalName,
      rightNip: options?.rightNip || options?.principalNip,
    });
  }

  // 7. DEDICATED APPENDIX PAGE WHEN RANGE > 5 MONTHS (OR PORTRAIT MULTI-MONTH)
  if (appendMonthlyAppendixPage) {
    doc.addPage(getPaperDimensions(paperSize, 'landscape'), 'landscape');
    const landW = doc.internal.pageSize.getWidth();
    let appY = 8;
    if (options?.kopSurat !== false) {
      appY = renderOfficialKopSurat(doc, state, 8, options, true);
    } else {
      appY = 14;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...TEAL);
    doc.text(
      `LAMPIRAN MATRIKS KEHADIRAN PER BULAN · ${periodLabel.toUpperCase()}`,
      landW / 2,
      appY,
      { align: 'center' },
    );
    appY += 5;

    const appHeaders = [
      'No',
      'Kode',
      'Nama Pendidik',
      ...months.map((ym) => formatMonthShortYear(ym)),
      'Total',
    ];
    const appBody = recapSummary.rows.map((r) => [
      r.no,
      r.teacher.code,
      r.teacher.name,
      ...months.map((ym) => {
        const b = r.monthlyBreakdown[ym];
        return b && b.hasData ? `${b.rate}%\n${b.hadir}H` : '—';
      }),
      r.hasData ? `${r.rate}%` : '—',
    ]);

    const appAvailW = landW - 24;
    const mWidth = Math.max(12, Math.min(20, (appAvailW - 76) / months.length));
    const appScale = appAvailW / (8 + 12 + 42 + months.length * mWidth + 14);
    const appColStyles: Record<number, { halign: 'center' | 'left'; cellWidth: number; fontStyle?: 'bold' }> = {
      0: { halign: 'center', cellWidth: 8 * appScale },
      1: { halign: 'center', cellWidth: 12 * appScale, fontStyle: 'bold' },
      2: { halign: 'left', cellWidth: 42 * appScale, fontStyle: 'bold' },
    };
    months.forEach((_, idx) => {
      appColStyles[3 + idx] = { halign: 'center', cellWidth: mWidth * appScale };
    });
    appColStyles[3 + months.length] = { halign: 'center', cellWidth: 14 * appScale, fontStyle: 'bold' };

    autoTable(doc, {
      startY: appY,
      head: [appHeaders],
      body: appBody,
      theme: 'grid',
      headStyles: {
        fillColor: TEAL,
        textColor: 255,
        fontSize: 6.8,
        fontStyle: 'bold',
        halign: 'center',
        cellPadding: 1.6,
      },
      bodyStyles: {
        fontSize: 6.4,
        halign: 'center',
        valign: 'middle',
        cellPadding: 1.2,
        textColor: [20, 35, 33],
      },
      columnStyles: appColStyles,
      alternateRowStyles: { fillColor: [251, 253, 252] },
      margin: { left: 12, right: 12 },
    });
  }

  // 8. OFFICIAL FOOTER ON ALL PAGES
  const printMetaText =
    options?.includePrintMeta !== false
      ? `Dicetak di ${printCity} · Periode ${periodLabel}`
      : undefined;
  addDocFooter(doc, options?.schoolName || state.settings.schoolName, printMetaText);

  const cleanPeriodFile = periodLabel.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  const paperSuffix = paperSize.toUpperCase();
  doc.save(`SAKALA_Rekap_Presensi_Guru_${paperSuffix}_${cleanPeriodFile}.pdf`);
}

