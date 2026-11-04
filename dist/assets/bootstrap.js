const entry = document.querySelector('script[data-entry]').dataset.entry;
const banner = document.createElement('div');
banner.className = 'notice is-error';
banner.setAttribute('role', 'alert');
banner.hidden = true;
const message = document.createElement('span');
message.textContent = 'Не удалось загрузить сайт. Проверьте соединение и попробуйте снова. ';
const retry = document.createElement('button');
retry.type = 'button';
retry.className = 'mini-button';
retry.textContent = 'Повторить';
retry.addEventListener('click', () => location.reload());
banner.append(message, retry);
document.body.append(banner);
const ready = () => {
  const loading = document.querySelector('#loading, #admin-loading');
  return loading?.hidden;
};
const timeout = setTimeout(() => { if (!ready()) banner.hidden = false; }, 15000);
const observer = new MutationObserver(() => {
  if (ready()) { clearTimeout(timeout); observer.disconnect(); banner.hidden = true; }
});
observer.observe(document.body, {subtree: true, attributes: true, attributeFilter: ['hidden']});
try {
  await import(new URL(entry, document.baseURI).href);
} catch (error) {
  clearTimeout(timeout);
  console.error('Не удалось запустить сайт.', error);
  banner.hidden = false;
}
