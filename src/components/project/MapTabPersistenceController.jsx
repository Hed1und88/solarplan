import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

function projectIdFromPath(pathname = '') {
  const match = pathname.match(/^\/projects\/([^/]+)/);
  return match?.[1] || '';
}

function panelTab() {
  return Array.from(document.querySelectorAll('[role="tab"]'))
    .find(tab => /^\s*Paneler\s*$/i.test(tab.textContent || '')) || null;
}

function mapButton() {
  return document.querySelector('[data-map-host="toolbar"] button[title="Kartbild"]')
    || document.querySelector('button[title="Kartbild"]');
}

function mapIsActive(button) {
  if (!button) return false;
  return String(button.className || '').includes('bg-orange-50')
    || button.getAttribute('aria-pressed') === 'true'
    || button.getAttribute('data-state') === 'active';
}

export default function MapTabPersistenceController() {
  const location = useLocation();

  useEffect(() => {
    if (!location.pathname.startsWith('/projects/')) return undefined;

    const projectId = projectIdFromPath(location.pathname);
    const storageKey = projectId ? `solarplan:project:${projectId}:map-view-present` : '';
    let retryTimer = 0;

    const rememberVisibleMap = () => {
      const image = document.querySelector('[data-map-host="canvas"] img[alt="Kartbild"]');
      if (image?.src && storageKey) window.sessionStorage.setItem(storageKey, '1');
      return Boolean(image?.src);
    };

    const shouldRestoreMap = () => {
      if (rememberVisibleMap()) return true;
      if (storageKey && window.sessionStorage.getItem(storageKey) === '1') return true;
      const settings = document.querySelector('[data-map-host="settings"]');
      return Boolean(settings && /Sparad kartbild|Lokalt sparad kartbild/i.test(settings.textContent || ''));
    };

    const restore = (attempt = 0) => {
      const tab = panelTab();
      if (!tab || tab.getAttribute('data-state') !== 'active') return;
      if (!shouldRestoreMap()) return;

      const button = mapButton();
      if (!button) {
        if (attempt < 30) retryTimer = window.setTimeout(() => restore(attempt + 1), 100);
        return;
      }

      if (!mapIsActive(button)) {
        button.click();
        retryTimer = window.setTimeout(() => restore(attempt + 1), 100);
      }
    };

    const sync = () => {
      rememberVisibleMap();
      restore();
    };

    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-state', 'class', 'src'],
    });

    const interval = window.setInterval(sync, 250);
    window.addEventListener('solarplan:map-layout-change', sync);
    sync();

    return () => {
      observer.disconnect();
      window.clearInterval(interval);
      window.clearTimeout(retryTimer);
      window.removeEventListener('solarplan:map-layout-change', sync);
    };
  }, [location.pathname]);

  return null;
}
