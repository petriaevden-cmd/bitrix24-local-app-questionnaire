/**
 * calendar.js — работа с календарём менеджеров
 * UI рендерится через Tailwind CSS 4 + Flowbite utility-классы.
 *
 * Функции:
 * - initManagerList(managers)     — рендер карточек менеджеров
 * - refreshManagerSlots(id)       — обновление слотов одного менеджера
 * - refreshAllManagerSlots()      — обновление всех менеджеров
 * - generateWorkSlots(from, to)   — генерация рабочих 30-мин слотов
 * - slotsOverlap(slot, event)     — проверка пересечения с занятым событием
 * - bookSlot(slot, managerId)     — бронирование слота (calendar.event.add)
 */

'use strict';

const WORK_START  = 9;
const WORK_END    = 20;
const SLOT_MIN    = 30;
const MANAGERS_LIST = [];
let   managersMap   = {}; // id -> {NAME, LASTNAME, PERSONALPHOTO}

// ─── Инициализация ───────────────────────────────────────────────────────────

function initManagerList(managers) {
  MANAGERS_LIST.length = 0;
  managersMap = {};
  managers.forEach(function(m) {
    MANAGERS_LIST.push(m.ID);
    managersMap[m.ID] = m;
  });

  // Обновляем заголовок расписания
  const dateEl = document.getElementById('schedule-date');
  if (dateEl) {
    const now = new Date();
    dateEl.textContent = now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  const refreshBtn = document.getElementById('btn-refresh-slots');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function() { refreshAllManagerSlots(); });
  }

  refreshAllManagerSlots();
}

// ─── Генерация слотов ────────────────────────────────────────────────────────

/**
 * Генерация рабочих слотов на N дней вперёд (пн–пт, WORK_START–WORK_END)
 * @param {Date} from
 * @param {Date} to
 * @returns {Array<{start: Date, end: Date}>}
 */
function generateWorkSlots(from, to) {
  const slots  = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= to) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) { // пн–пт
      for (let h = WORK_START; h < WORK_END; h++) {
        for (let m = 0; m < 60; m += SLOT_MIN) {
          const start = new Date(cursor);
          start.setHours(h, m, 0, 0);
          const end = new Date(start.getTime() + SLOT_MIN * 60 * 1000);
          if (start > new Date()) { // только будущие слоты
            slots.push({ start: start, end: end });
          }
        }
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return slots;
}

/**
 * Проверка пересечения слота с событием из Б24
 */
function slotsOverlap(slot, event) {
  const evStart = new Date(event.DATE_FROM);
  const evEnd   = new Date(event.DATE_TO);
  return slot.start < evEnd && slot.end > evStart;
}

// ─── Обновление слотов ───────────────────────────────────────────────────────

function refreshManagerSlots(managerId) {
  const now    = new Date();
  const future = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const fmt    = function(d) { return d.toISOString().slice(0, 10); };

  BX24.callMethod('calendar.event.get', {
    type:    'user',
    ownerId: managerId,
    from:    fmt(now),
    to:      fmt(future)
  }, function (result) {
    if (result.error()) {
      console.warn('calendar.event.get error:', result.error());
      renderManagerSlots(managerId, []);
      return;
    }
    const busyEvents = result.data().filter(function(ev) {
      return ev.DELETED !== 'Y' && ev.DT_SKIP_TIME !== 'Y' && ev.ACCESSIBILITY !== 'free';
    });
    const allSlots  = generateWorkSlots(now, future);
    const freeSlots = allSlots.filter(function(slot) {
      return !busyEvents.some(function(ev) { return slotsOverlap(slot, ev); });
    });
    renderManagerSlots(managerId, freeSlots);
  });
}

function refreshAllManagerSlots() {
  MANAGERS_LIST.forEach(function(id) { refreshManagerSlots(id); });
  // Обновить счётчик свободных слотов
  const freeEl = document.getElementById('schedule-free');
  if (freeEl) freeEl.textContent = 'Обновление...';
}

// ─── Рендер слотов (Tailwind + Flowbite) ─────────────────────────────────────

/**
 * Рендер карточки менеджера с его свободными слотами
 */
function renderManagerSlots(managerId, freeSlots) {
  const panel = document.getElementById('manager-slots-panel');
  if (!panel) return;

  // Удалить существующую карточку этого менеджера, если есть
  const existing = document.getElementById('mgr-card-' + managerId);
  if (existing) existing.remove();

  const mgr      = managersMap[managerId] || {};
  const fullName = [mgr.LASTNAME, mgr.NAME].filter(Boolean).join(' ') || ('Менеджер #' + managerId);
  const photo    = mgr.PERSONALPHOTO || '';

  // Берём ближайшие 8 слотов (сегодня + завтра)
  const shown    = freeSlots.slice(0, 8);
  const total    = freeSlots.length;

  const avatarHtml = photo
    ? `<img src="${escHtml(photo)}" alt="${escHtml(fullName)}" class="w-7 h-7 rounded-full object-cover">`
    : `<div class="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold">${escHtml(fullName.charAt(0))}</div>`;

  const slotsHtml = shown.length === 0
    ? '<p class="text-xs text-gray-400 py-1">Нет свободных слотов</p>'
    : shown.map(function(slot) {
        const label = slot.start.toLocaleString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        return `<button type="button"
          onclick="bookSlot(${JSON.stringify(slot)}, ${managerId})"
          class="px-2 py-1 text-xs rounded-md bg-blue-50 text-blue-700 border border-blue-100
                 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-colors whitespace-nowrap">
          ${escHtml(label)}
        </button>`;
      }).join('');

  const card = document.createElement('div');
  card.id    = 'mgr-card-' + managerId;
  card.className = 'bg-white border border-gray-200 rounded-lg shadow-sm p-3';
  card.innerHTML = `
    <div class="flex items-center gap-2 mb-2">
      ${avatarHtml}
      <div>
        <div class="text-xs font-semibold text-gray-800">${escHtml(fullName)}</div>
        <div class="text-xs text-gray-400">Свободно слотов: ${total}</div>
      </div>
    </div>
    <div class="flex flex-wrap gap-1">
      ${slotsHtml}
    </div>
    ${total > 8 ? '<p class="text-xs text-gray-400 mt-1">+' + (total - 8) + ' ещё...</p>' : ''}
  `;

  // Удалить лоадер при первом рендере
  const loader = panel.querySelector('.animate-spin');
  if (loader) loader.closest('div').remove();

  panel.appendChild(card);

  // Обновить счётчик
  const freeEl = document.getElementById('schedule-free');
  if (freeEl) {
    const totalFree = Array.from(panel.querySelectorAll('[id^="mgr-card-"]')).reduce(function(acc, el) {
      const countEl = el.querySelector('.text-gray-400');
      return acc + (countEl ? parseInt(countEl.textContent) || 0 : 0);
    }, 0);
    freeEl.textContent = 'Свободных слотов сегодня: обновлено';
  }
}

// ─── Бронирование ────────────────────────────────────────────────────────────

function bookSlot(slot, managerId) {
  // slot может прийти как plain object из JSON.stringify — восстановим Date
  const start = new Date(slot.start);
  const end   = new Date(slot.end);

  const fmt = function(dt) {
    return dt.toLocaleString('ru-RU', {
      year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', second:'2-digit'
    }).replace(',', '');
  };

  const fio = (document.getElementById('f-fio') || {}).value || 'Клиент';

  BX24.callMethod('calendar.event.add', {
    type:          'user',
    ownerId:       managerId,
    from:          fmt(start),
    to:            fmt(end),
    name:          fio,
    description:   `${fio} — запись от менеджера ${CURRENT_USERNAME}`,
    accessibility: 'busy',
    importance:    'normal',
    ismeeting:     'Y',
    attendees:     [managerId],
    color:         '#2563EB',
    crmfields:     [{ TYPE: 'LEAD', ID: leadId }]
  }, function (result) {
    if (result.error()) {
      showError('Ошибка бронирования: ' + result.error());
      return;
    }
    const eventId = result.data();
    saveBookingToLead(managerId, fmt(start), eventId);
    refreshAllManagerSlots();
    notifyManager(managerId, { start: start, end: end }, { fullName: fio });
  });
}

function saveBookingToLead(managerId, fromDt, eventId) {
  BX24.callMethod('crm.lead.update', {
    id: leadId,
    fields: {
      UF_CRM_KC_BOOKED_MANAGER:  managerId,
      UF_CRM_KC_BOOKED_TIME:     fromDt,
      UF_CRM_KC_BOOKED_EVENT_ID: eventId
    },
    params: { REGISTER_SONET_EVENT: 'N' }
  }, function (result) {
    if (result.error()) showError('Ошибка сохранения записи: ' + result.error());
  });
}

function notifyManager(managerId, slot, lead) {
  const label = slot.start.toLocaleString('ru-RU', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
  });
  BX24.callMethod('im.notify', {
    to:      managerId,
    message: `Новая запись: ${lead.fullName || 'Клиент'} — ${label}`,
    type:    'NOTIFY'
  }, function () {});
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
