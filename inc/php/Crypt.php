<?php

class Crypt {
    private function __construct() {
        // Prevent instantiation
    }

    private static function getAesConfig(): array
	{
		/*
		 * First check if we have env.ini file to get the AES key and IV from environment variables
		 * This is more secure than storing them in a file
		 */
		$envIniPath = __DIR__ . '/../../conf/env.ini';
		if (file_exists($envIniPath)) {
			$env = parse_ini_file($envIniPath);
			if (isset($env['aes_key']) && isset($env['aes_iv'])) {
				$aes_key = $_SERVER[$env['aes_key']] ?? null;
				$aes_iv = $_SERVER[$env['aes_iv']] ?? null;
				if ($aes_key && $aes_iv) {
					return [
						'key' => hex2bin($aes_key),
						'iv' => hex2bin($aes_iv),
						'method' => 'aes-256-cbc'
					];
				}
			}
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

        $config = parse_ini_file($iniPath);
        $aes_key = hex2bin($config['aes_key']) ?? '';
        $aes_iv = hex2bin($config['aes_iv']) ?? '';
        return [
            'key' => $aes_key,
            'iv' => $aes_iv,
            'method' => 'aes-256-cbc'
        ];
    }

    public static function encryptString($data): false|string
	{
        $cfg = self::getAesConfig();
        return openssl_encrypt($data, $cfg['method'], $cfg['key'], 0, $cfg['iv']);
    }

    public static function decryptString($data): false|string
	{
        $cfg = self::getAesConfig();
        return openssl_decrypt($data, $cfg['method'], $cfg['key'], 0, $cfg['iv']);
    }
}