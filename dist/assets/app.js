import {collection, onSnapshot, updateDoc, doc} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import {db, firebaseConfigured} from './firebase-client.js';

const elements = {
  list: document.querySelector('#gift-list'), loading: document.querySelector('#loading'),
  empty: document.querySelector('#empty-state'), error: document.querySelector('#error-state'),
  retry: document.querySelector('#retry-button'), counter: document.querySelector('#counter'),
  sortControl: document.querySelector('.sort-control'), sortTrigger: document.querySelector('#sort-trigger'),
  sortMenu: document.querySelector('#sort-menu'), sortValue: document.querySelector('#sort-value'),
  sortOptions: [...document.querySelectorAll('[data-sort]')], notice: document.querySelector('#notice'),
  dialog: document.querySelector('#unreserve-dialog'), dialogCopy: document.querySelector('#dialog-copy'),
  confirmUnreserve: document.querySelector('#confirm-unreserve')
};

const state = {gifts: [], filter: 'all', sort: 'desire-desc', expanded: new Set(), pendingUnreserve: null, unsubscribe: null};

function plural(number, forms) {
  const n10 = number % 10;
  const n100 = number % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return forms[1];
  return forms[2];
}

function createdMillis(gift) {
  return gift.createdAt?.toMillis?.() ?? gift.createdAt?.seconds * 1000 ?? 0;
}

function sortedFilteredGifts() {
  const filtered = state.gifts.filter(gift => state.filter === 'all' || gift.status === state.filter);
  return filtered.sort((a, b) => {
    const byCreated = createdMillis(a) - createdMillis(b);
    if (state.sort === 'desire-desc') return b.desireLevel - a.desireLevel || byCreated;
    if (state.sort === 'desire-asc') return a.desireLevel - b.desireLevel || byCreated;
    const aHasPrice = Number.isFinite(a.price);
    const bHasPrice = Number.isFinite(b.price);
    if (aHasPrice !== bHasPrice) return aHasPrice ? -1 : 1;
    if (!aHasPrice) return b.desireLevel - a.desireLevel || byCreated;
    const priceResult = state.sort === 'price-asc' ? a.price - b.price : b.price - a.price;
    return priceResult || byCreated;
  });
}

function desireScale(level) {
  const wrapper = document.createElement('div');
  wrapper.className = 'desire';
  wrapper.setAttribute('aria-label', `Уровень желания: ${level} из 5`);
  wrapper.innerHTML = `<span class="desire-label">Желание · ${level}/5</span><span class="desire-bars" aria-hidden="true">${Array.from({length: 5}, (_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('')}</span>`;
  return wrapper;
}

function appendLinkedText(container, text) {
  const urlPattern = /(https?:\/\/[^\s]+)/g;
  let cursor = 0;
  for (const match of text.matchAll(urlPattern)) {
    container.append(document.createTextNode(text.slice(cursor, match.index)));
    const link = document.createElement('a');
    link.href = match[0];
    link.textContent = match[0];
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.addEventListener('click', event => event.stopPropagation());
    container.append(link);
    cursor = match.index + match[0].length;
  }
  container.append(document.createTextNode(text.slice(cursor)));
}

function giftCard(gift) {
  const hasDescription = Boolean(gift.description?.trim());
  const card = document.createElement('article');
  card.className = `gift-card${hasDescription ? ' has-description' : ''}${gift.status === 'reserved' ? ' is-reserved' : ''}${gift.desireLevel === 5 ? ' is-desire-5' : ''}${state.expanded.has(gift.id) ? ' is-open' : ''}`;
  card.dataset.id = gift.id;
  if (hasDescription) {
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-expanded', String(state.expanded.has(gift.id)));
  }

  const main = document.createElement('div');
  main.className = 'gift-main';
  const titleRow = document.createElement('div');
  titleRow.className = 'gift-title-row';
  const title = document.createElement('h2');
  title.className = 'gift-title';
  title.textContent = gift.title;
  titleRow.append(title);
  if (hasDescription) {
    const chevron = document.createElement('span');
    chevron.className = 'gift-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    titleRow.append(chevron);
  }
  main.append(titleRow);
  if (Number.isFinite(gift.price)) {
    const price = document.createElement('p');
    price.className = 'price';
    price.textContent = `≈ ${new Intl.NumberFormat('ru-RU').format(gift.price)} ₽`;
    main.append(price);
  }

  const side = document.createElement('div');
  side.className = 'gift-side';
  side.append(desireScale(gift.desireLevel));
  const reserve = document.createElement('button');
  reserve.type = 'button';
  reserve.className = `glass-button${gift.status === 'reserved' ? ' glass-button--quiet' : ''}`;
  reserve.textContent = gift.status === 'reserved' ? 'Снять бронь' : 'Забронировать';
  reserve.setAttribute('aria-label', `${reserve.textContent}: ${gift.title}`);
  reserve.addEventListener('click', event => {
    event.stopPropagation();
    if (gift.status === 'reserved') openUnreserveDialog(gift);
    else changeStatus(gift, 'reserved', reserve);
  });
  side.append(reserve);
  card.append(main, side);

  if (hasDescription) {
    const description = document.createElement('div');
    description.className = 'gift-description';
    const inner = document.createElement('div');
    inner.className = 'gift-description__inner';
    appendLinkedText(inner, gift.description);
    description.append(inner);
    card.append(description);
    if (state.expanded.has(gift.id)) requestAnimationFrame(() => description.style.height = `${inner.scrollHeight + 20}px`);
  }

  card.addEventListener('click', event => {
    if (hasDescription && !event.target.closest('button,a')) toggleCard(card, gift.id);
  });
  card.addEventListener('keydown', event => {
    if (hasDescription && !event.target.closest('button,a') && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      toggleCard(card, gift.id);
    }
  });
  return card;
}

function toggleCard(card, id) {
  const description = card.querySelector('.gift-description');
  if (!description) return;
  const open = !state.expanded.has(id);
  if (open) state.expanded.add(id); else state.expanded.delete(id);
  card.classList.toggle('is-open', open);
  card.setAttribute('aria-expanded', String(open));
  description.style.height = open ? `${description.scrollHeight}px` : '0px';
}

function render() {
  const gifts = sortedFilteredGifts();
  elements.loading.hidden = true;
  elements.error.hidden = true;
  elements.counter.innerHTML = `В списке <b>${gifts.length} ${plural(gifts.length, ['подарок', 'подарка', 'подарков'])}</b>`;
  elements.list.replaceChildren(...gifts.map(giftCard));
  elements.list.hidden = gifts.length === 0;
  elements.empty.hidden = gifts.length !== 0;
}

function showNotice(message, isError = false) {
  elements.notice.textContent = message;
  elements.notice.classList.toggle('is-error', isError);
  elements.notice.hidden = false;
  clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(() => elements.notice.hidden = true, 5000);
}

async function changeStatus(gift, status, button) {
  button.disabled = true;
  button.textContent = 'Сохраняем…';
  try {
    await updateDoc(doc(db, 'gifts', gift.id), {status});
    showNotice(status === 'reserved' ? 'Подарок забронирован.' : 'Бронь снята.');
  } catch (error) {
    console.error(error);
    button.disabled = false;
    button.textContent = gift.status === 'reserved' ? 'Снять бронь' : 'Забронировать';
    showNotice('Не удалось сохранить бронь. Попробуйте ещё раз.', true);
  }
}

function openUnreserveDialog(gift) {
  state.pendingUnreserve = gift;
  elements.dialogCopy.textContent = `Подарок «${gift.title}» уже забронирован. Если бронь оформили не вы, нажмите «Отмена».`;
  elements.dialog.showModal();
}

function subscribe() {
  elements.loading.hidden = false;
  elements.error.hidden = true;
  state.unsubscribe?.();
  state.unsubscribe = onSnapshot(collection(db, 'gifts'), snapshot => {
    state.gifts = snapshot.docs.map(item => ({id: item.id, ...item.data()}));
    render();
  }, error => {
    console.error(error);
    elements.loading.hidden = true;
    elements.list.hidden = true;
    elements.empty.hidden = true;
    elements.error.hidden = false;
    elements.counter.textContent = 'Список временно недоступен';
  });
}

document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
  state.filter = button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(item => {
    const active = item === button;
    item.classList.toggle('is-active', active);
    item.setAttribute('aria-pressed', String(active));
  });
  render();
}));

function closeSortMenu({restoreFocus = false} = {}) {
  elements.sortMenu.hidden = true;
  elements.sortControl.classList.remove('is-open');
  elements.sortTrigger.setAttribute('aria-expanded', 'false');
  if (restoreFocus) elements.sortTrigger.focus();
}

function openSortMenu(focusDirection = 0) {
  elements.sortMenu.hidden = false;
  elements.sortControl.classList.add('is-open');
  elements.sortTrigger.setAttribute('aria-expanded', 'true');
  if (focusDirection) {
    const selectedIndex = Math.max(0, elements.sortOptions.findIndex(option => option.classList.contains('is-selected')));
    const nextIndex = (selectedIndex + focusDirection + elements.sortOptions.length) % elements.sortOptions.length;
    elements.sortOptions[nextIndex].focus();
  }
}

function selectSort(option) {
  state.sort = option.dataset.sort;
  elements.sortValue.textContent = option.textContent;
  elements.sortOptions.forEach(item => {
    const selected = item === option;
    item.classList.toggle('is-selected', selected);
    item.setAttribute('aria-selected', String(selected));
  });
  closeSortMenu({restoreFocus: true});
  render();
}

elements.sortTrigger.addEventListener('click', () => {
  if (elements.sortMenu.hidden) openSortMenu(); else closeSortMenu();
});
elements.sortTrigger.addEventListener('keydown', event => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (elements.sortMenu.hidden) openSortMenu(event.key === 'ArrowDown' ? 1 : -1);
  }
});
elements.sortOptions.forEach(option => option.addEventListener('click', () => selectSort(option)));
elements.sortMenu.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeSortMenu({restoreFocus: true});
    return;
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const current = elements.sortOptions.indexOf(document.activeElement);
  let next = event.key === 'Home' ? 0 : event.key === 'End' ? elements.sortOptions.length - 1 : current + (event.key === 'ArrowDown' ? 1 : -1);
  next = (next + elements.sortOptions.length) % elements.sortOptions.length;
  elements.sortOptions[next].focus();
});
document.addEventListener('click', event => {
  if (!elements.sortControl.contains(event.target) && !elements.sortMenu.hidden) closeSortMenu();
});
elements.retry.addEventListener('click', subscribe);
elements.confirmUnreserve.addEventListener('click', event => {
  event.preventDefault();
  const gift = state.pendingUnreserve;
  elements.dialog.close();
  const cardButton = elements.list.querySelector(`[data-id="${CSS.escape(gift.id)}"] .glass-button`);
  changeStatus(gift, 'available', cardButton);
});
elements.dialog.addEventListener('click', event => {if (event.target === elements.dialog) elements.dialog.close();});

if (!firebaseConfigured) {
  elements.loading.hidden = true;
  elements.error.hidden = false;
  elements.error.querySelector('h2').textContent = 'Сайт почти готов к публикации';
  elements.error.querySelector('p:not(.eyebrow)').textContent = 'Подключите бесплатный проект Firebase по инструкции в docs/DEPLOYMENT.md — после этого общий список и бронирования заработают для всех.';
  elements.retry.hidden = true;
  elements.counter.textContent = 'Ожидается подключение базы данных';
} else {
  subscribe();
}
