import { Node } from '@tiptap/core';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { isSafeInlineImageDataUrl } from './contentValidation';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageBreak: {
      insertPageBreak: () => ReturnType;
    };
    docImage: {
      insertDocImage: (options: {
        src: string;
        alt?: string;
        widthMm?: number;
        align?: 'left' | 'center' | 'right';
      }) => ReturnType;
    };
  }
}

export const PageBreakNode = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-page-break="true"]' }];
  },

  renderHTML() {
    return [
      'div',
      {
        'data-page-break': 'true',
        class: 's04-page-break',
        contenteditable: 'false',
      },
      ['span', {}, 'Pemisah Halaman Manual (Page Break)'],
    ];
  },

  addCommands() {
    return {
      insertPageBreak:
        () =>
        ({ commands }) => {
          return commands.insertContent([
            { type: this.name },
            { type: 'paragraph' },
          ]);
        },
    };
  },
});

export const DocImageNode = Node.create({
  name: 'docImage',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (el) => {
          const img = el.querySelector('img');
          const raw = img?.getAttribute('src') ?? el.getAttribute('data-src');
          return isSafeInlineImageDataUrl(raw) ? raw : null;
        },
      },
      alt: {
        default: 'Logo / Gambar Dokumen',
        parseHTML: (el) => el.querySelector('img')?.getAttribute('alt') ?? 'Gambar Dokumen',
      },
      widthMm: {
        default: 26,
        parseHTML: (el) => {
          const w = Number(el.getAttribute('data-width-mm'));
          return Number.isFinite(w) && w >= 10 && w <= 180 ? w : 26;
        },
      },
      align: {
        default: 'center',
        parseHTML: (el) => {
          const a = el.getAttribute('data-align');
          return a === 'left' || a === 'right' || a === 'center' ? a : 'center';
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'figure[data-doc-image="true"]' }];
  },

  renderHTML({ node }) {
    const src = isSafeInlineImageDataUrl(node.attrs.src) ? node.attrs.src : '';
    const alt = typeof node.attrs.alt === 'string' ? node.attrs.alt : 'Gambar Dokumen';
    const widthMm =
      typeof node.attrs.widthMm === 'number' &&
      Number.isFinite(node.attrs.widthMm) &&
      node.attrs.widthMm >= 10 &&
      node.attrs.widthMm <= 180
        ? node.attrs.widthMm
        : 26;
    const align =
      node.attrs.align === 'left' || node.attrs.align === 'right' ? node.attrs.align : 'center';

    return [
      'figure',
      {
        'data-doc-image': 'true',
        'data-width-mm': String(widthMm),
        'data-align': align,
        class: `s04-doc-image align-${align}`,
        contenteditable: 'false',
      },
      [
        'img',
        {
          src,
          alt,
          style: `width: ${widthMm}mm; max-width: 100%; height: auto;`,
        },
      ],
    ];
  },

  addCommands() {
    return {
      insertDocImage:
        (options) =>
        ({ commands }) => {
          if (!isSafeInlineImageDataUrl(options.src)) {
            return false;
          }
          const widthMm =
            typeof options.widthMm === 'number' &&
            Number.isFinite(options.widthMm) &&
            options.widthMm >= 10 &&
            options.widthMm <= 180
              ? options.widthMm
              : 26;
          const align =
            options.align === 'left' || options.align === 'right' ? options.align : 'center';
          return commands.insertContent([
            {
              type: this.name,
              attrs: {
                src: options.src,
                alt: (options.alt ?? 'Gambar Dokumen').slice(0, 200),
                widthMm,
                align,
              },
            },
            { type: 'paragraph' },
          ]);
        },
    };
  },
});

const VALID_TABLE_LAYOUTS = new Set(['grid', 'borderless', 'meta', 'letter_header', 'signature']);

export const ExtendedTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      repeatHeader: {
        default: true,
        parseHTML: (element) => element.getAttribute('data-repeat-header') !== 'false',
        renderHTML: (attributes) => ({
          'data-repeat-header': attributes.repeatHeader !== false ? 'true' : 'false',
        }),
      },
      tableLayout: {
        default: 'grid',
        parseHTML: (element) => {
          const raw = element.getAttribute('data-table-layout');
          return raw && VALID_TABLE_LAYOUTS.has(raw) ? raw : 'grid';
        },
        renderHTML: (attributes) => {
          const layout =
            typeof attributes.tableLayout === 'string' && VALID_TABLE_LAYOUTS.has(attributes.tableLayout)
              ? attributes.tableLayout
              : 'grid';
          return {
            'data-table-layout': layout,
          };
        },
      },
    };
  },
});

export const ExtendedTableRow = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      rowHeightMm: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-row-height-mm');
          if (!raw) return null;
          const num = Number(raw);
          return Number.isFinite(num) && num >= 5 && num <= 80 ? num : null;
        },
        renderHTML: (attributes) => {
          const h = attributes.rowHeightMm;
          if (typeof h === 'number' && Number.isFinite(h) && h >= 5 && h <= 80) {
            return {
              'data-row-height-mm': String(h),
              style: `height: ${h}mm;`,
            };
          }
          return {};
        },
      },
    };
  },
});

export const ExtendedTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      verticalAlign: {
        default: 'top',
        parseHTML: (element) => {
          const va = element.getAttribute('data-valign') || element.style?.verticalAlign;
          return va === 'middle' || va === 'bottom' ? va : 'top';
        },
        renderHTML: (attributes) => {
          const va =
            attributes.verticalAlign === 'middle' || attributes.verticalAlign === 'bottom'
              ? attributes.verticalAlign
              : 'top';
          return {
            'data-valign': va,
            style: `vertical-align: ${va};`,
          };
        },
      },
    };
  },
});

export const ExtendedTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      verticalAlign: {
        default: 'top',
        parseHTML: (element) => {
          const va = element.getAttribute('data-valign') || element.style?.verticalAlign;
          return va === 'middle' || va === 'bottom' ? va : 'top';
        },
        renderHTML: (attributes) => {
          const va =
            attributes.verticalAlign === 'middle' || attributes.verticalAlign === 'bottom'
              ? attributes.verticalAlign
              : 'top';
          return {
            'data-valign': va,
            style: `vertical-align: ${va};`,
          };
        },
      },
    };
  },
});
