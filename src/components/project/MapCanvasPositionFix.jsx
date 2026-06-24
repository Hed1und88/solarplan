import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const EXPECTED = {
  top: '12px',
  right: '12px',
  bottom: 'auto',
  left: '12px',
  height: 'calc(100vh - 175px)',
  maxHeight: 'calc(100% - 24px)',
  overflow: 'hidden',
};

function applyCanvasPosition() {
  const host = document.querySelector('[data-map-host="canvas"]');
  if (!host) return;

  Object.entries(EXPECTED).forEach(([property, value]) => {
    if (host.style.getPropertyValue(property) !== value || host.style.getPropertyPriority(property) !== 'important') {
      host.style.setProperty(property, value, 'important');
    }
  });
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

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [location.pathname]);

  return null;
}
