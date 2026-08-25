<?php

	declare(strict_types=1);

	namespace Oasys;

	use RuntimeException;
	use rixPDO;
	use stdClass;

	require_once __DIR__ . "/OasysSettings.php";
	require_once __DIR__ . "/rixPDO.php";
	require_once __DIR__ . "/rixTools.php";

	class OasysApp
	{
		private static ?OasysApp $instance = null;
		private rixPDO $db;
		public stdClass $dbConfig;
		public ?OasysSettings $config = null;

		private function __construct(int $databaseErrorHandling)
		{
			global $returnData;
			require __DIR__ . "/database.php";

			if (!isset($sql_db, $sql_user, $sql_password, $sql_host)) {
				error_log("OasysApp error: database connection parameters are not set");
				throw new RuntimeException("Database connection parameters are not set.");
			}

			if (!isset($returnData) || !is_array($returnData)) {
				$returnData = [];
			}
			$returnData['error'] ??= false;
			$returnData['action'] ??= 'undefined';

			$this->dbConfig = new stdClass();
			$this->dbConfig->db = $sql_db;
			$this->dbConfig->user = $sql_user;
			$this->dbConfig->host = $sql_host;
			$this->dbConfig->password = $sql_password;

			self::$instance = $this;
			$dbParameters = [
				'logFile' => __DIR__ . "/../../logs/database.txt",
				'errorHandling' => $databaseErrorHandling,
				'errorVarKey' => 'fatalError',
			];
			if ($databaseErrorHandling === rixPDO::ERROR_HANDLING_VAR) {
				$dbParameters['errorVar'] =& $returnData;
			}
			$this->db = self::createDatabaseInstance('default', $dbParameters);
		}

		public static function getInstance(int $databaseErrorHandling = rixPDO::ERROR_HANDLING_VAR): OasysApp
		{
			if (!isset(self::$instance)) {
				self::$instance = new OasysApp($databaseErrorHandling);
				self::$instance->config = OasysSettings::getInstance(self::$instance);
			}

			return self::$instance;
		}

		public function getDatabaseInstance(): rixPDO
		{
			return $this->db;
		}

		public function getDbConfig(): stdClass
		{
			return $this->dbConfig;
		}

		public static function createDatabaseInstance(string $key, array $parameters = []): rixPDO
		{
			$app = self::getInstance();
			$dbConfig = $app->getDbConfig();
			$rixPDOConfig = [
				'db' => $dbConfig->db,
				'user' => $dbConfig->user,
				'password' => $dbConfig->password,
				'host' => $dbConfig->host,
				'logFile' => $parameters['logFile'] ?? null,
				'errorHandling' => $parameters['errorHandling'] ?? 0,
				'errorVarKey' => $parameters['errorVarKey'] ?? "",
				'flags' => $parameters['flags'] ?? [],
				'attributes' => $parameters['attributes'] ?? []
			];

			if (array_key_exists('errorVar', $parameters)) {
				$rixPDOConfig['errorVar'] =& $parameters['errorVar'];
			}

			return rixPDO::getInstance($key, $rixPDOConfig);
		}

		public static function resolveLandingPageDirectory(string $path): string|false
		{
			$relativePath = self::resolveAppRelativeDirectory($path);
			if ($relativePath === false) {
				return false;
			}
			if (preg_match('#^landingPages/[^/]+/$#', $relativePath)) {
				return $relativePath;
			}
			if (preg_match('#^modules/[^/]+/landingPage/$#', $relativePath)) {
				return $relativePath;
			}
			return false;
		}

		public static function resolveSkinDirectory(string $path): string|false
		{
			$relativePath = self::resolveAppRelativeDirectory($path);
			if ($relativePath === false) {
				return false;
			}
			if (preg_match('#^skins/[^/]+/$#', $relativePath)) {
				return $relativePath;
			}
			if (preg_match('#^modules/[^/]+/skins/[^/]+/$#', $relativePath)) {
				return $relativePath;
			}
			return false;
		}

		private static function normalizeFilesystemPath(string $path): string
		{
			return str_replace('\\', '/', $path);
		}

		private static function pathIsWithin(string $path, string $root): bool
		{
			$path = rtrim(self::normalizeFilesystemPath($path), '/');
			$root = rtrim(self::normalizeFilesystemPath($root), '/');
			return $path === $root || str_starts_with($path, $root . '/');
		}

		private static function resolveAppRelativeDirectory(string $path): string|false
		{
			$path = trim($path);
			if ($path === '' || str_contains($path, "\0")) {
				return false;
			}
			if (preg_match('#^(?:[A-Za-z]:[\\\\/]|[\\\\/]{2}|/)#', $path)) {
				return false;
			}

			$appRoot = realpath(__DIR__ . '/..' . '/..');
			if ($appRoot === false) {
				return false;
			}

			$resolved = realpath($appRoot . '/' . ltrim($path, "/\\"));
			if ($resolved === false || !is_dir($resolved) || !self::pathIsWithin($resolved, $appRoot)) {
				return false;
			}

			$appRoot = rtrim(self::normalizeFilesystemPath($appRoot), '/');
			$resolved = self::normalizeFilesystemPath($resolved);
			$relativePath = ltrim(substr($resolved, strlen($appRoot)), '/');
			if ($relativePath === '') {
				return false;
			}

			return rtrim($relativePath, '/') . '/';
		}

		private function __clone()
		{
		}

		public function __wakeup(): void
		{
			throw new RuntimeException("Cannot unserialize singleton.");
		}
	}
