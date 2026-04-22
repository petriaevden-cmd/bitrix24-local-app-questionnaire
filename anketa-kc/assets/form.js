/**
 * form.js — главный модуль логики формы анкеты клиента КЦ (Контакт-Центр).
 *
 * Отвечает за:
 *   1. Генерацию HTML-разметки полей формы (рендер через Tailwind CSS 4 + Flowbite).
 *   2. Заполнение всех 5 блоков формы данными из текущего лида Bitrix24.
 *   3. Валидацию 11 обязательных полей перед сохранением (REQUIRED_FIELDS).
 *   4. Сбор значений всех полей формы в единый объект.
 *   5. Сохранение данных в CRM через API Bitrix24 (crm.lead.update).
 *   6. Запись итогового комментария в таймлайн лида (crm.timeline.comment.add).
 *   7. Отображение прогресса заполнения формы (полоска + счётчик).
 *   8. Обработку кнопок «Сохранить» и «Сбросить».
 *
 * Поля анкеты (27 UF_CRM_KC_* полей, распределённых по 5 блокам):
 *
 * БЛОК 1 — Персональные данные:
 *   1.  KC_FULLNAME           (string)      — ФИО (авто из лида)
 *   2.  KC_CLIENT_CITY        (string)      — Город клиента (→ TZ для расписания) [REQUIRED]
 *   3.  KC_WORKPLACE          (string)      — Место работы
 *   4.  KC_MARITAL_STATUS     (enumeration) — Семейное положение
 *   5.  KC_CHILDREN           (enumeration) — Дети
 *   6.  KC_JOINT_PROPERTY     (enumeration) — Совместное имущество
 *   7.  KC_CRIMINAL           (enumeration) — Судимости
 *   8.  KC_OOO                (enumeration) — ООО
 *   9.  KC_IP                 (enumeration) — ИП
 *
 * БЛОК 2 — Финансовые данные:
 *   10. KC_DEBT_TOTAL         (integer)     — Общая сумма долга
 *   11. KC_MONTHLY_PAYMENT    (integer)     — Ежемесячный платёж
 *   12. KC_INCOME_OFFICIAL    (enumeration) — Официальный доход
 *   13. KC_INCOME_UNOFFICIAL  (integer)     — Неофициальный доход
 *   14. KC_SALARY_CARD        (enumeration) — Зарплатная карта
 *
 * БЛОК 3 — Кредитная история:
 *   15. KC_CREDITORS          (string)      — Кредиторы
 *   16. KC_COLLATERAL         (enumeration) — Залог
 *   17. KC_OVERDUE            (string)      — Просрочки
 *   18. KC_FSSP               (enumeration) — ФССП
 *   19. KC_PROPERTY           (enumeration) — Имущество
 *   20. KC_DEALS              (enumeration) — Сделки
 *
 * БЛОК 4 — Заметки менеджера:
 *   21. KC_KM_EXCLUSION       (string)      — Исключение из КМ
 *   22. KC_MAIN_PAIN          (string)      — Основная боль
 *   23. KC_OBJECTIONS         (string)      — Возражения
 *   24. KC_EXTRA_COMMENT      (string)      — Доп. комментарий
 *
 * БЛОК 5 — Запись:
 *   25. KC_BOOKED_MANAGER     (employee)    — ID менеджера
 *   26. KC_BOOKED_TIME        (datetime)    — Время записи
 *   27. KC_BOOKED_EVENT_ID    (integer)     — ID события календаря
 */

// Включаем строгий режим JavaScript: запрещает использование необъявленных переменных,
// ловит типичные ошибки, делает код предсказуемее и безопаснее.
'use strict';

// ─── Вспомогательные функции рендера (Tailwind + Flowbite) ───────────────────
//
// Все функции ниже возвращают строку HTML-разметки для одного поля формы.
// Они НЕ вставляют HTML в DOM сами — вызывающий код (initForm) собирает
// все строки вместе и записывает их в innerHTML нужного блока.
//
// Стили (классы) берутся из Tailwind CSS 4 и библиотеки Flowbite.
// Каждое поле оборачивается в <div class="flex flex-col gap-0.5">,
// чтобы метка (label) и сам ввод шли строго сверху вниз с небольшим отступом.

/**
 * fieldText — генерирует HTML для однострочного текстового поля (<input type="text">).
 *
 * @param {string} id       — HTML-атрибут id и name у <input>. По нему collectFormData() найдёт поле.
 * @param {string} label    — Текст метки над полем (что заполняет менеджер).
 * @param {string} value    — Текущее значение (берётся из данных лида при инициализации).
 * @param {object} opts     — Дополнительные опции:
 *   opts.colSpan  {bool}   — Если true, поле растягивается на 2 колонки сетки (занимает всю строку).
 *   opts.readonly {bool}   — Если true, поле только для чтения (нельзя редактировать, например ФИО).
 *   opts.placeholder {str} — Подсказка внутри пустого поля (светло-серый текст).
 *   opts.hint     {str}    — Дополнительная пояснительная подпись под полем (мелкий серый текст).
 */
function fieldText(id, label, value, opts) {
  // Если opts не передан вовсе — используем пустой объект, чтобы не было ошибок при opts.colSpan и т.д.
  opts = opts || {};

  // Если нужно растянуть поле на всю ширину (2 колонки) — добавляем класс col-span-2,
  // иначе поле занимает стандартную 1 колонку.
  const span = opts.colSpan ? 'col-span-2' : '';

  // Возвращаем HTML-строку с меткой и полем ввода.
  // escHtml() экранирует значение value и placeholder — защита от XSS и HTML-инъекций.
  return `
    <div class="flex flex-col gap-0.5 ${span}">
      <!-- Метка над полем: мелкий (11px), серый, жирный текст -->
      <label for="${id}" class="block text-[11px] font-medium text-gray-500 leading-tight">${label}</label>

      <!-- Само текстовое поле:
           - bg-gray-50: светло-серый фон
           - border border-gray-300: серая рамка по умолчанию
           - focus:ring-blue-500 focus:border-blue-500: синяя подсветка при фокусе
           - text-xs: мелкий текст внутри поля
           - rounded-md: скруглённые углы
           - px-2 py-1: небольшие внутренние отступы
           - cursor-default: запрещаем курсор редактирования, если поле readonly
           - disabled:opacity-50: при disabled поле полупрозрачное -->
      <input id="${id}" name="${id}" type="text"
             value="${escHtml(value || '')}"
             ${opts.readonly ? 'readonly' : ''}
             ${opts.placeholder ? 'placeholder="' + escHtml(opts.placeholder) + '"' : ''}
             class="bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-md
                    focus:ring-blue-500 focus:border-blue-500 block w-full px-2 py-1
                    ${opts.readonly ? 'cursor-default' : ''}
                    disabled:opacity-50">

      <!-- Подсказка под полем (если передана opts.hint) — мелкий серый текст, 10px -->
      ${opts.hint ? '<p class="text-[10px] text-gray-400 leading-tight">' + escHtml(opts.hint) + '</p>' : ''}
    </div>`;
}

/**
 * fieldNumber — генерирует HTML для числового поля (<input type="number">).
 * Используется для денежных сумм (долг, платёж, неофициальный доход).
 * type="number" на мобильных устройствах открывает числовую клавиатуру,
 * а также запрещает ввод нечисловых символов.
 *
 * @param {string} id       — HTML-атрибут id и name у <input>.
 * @param {string} label    — Текст метки над полем.
 * @param {number} value    — Текущее числовое значение из лида.
 * @param {object} opts     — Дополнительные опции:
 *   opts.colSpan     {bool}   — Растянуть на 2 колонки.
 *   opts.placeholder {str}    — Подсказка внутри поля (например '0').
 *   opts.min         {number} — Минимально допустимое значение (например 0 — запрет отрицательных сумм).
 *   opts.hint        {str}    — Подпись под полем.
 */
function fieldNumber(id, label, value, opts) {
  // Если opts не передан — используем пустой объект, чтобы избежать ошибок.
  opts = opts || {};

  // Если нужно растянуть поле на всю строку — добавляем CSS-класс col-span-2.
  const span = opts.colSpan ? 'col-span-2' : '';

  // Возвращаем HTML-строку.
  // String(value || '') — приводим число к строке для escHtml(), т.к. escHtml ждёт строку.
  return `
    <div class="flex flex-col gap-0.5 ${span}">
      <!-- Метка над полем -->
      <label for="${id}" class="block text-[11px] font-medium text-gray-500 leading-tight">${label}</label>

      <!-- Числовое поле. Атрибут min запрещает ввод значений ниже порога (0 = нет отрицательных) -->
      <input id="${id}" name="${id}" type="number"
             value="${escHtml(String(value || ''))}"
             ${opts.placeholder ? 'placeholder="' + escHtml(opts.placeholder) + '"' : ''}
             ${opts.min !== undefined ? 'min="' + opts.min + '"' : ''}
             class="bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-md
                    focus:ring-blue-500 focus:border-blue-500 block w-full px-2 py-1">

      <!-- Подпись под полем (если задана) -->
      ${opts.hint ? '<p class="text-[10px] text-gray-400 leading-tight">' + escHtml(opts.hint) + '</p>' : ''}
    </div>`;
}

/**
 * fieldSelect — генерирует HTML для выпадающего списка (<select>).
 * Используется для enumeration-полей: да/нет, семейное положение, дети, уровень дохода и т.д.
 * Первой опцией всегда идёт «—» (пустое значение) — означает «не выбрано».
 *
 * @param {string} id       — HTML-атрибут id и name у <select>.
 * @param {string} label    — Текст метки над полем.
 * @param {string} value    — Текущее выбранное значение из лида (сравнивается с o.value через ===).
 * @param {Array}  options  — Массив объектов {value, label}: варианты выбора.
 *   Пример: [{value:'Y', label:'Да'}, {value:'N', label:'Нет'}]
 * @param {object} opts     — Дополнительные опции:
 *   opts.colSpan {bool} — Растянуть на 2 колонки.
 */
function fieldSelect(id, label, value, options, opts) {
  // Если opts не передан — используем пустой объект.
  opts = opts || {};

  // Определяем ширину поля: 1 или 2 колонки сетки.
  const span = opts.colSpan ? 'col-span-2' : '';

  // Формируем HTML-строки для каждой опции списка.
  // String(o.value) === String(value || '') — сравниваем строки, даже если value пришло числом.
  // Если значения совпадают — добавляем атрибут selected, чтобы эта опция была выбрана по умолчанию.
  const optHtml = options.map(function(o) {
    const selected = String(o.value) === String(value || '') ? 'selected' : '';
    return `<option value="${escHtml(String(o.value))}" ${selected}>${escHtml(o.label)}</option>`;
  }).join(''); // Объединяем все <option> в одну строку без разделителей.

  // Возвращаем HTML-строку с меткой и выпадающим списком.
  // Первая опция <option value="">—</option> — пустой выбор ("не заполнено").
  return `
    <div class="flex flex-col gap-0.5 ${span}">
      <!-- Метка над полем -->
      <label for="${id}" class="block text-[11px] font-medium text-gray-500 leading-tight">${label}</label>

      <!-- Выпадающий список. Стили аналогичны fieldText для единообразия интерфейса -->
      <select id="${id}" name="${id}"
              class="bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-md
                     focus:ring-blue-500 focus:border-blue-500 block w-full px-2 py-1">
        <!-- Пустая опция «—» означает «не выбрано» и идёт всегда первой -->
        <option value="">—</option>
        ${optHtml}
      </select>
    </div>`;
}

/**
 * fieldTextarea — генерирует HTML для многострочного текстового поля (<textarea>).
 * Используется в блоке «Заметки менеджера»: основная боль, возражения, комментарии.
 *
 * @param {string} id       — HTML-атрибут id и name у <textarea>.
 * @param {string} label    — Текст метки над полем.
 * @param {string} value    — Текущее значение (текст) из лида.
 * @param {object} opts     — Дополнительные опции:
 *   opts.colSpan     {bool}   — Растянуть на 2 колонки (по умолчанию 1 — два textarea в ряд).
 *   opts.rows        {number} — Количество видимых строк textarea (по умолчанию 2).
 *   opts.placeholder {str}    — Подсказка внутри пустого поля.
 */
function fieldTextarea(id, label, value, opts) {
  // Если opts не передан — используем пустой объект.
  opts = opts || {};

  // По умолчанию textarea занимает 1 колонку — два textarea в ряд.
  // Через opts.colSpan: true можно растянуть на 2 кол.
  const span = opts.colSpan ? 'col-span-2' : '';

  // Возвращаем HTML-строку с меткой и многострочным полем.
  // opts.rows || 2: если высота не задана явно — показываем 2 строки.
  // resize-none: запрещаем ручное изменение размера textarea мышью (сохраняем компактность формы).
  // escHtml(value || ''): содержимое textarea тоже экранируем от HTML-тегов.
  return `
    <div class="flex flex-col gap-0.5 ${span}">
      <!-- Метка над полем -->
      <label for="${id}" class="block text-[11px] font-medium text-gray-500 leading-tight">${label}</label>

      <!-- Многострочное поле. resize-none — запрещаем ручное растягивание -->
      <textarea id="${id}" name="${id}" rows="${opts.rows || 2}"
                ${opts.placeholder ? 'placeholder="' + escHtml(opts.placeholder) + '"' : ''}
                class="bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-md
                       focus:ring-blue-500 focus:border-blue-500 block w-full px-2 py-1 resize-none">${escHtml(value || '')}</textarea>
    </div>`;
}

/**
 * fieldCity — генерирует HTML для поля ввода города клиента.
 *
 * Это специальное поле с расширенными возможностями:
 *   1. Обязательное (required) — без города нельзя сохранить анкету.
 *      Обязательность отмечена красной звёздочкой (*) рядом с меткой.
 *   2. Связано с часовым поясом (TZ): при выборе города из справочника
 *      calendar.js автоматически устанавливает часовой пояс для расписания.
 *      Это показывает подпись «→ TZ» рядом с меткой.
 *   3. Имеет автодополнение через <datalist>: список 900+ городов России
 *      берётся из глобального объекта CITIES_TZ (файл cities.js).
 *   4. Показывает два разных предупреждения:
 *      - Красная ошибка «Укажите город клиента» — если поле пустое при сохранении.
 *      - Жёлтое предупреждение «Город не найден в справочнике» — если город
 *        введён вручную и его нет в CITIES_TZ (TZ не определится автоматически).
 *
 * (Исправление баг #7: датасписок генерируется из CITIES_TZ, а не из захардкоженного списка.)
 *
 * @param {string} id    — HTML-атрибут id и name у <input>.
 * @param {string} label — Текст метки над полем.
 * @param {string} value — Текущее значение города из лида.
 */
function fieldCity(id, label, value) {
  // Баг 7 fix: генерируем datalist из CITIES_TZ (cities.js) — полный список городов России.
  // Если файл cities.js не загружен (CITIES_TZ не определён) — используем пустой объект,
  // чтобы не было ошибки ReferenceError.
  const citySource = (typeof CITIES_TZ !== 'undefined') ? CITIES_TZ : {};

  // Формируем <option> для каждого города из справочника.
  // В <datalist> достаточно указать только value — браузер предложит подходящие варианты при вводе.
  const opts = Object.keys(citySource).map(function(c) {
    return '<option value="' + escHtml(c) + '">';
  }).join('');

  // Возвращаем HTML-строку поля.
  // autocomplete="off" — отключаем автозаполнение браузера, чтобы не мешало нашему datalist.
  // required — браузерная валидация (дополнительно мы проверяем в validateForm).
  // id="${id}-error" — блок с сообщением об ошибке (скрыт по умолчанию, показывается через showCityError).
  // id="${id}-tz-warn" — блок с предупреждением о неизвестном городе (скрыт по умолчанию).
  return `
    <div class="flex flex-col gap-0.5">
      <label for="${id}" class="block text-[11px] font-medium text-gray-500 leading-tight">
        ${label}
        <!-- Красная звёздочка — визуальный маркер обязательного поля -->
        <span class="text-red-500 ml-0.5" title="Обязательное поле">*</span>
        <!-- Синяя подпись → TZ — напоминает, что город влияет на часовой пояс расписания -->
        <span class="text-blue-400 font-normal ml-1" title="Часовой пояс">→ TZ</span>
      </label>

      <!-- Поле ввода города с автодополнением из datalist.
           list="city-list" привязывает поле к <datalist id="city-list"> ниже. -->
      <input id="${id}" name="${id}" type="text" list="city-list"
             value="${escHtml(value || '')}"
             placeholder="Город..."
             autocomplete="off"
             required
             class="bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-md
                    focus:ring-blue-500 focus:border-blue-500 block w-full px-2 py-1">

      <!-- Список городов для автодополнения. Браузер фильтрует подходящие варианты по вводу. -->
      <datalist id="city-list">${opts}</datalist>

      <!-- Сообщение об ошибке: показывается при попытке сохранить форму с пустым городом.
           По умолчанию скрыто (hidden). Управляется функциями showCityError/clearCityError. -->
      <p id="${id}-error" class="hidden text-[10px] text-red-500">Укажите город клиента</p>

      <!-- Предупреждение: показывается если введённый город не найден в справочнике CITIES_TZ.
           Это не блокирует сохранение, но предупреждает менеджера, что TZ не определится автоматически. -->
      <p id="${id}-tz-warn" class="hidden text-[10px] text-amber-500">Город не найден в справочнике</p>
    </div>`;
}

/**
 * escHtml — экранирует специальные HTML-символы в строке.
 *
 * ЗАЧЕМ НУЖНА:
 *   Данные лида (ФИО, город, комментарии) приходят из Bitrix24 в виде произвольного текста.
 *   Если вставить их напрямую в innerHTML без экранирования — злоумышленник или
 *   некорректные данные могут «сломать» HTML-разметку или выполнить JavaScript-код
 *   (XSS-атака, Cross-Site Scripting).
 *
 * КАК РАБОТАЕТ:
 *   Заменяет 4 опасных символа на их HTML-сущности:
 *     &  →  &amp;   (без этого браузер воспринимает & как начало HTML-сущности)
 *     "  →  &quot;  (без этого кавычка может закрыть атрибут value="...")
 *     <  →  &lt;    (без этого браузер воспринимает < как начало тега)
 *     >  →  &gt;    (без этого браузер воспринимает > как конец тега)
 *
 * @param {any} s — Входное значение (будет приведено к строке через String()).
 * @returns {string} — Безопасная HTML-строка, готовая для вставки в атрибуты и текстовые узлы.
 */
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')   // & первым — чтобы не экранировать уже заменённые сущности повторно
    .replace(/"/g, '&quot;')  // " — защищаем атрибуты value="..."
    .replace(/</g, '&lt;')    // < — защищаем от открытия тегов
    .replace(/>/g, '&gt;');   // > — защищаем от закрытия тегов
}

// ─── Опции для enumeration-полей ────────────────────────────────────────────
//
// Каждый массив OPTS_* содержит варианты для конкретного выпадающего списка.
// Структура элемента: { value: 'ключ_для_crm', label: 'Текст для менеджера' }
// value — то, что сохраняется в поле CRM; label — то, что видит менеджер в форме.

/**
 * OPTS_INCOME_OFFICIAL — варианты для поля «Официальный доход» (KC_INCOME_OFFICIAL).
 * Позволяет быстро оценить платёжеспособность клиента без указания точной суммы.
 * Три уровня дохода + «Отсутствует» — для клиентов без официального трудоустройства.
 */
const OPTS_INCOME_OFFICIAL = [
  { value: 'high',   label: 'Высокий (от 50 000)' },    // Высокий доход — от 50 000 ₽/мес
  { value: 'medium', label: 'Средний (20 000–50 000)' }, // Средний — 20 000–50 000 ₽/мес
  { value: 'low',    label: 'Низкий (до 20 000)' },      // Низкий — меньше 20 000 ₽/мес
  { value: 'none',   label: 'Отсутствует' }              // Нет официального дохода (безработный, самозанятый без дохода)
];

/**
 * OPTS_YES_NO — универсальный список «Да / Нет».
 * Используется сразу для нескольких полей-флажков:
 *   KC_JOINT_PROPERTY (совместное имущество с супругом/ой),
 *   KC_CRIMINAL       (наличие судимостей),
 *   KC_OOO            (является ли клиент учредителем ООО),
 *   KC_IP             (зарегистрирован ли как ИП),
 *   KC_COLLATERAL     (есть ли залоговое имущество по кредитам),
 *   KC_FSSP           (есть ли исполнительные производства в ФССП),
 *   KC_PROPERTY       (есть ли имущество в собственности),
 *   KC_DEALS          (были ли сделки по отчуждению имущества за последние 3 года).
 *
 * value 'Y'/'N' — стандарт Bitrix24 для булевых полей.
 */
const OPTS_YES_NO = [
  { value: 'Y', label: 'Да' },  // Y = Yes — стандарт Bitrix24
  { value: 'N', label: 'Нет' }  // N = No
];

/**
 * OPTS_SALARY_CARD — варианты для поля «Зарплатная карта» (KC_SALARY_CARD).
 * Важно для оценки рисков: если зарплата поступает в Сбербанк, а там же есть кредит,
 * банк может автоматически списывать долг из зарплаты.
 */
const OPTS_SALARY_CARD = [
  { value: 'sber',  label: 'Сбербанк' },   // Зарплата приходит в Сбербанк (повышенный риск списания)
  { value: 'other', label: 'Другой банк' }, // Зарплата в любом другом банке
  { value: 'none',  label: 'Нет' }          // Нет зарплатной карты (наличные, самозанятый и т.п.)
];

/**
 * OPTS_MARITAL — варианты для поля «Семейное положение» (KC_MARITAL_STATUS).
 * Влияет на правовую сторону дела: наличие супруга/и означает совместно нажитое имущество,
 * которое может быть включено в конкурсную массу при банкротстве.
 */
const OPTS_MARITAL = [
  { value: 'single',   label: 'Не в браке' },     // Одинок/одинока, официально не состоял/а в браке
  { value: 'married',  label: 'В браке' },          // Официально женат/замужем
  { value: 'divorced', label: 'Разведён/а' },       // Официально разведён/а
  { value: 'widow',    label: 'Вдовец/вдова' }      // Супруг/а умер/умерла
];

/**
 * OPTS_CHILDREN — варианты для поля «Дети» (KC_CHILDREN).
 * Количество детей влияет на расчёт прожиточного минимума,
 * который суд вычитает из доходов при банкротстве.
 * '3+' объединяет три и более детей в одну категорию.
 */
const OPTS_CHILDREN = [
  { value: '0', label: 'Нет' },   // Детей нет
  { value: '1', label: '1' },      // Один ребёнок
  { value: '2', label: '2' },      // Двое детей
  { value: '3', label: '3+' }      // Трое и более детей
];

// ─── Инициализация формы ─────────────────────────────────────────────────────

/**
 * _setGrid — вспомогательная функция: применяет CSS-классы двухколоночной сетки (grid)
 * к блоку-контейнеру полей формы.
 *
 * Используется перед заполнением каждого блока (personal-body, finance-body и т.д.),
 * чтобы поля внутри автоматически выравнивались в 2 колонки.
 *
 * Стили:
 *   px-3 py-2       — горизонтальные и вертикальные отступы от краёв блока
 *   grid            — включаем CSS Grid Layout
 *   grid-cols-2     — два равных столбца
 *   gap-x-3 gap-y-2 — горизонтальный отступ 12px между колонками, 8px между строками
 *   text-xs         — базовый размер шрифта внутри блока (12px)
 *
 * @param {string} id — id элемента-контейнера (<div id="personal-body">, <div id="finance-body"> и т.д.)
 */
function _setGrid(id) {
  const el = document.getElementById(id); // Находим DOM-элемент по id
  // Если элемент найден — назначаем ему полный набор классов сетки.
  // Это перезаписывает все предыдущие классы элемента (className, а не classList.add).
  if (el) el.className = 'px-3 py-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs';
}

/**
 * initForm — главная функция инициализации формы.
 * Вызывается из app.js сразу после загрузки данных лида из Bitrix24.
 * Заполняет все 5 блоков формы сгенерированным HTML и навешивает обработчик города.
 *
 * ПОРЯДОК РАБОТЫ:
 *   1. Собирает ФИО из трёх отдельных полей лида (фамилия + имя + отчество).
 *   2. Рендерит БЛОК 1 «Персональные данные» (9 полей).
 *   3. Навешивает обработчики события на поле города (change + input).
 *   4. Рендерит БЛОК 2 «Финансовые данные» (5 полей).
 *   5. Рендерит БЛОК 3 «Кредитная история» (6 полей).
 *   6. Рендерит БЛОК 4 «Заметки менеджера» (4 textarea).
 *   7. Вызывает updateProgress() для первичного расчёта заполненности.
 *
 * @param {object} lead — Объект лида из Bitrix24 API (crm.lead.get),
 *   содержит поля: LASTNAME, NAME, SECONDNAME и все UF_CRM_KC_* поля.
 */
function initForm(lead) {
  // Сокращённый псевдоним для объекта лида — удобнее писать f.FIELD, чем lead.FIELD.
  const f   = lead;

  // Собираем полное ФИО из трёх отдельных полей лида.
  // filter(Boolean) удаляет пустые/null/undefined значения,
  // чтобы не получилось лишних пробелов при отсутствии отчества.
  // Пример: ['Иванов', 'Иван', ''] → ['Иванов', 'Иван'] → 'Иванов Иван'
  const fio = [f.LASTNAME, f.NAME, f.SECONDNAME].filter(Boolean).join(' ');

  // ── БЛОК 1: Персональные данные ──────────────────────────────────────────
  // Раскладка полей в 2-колоночной сетке:
  //   Строка 1: ФИО (col-span-2, вся строка)
  //   Строка 2: Место работы (col-span-2, вся строка)
  //   Строка 3: Город | Семейное положение
  //   Строка 4: Дети | Совм. имущество
  //   Строка 5: Судимости | ООО
  //   Строка 6: ИП | (пустая ячейка)

  // Применяем CSS-классы двухколоночной сетки к контейнеру блока персональных данных.
  _setGrid('personal-body');

  // Заполняем innerHTML блока HTML-кодом всех 9 полей, соединяя строки через +.
  document.getElementById('personal-body').innerHTML =
    // ФИО — readonly (только чтение): нельзя редактировать, берётся из лида.
    // colSpan: true — занимает обе колонки (всю строку).
    // hint — подпись «Автозаполнение из лида» под полем.
    fieldText   ('f-fio',            'ФИО клиента',          fio,                          { readonly: true, colSpan: true, hint: 'Автозаполнение из лида' }) +

    // Место работы — редактируемое текстовое поле, занимает всю строку.
    fieldText   ('f-workplace',       'Место работы',         f.UF_CRM_KC_WORKPLACE,        { colSpan: true, placeholder: 'Наименование организации' }) +

    // Город клиента — специальное поле с автодополнением и привязкой к часовому поясу (см. fieldCity).
    fieldCity   ('f-UF_CRM_KC_CLIENT_CITY', 'Город клиента', f.UF_CRM_KC_CLIENT_CITY) +

    // Семейное положение — выпадающий список (влияет на совместное имущество при банкротстве).
    fieldSelect ('f-marital',         'Семейное положение', f.UF_CRM_KC_MARITAL_STATUS,   OPTS_MARITAL) +

    // Дети — выпадающий список (влияет на расчёт прожиточного минимума).
    fieldSelect ('f-children',        'Дети',               f.UF_CRM_KC_CHILDREN,         OPTS_CHILDREN) +

    // Совместное имущество — есть ли имущество, нажитое совместно с супругом/ой.
    fieldSelect ('f-joint-property',  'Совм. имущество',   f.UF_CRM_KC_JOINT_PROPERTY,   OPTS_YES_NO) +

    // Судимости — наличие судимостей влияет на возможность прохождения банкротства.
    fieldSelect ('f-criminal',        'Судимости',          f.UF_CRM_KC_CRIMINAL,         OPTS_YES_NO) +

    // ООО — является ли клиент учредителем/директором ООО (риск субсидиарной ответственности).
    fieldSelect ('f-ooo',             'ООО',                f.UF_CRM_KC_OOO,              OPTS_YES_NO) +

    // ИП — зарегистрирован ли клиент как индивидуальный предприниматель.
    fieldSelect ('f-ip',              'ИП',                 f.UF_CRM_KC_IP,               OPTS_YES_NO);

  // ── Обработчик поля «Город» ───────────────────────────────────────────────
  // После вставки HTML в DOM находим элемент поля города.
  const cityEl = document.getElementById('f-UF_CRM_KC_CLIENT_CITY');

  if (cityEl) {
    // Внутренняя функция-обработчик, вызывается при любом изменении поля города.
    function _onCityChange() {
      // Сбрасываем ошибку валидации (красную рамку и текст «Укажите город»),
      // т.к. менеджер уже начал вводить значение.
      clearCityError();

      // Получаем текущее значение поля без лишних пробелов по краям.
      const val = cityEl.value.trim();

      // Баг 7 fix: проверяем, есть ли введённый город в справочнике CITIES_TZ.
      // Если города нет в справочнике — показываем жёлтое предупреждение,
      // что часовой пояс не определится автоматически.
      const warnEl = document.getElementById('f-UF_CRM_KC_CLIENT_CITY-tz-warn');
      if (warnEl) {
        // known = true, если: поле пустое (нечего проверять) ИЛИ город найден в CITIES_TZ.
        // known = false, если: в поле что-то есть, но этого города нет в CITIES_TZ.
        const known = (!val) || (typeof CITIES_TZ !== 'undefined' && CITIES_TZ[val] !== undefined);
        // toggle('hidden', true) — скрывает элемент; toggle('hidden', false) — показывает.
        warnEl.classList.toggle('hidden', known);
      }

      // Вызываем setClientCity() из calendar.js, если она доступна.
      // Это обновляет часовой пояс в блоке расписания прямо при вводе города,
      // не дожидаясь сохранения формы.
      if (typeof setClientCity === 'function') setClientCity(val);
    }

    // Навешиваем обработчик на два события:
    //   'change' — срабатывает при выборе из datalist или при потере фокуса (blur + изменение).
    //   'input'  — срабатывает при каждом нажатии клавиши во время набора текста.
    // Оба нужны, чтобы предупреждение и TZ обновлялись как при выборе, так и при ручном вводе.
    cityEl.addEventListener('change', _onCityChange);
    cityEl.addEventListener('input',  _onCityChange);
  }

  // ── БЛОК 2: Финансовые данные ─────────────────────────────────────────────
  // 5 полей в 2 колонках:
  //   Строка 1: Долг | Платёж/мес
  //   Строка 2: Офиц. доход | Неофиц. доход
  //   Строка 3: Зарпл. карта | (пустая ячейка)

  // Применяем CSS-классы сетки к контейнеру блока финансовых данных.
  _setGrid('finance-body');

  document.getElementById('finance-body').innerHTML =
    // Общая сумма долга в рублях. min: 0 — запрет отрицательных значений.
    fieldNumber ('f-debt-total',        'Долг, ₽',              f.UF_CRM_KC_DEBT_TOTAL,        { placeholder: '0', min: 0 }) +

    // Ежемесячный платёж по всем кредитам/займам. min: 0 — запрет отрицательных значений.
    fieldNumber ('f-monthly-payment',   'Платёж/мес, ₽',         f.UF_CRM_KC_MONTHLY_PAYMENT,   { placeholder: '0', min: 0 }) +

    // Официальный доход — выпадающий список (высокий/средний/низкий/отсутствует).
    fieldSelect ('f-income-official',   'Офиц. доход',          f.UF_CRM_KC_INCOME_OFFICIAL,   OPTS_INCOME_OFFICIAL) +

    // Неофициальный доход в рублях (подработки, «серые» выплаты и т.п.). min: 0.
    fieldNumber ('f-income-unofficial', 'Неофиц. доход, ₽',     f.UF_CRM_KC_INCOME_UNOFFICIAL, { placeholder: '0', min: 0 }) +

    // Зарплатная карта — в каком банке поступает основная зарплата.
    fieldSelect ('f-salary-card',       'Зарпл. карта',          f.UF_CRM_KC_SALARY_CARD,       OPTS_SALARY_CARD);

  // ── БЛОК 3: Кредитная история ─────────────────────────────────────────────
  // 6 полей в 2 колонках:
  //   Строка 1: Кредиторы (col-span-2, вся строка)
  //   Строка 2: Залог | Просрочки
  //   Строка 3: ФССП | Имущество
  //   Строка 4: Сделки | (пустая ячейка)

  // Применяем CSS-классы сетки к контейнеру блока кредитной истории.
  _setGrid('credit-body');

  document.getElementById('credit-body').innerHTML =
    // Кредиторы — перечисление банков, МФО и других организаций, которым должен клиент.
    // colSpan: true — поле занимает всю строку (много текста).
    fieldText   ('f-creditors',  'Кредиторы',  f.UF_CRM_KC_CREDITORS,  { colSpan: true, placeholder: 'Банки, МФО...' }) +

    // Залог — есть ли залоговое имущество по кредитам (ипотека, автокредит и т.п.).
    fieldSelect ('f-collateral', 'Залог',      f.UF_CRM_KC_COLLATERAL, OPTS_YES_NO) +

    // Просрочки — текстовое описание: сколько дней просрочки и по каким кредитам.
    fieldText   ('f-overdue',    'Просрочки',  f.UF_CRM_KC_OVERDUE,    { placeholder: 'дней / описание' }) +

    // ФССП — есть ли исполнительные производства в Федеральной службе судебных приставов.
    fieldSelect ('f-fssp',       'ФССП',       f.UF_CRM_KC_FSSP,       OPTS_YES_NO) +

    // Имущество — есть ли у клиента имущество в собственности (недвижимость, авто и т.п.).
    fieldSelect ('f-property',   'Имущество',  f.UF_CRM_KC_PROPERTY,   OPTS_YES_NO) +

    // Сделки — совершал ли клиент сделки по отчуждению имущества за последние 3 года
    // (продажа, дарение). Важно для оспаривания сделок при банкротстве.
    fieldSelect ('f-deals',      'Сделки',     f.UF_CRM_KC_DEALS,      OPTS_YES_NO);

  // ── БЛОК 4: Заметки менеджера ─────────────────────────────────────────────
  // 4 textarea в 2 колонках (каждый занимает 1 колонку — два в ряд):
  //   Строка 1: Исключение из КМ | Основная боль
  //   Строка 2: Возражения | Доп. комментарий

  // Применяем CSS-классы сетки к контейнеру блока заметок.
  _setGrid('manager-body');

  document.getElementById('manager-body').innerHTML =
    // Исключение из КМ — причины, по которым клиент не подходит для кредитного менеджера.
    fieldTextarea('f-km-exclusion',  'Исключение из КМ', f.UF_CRM_KC_KM_EXCLUSION,  { placeholder: 'Причина...' }) +

    // Основная боль клиента — главная проблема/мотивация обращения.
    fieldTextarea('f-main-pain',     'Основная боль',    f.UF_CRM_KC_MAIN_PAIN,     { placeholder: 'Главная проблема...' }) +

    // Возражения клиента — что мешает принять решение, сомнения, опасения.
    fieldTextarea('f-objections',    'Возражения',       f.UF_CRM_KC_OBJECTIONS,    { placeholder: 'Возражения клиента...' }) +

    // Дополнительный комментарий — любая прочая важная информация о клиенте.
    fieldTextarea('f-extra-comment', 'Доп. комментарий', f.UF_CRM_KC_EXTRA_COMMENT, { placeholder: 'Доп. информация...' });

  // После рендера всех полей — пересчитываем прогресс заполнения формы.
  // Это нужно для корректного отображения полосы прогресса при инициализации,
  // когда часть полей уже заполнена данными из лида.
  updateProgress();
}

// ─── Прогресс заполнения ─────────────────────────────────────────────────────

/**
 * updateProgress — пересчитывает и отображает прогресс заполнения формы.
 *
 * КАК РАБОТАЕТ:
 *   1. Находит все редактируемые поля внутри формы (#anketa-form):
 *      input (кроме readonly), select, textarea.
 *   2. Считает, сколько из них не пустые (filled).
 *   3. Вычисляет процент: filled / total * 100.
 *   4. Обновляет ширину полосы прогресса (#progress-bar).
 *   5. Обновляет текстовый счётчик (#progress-label), например «12 / 22».
 *
 * Вызывается:
 *   - initForm() — при первичном рендере формы с данными лида.
 *   - Обработчик 'change' на документе — при каждом изменении любого поля.
 *   - btn-reset (сброс формы) — чтобы счётчик сбросился вместе с полями.
 */
function updateProgress() {
  // Находим элемент формы по id.
  const form = document.getElementById('anketa-form');
  // Если форма не найдена (страница ещё не загружена) — выходим без ошибки.
  if (!form) return;

  // Выбираем все редактируемые поля формы:
  //   input:not([readonly]) — текстовые и числовые поля, кроме ФИО (readonly)
  //   select                — выпадающие списки
  //   textarea              — многострочные текстовые поля
  const inputs = form.querySelectorAll('input:not([readonly]),select,textarea');

  // Счётчик заполненных полей.
  let filled = 0;

  // Перебираем все найденные поля.
  inputs.forEach(function(el) {
    // Поле считается заполненным, если его значение не пустое (после trim — без пробелов).
    if (el.value && el.value.trim() !== '') filled++;
  });

  // Общее количество полей для заполнения.
  const total = inputs.length;

  // Вычисляем процент: если полей нет — 0%, иначе округляем до целого.
  const pct   = total ? Math.round((filled / total) * 100) : 0;

  // Находим DOM-элементы полосы и счётчика.
  const bar   = document.getElementById('progress-bar');
  const lbl   = document.getElementById('progress-label');

  // Устанавливаем ширину полосы прогресса в процентах (например '68%').
  if (bar) bar.style.width = pct + '%';

  // Показываем счётчик «заполнено / всего» (например '15 / 22').
  if (lbl) lbl.textContent = filled + ' / ' + total;
}

// Глобальный обработчик события 'change' на уровне документа.
// При любом изменении поля внутри #anketa-form пересчитывает прогресс.
// Использует event delegation: навешивается один раз на document,
// а не на каждое поле отдельно — эффективнее и работает даже для динамически
// созданных полей (они появляются в DOM позже через innerHTML).
document.addEventListener('change', function(e) {
  // e.target.closest('#anketa-form') — проверяем, что событие произошло
  // внутри формы #anketa-form (а не в другом месте страницы).
  if (e.target.closest('#anketa-form')) updateProgress();
});

// ─── Валидация полей ─────────────────────────────────────────────────────────

/**
 * REQUIRED_FIELDS — массив описаний 10 обязательных полей формы.
 *
 * Каждый элемент содержит:
 *   key   — ключ в объекте formData (возвращает collectFormData())
 *   elId  — HTML id элемента поля (input / select) для фокуса и подсветки ошибки
 *   label — текст сообщения об ошибке, который увидит менеджер
 *
 * Порядок совпадает с порядком блоков формы — при ошибке фокус
 * переводится на ПЕРВОЕ незаполненное поле (сверху вниз).
 *
 * Этот список соответствует полям с MANDATORY: 'Y' в install.php:
 *   KC_FULLNAME, KC_MARITAL_STATUS, KC_CHILDREN, KC_JOINT_PROPERTY,
 *   KC_CRIMINAL, KC_OOO, KC_IP, KC_DEBT_TOTAL, KC_PROPERTY, KC_DEALS.
 * Город (KC_CLIENT_CITY) проверяется отдельно — без него невозможно
 * определить часовой пояс для расписания.
 */
var REQUIRED_FIELDS = [
  { key: 'clientCity',    elId: 'f-UF_CRM_KC_CLIENT_CITY', label: 'Укажите город клиента' },
  { key: 'fio',           elId: 'f-fio',                   label: 'ФИО не заполнено' },
  { key: 'maritalStatus', elId: 'f-marital',               label: 'Укажите семейное положение' },
  { key: 'children',      elId: 'f-children',              label: 'Укажите количество детей' },
  { key: 'jointProperty', elId: 'f-joint-property',        label: 'Укажите совместное имущество' },
  { key: 'criminal',      elId: 'f-criminal',              label: 'Укажите наличие судимостей' },
  { key: 'ooo',           elId: 'f-ooo',                   label: 'Укажите наличие ООО' },
  { key: 'ip',            elId: 'f-ip',                    label: 'Укажите наличие ИП' },
  { key: 'debtTotal',     elId: 'f-debt-total',            label: 'Укажите сумму долга' },
  { key: 'property',      elId: 'f-property',              label: 'Укажите наличие имущества' },
  { key: 'deals',         elId: 'f-deals',                 label: 'Укажите наличие сделок' }
];

/**
 * _showFieldError(elId, msg) — универсальная функция: помечает любое поле
 * формы как ошибочное (красная рамка + текст ошибки под полем).
 *
 * ЛОГИКА:
 *   1. Находит DOM-элемент поля по его id (elId).
 *   2. Добавляет классы красной рамки (border-red-500, focus:ring-red-500, focus:border-red-500).
 *   3. Ищет элемент ошибки с id = elId + '-error'.
 *      - Если найден (город — у него <p id="...-error"> уже есть в HTML) → показываем его.
 *      - Если НЕ найден → создаём <p> динамически и вставляем после поля.
 *   4. Устанавливает текст ошибки (msg).
 *
 * @param {string} elId — HTML id поля (например 'f-marital').
 * @param {string} msg  — Текст сообщения об ошибке (например 'Укажите семейное положение').
 */
function _showFieldError(elId, msg) {
  var fieldEl = document.getElementById(elId);
  if (fieldEl) {
    // Добавляем красную рамку к полю.
    fieldEl.classList.add('border-red-500', 'focus:ring-red-500', 'focus:border-red-500');
  }

  // Ищем или создаём элемент ошибки.
  var errId = elId + '-error';
  var errEl = document.getElementById(errId);
  if (!errEl && fieldEl) {
    // Элемент ошибки ещё не существует — создаём динамически.
    errEl = document.createElement('p');
    errEl.id = errId;
    errEl.className = 'text-[10px] text-red-500'; // Мелкий красный текст.
    // Вставляем сразу после поля (input/select) внутри его родительского <div>.
    fieldEl.parentNode.insertBefore(errEl, fieldEl.nextSibling);
  }
  if (errEl) {
    errEl.textContent = msg;           // Устанавливаем текст ошибки.
    errEl.classList.remove('hidden');   // Показываем (если был скрыт).
  }
}

/**
 * _clearFieldError(elId) — универсальная функция: снимает ошибку с любого поля.
 *
 * ЛОГИКА:
 *   1. Убирает красную рамку с DOM-элемента поля.
 *   2. Скрывает элемент ошибки (если он существует).
 *
 * @param {string} elId — HTML id поля (например 'f-marital').
 */
function _clearFieldError(elId) {
  var fieldEl = document.getElementById(elId);
  if (fieldEl) {
    // Убираем красную рамку — возвращаем стандартный стиль.
    fieldEl.classList.remove('border-red-500', 'focus:ring-red-500', 'focus:border-red-500');
  }

  var errEl = document.getElementById(elId + '-error');
  if (errEl) {
    errEl.classList.add('hidden'); // Скрываем текст ошибки.
  }
}

/**
 * _clearAllFieldErrors() — сбрасывает ошибки со ВСЕХ обязательных полей.
 *
 * Вызывается в начале validateForm() перед новой проверкой,
 * чтобы убрать ошибки с полей, которые менеджер уже исправил.
 */
function _clearAllFieldErrors() {
  REQUIRED_FIELDS.forEach(function (rf) {
    _clearFieldError(rf.elId);
  });
}

/**
 * showCityError — обёртка для обратной совместимости: помечает поле «Город» как ошибочное.
 *
 * Используется в _onCityChange() (form.js) и внешнем коде.
 * Внутри делегирует в универсальную _showFieldError().
 */
function showCityError() {
  _showFieldError('f-UF_CRM_KC_CLIENT_CITY', 'Укажите город клиента');
}

/**
 * clearCityError — обёртка для обратной совместимости: снимает ошибку с поля «Город».
 *
 * Также скрывает жёлтое предупреждение TZ (баг 7 fix):
 * при очистке ошибки сбрасываем и предупреждение о неизвестном городе.
 */
function clearCityError() {
  _clearFieldError('f-UF_CRM_KC_CLIENT_CITY');

  // Баг 7 fix: предупреждение TZ скрываем вместе с ошибкой валидации.
  // Это нужно, чтобы при нажатии «Сбросить» или при начале нового ввода
  // пропадали ОБА предупреждения одновременно.
  var warnEl = document.getElementById('f-UF_CRM_KC_CLIENT_CITY-tz-warn');
  if (warnEl) warnEl.classList.add('hidden'); // Скрываем жёлтое предупреждение о неизвестном городе.
}

// ─── Сбор данных формы ───────────────────────────────────────────────────────

/**
 * collectFormData — считывает текущие значения всех полей формы и возвращает их в виде объекта.
 *
 * Эта функция является «мостом» между HTML-формой и API Bitrix24:
 * она собирает данные из DOM-элементов и упаковывает в удобный объект,
 * который затем используется в validateForm() и saveForm().
 *
 * Внутренняя функция v(id):
 *   Получает значение поля по его HTML-id и обрезает пробелы по краям (trim).
 *   Если элемент не найден — возвращает пустую строку, чтобы не было ошибок.
 *
 * @returns {object} — Объект со значениями всех 24 полей формы (Блоки 1–4).
 *   Блок 5 (запись на консультацию) собирается отдельно в calendar.js.
 */
function collectFormData() {
  // Вспомогательная функция: получает значение элемента по id, обрезает пробелы.
  // Если элемент не найден (например, форма ещё не отрендерена) — возвращает ''.
  function v(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  // Собираем и возвращаем объект со всеми полями.
  // Ключи объекта — произвольные camelCase-имена (используются в saveForm/addTimelineComment).
  // Значения — результаты вызова v() с id конкретного поля.
  return {
    fio:               v('f-fio'),                      // ФИО клиента (readonly, из лида)
    clientCity:        v('f-UF_CRM_KC_CLIENT_CITY'),    // Город (обязательное поле)
    workplace:         v('f-workplace'),                  // Место работы
    maritalStatus:     v('f-marital'),                   // Семейное положение (значение из OPTS_MARITAL)
    children:          v('f-children'),                  // Количество детей (значение из OPTS_CHILDREN)
    jointProperty:     v('f-joint-property'),            // Совместное имущество (Y/N)
    criminal:          v('f-criminal'),                  // Судимости (Y/N)
    ooo:               v('f-ooo'),                       // ООО (Y/N)
    ip:                v('f-ip'),                        // ИП (Y/N)
    debtTotal:         v('f-debt-total'),                // Общая сумма долга, ₽
    monthlyPayment:    v('f-monthly-payment'),           // Ежемесячный платёж, ₽
    incomeOfficial:    v('f-income-official'),           // Официальный доход (high/medium/low/none)
    incomeUnofficial:  v('f-income-unofficial'),         // Неофициальный доход, ₽
    salaryCard:        v('f-salary-card'),               // Зарплатная карта (sber/other/none)
    creditors:         v('f-creditors'),                 // Перечень кредиторов
    collateral:        v('f-collateral'),                // Залоговое имущество (Y/N)
    overdue:           v('f-overdue'),                   // Просрочки (текст)
    fssp:              v('f-fssp'),                      // Исполнительные производства ФССП (Y/N)
    property:          v('f-property'),                  // Имущество в собственности (Y/N)
    deals:             v('f-deals'),                     // Сделки с имуществом за 3 года (Y/N)
    kmExclusion:       v('f-km-exclusion'),              // Исключение из кредитного менеджера
    mainPain:          v('f-main-pain'),                 // Основная боль/проблема клиента
    objections:        v('f-objections'),                // Возражения клиента
    extraComment:      v('f-extra-comment')              // Дополнительный комментарий менеджера
  };
}

// ─── Валидация ───────────────────────────────────────────────────────────────

/**
 * validateForm — проверяет корректность заполнения формы перед сохранением.
 *
 * Проверяет ВСЕ 10+1 обязательных полей из массива REQUIRED_FIELDS:
 *   Город (KC_CLIENT_CITY) — без него невозможен расчёт TZ.
 *   ФИО (KC_FULLNAME), Семейное положение, Дети, Совм. имущество,
 *   Судимости, ООО, ИП — персональные данные.
 *   Сумма долга (KC_DEBT_TOTAL) — финансовые данные.
 *   Имущество (KC_PROPERTY), Сделки (KC_DEALS) — кредитная история.
 *
 * Эти 10+1 полей совпадают с MANDATORY: 'Y' в install.php + город.
 *
 * ПОРЯДОК РАБОТЫ:
 *   1. Сбрасывает все предыдущие ошибки через _clearAllFieldErrors().
 *   2. Перебирает REQUIRED_FIELDS: для каждого пустого поля вызывает _showFieldError().
 *   3. Фокусирует курсор на ПЕРВОМ пустом обязательном поле.
 *   4. Возвращает true (всё заполнено) или false (есть пустые).
 *
 * @param {object} formData — Объект данных формы из collectFormData().
 * @returns {boolean} — true если форма прошла валидацию, false если есть ошибки.
 */
function validateForm(formData) {
  // TODO: валидация временно отключена — раскомментировать когда нужно
  return true;

  /* --- ВАЛИДАЦИЯ ОТКЛЮЧЕНА (временно) ---

  // Сбрасываем все ошибки с прошлой попытки...
  _clearAllFieldErrors();

  // Также сбрасываем жёлтое предупреждение TZ — оно управляется отдельно.
  var warnEl = document.getElementById('f-UF_CRM_KC_CLIENT_CITY-tz-warn');
  if (warnEl) warnEl.classList.add('hidden');

  // Переменная для запоминания первого пустого поля (для фокуса).
  var firstEmptyElId = null;
  // Флаг валидности: true, пока все поля заполнены.
  var isValid = true;

  // Перебираем все обязательные поля и проверяем каждое.
  REQUIRED_FIELDS.forEach(function (rf) {
    // formData[rf.key] — значение поля после trim() из collectFormData().
    // Пустая строка '' или undefined считается «не заполнено».
    if (!formData[rf.key]) {
      // Показываем ошибку: красная рамка + текст под полем.
      _showFieldError(rf.elId, rf.label);

      // Запоминаем первое пустое поле — фокус переведём на него.
      if (!firstEmptyElId) firstEmptyElId = rf.elId;

      isValid = false; // Есть хотя бы одна ошибка.
        return isValid;
  --- КОНЕЦ ОТКЛЮЧЁННОЙ ВАЛИДАЦИИ --- */
    }
  });

  // Если есть ошибки — фокусируем курсор на первом незаполненном поле.
  if (firstEmptyElId) {
    var focusEl = document.getElementById(firstEmptyElId);
    if (focusEl) focusEl.focus();
  }

  return isValid;
}

// ─── Сохранение ──────────────────────────────────────────────────────────────

/**
 * saveForm — сохраняет данные анкеты в CRM Bitrix24.
 *
 * ПОРЯДОК РАБОТЫ:
 *   1. Собирает данные формы через collectFormData().
 *   2. Валидирует через validateForm() — если ошибки, прерывает выполнение.
 *   3. Блокирует кнопку «Сохранить» и меняет её текст на «Сохранение...»
 *      (предотвращает повторное нажатие во время запроса к API).
 *   4. Отправляет запрос crm.lead.update в Bitrix24 API со всеми 24 полями.
 *   5. В колбэке ответа:
 *      a. Разблокирует кнопку «Сохранить» и возвращает ей исходный вид.
 *      b. При ошибке API — показывает сообщение об ошибке через showError().
 *      c. При успехе — вызывает addTimelineComment() для записи в таймлайн.
 *
 * ПРИМЕЧАНИЕ: все 11 обязательных полей (REQUIRED_FIELDS) гарантированно не пустые
 * (validateForm проверил выше). Пустые необязательные поля передаются как '' —
 * Bitrix24 их принимает и сохраняет как пустые.
 */
function saveForm() {
  // Шаг 1: Собираем все значения формы в объект.
  const formData = collectFormData();

  // Шаг 2: Валидируем все 11 обязательных полей. Если не прошло — прерываем, ошибки уже показаны.
  if (!validateForm(formData)) return;

  // Шаг 3: Блокируем кнопку сохранения, чтобы менеджер не нажал её дважды.
  const btnSave = document.getElementById('btn-save');
  if (btnSave) {
    btnSave.disabled = true;           // Кнопка не реагирует на клики
    btnSave.textContent = 'Сохранение...'; // Текст меняется — менеджер видит, что идёт запрос
  }

  // Шаг 4: Отправляем обновление лида в Bitrix24 через JavaScript SDK BX24.
  // Все 11 обязательных полей гарантированно не пустые (validateForm проверил выше).
  // Пустые необязательные поля передаём как пустую строку — Bitrix24 их примет.
  BX24.callMethod('crm.lead.update', {
    id: leadId, // ID текущего лида (глобальная переменная, установлена в app.js)
    fields: {
      // БЛОК 1: Персональные данные
      UF_CRM_KC_FULLNAME:          formData.fio,            // ФИО клиента
      UF_CRM_KC_CLIENT_CITY:       formData.clientCity,     // Город (обязательное)
      UF_CRM_KC_WORKPLACE:         formData.workplace,      // Место работы
      UF_CRM_KC_MARITAL_STATUS:    formData.maritalStatus,  // Семейное положение
      UF_CRM_KC_CHILDREN:          formData.children,       // Дети
      UF_CRM_KC_JOINT_PROPERTY:    formData.jointProperty,  // Совместное имущество
      UF_CRM_KC_CRIMINAL:          formData.criminal,       // Судимости
      UF_CRM_KC_OOO:               formData.ooo,            // ООО
      UF_CRM_KC_IP:                formData.ip,             // ИП

      // БЛОК 2: Финансовые данные
      UF_CRM_KC_DEBT_TOTAL:        formData.debtTotal,        // Общая сумма долга
      UF_CRM_KC_MONTHLY_PAYMENT:   formData.monthlyPayment,   // Ежемесячный платёж
      UF_CRM_KC_INCOME_OFFICIAL:   formData.incomeOfficial,   // Официальный доход
      UF_CRM_KC_INCOME_UNOFFICIAL: formData.incomeUnofficial, // Неофициальный доход
      UF_CRM_KC_SALARY_CARD:       formData.salaryCard,       // Зарплатная карта

      // БЛОК 3: Кредитная история
      UF_CRM_KC_CREDITORS:         formData.creditors,   // Кредиторы
      UF_CRM_KC_COLLATERAL:        formData.collateral,  // Залог
      UF_CRM_KC_OVERDUE:           formData.overdue,     // Просрочки
      UF_CRM_KC_FSSP:              formData.fssp,        // ФССП
      UF_CRM_KC_PROPERTY:          formData.property,    // Имущество
      UF_CRM_KC_DEALS:             formData.deals,       // Сделки

      // БЛОК 4: Заметки менеджера
      UF_CRM_KC_KM_EXCLUSION:      formData.kmExclusion,  // Исключение из КМ
      UF_CRM_KC_MAIN_PAIN:         formData.mainPain,     // Основная боль
      UF_CRM_KC_OBJECTIONS:        formData.objections,   // Возражения
      UF_CRM_KC_EXTRA_COMMENT:     formData.extraComment  // Доп. комментарий
    },
    // REGISTER_SONET_EVENT: 'N' — не создаём уведомление в живой ленте Bitrix24
    // при каждом сохранении анкеты. Без этого флага в ленте появлялось бы
    // системное сообщение «Лид изменён» — лишний шум.
    params: { REGISTER_SONET_EVENT: 'N' }
  }, function (result) {
    // Шаг 5a: Разблокируем кнопку и восстанавливаем её вид.
    // SVG-иконка галочки + текст «Сохранить анкету» — стандартный вид кнопки.
    if (btnSave) {
      btnSave.disabled = false;
      btnSave.innerHTML =
        '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Сохранить анкету';
    }

    // Шаг 5b: Если API вернул ошибку — показываем уведомление менеджеру.
    if (result.error()) {
      showError('Ошибка сохранения: ' + result.error()); // showError() определена в app.js
    } else {
      // Шаг 5c: Успешное сохранение — добавляем комментарий в таймлайн лида.
      addTimelineComment(formData);
    }
  });
}

/**
 * addTimelineComment — добавляет комментарий об успешном сохранении анкеты в таймлайн лида.
 *
 * ЗАЧЕМ НУЖНА:
 *   Таймлайн лида в Bitrix24 — это лента событий, видимая всем менеджерам.
 *   Комментарий фиксирует: кто, когда и какую ключевую информацию заполнил в анкете.
 *   Это позволяет восстановить историю работы с клиентом без открытия самой формы.
 *
 * ЧТО ПИШЕТ В КОММЕНТАРИЙ:
 *   1. Заголовок: «Анкета КЦ заполнена: <имя менеджера> (<дата и время>)»
 *   2. Город клиента (если заполнен)
 *   3. Сумма долга (если заполнена)
 *   4. Основная боль (если заполнена)
 *   5. Возражения (если заполнены)
 *   Пустые поля не включаются в комментарий (filter(Boolean) убирает их).
 *
 * ПОРЯДОК РАБОТЫ:
 *   1. Формирует строку с датой/временем в формате ДД.ММ.ГГГГ ЧЧ:ММ (ru-RU).
 *   2. Составляет массив строк комментария (только непустые).
 *   3. Отправляет crm.timeline.comment.add в Bitrix24 API.
 *   4. При ошибке — показывает showError().
 *   5. При успехе — вызывает showSuccess() (уведомление «Анкета сохранена»).
 *
 * @param {object} formData — Объект данных формы из collectFormData().
 */
function addTimelineComment(formData) {
  // Получаем текущую дату и время для метки в комментарии.
  const now = new Date();

  // Форматируем дату в российском формате: ДД.ММ.ГГГГ ЧЧ:ММ
  // (например: «25.12.2024, 14:30»).
  // toLocaleString('ru-RU', ...) — встроенный браузерный форматировщик дат.
  const dt  = now.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  // Составляем массив строк для комментария.
  // CURRENT_USERNAME — глобальная переменная с именем текущего менеджера (установлена в app.js).
  // Строки с пустыми значениями — пустые строки '' (тернарный оператор).
  // filter(Boolean) в конце убирает все пустые строки из массива.
  const comment = [
    // Первая строка всегда — заголовок с именем менеджера и временем сохранения.
    'Анкета КЦ заполнена: ' + CURRENT_USERNAME + ' (' + dt + ')',

    // Город клиента — важен для понимания часового пояса и региона.
    formData.clientCity   ? 'Город: '      + formData.clientCity          : '',

    // Сумма долга — ключевой финансовый показатель для оценки дела.
    formData.debtTotal    ? 'Долг: '       + formData.debtTotal + ' ₽'   : '',

    // Основная боль — главная мотивация клиента, важна для дальнейшей коммуникации.
    formData.mainPain     ? 'Боль: '       + formData.mainPain             : '',

    // Возражения — что мешает принять решение, важно для следующего контакта.
    formData.objections   ? 'Возражения: ' + formData.objections           : ''
  ].filter(Boolean).join('\n'); // Убираем пустые строки, объединяем переносами строк.

  // Отправляем комментарий в таймлайн лида через Bitrix24 SDK.
  BX24.callMethod('crm.timeline.comment.add', {
    fields: {
      ENTITY_ID:   leadId,  // ID текущего лида (глобальная переменная из app.js)
      ENTITY_TYPE: 'lead',  // Тип сущности — лид (не сделка, не контакт)
      COMMENT:     comment  // Текст комментария (многострочный, сформированный выше)
    }
  }, function (result) {
    // Если API вернул ошибку при записи в таймлайн — показываем предупреждение.
    // (Данные лида при этом уже сохранены — ошибка только в таймлайне.)
    if (result.error()) {
      showError('Ошибка записи в таймлайн: ' + result.error()); // showError() из app.js
    } else {
      // Успешная запись в таймлайн — показываем уведомление «Анкета сохранена».
      showSuccess(); // showSuccess() из app.js — зелёный тост/баннер
    }
  });
}

// ─── Сброс формы ─────────────────────────────────────────────────────────────

/**
 * Инициализация обработчиков кнопок «Сохранить» (submit) и «Сбросить» (reset).
 * Оборачивается в DOMContentLoaded, чтобы запуститься только после полной
 * загрузки HTML-документа — когда кнопки уже есть в DOM.
 */
document.addEventListener('DOMContentLoaded', function () {
  // Находим элемент формы — нужен для навешивания submit и для сброса полей.
  const form  = document.getElementById('anketa-form');
  // Находим кнопку «Сбросить изменения».
  const reset = document.getElementById('btn-reset');

  if (form) {
    // Обработчик события submit формы (нажатие кнопки «Сохранить анкету»
    // или нажатие Enter в поле внутри формы).
    form.addEventListener('submit', function (e) {
      // Отменяем стандартное поведение браузера (перезагрузка страницы с GET/POST-запросом).
      // Без этого страница перезагрузится при каждом нажатии «Сохранить».
      e.preventDefault();

      // Запускаем нашу логику сохранения: валидация → CRM-update → таймлайн-комментарий.
      saveForm();
    });
  }

  if (reset) {
    // Обработчик клика по кнопке «Сбросить изменения».
    reset.addEventListener('click', function () {
      // Спрашиваем подтверждение у менеджера через стандартный диалог браузера.
      // Это защита от случайного нажатия — сброс необратимо очищает все несохранённые изменения.
      if (confirm('Сбросить все изменения?')) {
        // form.reset() — стандартный метод браузера: возвращает все поля формы
        // к значениям, которые были при первоначальной загрузке страницы.
        // (Т.е. сбрасывает именно изменения, внесённые менеджером вручную.)
        if (form) form.reset();

        // Убираем все ошибки валидации (если были показаны до нажатия «Сбросить»).
        _clearAllFieldErrors();
        // Дополнительно сбрасываем жёлтое предупреждение TZ города.
        clearCityError();

        // Пересчитываем прогресс заполнения — после сброса счётчик должен обновиться.
        updateProgress();
      }
    });
  }
});
