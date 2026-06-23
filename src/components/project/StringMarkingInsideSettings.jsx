import React, { useEffect, useRef } from 'react';
import StringMarkingEntry from './StringMarkingEntry.jsx';

export default function StringMarkingInsideSettings(props) {
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    let control = null;
    let placeholder = null;
    let inspector = null;

    const placeSelector = () => {
      const nextControl = root.querySelector('.string-inverter-control');
      const nextInspector = root.querySelector('aside[class*="w-[310px]"]');
      const settingsList = nextInspector?.querySelector(':scope > div.space-y-3');
      if (!nextControl || !nextInspector || !settingsList) return;

      control = nextControl;
      inspector = nextInspector;

      if (!placeholder) {
        placeholder = document.createComment('string-inverter-control-origin');
        control.parentNode?.insertBefore(placeholder, control);
      }

      if (control.parentNode !== settingsList || settingsList.firstChild !== control) {
        settingsList.prepend(control);
      }

      control.style.setProperty('position', 'static', 'important');
      control.style.setProperty('inset', 'auto', 'important');
      control.style.setProperty('width', '100%', 'important');
      control.style.setProperty('z-index', 'auto', 'important');
      control.style.setProperty('box-shadow', 'none', 'important');
      inspector.style.setProperty('padding-top', '0.75rem', 'important');
    };

    placeSelector();
    const observer = new MutationObserver(placeSelector);
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (control && placeholder?.parentNode) placeholder.parentNode.insertBefore(control, placeholder);
      placeholder?.remove();
      control?.style.removeProperty('position');
      control?.style.removeProperty('inset');
      control?.style.removeProperty('width');
      control?.style.removeProperty('z-index');
      control?.style.removeProperty('box-shadow');
      inspector?.style.removeProperty('padding-top');
    };
  }, []);

  return (
    <div ref={rootRef}>
      <StringMarkingEntry {...props} />
    </div>
  );
}
