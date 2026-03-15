import styles from './DockIcon.module.scss';
import { Tooltip } from './Tooltip';

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
    return <Tooltip content={tooltip}>{content}</Tooltip>;
  }

  return content;
}
