/**
 * app.js — инициализация приложения
 *
 * 1. BX24.init → получаем leadId из placement
 * 2. batch: crm.lead.get + user.current
 * 3. Заполняем шапку: имя текущего пользователя + заголовок лида
 * 4. initForm(lead)     — рендер полей, в т.ч. KC_CLIENT_CITY
 * 5. setClientCity(city, true)  — передаём город silent-режиме: только устанавливает _clientUtc,
 *                                  НЕ вызывает loadAllSlots (избегаем двойного запроса)
 * 6. initCalendar()             — теперь _clientUtc уже установлен, вызывает loadAllSlots один раз
 * 7. startPolling()
 */

'use strict';

let leadId           = null;
let currentUser      = null;
let CURRENT_USERNAME = '';

BX24.init(function () {
  const placement = BX24.placement.info();
  leadId = parseInt(placement.options.ID, 10);

  if (!leadId) {
    showError('Не удалось получить ID лида из плейсмента Bitrix24.');
    return;
  }

  BX24.callBatch(
    {
      getLead:        ['crm.lead.get',  { id: leadId }],
      getCurrentUser: ['user.current',  {}]
    },
    function (results) {
      if (results.getLead.error()) {
        showError('Ошибка загрузки лида: ' + results.getLead.error());
        return;
      }

      const lead = results.getLead.data();
      currentUser = results.getCurrentUser.data();

      // ФИО из user.current
      CURRENT_USERNAME = [
        currentUser.LAST_NAME,
        currentUser.NAME,
        currentUser.SECOND_NAME
      ].filter(Boolean).join(' ').trim() || 'Пользователь';

      // Шапка
      const titleEl = document.getElementById('lead-title');
      if (titleEl) titleEl.textContent = lead.TITLE || ('Лид #' + leadId);

      const userEl = document.getElementById('bx24-user');
      if (userEl) userEl.textContent = CURRENT_USERNAME;

      // Скрыть лоадер, показать форму
      const loading = document.getElementById('loading');
      if (loading) loading.classList.add('hidden');

      const form = document.getElementById('anketa-form');
      if (form) {
        form.classList.remove('hidden');
        // flex-col уже прописан в HTML-классах, добавляем только display
        form.style.display = 'flex';
      }

      // ── Порядок инициализации важен ──────────────────────────────────────
      // 1. Сначала рендерим форму — поле f-UF_CRM_KC_CLIENT_CITY появляется в DOM
      if (typeof initForm === 'function') initForm(lead);

      // 2. Передаём город из лида в calendar ДО initCalendar.
      //    silent=true: только устанавливает _clientUtc, НЕ вызывает loadAllSlots.
      //    Это исправляет двойной вызов loadAllSlots (баг 2):
      //    раньше setClientCity + initCalendar оба вызывали loadAllSlots = 22 API-запроса.
      //    Теперь loadAllSlots вызывается только один раз — внутри initCalendar.
      if (typeof setClientCity === 'function') {
        setClientCity((lead.UF_CRM_KC_CLIENT_CITY || '').trim(), true);
      }

      // 3. Теперь инициализируем календарь — _clientUtc уже не null (если город есть)
      if (typeof initCalendar  === 'function') initCalendar();
      if (typeof startPolling  === 'function') startPolling();
    }
  );
});

/** Показать ошибку (Flowbite Alert) */
function showError(msg) {
  const loading = document.getElementById('loading');
  if (loading) loading.classList.add('hidden');

  const wrap = document.getElementById('error-msg');
  const text = document.getElementById('error-text');
  if (wrap && text) {
    text.textContent = msg;
    wrap.classList.remove('hidden');
    wrap.classList.add('flex');
  }
}

/** Показать успех (Flowbite Alert, автоскрытие 4 с) */
function showSuccess() {
  const el = document.getElementById('success-msg');
  if (!el) return;
  el.classList.remove('hidden');
  el.classList.add('flex');

  const now     = new Date();
  const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  const status = document.getElementById('save-status');
  if (status) status.textContent = 'Сохранено в ' + timeStr;

  const saved = document.getElementById('last-saved');
  if (saved) saved.textContent = 'Сохранено в ' + timeStr;

  setTimeout(function () {
    el.classList.add('hidden');
    el.classList.remove('flex');
  }, 4000);
}
