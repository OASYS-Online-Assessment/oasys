<?php

	require_once __DIR__ . "/rixPDO.php";
	require_once __DIR__ . "/database.php";

	class OasysTest
	{

		private rixPDO $db;
		private string $dbName;
		private string $user;
		private string $password;
		private string $host;
		private string $logFile;

		function __construct()
		{
			global $sql_db, $sql_user, $sql_password, $sql_host;
			$this->dbName = $sql_db;
			$this->user = $sql_user;
			$this->password = $sql_password;
			$this->host = $sql_host;
			$this->logFile = __DIR__ . "/../../logs/OasysTest.txt";
			$this->db = new rixPDO($this->dbName, $this->user, $this->password, $this->host, $this->logFile);
		}

		/* return the type of a test
		   returns string (or null if the test does not exist)
		   possible types are: linear, fluid, mutation
		*/
		public function getTestType(int $testId): ?string
		{
			$res = $this->db->fetchValue("SELECT JSON_VALUE(tests.structure, '$.type') FROM tests WHERE id = ?", [$testId]);
			if ($res['rows'] === 0) {
				return null;
			}
			return $res['data'];
		}

		/* return the structure of a test as an array
		   returns null if the test does not exist
		   beware that the structure of different types of tests are to be interpreted differently
		*/
		public function getTestStructure(int $testId): ?array
		{
			$res = $this->db->fetchValue("SELECT structure FROM tests WHERE id = ?", [$testId]);
			if ($res['rows'] === 0) {
				return null;
			}
			return json_decode($res['data'], true);
		}

		/* return an array of all ids of pages in a linear test
		   however conditional branching cannot be taken into account here
		   sends back null if test is not of linear type */
		public function getTestPageIds(int $testId): ?array
		{
			$type = $this->getTestType($testId);
			if ($type !== 'linear') {
				/* items from a fluid or mutation test cannot be read directly from the `tests` table as there is a certain randomness involved */
				return null;
			}
			$res = $this->db->fetchValue("SELECT JSON_EXTRACT(structure, '$.items[*].hiddenID') FROM tests WHERE id = ?", [$testId]);
			if ($res['rows'] === 0) {
				return null;
			}
			return json_decode($res['data'] ?? '[]', true);
		}

		/* return the fields of a page
		   returns null if the page does not exist
		   the fields are returned as an array of arrays, properties change depending on type of field
		*/
		public function getFieldsForSinglePage(int $pageId): ?array
		{
			$res = $this->db->fetchValue("SELECT fields FROM items WHERE id = ?", [$pageId]);
			if ($res['rows'] === 0) {
				return null;
			}
			return json_decode($res['data'], true);
		}

		/* return all the fields from all the pages of a test */
		public function getTestFields(int $testId): ?array
		{
			$pageIds = $this->getTestPageIds($testId);
			if ($pageIds === null) {
				return null;
			}

			return $this->getFieldsForArrayOfFields($pageIds);
		}

		/* return all the fields from a set of pages */
		public function getFieldsForArrayOfFields(array $pageIds): ?array
		{
			$allFields = [];

			foreach ($pageIds as $pageId) {
				$fields = $this->getFieldsForSinglePage($pageId);
				if ($fields === null) {
					continue;
				}
				$allFields[$pageId] = $fields;
			}

			return $allFields;
		}

		/* get options of test, including time limit and schedule */
		public function getOptions(int $testId): ?array
		{
			$res = $this->db->fetchValue("SELECT options FROM tests WHERE id = ?", [$testId]);
			if ($res['rows'] === 0) {
				return null;
			}
			return json_decode($res['data'], true);
		}

		/* check if a test is currently available, so active and allowed by schedule */
		public function isAvailable(int $testId): bool
		{
			return ($this->isActive($testId) && $this->checkSchedule($testId));
		}

		/* check if test is active */
		public function isActive(int $testId): bool
		{
			$res = $this->db->fetchValue("SELECT active FROM tests WHERE id = ?", [$testId]);
			if ($res['rows'] === 0) {
				return false;
			}
			return $res['data'] === 1;
		}

		/* check if test schedule allows login at the current time */
		public function checkSchedule($testId): bool
		{
			$options = $this->getOptions($testId);
			$restrictions = $options['restrictions'];
			$loginAllowed = true;

			//check date range
			if ($restrictions['dateRange'] !== false) {
				if ($restrictions['dateRange']['start'] !== false) {
					$start = strtotime($restrictions['dateRange']['start']);
					if ($start > time()) {
						$loginAllowed = false;
					}
				}
				if ($restrictions['dateRange']['end'] !== false) {
					$end = strtotime($restrictions['dateRange']['end']);
					if ($end < time()) {
						$loginAllowed = false;
					}
				}
			}

			//check time range
			$currentTime = (new DateTime())->setTimestamp(time());
			if ($restrictions['timeRestriction'] !== false) {
				if ($restrictions['timeRestriction']['start'] !== false) {
					$start = DateTime::createFromFormat('H:i', $restrictions['timeRestriction']['start']);
					if ($start > $currentTime) {
						$loginAllowed = false;
					}
				}
				if ($restrictions['timeRestriction']['end'] !== false) {
					$end = DateTime::createFromFormat('H:i', $restrictions['timeRestriction']['end']);
					if ($end < $currentTime) {
						$loginAllowed = false;
					}
				}
			}

			//check weekday
			$currentDay = date('w', time()) - 1;
			if ($restrictions['testDays'] !== false) {
				if (!preg_match("/$currentDay/", $restrictions['testDays']['days'])) {
					$loginAllowed = false;
				}
			}

			return $loginAllowed;
		}

	}