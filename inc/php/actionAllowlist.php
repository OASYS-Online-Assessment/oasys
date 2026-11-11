<?php

require_once __DIR__ . '/actionDispatcher.php';

// Actions exposed by the OASYS test-taker frontend.
oasysRegisterActionAllowlists([
    'loader.php' => [
        'load',
        'loadMediaFiles',
    ],
    'login.php' => [
        'login',
        'preview',
		'restoreStudentLogin',
		'verifyStateCookie',
    ],
    'score.php' => [
        'fetchScore',
    ],
    'finish.php' => [
        'fetchFinishScreen',
    ],
    'ttDashboardActions.php' => [
        'fetchStudentLoginTests',
    ],
]);
