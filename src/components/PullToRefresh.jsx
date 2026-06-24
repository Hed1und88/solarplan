import { useRef, useState, useEffect } from 'react';
import { Loader2, RefreshCw, ChevronDown } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

const PULL_THRESHOLD = 70;
const PULL_MAX = 100;
const RESISTANCE = 0.5;

export default function PullToRefresh({ onRefresh, children }) {
  const isMobile = useIsMobile();
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const stateRef = useRef({ startY: 0, pulling: false, distance: 0, refreshing: false });
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);

  useEffect(() => {
    if (!isMobile) return;

    const getScrollTop = () => {
      const main = document.querySelector('main');
      return main ? main.scrollTop : window.scrollY;
    };

    const handleTouchStart = (e) => {
      if (stateRef.current.refreshing) return;
      if (getScrollTop() <= 0) {
        stateRef.current.startY = e.touches[0].clientY;
        stateRef.current.pulling = true;
      } else {
        stateRef.current.pulling = false;
      }
    };

    const handleTouchMove = (e) => {
      if (!stateRef.current.pulling || stateRef.current.refreshing) return;
      const delta = e.touches[0].clientY - stateRef.current.startY;
      if (delta > 0) {
        const distance = Math.min(delta * RESISTANCE, PULL_MAX);
        stateRef.current.distance = distance;
        setPullDistance(distance);
        e.preventDefault();
      }
    };

    const handleTouchEnd = async () => {
      if (!stateRef.current.pulling) return;
      stateRef.current.pulling = false;
      const distance = stateRef.current.distance;
      stateRef.current.distance = 0;

      if (distance >= PULL_THRESHOLD) {
        stateRef.current.refreshing = true;
        setIsRefreshing(true);
        setPullDistance(PULL_THRESHOLD);
        try {
          await onRefreshRef.current?.();
        } finally {
          stateRef.current.refreshing = false;
          setIsRefreshing(false);
          setPullDistance(0);
        }
      } else {
        setPullDistance(0);
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isMobile]);

  if (!isMobile) return children;

  return (
    <>
      <div
        className="flex items-center justify-center overflow-hidden transition-all duration-200 ease-out"
        style={{ height: `${pullDistance}px` }}
      >
        <div className={`flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-opacity ${pullDistance > 0 || isRefreshing ? 'opacity-100' : 'opacity-0'}`}>
          {isRefreshing ? (
            <><Loader2 className="h-4 w-4 animate-spin text-primary" /> Uppdaterar...</>
          ) : pullDistance >= PULL_THRESHOLD ? (
            <><RefreshCw className="h-4 w-4 text-primary" /> Släpp för att uppdatera</>
          ) : (
            <><ChevronDown className="h-4 w-4" /> Dra ner för att uppdatera</>
          )}
        </div>
      </div>
      {children}
    </>
  );
}