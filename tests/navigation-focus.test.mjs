import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareNavigationFocus, completeNavigationFocus } from '../src/navigation-focus.ts';

function setup() {
  const doc = { body: {}, activeElement: null, querySelector: () => root };
  const button = { closest: () => null, getClientRects: () => [{}] };
  const root = { contains: node => node === button || node === root, focus: options => { assert.equal(options.preventScroll, true); doc.activeElement = root; } };
  doc.activeElement = button;
  return { doc, button, root };
}

test('move focus out of the outgoing screen before navigation can hide its button', () => {
  const { doc, root } = setup();
  prepareNavigationFocus(doc);
  assert.equal(doc.activeElement, root);
});

test('completed navigation recovers body/hidden focus but preserves a visible tab or control', () => {
  const { doc, root, button } = setup();
  completeNavigationFocus(doc);
  assert.equal(doc.activeElement, button);
  doc.activeElement = doc.body;
  completeNavigationFocus(doc);
  assert.equal(doc.activeElement, root);
  doc.activeElement = { closest: () => ({}), getClientRects: () => [{}] };
  completeNavigationFocus(doc);
  assert.equal(doc.activeElement, root);
});

test('SSR, absent app root and focus outside the app are untouched', () => {
  assert.doesNotThrow(() => prepareNavigationFocus());
  assert.doesNotThrow(() => completeNavigationFocus());
  const { doc } = setup();
  const outside = { closest: () => null, getClientRects: () => [{}] };
  doc.activeElement = outside;
  prepareNavigationFocus(doc);
  assert.equal(doc.activeElement, outside);
  doc.querySelector = () => null;
  assert.doesNotThrow(() => prepareNavigationFocus(doc));
});
