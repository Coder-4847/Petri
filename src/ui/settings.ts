// Player settings, persisted in localStorage (wrapped: storage can be unavailable).
export interface Settings { gore: boolean; debug: boolean; encounters: boolean; autosave: boolean; }
const KEY = 'petri.settings.v1';
export const settings: Settings = { gore: true, debug: false, encounters: true, autosave: true };
try { const raw = localStorage.getItem(KEY); if (raw) Object.assign(settings, JSON.parse(raw)); } catch { /* ignore */ }
export function saveSettings() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ } }
