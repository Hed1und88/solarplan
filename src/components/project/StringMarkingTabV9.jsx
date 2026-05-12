import React, { useMemo } from 'react';
import StringMarkingTabV7 from '@/components/project/StringMarkingTabV7';
import {
  compactStringLayoutForServer,
  readBestStringLayout,
  safeParseJson,
  writeStringLayoutBackup,
} from '@/lib/stringLayoutStorage';

export default function StringMarkingTabV9({ project, onUpdate, selectedProduct, onStringLayoutChange }) {
  const bestLayout = useMemo(() => readBestStringLayout(project), [project?.id, project?.string_layout_data, project?._local_backup_at]);
  const projectWithBestStringLayout = useMemo(() => {
    if (!bestLayout) return project;
    return { ...project, string_layout_data: JSON.stringify(bestLayout) };
  }, [project, bestLayout]);

  const safeUpdate = async (patch = {}) => {
    if (!patch.string_layout_data) return onUpdate?.(patch);

    const fullLayout = safeParseJson(patch.string_layout_data, null);
    if (!fullLayout || !Array.isArray(fullLayout.strings)) return onUpdate?.(patch);

    const fullWithTime = {
      ...fullLayout,
      savedAt: new Date().toISOString(),
      autosave: true,
    };

    // 1. Update the live React state immediately. Enlinje and full inverter summary
    // receive this data before the Base44 server has answered.
    onStringLayoutChange?.(fullWithTime);

    // 2. Keep full layout locally. This is the source of truth for recovery.
    writeStringLayoutBackup(project?.id, fullWithTime);

    // 3. Send only compact layout to Base44 so string_layout_data does not exceed max field size.
    const compact = compactStringLayoutForServer(fullWithTime);
    const compactPatch = { ...patch, string_layout_data: JSON.stringify(compact) };

    try {
      return await onUpdate?.(compactPatch);
    } catch (error) {
      // Keep UI data and local backup even if server rejects the save. Do not throw here,
      // otherwise the stringing tab shows as if the user's work was lost.
      console.warn('String layout saved locally but Base44 update failed:', error);
      return { ...project, ...compactPatch };
    }
  };

  return <StringMarkingTabV7 project={projectWithBestStringLayout} onUpdate={safeUpdate} selectedProduct={selectedProduct} />;
}
