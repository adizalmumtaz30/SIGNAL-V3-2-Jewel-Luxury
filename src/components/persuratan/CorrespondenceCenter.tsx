import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowUpDown,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FileEdit,
  FilePlus2,
  FileText,
  Filter,
  Inbox,
  Info,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  SlidersHorizontal,
  X,
  XCircle,
} from 'lucide-react';
import type { AppState } from '../../domain/types';
import type {
  CorrespondenceFilterState,
  CorrespondenceSortKey,
  CorrespondenceTab,
  DocumentDirection,
  DocumentRecord,
  DocumentStatus,
  SortDirection,
} from '../../domain/persuratan/types';
import {
  DEFAULT_CORRESPONDENCE_FILTERS,
  DOCUMENT_KIND_LABELS,
  DOCUMENT_STATUS_LABELS,
  collectAvailableYears,
  computeCorrespondenceStats,
  filterCorrespondenceDocuments,
  formatIndonesianDate,
  getRelatedTeacherNames,
  paginateCorrespondenceDocuments,
  sortCorrespondenceDocuments,
} from '../../domain/persuratan/selectors';
import './CorrespondenceCenter.css';

export interface CorrespondenceCenterProps {
  state: AppState;
  isLoading?: boolean;
  loadError?: string | null;
  storageError?: string | null;
  onRetryLoad?: () => void;
  onRetryStorage?: () => void;
  onOpenTemplateGallery?: () => void;
  onEditIntakeDraft?: (draftId: string) => void;
  controlledFilters?: CorrespondenceFilterState;
  onControlledFiltersChange?: (next: CorrespondenceFilterState) => void;
  controlledSortKey?: CorrespondenceSortKey;
  onControlledSortKeyChange?: (next: CorrespondenceSortKey) => void;
  controlledSortDir?: SortDirection;
  onControlledSortDirChange?: (next: SortDirection) => void;
  controlledPage?: number;
  onControlledPageChange?: (next: number) => void;
  controlledPageSize?: number;
  onControlledPageSizeChange?: (next: number) => void;
}

const TABS: Array<{ id: CorrespondenceTab; label: string }> = [
  { id: 'ALL', label: 'Semua' },
  { id: 'INCOMING', label: 'Surat Masuk' },
  { id: 'OUTGOING', label: 'Surat Keluar' },
  { id: 'ARCHIVED', label: 'Arsip' },
];

const SORT_LABELS: Record<CorrespondenceSortKey, string> = {
  documentNumber: 'Nomor / ID',
  title: 'Nama Dokumen',
  documentType: 'Jenis',
  documentDate: 'Tanggal',
  status: 'Status',
};

function renderStatusIcon(status: DocumentStatus) {
  switch (status) {
    case 'DRAFT':
      return <FileEdit size={14} aria-hidden="true" />;
    case 'RECEIVED':
      return <Inbox size={14} aria-hidden="true" />;
    case 'IN_REVIEW':
      return <Clock size={14} aria-hidden="true" />;
    case 'FINAL':
      return <CheckCircle2 size={14} aria-hidden="true" />;
    case 'ARCHIVED':
      return <Archive size={14} aria-hidden="true" />;
    case 'CANCELLED':
      return <XCircle size={14} aria-hidden="true" />;
  }
}

export function CorrespondenceCenter({
  state,
  isLoading = false,
  loadError = null,
  storageError = null,
  onRetryLoad,
  onRetryStorage,
  onOpenTemplateGallery,
  onEditIntakeDraft,
  controlledFilters,
  onControlledFiltersChange,
  controlledSortKey,
  onControlledSortKeyChange,
  controlledSortDir,
  onControlledSortDirChange,
  controlledPage,
  onControlledPageChange,
  controlledPageSize,
  onControlledPageSizeChange,
}: CorrespondenceCenterProps) {
  const documents = useMemo(() => state.documents ?? [], [state.documents]);
  const intakeDraftMap = useMemo(
    () => new Map((state.intakeDrafts ?? []).map((d) => [d.id, d])),
    [state.intakeDrafts]
  );

  const [internalFilters, setInternalFilters] = useState<CorrespondenceFilterState>(DEFAULT_CORRESPONDENCE_FILTERS);
  const [internalSortKey, setInternalSortKey] = useState<CorrespondenceSortKey>('documentDate');
  const [internalSortDir, setInternalSortDir] = useState<SortDirection>('desc');
  const [internalPage, setInternalPage] = useState<number>(1);
  const [internalPageSize, setInternalPageSize] = useState<number>(10);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);

  const filters = controlledFilters ?? internalFilters;
  const setFilters = (updater: CorrespondenceFilterState | ((prev: CorrespondenceFilterState) => CorrespondenceFilterState)) => {
    const next = typeof updater === 'function' ? updater(filters) : updater;
    if (onControlledFiltersChange) onControlledFiltersChange(next);
    else setInternalFilters(next);
  };

  const sortKey = controlledSortKey ?? internalSortKey;
  const setSortKey = (next: CorrespondenceSortKey) => {
    if (onControlledSortKeyChange) onControlledSortKeyChange(next);
    else setInternalSortKey(next);
  };

  const sortDir = controlledSortDir ?? internalSortDir;
  const setSortDir = (updater: SortDirection | ((prev: SortDirection) => SortDirection)) => {
    const next = typeof updater === 'function' ? updater(sortDir) : updater;
    if (onControlledSortDirChange) onControlledSortDirChange(next);
    else setInternalSortDir(next);
  };

  const page = controlledPage ?? internalPage;
  const setPage = (updater: number | ((prev: number) => number)) => {
    const next = typeof updater === 'function' ? updater(page) : updater;
    if (onControlledPageChange) onControlledPageChange(next);
    else setInternalPage(next);
  };

  const pageSize = controlledPageSize ?? internalPageSize;
  const setPageSize = (next: number) => {
    if (onControlledPageSizeChange) onControlledPageSizeChange(next);
    else setInternalPageSize(next);
  };

  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [inspectedDoc, setInspectedDoc] = useState<DocumentRecord | null>(null);

  const createBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastDetailBtnRef = useRef<HTMLElement | null>(null);
  const createModalCloseRef = useRef<HTMLButtonElement | null>(null);
  const detailModalCloseRef = useRef<HTMLButtonElement | null>(null);

  const stats = useMemo(() => computeCorrespondenceStats(documents), [documents]);
  const availableYears = useMemo(() => collectAvailableYears(documents), [documents]);

  const filteredDocuments = useMemo(
    () => filterCorrespondenceDocuments(documents, filters, state.teachers),
    [documents, filters, state.teachers]
  );

  const sortedDocuments = useMemo(
    () => sortCorrespondenceDocuments(filteredDocuments, sortKey, sortDir),
    [filteredDocuments, sortKey, sortDir]
  );

  const pagination = useMemo(
    () => paginateCorrespondenceDocuments(sortedDocuments, page, pageSize),
    [sortedDocuments, page, pageSize]
  );

  const hasActiveFilters = useMemo(() => {
    return (
      filters.tab !== 'ALL' ||
      filters.searchQuery.trim() !== '' ||
      filters.directionFilter !== 'ALL' ||
      filters.statusFilter !== 'ALL' ||
      filters.yearFilter !== 'ALL' ||
      filters.dateFrom !== '' ||
      filters.dateTo !== '' ||
      filters.counterpartQuery.trim() !== ''
    );
  }, [filters]);

  const advancedFilterCount = useMemo(() => {
    let count = 0;
    if (filters.dateFrom) count += 1;
    if (filters.dateTo) count += 1;
    if (filters.counterpartQuery.trim()) count += 1;
    return count;
  }, [filters.dateFrom, filters.dateTo, filters.counterpartQuery]);

  const updateFilters = (patch: Partial<CorrespondenceFilterState>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  const resetFilters = () => {
    setFilters(DEFAULT_CORRESPONDENCE_FILTERS);
    setPage(1);
  };

  const handleTabChange = (tab: CorrespondenceTab) => {
    setFilters((prev) => ({
      ...prev,
      tab,
      directionFilter: tab === 'INCOMING' || tab === 'OUTGOING' ? tab : 'ALL',
      statusFilter: tab === 'ARCHIVED' ? 'ALL' : prev.statusFilter === 'ARCHIVED' ? 'ALL' : prev.statusFilter,
    }));
    setPage(1);
  };

  const handleStatCardClick = (card: 'INCOMING' | 'OUTGOING' | 'DRAFT' | 'ARCHIVED') => {
    if (card === 'INCOMING') {
      const isAlreadyActive = filters.tab === 'INCOMING' && filters.statusFilter === 'ALL';
      updateFilters({
        tab: isAlreadyActive ? 'ALL' : 'INCOMING',
        directionFilter: 'ALL',
        statusFilter: 'ALL',
      });
      return;
    }
    if (card === 'OUTGOING') {
      const isAlreadyActive = filters.tab === 'OUTGOING' && filters.statusFilter === 'ALL';
      updateFilters({
        tab: isAlreadyActive ? 'ALL' : 'OUTGOING',
        directionFilter: 'ALL',
        statusFilter: 'ALL',
      });
      return;
    }
    if (card === 'DRAFT') {
      const isAlreadyActive = filters.tab === 'ALL' && filters.statusFilter === 'DRAFT';
      updateFilters({
        tab: 'ALL',
        directionFilter: 'ALL',
        statusFilter: isAlreadyActive ? 'ALL' : 'DRAFT',
      });
      return;
    }
    const isAlreadyActive = filters.tab === 'ARCHIVED';
    updateFilters({
      tab: isAlreadyActive ? 'ALL' : 'ARCHIVED',
      directionFilter: 'ALL',
      statusFilter: 'ALL',
    });
  };

  const handleSort = (key: CorrespondenceSortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'documentDate' ? 'desc' : 'asc');
    }
    setPage(1);
  };

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    setTimeout(() => createBtnRef.current?.focus(), 0);
  };

  const openDetailModal = (doc: DocumentRecord, triggerEl: HTMLElement | null) => {
    lastDetailBtnRef.current = triggerEl;
    setInspectedDoc(doc);
  };

  const closeDetailModal = () => {
    setInspectedDoc(null);
    setTimeout(() => lastDetailBtnRef.current?.focus(), 0);
  };

  useEffect(() => {
    if (isCreateModalOpen) {
      createModalCloseRef.current?.focus();
    }
  }, [isCreateModalOpen]);

  useEffect(() => {
    if (inspectedDoc) {
      detailModalCloseRef.current?.focus();
    }
  }, [inspectedDoc]);

  const tabCounts: Record<CorrespondenceTab, number> = {
    ALL: stats.total,
    INCOMING: stats.incoming,
    OUTGOING: stats.outgoing,
    ARCHIVED: stats.archived,
  };

  const isIncomingCardActive = filters.tab === 'INCOMING' && filters.statusFilter === 'ALL';
  const isOutgoingCardActive = filters.tab === 'OUTGOING' && filters.statusFilter === 'ALL';
  const isDraftCardActive = filters.tab === 'ALL' && filters.statusFilter === 'DRAFT';
  const isArchivedCardActive =
    filters.tab === 'ARCHIVED' || (filters.tab === 'ALL' && filters.statusFilter === 'ARCHIVED');

  return (
    <section className="s01-page" aria-label="Pusat Persuratan & Arsip">
      {/* Page Header */}
      <header className="s5-page-header s01-header">
        <div>
          <div className="s5-page-kicker">PERSURATAN &amp; ARSIP DIGITAL</div>
          <h1 className="s5-page-title">Pusat Persuratan &amp; Arsip</h1>
          <p className="s5-page-subtitle">
            Pantau surat masuk, surat keluar, draft naskah dinas, dan arsip madrasah dari satu pusat kendali.
          </p>
        </div>
        <div className="s01-header-actions">
          <button
            ref={createBtnRef}
            type="button"
            className="s01-cta-btn"
            onClick={() => {
              if (onOpenTemplateGallery) {
                onOpenTemplateGallery();
              } else {
                setIsCreateModalOpen(true);
              }
            }}
          >
            <FilePlus2 size={16} aria-hidden="true" />
            <span>Buat Dokumen</span>
          </button>
        </div>
      </header>

      {/* Storage or Load Error Alerts */}
      {storageError && (
        <div className="s01-alert-banner" role="alert">
          <div className="s01-alert-main">
            <AlertTriangle size={18} aria-hidden="true" />
            <div>
              <strong>Penyimpanan lokal tidak tersedia</strong>
              <p>{storageError}</p>
            </div>
          </div>
          {onRetryStorage && (
            <button type="button" className="s01-btn-secondary" onClick={onRetryStorage}>
              <RefreshCw size={14} aria-hidden="true" />
              <span>Coba Simpan Ulang</span>
            </button>
          )}
        </div>
      )}

      {loadError && (
        <div className="s01-alert-banner is-warning" role="alert">
          <div className="s01-alert-main">
            <AlertTriangle size={18} aria-hidden="true" />
            <div>
              <strong>Gagal memuat daftar dokumen persuratan</strong>
              <p>{loadError}</p>
            </div>
          </div>
          {onRetryLoad && (
            <button type="button" className="s01-btn-secondary" onClick={onRetryLoad}>
              <RefreshCw size={14} aria-hidden="true" />
              <span>Muat Ulang Data</span>
            </button>
          )}
        </div>
      )}

      {/* 4 Clickable Real Statistics Cards */}
      <div className="s01-stats-grid" role="region" aria-label="Ringkasan statistik persuratan">
        <button
          type="button"
          className={`s01-stat-card ${isIncomingCardActive ? 'is-active' : ''}`}
          onClick={() => handleStatCardClick('INCOMING')}
          aria-pressed={isIncomingCardActive}
        >
          <div className="s01-stat-top">
            <span className="s01-stat-label">Surat Masuk</span>
            <span className="s01-stat-icon" aria-hidden="true">
              <Inbox size={17} />
            </span>
          </div>
          <div className="s01-stat-value-row">
            <strong className="s01-stat-value s5-tnum">{isLoading ? '—' : stats.incoming}</strong>
            <span className="s01-stat-unit">dokumen</span>
          </div>
          <div className="s01-stat-foot">
            <span>Korespondensi eksternal masuk</span>
            {isIncomingCardActive && <span className="s01-stat-active-tag">Aktif</span>}
          </div>
        </button>

        <button
          type="button"
          className={`s01-stat-card ${isOutgoingCardActive ? 'is-active' : ''}`}
          onClick={() => handleStatCardClick('OUTGOING')}
          aria-pressed={isOutgoingCardActive}
        >
          <div className="s01-stat-top">
            <span className="s01-stat-label">Surat Keluar</span>
            <span className="s01-stat-icon" aria-hidden="true">
              <Send size={17} />
            </span>
          </div>
          <div className="s01-stat-value-row">
            <strong className="s01-stat-value s5-tnum">{isLoading ? '—' : stats.outgoing}</strong>
            <span className="s01-stat-unit">dokumen</span>
          </div>
          <div className="s01-stat-foot">
            <span>Naskah dinas &amp; SK keluar</span>
            {isOutgoingCardActive && <span className="s01-stat-active-tag">Aktif</span>}
          </div>
        </button>

        <button
          type="button"
          className={`s01-stat-card tone-gold ${isDraftCardActive ? 'is-active' : ''}`}
          onClick={() => handleStatCardClick('DRAFT')}
          aria-pressed={isDraftCardActive}
        >
          <div className="s01-stat-top">
            <span className="s01-stat-label">Draft</span>
            <span className="s01-stat-icon" aria-hidden="true">
              <FileEdit size={17} />
            </span>
          </div>
          <div className="s01-stat-value-row">
            <strong className="s01-stat-value s5-tnum">{isLoading ? '—' : stats.draft}</strong>
            <span className="s01-stat-unit">dokumen</span>
          </div>
          <div className="s01-stat-foot">
            <span>Menunggu penyelesaian / nomor</span>
            {isDraftCardActive && <span className="s01-stat-active-tag">Aktif</span>}
          </div>
        </button>

        <button
          type="button"
          className={`s01-stat-card tone-slate ${isArchivedCardActive ? 'is-active' : ''}`}
          onClick={() => handleStatCardClick('ARCHIVED')}
          aria-pressed={isArchivedCardActive}
        >
          <div className="s01-stat-top">
            <span className="s01-stat-label">Arsip</span>
            <span className="s01-stat-icon" aria-hidden="true">
              <Archive size={17} />
            </span>
          </div>
          <div className="s01-stat-value-row">
            <strong className="s01-stat-value s5-tnum">{isLoading ? '—' : stats.archived}</strong>
            <span className="s01-stat-unit">dokumen</span>
          </div>
          <div className="s01-stat-foot">
            <span>Arsip tersimpan terindeks</span>
            {isArchivedCardActive && <span className="s01-stat-active-tag">Aktif</span>}
          </div>
        </button>
      </div>

      {/* Main Correspondence Workspace */}
      <div className="s01-workspace-card">
        {/* Category Tabs */}
        <div className="s01-tabs-bar">
          <div className="s01-tablist" role="tablist" aria-label="Kategori Persuratan & Arsip">
            {TABS.map((tab) => {
              const isSelected = filters.tab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  className={`s01-tab ${isSelected ? 'is-active' : ''}`}
                  onClick={() => handleTabChange(tab.id)}
                >
                  <span>{tab.label}</span>
                  <span className="s01-tab-count s5-tnum">({tabCounts[tab.id]})</span>
                </button>
              );
            })}
          </div>
          <div className="s01-summary-meta s5-tnum">
            {isLoading ? 'Memuat indeks dokumen…' : `${sortedDocuments.length} dokumen ditampilkan`}
          </div>
        </div>

        {/* Single-Line Search & Filter Bar */}
        <div className="s01-filter-section">
          <div className="s01-filter-row">
            <div className="s01-search-wrap">
              <Search size={15} className="s01-search-icon" aria-hidden="true" />
              <input
                type="search"
                className="s01-input"
                aria-label="Cari dokumen persuratan"
                placeholder="Cari nomor surat, judul, perihal, pihak terkait, nama guru, atau tag…"
                value={filters.searchQuery}
                onChange={(e) => updateFilters({ searchQuery: e.target.value })}
              />
              {filters.searchQuery && (
                <button
                  type="button"
                  className="s01-clear-search"
                  aria-label="Kosongkan pencarian"
                  onClick={() => updateFilters({ searchQuery: '' })}
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <select
              className="s01-select"
              aria-label="Filter arah dokumen"
              value={filters.directionFilter}
              onChange={(e) =>
                updateFilters({ directionFilter: e.target.value as 'ALL' | DocumentDirection })
              }
            >
              <option value="ALL">Semua Jenis Arah</option>
              <option value="INCOMING">Surat Masuk</option>
              <option value="OUTGOING">Surat Keluar</option>
            </select>

            <select
              className="s01-select"
              aria-label="Filter status dokumen"
              value={filters.statusFilter}
              onChange={(e) =>
                updateFilters({ statusFilter: e.target.value as 'ALL' | DocumentStatus })
              }
            >
              <option value="ALL">Semua Status</option>
              {(Object.keys(DOCUMENT_STATUS_LABELS) as DocumentStatus[]).map((statusKey) => (
                <option key={statusKey} value={statusKey}>
                  {DOCUMENT_STATUS_LABELS[statusKey]}
                </option>
              ))}
            </select>

            <select
              className="s01-select"
              aria-label="Filter tahun dokumen"
              value={filters.yearFilter}
              onChange={(e) => updateFilters({ yearFilter: e.target.value })}
            >
              <option value="ALL">Semua Tahun</option>
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  Tahun {year}
                </option>
              ))}
            </select>

            <button
              type="button"
              className={`s01-btn-secondary ${showAdvancedFilters || advancedFilterCount > 0 ? 'is-active' : ''}`}
              aria-expanded={showAdvancedFilters}
              onClick={() => setShowAdvancedFilters((prev) => !prev)}
            >
              <SlidersHorizontal size={14} aria-hidden="true" />
              <span>Filter Lanjutan{advancedFilterCount > 0 ? ` (${advancedFilterCount})` : ''}</span>
            </button>

            {hasActiveFilters && (
              <button type="button" className="s01-btn-ghost" onClick={resetFilters}>
                <RotateCcw size={14} aria-hidden="true" />
                <span>Reset Filter</span>
              </button>
            )}
          </div>

          {showAdvancedFilters && (
            <div className="s01-advanced-filters">
              <div className="s01-field">
                <label htmlFor="s01-date-from">Dari Tanggal</label>
                <input
                  id="s01-date-from"
                  type="date"
                  className="s01-input is-plain"
                  value={filters.dateFrom}
                  onChange={(e) => updateFilters({ dateFrom: e.target.value })}
                />
              </div>
              <div className="s01-field">
                <label htmlFor="s01-date-to">Sampai Tanggal</label>
                <input
                  id="s01-date-to"
                  type="date"
                  className="s01-input is-plain"
                  value={filters.dateTo}
                  onChange={(e) => updateFilters({ dateTo: e.target.value })}
                />
              </div>
              <div className="s01-field">
                <label htmlFor="s01-counterpart-filter">Pihak Terkait / Instansi</label>
                <input
                  id="s01-counterpart-filter"
                  type="text"
                  className="s01-input is-plain"
                  placeholder="Contoh: Kemenag Kabupaten, Komite…"
                  value={filters.counterpartQuery}
                  onChange={(e) => updateFilters({ counterpartQuery: e.target.value })}
                />
              </div>
            </div>
          )}
        </div>

        {/* Table / Loading / Empty Regions */}
        {isLoading ? (
          <div className="s01-skeleton-list" role="status" aria-label="Memuat daftar dokumen persuratan">
            {[1, 2, 3, 4, 5].map((idx) => (
              <div key={idx} className="s01-skeleton-row">
                <span className="s01-skeleton-bar" style={{ width: '78%' }} />
                <span className="s01-skeleton-bar" style={{ width: '92%' }} />
                <span className="s01-skeleton-bar" style={{ width: '70%' }} />
                <span className="s01-skeleton-bar" style={{ width: '68%' }} />
                <span className="s01-skeleton-bar" style={{ width: '74%' }} />
                <span className="s01-skeleton-bar" style={{ width: '60%' }} />
              </div>
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="s01-empty-box">
            <div className="s01-empty-icon" aria-hidden="true">
              <FileText size={24} />
            </div>
            <h3>Belum ada surat atau dokumen</h3>
            <p>
              Daftar persuratan dan arsip madrasah masih kosong. Aplikasi tidak menyisipkan surat contoh palsu agar
              data operasional Anda tetap bersih dan akurat.
            </p>
            <button
              type="button"
              className="s01-cta-btn"
              onClick={() => {
                if (onOpenTemplateGallery) {
                  onOpenTemplateGallery();
                } else {
                  setIsCreateModalOpen(true);
                }
              }}
            >
              <FilePlus2 size={16} aria-hidden="true" />
              <span>Buat Dokumen</span>
            </button>
          </div>
        ) : sortedDocuments.length === 0 ? (
          <div className="s01-empty-box">
            <div className="s01-empty-icon" aria-hidden="true">
              <Filter size={22} />
            </div>
            <h3>Tidak ada dokumen yang cocok dengan filter</h3>
            <p>
              Coba ubah kata kunci pencarian, tab kategori, rentang tanggal, atau status dokumen yang dipilih.
            </p>
            <button type="button" className="s01-btn-secondary" onClick={resetFilters}>
              <RotateCcw size={14} aria-hidden="true" />
              <span>Reset Filter</span>
            </button>
          </div>
        ) : (
          <div className="s01-table-scroll">
            <table className="s01-table">
              <thead>
                <tr>
                  {(
                    [
                      ['documentNumber', SORT_LABELS.documentNumber],
                      ['title', SORT_LABELS.title],
                      ['documentType', SORT_LABELS.documentType],
                      ['documentDate', SORT_LABELS.documentDate],
                    ] as Array<[CorrespondenceSortKey, string]>
                  ).map(([key, label]) => {
                    const isSorted = sortKey === key;
                    return (
                      <th
                        key={key}
                        scope="col"
                        aria-sort={isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      >
                        <button
                          type="button"
                          className={`s01-sort-btn ${isSorted ? 'is-sorted' : ''}`}
                          onClick={() => handleSort(key)}
                        >
                          <span>{label}</span>
                          <ArrowUpDown size={13} aria-hidden="true" />
                        </button>
                      </th>
                    );
                  })}
                  <th scope="col">Pihak Terkait</th>
                  <th
                    scope="col"
                    aria-sort={
                      sortKey === 'status' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
                    }
                  >
                    <button
                      type="button"
                      className={`s01-sort-btn ${sortKey === 'status' ? 'is-sorted' : ''}`}
                      onClick={() => handleSort('status')}
                    >
                      <span>{SORT_LABELS.status}</span>
                      <ArrowUpDown size={13} aria-hidden="true" />
                    </button>
                  </th>
                  <th scope="col">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {pagination.rows.map((doc) => {
                  const relatedTeachers = getRelatedTeacherNames(doc.relatedTeacherIds, state.teachers);
                  const counterpartParts = [doc.counterpartName, ...relatedTeachers].filter(Boolean);
                  const tagText = doc.tags && doc.tags.length > 0 ? doc.tags.join(' · ') : '';
                  const linkedIntake = doc.intakeDraftId ? intakeDraftMap.get(doc.intakeDraftId) : undefined;

                  return (
                    <tr key={doc.id}>
                      <td>
                        <div className={`s01-doc-number ${doc.documentNumber ? '' : 'is-unnumbered'}`}>
                          {doc.documentNumber ?? 'Belum Bernomor'}
                        </div>
                        <div className="s01-doc-id">{doc.id}</div>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="s01-title-btn"
                          onClick={(e) => openDetailModal(doc, e.currentTarget)}
                        >
                          {doc.title}
                        </button>
                        {doc.subject && <div className="s01-subject-line">{doc.subject}</div>}
                        {linkedIntake && (
                          <div className="s01-meta-inline" style={{ color: '#145343', fontWeight: 600 }}>
                            Data awal S03 tersimpan · Menunggu Document Studio (S04)
                          </div>
                        )}
                        {tagText && <div className="s01-meta-inline">{tagText}</div>}
                      </td>
                      <td>
                        <div className="s01-type-main">{DOCUMENT_KIND_LABELS[doc.documentType]}</div>
                        <div className="s01-type-sub">
                          {doc.direction === 'INCOMING' ? 'Surat Masuk' : 'Surat Keluar'}
                        </div>
                      </td>
                      <td className="s5-tnum" style={{ whiteSpace: 'nowrap' }}>
                        {formatIndonesianDate(doc.documentDate)}
                      </td>
                      <td>
                        {counterpartParts.length > 0 ? counterpartParts.join(' · ') : '—'}
                      </td>
                      <td>
                        <span className={`s01-status-label status-${doc.status}`}>
                          {renderStatusIcon(doc.status)}
                          <span>{DOCUMENT_STATUS_LABELS[doc.status]}</span>
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="s01-row-detail-btn"
                            onClick={(e) => openDetailModal(doc, e.currentTarget)}
                          >
                            <Eye size={13} aria-hidden="true" />
                            <span>Detail</span>
                          </button>
                          {linkedIntake && onEditIntakeDraft && (
                            <button
                              type="button"
                              className="s01-row-detail-btn"
                              onClick={() => onEditIntakeDraft(linkedIntake.id)}
                            >
                              <FileEdit size={13} aria-hidden="true" />
                              <span>Edit S03</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {!isLoading && sortedDocuments.length > 0 && (
          <div className="s01-pagination">
            <div className="s5-tnum">
              Menampilkan <strong>{pagination.startIndex}–{pagination.endIndex}</strong> dari{' '}
              <strong>{pagination.totalItems}</strong> dokumen
            </div>
            <div className="s01-pagination-controls">
              <label htmlFor="s01-page-size" style={{ fontSize: '12.5px' }}>
                Per halaman:
              </label>
              <select
                id="s01-page-size"
                className="s01-select"
                style={{ height: '32px' }}
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>

              <button
                type="button"
                className="s01-page-btn"
                disabled={pagination.currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft size={14} aria-hidden="true" />
                <span>Sebelumnya</span>
              </button>

              <span className="s5-tnum" style={{ fontSize: '12.5px', fontWeight: 600 }}>
                Hal {pagination.currentPage} / {pagination.totalPages}
              </span>

              <button
                type="button"
                className="s01-page-btn"
                disabled={pagination.currentPage >= pagination.totalPages}
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              >
                <span>Berikutnya</span>
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Buat Dokumen (Honest Phase 2 Boundary Notice) */}
      {isCreateModalOpen && (
        <div
          className="s01-modal-scrim"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeCreateModal();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              closeCreateModal();
            }
          }}
        >
          <div
            className="s01-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="s01-create-modal-title"
          >
            <div className="s01-modal-head">
              <div className="s01-modal-title-wrap">
                <div className="s01-modal-icon" aria-hidden="true">
                  <FilePlus2 size={20} />
                </div>
                <div>
                  <h2 id="s01-create-modal-title">Buat Dokumen Baru</h2>
                  <p>Alur pembuatan naskah dinas terhubung ke Galeri Template &amp; Document Studio.</p>
                </div>
              </div>
              <button
                ref={createModalCloseRef}
                type="button"
                className="s01-modal-close"
                onClick={closeCreateModal}
                aria-label="Tutup dialog buat dokumen"
              >
                <X size={16} />
              </button>
            </div>
            <div className="s01-modal-body">
              <div className="s01-notice-box">
                <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <Info size={15} aria-hidden="true" />
                  <span>Tahap 3 (Galeri Template S02) Belum Diaktifkan</span>
                </strong>
                <span>
                  Saat ini aplikasi berada pada <strong>Tahap 2 (Pusat Persuratan &amp; Arsip S01)</strong>. Pembuatan
                  dokumen dari Galeri Template (S02), pengisian Form Data Awal (S03), dan penyuntingan di Document
                  Studio (S04) akan diaktifkan pada <strong>Tahap 3–6</strong>.
                </span>
              </div>
              <p style={{ margin: 0 }}>
                Tidak ada dokumen atau draft contoh yang dibuat ke penyimpanan lokal saat dialog ini dibuka atau ditutup,
                sehingga daftar persuratan Anda tetap menampilkan data nyata secara akurat.
              </p>
            </div>
            <div className="s01-modal-foot">
              <button type="button" className="s01-cta-btn" onClick={closeCreateModal}>
                Mengerti &amp; Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Ringkasan Metadata Dokumen (Read-only Preview, Bukan S06 Penuh) */}
      {inspectedDoc && (
        <div
          className="s01-modal-scrim"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeDetailModal();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              closeDetailModal();
            }
          }}
        >
          <div
            className="s01-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="s01-detail-modal-title"
          >
            <div className="s01-modal-head">
              <div className="s01-modal-title-wrap">
                <div className="s01-modal-icon" aria-hidden="true">
                  <FileText size={20} />
                </div>
                <div>
                  <h2 id="s01-detail-modal-title">Ringkasan Metadata Dokumen</h2>
                  <p>Tampilan baca-saja untuk verifikasi metadata S01.</p>
                </div>
              </div>
              <button
                ref={detailModalCloseRef}
                type="button"
                className="s01-modal-close"
                onClick={closeDetailModal}
                aria-label="Tutup ringkasan dokumen"
              >
                <X size={16} />
              </button>
            </div>
            <div className="s01-modal-body">
              <dl className="s01-meta-grid">
                <div className="s01-meta-item">
                  <dt>ID Dokumen</dt>
                  <dd style={{ fontFamily: 'var(--font-mono)' }}>{inspectedDoc.id}</dd>
                </div>
                <div className="s01-meta-item">
                  <dt>Nomor Surat</dt>
                  <dd>{inspectedDoc.documentNumber ?? 'Belum Bernomor'}</dd>
                </div>
                <div className="s01-meta-item" style={{ gridColumn: '1 / -1' }}>
                  <dt>Nama Dokumen</dt>
                  <dd>{inspectedDoc.title}</dd>
                </div>
                <div className="s01-meta-item" style={{ gridColumn: '1 / -1' }}>
                  <dt>Perihal</dt>
                  <dd>{inspectedDoc.subject || '—'}</dd>
                </div>
                <div className="s01-meta-item">
                  <dt>Jenis Dokumen</dt>
                  <dd>{DOCUMENT_KIND_LABELS[inspectedDoc.documentType]}</dd>
                </div>
                <div className="s01-meta-item">
                  <dt>Arah Korespondensi</dt>
                  <dd>{inspectedDoc.direction === 'INCOMING' ? 'Surat Masuk' : 'Surat Keluar'}</dd>
                </div>
                <div className="s01-meta-item">
                  <dt>Tanggal Dokumen</dt>
                  <dd className="s5-tnum">{formatIndonesianDate(inspectedDoc.documentDate)}</dd>
                </div>
                <div className="s01-meta-item">
                  <dt>Status</dt>
                  <dd>{DOCUMENT_STATUS_LABELS[inspectedDoc.status]}</dd>
                </div>
                <div className="s01-meta-item" style={{ gridColumn: '1 / -1' }}>
                  <dt>Pihak Terkait / Pendidik</dt>
                  <dd>
                    {[
                      inspectedDoc.counterpartName,
                      ...getRelatedTeacherNames(inspectedDoc.relatedTeacherIds, state.teachers),
                    ]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </dd>
                </div>
                <div className="s01-meta-item" style={{ gridColumn: '1 / -1' }}>
                  <dt>Tag Klasifikasi</dt>
                  <dd>{inspectedDoc.tags && inspectedDoc.tags.length > 0 ? inspectedDoc.tags.join(', ') : '—'}</dd>
                </div>
              </dl>
              <div className="s01-notice-box">
                {inspectedDoc.intakeDraftId ? (
                  <>
                    Draft data awal S03 (<code>{inspectedDoc.intakeDraftId}</code>) sudah tersimpan lokal beserta snapshot data sumber. Layar editor penuh Document Studio (S04) dan Detail/Riwayat Versi penuh (S06) akan diaktifkan pada Tahap 6–10.
                  </>
                ) : (
                  <>Layar Detail Dokumen, Riwayat Versi, dan Lampiran Arsip penuh (S06) akan tersedia pada Tahap 10.</>
                )}
              </div>
            </div>
            <div className="s01-modal-foot" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              {inspectedDoc.intakeDraftId && intakeDraftMap.has(inspectedDoc.intakeDraftId) && onEditIntakeDraft && (
                <button
                  type="button"
                  className="s01-cta-btn"
                  onClick={() => {
                    const targetId = inspectedDoc.intakeDraftId!;
                    closeDetailModal();
                    onEditIntakeDraft(targetId);
                  }}
                >
                  <FileEdit size={14} aria-hidden="true" />
                  <span>Edit Data Awal (S03)</span>
                </button>
              )}
              <button type="button" className="s01-btn-secondary" onClick={closeDetailModal}>
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
