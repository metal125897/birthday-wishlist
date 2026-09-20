import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {GIFT_CATEGORIES} from '../dist/assets/categories.js';

const root = resolve(import.meta.dirname, '..');
const snapshot = JSON.parse(await readFile(resolve(root, 'data/firestore-snapshot.json'), 'utf8'));
if (snapshot.schemaVersion !== 1 || snapshot.projectId !== 'wishlist-b3953') throw new Error('Неизвестный формат снимка Firestore.');
if (!Array.isArray(snapshot.gifts) || !snapshot.gifts.length) throw new Error('Снимок Firestore не содержит подарков.');
if (new Set(snapshot.gifts.map(gift => gift.id)).size !== snapshot.gifts.length) throw new Error('В снимке Firestore повторяются ID подарков.');
for (const gift of snapshot.gifts) {
  if (!gift.id || !gift.title?.trim()) throw new Error('В снимке найден подарок без ID или названия.');
  if (!Number.isInteger(gift.desireLevel) || gift.desireLevel < 1 || gift.desireLevel > 5) throw new Error(`Некорректное желание у ${gift.title}.`);
  if (!['available', 'reserved'].includes(gift.status)) throw new Error(`Некорректный статус у ${gift.title}.`);
  if (gift.category != null && !GIFT_CATEGORIES.includes(gift.category)) throw new Error(`Некорректная категория у ${gift.title}.`);
}
if (!snapshot.giftGuidance?.things?.trim() || !snapshot.giftGuidance?.brands?.trim()) throw new Error('Снимок не содержит оба текста блока «Что лучше не дарить».');
console.log(`Data snapshot valid: ${snapshot.gifts.length} gifts.`);
