<?php
/**
 * index.php — основной iframe-виджет анкеты КЦ
 * Загружается Bitrix24 в таб карточки лида (CRM_LEAD_DETAIL_TAB)
 *
 * Frontend: Tailwind CSS 4 + Flowbite 2
 * Кастомные CSS-файлы (tokens.css, style.css) не используются.
 */
require_once __DIR__ . '/config.php';
?>
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Анкета КЦ</title>

  <!-- BX24 JS SDK -->
  <script src="https://<?= htmlspecialchars(parse_url(PORTAL_URL, PHP_URL_HOST)) ?>/bitrix/js/rest/bx24.js"></script>

  <!-- Tailwind CSS 4 CDN -->
  <script src="https://cdn.tailwindcss.com"></script>

  <!-- Flowbite CSS -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/flowbite/2.3.0/flowbite.min.css" />

  <style>
    /* Минимальный reset для Bitrix24 iframe-контекста */
    html, body { margin: 0; padding: 0; overflow: hidden; }
    #app { height: 100vh; overflow: hidden; }
    .panel-scroll { overflow-y: auto; }
    /* Кастомный скроллбар */
    .panel-scroll::-webkit-scrollbar { width: 4px; }
    .panel-scroll::-webkit-scrollbar-track { background: transparent; }
    .panel-scroll::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 2px; }
  </style>
</head>
<body class="bg-gray-100 text-gray-800 text-sm antialiased">

<div id="app" class="flex flex-col h-screen">

  <!-- ───── Шапка ───── -->
  <header class="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-3 shrink-0">
    <div class="font-bold text-gray-900 text-sm tracking-tight">
      Анкета<span class="text-blue-600">КЦ</span>
    </div>
    <div class="w-px h-4 bg-gray-200"></div>
    <div id="lead-title" class="text-xs text-gray-500 truncate">
      Лид — загрузка...
    </div>
    <div class="ml-auto flex items-center gap-2 text-xs text-gray-400">
      <span class="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
      <span id="bx24-user" class="truncate max-w-[140px]">Bitrix24</span>
    </div>
  </header>

  <!-- ───── Рабочая зона: левая + правая колонка ───── -->
  <div class="flex flex-1 overflow-hidden">

    <!-- ════ Левая колонка: Анкета ════ -->
    <div class="flex flex-col border-r border-gray-200 bg-gray-50" style="width:55%; min-width:300px;">

      <!-- Прогресс-бар -->
      <div class="bg-white border-b border-gray-100 px-4 py-2 shrink-0">
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs font-semibold text-gray-700">Заполнение анкеты</span>
          <span id="last-saved" class="text-xs text-gray-400">Не сохранено</span>
        </div>
        <div class="flex items-center gap-3">
          <div class="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div id="progress-bar" class="h-full bg-blue-500 rounded-full transition-all duration-300" style="width:0%"></div>
          </div>
          <span id="progress-label" class="text-xs text-gray-400 whitespace-nowrap">0 / 0</span>
        </div>
      </div>

      <!-- Состояния -->
      <div class="px-4 pt-3 shrink-0">
        <!-- Загрузка -->
        <div id="loading" class="flex items-center gap-2 text-gray-400 text-xs py-2">
          <div role="status">
            <svg aria-hidden="true" class="w-4 h-4 text-gray-200 animate-spin fill-blue-500" viewBox="0 0 100 101" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M100 50.6C100 78.2 77.6 100.6 50 100.6S0 78.2 0 50.6 22.4.6 50 .6s50 22.4 50 50z" fill="currentColor"/>
              <path d="M93.97 39.04a4.28 4.28 0 0 1 2.69 5.4 50.04 50.04 0 0 1-12.44 21.54 4.28 4.28 0 0 1-6.05-6.05 41.48 41.48 0 0 0 10.31-17.85 4.28 4.28 0 0 1 5.49-3.04z" fill="currentFill"/>
            </svg>
          </div>
          <span>Загрузка данных лида...</span>
        </div>
        <!-- Ошибка -->
        <div id="error-msg" class="hidden flex items-center p-3 mb-3 text-sm text-red-800 rounded-lg bg-red-50 border border-red-200" role="alert">
          <svg class="shrink-0 inline w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"/></svg>
          <span id="error-text"></span>
        </div>
        <!-- Успех -->
        <div id="success-msg" class="hidden flex items-center p-3 mb-3 text-sm text-green-800 rounded-lg bg-green-50 border border-green-200" role="alert">
          <svg class="shrink-0 w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
          <span>Анкета сохранена и добавлена в таймлайн.</span>
        </div>
      </div>

      <!-- Форма (скрыта до загрузки) -->
      <form id="anketa-form" class="hidden flex-1 panel-scroll px-4 pb-4 space-y-3" novalidate>

        <!-- Блок 1: Финансовые данные -->
        <div class="bg-white border border-gray-200 rounded-lg shadow-sm" id="section-finance">
          <button type="button" class="w-full flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50 rounded-t-lg"
                  data-collapse-toggle="finance-body">
            <span class="flex items-center gap-2 text-xs font-semibold text-gray-700">
              <span class="w-5 h-5 rounded bg-blue-50 flex items-center justify-center text-blue-500 text-sm">₽</span>
              1. Финансовые данные
            </span>
            <svg class="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
          <div id="finance-body" class="px-3 py-3 grid grid-cols-2 gap-2 text-xs">
            <!-- Поля генерирует form.js -->
          </div>
        </div>

        <!-- Блок 2: Кредитная история -->
        <div class="bg-white border border-gray-200 rounded-lg shadow-sm" id="section-credit">
          <button type="button" class="w-full flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50 rounded-t-lg"
                  data-collapse-toggle="credit-body">
            <span class="flex items-center gap-2 text-xs font-semibold text-gray-700">
              <span class="w-5 h-5 rounded bg-yellow-50 flex items-center justify-center text-yellow-500 text-sm">📋</span>
              2. Кредитная история
            </span>
            <svg class="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
          <div id="credit-body" class="px-3 py-3 grid grid-cols-2 gap-2 text-xs"></div>
        </div>

        <!-- Блок 3: Личные данные -->
        <div class="bg-white border border-gray-200 rounded-lg shadow-sm" id="section-personal">
          <button type="button" class="w-full flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50 rounded-t-lg"
                  data-collapse-toggle="personal-body">
            <span class="flex items-center gap-2 text-xs font-semibold text-gray-700">
              <span class="w-5 h-5 rounded bg-purple-50 flex items-center justify-center text-purple-500 text-sm">👤</span>
              3. Личные данные
            </span>
            <svg class="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
          <div id="personal-body" class="px-3 py-3 grid grid-cols-2 gap-2 text-xs"></div>
        </div>

        <!-- Блок 4: Заметки менеджера -->
        <div class="bg-white border border-gray-200 rounded-lg shadow-sm" id="section-manager">
          <button type="button" class="w-full flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50 rounded-t-lg"
                  data-collapse-toggle="manager-body">
            <span class="flex items-center gap-2 text-xs font-semibold text-gray-700">
              <span class="w-5 h-5 rounded bg-green-50 flex items-center justify-center text-green-500 text-sm">✏️</span>
              4. Заметки менеджера
            </span>
            <svg class="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
          <div id="manager-body" class="px-3 py-3 grid grid-cols-1 gap-2 text-xs"></div>
        </div>

        <!-- Блок 5: Запись к специалисту -->
        <div class="bg-white border border-gray-200 rounded-lg shadow-sm" id="section-booking">
          <div class="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50 rounded-t-lg">
            <span class="flex items-center gap-2 text-xs font-semibold text-gray-700">
              <span class="w-5 h-5 rounded bg-orange-50 flex items-center justify-center text-orange-500 text-sm">📅</span>
              5. Запись к специалисту
            </span>
          </div>
          <div id="manager-slots" class="px-3 py-3 text-xs text-gray-400">
            Загрузка расписания...
          </div>
        </div>

      </form>

      <!-- ─ Футер действий ─ -->
      <div class="bg-white border-t border-gray-200 px-4 py-2 flex items-center gap-2 shrink-0">
        <button id="btn-save" type="submit" form="anketa-form"
                class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-300 transition-colors">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
          Сохранить анкету
        </button>
        <button id="btn-reset" type="button"
                class="inline-flex items-center px-4 py-2 rounded-lg border border-gray-200 bg-white text-xs text-gray-600 hover:bg-gray-50 transition-colors">
          Сбросить
        </button>
        <div class="ml-auto">
          <span id="save-status" class="text-xs text-gray-400"></span>
        </div>
      </div>

    </div>
    <!-- ════ Конец левой колонки ════ -->

    <!-- ════ Правая колонка: Расписание + будущие инструменты ════ -->
    <div class="flex flex-col flex-1 bg-gray-50">

      <!-- Табы правой панели (Flowbite Tabs) -->
      <div class="bg-white border-b border-gray-200 px-3 pt-2 shrink-0">
        <ul class="flex text-xs font-medium text-center" id="right-tabs" role="tablist">
          <li class="mr-1" role="presentation">
            <button class="inline-flex items-center gap-1.5 px-3 py-2 rounded-t-lg border-b-2 border-blue-600 text-blue-600 bg-gray-50"
                    id="tab-schedule-btn" data-tabs-target="#tab-schedule" type="button" role="tab"
                    aria-controls="tab-schedule" aria-selected="true">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              Расписание
            </button>
          </li>
          <li role="presentation">
            <button class="inline-flex items-center gap-1.5 px-3 py-2 rounded-t-lg border-b-2 border-transparent text-gray-400 hover:text-gray-600"
                    id="tab-future-btn" data-tabs-target="#tab-future" type="button" role="tab"
                    aria-controls="tab-future" aria-selected="false">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
              Фишки <span class="ml-1 text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">скоро</span>
            </button>
          </li>
        </ul>
      </div>

      <!-- Контент табов -->
      <div id="right-tab-content" class="flex-1 panel-scroll">

        <!-- Таб: Расписание -->
        <div id="tab-schedule" role="tabpanel" aria-labelledby="tab-schedule-btn"
             class="p-3 space-y-3">

          <!-- Заголовок дня -->
          <div class="flex items-center justify-between">
            <div>
              <div id="schedule-date" class="text-xs font-semibold text-gray-800"></div>
              <div id="schedule-free" class="text-xs text-gray-400"></div>
            </div>
            <button id="btn-refresh-slots" type="button"
                    class="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-gray-200 text-xs text-gray-500 hover:bg-gray-100 transition-colors">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              Обновить
            </button>
          </div>

          <!-- Список менеджеров со слотами -->
          <div id="manager-slots-panel" class="space-y-3">
            <div class="flex items-center gap-2 text-xs text-gray-400">
              <div role="status">
                <svg aria-hidden="true" class="w-4 h-4 text-gray-200 animate-spin fill-blue-500" viewBox="0 0 100 101" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M100 50.6C100 78.2 77.6 100.6 50 100.6S0 78.2 0 50.6 22.4.6 50 .6s50 22.4 50 50z" fill="currentColor"/>
                  <path d="M93.97 39.04a4.28 4.28 0 0 1 2.69 5.4 50.04 50.04 0 0 1-12.44 21.54 4.28 4.28 0 0 1-6.05-6.05 41.48 41.48 0 0 0 10.31-17.85 4.28 4.28 0 0 1 5.49-3.04z" fill="currentFill"/>
                </svg>
              </div>
              <span>Загрузка расписания...</span>
            </div>
          </div>

        </div>

        <!-- Таб: Фишки -->
        <div id="tab-future" role="tabpanel" aria-labelledby="tab-future-btn"
             class="hidden p-3">
          <div class="border border-dashed border-gray-300 rounded-lg p-6 text-center">
            <svg class="w-8 h-8 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
            <p class="text-xs text-gray-400">Здесь появятся дополнительные инструменты:<br>скоринг, документы, история изменений, подсказки.</p>
          </div>
        </div>

      </div>
    </div>
    <!-- ════ Конец правой колонки ════ -->

  </div>
  <!-- Конец рабочей зоны -->

</div>
<!-- Конец #app -->

<!-- Flowbite JS -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/flowbite/2.3.0/flowbite.min.js"></script>

<!-- Логика приложения -->
<script src="assets/app.js"></script>
<script src="assets/form.js"></script>
<script src="assets/calendar.js"></script>
<script src="assets/polling.js"></script>

</body>
</html>
