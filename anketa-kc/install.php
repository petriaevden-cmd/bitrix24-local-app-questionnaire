<?php
/**
 * install.php — установщик приложения
 * Вызывается Битрикс24 при установке локального приложения.
 *
 * Выполняет:
 * 1. Проверку OAuth (app.info)
 * 2. Проверку и создание 26 пользовательских полей UF_CRM_KC_*
 * 3. Регистрацию плейсмента CRM_LEAD_DETAIL_TAB
 */
require_once __DIR__ . '/config.php';
?>
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Установка Анкеты КЦ</title>
  <script src="https://<?= htmlspecialchars(parse_url(PORTAL_URL, PHP_URL_HOST)) ?>/bitrix/js/rest/bx24.js"></script>
</head>
<body>
<p id="status">Идёт установка...</p>
<script>
/**
 * TODO: реализовать логику установки:
 * 1. BX24.init → app.info (проверка OAuth)
 * 2. crm.lead.userfield.list (проверить существующие KC-поля)
 * 3. crm.lead.userfield.add для каждого из 26 полей (пропустить существующие)
 * 4. placement.bind → CRM_LEAD_DETAIL_TAB
 * Реализация — в assets/app.js (install mode)
 */
</script>
</body>
</html>
