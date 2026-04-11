# Bitrix24 Local App — Анкета КЦ

Локальное приложение Bitrix24 для анкеты КЦ. Приложение работает как встраиваемый интерфейс (iframe) в карточке лида CRM и использует Bitrix24 REST API и BX24 JS SDK для чтения и сохранения данных лида.

## Технологический стек

| Слой | Технология | Примечание |
|---|---|---|
| Frontend | **Tailwind CSS 4** | CDN-сборка, utility-first |
| UI-компоненты | **Flowbite 2** | Готовые компоненты поверх Tailwind |
| Интеграции | **Bitrix24 REST API + BX24 JS SDK** | Локальное приложение, CRM_LEAD_DETAIL_TAB |
| Backend | **PHP** | config.php, install.php, proxy.php, uninstall.php |

## Правила разработки

- Любой новый экран строится на **Tailwind CSS 4**.
- Стандартные UI-элементы (кнопки, формы, карточки, вкладки, алерты) берутся из **Flowbite**.
- Самописные CSS-файлы (`tokens.css`, `style.css`) **не используются** — удалены из подключения в `index.php`.
- Новые кастомные стили допустимы только для точечных integration-override задач Bitrix24 (например, сброс стилей iframe), и только инлайн или в отдельном файле с чётким комментарием.
- Интеграционный слой — **BX24 JS SDK + Bitrix24 REST API** — не меняется.
- Backend остаётся на **PHP**.

## Структура проекта

```
anketa-kc/
├── index.php          — основной iframe-виджет (HTML-оболочка)
├── config.php         — константы: PORTAL_URL, CLIENT_ID, CLIENT_SECRET, SALES_DEPT_ID
├── install.php        — обработчик установки приложения
├── uninstall.php      — обработчик удаления
├── proxy.php          — серверный прокси для REST API
├── manifest.json      — манифест локального приложения
├── assets/
│   ├── app.js         — инициализация BX24, batch-запрос лида/пользователей
│   ├── form.js        — рендер полей, валидация, сохранение (crm.lead.update + таймлайн)
│   ├── calendar.js    — расписание менеджеров, генерация слотов, бронирование
│   └── polling.js     — периодическое обновление слотов
└── docs/              — техническая документация
    └── TZ.md          — техническое задание
```

## Установка

1. Разместить папку `anketa-kc/` на PHP-хостинге.
2. Заполнить `config.php` (PORTAL_URL, CLIENT_ID, CLIENT_SECRET, SALES_DEPT_ID).
3. Зарегистрировать локальное приложение в Bitrix24 (`/devops/section/applications/`) с типом размещения `CRM_LEAD_DETAIL_TAB`, указав URL `index.php`.
4. Запустить `install.php` для создания UF-полей лида.

## Подключение Tailwind + Flowbite

```html
<!-- Tailwind CSS 4 CDN -->
<script src="https://cdn.tailwindcss.com"></script>

<!-- Flowbite CSS -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/flowbite/2.3.0/flowbite.min.css" />

<!-- Flowbite JS (в конце body) -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/flowbite/2.3.0/flowbite.min.js"></script>
```

## UF-поля лида (26 полей)

См. комментарии в `assets/form.js` — там перечислены все `UF_CRM_KC_*` поля с типами и блоками.
