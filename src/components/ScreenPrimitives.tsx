import type { ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Info,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { AppState, Day } from '../domain/types';
import { MotionModalDialog } from './KpiMotion';

export type ScreenId =
  | 'overview'
  | 'schedule'
  | 'workload'
  | 'attendance'
  | 'persuratan'
  | 'generator'
  | 'master'
  | 'requirements'
  | 'validation'
  | 'history'
  | 'backup'
  | 'settings';

export type MasterTab = 'classes' | 'teachers' | 'subjects';
export type AddType = 'class' | 'teacher' | 'subject' | null;
export interface EditSlotContext {
  classId: string;
  day: Day;
  jpNo: number;
}
export interface ToastData {
  message: string;
  kind: 'success' | 'warning' | 'error' | 'info';
}

export const emptyMasterForm = {
  name: '',
  level: 'VII',
  code: '',
  roleTitle: 'Guru Mapel',
  nip: '',
  gender: 'male' as 'male' | 'female',
  maxWeeklyJP: '24',
  selectedSubjectIds: [] as string[],
  color: '#2f7771',
};

export function titleForScreen(screen: ScreenId) {
  const titles: Record<ScreenId, string> = {
    overview: 'Ringkasan Operasional',
    schedule: 'Jadwal Pelajaran',
    workload: 'Statistik Beban Guru',
    attendance: 'Presensi Guru',
    persuratan: 'Pusat Persuratan & Arsip',
    generator: 'Penyusun Jadwal Otomatis',
    master: 'Data Master Madrasah',
    requirements: 'Kebutuhan & Alokasi JP',
    validation: 'Validasi & Kepatuhan Aturan',
    history: 'Riwayat Versi & Cadangan Data',
    backup: 'Ekspor & Cadangan Data',
    settings: 'Pengaturan Workspace',
  };
  return titles[screen] || 'SAKALA';
}

export function formatShortDate(dateString: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString));
}

export function getEntry(state: AppState, classId: string, day: Day, jpNo: number) {
  const entries = state.draft ?? state.activeSchedule ?? [];
  return entries.find(
    (entry) => entry.classId === classId && entry.day === day && entry.jpNo === jpNo,
  );
}

export function getSubject(state: AppState, id: string) {
  return state.subjects.find((subject) => subject.id === id);
}

export function getTeacher(state: AppState, id: string) {
  return state.teachers.find((teacher) => teacher.id === id);
}

export function getClass(state: AppState, id: string) {
  return state.classes.find((schoolClass) => schoolClass.id === id);
}

export function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-emblem">
        <img src="/sakala-mark.png" alt="Logo SAKALA" />
      </div>
      <div className="loading-line" />
      <h1>SAKALA</h1>
      <p>Menyiapkan ruang kerja madrasah Anda…</p>
    </div>
  );
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  onClick,
  disabled,
  type = 'button',
  className = '',
  title,
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger' | 'hero-ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: LucideIcon;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
  title?: string;
}) {
  const sizeClass = size === 'sm' ? 'button-sm' : size === 'lg' ? 'button-lg' : '';
  const iconSize = size === 'sm' ? 13 : size === 'lg' ? 17 : 15;
  return (
    <button
      type={type}
      disabled={disabled}
      title={title}
      className={`button button-${variant} ${sizeClass} ${className}`.trim()}
      onClick={onClick}
    >
      {Icon && <Icon size={iconSize} className="btn-icon" />}
      <span className="btn-label">{children}</span>
    </button>
  );
}

export function Card({
  children,
  className = '',
  title,
  eyebrow,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
}) {
  return (
    <section className={`surface-card s5-card-luxury ${className}`}>
      {(title || eyebrow || action) && (
        <div className="card-heading">
          <div>
            {eyebrow && <div className="card-eyebrow">{eyebrow}</div>}
            {title && <h3>{title}</h3>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatusPill({
  status,
  children,
  icon: CustomIcon,
  className = '',
}: {
  status: 'success' | 'warning' | 'danger' | 'neutral' | 'info';
  children: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  const Icon =
    CustomIcon ||
    (status === 'success'
      ? CheckCircle2
      : status === 'warning'
      ? AlertTriangle
      : status === 'danger'
      ? XCircle
      : status === 'info'
      ? Info
      : Activity);
  return (
    <span className={`status-pill status-${status} ${className}`.trim()} role="status">
      <Icon size={12} className="status-pill-icon" aria-hidden="true" />
      <span className="status-pill-text">{children}</span>
    </span>
  );
}

export function EmptyState({
  icon: Icon = CircleHelp,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={25} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function Modal({
  title,
  subtitle,
  icon: Icon,
  children,
  onClose,
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <MotionModalDialog
      ariaLabel={title}
      onBackdropMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head">
        <div className="modal-title-icon">
          <Icon size={20} />
        </div>
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Tutup dialog">
          <X size={17} />
        </button>
      </div>
      {children}
    </MotionModalDialog>
  );
}
