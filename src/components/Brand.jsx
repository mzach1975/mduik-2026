import { useId } from 'react';

/** The official MDUIK logo (public/images/mduik.jpg). */
export function BrandMark({ size = 42, className = '' }) {
  return (
    <span className={`brandmark ${className}`.trim()} style={{ width: size, height: size }} aria-hidden="true">
      <img src="/images/mduik.jpg" alt="" width={size} height={size} />
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
