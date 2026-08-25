<?php

	function clearApiRequests(rixPDO &$db): void {
		//clean out any leftover requests that timed out
		$db->execute("DELETE FROM apiRequests WHERE TIMESTAMPDIFF(MINUTE, created, NOW()) > 1");
	}

	function apiAuthentication(string $apiName, rixPDO &$db, array &$returnData): void {
		$key = getParameter('key', FILTER_UNSAFE_RAW, $returnData);
		if (!$key) {
			$returnData['error'] = "key missing";
			return;
		}

		$res = $db->fetchValue("SELECT id FROM apiKeys WHERE `key` = ? and api = ? LIMIT 1", [$key, $apiName]);
		if ($res['rows'] < 1) {
			$returnData['error'] = "API key not registered";
			return;
		}

		$keyId = $res['data'];
		$challenge = createRandomPassword(8);

		$res = $db->insert('apiRequests', ['keyId' => $keyId, 'challenge' => $challenge]);

		$returnData['challenge'] = $challenge;
		$returnData['challengeId'] = $res['id'];
	}

	function apiRequestVerification(rixPDO &$db, &$returnData): void {

		$response = getParameter('response', FILTER_UNSAFE_RAW, $returnData);
		if (!$response) {
			$returnData['error'] = "response missing";
			return;
		}

		$id = getParameter('id', FILTER_UNSAFE_RAW, $returnData);
		if (!$id) {
			$returnData['error'] = "id missing";
			return;
		}

		/* fetching the secret and the challenge that correspond to the id */

		$res = $db->fetchRow("SELECT secret, challenge FROM apiRequests ar JOIN apiKeys ak ON (ar.keyId = ak.id) WHERE ar.id = ?", [$id]);
		if ($res['rows'] < 1) {
			$returnData['error'] = "API request not registered";
			return;
		}

		$secret = $res['data']['secret'];
		$challenge = $res['data']['challenge'];

		if (!password_verify($secret.$challenge, $response)) {
			$returnData['error'] = "Permission denied";
			return;
			/*
			 * the correct response can only be given by an external source that knows the secret, which is never transmitted
			 *
			 * the generated challenge assures that the same parameters cannot be reused, so even if someone monitors
			 * the traffic, it will be useless
			 */
		}

		/* if the request is authorized we can delete it from the requests table -> it can only be used once */

		$db->execute("DELETE FROM apiRequests WHERE id = ?", [$id]);

	}

	function getParameter(string $variable, int $filter, array &$returnData, bool $decode = false) {
		if (!$decode) {
			return filter_input(INPUT_GET, $variable, $filter) ?? filter_input(INPUT_POST, $variable, $filter) ?? null;
		} else {
			$parameter = filter_input(INPUT_GET, $variable, $filter) ?? filter_input(INPUT_POST, $variable, $filter) ?? null;
			if ($parameter === null) {
				return null;
			}
			$parameter = json_decode($parameter ?? '', true);
			if (json_last_error() != JSON_ERROR_NONE) {
				$returnData['error'] = "Error decoding test takers: JSON error " . json_last_error();
				die();
			}
			return $parameter;
		}
	}