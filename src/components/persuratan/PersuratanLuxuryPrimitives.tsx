import './PersuratanLuxuryPrimitives.css';

/**
 * Bespoke editorial SVG illustration for empty Persuratan archive state.
 * Designed in Sovereign Emerald (#0B2923 / #124037) + Burnished Gold (#C5A059)
 * on Alabaster Porcelain (#F8FAF7).
 */
export function AtelierEmptyArchiveSvg({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      width="136"
      height="104"
      viewBox="0 0 136 104"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Subtle porcelain halo */}
      <ellipse cx="68" cy="86" rx="48" ry="10" fill="#E6EFEA" />
      <circle cx="68" cy="46" r="38" fill="#F2F7F4" stroke="#DCE7E1" strokeWidth="1" />

      {/* Back folio sheet */}
      <rect
        x="38"
        y="22"
        width="52"
        height="64"
        rx="7"
        transform="rotate(-7 38 22)"
        fill="#FFFFFF"
        stroke="#CAD8D0"
        strokeWidth="1.2"
      />

      {/* Right folio sheet */}
      <rect
        x="52"
        y="20"
        width="52"
        height="64"
        rx="7"
        transform="rotate(6 52 20)"
        fill="#FCFDFB"
        stroke="#CAD8D0"
        strokeWidth="1.2"
      />

      {/* Center hero manuscript */}
      <rect
        x="42"
        y="16"
        width="52"
        height="68"
        rx="7"
        fill="#FFFFFF"
        stroke="#124037"
        strokeWidth="1.4"
      />

      {/* Official letterhead top gold bar */}
      <rect x="49" y="24" width="38" height="3.5" rx="1.75" fill="#124037" />
      <line x1="49" y1="31" x2="87" y2="31" stroke="#C5A059" strokeWidth="1.2" />

      {/* Crisp typography skeleton lines */}
      <rect x="49" y="38" width="24" height="2.5" rx="1.25" fill="#9EB3AB" />
      <rect x="49" y="44" width="38" height="2.2" rx="1.1" fill="#D5E0DA" />
      <rect x="49" y="49" width="34" height="2.2" rx="1.1" fill="#D5E0DA" />
      <rect x="49" y="54" width="28" height="2.2" rx="1.1" fill="#D5E0DA" />

      {/* Sovereign wax seal crest */}
      <circle cx="80" cy="69" r="9.5" fill="#0B2923" stroke="#C5A059" strokeWidth="1.4" />
      <path
        d="M76.5 69.2L78.9 71.6L83.8 66.5"
        stroke="#E5C378"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Fine architectural sparkle accents */}
      <path
        d="M27 34L28.4 37.6L32 39L28.4 40.4L27 44L25.6 40.4L22 39L25.6 37.6L27 34Z"
        fill="#C5A059"
        fillOpacity="0.65"
      />
      <circle cx="109" cy="29" r="2.2" fill="#C5A059" fillOpacity="0.55" />
    </svg>
  );
}

/**
 * Corner hairline filigree SVG overlay for Obsidian Emerald signature plaques.
 */
export function AtelierPlaqueFiligree() {
  return (
    <svg
      className="p5-plaque-filigree"
      viewBox="0 0 400 110"
      preserveAspectRatio="none"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="378" cy="18" r="56" stroke="#C5A059" strokeOpacity="0.16" strokeWidth="1" />
      <circle cx="378" cy="18" r="36" stroke="#E5C378" strokeOpacity="0.14" strokeWidth="0.75" />
      <path
        d="M14 26V14H26M386 84V96H374"
        stroke="#E5C378"
        strokeOpacity="0.45"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Subtle Madrasah archival seal icon ornament for headers & empty studio states.
 */
export function AtelierSealWatermarkSvg({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="18" cy="18" r="16" stroke="#C5A059" strokeWidth="1.2" strokeOpacity="0.7" />
      <circle cx="18" cy="18" r="12.5" stroke="#124037" strokeWidth="0.9" strokeDasharray="2 2" strokeOpacity="0.45" />
      <path
        d="M18 9.5L20.4 14.4L25.8 15.2L21.9 19L22.8 24.4L18 21.8L13.2 24.4L14.1 19L10.2 15.2L15.6 14.4L18 9.5Z"
        stroke="#C5A059"
        strokeWidth="1.2"
        strokeLinejoin="round"
        fill="#C5A059"
        fillOpacity="0.14"
      />
    </svg>
  );
}
