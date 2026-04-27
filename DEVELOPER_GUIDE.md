# DEVELOPER_GUIDE.md — Локальное приложение «Анкета КЦ» (Битрикс24)

> Полное описание процессов приложения от А до Я для разработчика Битрикс24.
> Актуально на 23.04.2026. Код находится в папке `anketa-kc/`.

---

## 0. Что это вообще

«Анкета КЦ» — локальное приложение Битрикс24, которое открывается как вкладка на карточке лида (CRM_LEAD_DETAIL_TAB). Оператор колл-центра (КЦ) во время разговора с клиентом заполняет структурированную анкету из 27 пользовательских полей (ФИО, паспорт, адрес, работа, доходы, долги и т.д.), выбирает ближайшего свободного менеджера продаж (МП) и слот встречи, затем сохраняет всё одним кликом. Данные уходят в поля лида + в таймлайн в виде форматированного комментария, а на бронь времени МП запускается бизнес-процесс.

Стек: чистый JS (без сборщиков), Tailwind CDN, PHP только для раздачи `index.php` с `$_REQUEST['AUTH_ID']`, Битрикс24 REST через SDK `//api.bitrix24.com/api/v1/`.

---

## 1. Структура репозитория

```
bitrix24-local-app-questionnaire/
├── anketa-kc/                    # само приложение
│   ├── index.php                 # точка входа, проксирует auth и раздаёт HTML
│   ├── install.php               # хендлер ONAPPINSTALL (регистрирует placement)
│   ├── uninstall.php             # хендлер ONAPPUNINSTALL
│   ├── config.php                # ID приложения, client_secret, WEBHOOK_URL
│   ├── manifest.json             # метаданные приложения для Маркетплейс
│   ├── docs/                     # пользовательская документация
│   │   ├── design-system.md
│   │   ├── tz.md
│   │   └── STANDARD_NETSELEVOI.md  # свод правил «Целевой/Нецелевой» КЦ
│   └── assets/
│       ├── app.js                # инициализация, загрузка лида и пользователя
│       ├── form.js               # рендер и валидация 27 полей UF_CRM_KC_* + блок «Признаки нецелевой»
│       ├── target-status.js      # правила и расчёт «Целевой/Нецелевой» (11 правил)
│       ├── calendar.js           # загрузка слотов МП через calendar.accessibility.get + CelNeCel в БП
│       ├── cities.js             # справочник городов для автокомплита
│       ├── mp-config.js          # MP_CONFIG — массив менеджеров продаж
│       ├── polling.js            # периодический ping, следит за сессией
│       └── webhook-client.js     # shim BX24 для режима вебхука (DEV)
├── ROLLBACK.md                   # как откатить dev-режим вебхука
├── DEVELOPER_GUIDE.md            # этот файл
└── README.md
```

---

## 2. Два режима работы

Приложение умеет работать в двух режимах. Переключатель — одна строка в `index.php`:

```php
<script>window.APP_USE_WEBHOOK = true;</script>  // DEV: через вебхук
<script>window.APP_USE_WEBHOOK = false;</script> // PROD: через BX24 SDK внутри iframe
```

| Режим | Когда используется | Источник токена |
|-------|--------------------|-----------------|
| PROD (`false`) | Внутри iframe Битрикс24 | `BX24.init()` → OAuth через `AUTH_ID` |
| DEV (`true`) | Вне iframe, локально, для тестирования | Вебхук `WEBHOOK_URL` из `config.php` |

В DEV-режиме `webhook-client.js` создаёт объект `window.BX24` с той же сигнатурой, что и настоящий SDK — поэтому остальной код (`app.js`, `form.js`, `calendar.js`) даже не знает, в каком он режиме. Это ключевая архитектурная идея: всё общение с Битрикс24 идёт через единый интерфейс `BX24.callMethod(method, params, callback)`.

---

## 3. Процесс установки приложения (ONAPPINSTALL)

Когда администратор портала ставит приложение из Маркетплейс:

1. Битрикс24 дергает `install.php` с параметрами `AUTH_ID`, `REFRESH_ID`, `member_id`.
2. Приложение регистрирует placement `CRM_LEAD_DETAIL_TAB` через метод `placement.bind`:
   ```js
   BX24.callMethod('placement.bind', {
     PLACEMENT: 'CRM_LEAD_DETAIL_TAB',
     HANDLER:   'https://домен.ру/anketa-kc/index.php',
     TITLE:     'Анкета КЦ',
     DESCRIPTION: 'Заполнение анкеты колл-центром'
   });
   ```
3. Вызывается `BX24.installFinish()` — приложение отмечено как установленное.

После этого на карточке каждого лида появляется вкладка «Анкета КЦ».

---

## 4. Открытие приложения на карточке лида (PROD)

### 4.1 Инициализация (`app.js` → `init()`)

Когда оператор открывает вкладку, Битрикс24 грузит `index.php` в iframe и передаёт `AUTH_ID` через POST. Дальше:

```js
// app.js, ~строка 40
BX24.init(async () => {
  const placement = BX24.placement.info();          // { placement: 'CRM_LEAD_DETAIL_TAB', options: { ID: 59466 } }
  const leadId = placement.options.ID;

  const [lead, user] = await Promise.all([
    callBX('crm.lead.get',  { id: leadId }),        // весь лид с UF_CRM_KC_*
    callBX('user.current',  {})                     // текущий оператор КЦ
  ]);

  window.APP_STATE = { leadId, lead, currentUser: user.ID, currentUsername: `${user.NAME} ${user.LAST_NAME}` };

  renderHeader(lead.TITLE);                          // "Daria | gfinvite"
  renderForm(lead);                                  // 27 полей UF_CRM_KC_*
  await loadMPCalendar();                            // таблица слотов на 7 дней
});
```

`callBX()` — тонкий промис-обёртка над `BX24.callMethod`, обрабатывает `result.error()` / `result.data()`.

### 4.2 Рендер формы (`form.js` → `renderForm(lead)`)

Все поля группируются в 5 блоков:

1. Клиент (ФИО, дата рождения, паспорт)
2. Адрес (регистрация, фактический, город)
3. Работа (должность, работодатель, стаж)
4. Финансы (доход, долги, количество кредиторов)
5. Встреча (МП, слот, комментарий)

Каждое поле привязано к UF-коду:

```js
// form.js, FIELD_DEFS
const FIELD_DEFS = [
  { code: 'UF_CRM_KC_FIO',          label: 'ФИО клиента',       type: 'text',    required: true  },
  { code: 'UF_CRM_KC_BIRTHDATE',    label: 'Дата рождения',     type: 'date',    required: true  },
  { code: 'UF_CRM_KC_PASSPORT_SER', label: 'Серия паспорта',    type: 'text',    required: true  },
  // ... всего 27 полей
  { code: 'UF_CRM_KC_MP_ID',        label: 'Менеджер продаж',   type: 'select',  required: true,  options: () => MP_CONFIG },
  { code: 'UF_CRM_KC_MEETING_AT',   label: 'Дата и время встречи', type: 'hidden' }
];
```

`renderForm` итерируется по `FIELD_DEFS`, создаёт inputs и предзаполняет значениями из `lead.UF_CRM_KC_*`.

### 4.3 Загрузка расписания МП (`calendar.js` → `loadMPCalendar()`)

Таблица слотов: строки — 11 менеджеров из `MP_CONFIG`, столбцы — ближайшие 7 дней с 09:00 до 18:00 по 30 минут.

```js
// calendar.js
async function loadMPCalendar() {
  const from = new Date();
  const to   = new Date(Date.now() + 7 * 86400000);

  // батч-запрос на все 11 МП за один REST-вызов
  const batch = {};
  MP_CONFIG.forEach(mp => {
    batch[`mp_${mp.id}`] = ['calendar.accessibility.get', {
      from:  formatDT(from),
      to:    formatDT(to),
      users: [mp.userId]                 // ВАЖНО: users, а не ids
    }];
  });

  const res = await callBatch(batch);     // { mp_1: {137:[{DATE_FROM,DATE_TO}]}, ... }
  renderSlotTable(res);                   // рисует HTML-таблицу с кликабельными ячейками
}
```

Ответ Битрикс24 приходит в странном формате: `{"result":{"137":[events]}}`, даты в `"dd.mm.YYYY HH:MM:SS"` (не ISO). Нормализация дат — в `parseBxDate()` в `calendar.js`.

Клик по свободной ячейке заполняет два скрытых поля: `UF_CRM_KC_MP_ID` и `UF_CRM_KC_MEETING_AT`.

### 4.4 Отправка формы (`form.js` → `submitForm()`)

```js
async function submitForm() {
  if (!validateForm()) return;            // проверяет required, форматы паспорта/даты

  const fields = collectFieldValues();    // { UF_CRM_KC_FIO: 'Иванов...', ... }

  // 1. Обновляем поля лида
  await callBX('crm.lead.update', { id: APP_STATE.leadId, fields });

  // 2. Добавляем читаемый комментарий в таймлайн
  const commentText = buildHumanSummary(fields);  // "ФИО: Иванов...\nПаспорт: 4567 123456..."
  await callBX('crm.timeline.comment.add', {
    fields: {
      ENTITY_ID: APP_STATE.leadId,
      ENTITY_TYPE: 'lead',
      COMMENT: `Анкета КЦ заполнена: ${APP_STATE.currentUsername} (${formatNow()})\n\n${commentText}`,
      AUTHOR_ID: APP_STATE.currentUser
    }
  });

  // 3. Запускаем бизнес-процесс бронирования встречи
  await callBX('bizproc.workflow.start', {
    TEMPLATE_ID: BP_TEMPLATE_BOOK_MEETING,
    DOCUMENT_ID: ['crm', 'CCrmDocumentLead', `LEAD_${APP_STATE.leadId}`],
    PARAMETERS: {
      MP_USER_ID:  fields.UF_CRM_KC_MP_ID,
      MEETING_AT:  fields.UF_CRM_KC_MEETING_AT
    }
  });

  showToast('Анкета сохранена');
}
```

Бизнес-процесс (ID в `config.php` → `BP_TEMPLATE_BOOK_MEETING`) на стороне Битрикс24 создаёт событие в календаре МП и шлёт ему уведомление.

---

## 5. Как работает DEV-режим (вебхук)

### 5.1 Зачем

SDK `BX24` работает только внутри iframe Битрикс24 — локально его взять неоткуда. Чтобы разработчик мог тестировать приложение на `http://127.0.0.1:8765` без деплоя, создан shim в `webhook-client.js`.

### 5.2 Что делает shim

`webhook-client.js` активируется, когда `window.APP_USE_WEBHOOK === true`, и создаёт `window.BX24` с теми же методами:

```js
// webhook-client.js
window.BX24 = {
  init: (cb) => cb(),

  callMethod: (method, params, callback) => {
    // обычный fetch к вебхуку
    fetch(`${WEBHOOK_URL}${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    })
    .then(r => r.json())
    .then(data => callback({
      data:  () => data.result,
      error: () => data.error
    }));
  },

  callBatch:  (batch, cb) => { /* аналогично, но /batch */ },

  placement: {
    info: () => ({
      placement: 'CRM_LEAD_DETAIL_TAB',
      options: { ID: getLeadIdFromURL() || 59466 }   // ?leadId=... или 59466
    })
  },

  installFinish: () => {}
};
```

### 5.3 Обходы ограничений scope

Вебхук `https://crm.yurclick.com/rest/6/m1umtpppnvj21gud/` имеет scopes `bizproc, calendar, crm`. Методы `user.current`, `placement.info`, `department.get` недоступны — возвращают `insufficient_scope`. Shim их мокает:

```js
// webhook-client.js — перехват несовместимых методов
if (method === 'user.current') {
  return callback({
    data: () => ({ ID: 14, NAME: 'Петряев', LAST_NAME: 'Денис' }),
    error: () => null
  });
}
```

### 5.4 Адаптер calendar.accessibility.get

Старый код передавал `ids: ['MP137Vstrechi']` (ID календарей). Вебхук этого не понимает — ему нужен `users: [137]`. Shim перехватывает вызов, парсит имя календаря регэкспом `/MP(\d+)/`, подставляет `users`. Обратно тоже нормализует ответ.

### 5.5 Запуск локального сервера

```bash
cd anketa-kc
php -S 127.0.0.1:8765
# открыть http://127.0.0.1:8765/index.php?leadId=59466
```

Параметр `?leadId=` позволяет тестировать разные лиды без правки кода.

---

## 6. Деинсталляция

Когда приложение удаляется с портала, Битрикс24 вызывает `uninstall.php`. Там:

```php
// uninstall.php
BX24::callMethod('placement.unbind', [
  'PLACEMENT' => 'CRM_LEAD_DETAIL_TAB',
  'HANDLER'   => 'https://домен.ру/anketa-kc/index.php'
]);
```

Данные в полях лидов и таймлайне остаются — их специально не чистим.

---

## 7. Чек-лист для разработчика

Перед деплоем в прод:

- [ ] В `index.php` установлено `window.APP_USE_WEBHOOK = false`
- [ ] В `config.php` заполнены реальные `CLIENT_ID`, `CLIENT_SECRET`, `BP_TEMPLATE_BOOK_MEETING`
- [ ] В `assets/mp-config.js` перечислены реальные МП с корректными `userId`
- [ ] Плейсхолдерные ID (1-11) заменены на боевые ID пользователей
- [ ] На портале созданы все 27 пользовательских полей `UF_CRM_KC_*` в сущности «Лид»
- [ ] Запущен бизнес-процесс `BP_TEMPLATE_BOOK_MEETING` на сущности «Лид»
- [ ] Приложение залито на HTTPS-домен (Битрикс24 не разрешает http в iframe)

Чтобы вернуться из DEV в PROD — см. `ROLLBACK.md`.

---

## 7a. Логика «Целевой / Нецелевой» КЦ

С апреля 2026 в анкету добавлен блок 5 «Признаки нецелевой встречи». Это UI-логика, которая по 11 правилам решает, целевой ли лид, и передаёт результат в БП «Назначить встречу» как обязательный параметр `CelNeCel` (поле лида `UF_CRM_1649136704`, enum `289 Целевой / 290 Нецелевой / 291 Не определено`).

**Архитектура — один файл = одна ответственность:**

- `assets/target-status.js` — чистые правила (`RULES[]` + `evaluate(formData) → { id, label, reasons[] }`). Никаких BX24-вызовов, никакой DOM-работы. Экспорт через `window.TargetStatus`.
- `assets/form.js` — рендер 14 чек-боксов в `#netselevoi-body`, сбор их состояния в `collectFormData()`, обновление бейджа `#target-status-badge` и списка `#target-status-reasons` через `updateTargetStatusWidget()`. Делегированные listener'ы `change`/`input` на `#anketa-form`.
- `assets/calendar.js → bookSlot()` — перед `bizproc.workflow.start` вызывает `updateTargetStatusWidget()`, читает `window.__targetStatus`, при `id === 291` показывает мягкий `confirm()`. Передаёт `CelNeCel: status.id` в параметрах БП и блок «Целевой/Нецелевой КЦ: …» в комментарии таймлайна.
- `index.php` — контейнер блока 5 (бейдж + `#netselevoi-body` + `#target-status-reasons.hidden`), подключение `target-status.js` ПОСЛЕ `app.js` и ПЕРЕД `form.js`.

**Ключевое ограничение:** 14 чек-боксов хранятся ТОЛЬКО в `formData` (в памяти страницы). В `crm.lead.update` они НЕ передаются — никаких новых UF-полей на портале не создаём. Передаётся только итоговый статус, и только в момент бронирования слота.

**Мягкое предупреждение:** при `id === 291` (Не определено) бронирование разрешено, но КЦ видит `confirm("«Целевой/Нецелевой» не определён. Записать всё равно?")`. Отказ снимает `_bookingInProgress`, разблокирует `#btn-book-confirm`.

**Полный свод правил, метки чек-боксов, поведение виджета** — см. `anketa-kc/docs/STANDARD_NETSELEVOI.md`.

**Как добавить правило:** отредактировать `RULES[]` в `target-status.js`. Если нужен новый признак — добавить чек-бокс в `form.js → initForm()` (через `fieldCheckbox()`) и в `collectFormData()` (через `vc('id')`). Изменения на портале Битрикс24 НЕ требуются.

---

## 8. Частые вопросы

**Q: Почему не используется сборщик (webpack/vite)?**
A: Приложение простое, обновляется редко. Чистый JS грузится быстрее и проще дебажится внутри iframe Битрикс24.

**Q: Как добавить новое поле в анкету?**
A: 1) Создать UF-поле в «Лид» на портале. 2) Добавить объект в `FIELD_DEFS` в `form.js`. 3) Если нужно — обновить `buildHumanSummary()` для красивого вывода в таймлайн.

**Q: Как поменять список МП?**
A: Отредактировать `assets/mp-config.js`. Там массив `MP_CONFIG` с `{id, userId, name, calendarId}`.

**Q: Как дебажить ошибки REST?**
A: В DEV-режиме открыть DevTools → Network → фильтр по `rest/6/`. В PROD — то же, но запросы идут на `https://портал.bitrix24.ru/rest/`.

---

Автор: команда YurClick. Вопросы по архитектуре — в issues репозитория.
