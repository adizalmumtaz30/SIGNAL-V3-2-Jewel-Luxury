import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { AppState } from '../../types';
import type { DocumentRecord } from '../types';
import {
  DOCUMENT_KIND_LABELS,
  DOCUMENT_STATUS_LABELS,
  formatIndonesianDate,
  getRelatedTeacherNames,
} from '../selectors';
import { renderOfficialKopSurat } from '../../../utils/pdfExport';

function escapeCsvCell(raw: string): string {
  const s = String(raw ?? '').replace(/\r?\n/g, ' ').trim();
  if (/[",;\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export interface AgendaRowData {
  no: number;
  documentNumber: string;
  documentDate: string;
  directionLabel: string;
  kindLabel: string;
  titleAndSubject: string;
  counterpart: string;
  statusLabel: string;
}

export function buildAgendaRows(
  documents: DocumentRecord[],
  state: AppState
): AgendaRowData[] {
  return documents.map((doc, idx) => {
    const teachers = getRelatedTeacherNames(doc.relatedTeacherIds, state.teachers);
    const counterpartParts = [
      doc.counterpartName?.trim() || '',
      teachers.length > 0 ? teachers.slice(0, 3).join(', ') + (teachers.length > 3 ? ` (+${teachers.length - 3})` : '') : '',
    ].filter(Boolean);

    return {
      no: idx + 1,
      documentNumber: doc.documentNumber?.trim() || 'Belum Bernomor',
      documentDate: formatIndonesianDate(doc.documentDate),
      directionLabel: doc.direction === 'INCOMING' ? 'Surat Masuk' : 'Surat Keluar',
      kindLabel: DOCUMENT_KIND_LABELS[doc.documentType] ?? doc.documentType,
      titleAndSubject:
        doc.subject && doc.subject.trim() && doc.subject.trim() !== doc.title.trim()
          ? `${doc.title} — ${doc.subject}`
          : doc.title,
      counterpart: counterpartParts.join(' · ') || '—',
      statusLabel: DOCUMENT_STATUS_LABELS[doc.status] ?? doc.status,
    };
  });
}

/**
 * Menghasilkan string CSV (UTF-8 BOM) Buku Agenda Persuratan untuk Excel/Spreadsheet.
 * Tidak pernah menyertakan NIP guru.
 */
export function buildAgendaCsvString(
  documents: DocumentRecord[],
  state: AppState
): string {
  const headers = [
    'No',
    'Nomor Surat',
    'Tanggal Surat',
    'Arah',
    'Jenis Dokumen',
    'Judul / Perihal',
    'Pihak Terkait',
    'Status',
  ];
  const rows = buildAgendaRows(documents, state);
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((r) =>
      [
        String(r.no),
        r.documentNumber,
        r.documentDate,
        r.directionLabel,
        r.kindLabel,
        r.titleAndSubject,
        r.counterpart,
        r.statusLabel,
      ]
        .map(escapeCsvCell)
        .join(',')
    ),
  ];
  return `\uFEFF${lines.join('\r\n')}`;
}

export function triggerAgendaCsvDownload(
  documents: DocumentRecord[],
  state: AppState,
  fileName?: string
): { fileName: string; rowCount: number } {
  const safeName =
    fileName ||
    `Buku_Agenda_Persuratan_${(state.settings.schoolName || 'Madrasah')
      .replace(/[^A-Za-z0-9]+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    return { fileName: safeName, rowCount: documents.length };
  }
  const csv = buildAgendaCsvString(documents, state);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return { fileName: safeName, rowCount: documents.length };
}

/**
 * Menghasilkan dan mengunduh PDF Buku Agenda Persuratan (A4 Landscape) menggunakan jsPDF + autoTable.
 */
export function exportAgendaRegisterPdf(
  documents: DocumentRecord[],
  state: AppState,
  options?: { periodLabel?: string; saveFile?: boolean }
): { bytes: Uint8Array; fileName: string; rowCount: number } {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const schoolName = state.settings.schoolName?.trim() || 'Madrasah Tsanawiyah';
  const periodLabel =
    options?.periodLabel?.trim() ||
    `Tahun Ajaran ${state.settings.academicYear || '-'} · Semester ${state.settings.semester || '-'}`;

  const kopEndY = renderOfficialKopSurat(doc, state, 7, undefined, true);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(11, 41, 35);
  doc.text('BUKU AGENDA PERSURATAN MADRASAH', 148.5, kopEndY + 1, {
    align: 'center',
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(80, 96, 90);
  doc.text(
    `${periodLabel}   |   Total Tercatat: ${documents.length} dokumen   |   Dicetak: ${formatIndonesianDate(
      new Date().toISOString().slice(0, 10)
    )}`,
    148.5,
    kopEndY + 6,
    { align: 'center' }
  );

  const rows = buildAgendaRows(documents, state);

  autoTable(doc, {
    startY: kopEndY + 9,
    head: [['No', 'Nomor Surat', 'Tanggal', 'Arah', 'Jenis', 'Judul / Perihal', 'Pihak Terkait', 'Status']],
    body:
      rows.length > 0
        ? rows.map((r) => [
            String(r.no),
            r.documentNumber,
            r.documentDate,
            r.directionLabel,
            r.kindLabel,
            r.titleAndSubject,
            r.counterpart,
            r.statusLabel,
          ])
        : [['—', 'Belum ada dokumen pada filter aktif', '', '', '', '', '', '']],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8.2,
      cellPadding: 2.6,
      textColor: [20, 35, 31],
      lineColor: [210, 221, 215],
      lineWidth: 0.2,
      valign: 'top',
    },
    headStyles: {
      fillColor: [18, 64, 55],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.2,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 249],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 42 },
      2: { cellWidth: 26 },
      3: { cellWidth: 24 },
      4: { cellWidth: 28 },
      5: { cellWidth: 74 },
      6: { cellWidth: 42 },
      7: { cellWidth: 23 },
    },
    margin: { left: 14, right: 14, bottom: 20 },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 150;
  const sigY = finalY + 12 > 180 ? 180 : finalY + 12;
  const city = state.settings.city?.trim() || 'Madrasah';
  const headmaster = state.settings.headmasterName?.trim() || 'Kepala Madrasah';

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  doc.setTextColor(35, 50, 45);
  doc.text(`${city}, ${formatIndonesianDate(new Date().toISOString().slice(0, 10))}`, 220, sigY);
  doc.text('Mengetahui, Kepala Madrasah', 220, sigY + 5);
  doc.setFont('helvetica', 'bold');
  doc.text(headmaster, 220, sigY + 19);

  const fileName = `Buku_Agenda_Persuratan_${schoolName.replace(/[^A-Za-z0-9]+/g, '_')}_${new Date()
    .toISOString()
    .slice(0, 10)}.pdf`;

  const arrayBuffer = doc.output('arraybuffer');
  const bytes = new Uint8Array(arrayBuffer);

  if (options?.saveFile !== false && typeof document !== 'undefined') {
    doc.save(fileName);
  }

  return { bytes, fileName, rowCount: rows.length };
}
