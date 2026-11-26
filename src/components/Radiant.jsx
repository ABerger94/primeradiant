// The emblem: orbits of an instrument around a bright core.
export default function Radiant({ size = 28, spin = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={spin ? 'motion-safe:animate-[spin_90s_linear_infinite]' : ''}>
      <g fill="none" stroke="var(--color-gold)" strokeWidth="1.6" opacity="0.9">
        <circle cx="32" cy="32" r="22" />
        <ellipse cx="32" cy="32" rx="22" ry="8.5" transform="rotate(-30 32 32)" />
        <ellipse cx="32" cy="32" rx="22" ry="8.5" transform="rotate(30 32 32)" />
        <ellipse cx="32" cy="32" rx="22" ry="8.5" transform="rotate(90 32 32)" opacity="0.5" />
      </g>
      <circle cx="32" cy="32" r="3.6" fill="var(--color-gold-bright)" />
    </svg>
  );
}
