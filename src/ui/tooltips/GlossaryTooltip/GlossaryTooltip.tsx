import { lazy, Suspense, useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { getGlossaryEntry } from '@/features/glossary/terms';
import type { GlossaryTermId } from '@/features/glossary/terms';
import { useIsMobileViewport } from '@/shared/hooks/useIsMobileViewport';
import { formatGlossaryTooltipLabel } from '@/shared/i18n/catalog';
import type { Language } from '@/shared/i18n/types';

import styles from './style.module.scss';

type GlossaryTooltipProps = {
  compact?: boolean;
  language: Language;
  termId: GlossaryTermId;
};

const TOOLTIP_OPEN_EVENT = 'wmbl:tooltip-open';
const VIEWPORT_PADDING = 12;
const TOOLTIP_GAP = 8;
const MOBILE_BREAKPOINT = 720;
const loadGlossaryTooltipDialog = () => import('./GlossaryTooltipDialog');
const GlossaryTooltipDialog = lazy(() =>
  loadGlossaryTooltipDialog().then((module) => ({ default: module.GlossaryTooltipDialog })),
);

export function preloadGlossaryTooltipDialog(): void {
  void loadGlossaryTooltipDialog();
}

export function GlossaryTooltip({ compact = false, language, termId }: GlossaryTooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({
    left: VIEWPORT_PADDING,
    top: VIEWPORT_PADDING,
    maxHeight: 220,
    ready: false,
  });
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const popoverRef = useRef<HTMLElement | null>(null);
  const entry = getGlossaryEntry(termId, language);
  const isMobileViewport = useIsMobileViewport(MOBILE_BREAKPOINT);
  const buttonLabel = formatGlossaryTooltipLabel(language, entry.title);
  const handlePointerDown = useEffectEvent((event: PointerEvent) => {
    const target = event.target as Node;
    const isInsideAnchor = anchorRef.current?.contains(target);
    const isInsidePopover = popoverRef.current?.contains(target);

    if (!isInsideAnchor && !isInsidePopover) {
      setOpen(false);
    }
  });
  const handleTooltipOpen = useEffectEvent((event: Event) => {
    const detail = (event as CustomEvent<{ id?: string }>).detail;

    if (detail.id !== id) {
      setOpen(false);
    }
  });
  const handleEscape = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      setOpen(false);
    }
  });
  const updatePosition = useEffectEvent(() => {
    const anchor = anchorRef.current;
    const popover = popoverRef.current;

    if (!anchor || !popover) {
      return;
    }

    const anchorRect = anchor.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const clampedLeft = Math.min(
      viewportWidth - VIEWPORT_PADDING - popoverRect.width,
      Math.max(VIEWPORT_PADDING, anchorRect.right - popoverRect.width),
    );
    const spaceBelow = viewportHeight - anchorRect.bottom - TOOLTIP_GAP - VIEWPORT_PADDING;
    const spaceAbove = anchorRect.top - TOOLTIP_GAP - VIEWPORT_PADDING;
    const placeAbove = spaceBelow < popoverRect.height && spaceAbove > spaceBelow;
    const maxHeight = Math.max(96, placeAbove ? spaceAbove : spaceBelow);
    const desiredTop = placeAbove
      ? anchorRect.top - TOOLTIP_GAP - Math.min(popoverRect.height, maxHeight)
      : anchorRect.bottom + TOOLTIP_GAP;
    const clampedTop = Math.min(
      viewportHeight - VIEWPORT_PADDING - Math.min(popoverRect.height, maxHeight),
      Math.max(VIEWPORT_PADDING, desiredTop),
    );

    setPosition({
      top: clampedTop,
      left: clampedLeft,
      maxHeight,
      ready: true,
    });
  });

  useEffect(() => {
    if (!open || isMobileViewport) {
      return undefined;
    }

    document.addEventListener('pointerdown', handlePointerDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [handlePointerDown, isMobileViewport, open]);

  useEffect(() => {
    document.addEventListener(TOOLTIP_OPEN_EVENT, handleTooltipOpen);

    return () => {
      document.removeEventListener(TOOLTIP_OPEN_EVENT, handleTooltipOpen);
    };
  }, [handleTooltipOpen]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [handleEscape, open]);

  useLayoutEffect(() => {
    if (!open || isMobileViewport) {
      setPosition((current) => (current.ready ? { ...current, ready: false } : current));
      return undefined;
    }

    const frameId = window.requestAnimationFrame(updatePosition);

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isMobileViewport, open, updatePosition]);

  function toggleOpen() {
    const next = !open;

    if (next) {
      document.dispatchEvent(new CustomEvent(TOOLTIP_OPEN_EVENT, { detail: { id } }));
    }

    setOpen(next);
  }

  function setPopoverElement(node: HTMLDivElement | HTMLSpanElement | null) {
    popoverRef.current = node;
  }

  return (
    <span ref={anchorRef} className={styles.anchor}>
      <button
        type="button"
        className={styles.trigger}
        data-compact={compact || undefined}
        data-open={open || undefined}
        aria-expanded={open}
        aria-controls={`tooltip-${id}`}
        aria-label={buttonLabel}
        onClick={toggleOpen}
      >
        ?
      </button>
      {open
        ? createPortal(
            isMobileViewport ? (
              <Suspense fallback={null}>
                <GlossaryTooltipDialog
                  description={entry.description}
                  dialogId={`tooltip-${id}`}
                  language={language}
                  onClose={() => setOpen(false)}
                  setPopoverElement={setPopoverElement}
                  title={entry.title}
                />
              </Suspense>
            ) : (
              <span
                ref={setPopoverElement}
                id={`tooltip-${id}`}
                className={styles.popover}
                role="tooltip"
                aria-label={entry.title}
                style={{
                  top: position.top,
                  left: position.left,
                  maxHeight: position.maxHeight,
                  visibility: position.ready ? 'visible' : 'hidden',
                }}
              >
                <strong>{entry.title}</strong>
                <span>{entry.description}</span>
              </span>
            ),
            document.body,
          )
        : null}
    </span>
  );
}
