<?php
/**
 * proxy.php — серверный прокси для batch-запросов к REST API Битрикс24
 *
 * Используется для обхода ограничений CORS и для выполнения
 * server-side вызовов (например, при OAuth server flow).
 *
 * TODO: реализовать авторизацию запросов, валидацию входных данных.
 */
header('Content-Type: application/json');
require_once __DIR__ . '/config.php';

// Пример: принять JSON-тело запроса и проксировать в Б24
$input = json_decode(file_get_contents('php://input'), true);

// TODO: добавить проверку подписи/токена от BX24.js
echo json_encode(['status' => 'not_implemented']);
