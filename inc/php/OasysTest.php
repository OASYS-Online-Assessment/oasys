<?php

	require_once __DIR__ . "/rixPDO.php";
	require_once __DIR__ . "/database.php";

	class OasysTest
	{

		private rixPDO $db;

		function __construct()
		{
			global $app;
			$this->db = $app->getDatabaseInstance();
		}

		// Extract test data and build the complete page structure for all test types.
		public static function buildTestData(int $testId, rixPDO &$db, array &$testData, string &$testType, array &$structure): void
		{
			$query = "SELECT id,`name`,JSON_EXTRACT(structure,'$.type') AS type,JSON_EXTRACT(structure,'$.items[*].hiddenID') AS structure FROM tests WHERE id=?";
			$results = $db->fetchRow($query, [$testId]);

			$results['data']['structure'] = json_decode($results['data']['structure'] ?? '[]', true);
			$results['data']['type'] = json_decode($results['data']['type'] ?? 'null', true);
			$testData = $results['data'];
			$testType = $testData['type'];

			/* the $structure produced in the following code is simply an array of all ids used in the test */
			if ($testType === 'fluid') {
				//find all possible pages for a fluid test
				if (count($results['data']['structure']) === 0) {
					$testData['structure'] = [];
				} else {
					$query = <<<query
							SELECT DISTINCT
								f_pages.pageId
							FROM
								( SELECT f_structure.* FROM tests t1, JSON_TABLE ( t1.structure, '$.items[*]' COLUMNS ( f_structureId INT path '$.hiddenID' )) f_structure WHERE t1.id = ? ) t2
								INNER JOIN testFluidStructure tfs ON t2.f_structureId = tfs.id
								INNER JOIN testPools tp ON tfs.poolID = tp.id,
								JSON_TABLE (
									tp.structure,
									'$.items[*]' COLUMNS ( pageId INT path '$.hiddenID' )
								) f_pages
					query;
					$results = $db->fetchColumn($query, [$testId]);
					$testData['structure'] = $results['data'];
				}
			} elseif ($testType === 'mutation') {
				$query = <<<query
						SELECT DISTINCT
							m_pages.*
						FROM
							( SELECT m_struct.* FROM tests, JSON_TABLE ( tests.structure, '$.items[*]' COLUMNS ( testId INT path '$.hiddenID' )) AS m_struct WHERE tests.id = ? ) t1
							INNER JOIN tests t2 ON t1.testId = t2.id,
							JSON_TABLE (
								t2.structure,
								'$.items[*]' COLUMNS ( pageId INT path '$.hiddenID' )
							) AS m_pages
						UNION
						SELECT
							DISTINCT cached_pages.*
						FROM
							testCache,
							JSON_TABLE (
								structure,
							'$[*]' COLUMNS ( pageId INT PATH '$.hiddenID' )) AS cached_pages
						WHERE
							testId = ?
				query;
				$results = $db->fetchColumn($query, [$testId, $testId]);
				$testData['structure'] = $results['data'];
			}

			//get names and codes for all pages in test
			if (count($testData['structure']) > 0) {
				$structureIds = array_values($testData['structure']);
				$variableString = $db->variableString(count($structureIds));
				$query = "SELECT id,`name`,`itemCode` as code FROM items WHERE id IN " . $variableString;
				$results = $db->fetchTable($query, $structureIds, 'id');
				$testData['pages'] = $results['data'];
			} else {
				$testData['pages'] = [];
			}

			//this applies to all types of tests
			$structure = $testData['structure'];
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
