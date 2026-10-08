export interface DevSettings {
  latencyMin: number;
  latencyMax: number;
  writeFailureRate: number;
  readFailureRate: number;
  teammateEditsPerMin: number;
  teammatesPaused: boolean;
  viewingAs: string;
}

let settings: DevSettings = {
  latencyMin: 300,
  latencyMax: 1500,
  writeFailureRate: 0.1,
  readFailureRate: 0,
  teammateEditsPerMin: 20,
  teammatesPaused: false,
  viewingAs: 'r1',
};
const listeners = new Set<() => void>();

export const getSettings = (): DevSettings => settings;

export function updateSettings(patch: Partial<DevSettings>): void {
  settings = { ...settings, ...patch };
  listeners.forEach((l) => l());
}

export function subscribeSettings(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export const randomLatency = (s: DevSettings = settings): number =>
  s.latencyMin + Math.random() * Math.max(0, s.latencyMax - s.latencyMin);
