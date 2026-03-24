export type MediaKind = 'audio' | 'video';

export interface MediaFile {
  name: string;
  path: string;
  mimeType: string;
  dataUrl: string;
  kind: MediaKind;
}

export interface SiblingEntry {
  name: string;
  path: string;
}

export interface SiblingList {
  files: SiblingEntry[];
  currentIndex: number;
}

export interface PlayerOpenedFileState {
  name: string;
  path: string;
  kind: MediaKind;
  mimeType: string;
}

export interface PlayerActionState {
  mode: MediaKind;
  playing: boolean;
  file: PlayerOpenedFileState | null;
}
