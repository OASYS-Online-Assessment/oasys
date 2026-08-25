<?php

	namespace editor\maintenance;

	use OasysActivity;
	use rixPDO;

	require_once __DIR__ . "/../inc/php/initBackend.php";
	require_once __DIR__ . "/../../inc/php/OasysActivity.php";

	class DataSanitizer
	{
		private array $returnData;

		private rixPDO $db;

		public function __construct(&$returnData)
		{
			global $app;
			$this->returnData = &$returnData;

			//init database connections
			$this->db = $app->getDatabaseInstance();
		}

		public function check($options): void
		{
			//read options into class variables
			$startDate = $options['startDate'] ?? null;
			$endDate = $options['endDate'] ?? null;
			$limitOffset = $options['limitOffset'] ?? null;
			$limitCount = $options['limitCount'] ?? null;

			$activity = new OasysActivity();
			$list = $activity->getActivityList($startDate, $endDate, $limitOffset, $limitCount);
			foreach ($list as $activityRow) {
//				debugArray($activityRow);
				$answers = $activity->getAnswers($activityRow['passwordId'], $activityRow['testId']);
				$filteredAnswers = [];
				foreach ($answers as $pageId => $pageAnswers) {
					$filteredAnswers[$pageId] = filterArrayEntries($pageAnswers, 'fieldType', ['oasysConceptMap']);
					if (count($filteredAnswers[$pageId]) === 0) {
						unset($filteredAnswers[$pageId]);
					}
				}
				$behaviour = $activity->getBehaviour($activityRow['passwordId'], $activityRow['testId']);
//				debugArray($filteredAnswers);
//				debugArray($behaviour);
				$this->returnData['log'][$activityRow['loginId']][$activityRow['passwordId']][$activityRow['testId']] = $this->simulateActivity($activityRow, $filteredAnswers, $behaviour);
			}
		}

		private function simulateActivity($activityRow, $answers, $behaviour): array
		{
			$activeItemId = 0;
			$activeItem = 0;
			$expectedAnswers = [];
			$log = [];
			foreach ($behaviour as $behaviourRow) {
				$type = $behaviourRow['eventType'];
				$subType = $behaviourRow['subType'];
				$previousTS = null;
				$previousEventId = 0;
				$previousTimeLeft = null;
				$useragent = '';
				if ($type === 'behaviour') {
					switch ($subType) {
						case 'login':
							$activeItemId = $behaviourRow['itemId'];
							$data = json_decode($behaviourRow['data'], true);
							if ($useragent !== '' && $useragent !== $data['userAgent']) {
								$this->log($behaviourRow, "Browser switched from '$useragent' to '{$data['userAgent']}'", $log);
							}
							$useragent = $data['userAgent'];
							break;
						case 'closeWindow':
							if ($behaviourRow['itemId'] !== $activeItemId) {
								$this->log($behaviourRow, "Window closed in item with id={$behaviourRow['itemId']} while expected to be in item with id=$activeItemId", $log);
							}
							$activeItemId = 0;
							break;
						case 'navigation':
							$data = json_decode($behaviourRow['data'], true);
							$previousItem = $data['previousItem'];
							$currentItem = $data['currentItem'];
							if ($activeItem !== $previousItem) {
								$this->log($behaviourRow, "Unexplained jump from item $activeItem to $previousItem", $log);
							}
							$activeItem = $currentItem;
							break;
					}
				} elseif ($type === 'answer') {
					$data = json_decode($behaviourRow['data'], true);
					$answer = [];
					$answer['itemId'] = $behaviourRow['itemId'];
					$answer['fieldId'] = $data["fieldId"];
					$answer['fieldType'] = $behaviourRow['subType'];
					$answer['value'] = $data["value"];
					$expectedAnswers[$behaviourRow['itemId']][$data["fieldId"]] = $answer;
				}

				if ($previousTS !== null && $previousTS > $behaviourRow['tsClient']) {
					$this->log($behaviourRow, "Timestamp out of order: $previousTS > {$behaviourRow['tsClient']}", $log);
				}
				$previousTS = $behaviourRow['tsClient'];

				if ($previousEventId >= $behaviourRow['eventId']) {
					$this->log($behaviourRow, "EventId out of order: $previousEventId >= {$behaviourRow['eventId']}", $log);
				}
				$previousEventId = $behaviourRow['eventId'];

				if ($previousTimeLeft !== null && $previousTimeLeft < $behaviourRow['timeLeft']) {
					$this->log($behaviourRow, "Time left increased: $previousTimeLeft < {$behaviourRow['timeLeft']}", $log);
				}

				$activeItemId = $behaviourRow['itemId'];
			}

			$answerComparison = [];
			compareObjects($answers, $expectedAnswers, $answerComparison, 'answers', 'expected');
			if (count($answerComparison) > 0) {
				$log['answers'] = [];
				foreach ($answerComparison as $discrepancy) {
					$log['answers'][] = ['key' => $discrepancy->key, 'expected' => $discrepancy->expected, 'actual' => $discrepancy->answers];
				}
			}

			return $log;
		}

		private function log(&$behaviourRow, $message, &$log): void
		{
			$log['behaviour'][] = ['eventId' => $behaviourRow['eventId'], 'message' => $message];
		}
	}
