<?php

	require_once(__DIR__ . "/../../inc/php/rixPDO.php");
	require_once(__DIR__ . "/../interactions/InteractionCompiler.php");
	require_once(__DIR__ . "/../../inc/php/parser.php");
	require_once(__DIR__ . "/../../inc/php/database.php");

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
		private ?int $currentPage;
		private ?int $currentBlock;
		private ?array $currentFix;

		public function __construct(&$returnData)
		{
			global $sql_host, $sql_password, $sql_user, $sql_db, $uiLang, $myAuth;
			$this->returnData = &$returnData;

			//init database connections
			$this->db = new rixPDO($sql_db, $sql_user, $sql_password, $sql_host, __DIR__ . '/../../logs/pageUpdater.txt', 1, $this->returnData, 'error');
			$this->fixes = [];
			$this->log = [];
			$this->registerFixes();
		}

		public function checkAllPages($simulate = false): void
		{
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
			$this->clearLog();
		}

		public function checkSinglePage($id): void
		{
			$this->verifyPage($id);
			$this->returnData['log'] = $this->log;
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
			if (count($this->data['blocks']) > 0) {
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
			$compiler = new InteractionCompiler($pageData['blocks'], $pageData['languages'], $id, $this->db, []);
			$compiler->compileBlocks();
			$pageData['fields'] = $compiler->getFields();
			$pageData['options'] = $compiler->getOptions();
			$pageData['parsed'] = $compiler->getParsed();
			$pageData['scripts'] = $compiler->getScripts();
			$pageData['blocks'] = $compiler->getBlocks();
			unset ($pageData['languages']);
			$newMetaData = $compiler->getMetadata();
			$error = $compiler->getErrors();
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
				$this->log('recompiled');
			}
		}

		private function comparePageData(int $id): void
		{
			$pageData = $this->data;
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
				$updated = $this->{$fix['action']}($block, $fix);
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
			//OASYS 3.5.20
			$this->fixes[] = ['type' => 'choice', 'field' => 'rowgap', 'action' => 'addProperty', 'default' => 5];
			$this->fixes[] = ['type' => 'choice', 'field' => 'colgap', 'action' => 'addProperty', 'default' => 50];

			//OASYS 3.4.23
			$this->fixes[] = ['type' => 'button', 'field' => 'ignoreNavigationConstraints', 'action' => 'addProperty', 'default' => false];

			//OASYS 3.4.17
			$this->fixes[] = ['type' => 'inline_textfields', 'field' => 'filter', 'action' => 'addProperty', 'default' => 'none'];
			$this->fixes[] = ['type' => 'inline_textfields', 'field' => 'pattern', 'action' => 'addProperty', 'default' => 'none'];

			//OASYS 3.3.20
			$this->fixes[] = ['type' => 'textfield', 'field' => 'suffix', 'action' => 'addLocalizedProperty', 'default' => ''];

			//OASYS 3.2.40
			$this->fixes[] = ['type' => 'conceptmap', 'field' => 'processing', 'action' => 'resetProperty', 'default' => 'manual'];
			//OASYS 3.2.22
			$this->fixes[] = ['type' => 'image', 'field' => 'width', 'action' => 'localize'];
			//OASYS 3.1.000.028
			$this->fixes[] = ['type' => 'choice', 'field' => 'labelPosition', 'action' => 'addProperty', 'default' => 'right'];
			$this->fixes[] = ['type' => 'choice', 'field' => 'alignment', 'action' => 'addProperty', 'default' => 'left'];

			//only necessary for instances that were running in the develop branch, may be removed in the future
			$this->fixes[] = ['type' => 'conceptmap', 'field' => 'mandatory', 'action' => 'addProperty', 'default' => false];
			$this->fixes[] = ['type' => 'choice', 'field' => 'noreply', 'action' => 'addProperty', 'default' => ''];
		}

		/* ---- fixers ---- */

		private function localize(&$block, $fix): bool
		{
			$field = $block->{$fix['field']};
			$languages = $this->data['languages'];
			$updateRequired = false;
			if (is_object($field)) {
				$field_keys = array_keys(get_object_vars($field));
				if (count($languages) !== count($field_keys) || array_diff($languages, $field_keys) !== array_diff($field_keys, $languages)) {
					/* the field is already an array, but the keys do not match the existing languages
					   in this case the problem cannot be fixed automatically -> entry in error log */
					$this->log("array detected, but keys do not match languages");
				}
				return false;
			} else {
				/* field is not an array, so it is not localized yet -> copy existing value to all languages */
				$block->{$fix['field']} = new stdClass();
				foreach ($languages as $lng) {
					$block->{$fix['field']}->$lng = $field;
				}
				$this->log('localized');
				return true; //update was done
			}
		}

		private function addProperty(&$block, $fix): bool
		{
			if (!isset($block->{$fix['field']})) {
				//if property does not exist, set to default value
				$block->{$fix['field']} = $fix['default'];
				$this->log($fix['field'] . ' added');
				return true; //update done
			}
			return false; //no update necessary
		}

		private function addLocalizedProperty(&$block, $fix): bool
		{
			if (!isset($block->{$fix['field']})) {
				//if property does not exist, set to default value for all languages
				$block->{$fix['field']} = new stdClass();
				$languages = $this->data['languages'];
				foreach ($languages as $lng) {
					$block->{$fix['field']}->$lng = $fix['default'];
				}
				$this->log("localized {$fix['field']} added");
				return true; //update done
			}
			return false; //no update necessary
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
			$queries[] = "UPDATE items SET blocks='[]' WHERE blocks='{}'";
			$queries[] = "UPDATE items SET metadata='{}' WHERE metadata IS NULL";
			$queries[] = "UPDATE items SET metadata = JSON_SET(metadata, '$.useAsStimulus', true) WHERE id IN (SELECT DISTINCT link FROM items WHERE NOT ISNULL(link))";
			$queries[] = "UPDATE users SET accessDef=JSON_SET(accessDef,'$.userSettings.skin','Default Responsive') WHERE JSON_UNQUOTE(JSON_EXTRACT(accessDef,'$.userSettings.skin'))='Default Skin'";
			$queries[] = "UPDATE tests SET skin=JSON_SET(skin,'$.skin','Default Responsive') WHERE JSON_UNQUOTE(JSON_EXTRACT(skin,'$.skin'))='Default Skin'";
			foreach ($queries as $query) {
				$this->db->execute($query);
			}
		}

	}