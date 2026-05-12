const PROJECT_BACKUP_PREFIX = 'solarplan:project-backup:';

export function projectBackupKey(projectId) {
  return `${PROJECT_BACKUP_PREFIX}${projectId}`;
}

export function readProjectBackup(projectId) {
  if (typeof window === 'undefined' || !projectId) return null;
  try {
    const raw = window.localStorage.getItem(projectBackupKey(projectId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeProjectBackup(project) {
  if (typeof window === 'undefined' || !project?.id) return;
  try {
    window.localStorage.setItem(projectBackupKey(project.id), JSON.stringify({
      ...project,
      _local_backup_at: new Date().toISOString(),
    }));
  } catch {}
}

export function mergeProjectWithBackup(project) {
  if (!project?.id) return project || null;
  const backup = readProjectBackup(project.id);
  if (!backup) return project;

  const projectTime = new Date(project.updated_date || project.updated_at || project.modified_date || 0).getTime() || 0;
  const backupTime = new Date(backup._local_backup_at || backup.updated_date || backup.updated_at || 0).getTime() || 0;

  // If the server project is older than the local working copy, keep the local fields visible.
  if (backupTime > projectTime) return { ...project, ...backup, id: project.id };
  return { ...backup, ...project, id: project.id };
}

export async function fetchProjectById(base44, projectId) {
  if (!projectId) return null;
  if (base44?.entities?.Project?.get) {
    try {
      const project = await base44.entities.Project.get(projectId);
      if (project?.id) return project;
    } catch {}
  }
  const rows = await base44.entities.Project.list('-updated_date');
  return (rows || []).find(project => project.id === projectId) || null;
}

export async function saveProjectPatch(base44, currentProject, patch) {
  if (!currentProject?.id) throw new Error('Projekt-id saknas. Kan inte spara.');
  const optimisticProject = {
    ...currentProject,
    ...patch,
    updated_date: new Date().toISOString(),
  };

  writeProjectBackup(optimisticProject);

  const updated = await base44.entities.Project.update(currentProject.id, patch);
  const fresh = await fetchProjectById(base44, currentProject.id).catch(() => null);
  const merged = {
    ...optimisticProject,
    ...(updated || {}),
    ...(fresh || {}),
    ...patch,
    id: currentProject.id,
    _last_save_ok_at: new Date().toISOString(),
  };
  writeProjectBackup(merged);
  return merged;
}
