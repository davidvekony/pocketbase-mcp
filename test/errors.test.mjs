import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flattenErrors, pocketbaseErrorMessage } from '../build/errors.js';

test('flattenErrors handles a plain string', () => {
  assert.deepEqual(flattenErrors('boom'), ['boom']);
});

test('flattenErrors handles an array of mixed values', () => {
  assert.deepEqual(flattenErrors(['a', { message: 'b' }, 42]), ['a', 'b']);
});

test('flattenErrors puts the message before flattened data', () => {
  const errors = {
    status: 400,
    message: 'Failed to create record.',
    data: { title: { code: 'validation_required', message: 'Missing required value' } },
  };
  assert.deepEqual(flattenErrors(errors), ['Failed to create record.', 'Missing required value']);
});

test('flattenErrors walks nested objects without a message', () => {
  assert.deepEqual(flattenErrors({ a: { message: 'inner' } }), ['inner']);
});

test('flattenErrors bubbles up primitive values in data through the fallback', () => {
  assert.deepEqual(flattenErrors({ data: { title: 'raw string' } }), ['raw string']);
});

test('flattenErrors returns nothing for unsupported values', () => {
  assert.deepEqual(flattenErrors(undefined), []);
  assert.deepEqual(flattenErrors(null), []);
  assert.deepEqual(flattenErrors(42), []);
  assert.deepEqual(flattenErrors({}), []);
});

test('pocketbaseErrorMessage joins messages and falls back', () => {
  assert.equal(pocketbaseErrorMessage({ message: 'a', data: { x: { message: 'b' } } }), 'a\nb');
  assert.equal(pocketbaseErrorMessage({}), 'No errors found');
});
