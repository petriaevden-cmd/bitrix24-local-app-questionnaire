/**
 * calendar.js — расписание МП (табличный вид)
 *
 * Вид: строки = МП (только короткое название, без имени сотрудника),
 *      столбцы = часовые слоты дня.
 * Логика занятости, TZ, автопереход — без изменений.
 *
 * Словарь МП берётся из MP_CONFIG (mp-config.js).
 * Словарь городов берётся из CITIES_TZ (cities.js).
 */

'use strict';

/**
 * Строим MP_CALENDARS из MP_CONFIG (mp-config.js) динамически.
 * Формат MP_CONFIG: { id: { bitrixUserId, name, city, workStart, workEnd, workDays, slotMinutes, active } }
 * calId соответствует ключу «MPnVstrechi» — строим по bitrixUserId.
 */
function buildMpCalendars() {
  if (typeof MP_CONFIG === 'undefined') return {};
  const result = {};
  Object.keys(MP_CONFIG).forEach(function (id) {
    const mp = MP_CONFIG[id];
    if (!mp.active) return;
    const utc = (typeof getCityTZ === 'function')
      ? (getCityTZ(mp.city) || 0)
      : 0;
    const calId = 'MP' + mp.bitrixUserId + 'Vstrechi';
    const startH = parseInt((mp.workStart || '09:00').split(':')[0], 10);
    const endH   = parseInt((mp.workEnd   || '18:00').split(':')[0], 10);
    result[calId] = {
      label: mp.name,
      short: 'МП ' + mp.bitrixUserId,
      utc:   utc,
      from:  startH,
      to:    endH
    };
  });
  return result;
}

// Инициализируется при первом вызове initCalendar()
let MP_CALENDARS = null;

/**
 * Возвращает UTC-смещение города.
 * Использует CITIES_TZ из cities.js (если подключён), иначе fallback — пустой объект.
 */
function _getCityTz(cityName) {
  if (typeof getCityTZ === 'function') return getCityTZ(cityName);
  if (typeof CITIES_TZ !== 'undefined' && CITIES_TZ[cityName] !== undefined) return CITIES_TZ[cityName];
  return null;
}

// ── Состояние ────────────────────────────────────────────────────────────────
let _currentDay    = null;
let _clientUtc     = null;
let _autoJumpCount = 0;
const MAX_AUTO_JUMP = 14;

let _busyCache   = {};
let _loadedCount = 0;
let _totalToLoad = 0;

// Флаг: идёт ли сейчас бронирование (защита от двойного клика)
let _bookingInProgress = false;

// ── Инициализация ────────────────────────────────────────────────────────────
function initCalendar() {
  // Баг 4 fix: строим MP_CALENDARS из MP_CONFIG один раз при инициализации
  MP_CALENDARS = buildMpCalendars();

  _currentDay = nextWorkday(new Date());

  const btnPrev = document.getElementById('btn-day-prev');
  const btnNext = document.getElementById('btn-day-next');
  if (btnPrev) btnPrev.addEventListener('click', function () { shiftDay(-1); });
  if (btnNext) btnNext.addEventListener('click', function () { shiftDay(+1); });

  // Баг 2 fix: initCalendar вызывает loadAllSlots только один раз.
  // _clientUtc уже установлен через setClientCity() в app.js до вызова initCalendar.
  loadAllSlots();
}

// ── Утилиты дат ──────────────────────────────────────────────────────────────
function nextWorkday(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  while (dt.getDay() === 0 || dt.getDay() === 6) dt.setDate(dt.getDate() + 1);
  return dt;
}

function shiftDay(delta) {
  if (!_currentDay) return;
  const dt = new Date(_currentDay);
  dt.setDate(dt.getDate() + delta);
  while (dt.getDay() === 0 || dt.getDay() === 6) {
    dt.setDate(dt.getDate() + (delta > 0 ? 1 : -1));
  }
  _currentDay    = dt;
  _autoJumpCount = 0;
  loadAllSlots();
}

function fmtHour(utcMs, offsetH) {
  const local = new Date(utcMs + offsetH * 3600000);
  return String(local.getUTCHours()).padStart(2, '0') + ':' +
         String(local.getUTCMinutes()).padStart(2, '0');
}

function fmtDate(d) {
  return d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
}

function fmtBxUTC(utcMs) {
  const d = new Date(utcMs);
  const p = function (n) { return String(n).padStart(2, '0'); };
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) +
    'T' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':00+00:00';
}

function getClientUtcFromForm() {
  const el = document.getElementById('f-UF_CRM_KC_CLIENT_CITY');
  if (!el || !el.value) return null;
  // Баг 3/7 fix: используем _getCityTz(), которая читает полный CITIES_TZ из cities.js
  const tz = _getCityTz(el.value.trim());
  return (tz !== null && tz !== undefined) ? tz : null;
}

// ── Загрузка всех МП за день ─────────────────────────────────────────────────
function loadAllSlots() {
  _clientUtc   = getClientUtcFromForm();
  _busyCache   = {};
  _loadedCount = 0;
  _totalToLoad = Object.keys(MP_CALENDARS || {}).length;

  const dateEl = document.getElementById('schedule-date');
  if (dateEl) dateEl.textContent = fmtDate(_currentDay);

  showTableLoading();

  const pad    = function (n) { return String(n).padStart(2, '0'); };
  const fmtISO = function (d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  };

  const dayStart = new Date(_currentDay);
  const dayEnd   = new Date(_currentDay);
  dayEnd.setDate(dayEnd.getDate() + 1);

  Object.keys(MP_CALENDARS || {}).forEach(function (calId) {
    BX24.callMethod('calendar.accessibility.get', {
      from: fmtISO(dayStart),
      to:   fmtISO(dayEnd),
      type: 'calendar',
      ids:  [calId]
    }, function (result) {
      if (!result.error()) {
        _busyCache[calId] = (result.data() || []).filter(function (ev) {
          return ev.ACCESSIBILITY === 'busy' || ev.ACCESSIBILITY === 'absent';
        });
      } else {
        _busyCache[calId] = [];
      }
      _loadedCount++;
      if (_loadedCount === _totalToLoad) renderTable();
    });
  });
}

// ── Генерация свободных слотов для одного МП ─────────────────────────────────
function buildFreeSlots(mp, day, busy) {
  const cfg       = window.APP_CONFIG || {};
  const slotMs    = (cfg.slotMin    || 60) * 60000;
  const clientMin = cfg.clientHrMin || 9;
  const clientMax = cfg.clientHrMax || 20;
  const now       = Date.now();
  const slots     = [];

  for (let h = mp.from; h < mp.to; h++) {
    const slotUtcMs    = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), h - mp.utc, 0, 0, 0);
    const slotEndUtcMs = slotUtcMs + slotMs;
    if (slotEndUtcMs <= now) continue;
    if (_clientUtc !== null) {
      const clientHour = new Date(slotUtcMs + _clientUtc * 3600000).getUTCHours();
      if (clientHour < clientMin || clientHour >= clientMax) continue;
    }
    const isBusy = busy.some(function (ev) {
      const evFrom = new Date(ev.DATE_FROM).getTime();
      const evTo   = new Date(ev.DATE_TO).getTime();
      return slotUtcMs < evTo && slotEndUtcMs > evFrom;
    });
    if (isBusy) continue;
    slots.push({ utcMs: slotUtcMs, endUtcMs: slotEndUtcMs, mpUtc: mp.utc });
  }
  return slots;
}

// ── Сбор всех уникальных UTC-слотов для заголовка таблицы ───────────────────
// Заголовок колонки = время клиента (UTC клиента).
// Если город клиента неизвестен — показываем UTC.
// Кнопка в строке МП = время конкретного МП (рендерится в renderTable).
function collectAllHours(slotsMap) {
  const utcSet = {}; // utcMs → true, для дедупликации
  Object.keys(slotsMap).forEach(function (calId) {
    (slotsMap[calId] || []).forEach(function (slot) {
      utcSet[slot.utcMs] = true;
    });
  });
  return Object.keys(utcSet)
    .map(function (k) { return parseInt(k, 10); })
    .sort(function (a, b) { return a - b; })
    .map(function (utcMs) {
      // Заголовок = время клиента; если TZ клиента неизвестен — UTC
      const displayOffset = (_clientUtc !== null) ? _clientUtc : 0;
      const label = fmtHour(utcMs, displayOffset);
      return { utcMs: utcMs, label: label };
    });
}

// ── Рендер таблицы ────────────────────────────────────────────────────────────
// Баг 6 fix: колбэк для разблокировки кнопки «Обновить расписание» после рендера.
let _onRenderComplete = null;

function renderTable() {
  const panel = document.getElementById('slots-panel');
  if (!panel) return;

  const slotsMap = {};
  let totalFree  = 0;
  Object.keys(MP_CALENDARS || {}).forEach(function (calId) {
    const mp    = MP_CALENDARS[calId];
    const busy  = _busyCache[calId] || [];
    const slots = buildFreeSlots(mp, _currentDay, busy);
    slotsMap[calId] = slots;
    totalFree += slots.length;
  });

  const cfg      = window.APP_CONFIG || {};
  const minSlots = cfg.minSlots || 3;
  if (totalFree < minSlots && _autoJumpCount < MAX_AUTO_JUMP) {
    _autoJumpCount++;
    const nextDay = new Date(_currentDay);
    nextDay.setDate(nextDay.getDate() + 1);
    _currentDay = nextWorkday(nextDay);
    const dateEl = document.getElementById('schedule-date');
    if (dateEl) dateEl.textContent = fmtDate(_currentDay);
    loadAllSlots();
    return;
  }
  _autoJumpCount = 0;

  const dateEl = document.getElementById('schedule-date');
  if (dateEl) dateEl.textContent = fmtDate(_currentDay);

  if (totalFree === 0) {
    panel.innerHTML =
      '<p class="text-xs text-gray-400 text-center py-8">' +
      'Нет свободных слотов в ближайшие ' + MAX_AUTO_JUMP + ' рабочих дней</p>';
    return;
  }

  const allHours    = collectAllHours(slotsMap);
  const hasClientTz = _clientUtc !== null;

  const wrap = document.createElement('div');
  wrap.className = 'overflow-x-auto';

  const table = document.createElement('table');
  table.className = 'w-full text-xs border-collapse';

  // ── THEAD ─────────────────────────────────────────────────────────────────
  // Строка 1: время клиента (синиее) — или UTC если город не указан.
  // Кнопка в строке МП показывает время этого МП.
  const thead  = document.createElement('thead');

  // Подпись над таблицей: поясняем логику двух времён
  const trCaption = document.createElement('tr');
  const thCaption = document.createElement('th');
  thCaption.colSpan = allHours.length + 1;
  thCaption.className = 'px-3 pt-2 pb-1 text-left border-b border-gray-100 bg-gray-50';
  thCaption.innerHTML = hasClientTz
    ? '<span class="text-[11px] text-gray-500">' +
      '<span class="inline-block w-2.5 h-2.5 rounded-sm bg-blue-100 border border-blue-300 align-middle mr-1"></span>' +
      'Заголовок колонки — <strong class="text-blue-600">время клиента</strong> (UTC+' + _clientUtc + ')' +
      '&ensp;·&ensp;' +
      '<span class="inline-block w-2.5 h-2.5 rounded-sm bg-green-50 border border-green-300 align-middle mr-1"></span>' +
      'Кнопка в строке — <strong class="text-green-700">время МП</strong>' +
      '</span>'
    : '<span class="text-[11px] text-gray-400">Заголовок колонки — UTC · Кнопка в строке — время МП</span>';
  trCaption.appendChild(thCaption);
  thead.appendChild(trCaption);

  const trHead = document.createElement('tr');
  const thCorner = document.createElement('th');
  thCorner.className = 'sticky left-0 z-10 bg-gray-50 text-left py-2 px-3 font-semibold text-gray-600 border-b border-r border-gray-200 whitespace-nowrap min-w-[64px]';
  thCorner.textContent = 'МП';
  trHead.appendChild(thCorner);

  allHours.forEach(function (col) {
    const th = document.createElement('th');
    th.className = 'py-2 px-2 font-semibold border-b border-gray-200 text-center whitespace-nowrap min-w-[72px] bg-blue-50';
    th.innerHTML = hasClientTz
      ? '<span class="font-mono text-blue-700">' + escHtml(col.label) + '</span>'
      : '<span class="font-mono text-gray-600">' + escHtml(col.label) + '</span>';
    trHead.appendChild(th);
  });

  thead.appendChild(trHead);
  table.appendChild(thead);

  // ── TBODY ─────────────────────────────────────────────────────────────────
  const tbody = document.createElement('tbody');

  Object.keys(MP_CALENDARS || {}).forEach(function (calId, rowIdx) {
    const mp    = MP_CALENDARS[calId];
    const slots = slotsMap[calId] || [];
    const slotsByUtc = {};
    slots.forEach(function (s) { slotsByUtc[s.utcMs] = s; });

    const tr = document.createElement('tr');
    tr.className = (rowIdx % 2 === 0) ? 'bg-white' : 'bg-gray-50/50';

    // Только короткое название МП — без имени сотрудника
    const tdMp = document.createElement('td');
    tdMp.className = 'sticky left-0 z-10 py-2 px-3 border-b border-r border-gray-200 whitespace-nowrap font-medium text-gray-700 ' +
      ((rowIdx % 2 === 0) ? 'bg-white' : 'bg-gray-50');
    tdMp.textContent = mp.short;
    tr.appendChild(tdMp);

    allHours.forEach(function (col) {
      const td = document.createElement('td');
      td.className = 'py-1.5 px-1.5 border-b border-gray-100 text-center';

      // Баг 1 fix: col.utcMs теперь реальный UTC — прямой поиск в slotsByUtc без прибавления смещения
      const slot = slotsByUtc[col.utcMs];

      if (slot) {
        const btn = document.createElement('button');
        btn.type = 'button';
        // Дата-атрибуты для выделения выбранного слота
        btn.dataset.calId  = calId;
        btn.dataset.utcMs  = slot.utcMs;
        btn.className =
          'slot-btn w-full rounded-md bg-green-50 border border-green-200 text-green-700 ' +
          'text-[11px] font-medium px-1.5 py-1 hover:bg-green-100 hover:text-gray-900 hover:border-green-400 ' +
          'transition-colors whitespace-nowrap tabular-nums';
        const mpTime = fmtHour(slot.utcMs, mp.utc);
        btn.textContent = mpTime;
        btn.title = hasClientTz
          ? 'Время МП: ' + mpTime + ' (UTC+' + mp.utc + ')\nВремя клиента: ' + fmtHour(slot.utcMs, _clientUtc) + ' (UTC+' + _clientUtc + ')'
          : 'Записать на ' + mpTime + ' (UTC+' + mp.utc + ')';
        btn.addEventListener('click', function () {
          _highlightSelectedSlot(calId, slot.utcMs);
          selectSlot(calId, slot);
        });
        td.appendChild(btn);
      } else {
        const inWorkHours = (function () {
          // Баг 1 fix: col.utcMs реальный UTC, добавляем смещение МП для получения локального часа
          const slotLocalH = new Date(col.utcMs + mp.utc * 3600000).getUTCHours();
          return slotLocalH >= mp.from && slotLocalH < mp.to;
        }());
        const span = document.createElement('span');
        if (inWorkHours) {
          span.className = 'inline-block w-5 h-5 rounded-full bg-red-100 border border-red-200 align-middle';
          span.title     = 'Занято';
        } else {
          span.className = 'inline-block w-4 h-1 rounded bg-gray-100 align-middle';
          span.title     = 'Вне рабочего времени';
        }
        td.appendChild(span);
      }

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrap.appendChild(table);
  panel.innerHTML = '';
  panel.appendChild(wrap);

  const legend = document.createElement('div');
  legend.className = 'flex items-center gap-4 mt-3 px-1';
  legend.innerHTML =
    '<span class="flex items-center gap-1.5 text-[11px] text-gray-500">' +
    '<span class="inline-block w-4 h-4 rounded bg-green-50 border border-green-200"></span>Свободно</span>' +
    '<span class="flex items-center gap-1.5 text-[11px] text-gray-500">' +
    '<span class="inline-block w-4 h-4 rounded bg-red-100 border border-red-200"></span>Занято</span>' +
    '<span class="flex items-center gap-1.5 text-[11px] text-gray-500">' +
    '<span class="inline-block w-4 h-1 rounded bg-gray-100 border border-gray-200"></span>Вне графика</span>';
  panel.appendChild(legend);

  // Баг 6 fix: уведомляем внешний код о завершении рендера
  if (typeof _onRenderComplete === 'function') {
    _onRenderComplete();
    _onRenderComplete = null;
  }
}

// ── Выбор слота ───────────────────────────────────────────────────────────────
function selectSlot(calId, slot) {
  const mp = (MP_CALENDARS || {})[calId] || {};
  const bookingBody = document.getElementById('booking-body');
  if (bookingBody) {
    bookingBody.innerHTML =
      '<div class="space-y-1.5">' +
      '<div class="text-xs text-gray-500">МП: <span class="font-semibold text-gray-800">' + escHtml(mp.short) + '</span></div>' +
      '<div class="text-xs text-gray-500">Время МП: <span class="font-mono font-semibold text-gray-800">' +
        escHtml(fmtHour(slot.utcMs, mp.utc)) + ' UTC+' + mp.utc + '</span></div>' +
      (_clientUtc !== null
        ? '<div class="text-xs text-gray-500">Время клиента: <span class="font-mono font-semibold text-blue-600">' +
          escHtml(fmtHour(slot.utcMs, _clientUtc)) + ' UTC+' + _clientUtc + '</span></div>'
        : '') +
      '<button type="button" id="btn-book-confirm" ' +
        'class="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 transition-colors">' +
        '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>' +
        'Подтвердить запись</button>' +
      '</div>';
    const confirmBtn = document.getElementById('btn-book-confirm');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', function () {
        if (_bookingInProgress) return;
        _bookingInProgress = true;
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Запись...';
        bookSlot(calId, slot);
      });
    }
  }
  setHiddenField('UF_CRM_KC_BOOKED_MANAGER', calId);
  setHiddenField('UF_CRM_KC_BOOKED_TIME', new Date(slot.utcMs).toISOString());
}

// ── Бронирование ──────────────────────────────────────────────────────────────
function bookSlot(calId, slot) {
  if (typeof leadId === 'undefined') {
    _bookingInProgress = false;
    return;
  }
  const fio = (document.getElementById('f-fio') || {}).value || 'Клиент';
  const mp  = (MP_CALENDARS || {})[calId] || {};

  BX24.callMethod('calendar.event.add', {
    type:          'calendar',
    ownerId:       calId,
    from:          fmtBxUTC(slot.utcMs),
    to:            fmtBxUTC(slot.endUtcMs),
    name:          fio,
    description:   'Клиент: ' + fio + '. Записал: ' + (typeof CURRENT_USERNAME !== 'undefined' ? CURRENT_USERNAME : ''),
    accessibility: 'busy',
    importance:    'normal',
    color:         '#2563EB'
  }, function (result) {
    _bookingInProgress = false;

    if (result.error()) {
      showError('Ошибка бронирования: ' + result.error());
      const confirmBtn = document.getElementById('btn-book-confirm');
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML =
          '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>' +
          ' Повторить';
      }
      return;
    }

    const eventId = result.data();
    saveBookingToLead(calId, fmtBxUTC(slot.utcMs), eventId);
    notifyMpByCalId(calId, slot, fio);
    _autoJumpCount = 0;
    loadAllSlots();

    const statusEl = document.getElementById('booking-status');
    if (statusEl) {
      statusEl.className = 'mt-2 p-2 rounded-lg bg-green-50 border border-green-200 text-xs text-green-800 flex items-center gap-1.5';
      statusEl.innerHTML =
        '<svg class="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">' +
          '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>' +
        '<span>Запись подтверждена: ' + escHtml(mp.short) + ', ' +
        escHtml(fmtHour(slot.utcMs, mp.utc)) + ' UTC+' + mp.utc + '</span>';
      statusEl.classList.remove('hidden');
    }
  });
}

function saveBookingToLead(calId, fromDt, eventId) {
  BX24.callMethod('crm.lead.update', {
    id: leadId,
    fields: {
      UF_CRM_KC_BOOKED_MANAGER:  calId,
      UF_CRM_KC_BOOKED_TIME:     fromDt,
      UF_CRM_KC_BOOKED_EVENT_ID: eventId
    },
    params: { REGISTER_SONET_EVENT: 'N' }
  }, function (result) {
    if (result.error()) showError('Ошибка сохранения записи: ' + result.error());
  });
}

function notifyMpByCalId(calId, slot, leadName) {
  const mp = (MP_CALENDARS || {})[calId] || {};
  BX24.callMethod('crm.timeline.comment.add', {
    fields: {
      ENTITY_ID:   leadId,
      ENTITY_TYPE: 'lead',
      COMMENT:     'Запись к ' + (mp.short || calId) + ' на ' +
                   fmtHour(slot.utcMs, mp.utc) + ' UTC+' + mp.utc + '. Клиент: ' + leadName
    }
  }, function () {});
}

// ── Выделение выбранного слота ───────────────────────────────────────────────
/**
 * Снимает выделение со всех кнопок-слотов и выделяет нажатую.
 * Вызывается из обработчика клика кнопки ДО selectSlot().
 */
function _highlightSelectedSlot(calId, utcMs) {
  // Снимаем класс со всех кнопок-слотов
  var panel = document.getElementById('slots-panel');
  if (panel) {
    var allBtns = panel.querySelectorAll('.slot-btn');
    for (var i = 0; i < allBtns.length; i++) {
      allBtns[i].classList.remove(
        'slot-btn-selected',
        'bg-blue-600', 'border-blue-700', 'text-white',
        'bg-green-50', 'border-green-200', 'text-green-700'
      );
      allBtns[i].classList.add(
        'bg-green-50', 'border-green-200', 'text-green-700'
      );
    }
  }
  // Находим и выделяем нажатую кнопку
  var selectedBtn = panel
    ? panel.querySelector(
        '.slot-btn[data-cal-id="' + calId + '"][data-utc-ms="' + utcMs + '"]'
      )
    : null;
  if (selectedBtn) {
    selectedBtn.classList.remove(
      'bg-green-50', 'border-green-200', 'text-green-700'
    );
    selectedBtn.classList.add(
      'slot-btn-selected', 'bg-blue-600', 'border-blue-700', 'text-white'
    );
  }
}

// ── Публичный API для form.js ─────────────────────────────────────────────────
/**
 * Баг 2 fix: принимает опциональный флаг silent.
 * При silent=true только устанавливает _clientUtc без вызова loadAllSlots.
 * Используется в app.js при инициализации (до initCalendar),
 * чтобы избежать двойного вызова loadAllSlots.
 */
function setClientCity(cityName, silent) {
  if (cityName !== undefined) {
    // Баг 3/7 fix: используем _getCityTz() для полного словаря городов
    const tz = _getCityTz(cityName);
    _clientUtc = (tz !== null && tz !== undefined) ? tz : null;
  } else {
    _clientUtc = getClientUtcFromForm();
  }
  _autoJumpCount = 0;
  if (!silent) loadAllSlots();
}

// ── Вспомогательные ──────────────────────────────────────────────────────────
function showTableLoading() {
  const panel = document.getElementById('slots-panel');
  if (!panel) return;
  panel.innerHTML =
    '<div class="flex items-center gap-2 py-8 justify-center text-xs text-gray-400">' +
    '<svg class="animate-spin w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24">' +
    '<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>' +
    '<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"></path></svg>' +
    'Загрузка расписания всех МП…</div>';
}

function setHiddenField(name, value) {
  let el = document.getElementById('hidden-' + name);
  if (!el) {
    el = document.createElement('input');
    el.type = 'hidden';
    el.id   = 'hidden-' + name;
    el.name = name;
    const form = document.getElementById('anketa-form');
    if (form) form.appendChild(el);
  }
  el.value = value;
}

// Баг 5 fix: escHtml удалена из calendar.js — единственное определение в form.js.
// form.js подключается перед calendar.js, поэтому функция всегда доступна.
