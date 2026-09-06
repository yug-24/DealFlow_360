import { useEffect, useRef, useState } from 'react';

// design.md §2: same three-color system everywhere the score appears.
const BAND_COLORS = {
  none: { bg: '#dcfce7', fg: '#166534', label: 'Auto-approved' },
  manager: { bg: '#fef3c7', fg: '#92400e', label: 'Needs Manager' },
  manager_finance: { bg: '#fee2e2', fg: '#991b1b', label: 'Needs Manager + Finance' },
};

export function ScoreBadge({ score, bandLabel }) {
  const c = BAND_COLORS[bandLabel] || BAND_COLORS.none;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      {typeof score === 'number' ? score.toFixed(1) : '—'} · {c.label}
    </span>
  );
}

const STATUS_COLORS = {
  Draft: { bg: '#f3f4f6', fg: '#374151' },
  PendingApproval: { bg: '#fef3c7', fg: '#92400e' },
  Approved: { bg: '#dcfce7', fg: '#166534' },
  UnderNegotiation: { bg: '#dbeafe', fg: '#1e40af' },
  Confirmed: { bg: '#e0e7ff', fg: '#3730a3' },
  Rejected: { bg: '#fee2e2', fg: '#991b1b' },
};

export function StatusPill({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.Draft;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {status}
    </span>
  );
}

/** design.md §2: briefly flash any value that just changed via a WebSocket update. */
export function useFlashOnChange(value) {
  const [flashing, setFlashing] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 400);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [value]);
  return flashing;
}

export function LiveValue({ value, style }) {
  const flashing = useFlashOnChange(value);
  return (
    <span
      style={{
        transition: 'background 0.3s',
        background: flashing ? '#fef9c3' : 'transparent',
        borderRadius: 4,
        padding: '0 2px',
        ...style,
      }}
    >
      {value}
    </span>
  );
}

export function Button({ children, variant = 'default', ...props }) {
  const variants = {
    default: { background: '#111827', color: '#fff', border: 'none' },
    outline: { background: '#fff', color: '#111827', border: '1px solid #d1d5db' },
    danger: { background: '#dc2626', color: '#fff', border: 'none' },
    subtle: { background: '#f3f4f6', color: '#374151', border: 'none' },
  };
  return (
    <button
      {...props}
      style={{
        padding: '8px 14px',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 500,
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        opacity: props.disabled ? 0.5 : 1,
        ...variants[variant],
        ...(props.style || {}),
      }}
    >
      {children}
    </button>
  );
}

export function Card({ children, style }) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 10,
        padding: 20,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div
      style={{
        background: '#fee2e2',
        color: '#991b1b',
        padding: '10px 14px',
        borderRadius: 8,
        fontSize: 13,
        marginBottom: 16,
      }}
    >
      {message}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22 }}>{title}</h1>
        {subtitle && <p style={{ color: '#6b7280', marginTop: 6, maxWidth: 640, fontSize: 13.5 }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8 }}>{actions}</div>}
    </div>
  );
}

export const th = { textAlign: 'left', padding: '8px 10px', fontSize: 12, color: '#6b7280', borderBottom: '1px solid #e5e7eb' };
export const td = { padding: '8px 10px', fontSize: 13.5, borderBottom: '1px solid #f3f4f6' };
