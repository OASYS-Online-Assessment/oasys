<?php
/**
 * Register a user's recent edit activity in users.activity JSON.
 *
 * Behavior:
 * - Validates type ('test' | 'pagegroup'); hard error on invalid type.
 * - Upserts editor's own entry into activity.lastEdited:
 *     - moves (type,id) to front with ts=NOW()
 *     - ensures "others" = []
 *     - caps list to 10
 * - Best-effort fan-out:
 *     - for every OTHER user who already has this (type,id):
 *         - ensure entry has "others": []
 *         - if their ts < editor's ts, upsert {userId:<editor>, ts:NOW()} into "others"
 *     - any issues are added to $returnData['warnings'][] (non-fatal)
 *
 * @param rixPDO $db
 * @param int    $userId     Users.id (the editor)
 * @param int    $elementId  The edited entity ID
 * @param string $type       'test' or 'pagegroup'
 * @return void              Uses $returnData for warnings/errors like other actions
 */
function registerActivity(rixPDO $db, int $userId, int $elementId, string $type): void
{
    global $returnData, $uiLang;

    // --- 0) Validate inputs (hard errors use parent style) -------------------
    $type = strtolower(trim($type));
    if (!in_array($type, ['test', 'pagegroup'], true)) {
        $returnData['error'] = $uiLang->translate("Invalid type specified, please contact your administrator!") .
            " (type='$type')";
        die();
    }

    // --- 1) Load editor's current activity row --------------------------------
    $row = $db->fetchRow("SELECT activity FROM users WHERE id = ? LIMIT 1", [$userId]);
    if (!empty($row['error'])) {
        $returnData['warnings'][] = 'Activity fetch failed (editor): ' . (string)$row['error'];
        return; // best-effort: do not block
    }
    if (($row['rows'] ?? 0) === 0) {
        // This mirrors your hard-error style (like "file deleted by another user")
        $returnData['error'] = $uiLang->translate("This user no longer exists. The view will be refreshed.");
        die();
    }

    $raw = $row['data']['activity'] ?? null;

    // --- 2) Decode editor's activity, tolerate NULL/invalid -------------------
    $activity = [];
    if ($raw !== null && $raw !== '') {
        $decoded = json_decode($raw, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
            $activity = $decoded;
        }
    }
    if (!isset($activity['lastEdited']) || !is_array($activity['lastEdited'])) {
        $activity['lastEdited'] = [];
    }

    $now = date('Y-m-d H:i:s');

    // --- 3) Remove existing (type,id) and prepend fresh entry w/ empty others -
    $activity['lastEdited'] = array_values(array_filter(
        $activity['lastEdited'],
        static function ($e) use ($type, $elementId) {
            $eid = isset($e['id']) ? (int)$e['id'] : null;
            $typ = isset($e['type']) ? strtolower((string)$e['type']) : null;
            return !($eid === $elementId && $typ === $type);
        }
    ));

    array_unshift($activity['lastEdited'], [
        'ts'     => $now,
        'id'     => $elementId,
        'type'   => $type,
        'others' => [] // editor's own "others" is always cleared
    ]);

    if (count($activity['lastEdited']) > 10) {
        $activity['lastEdited'] = array_slice($activity['lastEdited'], 0, 10);
    }

    // --- 4) Save editor's updated activity (best-effort) ----------------------
    $jsonEditor = json_encode($activity, JSON_UNESCAPED_SLASHES);
    if ($jsonEditor === false) {
        $returnData['warnings'][] = 'Activity JSON encode failed (editor).';
        return;
    }

    $upd = $db->execute("UPDATE users SET activity = ? WHERE id = ?", [$jsonEditor, $userId]);
    if (!empty($upd['error'])) {
        $returnData['warnings'][] = 'Activity update failed (editor): ' . (string)$upd['error'];
        return; // best-effort
    }

    // --- 5) Fan-out: annotate OTHER users (best-effort) -----------------------
    // Prefer robust JSON_TABLE on MySQL 8.0+. If unavailable, fall back to LIKE.
    $otherRows = [];
    $otherErr  = null;

    // JSON_TABLE with JSON_VALID guard so invalid/NULL rows don't error out
    $sqlJsonTable = "
        SELECT u.id, u.activity
        FROM users u
        JOIN JSON_TABLE(
            CASE
              WHEN JSON_VALID(u.activity) THEN u.activity
              ELSE JSON_OBJECT('lastEdited', JSON_ARRAY())
            END,
            '$.lastEdited[*]'
            COLUMNS(
              j_id   INT          PATH '$.id',
              j_type VARCHAR(32)  PATH '$.type',
              j_ts   VARCHAR(32)  PATH '$.ts'
            )
        ) le
          ON le.j_id = ? AND LOWER(le.j_type) = LOWER(?)
        WHERE u.id <> ?
    ";

    $try = $db->fetchTable($sqlJsonTable, [$elementId, $type, $userId]);

    if (!empty($try['error'])) {
        // Fallback: LIKE (still verified precisely in PHP below)
        $likeType = '"type":"' . addslashes($type) . '"';
        $likeId   = '"id":' . (int)$elementId;

        $try = $db->fetchTable(
            "SELECT id, activity
               FROM users
              WHERE id <> ?
                AND activity IS NOT NULL
                AND activity <> ''
                AND activity LIKE ?
                AND activity LIKE ?",
            [$userId, '%' . $likeType . '%', '%' . $likeId . '%']
        );
    }

    if (!empty($try['error'])) {
        $otherErr = (string)$try['error']; // non-fatal
    } elseif (!empty($try['rows'])) {
        $otherRows = $try['data'];
    }

    if (!empty($otherRows)) {
        foreach ($otherRows as $u) {
            $targetId = (int)$u['id'];

            // activity may be NULL or invalid; decode defensively
            $alist = json_decode($u['activity'] ?? '[]', true);
            if (json_last_error() !== JSON_ERROR_NONE || !is_array($alist)) {
                continue;
            }
            if (!isset($alist['lastEdited']) || !is_array($alist['lastEdited'])) {
                // This user doesn't have a lastEdited array → skip (we only annotate existing entries)
                continue;
            }

            $changed = false;

            // Find exact (type,id) entry
            foreach ($alist['lastEdited'] as &$entry) {
                $eid = isset($entry['id']) ? (int)$entry['id'] : null;
                $typ = isset($entry['type']) ? strtolower((string)$entry['type']) : null;
                if ($eid !== $elementId || $typ !== $type) continue;

                // Ensure 'others' exists (even if nobody edited later yet)
                if (!array_key_exists('others', $entry) || !is_array($entry['others'])) {
                    $entry['others'] = [];
                    $changed = true; // write back so the key exists
                }

                // Only annotate if this user's ts is older than the editor's ts
                $userTsStr = $entry['ts'] ?? '1970-01-01 00:00:00';
                $userTs    = strtotime($userTsStr) ?: 0;
                $editTs    = strtotime($now) ?: 0;

                if ($userTs < $editTs) {
                    $othersArr = $entry['others']; // ensured above
                    $found = false;

                    foreach ($othersArr as &$o) {
                        if ((int)($o['userId'] ?? 0) === $userId) {
                            if (strtotime($o['ts'] ?? '1970-01-01 00:00:00') < $editTs) {
                                $o['ts'] = $now;
                                $changed = true;
                            }
                            $found = true;
                            break;
                        }
                    }
                    unset($o);

                    if (!$found) {
                        $othersArr[] = ['userId' => $userId, 'ts' => $now];
                        $changed = true;
                    }

                    // Keep newest-first (optional)
                    usort($othersArr, static function ($a, $b) {
                        return strcmp(($b['ts'] ?? ''), ($a['ts'] ?? ''));
                    });

                    $entry['others'] = $othersArr;
                }

                break; // matched entry handled; stop scanning this user
            }
            unset($entry);

            if ($changed) {
                $json = json_encode($alist, JSON_UNESCAPED_SLASHES);
                if ($json !== false) {
                    // Best-effort: ignore individual failures
                    $db->execute("UPDATE users SET activity = ? WHERE id = ?", [$json, $targetId]);
                }
            }
        }
    }

    if (!empty($otherErr)) {
        // Non-fatal info, as requested
        $returnData['warnings'][] = 'Activity fan-out listing failed: ' . $otherErr;
    }
}
