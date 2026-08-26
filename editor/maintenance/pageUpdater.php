<?php

	require_once(__DIR__ . "/../interactions/InteractionCompiler.php");
	require_once(__DIR__ . "/../../inc/php/parser.php");

	/*
	This class is used for checking saved pages for legacy options and updating to new
	expected structures, so that interactions do not have to integrate fallback code
	whenever something changes.
	This also keeps the database clean from legacy options.
	*/

	class pageUpdater
	{

		private array $returnData;
		private array $data;
		private rixPDO $db;
		private array $fixes;
		private array $log;
		private int $changeCount;
		private ?int $currentPage;
		private ?int $currentBlock;
		private ?array $currentFix;

		public function __construct(&$returnData)
		{
			global $app;
			$this->returnData = &$returnData;

			//init database connections
			$this->db = $app->getDatabaseInstance();
			$this->fixes = [];
			$this->log = [];
			$this->changeCount = 0;
			$this->registerDefaultFixes();
			$this->registerFixes();
		}

		public function checkAllPages($simulate = false): void
		{
			$this->changeCount = 0;
			$this->runCustomQueries();
			$res = $this->db->fetchColumn("SELECT id FROM items WHERE NOT ISNULL('blocks')");
			if ($simulate !== false) {
				$this->returnData['debug'] = [];
			}
			foreach ($res['data'] as $id) {
/*
				//debugging block to be uncomment on demand
				echo "Checking page with id = $id<br>";
				$error = error_get_last();
				if (!empty($error)) {
					$documentRoot = filter_input(INPUT_SERVER, "DOCUMENT_ROOT");
					$file = str_replace($documentRoot, '', $error['file']);
					echo "<p>Fatal error [type {$error['type']}] on line {$error['line']} of<br><code class='tinyCode'>$file</code></p><pre>{$error['message']}</pre>";
				}
*/
				$this->verifyPage($id, $simulate);
			}
			$this->returnData['log'] = $this->log;
			$this->returnData['changeCount'] = $this->changeCount;
			$this->clearLog();
		}

		public function checkSinglePage($id): void
		{
			$this->changeCount = 0;
			$this->verifyPage($id);
			$this->returnData['log'] = $this->log;
			$this->returnData['changeCount'] = $this->changeCount;
			$this->clearLog();
		}

		private function log($message): void
		{
			$entry = "[page: " . ($this->currentPage ?? 'none') . " block: " . ($this->currentBlock ?? 'none') . " field: " . ($this->currentFix['field'] ?? 'none') . " action: " . ($this->currentFix['action'] ?? 'none') . "] " . $message;
			$this->log[] = $entry;
		}

		private function clearLog(): void
		{
			$this->log = [];
		}

		private function verifyPage(int $id, $simulate = false): void
		{
			//iterate through all blocks and check each one if a repair/upgrade is necessary
			$this->currentPage = $id;
			$this->loadPageData($id);
			if (!$this->migrateLegacyAdvancedCSS()) {
				$this->currentPage = null;
				return;
			}
			if (count($this->data['languages']) === 0) {
				if (count($this->data['blocks']) > 0) {
					$this->data['blocks'] = [];
					$this->log('blocks cleared because the page has no language');
				}
			} elseif (count($this->data['blocks']) > 0) {
				foreach ($this->data['blocks'] as $index => $block) {
					$this->checkBlock($block, $index);
				}
			}
			if ($simulate === false) {
				$this->savePageData($id);
			} else {
				$this->comparePageData($id);
			}
			$this->currentPage = null;
		}

		private function loadPageData(int $id): void
		{
			//load data of specific page and decode fields
			$res = $this->db->fetchRow("SELECT languages, blocks, metadata FROM items WHERE id=?", [$id]);
			$this->data = $res['data'];
			$this->decodeData('languages', []);
			$this->decodeData('blocks', []);
			$this->decodeData('metadata', new stdClass());
		}

		private function checkEditability($id): bool
		{
			$parameters = [$id];
			$query = "SELECT NULLIF(JSON_UNQUOTE(JSON_EXTRACT(`lock`, '$.sessionId')), 'null') FROM items WHERE id=?";
			$res = $this->db->fetchValue($query, $parameters);

			//Show error message if page is locked
			if ($res['data'] !== null) {
				$query = <<<SQL
					SELECT
						TIMESTAMPDIFF(
							SECOND,
							NULLIF(JSON_UNQUOTE(JSON_EXTRACT(`lock`, '$.timestamp')), 'null'),
							NOW()
						)
					FROM items
					WHERE id = ?
				SQL;
				$res = $this->db->fetchValue($query, $parameters);
				if ($res['data'] > 60) {
					$query = "UPDATE items SET `lock`='{}' WHERE id = ?";
					$res = $this->db->execute($query, $parameters);
					$this->changeCount += (int)($res['rows'] ?? 0);
					$this->log("Page checked in, page was locked by user but lock timed out");
					return true;
				} else {
					$this->log("Cannot update page, page is currently in use");
					return false;
				}
			}
			return true;
		}

		private function savePageData(int $id): void
		{
			if (!$this->checkEditability($id)) {
				/*	if page is locked by a user, it must not be saved and an error is logged
					since this call is found in savePageData() it will only log an error if
					there was indeed some data that needed to be saved	*/
				return;
			}
			$pageData = $this->data;
			if (count($pageData['languages']) === 0) {
				unset($pageData['languages']);
				$pageData['blocks'] = '[]';
				$pageData['fields'] = '{}';
				$pageData['parsed'] = '{}';
				$pageData['options'] = '{}';
				$pageData['scripts'] = '{}';
				$pageData['metadata'] = json_encode($pageData['metadata'], JSON_UNESCAPED_UNICODE);
				$res = $this->db->update('items', $pageData, 'id = ?', [$id]);
				if ($res['rows'] === 1) {
					$this->changeCount++;
					$this->log('empty page data normalized');
				}
				return;
			}
			$compiler = new InteractionCompiler($pageData['blocks'], $pageData['languages'], $id, $this->db, []);
			$compiler->compileBlocks();
			$error = $compiler->getErrors();
			if ($error !== false) {
				// Keep the upgraded editor source, but invalidate every derived column
				// instead of storing the compiler's partial result.
				$pageData['fields'] = null;
				$pageData['options'] = null;
				$pageData['parsed'] = null;
				$pageData['scripts'] = null;
			} else {
				$pageData['fields'] = $compiler->getFields();
				$pageData['options'] = $this->mergeCustomCSS($compiler->getOptions(), $pageData['metadata']->customCSS ?? null);
				if ($pageData['options'] === null) return;
				$pageData['parsed'] = $compiler->getParsed();
				$pageData['scripts'] = $compiler->getScripts();
				$pageData['blocks'] = $compiler->getBlocks();
			}
			unset ($pageData['languages']);
			$newMetaData = $compiler->getMetadata();
			if ($error !== false) {
				$this->log(strip_tags($error));
			}
			if ($pageData['metadata'] !== null && $pageData['metadata'] !== '') {
				// Merge new metadata with existing metadata
				foreach ($newMetaData as $key => $value) {
					$pageData['metadata']->$key = $value;
				}
			} else {
				$pageData['metadata'] = new stdClass();
			}
			// Convert metadata back to JSON
			$pageData['metadata'] = json_encode($pageData['metadata'], JSON_UNESCAPED_UNICODE);
			$res = $this->db->update("items", $pageData, "id = ?", [$id]);
			if ($res['rows'] === 1) {
				$this->changeCount++;
				$this->log('recompiled');
			}
		}

		private function comparePageData(int $id): void
		{
			$pageData = $this->data;
			if (count($pageData['languages']) === 0) {
				$this->returnData['compilationErrors'] = false;
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
				$newData['metadata'] = $pageData['metadata'];
				// Merge new metadata with existing metadata
				foreach ($newMetaData as $key => $value) {
					$newData['metadata']->$key = $value;
				}
			} else {
				$newData['metadata'] = $newMetaData;
			}
			compareObjects($pageData['blocks'], $newData['blocks'], $this->returnData['debug'], 'old', 'new', "[$id] blocks");
			compareObjects($pageData['metadata'], $newData['metadata'], $this->returnData['debug'], 'old', 'new', "[$id] metadata");
		}

		private function decodeData(string $key, mixed $default): void
		{
			//json decode specific field with error check and fallback to default
			$this->data[$key] = json_decode($this->data[$key] ?? '');
			if (json_last_error() !== JSON_ERROR_NONE) {
				//revert back to default value if value from database could not be json decoded
				$this->data[$key] = $default;
			}
		}

		/** Preserve CSS entered in the page editor when maintenance recompiles compiler-owned columns. */
		private function mergeCustomCSS(string $compiledOptions, mixed $customCSS): ?string
		{
			if ($customCSS === null) return $compiledOptions;
			if (!is_array($customCSS)) {
				$this->returnData['error'] = "Stored page custom CSS is not a list of rules.";
				return null;
			}
			$options = json_decode($compiledOptions);
			if (!$options instanceof stdClass) {
				$this->returnData['error'] = "The interaction compiler returned invalid options while preserving custom CSS.";
				return null;
			}
			$keywordCSS = $options->customCSS ?? [];
			if (!is_array($keywordCSS)) {
				$this->returnData['error'] = "The interaction compiler returned invalid custom CSS options.";
				return null;
			}
			$options->customCSS = array_merge($keywordCSS, $customCSS);
			return json_encode($options, JSON_UNESCAPED_UNICODE);
		}

		/**
		 * Move standalone [@CSS ...@] keywords out of advanced editor HTML and into the
		 * page editor's custom CSS source. The CSS keyword parser used to remove these
		 * wrappers only from compiled HTML; this migration also cleans the editor source.
		 */
		private function migrateLegacyAdvancedCSS(): bool
		{
			$cssPlugin = OasysParserPlugin::getPlugin('oasysCSSRule');
			if (!$cssPlugin instanceof OasysParserPlugin) {
				$this->returnData['error'] = 'Could not load the legacy CSS keyword parser.';
				return false;
			}

			$migratedRules = [];
			$updatedBlocks = [];
			$removedBlockCount = 0;
			$this->currentFix = ['field' => 'source', 'action' => 'migrateLegacyCSS'];

			foreach ($this->data['blocks'] as $index => $block) {
				if (!$block instanceof stdClass || ($block->type ?? null) !== 'advanced') {
					$updatedBlocks[] = $block;
					continue;
				}

				$this->currentBlock = $index;
				$sourceData = $block->source ?? null;
				if (!$sourceData instanceof stdClass && !is_array($sourceData)) {
					$updatedBlocks[] = $block;
					continue;
				}

				$sourceValues = $sourceData instanceof stdClass ? get_object_vars($sourceData) : $sourceData;
				// Preserve the same language/rule order used by InteractionCompiler::compileAdvancedEditor().
				$sourceLanguages = array_keys($sourceValues);
				$blockChanged = false;
				foreach ($sourceLanguages as $language) {
					$source = $sourceValues[$language] ?? null;
					if (!is_string($source) || stripos($source, '[@CSS') === false) continue;

					$result = $this->extractLegacyCSSRules($source, (string)$language, $cssPlugin);
					if ($result['error']) {
						$this->currentBlock = null;
						$this->currentFix = null;
						return false;
					}
					if ($result['source'] !== $source) {
						$blockChanged = true;
						if ($block->source instanceof stdClass) {
							$block->source->{$language} = $result['source'];
						} else {
							$block->source[$language] = $result['source'];
						}
					}
					foreach ($result['rules'] as $rule) {
						$migratedRules[] = $rule;
					}
				}

				if ($blockChanged && $this->advancedSourceIsEmpty($block->source)) {
					$removedBlockCount++;
					$this->log('advanced block removed after migrating its legacy CSS');
					continue;
				}
				if ($blockChanged) {
					$this->log('legacy CSS removed from advanced block source');
				}
				$updatedBlocks[] = $block;
			}

			if (count($migratedRules) > 0) {
				if (!$this->data['metadata'] instanceof stdClass) {
					$this->returnData['error'] = 'Stored page metadata is invalid; legacy CSS was not migrated.';
					$this->currentBlock = null;
					$this->currentFix = null;
					return false;
				}
				$existingRules = $this->data['metadata']->customCSS ?? [];
				if (!is_array($existingRules) || !array_is_list($existingRules)) {
					$this->returnData['error'] = 'Stored page custom CSS is invalid; legacy CSS was not migrated.';
					$this->currentBlock = null;
					$this->currentFix = null;
					return false;
				}

				$combinedRules = $migratedRules;
				foreach ($existingRules as $rule) {
					if ($rule instanceof stdClass) $rule = get_object_vars($rule);
					if (
						!is_array($rule)
						|| !is_string($rule['selector'] ?? null)
						|| trim($rule['selector']) === ''
						|| !is_string($rule['rules'] ?? null)
					) {
						$this->returnData['error'] = 'Stored page custom CSS contains an invalid rule; legacy CSS was not migrated.';
						$this->currentBlock = null;
						$this->currentFix = null;
						return false;
					}
					$normalizedRule = ['selector' => $rule['selector'], 'rules' => $rule['rules']];
					$combinedRules[] = $normalizedRule;
				}
				$this->data['metadata']->customCSS = $combinedRules;
				$this->data['blocks'] = array_values($updatedBlocks);
				$ruleLabel = count($migratedRules) === 1 ? 'rule' : 'rules';
				$this->currentBlock = null;
				$this->log(count($migratedRules) . " legacy CSS $ruleLabel moved to page custom CSS");
				if ($removedBlockCount > 0) {
					$blockLabel = $removedBlockCount === 1 ? 'block' : 'blocks';
					$this->log("$removedBlockCount empty advanced $blockLabel removed");
				}
			}

			$this->currentBlock = null;
			$this->currentFix = null;
			return true;
		}

		private function extractLegacyCSSRules(string $source, string $language, OasysParserPlugin $cssPlugin): array
		{
			// Prefer the paragraph/div wrapper, including the common TinyMCE shape where
			// the keyword itself has one additional span wrapper. Standalone spans remain
			// supported for compatibility with the original CSS keyword parser.
			$wrapperPattern = '~<(?P<wrapper>p|div|span)\b[^>]*>\s*(?:<span\b[^>]*>\s*)?\[@CSS\b(?P<attributes>.*?)@\]\s*(?:</span>\s*)?</\k<wrapper>\s*>~is';
			$matchCount = preg_match_all($wrapperPattern, $source, $matches, PREG_SET_ORDER | PREG_OFFSET_CAPTURE);
			if ($matchCount === false) {
				$this->returnData['error'] = 'Could not scan an advanced block for legacy CSS: ' . preg_last_error_msg();
				return ['source' => $source, 'rules' => [], 'error' => true];
			}

			$rules = [];
			$removals = [];
			foreach ($matches as $match) {
				$plainMatch = [$match[0][0], $match['wrapper'][0], $match['attributes'][0]];
				$settings = $cssPlugin->parseSettings($match['attributes'][0], $language, $plainMatch, $this->currentPage);
				$selector = $settings['selector'] ?? null;
				$declarations = $settings['rules'] ?? null;
				if (!is_string($selector) || trim($selector) === '' || !is_string($declarations)) {
					$this->log('invalid legacy CSS keyword left unchanged');
					continue;
				}
				$rules[] = ['selector' => $selector, 'rules' => $declarations];
				$removals[] = ['offset' => $match[0][1], 'length' => strlen($match[0][0])];
			}

			for ($index = count($removals) - 1; $index >= 0; $index--) {
				$source = substr_replace($source, '', $removals[$index]['offset'], $removals[$index]['length']);
			}
			return ['source' => $source, 'rules' => $rules, 'error' => false];
		}

		private function advancedSourceIsEmpty(mixed $sourceData): bool
		{
			if ($sourceData instanceof stdClass) $sourceData = get_object_vars($sourceData);
			if (!is_array($sourceData)) return false;
			foreach ($sourceData as $source) {
				if (!is_string($source)) return false;
				$source = preg_replace('/<!--.*?-->/s', '', $source);
				$source = preg_replace('~</?(?:p|div|span|br)\b[^>]*>~i', '', $source);
				$source = html_entity_decode($source, ENT_QUOTES | ENT_HTML5, 'UTF-8');
				$source = preg_replace('/[\s\x{00A0}\x{200B}\x{FEFF}]+/u', '', $source);
				if ($source === null || $source !== '') return false;
			}
			return true;
		}

		private function checkBlock(stdClass $block, int $index): void
		{
			global $debugInfo;
			$this->currentBlock = $index;
			$updated = false; //indicates if a fix was necessary
//			$debugInfo['block'] = $block;
			foreach ($this->fixes as $fix) {
//				$debugInfo['fix'] = $fix;
				$this->currentFix = $fix;
				if ($block->type !== $fix['type']) {
					continue;
				}
				/* if fix applies to block type launch the fix */
				$updated = $this->{$fix['action']}($block, $fix) || $updated;
			}
			if ($updated === true) {
				/* write changes to block back */
				$this->data['blocks'][$index] = $block;
			}
			$this->currentFix = null;
			$this->currentBlock = null;
		}

		private function registerFixes(): void
		{
			// Keep only migrations that cannot be inferred from defaultValues.json here.
			//OASYS 3.2.40
			$this->fixes[] = ['type' => 'conceptmap', 'field' => 'processing', 'action' => 'resetProperty', 'default' => 'manual'];
		}

		private function registerDefaultFixes(): void
		{
			$manifestFile = __DIR__ . '/../interactions/manifest.json';
			if (!is_readable($manifestFile)) {
				throw new RuntimeException('Could not read the interaction manifest.');
			}
			$manifestContent = file_get_contents($manifestFile);
			if ($manifestContent === false) {
				throw new RuntimeException('Could not read the interaction manifest.');
			}

			try {
				$manifest = json_decode($manifestContent, true, 512, JSON_THROW_ON_ERROR);
			} catch (JsonException $e) {
				throw new RuntimeException('Could not parse the interaction manifest.', 0, $e);
			}
			if (!is_array($manifest) || !is_array($manifest['paths'] ?? null)) {
				throw new RuntimeException('The interaction manifest does not contain a valid paths map.');
			}

			foreach ($manifest['paths'] as $interaction => $folder) {
				if (!is_string($interaction) || $interaction === '' || !is_string($folder) || $folder === '') {
					throw new RuntimeException('The interaction manifest contains an invalid path entry.');
				}
				$defaultValuesFile = __DIR__ . "/../interactions/$folder/$interaction/defaultValues.json";
				if (!is_readable($defaultValuesFile)) {
					throw new RuntimeException("Could not read default values for interaction '$interaction'.");
				}
				$defaultValuesContent = file_get_contents($defaultValuesFile);
				if ($defaultValuesContent === false) {
					throw new RuntimeException("Could not read default values for interaction '$interaction'.");
				}

				try {
					$defaultValues = json_decode($defaultValuesContent, false, 512, JSON_THROW_ON_ERROR);
				} catch (JsonException $e) {
					throw new RuntimeException("Could not parse default values for interaction '$interaction'.", 0, $e);
				}
				if (!is_array($defaultValues) || !array_is_list($defaultValues)) {
					throw new RuntimeException("Default values for interaction '$interaction' must be a list.");
				}

				foreach ($defaultValues as $index => $definition) {
					if (
						!$definition instanceof stdClass
						|| !property_exists($definition, 'value')
						|| !property_exists($definition, 'localized')
						|| !is_bool($definition->localized)
						|| !is_array($definition->path ?? null)
						|| !array_is_list($definition->path)
						|| count($definition->path) === 0
						|| count(array_filter($definition->path, static fn($key) => !is_string($key) || $key === '')) > 0
					) {
						throw new RuntimeException("Default value $index for interaction '$interaction' is invalid.");
					}

					$this->fixes[] = [
						'type' => $interaction,
						'field' => implode('.', $definition->path),
						'path' => $definition->path,
						'action' => $definition->localized ? 'localize' : 'addProperty',
						'default' => $definition->value
					];
				}
			}
		}

		/* ---- fixers ---- */

		private function localize(&$block, $fix): bool
		{
			$languages = $this->data['languages'];
			if (count($languages) === 0) {
				$this->log('cannot localize without a page language');
				return false;
			}

			$path = $fix['path'];
			$fieldName = array_pop($path);
			$parent =& $block;
			foreach ($path as $key) {
				if ($parent instanceof stdClass) {
					if (!property_exists($parent, $key)) {
						$parent->$key = new stdClass();
					}
					$parent =& $parent->$key;
				} elseif (is_array($parent)) {
					if (!array_key_exists($key, $parent)) {
						$parent[$key] = new stdClass();
					}
					$parent =& $parent[$key];
				} else {
					$this->log("cannot add property below non-object path '$key'");
					return false;
				}
			}

			$fieldExists = $parent instanceof stdClass
				? property_exists($parent, $fieldName)
				: (is_array($parent) && array_key_exists($fieldName, $parent));
			if (!$parent instanceof stdClass && !is_array($parent)) {
				$this->log('cannot add localized property to a non-object');
				return false;
			}

			if (!$fieldExists) {
				$localizedValue = $this->createLocalizedValue($fix['default'], $languages);
				if ($parent instanceof stdClass) {
					$parent->$fieldName = $localizedValue;
				} else {
					$parent[$fieldName] = $localizedValue;
				}
				$this->log("localized {$fix['field']} added");
				return true;
			}

			if ($parent instanceof stdClass) {
				$field =& $parent->$fieldName;
			} else {
				$field =& $parent[$fieldName];
			}
			if ($field instanceof stdClass) {
				$fieldKeys = array_keys(get_object_vars($field));
				$knownLanguageKeys = array_intersect($fieldKeys, $languages);
				if (count($fieldKeys) === 0 || count($knownLanguageKeys) > 0) {
					$updated = false;
					foreach ($languages as $language) {
						if (!property_exists($field, $language)) {
							$field->$language = $this->copyValue($fix['default']);
							$updated = true;
						}
					}
					if ($updated) {
						$this->log('missing language values added');
					}
					return $updated;
				}

				if (!$fix['default'] instanceof stdClass) {
					$this->log('object detected, but keys do not match languages');
					return false;
				}
			}

			$field = $this->createLocalizedValue($field, $languages);
			$this->log('localized');
			return true;
		}

		private function addProperty(&$block, $fix): bool
		{
			$path = $fix['path'];
			$fieldName = array_pop($path);
			$parent =& $block;
			foreach ($path as $key) {
				if ($parent instanceof stdClass) {
					if (!property_exists($parent, $key)) {
						$parent->$key = new stdClass();
					}
					$parent =& $parent->$key;
				} elseif (is_array($parent)) {
					if (!array_key_exists($key, $parent)) {
						$parent[$key] = new stdClass();
					}
					$parent =& $parent[$key];
				} else {
					$this->log("cannot add property below non-object path '$key'");
					return false;
				}
			}

			if ($parent instanceof stdClass) {
				if (property_exists($parent, $fieldName)) {
					return false;
				}
				$parent->$fieldName = $this->copyValue($fix['default']);
			} elseif (is_array($parent)) {
				if (array_key_exists($fieldName, $parent)) {
					return false;
				}
				$parent[$fieldName] = $this->copyValue($fix['default']);
			} else {
				$this->log('cannot add property to a non-object');
				return false;
			}

			$this->log($fix['field'] . ' added');
			return true;
		}

		private function createLocalizedValue(mixed $value, array $languages): stdClass
		{
			$localizedValue = new stdClass();
			foreach ($languages as $language) {
				$localizedValue->$language = $this->copyValue($value);
			}
			return $localizedValue;
		}

		private function copyValue(mixed $value): mixed
		{
			if (is_array($value)) {
				$copy = [];
				foreach ($value as $key => $entry) {
					$copy[$key] = $this->copyValue($entry);
				}
				return $copy;
			}
			if ($value instanceof stdClass) {
				$copy = new stdClass();
				foreach (get_object_vars($value) as $key => $entry) {
					$copy->$key = $this->copyValue($entry);
				}
				return $copy;
			}
			return $value;
		}

		private function resetProperty(&$block, $fix): bool
		{
			if ($block->{$fix['field']} === $fix['default']) {
				return false; //no update necessary
			}
			$block->{$fix['field']} = $fix['default'];
			$this->log($fix['field'] . " reset to {$fix['default']}");
			return true; //update done
		}

		private function runCustomQueries(): void
		{
			//run custom queries for specific fixes
			$queries[] = ["UPDATE items SET blocks='[]' WHERE blocks='{}'", 'empty block objects normalized'];
			$queries[] = ["UPDATE items SET metadata='{}' WHERE metadata IS NULL", 'missing metadata initialized'];
			$queries[] = ["UPDATE items SET metadata = JSON_SET(metadata, '$.useAsStimulus', JSON_EXTRACT('true', '$')) WHERE id IN (SELECT DISTINCT link FROM items WHERE NOT ISNULL(link)) AND COALESCE(JSON_CONTAINS(metadata, '{\"useAsStimulus\":true}'), 0) = 0", 'stimulus metadata updated'];
			$queries[] = ["UPDATE users SET accessDef=JSON_SET(accessDef,'$.userSettings.skin','Default Responsive') WHERE JSON_UNQUOTE(JSON_EXTRACT(accessDef,'$.userSettings.skin'))='Default Skin'", 'user skins updated'];
			$queries[] = ["UPDATE tests SET skin=JSON_SET(skin,'$.skin','Default Responsive') WHERE JSON_UNQUOTE(JSON_EXTRACT(skin,'$.skin'))='Default Skin'", 'test skins updated'];
			foreach ($queries as [$query, $message]) {
				$res = $this->db->execute($query);
				$rows = (int)($res['rows'] ?? 0);
				if ($rows > 0) {
					$this->changeCount += $rows;
					$rowLabel = $rows === 1 ? 'row' : 'rows';
					$this->log("$message ($rows $rowLabel)");
				}
			}
		}

	}
