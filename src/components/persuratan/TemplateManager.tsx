import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Copy,
  Edit3,
  FilePlus2,
  Hash,
  Lock,
  Plus,
  Power,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type { AppState } from '../../domain/types';
import type { DocumentKind } from '../../domain/persuratan/types';
import type {
  DocumentTemplate,
  TemplateCategory,
  TemplateFieldDefinition,
  TemplateOrientation,
  TemplatePaperSize,
  TemplatePreviewBlock,
} from '../../domain/persuratan/templates/types';
import { TEMPLATE_CATEGORIES, getCategoryLabel } from '../../domain/persuratan/templates/registry';
import {
  cloneTemplateToMadrasah,
  collectAllTemplates,
} from '../../domain/persuratan/templates/selectors';
import {
  createCustomTemplateInState,
  createTemplateFromDocumentInState,
  deleteCustomTemplateInState,
  toggleCustomTemplateStatusInState,
  updateCustomTemplateInState,
  validateTemplateStructure,
} from '../../domain/persuratan/templates/templateManagerEngine';
import { DOCUMENT_KIND_LABELS } from '../../domain/persuratan/selectors';
import { getEffectivePaperDimensionsMm } from '../../domain/persuratan/studio/contentValidation';
import { TemplateVisualEditor } from './TemplateVisualEditor';
import { NumberingFormatModal } from './NumberingFormatModal';
import { LivePreviewViewport } from '../LivePreviewViewport';
import { OfficialKopSuratPreview } from '../OfficialKopSuratPreview';
import {
  formatTokenSlotLabel,
  renderPaperDocumentHeader,
  renderPreviewBlock,
} from './TemplateGallery';
import './TemplateManager.css';

export interface TemplateManagerProps {
  state: AppState;
  initialSourceDocumentId?: string | null;
  onPersistState: (nextState: AppState) => Promise<void>;
  onBackToGallery: () => void;
  onUseTemplate?: (tpl: DocumentTemplate) => void;
  onNotify?: (message: string, kind?: 'success' | 'info' | 'warning' | 'error') => void;
}

type ManagerScope = 'ALL' | 'MADRASAH' | 'SYSTEM' | 'INACTIVE';

const DEFAULT_CUSTOM_BLOCKS: TemplatePreviewBlock[] = [
  { type: 'paragraph', text: "Assalamu'alaikum Wr. Wb." },
  {
    type: 'paragraph',
    text: 'Disampaikan kepada {{PIHAK_TUJUAN}} perihal {{PERIHAL}} pada tanggal {{TANGGAL_SURAT}}.',
  },
  {
    type: 'paragraph',
    text: 'Kepala Madrasah — {{NAMA_KEPALA_MADRASAH}}',
  },
];

export function TemplateManager({
  state,
  initialSourceDocumentId = null,
  onPersistState,
  onBackToGallery,
  onUseTemplate,
  onNotify,
}: TemplateManagerProps) {
  const allTemplates = useMemo(
    () => collectAllTemplates(state.customTemplates ?? []),
    [state.customTemplates]
  );

  const [scope, setScope] = useState<ManagerScope>('ALL');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>(allTemplates[0]?.id ?? 'SYS-TPL-01');
  const [editorMode, setEditorMode] = useState<'inspect' | 'create' | 'edit' | 'from-doc'>(
    initialSourceDocumentId ? 'from-doc' : 'inspect'
  );

  // Create/Edit form state
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formCategory, setFormCategory] = useState<TemplateCategory>('KORESPONDENSI');
  const [formKind, setFormKind] = useState<DocumentKind>('SURAT_KELUAR');
  const [formDesc, setFormDesc] = useState('');
  const [formPaper, setFormPaper] = useState<TemplatePaperSize>('a4');
  const [formOrientation, setFormOrientation] = useState<TemplateOrientation>('portrait');
  const [formKop, setFormKop] = useState(true);
  const [formHeaderTitle, setFormHeaderTitle] = useState('');
  const [formNumberPlaceholder, setFormNumberPlaceholder] = useState('Nomor: {{NOMOR_SURAT}}');
  const [formBlocks, setFormBlocks] = useState<TemplatePreviewBlock[]>(DEFAULT_CUSTOM_BLOCKS);
  const [visualEditorKey, setVisualEditorKey] = useState<string>('init');
  const [isNumberingModalOpen, setIsNumberingModalOpen] = useState<boolean>(false);
  const [formFields, setFormFields] = useState<TemplateFieldDefinition[]>([
    { key: 'perihal', label: 'Perihal / Pokok Surat', kind: 'OPERATOR_INPUT', required: true },
    { key: 'pihak_tujuan', label: 'Pihak Tujuan', kind: 'OPERATOR_INPUT', required: false },
  ]);

  // Create-from-document state
  const [sourceDocId, setSourceDocId] = useState<string>(
    initialSourceDocumentId ?? state.documents?.[0]?.id ?? ''
  );
  const [fromDocName, setFromDocName] = useState('');
  const [fromDocCategory, setFromDocCategory] = useState<TemplateCategory>('KORESPONDENSI');
  const [isSaving, setIsSaving] = useState(false);

  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allTemplates.filter((tpl) => {
      if (scope === 'SYSTEM' && tpl.source !== 'SYSTEM') return false;
      if (scope === 'MADRASAH' && tpl.source === 'SYSTEM') return false;
      if (scope === 'INACTIVE' && tpl.status !== 'ARCHIVED') return false;
      if (q) {
        const hay = `${tpl.code} ${tpl.name} ${tpl.description} ${getCategoryLabel(tpl.category)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allTemplates, scope, search]);

  const selectedTemplate = useMemo(
    () => allTemplates.find((t) => t.id === selectedId) ?? filteredList[0] ?? allTemplates[0] ?? null,
    [allTemplates, selectedId, filteredList]
  );

  // Live validation candidate while creating or editing
  const draftValidation = useMemo(() => {
    if (editorMode !== 'create' && editorMode !== 'edit') return null;
    const candidate: DocumentTemplate = {
      id: 'PREVIEW-CANDIDATE',
      code: formCode.trim() || 'MAD-NEW',
      catalogOrder: 999,
      name: formName,
      category: formCategory,
      description: formDesc,
      purpose: formDesc,
      documentKind: formKind,
      version: '1.0.0',
      status: 'ACTIVE',
      source: 'MADRASAH',
      isReadOnly: false,
      autoDataSources: formFields.filter((f) => f.kind === 'AUTO_SYSTEM').map((f) => f.label),
      requiredInputs: formFields
        .filter((f) => f.kind === 'OPERATOR_INPUT' && f.required)
        .map((f) => f.label),
      fields: formFields,
      initialPageSettings: {
        paperSize: formPaper,
        orientation: formOrientation,
        marginsMm: { top: 20, right: 20, bottom: 20, left: 25 },
      },
      documentHeader: {
        includeKopSurat: formKop,
        title: formHeaderTitle,
        numberPlaceholder: formNumberPlaceholder,
      },
      previewBlocks: formBlocks,
    };
    return validateTemplateStructure(candidate);
  }, [
    editorMode,
    formName,
    formCode,
    formCategory,
    formKind,
    formDesc,
    formPaper,
    formOrientation,
    formKop,
    formHeaderTitle,
    formNumberPlaceholder,
    formBlocks,
    formFields,
  ]);

  const openCreateForm = () => {
    setFormName('');
    setFormCode(`MAD-TPL-${String((state.customTemplates?.length ?? 0) + 1).padStart(2, '0')}`);
    setFormCategory('KORESPONDENSI');
    setFormKind('SURAT_KELUAR');
    setFormDesc('');
    setFormPaper('a4');
    setFormOrientation('portrait');
    setFormKop(true);
    setFormHeaderTitle('SURAT EDARAN MADRASAH');
    setFormNumberPlaceholder('Nomor: {{NOMOR_SURAT}}');
    setFormBlocks(DEFAULT_CUSTOM_BLOCKS);
    setVisualEditorKey(`create-${Date.now()}`);
    setFormFields([
      { key: 'perihal', label: 'Perihal / Pokok Surat', kind: 'OPERATOR_INPUT', required: true },
      { key: 'pihak_tujuan', label: 'Pihak Tujuan', kind: 'OPERATOR_INPUT', required: false },
    ]);
    setEditorMode('create');
  };

  const openEditForm = (tpl: DocumentTemplate) => {
    if (tpl.source === 'SYSTEM' || tpl.isReadOnly) {
      onNotify?.(
        'Template bawaan bersifat baca-saja. Klik "Kloning ke Madrasah" untuk membuat salinan yang dapat diedit.',
        'info'
      );
      return;
    }
    setSelectedId(tpl.id);
    setFormName(tpl.name);
    setFormCode(tpl.code);
    setFormCategory(tpl.category);
    setFormKind(tpl.documentKind);
    setFormDesc(tpl.description);
    setFormPaper(tpl.initialPageSettings.paperSize);
    setFormOrientation(tpl.initialPageSettings.orientation);
    setFormKop(tpl.documentHeader.includeKopSurat);
    setFormHeaderTitle(tpl.documentHeader.title);
    setFormNumberPlaceholder(tpl.documentHeader.numberPlaceholder);
    setFormBlocks(tpl.previewBlocks.length > 0 ? tpl.previewBlocks : DEFAULT_CUSTOM_BLOCKS);
    setVisualEditorKey(`edit-${tpl.id}-${tpl.version}`);
    setFormFields(tpl.fields.length > 0 ? tpl.fields.map((f) => ({ ...f })) : []);
    setEditorMode('edit');
  };

  const handleCloneTemplate = async (tpl: DocumentTemplate) => {
    setIsSaving(true);
    try {
      const cloned = cloneTemplateToMadrasah(
        tpl,
        `${tpl.name} (Salinan Madrasah)`,
        state.customTemplates ?? []
      );
      await onPersistState({
        ...state,
        customTemplates: [cloned, ...(state.customTemplates ?? [])],
      });
      setSelectedId(cloned.id);
      setScope('MADRASAH');
      setEditorMode('inspect');
      onNotify?.(
        `Template "${tpl.name}" berhasil dikloning sebagai "${cloned.name}". Template bawaan tetap utuh.`,
        'success'
      );
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Gagal mengkloning template.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveTemplateForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const blocks = formBlocks;
      if (editorMode === 'create') {
        const res = createCustomTemplateInState(state, {
          name: formName,
          code: formCode,
          category: formCategory,
          documentKind: formKind,
          description: formDesc,
          paperSize: formPaper,
          orientation: formOrientation,
          includeKopSurat: formKop,
          headerTitle: formHeaderTitle,
          numberPlaceholder: formNumberPlaceholder,
          fields: formFields,
          previewBlocks: blocks,
        });
        await onPersistState(res.state);
        setSelectedId(res.template.id);
        setEditorMode('inspect');
        onNotify?.(`Template madrasah "${res.template.name}" berhasil dibuat & tervalidasi.`, 'success');
      } else if (editorMode === 'edit' && selectedTemplate) {
        const res = updateCustomTemplateInState(state, selectedTemplate.id, {
          name: formName,
          code: formCode,
          category: formCategory,
          documentKind: formKind,
          description: formDesc,
          paperSize: formPaper,
          orientation: formOrientation,
          includeKopSurat: formKop,
          headerTitle: formHeaderTitle,
          numberPlaceholder: formNumberPlaceholder,
          fields: formFields,
          previewBlocks: blocks,
        });
        await onPersistState(res.state);
        setEditorMode('inspect');
        onNotify?.(
          `Template "${res.template.name}" diperbarui ke v${res.template.version} tanpa mengubah dokumen lama.`,
          'success'
        );
      }
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Gagal menyimpan template.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (tpl: DocumentTemplate) => {
    setIsSaving(true);
    try {
      const res = toggleCustomTemplateStatusInState(state, tpl.id);
      await onPersistState(res.state);
      onNotify?.(
        res.template.status === 'ACTIVE'
          ? `Template "${tpl.name}" diaktifkan kembali.`
          : `Template "${tpl.name}" dinonaktifkan dari Galeri Template (dokumen lama tetap utuh).`,
        'info'
      );
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Gagal mengubah status template.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTemplate = async (tpl: DocumentTemplate) => {
    setIsSaving(true);
    try {
      const res = deleteCustomTemplateInState(state, tpl.id);
      await onPersistState(res.state);
      setSelectedId('SYS-TPL-01');
      setEditorMode('inspect');
      onNotify?.(
        `Template madrasah "${res.deletedName}" dihapus. Arsip dokumen lama tetap utuh dan dapat dibuka kembali.`,
        'info'
      );
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Gagal menghapus template.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateFromDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceDocId) {
      onNotify?.('Pilih dokumen sumber terlebih dahulu.', 'warning');
      return;
    }
    setIsSaving(true);
    try {
      const res = createTemplateFromDocumentInState(state, {
        documentId: sourceDocId,
        name: fromDocName.trim() || 'Template Baru dari Dokumen',
        category: fromDocCategory,
      });
      await onPersistState(res.state);
      setSelectedId(res.template.id);
      setEditorMode('inspect');
      setScope('MADRASAH');
      onNotify?.(
        `Template "${res.template.name}" dibuat dari dokumen dengan ${res.piiReport.redactionCount} redaksi sanitasi data personal (nama/NIP/tanggal/nomor).`,
        'success'
      );
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Gagal mengekstrak template dari dokumen.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const systemCount = allTemplates.filter((t) => t.source === 'SYSTEM').length;
  const madrasahCount = allTemplates.filter((t) => t.source !== 'SYSTEM').length;
  const inactiveCount = allTemplates.filter((t) => t.status === 'ARCHIVED').length;
  const isStudioExpanded = editorMode !== 'inspect';

  return (
    <section className="s07-shell" aria-label="Template Manager Madrasah">
      <header className="s07-header">
        <div>
          <div className="s5-page-kicker">PENGATURAN TEMPLATE · FORMAT NASKAH</div>
          <h1 className="s5-page-title">Kelola Template Madrasah</h1>
          <p className="s5-page-subtitle">
            {systemCount} template bawaan &amp; {madrasahCount} template khusus madrasah. Perubahan tidak memengaruhi arsip lama.
          </p>
        </div>
        <div className="s07-header-actions">
          <div className="s01-utility-dock" role="group" aria-label="Utilitas format dan ekstraksi template">
            <button
              type="button"
              className="s01-utility-btn"
              onClick={() => setIsNumberingModalOpen(true)}
              data-tooltip="Atur pola nomor surat resmi"
              data-tooltip-pos="bottom"
            >
              <Hash size={14} aria-hidden="true" />
              <span>Format Nomor Surat</span>
            </button>
            {(state.documents?.length ?? 0) > 0 && (
              <>
                <span className="s01-utility-sep" aria-hidden="true" />
                <button
                  type="button"
                  className="s01-utility-btn"
                  data-tooltip="Ekstrak pola dari arsip dokumen dengan sanitasi PII"
                  data-tooltip-pos="bottom"
                  onClick={() => {
                    setSourceDocId(sourceDocId || state.documents?.[0]?.id || '');
                    setFromDocName('');
                    setEditorMode('from-doc');
                  }}
                >
                  <ShieldCheck size={14} aria-hidden="true" />
                  <span>Ekstrak dari Dokumen</span>
                </button>
              </>
            )}
          </div>
          <button type="button" className="s02-btn-secondary" onClick={onBackToGallery}>
            <ArrowLeft size={14} aria-hidden="true" />
            <span>Galeri</span>
          </button>
          <button type="button" className="s02-btn-primary" onClick={openCreateForm}>
            <FilePlus2 size={15} aria-hidden="true" />
            <span>Buat Template Baru</span>
          </button>
        </div>
      </header>

      <div className={`s07-workbench ${isStudioExpanded ? 'is-studio-expanded' : ''}`}>
        {/* Left List (Hidden in Expanded Studio Focus Mode so Editor gets full canvas) */}
        {!isStudioExpanded && (
        <div className="s07-panel">
          <div className="s07-filter-bar">
            <div className="s07-search-wrap">
              <Search size={14} className="s07-search-icon" aria-hidden="true" />
              <input
                type="search"
                className="s07-input has-icon"
                placeholder="Cari kode, nama, atau kategori template…"
                aria-label="Cari template di Template Manager"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }} role="tablist" aria-label="Filter Sumber Template">
              {(
                [
                  ['ALL', `Semua (${allTemplates.length})`],
                  ['MADRASAH', `Madrasah (${madrasahCount})`],
                  ['SYSTEM', `Bawaan (${systemCount})`],
                  ['INACTIVE', `Nonaktif (${inactiveCount})`],
                ] as Array<[ManagerScope, string]>
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={scope === id}
                  className={`s02-collection-tab ${scope === id ? 'is-active' : ''}`}
                  onClick={() => setScope(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="s07-table-list">
            {filteredList.length === 0 ? (
              <div className="s02-empty-box">
                <h3>Tidak ada template pada tampilan ini</h3>
                <p>Buat template khusus madrasah baru atau kloning salah satu dari 30 template bawaan sistem.</p>
              </div>
            ) : (
              filteredList.map((tpl) => {
                const isSystem = tpl.source === 'SYSTEM';
                const isSelected = selectedTemplate?.id === tpl.id && editorMode === 'inspect';
                return (
                  <article
                    key={tpl.id}
                    className={`s07-row ${isSelected ? 'is-selected' : ''} ${
                      tpl.status === 'ARCHIVED' ? 'is-inactive' : ''
                    }`}
                  >
                    <div className="s07-row-main">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', fontSize: '11px', color: '#526861' }}>
                        <span className="s02-code-tag">{tpl.code}</span>
                        <span>{getCategoryLabel(tpl.category)}</span>
                        <span className="s5-tnum">· v{tpl.version}</span>
                        <span>
                          · {isSystem ? 'Bawaan (Terkunci)' : tpl.status === 'ACTIVE' ? 'Madrasah · Aktif' : 'Madrasah · Nonaktif'}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="s07-row-title-btn"
                        onClick={() => {
                          setSelectedId(tpl.id);
                          setEditorMode('inspect');
                        }}
                      >
                        {tpl.name}
                      </button>
                      <small style={{ fontSize: '12px', color: '#4b635d' }}>{tpl.description}</small>
                    </div>
                    <div className="s07-row-actions">
                      <button
                        type="button"
                        className="s02-icon-btn is-icon-only is-compact"
                        disabled={isSaving}
                        aria-label={`Kloning template ${tpl.name} ke Madrasah`}
                        data-tooltip="Kloning ke Madrasah"
                        data-tooltip-pos="left"
                        onClick={() => void handleCloneTemplate(tpl)}
                      >
                        <Copy size={13} strokeWidth={1.75} aria-hidden="true" />
                      </button>
                      {!isSystem && (
                        <>
                          <button
                            type="button"
                            className="s02-icon-btn is-icon-only is-compact"
                            aria-label={`Edit template ${tpl.name}`}
                            data-tooltip="Edit template"
                            data-tooltip-pos="left"
                            onClick={() => openEditForm(tpl)}
                          >
                            <Edit3 size={13} strokeWidth={1.75} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="s02-icon-btn is-icon-only is-compact"
                            disabled={isSaving}
                            aria-label={`${tpl.status === 'ACTIVE' ? 'Nonaktifkan' : 'Aktifkan'} template ${tpl.name}`}
                            data-tooltip={tpl.status === 'ACTIVE' ? 'Nonaktifkan template' : 'Aktifkan template'}
                            data-tooltip-pos="left"
                            onClick={() => void handleToggleStatus(tpl)}
                          >
                            <Power size={13} strokeWidth={1.75} aria-hidden="true" />
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>
        )}

        {/* Right Inspector / Full-Canvas Studio Panel */}
        <aside className={`s07-panel ${isStudioExpanded ? 's07-studio-surface p5-view-stage' : ''}`} aria-label="Editor dan Pratinjau Pengaturan Template">
          {isStudioExpanded && (
            <div className="s07-studio-topbar">
              <button
                type="button"
                className="s02-btn-secondary"
                onClick={() => setEditorMode('inspect')}
              >
                <ArrowLeft size={14} aria-hidden="true" />
                <span>Kembali ke Daftar Template</span>
              </button>
              <span className="s07-studio-mode-badge">
                {editorMode === 'create'
                  ? 'Mode Studio · Template Baru'
                  : editorMode === 'edit'
                  ? `Mode Studio · Sunting ${selectedTemplate?.code ?? ''}`
                  : 'Mode Studio · Ekstrak Dokumen'}
              </span>
            </div>
          )}

          {editorMode === 'from-doc' && (
            <form onSubmit={(e) => void handleCreateFromDocument(e)} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <h2 className="s07-studio-heading">
                <ShieldCheck size={18} aria-hidden="true" />
                <span>Buat Template dari Dokumen (Sanitasi PII)</span>
              </h2>
              <div className="s07-validation-box">
                Nama guru/pejabat, angka NIP/NPK 18 digit, email, nomor telepon, nomor surat, dan tanggal spesifik otomatis disanitasi menjadi placeholder aman (<code>{'{{NAMA_GURU}}'}</code>, <code>{'{{NIP_PEJABAT}}'}</code>, <code>{'{{NOMOR_SURAT}}'}</code>).
              </div>
              <div className="s07-field">
                <label htmlFor="s07-source-doc">Pilih Dokumen Sumber</label>
                <select
                  id="s07-source-doc"
                  className="s07-select"
                  value={sourceDocId}
                  onChange={(e) => setSourceDocId(e.target.value)}
                >
                  {(state.documents ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title} ({d.documentNumber ?? d.status})
                    </option>
                  ))}
                </select>
              </div>
              <div className="s07-field">
                <label htmlFor="s07-from-doc-name">Nama Template Madrasah Baru</label>
                <input
                  id="s07-from-doc-name"
                  type="text"
                  className="s07-input"
                  required
                  placeholder="Misal: Surat Pemberitahuan Kegiatan Madrasah"
                  value={fromDocName}
                  onChange={(e) => setFromDocName(e.target.value)}
                />
              </div>
              <div className="s07-field">
                <label htmlFor="s07-from-doc-cat">Kategori Template</label>
                <select
                  id="s07-from-doc-cat"
                  className="s07-select"
                  value={fromDocCategory}
                  onChange={(e) => setFromDocCategory(e.target.value as TemplateCategory)}
                >
                  {TEMPLATE_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="s02-btn-secondary" onClick={() => setEditorMode('inspect')}>
                  Batal
                </button>
                <button type="submit" className="s02-btn-primary" disabled={isSaving}>
                  <ShieldCheck size={14} />
                  <span>Sanitasi &amp; Simpan Template</span>
                </button>
              </div>
            </form>
          )}

          {(editorMode === 'create' || editorMode === 'edit') && (
            <form onSubmit={(e) => void handleSaveTemplateForm(e)} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h2 className="s07-studio-heading">
                <Edit3 size={17} aria-hidden="true" />
                <span>
                  {editorMode === 'create' ? 'Buat Template Madrasah Baru' : `Sunting Template: ${selectedTemplate?.code}`}
                </span>
              </h2>

              <div className="s07-form-grid">
                <div className="s07-field is-span-2">
                  <label htmlFor="s07-name">Nama Template *</label>
                  <input
                    id="s07-name"
                    type="text"
                    className="s07-input"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </div>
                <div className="s07-field">
                  <label htmlFor="s07-code">Kode Template *</label>
                  <input
                    id="s07-code"
                    type="text"
                    className="s07-input"
                    required
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                  />
                </div>
                <div className="s07-field">
                  <label htmlFor="s07-cat">Kategori *</label>
                  <select
                    id="s07-cat"
                    className="s07-select"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as TemplateCategory)}
                  >
                    {TEMPLATE_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="s07-field">
                  <label htmlFor="s07-kind">Jenis Naskah *</label>
                  <select
                    id="s07-kind"
                    className="s07-select"
                    value={formKind}
                    onChange={(e) => setFormKind(e.target.value as DocumentKind)}
                  >
                    {(Object.keys(DOCUMENT_KIND_LABELS) as DocumentKind[]).map((k) => (
                      <option key={k} value={k}>
                        {DOCUMENT_KIND_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="s07-field">
                  <label htmlFor="s07-paper">Kertas &amp; Orientasi</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <select
                      id="s07-paper"
                      className="s07-select"
                      value={formPaper}
                      onChange={(e) => setFormPaper(e.target.value as TemplatePaperSize)}
                    >
                      <option value="a4">A4</option>
                      <option value="f4">F4</option>
                    </select>
                    <select
                      aria-label="Orientasi kertas"
                      className="s07-select"
                      value={formOrientation}
                      onChange={(e) => setFormOrientation(e.target.value as TemplateOrientation)}
                    >
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </div>
                </div>
                <div className="s07-field is-full">
                  <label htmlFor="s07-desc">Deskripsi *</label>
                  <input
                    id="s07-desc"
                    type="text"
                    className="s07-input"
                    required
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                  />
                </div>
                <div className="s07-field is-full">
                  <label htmlFor="s07-header-title">Judul Kepala Naskah *</label>
                  <input
                    id="s07-header-title"
                    type="text"
                    className="s07-input"
                    required
                    value={formHeaderTitle}
                    onChange={(e) => setFormHeaderTitle(e.target.value)}
                  />
                </div>
                <div className="s07-field is-full">
                  <label htmlFor="s07-num-placeholder">Format Placeholder Nomor</label>
                  <input
                    id="s07-num-placeholder"
                    type="text"
                    className="s07-input"
                    value={formNumberPlaceholder}
                    onChange={(e) => setFormNumberPlaceholder(e.target.value)}
                  />
                </div>
                <div className="s07-field is-full">
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formKop}
                      onChange={(e) => setFormKop(e.target.checked)}
                    />
                    <span>Sertakan Kop Surat Madrasah otomatis</span>
                  </label>
                </div>
                <div className="s07-field is-full">
                  <label>Editor Visual Struktur Naskah &amp; Token *</label>
                  <TemplateVisualEditor
                    initialBlocks={formBlocks}
                    editorKey={visualEditorKey}
                    onChangeBlocks={setFormBlocks}
                  />
                </div>
              </div>

              {/* Field Required/Optional Builder (Collapsible Luxury Disclosure) */}
              <details className="p5-luxury-disclosure">
                <summary>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    <span>Field Wajib &amp; Opsional ({formFields.length})</span>
                    <span className="nfm-kinds-count s5-tnum">Konfigurasi Isian Form</span>
                  </span>
                  <ChevronDown size={15} className="p5-disclosure-caret" aria-hidden="true" />
                </summary>
                <div className="p5-disclosure-body" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11.5px', color: '#526861' }}>
                      Tentukan daftar field yang harus diisi operator saat membuat surat dari template ini.
                    </span>
                    <button
                      type="button"
                      className="s02-icon-btn"
                      onClick={() =>
                        setFormFields((prev) => [
                          ...prev,
                          {
                            key: `field_${prev.length + 1}`,
                            label: `Isian ${prev.length + 1}`,
                            kind: 'OPERATOR_INPUT',
                            required: false,
                          },
                        ])
                      }
                    >
                      <Plus size={12} /> Tambah Field
                    </button>
                  </div>
                  {formFields.map((f, idx) => (
                    <div key={idx} className="s07-field-editor-row">
                      <input
                        type="text"
                        className="s07-input"
                        aria-label={`Kunci field ${idx + 1}`}
                        value={f.key}
                        onChange={(e) =>
                          setFormFields((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, key: e.target.value } : item))
                          )
                        }
                      />
                      <input
                        type="text"
                        className="s07-input"
                        aria-label={`Label field ${idx + 1}`}
                        value={f.label}
                        onChange={(e) =>
                          setFormFields((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, label: e.target.value } : item))
                          )
                        }
                      />
                      <label style={{ fontSize: '11.5px', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                        <input
                          type="checkbox"
                          checked={f.required}
                          onChange={(e) =>
                            setFormFields((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, required: e.target.checked } : item
                              )
                            )
                          }
                        />
                        Wajib
                      </label>
                      <button
                        type="button"
                        className="s02-icon-btn is-icon-only is-compact is-danger"
                        aria-label={`Hapus field ${f.label}`}
                        data-tooltip="Hapus field"
                        data-tooltip-pos="left"
                        onClick={() => setFormFields((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        <Trash2 size={13} strokeWidth={1.75} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              </details>

              {/* Live Validation Summary */}
              {draftValidation && (
                <div className={`s07-validation-box ${draftValidation.valid ? '' : 'has-error'}`}>
                  <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    {draftValidation.valid ? (
                      <>
                        <CheckCircle2 size={13} /> Struktur Template Valid ({draftValidation.detectedPlaceholders.length} placeholder)
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={13} /> Perlu Perbaikan Struktur
                      </>
                    )}
                  </strong>
                  {draftValidation.errors.map((err, i) => (
                    <div key={i}>• {err}</div>
                  ))}
                  {draftValidation.warnings.map((w, i) => (
                    <div key={i} style={{ color: '#855318' }}>
                      ⚠ {w}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="s02-btn-secondary" onClick={() => setEditorMode('inspect')}>
                  Batal
                </button>
                <button
                  type="submit"
                  className="s02-btn-primary"
                  disabled={isSaving || !draftValidation?.valid}
                >
                  <CheckCircle2 size={14} />
                  <span>Simpan Template</span>
                </button>
              </div>
            </form>
          )}

          {editorMode === 'inspect' && selectedTemplate && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <span className="s02-code-tag">{selectedTemplate.code}</span>
                <span style={{ fontSize: '11.5px', color: '#4b635d', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  {selectedTemplate.source === 'SYSTEM' ? (
                    <>
                      <Lock size={12} /> Template Bawaan (Aman/Baca-Saja)
                    </>
                  ) : (
                    `Madrasah · v${selectedTemplate.version} · ${selectedTemplate.status}`
                  )}
                </span>
              </div>
              <h2 style={{ margin: 0, fontSize: '15.5px', color: '#0b2923' }}>{selectedTemplate.name}</h2>
              <p style={{ margin: 0, fontSize: '12.5px', color: '#4b635d', lineHeight: 1.5 }}>
                {selectedTemplate.description}
              </p>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {selectedTemplate.status === 'ACTIVE' && onUseTemplate && (
                  <button
                    type="button"
                    className="s02-btn-primary"
                    style={{ flex: 1 }}
                    onClick={() => onUseTemplate(selectedTemplate)}
                  >
                    <FilePlus2 size={14} aria-hidden="true" />
                    <span>Pakai Template Ini</span>
                  </button>
                )}
                <button
                  type="button"
                  className="s02-btn-secondary"
                  disabled={isSaving}
                  onClick={() => void handleCloneTemplate(selectedTemplate)}
                >
                  <Copy size={14} />
                  <span>Kloning</span>
                </button>
                {selectedTemplate.source !== 'SYSTEM' && (
                  <>
                    <button
                      type="button"
                      className="s02-btn-secondary"
                      onClick={() => openEditForm(selectedTemplate)}
                    >
                      <Edit3 size={14} />
                      <span>Sunting</span>
                    </button>
                    <button
                      type="button"
                      className="s02-btn-secondary"
                      style={{ color: '#8f2d24', borderColor: '#e2b5af' }}
                      disabled={isSaving}
                      onClick={() => void handleDeleteTemplate(selectedTemplate)}
                    >
                      <Trash2 size={14} />
                      <span>Hapus</span>
                    </button>
                  </>
                )}
              </div>

              {/* Validation badge */}
              {(() => {
                const check = validateTemplateStructure(selectedTemplate);
                return (
                  <div className={`s07-validation-box ${check.valid ? '' : 'has-error'}`}>
                    <strong>
                      {check.valid ? 'Struktur Tervalidasi' : 'Perlu Perbaikan'} ·{' '}
                      {check.detectedPlaceholders.length} Placeholder
                    </strong>
                    <div style={{ fontSize: '11.5px', color: '#445e56' }}>
                      {check.detectedPlaceholders
                        .slice(0, 8)
                        .map((tok) => formatTokenSlotLabel(tok))
                        .join(', ') || 'Tanpa isian variabel eksplisit'}
                    </div>
                  </div>
                );
              })()}

              {/* Real-Scale Paper Preview */}
              {(() => {
                const paperDims = getEffectivePaperDimensionsMm(
                  selectedTemplate.initialPageSettings.paperSize,
                  selectedTemplate.initialPageSettings.orientation
                );
                const margins = selectedTemplate.initialPageSettings.marginsMm;
                return (
                  <LivePreviewViewport
                    title="Pratinjau Tata Letak Template"
                    metaText={`${selectedTemplate.initialPageSettings.paperSize.toUpperCase()} · ${
                      selectedTemplate.initialPageSettings.orientation === 'portrait'
                        ? 'Portrait'
                        : 'Landscape'
                    }`}
                    paperWidthMm={paperDims.widthMm}
                    paperHeightMm={paperDims.heightMm}
                    compactMaxHeight={380}
                    paperStyle={{
                      padding: `${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm`,
                    }}
                    ariaLabel="Pratinjau isi dan tata letak template madrasah"
                  >
                    <div className="s02-paper-sheet">
                      {selectedTemplate.documentHeader.includeKopSurat && (
                        <div className="s02-paper-kop">
                          <OfficialKopSuratPreview settings={state.settings} variant="full" />
                        </div>
                      )}
                      {renderPaperDocumentHeader(selectedTemplate.documentHeader)}
                      {selectedTemplate.previewBlocks.map((blk, i) => renderPreviewBlock(blk, i))}
                    </div>
                  </LivePreviewViewport>
                );
              })()}
            </>
          )}
        </aside>
      </div>
      {/* Modal Pengaturan Format Penomoran Surat Madrasah */}
      {isNumberingModalOpen && (
        <NumberingFormatModal
          open={isNumberingModalOpen}
          state={state}
          onClose={() => setIsNumberingModalOpen(false)}
          onSaveConfig={async (nextConfig) => {
            await onPersistState({
              ...state,
              settings: {
                ...state.settings,
                documentNumbering: nextConfig,
              },
            });
            onNotify?.('Format penomoran surat madrasah berhasil diperbarui.', 'success');
          }}
        />
      )}
    </section>
  );
}
