/** Shared data types for the Preview MiniApp. */

export interface PreviewFile {
  name: string;
  path: string; // Relative to root
  mimeType: string; // e.g. "image/png"
  dataUrl: string; // Base64-encoded data URL for rendering
  width: number; // Image intrinsic width in pixels
  height: number; // Image intrinsic height in pixels
}

export interface HtmlPreviewFile {
  name: string;
  path: string; // Relative to root
  content: string; // Full HTML content as UTF-8 string
}

export interface StreamedHtmlSnapshot {
  name: string;
  path: string;
  content: string;
}

export interface SiblingList {
  files: SiblingEntry[];
  currentIndex: number; // Index of the current file in the list
}

export interface SiblingEntry {
  name: string;
  path: string; // Relative to root
}

export type PreviewBridgeStateSelector =
  | 'desktop.summary'
  | 'desktop.windows'
  | 'desktop.focusedWindow'
  | 'theme.current'
  | 'preview.context';

export interface PreviewBridgeGetStatePayload {
  selector: PreviewBridgeStateSelector;
}

export interface PreviewBridgeExecOptions {
  cwd?: string;
  timeoutMs?: number;
}

export interface PreviewBridgeExecPayload {
  streamId: string;
  token: string;
  program: string;
  args?: string[];
  options?: PreviewBridgeExecOptions;
}

export interface PreviewBridgeExecResult {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
  command: {
    program: string;
    args: string[];
    cwd: string;
  };
}

export type PreviewBridgeExecResponse =
  | {
      status: 'completed';
      result: PreviewBridgeExecResult;
    }
  | {
      status: 'requires_confirmation';
      requestId: string;
      reason: string;
      commandPreview: string;
      cwd: string;
    }
  | {
      status: 'cancelled';
      reason: string;
    }
  | {
      status: 'rejected';
      reason: string;
    };

export interface PreviewBridgeConfirmPayload {
  requestId: string;
  confirmed: boolean;
}

export interface PreviewBridgeRequestMessage {
  type: 'desktalk:bridge-request';
  streamId: string;
  token: string;
  requestId: string;
  kind: 'getState' | 'exec';
  payload: unknown;
}

export interface PreviewBridgeResponseMessage {
  type: 'desktalk:bridge-response';
  streamId: string;
  token: string;
  requestId: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface PreviewBridgeWindowSummary {
  id: string;
  miniAppId: string;
  title: string;
  focused: boolean;
  maximized: boolean;
}

/**
 * Preview mode is determined by the launch arguments.
 * - 'image': path points to a supported image file
 * - 'html': path points to an .html file
 * - 'stream': AI-generated streaming HTML (no path, has streamId + title)
 */
export type PreviewMode = 'image' | 'html' | 'stream';
