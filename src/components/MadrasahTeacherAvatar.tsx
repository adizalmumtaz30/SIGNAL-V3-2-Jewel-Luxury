import { useMemo } from 'react';
import type { Teacher } from '../domain/types';

/**
 * Intelligent gender detection for Indonesian Islamic Madrasah context
 */
export function detectTeacherGender(
  name: string,
  roleTitle?: string,
  explicitGender?: 'male' | 'female'
): 'male' | 'female' {
  if (explicitGender) return explicitGender;
  const text = `${name} ${roleTitle || ''}`.toLowerCase();

  const femalePatterns = [
    /\b(ibu|ustadzah|ustazah|ustz|hajjah|hj\.|dra\.|siti|nur|fatimah|rahmah|maryam|khadijah|aisyah|putri|dewi|ani|sri|wulandari|lestari|indri|zahra|wardah|mutmainah|fadilah|aminah|sholehah|fitria|kurnia|zulaiha|hasanah|azizah|mardiah|nadia|safitri|khoiriyah|marhamah|sholihat|nisa|salma|latifah|muthiah)\b/i,
  ];

  for (const pattern of femalePatterns) {
    if (pattern.test(text)) return 'female';
  }

  return 'male';
}

interface MadrasahTeacherAvatarProps {
  teacher: Teacher;
  size?: number;
  showStatusDot?: boolean;
  className?: string;
}

export function MadrasahTeacherAvatar({
  teacher,
  size = 40,
  showStatusDot = true,
  className = '',
}: MadrasahTeacherAvatarProps) {
  const gender = useMemo(
    () => detectTeacherGender(teacher.name, teacher.roleTitle, teacher.gender),
    [teacher.name, teacher.roleTitle, teacher.gender]
  );

  // Deterministic variant (0, 1, 2)
  const variantIndex = useMemo(() => {
    let hash = 0;
    const str = teacher.id || teacher.code || teacher.name;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % 3;
  }, [teacher.id, teacher.code, teacher.name]);

  const uniqueId = `avatar-${(teacher.id || 't').replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <div
      className={`madrasah-avatar-container ${className}`}
      style={{
        position: 'relative',
        width: `${size}px`,
        height: `${size}px`,
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      title={`${teacher.name} (${gender === 'male' ? 'Asatidz / Guru Putra' : 'Ustadzah / Guru Putri'})`}
    >
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        style={{ borderRadius: `${Math.round(size * 0.28)}px`, overflow: 'hidden' }}
        aria-hidden="true"
      >
        <defs>
          {/* Male Background Gradients */}
          <linearGradient id={`${uniqueId}-bg-male-0`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0b2e25" />
            <stop offset="100%" stopColor="#164d3f" />
          </linearGradient>
          <linearGradient id={`${uniqueId}-bg-male-1`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#113347" />
            <stop offset="100%" stopColor="#1e5473" />
          </linearGradient>
          <linearGradient id={`${uniqueId}-bg-male-2`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#302410" />
            <stop offset="100%" stopColor="#54401c" />
          </linearGradient>

          {/* Female Background Gradients */}
          <linearGradient id={`${uniqueId}-bg-female-0`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0d352b" />
            <stop offset="100%" stopColor="#226654" />
          </linearGradient>
          <linearGradient id={`${uniqueId}-bg-female-1`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1e2c45" />
            <stop offset="100%" stopColor="#31486f" />
          </linearGradient>
          <linearGradient id={`${uniqueId}-bg-female-2`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#381c30" />
            <stop offset="100%" stopColor="#633256" />
          </linearGradient>

          {/* Songkok Black Velvet Gradient */}
          <linearGradient id={`${uniqueId}-peci-grad`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#14171a" />
            <stop offset="45%" stopColor="#242b31" />
            <stop offset="100%" stopColor="#111316" />
          </linearGradient>

          {/* Female Hijab Gradients */}
          <linearGradient id={`${uniqueId}-hijab-0`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#296253" />
            <stop offset="100%" stopColor="#173c33" />
          </linearGradient>
          <linearGradient id={`${uniqueId}-hijab-1`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2d4a6f" />
            <stop offset="100%" stopColor="#172b44" />
          </linearGradient>
          <linearGradient id={`${uniqueId}-hijab-2`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e2ede8" />
            <stop offset="100%" stopColor="#b6cfc6" />
          </linearGradient>
        </defs>

        {/* Outer Base with Specular Rim */}
        <rect
          x="1"
          y="1"
          width="98"
          height="98"
          rx="26"
          fill={`url(#${uniqueId}-bg-${gender}-${variantIndex})`}
          stroke="rgba(212, 175, 55, 0.45)"
          strokeWidth="1.5"
        />
        <rect
          x="3"
          y="3"
          width="94"
          height="94"
          rx="24"
          fill="none"
          stroke="rgba(255, 255, 255, 0.2)"
          strokeWidth="0.8"
        />

        {/* Subtle geometric star watermark in background */}
        <g opacity="0.12" stroke="#d4af37" strokeWidth="1" fill="none">
          <circle cx="50" cy="50" r="32" strokeDasharray="3 3" />
          <polygon points="50,22 62,38 78,50 62,62 50,78 38,62 22,50 38,38" />
        </g>

        {gender === 'male' ? (
          /* ================= GURU LAKI-LAKI (ASATIDZ DENGAN SONGKOK) ================= */
          <g>
            {/* Shoulders & Official Madrasah/Kemenag Uniform */}
            <path
              d="M 12 100 C 12 76, 26 68, 38 66 L 50 78 L 62 66 C 74 68, 88 76, 88 100 Z"
              fill="#0d231e"
            />
            {/* White Collar & Tie */}
            <polygon points="50,68 44,78 50,94 56,78" fill="#eaf3ee" />
            <polygon points="50,78 48,94 52,94" fill="#15803d" />
            <polygon points="41,66 48,76 39,72" fill="#ffffff" />
            <polygon points="59,66 52,76 61,72" fill="#ffffff" />

            {/* Neck */}
            <rect x="44" y="56" width="12" height="14" rx="2" fill="#f0c6a8" />

            {/* Face */}
            <ellipse cx="50" cy="46" rx="17" ry="19" fill="#f8d4bc" />
            {/* Ears */}
            <ellipse cx="32" cy="48" rx="3" ry="5" fill="#f0c6a8" />
            <ellipse cx="68" cy="48" rx="3" ry="5" fill="#f0c6a8" />

            {/* Eyebrows & Eyes */}
            <path d="M 40 43 Q 44 41 47 43" stroke="#2c1a0e" strokeWidth="1.6" fill="none" strokeLinecap="round" />
            <path d="M 53 43 Q 56 41 60 43" stroke="#2c1a0e" strokeWidth="1.6" fill="none" strokeLinecap="round" />
            <circle cx="43.5" cy="47" r="1.8" fill="#1e130c" />
            <circle cx="56.5" cy="47" r="1.8" fill="#1e130c" />

            {/* Gentle dignified smile */}
            <path d="M 46 54 Q 50 57 54 54" stroke="#8c4e33" strokeWidth="1.4" fill="none" strokeLinecap="round" />

            {/* Optional Intellectual Glasses (Variant 1) */}
            {variantIndex === 1 && (
              <g stroke="#d4af37" strokeWidth="1.2" fill="none">
                <rect x="38" y="42" width="10" height="9" rx="2.5" fill="rgba(255,255,255,0.2)" />
                <rect x="52" y="42" width="10" height="9" rx="2.5" fill="rgba(255,255,255,0.2)" />
                <path d="M 48 46 L 52 46" />
                <path d="M 38 46 L 33 44" />
                <path d="M 62 46 L 67 44" />
              </g>
            )}

            {/* Songkok Hitam Beludru Khas Nasional/Madrasah */}
            <path
              d="M 28 35 C 28 32, 72 32, 72 35 L 75 16 C 75 14, 60 12, 50 12 C 40 12, 25 14, 25 16 Z"
              fill={`url(#${uniqueId}-peci-grad)`}
            />
            {/* Specular sheen on songkok */}
            <path
              d="M 30 18 C 38 15, 62 15, 70 18"
              stroke="rgba(255,255,255,0.35)"
              strokeWidth="1.2"
              fill="none"
              strokeLinecap="round"
            />
            {/* Songkok Lower Gold Thread Accent */}
            <path
              d="M 28 35 C 38 37, 62 37, 72 35"
              stroke="#d4af37"
              strokeWidth="0.9"
              fill="none"
            />
          </g>
        ) : (
          /* ================= GURU PEREMPUAN (USTADZAH DENGAN HIJAB) ================= */
          <g>
            {/* Modest Hijab Drapery (Chest & Shoulders) */}
            <path
              d="M 12 100 C 12 74, 24 64, 34 60 C 44 68, 56 68, 66 60 C 76 64, 88 74, 88 100 Z"
              fill={`url(#${uniqueId}-hijab-${variantIndex})`}
            />

            {/* Hijab Head Section (Smooth Flowing Arch) */}
            <path
              d="M 28 54 C 27 34, 34 16, 50 16 C 66 16, 73 34, 72 54 C 71 68, 65 78, 50 82 C 35 78, 29 68, 28 54 Z"
              fill={`url(#${uniqueId}-hijab-${variantIndex})`}
            />

            {/* Inner Cap (Ciput Rapi) */}
            <path
              d="M 37 32 C 43 28, 57 28, 63 32 C 60 35, 40 35, 37 32 Z"
              fill={variantIndex === 2 ? '#173c33' : '#d8ece3'}
            />

            {/* Face Cutout */}
            <ellipse cx="50" cy="46" rx="14.5" ry="16.5" fill="#fbe1ce" />

            {/* Eyebrows & Eyes */}
            <path d="M 41 41 Q 44 39.5 47 41" stroke="#331c12" strokeWidth="1.4" fill="none" strokeLinecap="round" />
            <path d="M 53 41 Q 56 39.5 59 41" stroke="#331c12" strokeWidth="1.4" fill="none" strokeLinecap="round" />
            <circle cx="44" cy="45.5" r="1.6" fill="#24150c" />
            <circle cx="56" cy="45.5" r="1.6" fill="#24150c" />

            {/* Friendly and gentle expression */}
            <path d="M 46.5 52 Q 50 55 53.5 52" stroke="#a3543b" strokeWidth="1.3" fill="none" strokeLinecap="round" />

            {/* Royal Gold Brooch (Bros Simpatika Emas di Dada) */}
            <g transform="translate(50, 72) scale(0.9)">
              <circle cx="0" cy="0" r="4" fill="#f1cf68" stroke="#d4af37" strokeWidth="0.8" />
              <polygon points="0,-3 2,0 0,3 -2,0" fill="#996515" />
            </g>
          </g>
        )}
      </svg>

      {/* Online/Active Micro Status Dot */}
      {showStatusDot && (
        <span
          className={`madrasah-avatar-status ${teacher.isActive ? 'active' : 'inactive'}`}
          style={{
            position: 'absolute',
            bottom: '-1px',
            right: '-1px',
            width: `${Math.max(8, Math.round(size * 0.24))}px`,
            height: `${Math.max(8, Math.round(size * 0.24))}px`,
            borderRadius: '50%',
            background: teacher.isActive ? '#16a34a' : '#94a3b8',
            border: '2px solid #ffffff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }}
          title={teacher.isActive ? 'Status: Aktif' : 'Status: Nonaktif'}
        />
      )}
    </div>
  );
}
