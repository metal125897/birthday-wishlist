import {readFile, access, readdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {INITIAL_GIFTS} from '../dist/assets/seed-data.js';
import {GIFT_CATEGORIES, GIFT_CATEGORY_LABELS, giftCategoryLabel} from '../dist/assets/categories.js';

const root = resolve(import.meta.dirname, '..');
const required = [
  'dist/index.html', 'dist/admin/index.html', 'dist/assets/styles.css',
  'dist/assets/app.js', 'dist/assets/admin.js', 'dist/assets/firebase-client.js',
  'dist/assets/firebase-config.js', 'dist/assets/seed-data.js', 'dist/assets/categories.js',
  'dist/assets/site-content.js', 'data/firestore-snapshot.json',
  'dist/assets/hero.jpg', 'dist/assets/fonts/inter-400-cyrillic.woff2',
  'firestore.rules', 'firebase.json', 'AGENTS.md'
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
const expectedCategoryLabels = {
  'Self Care & Cosmetics': 'Забота о себе',
  Sport: 'Жопу качат',
  'Just Pleasure': 'Дофаминовый всплеск',
  Food: 'Еда',
  Needs: 'Практичное'
};
if (JSON.stringify(GIFT_CATEGORIES) !== JSON.stringify(expectedCategories)) {
  throw new Error('Фиксированный список категорий изменён или нарушен его порядок.');
}
if (JSON.stringify(GIFT_CATEGORY_LABELS) !== JSON.stringify(expectedCategoryLabels) || expectedCategories.some(category => giftCategoryLabel(category) !== expectedCategoryLabels[category])) {
  throw new Error('Русские подписи категорий отсутствуют или не соответствуют стабильным кодам.');
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

const robotsDirective = 'noindex, nofollow, noarchive, noimageindex, nosnippet';
for (const [name, html] of [['публичной страницы', publicHtml], ['админки', adminHtml]]) {
  if (!html.includes(`<meta name="robots" content="${robotsDirective}`)
    || !html.includes(`<meta name="googlebot" content="${robotsDirective}`)
    || !html.includes(`<meta name="bingbot" content="${robotsDirective}`)) {
    throw new Error(`На ${name} отсутствует усиленный запрет индексации.`);
  }
}
if (/href="(?:\.\/)?admin\//.test(publicHtml)) {
  throw new Error('Публичная страница не должна ссылаться на скрытую админку.');
}
const robotsText = await readFile(resolve(root, 'dist/robots.txt'), 'utf8');
if (!/User-agent:\s*\*\s+Disallow:\s*\//i.test(robotsText)) {
  throw new Error('robots.txt должен запрещать обход опубликованной папки.');
}
const fontFiles = (await readdir(resolve(root, 'dist/assets/fonts'))).filter(file => file.endsWith('.woff2'));
if (fontFiles.length !== 1 || fontFiles[0] !== 'inter-400-cyrillic.woff2') {
  throw new Error('В production должен оставаться один общий WOFF2 без дублирующих копий.');
}
if ((styles.match(/inter-400-cyrillic\.woff2/g) || []).length !== 4) {
  throw new Error('Все веса Inter должны переиспользовать один кэшируемый WOFF2-файл.');
}

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
if (!styles.includes('right:calc(-1 * max(32px,(100vw - 1180px)/2))') || !styles.includes('left:54%')) {
  throw new Error('Правая маска hero должна плавно доходить до края viewport.');
}
if (!publicHtml.includes('loading="lazy" decoding="async"')) {
  throw new Error('Декоративные изображения ниже первого экрана должны загружаться лениво.');
}
if (!styles.includes('.gift-card.has-price .desire{grid-column:2;align-items:flex-end}')) {
  throw new Error('Мобильная цена и шкала желания должны оставаться в одной строке.');
}
if (!adminApp.includes('if (snapshot.metadata.hasPendingWrites) return;') || !adminApp.includes('await waitForPendingWrites(db)')) {
  throw new Error('Админка должна ждать подтверждения Firestore перед завершением удаления.');
}
if (!adminApp.includes('snapshot.empty && !snapshot.metadata.fromCache') || !adminApp.includes('await runTransaction(db') || !adminApp.includes('transaction.get(giftRef)')) {
  throw new Error('Стартовое заполнение должно ждать серверный снимок и не перезаписывать существующие документы.');
}
if (!styles.includes('.delete-confirm__button{min-width:100px;min-height:48px')) {
  throw new Error('Кнопки подтверждения удаления должны иметь стандартную высоту.');
}
if (!adminHtml.includes('id="export-csv"') || !adminApp.includes("['Название', 'Описание', 'Уровень желания', 'Цена', 'Категория']") || !adminApp.includes('giftCategoryLabel(gift.category)') || !adminApp.includes("type: 'text/csv;charset=utf-8'")) {
  throw new Error('Админка должна экспортировать пять запрошенных столбцов в UTF-8 CSV, включая категорию.');
}
if (!publicHtml.includes('<details class="gift-guidance">') || !publicHtml.includes('id="guidance-things"') || !publicHtml.includes('id="guidance-brands"') || !publicApp.includes("doc(db, 'siteContent', 'giftGuidance')")) {
  throw new Error('Не найден редактируемый раскрываемый блок с нежелательными подарками.');
}
if (!adminHtml.includes('id="edit-guidance"') || !adminHtml.includes('id="guidance-things-input"') || !adminHtml.includes('id="guidance-brands-input"') || !adminApp.includes("setDoc(doc(db, 'siteContent', 'giftGuidance')")) {
  throw new Error('Админка должна редактировать оба поля блока «Что лучше не дарить».');
}
if (!publicHtml.includes('aria-label="Категория подарков"') || !publicHtml.includes('Все категории')) {
  throw new Error('На публичной странице должен быть доступный фильтр категорий.');
}
if (!adminHtml.includes('id="gift-category-label">Категория</span>') || !adminHtml.includes('<option value="">Без категории</option>')) {
  throw new Error('В форме администратора должен быть необязательный выбор категории.');
}
if (!adminHtml.includes('id="gift-category-trigger"') || !adminHtml.includes('id="gift-category-menu" role="listbox"') || !adminHtml.includes('data-admin-category=""')) {
  throw new Error('Категория в админке должна использовать собственное доступное меню сайта.');
}
for (const category of expectedCategories) {
  const encodedCategory = category.replace('&', '&amp;');
  const label = expectedCategoryLabels[category];
  if (!publicHtml.includes(`data-category="${encodedCategory}">${label}</button>`) || !adminHtml.includes(`value="${encodedCategory}">${label}</option>`)) {
    throw new Error(`Категория ${category} отсутствует в одном из интерфейсов.`);
  }
}
if (!publicApp.includes("state.category === 'all'") || !publicApp.includes('matchesStatus && matchesCategory')) {
  throw new Error('Категория и статус должны применяться совместно к уже загруженному списку.');
}
if (!publicApp.includes('В этой категории ничего не нашлось по текущим фильтрам. Попробуйте изменить категорию или статус.')) {
  throw new Error('Не найдена подсказка для пустого результата фильтрации.');
}
if (!adminApp.includes('category: normalizeGiftCategory(elements.category.value)') || !adminApp.includes('setCategoryValue(gift.category)') || !adminApp.includes("setCategoryValue('')")) {
  throw new Error('Админка должна сохранять, предвыбирать и очищать категорию.');
}
if (!styles.includes('.gift-card:not(.is-open):not(.is-collapsing){height:224px}') || !styles.includes('.gift-card.is-open,.gift-card.is-collapsing{height:auto;min-height:224px}') || !styles.includes('.gift-title{display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:3;font-size:1.125rem;line-height:1.34}') || !styles.includes('.desire{grid-row:2;grid-column:1/-1;align-items:flex-end') || !styles.includes('.admin-gift__desire-prefix{display:none}')) {
  throw new Error('Мобильные карточки должны сохранять одинаковую высоту и компактные двухстрочные метаданные.');
}
if (styles.includes('.gift-card::before{') || !styles.includes('background:rgba(255,255,255,.027);box-shadow:0 24px 72px') || !styles.includes('.gift-card.has-description:not(.is-reserved):hover::after')) {
  throw new Error('У карточек не должно быть постоянного верхнего блика; hover-блик остаётся только при наведении на раскрываемую карточку.');
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
if (!firestoreRules.includes('match /siteContent/giftGuidance') || !firestoreRules.includes('allow create, update: if isAdmin() && isValidGiftGuidance')) {
  throw new Error('Firestore должен разрешать редактирование блока только администратору.');
}

const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
if (!packageJson.scripts?.['snapshot:data'] || !packageJson.scripts?.['snapshot:validate'] || !packageJson.scripts.check.includes('snapshot:validate')) {
  throw new Error('Снимок Firestore должен создаваться отдельной командой и проверяться CI.');
}

JSON.parse(await readFile(resolve(root, 'firebase.json'), 'utf8'));

console.log('Validation passed: 57 gifts, five fixed categories, valid local assets and JSON.');
