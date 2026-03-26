import type { ReactNode } from 'react';
import styles from './Modal.module.scss';

export interface ModalProps {
  children: ReactNode;
  className?: string;
  size?: 'small' | 'medium' | 'large';
}

export function Modal({ children, className = '', size = 'medium' }: ModalProps) {
  const sizeClass = styles[size] ?? styles.medium;
  const modalClass = `${styles.modal} ${sizeClass} ${className}`.trim();

  return <div className={modalClass}>{children}</div>;
}
