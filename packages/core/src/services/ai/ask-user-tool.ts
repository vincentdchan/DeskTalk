import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';

export type AskUserQuestionType = 'text' | 'select' | 'multi_select' | 'confirm';

export interface AskUserQuestionPayload {
  toolCallId: string;
  question: string;
  questionType: AskUserQuestionType;
  options?: string[];
  signal?: AbortSignal;
}

export interface AskUserQuestionDispatchResult {
  questionId: string;
  waitingMessage: string;
}

interface AskUserToolOptions {
  sendQuestion: (payload: AskUserQuestionPayload) => Promise<AskUserQuestionDispatchResult>;
}

const ASK_USER_WAITING_PREFIX = '[Waiting for user response. Question ID: ';
const ASK_USER_WAITING_SUFFIX = ']';

const askUserSchema = Type.Object({
  question: Type.String({ description: 'The question to display to the user' }),
  type: Type.Union([
    Type.Literal('text'),
    Type.Literal('select'),
    Type.Literal('multi_select'),
    Type.Literal('confirm'),
  ]),
  options: Type.Optional(
    Type.Array(Type.String(), {
      description:
        'Available choices for select and multi_select questions. Ignored for text and confirm questions.',
    }),
  ),
});

type AskUserParams = {
  question: string;
  type: AskUserQuestionType;
  options?: string[];
};

function requiresOptions(questionType: AskUserQuestionType): boolean {
  return questionType === 'select' || questionType === 'multi_select';
}

export function formatAskUserWaitingMessage(questionId: string): string {
  return `${ASK_USER_WAITING_PREFIX}${questionId}${ASK_USER_WAITING_SUFFIX}`;
}

export function isAskUserWaitingMessage(value: string): boolean {
  return value.startsWith(ASK_USER_WAITING_PREFIX) && value.endsWith(ASK_USER_WAITING_SUFFIX);
}

export function createAskUserTool(options: AskUserToolOptions): ToolDefinition {
  const { sendQuestion } = options;

  return {
    name: 'ask_user',
    label: 'Ask User',
    description:
      'Ask the user a clarifying question. When this tool returns a waiting message, stop taking further actions and end your turn. The user response will arrive in a follow-up message.',
    promptSnippet: 'Ask the user a question, then stop and wait for a follow-up message.',
    promptGuidelines: [
      'Use this only when you truly need user input before you can continue safely.',
      'Use type "confirm" for yes/no questions.',
      'Provide options for "select" and "multi_select" questions.',
      'After calling ask_user, do not call more tools or continue the task until the user response arrives.',
    ],
    parameters: askUserSchema,
    async execute(toolCallId, params, signal) {
      const input = params as AskUserParams;

      if (
        requiresOptions(input.type) &&
        (!Array.isArray(input.options) || input.options.length === 0)
      ) {
        return {
          content: [
            {
              type: 'text',
              text: `ask_user requires non-empty options for ${input.type} questions.`,
            },
          ],
          details: {
            ok: false,
            error: `Missing options for ${input.type} question.`,
          },
        };
      }

      const dispatched = await sendQuestion({
        toolCallId,
        question: input.question,
        questionType: input.type,
        options: input.options,
        signal,
      });

      return {
        content: [{ type: 'text', text: dispatched.waitingMessage }],
        details: {
          ok: true,
          status: 'pending',
          questionId: dispatched.questionId,
        },
      };
    },
  };
}
