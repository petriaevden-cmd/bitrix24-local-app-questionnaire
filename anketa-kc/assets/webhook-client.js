/**
 * webhook-client.js — клиент для работы с Битрикс24 через входящий вебхук.
 *
 * НАЗНАЧЕНИЕ (режим разработки / тестирования вне iframe Bitrix24):
 *   Этот файл позволяет запускать приложение в ЛЮБОМ браузере (не только внутри
 *   iframe Битрикс24), делая вызовы REST API напрямую через входящий вебхук.
 *
 *   Старый код (app.js, form.js, calendar.js) использует BX24.callMethod/callBatch.
 *   Чтобы не переписывать весь код, мы создаём shim-объект window.BX24 с теми же
 *   методами, которые внутри делают fetch() на вебхук.
 *
 * РЕЖИМЫ РАБОТЫ (управляется флагом window.APP_USE_WEBHOOK из index.php):
 *   - APP_USE_WEBHOOK === true  → используется shim из этого файла (данные с вебхука).
 *   - APP_USE_WEBHOOK === false → используется оригинальный BX24 SDK (работа в iframe).
 *
 * ВНИМАНИЕ: Вебхук crm.yurclick.com/rest/6/m1umtpppnvj21gud/ имеет скоупы
 *   только: bizproc, calendar, crm.
 *   Методы user.*, department.*, placement.* недоступны — для них возвращаем mock.
 *
 * ФОРМАТ ВОЗВРАТА (совместим с BX24 SDK):
 *   result.error()   → строка ошибки или пустая строка.
 *   result.data()    → payload (то, что лежит в JSON поле "result").
 *   result.answer    → полный ответ вебхука (result, error, time, next, total).
 *   result.total()   → общее число записей (для list-методов).
 *   result.more()    → true, если есть следующая страница.
 *
 * ОТКАТ ИЗМЕНЕНИЙ:
 *   Чтобы вернуть работу через оригинальный SDK Битрикс24 — см. ROLLBACK.md
 *   в корне репозитория. Достаточно установить в index.php
 *   window.APP_USE_WEBHOOK = false;
 */

'use strict';

(function (global) {
  // ──────────────────────────────────────────────────────────────────────────
  // БЛОК 1: БАЗОВЫЕ НАСТРОЙКИ
  // ──────────────────────────────────────────────────────────────────────────

  // Читаем URL вебхука из window.APP_CONFIG (передаётся из PHP в index.php).
  // Если не задан — используем дефолт для тестового портала yurclick.
  var WEBHOOK_URL = (global.APP_CONFIG && global.APP_CONFIG.webhookUrl)
    || 'https://crm.yurclick.com/rest/6/m1umtpppnvj21gud/';

  // Убираем завершающий слэш, чтобы ниже корректно склеивать URL.
  WEBHOOK_URL = String(WEBHOOK_URL).replace(/\/+$/, '');

  // Логируем включение режима разработки — чтобы в консоли сразу было видно,
  // что приложение работает НЕ через SDK, а через вебхук.
  try {
    console.info(
      '%c[webhook-client] Режим разработки: вызовы идут через вебхук',
      'background:#fde68a;color:#92400e;padding:2px 6px;border-radius:4px;font-weight:bold;',
      WEBHOOK_URL
    );
  } catch (e) { /* no-op */ }

  // ──────────────────────────────────────────────────────────────────────────
  // БЛОК 2: MOCK-ДАННЫЕ ДЛЯ НЕДОСТУПНЫХ ЧЕРЕЗ ВЕБХУК МЕТОДОВ
  // ──────────────────────────────────────────────────────────────────────────
  //
  // Вебхук имеет скоупы: bizproc, calendar, crm.
  // Методы типа user.current / user.get / department.get / placement.info
  // вернут 'insufficient_scope'. Поэтому для них возвращаем заранее подготовленные
  // значения, чтобы frontend мог корректно отрисоваться.
  //
  // Это ТОЛЬКО для режима разработки. В продуктиве (внутри iframe Битрикс24)
  // эти методы отрабатывают через настоящий BX24 SDK.

  var MOCK_CURRENT_USER = {
    ID: '14',
    NAME: 'Денис',
    LAST_NAME: 'Петряев',
    SECOND_NAME: '',
    EMAIL: 'dev@yurclick.com',
    ACTIVE: true
  };

  // Получаем ID лида из URL-параметра ?leadId=... (удобно для тестирования).
  // Если не задан — используем дефолт 59466 (реально существующий в портале).
  function _getLeadIdFromUrl() {
    try {
      var params = new URLSearchParams(global.location.search);
      var v = parseInt(params.get('leadId'), 10);
      return v > 0 ? v : 59466;
    } catch (e) {
      return 59466;
    }
  }

  var MOCK_PLACEMENT = {
    placement: 'CRM_LEAD_DETAIL_TAB',
    options: { ID: String(_getLeadIdFromUrl()) }
  };

  // ID пользователя Битрикс24, к которому технически привязан общий
  // календарь всех встреч МП. Все события встреч лежат у этого
  // пользователя в секции (определяется автоматически из ответа).
  // Название события имеет формат «ВСТРЕЧА. <дата> <время> | МП<N>» —
  // из него парсится номер МП, чтобы собрать занятость по каждому МП.
  //
  // Значение переопределяется через APP_CONFIG.calendarOwnerId в index.php.
  var MEETINGS_OWNER_ID = (global.APP_CONFIG && global.APP_CONFIG.calendarOwnerId)
    ? parseInt(global.APP_CONFIG.calendarOwnerId, 10)
    : 137;

  // Кеш ответа calendar.event.get для одного диапазона дат.
  // Ключ — строка "from..to", значение — Promise со списком уже распределённых
  // по МП событий. Это позволяет вызвать одно REST и переиспользовать его
  // результат для всех 11 calId, не делая 11 одинаковых запросов.
  var _eventsCache = { key: null, promise: null };

  // ──────────────────────────────────────────────────────────────────────────
  // БЛОК 3: НИЗКОУРОВНЕВЫЙ ВЫЗОВ ВЕБХУКА (fetch)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * _rawCall(method, params) → Promise<answer>
   * Делает POST-запрос на <webhook>/<method>.json с JSON-телом params.
   * Возвращает «сырой» JSON-ответ вебхука: { result, error, time, next, total }.
   */
  function _rawCall(method, params) {
    var url = WEBHOOK_URL + '/' + method + '.json';
    var body = JSON.stringify(params || {});
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body
    }).then(function (resp) {
      return resp.json().catch(function () {
        return { error: 'invalid_json', error_description: 'Вебхук вернул не JSON' };
      });
    }).catch(function (e) {
      return { error: 'network_error', error_description: String(e && e.message || e) };
    });
  }

  /**
   * _wrapAnswer(answer) → объект, совместимый с BX24 SDK-результатом.
   * Возвращает { error(), data(), answer, total(), more() }.
   */
  function _wrapAnswer(answer) {
    answer = answer || {};
    return {
      answer: answer,
      error: function () {
        if (!answer.error) return '';
        // Битрикс24 возвращает error либо строкой, либо объектом {error, error_description}.
        return answer.error_description || answer.error || 'unknown_error';
      },
      data: function () {
        return answer.result;
      },
      total: function () {
        return answer.total || 0;
      },
      more: function () {
        return typeof answer.next !== 'undefined';
      }
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // БЛОК 4: ОБРАБОТКА СПЕЦИАЛЬНЫХ МЕТОДОВ (mock + адаптеры)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * _handleMethod(method, params) → Promise<answer>
   * Принимает имя метода и параметры, решает:
   *   - отдать mock (для недоступных методов),
   *   - подправить параметры (для адаптации старого кода),
   *   - или пробросить как есть в вебхук.
   */
  function _handleMethod(method, params) {
    params = params || {};

    // user.current → mock (вебхук не имеет скоупа user).
    if (method === 'user.current') {
      return Promise.resolve({ result: MOCK_CURRENT_USER });
    }

    // user.get → mock с единственным пользователем (имитация поиска).
    if (method === 'user.get') {
      return Promise.resolve({ result: [MOCK_CURRENT_USER] });
    }

    // department.get → пустой список (для calendar.js при фильтрации отдела).
    if (method === 'department.get') {
      return Promise.resolve({ result: [] });
    }

    // АДАПТЕР calendar.accessibility.get:
    //
    // Старый код передаёт параметр ids:[calId] в формате "MP<N>Vstrechi",
    // где N — номер менеджера продаж (1..11). Это НЕ ID пользователя Битрикс24,
    // а имя внешнего календаря-сущности (см. справочник МП-календарей на портале).
    //
    // Реальная занятость МП хранится в событиях календаря у технического
    // пользователя MEETINGS_OWNER_ID. Название каждого события имеет формат
    // «ВСТРЕЧА. <dd.mm.YYYY HH:MM:SS> | МП<N>». Чтобы понять, какой МП занят
    // в конкретный слот, нужно достать все события и распределить их по N из NAME.
    //
    // Стратегия:
    //   1. Для первого вызова за диапазон [from..to] делаем один calendar.event.get.
    //   2. Парсим NAME каждого события: /МП\s*(\d+)/ → N.
    //   3. Складываем в Map: N → [events...].
    //   4. Для всех последующих вызовов (других calId за тот же диапазон)
    //      отдаём уже закешированную выборку.
    //   5. Для запрошенного calId достаём массив и отдаём под видом
    //      calendar.accessibility.get (массив событий с ACCESSIBILITY=busy).
    if (method === 'calendar.accessibility.get' && Array.isArray(params.ids)) {
      var mpNumbers = params.ids.map(function (calId) {
        // "MP2Vstrechi" → 2
        var m = /^MP(\d+)Vstrechi$/.exec(String(calId));
        return m ? parseInt(m[1], 10) : null;
      }).filter(function (x) { return x !== null; });

      if (mpNumbers.length === 0) {
        return Promise.resolve({ result: [] });
      }

      // Ключ кеша — диапазон дат. calendar.js запрашивает ровно один день
      // и делает это параллельно для всех 11 МП — кеш позволяет обойтись
      // единственным REST-вызовом за все 11 calId.
      var cacheKey = String(params.from) + '..' + String(params.to);

      if (!_eventsCache.promise || _eventsCache.key !== cacheKey) {
        _eventsCache.key = cacheKey;
        _eventsCache.promise = _fetchMpMeetings(params.from, params.to);
      }

      return _eventsCache.promise.then(function (byMp) {
        // byMp — { 1: [events...], 2: [events...], ... }
        var list = [];
        mpNumbers.forEach(function (n) {
          var events = byMp[n] || [];
          for (var i = 0; i < events.length; i++) {
            list.push(events[i]);
          }
        });
        return { result: list };
      });
    }

    // Все остальные методы — пробрасываем как есть (crm.*, bizproc.*, calendar.*).
    return _rawCall(method, params);
  }

  /**
   * _fetchMpMeetings(from, to) → Promise<{ 1: [events], 2: [events], ... }>
   *
   * Загружает все события из календаря MEETINGS_OWNER_ID за диапазон [from..to],
   * разбирает название каждого события регэкспом /МП\s*(\d+)/ и группирует
   * по номеру МП. Это — основной путь определения занятости МП в режиме вебхука.
   */
  function _fetchMpMeetings(from, to) {
    return _rawCall('calendar.event.get', {
      type: 'user',
      ownerId: MEETINGS_OWNER_ID,
      from: from,
      to: to
    }).then(function (answer) {
      var events = (answer && answer.result) || [];
      if (!Array.isArray(events)) events = [];

      var byMp = {};
      var nameRe = /МП\s*(\d+)/;

      events.forEach(function (ev) {
        var name = String(ev.NAME || '');
        var m = name.match(nameRe);
        if (!m) return; // Событие без пометки "МП N" игнорируем — оно не из нашего потока.
        var n = parseInt(m[1], 10);
        if (!n) return;

        // Пропускаем удалённые и свободные события — они не должны блокировать слот.
        if (ev.DELETED === 'Y') return;
        if (ev.ACCESSIBILITY === 'free') return;

        // Нормализуем DATE_FROM/DATE_TO в ISO с учётом часового пояса. Важно:
        // calendar.js сравнивает интервалы через new Date(str).getTime(), поэтому
        // нужны абсолютные UTC-миллисекунды, а не локальная строка без зоны.
        // Используем DATE_FROM_TS_UTC / DATE_TO_TS_UTC (готовый UTC-timestamp в секундах),
        // если они есть — это самый надёжный источник. Иначе — склеиваем ISO
        // с таймзоной из TZ_FROM/TZ_TO.
        var normalized = Object.assign({}, ev, {
          DATE_FROM: _makeIsoWithTz(ev.DATE_FROM, ev.TZ_FROM, ev.DATE_FROM_TS_UTC),
          DATE_TO:   _makeIsoWithTz(ev.DATE_TO,   ev.TZ_TO,   ev.DATE_TO_TS_UTC),
          // Выставляем ACCESSIBILITY=busy явно: в calendar.js фильтр
          // оставляет только busy/absent, а calendar.event.get может вернуть
          // ACCESSIBILITY=null/undefined для обычных встреч.
          ACCESSIBILITY: ev.ACCESSIBILITY === 'absent' ? 'absent' : 'busy'
        });

        if (!byMp[n]) byMp[n] = [];
        byMp[n].push(normalized);
      });

      return byMp;
    });
  }

  /**
   * _makeIsoWithTz(dateStr, tzName, utcTs)
   *   dateStr — строка в формате «dd.mm.YYYY HH:MM:SS» (время в зоне TZ).
   *   tzName  — название таймзоны, напр. "Europe/Samara", "Europe/Moscow".
   *   utcTs   — готовый UTC-timestamp в секундах (DATE_FROM_TS_UTC из ответа).
   *
   * Возвращает ISO-строку с явно указанным временем в UTC (с суффиксом Z), чтобы
   * new Date(str) парсил её одинаково в любом браузере/таймзоне.
   *
   * Стратегия:
   *   1. Если есть utcTs — используем его, это самый надёжный источник.
   *   2. Иначе берём dateStr в качестве локального времени в tzName и переводим в UTC
   *      через Intl.DateTimeFormat (алгоритм ниже).
   *   3. Если tzName неизвестен — считаем, что время уже в UTC (крайний случай).
   */
  function _makeIsoWithTz(dateStr, tzName, utcTs) {
    // Ветка 1: готовый UTC-timestamp — это самый точный путь.
    if (utcTs) {
      var tsNum = parseInt(utcTs, 10);
      if (!isNaN(tsNum)) return new Date(tsNum * 1000).toISOString();
    }

    if (!dateStr || typeof dateStr !== 'string') return dateStr;
    if (/^\d{4}-\d{2}-\d{2}T/.test(dateStr)) return dateStr;

    var m = /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(dateStr);
    if (!m) return dateStr;

    var Y = +m[3], Mo = +m[2], D = +m[1], h = +m[4], mi = +m[5], s = +m[6];

    // Ветка 2: если есть tzName, вычисляем смещение этой зоны от UTC и вычитаем.
    if (tzName) {
      try {
        // Берём гипотетическую точку «Y-Mo-D h:mi:s UTC» и смотрим, в какое
        // время её отобразит Intl.DateTimeFormat для зоны tzName.
        // Разница — это смещение зоны.
        var asUtc = Date.UTC(Y, Mo - 1, D, h, mi, s);
        var parts = new Intl.DateTimeFormat('en-US', {
          timeZone: tzName, hour12: false,
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit'
        }).formatToParts(new Date(asUtc));
        var p = {};
        parts.forEach(function (x) { p[x.type] = x.value; });
        // Точка asUtc, показанная в tzName, даёт время zonedTime.
        // Смещение = (zonedTime - Y-Mo-D h:mi:s) часовой пояс относительно UTC.
        var zonedUtc = Date.UTC(+p.year, +p.month - 1, +p.day,
          +(p.hour === '24' ? 0 : p.hour), +p.minute, +p.second);
        var offsetMs = zonedUtc - asUtc; // положительно для восточных зон
        var trueUtc = asUtc - offsetMs;
        return new Date(trueUtc).toISOString();
      } catch (e) {
        // Intl недоступен — падаем на ветку 3.
      }
    }

    // Ветка 3: зона неизвестна — записываем как UTC (крайний случай).
    var padN = function (n) { return String(n).padStart(2, '0'); };
    return m[3] + '-' + m[2] + '-' + m[1] + 'T' + padN(h) + ':' + padN(mi) + ':' + padN(s) + 'Z';
  }

  // ──────────────────────────────────────────────────────────────────────────
  // БЛОК 5: SHIM ОБЪЕКТА window.BX24 (совместимость со старым кодом)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * BX24_WEBHOOK_SHIM — объект с API, идентичным window.BX24 из SDK Битрикс24.
   * Используется, если global.APP_USE_WEBHOOK === true.
   */
  var BX24_WEBHOOK_SHIM = {
    /**
     * init(cb) — просто вызывает callback (в SDK он ждёт готовность iframe).
     */
    init: function (cb) {
      if (typeof cb === 'function') {
        // setTimeout — имитируем асинхронность, чтобы DOM успел инициализироваться.
        setTimeout(cb, 0);
      }
    },

    /**
     * placement.info() → { placement, options }
     * Возвращает mock с ID лида из ?leadId=... или дефолтом 59466.
     */
    placement: {
      info: function () { return MOCK_PLACEMENT; }
    },

    /**
     * callMethod(method, params, cb) — совместим с SDK.
     * cb получает объект с методами error() и data().
     */
    callMethod: function (method, params, cb) {
      _handleMethod(method, params).then(function (answer) {
        var wrapped = _wrapAnswer(answer);
        if (typeof cb === 'function') cb(wrapped);
      });
    },

    /**
     * callBatch(commands, cb) — последовательно вызывает методы,
     * в cb передаёт объект { key: wrappedResult, ... }.
     * Параллельно мы НЕ запускаем — батч в SDK тоже сериализует запросы.
     */
    callBatch: function (commands, cb) {
      var keys = Object.keys(commands || {});
      var promises = keys.map(function (key) {
        var pair = commands[key];
        // pair может быть массивом ['method', params] или объектом { method, params }.
        var method, params;
        if (Array.isArray(pair)) {
          method = pair[0];
          params = pair[1] || {};
        } else {
          method = pair.method;
          params = pair.params || {};
        }
        return _handleMethod(method, params).then(function (ans) {
          return { key: key, wrapped: _wrapAnswer(ans) };
        });
      });

      Promise.all(promises).then(function (arr) {
        var out = {};
        arr.forEach(function (item) { out[item.key] = item.wrapped; });
        if (typeof cb === 'function') cb(out);
      });
    },

    /**
     * installFinish() — no-op в режиме разработки.
     * В продуктиве SDK вызывает этот метод для завершения install.php.
     */
    installFinish: function () { /* no-op */ },

    /**
     * getAuth() → null — нет реальной авторизации через SDK.
     */
    getAuth: function () { return null; }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // БЛОК 6: АКТИВАЦИЯ SHIM (если включён режим вебхука)
  // ──────────────────────────────────────────────────────────────────────────

  // Активируем shim, если в index.php задан флаг APP_USE_WEBHOOK=true.
  // В этом случае заменяем window.BX24 нашим объектом.
  // Если флаг не установлен — оставляем оригинальный BX24 из SDK (iframe-режим).
  if (global.APP_USE_WEBHOOK === true) {
    global.BX24 = BX24_WEBHOOK_SHIM;
    global.BX24_WEBHOOK = BX24_WEBHOOK_SHIM; // дополнительный алиас для явных обращений
  }

})(typeof window !== 'undefined' ? window : this);
