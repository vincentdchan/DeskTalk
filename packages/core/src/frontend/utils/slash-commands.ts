/**
 * Slash command definitions and execution.
 *
 * Each command is a plain object describing the name, description, and handler.
 * The handler receives a context containing store actions and the active WebSocket
 * so commands can perform side-effects (create sessions, clear messages, etc.).
 */

export interface SlashCommandContext {
  socket: WebSocket;
  createSession: (socket: WebSocket) => boolean;
  clearMessages: () => void;
  addSystemMessage: (text: string) => void;
}

export interface SlashCommandDefinition {
  /** The command name without the leading `/`. */
  name: string;
  /** Short one-line description shown in the autocomplete popup and /help output. */
  description: string;
  /** Execute the command. Return `true` if the input should be cleared. */
  execute: (ctx: SlashCommandContext, args: string) => boolean;
}

const commands: SlashCommandDefinition[] = [
  {
    name: 'new',
    description: 'Create a new AI session',
    execute(ctx) {
      return ctx.createSession(ctx.socket);
    },
  },
  {
    name: 'clear',
    description: 'Clear the current message history (client-side only)',
    execute(ctx) {
      ctx.clearMessages();
      return true;
    },
  },
  {
    name: 'help',
    description: 'Show available slash commands',
    execute(ctx) {
      const lines = commands.map((c) => `  /${c.name} — ${c.description}`);
      ctx.addSystemMessage('Available commands:\n' + lines.join('\n'));
      return true;
    },
  },
];

/**
 * Attempt to parse and execute a slash command from user input.
 *
 * @returns `true` if the input was handled as a slash command (caller should
 *          clear the input field). `false` if the input is not a slash command
 *          and should be sent to the AI as a normal prompt.
 */
export function tryExecuteSlashCommand(input: string, ctx: SlashCommandContext): boolean {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return false;

  const spaceIdx = trimmed.indexOf(' ');
  const name = (spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx)).toLowerCase();
  const args = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();

  const cmd = commands.find((c) => c.name === name);
  if (!cmd) {
    ctx.addSystemMessage(`Unknown command: /${name}. Type /help for available commands.`);
    return true;
  }

  return cmd.execute(ctx, args);
}

/**
 * Return all commands whose name starts with the given prefix.
 * Used for autocomplete suggestions.
 */
export function matchCommands(prefix: string): SlashCommandDefinition[] {
  const lower = prefix.toLowerCase();
  return commands.filter((c) => c.name.startsWith(lower));
}

/** Expose the full command list for rendering (e.g. autocomplete). */
export function getAllCommands(): SlashCommandDefinition[] {
  return commands;
}
