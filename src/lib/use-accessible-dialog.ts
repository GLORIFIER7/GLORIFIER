import { useLayoutEffect, useRef } from 'react';

const activeDialogStacks = new WeakMap<Document, HTMLElement[]>();

function getActiveDialogStack(ownerDocument: Document): HTMLElement[] {
  let stack = activeDialogStacks.get(ownerDocument);
  if (!stack) {
    stack = [];
    activeDialogStacks.set(ownerDocument, stack);
  }
  return stack;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function installAccessibleDialogBehavior(
  dialog: HTMLElement,
  onClose: () => void,
  ownerDocument: Document = dialog.ownerDocument,
): () => void {
  const previouslyFocused = ownerDocument.activeElement as HTMLElement | null;
  const activeDialogStack = getActiveDialogStack(ownerDocument);
  const previousStackIndex = activeDialogStack.indexOf(dialog);
  if (previousStackIndex >= 0) activeDialogStack.splice(previousStackIndex, 1);
  activeDialogStack.push(dialog);
  const focusableItems = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((item) => {
      if (
        item.tabIndex < 0
        || item.hidden
        || item.getAttribute('type')?.toLowerCase() === 'hidden'
        || item.matches(':disabled')
        || item.closest('[hidden], [inert], [aria-hidden="true"]')
      ) return false;

      const style = ownerDocument.defaultView?.getComputedStyle(item);
      const hasLayout = item.getClientRects().length > 0;
      return hasLayout
        && (!style
          || (style.display !== 'none'
            && style.visibility !== 'hidden'
            && style.visibility !== 'collapse'));
    })
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const leftTabIndex = left.item.tabIndex;
      const rightTabIndex = right.item.tabIndex;
      if (leftTabIndex > 0 && rightTabIndex > 0) {
        return leftTabIndex - rightTabIndex || left.index - right.index;
      }
      if (leftTabIndex > 0) return -1;
      if (rightTabIndex > 0) return 1;
      return left.index - right.index;
    })
    .map(({ item }) => item);
  const initialItems = focusableItems();
  if (initialItems.length === 0 && dialog.tabIndex < 0) dialog.tabIndex = -1;
  (initialItems[0] ?? dialog).focus();

  const handleKeyDown = (event: KeyboardEvent) => {
    if (activeDialogStack[activeDialogStack.length - 1] !== dialog) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const items = focusableItems();
    if (items.length === 0) {
      event.preventDefault();
      if (dialog.tabIndex < 0) dialog.tabIndex = -1;
      dialog.focus();
      return;
    }

    const first = items[0];
    const last = items[items.length - 1];
    const activeElement = ownerDocument.activeElement;

    if (!dialog.contains(activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && (activeElement === first || activeElement === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  ownerDocument.addEventListener('keydown', handleKeyDown);
  return () => {
    ownerDocument.removeEventListener('keydown', handleKeyDown);
    const stackIndex = activeDialogStack.lastIndexOf(dialog);
    const wasTopmost = stackIndex >= 0 && stackIndex === activeDialogStack.length - 1;
    if (stackIndex >= 0) activeDialogStack.splice(stackIndex, 1);
    if (wasTopmost && previouslyFocused && typeof previouslyFocused.focus === 'function') {
      previouslyFocused.focus();
    }
  };
}

export function useAccessibleDialog(isOpen: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog) return undefined;
    return installAccessibleDialogBehavior(dialog, () => onCloseRef.current());
  }, [isOpen]);

  return dialogRef;
}
