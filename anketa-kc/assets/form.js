/**
 * form.js — логика формы анкеты
 * Рендер полей через Tailwind CSS 4 + Flowbite,
 * валидация, сбор данных, сохранение в CRM + таймлайн.
 *
 * Поля анкеты (27 UF_CRM_KC_* полей):
 *
 * БЛОК 1 — Персональные данные:
 *   1.  KC_FULLNAME           (string)      — ФИО (авто из лида)
 *   2.  KC_CLIENT_CITY        (string)      — Город клиента (→ TZ для расписания)
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

'use strict';

// ─── Вспомогательные функции рендера (Tailwind + Flowbite) ───────────────────

function fieldText(id, label, value, opts) {
  opts = opts || {};
  return `
    <div class="flex flex-col gap-1 ${opts.colSpan ? 'col-span-2' : ''}">
      <label for="${id}" class="block text-xs font-medium text-gray-500">${label}</label>
      <input id="${id}" name="${id}" type="text"
             value="${escHtml(value || '')}"
             ${opts.readonly ? 'readonly' : ''}
             ${opts.placeholder ? 'placeholder="' + escHtml(opts.placeholder) + '"' : ''}
             class="bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-lg
                    focus:ring-blue-500 focus:border-blue-500 block w-full p-2
                    ${opts.readonly ? 'cursor-default' : ''}
                    disabled:opacity-50">
      ${opts.hint ? '<p class="text-xs text-gray-400">' + escHtml(opts.hint) + '</p>' : ''}
    </div>`;
}

function fieldNumber(id, label, value, opts) {
  opts = opts || {};
  return `
    <div class="flex flex-col gap-1 ${opts.colSpan ? 'col-span-2' : ''}">
      <label for="${id}" class="block text-xs font-medium text-gray-500">${label}</label>
      <input id="${id}" name="${id}" type="number"
             value="${escHtml(String(value || ''))}"
             ${opts.placeholder ? 'placeholder="' + escHtml(opts.placeholder) + '"' : ''}
             ${opts.min !== undefined ? 'min="' + opts.min + '"' : ''}
             class="bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-lg
                    focus:ring-blue-500 focus:border-blue-500 block w-full p-2">
      ${opts.hint ? '<p class="text-xs text-gray-400">' + escHtml(opts.hint) + '</p>' : ''}
    </div>`;
}

function fieldSelect(id, label, value, options, opts) {
  opts = opts || {};
  const optHtml = options.map(function(o) {
    const selected = String(o.value) === String(value || '') ? 'selected' : '';
    return `<option value="${escHtml(String(o.value))}" ${selected}>${escHtml(o.label)}</option>`;
  }).join('');
  return `
    <div class="flex flex-col gap-1 ${opts.colSpan ? 'col-span-2' : ''}">
      <label for="${id}" class="block text-xs font-medium text-gray-500">${label}</label>
      <select id="${id}" name="${id}"
              class="bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-lg
                     focus:ring-blue-500 focus:border-blue-500 block w-full p-2">
        <option value="">— выбрать —</option>
        ${optHtml}
      </select>
    </div>`;
}

function fieldTextarea(id, label, value, opts) {
  opts = opts || {};
  return `
    <div class="flex flex-col gap-1 col-span-2">
      <label for="${id}" class="block text-xs font-medium text-gray-500">${label}</label>
      <textarea id="${id}" name="${id}" rows="${opts.rows || 2}"
                ${opts.placeholder ? 'placeholder="' + escHtml(opts.placeholder) + '"' : ''}
                class="bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-lg
                       focus:ring-blue-500 focus:border-blue-500 block w-full p-2 resize-none">${escHtml(value || '')}</textarea>
    </div>`;
}

/**
 * Select города с datalist — позволяет и выбрать из списка, и ввести вручную.
 * После изменения вызывает setClientCity() из calendar.js.
 */
function fieldCity(id, label, value) {
  const CITIES = [
    'Москва','Санкт-Петербург','Новосибирск','Екатеринбург','Казань',
    'Нижний Новгород','Красноярск','Самара','Уфа','Ростов-на-Дону',
    'Омск','Краснодар','Воронеж','Пермь','Волгоград','Тюмень',
    'Иркутск','Владивосток','Хабаровск','Якутск','Магадан','Чита',
    'Сочи','Барнаул','Томск','Оренбург','Рязань','Ярославль',
    'Ижевск','Севастополь'
  ];
  const opts = CITIES.map(function(c) {
    return '<option value="' + escHtml(c) + '">';
  }).join('');
  return `
    <div class="flex flex-col gap-1">
      <label for="${id}" class="block text-xs font-medium text-gray-500">${label}
        <span class="text-blue-400 font-normal ml-1" title="Используется для определения часового пояса в расписании">→ TZ</span>
      </label>
      <input id="${id}" name="${id}" type="text" list="city-list"
             value="${escHtml(value || '')}"
             placeholder="Начните вводить город..."
             autocomplete="off"
             class="bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-lg
                    focus:ring-blue-500 focus:border-blue-500 block w-full p-2">
      <datalist id="city-list">${opts}</datalist>
    </div>`;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─── Опции для enumeration-полей ────────────────────────────────────────────

const OPTS_INCOME_OFFICIAL = [
  { value: 'high',   label: 'Высокий (от 50 000)' },
  { value: 'medium', label: 'Средний (20 000–50 000)' },
  { value: 'low',    label: 'Низкий (до 20 000)' },
  { value: 'none',   label: 'Отсутствует' }
];

const OPTS_YES_NO = [
  { value: 'Y', label: 'Да' },
  { value: 'N', label: 'Нет' }
];

const OPTS_SALARY_CARD = [
  { value: 'sber',   label: 'Сбербанк' },
  { value: 'other',  label: 'Другой банк' },
  { value: 'none',   label: 'Нет' }
];

const OPTS_MARITAL = [
  { value: 'single',   label: 'Не в браке' },
  { value: 'married',  label: 'В браке' },
  { value: 'divorced', label: 'Разведён/а' },
  { value: 'widow',    label: 'Вдовец/вдова' }
];

const OPTS_CHILDREN = [
  { value: '0', label: 'Нет' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3+' }
];

// ─── Инициализация формы ─────────────────────────────────────────────────────

function initForm(lead) {
  const f   = lead;
  const fio = [f.LASTNAME, f.NAME, f.SECONDNAME].filter(Boolean).join(' ');

  // БЛОК 1: Персональные данные (+ город → TZ)
  document.getElementById('personal-body').innerHTML =
    fieldText   ('f-fio',            'ФИО клиента',         fio,                           { readonly: true, colSpan: true, hint: 'Автозаполнение из лида' }) +
    fieldCity   ('f-UF_CRM_KC_CLIENT_CITY', 'Город клиента', f.UF_CRM_KC_CLIENT_CITY) +
    fieldText   ('f-workplace',      'Место работы',        f.UF_CRM_KC_WORKPLACE,         { placeholder: 'Наименование организации' }) +
    fieldSelect ('f-marital',        'Семейное положение',  f.UF_CRM_KC_MARITAL_STATUS,    OPTS_MARITAL) +
    fieldSelect ('f-children',       'Дети',                f.UF_CRM_KC_CHILDREN,          OPTS_CHILDREN) +
    fieldSelect ('f-joint-property', 'Совместное имущество', f.UF_CRM_KC_JOINT_PROPERTY,   OPTS_YES_NO) +
    fieldSelect ('f-criminal',       'Судимости',           f.UF_CRM_KC_CRIMINAL,          OPTS_YES_NO) +
    fieldSelect ('f-ooo',            'ООО',                 f.UF_CRM_KC_OOO,               OPTS_YES_NO) +
    fieldSelect ('f-ip',             'ИП',                  f.UF_CRM_KC_IP,                OPTS_YES_NO);

  // Обработчик поля города — обновляет TZ в расписании сразу при вводе
  const cityEl = document.getElementById('f-UF_CRM_KC_CLIENT_CITY');
  if (cityEl) {
    cityEl.addEventListener('change', function () {
      if (typeof setClientCity === 'function') setClientCity(cityEl.value.trim());
    });
    cityEl.addEventListener('input', function () {
      if (typeof setClientCity === 'function') setClientCity(cityEl.value.trim());
    });
  }

  // БЛОК 2: Финансовые данные
  document.getElementById('finance-body').innerHTML =
    fieldNumber ('f-debt-total',        'Общая сумма долга, ₽',   f.UF_CRM_KC_DEBT_TOTAL,        { placeholder: '0', min: 0 }) +
    fieldNumber ('f-monthly-payment',   'Ежемесячный платёж, ₽',  f.UF_CRM_KC_MONTHLY_PAYMENT,   { placeholder: '0', min: 0 }) +
    fieldSelect ('f-income-official',   'Официальный доход',      f.UF_CRM_KC_INCOME_OFFICIAL,   OPTS_INCOME_OFFICIAL) +
    fieldNumber ('f-income-unofficial', 'Неофициальный доход, ₽', f.UF_CRM_KC_INCOME_UNOFFICIAL, { placeholder: '0', min: 0 }) +
    fieldSelect ('f-salary-card',       'Зарплатная карта',       f.UF_CRM_KC_SALARY_CARD,       OPTS_SALARY_CARD);

  // БЛОК 3: Кредитная история
  document.getElementById('credit-body').innerHTML =
    fieldText   ('f-creditors',  'Кредиторы',  f.UF_CRM_KC_CREDITORS,  { colSpan: true, placeholder: 'Банки, МФО...' }) +
    fieldSelect ('f-collateral', 'Залог',      f.UF_CRM_KC_COLLATERAL, OPTS_YES_NO) +
    fieldText   ('f-overdue',    'Просрочки',  f.UF_CRM_KC_OVERDUE,    { placeholder: 'кол-во дней / описание' }) +
    fieldSelect ('f-fssp',       'ФССП',       f.UF_CRM_KC_FSSP,       OPTS_YES_NO) +
    fieldSelect ('f-property',   'Имущество',  f.UF_CRM_KC_PROPERTY,   OPTS_YES_NO) +
    fieldSelect ('f-deals',      'Сделки',     f.UF_CRM_KC_DEALS,      OPTS_YES_NO);

  // БЛОК 4: Заметки менеджера
  document.getElementById('manager-body').innerHTML =
    fieldTextarea('f-km-exclusion',  'Исключение из КМ', f.UF_CRM_KC_KM_EXCLUSION,  { placeholder: 'Причина исключения...' }) +
    fieldTextarea('f-main-pain',     'Основная боль',    f.UF_CRM_KC_MAIN_PAIN,     { placeholder: 'Главная проблема клиента...' }) +
    fieldTextarea('f-objections',    'Возражения',       f.UF_CRM_KC_OBJECTIONS,    { placeholder: 'Возражения клиента...' }) +
    fieldTextarea('f-extra-comment', 'Доп. комментарий', f.UF_CRM_KC_EXTRA_COMMENT, { placeholder: 'Дополнительная информация...' });

  updateProgress();
}

// ─── Прогресс заполнения ─────────────────────────────────────────────────────

function updateProgress() {
  const form = document.getElementById('anketa-form');
  if (!form) return;
  const inputs = form.querySelectorAll('input:not([readonly]),select,textarea');
  let filled = 0;
  inputs.forEach(function(el) {
    if (el.value && el.value.trim() !== '') filled++;
  });
  const total = inputs.length;
  const pct   = total ? Math.round((filled / total) * 100) : 0;
  const bar   = document.getElementById('progress-bar');
  const lbl   = document.getElementById('progress-label');
  if (bar) bar.style.width = pct + '%';
  if (lbl) lbl.textContent = filled + ' / ' + total;
}

document.addEventListener('change', function(e) {
  if (e.target.closest('#anketa-form')) updateProgress();
});

// ─── Сбор данных формы ───────────────────────────────────────────────────────

function collectFormData() {
  function v(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }
  return {
    fio:               v('f-fio'),
    clientCity:        v('f-UF_CRM_KC_CLIENT_CITY'),
    workplace:         v('f-workplace'),
    maritalStatus:     v('f-marital'),
    children:          v('f-children'),
    jointProperty:     v('f-joint-property'),
    criminal:          v('f-criminal'),
    ooo:               v('f-ooo'),
    ip:                v('f-ip'),
    debtTotal:         v('f-debt-total'),
    monthlyPayment:    v('f-monthly-payment'),
    incomeOfficial:    v('f-income-official'),
    incomeUnofficial:  v('f-income-unofficial'),
    salaryCard:        v('f-salary-card'),
    creditors:         v('f-creditors'),
    collateral:        v('f-collateral'),
    overdue:           v('f-overdue'),
    fssp:              v('f-fssp'),
    property:          v('f-property'),
    deals:             v('f-deals'),
    kmExclusion:       v('f-km-exclusion'),
    mainPain:          v('f-main-pain'),
    objections:        v('f-objections'),
    extraComment:      v('f-extra-comment')
  };
}

// ─── Валидация ───────────────────────────────────────────────────────────────

function validateForm(formData) {
  // Можно расширять — базовая валидация оставлена открытой
  return true;
}

// ─── Сохранение ──────────────────────────────────────────────────────────────

function saveForm() {
  const formData = collectFormData();
  if (!validateForm(formData)) return;

  const btnSave = document.getElementById('btn-save');
  if (btnSave) {
    btnSave.disabled = true;
    btnSave.textContent = 'Сохранение...';
  }

  BX24.callMethod('crm.lead.update', {
    id: leadId,
    fields: {
      UF_CRM_KC_FULLNAME:          formData.fio,
      UF_CRM_KC_CLIENT_CITY:       formData.clientCity,
      UF_CRM_KC_WORKPLACE:         formData.workplace,
      UF_CRM_KC_MARITAL_STATUS:    formData.maritalStatus,
      UF_CRM_KC_CHILDREN:          formData.children,
      UF_CRM_KC_JOINT_PROPERTY:    formData.jointProperty,
      UF_CRM_KC_CRIMINAL:          formData.criminal,
      UF_CRM_KC_OOO:               formData.ooo,
      UF_CRM_KC_IP:                formData.ip,
      UF_CRM_KC_DEBT_TOTAL:        formData.debtTotal,
      UF_CRM_KC_MONTHLY_PAYMENT:   formData.monthlyPayment,
      UF_CRM_KC_INCOME_OFFICIAL:   formData.incomeOfficial,
      UF_CRM_KC_INCOME_UNOFFICIAL: formData.incomeUnofficial,
      UF_CRM_KC_SALARY_CARD:       formData.salaryCard,
      UF_CRM_KC_CREDITORS:         formData.creditors,
      UF_CRM_KC_COLLATERAL:        formData.collateral,
      UF_CRM_KC_OVERDUE:           formData.overdue,
      UF_CRM_KC_FSSP:              formData.fssp,
      UF_CRM_KC_PROPERTY:          formData.property,
      UF_CRM_KC_DEALS:             formData.deals,
      UF_CRM_KC_KM_EXCLUSION:      formData.kmExclusion,
      UF_CRM_KC_MAIN_PAIN:         formData.mainPain,
      UF_CRM_KC_OBJECTIONS:        formData.objections,
      UF_CRM_KC_EXTRA_COMMENT:     formData.extraComment
    },
    params: { REGISTER_SONET_EVENT: 'N' }
  }, function (result) {
    if (btnSave) {
      btnSave.disabled = false;
      btnSave.innerHTML =
        '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Сохранить анкету';
    }
    if (result.error()) {
      showError('Ошибка сохранения: ' + result.error());
    } else {
      addTimelineComment(formData);
    }
  });
}

function addTimelineComment(formData) {
  const now = new Date();
  const dt  = now.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  const comment = [
    'Анкета КЦ заполнена: ' + CURRENT_USERNAME + ' (' + dt + ')',
    formData.clientCity   ? 'Город: ' + formData.clientCity          : '',
    formData.debtTotal    ? 'Долг: '  + formData.debtTotal + ' ₽'   : '',
    formData.mainPain     ? 'Боль: '  + formData.mainPain             : '',
    formData.objections   ? 'Возражения: ' + formData.objections      : ''
  ].filter(Boolean).join('\n');

  BX24.callMethod('crm.timeline.comment.add', {
    fields: {
      ENTITY_ID:   leadId,
      ENTITY_TYPE: 'lead',
      COMMENT:     comment
    }
  }, function (result) {
    if (result.error()) {
      showError('Ошибка записи в таймлайн: ' + result.error());
    } else {
      showSuccess();
    }
  });
}

// ─── Сброс формы ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
  const form  = document.getElementById('anketa-form');
  const reset = document.getElementById('btn-reset');

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      saveForm();
    });
  }

  if (reset) {
    reset.addEventListener('click', function () {
      if (confirm('Сбросить все изменения?')) {
        if (form) form.reset();
        updateProgress();
      }
    });
  }
});
