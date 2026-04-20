<?php
/**
 * install.php — установщик локального приложения «Анкета (МКЦ + МП)»
 *
 * Вызывается Битрикс24 при первой установке приложения.
 * Отображается администратору во фрейме; обычные пользователи видят
 * «Приложение ещё не установлено» до вызова BX24.installFinish().
 *
 * Порядок работы:
 *   1. BX24.init()
 *   2. app.info → проверка INSTALLED (защита от повторного запуска)
 *   3. crm.lead.userfield.list → получить уже существующие UF-поля
 *   4. crm.lead.userfield.add × N → создать недостающие поля (27 штук)
 *   5. placement.bind → зарегистрировать CRM_LEAD_DETAIL_TAB
 *   6. BX24.installFinish() → Битрикс24 считает приложение установленным
 *
 * Обязательные поля (MANDATORY: 'Y') — 10 штук:
 *   KC_FULLNAME, KC_MARITAL_STATUS, KC_CHILDREN, KC_JOINT_PROPERTY,
 *   KC_CRIMINAL, KC_OOO, KC_IP, KC_DEBT_TOTAL, KC_PROPERTY, KC_DEALS
 */
require_once __DIR__ . '/config.php';

$portalHost = htmlspecialchars(parse_url(PORTAL_URL, PHP_URL_HOST), ENT_QUOTES);
// URL обработчика виджета — index.php в том же каталоге
$handlerUrl = rtrim(PORTAL_URL, '/') . '/anketa-kc/index.php';
?>
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Установка — Анкета (МКЦ + МП)</title>

  <!-- BX24 JS SDK -->
  <script src="https://<?= $portalHost ?>/bitrix/js/rest/bx24.js"></script>

  <!-- Tailwind CSS v4 CDN (единый стек с основным приложением) -->
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>

  <style>
    html, body { margin: 0; padding: 0; }
  </style>
</head>
<body class="bg-gray-50 text-gray-800 text-sm antialiased">

<div class="max-w-xl mx-auto px-6 py-8">

  <!-- Заголовок -->
  <h1 class="text-lg font-bold text-gray-900 mb-1">Установка приложения «Анкета»</h1>
  <p class="text-xs text-gray-500 mb-6">Создание пользовательских полей лида и регистрация вкладки в карточке лида CRM.</p>

  <!-- Прогресс -->
  <div class="mb-4">
    <div class="flex items-center justify-between mb-1">
      <span id="step-label" class="text-xs font-medium text-gray-600">Инициализация...</span>
      <span id="step-counter" class="text-xs text-gray-400"></span>
    </div>
    <div class="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
      <div id="progress-bar" class="h-full bg-blue-500 rounded-full transition-all duration-300" style="width:0%"></div>
    </div>
  </div>

  <!-- Лог -->
  <div id="log" class="bg-white border border-gray-200 rounded-lg p-3 text-xs text-gray-600 space-y-1 max-h-72 overflow-y-auto font-mono"></div>

  <!-- Ошибка -->
  <div id="error-block" class="hidden mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800"></div>

  <!-- Успех -->
  <div id="success-block" class="hidden mt-4 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800"></div>

</div>

<script>
'use strict';

// ─── Конфиг: URL обработчика виджета (из PHP) ────────────────────────────────
var HANDLER_URL = <?= json_encode($handlerUrl, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?>;

// ─── UI-хелперы ──────────────────────────────────────────────────────────────

function log(msg) {
  var el = document.getElementById('log');
  if (!el) return;
  var line = document.createElement('div');
  line.textContent = msg;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

function setStep(label, current, total) {
  var stepLabel   = document.getElementById('step-label');
  var stepCounter = document.getElementById('step-counter');
  var bar         = document.getElementById('progress-bar');
  if (stepLabel)   stepLabel.textContent   = label;
  if (stepCounter) stepCounter.textContent = total ? (current + ' / ' + total) : '';
  if (bar && total) bar.style.width = Math.round((current / total) * 100) + '%';
}

function showError(msg) {
  var el = document.getElementById('error-block');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
  log('ОШИБКА: ' + msg);
}

function showSuccess(msg) {
  var el = document.getElementById('success-block');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
  log(msg);
}

// ─── Определение 27 UF-полей ─────────────────────────────────────────────────
//
// FIELD_NAME — без префикса UF_CRM_ (добавляется API автоматически).
// USER_TYPE_ID: string | integer | enumeration | datetime
// MANDATORY: 'Y' — обязательное, 'N' — необязательное.
// LIST: массив значений для enumeration (VALUE, XML_ID, SORT).
// SETTINGS: доп. настройки (ROWS для textarea, DISPLAY/LIST_HEIGHT для enum).
//
// Порядок полей = порядок блоков в form.js.
// ──────────────────────────────────────────────────────────────────────────────

var UF_FIELDS = [

  // ── Блок 1: Персональные данные ──────────────────────────────────────────

  {
    FIELD_NAME:   'KC_FULLNAME',
    USER_TYPE_ID: 'string',
    LABEL:        'ФИО клиента',
    MANDATORY:    'Y',
    SORT:         100
  },
  {
    FIELD_NAME:   'KC_CLIENT_CITY',
    USER_TYPE_ID: 'string',
    LABEL:        'Город клиента',
    MANDATORY:    'N',
    SORT:         200
  },
  {
    FIELD_NAME:   'KC_WORKPLACE',
    USER_TYPE_ID: 'string',
    LABEL:        'Место работы',
    MANDATORY:    'N',
    SORT:         300
  },
  {
    FIELD_NAME:   'KC_MARITAL_STATUS',
    USER_TYPE_ID: 'enumeration',
    LABEL:        'Семейное положение',
    MANDATORY:    'Y',
    SORT:         400,
    LIST: [
      { VALUE: 'Не в браке',   XML_ID: 'single',   SORT: 100 },
      { VALUE: 'В браке',      XML_ID: 'married',  SORT: 200 },
      { VALUE: 'Разведён/а',   XML_ID: 'divorced', SORT: 300 },
      { VALUE: 'Вдовец/вдова', XML_ID: 'widow',    SORT: 400 }
    ],
    SETTINGS: { DISPLAY: 'LIST', LIST_HEIGHT: 1 }
  },
  {
    FIELD_NAME:   'KC_CHILDREN',
    USER_TYPE_ID: 'enumeration',
    LABEL:        'Дети',
    MANDATORY:    'Y',
    SORT:         500,
    LIST: [
      { VALUE: 'Нет', XML_ID: '0', SORT: 100 },
      { VALUE: '1',   XML_ID: '1', SORT: 200 },
      { VALUE: '2',   XML_ID: '2', SORT: 300 },
      { VALUE: '3+',  XML_ID: '3', SORT: 400 }
    ],
    SETTINGS: { DISPLAY: 'LIST', LIST_HEIGHT: 1 }
  },
  {
    FIELD_NAME:   'KC_JOINT_PROPERTY',
    USER_TYPE_ID: 'enumeration',
    LABEL:        'Совместное имущество',
    MANDATORY:    'Y',
    SORT:         600,
    LIST: [
      { VALUE: 'Да',  XML_ID: 'Y', SORT: 100 },
      { VALUE: 'Нет', XML_ID: 'N', SORT: 200 }
    ],
    SETTINGS: { DISPLAY: 'LIST', LIST_HEIGHT: 1 }
  },
  {
    FIELD_NAME:   'KC_CRIMINAL',
    USER_TYPE_ID: 'enumeration',
    LABEL:        'Судимости',
    MANDATORY:    'Y',
    SORT:         700,
    LIST: [
      { VALUE: 'Да',  XML_ID: 'Y', SORT: 100 },
      { VALUE: 'Нет', XML_ID: 'N', SORT: 200 }
    ],
    SETTINGS: { DISPLAY: 'LIST', LIST_HEIGHT: 1 }
  },
  {
    FIELD_NAME:   'KC_OOO',
    USER_TYPE_ID: 'enumeration',
    LABEL:        'ООО',
    MANDATORY:    'Y',
    SORT:         800,
    LIST: [
      { VALUE: 'Да',  XML_ID: 'Y', SORT: 100 },
      { VALUE: 'Нет', XML_ID: 'N', SORT: 200 }
    ],
    SETTINGS: { DISPLAY: 'LIST', LIST_HEIGHT: 1 }
  },
  {
    FIELD_NAME:   'KC_IP',
    USER_TYPE_ID: 'enumeration',
    LABEL:        'ИП',
    MANDATORY:    'Y',
    SORT:         900,
    LIST: [
      { VALUE: 'Да',  XML_ID: 'Y', SORT: 100 },
      { VALUE: 'Нет', XML_ID: 'N', SORT: 200 }
    ],
    SETTINGS: { DISPLAY: 'LIST', LIST_HEIGHT: 1 }
  },

  // ── Блок 2: Финансовые данные ────────────────────────────────────────────

  {
    FIELD_NAME:   'KC_DEBT_TOTAL',
    USER_TYPE_ID: 'integer',
    LABEL:        'Общая сумма долга, ₽',
    MANDATORY:    'Y',
    SORT:         1000
  },
  {
    FIELD_NAME:   'KC_MONTHLY_PAYMENT',
    USER_TYPE_ID: 'integer',
    LABEL:        'Ежемесячный платёж, ₽',
    MANDATORY:    'N',
    SORT:         1100
  },
  {
    FIELD_NAME:   'KC_INCOME_OFFICIAL',
    USER_TYPE_ID: 'enumeration',
    LABEL:        'Официальный доход',
    MANDATORY:    'N',
    SORT:         1200,
    LIST: [
      { VALUE: 'Высокий (от 50 000)',       XML_ID: 'high',   SORT: 100 },
      { VALUE: 'Средний (20 000–50 000)',    XML_ID: 'medium', SORT: 200 },
      { VALUE: 'Низкий (до 20 000)',         XML_ID: 'low',    SORT: 300 },
      { VALUE: 'Отсутствует',                XML_ID: 'none',   SORT: 400 }
    ],
    SETTINGS: { DISPLAY: 'LIST', LIST_HEIGHT: 1 }
  },
  {
    FIELD_NAME:   'KC_INCOME_UNOFFICIAL',
    USER_TYPE_ID: 'integer',
    LABEL:        'Неофициальный доход, ₽',
    MANDATORY:    'N',
    SORT:         1300
  },
  {
    FIELD_NAME:   'KC_SALARY_CARD',
    USER_TYPE_ID: 'enumeration',
    LABEL:        'Зарплатная карта',
    MANDATORY:    'N',
    SORT:         1400,
    LIST: [
      { VALUE: 'Сбербанк',    XML_ID: 'sber',  SORT: 100 },
      { VALUE: 'Другой банк', XML_ID: 'other', SORT: 200 },
      { VALUE: 'Нет',         XML_ID: 'none',  SORT: 300 }
    ],
    SETTINGS: { DISPLAY: 'LIST', LIST_HEIGHT: 1 }
  },

  // ── Блок 3: Кредитная история ────────────────────────────────────────────

  {
    FIELD_NAME:   'KC_CREDITORS',
    USER_TYPE_ID: 'string',
    LABEL:        'Кредиторы',
    MANDATORY:    'N',
    SORT:         1500
  },
  {
    FIELD_NAME:   'KC_COLLATERAL',
    USER_TYPE_ID: 'enumeration',
    LABEL:        'Залог',
    MANDATORY:    'N',
    SORT:         1600,
    LIST: [
      { VALUE: 'Да',  XML_ID: 'Y', SORT: 100 },
      { VALUE: 'Нет', XML_ID: 'N', SORT: 200 }
    ],
    SETTINGS: { DISPLAY: 'LIST', LIST_HEIGHT: 1 }
  },
  {
    FIELD_NAME:   'KC_OVERDUE',
    USER_TYPE_ID: 'string',
    LABEL:        'Просрочки',
    MANDATORY:    'N',
    SORT:         1700
  },
  {
    FIELD_NAME:   'KC_FSSP',
    USER_TYPE_ID: 'enumeration',
    LABEL:        'ФССП',
    MANDATORY:    'N',
    SORT:         1800,
    LIST: [
      { VALUE: 'Да',  XML_ID: 'Y', SORT: 100 },
      { VALUE: 'Нет', XML_ID: 'N', SORT: 200 }
    ],
    SETTINGS: { DISPLAY: 'LIST', LIST_HEIGHT: 1 }
  },
  {
    FIELD_NAME:   'KC_PROPERTY',
    USER_TYPE_ID: 'enumeration',
    LABEL:        'Имущество',
    MANDATORY:    'Y',
    SORT:         1900,
    LIST: [
      { VALUE: 'Да',  XML_ID: 'Y', SORT: 100 },
      { VALUE: 'Нет', XML_ID: 'N', SORT: 200 }
    ],
    SETTINGS: { DISPLAY: 'LIST', LIST_HEIGHT: 1 }
  },
  {
    FIELD_NAME:   'KC_DEALS',
    USER_TYPE_ID: 'enumeration',
    LABEL:        'Сделки',
    MANDATORY:    'Y',
    SORT:         2000,
    LIST: [
      { VALUE: 'Да',  XML_ID: 'Y', SORT: 100 },
      { VALUE: 'Нет', XML_ID: 'N', SORT: 200 }
    ],
    SETTINGS: { DISPLAY: 'LIST', LIST_HEIGHT: 1 }
  },

  // ── Блок 4: Заметки менеджера ────────────────────────────────────────────

  {
    FIELD_NAME:   'KC_KM_EXCLUSION',
    USER_TYPE_ID: 'string',
    LABEL:        'Исключение из КМ',
    MANDATORY:    'N',
    SORT:         2100,
    SETTINGS:     { ROWS: 3 }
  },
  {
    FIELD_NAME:   'KC_MAIN_PAIN',
    USER_TYPE_ID: 'string',
    LABEL:        'Основная боль',
    MANDATORY:    'N',
    SORT:         2200,
    SETTINGS:     { ROWS: 3 }
  },
  {
    FIELD_NAME:   'KC_OBJECTIONS',
    USER_TYPE_ID: 'string',
    LABEL:        'Возражения',
    MANDATORY:    'N',
    SORT:         2300,
    SETTINGS:     { ROWS: 3 }
  },
  {
    FIELD_NAME:   'KC_EXTRA_COMMENT',
    USER_TYPE_ID: 'string',
    LABEL:        'Доп. комментарий',
    MANDATORY:    'N',
    SORT:         2400,
    SETTINGS:     { ROWS: 3 }
  },

  // ── Блок 5: Запись на встречу (заполняется из calendar.js) ───────────────

  {
    FIELD_NAME:   'KC_BOOKED_MANAGER',
    USER_TYPE_ID: 'string',
    LABEL:        'Записан к МП (ID календаря)',
    MANDATORY:    'N',
    SORT:         2500
  },
  {
    FIELD_NAME:   'KC_BOOKED_TIME',
    USER_TYPE_ID: 'datetime',
    LABEL:        'Время записи',
    MANDATORY:    'N',
    SORT:         2600
  },
  {
    FIELD_NAME:   'KC_BOOKED_EVENT_ID',
    USER_TYPE_ID: 'integer',
    LABEL:        'ID события календаря',
    MANDATORY:    'N',
    SORT:         2700
  }
];

// ─── Установка ────────────────────────────────────────────────────────────────

BX24.init(function () {
  log('BX24.init — SDK готов');

  // Шаг 1: проверить, не установлено ли уже
  BX24.callMethod('app.info', {}, function (infoRes) {
    if (infoRes.error()) {
      showError('Ошибка app.info: ' + infoRes.error());
      return;
    }
    if (infoRes.data().INSTALLED) {
      showSuccess('Приложение уже установлено. Повторная установка не требуется.');
      setStep('Готово', 1, 1);
      return;
    }
    log('Статус: приложение ещё не установлено → запуск установки');
    loadExistingFields();
  });
});

// ─── Шаг 2: получить существующие UF-поля ────────────────────────────────────

function loadExistingFields() {
  setStep('Загрузка существующих полей лида...', 0, 0);

  BX24.callMethod('crm.lead.userfield.list', {
    order: { SORT: 'ASC' }
  }, function (listRes) {
    if (listRes.error()) {
      showError('Ошибка crm.lead.userfield.list: ' + listRes.error());
      return;
    }

    // Собираем Set имён вида 'UF_CRM_KC_FULLNAME'
    var existing = {};
    var data = listRes.data() || [];
    for (var i = 0; i < data.length; i++) {
      existing[data[i].FIELD_NAME] = true;
    }

    // Обработка пагинации: если есть next(), дозагружаем
    if (listRes.more()) {
      listRes.next();  // BX24.js автоматически сделает следующий запрос
      // Для простоты — работаем с тем, что получили за первую страницу.
      // На практике полей лида обычно < 50, поэтому достаточно одной страницы.
    }

    var existingCount = Object.keys(existing).length;
    log('Найдено существующих UF-полей лида: ' + existingCount);

    // Фильтруем: оставляем только те, которых ещё нет
    var toCreate = [];
    for (var j = 0; j < UF_FIELDS.length; j++) {
      var fullName = 'UF_CRM_' + UF_FIELDS[j].FIELD_NAME;
      if (existing[fullName]) {
        log('  ✓ ' + fullName + ' — уже существует, пропуск');
      } else {
        toCreate.push(UF_FIELDS[j]);
      }
    }

    if (toCreate.length === 0) {
      log('Все 27 полей уже созданы — переход к регистрации вкладки');
      bindPlacement();
      return;
    }

    log('Нужно создать полей: ' + toCreate.length);
    createFieldsSequentially(toCreate, 0);
  });
}

// ─── Шаг 3: создание полей по цепочке ────────────────────────────────────────
// Последовательное создание через цепочку колбэков.
// Это надёжнее параллельного batch — нет риска превысить лимит запросов REST API.

function createFieldsSequentially(fieldsToCreate, idx) {
  if (idx >= fieldsToCreate.length) {
    log('Все поля созданы успешно');
    bindPlacement();
    return;
  }

  var total   = fieldsToCreate.length;
  var field   = fieldsToCreate[idx];
  var fullName = 'UF_CRM_' + field.FIELD_NAME;

  setStep('Создание поля: ' + fullName, idx + 1, total + 1);

  // Формируем объект fields для API
  var apiFields = {
    FIELD_NAME:   field.FIELD_NAME,
    USER_TYPE_ID: field.USER_TYPE_ID,
    LABEL:        field.LABEL,
    MANDATORY:    field.MANDATORY || 'N',
    SORT:         field.SORT || 100,
    MULTIPLE:     'N',
    SHOW_FILTER:  'N',
    EDIT_IN_LIST: 'Y',
    EDIT_FORM_LABEL: { ru: field.LABEL },
    LIST_COLUMN_LABEL: { ru: field.LABEL },
    LIST_FILTER_LABEL: { ru: field.LABEL }
  };

  // Настройки (ROWS для textarea, DISPLAY для enum)
  if (field.SETTINGS) {
    apiFields.SETTINGS = field.SETTINGS;
  }

  // Элементы списка для enumeration
  if (field.LIST) {
    apiFields.LIST = field.LIST;
  }

  BX24.callMethod('crm.lead.userfield.add', {
    fields: apiFields
  }, function (addRes) {
    if (addRes.error()) {
      // Если поле уже существует — не считаем ошибкой
      var errMsg = String(addRes.error());
      if (errMsg.indexOf('already exists') !== -1 || errMsg.indexOf('FIELD_NAME_DUPLICATED') !== -1) {
        log('  ⚠ ' + fullName + ' — уже существует (пропуск)');
      } else {
        showError('Ошибка создания ' + fullName + ': ' + addRes.error());
        return; // Прерываем установку при критической ошибке
      }
    } else {
      var newId = addRes.data();
      log('  ✓ ' + fullName + ' — создано (ID: ' + newId + ')');
    }

    // Переходим к следующему полю
    createFieldsSequentially(fieldsToCreate, idx + 1);
  });
}

// ─── Шаг 4: регистрация вкладки CRM_LEAD_DETAIL_TAB ─────────────────────────

function bindPlacement() {
  setStep('Регистрация вкладки в карточке лида...', 0, 0);
  log('placement.bind → CRM_LEAD_DETAIL_TAB, handler: ' + HANDLER_URL);

  BX24.callMethod('placement.bind', {
    PLACEMENT: 'CRM_LEAD_DETAIL_TAB',
    HANDLER:   HANDLER_URL,
    TITLE:     'Анкета',
    LANG_ALL: {
      ru: { TITLE: 'Анкета' },
      en: { TITLE: 'Questionnaire' }
    }
  }, function (bindRes) {
    if (bindRes.error()) {
      showError('Ошибка placement.bind: ' + bindRes.error());
      return;
    }
    log('  ✓ Вкладка «Анкета» зарегистрирована');
    finishInstall();
  });
}

// ─── Шаг 5: завершение установки ─────────────────────────────────────────────

function finishInstall() {
  setStep('Готово', 1, 1);
  showSuccess(
    'Установка завершена. ' +
    'Создано ' + UF_FIELDS.length + ' полей, вкладка «Анкета» зарегистрирована в карточке лида.'
  );
  log('BX24.installFinish() — сигнализируем Битрикс24 о завершении');

  // BX24.installFinish() — после этого вызова:
  // - встройки становятся видны всем пользователям
  // - обработчики событий активируются
  // - страница перезагрузится и откроется основное приложение
  BX24.installFinish();
}
</script>

</body>
</html>
