WebInspector.connectSocket = function() {
	WebInspector.socketConnected = false;
	WebInspector.socket = io.connect("http://" + window.location.host + '/');

	WebInspector.socket.on('message', function(message) {
		if (message && message !== 'ping') {
			WebInspector.dispatch(message);
		}
	});

	WebInspector.socket.on('error', function(error) {
		if (WebInspector.socketConnected) {
        	var msg = WebInspector.ConsoleMessage.create(
            	WebInspector.ConsoleMessage.MessageSource.Other,
	            WebInspector.ConsoleMessage.MessageLevel.Error,
    	        "--- socket.io error : " + JSON.stringify(error));
			WebInspector.console.addMessage(msg);
		}
	});

	WebInspector.socket.on('connect', function() {
		WebInspector.socketConnected = true;

		InspectorFrontendHost.sendMessageToBackend = WebInspector.socket.send.bind(WebInspector.socket);
		WebInspector.doLoadedDone();
	});

	WebInspector.socket.on('disconnect', function() {
		if (WebInspector.socketConnected) {
	        var msg = WebInspector.ConsoleMessage.create(
    	        WebInspector.ConsoleMessage.MessageSource.Other,
        	    WebInspector.ConsoleMessage.MessageLevel.Error,
            	"--- Disconnected from back-end server at http://" + window.location.host + "/.");
			WebInspector.console.addMessage(msg);
		}

		WebInspector.socketConnected = false;
		WebInspector.socket = io.connect("http://" + window.location.host + '/');
	});
}

WebInspector.loaded = function() {
	InspectorBackend.loadFromJSONIfNeeded();

	//InspectorBackend.registerInspectorDispatcher();
	//InspectorBackend.registerDebuggerDispatcher("DebuggerModel");
	//InspectorBackend.registerProfilerDispatcher();

	WebInspector.connectSocket();
};

// debugger always enabled
Preferences.debuggerAlwaysEnabled = true;
// enable LiveEdit
Preferences.canEditScriptSource = true;
// enable heap profiler
Preferences.heapProfilerPresent = true;
/*
// patch new watch expression (default crashes node)
WebInspector.WatchExpressionsSection.NewWatchExpression = "''";

// enable ctrl+click for conditional breakpoints
WebInspector.SourceFrame.prototype._mouseDown = function(event)
{
  this._resetHoverTimer();
  this._hidePopup();
  if (event.button != 0 || event.altKey || event.metaKey)
      return;
  var target = event.target.enclosingNodeOrSelfWithClass("webkit-line-number");
  if (!target)
      return;
  var row = target.parentElement;

  var lineNumber = row.lineNumber;

  var breakpoint = this._textModel.getAttribute(lineNumber, "breakpoint");
  if (breakpoint) {
      if (event.shiftKey) {
          breakpoint.enabled = !breakpoint.enabled;
      }
      else if (!event.ctrlKey) {
          breakpoint.remove();
      }
  } else {
      this._addBreakpointDelegate(lineNumber + 1);
      breakpoint = this._textModel.getAttribute(lineNumber, "breakpoint");
  }
  if (breakpoint && event.ctrlKey) {
      this._editBreakpointCondition(breakpoint);
  }
  event.preventDefault();
};
*/
