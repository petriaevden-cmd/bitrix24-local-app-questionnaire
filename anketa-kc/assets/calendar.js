/**
 * calendar.js — работа с календарём менеджеров
 *
 * Функции:
 * - initManagerList(managers)  — рендер списка менеджеров
 * - refreshManagerSlots(id)    — обновление слотов одного менеджера
 * - refreshAllManagerSlots()   — обновление всех менеджеров
 * - generateWorkSlots(...)     — генерация рабочих 30-мин слотов
 * - slotsOverlap(slot, event)  — проверка пересечения с занятым событием
 * - bookSlot(slot, managerId)  — бронирование слота (calendar.event.add)
 */

'use strict';

// TODO: получить из config.php через PHP-вставку или window-переменную
const WORK_START = 9;
const WORK_END   = 20;
const SLOT_MIN   = 30;
const MANAGERS_LIST = []; // заполняется из initManagerList

/**
 * Инициализация списка менеджеров в блоке «Запись»
 * @param {Array} managers
 */
function initManagerList(managers) {
  MANAGERS_LIST.length = 0;
  managers.forEach(m => MANAGERS_LIST.push(m.ID));
  // TODO: отрендерить UI список менеджеров со слотами
  console.log('initManagerList', managers);
}

/**
 * Генерация рабочих слотов на N дней вперёд
 * @param {string} dateFrom  YYYY-MM-DD
 * @param {string} dateTo    YYYY-MM-DD
 * @returns {Array} [{start: Date, end: Date}]
 */
function generateWorkSlots(dateFrom, dateTo) {
  const slots = [];
  // TODO: реализовать генерацию по WORKDAYS, WORK_START, WORK_END, SLOT_MIN
  return slots;
}

/**
 * Проверка пересечения слота с событием из Б24
 * @param {{start: Date, end: Date}} slot
 * @param {Object} event  — объект calendar.event.get
 * @returns {boolean}
 */
function slotsOverlap(slot, event) {
  // TODO: реализовать сравнение дат с учётом UTC
  return false;
}

/**
 * Обновление свободных слотов менеджера
 * @param {number} managerId
 */
function refreshManagerSlots(managerId) {
  const now    = new Date();
  const future = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const fmt    = d => d.toISOString().slice(0, 10);

  BX24.callMethod('calendar.event.get', {
    type:    'user',
    ownerId: managerId,
    from:    fmt(now),
    to:      fmt(future)
  }, function (result) {
    if (result.error()) {
      console.warn('calendar.event.get error:', result.error());
      return;
    }
    const busyEvents = result.data().filter(ev =>
      ev.DELETED !== 'Y' &&
      ev.DT_SKIP_TIME !== 'Y' &&
      ev.ACCESSIBILITY !== 'free'
    );
    const allSlots  = generateWorkSlots(fmt(now), fmt(future));
    const freeSlots = allSlots.filter(slot =>
      !busyEvents.some(ev => slotsOverlap(slot, ev))
    );
    renderManagerSlots(managerId, freeSlots);
  });
}

/**
 * Рендер слотов менеджера в UI
 * @param {number} managerId
 * @param {Array}  freeSlots
 */
function renderManagerSlots(managerId, freeSlots) {
  // TODO: реализовать отрисовку кнопок слотов
  console.log('renderManagerSlots', managerId, freeSlots);
}

/**
 * Бронирование слота: создаём событие в Б24 и сохраняем в лид
 * @param {{start: Date, end: Date}} slot
 * @param {number} managerId
 * @param {Object} lead  — объект лида
 */
function bookSlot(slot, managerId, lead) {
  const fmt = dt => dt.toLocaleString('ru-RU', {
    year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit'
  }).replace(',', '');

  BX24.callMethod('calendar.event.add', {
    type:          'user',
    ownerId:       managerId,
    from:          fmt(slot.start),
    to:            fmt(slot.end),
    name:          lead.fullName || 'Клиент',
    // TODO: добавить PORTAL_URL из PHP
    description:   `${lead.fullName} — запись от менеджера ${CURRENT_USERNAME}`,
    accessibility: 'busy',
    importance:    'normal',
    ismeeting:     'Y',
    attendees:     [managerId],
    color:         '#FF6600',
    crmfields:     [{ TYPE: 'LEAD', ID: leadId }]
  }, function (result) {
    if (result.error()) {
      showError('Ошибка бронирования: ' + result.error());
      return;
    }
    const eventId = result.data();
    saveBookingToLead(managerId, fmt(slot.start), eventId);
    refreshAllManagerSlots();
    notifyManager(managerId, slot, lead);
  });
}

/**
 * Сохранение данных бронирования в поля лида
 */
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

/**
 * Уведомление менеджера через im.notify
 */
function notifyManager(managerId, slot, lead) {
  // TODO: форматирование сообщения
  BX24.callMethod('im.notify', {
    to:      managerId,
    message: `Новая запись: ${lead.fullName || 'Клиент'} — TODO: время`,
    type:    'NOTIFY'
  }, function () {});
}

function refreshAllManagerSlots() {
  MANAGERS_LIST.forEach(id => refreshManagerSlots(id));
}
