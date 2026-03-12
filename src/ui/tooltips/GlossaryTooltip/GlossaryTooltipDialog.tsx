import { text } from '@/shared/i18n/catalog';
import type { Language } from '@/shared/i18n/types';
import { Button } from '@/ui/primitives/Button';

import styles from './style.module.scss';

type GlossaryTooltipDialogProps = {
  description: string;
  dialogId: string;
  language: Language;
  onClose: () => void;
  setPopoverElement: (node: HTMLDivElement | null) => void;
  title: string;
};

export function GlossaryTooltipDialog({
  description,
  dialogId,
  language,
  onClose,
  setPopoverElement,
  title,
}: GlossaryTooltipDialogProps) {
  return (
    <div className={styles.modalOverlay} role="presentation" onClick={onClose}>
      <div
        ref={setPopoverElement}
        id={dialogId}
        className={styles.modalPanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${dialogId}-title`}
        onClick={(event) => event.stopPropagation()}
      >
        <strong id={`${dialogId}-title`}>{title}</strong>
        <span>{description}</span>
        <div className={styles.modalActions}>
          <Button onClick={onClose}>{text(language, 'close')}</Button>
        </div>
      </div>
    </div>
  );
}
