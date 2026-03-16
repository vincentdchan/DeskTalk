/** Shared data types for the Terminal MiniApp. */

export interface TerminalTab {
  tabId: string;
  label: string;
  cwd: string;
  pid: number;
  running: boolean;
  createdAt: string; // ISO 8601
}

export type SafetyLevel = 'safe' | 'warn' | 'block';

export interface SafetyAnalysisResult {
  level: SafetyLevel;
  command: string;
  reason?: string;
  segments: CommandSegment[];
}

export interface CommandSegment {
  raw: string;
  program: string;
  level: SafetyLevel;
  reason?: string;
}

/** Payload for terminal.output events (backend → frontend). */
export interface TerminalOutputEvent {
  tabId: string;
  data: string;
}

/** Payload for terminal.exit events (backend → frontend). */
export interface TerminalExitEvent {
  tabId: string;
  exitCode: number;
}

/** Payload for terminal.confirm events (backend → frontend). */
export interface TerminalConfirmEvent {
  tabId: string;
  command: string;
  risk: string;
  requestId: string;
}
