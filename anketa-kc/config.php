<?php
/**
 * config.php — конфигурация локального приложения «Анкета (МКЦ + МП)»
 *
 * Все вызовы REST API выполняются на клиенте через BX24 JS SDK.
 * Вебхук используется только для серверных запросов (если понадобятся).
 */

// URL вашего портала Bitrix24
define('PORTAL_URL', 'https://crm.yurclick.com');

// Вебхук для серверных вызовов REST API (scope: bizproc, calendar, crm)
define('WEBHOOK_URL', 'https://crm.yurclick.com/rest/6/m1umtpppnvj21gud/');

// ID шаблона бизнес-процесса «Назначить встречу»
define('BP_TEMPLATE_ID', 40);

// ID отдела продаж (для фильтрации сотрудников, если понадобится)
define('SALES_DEPT_ID', 1);

// Шаг слота — только 60 минут (часовые слоты)
define('SLOT_DURATION_MIN', 60);

// Горизонт показа слотов (дней вперёд)
define('SLOT_HORIZON_DAYS', 7);

// Минимум свободных слотов на день; если меньше — автопереход на следующий день
define('MIN_SLOTS_PER_DAY', 1);

// Диапазон «разумного» времени клиента (по его TZ)
define('CLIENT_HOUR_MIN', 9);
define('CLIENT_HOUR_MAX', 20);
