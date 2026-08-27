<?php

	/*

	class.rixPDO.php
	wrapper around PDO for mySQL
	version 2.02

	version history at the end of the file

	*/

	declare(strict_types=1);

	use Random\RandomException;

	class rixPDO
	{
		/** Error information is returned only by the results() method, they will not be handled (default). */
		public const int ERROR_HANDLING_RETURN = 0;
		/** Error message is written into the referenced $errorVar variable when results() is called, then the script stops with die(). */
		public const int ERROR_HANDLING_VAR = 1;
		/** Error message is output with the die($msg) command which will halt the execution and write the error information to the output buffer. */
		public const int ERROR_HANDLING_DIE = 2;
		/** Error information is thrown as a RuntimeException when results() is called. */
		public const int ERROR_HANDLING_EXCEPTION = 3;

		/** Do not set time zone in session — leave the MariaDB default untouched. */
		public const int FORCE_TIME_ZONE_NONE = 0;
		/** Check the offset from UTC in PHP and apply it to MariaDB on each connection for the session (default). */
		public const int FORCE_TIME_ZONE_PHP_OFFSET = 1;
		/** Set session time zone to system time zone. */
		public const int FORCE_TIME_ZONE_SYSTEM = 2;

		private static array $instances = [];
		private bool $debug = false;
		private string $debugId;
		private mixed $host;
		private string $password;
		private string $user;
		private string $db;
		private ?array $flags;
		private ?array $attributes;
		private ?PDO $con = null;
		private bool $error;
		private string $errorMsg;
		private int|string $errorCode;
		private string $errorFile;
		private int $errorLine;
		private ?array $additionalErrorData;
		private string $query;
		private int $rows;
		private string|false $id;
		private mixed $data;
		private int $errorHandling;
		private ?array $errorVar;
		private ?string $errorVarKey;
		private ?PDOStatement $statement;
		private mixed $logFile;
		private mixed $logHandle;
		private ?array $parameters;

		public static function getInstance(string $key, array &$config): self
		{
			if (!isset(self::$instances[$key])) {
				self::$instances[$key] = new self($config);
			}

			return self::$instances[$key];
		}

		private function __construct(array &$config)
		{
			$db = $config['db'] ?? null;
			$user = $config['user'] ?? null;
			$password = $config['password'] ?? null;
			$host = $config['host'] ?? 'localhost';
			$logFile = $config['logFile'] ?? null;
			$errorHandling = $config['errorHandling'] ?? self::ERROR_HANDLING_RETURN;
			$errorVarKey = $config['errorVarKey'] ?? "";
			$flags = $config['flags'] ?? [];
			$attributes = $config['attributes'] ?? [];
			if (array_key_exists('errorVar', $config)) {
				$errorVar =& $config['errorVar'];
			} else {
				$errorVar = null;
			}

			try {
				$this->debugId = bin2hex(random_bytes(4));
			} catch (RandomException $e) {
				$this->debugId = uniqid();
			}
			if ($this->debug) {
				error_log("rixPDO constructor on $db [$this->debugId]");
			}
			if (!is_string($db) || !is_string($user) || !is_string($password)) {
				throw new InvalidArgumentException("Database connection parameters are not set.");
			}
			$this->host = $host;
			$this->user = $user;
			$this->password = $password;
			$this->flags = $flags;
			$this->attributes = $attributes;

			if (!isset($this->flags['timeout'])) {
				$this->flags['timeout'] = 10;
			}

			if (!isset($this->flags['forceTimeZone'])) {
				$this->flags['forceTimeZone'] = self::FORCE_TIME_ZONE_PHP_OFFSET;
			}

			$this->db = $db;
			$this->logFile = $logFile;
			$this->errorHandling = $errorHandling;
			$this->errorVar = &$errorVar;
			$this->errorVarKey = $errorVarKey;
			$this->additionalErrorData = [];
			$this->statement = null;
			$this->clear();
			$this->connect();
			$this->results();
			/*
			 * error handling values:
			 *  ERROR_HANDLING_RETURN
			 * 		error information is returned only by the results() method, they will not be handled (this is the
			 * 		default setting)
			 *  ERROR_HANDLING_VAR
			 * 		error message is written into the referenced $errorVar variable when results() is called, then the
			 * 		script stops with die()
			 *  ERROR_HANDLING_DIE
			 * 		error message is output with the die($msg) command which will halt the execution and write the error
			 * 		information to the output buffer
			 *  ERROR_HANDLING_EXCEPTION
			 * 		error information is thrown as RuntimeException when results() is called
			 */
		}

		private function clear(): void
		{
			if ($this->debug) {
				error_log("rixPDO clear [$this->debugId]");
			}
			$this->clearError();
			$this->query = '';
			$this->rows = 0;
			$this->id = false;
			$this->data = array();
			$this->statement?->closeCursor();
			$this->statement = null;
		}

		private function clearError(): void
		{
			if ($this->debug) {
				error_log("rixPDO clearError [$this->debugId]");
			}
			$this->error = false;
			$this->errorMsg = '';
			$this->errorCode = 0;
			$this->errorFile = '';
			$this->errorLine = -1;
		}

		private function connect(): void
		{
			if ($this->debug) {
				error_log("rixPDO connect [$this->debugId]");
			}
			$this->clearError();
			if ($this->logFile) {
				if ((!file_exists($this->logFile) && is_writable(dirname($this->logFile))) || is_writable($this->logFile)) {
					$this->logHandle = fopen($this->logFile, 'a');
				} else {
					$this->logHandle = false;
					error_log("rixPDO error 01: log file '$this->logFile' is not writeable");
				}
			} else {
				$this->logHandle = false;
			}
			try {
				// Existing attributes
				$pdoAttributes = [
					PDO::ATTR_TIMEOUT => $this->flags['timeout'],
					PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
					PDO::ATTR_EMULATE_PREPARES => false //switch off emulated prepares (by default they would be on)
				];

				/* check if user-provided attributes include a different error mode and remove it if so!
					RixPDO relies on using exceptions, so a different error mode would break functionality. */
				if (array_key_exists(PDO::ATTR_ERRMODE, $this->attributes)) {
					unset($this->attributes[PDO::ATTR_ERRMODE]);
				}

				// Merge with user-provided attributes, user-provided attributes will override existing ones if keys conflict
				$pdoAttributes = array_replace($pdoAttributes, $this->attributes);

				$this->con = new PDO("mysql:host=$this->host;dbname=$this->db;charset=utf8mb4", $this->user, $this->password, $pdoAttributes);
				if ($this->flags['forceTimeZone'] === self::FORCE_TIME_ZONE_SYSTEM) {
					$this->execute("SET time_zone = 'SYSTEM'");
				} elseif ($this->flags['forceTimeZone'] === self::FORCE_TIME_ZONE_PHP_OFFSET) {
					$offset = (new DateTime())->format('P');
					$this->execute("SET time_zone = '$offset'");
				}
			} catch (PDOException $e) {
				$this->setError($e->getCode(), $e->getMessage(), $e->getFile(), $e->getLine());
			}
		}

		private function setError($num, $msg, $file = '', $line = -1): void
		{
			if ($this->debug) {
				error_log("rixPDO setError [$this->debugId]: $msg");
			}
			$this->error = true;
			$this->errorCode = $num;
			$this->errorMsg = $msg;
			$this->errorFile = $file;
			$this->errorLine = $line;
			$this->writeLog("Line $line => $msg");
		}

		private function writeLog($msg): void
		{
			if ($this->debug) {
				error_log("rixPDO writeLog [$this->debugId]");
			}
			if (isset($this->logHandle) && is_resource($this->logHandle)) {
				$now = new DateTimeImmutable();
				$timeStamp = $now->format('Y-m-d H:i:s.u');
				$logEntry = "$timeStamp $msg\n" . $this->query . "\n\n";
				fwrite($this->logHandle, $logEntry);
			}
		}

		public function results(): array
		{
			if ($this->debug) {
				error_log("rixPDO results [$this->debugId]");
			}
			$res = array();
			$res['error'] = $this->error;
			if ($this->error) {
				$res['errorMsg'] = $this->errorMsg;
				$res['errorCode'] = $this->errorCode;
				$res['errorFile'] = $this->errorFile;
				$res['errorLine'] = $this->errorLine;
				$res['query'] = $this->query;
				$res['backtrace'] = false;
				$trace = debug_backtrace();
				foreach ($trace as $row) {
					if (!preg_match("/rixPDO\\.php$/", $row['file'])) {
						$res['backtrace'] = $row;
						break;
					}
				}
				$res['error'] = "<p>rixPDO error [type $this->errorCode] on line $this->errorLine of<br><code class='tinyCode'>$this->errorFile</code></p>";
				if ($res['backtrace']) {
					$res['error'] .= "<p>Called from line {$res['backtrace']['line']} of:<br><code class='tinyCode'>{$res['backtrace']['file']}</code></p>";
				}
				$res['error'] .= "<p>$this->errorMsg</p>";
				if ($this->errorHandling === self::ERROR_HANDLING_VAR && $this->errorVar !== null) {
					if ($this->errorVarKey !== '') {
						$this->errorVar[$this->errorVarKey] = $res['error'];
						if (count($this->additionalErrorData) > 0) {
							foreach ($this->additionalErrorData as $k => $v) {
								$this->errorVar[$k] = $v;
							}
						}
					} else {
						$this->errorVar[$this->errorVarKey] = $res['error'];
					}
					die();
				} elseif ($this->errorHandling === self::ERROR_HANDLING_DIE) {
					die($res['error']);
				} elseif ($this->errorHandling === self::ERROR_HANDLING_EXCEPTION) {
					throw new RuntimeException($res['error'], is_int($this->errorCode) ? $this->errorCode : 0);
				}
			} else {
				$res['rows'] = $this->rows;
				$res['id'] = $this->id;
				if ($res['id'] != $this->id) $res['id'] = $this->id;
				$res['data'] = $this->data;
			}
			return $res;
		}

		function __destruct()
		{
			$this->disconnect();
		}

		private function __clone()
		{
		}

		public function __wakeup(): void
		{
			throw new RuntimeException("Cannot unserialize singleton.");
		}

		private function disconnect(): void
		{
			if ($this->debug) {
				error_log("rixPDO disconnect [$this->debugId]");
			}
			if ($this->con !== null && $this->con->inTransaction()) {
				$this->rollback();
			}
			$this->con = null;
			if (isset($this->logHandle) && is_resource($this->logHandle)) {
				fclose($this->logHandle);
			}
		}

		private function hasConnection(): bool
		{
			if ($this->con !== null) {
				return true;
			}
			$this->setError(0, "No database connection!");
			return false;
		}

		/*
		 * method execute
		 *
		 * executes the given query and returns the number of affected rows and the last autoincrement id
		 *
		 * Parameters:
		 * 		$query		the query to execute
		 *
		 * Note that this method does not send back data. Use one of the fetch methods for SELECT queries
		 *
		 */

		public function execute($query, $parameters = []): array
		{
			if ($this->debug) {
				error_log("rixPDO execute [$this->debugId]");
			}
			$res = $this->prepare($query);
			if ($res !== true) {
				return $res;
			}
			return $this->executePrepared($parameters);
		}

		/*
		 * method prepare
		 *
		 * send a query to the server to prepare
		 *
		 * Parameters:
		 * 		$query			query to prepare with '?' placeholders for the parameters of with named parameters (e.g. ':id')
		 *
		 */

		public function prepare($query): bool|array
		{
			if ($this->debug) {
				error_log("rixPDO prepare [$this->debugId]: $query");
			}
			$this->clear();
			$this->query = $query;
			if (!$this->hasConnection()) {
				return $this->results();
			}
			try {
				$this->statement = $this->con->prepare($query);
			} catch (PDOException $e) {
				$this->setError($e->getCode(), $e->getMessage(), $e->getFile(), $e->getLine());
				return $this->results();
			}
			return true;
		}

		/*
		 * method executePrepared
		 *
		 * executes a previously prepared statement
		 *
		 * Parameters:
		 * 		$parameters		the parameters to bind to the prepared statement, as an array
		 * 						if the query was defined with named parameters, the keys of the array represent the names
		 *
		 * Note that this method does not send back data. Use one of the fetch methods for SELECT queries
		 *
		 */

		public function executePrepared($parameters): array
		{
			if ($this->debug) {
				error_log("rixPDO executePrepared [$this->debugId]");
			}
			if ($this->error) return $this->results();
			if (!$this->hasConnection()) return $this->results();
			$this->parameters = $parameters;
			try {
				$this->statement->execute($parameters);
				$result = $this->statement;
				$this->rows = $result->rowCount();
				$this->id = $this->con->lastInsertId();
			} catch (PDOException $e) {
				$this->setError($e->getCode(), $e->getMessage(), $e->getFile(), $e->getLine());
			}
			return $this->results(); // also when error occured, return the results which includes the error message
		}

		public function setAdditionalErrorData($data): void
		{
			if ($this->debug) {
				error_log("rixPDO setAdditionalErrorData [$this->debugId]");
			}
			$this->additionalErrorData = $data;
		}

		public function clearAdditionalErrorData(): void
		{
			if ($this->debug) {
				error_log("rixPDO clearAdditionalErrorData [$this->debugId]");
			}
			$this->additionalErrorData = [];
		}

		/*
		 * method fetch
		 *
		 * fetch data from database and return it under the format specified
		 *
		 * Parameters:
		 * 		$query			query to execute
		 * 		$format			defines the format under which the data should be returned (see below)
		 * 		$key			fieldname that should be used as key for the rows (should logically be a unique field)
		 * 						if not specified or if no such key exists in the result set, the rows will simply be numbered
		 * 						for the formats that do not use multiple rows, this parameter is ignored
		 *
		 * Possible Formats:
		 * 		'table'			data is returned as an array of rows, every row is indexed by column names
		 * 		'tablenum'		data is returned as an array of rows, every row is indexed by numbers
		 * 						if a key is specified it needs to be an integer (e.g. 0 for the first field)
		 * 		'row'			first row from result set is returned, indexed by column names
		 * 						the key parameter is not applicable for this format
		 * 		'rownum'		first row from result set is returned, indexed by numbers
		 * 						the key parameter is not applicable for this format
		 * 		'column'		the first field of each row is returned as an array indexed by numbers
		 * 						if a key is specified it needs to be an integer (e.g. 0 for the first field)
		 * 		 				if the first field is chosen as key, the data returned will be taken from the second field instead of the first
		 * 		'value'			the first field from the first row will be returned
		 * 						the key parameter is not applicable for this format
		 */

		public function fetch($query, $format = 'table', $key = null, $secondaryKey = null, $aggregateRows = false): array
		{
			if ($this->debug) {
				error_log("rixPDO fetch [$this->debugId]");
			}
			$this->prepare($query);
			return $this->fetchPrepared(array(), $format, $key, $secondaryKey, $aggregateRows);
		}

		/*
		 * method fetchPrepared
		 *
		 * fetches data using a previously prepared statement
		 *
		 * Parameters:
		 * 		$parameters		the parameters to bind to the prepared statement, as an array
		 * 						if the query was defined with named parameters, the keys of the array represent the names
		 * 		$format			defines the format under which the data should be returned (see below)
		 * 		$key			fieldname that should be used as key for the rows (should logically be a unique field)
		 * 						if not specified or if no such key exists in the result set, the rows will simply be numbered
		 * 						for the formats that do not use multiple rows, this parameter is ignored
		 *
		 * Possible formats:	see description of fetch method
		 */

		public function fetchPrepared($parameters, $format = 'table', $key = null, $secondaryKey = null, $aggregateRows = false): array
		{
			if ($this->debug) {
				error_log("rixPDO fetchPrepared [$this->debugId]");
			}
			if ($this->error) return $this->results();
			$this->parameters = $parameters;
			$formats = array("table", "tablenum", "row", "rownum", "column", "value");
			if (!in_array(strtolower($format), $formats)) {
				$this->setError(0, "Unkown format specified: " . $format);
				return $this->results();
			}
			$this->clearError();
			try {
				$this->statement->execute($parameters);
				$result = $this->statement;
				$this->rows = $result->rowCount();
				switch ($format) {
					case 'table':
						$lineArray = array();
						while ($row = $result->fetch(PDO::FETCH_ASSOC)) {
							if ($key === null || !isset($row[$key])) {
								$lineArray[] = $row;
							} else {
								if (!$aggregateRows) {
									if ($secondaryKey === null || !isset($row[$secondaryKey])) {
										$lineArray[$row[$key]] = $row;
									} else {
										$lineArray[$row[$key]][$row[$secondaryKey]] = $row;
									}
								} else {
									if ($secondaryKey === null || !isset($row[$secondaryKey])) {
										$lineArray[$row[$key]][] = $row;
									} else {
										$lineArray[$row[$key]][$row[$secondaryKey]][] = $row;
									}
								}
							}
						}
						$this->data = $lineArray;
						break;
					case 'tablenum':
						$lineArray = array();
						while ($row = $result->fetch(PDO::FETCH_NUM)) {
							if ($key === null || !isset($row[$key])) {
								$lineArray[] = $row;
							} else {
								if (!$aggregateRows) {
									if ($secondaryKey === null || !isset($row[$secondaryKey])) {
										$lineArray[$row[$key]] = $row;
									} else {
										$lineArray[$row[$key]][$row[$secondaryKey]] = $row;
									}
								} else {
									if ($secondaryKey === null || !isset($row[$secondaryKey])) {
										$lineArray[$row[$key]][] = $row;
									} else {
										$lineArray[$row[$key]][$row[$secondaryKey]][] = $row;
									}
								}
							}
						}
						$this->data = $lineArray;
						break;
					case 'row':
						$lineArray = array();
						$row = $result->fetch(PDO::FETCH_ASSOC);
						if ($row) {
							$lineArray = $row;
						}
						$this->data = $lineArray;
						break;
					case 'rownum':
						$lineArray = array();
						$row = $result->fetch(PDO::FETCH_NUM);
						if ($row) {
							$lineArray = $row;
						}
						$this->data = $lineArray;
						break;
					case 'column':
						$lineArray = array();
						while ($row = $result->fetch(PDO::FETCH_ASSOC)) {
							$keys = array_keys($row);
							if (count($keys) === 0) {
								$this->setError(0, "No columns found in result set!");
								return $this->results();
							}
							if ($key === null || !isset($row[$key])) {
								$lineArray[] = $row[$keys[0]];
							} else {
								$valueKey = null;
								foreach ($keys as $candidateKey) {
									if ($candidateKey !== $key && ($secondaryKey === null || $candidateKey !== $secondaryKey)) {
										$valueKey = $candidateKey;
										break;
									}
								}
								if ($valueKey === null) {
									$this->setError(0, "No value column found in result set!");
									return $this->results();
								}
								if (!$aggregateRows) {
									if ($secondaryKey === null || !isset($row[$secondaryKey])) {
										$lineArray[$row[$key]] = $row[$valueKey];
									} else {
										$lineArray[$row[$key]][$row[$secondaryKey]] = $row[$valueKey];
									}
								} else {
									if ($secondaryKey === null || !isset($row[$secondaryKey])) {
										$lineArray[$row[$key]][] = $row[$valueKey];
									} else {
										$lineArray[$row[$key]][$row[$secondaryKey]][] = $row[$valueKey];
									}
								}
							}
						}
						$this->data = $lineArray;
						break;
					case 'value':
						$value = null;
						$row = $result->fetch(PDO::FETCH_NUM);
						if ($row) {
							$value = $row[0];
						}
						$this->data = $value;
						break;
				}
			} catch (PDOException $e) {
				$this->setError($e->getCode(), $e->getMessage(), $e->getFile(), $e->getLine());
			}
			return $this->results(); // also when error occured, return the results which includes the error message
		}

		/*
		 * method fetchTable
		 *
		 * this is a convenience method that executes the prepare, fetchPrepared and results methods in a single step
		 * the data type 'table' is preconfigured
		 *
		 */

		public function fetchTable($query, $parameters = [], $key = null, $secondaryKey = null, $aggregateRows = false): bool|array
		{
			if ($this->debug) {
				error_log("rixPDO fetchTable [$this->debugId]");
			}
			$res = $this->prepare($query);
			if ($res !== true) {
				return $res;
			}
			return $this->fetchPrepared($parameters, 'table', $key, $secondaryKey, $aggregateRows);
		}

		/*
		 * method fetchTableNum
		 *
		 * this is a convenience method that executes the prepare, fetchPrepared and results methods in a single step
		 * the data type 'tablenum' is preconfigured
		 *
		 */

		public function fetchTableNum($query, $parameters = [], $key = null, $secondaryKey = null, $aggregateRows = false): bool|array
		{
			if ($this->debug) {
				error_log("rixPDO fetchTableNum [$this->debugId]");
			}
			$res = $this->prepare($query);
			if ($res !== true) {
				return $res;
			}
			return $this->fetchPrepared($parameters, 'tablenum', $key, $secondaryKey, $aggregateRows);
		}

		/*
		 * method fetchRow
		 *
		 * this is a convenience method that executes the prepare, fetchPrepared and results methods in a single step
		 * the data type 'row' is preconfigured
		 *
		 */

		public function fetchRow($query, $parameters = []): bool|array
		{
			if ($this->debug) {
				error_log("rixPDO fetchRow [$this->debugId]");
			}
			$res = $this->prepare($query);
			if ($res !== true) {
				return $res;
			}
			return $this->fetchPrepared($parameters, 'row');
		}


		/*
		 * method fetchRowNum
		 *
		 * this is a convenience method that executes the prepare, fetchPrepared and results methods in a single step
		 * the data type 'rownum' is preconfigured
		 *
		 */

		public function fetchRowNum($query, $parameters = []): bool|array
		{
			if ($this->debug) {
				error_log("rixPDO fetchRowNum [$this->debugId]");
			}
			$res = $this->prepare($query);
			if ($res !== true) {
				return $res;
			}
			return $this->fetchPrepared($parameters, 'rownum');
		}

		/*
		 * method fetchColumn
		 *
		 * this is a convenience method that executes the prepare, fetchPrepared and results methods in a single step
		 * the data type 'column' is preconfigured
		 *
		 */

		public function fetchColumn($query, $parameters = [], $key = null, $secondaryKey = null, $aggregateRows = false): bool|array
		{
			if ($this->debug) {
				error_log("rixPDO fetchColumn [$this->debugId]");
			}
			$res = $this->prepare($query);
			if ($res !== true) {
				return $res;
			}
			return $this->fetchPrepared($parameters, 'column', $key, $secondaryKey, $aggregateRows);
		}

		/*
		 * method fetchValue
		 *
		 * this is a convenience method that executes the prepare, fetchPrepared and results methods in a single step
		 * the data type 'value' is preconfigured
		 *
		 */

		public function fetchValue($query, $parameters = []): bool|array
		{
			if ($this->debug) {
				error_log("rixPDO fetchValue [$this->debugId]");
			}
			$res = $this->prepare($query);
			if ($res !== true) {
				return $res;
			}
			return $this->fetchPrepared($parameters, 'value');
		}

		/*
		 * method fetchFile
		 *
		 * fetches blob data from a single column and row in the database and streams it into the output buffer
		 *
		 * Parameters:
		 *	  $query		  the query (it may include variable placeholders in the WHERE clause)
		 * 		$parameters		the parameters to bind to the prepared statement, as an array
		 * 						if the query was defined with named parameters, the keys of the array represent the names
		 * 		$headers		array of strings to be output as header before streaming the actual data
		 *
		 */

		public function fetchFile($query, $parameters, $headers = array()): bool|array|string
		{
			if ($this->debug) {
				error_log("rixPDO fetchFile [$this->debugId]");
			}
			$res = $this->prepare($query);
			if ($res !== true) {
				return $res;
			}
			$this->parameters = $parameters;
			$this->clearError();
			$fileData = null;
			try {
				$this->statement->bindColumn(1, $fileData, PDO::PARAM_LOB);
				$this->statement->execute($parameters);
				$result = $this->statement;
				$this->rows = $result->rowCount();
			} catch (PDOException $e) {
				$this->setError($e->getCode(), $e->getMessage(), $e->getFile(), $e->getLine());
				return $this->results();
			}
			$this->statement->fetch(PDO::FETCH_BOUND);
			if ($fileData === null) {
				//if the file data is null, it means that no file was found in the database
				$this->setError(0, "No file found in database!");
				return $this->results();
			}

			if (is_array($headers)) {
				//check if $headers is indeed an array. In that case send the headers to the output buffer and echo out the file data
				if (count($headers) > 0) {
					foreach ($headers as $headerLine) {
						header($headerLine);
					}
				}
				/* since PHP 8.1, PDO mySQL drivers return the file data as a resource, so we have to use fpassthru to
					stream it into the output buffer, unless PDO::ATTR_STRINGIFY_FETCHES is set
				*/
				if ($this->getAttribute(PDO::ATTR_STRINGIFY_FETCHES)) {
					echo $fileData;
				} else {
					fpassthru($fileData);
				}
				return $this->results();
			} elseif ($headers === true) {
				//if $headers is not an array of strings to be set, then we check if a boolean with the value TRUE is sent
				//if so, the caller of this method wants to get the file data back in a variable instead of echo'ing it.
				if ($this->getAttribute(PDO::ATTR_STRINGIFY_FETCHES)) {
					return $fileData;
				} else {
					return stream_get_contents($fileData);
				}
			} else {
				return $this->results();
			}
		}

		/*
		 * method insert
		 *
		 * inserts an array of data in specified table
		 * in order to guarantee security, a prepared statement is used for this operation
		 *
		 * Parameters:
		 * 		$table			the name of the table in which to insert
		 * 		$input			an array of rows to insert into the table
		 * 						each row is an array where the keys represent the name of field in which the value is to be inserted
		 *
		 * Notes:
		 * 	- every row MUST have the same number of values and target identical keys, because the data will be inserted in a single SQL command
		 *  - if multiple rows are inserted $input must be an array of rows where a row is an array of values
		 *  - if a single row is inserted $input can either be the row to be inserted (simply an array of values) or it can be an array containing the row array
		 *
		 */

		public function insert($table, $input, $onDuplicateKey = false, $updateKeys = array()): bool|array
		{
			if ($this->debug) {
				error_log("rixPDO insert [$this->debugId] into $table");
			}
			try {
				$table = $this->quoteQualifiedIdentifier($table);
			} catch (InvalidArgumentException $e) {
				$this->clear();
				$this->setError($e->getCode(), $e->getMessage(), $e->getFile(), $e->getLine());
				return $this->results();
			}
			//verify if $input is an array of arrays and correct it if it's not
			$nonArray = false;
			foreach ($input as $row) {
				if (!is_array($row)) {
					$nonArray = true;
					break;
				}
			}
			if ($nonArray === true) {
				$input = [0 => $input];
			}

			$chunks = array_chunk($input, 10000);
			$affectedRows = 0;
			foreach ($chunks as $data) {
				$rowCount = count($data);
				if ($rowCount == 0) {
					$this->setError(0, "No data to insert into database!");
					return $this->results();
				}
				$keyCount = count($data[0]);
				$placeHolders = $this->variableString($keyCount);
				$valuesString = '';
				$values = array();
				$firstRound = true;
				$rowNum = 0;
				foreach ($data as $idx => $row) {
					//to guarantee, that the keys are in the same order in each row, we have to sort every row by key
					ksort($row);
					if (count($row) != $keyCount) {
						$this->clear();
						$this->setError(0, "Wrong count of fields in row $rowCount. Expected $keyCount, but found " . count($row) . "!\n\n" . print_r($row, true));
						return $this->results();
					}
					$rowNum++;
					if (!$firstRound) {
						$valuesString .= ', ';
					} else {
						$firstRound = false;
					}
					$valuesString .= $placeHolders;
					foreach ($row as $value) {
						$values[] = $value;
					}
					$data[$idx] = $row;
				}
				try {
					$keysString = $this->identifierString(array_keys($data[0]));
				} catch (InvalidArgumentException $e) {
					$this->clear();
					$this->setError($e->getCode(), $e->getMessage(), $e->getFile(), $e->getLine());
					return $this->results();
				}
				if ($onDuplicateKey === 'ignore') {
					$query = "INSERT IGNORE INTO $table $keysString VALUES $valuesString";
				} else if ($onDuplicateKey === 'replace') {
					$query = "REPLACE INTO $table $keysString VALUES $valuesString";
				} else if ($onDuplicateKey === 'update' && is_array($updateKeys) && count($updateKeys) > 0) {
					$updateStringList = array();
					try {
						foreach ($updateKeys as $updateKey) {
							$updateKey = $this->quoteIdentifier($updateKey);
							$updateStringList[] = "$updateKey=VALUES($updateKey)";
						}
					} catch (InvalidArgumentException $e) {
						$this->clear();
						$this->setError($e->getCode(), $e->getMessage(), $e->getFile(), $e->getLine());
						return $this->results();
					}
					$updateString = implode(', ', $updateStringList);
					$query = "INSERT INTO $table $keysString VALUES $valuesString ON DUPLICATE KEY UPDATE $updateString";
				} else if (!$onDuplicateKey) {
					$query = "INSERT INTO $table $keysString VALUES $valuesString";
				} else {
					$this->clear();
					if ($onDuplicateKey === 'update') {
						$this->setError(0, "\$onDuplicateKey method 'update' found but \$updateKeys not set correctly!");
					} else {
						$this->setError(0, "Unknown \$onDuplicateKey method found: '$onDuplicateKey'");
					}
					return $this->results();
				}
				$res = $this->prepare($query);
				if ($res !== true) {
					return $res;
				}
				$res = $this->executePrepared($values);
				if ($res['error'] !== false) {
					return $res;
				}
				$affectedRows += $this->rows;
			}
			$this->rows = $affectedRows;
			return $this->results();
		}

		private function quoteIdentifier($identifier): string
		{
			$identifier = strval($identifier);
			if (!preg_match('/\A[A-Za-z_][A-Za-z0-9_]*\z/', $identifier)) {
				throw new InvalidArgumentException("Invalid SQL identifier!");
			}
			return "`$identifier`";
		}

		private function quoteQualifiedIdentifier($identifier): string
		{
			$identifier = strval($identifier);
			if ($identifier === '') {
				throw new InvalidArgumentException("No table specified!");
			}
			$parts = explode('.', $identifier);
			foreach ($parts as $k => $part) {
				$parts[$k] = $this->quoteIdentifier($part);
			}
			return implode('.', $parts);
		}

		private function identifierString($identifiers, $parantheses = true): string
		{
			$keys = [];
			foreach ($identifiers as $identifier) {
				$keys[] = $this->quoteIdentifier($identifier);
			}
			$s = implode(', ', $keys);
			if ($parantheses) {
				$s = "($s)";
			}
			return $s;
		}

		/*
		 * method keyString
		 *
		 * creates a comma-separated string of the keys of an array
		 *
		 */


		public function keyString($arr, $backticks = true, $parantheses = true, $prefix = '', $postfix = ''): string
		{
			if ($this->debug) {
				error_log("rixPDO keyString [$this->debugId]");
			}
			$keys = [];
			if ($backticks) {
				$prefix = "`$prefix";
				$postfix = "$postfix`";
			}
			foreach ($arr as $k => $v) {
				$keys[] = $prefix . $k . $postfix;
			}
			$s = implode(', ', $keys);
			if ($parantheses) {
				$s = "($s)";
			}
			return $s;
		}

		/*
		 * method variableString
		 *
		 * creates a string of comma-separated variable placeholders for use with prepared statements
		 * if the first parameter is an integer, that number is interpreted as count of placeholders and the string will look like this: (?, ?, ?, ?)
		 * if the first parameter is an array the keys from this array will be used for named placeholders: (:var1, :var2, :var3, :var4)
		 *
		 */


		public function variableString($arr, $parentheses = true): string
		{
			if ($this->debug) {
				error_log("rixPDO variableString [$this->debugId]");
			}
			if (is_array($arr)) {
				if (array_is_list($arr)) {
					$s = implode(', ', array_fill(0, count($arr), '?'));
					if ($parentheses) {
						$s = "($s)";
					}
				} else {
					$s = $this->keyString($arr, false, $parentheses, ':');
				}
			} else {
				$n = intval($arr);
				$s = implode(', ', array_fill(0, $n, '?'));
				if ($parentheses) $s = "($s)";
			}
			return $s;
		}


		/*
		 * private method addBackticks
		 *
		 * adds backticks around all strings in an array
		 *
		 */


		private function addBackticks($s)
		{
			if ($this->debug) {
				error_log("rixPDO addBackticks [$this->debugId]");
			}
			if (is_string($s)) {
				$s = "`$s`";
			} else if (is_array($s)) {
				foreach ($s as $k => $v) {
					$s[$k] = "`$v`";
				}
			}
			return $s;
		}

		public function quote($string, $parameterType = PDO::PARAM_STR): string|false
		{
			if ($this->debug) {
				error_log("rixPDO quote [$this->debugId]");
			}
			if (!$this->hasConnection()) return false;
			return $this->con->quote($string, $parameterType);
		}

		public function getAttribute(int $attribute): mixed
		{
			if ($this->debug) {
				error_log("rixPDO getAttribute [$this->debugId]: $attribute");
			}
			if (!$this->hasConnection()) return $this->results();
			try {
				return $this->con->getAttribute($attribute);
			} catch (Exception $e) {
				$this->setError($e->getCode(), $e->getMessage(), $e->getFile(), $e->getLine());
				return $this->results();
			}
		}

		public function setAttribute(int $attribute, mixed $value): bool|array
		{
			if ($this->debug) {
				error_log("rixPDO setAttribute [$this->debugId]: $attribute");
			}

			if ($attribute === PDO::ATTR_ERRMODE && $value !== PDO::ERRMODE_EXCEPTION) {
				$this->setError(0, "rixPDO requires PDO::ATTR_ERRMODE to be PDO::ERRMODE_EXCEPTION.");
				return $this->results();
			}

			if (!is_array($this->attributes)) {
				$this->attributes = [];
			}

			$this->attributes[$attribute] = $value;

			if (!$this->hasConnection()) return $this->results();

			try {
				$this->con->setAttribute($attribute, $value);
				return true;
			} catch (Exception $e) {
				$this->setError($e->getCode(), $e->getMessage(), $e->getFile(), $e->getLine());
				return $this->results();
			}
		}


		/*
		 * method insertFile
		 *
		 * inserts data from a file in specified table
		 * in order to guarantee security, a prepared statement is used for this operation
		 *
		 * Parameters:
		 * 		$table			the name of the table in which to insert
		 * 		$input			a row of data to insert into the table, at least one value of which is the path to a file to insert
		 * 						the keys represent the name of field in which the value is to be inserted
		 *		$fileColumn	 	the name(s) of the column(s) that will receive the file data (an array of strings if more than 1)
		 *
		 */

		function insertFile($table, $input, $fileColumn): bool|array
		{
			if ($this->debug) {
				error_log("rixPDO insertFile [$this->debugId] into $table");
			}
			if (!is_array($fileColumn)) {
				$fileColumn = array($fileColumn);
			}
			$keyString = $this->keyString($input);
			$placeHolders = $this->variableString($input);
			$query = "INSERT INTO $table $keyString VALUES $placeHolders";
			$res = $this->prepare($query);
			if ($res !== true) {
				return $res;
			}

			foreach ($input as $k => $v) {
				if (!in_array($k, $fileColumn)) {
					$this->statement->bindValue(":$k", $v);
				} else {
					$handles[$k] = fopen($v, 'rb');
					$this->statement->bindValue(":$k", $handles[$k], PDO::PARAM_LOB); //binds the handle of the file as stream
				}
			}

			try {
				$this->statement->execute();
				$result = $this->statement;
				$this->rows = $result->rowCount();
				if (!$this->hasConnection()) return $this->results();
				$this->id = $this->con->lastInsertId();
			} catch (PDOException $e) {
				$this->setError($e->getCode(), $e->getMessage(), $e->getFile(), $e->getLine());
			}
			return $this->results(); // also when error occured, return the results which includes the error message
		}

		/*
		 * method updateFile
		 *
		 * updates data from a file in specified table
		 * in order to guarantee security, a prepared statement is used for this operation
		 *
		 * Parameters:
		 * 		$table			the name of the table in which to update
		 * 		$data			a row of data to update in the table, at least one value of which is the path to a file to update
		 * 						the keys represent the name of fields which are to be updated
		 *		$fileColumn	 	the name(s) of the column(s) that will receive the file data (an array of strings if more than 1)
		 * 		$condition		optional condition string, e.g. "id>40 AND login=test"
		 * 						the condition string may also have named placeholders but no '?' placeholders
		 * 		$parameters		if placeholders are used in the condition string, this array must carry the parameters with appropriate key names
		 *
		 */

		function updateFile($table, $data, $fileColumn, $condition = '', $parameters = null): bool|array
		{
			if ($this->debug) {
				error_log("rixPDO updateFile [$this->debugId] in $table");
			}
			if (!is_array($fileColumn)) {
				$fileColumn = array($fileColumn);
			}

			$this->parameters = $parameters;
			$keys = [];
			foreach ($data as $k => $v) {
				$keys[] = '`' . $k . '` = :' . $k;
			}
			$updatesString = implode(', ', $keys);

			if ($parameters) {
				$parameters = array_merge($data, $parameters);
			} else {
				$parameters = $data;
			}
			/** @noinspection SqlWithoutWhere */
			$query = "UPDATE $table SET $updatesString";
			if ($condition != '') {
				$query .= " WHERE $condition";
			}
			$res = $this->prepare($query);
			if ($res !== true) {
				return $res;
			}

			foreach ($parameters as $k => $v) {
				if (!in_array($k, $fileColumn)) {
					$this->statement->bindValue(":$k", $v);
				} else {
					$handles[$k] = fopen($data[$k], 'rb');
					$this->statement->bindValue(":$k", $handles[$k], PDO::PARAM_LOB); //binds the handle of the file as stream
				}
			}

			try {
				$this->statement->execute();
				$result = $this->statement;
				$this->rows = $result->rowCount();
				if (!$this->hasConnection()) return $this->results();
				$this->id = $this->con->lastInsertId();
			} catch (PDOException $e) {
				$this->setError($e->getCode(), $e->getMessage(), $e->getFile(), $e->getLine());
			}
			return $this->results(); // also when error occured, return the results which includes the error message
		}

		/*
		 * method update
		 *
		 * updates the specified table
		 * in order to guarantee security, a prepared statement is used for this operation
		 *
		 * Parameters:
		 * 		$table			the name of the table to update
		 * 		$data			an array of values to update, where the keys represent the fields in the table
		 * 		$condition		optional condition string, e.g. "id>40 AND login=test"
		 * 						the condition string may also have '?' placeholders for prepared statements, but no named placeholders
		 * 		$parameters		if placeholders are used in the condition string, this array must carry the parameters
		 *
		 */

		public function update($table, $data, $condition = '', $parameters = null): bool|array
		{
			if ($this->debug) {
				error_log("rixPDO update [$this->debugId] in $table");
			}
			$this->parameters = $parameters;
			$updatesString = $this->keyString($data, false, false, '`', '`=?');
			$values = array_values($data);
			if ($parameters) {
				$parameters = array_merge($values, $parameters);
			} else {
				$parameters = $values;
			}
			/** @noinspection SqlWithoutWhere */
			$query = "UPDATE $table SET $updatesString";
			if ($condition != '') {
				$query .= " WHERE $condition";
			}
			$res = $this->prepare($query);
			if ($res !== true) {
				return $res;
			}
			return $this->executePrepared($parameters);
		}

		/*
		 * method bulkUpdate
		 *
		 * updates the specified table in bulk
		 * in order to guarantee security, a prepared statement is used for this operation
		 *
		 * Parameters:
		 * 		$table		the name of the table to update
		 * 		$data		an array of rows to update, where each row is an array of values to update, where the
		 *                  keys represent the fields in the table
		 *      $keys       an array of keys (string) that are used to identify the rows to update; these keys are
		 *                  removed from the data before updating
		 * 				    to ensure that the keys are unique, it is strongly recommended to use the primary key(s) of
		 *                  the table, but other uses are possible if you know what you are doing
		 */

		public function bulkUpdate($table, $data, $keys): bool|array
		{
			if ($this->debug) {
				error_log("rixPDO bulkUpdate [$this->debugId] in $table");
			}
			try {
				if (count($keys) == 0) {
					throw new Exception("No keys specified for bulk update!");
				}
				$updatedRows = 0;
				foreach ($data as $row) {
					$parameters = [];
					$condition = '';
					foreach ($keys as $key) {
						if (!isset($row[$key])) {
							throw new Exception("Key '$key' not found in row!");
						}
						$parameters[] = $row[$key];
						if ($condition != '') {
							$condition .= ' AND ';
						}
						$condition .= "`$key`=?";
						unset($row[$key]);
					}
					$res = $this->update($table, $row, $condition, $parameters);
					if ($res['error'] !== false) {
						return $res;
					} else {
						$updatedRows += $res['rows'];
					}
				}
				$this->rows = $updatedRows;
			} catch (Exception $e) {
				$this->setError($e->getCode(), $e->getMessage(), $e->getFile(), $e->getLine());
			}
			return $this->results(); // also when error occured, return the results which includes the error message
		}

		/*
		 * method startTransaction
		 *
		 * starts a transaction
		 *
		 */

		public function startTransaction(): bool|array
		{
			if ($this->debug) {
				error_log("rixPDO startTransaction [$this->debugId]");
			}
			if (!$this->hasConnection()) return $this->results();
			if ($this->con->beginTransaction()) {
				return true;
			} else {
				return $this->results();
			}
		}


		/*
		 * method commit
		 *
		 * commits a transaction
		 *
		 */

		public function commit(): bool|array
		{
			if ($this->debug) {
				error_log("rixPDO commit [$this->debugId]");
			}
			if (!$this->hasConnection()) return $this->results();
			if (!$this->con->inTransaction()) {
				if ($this->debug) {
					error_log("rixPDO commit called but no transaction in progress [$this->debugId]");
				}
				$this->setError(0, "No transaction in progress!");
				return $this->results();
			}
			if ($this->con->commit()) {
				return true;
			} else {
				error_log("*** commit failed [$this->debugId]");
				return $this->results();
			}
		}

		/*
		 * method rollback
		 *
		 * rolls back a transaction
		 *
		 */

		public function rollback(): bool|array
		{
			if ($this->debug) {
				error_log("rixPDO rollback [$this->debugId]");
			}
			if (!$this->hasConnection()) return $this->results();
			if (!$this->con->inTransaction()) {
				if ($this->debug) {
					error_log("rixPDO rollback called but no transaction in progress [$this->debugId]");
				}
				$this->setError(0, "No transaction in progress!");
				return $this->results();
			}
			if ($this->con->rollBack()) {
				return true;
			} else {
				error_log("*** rollback failed [$this->debugId]");
				return $this->results();
			}
		}

	/*
	 * method executeBatch
	 *
	 * executes multiple SQL statements in a single SQL string
	 * IMPORTANT: This method requires PDO::ATTR_EMULATE_PREPARES to be enabled, otherwise an exception is thrown
	 *
	 * Parameters:
	 * 		$sql			a string containing multiple SQL statements separated by semicolons
	 *
	 * Returns an array with execution results and any errors encountered while executing individual statements
	 *
	 */

	public function executeBatch($sql): array
	{
		if ($this->debug) {
			error_log("rixPDO executeBatch [$this->debugId]");
		}

		$this->clear();
		$this->query = strval($sql);

		if (!$this->hasConnection()) {
			return $this->results();
		}

		try {
			if (!$this->con->getAttribute(PDO::ATTR_EMULATE_PREPARES)) {
				throw new RuntimeException("executeBatch() requires PDO::ATTR_EMULATE_PREPARES to be enabled");
			}
		} catch (RuntimeException $e) {
			throw $e;
		} catch (Exception $e) {
			$this->setError($e->getCode(), $e->getMessage(), $e->getFile(), $e->getLine());
			return $this->results();
		}

		$rowsetReports = [];
		$rowsetIdx = 0;
		$totalErrors = 0;
		$totalAffectedRows = 0;

		try {
			$this->statement = $this->con->prepare($this->query);
			$this->statement->execute();

			$hasMoreRowsets = true;
			while ($hasMoreRowsets) {
				$rowsetIdx++;
				$rowsetError = false;
				$rowsData = [];
				$affectedRows = 0;

				try {
					$affectedRows = $this->statement->rowCount();
					$totalAffectedRows += $affectedRows;

					// Fetch all rows in the current result set to get potential data and to surface row-level errors
					while (($row = $this->statement->fetch(PDO::FETCH_ASSOC)) !== false) {
						$rowsData[] = $row;
					}

					$errorInfo = $this->statement->errorInfo();
					if (is_array($errorInfo) && isset($errorInfo[0]) && $errorInfo[0] !== '00000') {
						$totalErrors++;
						$rowsetReports[] = [
							'rowset' => $rowsetIdx,
							'error' => true,
							'errorCode' => $errorInfo[1] ?? 0,
							'errorMsg' => $errorInfo[2] ?? 'Unknown SQL error',
							'sqlState' => $errorInfo[0]
						];
						$rowsetError = true;
					}
				} catch (PDOException $e) {
					$totalErrors++;
					$rowsetReports[] = [
						'rowset' => $rowsetIdx,
						'error' => true,
						'errorCode' => $e->getCode(),
						'errorMsg' => $e->getMessage(),
						'errorFile' => $e->getFile(),
						'errorLine' => $e->getLine()
					];
					$rowsetError = true;
				}

				if (!$rowsetError) {
					$report = [
						'rowset' => $rowsetIdx,
						'error' => false,
						'rows' => $affectedRows
					];
					if (count($rowsData) > 0) {
						$report['data'] = $rowsData;
					}
					$rowsetReports[] = $report;
				}

				try {
					$hasMoreRowsets = $this->statement->nextRowset();
				} catch (PDOException $e) {
					$rowsetIdx++;
					$totalErrors++;
					$rowsetReports[] = [
						'rowset' => $rowsetIdx,
						'error' => true,
						'errorCode' => $e->getCode(),
						'errorMsg' => $e->getMessage(),
						'errorFile' => $e->getFile(),
						'errorLine' => $e->getLine()
					];
					$hasMoreRowsets = false;
				}
			}
		} catch (PDOException $e) {
			$totalErrors++;
			$rowsetReports[] = [
				'rowset' => $rowsetIdx > 0 ? $rowsetIdx : 1,
				'error' => true,
				'errorCode' => $e->getCode(),
				'errorMsg' => $e->getMessage(),
				'errorFile' => $e->getFile(),
				'errorLine' => $e->getLine()
			];
		} finally {
			$this->statement?->closeCursor();
		}

		$this->rows = $totalAffectedRows;
		$this->data = [
			'rowsets' => $rowsetReports,
			'totalErrors' => $totalErrors
		];

		if ($totalErrors > 0) {
			$firstError = null;
			foreach ($rowsetReports as $report) {
				if ($report['error']) {
					$firstError = $report;
					break;
				}
			}
			if ($firstError) {
				$this->setError(
					$firstError['errorCode'],
					"Batch Rowset {$firstError['rowset']} Error: " . $firstError['errorMsg'],
					$firstError['errorFile'] ?? '',
					$firstError['errorLine'] ?? -1
				);
			} else {
				$this->setError(0, "Batch execution completed with $totalErrors error(s)");
			}
		}

		return $this->results();
	}

	/*
	 * method disableForeignKeyChecks
	 *
	 * disables foreign key checks
	 * Only use this if you know EXACTLY why you are doing it and what it implicates!
	 *
	 */

	public function disableForeignKeys(): array
	{
		if ($this->debug) {
			error_log("rixPDO disableForeignKeys [$this->debugId]");
		}
		return $this->execute("SET FOREIGN_KEY_CHECKS=0");
	}

		/*
		 * method enableForeignKeyChecks
		 *
		 * reenable foreign key checks which were previously disabled
		 * Gets you back to safety!
		 *
		 */

		public function enableForeignKeys(): array
		{
			if ($this->debug) {
				error_log("rixPDO enableForeignKeys [$this->debugId]");
			}
			return $this->execute("SET FOREIGN_KEY_CHECKS=1");
		}
	}

/*
	 *
Version History:

v2.00	2026-06-15	Complete overhaul of the class:
	- class is now a keyed singleton
	- some security problems were patched
	- support for all standard PDO attributes
	- getAttribute and setAttribute methods
	- exception based error handling

v2.01	2026-06-17
	- added logic where numeric arrays sent to variableString no longer get named placeholders which breaks when prepares are emulated
	- switched off emulated prepares by default
	- added executeBatch() method
v2.02	2026-06-18
	- modifications in executeBatch() method

*/

