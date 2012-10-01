const ExpressionStopCharacters = " =:[({;,!+-*/&|^<>";

/**
 * @extends {WebInspector.View}
 * @constructor
 * @param {boolean} hideContextSelector
 */
WebInspector.RemoteView = function(hideContextSelector)
{
	WebInspector.View.call(this);

	this.element.id = "remote-view";

	this.nativeElement = this._createPanel();
	this.clientListElement = this._createPanel();

	this._filterBarElement = document.createElement("div");
	this._filterBarElement.className = "scope-bar status-bar-item";

	function createDividerElement() {
		var dividerElement = document.createElement("div");
		dividerElement.addStyleClass("scope-bar-divider");
		this._filterBarElement.appendChild(dividerElement);
	}

	var updateFilterHandler = this._updateFilter.bind(this);
	function createFilterElement(category, label) {
		var categoryElement = document.createElement("li");
		categoryElement.category = category;
		categoryElement.className = category;
		categoryElement.addEventListener("click", updateFilterHandler, false);
		categoryElement.textContent = label;

		this._filterBarElement.appendChild(categoryElement);
		return categoryElement;
	}

	this.connectNativeElement = createFilterElement.call(this, "native", WebInspector.UIString("Connect to native"));
	this.connectNativeElement.panel = this.nativeElement;
	this.listClientsElement = createFilterElement.call(this, "clientList", WebInspector.UIString("List clients"));
	this.listClientsElement.panel = this.clientListElement;
}

WebInspector.RemoteView.Events = {
	RemoteCleared: "remote-cleared",
	EntryAdded: "remote-entry-added",
}

WebInspector.RemoteView.prototype = {
	get statusBarItems()
	{
		return [this._filterBarElement];
	},

	_createPanel: function() {
		var div = document.createElement("div");
		div.style.position = "absolute";
		div.style.top = "1em";
		div.style.right = "1em";
		div.style.left = "1em";
		div.style.bottom = "1em";
		div.style.overflow = "auto";
		div.style.display = "none";
		this.element.appendChild(div);

		return div;
	},

	_hidePanel: function(panel) {
		panel.style.display = "none";
	},

	_showPanel: function(panel) {
		panel.style.display = "block";
	},

	willHide: function()
	{
	},

	wasShown: function()
	{
	},

	afterShow: function()
	{
		WebInspector.setCurrentFocusElement(this.promptElement);
	},

	storeScrollPositions: function()
	{
	},

	restoreScrollPositions: function()
	{
	},

	onResize: function()
	{
		this.restoreScrollPositions();
	},

	_isScrollIntoViewScheduled: function()
	{
		return !!this._scrollIntoViewTimer;
	},

	elementsToRestoreScrollPositionsFor: function()
	{
		return [this.messagesElement];
	},

	_updateFilter: function(e)
	{
		this.filter(e.target);
	},

	filter: function(target)
	{
		this.connectNativeElement.removeStyleClass("selected");
		this.listClientsElement.removeStyleClass("selected");

		this._currentPanel && this._hidePanel(this._currentPanel);
		this._currentPanel = target.panel;
		this._showPanel(target.panel);

		target.addStyleClass("selected");
	}
}

WebInspector.RemoteView.prototype.__proto__ = WebInspector.View.prototype;

/**
 * @type {?WebInspector.RemoteView}
 */
WebInspector.remoteView = null;