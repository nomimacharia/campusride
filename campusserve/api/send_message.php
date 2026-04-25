<?php
// send_message.php — alias for messages.php?action=send
// Kept for spec compliance; frontend uses messages.php directly
$_GET['action'] = 'send';
require_once __DIR__ . '/messages.php';
