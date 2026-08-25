<?php
	header('Location: ../');
	/*
		The landingPages folder should not be opened directly. If Apache does not forbid index, that would show a list of
		all existing landing pages.
		Therefore this file redirects back to main OASYS entry point if openend manually.

		How to use landing pages:

		1. create a folder here, for instance "xyz/"
		2. open OASYS in root url with parameter "landingPage=xyz" or set the system setting landingPage to the value "xyz"
		3. if a loaderManifest.json File is found with correct information for the javascript loader, this page will
			be dynamically loaded without redirecting there. If no manifest file is found, OASYS redirects to this folder
			which then needs an index.html or index.php file to be self sufficient
	 */