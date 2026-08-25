<?php

	class OasysActivity
	{

		private rixPDO $db;

		function __construct()
		{
			global $app;
			$this->db = $app->getDatabaseInstance();
		}

		/* return list of activity table entries, optionally limited to a startdate and/or an enddate, respectively only
		   by offset and count.
		   This data is useful for iterating over all activity entries in a controlled way and get the more detailed data
		   for each entry with the other methods in this class.
		*/

		public function getActivityList($startDate = null, $endDate = null, $limitOffset = null, $limitCount = null): array
		{
			$startDate = $startDate ?? '1970-01-01';
			$endDate = $endDate ?? date('Y-m-d');
			$limit = '';
			if ($limitOffset !== null && $limitCount !== null) {
				$limit = " LIMIT $limitOffset, $limitCount";
			} elseif ($limitCount !== null) {
				$limit = " LIMIT $limitCount";
			}
			$res = $this->db->fetchTable("SELECT loginId, passwordId, testId, timeLimit, tsFirstLoginServer, tsLoginServer, tsActiveServer, timeLeftAtLogin, timeLeft, lastPayloadId, lastEventId, progress, currentItem, `language`, clientOpen FROM activity WHERE DATE(tsFirstLoginServer) >= ? AND DATE(tsFirstLoginServer) <= ?" . $limit, [$startDate, $endDate]);
			if ($res['rows'] === 0) {
				return [];
			} else {
				return $res['data'];
			}
		}

		/* Return a batch summary of all credentials linked to a test.
		   Supported filters:
		   - tags: list of password tags to include
		   - cutoffDate: include only activity whose last server contact is on or after YYYY-MM-DD
		   Credentials without activity are included when no cutoff date is supplied.
		*/
		public function getTestProgressSummary(int $testId, array $filters = []): array
		{
			$tagCondition = '';
			$dateCondition = '';
			$queryParameters = [$testId, $testId];

			if (isset($filters['tags'])) {
				$tags = $filters['tags'];
				if (!is_array($tags) || !array_is_list($tags)) {
					throw new InvalidArgumentException('The tags filter must be a JSON array.');
				}
				foreach ($tags as $tag) {
					if (!is_string($tag)) {
						throw new InvalidArgumentException('Every value in the tags filter must be a string.');
					}
				}
				if ($tags !== []) {
					$tagPlaceholders = implode(', ', array_fill(0, count($tags), '?'));
					$tagCondition = "AND passwords.tag IN ($tagPlaceholders)";
					array_push($queryParameters, ...$tags);
				}
			}

			if (isset($filters['cutoffDate'])) {
				$cutoffDateFilter = $filters['cutoffDate'];
				if (!is_string($cutoffDateFilter) || !preg_match('/\A\d{4}-\d{2}-\d{2}\z/', $cutoffDateFilter)) {
					throw new InvalidArgumentException('The cutoffDate filter needs to be given in the form of YYYY-MM-DD.');
				}
				$cutoffDate = DateTimeImmutable::createFromFormat('!Y-m-d', $cutoffDateFilter);
				if ($cutoffDate === false || $cutoffDate->format('Y-m-d') !== $cutoffDateFilter) {
					throw new InvalidArgumentException('The cutoffDate filter is not a valid calendar date.');
				}
				$dateCondition = 'AND activity.tsActiveServer >= ?';
				$queryParameters[] = $cutoffDateFilter;
			}

			$query = <<<SQL
				SELECT
					logins.`name` AS login,
					passwords.tag,
					IF(activity.progress IS NULL, 0, 1) AS started,
					IF(activity.timeLeft = 0, 1, 0) AS finished,
					COUNT(answers.`value`) AS answers,
					MAX(answers.tsClient) AS lastAnswer
				FROM passwords
				INNER JOIN logins ON passwords.loginID = logins.id
				LEFT JOIN activity ON passwords.id = activity.passwordId
					AND activity.testId = ?
				LEFT JOIN answers ON activity.loginId = answers.loginId
					AND activity.passwordId = answers.passwordId
					AND activity.testId = answers.testId
				WHERE JSON_SEARCH(passwords.structure, 'one', ?, NULL, '$[*].hiddenID') IS NOT NULL
					AND logins.template IN ('testee', 'cloned')
					$tagCondition
					$dateCondition
				GROUP BY passwords.loginId, passwords.id
				ORDER BY login, lastAnswer
			SQL;

			$res = $this->db->fetchTable($query, $queryParameters, 'login');
			return $res['data'] ?? [];
		}

		/* return complete set of activity data for a given passwordId and a single testId
		   returns an array with the following keys:
		    - status with 2 subkeys:
                - started: true if the test has been started
                - finished: true if the test has been finished
            - progress with 3 subkeys:
                - required with 3 subkeys:
                    - total: total number of required fields in the test
                    - filled: number of required fields filled in the test
                    - percentage: percentage of required fields filled in the test
                - optional with 3 subkeys:
                    - total: total number of optional fields in the test
                    - filled: number of optional fields filled in the test
                    - percentage: percentage of optional fields filled in the test
                - all with 3 subkeys:
                    - total: total number of fields in the test
                    - filled: number of fields filled in the test
                    - percentage: percentage of fields filled in the test
		*/
		public function getActivity(int $passwordId, int $testId): array
		{
			$returnData = [
				'status' => $this->getStatus($passwordId, $testId),
				'progress' => $this->getProgress($passwordId, $testId)
			];
			return $returnData;
		}

		/* return complete set of activity data for a given passwordId and an array of testIds
		   returns an array with the following keys:
			- status with 2 subkeys:
				- started: true if 1 or more tests from this chain have been started
				- finished: true if all tests from this chain have been finished
			- progress with 3 subkeys:
				- total: total number of required fields in all tests from this chain
				- filled: number of required fields filled in all tests from this chain
					(N.B. closed tests are considered 100% filled, even if not all required fields were filled in)
				- percentage: percentage of required fields filled in all tests from this chain
		 */
		public function getActivityChain(int $passwordId, array $testIds): array
		{
			$returnData = [
				'progress' => ['required' => ['total' => 0, 'filled' => 0, 'percentage' => 0]], 'status' => ['started' => false, 'finished' => true]
			];

			foreach ($testIds as $testId) {
				$activity = $this->getActivity($passwordId, $testId);

				/* if any test from this chain has already started, the status started is set to true */
				if ($activity['status']['started']) {
					$returnData['status']['started'] = true;
				}

				/* if any test from this chain has not yet finished, the status finished is set to false */
				if ($activity['status']['finished']) {
					/* If a test has already been closed, we consider it 100% filled, even if the test taker did not
					   manage to fill all required fields before the time was up. This is necessary to show a realistic
					   progress bar indicating how much there is still to fill in potentially */
					$returnData['progress']['required']['filled'] += $activity['progress']['required']['total'];
				} else {
					$returnData['status']['finished'] = false;
					/* if a test is not closed yet, we show the actual progress of required fields */
					$returnData['progress']['required']['filled'] += $activity['progress']['required']['filled'];
				}
				$returnData['progress']['required']['total'] += $activity['progress']['required']['total'];
			}

			if ($returnData['progress']['required']['total'] > 0) {
				$returnData['progress']['required']['percentage'] = round($returnData['progress']['required']['filled'] / $returnData['progress']['required']['total'] * 100, 2);
			} else {
				$returnData['progress']['required']['percentage'] = 100;
			}

			return $returnData;
		}

		/* return activity of the next test in a chain or the complete chain if finished
		   returns an array with the following keys:
		    - nextTestId: the id of the next test in the chain
		    - status with 2 subkeys:
				- started: true if the test has been started
				- finished: true if the test has been finished
			- progress with 3 subkeys:
				- required with 3 subkeys:
					- total: total number of required fields in the test
					- filled: number of required fields filled in the test
					- percentage: percentage of required fields filled in the test
				- optional with 3 subkeys:
					- total: total number of optional fields in the test
					- filled: number of optional fields filled in the test
					- percentage: percentage of optional fields filled in the test
				- all with 3 subkeys:
					- total: total number of fields in the test
					- filled: number of fields filled in the test
					- percentage: percentage of fields filled in the test
		*/

		public function getActivityOfNextTestInChain(int $passwordId, array $testIds): array
		{
			$nextTestId = $this->getNextTestInChain($passwordId, $testIds);
			if ($nextTestId === null) {
				return $this->getActivityChain($passwordId, $testIds);
			}
			return $this->getActivity($passwordId, $nextTestId);
		}

		/* return the id of the next test in a chain
		   returns an integer or null if there is no next test
		*/

		public function getNextTestInChain($passwordId, $testIds): ?int
		{
			foreach ($testIds as $testId) {
				$activity = $this->getStatus($passwordId, $testId);
				if (!$activity['finished']) {
					return $testId;
				}
			}
			return null;
		}

		/* return status of a set of credentials and test id (test started and test finished)
		   returns an array with the following keys:
		    - started: true if the test has been started
		    - finished: true if the test has been finished
		*/
		public function getStatus(int $passwordId, int $testId): array
		{
			$res = $this->db->fetchValue("SELECT timeLeft FROM activity WHERE passwordId = ? AND testId = ?", [$passwordId, $testId]);
			$status = ['started' => false, 'finished' => false];
			if ($res['rows'] > 0) {
				$status['started'] = true;
				if ($res['data'] === 0) {
					$status['finished'] = true;
				}
			}
			return $status;
		}

		/* check if a specific passwordId can be used to log in at this moment; returns false if there is any reason why
		   the credentials cannot be used (e.g. test not active, credentials used already, …)
		*/

		public function passwordAvailableForLogin($passwordId): bool
		{
			$credentialsApi = new OasysCredentials();
			$testIds = $credentialsApi->getTestIdsFromPasswordId($passwordId);
			if ($testIds === false) {
				return false;
			}
			$nextTestId = $this->getNextTestInChain($passwordId, $testIds);
			if ($nextTestId === null) {
				// No next test in chain, so we cannot use the password
				return false;
			}
			$testApi = new OasysTest();
			if (!$testApi->isAvailable($nextTestId)) {
				return false;
			}
			return true;
		}

		/* return the number of answers given by a set of credentials for a given test
		   returns an integer
		*/
		public function getAnswerCount(int $passwordId, int $testId): int
		{
			$res = $this->db->fetchValue("SELECT COUNT(*) FROM answers WHERE passwordId = ? AND testId = ?", [$passwordId, $testId]);
			return $res['data'];
		}

		/* return the structure of a fluid or mutation test the way it was shown to a test taker
		   returns a JSON array with the item ids of the pages that were shown
		*/
		public function getCachedPages(int $passwordId, int $testId): array
		{
			$res = $this->db->fetchValue("SELECT JSON_EXTRACT(structure, '$[*].hiddenID') AS pageIds FROM testCache WHERE passwordId =? and testId = ?", [$passwordId, $testId]);
			if ($res['rows'] === 0) {
				return [];
			} else {
				return json_decode($res['data'], true);
			}
		}

		/* gets full list of answers
		   returns an array of rows, each one with the following keys:
		    - itemId: the id of the item
		    - fieldId: the id of the field
		    - fieldType: the type of the field
		    - value: the value of the field
		*/
		public function getAnswers(int $passwordId, int $testId): array
		{
			$res = $this->db->fetchTable("SELECT itemId, fieldId, fieldType, `value` FROM answers WHERE passwordId = ? AND testId = ?", [$passwordId, $testId], 'itemId', 'fieldId');
			if ($res['rows'] === 0) {
				return [];
			} else {
				return $res['data'];
			}
		}

		/* return the time left for a given test (in seconds)
		   returns an integer; -1 stands for no time limit
		   returns null if there is no activity on this test yet
		*/

		public function getTimeLeft(int $passwordId, int $testId): ?int
		{
			$res = $this->db->fetchValue("SELECT timeLeft FROM activity WHERE passwordId = ? AND testId = ?", [$passwordId, $testId]);
			if ($res['rows'] === 0) {
				return null;
			}
			return $res['data'];
		}

		/* return the progress of a set of credentials for a given test
		   returns an array with the following keys:
		    - required with 3 subkeys:
				- total: total number of required fields in the test
				- filled: number of required fields filled in the test
				- percentage: percentage of required fields filled in the test
			- optional with 3 subkeys:
				- total: total number of optional fields in the test
				- filled: number of optional fields filled in the test
				- percentage: percentage of optional fields filled in the test
			- all with 3 subkeys:
				- total: total number of fields in the test
				- filled: number of fields filled in the test
				- percentage: percentage of fields filled in the test
		*/
		public function getProgress(int $passwordId, int $testId): array
		{
			$testApi = new OasysTest();
			$testType = $testApi->getTestType($testId);
			if ($testType !== 'linear') {
				$pageCache = $this->getCachedPages($passwordId, $testId);
				$fields = $testApi->getFieldsForArrayOfFields($pageCache);
			} else {
				$fields = $testApi->getTestFields($testId);
			}
			if (!$fields) {
				// No fields found, return empty progress
				return [
					'required' => ['total' => 0, 'filled' => 0, 'percentage' => 100],
					'optional' => ['total' => 0, 'filled' => 0, 'percentage' => 100],
					'all' => ['total' => 0, 'filled' => 0, 'percentage' => 100]
				];
			}
			$answers = $this->getAnswers($passwordId, $testId);
			$requiredFields = 0;
			$requiredFieldsFilled = 0;
			$optionalFields = 0;
			$optionalFieldsFilled = 0;
			foreach ($fields as $pageId => $page) {
				foreach ($page as $fieldId => $field) {
					if ($field['category'] !== 'fields') {
						continue;
					}
					if ($field['required']) {
						$requiredFields++;
					} else {
						$optionalFields++;
					}
					if (isset($answers[$pageId][$fieldId])) {
						$value = $answers[$pageId][$fieldId]['value'];
						if ($value !== '') {
							if ($field['required']) {
								$requiredFieldsFilled++;
							} else {
								$optionalFieldsFilled++;
							}
						}
					}
				}
			}
			$totalFields = $requiredFields + $optionalFields;
			$totalFieldsFilled = $requiredFieldsFilled + $optionalFieldsFilled;
			if ($optionalFields > 0) {
				$optionalPercentage = round($optionalFieldsFilled / $optionalFields * 100, 2);
			} else {
				$optionalPercentage = 100;
			}
			if ($requiredFields > 0) {
				$requiredPercentage = round($requiredFieldsFilled / $requiredFields * 100, 2);
			} else {
				$requiredPercentage = 100;
			}
			if ($totalFields > 0) {
				$totalPercentage = round($totalFieldsFilled / $totalFields * 100, 2);
			} else {
				$totalPercentage = 100;
			}
			$returnData = [
				'required' => ['total' => $requiredFields, 'filled' => $requiredFieldsFilled, 'percentage' => $requiredPercentage],
				'optional' => ['total' => $optionalFields, 'filled' => $optionalFieldsFilled, 'percentage' => $optionalPercentage],
				'all' => ['total' => $totalFields, 'filled' => $totalFieldsFilled, 'percentage' => $totalPercentage]
			];
			return $returnData;
		}

		/* return all answers for a specific passwordId and testId
		   returns an array with every row being an array of the following:
		    - itemId: the id of the item
		    - fieldId: the id of the field
		    - fieldType: the type of the field
		    - value: the value of the field
			- tsServer: the timestamp of the server when the answer was saved
			- tsClient: the timestamp of the client when the answer was given
		*/

		public function getAnswersWithTimestamps(int $passwordId, int $testId): array
		{
			$res = $this->db->fetchTable("SELECT itemId, fieldId, fieldType, `value`, tsServer, tsClient FROM answers WHERE passwordId = ? AND testId = ?", [$passwordId, $testId], 'itemId', 'fieldId');
			if ($res['rows'] === 0) {
				return [];
			} else {
				return $res['data'];
			}
		}

		/* return complete behaviour data for a given passwordId and testId
		   returns an array with every row being an array of the following:
			- tsServer: the timestamp of the server when the behaviour was saved
			- tsClient: the timestamp of the client when the behaviour was recorded
			- timeLeft: the time left for the test when the behaviour was sent
			- eventId: the id of the event (ids may be missing, as data is being pruned before being sent to the server)
			- itemId: the id of the active item
			- language: the active language
			- eventType: the type of the event
			- subType: the subtype of the event
			- data: the data of the event (format depends on type and subtype)
		*/

		public function getBehaviour(int $passwordId, int $testId): array
		{
			$res = $this->db->fetchTable("SELECT tsServer, tsClient, timeLeft, eventId, itemId, `language`, eventType, subType, `data` FROM behaviour WHERE passwordId = ? AND testId = ?", [$passwordId, $testId]);
			if ($res['rows'] === 0) {
				return [];
			} else {
				return $res['data'];
			}
		}

		/* This method is used to terminate the activity for a given passwordId and testId
		   It sets the timeLeft to 0, which indicates that the test has been finished
		   Returns an array with the result of the database operation
		*/
		public function terminateActivity(int $passwordId, int $testId): array
		{
			return $this->db->execute("UPDATE activity SET timeLeft = 0, clientOpen=0, tsActiveServer=tsActiveServer WHERE passwordId = ? AND testId = ?", [$passwordId, $testId]);
		}

		/* This method is used to add time to the activity for a given passwordId and testId
		   It adds the additionalTime to the current timeLeft and timeLeftAtLogin.
		   Negative additionalTime values are used to decrease the time
		   Returns an array with the result of the database operation

		   Technote: timeLeft is necessary to change the remaining time if the test taker is NOT logged in, while
		   timeLeftAtLogin is necessary to change the remaining time if the test taker IS logged in.
		   If the test taker is logged in, the change will be visible after the next connection with the server, so
		   usually less than 15 seconds later. If the test taker is NOT logged in, the change will be visible after
		   the next login.
		*/
		public function addTime(int $passwordId, int $testId, int $additionalTime, string $source): ?array
		{
			global $backendState;
			/* Check if the test has already been finished, in which case we log a behaviour event that indicates that the
			 test was reopened and adding the detail of the added time.
			 If the test was not finished yet we log a behaviour event that indicates that the time was added. */
			$query = "SELECT timeLeft FROM activity WHERE passwordId = ? AND testId = ?";
			$res = $this->db->fetchValue($query, [$passwordId, $testId]);
			if ($res['rows'] === 0) {
				return null;
			}
			if ($res['data'] === 0) {
				OasysBehaviour::write($passwordId, $testId, [
					'eventType' => 'behaviour',
					'subType' => 'reopenTest',
					'data' => [
						'actorUserId' => $backendState->userid,
						'source' => $source,
						'timeLimitMode' => 'limited',
						'additionalSeconds' => $additionalTime
					]
				]);
			} else {
				OasysBehaviour::write($passwordId, $testId, [
					'eventType' => 'behaviour',
					'subType' => 'addTime',
					'data' => [
						'actorUserId' => $backendState->userid,
						'source' => $source,
						'timeLimitMode' => 'limited',
						'additionalSeconds' => $additionalTime
					]
				]);
			}
			$query = <<<SQL
				UPDATE activity
				SET timeLeft = timeLeft + ?,
				    timeLeftAtLogin = timeLeftAtLogin + ?,
				    tsActiveServer=tsActiveServer
				WHERE passwordId = ? AND testId = ?
			SQL;
			return $this->db->execute($query, [$additionalTime, $additionalTime, $passwordId, $testId]);
		}

		/* This method is used to reopen a test that has no time limit
		   It sets the timeLeft and timeLeftAtLogin to -1, which indicates that the test has no time limit and is still
		   accessible
		   Returns an array with the result of the database operation
		*/
		public function reopenTestWithoutTimeLimit(int $passwordId, int $testId, string $source): array
		{
			global $backendState;
			OasysBehaviour::write($passwordId, $testId, [
				'eventType' => 'behaviour',
				'subType' => 'reopenTest',
				'data' => [
					'actorUserId' => $backendState->userid,
					'source' => $source,
					'timeLimitMode' => 'unlimited',
					'additionalSeconds' => 0
				]
			]);
			$query = <<<SQL
				UPDATE activity
				SET timeLeft = -1,
				    timeLeftAtLogin = -1,
				    timeLimit = 0,
				    tsActiveServer=tsActiveServer
				WHERE passwordId = ? AND testId = ?
			SQL;
			return $this->db->execute($query, [$passwordId, $testId]);
		}

		/* This method is used to reset the activity for a given passwordId and testId
		   It deletes the activity entry from the database table entirely, so the test can be started again
		   All linked data, like answers and behaviour, will be deleted as well due to the foreign key constraints
		   Returns an array with the result of the database operation
		*/

		public function resetActivity(int $passwordId, int $testId): array
		{
			$query = "DELETE FROM activity WHERE passwordId = ? AND testId = ?";
			return $this->db->execute($query, [$passwordId, $testId]);
		}

	}
