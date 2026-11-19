import { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import {
  ExtendedTable,
  ExtendedTableCell,
  ExtendedTableHeader,
  ExtendedTableRow,
} from '../../domain/persuratan/studio/extensions';
import {
  Bold,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Table2,
} from 'lucide-react';
import type { TemplatePreviewBlock } from '../../domain/persuratan/templates/types';
import type { TipTapJSONContent, TipTapJSONNode } from '../../domain/persuratan/studio/types';
import './TemplateVisualEditor.css';

export interface TemplateVisualEditorProps {
  initialBlocks: TemplatePreviewBlock[];
  editorKey: string;
  onChangeBlocks: (blocks: TemplatePreviewBlock[]) => void;
}

export const QUICK_TEMPLATE_TOKENS: Array<{ label: string; token: string }> = [
  { label: 'Nomor Surat', token: '{{NOMOR_SURAT}}' },
  { label: 'Tanggal', token: '{{TANGGAL_SURAT}}' },
  { label: 'Nama Madrasah', token: '{{NAMA_MADRASAH}}' },
  { label: 'Kepala Madrasah', token: '{{NAMA_KEPALA_MADRASAH}}' },
  { label: 'Nama Guru', token: '{{NAMA_GURU}}' },
  { label: 'Nama Siswa', token: '{{NAMA_SISWA}}' },
  { label: 'Perihal', token: '{{PERIHAL}}' },
  { label: 'Pihak Tujuan', token: '{{PIHAK_TUJUAN}}' },
];

export function previewBlocksToTipTapDoc(blocks: TemplatePreviewBlock[]): TipTapJSONContent {
  const nodes: TipTapJSONNode[] = [];
  for (const blk of blocks) {
    if (blk.type === 'heading') {
      nodes.push({
        type: 'heading',
        attrs: { level: 2, textAlign: blk.align ?? 'left' },
        content: [{ type: 'text', text: blk.text }],
      });
    } else if (blk.type === 'paragraph') {
      nodes.push({
        type: 'paragraph',
        content: [{ type: 'text', text: blk.text }],
      });
    } else if (blk.type === 'list') {
      nodes.push({
        type: blk.ordered ? 'orderedList' : 'bulletList',
        content: blk.items.map((item) => ({
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: item }] }],
        })),
      });
    } else if (blk.type === 'meta_grid') {
      for (const r of blk.rows) {
        nodes.push({
          type: 'paragraph',
          content: [{ type: 'text', text: `${r.label}: ${r.value}` }],
        });
      }
    } else if (blk.type === 'table') {
      const headerRow: TipTapJSONNode = {
        type: 'tableRow',
        content: blk.columns.map((col) => ({
          type: 'tableHeader',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: col }] }],
        })),
      };
      const bodyRows: TipTapJSONNode[] = (blk.sampleRows ?? []).map((row) => ({
        type: 'tableRow',
        content: row.map((cell) => ({
          type: 'tableCell',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: cell }] }],
        })),
      }));
      nodes.push({
        type: 'table',
        content: [headerRow, ...bodyRows],
      });
    } else if (blk.type === 'signature') {
      nodes.push({
        type: 'paragraph',
        attrs: { textAlign: 'right' },
        content: [
          {
            type: 'text',
            text: `${blk.rightTitle} — ${blk.rightName}`,
          },
        ],
      });
    }
  }

  if (nodes.length === 0) {
    nodes.push({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Tulis struktur naskah template di sini…' }],
    });
  }

  return { type: 'doc', content: nodes };
}

function collectNodePlainText(node: TipTapJSONNode): string {
  if (typeof node.text === 'string') return node.text;
  return (node.content ?? []).map(collectNodePlainText).join('');
}

export function tipTapDocToPreviewBlocks(doc: TipTapJSONContent): TemplatePreviewBlock[] {
  const blocks: TemplatePreviewBlock[] = [];
  for (const node of doc.content ?? []) {
    if (node.type === 'heading') {
      const text = collectNodePlainText(node).trim();
      if (text) {
        const align: 'left' | 'center' =
          node.attrs?.textAlign === 'center' ? 'center' : 'left';
        blocks.push({ type: 'heading', text, align });
      }
    } else if (node.type === 'paragraph') {
      const text = collectNodePlainText(node).trim();
      if (text) {
        blocks.push({ type: 'paragraph', text });
      }
    } else if (node.type === 'bulletList' || node.type === 'orderedList') {
      const items = (node.content ?? [])
        .map((li) => collectNodePlainText(li).trim())
        .filter(Boolean);
      if (items.length > 0) {
        blocks.push({
          type: 'list',
          ordered: node.type === 'orderedList',
          items,
        });
      }
    } else if (node.type === 'table') {
      const rows = node.content ?? [];
      if (rows.length > 0) {
        const columns = (rows[0].content ?? []).map((cell) => collectNodePlainText(cell).trim() || 'Kolom');
        const sampleRows = rows.slice(1).map((r) =>
          (r.content ?? []).map((cell) => collectNodePlainText(cell).trim())
        );
        blocks.push({
          type: 'table',
          columns,
          sampleRows: sampleRows.length > 0 ? sampleRows : [columns.map(() => '...')],
        });
      }
    }
  }
  return blocks;
}

export function TemplateVisualEditor({
  initialBlocks,
  editorKey,
  onChangeBlocks,
}: TemplateVisualEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      ExtendedTable.configure({ resizable: false }),
      ExtendedTableRow,
      ExtendedTableHeader,
      ExtendedTableCell,
    ],
    content: previewBlocksToTipTapDoc(initialBlocks),
    onUpdate: ({ editor: ed }) => {
      const json = ed.getJSON() as TipTapJSONContent;
      onChangeBlocks(tipTapDocToPreviewBlocks(json));
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(previewBlocksToTipTapDoc(initialBlocks), { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorKey, editor]);

  const insertToken = (token: string) => {
    if (!editor) return;
    editor.chain().focus().insertContent(` ${token} `).run();
  };

  return (
    <div className="tve-shell" data-template-visual-editor="true">
      {/* Compact Formatting Toolbar */}
      <div className="tve-toolbar" role="toolbar" aria-label="Toolbar Editor Visual Template">
        <button
          type="button"
          className={`tve-tool-btn ${editor?.isActive('bold') ? 'is-active' : ''}`}
          onClick={() => editor?.chain().focus().toggleBold().run()}
          title="Tebal"
          aria-label="Tebal"
        >
          <Bold size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`tve-tool-btn ${editor?.isActive('italic') ? 'is-active' : ''}`}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          title="Miring"
          aria-label="Miring"
        >
          <Italic size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`tve-tool-btn ${editor?.isActive('heading', { level: 2 }) ? 'is-active' : ''}`}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Subjudul"
          aria-label="Subjudul"
        >
          <Heading2 size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`tve-tool-btn ${editor?.isActive('bulletList') ? 'is-active' : ''}`}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          title="Daftar Poin"
          aria-label="Daftar Poin"
        >
          <List size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`tve-tool-btn ${editor?.isActive('orderedList') ? 'is-active' : ''}`}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          title="Daftar Bernomor"
          aria-label="Daftar Bernomor"
        >
          <ListOrdered size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="tve-tool-btn"
          onClick={() =>
            editor?.chain().focus().insertTable({ rows: 2, cols: 3, withHeaderRow: true }).run()
          }
          title="Sisipkan Tabel"
          aria-label="Sisipkan Tabel"
        >
          <Table2 size={14} aria-hidden="true" />
          <span>Tabel</span>
        </button>
      </div>

      {/* 1-Click Token Insertion Bar */}
      <div className="tve-token-bar" aria-label="Sisip token cepat">
        <span className="tve-token-caption">Sisip Token:</span>
        {QUICK_TEMPLATE_TOKENS.map((item) => (
          <button
            key={item.token}
            type="button"
            className="tve-token-btn"
            onClick={() => insertToken(item.token)}
          >
            + {item.label}
          </button>
        ))}
      </div>

      {/* Visual Rich-Text Canvas */}
      <div className="tve-canvas">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
