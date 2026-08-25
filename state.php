<?php

	require_once __DIR__ . '/editor/inc/php/initBackend.php';
	require_once __DIR__ . '/editor/inc/php/systemState.php';
	require_once __DIR__ . '/inc/php/rixTools.php';

	echo "<h2>OASYS system state overview</h2>\n";

	if ($backendState->isStateActive()) {
		$data = $backendState->getAllStateData();
		debugArray($data, "BackendState Data");
	} else {
		echo "<h3>BackendState</h3>\n";
		echo "<p>No active state.</p>\n";
	}

	if (isset($settings)) {
		debugArray($settings, "Settings");
	}