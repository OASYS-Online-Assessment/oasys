<?php
function includeCSS($file): void {
    $mtime = filemtime($file);
    echo "<link rel='stylesheet' href='$file?update=$mtime'>";
}

function includeJS($file, $id = null): void {
    $mtime = filemtime($file);
    if (isset($id)) {
        echo "<script src='$file?update=$mtime' id='$id'></script>";
    } else {
        echo "<script src='$file?update=$mtime'></script>";
    }
}

function includeJSEditor($scriptPath, $interactionPath): void {
	$phpScript = $scriptPath . "fetchEditorScript.php";
	echo "<script src='$phpScript?path=$interactionPath'></script>";
}