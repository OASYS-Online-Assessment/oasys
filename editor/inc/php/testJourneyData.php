<?php

/* Shared Test Journey data helpers used by Results and Activity Tracker. */

function journeyBuildDetailResponse(int $passwordId, int $testId, rixPDO &$db, array &$returnData): void
{
	global $uiLang;
	$activity = $db->fetchRow(
		"SELECT
			activity.*,
			CAST(activity.tsLoginServer AS CHAR) AS tsLoginServerChar,
			CAST(activity.tsFirstLoginServer AS CHAR) AS tsFirstLoginServerChar,
			CAST(activity.tsActiveServer AS CHAR) AS tsActiveServerChar,
			TIMESTAMPDIFF(SECOND, activity.tsActiveServer, NOW()) AS silenceSeconds,
			logins.name AS loginName,
			logins.displayName,
			logins.info,
			logins.loginType,
			logins.template AS loginTemplate,
			logins.parentTemplateId,
			parentTemplate.name AS parentTemplateName,
			parentTemplate.displayName AS parentTemplateDisplayName,
			passwords.tag AS passwordTag,
			passwords.label AS passwordLabel,
			passwords.name AS passwordName,
			tests.name AS testName
		FROM activity
		JOIN logins ON logins.id = activity.loginId
		LEFT JOIN logins parentTemplate ON parentTemplate.id = logins.parentTemplateId
		JOIN passwords ON passwords.id = activity.passwordId
		JOIN tests ON tests.id = activity.testId
		WHERE activity.passwordId = ? AND activity.testId = ?
		LIMIT 1",
		[$passwordId, $testId]
	);

	if (($activity['rows'] ?? 0) === 0) {
		$returnData['error'] = $uiLang->translate("No activity found for this test taker.");
		return;
	}

	$events = journeyFetchEvents($passwordId, $testId, $db);
	$answers = journeyFetchFinalAnswers($passwordId, $testId, $db);
	$pageMap = journeyBuildPageMap($testId, $passwordId, $events, $answers, $db, $returnData);
	if (!empty($returnData['error'])) return;
	$analysis = journeyBuildAnalysis($events, $answers, $pageMap);
	$currentSessionCompletion = journeyCurrentSessionCompletionFlags($events);
	$score = journeyFetchScore($passwordId, $testId, $db);
	$row = $activity['data'];

	$returnData['data'] = [
		'summary' => [
			'testId' => $testId,
			'testName' => $row['testName'],
			'loginId' => (int)$row['loginId'],
			'passwordId' => $passwordId,
			'loginName' => $row['loginName'],
			'displayName' => $row['displayName'],
			'loginType' => $row['loginType'],
			'loginTemplate' => $row['loginTemplate'],
			'parentTemplateId' => is_null($row['parentTemplateId']) ? null : (int)$row['parentTemplateId'],
			'parentTemplateName' => $row['parentTemplateName'],
			'parentTemplateDisplayName' => $row['parentTemplateDisplayName'],
			'passwordTag' => $row['passwordTag'],
			'passwordLabel' => $row['passwordLabel'],
			'passwordName' => journeyDecryptPasswordName($row['passwordName']),
			'status' => journeyStatusLabel(
				$row['timeLeft'],
				(int)$row['clientOpen'],
				$currentSessionCompletion['ended'],
				$currentSessionCompletion['timeUp'],
				is_null($row['silenceSeconds']) ? null : (int)$row['silenceSeconds'],
				$currentSessionCompletion['lifecycle'],
				is_null($row['timeLimit']) ? null : (int)$row['timeLimit']
			),
			'lifecycleTimestamp' => $currentSessionCompletion['timestamp'],
			'timeLimit' => is_null($row['timeLimit']) ? null : (int)$row['timeLimit'],
			'timeLeft' => journeyFormatSeconds($row['timeLeft']),
			'timeLeftRaw' => is_null($row['timeLeft']) ? null : (int)$row['timeLeft'],
			'timeLeftAtLogin' => is_null($row['timeLeftAtLogin']) ? null : (int)$row['timeLeftAtLogin'],
			'progress' => is_null($row['progress']) ? null : round(((float)$row['progress']) * 100, 1),
			'currentItem' => $row['currentItem'],
			'language' => $row['language'],
			'clientOpen' => (int)$row['clientOpen'],
			'serialNumber' => $row['serialNumber'],
			'lastPayloadId' => is_null($row['lastPayloadId']) ? null : (int)$row['lastPayloadId'],
			'lastEventId' => is_null($row['lastEventId']) ? null : (int)$row['lastEventId'],
			'tsLoginServer' => $row['tsLoginServerChar'],
			'tsFirstLoginServer' => $row['tsFirstLoginServerChar'],
			'tsActiveServer' => $row['tsActiveServerChar'],
			'info' => journeyDecodeJson($row['info']),
			'metaData' => journeyDecodeJson($row['metaData']),
			'instructions' => journeyDecodeJson($row['instructions']),
			'score' => $score
		],
		'pages' => array_values($pageMap),
		'finalAnswers' => $analysis['finalAnswers'],
		'answerHistory' => $analysis['answerHistory'],
		'pageStats' => $analysis['pageStats'],
		'eventCounts' => $analysis['eventCounts'],
		'flags' => $analysis['flags'],
		'timeline' => $analysis['timeline']
	];
}

function journeyFetchEventStatsByPassword(int $testId, rixPDO &$db): array
{
	$rows = $db->fetchTable(
		"SELECT
			behaviour.passwordId,
			COUNT(*) AS eventCount,
			SUM(eventType = 'answer') AS answerEventCount,
			SUM(eventType = 'behaviour') AS behaviourEventCount,
			SUM(eventType = 'behaviour' AND subType = 'navigation') AS navigationCount,
			SUM(
				behaviour.subType = 'endTest'
				AND (currentSession.lastLoginServer IS NULL OR behaviour.tsServer >= currentSession.lastLoginServer)
			) AS endedCount,
			SUM(
				behaviour.subType = 'timeUp'
				AND (currentSession.lastLoginServer IS NULL OR behaviour.tsServer >= currentSession.lastLoginServer)
			) AS timeUpCount,
			COUNT(DISTINCT itemId) AS pageCount,
			CAST(MIN(tsClient) AS CHAR) AS firstEvent,
			CAST(MAX(tsClient) AS CHAR) AS lastEvent
		FROM behaviour
		LEFT JOIN (
			SELECT passwordId, MAX(tsServer) AS lastLoginServer
			FROM behaviour
			WHERE testId = ? AND eventType = 'behaviour' AND subType = 'login'
			GROUP BY passwordId
		) currentSession ON currentSession.passwordId = behaviour.passwordId
		WHERE behaviour.testId = ?
		GROUP BY behaviour.passwordId",
		[$testId, $testId]
	)['data'] ?? [];

	$stats = [];
	foreach ($rows as $row) {
		$stats[(int)$row['passwordId']] = $row;
	}
	return $stats;
}

function journeyFetchLifecycleByPassword(int $testId, rixPDO &$db): array
{
	$events = "'login','endTest','timeUp','navigatedPastEnd','adminCloseTest','scoringStarted','leaveTest','closeWindow','resumeTest','forceLogoff','reopenTest'";
	$rows = $db->fetchTable(
		"SELECT behaviour.passwordId, behaviour.subType
		 FROM behaviour
		 JOIN (
			 SELECT passwordId, MAX(eventId) AS eventId
			 FROM behaviour
			 WHERE testId = ? AND eventType = 'behaviour' AND subType IN ($events)
			 GROUP BY passwordId
		 ) latest ON latest.passwordId = behaviour.passwordId AND latest.eventId = behaviour.eventId
		 WHERE behaviour.testId = ?",
		[$testId, $testId]
	)['data'] ?? [];

	$lifecycle = [];
	foreach ($rows as $row) $lifecycle[(int)$row['passwordId']] = (string)$row['subType'];
	return $lifecycle;
}

function journeyFetchAnswerCountsByPassword(int $testId, rixPDO &$db): array
{
	$rows = $db->fetchTable(
		"SELECT passwordId, COUNT(*) AS answerCount
		FROM answers
		WHERE testId = ?
		GROUP BY passwordId",
		[$testId]
	)['data'] ?? [];

	$counts = [];
	foreach ($rows as $row) {
		$counts[(int)$row['passwordId']] = (int)$row['answerCount'];
	}
	return $counts;
}

function journeyEmptyEventStats(): array
{
	return [
		'eventCount' => 0,
		'answerEventCount' => 0,
		'behaviourEventCount' => 0,
		'navigationCount' => 0,
		'endedCount' => 0,
		'timeUpCount' => 0,
		'pageCount' => 0,
		'firstEvent' => null,
		'lastEvent' => null
	];
}

function journeyFetchEvents(int $passwordId, int $testId, rixPDO &$db): array
{
	return $db->fetchTable(
		"SELECT
			CAST(tsServer AS CHAR) AS tsServer,
			CAST(tsClient AS CHAR) AS tsClient,
			timeLeft,
			eventId,
			itemId,
			language,
			eventType,
			subType,
			data
		FROM behaviour
		WHERE passwordId = ? AND testId = ?
		ORDER BY COALESCE(tsClient, tsServer), tsServer, eventId",
		[$passwordId, $testId]
	)['data'] ?? [];
}

function journeyFetchFinalAnswers(int $passwordId, int $testId, rixPDO &$db): array
{
	return $db->fetchTable(
		"SELECT
			itemId,
			fieldId,
			fieldType,
			language,
			value,
			CAST(tsClient AS CHAR) AS tsClient,
			CAST(tsServer AS CHAR) AS tsServer
		FROM answers
		WHERE passwordId = ? AND testId = ?
		ORDER BY itemId, fieldId",
		[$passwordId, $testId]
	)['data'] ?? [];
}

function journeyBuildPageMap(int $testId, int $passwordId, array $events, array $answers, rixPDO &$db, array &$returnData): array
{
	$ids = [];
	$orderHints = [];

	$cached = $db->fetchValue("SELECT structure FROM testCache WHERE passwordId = ? AND testId = ?", [$passwordId, $testId])['data'] ?? null;
	$cachedStructure = journeyDecodeJson($cached);
	if (is_array($cachedStructure)) {
		foreach ($cachedStructure as $idx => $cachedItem) {
			if (!isset($cachedItem['hiddenID'])) continue;
			$itemId = (int)$cachedItem['hiddenID'];
			$ids[$itemId] = true;
			$orderHints[$itemId] = min($orderHints[$itemId] ?? PHP_INT_MAX, $idx);
		}
	}

	$scoringData = journeyFetchStoredScoringData($passwordId, $testId, $db);
	$scoringOrderOffset = count($orderHints) + 1000;
	foreach (($scoringData['scoringAnswerList'] ?? []) as $pageId => $pageValues) {
		$itemId = (int)$pageId;
		if ($itemId <= 0) continue;
		$ids[$itemId] = true;
		$sortOrder = is_array($pageValues) && isset($pageValues['sortOrder']) ? (int)$pageValues['sortOrder'] : $scoringOrderOffset++;
		$orderHints[$itemId] = min($orderHints[$itemId] ?? PHP_INT_MAX, $sortOrder);
	}

	$eventOrderOffset = count($orderHints) + 2000;
	foreach ($events as $event) {
		if (empty($event['itemId'])) continue;
		$itemId = (int)$event['itemId'];
		$ids[$itemId] = true;
		if (!isset($orderHints[$itemId])) $orderHints[$itemId] = $eventOrderOffset++;
	}

	$answerOrderOffset = count($orderHints) + 3000;
	foreach ($answers as $answer) {
		if (empty($answer['itemId'])) continue;
		$itemId = (int)$answer['itemId'];
		$ids[$itemId] = true;
		if (!isset($orderHints[$itemId])) $orderHints[$itemId] = $answerOrderOffset++;
	}

	$pageMap = [];
	$order = 0;
	foreach (array_keys($ids) as $itemId) {
		$item = getItemData($itemId, $db, $returnData);
		if (!is_array($item)) continue;
		$metadata = journeyItemMetadata($item);
		$isStimulus = (($metadata['useAsStimulus'] ?? false) === true);
		$linkedStimulusId = !empty($item['link']) ? (int)$item['link'] : null;
		$fields = journeyExtractFields($item);
		$structureMismatches = journeyAnswerStructureMismatches($itemId, $answers, $fields);

		$pageMap[$itemId] = [
			'id' => (int)$item['id'],
			'order' => ++$order,
			'name' => $item['name'] ?? '',
			'code' => $item['itemCode'] ?? '',
			'languages' => $item['languages'] ?? [],
			'content' => journeyExtractPageContent($item),
			'fields' => $fields,
			'isStimulus' => $isStimulus,
			'linkedStimulusId' => $linkedStimulusId,
			'linkedStimulusName' => $linkedStimulusId ? journeyFetchItemName($linkedStimulusId, $db) : null,
			'isNavigable' => !$isStimulus,
			'inStructure' => false,
			'inCache' => journeyCachedContains($cachedStructure, $itemId),
			'structureMismatch' => !empty($structureMismatches),
			'structureMismatchFields' => $structureMismatches
		];
	}

	uasort($pageMap, static function ($a, $b) use ($orderHints) {
		$ai = $orderHints[(int)$a['id']] ?? PHP_INT_MAX;
		$bi = $orderHints[(int)$b['id']] ?? PHP_INT_MAX;
		if ($ai === $bi) return $a['id'] <=> $b['id'];
		return $ai <=> $bi;
	});

	$i = 0;
	foreach ($pageMap as &$page) $page['order'] = ++$i;
	unset($page);

	return $pageMap;
}

function journeyFetchStoredScoringData(int $passwordId, int $testId, rixPDO &$db): array
{
	$stored = $db->fetchValue("SELECT scoringData FROM scoring WHERE passwordId = ? AND testId = ?", [$passwordId, $testId])['data'] ?? null;
	$decoded = journeyDecodeJson($stored);
	return is_array($decoded) ? $decoded : [];
}

function journeyItemMetadata(array $item): array
{
	$metadata = journeyDecodeJson($item['metadata'] ?? null);
	if (is_object($metadata)) $metadata = (array)$metadata;
	return is_array($metadata) ? $metadata : [];
}

function journeyFetchItemName(int $itemId, rixPDO &$db): ?string
{
	$name = $db->fetchValue("SELECT name FROM items WHERE id = ?", [$itemId])['data'] ?? null;
	return $name === null ? null : (string)$name;
}

function journeyCurrentSessionCompletionFlags(array $events): array
{
	$flags = ['ended' => false, 'timeUp' => false, 'lifecycle' => null, 'timestamp' => null];
	$lastLoginServer = null;
	foreach ($events as $event) {
		if ((string)($event['subType'] ?? '') !== 'login') continue;
		$tsServer = (string)($event['tsServer'] ?? '');
		if ($tsServer !== '' && ($lastLoginServer === null || $tsServer > $lastLoginServer)) {
			$lastLoginServer = $tsServer;
		}
	}
	foreach ($events as $event) {
		$tsServer = (string)($event['tsServer'] ?? '');
		if ($lastLoginServer !== null && ($tsServer === '' || $tsServer < $lastLoginServer)) continue;
		$subType = (string)($event['subType'] ?? '');
		if (journeyIsLifecycleEvent($subType)) {
			$flags['lifecycle'] = $subType;
			$flags['timestamp'] = $event['tsServer'] ?? $event['tsClient'] ?? null;
		}
		if ($subType === 'endTest') {
			$flags['ended'] = true;
		} elseif ($subType === 'timeUp') {
			$flags['timeUp'] = true;
		}
	}
	return $flags;
}

function journeyIsLifecycleEvent(string $subType): bool
{
	return in_array($subType, [
		'login', 'endTest', 'timeUp', 'navigatedPastEnd', 'adminCloseTest',
		'scoringStarted', 'leaveTest', 'closeWindow', 'resumeTest', 'forceLogoff', 'reopenTest'
	], true);
}

function journeyBuildAnalysis(array $events, array $answers, array $pageMap): array
{
	$timeline = [];
	$pageStats = [];
	$answerHistory = [];
	$finalAnswers = [];
	$eventCounts = ['total' => count($events), 'types' => [], 'subTypes' => []];
	$flags = [
		'ended' => false,
		'timeUp' => false,
		'closedWindow' => false,
		'leftTest' => false,
		'adminClosed' => false,
		'scoringClosed' => false,
		'forcedLogoff' => false,
		'reopened' => false,
		'navigatedPastEnd' => false,
		'resumeCount' => 0,
		'languageSwitches' => 0,
		'scriptingEvents' => 0,
		'mediaEvents' => 0
	];

	foreach ($pageMap as $pageId => $page) {
		$pageStats[$pageId] = [
			'itemId' => (int)$pageId,
			'name' => $page['name'],
			'code' => $page['code'],
			'isStimulus' => (bool)($page['isStimulus'] ?? false),
			'linkedStimulusId' => $page['linkedStimulusId'] ?? null,
			'linkedStimulusName' => $page['linkedStimulusName'] ?? null,
			'isNavigable' => (bool)($page['isNavigable'] ?? true),
			'visits' => 0,
			'timeSpent' => 0,
			'answerEvents' => 0,
			'finalAnswerCount' => 0,
			'firstEvent' => null,
			'lastEvent' => null
		];
	}

	foreach ($answers as $answer) {
		$itemId = (int)$answer['itemId'];
		$fieldId = (string)$answer['fieldId'];
		if (!isset($finalAnswers[$itemId])) $finalAnswers[$itemId] = [];
		$finalAnswers[$itemId][$fieldId] = [
			'itemId' => $itemId,
			'fieldId' => $fieldId,
			'fieldType' => $answer['fieldType'],
			'language' => $answer['language'],
			'value' => journeyNormalizeValue($answer['value']),
			'tsClient' => $answer['tsClient'],
			'tsServer' => $answer['tsServer']
		];
		if (isset($pageStats[$itemId])) $pageStats[$itemId]['finalAnswerCount']++;
	}

	$prev = null;
	$lastVisitedItem = null;
	$navigationIndexMap = journeyBuildNavigationIndexMap($events);
	foreach ($events as $event) {
		$itemId = is_null($event['itemId']) ? null : (int)$event['itemId'];
		$data = journeyDecodeJson($event['data']);
		$type = (string)($event['eventType'] ?? '');
		$subType = (string)($event['subType'] ?? '');

		$eventCounts['types'][$type] = ($eventCounts['types'][$type] ?? 0) + 1;
		$eventCounts['subTypes'][$subType] = ($eventCounts['subTypes'][$subType] ?? 0) + 1;

		if ($subType === 'endTest') $flags['ended'] = true;
		if ($subType === 'timeUp') $flags['timeUp'] = true;
		if ($subType === 'closeWindow') $flags['closedWindow'] = true;
		if ($subType === 'leaveTest') $flags['leftTest'] = true;
		if ($subType === 'adminCloseTest') $flags['adminClosed'] = true;
		if ($subType === 'scoringStarted') $flags['scoringClosed'] = true;
		if ($subType === 'forceLogoff') $flags['forcedLogoff'] = true;
		if ($subType === 'reopenTest') $flags['reopened'] = true;
		if ($subType === 'navigatedPastEnd') $flags['navigatedPastEnd'] = true;
		if ($subType === 'resumeTest') $flags['resumeCount']++;
		if ($subType === 'language') $flags['languageSwitches']++;
		if ($subType === 'scripting') $flags['scriptingEvents']++;
		if (in_array($subType, ['startPlayback', 'pausePlayback', 'endPlayback', 'playbackEnded'], true)) $flags['mediaEvents']++;

		$currentStartsSession = in_array($subType, ['login', 'resumeTest', 'reopenTest'], true);
		$previousEndsSession = $prev && in_array((string)($prev['subType'] ?? ''), ['closeWindow', 'leaveTest', 'endTest', 'timeUp', 'navigatedPastEnd', 'adminCloseTest', 'scoringStarted', 'forceLogoff'], true);
		$delta = ($currentStartsSession || $previousEndsSession)
			? null
			: journeySecondsBetween($prev['tsClient'] ?? null, $event['tsClient'] ?? null);
		if ($currentStartsSession) $lastVisitedItem = null;
		if ($prev && $delta !== null && $delta >= 0 && $delta <= 28800) {
			$prevItemId = is_null($prev['itemId']) ? null : (int)$prev['itemId'];
			if ($prevItemId && isset($pageStats[$prevItemId])) {
				$pageStats[$prevItemId]['timeSpent'] += $delta;
			}
		}

		if ($itemId && isset($pageStats[$itemId])) {
			if ($lastVisitedItem !== $itemId) {
				$pageStats[$itemId]['visits']++;
				$lastVisitedItem = $itemId;
			}
			if ($pageStats[$itemId]['firstEvent'] === null) $pageStats[$itemId]['firstEvent'] = $event['tsClient'];
			$pageStats[$itemId]['lastEvent'] = $event['tsClient'];
		}

		$interpreted = journeyInterpretEvent($event, $data, $pageMap, $navigationIndexMap);
		$timeline[] = [
			'eventId' => (int)$event['eventId'],
			'tsClient' => $event['tsClient'],
			'tsServer' => $event['tsServer'],
			'timeLeft' => journeyFormatSeconds($event['timeLeft']),
			'timeLeftRaw' => is_null($event['timeLeft']) ? null : (int)$event['timeLeft'],
			'itemId' => $itemId,
			'pageName' => ($itemId && isset($pageMap[$itemId])) ? $pageMap[$itemId]['name'] : '',
			'language' => $event['language'],
			'eventType' => $type,
			'subType' => $subType,
			'label' => $interpreted['label'],
			'detail' => $interpreted['detail'],
			'data' => $data,
			'secondsSincePrevious' => $delta
		];

		if ($type === 'answer') {
			$fieldId = (string)($data['fieldId'] ?? '');
			if ($itemId && $fieldId !== '') {
				if (!isset($answerHistory[$itemId])) $answerHistory[$itemId] = [];
				if (!isset($answerHistory[$itemId][$fieldId])) $answerHistory[$itemId][$fieldId] = [];
				$answerHistory[$itemId][$fieldId][] = [
					'eventId' => (int)$event['eventId'],
					'tsClient' => $event['tsClient'],
					'tsServer' => $event['tsServer'],
					'language' => $event['language'],
					'fieldType' => $subType,
					'editInProgress' => (bool)($data['editInProgress'] ?? false),
					'value' => journeyNormalizeValue($data['value'] ?? null)
				];
				if (isset($pageStats[$itemId])) $pageStats[$itemId]['answerEvents']++;
			}
		}

		$prev = $event;
	}

	foreach ($pageStats as &$stats) {
		$stats['timeSpentLabel'] = journeyFormatDuration((float)$stats['timeSpent']);
		$stats['timeSpent'] = round((float)$stats['timeSpent'], 3);
	}
	unset($stats);

	return [
		'timeline' => $timeline,
		'pageStats' => array_values($pageStats),
		'answerHistory' => $answerHistory,
		'finalAnswers' => $finalAnswers,
		'eventCounts' => $eventCounts,
		'flags' => $flags
	];
}

function journeyFetchScore(int $passwordId, int $testId, rixPDO &$db): array
{
	$row = $db->fetchRow(
		"SELECT finalScore, points, scoringData, givenScoringData
		FROM scoring
		WHERE passwordId = ? AND testId = ?
		LIMIT 1",
		[$passwordId, $testId]
	);
	if (($row['rows'] ?? 0) === 0) {
		return ['available' => false];
	}
	$given = journeyDecodeJson($row['data']['givenScoringData']);
	$scoringData = journeyDecodeJson($row['data']['scoringData']);
	$breakdown = journeyBuildScoreBreakdown($passwordId, $testId, is_array($scoringData) ? $scoringData : [], $db);
	return [
		'available' => true,
		'finalScore' => $row['data']['finalScore'],
		'points' => $row['data']['points'],
		'achievedPoints' => $breakdown['achievedPoints'],
		'possiblePoints' => $breakdown['possiblePoints'],
		'manualPossiblePoints' => $breakdown['manualPossiblePoints'],
		'autoPossiblePoints' => $breakdown['autoPossiblePoints'],
		'manualItemsTotal' => $breakdown['manualItemsTotal'],
		'manualItemsProcessed' => $breakdown['manualItemsProcessed'],
		'manualItemsOpen' => $breakdown['manualItemsOpen'],
		'manualComplete' => $breakdown['manualComplete'],
		'manualScores' => journeyCountNestedKey($given, 'score'),
		'comments' => journeyCountNestedKey($given, 'comment')
	];
}

function journeyBuildScoreBreakdown(int $passwordId, int $testId, array $scoringData, rixPDO &$db): array
{
	$breakdown = [
		'achievedPoints' => null,
		'possiblePoints' => null,
		'manualPossiblePoints' => 0.0,
		'autoPossiblePoints' => 0.0,
		'manualItemsTotal' => 0,
		'manualItemsProcessed' => 0,
		'manualItemsOpen' => 0,
		'manualComplete' => true
	];

	$manualFields = [];
	foreach (($scoringData['scoringAnswerList'] ?? []) as $pageId => $pageValues) {
		if (!is_array($pageValues)) continue;
		foreach ($pageValues as $fieldId => $itemValues) {
			if (in_array($fieldId, ['pageName', 'sortOrder'], true) || !is_array($itemValues)) continue;
			if (($itemValues['itemScoreType'] ?? '') !== 'manual') continue;
			$manualFields[(int)$pageId][(string)$fieldId] = true;
			$breakdown['manualItemsTotal']++;
			if ((int)($itemValues['touched'] ?? 0) === 1) {
				$breakdown['manualItemsProcessed']++;
			} else {
				$breakdown['manualItemsOpen']++;
			}
		}
	}
	$breakdown['manualComplete'] = $breakdown['manualItemsOpen'] === 0;

	try {
		$scoring = new OasysScoring($testId, $db, $passwordId);
		$scoring->populateAnswers();
		$shownPages = $scoring->getItemsShown($passwordId);
		foreach ($shownPages as $pageId) {
			$assignment = $scoring->buildAstruct((int)$pageId);
			foreach ($assignment as $fieldId => $fieldInfo) {
				$points = (float)($fieldInfo['posPts'] ?? 0);
				if (isset($manualFields[(int)$pageId][(string)$fieldId])) {
					$breakdown['manualPossiblePoints'] += $points;
				} else {
					$breakdown['autoPossiblePoints'] += $points;
				}
			}
		}
	} catch (Throwable $e) {
		// Keep the rest of the journey available if a scoring definition was changed or removed.
	}

	$pointsText = $db->fetchValue("SELECT points FROM scoring WHERE passwordId = ? AND testId = ?", [$passwordId, $testId])['data'] ?? '';
	if (is_string($pointsText) && preg_match('/^\s*([0-9]+(?:\.[0-9]+)?)\s*\/\s*([0-9]+(?:\.[0-9]+)?)/', $pointsText, $matches)) {
		$breakdown['achievedPoints'] = (float)$matches[1];
		$breakdown['possiblePoints'] = (float)$matches[2];
	}

	$breakdown['manualPossiblePoints'] = round($breakdown['manualPossiblePoints'], 3);
	$breakdown['autoPossiblePoints'] = round($breakdown['autoPossiblePoints'], 3);
	return $breakdown;
}

function journeyExtractPageContent(array $item): array
{
	$out = [];
	$blocks = $item['blocks'] ?? [];
	if (!is_array($blocks)) return $out;

	foreach ($blocks as $blockNumber => $block) {
		if (!is_array($block)) continue;
		$text = journeyExtractTextFromArray($block);
		$out[] = [
			'id' => $block['id'] ?? '',
			'type' => $block['type'] ?? '',
			'text' => $text,
			'preview' => $block,
			'fieldIds' => journeyCompiledBlockFieldIds($item, $blockNumber)
		];
	}
	return $out;
}

/**
 * Legacy Advanced Editor fields without an explicit GROUP/ID receive generated
 * names (for example rbGroup_1). The original source cannot reliably associate
 * those names with a block, but the compiled source contains the exact data-id.
 */
function journeyCompiledBlockFieldIds(array $item, $blockNumber): array
{
	$parsed = $item['parsed'] ?? [];
	if (!is_array($parsed)) return [];

	$fieldIds = [];
	$blockNumber = preg_quote((string)$blockNumber, '/');
	foreach ($parsed as $compiledSource) {
		if (!is_string($compiledSource) || $compiledSource === '') continue;
		if (!preg_match("/<!--\\s*block\\s+$blockNumber\\s+start\\s*-->(.*?)<!--\\s*block\\s+$blockNumber\\s+end\\s*-->/is", $compiledSource, $blockMatch)) {
			continue;
		}
		if (!preg_match_all("/\\bdata-id\\s*=\\s*['\"]([a-f0-9]+)['\"]/i", $blockMatch[1], $idMatches)) {
			continue;
		}
		foreach ($idMatches[1] as $encodedId) {
			if ((strlen($encodedId) % 2) !== 0 || !ctype_xdigit($encodedId)) continue;
			$decodedId = hex2bin($encodedId);
			if ($decodedId !== false && $decodedId !== '') $fieldIds[$decodedId] = true;
		}
	}

	return array_keys($fieldIds);
}

function journeyExtractFields(array $item): array
{
	$out = [];
	$fields = $item['fields'] ?? [];
	if (!is_array($fields)) return $out;
	foreach ($fields as $fieldKey => $field) {
		if (!is_array($field)) continue;
		if (($field['category'] ?? 'fields') !== 'fields') continue;
		$fieldId = $field['id'] ?? $fieldKey;
		$out[] = [
			'id' => $fieldId,
			'type' => $field['type'] ?? '',
			'required' => (bool)($field['required'] ?? false),
			'processing' => $field['processing'] ?? null,
			'export' => $field['export'] ?? null,
			'label' => journeyExtractTextFromArray($field)
		];
	}
	return $out;
}

function journeyAnswerStructureMismatches(int $itemId, array $answers, array $fields): array
{
	$currentFields = [];
	foreach ($fields as $field) {
		$fieldId = (string)($field['id'] ?? '');
		if ($fieldId === '') continue;
		$currentFields[$fieldId] = $field;
	}

	$mismatches = [];
	foreach ($answers as $answer) {
		if ((int)($answer['itemId'] ?? 0) !== $itemId) continue;
		$fieldId = (string)($answer['fieldId'] ?? '');
		if ($fieldId === '') continue;
		$recordedType = (string)($answer['fieldType'] ?? '');
		$currentType = (string)($currentFields[$fieldId]['type'] ?? '');

		if (!isset($currentFields[$fieldId])) {
			$mismatches[$fieldId] = [
				'fieldId' => $fieldId,
				'recordedType' => $recordedType,
				'currentType' => '',
				'reason' => 'missingField'
			];
			continue;
		}

		if ($recordedType !== '' && $currentType !== '' && journeyNormalizeFieldType($recordedType) !== journeyNormalizeFieldType($currentType)) {
			$mismatches[$fieldId] = [
				'fieldId' => $fieldId,
				'recordedType' => $recordedType,
				'currentType' => $currentType,
				'reason' => 'typeChanged'
			];
		}
	}

	return array_values($mismatches);
}

function journeyNormalizeFieldType(string $type): string
{
	return strtolower(preg_replace('/[^a-z0-9]+/i', '', $type));
}

function journeyExtractTextFromArray(array $value): string
{
	$parts = [];
	journeyCollectText($value, $parts);
	$parts = array_values(array_unique(array_filter(array_map(static function ($text) {
		$text = html_entity_decode(strip_tags((string)$text), ENT_QUOTES | ENT_HTML5, 'UTF-8');
		$text = trim(preg_replace('/\s+/', ' ', $text));
		return mb_substr($text, 0, 600);
	}, $parts))));
	return mb_substr(implode(' / ', array_slice($parts, 0, 8)), 0, 1200);
}

function journeyCollectText($value, array &$parts): void
{
	if (is_scalar($value)) {
		$text = trim((string)$value);
		if ($text !== '' && !is_numeric($text) && strlen($text) > 1) $parts[] = $text;
		return;
	}
	if (!is_array($value)) return;

	$langKeys = ['EN', 'DE', 'FR'];
	foreach ($langKeys as $lang) {
		if (isset($value[$lang]) && is_scalar($value[$lang])) {
			journeyCollectText($value[$lang], $parts);
			return;
		}
	}

	$interesting = ['question', 'source', 'label', 'labels', 'text', 'headline', 'name', 'title', 'value', 'rows', 'answers'];
	foreach ($interesting as $key) {
		if (array_key_exists($key, $value)) journeyCollectText($value[$key], $parts);
	}
}

function journeyBuildNavigationIndexMap(array $events): array
{
	$map = [];
	foreach ($events as $event) {
		$itemId = is_null($event['itemId'] ?? null) ? null : (int)$event['itemId'];
		if (!$itemId) continue;
		$data = journeyDecodeJson($event['data'] ?? null);
		if (!is_array($data)) $data = [];
		$subType = (string)($event['subType'] ?? '');
		if ($subType === 'login' && isset($data['item'])) {
			$map[(int)$data['item']] = $itemId;
		}
		if ($subType === 'navigation' && isset($data['currentItem'])) {
			$map[(int)$data['currentItem']] = $itemId;
		}
	}
	return $map;
}

function journeyInterpretEvent(array $event, $data, array $pageMap, array $navigationIndexMap = []): array
{
	$type = (string)($event['eventType'] ?? '');
	$subType = (string)($event['subType'] ?? '');
	$data = is_array($data) ? $data : [];

	if ($type === 'answer') {
		$field = $data['fieldId'] ?? '';
		$value = journeyNormalizeValue($data['value'] ?? null);
		return ['label' => 'Answer saved', 'detail' => trim("$field: $value")];
	}

	switch ($subType) {
		case 'login':
			return ['label' => 'Login', 'detail' => journeyKeyValueSummary($data)];
		case 'navigation':
			$prev = journeyPageByNumber($data['previousItem'] ?? null, $pageMap, $navigationIndexMap);
			$next = journeyPageByNumber($data['currentItem'] ?? null, $pageMap, $navigationIndexMap);
			return ['label' => 'Navigation', 'detail' => trim(($prev ?: 'previous page') . ' -> ' . ($next ?: 'current page'))];
		case 'language':
			return ['label' => 'Language switch', 'detail' => 'Previous language: ' . ($data['previousLanguage'] ?? '')];
		case 'scripting':
			return ['label' => 'Script action', 'detail' => journeyKeyValueSummary($data)];
		case 'resumeTest':
			return ['label' => 'Connection resumed', 'detail' => journeyKeyValueSummary($data)];
		case 'closeWindow':
			return ['label' => 'Window closed', 'detail' => 'The browser window sent a close signal.'];
		case 'leaveTest':
			return ['label' => 'Test left', 'detail' => 'The test taker deliberately returned to the login.'];
		case 'navigatedPastEnd':
			return ['label' => 'Navigated past test end', 'detail' => 'Forced navigation reached beyond the final test page.'];
		case 'adminCloseTest':
			return ['label' => 'Closed by administrator', 'detail' => journeyKeyValueSummary($data)];
		case 'scoringStarted':
			return ['label' => 'Closed for scoring', 'detail' => 'Manual scoring was started for the open test.'];
		case 'forceLogoff':
			return ['label' => 'Forced logout', 'detail' => journeyForceLogoffDetail($data)];
		case 'reopenTest':
			return ['label' => 'Test reopened', 'detail' => journeyKeyValueSummary($data)];
		case 'timeUp':
			return ['label' => 'Time up', 'detail' => 'The timer ended the test.'];
		case 'endTest':
			return ['label' => 'Test finished', 'detail' => 'The test taker ended the test.'];
		case 'resetItem':
			return ['label' => 'Page reset', 'detail' => journeyKeyValueSummary($data)];
		case 'startPlayback':
			return ['label' => 'Media playback started', 'detail' => ''];
		case 'pausePlayback':
			return ['label' => 'Media playback paused', 'detail' => ''];
		case 'endPlayback':
		case 'playbackEnded':
			return ['label' => 'Media playback ended', 'detail' => ''];
		default:
			return ['label' => $subType !== '' ? $subType : $type, 'detail' => journeyKeyValueSummary($data)];
	}
}

function journeyPageByNumber($number, array $pageMap, array $navigationIndexMap = []): string
{
	if ($number === null || $number === '') return '';
	$idx = (int)$number;
	$itemId = $navigationIndexMap[$idx] ?? null;
	if ($itemId && isset($pageMap[$itemId])) return $pageMap[$itemId]['name'] ?? ('Page ' . ($idx + 1));

	$pages = array_values(array_filter($pageMap, static function ($page) {
		return (bool)($page['isNavigable'] ?? true);
	}));
	return $pages[$idx]['name'] ?? ('Page ' . ($idx + 1));
}

function journeyKeyValueSummary($data): string
{
	if (!is_array($data) || empty($data)) return '';
	$parts = [];
	foreach ($data as $key => $value) {
		$parts[] = $key . ': ' . journeyNormalizeValue($value);
	}
	return implode(', ', array_slice($parts, 0, 8));
}

function journeyForceLogoffDetail(array $data): string
{
	$reason = (string)($data['reason'] ?? '');
	if ($reason === 'restriction') {
		$type = (string)($data['restrictionType'] ?? '');
		return $type === '' ? 'A validity restriction forced the logout.' : 'Restriction: ' . $type;
	}
	if ($reason === 'deactivated') return 'The test was manually deactivated.';
	return journeyKeyValueSummary($data);
}

function journeyDecodeJson($value)
{
	if ($value === null || $value === '') return null;
	if (is_array($value)) return $value;
	if (is_object($value)) return (array)$value;
	$decoded = json_decode((string)$value, true);
	return (json_last_error() === JSON_ERROR_NONE) ? $decoded : $value;
}

function journeyNormalizeValue($value): string
{
	if ($value === null) return '';
	if (is_array($value) || is_object($value)) {
		return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
	}
	$decoded = json_decode((string)$value, true);
	if (json_last_error() === JSON_ERROR_NONE && (is_array($decoded) || is_object($decoded))) {
		return json_encode($decoded, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
	}
	return (string)$value;
}

function journeyFormatSeconds($seconds): string
{
	if ($seconds === null) return '';
	$seconds = (int)$seconds;
	if ($seconds < 0) return 'unlimited';
	return journeyFormatDuration($seconds);
}

function journeyFormatDuration(float $seconds): string
{
	$seconds = max(0, (int)round($seconds));
	$hours = intdiv($seconds, 3600);
	$minutes = intdiv($seconds % 3600, 60);
	$sec = $seconds % 60;
	if ($hours > 0) return sprintf('%d:%02d:%02d', $hours, $minutes, $sec);
	return sprintf('%02d:%02d', $minutes, $sec);
}

function journeySecondsBetween($start, $end): ?float
{
	if (!$start || !$end) return null;
	try {
		$a = new DateTime((string)$start);
		$b = new DateTime((string)$end);
		return ((float)$b->format('U.u')) - ((float)$a->format('U.u'));
	} catch (Exception $e) {
		return null;
	}
}

function journeyStatusLabel(
	$timeLeft,
	int $clientOpen,
	bool $ended = false,
	bool $timeUp = false,
	?int $silenceSeconds = null,
	?string $lifecycle = null,
	?int $timeLimit = null
): string
{
	$isClosed = $timeLeft !== null && (int)$timeLeft === 0;
	if ($lifecycle === 'adminCloseTest' || $lifecycle === 'scoringStarted') return 'Closed';
	if ($lifecycle === 'forceLogoff') return 'Forced logout';
	if ($lifecycle === 'leaveTest') return 'Left test';
	if ($lifecycle === 'closeWindow') return 'Window closed';
	if ($lifecycle === 'reopenTest') return 'Reopened - waiting for login';
	if ($isClosed && $lifecycle === 'navigatedPastEnd') {
		return ($timeLimit ?? 0) > 0 ? 'Submitted no time left' : 'Submitted by user';
	}
	if ($isClosed && $ended) return 'Submitted by user';
	if ($isClosed && $timeUp) return 'Submitted no time left';
	if ($isClosed) return 'Closed';
	if ($clientOpen !== 1 || ($silenceSeconds !== null && $silenceSeconds > journeyConnectionTimeoutSeconds())) {
		return 'Offline / connection lost';
	}
	if ($timeLeft !== null && (int)$timeLeft < 0) return 'Active no time limit';
	return 'Active';
}

function journeyConnectionTimeoutSeconds(): int
{
	global $settings;
	$retryCount = max(1, (int)($settings['retryCount'] ?? 3));
	$sendFrequency = max(1, (int)($settings['sendFrequency'] ?? 15));
	return max(1, $retryCount * $sendFrequency);
}

function journeyDecryptPasswordName($value): string
{
	if ($value === null || $value === '') return '';
	try {
		return Crypt::decryptString($value);
	} catch (Throwable $e) {
		return '';
	}
}

function journeyCachedContains($cachedStructure, int $itemId): bool
{
	if (!is_array($cachedStructure)) return false;
	foreach ($cachedStructure as $item) {
		if (isset($item['hiddenID']) && (int)$item['hiddenID'] === $itemId) return true;
	}
	return false;
}

function journeyCountNestedKey($value, string $key): int
{
	if (!is_array($value)) return 0;
	$count = 0;
	foreach ($value as $k => $v) {
		if ($k === $key) $count++;
		if (is_array($v)) $count += journeyCountNestedKey($v, $key);
	}
	return $count;
}

/**
 * Takes JS call with *image and report data* payload and generates a PDF report file to send back to the client for download.
 * @param array $data
 * @param rixPDO $db
 * @param array $returnData
 * @return void
 */
