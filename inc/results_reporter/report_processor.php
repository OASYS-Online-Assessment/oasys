<?Php

// Include classes
include_once('TBS/tbs_class.php'); // Load the TinyButStrong template engine
include_once('TBS/tbs_plugin_opentbs.php'); // Load the OpenTBS plugin 

// Initialize the TBS instance
$TBS = new clsTinyButStrong; // new instance of TBS
$TBS->Plugin(TBS_INSTALL, OPENTBS_PLUGIN); // load the OpenTBS plugin 

$TBS->ResetVarRef(false); // eliminate all globally pulled vars from use

# ---------------------------------- #
# Preconfigure Report Data Variables #
# ---------------------------------- #

if (in_array($fmt, ["openoffice", "excel"]) && isset($detail) && $detail === "total") {
    $legend = ['', 'login', 'tag', 'metainfo', 'lastActivity', 'total'];
} else {
    $legend = $returnData['csvHeaders']['legend']; // all horizontal legend keys
}

$headers = $returnData['csvHeaders']; // all vertical property keys
unset($headers['legend']); // remove legend from vertical property key set
$headers = array_values($headers); // reindex vertical headers keys
$loginsData = $returnData['csvRows']; // all logins data
$loginsData = array_values($loginsData); //reindex logins data keys
$testData = $returnData['testData'];
# ------------------------------------------------ #
# Template loading and basic Excel config settings #
# ------------------------------------------------ #

switch ($fmt) {
    case 'excel':
        if (isset($mode)) {
            $xlsFile = $mode === 'json' ? 't_excel_json.xlsx' : 't_excel.xlsx';
        } else {
            $xlsFile = 't_excel.xlsx';
        }
        $TBS->LoadTemplate('../inc/results_reporter/templates/' . $xlsFile, OPENTBS_ALREADY_UTF8);
        break;

    case 'openoffice':
        $TBS->LoadTemplate('../inc/results_reporter/templates/t_oo.ods', OPENTBS_ALREADY_UTF8);
        break;
}

$TBS->PlugIn(OPENTBS_SELECT_SHEET, 1);

# ---------------------------------------- #
# TBS template transform and merge routine #
# ---------------------------------------- #

/* legend merge call */
$TBS->MergeBlock('legend', 'array', $legend); // merge in legend data (first horizontal row)

/* headers merge call */
$TBS->MergeBlock('hc', 'num', count($legend) - 1); // merge in headers key iterator
$TBS->MergeBlock('headers', $headers); // merge in headers data (row headers + body of table)

/* logins merge call */
if (!empty($loginsData)) {
    $TBS->MergeBlock('lc', 'num', count($loginsData[0]) - 1); // merge in logins key iterator
    $TBS->MergeBlock('logins', $loginsData); // merge in logins data (remaining rows of login IDs)
} else {
    $TBS->MergeBlock('lc', []); // merge in logins key iterator
    $TBS->MergeBlock('logins', []); // merge in logins data (remaining rows of login IDs)
}

$TBS->Show(OPENTBS_STRING); // instead of generating a file, we generate the binary to send back through AJAX
$returnData['reportBinary'] = base64_encode($TBS->Source); // assign binary data to BASE64 encoded string for AJAX JSON return
