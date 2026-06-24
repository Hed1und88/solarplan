import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const EDGE_GAP = 12;
const WORKSPACE_VERTICAL_OFFSET = 175;
const MIN_CANVAS_HEIGHT = 320;

function viewportHeight() {
  return window.visualViewport?.height
    || document.documentElement.clientHeight
    || window.innerHeight
    || 720;
}

function applyCanvasPosition() {
  const host = document.querySelector('[data-map-host="canvas"]');
  if (!host) return;

  host.style.setProperty('top', `${EDGE_GAP}px`, 'important');
  host.style.setProperty('right', `${EDGE_GAP}px`, 'important');
  host.style.setProperty('bottom', 'auto', 'important');
  host.style.setProperty('left', `${EDGE_GAP}px`, 'important');
  host.style.setProperty('overflow', 'hidden', 'important');
  host.style.setProperty('min-height', '0', 'important');

  // Height is based only on the browser/preview viewport. It must not change
  // when the document is scrolled and the canvas gets a different screen Y-position.
  const nextHeight = Math.max(
    MIN_CANVAS_HEIGHT,
    Math.floor(viewportHeight() - WORKSPACE_VERTICAL_OFFSET),
  );
  const height = `${nextHeight}px`;
  const heightChanged = host.style.getPropertyValue('height') !== height
    || host.style.getPropertyPriority('height') !== 'important'
    || host.style.getPropertyValue('max-height') !== height
    || host.style.getPropertyPriority('max-height') !== 'important';

  if (heightChanged) {
    host.style.setProperty('height', height, 'important');
    host.style.setProperty('max-height', height, 'important');
    window.dispatchEvent(new CustomEvent('solarplan:map-viewport-resized'));
  }
}

export default function MapCanvasPositionFix() {
  const location = useLocation();

  useEffect(() => {
    if (!location.pathname.startsWith('/projects/')) return undefined;

    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        applyCanvasPosition();
      });
    };

    // Watch only for the map host being mounted/replaced. Page scrolling must
    // never trigger a recalculation of the map height.
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    schedule();
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [location.pathname]);

  return null;
}
