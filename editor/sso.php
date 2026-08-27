<?Php

# -------------------------------------- #
# REQUIRED INCLUDES FOR CLASS OPERATIONS #
# -------------------------------------- #

require_once __DIR__ . '/inc/php/initBackend.php';
require_once __DIR__ . "/inc/php/userAuth.php";
// require_once __DIR__ . "/../inc/php/OasysSettings.php";

use Oasys\BackEnd\OasysBackendState;

# -------------------- #
# START SSOLOGIN CLASS #
# -------------------- #

/**
 * Login via SSO...
 */
class SSOLogin
{
	protected string $loginRelayValue = "oali"; // overridable base class login relay value
	protected string $logoutRelayValue = "oalo"; // overridable base class logout relay value
	protected string $logoutRelayValue_err = "oalo_e"; // overridable base class logout error relay value
	protected string $logoutLocation = "index.php?lcode=ssolo"; // standard logout location and optional code for frontend display (used in a `header('Location: ?', true, 303)` call)
	protected string $logoutLocation_err = "index.php?ecode="; // logout location for no user found / error / disabled acct scenario (used in a `header('Location: ?', true, 303)` call)
	protected string $logoutLocation_err_code = ""; // this value is set in the code if there is a specific error we set here (SP) that needs transmission to login page
	private ?string $ID = null;
	private ?string $InResponseTo = null;
	private ?string $IssueInstant = null;
	protected ?string $SAMLusername = null;
	private ?string $NIvalue = null;
	private ?string $SIvalue = null;
	private ?string $Issuer = null;
	private ?string $AS_Issuer = null;
	private ?string $AS_login_status = null;
	private ?string $AS_notBefore = null;
	private ?string $AS_notOnOrAfter = null;
	private ?string $AS_audience = null;
	private DOMXPath $xpath;
	private DOMDocument $xmlDoc;
	private userAuth $myAuth;
	protected ?OasysBackendState $backendState = null;
	private const SSO_CONF_FILE = "/../conf/ssodata.ini";
	private const DEBUG_MODE = false; // set to true to enable detailed tracing data of SAML process flow into `editor/temp_saml_debug.out`

	/**
	 * Handle the routing of which operations
	 * to perform based on checking for various $_GET
	 * or $_REQUEST parameters (login/logout/assertion validation).
	 *
	 * @return void
	 */
	public function __construct()
	{
		global $settings;

		if ($settings['SSOSysActive'] !== true) {
			$this->errorBailAll();
		}

		# ----------------------------------------------------------------- #
		# Instantiate our backend state handler for required SSO operations #
		# ----------------------------------------------------------------- #

		try {
			$this->backendState = OasysBackendState::getInstance();
		} catch (\Throwable $e) {
			error_log('SSO backend state initialization failed: ' . $e->getMessage());
			$this->errorBailAll();
		}

		# -------------------------------------- #
		# Explicit login/logout request handling #
		# -------------------------------------- #
		if (isset($_REQUEST['a'])) {
			if ($_REQUEST['a'] === "logout") $this->logoutProcess();
			if ($_REQUEST['a'] === "login") $this->loginProcess();
			return;
		}

		# -------------------------- #
		# IdP SAML response handling #
		# -------------------------- #

		if (isset($_REQUEST['SAMLResponse'])) {
			$SAMLResponse = $_REQUEST['SAMLResponse'];
			$SAMLXMLdata = base64_decode($SAMLResponse);

			/* 
				The RelayState value coming in from the IdP was originated by us, the SP, when we
				sent out the original login or logout request payloads.
			*/

			switch ($_REQUEST['RelayState']) {
				case $this->loginRelayValue: // SSO/Oasys login SAML payload return

					$this->validateXML($SAMLXMLdata);
					$this->InboundLoginSAMLProcess($SAMLXMLdata);
					break;

				case $this->logoutRelayValue: // SSO/Oasys logout SAML payload return
					$this->logoutDataValidate($SAMLXMLdata);

					# final removal of State Cookie for extra security (note that userauth status in any case should be 'logged out' at this point) #
					$this->backendState->eraseState();

					# we just redirect back to standard login screen when logged out #
					header("Location: {$this->logoutLocation}", true, 303);
					break;

				case $this->logoutRelayValue_err: // SSO/Oasys logout routine when no user found in oasys, or an ID mismatch error, late login, disabled acct, etc.

					$err_code = $this->backendState->SSO_LO_ECODE;

					# final removal of State Cookie for extra security (note that userauth status in any case should be 'logged out' at this point) #
					$this->backendState->eraseState();

					# final redirect back to login screen with specific logout message for SSO sessions #
					header("Location: {$this->logoutLocation_err}" . $err_code, true);

					break;

				default: // When SAML response is unable to be parsed/processed (no valid 'RelayState' value)
					echo "Unable to process SAML data.";
					break;
			}
		} else {
			$this->errorBailAll();
		}
	}

	/**
	 * Verify that the returned IdP logout SAML assertions
	 * match that of what we expect for the Oasys session
	 * we are attempting to log out.
	 *
	 * @param string $lo_data Gzdeflate-compressed SAML logout response data received from the IdP
	 * 
	 * @return void
	 * 
	 */
	private function logoutDataValidate(string $lo_data): void
	{
		$loXML = gzinflate($lo_data);
		$xmlObj = $this->validateXML($loXML);

		if ((string) $xmlObj['InResponseTo'][0] !== $this->backendState->SSO_LO_ID) $this->errorBailAll(); // validate logout ID doesn't match logout assertion ID
	}

	/**
	 * Simple verification that data is valid XML.  
	 * Bail on code stack if not valid XML.
	 *
	 * @param string $str XML data in string format.
	 * 
	 * @return SimpleXMLElement
	 * 
	 */
	private function validateXML(string $str): SimpleXMLElement
	{
		$res = simplexml_load_string($str);
		if ($res === false) {
			$this->errorBailAll();
		}

		return $res;
	}

	/**
	 * Head method of logout routine.
	 * 
	 * If a logout procedure is not successful, the  
	 * code stack will exit with a 'bail' call, and  
	 * a processing error message will be displayed  
	 * to the end user.  
	 * 
	 * This routine is called either from an explicit  
	 * logout request from Oasys, or when an authentication  
	 * error is detected.
	 *
	 * @return void
	 * 
	 */
	private function logoutProcess(): void
	{
		# pull in IdP-specific data variables #
		$sso_static_vars = parse_ini_file(__DIR__ . self::SSO_CONF_FILE);
		extract($sso_static_vars);

		# build the required fields for logout request #
		$this->buildLogoutVars($Issuer);

		# build the logout XML template #
		$lot = $this->buildLogoutTemplate();

		# encode (deflate/base64/urlencode) the logout outbound XML #
		$outboundEncoded = $this->buildOutboundEncodings($lot);

		# determine type of logout relay code to set #
		$rs_str = $this->logoutAuthRelayVal();

		$outboundString = $this->buildFinalOutboundString($outboundEncoded, $rs_str, $SSOLogoutURL);

		# send final logout XML to IdP #
		$this->sendToIdP($outboundString);
	}

	/**
	 * Returns the **RelayState** URL component to use on logouts,  
	 * and is specifically used to craft the type of logout message  
	 * (if any) is displayed to the frontend user.
	 * 
	 * When the logout is 'normal', it returns the value defined  
	 * in `$this->logoutRelayValue`, however if this method is being  
	 * called as a part of the auto-logout performed when a username  
	 * is authenticated on the IdP, but not found in Oasys, the  
	 * alternate value found in `$this->logoutRelayValue_err` is sent  
	 * back for proper case handling in these scenarios.
	 * 
	 * This method must be overridden for any derived class so that  
	 * the specific authentication mechanism is used to determine  
	 * which type of logout RelayState string is used, which in turn  
	 * dictates the type of logout behavior to use.
	 * 
	 * @return string
	 */
	protected function logoutAuthRelayVal(): string
	{
		if (isset($this->myAuth)) {
			return ($this->myAuth->authResult !== true) ? $this->logoutRelayValue_err : $this->logoutRelayValue;
		} elseif ($this->logoutLocation_err_code !== "") {
			return $this->logoutRelayValue_err;
		} else {
			return $this->logoutRelayValue;
		}
	}

	/**
	 * Assembles the required variable data into a preformatted  
	 * XML template to build proper logout request to send to  
	 * the IdP.
	 *
	 * @return string
	 * 
	 */
	private function buildLogoutTemplate(): string
	{
		global $settings;

		$lo_template = <<<XML
		<samlp:LogoutRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
							xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
							ID="$this->ID"
							Version="2.0"
							IssueInstant="$this->IssueInstant"
							Destination="https://master.oasys.lu/simplesaml/module.php/saml/idp/singleLogout"
							>
			<saml:Issuer>$this->Issuer</saml:Issuer>
			<saml:NameID SPNameQualifier="$this->Issuer" Format="urn:oasis:names:tc:SAML:2.0:nameid-format:transient">$this->NIvalue</saml:NameID>
			<samlp:SessionIndex>$this->SIvalue</samlp:SessionIndex>
		</samlp:LogoutRequest>
		XML;

		$this->backendState->SSO_LO_ID = $this->ID;

		return $lo_template;
	}

	/**
	 * Pull and build the logout variables which are  
	 * later used in template building and validation  
	 * cross-checks against IdP data.
	 *
	 * @param string $Issuer The SP issuer identifier, loaded from ssodata.ini
	 * 
	 * @return void
	 * 
	 */
	private function buildLogoutVars($Issuer): void
	{
		$this->Issuer = $Issuer;
		$this->ID = bin2hex(random_bytes(64));
		$this->IssueInstant = gmdate("Y-m-d\TH:i:s\Z");
		if (!isset($this->backendState->AS_NI) || !isset($this->backendState->AS_SI)) $this->errorBailAll();
		$this->NIvalue = $this->backendState->AS_NI;
		$this->SIvalue = $this->backendState->AS_SI;
	}

	/**
	 * The head of the login procedure which will call  
	 * all required methods for building login data,  
	 * packaging outbound data, and building session  
	 * variables which are used later in login/logout  
	 * procedures.
	 *
	 * @return void
	 * 
	 */
	protected function loginProcess(): void
	{

		# verify ssodata configuration file exists #
		if (!file_exists(__DIR__ . self::SSO_CONF_FILE)) {
			$this->errorBailAll();
		}

		# pull in IdP-specific data variables #
		$sso_static_vars = parse_ini_file(__DIR__ . self::SSO_CONF_FILE);
		extract($sso_static_vars);
		global $settings;
		$ACS = "https://" . $_SERVER['SERVER_NAME'] . $settings['JSrootURL'] . "editor/sso.php";

		# build outbound XML template #
		$xmlOutbound = $this->buildOutboundSAMLXML($SSOLoginURL, $ACS, $Issuer);

		# do deflate & encoding ops #
		$SAMLoutbound = $this->buildOutboundEncodings($xmlOutbound);

		# final string compositing #
		$finalOutboundLink = $this->buildFinalOutboundString($SAMLoutbound, $this->loginRelayValue, $SSOLoginURL);

		# send build string to IdP #
		$this->sendToIdP($finalOutboundLink);
	}

	/**
	 * Redirect the browser to the IdP via a 303 HTTP redirect,  
	 * delivering the packaged SAML payload as a URL query string.
	 *
	 * @param string $IdP_payload The fully assembled IdP redirect URL including the encoded SAMLRequest
	 * 
	 * @return void
	 * 
	 */
	private function sendToIdP(string $IdP_payload): void
	{
		// Clean any output buffers
		while (ob_get_level()) {
			ob_end_clean();
		}

		// Ensure state is closed before redirect
		// $this->state->wc_state(); // OasysBackendState doesn't have a close method, session handles it in __destruct or implicitly

		// Send headers only if not already sent
		if (!headers_sent()) {
			header_remove('Content-Type');
			header_remove('X-Powered-By');
			header('Pragma: no-cache', true);
			header('Cache-Control: no-cache, no-store, must-revalidate', true);
			header('Location: ' . $IdP_payload, true, 303);
			header('Connection: close', true);
			header('Content-Length: 0', true);
		}
	}

	/**
	 * Assemble the final outbound URL string in the required format  
	 * for SAML transmissions.
	 *
	 * @param string $str The encoded SAMLRequest value to embed as a query parameter
	 * @param string $RelayVal The RelayState value
	 * @param string $SSOLoginURL The preconfigured SSO endpoint URL from ssodata.ini (used for both login and logout)
	 * 
	 * @return string The final assembled URL string
	 * 
	 */
	private function buildFinalOutboundString(string $str, string $RelayVal, string $SSOLoginURL): string
	{
		$str = $str . "&RelayState={$RelayVal}"; // append relay value
		$str = "SAMLRequest=" . $str; // prepend required SAML request POST parameter
		$str = $SSOLoginURL . "?" . $str;
		return $str;
	}

	/**
	 * Packaging and encoding for outbound SAML request string.  
	 * It is required to deflate, base64 encode, and urlencode  
	 * the XML component.
	 *
	 * @param string $str Unprocessed inbound string to package
	 * 
	 * @return string Post-processed string to return for delivery
	 * 
	 */
	private function buildOutboundEncodings(string $str): string
	{
		$str = gzdeflate($str);
		$str = base64_encode($str);
		$str = urlencode($str);
		return $str;
	}

	/**
	 * Assembly of the outbound SAML XML data with variable inserts.
	 *
	 * @param string $SSOLoginURL The IdP SSO login endpoint URL
	 * @param string $ACS The Assertion Consumer Service URL (the SP callback endpoint)
	 * @param string $Issuer The SP issuer identifier, loaded from ssodata.ini
	 * 
	 * @return string
	 * 
	 */
	private function buildOutboundSAMLXML(string $SSOLoginURL, string $ACS, string $Issuer): string
	{
		$this->backendState->SSO_OUTBOUND_ID = $this->ID = bin2hex(random_bytes(64)); // used in IdP assertion validation
		$this->backendState->SSO_ISSUE_INSTANT = $this->IssueInstant = gmdate("Y-m-d\TH:i:s\Z"); // used in IdP assertion validation

		$outbound_XML_template = <<<XML
		<?xml version="1.0" encoding="UTF-8"?>
		<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="$this->ID" Version="2.0" IssueInstant="$this->IssueInstant" Destination="$SSOLoginURL" AssertionConsumerServiceURL="$ACS" ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
		<saml:Issuer>$Issuer</saml:Issuer>
		<samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:2.0:nameid-format:transient" AllowCreate="true" />
		</samlp:AuthnRequest>
		XML;

		return $outbound_XML_template;
	}

	/**
	 * Head of processing the inbound login request result from the IdP.
	 * 
	 * Assertions and structure are all validated against what we know to have  
	 * sent out in our original login request. Any assertion failures detected  
	 * from this head handler method will bail the code stack.
	 *
	 * @param string $SAMLresponse The raw decoded SAML XML response string received from the IdP
	 * 
	 * @return void
	 * 
	 */
	private function InboundLoginSAMLProcess(string $SAMLresponse): void
	{
		$sso_static_vars = parse_ini_file(__DIR__ . self::SSO_CONF_FILE);
		extract($sso_static_vars);

		$this->xmlObjBuilder($SAMLresponse);
		$sigVerfResult = $this->XMLsigVerf($IDPuidStr);
		if ($sigVerfResult !== true) {
			$this->errorBailAll();
		}
		$this->LoginBuildSessionData();
		$this->validateIDPAssertions();
		$this->LoginToOasys(true);
	}

	/**
	 * Full cross-checking of returned IdP assertions against  
	 * our own known data values. This method will do a mix of  
	 * data validation against session variables, and also data  
	 * from our SSOData configuration file. Method will  
	 * short-circuit 'bail' upon any inconsistencies.
	 *
	 * @return void
	 */
	private function validateIDPAssertions(): void
	{
		$sso_static_vars = parse_ini_file(__DIR__ . self::SSO_CONF_FILE);
		extract($sso_static_vars);

		$pass = true;
		$failReason = [];

		// $this->debugLog("Starting IDP assertion validation.");

		if (($this->backendState->SSO_OUTBOUND_ID) !== $this->InResponseTo) {
			$pass = false;
			$expectedOutboundId = $this->backendState->SSO_OUTBOUND_ID ?? 'NULL';
			$recssoid = $this->InResponseTo ?? 'NULL';
			$failReason[] = "[OASYS SSO DEBUG] OUTBOUND_ID mismatch. DEBUG DATA: " . "EXPECTED SSO ID={$expectedOutboundId} | RECEIVED SSO ID={$recssoid}";
		}

		# check the allowed time before/after values assertions sent by IdP to mitigate replay attacks #
		$ourIssueTime = time(); // current time at moment of response processing (SAML 2.0 spec §2.5.1)
		$notBefore = strtotime($this->AS_notBefore);
		$not_on_or_after = strtotime($this->AS_notOnOrAfter);

		if ((($ourIssueTime >= $notBefore) && ($ourIssueTime < $not_on_or_after)) !== true) {
			$pass = false;
			$failReason[] = "[OASYS SSO DEBUG] Timing validation failed. DEBUG DATA: " . "OUR_ISSUE_TIME={$ourIssueTime} | NOT_BEFORE={$notBefore} | NOT_ON_OR_AFTER={$not_on_or_after}";
			$this->backendState->SSO_LO_ECODE = $this->logoutLocation_err_code = "oaTO";
		}

		if ($Issuer !== $this->AS_audience) {
			$pass = false;
			$failReason[] = "[OASYS SSO DEBUG] Issuer/Audience mismatch. DEBUG DATA: EXPECTED ISSUER/AUDIENCE={$Issuer} | ASSERTION AUDIENCE={$this->AS_audience}";
		}

		// Relaxed referer check - handle trailing slashes and case differences
		$expectedReferer = rtrim($IDPhost, '/');
		$actualReferer = isset($_SERVER['HTTP_REFERER']) ? rtrim($_SERVER['HTTP_REFERER'], '/') : '';
		if (stripos($actualReferer, $expectedReferer) === false) {
			$pass = false;
			$failReason[] = "[OASYS SSO DEBUG] Referer check failed: DEBUG DATA: EXPECTED REFERER={$expectedReferer}, RECEIVED REFERER={$actualReferer}";
		}

		if (!$this->backendState::browserHasActiveState()) {
			$pass = false;
			$failReason[] = "[OASYS SSO DEBUG] Session state check failed.";
		}

		if ($this->AS_Issuer !== $IDPIssuerId) {
			$pass = false;
			$failReason[] = "[OASYS SSO DEBUG] IDP Issuer mismatch. DEBUG DATA: EXPECTED_IDP_ISSUER={$IDPIssuerId} | RECEIVED_IDP_ISSUER={$this->AS_Issuer}";
		}

		if ($this->AS_login_status !== "urn:oasis:names:tc:SAML:2.0:status:Success") {
			$pass = false;
			$failReason[] = "[OASYS SSO DEBUG] Login status not Successful. DEBUG DATA: EXPECTED_LOGIN_STATUS=urn:oasis:names:tc:SAML:2.0:status:Success | RECEIVED_LOGIN_STATUS={$this->AS_login_status}";
		}

		if ($pass !== true) {
			error_log("IDP ASSERTION FAILURE STACK: " . implode("\n", $failReason));
			$this->backendState->FE_SSO_AUTH = false;

			// Proactively end the IdP session so the next attempt requires credentials (only if required vars are present for logout)
			if (isset($this->backendState->AS_NI, $this->backendState->AS_SI)) {
				$this->logoutProcess();
			}
			exit;
		}
	}

	/**
	 * Initialises the class-wide DOMDocument and DOMXPath properties used for all subsequent XML operations.
	 *
	 * @param string $xmlData The raw SAML XML string to load into the DOM
	 * @return void
	 */
	private function xmlObjBuilder(string $xmlData): void
	{
		$this->xmlDoc = new DOMDocument();
		$this->xmlDoc->loadXML($xmlData);

		$this->xpath = new DOMXPath($this->xmlDoc);
	}

	/**
	 * Build out all the necessary session and class  
	 * property values for cross-checking and validation  
	 * of assertions further down in the code stack.
	 *
	 * @return void
	 * 
	 */
	private function LoginBuildSessionData(): void
	{
		try {
			# parse and save all required xml data for future use (logout, validation, etc.)  #
			$this->xpath->registerNamespace("s_assert", "urn:oasis:names:tc:SAML:2.0:assertion");
			$niNode = $this->xpath->query("//s_assert:Assertion/s_assert:Subject/s_assert:NameID")->item(0);
			$siNode = $this->xpath->query("//s_assert:Assertion/s_assert:AuthnStatement/@SessionIndex")->item(0);
			$issueInstantNode = $this->xpath->query("//s_assert:Assertion/@IssueInstant")->item(0);
			$issuerNode = $this->xpath->query("//s_assert:Assertion/s_assert:Issuer")->item(0);
			$notBeforeNode = $this->xpath->query("//s_assert:Assertion/s_assert:Conditions/@NotBefore")->item(0);
			$notOnOrAfterNode = $this->xpath->query("//s_assert:Assertion/s_assert:Conditions/@NotOnOrAfter")->item(0);
			$audienceNode = $this->xpath->query("//s_assert:Assertion/s_assert:Conditions/s_assert:AudienceRestriction")->item(0);
			$this->xpath->registerNamespace("s_proto", "urn:oasis:names:tc:SAML:2.0:protocol");
			$inResponseToNode = $this->xpath->query("//s_proto:Response/@InResponseTo")->item(0);
			$statusNode = $this->xpath->query("/*/samlp:Status/samlp:StatusCode")->item(0);

			if ($niNode === null || $siNode === null || $issueInstantNode === null || $issuerNode === null || $notBeforeNode === null || $notOnOrAfterNode === null || $audienceNode === null || $inResponseToNode === null || $statusNode === null || $statusNode->attributes === null || $statusNode->attributes->item(0) === null) {
				error_log('SAML response was missing required assertion data.');
				$this->errorBailAll();
			}

			$this->backendState->AS_NI = $this->NIvalue = $niNode->nodeValue; // NEEDED FOR LOGOUT XML BODY
			$this->backendState->AS_SI = $this->SIvalue = $siNode->nodeValue; // NEEDED FOR LOGOUT XML BODY
			$this->IssueInstant = $issueInstantNode->nodeValue;
			$this->AS_Issuer = $issuerNode->nodeValue;
			$this->AS_notBefore = $notBeforeNode->nodeValue;
			$this->AS_notOnOrAfter = $notOnOrAfterNode->nodeValue;
			$this->AS_audience = $audienceNode->nodeValue;
			$this->InResponseTo = $inResponseToNode->nodeValue;
			$this->AS_login_status = $statusNode->attributes->item(0)->nodeValue;
		} catch (\Exception) {
			$this->errorBailAll();
		}
	}

	/**
	 * Resolve the SAML signature algorithm declared in the XML to an OpenSSL-compatible algorithm name.
	 *
	 * @param string $declaredAlgorithm The XML SignatureMethod Algorithm attribute.
	 *
	 * @return string
	 */
	private function resolveSignatureAlgorithm(string $declaredAlgorithm): string
	{
		$normalizedValue = strtolower($declaredAlgorithm);
		if (str_contains($normalizedValue, 'sha256')) {
			return 'sha256';
		}
		if (str_contains($normalizedValue, 'sha384')) {
			return 'sha384';
		}
		if (str_contains($normalizedValue, 'sha512')) {
			return 'sha512';
		}
		if (str_contains($normalizedValue, 'sha1')) {
			return 'sha1';
		}

		return 'sha256';
	}

	/**
	 * Resolve the XMLDSIG digest algorithm declared in a Reference to a PHP hash name.
	 *
	 * @param string $declaredAlgorithm The XML DigestMethod Algorithm attribute.
	 *
	 * @return string
	 */
	private function resolveDigestAlgorithm(string $declaredAlgorithm): string
	{
		$normalizedValue = strtolower($declaredAlgorithm);
		if (str_contains($normalizedValue, 'sha256')) {
			return 'sha256';
		}
		if (str_contains($normalizedValue, 'sha384')) {
			return 'sha384';
		}
		if (str_contains($normalizedValue, 'sha512')) {
			return 'sha512';
		}
		if (str_contains($normalizedValue, 'sha1')) {
			return 'sha1';
		}

		return 'sha256';
	}

	/**
	 * Validate the XMLDSIG References in SignedInfo, including the digest values and the binding to the assertion we are about to consume.
	 *
	 * @param DOMElement $signatureElement The XML signature element.
	 * @param DOMElement $consumedAssertion The assertion node that will be consumed for login.
	 *
	 * @return bool
	 */
	private function validateXmlSignatureReferences(DOMElement $signatureElement, DOMElement $consumedAssertion): bool
	{
		$signedInfoNode = $this->xpath->query('./secdsig:SignedInfo', $signatureElement)->item(0);
		if (!$signedInfoNode instanceof DOMElement) {
			error_log('SAML signature validation failed: the XML signature was missing a SignedInfo element.');
			return false;
		}

		$referenceNodes = $this->xpath->query('./secdsig:Reference', $signedInfoNode);
		if ($referenceNodes === false || $referenceNodes->length === 0) {
			error_log('SAML signature validation failed: the XML signature did not contain any Reference entries.');
			return false;
		}

		$assertionCovered = false;
		for ($i = 0; $i < $referenceNodes->length; $i++) {
			$referenceNode = $referenceNodes->item($i);
			if (!$referenceNode instanceof DOMElement) {
				continue;
			}

			$digestMethodNode = $this->xpath->query('./secdsig:DigestMethod', $referenceNode)->item(0);
			$digestMethodAlgorithm = $digestMethodNode instanceof DOMElement ? $digestMethodNode->getAttribute('Algorithm') : '';
			$resolvedDigestAlgo = $this->resolveDigestAlgorithm($digestMethodAlgorithm !== '' ? $digestMethodAlgorithm : 'sha256');

			$digestValueNode = $this->xpath->query('./secdsig:DigestValue', $referenceNode)->item(0);
			if (!$digestValueNode instanceof DOMElement) {
				error_log('SAML signature validation failed: a Reference element was missing a DigestValue.');
				return false;
			}

			$expectedDigestValue = trim($digestValueNode->nodeValue);
			if ($expectedDigestValue === '') {
				error_log('SAML signature validation failed: a Reference element had an empty DigestValue.');
				return false;
			}

			$referenceUri = $referenceNode->getAttribute('URI');
			$referencedNode = $this->resolveReferenceTarget($referenceUri);
			if (!$referencedNode instanceof DOMElement) {
				error_log('SAML signature validation failed: unable to resolve a signature Reference target. URI=' . $referenceUri);
				return false;
			}

			$canonicalizedReferenceValue = $this->canonicalizeReferenceNode($referenceNode, $referencedNode, $signatureElement);
			if ($canonicalizedReferenceValue === '') {
				error_log('SAML signature validation failed: canonicalization returned empty data for reference URI=' . $referenceUri);
				return false;
			}

			$actualDigestValue = base64_encode(hash($resolvedDigestAlgo, $canonicalizedReferenceValue, true));
			if (!hash_equals($expectedDigestValue, $actualDigestValue)) {
				$xmlDebugPath = __DIR__ . '/temp_saml_response.xml';
				$referenceDebugPath = __DIR__ . '/temp_saml_reference.xml';
				file_put_contents($xmlDebugPath, $this->xmlDoc->saveXML() ?: '');
				file_put_contents($referenceDebugPath, $this->xmlDoc->saveXML($referencedNode) ?: '');
				error_log('SAML signature validation failed: the digest value for a Reference did not match the referenced content. expected=' . $expectedDigestValue . ' actual=' . $actualDigestValue . ' xmlDebug=' . $xmlDebugPath . ' referenceDebug=' . $referenceDebugPath);
				return false;
			}

			if ($this->isAssertionCoveredByReference($referencedNode, $consumedAssertion)) {
				$assertionCovered = true;
			}
		}

		if ($assertionCovered !== true) {
			error_log('SAML signature validation failed: the assertion consumed for login was not covered by any signed Reference.');
			return false;
		}

		return true;
	}

	/**
	 * Resolve a Reference URI to a DOM element in the current document.
	 *
	 * @param string $uri The Reference URI attribute.
	 *
	 * @return DOMElement|null
	 */
	private function resolveReferenceTarget(string $uri): ?DOMElement
	{
		if ($uri === '' || $uri === '#') {
			return null;
		}

		$targetId = ltrim($uri, '#');
		if ($targetId !== '' && $uri[0] === '#') {
			$elements = $this->xmlDoc->getElementsByTagName('*');
			for ($i = 0; $i < $elements->length; $i++) {
				$element = $elements->item($i);
				if (!$element instanceof DOMElement) {
					continue;
				}

				foreach (['ID', 'Id', 'id'] as $attributeName) {
					if ($element->getAttribute($attributeName) === $targetId) {
						return $element;
					}
				}
			}
		}

		return null;
	}

	/**
	 * Canonicalize an XML node using the XMLDSIG algorithm declared in the document.
	 *
	 * @param DOMElement $node The node to canonicalize.
	 * @param string $algorithm The canonicalization algorithm URI.
	 *
	 * @return string
	 */
	private function canonicalizeXmlNode(DOMElement $node, string $algorithm = ''): string
	{
		switch (trim($algorithm)) {
			case 'http://www.w3.org/2001/10/xml-exc-c14n#':
				return $node->C14N(true, false);
			case 'http://www.w3.org/2001/10/xml-exc-c14n#WithComments':
				return $node->C14N(true, true);
			case 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315#WithComments':
				return $node->C14N(false, true);
			case 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315':
			default:
				return $node->C14N(false, false);
		}
	}

	/**
	 * Canonicalize a referenced XML node for digest validation, applying common transforms.
	 *
	 * @param DOMElement $referenceNode The Reference element.
	 * @param DOMElement $referencedNode The resolved target node.
	 * @param DOMElement $signatureElement The parent Signature element.
	 *
	 * @return string
	 */
	private function canonicalizeReferenceNode(DOMElement $referenceNode, DOMElement $referencedNode, DOMElement $signatureElement): string
	{
		$transforms = [];
		$transformNodes = $this->xpath->query('./secdsig:Transforms/secdsig:Transform', $referenceNode);
		if ($transformNodes !== false) {
			for ($i = 0; $i < $transformNodes->length; $i++) {
				$transformNode = $transformNodes->item($i);
				if ($transformNode instanceof DOMElement) {
					$transforms[] = $transformNode->getAttribute('Algorithm');
				}
			}
		}

		$nodeToDigest = $referencedNode;
		$canonicalizationExclusive = false;
		$canonicalizationWithComments = false;
		foreach ($transforms as $transformAlgorithm) {
			switch ($transformAlgorithm) {
				case '':
					break;
				case 'http://www.w3.org/2000/09/xmldsig#enveloped-signature':
					$nodeToDigest = $this->removeSignatureElementFromNode($referencedNode, $signatureElement);
					if (!$nodeToDigest instanceof DOMElement) {
						error_log('SAML signature validation failed: unable to apply the enveloped-signature transform.');
						return '';
					}
					break;
				case 'http://www.w3.org/2001/10/xml-exc-c14n#':
				case 'http://www.w3.org/2001/10/xml-exc-c14n#WithComments':
					$canonicalizationExclusive = true;
					$canonicalizationWithComments = str_contains($transformAlgorithm, 'WithComments');
					break;
				case 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315':
				case 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315#WithComments':
					$canonicalizationExclusive = false;
					$canonicalizationWithComments = str_contains($transformAlgorithm, 'WithComments');
					break;
				default:
					error_log('SAML signature validation failed: unsupported XMLDSIG transform encountered: ' . $transformAlgorithm);
					return '';
			}
		}

		$document = new DOMDocument('1.0', 'UTF-8');
		$document->preserveWhiteSpace = false;
		$document->formatOutput = false;
		$importedNode = $document->importNode($nodeToDigest, true);
		$document->appendChild($importedNode);
		$canonicalizedXml = $document->C14N($canonicalizationExclusive, $canonicalizationWithComments);
		if ($canonicalizedXml === '') {
			error_log('SAML signature validation failed: canonicalization produced empty output for a referenced node.');
		}
		return $canonicalizedXml;
	}

	/**
	 * Remove an XML Signature element from a cloned node to support the enveloped-signature transform.
	 *
	 * @param DOMElement $node The node to clone and sanitize.
	 * @param DOMElement $signatureElement The signature element to remove.
	 *
	 * @return DOMElement
	 */
	private function removeSignatureElementFromNode(DOMElement $node, DOMElement $signatureElement): DOMElement
	{
		$clonedNode = $node->cloneNode(true);
		if (!$clonedNode instanceof DOMElement) {
			return $node;
		}

		$signaturePath = [];
		$currentNode = $signatureElement;
		while ($currentNode !== null && $currentNode !== $node) {
			$parentNode = $currentNode->parentNode;
			if (!$parentNode instanceof DOMNode) {
				break;
			}

			$index = 0;
			$siblingNode = $parentNode->firstChild;
			while ($siblingNode !== null) {
				if ($siblingNode === $currentNode) {
					break;
				}
				$index++;
				$siblingNode = $siblingNode->nextSibling;
			}

			$signaturePath[] = $index;
			$currentNode = $parentNode;
		}

		if ($signaturePath === []) {
			return $clonedNode;
		}

		$targetNode = $clonedNode;
		foreach (array_reverse($signaturePath) as $childIndex) {
			if (!$targetNode instanceof DOMElement) {
				return $clonedNode;
			}

			$childNodes = $targetNode->childNodes;
			if ($childIndex < 0 || $childIndex >= $childNodes->length) {
				return $clonedNode;
			}

			$targetNode = $childNodes->item($childIndex);
		}

		if ($targetNode instanceof DOMElement) {
			$targetNode->parentNode?->removeChild($targetNode);
		}

		return $clonedNode;
	}

	/**
	 * Determine whether a referenced node covers the assertion we are about to consume.
	 *
	 * @param DOMElement $referencedNode The resolved target of a Reference.
	 * @param DOMElement $consumedAssertion The assertion node about to be consumed.
	 *
	 * @return bool
	 */
	private function isAssertionCoveredByReference(DOMElement $referencedNode, DOMElement $consumedAssertion): bool
	{
		$currentNode = $consumedAssertion;
		while ($currentNode !== null) {
			if ($currentNode->isSameNode($referencedNode)) {
				return true;
			}
			$currentNode = $currentNode->parentNode;
		}

		return false;
	}

	/**
	 * SAML XML signature validation method
	 * 
	 * The certificate validation routine based on the  
	 * embedded X509 and signature data sent by the IdP's  
	 * response payload.
	 *
	 * @param string $IDPuidStr The IdP attribute name used to extract the authenticated username from the SAML assertion.
	 * 
	 * @return bool
	 * 
	 */
	private function XMLsigVerf(string $IDPuidStr): bool
	{
		/*
			ADD'L RESOURCES RE: XMLSIG VALIDATION
			- https://stackoverflow.com/a/32801944 (manual - currently utilized in code below)
			- https://github.com/robrichards/xmlseclibs (small xmlsig validation library)
		*/

		$this->xpath->registerNamespace('secdsig', 'http://www.w3.org/2000/09/xmldsig#');
		$this->xpath->registerNamespace('s_resp', 'urn:oasis:names:tc:SAML:2.0:assertion');

		# Canonicalization of the signedInfo entry, as recommended when using XML digital signature operations #
		$signedInfoNode = $this->xpath->query('.//secdsig:Signature/secdsig:SignedInfo')->item(0);
		if (!$signedInfoNode instanceof DOMElement) {
			error_log('SAML signature validation failed: the XML signature was missing a SignedInfo element.');
			$this->errorBailAll();
		}
		$canonicalizationMethodNode = $this->xpath->query('./secdsig:CanonicalizationMethod', $signedInfoNode)->item(0);
		$canonicalizationMethod = $canonicalizationMethodNode instanceof DOMElement ? $canonicalizationMethodNode->getAttribute('Algorithm') : '';
		$signedInfoNodeCanonicalized = $this->canonicalizeXmlNode($signedInfoNode, $canonicalizationMethod);
		$signatureMethodNode = $this->xpath->query('.//secdsig:Signature/secdsig:SignedInfo/secdsig:SignatureMethod')->item(0);
		$signatureNode = $this->xpath->query('.//secdsig:Signature')->item(0);
		if (!$signatureNode instanceof DOMElement) {
			error_log('SAML signature validation failed: no XML Signature element was found in the response.');
			$this->errorBailAll();
		}
		$declaredSignatureMethod = $signatureMethodNode instanceof DOMElement ? $signatureMethodNode->getAttribute('Algorithm') : '';
		$resolvedSigAlgo = $this->resolveSignatureAlgorithm($declaredSignatureMethod !== '' ? $declaredSignatureMethod : 'sha256');

		# fetch the x509 certificate entries from the response; the first certificate is the signing certificate and any later ones may be intermediates #
		$x509certEntries = $this->xpath->query('.//secdsig:Signature/secdsig:KeyInfo/secdsig:X509Data/secdsig:X509Certificate', $this->xmlDoc);
		if ($x509certEntries === false || $x509certEntries->length === 0) {
			error_log('SAML signature validation failed: no X.509 certificate was found in the response.');
			$this->errorBailAll();
		}

		$leafCertPem = null;
		$extraChainCerts = [];
		foreach ($x509certEntries as $certNode) {
			$certData = trim((string) $certNode->nodeValue);
			if ($certData === '') {
				continue;
			}

			$hasPemHeader = strpos($certData, '-----BEGIN CERTIFICATE-----') !== false
				&& strpos($certData, '-----END CERTIFICATE-----') !== false;
			$pemCert = $hasPemHeader
				? $certData
				: "-----BEGIN CERTIFICATE-----\n"
				. preg_replace('/\s+/', '', $certData) . "\n"
				. "-----END CERTIFICATE-----";

			if ($leafCertPem === null) {
				$leafCertPem = $pemCert;
			} else {
				$extraChainCerts[] = $pemCert;
			}
		}

		if ($leafCertPem === null) {
			error_log('SAML signature validation failed: no usable X.509 certificate data was found in the response.');
			$this->errorBailAll();
		}

		$sso_static_vars = parse_ini_file(__DIR__ . self::SSO_CONF_FILE);
		extract($sso_static_vars);

		$trustedCerts = $this->loadTrustedCertificateStore($IDPTrustedCertFile ?? '', $IDPTrustedCertDir ?? '');
		$certificateAuthorityInfo = array_merge($trustedCerts, $extraChainCerts);
		$hasExplicitTrustStore = trim((string) ($IDPTrustedCertFile ?? '')) !== '' || trim((string) ($IDPTrustedCertDir ?? '')) !== '';
		if (!function_exists('openssl_x509_checkpurpose')) {
			error_log('SAML certificate validation failed: openssl_x509_checkpurpose() is not available.');
			$this->errorBailAll();
		}

		$parsedLeafCert = openssl_x509_parse($leafCertPem);
		if ($parsedLeafCert === false) {
			error_log('SAML certificate validation failed: unable to parse the leaf certificate from the SAML response.');
			$this->errorBailAll();
		}

		$leafCertResource = openssl_x509_read($leafCertPem);
		if ($leafCertResource === false) {
			error_log('SAML certificate validation failed: unable to read the leaf certificate as an OpenSSL certificate resource.');
			$this->errorBailAll();
		}

		$opensslErrors = [];
		while (($opensslError = openssl_error_string()) !== false) {
			$opensslErrors[] = $opensslError;
		}

		$caBundlePemParts = [];
		if ($hasExplicitTrustStore) {
			if (count($certificateAuthorityInfo) === 0) {
				error_log('SAML certificate validation failed: no trusted CA certificates were loaded from the configured trust store.');
				$this->errorBailAll();
			}
			$caBundlePemParts = $certificateAuthorityInfo;
		} else {
			$systemCaBundlePaths = [];
			$opensslCafile = ini_get('openssl.cafile');
			if (is_string($opensslCafile) && trim($opensslCafile) !== '' && is_file($opensslCafile) && is_readable($opensslCafile)) {
				$systemCaBundlePaths[] = $opensslCafile;
			}

			$defaultCaBundlePaths = [
				'/etc/ssl/certs/ca-certificates.crt',
				'/etc/pki/tls/certs/ca-bundle.crt',
				'/etc/pki/tls/certs/ca-bundle.pem',
				'/etc/ssl/ca-bundle.pem',
				'/etc/ssl/cert.pem',
				'/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem',
			];
			foreach ($defaultCaBundlePaths as $candidatePath) {
				if (is_file($candidatePath) && is_readable($candidatePath)) {
					$systemCaBundlePaths[] = $candidatePath;
					break;
				}
			}

			foreach ($systemCaBundlePaths as $systemCaBundlePath) {
				$bundleContents = @file_get_contents($systemCaBundlePath);
				if ($bundleContents !== false) {
					$caBundlePemParts[] = $bundleContents;
				}
			}
		}

		if (count($extraChainCerts) > 0) {
			$caBundlePemParts = array_merge($caBundlePemParts, $extraChainCerts);
		}

		$caBundlePem = implode("\n", array_filter(array_map(static fn(string $entry): string => trim($entry), $caBundlePemParts), static fn(string $entry): bool => $entry !== ''));
		$caBundleTempFile = null;
		$trustStoreFiles = [];
		if (trim($caBundlePem) !== '') {
			$caBundleTempFile = tempnam(sys_get_temp_dir(), 'saml-ca-');
			if ($caBundleTempFile === false) {
				error_log('SAML certificate validation failed: unable to create a temporary CA bundle file.');
				$this->errorBailAll();
			}

			$fileWriteResult = file_put_contents($caBundleTempFile, $caBundlePem);
			if ($fileWriteResult === false) {
				@unlink($caBundleTempFile);
				error_log('SAML certificate validation failed: unable to write the CA bundle to a temporary file.');
				$this->errorBailAll();
			}

			$trustStoreFiles = [$caBundleTempFile];
		}

		try {
			$chainValid = openssl_x509_checkpurpose($leafCertResource, X509_PURPOSE_SSL_SERVER, $trustStoreFiles) === true;
			while (($opensslError = openssl_error_string()) !== false) {
				$opensslErrors[] = $opensslError;
			}
		} finally {
			if ($caBundleTempFile !== null && is_file($caBundleTempFile)) {
				@unlink($caBundleTempFile);
			}
		}

		if ($chainValid !== true) {
			error_log('SAML certificate chain validation failed for the IdP signing certificate. chainValid=' . var_export($chainValid, true) . ' opensslErrors=' . json_encode($opensslErrors));
			$this->errorBailAll();
		}

		$consumedAssertionNode = $this->xpath->query('//s_resp:Assertion')->item(0);
		if (!$consumedAssertionNode instanceof DOMElement) {
			error_log('SAML signature validation failed: no SAML assertion was found in the response.');
			$this->errorBailAll();
		}

		if ($this->validateXmlSignatureReferences($signatureNode, $consumedAssertionNode) !== true) {
			$this->errorBailAll();
		}

		# extract public key from x509 certificate #
		$publicKey = openssl_get_publickey($leafCertPem);
		if ($publicKey === false) {
			error_log('SAML signature validation failed: unable to extract the IdP public key from the certificate.');
			$this->errorBailAll();
		}

		# fetch the signature from XML #
		$signature = base64_decode($this->xpath->query('.//secdsig:Signature/secdsig:SignatureValue', $this->xmlDoc)->item(0)->nodeValue);

		# verify validity of the fetched signature value #
		$xmlsig_good = openssl_verify($signedInfoNodeCanonicalized, $signature, $publicKey, $resolvedSigAlgo);

		# get the 'uid' value from IdP which we will link to the Oasys editor system's local username entry #
		$uidNode = $this->xpath->query("//s_resp:Assertion/s_resp:AttributeStatement/s_resp:Attribute[@Name='{$IDPuidStr}']")->item(0);
		if ($uidNode === null || $uidNode->nodeValue === null) {
			error_log('SAML signature validation failed: the configured IdP attribute was not found in the response.');
			$this->errorBailAll();
		}
		$this->SAMLusername = $uidNode->nodeValue;

		return ($xmlsig_good === 1 ? true : false);
	}

	/**
	 * Load one or more trusted CA certificates from an explicit PEM file or directory.
	 *
	 * @param string $trustedCertFile Path to a PEM file containing one or more CA certificates.
	 * @param string $trustedCertDir Path to a directory containing PEM/CRT/CER files.
	 *
	 * @return array<int,string>
	 */
	private function loadTrustedCertificateStore(string $trustedCertFile = '', string $trustedCertDir = ''): array
	{
		$certificates = [];

		if ($trustedCertFile !== '') {
			$certificates = array_merge($certificates, $this->loadCertificatesFromFile($trustedCertFile));
		}

		if ($trustedCertDir !== '') {
			$certFiles = glob(rtrim($trustedCertDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . '*');
			if ($certFiles !== false) {
				foreach ($certFiles as $certFile) {
					if (is_file($certFile)) {
						$certificates = array_merge($certificates, $this->loadCertificatesFromFile($certFile));
					}
				}
			}
		}

		return $certificates;
	}

	/**
	 * Extract PEM certificates from a PEM bundle or a single certificate file.
	 *
	 * @param string $path Path to a PEM bundle or certificate file.
	 *
	 * @return array<int,string>
	 */
	private function loadCertificatesFromFile(string $path): array
	{
		if (!is_readable($path) || !file_exists($path)) {
			error_log("SAML certificate validation warning: trusted certificate file was not found or is not readable: {$path}");
			return [];
		}

		$contents = file_get_contents($path);
		if ($contents === false) {
			error_log("SAML certificate validation warning: unable to read trusted certificate file: {$path}");
			return [];
		}

		preg_match_all('/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/m', $contents, $matches);
		if (!isset($matches[0]) || count($matches[0]) === 0) {
			error_log("SAML certificate validation warning: no PEM certificates were found in: {$path}");
			return [];
		}

		return array_map(static fn(string $cert): string => trim($cert), $matches[0]);
	}

	/**
	 * Final method which calls the actual login operation  
	 * for Oasys.
	 * 
	 * By this point, all IdP assertions have been checked  
	 * for validity, and the $res value being sent in is the  
	 * result of the XML signature verification, which must be  
	 * valid in order to proceed to the actual Oasys login.
	 * 
	 * Any IdP assertion failures would have short-circuited  
	 * the code and bailed, and this part would not have been reached.  
	 * If `$res` is `false` (signature verification failed), the method  
	 * returns without action — no login is performed and no redirect is issued.
	 *
	 * @param  bool $res T/F result of XML signature validation and verification.
	 * @return void
	 */
	protected function LoginToOasys(bool $res): void
	{
		if ($res === true) {
			$this->backendState->SSOloginTrigger = true;
			$this->backendState->SSOUserName = $this->SAMLusername;
			$this->myAuth = new userAuth(true);
			if ($this->myAuth->authResult !== true) {
				# the logout error code is in the state, and we use that to display message on the frontend #
				$this->logoutProcess();
			} else {
				# final redirect to standard editor start location #
				header("Location: dashboard.php", true);
				flush();
			}
		}
	}

	/**
	 * Write a string payload to a temporary file for debugging the SAML exchange.
	 *
	 * @param string $prefix Prefix for the temporary file name.
	 * @param string $contents Contents to store in the temp file.
	 *
	 * @return string Path to the created temp file, or an empty string on failure.
	 */
	private function writeDebugTempFile(string $prefix, string $contents): string
	{
		$debugDir = __DIR__ . '/../logs/saml-debug';
		if (!is_dir($debugDir) && !mkdir($debugDir, 0777, true) && !is_dir($debugDir)) {
			return '';
		}

		$tempFile = tempnam($debugDir, $prefix . '-');
		if ($tempFile === false) {
			return '';
		}

		$fileWriteResult = file_put_contents($tempFile, $contents);
		if ($fileWriteResult === false) {
			@unlink($tempFile);
			return '';
		}

		return $tempFile;
	}

	/**
	 * Writes a structured debug entry to the SAML debug output file.  
	 * Only active when DEBUG_MODE is true; silently returns otherwise.
	 *
	 * @param string $message The message to record in the debug log.
	 *
	 * @return void
	 */

	/**
	 * Fail/exit routine when something unbecoming is observed.  
	 *
	 * @return never
	 */
	protected function errorBailAll(): never
	{
		global $settings;

		error_log('SSO error bail triggered for ' . ($_SERVER['REQUEST_URI'] ?? 'unknown') . ' relay=' . ($_REQUEST['RelayState'] ?? 'none') . ' saml=' . (isset($_REQUEST['SAMLResponse']) ? 'present' : 'missing'));

		if ($this->backendState instanceof OasysBackendState) {
			$this->backendState->eraseState(); // cleanup state
		}

		echo "<h1>Error Processing Request</h1>";
		flush();

		// if a specific error code is not given, assign a generic code
		if ($this->logoutLocation_err_code === "") $this->logoutLocation_err_code = "oaGM";

		// Prepare a safe, escaped URL for embedding in HTML
		$safeUrl = htmlspecialchars($this->logoutLocation_err . $this->logoutLocation_err_code, ENT_QUOTES, 'UTF-8');

		// Try an immediate Location header redirect (only works if headers not already sent)
		if (!headers_sent()) {
			sleep(2);
			header('Location: ' . $safeUrl, true, 303);
		}

		// Provide multiple fallback redirect mechanisms (meta refresh, JavaScript, clickable link)
		echo '<meta http-equiv="refresh" content="2;url=' . $safeUrl . '">';
		echo '<noscript><meta http-equiv="refresh" content="2;url=' . $safeUrl . '"></noscript>';
		// Use json_encode on the raw URL to produce a safely quoted JS string
		echo '<script>setTimeout(function(){ window.location.replace(' . json_encode($safeUrl) . '); }, 2000);</script>';
		echo '<p>If you are not redirected automatically, <a href="' . $safeUrl . '">click here</a>.</p>';

		exit();
	}
}

# ------------------ #
# END SSOLOGIN CLASS #
# ------------------ #

# ------------------------ #
# START SSO FRONTEND CLASS #
# ------------------------ #

/**
 * Frontend extension of main SSOLogin() class.
 */
class SSO_FE_login extends SSOLogin
{
	protected string $loginRelayValue = "fe_oali"; // override of backend SAML login relay value for frontend
	protected string $logoutRelayValue = "fe_oalo"; // override of backend SAML login relay value for frontend
	protected string $logoutRelayValue_err = "fe_oalo_e"; // override of backend SAML login relay value for frontend
	protected string $logoutLocation = "../index.php"; // logout location and optional code (used in a header('Location: ?', true, 303) call)
	protected string $logoutLocation_err = "../index.php"; // logout location for no user found / error / id mismatch scenario (used in a header('Location: ?', true, 303) call)

	/**
	 * {@inheritDoc}
	 */
	public function __construct()
	{
		parent::__construct(); // parent class constructor call
	}

	/**
	 * Override of the base class method for frontend logout relay handling.  
	 * Always returns the standard (non-error) logout RelayState value,  
	 * since frontend SSO sessions do not require the error-path relay.
	 *
	 * @return string
	 */
	protected function logoutAuthRelayVal(): string
	{
		// override the base class to determine the RelayState value to set on logouts here!
		return $this->logoutRelayValue;
	}

	/**
	 * Override of the base class login finalisation for the frontend context.  
	 * On successful signature verification, destroys the SAML flow session,  
	 * regenerates the session ID, sets frontend-specific session keys,  
	 * and redirects to the frontend login action. If `$res` is `false`,  
	 * the method returns without action.
	 *
	 * @param bool $res T/F result of XML signature validation and verification.
	 * @return void
	 */
	protected function LoginToOasys(bool $res): void
	{
		# Destroy the SAML flow state and start a fresh one with a new ID and cookie #
		$this->backendState->rotateStateId();

		$this->backendState->sk = hash('sha512', $_SERVER['HTTP_HOST'] . "muhSaltVal");
		$this->backendState->FE_SSO_AUTH = true;
		$this->backendState->FE_USERNAME = $this->SAMLusername;
		header("Location: ../index.php?action=login", true);
		flush();
	}
}

# ------------------ #
# END OF ALL CLASSES #
# ------------------ #

# CONDITIONAL INSTANTIATION OF MAIN SSOLOGIN CLASS FOR BACKEND EDITOR #
if (
	(isset($_GET['s']) && $_GET['s'] === "editor") || (isset($_REQUEST['RelayState']) && in_array($_REQUEST['RelayState'], ['oali', 'oalo', 'oalo_e']))
) new SSOLogin();

# CONDITIONAL INSTANTIATION OF EXTENDED SSOLOGIN CLASS FOR FRONTEND #
if (
	(isset($_REQUEST['s']) && $_REQUEST['s'] === "fe") || (isset($_REQUEST['RelayState']) && in_array($_REQUEST['RelayState'], ['fe_oali', 'fe_oalo', 'fe_oalo_e']))
)	new SSO_FE_login();
