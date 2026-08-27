<?php

	declare(strict_types=1);

	namespace Oasys;

	use LDAP\Connection;
	use LDAP\Result;
	use Throwable;

	require_once __DIR__ . '/Crypt.php';

	/**
	 * Shared LDAP authentication for the Oasys frontend and editor login paths.
	 */
	final class OasysLdapAuthenticator
	{
		public const string SUCCESS = 'success';
		public const string INVALID_CREDENTIALS = 'invalidCredentials';
		public const string PASSWORD_EXPIRED = 'passwordExpired';
		public const string CONFIGURATION_ERROR = 'configurationError';
		public const string SERVICE_ERROR = 'serviceError';
		private const int LDAP_INVALID_CREDENTIALS_ERROR = 49;

		/**
		 * @param callable(string, array): void|null $logger
		 */
		public static function authenticate(string $login, #[\SensitiveParameter] string $password, array $settings, ?callable $logger = null): string
		{
			if (trim($login) === '' || $password === '') {
				self::log($logger, 'LDAP authentication rejected empty credentials.');
				return self::INVALID_CREDENTIALS;
			}

			if (!extension_loaded('ldap') || !function_exists('ldap_escape')) {
				self::log($logger, 'The PHP LDAP extension is unavailable.');
				return self::CONFIGURATION_ERROR;
			}

			$appUser = trim((string)($settings['ldap_appUser'] ?? ''));
			$encryptedAppPassword = (string)($settings['ldap_appPass'] ?? '');
			try {
				$appPassword = $encryptedAppPassword === '' ? false : \Crypt::decryptString($encryptedAppPassword);
			} catch (Throwable $exception) {
				self::log($logger, 'The LDAP application password could not be decrypted.', [
					'exception' => $exception::class,
					'message' => $exception->getMessage()
				]);
				return self::CONFIGURATION_ERROR;
			}
			$server = trim((string)($settings['ldap_server'] ?? ''));
			$searchBase = (string)($settings['ldap_searchBase'] ?? '');
			$queryTemplate = (string)($settings['ldap_query'] ?? '');

			if ($appUser === '' || $appPassword === false || $appPassword === '' || $server === '') {
				self::log($logger, 'Required LDAP connection settings are missing or the application password could not be decrypted.');
				return self::CONFIGURATION_ERROR;
			}

			if ($queryTemplate === '' || !str_contains($queryTemplate, '%1')) {
				self::log($logger, 'The LDAP query setting must contain the %1 username placeholder.');
				return self::CONFIGURATION_ERROR;
			}

			$serverScheme = self::validateServerUris($server);
			if ($serverScheme === null) {
				self::log($logger, 'LDAP server URLs must all use the same ldap:// or ldaps:// scheme.');
				return self::CONFIGURATION_ERROR;
			}

			$startTls = (bool)($settings['ldap_startTls'] ?? false);
			$verifyCertificate = (bool)($settings['ldap_verifyCertificate'] ?? false);
			if ($serverScheme === 'ldaps' || $startTls) {
				try {
					if (!self::configureTlsCertificateHandling($settings, $logger)) {
						return self::CONFIGURATION_ERROR;
					}
				} catch (Throwable $exception) {
					self::log($logger, 'Could not configure LDAP TLS certificate handling.', [
						'exception' => $exception::class,
						'message' => $exception->getMessage()
					]);
					return self::CONFIGURATION_ERROR;
				}
			}

			$stripDomain = (bool)($settings['ldap_stripLoginDomain'] ?? true);
			$username = $stripDomain ? (string)preg_replace('/@.*$/', '', $login) : $login;
			if (trim($username) === '') {
				self::log($logger, 'LDAP authentication rejected an empty username after domain stripping.');
				return self::INVALID_CREDENTIALS;
			}

			$networkTimeout = self::boundedInt($settings['ldap_networkTimeoutSeconds'] ?? 5, 1, 60);
			$searchTimeout = self::boundedInt($settings['ldap_searchTimeoutSeconds'] ?? 5, 1, 60);
			$connection = null;
			$searchResult = null;

			try {
				$connection = self::ldapCall(static fn() => ldap_connect($server));
				if (!$connection instanceof Connection) {
					self::log($logger, 'The configured LDAP server URL could not be parsed.', ['server' => $server]);
					return self::CONFIGURATION_ERROR;
				}

				if (!self::setConnectionOption($connection, LDAP_OPT_PROTOCOL_VERSION, 3, 'protocol version', $logger)
					|| !self::setConnectionOption($connection, LDAP_OPT_REFERRALS, 0, 'referrals', $logger)
					|| !self::setConnectionOption($connection, LDAP_OPT_NETWORK_TIMEOUT, $networkTimeout, 'network timeout', $logger)
				) {
					return self::CONFIGURATION_ERROR;
				}

				if ($serverScheme === 'ldap' && $startTls && self::ldapCall(static fn() => ldap_start_tls($connection)) !== true) {
					self::logLdapError(
						$logger,
						$connection,
						'Could not establish TLS with the LDAP service.',
						certificateVerificationEnabled: $verifyCertificate
					);
					return self::SERVICE_ERROR;
				}

				if (self::ldapCall(static fn() => ldap_bind($connection, $appUser, $appPassword)) !== true) {
					self::logLdapError(
						$logger,
						$connection,
						'Could not bind to LDAP as the application user.',
						certificateVerificationEnabled: $serverScheme === 'ldaps' && $verifyCertificate
					);
					return self::SERVICE_ERROR;
				}

				$escapedUsername = ldap_escape($username, '', LDAP_ESCAPE_FILTER);
				$query = str_replace('%1', $escapedUsername, $queryTemplate);
				$searchResult = self::ldapCall(static fn() => ldap_search(
					$connection,
					$searchBase,
					$query,
					['dn', 'msds-userpasswordexpirytimecomputed'],
					0,
					2,
					$searchTimeout,
					LDAP_DEREF_NEVER
				));

				if (!$searchResult instanceof Result) {
					self::logLdapError($logger, $connection, 'LDAP user search failed.', ['base' => $searchBase]);
					return self::SERVICE_ERROR;
				}

				$entries = self::ldapCall(static fn() => ldap_get_entries($connection, $searchResult));
				if (!is_array($entries)) {
					self::logLdapError($logger, $connection, 'Could not read LDAP user search results.');
					return self::SERVICE_ERROR;
				}

				$entryCount = (int)($entries['count'] ?? 0);
				if ($entryCount !== 1) {
					self::log($logger, 'LDAP user search did not return exactly one entry.', [
						'username' => $username,
						'entryCount' => $entryCount
					]);
					return self::INVALID_CREDENTIALS;
				}

				$userDn = trim((string)($entries[0]['dn'] ?? ''));
				if ($userDn === '') {
					self::log($logger, 'The LDAP user search returned an empty DN.', ['username' => $username]);
					return self::SERVICE_ERROR;
				}

				$expiryTimestamp = self::activeDirectoryTimestamp(
					$entries[0]['msds-userpasswordexpirytimecomputed'][0] ?? null
				);

				if (self::ldapCall(static fn() => ldap_bind($connection, $userDn, $password)) !== true) {
					$errorNumber = ldap_errno($connection);
					self::logLdapError($logger, $connection, 'LDAP user bind failed.', ['username' => $username]);
					if ($expiryTimestamp !== null && time() > $expiryTimestamp) {
						self::log($logger, 'The LDAP account password has expired.', [
							'username' => $username,
							'expiryTimestamp' => $expiryTimestamp
						]);
						return self::PASSWORD_EXPIRED;
					}
					return $errorNumber === self::LDAP_INVALID_CREDENTIALS_ERROR
						? self::INVALID_CREDENTIALS
						: self::SERVICE_ERROR;
				}

				return self::SUCCESS;
			} catch (Throwable $exception) {
				self::log($logger, 'Unexpected LDAP authentication failure.', [
					'exception' => $exception::class,
					'message' => $exception->getMessage()
				]);
				return self::SERVICE_ERROR;
			} finally {
				if ($searchResult instanceof Result) {
					self::ldapCall(static fn() => ldap_free_result($searchResult));
				}
				if ($connection instanceof Connection) {
					self::ldapCall(static fn() => ldap_unbind($connection));
				}
			}
		}

		private static function validateServerUris(string $server): ?string
		{
			$uris = preg_split('/\s+/', $server, -1, PREG_SPLIT_NO_EMPTY);
			$schemes = [];
			foreach ($uris ?: [] as $uri) {
				if (preg_match('#^(ldaps?)://[^\s]+$#i', $uri, $matches) !== 1) {
					return null;
				}
				$schemes[strtolower($matches[1])] = true;
			}
			return count($schemes) === 1 ? (string)array_key_first($schemes) : null;
		}

		/**
		 * TLS options must be applied globally before ldap_connect() creates the connection object.
		 */
		private static function configureTlsCertificateHandling(array $settings, ?callable $logger): bool
		{
			$verifyCertificate = (bool)($settings['ldap_verifyCertificate'] ?? false);
			$requirementConstant = $verifyCertificate ? 'LDAP_OPT_X_TLS_DEMAND' : 'LDAP_OPT_X_TLS_NEVER';
			if (!defined('LDAP_OPT_X_TLS_REQUIRE_CERT') || !defined($requirementConstant)) {
				self::log($logger, 'The LDAP extension does not expose the requested TLS certificate handling options.');
				return false;
			}

			$certificateRequirement = constant($requirementConstant);
			if (self::ldapCall(static fn() => ldap_set_option(null, LDAP_OPT_X_TLS_REQUIRE_CERT, $certificateRequirement)) !== true) {
				self::log($logger, 'Could not configure LDAP TLS certificate handling.');
				return false;
			}

			$caCertificateFile = trim((string)($settings['ldap_caCertificateFile'] ?? ''));
			if ($caCertificateFile === '') {
				return true;
			}

			$resolvedPath = realpath($caCertificateFile);
			if ($resolvedPath === false || !is_file($resolvedPath) || !is_readable($resolvedPath)) {
				self::log($logger, 'The configured LDAP CA certificate file is not readable.', ['path' => $caCertificateFile]);
				return false;
			}

			if (!defined('LDAP_OPT_X_TLS_CACERTFILE')
				|| self::ldapCall(static fn() => ldap_set_option(null, LDAP_OPT_X_TLS_CACERTFILE, $resolvedPath)) !== true
			) {
				self::log($logger, 'Could not configure the LDAP CA certificate file.', ['path' => $resolvedPath]);
				return false;
			}

			return true;
		}

		private static function setConnectionOption(Connection $connection, int $option, mixed $value, string $name, ?callable $logger): bool
		{
			if (self::ldapCall(static fn() => ldap_set_option($connection, $option, $value)) === true) {
				return true;
			}
			self::logLdapError($logger, $connection, "Could not configure LDAP $name.");
			return false;
		}

		private static function boundedInt(mixed $value, int $minimum, int $maximum): int
		{
			return max($minimum, min($maximum, (int)$value));
		}

		private static function activeDirectoryTimestamp(mixed $fileTime): ?int
		{
			if (!is_string($fileTime) && !is_int($fileTime)) {
				return null;
			}
			$fileTime = (string)$fileTime;
			if (preg_match('/^\d+$/', $fileTime) !== 1) {
				return null;
			}

			if (function_exists('bcdiv') && function_exists('bcsub')) {
				return (int)bcsub(bcdiv($fileTime, '10000000', 0), '11644473600', 0);
			}

			return (int)(((float)$fileTime / 10000000) - 11644473600);
		}

		private static function logLdapError(
			?callable $logger,
			Connection $connection,
			string $message,
			array $context = [],
			bool $certificateVerificationEnabled = false
		): void
		{
			$errorNumber = ldap_errno($connection);
			$context['ldapErrorNumber'] = $errorNumber;
			$context['ldapError'] = ldap_error($connection);
			$diagnosticMessage = null;
			if (defined('LDAP_OPT_DIAGNOSTIC_MESSAGE')
				&& self::ldapCall(static function () use ($connection, &$diagnosticMessage): bool {
					return ldap_get_option($connection, LDAP_OPT_DIAGNOSTIC_MESSAGE, $diagnosticMessage);
				}) === true
				&& is_string($diagnosticMessage)
				&& trim($diagnosticMessage) !== ''
			) {
				$context['ldapDiagnosticMessage'] = $diagnosticMessage;
			}
			if ($certificateVerificationEnabled && $errorNumber === -1) {
				$message .= ' TLS certificate verification may have rejected the server certificate; check the CA chain and certificate hostname. Temporarily disable ldap_verifyCertificate only to confirm this diagnosis.';
				$context['certificateVerification'] = 'enabled';
			}
			self::log($logger, $message, $context);
		}

		private static function log(?callable $logger, string $message, array $context = []): void
		{
			$encodedContext = $context === []
				? ''
				: ' ' . (json_encode($context, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?: '{}');
			error_log("[OASYS LDAP] $message$encodedContext");

			if ($logger !== null) {
				try {
					$logger($message, $context);
				} catch (Throwable $exception) {
					error_log('[OASYS LDAP] LDAP log callback failed: ' . $exception->getMessage());
				}
			}
		}

		private static function ldapCall(callable $operation): mixed
		{
			$previousHandler = null;
			$previousHandler = set_error_handler(static function (int $severity, string $message, string $file, int $line) use (&$previousHandler): bool {
				if (($severity === E_WARNING || $severity === E_NOTICE) && str_contains($message, 'ldap_')) {
					return true;
				}
				if (is_callable($previousHandler)) {
					return (bool)$previousHandler($severity, $message, $file, $line);
				}
				return false;
			});
			try {
				return $operation();
			} finally {
				restore_error_handler();
			}
		}
	}
