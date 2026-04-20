<?php
/**
 * uninstall.php — деинсталлятор локального приложения «Анкета (МКЦ + МП)»
 *
 * Вызывается Битрикс24 при удалении приложения администратором.
 * Показывает экран подтверждения с двумя вариантами:
 *   — Удалить приложение + удалить все UF_CRM_KC_* поля (данные будут потеряны!)
 *   — Удалить приложение, но сохранить поля (данные остаются в лидах)
 *
 * Порядок работы:
 *   1. BX24.init()
 *   2. Показать экран подтверждения
 *   3. placement.unbind → отвязать CRM_LEAD_DETAIL_TAB
 *   4. (опционально) crm.lead.userfield.list → найти KC_* поля по FIELD_NAME
 *   5. (опционально) crm.lead.userfield.delete × N → удалить каждое поле по ID
 *   6. BX24.installFinish() → сигнализировать Битрикс24 о завершении удаления
 */
require_once __DIR__ . '/config.php';

$portalHost = htmlspecialchars(parse_url(PORTAL_URL, PHP_URL_HOST), ENT_QUOTES);
$handlerUrl = rtrim(PORTAL_URL, '/') . '/anketa-kc/index.php';
?>
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Удаление — Анкета (МКЦ + МП)</title>

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
  <h1 class="text-lg font-bold text-gray-900 mb-1">Удаление приложения «Анкета»</h1>
  <p class="text-xs text-gray-500 mb-6">Отвязка вкладки из карточки лида и (опционально) удаление пользовательских полей.</p>

  <!-- Экран подтверждения -->
  <div id="confirm-block" class="space-y-4">
    <div class="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
      <strong>Внимание!</strong> Удаление полей уничтожит все данные анкет во всех лидах без возможности восстановления.
    </div>

    <div class="flex gap-3">
      <button id="btn-delete-all"
        class="flex-1 px-4 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors cursor-pointer">
        Удалить приложение и поля
      </button>
      <button id="btn-keep-fields"
        class="flex-1 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors cursor-pointer">
        Удалить, сохранить поля
      </button>
    </div>
  </div>

  <!-- Прогресс (скрыт до начала удаления) -->
  <div id="progress-block" class="hidden">
    <div class="mb-4">
      <div class="flex items-center justify-between mb-1">
        <span id="step-label" class="text-xs font-medium text-gray-600">Подготовка...</span>
        <span id="step-counter" class="text-xs text-gray-400"></span>
      </div>
      <div class="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <div id="progress-bar" class="h-full bg-red-500 rounded-full transition-all duration-300" style="width:0%"></div>
      </div>
    </div>

    <!-- Лог -->
    <div id="log" class="bg-white border border-gray-200 rounded-lg p-3 text-xs text-gray-600 space-y-1 max-h-72 overflow-y-auto font-mono"></div>
  </div>

  <!-- Ошибка -->
  <div id="error-block" class="hidden mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800"></div>

  <!-- Успех -->
  <div id="success-block" class="hidden mt-4 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800"></div>

</div>

<script>
'use strict';

// ─── Конфиг: URL обработчика виджета (из PHP) ────────────────────────────────
var HANDLER_URL = <?= json_encode($handlerUrl, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?>;

// Префикс наших UF-полей — по нему фильтруем при удалении
var UF_PREFIX = 'UF_CRM_KC_';

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

function showProgress() {
  document.getElementById('confirm-block').classList.add('hidden');
  document.getElementById('progress-block').classList.remove('hidden');
}

// ─── Инициализация ────────────────────────────────────────────────────────────

var deleteFields = false; // флаг: удалять ли UF-поля

BX24.init(function () {
  log('BX24.init — SDK готов');

  // Кнопка «Удалить приложение и поля»
  document.getElementById('btn-delete-all').addEventListener('click', function () {
    deleteFields = true;
    showProgress();
    log('Выбрано: удалить приложение + удалить все UF_CRM_KC_* поля');
    startUninstall();
  });

  // Кнопка «Удалить, сохранить поля»
  document.getElementById('btn-keep-fields').addEventListener('click', function () {
    deleteFields = false;
    showProgress();
    log('Выбрано: удалить приложение, сохранить поля');
    startUninstall();
  });
});

// ─── Шаг 1: отвязать placement ────────────────────────────────────────────────

function startUninstall() {
  setStep('Отвязка вкладки из карточки лида...', 0, 0);

  BX24.callMethod('placement.unbind', {
    PLACEMENT: 'CRM_LEAD_DETAIL_TAB',
    HANDLER:   HANDLER_URL
  }, function (unbindRes) {
    if (unbindRes.error()) {
      // Если placement уже отвязан — не считаем ошибкой
      var errMsg = String(unbindRes.error());
      if (errMsg.indexOf('NOT_FOUND') !== -1) {
        log('  ⚠ Вкладка уже была отвязана (пропуск)');
      } else {
        showError('Ошибка placement.unbind: ' + unbindRes.error());
        return;
      }
    } else {
      var count = unbindRes.data() && unbindRes.data().count ? unbindRes.data().count : 0;
      log('  ✓ Вкладка «Анкета» отвязана (удалено обработчиков: ' + count + ')');
    }

    if (deleteFields) {
      loadFieldsForDeletion();
    } else {
      finishUninstall();
    }
  });
}

// ─── Шаг 2: загрузить список UF-полей для удаления ──────────────────────────

function loadFieldsForDeletion() {
  setStep('Загрузка списка UF-полей для удаления...', 0, 0);

  BX24.callMethod('crm.lead.userfield.list', {
    order: { SORT: 'ASC' }
  }, function (listRes) {
    if (listRes.error()) {
      showError('Ошибка crm.lead.userfield.list: ' + listRes.error());
      return;
    }

    // Фильтруем: оставляем только наши KC_* поля
    var kcFields = [];
    var data = listRes.data() || [];
    for (var i = 0; i < data.length; i++) {
      if (data[i].FIELD_NAME && data[i].FIELD_NAME.indexOf(UF_PREFIX) === 0) {
        kcFields.push({
          ID:         data[i].ID,
          FIELD_NAME: data[i].FIELD_NAME
        });
      }
    }

    // Обработка пагинации: если есть next(), подгружаем остальные
    // На практике UF-полей лида обычно < 50 (одна страница)
    if (listRes.more()) {
      listRes.next();
    }

    if (kcFields.length === 0) {
      log('Поля UF_CRM_KC_* не найдены — нечего удалять');
      finishUninstall();
      return;
    }

    log('Найдено полей KC_* для удаления: ' + kcFields.length);
    deleteFieldsSequentially(kcFields, 0);
  });
}

// ─── Шаг 3: последовательное удаление полей ─────────────────────────────────

function deleteFieldsSequentially(fields, idx) {
  if (idx >= fields.length) {
    log('Все поля удалены');
    finishUninstall();
    return;
  }

  var total = fields.length;
  var field = fields[idx];

  setStep('Удаление поля: ' + field.FIELD_NAME, idx + 1, total);

  BX24.callMethod('crm.lead.userfield.delete', {
    id: field.ID
  }, function (delRes) {
    if (delRes.error()) {
      var errMsg = String(delRes.error());
      // Поле уже удалено или не найдено — пропускаем
      if (errMsg.indexOf('not found') !== -1 || errMsg.indexOf('NOT_FOUND') !== -1) {
        log('  ⚠ ' + field.FIELD_NAME + ' (ID: ' + field.ID + ') — не найдено (пропуск)');
      } else {
        showError('Ошибка удаления ' + field.FIELD_NAME + ' (ID: ' + field.ID + '): ' + delRes.error());
        return; // Прерываем при критической ошибке
      }
    } else {
      log('  ✓ ' + field.FIELD_NAME + ' (ID: ' + field.ID + ') — удалено');
    }

    // Переходим к следующему полю
    deleteFieldsSequentially(fields, idx + 1);
  });
}

// ─── Шаг 4: завершение удаления ─────────────────────────────────────────────

function finishUninstall() {
  setStep('Готово', 1, 1);

  var msg = deleteFields
    ? 'Удаление завершено. Вкладка отвязана, все поля UF_CRM_KC_* удалены.'
    : 'Удаление завершено. Вкладка отвязана, поля сохранены в лидах.';

  showSuccess(msg);
  log('BX24.installFinish() — сигнализируем Битрикс24 о завершении удаления');

  // BX24.installFinish() используется и при удалении —
  // сигнализирует платформе, что процесс деинсталляции завершён
  BX24.installFinish();
}
</script>

</body>
</html>
