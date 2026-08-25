<?php

require_once __DIR__ . '/../../../inc/php/actionDispatcher.php';

// Actions exposed by the standard OASYS backend and its dashboard widgets.
oasysRegisterActionAllowlists([
    'editor/accountPropActions.php' => [
        'updateUserSettings', 'check', 'langChange', 'pwdChange', 'emailChange',
    ],
    'editor/activityTrackerActions.php' => [
        'reopenTest', 'closeTest', 'addTime', 'resetActivity',
        'fetchJourneySelection', 'fetchJourneyDetail',
    ],
    'editor/backupActions.php' => [
        'getFile', 'checkActive', 'restoreSnapshot', 'deleteBackup', 'fetchBackups',
        'backupBegin',
    ],
    'editor/dashboardActions.php' => [
        'check',
    ],
    'editor/itemActions.php' => [
        'fetchLibrary', 'fetchPreSelect', 'fetchItemGroup', 'fetchExistingPageGroups',
        'fetchExistingPageGroupPages', 'preparePageGroupExport', 'stagePageGroupPackage',
        'importStagedPageGroupPackage', 'importExistingPages', 'fetchItem', 'newFolder',
        'newItemGroup', 'checkItemGroup', 'checkItem', 'newItem', 'updateWatchList',
        'renameGroupOrFolder', 'renameItem', 'duplicateItemGroup', 'duplicateItem',
        'moveObjects', 'deleteSelection', 'deleteItem', 'removeLinks', 'saveItemGroup',
        'saveItem', 'search', 'fetchMetaTagSuggestions', 'metaSearch', 'lockItem',
        'errorLog', 'updatePerm', 'fetchIgPerm', 'glFetchUsers',
    ],
    'editor/l10nActions.php' => [
        'fetchContextAreas', 'loadLanguages', 'saveNewLang', 'editLang', 'deleteLang',
        'fetchLocStrings', 'saveLocChanges', 'reset2Defaults', 'search',
    ],
    'editor/mediaActions.php' => [
        'fetchLibrary', 'fetchLibraryTm', 'upload', 'uploadTm', 'preview', 'previewTm',
        'deleteSelection', 'deleteSelectionTm', 'deleteAll', 'deleteAllTm',
        'renameMedia', 'renameMediaTm',
    ],
    'editor/pagesActions.php' => [
        'keepSessionAlive', 'fetchPage', 'fetchPageBlocks', 'savePage', 'removeLinks',
    ],
    'editor/resultsActions.php' => [
        'fetchReportData', 'fetchTestJourneySummary', 'fetchTestJourneyDetail', 'report_export',
        'fetchTestSubmissionSummary', 'fetchTestSummaryData', 'fetchQAListDetail', 'getTL',
		'fetchQADetail', 'scoringAddComment', 'scoringRemComment', 'setScore',
		'resetAllCorrections', 'closeOutTest', 'refreshManualScoringLease', 'releaseManualScoringLease',
		'hasMSleft', 'fetchLibrary', 'fetchPreSelect',
        'fetchTestResultOverview', 'search', 'updateWatchList', 'fetchTestResults',
        'fetchBehaviourTiming', 'fetchDetailedTestScore', 'chartStorePrecheck',
        'chartStore', 'getChartList', 'loadChart', 'setChartVisibility', 'delChart', 'updatePerm', 'fetchIgPerm',
    ],
    'editor/systemSettingActions.php' => [
        'm_status', 'change_m_status', 'file_cleanup', 'filesyscheck', 'syscheck',
        'fetchSettings', 'export_settings_values', 'saveSetting', 'resetSetting',
        'import_settings', 'encryptionRotationStatus', 'rotateManagedEncryptionKey',
        'prepareEnvironmentEncryptionKey', 'verifyEnvironmentEncryptionKey',
        'rotateEnvironmentEncryptedData', 'finalizeEnvironmentEncryptionKey',
    ],
    'editor/testActions.php' => [
        'fetchLibrary', 'fetchPreSelect', 'fetchItemLibrary', 'checkTest', 'newFolder',
        'newTest', 'fetchTest', 'fetchPoolData', 'updateWatchList', 'fetchTestsAssigned',
        'newMetaTag', 'testsSearch', 'fetchTestLibraryInt', 'fetchTestLibrary',
        'saveMetaTagsChange', 'fetchMetaTagSuggestions', 'metaSearch', 'search', 'igSearch',
        'deleteSelection', 'resetResults', 'moveObjects', 'duplicateObjects', 'saveTestFolder',
        'fetchItemsStimuli', 'renameTestOrFolder', 'saveFluidPoolOrder', 'saveFluidPageUsage',
        'saveTest', 'clearTestStructure', 'normalizeMetaUploads', 'saveTestBulk',
        'fetchLinearStructureTemplates', 'importLinearStructureFromTemplate',
        'fetchFluidTestpoolTemplates', 'importFluidTestpoolsFromTemplate',
        'fetchMutationStructureTemplates', 'importMutationStructureFromTemplate',
        'fetchEditorEntryTemplates', 'importEditorEntries', 'fetchPrivacyTemplates',
        'fetchScoreTemplates', 'fetchLandingTemplates', 'fetchFinishTemplates',
        'saveSkinAssignment', 'saveNewFluidBlock', 'updateFluidBlocks', 'createLabel',
        'saveLabel', 'updateLabels', 'setDefaultLabel', 'plausibilityFluidCheck',
        'plausibilityCheck', 'quickFluidCheck', 'quickCheck', 'newTestpool', 'editTestpool',
        'deleteTestpool', 'saveTestpoolAssignment', 'fetchTestResultOverview',
        'fetchTestResults', 'fetchBehaviourTiming', 'fetchDetailedTestScore', 'saveLocChanges',
        'createNewVariable', 'deleteVariable', 'fetchLinearTestStructure', 'updatePerm',
        'fetchIgPerm', 'glFetchUsers',
    ],
    'editor/testTakersActions.php' => [
        'checkForwardUrl', 'fetchLibrary', 'fetchPreSelect', 'fetchTestLibrary', 'newFolder',
        'newTest', 'newPassword', 'newLabel', 'newQuickPassword', 'deletePassword',
        'checkTestee', 'editPassword', 'editLabel', 'setPassword', 'updateWatchList',
        'saveTestAssignmentsLibrary', 'saveMetaTagsChange', 'resetResultsTestee',
        'resetResultsPassword', 'resetResultsTest', 'newMetaTag', 'editDisplayName',
        'changeLoginType', 'editDirPass', 'saveOverrides', 'addToSelected', 'bulkModifyExisting', 'exportCSV',
        'wizardCreate', 'wizardCreateFromFile', 'fetchTestsAssigned', 'fetchTest', 'search',
        'fetchMetaTagSuggestions', 'metaSearch', 'testsSearch', 'deleteSelection',
        'deleteTemplateClone', 'moveObjects', 'duplicateObjects', 'fetchTestStructure',
        'renameTestOrFolder', 'plausibilityCheck', 'checkPath', 'checkExisting',
        'updatePerm', 'fetchIgPerm', 'glFetchUsers',
    ],
    'editor/upgraderActions.php' => [
        'ofChk', 'getFileDlInstall', 'preInstallBackup', 'getFileDl', 'requestPackageList',
        'chkInstStatus', 'checkInstStatus', 'checkActiveStates', 'logoff', 'clearDlTemp',
        'writeLogWrapper', 'logDl',
    ],
    'editor/userActions.php' => [
        'searchManager', 'startConstCheck', 'fetchImportUserGroups', 'importUsers',
        'updateGroupSettings', 'fetchGroupSettings', 'fetchPerms', 'updatePerms',
        'getGroupOnlyList', 'groupPermView', 'logView', 'logMaint', 'getLangStats',
        'fetchUsergroups', 'renameGroup', 'addGroup', 'addUser', 'deleteGroup',
        'deleteUser', 'updateOwnerPostDel', 'fetchUsers', 'passReset',
    ],

    // Dashboard widgets
    'editor/dashboard/activenow/activenow.php' => ['listActive', 'fetchUsers'],
    'editor/dashboard/lastedited/lastedited.php' => ['listEdited'],
    'editor/dashboard/localization/localization.php' => [
        'readOverview', 'inspectLanguage', 'inspectModified',
    ],
    'editor/dashboard/logviewer/logviewer.php' => [
        'readLogs', 'readLogFile', 'downloadLogFile', 'clearLogFile',
    ],
    'editor/dashboard/systemstatus/systemstatus.php' => [
        'readOverview', 'listFrontEndOnline', 'readSettings', 'listBackEndOnline',
        'showVersionDetails', 'showStorageDetails', 'showBackupDetails',
        'syscheckDetails', 'showDbDetails',
    ],
    'editor/dashboard/testresults/testresults.php' => ['listResults', 'fetchStats'],
    'editor/dashboard/userwidget/userwidget.php' => [
        'readOverview', 'listUsers', 'listGroups', 'listBlocked', 'listBadLogins',
        'listHomeAccess', 'listNoEmail',
    ],
    'editor/dashboard/watchlist/watchlist.php' => [
        'getContent', 'getTests', 'getTesttakers', 'unWatch',
    ],
]);
