<?php
	/*
 	* subroutines for login process (and some APIs)
 	*/

	require_once __DIR__.'/../../editor/inc/php/MediaTool.php';

	function getActivity($passwordId, $testId, &$db) {
		/** @var rixPDO $db */
		$query = "SELECT loginId, passwordId, testId, timelimit, CAST(tsLoginServer AS CHAR) AS tsLoginServer, CAST(tsActiveServer AS CHAR) AS tsActiveServer, timeLeftAtLogin, timeLeft, serialNumber, lastPayloadId, lastEventId, progress, currentItem, language, clientOpen, metaData FROM activity WHERE passwordId=? AND testId=?";
		$results = $db->fetchRow($query, [$passwordId, $testId]);
		/*
		 * no activity has been found on this test, so this is the first login
		 * "true" is returned, which means the test is still open and can be loaded
		 */
		if ($results['rows'] === 0) {
			return true;
		}

		/*
		 * if activity data has been found, but the test has not been closed yet (timeLeft !== 0)
		 * the details about the activity are returned.
		 *
		 * if the test has already been closed, "false" is returned to indicate this test cannot
		 * be logged into again
		 */
		if ($results['data']['timeLeft'] !== 0) {
			return $results['data'];
		} else {
			return false;
		}

	}

	function getTestAccessData($testId, &$db, &$returnData): array {
		/** @var rixPDO $db */
		$query = "SELECT active, options FROM tests WHERE id=?";
		$results = $db->fetchRow($query, [$testId]);
		if ($results['rows'] === 0) {
			$returnData['error'] = "Error: No test data found for testId = $testId. Cannot proceed!";
			die();
		}
		decodeData($results['data'], 'options');
		if (!isset($results['data']['options']['restrictions'])) {
			$results['data']['options']['restrictions'] = ['dateRange' => false, 'timeRestriction' => false, 'testDays' => false];
		}
		return $results['data'];
	}

	function getTestData($testId, &$db, &$returnData, $passwordId = null) : array {
		/** @var rixPDO $db */
		$query = "SELECT id, active, name, structure, labels, options, variables, skin, metadata FROM tests WHERE id=?";
		$results = $db->fetchRow($query, [$testId]);
		if ($results['rows'] === 0) {
			$returnData['error'] = "Error: No test data found for testId = $testId. Cannot proceed!";
			die();
		}
		decodeData($results['data'], ['structure', 'labels', 'options', 'skin', 'variables', 'metadata']);
		$testData = $results['data'];

		/* test scheduling fallback for pre 3.1 tests */
		if (!isset($testData['options']['forceLogoff'])) {
			$testData['options']['forceLogoff'] = false;
		}
		if (!isset($testData['options']['restrictions'])) {
			$testData['options']['restrictions'] = ['dateRange' => false, 'timeRestriction' => false, 'testDays' => false];
		}

		$structure = $results['data']['structure'];
		if ($structure['type'] === "linear") {
			fetchLinearTestStructure($db, $testData, $structure, $returnData);
		} elseif ($structure['type'] === 'fluid') {
			$testCache = fetchCachedTestData($db, $passwordId, $testId);
			if ($testCache !== null) {
				mergeTestData($testData, $testCache);
			} else {
				fetchFluidTestStructure($db, $testData, $structure);
			}
		} elseif ($structure['type'] === 'mutation') {
			$testCache = fetchCachedTestData($db, $passwordId, $testId);
			if ($testCache !== null) {
				mergeTestData($testData, $testCache);
			} else {
				fetchMutationTestStructure($db, $testData, $structure, $testId, $returnData);
			}
		}

		$testData['items'] = [];
		if (count($testData['structure']['items']) === 0) {
			$returnData['error'] = "Error: No items found in test structure for testId = $testId. Cannot proceed!";
			die();
		}
		foreach ($testData['structure']['items'] as $item) {
			$itemId = $item['hiddenID'];
			if (isset($testData['items'][$itemId])) {
				continue;
			}
			$itemData = getItemData($itemId, $db, $returnData);
			$testData['items'][$itemId] = $itemData;
			$stimulusId = $itemData['link'];
			if ($stimulusId && !isset($testData['items'][$stimulusId])) {
				$testData['items'][$stimulusId] = getItemData($stimulusId, $db, $returnData);
			}
			$scripts = $item['scripts'];
			if (is_array($scripts) && count($scripts) > 0) {
				foreach ($scripts as $context => $script) {
					$testData['items'][$itemId]['scripts']->$context = OasysScriptParser::parse($script);
				}
			}
		}

		return $testData;
	}

	function mergeTestData(&$testData, &$testCache): void {
		//copy structure, skin, labels and variables
		$testData['structure']['items'] = $testCache['structure'];
		$testData['skin'] = $testCache['skin'];
		$testData['labels'] = $testCache['labels'];
		$testData['variables'] = $testCache['variables'];

		//override cached date restriction options …
		$testCache['options']['forceLogoff'] = $testData['options']['forceLogoff'];
		$testCache['options']['restrictions'] = $testData['options']['restrictions'];

		//… then copy options back
		$testData['options'] = $testCache['options'];
	}

	function fetchLinearTestStructure(&$db, &$testData, &$structure, &$returnData): void {
		$testData['items'] = [];
		foreach ($structure['items'] as $item) {
			$itemId = $item['hiddenID'];
			if (isset($testData['items'][$itemId])) {
				continue;
			}
			$itemData = getItemData($itemId, $db, $returnData);
			$testData['items'][$itemId] = $itemData;
			$stimulusId = $itemData['link'];
			if ($stimulusId && !isset($testData['items'][$stimulusId])) {
				$testData['items'][$stimulusId] = getItemData($stimulusId, $db, $returnData);
			}
			$scripts = $item['scripts'];
			if (is_array($scripts) && count($scripts) > 0) {
				foreach ($scripts as $context => $script) {
					$testData['items'][$itemId]['scripts']->$context = OasysScriptParser::parse($script);
				}
			}
		}
	}

	function fetchCachedTestData(&$db, $passwordId, $testId): ?array {
		$testData = null;
		if ($passwordId !== null) {
			$query = "SELECT * FROM testCache WHERE testId = ? AND passwordId = ?";
			$results = $db->fetchRow($query, [$testId, $passwordId]);
			if ($results['rows'] === 1) {
				$testData = [];
				$testData['structure'] = $results['data']['structure'] ? json_decode($results['data']['structure'] ?? '', true) : null;
				$testData['options'] = $results['data']['options'] ? json_decode($results['data']['options'] ?? '', true) : null;
				$testData['skin'] = $results['data']['skin'] ? json_decode($results['data']['skin'] ?? '', true) : null;
				$testData['labels'] = $results['data']['labels'] ? json_decode($results['data']['labels'] ?? '', true) : null;
				$testData['variables'] = $results['data']['variables'] ? json_decode($results['data']['variables'] ?? '', true) : null;
			}
		}
		return $testData;
	}

	function fetchFluidTestStructure(&$db, &$testData, &$structure): void {
		$testData['structure']['items'] = [];
		$testParts = [];
		$testPart = [];
		$prevFixedPosition = true;
		$prevRandomize = false;
		foreach ($structure['items'] as $testBlock) {
			$currFixedPosition = $testBlock['fixedPosition'];
			$blockId = $testBlock['hiddenID'];
			$labelId = $testBlock['labelID'];
			$overrides = $testBlock['overrides'];
			$blockData = getBlockData($blockId, $db, $returnData);
			$currRandomize = ($blockData['random'] == "1");
			$block = $blockData['structure'];
			if ($blockData['numberOfItems'] > count($block['items'])) {
				//if more pages are requested than there are in the pool, the complete pool will be used ...
				$itemKeys = array_keys($block['items']);
			} else {
				//... otherwise the requested number of pages is randomly selected from the pool in original order
				$itemKeys = array_rand($block['items'], $blockData['numberOfItems']);
				if (!is_array($itemKeys)) {
					$itemKeys = [$itemKeys];
				}
			}

			//randomizer engine
			if (count($testPart) > 0) {
				if ($prevFixedPosition === true) {
					//if previous block is fixed …
					if ($prevRandomize === true) {
						//… randomize it if that is required …
						shuffle($testPart);
					}
					//… and add it to the test structure.
					$testData['structure']['items'] = array_merge($testData['structure']['items'], $testPart);
					$testPart = [];
				} else {
					//if previous block is not fixed …
					if ($currFixedPosition === true) {
						//if current block is fixed, add previous pools to structure and clean up
						if ($prevRandomize === true) {
							//if previous block was set to randomize, shuffle it before adding it to the structure
							shuffle($testPart);
						}
						$testParts[] = $testPart;
						shuffle($testParts);
						$testData['structure']['items'] = array_merge($testData['structure']['items'], ...$testParts);
						$testPart = [];
						$testParts = [];
					} else {
						//if neither this nor previous block are fixed
						if ($currRandomize === false) {
							//if this block is not be randomized
							if ($prevRandomize === true) {
								//if previous block was to be randomized shuffle it
								shuffle($testPart);
							}
							//put previous block on hold
							$testParts[] = $testPart;
							$testPart = [];
						} else {
							//current block should be randomized
							if ($prevRandomize === false) {
								//if previous block is not to be randomized, put it on hold
								$testParts[] = $testPart;
								$testPart = [];
							}
							/*  if both previous and current block are not fixed and set to shuffle they will be
								treated as a single block, so that pages of both blocks can mix when being shuffled
								… so no putting a block on hold, nor adding it to the structure yet */
						}
					}
				}
			}

			foreach ($itemKeys as $key) {
				$item = $block['items'][$key];
				$item['labelID'] = $labelId;
				$item['overrides'] = $overrides;
				$testPart[] = $item;
			}

			$prevRandomize = $currRandomize;
			$prevFixedPosition = $currFixedPosition;
		}

		//clean up last block(s)
		if ($prevRandomize === true) {
			shuffle($testPart);
		}

		if ($prevFixedPosition === true) {
			$testData['structure']['items'] = array_merge($testData['structure']['items'], $testPart);
		} else {
			$testParts[] = $testPart;
			//… shuffle the blocks (while preserving the order of the pages inside) …
			shuffle($testParts);
			//… and add all blocks to structure
			$testData['structure']['items'] = array_merge($testData['structure']['items'], ...$testParts);
			unset($testPart);
			unset($testParts);
		}
	}

	function fetchMutationTestStructure(&$db, &$testData, &$structure, $testId, &$returnData): void {
		$testData['structure']['items'] = [];
		$query = "SELECT structure, `options` FROM tests WHERE id = ?";
		$results = $db->fetchRow($query, [$testId]);
		$structure = json_decode($results['data']['structure'] ?? '', true);
		$options = json_decode($results['data']['options'] ?? '', true);
		$mutationsCount = count($structure['items']);
		if ($mutationsCount === 0) {
			return; //empty structure will be returned
		}

		switch ($options['mutationMethod']) {
			case 'random':
				$mutationIndex = rand(0, $mutationsCount - 1);
				break;
			case 'sequential':
				$mutationIndex = $structure['pointer'] ?? 0;
				$newIndex = $mutationIndex + 1;
				if ($mutationIndex >= $mutationsCount) {
					$mutationIndex = 0;
				}

				//count pointer up and update database
				if ($newIndex >= $mutationsCount) {
					$newIndex = 0;
				}
				$query = "UPDATE tests SET structure = JSON_SET(structure, '$.pointer', ?) WHERE id = ?";
				$results = $db->execute($query, [$newIndex, $testId]);
				break;
			default:
				return; //unkown mutation method -> return empty data
		}

		$linearTestId = $structure['items'][$mutationIndex]['hiddenID'];
		$query = "SELECT structure, labels, options, variables, skin FROM tests WHERE id=? AND JSON_VALUE(structure, '$.type') = 'linear'";
		$results = $db->fetchRow($query, [$linearTestId]);
		if ($results['rows'] === 0) {
			return; //linear test does not exist -> return empty data
		}
		decodeData($results['data'], ['structure', 'labels', 'options', 'skin', 'variables']);
		$linearTestData = $results['data'];
		$linearStructure = $results['data']['structure'];
		fetchLinearTestStructure($db, $testData, $linearStructure, $returnData);

		//copy relevant data to $testData
		$testData['mutationId'] = $linearTestId;
		$testData['structure'] = $linearStructure;
		$testData['structure']['type'] = 'mutation';
		$testData['variables'] = $linearTestData['variables'];
		$testData['skin'] = $linearTestData['skin'];
		$testData['labels'] = $linearTestData['labels'];
		//override a few options from mutation test then copy the rest of the options back
		$linearTestData['options']['restrictions'] = $testData['options']['restrictions'];
		$linearTestData['options']['forceLogoff'] = $testData['options']['forceLogoff'];
		$testData['options'] = $linearTestData['options'];
	}

	function fetchItem($itemId, $db, &$returnData): array {
		/** @var rixPDO $db */
		$itemGroup = [];
		$params = [$itemId];

		//get item & stimulus (if linked)
		$query = "SELECT id as hiddenID, name, itemCode, link, languages FROM items WHERE id = ?";
		$results = $db->fetchRow($query, $params);
		if ($results['rows'] === 0) {
			$returnData['error'] = "Error: No data found for item = $itemId. Cannot proceed!";
			die();
		}
		$item = $results['data'];

		$items = [];
		$labels = [];
		$labelId = 1;

		$label = [];
		$label['button'] = [];
		if ($item['itemCode']) {
			$label['button']['EN'] = $item['itemCode'];
		} else {
			$label['button']['EN'] = $item['name'];
		}
		$label['id'] = $labelId;
		$label['headline'] = [];
		$label['headline']['EN'] = $item['name'];
		$labels[$labelId] = $label;
		$item['labelID'] = $labelId;
		$item['overrides'] = [];
		$item['scripts'] = [];
		$items[] = $item;

		$itemGroup['items'] = $items;
		$itemGroup['labels'] = $labels;
		$itemGroup['languages'] = json_decode($item['languages'] ?? '');

		$itemGroup['itemDetails'] = [];
		$itemData = getItemData($itemId, $db, $returnData);
		$itemGroup['itemDetails'][$itemId] = $itemData;
		$stimulusId = $itemData['link'];
		if ($stimulusId && !isset($itemGroup['itemDetails'][$stimulusId])) {
			$itemGroup['itemDetails'][$stimulusId] = getItemData($stimulusId, $db, $returnData);
		}

		return $itemGroup;
	}

	function fetchItemGroup($groupId, $db, &$returnData): array {
		/** @var rixPDO $db */
		$itemGroup = [];
		$params = [$groupId];

		//get all ids of stimuli that are linked to an item (so they are not stand alone screens)
		$query = "SELECT DISTINCT link FROM items WHERE groupId = ?";
		$results = $db->fetchColumn($query, $params);
		$links = $results['data'];
		if ($results['rows'] === 0) {
			$returnData['error'] = "Error: No data found for itemGroup = $groupId. Cannot proceed!";
			die();
		}

		//get all items & stimuli
		$query = "SELECT id, name, itemCode, link, languages FROM items WHERE groupId = ?";
		$results = $db->fetchTable($query, $params, 'id');
		$details = $results['data'];

		//get list of items in alphabetical order
		$query = "SELECT id FROM items WHERE groupId = ? ORDER BY name";
		$results = $db->fetchColumn($query, $params);
		$list = $results['data'];

		$items = [];
		$labels = [];
		$languages = [];
		$labelId = 1;
		foreach ($list as $itemId) {
			$item = [];

			//if the current itemId is a stimulus linked to another item we won't include it into the structure by itself
			if (in_array($itemId, $links)) {
				continue;
			}

			$item['hiddenID'] = $itemId;
			$label = [];
			$label['button'] = [];
			if ($details[$itemId]['itemCode']) {
				$label['button']['EN'] = $details[$itemId]['itemCode'];
			} else {
				$label['button']['EN'] = $details[$itemId]['name'];
			}
			$label['id'] = $labelId;
			$label['headline'] = [];
			$label['headline']['EN'] = $details[$itemId]['name'];
			$labels[$labelId] = $label;
			$item['labelID'] = $labelId++;
			$item['overrides'] = [];
			$item['scripts'] = [];
			$items[] = $item;
			if ($details[$itemId]['languages']) {
				$languages = array_merge($languages, json_decode($details[$itemId]['languages'] ?? ''));
			}
		}

		$itemGroup['items'] = $items;
		$itemGroup['labels'] = $labels;
		$itemGroup['languages'] = $languages;

		$itemGroup['itemDetails'] = [];
		foreach ($itemGroup['items'] as $item) {
			$itemId = $item['hiddenID'];
			if (isset($itemGroup['itemDetails'][$itemId])) {
				continue;
			}
			$itemData = getItemData($itemId, $db, $returnData);
			$itemGroup['itemDetails'][$itemId] = $itemData;
			$stimulusId = $itemData['link'];
			if ($stimulusId && !isset($itemGroup['itemDetails'][$stimulusId])) {
				$itemGroup['itemDetails'][$stimulusId] = getItemData($stimulusId, $db, $returnData);
			}
		}

		return $itemGroup;
	}

	function getBlockData($blockId, &$db, &$returnData) {
		/** @var rixPDO $db */
		$query = <<<QUERY
			SELECT
				testFluidStructure.numberOfItems, 
				testFluidStructure.random, 
				testPools.structure
			FROM
				testFluidStructure
				INNER JOIN
				testPools
				ON 
					testFluidStructure.poolID = testPools.id
			WHERE
				testFluidStructure.id = ?
		QUERY;

		$results = $db->fetchRow($query, [$blockId]);
		if ($results['rows'] === 0) {
			$returnData['error'] = "Error: No block data found for blockId = $blockId. Cannot proceed!";
			die();
		}

		$blockData = $results['data'];
		decodeData($blockData['structure']);

		return $blockData;
	}

	function getItemData($itemId, &$db, &$returnData) {
		/** @var rixPDO $db */
		$query = "SELECT * FROM items WHERE id=?";
		$results = $db->fetchRow($query, [$itemId]);
		if ($results['rows'] === 0) {
			$returnData['error'] = "Error: No item data found for itemId = $itemId. Cannot proceed!";
			die();
		}
		foreach (['parsed', 'fields', 'options', 'scripts'] as $compiledColumn) {
			if (($results['data'][$compiledColumn] ?? null) === null) {
				$returnData['error'] = 'noContent';
				die();
			}
		}
		decodeData($results['data'], ['languages', 'blocks'], false, true);
		decodeData($results['data'], ['fields', 'parsed', 'options', 'scripts', 'metadata'], false, false);

		$mediaTool = new MediaTool();
		//parse media
		$mediaData = $mediaTool->parseBlocks($results['data']['blocks'], $results['data']['languages'], true);
		foreach ($mediaData as $key => $value) {
			$results['data']['metadata']->$key = $value;
		}

		//sanitize parsed html
		if (countObj($results['data']['parsed']) === 0 || countObj($results['data']['parsed'] === false)) {
			$results['data']['parsed'] = ['EN' => "Error [id=$itemId]: no content in this item!"];
		}

		//parse local scripts
		$scripts = $results['data']['scripts'];
		if (is_object($scripts) && countObj($scripts) > 0) {
			foreach ($scripts as $context => $script) {
				$script = OasysScriptParser::parse($script);
				$results['data']['scripts']->$context = $script;
			}
		}

		obfuscateData($results['data']);
		return ($results['data']);
	}

	function getAnswersData($passwordId, $testId, &$db) {
		/** @var rixPDO $db */
		$query = "SELECT itemId, fieldId, value FROM answers WHERE passwordId=? AND testId=?";
		$results = $db->fetchColumn($query, [$passwordId, $testId], 'itemId', 'fieldId');
		return ($results['data']);
	}

	function getSkinFolder($skinName, &$skins, &$returnData): string {
		return $skins[$skinName]['folder'] ?? '';
	}

	function getSkinData($skinName, &$skins, &$returnData): array {
		return ['skin' => $skinName, 'skinOptions' => $skins[$skinName]['options']];
	}

	/*
	 * Remove any data that should not be shown in front end unless we are in debugging mode
	 */
	function obfuscateData(&$data): void
	{
		global $settings;
//		if ($settings['debugSystem'] === true) {
//			return;
//		}
		if (is_object($data['fields'])) {
			foreach ($data['fields'] as $id => $field) {
				unset($data['fields']->$id->correction);
				unset($data['fields']->$id->comment);
			}
		}
	}
