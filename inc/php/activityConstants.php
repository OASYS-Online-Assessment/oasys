<?php
	const ACTIVITY_STATUS_CLEAN = 0;	//user has not logged so far
	const ACTIVITY_STATUS_ACTIVE = 1;	//user is active at the moment
	const ACTIVITY_STATUS_TIMEOUT = 2;	//user was active but timed out (test still open)
	const ACTIVITY_STATUS_FINISHED = 3;	//user has finished test (either time was up or close button was clicked)
