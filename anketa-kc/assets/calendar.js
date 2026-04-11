/**
 * calendar.js — расписание МП
 *
 * Логика:
 * - Данные расписания получаем через calendar.accessibility.get
 *   по ID календаря (MP1Vstrechi … MP11Vstrechi), НЕ по userId.
 * - Слоты — только часовые (шаг 60 мин).
 * - Рабочее время МП берётся из MP_CALENDARS[id].from / .to.
 * - Клиентский TZ определяется по полю «Город клиента» (блок 5 формы).
 * - Каждый слот показывается в двух колонках:
 *   «Время МП» (по UTC МП) и «Время клиента» (по UTC клиента).
 * - Если свободных слотов на день < APP_CONFIG.minSlots — переход
 *   на следующий рабочий день (но не более 14 дней вперёд).
 */

'use strict';

// ── Словарь менеджеров: calendarId → данные ──────────────────────────────────
const MP_CALENDARS = {
  MP1Vstrechi:  { label: 'МП 1 — Сергей Хватов',         utc: 3,  from: 10, to: 17 },
  MP2Vstrechi:  { label: 'МП 2 — Мария Прокопьева',       utc: 3,  from: 9,  to: 17 },
  MP3Vstrechi:  { label: 'МП 3 — Ефим Костылев',          utc: 4,  from: 9,  to: 17 },
  MP4Vstrechi:  { label: 'МП 4 — Виктория Григорьева',    utc: 4,  from: 9,  to: 17 },
  MP5Vstrechi:  { label: 'МП 5 — Джульетта Мурадян',      utc: 4,  from: 11, to: 19 },
  MP6Vstrechi:  { label: 'МП 6 — Виталий Андреев',        utc: 4,  from: 9,  to: 17 },
  MP7Vstrechi:  { label: 'МП 7 — Виталий Прилепин',       utc: 3,  from: 9,  to: 18 },
  MP8Vstrechi:  { label: 'МП 8 — Каролина Гнездилова',    utc: 3,  from: 9,  to: 19 },
  MP9Vstrechi:  { label: 'МП 9 — Сергей Хватов',          utc: 3,  from: 9,  to: 18 },
  MP10Vstrechi: { label: 'МП 10 — Анна Радаева',          utc: 3,  from: 9,  to: 18 }, // UTC не уточнён, дефолт +3
  MP11Vstrechi: { label: 'МП 11 — Виктория Владимирова',  utc: 3,  from: 9,  to: 18 }
};

// ── Словарь городов: UTC-offset ──────────────────────────────────────────────
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
let _currentCalId   = null;  // выбранный ID календаря
let _currentDay     = null;  // Date — отображаемый день
let _clientUtc      = null;  // UTC-offset клиента (null = не выбран)
let _autoJumpCount  = 0;     // счётчик автопереходов (защита от петли)
const MAX_AUTO_JUMP = 14;    // максимум 14 дней вперёд

// ── Инициализация ────────────────────────────────────────────────────────────
function initCalendar() {
  const mpSelect = document.getElementById('mp-select');
  if (mpSelect) {
    mpSelect.addEventListener('change', function () {
      _currentCalId  = this.value || null;
      _autoJumpCount = 0;
      _currentDay    = _currentCalId ? nextWorkday(new Date()) : null;
      if (_currentCalId) loadSlots();
      else clearSlotsPanel('Выберите МП для просмотра расписания');
    });
  }

  const btnPrev = document.getElementById('btn-day-prev');
  const btnNext = document.getElementById('btn-day-next');
  if (btnPrev) btnPrev.addEventListener('click', function () { shiftDay(-1); });
  if (btnNext) btnNext.addEventListener('click', function () { shiftDay(+1); });
}

// ── Утилиты дат ──────────────────────────────────────────────────────────────

/** Следующий рабочий день (пн–пт), начиная с d включительно */
function nextWorkday(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  while (dt.getDay() === 0 || dt.getDay() === 6) {
    dt.setDate(dt.getDate() + 1);
  }
  return dt;
}

/** Сдвиг текущего дня на ±1 рабочий день */
function shiftDay(delta) {
  if (!_currentCalId || !_currentDay) return;
  const dt = new Date(_currentDay);
  dt.setDate(dt.getDate() + delta);
  while (dt.getDay() === 0 || dt.getDay() === 6) {
    dt.setDate(dt.getDate() + (delta > 0 ? 1 : -1));
  }
  _currentDay    = dt;
  _autoJumpCount = 0; // сброс при ручной навигации
  loadSlots();
}

/** Форматировать UTC-ms в строку «09:00» по offset */
function fmtHour(utcMs, offsetH) {
  const local = new Date(utcMs + offsetH * 3600000);
  const h = local.getUTCHours();
  const m = local.getUTCMinutes();
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

/** Форматировать дату для заголовка расписания */
function fmtDate(d) {
  return d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Прочитать UTC клиента из поля формы «Город клиента» */
function getClientUtcFromForm() {
  const cityEl = document.getElementById('f-UF_CRM_KC_CLIENT_CITY');
  if (!cityEl || !cityEl.value) return null;
  const tz = CITY_TZ[cityEl.value.trim()];
  return (tz !== undefined) ? tz : null;
}

// ── Загрузка занятых слотов ───────────────────────────────────────────────────
function loadSlots() {
  if (!_currentCalId) return;
  const mp = MP_CALENDARS[_currentCalId];
  if (!mp) return;

  // Актуализировать TZ клиента из формы при каждом вызове
  _clientUtc = getClientUtcFromForm();

  // Заголовок дня
  const dateEl = document.getElementById('schedule-date');
  if (dateEl) dateEl.textContent = fmtDate(_currentDay);

  clearSlotsPanel('Загрузка слотов...');

  const pad    = function (n) { return String(n).padStart(2, '0'); };
  const fmtISO = function (d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  };

  const dayStart = new Date(_currentDay);
  const dayEnd   = new Date(_currentDay);
  dayEnd.setDate(dayEnd.getDate() + 1);

  BX24.callMethod('calendar.accessibility.get', {
    from: fmtISO(dayStart),
    to:   fmtISO(dayEnd),
    type: 'calendar',
    ids:  [_currentCalId]
  }, function (result) {
    if (result.error()) {
      console.warn('calendar.accessibility.get error:', result.error());
      renderSlots([], mp, true);
      return;
    }

    const busy = (result.data() || []).filter(function (ev) {
      return ev.ACCESSIBILITY === 'busy' || ev.ACCESSIBILITY === 'absent';
    });

    const freeSlots = buildFreeSlots(mp, _currentDay, busy);
    renderSlots(freeSlots, mp, false);
  });
}

// ── Генерация свободных слотов ───────────────────────────────────────────────

/**
 * Часовые слоты для МП на один день.
 * Фильтрация:
 *  1. Рабочие часы МП (mp.from – mp.to по UTC МП)
 *  2. «Разумное» время клиента (clientHrMin–clientHrMax по UTC клиента, если город выбран)
 *  3. Занятость из calendar.accessibility.get
 *  4. Прошедшее время отсекается
 */
function buildFreeSlots(mp, day, busy) {
  const cfg       = window.APP_CONFIG || {};
  const slotMs    = (cfg.slotMin    || 60) * 60000;
  const clientMin = cfg.clientHrMin || 9;
  const clientMax = cfg.clientHrMax || 20;
  const now       = Date.now();
  const slots     = [];

  for (let h = mp.from; h < mp.to; h++) {
    // Перевод локального часа МП → UTC
    const slotUtcMs    = Date.UTC(
      day.getFullYear(), day.getMonth(), day.getDate(),
      h - mp.utc, 0, 0, 0
    );
    const slotEndUtcMs = slotUtcMs + slotMs;

    if (slotEndUtcMs <= now) continue;

    // Фильтр по «разумному» времени клиента
    if (_clientUtc !== null) {
      const clientHour = new Date(slotUtcMs + _clientUtc * 3600000).getUTCHours();
      if (clientHour < clientMin || clientHour >= clientMax) continue;
    }

    // Фильтр занятости
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

// ── Рендер слотов ────────────────────────────────────────────────────────────
function renderSlots(slots, mp, apiError) {
  const panel = document.getElementById('slots-panel');
  if (!panel) return;

  const cfg      = window.APP_CONFIG || {};
  const minSlots = cfg.minSlots || 3;

  // Автопереход на следующий рабочий день (с защитой от петли)
  if (!apiError && slots.length < minSlots && _autoJumpCount < MAX_AUTO_JUMP) {
    _autoJumpCount++;
    const nextDay = new Date(_currentDay);
    nextDay.setDate(nextDay.getDate() + 1);
    _currentDay = nextWorkday(nextDay);
    loadSlots();
    return;
  }

  // Сбросить счётчик — мы остановились на этом дне
  _autoJumpCount = 0;

  // Обновить заголовок (мог измениться при автопереходе)
  const dateEl = document.getElementById('schedule-date');
  if (dateEl) dateEl.textContent = fmtDate(_currentDay);

  if (apiError) {
    clearSlotsPanel('Ошибка загрузки расписания');
    return;
  }

  if (slots.length === 0) {
    clearSlotsPanel('Нет свободных слотов в ближайшие ' + MAX_AUTO_JUMP + ' рабочих дней');
    return;
  }

  panel.innerHTML = '';

  const hasClientTz = _clientUtc !== null;

  // Заголовок колонок
  const mpOffsetBadge     = utcBadge(mp.utc);
  const clientOffsetBadge = hasClientTz ? utcBadge(_clientUtc) : '';

  const headerCols = hasClientTz ? 'grid-cols-3' : 'grid-cols-2';
  const header     = document.createElement('div');
  header.className = 'grid ' + headerCols + ' text-xs font-semibold text-gray-500 border-b border-gray-100 pb-1 mb-1 px-1';
  header.innerHTML =
    '<span>Время МП ' + mpOffsetBadge + '</span>' +
    (hasClientTz ? '<span>Время клиента ' + clientOffsetBadge + '</span>' : '') +
    '<span></span>';
  panel.appendChild(header);

  slots.forEach(function (slot) {
    const mpTimeStr     = fmtHour(slot.utcMs, slot.mpUtc);
    const clientTimeStr = hasClientTz ? fmtHour(slot.utcMs, _clientUtc) : null;

    const row = document.createElement('div');
    row.className = 'grid ' + headerCols +
      ' items-center gap-2 py-1.5 px-1 border-b border-gray-50 hover:bg-blue-50 rounded transition-colors';

    // Время МП
    const mpCell = document.createElement('span');
    mpCell.className = 'text-xs text-gray-800 font-mono tabular-nums';
    mpCell.textContent = mpTimeStr;
    row.appendChild(mpCell);

    // Время клиента
    if (hasClientTz) {
      const clientCell = document.createElement('span');
      clientCell.className = 'text-xs text-blue-600 font-mono tabular-nums';
      clientCell.textContent = clientTimeStr;
      row.appendChild(clientCell);
    }

    // Кнопка «Выбрать»
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = 'px-2 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200 ' +
      'text-xs font-medium hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-colors whitespace-nowrap';
    btn.textContent = 'Выбрать';
    btn.addEventListener('click', function () { selectSlot(slot); });
    row.appendChild(btn);

    panel.appendChild(row);
  });
}

/** Бейдж UTC+N в виде span */
function utcBadge(offset) {
  return '<span class="ml-1 font-mono text-gray-400 font-normal">UTC+' + offset + '</span>';
}

// ── Выбор слота / бронирование ───────────────────────────────────────────────
function selectSlot(slot) {
  const mpLabel = _currentCalId ? (MP_CALENDARS[_currentCalId] || {}).label || _currentCalId : '?';
  const timeStr = fmtHour(slot.utcMs, slot.mpUtc);

  const bookingBody = document.getElementById('booking-body');
  if (bookingBody) {
    bookingBody.innerHTML =
      '<div class="space-y-1">' +
      '<div class="text-xs text-gray-500">МП: <span class="text-gray-800 font-medium">' + escHtml(mpLabel) + '</span></div>' +
      '<div class="text-xs text-gray-500">Время МП: <span class="font-mono font-semibold text-gray-800">' + escHtml(timeStr) + ' UTC+' + slot.mpUtc + '</span></div>' +
      (_clientUtc !== null
        ? '<div class="text-xs text-gray-500">Время клиента: <span class="font-mono font-semibold text-blue-600">' +
          escHtml(fmtHour(slot.utcMs, _clientUtc)) + ' UTC+' + _clientUtc + '</span></div>'
        : '') +
      '<button type="button" id="btn-book-confirm" ' +
      'class="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 transition-colors">' +
      '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>' +
      'Подтвердить запись</button>' +
      '</div>';

    const confirmBtn = document.getElementById('btn-book-confirm');
    if (confirmBtn) confirmBtn.addEventListener('click', function () { bookSlot(slot); });
  }

  setHiddenField('UF_CRM_KC_BOOKED_MANAGER', _currentCalId);
  setHiddenField('UF_CRM_KC_BOOKED_TIME',    new Date(slot.utcMs).toISOString());
}

function bookSlot(slot) {
  if (!_currentCalId || typeof leadId === 'undefined') return;

  const fio    = (document.getElementById('f-UF_CRM_KC_FULLNAME') || {}).value || 'Клиент';
  const mpInfo = MP_CALENDARS[_currentCalId] || {};

  // ISO 8601 с UTC-суффиксом: «2026-04-15T09:00:00+00:00»
  const fmtBxUTC = function (utcMs) {
    const d = new Date(utcMs);
    const p = function (n) { return String(n).padStart(2, '0'); };
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) +
      'T' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':00+00:00';
  };

  BX24.callMethod('calendar.event.add', {
    type:          'calendar',
    ownerId:       _currentCalId,
    from:          fmtBxUTC(slot.utcMs),
    to:            fmtBxUTC(slot.endUtcMs),
    name:          fio,
    description:   'Клиент: ' + fio + '. Записал: ' + (typeof CURRENT_USERNAME !== 'undefined' ? CURRENT_USERNAME : ''),
    accessibility: 'busy',
    importance:    'normal',
    color:         '#2563EB'
  }, function (result) {
    if (result.error()) {
      showError('Ошибка бронирования: ' + result.error());
      return;
    }
    const eventId = result.data();
    saveBookingToLead(_currentCalId, fmtBxUTC(slot.utcMs), eventId);
    notifyMpByCalId(_currentCalId, slot, fio);
    loadSlots();

    const statusEl = document.getElementById('booking-status');
    if (statusEl) {
      statusEl.className = 'mt-2 p-2 rounded-lg bg-green-50 border border-green-200 text-xs text-green-800 flex items-center gap-1.5';
      statusEl.innerHTML =
        '<svg class="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>' +
        '<span>Запись подтверждена: ' + escHtml(mpInfo.label || _currentCalId) + ', ' +
        escHtml(fmtHour(slot.utcMs, mpInfo.utc)) + ' (UTC+' + mpInfo.utc + ')</span>';
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
  const mp      = MP_CALENDARS[calId] || {};
  const timeStr = fmtHour(slot.utcMs, mp.utc);
  BX24.callMethod('crm.timeline.comment.add', {
    fields: {
      ENTITY_ID:   leadId,
      ENTITY_TYPE: 'lead',
      COMMENT:     'Запись к ' + (mp.label || calId) + ' на ' + timeStr +
                   ' UTC+' + mp.utc + '. Клиент: ' + leadName
    }
  }, function () {});
}

// ── Публичный API для form.js ─────────────────────────────────────────────────

/**
 * Вызывается из form.js при изменении поля «Город клиента».
 * Передаёт имя города; если не передан — читает из формы сам.
 */
function setClientCity(cityName) {
  if (cityName !== undefined) {
    _clientUtc = (CITY_TZ[cityName] !== undefined) ? CITY_TZ[cityName] : null;
  } else {
    _clientUtc = getClientUtcFromForm();
  }
  if (_currentCalId) {
    _autoJumpCount = 0;
    loadSlots();
  }
}

// ── Вспомогательные ──────────────────────────────────────────────────────────
function clearSlotsPanel(msg) {
  const panel = document.getElementById('slots-panel');
  if (panel) {
    panel.innerHTML =
      '<p class="text-xs text-gray-400 text-center py-6">' + escHtml(msg) + '</p>';
  }
}

function setHiddenField(name, value) {
  let el = document.getElementById('hidden-' + name);
  if (!el) {
    el       = document.createElement('input');
    el.type  = 'hidden';
    el.id    = 'hidden-' + name;
    el.name  = name;
    const form = document.getElementById('anketa-form');
    if (form) form.appendChild(el);
  }
  el.value = value;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
