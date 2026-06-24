import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const states = new WeakMap();
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const num = value => Number.parseFloat(String(value || '').replace('px', '')) || 0;

function parts() {
  const host = document.querySelector('[data-map-host="canvas"]');
  const image = host?.querySelector('img[alt="Kartbild"]') || null;
  const layer = image?.parentElement || null;
  const viewport = layer?.parentElement || null;
  const workspace = host?.querySelector('[data-map-split-workspace]') || null;
  return { host, image, layer, viewport, workspace };
}

function limits(viewport, layer, image) {
  const width = num(layer?.style.width) || image?.naturalWidth || 1600;
  const height = num(layer?.style.height) || image?.naturalHeight || 1000;
  const rect = viewport.getBoundingClientRect();
  const fit = Math.min(rect.width / width, rect.height / height);
  const safeFit = Number.isFinite(fit) && fit > 0 ? fit : 1;
  return { width, height, viewportWidth: rect.width, viewportHeight: rect.height, fit: safeFit, max: Math.max(safeFit, 1) };
}

function clampState(state, box) {
  state.scale = clamp(state.scale, box.fit, box.max);
  const maxX = Math.max(0, (box.width * state.scale - box.viewportWidth) / 2);
  const maxY = Math.max(0, (box.height * state.scale - box.viewportHeight) / 2);
  state.x = clamp(state.x, -maxX, maxX);
  state.y = clamp(state.y, -maxY, maxY);
  if (state.scale <= box.fit + 0.0001) {
    state.scale = box.fit;
    state.x = 0;
    state.y = 0;
  }
}

function apply(reset = false) {
  const { image, layer, viewport } = parts();
  if (!image || !layer || !viewport) return null;
  const box = limits(viewport, layer, image);
  let state = states.get(layer);
  if (!state) {
    state = { scale: box.fit, x: 0, y: 0, fit: box.fit };
    states.set(layer, state);
  }
  const wasFit = Math.abs(state.scale - state.fit) < 0.001;
  state.fit = box.fit;
  if (reset || wasFit) {
    state.scale = box.fit;
    state.x = 0;
    state.y = 0;
  }
  clampState(state, box);
  layer.style.left = `calc(50% + ${state.x}px)`;
  layer.style.top = `calc(50% + ${state.y}px)`;
  layer.style.transform = `translate(-50%, -50%) scale(${state.scale})`;
  layer.style.transformOrigin = 'center center';
  layer.style.cursor = state.scale > state.fit + 0.0001 ? 'grab' : 'default';
  image.style.imageRendering = 'auto';
  return { state, box, image, layer, viewport };
}

function zoom(delta) {
  const current = apply();
  if (!current) return;
  current.state.scale += delta;
  clampState(current.state, current.box);
  apply();
}

function resetMap() {
  apply(true);
}

function isActiveTool(title) {
  const button = document.querySelector(`button[title="${title}"]`);
  return Boolean(button && String(button.className).includes('bg-orange-50'));
}

function roofPolygons() {
  const { layer } = parts();
  const svg = layer?.querySelector(':scope > svg');
  if (!svg) return [];
  return Array.from(svg.querySelectorAll('polygon')).filter(item => !item.closest('[data-map-panel-placement-layer]') && !item.closest('clipPath'));
}

function bindRoofClicks() {
  roofPolygons().forEach(polygon => {
    if (polygon.dataset.preventMapFocus) return;
    polygon.dataset.preventMapFocus = '1';
    polygon.addEventListener('click', event => {
      if (isActiveTool('Redigera eller flytta taklinjer')) return;
      event.preventDefault();
      event.stopPropagation();
    });
  });
}

function bindRoofList() {
  const settings = document.querySelector('[data-map-host="settings"]');
  const section = Array.from(settings?.querySelectorAll('section') || []).find(item => /Takpolygoner/.test(item.textContent || ''));
  if (!section) return;
  const buttons = Array.from(section.querySelectorAll('button')).filter(button => !button.querySelector('svg'));
  buttons.forEach((button, index) => {
    if (button.dataset.openMapWorkspace) return;
    button.dataset.openMapWorkspace = '1';
    button.addEventListener('click', event => {
      const polygon = roofPolygons()[index];
      if (!polygon) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      polygon.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    }, true);
  });
}

function bindControls() {
  const controls = {
    'Zooma in': () => zoom(0.12),
    'Zooma ut': () => zoom(-0.12),
    'Centrera bild': resetMap,
    'Visa hela kartbilden': resetMap,
  };
  Object.entries(controls).forEach(([title, action]) => {
    document.querySelectorAll(`button[title="${title}"]`).forEach(button => {
      if (button.dataset.fixedMapControl) return;
      button.dataset.fixedMapControl = '1';
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        action();
      }, true);
    });
  });
  document.querySelectorAll('button').forEach(button => {
    if ((button.textContent || '').trim() !== 'Tillbaka till kartan' || button.dataset.fixedMapBack) return;
    button.dataset.fixedMapBack = '1';
    button.addEventListener('click', () => window.setTimeout(resetMap, 0));
  });
}

function parsePoints(polygon) {
  return String(polygon?.getAttribute('points') || '').trim().split(/\s+/)
    .map(value => value.split(',').map(Number))
    .filter(value => value.length === 2 && value.every(Number.isFinite));
}

function fitPreview(workspace) {
  const top = workspace?.firstElementChild;
  const svg = top?.querySelector('svg');
  const image = svg?.querySelector('image');
  const polygon = Array.from(svg?.querySelectorAll('polygon') || []).find(item => item.getAttribute('stroke') === '#f97316');
  const points = parsePoints(polygon);
  if (!svg || !image || points.length < 3) return;
  const stageWidth = Number(image.getAttribute('width')) || 1600;
  const stageHeight = Number(image.getAttribute('height')) || 1000;
  const rect = top.getBoundingClientRect();
  if (!(rect.width > 0) || !(rect.height > 0)) return;

  const minX = Math.min(...points.map(point => point[0]));
  const maxX = Math.max(...points.map(point => point[0]));
  const minY = Math.min(...points.map(point => point[1]));
  const maxY = Math.max(...points.map(point => point[1]));
  const polygonWidth = Math.max(1, maxX - minX);
  const polygonHeight = Math.max(1, maxY - minY);
  const padding = Math.max(polygonWidth, polygonHeight) * 0.14;
  let width = Math.max(polygonWidth + padding * 2, Math.min(stageWidth, rect.width));
  let height = Math.max(polygonHeight + padding * 2, Math.min(stageHeight, rect.height));
  const aspect = rect.width / rect.height;
  if (width / height < aspect) width = height * aspect;
  else height = width / aspect;
  width = Math.min(stageWidth, width);
  height = Math.min(stageHeight, height);
  const x = clamp((minX + maxX) / 2 - width / 2, 0, Math.max(0, stageWidth - width));
  const y = clamp((minY + maxY) / 2 - height / 2, 0, Math.max(0, stageHeight - height));
  const viewBox = `${x} ${y} ${width} ${height}`;
  if (svg.getAttribute('viewBox') !== viewBox) svg.setAttribute('viewBox', viewBox);
  if (svg.getAttribute('preserveAspectRatio') !== 'xMidYMid meet') svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  if (image.getAttribute('preserveAspectRatio') !== 'none') image.setAttribute('preserveAspectRatio', 'none');
}

function toggleManualPlanner(host, active) {
  const area = host?.parentElement;
  if (!area) return;
  Array.from(area.children).forEach(child => {
    if (child === host) return;
    if (active) {
      if (child.dataset.oldMapDisplay === undefined) child.dataset.oldMapDisplay = child.style.display || '';
      child.style.display = 'none';
    } else if (child.dataset.oldMapDisplay !== undefined) {
      child.style.display = child.dataset.oldMapDisplay;
      delete child.dataset.oldMapDisplay;
    }
  });
  if (active) {
    host.style.setProperty('top', '12px', 'important');
    host.style.setProperty('right', '12px', 'important');
    host.style.setProperty('bottom', '12px', 'important');
    host.style.setProperty('left', '12px', 'important');
    host.style.setProperty('height', 'auto', 'important');
    host.style.setProperty('max-height', 'none', 'important');
  }
}

function renamePanelView() {
  const settings = document.querySelector('[data-map-host="settings"]');
  Array.from(settings?.querySelectorAll('button') || []).forEach(button => {
    if ((button.textContent || '').trim() === 'Panelvy') button.textContent = 'Manuell takritning';
  });
}

export default function MapWorkbenchBehaviorFixV2() {
  const location = useLocation();

  useEffect(() => {
    if (!location.pathname.startsWith('/projects/')) return undefined;
    let drag = null;

    const sync = () => {
      const { host, workspace } = parts();
      toggleManualPlanner(host, Boolean(host?.firstElementChild));
      apply();
      if (workspace) fitPreview(workspace);
      bindRoofClicks();
      bindRoofList();
      bindControls();
      renamePanelView();
    };

    const down = event => {
      const current = apply();
      if (!current || !current.layer.contains(event.target) || !isActiveTool('Panorera kartbild')) return;
      if (current.state.scale <= current.state.fit + 0.0001) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      drag = { ...current, startX: event.clientX, startY: event.clientY, x: current.state.x, y: current.state.y };
    };
    const move = event => {
      if (!drag) return;
      event.preventDefault();
      drag.state.x = drag.x + event.clientX - drag.startX;
      drag.state.y = drag.y + event.clientY - drag.startY;
      clampState(drag.state, drag.box);
      apply();
    };
    const up = () => { drag = null; };

    document.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('resize', sync);
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(sync, 250);
    sync();

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      document.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('resize', sync);
      toggleManualPlanner(parts().host, false);
    };
  }, [location.pathname]);

  return null;
}
