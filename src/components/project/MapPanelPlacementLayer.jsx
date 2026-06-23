import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { PanelTop, Plus, Trash2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

const PANEL_GAP_M = 0.03;
const DEFAULT_PANEL = { id: 'standard', width_mm: 1134, height_mm: 1762, power_watts: 500, name: 'Standardpanel 500 W', model: 'Standardpanel 500 W' };
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const positive = (value, fallback = 0) => number(value, fallback) > 0 ? number(value, fallback) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const uid = prefix => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

function safeJson(raw, fallback = {}) {
  try { return JSON.parse(raw || '') || fallback; } catch { return fallback; }
}

function readLayout(project) {
  for (const raw of [project?.solar_roof_planner_data, project?.panel_layout_data]) {
    const parsed = safeJson(raw, null);
    if (parsed && Array.isArray(parsed.roofs)) return parsed;
  }
  return { version: 12, roofs: [] };
}

function panelProductForRoof(roof, products = []) {
  return products.find(product => String(product.id) === String(roof?.panelProductId)) || roof?.panelProductSnapshot || DEFAULT_PANEL;
}

function panelLabel(product) {
  return [product?.brand, product?.model].filter(Boolean).join(' ') || product?.name || product?.model || 'Standardpanel';
}

// Beräkna panelens verkliga storlek i meter från vald produkt.
function panelSize(orientation, product) {
  const widthM = (Number(product?.width_mm) || 1134) / 1000;
  const heightM = (Number(product?.height_mm) || 1762) / 1000;

  return String(orientation || '').toLowerCase().includes('ligg')
    ? { w: heightM, h: widthM }
    : { w: widthM, h: heightM };
}

// Beräkna en skala som låter hela taket rymmas i den tillgängliga ytan.
const getWorkspaceScale = (roof, containerWidth, containerHeight) => {
  const padding = 60;
  const roofW = Number(roof?.widthM) || 10;
  const roofH = Number(roof?.roofFallM) || 8;
  const usableWidth = Math.max(1, containerWidth - padding);
  const usableHeight = Math.max(1, containerHeight - padding);
  return Math.max(0.01, Math.min(usableWidth / roofW, usableHeight / roofH));
};

function panelPosition(group, product, row, col) {
  const override = group?.panelOverrides?.[`${row}-${col}`];
  if (override) return { xM: number(override.xM), yM: number(override.yM) };
  const size = panelSize(group?.orientation, product);
  return {
    xM: number(group?.xM) + col * (size.w + PANEL_GAP_M),
    yM: number(group?.yM) + row * (size.h + PANEL_GAP_M),
  };
}

function groupSize(group, roof, products) {
  const size = panelSize(group?.orientation, panelProductForRoof(roof, products));
  const rows = Math.max(1, Math.round(number(group?.rows, 1)));
  const cols = Math.max(1, Math.round(number(group?.cols, 1)));
  return {
    w: cols * size.w + Math.max(0, cols - 1) * PANEL_GAP_M,
    h: rows * size.h + Math.max(0, rows - 1) * PANEL_GAP_M,
  };
}

function polygonPoints(roof, width, height) {
  return (roof?.mapPolygon || []).map(point => `${number(point.x) * width},${number(point.y) * height}`).join(' ');
}

function normalizePoints(value = '') {
  return value.trim().replace(/\s+/g, ' ');
}

function roofFrame(roof, stageWidth, stageHeight) {
  const points = (roof?.mapPolygon || []).map(point => ({ x: number(point.x) * stageWidth, y: number(point.y) * stageHeight }));
  if (points.length < 3) return null;

  let longest = null;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (!longest || length > longest.length) longest = { dx, dy, length };
  }
  if (!longest || longest.length < 1) return null;

  let ux = { x: longest.dx / longest.length, y: longest.dy / longest.length };
  if (ux.x < 0 || (Math.abs(ux.x) < 0.001 && ux.y < 0)) ux = { x: -ux.x, y: -ux.y };
  const uy = { x: -ux.y, y: ux.x };
  const projected = points.map(point => ({ u: point.x * ux.x + point.y * ux.y, v: point.x * uy.x + point.y * uy.y }));
  const minU = Math.min(...projected.map(point => point.u));
  const maxU = Math.max(...projected.map(point => point.u));
  const minV = Math.min(...projected.map(point => point.v));
  const maxV = Math.max(...projected.map(point => point.v));
  const widthM = positive(roof?.widthM, 8);
  const heightM = positive(roof?.roofFallM, 6);
  const extentU = Math.max(1, maxU - minU);
  const extentV = Math.max(1, maxV - minV);
  const scale = Math.max(0.01, Math.min(extentU / widthM, extentV / heightM));
  const startU = minU + (extentU - widthM * scale) / 2;
  const startV = minV + (extentV - heightM * scale) / 2;

  return {
    ux,
    uy,
    scale,
    angleDeg: Math.atan2(ux.y, ux.x) * 180 / Math.PI,
    origin: { x: ux.x * startU + uy.x * startV, y: ux.y * startU + uy.y * startV },
  };
}

function localPoint(frame, xM, yM) {
  return {
    x: frame.origin.x + frame.ux.x * xM * frame.scale + frame.uy.x * yM * frame.scale,
    y: frame.origin.y + frame.ux.y * xM * frame.scale + frame.uy.y * yM * frame.scale,
  };
}

function panelGeometry(frame, xM, yM, widthM, heightM) {
  const topLeft = localPoint(frame, xM, yM);
  const topRight = localPoint(frame, xM + widthM, yM);
  const bottomRight = localPoint(frame, xM + widthM, yM + heightM);
  const bottomLeft = localPoint(frame, xM, yM + heightM);
  const thirdTop = localPoint(frame, xM + widthM / 3, yM);
  const thirdBottom = localPoint(frame, xM + widthM / 3, yM + heightM);
  const twoThirdTop = localPoint(frame, xM + widthM * 2 / 3, yM);
  const twoThirdBottom = localPoint(frame, xM + widthM * 2 / 3, yM + heightM);
  const center = localPoint(frame, xM + widthM / 2, yM + heightM / 2);
  return {
    points: [topLeft, topRight, bottomRight, bottomLeft].map(point => `${point.x},${point.y}`).join(' '),
    thirdTop,
    thirdBottom,
    twoThirdTop,
    twoThirdBottom,
    center,
  };
}

function svgPoint(event) {
  const svg = event.currentTarget.ownerSVGElement || event.currentTarget;
  const matrix = svg?.getScreenCTM?.();
  if (!svg?.createSVGPoint || !matrix) return null;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(matrix.inverse());
}

function createGroup(index) {
  return {
    id: uid('panel-group'),
    name: `Panelgrupp ${index}`,
    rows: 3,
    cols: 4,
    xM: 0.7,
    yM: 0.7,
    orientation: 'Stående',
    threeRails: false,
    panelOverrides: {},
  };
}

function ToolButton({ active, disabled, onClick }) {
  return (
    <button
      type="button"
      title="Placera paneler på aktivt tak"
      aria-label="Placera paneler på aktivt tak"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition disabled:cursor-not-allowed disabled:opacity-35 ${active ? 'border-orange-300 bg-orange-50 text-orange-600 shadow-sm' : 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-900'}`}
    >
      <PanelTop className="h-4 w-4" />
    </button>
  );
}

export default function MapPanelPlacementLayer({ project, toolbarTarget, canvasTarget, settingsTarget, onLayoutChange }) {
  const dragRef = useRef(null);
  const { data: products = [] } = useQuery({
    queryKey: ['products-panels-map-placement'],
    queryFn: () => base44.entities.Product.filter({ category: 'solpanel' }),
  });
  const panelProducts = products.filter(product => product.is_active !== false);
  const [layout, setLayout] = useState(() => readLayout(project));
  const layoutRef = useRef(layout);
  const [svgHost, setSvgHost] = useState(null);
  const [stage, setStage] = useState({ width: 1600, height: 1000 });
  const stageRef = useRef(stage);
  const [selectedRoofId, setSelectedRoofId] = useState(() => readLayout(project).roofs?.[0]?.id || '');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [dragMode, setDragMode] = useState('group');
  const [active, setActive] = useState(false);

  const selectedRoof = layout.roofs.find(roof => String(roof.id) === String(selectedRoofId)) || layout.roofs[0] || null;
  const selectedGroup = (selectedRoof?.panelGroups || []).find(group => String(group.id) === String(selectedGroupId)) || selectedRoof?.panelGroups?.[0] || null;
  const selectedProduct = panelProductForRoof(selectedRoof, panelProducts);
  const panelCount = useMemo(() => (selectedRoof?.panelGroups || []).reduce((sum, group) => sum + Math.max(1, Math.round(number(group.rows, 1))) * Math.max(1, Math.round(number(group.cols, 1))), 0), [selectedRoof]);

  const previewPanels = useMemo(() => {
    if (!selectedRoof) return [];
    const product = panelProductForRoof(selectedRoof, panelProducts);
    const result = [];
    (selectedRoof.panelGroups || []).forEach(group => {
      const rows = Math.max(1, Math.round(number(group.rows, 1)));
      const cols = Math.max(1, Math.round(number(group.cols, 1)));
      const size = panelSize(group.orientation, product);
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const position = panelPosition(group, product, row, col);
          result.push({
            id: `${group.id}-${row}-${col}`,
            groupId: group.id,
            row,
            col,
            xM: position.xM,
            yM: position.yM,
            wM: size.w,
            hM: size.h,
          });
        }
      }
    });
    return result;
  }, [selectedRoof, panelProducts]);

  useEffect(() => { layoutRef.current = layout; }, [layout]);
  useEffect(() => { stageRef.current = stage; }, [stage]);

  useEffect(() => {
    const next = readLayout(project);
    setLayout(next);
    setSelectedRoofId(current => next.roofs.some(roof => String(roof.id) === String(current)) ? current : next.roofs?.[0]?.id || '');
  }, [project?.id, project?.solar_roof_planner_data, project?.panel_layout_data]);

  useEffect(() => {
    onLayoutChange?.(layout);
  }, [layout, onLayoutChange]);

  useEffect(() => {
    const groups = selectedRoof?.panelGroups || [];
    setSelectedGroupId(current => groups.some(group => String(group.id) === String(current)) ? current : groups[0]?.id || '');
  }, [selectedRoofId, selectedRoof?.panelGroups]);

  useEffect(() => {
    if (!canvasTarget) return undefined;
    let currentHost = null;

    const sync = () => {
      const svg = canvasTarget.querySelector('svg');
      if (!svg) {
        setSvgHost(null);
        return;
      }
      const viewBox = svg.viewBox?.baseVal;
      if (viewBox?.width && viewBox?.height) {
        const nextStage = { width: viewBox.width, height: viewBox.height };
        stageRef.current = nextStage;
        setStage(current => current.width === nextStage.width && current.height === nextStage.height ? current : nextStage);
      }

      let host = svg.querySelector(':scope > g[data-map-panel-placement-layer]');
      if (!host) {
        host = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        host.setAttribute('data-map-panel-placement-layer', 'true');
        svg.appendChild(host);
      }
      currentHost = host;
      setSvgHost(existing => existing === host ? existing : host);

      const roofPolygons = Array.from(svg.querySelectorAll('polygon')).filter(polygon => !polygon.closest('[data-map-panel-placement-layer]') && !polygon.closest('clipPath'));
      const activePolygon = roofPolygons.find(polygon => String(polygon.getAttribute('stroke') || '').toLowerCase() === '#f97316');
      if (activePolygon) {
        const activePoints = normalizePoints(activePolygon.getAttribute('points') || '');
        const currentStage = stageRef.current;
        const roof = layoutRef.current.roofs.find(item => normalizePoints(polygonPoints(item, viewBox?.width || currentStage.width, viewBox?.height || currentStage.height)) === activePoints);
        if (roof) setSelectedRoofId(current => String(current) === String(roof.id) ? current : roof.id);
      }
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(canvasTarget, { childList: true, subtree: true, attributes: true, attributeFilter: ['stroke', 'viewBox'] });
    return () => {
      observer.disconnect();
      currentHost?.remove();
    };
  }, [canvasTarget]);

  const updateGroup = (groupId, updater) => {
    if (!selectedRoof) return;
    setLayout(current => ({
      ...current,
      roofs: current.roofs.map(roof => String(roof.id) === String(selectedRoof.id)
        ? { ...roof, panelGroups: (roof.panelGroups || []).map(group => String(group.id) === String(groupId) ? updater(group, roof) : group) }
        : roof),
    }));
  };

  const addGroup = () => {
    if (!selectedRoof?.mapPolygon?.length) return;
    const group = createGroup((selectedRoof.panelGroups || []).length + 1);
    setLayout(current => ({
      ...current,
      roofs: current.roofs.map(roof => String(roof.id) === String(selectedRoof.id) ? { ...roof, panelGroups: [...(roof.panelGroups || []), group] } : roof),
    }));
    setSelectedGroupId(group.id);
    setActive(true);
  };

  const deleteGroup = () => {
    if (!selectedRoof || !selectedGroup) return;
    const nextGroups = (selectedRoof.panelGroups || []).filter(group => String(group.id) !== String(selectedGroup.id));
    setLayout(current => ({
      ...current,
      roofs: current.roofs.map(roof => String(roof.id) === String(selectedRoof.id) ? { ...roof, panelGroups: nextGroups } : roof),
    }));
    setSelectedGroupId(nextGroups[0]?.id || '');
  };

  const beginDrag = (event, roof, group, row, col) => {
    if (!active) return;
    const point = svgPoint(event);
    const frame = roofFrame(roof, stage.width, stage.height);
    if (!point || !frame) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      roofId: roof.id,
      groupId: group.id,
      row,
      col,
      mode: dragMode,
      point,
      frame,
      baseGroup: { ...group, panelOverrides: Object.fromEntries(Object.entries(group.panelOverrides || {}).map(([key, value]) => [key, { ...value }])) },
    };
    setSelectedGroupId(group.id);
  };

  const moveDrag = event => {
    const drag = dragRef.current;
    if (!drag || !active) return;
    const point = svgPoint(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    const deltaX = point.x - drag.point.x;
    const deltaY = point.y - drag.point.y;
    const dxM = (deltaX * drag.frame.ux.x + deltaY * drag.frame.ux.y) / drag.frame.scale;
    const dyM = (deltaX * drag.frame.uy.x + deltaY * drag.frame.uy.y) / drag.frame.scale;

    setLayout(current => ({
      ...current,
      roofs: current.roofs.map(roof => {
        if (String(roof.id) !== String(drag.roofId)) return roof;
        return {
          ...roof,
          panelGroups: (roof.panelGroups || []).map(group => {
            if (String(group.id) !== String(drag.groupId)) return group;
            const base = drag.baseGroup;
            if (drag.mode === 'panel') {
              const product = panelProductForRoof(roof, panelProducts);
              const size = panelSize(base.orientation, product);
              const position = panelPosition(base, product, drag.row, drag.col);
              return {
                ...base,
                panelOverrides: {
                  ...(base.panelOverrides || {}),
                  [`${drag.row}-${drag.col}`]: {
                    xM: clamp(position.xM + dxM, 0, Math.max(0, positive(roof.widthM, 8) - size.w)),
                    yM: clamp(position.yM + dyM, 0, Math.max(0, positive(roof.roofFallM, 6) - size.h)),
                  },
                },
              };
            }
            const size = groupSize(base, roof, panelProducts);
            const nextX = clamp(number(base.xM) + dxM, 0, Math.max(0, positive(roof.widthM, 8) - size.w));
            const nextY = clamp(number(base.yM) + dyM, 0, Math.max(0, positive(roof.roofFallM, 6) - size.h));
            const realDx = nextX - number(base.xM);
            const realDy = nextY - number(base.yM);
            return {
              ...base,
              xM: nextX,
              yM: nextY,
              panelOverrides: Object.fromEntries(Object.entries(base.panelOverrides || {}).map(([key, value]) => [key, { xM: number(value.xM) + realDx, yM: number(value.yM) + realDy }])),
            };
          }),
        };
      }),
    }));
  };

  const endDrag = event => {
    if (!dragRef.current) return;
    event.stopPropagation();
    dragRef.current = null;
  };

  const previewRoofW = positive(selectedRoof?.widthM, 10);
  const previewRoofH = positive(selectedRoof?.roofFallM, 8);
  const previewScale = getWorkspaceScale(selectedRoof, 420, 192);
  const previewStroke = Math.max(0.01, 1.5 / previewScale);
  const previewClipId = `scaled-roof-preview-${selectedRoof?.id || 'none'}`;

  const preview = svgHost && selectedRoof?.mapPolygon?.length ? (
    <div
      className="pointer-events-none absolute left-1/2 top-3 h-48 -translate-x-1/2 overflow-hidden rounded-xl border-2 border-purple-400 bg-slate-950/90 shadow-xl backdrop-blur-sm"
      style={{ width: 'min(440px, calc(100% - 96px))', zIndex: 70 }}
    >
      <div className="absolute inset-x-0 top-2 z-10 flex justify-center">
        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-purple-600 shadow-sm">
          Skalenlig förhandsgranskning
        </span>
      </div>
      <div className="absolute inset-0 flex items-center justify-center px-3 pb-3 pt-9">
        <svg
          viewBox={`0 0 ${previewRoofW} ${previewRoofH}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ width: `${previewRoofW * previewScale}px`, height: `${previewRoofH * previewScale}px`, maxWidth: '100%', maxHeight: '100%' }}
        >
          <defs>
            <clipPath id={previewClipId}>
              <rect width={previewRoofW} height={previewRoofH} rx={0.08} />
            </clipPath>
          </defs>
          <rect width={previewRoofW} height={previewRoofH} rx={0.08} fill="rgba(249,115,22,.20)" stroke="#f97316" strokeWidth={previewStroke} />
          <g clipPath={`url(#${previewClipId})`}>
            {previewPanels.map(panel => {
              const selected = String(panel.groupId) === String(selectedGroup?.id);
              const lineStroke = Math.max(0.006, previewStroke * 0.55);
              const fontSize = Math.max(0.11, Math.min(panel.wM, panel.hM) * 0.18);
              return (
                <g key={panel.id}>
                  <rect
                    x={panel.xM}
                    y={panel.yM}
                    width={panel.wM}
                    height={panel.hM}
                    rx={0.04}
                    fill={selected ? '#bfdbfe' : '#dbeafe'}
                    stroke={selected ? '#f97316' : '#2563eb'}
                    strokeWidth={previewStroke}
                  />
                  <line x1={panel.xM + panel.wM / 3} y1={panel.yM} x2={panel.xM + panel.wM / 3} y2={panel.yM + panel.hM} stroke="#93c5fd" strokeWidth={lineStroke} />
                  <line x1={panel.xM + panel.wM * 2 / 3} y1={panel.yM} x2={panel.xM + panel.wM * 2 / 3} y2={panel.yM + panel.hM} stroke="#93c5fd" strokeWidth={lineStroke} />
                  <text x={panel.xM + panel.wM / 2} y={panel.yM + panel.hM / 2 + fontSize * 0.35} textAnchor="middle" fontSize={fontSize} fontWeight="800" fill="#1d4ed8">
                    {panel.row + 1}:{panel.col + 1}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  ) : null;

  const overlay = svgHost && selectedRoof?.mapPolygon?.length ? (
    <>
      <defs>
        <clipPath id={`map-panel-clip-${selectedRoof.id}`}>
          <polygon points={polygonPoints(selectedRoof, stage.width, stage.height)} />
        </clipPath>
      </defs>
      <g clipPath={`url(#map-panel-clip-${selectedRoof.id})`}>
        {(selectedRoof.panelGroups || []).map(group => {
          const rows = Math.max(1, Math.round(number(group.rows, 1)));
          const cols = Math.max(1, Math.round(number(group.cols, 1)));
          const product = panelProductForRoof(selectedRoof, panelProducts);
          const size = panelSize(group.orientation, product);
          const frame = roofFrame(selectedRoof, stage.width, stage.height);
          if (!frame) return null;
          const selected = String(group.id) === String(selectedGroup?.id);
          const panels = [];
          for (let row = 0; row < rows; row += 1) {
            for (let col = 0; col < cols; col += 1) {
              const position = panelPosition(group, product, row, col);
              const geometry = panelGeometry(frame, position.xM, position.yM, size.w, size.h);
              const fontSize = clamp(Math.min(size.w, size.h) * frame.scale * 0.26, 6, 12);
              panels.push(
                <g
                  key={`${group.id}-${row}-${col}`}
                  data-map-panel-item="true"
                  className={active ? 'cursor-move' : ''}
                  style={{ pointerEvents: active ? 'auto' : 'none' }}
                  onClick={event => { event.stopPropagation(); setSelectedGroupId(group.id); }}
                  onPointerDown={event => beginDrag(event, selectedRoof, group, row, col)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                >
                  <polygon
                    points={geometry.points}
                    fill={selected ? '#bfdbfe' : '#dbeafe'}
                    stroke={selected ? '#f97316' : '#2563eb'}
                    strokeWidth={selected ? '2.5' : '1.5'}
                    vectorEffect="non-scaling-stroke"
                  />
                  <line x1={geometry.thirdTop.x} y1={geometry.thirdTop.y} x2={geometry.thirdBottom.x} y2={geometry.thirdBottom.y} stroke="#93c5fd" strokeWidth="1" vectorEffect="non-scaling-stroke" pointerEvents="none" />
                  <line x1={geometry.twoThirdTop.x} y1={geometry.twoThirdTop.y} x2={geometry.twoThirdBottom.x} y2={geometry.twoThirdBottom.y} stroke="#93c5fd" strokeWidth="1" vectorEffect="non-scaling-stroke" pointerEvents="none" />
                  <text
                    x={geometry.center.x}
                    y={geometry.center.y + fontSize * 0.35}
                    textAnchor="middle"
                    fontSize={fontSize}
                    fontWeight="800"
                    fill="#1d4ed8"
                    pointerEvents="none"
                    transform={`rotate(${frame.angleDeg} ${geometry.center.x} ${geometry.center.y})`}
                  >
                    {row + 1}:{col + 1}
                  </text>
                </g>,
              );
            }
          }
          return <g key={group.id}>{panels}</g>;
        })}
      </g>
    </>
  ) : null;

  const toolbar = svgHost ? (
    <div className="flex flex-col items-center gap-1">
      <ToolButton active={active} disabled={!selectedRoof?.mapPolygon?.length} onClick={() => setActive(current => !current)} />
    </div>
  ) : null;

  const settings = svgHost ? (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold"><PanelTop className="h-4 w-4" />Paneler på aktivt tak</div>
        <span className="text-xs text-slate-500">{panelCount} st</span>
      </div>
      <div className="mt-2 rounded-xl border border-blue-200 bg-blue-50 px-2.5 py-2 text-xs text-blue-900">
        <div className="font-semibold">{panelLabel(selectedProduct)}</div>
        <div className="mt-0.5 text-blue-700">Skalas efter verkligt panelmått: {positive(selectedProduct?.width_mm, 1134)} × {positive(selectedProduct?.height_mm, 1762)} mm.</div>
      </div>
      <div className="mt-2 text-xs text-slate-500">Panelerna följer det valda takets verkliga bredd och takfall. Den lila ramen visar placeringen live i samma skala.</div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => { setDragMode('group'); setActive(true); }} className={`rounded-xl border px-2 py-2 text-xs font-semibold ${dragMode === 'group' ? 'border-orange-300 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-600'}`}>Flytta grupp</button>
        <button type="button" onClick={() => { setDragMode('panel'); setActive(true); }} className={`rounded-xl border px-2 py-2 text-xs font-semibold ${dragMode === 'panel' ? 'border-orange-300 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-600'}`}>Flytta panel</button>
      </div>

      {(selectedRoof?.panelGroups || []).length ? (
        <>
          <div className="mt-3 space-y-1.5">
            {(selectedRoof.panelGroups || []).map(group => (
              <button key={group.id} type="button" onClick={() => { setSelectedGroupId(group.id); setActive(true); }} className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-xs ${String(group.id) === String(selectedGroup?.id) ? 'border-orange-300 bg-orange-50 text-orange-800' : 'border-slate-200 text-slate-600'}`}>
                <span className="font-semibold">{group.name}</span>
                <span>{Math.max(1, Math.round(number(group.rows, 1)))} × {Math.max(1, Math.round(number(group.cols, 1)))}</span>
              </button>
            ))}
          </div>
          {selectedGroup && (
            <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] font-medium text-slate-500">Rader<input type="number" min="1" max="30" value={selectedGroup.rows || 1} onChange={event => updateGroup(selectedGroup.id, group => ({ ...group, rows: Math.max(1, Number(event.target.value) || 1) }))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm" /></label>
                <label className="text-[11px] font-medium text-slate-500">Kolumner<input type="number" min="1" max="30" value={selectedGroup.cols || 1} onChange={event => updateGroup(selectedGroup.id, group => ({ ...group, cols: Math.max(1, Number(event.target.value) || 1) }))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm" /></label>
              </div>
              <label className="block text-[11px] font-medium text-slate-500">Orientering<select value={selectedGroup.orientation || 'Stående'} onChange={event => updateGroup(selectedGroup.id, group => ({ ...group, orientation: event.target.value, panelOverrides: {} }))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"><option>Stående</option><option>Liggande</option></select></label>
              <button type="button" onClick={deleteGroup} className="inline-flex items-center gap-1 text-xs font-medium text-red-600"><Trash2 className="h-3.5 w-3.5" />Ta bort aktiv panelgrupp</button>
            </div>
          )}
        </>
      ) : <div className="mt-3 rounded-xl border border-dashed border-slate-300 p-3 text-center text-xs text-slate-500">Det finns ingen panelgrupp på detta tak.</div>}

      <Button variant="outline" size="sm" onClick={addGroup} disabled={!selectedRoof?.mapPolygon?.length} className="mt-3 w-full gap-2"><Plus className="h-4 w-4" />Lägg till panelgrupp</Button>
    </section>
  ) : null;

  return (
    <>
      {svgHost && overlay && createPortal(overlay, svgHost)}
      {canvasTarget && preview && createPortal(preview, canvasTarget)}
      {toolbarTarget && toolbar && createPortal(toolbar, toolbarTarget)}
      {settingsTarget && settings && createPortal(settings, settingsTarget)}
    </>
  );
}
