export interface LauncherApp {
  id: string;
  name: string;
  icon: string;
  iconPng?: string;
  kind: 'miniapp' | 'liveapp';
  miniAppId: string;
  args?: Record<string, unknown>;
}

export interface LiveAppRecord {
  id: string;
  name: string;
  path: string;
  icon: string;
}
