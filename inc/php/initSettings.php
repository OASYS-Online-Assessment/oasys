<?php
	require_once(__DIR__ . "/actionDispatcher.php");

	//first initialize the database connection
	require_once(__DIR__ . "/OasysApp.php");
	use Oasys\OasysApp;
	$app = OasysApp::getInstance();

	$config = $app->config;
	$db = $app->getDatabaseInstance();
	$settings =& $config->getSettingsArray(); //by reference to be sure that the settings stay up to date
	$skins = $config->skins;
