import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import {
  AlertTriangle,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpToLine,
  Bold,
  CheckCircle2,
  Clock,
  Columns,
  Combine,
  Database,
  FileCheck2,
  FileText,
  GitCompare,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Info,
  Italic,
  List,
  ListOrdered,
  Maximize2,
  Minimize2,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pilcrow,
  Redo2,
  RemoveFormatting,
  RotateCcw,
  Rows,
  Save,
  Settings2,
  Split,
  SplitSquareHorizontal,
  Table2,
  TableProperties,
  Tag,
  Trash2,
  Underline as UnderlineIcon,
  Undo2,
  X,
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
  detectRasterImageMimeFromBytes,
  extractPlainTextAndTokens,
  getEffectivePaperDimensionsMm,
  isSafeInlineImageDataUrl,
  sanitizePastedHtml,
  validateStudioPageSettings,
  validateTipTapContent,
} from '../../domain/persuratan/studio/contentValidation';
import {
  DocImageNode,
  ExtendedTable,
  ExtendedTableCell,
  ExtendedTableHeader,
  ExtendedTableRow,
  PageBreakNode,
} from '../../domain/persuratan/studio/extensions';
import {
  adoptSelectedSourceUpdatesToDraft,
  compareDraftSnapshotsWithLiveState,
} from '../../domain/persuratan/studio/sourceDiff';
import {
  extractDocumentOutline,
  getStudioSaveStatusLabel,
  type StudioSaveIndicatorMode,
} from '../../domain/persuratan/studio/outline';
import {
  PAPER_DIMENSIONS_MM,
  STUDIO_MARGIN_MAX_MM,
  STUDIO_MARGIN_MIN_MM,
  type StudioPageNumberFormat,
} from '../../domain/persuratan/studio/types';
import { getDefaultMadrasahLogo } from '../../utils/madrasahLogo';
import { FinalizationSlideDrawer } from './FinalizationSlideDrawer';
import './DocumentStudio.css';

type DrawerTab = 'detail' | 'snapshots' | 'placeholders' | 'page';
type StudioZoomMode = 'fit' | 0.85 | 1 | 1.15;
const MM_TO_PX = 96 / 25.4; // CSS physical pixel constant (3.7795275591)
const AUTOSAVE_DEBOUNCE_MS = 1400;

const MARGIN_PRESETS = [
  {
    id: 'dinas',
    label: 'Standar Dinas',
    desc: '20/20/20/25',
    marginsMm: { top: 20, right: 20, bottom: 20, left: 25 },
  },
  {
    id: 'hemat',
    label: 'Hemat / Rapat',
    desc: '15/15/15/20',
    marginsMm: { top: 15, right: 15, bottom: 15, left: 20 },
  },
  {
    id: 'sk',
    label: 'Lebar SK',
    desc: '25/20/25/30',
    marginsMm: { top: 25, right: 20, bottom: 25, left: 30 },
  },
] as const;

export interface DocumentStudioProps {
  state: AppState;
  draft: DocumentIntakeDraft;
  storageError?: string | null;
  onRetryStorage?: () => void;
  onPersistStudioState: (
    nextState: AppState,
    savedDraft: DocumentIntakeDraft
  ) => Promise<void> | void;
  onPersistState?: (nextState: AppState) => Promise<void>;
  onFinalizedToArchive?: (documentId: string, versionId: string) => void;
  isFocusMode?: boolean;
  onToggleFocusMode?: (nextFocus: boolean) => void;
  onDeleteDraft?: () => Promise<void> | void;
  onBackToIntake: () => void;
  onBackToCenter: () => void;
  onOpenPreview?: () => void;
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

    if (node.type === 'pageBreak') {
      return (
        <div key={idx} className="s04-page-break" data-page-break="true">
          <span>Pemisah Halaman Manual (Page Break)</span>
        </div>
      );
    }
    if (node.type === 'docImage') {
      const safeSrc = isSafeInlineImageDataUrl(node.attrs?.src) ? node.attrs?.src : '';
      if (!safeSrc) return null;
      const widthMm =
        typeof node.attrs?.widthMm === 'number' && Number.isFinite(node.attrs.widthMm)
          ? node.attrs.widthMm
          : 26;
      const imgAlign =
        node.attrs?.align === 'left' || node.attrs?.align === 'right' ? node.attrs.align : 'center';
      const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : 'Gambar Dokumen';
      return (
        <figure key={idx} className={`s04-doc-image align-${imgAlign}`} data-doc-image="true">
          <img src={safeSrc} alt={alt} style={{ width: `${widthMm}mm`, maxWidth: '100%', height: 'auto' }} />
        </figure>
      );
    }
    if (node.type === 'heading') {
      const lvl = node.attrs?.level;
      if (lvl === 1) {
        return (
          <h1 key={idx} style={{ textAlign: align }}>
            {text}
          </h1>
        );
      }
      if (lvl === 3) {
        return (
          <h3 key={idx} style={{ textAlign: align }}>
            {text}
          </h3>
        );
      }
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
      const repeatHdr = node.attrs?.repeatHeader !== false;
      return (
        <table key={idx} data-repeat-header={repeatHdr ? 'true' : 'false'}>
          <tbody>
            {(node.content ?? []).map((row, rIdx) => {
              const rowHeight =
                typeof row.attrs?.rowHeightMm === 'number' && Number.isFinite(row.attrs.rowHeightMm)
                  ? `${row.attrs.rowHeightMm}mm`
                  : undefined;
              return (
                <tr key={rIdx} style={rowHeight ? { height: rowHeight } : undefined}>
                  {(row.content ?? []).map((cell, cIdx) => {
                    const CellTag = cell.type === 'tableHeader' ? 'th' : 'td';
                    const colSpan =
                      typeof cell.attrs?.colspan === 'number' && cell.attrs.colspan > 1
                        ? cell.attrs.colspan
                        : undefined;
                    const rowSpan =
                      typeof cell.attrs?.rowspan === 'number' && cell.attrs.rowspan > 1
                        ? cell.attrs.rowspan
                        : undefined;
                    const vAlign =
                      cell.attrs?.verticalAlign === 'middle' || cell.attrs?.verticalAlign === 'bottom'
                        ? cell.attrs.verticalAlign
                        : undefined;
                    const cellText = (cell.content ?? [])
                      .flatMap((p) => p.content ?? [])
                      .map((t) => t.text ?? '')
                      .join(' ');
                    return (
                      <CellTag
                        key={cIdx}
                        colSpan={colSpan}
                        rowSpan={rowSpan}
                        style={vAlign ? { verticalAlign: vAlign } : undefined}
                      >
                        {cellText}
                      </CellTag>
                    );
                  })}
                </tr>
              );
            })}
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
  onPersistState,
  onFinalizedToArchive,
  isFocusMode: controlledFocusMode,
  onToggleFocusMode,
  onDeleteDraft,
  onBackToIntake,
  onBackToCenter,
  onOpenPreview,
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
  const [autosaveEnabled, setAutosaveEnabled] = useState<boolean>(true);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(
    draft.studio?.updatedAt ?? null
  );
  const [saveMode, setSaveMode] = useState<StudioSaveIndicatorMode>(() =>
    draft.studio?.updatedAt ? 'saved_manual' : 'new'
  );
  const [outlineOpen, setOutlineOpen] = useState<boolean>(false);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(true);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('detail');
  const [localFocusMode, setLocalFocusMode] = useState<boolean>(false);
  const [isFinalizeDrawerOpen, setIsFinalizeDrawerOpen] = useState<boolean>(false);
  const [s03ConflictResolved, setS03ConflictResolved] = useState<boolean>(false);
  const [legacyMismatchAccepted, setLegacyMismatchAccepted] = useState<boolean>(false);
  const [estimatedPages, setEstimatedPages] = useState<number>(1);
  const [zoomMode, setZoomMode] = useState<StudioZoomMode>('fit');
  const [viewportWidthPx, setViewportWidthPx] = useState<number>(0);
  const [paperSizePx, setPaperSizePx] = useState<{ width: number; height: number } | null>(null);
  const [, setSelectionTick] = useState<number>(0);
  const [activeHeadingIndex, setActiveHeadingIndex] = useState<number | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState<boolean>(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState<boolean>(false);
  const [imageWidthMm, setImageWidthMm] = useState<number>(26);
  const [imageAlign, setImageAlign] = useState<'left' | 'center' | 'right'>('center');
  const [imageAlt, setImageAlt] = useState<string>('Logo Madrasah');
  const [imageError, setImageError] = useState<string | null>(null);
  const [isDiffModalOpen, setIsDiffModalOpen] = useState<boolean>(false);
  const [selectedDiffKeys, setSelectedDiffKeys] = useState<string[]>([]);

  const isFocusMode = controlledFocusMode ?? localFocusMode;
  const toggleFocusMode = (nextValue?: boolean) => {
    const resolved = nextValue !== undefined ? nextValue : !isFocusMode;
    setLocalFocusMode(resolved);
    onToggleFocusMode?.(resolved);
    if (resolved) {
      setOutlineOpen(false);
      setDrawerOpen(false);
    } else {
      setDrawerOpen(true);
    }
  };

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const paperRef = useRef<HTMLDivElement | null>(null);
  const deleteCancelBtnRef = useRef<HTMLButtonElement | null>(null);
  const resetCancelBtnRef = useRef<HTMLButtonElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const lastFocusBeforeModalRef = useRef<HTMLElement | null>(null);

  // Epoch tracking ensures an in-flight async save never clears dirty state if user typed mid-save
  const editEpochRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isDeleteConfirmOpen) {
      lastFocusBeforeModalRef.current = document.activeElement as HTMLElement | null;
      deleteCancelBtnRef.current?.focus();
    } else if (lastFocusBeforeModalRef.current && !isResetConfirmOpen) {
      const target = lastFocusBeforeModalRef.current;
      lastFocusBeforeModalRef.current = null;
      if (document.contains(target)) target.focus();
    }
  }, [isDeleteConfirmOpen, isResetConfirmOpen]);

  useEffect(() => {
    if (isResetConfirmOpen) {
      lastFocusBeforeModalRef.current = document.activeElement as HTMLElement | null;
      resetCancelBtnRef.current?.focus();
    } else if (lastFocusBeforeModalRef.current && !isDeleteConfirmOpen) {
      const target = lastFocusBeforeModalRef.current;
      lastFocusBeforeModalRef.current = null;
      if (document.contains(target)) target.focus();
    }
  }, [isResetConfirmOpen, isDeleteConfirmOpen]);

  const markDirty = useCallback(
    (nextDirty: boolean) => {
      if (nextDirty) {
        editEpochRef.current += 1;
        setSaveMode('dirty');
      }
      setIsDirty(nextDirty);
      onDirtyChange?.(nextDirty);
    },
    [onDirtyChange]
  );

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
      ExtendedTable.configure({
        resizable: true,
        cellMinWidth: 45,
      }),
      ExtendedTableRow,
      ExtendedTableHeader,
      ExtendedTableCell,
      PageBreakNode,
      DocImageNode,
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
    onSelectionUpdate: ({ editor: ed }) => {
      setSelectionTick((t) => t + 1);
      // Track active heading in outline
      const cursorPos = ed.state.selection.from;
      let headingIdx = 0;
      let matchedIdx: number | null = null;
      ed.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading') {
          if (pos <= cursorPos) {
            matchedIdx = headingIdx;
          }
          headingIdx += 1;
        }
        return true;
      });
      setActiveHeadingIndex(matchedIdx);
    },
  });

  // Observasi ukuran viewport & tinggi kertas fisik untuk Fit-to-Width & perkiraan halaman jujur
  useEffect(() => {
    const paperEl = paperRef.current;
    const vpEl = viewportRef.current;
    if (!paperEl || typeof ResizeObserver === 'undefined') return;

    const dims = getEffectivePaperDimensionsMm(pageSettings.paperSize, pageSettings.orientation);
    const singlePagePx = Math.max(100, dims.heightMm * MM_TO_PX);

    const measure = () => {
      const h = paperEl.scrollHeight;
      const w = paperEl.offsetWidth || dims.widthMm * MM_TO_PX;
      setEstimatedPages(Math.max(1, Math.ceil(h / singlePagePx)));
      setPaperSizePx((prev) =>
        prev && prev.width === w && prev.height === h ? prev : { width: w, height: h }
      );
      if (vpEl) {
        const vw = vpEl.clientWidth;
        setViewportWidthPx((prev) => (prev === vw ? prev : vw));
      }
    };

    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(paperEl);
    if (vpEl) ro.observe(vpEl);
    return () => ro.disconnect();
  }, [pageSettings.paperSize, pageSettings.orientation, docJson, drawerOpen, outlineOpen]);

  const textStats = useMemo(() => extractPlainTextAndTokens(docJson), [docJson]);
  const docOutline = useMemo(() => extractDocumentOutline(docJson), [docJson]);
  const { wordCount, charCount } = useMemo(() => {
    const trimmed = textStats.plainText.trim();
    return {
      wordCount: trimmed ? trimmed.split(/\s+/).length : 0,
      charCount: textStats.plainText.length,
    };
  }, [textStats.plainText]);
  const isDemoSnapshot = useMemo(
    () => (draft.sourceSnapshots ?? []).some((s) => s.isDemoData),
    [draft.sourceSnapshots]
  );

  const paperDims = useMemo(
    () => getEffectivePaperDimensionsMm(pageSettings.paperSize, pageSettings.orientation),
    [pageSettings.paperSize, pageSettings.orientation]
  );

  const paperNominalWidthPx = paperSizePx?.width ?? paperDims.widthMm * MM_TO_PX;
  const availableViewportWidth = Math.max(300, viewportWidthPx - 44);
  const autoFitScale =
    viewportWidthPx > 0
      ? Math.min(1, Math.max(0.5, Number((availableViewportWidth / paperNominalWidthPx).toFixed(3))))
      : 1;
  const effectiveScale = zoomMode === 'fit' ? autoFitScale : zoomMode;
  const zoomPercentLabel = Math.round(effectiveScale * 100);

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

  const handleSaveStudio = useCallback(
    async (overrideOptions?: {
      overrideContent?: TipTapJSONContent;
      clearS03ConflictFlag?: boolean;
      isAutosave?: boolean;
    }) => {
      const isAuto = Boolean(overrideOptions?.isAutosave);
      const pageCheck = validateStudioPageSettings(pageSettings);
      if (!pageCheck.valid || !pageCheck.normalized) {
        const errMsg = pageCheck.error ?? 'Margin/ukuran halaman tidak valid.';
        setPageError(errMsg);
        setSaveError(errMsg);
        setSaveMode('error');
        if (!isAuto) onNotify?.(errMsg, 'warning');
        return;
      }

      const latestJson =
        overrideOptions?.overrideContent ??
        (editor ? (editor.getJSON() as TipTapJSONContent) : docJson);

      const contentCheck = validateTipTapContent(latestJson);
      if (!contentCheck.valid) {
        const errMsg = contentCheck.error ?? 'Struktur konten naskah tidak valid.';
        setSaveError(errMsg);
        setSaveMode('error');
        if (!isAuto) onNotify?.(errMsg, 'error');
        return;
      }

      const epochAtStart = editEpochRef.current;
      setIsSaving(true);
      setSaveError(null);
      setSaveMode(isAuto ? 'autosaving' : 'saving');

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

        if (!isMountedRef.current) return;

        setDocJson(latestJson);
        setLastSavedAt(now);

        // Hanya bersihkan dirty flag jika tidak ada ketikan baru selama proses write async
        if (editEpochRef.current === epochAtStart) {
          markDirty(false);
          setSaveMode(isAuto ? 'saved_auto' : 'saved_manual');
        } else {
          setSaveMode('dirty');
        }

        if (!isAuto) {
          onNotify?.(
            `Naskah draft (${saved.documentRecord.id}) berhasil disimpan ke penyimpanan lokal.`,
            'success'
          );
        }
      } catch (error) {
        if (!isMountedRef.current) return;
        const msg =
          error instanceof Error
            ? error.message
            : 'Gagal menyimpan naskah Document Studio ke penyimpanan lokal.';
        setSaveError(msg);
        setSaveMode('error');
        if (!isAuto) {
          onNotify?.(msg, 'error');
        }
      } finally {
        if (isMountedRef.current) {
          setIsSaving(false);
        }
      }
    },
    [
      docJson,
      draft.id,
      editor,
      markDirty,
      onNotify,
      onPersistStudioState,
      pageSettings,
      s03ConflictResolved,
      state,
    ]
  );

  // Safe debounced autosave (1.4s idle after edit, paused during modals/saving/errors)
  useEffect(() => {
    if (
      !autosaveEnabled ||
      !isDirty ||
      isSaving ||
      isDeleting ||
      isDeleteConfirmOpen ||
      isResetConfirmOpen ||
      Boolean(storageError)
    ) {
      return;
    }

    const timerId = window.setTimeout(() => {
      void handleSaveStudio({ isAutosave: true });
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timerId);
  }, [
    autosaveEnabled,
    isDirty,
    isSaving,
    isDeleting,
    isDeleteConfirmOpen,
    isResetConfirmOpen,
    storageError,
    docJson,
    pageSettings,
    handleSaveStudio,
  ]);

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
      'Naskah disusun ulang dari data S03 terbaru. Simpan Draft atau tunggu autosave.',
      'info'
    );
  };

  const handleKeepExistingStudioOverS03 = () => {
    setS03ConflictResolved(true);
    markDirty(true);
    onNotify?.(
      'Naskah S04 saat ini dipertahankan. Penanda pembaruan S03 ditutup setelah penyimpanan berikutnya.',
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

  const handleJumpToHeading = (targetHeadingIndex: number) => {
    if (!editor) return;
    let currentIdx = 0;
    let foundPos: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (foundPos !== null) return false;
      if (node.type.name === 'heading') {
        if (currentIdx === targetHeadingIndex) {
          foundPos = pos + 1;
          return false;
        }
        currentIdx += 1;
      }
      return true;
    });

    if (foundPos !== null) {
      const targetPos = foundPos;
      editor.chain().focus().setTextSelection(targetPos).scrollIntoView().run();
      setActiveHeadingIndex(targetHeadingIndex);
    }
  };

  const handleFocusPlaceholderToken = (tokenKey: string) => {
    const needle = `{{${tokenKey}}}`;
    if (!editor) {
      onNotify?.(`Token ${needle} dapat disunting langsung pada naskah Document Studio.`, 'info');
      return;
    }

    let matchRange: { from: number; to: number } | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (matchRange) return false;
      if (node.isText && typeof node.text === 'string') {
        const idx = node.text.indexOf(needle);
        if (idx !== -1) {
          matchRange = { from: pos + idx, to: pos + idx + needle.length };
          return false;
        }
      }
      return true;
    });

    if (matchRange) {
      const range = matchRange as { from: number; to: number };
      editor.chain().focus().setTextSelection(range).scrollIntoView().run();
      onNotify?.(`Placeholder ${needle} disorot pada naskah untuk segera diisi.`, 'info');
    } else {
      onNotify?.(`Placeholder ${needle} tidak ditemukan lagi pada posisi aktif.`, 'info');
    }
  };

  const preserveFocusMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const sourceDiff = useMemo(
    () => compareDraftSnapshotsWithLiveState(draft, state, draft.updatedAt),
    [draft, state]
  );

  const handleOpenSourceDiffModal = () => {
    setSelectedDiffKeys([...sourceDiff.changedSourceKeys]);
    setIsDiffModalOpen(true);
  };

  const handleApplySelectedSourceDiffs = async () => {
    if (selectedDiffKeys.length === 0) {
      setIsDiffModalOpen(false);
      return;
    }
    try {
      const result = adoptSelectedSourceUpdatesToDraft(state, draft.id, selectedDiffKeys);
      await Promise.resolve(onPersistStudioState(result.state, result.draft));
      setIsDiffModalOpen(false);
      onNotify?.(
        `${result.updatedKeys.length} kelompok snapshot sumber diperbarui tanpa menimpa suntingan naskah S04 Anda.`,
        'success'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memperbarui snapshot sumber.';
      onNotify?.(msg, 'error');
    }
  };

  const handleInsertMadrasahLogo = () => {
    if (!editor) return;
    const rawLogo = state.settings.logoUrl || getDefaultMadrasahLogo();
    if (!isSafeInlineImageDataUrl(rawLogo)) {
      setImageError('Logo madrasah tidak dalam format PNG/JPEG/WEBP data URL yang valid.');
      return;
    }
    editor
      .chain()
      .focus()
      .insertDocImage({
        src: rawLogo,
        alt: imageAlt.trim() || `Logo ${state.settings.schoolName || 'Madrasah'}`,
        widthMm: imageWidthMm,
        align: imageAlign,
      })
      .run();
    setImageError(null);
    setIsImageModalOpen(false);
  };

  const handleUploadCustomImage = async (file: File | null) => {
    if (!file || !editor) return;
    setImageError(null);
    if (file.size > 480 * 1024) {
      setImageError('Ukuran gambar maksimal 480 KB agar dokumen tetap ringan.');
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      const detectedMime = detectRasterImageMimeFromBytes(new Uint8Array(buf));
      if (!detectedMime) {
        setImageError('Format file ditolak. Gunakan PNG, JPEG, atau WEBP asli yang valid.');
        return;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => reject(new Error('Gagal membaca berkas gambar.'));
        reader.readAsDataURL(new Blob([buf], { type: detectedMime }));
      });
      if (!isSafeInlineImageDataUrl(dataUrl)) {
        setImageError('Ukuran hasil enkoding gambar melebihi batas aman kanvas.');
        return;
      }
      editor
        .chain()
        .focus()
        .insertDocImage({
          src: dataUrl,
          alt: imageAlt.trim() || file.name,
          widthMm: imageWidthMm,
          align: imageAlign,
        })
        .run();
      setIsImageModalOpen(false);
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Gagal menyisipkan gambar.');
    }
  };

  const isInsideTable = editor ? editor.isActive('table') : false;
  const showS03ConflictBanner =
    Boolean(draft.s03EditedAfterStudioAt) && !s03ConflictResolved;
  const showLegacyMismatchBanner =
    !hasSavedStudio &&
    initialGeneration.resolution.status === 'VERSION_MISMATCH' &&
    !legacyMismatchAccepted;

  const statusBadgeText = getStudioSaveStatusLabel(saveMode, lastSavedAt);
  const statusBadgeClass =
    saveMode === 'error'
      ? 'is-error'
      : saveMode === 'dirty'
      ? 'is-dirty'
      : saveMode === 'saving' || saveMode === 'autosaving'
      ? 'is-saving'
      : saveMode === 'saved_auto' || saveMode === 'saved_manual' || lastSavedAt
      ? 'is-saved'
      : '';

  const handleOpenExpressFinalize = async () => {
    if (isDirty) {
      await handleSaveStudio({ isAutosave: false });
    }
    if (onPersistState && onFinalizedToArchive) {
      setIsFinalizeDrawerOpen(true);
      return;
    }
    onOpenPreview?.();
  };

  return (
    <section
      className={`s04-studio-root ${isFocusMode ? 'is-focus-mode' : ''}`}
      data-doc-editor="true"
      aria-label="Editor Naskah Dokumen"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          void handleSaveStudio({ isAutosave: false });
        } else if (
          e.key === 'Escape' &&
          isFocusMode &&
          !isDeleteConfirmOpen &&
          !isResetConfirmOpen &&
          !isImageModalOpen &&
          !isDiffModalOpen &&
          !isFinalizeDrawerOpen
        ) {
          toggleFocusMode(false);
        }
      }}
    >
      {/* Compact Unified Studio Top Header */}
      <header className="s04-header-card">
        <div className="s04-header-left">
          <button
            type="button"
            className="s04-back-pill"
            onClick={onBackToCenter}
            title="Kembali ke Pusat Persuratan & Arsip"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            <span>Arsip</span>
          </button>

          <div className="s04-header-main">
            <h1 className="s04-doc-title" title={draft.title}>
              {draft.title}
            </h1>
            <div className="s04-meta-line s5-tnum">
              <span className="s04-meta-code">{draft.templateSnapshot.code}</span>
              <span aria-hidden="true">·</span>
              <span>{draft.templateSnapshot.name}</span>
              <span aria-hidden="true">·</span>
              <span>Draft Belum Bernomor</span>
              {isDemoSnapshot && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="s04-meta-demo" title="Draft ini memuat snapshot dari mode dataset demo">
                    Dataset Demo
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="s04-header-badges">
          <span
            className={`s04-status-badge s5-tnum ${statusBadgeClass}`}
            role="status"
            aria-live="polite"
          >
            {saveMode === 'dirty' || saveMode === 'error' ? (
              <AlertTriangle size={13} aria-hidden="true" />
            ) : saveMode === 'saving' || saveMode === 'autosaving' ? (
              <Clock size={13} aria-hidden="true" />
            ) : saveMode === 'saved_auto' || saveMode === 'saved_manual' || lastSavedAt ? (
              <CheckCircle2 size={13} aria-hidden="true" />
            ) : (
              <Info size={13} aria-hidden="true" />
            )}
            <span>{statusBadgeText}</span>
          </span>

          <button
            type="button"
            className={`s04-autosave-toggle ${autosaveEnabled ? 'is-on' : ''}`}
            aria-pressed={autosaveEnabled}
            onClick={() => setAutosaveEnabled((prev) => !prev)}
            title={
              autosaveEnabled
                ? 'Simpan otomatis aktif (1,4 detik). Klik untuk jeda.'
                : 'Simpan otomatis dijeda. Klik untuk mengaktifkan.'
            }
          >
            <Clock size={12} aria-hidden="true" />
            <span>{autosaveEnabled ? 'Autosave' : 'Manual'}</span>
          </button>

          <button
            type="button"
            className={`s04-focus-btn ${isFocusMode ? 'is-active' : ''}`}
            aria-pressed={isFocusMode}
            onClick={() => toggleFocusMode()}
            title={
              isFocusMode
                ? 'Keluar dari Mode Fokus (Escape)'
                : 'Mode Fokus: perluas area kertas dokumen dan sembunyikan panel samping'
            }
          >
            {isFocusMode ? (
              <Minimize2 size={13} aria-hidden="true" />
            ) : (
              <Maximize2 size={13} aria-hidden="true" />
            )}
            <span>{isFocusMode ? 'Keluar Fokus' : 'Mode Fokus'}</span>
          </button>

          {(onPersistState && onFinalizedToArchive) || onOpenPreview ? (
            <button
              type="button"
              className="s02-btn-primary"
              style={{ height: '32px', padding: '0 13px', fontSize: '12.25px' }}
              disabled={isSaving}
              onClick={() => void handleOpenExpressFinalize()}
            >
              <FileCheck2 size={14} aria-hidden="true" />
              <span>Sahkan &amp; Terbitkan</span>
            </button>
          ) : null}
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

      {/* Sticky Formatting Toolbar + Contextual Table Sub-Bar */}
      <div className="s04-toolbar-stack">
        <div className="s04-toolbar-wrap" role="toolbar" aria-label="Toolbar pemformatan naskah dokumen">
          <div className="s04-toolbar-groups">
            <div className="s04-tool-group">
              <button
                type="button"
                className="s04-tool-btn"
                aria-label="Urungkan (Undo)"
                title="Urungkan perubahan (Ctrl+Z)"
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
                title="Ulangi perubahan (Ctrl+Y / Ctrl+Shift+Z)"
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
                title="Paragraf Normal (Ctrl+Alt+0)"
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
                title="Judul Utama H1"
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
                title="Subjudul H2"
                onMouseDown={preserveFocusMouseDown}
                onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
              >
                <Heading2 size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="s04-tool-btn"
                aria-label="Sub-bagian H3"
                aria-pressed={editor?.isActive('heading', { level: 3 }) ?? false}
                title="Sub-bagian H3"
                onMouseDown={preserveFocusMouseDown}
                onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
              >
                <Heading3 size={14} aria-hidden="true" />
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
              <button
                type="button"
                className="s04-tool-btn"
                aria-label="Sisipkan Garis Pembatas"
                title="Sisipkan Garis Pembatas Horizontal"
                onMouseDown={preserveFocusMouseDown}
                onClick={() => editor?.chain().focus().setHorizontalRule().run()}
              >
                <Minus size={14} aria-hidden="true" />
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
              <button
                type="button"
                className="s04-tool-btn"
                aria-label="Sisipkan Logo atau Gambar"
                title="Sisipkan Logo Madrasah / Gambar (PNG, JPEG, WEBP)"
                onMouseDown={preserveFocusMouseDown}
                onClick={() => {
                  setImageError(null);
                  setIsImageModalOpen(true);
                }}
              >
                <ImagePlus size={14} aria-hidden="true" />
                <span>Logo/Gambar</span>
              </button>
              <button
                type="button"
                className="s04-tool-btn"
                aria-label="Sisipkan Pemisah Halaman"
                title="Sisipkan Pemisah Halaman Manual (Page Break)"
                onMouseDown={preserveFocusMouseDown}
                onClick={() => editor?.chain().focus().insertPageBreak().run()}
              >
                <SplitSquareHorizontal size={14} aria-hidden="true" />
                <span>Page Break</span>
              </button>
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

          <div className="s04-panel-toggles">
            <button
              type="button"
              className="s02-btn-secondary"
              aria-expanded={outlineOpen}
              onClick={() => setOutlineOpen((prev) => !prev)}
              style={{ height: '30px', padding: '0 10px', fontSize: '12px' }}
              title="Tampilkan / sembunyikan panel navigasi struktur dokumen"
            >
              {outlineOpen ? (
                <PanelLeftClose size={14} aria-hidden="true" />
              ) : (
                <PanelLeftOpen size={14} aria-hidden="true" />
              )}
              <span>Struktur ({docOutline.headings.length})</span>
            </button>

            <button
              type="button"
              className="s02-btn-secondary"
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen((prev) => !prev)}
              style={{ height: '30px', padding: '0 10px', fontSize: '12px' }}
              title="Tampilkan / sembunyikan panel properti & detail dokumen"
            >
              {drawerOpen ? (
                <PanelRightClose size={14} aria-hidden="true" />
              ) : (
                <PanelRightOpen size={14} aria-hidden="true" />
              )}
              <span>{drawerOpen ? 'Tutup Properti' : 'Properti & Kertas'}</span>
            </button>
          </div>
        </div>

        {/* Contextual Table Sub-Bar — appears ONLY when cursor is inside a table */}
        {isInsideTable && (
          <div
            className="s04-contextual-table-bar"
            role="toolbar"
            aria-label="Alat penyuntingan tabel aktif"
          >
            <span className="s04-contextual-label">
              <Table2 size={13} aria-hidden="true" />
              <span>Tabel Aktif</span>
            </span>
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
              className="s04-tool-btn"
              aria-label="Gabung Sel Tabel"
              title="Gabung Sel Terpilih (Merge Cells)"
              disabled={!editor?.can().mergeCells()}
              onMouseDown={preserveFocusMouseDown}
              onClick={() => editor?.chain().focus().mergeCells().run()}
            >
              <Combine size={13} aria-hidden="true" />
              <span>Gabung</span>
            </button>
            <button
              type="button"
              className="s04-tool-btn"
              aria-label="Pisah Sel Tabel"
              title="Pisahkan Sel Gabungan (Split Cell)"
              disabled={!editor?.can().splitCell()}
              onMouseDown={preserveFocusMouseDown}
              onClick={() => editor?.chain().focus().splitCell().run()}
            >
              <Split size={13} aria-hidden="true" />
              <span>Pisah</span>
            </button>
            <button
              type="button"
              className="s04-tool-btn"
              aria-label="Toggle Baris Header Tabel"
              title="Aktifkan/Matikan Header Baris Tabel"
              onMouseDown={preserveFocusMouseDown}
              onClick={() => editor?.chain().focus().toggleHeaderRow().run()}
            >
              <TableProperties size={13} aria-hidden="true" />
              <span>Header</span>
            </button>
            <button
              type="button"
              className="s04-tool-btn"
              aria-label="Sel Rata Atas"
              title="Perataan Vertikal Atas"
              onMouseDown={preserveFocusMouseDown}
              onClick={() => editor?.chain().focus().setCellAttribute('verticalAlign', 'top').run()}
            >
              <ArrowUpToLine size={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="s04-tool-btn"
              aria-label="Sel Rata Tengah Vertikal"
              title="Perataan Vertikal Tengah"
              onMouseDown={preserveFocusMouseDown}
              onClick={() => editor?.chain().focus().setCellAttribute('verticalAlign', 'middle').run()}
            >
              <AlignVerticalJustifyCenter size={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="s04-tool-btn"
              aria-label="Sel Rata Bawah"
              title="Perataan Vertikal Bawah"
              onMouseDown={preserveFocusMouseDown}
              onClick={() => editor?.chain().focus().setCellAttribute('verticalAlign', 'bottom').run()}
            >
              <ArrowDownToLine size={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="s04-tool-btn"
              aria-label="Atur Tinggi Baris 14mm"
              title="Setel Tinggi Baris Tabel (14 mm / Auto)"
              onMouseDown={preserveFocusMouseDown}
              onClick={() => {
                const currentH = editor?.getAttributes('tableRow')?.rowHeightMm;
                editor
                  ?.chain()
                  .focus()
                  .updateAttributes('tableRow', { rowHeightMm: currentH ? null : 14 })
                  .run();
              }}
            >
              <span>Tinggi</span>
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
          </div>
        )}
      </div>

      {/* Main 3-Column Atelier Workbench: [Outline] + [Paper Stage] + [Properties Drawer] */}
      <div
        className={`s04-workbench ${outlineOpen ? '' : 'is-outline-collapsed'} ${
          drawerOpen ? '' : 'is-drawer-collapsed'
        }`}
      >
        {/* Left Outline & Structure Navigator Panel */}
        {outlineOpen && (
          <aside className="s04-outline-panel" aria-label="Panel navigasi struktur dokumen">
            <div className="s04-outline-head">
              <h2>Struktur Naskah</h2>
              <span className="s04-outline-count s5-tnum">
                {docOutline.headings.length} bagian
              </span>
            </div>

            {docOutline.headings.length === 0 ? (
              <p className="s04-outline-empty">
                Belum ada judul bagian (H1–H3). Gunakan tombol H1/H2/H3 di toolbar untuk menandai
                bagian surat.
              </p>
            ) : (
              <nav aria-label="Daftar judul bagian naskah">
                <ul className="s04-outline-list">
                  {docOutline.headings.map((h) => (
                    <li key={h.id}>
                      <button
                        type="button"
                        className={`s04-outline-item level-${h.level} ${
                          activeHeadingIndex === h.headingIndex ? 'is-active' : ''
                        }`}
                        onClick={() => handleJumpToHeading(h.headingIndex)}
                        title={h.text}
                      >
                        <span className="s04-outline-level s5-tnum">H{h.level}</span>
                        <span className="s04-outline-label">{h.text}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
            )}

            <div className="s04-outline-stats s5-tnum" aria-label="Ringkasan struktur dokumen">
              <div>
                <span>Paragraf</span>
                <strong>{docOutline.paragraphCount}</strong>
              </div>
              <div>
                <span>Tabel</span>
                <strong>{docOutline.tableCount}</strong>
              </div>
              <div>
                <span>Daftar</span>
                <strong>{docOutline.listCount}</strong>
              </div>
              <div>
                <span>Token</span>
                <strong>{textStats.unresolvedTokens.length}</strong>
              </div>
            </div>
          </aside>
        )}

        <div ref={viewportRef} className="s04-canvas-viewport">
          <div className="s04-canvas-meta-bar s5-tnum">
            <span>
              <strong>{PAPER_DIMENSIONS_MM[pageSettings.paperSize].label}</strong> ·{' '}
              {pageSettings.orientation === 'portrait' ? 'Portrait' : 'Landscape'} · Margin{' '}
              {pageSettings.marginsMm.top}/{pageSettings.marginsMm.right}/
              {pageSettings.marginsMm.bottom}/{pageSettings.marginsMm.left} mm ·{' '}
              <strong>~{estimatedPages} hal</strong> ·{' '}
              <span>{wordCount} kata</span> · <span>{charCount} karakter</span> ·{' '}
              {textStats.unresolvedTokens.length > 0
                ? `${textStats.unresolvedTokens.length} placeholder tersisa`
                : 'Semua token terisi'}
            </span>

            <div className="s04-zoom-group" role="group" aria-label="Skala tampilan kertas">
              {(
                [
                  { id: 'fit' as const, label: `Fit (${zoomMode === 'fit' ? `${zoomPercentLabel}%` : 'Auto'})` },
                  { id: 0.85 as const, label: '85%' },
                  { id: 1 as const, label: '100%' },
                  { id: 1.15 as const, label: '115%' },
                ]
              ).map((opt) => {
                const isActive = zoomMode === opt.id;
                return (
                  <button
                    key={String(opt.id)}
                    type="button"
                    className={`s04-zoom-btn ${isActive ? 'is-active' : ''}`}
                    aria-pressed={isActive}
                    onClick={() => setZoomMode(opt.id)}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className="s04-paper-stage-sizer"
            style={
              paperSizePx && effectiveScale !== 1
                ? {
                    width: `${Math.round(paperSizePx.width * effectiveScale)}px`,
                    height: `${Math.round(paperSizePx.height * effectiveScale)}px`,
                  }
                : undefined
            }
          >
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
                transform: effectiveScale !== 1 ? `scale(${effectiveScale})` : undefined,
                transformOrigin: effectiveScale !== 1 ? 'top left' : undefined,
              }}
            >
              {pageSettings.headerText && (
                <div className="s04-paper-running-header" aria-label="Header halaman dokumen">
                  <span>{pageSettings.headerText}</span>
                </div>
              )}

              {editor ? (
                <EditorContent editor={editor} />
              ) : (
                <div className="s04-prosemirror" aria-label="Pratinjau naskah awal Document Studio S04">
                  {renderStaticPreviewNodes(docJson.content)}
                </div>
              )}

              {(pageSettings.footerText || pageSettings.showPageNumbers) && (
                <div className="s04-paper-running-footer s5-tnum" aria-label="Footer dan nomor halaman">
                  <span>{pageSettings.footerText || ''}</span>
                  {pageSettings.showPageNumbers && (
                    <span>
                      {pageSettings.pageNumberFormat === 'HALAMAN_SAJA'
                        ? `Halaman 1 (estimasi ~${estimatedPages})`
                        : `Halaman 1 / ~${estimatedPages}`}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Collapsible Right Properties & Inspector Drawer */}
        {drawerOpen && (
          <aside className="s04-drawer" aria-label="Panel informasi & properti Document Studio">
            <div className="s04-drawer-tabs" role="tablist" aria-label="Tab panel properti S04">
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
                <span>Token ({textStats.unresolvedTokens.length})</span>
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
                <div className="s04-detail-stack">
                  {!outlineOpen && (
                    <div style={{ paddingBottom: '10px', borderBottom: '1px solid #e4ece8' }}>
                      <div className="s04-outline-head" style={{ paddingBottom: '6px', marginBottom: '6px' }}>
                        <h2>Struktur Naskah</h2>
                        <span className="s04-outline-count s5-tnum">
                          {docOutline.headings.length} bagian
                        </span>
                      </div>
                      {docOutline.headings.length === 0 ? (
                        <p className="s04-outline-empty">
                          Belum ada judul bagian (H1–H3). Gunakan tombol H1–H3 untuk menandai bagian surat.
                        </p>
                      ) : (
                        <ul className="s04-outline-list">
                          {docOutline.headings.slice(0, 6).map((h) => (
                            <li key={h.id}>
                              <button
                                type="button"
                                className={`s04-outline-item level-${h.level} ${
                                  activeHeadingIndex === h.headingIndex ? 'is-active' : ''
                                }`}
                                onClick={() => handleJumpToHeading(h.headingIndex)}
                                title={h.text}
                              >
                                <span className="s04-outline-level s5-tnum">H{h.level}</span>
                                <span className="s04-outline-label">{h.text}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  <dl className="s04-dl">
                    <div className="s04-dl-item">
                      <dt>ID Draft &amp; Dokumen</dt>
                      <dd style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '11.5px' }}>
                        {draft.id} · {draft.documentId}
                      </dd>
                    </div>
                    <div className="s04-dl-item">
                      <dt>Nomor Resmi</dt>
                      <dd>Belum Bernomor (diterbitkan saat pengesahan)</dd>
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
                        <dt>Jadwal Resmi Terikat</dt>
                        <dd className="s5-tnum">
                          {draft.scheduleVersionId}
                          {draft.scheduleVersionFingerprint
                            ? ` (${draft.scheduleVersionFingerprint})`
                            : ''}
                        </dd>
                      </div>
                    )}
                    <div className="s04-dl-item">
                      <dt>Status Studio &amp; Penyimpanan</dt>
                      <dd>
                        {hasSavedStudio || lastSavedAt
                          ? `Draft tersimpan (${statusBadgeText})`
                          : 'Siap Disunting'}
                      </dd>
                    </div>
                    <div className="s04-dl-item">
                      <dt>Kertas &amp; Estimasi Halaman</dt>
                      <dd className="s5-tnum">
                        {pageSettings.paperSize.toUpperCase()}{' '}
                        {pageSettings.orientation === 'portrait' ? 'Portrait' : 'Landscape'} · estimasi
                        jumlah halaman ~{estimatedPages} hal (pagination eksak di PDF resmi)
                      </dd>
                    </div>
                  </dl>

                  <div className="s04-drawer-reset-box">
                    <button
                      type="button"
                      className="s02-btn-secondary"
                      style={{ width: '100%' }}
                      onClick={() => setIsResetConfirmOpen(true)}
                    >
                      <RotateCcw size={13} aria-hidden="true" />
                      <span>Susun Ulang dari Snapshot S03</span>
                    </button>
                  </div>
                </div>
              )}

              {drawerTab === 'snapshots' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <p style={{ margin: 0, color: '#4f6b63', fontSize: '12px' }}>
                    Naskah S04 membaca snapshot beku dari S03. Perubahan Data Master setelah draft
                    disimpan tidak mengubah isi surat ini secara diam-diam.
                  </p>

                  <button
                    type="button"
                    className={sourceDiff.hasChanges ? 's02-btn-primary' : 's02-btn-secondary'}
                    style={{ width: '100%' }}
                    onClick={handleOpenSourceDiffModal}
                  >
                    <GitCompare size={13} aria-hidden="true" />
                    <span>
                      {sourceDiff.hasChanges
                        ? `Bandingkan Perubahan Data (${sourceDiff.changedCount})`
                        : 'Bandingkan Data Sumber Terkini'}
                    </span>
                  </button>

                  {draft.sourceSnapshots.map((snap, idx) => (
                    <div key={`${snap.sourceKey}-${idx}`} className="s04-snapshot-card">
                      <div style={{ fontWeight: 700, color: '#0e3c2f' }}>{snap.sourceLabel}</div>
                      <div style={{ fontSize: '11px', color: '#536d65' }}>
                        Sumber: {snap.provenance} · Status: {snap.status}
                        {snap.isDemoData ? ' · Dataset Demo' : ''}
                      </div>
                      <div className="s5-tnum" style={{ fontSize: '10.5px', color: '#5d756d' }}>
                        Diambil: {snap.capturedAt ? snap.capturedAt.replace('T', ' ').slice(0, 19) : '—'}
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
                        Klik token di bawah untuk menyorot lokasinya di naskah, kecuali placeholder nomor resmi yang akan diisi saat Finalisasi S05.
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {textStats.unresolvedTokens.map((tok) => (
                          <button
                            key={tok}
                            type="button"
                            className="s04-token-chip s04-token-btn"
                            onClick={() => handleFocusPlaceholderToken(tok)}
                            title={`Sorot placeholder {{${tok}}} di naskah`}
                          >
                            {`{{${tok}}}`}
                          </button>
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

                  <div className="s04-field">
                    <span className="s04-preset-label">Preset Margin Naskah Dinas</span>
                    <div className="s04-preset-grid" role="group" aria-label="Preset margin halaman">
                      {MARGIN_PRESETS.map((preset) => {
                        const isPresetActive =
                          pageSettings.marginsMm.top === preset.marginsMm.top &&
                          pageSettings.marginsMm.right === preset.marginsMm.right &&
                          pageSettings.marginsMm.bottom === preset.marginsMm.bottom &&
                          pageSettings.marginsMm.left === preset.marginsMm.left;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            className={`s04-preset-btn ${isPresetActive ? 'is-active' : ''}`}
                            aria-pressed={isPresetActive}
                            onClick={() =>
                              handleApplyPageSettings({
                                ...pageSettings,
                                marginsMm: { ...preset.marginsMm },
                              })
                            }
                          >
                            <strong>{preset.label}</strong>
                            <span className="s5-tnum">{preset.desc} mm</span>
                          </button>
                        );
                      })}
                    </div>
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

                  <div className="s04-field">
                    <label htmlFor="s04-header-text">Header Halaman (Opsional)</label>
                    <input
                      id="s04-header-text"
                      type="text"
                      maxLength={160}
                      placeholder="Contoh: Lampiran SK Pembagian Tugas TA 2026/2027"
                      value={pageSettings.headerText ?? ''}
                      onChange={(e) =>
                        handleApplyPageSettings({
                          ...pageSettings,
                          headerText: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="s04-field">
                    <label htmlFor="s04-footer-text">Footer Halaman (Opsional)</label>
                    <input
                      id="s04-footer-text"
                      type="text"
                      maxLength={160}
                      placeholder="Contoh: Dokumen Resmi Madrasah · SIGNAL"
                      value={pageSettings.footerText ?? ''}
                      onChange={(e) =>
                        handleApplyPageSettings({
                          ...pageSettings,
                          footerText: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="s04-checkbox-stack">
                    <label className="s04-checkbox-row">
                      <input
                        type="checkbox"
                        checked={Boolean(pageSettings.showPageNumbers)}
                        onChange={(e) =>
                          handleApplyPageSettings({
                            ...pageSettings,
                            showPageNumbers: e.target.checked,
                            pageNumberFormat: pageSettings.pageNumberFormat ?? 'HALAMAN_DARI_TOTAL',
                          })
                        }
                      />
                      <span>Tampilkan nomor halaman pada footer cetak</span>
                    </label>

                    {pageSettings.showPageNumbers && (
                      <div className="s04-field" style={{ paddingLeft: '20px' }}>
                        <label htmlFor="s04-page-num-format">Format Nomor Halaman</label>
                        <select
                          id="s04-page-num-format"
                          value={pageSettings.pageNumberFormat ?? 'HALAMAN_DARI_TOTAL'}
                          onChange={(e) =>
                            handleApplyPageSettings({
                              ...pageSettings,
                              pageNumberFormat: e.target.value as StudioPageNumberFormat,
                            })
                          }
                        >
                          <option value="HALAMAN_DARI_TOTAL">Halaman X / Total</option>
                          <option value="HALAMAN_SAJA">Halaman X</option>
                        </select>
                      </div>
                    )}

                    <label className="s04-checkbox-row">
                      <input
                        type="checkbox"
                        checked={pageSettings.repeatTableHeader !== false}
                        onChange={(e) =>
                          handleApplyPageSettings({
                            ...pageSettings,
                            repeatTableHeader: e.target.checked,
                          })
                        }
                      />
                      <span>Ulangi header tabel pada halaman berikutnya (PDF S05)</span>
                    </label>
                  </div>

                  <div className="s04-honest-note" role="note">
                    <Info size={13} aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span>
                      Kanvas editor menampilkan estimasi jumlah halaman (<code>~{estimatedPages} hal</code>)
                      berdasarkan tinggi konten CSS serta penanda <em>Page Break</em> manual. Penomoran
                      halaman eksak dan pengulangan header tabel antar-halaman dirender deterministik oleh
                      mesin PDF pada tahap S05.
                    </span>
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
            Tekan <code>Ctrl+S</code> untuk simpan segera · Perintah Cepat: <code>Ctrl+Shift+P</code>.
          </span>
        </div>

        <div className="s04-footer-actions">
          {onDeleteDraft && (
            <button
              type="button"
              className="s04-btn-danger-outline"
              disabled={isSaving || isDeleting}
              onClick={() => setIsDeleteConfirmOpen(true)}
            >
              <Trash2 size={14} aria-hidden="true" />
              <span>Hapus Draft</span>
            </button>
          )}
          <button
            type="button"
            className="s02-btn-secondary"
            onClick={onBackToIntake}
          >
            <ArrowLeft size={14} aria-hidden="true" />
            <span>Ubah Data Surat</span>
          </button>
          <button
            type="button"
            className="s02-btn-secondary"
            disabled={isSaving}
            onClick={() => void handleSaveStudio({ isAutosave: false })}
          >
            <Save size={14} aria-hidden="true" />
            <span>{isSaving ? 'Menyimpan…' : 'Simpan Draft'}</span>
          </button>
          {onOpenPreview && (
            <button
              type="button"
              className="s02-btn-secondary"
              disabled={isSaving}
              onClick={async () => {
                if (isDirty) {
                  await handleSaveStudio({ isAutosave: false });
                }
                onOpenPreview();
              }}
            >
              <span>Pratinjau Layar Penuh</span>
            </button>
          )}
          {onPersistState && onFinalizedToArchive && (
            <button
              type="button"
              className="s02-btn-primary"
              disabled={isSaving}
              onClick={() => void handleOpenExpressFinalize()}
            >
              <FileCheck2 size={14} aria-hidden="true" />
              <span>Sahkan &amp; Terbitkan &rarr;</span>
            </button>
          )}
        </div>
      </footer>

      {onPersistState && onFinalizedToArchive && (
        <FinalizationSlideDrawer
          open={isFinalizeDrawerOpen}
          state={state}
          draft={draft}
          content={editor ? (editor.getJSON() as TipTapJSONContent) : docJson}
          pageSettings={pageSettings}
          onClose={() => setIsFinalizeDrawerOpen(false)}
          onPersistState={onPersistState}
          onFinalized={(docId, verId) => {
            setIsFinalizeDrawerOpen(false);
            onFinalizedToArchive(docId, verId);
          }}
          onOpenFullPreview={onOpenPreview}
          onJumpToIntake={onBackToIntake}
          onNotify={onNotify}
        />
      )}

      {isDeleteConfirmOpen && onDeleteDraft && (
        <div
          className="s01-modal-scrim"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !isDeleting) setIsDeleteConfirmOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !isDeleting) {
              e.stopPropagation();
              setIsDeleteConfirmOpen(false);
            }
          }}
        >
          <div
            className="s01-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="s04-delete-draft-title"
          >
            <div className="s01-modal-head">
              <div className="s01-modal-title-wrap">
                <div className="s01-modal-icon is-danger" aria-hidden="true">
                  <Trash2 size={19} />
                </div>
                <div>
                  <h2 id="s04-delete-draft-title">Hapus Draft Dokumen Ini?</h2>
                  <p>Naskah Document Studio (S04) dan Data Awal (S03) terkait akan dihapus.</p>
                </div>
              </div>
              <button
                type="button"
                className="s01-modal-close"
                disabled={isDeleting}
                onClick={() => setIsDeleteConfirmOpen(false)}
                aria-label="Tutup konfirmasi hapus draft"
              >
                <X size={16} />
              </button>
            </div>
            <div className="s01-modal-body">
              <p style={{ margin: 0 }}>
                Draft <strong>{draft.title}</strong> (<code>{draft.documentId}</code>) akan dihapus permanen
                dari penyimpanan lokal. Data Master dan jadwal resmi tetap utuh.
              </p>
            </div>
            <div className="s01-modal-foot">
              <button
                ref={deleteCancelBtnRef}
                type="button"
                className="s02-btn-secondary"
                disabled={isDeleting}
                onClick={() => setIsDeleteConfirmOpen(false)}
              >
                Batal
              </button>
              <button
                type="button"
                className="s01-btn-danger"
                disabled={isDeleting}
                onClick={() => {
                  setIsDeleting(true);
                  void Promise.resolve(onDeleteDraft()).finally(() => {
                    setIsDeleting(false);
                    setIsDeleteConfirmOpen(false);
                  });
                }}
              >
                <Trash2 size={14} aria-hidden="true" />
                <span>{isDeleting ? 'Menghapus…' : 'Ya, Hapus Draft'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {isResetConfirmOpen && (
        <div
          className="s01-modal-scrim"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsResetConfirmOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setIsResetConfirmOpen(false);
            }
          }}
        >
          <div
            className="s01-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="s04-reset-draft-title"
          >
            <div className="s01-modal-head">
              <div className="s01-modal-title-wrap">
                <div className="s01-modal-icon" aria-hidden="true">
                  <RotateCcw size={19} />
                </div>
                <div>
                  <h2 id="s04-reset-draft-title">Susun Ulang dari Snapshot S03?</h2>
                  <p>Mengembalikan naskah ke hasil konversi awal dari snapshot S03.</p>
                </div>
              </div>
              <button
                type="button"
                className="s01-modal-close"
                onClick={() => setIsResetConfirmOpen(false)}
                aria-label="Tutup konfirmasi susun ulang naskah"
              >
                <X size={16} />
              </button>
            </div>
            <div className="s01-modal-body">
              <p style={{ margin: 0 }}>
                Suntingan manual pada kanvas saat ini akan diganti dengan struktur awal template dari
                snapshot S03 (<code>{draft.id}</code>). Snapshot sumber tetap beku dan Anda masih dapat
                memeriksa hasilnya sebelum menekan <strong>Simpan Draft</strong>.
              </p>
            </div>
            <div className="s01-modal-foot">
              <button
                ref={resetCancelBtnRef}
                type="button"
                className="s02-btn-secondary"
                onClick={() => setIsResetConfirmOpen(false)}
              >
                Batal
              </button>
              <button
                type="button"
                className="s02-btn-primary"
                onClick={() => {
                  setIsResetConfirmOpen(false);
                  handleRebuildFromUpdatedS03();
                }}
              >
                <RotateCcw size={14} aria-hidden="true" />
                <span>Ya, Susun Ulang Naskah</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {isImageModalOpen && (
        <div
          className="s01-modal-scrim"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsImageModalOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setIsImageModalOpen(false);
            }
          }}
        >
          <div
            className="s01-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="s04-image-modal-title"
          >
            <div className="s01-modal-head">
              <div className="s01-modal-title-wrap">
                <div className="s01-modal-icon" aria-hidden="true">
                  <ImagePlus size={19} />
                </div>
                <div>
                  <h2 id="s04-image-modal-title">Sisipkan Logo atau Gambar Aman</h2>
                  <p>Hanya menerima logo resmi madrasah atau berkas PNG/JPEG/WEBP lokal tervalidasi.</p>
                </div>
              </div>
              <button
                type="button"
                className="s01-modal-close"
                onClick={() => setIsImageModalOpen(false)}
                aria-label="Tutup dialog sisip gambar"
              >
                <X size={16} />
              </button>
            </div>

            <div className="s01-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="s04-form-grid">
                <div className="s04-field">
                  <label htmlFor="s04-img-width">Lebar Gambar (mm)</label>
                  <input
                    id="s04-img-width"
                    type="number"
                    min={10}
                    max={180}
                    value={imageWidthMm}
                    onChange={(e) => setImageWidthMm(Math.max(10, Math.min(180, Number(e.target.value) || 26)))}
                  />
                </div>
                <div className="s04-field">
                  <label htmlFor="s04-img-align">Perataan Gambar</label>
                  <select
                    id="s04-img-align"
                    value={imageAlign}
                    onChange={(e) => setImageAlign(e.target.value as 'left' | 'center' | 'right')}
                  >
                    <option value="left">Rata Kiri</option>
                    <option value="center">Rata Tengah</option>
                    <option value="right">Rata Kanan</option>
                  </select>
                </div>
              </div>

              <div className="s04-field">
                <label htmlFor="s04-img-alt">Keterangan Gambar (Alt)</label>
                <input
                  id="s04-img-alt"
                  type="text"
                  maxLength={200}
                  value={imageAlt}
                  onChange={(e) => setImageAlt(e.target.value)}
                />
              </div>

              <input
                ref={imageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  e.target.value = '';
                  void handleUploadCustomImage(file);
                }}
              />

              {imageError && (
                <div className="s04-banner is-error" role="alert" style={{ padding: '8px 10px' }}>
                  {imageError}
                </div>
              )}
            </div>

            <div className="s01-modal-foot" style={{ flexWrap: 'wrap', gap: '8px' }}>
              <button
                type="button"
                className="s02-btn-secondary"
                onClick={() => setIsImageModalOpen(false)}
              >
                Batal
              </button>
              <button
                type="button"
                className="s02-btn-secondary"
                onClick={() => imageInputRef.current?.click()}
              >
                <ImagePlus size={14} aria-hidden="true" />
                <span>Unggah PNG / JPG / WEBP</span>
              </button>
              <button
                type="button"
                className="s02-btn-primary"
                onClick={handleInsertMadrasahLogo}
              >
                <span>Sisipkan Logo Madrasah</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {isDiffModalOpen && (
        <div
          className="s01-modal-scrim"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsDiffModalOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setIsDiffModalOpen(false);
            }
          }}
        >
          <div
            className="s01-modal-panel s04-diff-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="s04-diff-modal-title"
          >
            <div className="s01-modal-head">
              <div className="s01-modal-title-wrap">
                <div className="s01-modal-icon" aria-hidden="true">
                  <GitCompare size={19} />
                </div>
                <div>
                  <h2 id="s04-diff-modal-title">Perbandingan Snapshot Sumber vs Data Terkini</h2>
                  <p>
                    Suntingan manual pada naskah S04 tetap aman dan tidak akan tertimpa otomatis.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="s01-modal-close"
                onClick={() => setIsDiffModalOpen(false)}
                aria-label="Tutup dialog perbandingan sumber"
              >
                <X size={16} />
              </button>
            </div>

            <div className="s01-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '55vh', overflowY: 'auto' }}>
              {sourceDiff.items.length === 0 ? (
                <p style={{ margin: 0, color: '#4f6b63' }}>
                  Dokumen ini tidak memiliki data snapshot terikat untuk dibandingkan.
                </p>
              ) : (
                <table className="s04-diff-table">
                  <thead>
                    <tr>
                      <th>Sumber &amp; Field</th>
                      <th>Snapshot Draft</th>
                      <th>Data Sistem Saat Ini</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sourceDiff.items.map((item) => (
                      <tr key={item.id} className={item.status !== 'UNCHANGED' ? 'is-changed' : ''}>
                        <td>
                          <strong>{item.fieldLabel}</strong>
                          <div style={{ fontSize: '11px', color: '#536d65' }}>{item.categoryLabel}</div>
                        </td>
                        <td>{item.snapshotValue}</td>
                        <td>{item.liveValue}</td>
                        <td>
                          <span className={`s04-diff-status ${item.status.toLowerCase()}`}>
                            {item.status === 'UNCHANGED'
                              ? 'Sama'
                              : item.status === 'CHANGED'
                              ? 'Berubah'
                              : 'Sumber Hilang'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {sourceDiff.changedSourceKeys.length > 0 && (
                <div className="s04-diff-adopt-box">
                  <strong>Pilih kelompok snapshot yang ingin disegarkan ke metadata draft:</strong>
                  <div className="s04-checkbox-stack">
                    {sourceDiff.changedSourceKeys.map((key) => {
                      const label =
                        key === 'settings.madrasah_identity_signatory'
                          ? 'Identitas Madrasah & Penandatangan'
                          : key === 'master.teachers.selected'
                          ? 'Daftar Data Master Guru Terpilih'
                          : 'Versi Jadwal Terbit Resmi (ScheduleVersion)';
                      const checked = selectedDiffKeys.includes(key);
                      return (
                        <label key={key} className="s04-checkbox-row">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setSelectedDiffKeys((prev) =>
                                e.target.checked ? [...prev, key] : prev.filter((k) => k !== key)
                              );
                            }}
                          />
                          <span>{label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="s01-modal-foot">
              <button
                type="button"
                className="s02-btn-secondary"
                onClick={() => setIsDiffModalOpen(false)}
              >
                Tutup
              </button>
              {sourceDiff.changedSourceKeys.length > 0 && (
                <button
                  type="button"
                  className="s02-btn-primary"
                  disabled={selectedDiffKeys.length === 0}
                  onClick={() => void handleApplySelectedSourceDiffs()}
                >
                  <span>Perbarui Snapshot Pilihan (Pertahankan Naskah)</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
