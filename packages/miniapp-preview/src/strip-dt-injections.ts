const DT_THEME_TAG_PATTERN = /\s*<link\b[^>]*\bdata-dt-theme\b[^>]*>\s*/gi;
const DT_THEME_SYNC_TAG_PATTERN =
  /\s*<script\b[^>]*\bdata-dt-theme-sync\b[^>]*>[\s\S]*?<\/script>\s*/gi;
const DT_UI_TAG_PATTERN = /\s*<script\b[^>]*\bdata-dt-ui\b[^>]*><\/script>\s*/gi;
const DT_BRIDGE_TAG_PATTERN = /\s*<script\b[^>]*\bdata-dt-bridge\b[^>]*>[\s\S]*?<\/script>\s*/gi;
const STREAM_PREAMBLE_HEAD_PATTERN = /^\s*<!DOCTYPE html><html><head>\s*(?=<!DOCTYPE html>)/i;

export function stripDtInjections(html: string): string {
  const stripped = html
    .replace(DT_THEME_TAG_PATTERN, '\n')
    .replace(DT_THEME_SYNC_TAG_PATTERN, '\n')
    .replace(DT_UI_TAG_PATTERN, '\n')
    .replace(DT_BRIDGE_TAG_PATTERN, '\n')
    .replace(STREAM_PREAMBLE_HEAD_PATTERN, '');

  return stripped.trimStart();
}
