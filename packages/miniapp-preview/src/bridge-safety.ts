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

function hasFlag(args: string[], shortFlag: string, longFlag?: string): boolean {
  return args.some((arg) => {
    if (arg === shortFlag) return true;
    if (longFlag && arg === longFlag) return true;
    return arg.startsWith('-') && !arg.startsWith('--') && arg.includes(shortFlag.slice(1));
  });
}

export function formatCommand(program: string, args: string[]): string {
  return [program, ...args.map((arg) => JSON.stringify(arg))].join(' ');
}

export function analyzeProgram(program: string, args: string[]): SafetyAnalysisResult {
  const baseProgram = basename(program);
  const normalizedArgs = args.map((arg) => arg.trim()).filter(Boolean);

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
