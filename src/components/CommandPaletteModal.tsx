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
} from 'lucide-react';
import type { AppState, Teacher } from '../domain/types';
import { MadrasahTeacherAvatar } from './MadrasahTeacherAvatar';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  onNavigate: (view: 'schedule' | 'master' | 'workload' | 'attendance' | 'settings') => void;
  onSelectTeacher?: (teacher: Teacher) => void;
  onSelectClass?: (classId: string) => void;
  onOpenValidation?: () => void;
  onOpenTimeMachine?: () => void;
  onOpenExportPdf?: () => void;
}

interface PaletteItem {
  id: string;
  category: 'Aksi Cepat' | 'Dewan Pendidik' | 'Rombongan Belajar' | 'Mata Pelajaran';
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action: () => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  state,
  onNavigate,
  onSelectTeacher,
  onSelectClass,
  onOpenValidation,
  onOpenTimeMachine,
  onOpenExportPdf,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Build searchable items list
  const allItems: PaletteItem[] = useMemo(() => {
    const list: PaletteItem[] = [
      {
        id: 'nav-schedule',
        category: 'Aksi Cepat',
        title: 'Buka Jadwal Pelajaran (Timetable Workspace)',
        subtitle: 'Tampilan kisi induk & jadwal per kelas',
        icon: <Calendar size={16} color="#124037" />,
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
        icon: <Users size={16} color="#124037" />,
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
        icon: <LayoutGrid size={16} color="#124037" />,
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
        icon: <CheckCircle2 size={16} color="#124037" />,
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
        icon: <ShieldAlert size={16} color="#8F2D24" />,
        action: () => {
          onClose();
          onOpenValidation?.();
        },
      },
      {
        id: 'act-time-machine',
        category: 'Aksi Cepat',
        title: 'Buka Time Machine Vault (Riwayat Pulih)',
        subtitle: 'Pulihkan data dari snapshot atau berkas cadangan .signal',
        icon: <Clock size={16} color="#C5A059" />,
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
        icon: <FileDown size={16} color="#124037" />,
        action: () => {
          onClose();
          onOpenExportPdf?.();
        },
      },
    ];

    // Teachers
    state.teachers
      .filter((t) => t.isActive)
      .forEach((t) => {
        list.push({
          id: `teacher-${t.id}`,
          category: 'Dewan Pendidik',
          title: t.name,
          subtitle: `${t.roleTitle || 'Guru Mapel'} · Kode: ${t.code}${t.nip ? ` · NIP. ${t.nip}` : ''}`,
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
          subtitle: `Rombel aktif madrasah`,
          icon: <GraduationCap size={16} color="#124037" />,
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
  }, [state, onNavigate, onClose, onSelectTeacher, onSelectClass, onOpenValidation, onOpenTimeMachine, onOpenExportPdf]);

  // Filter items based on query
  const filteredItems = useMemo(() => {
    if (!query.trim()) return allItems.slice(0, 16);
    const q = query.toLowerCase();
    return allItems
      .filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          (item.subtitle && item.subtitle.toLowerCase().includes(q))
      )
      .slice(0, 24);
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
        setSelectedIndex((prev) => (prev + 1 < filteredItems.length ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
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

  return (
    <div className="s5-palette-overlay" onClick={onClose}>
      <div className="s5-palette-modal" onClick={(e) => e.stopPropagation()}>
        {/* Search Input */}
        <div className="s5-palette-search-wrap">
          <Search size={18} color="#124037" />
          <input
            ref={inputRef}
            className="s5-palette-input"
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Ketik nama guru, kelas, mapel, atau aksi cepat..."
          />
          <span className="s5-kbd-shortcut">ESC untuk batal</span>
        </div>

        {/* Results List */}
        <div className="s5-palette-results">
          {filteredItems.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '36px 16px',
                color: '#687E77',
                fontSize: '13px',
              }}
            >
              Tidak ada hasil yang cocok dengan &quot;{query}&quot;.
            </div>
          ) : (
            categories.map((cat) => {
              const catItems = filteredItems.filter((i) => i.category === cat);
              return (
                <div key={cat} style={{ marginBottom: '8px' }}>
                  <div className="s5-palette-group-title">{cat}</div>
                  {catItems.map((item) => {
                    const globalIdx = filteredItems.indexOf(item);
                    const isSelected = globalIdx === selectedIndex;
                    return (
                      <div
                        key={item.id}
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
                                fontSize: '11px',
                                color: '#687E77',
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
                          <div style={{ flexShrink: 0, color: '#124037' }}>
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
            color: '#687E77',
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
          <span>SIGNAL V5 Sovereign Command</span>
        </div>
      </div>
    </div>
  );
};
