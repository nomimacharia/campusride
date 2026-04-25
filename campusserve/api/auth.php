<?php
// api/auth.php — Authentication: register / login / logout / session
require_once 'config.php';

header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

startSession();

$action = $_GET['action'] ?? '';
$input  = getInput();

switch ($action) {
    case 'register': doRegister($input); break;
    case 'login':    doLogin($input);    break;
    case 'logout':   doLogout();         break;
    case 'session':  doSession();        break;
    default: jsonResponse(['success' => false, 'message' => 'Unknown action'], 400);
}

/* ── REGISTER ──────────────────────────────────────────────── */
function doRegister($in) {
    $name  = trim($in['name']  ?? '');
    $email = strtolower(trim($in['email'] ?? ''));
    $phone = trim($in['phone'] ?? '');
    $pass  = $in['password'] ?? '';
    $role  = in_array($in['role'] ?? '', ['customer','provider']) ? $in['role'] : 'customer';

    if (!$name)                               jsonResponse(['success'=>false,'message'=>'Name is required'], 422);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) jsonResponse(['success'=>false,'message'=>'Invalid email address'], 422);
    if (strlen($pass) < 6)                    jsonResponse(['success'=>false,'message'=>'Password must be at least 6 characters'], 422);

    $db = getDB();

    $chk = $db->prepare('SELECT id FROM users WHERE email = ?');
    $chk->bind_param('s', $email);
    $chk->execute();
    if ($chk->get_result()->num_rows > 0)
        jsonResponse(['success'=>false,'message'=>'Email already registered'], 409);

    $hash    = password_hash($pass, PASSWORD_BCRYPT);
    $avatars = ['🧑','👩','👨','🧑‍🎓','👩‍🎓','👨‍🎓','🧒','👦','👧'];
    $avatar  = $avatars[array_rand($avatars)];

    $ins = $db->prepare('INSERT INTO users (name, email, phone, password_hash, role, avatar) VALUES (?,?,?,?,?,?)');
    $ins->bind_param('ssssss', $name, $email, $phone, $hash, $role, $avatar);

    if (!$ins->execute())
        jsonResponse(['success'=>false,'message'=>'Registration failed — try again'], 500);

    $userId = $db->insert_id;
    $_SESSION['user_id']   = $userId;
    $_SESSION['user_name'] = $name;
    $_SESSION['user_role'] = $role;

    jsonResponse(['success'=>true, 'message'=>'Account created!', 'user'=>[
        'id'=>$userId,'name'=>$name,'email'=>$email,'phone'=>$phone,
        'role'=>$role,'avatar'=>$avatar,'is_available'=>0,
        'earnings'=>'0.00','total_trips'=>0,'created_at'=>date('Y-m-d H:i:s'),
    ]]);
}

/* ── LOGIN ─────────────────────────────────────────────────── */
function doLogin($in) {
    $email = strtolower(trim($in['email'] ?? ''));
    $pass  = $in['password'] ?? '';

    if (!$email || !$pass)
        jsonResponse(['success'=>false,'message'=>'Email and password are required'], 422);

    $db   = getDB();
    $stmt = $db->prepare(
        'SELECT id,name,email,phone,password_hash,role,avatar,is_available,earnings,total_trips,created_at
         FROM users WHERE email = ? LIMIT 1'
    );
    $stmt->bind_param('s', $email);
    $stmt->execute();
    $user = $stmt->get_result()->fetch_assoc();

    if (!$user || !password_verify($pass, $user['password_hash']))
        jsonResponse(['success'=>false,'message'=>'Incorrect email or password'], 401);

    $_SESSION['user_id']   = $user['id'];
    $_SESSION['user_name'] = $user['name'];
    $_SESSION['user_role'] = $user['role'];

    unset($user['password_hash']);
    jsonResponse(['success'=>true,'message'=>'Welcome back!','user'=>$user]);
}

/* ── LOGOUT ────────────────────────────────────────────────── */
function doLogout() {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();
    jsonResponse(['success'=>true,'message'=>'Logged out']);
}

/* ── SESSION CHECK ──────────────────────────────────────────── */
function doSession() {
    if (empty($_SESSION['user_id']))
        jsonResponse(['success'=>false,'message'=>'Not authenticated'], 401);

    $db   = getDB();
    $stmt = $db->prepare(
        'SELECT id,name,email,phone,role,avatar,is_available,earnings,total_trips,created_at
         FROM users WHERE id = ? LIMIT 1'
    );
    $stmt->bind_param('i', $_SESSION['user_id']);
    $stmt->execute();
    $user = $stmt->get_result()->fetch_assoc();

    if (!$user) { session_destroy(); jsonResponse(['success'=>false,'message'=>'Session expired'], 401); }
    jsonResponse(['success'=>true,'user'=>$user]);
}
