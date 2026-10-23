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

		public function checkAllTests(): void
		{
			$this->returnData['log'] = [];
			$this->returnData['changeCount'] = 0;
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

				$res = $this->db->update('tests', [
					'skin' => json_encode($skin, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)
				], 'id = ?', [$test['id']]);
				if ($res['rows'] === 1) {
					$this->returnData['changeCount']++;
					$this->returnData['log'][] = "[test: {$test['id']}] skin options reduced to their values";
				}
			}
		}
	}
