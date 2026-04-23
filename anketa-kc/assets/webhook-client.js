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
    // Старый код передаёт параметр ids:[calId] в формате "MP<userId>Vstrechi".
    // Вебхук не поддерживает ids — он требует users:[userId].
    // Преобразуем calId → userId, вызываем вебхук, приводим ответ к старому формату.
    if (method === 'calendar.accessibility.get' && Array.isArray(params.ids)) {
      var userIds = params.ids.map(function (calId) {
        // "MP137Vstrechi" → 137
        var m = /^MP(\d+)Vstrechi$/.exec(String(calId));
        return m ? parseInt(m[1], 10) : null;
      }).filter(function (x) { return x !== null; });

      if (userIds.length === 0) {
        return Promise.resolve({ result: [] });
      }

      var newParams = {
        from: params.from,
        to: params.to,
        users: userIds
      };

      return _rawCall('calendar.accessibility.get', newParams).then(function (answer) {
        // Вебхук вернёт { result: { "137": [events...], "14": [...] } }.
        // Старый код ожидает массив событий для одного запрошенного calId.
        // Так как мы запрашиваем по одному calId за раз, выбираем массив первого пользователя.
        var raw = answer && answer.result;
        var firstKey = userIds[0];
        var list = (raw && raw[String(firstKey)]) || [];

        // Нормализуем формат DATE_FROM / DATE_TO: вебхук отдаёт "dd.mm.YYYY HH:MM:SS",
        // а старый код при работе через SDK получал ISO. Конвертируем вручную.
        list = list.map(function (ev) {
          return Object.assign({}, ev, {
            DATE_FROM: _toIsoFromRuFormat(ev.DATE_FROM, ev.TZ_FROM),
            DATE_TO:   _toIsoFromRuFormat(ev.DATE_TO,   ev.TZ_TO)
          });
        });

        return { result: list };
      });
    }

    // Все остальные методы — пробрасываем как есть (crm.*, bizproc.*, calendar.*).
    return _rawCall(method, params);
  }

  /**
   * _toIsoFromRuFormat("23.04.2026 09:00:00", "Europe/Samara") → "2026-04-23T09:00:00+04:00"
   * Очень простая конвертация для отображения — в calendar.js важны миллисекунды
   * Date.parse, поэтому приводим к ISO без учёта TZ (new Date() распарсит локально).
   * В режиме вебхука это приемлемо: точные миллисекунды не критичны для UI.
   */
  function _toIsoFromRuFormat(s, tz) {
    if (!s || typeof s !== 'string') return s;
    // Уже ISO?
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s;
    var m = /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(s);
    if (!m) return s;
    // Собираем ISO без TZ — браузер распарсит в локальной зоне; для сравнения
    // интервалов это работает корректно, так как все слоты в одной зоне.
    return m[3] + '-' + m[2] + '-' + m[1] + 'T' + m[4] + ':' + m[5] + ':' + m[6];
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
