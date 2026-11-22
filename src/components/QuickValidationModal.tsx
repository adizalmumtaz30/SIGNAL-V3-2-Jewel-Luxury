import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  FileCheck2,
  GraduationCap,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import type { AppState, Day, ValidationIssue, ValidationReport } from '../domain/types';
import {
  formatValidationCategoryLabel,
  getActionLabelForIssue,
  getTargetScreenForIssue,
  getValidationCategoryGroup,
} from '../domain/validationLabels';
import { AiConflictHelper } from './AiConflictHelper';
import { MotionModalDialog } from './KpiMotion';

interface QuickValidationModalProps {
  state: AppState;
  report: ValidationReport;
  masterIssues: ValidationIssue[];
  isOpen: boolean;
  onClose: () => void;
  onNavigateToSlot?: (classId: string, day: Day, jpNo: number) => void;
  onNavigateToScreen: (screen: 'schedule' | 'master' | 'requirements' | 'settings') => void;
  onRevalidate: () => void;
}

type IssueCategory = 'all' | 'teacher_clash' | 'class_clash' | 'time_activity' | 'coverage';

export function QuickValidationModal({
  state,
  report,
  masterIssues,
  isOpen,
  onClose,
  onNavigateToSlot,
  onNavigateToScreen,
  onRevalidate,
}: QuickValidationModalProps) {
  const [activeCategory, setActiveCategory] = useState<IssueCategory>('all');
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);

  const allIssues = useMemo(() => {
    return [...masterIssues, ...report.issues];
  }, [masterIssues, report.issues]);

  const hardErrors = useMemo(() => allIssues.filter((i) => i.severity === 'error'), [allIssues]);
  const warnings = useMemo(() => allIssues.filter((i) => i.severity === 'warning'), [allIssues]);

  const categorized = useMemo(() => {
    const teacherClash = allIssues.filter((i) => getValidationCategoryGroup(i) === 'teacher');
    const classClash = allIssues.filter((i) => getValidationCategoryGroup(i) === 'class');
    const timeActivity = allIssues.filter((i) => getValidationCategoryGroup(i) === 'time');
    const coverage = allIssues.filter((i) => getValidationCategoryGroup(i) === 'allocation');

    return {
      all: allIssues,
      teacher_clash: teacherClash,
      class_clash: classClash,
      time_activity: timeActivity,
      coverage,
    };
  }, [allIssues]);

  const currentList = categorized[activeCategory] || allIssues;

  // Quick report status
  const statusType: 'PASS' | 'ISSUES' | 'FAIL' =
    hardErrors.length === 0 && warnings.length === 0
      ? 'PASS'
      : hardErrors.length === 0
      ? 'ISSUES'
      : 'FAIL';

  if (!isOpen) return null;

  return (
    <MotionModalDialog
      ariaLabel="Laporan Pemeriksaan Cepat Jadwal"
      panelStyle={{ maxWidth: '820px', width: '92vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
      onBackdropMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
        {/* Modal Head */}
        <div className="modal-head" style={{ borderBottom: '1px solid #e7e5da', paddingBottom: '14px' }}>
          <div className="modal-title-icon" style={{ background: statusType === 'PASS' ? '#e9f5ee' : statusType === 'FAIL' ? '#fdf0ee' : '#fdf8ec' }}>
            {statusType === 'PASS' ? (
              <ShieldCheck size={22} color="#1f6952" />
            ) : statusType === 'FAIL' ? (
              <ShieldAlert size={22} color="#b24c3d" />
            ) : (
              <AlertTriangle size={22} color="#a1752b" />
            )}
          </div>
          <div>
            <h2 style={{ fontSize: '18px', margin: 0, color: '#173637' }}>Ringkasan Pemeriksaan Jadwal</h2>
            <p style={{ margin: 0, fontSize: '11.5px', color: '#526861' }}>
              Hasil audit otomatis seluruh aturan wajib bebas bentrok dan preferensi jadwal
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Tutup dialog">
            <X size={18} />
          </button>
        </div>

        {/* Status Highlight Banner */}
        <div
          style={{
            margin: '16px 20px 0',
            padding: '14px 18px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: statusType === 'PASS' ? '#eff7f2' : statusType === 'FAIL' ? '#fdf2f0' : '#fdfaf2',
            border: `1px solid ${statusType === 'PASS' ? '#c3e5d0' : statusType === 'FAIL' ? '#f8d0c8' : '#f4e3c1'}`,
          }}
        >
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', color: statusType === 'PASS' ? '#1f6952' : statusType === 'FAIL' ? '#b24c3d' : '#a1752b' }}>
              {statusType === 'PASS' ? 'STATUS: LOLOS PEMERIKSAAN' : statusType === 'FAIL' ? 'STATUS: PERLU TINDAKAN SEGERA' : 'STATUS: LOLOS DENGAN CATATAN'}
            </div>
            <strong style={{ fontSize: '15px', color: '#173637' }}>
              {statusType === 'PASS'
                ? 'Semua aturan validasi terpenuhi. Jadwal siap diterbitkan.'
                : statusType === 'FAIL'
                ? `Ditemukan ${hardErrors.length} pelanggaran aturan wajib yang harus diperbaiki.`
                : `Tidak ada bentrok keras. Terdapat ${warnings.length} preferensi yang bisa dioptimalkan.`}
            </strong>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="button button-sm button-secondary" onClick={onRevalidate}>
              <RefreshCw size={13} /> Uji Ulang
            </button>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div style={{ display: 'flex', gap: '6px', padding: '14px 20px 0', overflowX: 'auto' }}>
          <button
            type="button"
            className={`filter-tab-btn ${activeCategory === 'all' ? 'active' : ''}`}
            onClick={() => setActiveCategory('all')}
          >
            Semua ({allIssues.length})
          </button>
          <button
            type="button"
            className={`filter-tab-btn ${activeCategory === 'teacher_clash' ? 'active' : ''}`}
            onClick={() => setActiveCategory('teacher_clash')}
          >
            <Users size={12} />
            Bentrok Guru ({categorized.teacher_clash.length})
          </button>
          <button
            type="button"
            className={`filter-tab-btn ${activeCategory === 'class_clash' ? 'active' : ''}`}
            onClick={() => setActiveCategory('class_clash')}
          >
            <GraduationCap size={12} />
            Bentrok Kelas ({categorized.class_clash.length})
          </button>
          <button
            type="button"
            className={`filter-tab-btn ${activeCategory === 'time_activity' ? 'active' : ''}`}
            onClick={() => setActiveCategory('time_activity')}
          >
            Waktu & Kegiatan ({categorized.time_activity.length})
          </button>
          <button
            type="button"
            className={`filter-tab-btn ${activeCategory === 'coverage' ? 'active' : ''}`}
            onClick={() => setActiveCategory('coverage')}
          >
            Alokasi & Kualifikasi ({categorized.coverage.length})
          </button>
        </div>

        {/* AI Explainer Box (Optional) */}
        {state.settings.geminiEnabled && (
          <div style={{ margin: '0 20px' }}>
            <AiConflictHelper
              issues={allIssues}
              geminiEnabledInSettings={state.settings.geminiEnabled}
              onNavigateToScreen={onNavigateToScreen}
              compact
            />
          </div>
        )}

        {/* Scrollable Issue List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px', minHeight: '180px' }}>
          {currentList.length === 0 ? (
            <div className="empty-state" style={{ padding: '30px' }}>
              <CheckCircle2 size={32} color="#1f6952" />
              <h3>Kategori ini bersih dari masalah</h3>
              <p>Tidak ada konflik atau peringatan yang ditemukan pada kelompok ini.</p>
            </div>
          ) : (
            <div className="issue-list">
              {currentList.map((issue) => {
                const isExpanded = expandedIssueId === issue.id;
                const isError = issue.severity === 'error';

                return (
                  <div key={issue.id} className={`issue-item issue-${issue.severity}`}>
                    <div
                      className="issue-item-main"
                      onClick={() => setExpandedIssueId(isExpanded ? null : issue.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="issue-severity-icon">
                        {isError ? <XCircle size={18} /> : <AlertTriangle size={18} />}
                      </div>
                      <div className="issue-copy">
                        <div className="issue-title-row">
                          <strong>{issue.title}</strong>
                          <span className="issue-code">{formatValidationCategoryLabel(issue.code)}</span>
                        </div>
                        <p>{issue.message}</p>
                        {issue.context && <span className="issue-context">{issue.context}</span>}
                      </div>
                      <ChevronDown
                        className={`issue-chevron ${isExpanded ? 'is-open' : ''}`}
                        size={17}
                      />
                    </div>

                    {isExpanded && (
                      <div className="issue-expanded" style={{ borderTop: '1px solid #f0eee6', padding: '12px 16px' }}>
                        <div>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: '#526861' }}>
                            REKOMENDASI PENYELESAIAN
                          </span>
                          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#274744' }}>
                            {issue.action || 'Periksa data terkait dan lakukan validasi ulang.'}
                          </p>
                        </div>
                        <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="button button-secondary"
                            style={{ height: '32px', fontSize: '11.5px', padding: '0 12px' }}
                            onClick={() => {
                              onClose();
                              if (issue.targetSlot && onNavigateToSlot) {
                                onNavigateToSlot(issue.targetSlot.classId, issue.targetSlot.day, issue.targetSlot.jpNo);
                              } else {
                                onNavigateToScreen(getTargetScreenForIssue(issue));
                              }
                            }}
                          >
                            {getActionLabelForIssue(issue)} <ArrowRight size={13} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Foot Actions */}
        <div
          style={{
            borderTop: '1px solid #e7e5da',
            padding: '12px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#faf8f2',
            borderRadius: '0 0 14px 14px',
          }}
        >
          <span style={{ fontSize: '11.5px', color: '#526861', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <FileCheck2 size={14} /> Pemeriksaan Terpadu SAKALA · Mengacu Data Aktif
          </span>
          <button className="button button-primary" onClick={onClose}>
            Tutup Laporan
          </button>
        </div>
    </MotionModalDialog>
  );
}
