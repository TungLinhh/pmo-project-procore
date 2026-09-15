// ProjectPicker — Combobox thay thế <select>:
//   - Search realtime theo code / name_vi / name_en
//   - Sort theo code A-Z (mặc định) hoặc name
//   - Keyboard navigation: ↑↓ Enter Esc
//   - Hiển thị: code — name_vi
//
// API: projects.list()  →  [{ id, code, name_vi, name_en, ... }]
// Props: value (id | null), onChange (id), placeholder, allowAll
//
// MVP: chưa có favorites/recent (sẽ làm ở v2)

import { useEffect, useRef, useState, useMemo } from 'react';
import { projects as api } from '../api/index.js';

export default function ProjectPicker({ value, onChange, placeholder = 'Chọn dự án...', allowAll = false }) {
  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [loading, setLoading] = useState(true);
  const ref = useRef(null);

  // Load + sort ABC
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.list();
        if (!cancelled) {
          list.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
          setProjects(list);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Filter
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return projects;
    return projects.filter(p =>
      (p.code || '').toLowerCase().includes(q) ||
      (p.name_vi || '').toLowerCase().includes(q) ||
      (p.name_en || '').toLowerCase().includes(q)
    );
  }, [search, projects]);

  // URL params arrive as strings while API ids are numbers — normalize once.
  const numValue = value === null || value === undefined || value === '' ? null : Number(value);
  const selected = projects.find(p => p.id === numValue);

  // Close on outside click
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const choose = (id) => {
    onChange(id);
    setOpen(false);
    setSearch('');
  };

  const onKeyDown = (e) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') { setOpen(true); e.preventDefault(); }
      return;
    }
    if (e.key === 'ArrowDown') { setHighlight(h => Math.min(h + 1, Math.max(filtered.length - 1, 0))); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { setHighlight(h => Math.max(h - 1, 0)); e.preventDefault(); }
    else if (e.key === 'Enter') { if (filtered[highlight]) choose(filtered[highlight].id); e.preventDefault(); }
    else if (e.key === 'Escape') { setOpen(false); e.preventDefault(); }
  };

  return (
    <div className="project-picker" ref={ref}>
      <input
        type="text"
        className="project-picker-input"
        value={open ? search : (selected ? `${selected.code} — ${selected.name_vi || selected.name_en}` : '')}
        placeholder={loading ? 'Đang tải...' : placeholder}
        onChange={e => { setSearch(e.target.value); setOpen(true); setHighlight(0); }}
        onFocus={() => { setOpen(true); setSearch(''); }}
        onKeyDown={onKeyDown}
        disabled={loading}
      />
      {open && (
        <div className="project-picker-dropdown">
          {allowAll && (
            <div
              className={`project-picker-item ${numValue === null ? 'active' : ''}`}
              onMouseDown={() => choose(null)}
            >
              Tất cả dự án
            </div>
          )}
          {filtered.length === 0 && (
            <div className="project-picker-empty">Không tìm thấy</div>
          )}
          {filtered.map((p, idx) => (
            <div
              key={p.id}
              className={`project-picker-item ${numValue === p.id ? 'active' : ''} ${highlight === idx ? 'highlight' : ''}`}
              onMouseDown={() => choose(p.id)}
              onMouseEnter={() => setHighlight(idx)}
            >
              <span className="pp-code">{p.code}</span>
              <span className="pp-name">{p.name_vi || p.name_en || `Project ${p.id}`}</span>
            </div>
          ))}
          <div className="project-picker-footer">
            {filtered.length} / {projects.length} dự án
            {search && ` · gõ để lọc`}
          </div>
        </div>
      )}
    </div>
  );
}
