<?php

class Crypt {
    private function __construct() {
        // Prevent instantiation
    }

    public static function configFromHex(?string $key, ?string $iv): ?array
	{
		if (!is_string($key) || !is_string($iv)
			|| !preg_match('/^[a-f0-9]{64}$/i', $key)
			|| !preg_match('/^[a-f0-9]{32}$/i', $iv)) return null;
		return ['key' => hex2bin($key), 'iv' => hex2bin($iv), 'method' => 'aes-256-cbc'];
	}

	private static function environmentValue(string $name): ?string
	{
		$value = $_SERVER[$name] ?? $_ENV[$name] ?? getenv($name);
		return is_string($value) && $value !== '' ? $value : null;
	}

	private static function envIni(): array
	{
		$path = __DIR__ . '/../../conf/env.ini';
		if (!file_exists($path)) return [];
		$data = parse_ini_file($path);
		return is_array($data) ? $data : [];
	}

	private static function rotationState(): array
	{
		$path = __DIR__ . '/../../conf/crypt-rotation.json';
		if (!file_exists($path)) return [];
		$data = json_decode((string)file_get_contents($path), true);
		return is_array($data) ? $data : [];
	}

	private static function activeEnvironmentConfig(): ?array
	{
		$env = self::envIni();
		if (empty($env['aes_key']) || empty($env['aes_iv'])) return null;
		return self::configFromHex(
			self::environmentValue((string)$env['aes_key']),
			self::environmentValue((string)$env['aes_iv'])
		);
	}

	public static function pendingEnvironmentNames(): array
	{
		$env = self::envIni();
		return [
			'key' => (string)($env['aes_pending_key'] ?? 'OASYS_AES_PENDING_KEY'),
			'iv' => (string)($env['aes_pending_iv'] ?? 'OASYS_AES_PENDING_IV')
		];
	}

	public static function pendingEnvironmentConfig(): ?array
	{
		$names = self::pendingEnvironmentNames();
		return self::configFromHex(self::environmentValue($names['key']), self::environmentValue($names['iv']));
	}

	private static function fileConfigs(): array
	{
		$path = __DIR__ . '/../../conf/crypt.ini';
		if (!file_exists($path)) return [];
		$config = parse_ini_file($path);
		if (!is_array($config)) return [];
		$result = [];
		$active = self::configFromHex($config['aes_key'] ?? null, $config['aes_iv'] ?? null);
		$previous = self::configFromHex($config['aes_previous_key'] ?? null, $config['aes_previous_iv'] ?? null);
		if ($active) $result[] = $active;
		if ($previous) $result[] = $previous;
		return $result;
	}

	private static function getAesConfigs(): array
	{
		/*
		 * First check if we have env.ini file to get the AES key and IV from environment variables
		 * This is more secure than storing them in a file
		 */
		$activeEnv = self::activeEnvironmentConfig();
		if ($activeEnv) {
			$pending = self::pendingEnvironmentConfig();
			$state = self::rotationState();
			$pendingIsPrimary = $pending && ($state['source'] ?? '') === 'environment'
				&& in_array(($state['stage'] ?? ''), ['rotating', 'awaiting_environment_promotion'], true);
			return $pendingIsPrimary ? [$pending, $activeEnv] : array_values(array_filter([$activeEnv, $pending]));
		}

		// If not, fall back to using the crypt.ini file
        $iniPath = __DIR__ . '/../../conf/crypt.ini';

        if (!file_exists($iniPath)) {
			if (!checkFileWritePermission($iniPath, $tmp)) {
				// write to php error log
				error_log("Crypt::getAesConfig: Cannot write to $iniPath. Please check file permissions.");
				global $returnData; //if it exists it can carry an error back to the user
				$returnData['fatalError'] = "Crypt::getAesConfig: Cannot write to $iniPath. Please check file permissions.";
				$returnData['debug'] = $tmp;
				die();
			};
			try {
				$aes_key = bin2hex(random_bytes(32));
				$aes_iv = bin2hex(random_bytes(16));
			} catch (\Random\RandomException $e) {
				$returnData['fatalError'] = $e->getMessage();
				die();
			}
            $iniContent = "[aes]\naes_key = \"$aes_key\"\naes_iv = \"$aes_iv\"\n";
            file_put_contents($iniPath, $iniContent);
        }

		$configs = self::fileConfigs();
		if (count($configs) === 0) throw new RuntimeException('No valid OASYS encryption configuration is available.');
		return $configs;
    }

	public static function getKeySourceStatus(): array
	{
		$activeEnv = self::activeEnvironmentConfig();
		$configs = $activeEnv ? [$activeEnv] : self::fileConfigs();
		if (!$activeEnv && count($configs) === 0) $configs = self::getAesConfigs();
		$active = $configs[0] ?? null;
		$pending = self::pendingEnvironmentConfig();
		return [
			'source' => $activeEnv ? 'environment' : 'file',
			'activeFingerprint' => $active ? self::fingerprint($active) : null,
			'pendingAvailable' => $pending !== null,
			'pendingFingerprint' => $pending ? self::fingerprint($pending) : null,
			'pendingNames' => self::pendingEnvironmentNames()
		];
	}

	public static function activeConfig(): array
	{
		$configs = self::getAesConfigs();
		if (!isset($configs[0])) throw new RuntimeException('No active encryption configuration is available.');
		return $configs[0];
	}

	/** Active key from the configured source, ignoring a pending rotation key. */
	public static function sourceActiveConfig(): array
	{
		$environment = self::activeEnvironmentConfig();
		if ($environment) return $environment;
		$configs = self::fileConfigs();
		if (!isset($configs[0])) $configs = self::getAesConfigs();
		if (!isset($configs[0])) throw new RuntimeException('No source encryption configuration is available.');
		return $configs[0];
	}

	public static function fingerprint(array $config): string
	{
		return hash('sha256', $config['key'] . $config['iv']);
	}

	public static function encryptWithConfig(string $data, array $config): false|string
	{
		return openssl_encrypt($data, $config['method'], $config['key'], 0, $config['iv']);
	}

	public static function decryptWithConfig(string $data, array $config): false|string
	{
		return openssl_decrypt($data, $config['method'], $config['key'], 0, $config['iv']);
	}

    public static function encryptString($data): false|string
	{
		$cfg = self::getAesConfigs()[0];
        return openssl_encrypt($data, $cfg['method'], $cfg['key'], 0, $cfg['iv']);
    }

    public static function decryptString($data): false|string
	{
		foreach (self::getAesConfigs() as $cfg) {
			$plain = self::decryptWithConfig((string)$data, $cfg);
			if ($plain !== false && mb_check_encoding($plain, 'UTF-8')) return $plain;
		}
		return false;
    }
}
