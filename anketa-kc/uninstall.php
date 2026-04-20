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

// Подключаем конфигурационный файл config.php из того же каталога (__DIR__).
// require_once — файл подключается ровно один раз, повторные вызовы игнорируются.
// Из config.php берутся константы: PORTAL_URL, SALES_DEPT_ID, BP_TEMPLATE_ID и др.
require_once __DIR__ . '/config.php';

// Извлекаем только хост из PORTAL_URL (например, «mycompany.bitrix24.ru»).
// parse_url(..., PHP_URL_HOST) — стандартная PHP-функция, возвращает хост без схемы и пути.
// htmlspecialchars(..., ENT_QUOTES) — экранирует < > & ' " для безопасной вставки в HTML-атрибут,
// защищая от XSS, если константа содержит спецсимволы.
$portalHost = htmlspecialchars(parse_url(PORTAL_URL, PHP_URL_HOST), ENT_QUOTES);

// Формируем URL обработчика виджета — адрес index.php, который использовался при установке.
// Он нужен для placement.unbind: Битрикс24 ищет placement именно по HANDLER + PLACEMENT.
// rtrim(PORTAL_URL, '/') — убирает завершающий слеш, чтобы не было двойного //.
$handlerUrl = rtrim(PORTAL_URL, '/') . '/anketa-kc/index.php';
?>
<!DOCTYPE html>
<!-- HTML5 doctype: необходим для корректного рендеринга в современных браузерах. -->
<html lang="ru">
<!-- lang="ru": сообщает браузеру и поисковику, что страница на русском языке. -->
<head>
  <!-- UTF-8: кодировка, поддерживающая кириллицу. Должна стоять первым мета-тегом в <head>. -->
  <meta charset="UTF-8">

  <!-- Адаптивный viewport: width=device-width — ширина = ширина экрана устройства.
       initial-scale=1.0 — начальный масштаб 100%.
       Обеспечивает корректное отображение Tailwind-утилит на любых устройствах. -->
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!-- Заголовок вкладки браузера — виден в заголовке фрейма Битрикс24. -->
  <title>Удаление — Анкета (МКЦ + МП)</title>

  <!-- BX24 JS SDK: обязательная клиентская библиотека Битрикс24.
       Загружается с сервера портала клиента (не CDN!) — это требование платформы:
       библиотека связана с токенами текущей сессии пользователя.
       $portalHost — PHP-переменная с хостом портала. -->
  <script src="https://<?= $portalHost ?>/bitrix/js/rest/bx24.js"></script>

  <!-- Tailwind CSS v4 CDN: браузерная сборка утилитарного CSS-фреймворка.
       Версия @tailwindcss/browser@4 компилирует классы на лету в браузере.
       Единый стек с install.php и index.php — единообразный визуальный стиль. -->
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>

  <style>
    /* Сброс стандартных отступов браузера для html и body.
       По умолчанию браузеры добавляют 8px margin на body.
       Обнуляем, чтобы контент занимал всю ширину фрейма Битрикс24 без белых полос. */
    html, body { margin: 0; padding: 0; }
  </style>
</head>

<!-- bg-gray-50: светло-серый фон — единый стиль с остальными страницами приложения.
     text-gray-800: основной цвет текста — тёмно-серый.
     text-sm: базовый размер шрифта 14px.
     antialiased: сглаживание шрифтов для лучшей читаемости. -->
<body class="bg-gray-50 text-gray-800 text-sm antialiased">

<!-- Центральный контейнер.
     max-w-xl: максимальная ширина 576px — контент не растягивается на широких экранах.
     mx-auto: центрирование по горизонтали через автоматические поля.
     px-6 py-8: горизонтальные отступы 24px, вертикальные 32px. -->
<div class="max-w-xl mx-auto px-6 py-8">

  <!-- ── Заголовок страницы удаления ── -->

  <!-- text-lg font-bold: крупный жирный заголовок (18px).
       text-gray-900: почти чёрный цвет — максимальная читаемость.
       mb-1: небольшой нижний отступ перед подзаголовком. -->
  <h1 class="text-lg font-bold text-gray-900 mb-1">Удаление приложения «Анкета»</h1>

  <!-- Подзаголовок объясняет администратору, что именно будет происходить:
       отвязка вкладки из карточки лида и опциональное удаление UF-полей.
       text-xs text-gray-500: мелкий серый вспомогательный текст.
       mb-6: нижний отступ 24px перед блоком подтверждения. -->
  <p class="text-xs text-gray-500 mb-6">Отвязка вкладки из карточки лида и (опционально) удаление пользовательских полей.</p>

  <!-- ── Экран подтверждения (#confirm-block) ──
       Изначально ВИДЕН — первое, что видит администратор.
       Скрывается функцией showProgress() при нажатии любой кнопки.
       space-y-4: вертикальный отступ 16px между дочерними элементами. -->
  <div id="confirm-block" class="space-y-4">

    <!-- Блок предупреждения об опасности удаления данных.
         p-3 rounded-lg: отступы 12px, скруглённые углы.
         bg-amber-50 border border-amber-200 text-amber-800: янтарная (жёлто-оранжевая) палитра —
         стандартное обозначение предупреждения (WARNING), но не критической ошибки.
         Текст жирным (<strong>) акцентирует внимание на ключевом риске: необратимость удаления данных. -->
    <div class="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
      <strong>Внимание!</strong> Удаление полей уничтожит все данные анкет во всех лидах без возможности восстановления.
    </div>

    <!-- Строка с двумя кнопками выбора действия.
         flex gap-3: горизонтальное расположение с отступом 12px между кнопками. -->
    <div class="flex gap-3">

      <!-- Кнопка 1: «Удалить приложение и поля» — ОПАСНОЕ действие.
           При нажатии: устанавливает флаг deleteFields=true, запускает процесс удаления.
           Красный цвет (bg-red-600 hover:bg-red-700) — стандартное обозначение деструктивного действия.
           flex-1: кнопка занимает равную долю ширины строки (50%).
           Результат: placement отвязывается + все UF_CRM_KC_* поля и их данные удаляются. -->
      <button id="btn-delete-all"
        class="flex-1 px-4 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors cursor-pointer">
        Удалить приложение и поля
      </button>

      <!-- Кнопка 2: «Удалить, сохранить поля» — БЕЗОПАСНОЕ действие.
           При нажатии: устанавливает флаг deleteFields=false, запускает процесс удаления.
           Синий цвет (bg-blue-600 hover:bg-blue-700) — стандартное «основное действие».
           Результат: placement отвязывается, но UF_CRM_KC_* поля остаются в CRM.
           Данные анкет в лидах сохраняются — их можно будет просмотреть через список лидов. -->
      <button id="btn-keep-fields"
        class="flex-1 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors cursor-pointer">
        Удалить, сохранить поля
      </button>
    </div>
  </div>

  <!-- ── Блок прогресса (#progress-block) ──
       Скрыт (hidden) до нажатия одной из кнопок подтверждения.
       Показывается функцией showProgress(): убирает 'hidden' и скрывает confirm-block. -->
  <div id="progress-block" class="hidden">
    <div class="mb-4">
      <!-- Строка с названием шага и счётчиком. -->
      <div class="flex items-center justify-between mb-1">
        <!-- step-label: текстовое название текущего шага удаления.
             Начальное значение «Подготовка...» → меняется функцией setStep(). -->
        <span id="step-label" class="text-xs font-medium text-gray-600">Подготовка...</span>

        <!-- step-counter: счётчик шагов «N / M».
             Пустой до первого вызова setStep() с ненулевым total. -->
        <span id="step-counter" class="text-xs text-gray-400"></span>
      </div>

      <!-- Трек прогресс-бара: светло-серый фон, высота 8px, скруглённые углы. -->
      <div class="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <!-- progress-bar: заполненная часть прогресс-бара.
             bg-red-500: красный цвет — визуально подчёркивает, что идёт деструктивная операция.
             transition-all duration-300: плавная CSS-анимация при изменении ширины.
             Начальное значение width:0% → растёт до 100% к концу удаления. -->
        <div id="progress-bar" class="h-full bg-red-500 rounded-full transition-all duration-300" style="width:0%"></div>
      </div>
    </div>

    <!-- Блок лога (консоль удаления).
         Каждое событие добавляется функцией log(msg).
         bg-white border border-gray-200 rounded-lg: белая карточка с рамкой.
         p-3: внутренние отступы 12px.
         text-xs text-gray-600: мелкий серый текст.
         space-y-1: вертикальный отступ 4px между строками.
         max-h-72: максимальная высота 288px, при переполнении — вертикальная прокрутка.
         font-mono: моноширинный шрифт — стандарт консольного вывода. -->
    <div id="log" class="bg-white border border-gray-200 rounded-lg p-3 text-xs text-gray-600 space-y-1 max-h-72 overflow-y-auto font-mono"></div>
  </div>

  <!-- Блок ошибки — скрыт по умолчанию.
       Показывается функцией showError(): убирает 'hidden', вставляет текст ошибки.
       Красная цветовая палитра: bg-red-50 border border-red-200 text-red-800. -->
  <div id="error-block" class="hidden mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800"></div>

  <!-- Блок успеха — скрыт по умолчанию.
       Показывается функцией showSuccess() в конце finishUninstall().
       Зелёная палитра: bg-green-50 border border-green-200 text-green-800. -->
  <div id="success-block" class="hidden mt-4 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800"></div>

</div>

<script>
// Строгий режим JavaScript: запрещает необъявленные переменные,
// устаревший синтаксис, неявный глобальный контекст.
'use strict';

// ─── Конфиг: URL обработчика виджета (из PHP) ────────────────────────────────
// HANDLER_URL передаётся из PHP в JavaScript через json_encode.
// JSON_UNESCAPED_UNICODE — кириллица не экранируется в \uXXXX.
// JSON_UNESCAPED_SLASHES — слеши не экранируются в \/.
// Используется в placement.unbind для указания, какой именно обработчик отвязать.
var HANDLER_URL = <?= json_encode($handlerUrl, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?>;

// UF_PREFIX — префикс имён наших пользовательских полей.
// Используется для фильтрации полей при поиске: мы удаляем ТОЛЬКО поля,
// чьё FIELD_NAME начинается с 'UF_CRM_KC_'.
// Это защищает от случайного удаления других пользовательских полей лида.
var UF_PREFIX = 'UF_CRM_KC_';

// ─── UI-хелперы ──────────────────────────────────────────────────────────────
// Набор функций для обновления интерфейса без дублирования логики.

/**
 * log(msg) — добавляет строку в блок лога (#log).
 * Вызывается на каждом шаге, чтобы администратор видел происходящее в реальном времени.
 *
 * @param {string} msg — текст строки лога.
 */
function log(msg) {
  // Получаем DOM-элемент блока лога.
  var el = document.getElementById('log');
  // Если элемент не найден (DOM не готов или id изменился) — выходим без ошибки.
  if (!el) return;
  // Создаём новый div для одной строки лога.
  var line = document.createElement('div');
  // textContent (не innerHTML) — безопасная вставка текста без интерпретации HTML-тегов.
  line.textContent = msg;
  // Добавляем строку в конец блока.
  el.appendChild(line);
  // Автоматически прокручиваем лог к последней строке.
  // scrollTop = scrollHeight — эквивалентно нажатию Ctrl+End в текстовом редакторе.
  el.scrollTop = el.scrollHeight;
}

/**
 * setStep(label, current, total) — обновляет прогресс-бар и счётчик.
 * Вызывается перед каждым API-запросом для визуального отображения прогресса.
 *
 * @param {string} label   — название текущего шага.
 * @param {number} current — номер текущего шага (1-based).
 * @param {number} total   — всего шагов. Если 0/falsy — счётчик скрыт, ширина бара не меняется.
 */
function setStep(label, current, total) {
  var stepLabel   = document.getElementById('step-label');   // Текст текущего шага
  var stepCounter = document.getElementById('step-counter'); // Счётчик «N / M»
  var bar         = document.getElementById('progress-bar'); // Полоса прогресса

  // Обновляем текстовый заголовок шага.
  if (stepLabel)   stepLabel.textContent   = label;

  // Обновляем счётчик: «current / total» или пусто, если total не задан.
  if (stepCounter) stepCounter.textContent = total ? (current + ' / ' + total) : '';

  // Вычисляем процент и обновляем ширину полосы.
  // Math.round — целое число пикселей, без дробей.
  if (bar && total) bar.style.width = Math.round((current / total) * 100) + '%';
}

/**
 * showError(msg) — показывает красный блок ошибки и дублирует сообщение в лог.
 * После вызова выполнение цепочки удаления прерывается (функции возвращают управление).
 *
 * @param {string} msg — текст ошибки.
 */
function showError(msg) {
  var el = document.getElementById('error-block');
  if (el) {
    el.textContent = msg;           // Устанавливаем текст ошибки
    el.classList.remove('hidden');  // Делаем блок видимым
  }
  // Дублируем в лог с визуальным префиксом «ОШИБКА:» для быстрого поиска в записях.
  log('ОШИБКА: ' + msg);
}

/**
 * showSuccess(msg) — показывает зелёный блок успеха и пишет в лог.
 * Вызывается в конце finishUninstall() после успешного завершения всех шагов.
 *
 * @param {string} msg — итоговое сообщение.
 */
function showSuccess(msg) {
  var el = document.getElementById('success-block');
  if (el) {
    el.textContent = msg;           // Устанавливаем текст успеха
    el.classList.remove('hidden');  // Делаем блок видимым
  }
  // Дублируем в лог — последняя строка консоли = финальный результат.
  log(msg);
}

/**
 * showProgress() — переключает экраны: скрывает форму подтверждения и показывает блок прогресса.
 * Вызывается сразу при нажатии любой из двух кнопок подтверждения.
 * После этого пользователь уже не может отменить действие — процесс необратим.
 */
function showProgress() {
  // Скрываем блок подтверждения — администратор больше не может изменить решение.
  document.getElementById('confirm-block').classList.add('hidden');
  // Показываем блок прогресса с прогресс-баром и логом.
  document.getElementById('progress-block').classList.remove('hidden');
}

// ─── Инициализация SDK и привязка кнопок ─────────────────────────────────────

// Флаг: определяет, нужно ли удалять UF-поля после отвязки placement.
// Устанавливается обработчиками кнопок ПЕРЕД вызовом startUninstall().
// true  → нажата кнопка «Удалить приложение и поля» → поля будут удалены.
// false → нажата кнопка «Удалить, сохранить поля» → поля останутся в CRM.
var deleteFields = false;

/**
 * BX24.init(callback) — инициализация SDK Битрикс24.
 * Callback вызывается, когда SDK загружен, токены получены, iframe готов к работе.
 * Навешиваем обработчики кнопок ВНУТРИ BX24.init(), чтобы к моменту их нажатия
 * SDK точно был готов к API-вызовам.
 */
BX24.init(function () {
  // Лог: SDK проинициализирован и готов к работе.
  log('BX24.init — SDK готов');

  // ── Кнопка «Удалить приложение и поля» ────────────────────────────────────
  // При нажатии: устанавливает флаг deleteFields=true,
  // переключает интерфейс на экран прогресса и запускает цепочку удаления.
  document.getElementById('btn-delete-all').addEventListener('click', function () {
    deleteFields = true; // Флаг: после отвязки placement удалять UF-поля
    showProgress();      // Скрыть подтверждение, показать прогресс и лог
    log('Выбрано: удалить приложение + удалить все UF_CRM_KC_* поля');
    startUninstall();    // Запуск цепочки удаления
  });

  // ── Кнопка «Удалить, сохранить поля» ──────────────────────────────────────
  // При нажатии: устанавливает флаг deleteFields=false (поля не удалять),
  // переключает интерфейс и запускает ту же цепочку удаления.
  // Отличие от кнопки выше: после отвязки placement сразу вызывается finishUninstall(),
  // без загрузки и удаления полей.
  document.getElementById('btn-keep-fields').addEventListener('click', function () {
    deleteFields = false; // Флаг: поля НЕ удалять — они останутся в CRM
    showProgress();
    log('Выбрано: удалить приложение, сохранить поля');
    startUninstall();
  });
});

// ─── Шаг 1: отвязать placement ────────────────────────────────────────────────
// Зачем: вкладка «Анкета» должна исчезнуть из карточки лида сразу после удаления приложения.
// placement.unbind удаляет регистрацию обработчика для конкретного placement и handler URL.

function startUninstall() {
  setStep('Отвязка вкладки из карточки лида...', 0, 0); // Прогресс без счётчика

  BX24.callMethod(
    'placement.unbind', // Метод REST API: удаляет регистрацию встройки приложения
    {
      PLACEMENT: 'CRM_LEAD_DETAIL_TAB', // Точка встройки: вкладка в карточке лида CRM
      HANDLER:   HANDLER_URL            // URL обработчика, который нужно отвязать
      // Комбинация PLACEMENT + HANDLER однозначно идентифицирует конкретную встройку
    },
    function (unbindRes) {
      if (unbindRes.error()) {
        // Анализируем ошибку: NOT_FOUND — placement уже был отвязан ранее.
        // Это не критично, продолжаем процесс удаления.
        var errMsg = String(unbindRes.error());
        if (errMsg.indexOf('NOT_FOUND') !== -1) {
          log('  ⚠ Вкладка уже была отвязана (пропуск)');
        } else {
          // Неизвестная ошибка — критическая, останавливаем процесс.
          showError('Ошибка placement.unbind: ' + unbindRes.error());
          return; // Прерываем выполнение — дальнейшие шаги не выполняются
        }
      } else {
        // Успешная отвязка: unbindRes.data().count — количество удалённых обработчиков.
        // Обычно count = 1, если приложение было установлено один раз.
        var count = unbindRes.data() && unbindRes.data().count ? unbindRes.data().count : 0;
        log('  ✓ Вкладка «Анкета» отвязана (удалено обработчиков: ' + count + ')');
      }

      // Выбор следующего шага зависит от флага deleteFields.
      if (deleteFields) {
        // Пользователь выбрал «Удалить поля» → переходим к загрузке полей для удаления.
        loadFieldsForDeletion();
      } else {
        // Пользователь выбрал «Сохранить поля» → сразу завершаем удаление.
        finishUninstall();
      }
    }
  );
}

// ─── Шаг 2: загрузить список UF-полей для удаления ──────────────────────────
// Вызывается только если deleteFields === true.
// Зачем: нам нужны числовые ID полей для вызова crm.lead.userfield.delete,
// потому что этот API принимает именно ID (числовой), а не FIELD_NAME (строку).

function loadFieldsForDeletion() {
  setStep('Загрузка списка UF-полей для удаления...', 0, 0);

  BX24.callMethod(
    'crm.lead.userfield.list', // Метод REST API: возвращает все UF-поля лида
    {
      order: { SORT: 'ASC' }   // Сортировка по возрастанию SORT — предсказуемый порядок
    },
    function (listRes) {
      if (listRes.error()) {
        showError('Ошибка crm.lead.userfield.list: ' + listRes.error());
        return;
      }

      // Фильтруем поля: оставляем только те, чьё FIELD_NAME начинается с UF_PREFIX ('UF_CRM_KC_').
      // Это гарантирует, что мы не удалим чужие пользовательские поля лида.
      var kcFields = [];
      // listRes.data() — массив объектов. Каждый объект: { ID, FIELD_NAME, USER_TYPE_ID, ... }
      var data = listRes.data() || []; // || [] — защита от null при пустом результате
      for (var i = 0; i < data.length; i++) {
        // indexOf(UF_PREFIX) === 0 — строка начинается с UF_PREFIX.
        // Это точный фильтр: поля UF_CRM_KC_FULLNAME, UF_CRM_KC_DEBT_TOTAL и т.д.
        // Поля без нашего префикса (например, UF_CRM_1_MYFIELD) пропускаются.
        if (data[i].FIELD_NAME && data[i].FIELD_NAME.indexOf(UF_PREFIX) === 0) {
          kcFields.push({
            ID:         data[i].ID,         // Числовой ID для crm.lead.userfield.delete
            FIELD_NAME: data[i].FIELD_NAME  // Имя — для отображения в логе
          });
        }
      }

      // Обработка пагинации: если полей > 50, дозагружаем следующую страницу.
      // На практике UF-полей лида обычно < 50 (одна страница, более() === false).
      if (listRes.more()) {
        listRes.next(); // Запрашиваем следующую страницу (колбэк вызовется повторно)
      }

      if (kcFields.length === 0) {
        // Наших полей не найдено — нечего удалять, сразу завершаем.
        log('Поля UF_CRM_KC_* не найдены — нечего удалять');
        finishUninstall();
        return;
      }

      log('Найдено полей KC_* для удаления: ' + kcFields.length);
      // Запускаем последовательное удаление, начиная с индекса 0.
      deleteFieldsSequentially(kcFields, 0);
    }
  );
}

// ─── Шаг 3: последовательное удаление полей ─────────────────────────────────
// Аналогично createFieldsSequentially в install.php — рекурсивная цепочка колбэков.
// Удаляем поля по одному, а не параллельно:
//   — Прогресс-бар обновляется после каждого поля.
//   — Нет риска превысить лимит REST API.
//   — При ошибке точно знаем, какое поле не удалилось.

/**
 * deleteFieldsSequentially(fields, idx) — рекурсивная функция удаления полей.
 * Удаляет поле с индексом idx, затем вызывает себя для idx+1.
 *
 * @param {Array}  fields — массив объектов { ID, FIELD_NAME } полей KC_*.
 * @param {number} idx    — текущий индекс (0-based).
 */
function deleteFieldsSequentially(fields, idx) {
  // Базовый случай: все поля обработаны → завершаем удаление.
  if (idx >= fields.length) {
    log('Все поля удалены');
    finishUninstall();
    return;
  }

  var total = fields.length;  // Всего полей для удаления
  var field = fields[idx];    // Текущий объект поля: { ID, FIELD_NAME }

  // Обновляем прогресс-бар.
  setStep('Удаление поля: ' + field.FIELD_NAME, idx + 1, total);

  BX24.callMethod(
    'crm.lead.userfield.delete', // Метод REST API: удаляет UF-поле лида по его числовому ID
    {
      id: field.ID               // Числовой ID поля (получен из crm.lead.userfield.list)
    },
    function (delRes) {
      if (delRes.error()) {
        var errMsg = String(delRes.error());
        // «not found» / «NOT_FOUND» — поле уже было удалено ранее (например, вручную из CRM).
        // Это не критично — пропускаем с предупреждением.
        if (errMsg.indexOf('not found') !== -1 || errMsg.indexOf('NOT_FOUND') !== -1) {
          log('  ⚠ ' + field.FIELD_NAME + ' (ID: ' + field.ID + ') — не найдено (пропуск)');
        } else {
          // Неизвестная ошибка — прерываем процесс, показываем ошибку.
          showError('Ошибка удаления ' + field.FIELD_NAME + ' (ID: ' + field.ID + '): ' + delRes.error());
          return; // Прерываем рекурсию — последующие поля не удаляются
        }
      } else {
        // Успешное удаление: логируем имя поля и ID для подтверждения.
        log('  ✓ ' + field.FIELD_NAME + ' (ID: ' + field.ID + ') — удалено');
      }

      // Рекурсивный вызов: переходим к следующему полю в очереди.
      deleteFieldsSequentially(fields, idx + 1);
    }
  );
}

// ─── Шаг 4: завершение удаления ─────────────────────────────────────────────
// Финальный шаг: сигнализируем Битрикс24 о завершении процесса деинсталляции.

function finishUninstall() {
  // Прогресс-бар = 100%.
  setStep('Готово', 1, 1);

  // Формируем итоговое сообщение в зависимости от выбора пользователя.
  // Тернарный оператор: если deleteFields=true — сообщаем об удалении полей,
  // если false — о сохранении.
  var msg = deleteFields
    ? 'Удаление завершено. Вкладка отвязана, все поля UF_CRM_KC_* удалены.'
    : 'Удаление завершено. Вкладка отвязана, поля сохранены в лидах.';

  // Показываем итоговое сообщение в зелёном блоке.
  showSuccess(msg);
  log('BX24.installFinish() — сигнализируем Битрикс24 о завершении удаления');

  /**
   * BX24.installFinish() при удалении приложения.
   *
   * Несмотря на название «installFinish», этот метод используется И при удалении:
   * он является единым сигналом Битрикс24 о том, что произвольный процесс
   * установки/удаления завершён. Платформа ожидает этого вызова, чтобы:
   *
   *   1. Зафиксировать факт завершения процесса деинсталляции.
   *   2. Обновить статус приложения в административном интерфейсе Битрикс24.
   *   3. Закрыть диалог удаления и вернуть администратора на страницу приложений.
   *
   * Без вызова installFinish() Битрикс24 будет считать, что удаление не завершено,
   * и страница uninstall.php останется открытой без автоматического перехода.
   */
  BX24.installFinish();
}
</script>

</body>
</html>
