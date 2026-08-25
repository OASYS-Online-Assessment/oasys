<?php

/*
	 * This file contains functions used to create, delete and modify users and user groups
	 * It is used by the user manager and by APIs that handle users
	 */

function fetchUsergroups(array $data, rixPDO &$db, array &$returnData)
{
	global $myAuth;

	$res_groups = $db->fetchTable("SELECT * FROM userGroups order by `name`", []);

	// if there are no users without usergroups, don't send the 'no group' grouping back for display, otherwise, do
	if ($db->fetchValue("SELECT COUNT(*) FROM `users` WHERE `id` NOT IN (SELECT `userId` FROM `userGroupAccess`)")['data'] !== 0) array_push($res_groups['data'], ['id' => 0, 'name' => '<NO GROUP>']);

	array_push($res_groups['data'], ['id' => -1, 'name' => '<ALL USERS>']);

	// only grant superadmins to view superadmin user group in the UI
	if ($myAuth->checkSA() === false) {
		unset($res_groups['data'][array_search('superadmin', array_column($res_groups['data'], 'name'))]);
		$res_groups['data'] = array_values($res_groups['data']);
	}

	// return filtered list of available groups
	$returnData['data'] = $res_groups['data'];
}

function renameGroup(array $data, rixPDO &$db, array &$returnData)
{
	// check params
	checkParams($data, ['groupData']);
	checkParams($data['groupData'], ['groupNewName', 'groupId']);

	// set local vars from 'data'
	$ngName = $data['groupData']['groupNewName'];

	// validate input
	if (preg_match('/[^.\sA-Za-z0-9_-]/', $ngName) || strlen($ngName) > 32) {
		$returnData['error'] = "<br>Illegal input detected! Aborting Request.";
		return;
	}

	$ngId = $data['groupData']['groupId'];
	$origName = $db->fetchValue("SELECT `name` FROM `userGroups` WHERE `id` = ?", [$ngId])['data'];

	// check for duplicate group name
	$dupCheck = $db->fetchRow("SELECT * FROM `userGroups` WHERE `name` = ?", [$ngName]);
	if ($dupCheck['rows'] !== 0) {
		if ((strtolower($ngName) !== strtolower($dupCheck['data']['name'])) || (strtolower($origName) !== strtolower($dupCheck['data']['name']))) {
			$returnData['error'] = "<br>This group name already exists! Please choose another name.";
			return;
		}
	}

	// disallow renaming of protected or special usergorups
	$aId = $db->fetchValue("SELECT `id` FROM `userGroups` WHERE `name` = ?", ['admin'])['data'];
	$saId = $db->fetchValue("SELECT `id` FROM `userGroups` WHERE `name` = ?", ['superadmin'])['data'];
	if (in_array(intval($ngId), [0, -1, intval($aId), intval($saId)])) { // this covers 'all users', 'no group', 'admin',  and 'superadmin' group records
		$returnData['error'] = "<br>This is a protected group name, and may not be renamed.";
		return;
	}

	// do rename
	$db->update('userGroups', ['name' => $ngName], "id = ?", [$ngId]);

	// return the group Id number to reload in UI
	$returnData['loadUg'] = $ngId;
}

function addGroup(array $data, rixPDO &$db, array &$returnData)
{
	checkParams($data, ['groupData']);
	checkParams($data['groupData'], ['groupName']);

	$ngName = $data['groupData']['groupName'];

	// validate input
	if (preg_match('/[^.\sA-Za-z0-9_-]/', $ngName) || strlen($ngName) > 32) {
		$returnData['error'] = "<br>Illegal input detected! Aborting Request.";
		return;
	}

	// check for duplicate group name
	$dupCheck = $db->fetchRow("SELECT * FROM `userGroups` WHERE `name` = ?", [$ngName]);
	if ($dupCheck['rows'] !== 0) {
		$returnData['error'] = "<br>This group name already exists! Please choose another name.";
		exit;
	}

	$db->startTransaction();

	$db->prepare("INSERT INTO `userGroups` VALUES(?, ?, ?)");
	$db->executePrepared([null, $ngName, '{"editorButtons": {}}']);

	$newGroupId = $db->fetchValue("SELECT `id` FROM `userGroups` WHERE `name` = ?", [$ngName])['data'];

	$c_permItems = json_decode(file_get_contents('inc/js/perm_items.json') ?? '', true);
	if (json_last_error() !== JSON_ERROR_NONE) {
		$returnData['error'] = "<br>Permission[1] JSON schema file is invalid. Please report to Oasys Administrator.";
		exit;
	}

	// create JSON accessDef structure from items permission template
	$jArr = [];
	foreach ($c_permItems as $k1 => $v1) {
		$jArr['c_items'][$k1] = false; // this sets the concept permission and defaults all to (bool) false
		foreach ($v1 as $k2 => $v2) {
			$jArr['items'][$v2] = false; // this sets the granular permission value and defaults all to (bool) false
		}
	}

	// convert to json and insert value into new user accessDef field
	$adef_json = json_encode($jArr);

	// keyed list of root table names and their associated access control table
	$tblListArr = ['itemFolders' => 'itemFolderAccess', 'testFolders' => 'testFolderAccess', 'loginsFolders' => 'loginsFolderAccess'];

	foreach ($tblListArr as $fld => $fldAccess) {
		// list of IDs to insert into the new group and accessDefs
		$fldList = $db->fetchColumn("SELECT `id` FROM {$fld} WHERE `id` != 1")['data'];

		// record insert
		foreach ($fldList as $folderId) {
			$db->prepare("INSERT INTO {$fldAccess} VALUES (null, ?, ?, null, ?)");
			$db->executePrepared([$folderId, $newGroupId, $adef_json]);
		}
	}

	$db->commit();

	$returnData['loadUg'] = $newGroupId;
}

function addUser(array $data, rixPDO &$db, array &$returnData)
{
	checkParams($data['userData'], ['nu_edt_uname', 'nu_edt_pwd', 'userGroupId', 'acctTypeVal', 'nu_edt_eml']);

	global $settings;

	$newUser = $data['userData']['nu_edt_uname'];
	$newEmail = $data['userData']['nu_edt_eml'];
	$acctType = $data['userData']['acctTypeVal'];

	// validate username
	if (preg_match('/[^.A-Za-z0-9@+_-]/', $newUser) || strlen($newUser) > 64) {
		$returnData['error'] = "<br>Illegal input detected! Aborting Request.";
		return;
	}

	// validate email
	if (filter_var($newEmail, FILTER_VALIDATE_EMAIL) === false) {
		if ($settings['emailSysActive'] === true) {
			$returnData['error'] = "<br>Illegal input detected! Aborting Request.";
			return;
		}
		if ($settings['emailSysActive'] === false && $newEmail !== "") {
			$returnData['error'] = "<br>Illegal input detected! Aborting Request.";
			return;
		}
	}

	// verify account type is in list of valid entries
	if (!in_array($acctType, $settings['authMethods'])) {
		$returnData['error'] = "<br>Illegal input detected! Aborting Request.";
		return;
	}

	// validate password
	$password = $data['userData']['nu_edt_pwd'];
	if ((empty($password) || strlen($password) > 50) && ($acctType === "LOCAL")) {
		$returnData['error'] = "<br>Illegal input detected! Aborting Request.";
		return;
	}

	$groupId = intVal($data['userData']['userGroupId']);

	$query = "SELECT COUNT(*) as `isPresent` FROM `users` WHERE `name`=?";
	$parameters = array($newUser);
	$results = $db->fetchRow($query, $parameters);

	// username duplicate checking
	if ($results['data']['isPresent'] != 0) {
		$returnData['error'] = "<br>This username already exists. Please select a unique name.";
		$returnData['userData'] = $data['userData'];
		die();
	}

	// email duplicate checking
	if ($newEmail !== "") {
		$query = "SELECT COUNT(*) as `isPresent` FROM `users` WHERE `email`=?";
		$parameters = array($newEmail);
		$results = $db->fetchRow($query, $parameters);
		if ($results['data']['isPresent'] != 0) {
			$returnData['error'] = "<br>This email already exists. Please select a unique email address.";
			$returnData['userData'] = $data['userData'];
			exit();
		}
	}

	// final password string - blank out if LDAP or other remote auth type
	$finalPass = $acctType === "LOCAL" ? password_hash($password, PASSWORD_DEFAULT) : "";

	//write new user into db
	$db->prepare('INSERT INTO `users` (`id`, `name`, `password`, `email`, `status`, `acct_type`) VALUES(?, ?, ?, ?, ?, ?)');
	$db->executePrepared([null, $newUser, $finalPass, $newEmail, "1", $acctType]);

	foreach (glob('inc/js/*generic.json') as $pFile) {
		$c_permItems = json_decode(file_get_contents($pFile) ?? '', true);

		// create base JSON accessDef structure from items permission template
		$jArr = [];
		foreach ($c_permItems as $k1 => $v1) {
			$jArr['c_items'][$k1] = false; // this sets the concept permission and defaults all to (bool) false
			foreach ($v1 as $k2 => $v2) {
				$jArr['items'][$v2] = false; // this sets the granular permission value and defaults all to (bool) false
			}
		}

		// convert to json and insert value into new user accessDef field
		$adef_json = json_encode($jArr);
		if ($adef_json !== "[]") {
			$db->prepare("UPDATE `users` SET `accessDef` = ? WHERE `name` = ?");
			$db->executePrepared([$adef_json, $newUser]);
		} else {
			$db->prepare("UPDATE `users` SET `accessDef` = '{\"c_items\": {}, \"items\": {}}' WHERE `name` = ?");
			$db->executePrepared([$newUser]);
		}

		// get new user ID
		$newId = $db->fetchValue("SELECT `id` FROM `users` WHERE `name` = ?", [$newUser])['data'];

		// return new user's name
		$newName = $db->fetchValue("SELECT `name` FROM `users` WHERE `id` = ?", [$newId])['data'];

		// set usergroupaccess value based on if real group was sent in or not
		if ($groupId > 0) {
			$db->insert('userGroupAccess', ['userId' => $newId, 'usergroupId' => $groupId]);
		}

		$returnData['data']['userId'] = $newId;
		$returnData['data']['nu_edt_uname'] = $newName;
	}
}

function deleteGroup(array $data, rixPDO &$db, array &$returnData)
{
	checkParams($data, ['groupId']);

	// get the groups for protected groups (superadmin + admin)
	$protGroups = $db->fetchColumn("SELECT `id` FROM `userGroups` WHERE `name` IN ('superadmin', 'admin')")['data'];

	// if group id is in any of the protected groups, bail
	foreach ($protGroups as $k => $pGroup) {
		if (in_array($data['groupId'], [0, -1, $pGroup])) {
			$returnData['error'] = "<br>Unable to remove protected group. Cancelling operation.";
			return;
		}
	}

	// do group deletion
	$db->prepare("DELETE FROM `userGroups` WHERE `id`=?");
	$db->executePrepared([$data['groupId']]);
}

function deleteUser(array $data, rixPDO &$db, array &$returnData)
{
	global $myAuth;

	checkParams($data, array('user2delete', 'loadUg'));
	$uid2delete = intval($data['user2delete']);
	$returnData['loadUg'] = $data['loadUg'];

	// get group(s) to which the target user belongs
	$targetGroupList = $db->fetchColumn("SELECT `usergroupId` FROM `userGroupAccess` WHERE `userId` = ?", [$uid2delete])['data'];

	// get the specific superadmin group ID value
	$saGroupId = $db->fetchValue("SELECT `id` FROM `userGroups` WHERE `name` = ?", ['superadmin'])['data'];

	// get the specific admin group ID value
	$adminGroupId = $db->fetchValue("SELECT `id` FROM `userGroups` WHERE `name` = ?", ['admin'])['data'];

	# ----------------- #
	# SELF DELETE CHECK #
	# ----------------- #

	// may not delete self
	if ($myAuth->userid === $uid2delete) {
		$returnData['error'] = "Unauthorized user deletion attempt detected.";
		return;
	}

	# ------------------------- #
	# SUPERADMIN DELETION CHECK #
	# ------------------------- #

	if (in_array($saGroupId, $targetGroupList)) {

		# check for operator being superadmin #
		if (!$myAuth->checkSA()) {
			$returnData['error'] = "Unauthorized user deletion attempt detected.";
			return;
		}

		# check for at least one other superadmin in superadmin group #

		// number of superadmins
		$saCount = $db->fetchValue("SELECT COUNT(*) FROM `userGroupAccess` WHERE `usergroupId` = ?", [$saGroupId])['data'];

		// If less than 2 superadmins exist and the target is a superadmin, do not allow deletion. The delete button may have been manually enabled in this case.
		if ($saCount === 1) {
			$returnData['error'] = "Unauthorized user deletion attempt detected.";
			return;
		}

		// If there is not at least one other enabled superadmin account, do not allow disabling
		$saDisCount = $db->fetchValue("SELECT COUNT(`status`) FROM users WHERE id IN (SELECT userId FROM userGroupAccess WHERE usergroupId = ?) AND `status` = 0", [$saGroupId])['data'];

		if (($saDisCount + 1) === $saCount && $myAuth->userid === $uid2delete) {
			$returnData['error'] = "<br>At least one superadmin user must exist and be enabled at all times. <br><br><strong>User was NOT DELETED.</strong>";
			return;
		}
	}

	# -------------------- #
	# ADMIN DELETION CHECK #
	# -------------------- #

	if (in_array($adminGroupId, $targetGroupList)) {

		// only elevated admins and superadmins can remove an admin account, or if admin trying to delete self
		if ((!$myAuth->checkElevatedAdmin() && !$myAuth->checkSA())) {
			$returnData['error'] = "Unauthorized user deletion attempt detected.";
			return;
		}
	}


	# ------------------------------------------------ #
	# GET LIST OF ALL OWNER-ORPHAN FOLDERS LEFT BEHIND #
	# ------------------------------------------------ #

	foreach (array_values(["itemFolders", "loginsFolders", "testFolders"]) as $fName) {

		$orphs[$fName] = $db->fetchTable("SELECT `id`, `name` FROM {$fName} WHERE `owner`=?", [$uid2delete])['data'];

		if (!empty($orphs[$fName])) {
			$returnData['orphs'][$fName] = $orphs[$fName];
		}
	}
	if (!empty($orphs['itemFolders']) || !empty($orphs['loginsFolders']) || !empty($orphs['testFolders'])) $returnData['ownerList'] = $db->fetchTable("SELECT `id`,`name` FROM `users` WHERE `id` != ?", [$uid2delete])['data'];

	# ----------------------------------- #
	# DELETE USER AFTER ALL CHECKS PASSED #
	# ----------------------------------- #

	$db->prepare("DELETE FROM `users` WHERE `id`=?");
	$db->executePrepared([$uid2delete]);
}

/**
 * When a backend user is deleted, they may have been the owner  
 * of various content/test/test-taker directories which require  
 * new ownership. This function takes the new owner information  
 * and applies it to the itemFolders/loginsFolders/testFolders  
 * tables in the database.
 */
function updateOwnerPostDel(array $data, rixPDO &$db, array &$returnData): void
{
	extract($data);
	$batchMode = gettype($fldId) === "integer" ? false : true;

	$oRes = $db->fetchValue("SELECT COUNT(*) FROM `users` WHERE `id` = ?", [$newOwnerId])['data'];
	if ($oRes === 0) {
		$returnData['error'] = "This user no longer exists! Please assign to another user.";
		$returnData['failedUser'] = ($batchMode) ? $fldId : [$fldId];
		if ($batchMode === true) return;
	}

	if ($batchMode === false) {
		# Validate owner and folder data still exists #
		$fRes = $db->fetchValue("SELECT COUNT(*) FROM {$tblTarg} WHERE `id` = ?", [$fldId])['data'];

		if ($fRes === 0) {
			$returnData['error'] = "This folder no longer exists! Please continue assigning all remaining folders.";
			$returnData['toDisable'][] = $fldId;
		}

		if ($oRes + $fRes !== 2) return;
		# Do owner update when all precheck conditions have passed #
		$db->fetchValue("UPDATE {$tblTarg} SET `owner` = ? WHERE `id` = ?", [$newOwnerId, $fldId]);

		# return upon successful update so UI can show result #
		$returnData["updated"] = [];
		array_push($returnData["updated"], ['fldId' => $fldId, 'newOwnerId' => $newOwnerId]);
	} else {
		$returnData["updated"] = [];
		foreach ($fldId as $fldVal) {
			$fldVal = intval($fldVal);
			$db->fetchValue("UPDATE {$tblTarg} SET `owner` = ? WHERE `id` = ?", [$newOwnerId, $fldVal]);
			$fCount = $db->fetchValue("SELECT COUNT(*) FROM {$tblTarg} WHERE `id` = ?", [$fldVal])['data'];
			if ($fCount === 0) {
				$returnData['toDisable'][] = $fldVal;
			}

			array_push($returnData["updated"], ['fldId' => $fldVal, 'newOwnerId' => $newOwnerId]);
		}
	}
}

function fetchUsers(array $data, rixPDO &$db, array &$returnData)
{
	checkParams($data, ['userGroupId']);

	// If the input usergroup id is 0, we have a special case where we query to find all users not in a group, otherwise, do a normal query for the groups associated with the user
	switch ($data['userGroupId']) {
		// query for users not in a group
		case '0':
			$query = "SELECT * FROM `users` WHERE `id` NOT IN (SELECT `userId` FROM `userGroupAccess` WHERE `usergroupId` > ?) ORDER BY `name`";
			$result = $db->fetchTable($query, [$data['userGroupId']]);
			break;

		// query for all users
		case '-1':
			$query = "SELECT * FROM `users`";
			$result = $db->fetchTable($query);
			break;

		// standard query for users in the requested group id
		default:
			$query = "SELECT * FROM `users` WHERE `id` IN (SELECT `userId` FROM `userGroupAccess` WHERE `usergroupId` = ?) ORDER BY `name`";
			$result = $db->fetchTable($query, [$data['userGroupId']]);
			break;
	}


	global $myAuth;

	$saId = $db->fetchValue("SELECT `id` FROM `userGroups` WHERE `name` = ?", ['superadmin'])['data'];
	foreach ($result['data'] as $key => &$uVal) {
		$uVal['isAdminOnly'] = $myAuth->checkAdmin($uVal['id']);
		$uVal['isSuper'] = $myAuth->checkSA($uVal['id']);

		// remove superadmin accounts from results if the operator is just an admin
		if ($myAuth->checkSA() === false) {
			$ugroups = $db->fetchColumn("SELECT `usergroupId` FROM `userGroupAccess` WHERE `userId` = ?", [$uVal['id']])['data'];
			if (in_array($saId, $ugroups)) unset($result['data'][$key]);
		}
	}

	$collectedData = [];
	$itemArray = [];
	foreach ($result['data'] as $value) {
		$itemArray['hiddenID'] = $value['id'];
		$itemArray['name']['data'] = $value['name'];
		$itemArray['name']['id'] = $value['id'];
		$itemArray['isAdminOnly'] = $value['isAdminOnly'];
		$itemArray['isSuper'] = $value['isSuper'];
		// build array set record by record
		array_push($collectedData, $itemArray);
	}

	$returnData['data'] = $collectedData;
	return $collectedData;
}

function passReset(array $data, rixPDO &$db, array &$returnData)
{
	checkParams($data, ['userId', 'newPass']);

	$accType = $db->fetchValue("SELECT `acct_type` FROM `users` WHERE `id` = ?", [$data['userId']])['data'];
	if ($accType !== "LOCAL") {
		$returnData['error'] = "Unauthorized action. Account type must be local to be reset.";
		return;
	}

	$uid = $data['userId'];
	$pass = $data['newPass'];

	$newPwdHash = password_hash($pass, PASSWORD_DEFAULT);
	$db->update('users', ['password' => $newPwdHash], 'id=?', [$uid]);
	$returnData['data'] = "Password successfully updated!";
}
