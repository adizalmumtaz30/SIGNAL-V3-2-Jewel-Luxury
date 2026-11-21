import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  Users,
  GraduationCap,
  Calendar,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldAlert,
  FileDown,
  LayoutGrid,
  Archive,
  FilePlus2,
  FileText,
  SlidersHorizontal,
  Award,
} from 'lucide-react';
import type { AppState, Teacher } from '../domain/types';
import type { PersuratanLaunchRequest } from '../domain/persuratan/types';
import { collectAllTemplates } from '../domain/persuratan/templates/selectors';
import { DOCUMENT_KIND_LABELS, DOCUMENT_STATUS_LABELS } from '../domain/persuratan/selectors';
import { getOfficialScheduleBasisStatus } from '../domain/persuratan/assignments/teacherIntegration';
import { MadrasahTeacherAvatar } from './MadrasahTeacherAvatar';

export interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  onNavigate: (view: 'schedule' | 'master' | 'workload' | 'attendance' | 'settings' | 'persuratan') => void;
  onLaunchPersuratan?: (request: PersuratanLaunchRequest) => void;
  onLaunchTeachingSk?: () => void;
  onSelectTeacher?: (teacher: Teacher) => void;
  onSelectClass?: (classId: string) => void;
  onOpenValidation?: () => void;
  onOpenTimeMachine?: () => void;
  onOpenExportPdf?: () => void;
}

export interface PaletteItem {
  id: string;
  category:
    | 'Aksi Cepat'
    | 'Persuratan & Arsip'
    | 'Template Surat'
    | 'Dewan Pendidik'
    | 'Rombongan Belajar'
    | 'Mata Pelajaran';
  title: string;
  subtitle?: string;
  searchTokens?: string;
  icon?: React.ReactNode;
  action: () => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  state,
  onNavigate,
  onLaunchPersuratan,
  onLaunchTeachingSk,
  onSelectTeacher,
  onSelectClass,
  onOpenValidation,
  onOpenTimeMachine,
  onOpenExportPdf,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current =
        typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
      setQuery('');
      setSelectedIndex(0);
      const timer = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(timer);
    }
    if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [isOpen]);

  const skBasis = useMemo(() => getOfficialScheduleBasisStatus(state), [state]);

  const activeTemplates = useMemo(
    () =>
      collectAllTemplates(state.customTemplates ?? []).filter(
        (tpl) => tpl.status !== 'ARCHIVED'
      ),
    [state.customTemplates]
  );

  // Build searchable items list across academic & Persuratan modules (zero NIP exposure)
  const allItems: PaletteItem[] = useMemo(() => {
    const launchOrNav = (req: PersuratanLaunchRequest) => {
      onClose();
      if (onLaunchPersuratan) {
        onLaunchPersuratan(req);
      } else {
        onNavigate('persuratan');
      }
    };

    const list: PaletteItem[] = [
      {
        id: 'persuratan-center',
        category: 'Aksi Cepat',
        title: 'Buka Pusat Persuratan & Arsip',
        subtitle: `${(state.documents ?? []).length} dokumen tercatat · Surat masuk, keluar, draft & arsip`,
        searchTokens: 'surat arsip persuratan dokumen s01',
        icon: <Archive size={16} color="#124037" aria-hidden="true" />,
        action: () => launchOrNav({ view: 'center', nonce: Date.now() }),
      },
      {
        id: 'persuratan-new',
        category: 'Aksi Cepat',
        title: 'Buat Surat Baru — Pilih Template',
        subtitle: `Pilih dari ${activeTemplates.length} template aktif terstruktur`,
        searchTokens: 'buat surat baru dokumen template galeri s02',
        icon: <FilePlus2 size={16} color="#124037" aria-hidden="true" />,
        action: () => launchOrNav({ view: 'templates', nonce: Date.now() }),
      },
      {
        id: 'persuratan-template-manager',
        category: 'Aksi Cepat',
        title: 'Kelola Template Madrasah',
        subtitle: `${(state.customTemplates ?? []).length} template khusus madrasah · sanitasi data pribadi otomatis`,
        searchTokens: 'kelola template manager madrasah s07 kloning',
        icon: <SlidersHorizontal size={16} color="#124037" aria-hidden="true" />,
        action: () => launchOrNav({ view: 'template-manager', nonce: Date.now() }),
      },
      {
        id: 'persuratan-sk-mengajar',
        category: 'Aksi Cepat',
        title: 'Buat SK Pembagian Tugas Mengajar',
        subtitle: skBasis.allowed
          ? `Siap diterbitkan dari jadwal resmi ${skBasis.selectedVersion?.version.label ?? skBasis.selectedVersion?.version.id ?? ''}`
          : 'Memerlukan jadwal resmi yang telah diterbitkan & terverifikasi',
        searchTokens: 'sk mengajar pembagian tugas jadwal resmi penugasan guru sys-tpl-03',
        icon: <Award size={16} color={skBasis.allowed ? '#124037' : '#8E7035'} aria-hidden="true" />,
        action: () => {
          onClose();
          if (onLaunchTeachingSk) {
            onLaunchTeachingSk();
          } else {
            launchOrNav({ view: 'templates', nonce: Date.now() });
          }
        },
      },
      {
        id: 'nav-schedule',
        category: 'Aksi Cepat',
        title: 'Buka Jadwal Pelajaran (Timetable Workspace)',
        subtitle: 'Tampilan kisi induk & jadwal per kelas',
        icon: <Calendar size={16} color="#124037" aria-hidden="true" />,
        action: () => {
          onNavigate('schedule');
          onClose();
        },
      },
      {
        id: 'nav-master',
        category: 'Aksi Cepat',
        title: 'Buka Data Master Madrasah',
        subtitle: 'Dewan Asatidz, Rombel, dan Mata Pelajaran',
        icon: <Users size={16} color="#124037" aria-hidden="true" />,
        action: () => {
          onNavigate('master');
          onClose();
        },
      },
      {
        id: 'nav-workload',
        category: 'Aksi Cepat',
        title: 'Matriks Beban Mengajar (Workload Dashboard)',
        subtitle: 'Distribusi JP dan persentase kuota dewan guru',
        icon: <LayoutGrid size={16} color="#124037" aria-hidden="true" />,
        action: () => {
          onNavigate('workload');
          onClose();
        },
      },
      {
        id: 'nav-attendance',
        category: 'Aksi Cepat',
        title: 'Presensi Guru & Agenda Harian',
        subtitle: 'Pencatatan kehadiran dan rekapitulasi bulanan',
        icon: <CheckCircle2 size={16} color="#124037" aria-hidden="true" />,
        action: () => {
          onNavigate('attendance');
          onClose();
        },
      },
      {
        id: 'act-validation',
        category: 'Aksi Cepat',
        title: 'Periksa Validasi & Bentrok KBM',
        subtitle: 'Radar kepatuhan alokasi jam dan bentrok guru',
        icon: <ShieldAlert size={16} color="#8F2D24" aria-hidden="true" />,
        action: () => {
          onClose();
          onOpenValidation?.();
        },
      },
      {
        id: 'act-time-machine',
        category: 'Aksi Cepat',
        title: 'Buka Time Machine Vault (Riwayat Pulih)',
        subtitle: 'Pulihkan data dari snapshot atau berkas cadangan .sakala / .signal',
        icon: <Clock size={16} color="#C5A059" aria-hidden="true" />,
        action: () => {
          onClose();
          onOpenTimeMachine?.();
        },
      },
      {
        id: 'act-export',
        category: 'Aksi Cepat',
        title: 'Ekspor Dokumen PDF Resmi',
        subtitle: 'Format A4 Landscape Semua Kelas 1 Halaman & Rekap SK',
        icon: <FileDown size={16} color="#124037" aria-hidden="true" />,
        action: () => {
          onClose();
          onOpenExportPdf?.();
        },
      },
    ];

    // Persuratan & Arsip Documents
    (state.documents ?? []).forEach((doc) => {
      const kindLabel = DOCUMENT_KIND_LABELS[doc.documentType] ?? doc.documentType;
      const statusLabel = DOCUMENT_STATUS_LABELS[doc.status] ?? doc.status;
      list.push({
        id: `doc-${doc.id}`,
        category: 'Persuratan & Arsip',
        title: doc.title,
        subtitle: `${doc.documentNumber ?? 'Draft Belum Bernomor'} · ${kindLabel} · ${statusLabel}`,
        searchTokens: [doc.documentNumber ?? '', doc.subject ?? '', doc.counterpartName ?? '', kindLabel, statusLabel].join(' '),
        icon: <FileText size={16} color="#124037" aria-hidden="true" />,
        action: () => {
          if (doc.status === 'DRAFT' && doc.intakeDraftId) {
            launchOrNav({
              view: 'studio',
              draftId: doc.intakeDraftId,
              documentId: doc.id,
              templateId: doc.templateId ?? null,
              nonce: Date.now(),
            });
          } else {
            launchOrNav({
              view: 'detail',
              documentId: doc.id,
              versionId: doc.currentVersionId ?? null,
              nonce: Date.now(),
            });
          }
        },
      });
    });

    // Active Document Templates
    activeTemplates.forEach((tpl) => {
      list.push({
        id: `tpl-${tpl.id}`,
        category: 'Template Surat',
        title: tpl.name,
        subtitle: `${tpl.code} · ${tpl.source === 'SYSTEM' ? 'Bawaan SAKALA' : 'Template Madrasah'} · ${tpl.initialPageSettings.paperSize.toUpperCase()}`,
        searchTokens: `${tpl.code} ${tpl.description} ${tpl.purpose} ${tpl.category}`,
        icon: <FilePlus2 size={15} color="#124037" aria-hidden="true" />,
        action: () =>
          launchOrNav({
            view: 'intake',
            templateId: tpl.id,
            nonce: Date.now(),
          }),
      });
    });

    // Teachers (strict anti-NIP hygiene: never render NIP in quick search subtitle)
    state.teachers
      .filter((t) => t.isActive)
      .forEach((t) => {
        list.push({
          id: `teacher-${t.id}`,
          category: 'Dewan Pendidik',
          title: t.name,
          subtitle: `${t.roleTitle || 'Guru Mapel'} · Kode: ${t.code}`,
          icon: <MadrasahTeacherAvatar teacher={t} size={24} showStatusDot={false} />,
          action: () => {
            onClose();
            onSelectTeacher?.(t);
          },
        });
      });

    // Classes
    state.classes
      .filter((c) => c.isActive)
      .forEach((c) => {
        list.push({
          id: `class-${c.id}`,
          category: 'Rombongan Belajar',
          title: `Kelas ${c.name} (Tingkat ${c.level})`,
          subtitle: 'Rombel aktif madrasah',
          icon: <GraduationCap size={16} color="#124037" aria-hidden="true" />,
          action: () => {
            onNavigate('schedule');
            onSelectClass?.(c.id);
            onClose();
          },
        });
      });

    // Subjects
    state.subjects
      .filter((s) => s.isActive)
      .forEach((s) => {
        list.push({
          id: `subject-${s.id}`,
          category: 'Mata Pelajaran',
          title: s.name,
          subtitle: `Kode: ${s.code}`,
          icon: (
            <span
              aria-hidden="true"
              style={{
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                background: s.color,
                display: 'inline-block',
              }}
            />
          ),
          action: () => {
            onNavigate('master');
            onClose();
          },
        });
      });

    return list;
  }, [
    state,
    activeTemplates,
    skBasis,
    onNavigate,
    onLaunchPersuratan,
    onLaunchTeachingSk,
    onClose,
    onSelectTeacher,
    onSelectClass,
    onOpenValidation,
    onOpenTimeMachine,
    onOpenExportPdf,
  ]);

  // Filter items based on query
  const filteredItems = useMemo(() => {
    if (!query.trim()) return allItems.slice(0, 18);
    const q = query.toLowerCase();
    return allItems
      .filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
          (item.searchTokens && item.searchTokens.toLowerCase().includes(q))
      )
      .slice(0, 28);
  }, [allItems, query]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (filteredItems.length === 0) return;
        setSelectedIndex((prev) => (prev + 1 < filteredItems.length ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (filteredItems.length === 0) return;
        setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filteredItems.length - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          filteredItems[selectedIndex].action();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, filteredItems, selectedIndex]);

  if (!isOpen) return null;

  // Group filtered items by category
  const categories = Array.from(new Set(filteredItems.map((item) => item.category)));
  const activeOptionId = filteredItems[selectedIndex]
    ? `s5-palette-opt-${filteredItems[selectedIndex].id}`
    : undefined;

  return (
    <div
      className="s5-palette-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="s5-palette-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Pusat Kendali Cepat (Command Palette)"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="s5-palette-search-wrap">
          <Search size={18} color="#124037" aria-hidden="true" />
          <input
            ref={inputRef}
            className="s5-palette-input"
            type="text"
            role="combobox"
            aria-label="Cari aksi, dokumen persuratan, template, guru, kelas, atau mata pelajaran"
            aria-expanded={true}
            aria-controls="s5-palette-listbox"
            aria-activedescendant={activeOptionId}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Ketik surat, template, guru, kelas, mapel, atau aksi cepat..."
          />
          <span className="s5-kbd-shortcut">ESC untuk batal</span>
        </div>

        {/* Results List */}
        <div
          id="s5-palette-listbox"
          className="s5-palette-results"
          role="listbox"
          aria-label="Hasil pencarian tindakan dan data"
        >
          {filteredItems.length === 0 ? (
            <div
              role="status"
              style={{
                textAlign: 'center',
                padding: '36px 16px',
                color: '#526861',
                fontSize: '13px',
              }}
            >
              Tidak ada hasil yang cocok dengan &quot;{query}&quot;.
            </div>
          ) : (
            categories.map((cat) => {
              const catItems = filteredItems.filter((i) => i.category === cat);
              return (
                <div key={cat} role="group" aria-label={cat} style={{ marginBottom: '8px' }}>
                  <div className="s5-palette-group-title">{cat}</div>
                  {catItems.map((item) => {
                    const globalIdx = filteredItems.indexOf(item);
                    const isSelected = globalIdx === selectedIndex;
                    return (
                      <div
                        key={item.id}
                        id={`s5-palette-opt-${item.id}`}
                        role="option"
                        aria-selected={isSelected}
                        className={`s5-palette-item ${isSelected ? 'active' : ''}`}
                        onClick={item.action}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                      >
                        <div style={{ flexShrink: 0, display: 'grid', placeItems: 'center' }}>
                          {item.icon}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <strong
                            style={{
                              fontSize: '13px',
                              display: 'block',
                              color: isSelected ? '#124037' : '#0F201C',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {item.title}
                          </strong>
                          {item.subtitle && (
                            <small
                              style={{
                                fontSize: '11.5px',
                                color: '#4B635D',
                                display: 'block',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {item.subtitle}
                            </small>
                          )}
                        </div>
                        {isSelected && (
                          <div style={{ flexShrink: 0, color: '#124037' }} aria-hidden="true">
                            <ArrowRight size={14} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts helper */}
        <div
          style={{
            padding: '8px 16px',
            borderTop: '0.75px solid #E1E8E4',
            background: '#F8FAF7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: '#4B635D',
          }}
        >
          <div style={{ display: 'flex', gap: '12px' }}>
            <span>
              <kbd style={{ fontFamily: 'monospace', fontWeight: 700 }}>↑</kbd>{' '}
              <kbd style={{ fontFamily: 'monospace', fontWeight: 700 }}>↓</kbd> Navigasi
            </span>
            <span>
              <kbd style={{ fontFamily: 'monospace', fontWeight: 700 }}>↵</kbd> Pilih
            </span>
          </div>
          <span aria-live="polite" className="s5-tnum">
            {filteredItems.length} hasil · SAKALA Command
          </span>
        </div>
      </div>
    </div>
  );
};
