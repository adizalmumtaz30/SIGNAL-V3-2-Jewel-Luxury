import type { Teacher } from '../domain/types';
import { MadrasahTeacherAvatar } from './MadrasahTeacherAvatar';

const MALE_PREVIEW_TEACHER: Teacher = {
  id: 'gender-preview-male',
  name: 'Asatidz',
  code: 'L',
  gender: 'male',
  maxWeeklyJP: 24,
  subjectIds: [],
  isActive: true,
};

const FEMALE_PREVIEW_TEACHER: Teacher = {
  id: 'gender-preview-female',
  name: 'Ustadzah',
  code: 'P',
  gender: 'female',
  maxWeeklyJP: 24,
  subjectIds: [],
  isActive: true,
};

export interface TeacherGenderToggleProps {
  value: 'male' | 'female';
  onChange: (next: 'male' | 'female') => void;
  compact?: boolean;
}

/**
 * Editorial SVG Avatar Selector replacing raw emojis across Master & Inspector forms.
 */
export function TeacherGenderToggle({ value, onChange, compact = false }: TeacherGenderToggleProps) {
  const isFemale = value === 'female';
  const avatarSize = compact ? 18 : 22;

  return (
    <div className={`s5-teacher-gender-group ${compact ? 'is-compact' : ''}`} role="radiogroup" aria-label="Profil avatar madrasah">
      <button
        type="button"
        role="radio"
        aria-checked={!isFemale}
        onClick={() => onChange('male')}
        className={`s5-teacher-gender-btn ${!isFemale ? 'is-active' : ''}`}
      >
        <MadrasahTeacherAvatar teacher={MALE_PREVIEW_TEACHER} size={avatarSize} showStatusDot={false} />
        <span>{compact ? 'Asatidz' : 'Asatidz (Songkok / Peci)'}</span>
      </button>

      <button
        type="button"
        role="radio"
        aria-checked={isFemale}
        onClick={() => onChange('female')}
        className={`s5-teacher-gender-btn ${isFemale ? 'is-active' : ''}`}
      >
        <MadrasahTeacherAvatar teacher={FEMALE_PREVIEW_TEACHER} size={avatarSize} showStatusDot={false} />
        <span>{compact ? 'Ustadzah' : 'Ustadzah (Hijab / Jilbab)'}</span>
      </button>
    </div>
  );
}
