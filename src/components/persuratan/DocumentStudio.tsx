import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import {
  AlertTriangle,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Bold,
  CheckCircle2,
  Columns,
  Database,
  FileText,
  Heading1,
  Heading2,
  Info,
  Italic,
  List,
  ListOrdered,
  PanelRightClose,
  PanelRightOpen,
  Pilcrow,
  Redo2,
  RemoveFormatting,
  Rows,
  Save,
  Settings2,
  Sparkles,
  Table2,
  Tag,
  Trash2,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react';
import type { AppState } from '../../domain/types';
import type {
  DocumentIntakeDraft,
  DocumentStudioPageSettings,
  DocumentStudioState,
  TipTapJSONContent,
  TipTapJSONNode,
} from '../../domain/persuratan/types';
import { collectAllTemplates } from '../../domain/persuratan/templates/selectors';
import { saveStudioDraftToState } from '../../domain/persuratan/intake/draftEngine';
import { buildInitialStudioContentFromDraft } from '../../domain/persuratan/studio/contentGenerator';
import {
  extractPlainTextAndTokens,
  getEffectivePaperDimensionsMm,
  sanitizePastedHtml,
  validateStudioPageSettings,
  validateTipTapContent,
} from '../../domain/persuratan/studio/contentValidation';
import {
  PAPER_DIMENSIONS_MM,
  STUDIO_MARGIN_MAX_MM,
  STUDIO_MARGIN_MIN_MM,
} from '../../domain/persuratan/studio/types';
import './DocumentStudio.css';

type DrawerTab = 'detail' | 'snapshots' | 'placeholders' | 'page';

export interface DocumentStudioProps {
  state: AppState;
  draft: DocumentIntakeDraft;
  storageError?: string | null;
  onRetryStorage?: () => void;
  onPersistStudioState: (
    nextState: AppState,
    savedDraft: DocumentIntakeDraft
  ) => Promise<void> | void;
  onBackToIntake: () => void;
  onBackToCenter: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onNotify?: (message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

function renderStaticPreviewNodes(nodes: TipTapJSONNode[]) {
  return nodes.map((node, idx) => {
    const align =
      node.attrs?.textAlign && typeof node.attrs.textAlign === 'string'
        ? (node.attrs.textAlign as 'left' | 'center' | 'right' | 'justify')
        : undefined;
    const text = (node.content ?? [])
      .map((c) => (typeof c.text === 'string' ? c.text : ''))
      .join('');

    if (node.type === 'heading') {
      return (
        <h2 key={idx} style={{ textAlign: align }}>
          {text}
        </h2>
      );
    }
    if (node.type === 'horizontalRule') {
      return <hr key={idx} />;
    }
    if (node.type === 'orderedList' || node.type === 'bulletList') {
      const TagName = node.type === 'orderedList' ? 'ol' : 'ul';
      return (
        <TagName key={idx}>
          {(node.content ?? []).map((li, liIdx) => (
            <li key={liIdx}>
              {(li.content ?? [])
                .flatMap((p) => p.content ?? [])
                .map((t) => t.text ?? '')
                .join('')}
            </li>
          ))}
        </TagName>
      );
    }
    if (node.type === 'table') {
      return (
        <table key={idx}>
          <tbody>
            {(node.content ?? []).map((row, rIdx) => (
              <tr key={rIdx}>
                {(row.content ?? []).map((cell, cIdx) => {
                  const CellTag = cell.type === 'tableHeader' ? 'th' : 'td';
                  const cellText = (cell.content ?? [])
                    .flatMap((p) => p.content ?? [])
                    .map((t) => t.text ?? '')
                    .join(' ');
                  return <CellTag key={cIdx}>{cellText}</CellTag>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    return (
      <p key={idx} style={{ textAlign: align }}>
        {text || '\u00A0'}
      </p>
    );
  });
}

export function DocumentStudio({
  state,
  draft,
  storageError = null,
  onRetryStorage,
  onPersistStudioState,
  onBackToIntake,
  onBackToCenter,
  onDirtyChange,
  onNotify,
}: DocumentStudioProps) {
  const allTemplates = useMemo(
    () => collectAllTemplates(state.customTemplates ?? []),
    [state.customTemplates]
  );

  // Hitung konten awal HANYA ketika draft belum punya naskah tersimpan di `draft.studio`
  const initialGeneration = useMemo(
    () => buildInitialStudioContentFromDraft(draft, { activeTemplates: allTemplates }),
    [draft, allTemplates]
  );

  const hasSavedStudio = Boolean(draft.studio && draft.studio.content);

  const [docJson, setDocJson] = useState<TipTapJSONContent>(() =>
    hasSavedStudio ? draft.studio!.content : initialGeneration.content
  );
  const [pageSettings, setPageSettings] = useState<DocumentStudioPageSettings>(() =>
    hasSavedStudio ? draft.studio!.pageSettings : initialGeneration.pageSettings
  );
  const [pageError, setPageError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(
    draft.studio?.updatedAt ?? null
  );
  const [drawerOpen, setDrawerOpen] = useState<boolean>(true);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('detail');
  const [s03ConflictResolved, setS03ConflictResolved] = useState<boolean>(false);
  const [legacyMismatchAccepted, setLegacyMismatchAccepted] = useState<boolean>(false);
  const [estimatedPages, setEstimatedPages] = useState<number>(1);
  const [, setSelectionTick] = useState<number>(0);

  const paperRef = useRef<HTMLDivElement | null>(null);

  const markDirty = (nextDirty: boolean) => {
    setIsDirty(nextDirty);
    onDirtyChange?.(nextDirty);
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        blockquote: false,
        code: false,
        codeBlock: false,
        strike: false,
        link: false,
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Table.configure({
        resizable: false,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: hasSavedStudio ? draft.studio!.content : initialGeneration.content,
    editorProps: {
      attributes: {
        class: 's04-prosemirror',
        'aria-label': 'Editor naskah Document Studio S04',
        spellcheck: 'true',
      },
      transformPastedHTML: (html: string) => sanitizePastedHtml(html),
    },
    onUpdate: ({ editor: ed }) => {
      const json = ed.getJSON() as TipTapJSONContent;
      setDocJson(json);
      setSaveError(null);
      markDirty(true);
    },
    onSelectionUpdate: () => {
      setSelectionTick((t) => t + 1);
    },
  });

  // Observasi tinggi kertas fisik untuk indikasi jujur perkiraan jumlah halaman (tanpa klaim paginasi mutlak)
  useEffect(() => {
    const el = paperRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const dims = getEffectivePaperDimensionsMm(pageSettings.paperSize, pageSettings.orientation);
    const singlePagePx = Math.max(100, dims.heightMm * 3.7795275591);

    const computePages = () => {
      const h = el.scrollHeight;
      setEstimatedPages(Math.max(1, Math.ceil(h / singlePagePx)));
    };

    computePages();
    const ro = new ResizeObserver(() => computePages());
    ro.observe(el);
    return () => ro.disconnect();
  }, [pageSettings.paperSize, pageSettings.orientation, docJson]);

  const textStats = useMemo(() => extractPlainTextAndTokens(docJson), [docJson]);
  const isDemoSnapshot = useMemo(
    () => (draft.sourceSnapshots ?? []).some((s) => s.isDemoData),
    [draft.sourceSnapshots]
  );

  const paperDims = useMemo(
    () => getEffectivePaperDimensionsMm(pageSettings.paperSize, pageSettings.orientation),
    [pageSettings.paperSize, pageSettings.orientation]
  );

  const handleApplyPageSettings = (nextCandidate: DocumentStudioPageSettings) => {
    const check = validateStudioPageSettings(nextCandidate);
    if (!check.valid || !check.normalized) {
      setPageError(check.error ?? 'Pengaturan halaman tidak valid.');
      return;
    }
    setPageError(null);
    setPageSettings(check.normalized);
    markDirty(true);
  };

  const handleSaveStudio = async (overrideOptions?: {
    overrideContent?: TipTapJSONContent;
    clearS03ConflictFlag?: boolean;
  }) => {
    const pageCheck = validateStudioPageSettings(pageSettings);
    if (!pageCheck.valid || !pageCheck.normalized) {
      const errMsg = pageCheck.error ?? 'Margin/ukuran halaman tidak valid.';
      setPageError(errMsg);
      setSaveError(errMsg);
      onNotify?.(errMsg, 'warning');
      return;
    }

    const latestJson =
      overrideOptions?.overrideContent ??
      (editor ? (editor.getJSON() as TipTapJSONContent) : docJson);

    const contentCheck = validateTipTapContent(latestJson);
    if (!contentCheck.valid) {
      const errMsg = contentCheck.error ?? 'Struktur konten naskah tidak valid.';
      setSaveError(errMsg);
      onNotify?.(errMsg, 'error');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const now = new Date().toISOString();
      const studioPayload: DocumentStudioState = {
        schemaVersion: 1,
        editorStatus: 'IN_PROGRESS',
        content: latestJson,
        pageSettings: pageCheck.normalized,
        updatedAt: now,
      };

      const saved = saveStudioDraftToState(state, draft.id, studioPayload, {
        timestamp: now,
        clearS03ConflictFlag: overrideOptions?.clearS03ConflictFlag ?? s03ConflictResolved,
      });

      await Promise.resolve(onPersistStudioState(saved.state, saved.draft));

      // Dirty flag HANYA dibersihkan setelah persistensi selesai tanpa error
      setDocJson(latestJson);
      setLastSavedAt(now);
      markDirty(false);
      onNotify?.(`Naskah draft (${saved.documentRecord.id}) berhasil disimpan ke penyimpanan lokal.`, 'success');
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : 'Gagal menyimpan naskah Document Studio ke penyimpanan lokal.';
      setSaveError(msg);
      onNotify?.(msg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRebuildFromUpdatedS03 = () => {
    const rebuilt = buildInitialStudioContentFromDraft(draft, {
      activeTemplates: allTemplates,
      allowVersionMismatchFallback: true,
    });
    if (editor) {
      editor.commands.setContent(rebuilt.content);
    }
    setDocJson(rebuilt.content);
    setPageSettings(rebuilt.pageSettings);
    setS03ConflictResolved(true);
    markDirty(true);
    onNotify?.(
      'Naskah disusun ulang dari data S03 terbaru. Klik "Simpan Draft" untuk menyimpan salinan baru.',
      'info'
    );
  };

  const handleKeepExistingStudioOverS03 = () => {
    setS03ConflictResolved(true);
    markDirty(true);
    onNotify?.(
      'Naskah S04 saat ini dipertahankan. Klik "Simpan Draft" untuk menutup penanda pembaruan S03.',
      'info'
    );
  };

  const handleUseLegacyMatchedTemplate = () => {
    const rebuilt = buildInitialStudioContentFromDraft(draft, {
      activeTemplates: allTemplates,
      allowVersionMismatchFallback: true,
    });
    if (editor) {
      editor.commands.setContent(rebuilt.content);
    }
    setDocJson(rebuilt.content);
    setLegacyMismatchAccepted(true);
    markDirty(true);
  };

  const preserveFocusMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const isInsideTable = editor ? editor.isActive('table') : false;
  const showS03ConflictBanner =
    Boolean(draft.s03EditedAfterStudioAt) && !s03ConflictResolved;
  const showLegacyMismatchBanner =
    !hasSavedStudio &&
    initialGeneration.resolution.status === 'VERSION_MISMATCH' &&
    !legacyMismatchAccepted;

  return (
    <section
      className="s04-studio-root"
      data-doc-editor="true"
      aria-label="Document Studio S04"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          void handleSaveStudio();
        }
      }}
    >
      {/* Top Header */}
      <header className="s04-header-card">
        <div>
          <nav className="s04-breadcrumb" aria-label="Breadcrumb Document Studio">
            <span>Persuratan &amp; Arsip</span>
            <span>›</span>
            <span>Form Data Awal (S03)</span>
            <span>›</span>
            <strong>Document Studio (S04)</strong>
          </nav>
          <div className="s04-title-row">
            <h1 className="s04-doc-title">{draft.title}</h1>
            <span className="s04-status-badge">
              <FileText size={13} aria-hidden="true" />
              <span>
                {draft.templateSnapshot.code} · {draft.templateSnapshot.name} (v{draft.templateSnapshot.version})
              </span>
            </span>
          </div>
        </div>

        <div className="s04-header-badges">
          {isDemoSnapshot && (
            <span className="s04-status-badge is-demo" title="Draft ini memuat snapshot dari mode dataset demo">
              <Sparkles size={13} aria-hidden="true" />
              <span>Dataset Demo Aktif</span>
            </span>
          )}
          <span className="s04-status-badge">
            <span>Draft S04 · Belum Bernomor</span>
          </span>
          <span
            className={`s04-status-badge ${
              isDirty ? 'is-dirty' : lastSavedAt ? 'is-saved' : ''
            }`}
          >
            {isDirty ? (
              <>
                <AlertTriangle size={13} aria-hidden="true" />
                <span>Perubahan belum disimpan</span>
              </>
            ) : lastSavedAt ? (
              <>
                <CheckCircle2 size={13} aria-hidden="true" />
                <span>Tersimpan lokal</span>
              </>
            ) : (
              <>
                <Info size={13} aria-hidden="true" />
                <span>Draft Baru dari S03</span>
              </>
            )}
          </span>
        </div>
      </header>

      {/* Storage / Save Failure Banner */}
      {(storageError || saveError) && (
        <div className="s04-banner is-error" role="alert">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} aria-hidden="true" />
            <span>{saveError ?? storageError}</span>
          </div>
          {onRetryStorage && storageError && (
            <button
              type="button"
              className="s02-btn-secondary"
              onClick={onRetryStorage}
            >
              Coba Sinkron Ulang Penyimpanan
            </button>
          )}
        </div>
      )}

      {/* Explicit S03 Edited After Studio Conflict Banner (No Silent Overwrite) */}
      {showS03ConflictBanner && (
        <div className="s04-banner is-warning" role="region" aria-label="Pemberitahuan pembaruan Data Awal S03">
          <div>
            <strong>Data Awal S03 telah diperbarui</strong> setelah penyuntingan S04 dimulai.
            Naskah yang sudah Anda ketik di S04 tetap dipertahankan agar tidak hilang diam-diam.
          </div>
          <div className="s04-banner-actions">
            <button
              type="button"
              className="s02-btn-secondary"
              onClick={handleKeepExistingStudioOverS03}
            >
              Pertahankan Naskah S04
            </button>
            <button
              type="button"
              className="s02-btn-primary"
              onClick={handleRebuildFromUpdatedS03}
            >
              Buat Ulang dari Data S03 Baru
            </button>
          </div>
        </div>
      )}

      {/* Explicit Legacy Template Version Mismatch Banner */}
      {showLegacyMismatchBanner && (
        <div className="s04-banner is-warning" role="region" aria-label="Perbedaan versi template draft lama">
          <div>
            <strong>Perbedaan Versi Template:</strong> {initialGeneration.resolution.notice}
          </div>
          <div className="s04-banner-actions">
            <button
              type="button"
              className="s02-btn-secondary"
              onClick={() => setLegacyMismatchAccepted(true)}
            >
              Lanjutkan Kanvas Aman
            </button>
            <button
              type="button"
              className="s02-btn-primary"
              onClick={handleUseLegacyMatchedTemplate}
            >
              Gunakan Struktur Template v{initialGeneration.resolution.activeVersion}
            </button>
          </div>
        </div>
      )}

      {/* Horizontal WYSIWYG Formatting Toolbar */}
      <div className="s04-toolbar-wrap" role="toolbar" aria-label="Toolbar pemformatan naskah Document Studio">
        <div className="s04-toolbar-groups">
          <div className="s04-tool-group">
            <button
              type="button"
              className="s04-tool-btn"
              aria-label="Urungkan (Undo)"
              title="Urungkan (Ctrl+Z)"
              disabled={!editor?.can().undo()}
              onMouseDown={preserveFocusMouseDown}
              onClick={() => editor?.chain().focus().undo().run()}
            >
              <Undo2 size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="s04-tool-btn"
              aria-label="Ulangi (Redo)"
              title="Ulangi (Ctrl+Y)"
              disabled={!editor?.can().redo()}
              onMouseDown={preserveFocusMouseDown}
              onClick={() => editor?.chain().focus().redo().run()}
            >
              <Redo2 size={14} aria-hidden="true" />
            </button>
          </div>

          <div className="s04-tool-group">
            <button
              type="button"
              className="s04-tool-btn"
              aria-label="Paragraf Normal"
              aria-pressed={editor?.isActive('paragraph') ?? false}
              title="Paragraf Normal"
              onMouseDown={preserveFocusMouseDown}
              onClick={() => editor?.chain().focus().setParagraph().run()}
            >
              <Pilcrow size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="s04-tool-btn"
              aria-label="Judul Besar H1"
              aria-pressed={editor?.isActive('heading', { level: 1 }) ?? false}
              title="Judul Utama (Heading 1)"
              onMouseDown={preserveFocusMouseDown}
              onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
            >
              <Heading1 size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="s04-tool-btn"
              aria-label="Subjudul H2"
              aria-pressed={editor?.isActive('heading', { level: 2 }) ?? false}
              title="Subjudul (Heading 2)"
              onMouseDown={preserveFocusMouseDown}
              onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
            >
              <Heading2 size={14} aria-hidden="true" />
            </button>
          </div>

          <div className="s04-tool-group">
            <button
              type="button"
              className="s04-tool-btn"
              aria-label="Tebal (Bold)"
              aria-pressed={editor?.isActive('bold') ?? false}
              title="Tebal (Ctrl+B)"
              onMouseDown={preserveFocusMouseDown}
              onClick={() => editor?.chain().focus().toggleBold().run()}
            >
              <Bold size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="s04-tool-btn"
              aria-label="Miring (Italic)"
              aria-pressed={editor?.isActive('italic') ?? false}
              title="Miring (Ctrl+I)"
              onMouseDown={preserveFocusMouseDown}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
            >
              <Italic size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="s04-tool-btn"
              aria-label="Garis Bawah (Underline)"
              aria-pressed={editor?.isActive('underline') ?? false}
              title="Garis Bawah (Ctrl+U)"
              onMouseDown={preserveFocusMouseDown}
              onClick={() => editor?.chain().focus().toggleUnderline().run()}
            >
              <UnderlineIcon size={14} aria-hidden="true" />
            </button>
          </div>

          <div className="s04-tool-group">
            <button
              type="button"
              className="s04-tool-btn"
              aria-label="Rata Kiri"
              aria-pressed={editor?.isActive({ textAlign: 'left' }) ?? false}
              title="Rata Kiri"
              onMouseDown={preserveFocusMouseDown}
              onClick={() => editor?.chain().focus().setTextAlign('left').run()}
            >
              <AlignLeft size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="s04-tool-btn"
              aria-label="Rata Tengah"
              aria-pressed={editor?.isActive({ textAlign: 'center' }) ?? false}
              title="Rata Tengah"
              onMouseDown={preserveFocusMouseDown}
              onClick={() => editor?.chain().focus().setTextAlign('center').run()}
            >
              <AlignCenter size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="s04-tool-btn"
              aria-label="Rata Kanan"
              aria-pressed={editor?.isActive({ textAlign: 'right' }) ?? false}
              title="Rata Kanan"
              onMouseDown={preserveFocusMouseDown}
              onClick={() => editor?.chain().focus().setTextAlign('right').run()}
            >
              <AlignRight size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="s04-tool-btn"
              aria-label="Rata Kiri-Kanan (Justify)"
              aria-pressed={editor?.isActive({ textAlign: 'justify' }) ?? false}
              title="Rata Kiri-Kanan"
              onMouseDown={preserveFocusMouseDown}
              onClick={() => editor?.chain().focus().setTextAlign('justify').run()}
            >
              <AlignJustify size={14} aria-hidden="true" />
            </button>
          </div>

          <div className="s04-tool-group">
            <button
              type="button"
              className="s04-tool-btn"
              aria-label="Daftar Poin (Bullet List)"
              aria-pressed={editor?.isActive('bulletList') ?? false}
              title="Daftar Poin"
              onMouseDown={preserveFocusMouseDown}
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
            >
              <List size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="s04-tool-btn"
              aria-label="Daftar Bernomor (Numbered List)"
              aria-pressed={editor?.isActive('orderedList') ?? false}
              title="Daftar Bernomor"
              onMouseDown={preserveFocusMouseDown}
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            >
              <ListOrdered size={14} aria-hidden="true" />
            </button>
          </div>

          <div className="s04-tool-group">
            <button
              type="button"
              className="s04-tool-btn"
              aria-label="Sisipkan Tabel 3x3"
              title="Sisipkan Tabel 3 Kolom × 3 Baris"
              onMouseDown={preserveFocusMouseDown}
              onClick={() =>
                editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
              }
            >
              <Table2 size={14} aria-hidden="true" />
              <span>Tabel</span>
            </button>
            {isInsideTable && (
              <>
                <button
                  type="button"
                  className="s04-tool-btn"
                  aria-label="Tambah Baris Tabel"
                  title="Tambah Baris di Bawah"
                  onMouseDown={preserveFocusMouseDown}
                  onClick={() => editor?.chain().focus().addRowAfter().run()}
                >
                  <Rows size={13} aria-hidden="true" />
                  <span>+Baris</span>
                </button>
                <button
                  type="button"
                  className="s04-tool-btn"
                  aria-label="Tambah Kolom Tabel"
                  title="Tambah Kolom di Kanan"
                  onMouseDown={preserveFocusMouseDown}
                  onClick={() => editor?.chain().focus().addColumnAfter().run()}
                >
                  <Columns size={13} aria-hidden="true" />
                  <span>+Kolom</span>
                </button>
                <button
                  type="button"
                  className="s04-tool-btn is-danger"
                  aria-label="Hapus Baris Tabel"
                  title="Hapus Baris Aktif"
                  onMouseDown={preserveFocusMouseDown}
                  onClick={() => editor?.chain().focus().deleteRow().run()}
                >
                  <span>−Baris</span>
                </button>
                <button
                  type="button"
                  className="s04-tool-btn is-danger"
                  aria-label="Hapus Kolom Tabel"
                  title="Hapus Kolom Aktif"
                  onMouseDown={preserveFocusMouseDown}
                  onClick={() => editor?.chain().focus().deleteColumn().run()}
                >
                  <span>−Kolom</span>
                </button>
                <button
                  type="button"
                  className="s04-tool-btn is-danger"
                  aria-label="Hapus Tabel"
                  title="Hapus Seluruh Tabel"
                  onMouseDown={preserveFocusMouseDown}
                  onClick={() => editor?.chain().focus().deleteTable().run()}
                >
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              </>
            )}
          </div>

          <div className="s04-tool-group">
            <button
              type="button"
              className="s04-tool-btn"
              aria-label="Bersihkan Pemformatan Teks"
              title="Bersihkan Pemformatan"
              onMouseDown={preserveFocusMouseDown}
              onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}
            >
              <RemoveFormatting size={14} aria-hidden="true" />
            </button>
          </div>
        </div>

        <button
          type="button"
          className="s02-btn-secondary"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen((prev) => !prev)}
          style={{ height: '32px', padding: '0 10px', fontSize: '12px' }}
        >
          {drawerOpen ? (
            <PanelRightClose size={14} aria-hidden="true" />
          ) : (
            <PanelRightOpen size={14} aria-hidden="true" />
          )}
          <span>{drawerOpen ? 'Tutup Panel' : 'Panel Detail & Kertas'}</span>
        </button>
      </div>

      {/* Main Editor + Collapsible Inspector Grid */}
      <div className={`s04-workbench ${drawerOpen ? '' : 'is-drawer-collapsed'}`}>
        <div className="s04-canvas-viewport">
          <div className="s04-canvas-meta-bar s5-tnum">
            <span>
              Kertas: <strong>{PAPER_DIMENSIONS_MM[pageSettings.paperSize].label}</strong> ·{' '}
              {pageSettings.orientation === 'portrait' ? 'Portrait' : 'Landscape'} · Margin{' '}
              {pageSettings.marginsMm.top}/{pageSettings.marginsMm.right}/
              {pageSettings.marginsMm.bottom}/{pageSettings.marginsMm.left} mm
            </span>
            <span>
              Perkiraan panjang: <strong>~{estimatedPages} halaman</strong> ·{' '}
              {textStats.unresolvedTokens.length > 0
                ? `${textStats.unresolvedTokens.length} placeholder belum terisi`
                : 'Semua token naskah terisi'}
            </span>
          </div>

          <div
            ref={paperRef}
            className="s04-paper-sheet"
            style={{
              width: `${paperDims.widthMm}mm`,
              minHeight: `${paperDims.heightMm}mm`,
              paddingTop: `${pageSettings.marginsMm.top}mm`,
              paddingRight: `${pageSettings.marginsMm.right}mm`,
              paddingBottom: `${pageSettings.marginsMm.bottom}mm`,
              paddingLeft: `${pageSettings.marginsMm.left}mm`,
            }}
          >
            {editor ? (
              <EditorContent editor={editor} />
            ) : (
              <div className="s04-prosemirror" aria-label="Pratinjau naskah awal Document Studio S04">
                {renderStaticPreviewNodes(docJson.content)}
              </div>
            )}
          </div>
        </div>

        {/* Collapsible Right Drawer */}
        {drawerOpen && (
          <aside className="s04-drawer" aria-label="Panel informasi Document Studio">
            <div className="s04-drawer-tabs" role="tablist" aria-label="Tab panel samping S04">
              <button
                type="button"
                role="tab"
                aria-selected={drawerTab === 'detail'}
                className={`s04-drawer-tab ${drawerTab === 'detail' ? 'is-active' : ''}`}
                onClick={() => setDrawerTab('detail')}
              >
                <FileText size={13} aria-hidden="true" />
                <span>Detail Dokumen</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={drawerTab === 'snapshots'}
                className={`s04-drawer-tab ${drawerTab === 'snapshots' ? 'is-active' : ''}`}
                onClick={() => setDrawerTab('snapshots')}
              >
                <Database size={13} aria-hidden="true" />
                <span>Sumber Snapshot</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={drawerTab === 'placeholders'}
                className={`s04-drawer-tab ${drawerTab === 'placeholders' ? 'is-active' : ''}`}
                onClick={() => setDrawerTab('placeholders')}
              >
                <Tag size={13} aria-hidden="true" />
                <span>Placeholder ({textStats.unresolvedTokens.length})</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={drawerTab === 'page'}
                className={`s04-drawer-tab ${drawerTab === 'page' ? 'is-active' : ''}`}
                onClick={() => setDrawerTab('page')}
              >
                <Settings2 size={13} aria-hidden="true" />
                <span>Pengaturan Halaman</span>
              </button>
            </div>

            <div className="s04-drawer-body">
              {drawerTab === 'detail' && (
                <dl className="s04-dl">
                  <div className="s04-dl-item">
                    <dt>ID Draft &amp; Dokumen</dt>
                    <dd style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '11.5px' }}>
                      {draft.id} · {draft.documentId}
                    </dd>
                  </div>
                  <div className="s04-dl-item">
                    <dt>Nomor Resmi</dt>
                    <dd>Belum Bernomor (diterbitkan pada Finalisasi S05)</dd>
                  </div>
                  <div className="s04-dl-item">
                    <dt>Template Asal (Snapshot Beku)</dt>
                    <dd>
                      {draft.templateSnapshot.code} — {draft.templateSnapshot.name} (v
                      {draft.templateSnapshot.version})
                    </dd>
                  </div>
                  <div className="s04-dl-item">
                    <dt>Tanggal Dokumen</dt>
                    <dd className="s5-tnum">{draft.documentDate}</dd>
                  </div>
                  {draft.scheduleVersionId && (
                    <div className="s04-dl-item">
                      <dt>ScheduleVersion Terikat</dt>
                      <dd className="s5-tnum">
                        {draft.scheduleVersionId}
                        {draft.scheduleVersionFingerprint
                          ? ` (${draft.scheduleVersionFingerprint})`
                          : ''}
                      </dd>
                    </div>
                  )}
                  <div className="s04-dl-item">
                    <dt>Status Studio</dt>
                    <dd>
                      {hasSavedStudio
                        ? 'Sedang Disunting (Draft S04 Tersimpan)'
                        : 'Siap Disunting (Hasil Konversi Awal S03)'}
                    </dd>
                  </div>
                </dl>
              )}

              {drawerTab === 'snapshots' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <p style={{ margin: 0, color: '#4f6b63', fontSize: '12px' }}>
                    Naskah S04 membaca snapshot beku dari S03. Perubahan Data Master setelah draft
                    disimpan tidak mengubah isi surat ini secara diam-diam.
                  </p>
                  {draft.sourceSnapshots.map((snap, idx) => (
                    <div key={`${snap.sourceKey}-${idx}`} className="s04-snapshot-card">
                      <div style={{ fontWeight: 700, color: '#0e3c2f' }}>{snap.sourceLabel}</div>
                      <div style={{ fontSize: '11px', color: '#536d65' }}>
                        Sumber: {snap.provenance} · Status: {snap.status}
                        {snap.isDemoData ? ' · Dataset Demo' : ''}
                      </div>
                      {snap.sourceIdentity && (
                        <div
                          style={{
                            fontSize: '11px',
                            fontFamily: 'var(--font-mono, monospace)',
                            color: '#34524a',
                          }}
                        >
                          Ref: {snap.sourceIdentity}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {drawerTab === 'placeholders' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {textStats.unresolvedTokens.length === 0 ? (
                    <div style={{ color: '#0e5a44', fontWeight: 600 }}>
                      Tidak ada placeholder token tersisa pada naskah saat ini.
                    </div>
                  ) : (
                    <>
                      <p style={{ margin: 0, color: '#4f6b63', fontSize: '12px' }}>
                        Token berikut belum memiliki nilai isian di snapshot S03. Anda dapat
                        mengeditnya langsung pada naskah, kecuali placeholder nomor resmi yang akan
                        diisi saat Finalisasi S05.
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {textStats.unresolvedTokens.map((tok) => (
                          <span key={tok} className="s04-token-chip">
                            {`{{${tok}}}`}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {drawerTab === 'page' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div className="s04-field">
                    <label htmlFor="s04-paper-size">Ukuran Kertas</label>
                    <select
                      id="s04-paper-size"
                      value={pageSettings.paperSize}
                      onChange={(e) =>
                        handleApplyPageSettings({
                          ...pageSettings,
                          paperSize: e.target.value as 'a4' | 'f4',
                        })
                      }
                    >
                      <option value="a4">A4 (210 × 297 mm)</option>
                      <option value="f4">F4 / Folio (210 × 330 mm)</option>
                    </select>
                  </div>

                  <div className="s04-field">
                    <label htmlFor="s04-paper-orientation">Orientasi Halaman</label>
                    <select
                      id="s04-paper-orientation"
                      value={pageSettings.orientation}
                      onChange={(e) =>
                        handleApplyPageSettings({
                          ...pageSettings,
                          orientation: e.target.value as 'portrait' | 'landscape',
                        })
                      }
                    >
                      <option value="portrait">Portrait (Tegak)</option>
                      <option value="landscape">Landscape (Mendatar)</option>
                    </select>
                  </div>

                  <div className="s04-form-grid">
                    {(
                      [
                        ['top', 'Margin Atas (mm)'],
                        ['right', 'Margin Kanan (mm)'],
                        ['bottom', 'Margin Bawah (mm)'],
                        ['left', 'Margin Kiri (mm)'],
                      ] as const
                    ).map(([side, label]) => (
                      <div key={side} className="s04-field">
                        <label htmlFor={`s04-margin-${side}`}>{label}</label>
                        <input
                          id={`s04-margin-${side}`}
                          type="number"
                          min={STUDIO_MARGIN_MIN_MM}
                          max={STUDIO_MARGIN_MAX_MM}
                          step={1}
                          value={pageSettings.marginsMm[side]}
                          onChange={(e) => {
                            const num = Number(e.target.value);
                            handleApplyPageSettings({
                              ...pageSettings,
                              marginsMm: {
                                ...pageSettings.marginsMm,
                                [side]: num,
                              },
                            });
                          }}
                        />
                      </div>
                    ))}
                  </div>

                  {pageError && (
                    <div className="s04-banner is-error" role="alert" style={{ padding: '8px 10px' }}>
                      {pageError}
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Footer Action Bar */}
      <footer className="s04-footer-bar">
        <div className="s04-footer-note">
          <Info size={14} aria-hidden="true" />
          <span>
            Tahap 5 (S04): Penyuntingan naskah draft. Penomoran surat resmi, TTD, &amp; ekspor PDF/DOCX final tersedia pada Tahap 8 (S05).
          </span>
        </div>

        <div className="s04-footer-actions">
          <button
            type="button"
            className="s02-btn-secondary"
            onClick={onBackToIntake}
          >
            <ArrowLeft size={14} aria-hidden="true" />
            <span>Kembali ke Data Awal</span>
          </button>
          <button
            type="button"
            className="s02-btn-secondary"
            onClick={onBackToCenter}
          >
            <span>Kembali ke Pusat Persuratan</span>
          </button>
          <button
            type="button"
            className="s02-btn-primary"
            disabled={isSaving}
            onClick={() => void handleSaveStudio()}
          >
            <Save size={14} aria-hidden="true" />
            <span>{isSaving ? 'Menyimpan…' : 'Simpan Draft'}</span>
          </button>
        </div>
      </footer>
    </section>
  );
}
