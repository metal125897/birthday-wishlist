# Публикация: GitHub Pages + Firebase

Это выбранный бесплатный путь. Сайт не использует OpenAI/GPT в production, поэтому блокировка сервисов OpenAI в РФ на него не влияет.

## 1. Создать Firebase-проект

1. Открыть [Firebase Console](https://console.firebase.google.com/) и создать проект без Google Analytics.
2. В Firestore Database создать одну базу в production mode. Для вишлиста достаточно бесплатной квоты Spark.
3. В Authentication → Sign-in method включить Email/Password.
4. В Authentication → Users создать единственного администратора с техническим адресом `admin@birthday-wishlist.local`. Пароль не записывать в репозиторий.
5. В Project settings → Your apps создать Web app и скопировать объект `firebaseConfig`.
6. Вставить значения в `dist/assets/firebase-config.js` вместо `YOUR_...`.
7. В Firestore → Rules заменить правила содержимым `firestore.rules` и нажать Publish.
8. Добавить будущий домен GitHub Pages в Authentication → Settings → Authorized domains, если он не появился автоматически.

Официальные справки: [подключение Web app](https://firebase.google.com/docs/web/setup), [Email/Password Auth](https://firebase.google.com/docs/auth/web/password-auth), [квоты Firestore](https://firebase.google.com/docs/firestore/pricing), [ограничение полей правилами](https://firebase.google.com/docs/firestore/security/rules-fields).

## 2. Локальная проверка

Открывать файлы двойным кликом нельзя: ES modules требуют HTTP. Из корня проекта запустить `node scripts/serve.mjs dist 4173`, затем проверить `http://127.0.0.1:4173/` и `/admin/`.

Войти в админку созданным паролем — email на сайте вводить не нужно. Если коллекция `gifts` пуста, первый вход автоматически добавит 57 стартовых подарков. После этого открыть публичную страницу и убедиться, что список появился.

## 3. GitHub Pages

1. Создать публичный GitHub-репозиторий.
2. Добавить этот проект и отправить ветку `main`.
3. В Settings → Pages → Build and deployment выбрать Source: GitHub Actions.
4. Workflow `.github/workflows/pages.yml` опубликует только папку `dist/`.
5. Дождаться зелёного workflow и открыть URL `https://<логин>.github.io/<репозиторий>/`.
6. Админка будет доступна по `https://<логин>.github.io/<репозиторий>/admin/`.

GitHub Pages доступен для публичных репозиториев на бесплатном плане: [официальная документация](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

## 4. Smoke-test после публикации

Пройти чек-лист `docs/TESTING.md` с домашнего и мобильного интернета без VPN. Отдельно проверить бронь в двух разных браузерах. Только после этого публикация считается завершённой.

## Обновления

Изменения статических файлов публикуются новым push в `main`. Подарки и брони живут в Firestore и не теряются при переиздании сайта.

После изменения `styles.css` или входного JavaScript-модуля нужно обновить параметр `?v=` в подключающем HTML. Это сбрасывает CDN- и браузерный кэш без переименования файлов.
