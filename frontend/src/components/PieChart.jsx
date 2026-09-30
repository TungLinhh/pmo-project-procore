// SVG-based pie/donut chart - với cursor-tracking tooltip
// Khi hover vào 1 slice, hiện tooltip breakdown ngay vị trí chuột
import { useState } from 'react';
import { t } from '../i18n/index.js';

export default function PieChart({ data, size = 88, thickness = 16, centerText, centerSub }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const radius = size / 2;
  const innerRadius = radius - thickness;
  const cx = radius, cy = radius;
  // Góc bắt đầu/kết thúc tính **thuần** từ `data`, không dùng biến `let` tích luỹ
  // bị gán lại bên trong `.map()` lúc render. Biến như vậy sai về vòng đời: khi
  // React Compiler ghi nhớ kết quả render, `acc` có thể mang giá trị của lần
  // render trước và các lát cung vẽ sai. `slice` dùng `running` riêng nên không
  // giao nhau.
  const fullCircle = Math.PI * 2;
  const startOffset = -Math.PI / 2;
  const arcs = data.reduce((rows, d, index) => {
    const prev = rows.length ? rows[rows.length - 1] : null;
    const start = prev ? prev.end : startOffset;
    const end = start + (d.value / total) * fullCircle;
    rows.push({ d, index, start, end });
    return rows;
  }, []);

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
        {arcs.map(({ d, index: i, start: startAngle, end: endAngle }) => {
          if (d.value <= 0) return null;
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
              <title>{d.label}: {d.value}{d.suffix || ''} ({Math.round(d.value / total * 100)}%)</title>
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
      {/* Tooltip: nhãn tiếng Việt, gọn, và kẹp trong khung nhìn để không tràn
      ra ngoài mép phải/dưới màn hình. */}
      {hovered && (() => {
        const w = 190;
        const h = hovered.breakdown?.length ? 44 + hovered.breakdown.length * 16 : 62;
        const left = Math.min(Math.max(8, tooltipPos.x + 16), (typeof window !== 'undefined' ? window.innerWidth : 1024) - w - 8);
        const top = Math.min(Math.max(8, tooltipPos.y + 16), (typeof window !== 'undefined' ? window.innerHeight : 768) - h - 8);
        return (
          <div className="cursor-tooltip" style={{ position: 'fixed', top, left, zIndex: 1000, pointerEvents: 'none', minWidth: 150, maxWidth: 210 }}>
            <div style={{ fontWeight: 600, marginBottom: 3, fontSize: 12 }}>{hovered.label}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11 }}>
              <span style={{ color: 'var(--c-text-2)' }}>{t('pie.lbl_qty')}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{hovered.value}{hovered.suffix || ''}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11 }}>
              <span style={{ color: 'var(--c-text-2)' }}>{t('pie.lbl_ratio')}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{hoveredPct}%</span>
            </div>
            {hovered.breakdown && hovered.breakdown.length > 0 && (
              <div style={{ borderTop: '1px solid var(--c-border)', marginTop: 3, paddingTop: 3 }}>
                {hovered.breakdown.map((b, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11 }}>
                    <span style={{ color: 'var(--c-text-2)' }}>{b.k}</span>
                    <span>{b.v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
