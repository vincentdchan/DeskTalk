import { basename } from 'node:path';

type SafetyLevel = 'safe' | 'warn' | 'block';

export interface SafetyAnalysisResult {
  level: SafetyLevel;
  reason?: string;
}

const BLOCKED_PROGRAMS = new Set([
  'mkfs',
  'mkfs.apfs',
  'mkfs.ext4',
  'mkfs.fat',
  'mkfs.hfsplus',
  'mkfs.ntfs',
  'reboot',
  'halt',
  'shutdown',
  'poweroff',
]);

const WARN_PROGRAMS = new Map<string, string>([
  ['rm', 'rm can delete files permanently.'],
  ['mv', 'mv can overwrite or relocate files.'],
  ['cp', 'cp can overwrite files when used with forceful flags.'],
  ['chmod', 'chmod can broaden permissions or break access.'],
  ['chown', 'chown can change ownership on files and directories.'],
  ['sudo', 'sudo elevates privileges beyond the app sandbox.'],
  ['kill', 'kill can terminate processes unexpectedly.'],
  ['killall', 'killall can terminate multiple processes unexpectedly.'],
  ['pkill', 'pkill can terminate multiple processes unexpectedly.'],
  ['dd', 'dd can overwrite files or devices destructively.'],
  ['diskutil', 'diskutil can change or erase disks.'],
  ['launchctl', 'launchctl can change system services.'],
]);

/** Shell interpreters whose `-c` argument should be analyzed as a command. */
const SHELL_INTERPRETERS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'fish']);

function hasFlag(args: string[], shortFlag: string, longFlag?: string): boolean {
  return args.some((arg) => {
    if (arg === shortFlag) return true;
    if (longFlag && arg === longFlag) return true;
    return arg.startsWith('-') && !arg.startsWith('--') && arg.includes(shortFlag.slice(1));
  });
}

/**
 * Try to extract the first token (the actual program name) from a shell
 * command string. This is a best-effort heuristic — it handles simple
 * cases like `top -l 1`, `rm -rf /tmp/foo`, and leading env assignments
 * like `FOO=bar ls`. It does NOT handle complex shell syntax (subshells,
 * command substitution, etc.) — those fall through as `safe`.
 */
function extractProgramFromShellString(cmdString: string): {
  program: string;
  args: string[];
} | null {
  const trimmed = cmdString.trim();
  if (!trimmed) return null;

  // Split on whitespace for a basic tokenization.
  // This ignores quoted strings but is good enough for safety heuristics.
  const tokens = trimmed.split(/\s+/);

  // Skip leading env variable assignments (e.g. `FOO=bar CMD ...`)
  let idx = 0;
  while (idx < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[idx])) {
    idx++;
  }

  if (idx >= tokens.length) return null;

  // The first non-env-assignment token is the program.
  const program = tokens[idx];
  const args = tokens.slice(idx + 1);
  return { program: basename(program), args };
}

export function formatCommand(program: string, args: string[]): string {
  return [program, ...args.map((arg) => JSON.stringify(arg))].join(' ');
}

export function analyzeProgram(program: string, args: string[]): SafetyAnalysisResult {
  const baseProgram = basename(program);
  const normalizedArgs = args.map((arg) => arg.trim()).filter(Boolean);

  // ── Shell interpreter with -c: analyze the embedded command ───────────
  // When the bridge wraps a shell string as `sh -c "cmd"`, the actual
  // program is hidden inside the `-c` argument. Extract it and run the
  // same safety analysis so that e.g. `sh -c "rm -rf /"` is still blocked.
  if (SHELL_INTERPRETERS.has(baseProgram) && hasFlag(normalizedArgs, '-c')) {
    const cIdx = normalizedArgs.indexOf('-c');
    const cmdString =
      cIdx >= 0 && cIdx + 1 < normalizedArgs.length ? normalizedArgs[cIdx + 1] : null;
    if (cmdString) {
      const parsed = extractProgramFromShellString(cmdString);
      if (parsed) {
        const innerResult = analyzeProgram(parsed.program, parsed.args);
        if (innerResult.level !== 'safe') {
          return innerResult;
        }
      }
    }
    // If we can't parse the command or it appears safe, fall through to
    // the default analysis. Running an unparseable shell command is still
    // allowed — the sandbox and cwd restrictions remain in effect.
  }

  if (BLOCKED_PROGRAMS.has(baseProgram)) {
    return {
      level: 'block',
      reason: `${baseProgram} is blocked because it can irreversibly alter the system.`,
    };
  }

  if (baseProgram === 'rm') {
    const joined = normalizedArgs.join(' ');
    if (
      (hasFlag(normalizedArgs, '-r', '--recursive') || hasFlag(normalizedArgs, '-f', '--force')) &&
      /(^|\s)\/(\s|$)/.test(joined)
    ) {
      return {
        level: 'block',
        reason: 'Refusing to run a recursive or forceful rm against the filesystem root.',
      };
    }
  }

  if (baseProgram === 'dd' && normalizedArgs.some((arg) => arg.startsWith('of=/dev/'))) {
    return {
      level: 'block',
      reason: 'Refusing to write directly to a block device with dd.',
    };
  }

  if (baseProgram === 'git' && normalizedArgs.length > 0) {
    const subcommand = normalizedArgs[0];
    if (['clean', 'reset', 'restore'].includes(subcommand)) {
      return {
        level: 'warn',
        reason: `git ${subcommand} can discard or overwrite local changes.`,
      };
    }
  }

  const warnReason = WARN_PROGRAMS.get(baseProgram);
  if (warnReason) {
    return { level: 'warn', reason: warnReason };
  }

  return { level: 'safe' };
}
