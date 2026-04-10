<?php
/**
 * index.php — основной iframe-виджет анкеты КЦ
 * Загружается Битрикс24 в таб карточки лида (CRM_LEAD_DETAIL_TAB)
 */
require_once __DIR__ . '/config.php';
?>
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Анкета КЦ</title>
  <!-- BX24 JS SDK -->
  <script src="https://<?= htmlspecialchars(parse_url(PORTAL_URL, PHP_URL_HOST)) ?>/bitrix/js/rest/bx24.js"></script>
  <link rel="stylesheet" href="assets/style.css">
</head>
<body>

<div id="app">
  <!-- Состояние загрузки -->
  <div id="loading" class="loading">
    <span class="spinner"></span>
    <p>Загрузка данных лида...</p>
  </div>

  <!-- Сообщения об ошибках -->
  <div id="error-msg" class="error-msg" style="display:none;"></div>

  <!-- Основная форма анкеты -->
  <form id="anketa-form" style="display:none;" novalidate>

    <!-- Блок 1: Финансовые данные -->
    <section class="form-section" id="section-finance">
      <h2 class="section-title">1. Финансовые данные</h2>
      <!-- Поля генерируются динамически через form.js -->
    </section>

    <!-- Блок 2: Кредитная история -->
    <section class="form-section" id="section-credit">
      <h2 class="section-title">2. Кредитная история</h2>
    </section>

    <!-- Блок 3: Личные данные -->
    <section class="form-section" id="section-personal">
      <h2 class="section-title">3. Личные данные</h2>
    </section>

    <!-- Блок 4: Менеджерские заметки -->
    <section class="form-section" id="section-manager">
      <h2 class="section-title">4. Заметки менеджера</h2>
    </section>

    <!-- Блок 5: Запись к специалисту -->
    <section class="form-section" id="section-booking">
      <h2 class="section-title">5. Запись к специалисту</h2>
      <div id="manager-slots"></div>
    </section>

    <div class="form-actions">
      <button type="submit" id="btn-save" class="btn btn-primary">Сохранить анкету</button>
      <button type="button" id="btn-reset" class="btn btn-secondary">Сбросить</button>
    </div>

  </form>

  <!-- Сообщение об успехе -->
  <div id="success-msg" class="success-msg" style="display:none;"></div>
</div>

<script src="assets/app.js"></script>
<script src="assets/form.js"></script>
<script src="assets/calendar.js"></script>
<script src="assets/polling.js"></script>
</body>
</html>
