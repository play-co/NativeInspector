/**
 * @constructor
 * @extends {WebInspector.Panel}
 */
WebInspector.RemotePanel = function()
{
	WebInspector.Panel.call(this, "remote");

	this._view = WebInspector.remoteView;
}

WebInspector.RemotePanel.prototype = {
	get toolbarItemLabel()
	{
		return WebInspector.UIString("Remote");
	},

	get statusBarItems()
	{
		return this._view.statusBarItems;
	},

	wasShown: function()
	{
		WebInspector.Panel.prototype.wasShown.call(this);
		if (WebInspector.drawer.visible) {
			WebInspector.drawer.hide(WebInspector.Drawer.AnimationType.Immediately);
			this._drawerWasVisible = true;
		}
		this._view.show(this.element);
	},

	willHide: function()
	{
		if (this._drawerWasVisible) {
			WebInspector.drawer.show(this._view, WebInspector.Drawer.AnimationType.Immediately);
			delete this._drawerWasVisible;
		}
		WebInspector.Panel.prototype.willHide.call(this);
	}
}

WebInspector.RemotePanel.prototype.__proto__ = WebInspector.Panel.prototype;
