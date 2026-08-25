<?php

/**
 * Registers endpoint-specific action allowlists.
 *
 * Frontend, backend, installers, and optional modules own their respective
 * lists and register them while bootstrapping.
 */
function oasysRegisterActionAllowlists(array $allowlists): void
{
    $registered = $GLOBALS['oasysActionAllowlists'] ?? [];
    $GLOBALS['oasysActionAllowlists'] = array_replace($registered, $allowlists);
}

function oasysActionIsAllowed(string $endpoint, mixed $action): bool
{
    if (!is_string($action) || $action === '') return false;

    $endpoint = str_replace('\\', '/', $endpoint);
    foreach ($GLOBALS['oasysActionAllowlists'] ?? [] as $suffix => $allowed) {
        if (str_ends_with($endpoint, '/' . $suffix) || $endpoint === $suffix) {
            return in_array($action, $allowed, true);
        }
    }
    return false;
}

function oasysRejectUnknownAction(string $endpoint, mixed $action, array &$returnData): bool
{
    if (oasysActionIsAllowed($endpoint, $action)) return false;
    http_response_code(400);
    $message = 'The requested action is not supported by this endpoint.';
    $returnData['error'] = $message;
    // AJAX error handlers display fatalError for non-2xx responses.
    $returnData['fatalError'] = $message;
    return true;
}
