import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const viewportState = new WeakMap();

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const px = value => Number.parseFloat(String(value || '').replace('px', '')) || 0;

function pointsFromPolygon(polygon) {
  return String(polygon?.getAttribute('points') || '')
    .trim()
    .split(/\s+/)
    .map(pair => pair.split(',').map(Number))
    .filter(pair => pair.length === 2 && pair.every(Number.isFinite));
}

function mapParts() {
  const host = document.querySelector('[data-map-host="canvas"]');
  const image = host?.querySelector('img[alt="Kartbild"]') || null;
  const imageLayer = image?.parentElement || null;
  const viewport = imageLayer?.parentElement || null;
  const workspace = host?.querySelector('[data-map-split-workspace]') || null;
  return { host, image, imageLayer, viewport, workspace };
}

function dimensions(imageLayer, image) {
  return {
    width: px(imageLayer?.style.width) || image?.naturalWidth || 1600,
    height: px(imageLayer?.style.height) || image?.naturalHeight || 1000,
  };
}

function calculateLimits(viewport, imageLayer, image) {
  const stage = dimensions(imageLayer, image);
  const rect = viewport.getBoundingClientRect();
  const fit = Math.min(rect.width / stage.width, rect.height / stage.height);
  return {
    stage,
    width: rect.width,
    height: rect.height,
    fit: Number.isFinite(fit) && fit > 0 ? fit : 1,
    max: Math.max(Number.isFinite(fit) && fit > 0 ? fit : 1, 1),
  };
}

function clampPosition(state, limits) {
  const renderedWidth = limits.stage.width * state.scale;
  const renderedHeight = limits.stage.height * state.scale;
  const maxX = Math.max(0, (renderedWidth - limits.width) / 2);
  const maxY = Math.max(0, (renderedHeight - limits.height) / 2);
  state.x = clamp(state.x, -maxX, maxX);
  state.y = clamp(state.y, -maxY, maxY);
  if (state.scale <= limits.fit + 0.0001) {
    state.scale = limits.fit;
    state.x = 0;
    state.y = 0;
  }
}

function applyTransform(viewport, imageLayer, image, reset = false) {
  if (!viewport || !imageLayer || !image) return null;
  const limits = calculateLimits(viewport, imageLayer, image);
  let state = viewportState.get(imageLayer);
  if (!state) {
    state = { scale: limits.fit, x: 0, y: 0, fit: limits.fit, max: limits.max };
    viewportState.set(imageLayer, state);
  }

  const wasAtFit = Math.abs(state.scale - state.fit) < 0.001;
  state.fit = limits.fit;
  state.max = limits.max;
  if (reset || wasAtFit) {
    state.scale = limits.fit;
    state.x = 0;
    state.y = 0;
  } else {
    state.scale = clamp(state.scale, limits.fit, limits.max);
  }
  clampPosition(state, limits);

  const left = `calc(50% + ${state.x}px)`;
  const top = `calc(50% + ${state.y}px)`;
  const transform = `translate(-50%, -50%) scale(${state.scale})`;
  if (imageLayer.style.left !== left) imageLayer.style.left = left;
  if (imageLayer.style.top !== top) imageLayer.style.top = top;
  if (imageLayer.style.transform !== transform) imageLayer.style.transform = transform;
  imageLayer.style.transformOrigin = 'center center';
  imageLayer.style.cursor = state.scale > state.fit + 0.0001 ? 'grab' : 'default';
  image.style.imageRendering = 'auto';
  return { state, limits };
}

function adjustZoom(delta) {
  const { image, imageLayer, viewport } = mapParts();
  const current = applyTransform(viewport, imageLayer, image);
  if (!current) return;
  current.state.scale = clamp(current.state.scale + delta, current.limits.fit, current.limits.max);
  clampPosition(current.state, current.limits);
  applyTransform(viewport, imageLayer, image);
}

function resetOverview() {
  const { image, imageLayer, viewport } = mapParts();
  applyTransform(viewport, imageLayer, image, true);
}

function isEditToolActive() {
  const button = document.querySelector('button[title="Redigera eller flytta taklinjer"]');
  return Boolean(button && String(button.className).includes('bg-orange-50'));
}

function isPanToolActive() {
  const button = document.querySelector('button[title="Panorera kartbild"]');
  return Boolean(button && String(button.className).includes('bg-orange-50'));
}

function sourceRoofPolygons() {
  const { imageLayer } = mapParts();
  const svg = imageLayer?.querySelector(':scope > svg');
  if (!svg) return [];
  return Array.from(svg.querySelectorAll('polygon')).filter(polygon => (
    !polygon.closest('[data-map-panel-placement-layer]')
    && !polygon.closest('clipPath')
  ));
}

function bindRoofClicks() {
  sourceRoofPolygons().forEach(polygon => {
    if (polygon.dataset.mapNoAutoFocus === 'true') return;
    polygon.dataset.mapNoAutoFocus = 'true';
    polygon.addEventListener('click', event => {
      if (isEditToolActive()) return;
      event.preventDefault();
      event.stopPropagation();
    });
  });
}

function bindSettingsRoofClicks() {
  const settings = document.querySelector('[data-map-host="settings"]');
  const section = Array.from(settings?.querySelectorAll('section') || [])
    .find(element => /Takpolygoner/.test(element.textContent || ''));
  if (!section) return;

  const roofButtons = Array.from(section.querySelectorAll('button')).filter(button => (
    !/Ta bort/.test(button.getAttribute('title') || '')
    && !button.querySelector('svg')
  ));

  roofButtons.forEach((button, index) => {
    if (button.dataset.mapOpenWorkspace === 'true') return;
    button.dataset.mapOpenWorkspace = 'true';
    button.addEventListener('click', event => {
      const polygon = sourceRoofPolygons()[index];
      if (!polygon) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      polygon.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    }, true);
  });
}

function bindMapControls() {
  const controls = [
    ['Zooma in', () => adjustZoom(0.12)],
    ['Zooma ut', () => adjustZoom(-0.12)],
    ['Centrera bild', resetOverview],
    ['Visa hela kartbilden', resetOverview],
  ];

  controls.forEach(([title, action]) => {
    document.querySelectorAll(`button[title="${title}"]`).forEach(button => {
      if (button.dataset.mapControlled === 'true') return;
      button.dataset.mapControlled = 'true';
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        action();
      }, true);
    });
  });

  document.querySelectorAll('button').forEach(button => {
    if ((button.textContent || '').trim() !== 'Tillbaka till kartan' || button.dataset.mapBackControlled === 'true') return;
    button.dataset.mapBackControlled = 'true';
    button.addEventListener('click', () => window.setTimeout(resetOverview, 0));
  });
}

function fitWorkspacePreview(workspace) {
  const top = workspace?.firstElementChild;
  const svg = top?.querySelector('svg');
  const image = svg?.querySelector('image');
  const polygon = Array.from(svg?.querySelectorAll('polygon') || [])
    .find(item => item.getAttribute('stroke') === '#f97316');
  const points = pointsFromPolygon(polygon);
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
  const targetAspect = rect.width / rect.height;
  if (width / height < targetAspect) width = height * targetAspect;
  else height = width / targetAspect;

  width = Math.min(stageWidth, width);
  height = Math.min(stageHeight, height);
  let x = (minX + maxX) / 2 - width / 2;
  let y = (minY + maxY) / 2 - height / 2;
  x = clamp(x, 0, Math.max(0, stageWidth - width));
  y = clamp(y, 0, Math.max(0, stageHeight - height));

  const viewBox = `${x} ${y} ${width} ${height}`;
  if (svg.getAttribute('viewBox') !== viewBox) svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  image.setAttribute('preserveAspectRatio', 'none');
}

function hideManualPlannerWhenMapActive(host, active) {
  const canvasArea = host?.parentElement;
  if (!canvasArea) return;
  canvasArea.dataset.panelMapActive = active ? 'true' : 'false';

  Array.from(canvasArea.children).forEach(child => {
    if (child === host) return;
    if (active) {
      if (!Object.prototype.hasOwnProperty.call(child.dataset, 'mapPreviousDisplay')) {
        child.dataset.mapPreviousDisplay = child.style.display || '';
      }
      child.style.display = 'none';
    } else if (Object.prototype.hasOwnProperty.call(child.dataset, 'mapPreviousDisplay')) {
      child.style.display = child.dataset.mapPreviousDisplay;
      delete child.dataset.mapPreviousDisplay;
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

function renameManualViewControl() {
  const settings = document.querySelector('[data-map-host="settings"]');
  Array.from(settings?.querySelectorAll('button') || []).forEach(button => {
    if ((button.textContent || '').trim() === 'Panelvy') button.textContent = 'Manuell takritning';
  });
}

export default function MapWorkbenchBehaviorFix() {
  const location = useLocation();

  useEffect(() => {
    if (!location.pathname.startsWith('/projects/')) return undefined;

    let drag = null;
    let syncing = false;

    const sync = () => {
      if (syncing) return;
      syncing = true;
      window.requestAnimationFrame(() => {
        const { host, image, imageLayer, viewport, workspace } = mapParts();
        const active = Boolean(image || workspace);
        hideManualPlannerWhenMapActive(host, active);
        if (image && imageLayer && viewport) applyTransform(viewport, imageLayer, image);
        if (workspace) fitWorkspacePreview(workspace);
        bindRoofClicks();
        bindSettingsRoofClicks();
        bindMapControls();
        renameManualViewControl();
        syncing = false;
      });
    };

    const pointerDown = event => {
      const { image, imageLayer, viewport } = mapParts();
      if (!imageLayer || !viewport || !imageLayer.contains(event.target) || !isPanToolActive()) return;
      const current = applyTransform(viewport, imageLayer, image);
      if (!current || current.state.scale <= current.state.fit + 0.0001) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      drag = {
        image,
        imageLayer,
        viewport,
        startX: event.clientX,
        startY: event.clientY,
        x: current.state.x,
        y: current.state.y,
      };
    };

    const pointerMove = event => {
      if (!drag) return;
      event.preventDefault();
      const current = applyTransform(drag.viewport, drag.imageLayer, drag.image);
      if (!current) return;
      current.state.x = drag.x + event.clientX - drag.startX;
      current.state.y = drag.y + event.clientY - drag.startY;
      clampPosition(current.state, current.limits);
      applyTransform(drag.viewport, drag.imageLayer, drag.image);
    };

    const pointerUp = () => { drag = null; };
    document.addEventListener('pointerdown', pointerDown, true);
    window.addEventListener('pointermove', pointerMove, { passive: false });
    window.addEventListener('pointerup', pointerUp);
    window.addEventListener('pointercancel', pointerUp);
    window.addEventListener('resize', sync);

    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'viewBox', 'preserveAspectRatio'],
    });
    sync();

    return () => {
      observer.disconnect();
      document.removeEventListener('pointerdown', pointerDown, true);
      window.removeEventListener('pointermove', pointerMove);
      window.removeEventListener('pointerup', pointerUp);
      window.removeEventListener('pointercancel', pointerUp);
      window.removeEventListener('resize', sync);
      const { host } = mapParts();
      hideManualPlannerWhenMapActive(host, false);
    };
  }, [location.pathname]);

  return null;
}
