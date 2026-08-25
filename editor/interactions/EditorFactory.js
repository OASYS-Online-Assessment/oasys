class EditorFactory {

	constructor() {}

	/* returns a new instance of the selected editor type */
	createEditor(name, id) {
		if (window.interactionClasses[name]) {
			return new window.interactionClasses[name](id);
		} else {
			console.error('EditorFactory: unknown editor type ' + name);
			return null;
		}
	}

	/* returns the class of the selected editor type (for calling static methods) */
	getEditorClass(name) {
		if (window.interactionClasses[name]) {
			return window.interactionClasses[name];
		} else {
			console.error('EditorFactory: unknown editor type ' + name);
			return null;
		}
	}

}