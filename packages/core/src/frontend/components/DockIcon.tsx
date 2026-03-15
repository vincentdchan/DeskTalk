import styles from './DockIcon.module.scss';

interface DockIconProps {
  icon: string;
  iconPng?: string;
  className?: string;
}

export function DockIcon({ icon, iconPng, className }: DockIconProps) {
  return (
    <div className={[styles.dockIcon, className].filter(Boolean).join(' ')}>
      {iconPng ? (
        <img className={styles.dockIconImage} src={iconPng} alt="" aria-hidden="true" />
      ) : (
        <span>{icon}</span>
      )}
    </div>
  );
}
