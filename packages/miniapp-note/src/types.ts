/** Shared data types for the Note MiniApp. */

export interface Note {
  id: string;
  title: string;
  tags: string[];
  content: string; // Raw Markdown including front matter
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface NoteMeta {
  id: string;
  title: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  /** First ~100 chars of body text for preview */
  preview: string;
}

export interface TagCount {
  tag: string;
  count: number;
}
