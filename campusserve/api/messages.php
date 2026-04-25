<?php
// api/messages.php — Per-ride chat: send & poll
require_once 'config.php';

header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$session = requireAuth();
$action  = $_GET['action'] ?? '';
$input   = getInput();

switch ($action) {
    case 'send': sendMsg($session, $input); break;
    case 'get':  getMsgs($session);        break;
    default: jsonResponse(['success'=>false,'message'=>'Unknown action'], 400);
}

function canAccessChat($db, $rideId, $uid) {
    // Customer always owns their ride; provider must be assigned
    $stmt = $db->prepare('SELECT customer_id, provider_id FROM rides WHERE id=? LIMIT 1');
    $stmt->bind_param('i', $rideId);
    $stmt->execute();
    $ride = $stmt->get_result()->fetch_assoc();
    if (!$ride) return false;
    return (int)$ride['customer_id'] === $uid
        || (int)$ride['provider_id'] === $uid;
}

/* ── SEND ──────────────────────────────────────────────────── */
function sendMsg($s, $in) {
    $rideId  = (int)($in['ride_id'] ?? 0);
    $message = trim($in['message'] ?? '');

    if (!$rideId || $message === '')
        jsonResponse(['success'=>false,'message'=>'ride_id and message required'], 422);
    if (mb_strlen($message) > 1000)
        jsonResponse(['success'=>false,'message'=>'Message too long (max 1000 chars)'], 422);

    $db  = getDB();
    $uid = (int)$s['user_id'];

    if (!canAccessChat($db, $rideId, $uid))
        jsonResponse(['success'=>false,'message'=>'Access denied to this chat'], 403);

    $ins = $db->prepare('INSERT INTO messages (ride_id, sender_id, message) VALUES (?,?,?)');
    $ins->bind_param('iis', $rideId, $uid, $message);
    if (!$ins->execute()) jsonResponse(['success'=>false,'message'=>'Could not send message'], 500);

    jsonResponse(['success'=>true,'message_id'=>$db->insert_id]);
}

/* ── GET (poll) ────────────────────────────────────────────── */
function getMsgs($s) {
    $rideId = (int)($_GET['ride_id'] ?? 0);
    $since  = (int)($_GET['since']   ?? 0);

    if (!$rideId) jsonResponse(['success'=>false,'message'=>'ride_id required'], 422);

    $db  = getDB();
    $uid = (int)$s['user_id'];

    if (!canAccessChat($db, $rideId, $uid))
        jsonResponse(['success'=>false,'message'=>'Access denied'], 403);

    if ($since > 0) {
        $stmt = $db->prepare("
            SELECT m.id, m.ride_id, m.sender_id, m.message, m.created_at,
                   u.name AS sender_name, u.avatar AS sender_avatar
            FROM messages m JOIN users u ON m.sender_id = u.id
            WHERE m.ride_id=? AND m.id>?
            ORDER BY m.created_at ASC LIMIT 50
        ");
        $stmt->bind_param('ii', $rideId, $since);
    } else {
        $stmt = $db->prepare("
            SELECT m.id, m.ride_id, m.sender_id, m.message, m.created_at,
                   u.name AS sender_name, u.avatar AS sender_avatar
            FROM messages m JOIN users u ON m.sender_id = u.id
            WHERE m.ride_id=?
            ORDER BY m.created_at ASC LIMIT 100
        ");
        $stmt->bind_param('i', $rideId);
    }
    $stmt->execute();
    jsonResponse([
        'success'  => true,
        'messages' => $stmt->get_result()->fetch_all(MYSQLI_ASSOC),
        'user_id'  => $uid,
    ]);
}
