import {collection, onSnapshot, runTransaction, doc, waitForPendingWrites} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import {db, firebaseConfigured, ensureGuest, watchGuest} from './guest-client.js?v=20261104-owners';
import {reservationUpdate, ownsReservation} from './reservation-policy.js?v=20261104-owners';
import {giftCategoryLabel, normalizeGiftCategory} from './categories.js?v=20260917-category-labels';
import {normalizeGiftGuidance} from './site-content.js?v=20260920-editable-guidance';
import {isGiftPrice} from './gift-price.js';
import {readBookmarks, writeBookmarks, bookmarkStorageKey} from './bookmarks.js';

let bookmarkStorage;
try { bookmarkStorage = window.localStorage; } catch { /* Bookmarks still work for this page. */ }

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
  mode: 'catalog', bookmarks: readBookmarks(bookmarkStorage),
  guestUid: null,
  gifts: [], filter: 'all', category: 'all', sort: 'desire-desc', expanded: new Set(), pendingUnreserve: null,
  unsubscribe: null, unsubscribeGuidance: null, pendingStatusIds: new Set(), confirmedStatuses: new Map()
};
let bookmarkGradientSequence = 0;

function setupGuidanceAnimation() {
  const details = document.querySelector('.gift-guidance');
  const summary = details.querySelector('summary');
  const content = details.querySelector('.gift-guidance__content');
  let expanded = details.open;
  let heightAnimation;
  let fadeAnimation;
  summary.addEventListener('click', event => {
    event.preventDefault();
    const startHeight = details.getBoundingClientRect().height;
    const startOpacity = details.open ? getComputedStyle(content).opacity : '0';
    expanded = !expanded;
    heightAnimation?.cancel();
    fadeAnimation?.cancel();
    details.classList.toggle('is-closing', !expanded);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !details.animate) {
      details.open = expanded;
      details.classList.remove('is-closing');
      return;
    }
    details.open = true;
    const style = getComputedStyle(details);
    const borderHeight = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const endHeight = expanded ? details.getBoundingClientRect().height : summary.getBoundingClientRect().height + borderHeight;
    heightAnimation = details.animate([{height: `${startHeight}px`}, {height: `${endHeight}px`}], {duration: 280, easing: 'ease'});
    fadeAnimation = content.animate([{opacity: startOpacity}, {opacity: expanded ? 1 : 0}], {duration: 220, easing: 'ease', fill: 'both'});
    heightAnimation.onfinish = () => {
      details.open = expanded;
      details.classList.remove('is-closing');
      fadeAnimation.cancel();
      heightAnimation = fadeAnimation = null;
    };
  });
}

setupGuidanceAnimation();

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
    if (state.mode === 'saved') return state.bookmarks.has(gift.id);
    const matchesStatus = state.filter === 'all' || gift.status === state.filter;
    const matchesCategory = state.category === 'all' || normalizeGiftCategory(gift.category) === state.category;
    return matchesStatus && matchesCategory;
  });
  return filtered.sort((a, b) => {
    const byCreated = createdMillis(a) - createdMillis(b);
    if (state.mode === 'saved') return b.desireLevel - a.desireLevel || byCreated;
    if (state.sort === 'desire-desc') return b.desireLevel - a.desireLevel || byCreated;
    if (state.sort === 'desire-asc') return a.desireLevel - b.desireLevel || byCreated;
    const aHasPrice = isGiftPrice(a.price);
    const bHasPrice = isGiftPrice(b.price);
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

function updateBookmarkButton(button, id) {
  const selected = state.bookmarks.has(id);
  button.classList.toggle('glass-button--quiet', selected);
  button.setAttribute('aria-pressed', String(selected));
  button.setAttribute('aria-label', selected ? 'Убрать из отложенных' : 'Отложить подарок');
}

function refreshBookmarks() {
  if (!elements.loading.hidden || !elements.error.hidden) return;
  const gifts = sortedFilteredGifts();
  const cards = [...elements.list.querySelectorAll('.gift-card')];
  const focused = document.activeElement?.closest('.gift-card');
  const focusedIndex = cards.indexOf(focused);
  cards.forEach(card => updateBookmarkButton(card.querySelector('.bookmark-button'), card.dataset.id));
  if (state.mode === 'saved') {
    const byId = new Map(cards.map(card => [card.dataset.id, card]));
    const wanted = new Set(gifts.map(gift => gift.id));
    cards.filter(card => !wanted.has(card.dataset.id)).forEach(card => card.remove());
    // Reuse existing nodes so hover, focus and description animations stay intact.
    gifts.forEach((gift, index) => {
      const card = byId.get(gift.id) || giftCard(gift);
      const current = elements.list.children[index];
      if (card !== current) elements.list.insertBefore(card, current || null);
    });
  }
  updateListSummary(gifts);
  if (focused && !focused.isConnected) {
    const remaining = [...elements.list.querySelectorAll('.gift-card')];
    const next = remaining[Math.min(focusedIndex, remaining.length - 1)]?.querySelector('.bookmark-button');
    (next || document.querySelector('[data-mode="saved"]')).focus({preventScroll: true});
  }
}

function giftCard(gift) {
  const hasDescription = Boolean(gift.description?.trim());
  const hasPrice = isGiftPrice(gift.price);
  const statusPending = state.pendingStatusIds.has(gift.id);
  const card = document.createElement('article');
  card.className = `gift-card${hasDescription ? ' has-description' : ''}${hasPrice ? ' has-price' : ''}${gift.status === 'reserved' ? ' is-reserved' : ''}${gift.desireLevel === 5 ? ' is-desire-5' : ''}${state.expanded.has(gift.id) ? ' is-open' : ''}${statusPending ? ' is-saving' : ''}`;
  card.dataset.id = gift.id;
  const reasonText = typeof gift.reason === 'string' ? gift.reason.trim() : '';
  card.classList.toggle('has-reason', Boolean(reasonText));
  if (statusPending) card.setAttribute('aria-busy', 'true');
  if (hasDescription) {
    card.setAttribute('aria-expanded', String(state.expanded.has(gift.id)));
  }

  const main = document.createElement('div');
  main.className = 'gift-main';
  const titleRow = document.createElement('div');
  titleRow.className = 'gift-title-row';
  const bookmark = document.createElement('button');
  bookmark.type = 'button';
  bookmark.className = 'bookmark-button';
  updateBookmarkButton(bookmark, gift.id);
  const gradientId = `bookmark-gold-${++bookmarkGradientSequence}`;
  bookmark.style.setProperty('--bookmark-fill', `url(#${gradientId})`);
  bookmark.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%"><stop stop-color="#b99a5a"/><stop offset=".45" stop-color="#f0dba4"/><stop offset=".75" stop-color="#c9ac6b"/><stop offset="1" stop-color="#9a7c43"/></linearGradient></defs><path class="bookmark-mark" d="M6 4h12v17l-6-4-6 4z"/></svg>`;
  bookmark.addEventListener('click', event => {
    event.stopPropagation();
    if (state.bookmarks.has(gift.id)) state.bookmarks.delete(gift.id); else state.bookmarks.add(gift.id);
    if (!writeBookmarks(bookmarkStorage, state.bookmarks)) showNotice('Изменение действует до закрытия страницы. Браузер не разрешает сохранить закладки.', true);
    refreshBookmarks();
  });
  const title = document.createElement('h2');
  title.className = 'gift-title';
  title.textContent = gift.title;
  if (hasDescription) {
    const toggle = document.createElement('button');
    toggle.className = 'gift-title-toggle';
    toggle.type = 'button';
    toggle.textContent = gift.title;
    toggle.setAttribute('aria-expanded', String(state.expanded.has(gift.id)));
    toggle.setAttribute('aria-controls', 'description-' + gift.id);
    toggle.addEventListener('click', event => { event.stopPropagation(); toggleCard(card, gift.id); });
    title.replaceChildren(toggle);
  }
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
  const owned = ownsReservation(gift, state.guestUid);
  reserve.textContent = statusPending ? 'Сохраняем…' : gift.status === 'reserved' ? (owned ? 'Ваша бронь · снять' : 'Забронировано') : 'Забронировать';
  reserve.disabled = statusPending || (gift.status === 'reserved' && !owned);
  if (owned) reserve.title = 'Ваша бронь. Доступ к ней сохранён в этом браузере. После очистки данных сайта обратитесь к владельцу списка.';
  reserve.setAttribute('aria-label', `${reserve.textContent}: ${gift.title}`);
  reserve.addEventListener('click', event => {
    event.stopPropagation();
    if (gift.status === 'reserved') openUnreserveDialog(gift);
    else changeStatus(gift, 'reserved');
  });
  const actions = document.createElement('div');
  actions.className = 'gift-actions';
  actions.append(reserve, bookmark);
  side.append(actions);
  card.append(main, side);
  if (reasonText) {
    const reason = document.createElement('p');
    reason.className = 'gift-reason';
    reason.textContent = reasonText;
    main.append(reason);
  }

  if (hasDescription) {
    const description = document.createElement('div');
    description.className = 'gift-description';
    description.id = 'description-' + gift.id;
    description.inert = !state.expanded.has(gift.id);
    description.setAttribute('aria-hidden', String(!state.expanded.has(gift.id)));
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
  card.querySelector('.gift-title-toggle').setAttribute('aria-expanded', String(open));
  description.inert = !open;
  description.setAttribute('aria-hidden', String(!open));
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
  const focusedCard = document.activeElement?.closest('.gift-card');
  const focusedId = focusedCard?.dataset.id;
  const wasReserve = document.activeElement?.classList.contains('glass-button');
  const wasBookmark = document.activeElement?.classList.contains('bookmark-button');
  const featured = state.mode === 'catalog' && state.sort === 'desire-desc' ? gifts.filter(gift => gift.desireLevel === 5) : [];
  const nodes = [];
  if (featured.length) {
    const group = document.createElement('section');
    group.className = 'featured-gifts';
    group.setAttribute('aria-labelledby', 'featured-title');
    const heading = document.createElement('header');
    heading.className = 'featured-heading';
    heading.innerHTML = '<h2 id="featured-title">Особенно хочется</h2><p>То, чему я буду особенно рад</p>';
    const ending = document.createElement('div');
    ending.className = 'featured-ending';
    ending.setAttribute('aria-hidden', 'true');
    ending.innerHTML = '<svg viewBox="0 0 24 24"><path d="m12 1 3 8 8 3-8 3-3 8-3-8-8-3 8-3z"/></svg>';
    group.append(heading, ...featured.map(giftCard), ending);
    nodes.push(group);
  }
  nodes.push(...gifts.filter(gift => !featured.length || gift.desireLevel !== 5).map(giftCard));
  elements.list.replaceChildren(...nodes);
  if (focusedId) {
    const card = [...elements.list.querySelectorAll('.gift-card')].find(item => item.dataset.id === focusedId);
    const target = card?.querySelector(wasBookmark ? '.bookmark-button' : wasReserve ? '.glass-button' : '.gift-title-toggle');
    (target || document.querySelector(`[data-mode="${state.mode}"]`)).focus({preventScroll: true});
  }
  updateListSummary(gifts);
}

function updateListSummary(gifts) {
  elements.counter.innerHTML = `В списке <b>${gifts.length} ${plural(gifts.length, ['подарок', 'подарка', 'подарков'])}</b>`;
  document.querySelector('#saved-counter').textContent = `Отложено: ${gifts.length} ${plural(gifts.length, ['подарок', 'подарка', 'подарков'])}`;
  elements.list.hidden = gifts.length === 0;
  elements.empty.hidden = gifts.length !== 0;
  elements.empty.querySelector('h2').textContent = state.mode === 'saved' ? 'Пока нет отложенных подарков' : 'Пока нет подарков';
  elements.emptyCopy.textContent = state.mode === 'saved' ? 'Нажмите на закладку у понравившегося подарка, чтобы вернуться к нему позже.' : state.gifts.length
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
    const user = await ensureGuest();
    state.guestUid = user.uid;
    let saved;
    await runTransaction(db, async transaction => {
      const ref = doc(db, 'gifts', gift.id);
      const current = await transaction.get(ref);
      if (!current.exists()) throw new Error('gift-missing');
      if (current.data().status !== previousStatus) throw new Error('status-conflict');
      saved = reservationUpdate(current.data(), status, user.uid);
      transaction.update(ref, saved);
    });
    await waitForPendingWrites(db);
    state.confirmedStatuses.set(gift.id, status);
    state.gifts = state.gifts.map(item => item.id === gift.id ? {...item, ...saved} : item);
    state.pendingStatusIds.delete(gift.id);
    render();
    if (status === 'reserved') openBookingSuccess(gift.id);
    else showNotice('Бронь снята.');
  } catch (error) {
    console.error(error);
    state.pendingStatusIds.delete(gift.id);
    render();
    showNotice(error.message === 'status-conflict'
      ? (status === 'reserved' ? 'Это желание только что забронировано другим гостем. Выберите другой подарок.' : 'Статус уже изменился другим гостем. Проверьте список.')
      : error.message === 'persistent-storage-unavailable'
        ? 'Браузер не разрешает сохранить сессию. Разрешите хранение данных сайта и повторите.'
        : 'Не удалось сохранить бронь. Проверьте соединение или обновите страницу и повторите.', true);
  }
}

function openUnreserveDialog(gift) {
  if (!ownsReservation(gift, state.guestUid)) return;
  state.pendingUnreserve = gift;
  elements.dialogCopy.textContent = `Снять вашу бронь подарка «${gift.title}»? После подтверждения он снова станет доступен другим гостям.`;
  elements.dialog.showModal();
}

const gratitudeMessages = [
  'Спасибо, что выбрали именно это желание. Мне уже очень приятно — даже если я пока об этом не знаю.',
  'Кажется, кто-то только что сделал мой будущий день немного счастливее. И я даже не подозреваю об этом.',
  'Отличный выбор. Официально подтверждаю, что у вас прекрасный вкус. Неофициально — огромное спасибо!',
  'Маленький секрет между вами и этим сайтом. Я пока ничего не знаю, но уже заочно рад.',
  'Один подарок забронирован, одна приятная неожиданность готовится. Спасибо, что вы в этом участвуете.'
];
const successDialog = document.querySelector('#booking-success');
let successGiftId;
function openBookingSuccess(id) {
  successGiftId = id;
  document.querySelector('#success-copy').textContent = gratitudeMessages[Math.floor(Math.random() * gratitudeMessages.length)];
  // Another independent reservation may finish while this confirmation is open.
  if (!successDialog.open) successDialog.showModal();
}
function closeBookingSuccess() {
  if (!successDialog.open || successDialog.classList.contains('is-closing')) return;
  const finish = () => { successDialog.close(); successDialog.classList.remove('is-closing'); };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
  else { successDialog.classList.add('is-closing'); setTimeout(finish, 180); }
}
successDialog.querySelector('form').addEventListener('submit', event => { event.preventDefault(); closeBookingSuccess(); });
successDialog.addEventListener('cancel', event => { event.preventDefault(); closeBookingSuccess(); });
successDialog.addEventListener('click', event => { if (event.target === successDialog) closeBookingSuccess(); });
successDialog.addEventListener('close', () => {
  const card = [...elements.list.querySelectorAll('.gift-card')].find(item => item.dataset.id === successGiftId);
  const button = card?.querySelector('.glass-button:not(:disabled)');
  (button || document.querySelector(`[data-mode="${state.mode}"]`)).focus({preventScroll: true});
});

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
    if (snapshot.metadata.fromCache && snapshot.empty) return;
    if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) {
      const kept = new Set([...state.bookmarks].filter(id => currentIds.has(id)));
      if (kept.size !== state.bookmarks.size) { state.bookmarks = kept; writeBookmarks(bookmarkStorage, kept); }
    }
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

const statusFilter = document.querySelector('.status-filter');
const statusButtons = [...statusFilter.querySelectorAll('[data-filter]')];
const modeFilter = document.querySelector('.catalog-modes');
const modeButtons = [...modeFilter.querySelectorAll('[data-mode]')];

function updateSegmentSlider(container) {
  const active = container.querySelector('.is-active');
  const bounds = active.getBoundingClientRect();
  const left = bounds.left - container.getBoundingClientRect().left - container.clientLeft;
  container.style.setProperty('--status-x', `${left}px`);
  container.style.setProperty('--status-width', `${bounds.width}px`);
  container.classList.add('has-slider');
}
function updateStatusSlider() { updateSegmentSlider(statusFilter); }
function updateModeSlider() { updateSegmentSlider(modeFilter); }

updateStatusSlider();
updateModeSlider();
// Button widths also change when the local font loads or the viewport changes.
const statusSliderObserver = new ResizeObserver(updateStatusSlider);
statusButtons.forEach(button => statusSliderObserver.observe(button));
const modeSliderObserver = new ResizeObserver(updateModeSlider);
modeButtons.forEach(button => modeSliderObserver.observe(button));

statusButtons.forEach(button => button.addEventListener('click', () => {
  state.filter = button.dataset.filter;
  statusButtons.forEach(item => {
    const active = item === button;
    item.classList.toggle('is-active', active);
    item.setAttribute('aria-pressed', String(active));
  });
  updateStatusSlider();
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

  control.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !menu.hidden) { event.preventDefault(); close({restoreFocus: true}); }
  });
  control.addEventListener('focusout', () => queueMicrotask(() => {
    if (!control.contains(document.activeElement)) close();
  }));
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

document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
  categoryListbox.close(); sortListbox.close();
  state.mode = button.dataset.mode;
  document.querySelectorAll('[data-mode]').forEach(item => {
    item.classList.toggle('is-active', item === button);
    item.setAttribute('aria-pressed', String(item === button));
  });
  updateModeSlider();
  document.querySelector('#catalog-filters').hidden = state.mode === 'saved';
  document.querySelector('#saved-counter').hidden = state.mode !== 'saved';
  if (state.mode === 'catalog') updateStatusSlider();
  render();
}));
window.addEventListener('storage', event => {
  if (event.key !== bookmarkStorageKey && event.key !== null) return;
  state.bookmarks = readBookmarks(bookmarkStorage);
  refreshBookmarks();
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
  watchGuest(user => {
    state.guestUid = user?.uid ?? null;
    if (state.gifts.length) render();
  });
  subscribe();
  subscribeToGuidance();
}
