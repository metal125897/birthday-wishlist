import {onAuthStateChanged, signInWithEmailAndPassword, signOut} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import {collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, writeBatch, serverTimestamp, waitForPendingWrites} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import {auth, db, firebaseConfigured} from './firebase-client.js';
import {INITIAL_GIFTS} from './seed-data.js';

const ADMIN_AUTH_EMAIL = 'admin@birthday-wishlist.local';

const elements = {
  loading: document.querySelector('#admin-loading'), loginView: document.querySelector('#login-view'),
  adminView: document.querySelector('#admin-view'), loginForm: document.querySelector('#login-form'),
  loginError: document.querySelector('#login-error'), logout: document.querySelector('#logout-button'),
  form: document.querySelector('#gift-form'), formTitle: document.querySelector('#form-title'),
  giftId: document.querySelector('#gift-id'), title: document.querySelector('#gift-title'),
  price: document.querySelector('#gift-price'), description: document.querySelector('#gift-description'),
  submit: document.querySelector('#submit-gift'), cancel: document.querySelector('#cancel-edit'),
  gifts: document.querySelector('#admin-gifts'), count: document.querySelector('#admin-count'),
  notice: document.querySelector('#admin-notice'), exportCsv: document.querySelector('#export-csv')
};

const state = {gifts: [], unsubscribe: null, seeded: false};

function desireLevel() {
  return Number(document.querySelector('input[name="desire"]:checked').value);
}

function normalizeForm() {
  const title = elements.title.value.trim();
  const rawPrice = elements.price.value.trim();
  return {
    title,
    description: elements.description.value.trim(),
    desireLevel: desireLevel(),
    price: rawPrice === '' ? null : Number(rawPrice)
  };
}

function validateGift(gift) {
  if (!gift.title || gift.title.length > 120) return 'Введите название длиной до 120 символов.';
  if (gift.description.length > 4000) return 'Описание не должно быть длиннее 4000 символов.';
  if (!Number.isInteger(gift.desireLevel) || gift.desireLevel < 1 || gift.desireLevel > 5) return 'Выберите уровень желания от 1 до 5.';
  if (gift.price !== null && (!Number.isInteger(gift.price) || gift.price < 1 || gift.price > 99999999)) return 'Цена должна быть целым числом от 1 до 99 999 999.';
  return '';
}

function showNotice(message, error = false) {
  elements.notice.textContent = message;
  elements.notice.classList.toggle('is-error', error);
  elements.notice.hidden = false;
  clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(() => elements.notice.hidden = true, 5000);
}

function resetForm() {
  elements.form.reset();
  elements.giftId.value = '';
  elements.formTitle.textContent = 'Новый подарок';
  elements.submit.disabled = false;
  elements.submit.textContent = 'Добавить подарок';
  elements.cancel.hidden = true;
}

function startEdit(gift) {
  elements.giftId.value = gift.id;
  elements.title.value = gift.title;
  elements.price.value = Number.isFinite(gift.price) ? gift.price : '';
  elements.description.value = gift.description || '';
  document.querySelector(`input[name="desire"][value="${gift.desireLevel}"]`).checked = true;
  elements.formTitle.textContent = 'Редактирование подарка';
  elements.submit.disabled = false;
  elements.submit.textContent = 'Сохранить изменения';
  elements.cancel.hidden = false;
  elements.title.focus();
  window.scrollTo({top: 0, behavior: 'smooth'});
}

function metadata(gift) {
  const wrapper = document.createElement('div');
  wrapper.className = 'admin-gift__meta';
  const level = document.createElement('span');
  level.textContent = `Желание ${gift.desireLevel}/5`;
  const price = document.createElement('span');
  price.textContent = Number.isFinite(gift.price) ? `≈ ${new Intl.NumberFormat('ru-RU').format(gift.price)} ₽` : 'без цены';
  const status = document.createElement('span');
  status.className = `status-pill ${gift.status}`;
  status.textContent = gift.status === 'reserved' ? 'Забронировано' : 'Доступно для брони';
  wrapper.append(level, price, status);
  if (gift.description?.trim()) {
    const description = document.createElement('span');
    description.textContent = 'с описанием';
    wrapper.append(description);
  }
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
    confirm.disabled = true;
    confirm.textContent = 'Удаляем…';
    cancel.disabled = true;
    try {
      await deleteDoc(doc(db, 'gifts', gift.id));
      await waitForPendingWrites(db);
      if (elements.giftId.value === gift.id) resetForm();
      showNotice('Подарок удалён.');
    } catch (error) {
      console.error(error);
      confirm.disabled = false;
      confirm.textContent = 'Удалить';
      cancel.disabled = false;
      showNotice('Не удалось удалить подарок.', true);
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
    ['Название', 'Описание', 'Уровень желания', 'Цена'],
    ...gifts.map(gift => [gift.title, gift.description || '', gift.desireLevel, Number.isFinite(gift.price) ? gift.price : null])
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

async function seedInitialGifts() {
  if (state.seeded || state.gifts.length) return;
  state.seeded = true;
  const batch = writeBatch(db);
  const baseTime = Date.UTC(2026, 8, 13, 0, 0, 0);
  INITIAL_GIFTS.forEach((gift, index) => {
    batch.set(doc(db, 'gifts', gift.id), {
      title: gift.title,
      description: gift.description,
      desireLevel: 1,
      price: null,
      status: 'available',
      createdAt: new Date(baseTime + index * 1000)
    });
  });
  try {
    await batch.commit();
    showNotice(`Стартовый список из ${INITIAL_GIFTS.length} подарков добавлен.`);
  } catch (error) {
    state.seeded = false;
    console.error(error);
    showNotice('Не удалось добавить стартовый список. Проверьте правила Firestore.', true);
  }
}

function subscribeToGifts() {
  state.unsubscribe?.();
  state.unsubscribe = onSnapshot(collection(db, 'gifts'), {includeMetadataChanges: true}, async snapshot => {
    if (snapshot.metadata.hasPendingWrites) return;
    state.gifts = snapshot.docs.map(item => ({id: item.id, ...item.data()}));
    render();
    if (snapshot.empty) await seedInitialGifts();
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

elements.logout.addEventListener('click', () => signOut(auth));
elements.exportCsv.addEventListener('click', exportGiftsToCsv);
elements.cancel.addEventListener('click', resetForm);
elements.form.addEventListener('submit', async event => {
  event.preventDefault();
  const gift = normalizeForm();
  const errorMessage = validateGift(gift);
  if (errorMessage) return showNotice(errorMessage, true);
  elements.submit.disabled = true;
  elements.submit.textContent = 'Сохраняем…';
  try {
    if (elements.giftId.value) {
      await updateDoc(doc(db, 'gifts', elements.giftId.value), gift);
      showNotice('Изменения сохранены.');
    } else {
      await addDoc(collection(db, 'gifts'), {...gift, status: 'available', createdAt: serverTimestamp()});
      showNotice('Подарок добавлен в список.');
    }
    resetForm();
  } catch (error) {
    console.error(error);
    elements.submit.disabled = false;
    elements.submit.textContent = elements.giftId.value ? 'Сохранить изменения' : 'Добавить подарок';
    showNotice('Не удалось сохранить подарок.', true);
  }
});

if (!firebaseConfigured) {
  elements.loading.hidden = true;
  elements.loginView.hidden = false;
  elements.loginError.textContent = 'Сначала подключите Firebase по инструкции в docs/DEPLOYMENT.md.';
  elements.loginError.hidden = false;
  elements.loginForm.querySelector('button').disabled = true;
} else {
  onAuthStateChanged(auth, user => {
    elements.loading.hidden = true;
    elements.loginView.hidden = Boolean(user);
    elements.adminView.hidden = !user;
    if (user) subscribeToGifts();
    else {
      state.unsubscribe?.();
      state.unsubscribe = null;
      state.gifts = [];
      elements.exportCsv.disabled = true;
      state.seeded = false;
      elements.loginForm.reset();
      const submit = elements.loginForm.querySelector('button[type="submit"]');
      submit.disabled = false;
      submit.textContent = 'Войти';
    }
  });
}
