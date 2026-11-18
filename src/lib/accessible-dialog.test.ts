import assert from 'node:assert/strict';
import test from 'node:test';
import { installAccessibleDialogBehavior } from './use-accessible-dialog.js';

type KeyHandler = (event: KeyboardEvent) => void;

function createDialogHarness(focusableCount = 2) {
  const handlers = new Map<string, KeyHandler>();
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
    item = {
      focus: () => { documentLike.activeElement = item; },
    } as unknown as HTMLElement;
    items.push(item);
  }

  const dialog = {
    ownerDocument: documentLike,
    querySelectorAll: () => items,
    contains: (node: Node | null) => node === dialog || items.includes(node as HTMLElement),
    focus: () => { documentLike.activeElement = dialog as unknown as HTMLElement; },
  } as unknown as HTMLElement;
  const previous = { focused: false, focus() { this.focused = true; } } as unknown as HTMLElement;
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

  return { dialog, documentLike, dispatch, handlers, items, previous };
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
  assert.equal(harness.previous.focused, true);
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
  const secondItem = {
    focus: () => { harness.documentLike.activeElement = secondItem as unknown as HTMLElement; },
  } as unknown as HTMLElement;
  const secondDialog = {
    ownerDocument: harness.documentLike,
    querySelectorAll: () => [secondItem],
    contains: (node: Node | null) => node === secondDialog || node === secondItem,
    focus: () => { harness.documentLike.activeElement = secondDialog as unknown as HTMLElement; },
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
