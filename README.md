# Bitrix24 Local App — Анкета (МКЦ + МП)

Локальное приложение Bitrix24 для заполнения анкеты клиента. Используется двумя ролями:
- **МКЦ** (менеджер колл-центра) — первичный сбор данных по телефону
- **МП** (менеджер продаж) — уточнение данных и запись клиента на встречу

Приложение работает как встраиваемый интерфейс (iframe) во вкладке карточки лида CRM и использует Bitrix24 REST API и BX24 JS SDK для чтения и сохранения данных.

## Технологический стек

| Слой | Технология | Примечание |
|---|---|---|
| Frontend | **Tailwind CSS 4** | CDN-сборка (`@tailwindcss/browser@4`), utility-first |
| UI-компоненты | **Flowbite 2** | Готовые компоненты поверх Tailwind |
| Интеграции | **Bitrix24 REST API + BX24 JS SDK** | Локальное приложение, `CRM_LEAD_DETAIL_TAB` |
| Backend | **PHP** | config.php, install.php, proxy.php, uninstall.php |

## Правила разработки

- Любой новый экран строится на **Tailwind CSS 4**.
- Стандартные UI-элементы (кнопки, формы, карточки, вкладки, алерты) берутся из **Flowbite**.
- Самописные CSS-файлы (`tokens.css`, `style.css`) **не используются** — удалены из подключения в `index.php`.
- Новые кастомные стили допустимы только для точечных integration-override задач Bitrix24 (например, сброс стилей iframe).
- Автоматический polling (periodic запросы расписания) **отключён** — расписание обновляется:
  - Автоматически при первой загрузке анкеты.
  - Автоматически после бронирования слота.
  - Вручную по нажатию кнопки **«Обновить расписание»**.
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
│   ├── calendar.js    — расписание по ID календарей, часовые слоты, timezone, бронирование
│   ├── cities.js      — словарь ~1 000 городов России с UTC-офсетами; getCityTZ(name)
│   ├── mp-config.js   — конфигурация МП: город, рабочие часы/дни, слоты; getMPDaySlots(), isMPWorkday()
│   └── polling.js     — no-op заглушка (автополлинг отключён)
docs/
└── TZ.md              — техническое задание и журнал изменений
```

## Установка

1. Разместить папку `anketa-kc/` на PHP-хостинге.
2. Заполнить `config.php` (PORTAL_URL, CLIENT_ID, CLIENT_SECRET, SALES_DEPT_ID).
3. Зарегистрировать локальное приложение в Bitrix24 (`/devops/section/applications/`) с типом размещения `CRM_LEAD_DETAIL_TAB`, указав URL `index.php`.
4. Запустить `install.php` для создания UF-полей лида.

## Подключение Tailwind + Flowbite

```html
<!-- Tailwind CSS 4 CDN -->
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>

<!-- Flowbite CSS -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/flowbite/2.3.0/flowbite.min.css" />

<!-- Flowbite JS (в конце body) -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/flowbite/2.3.0/flowbite.min.js"></script>
```

## Порядок подключения JS-ассетов

```html
<!-- ВАЖНО: cities.js должен идти раньше mp-config.js -->
<script src="assets/cities.js"></script>
<script src="assets/mp-config.js"></script>
<script src="assets/calendar.js"></script>
<script src="assets/form.js"></script>
<script src="assets/app.js"></script>
```

`mp-config.js` читает `CITIES_TZ` из `cities.js` при инициализации — нарушение порядка приведёт к ошибке `undefined`.

## Словарь городов — `cities.js`

- Охватывает **~1 000 населённых пунктов России**: от Калининграда (UTC+2) до Камчатки и Чукотки (UTC+12).
- Включает **региональные центры, районные центры и малые города** (не только административные центры).
- Экспортирует константу `CITIES_TZ` (объект `{ "Город": utcOffset }`) и функцию `getCityTZ(name)`.
- `getCityTZ` поддерживает нечёткий поиск — возвращает `null`, если город не найден.

## Конфигурация МП — `mp-config.js`

- Каждый МП описан объектом: `bitrixUserId`, `city`, рабочие часы (`workStart`/`workEnd`), рабочие дни (`workDays`), длительность слота (`slotMinutes`), флаг `active`.
- UTC-офсет МП вычисляется автоматически через `getCityTZ(mp.city)` из `cities.js`.
- Чтобы добавить нового МП или поменять рабочие часы — правится только `mp-config.js`, `calendar.js` не трогаешь.
- Экспортирует:
  - `MP_CONFIG` — массив всех МП.
  - `getMPDaySlots(mpId, date)` — возвращает массив слотов дня с UTC-временем для Bitrix24 API.
  - `isMPWorkday(mpId, date)` — возвращает `true`, если дата является рабочим днём МП.

## Календари МП

Календари **не привязаны к пользователю** — у каждого МП есть собственный ID календаря в Bitrix24:

| МП | ID календаря | Сотрудник |
|---|---|---|
| МП 1 | `MP1Vstrechi` | Сергей Хватов |
| МП 2 | `MP2Vstrechi` | Мария Прокопьева |
| МП 3 | `MP3Vstrechi` | Ефим Костылев |
| МП 4 | `MP4Vstrechi` | Виктория Григорьева |
| МП 5 | `MP5Vstrechi` | Джульетта Мурадян |
| МП 6 | `MP6Vstrechi` | Виталий Андреев |
| МП 7 | `MP7Vstrechi` | Виталий Прилепин |
| МП 8 | `MP8Vstrechi` | Каролина Гнездилова |
| МП 9 | `MP9Vstrechi` | Сергей Хватов |
| МП 10 | `MP10Vstrechi` | Анна Радаева |
| МП 11 | `MP11Vstrechi` | Виктория Владимирова |

Слоты — **только часовые** (шаг 60 минут). Получение занятых слотов через `calendar.accessibility.get` по ID календаря.

## Логика часового пояса

Приоритет — часовой пояс клиента:

1. МКЦ/МП выбирает город клиента в анкете (блок 1).
2. `getCityTZ(city)` из `cities.js` возвращает UTC-офсет клиента.
3. `getMPDaySlots(mpId, date)` из `mp-config.js` генерирует слоты с UTC-временем МП.
4. Слоты расписания отображаются **в двух колонках**: время МП (по его UTC) и время клиента (по UTC клиента).
5. Если рабочие часы МП не пересекаются с удобным временем клиента сегодня — автоматически показывается следующий рабочий день.
6. МКЦ/МП **всегда ориентируется на колонку времени клиента** при назначении встречи.

## UF-поля лида (26 полей)

См. комментарии в `assets/form.js` — там перечислены все `UF_CRM_KC_*` поля с типами и блоками.

---

> Полный журнал изменений и техническое задание — см. [`docs/TZ.md`](docs/TZ.md)
