<?php
	/*
	 	In order to set database credentials in a secure way outside of the htdocs directory, they can be set inside the
		virtual host config file as environment variables:

	    SetEnv db_oasys_host "<database host>"
	    SetEnv db_oasys_name "<database name>"
	    SetEnv db_oasys_user "<database login>"
	    SetEnv db_oasys_password "<database password>"
	 */

	//if setting the credentials in vhost config is not an option, they can be set in inc/php/db_credentials.php
	require_once __DIR__ . "/db_credentials.php";
	assert($credentials instanceof stdClass);

	//check if /conf/env.ini exists, if not copy the conf/env.default.ini to conf/env.ini
	if (!file_exists(__DIR__ . "/../../conf/env.ini")) {
		copy(__DIR__ . "/../../conf/env.default", __DIR__ . "/../../conf/env.ini");
	}

	//read the /conf/env.ini file to get the name of the environment variable that contains the database credentials
	$env = parse_ini_file(__DIR__ . "/../../conf/env.ini");

	$sql_host = $_SERVER[$env['host']] ?? null;
	if (!$sql_host) {
		$sql_host = $credentials->host;
	}

	$sql_db = $_SERVER[$env['db']] ?? null;
	if (!$sql_db) {
		$sql_db = $credentials->db;
	}

	$sql_user = $_SERVER[$env['user']] ?? null;
	if (!$sql_user) {
		$sql_user = $credentials->user;
	}

	$sql_password = $_SERVER[$env['password']] ?? null;
	if (!$sql_password) {
		$sql_password = $credentials->password;
	}
