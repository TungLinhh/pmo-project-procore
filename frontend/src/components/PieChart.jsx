// SVG-based pie/donut chart - với cursor-tracking tooltip
// Khi hover vào 1 slice, hiện tooltip breakdown ngay vị trí chuột
import { useState, useRef } from 'react';

export default function PieChart({ data, size = 88, thickness = 16, centerText, centerSub }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const radius = size / 2;
  const innerRadius = radius - thickness;
  const cx = radius, cy = radius;
  let acc = 0;

  function arc(startAngle, endAngle) {
    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy + radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(endAngle);
    const y2 = cy + radius * Math.sin(endAngle);
    const x3 = cx + innerRadius * Math.cos(endAngle);
    const y3 = cy + innerRadius * Math.sin(endAngle);
    const x4 = cx + innerRadius * Math.cos(startAngle);
    const y4 = cy + innerRadius * Math.sin(startAngle);
    const large = endAngle - startAngle > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 ${large} 0 ${x4} ${y4} Z`;
  }

  const hovered = hoverIdx != null ? data[hoverIdx] : null;
  const hoveredPct = hovered ? Math.round(hovered.value / total * 100) : 0;

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'inline-block' }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {data.map((d, i) => {
          if (d.value <= 0) return null;
          const startAngle = (acc / total) * Math.PI * 2 - Math.PI / 2;
          acc += d.value;
          const endAngle = (acc / total) * Math.PI * 2 - Math.PI / 2;
          const path = arc(startAngle, endAngle);
          const isHover = hoverIdx === i;
          return (
            <path
              key={i}
              d={path}
              fill={d.color}
              stroke="white"
              strokeWidth={1.5}
              opacity={hoverIdx == null || isHover ? 1 : 0.6}
              style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
              onMouseEnter={(e) => {
                setHoverIdx(i);
                setTooltipPos({ x: e.clientX, y: e.clientY });
              }}
              onMouseMove={(e) => {
                setTooltipPos({ x: e.clientX, y: e.clientY });
              }}
            >
              <title>{d.label}: {d.value}{d.suffix || ''} ({hoveredPct}%)</title>
            </path>
          );
        })}
      </svg>
      {centerText && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center', pointerEvents: 'none',
        }}>
          <div style={{ fontSize: size > 100 ? 22 : 16, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: 'var(--c-text)' }}>
            {centerText}
          </div>
          {centerSub && <div style={{ fontSize: 10, color: 'var(--c-text-2)', marginTop: 2 }}>{centerSub}</div>}
        </div>
      )}
      {/* Cursor-tracking tooltip - offset đủ xa để không đè chữ */}
      {hovered && (
        <div
          className="cursor-tooltip"
          style={{
            position: 'fixed',
            top: tooltipPos.y + 18,
            left: tooltipPos.x + 18,
            zIndex: 1000,
            pointerEvents: 'none',
            minWidth: 180,
            maxWidth: 280,
            transform: 'translate(0, 0)',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{hovered.label}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: 'var(--c-text-2)' }}>Value</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{hovered.value}{hovered.suffix || ''}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: 'var(--c-text-2)' }}>%</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{hoveredPct}%</span>
          </div>
          {hovered.breakdown && hovered.breakdown.length > 0 && (
            <div style={{ borderTop: '1px solid var(--c-border)', marginTop: 4, paddingTop: 4 }}>
              {hovered.breakdown.map((b, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: 'var(--c-text-2)' }}>{b.k}</span>
                  <span>{b.v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
