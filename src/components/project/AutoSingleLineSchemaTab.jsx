import React, { useMemo } from 'react';
import AutoSingleLineSchemaView from './AutoSingleLineSchemaView.jsx';
import { normalizeStringProductContext } from '@/lib/stringProductContext';

export default function AutoSingleLineSchemaEntry(props) {
  const context = useMemo(
    () => normalizeStringProductContext(props.project || {}, props.products || []),
    [props.project?.string_layout_data, props.project?.solar_roof_planner_data, props.project?.panel_layout_data, props.products],
  );
  return React.createElement(AutoSingleLineSchemaView, { ...props, project: context.project, products: context.products });
}
