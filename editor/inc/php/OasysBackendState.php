<?php

/**
 * OasysBackendState v1.4
 * This class replaces sessions for storing temporary data on the server side for a specific user. It stores data
 * in a database table instead of files, which makes it usable in a load-balanced environment.
 * Each user is identified by a stateId stored in a cookie sent alongside each request like session cookies.
 *
 * dependencies: StateExpiredException.php, InvalidKeyException.php, rixPDO.php, database.php
 *
 * version history:
 * v1.0		initial release, forked from OasysFrontendState v1.1.2
 * v1.1		fixed $timeOut not being set from settings, and switched its unit from seconds to minutes
 * v1.2		made several methods static
 * 			added a number of new static methods required for systemstate management
 * v1.3		separated the backend-login inactivity threshold from the state/session timeout
 * v1.4		sampled stale-state cleanup once per request with a 1-in-100 chance, skipping open transactions
 * 			checked current-state expiry independently and used direct activity cutoffs preserving timeout boundaries
 *
 * usage:
 *    Creating a new instance or getting one that already exists:
 *        $state = OasysBackendState::getInstance(true);
 *    Setting a property:
 *        $state->propertyName = $value;
 *        propertyName is the name of the property to set. It can be any string.
 *        value is the value to set. It can be any type.
 *    Getting a property:
 *        $value = $state->propertyName;
 *        propertyName is the name of the property to get. It can be any string.
 *  Check if this stateId is still active (any window of this browser is logged in or was logged in shortly)
 *        $active = OasysBackendState::stateIdActive();
 **/

declare(strict_types=1);

namespace Oasys\BackEnd;

require_once __DIR__ . "/../../../inc/php/OasysSettings.php";
require_once __DIR__ . "/../../../inc/php/exceptions/StateExpiredException.php";
require_once __DIR__ . "/../../../inc/php/exceptions/InvalidKeyException.php";

use Oasys\exceptions\InvalidKeyException;
use Oasys\exceptions\StateExpiredException;
use Oasys\OasysApp;
use Oasys\OasysSettings;
use Random\RandomException;
use rixPDO;

class OasysBackendState
{
	private static ?OasysBackendState $instance;
	private string $logFile = __DIR__ . '/../../../logs/OasysStateBackend.txt';
	private mixed $logHandle;
	private string $stateId;
	private static int $timeOut = 2 * 60;
	private static int $inactivityTimeOut = 10;
	private static bool $cleanupConsidered = false;
	private OasysSettings $settings;
	private rixPDO $db;
	private ?string $backup = null;

	/**
	 * @throws StateExpiredException
	 */
	private function __construct()
	{
		//get instances of settings and database
		$this->settings = OasysSettings::getInstance();
		static::$timeOut = $this->settings->getProperty('sessionTimeout') ?? static::$timeOut;
		static::$inactivityTimeOut = $this->settings->getProperty('backendInactivityTimeout') ?? static::$inactivityTimeOut;
		$this->db = $this->settings->getDatabaseInstance();
		$this->openLogFile();

		//get stateId from cookie or create new one
		$this->stateId = $this->getStateId();

		//clean out any states that have overstayed their welcome
		static::cleanStaleStates();

		//Check expiry independently of probabilistic cleanup, before refreshing activity.
		//The extra minute preserves the previous whole-minute TIMESTAMPDIFF boundary.
		$query = "SELECT COUNT(*) FROM stateBackend WHERE stateId = ? AND active > NOW() - INTERVAL ? MINUTE";
		$res = $this->db->fetchValue($query, [$this->stateId, static::$timeOut + 1]);
		if ($res['data'] === 0) {
			//Remove only this expired session; this is required even when global cleanup is skipped.
			$query = "DELETE FROM stateBackend WHERE stateId = ? AND active <= NOW() - INTERVAL ? MINUTE";
			$this->db->execute($query, [$this->stateId, static::$timeOut + 1]);
			//if no state exists in database yet insert it
			$this->db->insert('stateBackend', ['stateId' => $this->stateId]);
		} else {
			//if state does exist, update timestamp to mark it as active
			$this->updateTimeStamp();
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
	 * @throws InvalidKeyException
	 */
	public function __get(string $property): mixed
	{
		//make sure propery is alphanumeric
		if (!preg_match('/^[a-zA-Z0-9_]+$/', $property)) {
			throw new InvalidKeyException($property);
		}

		return $this->getDataProperty($property);
	}

	public function __isset(string $property): bool
	{
		//make sure propery is alphanumeric
		if (!preg_match('/^[a-zA-Z0-9_]+$/', $property)) {
			throw new InvalidKeyException($property);
		}

		return $this->issetDataProperty($property);
	}

	/**
	 * @throws InvalidKeyException
	 */
	public function __set(string $property, mixed $value): void
	{
		//make sure propery is alphanumeric
		if (!preg_match('/^[a-zA-Z0-9_]+$/', $property)) {
			throw new InvalidKeyException($property);
		}

		$this->setDataProperty($property, $value);
	}

	/**
	 * @throws InvalidKeyException
	 */
	public function __unset(string $property): void
	{
		//make sure propery is alphanumeric
		if (!preg_match('/^[a-zA-Z0-9_]+$/', $property)) {
			throw new InvalidKeyException($property);
		}

		$this->unsetDataProperty($property);
	}

	private function openLogFile(): void
	{
		if ((!file_exists($this->logFile) && is_writable(dirname($this->logFile))) || is_writable($this->logFile)) {
			$this->logHandle = fopen($this->logFile, 'a');
		} else {
			$this->logHandle = false;
			error_log("OasysBackendState error: cannot open log file " . $this->logFile . " for writing");
		}
	}

	private function log(string $message): void
	{
		if (isset($this->logHandle) && is_resource($this->logHandle)) {
			fwrite($this->logHandle, date('Y-m-d H:i:s') . " [$this->stateId] $message\n");
		}
	}

	private function closeLogFile(): void
	{
		if (isset($this->logHandle) && is_resource($this->logHandle)) {
			fclose($this->logHandle);
		}
	}

	private function setCookie($stateId, $expired = false): void
	{
		if (!$expired) {
			setcookie('oasysStateBackend', $stateId, [
				'path' => $this->settings->getProperty('JSrootURL'),
				'secure' => $this->settings->getProperty('cookieSecure') ?? false,
				'httponly' => true,
				'samesite' => $this->settings->getProperty('cookieSameSite') ?? 'Lax'
			]);
		} else {
			setcookie('oasysStateBackend', '', [
				'path' => $this->settings->getProperty('JSrootURL'),
				'secure' => $this->settings->getProperty('cookieSecure') ?? false,
				'httponly' => true,
				'samesite' => $this->settings->getProperty('cookieSameSite') ?? 'Lax',
				'expires' => time() - 3600 // set expiration in the past to delete cookie
			]);
		}
	}

	public function getStateId(): string
	{
		if (isset($_COOKIE['oasysStateBackend'])) {
			return $_COOKIE['oasysStateBackend'];
		} else {
			//create a new stateId, make sure the same stateId is not already in use (extremely unlikely) and set cookie
			$needNewStateId = true;
			$stateId = 0;
			while ($needNewStateId) {
				try {
					$stateId = bin2hex(random_bytes(10));
				} catch (RandomException $e) {
					$stateId = uniqid();
				}
				$query = "SELECT COUNT(*) FROM stateBackend WHERE stateId = ?";
				$res = $this->db->fetchValue($query, [$stateId]);
				if ($res['error']) {
					$this->log("error checking for existing stateId in table 'stateBackend': " . $res['error']);
					error_log("OasysBackendState error: " . $res['error']);
					die();
				}
				if ($res['data'] === 0) {
					$needNewStateId = false;
				}
				//if stateId already exists, loop again and create a new one
			}
			$this->setCookie($stateId);
			return $stateId;
		}
	}

	public function rotateStateId(): void
	{
		/*
		 * If the incoming request has no cookie, the constructor has already
		 * created a fresh state ID, inserted its database row and queued the
		 * corresponding cookie. This occurs, for example, on the successful
		 * login attempt immediately following a failed attempt. Generating a
		 * second ID here would point the response cookie at an ID with no state
		 * row and the authenticated state would be lost on the next request.
		 * A newly generated state does not need another rotation.
		 */
		if (!isset($_COOKIE['oasysStateBackend'])) {
			return;
		} elseif ($this->stateId !== $_COOKIE['oasysStateBackend']) {
			//if stateId is different from cookie, update stateId to cookie value
			$this->stateId = $_COOKIE['oasysStateBackend'];
		}
		//… else create a new stateId and update the database record with the new stateId an replace cookie
		//create a new stateId, make sure the same stateId is not already in use (extremely unlikely) and set cookie
		$needNewStateId = true;
		$newStateId = 0;
		while ($needNewStateId) {
			try {
				$newStateId = bin2hex(random_bytes(10));
			} catch (RandomException $e) {
				$newStateId = uniqid();
			}
			$query = "SELECT COUNT(*) FROM stateBackend WHERE stateId = ?";
			$res = $this->db->fetchValue($query, [$newStateId]);
			if ($res['error']) {
				$this->log("error checking for existing stateId in table 'stateBackend': " . $res['error']);
				error_log("OasysBackendState error: " . $res['error']);
				die();
			}
			if ($res['data'] === 0) {
				$needNewStateId = false;
			}
			//if stateId already exists, loop again and create a new one
		}
		$query = "UPDATE stateBackend SET stateId = ? WHERE stateId = ?";
		$this->db->execute($query, [$newStateId, $this->stateId]);
		$this->setCookie($newStateId);
		$this->stateId = $newStateId;
	}

	public function eraseState(): void
	{
		$query = "DELETE FROM stateBackend WHERE stateId = ?";
		$this->db->execute($query, [$this->stateId]);

		//delete cookie
		$this->setCookie('', true);
		$this->stateId = '';
		static::$instance = null;
	}

	/**
	 * @throws InvalidKeyException
	 */
	private function setDataProperty(string $property, mixed $value): void
	{
		$wrap = static::wrapValue($value);
		$whereClause = "stateId = :stateId";

		//set json value in "data" column at path $property
		$query = "UPDATE stateBackend SET data = JSON_SET(COALESCE(data, '{}'),'$.$property', JSON_EXTRACT('{}', '$'), '$.$property.type', :type, '$.$property.value', :value) WHERE $whereClause";
		$res = $this->db->execute($query, ['stateId' => $this->stateId, 'value' => $wrap['value'], 'type' => $wrap['type']]);
		if ($res['error']) {
			$this->log("error inserting data into table 'stateBackend': " . $res['error']);
		}
	}

	private function getDataProperty(string $property): mixed
	{
		$whereClause = "stateId = :stateId";

		//get json value in "data" column at path $property
		$query = "SELECT JSON_EXTRACT(data, '$.$property') AS value FROM stateBackend WHERE $whereClause";
		$res = $this->db->fetchValue($query, ['stateId' => $this->stateId]);
		if ($res['error']) {
			$this->log("error fetching data from table 'stateBackend': " . $res['error']);
			return null;
		}
		return static::unwrapValue($res['data']);
	}

	private function issetDataProperty(string $property): bool
	{
		return ($this->getDataProperty($property) !== null);
	}

	private function unsetDataProperty(string $property): void
	{
		$whereClause = "stateId = :stateId";

		//unset json value in "data" column at path $property
		$query = "UPDATE stateBackend SET data = JSON_REMOVE(data, '$.$property') WHERE $whereClause";
		$res = $this->db->execute($query, ['stateId' => $this->stateId]);
		if ($res['error']) {
			$this->log("error unsetting data in table 'stateBackend': " . $res['error']);
		}
	}

	private function updateTimeStamp(): void
	{
		$query = "UPDATE stateBackend SET active = CURRENT_TIMESTAMP() WHERE stateId = ?";
		$this->db->execute($query, [$this->stateId]);
	}

	public function isStateActive(): bool
	{
		$query = "SELECT COUNT(*) FROM stateBackend WHERE stateId = ? AND active > NOW() - INTERVAL ? MINUTE";
		$res = $this->db->fetchValue($query, [$this->getStateId(), static::$timeOut + 1]);
		return ($res['error'] === false && $res['data'] > 0);
	}

	public function getAllStateData($unwrap = true): array|string
	{
		$query = "SELECT `data` FROM stateBackend WHERE stateId = ?";
		$res = $this->db->fetchValue($query, [$this->stateId]);
		if ($unwrap) {
			return self::unwrapAllProperties($res['data'] ?? '{}');
		} else {
			return $res['data'] ?? '{}';
		}
	}

	public function nukeAllStatesExceptCurrent(): void
	{
		$query = "DELETE FROM stateBackend WHERE stateId != ?";
		$this->db->execute($query, [$this->stateId]);
	}

	public function backupState(): void {
		$this->backup = $this->getAllStateData(false); //for the backup we do not unwrap the data
	}

	public function restoreState(): void
	{
		if ($this->backup !== null) {
			//insert state data from backup into the database, overwriting any existing data for this stateId
			$query = "INSERT INTO stateBackend (stateId, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = ?";
			$this->db->execute($query, [$this->stateId, $this->backup, $this->backup]);
		}
	}

	/*
	 * -------------------------------------------------------------------------
	 * Static methods below
	 * getInstance(): returns the singleton instance of OasysBackendState
	 * -------------------------------------------------------------------------
	 */

	/**
	 * @throws StateExpiredException
	 */
	public static function getInstance(): OasysBackendState
	{
		if (!isset(self::$instance)) {
			self::$instance = new OasysBackendState();
		}
		self::$instance->updateTimeStamp();
		return self::$instance;
	}

	public static function browserHasActiveState(): bool
	{
		//check if a cookie exists for the backend state
		if (isset($_COOKIE['oasysStateBackend'])) {
			$stateId = $_COOKIE['oasysStateBackend'];
			return static::isStateIdActive($stateId);
		}

		return false;
	}

	public static function isStateIdActive($stateId): bool
	{
		$settings = OasysSettings::getInstance();
		$db = $settings->getDatabaseInstance();
		$query = "SELECT COUNT(*) FROM stateBackend WHERE stateId = ? AND active > NOW() - INTERVAL ? MINUTE";
		$res = $db->fetchValue($query, [$stateId, static::$timeOut + 1]);
		return ($res['error'] === false && $res['data'] > 0);
	}

	public static function getNumberOfActiveClients(?int $timeOut = null): int
	{
		try {
			$settings = OasysSettings::getInstance();
			if ($timeOut === null) {
				$timeOut = (int)($settings->getProperty('backendInactivityTimeout') ?? static::$inactivityTimeOut);
			}

			$db = $settings->getDatabaseInstance();
			$query = <<<SQL
				SELECT COUNT(*)
				FROM stateBackend
				WHERE TIMESTAMPDIFF(SECOND, active, NOW()) < ?
				AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.authStatus.value')) = '1'
				AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.editor_active.value')) = '1'
			SQL;
			$res = $db->fetchValue($query, [$timeOut * 60]);
			if ($res['error'] !== false || !isset($res['data']) || !is_numeric($res['data'])) {
				return -1;
			}

			return (int)$res['data'];
		} catch (\Throwable) {
			return -1;
		}
	}

	private static function cleanStaleStates(): void
	{
		if (self::$cleanupConsidered) {
			return;
		}
		self::$cleanupConsidered = true;
		$settings = OasysSettings::getInstance();
		$db = $settings->getDatabaseInstance();
		//Never enlist table-wide housekeeping in an application transaction.
		//Sample once per request, including calls from fetchAllActiveStates().
		if ($db->inTransaction() || mt_rand(1, 100) !== 1) {
			return;
		}
		//Preserve whole-minute expiry while allowing a future index on active to be used.
		$query = "DELETE FROM stateBackend WHERE active <= NOW() - INTERVAL ? MINUTE";
		$db->execute($query, [static::$timeOut + 1]);
	}

	private static function wrapValue(mixed $value): array
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

	private static function unwrapValue(string|array|null $entry): mixed
	{
		if ($entry === null) {
			return null;
		}
		$decoded = is_string($entry) ? json_decode($entry, true) : $entry; // force array if string
		$type = $decoded['type'] ?? null;
		$val = $decoded['value'] ?? null;

		return match ($type) {
			'object' => json_decode($val, false),
			'array' => json_decode($val, true),
			'boolean' => filter_var($val, FILTER_VALIDATE_BOOLEAN),
			default => $val,
		};
	}

	private static function unwrapAllProperties(string $json): array
	{
		$data = json_decode($json, true);
		foreach ($data as $property => $value) {
			$data[$property] = self::unwrapValue($value);
		}
		return $data;
	}

	public static function fetchAllActiveStates(): array
	{
		//first clean expired states
		self::cleanStaleStates();

		$query = <<<SQL
			SELECT active, `data`
			FROM stateBackend
			WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.authStatus.value')) = '1'
				AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.editor_active.value')) = '1'
				AND TIMESTAMPDIFF(SECOND, active, NOW()) < ?;
		SQL;

		$app = OasysApp::getInstance();
		$db = $app->getDatabaseInstance();
		$res = $db->fetchTable($query, [static::$inactivityTimeOut * 60]);

		$allStates = [];
		foreach ($res['data'] as $entry) {
			$state = ['data' => self::unwrapAllProperties($entry['data'])];
			$state['modified'] = $entry['active'];
			$state['inactivityTime'] = date_diff(date_create($state['modified']), date_create());
			$allStates[] = $state;
		}

		return $allStates;
	}
}
