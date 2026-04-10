/**
 * polling.js — polling-обновление слотов каждые 15 секунд
 *
 * Запускается после initManagerList().
 * Останавливается при закрытии вкладки (beforeunload).
 */

'use strict';

let pollingTimer = null;

/**
 * Запуск polling
 */
function startPolling() {
  if (pollingTimer) return; // уже запущен
  pollingTimer = setInterval(function () {
    refreshAllManagerSlots();
  }, 15000); // 15 сек
}

/**
 * Остановка polling
 */
function stopPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
}

window.addEventListener('beforeunload', stopPolling);
