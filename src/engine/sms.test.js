// UPI-hint bank matching. Mirrors upiCardFor normalization (strip BANK).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cardsForBank, parseSms } from './sms.js';

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

test('null catalog (pre-load) does not crash', () => {
  assert.deepEqual(cardsForBank(null, 'HDFC'), []);
});

test('direction tags money-in vs spend', () => {
  const sal = parseSms('HDFCBK', 'Salary of Rs.85000 for Aug-26 credited to A/c XX1234 on 01-SEP-26.');
  assert.equal(sal.direction, 'in');
  assert.equal(sal.amount, 85000);
  const upiIn = parseSms('HDFCBK', 'Rs 500 received from 98765@ybl to A/c XX1234 on 08-09-26.');
  assert.equal(upiIn.direction, 'in');
  const out = parseSms('HDFCBK', 'Spent Rs.1874 From HDFC Bank Card x1665 At RAZ*Smytten On 2026-09-07:19:10:39.');
  assert.equal(out.direction, 'out');
  assert.equal(
    parseSms('SLICE', 'Your slice UPI credit card bill of Rs. 10,961.36 has been paid successfully via autopay.'),
    null
  );
});