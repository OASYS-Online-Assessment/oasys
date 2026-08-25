tinymce.PluginManager.add('imagebrowser', function (editor, url) {
	// Add a button that opens a window
	editor.ui.registry.addButton('imagebrowser', {
		tooltip: 'Insert image',
		icon: "image",
		onAction: function () {
			initImageBrowser(editor);
		}
	});

	// Adds a menu item to the tools menu
	editor.ui.registry.addMenuItem('imagebrowser', {
		text: 'Insert image',
		// context: 'insert',
		icon: "image",
		onAction: function () {
			initImageBrowser(editor);
		}
	});
});

function initImageBrowser(ed) {
	new jsMediaPlugin('oasysImagePlugin', {
		mediaTypes: 'image',
		onClose: insertImageElement
	});

	function insertImageElement(sender, mediaObj) {
		if (mediaObj.btnType === 'url') {
			ed.insertContent("fetchMediaFile.php?fileid=" + mediaObj.fileId + "&checksum=" + mediaObj.checksum);
		} else {
			if (mediaObj.imgVerticalAlign !== 'default') {
				ed.insertContent("<img style='vertical-align:" + mediaObj.imgVerticalAlign + ";' src='fetchMediaFile.php?fileid=" + mediaObj.fileId + "&checksum=" + mediaObj.checksum + "' width='" + mediaObj.width + "px' height='" + mediaObj.height + "px'>");
			} else {
				ed.insertContent("<img src='fetchMediaFile.php?fileid=" + mediaObj.fileId + "&checksum=" + mediaObj.checksum + "' width='" + mediaObj.width + "px' height='" + mediaObj.height + "px'>");
			}
		}
	}
}

