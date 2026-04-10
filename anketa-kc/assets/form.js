/**
 * form.js — логика формы анкеты
 * Рендер полей, валидация, сбор данных, сохранение в CRM + таймлайн.
 *
 * Поля анкеты (26 UF_CRM_KC_* полей):
 *
 * БЛОК 1 — Финансовые данные:
 *   1.  KC_FULLNAME           (string)      — ФИО (авто из лида)
 *   2.  KC_DEBT_TOTAL         (integer)     — Общая сумма долга
 *   3.  KC_MONTHLY_PAYMENT    (integer)     — Ежемесячный платёж
 *   4.  KC_INCOME_OFFICIAL    (enumeration) — Официальный доход
 *   5.  KC_INCOME_UNOFFICIAL  (integer)     — Неофициальный доход
 *   6.  KC_SALARY_CARD        (enumeration) — Зарплатная карта
 *
 * БЛОК 2 — Кредитная история:
 *   7.  KC_CREDITORS          (string)      — Кредиторы
 *   8.  KC_COLLATERAL         (enumeration) — Залог
 *   9.  KC_OVERDUE            (string)      — Просрочки
 *   10. KC_FSSP               (enumeration) — ФССП
 *   11. KC_PROPERTY           (enumeration) — Имущество
 *   12. KC_DEALS              (enumeration) — Сделки
 *
 * БЛОК 3 — Личные данные:
 *   13. KC_WORKPLACE          (string)      — Место работы
 *   14. KC_MARITAL_STATUS     (enumeration) — Семейное положение
 *   15. KC_CHILDREN           (enumeration) — Дети
 *   16. KC_JOINT_PROPERTY     (enumeration) — Совместное имущество
 *   17. KC_CRIMINAL           (enumeration) — Судимости
 *   18. KC_OOO                (enumeration) — ООО
 *   19. KC_IP                 (enumeration) — ИП
 *
 * БЛОК 4 — Заметки менеджера:
 *   20. KC_KM_EXCLUSION       (string)      — Исключение из КМ
 *   21. KC_MAIN_PAIN          (string)      — Основная боль
 *   22. KC_OBJECTIONS         (string)      — Возражения
 *   23. KC_EXTRA_COMMENT      (string)      — Доп. комментарий
 *
 * БЛОК 5 — Запись:
 *   24. KC_BOOKED_MANAGER     (employee)    — ID менеджера
 *   25. KC_BOOKED_TIME        (datetime)    — Время записи
 *   26. KC_BOOKED_EVENT_ID    (integer)     — ID события календаря
 */

'use strict';

/**
 * Инициализация формы данными лида
 * @param {Object} lead — объект лида из crm.lead.get
 */
function initForm(lead) {
  // Авто-заполнение ФИО
  const fio = [lead.LASTNAME, lead.NAME, lead.SECONDNAME].filter(Boolean).join(' ');
  // TODO: рендерить поля динамически или заполнять статические
  console.log('initForm', lead, fio);
}

/**
 * Сбор данных формы
 * @returns {Object} formData
 */
function collectFormData() {
  // TODO: реализовать сбор всех 23 редактируемых полей
  return {};
}

/**
 * Валидация формы (вызывается на input с debounce 100мс)
 * @param {Object} formData
 * @returns {boolean}
 */
function validateForm(formData) {
  // TODO: добавить правила валидации
  return true;
}

/**
 * Сохранение анкеты:
 * 1. crm.lead.update — обновляем UF-поля
 * 2. crm.timeline.comment.add — дублируем в таймлайн
 */
function saveForm() {
  const formData = collectFormData();
  if (!validateForm(formData)) return;

  BX24.callMethod('crm.lead.update', {
    id: leadId,
    fields: {
      UF_CRM_KC_FULLNAME:        formData.fio,
      UF_CRM_KC_DEBT_TOTAL:      formData.debtTotal,
      UF_CRM_KC_MONTHLY_PAYMENT: formData.monthlyPayment,
      UF_CRM_KC_CREDITORS:       formData.creditors,
      UF_CRM_KC_COLLATERAL:      formData.collateral,
      UF_CRM_KC_OVERDUE:         formData.overdue,
      UF_CRM_KC_FSSP:            formData.fssp,
      UF_CRM_KC_PROPERTY:        formData.property,
      UF_CRM_KC_DEALS:           formData.deals,
      UF_CRM_KC_INCOME_OFFICIAL: formData.incomeOfficial,
      UF_CRM_KC_SALARY_CARD:     formData.salaryCard,
      UF_CRM_KC_INCOME_UNOFFICIAL: formData.incomeUnofficial,
      UF_CRM_KC_WORKPLACE:       formData.workplace,
      UF_CRM_KC_MARITAL_STATUS:  formData.maritalStatus,
      UF_CRM_KC_JOINT_PROPERTY:  formData.jointProperty,
      UF_CRM_KC_CHILDREN:        formData.children,
      UF_CRM_KC_CRIMINAL:        formData.criminal,
      UF_CRM_KC_OOO:             formData.ooo,
      UF_CRM_KC_IP:              formData.ip,
      UF_CRM_KC_KM_EXCLUSION:    formData.kmExclusion,
      UF_CRM_KC_MAIN_PAIN:       formData.mainPain,
      UF_CRM_KC_OBJECTIONS:      formData.objections,
      UF_CRM_KC_EXTRA_COMMENT:   formData.extraComment,
      UF_CRM_KC_BOOKED_MANAGER:  formData.bookedManagerId,
      UF_CRM_KC_BOOKED_TIME:     formData.bookedTime,
    },
    params: { REGISTER_SONET_EVENT: 'N' }
  }, function (result) {
    if (result.error()) {
      showError('Ошибка сохранения: ' + result.error());
    } else {
      addTimelineComment(formData);
    }
  });
}

/**
 * Добавление комментария в таймлайн лида
 * @param {Object} formData
 */
function addTimelineComment(formData) {
  const now = new Date();
  const dt = now.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  // TODO: сформировать текст комментария из formData
  const comment = `Анкета КЦ заполнена менеджером: ${CURRENT_USERNAME} (${dt})`;

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

// Навешиваем обработчик на форму
document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('anketa-form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      saveForm();
    });
  }
});
