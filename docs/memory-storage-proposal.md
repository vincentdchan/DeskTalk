# DeskTalk Memory Storage Proposal

## Goal

Add a persistent memory store to DeskTalk so the AI assistant and tools can remember facts, preferences, and context about each user across sessions. Memories are scoped per-user and exposed through REST API endpoints, enabling future AI tools to read and write user context.

## Design Principles

1. **Per-user scoping**: memories belong to a single user and are never visible to others.
2. **Consistent storage**: uses the same JSON-file approach as `UserService` — no new database dependencies.
3. **Tool-ready**: the API is designed so an AI tool can create, read, update, delete, and search memories programmatically.
4. **Simple schema**: each memory is a short text entry with optional categorization and provenance tracking.

## Schema

### Memory Record

| Field | Type | Description |
| --- | --- | --- |
| `id` | `number` | Auto-incrementing unique identifier |
| `userId` | `number` | Owner of the memory (references `users.id`) |
| `content` | `string` | The memory text (fact, preference, note, etc.) |
| `category` | `string` | Grouping label (default: `"general"`) |
| `source` | `string` | How the memory was created: `"user"`, `"ai"`, or `"system"` |
| `createdAt` | `string` | ISO 8601 timestamp |
| `updatedAt` | `string` | ISO 8601 timestamp |

### Storage File

Memories are stored in a JSON file at `<data>/storage/memories.json`:

```json
{
  "memories": [
    {
      "id": 1,
      "userId": 1,
      "content": "User prefers dark mode",
      "category": "preference",
      "source": "ai",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "nextId": 2
}
```

### Data Location

```
<data>/storage/
  users.json            # User and session data
  memories.json         # Memory data (new)
  preference.json       # existing
  window-state.json     # existing
  ...
```

## Categories

Memories use a free-form `category` string. Suggested conventions:

| Category | Use Case |
| --- | --- |
| `general` | Default; miscellaneous facts |
| `preference` | User preferences (theme, language, workflow habits) |
| `context` | Conversation context carried across sessions |
| `note` | User-created notes or reminders |

Categories are not enforced — any string value is accepted.

## Source Tracking

The `source` field records how a memory was created:

| Source | Meaning |
| --- | --- |
| `user` | Explicitly created by the user (default) |
| `ai` | Inferred or created by the AI assistant during a conversation |
| `system` | Automatically created by the system (e.g., onboarding) |

## API Design

All memory endpoints require authentication (valid session cookie).

### Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/memories` | List memories for the current user |
| `GET` | `/api/memories?category=preference` | Filter memories by category |
| `GET` | `/api/memories?q=dark+mode` | Search memories by keyword |
| `POST` | `/api/memories` | Create a new memory |
| `GET` | `/api/memories/:id` | Get a single memory |
| `PATCH` | `/api/memories/:id` | Update a memory |
| `DELETE` | `/api/memories/:id` | Delete a memory |

### Request / Response Examples

**POST /api/memories**

```json
// Request
{ "content": "User prefers dark mode", "category": "preference", "source": "ai" }

// Response 201
{
  "id": 1,
  "userId": 1,
  "content": "User prefers dark mode",
  "category": "preference",
  "source": "ai",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

**GET /api/memories**

```json
// Response 200
[
  {
    "id": 1,
    "userId": 1,
    "content": "User prefers dark mode",
    "category": "preference",
    "source": "ai",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
]
```

**GET /api/memories?q=dark**

```json
// Response 200 — case-insensitive substring search on content
[
  {
    "id": 1,
    "userId": 1,
    "content": "User prefers dark mode",
    "category": "preference",
    "source": "ai",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
]
```

**PATCH /api/memories/1**

```json
// Request
{ "content": "User prefers light mode" }

// Response 200
{
  "id": 1,
  "userId": 1,
  "content": "User prefers light mode",
  "category": "preference",
  "source": "ai",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T12:00:00.000Z"
}
```

**DELETE /api/memories/1**

```json
// Response 200
{ "ok": true }
```

## Backend Service

### `MemoryService`

Located at `packages/core/src/services/memory-service.ts`.

```typescript
export class MemoryService {
  constructor(filePath: string);

  // CRUD
  createMemory(userId: number, content: string, options?: {
    category?: string;
    source?: 'user' | 'ai' | 'system';
  }): Memory;
  getMemory(id: number): Memory | undefined;
  listMemories(userId: number, options?: { category?: string }): Memory[];
  updateMemory(id: number, updates: { content?: string; category?: string }): Memory;
  deleteMemory(id: number): void;

  // Bulk
  deleteUserMemories(userId: number): void;

  // Search
  searchMemories(userId: number, query: string): Memory[];
}
```

### Server Integration

The `MemoryService` is initialized alongside `UserService` in `createServer()`:

```typescript
const memoryService = new MemoryService(
  join(workspacePaths.data, 'storage', 'memories.json')
);
```

Memory API routes are registered after the user management routes and before the not-found handler.

## Security

1. **User isolation**: every memory endpoint verifies that the memory belongs to the authenticated user. Users cannot read or modify other users' memories.
2. **Authentication required**: all `/api/memories` routes go through the existing auth middleware.
3. **No admin override**: even admins can only access their own memories (privacy by design).

## Future Work

- **AI tool integration**: create a tool that allows the AI assistant to call the memory API during conversations to store and recall facts.
- **Memory limits**: add per-user memory count or size limits to prevent unbounded growth.
- **Embedding search**: replace keyword search with vector-similarity search for better semantic recall.
- **Import/export**: allow users to export their memories as JSON and import them on another instance.
