<?php
// api/orders.php — Food menu, cart & order lifecycle
require_once 'config.php';

header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$session = requireAuth();
$action  = $_GET['action'] ?? '';
$input   = getInput();

switch ($action) {
    case 'menu':    getMenu();                         break;
    case 'place':   placeOrder($session, $input);      break;
    case 'list':    listOrders($session);              break;
    case 'pending': pendingOrders($session);           break;
    case 'update':  updateOrder($session, $input);     break;
    case 'history': orderHistory($session);            break;
    default: jsonResponse(['success'=>false,'message'=>'Unknown action'], 400);
}

/* ── MENU ──────────────────────────────────────────────────── */
function getMenu() {
    $db   = getDB();
    $res  = $db->query('SELECT id,name,description,price,category,emoji FROM menu_items WHERE available=1 ORDER BY category,name');
    jsonResponse(['success'=>true,'items'=>$res->fetch_all(MYSQLI_ASSOC)]);
}

/* ── PLACE ORDER ───────────────────────────────────────────── */
function placeOrder($s, $in) {
    if ($s['user_role'] !== 'customer')
        jsonResponse(['success'=>false,'message'=>'Only students can place orders'], 403);

    $items    = $in['items'] ?? [];
    $total    = (float)($in['total'] ?? 0);
    $payment  = in_array($in['payment_method'] ?? '', ['cash','mpesa']) ? $in['payment_method'] : 'cash';
    $location = trim($in['delivery_location'] ?? '');

    if (empty($items))  jsonResponse(['success'=>false,'message'=>'No items in order'], 422);
    if ($total < 1)     jsonResponse(['success'=>false,'message'=>'Invalid order total'], 422);
    if (!$location)     jsonResponse(['success'=>false,'message'=>'Delivery location required'], 422);

    $db   = getDB();
    $uid  = (int)$s['user_id'];
    $json = json_encode($items, JSON_UNESCAPED_UNICODE);

    $ins = $db->prepare('INSERT INTO orders (customer_id, items, total, payment_method, delivery_location) VALUES (?,?,?,?,?)');
    $ins->bind_param('isdss', $uid, $json, $total, $payment, $location);
    if (!$ins->execute()) jsonResponse(['success'=>false,'message'=>'Could not place order'], 500);

    jsonResponse(['success'=>true,'message'=>'Order placed!','order_id'=>$db->insert_id]);
}

/* ── LIST (customer: all their orders) ────────────────────── */
function listOrders($s) {
    $db   = getDB();
    $uid  = (int)$s['user_id'];
    $stmt = $db->prepare("
        SELECT o.*, u.name AS provider_name, u.avatar AS provider_avatar
        FROM orders o LEFT JOIN users u ON o.provider_id = u.id
        WHERE o.customer_id=?
        ORDER BY o.created_at DESC LIMIT 30
    ");
    $stmt->bind_param('i', $uid);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    foreach ($rows as &$r) $r['items'] = json_decode($r['items'], true) ?: [];
    jsonResponse(['success'=>true,'orders'=>$rows]);
}

/* ── PENDING (provider: active orders to action) ───────────── */
function pendingOrders($s) {
    if ($s['user_role'] !== 'provider')
        jsonResponse(['success'=>false,'message'=>'Providers only'], 403);

    $db   = getDB();
    $uid  = (int)$s['user_id'];
    $stmt = $db->prepare("
        SELECT o.*, u.name AS customer_name, u.phone AS customer_phone, u.avatar AS customer_avatar
        FROM orders o JOIN users u ON o.customer_id = u.id
        WHERE o.status IN ('pending','preparing','out_for_delivery')
           OR (o.provider_id=? AND o.status NOT IN ('delivered','cancelled'))
        GROUP BY o.id
        ORDER BY o.created_at ASC
    ");
    $stmt->bind_param('i', $uid);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    foreach ($rows as &$r) $r['items'] = json_decode($r['items'], true) ?: [];
    jsonResponse(['success'=>true,'orders'=>$rows]);
}

/* ── UPDATE ────────────────────────────────────────────────── */
function updateOrder($s, $in) {
    $orderId = (int)($in['order_id'] ?? 0);
    $status  = trim($in['status'] ?? '');
    $allowed = ['preparing','out_for_delivery','delivered','cancelled'];

    if (!$orderId || !in_array($status, $allowed))
        jsonResponse(['success'=>false,'message'=>'Invalid order or status'], 422);

    $db   = getDB();
    $uid  = (int)$s['user_id'];
    $role = $s['user_role'];

    $fetch = $db->prepare('SELECT * FROM orders WHERE id=? LIMIT 1');
    $fetch->bind_param('i', $orderId);
    $fetch->execute();
    $order = $fetch->get_result()->fetch_assoc();
    if (!$order) jsonResponse(['success'=>false,'message'=>'Order not found'], 404);

    if ($role === 'customer' && (int)$order['customer_id'] !== $uid)
        jsonResponse(['success'=>false,'message'=>'Not your order'], 403);

    if ($status === 'preparing') {
        $upd = $db->prepare('UPDATE orders SET status=?, provider_id=?, updated_at=NOW() WHERE id=?');
        $upd->bind_param('sii', $status, $uid, $orderId);
    } else {
        $upd = $db->prepare('UPDATE orders SET status=?, updated_at=NOW() WHERE id=?');
        $upd->bind_param('si', $status, $orderId);
    }
    $upd->execute();

    // Credit provider on delivery
    if ($status === 'delivered' && $role === 'provider') {
        $total = (float)$order['total'];
        $e = $db->prepare('UPDATE users SET earnings=earnings+? WHERE id=?');
        $e->bind_param('di', $total, $uid);
        $e->execute();
    }

    jsonResponse(['success'=>true,'message'=>'Order updated','status'=>$status]);
}

/* ── HISTORY ───────────────────────────────────────────────── */
function orderHistory($s) {
    $db   = getDB();
    $uid  = (int)$s['user_id'];
    $role = $s['user_role'];

    if ($role === 'customer') {
        $stmt = $db->prepare("
            SELECT o.*, u.name AS provider_name, u.avatar AS provider_avatar
            FROM orders o LEFT JOIN users u ON o.provider_id = u.id
            WHERE o.customer_id=? AND o.status IN ('delivered','cancelled')
            ORDER BY o.updated_at DESC LIMIT 50
        ");
    } else {
        $stmt = $db->prepare("
            SELECT o.*, u.name AS customer_name, u.avatar AS customer_avatar
            FROM orders o LEFT JOIN users u ON o.customer_id = u.id
            WHERE o.provider_id=? AND o.status IN ('delivered','cancelled')
            ORDER BY o.updated_at DESC LIMIT 50
        ");
    }
    $stmt->bind_param('i', $uid);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    foreach ($rows as &$r) $r['items'] = json_decode($r['items'], true) ?: [];
    jsonResponse(['success'=>true,'orders'=>$rows]);
}
