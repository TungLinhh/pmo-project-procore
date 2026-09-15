// Cursor-tracking tooltip - xuất hiện mượt theo vị trí chuột
// Cách dùng:
//   <CursorTooltip anchor={event} visible={true}>content</CursorTooltip>
//   anchor: React MouseEvent từ onMouseEnter / onMouseMove
// Hoặc dùng helper: <CursorTooltip content="..." watch={[data]} />
import { useState, useRef, useEffect } from 'react';

export default function CursorTooltip({ anchor, visible = true, children, offset = { x: 12, y: 12 } }) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef(null);

  useEffect(() => {
    if (!anchor) return;
    const move = (e) => {
      const x = e.clientX + (offset.x || 12);
      const y = e.clientY + (offset.y || 12);
      // Clamp to viewport
      const w = ref.current?.offsetWidth || 200;
      const h = ref.current?.offsetHeight || 100;
      const maxX = window.innerWidth - w - 8;
      const maxY = window.innerHeight - h - 8;
      setPos({
        x: Math.min(x, maxX),
        y: Math.min(y, maxY),
      });
    };
    // Use latest mouse position
    move(anchor);
    const el = anchor.currentTarget || anchor.target;
    if (el && el.addEventListener) {
      el.addEventListener('mousemove', move);
      return () => el.removeEventListener('mousemove', move);
    }
  }, [anchor, offset.x, offset.y]);

  if (!visible) return null;
  return (
    <div
      ref={ref}
      className="cursor-tooltip"
      style={{
        position: 'fixed',
        top: pos.y,
        left: pos.x,
        zIndex: 1000,
        pointerEvents: 'none',
      }}
    >
      {children}
    </div>
  );
}
