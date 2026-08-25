<?php

	require_once(__DIR__ . "/../../../inc/php/rixPDO.php");
	require_once(__DIR__ . "/../../interactions/InteractionCompiler.php");
	require_once(__DIR__ . "/../../../inc/php/parser.php");
	require_once(__DIR__ . "/../../../inc/php/database.php");

	class pageClass
	{

		private array $returnData;
		private array $data;
		private rixPDO $db;
		private ?uiLang $uiLang;
		private ?userAuth $myAuth;

		public function __construct(&$returnData, $data = [])
		{
			global $sql_host, $sql_password, $sql_user, $sql_db, $uiLang, $myAuth;
			$this->returnData = &$returnData;
			$this->uiLang = &$uiLang;
			$this->myAuth = &$myAuth;
			$this->data = $data;

			//init database connections
			$this->db = new rixPDO($sql_db, $sql_user, $sql_password, $sql_host, __DIR__ . '/../../../logs/pageActions.txt', 1, $this->returnData, 'error');
		}

		public function execute($action): void
		{
			if (method_exists($this, $action)) {
				call_user_func([$this, $action]);
			} else {
				$this->returnData['error'] = "Undefined action: '$action'";
			}
		}

		private function fetchPage(): void
		{
			$this->checkParams('id');
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
			$this->checkEditability();

			$pageData = $this->data['pageData'];
			$compiler = new InteractionCompiler($pageData['blocks'], $pageData['languages'], $this->data['id'], $this->db, []);
			$compiler->compileBlocks();
			$pageData['fields'] = $compiler->getFields();
			$pageData['options'] = $compiler->getOptions();
			$pageData['parsed'] = $compiler->getParsed();
			$pageData['scripts'] = $compiler->getScripts();
			$pageData['blocks'] = $compiler->getBlocks();
			$newMetaData = $compiler->getMetadata();
			$this->returnData['compilationErrors'] = $compiler->getErrors();
			$blockIds = [];
			$this->returnData['data']['blocks'] = json_decode($pageData['blocks']);
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
			$this->db->update("items", $pageData, "id = ?", [$this->data['id']]);
		}

		private function removeLinks(): void
		{
			/*
			 * Remove all links to the page with the given id
			 * This is used when a page is defined not to be used as a stimulus anymore
			 * P.S.: On deletion of a page, the links to it are set to NULL automatically by foreign key constraints
			 */
			$this->checkParams('id', 'groupId');
			$this->db->update("items", ['link' => null], "link = ?", [$this->data['id']]);

			$res = $this->db->fetchTable("SELECT name, itemCode, id, CAST(IFNULL(JSON_VALUE(metadata, '$.useAsStimulus'), 0) AS UNSIGNED) as stimulus, link FROM items WHERE groupId = ? AND ID <> ?", [$this->data['groupId'], $this->data['id']]);
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
			$pageData['fields'] = $compiler->getFields();
			$pageData['options'] = $compiler->getOptions();
			$pageData['parsed'] = $compiler->getParsed();
			$pageData['scripts'] = $compiler->getScripts();
			$pageData['blocks'] = $compiler->getBlocks();
			$newMetaData = $compiler->getMetadata();
			$this->returnData['compilationErrors'] = $compiler->getErrors();
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

		private function getAllPageIds(): void
		{
			$res = $this->db->fetchColumn("SELECT id FROM items WHERE NOT ISNULL(blocks)");
			$this->returnData['data'] = $res['data'];
		}

		private function checkEditability(): void
		{
			$sessionId = $_COOKIE[session_name()] ?? null;

			$query = <<<'SQL'
				SELECT
				  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(`lock`, '$.sessionId')), 'null') AS sessionId,
				  TIMESTAMPDIFF(
					SECOND,
					NULLIF(JSON_UNQUOTE(JSON_EXTRACT(`lock`, '$.timestamp')), 'null'),
					NOW()
				  ) AS delta_t
				FROM items
				WHERE id = ?
				LIMIT 1;
			SQL;

			$parameters = [$this->data['id']];
			$result = $this->db->fetchRow($query, $parameters);

			//Show error message if selected item group is not availabe anymore
			if ($result['rows'] === 0 || ($result['data']['sessionId'] !== null && $result['data']['sessionId'] !== $sessionId)) {
				$this->returnData['error'] = $this->uiLang->translate("Connection to server was interrupted. Cannot save page!");
				die();
			}
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
