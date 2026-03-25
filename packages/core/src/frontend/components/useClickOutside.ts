import React, { useEffect } from 'react';

function containsTarget(refs: React.RefObject<HTMLElement | null>[], target: Node | null): boolean {
  if (!target) return false;
  return refs.some((ref) => {
    const element = ref.current;
    return element ? element.contains(target) : false;
  });
}

export function useClickOutside(
  refs: React.RefObject<HTMLElement | null>[],
  onClickOutside: () => void,
  enabled: boolean = true,
): void {
  useEffect(() => {
    if (!enabled) return;

    function handleMouseDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!containsTarget(refs, target)) {
        onClickOutside();
      }
    }

    function handleWindowBlur() {
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if (active?.tagName === 'IFRAME') {
          onClickOutside();
        }
      });
    }

    document.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [enabled, onClickOutside, refs]);
}
