<?php
/*
		 * OasysScoring class v2.2
		 *
		 * Dependencies:
		 * 		helperRoutines.php (decodeData function)
		 * 		rixPDO.php (instance of rixPDO expected as parameter)
		 * 		parser.php
		 * 		OasysParserPlugin.php
		 * 		OasysParserPreProcessor.php
		 * 		*.php in plugins folder
		 * 		rixTools.php (for debugging only)
		 *
		 * default scoring models:
		 * 		TrueFalse		1 mark for a totally correct answer (a correct set of checkboxes with no wrongs or missing ones)
		 * 						0 marks for anything else
		 */

require_once __DIR__ . "/parser.php";
require_once __DIR__ . "/helperRoutines.php";
require_once __DIR__ . "/OasysTest.php";
require_once __DIR__ . "/../../editor/inc/php/testsCommonFunctions.php";
require_once __DIR__ . "/../../editor/interactions/InteractionCompiler.php";

class OasysScoring
{

	private string $delimiter;
	private string $fmt;
	private string $detail;
	private string $quotes;
	private array $activity;
	private rixPDO $db;
	private int $testId;
	private ?int $passwordId;
	private array|null $passwordIds;
	private array $testData = [];
	private string $testType = '';
	private array $structure = [];
	private array $headers;
	private int $headerColumnOffset = 7;
	private array $processing;
	private array $corrections;
	private array $scoringModel;
	private array $defaultModel = [
		'maximum' => 1,
		'initial' => 0,
		'correct' => 1,
		'wrong' => 0,
		'missing' => 0
	];
	private array $answers;
	private array $testCache; //list of pageIds of all the pages shown to user for fluid and mutation tests
	private array $testCacheHeaderIndex; //list of header indexes for each pageId in testCache
	private array $scoreDetails;
	private array $aggregatedScore;
	private array $scoreData;
	private array $scoreSummary;
	private array $maxPageScoreSummary;
	private bool $saveResults;
	private array $adhocAnswers;
	private array $adhocActivity;
	private bool $itemMissing = false;


	/* constructor */

	/**
	 * @param integer $testId
	 * @param rixPDO $db
	 * @param integer|null $passwordId
	 * @param stdClass|null $settings
	 * @throws Exception
	 */
	function __construct(int $testId, rixPDO &$db, ?int $passwordId = null, ?stdClass $settings = null)
	{
		if ($settings === null) {
			$settings = new stdClass();
		}
		$this->db = &$db;
		$this->testId = $testId;
		$this->passwordId = $passwordId;
		$this->passwordIds = $settings->passwordIds ?? null;
		$this->delimiter = $settings->delimiter ?? ",";
		$this->fmt = $settings->fmt ?? "csv";
		$this->quotes = $settings->quotes ?? '"';
		$this->detail = $settings->detail ?? "all";
		$this->saveResults = $settings->saveResults ?? true;
		$this->adhocAnswers = $settings->adhocAnswers ?? [];
		$this->adhocActivity = $settings->activity ?? [];
		//get test data with support for fluid and mutation tests
		OasysTest::buildTestData($this->testId, $this->db, $this->testData, $this->testType, $this->structure);
		$this->buildCorrections();
	}

	/**
	 * @throws Exception
	 */
	function buildCorrections(): void
	{
		$this->headers = ['legend' => ['', 'login', 'tag', 'name', 'metainfo', 'lastActivity', 'total'], 'itemId' => ['page id', '', '', '', '', '', ''], 'itemName' => ['page name', '', '', '', '', '', ''], 'itemCode' => ['page code', '', '', '', '', '', ''], 'field' => ['variable', '', '', '', '', '', ''], 'type' => ['type', '', '', '', '', '', '']];
		$this->corrections = [];

		foreach ($this->structure as $itemId) {
			$itemData = self::fetchItemData($itemId, $this->db);
			if (!$itemData || !is_array($itemData['fields'])) {
				$this->itemMissing = true;
				continue;
			}
			if (count($itemData['fields']) === 0) {
				continue;
			}
			$this->corrections[$itemId] = [];
			foreach ($itemData['fields'] as $field) {
				if (!isset($field['processing']) || $field['processing'] === 'none') {
					//fields that are not to be scored will be skipped
					continue;
				}

				$this->processing[$itemId][$field['id']] = $field['processing'];

				if ($field['processing'] === "manual") {
					$this->corrections[$itemId][$field['id']] = ['data' => "", 'format' => VALUES_UNDEFINED];
				} else {
					$this->corrections[$itemId][$field['id']] = $field['correction'];
				}

				if (!empty($field['score'])) {
					$this->scoringModel[$itemId][$field['id']] = $field['score'];
				} else {
					$this->scoringModel[$itemId][$field['id']] = null;
				}
				$this->headers['legend'][] = '';
				$this->headers['itemName'][] = $this->escapeValue($itemData['name']);
				$this->headers['itemCode'][] = $this->escapeValue($itemData['itemCode']);
				$this->headers['itemId'][] = $itemData['id'];
				$this->headers['field'][] = $field['id'];
				$this->headers['type'][] = str_replace("oasys", "", $field['type']);
			}
		}
	}

	/**
	 * @throws Exception
	 */
	function populateAnswers($s_date = "", $e_date = ""): void
	{
		if ($this->saveResults === true) {
			if (!empty($this->passwordIds)) {
				$this->activity = [];
				foreach ($this->passwordIds as $pwdId) {
					$activityRow = self::fetchActivity($this->testId, $this->db, $pwdId, '', '');
					if (!empty($activityRow[$pwdId])) {
						$this->activity[$pwdId] = $activityRow[$pwdId];
					}
				}
			} else {
				$this->activity = self::fetchActivity($this->testId, $this->db, $this->passwordId, $s_date, $e_date);
			}
		} else {
			$this->activity = $this->adhocActivity;
		}

		$this->checkAnswers();
	}



	function checkAnswers(): void
	{
		$this->scoreDetails = [];
		$this->aggregatedScore = [];

		foreach ($this->activity as $passwordId => $row) {
			$this->aggregatedScore[$passwordId] = [];
			if ($this->saveResults === true) {
				$this->answers[$passwordId] = self::fetchAnswersData($passwordId, $this->testId, $this->db);
			} else {
				$this->answers[$passwordId] = $this->adhocAnswers[$this->testId] ?? [];
			}
			if ($this->testType === 'fluid' || $this->testType === 'mutation') {
				//function from testCommonFunctions to get test structure cache
				$this->testCache[$passwordId] = getTestCache($passwordId, $this->testId, $this->db);
			}

			//for loop starts at $this->headerColumnOffset, because the columns before are metadata
			for ($i = $this->headerColumnOffset; $i < count($this->headers['legend']); $i++) {
				$itemId = $this->headers['itemId'][$i];
				$field = $this->headers['field'][$i];
				if (($this->testType === 'fluid' || $this->testType === 'mutation') && !in_array($itemId, $this->testCache[$passwordId])) {
					$this->scoreDetails[$passwordId][$itemId][$field] = [CORRECT => 0, WRONG => 0, MISSING => 0];
				} else {
					$this->testCacheHeaderIndex[$passwordId][] = $i;
					if (isset($this->answers[$passwordId][$itemId][$field])) {
						$this->aggregatedScore[$passwordId][$itemId]['fields'][$field]['answered'] = true;
						$this->scoreDetails[$passwordId][$itemId][$field] = $this->answerCheck($this->answers[$passwordId][$itemId][$field], $this->corrections[$itemId][$field]);
					} else {
						$this->aggregatedScore[$passwordId][$itemId]['fields'][$field]['answered'] = false;
						$this->scoreDetails[$passwordId][$itemId][$field] = $this->answerCheck(null, $this->corrections[$itemId][$field]);
					}
				}
			}
		}
	}

	function buildDetailedScoring(): void
	{
		$this->scoreData = [];

		foreach ($this->scoreDetails as $passwordId => $row) {

			$gsdQ = $this->db->fetchValue("SELECT `givenScoringData` FROM `scoring` WHERE `passwordId` = ? AND `testId` = ?", [$passwordId, $this->testId])['data'];
			if (empty($gsdQ)) {
				$gsdQ = "{}";
			}
			$gsd = json_decode($gsdQ, true);

			$set = ['', $this->activity[$passwordId]['login'], $this->activity[$passwordId]['tag'], ($this->activity[$passwordId]['name'] ?? ''), '', $this->activity[$passwordId]['tsActiveServer'], '']; //6 columns for the legend
			if (!empty($this->activity[$passwordId]['info'])) {
				$set[4] = json_encode(json_decode($this->activity[$passwordId]['info'] ?? '', true), JSON_UNESCAPED_UNICODE);
			}

			$totalScore = 0;

			//initialize the array with spaces for fluid and mutation tests
			if ($this->testType === 'fluid' || $this->testType === 'mutation') {
				$set = array_merge($set, array_fill($this->headerColumnOffset, count($this->headers['itemId']) - $this->headerColumnOffset, ''));
				for ($i = $this->headerColumnOffset; $i < count($this->headers['itemId']); $i++) {
					$itemId = $this->headers['itemId'][$i];
					$field = $this->headers['field'][$i];
					if (isset($this->aggregatedScore[$passwordId][$itemId])) {
						$this->aggregatedScore[$passwordId][$itemId]['fields'][$field] = ['achieved' => 0, 'maxScore' => 0];
					}
				}
			}

			foreach ($this->testCacheHeaderIndex[$passwordId] as $i) {
				$itemId = $this->headers['itemId'][$i];
				$field = $this->headers['field'][$i];
				$details = $row[$itemId][$field];
				$model = $this->scoringModel[$itemId][$field] ?? null;
				$info = ["id" => $itemId, "itemName" => $field, "passwordId" => $passwordId];
				$set[$i] = $this->score($details, $model, $info, $gsd);
				if (isset($this->aggregatedScore[$passwordId][$itemId])) {
					$this->aggregatedScore[$passwordId][$itemId]['fields'][$field]['achieved'] = $set[$i];
					$this->aggregatedScore[$passwordId][$itemId]['fields'][$field]['maxScore'] = self::maxScore($this->processing[$itemId][$field], $this->corrections[$itemId][$field], $this->scoringModel[$itemId][$field]);
				}
				$totalScore += $set[$i];
			}

			$set[6] = $totalScore;
			foreach ($set as $k => $v) {
				$set[$k] = $this->escapeValue($v);
			}
			$this->scoreData[$passwordId] = $set;
		}
		$this->buildAggregatedScore();
	}

	function buildAggregatedScore(): void
	{
		if (!empty($this->aggregatedScore)) {
			foreach ($this->aggregatedScore as $passwordId => $testData) {
				$this->aggregatedScore[$passwordId]['achieved'] = 0;
				$this->aggregatedScore[$passwordId]['maxScore'] = 0;
				foreach ($testData as $itemId => $pageData) {
					$this->aggregatedScore[$passwordId][$itemId]['achieved'] = 0;
					$this->aggregatedScore[$passwordId][$itemId]['maxScore'] = 0;
					foreach ($pageData['fields'] as $field => $fieldData) {
						$this->aggregatedScore[$passwordId][$itemId]['achieved'] += $fieldData['achieved'];
						$this->aggregatedScore[$passwordId][$itemId]['maxScore'] += $fieldData['maxScore'];
					}
					$this->aggregatedScore[$passwordId]['achieved'] += $this->aggregatedScore[$passwordId][$itemId]['achieved'];
					$this->aggregatedScore[$passwordId]['maxScore'] += $this->aggregatedScore[$passwordId][$itemId]['maxScore'];
				}
			}
		}
	}

	function buildScoreSummary(): void
	{
		$this->scoreSummary = [];

		foreach ($this->scoreDetails as $passwordId => $row) {

			$gsdQ = $this->db->fetchValue("SELECT `givenScoringData` FROM `scoring` WHERE `passwordId` = ? AND `testId` = ?", [$passwordId, $this->testId])['data'];
			if (empty($gsdQ)) {
				$gsdQ = "{}";
			}
			$gsd = json_decode($gsdQ ?? '', true);

			$achieved = 0.0;
			$max = 0.0;

			for ($i = $this->headerColumnOffset; $i < count($this->headers['legend']); $i++) {
				$itemId = $this->headers['itemId'][$i];
				$field = $this->headers['field'][$i];
				$achieved += $this->score($row[$itemId][$field], $this->scoringModel[$itemId][$field], ["id" => $itemId, "itemName" => $field, "passwordId" => $passwordId], $gsd);
				if (($this->testType !== 'fluid' && $this->testType !== 'mutation') || (isset($this->testCache[$passwordId]) && in_array($itemId, $this->testCache[$passwordId]))) {
					$max += self::maxScore($this->processing[$itemId][$field], $this->corrections[$itemId][$field], $this->scoringModel[$itemId][$field]);
				}
			}
			$this->scoreSummary[$passwordId]['achieved'] = $achieved;
			$this->scoreSummary[$passwordId]['max'] = $max;
			$this->scoreSummary[$passwordId]['percentage'] = round(($achieved / $max) * 100);
		}
	}

	function buildMaxPageScoreSummary(): void
	{
		$this->maxPageScoreSummary = [];
		$checkList = [];
		for ($i = $this->headerColumnOffset; $i < count($this->headers['legend']); $i++) {
			$itemId = $this->headers['itemId'][$i];
			$field = $this->headers['field'][$i];
			if (isset($checkList[$itemId][$field]) && $checkList[$itemId][$field] === true) {
				/* prevent counting the same field twice */
				continue;
			}
			if (!isset($this->maxPageScoreSummary[$itemId])) {
				$this->maxPageScoreSummary[$itemId] = 0.0;
			}
			$this->maxPageScoreSummary[$itemId] += self::maxScore($this->processing[$itemId][$field], $this->corrections[$itemId][$field], $this->scoringModel[$itemId][$field]);
			$checkList[$itemId][$field] = true;
		}
	}

	function answerCheck($answer, $correction): array
	{
		$missing = 0;
		$correct = 0;
		$wrong = 0;
		switch ($correction['format']) {
			case VALUES_INT:
				if ((int)$answer === $correction['data']) {
					$correct++;
				} elseif ($answer === null || (isset($correction['noreply']) && $answer === $correction['noreply'])) {
					$missing++;
				} else {
					$wrong++;
				}
				break;
			case VALUES_DOUBLE:
				if ((float)$answer === $correction['data']) {
					$correct++;
				} elseif ($answer === null || (isset($correction['noreply']) && $answer === $correction['noreply'])) {
					$missing++;
				} else {
					$wrong++;
				}
				break;
			case VALUES_STRING:
				if (isset($correction['ignoreCase']) && $correction['ignoreCase'] === true) {
					//if case-insensitive answer
					if ($answer === null || $answer === "" || (isset($correction['noreply']) && $answer === $correction['noreply'])) {
						$missing++;
					} elseif (is_array($correction['data'])) {
						if (in_array(mb_strtolower($answer), array_map(function ($value) {
							return is_string($value) ? mb_strtolower($value) : $value;
						}, $correction['data']))) {
							$correct++;
						} else {
							$wrong++;
						}
					} elseif (mb_strtolower($answer) === mb_strtolower($correction['data'])) {
						$correct++;
					} else {
						$wrong++;
					}
				} else {
					//if case-sensitive answer
					if ($answer === null || $answer === "" || (isset($correction['noreply']) && $answer === $correction['noreply'])) {
						$missing++;
					} elseif (is_array($correction['data'])) {
						if (in_array($answer, $correction['data'])) {
							$correct++;
						} else {
							$wrong++;
						}
					} elseif ($answer === $correction['data']) {
						$correct++;
					} else {
						$wrong++;
					}
				}
				break;
			case VALUES_STRING_ARRAY:
				if (empty($answer)) {
					$missing = count($correction['data']); //all the expected answers (e.g. checkboxes) are missing
					break;
				} else {
					$answer = json_decode($answer ?? '');
					if (json_last_error() !== JSON_ERROR_NONE) {
						//if a technical error occurs we rate this field as missing an answer
						$missing = count($correction['data']); //all of the expected answers (e.g. checkboxes) are missing
						//TODO: @Ricky -> make technical log entry
						break;
					}
				}

				foreach ($answer as $v) {
					if (!in_array($v, $correction['data'])) {
						$wrong++;
					} else {
						$correct++;
					}
				}
				$missing = count($correction['data']) - $correct;
				break;
			case VALUES_RANGE:
				if ((float)$answer >= $correction['data']['min'] && (float)$answer <= $correction['data']['max']) {
					$correct++;
				} elseif ($answer === null || (isset($correction['noreply']) && $answer === $correction['noreply'])) {
					$missing++;
				} else {
					$wrong++;
				}
				break;
		}
		return [CORRECT => $correct, WRONG => $wrong, MISSING => $missing];
	}

	function score(array $details, ?array $model, array $info, array $gsd)
	{
		if (!$model) {
			$model = $this->defaultModel;
		}

		$procMode = $this->processing[$info['id']][$info['itemName']];

		// manual scoring -- get value from scoring table, and if it doesn't exist, return INT (0)
		if ($procMode === "manual") {
			return $gsd[$info['id']][$info['itemName']]['score']['scoreValue'] ?? 0;
		}

		// original scoring calculation routine (used for autoscores)
		$scoreCalc = $model['initial'] + $details[CORRECT] * $model['correct'] + $details[MISSING] * $model['missing'] + $details[WRONG] * $model['wrong'] ?? 0;
		$recordedScore = $gsd[$info['id']][$info['itemName']]['score']['scoreValue'] ?? null;
		$scoredBy = $gsd[$info['id']][$info['itemName']]['score']['scoreBy'] ?? null;

		$score = $recordedScore;

		if (($procMode === "auto" && (($scoreCalc !== $recordedScore) && ($scoredBy === "_autoscore_"))) || is_null($score)) {
			$score = $scoreCalc;
		}

		if ($score < 0) {
			$score = 0; //if some correct answers were selected, but some are missing
		}

		return $score;
	}

	function escapeValue($v): string
	{
		if (is_array($v) || is_object($v)) {
			return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		}
		return (string)($v ?? '');
	}


	public function getTestData(): array
	{
		return $this->testData;
	}

	public function getHeaders(): array
	{
		if ($this->detail === "all") {
			return $this->headers;
		} else {
			$headersMinimized = [];
			foreach ($this->headers as $header) {
				// Take only the first elements from each header
				$headersMinimized[] = array_slice($header, 0, $this->headerColumnOffset);
			}
			return $headersMinimized;
		}
	}

	public function getScoreData(): array
	{

		$this->buildDetailedScoring();

		if ($this->detail === "all") {
			return $this->scoreData;
		} else {
			$scoreDataMinimized = [];
			foreach ($this->scoreData as $score) {
				// Take only the first elements from each header
				$scoreDataMinimized[] = array_slice($score, 0, $this->headerColumnOffset);
			}
			return $scoreDataMinimized;
		}
	}

	public function getAggregatedScore($passwordId = null): array
	{
		if ($passwordId !== null) {
			return $this->aggregatedScore[$passwordId] ?? [];
		} else {
			return $this->aggregatedScore;
		}
	}

	public function getScoreSummary(): array
	{
		$this->buildScoreSummary();
		return $this->scoreSummary;
	}

	public function setDelimiter(string $delimiter): void
	{
		$this->delimiter = $delimiter;
	}

	public function setQuotes(string $quotes): void
	{
		$this->quotes = $quotes;
	}

	public function getDelimiter(): string
	{
		return $this->delimiter;
	}

	public function getQuotes(): string
	{
		return $this->quotes;
	}

	public function debug(): void
	{
		debugArray($this->activity, '$this->activity');
		debugArray($this->testData, '$this->testData');
		debugArray($this->headers, '$this->headers');
		debugArray($this->corrections, '$this->corrections');
		debugArray($this->answers, '$this->answers');
		debugArray($this->scoreDetails, '$this->scoreDetails');
		debugArray($this->scoreData, '$this->scoreData');
		debugArray($this->aggregatedScore, '$this->aggregatedScore');
	}

	# ------------------------ #
	# MANUAL SCORING FUNCTIONS #
	# ------------------------ #

	/**
	 * Takes the active auto-scoring values and inserts them into the 'scoring' table.
	 */

	public function manscoreProcess(): void
	{
		$this->getScoreSummary();

		$scoreTableData = $this->db->fetchTable("SELECT `testId`, `passwordId`, `scoringData`, `givenScoringData` FROM `scoring` WHERE `testId` = ?", [$this->testId], 'testId', 'passwordId')['data'];

		foreach ($this->scoreSummary as $passwordId => $scoreDetail) {
			$headerOffset = $this->headerColumnOffset;

			/* build scoring data (class derived data) to mingle with the eventual insert/update given data array  */
			$scoringData = [];
			$scoringData['scoringAnswerList'] = [];

			$origScoringData = $scoreTableData[$this->testId][$passwordId]["scoringData"] ?? [];
			$origScoringData = (empty($origScoringData)) ? [] : json_decode($origScoringData ?? '', true);
			$pageNameArr = $this->db->fetchColumn("SELECT `id`, `name` FROM `items`", [], "id")['data'];

			for ($i = $headerOffset; $i < count($this->headers['itemId']); $i++) {
				$pageKey = $this->headers['itemId'][$i];
				$itemName = $this->headers['field'][$i];
				$itemType = $this->headers['type'][$i];

				if ($this->processing[$pageKey][$itemName] !== "manual") continue;

				$scoringData['scoringAnswerList'][$pageKey]['pageName'] = $pageNameArr[$pageKey];

				$itemInfo = &$scoringData['scoringAnswerList'][$pageKey][$itemName]; // convenient variable reference
				$itemInfo['givenAnswers'] = (key_exists($pageKey, $this->answers[$passwordId])) ? $this->answers[$passwordId][$pageKey][$itemName] ?? [] : [];
				$itemInfo['itemScoreType'] = $this->processing[$pageKey][$itemName];
				$itemInfo['itemType'] = $itemType;
				$itemInfo['itemParent'] = $pageNameArr[$pageKey];
				$itemInfo['earned'] = 0;
				// $itemInfo['touched'] = $itemInfo['touched'] ?? 0; // this is the only value from the DB we merge in when available, else set to 0
				$itemInfo['touched'] = $origScoringData['scoringAnswerList'][$pageKey][$itemName]['touched'] ?? 0; // this is the only value from the DB we merge in when available, else set to 0
			}

			/* PRE-REFACTORED VERSION OF GIVEN SCORING DATA / SCOURING ANSWER LIST BUILDER ROUTINE */

			// foreach ($this->processing as $pageKey => $itemList) {

			// 	$pageName = $pageNameArr[$pageKey];

			// 	foreach ($itemList as $itemName => $procType) {

			// 		if ($procType !== "manual") continue;

			// 		$scoringData['scoringAnswerList'][$pageKey]['pageName'] = $pageName;

			// 		$itemInfo = &$scoringData['scoringAnswerList'][$pageKey][$itemName]; // convenient variable reference
			// 		$itemInfo['givenAnswers'] = (key_exists($pageKey, $this->answers[$passwordId])) ? $this->answers[$passwordId][$pageKey][$itemName] ?? [] : [];
			// 		$itemInfo['itemScoreType'] = $procType;
			// 		$itemInfo['itemType'] = $this->headers['type'][$headerOffset];
			// 		$itemInfo['itemParent'] = $pageName;
			// 		$itemInfo['earned'] = 0;
			// 		$itemInfo['touched'] = $origScoringData['scoringAnswerList'][$pageKey][$itemName]['touched'] ?? 0; // this is the only value from the DB we merge in when available, else set to 0

			// 		$headerOffset++;
			// 	}
			// }

			/* insert auto-scored data into master scoring 'given scoring' column */
			$gsd_to_load = $scoreTableData[$this->testId][$passwordId]["givenScoringData"] ?? [];
			$gsd_to_load = (empty($gsd_to_load)) ? [] : json_decode($gsd_to_load ?? '', true);

			// iterating over autocalc'd data first
			foreach ($scoringData['scoringAnswerList'] as $pageId => $pageValues) {

				foreach (array_keys($pageValues) as $pName) {
					if (isset($this->processing[$pageId][$pName]) && $this->processing[$pageId][$pName] !== "manual") continue 2;
				}

				// if the db table record is blank, replace the data to process with the live derived data from this class
				if (!isset($gsd_to_load[$pageId])) {

					foreach ($pageValues as $gKey => $gValue) {
						if ($gKey === 'pageName') {
							continue;
						}
						$gsd_to_load[$pageId][$gKey] = [];
					}
				} else {
					// if the item inside existing page is blank, process with live derived scoring data from this class
					foreach ($pageValues as $kp => $vp) {
						if ($kp === 'pageName') {
							continue;
						}
						if (!key_exists($kp, $gsd_to_load[$pageId])) {
							$gsd_to_load[$pageId][$kp] = [];
						}
					}
				}

				/* determine what final score values to insert into scoring table */
				foreach ($gsd_to_load[$pageId] as $gk => &$gv) {
					if ($gk === "pageName") {
						continue;
					}
					if (!isset($pageValues[$gk])) {
						continue;
					}

					// conditions for applying the live calc'd value or recorded value (live calc'd applied when model changes or there's no recorded values yet)
					if (!isset($gv['score']) || ($pageValues[$gk]['earned'] !== $gv['score']['scoreValue'] && $gv['score']['scoreBy'] === "_autoscore_")) {
						$gv['score']['scoreValue'] = $pageValues[$gk]['earned'];
						$gv['score']['scoreTime'] = date('Y-m-d H:i:s');
						$gv['score']['scoreBy'] = "_autoscore_";
						$gv['score']['scoreById'] = 0;
					}
				}
			}

			$scoreSum = $scoreDetail['achieved'] ?? 0;

			$finalScore = ($scoreDetail['max'] == 0) ? 0 : ($scoreSum / $scoreDetail['max']);
			$points = $scoreSum . " / " . $scoreDetail['max'];

			// remove stale question items when no longer in scoring answer list key
			foreach ($gsd_to_load as $pageId_a => $question) {
				foreach (array_keys($question) as $qi) {
					if (!isset($scoringData['scoringAnswerList'][$pageId_a][$qi])) {
						unset($gsd_to_load[$pageId_a][$qi]);
					}
				}
			}

			$scoringData = json_encode($scoringData, JSON_PRETTY_PRINT);
			$gsd_to_load = json_encode($gsd_to_load, JSON_PRETTY_PRINT);

			$this->db->startTransaction();
			/* Get associated loginId for the particular password/test run. Cloned datasets use activity.loginId. */
			$loginId = $this->activity[$passwordId]["loginId"] ?? null;
			if (empty($loginId)) {
				$loginId = $this->db->fetchValue("SELECT `loginID` FROM `passwords` WHERE `id` = ?", [$passwordId])['data'];
			}

			/* Get associated loginName for the particular loginId */
			$loginName = $this->db->fetchValue("SELECT `name` FROM `logins` WHERE `id` = ?", [$loginId])['data'];

			/* Insert all calculated/collected data into 'scoring' table */
			$this->db->insert("scoring", [
				'id' => null,
				'testId' => $this->testId,
				'loginId' => $loginId,
				'loginName' => $loginName,
				'passwordId' => $passwordId,
				'points' => $points,
				'scoringData' => $scoringData,
				'givenScoringData' => $gsd_to_load,
				'finalScore' => $finalScore
			], 'update', ['loginId', 'loginName', 'points', 'scoringData', 'givenScoringData', 'finalScore']);

			$this->db->commit();
		}
	}

	/**
	 * @throws Exception
	 */
	private function getMPL(): array
	{
		global $uiLang;
		$iList = [];

		$emptyTestTest = $this->db->fetchValue("SELECT COUNT(*) FROM `scoring` WHERE `testId` = ?", [$this->testId])['data'];
		if ($emptyTestTest === 0) {
			throw new Exception($uiLang->translate("This test is not scorable. Returning to the test selection screen."));
		}

		foreach ($this->processing as $key => $item) {
			foreach ($item as $itemName => $procType) {
				array_push($iList, $key);
			}
		}

		$iList = array_values(array_unique($iList));
		return $iList;
	}

	public function scorable(): bool
	{
		return isset($this->processing);
	}

	public function containsMS(): int
	{
		if (isset($this->processing)) {
			foreach ($this->processing as $k0 => $procItem) {
				foreach ($procItem as $k1 => $procval) {
					// at least 1 manual scoring entry found
					if ($procval === "manual") return 1;
				}
			}

			// no manual scoring found
			return 0;
		}

		// no processing info found -- most likely has had content removed
		return -1;
	}

	/**    Check if loaded test has any manual scoring items left */
	public function hasMSleft(): bool|string
	{
		$dataPresent = $this->db->fetchValue("SELECT IFNULL(MIN(IFNULL(JSON_EXISTS(scoringData, '$.scoringAnswerList'), 0)),0) dataPresent FROM scoring WHERE testId = ?", [$this->testId])['data'];

		if ($dataPresent === 0) return "notrun";

		$query = <<<SQL
					SELECT
						COUNT(*) AS itemCount 
					FROM
						scoring,
						JSON_TABLE (
							scoringData,
						'$.scoringAnswerList.*.*' COLUMNS ( itemScoreType VARCHAR ( 10 ) path '$.itemScoreType', touched TINYINT path '$.touched' )) AS sd 
					WHERE
						scoring.testId = ? 
					GROUP BY
						itemScoreType,
						touched 
					HAVING
						itemScoreType = 'manual' 
						AND touched = 0
					SQL;

		$result = $this->db->fetchValue($query, [$this->testId]);
		return $result['rows'] > 0;
	}

	public function lastUpdateTime(): string
	{
		global $uiLang;
		$q = $this->db->fetchValue("SELECT `lastRunTime` FROM `scoring` WHERE `testId` = ? ORDER BY `lastRunTime` DESC LIMIT 1", [$this->testId])['data'];
		$ret = (is_null($q)) ? $uiLang->translate("NEVER") : $q;

		return $ret;
	}

	public function get_tt_count()
	{
		return $this->db->fetchValue("SELECT COUNT(*) FROM `view_tt_list` WHERE (`testId` = ? OR JSON_SEARCH(`testIdAll`, 'one', ?) IS NOT NULL) AND `status` <> 'NOT STARTED'", [$this->testId, $this->testId])['data'];
	}

	/**
	 * @throws Exception
	 */
	public function get_q_count()
	{
		$masterPageList = $this->getMPL();
		$qMarks = substr(str_repeat("?,", count($masterPageList)), 0, -1);
		return $this->db->fetchValue("SELECT COUNT(*) FROM `view_q_list` WHERE `id` IN ($qMarks)", $masterPageList)['data'];
	}

	public function getTlistSummary($startPos)
	{
		$startPos = max(0, (int)$startPos);
		$loginsList = $this->db->fetchTable("SELECT * FROM `view_tt_list` WHERE `testId` = ? OR JSON_SEARCH(`testIdAll`, 'one', ?) IS NOT NULL AND `status` = 'NOT STARTED' LIMIT $startPos, 100", [$this->testId, $this->testId])['data'];

		foreach ($loginsList as $key => &$lVals) {
			$lVals['msLeft'] = 0;
			$sd = $this->db->fetchValue("SELECT `scoringData` FROM `scoring` WHERE `passwordId` = ? AND `testId` = ?", [$lVals['passwordId'], $lVals['testId']])['data'];

			// get remaining manual scoring items left per passwordId
			if (!empty($sd)) {
				$sd = json_decode($sd ?? '', true)['scoringAnswerList'];
				if ($this->testType === "fluid" || $this->testType === "mutation") $sd = array_intersect_key($sd, array_flip($this->testCache[$lVals['passwordId']])); // when in fluid/mutation cache mode, intersect the values to filter out non-taken test pages

				foreach ($sd as $page => $pVals) {
					foreach ($pVals as $pName => $qVals) {
						if ($pName === "pageName") {
							continue;
						}

						if ($qVals['itemScoreType'] === "manual") {
							if ($qVals['touched'] === 0) {
								$lVals['msLeft']++;
							}
						}
					}
				}
			}
		}

		return $loginsList;
	}

	/**
	 * @throws Exception
	 */
	public function getQlistSummary($startPos): array
	{
		if ($this->testType === "fluid" || $this->testType === "mutation") return [];

		global $uiLang;
		if (empty($this->scoreDetails)) {
			return [];
		}

		$masterPageList = $this->getMPL();
		$qMarks = substr(str_repeat("?,", count($masterPageList)), 0, -1);
		$startPos = max(0, (int)$startPos);
		$pagesList = $this->db->fetchTable("SELECT * FROM `view_q_list` WHERE `id` IN ($qMarks) LIMIT $startPos, 100", $masterPageList)['data'];

		array_walk($pagesList, function (&$val, $idx) {
			$val['languages'] = json_decode($val['languages'] ?? '', true);
			$val['itemTypes'] = json_decode($val['itemTypes'] ?? '', true);
			$val['scoringTypes'] = json_decode($val['scoringTypes'] ?? '', true);
			$val['msLeftPage'] = 0;
		});

		// get num manscore questions left across all test takers for test id
		$sd = [];
		foreach (array_keys($this->scoreDetails) as $passIdVal) {
			$sd = $this->db->fetchValue("SELECT `scoringData` FROM `scoring` WHERE `testId` = ? AND `passwordId` = ?", [$this->testId, $passIdVal])['data'];

			if (empty($sd)) {
				return [];
				// throw new Exception($uiLang->translate("No scoring data found! This test will now be re-scored. Please try again."));
			}

			$sd = json_decode($sd ?? '', true);

			// foreach (array_keys($sd['scoringAnswerList']) as $key) {
			// 	if (!(in_array($key, array_column($pagesList, "id")))) {
			// 		unset($sd['scoringAnswerList'][$key]);
			// 	}
			// }

			$sd = $sd['scoringAnswerList'];
			foreach ($pagesList as &$pVal) {
				if (!isset($sd[$pVal['id']])) continue;
				foreach ($sd[$pVal['id']] as $k0 => $pages) {
					if ($k0 === "pageName") {
						continue;
					}
					if ($pages['itemScoreType'] === "manual" && $pages['touched'] === 0) {
						$pVal['msLeftPage']++;
					}
				}
			}
		}

		$pagesListSorted = array_map(function ($a) use ($pagesList) {
			$targIdx = array_search($a, array_column($pagesList, 'id'));
			return $pagesList[$targIdx];
		}, (array_values($this->getMPL())));

		return $pagesListSorted;
	}

	/**
	 * @throws Exception
	 */
	public function get_tt_list_detail(int $passwordId, int $pageStart, bool $msOnly, $forcePage = false)
	{
		global $uiLang;

		/* check for no scoring data */
		$emptyTestTest = $this->db->fetchValue("SELECT COUNT(*) FROM `scoring` WHERE `testId` = ?", [$this->testId])['data'];
		if ($emptyTestTest === 0) {
			throw new Exception($uiLang->translate("This test is not scorable. Returning to the test selection screen."));
		}

		/* limit count for pagination */
		$scoringStart = json_decode($this->db->fetchValue("SELECT `scoringData` FROM `scoring` WHERE `testId` = ? AND `passwordId` = ?", [$this->testId, $passwordId])['data'] ?? '', true);

		// integrate the autoscored detail data directly from class object since there is no DB entries anymore for these types
		foreach ($this->processing as $pageId => $itemData) {

			foreach ($itemData as $itemName => $procType) {

				if ($procType === "auto") {
					$scoringStart['scoringAnswerList'][$pageId]["pageName"] = $this->headers['itemName'][array_search($pageId, $this->headers['itemId'])];
					$scoringStart['scoringAnswerList'][$pageId][$itemName] = [
						'givenAnswers' => $this->answers[$passwordId][$pageId][$itemName] ?? [],
						'itemScoreType' => "auto",
						'itemType' => $this->headers['type'][array_search($pageId, $this->headers['itemId'])],
						'itemParent' => $this->headers['itemName'][array_search($pageId, $this->headers['itemId'])],
						'earned' => $this->aggregatedScore[$passwordId][$pageId]["fields"][$itemName]["achieved"] ?? 0,
						'touched' => 1
					];
				}
			}
		}

		unset($pageId, $itemData, $itemName, $procType);

		if ($this->testType === "fluid" || $this->testType === "mutation") $scoringStart['scoringAnswerList'] = array_intersect_key($scoringStart['scoringAnswerList'], array_flip($this->testCache[$passwordId])); // when in fluid/mutation cache mode, intersect the values to filter out non-taken test pages

		if ($forcePage !== false) {
			$tmpVal1 = $scoringStart['scoringAnswerList'][$forcePage];
			unset($scoringStart['scoringAnswerList']);
			$scoringStart['scoringAnswerList'][$forcePage] = $tmpVal1;
		}

		/* filter out autoscores when applicable */
		if ($msOnly) {
			foreach ($scoringStart['scoringAnswerList'] as $pageId => $items) {
				// remove individual manscore items
				foreach ($items as $itemName => $itemVals) {
					if ($itemName === 'pageName') {
						continue;
					}
					if ($itemVals['itemScoreType'] === "auto") {
						unset($scoringStart['scoringAnswerList'][$pageId][$itemName]);
					}
				}
				// remove entire test page when no manscore items left
				if (count($scoringStart['scoringAnswerList'][$pageId]) === 1) {
					unset($scoringStart['scoringAnswerList'][$pageId]);
				}
			}
		}

		$scoringData = [];
		if ($forcePage === false) {
			if (count($scoringStart['scoringAnswerList']) === 0) {
				return [];
			}

			/* setup pagination logic and vars */
			if ($pageStart > (count($scoringStart['scoringAnswerList']) - 1)) {
				$pageStart = count($scoringStart['scoringAnswerList']) - 6;
			}
			$pageEnd = 100 + $pageStart;

			/* move the pointer ahead to starting position */
			for ($j = 0; $j < $pageStart; $j++) {
				if (next($scoringStart['scoringAnswerList']) === false) {
					break;
				}
			}

			for ($i = $pageStart; $i < $pageEnd; $i++) {
				if (current($scoringStart['scoringAnswerList']) === false) {
					break;
				}

				$scoringData['scoringAnswerList'][key($scoringStart['scoringAnswerList'])] = current($scoringStart['scoringAnswerList']); // assign the clipped array the current pointer sub-array value
				if (next($scoringStart['scoringAnswerList']) === false) {
					break;
				} // move pointer ahead, and break loop if at the end
			}
		} else {
			$scoringData = $scoringStart;
		}

		$scoringGivenDataArr = json_decode($this->db->fetchValue("SELECT `givenScoringData` FROM `scoring` WHERE `passwordId` = ? and `testId` = ?", [$passwordId, $this->testId])['data'] ?? '', true);
		// $sd_fullKeys = json_decode($this->db->fetchValue("SELECT `scoringData` FROM `scoring` WHERE `testId` = ? AND `passwordId` = ?", [$this->testId, $passwordId])['data'] ?? '', true);

		foreach ($this->processing as $pageId => $procArr) {
			foreach ($procArr as $itemName => $procVal) {

				if ($procVal === "manual") {
					$scoringData['markedScores'][$passwordId][$pageId][$itemName] = $scoringGivenDataArr[$pageId][$itemName]['score']['scoreValue'];
				} elseif ($procVal === "auto") {
					$scoringData['markedScores'][$passwordId][$pageId][$itemName] = $this->aggregatedScore[$passwordId][$pageId]["fields"][$itemName]["achieved"] ?? 0;
				}
			}
		}

		/* add sort ordering */

		# get sorted keys for answer list #
		$sortedAL = array_flip($this->getMPL());

		if ($this->testType === "fluid" || $this->testType === "mutation") {
			# sorting algo. for non-linear test types #
			$fSortKey = array_column(json_decode($this->db->fetchValue("SELECT `structure` FROM `testCache` WHERE `passwordId` = ? AND `testId` = ?", [$passwordId, $this->testId])['data'] ?? '', true), "hiddenID");
			foreach ($fSortKey as $k => $v) {
				static $c = 0;
				$scoringData['scoringAnswerList'][$v]['sortOrder'] = sprintf("%02d", $c);
				$c++;
			}
		} else {
			# sorting algo. for all other standard test types #
			foreach ($sortedAL as $alKey => $alVal) {
				static $d = 0;
				if (key_exists($alKey, $scoringData['scoringAnswerList'])) {
					$scoringData['scoringAnswerList'][$alKey]['sortOrder'] = sprintf("%02d", $d);
					$d++;
				}
			}
		}

		/* add total test page count for pagination calcs */
		$scoringData['testPageCount'] = count($scoringStart['scoringAnswerList']);

		return $scoringData;
	}

	function get_q_list_detail(int $pageStart, int $testId, bool $msOnly, $pageId): array
	{
		$itemList = $this->db->fetchValue("SELECT JSON_EXTRACT(`structure`, '$.items[*].hiddenID') from `tests` WHERE id = ?", [$testId])['data'];
		$itemList = json_decode($itemList ?? '', true);

		/* list of users to cycle through along with populated scoring and other data */
		$scoringData['userList'] = [];

		/* setup pagination logic and vars */
		$pwdSub = [];
		if ($pageStart > (count($this->activity) - 1)) {
			$pageStart = count($this->activity) - 6;
		}
		$pageEnd = 100 + $pageStart;

		/* move the pointer ahead to starting position */
		for ($j = 0; $j < $pageStart; $j++) {
			if (next($this->activity) === false) {
				break;
			}
		}

		for ($i = $pageStart; $i < $pageEnd; $i++) {
			if (current($this->activity) === false) {
				break;
			}

			$pwdSub[key($this->activity)] = current($this->activity); // assign the clipped array the current pointer sub-array value
			if (next($this->activity) === false) {
				break;
			} // move pointer ahead, and break loop if at the end
		}

		$loginId = null;
		$passId = null;
		foreach ($pwdSub as $passId => $passVals) {
			$loginId = $passVals['loginId'] ?? null;
			if (empty($loginId)) {
				$loginId = $this->db->fetchValue("SELECT `id` FROM `logins` WHERE `name` = ?", [$passVals['login']])['data'];
			}

			$scoringTableData = $this->db->fetchRow("SELECT `scoringData`, `givenScoringData` FROM `scoring` WHERE `passwordId` = ? AND `testId` = ?", [$passId, $this->testId])['data'];
			$scoringDataArr[$pageId] = json_decode($scoringTableData['scoringData'] ?? '', true)["scoringAnswerList"][$pageId] ?? [];
			$scoringGivenDataArr = json_decode($scoringTableData['givenScoringData'] ?? '', true)[$pageId] ?? [];

			// auto/mancorr merge
			foreach (($this->processing[$pageId]) as $iName => $processingType) {
				if ($processingType === "auto") {
					$scoringDataArr[$pageId]["pageName"] = $this->headers['itemName'][array_search($pageId, $this->headers['itemId'])];
					$scoringDataArr[$pageId][$iName] = [
						'givenAnswers' => $this->answers[$passId][$pageId][$iName] ?? "[]",
						'itemScoreType' => "auto",
						'itemType' => $this->headers['type'][array_search($pageId, $this->headers['itemId'])],
						'itemParent' => $this->headers['itemName'][array_search($pageId, $this->headers['itemId'])],
						'earned' => $this->aggregatedScore[$passId][$pageId]["fields"][$iName]["achieved"],
						'touched' => 1
					];
				}
			}

			foreach ($scoringDataArr[$pageId] as $iKey => $itemEntry) {
				if (gettype($itemEntry) === "string") continue;

				// integrate the manual marked score
				if ($this->processing[$pageId][$iKey] === "manual") {
					$scoringData['markedScores'][$passId][$pageId][$iKey] = $scoringGivenDataArr[$iKey]['score']['scoreValue'];
				} else {
					$scoringData['markedScores'][$passId][$pageId][$iKey] = $this->aggregatedScore[$passId][$pageId]["fields"][$iKey]["achieved"];
				}
			}

			$scoringData['userList'][$loginId . "_" . $passId] = [
				'loginName' => $passVals['login'],
				'passwordId' => $passVals['passwordId'],
				'passwordTag' => $passVals['tag'],
				'scoringData' => $scoringDataArr
			];
		}

		$scoringData['testUserCount'] = count($this->activity);

		// sort some keys
		ksort($scoringData['userList'][$loginId . "_" . $passId]["scoringData"][$pageId]);
		ksort($scoringData["markedScores"][$passId][$pageId]);

		return $scoringData;
	}

	function getQAslice(int $testId, int $passwordId, int $pageId): ?array
	{
		$detailData = ["items" => [], "scoringInfo" => [], "htmlPreview" => [], "itemType" => []];

		$pageData = self::fetchItemData($pageId, $this->db, false);
		if (!$pageData) {
			$this->itemMissing = true;
			return null;
		}
		$compiler = new InteractionCompiler($pageData['blocks'], $pageData['languages'], $pageId, $this->db, ['preserveSource' => true]);
		$compiler->compileBlocks();
		$pageData['fields'] = json_decode($compiler->getFields() ?? '', true);
		$pageData['options'] = json_decode($compiler->getOptions() ?? '', true);
		$pageData['parsed'] = json_decode($compiler->getParsed() ?? '', true);
		$pageData['blocks'] = json_decode($compiler->getBlocks() ?? '', true);
		$blocks = $pageData['blocks'];
		$pageFields = $pageData['fields'];
		$scoringInfo = json_decode($this->db->fetchValue("SELECT JSON_QUERY(`scoringData`, '$.scoringAnswerList.$pageId') FROM `scoring` WHERE passwordId = ? AND testId = ?", [$passwordId, $testId])['data'] ?? '', true);
		if (!is_array($scoringInfo)) $scoringInfo = [];
		$answerLanguages = $this->db->fetchColumn(
			"SELECT fieldId, language FROM answers WHERE passwordId = ? AND testId = ? AND itemId = ?",
			[$passwordId, $testId, $pageId],
			'fieldId'
		)['data'] ?? [];

		// run autoscoring builder routine if any auto processed items are found
		if (in_array('auto', array_column($pageFields, 'processing'))) {
			$this->populateAnswers();
			$this->getScoreData();
		}

		foreach ($pageFields as $itemName => $itemData) {
			if ($itemData['category'] === "metafields") continue; // for interactions e.g. choice matrix
			if (isset($itemData["processing"]) && $itemData["processing"] === "auto") {
				$scoringInfo["pageName"] = $this->headers['itemName'][array_search($pageId, $this->headers['itemId'])];
				$scoringInfo[$itemName] = [
					'givenAnswers' => $this->answers[$passwordId][$pageId][$itemName] ?? [],
					'itemScoreType' => "auto",
					'itemType' => $this->headers['type'][array_search($pageId, $this->headers['itemId'])],
					'itemParent' => $this->headers['itemName'][array_search($pageId, $this->headers['itemId'])],
					'earned' => $this->aggregatedScore[$passwordId][$pageId]["fields"][$itemName]["achieved"]/*  ?? 999999 */,
					'touched' => 1,
					'pointData' => $this->scoringModel[$pageId][$itemName],
					'givenAnswerLanguage' => $answerLanguages[$itemName] ?? null
				];
			}
		}

		/* remove all entries which do not contain a processing field */
		$pageFields = array_filter($pageFields, function ($a) use ($pageId) {
			return isset($this->processing[$pageId][$a['id']]);
		});

		/* filtering and processing for final page detail data object to return */
		foreach ($pageFields as $page => $pkeys) {
			if (!isset($pkeys['processing'])) {
				continue;
			}
			if (in_array($pkeys['processing'], ['manual', 'auto']) === false) {
				continue;
			}

			$detailData['items'][] = $page;
			if (!isset($scoringInfo[$page]) || !is_array($scoringInfo[$page])) $scoringInfo[$page] = [];
			$scoringInfo[$page]['givenAnswerLanguage'] = $answerLanguages[$page] ?? ($scoringInfo[$page]['givenAnswerLanguage'] ?? null);
			$detailData['scoringInfo'][$page] = $scoringInfo[$page];
			$detailData['itemType'][] = $pkeys['type'];
		}

		/* process and filter htmlPreview blocks */
		foreach ($blocks as $num => $hp_val) {

			/* remove entries which not in either auto or manual processing mode */
			if (isset($hp_val['processing']) && in_array($hp_val['processing'], ['manual', 'auto']) === false) {
				continue;
			}

			/* 	remove entries which are auto corrected, but do not contain any correction data, EXCEPT for inline textfields
				and inline gaps, which seem to be the exceptions in this case! */
			if (isset($hp_val['processing']) && $hp_val['processing'] === "auto" && empty($hp_val['correction']) && $hp_val["type"] !== "inline_textfields" && $hp_val["type"] !== "inline_gaps") {
				continue;
			}

			/* remove entries without processing key (static content which should not be shown), but leave in advanced ints of course */
			if (!isset($hp_val['processing']) && $hp_val['type'] !== "advanced") continue;

			/* choicematrix custom handling */
			if ($hp_val["type"] == "choicematrix") {
				foreach ($hp_val["rows"] as $k2) {
					$hp_val['cmtx_row'] = $k2['value'];
					$detailData['htmlPreview'][] = $hp_val;
				}
			} elseif ($hp_val["type"] === "inline_textfields" || $hp_val["type"] == "inline_gaps") {
				$lang = $pageData['languages'][0];
				foreach ($hp_val["fields"][$lang] as $_itBlock) {
					$detailData['htmlPreview'][] = $hp_val;
				}
			} elseif ($hp_val['type'] === "advanced") {
				/* advanced interaction custom handling */
				$lang = $pageData['languages'][0];
				$source = $pageData['parsed'][$lang];
				preg_match("/<!-- block $num start -->(.*)<!-- block $num end -->/s", $source, $matches);

				$source = $matches[1] ?? '';
				$hp_val['source'] = [$lang => $source]; //replace original source with the one newly prepared by the parser

				$matches = [];
				preg_match_all("/data-id='(.*?)'/", $source, $matches);

				foreach ($matches[1] as &$v) {
					$v = hex2bin($v);
				}
				unset($v); //clear reference as $v is again used further down

				$advEditorIds = array_unique($matches[1]); //remove duplicate ids

				$rawPosC = -1;
				foreach ($advEditorIds as $idKey) {
					if (!isset($pageFields[$idKey])) {
						//since we filtered out all fields which are not true fields, we will skip those ids
						continue;
					}
					$rawPosC++;
					if (!isset($pageFields[$idKey]['processing'])) {
						continue;
					}
					if (in_array($pageFields[$idKey]['processing'], ['manual', 'auto'])) {

						$hp_val['processing'] = $pageFields[$idKey]['processing'];
						$hp_val['id_code'] = $pageFields[$idKey]['code'];
						$hp_val['type'] = "advanced";
						$hp_val['rawPos'] = $rawPosC;

						$detailData['htmlPreview'][] = $hp_val;
					}
				}
			} else {
				/* default processing for all other interaction types */
				$detailData['htmlPreview'][] = $hp_val;
			}
		}

		// remove entries which do not contain a scoring key
		$remC = 0; // for arrays that are num indexed instead of by name
		foreach ($detailData['items'] as $k => $v) {
			if (!key_exists($v, $detailData['scoringInfo'])) {
				unset($detailData['items'][$k]);
				unset($detailData['itemType'][$remC]);
				unset($detailData['htmlPreview'][$remC]);
				$remC++;
			}
		}

		// reindex updated/filtered structure array keys
		$detailData['items'] = array_values($detailData['items']);
		$detailData['itemType'] = array_values($detailData['itemType']);
		$detailData['htmlPreview'] = array_values($detailData['htmlPreview']);

		return $detailData;
	}

	/**
	 * @throws Exception
	 */
	public function buildAstruct($pageId): array
	{
		global $uiLang;
		$pageData = self::fetchItemData($pageId, $this->db);
		$blockRes = $pageData['blocks'] ?? null;

		if (!$pageData || empty($blockRes)) {
			throw new Exception($uiLang->translate("Test page has been removed! Returning to results manager. Please re-enter this test to continue scoring."));
		}

		$fieldRes = $pageData['fields'];

		$aStruct = [];
		$blockCounter = -1;
		foreach ($fieldRes as $fKey => $fVal) {
			$blockCounter++;

			// filter out items with no processing defined
			if (!isset($fVal['processing'])) {
				continue;
			}

			$fKeyVal = $this->scoringModel[$pageId][$fKey] ?? null;

			switch ($fVal['processing']) {

				case 'auto':
					$aStruct[$fVal['id']]['posPts'] = self::maxScore("auto", $fVal['correction'], $fKeyVal);

					break;

				case 'manual':
					$aStruct[$fVal['id']]['posPts'] =  self::maxScore("manual", [], $fKeyVal);
					break;

				default:
					continue 2;
			}
		}

		return $aStruct;
	}

	public function buildCorKey($pageId): array
	{
		$corKey = [];
		if (empty($this->corrections[$pageId])) {
			return [];
		} // this can happen when item is removed while scoring
		foreach ($this->corrections[$pageId] as $k => $v) {
			$corKey[$k] = (getType($v['data']) === "string") ? [$v['data']] : $v['data'];
		}
		return $corKey;
	}

	/* get the processing mode for current test and given page id. */
	public function getProcMode($pageId)
	{
		return $this->processing[$pageId];
	}

	/* get a summary of maximum attainable score per page (for showing in test manager) */
	public function getMaxPageScoreSummary(): array
	{
		$this->buildMaxPageScoreSummary();
		return $this->maxPageScoreSummary;
	}

	/* get the column offset where the actual data starts in the csv file */
	public function getHeaderColumnOffset(): int
	{
		return $this->headerColumnOffset;
	}

	public function wasItemShown($passwordId, $itemId): bool
	{
		if ($this->testType === "fluid" || $this->testType === "mutation") {
			return in_array($itemId, $this->testCache[$passwordId]);
		} else {
			return in_array($itemId, $this->headers['itemId']);
		}
	}

	public function getItemsShown($passwordId): array
	{
		if ($this->testType === "fluid" || $this->testType === "mutation") {
			return $this->testCache[$passwordId];
		} else {
			return array_slice($this->headers['itemId'], $this->headerColumnOffset);
		}
	}

	public function getItemsMissing(): bool
	{
		return $this->itemMissing;
	}

	/* static functions */

	/**
	 * @throws Exception
	 */
	static function fetchActivity(int $testId, rixPDO &$db, ?int $passwordId, string $s_date, string $e_date): array
	{

		global $uiLang;

		if (empty($s_date)) $s_date = "01-01-1900";
		if (empty($e_date)) $e_date = "01-01-2100";

		if (preg_match('/^\d{1,2}-\d{1,2}-\d{4}$/', $s_date) !== 1 || preg_match('/^\d{1,2}-\d{1,2}-\d{4}$/', $e_date) !== 1) {
			throw new Exception($uiLang->translate("Date format not valid! Please use DD-MM-YYYY only."));
		}

		// flip date around to conform to ISO 8601 which MariaDB uses for comparison, and how our dates are stored
		$s_date = date("Y-m-d", strtotime(date($s_date)));
		$e_date = date("Y-m-d", strtotime(date($e_date)));

		if ($passwordId === null) {
			$query = "SELECT
				activity.passwordId AS passwordId,
				activity.loginId,
				logins.NAME AS login,
				passwords.tag,
				logins.displayname AS name,
				progress,
				logins.info,
				activity.tsActiveServer
			FROM
				activity
				JOIN logins ON logins.id = activity.loginId
				JOIN passwords ON passwords.id = activity.passwordId
			WHERE
				testId =?
				AND activity.tsActiveServer > ?
				AND activity.tsActiveServer < DATE_ADD(?, INTERVAL 1 DAY)";

			$results = $db->fetchTable($query, [$testId, $s_date, $e_date], 'passwordId');
		} else {
			$query = "SELECT
				activity.passwordId AS passwordId,
				activity.loginId,
				logins.NAME AS login,
				passwords.tag,
				logins.displayname AS name,
				progress,
				logins.info,
				activity.tsActiveServer
			FROM
				activity
				JOIN logins ON logins.id = activity.loginId
				JOIN passwords ON passwords.id = activity.passwordId
			WHERE
				testId =?
				AND activity.passwordId =?
				AND activity.tsActiveServer > ?
				AND activity.tsActiveServer < ?";

			$results = $db->fetchTable($query, [$testId, $passwordId, $s_date, $e_date], 'passwordId');
		}
		return $results['data'];
	}

	static function fetchItemData(int $itemId, rixPDO &$db, $useAssoc = true): ?array
	{
		/* @var $db rixPDO */
		$query = "SELECT id, languages, `name`, itemCode, `fields`, blocks, `options` FROM items WHERE id=?";
		$results = $db->fetchRow($query, [$itemId]);
		if ($results['rows'] === 0) {
			return null;
		}
		decodeData($results['data'], ['fields', 'blocks', 'languages', 'options'], false, $useAssoc);
		$errors = [];


		if ($useAssoc === true) {
			$cleanedFields = [];
			foreach ($results['data']['fields'] as $k => $field) {
				if (isset($field['processing']) && $field['processing'] === "auto" && empty($field['correction']['data'])) {
					/* if field is set to score automatically but no correct answer was given, we set processing to 'none' */
					$field['processing'] = 'none';
				}
				/* remove any entries which are not real fields (e.g. metafields) */
				if ($field['category'] === 'fields') {
					$cleanedFields[$k] = $field;
				}
			}
		} else {
			$cleanedFields = new stdClass();
			foreach ($results['data']['fields'] as $k => $field) {
				if (isset($field->processing) && $field->processing === "auto" && empty($field->correction->data)) {
					/* if field is set to score automatically but no correct answer was given, we set processing to 'none' */
					$field->processing = 'none';
				}
				/* remove any entries which are not real fields (e.g. metafields) */
				if ($field->category === 'fields') {
					$cleanedFields->$k = $field;
				}
			}
		}
		$results['data']['fields'] = $cleanedFields;

		if (!isset($results['data']['parserErrors'])) {
			$results['data']['parserErrors'] = [];
		}
		$results['data']['parserErrors'] = array_merge($results['data']['parserErrors'], $errors);
		return ($results['data']);
	}

	static function fetchAnswersData(int $passwordId, int $testId, rixPDO &$db): array
	{
		$query = "SELECT itemId, fieldId, value FROM answers WHERE passwordId=? AND testId=?";
		$results = $db->fetchColumn($query, [$passwordId, $testId], 'itemId', 'fieldId');
		return ($results['data']);
	}

	/* get the max score for a single page that is not necessarily included in a test yet */
	static function fetchPageMaxScore(int $itemId, rixPDO &$db): float|int
	{
		$itemData = self::fetchItemData($itemId, $db);
		if (!$itemData || !is_array($itemData['fields'])) {
			return 0;
		}
		if (count($itemData['fields']) === 0) {
			return 0;
		}

		$maxScore = 0;
		foreach ($itemData['fields'] as $field) {
			if (!isset($field['processing'])) {
				continue;
			}
			$processing = $field['processing'];
			if ($field['category'] !== 'fields' && $processing !== 'auto' && $processing !== "manual") {
				continue;
			}
			if ($processing === "manual") {
				$correction = ['data' => "", 'format' => VALUES_UNDEFINED];
			} else {
				if (!empty($field['correction']['data'])) {
					$correction = $field['correction'];
				} else {
					continue;
				}
			}
			if (!empty($field['score'])) {
				$scoringModel = $field['score'];
			} else {
				$scoringModel = null;
			}

			$maxScore += self::maxScore($processing, $correction, $scoringModel);
		}

		return $maxScore;
	}

	/* get the max score for a single field */
	static function maxScore(string $processing, array $correction, ?array $model): float
	{
		if (!$model) {
			$model = [
				'maximum' => 1,
				'initial' => 0,
				'correct' => 1,
				'wrong' => 0,
				'missing' => 0
			];
		}

		if ($processing === 'auto') {
			$maxScore = match ($correction['format']) {
				VALUES_INT, VALUES_DOUBLE, VALUES_STRING, VALUES_RANGE => max(0, $model['initial'] + $model['correct']),
				VALUES_STRING_ARRAY => max(0, $model['initial'] + count($correction['data']) * $model['correct']),
				default => 0
			};
		} else {
			if ($processing === 'manual') {
				$maxScore = $model['maximum'];
			} else {
				$maxScore = 0;
			}
		}

		return $maxScore;
	}
}
