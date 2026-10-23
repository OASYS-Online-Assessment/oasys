<?php

	class testUpdater
	{
		private array $returnData;
		private rixPDO $db;

		public function __construct(array &$returnData)
		{
			global $app;
			$this->returnData = &$returnData;
			$this->db = $app->getDatabaseInstance();
		}

		public function checkAllTests(bool $simulate = false): void
		{
			$this->returnData['log'] = [];
			$this->returnData['changeCount'] = 0;
			$emptyArrayCondition = <<<'SQL'
				JSON_TYPE(JSON_EXTRACT(skin, '$.skinOptions')) = 'ARRAY'
					AND JSON_LENGTH(skin, '$.skinOptions') = 0
				SQL;
			if ($simulate) {
				$res = $this->db->fetchValue("SELECT COUNT(*) FROM tests WHERE $emptyArrayCondition");
				$rows = (int)$res['data'];
			} else {
				$query = "UPDATE tests SET skin = JSON_SET(skin, '$.skinOptions', JSON_OBJECT()) WHERE $emptyArrayCondition";
				$res = $this->db->execute($query);
				$rows = (int)($res['rows'] ?? 0);
			}
			if ($rows > 0) {
				$this->returnData['changeCount'] += $rows;
				$rowLabel = $rows === 1 ? 'row' : 'rows';
				$action = $simulate ? 'would be converted' : 'converted';
				$this->returnData['log'][] = "[tests] empty skin option arrays $action to objects ($rows $rowLabel)";
			}

			$query = <<<'SQL'
				SELECT id, skin
				FROM tests
				WHERE JSON_TYPE(
					JSON_EXTRACT(
						skin,
						CONCAT(
							'$.skinOptions.',
							JSON_EXTRACT(JSON_KEYS(skin, '$.skinOptions'), '$[0]')
						)
					)
				) = 'OBJECT'
				SQL;
			$res = $this->db->fetchTable($query);
			foreach ($res['data'] as $test) {
				$skin = json_decode($test['skin'], false, 512, JSON_THROW_ON_ERROR);
				if (!$skin instanceof stdClass || !($skin->skinOptions ?? null) instanceof stdClass) {
					throw new UnexpectedValueException("Invalid skin options for test {$test['id']}.");
				}

				foreach ($skin->skinOptions as $key => $option) {
					if (!$option instanceof stdClass || !property_exists($option, 'value')) {
						throw new UnexpectedValueException("Missing skin option value for test {$test['id']}: $key.");
					}
					$skin->skinOptions->$key = $option->value;
				}

				$skinJson = json_encode($skin, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
				if (!$simulate) {
					$res = $this->db->update('tests', ['skin' => $skinJson], 'id = ?', [$test['id']]);
				}
				if ($simulate || $res['rows'] === 1) {
					$this->returnData['changeCount']++;
					$action = $simulate ? 'would be reduced' : 'reduced';
					$this->returnData['log'][] = "[test: {$test['id']}] skin options $action to their values";
				}
			}
		}
	}
