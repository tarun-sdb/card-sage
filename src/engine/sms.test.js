// UPI-hint bank matching. Mirrors upiCardFor normalization (strip BANK).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cardsForBank } from './sms.js';

const CAT = [
  { name: 'HDFC Millennia', issuer: 'HDFC' },
  { name: 'SBI Cashback', issuer: 'SBI' },
  { name: 'Amex SmartEarn', issuer: 'AMEX' },
  { name: 'AU Small Fin Bank card', issuer: 'AU' },
  { name: 'Kotak Royal', issuer: 'KOTAK' },
];

test('sender-ID bank names match directly', () => {
  assert.equal(cardsForBank(CAT, 'HDFC')[0].name, 'HDFC Millennia');
  assert.equal(cardsForBank(CAT, 'SBI')[0].name, 'SBI Cashback');
});

test('normalizes BANK / MAHINDRA / LIMITED suffixes', () => {
  assert.equal(cardsForBank(CAT, 'HDFC Bank')[0].issuer, 'HDFC');
  assert.equal(cardsForBank(CAT, 'KOTAK MAHINDRA')[0].issuer, 'KOTAK');
});

test('body-named banks hit the alias map', () => {
  assert.equal(cardsForBank(CAT, 'AMERICAN EXPRESS')[0].issuer, 'AMEX');
  assert.equal(cardsForBank(CAT, 'AU SMALL FINANCE BANK')[0].issuer, 'AU');
});

test('unknown / missing bank returns empty', () => {
  assert.deepEqual(cardsForBank(CAT, 'BANK OF DOGMA'), []);
  assert.deepEqual(cardsForBank(CAT, null), []);
});