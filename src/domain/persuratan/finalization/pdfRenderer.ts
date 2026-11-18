import autoTable from 'jspdf-autotable';
import type { AppState } from '../../types';
import { createJsPDFDocument, renderOfficialKopSurat } from '../../../utils/pdfExport';
import { getEffectivePaperDimensionsMm } from '../studio/contentValidation';
import type {
  DocumentStudioPageSettings,
  TipTapJSONContent,
  TipTapJSONNode,
} from '../studio/types';
import type { DocumentIntakeDraft } from '../types';
import { computeUint8ArraySha256, isPdfBytesSignatureValid } from './finalPdfStore';

const INK_RGB: [number, number, number] = [20, 42, 41];
const TEAL_RGB: [number, number, number] = [18, 64, 55];
const MUTED_RGB: [number, number, number] = [95, 114, 108];

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const NUMBER_TOKEN_PATTERNS = [
  /\{\{NOMOR_SURAT\}\}(?:\s*\[Belum diisi\])?/g,
  /\{\{NO_SURAT\}\}(?:\s*\[Belum diisi\])?/g,
  /\{\{NOMOR_SK\}\}(?:\s*\[Belum diisi\])?/g,
  /\{\{NO_SK\}\}(?:\s*\[Belum diisi\])?/g,
  /\{\{NOMOR_DOKUMEN\}\}(?:\s*\[Belum diisi\])?/g,
  /\{\{NO_DOKUMEN\}\}(?:\s*\[Belum diisi\])?/g,
  /\{\{NOMOR_URUT\}\}(?:\s*\[Belum diisi\])?/g,
  /\{\{NOMOR_ARSIP\}\}(?:\s*\[Belum diisi\])?/g,
  /\[Nomor Terbit S05\]/g,
];

/**
 * Mengganti placeholder nomor surat dengan nomor resmi yang disahkan tanpa memutasi input asal.
 */
export function substituteOfficialDocumentNumberInContent(
  content: TipTapJSONContent,
  officialNumber: string
): TipTapJSONContent {
  const cloned = deepClone(content);
  const replaceStr = (str: string): string => {
    let out = str;
    for (const pattern of NUMBER_TOKEN_PATTERNS) {
      out = out.replace(pattern, officialNumber);
    }
    return out;
  };

  const walk = (node: TipTapJSONNode) => {
    if (typeof node.text === 'string') {
      node.text = replaceStr(node.text);
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        walk(child);
      }
    }
  };

  for (const child of cloned.content) {
    walk(child);
  }
  return cloned;
}

function readSnapshotIdentity(
  draft: DocumentIntakeDraft,
  state: AppState
): Record<string, string | undefined> {
  const entry = draft.sourceSnapshots.find(
    (s) => s.sourceKey === 'settings.madrasah_identity_signatory'
  );
  const raw =
    entry?.capturedValue && typeof entry.capturedValue === 'object'
      ? (entry.capturedValue as Record<string, unknown>)
      : {};
  const s = state.settings;
  const pick = (k: keyof typeof s): string | undefined => {
    const snapVal = raw[k as string];
    if (typeof snapVal === 'string' && snapVal.trim()) return snapVal.trim();
    const live = s[k];
    return typeof live === 'string' && live.trim() ? live.trim() : undefined;
  };

  return {
    ministry: pick('ministry'),
    regionalOffice: pick('regionalOffice'),
    schoolName: pick('schoolName'),
    nsm: pick('nsm'),
    npsn: pick('npsn'),
    academicYear: pick('academicYear'),
    semester: pick('semester'),
    address: pick('address'),
    city: pick('city'),
    postalCode: pick('postalCode'),
    phone: pick('phone'),
    email: pick('email'),
    logoUrl: pick('logoUrl'),
  };
}

function collectPlainTextWithStyle(node: TipTapJSONNode): {
  text: string;
  hasBold: boolean;
  hasItalic: boolean;
} {
  let hasBold = false;
  let hasItalic = false;
  const chunks: string[] = [];

  const walk = (n: TipTapJSONNode) => {
    if (n.type === 'text' && typeof n.text === 'string') {
      chunks.push(n.text);
      if (Array.isArray(n.marks)) {
        for (const m of n.marks) {
          if (m.type === 'bold') hasBold = true;
          if (m.type === 'italic') hasItalic = true;
        }
      }
    } else if (n.type === 'hardBreak') {
      chunks.push('\n');
    } else if (Array.isArray(n.content)) {
      for (const c of n.content) walk(c);
    }
  };
  walk(node);

  return {
    text: chunks.join(''),
    hasBold,
    hasItalic,
  };
}

function detectImageFormat(dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' {
  if (/^data:image\/jpeg/i.test(dataUrl)) return 'JPEG';
  if (/^data:image\/webp/i.test(dataUrl)) return 'WEBP';
  return 'PNG';
}

export interface RenderedOfficialPdfResult {
  pdfBytes: Uint8Array;
  sha256: string;
  pageCount: number;
  resolvedContent: TipTapJSONContent;
}

/**
 * Merender dokumen Studio S04 menjadi berkas PDF resmi berpagination eksak dengan jsPDF & autoTable.
 * Tidak memanggil `doc.save()` agar aman di lingkungan unit test Node serta transaksi finalisasi S05.
 */
export async function renderOfficialDocumentPdf(params: {
  draft: DocumentIntakeDraft;
  content: TipTapJSONContent;
  pageSettings: DocumentStudioPageSettings;
  state: AppState;
  officialNumber?: string | null;
}): Promise<RenderedOfficialPdfResult> {
  const { draft, content, pageSettings, state, officialNumber } = params;
  const resolvedContent =
    officialNumber && officialNumber.trim()
      ? substituteOfficialDocumentNumberInContent(content, officialNumber.trim())
      : deepClone(content);

  const doc = createJsPDFDocument(pageSettings.orientation, pageSettings.paperSize);
  const { widthMm, heightMm } = getEffectivePaperDimensionsMm(
    pageSettings.paperSize,
    pageSettings.orientation
  );

  const marginTop = Math.max(10, pageSettings.marginsMm.top);
  const marginBottom = Math.max(12, pageSettings.marginsMm.bottom);
  const marginLeft = Math.max(10, pageSettings.marginsMm.left);
  const marginRight = Math.max(10, pageSettings.marginsMm.right);
  const contentWidth = Math.max(40, widthMm - marginLeft - marginRight);
  const headerOffset = pageSettings.headerText ? 8 : 0;
  const topStartY = marginTop + headerOffset;
  const bottomLimitY = heightMm - marginBottom - (pageSettings.footerText || pageSettings.showPageNumbers ? 8 : 0);

  let cursorY = topStartY;

  const ensureSpace = (neededMm: number) => {
    if (cursorY + neededMm > bottomLimitY) {
      doc.addPage();
      cursorY = topStartY;
    }
  };

  // 1. Render Kop Surat pada halaman pertama bila template mengaktifkannya
  const includeKop = draft.templateSnapshot.documentHeader?.includeKopSurat === true;
  if (includeKop) {
    const snapIdentity = readSnapshotIdentity(draft, state);
    cursorY = Math.max(
      cursorY,
      renderOfficialKopSurat(doc, state, Math.max(10, topStartY - 4), {
        ministry: snapIdentity.ministry,
        regionalOffice: snapIdentity.regionalOffice,
        schoolName: snapIdentity.schoolName,
        nsm: snapIdentity.nsm,
        npsn: snapIdentity.npsn,
        academicYear: snapIdentity.academicYear,
        semester: snapIdentity.semester,
        address: snapIdentity.address,
        city: snapIdentity.city,
        postalCode: snapIdentity.postalCode,
        phone: snapIdentity.phone,
        email: snapIdentity.email,
        logoUrl: snapIdentity.logoUrl,
      })
    );
  }

  // Helper render teks bernavigasi align & line wrap
  const drawTextBlock = (
    text: string,
    options: {
      fontSize: number;
      bold?: boolean;
      italic?: boolean;
      align?: 'left' | 'center' | 'right' | 'justify';
      color?: [number, number, number];
      indentMm?: number;
      gapAfterMm?: number;
    }
  ) => {
    const clean = text ?? '';
    const lineHeightMm = options.fontSize * 0.44;
    if (!clean.trim()) {
      cursorY += lineHeightMm * 0.6;
      return;
    }

    const fontStyle =
      options.bold && options.italic
        ? 'bolditalic'
        : options.bold
        ? 'bold'
        : options.italic
        ? 'italic'
        : 'normal';

    doc.setFont('helvetica', fontStyle);
    doc.setFontSize(options.fontSize);
    doc.setTextColor(...(options.color ?? INK_RGB));

    const indent = options.indentMm ?? 0;
    const availWidth = Math.max(20, contentWidth - indent);
    const wrapped = doc.splitTextToSize(clean, availWidth) as string[];
    const alignMode = options.align ?? 'left';

    for (const line of wrapped) {
      ensureSpace(lineHeightMm + 1);
      const xPos =
        alignMode === 'center'
          ? marginLeft + contentWidth / 2
          : alignMode === 'right'
          ? marginLeft + contentWidth
          : marginLeft + indent;
      doc.text(line, xPos, cursorY, {
        align: alignMode === 'justify' ? 'left' : alignMode,
      });
      cursorY += lineHeightMm;
    }

    cursorY += options.gapAfterMm ?? 1.8;
  };

  const renderNode = (node: TipTapJSONNode) => {
    if (node.type === 'pageBreak') {
      doc.addPage();
      cursorY = topStartY;
      return;
    }

    if (node.type === 'horizontalRule') {
      ensureSpace(4);
      doc.setDrawColor(160, 178, 170);
      doc.setLineWidth(0.35);
      doc.line(marginLeft, cursorY, marginLeft + contentWidth, cursorY);
      cursorY += 3.5;
      return;
    }

    if (node.type === 'docImage') {
      const src = typeof node.attrs?.src === 'string' ? node.attrs.src : '';
      if (!src) return;
      const widthReq =
        typeof node.attrs?.widthMm === 'number' && Number.isFinite(node.attrs.widthMm)
          ? Math.min(contentWidth, Math.max(10, node.attrs.widthMm))
          : 26;
      const imgHeight = widthReq; // proporsional persegi / lambang resmi
      ensureSpace(imgHeight + 4);
      const alignAttr = node.attrs?.align;
      const xPos =
        alignAttr === 'center'
          ? marginLeft + (contentWidth - widthReq) / 2
          : alignAttr === 'right'
          ? marginLeft + contentWidth - widthReq
          : marginLeft;
      try {
        doc.addImage(src, detectImageFormat(src), xPos, cursorY, widthReq, imgHeight);
        cursorY += imgHeight + 3;
      } catch {
        // Fallback aman bila encoder gambar gagal di runtime headless tertentu
        cursorY += 4;
      }
      return;
    }

    if (node.type === 'heading') {
      const level = node.attrs?.level === 1 ? 1 : node.attrs?.level === 3 ? 3 : 2;
      const { text } = collectPlainTextWithStyle(node);
      const align =
        node.attrs?.textAlign === 'center' ||
        node.attrs?.textAlign === 'right' ||
        node.attrs?.textAlign === 'justify'
          ? node.attrs.textAlign
          : 'left';
      drawTextBlock(text, {
        fontSize: level === 1 ? 13 : level === 2 ? 11.5 : 10.5,
        bold: true,
        align,
        color: level === 1 ? TEAL_RGB : INK_RGB,
        gapAfterMm: 2.5,
      });
      return;
    }

    if (node.type === 'paragraph') {
      const { text, hasBold, hasItalic } = collectPlainTextWithStyle(node);
      const align =
        node.attrs?.textAlign === 'center' ||
        node.attrs?.textAlign === 'right' ||
        node.attrs?.textAlign === 'justify'
          ? node.attrs.textAlign
          : 'left';
      drawTextBlock(text, {
        fontSize: 10.5,
        bold: hasBold,
        italic: hasItalic,
        align,
        gapAfterMm: 1.8,
      });
      return;
    }

    if (node.type === 'bulletList' || node.type === 'orderedList') {
      const isOrdered = node.type === 'orderedList';
      const startNum =
        isOrdered && typeof node.attrs?.start === 'number' ? node.attrs.start : 1;
      const items = node.content ?? [];
      items.forEach((li, idx) => {
        const prefix = isOrdered ? `${startNum + idx}. ` : '• ';
        const { text } = collectPlainTextWithStyle(li);
        drawTextBlock(`${prefix}${text.trim()}`, {
          fontSize: 10.2,
          indentMm: 4,
          gapAfterMm: 1.3,
        });
      });
      return;
    }

    if (node.type === 'table') {
      const allRows = (node.content ?? []).filter((r) => r.type === 'tableRow');
      if (allRows.length === 0) return;

      const buildAutoTableCell = (cell: TipTapJSONNode, minHeightMm?: number) => {
        const { text, hasBold } = collectPlainTextWithStyle(cell);
        const colspan =
          typeof cell.attrs?.colspan === 'number' && cell.attrs.colspan > 1
            ? cell.attrs.colspan
            : 1;
        const rowspan =
          typeof cell.attrs?.rowspan === 'number' && cell.attrs.rowspan > 1
            ? cell.attrs.rowspan
            : 1;
        const verticalAlign: 'top' | 'middle' | 'bottom' =
          cell.attrs?.verticalAlign === 'middle' || cell.attrs?.verticalAlign === 'bottom'
            ? cell.attrs.verticalAlign
            : 'top';
        const firstChildAlign = cell.content?.[0]?.attrs?.textAlign;
        const halign: 'left' | 'center' | 'right' =
          firstChildAlign === 'center' || firstChildAlign === 'right'
            ? firstChildAlign
            : 'left';

        return {
          content: text.trim(),
          colSpan: colspan,
          rowSpan: rowspan,
          styles: {
            valign: verticalAlign,
            halign,
            fontStyle: (hasBold || cell.type === 'tableHeader' ? 'bold' : 'normal') as
              | 'bold'
              | 'normal',
            ...(minHeightMm ? { minCellHeight: minHeightMm } : {}),
          },
        };
      };

      const headRows: Array<Array<ReturnType<typeof buildAutoTableCell>>> = [];
      const bodyRows: Array<Array<ReturnType<typeof buildAutoTableCell>>> = [];

      allRows.forEach((row, rIdx) => {
        const rowMinHeight =
          typeof row.attrs?.rowHeightMm === 'number' && Number.isFinite(row.attrs.rowHeightMm)
            ? row.attrs.rowHeightMm
            : undefined;
        const cells = (row.content ?? []).map((cell) => buildAutoTableCell(cell, rowMinHeight));
        const isHeaderRow =
          rIdx === 0 &&
          (row.content ?? []).length > 0 &&
          (row.content ?? []).every((c) => c.type === 'tableHeader');
        if (isHeaderRow) {
          headRows.push(cells);
        } else {
          bodyRows.push(cells);
        }
      });

      const repeatHead =
        node.attrs?.repeatHeader !== undefined
          ? Boolean(node.attrs.repeatHeader)
          : pageSettings.repeatTableHeader !== false;

      autoTable(doc, {
        startY: cursorY,
        margin: {
          top: topStartY,
          bottom: marginBottom + (pageSettings.footerText || pageSettings.showPageNumbers ? 8 : 0),
          left: marginLeft,
          right: marginRight,
        },
        head: headRows.length > 0 ? headRows : undefined,
        body: bodyRows,
        showHead: repeatHead ? 'everyPage' : 'firstPage',
        theme: 'grid',
        styles: {
          font: 'helvetica',
          fontSize: 9,
          textColor: INK_RGB,
          lineColor: [185, 198, 192],
          lineWidth: 0.25,
          cellPadding: 2,
          overflow: 'linebreak',
        },
        headStyles: {
          fillColor: [232, 242, 238],
          textColor: [11, 41, 35],
          fontStyle: 'bold',
        },
      });

      const lastTableY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable
        ?.finalY;
      cursorY = typeof lastTableY === 'number' ? lastTableY + 4 : cursorY + 12;
      return;
    }
  };

  for (const child of resolvedContent.content) {
    renderNode(child);
  }

  // 2. Render running headerText, footerText, dan penomoran halaman eksak di setiap halaman
  const pageCount = (
    doc as unknown as { internal: { getNumberOfPages: () => number } }
  ).internal.getNumberOfPages();

  for (let p = 1; p <= pageCount; p += 1) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED_RGB);

    if (pageSettings.headerText && pageSettings.headerText.trim()) {
      const headerY = Math.max(6, marginTop - 4);
      doc.text(pageSettings.headerText.trim(), marginLeft, headerY);
      doc.setDrawColor(215, 224, 220);
      doc.setLineWidth(0.2);
      doc.line(marginLeft, headerY + 1.8, widthMm - marginRight, headerY + 1.8);
    }

    if (pageSettings.footerText || pageSettings.showPageNumbers) {
      const footerY = heightMm - Math.max(5, marginBottom - 6);
      doc.setDrawColor(215, 224, 220);
      doc.setLineWidth(0.2);
      doc.line(marginLeft, footerY - 3.5, widthMm - marginRight, footerY - 3.5);

      if (pageSettings.footerText && pageSettings.footerText.trim()) {
        doc.text(pageSettings.footerText.trim(), marginLeft, footerY);
      }

      if (pageSettings.showPageNumbers) {
        const pageLabel =
          pageSettings.pageNumberFormat === 'HALAMAN_SAJA'
            ? `Halaman ${p}`
            : `Halaman ${p} dari ${pageCount}`;
        doc.text(pageLabel, widthMm - marginRight, footerY, { align: 'right' });
      }
    }
  }

  const arrayBuffer = doc.output('arraybuffer');
  const pdfBytes = new Uint8Array(arrayBuffer);
  if (!isPdfBytesSignatureValid(pdfBytes)) {
    throw new Error('Mesin PDF gagal menghasilkan header %PDF- yang valid.');
  }
  const sha256 = await computeUint8ArraySha256(pdfBytes);

  return {
    pdfBytes,
    sha256,
    pageCount,
    resolvedContent,
  };
}
