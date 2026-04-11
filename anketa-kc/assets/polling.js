/**
 * polling.js — периодическое обновление расписания
 *
 * Интервал берётся из APP_CONFIG.pollingMs (задан в index.php из config.php).
 * Вызывает loadSlots() из calendar.js если МП выбран.
 */

'use strict';

function startPolling() {
  const ms = (window.APP_CONFIG || {}).pollingMs || 30000;

  setInterval(function () {
    if (typeof loadSlots === 'function' && typeof _currentCalId !== 'undefined' && _currentCalId) {
      loadSlots();
    }
  }, ms);
}
