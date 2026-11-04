import { useId } from 'react';

const INK = '#171b17';
const DOME = '#0e8a4f';
const PAPER = '#f4f1e8';

/**
 * A vector interpretation of the MDUIK mark supplied for this refresh:
 * a green pointed dome over interlocking black arches.
 */
export function BrandMark({ size = 42, className = '' }) {
  return (
    <span
      className={`brandmark ${className}`.trim()}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 64" width={size} height={size} fill="none" focusable="false">
        <rect x="1" y="1" width="62" height="62" rx="15" fill={PAPER} />
        <path
          d="M32 7.5c-6.4 4.5-10.2 9.5-10.2 15.6V29h20.4v-5.9c0-6.1-3.8-11.1-10.2-15.6Z"
          fill={DOME}
          stroke={INK}
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
        <path d="M32 4.8v3.2" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
        <path
          d="M7.5 53V40.4C7.5 32.2 13.4 25.5 21.3 25.5s13.8 6.7 13.8 14.9V53"
          stroke={INK}
          strokeWidth="3.1"
          strokeLinecap="round"
        />
        <path
          d="M21 53V40.9c0-8.2 5.9-14.9 13.8-14.9s13.8 6.7 13.8 14.9V53"
          stroke={INK}
          strokeWidth="3.1"
          strokeLinecap="round"
        />
        <path
          d="M34.4 53V40.4c0-8.2 5.9-14.9 13.8-14.9s13.8 6.7 13.8 14.9V53"
          stroke={INK}
          strokeWidth="3.1"
          strokeLinecap="round"
        />
        <path d="M6 56.5h52" stroke={INK} strokeWidth="2.3" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/**
 * An eight-point geometric lattice, drawn once and reused behind dark
 * institutional surfaces. Colour comes from the surrounding text colour.
 */
export function GeoPattern({ className = '' }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const patternID = `mduik-geo-${uid}`;

  return (
    <svg
      className={`geo-pattern ${className}`.trim()}
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="none"
    >
      <defs>
        <pattern id={patternID} width="72" height="72" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="currentColor" strokeWidth="1">
            <path d="M36 0 72 36 36 72 0 36Z" />
            <path d="M36 8 64 36 36 64 8 36Z" />
            <path d="M36 16 56 36 36 56 16 36Z" />
            <path d="M0 0 72 72M72 0 0 72" opacity=".38" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternID})`} />
    </svg>
  );
}

export function Brand({ compact = false, light = false }) {
  return (
    <span className={`brand ${light ? 'brand--light' : ''}`.trim()}>
      <BrandMark size={42} />
      {!compact && (
        <span className="brand__text">
          <strong>MDUIK</strong>
          <small>Sistem Pentadbiran Sekolah</small>
        </span>
      )}
    </span>
  );
}
