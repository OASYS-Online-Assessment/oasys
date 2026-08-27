<?php

	//first initialize settings class which reads all user agnostic settings
	require_once(__DIR__ . "/../../../inc/php/initSettings.php");
	require_once(__DIR__ . "/actionAllowlist.php");
	require_once(__DIR__ . "/searchHelpers.php");
	require_once(__DIR__ . "/OasysBackendState.php");
	use Oasys\Backend\OasysBackendState;

	$backendState = OasysBackendState::getInstance();

	if (isset($backendState->userid)) {
		$forceLang = $forceLang ?? ''; // Ensure $forceLang is defined, even if not set
		$config->fetchUserSettings($backendState->userid, $backendState->usergroup, $forceLang);
	}
