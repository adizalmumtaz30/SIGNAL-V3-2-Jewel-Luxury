import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Edit3,
  FilePlus2,
  Lock,
  Plus,
  Power,
  ShieldCheck,
  Sparkles,
  Trash2,
  AlertTriangle,
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

function blocksToPlainEditorText(blocks: TemplatePreviewBlock[]): string {
  return blocks
    .map((b) => {
      if (b.type === 'heading' || b.type === 'paragraph') return b.text;
      if (b.type === 'list') return b.items.map((item) => `- ${item}`).join('\n');
      if (b.type === 'meta_grid') return b.rows.map((r) => `${r.label}: ${r.value}`).join('\n');
      if (b.type === 'table') return b.columns.join(' | ');
      return `${b.rightTitle} / ${b.rightName}`;
    })
    .join('\n\n');
}

function plainEditorTextToBlocks(text: string): TemplatePreviewBlock[] {
  const chunks = text
    .split(/\n{2,}/)
    .map((c) => c.trim())
    .filter(Boolean);
  if (chunks.length === 0) return [];
  return chunks.map((chunk) => {
    const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1 && lines.every((l) => l.startsWith('- '))) {
      return {
        type: 'list' as const,
        ordered: false,
        items: lines.map((l) => l.slice(2).trim()),
      };
    }
    return {
      type: 'paragraph' as const,
      text: lines.join(' '),
    };
  });
}

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
  const [formBodyText, setFormBodyText] = useState('');
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
      previewBlocks: plainEditorTextToBlocks(formBodyText),
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
    formBodyText,
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
    setFormBodyText(
      'Assalamu\'alaikum Wr. Wb.\n\nDisampaikan kepada {{PIHAK_TUJUAN}} perihal {{PERIHAL}} pada tanggal {{TANGGAL_SURAT}}.\n\nKepala Madrasah\n{{NAMA_KEPALA_MADRASAH}}'
    );
    setFormFields([
      { key: 'perihal', label: 'Perihal / Pokok Surat', kind: 'OPERATOR_INPUT', required: true },
      { key: 'pihak_tujuan', label: 'Pihak Tujuan', kind: 'OPERATOR_INPUT', required: false },
    ]);
    setEditorMode('create');
  };

  const openEditForm = (tpl: DocumentTemplate) => {
    if (tpl.source === 'SYSTEM' || tpl.isReadOnly) {
      onNotify?.(
        'Template bawaan SIGNAL bersifat baca-saja. Klik "Kloning ke Madrasah" untuk membuat salinan yang dapat diedit.',
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
    setFormBodyText(blocksToPlainEditorText(tpl.previewBlocks));
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
      const blocks = plainEditorTextToBlocks(formBodyText);
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
          : `Template "${tpl.name}" dinonaktifkan dari Galeri S02 (dokumen lama tetap utuh).`,
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
        `Template madrasah "${res.deletedName}" dihapus. Dokumen yang pernah dibuat tetap aman karena memakai snapshot mandiri.`,
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

  return (
    <section className="s07-shell" aria-label="S07 Template Manager Madrasah">
      <header className="s07-header">
        <div>
          <div className="s5-page-kicker">S07 · PENGELOLA TEMPLATE NASKAH DINAS</div>
          <h1 className="s5-page-title">Template Manager Madrasah</h1>
          <p className="s5-page-subtitle">
            Kelola {systemCount} template bawaan SIGNAL (baca-saja) dan {madrasahCount} template khusus madrasah. Perubahan template tidak memengaruhi dokumen lama.
          </p>
        </div>
        <div className="s07-header-actions">
          <button type="button" className="s02-btn-secondary" onClick={onBackToGallery}>
            <ArrowLeft size={14} aria-hidden="true" />
            <span>Kembali ke Galeri S02</span>
          </button>
          {(state.documents?.length ?? 0) > 0 && (
            <button
              type="button"
              className="s02-btn-secondary"
              onClick={() => {
                setSourceDocId(sourceDocId || state.documents?.[0]?.id || '');
                setFromDocName('');
                setEditorMode('from-doc');
              }}
            >
              <ShieldCheck size={14} aria-hidden="true" />
              <span>Ekstrak dari Dokumen (Sanitasi PII)</span>
            </button>
          )}
          <button type="button" className="s02-btn-primary" onClick={openCreateForm}>
            <FilePlus2 size={15} aria-hidden="true" />
            <span>Buat Template Baru</span>
          </button>
        </div>
      </header>

      <div className="s07-workbench">
        {/* Left List */}
        <div className="s07-panel">
          <div className="s07-filter-bar">
            <input
              type="search"
              className="s07-input"
              style={{ flex: '1 1 220px' }}
              placeholder="Cari kode, nama, atau kategori template…"
              aria-label="Cari template di Template Manager"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
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
                <p>Buat template khusus madrasah baru atau kloning salah satu dari 30 template bawaan SIGNAL.</p>
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
                        className="s02-icon-btn"
                        disabled={isSaving}
                        onClick={() => void handleCloneTemplate(tpl)}
                      >
                        <Copy size={13} aria-hidden="true" />
                        <span>Kloning</span>
                      </button>
                      {!isSystem && (
                        <>
                          <button
                            type="button"
                            className="s02-icon-btn"
                            onClick={() => openEditForm(tpl)}
                          >
                            <Edit3 size={13} aria-hidden="true" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            className="s02-icon-btn"
                            disabled={isSaving}
                            onClick={() => void handleToggleStatus(tpl)}
                          >
                            <Power size={13} aria-hidden="true" />
                            <span>{tpl.status === 'ACTIVE' ? 'Nonaktifkan' : 'Aktifkan'}</span>
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

        {/* Right Inspector / Editor / Extract Panel */}
        <aside className="s07-panel" aria-label="Editor dan Pratinjau Template S07">
          {editorMode === 'from-doc' && (
            <form onSubmit={(e) => void handleCreateFromDocument(e)} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h2 style={{ margin: 0, fontSize: '15px', color: '#0b2923', display: 'flex', alignItems: 'center', gap: '7px' }}>
                <ShieldCheck size={16} />
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
            <form onSubmit={(e) => void handleSaveTemplateForm(e)} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h2 style={{ margin: 0, fontSize: '15px', color: '#0b2923' }}>
                {editorMode === 'create' ? 'Buat Template Madrasah Baru' : `Sunting Template: ${selectedTemplate?.code}`}
              </h2>

              <div className="s07-form-grid">
                <div className="s07-field is-full">
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
                  <label htmlFor="s07-body">Struktur Isi &amp; Placeholder (pisahkan paragraf dengan baris kosong) *</label>
                  <textarea
                    id="s07-body"
                    className="s07-textarea"
                    value={formBodyText}
                    onChange={(e) => setFormBodyText(e.target.value)}
                  />
                </div>
              </div>

              {/* Field Required/Optional Builder */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '12px', color: '#0b2923' }}>
                    Field Wajib &amp; Opsional ({formFields.length})
                  </strong>
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
                      className="s02-icon-btn"
                      aria-label={`Hapus field ${f.label}`}
                      onClick={() => setFormFields((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>

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
                      <Lock size={12} /> Bawaan SIGNAL (Aman/Baca-Saja)
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
                    <Sparkles size={14} />
                    <span>Gunakan di S03</span>
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
                    <div style={{ fontSize: '11.5px', fontFamily: 'var(--font-mono)' }}>
                      {check.detectedPlaceholders.slice(0, 8).join(', ') || 'Tanpa placeholder eksplisit'}
                    </div>
                  </div>
                );
              })()}

              {/* Compact Paper Preview */}
              <div className="s02-paper-stage is-scrollable">
                <div className="s02-paper-sheet">
                  {selectedTemplate.documentHeader.includeKopSurat && (
                    <div className="s02-paper-kop">
                      <strong>{state.settings.schoolName || '{{NAMA_MADRASAH}}'}</strong>
                    </div>
                  )}
                  <div className="s02-paper-doc-title">{selectedTemplate.documentHeader.title}</div>
                  <div className="s02-paper-doc-num">{selectedTemplate.documentHeader.numberPlaceholder}</div>
                  {selectedTemplate.previewBlocks.slice(0, 6).map((blk, i) => (
                    <p key={i} style={{ margin: 0 }}>
                      {blk.type === 'heading' || blk.type === 'paragraph'
                        ? blk.text
                        : blk.type === 'list'
                        ? blk.items.join(' · ')
                        : blk.type === 'meta_grid'
                        ? blk.rows.map((r) => `${r.label}: ${r.value}`).join(' | ')
                        : blk.type === 'table'
                        ? `[Tabel: ${blk.columns.join(', ')}]`
                        : `[Tanda Tangan: ${blk.rightTitle}]`}
                    </p>
                  ))}
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
