<?php
// api/config.php — shared DB helpers for CampusServe

define('DB_HOST', 'localhost');
define('DB_USER', 'root');   // ← change to your MySQL username
define('DB_PASS', '');       // ← change to your MySQL password
define('DB_NAME', 'campusserve');

/* ── safe session start (prevents "already started" warnings) ── */
function startSession() {
    if (session_status() === PHP_SESSION_NONE) {
        session_set_cookie_params([
            'lifetime' => 86400 * 7,   // 7 days
            'path'     => '/',
            'secure'   => false,       // set true in production (HTTPS)
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_start();
    }
}

function getDB() {
    static $conn = null;
    if ($conn && $conn->ping()) return $conn;
    $conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
    if ($conn->connect_error) {
        http_response_code(500);
        die(json_encode(['success' => false, 'message' => 'DB connection failed']));
    }
    $conn->set_charset('utf8mb4');
    return $conn;
}

function jsonResponse($data, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function requireAuth() {
    startSession();
    if (empty($_SESSION['user_id'])) {
        jsonResponse(['success' => false, 'message' => 'Unauthorised — please log in'], 401);
    }
    return $_SESSION;
}

function getInput() {
    $raw  = file_get_contents('php://input');
    $json = json_decode($raw, true);
    return is_array($json) ? $json : $_POST;
}

function sanitize($value) {
    return htmlspecialchars(strip_tags(trim((string)$value)), ENT_QUOTES, 'UTF-8');
}
