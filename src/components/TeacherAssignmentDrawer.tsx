import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  FilePlus2,
  FileText,
  Plus,
  Save,
  ShieldCheck,
  X,
} from 'lucide-react';
import type {
  AppState,
  Teacher,
  TeacherAssignment,
  TeacherAssignmentStatus,
  TeacherAssignmentType,
} from '../domain/types';
import type { PersuratanLaunchRequest } from '../domain/persuratan/types';
import { formatVersionDateTime } from '../domain/scheduleSources';
import {
  buildTeacherDocumentLaunchPayload,
  getOfficialScheduleBasisStatus,
  getTeacherOperationalProfile,
  updateTeacherAssignmentStatusInState,
  upsertTeacherAssignmentInState,
} from '../domain/persuratan/assignments/teacherIntegration';
import { MadrasahTeacherAvatar } from './MadrasahTeacherAvatar';

export interface TeacherAssignmentDrawerProps {
  isOpen: boolean;
  teacher: Teacher | null;
  state: AppState;
  onClose: () => void;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
  onLaunchPersuratan: (request: PersuratanLaunchRequest) => void;
  onNotify?: (message: string, kind?: 'success' | 'warning' | 'error' | 'info') => void;
}

const ASSIGNMENT_TYPE_LABELS: Record<TeacherAssignmentType, string> = {
  TEACHING: 'Tugas Mengajar',
  HOMEROOM: 'Wali Kelas',
  ADDITIONAL_DUTY: 'Tugas Tambahan',
  COMMITTEE: 'Kepanitiaan / Tim',
  COORDINATOR: 'Koordinator Program',
  TRAINING: 'Pelatihan / Bimtek',
  OTHER: 'Penugasan Lainnya',
};

const STATUS_BADGE_MAP: Record<
  TeacherAssignmentStatus,
  { label: string; bg: string; color: string; border: string }
> = {
  ACTIVE: { label: 'Aktif', bg: '#E8F4EE', color: '#0F5132', border: '#B6DAC7' },
  DRAFT: { label: 'Draft', bg: '#FFF7E6', color: '#8A5300', border: '#F2D08A' },
  COMPLETED: { label: 'Selesai', bg: '#EEF2F6', color: '#334155', border: '#CBD5E1' },
  CANCELLED: { label: 'Dibatalkan', bg: '#FCECEC', color: '#842029', border: '#F5C2C7' },
};

export const TeacherAssignmentDrawer: React.FC<TeacherAssignmentDrawerProps> = ({
  isOpen,
  teacher,
  state,
  onClose,
  onUpdateState,
  onLaunchPersuratan,
  onNotify,
}) => {
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [title, setTitle] = useState('');
  const [assignmentType, setAssignmentType] = useState<TeacherAssignmentType>('ADDITIONAL_DUTY');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [description, setDescription] = useState('');
  const [weeklyJP, setWeeklyJP] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [quickTemplateId, setQuickTemplateId] = useState('SYS-TPL-04');

  const profile = useMemo(
    () => (teacher ? getTeacherOperationalProfile(state, teacher.id) : null),
    [state, teacher]
  );

  const officialBasis = useMemo(() => getOfficialScheduleBasisStatus(state), [state]);

  useEffect(() => {
    setFormOpen(false);
    setEditingId(undefined);
    setFormError(null);
  }, [teacher?.id, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !teacher || !profile) return null;

  const subjectById = new Map(state.subjects.map((s) => [s.id, s]));

  const openNewAssignmentForm = () => {
    setEditingId(undefined);
    setTitle('');
    setAssignmentType('ADDITIONAL_DUTY');
    setStartDate(new Date().toISOString().slice(0, 10));
    setEndDate('');
    setDescription('');
    setWeeklyJP('');
    setFormError(null);
    setFormOpen(true);
  };

  const openEditAssignmentForm = (item: TeacherAssignment) => {
    setEditingId(item.id);
    setTitle(item.title);
    setAssignmentType(item.assignmentType);
    setStartDate(item.startDate ?? '');
    setEndDate(item.endDate ?? '');
    setDescription(item.description ?? '');
    setWeeklyJP(item.weeklyJP !== undefined && item.weeklyJP !== null ? String(item.weeklyJP) : '');
    setFormError(null);
    setFormOpen(true);
  };

  const handleSaveAssignment = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      const parsedJp = weeklyJP.trim() ? Number(weeklyJP.trim()) : undefined;
      const result = upsertTeacherAssignmentInState(state, {
        id: editingId,
        teacherId: teacher.id,
        title: title.trim(),
        assignmentType,
        startDate: startDate.trim() || null,
        endDate: endDate.trim() || null,
        description: description.trim() || undefined,
        weeklyJP: parsedJp,
        status: 'ACTIVE',
      });
      onUpdateState(() => result.state);
      setFormOpen(false);
      setEditingId(undefined);
      onNotify?.(
        editingId
          ? `Penugasan "${result.assignment.title}" diperbarui tanpa mengubah naskah surat lama.`
          : `Penugasan "${result.assignment.title}" ditambahkan untuk ${teacher.name}.`,
        'success'
      );
      if (result.warnings.length > 0) {
        onNotify?.(result.warnings[0], 'warning');
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal menyimpan penugasan guru.');
    }
  };

  const handleChangeAssignmentStatus = (assignmentId: string, nextStatus: TeacherAssignmentStatus) => {
    try {
      const res = updateTeacherAssignmentStatusInState(state, assignmentId, nextStatus);
      onUpdateState(() => res.state);
      onNotify?.(
        `Status penugasan "${res.assignment.title}" diubah menjadi ${STATUS_BADGE_MAP[nextStatus].label}.`,
        'info'
      );
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Gagal memperbarui status.', 'error');
    }
  };

  const handleLaunchTemplateForTeacher = (tplId: string, assignmentId?: string | null) => {
    try {
      const req = buildTeacherDocumentLaunchPayload(state, {
        teacherId: teacher.id,
        templateId: tplId,
        assignmentId: assignmentId ?? null,
      });
      onClose();
      onLaunchPersuratan(req);
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Tidak dapat membuka formulir dokumen.', 'warning');
    }
  };

  const handleOpenExistingDocument = (docId: string) => {
    const doc = (state.documents ?? []).find((d) => d.id === docId);
    if (!doc) return;
    onClose();
    if (doc.status === 'FINAL' || doc.status === 'ARCHIVED' || doc.status === 'REVISED') {
      onLaunchPersuratan({
        nonce: Date.now(),
        view: 'preview',
        documentId: doc.id,
        draftId: doc.intakeDraftId ?? null,
        versionId: doc.currentVersionId ?? null,
      });
      return;
    }
    const draft = (state.intakeDrafts ?? []).find((d) => d.documentId === doc.id);
    if (draft?.studio?.editorStatus === 'IN_PROGRESS') {
      onLaunchPersuratan({
        nonce: Date.now(),
        view: 'studio',
        draftId: draft.id,
        templateId: draft.templateId,
      });
      return;
    }
    if (draft) {
      onLaunchPersuratan({
        nonce: Date.now(),
        view: 'intake',
        draftId: draft.id,
        templateId: draft.templateId,
      });
      return;
    }
    onLaunchPersuratan({
      nonce: Date.now(),
      view: 'center',
      documentId: doc.id,
    });
  };

  return (
    <div
      className="s5-drawer-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="s5-drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="teacher-assignment-drawer-title"
        style={{ width: 'min(540px, 100vw)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="s5-drawer-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <MadrasahTeacherAvatar
              teacher={teacher}
              size={38}
            />
            <div style={{ minWidth: 0 }}>
              <h2
                id="teacher-assignment-drawer-title"
                style={{
                  margin: 0,
                  fontSize: '14.5px',
                  fontWeight: 700,
                  color: '#0B2923',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {teacher.name}
              </h2>
              <small style={{ fontSize: '11.5px', color: '#536D65', display: 'block' }}>
                {teacher.code} · {teacher.roleTitle || 'Guru Mapel'} ·{' '}
                {teacher.isActive ? 'Aktif' : 'Nonaktif'}
              </small>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#536D65',
              cursor: 'pointer',
              padding: '6px',
            }}
            aria-label="Tutup laci penugasan guru"
          >
            <X size={18} />
          </button>
        </div>

        <div
          className="s5-drawer-body"
          style={{ padding: '16px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}
        >
          {/* 1. Verified Official Teaching Workload Snapshot */}
          <section
            style={{
              padding: '12px 14px',
              borderRadius: '10px',
              background: profile.officialVersion ? '#EDF7F2' : '#FFF8EC',
              border: `1px solid ${profile.officialVersion ? '#B8D9C7' : '#E7C88B'}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 700, fontSize: '12.5px', color: '#0B2923' }}>
                {profile.officialVersion ? (
                  <ShieldCheck size={15} style={{ color: '#14532D' }} aria-hidden="true" />
                ) : (
                  <AlertTriangle size={15} style={{ color: '#9A5B13' }} aria-hidden="true" />
                )}
                <span>Sumber Resmi SK Mengajar (ScheduleVersion)</span>
              </div>
              {profile.officialVersion && (
                <span className="s5-tnum" style={{ fontSize: '11px', fontWeight: 700, color: '#14532D' }}>
                  v{profile.officialVersion.version.version} · {profile.officialVersion.metadata.fingerprint}
                </span>
              )}
            </div>

            {profile.officialVersion && profile.officialWorkload ? (
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#1D3D35', display: 'grid', gap: '4px' }}>
                <div className="s5-tnum">
                  Beban Mengajar Resmi: <strong>{profile.officialWorkload.totalJP} JP/pekan</strong> (
                  {profile.officialWorkload.astroHours} jam astronomis · Max {profile.officialWorkload.maxWeeklyJP} JP)
                </div>
                <div>
                  Mapel:{' '}
                  {profile.officialWorkload.subjectsTaught.length > 0
                    ? profile.officialWorkload.subjectsTaught
                        .map((sid) => subjectById.get(sid)?.name ?? sid)
                        .join(', ')
                    : 'Belum ada alokasi pada versi terbit ini'}
                </div>
                <div className="s5-tnum" style={{ fontSize: '11px', color: '#4A665E' }}>
                  Terbit: {formatVersionDateTime(profile.officialVersion.version.createdAt)}
                  {profile.hasUnpublishedDraft ? ' · Catatan: Draft jadwal baru belum diterbitkan tidak ikut SK.' : ''}
                </div>
              </div>
            ) : (
              <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#784812', lineHeight: 1.45 }}>
                {officialBasis.blockedReason}
              </p>
            )}
          </section>

          {/* 2. Quick Create Correspondence for This Teacher */}
          <section
            style={{
              padding: '12px 14px',
              borderRadius: '10px',
              background: '#FFFFFF',
              border: '1px solid #D8E3DD',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 700, fontSize: '12.5px', color: '#0B2923' }}>
              <FilePlus2 size={15} aria-hidden="true" />
              <span>Terbitkan Dokumen Tugas untuk Guru Ini</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <select
                aria-label="Pilih jenis dokumen penugasan guru"
                value={quickTemplateId}
                onChange={(e) => setQuickTemplateId(e.target.value)}
                style={{
                  flex: '1 1 220px',
                  height: '36px',
                  borderRadius: '8px',
                  border: '1px solid #C5D4CD',
                  padding: '0 10px',
                  fontSize: '12.5px',
                  color: '#0B2923',
                  background: '#F9FBFA',
                }}
              >
                <option value="SYS-TPL-04">SK Tugas Tambahan / Jabatan (SYS-TPL-04)</option>
                <option value="SYS-TPL-01">Surat Tugas Pelatihan / Bimtek (SYS-TPL-01)</option>
                <option value="SYS-TPL-02">Surat Tugas Dinas Luar (SYS-TPL-02)</option>
                <option value="SYS-TPL-05">SK Kepanitiaan Kegiatan (SYS-TPL-05)</option>
                <option value="SYS-TPL-03" disabled={!officialBasis.allowed}>
                  SK Pembagian Tugas Mengajar (SYS-TPL-03)
                  {!officialBasis.allowed ? ' — Butuh ScheduleVersion Resmi' : ''}
                </option>
              </select>
              <button
                type="button"
                className="button button-primary button-sm"
                disabled={!teacher.isActive}
                onClick={() => handleLaunchTemplateForTeacher(quickTemplateId)}
                title={teacher.isActive ? 'Buka S03 dengan data guru terisi otomatis' : 'Guru nonaktif tidak dapat diberi tugas baru'}
              >
                <FileText size={13} aria-hidden="true" />
                <span>Buat Dokumen Guru</span>
              </button>
            </div>
            {!teacher.isActive && (
              <small style={{ color: '#991B1B', fontSize: '11.5px' }}>
                Guru berstatus nonaktif. Aktifkan kembali guru terlebih dahulu sebelum membuat penugasan baru.
              </small>
            )}
          </section>

          {/* 3. TeacherAssignment List + Inline Add/Edit */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 700, fontSize: '13px', color: '#0B2923' }}>
                <Award size={15} aria-hidden="true" />
                <span>Riwayat &amp; Daftar Penugasan ({profile.assignments.length})</span>
              </div>
              <button
                type="button"
                className="button button-secondary button-sm"
                onClick={openNewAssignmentForm}
              >
                <Plus size={13} aria-hidden="true" />
                <span>Tambah Penugasan</span>
              </button>
            </div>

            {formOpen && (
              <form
                onSubmit={handleSaveAssignment}
                style={{
                  padding: '12px',
                  borderRadius: '10px',
                  background: '#F6FAF8',
                  border: '1px solid #C5D5CD',
                  display: 'grid',
                  gap: '8px',
                }}
              >
                <strong style={{ fontSize: '12.5px', color: '#0B2923' }}>
                  {editingId ? 'Edit Penugasan Guru' : 'Tambah Penugasan Baru'}
                </strong>
                {formError && (
                  <div role="alert" style={{ fontSize: '12px', color: '#991B1B', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px', padding: '7px 9px' }}>
                    {formError}
                  </div>
                )}
                <div style={{ display: 'grid', gap: '4px' }}>
                  <label htmlFor="ta-title" style={{ fontSize: '11.5px', fontWeight: 700, color: '#27443D' }}>
                    Nama Tugas / Jabatan *
                  </label>
                  <input
                    id="ta-title"
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Contoh: Wali Kelas VIII-A / Pembina OSIS / Diklat Kurikulum"
                    style={{ height: '34px', borderRadius: '6px', border: '1px solid #C5D4CD', padding: '0 9px', fontSize: '12.5px' }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '8px' }}>
                  <div>
                    <label htmlFor="ta-type" style={{ fontSize: '11.5px', fontWeight: 700, color: '#27443D', display: 'block', marginBottom: '3px' }}>
                      Jenis Penugasan
                    </label>
                    <select
                      id="ta-type"
                      value={assignmentType}
                      onChange={(e) => setAssignmentType(e.target.value as TeacherAssignmentType)}
                      style={{ width: '100%', height: '34px', borderRadius: '6px', border: '1px solid #C5D4CD', padding: '0 8px', fontSize: '12px' }}
                    >
                      {Object.entries(ASSIGNMENT_TYPE_LABELS).map(([val, label]) => (
                        <option key={val} value={val}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="ta-jp" style={{ fontSize: '11.5px', fontWeight: 700, color: '#27443D', display: 'block', marginBottom: '3px' }}>
                      Ekuivalen JP
                    </label>
                    <input
                      id="ta-jp"
                      type="number"
                      min={0}
                      max={40}
                      value={weeklyJP}
                      onChange={(e) => setWeeklyJP(e.target.value)}
                      placeholder="Opsional"
                      style={{ width: '100%', height: '34px', borderRadius: '6px', border: '1px solid #C5D4CD', padding: '0 8px', fontSize: '12px' }}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label htmlFor="ta-start" style={{ fontSize: '11.5px', fontWeight: 700, color: '#27443D', display: 'block', marginBottom: '3px' }}>
                      TMT / Mulai
                    </label>
                    <input
                      id="ta-start"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      style={{ width: '100%', height: '34px', borderRadius: '6px', border: '1px solid #C5D4CD', padding: '0 8px', fontSize: '12px' }}
                    />
                  </div>
                  <div>
                    <label htmlFor="ta-end" style={{ fontSize: '11.5px', fontWeight: 700, color: '#27443D', display: 'block', marginBottom: '3px' }}>
                      Selesai (Opsional)
                    </label>
                    <input
                      id="ta-end"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      style={{ width: '100%', height: '34px', borderRadius: '6px', border: '1px solid #C5D4CD', padding: '0 8px', fontSize: '12px' }}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="ta-desc" style={{ fontSize: '11.5px', fontWeight: 700, color: '#27443D', display: 'block', marginBottom: '3px' }}>
                    Uraian Tugas (Opsional)
                  </label>
                  <textarea
                    id="ta-desc"
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Keterangan singkat tanggung jawab penugasan…"
                    style={{ width: '100%', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid #C5D4CD', padding: '7px 9px', fontSize: '12px', fontFamily: 'inherit' }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    className="button button-secondary button-sm"
                    onClick={() => setFormOpen(false)}
                  >
                    Batal
                  </button>
                  <button type="submit" className="button button-primary button-sm">
                    <Save size={13} aria-hidden="true" />
                    <span>Simpan Penugasan</span>
                  </button>
                </div>
              </form>
            )}

            {profile.assignments.length === 0 ? (
              <div style={{ padding: '14px', borderRadius: '8px', border: '1px dashed #CBD9D2', textAlign: 'center', fontSize: '12px', color: '#536D65' }}>
                Belum ada catatan penugasan administratif/mengajar khusus untuk {teacher.name}.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {profile.assignments.map((item) => {
                  const badge = STATUS_BADGE_MAP[item.status];
                  const linkedDoc = item.documentId
                    ? (state.documents ?? []).find((d) => d.id === item.documentId) ?? null
                    : null;
                  return (
                    <div
                      key={item.id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '9px',
                        border: '1px solid #DCE7E1',
                        background: '#FFFFFF',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                        <div>
                          <strong style={{ fontSize: '12.5px', color: '#0B2923', display: 'block' }}>
                            {item.title}
                          </strong>
                          <span style={{ fontSize: '11px', color: '#536D65' }}>
                            {ASSIGNMENT_TYPE_LABELS[item.assignmentType]} · Sumber: {item.sourceType}
                            {item.weeklyJP ? ` · ${item.weeklyJP} JP` : ''}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: '10.5px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '999px',
                            background: badge.bg,
                            color: badge.color,
                            border: `1px solid ${badge.border}`,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {badge.label}
                        </span>
                      </div>

                      <div className="s5-tnum" style={{ fontSize: '11px', color: '#476159', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Calendar size={11} aria-hidden="true" />
                          {item.isDateUnknown || !item.startDate
                            ? 'TMT belum tercatat'
                            : item.endDate
                            ? `${item.startDate} s.d. ${item.endDate}`
                            : `TMT ${item.startDate}`}
                        </span>
                        {item.sourceScheduleVersionId && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <BookOpen size={11} aria-hidden="true" />
                            Jadwal: {item.sourceScheduleVersionId}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', flexWrap: 'wrap', paddingTop: '4px', borderTop: '1px solid #EDF3F0' }}>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="s02-btn-secondary"
                            style={{ padding: '4px 9px', fontSize: '11px' }}
                            onClick={() => openEditAssignmentForm(item)}
                          >
                            Ubah
                          </button>
                          {item.status === 'ACTIVE' && (
                            <button
                              type="button"
                              className="s02-btn-secondary"
                              style={{ padding: '4px 9px', fontSize: '11px' }}
                              onClick={() => handleChangeAssignmentStatus(item.id, 'COMPLETED')}
                            >
                              Tandai Selesai
                            </button>
                          )}
                        </div>
                        {linkedDoc ? (
                          <button
                            type="button"
                            className="s05-jump-btn"
                            onClick={() => handleOpenExistingDocument(linkedDoc.id)}
                          >
                            <FileCheck2 size={12} aria-hidden="true" />
                            <span>
                              {linkedDoc.documentNumber || linkedDoc.status} ({linkedDoc.id})
                            </span>
                            <ExternalLink size={11} aria-hidden="true" />
                          </button>
                        ) : teacher.isActive ? (
                          <button
                            type="button"
                            className="s05-jump-btn"
                            onClick={() =>
                              handleLaunchTemplateForTeacher(
                                item.assignmentType === 'TRAINING' ? 'SYS-TPL-01' : 'SYS-TPL-04',
                                item.id
                              )
                            }
                          >
                            <span>Buat Surat Tugas &rarr;</span>
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* 4. Linked Correspondence Documents */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 700, fontSize: '13px', color: '#0B2923' }}>
              <CheckCircle2 size={15} aria-hidden="true" />
              <span>Dokumen Persuratan Terkait ({profile.linkedDocuments.length})</span>
            </div>
            {profile.linkedDocuments.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#536D65', padding: '10px 12px', background: '#F9FBFA', borderRadius: '8px', border: '1px solid #E2ECE7' }}>
                Belum ada surat tugas atau SK yang tertaut ke guru ini.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {profile.linkedDocuments.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => handleOpenExistingDocument(doc.id)}
                    style={{
                      textAlign: 'left',
                      padding: '9px 11px',
                      borderRadius: '8px',
                      border: '1px solid #D7E4DD',
                      background: '#FFFFFF',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ display: 'block', fontSize: '12.5px', color: '#0B2923', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc.title}
                      </strong>
                      <span className="s5-tnum" style={{ fontSize: '11px', color: '#536D65' }}>
                        {doc.documentNumber || 'Belum bernomor (Draft)'} · {doc.status} · {doc.documentDate}
                      </span>
                    </div>
                    <ExternalLink size={14} style={{ color: '#14532D', flexShrink: 0 }} aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
