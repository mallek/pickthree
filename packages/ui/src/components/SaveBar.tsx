/**
 * The bar a form shows while it holds changes that are not saved: Discard on the left, Save on
 * the right. It sits fixed above the tab bar, and leaves a spacer of its own height in the flow
 * so the last field can scroll clear of it. Render it only while there is something to save.
 */
export function SaveBar({
  saveLabel,
  discardLabel,
  onSave,
  onDiscard,
  busy,
  disabled,
}: {
  saveLabel: string;
  discardLabel: string;
  onSave: () => void;
  onDiscard: () => void;
  /** A save is running: both buttons wait. */
  busy?: boolean | undefined;
  /** The form cannot be saved as it stands (a field is missing); Discard still works. */
  disabled?: boolean | undefined;
}) {
  return (
    <>
      <div className="ui-savebar-space" aria-hidden="true" />
      <div className="ui-savebar" role="group" aria-label="Unsaved changes">
        <button
          type="button"
          className="ui-btn ui-btn-secondary"
          onClick={onDiscard}
          disabled={busy}
        >
          {discardLabel}
        </button>
        <button
          type="button"
          className="ui-btn ui-btn-primary"
          data-audit-contrast="static"
          onClick={onSave}
          disabled={busy || disabled}
        >
          {saveLabel}
        </button>
      </div>
    </>
  );
}
