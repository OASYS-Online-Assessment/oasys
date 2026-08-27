<?php

/**
 * Reusable system check for OASYS (widget-friendly).
 * Mirrors the logic/structure used by systemSettingActions.php::syscheck()
 *
 * Exports:
 *   function oasys_syscheck(rixPDO $db): array
 *
 * Return shape:
 *   [
 *     'ok'   => bool,    // overall pass (no hard failures)
 *     'data' => [
 *       'req'      => [label => requiredText],
 *       'found'    => [label => foundText|HTML],
 *       'warn'     => [label => warnText|HTML],
 *       'failMsgs' => [label => failText|HTML],
 *       'categories' => [label => categoryText],
 *       'details'    => [label => secondaryParameterText],
 *       // each label key also maps to a flag: true | false | "warn"
 *     ]
 *   ]
 */

if (!function_exists('oasys_syscheck')) {

    /**
     * Extract privileges that apply to the active OASYS database.
     *
     * SHOW GRANTS may return grants for several databases when one account is
     * shared by multiple OASYS instances. Only global grants and grants for the
     * active database are relevant to this check.
     */
    function oasys_parse_database_grants(array $grants, string $activeDatabase): array
    {
        $present = [];
        $relevantGrants = [];
        $otherDatabases = [];
        $hasAll = false;
        $hasActiveDatabaseGrant = false;

        $unquoteIdentifier = static function (string $identifier): string {
            $identifier = trim($identifier);
            $length = strlen($identifier);
            if ($length >= 2 && $identifier[0] === '`' && $identifier[$length - 1] === '`') {
                return str_replace('``', '`', substr($identifier, 1, -1));
            }
            if ($length >= 2 && $identifier[0] === '"' && $identifier[$length - 1] === '"') {
                return str_replace('""', '"', substr($identifier, 1, -1));
            }
            return $identifier;
        };

        foreach ($grants as $grantValue) {
            $grant = trim((string)$grantValue);
            if (!preg_match('/^GRANT\s+(.+?)\s+ON\s+(.+?)\s+TO\s+/iu', $grant, $matches)) {
                // Role assignments do not contain an ON clause and are not
                // direct database grants, so they are intentionally ignored.
                continue;
            }

            $privilegeClause = trim($matches[1]);
            $target = preg_replace('/\s*\.\s*/u', '.', trim($matches[2]));
            $applies = ($target === '*.*');

            if (!$applies && preg_match('/^(.+)\.\*$/u', $target, $scopeMatch)) {
                $scopeDatabase = $unquoteIdentifier($scopeMatch[1]);
                $applies = ($activeDatabase !== '' && $scopeDatabase === $activeDatabase);
                if ($applies) {
                    $hasActiveDatabaseGrant = true;
                } elseif ($scopeDatabase !== '' && $scopeDatabase !== '*') {
                    $otherDatabases[$scopeDatabase] = true;
                }
            }
            if (!$applies) continue;

            $relevantGrants[] = $grant;
            foreach (explode(',', $privilegeClause) as $privilege) {
                $privilege = strtoupper(trim($privilege));
                if ($privilege === 'ALL' || $privilege === 'ALL PRIVILEGES') {
                    $hasAll = true;
                    continue;
                }
                if ($privilege !== '') $present[$privilege] = true;
            }
        }

        ksort($otherDatabases, SORT_NATURAL | SORT_FLAG_CASE);

        return [
            'present' => array_keys($present),
            'hasAll' => $hasAll,
            'hasActiveDatabaseGrant' => $hasActiveDatabaseGrant,
            'otherDatabases' => array_keys($otherDatabases),
            'relevantGrants' => $relevantGrants,
        ];
    }

    function oasys_syscheck(rixPDO $db): array
    {
        global $config;
        $out = [
            'ok'   => true,
            'data' => [
                'req'      => [],
                'found'    => [],
                'warn'     => [],
                'failMsgs' => [],
                'categories' => [],
                'details'  => [],
            ],
        ];

        // ---------- helpers ----------
        $set = function (string $key, $flag, string $req, string $found, string $failMsg = '', string $warnMsg = '', string $category = 'General') use (&$out) {
            $out['data'][$key] = $flag;                       // true | false | "warn"
            $out['data']['req'][$key]   = $req;
            $out['data']['found'][$key] = $found;
            $out['data']['categories'][$key] = $category;
            if ($failMsg !== '') $out['data']['failMsgs'][$key] = $failMsg;
            if ($warnMsg !== '') $out['data']['warn'][$key]     = $warnMsg;
            if ($flag === false) $out['ok'] = false;
        };

        $bytes = function ($val) {
            $val = trim((string)$val);
            if ($val === '' || $val === '-1') return -1;
            if (is_numeric($val)) return (int)$val;
            $last = strtolower($val[strlen($val) - 1]);
            $num  = (float) substr($val, 0, -1);
            switch ($last) {
                case 'g':
                    $num *= 1024;
                case 'm':
                    $num *= 1024;
                case 'k':
                    $num *= 1024;
            }
            return (int)$num;
        };

        // ---------- PHP version ----------
        $pv = phpversion();
        $phpMin = '8.3.23';
        $phpMaxExclusive = '8.6.0';
        $flag = (version_compare($pv, $phpMin, '>=') && version_compare($pv, $phpMaxExclusive, '<'))
            ? true
            : (version_compare($pv, $phpMaxExclusive, '>=') ? 'warn' : false);
        $set(
            'Php Version',
            $flag,
            ">= $phpMin < $phpMaxExclusive",
            $pv,
            "Oasys is officially supported on versions from {$phpMin} up to, but not including, {$phpMaxExclusive}. Please update your Php version to a supported version.",
            "{$pv}\n\nPlease note that Oasys has not been officially verified on this version of Php. You may continue to use this version at your own risk!",
            "PHP runtime"
        );

        // ---------- PHP extensions ----------
        $reqExts = [
            'XMLReader'            => ['xmlreader',   true],
            'XMLWriter'            => ['xmlwriter',   true],
            'XML'                  => ['xml',         true],
            'BCMath'               => ['bcmath',      true],
            'Php Zlib Module'      => ['zlib',        true],
            'Php ZIP Module'       => ['zip',         true],
            'Php MBSTRING Module'  => ['mbstring',    true],
            'php PDO Module'       => ['PDO',         true],
            'Php PDO MYSQL Module' => ['pdo_mysql',   true],
            'Php PDO SQLITE Module' => ['pdo_sqlite', true],
            'Php CURL Module'      => ['curl',        true],
            'Php FILEINFO Module'  => ['fileinfo',    true],
            'Php openSSL Module'   => ['openssl',     false], // optional -> warn if missing
            'Php LDAP Module'      => ['ldap',        false], // optional -> warn if missing
        ];
        foreach ($reqExts as $label => [$ext, $required]) {
            $loaded = extension_loaded($ext);
            $flag   = $required ? $loaded : ($loaded ? true : 'warn');
            $reqStr = $required ? "Yes" : "Optional";
            $found  = $loaded ? "Yes" : "No";
            $fail   = $required ? "You are missing the '{$ext}' module in your Php instance. See the PHP manual: https://www.php.net/manual/en/" : '';
            $warn   = (!$required && !$loaded) ? "No\n\nWarning! The '{$ext}' module is not installed. Some optional features may not work. See the PHP manual: https://www.php.net/manual/en/" : '';
            $set($label, $flag, $reqStr, $found, $fail, $warn, "PHP extensions");
        }

        // ---------- php.ini sanity ----------
        // Post > Upload
        $uploadSize = (int) rtrim((string)ini_get('upload_max_filesize'), "M");
        $postSize   = (int) rtrim((string)ini_get('post_max_size'), "M");
        $flag = ($postSize > $uploadSize);
        $set(
            'Post Max > Upload Max',
            $flag,
            "Yes",
            $flag ? "Yes" : "No",
            "The Php max post size (currently {$postSize}M) must be larger than the Php max upload size (currently {$uploadSize}M). Adjust upload_max_filesize and post_max_size and restart Apache.",
            '',
            "PHP configuration"
        );

        // Max execution time
        $maxTime   = (int) ini_get('max_execution_time');
        $minMax    = 300;
        $set(
            'Max Execution Time',
            $maxTime >= $minMax,
            ">= {$minMax}",
            (string)$maxTime,
            "The Php max execution time (currently {$maxTime}) must be >= {$minMax}. Adjust max_execution_time and restart Apache.",
            '',
            "PHP configuration"
        );

        // Memory limit
        $actualMemHR = (string) ini_get('memory_limit');
        $actualBytes = $bytes($actualMemHR);
        $minHR = '256M';
        $minB = $bytes($minHR);
        $recHR = '512M';
        $recB = $bytes($recHR);
        $flag  = ($actualBytes === -1 || $actualBytes >= $recB) ? true : (($actualBytes >= $minB) ? 'warn' : false);
        $set(
            'Memory Limit',
            $flag,
            ">= {$minHR}",
            ($actualBytes === -1 ? 'NO LIMIT' : $actualMemHR),
            "The configured Php Memory Limit (currently {$actualMemHR}) must be >= {$minHR}. Adjust memory_limit (recommended {$recHR}+).",
            "{$actualMemHR}\n\nWarning! Meets minimum, but it is recommended to set at least {$recHR}.",
            "PHP configuration"
        );

        // ---------- File permissions ----------
        $permissionPaths = [
            '/customContent' => 'customContent',
            '/media'         => 'media',
            '/logs'          => 'logs',
            '/backupRestore' => 'backupRestore',
            '/pkg_installer' => 'pkg_installer',
            '/oasys_ver.txt' => 'oasys_ver.txt',
        ];
        $rootPath = realpath(__DIR__ . '/../../..');
        foreach ($permissionPaths as $label => $relativePath) {
            $path = $rootPath ? $rootPath . DIRECTORY_SEPARATOR . $relativePath : false;
            if (!$path || !file_exists($path)) {
                $pathType = str_contains($relativePath, '.') ? 'file' : 'path';
                $set(
                    $label,
                    false,
                    "Writable",
                    "Missing",
                    "The {$pathType} /{$relativePath} does not exist. Create it and make it writable by the web application.",
                    '',
                    "File permissions"
                );
                continue;
            }

            $isContainerized = ($_SERVER['OASYS_APP_RUNMODE'] ?? '') === "containerized";

            $notWritable = [];
            $exceptions = ['.htaccess', '.gitkeep', 'placeholder', 'preStop.log'];
            if ($isContainerized === true) {
                $exceptions[] = 'oasys_ver.txt';
            }

            // Skip writable checks for pkg_installer folder entirely (containerized only)
            if ($isContainerized && $relativePath === 'pkg_installer') {
                $notWritable = [];
            } else {
                if (!is_writable($path)) {
                    $baseName = basename($relativePath);
                    if (!in_array($baseName, $exceptions, true)) {
                        $notWritable[] = '/' . $relativePath;
                    }
                }
                if (is_dir($path)) {
                    try {
                        $iterator = new RecursiveIteratorIterator(
                            new RecursiveDirectoryIterator($path, RecursiveDirectoryIterator::SKIP_DOTS),
                            RecursiveIteratorIterator::SELF_FIRST
                        );
                        foreach ($iterator as $entry) {
                            if (!$entry->isWritable()) {
                                $fileName = $entry->getBasename();
                                if (!in_array($fileName, $exceptions, true)) {
                                    $notWritable[] = '/' . $relativePath . '/' . str_replace(DIRECTORY_SEPARATOR, '/', $iterator->getSubPathName());
                                    if (count($notWritable) >= 20) {
                                        break;
                                    }
                                }
                            }
                        }
                    } catch (Exception $e) {
                        $notWritable[] = '/' . $relativePath . ' (could not scan contents)';
                    }
                }
            }

            $passed = empty($notWritable);
            $found = $passed ? "Writable" : "Not writable: " . count($notWritable) . " item(s)";
            $required = "Writable";
            $failScope = is_dir($path) ? "and all existing files and folders below it" : "";
            $fail = $passed ? '' : "The web application must be able to write to /{$relativePath} {$failScope}.\n\nFirst affected paths:\n" . implode("\n", $notWritable);
            $set(
                $label,
                $passed,
                $required,
                $found,
                $fail,
                '',
                "File permissions"
            );
        }

        // ---------- Database checks ----------
        // Product/version
        $verRow  = $db->fetchValue("SELECT VERSION()")['data'] ?? '';
        $parts   = explode('-', (string)$verRow);
        $dbVersion = $parts[0] ?? '';
        $dbName    = $parts[1] ?? '';
        $set(
            'Database Product',
            ($dbName === 'MariaDB'),
            "MariaDB",
            (string)$dbName,
            "Not running the correct database product.",
            '',
            "Database"
        );
        $minDB = '11.8.2';
        $maxDBExclusive = '12.4.0';
        $flagDB = (version_compare($dbVersion, $minDB, '>=') && version_compare($dbVersion, $maxDBExclusive, '<'))
            ? true
            : (version_compare($dbVersion, $maxDBExclusive, '>=') ? 'warn' : false);
        $set(
            'Database Version',
            $flagDB,
            ">= {$minDB} < {$maxDBExclusive}",
            (string)$dbVersion,
            "Not running the correct database version. Although Oasys may continue to run, MariaDB version {$dbVersion} is no longer officially supported.",
            "{$dbVersion}\n\nPlease note this version has not been officially verified for Oasys. You may continue to use this version at your own risk!",
            "Database"
        );

        // Oasys Database DDL
        $curDDL = $config->settings['database_version'];
        if (is_string($curDDL) && preg_match('/^v(\d{2})$/', $curDDL, $matches)) {
            $curDDL = 'v' . str_pad($matches[1], 3, '0', STR_PAD_LEFT);
        }

        $expectedDDL = (function () use ($config, $db) {
            $dbDir = dirname(__DIR__, 3) . '/database';
            $patchDirs = array_filter(scandir($dbDir), function ($item) use ($dbDir) {
                return is_dir($dbDir . '/' . $item) && preg_match('/^v\d+(\.\d+)*$/', $item);
            });
            sort($patchDirs, SORT_NATURAL);
            $latestPatchDir = end($patchDirs);

            return $latestPatchDir;
        })();
        $set(
            'Oasys DDL Version',
            ($curDDL === $expectedDDL),
            $expectedDDL,
            $curDDL,
            "The Oasys database DDL version is not up to date. Please log out and log back in, and if this does not resolve the error, please contact the system administrator.",
            '',
            "Database"
        );

        // table_definition_cache
        $tdcRow = $db->fetchRow("SHOW GLOBAL VARIABLES WHERE `Variable_name` = 'table_definition_cache'", [])['data'] ?? [];
        $tdcVal = isset($tdcRow['Value']) ? (int)$tdcRow['Value'] : 0;
        $set(
            'Table Definition Cache',
            ($tdcVal >= 1024),
            ">= 1024",
            (string)$tdcVal,
            "The table definition cache value must be 1024 or higher. Set table_definition_cache and restart MariaDB.",
            '',
            "Database"
        );

        // innodb_flush_log_at_trx_commit
        $dfl = (int) ($db->fetchRow("SHOW VARIABLES LIKE 'innodb_flush_log_at_trx_commit'")['data']['Value'] ?? 1);
        $set(
            'Flush Log at Transaction Commit',
            ($dfl === 0),
            "0",
            (string)$dfl,
            "Flush Log at Tx Commit setting not correct. Set innodb_flush_log_at_trx_commit=0 and restart MariaDB.",
            '',
            "Database"
        );

        // collation
        $coll = (string) ($db->fetchValue("SELECT @@collation_database")['data'] ?? '');
        $set(
            'Database Collation Value',
            ($coll === 'utf8mb4_unicode_520_ci'),
            "utf8mb4_unicode_520_ci",
            $coll,
            "Database collation value not correct. ALTER the database with the required collation.",
            '',
            "Database"
        );

        // charset
        $charset = (string) ($db->fetchValue("SELECT @@character_set_database")['data'] ?? '');
        $set(
            'Database Character Set',
            ($charset === 'utf8mb4'),
            "utf8mb4",
            $charset,
            "Database character set not correct. ALTER the database with the required character set.",
            '',
            "Database"
        );

        // PHP / DB time differential
        $nowDb = $db->fetchValue("SELECT NOW()")['data'] ?? null;
        if ($nowDb) {
            $serverTime = date_create($nowDb);
            $diff = date_diff($serverTime, date_create(), true);
            $secs = ($diff->d * 86400) + ($diff->h * 3600) + ($diff->i * 60) + $diff->s;
            $nice = $diff->format(($diff->d * 24 + $diff->h) . " hour %i minute %s second differential");
            $set(
                'Php/Server Time Differential',
                ($secs <= 15),
                "<= 15 second differential",
                $nice,
                "Php and server time differential exceeds the limit. Ensure PHP timezone and server timezone match.",
                '',
                "Database"
            );
        } else {
            $set('Php/Server Time Differential', 'warn', "<= 15 second differential", "N/A", '', "Could not read DB time for comparison.", "Database");
        }

        // Grants
        $grants = $db->fetchColumn("SHOW GRANTS FOR CURRENT_USER")['data'] ?? [];
        $activeDatabase = (string)($db->fetchValue("SELECT DATABASE()")['data'] ?? '');
        $currentAccount = (string)($db->fetchValue("SELECT CURRENT_USER()")['data'] ?? '');
        $minGrantList = [
            'SELECT',
            'INSERT',
            'UPDATE',
            'DELETE',
            'CREATE',
            'DROP',
            'ALTER',
            'INDEX',
            'LOCK TABLES',
            'EXECUTE',
            'CREATE VIEW',
            'SHOW VIEW'
        ];
        $minStr = implode("\n", $minGrantList);

        $grantInfo = oasys_parse_database_grants(is_array($grants) ? $grants : [], $activeDatabase);
        $present = $grantInfo['present'];
        $context = "ACCOUNT: " . ($currentAccount !== '' ? $currentAccount : 'N/A')
            . "\nDATABASE: " . ($activeDatabase !== '' ? $activeDatabase : 'N/A');
        $out['data']['details']['User Grant Privileges'] = $context;

        if ($grantInfo['hasAll']) {
            $set(
                'User Grant Privileges',
                true,
                $minStr,
                $minStr,
                '',
                '',
                "Database"
            );
        } else {
            $missing = [];
            foreach ($minGrantList as $need) if (!in_array($need, $present, true)) $missing[] = $need;

            if (empty($grants) || $activeDatabase === '') {
                $set(
                    'User Grant Privileges',
                    false,
                    $minStr,
                    "N/A",
                    "Unable to determine the grant privileges for the active database and database user. Please review the configured database and host-specific user accounts.",
                    '',
                    "Database"
                );
            } else {
                $passed = empty($missing);
                $foundText = $present ? implode("\n", $present) : 'USAGE';
                if ($passed) {
                    $set('User Grant Privileges', true, $minStr, $foundText, '', '', "Database");
                } else {
                    /*
                     * MariaDB authenticates with the most specific user@host
                     * account, but database-level rows for another matching
                     * host pattern (commonly the same user@%) can still provide
                     * effective privileges. Neither SHOW GRANTS FOR
                     * CURRENT_USER nor INFORMATION_SCHEMA.SCHEMA_PRIVILEGES
                     * exposes those rows to an unprivileged application user.
                     * Treat an incomplete enumeration as inconclusive rather
                     * than reporting a false failure.
                     */
                    $warnText = "The required privileges could not be fully verified from this connection.\n\n"
                        . "NOT DIRECTLY VISIBLE:\n" . implode("\n", $missing)
                        . "\n\nMariaDB may supply effective database privileges through another matching host-specific grant, such as "
                        . (($currentAccount !== '' && str_contains($currentAccount, '@'))
                            ? substr($currentAccount, 0, strrpos($currentAccount, '@')) . "@%"
                            : 'user@%')
                        . ". OASYS cannot inspect that account without access to the MariaDB privilege tables. Verify the effective grants with a database administrator.";
                    $set('User Grant Privileges', 'warn', $minStr, $foundText, '', $warnText, "Database");
                }
            }
        }
        return $out;
    }
}
