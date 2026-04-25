<?php
// api/profile.php — Profile, stats, availability toggle
require_once 'config.php';

header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$session = requireAuth();
$action  = $_GET['action'] ?? '';
$input   = getInput();

switch ($action) {
    case 'get':                 getProfile($session);                break;
    case 'update':              updateProfile($session, $input);     break;
    case 'toggle_availability': toggleAvail($session);               break;
    case 'stats':               getStats($session);                  break;
    default: jsonResponse(['success'=>false,'message'=>'Unknown action'], 400);
}

function getProfile($s) {
    $db   = getDB();
    $stmt = $db->prepare(
        'SELECT id,name,email,phone,role,avatar,is_available,earnings,total_trips,created_at
         FROM users WHERE id=? LIMIT 1'
    );
    $stmt->bind_param('i', $s['user_id']);
    $stmt->execute();
    $user = $stmt->get_result()->fetch_assoc();
    $user ? jsonResponse(['success'=>true,'user'=>$user])
          : jsonResponse(['success'=>false,'message'=>'User not found'], 404);
}

function updateProfile($s, $in) {
    $name    = trim($in['name']         ?? '');
    $phone   = trim($in['phone']        ?? '');
    $newPass = trim($in['new_password'] ?? '');

    if (!$name) jsonResponse(['success'=>false,'message'=>'Name is required'], 422);
    if ($newPass && strlen($newPass) < 6)
        jsonResponse(['success'=>false,'message'=>'New password must be at least 6 characters'], 422);

    $db  = getDB();
    $uid = (int)$s['user_id'];

    if ($newPass) {
        $hash = password_hash($newPass, PASSWORD_BCRYPT);
        $stmt = $db->prepare('UPDATE users SET name=?,phone=?,password_hash=?,updated_at=NOW() WHERE id=?');
        $stmt->bind_param('sssi', $name, $phone, $hash, $uid);
    } else {
        $stmt = $db->prepare('UPDATE users SET name=?,phone=?,updated_at=NOW() WHERE id=?');
        $stmt->bind_param('ssi', $name, $phone, $uid);
    }

    $stmt->execute()
        ? jsonResponse(['success'=>true,'message'=>'Profile updated'])
        : jsonResponse(['success'=>false,'message'=>'Update failed'], 500);
}

function toggleAvail($s) {
    if ($s['user_role'] !== 'provider')
        jsonResponse(['success'=>false,'message'=>'Providers only'], 403);

    $db  = getDB();
    $uid = (int)$s['user_id'];

    // Single atomic toggle
    $stmt = $db->prepare('UPDATE users SET is_available = 1 - is_available, updated_at=NOW() WHERE id=?');
    $stmt->bind_param('i', $uid);
    $stmt->execute();

    $fetch = $db->prepare('SELECT is_available FROM users WHERE id=? LIMIT 1');
    $fetch->bind_param('i', $uid);
    $fetch->execute();
    $row = $fetch->get_result()->fetch_assoc();

    jsonResponse(['success'=>true,'is_available'=>(bool)$row['is_available']]);
}

function getStats($s) {
    $db   = getDB();
    $uid  = (int)$s['user_id'];
    $role = $s['user_role'];

    $u = $db->prepare('SELECT earnings, total_trips FROM users WHERE id=? LIMIT 1');
    $u->bind_param('i', $uid);
    $u->execute();
    $stats = $u->get_result()->fetch_assoc();

    if ($role === 'provider') {
        $r = $db->prepare("SELECT COUNT(*) AS pending_rides FROM rides WHERE provider_id=? AND status IN ('accepted','in_progress')");
        $r->bind_param('i', $uid); $r->execute();
        $stats += $r->get_result()->fetch_assoc();

        $o = $db->prepare("SELECT COUNT(*) AS pending_orders FROM orders WHERE provider_id=? AND status IN ('preparing','out_for_delivery')");
        $o->bind_param('i', $uid); $o->execute();
        $stats += $o->get_result()->fetch_assoc();
    } else {
        $r = $db->prepare("SELECT COUNT(*) AS total_rides FROM rides WHERE customer_id=? AND status='completed'");
        $r->bind_param('i', $uid); $r->execute();
        $stats += $r->get_result()->fetch_assoc();

        $o = $db->prepare("SELECT COUNT(*) AS total_orders FROM orders WHERE customer_id=? AND status='delivered'");
        $o->bind_param('i', $uid); $o->execute();
        $stats += $o->get_result()->fetch_assoc();
    }

    jsonResponse(['success'=>true,'stats'=>$stats]);
}
