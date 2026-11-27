import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type Props = {
  open: boolean;
  title: string;
  children: ReactNode;
  className?: string;
  /** Whether Escape and outside clicks dismiss the dialog. */
  dismissible?: boolean;
  variant?: 'plain' | 'won' | 'lost';
  labelledBy?: string;
  describedBy?: string;
  /** Decorative outcome icon shown beside the title (never named). */
  titleIcon?: ReactNode;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
};

/**
 * One accessible modal primitive for the whole app: focus is trapped
 * and restored by Radix, background content is inert, and Escape
 * follows the `dismissible` setting.
 */
export function AppDialog({
  open,
  title,
  children,
  className = '',
  dismissible = false,
  variant = 'plain',
  describedBy,
  titleIcon,
  onOpenChange,
  onCloseAutoFocus,
}: Props) {
  const { t } = useTranslation();
  const blockDismiss = (event: Event) => event.preventDefault();

  return (
    <Dialog.Root
      open={open}
      onOpenChange={dismissible ? onOpenChange : undefined}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className={[
            'dialog-content',
            className,
            variant === 'won'
              ? 'dialog-content--won'
              : variant === 'lost'
                ? 'dialog-content--lost'
                : '',
          ].join(' ')}
          aria-describedby={describedBy}
          onCloseAutoFocus={onCloseAutoFocus}
          onEscapeKeyDown={dismissible ? undefined : blockDismiss}
          onPointerDownOutside={dismissible ? undefined : blockDismiss}
          onInteractOutside={dismissible ? undefined : blockDismiss}
        >
          <Dialog.Title className="result-title">
            {titleIcon && (
              <span className="result-icon" aria-hidden="true">
                {titleIcon}
              </span>
            )}
            {title}
          </Dialog.Title>
          <div className="dialog-body">{children}</div>
          {dismissible && (
            <Dialog.Close
              className="dialog-close icon-button"
              aria-label={t('ui.closeDialog')}
              title={t('ui.closeDialog')}
            >
              <X />
            </Dialog.Close>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
