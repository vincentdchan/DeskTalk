# Agent Ask-User Tool

This document specifies the `ask_user` tool — a mechanism that allows the AI agent to pause execution and ask the user a clarifying question mid-turn, then resume once the user responds.

## Overview

Today the agent runs to completion without any ability to request user input during a turn. The `ask_user` tool adds an interactive feedback loop: the LLM calls the tool, a question is presented inline in the chat, and the agent loop blocks until the user answers.

### Question types

| Type           | Description                                     | User interaction              |
| -------------- | ----------------------------------------------- | ----------------------------- |
| `text`         | Open-ended question, user types a free response | Text input + submit button    |
| `select`       | Pick exactly one option from a list             | Radio buttons + submit button |
| `multi_select` | Pick one or more options from a list            | Checkboxes + submit button    |
| `confirm`      | Simple yes / no confirmation                    | Yes / No buttons              |

## Architecture

```
User types prompt
     |
     v
Frontend --ws--> { type: 'ai:prompt', text: '...' }
                        |
                        v
               PiSessionService.prompt()
               session.prompt(text)
                        |
                        v
               LLM decides to call ask_user tool
                        |
                        v
               ask_user.execute() called
               -> deps.sendQuestion() called
               -> onEvent({ type: 'agent_question', questionId, ... })
               -> returns Promise<string>  ** blocks agent loop **
                        |
                        v
Backend --ws--> { type: 'ai:event', event: { type: 'agent_question', ... } }
                        |
                        v
               Frontend renders AgentQuestion component inline
               User selects answer / types response
                        |
                        v
Frontend --ws--> { type: 'ai:answer', questionId, answer }
                        |
                        v
               PiSessionService.resolveQuestion(questionId, answer)
               -> Promise resolves with the answer string
               -> ask_user.execute() returns { result: answer }
                        |
                        v
               Agent loop continues — LLM sees the tool result and proceeds
```

## Tool Definition

The tool is registered as a custom tool alongside the existing `desktop`, `action`, `create_liveapp`, etc.

### Schema

```json
{
  "name": "ask_user",
  "description": "Ask the user a clarifying question and wait for their response. Use this when you need more information, confirmation, or a choice from the user before proceeding.",
  "parameters": {
    "type": "object",
    "properties": {
      "question": {
        "type": "string",
        "description": "The question to display to the user"
      },
      "type": {
        "type": "string",
        "enum": ["text", "select", "multi_select", "confirm"],
        "description": "The kind of input to collect"
      },
      "options": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Available choices (required for select and multi_select, ignored otherwise)"
      }
    },
    "required": ["question", "type"]
  }
}
```

### Return value

The tool returns the user's answer as a plain string:

- **text** — the raw text the user typed.
- **select** — the label of the selected option.
- **multi_select** — a JSON-encoded string array of selected labels.
- **confirm** — `"yes"` or `"no"`.

## Backend Changes

### New file: `packages/core/src/services/ai/ask-user-tool.ts`

Exports `createAskUserTool(deps)` returning a `ToolDefinition`. The `execute` function calls `deps.sendQuestion()` which returns a `Promise<string>` that blocks until the frontend responds.

### Modified: `packages/core/src/services/ai/pi-session-service.ts`

- Add a `pendingQuestions: Map<string, { resolve: (answer: string) => void }>` field.
- Add a public `resolveQuestion(questionId: string, answer: string)` method that looks up and resolves the pending promise.
- Wire `createAskUserTool` into the `customTools` array, passing an `onEvent`-based `sendQuestion` implementation that:
  1. Generates a `questionId` via `crypto.randomUUID()`.
  2. Emits an `agent_question` event through the prompt callback.
  3. Returns a promise stored in `pendingQuestions`.
- In `getHistory()`, recognise `ask_user` tool calls and surface the question metadata so the frontend can render answered questions when replaying history.

### Modified: `packages/core/src/server/ws-routes.ts`

Handle incoming `ai:answer` messages:

```typescript
if (msg.type === 'ai:answer') {
  piSessionService.resolveQuestion(msg.questionId, msg.answer);
}
```

## Frontend Changes

### Modified: `packages/core/src/frontend/stores/chat-session.ts`

- Extend `AiEventMessage` type with `agent_question`:

```typescript
type AgentQuestionEvent = {
  type: 'agent_question';
  questionId: string;
  question: string;
  questionType: 'text' | 'select' | 'multi_select' | 'confirm';
  options?: string[];
};
```

- Store the active pending question in the chat session state.
- Add an `answerQuestion(questionId, answer)` action that sends `{ type: 'ai:answer', questionId, answer }` over the WebSocket and clears the pending question.

### New component: `AgentQuestion`

Location: `packages/core/src/frontend/components/info-panel/AgentQuestion.tsx` with colocated `AgentQuestion.module.scss`.

Renders inline in the chat message list, immediately after the tool-call row for `ask_user`. Four visual variants based on `questionType`:

| Variant        | Controls                                           |
| -------------- | -------------------------------------------------- |
| `text`         | Question label, single-line text input, submit btn |
| `select`       | Question label, radio button group, submit btn     |
| `multi_select` | Question label, checkbox group, submit btn         |
| `confirm`      | Question label, Yes button, No button              |

After the user submits an answer the component transitions to a read-only "answered" state showing the chosen value, matching the compact style of tool-call result rows.

### Modified: `InfoPanel.tsx` (or chat message list)

Render `<AgentQuestion />` when a pending question is present, positioned at the end of the current message stream.

## WebSocket Protocol

### Backend -> Frontend

```jsonc
{
  "type": "ai:event",
  "event": {
    "type": "agent_question",
    "questionId": "550e8400-e29b-41d4-a716-446655440000",
    "question": "Which theme would you prefer?",
    "questionType": "select",
    "options": ["Light", "Dark", "System default"],
  },
}
```

### Frontend -> Backend

```jsonc
{
  "type": "ai:answer",
  "questionId": "550e8400-e29b-41d4-a716-446655440000",
  "answer": "Dark",
}
```

## History & Persistence

The user's answer is returned as the tool-call result for `ask_user`, so it is automatically persisted in the pi-coding-agent session file. When `getHistory()` encounters an `ask_user` tool call, it should include the question metadata (`question`, `questionType`, `options`) in the `toolCall.params` field so the frontend can render a read-only answered-question widget instead of a generic tool-call summary.

## Edge Cases

| Scenario                                                           | Behaviour                                                                                                           |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| User navigates away while a question is pending                    | The agent loop stays blocked. On reconnect the frontend should re-render the pending question from session state.   |
| User switches to a different session while a question is pending   | The pending promise remains unresolved. When the user switches back, the question should be re-displayed.           |
| Prompt is cancelled while a question is pending                    | The pending promise should be rejected, causing the tool execution to throw and the agent loop to abort gracefully. |
| LLM calls `ask_user` with `select`/`multi_select` but no `options` | Tool validates parameters and returns an error result immediately without prompting the user.                       |

## Testing

- Unit tests for `ask-user-tool.ts`: parameter validation, promise resolution, return-value formatting.
- Integration test: mock WebSocket round-trip — emit `agent_question`, respond with `ai:answer`, verify the tool returns the correct value.
- Run `pnpm lint`, `pnpm unit:test`, `pnpm build` after implementation.
