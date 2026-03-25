/** Shared data types for the Preview MiniApp. */

export interface PreviewFile {
  name: string;
  path: string; // Relative to root
  mimeType: string; // e.g. "image/png"
  dataUrl: string; // Base64-encoded data URL for rendering
  width: number; // Image intrinsic width in pixels
  height: number; // Image intrinsic height in pixels
}

export interface StreamedHtmlSnapshot {
  name: string;
  path: string; // Absolute path to the saved snapshot on disk
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

export interface PreviewOpenedFileState {
  name: string;
  path: string | null;
  kind: 'image' | 'html' | 'stream';
  mimeType?: string;
}

export interface PreviewActionState {
  mode: PreviewMode;
  streaming: boolean;
  file: PreviewOpenedFileState | null;
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

export interface PreviewBridgeNetworkRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  json?: unknown;
  timeoutMs?: number;
}

export interface PreviewBridgeNetworkRequest {
  url: string;
  options?: PreviewBridgeNetworkRequestOptions;
}

export interface PreviewBridgeRequestPayload {
  streamId: string;
  token: string;
  request: PreviewBridgeNetworkRequest;
}

export interface PreviewBridgeRequestResult {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  truncated: boolean;
  url: string;
}

export interface PreviewBridgeStorageQueryOptions {
  sort?: string;
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export type PreviewBridgeStorageAction =
  | { action: 'kv.get'; name: string }
  | { action: 'kv.set'; name: string; value: unknown }
  | { action: 'kv.delete'; name: string }
  | { action: 'kv.list' }
  | { action: 'collection.insert'; collection: string; params: Record<string, unknown> }
  | { action: 'collection.update'; collection: string; id: string; params: Record<string, unknown> }
  | { action: 'collection.delete'; collection: string; id: string }
  | { action: 'collection.findById'; collection: string; id: string }
  | {
      action: 'collection.find';
      collection: string;
      filter?: Record<string, unknown>;
      options?: PreviewBridgeStorageQueryOptions;
    }
  | { action: 'collection.findAll'; collection: string }
  | { action: 'collection.count'; collection: string; filter?: Record<string, unknown> }
  | { action: 'collection.compact'; collection: string };

export interface PreviewBridgeStoragePayload {
  streamId: string;
  token: string;
  liveAppId: string;
  request: PreviewBridgeStorageAction;
}

export type PreviewBridgeStorageResult =
  | { value: unknown }
  | { ok: true }
  | { deleted: boolean }
  | { names: string[] }
  | { record: Record<string, unknown> | null }
  | { records: Array<Record<string, unknown>> }
  | { count: number };

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
  kind: 'getState' | 'exec' | 'storage' | 'request';
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
