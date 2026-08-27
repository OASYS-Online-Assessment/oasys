<?php

	require_once __DIR__ . "/OasysActivity.php";
	require_once __DIR__ . "/OasysTest.php";
	require_once __DIR__ . "/Crypt.php";

	class OasysCredentials {

		private rixPDO $db;

		function __construct()
		{
			global $db;
			$this->db = $db;
		}

		/* return the password id of a given login id and test id
		   if a tag is given, the password id of the newest password with that tag will be returned */
		public function getPasswordId(int $loginId, int $testId, ?string $tag)
		{
			if ($tag !== null) {
				$res = $this->db->fetchValue("SELECT MAX(id) FROM passwords WHERE loginId = ? AND tag = ? AND JSON_CONTAINS(JSON_EXTRACT(structure, '$[*].hiddenID'), ?)", [$loginId, $tag, $testId]);
			} else {
				$res = $this->db->fetchValue("SELECT MAX(id) FROM passwords WHERE loginId = ? AND JSON_CONTAINS(JSON_EXTRACT(structure, '$[*].hiddenID'), ?)", [$loginId, $testId]);
			}
			if ($res['rows'] === 0) {
				return false;
			}
			return $res['data'];
		}

		/* return the login id of a given login name */
		function getLoginId(string $login)
		{
			$res = $this->db->fetchValue("SELECT id FROM logins WHERE name = ?", [$login]);
			if ($res['rows'] === 0) {
				return false;
			}
			return $res['data'];
		}

		/* return the login id that belongs to a given password id */
		function getLoginIdFromPasswordId(int $passwordId)
		{
			$res = $this->db->fetchValue("SELECT loginId FROM passwords WHERE id = ?", [$passwordId]);
			if ($res['rows'] === 0) {
				return false;
			}
			return $res['data'];
		}

		/* return the login name that belongs to a given login id */
		function getLoginNameFromLoginId(int $loginId)
		{
			$res = $this->db->fetchValue("SELECT name FROM logins WHERE id = ?", [$loginId]);
			if ($res['rows'] === 0) {
				return false;
			}
			return $res['data'];
		}

		/* return password tag of a given password id */
		function getPasswordTagFromPasswordId(int $passwordId)
		{
			$res = $this->db->fetchValue("SELECT tag FROM passwords WHERE id = ?", [$passwordId]);
			if ($res['rows'] === 0) {
				return false;
			}
			return $res['data'];
		}

		/* return test ids linked to a given password id */
		function getTestIdsFromPasswordId(int $passwordId)
		{
			$res = $this->db->fetchRow("SELECT id, tag, JSON_EXTRACT(structure, '$[*].hiddenID') as testIds FROM passwords WHERE id = ?", [$passwordId]);
			if ($res['rows'] === 0) {
				return false;
			}
			//this returns an array of test ids encoded as a json string
			$res['data']['testIds'] = json_decode($res['data']['testIds']);
			return $res['data'];
		}

		/* return all passwords linked to a given login id */
		function getPasswordsFromLoginId(int $loginId)
		{
			$res = $this->db->fetchTable("SELECT id, tag, JSON_EXTRACT(structure, '$[*].hiddenID') as testIds FROM passwords WHERE loginId = ?", [$loginId]);
			if ($res['rows'] === 0) {
				return false;
			}
			foreach ($res['data'] as $key => $value) {
				$res['data'][$key]['testIds'] = json_decode($value['testIds']);
			}
			return $res['data'];
		}

		/* filter passwordIds by wether they contain a given testId */
		function filterPasswordsByTestId(array $passwordIds, int $testId): array
		{
			$filteredPasswords = [];
			//select passwords in which structure the path '$[*].hiddenID' contains the testId
			$query = "SELECT id, tag, CONCAT('[', ?, ']') as testIds FROM passwords WHERE id IN {$this->db->variableString(count($passwordIds))} AND JSON_CONTAINS(JSON_EXTRACT(structure, '$[*].hiddenID'), ?)";
			$params = array_merge([$testId], $passwordIds, [$testId]);
			$res = $this->db->fetchTable($query, $params);
			if ($res['rows'] === 0) {
				return [];
			}
			foreach ($res['data'] as $row) {
				$row['testId'] = json_decode($row['testIds'])[0];
				unset($row['testIds']);
				$filteredPasswords[] = $row;
			}
			return $filteredPasswords;
		}

		/* get all tests that are linked to a given student login id with activity */
		function getTestsForStudentLogin(int $loginId): array
		{
			//if the student login is successful, we will fetch all tests associated with this login
			$query = "SELECT id as passwordId, `name` as 'password', loginID, label, `options`, JSON_EXTRACT(structure, '$[*].hiddenID') as testIds FROM passwords WHERE loginID=?";
			$results = $this->db->fetchTable($query, [$loginId]);
			$passwords = $results['data'];
			$activityApi = new OasysActivity();
			$testApi = new OasysTest();
			$testData = [];
			if ($results['rows'] === 0) {
				//if there are no passwords associated with this login, we return an empty array
				return $testData;
			}
			foreach ($passwords as $k => $pw) {
				if (!isset($pw['testIds']) || $pw['testIds'] === null) {
					//this password has no tests associated with it, so we skip it
					continue;
				}
				$testIds = json_decode($pw['testIds'], true);
				$passwordId = $pw['passwordId'];
				unset($passwords[$k]['testIds']);
				unset($passwords[$k]['passwordId']);
				$passwords[$k]['password'] = Crypt::decryptString($passwords[$k]['password']);
				$passwords[$k]['options'] = json_decode($passwords[$k]['options'] ?? '{}', true);
				if (isset($passwords[$k]['options']['pwReq']) && $passwords[$k]['options']['pwReq'] === true) {
					//if the password is required, we will not send it to the frontend where it can be seen in the debugger
					unset($passwords[$k]['password']);
				}
				if (count($testIds) === 1) {
					$testId = $testIds[0];
				} elseif (count($testIds) > 1) {
					$testId = $activityApi->getNextTestInChain($pw['passwordId'], $testIds);
				} else {
					continue;
				}
				$currentTestData = $passwords[$k];
				if ($testId > -1) {
					//check if test exists
					$query = "SELECT COUNT(*) FROM tests WHERE id = ?";
					$params = [$testId];
					$res = $this->db->fetchValue($query, $params);
					if ($res['rows'] === 0 || $res['data'] === 0) {
						//test does not exist, skip this password
						continue;
					}
					$currentTestData['activity'] = $activityApi->getActivity($pw['passwordId'], $testId);
					$options = $testApi->getOptions($testId);
					$timeLeft = $activityApi->getTimeLeft($pw['passwordId'], $testId);
					if ($timeLeft === null) {
						if ($options['timeLimit'] > 0) {
							$timeLeft = $options['timeLimit'] * 60;
						} else {
							$timeLeft = -1;
						}
					}
					if ($timeLeft === -1) {
						$timeLeft = '♾️';
					}
					$currentTestData['uniqueId'] = sha1($passwordId . "_" . $testId);
					$currentTestData['timeLeft'] = $timeLeft;
					$currentTestData['active'] = $testApi->isActive($testId);
					$currentTestData['available'] = $testApi->isAvailable($testId) && $timeLeft !== 0;
					$currentTestData['restrictions'] = $options['restrictions'];
					$currentTestData['saveResults'] = (bool)($options['saveResults'] ?? false);
				} else {
					$currentTestData['activity'] = $activityApi->getActivityChain($pw['passwordId'], $testIds);
				}
				$testData[] = $currentTestData;
			}
			return $testData;
		}

	}
