<?php

	/*

		class dbSessionHandler.php
		saves sessions into database
		version 4.0

		constructor SQL snippet for the database table:

			SET NAMES utf8mb4;
			SET FOREIGN_KEY_CHECKS = 0;

			-- ----------------------------
			-- Table structure for sessions
			-- ----------------------------
			DROP TABLE IF EXISTS `sessions`;
			CREATE TABLE `sessions` (
			  `id` varchar(255) COLLATE utf8_unicode_ci NOT NULL COMMENT 'session id',
			  `data` varchar(255) COLLATE utf8_unicode_ci NOT NULL DEFAULT '' COMMENT 'session contents',
			  `modified` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'modification timestamp',
			  PRIMARY KEY (`id`)
			) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

			SET FOREIGN_KEY_CHECKS = 1;

		This session handler is finetuned for OASYS in several details and cannot be used as is in other projects:

		- Instead of relying on the php maxlifetime for session, OASYS has its own settings for this. This setting is
		  read directly from the database or defaults to 60 minutes if not modified.
	*/

	require_once('rixPDO.php');


	class dbSessionHandler implements SessionHandlerInterface, SessionUpdateTimestampHandlerInterface
	{


		/**
		 * @var rixPDO $db
		 */
		private rixPDO $db;
		private string $dbName;
		private string $user;
		private string $password;
		private string $host;
		private string $logFile;
		private bool $readOnly;
		private int $timeOut = 3600;
		private bool $lockActive  = false;
		private bool $debug = false;
		private string $uuid;

		public function __construct($dbName, $user, $password, $host = 'localhost', $logFile = null, $caller = null, $readOnly = false)
		{
			$this->dbName = $dbName;
			$this->user = $user;
			$this->password = $password;
			$this->host = $host;
			$this->logFile = $logFile;
			$this->readOnly = $readOnly;

			if (!isset($caller)) {
				$caller = 'unknown';
			}

			try {
				$this->uuid = bin2hex(random_bytes(4));
			} catch (\Random\RandomException $e) {
				$this->uuid = uniqid();
			}
			$this->uuid = $caller . "_" . $this->uuid;

//			$this->debug = true;
		}

		public function open($path, $name): bool
		{
			if ($this->debug) error_log("[$this->uuid] session handler open('$path', '$name')");
			$this->db = new rixPDO($this->dbName, $this->user, $this->password, $this->host, $this->logFile);
			$res = $this->db->results();
			if ($res['error'] !== false) {
				return false;
			}

			/* get session timeout from settings or stick to default */
			$query = "SELECT `value` FROM settings WHERE `option`='sessionTimeout'";
			$res = $this->db->fetchValue($query);
			if ($res['rows'] > 0) {
				$this->timeOut = (int)$res['data'] * 60;
			}
			return true;
		}
		public function read($id): string|false
		{
			if ($this->debug) error_log("[$this->uuid] session handler read('$id')");
			if (!isset($this->db)) {
				return false;
			}

			//get lock and wait up to 10 seconds if already in use
			$res = $this->db->execute("SELECT GET_LOCK(?, 10)", [$this->uuid]);
			if ($this->debug) error_log("[$this->uuid] session handler get lock");
			if ($res['error'] !== false) {
				error_log("session lock timeout [$this->uuid]");
				return false;
			}
			$this->lockActive = true;

			$res = $this->db->fetchValue("SELECT data FROM sessions WHERE id = ? AND TIMESTAMPDIFF(SECOND,modified,NOW()) <= ?", [$id, $this->timeOut]);
			if ($this->debug) error_log("[$this->uuid] \$data = " . $res['data']);
			if ($res['error'] !== false || empty($res['data'])) return '';
			return $res['data'];
		}

		public function write($id, $data): bool
		{
			if ($this->debug) {
				error_log("[$this->uuid] session handler write('$id', '$data')");
			}
			if (!isset($this->db)) {
				return false;
			}
			$res = $this->db->insert('sessions', ['id' => $id, 'data' => $data], 'update', ['data']);
			if ($res['error'] !== false) {
				error_log("[$this->uuid] error = " . $res['error']);
			}
			return ($res['error'] === false);
		}

		public function close(): bool
		{
			if ($this->debug) error_log("[$this->uuid] session handler close()");
			if (!isset($this->db)) {
				return false;
			}
			if ($this->lockActive) {
				$this->db->execute("SELECT RELEASE_LOCK(?)", [$this->uuid]);
				$this->lockActive = false;
			}
			unset($this->db);
			return true;
		}

		public function destroy($id): bool
		{
			if ($this->debug) error_log("[$this->uuid] session handler destroy()");
			if (!isset($this->db)) {
				return false;
			}
			$this->db->prepare("DELETE FROM sessions WHERE id = ?");
			$res = $this->db->executePrepared([$id]);
			return ($res['error'] === false);
		}

		public function gc($max_lifetime): int|false
		{
			/*  Clean out any sessions that have overstayed their welcome
				- first we select all expired sessions while skipping the locked ones in order to avoid deadlocks
				- then we delete them in one go to not leave any dangling locks */

			if ($this->debug) error_log("[$this->uuid] session handler gc()");
			if (!isset($this->db) || $this->readOnly) {
				return false;
			}
			$query = <<<SQL
					SELECT id AS sid
					FROM sessions
					WHERE TIMESTAMPDIFF(SECOND,modified,NOW()) > ?
					FOR UPDATE SKIP LOCKED
				SQL;
			$res = $this->db->fetchColumn($query, [$this->timeOut]);
			if (!empty($res['data'])) {
				$listOfIds = $this->db->variableString(count($res['data']));
				$res = $this->db->execute("DELETE FROM sessions WHERE id IN $listOfIds", $res['data']);
			}
			return ($res['error'] === false);
		}

		public function updateTimestamp($id, $data): bool
		{
			$res = $this->db->execute('UPDATE sessions SET modified=CURRENT_TIMESTAMP() WHERE id=?', [$id]);
			return ($res['error'] === false);
		}

		public function validateId(string $id): bool
		{
			$query = <<<SQL
				SELECT COUNT(*) as sessionExists
				FROM sessions
				WHERE TIMESTAMPDIFF(SECOND,modified,NOW()) <= ?
			SQL;
			$res = $this->db->fetchValue($query, [$this->timeOut]);
			if ($res['error'] === false) {
				return ($res['data']['sessionExists'] > 0);
			} else {
				return false;
			}
		}
	}
