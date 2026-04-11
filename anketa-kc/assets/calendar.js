/**
 * calendar.js — расписание МП
 *
 * Логика:
 * - Данные расписания получаем через calendar.accessibility.get
 *   по ID календаря (MP1Vstrechi … MP11Vstrechi), НЕ по userId.
 * - Слоты — только часовые (шаг 60 мин).
 * - Рабочее время МП берётся из MP_CALENDARS[id].from / .to.
 * - Клиентский TZ определяется по словарю CITY_TZ из блока 5 формы.
 * - Каждый слот показывается в двух колонках:
 *   «Время МП» (по UTC МП) и «Время клиента» (по UTC клиента).
 * - Если свободных слотов на день < APP_CONFIG.minSlots → авто-переход
 *   на следующий рабочий день.
 */

'use strict';

// ── Словарь менеджеров: calendarId → данные ──────────────────────────────────
const MP_CALENDARS = {
  MP1Vstrechi:  { label: 'МП 1 — Сергей Хватов',         utc: 3,    from: 10, to: 17 },
  MP2Vstrechi:  { label: 'МП 2 — Мария Прокопьева',       utc: 3,    from: 9,  to: 17 },
  MP3Vstrechi:  { label: 'МП 3 — Ефим Костылев',          utc: 4,    from: 9,  to: 17 },
  MP4Vstrechi:  { label: 'МП 4 — Виктория Григорьева',    utc: 4,    from: 9,  to: 17 },
  MP5Vstrechi:  { label: 'МП 5 — Джульетта Мурадян',      utc: 4,    from: 11, to: 19 },
  MP6Vstrechi:  { label: 'МП 6 — Виталий Андреев',        utc: 4,    from: 9,  to: 17 },
  MP7Vstrechi:  { label: 'МП 7 — Виталий Прилепин',       utc: 3,    from: 9,  to: 18 },
  MP8Vstrechi:  { label: 'МП 8 — Каролина Гнездилова',    utc: 3,    from: 9,  to: 19 },
  MP9Vstrechi:  { label: 'МП 9 — Сергей Хватов',          utc: 3,    from: 9,  to: 18 },
  MP10Vstrechi: { label: 'МП 10 — Анна Радаева',           utc: 3,    from: 9,  to: 18 }, // UTC не установлен, дефолт +3
  MP11Vstrechi: { label: 'МП 11 — Виктория Владимирова',   utc: 3,    from: 9,  to: 18 }
};

// ── Словарь городов: UTC-offset ──────────────────────────────────────────────
const CITY_TZ = {
  'Москва': 3, 'Санкт-Петербург': 3, 'Новосибирск': 7,
  'Екатеринбург': 5, 'Казань': 3, 'Нижний Новгород': 3,
  'Красноярск': 7, 'Самара': 4, 'Уфа': 5,
  'Ростов-на-Дону': 3, 'Омск': 6, 'Краснодар': 3,
  'Воронеж': 3, 'Пермь': 5, 'Волгоград': 3,
  'Тюмень': 5, 'Иркутск': 8, 'Владивосток': 10,
  'Хабаровск': 10, 'Якутск': 9, 'Магадан': 10,
  'Чита': 9, 'Сочи': 3, 'Барнаул': 7,
  'Томск': 7, 'Оренбург': 5, 'Рязань': 3,
  'Ярославль': 3, 'Ижевск': 4, 'Севастополь': 3
};

// ── Состояние ────────────────────────────────────────────────────────────────
let _currentCalId  = null;   // выбранный ID календаря
let _currentDay    = null;   // Date — отображаемый день
let _clientUtc     = null;   // UTC-offset клиента (null = не выбран)

// ── Инициализация ────────────────────────────────────────────────────────────
function initCalendar() {
  // Выбор МП
  const mpSelect = document.getElementById('mp-select');
  if (mpSelect) {
    mpSelect.addEventListener('change', function () {
      _currentCalId = this.value || null;
      _currentDay   = _currentCalId ? nextWorkday(new Date()) : null;
      if (_currentCalId) loadSlots();
      else clearSlotsPanel('Выберите МП для просмотра расписания');
    });
  }

  // Навигация по дням
  const btnPrev = document.getElementById('btn-day-prev');
  const btnNext = document.getElementById('btn-day-next');
  if (btnPrev) btnPrev.addEventListener('click', function () { shiftDay(-1); });
  if (btnNext) btnNext.addEventListener('click', function () { shiftDay(+1); });
}

// ── Утилиты дат ──────────────────────────────────────────────────────────────

/** Следующий рабочий день (пн–пт) от переданной даты включительно */
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
  // пропустить выходные
  while (dt.getDay() === 0 || dt.getDay() === 6) {
    dt.setDate(dt.getDate() + (delta > 0 ? 1 : -1));
  }
  _currentDay = dt;
  loadSlots();
}

/** Форматировать час в строку «09:00» по UTC-offset */
function fmtHour(utcMs, offsetH) {
  const local = new Date(utcMs + offsetH * 3600000);
  const h = local.getUTCHours();
  const m = local.getUTCMinutes();
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

/** Форматировать дату для заголовка */
function fmtDate(d) {
  return d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ── Загрузка занятых слотов и рендер ─────────────────────────────────────────
function loadSlots() {
  if (!_currentCalId) return;

  const mp  = MP_CALENDARS[_currentCalId];
  if (!mp) return;

  // Обновить заголовок дня
  const dateEl = document.getElementById('schedule-date');
  if (dateEl) dateEl.textContent = fmtDate(_currentDay);

  clearSlotsPanel('Загрузка слотов...');

  // Диапазон: весь выбранный день (UTC)
  const dayStart = new Date(_currentDay);
  const dayEnd   = new Date(_currentDay);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const pad = function(n) { return String(n).padStart(2, '0'); };
  const fmtISO = function(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  };

  BX24.callMethod('calendar.accessibility.get', {
    from: fmtISO(dayStart),
    to:   fmtISO(dayEnd),
    type: 'calendar',
    ids:  [_currentCalId]
  }, function (result) {
    if (result.error()) {
      console.warn('calendar.accessibility.get error:', result.error());
      renderSlots([], mp);
      return;
    }

    const busy = (result.data() || []).filter(function (ev) {
      return ev.ACCESSIBILITY === 'busy' || ev.ACCESSIBILITY === 'absent';
    });

    const freeSlots = buildFreeSlots(mp, _currentDay, busy);
    renderSlots(freeSlots, mp);
  });
}

// ── Генерация свободных слотов ───────────────────────────────────────────────

/**
 * Строим часовые слоты для МП на один день.
 * Фильтруем по:
 *   1. Рабочим часам МП (mp.from – mp.to, по UTC МП)
 *   2. «Разумному» времени клиента (clientHrMin–clientHrMax, по UTC клиента)
 *   3. Занятости из calendar.accessibility.get
 *   4. Прошедшее время (только будущие)
 */
function buildFreeSlots(mp, day, busy) {
  const cfg       = window.APP_CONFIG || {};
  const slotMs    = (cfg.slotMin || 60) * 60000;
  const clientMin = cfg.clientHrMin || 9;
  const clientMax = cfg.clientHrMax || 20;

  const slots = [];
  const now   = Date.now();

  for (let h = mp.from; h < mp.to; h++) {
    // UTC-timestamp начала слота (в UTC)
    // Bitrix24 хранит события в UTC; смещение МП применяем:
    // если МП работает с 09:00 UTC+3, это 06:00 UTC
    const slotUtcMs = Date.UTC(
      day.getFullYear(), day.getMonth(), day.getDate(),
      h - mp.utc, 0, 0, 0
    );
    const slotEndUtcMs = slotUtcMs + slotMs;

    // Только будущие
    if (slotEndUtcMs <= now) continue;

    // Фильтр по времени клиента (если город выбран)
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
function renderSlots(slots, mp) {
  const panel = document.getElementById('slots-panel');
  if (!panel) return;

  // Автопереход на следующий рабочий день
  const cfg = window.APP_CONFIG || {};
  if (slots.length < (cfg.minSlots || 3)) {
    const nextDay = new Date(_currentDay);
    nextDay.setDate(nextDay.getDate() + 1);
    _currentDay = nextWorkday(nextDay);
    loadSlots();
    return;
  }

  panel.innerHTML = '';

  // Заголовок таблицы
  const hasClientTz = _clientUtc !== null;
  const header = document.createElement('div');
  header.className = 'grid text-xs font-semibold text-gray-500 border-b border-gray-100 pb-1 mb-1 ' +
    (hasClientTz ? 'grid-cols-3' : 'grid-cols-2');
  header.innerHTML = '<span>Время МП</span>' +
    (hasClientTz ? '<span>Время клиента</span>' : '') +
    '<span></span>'; // колонка кнопки
  panel.appendChild(header);

  slots.forEach(function (slot) {
    const mpTimeStr     = fmtHour(slot.utcMs, slot.mpUtc);
    const clientTimeStr = hasClientTz ? fmtHour(slot.utcMs, _clientUtc) : null;

    const row = document.createElement('div');
    row.className = 'grid items-center gap-2 py-1 border-b border-gray-50 hover:bg-gray-50 rounded ' +
      (hasClientTz ? 'grid-cols-3' : 'grid-cols-2');

    const mpCell = document.createElement('span');
    mpCell.className = 'text-xs text-gray-800 font-mono';
    mpCell.textContent = mpTimeStr;
    row.appendChild(mpCell);

    if (hasClientTz) {
      const clientCell = document.createElement('span');
      clientCell.className = 'text-xs text-blue-600 font-mono';
      clientCell.textContent = clientTimeStr;
      row.appendChild(clientCell);
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100 ' +
      'text-xs hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-colors whitespace-nowrap';
    btn.textContent = 'Выбрать';
    btn.addEventListener('click', function () { selectSlot(slot); });
    row.appendChild(btn);

    panel.appendChild(row);
  });
}

// ── Выбор слота / бронирование ───────────────────────────────────────────────
function selectSlot(slot) {
  const mpLabel = _currentCalId ? (MP_CALENDARS[_currentCalId] || {}).label || _currentCalId : '?';
  const timeStr = fmtHour(slot.utcMs, slot.mpUtc);

  // Записать в блок 5 формы
  const bookingBody = document.getElementById('booking-body');
  if (bookingBody) {
    bookingBody.innerHTML =
      '<div class="text-xs text-gray-700 space-y-1">' +
      '<div><span class="text-gray-400">МП:</span> ' + escHtml(mpLabel) + '</div>' +
      '<div><span class="text-gray-400">Время МП:</span> <b>' + escHtml(timeStr) + '</b></div>' +
      (_clientUtc !== null
        ? '<div><span class="text-gray-400">Время клиента:</span> <b>' +
          escHtml(fmtHour(slot.utcMs, _clientUtc)) + '</b></div>'
        : '') +
      '<button type="button" id="btn-book-confirm" ' +
      'class="mt-2 inline-flex items-center px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 transition-colors">' +
      'Подтвердить запись</button>' +
      '</div>';
    const confirmBtn = document.getElementById('btn-book-confirm');
    if (confirmBtn) confirmBtn.addEventListener('click', function () { bookSlot(slot); });
  }

  // Сохранить в скрытые поля формы (для сохранения вместе с анкетой)
  setHiddenField('UF_CRM_KC_BOOKED_MANAGER', _currentCalId);
  setHiddenField('UF_CRM_KC_BOOKED_TIME',    new Date(slot.utcMs).toISOString());
}

function bookSlot(slot) {
  if (!_currentCalId || typeof leadId === 'undefined') return;

  const fio    = (document.getElementById('f-UF_CRM_KC_FULLNAME') || {}).value || 'Клиент';
  const mpInfo = MP_CALENDARS[_currentCalId] || {};

  const fmtBx = function (utcMs) {
    const d = new Date(utcMs);
    const p = function(n) { return String(n).padStart(2, '0'); };
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) +
           'T' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':00';
  };

  BX24.callMethod('calendar.event.add', {
    type:          'calendar',
    ownerId:       _currentCalId,
    from:          fmtBx(slot.utcMs),
    to:            fmtBx(slot.endUtcMs),
    name:          fio,
    description:   fio + ' — запись от ' + (typeof CURRENT_USERNAME !== 'undefined' ? CURRENT_USERNAME : ''),
    accessibility: 'busy',
    importance:    'normal',
    color:         '#2563EB'
  }, function (result) {
    if (result.error()) {
      showError('Ошибка бронирования: ' + result.error());
      return;
    }
    const eventId = result.data();
    saveBookingToLead(_currentCalId, fmtBx(slot.utcMs), eventId);
    notifyMpByCalId(_currentCalId, slot, fio);
    loadSlots(); // обновить расписание

    const statusEl = document.getElementById('booking-status');
    if (statusEl) {
      statusEl.className = 'p-2 rounded-lg bg-green-50 border border-green-200 text-xs text-green-800';
      statusEl.textContent = '✓ Запись подтверждена: ' + mpInfo.label + ', ' + fmtHour(slot.utcMs, mpInfo.utc);
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
  // Для уведомления нужен userId МП — получаем по поиску user.get с фильтром по email
  // Упрощённо: пишем уведомление в таймлайн лида
  const mp      = MP_CALENDARS[calId] || {};
  const timeStr = fmtHour(slot.utcMs, mp.utc);
  BX24.callMethod('crm.timeline.comment.add', {
    fields: {
      ENTITY_ID:   leadId,
      ENTITY_TYPE: 'lead',
      COMMENT:     'Запись к ' + (mp.label || calId) + ' на ' + timeStr +
                   '. Клиент: ' + leadName
    }
  }, function () {});
}

// ── Публичный API для form.js ─────────────────────────────────────────────────

/** Вызывается из form.js при изменении поля «Город клиента» */
function setClientCity(cityName) {
  _clientUtc = (CITY_TZ[cityName] !== undefined) ? CITY_TZ[cityName] : null;
  if (_currentCalId) loadSlots();
}

// ── Вспомогательные ──────────────────────────────────────────────────────────
function clearSlotsPanel(msg) {
  const panel = document.getElementById('slots-panel');
  if (panel) panel.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">' + escHtml(msg) + '</p>';
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
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
