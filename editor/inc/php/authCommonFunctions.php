<?Php

/* @phan-file-suppress PhanUndeclaredGlobalVariable, PhanUndeclaredVariableDim */

/*
    TITLE:      AUTHENTICATION COMMON INCLUDES FILE
    AUTHOR:     NILANJAN NAG
    DESC:       Contains operations and functions required for all pages being loaded requiring auth checks.
 */

# ---------------------------- #
# Preload authentication check #
# ---------------------------- #

require_once __DIR__."/../../userMgmtActions.php";
require_once __DIR__.'/../../inc/php/uiLang.php'; // required for translation inclusion

$myAuth = new userAuth();

/* special editor button removal routine for standard (non elevated) admins */
if (in_array("systemsettings", $settings['editorButtons']) === true && $myAuth->checkElevatedAdmin() === false && $myAuth->checkAdmin() === true) {
    unset($settings['editorButtons'][array_search("systemsettings", $settings['editorButtons'])]);
    $settings['editorButtons'] = array_values($settings['editorButtons']);
}

/* return admin level(s) (if any) */
$returnData['isSuper'] = $myAuth->checkSA();
$returnData['isAdmin'] = $myAuth->checkAdmin() || $myAuth->checkElevatedAdmin();

# ------------------- #
# Translation Include #
# ------------------- #
$uiLang = new uiLang($settings['interfaceLanguage']);

// if the auth constructor results in an error, we want to immediately exit and report said error
if ($myAuth->returnData['error'] !== false) {
    $myAuth->writeLogEntry("SYSTEM ERROR: " . $myAuth->returnData['error'] . " [" . basename(__FILE__) . "]");
    $myAuth->killSession("Unknown system error.", true);
    exit;
}

# ------------------------------ #
# Logged in Authentication Check #
# ------------------------------ #
$auth = $myAuth->getAuthResult(true);

if ($auth !== true) {
    $myAuth->writeLogEntry("ACCOUNT RESTRICTION: Attempted page load : [\"$pageName.php\"] failed with reason: " . ($auth !== true ? $auth : $auth));
    $myAuth->killSession($auth, true); //@phan-suppress-current-line PhanTypeMismatchArgument

    if ($isActionFile) {
        $returnData['error'] = $auth;
        $returnData['forceLoginRedirect'] = true;
    } elseif ($pageName === 'login') {
		$returnData['error'] = "previewAccessDenied";
		die();
	} else {
        echo "<script>alert(\"" . $uiLang->translate($auth) . "\"); window.location.replace('" . $settings['JSrootURL'] . "editor/index.php');</script>";
    }
    exit;
}

// superadmins can access everything
if ($myAuth->checkSA()) return;

# ---------------------- #
# Editor access checking #
# ---------------------- #

if ($pageName === 'pages') $pageName = 'content'; // 'pages' is a subsection of 'content', and 'content' is what we want to check editor permission on
$edtRes = (in_array($pageName, ['acctprop', 'dashboard', 'login'])) ? true : $myAuth->getEditorResult($pageName); // everyone has access to their own account profile page and dashboard
// if (isset($resultBypass) && $pageName === "tests" && $resultBypass === true) $edtRes = true; // bypass lockout in special condition when user has results page access but explicitly not tests editor

if ($edtRes !== true) {

    // Stop execution for non-superadmins attempting to hotlink
    $myAuth->writeLogEntry("ACCOUNT RESTRICTION: Attempted page load : [\"$pageName.php\"] failed with reason: Editor access not allowed.");
    // $myAuth->killSession("Editor Access Not Allowed", true); // Disabling forced logout on editor access failure for now
    if ($isActionFile) {
        $returnData['error'] = "<br>Editor access not allowed.";
        $returnData['forceLoginRedirect'] = true;
    } elseif ($pageName === 'login') {
		$returnData['error'] = "previewAccessDenied";
	} else {
        header("Location: {$settings['JSrootURL']}editor/index.php");
    }
    exit;
}

# ------------------------------------------------------------- #
# Conditional privileged module checking (admin/elevated admin) #
# ------------------------------------------------------------- #
switch ($pageName) {
    case 'users':
    case 'l10n':
    case 'backup':
    case 'upgrader':
        if (!$myAuth->checkAdmin()) {
            $returnData['error'] = "<br>You do not have sufficient privileges to access this area.";
            $returnData['forceLoginRedirect'] = true;
            $myAuth->writeLogEntry("ACCOUNT RESTRICTION: Attempted page load : [" . basename(__FILE__) . "] failed with reason: User not in 'superadmin' nor 'admin' group.");
            header('Location: index.php');
            exit;
        }

        break;

    case 'systemsettings':
        if (!$myAuth->checkElevatedAdmin()) {

            $returnData['error'] = "<br>You do not have sufficient privileges to access this area.";
            $returnData['forceLoginRedirect'] = true;
            $myAuth->writeLogEntry("ACCOUNT RESTRICTION: Attempted page load : [" . basename(__FILE__) . "] failed with reason: User not in 'superadmin' nor 'admin' group.");
            header('Location: index.php');
            exit;
        }
        break;

    default:
        break;
}
