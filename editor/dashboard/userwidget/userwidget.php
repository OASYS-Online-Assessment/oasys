<?php
// Always output JSON (even on fatal)
	register_shutdown_function('outputJSON');
	require_once __DIR__ . '/../../inc/php/initBackend.php';

	$action = filter_input(INPUT_POST, 'action') ?: "";
	$returnData = ['data' => [], 'action' => $action, 'error' => false];

	/* Auth */
	$pageName = "dashboard";
	$isSubMod = true;
	$isActionFile = true;
	require_once '../../inc/php/authCommonFunctions.php';
	$returnData = (array)$myAuth->returnData;
	if ($myAuth->returnData['error'] !== false) {
		exit;
	}
	if (!($myAuth->checkAdmin() || $myAuth->checkElevatedAdmin() || $myAuth->checkSA())) {
		$returnData['error'] = 'Unauthorized operation attempted.';
		exit;
	}

	/* Input */
	$data = filter_input(INPUT_POST, 'data');
	$data = $data ? json_decode($data ?? '', true) : [];
	if (!$data) $data = [];

	/* Dispatch */
	if ($action && function_exists($action)) {
		if (oasysRejectUnknownAction(__FILE__, $action, $returnData)) exit;
		$action($data, $db, $returnData, $myAuth);
	}

	/* =========================
	   ACTIONS
	========================= */

	function readOverview($data, rixPDO &$db, array &$returnData, userAuth &$myAuth)
	{
		$isSA = $myAuth->checkSA();
		[$uaWhere, $uaParams] = user_anti_sa_where($db, $isSA);

		// Total users
		$row = $db->fetchRow("SELECT COUNT(*) AS c FROM users u $uaWhere", $uaParams);
		$totalUsers = (int)($row['data']['c'] ?? 0);

		// Groups (hide superadmin for non-SA)
		if ($isSA) $row = $db->fetchRow("SELECT COUNT(*) AS c FROM userGroups", []);
		else       $row = $db->fetchRow("SELECT COUNT(*) AS c FROM userGroups WHERE name <> 'superadmin'", []);
		$totalGroups = (int)($row['data']['c'] ?? 0);

		// Blocked
		$row = $db->fetchRow("SELECT COUNT(*) AS c FROM users u $uaWhere AND COALESCE(u.status,1)=0", $uaParams);
		$blocked = (int)($row['data']['c'] ?? 0);

		// Bad logins
		$row = $db->fetchRow("
        SELECT COUNT(*) AS affected, COALESCE(SUM(u.bad_logins),0) AS total
        FROM users u $uaWhere AND COALESCE(u.bad_logins,0) > 0", $uaParams);
		$badUsers = (int)($row['data']['affected'] ?? 0);
		$badTotal = (int)($row['data']['total'] ?? 0);

		// Root folder access (non-admins)
		$row = $db->fetchRow("
        SELECT COUNT(*) AS c
        FROM users u
        WHERE COALESCE(u.homeaccess,0)=1
          AND u.id NOT IN (SELECT uga.userid FROM userGroupAccess uga
                           JOIN userGroups g ON g.id=uga.usergroupid
                           WHERE g.name='admin')
          " . ($isSA ? "" :
				" AND u.id NOT IN (SELECT userid FROM userGroupAccess
                                   WHERE usergroupid IN (SELECT id FROM userGroups WHERE name='superadmin'))")
			, []);
		$homeAccess = (int)($row['data']['c'] ?? 0);

		// No email
		$row = $db->fetchRow("SELECT COUNT(*) AS c FROM users u $uaWhere AND (u.email IS NULL OR TRIM(u.email)='')", $uaParams);
		$noEmail = (int)($row['data']['c'] ?? 0);

		$returnData['data'] = [
			'summary' => [
				'users' => $totalUsers,
				'groups' => $totalGroups,
				'blocked' => $blocked,
				'badUsers' => $badUsers,
				'badTotal' => $badTotal,
				'homeAccess' => $homeAccess,
				'noEmail' => $noEmail
			]
		];
	}

	function listUsers($data, rixPDO &$db, array &$returnData, userAuth &$myAuth)
	{
		$isSA = $myAuth->checkSA();
		[$uaWhere, $uaParams] = user_anti_sa_where($db, $isSA);

		$rows = $db->fetchTable("
        SELECT u.id, u.name, u.email,
               COALESCE(NULLIF(TRIM(u.defLang),''),'(browser)') AS defLang,
               UPPER(COALESCE(NULLIF(TRIM(u.acct_type),''),'LOCAL')) AS acct_type,
               CASE WHEN COALESCE(u.status,1)=0 THEN 1 ELSE 0 END AS blocked
        FROM users u
        $uaWhere
        ORDER BY u.name ASC
    ", $uaParams);

		// Attach groups for each user
		$out = [];
		foreach (($rows['data'] ?? []) as $r) {
			$g = $db->fetchTable("
            SELECT g.name FROM userGroupAccess uga
            JOIN userGroups g ON g.id = uga.usergroupid
            WHERE uga.userid = ?
            ORDER BY g.name ASC
        ", [$r['id']]);
			$r['groups'] = array_map(fn($x) => $x['name'], ($g['data'] ?? []));
			$out[] = $r;
		}
		$returnData['data'] = ['users' => $out];
	}

	function listGroups($data, rixPDO &$db, array &$returnData, userAuth &$myAuth)
	{
		$isSA = $myAuth->checkSA();

		// Get groups (hide the superadmin group for non-SA viewers)
		$groups = $db->fetchTable("
        SELECT g.id, g.name
        FROM userGroups g
        " . ($isSA ? "" : " WHERE g.name <> 'superadmin' ") . "
        ORDER BY g.name ASC
    ", [])['data'] ?? [];

		$out = [];
		foreach ($groups as $g) {
			$gid = (int)$g['id'];

			// Fetch members' names for this group.
			// For non-SA viewers, exclude users that are in the superadmin group.
			if ($isSA) {
				$rows = $db->fetchTable("
                SELECT u.name
                FROM userGroupAccess uga
                JOIN users u ON u.id = uga.userid
                WHERE uga.usergroupid = ?
                ORDER BY u.name ASC
            ", [$gid])['data'] ?? [];
			} else {
				$rows = $db->fetchTable("
                SELECT u.name
                FROM userGroupAccess uga
                JOIN users u ON u.id = uga.userid
                /* exclude users who are in superadmin */
                WHERE uga.usergroupid = ?
                  AND u.id NOT IN (
                      SELECT uga2.userid
                      FROM userGroupAccess uga2
                      JOIN userGroups sg ON sg.id = uga2.usergroupid
                      WHERE sg.name='superadmin'
                  )
                ORDER BY u.name ASC
            ", [$gid])['data'] ?? [];
			}

			$names = array_map(static fn($r) => (string)$r['name'], $rows);
			$out[] = [
				'id' => $gid,
				'name' => $g['name'],
				'members' => count($names),
				'membersList' => $names,       // <-- used for the hover tooltip
			];
		}

		$returnData['data'] = ['groups' => $out];
	}


	function listBlocked($data, rixPDO &$db, array &$returnData, userAuth &$myAuth)
	{
		$isSA = $myAuth->checkSA();
		[$uaWhere, $uaParams] = user_anti_sa_where($db, $isSA);

		$rows = $db->fetchTable("
        SELECT u.id, u.name, u.email,
               COALESCE(NULLIF(TRIM(u.defLang),''),'(browser)') AS defLang
        FROM users u
        $uaWhere AND COALESCE(u.status,1)=0
        ORDER BY u.name ASC
    ", $uaParams);

		$returnData['data'] = ['blocked' => ($rows['data'] ?? [])];
	}

	function listBadLogins($data, rixPDO &$db, array &$returnData, userAuth &$myAuth)
	{
		$isSA = $myAuth->checkSA();
		[$uaWhere, $uaParams] = user_anti_sa_where($db, $isSA);

		$rows = $db->fetchTable("
        SELECT u.id, u.name, u.email, u.bad_logins, u.last_bad_pass
        FROM users u
        $uaWhere AND COALESCE(u.bad_logins,0) > 0
        ORDER BY (u.last_bad_pass IS NULL) ASC, u.last_bad_pass DESC, u.name ASC
    ", $uaParams);

		$returnData['data'] = ['bad' => ($rows['data'] ?? [])];
	}

	function listHomeAccess($data, rixPDO &$db, array &$returnData, userAuth &$myAuth)
	{
		$isSA = $myAuth->checkSA();

		$rows = $db->fetchTable("
        SELECT u.id, u.name, u.email
        FROM users u
        WHERE COALESCE(u.homeaccess,0)=1
          AND u.id NOT IN (SELECT uga.userid FROM userGroupAccess uga
                           JOIN userGroups g ON g.id=uga.usergroupid
                           WHERE g.name='admin')
          " . ($isSA ? "" : " AND u.id NOT IN (
                SELECT userid FROM userGroupAccess
                WHERE usergroupid IN (SELECT id FROM userGroups WHERE name='superadmin')
          )") . "
        ORDER BY u.name ASC
    ", []);
		$returnData['data'] = ['home' => ($rows['data'] ?? [])];
	}

	function listNoEmail($data, rixPDO &$db, array &$returnData, userAuth &$myAuth)
	{
		$isSA = $myAuth->checkSA();
		[$uaWhere, $uaParams] = user_anti_sa_where($db, $isSA);

		$rows = $db->fetchTable("
        SELECT u.id, u.name, COALESCE(NULLIF(TRIM(u.defLang),''),'(browser)') AS defLang
        FROM users u
        $uaWhere AND (u.email IS NULL OR TRIM(u.email)='')
        ORDER BY u.name ASC
    ", $uaParams);

		$returnData['data'] = ['noemail' => ($rows['data'] ?? [])];
	}

	/* =========================
	   HELPERS
	========================= */
	function user_anti_sa_where(rixPDO $db, bool $viewerIsSA): array
	{
		if ($viewerIsSA) return ["WHERE 1=1", []];

		$where = "WHERE u.id NOT IN (
                SELECT uga.userid
                FROM userGroupAccess uga
                JOIN userGroups g ON g.id = uga.usergroupid
                WHERE g.name = 'superadmin'
              )";
		return [$where, []];
	}

	/* =========================
	   OUTPUT (always JSON)
	========================= */
	function outputJSON()
	{
		global $returnData, $action, $myAuth;

		$returnData['loggedInName'] = $myAuth->username ?? '';
		if (!isset($returnData['action'])) $returnData['action'] = $action;

		if ($e = error_get_last()) {
			$documentRoot = filter_input(INPUT_SERVER, "DOCUMENT_ROOT");
			$file = str_replace($documentRoot, '', $e['file']);
			$returnData['fatalError'] =
				"<p>Fatal error [type {$e['type']}] on line {$e['line']} of<br>" .
				"<code class='tinyCode'>$file</code></p><p>{$e['message']}</p>";
		}
		header('Cache-Control: no-cache, must-revalidate');
		header('Content-type: application/json; charset=UTF-8');
		echo json_encode($returnData);
	}
