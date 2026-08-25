<?php

final class EncryptionKeyRotation
{
	private const STATE_FILE = __DIR__ . '/../../../conf/crypt-rotation.json';
	private const CRYPT_FILE = __DIR__ . '/../../../conf/crypt.ini';
	private const LOCK_NAME = 'oasys_encryption_key_rotation';

	private function __construct() {}

	public static function status(rixPDO $db): array
	{
		$keyStatus = Crypt::getKeySourceStatus();
		$maintenance = get_mmode('all', $db);
		$fullMaintenance = is_array($maintenance)
			&& isset($maintenance['frontend'], $maintenance['backend'])
			&& (int)$maintenance['frontend']['status'] === 1
			&& (int)$maintenance['backend']['status'] === 1;
		$state = self::readState();

		return [
			'source' => $keyStatus['source'],
			'activeFingerprint' => self::shortFingerprint($keyStatus['activeFingerprint']),
			'pendingAvailable' => $keyStatus['pendingAvailable'],
			'pendingFingerprint' => self::shortFingerprint($keyStatus['pendingFingerprint']),
			'pendingNames' => $keyStatus['pendingNames'],
			'fullMaintenance' => $fullMaintenance,
			'maintenance' => $maintenance,
			'rotation' => self::publicState($state)
		];
	}

	public static function rotateManaged(rixPDO $db, int $actorId): array
	{
		self::assertFullMaintenance($db);
		$status = Crypt::getKeySourceStatus();
		if ($status['source'] !== 'file') throw new RuntimeException('The active key is managed through environment variables.');
		self::acquireLock($db);

		$oldFile = is_file(self::CRYPT_FILE) ? (string)file_get_contents(self::CRYPT_FILE) : '';
		$oldIni = parse_ini_string($oldFile);
		$old = Crypt::configFromHex($oldIni['aes_previous_key'] ?? $oldIni['aes_key'] ?? null, $oldIni['aes_previous_iv'] ?? $oldIni['aes_iv'] ?? null);
		if (!$old) throw new RuntimeException('The current crypt.ini does not contain a valid key and IV.');

		$existingState = self::readState();
		$resuming = ($existingState['source'] ?? '') === 'file' && ($existingState['stage'] ?? '') === 'rotating';
		if ($resuming) {
			$new = Crypt::configFromHex($oldIni['aes_key'] ?? null, $oldIni['aes_iv'] ?? null);
			if (!$new) throw new RuntimeException('The interrupted rotation has no valid target key.');
		} else {
			$newKey = bin2hex(random_bytes(32));
			$newIv = bin2hex(random_bytes(16));
			$new = Crypt::configFromHex($newKey, $newIv);
			if (!$new) throw new RuntimeException('Could not create a valid replacement key.');
			self::writeState([
				'source' => 'file', 'stage' => 'rotating', 'targetFingerprint' => Crypt::fingerprint($new),
				'actorUserId' => $actorId, 'startedAt' => gmdate('c')
			]);
			self::writeCryptFile($newKey, $newIv, bin2hex($old['key']), bin2hex($old['iv']));
		}

		$databaseCommitted = false;
		try {
			$databaseAlreadyNew = false;
			if ($resuming) {
				$databaseAlreadyNew = self::databaseUsesConfig($db, $new);
				if (!$databaseAlreadyNew && !self::databaseUsesConfig($db, $old)) {
					throw new RuntimeException('The interrupted rotation cannot identify a consistent database key. Rotation was not resumed.');
				}
			}
			$counts = self::migrateDatabase($db, $old, $new, $databaseAlreadyNew);
			$databaseCommitted = true;
			self::writeCryptFile(bin2hex($new['key']), bin2hex($new['iv']));
			self::deleteState();
			self::audit($actorId, 'managed key rotation completed', $counts);
			return ['stage' => 'complete', 'counts' => $counts, 'fingerprint' => self::shortFingerprint(Crypt::fingerprint($new))];
		} catch (Throwable $e) {
			if (!$databaseCommitted) {
				if ($oldFile !== '') self::atomicWrite(self::CRYPT_FILE, $oldFile);
				self::deleteState();
			}
			self::audit($actorId, 'managed key rotation failed', ['error' => $e->getMessage()]);
			throw $e;
		} finally {
			self::releaseLock($db);
		}
	}

	public static function prepareEnvironment(rixPDO $db, int $actorId): array
	{
		self::assertFullMaintenance($db);
		$status = Crypt::getKeySourceStatus();
		if ($status['source'] !== 'environment') throw new RuntimeException('Environment variables are not the active key source.');
		$existing = self::readState();
		if ($existing && (($existing['source'] ?? '') !== 'environment'
			|| ($existing['stage'] ?? '') !== 'awaiting_pending_environment')) {
			throw new RuntimeException('The current encryption-key rotation must be completed before generating another key.');
		}
		$key = bin2hex(random_bytes(32));
		$iv = bin2hex(random_bytes(16));
		$config = Crypt::configFromHex($key, $iv);
		self::writeState([
			'source' => 'environment', 'stage' => 'awaiting_pending_environment',
			'targetFingerprint' => Crypt::fingerprint($config), 'actorUserId' => $actorId,
			'startedAt' => gmdate('c')
		]);
		self::audit($actorId, 'environment key rotation prepared');
		return ['stage' => 'awaiting_pending_environment', 'key' => $key, 'iv' => $iv,
			'pendingNames' => $status['pendingNames'], 'fingerprint' => self::shortFingerprint(Crypt::fingerprint($config))];
	}

	public static function verifyEnvironment(rixPDO $db, int $actorId): array
	{
		self::assertFullMaintenance($db);
		$state = self::requireState('environment', ['awaiting_pending_environment', 'environment_verified']);
		$pending = Crypt::pendingEnvironmentConfig();
		if (!$pending) throw new RuntimeException('The pending key environment variables are unavailable or invalid. Reload PHP after changing the server environment.');
		if (!hash_equals((string)$state['targetFingerprint'], Crypt::fingerprint($pending))) {
			throw new RuntimeException('The pending environment variables do not match the key generated for this rotation.');
		}
		$probe = bin2hex(random_bytes(16));
		$cipher = Crypt::encryptWithConfig($probe, $pending);
		if ($cipher === false || Crypt::decryptWithConfig($cipher, $pending) !== $probe) throw new RuntimeException('The pending encryption key failed its self-test.');
		$state['stage'] = 'environment_verified';
		$state['verifiedAt'] = gmdate('c');
		self::writeState($state);
		self::audit($actorId, 'pending environment key verified');
		return ['stage' => 'environment_verified', 'fingerprint' => self::shortFingerprint(Crypt::fingerprint($pending))];
	}

	public static function rotateEnvironmentData(rixPDO $db, int $actorId): array
	{
		self::assertFullMaintenance($db);
		$state = self::requireState('environment', ['environment_verified', 'rotating']);
		$status = Crypt::getKeySourceStatus();
		$pending = Crypt::pendingEnvironmentConfig();
		if (!$pending || !hash_equals((string)$state['targetFingerprint'], Crypt::fingerprint($pending))) {
			throw new RuntimeException('The verified pending environment key is no longer available.');
		}
		$probe = bin2hex(random_bytes(16));
		$probeCipher = Crypt::encryptWithConfig($probe, $pending);
		if ($probeCipher === false || Crypt::decryptWithConfig($probeCipher, $pending) !== $probe) {
			throw new RuntimeException('The pending environment key failed its final self-test. The database was not changed.');
		}
		$old = Crypt::sourceActiveConfig();
		if (Crypt::fingerprint($old) === Crypt::fingerprint($pending)) throw new RuntimeException('The pending key must differ from the active key.');
		self::acquireLock($db);
		try {
			$state['stage'] = 'rotating';
			self::writeState($state);
			$databaseAlreadyNew = self::databaseUsesConfig($db, $pending);
			if (!$databaseAlreadyNew && !self::databaseUsesConfig($db, $old)) {
				throw new RuntimeException('The interrupted rotation cannot identify a consistent database key. Rotation was not resumed.');
			}
			$counts = self::migrateDatabase($db, $old, $pending, $databaseAlreadyNew);
			$state['stage'] = 'awaiting_environment_promotion';
			$state['databaseRotatedAt'] = gmdate('c');
			$state['counts'] = $counts;
			self::writeState($state);
			self::audit($actorId, 'database re-encrypted with pending environment key', $counts);
			return ['stage' => 'awaiting_environment_promotion', 'counts' => $counts,
				'fingerprint' => self::shortFingerprint(Crypt::fingerprint($pending))];
		} finally {
			self::releaseLock($db);
		}
	}

	public static function finalizeEnvironment(rixPDO $db, int $actorId): array
	{
		self::assertFullMaintenance($db);
		$state = self::requireState('environment', ['awaiting_environment_promotion']);
		$status = Crypt::getKeySourceStatus();
		if ($status['source'] !== 'environment' || !hash_equals((string)$state['targetFingerprint'], (string)$status['activeFingerprint'])) {
			throw new RuntimeException('The new key is not yet active. Promote it to the active environment variables and reload PHP first.');
		}
		self::verifyDatabaseWithConfig($db, Crypt::activeConfig());
		self::deleteState();
		self::audit($actorId, 'environment key rotation finalized', $state['counts'] ?? []);
		return ['stage' => 'complete', 'counts' => $state['counts'] ?? [],
			'fingerprint' => self::shortFingerprint($status['activeFingerprint'])];
	}

	private static function migrateDatabase(rixPDO $db, array $old, array $new, bool $alreadyCommitted): array
	{
		$sets = [
			['table' => 'logins', 'id' => 'id', 'column' => 'password', 'where' => "`password` IS NOT NULL AND `password` <> ''"],
			['table' => 'passwords', 'id' => 'id', 'column' => 'name', 'where' => "`name` IS NOT NULL AND `name` <> ''"],
			['table' => 'settings', 'id' => 'option', 'column' => 'value', 'where' => '`encryption` = 1']
		];
		$prepared = [];
		$counts = [];
		foreach ($sets as $set) {
			$rows = $db->fetchTable("SELECT `{$set['id']}`, `{$set['column']}` FROM `{$set['table']}` WHERE {$set['where']}", [])['data'];
			$prepared[$set['table']] = [];
			foreach ($rows as $row) {
				$cipher = (string)$row[$set['column']];
				$source = $alreadyCommitted ? $new : $old;
				$plain = Crypt::decryptWithConfig($cipher, $source);
				if ($plain === false || Crypt::encryptWithConfig($plain, $source) !== $cipher) {
					throw new RuntimeException("Cannot decrypt {$set['table']}.{$set['column']} row {$row[$set['id']]}. Rotation was not started.");
				}
				if (!mb_check_encoding($plain, 'UTF-8')) {
					throw new RuntimeException("Invalid encrypted text in {$set['table']}.{$set['column']} row {$row[$set['id']]}. Rotation was not started.");
				}
				$newCipher = Crypt::encryptWithConfig($plain, $new);
				if ($newCipher === false || Crypt::decryptWithConfig($newCipher, $new) !== $plain) throw new RuntimeException('Replacement encryption self-check failed.');
				$prepared[$set['table']][] = ['id' => $row[$set['id']], 'cipher' => $newCipher, 'definition' => $set];
			}
			$counts[$set['table']] = count($prepared[$set['table']]);
		}

		if ($db->startTransaction() !== true) throw new RuntimeException('Could not start the encryption-key rotation transaction.');
		try {
			foreach ($prepared as $rows) foreach ($rows as $row) {
				$set = $row['definition'];
				$db->execute("UPDATE `{$set['table']}` SET `{$set['column']}` = ? WHERE `{$set['id']}` = ?", [$row['cipher'], $row['id']]);
			}
			self::verifyDatabaseWithConfig($db, $new);
			if ($db->commit() !== true) throw new RuntimeException('Could not commit encryption-key rotation.');
		} catch (Throwable $e) {
			$db->rollback();
			throw $e;
		}
		return $counts;
	}

	private static function verifyDatabaseWithConfig(rixPDO $db, array $config): void
	{
		if (!self::databaseUsesConfig($db, $config)) {
			throw new RuntimeException('Verification of an encrypted database value failed.');
		}
	}

	private static function databaseUsesConfig(rixPDO $db, array $config): bool
	{
		$queries = [
			"SELECT `id`, `password` AS cipher FROM `logins` WHERE `password` IS NOT NULL AND `password` <> ''",
			"SELECT `id`, `name` AS cipher FROM `passwords` WHERE `name` IS NOT NULL AND `name` <> ''",
			"SELECT `option` AS id, `value` AS cipher FROM `settings` WHERE `encryption` = 1"
		];
		foreach ($queries as $query) foreach ($db->fetchTable($query, [])['data'] as $row) {
			$plain = Crypt::decryptWithConfig((string)$row['cipher'], $config);
			if ($plain === false || !mb_check_encoding($plain, 'UTF-8')
				|| Crypt::encryptWithConfig($plain, $config) !== $row['cipher']) {
				return false;
			}
		}
		return true;
	}

	private static function assertFullMaintenance(rixPDO $db): void
	{
		$status = get_mmode('all', $db);
		if (!is_array($status) || !isset($status['frontend'], $status['backend'])
			|| (int)$status['frontend']['status'] !== 1 || (int)$status['backend']['status'] !== 1) {
			throw new RuntimeException('Frontend and backend maintenance mode must both be enabled.');
		}
	}

	private static function acquireLock(rixPDO $db): void
	{
		$result = $db->fetchValue('SELECT GET_LOCK(?, 0)', [self::LOCK_NAME])['data'];
		if ((int)$result !== 1) throw new RuntimeException('Another encryption-key rotation is already running.');
	}

	private static function releaseLock(rixPDO $db): void
	{
		$db->fetchValue('SELECT RELEASE_LOCK(?)', [self::LOCK_NAME]);
	}

	private static function readState(): array
	{
		if (!is_file(self::STATE_FILE)) return [];
		$data = json_decode((string)file_get_contents(self::STATE_FILE), true);
		return is_array($data) ? $data : [];
	}

	private static function requireState(string $source, array $stages): array
	{
		$state = self::readState();
		if (($state['source'] ?? '') !== $source || !in_array(($state['stage'] ?? ''), $stages, true)) {
			throw new RuntimeException('No matching encryption-key rotation is ready for this step.');
		}
		return $state;
	}

	private static function writeState(array $state): void
	{
		self::atomicWrite(self::STATE_FILE, json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");
	}

	private static function deleteState(): void
	{
		if (is_file(self::STATE_FILE) && !unlink(self::STATE_FILE)) throw new RuntimeException('Could not remove the completed rotation state.');
	}

	private static function writeCryptFile(string $key, string $iv, ?string $previousKey = null, ?string $previousIv = null): void
	{
		$content = "[aes]\naes_key = \"$key\"\naes_iv = \"$iv\"\n";
		if ($previousKey !== null && $previousIv !== null) $content .= "aes_previous_key = \"$previousKey\"\naes_previous_iv = \"$previousIv\"\n";
		self::atomicWrite(self::CRYPT_FILE, $content);
	}

	private static function atomicWrite(string $path, string $content): void
	{
		$tmp = $path . '.tmp.' . bin2hex(random_bytes(6));
		if (file_put_contents($tmp, $content, LOCK_EX) === false) throw new RuntimeException("Could not write $path.");
		@chmod($tmp, 0600);
		if (!rename($tmp, $path)) { @unlink($tmp); throw new RuntimeException("Could not activate $path."); }
	}

	private static function publicState(array $state): array
	{
		if (!$state) return [];
		return array_filter([
			'source' => $state['source'] ?? null, 'stage' => $state['stage'] ?? null,
			'fingerprint' => self::shortFingerprint($state['targetFingerprint'] ?? null),
			'startedAt' => $state['startedAt'] ?? null, 'verifiedAt' => $state['verifiedAt'] ?? null,
			'databaseRotatedAt' => $state['databaseRotatedAt'] ?? null, 'counts' => $state['counts'] ?? null
		], static fn($value) => $value !== null);
	}

	private static function shortFingerprint(?string $fingerprint): ?string
	{
		return $fingerprint ? substr($fingerprint, 0, 12) : null;
	}

	private static function audit(int $actorId, string $message, array $details = []): void
	{
		error_log('OASYS encryption key rotation: ' . json_encode([
			'actorUserId' => $actorId, 'message' => $message, 'details' => $details, 'time' => gmdate('c')
		], JSON_UNESCAPED_SLASHES));
	}
}
