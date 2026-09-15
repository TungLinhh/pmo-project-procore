// PieChart tooltip - hiển thị breakdown chi tiết khi hover
import { useState, useRef, useEffect } from 'react';

export default function PieTooltip({ data }) {
  // Show first slice as default; user can mouse into tooltip to see other rows
  const [activeIdx, setActiveIdx] = useState(0);
  const ref = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    // Position tooltip next to the pie
    if (ref.current) {
      const parent = ref.current.parentElement;
      if (parent) {
        const r = parent.getBoundingClientRect();
        setPos({ top: 0, left: r.width + 8 });
      }
    }
  }, []);

  const active = data[activeIdx] || data[0];
  if (!active) return null;
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const totalPct = Math.round(active.value / total * 100);

  return (
    <div
      ref={ref}
      className="pie-tooltip"
      style={{ top: pos.top, left: pos.left }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
        {data.map((d, i) => (
          <div
            key={i}
            onMouseEnter={() => setActiveIdx(i)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              cursor: 'pointer', padding: '2px 0',
              fontWeight: i === activeIdx ? 600 : 400,
              opacity: i === activeIdx ? 1 : 0.85,
            }}
          >
            <span className="swatch" style={{ background: d.color }} />
            <span style={{ flex: 1 }}>{d.label}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{d.value} · {Math.round(d.value / total * 100)}%</span>
          </div>
        ))}
      </div>
      {active.breakdown && active.breakdown.length > 0 && (
        <div className="breakdown">
          {active.breakdown.map((b, i) => (
            <div key={i} className="row">
              <span className="k">{b.k}</span>
              <span className="v">{b.v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
