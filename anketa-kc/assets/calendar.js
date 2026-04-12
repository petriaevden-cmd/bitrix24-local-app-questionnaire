/**
 * calendar.js — расписание МП (табличный вид)
 *
 * Вид: строки = МП (только короткое название, без имени сотрудника),
 *      столбцы = часовые слоты дня.
 * Логика занятости, TZ, автопереход — без изменений.
 */

'use strict';

// ── Словарь менеджеров ────────────────────────────────────────────────────────
const MP_CALENDARS = {
  MP1Vstrechi:  { label: 'Сергей Хватов',        short: 'МП 1',  utc: 3, from: 10, to: 17 },
  MP2Vstrechi:  { label: 'Мария Прокопьева',      short: 'МП 2',  utc: 3, from: 9,  to: 17 },
  MP3Vstrechi:  { label: 'Ефим Костылев',         short: 'МП 3',  utc: 4, from: 9,  to: 17 },
  MP4Vstrechi:  { label: 'Виктория Григорьева',   short: 'МП 4',  utc: 4, from: 9,  to: 17 },
  MP5Vstrechi:  { label: 'Джульетта Мурадян',     short: 'МП 5',  utc: 4, from: 11, to: 19 },
  MP6Vstrechi:  { label: 'Виталий Андреев',       short: 'МП 6',  utc: 4, from: 9,  to: 17 },
  MP7Vstrechi:  { label: 'Виталий Прилепин',      short: 'МП 7',  utc: 3, from: 9,  to: 18 },
  MP8Vstrechi:  { label: 'Каролина Гнездилова',   short: 'МП 8',  utc: 3, from: 9,  to: 19 },
  MP9Vstrechi:  { label: 'Сергей Хватов',         short: 'МП 9',  utc: 3, from: 9,  to: 18 },
  MP10Vstrechi: { label: 'Анна Радаева',          short: 'МП 10', utc: 3, from: 9,  to: 18 },
  MP11Vstrechi: { label: 'Виктория Владимирова',  short: 'МП 11', utc: 3, from: 9,  to: 18 }
};

// ── Словарь городов ───────────────────────────────────────────────────────────
const CITY_TZ = {
  'Москва': 3,         'Санкт-Петербург': 3, 'Новосибирск': 7,
  'Екатеринбург': 5,   'Казань': 3,          'Нижний Новгород': 3,
  'Красноярск': 7,     'Самара': 4,          'Уфа': 5,
  'Ростов-на-Дону': 3, 'Омск': 6,            'Краснодар': 3,
  'Воронеж': 3,        'Пермь': 5,           'Волгоград': 3,
  'Тюмень': 5,         'Иркутск': 8,         'Владивосток': 10,
  'Хабаровск': 10,     'Якутск': 9,          'Магадан': 10,
  'Чита': 9,           'Сочи': 3,            'Барнаул': 7,
  'Томск': 7,          'Оренбург': 5,        'Рязань': 3,
  'Ярославль': 3,      'Ижевск': 4,          'Севастополь': 3
};

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
  _currentDay = nextWorkday(new Date());

  const btnPrev = document.getElementById('btn-day-prev');
  const btnNext = document.getElementById('btn-day-next');
  if (btnPrev) btnPrev.addEventListener('click', function () { shiftDay(-1); });
  if (btnNext) btnNext.addEventListener('click', function () { shiftDay(+1); });

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
  const tz = CITY_TZ[el.value.trim()];
  return (tz !== undefined) ? tz : null;
}

// ── Загрузка всех МП за день ─────────────────────────────────────────────────
function loadAllSlots() {
  _clientUtc   = getClientUtcFromForm();
  _busyCache   = {};
  _loadedCount = 0;
  _totalToLoad = Object.keys(MP_CALENDARS).length;

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

  Object.keys(MP_CALENDARS).forEach(function (calId) {
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

// ── Сбор всех уникальных часов для заголовка таблицы ─────────────────────────
function collectAllHours(slotsMap) {
  const hoursSet = {};
  Object.keys(slotsMap).forEach(function (calId) {
    const mp = MP_CALENDARS[calId];
    (slotsMap[calId] || []).forEach(function (slot) {
      hoursSet[slot.utcMs - mp.utc * 3600000] = fmtHour(slot.utcMs, mp.utc);
    });
  });
  return Object.keys(hoursSet).sort(function (a, b) { return a - b; }).map(function (k) {
    return { utcMs: parseInt(k, 10), label: hoursSet[k] };
  });
}

// ── Рендер таблицы ────────────────────────────────────────────────────────────
function renderTable() {
  const panel = document.getElementById('slots-panel');
  if (!panel) return;

  const slotsMap = {};
  let totalFree  = 0;
  Object.keys(MP_CALENDARS).forEach(function (calId) {
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
  const thead  = document.createElement('thead');
  const trHead = document.createElement('tr');

  const thCorner = document.createElement('th');
  thCorner.className = 'sticky left-0 z-10 bg-gray-50 text-left py-2 px-3 font-semibold text-gray-600 border-b border-r border-gray-200 whitespace-nowrap min-w-[64px]';
  thCorner.innerHTML = 'МП';
  trHead.appendChild(thCorner);

  allHours.forEach(function (col) {
    const th = document.createElement('th');
    th.className = 'py-2 px-2 font-semibold text-gray-600 border-b border-gray-200 text-center whitespace-nowrap min-w-[80px]';
    if (hasClientTz) {
      const clientTime = fmtHour(col.utcMs, _clientUtc);
      th.innerHTML =
        '<span class="block font-mono text-gray-800">' + escHtml(col.label) + '</span>' +
        '<span class="block font-mono text-blue-500 font-normal text-[10px]">' + escHtml(clientTime) + '</span>';
    } else {
      th.innerHTML = '<span class="font-mono">' + escHtml(col.label) + '</span>';
    }
    trHead.appendChild(th);
  });

  thead.appendChild(trHead);

  if (hasClientTz) {
    const trTz = document.createElement('tr');
    const thTzCorner = document.createElement('th');
    thTzCorner.className = 'sticky left-0 z-10 bg-gray-50 border-b border-r border-gray-200';
    trTz.appendChild(thTzCorner);
    const tdTz = document.createElement('td');
    tdTz.colSpan = allHours.length;
    tdTz.className = 'py-1 px-2 border-b border-gray-200 bg-gray-50 text-gray-400 text-[10px]';
    tdTz.innerHTML =
      '<span class="text-gray-500">время МП</span> / ' +
      '<span class="text-blue-400">время клиента (UTC+' + _clientUtc + ')</span>';
    trTz.appendChild(tdTz);
    thead.appendChild(trTz);
  }

  table.appendChild(thead);

  // ── TBODY ─────────────────────────────────────────────────────────────────
  const tbody = document.createElement('tbody');

  Object.keys(MP_CALENDARS).forEach(function (calId, rowIdx) {
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

      const slot = slotsByUtc[col.utcMs + mp.utc * 3600000];

      if (slot) {
        const btn = document.createElement('button');
        btn.type      = 'button';
        btn.className =
          'w-full rounded-md bg-green-50 border border-green-200 text-green-700 ' +
          'text-[11px] font-medium px-1.5 py-1 hover:bg-green-600 hover:text-white hover:border-green-600 ' +
          'transition-colors whitespace-nowrap tabular-nums';
        btn.textContent = fmtHour(slot.utcMs, mp.utc);
        btn.title       = 'Записать на ' + fmtHour(slot.utcMs, mp.utc) + ' (UTC+' + mp.utc + ')';
        btn.addEventListener('click', function () { selectSlot(calId, slot); });
        td.appendChild(btn);
      } else {
        const inWorkHours = (function () {
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
}

// ── Выбор слота ───────────────────────────────────────────────────────────────
function selectSlot(calId, slot) {
  const mp = MP_CALENDARS[calId] || {};
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
  const mp  = MP_CALENDARS[calId] || {};

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
  const mp = MP_CALENDARS[calId] || {};
  BX24.callMethod('crm.timeline.comment.add', {
    fields: {
      ENTITY_ID:   leadId,
      ENTITY_TYPE: 'lead',
      COMMENT:     'Запись к ' + (mp.short || calId) + ' на ' +
                   fmtHour(slot.utcMs, mp.utc) + ' UTC+' + mp.utc + '. Клиент: ' + leadName
    }
  }, function () {});
}

// ── Публичный API для form.js ─────────────────────────────────────────────────
function setClientCity(cityName) {
  if (cityName !== undefined) {
    _clientUtc = (CITY_TZ[cityName] !== undefined) ? CITY_TZ[cityName] : null;
  } else {
    _clientUtc = getClientUtcFromForm();
  }
  _autoJumpCount = 0;
  loadAllSlots();
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

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
