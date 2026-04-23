<?php
/**
 * index.php — основной iframe-виджет анкеты (МКЦ + МП)
 * Загружается Bitrix24 во вкладке карточки лида (CRM_LEAD_DETAIL_TAB)
 *
 * Frontend: Tailwind CSS 4 + Flowbite 2
 * Самописные CSS-файлы НЕ подключаются.
 *
 * Порядок блоков (синхронизирован с form.js):
 *   1. Персональные данные  (#personal-body)  — включает поле «Город» → TZ
 *   2. Финансовые данные   (#finance-body)
 *   3. Кредитная история   (#credit-body)
 *   4. Заметки менеджера  (#manager-body)
 *   5. Запись на встречу  (#booking-body)
 */

// Подключаем конфигурационный файл config.php из того же каталога.
// require_once гарантирует однократное подключение: если index.php вдруг включается дважды,
// константы из config.php не будут определены повторно (что вызвало бы Fatal Error).
// Из config.php берутся все нижеиспользуемые константы.
require_once __DIR__ . '/config.php';

// ── PHP-переменные для передачи в HTML/JS ─────────────────────────────────────
// Все переменные получаются из констант config.php и приводятся к нужным типам.
// Зачем PHP-переменные, а не прямая вставка констант?
// — В константах могут быть строки; явное приведение к типу защищает от XSS через JS.
// — Код читаемее: $salesDeptId очевиднее, чем (int)SALES_DEPT_ID в каждом месте использования.

// Хост портала для загрузки BX24 SDK — только хост, без схемы и пути.
// htmlspecialchars + ENT_QUOTES: защита от XSS при вставке в атрибут href тега <script>.
$portalHost  = htmlspecialchars(parse_url(PORTAL_URL, PHP_URL_HOST), ENT_QUOTES);

// ID отдела продаж в структуре компании Битрикс24.
// Используется в mp-config.js / calendar.js для выборки сотрудников отдела —
// только менеджеры из этого отдела отображаются в расписании.
// (int) — явное приведение к целому числу: исключает попадание строк/спецсимволов в JS.
$salesDeptId  = (int) SALES_DEPT_ID;

// ID шаблона бизнес-процесса Битрикс24.
// Запускается автоматически при сохранении анкеты (из app.js или form.js).
// Используется для автоматизации: уведомления, постановка задач и т.д.
$bpTemplateId = (int) BP_TEMPLATE_ID;

// Длительность одного слота записи в минутах (например, 30 или 60).
// Используется в calendar.js для разбивки рабочего времени МП на равные слоты.
$slotMin     = (int) SLOT_DURATION_MIN;

// Горизонт расписания: на сколько дней вперёд отображаются доступные слоты.
// Например, 14 — клиент может записаться в течение 2 ближайших недель.
// Используется в calendar.js при загрузке событий calendar.event.getlist.
$horizonDays = (int) SLOT_HORIZON_DAYS;

// Минимальное число свободных слотов в день для отображения дня в расписании.
// Если у МП меньше $minSlots свободных слотов за день — день не показывается.
// Предотвращает отображение дней с единственным свободным окном.
$minSlots    = (int) MIN_SLOTS_PER_DAY;

// Начало рабочего времени клиента (часов, 0–23).
// Слоты раньше этого часа не предлагаются — с учётом часового пояса клиента.
// Защищает от записи клиента из Владивостока на 7 утра по московскому времени.
$clientHrMin = (int) CLIENT_HOUR_MIN;

// Конец рабочего времени клиента (часов, 0–23).
// Слоты позже этого часа не предлагаются.
$clientHrMax = (int) CLIENT_HOUR_MAX;
?>
<!DOCTYPE html>
<!-- HTML5 DOCTYPE: обязателен для корректной работы Tailwind CSS и Flowbite. -->
<html lang="ru">
<!-- lang="ru": атрибут языка страницы — влияет на поведение браузерной проверки орфографии. -->
<head>
  <!-- UTF-8: универсальная кодировка, поддерживает кириллицу. Первый мета-тег в <head>. -->
  <meta charset="UTF-8">

  <!-- Адаптивный viewport: отключает автоматическое масштабирование на мобильных.
       initial-scale=1.0: начальный зум = 100%. -->
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!-- Заголовок вкладки — отображается в заголовке фрейма Битрикс24. -->
  <title>Анкета</title>

  <!--
    ════════════════════════════════════════════════════════════════════════
    === ROLLBACK START (legacy BX24 SDK load) ===
    Эти две строки подключали настоящий BX24 JS SDK из iframe-родителя Битрикс24.
    Они закомментированы на время разработки (данные берутся с вебхука).

    Чтобы вернуть работу в iframe Битрикс24:
      1. Раскомментируйте два тега <script> ниже.
      2. Удалите блок «=== NEW: WEBHOOK MODE ===» (скрипт webhook-client.js и
         установку window.APP_USE_WEBHOOK = true).
      3. Проверьте config.php → PORTAL_URL указывает на реальный портал.
    Подробности — ROLLBACK.md в корне репозитория.
    ════════════════════════════════════════════════════════════════════════
  -->
  <!--
  <script src="//api.bitrix24.tech/api/v1/"></script>
  <script src="//<?= $portalHost ?>/bitrix/js/rest/bx24/bx24.min.js"></script>
  -->
  <!-- === ROLLBACK END (legacy BX24 SDK load) === -->

  <!-- Tailwind CSS v4 CDN: браузерная версия, компилирует классы на лету.
       Используется для всей разметки: layout, цвета, типографика, отступы.
       Подключается до Flowbite, чтобы утилиты Tailwind не перекрывали компоненты. -->
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>

  <!-- Flowbite 2 CSS: компонентная библиотека поверх Tailwind.
       Используется для компонентов типа dropdown, tooltip, modal.
       CSS подключается в <head>, JS — в конце <body> (после HTML). -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/flowbite/2.3.0/flowbite.min.css" />

  <style>
    /*
     * Только iframe-специфичный сброс стилей.
     * НЕ заменяет Tailwind — только устраняет нежелательное поведение браузера
     * в контексте embed-виджета Битрикс24.
     */

    /* Убираем стандартные отступы браузера.
       В iframe Битрикс24 это критично: лишние 8px margin на body создают видимый сдвиг. */
    html, body { margin: 0; padding: 0; overflow: hidden; }

    /* Корневой элемент приложения занимает весь viewport iframe.
       overflow: hidden — предотвращает появление двойных скроллбаров (iframe + внутренний). */
    #app { height: 100vh; overflow: hidden; }

    /* Кастомный тонкий скроллбар для правой панели расписания.
       Стандартный скроллбар (17px) слишком широк для компактного интерфейса. */
    .panel-scroll { overflow-y: auto; }

    /* Ширина скроллбара: 4px вместо стандартных ~17px. */
    .panel-scroll::-webkit-scrollbar { width: 4px; }

    /* Трек скроллбара (фон полосы): прозрачный — не занимает визуальное место. */
    .panel-scroll::-webkit-scrollbar-track { background: transparent; }

    /* Ползунок скроллбара: светло-серый, скруглённые края — деликатный, ненавязчивый. */
    .panel-scroll::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 2px; }
  </style>

  <!-- ── Передача конфигурации из PHP в JavaScript ── -->
  <script>
    /**
     * window.APP_CONFIG — глобальный объект конфигурации приложения.
     * Устанавливается ОДИН РАЗ в PHP-файле при рендеринге страницы.
     * Все JS-скрипты (app.js, form.js, calendar.js и т.д.) читают параметры отсюда
     * через window.APP_CONFIG.propertyName.
     *
     * Зачем передавать через глобальный объект, а не через отдельные переменные?
     * — Единая точка конфигурации: все скрипты смотрят в одно место.
     * — Нет риска конфликтов имён с другими глобальными переменными.
     * — Удобно расширять: добавить новый параметр = одна строка в PHP и один доступ в JS.
     */
    window.APP_CONFIG = {
      /**
       * salesDeptId (number) — ID отдела продаж в структуре компании Битрикс24.
       * Используется в calendar.js и mp-config.js для получения списка менеджеров:
       * department.get({ ID: salesDeptId }) → список сотрудников отдела.
       * Только сотрудники этого отдела показываются в расписании для записи.
       */
      salesDeptId:   <?= $salesDeptId ?>,

      /**
       * bpTemplateId (number) — ID шаблона бизнес-процесса.
       * Используется в app.js при сохранении анкеты:
       * bizproc.workflow.start({ TEMPLATE_ID: bpTemplateId, ... })
       * Запускает автоматический БП для уведомлений, постановки задач и т.д.
       */
      bpTemplateId:  <?= $bpTemplateId ?>,

      /**
       * slotMin (number) — длительность одного слота в минутах.
       * Используется в calendar.js при построении сетки расписания:
       * рабочий день разбивается на равные отрезки длиной slotMin минут.
       * Например, slotMin=30 → 8:00, 8:30, 9:00, ...
       */
      slotMin:      <?= $slotMin ?>,

      /**
       * horizonDays (number) — горизонт расписания в днях.
       * Используется в calendar.js для ограничения запроса событий:
       * calendar.event.getlist({ DATE_FROM: today, DATE_TO: today + horizonDays })
       * Слоты показываются только в пределах следующих horizonDays дней от сегодня.
       */
      horizonDays:  <?= $horizonDays ?>,

      // Баг 11 fix: pollingMs удалён — startPolling() является no-op (пустая функция),
      // автообновление расписания отключено. Обновление только вручную (btn-refresh-slots).

      /**
       * minSlots (number) — минимальное число свободных слотов для отображения дня.
       * Используется в calendar.js при фильтрации дней расписания:
       * если у менеджера в конкретный день < minSlots свободных слотов — день скрыт.
       * Защищает от отображения дней с 1-2 случайными окнами, что неудобно для клиента.
       */
      minSlots:     <?= $minSlots ?>,

      /**
       * clientHrMin (number) — начало допустимого времени записи (час, 0–23).
       * Используется в calendar.js вместе с clientHrMax для фильтрации слотов:
       * слоты до clientHrMin часов (по местному времени клиента) не предлагаются.
       * Зачем: менеджер в Москве работает с 9:00 до 18:00, но клиент из Новосибирска
       * (UTC+7) не должен видеть 9:00 МСК = 13:00 по своему времени как «утреннее».
       */
      clientHrMin:  <?= $clientHrMin ?>,

      /**
       * clientHrMax (number) — конец допустимого времени записи (час, 0–23).
       * Слоты позже clientHrMax часов по местному времени клиента не предлагаются.
       * Часовой пояс клиента определяется из поля KC_CLIENT_CITY через cities.js.
       */
      clientHrMax:  <?= $clientHrMax ?>,

      /**
       * webhookUrl (string) — URL входящего вебхука Битрикс24.
       * Используется модулем webhook-client.js для запросов к REST API
       * в режиме разработки (вне iframe Битрикс24).
       * Значение берётся из константы WEBHOOK_URL в config.php.
       */
      webhookUrl: <?= json_encode(WEBHOOK_URL) ?>
    };
  </script>

  <!--
    ════════════════════════════════════════════════════════════════════════
    === NEW: WEBHOOK MODE ===
    Включает режим разработки: все вызовы идут через входящий вебхук,
    а не через BX24 JS SDK. Позволяет тестировать приложение вне iframe Битрикс24.

    Порядок работы:
      1. window.APP_USE_WEBHOOK = true — флаг включения shim-режима.
      2. webhook-client.js регистрирует window.BX24 (shim c тем же API, что SDK).
      3. Остальные скрипты (app.js, form.js, calendar.js) работают без изменений —
         они обращаются к window.BX24.callMethod/callBatch как обычно.

    Чтобы откатить к работе через оригинальный SDK — см. ROLLBACK.md.
    ════════════════════════════════════════════════════════════════════════
  -->
  <script>
    // Флаг включения режима вебхука. При true — webhook-client.js подменяет BX24.
    // При false — используется настоящий BX24 SDK (нужно вернуть <script> выше).
    window.APP_USE_WEBHOOK = true;
  </script>
  <script src="assets/webhook-client.js"></script>
  <!-- === END: WEBHOOK MODE === -->
</head>

<!-- bg-gray-100: очень светлый серый фон — чуть темнее, чем у install/uninstall (bg-gray-50).
     Создаёт визуальный контраст с белыми карточками форм.
     text-gray-800: основной цвет текста.
     text-sm: базовый размер шрифта 14px.
     antialiased: сглаживание шрифтов. -->
<body class="bg-gray-100 text-gray-800 text-sm antialiased">

<!-- ── Корневой контейнер приложения (#app) ──
     flex flex-col: вертикальная flexbox-колонка (шапка → рабочая зона).
     h-screen: высота = 100% видимой области окна (viewport height).
     Overflow hidden устанавливается в CSS (#app { overflow: hidden }),
     чтобы предотвратить двойной скроллбар фрейма. -->
<div id="app" class="flex flex-col h-screen">

  <!-- ════════════════════════════════════════════════════════════════════════
       ── Шапка (header) ──
       Фиксированная верхняя полоса с названием приложения, данными лида и пользователем.
       shrink-0: шапка не сжимается — всегда занимает фиксированную высоту.
       ════════════════════════════════════════════════════════════════════════ -->
  <header class="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-3 shrink-0">

    <!-- Название приложения: жирный текст «Анкета».
         tracking-tight: уменьшает межбуквенный интервал — компактнее для заголовка. -->
    <div class="font-bold text-gray-900 text-sm tracking-tight">Анкета</div>

    <!-- Вертикальный разделитель между названием и данными лида.
         w-px: ширина 1px. h-4: высота 16px. bg-gray-200: светло-серый. -->
    <div class="w-px h-4 bg-gray-200"></div>

    <!-- Название текущего лида из CRM.
         Обновляется JavaScript'ом (app.js) после загрузки данных через BX24.callMethod('crm.lead.get').
         truncate: длинный текст обрезается с «...» — не ломает layout шапки.
         Начальное значение «Лид — загрузка...» → меняется на реальное название. -->
    <div id="lead-title" class="text-xs text-gray-500 truncate">Лид — загрузка...</div>

    <!-- Информация о текущем пользователе — выровнена по правому краю.
         ml-auto: автоматический отступ слева — прижимает блок к правому краю.
         gap-2: отступ 8px между индикатором и именем. -->
    <div class="ml-auto flex items-center gap-2 text-xs text-gray-400">
      <!-- Зелёный кружок — визуальный индикатор активной сессии (пользователь онлайн).
           w-2 h-2: 8x8px. rounded-full: идеальная окружность. bg-emerald-400: зелёный. -->
      <span class="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>

      <!-- Имя текущего пользователя Битрикс24.
           Обновляется app.js через BX24.callMethod('user.current').
           truncate max-w-[160px]: обрезает длинные имена, не ломая layout шапки. -->
      <span id="bx24-user" class="truncate max-w-[160px]">...</span>
    </div>
  </header>

  <!-- ════════════════════════════════════════════════════════════════════════
       ── Рабочая зона ──
       Горизонтальный flex-контейнер: левая колонка (анкета) + правая (расписание).
       flex-1: занимает всё оставшееся пространство после шапки.
       overflow-hidden: скролл управляется внутри колонок, не на уровне рабочей зоны.
       ════════════════════════════════════════════════════════════════════════ -->
  <div class="flex flex-1 overflow-hidden">

    <!-- ════════════════════════════════════════════════════════════════════
         ══ Левая колонка: Форма анкеты (55% ширины) ══
         Содержит: прогресс-бар → статусы → форму с 5 блоками → футер с кнопками.
         style="width:55%": фиксированная ширина 55% — больше места для формы.
         min-width:300px: минимальная ширина для читаемости на узких экранах.
         flex-col: вертикальная компоновка (прогресс → форма → кнопки).
         border-r border-gray-200: правая граница — визуальный разделитель с правой колонкой.
         ════════════════════════════════════════════════════════════════════ -->
    <div class="flex flex-col border-r border-gray-200 bg-gray-50" style="width:55%;min-width:300px;">

      <!-- ── Прогресс-бар заполненности анкеты ──
           Показывает, сколько обязательных полей заполнено из общего числа.
           Обновляется form.js при каждом изменении значения поля.
           shrink-0: блок прогресса не сжимается при переполнении формы. -->
      <div class="bg-white border-b border-gray-100 px-4 py-2 shrink-0">

        <!-- Строка: подпись + метка времени последнего сохранения. -->
        <div class="flex items-center justify-between mb-1">
          <!-- Статичная подпись «Заполнено полей». -->
          <span class="text-xs font-semibold text-gray-700">Заполнено полей</span>

          <!-- last-saved: время последнего сохранения анкеты.
               Обновляется form.js / app.js после успешного crm.lead.update.
               Начальное значение «Не сохранено» → меняется на «Сохранено 12:34». -->
          <span id="last-saved" class="text-xs text-gray-400">Не сохранено</span>
        </div>

        <!-- Строка: полоса прогресса + числовой счётчик. -->
        <div class="flex items-center gap-3">
          <!-- Трек прогресс-бара: светло-серый фон, высота 6px. -->
          <div class="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <!-- progress-bar: синяя заполненная часть.
                 transition-all duration-300: плавная анимация.
                 Ширина обновляется form.js: element.style.width = filled/total*100 + '%'. -->
            <div id="progress-bar" class="h-full bg-blue-500 rounded-full transition-all duration-300" style="width:0%"></div>
          </div>

          <!-- progress-label: числовой счётчик «заполнено / всего».
               Например: «10 / 27». Обновляется синхронно с прогресс-баром.
               whitespace-nowrap: не переносится на новую строку. -->
          <span id="progress-label" class="text-xs text-gray-400 whitespace-nowrap">0 / 0</span>
        </div>
      </div>

      <!-- ── Блок статусных сообщений ──
           Содержит три взаимоисключающих состояния: загрузка, ошибка, успех.
           В каждый момент времени видно не более одного из них.
           shrink-0: блок статуса не сжимается и всегда видим над формой. -->
      <div class="px-4 pt-3 shrink-0">

        <!-- Индикатор загрузки (#loading): виден при первоначальной загрузке данных лида.
             Скрывается app.js после получения ответа от crm.lead.get.
             animate-spin: CSS-анимация вращения иконки спиннера (360° за 1с).
             SVG-иконка: стандартный кольцевой спиннер из Tailwind-документации. -->
        <div id="loading" class="flex items-center gap-2 text-gray-400 text-xs py-2">
          <svg aria-hidden="true" class="w-4 h-4 animate-spin text-gray-200 fill-blue-500" viewBox="0 0 100 101" fill="none"><path d="M100 50.6C100 78.2 77.6 100.6 50 100.6S0 78.2 0 50.6 22.4.6 50 .6s50 22.4 50 50z" fill="currentColor"/><path d="M93.97 39.04a4.28 4.28 0 0 1 2.69 5.4 50.04 50.04 0 0 1-12.44 21.54 4.28 4.28 0 0 1-6.05-6.05 41.48 41.48 0 0 0 10.31-17.85 4.28 4.28 0 0 1 5.49-3.04z" fill="currentFill"/></svg>
          <span>Загрузка данных лида...</span>
        </div>

        <!-- Блок ошибки (#error-msg): скрыт по умолчанию (hidden).
             Показывается app.js или form.js при ошибке API-запросов.
             role="alert": атрибут доступности — сообщает скринридерам об ошибке.
             bg-red-50 border border-red-200 text-red-800: стандартная красная палитра.
             Внутри: иконка предупреждения SVG + текст ошибки в span#error-text. -->
        <div id="error-msg" class="hidden items-center p-3 mb-3 text-sm text-red-800 rounded-lg bg-red-50 border border-red-200" role="alert">
          <svg class="shrink-0 inline w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"/></svg>
          <!-- error-text: текст ошибки вставляется через element.textContent = '...' в app.js / form.js.
               Отдельный span позволяет изменять только текст, не затрагивая иконку. -->
          <span id="error-text"></span>
        </div>

        <!-- Блок успеха (#success-msg): скрыт по умолчанию (hidden).
             Показывается app.js / form.js после успешного сохранения анкеты.
             bg-green-50 border border-green-200 text-green-800: зелёная палитра.
             Текст «Анкета сохранена и добавлена в таймлайн» — фиксированный (не меняется). -->
        <div id="success-msg" class="hidden items-center p-3 mb-3 text-sm text-green-800 rounded-lg bg-green-50 border border-green-200" role="alert">
          <svg class="shrink-0 w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
          <span>Анкета сохранена и добавлена в таймлайн.</span>
        </div>
      </div>

      <!-- ════════════════════════════════════════════════════════════════════
           ── Форма анкеты (#anketa-form) ──
           Скрыта (hidden) до загрузки данных лида из CRM.
           Показывается app.js после успешного crm.lead.get: form.classList.remove('hidden').
           novalidate: отключает встроенную браузерную валидацию HTML5 —
                       валидация осуществляется кастомно в form.js.
           flex-col flex-1 w-full: заполняет всё оставшееся вертикальное пространство.
           overflow-y-auto: вертикальный скролл для длинной формы.
           overflow-x-hidden: горизонтальный скролл отключён (форма не шире контейнера).
           ════════════════════════════════════════════════════════════════════ -->
      <form id="anketa-form" class="hidden flex-col flex-1 w-full overflow-y-auto overflow-x-hidden" novalidate>

        <!-- Внутренний wrapper с вертикальными отступами между блоками.
             flex flex-col gap-3: вертикальный флекс, отступы 12px между карточками блоков.
             px-4 py-3: горизонтальные 16px, вертикальные 12px от краёв колонки. -->
        <div class="flex flex-col gap-3 px-4 py-3 w-full">

          <!-- ──────────────────────────────────────────────────────────────
               Блок 1: Персональные данные
               Содержит поля: ФИО, Город (→ TZ), Место работы, Семейное положение,
               Дети, Совместное имущество, Судимости, ООО, ИП.
               #personal-body заполняется динамически скриптом form.js:
               он создаёт input/select элементы на основе конфигурации полей
               и устанавливает значения из данных лида (crm.lead.get).
               ────────────────────────────────────────────────────────────── -->
          <div class="bg-white border border-gray-200 rounded-lg shadow-sm">
            <!-- Заголовок блока: номер + название.
                 bg-gray-50: чуть серее белого фона карточки — визуально отделяет заголовок.
                 rounded-t-lg: скругление только верхних углов (нижние — у контента). -->
            <div class="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50 rounded-t-lg">
              <!-- Номер блока в синем кружке.
                   inline-flex items-center justify-center: центрирование цифры в кружке.
                   w-5 h-5: 20x20px. rounded-full: окружность. bg-blue-600: синий.
                   text-white text-[10px] font-bold: белая жирная цифра 10px. -->
              <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold shrink-0">1</span>
              <span class="text-xs font-semibold text-gray-700">Персональные</span>
            </div>
            <!-- personal-body: пустой контейнер. form.js заполняет его HTML-элементами полей.
                 flex flex-col gap-2: вертикальное расположение полей, отступ 8px.
                 text-xs: мелкий шрифт для компактности. -->
            <div id="personal-body" class="px-3 py-3 flex flex-col gap-2 text-xs"></div>
          </div>

          <!-- ──────────────────────────────────────────────────────────────
               Блок 2: Финансовые данные
               Содержит поля: Общий долг, Ежемесячный платёж, Официальный доход,
               Неофициальный доход, Зарплатная карта.
               #finance-body заполняется form.js аналогично personal-body.
               ────────────────────────────────────────────────────────────── -->
          <div class="bg-white border border-gray-200 rounded-lg shadow-sm">
            <div class="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50 rounded-t-lg">
              <!-- Цифра «2» — номер блока «Финансы». -->
              <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold shrink-0">2</span>
              <span class="text-xs font-semibold text-gray-700">Финансы</span>
            </div>
            <!-- finance-body: пустой контейнер для полей финансового блока. -->
            <div id="finance-body" class="px-3 py-3 flex flex-col gap-2 text-xs"></div>
          </div>

          <!-- ──────────────────────────────────────────────────────────────
               Блок 3: Кредитная история
               Содержит поля: Кредиторы, Залог, Просрочки, ФССП, Имущество, Сделки.
               #credit-body заполняется form.js.
               ────────────────────────────────────────────────────────────── -->
          <div class="bg-white border border-gray-200 rounded-lg shadow-sm">
            <div class="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50 rounded-t-lg">
              <!-- Цифра «3» — номер блока «Кредитная история». -->
              <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold shrink-0">3</span>
              <span class="text-xs font-semibold text-gray-700">Кредитная</span>
            </div>
            <!-- credit-body: пустой контейнер для полей блока кредитной истории. -->
            <div id="credit-body" class="px-3 py-3 flex flex-col gap-2 text-xs"></div>
          </div>

          <!-- ──────────────────────────────────────────────────────────────
               Блок 4: Заметки менеджера
               Содержит поля (textarea): Исключение из КМ, Основная боль,
               Возражения, Доп. комментарий.
               #manager-body заполняется form.js.
               ────────────────────────────────────────────────────────────── -->
          <div class="bg-white border border-gray-200 rounded-lg shadow-sm">
            <div class="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50 rounded-t-lg">
              <!-- Цифра «4» — номер блока «Заметки». -->
              <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold shrink-0">4</span>
              <span class="text-xs font-semibold text-gray-700">Заметки</span>
            </div>
            <!-- manager-body: пустой контейнер для полей блока заметок менеджера. -->
            <div id="manager-body" class="px-3 py-3 flex flex-col gap-2 text-xs"></div>
          </div>

          <!-- ──────────────────────────────────────────────────────────────
               Блок 5: Запись на встречу
               НЕ заполняется form.js напрямую — данные записи (менеджер, время, ID события)
               устанавливаются calendar.js при выборе слота в правой панели расписания.
               booking-body показывает подсказку «Выберите слот справа →» до выбора слота.
               После выбора слота calendar.js обновляет этот блок: показывает детали записи.
               bg-green-500 (а не bg-blue-600): зелёный кружок — «5» выделяет
               блок записи как особый (не анкетный) раздел.
               ────────────────────────────────────────────────────────────── -->
          <div class="bg-white border border-gray-200 rounded-lg shadow-sm">
            <div class="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50 rounded-t-lg">
              <!-- Цифра «5» в зелёном кружке — визуально отличает блок записи от анкетных блоков. -->
              <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500 text-white text-[10px] font-bold shrink-0">5</span>
              <span class="text-xs font-semibold text-gray-700">Запись</span>
            </div>

            <!-- booking-body: начальное состояние — подсказка со стрелкой вправо.
                 Иконка календаря SVG + текст «Выберите слот справа →».
                 calendar.js перезаписывает содержимое этого div после бронирования слота:
                 показывает имя МП, дату, время записи и кнопку отмены. -->
            <div id="booking-body" class="px-3 py-3 text-xs text-gray-400">
              <span class="inline-flex items-center gap-1.5">
                <!-- Иконка календаря: w-3.5 h-3.5 = 14x14px.
                     SVG path: стандартная иконка calendar из Heroicons. -->
                <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                Выберите слот справа →
              </span>
            </div>
          </div>

        </div><!-- /flex flex-col gap-3 — конец контейнера блоков -->
      </form><!-- /anketa-form -->

      <!-- ── Футер левой колонки: кнопки управления формой ──
           Всегда виден в нижней части левой колонки (shrink-0).
           Содержит: кнопка «Сохранить», кнопка «Сбросить», статус сохранения. -->
      <div class="bg-white border-t border-gray-200 px-4 py-2 flex items-center gap-2 shrink-0">

        <!-- Кнопка «Сохранить анкету» (#btn-save).
             type="submit" form="anketa-form": нажатие вызывает событие submit формы #anketa-form.
             Обработчик submit назначается в form.js: читает все поля → вызывает crm.lead.update.
             bg-blue-600 text-white: синяя кнопка — основное действие.
             focus:ring-2 focus:ring-blue-300: кольцо фокуса для клавиатурной навигации (доступность).
             inline-flex items-center gap-1.5: иконка + текст в одной строке. -->
        <button id="btn-save" type="submit" form="anketa-form"
                class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-300 transition-colors">
          <!-- Иконка галочки SVG (checkmark) — стандартная иконка «сохранить/применить». -->
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
          Сохранить анкету
        </button>

        <!-- Кнопка «Сбросить» (#btn-reset).
             type="button": НЕ вызывает submit формы — самостоятельная кнопка.
             Обработчик назначается в form.js: сбрасывает все поля формы к исходным значениям
             из CRM (перечитывает сохранённые данные лида без нового API-запроса).
             border border-gray-200 bg-white text-gray-600: нейтральная вторичная кнопка. -->
        <button id="btn-reset" type="button"
                class="inline-flex items-center px-4 py-2 rounded-lg border border-gray-200 bg-white text-xs text-gray-600 hover:bg-gray-50 transition-colors">
          Сбросить
        </button>

        <!-- save-status: динамическая строка статуса сохранения.
             ml-auto: выровнена по правому краю футера.
             Обновляется app.js / form.js: «Сохранение...» → «Сохранено в 12:34» → пусто.
             text-xs text-gray-400: мелкий светло-серый текст — второстепенная информация. -->
        <span id="save-status" class="ml-auto text-xs text-gray-400"></span>
      </div>

    </div>
    <!-- ════ Конец левой колонки (55%) ════ -->

    <!-- ════════════════════════════════════════════════════════════════════
         ══ Правая колонка: Расписание МП (45% ширины) ══
         Содержит: навигацию по дням, кнопку обновления, сетку слотов, статус бронирования.
         flex-1: занимает оставшиеся 45% ширины (после левой 55%).
         bg-gray-50: чуть светлее чем bg-gray-100 body — визуальное разграничение.
         ════════════════════════════════════════════════════════════════════ -->
    <div class="flex flex-col flex-1 bg-gray-50">

      <!-- Заголовок правой панели.
           bg-white border-b border-gray-200: белая полоса с нижней границей — аналог шапки.
           shrink-0: не сжимается. -->
      <div class="bg-white border-b border-gray-200 px-4 py-2 shrink-0 flex items-center gap-2">
        <!-- Иконка календаря (синяя) рядом с заголовком панели. -->
        <svg class="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
        <!-- Название правой панели. -->
        <span class="text-xs font-semibold text-gray-700">Расписание МП</span>
      </div>

      <!-- Прокручиваемый контент правой панели.
           flex-1: заполняет оставшуюся высоту колонки.
           panel-scroll: кастомный класс из <style> — тонкий скроллбар 4px. -->
      <div class="flex-1 panel-scroll">

        <!-- Внутренний wrapper с padding и отступами между секциями.
             p-3: внутренние отступы 12px.
             space-y-2: вертикальные отступы 8px между дочерними элементами. -->
        <div class="p-3 space-y-2">

          <!-- ── Навигация по дням + кнопка обновления ──
               Белая карточка с заголовком панели (кнопки Пред/Пред/дата и обновление).
               Управляется calendar.js. -->
          <div class="bg-white border border-gray-200 rounded-lg px-3 py-2">

            <!-- Строка навигации: кнопка «Пред. день» — дата — кнопка «След. день».
                 justify-between: кнопки по краям, дата по центру.
                 gap-2: отступ между элементами. -->
            <div class="flex items-center justify-between gap-2">

              <!-- Кнопка «Пред. день» (#btn-day-prev).
                   calendar.js назначает обработчик: уменьшает текущую дату на 1 день,
                   перерисовывает расписание для предыдущего дня.
                   Содержит иконку «стрелка влево» (chevron-left из Heroicons). -->
              <button id="btn-day-prev" type="button"
                      class="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-gray-200 text-xs text-gray-500 hover:bg-gray-100 transition-colors">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                Пред. день
              </button>

              <!-- schedule-date: отображает текущую дату расписания.
                   Обновляется calendar.js при навигации: element.textContent = 'Пн, 3 марта 2025'.
                   text-center: центрирование даты между кнопками. -->
              <div id="schedule-date" class="text-xs font-semibold text-gray-700 text-center"></div>

              <!-- Кнопка «След. день» (#btn-day-next).
                   calendar.js: увеличивает дату на 1 день, перерисовывает расписание.
                   Содержит иконку «стрелка вправо» (chevron-right из Heroicons). -->
              <button id="btn-day-next" type="button"
                      class="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-gray-200 text-xs text-gray-500 hover:bg-gray-100 transition-colors">
                След. день
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
              </button>
            </div>

            <!-- Кнопка ручного обновления расписания (#btn-refresh-slots).
                 Обработчик назначается инлайн-скриптом в конце файла (не calendar.js).
                 Зачем отдельная секция под кнопкой: разделитель border-t border-gray-100
                 визуально отделяет навигацию по дням от кнопки обновления.
                 mt-2 pt-2 border-t border-gray-100: отступ и тонкая линия-разделитель. -->
            <div class="mt-2 pt-2 border-t border-gray-100">
              <!-- btn-refresh-slots: при нажатии вызывает loadAllSlots() из calendar.js.
                   Значок обновления (SVG arrows): иконка «круговые стрелки» — refresh.
                   w-full justify-center: кнопка занимает всю ширину и центрирует содержимое.
                   hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200: синяя подсветка при наведении.
                   Анимация animate-spin добавляется инлайн-скриптом при нажатии и убирается по завершению.
                   btn.disabled = true при загрузке — предотвращает двойной клик. -->
              <button id="btn-refresh-slots" type="button"
                      class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-gray-200 bg-gray-50 text-xs text-gray-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors w-full justify-center">
                <!-- Иконка «две круговые стрелки» (arrows-clockwise / refresh из Heroicons). -->
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                Обновить расписание
              </button>
            </div>
          </div><!-- /навигация по дням -->

          <!-- Контейнер слотов расписания (#slots-panel).
               Заполняется calendar.js при загрузке или обновлении расписания.
               calendar.js создаёт внутри этого div кнопки-слоты для каждого доступного
               временного окна каждого менеджера.
               space-y-1: вертикальные отступы 4px между слотами. -->
          <div id="slots-panel" class="space-y-1"></div>

          <!-- Статус бронирования (#booking-status).
               Скрыт (hidden) по умолчанию.
               calendar.js показывает этот блок после успешного или неуспешного бронирования слота:
               выводит подтверждение: «Записано к [Имя МП] на [дата время]»
               или ошибку: «Слот уже занят, выберите другой». -->
          <div id="booking-status" class="hidden"></div>

        </div><!-- /p-3 wrapper -->
      </div><!-- /panel-scroll -->

    </div>
    <!-- ════ Конец правой колонки ════ -->

  </div><!-- /рабочая зона flex-1 -->
</div><!-- /#app -->

<!-- ══════════════════════════════════════════════════════════════════════════
     Подключение JavaScript-скриптов
     ПОРЯДОК КРИТИЧЕСКИ ВАЖЕН: каждый последующий скрипт зависит от предыдущих.
     ══════════════════════════════════════════════════════════════════════════ -->

<!-- Flowbite JS: инициализирует интерактивные компоненты (dropdown, tooltip, modal).
     Подключается ПЕРВЫМ из своих скриптов, так как Tailwind + HTML уже загружены.
     Должен быть до app.js и form.js, чтобы Flowbite-компоненты были готовы. -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/flowbite/2.3.0/flowbite.min.js"></script>

<!-- Баг 3 fix: cities.js и mp-config.js подключены перед остальными скриптами.
     cities.js и mp-config.js должны быть РАНЬШЕ app.js / form.js / calendar.js,
     потому что те сразу при загрузке могут обращаться к объектам, объявленным в этих файлах. -->

<!-- cities.js: справочник городов → часовые пояса (TZ).
     Экспортирует: объект CITY_TIMEZONES (или аналогичную структуру).
     Используется в calendar.js для перевода времени слотов в TZ клиента:
     при выборе города клиента (KC_CLIENT_CITY) находит его смещение UTC
     и пересчитывает время МП в местное время клиента. -->
<script src="assets/cities.js"></script>

<!-- mp-config.js: конфигурация менеджеров по продажам (МП).
     Экспортирует: список МП или функцию их загрузки (зависит от реализации).
     Используется в calendar.js для сопоставления ID пользователей Битрикс24
     с их отображаемыми именами и другими атрибутами в расписании. -->
<script src="assets/mp-config.js"></script>

<!-- app.js: точка входа приложения.
     Содержит: BX24.init() → placement.info (получение ID лида) →
     crm.lead.get (загрузка данных лида) → инициализация form.js, calendar.js.
     Зависит от: window.APP_CONFIG, BX24 SDK (уже загружен в <head>).
     После загрузки данных показывает форму (убирает #loading, убирает hidden с #anketa-form). -->
<script src="assets/app.js"></script>

<!-- form.js: логика работы формы анкеты.
     Содержит: построение HTML-полей по конфигурации UF_FIELDS (синхронно с install.php),
     заполнение полей данными из crm.lead.get, обработку submit-события формы,
     вызов crm.lead.update при сохранении, обновление прогресс-бара.
     Зависит от: app.js (должен быть инициализирован до form.js). -->
<script src="assets/form.js"></script>

<!-- calendar.js: логика расписания МП в правой панели.
     Содержит: загрузку событий calendar.event.getlist для сотрудников отдела,
     построение сетки слотов, обработку нажатия на слот (бронирование),
     создание событий calendar.event.add, сохранение KC_BOOKED_MANAGER / KC_BOOKED_TIME / KC_BOOKED_EVENT_ID.
     Экспортирует: loadAllSlots(), _onRenderComplete (колбэк завершения рендера).
     Зависит от: cities.js, mp-config.js, app.js (ID лида, данные пользователя). -->
<script src="assets/calendar.js"></script>

<!-- polling.js: модуль автообновления расписания.
     Содержит: функцию startPolling() — по Баг 11 fix является no-op (пустой функцией).
     Автоматическое периодическое обновление отключено: пользователь обновляет вручную
     кнопкой #btn-refresh-slots. Файл сохранён для обратной совместимости. -->
<script src="assets/polling.js"></script>

<!-- ══════════════════════════════════════════════════════════════════════════
     Инлайн-скрипт: обработчик кнопки «Обновить расписание» (#btn-refresh-slots)
     ══════════════════════════════════════════════════════════════════════════ -->
<script>
  // Баг 6 fix: кнопка разблокируется по завершении renderTable (через _onRenderComplete),
  // а не по фиксированному setTimeout — это гарантирует, что кнопка доступна только
  // после реального завершения рендера, а не через произвольный таймаут.

  // DOMContentLoaded: колбэк вызывается, когда DOM полностью разобран (без ожидания картинок/стилей).
  // Нужен здесь, потому что этот скрипт находится ПОСЛЕ HTML-элементов —
  // но добавляем слушатель внутри DOMContentLoaded для надёжности и единообразия.
  document.addEventListener('DOMContentLoaded', function () {
    // Получаем ссылку на кнопку обновления расписания.
    const btn = document.getElementById('btn-refresh-slots');

    // Если кнопка не найдена в DOM (теоретически не должно случиться) — выходим.
    if (btn) {
      // Навешиваем обработчик клика на кнопку.
      btn.addEventListener('click', function () {

        // Проверяем, что loadAllSlots — это функция (экспортируется calendar.js).
        // Если calendar.js ещё не загружен или не экспортировал функцию — ничего не делаем.
        if (typeof loadAllSlots !== 'function') return;

        // Получаем SVG-иконку внутри кнопки (первый дочерний svg-элемент).
        const icon = btn.querySelector('svg');

        // Запускаем анимацию вращения иконки (animate-spin — Tailwind-утилита).
        // Визуальный индикатор: «идёт загрузка расписания».
        if (icon) icon.classList.add('animate-spin');

        // Блокируем кнопку, чтобы пользователь не мог нажать повторно во время загрузки.
        // btn.disabled = true → кнопка становится неактивной (серой), клики игнорируются.
        btn.disabled = true;

        // Устанавливаем колбэк _onRenderComplete — глобальная переменная из calendar.js.
        // calendar.js вызывает _onRenderComplete() в конце функции renderTable(),
        // когда таблица слотов полностью отрисована.
        // Это более надёжно, чем setTimeout(fn, N) — не зависит от скорости загрузки данных.
        if (typeof _onRenderComplete !== 'undefined') {
          _onRenderComplete = function () {
            // Разблокируем кнопку — расписание отрисовано, можно обновлять снова.
            btn.disabled = false;
            // Останавливаем анимацию иконки — удаляем класс animate-spin.
            if (icon) icon.classList.remove('animate-spin');
          };
        }

        // Запускаем загрузку и перерисовку слотов расписания.
        // loadAllSlots() — экспортируется calendar.js: запрашивает события через
        // BX24.callMethod('calendar.event.getlist', ...) для всех МП отдела,
        // строит свободные слоты и вставляет их в #slots-panel.
        loadAllSlots();
      });
    }
  });
</script>

</body>
</html>
