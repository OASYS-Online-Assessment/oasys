<?Php

# -------------------------------------- #
# REQUIRED INCLUDES FOR CLASS OPERATIONS #
# -------------------------------------- #

require_once __DIR__ . '/inc/php/database.php';
require_once __DIR__ . '/../inc/php/settings.php';
require_once __DIR__ . "/inc/php/userAuth.php";

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

		# --------------------------------------------------------------- #
		# Instantiate our r/w session handler for required SSO operations #
		# --------------------------------------------------------------- #

		global $sql_db, $sql_user, $sql_password, $sql_host;
		$sessionHandler = new dbSessionHandler($sql_db, $sql_user, $sql_password, $sql_host, __DIR__ . '/../logs/sso_sessionHandler_errors.txt', 'sso', false);
		session_set_save_handler($sessionHandler, true);
		$rootPath = ($_SERVER['CONTEXT_PREFIX'] !== "") ? $_SERVER['CONTEXT_PREFIX'] . DIRECTORY_SEPARATOR : establishRootURL();

		session_start([
			'cookie_path' => $rootPath,
			'read_and_close' => false,
			'cookie_httponly' => true,
			'cookie_secure' => true,
			'cookie_samesite' => 'None'
		]);

		$this->debugLog("Session started in constructor: " . session_id(), 0);

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

					# final removal of Php Session Cookie for extra security (note that userauth status in any case should be 'logged out' at this point) #
					setcookie("PHPSESSID", "", time() - 3600, ($settings['JSrootURL']));

					# cleanup the backend session entry #
					session_unset();
					session_destroy();

					# we just redirect back to standard login screen when logged out #
					header("Location: {$this->logoutLocation}", true, 303);
					break;

				case $this->logoutRelayValue_err: // SSO/Oasys logout routine when no user found in oasys, or an ID mismatch error, late login, disabled acct, etc.

					# final removal of Php Session Cookie for extra security (note that userauth status in any case should be 'logged out' at this point) #
					setcookie("PHPSESSID", "", time() - 3600, ($settings['JSrootURL']));

					# final redirect back to login screen with specific logout message for SSO sessions #
					header("Location: {$this->logoutLocation_err}" . $_SESSION['SSO_LO_ECODE'], true);

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

		if ((string) $xmlObj['InResponseTo'][0] !== $_SESSION['SSO_LO_ID']) $this->errorBailAll(); // validate logout ID doesn't match logout assertion ID
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
		$sso_static_vars = parse_ini_file(__DIR__ . "/../conf/ssodata.ini");
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

		$_SESSION['SSO_LO_ID'] = $this->ID;
		session_write_close();

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
		if (!isset($_SESSION['AS_NI']) || !isset($_SESSION['AS_SI'])) $this->errorBailAll();
		$this->NIvalue = $_SESSION['AS_NI'];
		$this->SIvalue = $_SESSION['AS_SI'];
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

		# pull in IdP-specific data variables #
		$sso_static_vars = parse_ini_file(__DIR__ . "/../conf/ssodata.ini");
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

		// Ensure session is closed before redirect
		if (session_status() === PHP_SESSION_ACTIVE) {
			session_write_close();
		}

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
		$_SESSION['SSO_OUTBOUND_ID'] = $this->ID = bin2hex(random_bytes(64)); // used in IdP assertion validation
		$_SESSION['SSO_ISSUE_INSTANT'] = $this->IssueInstant = gmdate("Y-m-d\TH:i:s\Z"); // used in IdP assertion validation

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
		$sso_static_vars = parse_ini_file(__DIR__ . "/../conf/ssodata.ini");
		extract($sso_static_vars);
		$sigAlgo = (int) $sigAlgo;

		$this->xmlObjBuilder($SAMLresponse);
		$sigVerfResult = $this->XMLsigVerf($sigAlgo, $IDPuidStr);
		$this->LoginBuildSessionData();
		$this->validateIDPAssertions();
		$this->LoginToOasys($sigVerfResult);
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
		$sso_static_vars = parse_ini_file(__DIR__ . "/../conf/ssodata.ini");
		extract($sso_static_vars);

		$pass = true;
		$failReason = [];

		$this->debugLog("Starting IDP assertion validation.");

		if (($_SESSION['SSO_OUTBOUND_ID']) !== $this->InResponseTo) {
			$pass = false;
			$expectedOutboundId = $_SESSION['SSO_OUTBOUND_ID'] ?? 'NULL';
			$recssoid = $this->InResponseTo ?? 'NULL';
			$serverseshid = session_id() ?? 'NULL';
			$seshcookieid = $_COOKIE['PHPSESSID'] ?? 'NULL';
			$failReason[] = "[OASYS SSO DEBUG] OUTBOUND_ID mismatch. DEBUG DATA: " . "EXPECTED SSO ID={$expectedOutboundId} | RECEIVED SSO ID={$recssoid} | SERVER_SESSION_ID={$serverseshid} | SESSION_COOKIE_ID={$seshcookieid}";
		}

		# check the allowed time before/after values assertions sent by IdP to mitigate replay attacks #
		$ourIssueTime = time(); // current time at moment of response processing (SAML 2.0 spec §2.5.1)
		$notBefore = strtotime($this->AS_notBefore);
		$not_on_or_after = strtotime($this->AS_notOnOrAfter);

		if ((($ourIssueTime >= $notBefore) && ($ourIssueTime < $not_on_or_after)) !== true) {
			$pass = false;
			$failReason[] = "[OASYS SSO DEBUG] Timing validation failed. DEBUG DATA: " . "OUR_ISSUE_TIME={$ourIssueTime} | NOT_BEFORE={$notBefore} | NOT_ON_OR_AFTER={$not_on_or_after}";
			$_SESSION['SSO_LO_ECODE'] = $this->logoutLocation_err_code = $this->logoutLocation_err_code = "oaTO";
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

		if (!isset($_COOKIE['PHPSESSID']) || $_COOKIE['PHPSESSID'] !== session_id()) {
			$pass = false;
			$cookieSessionId = isset($_COOKIE['PHPSESSID']) ? $_COOKIE['PHPSESSID'] : 'MISSING';
			$currentSessionId = session_id();
			$failReason[] = "[OASYS SSO DEBUG] Session cookie mismatch. DEBUG DATA: COOKIE_PHPSESSID={$cookieSessionId} | SESSION_ID={$currentSessionId}";
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
			$_SESSION['FE_SSO_AUTH'] = false;

			// Proactively end the IdP session so the next attempt requires credentials (only if required vars are present for logout)
			if (isset($_SESSION['AS_NI'], $_SESSION['AS_SI'])) {
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
			$_SESSION['AS_NI'] = $this->NIvalue = $this->xpath->query("//s_assert:Assertion/s_assert:Subject/s_assert:NameID")->item(0)->nodeValue; // NEEDED FOR LOGOUT XML BODY
			$_SESSION['AS_SI'] = $this->SIvalue = $this->xpath->query("//s_assert:Assertion/s_assert:AuthnStatement/@SessionIndex")->item(0)->nodeValue; // NEEDED FOR LOGOUT XML BODY
			$this->IssueInstant = $this->xpath->query("//s_assert:Assertion/@IssueInstant")->item(0)->nodeValue;
			$this->AS_Issuer = $this->xpath->query("//s_assert:Assertion/s_assert:Issuer")->item(0)->nodeValue;

			# Timing constraint extraction (notBefore/notOnOrAfter) & 'audience' #
			$this->AS_notBefore = $this->xpath->query("//s_assert:Assertion/s_assert:Conditions/@NotBefore")->item(0)->nodeValue;
			$this->AS_notOnOrAfter = $this->xpath->query("//s_assert:Assertion/s_assert:Conditions/@NotOnOrAfter")->item(0)->nodeValue;
			$this->AS_audience = $this->xpath->query("//s_assert:Assertion/s_assert:Conditions/s_assert:AudienceRestriction")->item(0)->nodeValue;

			# SAML ID parsing for request validation matching #
			$this->xpath->registerNamespace("s_proto", "urn:oasis:names:tc:SAML:2.0:protocol");
			$this->InResponseTo = $this->xpath->query("//s_proto:Response/@InResponseTo")->item(0)->nodeValue;


			# SAML final 'status' assertion #
			$this->AS_login_status = $this->xpath->query("/*/samlp:Status/samlp:StatusCode")->item(0)->attributes->item(0)->nodeValue;
		} catch (\Exception) {
			$this->errorBailAll();
		}
	}

	/**
	 * SAML XML signature validation method
	 * 
	 * The certificate validation routine based on the  
	 * embedded X509 and signature data sent by the IdP's  
	 * response payload.
	 *
	 * @param int $sigAlgo The specific signature algorithm used by IdP. The value is configured in the ssodata.ini configuration file.
	 * @param string $IDPuidStr The IdP attribute name used to extract the authenticated username from the SAML assertion.
	 * 
	 * @return bool
	 * 
	 */
	private function XMLsigVerf(int $sigAlgo, string $IDPuidStr): bool
	{
		/*
			ADD'L RESOURCES RE: XMLSIG VALIDATION
			- https://stackoverflow.com/a/32801944 (manual - currently utilized in code below)
			- https://github.com/robrichards/xmlseclibs (small xmlsig validation library)
		*/

		$this->xpath->registerNamespace('secdsig', 'http://www.w3.org/2000/09/xmldsig#');

		# Canonicalization of the signedInfo entry, as recommended when using XML digital signature operations #
		$signedInfoNodeCanonicalized = $this->xpath->query('.//secdsig:Signature/secdsig:SignedInfo')->item(0)->C14N(true, false);

		# fetch the x509 certificate entry #
		$x509cert = $this->xpath->query('.//secdsig:Signature/secdsig:KeyInfo/secdsig:X509Data/secdsig:X509Certificate', $this->xmlDoc)->item(0)->nodeValue;

		# wrap the X509 cert data to have it conform to the PEM standard #
		$x509cert = "-----BEGIN CERTIFICATE-----\n"
			. $x509cert . "\n"
			. "-----END CERTIFICATE-----";

		# extract public key from x509 certificate #
		$publicKey = openssl_get_publickey($x509cert);

		# fetch the signature from XML #
		$signature = base64_decode($this->xpath->query('.//secdsig:Signature/secdsig:SignatureValue', $this->xmlDoc)->item(0)->nodeValue);

		# verify validity of the fetched signature value #
		$xmlsig_good = openssl_verify($signedInfoNodeCanonicalized, $signature, $publicKey, $sigAlgo);

		# re-define our xpath namespace to get specific institutional values #
		$this->xpath->registerNamespace("s_resp", "urn:oasis:names:tc:SAML:2.0:assertion");

		# get the 'uid' value from IdP which we will link to the Oasys editor system's local username entry #
		$this->SAMLusername = $this->xpath->query("//s_resp:Assertion/s_resp:AttributeStatement/s_resp:Attribute[@Name='{$IDPuidStr}']")->item(0)->nodeValue;

		return ($xmlsig_good === 1 ? true : false);
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
			$_SESSION['SSOloginTrigger'] = true;
			$_SESSION['SSOUserName'] = $this->SAMLusername;
			// $this->debugLog("PRE-SESSION REGENERATION MARKER SESSION AND COOKIE VALUE: " . session_id() . " / " . ($_COOKIE['PHPSESSID'] ?? 'NULL'), 1);
			// session_regenerate_id(true);
			$this->debugLog("Final session/cookie values:", 0);
			$this->myAuth = new userAuth(true);
			if ($this->myAuth->authResult !== true) {
				# the logout error code is in the $_SESSION, and we use that to display message on the frontend #
				$this->logoutProcess();
			} else {
				# final redirect to standard editor start location #
				header("Location: dashboard.php", true);
				flush();
			}
		}
	}

	/**
	 * Writes a structured debug entry to the SAML debug output file.  
	 * Only active when DEBUG_MODE is true; silently returns otherwise.
	 *
	 * @param string $message The message to record in the debug log.
	 *
	 * @return void
	 */
	private function debugLog(string $message): void
	{
		if (!self::DEBUG_MODE) {
			return;
		}

		$debugFileName = "temp_saml_debug.out";
		$debugMsg = "SAML Debug [" . date('H:i:s') . "]\n" .
			"MESSAGE:                 " . $message . "\n" .
			"User Login Name:         " . ($_SESSION['SSOUserName'] ?? $this->myAuth->username ?? 'NULL') . "\n" .
			"Cookie ID:               " . ($_COOKIE['PHPSESSID'] ?? 'NULL') . "\n" .
			"Session ID:              " . session_id() . "\n" .
			"SSO Outbound ID:         " . ($_SESSION['SSO_OUTBOUND_ID'] ?? 'NULL') . "\n" .
			"InResponseTo:            " . ($this->InResponseTo ?? 'NULL') . "\n";

		foreach ($_REQUEST as $reqKey => $reqVal) {
			$valStr = is_scalar($reqVal) ? (string)$reqVal : json_encode($reqVal);
			if (strlen($valStr) > 50) {
				$valStr = substr($valStr, 0, 50) . "...";
			}
			$debugMsg .= str_pad("Req[$reqKey]:", 25) . $valStr . "\n";
		}

		if (isset($_REQUEST['SAMLResponse'])) {
			$debugMsg .= "Header Cookie:           " . ($_SERVER['HTTP_COOKIE'] ?? 'NULL') . "\n";
		}

		error_log($debugMsg, 3, "$debugFileName");
		error_log("--------------------------------------------------\n", 3, "$debugFileName");
	}

	/**
	 * Fail/exit routine when something unbecoming is observed.  
	 *
	 * @return never
	 */
	protected function errorBailAll(): never
	{
		global $settings;

		setcookie("PHPSESSID", "", time() - 3600, ($settings['JSrootURL'])); // cleanup session cookie
		session_unset(); // nuke all set session data
		if (session_status() === PHP_SESSION_ACTIVE) session_destroy(); // nuke session itself if applicable

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
		# Destroy the SAML flow session and start a fresh one with a new ID and cookie #
		session_unset();
		session_regenerate_id(true);

		$_SESSION['sk'] = hash('sha512', $_SERVER['HTTP_HOST'] . "muhSaltVal");
		$_SESSION['FE_SSO_AUTH'] = true;
		$_SESSION['FE_USERNAME'] = $this->SAMLusername;
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
