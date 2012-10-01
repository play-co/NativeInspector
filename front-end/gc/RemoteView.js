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
	this.messages = [];
}

WebInspector.RemoteView.Events = {
	RemoteCleared: "remote-cleared",
	EntryAdded: "remote-entry-added",
}

WebInspector.RemoteView.prototype = {
	get statusBarItems()
	{
		return [];
	},

	filter: function(target, selectMultiple)
	{
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
	}
}

WebInspector.RemoteView.prototype.__proto__ = WebInspector.View.prototype;

/**
 * @type {?WebInspector.RemoteView}
 */
WebInspector.remoteView = null;