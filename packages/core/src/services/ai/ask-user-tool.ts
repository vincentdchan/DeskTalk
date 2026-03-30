import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';

export type AskUserQuestionType = 'text' | 'select' | 'multi_select' | 'confirm';

export interface AskUserQuestionPayload {
  question: string;
  questionType: AskUserQuestionType;
  options?: string[];
  signal?: AbortSignal;
}

interface AskUserToolOptions {
  sendQuestion: (payload: AskUserQuestionPayload) => Promise<string>;
}

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

export function createAskUserTool(options: AskUserToolOptions): ToolDefinition {
  const { sendQuestion } = options;

  return {
    name: 'ask_user',
    label: 'Ask User',
    description:
      'Ask the user a clarifying question and wait for their response. Use this when you need more information, confirmation, or a choice from the user before proceeding.',
    promptSnippet: 'Ask the user a question and wait for an answer before continuing.',
    promptGuidelines: [
      'Use this only when you truly need user input before you can continue safely.',
      'Use type "confirm" for yes/no questions.',
      'Provide options for "select" and "multi_select" questions.',
    ],
    parameters: askUserSchema,
    async execute(_toolCallId, params, signal) {
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

      const answer = await sendQuestion({
        question: input.question,
        questionType: input.type,
        options: input.options,
        signal,
      });

      return {
        content: [{ type: 'text', text: answer }],
        details: {
          ok: true,
          answer,
        },
      };
    },
  };
}
