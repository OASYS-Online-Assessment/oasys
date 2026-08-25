<?php

/** @phan-file-suppress PhanUnusedGlobalFunctionParameter, PhanUnusedVariable, PhanRedefineFunction, PhanUnusedClosureParameter, PhanTypeArraySuspiciousNullable, PhanSuspiciousWeakTypeComparison, PhanUnusedVariableValueOfForeachWithKey, PhanUnusedPublicNoOverrideMethodParameter */

//the JSON output will happen, even if a fatal error prevents the script from finishing
register_shutdown_function('outputJSON');
require_once '../../inc/php/database.php';
require_once '../../../inc/php/rixPDO.php';

$action = filter_input(INPUT_POST, 'action');
if (!$action) {
	$action = "";
}



$returnData = [];
$returnData['data'] = [];
$returnData['action'] = $action;
$returnData['error'] = false;

# ----------------------- #
# Authentication Includes #
# ----------------------- #
$pageName = "dashboard"; // set to the related 'editor button' string name (e.g., 'items')
$isSubMod = true; // set true if a module page in a subdirectory
$isActionFile = true; // set true if an "xxxActions.php" file
require_once '../../inc/php/authCommonFunctions.php'; // required for authentication inclusion

$returnData = (array) $myAuth->returnData;

// if the auth constructor results in an error, we want to immediately exit and report said error
if ($myAuth->returnData['error'] !== false) {
	// $returnData['error'] = $myAuth->returnData['error'];
	exit;
}


$data = filter_input(INPUT_POST, 'data');
if ($data) {
	$data = json_decode($data ?? '', true);
}
if (!$data) {
	$data = array();
}
//data field must be separately JSON encoded before sending to get past max_input_vars limitation

$db = new rixPDO($sql_db, $sql_user, $sql_password, $sql_host, '../../../logs/watchlist.log', 1, $returnData, 'error');

$action($data, $db, $returnData, $myAuth);

/*
###############
FUNCTIONS START
###############
*/

function getContent($data, rixPDO &$db, &$returnData, userAuth &$myAuth)
{
	if (!isset($returnData['data'])) {
		$returnData['data'] = [];
	}
	$permAuth = new permAuth("fetchLibrary", $data, $myAuth);

	$query = "SELECT * FROM `watchList` WHERE `user_id` = ? AND foreign_table IN (1,2)";
	$res = $db->fetchTable($query, [$myAuth->userid]);
	foreach ($res['data'] as $r) {
		if ($r['foreign_table'] == 1) { // folder
			$sql = "SELECT itemFolders.*, COALESCE(users.name, '-') AS uname FROM itemFolders LEFT JOIN users ON itemFolders.owner = users.id WHERE itemFolders.id = ?";
			$folder = $db->fetchRow($sql, [$r['foreign_id']]);
            $returnData['folder']=$folder;
			$path = pathToString(fetchPath('itemFolders', $folder['data']['parent']));
			$accessVal = ($myAuth->checkAdmin() || $myAuth->checkElevatedAdmin() || $myAuth->checkSA()) ? true : $permAuth->getAccessVal("items", "fetchLibrary", "itemObject", $r['foreign_id']);
			array_push($returnData['data'], ['type' => 'folder', 'id' => $folder['data']['id'], 'name' => $folder['data']['name'], 'owner' => $folder['data']['uname'], 'message' => 'placeholder for message', 'watchid' => $r['id'], 'path' => $path . '/' . $folder['data']['name'], 'access' => $accessVal]);
		} else { // page
			$sql = "SELECT itemGroups.* from itemGroups WHERE itemGroups.id = ?";
			$page = $db->fetchRow($sql, [$r['foreign_id']]);
            $returnData['group']=$r['foreign_id'];
			$path = pathToString(fetchPath('itemFolders', $page['data']['parent']));
			$accessVal = ($myAuth->checkAdmin() || $myAuth->checkElevatedAdmin() || $myAuth->checkSA()) ? true : $permAuth->getAccessVal("items", "fetchLibrary", "itemObject", $page['data']['parent']);
			array_push($returnData['data'], ['type' => 'group', 'id' => $page['data']['id'], 'name' => $page['data']['name'], 'owner' => '', 'message' => 'placeholder for message', 'watchid' => $r['id'], 'path' => $path . '/' . $page['data']['name'], 'access' => $accessVal]);
		}
	}

	usort($returnData['data'], function ($a, $b) {
		return strcasecmp($a['name'], $b['name']);
	});
}

function getTests($data, rixPDO &$db, &$returnData, userAuth &$myAuth)
{
	if (!isset($returnData['data'])) {
		$returnData['data'] = [];
	}

	$permAuth = new permAuth("fetchLibrary", $data, $myAuth);

	$query = "SELECT * FROM `watchList` WHERE `user_id` = ? AND foreign_table IN (3,4)";
	$res = $db->fetchTable($query, [$myAuth->userid]);
	foreach ($res['data'] as $r) {
		if ($r['foreign_table'] == 3) { // folder
			// check permissions
			$sql = "SELECT testFolders.*, COALESCE(users.name, '-') AS uname from testFolders LEFT JOIN users ON testFolders.owner = users.id WHERE testFolders.id = ?";
			$folder = $db->fetchRow($sql, [$r['foreign_id']]);
			$path = pathToString(fetchPath('testFolders', $folder['data']['id']));
			$accessVal = ($myAuth->checkAdmin() || $myAuth->checkElevatedAdmin() || $myAuth->checkSA()) ? true : $permAuth->getAccessVal("tests", "fetchLibrary", "itemObject", $r['foreign_id']);
			array_push($returnData['data'], ['type' => 'folder', 'id' => $folder['data']['id'], 'name' => $folder['data']['name'], 'owner' => $folder['data']['uname'], 'ttype' => ' ', 'lang' => ' ', 'active' => ' ', 'activity' => ' ', 'message' => '', 'watchid' => $r['id'], 'path' => $path, 'access' => $accessVal]);
		} else { // test
			$sql = "SELECT id, name, active, parent, JSON_EXTRACT(structure, '$.type') AS ttype FROM tests WHERE id = ?";
			$test = $db->fetchRow($sql, [$r['foreign_id']]);
			$path = pathToString(fetchPath('testFolders', $test['data']['parent']));
			// check permissions
			$accessVal = ($myAuth->checkAdmin() || $myAuth->checkElevatedAdmin() || $myAuth->checkSA()) ? true : $permAuth->getAccessVal("tests", "fetchLibrary", "itemObject", $test['data']['parent']);
			// languages
			$langSQL = "SELECT GROUP_CONCAT(DISTINCT lang.code ORDER BY lang.code ASC) AS language_codes FROM languages lang JOIN tests t ON JSON_UNQUOTE(JSON_EXTRACT(t.options, CONCAT('$.', lang.code))) = 'true' WHERE t.id = ?";
			$lang = $db->fetchValue($langSQL, [$r['foreign_id']]);
			// test taker data
			$actSQL = "SELECT SUM(subquery.pwdUsingTest) AS totalPwdUsingTest FROM (SELECT COUNT(*) AS pwdUsingTest FROM activity WHERE testId = ? GROUP BY loginId) AS subquery";
			$act = $db->fetchValue($actSQL, [$r['foreign_id']]);
			// active?
			$active = $test['data']['active'] == 1 ? 'active' : 'inactive';
			$ttype = str_replace('"', '', $test['data']['ttype']); // remove quotes

			// retrieve scheduling restrictions
			$restrictions = fetchRestrictions($r['foreign_id']);

			// scheduled test?
			if ($restrictions['scheduled'] === true) {
				$active = 'scheduled';
			}
			// current date > date restriction
            if (($restrictions['unexpired'] ?? true) === false) {
                $active = 'expired';
            }


            // issues?
			$issues = plausCheckTests($r['foreign_id']);

			array_push($returnData['data'], ['type' => 'test', 'id' => $test['data']['id'], 'name' => $test['data']['name'], 'owner' => ' ', 'ttype' => $ttype, 'lang' => $lang['data'], 'active' => $active, 'activity' => $act['data'], 'message' => 'placeholder for message', 'watchid' => $r['id'], 'path' => $path . '/' . $test['data']['name'], 'restrictions' => $restrictions, 'issues' => $issues, 'access' => $accessVal]);
		}
	}

	usort($returnData['data'], function ($a, $b) {
		return strcasecmp($a['name'], $b['name']);
	});
}

function getTesttakers($data, rixPDO &$db, &$returnData, userAuth &$myAuth)
{
	if (!isset($returnData['data'])) {
		$returnData['data'] = [];
	}
	$permAuth = new permAuth("fetchLibrary", $data, $myAuth);

	$query = "SELECT * FROM `watchList` WHERE `user_id` = ? AND foreign_table IN (5,6)";
	$res = $db->fetchTable($query, [$myAuth->userid]);
	foreach ($res['data'] as $r) {
		if ($r['foreign_table'] == 5) { // folder
			$sql = "SELECT loginsFolders.*, COALESCE(users.name, '-') AS uname from loginsFolders LEFT JOIN users ON loginsFolders.owner = users.id WHERE loginsFolders.id = ?";
			$folder = $db->fetchRow($sql, [$r['foreign_id']]);
			$path = pathToString(fetchPath('loginsFolders', $folder['data']['parent']));
			$accessVal = ($myAuth->checkAdmin() || $myAuth->checkElevatedAdmin() || $myAuth->checkSA()) ? true : $permAuth->getAccessVal("testTakers", "fetchLibrary", "itemObject", $r['foreign_id']);
			array_push($returnData['data'], ['type' => 'folder', 'id' => $folder['data']['id'], 'name' => $folder['data']['name'], 'owner' => $folder['data']['uname'], 'message' => 'placeholder for message', 'watchid' => $r['id'], 'path' => $path . '/' . $folder['data']['name'], 'loginType' => ' ', 'access' => $accessVal]);
		} else { // tt
			$sql = "SELECT id, parent, name, template, loginType from logins WHERE id = ?";
			$testTaker = $db->fetchRow($sql, [$r['foreign_id']]);
			$path = pathToString(fetchPath('loginsFolders', $testTaker['data']['parent']));
			$issues = plausCheckTestTaker($r['foreign_id']);
			$accessVal = ($myAuth->checkAdmin() || $myAuth->checkElevatedAdmin() || $myAuth->checkSA()) ? true : $permAuth->getAccessVal("testTakers", "fetchLibrary", "itemObject", $testTaker['data']['parent']);
			array_push($returnData['data'], ['type' => $testTaker['data']['template'], 'id' => $testTaker['data']['id'], 'name' => $testTaker['data']['name'], 'owner' => ' ', 'message' => 'placeholder for message', 'watchid' => $r['id'], 'path' => $path . '/' . $testTaker['data']['name'], 'loginType' => $testTaker['data']['loginType'], 'issues' => $issues, 'access' => $accessVal]);
		}
	}

	usort($returnData['data'], function ($a, $b) {
		return strcasecmp($a['name'], $b['name']);
	});
}

function unWatch($data, rixPDO &$db, &$returnData, userAuth &$myAuth)
{
	if (!isset($returnData['data'])) {
		$returnData['data'] = [];
	}
	array_push($returnData['data'], ['type' => $data['tab']]);
	$db->execute("DELETE FROM `watchList` WHERE `id` = ?", [$data['id']]);
}

function fetchPath($tableName, $location)
{
	global $db;
	$query = "SELECT name, parent FROM " . $tableName . " WHERE id=?";
	$parameters = array($location);
	$results = $db->fetchRow($query, $parameters);
	if ($results['data']['parent'] !== null) {
		$path = fetchPath($tableName, $results['data']['parent']);
		if ($path === false) {
			return false;
		}
		$path[] = array('name' => $results['data']['name'], 'id' => $location);
	} else {
		$path = array();
		$path[] = array('name' => $results['data']['name'], 'id' => $location);
	}

	return $path;
}

function pathToString($path): ?string
{
	if ($path === false) return null;
	if (count($path) === 0) {
		return '/';
	}
	$s = '';
	foreach ($path as $folder) {
		$s .= '/' . $folder['name'];
	}
	return substr($s, 5);
}

function fetchRestrictions($test) // scheduled tests
{
	global $db;
	$restrictions = [];
	$sql = "SELECT JSON_EXTRACT(options, '$.restrictions') AS restrictions,  JSON_EXTRACT(options, '$.forceLogoff') AS forceLogoff FROM tests WHERE id = ?";
	$res = $db->fetchRow($sql, [$test]);
	if ($res['data']['restrictions'] === NULL) {
		$restrictions['indate'] = true;
		$restrictions['intime'] = true;
		$restrictions['inday']  = true;
		$restrictions['unexpired']  = true;
		$restrictions['scheduled']  = false;
	} else {
		$restrictionsObj = json_decode($res['data']['restrictions']);
		#var_dump($restrictionsObj);
		// in date interval?
		if (empty($restrictionsObj->dateRange)) {
			$restrictions['indate'] = true;
			$restrictions['unexpired']  = true;
		} else {
			$currentDate = new DateTime();
			$startInterval = new DateTime($restrictionsObj->dateRange->start);
			$endInterval   = new DateTime($restrictionsObj->dateRange->end);

			if ($currentDate >= $startInterval && $currentDate <= $endInterval) {
				$restrictions['indate'] = true;
				$restrictions['unexpired']  = true;
			} else {
				$restrictions['indate'] = false;
			}
			if ($currentDate >= $endInterval) $restrictions['unexpired']  = false; // will be in daterange never again

		}
		if (empty($restrictionsObj->timeRestriction)) {
			$restrictions['intime'] = true;
		} else {
			$currentTime = strtotime(date('H:i'));
			$startTime   = strtotime($restrictionsObj->timeRestriction->start);
			$endTime     = strtotime($restrictionsObj->timeRestriction->end);
			if ($currentTime >= $startTime && $currentTime <= $endTime) {
				$restrictions['intime'] = true;
			} else {
				$restrictions['intime'] = false;
			}
		}
		if (empty($restrictionsObj->testDays)) {
			$restrictions['inday'] = true;
		} else {
			$currentDayOfWeek = date('N') - 1;
			$dayslist = explode(',', $restrictionsObj->testDays->days);
			if (in_array($currentDayOfWeek, $dayslist)) {
				$restrictions['inday'] = true;
			} else {
				$restrictions['inday'] = false;
			}
		}

		if (in_array(false, $restrictions)) {
			$restrictions['scheduled']  = true;
		} else {
			$restrictions['scheduled']  = false;
		}
	}
	$restrictions['restrictionsobject'] = $res['data']['restrictions'];
	if ($res['data']['forceLogoff'] === NULL) {
		$restrictions['forceLogoff'] = false;
	} else {
		$restrictions['forceLogoff'] = filter_var($res['data']['forceLogoff'], FILTER_VALIDATE_BOOLEAN);
	}
	return $restrictions;
}

function plausCheckTestTaker($testTaker)
{
	global $db;
	$issues = ['issuesFound' => false, 'noPws' => false, 'pwsWithoutTests' => false, 'pwsWithDeletedTests' => false, 'issueCount' => 0];

	$query = "SELECT count(*) FROM passwords WHERE loginID = ?";
	$parameters = array($testTaker);
	$result = $db->fetchRow($query, $parameters);
	if ($result['data']['count(*)'] == 0) $issues['noPws'] = true;

	$query = "SELECT count(*) FROM passwords WHERE loginID=? AND structure IS NULL OR structure = '[]'";
	$parameters = array($testTaker);
	$result = $db->fetchRow($query, $parameters);
	if ($result['data']['count(*)'] != 0) $issues['pwsWithoutTests'] = true;

	$query = "SELECT * FROM passwords WHERE loginID=? AND structure IS NOT NULL";
	$parameters = array($testTaker);
	$result = $db->fetchTable($query, $parameters);

	if (count($result['data']) > 0) {
		foreach ($result['data'] as $value) {
			$jsonData = json_decode($value['structure'] ?? '', true);
			foreach ($jsonData as $key => $jsonDataItem) {
				$query = "SELECT count(*) FROM tests WHERE id=?";
				$parameters = array($jsonDataItem['hiddenID']);
				$result = $db->fetchRow($query, $parameters);
				if ($result['data']['count(*)'] < 1) $issues['pwsWithDeletedTests'] = true;
			}
		}
	}
	$i = 0;
	foreach ($issues as $issue) {
		if ($issue === true) {
			$issues['issuesFound']  = true;
			$i++;
		}
	}
	$issues['issueCount']  = $i;
	return $issues;
}

function plausCheckTests($test)
{
	global $db;
    $issues = ['issuesFound' => false, 'noItems' => false, 'timerIssue' => false, 'noContentError' => [], 'noContentErrorFlag' => false, 'noActiveLanguage' => false, 'langError' => [], 'langErrorFlag' => false, 'missingItems' => [], 'missingItemsFlag' => false, 'itemsAmountError' => [], 'itemsAmountErrorFlag' => false, 'deletedPool' => [], 'deletedPoolFlag' => false, 'issueCount' => 0, 'pnNoContent' => false, 'duplicates' => false];

    $query = "
    SELECT 
        JSON_EXTRACT(structure, '$.items') AS structure, 
        JSON_EXTRACT(structure, '$.type') AS type, 
        options, 
        metadata,
        CASE 
            WHEN JSON_EXTRACT(t.skin, '$.skinOptions.privacyPolicy.value') IS NOT NULL 
                 AND JSON_EXTRACT(t.skin, '$.skinOptions.privacyPolicy.value') = 'true' 
            THEN TRUE 
            ELSE FALSE 
        END AS activePn
    FROM 
        tests t
    WHERE 
        id = ?";

    $parameters = array($test);
	$res = $db->fetchRow($query, $parameters);
	$structure = json_decode($res['data']['structure']);
	$options = json_decode($res['data']['options']);

	$query = "SELECT code, name from languages";
	$lang = $db->fetchTable($query, []);

	$activeLanguages = array();

	foreach ($lang['data'] as $language) {
		$code = $language['code'];
		if (isset($options->$code) && $options->$code === true) {
			$activeLanguages[] = $language;
		}
	}

	if (isset($options->useTimer) && $options->useTimer === true && $options->timeLimit === 0) {
		$issues['timerIssue'] = true;
	}

	if (count($activeLanguages) === 0) $issues['noActiveLanguage'] = true;

    //Check if privacy notice is active and available in active languages
    if ($res['data']['activePn'] === 1) {
        if ($res['data']['metadata'] !== null) {
            $metadata = json_decode($res['data']['metadata'], true);
            if (isset($metadata['privacy_policy']) && is_array($metadata['privacy_policy'])) {
                foreach ($activeLanguages as $lang) {
                    if (!isset($metadata['privacy_policy'][$lang['code']]) || empty($metadata['privacy_policy']['code'])) {
                        $issues['pnNoContent'] = true;
                    }
                }
            }
        } else {
            $issues['pnNoContent'] = true;
        }
    }

	switch ($res['data']['type']) {
		case '"linear"':
            if (count($structure) > 0) {
                $seenHiddenIDs = [];

                foreach ($structure as $key => $structureItem) {
                    // ** Check for duplicates **
                    if (in_array($structureItem->hiddenID, $seenHiddenIDs)) {
                        $issues['duplicates'] = true;
                    } else {
                        $seenHiddenIDs[] = $structureItem->hiddenID;
                    }

                    $query = 'SELECT * FROM items WHERE id=?';
                    $parameters = array($structureItem->hiddenID);
                    $result = $db->fetchTable($query, $parameters);

                    if (count($result['data']) > 0) {
                        $jsonData = json_decode($result['data']['0']['parsed'] ?? '', true);
                        $itemName = $result['data']['0']['name'];

                        if ($jsonData == null) {
                            $issues['noContentErrorFlag'] = true;
                            $typer = 'noContentError';
                            $issues[$typer][$structureItem->hiddenID]['hiddenID'] = $structureItem->hiddenID;
                            $issues[$typer][$structureItem->hiddenID]['itemName'] = $itemName;
                        } else {
                            $i = 0;
                            $typer = 'langError';
                            foreach ($activeLanguages as $k) {
                                if (!array_key_exists($k['code'], $jsonData)) {
                                    $issues['langErrorFlag'] = true;
                                    $issues[$typer][$structureItem->hiddenID]['languages'][$i] = $k['code'];
                                    $issues[$typer][$structureItem->hiddenID]['hiddenID'] = $structureItem->hiddenID;
                                    $issues[$typer][$structureItem->hiddenID]['itemName'] = $itemName;
                                }
                                $i++;
                            }
                        }
                    } else {
                        $errordata['hiddenID'] = $structureItem->hiddenID;
                        $issues['missingItemsFlag'] = true;
                        $issues['missingItems'][$key] = $errordata;
                    }
                }
            } else {
                $issues['noItems'] = true;
            }

            break;
		case '"fluid"':
            if (count($structure) > 0) {
                $seenHiddenIDs = [];
                foreach ($structure as $key => $structureItem) {
                    $query = 'SELECT * FROM testFluidStructure WHERE id=?';
                    $parameters = array($structureItem->hiddenID);
                    $result = $db->fetchRow($query, $parameters);

                    $query = 'SELECT * FROM testPools WHERE id=?';
                    $parameters = array($result['data']['poolID']);
                    $queryResult = $db->fetchRow($query, $parameters);

                    if ($queryResult['rows'] > 0) {
                        $jsonValue = json_decode($queryResult['data']['structure'] ?? '', true);
                        $itemCount = count($jsonValue['items']);
                        $itemsUsed = (int)$result['data']['numberOfItems'];

                        if ($itemsUsed > $itemCount) {
                            $issues['itemsAmountErrorFlag'] = true;
                            $issues['itemsAmountError'][$structureItem->hiddenID]['hiddenID'] = $structureItem->hiddenID;
                            $issues['itemsAmountError'][$structureItem->hiddenID]['itemsUsed'] = $itemsUsed;
                            $issues['itemsAmountError'][$structureItem->hiddenID]['itemsTotal'] = $itemCount;
                        }

                        foreach ($jsonValue['items'] as $key2 => $poolStructureItem) {
                            // ** Check for duplicates **
                            if (in_array($poolStructureItem['hiddenID'], $seenHiddenIDs)) {
                                $issues['duplicates'] = true;
                            } else {
                                $seenHiddenIDs[] = $poolStructureItem['hiddenID'];
                            }

                            // Reading item data from db
                            $query = 'SELECT * FROM items WHERE id=?';
                            $parameters = array($poolStructureItem['hiddenID']);
                            $itemResult = $db->fetchRow($query, $parameters);

                            if (count($itemResult['data']) > 0) {
                                $jsonData = json_decode($itemResult['data']['parsed'] ?? '', true);
                                if ($jsonData == null) {
                                    $issues['noContentErrorFlag'] = true;
                                    $issues['noContentError'][$structureItem->hiddenID]['hiddenID'] = $structureItem->hiddenID;
                                    $issues['noContentError'][$structureItem->hiddenID]['itemName'] = $queryResult['data']['name'];
                                } else {
                                    foreach ($activeLanguages as $k) {
                                        if (!array_key_exists($k['code'], $jsonData)) {
                                            $issues['langErrorFlag'] = true;
                                            $issues['langError'][$structureItem->hiddenID]['hiddenID'] = $structureItem->hiddenID;
                                        }
                                    }
                                }
                            } else {
                                $issues['missingItemsFlag'] = true;
                                $errordata['hiddenID'] = $structureItem->hiddenID;
                                $issues['missingItems'][$key] = $errordata;
                            }
                        }
                    } else {
                        $issues['deletedPoolFlag'] = true;
                        $errordata['hiddenID'] = $structureItem->hiddenID;
                        $issues['deletedPool'][$key] = $errordata;
                    }
                }
            } else {
                $issues['noItems'] = true;
            }

            break;
	}
	// count errors
	$trueErrors = array_filter($issues, function ($value) {
		return $value === true;
	});
	$issues['issueCount'] = count($trueErrors);
	if ($issues['issueCount'] > 0) $issues['issuesFound'] = true;

	return $issues;
}

function outputJSON()
{
	global $returnData, $action, $myAuth;

	$returnData['loggedInName'] = $myAuth->username;

	if (!isset($returnData['action'])) {
		$returnData['action'] = $action;
	}

	$error = error_get_last();
	if (!empty($error)) {
		$documentRoot = filter_input(INPUT_SERVER, "DOCUMENT_ROOT");
		$file = str_replace($documentRoot, '', $error['file']);
		$returnData['fatalError'] = "<p>Fatal error [type {$error['type']}] on line {$error['line']} of<br><code class='tinyCode'>$file</code></p><p>{$error['message']}</p>";
	}
	header('Cache-Control: no-cache, must-revalidate');
	header('Content-type: application/json; charset=UTF-8');
	echo json_encode($returnData);
}
