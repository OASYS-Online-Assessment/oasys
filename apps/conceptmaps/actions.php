<?php
	if (isset($_REQUEST['action'])) $action  = $_REQUEST['action']; else $action = "";
	if (isset($_REQUEST['overwrite'])) $overwrite = $_REQUEST['overwrite']; else $overwrite = 0;
	if (isset($_REQUEST['data'])) $data  = $_REQUEST['data']; else $data = array();

	$res['action'] = $action;
	$path = "documents/";
	$logpath = "logs/";
	
	switch ($action) {
		case 'save':
			$fname = $data['name'] . ".nxfc";
			$destination = $path.$fname;
			if (file_exists($destination) && !$overwrite) {
				$res['error'] = false;
				$res['msg'] = "File '$fname' could not be written!";
				$res['action'] = 'overwrite';
				break;
			}
			$bytes = file_put_contents($destination, json_encode($data));
			$res['data']['destination'] = $destination;
			if ($bytes === false) {
				$res['error'] = true;
				$res['msg'] = "File '$fname' could not be written!";
			} else {
				$res['error'] = false;
				$res['data']['bytes'] = $bytes;
			}
			break;
		case 'log':
			$fname = $data['name'] . ".txt";
			$destination = $logpath.$fname;
			$bytes = file_put_contents($destination, $data['log'], FILE_APPEND);
			if ($bytes === false) {
				$res['error'] = true;
				$res['msg'] = "Logfile could not be written!";
			} else {
				$res['error'] = false;
			}
			break;
		case 'ls':
			$dir = openDir($path);
			$files = array();
			while (($dirItem = readdir($dir)) == true) {
				if (!is_dir($path.$dirItem) && preg_match('/\.nxfc$/', $dirItem)) {
					$files[] = $dirItem;
				}
			}
			$res['data']['files'] = $files;
			$res['error'] = false;
			break;
		case 'load':
			$source = $path.$data['file'];
			$contents = file_get_contents($source);
			if ($contents === false) {
				$res['error'] = true;
				$res['msg'] = "File '$source' could not be read!";
			} else {
				$res['error'] = false;
				$res['data'] = json_decode($contents);
			}
			break;
	}
			
	header('Cache-Control: no-cache, must-revalidate');
	header('Content-type: application/json; charset=UTF-8');
	echo(json_encode($res));
?>