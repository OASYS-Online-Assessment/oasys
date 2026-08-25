class DashboardTestItem {
	//Feed in sample data and populate the containers with test items (availability param is not used)

	static weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

	// Constructor
	constructor(data, callback) {
		this.callback = callback;
		this.id = data.uniqueId;
		this.init(data);
	}

	update(data) {
		if (compareData(data, this.data) !== true) {
			this.init(data); //recreate item with new data
		}
	}

	init(data) {
		this.data = data;
		this.jsph = jsPointerHandler.instance;
		this.name = data.label;

		this.active = data.active;

		if (data.restrictions.dateRange !== false) {
			if (data.restrictions.dateRange.start !== false) {
				this.startDate = new Date(data.restrictions.dateRange.start);
			} else {
				this.startDate = false
			}
			if (data.restrictions.dateRange.end !== false) {
				this.endDate = new Date(data.restrictions.dateRange.end);
			} else {
				this.endDate = false;
			}
		} else {
			this.startDate = false;
			this.endDate = false;
		}

		if (data.restrictions.timeRestricition !== false) {
			this.startTime = data.restrictions.timeRestriction.start;
			this.endTime = data.restrictions.timeRestriction.end;
		} else {
			this.startTime = false;
			this.endTime = false;
		}
		if (data.restrictions.testDays !== false && data.restrictions.testDays.days !== "0,1,2,3,4,5,6") {
			this.weekDays = data.restrictions.testDays.days.split(",").map((day) => {
				return global_getText("dashboard", DashboardTestItem.weekDays[day]);
			});
		} else {
			this.weekDays = "";
		}

		this.progress = Math.round(data.activity?.progress?.required?.percentage ?? 0);
		this.status = data.activity.status;
		this.newTestsContainer = "currentTestsList";
		this.oldTestsContainer = "pastTestsList";
		this.state = this.setState();
		this.placementContainer = this.setContainer();
		this.available = data.available ?? true; //if not set, assume true

		this.html = "";
		this.setContainer();
		this.render();
	}

	setContainer() {
		//Set container for the test
		if (this.state === 'expired' || this.state === 'finished') {
			return this.oldTestsContainer;
		}
		return this.newTestsContainer;
	}

	setState() {
		//Set where to place the test
		const today = new Date();
		if (this.active === false) {
			return "inactive";
		} else if (this.progress === 100) {
			return "completed";
		} else if (this.startDate && this.startDate > today) {
			return "scheduled";
		} else if (this.endDate && this.endDate < today) {
			return "expired";
		} else if (this.startDate < today && this.endDate > today && this.progress === 0) {
			return "new";
		} else if (this.status.finished === false && this.progress > 0 && this.progress < 100) {
			return "incomplete";
		} else if (this.status.finished === true) {
			return "finished";
		}
	}

	render() {
		//Build HTML for test item

		//Text content for html
		let dateString = "";
		let dateRangeString = global_getText("dashboard","available") + " ";
		let timeRangeString = (this.weekDays !=='' ? this.weekDays : global_getText("dashboard", 'every day')) + " ";

		if (this.startDate) {
			dateRangeString += global_getText("dashboard", "from") + " " + this.startDate.toLocaleString() + " ";
		}
		if (this.endDate) {
			dateRangeString += global_getText("dashboard", "to") + " " + this.endDate.toLocaleString();
		}
		if (this.startTime && this.endTime) {
			timeRangeString += global_getText("dashboard", "from") + " " + this.startTime + " " + global_getText("dashboard", "to")  + " " + this.endTime;
		}

		const testHtml = `<div class="testItem testState_${this.state} testAvailability_${this.available ? 'true' : 'false'}" data-id="${this.id}">
			<div class="testTitle">${this.name}</div>
			<div class="testProgress">${this.progress} %</div>
			<div class="testStatus accessDetails">${this.state === 'inactive' ? 'inactive' : ''}</div>
			<div class="testDateRange accessDetails">${dateRangeString}</div>
			<div class="testTimeRange accessDetails">${timeRangeString}</div>
		</div>`;

		const container = document.getElementById(this.placementContainer);
		if (container) {
			//check if the testItem already exists
			const existingItem = $(`.testItem[data-id="${this.id}"]`);
			if (existingItem.length > 0) {
				// if it exists, check if it is in the container we want to place it in …
				if (container.contains(existingItem[0])) {
					// … if it is, replace the existing item with the new HTML
					existingItem.replaceWith(testHtml);
				} else {
					// … if it is not, remove the existing item and insert the new HTML in the correct container
					existingItem.remove();
					container.insertAdjacentHTML("beforeend", testHtml);
				}
			} else {
				// if it does not exist, insert the new HTML in the correct container
				container.insertAdjacentHTML("beforeend", testHtml);
			}
			if (this.placementContainer === this.newTestsContainer) {
				this.jsph.listen($(`.testItem[data-id=${this.id}]`), {
					callbacks: {
						click: () => {
							if (this.data.options?.pwReq === true && this.data.available === true) {
								this.showPasswordPopup().then((res) => {
									if (res.button === 'ok') {
										this.data.password = res.data.passField;
										this.callback.call(this, this.data);
									}
								});
							} else {
								this.callback.call(this, this.data);
							}
						}
					}
				});
			}
		} else {
			console.error(
				`${this.name} could not find ${this.placementContainer} in the dom`
			);
		}
	}

	async showPasswordPopup() {
		let dialogData = {
			buttons: [{
				label: 'Cancel',
				'default': false,
				cancel: true,
				value: 'cancel'
			}, {
				label: 'OK',
				'default': true,
				cancel: false,
				value: 'ok'
			}],
			datafields: ['passField'],
			focus: 'passField',
			mandatory: ['passField'], //disable OK button if field is empty or contains only whitespace
			contents: '<form>' + global_getText("dashboard", 'requirePassword_msg') + '<br><input autocomplete="off" type="password" id="passField" maxlength="30" style="width: 100%; margin-top: 10px;"></form>',
			title: global_getText("dashboard", "requirePassword_title"),
			icon: "images/lock.png",
			iconWidth: 64,
			width: 500,
			returnPromise: true,
			dataFormat: 'object'
		};
		return new nxDialog('passwordPopup', dialogData);
	}

	remove() {
		//Remove test item from the DOM
		$(`.testItem[data-id="${this.id}"]`).remove();
	}

}
