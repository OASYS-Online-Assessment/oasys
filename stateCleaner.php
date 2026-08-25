<?php

	global $filterSettings;
	$filterSettings = true;

	require_once 'inc/php/database.php';
	require_once 'inc/php/settings.php';
	require_once 'inc/php/OasysFrontendState.php';
	require_once 'inc/php/exceptions/StateExpiredException.php';

	use Oasys\frontend\OasysFrontendState;
	use Oasys\exceptions\StateExpiredException;

	$serialNumber = filter_input(INPUT_POST, 'serialNumber');
	if (!$serialNumber) {
		die();
	}

	try {
		$state = OasysFrontendState::getInstance($serialNumber);
		$state->eraseState();
	} catch (StateExpiredException $e) {
		//do nothing
	}