// assets/mp-config.js
// Конфигурация менеджеров по продажам (МП)
// Рабочие часы указываются в LOCAL времени каждого МП
// UTC-офсет берётся из CITIES_TZ (cities.js) по полю city
// Правка: отредактируйте только этот файл, логика calendar.js читает MP_CONFIG автоматически

const MP_CONFIG = {

  // -----------------------------------------------------------------------
  // Формат записи:
  //   bitrixUserId  — ID пользователя в Bitrix24 (int)
  //   name          — отображаемое имя
  //   city          — город проживания/работы (должен быть в CITIES_TZ)
  //   workStart     — начало рабочего дня (локальное время, "HH:MM")
  //   workEnd       — конец рабочего дня  (локальное время, "HH:MM")
  //   workDays      — рабочие дни недели: 0=Вс, 1=Пн...6=Сб
  //   slotMinutes   — длительность одного слота записи (минуты)
  //   active        — false = МП скрыт в списке, не принимает записи
  // -----------------------------------------------------------------------

  1: {
    bitrixUserId: 1,
    name: "Иванов Алексей",
    city: "Москва",
    workStart: "09:00",
    workEnd: "18:00",
    workDays: [1, 2, 3, 4, 5],
    slotMinutes: 60,
    active: true,
  },

  2: {
    bitrixUserId: 2,
    name: "Петрова Мария",
    city: "Санкт-Петербург",
    workStart: "09:00",
    workEnd: "18:00",
    workDays: [1, 2, 3, 4, 5],
    slotMinutes: 60,
    active: true,
  },

  3: {
    bitrixUserId: 3,
    name: "Сидоров Дмитрий",
    city: "Екатеринбург",
    workStart: "09:00",
    workEnd: "18:00",
    workDays: [1, 2, 3, 4, 5],
    slotMinutes: 60,
    active: true,
  },

  4: {
    bitrixUserId: 4,
    name: "Козлова Елена",
    city: "Новосибирск",
    workStart: "09:00",
    workEnd: "18:00",
    workDays: [1, 2, 3, 4, 5],
    slotMinutes: 60,
    active: true,
  },

  5: {
    bitrixUserId: 5,
    name: "Николаев Андрей",
    city: "Казань",
    workStart: "09:00",
    workEnd: "18:00",
    workDays: [1, 2, 3, 4, 5],
    slotMinutes: 60,
    active: true,
  },

  6: {
    bitrixUserId: 6,
    name: "Орлова Татьяна",
    city: "Краснодар",
    workStart: "09:00",
    workEnd: "18:00",
    workDays: [1, 2, 3, 4, 5],
    slotMinutes: 60,
    active: true,
  },

  7: {
    bitrixUserId: 7,
    name: "Смирнов Игорь",
    city: "Нижний Новгород",
    workStart: "09:00",
    workEnd: "18:00",
    workDays: [1, 2, 3, 4, 5],
    slotMinutes: 60,
    active: true,
  },

  8: {
    bitrixUserId: 8,
    name: "Фёдорова Анна",
    city: "Ростов-на-Дону",
    workStart: "09:00",
    workEnd: "18:00",
    workDays: [1, 2, 3, 4, 5],
    slotMinutes: 60,
    active: true,
  },

  9: {
    bitrixUserId: 9,
    name: "Морозов Виктор",
    city: "Владивосток",
    workStart: "09:00",
    workEnd: "18:00",
    workDays: [1, 2, 3, 4, 5],
    slotMinutes: 60,
    active: true,
  },

  10: {
    bitrixUserId: 10,
    name: "Волкова Ксения",
    city: "Самара",
    workStart: "09:00",
    workEnd: "18:00",
    workDays: [1, 2, 3, 4, 5],
    slotMinutes: 60,
    active: true,
  },

  11: {
    bitrixUserId: 11,
    name: "Лебедев Сергей",
    city: "Уфа",
    workStart: "09:00",
    workEnd: "18:00",
    workDays: [1, 2, 3, 4, 5],
    slotMinutes: 60,
    active: true,
  },
};

// -----------------------------------------------------------------------
// Вспомогательные функции
// -----------------------------------------------------------------------

function getActiveMPs() {
  return Object.values(MP_CONFIG).filter(mp => mp.active);
}

function getMPTimezone(mpId) {
  const mp = MP_CONFIG[mpId];
  if (!mp) return null;
  return (typeof getCityTZ === 'function') ? getCityTZ(mp.city) : null;
}

function isMPWorkday(mpId, date) {
  const mp = MP_CONFIG[mpId];
  if (!mp || !mp.active) return false;
  return mp.workDays.includes(date.getDay());
}

function getMPDaySlots(mpId, localDate) {
  const mp = MP_CONFIG[mpId];
  if (!mp || !mp.active) return [];
  const tzOffset = getMPTimezone(mpId);
  if (tzOffset === null) return [];

  const slots = [];
  const [startH, startM] = mp.workStart.split(':').map(Number);
  const [endH, endM]     = mp.workEnd.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes   = endH   * 60 + endM;

  for (let m = startMinutes; m < endMinutes; m += mp.slotMinutes) {
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    const localTime = `${hh}:${mm}`;

    const utcM = m - tzOffset * 60;
    const utcTotal = ((utcM % 1440) + 1440) % 1440;
    const utcH  = String(Math.floor(utcTotal / 60)).padStart(2, '0');
    const utcMm = String(utcTotal % 60).padStart(2, '0');
    const utcTime = `${utcH}:${utcMm}`;

    const slotDate = new Date(localDate);
    slotDate.setUTCHours(Math.floor(utcTotal / 60), utcTotal % 60, 0, 0);
    const isoStart = slotDate.toISOString();

    slots.push({ localTime, utcTime, isoStart });
  }
  return slots;
}

if (typeof module !== 'undefined') module.exports = {
  MP_CONFIG, getActiveMPs, getMPTimezone, isMPWorkday, getMPDaySlots
};
