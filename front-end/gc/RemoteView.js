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

	this.nativeElement = this._createNativePanel();
	this.clientListElement = this._createWebPanel();

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

	this.filter(this.connectNativeElement);
};

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

	_addNode: function(parent, type) {
		var node = document.createElement(type || "div");
		parent.appendChild(node);
		return node;
	},

	_addText: function(parent, text, type) {
		var node = this._addNode(parent, type);
		node.innerHTML = text;
		return node;
	},

	_createNativePanel: function() {
		var panel = this._createPanel();
		var texts = [
				"The Native Web Inspector allows you to debug and profile JavaScript code running live on a device.",
				"The application must have been built with the --debug flag.",
				"And it can only debug one application at a time, so be sure to force close other debug-mode applications."
			];

		this._addText(panel, 'Native', 'h2');
		for (var i = 0; i < texts.length; i++) {
			this._addText(panel, texts[i]);
		}

		return panel;
	},

	_createWebPanel: function() {
		var panel = this._createPanel();

		this._addText(panel, 'WebClient', 'h2');

		this._addText(panel, 'Targets', 'h3');
		this._targetsList = this._addNode(panel);
		this._targetNodes = {};

		this._addText(panel, 'Channels', 'h3');
		this._channelsList = this._addNode(panel);
		this._channelNodes = {};

		this._targetNodes.none = this._addText(this._targetsList, "none");

		return panel;
	},

	_addChannel: function(channel) {
		if (!this._channelNodes[channel]) {
			this._channelNodes[channel] = this._addText(this._channelsList, "channel: " + channel);
		}
	},

	_removeChannel: function(channel) {
		this._channelNodes[channel] && this._channelsList.removeChild(this._channelNodes[channel]);
		delete this._channelNodes[channel];
	},

	_addTarget: function(target) {
		if (!this._targetNodes[target.channel]) {
			if (this._targetNodes.none) {
				this._targetsList.removeChild(this._targetNodes.none);
				delete this._targetNodes.none;
			}

			this._targetNodes[target.channel] = this._addText(this._targetsList, target.channel + " | " + target.url);
		}
	},

	_removeTarget: function(target) {
		this._targetNodes[target] && this._targetsList.removeChild(this._targetNodes[target]);
		delete this._targetNodes[target];
		if (!Object.keys(this._targetNodes).length) {
			this._targetNodes.none = this._addText(this._targetsList, "none");
		}
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

		if (target.panel === this.listClientsElement.panel) {
			this._client = new Client({});
			this._client.subscribe("ClientRegistered", this, "onClientRegistered")
			this._client.subscribe("ClientUnregistered", this, "onClientUnregistered")
			this._client.subscribe("TargetRegistered", this, "onTargetRegistered")
			this._client.subscribe("TargetUnregistered", this, "onTargetUnregistered")
			this._client.start();
		}

		target.addStyleClass("selected");
	},

	onClientRegistered: function(channel)
	{
		this._addChannel(channel);
	},

	onChannelUnregistered: function(channel) {
		this._removeChannel(channel);
	},

	onTargetRegistered: function(target)
	{
		this._addTarget(target);
	},

	onTargetUnregistered: function(target) {
		this._removeTarget(target);
	}
}
/*
 this._socket = new WebSocketXhr(this._url, this._id);
 this._socket.addEventListener("open", Binding(this, "_handleOpen"));
 this._socket.addEventListener("error", Binding(this, "_handleError"));
 this._socket.addEventListener("message", Binding(this, "_handleMessage"));
 return this._socket.addEventListener("close", Binding(this, "_handleClose"));

 */
WebInspector.RemoteView.prototype.__proto__ = WebInspector.View.prototype;

/**
 * @type {?WebInspector.RemoteView}
 */
WebInspector.remoteView = null;