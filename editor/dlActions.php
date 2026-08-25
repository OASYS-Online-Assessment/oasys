<?Php

# -------------------------------------- #
# Inclusion of login authenticator class #
# -------------------------------------- #
require_once 'userMgmtActions.php';
$myAuth = new userAuth();

//data is a JSON encoded associative array that contains all the necessary data for the action to be performed
//(the array must be manually JSON encoded before sending to get past max_input_vars limitation)
$file2get = filter_input(INPUT_GET, 'fn');
$fileType = filter_input(INPUT_GET, 't');

# ---------------------------------------- #
# ELEVATED ADMIN/SUPERADMIN ACCESSOR CHECK #
# ---------------------------------------- #
if (!($myAuth->checkSA() === true || $myAuth->checkElevatedAdmin() === true)) {
    header('Location: index.php');
    // TODO: Log unauth'd download attempt
    exit;
}

$loginAuth = $myAuth->getAuthResult(true);

# ------------------------------------------ #
# Authentication handling (logged in status) #
# ------------------------------------------ #
if ($loginAuth !== true) {
    $returnData['error'] = ($loginAuth === false) ? "Please login to access this page." : "<br>" . $loginAuth;
    $returnData['forceLoginRedirect'] = true;
    $myAuth->writeLogEntry("ACCOUNT RESTRICTION: Attempted page load : [" . basename(__FILE__) . "] failed with reason: " . ($loginAuth === false ? "Not logged in." : $loginAuth));
    exit;
}

# ---------------------------------------------------------- #
# Validate inputted filename and type meets expected pattern #
# ---------------------------------------------------------- #

$fCheckRE = preg_match('/^oasys.*\.zip$/', $file2get);

if ($fCheckRE !== 1) {
    echo "Bad filename requested. Please contact the System Administrator.";
    $myAuth->writeLogEntry("BAD INPUT: Attempted invalid file download request with name: [$file2get] and result: [$fCheckRE]");
    exit;
}

$tcheckRE = ($fileType === 'bkpRes' || $fileType === 'bl') ? 1 : 0;

if ($tcheckRE !== 1) {
    echo "Bad file type requested. Please contact the System Administrator.";
    $myAuth->writeLogEntry("BAD INPUT: Attempted invalid file type request with name: [$fileType] and result: [$tcheckRE]");
    exit;
}

# ---------------------------------------------- #
# Set location vars based on file type requested #
# ---------------------------------------------- #
$pathStub = "_INVALID_";
switch ($fileType) {
    case 'bkpRes':
        $pathStub = DOCROOT . "backupRestore" . DIRECTORY_SEPARATOR;
        break;

    case 'bl':
        $pathStub = DOCROOT . "pkg_installer" . DIRECTORY_SEPARATOR . "downloads" . DIRECTORY_SEPARATOR;
        break;
}

// remove Php mem limit for big downloads!
ini_set('memory_limit', '-1');

# ------------------------- #
# Send the file via headers #
# ------------------------- #
$file2get = $pathStub . $file2get;

header('Content-Description: File Transfer');
header('Content-Type: application/zip');
header('Content-Disposition: attachment; filename="' . basename($file2get) . '"');
header('Expires: 0');
header('Cache-Control: must-revalidate');
header('Pragma: public');
header('Content-Length: ' . filesize($file2get));
readfile($file2get);
