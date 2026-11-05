import {onAuthStateChanged, signInWithEmailAndPassword, signOut} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import {collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, setDoc, runTransaction, serverTimestamp, waitForPendingWrites} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import {auth, db, firebaseConfigured} from './firebase-client.js';
import {GIFT_CATEGORIES, giftCategoryLabel, normalizeGiftCategory} from './categories.js?v=20260917-category-labels';
import {DEFAULT_GIFT_GUIDANCE, normalizeGiftGuidance} from './site-content.js?v=20260920-editable-guidance';
import {isGiftPrice, parseGiftPrice} from './gift-price.js';

const ADMIN_AUTH_EMAIL = 'admin@birthday-wishlist.local';
const isAdminUser = user => Boolean(user && user.email === ADMIN_AUTH_EMAIL);
const releaseDialog = document.querySelector('#admin-release-dialog');
let pendingRelease = null;
let releasingId = null;
let saving = false;
function lockForm(locked) {
  saving = locked;
  elements.form.inert = locked;
  elements.gifts.inert = locked;
  elements.logout.disabled = locked;
}

const elements = {
  loading: document.querySelector('#admin-loading'), loginView: document.querySelector('#login-view'),
  adminView: document.querySelector('#admin-view'), loginForm: document.querySelector('#login-form'),
  loginError: document.querySelector('#login-error'), logout: document.querySelector('#logout-button'),
  form: document.querySelector('#gift-form'), formTitle: document.querySelector('#form-title'),
  giftId: document.querySelector('#gift-id'), title: document.querySelector('#gift-title'),
  price: document.querySelector('#gift-price'), category: document.querySelector('#gift-category'),
  categoryControl: document.querySelector('#gift-category-control'), categoryTrigger: document.querySelector('#gift-category-trigger'),
  categoryMenu: document.querySelector('#gift-category-menu'), categoryValue: document.querySelector('#gift-category-value'),
  categoryOptions: [...document.querySelectorAll('[data-admin-category]')],
  description: document.querySelector('#gift-description'),
  reason: document.querySelector('#gift-reason'), reasonCounter: document.querySelector('#reason-counter'),
  surpriseToggle: document.querySelector('#surprise-toggle'),
  submit: document.querySelector('#submit-gift'), cancel: document.querySelector('#cancel-edit'),
  gifts: document.querySelector('#admin-gifts'), count: document.querySelector('#admin-count'),
  notice: document.querySelector('#admin-notice'), exportCsv: document.querySelector('#export-csv'),
  editGuidance: document.querySelector('#edit-guidance'), guidanceDialog: document.querySelector('#guidance-dialog'),
  guidanceForm: document.querySelector('#guidance-form'), guidanceThings: document.querySelector('#guidance-things-input'),
  guidanceBrands: document.querySelector('#guidance-brands-input'), guidanceClose: document.querySelector('#guidance-close'),
  guidanceCancel: document.querySelector('#guidance-cancel'), guidanceSave: document.querySelector('#guidance-save')
};

const state = {
  surprise: true,
  gifts: [], unsubscribe: null, unsubscribeGuidance: null,
  guidance: {...DEFAULT_GIFT_GUIDANCE}
};

function giftDraft() {
  return JSON.stringify([elements.giftId.value, elements.title.value, elements.price.value,
    elements.category.value, elements.description.value, elements.reason.value, desireLevel()]);
}
function guidanceDraft() {
  return JSON.stringify([elements.guidanceThings.value, elements.guidanceBrands.value]);
}
let giftBaseline = giftDraft();
let guidanceBaseline = guidanceDraft();
function hasUnsavedDraft() {
  return giftDraft() !== giftBaseline
    || (elements.guidanceDialog.open && guidanceDraft() !== guidanceBaseline);
}
function allowDiscard() {
  return !hasUnsavedDraft() || window.confirm('Есть несохранённые изменения. Отбросить их?');
}

let descriptionWidth = 0;
function updateReasonCounter() {
  elements.reasonCounter.textContent = `${elements.reason.value.length} / 100`;
}
elements.reason.addEventListener('input', updateReasonCounter);
elements.surpriseToggle.addEventListener('click', () => {
  if (saving) return;
  state.surprise = !state.surprise;
  elements.surpriseToggle.setAttribute('aria-pressed', String(state.surprise));
  elements.surpriseToggle.textContent = state.surprise ? 'Сюрприз: включён · показать брони' : 'Брони видны · скрыть';
  render();
});
function resizeDescription() {
  const field = elements.description;
  if (!field.clientWidth) return;
  descriptionWidth = field.clientWidth;
  field.style.height = 'auto';
  const style = getComputedStyle(field);
  const borderHeight = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
  field.style.height = `${Math.ceil(field.scrollHeight + borderHeight)}px`;
}

elements.description.addEventListener('input', resizeDescription);
window.addEventListener('resize', () => {
  if (elements.description.clientWidth !== descriptionWidth) resizeDescription();
});
document.fonts.ready.then(resizeDescription);

const validPriceText = text => /^[0-9]{0,7}$/.test(text);
let lastPriceValue = '';
let lastPriceCaret = 0;
function rememberPriceInput() {
  if (!validPriceText(elements.price.value)) return;
  lastPriceValue = elements.price.value;
  lastPriceCaret = elements.price.selectionStart ?? lastPriceValue.length;
}
elements.price.addEventListener('focus', rememberPriceInput);
elements.price.addEventListener('beforeinput', event => {
  rememberPriceInput();
  if (!event.inputType.startsWith('insert') || event.data === null) return;
  const field = elements.price;
  const next = field.value.slice(0, field.selectionStart) + event.data + field.value.slice(field.selectionEnd);
  if (!validPriceText(next)) event.preventDefault();
});
elements.price.addEventListener('paste', event => {
  event.preventDefault();
  const field = elements.price;
  const text = event.clipboardData.getData('text').trim();
  const next = field.value.slice(0, field.selectionStart) + text + field.value.slice(field.selectionEnd);
  if (!validPriceText(text) || !validPriceText(next)) return;
  field.setRangeText(text, field.selectionStart, field.selectionEnd, 'end');
  rememberPriceInput();
});
elements.price.addEventListener('input', () => {
  const field = elements.price;
  const text = field.value.trim();
  if (validPriceText(text)) {
    if (field.value !== text) field.value = text;
  }
  else {
    field.value = lastPriceValue;
    field.setSelectionRange(lastPriceCaret, lastPriceCaret);
  }
  rememberPriceInput();
});

function closeGuidanceDialog() {
  if (elements.guidanceSave.disabled) return;
  if (guidanceDraft() !== guidanceBaseline && !window.confirm('Отбросить изменения блока «Что лучше не дарить»?')) return;
  elements.guidanceDialog.close();
}

function openGuidanceDialog() {
  document.querySelector("#guidance-notice").hidden = true;
  elements.guidanceThings.value = state.guidance.things;
  elements.guidanceBrands.value = state.guidance.brands;
  guidanceBaseline = guidanceDraft();
  elements.guidanceDialog.showModal();
  resizeGuidance();
  elements.guidanceThings.focus();
}

function resizeGuidance() {
  for (const field of [elements.guidanceThings, elements.guidanceBrands]) {
    if (!field.clientWidth) continue;
    field.style.height = 'auto';
    const style = getComputedStyle(field);
    field.style.height = `${Math.ceil(field.scrollHeight + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth))}px`;
  }
}
elements.guidanceThings.addEventListener('input', resizeGuidance);
elements.guidanceBrands.addEventListener('input', resizeGuidance);
window.addEventListener('resize', resizeGuidance);

function subscribeToGuidance() {
  state.unsubscribeGuidance?.();
  state.unsubscribeGuidance = onSnapshot(doc(db, 'siteContent', 'giftGuidance'), snapshot => {
    if (!snapshot.metadata.fromCache) elements.editGuidance.disabled = false;
    state.guidance = snapshot.exists() ? normalizeGiftGuidance(snapshot.data()) : {...DEFAULT_GIFT_GUIDANCE};
  }, error => {
    console.error(error);
    elements.editGuidance.disabled = true;
    showNotice('Не удалось загрузить блок «Что лучше не дарить».', true);
  });
}

function closeCategoryMenu({restoreFocus = false} = {}) {
  elements.categoryMenu.hidden = true;
  elements.categoryControl.classList.remove('is-open');
  elements.categoryTrigger.setAttribute('aria-expanded', 'false');
  if (restoreFocus) elements.categoryTrigger.focus();
}

function openCategoryMenu(focusDirection = 0) {
  elements.categoryMenu.hidden = false;
  elements.categoryControl.classList.add('is-open');
  elements.categoryTrigger.setAttribute('aria-expanded', 'true');
  if (focusDirection) {
    const selectedIndex = Math.max(0, elements.categoryOptions.findIndex(option => option.classList.contains('is-selected')));
    const nextIndex = (selectedIndex + focusDirection + elements.categoryOptions.length) % elements.categoryOptions.length;
    elements.categoryOptions[nextIndex].focus();
  }
}

function setCategoryValue(value, {restoreFocus = false} = {}) {
  const normalized = normalizeGiftCategory(value) || '';
  const selectedOption = elements.categoryOptions.find(option => option.dataset.adminCategory === normalized) || elements.categoryOptions[0];
  elements.category.value = normalized;
  elements.categoryValue.textContent = selectedOption.textContent;
  elements.categoryOptions.forEach(option => {
    const selected = option === selectedOption;
    option.classList.toggle('is-selected', selected);
    option.setAttribute('aria-selected', String(selected));
  });
  closeCategoryMenu({restoreFocus});
}

function desireLevel() {
  return Number(document.querySelector('input[name="desire"]:checked').value);
}

function normalizeForm() {
  const title = elements.title.value.trim();
  return {
    title,
    description: elements.description.value.trim(),
    reason: elements.reason.value.trim(),
    desireLevel: desireLevel(),
    price: parseGiftPrice(elements.price.value),
    category: normalizeGiftCategory(elements.category.value)
  };
}

function validateGift(gift) {
  if (!gift.title || gift.title.length > 120) return 'Введите название длиной до 120 символов.';
  if (gift.description.length > 4000) return 'Описание не должно быть длиннее 4000 символов.';
  if (gift.reason.length > 100) return 'Подпись не должна быть длиннее 100 символов.';
  if (!Number.isInteger(gift.desireLevel) || gift.desireLevel < 1 || gift.desireLevel > 5) return 'Выберите уровень желания от 1 до 5.';
  if (gift.price !== null && !isGiftPrice(gift.price)) return 'Цена должна содержать только цифры: от 0 до 9 999 999.';
  if (gift.category !== null && !GIFT_CATEGORIES.includes(gift.category)) return 'Выберите категорию из списка.';
  return '';
}

function showNotice(message, error = false) {
  const target = elements.guidanceDialog.open ? document.querySelector("#guidance-notice") : elements.notice;
  target.textContent = message;
  target.classList.toggle('is-error', error);
  target.hidden = false;
  clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(() => target.hidden = true, 5000);
}

function resetForm() {
  if (saving) return;
  elements.form.reset();
  updateReasonCounter();
  rememberPriceInput();
  resizeDescription();
  setCategoryValue('');
  elements.giftId.value = '';
  elements.formTitle.textContent = 'Новый подарок';
  elements.submit.disabled = false;
  elements.submit.textContent = 'Добавить подарок';
  elements.cancel.hidden = true;
  giftBaseline = giftDraft();
}

function startEdit(gift) {
  if (saving) return;
  if (!allowDiscard()) return;
  elements.giftId.value = gift.id;
  elements.title.value = gift.title;
  elements.price.value = Number.isFinite(gift.price) ? gift.price : '';
  rememberPriceInput();
  setCategoryValue(gift.category);
  elements.description.value = gift.description || '';
  elements.reason.value = gift.reason || '';
  updateReasonCounter();
  resizeDescription();
  document.querySelector(`input[name="desire"][value="${gift.desireLevel}"]`).checked = true;
  elements.formTitle.textContent = 'Редактирование подарка';
  elements.submit.disabled = false;
  elements.submit.textContent = 'Сохранить изменения';
  elements.cancel.hidden = false;
  giftBaseline = giftDraft();
  elements.title.focus();
  window.scrollTo({top: 0, behavior: 'smooth'});
}

function metadata(gift) {
  const wrapper = document.createElement('div');
  wrapper.className = 'admin-gift__meta';
  const facts = document.createElement('div');
  facts.className = 'admin-gift__facts';
  const level = document.createElement('span');
  level.className = 'admin-gift__desire';
  const levelPrefix = document.createElement('span');
  levelPrefix.className = 'admin-gift__desire-prefix';
  levelPrefix.textContent = 'Желание ';
  level.append(levelPrefix, document.createTextNode(`${gift.desireLevel}/5`));
  const price = document.createElement('span');
  price.textContent = Number.isFinite(gift.price) ? `≈ ${new Intl.NumberFormat('ru-RU').format(gift.price)} ₽` : 'без цены';
  facts.append(level, price);
  const category = normalizeGiftCategory(gift.category);
  if (category) {
    const tag = document.createElement('span');
    tag.className = 'category-tag';
    tag.textContent = giftCategoryLabel(category);
    tag.title = tag.textContent;
    facts.append(tag);
  }

  const stateRow = document.createElement('div');
  stateRow.className = 'admin-gift__state';
  if (!state.surprise) {
    const status = document.createElement('span');
    status.className = `status-pill ${gift.status}`;
    status.textContent = gift.status === 'reserved' ? 'Забронировано' : 'Доступно для брони';
    stateRow.append(status);
  }
  if (gift.description?.trim()) {
    const description = document.createElement('span');
    description.className = 'admin-gift__description-tag';
    description.textContent = 'с описанием';
    stateRow.append(description);
  }
  wrapper.append(facts, stateRow);
  return wrapper;
}

function adminGift(gift) {
  const row = document.createElement('article');
  row.className = 'admin-gift';
  const content = document.createElement('div');
  const title = document.createElement('h3');
  title.className = 'admin-gift__title';
  title.textContent = gift.title;
  content.append(title, metadata(gift));

  const actions = document.createElement('div');
  actions.className = 'admin-gift__actions';
  const edit = document.createElement('button');
  edit.className = 'mini-button';
  edit.type = 'button';
  edit.textContent = 'Изменить';
  edit.addEventListener('click', () => startEdit(gift));
  const remove = document.createElement('button');
  remove.className = 'mini-button';
  remove.type = 'button';
  remove.textContent = 'Удалить';
  remove.addEventListener('click', () => showDeleteConfirmation(actions, gift));
  actions.append(edit, remove);
  if (!state.surprise && gift.status === 'reserved') {
    const release = document.createElement('button');
    release.type = 'button';
    release.className = 'mini-button';
    release.textContent = releasingId === gift.id ? 'Снимаем…' : 'Снять бронь';
    release.disabled = releasingId === gift.id;
    release.addEventListener('click', () => {
      if (saving || !isAdminUser(auth.currentUser)) return;
      pendingRelease = gift;
      document.querySelector('#admin-release-copy').textContent = `Снять бронь подарка «${gift.title}»? Он станет доступен всем гостям.`;
      releaseDialog.showModal();
    });
    actions.append(release);
  }
  row.append(content, actions);
  return row;
}

function showDeleteConfirmation(actions, gift) {
  actions.replaceChildren();
  const question = document.createElement('span');
  question.textContent = 'Точно удалить?';
  const confirm = document.createElement('button');
  confirm.className = 'glass-button delete-confirm__button delete-confirm__button--danger';
  confirm.type = 'button';
  confirm.textContent = 'Удалить';
  const cancel = document.createElement('button');
  cancel.className = 'glass-button glass-button--quiet delete-confirm__button';
  cancel.type = 'button';
  cancel.textContent = 'Отмена';
  const group = document.createElement('div');
  group.className = 'delete-confirm';
  group.append(question, confirm, cancel);
  actions.append(group);
  cancel.addEventListener('click', render);
  confirm.addEventListener('click', async () => {
    if (saving) return;
    lockForm(true);
    confirm.disabled = true;
    confirm.textContent = 'Удаляем…';
    cancel.disabled = true;
    try {
      await deleteDoc(doc(db, 'gifts', gift.id));
      await waitForPendingWrites(db);
      lockForm(false);
      if (elements.giftId.value === gift.id) resetForm();
      showNotice('Подарок удалён.');
    } catch (error) {
      console.error(error);
      confirm.disabled = false;
      confirm.textContent = 'Удалить';
      cancel.disabled = false;
      showNotice('Не удалось удалить подарок.', true);
    } finally {
      lockForm(false);
    }
  });
}

function render() {
  const gifts = [...state.gifts].sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));
  elements.count.textContent = String(gifts.length);
  elements.exportCsv.disabled = gifts.length === 0;
  elements.gifts.replaceChildren(...gifts.map(adminGift));
  if (!gifts.length) {
    const empty = document.createElement('p');
    empty.className = 'login-copy';
    empty.textContent = 'Список пока пуст.';
    elements.gifts.append(empty);
  }
}

function csvCell(value) {
  if (value === null || value === undefined) return '""';
  const text = String(value);
  const safeText = typeof value === 'string' && /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

function exportGiftsToCsv() {
  if (!state.gifts.length) return;
  const gifts = [...state.gifts].sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));
  const rows = [
    ['Название', 'Описание', 'Уровень желания', 'Цена', 'Категория'],
    ...gifts.map(gift => [gift.title, gift.description || '', gift.desireLevel, Number.isFinite(gift.price) ? gift.price : null, giftCategoryLabel(gift.category) || ''])
  ];
  const csv = `\uFEFF${rows.map(row => row.map(csvCell).join(';')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'}));
  const link = document.createElement('a');
  const date = new Intl.DateTimeFormat('sv-SE').format(new Date());
  link.href = url;
  link.download = `wishlist-gifts-${date}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  showNotice(`Список из ${gifts.length} подарков скачан.`);
}

function subscribeToGifts() {
  state.unsubscribe?.();
  state.unsubscribe = onSnapshot(collection(db, 'gifts'), {includeMetadataChanges: true}, async snapshot => {
    if (snapshot.metadata.hasPendingWrites) return;
    state.gifts = snapshot.docs.map(item => ({id: item.id, ...item.data()}));
    render();

  }, error => {
    console.error(error);
    showNotice('Не удалось загрузить список. Проверьте Firestore и правила доступа.', true);
  });
}

elements.loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  elements.loginError.hidden = true;
  const submit = elements.loginForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  submit.textContent = 'Входим…';
  try {
    await signInWithEmailAndPassword(auth, ADMIN_AUTH_EMAIL, elements.loginForm.password.value);
  } catch (error) {
    console.error(error);
    elements.loginError.hidden = false;
    submit.disabled = false;
    submit.textContent = 'Войти';
  }
});

elements.logout.addEventListener('click', () => { if (!saving && allowDiscard()) signOut(auth); });
elements.exportCsv.addEventListener('click', exportGiftsToCsv);
elements.editGuidance.addEventListener('click', openGuidanceDialog);
elements.guidanceClose.addEventListener('click', closeGuidanceDialog);
elements.guidanceCancel.addEventListener('click', closeGuidanceDialog);
elements.guidanceDialog.addEventListener('cancel', event => {
  event.preventDefault();
  closeGuidanceDialog();
});
elements.guidanceDialog.addEventListener('click', event => {
  if (event.target === elements.guidanceDialog) closeGuidanceDialog();
});
elements.guidanceForm.addEventListener('submit', async event => {
  event.preventDefault();
  const guidance = normalizeGiftGuidance({
    things: elements.guidanceThings.value,
    brands: elements.guidanceBrands.value
  });
  if (!guidance.things || !guidance.brands) return showNotice('Заполните оба поля.', true);
  elements.guidanceSave.disabled = true;
  elements.guidanceSave.textContent = 'Сохраняем…';
  try {
    await setDoc(doc(db, 'siteContent', 'giftGuidance'), {...guidance, updatedAt: serverTimestamp()});
    await waitForPendingWrites(db);
    state.guidance = guidance;
    guidanceBaseline = guidanceDraft();
    elements.guidanceDialog.close();
    showNotice('Блок «Что лучше не дарить» обновлён.');
  } catch (error) {
    console.error(error);
    showNotice('Не удалось сохранить текст.', true);
  } finally {
    elements.guidanceSave.disabled = false;
    elements.guidanceSave.textContent = 'Сохранить';
  }
});
elements.cancel.addEventListener('click', () => { if (!saving && allowDiscard()) resetForm(); });
elements.categoryTrigger.addEventListener('click', () => {
  if (elements.categoryMenu.hidden) openCategoryMenu();
  else closeCategoryMenu();
});
elements.categoryTrigger.addEventListener('keydown', event => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (elements.categoryMenu.hidden) openCategoryMenu(event.key === 'ArrowDown' ? 1 : -1);
  }
});
elements.categoryOptions.forEach(option => option.addEventListener('click', () => {
  setCategoryValue(option.dataset.adminCategory, {restoreFocus: true});
}));
elements.categoryMenu.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeCategoryMenu({restoreFocus: true});
    return;
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const current = elements.categoryOptions.indexOf(document.activeElement);
  let next = event.key === 'Home' ? 0 : event.key === 'End' ? elements.categoryOptions.length - 1 : current + (event.key === 'ArrowDown' ? 1 : -1);
  next = (next + elements.categoryOptions.length) % elements.categoryOptions.length;
  elements.categoryOptions[next].focus();
});
elements.categoryControl.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeCategoryMenu({restoreFocus: true});
});
elements.categoryControl.addEventListener('focusout', () => queueMicrotask(() => {
  if (!elements.categoryControl.contains(document.activeElement)) closeCategoryMenu();
}));

document.addEventListener('click', event => {
  if (!elements.categoryControl.contains(event.target) && !elements.categoryMenu.hidden) closeCategoryMenu();
});
elements.form.addEventListener('submit', async event => {
  event.preventDefault();
  if (saving) return;
  const gift = normalizeForm();
  const errorMessage = validateGift(gift);
  if (errorMessage) return showNotice(errorMessage, true);
  lockForm(true);
  elements.submit.disabled = true;
  elements.submit.textContent = 'Сохраняем…';
  try {
    if (elements.giftId.value) {
      await updateDoc(doc(db, 'gifts', elements.giftId.value), gift);
      showNotice('Изменения сохранены.');
    } else {
      await addDoc(collection(db, 'gifts'), {...gift, status: 'available', reservedBy: null, createdAt: serverTimestamp()});
      showNotice('Подарок добавлен в список.');
    }
    lockForm(false);
    resetForm();
  } catch (error) {
    console.error(error);
    elements.submit.disabled = false;
    elements.submit.textContent = elements.giftId.value ? 'Сохранить изменения' : 'Добавить подарок';
    showNotice('Не удалось сохранить подарок.', true);
  } finally {
    lockForm(false);
  }
});

window.addEventListener('beforeunload', event => {
  if (!saving && !hasUnsavedDraft() && !elements.guidanceSave.disabled) return;
  event.preventDefault();
  event.returnValue = '';
});

releaseDialog.querySelector('form').addEventListener('submit', async event => {
  event.preventDefault();
  const gift = pendingRelease;
  const confirmed = event.submitter?.value === 'confirm';
  releaseDialog.close();
  pendingRelease = null;
  if (!confirmed || !gift || saving || !isAdminUser(auth.currentUser)) return;
  releasingId = gift.id;
  lockForm(true);
  render();
  try {
    await runTransaction(db, async transaction => {
      const ref = doc(db, 'gifts', gift.id);
      const current = await transaction.get(ref);
      if (!current.exists() || current.data().status !== 'reserved') throw new Error('status-conflict');
      transaction.update(ref, {status: 'available', reservedBy: null});
    });
    await waitForPendingWrites(db);
    showNotice('Бронь снята.');
  } catch (error) {
    console.error(error);
    showNotice('Не удалось снять бронь. Проверьте актуальный статус и повторите.', true);
  } finally {
    releasingId = null;
    lockForm(false);
    render();
  }
});
releaseDialog.addEventListener('close', () => { pendingRelease = null; });

if (!firebaseConfigured) {
  elements.loading.hidden = true;
  elements.loginView.hidden = false;
  elements.loginError.textContent = 'Сначала подключите Firebase по инструкции в docs/DEPLOYMENT.md.';
  elements.loginError.hidden = false;
  elements.loginForm.querySelector('button').disabled = true;
} else {
  onAuthStateChanged(auth, user => {
    elements.loading.hidden = true;
    const admin = isAdminUser(user);
    elements.loginView.hidden = admin;
    elements.adminView.hidden = !admin;
    if (admin) {
      resizeDescription();
      subscribeToGifts();
      subscribeToGuidance();
    }
    else {
      state.unsubscribe?.();
      state.unsubscribeGuidance?.();
      state.unsubscribe = null;
      state.unsubscribeGuidance = null;
      state.gifts = [];
      elements.exportCsv.disabled = true;
      elements.editGuidance.disabled = true;
      state.guidance = {...DEFAULT_GIFT_GUIDANCE};
      elements.loginForm.reset();
      const submit = elements.loginForm.querySelector('button[type="submit"]');
      submit.disabled = false;
      submit.textContent = 'Войти';
    }
  });
}
