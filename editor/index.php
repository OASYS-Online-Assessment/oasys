<!DOCTYPE html>
<html lang="en">

<head>
	<?php
	// Prevent new logins when .stopfile is generated from a K8s pod termination signal.
	require_once __DIR__ . '/inc/php/stopCheck.php';
	
	# ------------------------------------------------------------ #
	# Validation and redirection of account password reset request #
	# ------------------------------------------------------------ #
	$forceLang = $_GET['forceLang'] ?? $_POST['lang'] ?? 'EN';
	$forceLang = is_string($forceLang) ? strtoupper($forceLang) : 'EN';
	if (!in_array($forceLang, ['EN', 'FR', 'DE'], true)) {
		$forceLang = 'EN';
	}

	require_once __DIR__ . '/inc/php/initBackend.php';
	if (!isset($backendState->userid)) {
		$settings['interfaceLanguage'] = $forceLang;
	}
	require_once("inc/php/authkeygen.php");

	// Refresh modified login assets without requiring users to clear their browser cache.
	$interfaceCssVersion = filemtime(__DIR__ . '/inc/css/interface.css') ?: 0;
	$loginJsVersion = filemtime(__DIR__ . '/inc/js/login.js') ?: 0;
	?>

	<meta http-equiv="Content-Type" content="text/html;charset=utf-8">
	<title>OASYS Editor Index</title>

	<!-- CSS Includes -->
	<link rel="stylesheet" href="../inc/nxButton/nxButton.css">
	<link rel="stylesheet" href="../inc/nxDialog/nxDialog.css" />
	<link type="text/css" href="inc/css/interface.css?v=<?php echo $interfaceCssVersion; ?>" rel="stylesheet">
	<link rel="stylesheet" href="../inc/css/login.css" />
	<link rel="icon" href="images/favicon.png">

	<!-- External JS Library Includes -->
	<script src="../inc/js/jquery-3.2.1.min.js"></script>
	<script src="../inc/jquery-ui-1.12.1/jquery-ui.min.js"></script>

	<!-- Oasys JS Module Includes -->
	<script src="../inc/js/rixTools.js"></script>
	<script src="../inc/js/jsModalWait.js"></script>
	<script src="../inc/js/jsPointerHandler.js"></script>
	<script src="../inc/nxButton/nxButton.js"></script>
	<script src="../inc/nxDialog/nxDialog.js"></script>
	<script src="inc/js/interface.js"></script>

	<!-- Main Login Page Include (And Mode Set) -->
	<script src="inc/js/login.js?v=<?php echo $loginJsVersion; ?>"></script>

	<script id='forceLang'>
		"use strict";
		<?php
		echo 'sessionStorage.setItem("forceLang", ' . json_encode($forceLang) . ');';
		?>
	</script>

	<!-- settings -->
	<?php include_once 'inc/php/settings2JS.php'; ?>

</head>

<body id="body">
	<div id="svgMainMenuSymbols" class="svgSymbols">
		<?php echo file_get_contents("../images/mainMenuIcons/symbols.svg"); ?>
	</div>
</body>

</html>
