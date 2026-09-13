import {readFile, access} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {INITIAL_GIFTS} from '../dist/assets/seed-data.js';

const root = resolve(import.meta.dirname, '..');
const required = [
  'dist/index.html', 'dist/admin/index.html', 'dist/assets/styles.css',
  'dist/assets/app.js', 'dist/assets/admin.js', 'dist/assets/firebase-client.js',
  'dist/assets/firebase-config.js', 'dist/assets/seed-data.js',
  'dist/assets/hero.jpg', 'firestore.rules', 'firebase.json', 'AGENTS.md'
];

for (const path of required) await access(resolve(root, path));

if (INITIAL_GIFTS.length !== 57) throw new Error(`Ожидалось 57 подарков, найдено ${INITIAL_GIFTS.length}.`);
const ids = new Set(INITIAL_GIFTS.map(gift => gift.id));
if (ids.size !== INITIAL_GIFTS.length) throw new Error('ID стартовых подарков должны быть уникальны.');
for (const gift of INITIAL_GIFTS) {
  if (!gift.id || !gift.title?.trim()) throw new Error('У каждого подарка должны быть ID и название.');
  if (gift.title.length > 120) throw new Error(`Слишком длинное название: ${gift.title}`);
  if ((gift.description || '').length > 4000) throw new Error(`Слишком длинное описание: ${gift.title}`);
}

for (const htmlPath of ['dist/index.html', 'dist/admin/index.html']) {
  const absolute = resolve(root, htmlPath);
  const html = await readFile(absolute, 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
  for (const ref of refs) {
    if (/^(?:https?:|data:|#)/.test(ref)) continue;
    await access(resolve(dirname(absolute), ref));
  }
}

const distSources = await Promise.all([
  'dist/index.html', 'dist/admin/index.html', 'dist/assets/app.js',
  'dist/assets/admin.js', 'dist/assets/firebase-client.js', 'dist/assets/seed-data.js'
].map(path => readFile(resolve(root, path), 'utf8')));
if (distSources.some(source => source.includes('localStorage'))) throw new Error('Данные нельзя хранить в localStorage.');

JSON.parse(await readFile(resolve(root, 'firebase.json'), 'utf8'));
JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));

console.log('Validation passed: 57 gifts, unique IDs, valid local assets and JSON.');
