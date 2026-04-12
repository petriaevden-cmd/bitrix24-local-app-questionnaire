<?php
/**
 * config.php — конфигурация локального приложения «Анкета (МКЦ + МП)»
 * Скопируйте в config.local.php и заполните реальными значениями.
 * config.local.php НЕ коммитится в репозиторий.
 */

// URL вашего портала Bitrix24
define('PORTAL_URL', 'https://your-portal.bitrix24.ru');

// OAuth 2.0 — данные локального приложения
define('APP_CLIENT_ID',     'local.XXXXXXXXXXX');
define('APP_CLIENT_SECRET', 'XXXXXXXXXXXXXXXXXXX');

// ID отдела МКЦ (используется для user.get в app.js)
define('SALES_DEPT_ID', 42);

// Шаг слота — только 60 минут (часовые слоты)
define('SLOT_DURATION_MIN', 60);

// Горизонт показа слотов (дней вперёд)
define('SLOT_HORIZON_DAYS', 7);

// Баг 11 fix: POLLING_INTERVAL удалён — startPolling() является no-op,
// автообновление не используется.

// Минимум свободных слотов на день; если меньше — автопереход на следующий день
define('MIN_SLOTS_PER_DAY', 3);

// Диапазон «разумного» времени клиента (по его TZ)
define('CLIENT_HOUR_MIN', 9);
define('CLIENT_HOUR_MAX', 20);
