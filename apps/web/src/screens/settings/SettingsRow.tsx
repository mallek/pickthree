import { useId, type ReactNode } from 'react';
import { Chevron } from '@pickthree/ui';

/**
 * One drill-in row on the Settings hub: an icon, a title and a live summary of what the page
 * below holds, and a chevron. The accessible name is the title alone; the summary is its
 * description, so a screen reader hears "Appearance, button, System theme, pictures on".
 */
export function SettingsRow({
  icon,
  title,
  summary,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  summary: string;
  onClick: () => void;
}) {
  const titleId = useId();
  const summaryId = useId();
  return (
    <button
      type="button"
      className="settings-row"
      aria-labelledby={titleId}
      aria-describedby={summaryId}
      onClick={onClick}
    >
      <span className="settings-row-icon">{icon}</span>
      <span className="settings-row-text">
        <span id={titleId} className="settings-row-title">
          {title}
        </span>
        <span id={summaryId} className="settings-row-summary">
          {summary}
        </span>
      </span>
      <span className="settings-row-chevron">
        <Chevron />
      </span>
    </button>
  );
}
