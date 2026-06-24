import React from 'react';
import MapWorkbenchBehaviorController from './MapWorkbenchBehaviorController.jsx';
import MapViewportLock from './MapViewportLock.jsx';
import MapCanvasPositionFix from './MapCanvasPositionFix.jsx';

export default function PanelMapViewportController() {
  return (
    <>
      <MapWorkbenchBehaviorController />
      <MapViewportLock />
      <MapCanvasPositionFix />
    </>
  );
}
