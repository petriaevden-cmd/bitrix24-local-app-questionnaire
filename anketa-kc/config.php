<?php
/**
 * Конфигурация локального приложения «Анкета КЦ»
 * Скопируйте этот файл в config.local.php и заполните реальными значениями.
 * config.local.php НЕ коммитится в репозиторий.
 */

// URL вашего портала Битрикс24
define('PORTAL_URL', 'https://your-portal.bitrix24.ru');

// OAuth 2.0 — данные локального приложения
define('APP_CLIENT_ID',     'local.XXXXXXXXXXX');
define('APP_CLIENT_SECRET', 'XXXXXXXXXXXXXXXXXXX');

// ID отдела «Отдел продаж / Колл-центр» (используется для user.get)
define('SALES_DEPT_ID', 42);

// Рабочие часы для слотов календаря (UTC+3, МСК)
define('WORK_HOUR_START', 9);
define('WORK_HOUR_END',   20);

// Продолжительность слота (минуты)
define('SLOT_DURATION_MIN', 30);

// Горизонт показа слотов (дней вперёд)
define('SLOT_HORIZON_DAYS', 7);

// Интервал polling-обновления слотов (секунды)
define('POLLING_INTERVAL', 15);

// Окно «горячего» клиента (минуты)
define('HOT_WINDOW_MIN', 30);

// Рабочие дни (1=Пн ... 7=Вс)
define('WORKDAYS', '1,2,3,4,5,6');
