#!/usr/bin/env npx tsx

import assert from 'node:assert/strict';
import { retainUnsavedWidgetModifications } from '../../src/shared/utils/widgetModifications';

const savedValues = new Map([
  [1, { prompt: 'first prompt', seed: 1 }],
  [2, { strength: 0.5 }],
]);

const currentValues = new Map([
  [1, { prompt: 'edited during save', seed: 1, steps: 20 }],
  [2, { strength: 0.5 }],
  [3, { filename: 'new-output' }],
]);

assert.deepEqual(
  retainUnsavedWidgetModifications(currentValues, savedValues),
  new Map([
    [1, { prompt: 'edited during save', steps: 20 }],
    [3, { filename: 'new-output' }],
  ]),
  'only values changed or added while saving should remain dirty',
);

assert.deepEqual(
  retainUnsavedWidgetModifications(savedValues, savedValues),
  new Map(),
  'a completed save with no concurrent edits should clear all dirty values',
);

console.log('Save state tests passed');
