/**
 * app.js — инициализация приложения
 * Запускает BX24.init, получает placement info (leadId),
 * делает batch-запрос: crm.lead.get + user.current + user.get (менеджеры)
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

      const lead = results.getLead.data();
      currentUser = results.getCurrentUser.data();
      managers = results.getManagers.data() || [];

      CURRENT_USERNAME = [currentUser.LASTNAME, currentUser.NAME, currentUser.SECONDNAME]
        .filter(Boolean).join(' ').trim();

      initForm(lead);
      initManagerList(managers);
      startPolling();

      document.getElementById('loading').style.display = 'none';
      document.getElementById('anketa-form').style.display = 'block';
    }
  );
});

function showError(msg) {
  document.getElementById('loading').style.display = 'none';
  const el = document.getElementById('error-msg');
  el.textContent = msg;
  el.style.display = 'block';
}

function showSuccess(msg) {
  const el = document.getElementById('success-msg');
  el.textContent = msg || 'Анкета успешно сохранена!';
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}
