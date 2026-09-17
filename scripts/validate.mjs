import {readFile, access} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {INITIAL_GIFTS} from '../dist/assets/seed-data.js';
import {GIFT_CATEGORIES} from '../dist/assets/categories.js';

const root = resolve(import.meta.dirname, '..');
const required = [
  'dist/index.html', 'dist/admin/index.html', 'dist/assets/styles.css',
  'dist/assets/app.js', 'dist/assets/admin.js', 'dist/assets/firebase-client.js',
  'dist/assets/firebase-config.js', 'dist/assets/seed-data.js', 'dist/assets/categories.js',
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

const expectedCategories = ['Self Care & Cosmetics', 'Sport', 'Just Pleasure', 'Food', 'Needs'];
if (JSON.stringify(GIFT_CATEGORIES) !== JSON.stringify(expectedCategories)) {
  throw new Error('Фиксированный список категорий изменён или нарушен его порядок.');
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
if (!adminHtml.includes('id="export-csv"') || !adminApp.includes("['Название', 'Описание', 'Уровень желания', 'Цена']") || !adminApp.includes("type: 'text/csv;charset=utf-8'")) {
  throw new Error('Админка должна экспортировать четыре запрошенных столбца в UTF-8 CSV.');
}
if (!publicHtml.includes('<details class="gift-guidance">') || !publicHtml.includes('Что лучше не дарить') || !publicHtml.includes('Natura Siberica')) {
  throw new Error('Не найден статичный раскрываемый блок с нежелательными подарками.');
}
if (!publicHtml.includes('aria-label="Категория подарков"') || !publicHtml.includes('Все категории')) {
  throw new Error('На публичной странице должен быть доступный фильтр категорий.');
}
if (!adminHtml.includes('<label>Категория') || !adminHtml.includes('<option value="">Без категории</option>')) {
  throw new Error('В форме администратора должен быть необязательный выбор категории.');
}
for (const category of expectedCategories) {
  const encodedCategory = category.replace('&', '&amp;');
  if (!publicHtml.includes(`data-category="${encodedCategory}"`) || !adminHtml.includes(`value="${encodedCategory}"`)) {
    throw new Error(`Категория ${category} отсутствует в одном из интерфейсов.`);
  }
}
if (!publicApp.includes("state.category === 'all'") || !publicApp.includes('matchesStatus && matchesCategory')) {
  throw new Error('Категория и статус должны применяться совместно к уже загруженному списку.');
}
if (!publicApp.includes('В этой категории ничего не нашлось по текущим фильтрам. Попробуйте изменить категорию или статус.')) {
  throw new Error('Не найдена подсказка для пустого результата фильтрации.');
}
if (!adminApp.includes('category: normalizeGiftCategory(elements.category.value)') || !adminApp.includes("elements.category.value = normalizeGiftCategory(gift.category) || ''")) {
  throw new Error('Админка должна сохранять, предвыбирать и очищать категорию.');
}
const workflow = await readFile(resolve(root, '.github/workflows/pages.yml'), 'utf8');
if (!workflow.includes('run: npm run check') || workflow.indexOf('run: npm run check') > workflow.indexOf('actions/deploy-pages@')) {
  throw new Error('CI-проверка должна выполняться до публикации GitHub Pages.');
}

const firestoreRules = await readFile(resolve(root, 'firestore.rules'), 'utf8');
if (!firestoreRules.includes('allow delete: if isAdmin();')) {
  throw new Error('Удаление подарка должно проверять администратора без request.resource.data.');
}
if (!firestoreRules.includes("'Self Care & Cosmetics', 'Sport', 'Just Pleasure', 'Food', 'Needs'") || !firestoreRules.includes("hasOnly(['status'])")) {
  throw new Error('Firestore должен валидировать категории и запрещать гостю менять что-либо кроме статуса.');
}

JSON.parse(await readFile(resolve(root, 'firebase.json'), 'utf8'));
JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));

console.log('Validation passed: 57 gifts, five fixed categories, valid local assets and JSON.');
