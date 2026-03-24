import React, { memo } from 'react';

export interface SplitModeIconProps {
  mode: 'auto' | 'horizontal' | 'vertical';
  size?: number;
}

/**
 * SVG icon indicating the current tiling split mode.
 *
 * - auto:       a rectangle split by a diagonal dashed line (adaptive)
 * - horizontal: a rectangle split vertically into left/right panes
 * - vertical:   a rectangle split horizontally into top/bottom panes
 */
export const SplitModeIcon = memo<SplitModeIconProps>(function SplitModeIcon({ mode, size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Outer rectangle (shared by all modes) */}
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />

      {mode === 'horizontal' && (
        /* Vertical divider — left/right split */
        <line x1="8" y1="3" x2="8" y2="13" />
      )}

      {mode === 'vertical' && (
        /* Horizontal divider — top/bottom split */
        <line x1="2" y1="8" x2="14" y2="8" />
      )}

      {mode === 'auto' && (
        /* Both dividers shown with reduced opacity to suggest "either" */
        <>
          <line x1="8" y1="3" x2="8" y2="13" opacity="0.45" />
          <line x1="2" y1="8" x2="14" y2="8" opacity="0.45" />
          {/* Small "A" label in center for auto */}
          <text
            x="8"
            y="9"
            textAnchor="middle"
            dominantBaseline="central"
            fill="currentColor"
            stroke="none"
            fontSize="5.5"
            fontWeight="700"
          >
            A
          </text>
        </>
      )}
    </svg>
  );
});
