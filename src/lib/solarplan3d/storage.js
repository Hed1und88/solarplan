import { createPersistedSolarProject3D, normalizeSolarProject3D } from './model';

const STORAGE_KEY = 'solarplan:solarplan-3d-projektering:latest';

const canUseLocalStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage);

export const solarProject3DStorage = {
  async loadLatest() {
    if (!canUseLocalStorage()) return normalizeSolarProject3D();

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return normalizeSolarProject3D();
      const parsed = JSON.parse(raw);
      return normalizeSolarProject3D(parsed.project || parsed);
    } catch (error) {
      console.error('Could not load SolarPlan 3D project', error);
      return normalizeSolarProject3D();
    }
  },

  async save(project) {
    const persisted = createPersistedSolarProject3D(project);
    if (!canUseLocalStorage()) return persisted.project;

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    return persisted.project;
  },

  key: STORAGE_KEY,
};

