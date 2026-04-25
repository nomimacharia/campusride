<?php
// api/rides.php — Ride booking & management
require_once 'config.php';

header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$session = requireAuth();
$action  = $_GET['action'] ?? '';
$input   = getInput();

switch ($action) {
    case 'book':      bookRide($session, $input);      break;
    case 'available': availableRides($session);        break;
    case 'active':    activeRide($session);            break;
    case 'update':    updateRide($session, $input);    break;
    case 'history':   rideHistory($session);           break;
    case 'list':      listRides($session);             break;
    default: jsonResponse(['success'=>false,'message'=>'Unknown action'], 400);
}

/* ── BOOK ──────────────────────────────────────────────────── */
function bookRide($s, $in) {
    if ($s['user_role'] !== 'customer')
        jsonResponse(['success'=>false,'message'=>'Only students can book rides'], 403);

    $pickup = trim($in['pickup'] ?? '');
    $dest   = trim($in['destination'] ?? '');
    $fare   = (float)($in['fare'] ?? 0);

    if (!$pickup || !$dest)  jsonResponse(['success'=>false,'message'=>'Pickup and destination required'], 422);
    if ($pickup === $dest)   jsonResponse(['success'=>false,'message'=>'Pickup and destination must differ'], 422);
    if ($fare < 1)           jsonResponse(['success'=>false,'message'=>'Invalid fare amount'], 422);

    $db  = getDB();
    $uid = (int)$s['user_id'];

    // Prevent duplicate active rides
    $chk = $db->prepare("SELECT id FROM rides WHERE customer_id=? AND status IN ('pending','accepted','in_progress') LIMIT 1");
    $chk->bind_param('i', $uid);
    $chk->execute();
    if ($chk->get_result()->num_rows > 0)
        jsonResponse(['success'=>false,'message'=>'You already have an active ride'], 409);

    $ins = $db->prepare('INSERT INTO rides (customer_id, pickup, destination, fare) VALUES (?,?,?,?)');
    $ins->bind_param('issd', $uid, $pickup, $dest, $fare);
    if (!$ins->execute()) jsonResponse(['success'=>false,'message'=>'Could not create ride'], 500);

    jsonResponse(['success'=>true,'message'=>'Ride booked!','ride_id'=>$db->insert_id]);
}

/* ── AVAILABLE (provider sees pending) ─────────────────────── */
function availableRides($s) {
    if ($s['user_role'] !== 'provider')
        jsonResponse(['success'=>false,'message'=>'Providers only'], 403);

    $db   = getDB();
    $stmt = $db->prepare("
        SELECT r.*, u.name AS customer_name, u.phone AS customer_phone, u.avatar AS customer_avatar
        FROM rides r JOIN users u ON r.customer_id = u.id
        WHERE r.status = 'pending'
        ORDER BY r.created_at ASC
    ");
    $stmt->execute();
    jsonResponse(['success'=>true,'rides'=>$stmt->get_result()->fetch_all(MYSQLI_ASSOC)]);
}

/* ── ACTIVE (current in-flight ride) ───────────────────────── */
function activeRide($s) {
    $db   = getDB();
    $uid  = (int)$s['user_id'];
    $role = $s['user_role'];

    if ($role === 'customer') {
        $stmt = $db->prepare("
            SELECT r.*, u.name AS provider_name, u.phone AS provider_phone, u.avatar AS provider_avatar
            FROM rides r LEFT JOIN users u ON r.provider_id = u.id
            WHERE r.customer_id=? AND r.status IN ('pending','accepted','in_progress')
            ORDER BY r.created_at DESC LIMIT 1
        ");
    } else {
        $stmt = $db->prepare("
            SELECT r.*, u.name AS customer_name, u.phone AS customer_phone, u.avatar AS customer_avatar
            FROM rides r LEFT JOIN users u ON r.customer_id = u.id
            WHERE r.provider_id=? AND r.status IN ('accepted','in_progress')
            ORDER BY r.created_at DESC LIMIT 1
        ");
    }
    $stmt->bind_param('i', $uid);
    $stmt->execute();
    jsonResponse(['success'=>true,'ride'=>$stmt->get_result()->fetch_assoc()]);
}

/* ── UPDATE ────────────────────────────────────────────────── */
function updateRide($s, $in) {
    $rideId = (int)($in['ride_id'] ?? 0);
    $status = trim($in['status'] ?? '');
    $allowed = ['accepted','in_progress','completed','cancelled'];

    if (!$rideId || !in_array($status, $allowed))
        jsonResponse(['success'=>false,'message'=>'Invalid ride or status'], 422);

    $db   = getDB();
    $uid  = (int)$s['user_id'];
    $role = $s['user_role'];

    $fetch = $db->prepare('SELECT * FROM rides WHERE id=? LIMIT 1');
    $fetch->bind_param('i', $rideId);
    $fetch->execute();
    $ride = $fetch->get_result()->fetch_assoc();
    if (!$ride) jsonResponse(['success'=>false,'message'=>'Ride not found'], 404);

    // Permission checks
    if ($role === 'customer') {
        if ((int)$ride['customer_id'] !== $uid) jsonResponse(['success'=>false,'message'=>'Not your ride'], 403);
        if (!in_array($status, ['cancelled']))   jsonResponse(['success'=>false,'message'=>'Customers may only cancel'], 403);
    } else {
        if ($ride['provider_id'] && (int)$ride['provider_id'] !== $uid && $status !== 'accepted')
            jsonResponse(['success'=>false,'message'=>'Ride assigned to another rider'], 403);
    }

    if ($status === 'accepted') {
        $upd = $db->prepare('UPDATE rides SET status=?, provider_id=?, updated_at=NOW() WHERE id=?');
        $upd->bind_param('sii', $status, $uid, $rideId);
    } else {
        $upd = $db->prepare('UPDATE rides SET status=?, updated_at=NOW() WHERE id=?');
        $upd->bind_param('si', $status, $rideId);
    }
    $upd->execute();

    // Credit earnings on completion
    if ($status === 'completed' && $role === 'provider') {
        $fare = (float)$ride['fare'];
        $e = $db->prepare('UPDATE users SET earnings=earnings+?, total_trips=total_trips+1 WHERE id=?');
        $e->bind_param('di', $fare, $uid);
        $e->execute();
    }

    jsonResponse(['success'=>true,'message'=>'Ride updated','status'=>$status]);
}

/* ── HISTORY ───────────────────────────────────────────────── */
function rideHistory($s) {
    $db   = getDB();
    $uid  = (int)$s['user_id'];
    $role = $s['user_role'];

    if ($role === 'customer') {
        $stmt = $db->prepare("
            SELECT r.*, u.name AS provider_name, u.avatar AS provider_avatar
            FROM rides r LEFT JOIN users u ON r.provider_id = u.id
            WHERE r.customer_id=? AND r.status IN ('completed','cancelled')
            ORDER BY r.updated_at DESC LIMIT 50
        ");
    } else {
        $stmt = $db->prepare("
            SELECT r.*, u.name AS customer_name, u.avatar AS customer_avatar
            FROM rides r LEFT JOIN users u ON r.customer_id = u.id
            WHERE r.provider_id=? AND r.status IN ('completed','cancelled')
            ORDER BY r.updated_at DESC LIMIT 50
        ");
    }
    $stmt->bind_param('i', $uid);
    $stmt->execute();
    jsonResponse(['success'=>true,'rides'=>$stmt->get_result()->fetch_all(MYSQLI_ASSOC)]);
}

/* ── LIST (customer: all their rides) ─────────────────────── */
function listRides($s) {
    $db   = getDB();
    $uid  = (int)$s['user_id'];
    $stmt = $db->prepare("
        SELECT r.*, u.name AS provider_name, u.avatar AS provider_avatar
        FROM rides r LEFT JOIN users u ON r.provider_id = u.id
        WHERE r.customer_id=?
        ORDER BY r.created_at DESC LIMIT 30
    ");
    $stmt->bind_param('i', $uid);
    $stmt->execute();
    jsonResponse(['success'=>true,'rides'=>$stmt->get_result()->fetch_all(MYSQLI_ASSOC)]);
}
