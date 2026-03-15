/** Shared data types for the Preview MiniApp. */

export interface PreviewFile {
  name: string;
  path: string; // Relative to root
  mimeType: string; // e.g. "image/png"
  dataUrl: string; // Base64-encoded data URL for rendering
  width: number; // Image intrinsic width in pixels
  height: number; // Image intrinsic height in pixels
}

export interface SiblingList {
  files: SiblingEntry[];
  currentIndex: number; // Index of the current file in the list
}

export interface SiblingEntry {
  name: string;
  path: string; // Relative to root
}
