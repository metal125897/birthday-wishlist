import {collection, onSnapshot, updateDoc, doc, waitForPendingWrites} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import {db, firebaseConfigured} from './firebase-client.js';
import {giftCategoryLabel, normalizeGiftCategory} from './categories.js?v=20260917-category-labels';
import {normalizeGiftGuidance} from './site-content.js?v=20260920-editable-guidance';

const elements = {
  list: document.querySelector('#gift-list'), loading: document.querySelector('#loading'),
  empty: document.querySelector('#empty-state'), error: document.querySelector('#error-state'),
  emptyCopy: document.querySelector('#empty-copy'),
  retry: document.querySelector('#retry-button'), counter: document.querySelector('#counter'),
  categoryControl: document.querySelector('#category-control'), categoryTrigger: document.querySelector('#category-trigger'),
  categoryMenu: document.querySelector('#category-menu'), categoryValue: document.querySelector('#category-value'),
  categoryOptions: [...document.querySelectorAll('[data-category]')],
  sortControl: document.querySelector('#sort-control'), sortTrigger: document.querySelector('#sort-trigger'),
  sortMenu: document.querySelector('#sort-menu'), sortValue: document.querySelector('#sort-value'),
  sortOptions: [...document.querySelectorAll('[data-sort]')], notice: document.querySelector('#notice'),
  dialog: document.querySelector('#unreserve-dialog'), dialogCopy: document.querySelector('#dialog-copy'),
  confirmUnreserve: document.querySelector('#confirm-unreserve'),
  guidanceThings: document.querySelector('#guidance-things'), guidanceBrands: document.querySelector('#guidance-brands')
};

const state = {
  gifts: [], filter: 'all', category: 'all', sort: 'desire-desc', expanded: new Set(), pendingUnreserve: null,
  unsubscribe: null, unsubscribeGuidance: null, pendingStatusIds: new Set(), confirmedStatuses: new Map()
};

function subscribeToGuidance() {
  state.unsubscribeGuidance?.();
  state.unsubscribeGuidance = onSnapshot(doc(db, 'siteContent', 'giftGuidance'), snapshot => {
    if (!snapshot.exists()) return;
    const guidance = normalizeGiftGuidance(snapshot.data());
    elements.guidanceThings.textContent = guidance.things;
    elements.guidanceBrands.textContent = guidance.brands;
  }, error => console.error('Не удалось загрузить подсказки о подарках.', error));
}

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
  const filtered = state.gifts.filter(gift => {
    const matchesStatus = state.filter === 'all' || gift.status === state.filter;
    const matchesCategory = state.category === 'all' || normalizeGiftCategory(gift.category) === state.category;
    return matchesStatus && matchesCategory;
  });
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

function desireScale(level, category) {
  const wrapper = document.createElement('div');
  wrapper.className = 'desire';
  wrapper.setAttribute('aria-label', `Уровень желания: ${level} из 5`);
  const label = document.createElement('span');
  label.className = 'desire-label';
  const validCategory = normalizeGiftCategory(category);
  if (validCategory) {
    const tag = document.createElement('span');
    tag.className = 'category-tag';
    tag.textContent = giftCategoryLabel(validCategory);
    label.append(tag);
  }
  const desireCopy = document.createElement('span');
  desireCopy.className = 'desire-copy';
  desireCopy.textContent = `Желание · ${level}/5`;
  label.append(desireCopy);
  const bars = document.createElement('span');
  bars.className = 'desire-bars';
  bars.setAttribute('aria-hidden', 'true');
  bars.innerHTML = Array.from({length: 5}, (_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('');
  wrapper.append(label, bars);
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
  const hasPrice = Number.isFinite(gift.price);
  const statusPending = state.pendingStatusIds.has(gift.id);
  const card = document.createElement('article');
  card.className = `gift-card${hasDescription ? ' has-description' : ''}${hasPrice ? ' has-price' : ''}${gift.status === 'reserved' ? ' is-reserved' : ''}${gift.desireLevel === 5 ? ' is-desire-5' : ''}${state.expanded.has(gift.id) ? ' is-open' : ''}${statusPending ? ' is-saving' : ''}`;
  card.dataset.id = gift.id;
  if (statusPending) card.setAttribute('aria-busy', 'true');
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
  if (hasPrice) {
    const price = document.createElement('p');
    price.className = 'price';
    price.textContent = `≈ ${new Intl.NumberFormat('ru-RU').format(gift.price)} ₽`;
    main.append(price);
  }

  const side = document.createElement('div');
  side.className = 'gift-side';
  side.append(desireScale(gift.desireLevel, gift.category));
  const reserve = document.createElement('button');
  reserve.type = 'button';
  reserve.className = `glass-button${gift.status === 'reserved' ? ' glass-button--quiet' : ''}`;
  reserve.textContent = statusPending ? 'Сохраняем…' : gift.status === 'reserved' ? 'Снять бронь' : 'Забронировать';
  reserve.disabled = statusPending;
  reserve.setAttribute('aria-label', `${reserve.textContent}: ${gift.title}`);
  reserve.addEventListener('click', event => {
    event.stopPropagation();
    if (gift.status === 'reserved') openUnreserveDialog(gift);
    else changeStatus(gift, 'reserved');
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
    if (state.expanded.has(gift.id)) description.style.height = 'auto';
    description.addEventListener('transitionend', event => {
      if (event.propertyName !== 'height') return;
      if (card.classList.contains('is-open')) description.style.height = 'auto';
      else card.classList.remove('is-collapsing');
    });
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
  const currentHeight = description.getBoundingClientRect().height;
  description.style.height = `${currentHeight}px`;
  void description.offsetHeight;
  if (open) state.expanded.add(id); else state.expanded.delete(id);
  card.classList.toggle('is-collapsing', !open);
  card.classList.toggle('is-open', open);
  card.setAttribute('aria-expanded', String(open));
  description.style.height = open ? `${description.scrollHeight}px` : '0px';
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    if (open) description.style.height = 'auto';
    else card.classList.remove('is-collapsing');
  }
}

function render() {
  const gifts = sortedFilteredGifts();
  elements.loading.hidden = true;
  elements.error.hidden = true;
  elements.counter.innerHTML = `В списке <b>${gifts.length} ${plural(gifts.length, ['подарок', 'подарка', 'подарков'])}</b>`;
  elements.list.replaceChildren(...gifts.map(giftCard));
  elements.list.hidden = gifts.length === 0;
  elements.empty.hidden = gifts.length !== 0;
  elements.emptyCopy.textContent = state.gifts.length
    ? 'В этой категории ничего не нашлось по текущим фильтрам. Попробуйте изменить категорию или статус.'
    : 'Список ещё наполняется. Загляните чуть позже.';
}

function showNotice(message, isError = false) {
  elements.notice.textContent = message;
  elements.notice.classList.toggle('is-error', isError);
  elements.notice.hidden = false;
  clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(() => elements.notice.hidden = true, 5000);
}

async function changeStatus(gift, status) {
  if (state.pendingStatusIds.has(gift.id)) return;
  const previousStatus = gift.status;
  state.pendingStatusIds.add(gift.id);
  render();
  try {
    await updateDoc(doc(db, 'gifts', gift.id), {status});
    await waitForPendingWrites(db);
    state.confirmedStatuses.set(gift.id, status);
    state.gifts = state.gifts.map(item => item.id === gift.id ? {...item, status} : item);
    state.pendingStatusIds.delete(gift.id);
    render();
    showNotice(status === 'reserved' ? 'Подарок забронирован.' : 'Бронь снята.');
  } catch (error) {
    console.error(error);
    state.confirmedStatuses.set(gift.id, previousStatus);
    state.gifts = state.gifts.map(item => item.id === gift.id ? {...item, status: previousStatus} : item);
    state.pendingStatusIds.delete(gift.id);
    render();
    showNotice('Не удалось сохранить бронь. Попробуйте ещё раз.', true);
  }
}

function openUnreserveDialog(gift) {
  state.pendingUnreserve = gift;
  elements.dialogCopy.textContent = `Подарок «${gift.title}» уже забронирован. Если бронь оформили не вы, нажмите «Отмена».`;
  elements.dialog.showModal();
}

function closeUnreserveDialog(onClosed) {
  if (!elements.dialog.open || elements.dialog.classList.contains('is-closing')) return;
  const finish = () => {
    elements.dialog.close();
    elements.dialog.classList.remove('is-closing');
    state.pendingUnreserve = null;
    onClosed?.();
  };
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
  else {
    elements.dialog.classList.add('is-closing');
    window.setTimeout(finish, 180);
  }
}

function subscribe() {
  elements.loading.hidden = false;
  elements.error.hidden = true;
  state.unsubscribe?.();
  state.unsubscribe = onSnapshot(collection(db, 'gifts'), {includeMetadataChanges: true}, snapshot => {
    const currentIds = new Set(snapshot.docs.map(item => item.id));
    for (const id of state.confirmedStatuses.keys()) {
      if (!currentIds.has(id)) state.confirmedStatuses.delete(id);
    }
    state.gifts = snapshot.docs.map(item => {
      const gift = {id: item.id, ...item.data()};
      if (!item.metadata.hasPendingWrites) state.confirmedStatuses.set(item.id, gift.status);
      return {...gift, status: state.confirmedStatuses.get(item.id) ?? gift.status};
    });
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

function setupListbox({control, trigger, menu, options, value, dataKey, onChange}) {
  function close({restoreFocus = false} = {}) {
    menu.hidden = true;
    control.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus();
  }

  function open(focusDirection = 0) {
    menu.hidden = false;
    control.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    elements.list.classList.add('suppress-hover');
    if (focusDirection) {
      const selectedIndex = Math.max(0, options.findIndex(option => option.classList.contains('is-selected')));
      const nextIndex = (selectedIndex + focusDirection + options.length) % options.length;
      options[nextIndex].focus();
    }
  }

  function select(option) {
    value.textContent = option.textContent;
    options.forEach(item => {
      const selected = item === option;
      item.classList.toggle('is-selected', selected);
      item.setAttribute('aria-selected', String(selected));
    });
    onChange(option.dataset[dataKey]);
    close({restoreFocus: true});
    elements.list.classList.add('suppress-hover');
    render();
  }

  trigger.addEventListener('click', () => { if (menu.hidden) open(); else close(); });
  trigger.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (menu.hidden) open(event.key === 'ArrowDown' ? 1 : -1);
    }
  });
  options.forEach(option => option.addEventListener('click', () => select(option)));
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close({restoreFocus: true});
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = options.indexOf(document.activeElement);
    let next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : current + (event.key === 'ArrowDown' ? 1 : -1);
    next = (next + options.length) % options.length;
    options[next].focus();
  });
  document.addEventListener('click', event => {
    if (!control.contains(event.target) && !menu.hidden) close();
  });
  return {close};
}

elements.list.addEventListener('pointermove', event => {
  if (event.pointerType === 'mouse' && elements.categoryMenu.hidden && elements.sortMenu.hidden) {
    elements.list.classList.remove('suppress-hover');
  }
});

const categoryListbox = setupListbox({
  control: elements.categoryControl,
  trigger: elements.categoryTrigger,
  menu: elements.categoryMenu,
  options: elements.categoryOptions,
  value: elements.categoryValue,
  dataKey: 'category',
  onChange: category => { state.category = category; }
});

const sortListbox = setupListbox({
  control: elements.sortControl,
  trigger: elements.sortTrigger,
  menu: elements.sortMenu,
  options: elements.sortOptions,
  value: elements.sortValue,
  dataKey: 'sort',
  onChange: sort => { state.sort = sort; }
});

elements.categoryTrigger.addEventListener('click', () => sortListbox.close());
elements.sortTrigger.addEventListener('click', () => categoryListbox.close());
elements.retry.addEventListener('click', subscribe);
elements.dialog.querySelector('form').addEventListener('submit', event => {
  event.preventDefault();
  if (event.submitter === elements.confirmUnreserve) {
    const gift = state.pendingUnreserve;
    closeUnreserveDialog(() => changeStatus(gift, 'available'));
  } else closeUnreserveDialog();
});
elements.dialog.addEventListener('cancel', event => {
  event.preventDefault();
  closeUnreserveDialog();
});
elements.dialog.addEventListener('click', event => {
  if (event.target === elements.dialog) closeUnreserveDialog();
});
window.addEventListener('beforeunload', event => {
  if (!state.pendingStatusIds.size) return;
  event.preventDefault();
  event.returnValue = '';
});

if (!firebaseConfigured) {
  elements.loading.hidden = true;
  elements.error.hidden = false;
  elements.error.querySelector('h2').textContent = 'Сайт почти готов к публикации';
  elements.error.querySelector('p:not(.eyebrow)').textContent = 'Подключите бесплатный проект Firebase по инструкции в docs/DEPLOYMENT.md — после этого общий список и бронирования заработают для всех.';
  elements.retry.hidden = true;
  elements.counter.textContent = 'Ожидается подключение базы данных';
} else {
  subscribe();
  subscribeToGuidance();
}
