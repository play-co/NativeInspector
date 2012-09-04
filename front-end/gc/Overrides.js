// Initialize a counter indicating busy status of browser-side library
WebInspector.busyCtr = 0;

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
		InspectorFrontendHost.sendMessageToBackend = WebInspector.socket.send.bind(WebInspector.socket);

		if (!WebInspector.socketConnected) {
			WebInspector.socketConnected = true;

			WebInspector.doLoadedDone();
		}
	});

	WebInspector.socket.on('disconnect', function() {
		if (WebInspector.socketConnected) {
	        var msg = WebInspector.ConsoleMessage.create(
    	        WebInspector.ConsoleMessage.MessageSource.Other,
        	    WebInspector.ConsoleMessage.MessageLevel.Error,
            	"--- Disconnected from back-end server at http://" + window.location.host + "/.");
			WebInspector.console.addMessage(msg);
		}

		// If not busy (ie. in heap data analysis mode),
		if (WebInspector.busyCtr == 0) {
			// This is conditional so that it does not reset everything when
			// the browser disconnects during a heavy work period.
			WebInspector.socketConnected = false;
		}
		WebInspector.socket = io.connect("http://" + window.location.host + '/');
	});
}

WebInspector.loaded = function() {
	InspectorBackend.loadFromJSONIfNeeded();

	WebInspector.connectSocket();
};

// debugger always enabled
Preferences.debuggerAlwaysEnabled = true;
// enable LiveEdit
Preferences.canEditScriptSource = true;
// enable heap profiler
Preferences.heapProfilerPresent = true;
