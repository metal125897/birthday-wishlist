# Архитектура

## Обзор

```text
Браузер гостя ─┐
               ├─ Firebase JS SDK ─ Firestore collection: gifts
Браузер админа ┘          │
        │                 └─ Firestore Security Rules
        └─ Firebase Authentication (только админ)

Статические файлы: GitHub Pages / GitLab Pages
```

Приложение не имеет собственного сервера и не требует платного runtime. HTML, CSS и JavaScript публикуются как статические файлы; правила Firestore выполняют серверную авторизацию и валидацию.

## Структура

```text
dist/
  index.html                 публичная страница
  admin/index.html           вход и управление подарками
  assets/
    app.js                   чтение, фильтры, сортировка, бронь
    admin.js                 auth, CRUD, первичное заполнение
    firebase-client.js       инициализация SDK
    firebase-config.js       публичный web config Firebase
    seed-data.js             57 стартовых подарков
    styles.css               общие стили
    hero.jpg                 фото пользователя
    float_*.jpg              декоративные референс-объекты
    fonts/                   локальные начертания Inter
firestore.rules              серверные правила
firebase.json                конфигурация правил для CLI
.github/workflows/pages.yml  публикация папки dist
```

## Потоки данных

### Загрузка списка

`app.js` подписывается на коллекцию `gifts` через `onSnapshot`. Любое изменение Firestore отображается у открытых посетителей без перезагрузки.

### Бронирование

Гость отправляет `update` только поля `status`. Правила сравнивают старый и новый документ через `diff().affectedKeys()` и отклоняют любые другие изменения.

### Администрирование

Firebase Auth выдаёт сессию официальному SDK. После авторизации правила разрешают CRUD. Если коллекция пуста, `admin.js` одной batch-записью создаёт документы из `seed-data.js` с детерминированными ID.

## Пути и публикация

Все пути в HTML относительные. Это обязательно для project-site вида `https://user.github.io/repository/`. Админка открывается как `./admin/`, а из неё публичная страница — `../`.

## Зависимости

Firebase SDK 12.18.0 загружается как browser ES modules с `www.gstatic.com`. Сборщик пакетов не используется. При переходе на bundler нужно сохранить относительные пути, выход `dist/` и правила из `AGENTS.md`.
