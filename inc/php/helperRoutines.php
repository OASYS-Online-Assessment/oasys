<?php


/* -------------------------------------------
 * helper routines used in most action scripts
 * ------------------------------------------- */

/*
 * checks if mandatory data is present
 */
function checkParams(&$data, $params)
{
    GLOBAL $returnData;
    if (!$params || count($params) == 0) {
        return;
    }
    foreach ($params as $key) {
        if (!isset($data[$key])) {
            $returnData['error'] = "Error: missing parameter '$key'!";
            die();
        }
    }
}

/*
 * This is used to encode associative arrays to JSON string in order to save it to the database.
 * If an empty array is sent, PHP will not recognize that it should be an associative array
 * and thus encode it as a normal array which will end up as an Array rather than an Object
 * when decoded in Javascript, which will cause problems.
 * That's why it uses the JSON_FORCE_OBJECT flag to force empty arrays to be encoded as Objects rather than Arrays.
 *
 * Usage example:
 *		encodeData($data, ['options', 'settings']);
 *
 * In this example we are sending the $data array by reference and tell it to replace the contents of the
 * key 'options' and the key 'settings' by their respective JSON encoded forms.
 */
function encodeData(&$data, $params)
{
    if (!$params || count($params) == 0) {
        return;
    }
    foreach ($params as $key) {
        if (isset($data[$key])) {
            $data[$key] = json_encode($data[$key], JSON_FORCE_OBJECT);
        }
    }
}

/*
 * This is used to easily decode multiple JSON objects in one go
 * if $data consist of an array of several rows of data, $tableMode must be true to decode all rows recursively
 */
function decodeData(&$data, $params = [], $tableMode = false, $useAssoc = true): void
{
    if ($params && is_string($params)) {
        $params = [$params];
    }
    if (!$params || count($params) == 0) {
        $data = json_decode($data ?? '', $useAssoc);
    }
    if ($tableMode) {
        foreach ($data as $k => $row) {
            decodeData($row, $params, false, $useAssoc);
            $data[$k] = $row;
        }
    } else {
        foreach ($params as $key) {
			if (!isset($data[$key])) {
				$data[$key] = $useAssoc ? '[]' : '{}';
			}
			$data[$key] = json_decode($data[$key] ?? '', $useAssoc);
        }
    }
}

//Creates a random string
function randomString($length)
{
    $chars = '23456789bcdfghjkmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ';
    $charLength = strlen($chars);
    $randomString = '';
    for ($i = 0; $i < $length; $i++) {
        $randomString .= $chars[rand(0, $charLength - 1)];
    }
    return $randomString;
}

//checks if a variable is empty, also if there are just spaces or tabs
function blank($String)
{
    if (!isset($String)) {
        return true;
    }

    $Replace = array(' ', '&nbsp;');
    $String = trim($String);
    $String = str_replace($Replace, '', $String);

    return empty($String);
}