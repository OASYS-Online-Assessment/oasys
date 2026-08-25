<?Php

// if (php_sapi_name() == "cli") {
//     echo "\n\nThis script must be run from a web browser.\n\n\n";
//     exit(1);
// }

require_once __DIR__ . '/../../inc/php/settings.php';
$ssodata = parse_ini_file(__DIR__ . "/../../conf/ssodata.ini", true);

# --------------------------------- #
# Set all required vars for SP data #
# --------------------------------- #
$Issuer   = $ssodata['sp']['Issuer']    ?? '';
$IDPuidStr = $ssodata['idp']['IDPuidStr'] ?? '';
$SP_expiry = (new DateTime('now', new DateTimeZone('UTC')))->add(new DateInterval('P1D'))->format('Y-m-d\TH:i:s\Z'); // current UTC + 24 hours, per SAML standards

$ACS = $ssodata['sp']['ACS'] ?: "https://" . $_SERVER['SERVER_NAME'] . $settings['JSrootURL'] . "editor/sso.php";

if (!isset($Issuer) || !isset($ACS) || in_array("", [$Issuer, $ACS])) {
    http_response_code(500);
    header('Content-Type: text/plain');
    echo "Error: one or more SSO values are not configured. Exiting process.";
    exit;
}

$sp_template = <<<XML
<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
                     validUntil="$SP_expiry"
                     entityID="$Issuer">
    <md:SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
        <md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
                                Location="$ACS" />
        <md:NameIDFormat>urn:oasis:names:tc:SAML:2.0:nameid-format:transient</md:NameIDFormat>
        <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
                                     Location="$ACS"
                                     index="1" />
        <md:AttributeConsumingService index="1">
            <md:ServiceName xml:lang="en">Oasys Editor</md:ServiceName>
            <md:RequestedAttribute Name="$IDPuidStr" isRequired="true" />
        </md:AttributeConsumingService>
        
    </md:SPSSODescriptor>
</md:EntityDescriptor>
XML;

$sp_result_file = __DIR__ . '/sp_metadata.xml';
if (file_put_contents($sp_result_file, $sp_template) === false) {
    http_response_code(500);
    header('Content-Type: text/plain');
    echo "Error: could not write sp_metadata.xml";
    exit;
}

header('Content-Type: text/xml');
readfile($sp_result_file);
