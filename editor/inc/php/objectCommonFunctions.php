<?Php

if (!empty($data['location'])) {

    $location = $data['location'];

    function glFetchUsers(array $data, rixPDO &$db, &$returnData)
    {
        extract($data);

        $resUGlist = $db->fetchColumn("SELECT `name` FROM `users` WHERE `id` IN (SELECT `userId` FROM `userGroupAccess` WHERE `usergroupId` = ?)", [$groupId])['data'];
        $resGname = $db->fetchValue("SELECT `name` FROM `userGroups` WHERE `id` = ?", [$groupId])['data'];

        $returnData['ugUserList'] = $resUGlist;
        $returnData['groupName'] = $resGname;
    }

    function locExists(array $data, $location, object $tableName, rixPDO &$db, &$returnData)
    {
        global $uiLang;

        $locExists = $db->fetchValue("SELECT COUNT(*) FROM `{$tableName->primary}` WHERE `id`=?", [$location])['data'];

        if ($locExists === 0) {
            $returnData['error'] = $uiLang->translate("This folder has been deleted by another user. The view will be refreshed.");

            // If possible, check if parent folder exists; if that cannot be determined, go to home folder to avoid getting stuck in interminable error loop.
            if (isset($data['current']['path'])) {
                foreach (array_reverse($data['current']['path']) as $k => $path) {
                    $pathExists = $db->fetchValue("SELECT COUNT(*) FROM `{$tableName->primary}` WHERE `id` = ?", [$path['id']])['data'];

                    if ($pathExists === 0) continue;

                    $returnData['reloadFolder'] = true;
                    $returnData['openNewLocation'] = true;
                    $returnData['openNewLocationId'] = $path['id'];
                    exit;
                }
            } else {

                $origLoc = $db->fetchValue("SELECT COUNT(*) FROM `{$tableName->primary}` WHERE `id`=?", [$data['location']])['data'];
                if ($origLoc === 0) {
                    $returnData['reloadFolder'] = true;
                    $returnData['openNewLocation'] = true;
                    $returnData['openNewLocationId'] = 1;
                } else {
                    // special condition for move requests when the target folder is gone but source folder still exists
                    $returnData['reloadFolder'] = true;
                }

                die();
            }
        }
    }

    switch ($action) {
        case 'fetchLibrary':

            locExists($data, $location, $tableName, $db, $returnData);

            break;

        case 'deleteSelection':

            locExists($data, $location, $tableName, $db, $returnData);

            foreach ($data['selection'] as $key => $objId) {
                $tbl = ($objId['type'] === 'folder') ? $tableName->primary : $tableName->secondary;
                $countOfObj = $db->fetchValue("SELECT COUNT(*) FROM `{$tbl}` WHERE `id` = ?", [$objId['dbId']])['data'];

                if ($countOfObj === 0) {
                    $returnData['error'] = $uiLang->translate("One or more object(s) you are trying to delete have already been deleted or moved by another user. The view will be refreshed.");
                    $returnData['reloadFolder'] = true;
                    exit;
                }
            }

            break;

        case 'fetchTestResultOverview':
        case 'fetchTest':
        case 'fetchItemGroup':

            $query = "SELECT * FROM `{$tableName->secondary}` WHERE `id`=?";
            $parameters = array($data['id'] ?? $data['dbId'] ?? $data['selectedTest']);
            $results = $db->fetchRow($query, $parameters);

            //Show error message if selected object is not availabe anymore
            if ($results['rows'] === 0) {
                locExists($data, $location, $tableName, $db, $returnData);
                if ($tableName->secondary === 'tests') $returnData['error'] = $uiLang->translate("The test you are trying to select has been deleted by another user. The view will be refreshed.");
                if ($tableName->secondary === 'itemGroups') $returnData['error'] = $uiLang->translate("The page group you are trying to select has been deleted by another user. The view will be refreshed.");
                if ($tableName->secondary === 'logins') $returnData['error'] = $uiLang->translate("The test taker or template you are trying to select has been deleted by another user. The view will be refreshed.");
                $returnData['reloadFolder'] = true;
                die();
            }
            //Show error message if selected object has been moved to another folder
            if ($data['location'] !== false && $results['data']['parent'] !== $data['location']) {
                if ($tableName->secondary === 'tests') $returnData['error'] = $uiLang->translate("The test you are trying to select has been moved to a different folder by another user. The new location will be opened.");
                if ($tableName->secondary === 'itemGroups') $returnData['error'] = $uiLang->translate("The page group you are trying to select has been moved to a different folder by another user. The new location will be opened.");
                if ($tableName->secondary === 'logins') $returnData['error'] = $uiLang->translate("The test taker or template you are trying to select has been moved to a different folder by another user. The new location will be opened.");
                $returnData['reloadFolder'] = true;
                $returnData['openNewLocation'] = true;
                $returnData['openNewLocationId'] = $results['data']['parent'];
                die();
            }

            break;

        case 'newItemGroup': // used in content editor
        case 'newTest': // used in tests and test taker editors
        case 'newFolder': // used in all file based editors

            locExists($data, $location, $tableName, $db, $returnData);

            break;

        case 'moveObjects':
        case 'duplicateItemGroup':
        case 'duplicateObjects':
            locExists($data, $location, $tableName, $db, $returnData);
            locExists($data, $data['target'], $tableName, $db, $returnData);

            $fileIter = $data['sources']['files'] ?? $data['sources']['tests'];

            // file check
            if (isset($fileIter) && !empty($fileIter)) {
                foreach ($fileIter as $kFi => $fileId) {

                    $tmpSFQ = $db->fetchValue("SELECT `parent` FROM {$tableName->secondary} WHERE `id` = ?", [$fileId])['data'];
                    $sourceFldId = (empty($tmpSFQ)) ? $location : $tmpSFQ;

                    $countOfFile = $db->fetchValue("SELECT COUNT(*) FROM `{$tableName->secondary}` WHERE `id` = ? AND `parent` = ?", [intval($fileId), $sourceFldId])['data'];
                    if ($countOfFile === 0) {
                        $returnData['error'] = $uiLang->translate("One or more object(s) you are trying to access have been deleted or moved by another user. The view will be refreshed and this operation will be cancelled.");
                        $returnData['reloadFolder'] = true;
                        exit;
                    }
                }
            }

            // folder check
            if (isset($data['sources']['folders']) && !empty($data['sources']['folders'])) {
                foreach ($data['sources']['folders'] as $kFo => $folderId) {

                    $tmpSFQ = $db->fetchValue("SELECT `parent` FROM {$tableName->primary} WHERE `id` = ?", [$folderId])['data'];
                    $sourceFldId = (empty($tmpSFQ)) ? $location : $tmpSFQ;

                    $countOfFolder = $db->fetchValue("SELECT COUNT(*) FROM `{$tableName->primary}` WHERE `id` = ? AND `parent` = ?", [intval($folderId), $sourceFldId])['data'];
                    if ($countOfFolder === 0) {
                        $returnData['error'] = $uiLang->translate("One or more object(s) you are trying to access have been deleted or moved by another user. The view will be refreshed and this operation will be cancelled.");
                        $returnData['reloadFolder'] = true;
                        exit;
                    }
                }
            }

            break;

        case 'clipboardCheck': // check validity of objects on a clipboard operation

            locExists($data, $location, $tableName, $db, $returnData);

            foreach ($data['id'] as $kId => $vId) {

                // folder check
                if ($vId['type'] === 'folder') {
                    $countOfFolder = $db->fetchValue("SELECT COUNT(*) FROM `{$tableName->primary}` WHERE `id` = ? AND `parent` = ?", [intval($vId['dbId']), $location])['data'];
                    if ($countOfFolder === 0) {
                        $returnData['error'] = $uiLang->translate("One or more object(s) you are trying to access have been deleted or moved by another user. The view will be refreshed and this operation will be cancelled.");
                        $returnData['reloadFolder'] = true;
                        exit;
                    }
                }

                // file check
                if (in_array($vId['type'], ['testee', 'itemGroup', 'test'])) {
                    $countOfFolder = $db->fetchValue("SELECT COUNT(*) FROM `{$tableName->secondary}` WHERE `id` = ? and `parent` = ?", [intval($vId['dbId']), $location])['data'];
                    if ($countOfFolder === 0) {
                        $returnData['error'] = $uiLang->translate("One or more object(s) you are trying to access have been deleted or moved by another user. The view will be refreshed and this operation will be cancelled.");
                        $returnData['reloadFolder'] = true;
                        exit;
                    }
                }
            }

            exit; // this always 'exits' becuase there is no associated action -- this is purely a validation request being sent in

            break;

        case 'interactionCheck': // check validity of objects on any type of selection interaction, or drag n' drop attempt

            $xformData['current']['path'] = $data['locInfo']['path'];

            locExists($xformData, $location, $tableName, $db, $returnData);


            switch ($data['libType']) {

                case 'navigate':
                    $sentParent = end($data['locInfo']['path'])['id'];

                    $countOfFolder = $db->fetchValue("SELECT COUNT(*) FROM `{$tableName->primary}` WHERE `id` = ?", [intval($data['selInfo']['dbId'])])['data'];
                    if ($countOfFolder === 0) {
                        $returnData['error'] = $uiLang->translate("One or more folder(s) you are trying to access have been deleted by another user. The view will be refreshed and this operation will be cancelled.");
                        $returnData['reloadFolder'] = true;
                        exit;
                    }

                    // folder move check
                    $actualParent = $db->fetchValue("SELECT `parent` FROM `{$tableName->primary}` WHERE `id` = ?", [$data['selInfo']['dbId']])['data'];

                    if ($actualParent !== $sentParent) {
                        $returnData['error'] = $uiLang->translate("One or more folder(s) you are trying to access have been moved by another user. The view will be refreshed and this operation will be cancelled.");
                        $returnData['reloadFolder'] = true;
                        exit;
                    }


                    break;

                case 'selection': // check validity on any selection interaction, which includes right-clicking

                    foreach ($data['selInfo'] as $kId => $vId) {
                        $sentParent = end($data['locInfo']['path'])['id'];

                        // folder handling
                        if ($vId['type'] === 'folder') {

                            // folder delete check
                            $countOfFolder = $db->fetchValue("SELECT COUNT(*) FROM `{$tableName->primary}` WHERE `id` = ?", [intval($vId['dbId'])])['data'];
                            if ($countOfFolder === 0) {
                                $returnData['error'] = $uiLang->translate("One or more folder(s) you are trying to access have been deleted by another user. The view will be refreshed and this operation will be cancelled.");
                                $returnData['reloadFolder'] = true;
                                exit;
                            }

                            // folder move check
                            $actualParent = $db->fetchValue("SELECT `parent` FROM `{$tableName->primary}` WHERE `id` = ?", [$vId['dbId']])['data'];

                            if ($actualParent !== $sentParent) {
                                $returnData['error'] = $uiLang->translate("One or more folder(s) you are trying to access have been moved by another user. The view will be refreshed and this operation will be cancelled.");
                                $returnData['reloadFolder'] = true;
                                exit;
                            }
                        } else {

                            // file delete check
                            $countOfFile = $db->fetchValue("SELECT COUNT(*) FROM `{$tableName->secondary}` WHERE `id` = ?", [intval($vId['dbId'])])['data'];
                            if ($countOfFile === 0) {
                                $returnData['error'] = $uiLang->translate("One or more file(s) you are trying to access have been deleted by another user. The view will be refreshed and this operation will be cancelled.");
                                $returnData['reloadFolder'] = true;
                                exit;
                            }

                            // file move check
                            $actualParent = $db->fetchValue("SELECT `parent` FROM `{$tableName->secondary}` WHERE `id` = ?", [$vId['dbId']])['data'];

                            if ($actualParent !== $sentParent) {
                                $returnData['error'] = $uiLang->translate("One or more file(s) you are trying to access have been moved by another user. The view will be refreshed and this operation will be cancelled.");
                                $returnData['reloadFolder'] = true;
                                exit;
                            }
                        }
                    }

                    break;

                case 'move': // check validity on any move attempt via drag n' drop, or keyboard opeartion

                    foreach ($data['selInfo'] as $sKey0 => $sVal0) {
                        foreach ($sVal0['sources'] as $sKey => $sVal) {

                            if ($sVal['type'] === 'folder') {

                                // folder drag n' drop, cut/copy/paste source check
                                $sentParent = intVal(ltrim($sVal['pid'], "f"));
                                $actualParent = intVal($db->fetchValue("SELECT `parent` FROM `{$tableName->primary}` WHERE `id` = ?", [$sVal['dbId']])['data']);

                                if ($actualParent === 0) {
                                    $returnData['error'] = $uiLang->translate("One or more objects(s) you are trying to move have already been deleted by another user. The view will be refreshed and this operation will be cancelled.");
                                    $returnData['reloadFolder'] = true;
                                    exit;
                                }

                                if ($sentParent !== $actualParent) {
                                    $returnData['error'] = $uiLang->translate("One or more objects(s) you are trying to move have already been moved by another user. The view will be refreshed and this operation will be cancelled.");
                                    $returnData['reloadFolder'] = true;
                                    exit;
                                }
                            } else {
                                // file drag n' drop, cut/copy/paste source check
                                $sentParent = intVal(ltrim($sVal['pid'], "f"));
                                $actualParent = intVal($db->fetchValue("SELECT `parent` FROM `{$tableName->secondary}` WHERE `id` = ?", [$sVal['dbId']])['data']);

                                if ($actualParent === 0) {
                                    $returnData['error'] = $uiLang->translate("One or more objects(s) you are trying to move have already been deleted by another user. The view will be refreshed and this operation will be cancelled.");
                                    $returnData['reloadFolder'] = true;
                                    exit;
                                }

                                if ($sentParent !== $actualParent) {
                                    $returnData['error'] = $uiLang->translate("One or more objects(s) you are trying to move have already been moved by another user. The view will be refreshed and this operation will be cancelled.");
                                    $returnData['reloadFolder'] = true;
                                    exit;
                                }
                            }
                        }
                    }


                    break;

                default:

                    break;
            }



            exit; // this always 'exits' becuase there is no associated action -- this is purely a validation request being sent in

            break;

        default:

            break;
    }
}
