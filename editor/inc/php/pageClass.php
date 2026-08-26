<?php

	require_once(__DIR__ . "/../../interactions/InteractionCompiler.php");
	require_once(__DIR__ . "/../../../inc/php/parser.php");
    require_once(__DIR__ . '/registerActivity.php');


class pageClass
	{
		private array $returnData;
		private array $data;
		private rixPDO $db;
		private ?uiLang $uiLang;
		private ?userAuth $myAuth;

		public function __construct(&$returnData, $data = [])
		{
			global $app, $uiLang, $myAuth;
			$this->returnData = &$returnData;
			$this->uiLang = &$uiLang;
			$this->myAuth = &$myAuth;
			$this->data = $data;

			//init database connections
			$this->db = $app->getDatabaseInstance();
		}

		public function execute($action): void
		{
			$allowedActions = ['fetchPage', 'fetchPageBlocks', 'savePage', 'removeLinks'];
			if (is_string($action) && in_array($action, $allowedActions, true)) {
				call_user_func([$this, $action]);
			} else {
				$this->returnData['error'] = 'Unknown or unsupported action.';
			}
		}

		private function fetchPage(): void
		{
			$this->checkParams('id');
			$this->lockPageForCurrentUser((int)$this->data['id']);
			$res = $this->db->fetchRow("SELECT id, groupId, itemCode, name, languages, blocks, link, metadata FROM items WHERE id = ?", [$this->data['id']]);
			if ($res['rows'] === 0) {
				$this->returnData['error'] = $this->uiLang->translate("Page not found in database");
				die();
			}
			$this->returnData['data']['page'] = $res['data'];

			$groupId = $res['data']['groupId'];
			$res = $this->db->fetchTable("SELECT name, itemCode, id, CAST(IFNULL(JSON_VALUE(metadata, '$.useAsStimulus'), 0) AS UNSIGNED) as stimulus, link FROM items WHERE groupId = ? AND ID <> ?", [$groupId, $this->data['id']]);
			$this->returnData['data']['group'] = $res['data'];
		}

		private function fetchPageBlocks(): void
		{
			$this->checkParams('id');
			$res = $this->db->fetchRow("SELECT languages, blocks FROM items WHERE id = ?", [$this->data['id']]);
			if ($res['rows'] === 0) {
				$this->returnData['error'] = $this->uiLang->translate("Page not found in database");
				die();
			}
			$this->returnData['data'] = $res['data'];
		}

		private function savePage(): void
		{
			$this->checkParams('id', 'pageData');
			if (!is_int($this->data['id']) || $this->data['id'] <= 0) {
				$this->returnData['error'] = 'Invalid page id.';
				return;
			}
			$this->checkEditability();

			$pageData = $this->sanitizePageData();
			if ($pageData === null) {
				return;
			}
			$customCSS = $pageData['customCSS'] ?? null;
			unset($pageData['customCSS']);
			$compiler = new InteractionCompiler($pageData['blocks'], $pageData['languages'], $this->data['id'], $this->db, []);
			$compiler->compileBlocks();
			$compilationErrors = $compiler->getErrors();
			$this->returnData['compilationErrors'] = $compilationErrors;
			if ($compilationErrors !== false) {
				// Preserve the validated editor source, but make sure no partial compiler
				// output can be used as if this page had compiled successfully.
				$pageData['fields'] = null;
				$pageData['options'] = null;
				$pageData['parsed'] = null;
				$pageData['scripts'] = null;
			} else {
				$pageData['fields'] = $compiler->getFields();
				$pageData['options'] = $this->mergeCustomCSS($compiler->getOptions(), $customCSS);
				if ($pageData['options'] === null) {
					return;
				}
				$pageData['parsed'] = $compiler->getParsed();
				$pageData['scripts'] = $compiler->getScripts();
				$pageData['blocks'] = $compiler->getBlocks();
			}
			$newMetaData = $compiler->getMetadata();
			$this->returnData['data']['blocks'] = json_decode($pageData['blocks']);
			// Merge compiler-owned metadata into the validated metadata loaded from the database.
			foreach ($newMetaData as $key => $value) {
				$pageData['metadata']->$key = $value;
			}
			try {
				$pageData['metadata'] = json_encode($pageData['metadata'], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
			} catch (JsonException) {
				$this->returnData['error'] = 'Could not encode the validated page metadata.';
				return;
			}
			$this->db->update("items", $pageData, "id = ?", [$this->data['id']]);

			// register activity for dashboard
			$grpRow = $this->db->fetchRow("SELECT groupId FROM items WHERE id = ?", [$this->data['id']]);
			$groupId = (int)($grpRow['data']['groupId'] ?? 0);
			if ($groupId > 0 && isset($this->myAuth->userid)) {
				registerActivity($this->db, (int)$this->myAuth->userid, $groupId, 'pagegroup');
			}
		}

		/**
		 * Validate the editor payload and construct a new database update map.
		 * Never pass client-supplied keys through to rixPDO::update().
		 */
		private function sanitizePageData(): ?array
		{
			$rawPageData = $this->data['pageData'];
			if (!is_array($rawPageData) || array_is_list($rawPageData)) {
				return $this->invalidPageData("The 'pageData' parameter must be a key/value map.");
			}
			foreach (['blocks', 'languages', 'metadata'] as $requiredField) {
				if (!array_key_exists($requiredField, $rawPageData)) {
					return $this->invalidPageData("The required '$requiredField' field is missing.");
				}
				if (!is_string($rawPageData[$requiredField])) {
					return $this->invalidPageData("The '$requiredField' field must be a JSON string.");
				}
			}

			try {
				$blocks = json_decode($rawPageData['blocks'], false, 512, JSON_THROW_ON_ERROR);
			} catch (JsonException) {
				return $this->invalidPageData("The 'blocks' field contains malformed JSON.");
			}
			try {
				$languages = json_decode($rawPageData['languages'], true, 512, JSON_THROW_ON_ERROR);
			} catch (JsonException) {
				return $this->invalidPageData("The 'languages' field contains malformed JSON.");
			}
			try {
				$clientMetadata = json_decode($rawPageData['metadata'], false, 512, JSON_THROW_ON_ERROR);
			} catch (JsonException) {
				return $this->invalidPageData("The 'metadata' field contains malformed JSON.");
			}

			if (!is_array($blocks) || !array_is_list($blocks)) {
				return $this->invalidPageData("The 'blocks' field must contain a list.");
			}
			if (!is_array($languages) || !array_is_list($languages) || count($languages) === 0) {
				return $this->invalidPageData("The 'languages' field must contain a non-empty list.");
			}
			if (!$clientMetadata instanceof stdClass) {
				return $this->invalidPageData("The 'metadata' field must contain an object.");
			}

			$manifestPath = __DIR__ . '/../../interactions/manifest.json';
			if (!is_readable($manifestPath)) {
				$this->returnData['error'] = 'Could not validate interaction types.';
				return null;
			}
			try {
				$manifestJson = file_get_contents($manifestPath);
				$manifest = json_decode($manifestJson === false ? '' : $manifestJson, true, 512, JSON_THROW_ON_ERROR);
			} catch (JsonException) {
				$this->returnData['error'] = 'Could not validate interaction types.';
				return null;
			}
			if (!is_array($manifest) || !is_array($manifest['paths'] ?? null)) {
				$this->returnData['error'] = 'Could not validate interaction types.';
				return null;
			}
			$allowedInteractionTypes = array_keys($manifest['paths']);
			if (count($allowedInteractionTypes) === 0) {
				$this->returnData['error'] = 'Could not validate interaction types.';
				return null;
			}
			foreach ($blocks as $block) {
				if (!$block instanceof stdClass) {
					return $this->invalidPageData('Every interaction block must be an object.');
				}
				if (!property_exists($block, 'type')) {
					return $this->invalidPageData("An interaction block is missing its required 'type' field.");
				}
				if (!is_string($block->type)) {
					return $this->invalidPageData("Every interaction block 'type' must be a string.");
				}
				if (!in_array($block->type, $allowedInteractionTypes, true)) {
					return $this->invalidPageData('An interaction block uses an unsupported type.');
				}
			}

			$languageResult = $this->db->fetchColumn('SELECT code FROM languages');
			if (!is_array($languageResult)) {
				$this->returnData['error'] = 'Could not validate page languages.';
				return null;
			}
			$availableLanguages = $languageResult['data'] ?? [];
			if (!is_array($availableLanguages)) {
				$this->returnData['error'] = 'Could not validate page languages.';
				return null;
			}
			$availableLanguages = array_map('strval', $availableLanguages);
			$validatedLanguages = [];
			foreach ($languages as $language) {
				if (!is_string($language)) {
					return $this->invalidPageData("Every entry in the 'languages' field must be a string.");
				}
				if (!in_array($language, $availableLanguages, true)) {
					return $this->invalidPageData("The 'languages' field contains an unsupported language code.");
				}
				if (in_array($language, $validatedLanguages, true)) {
					return $this->invalidPageData("The 'languages' field contains a duplicate language code.");
				}
				$validatedLanguages[] = $language;
			}

			$validatedName = null;
			if (array_key_exists('name', $rawPageData)) {
				if (!is_string($rawPageData['name'])) {
					return $this->invalidPageData("The 'name' field must be a string.");
				}
				if (trim($rawPageData['name']) === '') {
					return $this->invalidPageData("The 'name' field must not be blank.");
				}
				if (mb_strlen($rawPageData['name']) > 255) {
					return $this->invalidPageData("The 'name' field must not exceed 255 characters.");
				}
				$validatedName = $rawPageData['name'];
			}

			if (array_key_exists('itemCode', $rawPageData) && array_key_exists('pageCode', $rawPageData)) {
				return $this->invalidPageData("Use either 'itemCode' or its 'pageCode' alias, not both.");
			}
			$codeField = array_key_exists('pageCode', $rawPageData) ? 'pageCode' : 'itemCode';
			$hasItemCode = array_key_exists($codeField, $rawPageData);
			$validatedItemCode = null;
			if ($hasItemCode) {
				if (!is_string($rawPageData[$codeField]) && $rawPageData[$codeField] !== null) {
					return $this->invalidPageData("The '$codeField' field must be a string or null.");
				}
				if (is_string($rawPageData[$codeField]) && mb_strlen($rawPageData[$codeField]) > 255) {
					return $this->invalidPageData("The '$codeField' field must not exceed 255 characters.");
				}
				$validatedItemCode = $rawPageData[$codeField];
			}

			$hasCustomCSS = array_key_exists('customCSS', $rawPageData);
			$validatedCustomCSS = [];
			if ($hasCustomCSS) {
				try {
					$validatedCustomCSS = $this->sanitizeCustomCSS($rawPageData['customCSS']);
				} catch (InvalidArgumentException $e) {
					return $this->invalidPageData($e->getMessage());
				}
			}

			$currentPage = $this->db->fetchRow('SELECT groupId, metadata FROM items WHERE id=? LIMIT 1', [$this->data['id']]);
			if (($currentPage['rows'] ?? 0) !== 1) {
				$this->returnData['error'] = $this->uiLang->translate('The page has been deleted by another user.');
				return null;
			}
			if (!$this->synchronizeMediaInteractionFilenames($blocks, (int)$currentPage['data']['groupId'])) return null;
			try {
				$storedMetadata = ($currentPage['data']['metadata'] === null || $currentPage['data']['metadata'] === '')
					? new stdClass()
					: json_decode($currentPage['data']['metadata'], false, 512, JSON_THROW_ON_ERROR);
			} catch (JsonException) {
				$this->returnData['error'] = 'The stored page metadata is invalid.';
				return null;
			}
			if (!$storedMetadata instanceof stdClass) {
				$this->returnData['error'] = 'The stored page metadata is invalid.';
				return null;
			}

			if (property_exists($clientMetadata, 'comments')) {
				if (!is_string($clientMetadata->comments) && $clientMetadata->comments !== null) {
					return $this->invalidPageData("The metadata 'comments' value must be a string or null.");
				}
				$storedMetadata->comments = $clientMetadata->comments;
			}
			if (property_exists($clientMetadata, 'useAsStimulus')) {
				if (!is_bool($clientMetadata->useAsStimulus)) {
					return $this->invalidPageData("The metadata 'useAsStimulus' value must be boolean.");
				}
				$storedMetadata->useAsStimulus = $clientMetadata->useAsStimulus;
			}
			if ($hasCustomCSS) {
				// Keep editor-authored CSS separate from compiler output so it can be rebuilt on every save.
				$storedMetadata->customCSS = $validatedCustomCSS;
			} elseif (property_exists($storedMetadata, 'customCSS')) {
				try {
					$validatedCustomCSS = $this->sanitizeCustomCSS($storedMetadata->customCSS);
					$hasCustomCSS = true;
				} catch (InvalidArgumentException) {
					$this->returnData['error'] = "The stored page metadata contains 'customCSS' in an invalid format.";
					return null;
				}
			}

			$link = $rawPageData['link'] ?? null;
			if ($link !== null) {
				if (!is_int($link)) {
					return $this->invalidPageData("The 'link' field must be an integer or null.");
				}
				if ($link <= 0) {
					return $this->invalidPageData("The 'link' field must contain a positive page id.");
				}
				if ($link === $this->data['id']) {
					return $this->invalidPageData('A page cannot link to itself as a stimulus.');
				}
				$linkTarget = $this->db->fetchRow('SELECT metadata FROM items WHERE id=? AND groupId=? LIMIT 1', [$link, (int)$currentPage['data']['groupId']]);
				if (($linkTarget['rows'] ?? 0) !== 1) {
					return $this->invalidPageData("The linked stimulus does not exist in this page group.");
				}
				$targetMetadata = json_decode($linkTarget['data']['metadata'] ?? '', true);
				if (json_last_error() !== JSON_ERROR_NONE || ($targetMetadata['useAsStimulus'] ?? false) !== true) {
					return $this->invalidPageData('The linked page is not a stimulus.');
				}
			}
			if (($storedMetadata->useAsStimulus ?? false) === true && $link !== null) {
				return $this->invalidPageData('A stimulus page cannot itself link to another stimulus.');
			}

			try {
				$validatedBlocks = json_encode($blocks, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
				$validatedLanguageJson = json_encode($validatedLanguages, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
			} catch (JsonException) {
				return $this->invalidPageData('The validated page data could not be encoded.');
			}

			$validatedPageData = [
				'blocks' => $validatedBlocks,
				'languages' => $validatedLanguageJson,
				'link' => $link,
				'metadata' => $storedMetadata
			];
			if ($validatedName !== null) {
				$validatedPageData['name'] = $validatedName;
			}
			if ($hasItemCode) {
				$validatedPageData['itemCode'] = $validatedItemCode;
			}
			if ($hasCustomCSS) {
				$validatedPageData['customCSS'] = $validatedCustomCSS;
			}
			return $validatedPageData;
		}

		private function sanitizeCustomCSS(mixed $customCSS): array
		{
			if (!is_array($customCSS) || !array_is_list($customCSS)) {
				throw new InvalidArgumentException("The 'customCSS' field must be a list of CSS rules.");
			}
			$validatedCustomCSS = [];
			foreach ($customCSS as $cssRule) {
				if ($cssRule instanceof stdClass) {
					$cssRule = get_object_vars($cssRule);
				}
				if (!is_array($cssRule) || array_is_list($cssRule)) {
					throw new InvalidArgumentException("Every 'customCSS' rule must be an object.");
				}
				if (!array_key_exists('selector', $cssRule) || !is_string($cssRule['selector']) || trim($cssRule['selector']) === '') {
					throw new InvalidArgumentException("Every 'customCSS' rule must have a non-blank string selector.");
				}
				if (!array_key_exists('rules', $cssRule) || !is_string($cssRule['rules'])) {
					throw new InvalidArgumentException("Every 'customCSS' rule must have a string 'rules' value.");
				}
				$validatedCustomCSS[] = [
					'selector' => $cssRule['selector'],
					'rules' => $cssRule['rules']
				];
			}
			return $validatedCustomCSS;
		}

		private function mergeCustomCSS(string $compiledOptions, ?array $customCSS): ?string
		{
			if ($customCSS === null) {
				return $compiledOptions;
			}
			try {
				$options = json_decode($compiledOptions, false, 512, JSON_THROW_ON_ERROR);
			} catch (JsonException) {
				$this->returnData['error'] = 'The interaction compiler returned malformed options JSON.';
				return null;
			}
			if (!$options instanceof stdClass) {
				$this->returnData['error'] = 'The interaction compiler returned options in an invalid format.';
				return null;
			}
			$compiledCSS = $options->customCSS ?? [];
			if (!is_array($compiledCSS)) {
				$this->returnData['error'] = "The interaction compiler returned 'customCSS' in an invalid format.";
				return null;
			}
			$options->customCSS = array_merge($compiledCSS, $customCSS);
			try {
				return json_encode($options, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
			} catch (JsonException) {
				$this->returnData['error'] = 'The merged page options could not be encoded.';
				return null;
			}
		}

		private function invalidPageData(string $reason): ?array
		{
			$this->returnData['error'] = "Invalid page data: $reason";
			return null;
		}

		/** Keep display-only media titles canonical even when a stale editor saves after a rename. */
		private function synchronizeMediaInteractionFilenames(array &$blocks, int $groupId): bool
		{
			$mediaIds = [];
			foreach ($blocks as $block) {
				if (!$block instanceof stdClass || !in_array($block->type ?? '', ['image', 'audio', 'video'], true) || !(($block->fileid ?? null) instanceof stdClass)) continue;
				foreach (get_object_vars($block->fileid) as $fileId) {
					if (is_int($fileId) || (is_string($fileId) && ctype_digit($fileId))) $mediaIds[(int)$fileId] = true;
				}
			}
			if (count($mediaIds) === 0) return true;

			$ids = array_keys($mediaIds);
			$placeholders = implode(',', array_fill(0, count($ids), '?'));
			$result = $this->db->fetchTable("SELECT id, name FROM media WHERE parent=? AND id IN ($placeholders)", array_merge([$groupId], $ids));
			if (!is_array($result) || !empty($result['error'])) {
				$this->returnData['error'] = 'Could not verify media interaction titles.';
				return false;
			}
			$names = [];
			foreach (($result['data'] ?? []) as $media) $names[(int)$media['id']] = (string)$media['name'];

			foreach ($blocks as $block) {
				if (!$block instanceof stdClass || !in_array($block->type ?? '', ['image', 'audio', 'video'], true) || !(($block->fileid ?? null) instanceof stdClass)) continue;
				if (!(($block->filename ?? null) instanceof stdClass)) $block->filename = new stdClass();
				foreach (get_object_vars($block->fileid) as $language => $fileId) {
					$id = (int)$fileId;
					if (isset($names[$id])) $block->filename->{$language} = $names[$id];
				}
			}
			return true;
		}

		private function removeLinks(): void
		{
			/*
			 * Remove all links to the page with the given id
			 * This is used when a page is defined not to be used as a stimulus anymore
			 * P.S.: On deletion of a page, the links to it are set to NULL automatically by foreign key constraints
			 */
			$this->checkParams('id');
			if ($this->pageIsUsedInPublishedTest((int)$this->data['id'])) {
				$this->returnData['error'] = $this->uiLang->translate('This page is used in at least one published (locked) test and cannot be edited to secure test results. Please use the preview to view its content.');
				die();
			}
			$page = $this->db->fetchRow('SELECT groupId FROM items WHERE id=? LIMIT 1', [(int)$this->data['id']]);
			if (($page['rows'] ?? 0) !== 1) {
				$this->returnData['error'] = $this->uiLang->translate('Page not found in database');
				return;
			}
			$groupId = (int)$page['data']['groupId'];
			$this->db->update("items", ['link' => null], "link = ?", [$this->data['id']]);

			$res = $this->db->fetchTable("SELECT name, itemCode, id, CAST(IFNULL(JSON_VALUE(metadata, '$.useAsStimulus'), 0) AS UNSIGNED) as stimulus, link FROM items WHERE groupId = ? AND ID <> ?", [$groupId, $this->data['id']]);
			$this->returnData['data']['group'] = $res['data'];
		}

		public function recompilePage($id): void
		{
			$res = $this->db->fetchRow("SELECT blocks, languages, metadata FROM items WHERE id = ?", [$id]);
			$pageData = $res['data'];
			if ($pageData['blocks'] === null || $pageData['languages'] === null) {
				return;
			}

			$compiler = new InteractionCompiler($pageData['blocks'], $pageData['languages'], $id, $this->db, []);
			$compiler->compileBlocks();
			$compilationErrors = $compiler->getErrors();
			$this->returnData['compilationErrors'] = $compilationErrors;
			if ($compilationErrors !== false) {
				$pageData['fields'] = null;
				$pageData['options'] = null;
				$pageData['parsed'] = null;
				$pageData['scripts'] = null;
			} else {
				$pageData['fields'] = $compiler->getFields();
				$pageData['options'] = $compiler->getOptions();
				$pageData['parsed'] = $compiler->getParsed();
				$pageData['scripts'] = $compiler->getScripts();
				$pageData['blocks'] = $compiler->getBlocks();
			}
			$newMetaData = $compiler->getMetadata();
			if ($pageData['metadata'] !== null && $pageData['metadata'] !== '') {
				$pageData['metadata'] = json_decode($pageData['metadata']);
				if (json_last_error() !== JSON_ERROR_NONE) {
					$this->returnData['error'] = "Error decoding metadata: " . json_last_error_msg();
					return;
				}
				// Merge new metadata with existing metadata
				foreach ($newMetaData as $key => $value) {
					$pageData['metadata']->$key = $value;
				}
			} else {
				$pageData['metadata'] = new stdClass();
			}
			// Convert metadata back to JSON
			$pageData['metadata'] = json_encode($pageData['metadata'], JSON_UNESCAPED_UNICODE);
			$this->db->update("items", $pageData, "id = ?", [$id]);
		}

		public function testCompiler($id): void
		{
			$res = $this->db->fetchRow("SELECT blocks, languages, fields, options, parsed, scripts, metadata FROM items WHERE id = ?", [$id]);
			$pageData = $res['data'];
			if ($pageData['blocks'] === null || $pageData['languages'] === null) {
				return;
			}

			$compiler = new InteractionCompiler($pageData['blocks'], $pageData['languages'], $id, $this->db, []);
			$compiler->compileBlocks();
			$newData['fields'] = $compiler->getFields();
			$newData['options'] = $compiler->getOptions();
			$newData['parsed'] = $compiler->getParsed();
			$newData['scripts'] = $compiler->getScripts();
			$newData['blocks'] = $compiler->getBlocks();
			$newMetaData = $compiler->getMetadata();
			$this->returnData['compilationErrors'] = $compiler->getErrors();
			if ($pageData['metadata'] !== null && $pageData['metadata'] !== '') {
				$newData['metadata'] = json_decode($pageData['metadata']);
				if (json_last_error() !== JSON_ERROR_NONE) {
					$this->returnData['error'] = "Error decoding metadata: " . json_last_error_msg();
					return;
				}
				// Merge new metadata with existing metadata
				foreach ($newMetaData as $key => $value) {
					$newData['metadata']->$key = $value;
				}
			} else {
				$newData['metadata'] = new stdClass();
			}
			// Convert metadata back to JSON
			$newData['metadata'] = json_encode($newData['metadata'], JSON_UNESCAPED_UNICODE);
			if ($newData['fields'] !== $pageData['fields'] || $newData['options'] !== $pageData['options'] || $newData['parsed'] !== $pageData['parsed'] || $newData['scripts'] !== $pageData['scripts'] || $newData['blocks'] !== $pageData['blocks'] || $newData['metadata'] !== $pageData['metadata']) {
				$this->returnData['error'] = "Compiler test diverged on page with id = $id!";
				$this->returnData['debug'] = [];
				compareObjects($pageData['fields'], $newData['fields'], $this->returnData['debug'], 'old', 'new', 'fields');
				compareObjects($pageData['options'], $newData['options'], $this->returnData['debug'], 'old', 'new', 'options');
				compareObjects($pageData['parsed'], $newData['parsed'], $this->returnData['debug'], 'old', 'new', 'parsed');
				compareObjects($pageData['scripts'], $newData['scripts'], $this->returnData['debug'], 'old', 'new', 'scripts');
				compareObjects($pageData['blocks'], $newData['blocks'], $this->returnData['debug'], 'old', 'new', 'blocks');
				compareObjects($pageData['metadata'], $newData['metadata'], $this->returnData['debug'], 'old', 'new', 'metadata');
			}
		}

		private function currentLockOwnerIds(): array
		{
			$ids = [];
			try {
				global $backendState;
				if (isset($backendState)) $ids[] = (string)$backendState->getStateId();
			} catch (Throwable $e) {
				// Fall back to cookies below.
			}
			if (!empty($_COOKIE['oasysStateBackend'])) $ids[] = (string)$_COOKIE['oasysStateBackend'];
			if (!empty($_COOKIE[session_name()])) $ids[] = (string)$_COOKIE[session_name()];
			return array_values(array_unique(array_filter($ids)));
		}

		private function primaryLockOwnerId(): ?string
		{
			$ids = $this->currentLockOwnerIds();
			return $ids[0] ?? null;
		}

		private function decodeLock(?string $rawLock): array
		{
			$lock = json_decode($rawLock ?? '', true);
			return (json_last_error() === JSON_ERROR_NONE && is_array($lock)) ? $lock : [];
		}

		private function lockIsActive(array $lock): bool
		{
			$ownerId = isset($lock['sessionId']) ? (string)$lock['sessionId'] : '';
			if ($ownerId === '') return false;
			$timestamp = isset($lock['timestamp']) ? strtotime((string)$lock['timestamp']) : false;
			return ($timestamp === false || time() - $timestamp < 60);
		}

		private function lockBelongsToCurrentUser(array $lock): bool
		{
			$ownerId = isset($lock['sessionId']) ? (string)$lock['sessionId'] : '';
			return ($ownerId !== '' && in_array($ownerId, $this->currentLockOwnerIds(), true));
		}

		private function stateDataValue(?string $rawStateData, string $property): mixed
		{
			$stateData = json_decode($rawStateData ?? '', true);
			if (json_last_error() !== JSON_ERROR_NONE || !is_array($stateData) || !isset($stateData[$property])) return null;
			$type = $stateData[$property]['type'] ?? null;
			$value = $stateData[$property]['value'] ?? null;
			return match ($type) {
				'array' => json_decode((string)$value, true),
				'object' => json_decode((string)$value, false),
				'boolean' => filter_var($value, FILTER_VALIDATE_BOOLEAN),
				default => $value,
			};
		}

		private function lockUserName(array $lock): string
		{
			if (!empty($lock['userName'])) return (string)$lock['userName'];
			if (!empty($lock['userId'])) {
				$name = $this->db->fetchValue("SELECT name FROM users WHERE id=? LIMIT 1", [(int)$lock['userId']])['data'] ?? null;
				if ($name) return (string)$name;
			}
			$ownerId = isset($lock['sessionId']) ? (string)$lock['sessionId'] : '';
			if ($ownerId !== '') {
				$stateRow = $this->db->fetchRow("SELECT data FROM stateBackend WHERE stateId=? LIMIT 1", [$ownerId]);
				if (($stateRow['rows'] ?? 0) > 0) {
					$username = $this->stateDataValue($stateRow['data']['data'] ?? null, 'username');
					if ($username) return (string)$username;
					$userId = $this->stateDataValue($stateRow['data']['data'] ?? null, 'userid');
					if ($userId) {
						$name = $this->db->fetchValue("SELECT name FROM users WHERE id=? LIMIT 1", [(int)$userId])['data'] ?? null;
						if ($name) return (string)$name;
					}
				}
			}
			return 'another user';
		}

		private function lockPageForCurrentUser(int $pageId): void
		{
			global $backendState;
			if ($this->pageIsUsedInPublishedTest($pageId)) {
				$this->returnData['error'] = $this->uiLang->translate('This page is used in at least one published (locked) test and cannot be edited to secure test results. Please use the preview to view its content.');
				die();
			}

			$result = $this->db->fetchRow("SELECT `lock` FROM items WHERE id=? LIMIT 1", [$pageId]);
			if (($result['rows'] ?? 0) === 0) return;

			$lock = $this->decodeLock($result['data']['lock'] ?? null);
			if ($this->lockIsActive($lock) && !$this->lockBelongsToCurrentUser($lock)) {
				$this->returnData['error'] = $this->uiLang->translate("It is not possible to edit the selected page right now. It is currently being edited by another user.") . '<br />' .
					$this->uiLang->translate('User') . ': ' . htmlspecialchars($this->lockUserName($lock), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
				die();
			}

			$lockOwnerId = $this->primaryLockOwnerId();
			if (!$lockOwnerId) return;

			$newLock = new stdClass();
			$newLock->sessionId = $lockOwnerId;
			$newLock->timestamp = date("Y-m-d H:i:s");
			if (isset($backendState->userid)) $newLock->userId = (int)$backendState->userid;
			if (isset($backendState->username)) $newLock->userName = (string)$backendState->username;
			$this->db->update('items', ['lock' => json_encode($newLock)], 'id=?', [$pageId]);
		}

		private function checkEditability(): void
		{
			$parameters = [$this->data['id']];
			$query = "SELECT `lock` FROM items WHERE id=? LIMIT 1";
			$result = $this->db->fetchRow($query, $parameters);

			$lock = $this->decodeLock($result['data']['lock'] ?? null);
			//Show error message if selected item group is not availabe anymore
			if ($result['rows'] === 0 || ($this->lockIsActive($lock) && !$this->lockBelongsToCurrentUser($lock))) {
				$this->returnData['error'] = $this->uiLang->translate("Connection to server was interrupted. Cannot save page!");
				die();
			}
			if ($this->pageIsUsedInPublishedTest((int)$this->data['id'])) {
				$this->returnData['error'] = $this->uiLang->translate('This page is used in at least one published (locked) test and cannot be edited to secure test results. Please use the preview to view its content.');
				die();
			}
		}

		private function pageIsUsedInPublishedTest(int $pageId): bool
		{
			$poolRows = $this->db->fetchTable("SELECT id, structure FROM testPools", [])['data'] ?? [];
			$poolPages = [];
			foreach ($poolRows as $pool) {
				$structure = json_decode($pool['structure'] ?? '', true);
				$poolId = (int)$pool['id'];
				$poolPages[$poolId] = [];
				foreach (($structure['items'] ?? []) as $entry) {
					if (isset($entry['hiddenID'])) $poolPages[$poolId][] = (int)$entry['hiddenID'];
				}
			}

			$testRows = $this->db->fetchTable("SELECT id, structure FROM tests WHERE structure IS NOT NULL AND structure <> ''", [])['data'] ?? [];
			$linkRows = $this->db->fetchTable("SELECT id, link FROM items WHERE link IS NOT NULL", [])['data'] ?? [];
			$linkedStimulusByPage = [];
			foreach ($linkRows as $linkRow) {
				$linkedStimulusByPage[(int)$linkRow['id']] = (int)$linkRow['link'];
			}
			$testMap = [];
			foreach ($testRows as $test) {
				$structure = json_decode($test['structure'] ?? '', true);
				if (!is_array($structure)) continue;
				$testMap[(int)$test['id']] = ['structure' => $structure];
			}
			$collectPages = static function(array $structure, array $seenTests = []) use (&$collectPages, &$testMap, $poolPages): array {
				$type = $structure['type'] ?? 'linear';
				$pageIds = [];
				foreach (($structure['items'] ?? []) as $entry) {
					if (!isset($entry['hiddenID'])) continue;
					$hiddenId = (int)$entry['hiddenID'];
					if ($type === 'fluid') {
						$pageIds = array_merge($pageIds, $poolPages[$hiddenId] ?? []);
					} elseif ($type === 'mutation') {
						if (isset($seenTests[$hiddenId]) || !isset($testMap[$hiddenId])) continue;
						$seenTests[$hiddenId] = true;
						$pageIds = array_merge($pageIds, $collectPages($testMap[$hiddenId]['structure'], $seenTests));
					} else {
						$pageIds[] = $hiddenId;
					}
				}
				return array_values(array_unique($pageIds));
			};

			foreach ($testMap as $testId => $test) {
				$structure = $test['structure'];
				if (($structure['state'] ?? 'draft') !== 'published') continue;
				$testPageIds = $collectPages($structure, [$testId => true]);
				if (in_array($pageId, $testPageIds, true)) return true;
				foreach ($testPageIds as $testPageId) {
					if (($linkedStimulusByPage[(int)$testPageId] ?? null) === $pageId) return true;
				}
			}
			return false;
		}

		private function checkParams(...$params): void
		{
			if (!$params || count($params) == 0) {
				return;
			}
			foreach ($params as $key) {
				if (!isset($this->data[$key])) {
					$this->returnData['error'] = "Error: missing parameter '$key'!";
					die();
				}
			}
		}
	}
