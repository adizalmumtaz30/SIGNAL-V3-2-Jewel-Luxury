import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Award,
  Briefcase,
  Calendar,
  CheckCircle2,
  Copy,
  FilePenLine,
  FileText,
  Info,
  Lock,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import type { AppState } from '../../domain/types';
import { getOfficialScheduleBasisStatus } from '../../domain/persuratan/assignments/teacherIntegration';
import { TEMPLATE_CATEGORIES, getCategoryLabel } from '../../domain/persuratan/templates/registry';
import {
  DEFAULT_TEMPLATE_FILTERS,
  DEFAULT_TEMPLATE_PREFERENCES,
  TEMPLATE_COLLECTION_TABS,
  cloneTemplateToMadrasah,
  collectAllTemplates,
  computeCategoryCounts,
  computeCollectionCounts,
  filterTemplates,
  recordRecentTemplateUsage,
  sanitizeTemplatePreferences,
  toggleFavoriteTemplate,
} from '../../domain/persuratan/templates/selectors';
import type {
  DocumentTemplate,
  TemplateCategory,
  TemplateCollection,
  TemplateFilterCriteria,
  TemplatePreferences,
  TemplatePreviewBlock,
} from '../../domain/persuratan/templates/types';
import { OfficialKopSuratPreview } from '../OfficialKopSuratPreview';
import './TemplateGallery.css';

export interface TemplateGalleryProps {
  state: AppState;
  onUpdateState?: (updater: (prev: AppState) => AppState) => void;
  onBackToCenter?: () => void;
  onUseTemplate?: (template: DocumentTemplate) => void;
  onOpenTemplateManager?: () => void;
  onNotify?: (message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

function getPopularCategoryIcon(category: TemplateCategory) {
  switch (category) {
    case 'KETERANGAN':
      return <Award size={15} aria-hidden="true" />;
    case 'PENUGASAN':
      return <Briefcase size={15} aria-hidden="true" />;
    case 'NOTULA_LAPORAN':
      return <Calendar size={15} aria-hidden="true" />;
    case 'BERITA_ACARA':
      return <CheckCircle2 size={15} aria-hidden="true" />;
    case 'KORESPONDENSI':
      return <FileText size={15} aria-hidden="true" />;
    case 'ADMINISTRASI':
    default:
      return <FilePenLine size={15} aria-hidden="true" />;
  }
}

function renderTextWithTokens(text: string) {
  const parts = text.split(/(\{\{[A-Z0-9_]+\}\})/g);
  return parts.map((part, idx) =>
    part.startsWith('{{') && part.endsWith('}}') ? (
      <span key={idx} className="s02-paper-token">
        {part}
      </span>
    ) : (
      <span key={idx}>{part}</span>
    )
  );
}

function renderPreviewBlock(block: TemplatePreviewBlock, idx: number) {
  if (block.type === 'heading') {
    return (
      <div
        key={idx}
        style={{
          fontWeight: 700,
          fontSize: '10px',
          textAlign: block.align ?? 'left',
          marginTop: '4px',
        }}
      >
        {renderTextWithTokens(block.text)}
      </div>
    );
  }
  if (block.type === 'paragraph') {
    return (
      <p key={idx} style={{ margin: 0 }}>
        {renderTextWithTokens(block.text)}
      </p>
    );
  }
  if (block.type === 'meta_grid') {
    return (
      <div key={idx} className="s02-paper-meta-grid">
        {block.rows.map((row, rIdx) => (
          <div key={rIdx} style={{ display: 'contents' }}>
            <span style={{ color: '#4c625c', fontWeight: 600 }}>{row.label}</span>
            <span>: {renderTextWithTokens(row.value)}</span>
          </div>
        ))}
      </div>
    );
  }
  if (block.type === 'list') {
    const ListTag = block.ordered ? 'ol' : 'ul';
    return (
      <ListTag key={idx} style={{ margin: '0 0 0 14px', padding: 0 }}>
        {block.items.map((item, iIdx) => (
          <li key={iIdx} style={{ marginBottom: '2px' }}>
            {renderTextWithTokens(item)}
          </li>
        ))}
      </ListTag>
    );
  }
  if (block.type === 'table') {
    return (
      <table key={idx} className="s02-paper-table">
        <thead>
          <tr>
            {block.columns.map((col, cIdx) => (
              <th key={cIdx}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.sampleRows.map((row, rIdx) => (
            <tr key={rIdx}>
              {row.map((cell, cIdx) => (
                <td key={cIdx}>{renderTextWithTokens(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return (
    <div key={idx} className="s02-paper-sig-row">
      {block.leftTitle && (
        <div className="s02-paper-sig-box">
          <div>{renderTextWithTokens(block.leftTitle)}</div>
          <div style={{ height: '24px' }} />
          <div style={{ fontWeight: 700 }}>{renderTextWithTokens(block.leftName ?? '')}</div>
        </div>
      )}
      <div className={`s02-paper-sig-box ${!block.leftTitle ? 'is-right' : ''}`}>
        <div>{renderTextWithTokens(block.rightTitle)}</div>
        <div style={{ height: '24px' }} />
        <div style={{ fontWeight: 700 }}>{renderTextWithTokens(block.rightName)}</div>
        {block.rightIdLabel && <div>{renderTextWithTokens(block.rightIdLabel)}</div>}
      </div>
    </div>
  );
}

export function TemplateGallery({
  state,
  onUpdateState,
  onBackToCenter,
  onUseTemplate,
  onOpenTemplateManager,
  onNotify,
}: TemplateGalleryProps) {
  const allTemplates = useMemo(
    () =>
      collectAllTemplates(state.customTemplates ?? []).filter(
        (tpl) => tpl.status !== 'ARCHIVED'
      ),
    [state.customTemplates]
  );

  const skBasis = useMemo(() => getOfficialScheduleBasisStatus(state), [state]);

  const popularTemplates = useMemo(() => {
    const quickIds: Array<{ id: string; shortLabel: string; hint: string }> = [
      {
        id: 'SYS-TPL-03',
        shortLabel: 'SK Tugas Mengajar',
        hint: skBasis.allowed ? 'Jadwal resmi siap' : 'Perlu jadwal resmi terbit',
      },
      { id: 'SYS-TPL-01', shortLabel: 'Surat Tugas Guru', hint: 'Bimtek / pelatihan / dinas' },
      { id: 'SYS-TPL-07', shortLabel: 'Undangan Rapat', hint: 'Dewan guru / komite' },
      { id: 'SYS-TPL-14', shortLabel: 'Surat Keterangan Siswa', hint: 'Aktif belajar / administrasi' },
      { id: 'SYS-TPL-30', shortLabel: 'Surat Kosong Berkop', hint: 'Naskah bebas berkop madrasah' },
    ];
    return quickIds
      .map((item) => {
        const tpl = allTemplates.find((t) => t.id === item.id);
        return tpl ? { ...item, tpl } : null;
      })
      .filter((x): x is { id: string; shortLabel: string; hint: string; tpl: DocumentTemplate } =>
        Boolean(x)
      );
  }, [allTemplates, skBasis.allowed]);

  const prefs: TemplatePreferences = useMemo(
    () => sanitizeTemplatePreferences(state.templatePreferences ?? DEFAULT_TEMPLATE_PREFERENCES, allTemplates),
    [state.templatePreferences, allTemplates]
  );

  const [filters, setFilters] = useState<TemplateFilterCriteria>(DEFAULT_TEMPLATE_FILTERS);
  const [activePreviewId, setActivePreviewId] = useState<string>(
    () => prefs.selectedTemplateId ?? allTemplates[0]?.id ?? 'SYS-TPL-01'
  );
  const [selectedNotice, setSelectedNotice] = useState<DocumentTemplate | null>(null);

  // Clone modal state
  const [cloneSource, setCloneSource] = useState<DocumentTemplate | null>(null);
  const [cloneName, setCloneName] = useState<string>('');
  const [cloneError, setCloneError] = useState<string | null>(null);
  const cloneTriggerRef = useRef<HTMLElement | null>(null);
  const cloneInputRef = useRef<HTMLInputElement | null>(null);

  const categoryCounts = useMemo(() => computeCategoryCounts(allTemplates), [allTemplates]);
  const collectionCounts = useMemo(
    () => computeCollectionCounts(allTemplates, prefs),
    [allTemplates, prefs]
  );

  const filteredTemplates = useMemo(
    () => filterTemplates(allTemplates, filters, prefs),
    [allTemplates, filters, prefs]
  );

  const previewTemplate = useMemo(() => {
    return (
      allTemplates.find((t) => t.id === activePreviewId) ??
      filteredTemplates[0] ??
      allTemplates[0] ??
      null
    );
  }, [allTemplates, activePreviewId, filteredTemplates]);

  const hasActiveFilters =
    filters.category !== 'ALL' ||
    filters.collection !== 'ALL' ||
    filters.searchQuery.trim() !== '';

  const resetFilters = () => {
    setFilters(DEFAULT_TEMPLATE_FILTERS);
  };

  const commitPreferences = (nextPrefs: TemplatePreferences) => {
    onUpdateState?.((prev) => ({
      ...prev,
      templatePreferences: nextPrefs,
    }));
  };

  const handleSelectPreview = (tpl: DocumentTemplate) => {
    setActivePreviewId(tpl.id);
    if (onUpdateState) {
      const nextPrefs = recordRecentTemplateUsage(prefs, tpl.id, allTemplates);
      commitPreferences(nextPrefs);
    }
  };

  const handleToggleFavorite = (tplId: string) => {
    const nextPrefs = toggleFavoriteTemplate(prefs, tplId, allTemplates);
    commitPreferences(nextPrefs);
    const added = nextPrefs.favoriteTemplateIds.includes(tplId);
    onNotify?.(
      added ? 'Template ditambahkan ke koleksi Favorit.' : 'Template dihapus dari Favorit.',
      'info'
    );
  };

  const handleUseTemplate = (tpl: DocumentTemplate) => {
    const withRecent = recordRecentTemplateUsage(prefs, tpl.id, allTemplates);
    const nextPrefs: TemplatePreferences = {
      ...withRecent,
      selectedTemplateId: tpl.id,
    };
    commitPreferences(nextPrefs);
    if (onUseTemplate) {
      onUseTemplate(tpl);
      return;
    }
    setSelectedNotice(tpl);
    onNotify?.(
      `Template "${tpl.name}" dipilih. Form Data Awal (S03) siap dibuka.`,
      'info'
    );
  };

  const openCloneModal = (tpl: DocumentTemplate, triggerEl: HTMLElement | null) => {
    cloneTriggerRef.current = triggerEl;
    setCloneSource(tpl);
    setCloneName(`${tpl.name} (Salinan Madrasah)`);
    setCloneError(null);
  };

  const closeCloneModal = () => {
    setCloneSource(null);
    setCloneError(null);
    setTimeout(() => cloneTriggerRef.current?.focus(), 0);
  };

  useEffect(() => {
    if (cloneSource) {
      setTimeout(() => cloneInputRef.current?.focus(), 0);
    }
  }, [cloneSource]);

  const handleConfirmClone = (event: FormEvent) => {
    event.preventDefault();
    if (!cloneSource) return;
    const trimmed = cloneName.trim();
    if (!trimmed) {
      setCloneError('Nama salinan template wajib diisi dan tidak boleh kosong.');
      return;
    }

    const cloned = cloneTemplateToMadrasah(
      cloneSource,
      trimmed,
      state.customTemplates ?? []
    );

    onUpdateState?.((prev) => {
      const nextCustom = [cloned, ...(prev.customTemplates ?? [])];
      const available = collectAllTemplates(nextCustom);
      const nextPrefs = recordRecentTemplateUsage(
        prev.templatePreferences ?? DEFAULT_TEMPLATE_PREFERENCES,
        cloned.id,
        available
      );
      return {
        ...prev,
        customTemplates: nextCustom,
        templatePreferences: nextPrefs,
      };
    });

    setActivePreviewId(cloned.id);
    setFilters((prev) => ({ ...prev, collection: 'MADRASAH', category: 'ALL', searchQuery: '' }));
    setCloneSource(null);
    setCloneError(null);
    onNotify?.(
      `Salinan "${cloned.name}" berhasil dibuat di Template Madrasah. Template bawaan SIGNAL tetap utuh.`,
      'success'
    );
  };

  const favSet = useMemo(() => new Set(prefs.favoriteTemplateIds), [prefs.favoriteTemplateIds]);

  const emptyCollectionMessages: Record<TemplateCollection, { title: string; desc: string }> = {
    ALL: {
      title: 'Tidak ada template yang cocok',
      desc: 'Coba ubah kata kunci pencarian atau pilih kategori lain.',
    },
    FAVORITES: {
      title: 'Belum ada template favorit',
      desc: 'Tandai template yang paling sering Anda gunakan dengan ikon bintang agar mudah ditemukan di sini.',
    },
    RECENT: {
      title: 'Belum ada riwayat pemakaian template',
      desc: 'Template yang Anda pratinjau atau pilih akan tercatat otomatis di sini (maksimal 10 terakhir).',
    },
    MADRASAH: {
      title: 'Belum ada Template Madrasah',
      desc: 'Template bawaan SIGNAL bersifat baca-saja. Klik "Kloning" pada template mana saja untuk membuat salinan khusus madrasah.',
    },
    SYSTEM: {
      title: 'Tidak ada template bawaan yang cocok',
      desc: 'Coba bersihkan filter pencarian untuk melihat 30 template bawaan SIGNAL.',
    },
  };

  return (
    <section className="s02-page" aria-label="Galeri Template Persuratan">
      {/* Header — Clean Quiet Authority */}
      <header className="s02-header">
        <div>
          <h1 className="s5-page-title">Galeri Template Persuratan</h1>
          <p className="s5-page-subtitle">
            Pilih dari {allTemplates.length} katalog naskah dinas siap pakai.
          </p>
        </div>
        {(onOpenTemplateManager || onBackToCenter) && (
          <div className="s02-header-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {onOpenTemplateManager && (
              <button type="button" className="s02-btn-secondary" onClick={onOpenTemplateManager}>
                <SlidersHorizontal size={15} aria-hidden="true" />
                <span>Kelola Template</span>
              </button>
            )}
            {onBackToCenter && (
              <button type="button" className="s02-back-btn" onClick={onBackToCenter}>
                <ArrowLeft size={15} aria-hidden="true" />
                <span>Arsip &amp; Surat</span>
              </button>
            )}
          </div>
        )}
      </header>

      {/* Honest Selected Template Handoff Notice (No Fake Draft Created) */}
      {selectedNotice && (
        <div className="s02-handoff-banner" role="status">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <CheckCircle2 size={18} style={{ color: '#124037', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>
                Template terpilih untuk persiapan dokumen: {selectedNotice.name} ({selectedNotice.code})
              </strong>
              <p style={{ margin: '2px 0 0', fontSize: '12.25px', color: '#33524a' }}>
                Preferensi template telah disimpan. Lanjutkan pengisian data surat untuk mulai menyusun naskah resmi madrasah.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="s02-icon-btn"
            onClick={() => setSelectedNotice(null)}
            aria-label="Tutup informasi pemilihan template"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Gelombang 1: 5 Template Paling Sering Dibutuhkan Madrasah (1-Klik Langsung Mulai) */}
      {popularTemplates.length > 0 && !hasActiveFilters && (
        <section className="s02-popular-strip" aria-label="Template paling sering dibutuhkan madrasah">
          <div className="s02-popular-head">
            <div>
              <h2 className="s02-popular-title">Paling Sering Dibutuhkan Madrasah</h2>
              <span className="s02-popular-sub">
                Klik langsung untuk mulai membuat surat dalam satu langkah
              </span>
            </div>
          </div>
          <div className="s02-popular-grid">
            {popularTemplates.map(({ id, shortLabel, hint, tpl }) => (
              <button
                key={id}
                type="button"
                className="s02-popular-card"
                onClick={() => handleUseTemplate(tpl)}
              >
                <div className="s02-popular-card-top">
                  <span className="s02-popular-icon" aria-hidden="true">
                    {getPopularCategoryIcon(tpl.category)}
                  </span>
                  <ArrowRight size={14} className="s02-popular-arrow" aria-hidden="true" />
                </div>
                <div className="s02-popular-body">
                  <span className="s02-popular-name">{shortLabel}</span>
                  <span className="s02-popular-hint">{hint}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Search & Collection Tabs */}
      <div className="s02-controls-card">
        <div className="s02-search-row">
          <div className="s02-search-wrap">
            <Search size={15} className="s02-search-icon" aria-hidden="true" />
            <input
              type="search"
              className="s02-search-input"
              placeholder="Cari nama template, tujuan dokumen, kode, atau data yang dibutuhkan..."
              aria-label="Cari template surat"
              value={filters.searchQuery}
              onChange={(e) => setFilters((prev) => ({ ...prev, searchQuery: e.target.value }))}
            />
            {filters.searchQuery && (
              <button
                type="button"
                className="s02-clear-search"
                aria-label="Kosongkan pencarian template"
                onClick={() => setFilters((prev) => ({ ...prev, searchQuery: '' }))}
              >
                <X size={13} />
              </button>
            )}
          </div>
          {hasActiveFilters && (
            <button type="button" className="s02-icon-btn" onClick={resetFilters}>
              <RotateCcw size={13} aria-hidden="true" />
              <span>Reset Filter</span>
            </button>
          )}
        </div>

        <div className="s02-collections-row">
          <div className="s02-collection-tabs" role="tablist" aria-label="Koleksi Template">
            {TEMPLATE_COLLECTION_TABS.map((tab) => {
              const active = filters.collection === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`s02-collection-tab ${active ? 'is-active' : ''}`}
                  onClick={() => setFilters((prev) => ({ ...prev, collection: tab.id }))}
                >
                  <span>{tab.label}</span>
                  <span className="s02-count-num">({collectionCounts[tab.id]})</span>
                </button>
              );
            })}
          </div>
          <span style={{ fontSize: '11.5px', color: '#5c726b' }}>
            Bawaan SIGNAL bersifat baca-saja · Salinan Madrasah independen
          </span>
        </div>
      </div>

      {/* Main 3-Column Desktop Grid (184px / 536px / 372px) */}
      <div className="s02-layout-grid">
        {/* LEFT COLUMN (184px): Kategori & Aksi Lanjutan */}
        <aside className="s02-sidebar-col" aria-label="Kategori Template">
          <div className="s02-cat-panel">
            <h2 className="s02-cat-heading">Kategori Pekerjaan</h2>
            <div className="s02-cat-list">
              <button
                type="button"
                className={`s02-cat-btn ${filters.category === 'ALL' ? 'is-active' : ''}`}
                aria-pressed={filters.category === 'ALL'}
                onClick={() => setFilters((prev) => ({ ...prev, category: 'ALL' }))}
              >
                <span>Semua Kategori</span>
                <span className="s02-count-num">{categoryCounts.ALL}</span>
              </button>
              {TEMPLATE_CATEGORIES.map((cat) => {
                const isSelected = filters.category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    className={`s02-cat-btn ${isSelected ? 'is-active' : ''}`}
                    aria-pressed={isSelected}
                    onClick={() =>
                      setFilters((prev) => ({ ...prev, category: cat.id as TemplateCategory }))
                    }
                  >
                    <span>{cat.label}</span>
                    <span className="s02-count-num">{categoryCounts[cat.id]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* MIDDLE COLUMN (536px): Template List */}
        <div className="s02-list-col" aria-label="Daftar Template">
          <div className="s02-list-meta">
            <span>
              Menampilkan <strong className="s5-tnum">{filteredTemplates.length}</strong> template
              {filters.category !== 'ALL' ? ` · Kategori ${getCategoryLabel(filters.category)}` : ''}
            </span>
            {prefs.selectedTemplateId && (
              <span style={{ color: '#124037', fontWeight: 600 }}>
                Terakhir dipilih: {allTemplates.find((t) => t.id === prefs.selectedTemplateId)?.code ?? prefs.selectedTemplateId}
              </span>
            )}
          </div>

          {filteredTemplates.length === 0 ? (
            <div className="s02-empty-box">
              <FileText size={26} style={{ color: '#6a8079' }} aria-hidden="true" />
              <h3>{emptyCollectionMessages[filters.collection].title}</h3>
              <p>{emptyCollectionMessages[filters.collection].desc}</p>
              {hasActiveFilters && (
                <button type="button" className="s02-icon-btn" onClick={resetFilters}>
                  <RotateCcw size={13} />
                  <span>Reset Filter</span>
                </button>
              )}
            </div>
          ) : (
            <div className="s02-card-list">
              {filteredTemplates.map((tpl) => {
                const isSelected = previewTemplate?.id === tpl.id;
                const isFavorite = favSet.has(tpl.id);
                const isMadrasah = tpl.source === 'MADRASAH' || tpl.source === 'USER';

                return (
                  <article
                    key={tpl.id}
                    className={`s02-template-card ${isSelected ? 'is-selected' : ''}`}
                    onDoubleClick={() => handleUseTemplate(tpl)}
                  >
                    <div className="s02-card-top">
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="s02-card-kicker">
                          <span className="s02-code-tag">{tpl.code}</span>
                          <span>{getCategoryLabel(tpl.category)}</span>
                          <span aria-hidden="true">·</span>
                          <span className="s5-tnum">v{tpl.version}</span>
                          <span aria-hidden="true">·</span>
                          <span className={`s02-source-label ${isMadrasah ? 'is-madrasah' : ''}`}>
                            {isMadrasah ? 'Salinan Madrasah' : 'Bawaan SIGNAL'}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="s02-card-title-btn"
                          onClick={() => handleSelectPreview(tpl)}
                        >
                          {tpl.name}
                        </button>
                      </div>

                      <button
                        type="button"
                        className={`s02-icon-btn ${isFavorite ? 'is-fav' : ''}`}
                        aria-pressed={isFavorite}
                        data-tooltip={isFavorite ? 'Hapus dari favorit' : 'Tandai favorit'}
                        aria-label={
                          isFavorite
                            ? `Hapus ${tpl.name} dari favorit`
                            : `Tandai ${tpl.name} sebagai favorit`
                        }
                        onClick={() => handleToggleFavorite(tpl.id)}
                      >
                        <Star size={14} fill={isFavorite ? '#C5A059' : 'none'} aria-hidden="true" />
                        <span>{isFavorite ? 'Favorit' : 'Tandai'}</span>
                      </button>
                    </div>

                    <p className="s02-card-desc is-clamped">{tpl.description}</p>

                    <div className="s02-card-actions">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="s02-card-use-btn"
                          onClick={() => handleUseTemplate(tpl)}
                        >
                          <span>Pakai</span>
                          <ArrowRight size={13} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className={`s02-icon-btn ${isSelected ? 'is-previewing' : ''}`}
                          onClick={() => handleSelectPreview(tpl)}
                        >
                          <span>{isSelected ? 'Dipratinjau' : 'Pratinjau'}</span>
                        </button>
                        <button
                          type="button"
                          className="s02-icon-btn"
                          data-tooltip={isMadrasah ? 'Duplikasi template madrasah' : 'Salin ke koleksi madrasah'}
                          onClick={(e) => openCloneModal(tpl, e.currentTarget)}
                        >
                          <Copy size={13} aria-hidden="true" />
                          <span>{isMadrasah ? 'Duplikasi' : 'Kloning'}</span>
                        </button>
                      </div>
                      <span className="s02-paper-spec-tag s5-tnum">
                        {tpl.initialPageSettings.paperSize.toUpperCase()} ·{' '}
                        {tpl.initialPageSettings.orientation === 'portrait' ? 'Portrait' : 'Landscape'}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN (392px): Live Authentic Document Preview Panel */}
        <aside className="s02-preview-col" aria-label="Panel Pratinjau Template">
          {previewTemplate ? (
            <>
              <div className="s02-preview-header">
                <div className="s02-preview-meta-strip">
                  <span className="s02-code-tag">{previewTemplate.code}</span>
                  <span>
                    {previewTemplate.source === 'SYSTEM' ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Lock size={11} aria-hidden="true" /> Baca-Saja Sistem · v{previewTemplate.version}
                      </span>
                    ) : (
                      `Salinan Madrasah · v${previewTemplate.version}`
                    )}
                  </span>
                </div>
                <h2 style={{ margin: '4px 0 0', fontSize: '15.5px', color: '#0B2923', lineHeight: 1.35 }}>
                  {previewTemplate.name}
                </h2>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#4B635D', lineHeight: 1.45 }}>
                  {previewTemplate.purpose}
                </p>
                {previewTemplate.sourceTemplateId && (
                  <div style={{ fontSize: '11px', color: '#145343', marginTop: '4px', fontWeight: 600 }}>
                    Disalin dari {previewTemplate.sourceTemplateId} (v{previewTemplate.sourceTemplateVersion ?? '1.0.0'})
                  </div>
                )}
              </div>

              {/* Primary CTA elevated above the fold */}
              <div className="s02-preview-cta-row">
                <button
                  type="button"
                  className="s02-btn-primary"
                  style={{ flex: 1 }}
                  onClick={() => handleUseTemplate(previewTemplate)}
                >
                  <Sparkles size={15} aria-hidden="true" />
                  <span>Gunakan Template</span>
                </button>
                <button
                  type="button"
                  className="s02-btn-secondary"
                  title={
                    previewTemplate.source === 'SYSTEM'
                      ? 'Kloning ke Template Madrasah'
                      : 'Buat Salinan Lanjutan'
                  }
                  onClick={(e) => openCloneModal(previewTemplate, e.currentTarget)}
                >
                  <Copy size={14} aria-hidden="true" />
                  <span>{previewTemplate.source === 'SYSTEM' ? 'Kloning' : 'Salin'}</span>
                </button>
              </div>

              {/* Compact Paper Layout Preview */}
              <div className="s02-paper-stage p5-paper-stage-bg is-scrollable">
                <div className="s02-paper-sheet" aria-label="Simulasi tata letak halaman dokumen">
                  {previewTemplate.documentHeader.includeKopSurat && (
                    <div className="s02-paper-kop">
                      <OfficialKopSuratPreview settings={state.settings} variant="mini" />
                    </div>
                  )}
                  <div className="s02-paper-doc-title">
                    {renderTextWithTokens(previewTemplate.documentHeader.title)}
                  </div>
                  <div className="s02-paper-doc-num">
                    {renderTextWithTokens(previewTemplate.documentHeader.numberPlaceholder)}
                  </div>
                  {previewTemplate.previewBlocks.map((block, idx) => renderPreviewBlock(block, idx))}
                </div>
              </div>

              {previewTemplate.legalNotice && (
                <details className="s02-specs-disclosure">
                  <summary style={{ color: '#7a5216', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Info size={13} aria-hidden="true" />
                    <span>Catatan Tata Naskah &amp; Kewenangan</span>
                  </summary>
                  <div className="s02-specs-disclosure-body">{previewTemplate.legalNotice}</div>
                </details>
              )}

              {/* Progressive Disclosure for Auto Sources & Required S03 Inputs */}
              <details className="s02-specs-disclosure">
                <summary className="s5-tnum">
                  Rincian Data &amp; Format Kertas (
                  {previewTemplate.initialPageSettings.paperSize === 'f4' ? 'F4' : 'A4'} ·{' '}
                  {previewTemplate.initialPageSettings.orientation === 'portrait'
                    ? 'Portrait'
                    : 'Landscape'}
                  )
                </summary>
                <div className="s02-specs-disclosure-body">
                  <div>
                    <strong style={{ color: '#0B2923' }}>Ukuran Kertas:</strong>{' '}
                    {previewTemplate.initialPageSettings.paperSize === 'f4'
                      ? 'F4 / Folio (215 × 330 mm)'
                      : 'A4 (210 × 297 mm)'}{' '}
                    · {previewTemplate.initialPageSettings.orientation}
                  </div>
                  <div>
                    <strong style={{ color: '#0B2923' }}>Sumber Data Otomatis:</strong>{' '}
                    {previewTemplate.autoDataSources.join('; ')}.
                  </div>
                  <div>
                    <strong style={{ color: '#0B2923' }}>Data yang Diisi Operator:</strong>{' '}
                    {previewTemplate.requiredInputs.join('; ')}.
                  </div>
                </div>
              </details>

              {previewTemplate.source !== 'SYSTEM' && onOpenTemplateManager && (
                <button
                  type="button"
                  className="s02-btn-secondary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={onOpenTemplateManager}
                >
                  <SlidersHorizontal size={13} aria-hidden="true" />
                  <span>Sunting Struktur Template</span>
                </button>
              )}
            </>
          ) : (
            <div className="s02-empty-box">
              <FileText size={24} style={{ color: '#6a8079' }} />
              <h3>Pilih Template</h3>
              <p>Klik salah satu template pada daftar di sebelah kiri untuk melihat struktur halaman dokumennya.</p>
            </div>
          )}
        </aside>
      </div>

      {/* Accessible Modal: Clone Template to Madrasah Copy */}
      {cloneSource && (
        <div
          className="s01-modal-scrim"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeCloneModal();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              closeCloneModal();
            }
          }}
        >
          <div
            className="s01-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="s02-clone-modal-title"
          >
            <div className="s01-modal-head">
              <div className="s01-modal-title-wrap">
                <div className="s01-modal-icon" aria-hidden="true">
                  <Copy size={20} />
                </div>
                <div>
                  <h2 id="s02-clone-modal-title">Kloning Template ke Koleksi Madrasah</h2>
                  <p>Template bawaan SIGNAL tetap baca-saja; salinan baru berdiri independen.</p>
                </div>
              </div>
              <button
                type="button"
                className="s01-modal-close"
                onClick={closeCloneModal}
                aria-label="Tutup dialog kloning template"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleConfirmClone}>
              <div className="s01-modal-body">
                <div className="s01-notice-box" style={{ marginBottom: '12px' }}>
                  <strong>Sumber Template:</strong> {cloneSource.name} ({cloneSource.code} · v{cloneSource.version})
                </div>

                <label
                  htmlFor="s02-clone-name-input"
                  style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#0B2923', marginBottom: '6px' }}
                >
                  Nama Salinan Template Madrasah
                </label>
                <input
                  ref={cloneInputRef}
                  id="s02-clone-name-input"
                  type="text"
                  className="s02-search-input"
                  style={{ paddingLeft: '12px' }}
                  value={cloneName}
                  onChange={(e) => {
                    setCloneName(e.target.value);
                    if (cloneError) setCloneError(null);
                  }}
                  placeholder="Misal: SK Pembagian Tugas MTs (Format Internal)"
                />
                {cloneError && (
                  <p role="alert" style={{ margin: '6px 0 0', fontSize: '12px', color: '#8F2D24', fontWeight: 600 }}>
                    {cloneError}
                  </p>
                )}
              </div>

              <div className="s01-modal-foot" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="s02-btn-secondary" onClick={closeCloneModal}>
                  Batal
                </button>
                <button type="submit" className="s02-btn-primary" style={{ height: '36px' }}>
                  <Copy size={14} aria-hidden="true" />
                  <span>Simpan Salinan Madrasah</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
