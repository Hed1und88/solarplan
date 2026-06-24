import React from 'react';
import MapWorkbenchBehaviorController from './MapWorkbenchBehaviorController.jsx';
import MapViewportLock from './MapViewportLock.jsx';

export default function PanelMapViewportController() {
  return (
    <>
      <MapWorkbenchBehaviorController />
      <MapViewportLock />
    </>
  );
}
