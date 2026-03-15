/** Shared data types for the Todo MiniApp. */

export interface TodoList {
  id: string;
  name: string;
  createdAt: string; // ISO 8601
}

export interface TodoItem {
  id: string;
  listId: string;
  title: string;
  completed: boolean;
  priority: 'none' | 'low' | 'medium' | 'high';
  dueDate: string | null; // ISO 8601 or null
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/** TodoList with a computed item count, used in the sidebar. */
export interface TodoListWithCount extends TodoList {
  itemCount: number;
}
