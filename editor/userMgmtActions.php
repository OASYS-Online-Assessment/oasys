<?php

require_once __DIR__ . "/inc/php/initBackend.php";
require_once __DIR__ . "/inc/php/userAuth.php";
require_once __DIR__ . "/inc/php/permAuth.php";
require_once __DIR__ . "/../inc/php/Crypt.php";

// FYI: when accessing main login page, the userAuth class will self-initialize
if (isset($_POST['src']) && $_POST['src'] === 'mlgpage') {
	$jsMyAuth = new userAuth();
}
