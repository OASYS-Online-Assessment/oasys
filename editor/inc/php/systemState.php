<?Php

	use Oasys\BackEnd\OasysBackendState;
	use Oasys\FrontEnd\OasysFrontendState;

	/**
	 * checks front end and backend logins to ensure warning is given prior to starting backup routine.
	 * Populates $returnData with the requested logins stats and data.
	 * @throws Exception
	 */

	require_once __DIR__ . '/uiLang.php';
	require_once __DIR__ . '/OasysBackendState.php';
	require_once __DIR__ . '/../../../inc/php/OasysFrontendState.php';
	global $settings;

	$uiLang = new uiLang($settings['interfaceLanguage']);

	function checkActiveStates(array $data, rixPDO &$db, array &$returnData): void
	{
		global $settings, $myAuth, $uiLang;

		$includeSelf = !empty($data['includeSelf']);

		$be_count = 0; //count of back end users who are active
		$fe_count = 0; //count of active front end users
		$be_users = []; //list of active back end users (name, userid, time since activity)
		$fe_users = []; //list of active front end users (userid)
		$be_idList = []; //list of userids of back end users
		$fe_idList = []; //list of userids of front end users (identical to $fe_users)

		$states = OasysBackendState::fetchAllActiveStates();

		// BACKEND ACTIVE LOGINS
		foreach ($states as $state) {
			$stateData = $state['data'];

			$isSelf = isset($stateData['username']) && $stateData['username'] === $myAuth?->username;
			if (!$includeSelf && $isSelf) continue;

			$deltaT = $state['inactivityTime'];

			if (!empty($stateData['userid'])) {
				$be_count++;
				$label = ($stateData['username'] ?? "[" . $uiLang->translate("UNKNOWN") . "]");
				$be_users[] = $uiLang->translate("%@ (userid: %@) Active: %@h %@m %@s ago.", [$label, $stateData['userid'], ($deltaT->d * 24) + $deltaT->h, $deltaT->i, $deltaT->s]);
				$be_idList[] = $stateData['userid'];
			}

		}

		// FRONTEND ACTIVE LOGINS (run once)
		$fe_users = OasysFrontendState::fetchActiveLogins();
		$fe_count = count($fe_users);
		if ($fe_count > 0) {
			foreach ($fe_users as $fe_user) {
				$fe_idList[] = $fe_user['loginId'];
			}
		}

		$returnData['becount'] = $be_count;
		$returnData['beusers'] = $be_users;
		$returnData['fecount'] = $fe_count;
		$returnData['feusers'] = $fe_users;
		$returnData['be_idlist'] = $be_idList;
		$returnData['fe_idlist'] = $fe_idList;
	}

	# ------------------------ #
	# MAINTENANCE MODE CONTROL #
	# ------------------------ #

	/**
	 * Gets the current maintenance mode status (frontend or backend).
	 * @param string $section ["frontend"|"backend"|"all"]
	 * @param rixPDO $db
	 * @return bool
	 */
	function get_mmode(string $section, rixPDO $db): array|bool
	{
		if ($section === "all") {
			$returnState = $db->fetchTable("SELECT * FROM `systemState`", [], "sys_section")['data'];
			return $returnState;
		} else {
			$returnState = $db->fetchValue("SELECT `status` FROM `systemState` WHERE `sys_section` = ?", [$section])['data'];
			return !(($returnState === 0));
		}
	}

	/**
	 * Activates/deactivates system maintenance mode status.
	 * @param string $sections ["all"|"frontend"|"backend"]
	 * @param int $state 1 = activate; 0 = deactivate
	 * @param rixPDO $db
	 * @return void
	 */
	function set_mmode(string $sections, int $state, rixPDO $db): void
	{
		switch ($sections) {
			case 'all':
				$db->execute("UPDATE `systemState` SET `status` = ? WHERE TRUE", [$state]);
				break;

			case 'frontend':
				$db->execute("UPDATE `systemState` SET `status` = ? WHERE sys_section = 'frontend'", [$state]);
				break;

			case 'backend':
				$db->execute("UPDATE `systemState` SET `status` = ? WHERE sys_section = 'backend'", [$state]);
				break;
		}
	}
