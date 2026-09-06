export default function PlaceholderPage({ title, subtitle, phase }) {
  return (
    <div style={{ padding: '32px 40px' }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>{title}</h1>
      {subtitle && (
        <p style={{ color: '#6b7280', marginTop: 6, maxWidth: 640 }}>{subtitle}</p>
      )}
      <div
        style={{
          marginTop: 24,
          padding: 20,
          border: '1px dashed #d1d5db',
          borderRadius: 8,
          color: '#9ca3af',
          fontSize: 14,
        }}
      >
        Screen shell — implemented in {phase}.
      </div>
    </div>
  );
}
