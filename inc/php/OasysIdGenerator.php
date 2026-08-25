<?php


	class OasysIdGenerator
	{

		private stdClass $counters, $finalCounters;
		private stdClass $fields;
		private int $id = -1;
		static private ?OasysIdGenerator $instance = null;

		static private array $pendingIds = [];

		public static function getInstance(&$fields, $id): OasysIdGenerator
		{
			if (self::$instance === null) {
				self::$instance = new OasysIdGenerator();
			}
			self::$instance->setFields($fields);
			self::$instance->setId($id);
			return self::$instance;
		}

		public function __construct()
		{
		}

		public function setFields(&$fields): void
		{
			$this->fields = &$fields;
		}

		public function setId($id): void
		{
			//if new page id comes into play, reset counters to restart counting from 0
			if ($this->id !== $id) {
				$this->id = $id;
				$this->counters = new stdClass();
				$this->finalCounters = new stdClass();
			}
		}

		public function getId($language, $prefix): string
		{
			if (!is_array($language)) {
				$language = [$language];
			}

			$tempId = null;
			$tempCounters = [];

			foreach ($language as $lang) {
				//initialize counter for new language resp. prefix if required
				if (!isset($this->counters->$lang[$prefix])) {
					$this->counters->$lang[$prefix] = 1;
				}

				$counter = $this->counters->$lang[$prefix];

				$tempCounters[$lang] = $counter;
			}

			//find the highest counter in tempCounters (which should all be equal, but users are unpredictable)
			$maxCounter = max($tempCounters);

			//now write back the incremented counter to all languages
			foreach ($language as $lang) {
				$this->counters->$lang[$prefix] = $maxCounter + 1;
			}

			$tempId = '__' . $prefix . $maxCounter;
			self::$pendingIds[$tempId] = [
				'language' => $language,
				'prefix' => $prefix
			];

			return $tempId;
		}

		public function transformPendingId($tempId): ?string
		{
			if (!isset(self::$pendingIds[$tempId])) {
				return null;
			}
			$prefix = self::$pendingIds[$tempId]['prefix'];
			return $this->getFinalId($prefix);
		}

		public function getFinalId($prefix): string
		{
			//initialize counter if necessary
			if (!isset($this->finalCounters->$prefix)) {
				$this->finalCounters->$prefix = 1;
			}

			$counter = $this->finalCounters->$prefix++;

			//check if another field has manually been created to use this id and if so keep incrementing
			do {
				$id = $prefix . $counter++;
			} while (isset($this->fields->$id));

			//write new counter state back into the finalCounters property for later use
			$this->finalCounters->$prefix = $counter;

			return $id;
		}

	}