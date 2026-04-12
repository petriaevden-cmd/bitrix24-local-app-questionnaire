/**
 * polling.js — периодическое обновление расписания
 *
 * Интервал берётся из APP_CONFIG.pollingMs (задан в index.php из config.php).
 *
 * Условие запуска обновления:
 *   - loadAllSlots() доступна (функция из calendar.js)
 *   - _currentDay инициализирован (не null) — значит initCalendar() уже отработал
 *
 * Была ошибка: проверка typeof _currentCalId — эта переменная
 * нигде не объявлялась в calendar.js (там нет выбора одного МП —
 * расписание грузится сразу для всех). setInterval никогда не срабатывал.
 */

'use strict';

function startPolling() {
  const ms = (window.APP_CONFIG || {}).pollingMs || 30000;

  function tick() {
    // Проверяем: calendar.js инициализирован (_currentDay не null)
    // и функция loadAllSlots доступна
    if (typeof loadAllSlots === 'function' &&
        typeof _currentDay !== 'undefined' && _currentDay !== null) {
      loadAllSlots();
    }
  }

  setInterval(tick, ms);
}
