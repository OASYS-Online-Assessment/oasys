<?php

	declare(strict_types=1);

	use Oasys\OasysApp;

	require_once __DIR__ . "/OasysApp.php";

	final class OasysTestTakers
	{
		private function __construct()
		{
		}

		/** Return the login ID associated with a password ID, or false if it does not exist. */
		public static function getLoginForPassword(int $passwordId): int|false
		{
			$db = OasysApp::getInstance()->getDatabaseInstance();
			$res = $db->fetchValue("SELECT loginId FROM passwords WHERE id = ?", [$passwordId]);

			if ($res['rows'] === 0) {
				return false;
			}

			return (int)$res['data'];
		}
	}
