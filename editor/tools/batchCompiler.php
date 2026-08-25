<?php

$action = filter_input(INPUT_POST, 'action');
if (!$action) {
    $action = "index";
}

?>

<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Page batch compiler</title>
    <style>
        form {
            margin: 100px 0;
            text-align: center;
        }

        input[type="submit"] {
            padding: 10px;
            font-size: 24px;
            cursor: pointer;
            border-radius: 20px;
        }
    </style>
</head>
<body>
<?php if ($action === 'index') { ?>

    <form method="post" action="batchCompiler.php">
        <input type="hidden" name="action" value="compile">
        <input type="submit" value="Update all pages in database">
    </form>

    <form method="post" action="batchCompiler.php">
        <input type="hidden" name="action" value="test">
        <input type="submit" value="Test the compiler">
    </form>

<?php
} elseif ($action === 'compile') {
    require_once '../inc/php/pageClass.php';
    $returnData = [];
    $pc = new pageClass($returnData, []);
    $pc->execute('getAllPageIds');
    $ids = $returnData['data'];
    echo "<pre>";
    foreach ($ids as $id) {
        echo "compiling page with id $id\n";
        $pc->recompilePage($id);
        print_r($returnData['compilationErrors']);
    }
    echo "</pre>";
} elseif ($action === 'test') {
    require_once '../inc/php/pageClass.php';
    $returnData = [];
    $pc = new pageClass($returnData, []);
    $pc->execute('getAllPageIds');
    $ids = $returnData['data'];
    echo "<pre>";
    foreach ($ids as $id) {
        echo "compiling page with id $id\n";
        $pc->testCompiler($id);
        echo "<pre>";
        if (isset($returnData['compilationErrors'])) {
            print_r($returnData['compilationErrors']);
        }
        if (isset($returnData['error'])) {
            print_r($returnData['error']);
        }
        echo "</pre>";
        if (isset($returnData['debug'])) {
            debugArray($returnData['debug']);
        }
    }
    echo "</pre><p>Check finished</p>";
}
?>
</body>
</html>