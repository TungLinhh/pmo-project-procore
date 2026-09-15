// Icon đơn sắc inline SVG - giới hạn, dùng ở menu + KPI. 1.5px stroke, 16x16.
// Thêm icon mới: chỉ khi thực sự cần.

const I = (path, viewBox = '0 0 16 16') => function Icon({ size = 16, strokeWidth = 1.5, className = '' }) {
  return (
    <svg width={size} height={size} viewBox={viewBox} fill="none"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      {path}
    </svg>
  );
};

// Sidebar / menu
export const ICON = {
  dashboard: I(<><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></>),
  projects: I(<><path d="M2 14V6l4-3 4 3v8" /><path d="M14 14V9l-3-2-3 2v5" /><path d="M2 14h12" /></>),
  progress: I(<><path d="M2 12l3-3 3 2 4-5 2 2" /><path d="M2 14h12" /></>),
  shop: I(<><rect x="2" y="2" width="12" height="12" rx="1" /><path d="M2 6h12M6 2v12" /></>),
  materials: I(<><path d="M2 5l6-3 6 3v8l-6 3-6-3z" /><path d="M2 5l6 3 6-3M8 8v8" /></>),
  manpower: I(<><circle cx="6" cy="5" r="2" /><circle cx="11" cy="6" r="1.5" /><path d="M2 13c0-2 2-3 4-3s4 1 4 3" /><path d="M10 13c0-1.5 1-2.5 3-2.5" /></>),
  payment: I(<><rect x="2" y="4" width="12" height="9" rx="1" /><path d="M2 7h12M5 10h2" /></>),
  issues: I(<><path d="M8 2L1 14h14z" /><path d="M8 6v3" /><circle cx="8" cy="11" r="0.5" fill="currentColor" /></>),
  bell: I(<><path d="M3 11h10l-1-2V7a4 4 0 00-8 0v2z" /><path d="M6 13a2 2 0 004 0" /></>),
  database: I(<><ellipse cx="8" cy="3" rx="6" ry="2" /><path d="M2 3v10c0 1.1 2.7 2 6 2s6-.9 6-2V3" /><path d="M2 8c0 1.1 2.7 2 6 2s6-.9 6-2" /></>),
  audit: I(<><path d="M3 2h7l3 3v9H3z" /><path d="M5 7h6M5 10h6M5 13h4" /></>),
  settings: I(<><circle cx="8" cy="8" r="2" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4" /></>),

  // KPI/header
  search: I(<><circle cx="7" cy="7" r="4" /><path d="M10 10l3 3" /></>),
  filter: I(<><path d="M2 3h12l-4 5v4l-4 2V8z" /></>),
  download: I(<><path d="M8 2v8M5 7l3 3 3-3" /><path d="M2 13h12" /></>),
  upload: I(<><path d="M8 10V2M5 5l3-3 3 3" /><path d="M2 13h12" /></>),
  check: I(<><path d="M3 8l3 3 7-7" /></>),
  x: I(<><path d="M3 3l10 10M13 3L3 13" /></>),
  arrow: I(<><path d="M3 8h10M9 4l4 4-4 4" /></>),
  chevron: I(<><path d="M6 4l4 4-4 4" /></>),
  logout: I(<><path d="M6 2H2v12h4" /><path d="M10 5l3 3-3 3" /><path d="M5 8h8" /></>),
  plus: I(<><path d="M8 3v10M3 8h10" /></>),
  back: I(<><path d="M10 4l-4 4 4 4" /></>),
  sync: I(<><path d="M2 8a6 6 0 0110-4.5L14 5M14 8a6 6 0 01-10 4.5L2 11" /><path d="M14 3v2h-2M2 13v-2h2" /></>),
  cloud_off: I(<><path d="M3 11h6l3 3h1a2 2 0 002-2v-1a2 2 0 00-2-2" /><path d="M9 6a3 3 0 016 1M2 2l12 12" /></>),
  camera: I(<><rect x="2" y="5" width="12" height="8" rx="1" /><circle cx="8" cy="9" r="2" /><path d="M5 5l1-2h4l1 2" /></>),
  edit: I(<><path d="M10 2l4 4-9 9H1v-4z" /></>),
  calendar: I(<><rect x="2" y="3" width="12" height="11" rx="1" /><path d="M2 6h12M5 1v3M11 1v3" /></>),
  hash: I(<><path d="M5 2L3 14M13 2l-2 12M2 6h12M1 10h12" /></>),
  building: I(<><rect x="3" y="2" width="10" height="12" rx="1" /><path d="M5 5h1M5 8h1M5 11h1M10 5h1M10 8h1M10 11h1" /></>),
  menu: I(<><path d="M3 6h18M3 12h18M3 18h18" /></>),
  close: I(<><path d="M18 6L6 18M6 6l12 12" /></>),
  eye: I(<><path d="M1 8s2-5 7-5 7 5 7 5-2 5-7 5-7-5-7-5z" /><circle cx="8" cy="8" r="2" /></>),
  refresh: I(<><path d="M2 8a6 6 0 0110-4.5L14 5M14 8a6 6 0 01-10 4.5L2 11" /><path d="M14 3v2h-2M2 13v-2h2" /></>),
  sun: I(<><circle cx="8" cy="8" r="3" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4" /></>),
  moon: I(<><path d="M13 10A6 6 0 015 2a6 6 0 008 8z" /></>),
  folder: I(<><path d="M2 4h4l2 2h4v8H2z" /></>),
  bp: I(<><circle cx="4" cy="4" r="2" /><circle cx="12" cy="4" r="2" /><circle cx="4" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><path d="M4 6v4M12 6v4M6 4h4M6 12h4" /></>),
  trash: I(<><path d="M3 4h10M5 4V2h6v2M6 7v5M10 7v5M4 4l1 9h6l1-9" /></>),
};
