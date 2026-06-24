import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, PanelTop, Plus, Trash2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { groupSizeM, panelPositions } from '@/lib/panelLayout.js';

const PANEL_GAP_M = 0.03;
const DEFAULT_PANEL = {
  id: 'standard',
  width_mm: 1134,
  height_mm: 1762,
  power_watts: 500,
  name: 'Standardpanel 500 W',
  model: 'Standardpanel 500 W',
};

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
  return { version: 13, roofs: [] };
}

function panelProductForRoof(roof, products = []) {
  return products.find(product => String(product.id) === String(roof?.panelProductId))
    || roof?.panelProductSnapshot
    || DEFAULT_PANEL;
}

function panelLabel(product) {
  return [product?.brand, product?.model].filter(Boolean).join(' ')
    || product?.name
    || product?.model
    || 'Standardpanel';
}

function panelSize(orientation, product) {
  const widthM = (Number(product?.width_mm) || 1134) / 1000;
  const heightM = (Number(product?.height_mm) || 1762) / 1000;

  return String(orientation || '').toLowerCase().includes('ligg')
    ? { w: heightM, h: widthM }
    : { w: widthM, h: heightM };
}

function layoutGroup(group) {
  return {
    ...group,
    rows: Math.max(1, Math.round(number(group?.rows, 1))),
    cols: Math.max(1, Math.round(number(group?.cols, 1))),
  };
}

function panelPosition(group, roof, product, row, col) {
  const size = panelSize(group?.orientation, product);
  const position = panelPositions({
    group: layoutGroup(group),
    panelSize: size,
    variant: roof?.mountingSystemVariant,
    gapFallbackM: PANEL_GAP_M,
  }).find(item => item.row === row && item.col === col);

  return position ? { xM: position.xM, yM: position.yM } : { xM: number(group?.xM), yM: number(group?.yM) };
}

function groupSize(group, roof, products) {
  const size = panelSize(group?.orientation, panelProductForRoof(roof, products));
  return groupSizeM({
    group: layoutGroup(group),
    panelSize: size,
    variant: roof?.mountingSystemVariant,
    gapFallbackM: PANEL_GAP_M,
  });
}

function groupBounds(group, roof, product) {
  const size = panelSize(group?.orientation, product);
  const positions = panelPositions({
    group: layoutGroup(group),
    panelSize: size,
    variant: roof?.mountingSystemVariant,
    gapFallbackM: PANEL_GAP_M,
  });

  if (!positions.length) return null;

  const minX = Math.min(...positions.map(item => item.xM));
  const minY = Math.min(...positions.map(item => item.yM));
  const maxX = Math.max(...positions.map(item => item.xM + item.wM));
  const maxY = Math.max(...positions.map(item => item.yM + item.hM));

  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function polygonPoints(roof, width, height) {
  return (roof?.mapPolygon || [])
    .map(point => `${number(point.x) * width},${number(point.y) * height}`)
    .join(' ');
}

function normalizePoints(value = '') {
  return value.trim().replace(/\s+/g, ' ');
}

function roofFrame(roof, stageWidth, stageHeight) {
  const points = (roof?.mapPolygon || []).map(point => ({
    x: number(point.x) * stageWidth,
    y: number(point.y) * stageHeight,
  }));
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
  if (ux.x < 0 || (Math.abs(ux.x) < 0.001 && ux.y < 0)) {
    ux = { x: -ux.x, y: -ux.y };
  }

  const uy = { x: -ux.y, y: ux.x };
  const projected = points.map(point => ({
    u: point.x * ux.x + point.y * ux.y,
    v: point.x * uy.x + point.y * uy.y,
  }));

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
    origin: {
      x: ux.x * startU + uy.x * startV,
      y: ux.y * startU + uy.y * startV,
    },
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
    points: [topLeft, topRight, bottomRight, bottomLeft]
      .map(point => `${point.x},${point.y}`)
      .join(' '),
    thirdTop,
    thirdBottom,
    twoThirdTop,
    twoThirdBottom,
    center,
  };
}

function mapFocusViewBox(roof, stageWidth, stageHeight, aspectRatio) {
  const points = (roof?.mapPolygon || []).map(point => ({
    x: number(point.x) * stageWidth,
    y: number(point.y) * stageHeight,
  }));

  if (points.length < 3) return `0 0 ${stageWidth} ${stageHeight}`;

  const minX = Math.min(...points.map(point => point.x));
  const maxX = Math.max(...points.map(point => point.x));
  const minY = Math.min(...points.map(point => point.y));
  const maxY = Math.max(...points.map(point => point.y));
  const polygonW = Math.max(1, maxX - minX);
  const polygonH = Math.max(1, maxY - minY);
  const padding = Math.max(polygonW, polygonH) * 0.75;

  let x = minX - padding;
  let y = minY - padding;
  let width = polygonW + padding * 2;
  let height = polygonH + padding * 2;
  const targetAspect = Math.max(0.5, aspectRatio || 2.5);
  const currentAspect = width / height;

  if (currentAspect < targetAspect) {
    const nextWidth = height * targetAspect;
    x -= (nextWidth - width) / 2;
    width = nextWidth;
  } else {
    const nextHeight = width / targetAspect;
    y -= (nextHeight - height) / 2;
    height = nextHeight;
  }

  width = Math.min(stageWidth, width);
  height = Math.min(stageHeight, height);
  x = clamp(x, 0, Math.max(0, stageWidth - width));
  y = clamp(y, 0, Math.max(0, stageHeight - height));

  return `${x} ${y} ${width} ${height}`;
}

function svgPoint(svg, event) {
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
      title={active ? 'Stäng skalenlig arbetsyta' : 'Öppna skalenlig arbetsyta'}
      aria-label={active ? 'Stäng skalenlig arbetsyta' : 'Öppna skalenlig arbetsyta'}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition disabled:cursor-not-allowed disabled:opacity-35 ${
        active
          ? 'border-purple-300 bg-purple-50 text-purple-700 shadow-sm'
          : 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-900'
      }`}
    >
      <PanelTop className="h-4 w-4" />
    </button>
  );
}

export default function MapPanelPlacementLayer({
  project,
  toolbarTarget,
  canvasTarget,
  settingsTarget,
  onLayoutChange,
}) {
  const workspaceSvgRef = useRef(null);
  const dragRef = useRef(null);
  const layoutRef = useRef(null);
  const stageRef = useRef({ width: 1600, height: 1000 });
  const boundSvgRef = useRef(null);
  const boundClickRef = useRef(null);

  const { data: products = [] } = useQuery({
    queryKey: ['products-panels-map-placement'],
    queryFn: () => base44.entities.Product.filter({ category: 'solpanel' }),
  });

  const panelProducts = products.filter(product => product.is_active !== false);
  const [layout, setLayout] = useState(() => readLayout(project));
  const [svgHost, setSvgHost] = useState(null);
  const [stage, setStage] = useState({ width: 1600, height: 1000 });
  const [mapImageSrc, setMapImageSrc] = useState('');
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [selectedRoofId, setSelectedRoofId] = useState(() => readLayout(project).roofs?.[0]?.id || '');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [dragMode, setDragMode] = useState('group');
  const [workspaceOpen, setWorkspaceOpen] = useState(false);

  layoutRef.current = layout;
  stageRef.current = stage;

  const selectedRoof = layout.roofs.find(roof => String(roof.id) === String(selectedRoofId))
    || layout.roofs[0]
    || null;
  const selectedGroup = (selectedRoof?.panelGroups || [])
    .find(group => String(group.id) === String(selectedGroupId))
    || selectedRoof?.panelGroups?.[0]
    || null;
  const selectedProduct = panelProductForRoof(selectedRoof, panelProducts);

  const panelCount = useMemo(
    () => (selectedRoof?.panelGroups || []).reduce((sum, group) => (
      sum
      + Math.max(0, Math.round(number(group.rows)))
      * Math.max(0, Math.round(number(group.cols)))
    ), 0),
    [selectedRoof],
  );

  useEffect(() => {
    const next = readLayout(project);
    setLayout(next);
    setSelectedRoofId(current => (
      next.roofs.some(roof => String(roof.id) === String(current))
        ? current
        : next.roofs?.[0]?.id || ''
    ));
  }, [project?.id, project?.solar_roof_planner_data, project?.panel_layout_data]);

  useEffect(() => {
    onLayoutChange?.(layout);
  }, [layout, onLayoutChange]);

  useEffect(() => {
    const groups = selectedRoof?.panelGroups || [];
    setSelectedGroupId(current => (
      groups.some(group => String(group.id) === String(current))
        ? current
        : groups[0]?.id || ''
    ));

    if (!selectedRoof?.mapPolygon?.length) setWorkspaceOpen(false);
  }, [selectedRoofId, selectedRoof?.mapPolygon, selectedRoof?.panelGroups]);

  useEffect(() => {
    if (!canvasTarget) return undefined;

    const updateSize = () => {
      const rect = canvasTarget.getBoundingClientRect();
      setCanvasSize({ width: rect.width, height: rect.height });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(canvasTarget);
    return () => observer.disconnect();
  }, [canvasTarget]);

  useEffect(() => {
    if (!canvasTarget) return undefined;

    const unbindSvg = () => {
      if (boundSvgRef.current && boundClickRef.current) {
        boundSvgRef.current.removeEventListener('click', boundClickRef.current, true);
      }
      boundSvgRef.current = null;
      boundClickRef.current = null;
    };

    let currentHost = null;

    const sync = () => {
      const sourceSvg = Array.from(canvasTarget.querySelectorAll('svg')).find(
        svg => !svg.closest('[data-map-split-workspace]'),
      );
      const sourceImage = Array.from(canvasTarget.querySelectorAll('img')).find(
        image => image.getAttribute('alt') === 'Kartbild' && !image.closest('[data-map-split-workspace]'),
      );

      if (sourceImage?.src) setMapImageSrc(sourceImage.src);

      if (!sourceSvg) {
        unbindSvg();
        setSvgHost(null);
        return;
      }

      const viewBox = sourceSvg.viewBox?.baseVal;
      if (viewBox?.width && viewBox?.height) {
        const nextStage = { width: viewBox.width, height: viewBox.height };
        stageRef.current = nextStage;
        setStage(current => (
          current.width === nextStage.width && current.height === nextStage.height
            ? current
            : nextStage
        ));
      }

      let host = sourceSvg.querySelector(':scope > g[data-map-panel-placement-layer]');
      if (!host) {
        host = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        host.setAttribute('data-map-panel-placement-layer', 'true');
        sourceSvg.appendChild(host);
      }
      currentHost = host;
      setSvgHost(existing => existing === host ? existing : host);

      if (boundSvgRef.current !== sourceSvg) {
        unbindSvg();

        const handleRoofClick = event => {
          const target = event.target;
          if (!(target instanceof Element)) return;

          const polygon = target.closest('polygon');
          if (!polygon) return;
          if (polygon.closest('[data-map-panel-placement-layer]')) return;
          if (polygon.closest('clipPath')) return;

          const activePoints = normalizePoints(polygon.getAttribute('points') || '');
          const currentStage = stageRef.current;
          const roof = layoutRef.current?.roofs?.find(item => (
            normalizePoints(polygonPoints(item, currentStage.width, currentStage.height)) === activePoints
          ));

          if (!roof?.mapPolygon?.length) return;

          setSelectedRoofId(roof.id);
          setSelectedGroupId(roof.panelGroups?.[0]?.id || '');
          setWorkspaceOpen(true);
        };

        sourceSvg.addEventListener('click', handleRoofClick, true);
        boundSvgRef.current = sourceSvg;
        boundClickRef.current = handleRoofClick;
      }
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(canvasTarget, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['stroke', 'viewBox', 'src'],
    });

    return () => {
      observer.disconnect();
      unbindSvg();
      currentHost?.remove();
    };
  }, [canvasTarget]);

  const updateGroup = (groupId, updater) => {
    if (!selectedRoof) return;

    setLayout(current => ({
      ...current,
      roofs: current.roofs.map(roof => (
        String(roof.id) === String(selectedRoof.id)
          ? {
            ...roof,
            panelGroups: (roof.panelGroups || []).map(group => (
              String(group.id) === String(groupId) ? updater(group, roof) : group
            )),
          }
          : roof
      )),
    }));
  };

  const addGroup = () => {
    if (!selectedRoof?.mapPolygon?.length) return;

    const group = createGroup((selectedRoof.panelGroups || []).length + 1);
    setLayout(current => ({
      ...current,
      roofs: current.roofs.map(roof => (
        String(roof.id) === String(selectedRoof.id)
          ? { ...roof, panelGroups: [...(roof.panelGroups || []), group] }
          : roof
      )),
    }));
    setSelectedGroupId(group.id);
    setWorkspaceOpen(true);
  };

  const deleteGroup = () => {
    if (!selectedRoof || !selectedGroup) return;

    const nextGroups = (selectedRoof.panelGroups || [])
      .filter(group => String(group.id) !== String(selectedGroup.id));

    setLayout(current => ({
      ...current,
      roofs: current.roofs.map(roof => (
        String(roof.id) === String(selectedRoof.id)
          ? { ...roof, panelGroups: nextGroups }
          : roof
      )),
    }));
    setSelectedGroupId(nextGroups[0]?.id || '');
  };

  const applyDrag = (drag, dxM, dyM) => {
    setLayout(current => ({
      ...current,
      roofs: current.roofs.map(roof => {
        if (String(roof.id) !== String(drag.roofId)) return roof;

        return {
          ...roof,
          panelGroups: (roof.panelGroups || []).map(group => {
            if (String(group.id) !== String(drag.groupId)) return group;

            const base = drag.baseGroup;
            const product = panelProductForRoof(roof, panelProducts);

            if (drag.mode === 'panel') {
              const size = panelSize(base.orientation, product);
              const position = panelPosition(base, roof, product, drag.row, drag.col);

              return {
                ...base,
                panelOverrides: {
                  ...(base.panelOverrides || {}),
                  [`${drag.row}-${drag.col}`]: {
                    xM: clamp(
                      position.xM + dxM,
                      0,
                      Math.max(0, positive(roof.widthM, 8) - size.w),
                    ),
                    yM: clamp(
                      position.yM + dyM,
                      0,
                      Math.max(0, positive(roof.roofFallM, 6) - size.h),
                    ),
                  },
                },
              };
            }

            const size = groupSize(base, roof, panelProducts);
            const nextX = clamp(
              number(base.xM) + dxM,
              0,
              Math.max(0, positive(roof.widthM, 8) - size.w),
            );
            const nextY = clamp(
              number(base.yM) + dyM,
              0,
              Math.max(0, positive(roof.roofFallM, 6) - size.h),
            );
            const realDx = nextX - number(base.xM);
            const realDy = nextY - number(base.yM);

            return {
              ...base,
              xM: nextX,
              yM: nextY,
              panelOverrides: Object.fromEntries(
                Object.entries(base.panelOverrides || {}).map(([key, value]) => [
                  key,
                  {
                    xM: number(value.xM) + realDx,
                    yM: number(value.yM) + realDy,
                  },
                ]),
              ),
            };
          }),
        };
      }),
    }));
  };

  const beginWorkspaceDrag = (event, group, row, col) => {
    if (!selectedRoof || !workspaceSvgRef.current) return;

    const point = svgPoint(workspaceSvgRef.current, event);
    if (!point) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    dragRef.current = {
      roofId: selectedRoof.id,
      groupId: group.id,
      row,
      col,
      mode: dragMode,
      point,
      baseGroup: {
        ...group,
        panelOverrides: Object.fromEntries(
          Object.entries(group.panelOverrides || {}).map(([key, value]) => [
            key,
            { ...value },
          ]),
        ),
      },
    };

    setSelectedGroupId(group.id);
  };

  const moveWorkspaceDrag = event => {
    const drag = dragRef.current;
    if (!drag || !workspaceSvgRef.current) return;

    const point = svgPoint(workspaceSvgRef.current, event);
    if (!point) return;

    event.preventDefault();
    const dxM = point.x - drag.point.x;
    const dyM = point.y - drag.point.y;
    applyDrag(drag, dxM, dyM);
  };

  const endWorkspaceDrag = event => {
    if (!dragRef.current) return;
    event?.stopPropagation?.();
    dragRef.current = null;
  };

  const renderMapPanels = (roof, withLabels = false) => {
    if (!roof?.mapPolygon?.length) return null;

    const frame = roofFrame(roof, stage.width, stage.height);
    if (!frame) return null;

    const product = panelProductForRoof(roof, panelProducts);

    return (roof.panelGroups || []).flatMap(group => {
      const rows = Math.max(1, Math.round(number(group.rows, 1)));
      const cols = Math.max(1, Math.round(number(group.cols, 1)));
      const size = panelSize(group.orientation, product);
      const items = [];

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const position = panelPosition(group, roof, product, row, col);
          const geometry = panelGeometry(frame, position.xM, position.yM, size.w, size.h);
          const fontSize = clamp(Math.min(size.w, size.h) * frame.scale * 0.22, 5, 11);

          items.push(
            <g key={`${group.id}-${row}-${col}`} pointerEvents="none">
              <polygon
                points={geometry.points}
                fill="#dbeafe"
                stroke="#2563eb"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={geometry.thirdTop.x}
                y1={geometry.thirdTop.y}
                x2={geometry.thirdBottom.x}
                y2={geometry.thirdBottom.y}
                stroke="#93c5fd"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={geometry.twoThirdTop.x}
                y1={geometry.twoThirdTop.y}
                x2={geometry.twoThirdBottom.x}
                y2={geometry.twoThirdBottom.y}
                stroke="#93c5fd"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              {withLabels && (
                <text
                  x={geometry.center.x}
                  y={geometry.center.y + fontSize * 0.35}
                  textAnchor="middle"
                  fontSize={fontSize}
                  fontWeight="800"
                  fill="#1d4ed8"
                  transform={`rotate(${frame.angleDeg} ${geometry.center.x} ${geometry.center.y})`}
                >
                  {row + 1}:{col + 1}
                </text>
              )}
            </g>,
          );
        }
      }

      return items;
    });
  };

  const roofWidthM = positive(selectedRoof?.widthM, 10);
  const roofHeightM = positive(selectedRoof?.roofFallM, 8);
  const previewHeight = clamp(canvasSize.height * 0.28, 165, 235);
  const previewAspect = canvasSize.width > 0 ? canvasSize.width / previewHeight : 2.6;
  const focusedMapViewBox = mapFocusViewBox(
    selectedRoof,
    stage.width,
    stage.height,
    previewAspect,
  );

  const mapOverlay = svgHost && selectedRoof?.mapPolygon?.length ? (
    <>
      <defs>
        <clipPath id={`map-panel-clip-${selectedRoof.id}`}>
          <polygon points={polygonPoints(selectedRoof, stage.width, stage.height)} />
        </clipPath>
      </defs>
      <g
        clipPath={`url(#map-panel-clip-${selectedRoof.id})`}
        data-map-panel-overlay="true"
      >
        {renderMapPanels(selectedRoof, true)}
      </g>
    </>
  ) : null;

  const workspace = canvasTarget && workspaceOpen && selectedRoof?.mapPolygon?.length ? (
    <div
      data-map-split-workspace="true"
      className="absolute inset-0 z-[80] grid overflow-hidden rounded-2xl border border-slate-300 bg-slate-300 shadow-inner"
      style={{ gridTemplateRows: `${previewHeight}px minmax(0, 1fr)` }}
    >
      <div className="relative overflow-hidden border-b-2 border-slate-700 bg-slate-950">
        <svg
          viewBox={focusedMapViewBox}
          preserveAspectRatio="xMidYMid slice"
          className="h-full w-full"
        >
          {mapImageSrc ? (
            <image
              href={mapImageSrc}
              x="0"
              y="0"
              width={stage.width}
              height={stage.height}
              preserveAspectRatio="none"
            />
          ) : (
            <rect width={stage.width} height={stage.height} fill="#cbd5e1" />
          )}

          {layout.roofs
            .filter(roof => roof?.mapPolygon?.length)
            .map(roof => {
              const active = String(roof.id) === String(selectedRoof.id);
              return (
                <polygon
                  key={roof.id}
                  points={polygonPoints(roof, stage.width, stage.height)}
                  fill={active ? 'rgba(249,115,22,.16)' : 'rgba(37,99,235,.08)'}
                  stroke={active ? '#f97316' : '#2563eb'}
                  strokeWidth={active ? '3' : '2'}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}

          <defs>
            <clipPath id={`top-map-clip-${selectedRoof.id}`}>
              <polygon points={polygonPoints(selectedRoof, stage.width, stage.height)} />
            </clipPath>
          </defs>
          <g clipPath={`url(#top-map-clip-${selectedRoof.id})`}>
            {renderMapPanels(selectedRoof, false)}
          </g>
        </svg>

        <div className="absolute left-3 top-3 rounded-lg border border-white/60 bg-white/95 px-3 py-2 shadow">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange-600">
            Live på kartbilden
          </div>
          <div className="text-xs font-semibold text-slate-900">
            {selectedRoof.name} · {roofWidthM.toFixed(2)} × {roofHeightM.toFixed(2)} m
          </div>
        </div>

        <button
          type="button"
          onClick={() => setWorkspaceOpen(false)}
          className="absolute right-3 top-3 inline-flex items-center gap-2 rounded-lg border border-white/70 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-700 shadow hover:bg-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Tillbaka till kartan
        </button>
      </div>

      <div className="relative min-h-0 overflow-hidden bg-[#aeb6be]">
        <div className="absolute left-3 top-3 z-10 rounded-lg border border-white/70 bg-white/90 px-3 py-2 shadow">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-purple-700">
            Skalenlig arbetsyta
          </div>
          <div className="text-xs font-semibold text-slate-900">
            {panelLabel(selectedProduct)} · {positive(selectedProduct?.width_mm, 1134)} × {positive(selectedProduct?.height_mm, 1762)} mm
          </div>
        </div>

        <svg
          ref={workspaceSvgRef}
          data-map-workspace-svg="true"
          viewBox={`0 0 ${roofWidthM} ${roofHeightM}`}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 h-full w-full touch-none"
          onPointerMove={moveWorkspaceDrag}
          onPointerUp={endWorkspaceDrag}
          onPointerCancel={endWorkspaceDrag}
          onPointerLeave={endWorkspaceDrag}
        >
          <rect
            x="0"
            y="0"
            width={roofWidthM}
            height={roofHeightM}
            fill="transparent"
            stroke="rgba(255,255,255,.75)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />

          <defs>
            <clipPath id={`workspace-roof-clip-${selectedRoof.id}`}>
              <rect x="0" y="0" width={roofWidthM} height={roofHeightM} />
            </clipPath>
          </defs>

          <g clipPath={`url(#workspace-roof-clip-${selectedRoof.id})`}>
            {(selectedRoof.panelGroups || []).map(group => {
              const rows = Math.max(1, Math.round(number(group.rows, 1)));
              const cols = Math.max(1, Math.round(number(group.cols, 1)));
              const size = panelSize(group.orientation, selectedProduct);
              const selected = String(group.id) === String(selectedGroup?.id);
              const bounds = groupBounds(group, selectedRoof, selectedProduct);
              const panels = [];

              for (let row = 0; row < rows; row += 1) {
                for (let col = 0; col < cols; col += 1) {
                  const position = panelPosition(group, selectedRoof, selectedProduct, row, col);
                  const fontSize = Math.max(0.11, Math.min(size.w, size.h) * 0.18);

                  panels.push(
                    <g
                      key={`${group.id}-${row}-${col}`}
                      className="cursor-move"
                      onPointerDown={event => beginWorkspaceDrag(event, group, row, col)}
                    >
                      <rect
                        x={position.xM}
                        y={position.yM}
                        width={size.w}
                        height={size.h}
                        rx="0.04"
                        fill="#dbeafe"
                        stroke="#2563eb"
                        strokeWidth="1.5"
                        vectorEffect="non-scaling-stroke"
                      />
                      <line
                        x1={position.xM + size.w / 3}
                        y1={position.yM}
                        x2={position.xM + size.w / 3}
                        y2={position.yM + size.h}
                        stroke="#93c5fd"
                        strokeWidth="1"
                        vectorEffect="non-scaling-stroke"
                        pointerEvents="none"
                      />
                      <line
                        x1={position.xM + size.w * 2 / 3}
                        y1={position.yM}
                        x2={position.xM + size.w * 2 / 3}
                        y2={position.yM + size.h}
                        stroke="#93c5fd"
                        strokeWidth="1"
                        vectorEffect="non-scaling-stroke"
                        pointerEvents="none"
                      />
                      <text
                        x={position.xM + size.w / 2}
                        y={position.yM + size.h / 2 + fontSize * 0.35}
                        textAnchor="middle"
                        fontSize={fontSize}
                        fontWeight="800"
                        fill="#1d4ed8"
                        pointerEvents="none"
                      >
                        {row + 1}:{col + 1}
                      </text>
                    </g>,
                  );
                }
              }

              return (
                <g key={group.id}>
                  {selected && bounds && (
                    <rect
                      x={bounds.x}
                      y={bounds.y}
                      width={bounds.w}
                      height={bounds.h}
                      fill="none"
                      stroke="#7c3aed"
                      strokeWidth="2.5"
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="none"
                    />
                  )}
                  {panels}
                </g>
              );
            })}
          </g>
        </svg>

        {!selectedRoof.panelGroups?.length && (
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              type="button"
              onClick={addGroup}
              className="rounded-xl border border-dashed border-white/80 bg-white/90 px-5 py-4 text-sm font-semibold text-slate-700 shadow"
            >
              <Plus className="mr-2 inline h-4 w-4" />
              Lägg till panelgrupp
            </button>
          </div>
        )}
      </div>
    </div>
  ) : null;

  const toolbar = svgHost ? (
    <div className="flex flex-col items-center gap-1">
      <ToolButton
        active={workspaceOpen}
        disabled={!selectedRoof?.mapPolygon?.length}
        onClick={() => setWorkspaceOpen(current => !current)}
      />
    </div>
  ) : null;

  const settings = svgHost ? (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <PanelTop className="h-4 w-4" />
          Paneler på aktivt tak
        </div>
        <span className="text-xs text-slate-500">{panelCount} st</span>
      </div>

      <div className="mt-2 rounded-xl border border-blue-200 bg-blue-50 px-2.5 py-2 text-xs text-blue-900">
        <div className="font-semibold">{panelLabel(selectedProduct)}</div>
        <div className="mt-0.5 text-blue-700">
          {positive(selectedProduct?.width_mm, 1134)} × {positive(selectedProduct?.height_mm, 1762)} mm
        </div>
      </div>

      <div className="mt-2 text-xs leading-4 text-slate-500">
        Klicka på en ritad takyta. Kartbilden låses då högst upp och en stor skalenlig arbetsyta öppnas under.
      </div>

      {selectedRoof?.mapPolygon?.length && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setWorkspaceOpen(current => !current)}
          className="mt-3 w-full gap-2"
        >
          <PanelTop className="h-4 w-4" />
          {workspaceOpen ? 'Stäng arbetsyta' : 'Öppna arbetsyta'}
        </Button>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setDragMode('group')}
          className={`rounded-xl border px-2 py-2 text-xs font-semibold ${
            dragMode === 'group'
              ? 'border-orange-300 bg-orange-50 text-orange-700'
              : 'border-slate-200 text-slate-600'
          }`}
        >
          Flytta grupp
        </button>
        <button
          type="button"
          onClick={() => setDragMode('panel')}
          className={`rounded-xl border px-2 py-2 text-xs font-semibold ${
            dragMode === 'panel'
              ? 'border-orange-300 bg-orange-50 text-orange-700'
              : 'border-slate-200 text-slate-600'
          }`}
        >
          Flytta panel
        </button>
      </div>

      {(selectedRoof?.panelGroups || []).length ? (
        <>
          <div className="mt-3 space-y-1.5">
            {(selectedRoof.panelGroups || []).map(group => (
              <button
                key={group.id}
                type="button"
                onClick={() => {
                  setSelectedGroupId(group.id);
                  setWorkspaceOpen(true);
                }}
                className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-xs ${
                  String(group.id) === String(selectedGroup?.id)
                    ? 'border-purple-300 bg-purple-50 text-purple-800'
                    : 'border-slate-200 text-slate-600'
                }`}
              >
                <span className="font-semibold">{group.name}</span>
                <span>
                  {Math.max(1, Math.round(number(group.rows, 1)))} × {Math.max(1, Math.round(number(group.cols, 1)))}
                </span>
              </button>
            ))}
          </div>

          {selectedGroup && (
            <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] font-medium text-slate-500">
                  Rader
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={selectedGroup.rows || 1}
                    onChange={event => updateGroup(
                      selectedGroup.id,
                      group => ({
                        ...group,
                        rows: Math.max(1, Number(event.target.value) || 1),
                        panelOverrides: {},
                      }),
                    )}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-[11px] font-medium text-slate-500">
                  Kolumner
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={selectedGroup.cols || 1}
                    onChange={event => updateGroup(
                      selectedGroup.id,
                      group => ({
                        ...group,
                        cols: Math.max(1, Number(event.target.value) || 1),
                        panelOverrides: {},
                      }),
                    )}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                  />
                </label>
              </div>

              <label className="block text-[11px] font-medium text-slate-500">
                Orientering
                <select
                  value={selectedGroup.orientation || 'Stående'}
                  onChange={event => updateGroup(
                    selectedGroup.id,
                    group => ({
                      ...group,
                      orientation: event.target.value,
                      panelOverrides: {},
                    }),
                  )}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                >
                  <option>Stående</option>
                  <option>Liggande</option>
                </select>
              </label>

              <button
                type="button"
                onClick={deleteGroup}
                className="inline-flex items-center gap-1 text-xs font-medium text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Ta bort aktiv panelgrupp
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-slate-300 p-3 text-center text-xs text-slate-500">
          Det finns ingen panelgrupp på detta tak.
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={addGroup}
        disabled={!selectedRoof?.mapPolygon?.length}
        className="mt-3 w-full gap-2"
      >
        <Plus className="h-4 w-4" />
        Lägg till panelgrupp
      </Button>
    </section>
  ) : null;

  return (
    <>
      {svgHost && mapOverlay && createPortal(mapOverlay, svgHost)}
      {canvasTarget && workspace && createPortal(workspace, canvasTarget)}
      {toolbarTarget && toolbar && createPortal(toolbar, toolbarTarget)}
      {settingsTarget && settings && createPortal(settings, settingsTarget)}
    </>
  );
}
