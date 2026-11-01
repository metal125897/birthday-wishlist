import assert from 'node:assert/strict';
import {isGiftPrice, parseGiftPrice} from '../dist/assets/gift-price.js';

for (const [text, expected] of [['', null], ['   ', null], ['0', 0], ['0000000', 0], ['9999999', 9999999], [' 123 ', 123], ['\t0\n', 0]]) {
  assert.equal(parseGiftPrice(text), expected, `Price text: ${JSON.stringify(text)}`);
}
for (const text of ['-1', '+1', '1.5', '1,5', '1e3', 'abc', '1 000', '10000000', '00000000', '１２３', '١٢٣']) {
  assert.ok(Number.isNaN(parseGiftPrice(text)), `Invalid price text: ${JSON.stringify(text)}`);
}
for (const value of [0, 1, 9999999]) assert.ok(isGiftPrice(value));
for (const value of [-1, 10000000, 1.5, '0', null, undefined, NaN, Infinity]) assert.ok(!isGiftPrice(value));
console.log('Price boundaries and strict text parsing passed.');
