import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const EDGE_GAP = 12;
const MIN_CANVAS_HEIGHT = 240;

function visibleViewportHeight() {
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

  const viewportHeight = visibleViewportHeight();
  const hostTop = host.getBoundingClientRect().top;
  const availableHeight = viewportHeight - Math.max(0, hostTop) - EDGE_GAP;
  const maximumHeight = Math.max(MIN_CANVAS_HEIGHT, viewportHeight - EDGE_GAP * 2);
  const nextHeight = Math.max(
    MIN_CANVAS_HEIGHT,
    Math.min(Math.floor(availableHeight), maximumHeight),
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

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style'],
    });

    schedule();
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [location.pathname]);

  return null;
}
