import React from 'react';
import StringMarkingTabV7 from './StringMarkingTabV7.jsx';

export default function StringMarkingTabWorkspace(props) {
  return React.createElement(
    'div',
    { className: 'relative left-1/2 w-[calc(100vw-2rem)] max-w-[1800px] -translate-x-1/2' },
    React.createElement(StringMarkingTabV7, props),
  );
}
