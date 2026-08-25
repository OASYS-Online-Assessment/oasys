<?php

	require_once __DIR__ . "/rixPDO.php";
	require_once __DIR__ . "/database.php";
	require_once __DIR__ . "/../../editor/inc/php/testsCommonFunctions.php";

	class OasysBehaviour
	{

		private rixPDO $db;
		private string $dbName;
		private string $user;
		private string $password;
		private string $host;
		private string $logFile;
		private ?string $startDate;
		private ?string $endDate;
		private int $testId;
		private array $testData;
		private string $testType;
		private array $structure;

		function __construct(int $testId, ?string $startDate, ?string $endDate)
		{
			global $sql_db, $sql_user, $sql_password, $sql_host;
			$this->dbName = $sql_db;
			$this->user = $sql_user;
			$this->password = $sql_password;
			$this->host = $sql_host;
			$this->logFile = __DIR__ . "/../../logs/OasysBehaviour.txt";
			$this->db = new rixPDO($this->dbName, $this->user, $this->password, $this->host, $this->logFile);
			$this->testId = $testId;

			//convert startDate and endDate to YYYY-MM-DD format if they are provided
			if ($startDate) {
				$startDate = date('Y-m-d', strtotime($startDate));
			} else {
				$startDate = '1970-01-01'; // default to the earliest date if no start date is provided
			}
			if ($endDate) {
				$endDate = date('Y-m-d', strtotime($endDate));
			} else {
				$endDate = date('Y-m-d'); // default to today if no end date is provided
			}
			$this->startDate = $startDate;
			$this->endDate = $endDate;
			$this->testData = [];
			$this->testType = '';
			$this->structure = [];
			buildTestData($testId, $this->db, $this->testData, $this->testType, $this->structure);
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

		public function getBehaviour(int $passwordId): array
		{
			$query = <<<SQL
				SELECT tsServer, tsClient, timeLeft, eventId, itemId, `language`, eventType, subType, `data`
				FROM behaviour
				WHERE passwordId = ?
					AND testId = ?
					AND tsClient >= ?
					AND tsClient <= ?
			SQL;

			$res = $this->db->fetchTable("", [$passwordId, $this->testId, $this->startDate, $this->endDate]);
			if ($res['rows'] === 0) {
				return [];
			} else {
				return $res['data'];
			}
		}

		/* return time spent on the different items in a test for a given testId within a given time period */
		public function getTimeSpentOnItems(): array
		{
			$query = <<<SQL
				SELECT passwordId, eventId, logins.name, passwords.tag, itemId, tsClient, subType
				FROM behaviour
				INNER JOIN logins ON logins.id=behaviour.loginId
				INNER JOIN passwords ON passwords.id=behaviour.passwordId
				WHERE eventType = 'behaviour'
					AND testId = ?
					AND DATE(tsClient) >= ?
					AND DATE(tsClient) <= ?
				ORDER BY passwordId, eventId
			SQL;

			$res = $this->db->fetchTable($query, [$this->testId, $this->startDate, $this->endDate], 'name', 'passwordId', true);
			if ($res['rows'] === 0) {
				return [];
			}

			$rawData = $res['data'];
			$output = [];

			foreach ($rawData as $name => $nameData) {
				foreach ($nameData as $passwordId => $passwordData) {
					$row = [];
					/* populate row with keys from headerRow1 and 0 as value */
					foreach ($this->structure as $key) {
						$row[$key] = 0;
					}
					$timePerItem = [];
					$row['legend'] = '';
					$row['login'] = $name;
					$row['tag'] = $passwordData[0]['tag'];
					$lastEventType = '';
					$lastItemId = '';
					$lastTsClient = '';
					foreach ($passwordData as $event) {
						if ($event['subType'] === 'login' || $lastEventType === 'closeWindow' || $lastEventType === 'endTest') {
							/*  if this is a login, or if login is missing for whatever reason and previous event was
								ending the test, we reinitialize the 3 $lastXXX variables  */
							$lastEventType = '';
							$lastItemId = '';
							$lastTsClient = '';
						} else {
							if ($lastItemId !== '' && $lastTsClient !== '') {
								// Convert string timestamps to milliseconds before calculating the difference
								$currentTsMillis = dateString2Milliseconds($event['tsClient']);
								$lastTsMillis = dateString2Milliseconds($lastTsClient);
								$timeSpent = ($currentTsMillis - $lastTsMillis) / 1000;

								if (isset($timePerItem[$lastItemId])) {
									$timePerItem[$lastItemId] += $timeSpent;
								} else {
									$timePerItem[$lastItemId] = $timeSpent;
								}
							}
						}
						$lastEventType = $event['subType'];
						$lastItemId = $event['itemId'];
						$lastTsClient = $event['tsClient'];
					}
					foreach ($timePerItem as $itemId => $timeSpent) {
						$row[$itemId] = $timeSpent;
					}
					$output[] = $row;
				}
			}

			return $output;
 	}

 	/**
 	 * Get the test data
 	 */
 	public function getTestData(): array
 	{
 		return $this->testData;
 	}

 	/**
 	 * Get the test type
 	 */
 	public function getTestType(): string
 	{
 		return $this->testType;
 	}

 	/**
 	 * Get the structure
 	 */
 	public function getStructure(): array
 	{
 		return $this->structure;
 	}
 }
