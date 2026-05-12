import React, { useMemo } from 'react';
import StringMarkingTabV7 from '@/components/project/StringMarkingTabV7';
import {
  compactStringLayoutForServer,
  readBestStringLayout,
  safeParseJson,
  writeStringLayoutBackup,
} from '@/lib/stringLayoutStorage';

export default function StringMarkingTabV8({ project, onUpdate, selectedProduct }) {
  const bestLayout = useMemo(() => readBestStringLayout(project), [project?.id, project?.string_layout_data]);
  const projectWithBestStringLayout = useMemo(() => {
    if (!bestLayout) return project;
    return { ...project, string_layout_data: JSON.stringify(bestLayout) };
  }, [project, bestLayout]);

  const safeUpdate = async (patch = {}) => {
    if (!patch.string_layout_data) return onUpdate?.(patch);

    const fullLayout = safeParseJson(patch.string_layout_data, null);
    if (!fullLayout) return onUpdate?.(patch);

    // Full backup remains local so no earlier stringing work is lost even when Base44 rejects large fields.
    writeStringLayoutBackup(project?.id, fullLayout);

    // Server gets compact data only. Normal panelgrupp-based strings do not need every clicked node.
    const compact = compactStringLayoutForServer(fullLayout);
    return onUpdate?.({ ...patch, string_layout_data: JSON.stringify(compact) });
  };

  return <StringMarkingTabV7 project={projectWithBestStringLayout} onUpdate={safeUpdate} selectedProduct={selectedProduct} />;
}
