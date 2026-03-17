/**
 * Command safety analyzer for the Terminal MiniApp.
 *
 * Tokenizes shell input, checks each segment against block/warn lists,
 * and returns a safety classification. Runs on the backend so it cannot
 * be bypassed by a modified frontend.
 */

import type { SafetyLevel, SafetyAnalysisResult, CommandSegment } from './types';

// ─── Block patterns — rejected unconditionally ──────────────────────────────

interface CommandRule {
  test: (program: string, raw: string) => boolean;
  level: SafetyLevel;
  reason: string;
}

const BLOCK_RULES: CommandRule[] = [
  {
    test: (_prog, raw) => /rm\s+.*-[^\s]*r[^\s]*f[^\s]*\s+\/(\s|$|\*)/.test(raw) ||
                          /rm\s+.*-[^\s]*f[^\s]*r[^\s]*\s+\/(\s|$|\*)/.test(raw),
    level: 'block',
    reason: 'Catastrophic: rm -rf on root filesystem',
  },
  {
    test: (_prog, raw) => /:\(\)\s*\{[^}]*:\s*\|\s*:\s*&[^}]*\}/.test(raw),
    level: 'block',
    reason: 'Fork bomb detected',
  },
  {
    test: (_prog, raw) => />\s*\/dev\/([sh]d[a-z]|nvme|loop)/.test(raw),
    level: 'block',
    reason: 'Direct write to block device',
  },
];

const WARN_RULES: CommandRule[] = [
  {
    test: (prog, raw) => prog === 'rm' || /\bxargs\s+.*\brm\b/.test(raw),
    level: 'warn',
    reason: 'rm command may delete files permanently',
  },
  {
    test: (prog, raw) => prog === 'chmod' && /777/.test(raw),
    level: 'warn',
    reason: 'chmod 777 grants full permissions to all users',
  },
  {
    test: (prog) => prog === 'mkfs' || prog.startsWith('mkfs.'),
    level: 'warn',
    reason: 'mkfs formats a filesystem — data loss is irreversible',
  },
  {
    test: (prog, raw) => prog === 'dd' && /of=\s*\/dev\//.test(raw),
    level: 'warn',
    reason: 'dd writing to a device — potential data loss',
  },
];

// ─── Tokenizer ──────────────────────────────────────────────────────────────

/**
 * Split a shell command line into individual command segments by splitting
 * on shell operators: ;  &&  ||  |  \n
 *
 * This is a simplified tokenizer — it does not handle quoted strings or
 * escaped characters perfectly, but it covers the common cases for safety
 * gating purposes.
 */
export function tokenize(input: string): string[] {
  // Split on ;  &&  ||  |  (but not ||)  and newlines
  // We use a regex that matches the operators as delimiters
  return input
    .split(/\s*(?:;|&&|\|\||(?<!\|)\|(?!\|)|\n)\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Extract the program name (first word) from a command segment.
 * Handles env var assignments (e.g., `FOO=bar cmd`) and sudo/env prefixes.
 */
export function extractProgram(segment: string): string {
  // Strip leading env assignments like VAR=value
  let s = segment.replace(/^(\s*\w+=\S*\s+)*/, '');
  // Strip sudo / env prefixes (env may be followed by VAR=val pairs)
  s = s.replace(/^(sudo\s+)*(env\s+(\w+=\S*\s+)*)*/g, '');
  // Strip any remaining leading env assignments after env/sudo
  s = s.replace(/^(\s*\w+=\S*\s+)*/, '');
  // The first word is the program
  const match = s.match(/^(\S+)/);
  return match ? match[1] : '';
}

// ─── Analyzer ───────────────────────────────────────────────────────────────

/**
 * Analyze a command string for safety.
 *
 * Returns a SafetyAnalysisResult with the overall level (worst of all segments)
 * and per-segment details.
 */
export function analyzeCommand(input: string): SafetyAnalysisResult {
  // First check whole-input block rules (e.g., fork bombs span operators)
  for (const rule of BLOCK_RULES) {
    if (rule.test('', input)) {
      return {
        level: 'block',
        command: input,
        reason: rule.reason,
        segments: [{ raw: input, program: '', level: 'block', reason: rule.reason }],
      };
    }
  }

  const rawSegments = tokenize(input);
  if (rawSegments.length === 0) {
    return { level: 'safe', command: input, segments: [] };
  }

  const segments: CommandSegment[] = rawSegments.map((raw) => {
    const program = extractProgram(raw);

    // Check block rules per-segment
    for (const rule of BLOCK_RULES) {
      if (rule.test(program, raw)) {
        return { raw, program, level: rule.level, reason: rule.reason };
      }
    }

    // Check warn rules per-segment
    for (const rule of WARN_RULES) {
      if (rule.test(program, raw)) {
        return { raw, program, level: rule.level, reason: rule.reason };
      }
    }

    return { raw, program, level: 'safe' as const };
  });

  // Overall level is the worst across all segments
  let overall: SafetyLevel = 'safe';
  let overallReason: string | undefined;
  for (const seg of segments) {
    if (seg.level === 'block') {
      return { level: 'block', command: input, reason: seg.reason, segments };
    }
    if (seg.level === 'warn' && overall === 'safe') {
      overall = 'warn';
      overallReason = seg.reason;
    }
  }

  return { level: overall, command: input, reason: overallReason, segments };
}
