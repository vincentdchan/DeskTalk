/**
 * Returns an inline `<script>` tag that loads the @desktalk/ui UMD bundle
 * from the core server's `/api/ui/desktalk-ui.js` endpoint.
 *
 * This registers all DeskTalk web components (`<dt-card>`, `<dt-tooltip>`,
 * etc.) inside the generated HTML iframe so AI-produced markup can use them.
 */
export const UI_BUNDLE_SCRIPT_TAG = '<script src="/api/ui/desktalk-ui.js" data-dt-ui></script>';
