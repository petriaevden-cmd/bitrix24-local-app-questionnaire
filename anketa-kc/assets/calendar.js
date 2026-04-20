/**
 * calendar.js — расписание менеджеров по продажам (МП) в табличном виде.
 *
 * Внешний вид таблицы:
 *   - Строки = МП (только короткое служебное название, без имени сотрудника).
 *   - Столбцы = часовые слоты текущего выбранного дня.
 *
 * Ключевые зависимости:
 *   - MP_CONFIG (mp-config.js)  — словарь конфигурации всех МП.
 *   - CITIES_TZ (cities.js)     — словарь смещений UTC для городов клиентов.
 *   - form.js                   — содержит функцию escHtml(), должен подключаться ДО calendar.js.
 *   - BX24 JS SDK               — Bitrix24-библиотека для вызовов API.
 *
 * Логика занятости слотов, учёт временных зон и автопереход на следующий день
 * не изменяются при добавлении/удалении МП — всё управляется через MP_CONFIG.
 */

'use strict'; // Включаем строгий режим JS: запрещает необъявленные переменные,
              // устаревший синтаксис и помогает поймать ошибки на этапе разработки.

// ══════════════════════════════════════════════════════════════════════════════
// БЛОК 1: ПОСТРОЕНИЕ СЛОВАРЯ МП ИЗ КОНФИГУРАЦИИ
// ══════════════════════════════════════════════════════════════════════════════

/**
 * buildMpCalendars() — динамически строит рабочий словарь MP_CALENDARS
 * из конфигурационного объекта MP_CONFIG (определён в mp-config.js).
 *
 * ЗАЧЕМ: MP_CONFIG — единственный источник правды о МП. Все остальные части
 * приложения работают уже с MP_CALENDARS, который содержит только нужные поля
 * в удобном формате. Это разделение позволяет менять конфигурацию в одном месте.
 *
 * Формат MP_CONFIG:
 *   {
 *     "mp1": {
 *       bitrixUserId: 42,    // числовой ID пользователя в Bitrix24
 *       name: "Иван Иванов", // полное имя МП (для UI не используется — берётся short)
 *       city: "Москва",      // город МП → нужен для определения его UTC-смещения
 *       workStart: "09:00",  // начало рабочего дня (строка HH:MM)
 *       workEnd:   "18:00",  // конец рабочего дня (строка HH:MM)
 *       workDays:  [1,2,3,4,5], // рабочие дни недели (0=воскресенье, 6=суббота)
 *       slotMinutes: 60,     // длительность одного слота в минутах
 *       active: true         // false — МП не отображается в календаре
 *     }
 *   }
 *
 * Возвращает объект вида:
 *   {
 *     "MP42Vstrechi": {
 *       label: "Иван Иванов",  // полное имя (не отображается в таблице)
 *       short: "МП 42",        // короткий идентификатор для строки таблицы
 *       utc:   3,              // UTC-смещение города МП в часах
 *       from:  9,              // час начала работы
 *       to:    18              // час окончания работы (слот 18:xx не создаётся)
 *     }
 *   }
 */
function buildMpCalendars() {
  // Если MP_CONFIG не подключён или ещё не загружен — возвращаем пустой объект,
  // чтобы избежать ошибки «undefined is not an object».
  if (typeof MP_CONFIG === 'undefined') return {};

  const result = {}; // Сюда будем собирать итоговый словарь МП.

  // Перебираем все ключи MP_CONFIG (например "mp1", "mp2", ...).
  Object.keys(MP_CONFIG).forEach(function (id) {
    const mp = MP_CONFIG[id]; // Конфиг конкретного МП.

    // Пропускаем неактивных МП — они не должны появляться в таблице.
    if (!mp.active) return;

    // Определяем UTC-смещение города МП через вспомогательную функцию _getCityTz().
    // Если getCityTZ из cities.js недоступна — считаем смещение равным 0 (UTC+0).
    const utc = (typeof getCityTZ === 'function')
      ? (getCityTZ(mp.city) || 0)
      : 0;

    // Формируем ключ calId в формате «MP<N>Vstrechi» — такой же формат использует
    // Bitrix24 для идентификации пользовательских календарей встреч.
    // Именно этот ключ передаётся в calendar.accessibility.get.
    const calId = 'MP' + mp.bitrixUserId + 'Vstrechi';

    // Извлекаем часы начала и конца рабочего дня из строки "HH:MM".
    // parseInt(..., 10) — обязательно указываем основание 10, чтобы "09" не трактовалось как восьмеричное.
    const startH = parseInt((mp.workStart || '09:00').split(':')[0], 10);
    const endH   = parseInt((mp.workEnd   || '18:00').split(':')[0], 10);

    // Записываем готовую запись в результирующий словарь.
    result[calId] = {
      label: mp.name,           // Полное имя МП (в таблице не отображается).
      short: 'МП ' + mp.bitrixUserId, // Короткое название — показывается в строке таблицы.
      utc:   utc,               // UTC-смещение часового пояса МП.
      from:  startH,            // Час начала рабочего дня.
      to:    endH               // Час окончания (не включается: последний слот = endH-1).
    };
  });

  return result; // Возвращаем готовый словарь всех активных МП.
}

// MP_CALENDARS — основной рабочий словарь МП, используемый всеми функциями файла.
// Инициализируется один раз при первом вызове initCalendar().
// Объявляем здесь как null, чтобы явно показать: до инициализации данных нет.
let MP_CALENDARS = null;

// ══════════════════════════════════════════════════════════════════════════════
// БЛОК 2: ВСПОМОГАТЕЛЬНАЯ ОБЁРТКА ДЛЯ ПОЛУЧЕНИЯ UTC-СМЕЩЕНИЯ ГОРОДА
// ══════════════════════════════════════════════════════════════════════════════

/**
 * _getCityTz(cityName) — возвращает числовое UTC-смещение (в часах) для города.
 *
 * ЗАЧЕМ ОБЁРТКА: В проекте есть два возможных источника данных о часовых поясах:
 *   1. Функция getCityTZ(), объявленная в cities.js (предпочтительный вариант).
 *   2. Прямой доступ к объекту CITIES_TZ, тоже из cities.js (запасной вариант).
 * Обёртка унифицирует доступ к обоим источникам и возвращает null, если город
 * не найден — это позволяет коду-потребителю явно проверять наличие данных.
 *
 * @param {string} cityName — название города, например "Москва".
 * @returns {number|null} — смещение UTC в часах (например, 3 для Москвы) или null.
 */
function _getCityTz(cityName) {
  // Если в cities.js определена функция getCityTZ — используем её (она может
  // содержать дополнительную логику нормализации строки).
  if (typeof getCityTZ === 'function') return getCityTZ(cityName);

  // Запасной вариант: прямой поиск в объекте CITIES_TZ.
  // !== undefined — важно: смещение 0 (UTC+0) не должно считаться «не найденным».
  if (typeof CITIES_TZ !== 'undefined' && CITIES_TZ[cityName] !== undefined) return CITIES_TZ[cityName];

  // Город не найден ни в одном источнике.
  return null;
}

// ══════════════════════════════════════════════════════════════════════════════
// БЛОК 3: ПЕРЕМЕННЫЕ СОСТОЯНИЯ МОДУЛЯ
// ══════════════════════════════════════════════════════════════════════════════

// _currentDay — текущий отображаемый день (объект Date, время сброшено в 00:00:00).
// Меняется при навигации кнопками «←» / «→» и при автопереходе на следующий день.
let _currentDay    = null;

// _clientUtc — UTC-смещение часового пояса клиента (целое число, часы).
// null означает «неизвестен» — тогда заголовки таблицы показываются в UTC+0.
// Устанавливается через setClientCity() при выборе клиентом своего города.
let _clientUtc     = null;

// _autoJumpCount — счётчик автоматических переходов на следующий день,
// когда свободных слотов меньше порога minSlots (из APP_CONFIG).
// Нужен для предотвращения бесконечной рекурсии.
let _autoJumpCount = 0;

// MAX_AUTO_JUMP — максимальное число автоматических переходов вперёд.
// Если за 14 дней не нашлось слотов — показываем сообщение «Нет слотов».
const MAX_AUTO_JUMP = 14;

// _busyCache — кеш занятых событий по calId.
// Формат: { "MP42Vstrechi": [ {DATE_FROM, DATE_TO, ACCESSIBILITY, ...}, ... ] }
// Заполняется асинхронно в loadAllSlots() по одному МП за раз.
// Сбрасывается при каждом вызове loadAllSlots().
let _busyCache   = {};

// _loadedCount — сколько МП уже ответили на запрос calendar.accessibility.get.
// Когда _loadedCount === _totalToLoad, вызывается renderTable().
let _loadedCount = 0;

// _totalToLoad — общее число МП, для которых нужно загрузить расписание.
// Определяется в начале loadAllSlots() как Object.keys(MP_CALENDARS).length.
let _totalToLoad = 0;

// _bookingInProgress — флаг защиты от двойного бронирования.
// true: пользователь нажал «Подтвердить запись», но ответ БП ещё не пришёл.
// В этом состоянии повторный клик игнорируется.
let _bookingInProgress = false;

// ══════════════════════════════════════════════════════════════════════════════
// БЛОК 4: ИНИЦИАЛИЗАЦИЯ КАЛЕНДАРЯ
// ══════════════════════════════════════════════════════════════════════════════

/**
 * initCalendar() — точка входа. Вызывается один раз из app.js после загрузки страницы.
 *
 * Порядок действий:
 *   1. Строим MP_CALENDARS из MP_CONFIG (один раз на всю сессию).
 *   2. Находим ближайший рабочий день от сегодня (nextWorkday).
 *   3. Навешиваем обработчики на кнопки навигации «←» и «→».
 *   4. Загружаем расписание для найденного дня (loadAllSlots).
 *
 * ВАЖНО: к моменту вызова initCalendar() функция setClientCity() уже должна быть
 * вызвана с флагом silent=true (это делает app.js), чтобы _clientUtc был установлен
 * до первой загрузки данных — иначе слоты отфильтруются без учёта TZ клиента.
 */
function initCalendar() {
  // Баг 4 fix: строим MP_CALENDARS из MP_CONFIG строго один раз при инициализации.
  // Повторное построение не нужно — конфигурация МП не меняется в ходе сессии.
  MP_CALENDARS = buildMpCalendars();

  // Определяем стартовый день: ближайший день, когда хотя бы один МП работает.
  // new Date() — текущий момент в локальном времени браузера.
  _currentDay = nextWorkday(new Date());

  // Получаем ссылки на кнопки навигации по дням.
  const btnPrev = document.getElementById('btn-day-prev'); // кнопка «← предыдущий день»
  const btnNext = document.getElementById('btn-day-next'); // кнопка «→ следующий день»

  // Навешиваем обработчики только если кнопки реально есть в DOM
  // (защита от ошибки при неполной HTML-разметке).
  if (btnPrev) btnPrev.addEventListener('click', function () { shiftDay(-1); }); // -1 = назад
  if (btnNext) btnNext.addEventListener('click', function () { shiftDay(+1); }); // +1 = вперёд

  // Баг 2 fix: loadAllSlots() вызывается здесь один раз.
  // Второй вызов из setClientCity() предотвращается флагом silent=true в app.js.
  loadAllSlots();
}

// ══════════════════════════════════════════════════════════════════════════════
// БЛОК 5: УТИЛИТЫ ДЛЯ РАБОТЫ С ДАТАМИ И НАВИГАЦИЕЙ
// ══════════════════════════════════════════════════════════════════════════════

/**
 * nextWorkday(d) — возвращает ближайший рабочий день начиная с даты d (включительно).
 *
 * ЛОГИКА: перебирает дни от d вперёд (не более 7 итераций) и проверяет,
 * есть ли хотя бы один МП, у которого этот день недели входит в workDays.
 * Если MP_CONFIG не загружен или нет данных о рабочих днях — возвращает d без изменений
 * (т.е. «считаем, что все дни рабочие»).
 *
 * @param {Date} d — начальная дата поиска.
 * @returns {Date} — нормализованный Date (время 00:00:00) ближайшего рабочего дня.
 */
function nextWorkday(d) {
  const dt = new Date(d);     // Копируем дату, чтобы не изменять оригинал.
  dt.setHours(0, 0, 0, 0);   // Сбрасываем время до начала суток (00:00:00.000).

  // Получаем объединённое множество рабочих дней всех активных МП (0–6, где 0=вс).
  var allWorkDays = _getAllWorkDays();

  // Если данных нет (MP_CONFIG не загружен или у всех МП нет workDays) —
  // считаем, что сегодня рабочий день, возвращаем как есть.
  if (allWorkDays.length === 0) return dt;

  // Перебираем дни вперёд: максимум 7 итераций (полная неделя).
  // indexOf !== -1 означает «этот день недели присутствует в списке рабочих».
  for (var i = 0; i < 7; i++) {
    if (allWorkDays.indexOf(dt.getDay()) !== -1) return dt; // Нашли — возвращаем.
    dt.setDate(dt.getDate() + 1); // Переходим к следующему дню.
  }

  // На случай если ни один день не подошёл (теоретически невозможно при корректных данных).
  return dt;
}

/**
 * shiftDay(delta) — переключает текущий день на delta шагов в нужном направлении,
 * при этом пропускает дни, когда все МП выходные.
 *
 * ЛОГИКА:
 *   1. Сдвигаемся на 1 день в направлении delta (±1).
 *   2. Если новый день — выходной для всех МП, продолжаем сдвигаться
 *      (в том же направлении) до рабочего дня. Максимум 7 итераций.
 *   3. Сбрасываем счётчик автопереходов (пользователь явно выбрал день).
 *   4. Перезагружаем расписание для нового дня.
 *
 * @param {number} delta — направление: +1 (вперёд) или -1 (назад).
 */
function shiftDay(delta) {
  if (!_currentDay) return; // Защита: если initCalendar ещё не вызван — выходим.

  const dt = new Date(_currentDay); // Копируем текущий день.
  var allWorkDays = _getAllWorkDays(); // Множество рабочих дней всех МП.

  // Первый шаг: обязательно сдвигаемся хотя бы на 1 день в нужном направлении.
  dt.setDate(dt.getDate() + delta);

  // Если есть данные о рабочих днях — пропускаем нерабочие.
  if (allWorkDays.length > 0) {
    for (var i = 0; i < 7; i++) {
      if (allWorkDays.indexOf(dt.getDay()) !== -1) break; // День рабочий — останавливаемся.
      // Продолжаем сдвиг в том же направлении (delta > 0 → +1, иначе -1).
      dt.setDate(dt.getDate() + (delta > 0 ? 1 : -1));
    }
  }

  _currentDay    = dt; // Сохраняем новый день как текущий.
  _autoJumpCount = 0;  // Пользователь явно сменил день — сбрасываем счётчик автопереходов.
  loadAllSlots();      // Загружаем расписание для нового дня.
}

/**
 * _getAllWorkDays() — собирает объединение (union) рабочих дней недели
 * из конфигураций всех активных МП.
 *
 * ЗАЧЕМ: используется в nextWorkday() и shiftDay() для определения,
 * является ли конкретный день недели рабочим хотя бы для одного МП.
 * Это позволяет навигации не «застрять» на выходных, когда ни один МП не работает.
 *
 * @returns {number[]} — массив уникальных номеров дней недели, например [1,2,3,4,5].
 *                       Пустой массив означает «данных нет».
 */
function _getAllWorkDays() {
  // Если MP_CONFIG не загружен — данных нет, возвращаем пустой массив.
  if (typeof MP_CONFIG === 'undefined') return [];

  var days = {}; // Используем объект как set для дедупликации дней.

  Object.keys(MP_CONFIG).forEach(function (id) {
    var mp = MP_CONFIG[id];
    // Пропускаем неактивных МП и тех, у кого не задан workDays.
    if (!mp.active || !mp.workDays) return;
    // Добавляем каждый рабочий день в «set».
    mp.workDays.forEach(function (d) { days[d] = true; });
  });

  // Возвращаем ключи объекта как числа: Object.keys возвращает строки, поэтому парсим.
  return Object.keys(days).map(function (k) { return parseInt(k, 10); });
}

// ══════════════════════════════════════════════════════════════════════════════
// БЛОК 6: ФОРМАТИРОВАНИЕ ДАТ И ВРЕМЕНИ
// ══════════════════════════════════════════════════════════════════════════════

/**
 * fmtHour(utcMs, offsetH) — форматирует UTC-момент в строку "HH:MM"
 * с учётом указанного UTC-смещения в часах.
 *
 * ЗАЧЕМ: один и тот же UTC-момент нужно показывать по-разному —
 * в часовом поясе МП (в кнопках строки) и в часовом поясе клиента (в заголовке).
 *
 * Работает через getUTCHours/getUTCMinutes вместо getHours/getMinutes,
 * потому что к переданному utcMs мы уже прибавили смещение: сдвинули «UTC-часы»
 * в нужный пояс и читаем их как UTC — это обходит зависимость от locale браузера.
 *
 * @param {number} utcMs    — время в миллисекундах от эпохи Unix (UTC).
 * @param {number} offsetH  — UTC-смещение в часах (например, 3 для Москвы).
 * @returns {string} — строка вида "09:00", "14:30".
 */
function fmtHour(utcMs, offsetH) {
  // Прибавляем смещение (в мс) к UTC-моменту, получаем «локальное» время как UTC.
  const local = new Date(utcMs + offsetH * 3600000);
  // padStart(2, '0') добавляет ведущий ноль: 9 → "09".
  return String(local.getUTCHours()).padStart(2, '0') + ':' +
         String(local.getUTCMinutes()).padStart(2, '0');
}

/**
 * fmtDate(d) — форматирует Date в читабельную русскую строку для заголовка таблицы.
 *
 * Пример вывода: «пятница, 23 мая».
 * Использует встроенный Intl.DateTimeFormat через toLocaleDateString.
 *
 * @param {Date} d — дата для форматирования.
 * @returns {string} — например "пятница, 23 мая".
 */
function fmtDate(d) {
  // 'ru-RU' — локаль для русского языка и правил форматирования.
  // weekday: 'long' — полное название дня недели.
  // day: 'numeric', month: 'long' — число и полное название месяца.
  return d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
}

/**
 * fmtBxUTC(utcMs) — форматирует UTC-момент в строку ISO-8601 с явным UTC-суффиксом.
 *
 * ЗАЧЕМ: именно этот формат ожидают поля типа «Дата/время» в Bitrix24 CRM,
 * например поле UF_CRM_KC_BOOKED_TIME лида.
 *
 * Пример вывода: "2025-05-23T14:00:00+00:00"
 *
 * @param {number} utcMs — время в мс от Unix-эпохи.
 * @returns {string} — строка в формате "YYYY-MM-DDTHH:MM:SS+00:00".
 */
function fmtBxUTC(utcMs) {
  const d = new Date(utcMs); // Создаём Date из UTC-миллисекунд.
  // Вспомогательная функция для добавления ведущего нуля к числу.
  const p = function (n) { return String(n).padStart(2, '0'); };
  // Собираем строку вручную — не используем toISOString(), чтобы контролировать формат.
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) +
    'T' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':00+00:00';
}

/**
 * fmtBpDateTime(utcMs, offsetH) — форматирует UTC-момент в строку
 * для параметров бизнес-процесса Bitrix24: "dd.mm.YYYY HH:MM:SS".
 *
 * ЗАЧЕМ: бизнес-процесс «Назначить встречу» принимает дату и время встречи
 * в параметрах DateTime (время МП) и DateTimeClient (время клиента).
 * Формат «dd.mm.YYYY HH:MM:SS» — это стандарт Bitrix24 для параметров БП.
 *
 * @param {number} utcMs    — время в мс от Unix-эпохи.
 * @param {number} offsetH  — UTC-смещение в часах (МП или клиента).
 * @returns {string} — например "23.05.2025 14:00:00".
 */
function fmtBpDateTime(utcMs, offsetH) {
  // Прибавляем смещение к UTC, чтобы читать «локальное» время через getUTC*.
  var d = new Date(utcMs + offsetH * 3600000);
  // Вспомогательная функция для добавления ведущего нуля.
  var p = function (n) { return String(n).padStart(2, '0'); };
  // Собираем строку в формате "dd.mm.YYYY HH:MM:SS".
  return p(d.getUTCDate()) + '.' + p(d.getUTCMonth() + 1) + '.' + d.getUTCFullYear() +
    ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':00';
}

// ══════════════════════════════════════════════════════════════════════════════
// БЛОК 7: ЧТЕНИЕ ГОРОДА/TZ КЛИЕНТА ИЗ ФОРМЫ
// ══════════════════════════════════════════════════════════════════════════════

/**
 * getClientUtcFromForm() — читает выбранный клиентом город из поля формы
 * и возвращает соответствующее UTC-смещение.
 *
 * ОТКУДА БЕРЁТ TZ: смотрит в select/input с id="f-UF_CRM_KC_CLIENT_CITY"
 * (поле «Ваш город» в анкете клиента). Значение этого поля — название города
 * по-русски, например "Новосибирск". Затем ищет смещение через _getCityTz().
 *
 * Баг 3/7 fix: используем _getCityTz() (а не прямое обращение к CITIES_TZ),
 * чтобы задействовать полный словарь из cities.js с нормализацией строки.
 *
 * @returns {number|null} — UTC-смещение в часах или null если город не найден
 *                          или поле не заполнено.
 */
function getClientUtcFromForm() {
  // Получаем элемент поля «Город» из DOM.
  const el = document.getElementById('f-UF_CRM_KC_CLIENT_CITY');
  // Если поле отсутствует в разметке или пустое — возвращаем null.
  if (!el || !el.value) return null;
  // Ищем UTC-смещение для указанного города.
  // trim() убирает случайные пробелы вокруг значения.
  const tz = _getCityTz(el.value.trim());
  // Проверяем явно на null/undefined — ноль (UTC+0) должен считаться валидным смещением.
  return (tz !== null && tz !== undefined) ? tz : null;
}

// ══════════════════════════════════════════════════════════════════════════════
// БЛОК 8: ЗАГРУЗКА РАСПИСАНИЯ ВСЕХ МП ЗА ДЕНЬ
// ══════════════════════════════════════════════════════════════════════════════

/**
 * loadAllSlots() — главная функция загрузки: запрашивает занятость каждого МП
 * через Bitrix24 API и по завершении всех запросов вызывает renderTable().
 *
 * ПОШАГОВАЯ ЛОГИКА:
 *   1. Обновляем _clientUtc из формы (на случай если пользователь сменил город).
 *   2. Сбрасываем кеш занятости и счётчики.
 *   3. Показываем индикатор загрузки (спиннер).
 *   4. Для каждого calId из MP_CALENDARS вызываем calendar.accessibility.get
 *      с диапазоном [dayStart, dayEnd).
 *   5. В колбэке каждого запроса:
 *      - Фильтруем события: оставляем только «busy» и «absent» (занятые).
 *      - Сохраняем в _busyCache[calId].
 *      - Инкрементируем _loadedCount.
 *      - Если все запросы завершены (_loadedCount === _totalToLoad) → renderTable().
 */
function loadAllSlots() {
  // Актуализируем часовой пояс клиента из формы перед каждой загрузкой.
  _clientUtc   = getClientUtcFromForm();
  // Очищаем кеш занятости от предыдущей загрузки.
  _busyCache   = {};
  // Сбрасываем счётчик завершённых запросов.
  _loadedCount = 0;
  // Считаем, сколько МП нужно опросить.
  _totalToLoad = Object.keys(MP_CALENDARS || {}).length;

  // Обновляем заголовок с датой в шапке таблицы.
  const dateEl = document.getElementById('schedule-date');
  if (dateEl) dateEl.textContent = fmtDate(_currentDay);

  // Показываем спиннер пока данные загружаются.
  showTableLoading();

  // Вспомогательная функция для ведущего нуля (используется в fmtISO).
  const pad    = function (n) { return String(n).padStart(2, '0'); };
  // Форматирует Date в строку "YYYY-MM-DD" — формат, принимаемый calendar.accessibility.get.
  const fmtISO = function (d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  };

  // Начало дня: _currentDay с временем 00:00:00.
  const dayStart = new Date(_currentDay);
  // Конец дня: следующие сутки (открытый интервал «до полуночи»).
  const dayEnd   = new Date(_currentDay);
  dayEnd.setDate(dayEnd.getDate() + 1); // +1 день = следующие 00:00

  // Запускаем параллельные запросы для каждого МП.
  Object.keys(MP_CALENDARS || {}).forEach(function (calId) {
    // calendar.accessibility.get — метод Bitrix24 REST API.
    // Возвращает события из календаря calId в диапазоне [from, to).
    BX24.callMethod('calendar.accessibility.get', {
      from: fmtISO(dayStart), // Начало диапазона в формате "YYYY-MM-DD".
      to:   fmtISO(dayEnd),   // Конец диапазона (не включается).
      type: 'calendar',        // Тип источника — пользовательский календарь.
      ids:  [calId]            // Массив идентификаторов календарей.
    }, function (result) {
      if (!result.error()) {
        // Успешный ответ: фильтруем только действительно занятые события.
        // 'busy' — МП занят (обычная встреча/звонок).
        // 'absent' — МП отсутствует (отпуск, больничный и т.д.).
        // Свободные и tentative события НЕ блокируют слот.
        _busyCache[calId] = (result.data() || []).filter(function (ev) {
          return ev.ACCESSIBILITY === 'busy' || ev.ACCESSIBILITY === 'absent';
        });
      } else {
        // Ошибка API: считаем этого МП полностью свободным,
        // чтобы не скрыть доступные слоты из-за сетевой ошибки.
        _busyCache[calId] = [];
      }
      // Инкрементируем счётчик завершённых запросов.
      _loadedCount++;
      // Когда все МП ответили — переходим к рендерингу таблицы.
      if (_loadedCount === _totalToLoad) renderTable();
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// БЛОК 9: ГЕНЕРАЦИЯ СВОБОДНЫХ СЛОТОВ ДЛЯ ОДНОГО МП
// ══════════════════════════════════════════════════════════════════════════════

/**
 * buildFreeSlots(mp, day, busy) — вычисляет список свободных временных слотов
 * для одного МП на указанный день.
 *
 * ПОШАГОВАЯ ЛОГИКА:
 *   1. Перебираем часы от mp.from до mp.to-1 (рабочее время МП).
 *   2. Для каждого часа h вычисляем его UTC-начало:
 *      UTC = локальный час МП - UTC-смещение МП.
 *   3. Пропускаем прошедшие слоты (slotEndUtcMs <= now).
 *   4. Если TZ клиента известен: пропускаем слоты вне комфортных часов клиента
 *      (clientHrMin..clientHrMax из APP_CONFIG).
 *   5. Проверяем пересечение с занятыми событиями из busy.
 *   6. Если слот свободен — добавляем в результат.
 *
 * @param {object} mp  — запись из MP_CALENDARS: { utc, from, to, label, short }.
 * @param {Date}   day — день (время = 00:00:00).
 * @param {Array}  busy — массив занятых событий из _busyCache для этого МП.
 * @returns {Array} — массив объектов { utcMs, endUtcMs, mpUtc }.
 */
function buildFreeSlots(mp, day, busy) {
  // Читаем глобальные настройки приложения (APP_CONFIG из app-config.js или пустой объект).
  const cfg       = window.APP_CONFIG || {};
  // Длительность одного слота в мс (по умолчанию 60 минут = 60 × 60 000 мс).
  const slotMs    = (cfg.slotMin    || 60) * 60000;
  // Минимальный комфортный час для клиента (по умолчанию 9 утра).
  const clientMin = cfg.clientHrMin || 9;
  // Максимальный комфортный час для клиента (по умолчанию 20:00).
  const clientMax = cfg.clientHrMax || 20;
  // Текущий момент в мс — нужен для отсечения прошедших слотов.
  const now       = Date.now();
  const slots     = []; // Массив свободных слотов.

  // Перебираем каждый рабочий час МП от начала до конца рабочего дня.
  for (let h = mp.from; h < mp.to; h++) {
    // Вычисляем UTC-начало слота: МП работает в локальный час h,
    // а в UTC это h минус его UTC-смещение.
    // Date.UTC возвращает мс от эпохи, используем getUTC* поля day, чтобы не зависеть от TZ браузера.
    const slotUtcMs    = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), h - mp.utc, 0, 0, 0);
    // UTC-конец слота.
    const slotEndUtcMs = slotUtcMs + slotMs;

    // Отсечение прошедших слотов: если слот уже закончился — пропускаем.
    if (slotEndUtcMs <= now) continue;

    // Фильтр по часовому поясу клиента: если TZ клиента известен,
    // не предлагаем слоты, которые для него слишком ранние или поздние.
    if (_clientUtc !== null) {
      // Вычисляем, в какой час для клиента попадает начало этого слота.
      const clientHour = new Date(slotUtcMs + _clientUtc * 3600000).getUTCHours();
      // clientHour < clientMin — слишком рано для клиента.
      // clientHour >= clientMax — слишком поздно для клиента.
      if (clientHour < clientMin || clientHour >= clientMax) continue;
    }

    // Проверяем, не занят ли слот событием из _busyCache.
    // Алгоритм пересечения интервалов: A и B пересекаются, если A.start < B.end && A.end > B.start.
    const isBusy = busy.some(function (ev) {
      // DATE_FROM и DATE_TO — строки в формате, который Date умеет парсить.
      const evFrom = new Date(ev.DATE_FROM).getTime();
      const evTo   = new Date(ev.DATE_TO).getTime();
      // Слот пересекается с событием — значит занят.
      return slotUtcMs < evTo && slotEndUtcMs > evFrom;
    });

    // Если слот занят — пропускаем.
    if (isBusy) continue;

    // Слот прошёл все проверки — добавляем в список свободных.
    // Сохраняем mpUtc, чтобы renderTable мог показать время в TZ МП.
    slots.push({ utcMs: slotUtcMs, endUtcMs: slotEndUtcMs, mpUtc: mp.utc });
  }

  return slots; // Возвращаем список свободных слотов.
}

// ══════════════════════════════════════════════════════════════════════════════
// БЛОК 10: СБОР ЗАГОЛОВКОВ ТАБЛИЦЫ (УНИКАЛЬНЫЕ UTC-МОМЕНТЫ)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * collectAllHours(slotsMap) — собирает отсортированный список уникальных
 * UTC-моментов из слотов всех МП для построения заголовков колонок таблицы.
 *
 * ЗАЧЕМ: таблица «МП × часы» требует общего набора временных колонок.
 * Разные МП могут иметь разные рабочие часы, но в заголовке нужно показать
 * объединение всех доступных моментов. В ячейке будет либо кнопка (если слот
 * свободен у данного МП), либо индикатор занятости/вне графика.
 *
 * Заголовок колонки — время клиента (если TZ известен) или UTC+0 (если нет).
 * Кнопка внутри строки МП — время МП (рендерится в renderTable отдельно).
 *
 * @param {object} slotsMap — { calId: [{ utcMs, endUtcMs, mpUtc }, ...] }
 * @returns {Array} — отсортированный массив { utcMs: number, label: string }.
 */
function collectAllHours(slotsMap) {
  const utcSet = {}; // Объект-«set» для дедупликации: utcMs → true.

  // Проходим по всем МП и всем их слотам.
  Object.keys(slotsMap).forEach(function (calId) {
    (slotsMap[calId] || []).forEach(function (slot) {
      utcSet[slot.utcMs] = true; // Добавляем UTC-момент в set (дубликаты автоматически игнорируются).
    });
  });

  return Object.keys(utcSet)
    .map(function (k) { return parseInt(k, 10); }) // Ключи объекта — строки, конвертируем в числа.
    .sort(function (a, b) { return a - b; })        // Сортируем по возрастанию времени.
    .map(function (utcMs) {
      // Определяем смещение для отображения: если TZ клиента известен — его, иначе UTC+0.
      const displayOffset = (_clientUtc !== null) ? _clientUtc : 0;
      // Форматируем метку заголовка в виде "HH:MM".
      const label = fmtHour(utcMs, displayOffset);
      return { utcMs: utcMs, label: label }; // Пара: числовой UTC-момент + текстовая метка.
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// БЛОК 11: РЕНДЕРИНГ ТАБЛИЦЫ РАСПИСАНИЯ
// ══════════════════════════════════════════════════════════════════════════════

// _onRenderComplete — колбэк, вызываемый после завершения рендера таблицы.
// Используется внешним кодом (app.js) для разблокировки кнопки «Обновить расписание».
// Баг 6 fix: устанавливается снаружи перед вызовом loadAllSlots(), сбрасывается после вызова.
let _onRenderComplete = null;

/**
 * renderTable() — строит HTML-таблицу «МП × часовые слоты» и вставляет её в DOM.
 *
 * ПОШАГОВАЯ ЛОГИКА:
 *   1. Для каждого МП вычисляем свободные слоты через buildFreeSlots().
 *   2. Если суммарное число свободных слотов < minSlots И счётчик автопереходов
 *      не превышен → сдвигаемся на следующий рабочий день и повторяем loadAllSlots().
 *   3. Если свободных слотов нет совсем (после исчерпания автопереходов) →
 *      показываем сообщение об отсутствии слотов.
 *   4. Строим THEAD: строка-подпись (поясняет логику двух времён) + строка заголовков колонок.
 *   5. Строим TBODY: по одной строке на каждого МП.
 *      В каждой ячейке: кнопка (свободный слот) / красный кружок (занято) / серая полоса (вне графика).
 *   6. Добавляем легенду под таблицей.
 *   7. Вызываем _onRenderComplete (если установлен).
 */
function renderTable() {
  // Получаем контейнер таблицы расписания.
  const panel = document.getElementById('slots-panel');
  if (!panel) return; // Нет контейнера — рендеринг невозможен.

  const slotsMap = {}; // Здесь будем хранить свободные слоты по calId.
  let totalFree  = 0;  // Общее число свободных слотов по всем МП.

  // Вычисляем свободные слоты для каждого МП.
  Object.keys(MP_CALENDARS || {}).forEach(function (calId) {
    const mp    = MP_CALENDARS[calId];                   // Конфиг МП.
    const busy  = _busyCache[calId] || [];               // Занятые события (из кеша).
    const slots = buildFreeSlots(mp, _currentDay, busy); // Список свободных слотов.
    slotsMap[calId] = slots;
    totalFree += slots.length; // Считаем общее число свободных слотов.
  });

  // Читаем минимальный порог слотов для показа таблицы (по умолчанию 3).
  const cfg      = window.APP_CONFIG || {};
  const minSlots = cfg.minSlots || 3;

  // Автопереход: если слотов мало и лимит автопереходов не исчерпан →
  // переходим на следующий рабочий день и перезапускаем загрузку.
  if (totalFree < minSlots && _autoJumpCount < MAX_AUTO_JUMP) {
    _autoJumpCount++; // Фиксируем ещё один автопереход.
    const nextDay = new Date(_currentDay);
    nextDay.setDate(nextDay.getDate() + 1); // Сдвигаемся на 1 день вперёд.
    _currentDay = nextWorkday(nextDay);      // Находим ближайший рабочий день от nextDay.
    // Обновляем дату в заголовке (чтобы пользователь видел изменение).
    const dateEl = document.getElementById('schedule-date');
    if (dateEl) dateEl.textContent = fmtDate(_currentDay);
    loadAllSlots(); // Запускаем загрузку для нового дня.
    return;         // Прерываем текущий рендер — он будет вызван заново.
  }
  // Сбрасываем счётчик после завершения серии автопереходов.
  _autoJumpCount = 0;

  // Финальное обновление заголовка с датой (после возможных автопереходов).
  const dateEl = document.getElementById('schedule-date');
  if (dateEl) dateEl.textContent = fmtDate(_currentDay);

  // Если слотов нет совсем — показываем информационное сообщение.
  if (totalFree === 0) {
    panel.innerHTML =
      '<p class="text-xs text-gray-400 text-center py-8">' +
      'Нет свободных слотов в ближайшие ' + MAX_AUTO_JUMP + ' рабочих дней</p>';
    return;
  }

  // Собираем отсортированный список уникальных UTC-моментов для заголовков колонок.
  const allHours    = collectAllHours(slotsMap);
  // Флаг: известен ли TZ клиента (влияет на цвет заголовков и подсказки).
  const hasClientTz = _clientUtc !== null;

  // Создаём обёртку с горизонтальной прокруткой (для широких таблиц на мобильных).
  const wrap = document.createElement('div');
  wrap.className = 'overflow-x-auto';

  // Создаём элемент таблицы.
  const table = document.createElement('table');
  table.className = 'w-full text-xs border-collapse';

  // ── THEAD: заголовочная часть таблицы ────────────────────────────────────

  const thead = document.createElement('thead');

  // Строка-подпись: объясняет пользователю, чьё время показано в заголовке (клиента)
  // и чьё — на кнопках (МП).
  const trCaption = document.createElement('tr');
  const thCaption = document.createElement('th');
  // Colspan = все колонки слотов + 1 (колонка «МП») = занимает всю ширину.
  thCaption.colSpan = allHours.length + 1;
  thCaption.className = 'px-3 pt-2 pb-1 text-left border-b border-gray-100 bg-gray-50';
  // Если TZ клиента известен — показываем детальное пояснение с цветовой кодировкой.
  // Иначе — упрощённое пояснение без цвета.
  thCaption.innerHTML = hasClientTz
    ? '<span class="text-[11px] text-gray-500">' +
      '<span class="inline-block w-2.5 h-2.5 rounded-sm bg-blue-100 border border-blue-300 align-middle mr-1"></span>' +
      'Заголовок колонки — <strong class="text-blue-600">время клиента</strong> (UTC+' + _clientUtc + ')' +
      '&ensp;·&ensp;' +
      '<span class="inline-block w-2.5 h-2.5 rounded-sm bg-green-50 border border-green-300 align-middle mr-1"></span>' +
      'Кнопка в строке — <strong class="text-green-700">время МП</strong>' +
      '</span>'
    : '<span class="text-[11px] text-gray-400">Заголовок колонки — UTC · Кнопка в строке — время МП</span>';
  trCaption.appendChild(thCaption);
  thead.appendChild(trCaption);

  // Строка заголовков колонок (угловая ячейка «МП» + временны́е метки).
  const trHead = document.createElement('tr');

  // Угловая ячейка «МП» — sticky: остаётся видимой при горизонтальной прокрутке.
  const thCorner = document.createElement('th');
  thCorner.className = 'sticky left-0 z-10 bg-gray-50 text-left py-2 px-3 font-semibold text-gray-600 border-b border-r border-gray-200 whitespace-nowrap min-w-[64px]';
  thCorner.textContent = 'МП';
  trHead.appendChild(thCorner);

  // Заголовочные ячейки для каждого временно́го слота.
  allHours.forEach(function (col) {
    const th = document.createElement('th');
    // Синий фон для заголовков — визуально отличает «время клиента» от «времени МП» в кнопках.
    th.className = 'py-2 px-2 font-semibold border-b border-gray-200 text-center whitespace-nowrap min-w-[72px] bg-blue-50';
    // Если TZ клиента известен — выделяем метку синим шрифтом; иначе — серым.
    th.innerHTML = hasClientTz
      ? '<span class="font-mono text-blue-700">' + escHtml(col.label) + '</span>'
      : '<span class="font-mono text-gray-600">' + escHtml(col.label) + '</span>';
    trHead.appendChild(th);
  });

  thead.appendChild(trHead);
  table.appendChild(thead);

  // ── TBODY: строки по каждому МП ──────────────────────────────────────────

  const tbody = document.createElement('tbody');

  // Для каждого МП создаём строку таблицы.
  Object.keys(MP_CALENDARS || {}).forEach(function (calId, rowIdx) {
    const mp    = MP_CALENDARS[calId]; // Конфиг МП.
    const slots = slotsMap[calId] || []; // Его свободные слоты.

    // Создаём быстрый lookup: utcMs → объект слота (для O(1) поиска при рендере ячейки).
    const slotsByUtc = {};
    slots.forEach(function (s) { slotsByUtc[s.utcMs] = s; });

    const tr = document.createElement('tr');
    // Чередуем фон строк для читаемости (зебра-полосатость).
    tr.className = (rowIdx % 2 === 0) ? 'bg-white' : 'bg-gray-50/50';

    // Ячейка с названием МП (короткое, без имени сотрудника).
    // sticky left-0: не прокручивается по горизонтали вместе с таблицей.
    const tdMp = document.createElement('td');
    tdMp.className = 'sticky left-0 z-10 py-2 px-3 border-b border-r border-gray-200 whitespace-nowrap font-medium text-gray-700 ' +
      ((rowIdx % 2 === 0) ? 'bg-white' : 'bg-gray-50');
    // Показываем только короткое название: "МП 42" (без имени сотрудника — конфиденциальность).
    tdMp.textContent = mp.short;
    tr.appendChild(tdMp);

    // Для каждой колонки (UTC-момента) создаём ячейку.
    allHours.forEach(function (col) {
      const td = document.createElement('td');
      td.className = 'py-1.5 px-1.5 border-b border-gray-100 text-center';

      // Баг 1 fix: col.utcMs — реальный UTC-момент, ищем напрямую без пересчёта.
      // Ранее была ошибка: к col.utcMs прибавлялось смещение МП, что давало неверный ключ.
      const slot = slotsByUtc[col.utcMs];

      if (slot) {
        // ── СЛОТ СВОБОДЕН: показываем кнопку бронирования ───────────────

        const btn = document.createElement('button');
        btn.type = 'button';
        // data-атрибуты нужны для _highlightSelectedSlot() — поиск кнопки по CSS-селектору.
        btn.dataset.calId  = calId;
        btn.dataset.utcMs  = slot.utcMs;
        btn.className =
          'slot-btn w-full rounded-md bg-green-50 border border-green-200 text-green-700 ' +
          'text-[11px] font-medium px-1.5 py-1 hover:bg-green-100 hover:text-gray-900 hover:border-green-400 ' +
          'transition-colors whitespace-nowrap tabular-nums';
        // Текст кнопки — время МП (не клиента), чтобы МП понял, когда ему работать.
        const mpTime = fmtHour(slot.utcMs, mp.utc);
        btn.textContent = mpTime;
        // Tooltip: показывает оба времени — МП и клиента (если TZ клиента известен).
        btn.title = hasClientTz
          ? 'Время МП: ' + mpTime + ' (UTC+' + mp.utc + ')\nВремя клиента: ' + fmtHour(slot.utcMs, _clientUtc) + ' (UTC+' + _clientUtc + ')'
          : 'Записать на ' + mpTime + ' (UTC+' + mp.utc + ')';
        // При клике: сначала выделяем кнопку визуально, затем показываем форму подтверждения.
        btn.addEventListener('click', function () {
          _highlightSelectedSlot(calId, slot.utcMs); // Подсветка выбранной кнопки.
          selectSlot(calId, slot);                    // Показ панели бронирования.
        });
        td.appendChild(btn);

      } else {
        // ── СЛОТ НЕ СВОБОДЕН: показываем индикатор ───────────────────────

        // Определяем причину: занят (в рабочее время) или вне рабочего графика МП.
        const inWorkHours = (function () {
          // Баг 1 fix: col.utcMs — реальный UTC, прибавляем смещение МП для получения локального часа.
          const slotLocalH = new Date(col.utcMs + mp.utc * 3600000).getUTCHours();
          // Проверяем, попадает ли этот час в рабочий диапазон МП.
          return slotLocalH >= mp.from && slotLocalH < mp.to;
        }());

        const span = document.createElement('span');
        if (inWorkHours) {
          // Красный кружок — слот в рабочие часы, но занят событием из календаря.
          span.className = 'inline-block w-5 h-5 rounded-full bg-red-100 border border-red-200 align-middle';
          span.title     = 'Занято';
        } else {
          // Серая полоса — слот вне рабочего графика этого МП.
          span.className = 'inline-block w-4 h-1 rounded bg-gray-100 align-middle';
          span.title     = 'Вне рабочего времени';
        }
        td.appendChild(span);
      }

      tr.appendChild(td); // Добавляем ячейку в строку.
    });

    tbody.appendChild(tr); // Добавляем строку МП в тело таблицы.
  });

  table.appendChild(tbody);
  wrap.appendChild(table);

  // Заменяем содержимое панели новой таблицей.
  panel.innerHTML = '';
  panel.appendChild(wrap);

  // Легенда под таблицей: объясняет значение цветовых индикаторов.
  const legend = document.createElement('div');
  legend.className = 'flex items-center gap-4 mt-3 px-1';
  legend.innerHTML =
    '<span class="flex items-center gap-1.5 text-[11px] text-gray-500">' +
    '<span class="inline-block w-4 h-4 rounded bg-green-50 border border-green-200"></span>Свободно</span>' +
    '<span class="flex items-center gap-1.5 text-[11px] text-gray-500">' +
    '<span class="inline-block w-4 h-4 rounded bg-red-100 border border-red-200"></span>Занято</span>' +
    '<span class="flex items-center gap-1.5 text-[11px] text-gray-500">' +
    '<span class="inline-block w-4 h-1 rounded bg-gray-100 border border-gray-200"></span>Вне графика</span>';
  panel.appendChild(legend);

  // Баг 6 fix: уведомляем внешний код о завершении рендера таблицы.
  // Сбрасываем колбэк после вызова, чтобы он не сработал повторно.
  if (typeof _onRenderComplete === 'function') {
    _onRenderComplete();
    _onRenderComplete = null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// БЛОК 12: ОПЦИИ КАНАЛА КОНСУЛЬТАЦИИ
// ══════════════════════════════════════════════════════════════════════════════

/**
 * CONSULTATION_CHANNELS — список доступных каналов для проведения консультации.
 *
 * ЗАЧЕМ: при бронировании встречи клиент выбирает, как именно пройдёт консультация.
 * Выбранный канал передаётся в параметре ConsultationChannel бизнес-процесса
 * «Назначить встречу» и сохраняется в лиде, чтобы МП знал, как связаться с клиентом.
 *
 * Формат каждого элемента:
 *   { value: строка для БП/БД, label: отображаемый текст в select-е }
 */
var CONSULTATION_CHANNELS = [
  { value: 'Звонок',           label: 'Звонок' },           // Обычный телефонный звонок.
  { value: 'WhatsApp',         label: 'WhatsApp' },          // Мессенджер WhatsApp.
  { value: 'Telegram',         label: 'Telegram' },          // Мессенджер Telegram.
  { value: 'Яндекс Телемост',  label: 'Яндекс Телемост' }   // Видеоконференция через Яндекс.
];

// ══════════════════════════════════════════════════════════════════════════════
// БЛОК 13: ВЫБОР СЛОТА — ПОКАЗ ПАНЕЛИ ПОДТВЕРЖДЕНИЯ
// ══════════════════════════════════════════════════════════════════════════════

/**
 * selectSlot(calId, slot) — показывает панель подтверждения бронирования
 * после того, как пользователь кликнул на свободный слот.
 *
 * ЧТО ОТОБРАЖАЕТ:
 *   - Короткое имя МП.
 *   - Время МП в его часовом поясе.
 *   - Время клиента (если TZ известен).
 *   - Select «Канал консультации» (Звонок / WhatsApp / Telegram / Яндекс Телемост).
 *   - Кнопку «Подтвердить запись».
 *
 * ТАКЖЕ записывает в скрытые поля формы calId и UTC-время слота,
 * чтобы при submit формы (если таковой есть) данные бронирования не потерялись.
 *
 * @param {string} calId — идентификатор календаря МП, например "MP42Vstrechi".
 * @param {object} slot  — объект { utcMs, endUtcMs, mpUtc }.
 */
function selectSlot(calId, slot) {
  // Получаем конфиг МП из словаря (или пустой объект при отсутствии).
  const mp = (MP_CALENDARS || {})[calId] || {};
  const bookingBody = document.getElementById('booking-body'); // Панель с деталями бронирования.

  if (bookingBody) {
    // Формируем список опций для select «Канал консультации».
    var channelOpts = CONSULTATION_CHANNELS.map(function (ch) {
      // escHtml() экранирует спецсимволы HTML — защита от XSS.
      return '<option value="' + escHtml(ch.value) + '">' + escHtml(ch.label) + '</option>';
    }).join('');

    // Вставляем HTML-разметку панели бронирования.
    bookingBody.innerHTML =
      '<div class="space-y-2">' +
      // Строка: имя МП.
      '<div class="text-xs text-gray-500">МП: <span class="font-semibold text-gray-800">' + escHtml(mp.short) + '</span></div>' +
      // Строка: время МП в его TZ.
      '<div class="text-xs text-gray-500">Время МП: <span class="font-mono font-semibold text-gray-800">' +
        escHtml(fmtHour(slot.utcMs, mp.utc)) + ' UTC+' + mp.utc + '</span></div>' +
      // Строка: время клиента (отображается только если TZ клиента известен).
      (_clientUtc !== null
        ? '<div class="text-xs text-gray-500">Время клиента: <span class="font-mono font-semibold text-blue-600">' +
          escHtml(fmtHour(slot.utcMs, _clientUtc)) + ' UTC+' + _clientUtc + '</span></div>'
        : '') +
      // Селект «Канал консультации».
      '<div class="flex flex-col gap-0.5">' +
        '<label for="bp-channel" class="text-[11px] font-medium text-gray-500">Канал консультации</label>' +
        '<select id="bp-channel" class="bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-md ' +
          'focus:ring-blue-500 focus:border-blue-500 block w-full px-2 py-1">' +
          channelOpts + // Список опций канала.
        '</select>' +
      '</div>' +
      // Кнопка подтверждения бронирования.
      '<button type="button" id="btn-book-confirm" ' +
        'class="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 transition-colors">' +
        '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>' +
        'Подтвердить запись</button>' +
      '</div>';

    // Навешиваем обработчик на кнопку «Подтвердить запись».
    var confirmBtn = document.getElementById('btn-book-confirm');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', function () {
        // Защита от двойного клика: если бронирование уже идёт — игнорируем.
        if (_bookingInProgress) return;
        _bookingInProgress = true;    // Ставим флаг блокировки.
        confirmBtn.disabled = true;   // Блокируем кнопку визуально.
        confirmBtn.textContent = 'Запись...'; // Показываем состояние ожидания.
        bookSlot(calId, slot);         // Запускаем бронирование.
      });
    }
  }

  // Сохраняем данные о выбранном МП и времени в скрытые поля формы.
  // Это нужно на случай, если форма будет отправлена стандартным способом (submit).
  setHiddenField('UF_CRM_KC_BOOKED_MANAGER', calId);                          // calId МП.
  setHiddenField('UF_CRM_KC_BOOKED_TIME', new Date(slot.utcMs).toISOString()); // UTC-время слота в ISO.
}

// ══════════════════════════════════════════════════════════════════════════════
// БЛОК 14: БРОНИРОВАНИЕ — ЗАПУСК БИЗНЕС-ПРОЦЕССА «НАЗНАЧИТЬ ВСТРЕЧУ»
// ══════════════════════════════════════════════════════════════════════════════

/**
 * bookSlot(calId, slot) — выполняет фактическое бронирование встречи:
 *   1. Запускает бизнес-процесс Bitrix24 через bizproc.workflow.start.
 *   2. После успешного запуска БП — сохраняет данные в поля лида (saveBookingToLead).
 *   3. Пишет комментарий в таймлайн лида (notifyMpByCalId).
 *   4. Обновляет таблицу расписания (слот становится занятым).
 *   5. Показывает подтверждение пользователю.
 *
 * ПАРАМЕТРЫ БИЗНЕС-ПРОЦЕССА:
 *   - DateTime        — дата/время встречи в локальном времени МП (dd.mm.YYYY HH:MM:SS).
 *   - DateTimeClient  — та же встреча в локальном времени клиента (или времени МП если TZ неизвестен).
 *   - CalendarMenager — calId календаря МП (например "MP42Vstrechi").
 *   - ConsultationChannel — выбранный канал консультации (из select #bp-channel).
 *
 * @param {string} calId — идентификатор календаря МП.
 * @param {object} slot  — объект { utcMs, endUtcMs, mpUtc }.
 */
function bookSlot(calId, slot) {
  // leadId — глобальная переменная, определяемая в app.js (ID текущего лида).
  // Если она не задана — бронирование невозможно (некуда сохранять).
  if (typeof leadId === 'undefined') {
    _bookingInProgress = false; // Снимаем блокировку — действие не выполнено.
    return;
  }

  // Читаем ФИО клиента из поля формы (используется в таймлайн-комментарии).
  var fio = (document.getElementById('f-fio') || {}).value || 'Клиент';
  // Получаем конфиг МП из словаря.
  var mp  = (MP_CALENDARS || {})[calId] || {};
  // Глобальный конфиг приложения.
  var cfg = window.APP_CONFIG || {};

  // Читаем выбранный канал консультации из select-а.
  var channelEl = document.getElementById('bp-channel');
  var channel   = channelEl ? channelEl.value : 'Звонок'; // По умолчанию — звонок.

  // Форматируем время встречи для МП: перевод UTC → локальное время МП.
  // Пример: UTC 11:00, МП в UTC+3 → "14:00:00" в формате "dd.mm.YYYY HH:MM:SS".
  var dateTimeMp = fmtBpDateTime(slot.utcMs, mp.utc);

  // Форматируем время для клиента: если TZ клиента известен — его время,
  // иначе используем время МП (чтобы поле не пустовало).
  var clientOffset    = (_clientUtc !== null) ? _clientUtc : mp.utc;
  var dateTimeClient  = fmtBpDateTime(slot.utcMs, clientOffset);

  // Идентификатор календаря МП передаётся в БП как есть.
  var calendarManager = calId;

  // Запускаем бизнес-процесс Bitrix24 «Назначить встречу» через REST API.
  BX24.callMethod('bizproc.workflow.start', {
    TEMPLATE_ID: cfg.bpTemplateId || 40,                          // ID шаблона БП (настраивается в APP_CONFIG).
    DOCUMENT_ID: ['crm', 'CCrmDocumentLead', 'LEAD_' + leadId],  // Документ-лид, к которому привязываем встречу.
    PARAMETERS: {
      'DateTime':            dateTimeMp,       // Дата/время встречи в TZ МП.
      'DateTimeClient':      dateTimeClient,   // Дата/время встречи в TZ клиента.
      'CalendarMenager':     calendarManager,  // Идентификатор календаря МП (опечатка в параметре — намеренно: соответствует настройке БП).
      'ConsultationChannel': channel           // Выбранный канал консультации.
    }
  }, function (result) {
    // Снимаем флаг блокировки в любом случае (успех или ошибка).
    _bookingInProgress = false;

    if (result.error()) {
      // Ошибка запуска БП: показываем сообщение и разблокируем кнопку для повтора.
      showError('Ошибка запуска БП: ' + result.error());
      var confirmBtn = document.getElementById('btn-book-confirm');
      if (confirmBtn) {
        confirmBtn.disabled = false; // Разблокируем кнопку.
        confirmBtn.innerHTML =
          '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>' +
          ' Повторить'; // Меняем текст кнопки на «Повторить».
      }
      return;
    }

    // Успешный запуск БП: result.data() содержит ID запущенного экземпляра воркфлоу.
    var bpWorkflowId = result.data();

    // Сохраняем данные о встрече в поля лида (три поля: МП, время UTC, ID экземпляра БП).
    saveBookingToLead(calId, fmtBxUTC(slot.utcMs), bpWorkflowId);

    // Пишем информационный комментарий в таймлайн лида.
    notifyMpByCalId(calId, slot, fio, channel);

    // Сбрасываем счётчик автопереходов и перезагружаем расписание
    // (теперь слот будет помечен как занятый).
    _autoJumpCount = 0;
    loadAllSlots();

    // Показываем пользователю подтверждение успешной записи.
    var statusEl = document.getElementById('booking-status');
    if (statusEl) {
      statusEl.className = 'mt-2 p-2 rounded-lg bg-green-50 border border-green-200 text-xs text-green-800 flex items-center gap-1.5';
      statusEl.innerHTML =
        '<svg class="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">' +
          '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>' +
        '<span>Запись подтверждена: ' + escHtml(mp.short) + ', ' +
        escHtml(fmtHour(slot.utcMs, mp.utc)) + ' UTC+' + mp.utc +
        ', канал: ' + escHtml(channel) + '</span>';
      statusEl.classList.remove('hidden'); // Делаем блок статуса видимым.
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// БЛОК 15: СОХРАНЕНИЕ ДАННЫХ БРОНИРОВАНИЯ В ЛИД
// ══════════════════════════════════════════════════════════════════════════════

/**
 * saveBookingToLead(calId, fromDt, eventId) — обновляет три пользовательских поля
 * лида в Bitrix24 CRM данными о выполненном бронировании.
 *
 * ЧТО СОХРАНЯЕТ:
 *   - UF_CRM_KC_BOOKED_MANAGER  — calId МП, к которому записан клиент.
 *   - UF_CRM_KC_BOOKED_TIME     — UTC-время встречи в формате ISO ("YYYY-MM-DDTHH:MM:SS+00:00").
 *   - UF_CRM_KC_BOOKED_EVENT_ID — ID запущенного экземпляра бизнес-процесса (из bizproc.workflow.start).
 *
 * ЗАЧЕМ: эти поля используются для отображения информации о записи в карточке лида,
 * а также могут использоваться другими бизнес-процессами и отчётами.
 *
 * REGISTER_SONET_EVENT: 'N' — не создавать событие в ленте новостей Bitrix24
 * (чтобы не засорять ленту служебными обновлениями полей).
 *
 * @param {string} calId    — calId МП (например "MP42Vstrechi").
 * @param {string} fromDt   — UTC-время встречи в формате fmtBxUTC().
 * @param {string} eventId  — ID экземпляра бизнес-процесса или события.
 */
function saveBookingToLead(calId, fromDt, eventId) {
  BX24.callMethod('crm.lead.update', {
    id: leadId, // ID лида, определён глобально в app.js.
    fields: {
      UF_CRM_KC_BOOKED_MANAGER:  calId,    // Идентификатор МП.
      UF_CRM_KC_BOOKED_TIME:     fromDt,   // UTC-время встречи.
      UF_CRM_KC_BOOKED_EVENT_ID: eventId   // ID запущенного БП/события.
    },
    params: { REGISTER_SONET_EVENT: 'N' } // Не создаём запись в ленте активности.
  }, function (result) {
    // В случае ошибки показываем сообщение (не критично — встреча уже создана через БП).
    if (result.error()) showError('Ошибка сохранения записи: ' + result.error());
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// БЛОК 16: КОММЕНТАРИЙ В ТАЙМЛАЙН ЛИДА
// ══════════════════════════════════════════════════════════════════════════════

/**
 * notifyMpByCalId(calId, slot, leadName, channel) — добавляет информационный
 * комментарий в таймлайн лида о выполненном бронировании.
 *
 * ЗАЧЕМ: менеджер, открывший лид в Bitrix24, сразу видит в таймлайне,
 * к какому МП, на какое время и через какой канал записан клиент.
 * Это дополняет уведомление от БП и служит документацией в истории лида.
 *
 * Пример текста комментария:
 *   «Запись к МП 42 на 14:00 UTC+3. Клиент: Иван Иванов. Канал: WhatsApp»
 *
 * @param {string} calId     — calId МП.
 * @param {object} slot      — объект слота { utcMs, ... }.
 * @param {string} leadName  — ФИО клиента из поля формы.
 * @param {string} channel   — выбранный канал консультации.
 */
function notifyMpByCalId(calId, slot, leadName, channel) {
  // Получаем конфиг МП для формирования читабельного имени в комментарии.
  var mp = (MP_CALENDARS || {})[calId] || {};
  // Формируем текст комментария: МП + время в его TZ + имя клиента + канал.
  var comment = 'Запись к ' + (mp.short || calId) + ' на ' +
    fmtHour(slot.utcMs, mp.utc) + ' UTC+' + mp.utc +
    '. Клиент: ' + leadName +
    (channel ? '. Канал: ' + channel : ''); // Канал добавляем только если он указан.

  // Добавляем комментарий в таймлайн через CRM REST API.
  BX24.callMethod('crm.timeline.comment.add', {
    fields: {
      ENTITY_ID:   leadId,   // ID лида.
      ENTITY_TYPE: 'lead',   // Тип сущности.
      COMMENT:     comment   // Текст комментария.
    }
  }, function () {}); // Колбэк пустой — ошибки комментария некритичны.
}

// ══════════════════════════════════════════════════════════════════════════════
// БЛОК 17: ВИЗУАЛЬНОЕ ВЫДЕЛЕНИЕ ВЫБРАННОГО СЛОТА
// ══════════════════════════════════════════════════════════════════════════════

/**
 * _highlightSelectedSlot(calId, utcMs) — снимает выделение со всех кнопок-слотов
 * и применяет стиль «выбрано» к нажатой кнопке.
 *
 * ЗАЧЕМ: даёт пользователю визуальное подтверждение того, какой слот он выбрал,
 * прежде чем подтвердить бронирование. Выбранная кнопка становится синей.
 *
 * ПОРЯДОК ВЫЗОВА: вызывается ДО selectSlot() в обработчике клика кнопки.
 * Это важно, потому что selectSlot может изменить DOM панели booking-body,
 * но сама таблица слотов не перестраивается.
 *
 * @param {string} calId  — calId МП выбранного слота.
 * @param {number} utcMs  — UTC-момент выбранного слота.
 */
function _highlightSelectedSlot(calId, utcMs) {
  var panel = document.getElementById('slots-panel'); // Контейнер таблицы.

  if (panel) {
    // Получаем все кнопки-слоты в таблице.
    var allBtns = panel.querySelectorAll('.slot-btn');
    for (var i = 0; i < allBtns.length; i++) {
      // Сначала снимаем все классы выделения со всех кнопок...
      allBtns[i].classList.remove(
        'slot-btn-selected',
        'bg-blue-600', 'border-blue-700', 'text-white', // Классы «выбранного» состояния.
        'bg-green-50', 'border-green-200', 'text-green-700' // Классы «свободного» состояния.
      );
      // ...и восстанавливаем базовый стиль «свободного» слота.
      allBtns[i].classList.add(
        'bg-green-50', 'border-green-200', 'text-green-700'
      );
    }
  }

  // Ищем именно нажатую кнопку по data-атрибутам calId и utcMs.
  // Атрибуты были проставлены при создании кнопки в renderTable().
  var selectedBtn = panel
    ? panel.querySelector(
        '.slot-btn[data-cal-id="' + calId + '"][data-utc-ms="' + utcMs + '"]'
      )
    : null;

  if (selectedBtn) {
    // Убираем зелёный стиль «свободного» состояния...
    selectedBtn.classList.remove(
      'bg-green-50', 'border-green-200', 'text-green-700'
    );
    // ...и применяем синий стиль «выбранного» состояния.
    selectedBtn.classList.add(
      'slot-btn-selected', 'bg-blue-600', 'border-blue-700', 'text-white'
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// БЛОК 18: ПУБЛИЧНЫЙ API ДЛЯ form.js
// ══════════════════════════════════════════════════════════════════════════════

/**
 * setClientCity(cityName, silent) — публичная функция для обновления
 * часового пояса клиента при изменении города в форме анкеты.
 *
 * ЗАЧЕМ: когда пользователь выбирает свой город в form.js, нужно обновить
 * _clientUtc и перерисовать таблицу, учитывая новый TZ.
 *
 * ФЛАГ silent:
 *   - silent=false (по умолчанию): обновляет _clientUtc И перезагружает расписание.
 *   - silent=true: только обновляет _clientUtc, без вызова loadAllSlots().
 *
 * Баг 2 fix: silent=true используется в app.js при инициализации.
 * app.js вызывает setClientCity(city, true) ДО initCalendar(), затем
 * initCalendar() сам вызывает loadAllSlots() один раз. Без этого флага
 * loadAllSlots вызывался бы дважды: из setClientCity и из initCalendar.
 *
 * @param {string|undefined} cityName — название города или undefined (тогда читаем из формы).
 * @param {boolean}          silent   — true = не вызывать loadAllSlots.
 */
function setClientCity(cityName, silent) {
  if (cityName !== undefined) {
    // Город передан явно: ищем его UTC-смещение.
    // Баг 3/7 fix: используем _getCityTz() для полного словаря городов из cities.js.
    const tz = _getCityTz(cityName);
    // Если смещение найдено (в том числе 0 = UTC+0) — сохраняем, иначе null.
    _clientUtc = (tz !== null && tz !== undefined) ? tz : null;
  } else {
    // Город не передан: читаем из поля формы.
    _clientUtc = getClientUtcFromForm();
  }

  // При явной смене города пользователем сбрасываем счётчик автопереходов,
  // чтобы поиск слотов начался заново с текущего дня.
  _autoJumpCount = 0;

  // Если silent=false — перезагружаем расписание с новым TZ клиента.
  if (!silent) loadAllSlots();
}

// ══════════════════════════════════════════════════════════════════════════════
// БЛОК 19: ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ══════════════════════════════════════════════════════════════════════════════

/**
 * showTableLoading() — заменяет содержимое panels-panel на анимированный спиннер
 * с текстом «Загрузка расписания всех МП…».
 *
 * ЗАЧЕМ: асинхронная загрузка данных (несколько параллельных запросов) занимает
 * заметное время. Спиннер даёт пользователю понять, что процесс идёт,
 * и предотвращает повторные клики «почему ничего не происходит».
 */
function showTableLoading() {
  const panel = document.getElementById('slots-panel'); // Контейнер таблицы.
  if (!panel) return; // Нет контейнера — ничего не делаем.
  // Заменяем содержимое панели на SVG-спиннер с текстом.
  panel.innerHTML =
    '<div class="flex items-center gap-2 py-8 justify-center text-xs text-gray-400">' +
    '<svg class="animate-spin w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24">' +
    // Анимация вращения задана Tailwind-классом animate-spin.
    '<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>' +
    '<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"></path></svg>' +
    'Загрузка расписания всех МП…</div>';
}

/**
 * setHiddenField(name, value) — создаёт или обновляет скрытый input в форме анкеты.
 *
 * ЗАЧЕМ: некоторые данные (выбранный МП, время бронирования) нужно передать
 * при submit формы. Скрытые поля — стандартный способ включить данные JS
 * в отправку HTML-формы. Если поле уже существует — просто обновляем значение,
 * не дублируем элемент.
 *
 * @param {string} name  — имя поля (также используется как id="hidden-<name>").
 * @param {string} value — значение поля.
 */
function setHiddenField(name, value) {
  // Пробуем найти уже существующий скрытый input с данным именем.
  let el = document.getElementById('hidden-' + name);
  if (!el) {
    // Поле не найдено — создаём новый input типа hidden.
    el = document.createElement('input');
    el.type = 'hidden';
    el.id   = 'hidden-' + name; // id для будущего поиска через getElementById.
    el.name = name;              // name — для включения в данные формы при submit.
    const form = document.getElementById('anketa-form'); // Родительская форма анкеты.
    if (form) form.appendChild(el); // Добавляем поле в форму.
  }
  el.value = value; // Устанавливаем (или обновляем) значение поля.
}

// ══════════════════════════════════════════════════════════════════════════════
// ПРИМЕЧАНИЕ: escHtml() не определяется здесь — она определена в form.js.
// form.js подключается в HTML ДО calendar.js, поэтому функция всегда доступна.
// Баг 5 fix: дублирование определения escHtml в calendar.js было удалено,
// чтобы избежать конфликта с версией из form.js.
// ══════════════════════════════════════════════════════════════════════════════
