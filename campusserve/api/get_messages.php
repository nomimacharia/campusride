<?php
// get_messages.php — alias for messages.php?action=get
// Kept for spec compliance; frontend uses messages.php directly
$_GET['action'] = 'get';
require_once __DIR__ . '/messages.php';
