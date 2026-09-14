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
    const localPath = ref.split(/[?#]/, 1)[0];
    await access(resolve(dirname(absolute), localPath));
  }
}

const distSources = await Promise.all([
  'dist/index.html', 'dist/admin/index.html', 'dist/assets/app.js',
  'dist/assets/admin.js', 'dist/assets/firebase-client.js', 'dist/assets/seed-data.js'
].map(path => readFile(resolve(root, path), 'utf8')));
if (distSources.some(source => source.includes('localStorage'))) throw new Error('Данные нельзя хранить в localStorage.');

const publicHtml = distSources[0];
const adminHtml = distSources[1];
const publicApp = distSources[2];
const adminApp = distSources[3];
const styles = await readFile(resolve(root, 'dist/assets/styles.css'), 'utf8');

const writeIndex = publicApp.indexOf("await updateDoc(doc(db, 'gifts', gift.id), {status})");
const acknowledgementIndex = publicApp.indexOf('await waitForPendingWrites(db)', writeIndex);
const successIndex = publicApp.indexOf("showNotice(status === 'reserved'", acknowledgementIndex);
if (writeIndex < 0 || acknowledgementIndex < writeIndex || successIndex < acknowledgementIndex) {
  throw new Error('Успех бронирования можно показывать только после подтверждения Firestore.');
}
if (!publicApp.includes("window.addEventListener('beforeunload'") || !publicApp.includes('pendingStatusIds')) {
  throw new Error('Во время незавершённой брони должна действовать защита от тихого ухода со страницы.');
}
const resetFormSource = adminApp.slice(adminApp.indexOf('function resetForm()'), adminApp.indexOf('function startEdit'));
if (!resetFormSource.includes('elements.submit.disabled = false')) {
  throw new Error('После сохранения форма администратора должна снова разблокировать submit-кнопку.');
}
if (adminHtml.includes('aria-hidden="true">*</span>')) throw new Error('Лишняя звёздочка у названия подарка не должна возвращаться.');
if (!publicHtml.includes('Цены примерные. Стрелка у названия раскрывает комментарии')) {
  throw new Error('Не найден актуальный текст подсказки в hero-зоне.');
}
if (!styles.includes('.gift-card.has-price .desire{grid-column:2;align-items:flex-end}')) {
  throw new Error('Мобильная цена и шкала желания должны оставаться в одной строке.');
}
if (!adminApp.includes('if (snapshot.metadata.hasPendingWrites) return;') || !adminApp.includes('await waitForPendingWrites(db)')) {
  throw new Error('Админка должна ждать подтверждения Firestore перед завершением удаления.');
}
if (!styles.includes('.delete-confirm__button{min-width:100px;min-height:48px')) {
  throw new Error('Кнопки подтверждения удаления должны иметь стандартную высоту.');
}

const firestoreRules = await readFile(resolve(root, 'firestore.rules'), 'utf8');
if (!firestoreRules.includes('allow delete: if isAdmin();')) {
  throw new Error('Удаление подарка должно проверять администратора без request.resource.data.');
}

JSON.parse(await readFile(resolve(root, 'firebase.json'), 'utf8'));
JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));

console.log('Validation passed: 57 gifts, unique IDs, valid local assets and JSON.');
