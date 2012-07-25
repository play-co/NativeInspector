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

	WebInspector.connectSocket();
};

// debugger always enabled
Preferences.debuggerAlwaysEnabled = true;
// enable LiveEdit
Preferences.canEditScriptSource = true;
// enable heap profiler
Preferences.heapProfilerPresent = true;
