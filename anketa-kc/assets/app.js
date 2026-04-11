/**
 * app.js — инициализация приложения
 * Запускает BX24.init, получает placement info (leadId),
 * делает batch-запрос: crm.lead.get + user.current + user.get (менеджеры)
 *
 * UI-состояния управляются через Tailwind utility-классы (hidden, flex, etc.)
 */

'use strict';

let leadId = null;
let currentUser = null;
let CURRENT_USERNAME = '';
let managers = [];

BX24.init(function () {
  const placement = BX24.placement.info();
  leadId = parseInt(placement.options.ID, 10);

  if (!leadId) {
    showError('Не удалось получить ID лида из плейсмента.');
    return;
  }

  // Batch: получаем лид, текущего пользователя и список менеджеров
  BX24.callBatch(
    {
      getLead:        ['crm.lead.get',    { id: leadId }],
      getCurrentUser: ['user.current',    {}],
      // TODO: заменить SALES_DEPT_ID на реальное значение из config.php (передать через PHP)
      getManagers:    ['user.get', { filter: { UF_DEPARTMENT: '__SALES_DEPT_ID__' }, select: ['ID','NAME','LASTNAME','PERSONALPHOTO'] }]
    },
    function (results) {
      if (results.getLead.error()) {
        showError('Ошибка загрузки лида: ' + results.getLead.error());
        return;
      }

      const lead    = results.getLead.data();
      currentUser   = results.getCurrentUser.data();
      managers      = results.getManagers.data() || [];

      CURRENT_USERNAME = [currentUser.LASTNAME, currentUser.NAME, currentUser.SECONDNAME]
        .filter(Boolean).join(' ').trim();

      // Обновляем шапку
      const titleEl = document.getElementById('lead-title');
      if (titleEl) titleEl.textContent = lead.TITLE || ('Лид #' + leadId);

      const userEl = document.getElementById('bx24-user');
      if (userEl) userEl.textContent = CURRENT_USERNAME || 'Пользователь';

      initForm(lead);
      initManagerList(managers);
      startPolling();

      // Скрываем лоадер, показываем форму
      const loading = document.getElementById('loading');
      if (loading) loading.classList.add('hidden');

      const form = document.getElementById('anketa-form');
      if (form) {
        form.classList.remove('hidden');
        form.classList.add('flex');
      }
    }
  );
});

/**
 * Показать сообщение об ошибке (Flowbite Alert)
 * @param {string} msg
 */
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

/**
 * Показать сообщение об успехе (Flowbite Alert, автоскрытие через 4с)
 */
function showSuccess() {
  const el = document.getElementById('success-msg');
  if (!el) return;
  el.classList.remove('hidden');
  el.classList.add('flex');

  const status = document.getElementById('save-status');
  if (status) {
    const now = new Date();
    status.textContent = 'Сохранено в ' + now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  const saved = document.getElementById('last-saved');
  if (saved) {
    const now = new Date();
    saved.textContent = 'Сохранено в ' + now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  setTimeout(function () {
    el.classList.add('hidden');
    el.classList.remove('flex');
  }, 4000);
}
