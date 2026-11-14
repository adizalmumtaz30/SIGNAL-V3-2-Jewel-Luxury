import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  GraduationCap,
  BookOpen,
  Save,
} from 'lucide-react';
import type { AppState, Teacher, SchoolClass, Subject, Day } from '../domain/types';
import { MadrasahTeacherAvatar, detectTeacherGender } from './MadrasahTeacherAvatar';

export type InspectorTarget =
  | { type: 'teacher'; data: Teacher }
  | { type: 'class'; data: SchoolClass }
  | { type: 'subject'; data: Subject };

interface InspectorSlideDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  target: InspectorTarget | null;
  state: AppState;
  onSaveTeacher?: (updated: Teacher) => void;
  onSaveClass?: (updated: SchoolClass) => void;
  onSaveSubject?: (updated: Subject) => void;
  onNotify: (message: string, kind?: 'success' | 'warning' | 'error' | 'info') => void;
}

const ALL_DAYS: Day[] = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export const InspectorSlideDrawer: React.FC<InspectorSlideDrawerProps> = ({
  isOpen,
  onClose,
  target,
  state,
  onSaveTeacher,
  onSaveClass: _onSaveClass,
  onSaveSubject: _onSaveSubject,
  onNotify,
}) => {
  // Teacher form state
  const [teacherName, setTeacherName] = useState('');
  const [teacherCode, setTeacherCode] = useState('');
  const [teacherNip, setTeacherNip] = useState('');
  const [teacherRole, setTeacherRole] = useState('');
  const [teacherMaxJp, setTeacherMaxJp] = useState(24);
  const [teacherGender, setTeacherGender] = useState<'male' | 'female'>('male');
  const [teacherDays, setTeacherDays] = useState<Day[]>(ALL_DAYS);
  const [teacherSubjectIds, setTeacherSubjectIds] = useState<string[]>([]);
  const [teacherIsActive, setTeacherIsActive] = useState(true);

  // Sync state when target changes
  useEffect(() => {
    if (!target) return;

    if (target.type === 'teacher') {
      const t = target.data;
      setTeacherName(t.name);
      setTeacherCode(t.code);
      setTeacherNip(t.nip || '');
      setTeacherRole(t.roleTitle || 'Guru Mapel');
      setTeacherMaxJp(t.maxWeeklyJP || 24);
      setTeacherGender(detectTeacherGender(t.name, t.roleTitle, t.gender));
      setTeacherDays(t.availableDays || ALL_DAYS);
      setTeacherSubjectIds(t.subjectIds || []);
      setTeacherIsActive(t.isActive);
    }
  }, [target]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !target) return null;

  const handleSaveTeacher = (e: React.FormEvent) => {
    e.preventDefault();
    if (target.type !== 'teacher' || !onSaveTeacher) return;

    const updated: Teacher = {
      ...target.data,
      name: teacherName.trim(),
      code: teacherCode.trim().toUpperCase(),
      nip: teacherNip.trim() || undefined,
      roleTitle: teacherRole.trim(),
      maxWeeklyJP: Number(teacherMaxJp) || 24,
      gender: teacherGender,
      availableDays: teacherDays,
      subjectIds: teacherSubjectIds,
      isActive: teacherIsActive,
    };

    onSaveTeacher(updated);
    onNotify(`Data ustadz/ustadzah ${updated.name} berhasil diperbarui!`, 'success');
    onClose();
  };

  const toggleDay = (day: Day) => {
    if (teacherDays.includes(day)) {
      if (teacherDays.length === 1) {
        onNotify('Guru harus tersedia minimal 1 hari KBM.', 'warning');
        return;
      }
      setTeacherDays(teacherDays.filter((d) => d !== day));
    } else {
      setTeacherDays([...teacherDays, day]);
    }
  };

  const toggleSubject = (subId: string) => {
    if (teacherSubjectIds.includes(subId)) {
      setTeacherSubjectIds(teacherSubjectIds.filter((id) => id !== subId));
    } else {
      setTeacherSubjectIds([...teacherSubjectIds, subId]);
    }
  };

  // Compute teaching load stats for teacher
  const teacherLoadStats = () => {
    if (target.type !== 'teacher') return null;
    const reqs = state.requirements.filter((r) => r.teacherId === target.data.id);
    const assignedJP = reqs.reduce((sum, r) => sum + r.requiredJP, 0);
    const maxJP = Number(teacherMaxJp) || 24;
    const pct = Math.round((assignedJP / maxJP) * 100);
    const classCount = new Set(reqs.map((r) => r.classId)).size;
    return { assignedJP, maxJP, pct, classCount };
  };

  const stats = teacherLoadStats();

  return (
    <div className="s5-drawer-overlay" onClick={onClose}>
      <div className="s5-drawer-panel" onClick={(e) => e.stopPropagation()}>
        {/* Drawer Header */}
        <div className="s5-drawer-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#E8F2EE',
                border: '1px solid #124037',
                display: 'grid',
                placeItems: 'center',
                color: '#124037',
              }}
            >
              {target.type === 'teacher' && <User size={16} />}
              {target.type === 'class' && <GraduationCap size={16} />}
              {target.type === 'subject' && <BookOpen size={16} />}
            </div>
            <div>
              <strong style={{ fontSize: '14px', color: '#0B2923', display: 'block' }}>
                {target.type === 'teacher' && 'Inspektur Pendidik'}
                {target.type === 'class' && 'Inspektur Rombel'}
                {target.type === 'subject' && 'Inspektur Mapel'}
              </strong>
              <small style={{ fontSize: '11px', color: '#687E77' }}>
                Panel Cepat · Tanpa Alih Konteks
              </small>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#687E77',
              cursor: 'pointer',
              padding: '6px',
            }}
            aria-label="Tutup Panel"
          >
            <X size={18} />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="s5-drawer-body">
          {target.type === 'teacher' && (
            <form id="inspector-teacher-form" onSubmit={handleSaveTeacher}>
              {/* Profile Card Header with Live Avatar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '14px',
                  borderRadius: '12px',
                  background: 'var(--s5-canvas-base)',
                  border: '0.75px solid #CCD8D2',
                  marginBottom: '20px',
                }}
              >
                <div style={{ flexShrink: 0 }}>
                  <MadrasahTeacherAvatar
                    teacher={{
                      ...target.data,
                      name: teacherName || target.data.name,
                      gender: teacherGender,
                      isActive: teacherIsActive,
                    }}
                    size={64}
                    showStatusDot={true}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setTeacherGender('male')}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: teacherGender === 'male' ? '1.5px solid #124037' : '1px solid #CCD8D2',
                        background: teacherGender === 'male' ? '#E8F2EE' : '#FFFFFF',
                        color: teacherGender === 'male' ? '#0B2923' : '#687E77',
                        fontWeight: teacherGender === 'male' ? 700 : 500,
                        fontSize: '11px',
                        cursor: 'pointer',
                      }}
                    >
                      👳‍♂️ Asatidz
                    </button>
                    <button
                      type="button"
                      onClick={() => setTeacherGender('female')}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: teacherGender === 'female' ? '1.5px solid #124037' : '1px solid #CCD8D2',
                        background: teacherGender === 'female' ? '#E8F2EE' : '#FFFFFF',
                        color: teacherGender === 'female' ? '#0B2923' : '#687E77',
                        fontWeight: teacherGender === 'female' ? 700 : 500,
                        fontSize: '11px',
                        cursor: 'pointer',
                      }}
                    >
                      🧕 Ustadzah
                    </button>
                  </div>
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      color: teacherIsActive ? '#1B5E43' : '#8F2D24',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={teacherIsActive}
                      onChange={(e) => setTeacherIsActive(e.target.checked)}
                    />
                    <strong>{teacherIsActive ? 'Pendidik Aktif (EMIS)' : 'Nonaktif'}</strong>
                  </label>
                </div>
              </div>

              {/* Teaching Load Mini-Bar */}
              {stats && (
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: '9px',
                    background: '#FFFFFF',
                    border: '0.75px solid #CCD8D2',
                    marginBottom: '18px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      marginBottom: '6px',
                    }}
                  >
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#3B504A' }}>
                      Beban Jam Mengajar
                    </span>
                    <strong
                      className="s5-tnum"
                      style={{
                        fontSize: '13px',
                        color: stats.assignedJP > stats.maxJP ? '#8F2D24' : '#124037',
                      }}
                    >
                      {stats.assignedJP} / {stats.maxJP} JP ({stats.pct}%)
                    </strong>
                  </div>
                  <div
                    style={{
                      height: '6px',
                      borderRadius: '3px',
                      background: '#E1E8E4',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(100, stats.pct)}%`,
                        background:
                          stats.assignedJP > stats.maxJP
                            ? '#8F2D24'
                            : stats.pct >= 80
                            ? '#1B5E43'
                            : '#C5A059',
                        transition: 'width 0.2s ease',
                      }}
                    />
                  </div>
                  <small style={{ fontSize: '10.5px', color: '#687E77', marginTop: '4px', display: 'block' }}>
                    Mengajar di {stats.classCount} kelas rombel aktif
                  </small>
                </div>
              )}

              {/* Field: Nama Lengkap & Gelar */}
              <div style={{ marginBottom: '14px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    color: '#0B2923',
                    marginBottom: '5px',
                  }}
                >
                  Nama Lengkap &amp; Gelar Akademik
                </label>
                <input
                  type="text"
                  required
                  value={teacherName}
                  onChange={(e) => setTeacherName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '7px',
                    border: '1px solid #CCD8D2',
                    fontSize: '12.5px',
                  }}
                />
              </div>

              {/* Row: Kode & NIP */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px', marginBottom: '14px' }}>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#0B2923',
                      marginBottom: '5px',
                    }}
                  >
                    Kode Guru
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={teacherCode}
                    onChange={(e) => setTeacherCode(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '7px',
                      border: '1px solid #CCD8D2',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#0B2923',
                      marginBottom: '5px',
                    }}
                  >
                    NIP / NUPTK / PegID
                  </label>
                  <input
                    type="text"
                    value={teacherNip}
                    onChange={(e) => setTeacherNip(e.target.value)}
                    placeholder="18 digit NIP resmi"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '7px',
                      border: '1px solid #CCD8D2',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                    }}
                  />
                </div>
              </div>

              {/* Row: Jabatan & Batas JP */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', marginBottom: '18px' }}>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#0B2923',
                      marginBottom: '5px',
                    }}
                  >
                    Tugas Tambahan / Jabatan
                  </label>
                  <input
                    type="text"
                    value={teacherRole}
                    onChange={(e) => setTeacherRole(e.target.value)}
                    placeholder="Kepala Madrasah, Waka, dsb."
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '7px',
                      border: '1px solid #CCD8D2',
                      fontSize: '12px',
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#0B2923',
                      marginBottom: '5px',
                    }}
                  >
                    Batas Kuota JP
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={teacherMaxJp}
                    onChange={(e) => setTeacherMaxJp(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '7px',
                      border: '1px solid #CCD8D2',
                      fontSize: '12px',
                      fontWeight: 700,
                    }}
                  />
                </div>
              </div>

              {/* Ketersediaan Hari Mengajar */}
              <div style={{ marginBottom: '18px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#0B2923',
                    marginBottom: '6px',
                  }}
                >
                  Hari Siap Mengajar (Senin - Sabtu)
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {ALL_DAYS.map((day) => {
                    const isAvailable = teacherDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(day)}
                        style={{
                          padding: '5px 10px',
                          borderRadius: '6px',
                          border: isAvailable ? '1.5px solid #124037' : '1px solid #CCD8D2',
                          background: isAvailable ? '#E8F2EE' : '#FFFFFF',
                          color: isAvailable ? '#0B2923' : '#687E77',
                          fontWeight: isAvailable ? 700 : 500,
                          fontSize: '11px',
                          cursor: 'pointer',
                        }}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Kualifikasi Mata Pelajaran */}
              <div style={{ marginBottom: '18px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#0B2923',
                    marginBottom: '6px',
                  }}
                >
                  Kualifikasi Mapel yang Diampu
                </label>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '6px',
                    maxHeight: '160px',
                    overflowY: 'auto',
                    padding: '8px',
                    border: '1px solid #CCD8D2',
                    borderRadius: '8px',
                    background: '#FFFFFF',
                  }}
                >
                  {state.subjects.map((sub) => {
                    const checked = teacherSubjectIds.includes(sub.id);
                    return (
                      <label
                        key={sub.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '11px',
                          cursor: 'pointer',
                          padding: '4px',
                          borderRadius: '4px',
                          background: checked ? '#E8F2EE' : 'transparent',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSubject(sub.id)}
                        />
                        <span
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: sub.color,
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {sub.name}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </form>
          )}

          {target.type === 'class' && (
            <div>
              <div
                style={{
                  padding: '16px',
                  borderRadius: '10px',
                  background: 'var(--s5-canvas-base)',
                  border: '0.75px solid #CCD8D2',
                  marginBottom: '16px',
                }}
              >
                <strong style={{ fontSize: '15px', color: '#0B2923', display: 'block' }}>
                  Kelas {target.data.name} (Tingkat {target.data.level})
                </strong>
                <span style={{ fontSize: '11.5px', color: '#687E77' }}>
                  Rombel ID: {target.data.id}
                </span>
              </div>
              <p style={{ fontSize: '12px', color: '#3B504A', lineHeight: 1.5 }}>
                Gunakan tab Jadwal Pelajaran untuk melihat alokasi slot KBM per hari pada rombel ini.
              </p>
            </div>
          )}

          {target.type === 'subject' && (
            <div>
              <div
                style={{
                  padding: '16px',
                  borderRadius: '10px',
                  background: 'var(--s5-canvas-base)',
                  border: '0.75px solid #CCD8D2',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <span
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    background: target.data.color,
                  }}
                />
                <div>
                  <strong style={{ fontSize: '15px', color: '#0B2923', display: 'block' }}>
                    {target.data.name} ({target.data.code})
                  </strong>
                  <span style={{ fontSize: '11.5px', color: '#687E77' }}>
                    Mata Pelajaran KBM Aktif
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="s5-drawer-footer">
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '7px 14px',
              borderRadius: '7px',
              border: '0.75px solid #CCD8D2',
              background: '#FFFFFF',
              color: '#3B504A',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Batal
          </button>
          {target.type === 'teacher' && (
            <button
              type="submit"
              form="inspector-teacher-form"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 16px',
                borderRadius: '7px',
                border: 'none',
                background: '#124037',
                color: '#FFFFFF',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Save size={13} />
              <span>Simpan Perubahan</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
