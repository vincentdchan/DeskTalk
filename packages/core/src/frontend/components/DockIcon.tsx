import styles from './DockIcon.module.scss';

interface DockIconProps {
  icon: string;
  iconPng?: string;
  className?: string;
  tooltip?: string;
}

export function DockIcon({ icon, iconPng, className, tooltip }: DockIconProps) {
  const content = (
    <div className={[styles.dockIcon, className].filter(Boolean).join(' ')}>
      {iconPng ? (
        <img className={styles.dockIconImage} src={iconPng} alt="" aria-hidden="true" />
      ) : (
        <span>{icon}</span>
      )}
    </div>
  );

  if (tooltip) {
    return <dt-tooltip content={tooltip}>{content}</dt-tooltip>;
  }

  return content;
}
