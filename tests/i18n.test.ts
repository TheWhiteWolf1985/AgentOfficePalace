import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t, setLanguage, getLanguage, isLanguage, languageTag, remoteText } from '../src/shared/i18n.js';
import { italian } from '../src/shared/locales/it.js';
import { savedLanguage } from '../src/client/i18n.js';
import { workerPr } from '../src/shared/status.js';
import { waitingLabel } from '../src/client/nextup.js';
import { notifyPermission } from '../src/client/notify.js';
import type { WorkerInfo } from '../src/shared/protocol.js';

test('Italian and English preserve user-supplied values and use English for unknown UI text', () => {
  try {
    setLanguage('it');
    assert.equal(t('Settings'), 'Impostazioni');
    assert.equal(t`Open ${'Workers {0} <img src=x>'}`, 'Apri Workers {0} <img src=x>');
    assert.equal(t`Uncatalogued ${'Settings'} ${null} ${undefined}`, 'Uncatalogued Settings null undefined');
    assert.equal(t('Not in this catalogue'), 'Not in this catalogue');
    assert.equal(languageTag(), 'it-IT');
    setLanguage('en');
    assert.equal(t('Settings'), 'Settings');
    assert.equal(t`Open ${'Impostazioni'}`, 'Open Impostazioni');
    assert.equal(getLanguage(), 'en');
  } finally { setLanguage('en'); }
});

test('language preference validates URL and storage, including disabled storage', () => {
  assert.equal(savedLanguage(undefined, ''), 'it');
  assert.equal(savedLanguage({ getItem: () => 'en' }, ''), 'en');
  assert.equal(savedLanguage({ getItem: () => 'it' }, '?lang=en'), 'en');
  assert.equal(savedLanguage({ getItem: () => 'bad-value' }, '?lang=invalid'), 'it');
  assert.equal(savedLanguage({ getItem: () => { throw Error('blocked'); } }, ''), 'it');
  assert.equal(isLanguage('it'), true);
  assert.equal(isLanguage('IT'), false);
});

test('catalogue cannot introduce interpolated values absent from the English source', () => {
  assert.ok(Object.keys(italian).length > 2000);
  for (const [source, translated] of Object.entries(italian)) {
    assert.ok(translated.length, source);
    const placeholders = new Set([...source.matchAll(/\{(\d+)\}/g)].map((m) => m[1]));
    for (const match of translated.matchAll(/\{(\d+)\}/g)) assert.ok(placeholders.has(match[1]), source);
  }
});

test('server error translation preserves variable names and unknown diagnostics', () => {
  try {
    setLanguage('it');
    assert.equal(remoteText('Wrong password'), 'Password errata');
    assert.equal(remoteText('This browser can\'t take dictation in en-US.'), 'Questo browser non supporta la dettatura in en-US.');
    assert.equal(remoteText('Unknown raw diagnostic: ECONNRESET'), 'Unknown raw diagnostic: ECONNRESET');
    setLanguage('en');
    assert.equal(remoteText('Wrong password'), 'Wrong password');
  } finally { setLanguage('en'); }
});

test('Italian labels leave PR state and browser capability identifiers operational', () => {
  const previous = ['window', 'Notification'].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  try {
    setLanguage('it');
    const worker = { id: 'worker-1', status: 'needs_input', pr: { number: 42 } } as WorkerInfo;
    assert.deepEqual(workerPr(worker, [], []), { state: 'open', number: 42 });
    assert.equal(waitingLabel([worker]), '🙋 1 richiede il tuo intervento');
    assert.equal(waitingLabel([worker, { ...worker, id: 'worker-2' }]), '🙋 2 richiedono il tuo intervento');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { isSecureContext: true, Notification: {} } });
    Object.defineProperty(globalThis, 'Notification', { configurable: true, value: { permission: 'granted' } });
    assert.equal(notifyPermission(), 'granted');
  } finally {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    setLanguage('en');
  }
});
