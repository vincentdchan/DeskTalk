import { useEffect, useRef, useState, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import styles from './ContextMenu.module.scss';

interface MenuItem {
  id: string;
  label: string;
  disabled?: boolean;
}

interface ContextMenuProps {
  children: React.ReactNode;
  items: MenuItem[];
  onSelect: (itemId: string) => void;
  onOpen?: () => void;
}

const CONTEXT_MENU_OPEN_EVENT = 'dt-contextmenu-open';

interface ContextMenuOpenEventDetail {
  menuId: string;
}

export function ContextMenu({ children, items, onSelect, onOpen }: ContextMenuProps) {
  const menuId = useId();
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = document.createElement('div');
    el.id = 'dt-contextmenu-portal';
    document.body.appendChild(el);
    setContainer(el);
    return () => {
      document.body.removeChild(el);
    };
  }, []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (!triggerRef.current) return;

      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        left: rect.left,
        top: rect.top,
      });
      setIsVisible(true);
      onOpen?.();

      // Dispatch event to close other context menus
      document.dispatchEvent(
        new CustomEvent<ContextMenuOpenEventDetail>(CONTEXT_MENU_OPEN_EVENT, {
          detail: { menuId },
        }),
      );
    },
    [onOpen, menuId],
  );

  useEffect(() => {
    if (isVisible && menuRef.current) {
      const menuHeight = menuRef.current.offsetHeight;
      setPosition((prev) => ({
        ...prev,
        top: prev.top - menuHeight - 8,
      }));
    }
  }, [isVisible]);

  const handleSelect = useCallback(
    (itemId: string) => {
      onSelect(itemId);
      setIsVisible(false);
    },
    [onSelect],
  );

  useEffect(() => {
    if (!isVisible) return;

    const handleClickOutside = () => {
      setIsVisible(false);
    };

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsVisible(false);
      }
    };

    const handleOtherMenuOpen = (e: Event) => {
      const customEvent = e as CustomEvent<ContextMenuOpenEventDetail>;
      if (customEvent.detail.menuId !== menuId) {
        setIsVisible(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    document.addEventListener(CONTEXT_MENU_OPEN_EVENT, handleOtherMenuOpen);

    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
      document.removeEventListener(CONTEXT_MENU_OPEN_EVENT, handleOtherMenuOpen);
    };
  }, [isVisible, menuId]);

  const menu = isVisible ? (
    <div
      ref={menuRef}
      className={styles.contextMenu}
      style={{
        left: position.left,
        top: position.top,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <button
          key={item.id}
          className={[styles.menuItem, item.disabled ? styles.menuItemDisabled : '']
            .filter(Boolean)
            .join(' ')}
          onClick={() => handleSelect(item.id)}
          disabled={item.disabled}
        >
          {item.label}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <span ref={triggerRef} className={styles.contextMenuTrigger} onContextMenu={handleContextMenu}>
      {children}
      {container && createPortal(menu, container)}
    </span>
  );
}
