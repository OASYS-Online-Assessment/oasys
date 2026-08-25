<?Php

/**
 * checks front end and backend logins to ensure warning is given prior to starting backup routine.
 * Populates $returnData with the requested logins stats and data.
 * @throws Exception
 */
function checkActiveStates($data, rixPDO &$db, &$returnData): void
{
	global $settings, $myAuth;
	$proc = $db->fetchTable("SELECT `data`, `modified` FROM `sessions` ", [])['data'];

	$be_count = 0;
	$fe_count = 0;
	$be_users = [];

	foreach ($proc as $seshDataRaw) {

		$seshDataItem = us_sesh_data($seshDataRaw['data']);

		# filter out dead and 'self' sessions from active calculation #
		if (empty($seshDataItem) || (array_key_exists("username", $seshDataItem) && $seshDataItem['username'] === $myAuth->username)) continue;

		# -------------------------------------- #
		# BACKEND ACTIVE LOGIN DETECTION ROUTINE #
		# -------------------------------------- #

		if (array_key_exists("editor_active", $seshDataItem) && $seshDataItem["editor_active"] === true) {

			if (array_key_exists("authStatus", $seshDataItem) && $seshDataItem['authStatus'] === true) {

				# if the session is already expired based on the system settings timeout value, do not count towards total of logged in users #
				$timediff = date_diff(date_create($seshDataRaw['modified']), date_create());
				$seshInMins = $timediff->d * 24 * 60 + $timediff->h * 60 + $timediff->i;

				if ($seshInMins > $settings['sessionTimeout']) continue;

				# do not include bad/malformed sessions #
				if (!array_key_exists("userid", $seshDataItem)) continue;

				# after passing all checks, add the logged in user's info to the list of active users and increment backend user count #
				$be_count++;
				$userLabel = $seshDataItem['username'] ?? "[UNKNOWN]";
				array_push($be_users, $userLabel . " (userid: " . $seshDataItem['userid'] . ") Active: " . (($timediff->d * 24) + ($timediff->h)) . $timediff->format(" hours %i minutes %s seconds") . " ago.");
			}
		}

		# --------------------------------------- #
		# FRONTEND ACTIVE LOGIN DETECTION ROUTINE #
		# --------------------------------------- #

		if (array_key_exists("frontend", $seshDataItem)) {

			foreach ($seshDataItem["frontend"] as $k => $v) {

				# if the frontend subkey values are empty, there is no activity, so do not process #
				if (!empty($v)) {

					# exclude users who are in preview mode #
					if (array_key_exists("action", $v) && $v["action"] == "preview") continue;

					# exclude frontend users which are considered disconnected from the server #
					$timeoutLimit = round($settings['retryCount'] * $settings['sendFrequency'] / 1000);
					$timediff = date_diff(date_create($seshDataRaw['modified']), date_create());
					$seshInSecs = ($timediff->d * 86400) + ($timediff->h * 3600) + ($timediff->i * 60);

					if ($seshInSecs > $timeoutLimit) {
						continue;
					} else {
						# increment frontend active users when all checks passed #
						$fe_count++;
					}
				}
			}
		}
	}

	$returnData['becount'] = $be_count;
	$returnData['beusers'] = $be_users;
	$returnData['fecount'] = $fe_count;
}

# ------------------------------------------------------------------------------- #
# Robustly decode the session 'data' values from DB to check for active instances #
# ------------------------------------------------------------------------------- #
/* nice work Frits van Campen - https://www.php.net/manual/en/function.session-decode.php#108037 */

function us_sesh_data($session_data): array
{
	$return_data = array();
	$offset = 0;
	while ($offset < strlen($session_data)) {
		if (!strstr(substr($session_data, $offset), "|")) {
			throw new Exception("invalid data, remaining: " . substr($session_data, $offset));
		}
		$pos = strpos($session_data, "|", $offset);
		$num = $pos - $offset;
		$varname = substr($session_data, $offset, $num);
		$offset += $num + 1;

		/*
		As of Php 8.3, unserialize throws a warning instead of notice when it cannot 
		continue to reconstruct the input data, however, we are incrementing the key/
		val pairs through the $offset increments, so we only need the first part of the 
		string parsed, and don't care about the rest of the string. Anywho, for our 
		purposes, we will ignore the warning emitted and everything will work finely, 
		as it did prior to Php 8.3.

		I could write a little sub-parser which will determine the length of the target 
		key/val pair we want to unserialize only, but I would have to go much deeper 
		into the guts of session serialization syntax, and it would be most likely an 
		error-prone, not fully vetted, and potential security risk to try and cover all 
		possible serialization escaping sequences myself.

		This method will always successfully unserialize the first K/V pair it 
		encounters, and we don't care about the "warning" after.
		
		It remains beyond my comprehension that Php does not offer a native method
		to deserialize its own internal format for session storage, hence this long
		but still somewhat measured rant/explanation. We must solely rely on 
		public contributors to solve this deserialization issue, and as of Php 8.3,
		the most popular solution now throws warnings.
		*/

		$data = @unserialize(substr($session_data, $offset));
		error_clear_last();

		$return_data[$varname] = $data;
		$offset += strlen(serialize($data));
	}
	return $return_data;
}

# ------------------------ #
# MAINTENANCE MODE CONTROL #
# ------------------------ #

/**
 * Gets the current maintenance mode status (frontend or backend).
 *
 * @param  string $section ["frontend"|"backend"|"all"]
 * @param  rixPDO $db
 * @return bool
 */
function get_mmode(string $section, rixPDO $db)
{
	if ($section === "all") {
		$returnState = $db->fetchTable("SELECT * FROM `systemState`", [], "sys_section")['data'];
		return $returnState;
	} else {
		$returnState = $db->fetchValue("SELECT `status` FROM `systemState` WHERE `sys_section` = ?", [$section])['data'];
		return ($returnState === 0) ? false : true;
	}
}

/**
 * Activates/deactivates system maintenance mode status.
 *
 * @param  string $sections ["all"|"frontend"|"backend"]
 * @param  int $state 1 = activate; 0 = deactivate
 * @param  rixPDO $db
 * @return void
 */
function set_mmode(string $sections, int $state, rixPDO $db): void
{
	switch ($sections) {
		case 'all':
			$db->execute("UPDATE `systemState` SET `status` = ?", [$state]);
			break;

		case 'frontend':
			$db->execute("UPDATE `systemState` SET `status` = ? WHERE sys_section = 'frontend'", [$state]);
			break;

		case 'backend':
			$db->execute("UPDATE `systemState` SET `status` = ? WHERE sys_section = 'backend'", [$state]);
			break;
	}
}

# ------------------------ #
# SESSION HANDLING CONTROL #
# ------------------------ #

/**
 * Remove all backend sessions, leave the session of the operator invoking request
 */
function rem_be_sessions(rixPDO $db): void
{
	global $myAuth;
	$myAuth->wc_session(); // write/close backend sessions to avoid clashes with sessions table operation(s)
	$db->execute("DELETE FROM `sessions` WHERE `id` !=? AND (`data` LIKE '%editor_active|%' OR `data` LIKE '%previewMode%')", [$myAuth->sid]);
}

/**
 * backup sessions and return as array var
 */
function bkpSessions(rixPDO $db): array
{
	global $sql_db, $sql_password, $sql_user;
	$db = new rixPDO($sql_db, $sql_user, $sql_password);

	return $db->fetchTable("SELECT * from `sessions`", [])['data'];
}

/**
 * restore sessions into table given a proper array var
 */
function resSessions(array $seshArr, rixPDO $db): void
{
	global $sql_db, $sql_password, $sql_user;
	$db = new rixPDO($sql_db, $sql_user, $sql_password);

	// clear out and restore sessions table from pre-restore state (minus everyone except snapshot restore operator)
	$db->execute("TRUNCATE TABLE `sessions`", []);

	// really, we should just have the 1 entry to restore (the sa/admin launching the restore), but let's keep the loop for future potential use
	foreach ($seshArr as $sr_item) {
		$db->insert("sessions", [$sr_item]);
	}
}
