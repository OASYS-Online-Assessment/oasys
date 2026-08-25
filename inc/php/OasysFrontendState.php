<?php

	/**
	 * OasysFrontendState v1.2.2
	 * This class is used to manage the state of the Oasys frontend. It replaces sessions and has the
	 * advantage of working atomically with the database. This means that 2 parallel running PHP scripts
	 * can work on the same state without any problems.
	 * dependencies: StateExpiredException.php, InvalidKeyException.php, rixPDO.php, database.php
	 * version history:
	 * v1.1.1:
	 * 		baseline version after a number of initial tests and improvements
	 * v1.1.2:
	 * 		modification of namespace declarations
	 * v1.2.0:
	 * 		modifications and additions on monitoring activity
	 * v1.2.1:
	 * 		derived active-login monitoring from the connection retry window instead of state retention
	 * v1.2.2:
	 * 		added getNumberOfActiveClients()
	 * usage:
	 *    Creating a new instance:
	 *        $state = OasysFrontendState::getInstance($instanceId, true);
	 *        $instanceId is a unique identifier for the instance. It can be any string.
	 *    Getting an existing instance:
	 *        $state = OasysFrontendState::getInstance($instanceId);
	 *        $instanceId is a unique identifier for the already existing instance. If none exists, a StateExpiredException
	 *        is thrown.
	 *    Setting a property:
	 *        $state->propertyName = $value;
	 *        propertyName is the name of the property to set. It can be any string.
	 *        value is the value to set. It can be any type.
	 *    Getting a property:
	 *        $value = $state->propertyName;
	 *        propertyName is the name of the property to get. It can be any string.
	 *  Check if this stateId is still active (any window of this browser is logged in or was logged in shortly)
	 *        $active = OasysFrontendState::stateIdActive();
	 **/

	declare(strict_types=1);

	namespace Oasys\FrontEnd;

	global $filterSettings;
	if (!isset($filterSettings)) {
		$filterSettings = true; // enable filtering of input data if not previously disabled deliberately
	}

	require_once __DIR__ . "/rixPDO.php";
	require_once __DIR__ . "/database.php";
	require_once __DIR__ . "/exceptions/StateExpiredException.php";
	require_once __DIR__ . "/exceptions/InvalidKeyException.php";

	use Oasys\exceptions\InvalidKeyException;
	use Oasys\exceptions\StateExpiredException;
	use Random\RandomException;
	use rixPDO;

	class OasysFrontendState
	{
		private static array $instances = [];

		const array ALLOWED_PROPERTIES = [
			'loginId', 'passwordId', 'testId', 'studentId', 'preview'
		];

		private string $logFile;
		private mixed $logHandle;
		private string $stateId;
		private string $instanceId;
		private static int $timeOut = 2 * 60 * 60; //states are cleaned after 2 hours of no activity
		private const int ACTIVE_LOGIN_SAFETY_MARGIN = 2 * 60;
		private static rixPDO $db;

		/**
		 * @throws StateExpiredException
		 */
		private function __construct(string $instanceId, bool $init)
		{
			$this->logFile = __DIR__ . "/../../logs/OasysState.txt";
			$this->openLogFile();

			//clean out any states that have overstayed their welcome
			$this->cleanStaleStates();

			//get stateId from cookie or create new one
			$this->stateId = static::getStateId();
			$this->instanceId = $instanceId;

			//check if instanceId exists in table and create if $init is true, otherwise fail
			static::getDBHandle();
			$query = "SELECT COUNT(*) FROM stateFrontend WHERE stateId = ? AND instanceId = ?";
			$res = static::$db->fetchValue($query, [$this->stateId, $this->instanceId]);
			if ($res['data'] === 0) {
				if ($init) {
					static::$db->insert('stateFrontend', ['stateId' => $this->stateId, 'instanceId' => $this->instanceId]);
				} else {
					throw new StateExpiredException();
				}
			}
		}

		// Prevent cloning
		public function __clone()
		{
		}

		// Prevent unserialization
		public function __wakeup()
		{
		}

		public function __destruct()
		{
			$this->closeLogFile();
		}

		/**
		 * @throws StateExpiredException
		 */
		public static function getInstance(string $instanceId, bool $init = false): OasysFrontendState
		{
			if (!isset(self::$instances[$instanceId])) {
				self::$instances[$instanceId] = new OasysFrontendState($instanceId, $init);
			}
			self::$instances[$instanceId]->updateTimeStamp();
			return self::$instances[$instanceId];
		}

		public function __get(string $property): mixed
		{
			if (in_array($property, self::ALLOWED_PROPERTIES)) {
				return $this->getProperty($property);
			} else {
				return $this->getDataProperty($property);
			}
		}

		/**
		 * @throws InvalidKeyException
		 */
		public function __set(string $property, mixed $value): void
		{
			if (in_array($property, self::ALLOWED_PROPERTIES)) {
					$this->setProperty($property, $value);
			} else {
				$this->setDataProperty($property, $value);
			}
		}

		private function openLogFile(): void
		{
			if ((!file_exists($this->logFile) && is_writable(dirname($this->logFile))) || is_writable($this->logFile)) {
				$this->logHandle = fopen($this->logFile, 'a');
			} else {
				$this->logHandle = false;
				error_log("OasysState error 01: log file '$this->logFile' is not writeable");
			}
		}

		private function log(string $message): void
		{
			if (isset($this->logHandle) && is_resource($this->logHandle)) {
				fwrite($this->logHandle, date('Y-m-d H:i:s') . " [$this->stateId, $this->instanceId] $message\n");
			}
		}

		private function closeLogFile(): void
		{
			if (isset($this->logHandle) && is_resource($this->logHandle)) {
				fclose($this->logHandle);
			}
		}

		private static function getStateId(): string
		{
			global $settings;
			if (isset($_COOKIE['oasysStateFrontend'])) {
				return $_COOKIE['oasysStateFrontend'];
			} else {
				try {
					$stateId = bin2hex(random_bytes(6));
				} catch (RandomException $e) {
					$stateId = uniqid();
				}
				setcookie('oasysStateFrontend', $stateId, [
					'path' => $settings['JSrootURL'],
					'secure' => $settings['cookieSecure'] ?? false,
					'httponly' => true,
					'samesite' => $settings['cookieSameSite'] ?? 'Lax',
				]);
				return $stateId;
			}
		}

		// Deletes any existing state for a specific loginId and passwordId
		public static function purge($passwordId, $testId = null): void
		{
			static::getDBHandle();
			if ($testId !== null) {
				$query = "DELETE FROM stateFrontend WHERE passwordId = ? AND testId = ?";
				static::$db->execute($query, [$passwordId, $testId]);
			} else {
				// If no testId is given, delete all states for the given passwordId
				$query = "DELETE FROM stateFrontend WHERE passwordId = ?";
				static::$db->execute($query, [$passwordId]);
			}
		}

		public function eraseState(): void
		{
			$query = "DELETE FROM stateFrontend WHERE stateId = ? AND instanceId = ?";
			static::$db->execute($query, [$this->stateId, $this->instanceId]);
		}

		/* setProperty and getProperty are private methods to prevent arbitrary values for $property to be used in
		the queries, which would be a huge security risk as it allows SQL insertions */

		private function setProperty(string $property, mixed $value): void
		{
			$data = [
				'stateId' => $this->stateId,
				'instanceId' => $this->instanceId,
				$property => $value
			];
			$res = static::$db->insert('stateFrontend', [$data], 'update', [$property]);
			if ($res['error']) {
				$this->log("error inserting data into table 'stateFrontend': " . $res['error']);
			}
		}

		private function getProperty(string $property): mixed
		{
			$query = "SELECT $property FROM stateFrontend WHERE stateId = ? AND instanceId = ?";
			$res = static::$db->fetchValue($query, [$this->stateId, $this->instanceId]);
			if ($res['error']) {
				$this->log("error fetching data from table 'stateFrontend': " . $res['error']);
			}
			return $res['data'];
		}

		/**
		 * @throws InvalidKeyException
		 */
		private function setDataProperty(string $property, mixed $value): void
		{
			//make sure propery is alphanumeric
			if (!preg_match('/^[a-zA-Z0-9_]+$/', $property)) {
				throw new InvalidKeyException($property);
			}

			$wrap = $this->wrapValue($value);
			$whereClause = "stateId = :stateId AND instanceId = :instanceId";

			//set json value in "data" column at path $property
			$query = "UPDATE stateFrontend SET data = JSON_SET(COALESCE(data, '{}'),'$.$property', JSON_EXTRACT('{}', '$'), '$.$property.type', :type, '$.$property.value', :value) WHERE $whereClause";
			$res = static::$db->execute($query, ['stateId' => $this->stateId, 'instanceId' => $this->instanceId, 'value' => $wrap['value'], 'type' => $wrap['type']]);
			if ($res['error']) {
				$this->log("error inserting data into table 'stateFrontend': " . $res['error']);
			}
		}

		private function getDataProperty(string $property): mixed
		{
			//make sure propery is alphanumeric
			if (!preg_match('/^[a-zA-Z0-9_]+$/', $property)) {
				throw new InvalidKeyException($property);
			}

			$whereClause = "stateId = :stateId AND instanceId = :instanceId";

			//get json value in "data" column at path $property
			$query = "SELECT JSON_EXTRACT(data, '$.$property') AS value FROM stateFrontend WHERE $whereClause";
			$res = static::$db->fetchValue($query, ['stateId' => $this->stateId, 'instanceId' => $this->instanceId]);
			if ($res['error']) {
				$this->log("error fetching data from table 'stateFrontend': " . $res['error']);
				return null;
			}
			return $this->unwrapValue($res['data']);
		}

		private function wrapValue(mixed $value): array
		{
			$type = gettype($value);
			return match ($type) {
				'boolean', 'integer', 'double', 'string' => [
					'type' => $type,
					'value' => $value,
				],
				'array', 'object' => [
					'type' => $type,
					'value' => json_encode($value),
				],
				default => [
					'type' => 'invalid',
					'value' => null,
				],
			};
		}


		private function unwrapValue(string $entry): mixed
		{
			$decoded = json_decode($entry, true); // force array
			$type = $decoded['type'] ?? null;
			$val = $decoded['value'] ?? null;

			return match ($type) {
				'object' => json_decode($val, false),
				'array' => json_decode($val, true),
				'boolean' => filter_var($val, FILTER_VALIDATE_BOOLEAN),
				default => $val,
			};
		}

		private function updateTimeStamp(): void
		{
			$query = "UPDATE stateFrontend SET active = CURRENT_TIMESTAMP() WHERE stateId = ? AND instanceId = ?";
			static::$db->execute($query, [$this->stateId, $this->instanceId]);
		}

		public static function stateIdActive(): bool
		{
			static::getDBHandle();
			$query = "SELECT COUNT(*) FROM stateFrontend WHERE stateId = ? && TIMESTAMPDIFF(SECOND,active,NOW()) <= ?";
			$res = static::$db->fetchValue($query, [static::getStateId(), static::$timeOut]);
			return ($res['error'] === false && $res['data'] > 0);
		}

		public static function fetchActiveLogins(?int $timeOut = null): array
		{
			static::getDBHandle();
			if ($timeOut === null) {
				$timeOut = static::getDefaultActiveLoginTimeout();
			}
			$query = <<<SQL
				SELECT
				    stateFrontend.loginId,
					logins.`name` AS login, 
					tests.`name` AS test,
					activity.clientOpen,
					TIMESTAMPDIFF(SECOND, stateFrontend.active, NOW()) AS inactivityTime
				FROM
					stateFrontend
					INNER JOIN
					activity
					ON 
						stateFrontend.loginId = activity.loginId AND
						stateFrontend.passwordId = activity.passwordId AND
						stateFrontend.testId = activity.testId
					INNER JOIN
					logins
					ON 
						logins.id = activity.loginId
					INNER JOIN
					tests
					ON 
						tests.id = activity.testId
				WHERE
					activity.clientOpen = 1
					AND TIMESTAMPDIFF(SECOND, stateFrontend.active, NOW()) <= ?
			SQL;

			$res = static::$db->fetchTable($query, [$timeOut]);
			return ($res['error'] === false) ? $res['data'] : [];
		}

		public static function getNumberOfActiveClients(?int $timeOut = null): int
		{
			try {
				static::getDBHandle();
				if ($timeOut === null) {
					$timeOut = static::getDefaultActiveLoginTimeout();
				}

				$query = <<<SQL
					SELECT COUNT(*)
					FROM stateFrontend
					INNER JOIN activity
						ON stateFrontend.loginId = activity.loginId
						AND stateFrontend.passwordId = activity.passwordId
						AND stateFrontend.testId = activity.testId
					WHERE activity.clientOpen = 1
						AND TIMESTAMPDIFF(SECOND, stateFrontend.active, NOW()) <= ?
				SQL;

				$res = static::$db->fetchValue($query, [$timeOut]);
				if ($res['error'] !== false || !isset($res['data']) || !is_numeric($res['data'])) {
					return -1;
				}

				return (int)$res['data'];
			} catch (\Throwable) {
				return -1;
			}
		}

		private static function getDefaultActiveLoginTimeout(): int
		{
			global $settings;

			$retryCount = max(1, (int)($settings['retryCount'] ?? 3));
			$sendFrequency = max(1, (int)($settings['sendFrequency'] ?? 15));

			return ($retryCount * $sendFrequency) + static::ACTIVE_LOGIN_SAFETY_MARGIN;
		}

		private static function cleanStaleStates(): void
		{
			static::getDBHandle();
			$query = "DELETE FROM stateFrontend WHERE TIMESTAMPDIFF(SECOND,active,NOW()) > ?";
			static::$db->execute($query, [static::$timeOut]);
		}

		private static function getDBHandle(): void
		{
			global $app;

			//return if the database connection is already established
			if (isset(static::$db)) {
				return;
			}

			static::$db = $app->getDatabaseInstance();
		}

	}
