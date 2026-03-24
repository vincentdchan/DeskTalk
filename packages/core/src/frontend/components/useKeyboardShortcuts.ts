import { useEffect } from 'react';
import { useWindowManager } from '../stores/window-manager';

/**
 * Returns true if the event target is an interactive element where we should
 * not intercept keyboard shortcuts (inputs, textareas, contenteditable).
 */
function isInputTarget(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  if (!target) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * Global keyboard shortcut handler for the tiling window manager.
 * All shortcuts use the Option (Alt) modifier.
 *
 * We match on `e.code` (physical key) instead of `e.key` because on macOS
 * the Option key produces special Unicode characters as `e.key`
 * (e.g. Option+F → ƒ, Option+1 → ¡), making `e.key` unreliable.
 *
 * Mount once in Shell.
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (!e.altKey) return;
      // Allow normal typing in input fields
      if (isInputTarget(e)) return;

      const store = useWindowManager.getState();
      const code = e.code;

      // ─── Navigation: Option + 1/2/3 ─────────────────────────────────
      if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3') {
        e.preventDefault();
        const n = parseInt(code.charAt(5), 10);
        store.focusNth(n);
        return;
      }

      // ─── Directional focus: Option + h/j/k/l ───────────────────────
      if (!e.shiftKey) {
        switch (code) {
          case 'KeyH':
            e.preventDefault();
            store.focusDirection('left');
            return;
          case 'KeyL':
            e.preventDefault();
            store.focusDirection('right');
            return;
          case 'KeyK':
            e.preventDefault();
            store.focusDirection('up');
            return;
          case 'KeyJ':
            e.preventDefault();
            store.focusDirection('down');
            return;
        }
      }

      // ─── Swap: Option + Shift + h/j/k/l ────────────────────────────
      if (e.shiftKey) {
        switch (code) {
          case 'KeyH':
            e.preventDefault();
            store.swapDirection('left');
            return;
          case 'KeyL':
            e.preventDefault();
            store.swapDirection('right');
            return;
          case 'KeyK':
            e.preventDefault();
            store.swapDirection('up');
            return;
          case 'KeyJ':
            e.preventDefault();
            store.swapDirection('down');
            return;
        }
      }

      // ─── Fullscreen: Option + f ─────────────────────────────────────
      if (code === 'KeyF' && !e.shiftKey) {
        e.preventDefault();
        store.toggleFullscreen();
        return;
      }

      // ─── Close: Option + w ──────────────────────────────────────────
      if (code === 'KeyW' && !e.shiftKey) {
        e.preventDefault();
        if (store.focusedWindowId) {
          store.closeWindow(store.focusedWindowId);
        }
        return;
      }

      // ─── Split direction: Option + v (vertical), Option + b (horizontal)
      // Pressing the same shortcut again toggles back to auto.
      if (code === 'KeyV' && !e.shiftKey) {
        e.preventDefault();
        store.setNextSplitDirection(store.nextSplitDirection === 'vertical' ? 'auto' : 'vertical');
        return;
      }
      if (code === 'KeyB' && !e.shiftKey) {
        e.preventDefault();
        store.setNextSplitDirection(
          store.nextSplitDirection === 'horizontal' ? 'auto' : 'horizontal',
        );
        return;
      }

      // ─── Rotate split: Option + r ───────────────────────────────────
      if (code === 'KeyR' && !e.shiftKey) {
        e.preventDefault();
        store.rotateFocusedSplit();
        return;
      }

      // ─── Resize: Option + [ (shrink), Option + ] (grow), Option + = (equalize)
      if (code === 'BracketLeft' && !e.shiftKey) {
        e.preventDefault();
        store.adjustFocusedRatio(-0.05);
        return;
      }
      if (code === 'BracketRight' && !e.shiftKey) {
        e.preventDefault();
        store.adjustFocusedRatio(0.05);
        return;
      }
      if (code === 'Equal' && !e.shiftKey) {
        e.preventDefault();
        store.equalizeFocusedRatio();
        return;
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
