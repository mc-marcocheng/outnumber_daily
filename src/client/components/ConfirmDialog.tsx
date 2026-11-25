import { useTranslation } from 'react-i18next';
import { AppDialog } from './AppDialog';

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Destructive-action confirmation. Focus starts on Cancel, and Escape
 * or an outside click cancels.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTranslation();

  return (
    <AppDialog
      open={open}
      title={title}
      dismissible
      describedBy="confirm-body"
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <p className="result-line confirm-message" id="confirm-body">
        {message}
      </p>
      <div className="result-actions confirm-actions">
        <button type="button" className="primary-action" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button
          type="button"
          className="secondary-action"
          autoFocus
          onClick={onCancel}
        >
          {t('common.cancel')}
        </button>
      </div>
    </AppDialog>
  );
}
