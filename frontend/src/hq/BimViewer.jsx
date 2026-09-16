// BIM 3D viewer (Wave D5): minimal three.js orbit viewer over web-ifc geometry.
// Lazy-loaded (three + web-ifc never touch the main bundle — asserted in e2e
// via the build manifest). Scope: orbit/zoom, per-type visibility chips, mesh
// count. No measurements, no clash detection, no editing.
// Graceful: parse/geometry failure → metadata + download fallback, never blank.
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { IfcAPI, IFCWALL, IFCSLAB, IFCCOLUMN, IFCBEAM, IFCROOF, IFCSTAIR, IFCWINDOW, IFCDOOR, IFCBUILDINGELEMENTPROXY } from 'web-ifc';
import wasmUrl from 'web-ifc/web-ifc.wasm?url';
import { getToken } from '../api/index.js';

const TYPES = [
  { flag: IFCWALL, label: 'Tường', color: 0xd9c1a3 },
  { flag: IFCSLAB, label: 'Sàn', color: 0x9aa5b1 },
  { flag: IFCCOLUMN, label: 'Cột', color: 0xc47f5a },
  { flag: IFCBEAM, label: 'Dầm', color: 0x8a6f4d },
  { flag: IFCROOF, label: 'Mái', color: 0x7d8ca3 },
  { flag: IFCSTAIR, label: 'Thang', color: 0xb0a89f },
  { flag: IFCWINDOW, label: 'Cửa sổ', color: 0x9fd4e8 },
  { flag: IFCDOOR, label: 'Cửa', color: 0x6f8f6a },
  { flag: IFCBUILDINGELEMENTPROXY, label: 'Khác', color: 0xbbbbbb },
];

export default function BimViewer() {
  const { uploadId } = useParams();
  const mountRef = useRef(null);
  const [state, setState] = useState({ phase: 'loading', meshes: 0, meta: null, error: null });
  const [hidden, setHidden] = useState({});
  const sceneRef = useRef(null);

  useEffect(() => {
    let dead = false;
    let renderer = null;
    let modelId = null;
    let api = null;
    (async () => {
      try {
        // 1. Model bytes (reuse the authenticated download endpoint).
        const blob = await fetch(`/api/uploads/${uploadId}/download`, { headers: { Authorization: `Bearer ${getToken()}` } })
          .then(r => { if (!r.ok) throw new Error(`Tải model thất bại (HTTP ${r.status})`); return r.blob(); });
        const data = new Uint8Array(await blob.arrayBuffer());
        // 2. Parse + tessellate (cap: skip models > practical limit with message).
        if (data.length > 50 * 1024 * 1024) throw new Error('Model quá lớn cho viewer trình duyệt (>50MB) — dùng nút Tải .ifc bên dưới');
        api = new IfcAPI();
        // Custom locateFile: Emscripten asks for bare names ("web-ifc.wasm" /
        // "web-ifc-mt.wasm") but Vite emits a HASHED ?url asset. Answer every
        // request with our exact file (single-thread build here: the app never
        // sets Cross-Origin-Opener/Embedder-Policy, so MT is never selected).
        await api.Init(() => wasmUrl);
        modelId = api.OpenModel(data);
        // 3. Scene.
        const mount = mountRef.current;
        if (!mount || dead) return;
        const W = mount.clientWidth || 800, H = Math.max(420, window.innerHeight - 320);
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(W, H);
        mount.appendChild(renderer.domElement);
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf2f4f7);
        sceneRef.current = scene;
        const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 2000);
        camera.position.set(14, 12, 14);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 1.5, 0);
        controls.update();
        scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 1.1));
        const sun = new THREE.DirectionalLight(0xffffff, 1.2);
        sun.position.set(20, 30, 10);
        scene.add(sun);
        const mat = (c) => new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide });
        let meshes = 0;
        const byType = {};
        for (const t of TYPES) {
          const group = new THREE.Group();
          group.name = t.label;
          try {
            api.StreamAllMeshesWithTypes(modelId, [t.flag], (flat) => {
              // geometries is an Emscripten Vector (size/get), NOT iterable.
              const n = flat.geometries.size();
              for (let gi = 0; gi < n; gi++) {
                const placed = flat.geometries.get(gi);
                const geom = api.GetGeometry(modelId, placed.geometryExpressID);
                const v = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
                const idx = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
                if (!v.length || !idx.length) continue;
                const g = new THREE.BufferGeometry();
                g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
                g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
                g.computeVertexNormals();
                const m = new THREE.Mesh(g, mat(t.color));
                m.matrixAutoUpdate = false;
                m.matrix.fromArray(placed.flatTransformation);
                group.add(m);
                meshes++;
              }
            });
          } catch { /* type unsupported by model — skip, group stays empty */ }
          byType[t.label] = group;
          scene.add(group);
        }
        sceneRef.current.userData.groups = byType;
        const tick = () => {
          if (dead) return;
          controls.update();
          renderer.render(scene, camera);
          requestAnimationFrame(tick);
        };
        tick();
        if (!dead) setState({ phase: meshes ? 'ready' : 'empty', meshes, meta: null, error: null });
      } catch (e) {
        if (!dead) setState({ phase: 'error', meshes: 0, meta: null, error: e.message });
      }
    })();
    return () => {
      dead = true;
      try { if (renderer) { renderer.dispose(); mountRef.current?.replaceChildren(); } } catch {}
      try { if (api != null && modelId != null) api.CloseModel(modelId); } catch {}
    };
  }, [uploadId]);

  // Type visibility chips (honest scope: filter by element type, not storey —
  // storey containment needs a spatial query the fixture-scale engine skips).
  useEffect(() => {
    const groups = sceneRef.current?.userData?.groups;
    if (!groups) return;
    for (const [label, g] of Object.entries(groups)) g.visible = !hidden[label];
  }, [hidden]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Xem mô hình 3D</h1>
          <div className="meta">
            {state.phase === 'loading' && 'Đang tải + dựng hình...'}
            {state.phase === 'ready' && `${state.meshes} meshes · kéo để xoay, cuộn để zoom`}
            {state.phase === 'empty' && 'Model không có hình học trích xuất được — xem metadata bên dưới'}
            {state.phase === 'error' && `Lỗi: ${state.error}`}
          </div>
        </div>
      </div>
      <div ref={mountRef} data-testid="bim-canvas" style={{ width: '100%', minHeight: 420, border: '1px solid var(--c-border)', borderRadius: 8, overflow: 'hidden' }} />
      {state.phase === 'ready' && (
        <div className="filter-bar" style={{ marginTop: 8 }}>
          {TYPES.map(t => (
            <button key={t.label} className={hidden[t.label] ? 'btn btn-secondary' : 'btn'}
              style={{ fontSize: 12, padding: '5px 10px' }}
              onClick={() => setHidden(h => ({ ...h, [t.label]: !h[t.label] }))}>
              {t.label}
            </button>
          ))}
        </div>
      )}
      {(state.phase === 'empty' || state.phase === 'error') && (
        <div className="empty" style={{ marginTop: 8 }}>
          {(state.meta?.storeys || []).length > 0
            ? `Metadata: ${(state.meta.storeys || []).map(s => s.name).join(', ')} · ${state.meta.space_count ?? 0} spaces`
            : 'Không đọc được metadata.'}{' '}
          <a href={`/api/uploads/${uploadId}/download`}>Tải file .ifc gốc</a>
        </div>
      )}
    </div>
  );
}
