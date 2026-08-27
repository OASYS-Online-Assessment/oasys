<?php

require_once __DIR__ . '/../inc/php/actionDispatcher.php';

oasysRegisterActionAllowlists([
    'pkg_installer/instmainActions.php' => [
        'setVer',
        'resetPkg',
        'resetAllPkg',
    ],
]);
