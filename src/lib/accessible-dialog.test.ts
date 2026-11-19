import assert from 'node:assert/strict';
import test from 'node:test';
import { installAccessibleDialogBehavior } from './use-accessible-dialog.js';

type KeyHandler = (event: KeyboardEvent) => void;

function createDialogHarness(focusableCount = 2) {
  const handlers = new Map<string, Set<KeyHandler>>();
  const documentLike = {
    activeElement: null as HTMLElement | null,
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      const listeners = handlers.get(type) ?? new Set<KeyHandler>();
      listeners.add(listener as KeyHandler);
      handlers.set(type, listeners);
    },
    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      const listeners = handlers.get(type);
      listeners?.delete(listener as KeyHandler);
      if (listeners?.size === 0) handlers.delete(type);
    },
  };

  const items: HTMLElement[] = [];
  for (let index = 0; index < focusableCount; index += 1) {
    let item: HTMLElement;
    const attributes = new Map<string, string>();
    item = {
      tabIndex: 0,
      hidden: false,
      focus: () => { documentLike.activeElement = item; },
      getAttribute: (name: string) => attributes.get(name) ?? null,
      setAttribute: (name: string, value: string) => { attributes.set(name, value); },
      matches: (selector: string) => selector === ':disabled' && attributes.has('disabled'),
      closest: (selector: string) => {
        const hiddenAncestor = selector.includes('[hidden]') && item.hidden;
        const inertAncestor = selector.includes('[inert]') && attributes.has('inert');
        const ariaHiddenAncestor = selector.includes('[aria-hidden="true"]')
          && attributes.get('aria-hidden') === 'true';
        return hiddenAncestor || inertAncestor || ariaHiddenAncestor ? item : null;
      },
    } as unknown as HTMLElement;
    items.push(item);
  }

  const dialog = {
    ownerDocument: documentLike,
    querySelectorAll: () => items,
    contains: (node: Node | null) => node === dialog || items.includes(node as HTMLElement),
    tabIndex: -1,
    focus: () => { documentLike.activeElement = dialog as unknown as HTMLElement; },
  } as unknown as HTMLElement;
  const previousFocusState = { focused: false };
  const previous = {
    focus: () => { previousFocusState.focused = true; },
  } as unknown as HTMLElement;
  documentLike.activeElement = previous;

  const dispatch = (key: string, shiftKey = false) => {
    let prevented = false;
    const event = {
      key,
      shiftKey,
      preventDefault: () => { prevented = true; },
    } as unknown as KeyboardEvent;
    for (const handler of handlers.get('keydown') ?? []) handler(event);
    return prevented;
  };

  return { dialog, documentLike, dispatch, handlers, items, previous, previousFocusState };
}

test('focuses the first control, wraps Tab, and restores focus on cleanup', () => {
  const harness = createDialogHarness();
  const cleanup = installAccessibleDialogBehavior(
    harness.dialog,
    () => assert.fail('Escape should not close the dialog in this test'),
    harness.documentLike as unknown as Document,
  );

  assert.equal(harness.documentLike.activeElement, harness.items[0]);
  harness.documentLike.activeElement = harness.items[1];
  assert.equal(harness.dispatch('Tab'), true);
  assert.equal(harness.documentLike.activeElement, harness.items[0]);

  harness.documentLike.activeElement = harness.items[0];
  assert.equal(harness.dispatch('Tab', true), true);
  assert.equal(harness.documentLike.activeElement, harness.items[1]);

  cleanup();
  assert.equal(harness.previousFocusState.focused, true);
  assert.equal(harness.handlers.has('keydown'), false);
});

test('returns focus to the dialog when focus escapes and handles Escape', () => {
  const harness = createDialogHarness();
  let closed = false;
  installAccessibleDialogBehavior(
    harness.dialog,
    () => { closed = true; },
    harness.documentLike as unknown as Document,
  );

  harness.documentLike.activeElement = harness.previous;
  assert.equal(harness.dispatch('Tab'), true);
  assert.equal(harness.documentLike.activeElement, harness.items[0]);
  assert.equal(harness.dispatch('Escape'), true);
  assert.equal(closed, true);
});

test('focuses the dialog itself when it has no focusable descendants', () => {
  const harness = createDialogHarness(0);
  installAccessibleDialogBehavior(
    harness.dialog,
    () => undefined,
    harness.documentLike as unknown as Document,
  );

  assert.equal(harness.documentLike.activeElement, harness.dialog);
  assert.equal(harness.dispatch('Tab'), true);
  assert.equal(harness.documentLike.activeElement, harness.dialog);
});

test('only the topmost open dialog handles the shared document key event', () => {
  const harness = createDialogHarness(1);
  const firstCleanup = installAccessibleDialogBehavior(
    harness.dialog,
    () => undefined,
    harness.documentLike as unknown as Document,
  );
  let secondItem: HTMLElement;
  secondItem = {
    focus: () => { harness.documentLike.activeElement = secondItem; },
  } as unknown as HTMLElement;
  let secondDialog: HTMLElement;
  secondDialog = {
    ownerDocument: harness.documentLike,
    querySelectorAll: () => [secondItem],
    contains: (node: Node | null) => node === secondDialog || node === secondItem,
    focus: () => { harness.documentLike.activeElement = secondDialog; },
  } as unknown as HTMLElement;
  const secondCleanup = installAccessibleDialogBehavior(
    secondDialog,
    () => undefined,
    harness.documentLike as unknown as Document,
  );

  harness.documentLike.activeElement = harness.items[0];
  assert.equal(harness.dispatch('Tab'), true);
  assert.equal(harness.documentLike.activeElement, secondItem);

  secondCleanup();
  assert.equal(harness.documentLike.activeElement, harness.items[0]);
  assert.equal(harness.dispatch('Tab'), true);
  assert.equal(harness.documentLike.activeElement, harness.items[0]);
  firstCleanup();
});

test('keeps dialog stacks isolated between documents', () => {
  const first = createDialogHarness(1);
  const second = createDialogHarness(1);
  let firstClosed = false;
  let secondClosed = false;

  const firstCleanup = installAccessibleDialogBehavior(
    first.dialog,
    () => { firstClosed = true; },
    first.documentLike as unknown as Document,
  );
  const secondCleanup = installAccessibleDialogBehavior(
    second.dialog,
    () => { secondClosed = true; },
    second.documentLike as unknown as Document,
  );

  assert.equal(first.dispatch('Escape'), true);
  assert.equal(firstClosed, true);
  assert.equal(secondClosed, false);
  assert.equal(second.dispatch('Escape'), true);
  assert.equal(secondClosed, true);

  secondCleanup();
  firstCleanup();
});

test('orders positive tabindex controls before ordinary tab stops', () => {
  const harness = createDialogHarness(3);
  harness.items[0].tabIndex = 0;
  harness.items[1].tabIndex = 2;
  harness.items[2].tabIndex = 1;

  installAccessibleDialogBehavior(
    harness.dialog,
    () => undefined,
    harness.documentLike as unknown as Document,
  );

  assert.equal(harness.documentLike.activeElement, harness.items[2]);
  harness.documentLike.activeElement = harness.items[0];
  assert.equal(harness.dispatch('Tab'), true);
  assert.equal(harness.documentLike.activeElement, harness.items[2]);
  assert.equal(harness.dispatch('Tab', true), true);
  assert.equal(harness.documentLike.activeElement, harness.items[0]);
});

test('skips hidden, hidden-type, disabled, and aria-hidden controls', () => {
  const harness = createDialogHarness(5);
  harness.items[0].hidden = true;
  harness.items[1].setAttribute('type', 'hidden');
  harness.items[2].setAttribute('disabled', '');
  harness.items[3].setAttribute('aria-hidden', 'true');

  installAccessibleDialogBehavior(
    harness.dialog,
    () => undefined,
    harness.documentLike as unknown as Document,
  );

  assert.equal(harness.documentLike.activeElement, harness.items[4]);
});

test('closing a lower dialog does not steal focus from the topmost dialog', () => {
  const harness = createDialogHarness(1);
  const lowerCleanup = installAccessibleDialogBehavior(
    harness.dialog,
    () => undefined,
    harness.documentLike as unknown as Document,
  );
  let topItem: HTMLElement;
  topItem = {
    focus: () => { harness.documentLike.activeElement = topItem; },
  } as unknown as HTMLElement;
  let topDialog: HTMLElement;
  topDialog = {
    ownerDocument: harness.documentLike,
    querySelectorAll: () => [topItem],
    contains: (node: Node | null) => node === topDialog || node === topItem,
    focus: () => { harness.documentLike.activeElement = topDialog; },
    tabIndex: -1,
  } as unknown as HTMLElement;
  const topCleanup = installAccessibleDialogBehavior(
    topDialog,
    () => undefined,
    harness.documentLike as unknown as Document,
  );

  assert.equal(harness.documentLike.activeElement, topItem);
  lowerCleanup();
  assert.equal(harness.documentLike.activeElement, topItem);
  topCleanup();
});
