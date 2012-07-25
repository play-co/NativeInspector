var net = require('net');
var path = require('path');
var http = require('http');
var paperboy = require('paperboy');
var io = require('socket.io');
var child_process = require('child_process');
var urllib = require('url');

var BROWSER_PORT = 9888;
var DEBUG_PORT = 9222;
var CONTROL_PORT = 9889;
var WEBROOT = require('path').join(__dirname, 'front-end');


//// Class Framework
// Class.create and Function.bind

var Class = {
	create: function() {
		return function() {
			this.initialize.apply(this, arguments);
		}
	}
}

Function.prototype.bind = function(ctx) {
	var that = this;
	return function() {
		that.apply(ctx, arguments);
	}
}


//// SwaggerTagger
// Assigns ID numbers to objects

SwaggerTagger = Class.create();

SwaggerTagger.prototype.initialize = function() {
	this.id = 1;
	this.users = {};
}

SwaggerTagger.prototype.find = function(user) {
	for (n in this.users) {
		if (this.users[n] === user) {
			return n;
		}
	}

	return null;
}

SwaggerTagger.prototype.tag = function(user) {
	var tag = this.find(user);
	if (tag !== null) {
		return tag;
	}

	var id = this.id++;
	this.users[id] = user;

	return id;
}

SwaggerTagger.prototype.kill = function(user) {
	var tag = this.find(user);

	if (tag !== null) {
		delete this.users[tag];
	}
}

SwaggerTagger.prototype.clear = function() {
	delete this.users;
	this.users = {};
}


//// PubSub Model
// Allows for event broadcasting

PubEvent = Class.create();

PubEvent.prototype.initialize = function() {
	this.subscribers = {};
}

PubEvent.prototype.subscribe = function(tag, cb) {
	this.subscribers[tag] = cb;
}

PubEvent.prototype.unsubscribe = function(tag) {
	if (this.subscribers[tag]) {
		delete this.subscribers[tag];
	}
}

PubEvent.prototype.trigger = function(msg) {
	for (sub in this.subscribers) {
		(this.subscribers[sub])(msg);
	}
}


PubSub = Class.create();

PubSub.prototype.initialize = function() {
	this.events = {};
	this.tagger = new SwaggerTagger();
}

PubSub.prototype.getEvent = function(evt) {
	var e = this.events[evt];

	// If it does not exist yet,
	if (!e) {
		// Create it
		e = new PubEvent();

		this.events[evt] = e;
	}

	return e;
}

PubSub.prototype.subscribe = function(user, name, cb) {
	var tag = this.tagger.tag(user);

	var e = this.getEvent(name);

	e.subscribe(tag, cb);
}

PubSub.prototype.unsubscribe = function(user) {
	var tag = this.tagger.tag(user);

	if (tag !== null) {
		for (e in this.events) {
			this.events[e].unsubscribe(tag);
		}

		this.tagger.kill(user);
	}
}

PubSub.prototype.publish = function(name, msg) {
	var e = this.getEvent(name);

	e.trigger(msg);
}


//// Web Server
// Serves the web inspector page for the browser

function log(statCode, url, ip, err) {
  var logStr = statCode + ' - ' + url + ' - ' + ip;
  if (err)
    logStr += ' - ' + err;
  console.log(logStr);
}

var myAwesomeHTTPD = http.createServer(function(req, res) {
	var ip = req.connection.remoteAddress;

	paperboy
		.deliver(WEBROOT, req, res)
		.addHeader('Cache-Control', 'no-cache')
		.addHeader('Expires', '-1')
		.after(function(statCode) {
			//log(statCode, req.url, ip);
		})
		.error(function(statCode, msg) {
			res.writeHead(statCode, {'Content-Type': 'text/plain'});
			res.end("!!ERROR!! Status code: " + statCode + " for URL: " + req.url);
			log(statCode, req.url, ip, msg);
		})
		.otherwise(function(err) {
			res.writeHead(404, {'Content-Type': 'text/plain'});
			res.end("!!ERROR!! File not found: " + req.url);
			log(404, req.url, ip, err);
		});
});


//// Control Server
// Allows the debug session and web inspector to be controlled programmatically

ControlServer = Class.create();

ControlServer.prototype.initialize = function(client) {
	this.sessions = new Array();
	this.client = client;

	var ws = io.listen(CONTROL_PORT);

	ws.configure(function() {
		ws.set('transports', ['websocket']);
		ws.set('log level', 0); // Change this to reduce log spam
	});

	ws.sockets.on('connection', this._on_conn.bind(this));

	console.log('Inspect: Listening for controllers');
}

ControlServer.prototype._on_conn = function(socket) {
	this.sessions.push(new ControlSession(socket, this, this.client));
}

ControlServer.prototype._on_disco = function(sessionIndex) {
	var ii = this.sessions.indexOf(session);
	if (ii != -1) {
		this.sessions.splice(ii, 1);
	}
}

ControlServer.prototype.broadcastEvent = function(name, data) {
	for (session in this.sessions) {
		this.sessions[session].sendEvent(name, data);
	}
}


//// Control Session
// Connexion with a control client

ControlSession = Class.create();

ControlSession.prototype.initialize = function(socket, server, client) {
	console.log('Inspect: Controller connected');

	this.socket = socket;
	this.server = server;
	this.client = client;

	// Subscribe to events from the web browser
	socket.on('message', this.message.bind(this));
	socket.on('disconnect', this.disconnect.bind(this));

	// Prime the ping pump
	this.onPingTimer();
}

ControlSession.prototype.onPingTimer = function() {
	this.sendEvent('ping', 'wazaaaa');

	this.pingTimeout = setTimeout(this.onPingTimer.bind(this), 30000);
}

ControlSession.prototype.message = function(data_str) {
	var data = JSON.parse(data_str);

	switch (data.name) {
	case 'log':
		console.log('Inspect: Log message ', JSON.stringify(data));
		break;
	}
}

ControlSession.prototype.sendEvent = function(name, data) {
	console.log('Inspect: Control sending event ', name);

	this.socket.send({
		name: name,
		data: data
	});
}

ControlSession.prototype.disconnect = function() {
	console.log('Inspect: Controller disconnected');

	if (this.pingTimeout) {
		clearTimeout(this.pingTimeout);
	}

	this.server._on_disco(this);
}


//// Browser Server
// Server for backend Web Inspector JavaScript

BrowserServer = Class.create();

BrowserServer.prototype.initialize = function(app, client) {
	this.sessions = new Array();
	this.client = client;

	var ws = io.listen(app);

	ws.configure(function() {
		ws.set('transports', ['websocket']);
		ws.set('log level', 0); // Change this to reduce log spam
	});

	ws.sockets.on('connection', this._on_conn.bind(this));

	console.log("Inspect: Listening for browsers");
}

BrowserServer.prototype._on_conn = function(socket) {
	this.sessions.push(new BrowserSession(socket, this, this.client));
}

BrowserServer.prototype._on_disco = function(session) {
	var ii = this.sessions.indexOf(session);
	if (ii != -1) {
		this.sessions.splice(ii, 1);
	}
}

BrowserServer.prototype.broadcastEvent = function(name, data) {
	for (session in this.sessions) {
		this.sessions[session].sendEvent(name, data);
	}
}


//// Browser Console Events

BrowserServer.prototype.addConsoleMessage = function(level, text) {
	this.broadcastEvent("Console.messageAdded", {
		message: {
			source: "network",
			level: level,
			text: text,
			type: "",
			url: "",
			line: "",
			repeatCount: 0
			//parameters: undefined
			//stackTrace: undefined
			//networkRequestId: undefined
		}
	});
}

BrowserServer.prototype.clearConsoleMessages = function() {
	this.broadcastEvent("Console.messagesCleared");
}


//// Object serialization protocol for V8 debug server

function getRemoteObject(obj) {
	var result = {
		type: obj.type,
		className: obj.className,
		description: obj.text || obj.value,
		objectId: "0:0:" + obj.handle,
		value: obj.value || obj.text
	};

	switch (obj.type) {
	case "object":
		result.description = obj.className || "Object";
		break;
	case "function":
		result.description = obj.text || "function()";
	}

	return result;
}

function simpleRemoteObject(obj) {
	return obj.value || obj.text;
}

function reconstructObject(resp) {
	// Convert refs array into a set
	var refs = {};
	if (resp.refs) {
		for (var ii = 0; ii < resp.refs.length; ++ii) {
			var r = resp.refs[ii];
			refs[r.handle] = r;
		}
	}

	// Get an array of object properties
	var profile = {};
	if (resp.body && resp.body.properties) {
		for (var ii = 0; ii < resp.body.properties.length; ++ii) {
			var p = resp.body.properties[ii];
			profile[p.name] = simpleRemoteObject(refs[p.ref]);
		}
	}

	return profile;
}

function joinData(container) {
	var data = '';

	var len = container.length;
	if (len) {
		for (var ii = 0; ii < len; ++ii) {
			data += container[ii];
		}
	}

	return data;
}

function makeScriptInfo(script) {
	var scriptName = (script.name === undefined) ? "(unnamed)" : String(script.name);
	var sharedOffset = scriptName.indexOf("/shared");
	var isContentScript = (sharedOffset == -1) || (sharedOffset > 2);

	return {
		scriptId: String(script.id),
		url: scriptName,
		startLine: script.lineOffset,
		startColumn: script.columnOffset,
		endLine: script.lineCount,
		endColumn: 0,
		isContentScript: isContentScript,
		sourceMapURL: scriptName 
	};
}



//// Browser Session
// Connexion with backend Web Inspector JavaScript

BrowserSession = Class.create();

BrowserSession.prototype.initialize = function(socket, server, client) {
	console.log('Inspect: Browser connected');

	this.socket = socket;
	this.server = server;
	this.client = client;
	this.pingTimeout = null;
	this.last_id = null; // For fast response path
	this.loaded = false;
	this.connected = false;

	this.handler = new BrowserHandler();

	// Subscribe to events from the debugger client
	client.pubsub.subscribe(this, "connect", this.onDebuggerConnect.bind(this));
	client.pubsub.subscribe(this, "close", this.onDebuggerClose.bind(this));

	// Manually invoke onDebuggerConnect() if already connected before browser (common case)
	if (client.connected) {
		this.onDebuggerConnect();
	}

	// Subscribe to events from the web browser
	socket.on('message', this.message.bind(this));
	socket.on('disconnect', this.disconnect.bind(this));

	// Push-start ping processor
	this.onPingTimer();
}

BrowserSession.prototype.onDebuggerConnect = function() {
	console.log("Inspect: Browser notified of debugger connect");

	if (!this.connected) {
		this.connected = true;

		if (this.loaded) {
			this.addConsoleMessage("info", "--- Device reconnected.");

			this.onLoadAndDebug();
		}
	}
}

function convertCallFrames(frames) {
	var result = [];

	// If there are any frames,
	if (frames) {
		for (var ii = 0; ii < frames.length; ++ii) {
			var frame = frames[ii];

			if (frame.type === "frame") {
				var frame_result = {
					callFrameId: "0",
					functionName: frame.func.inferredName,
					location: {
						columnNumber: frame.column,
						lineNumber: frame.line,
						scriptId: String(frame.func.scriptId)
					},
					scopeChain: []
				};

				for (var jj = 0; jj < frame.scopes.length; ++jj) {
					var scope = frame.scopes[jj];
					var scope_result = {
						object: {
							description: "Scope Index " + frame.index,
							objectId: frame.index + ":" + scope.index + ":backtrace"
						}
					};

					switch (scope.type) {
					case 0:
						scope_result.type = 'global';
						break;
					case 1:
						scope_result.type = 'local';
						frame_result.this = {
							type: "object",
							className: frame.receiver.className,
							description: frame.receiver.className,
							objectId: frame.index + ":" + scope.index + ":" + frame.receiver.ref
						};
						break;
					case 2:
						scope_result.type = 'with';
						break;
					case 3:
						scope_result.type = 'closure';
						break;
					case 4:
						scope_result.type = 'catch';
					}

					frame_result.scopeChain.push(scope_result);
				}

				result.push(frame_result);
			}
		}
	}

	return result;
}

BrowserSession.prototype.resetPanels = function() {
	// Clear scripts view
	this.sendEvent("Debugger.globalObjectCleared");

	// Clear profiles view
	this.sendEvent("Profiler.resetProfiles");
}

BrowserSession.prototype.onDebuggerClose = function() {
	console.log("Inspect: Browser notified of debugger close");

	if (this.connected) {
		this.connected = false;

		if (this.loaded) {
			this.addConsoleMessage("error", "--- Device disconnected.");

			this.resetPanels();
		}
	}
}

BrowserSession.prototype.onPingTimer = function() {
	this.socket.send('ping');

	this.pingTimeout = setTimeout(this.onPingTimer.bind(this), 30000);
}

BrowserSession.prototype.message = function(req_str) {
	var req = JSON.parse(req_str);

	if (req && req.method) {
		var f = this.handler[req.method];

		if (req.id) {
			this.last_id = req.id;
		} else {
			this.last_id = null;
		}

		// If method is handled,
		if (typeof(f) === 'function') {
			var result = f.apply(this, [req]);
		} else {
			if (req.method.indexOf("Debugger") != -1) {
				console.log('Inspect: Unhandled ', req.method, " : ", JSON.stringify(req, undefined, 4));
			} else if (req.method.indexOf("Runtime") != -1) {
				console.log('Inspect: Unhandled ', req.method);
			} else if (req.method.indexOf("Profiler") != -1) {
				console.log('Inspect: Unhandled ', req.method, " : ", JSON.stringify(req, undefined, 4));
			}
		}
	} else {
		console.log('Inspect: Non-method message ', JSON.stringify(req));
	}
}

BrowserSession.prototype.sendResponse = function(id, data) {
	if (data === undefined) {
		data = {};
	}

	this.socket.send(JSON.stringify({
		id: id,
		result: data
	}));
}

BrowserSession.prototype.sendEvent = function(name, data) {
	if (data === undefined) {
		data = {};
	}

	this.socket.send(JSON.stringify({
		type: 'event',
		method: name,
		params: data
	}));
}

BrowserSession.prototype.sendProfileHeader = function(title, uid, type) {
	this.server.broadcastEvent("Profiler.addProfileHeader", {
		header: {
			title: title,
			uid: uid,
			typeId: type
		}
	});

	console.log("Inspect: Sending profile header: " + title + " #" + uid + " type " + type);
}

// Called whenever loaded and connected just became true, from any other state arriving in any order
BrowserSession.prototype.onLoadAndDebug = function() {
	this.resetPanels();

	this.client.listBreakpoints(function(obj) {
		var breakpoints = obj.body.breakpoints;
		for (var ii = 0; ii < breakpoints.length; ++ii) {
			this.client.clearBreakpoint(breakpoints[ii].number, function(resp) {
				// Ignore response
			}.bind(this));
		}
	}.bind(this));

	this.client.exitBreak(function(obj) {
		// Ignore response
	}.bind(this));

	this.client.getScripts(function(obj) {
		for (var ii = 0, len = obj.body.length; ii < len; ++ii) {
			this.sendEvent("Debugger.scriptParsed", makeScriptInfo(obj.body[ii]));
		}
	}.bind(this));

	this.sendProfileHeaders();

	// Print banner
	this.client.version(function(resp) {
		this.addConsoleMessage("info", "--- Initialization procedures completed.  Device uses V8 version " + resp.body.V8Version + ".");
	}.bind(this));
}

BrowserSession.prototype.onLoad = function() {
	if (!this.loaded) {
		this.loaded = true;

		this.addConsoleMessage("info", "The Native Web Inspector allows you to debug and profile JavaScript code running live on a device.");
		this.addConsoleMessage("info", "The application must have been built with the --debug flag.");
		this.addConsoleMessage("info", "And it can only debug one application at a time, so be sure to force close other debug-mode applications.");

		if (this.connected) {
			this.addConsoleMessage("info", "--- Device is connected.");

			this.onLoadAndDebug();
		} else {
			this.addConsoleMessage("error", "--- Device is not connected yet.");
		}
	}
}

BrowserSession.prototype.disconnect = function() {
	console.log('Inspect: Browser disconnected');

	if (this.pingTimeout) {
		clearTimeout(this.pingTimeout);
	}

	this.client.pubsub.unsubscribe(this);

	this.server._on_disco(this);
}


//// Browser Console Events

BrowserSession.prototype.addConsoleMessage = function(level, text) {
	this.sendEvent("Console.messageAdded", {
		message: {
			source: "network",
			level: level,
			text: text,
			type: "",
			url: "",
			line: "",
			repeatCount: 0
			//parameters: undefined
			//stackTrace: undefined
			//networkRequestId: undefined
		}
	});
}

BrowserSession.prototype.clearConsoleMessages = function() {
	this.sendEvent("Console.messagesCleared");
}


//// Browser Message Handler
// Contains all of the message handlers for messages from the browser
// Functions are called with 'this' pointing at the BrowserSession

BrowserHandler = Class.create();

BrowserHandler.prototype.initialize = function() {
}


//// Runtime Messages

BrowserHandler.prototype["Runtime.releaseObjectGroup"] = function(req) {
	this.sendResponse(req.id);
}

BrowserHandler.prototype["Runtime.evaluate"] = function(req) {
	this.client.evaluate(req.params.expression, null, function(resp) {
		// If evaulation succeeded,
		if (resp.success) {
			this.sendResponse(req.id, {
				result: getRemoteObject(resp.body),
				wasThrown: false
			});
		} else {
			this.sendResponse(req.id, {
				result: {
					type: "error",
					description: resp.message
				},
				wasThrown: true
			});
		}
	}.bind(this));
}

BrowserHandler.prototype["Runtime.callFunctionOn"] = function(req) {
	var func = req.params.functionDeclaration;
	var args = req.params.arguments;
	var tokens = req.params.objectId.split(':');
	var frame = +tokens[0], scope = +tokens[1], ref = tokens[2];

	// NOTE: Does not seem to be necessary
}

BrowserHandler.prototype["Runtime.getProperties"] = function(req) {
	var tokens = req.params.objectId.split(':');
	var frame = +tokens[0], scope = +tokens[1], ref = tokens[2];

	if (ref === "backtrace") {
		this.client.scope(scope, frame, function(resp) {
			// Convert refs array into a set
			var refs = {};
			if (resp.refs) {
				for (var ii = 0; ii < resp.refs.length; ++ii) {
					var r = resp.refs[ii];
					refs[r.handle] = r;
				}
			}

			// Get an array of object properties
			var objects = [];
			if (resp.body && resp.body.object && resp.body.object.properties) {
				for (key in resp.body.object.properties) {
					var property = resp.body.object.properties[key];

					var p = {
						name: String(property.name),
						value: getRemoteObject(refs[property.value.ref])
					};

					objects.push(p);
				}
			}

			this.sendResponse(req.id, {result: objects});
		}.bind(this));
	} else {
		var handle = +ref;

		this.client.lookup([handle], function(resp) {
			// Convert refs array into a set
			var refs = {};
			if (resp.refs) {
				for (var ii = 0; ii < resp.refs.length; ++ii) {
					var r = resp.refs[ii];
					refs[r.handle] = r;
				}
			}

			// Get an array of object properties
			var objects = [];
			if (resp.body && resp.body[handle]) {
				var obj = resp.body[handle];

				if (obj.properties) {
					for (var ii = 0; ii < obj.properties.length; ++ii) {
						var property = obj.properties[ii];

						var p = {
							name: String(property.name),
							value: getRemoteObject(refs[property.ref])
						};

						objects.push(p);
					}
				}
			
				if (obj.protoObject) {
					objects.push({
						name: "__proto__",
						value: getRemoteObject(refs[obj.protoObject.ref])
					});
				}
			}

			this.sendResponse(req.id, {result: objects});
		}.bind(this));
	}
}


//// Debugger Messages

BrowserHandler.prototype["Debugger.causesRecompilation"] = function(req) {
	this.sendResponse(req.id, {result: false});
}

BrowserHandler.prototype["Debugger.supportsNativeBreakpoints"] = function(req) {
	this.sendResponse(req.id, {result: true});
}

BrowserHandler.prototype["Debugger.supportsSeparateScriptCompilationAndExecution"] = function(req) {
	this.sendResponse(req.id, {result: false});
}

BrowserHandler.prototype["Debugger.setOverlayMessage"] = function(req) {
	this.sendResponse(req.id);

	// NOTE: Seems unnecessary
}

BrowserHandler.prototype["Debugger.canSetScriptSource"] = function(req) {
	this.sendResponse(req.id, {result: true});
}

BrowserHandler.prototype["Debugger.setScriptSource"] = function(req) {
	this.client.changeLive(req.params.scriptId, false, req.params.scriptSource, function(resp) {
		this.sendResponse(req.id);

		if (!resp.success) {
			// NOTE: This won't work if we're paused at a breakpoint -- script becomes desynchronized
			this.addConsoleMessage("error", "--- Editing source while at a breakpoint is not supported.  Please refresh the page to resynchronize.");
		}
	}.bind(this));
}

BrowserHandler.prototype["Page.canOverrideDeviceMetrics"] = function(req) {
	this.sendResponse(req.id, {result: false});

	// Trigger onLoad event
	this.onLoad();
}

BrowserHandler.prototype["Debugger.enable"] = function(req) {
	console.log("Inspect: Enabled Debugger");
	this.sendResponse(req.id);
}

BrowserHandler.prototype["Debugger.disable"] = function(req) {
	console.log("Inspect: Ignored request to disable debugger");
	this.sendResponse(req.id);
}

BrowserHandler.prototype["Debugger.setPauseOnExceptions"] = function(req) {
	var state = req.params.state;

	console.log("Inspect: setPauseOnExceptions(", state, ")");

	var type = state, enabled = true;

	if (state == 'none') {
		type = 'uncaught';
		enabled = false;
	}

	this.client.setExceptionBreak(type, enabled, function(obj) {
		this.sendResponse(req.id);
	}.bind(this));
}

BrowserHandler.prototype["Debugger.setBreakpointsActive"] = function(req) {
	var active = req.params.active;

	console.log("Inspect: setBreakpointsActive(", active, ")");

	this.client.breakpointsActive = active;

	this.sendResponse(req.id);
}

BrowserHandler.prototype["Debugger.setBreakpointByUrl"] = function(req) {
	var bp = req.params;

	this.client.setBreakpointByUrl(bp.lineNumber, bp.url, bp.columnNumber, true, bp.condition, function(resp) {
		var actual = resp.body.actual_locations;
		var locations = [];
		for (var ii = 0; ii < actual.length; ++ii) {
			locations.push({
				lineNumber: actual[ii].line,
				columnNumber: actual[ii].column,
				scriptId: String(actual[ii].script_id)
			});
		}
		this.sendResponse(req.id, {
			breakpointId: String(resp.body.breakpoint),
			locations: locations
		});
	}.bind(this));
}

BrowserHandler.prototype["Debugger.removeBreakpoint"] = function(req) {
	var id = req.params.breakpointId;

	this.client.clearBreakpoint(id, function(resp) {
		this.sendResponse(req.id);
	}.bind(this));
}

BrowserHandler.prototype["Debugger.stepInto"] = function(req) {
	this.client.resume('in', 1, function(resp) {
		this.sendResponse(req.id);
	}.bind(this));
}

BrowserHandler.prototype["Debugger.stepOver"] = function(req) {
	this.client.resume('next', 1, function(resp) {
		this.sendResponse(req.id);
	}.bind(this));
}

BrowserHandler.prototype["Debugger.stepOut"] = function(req) {
	this.client.resume('out', 1, function(resp) {
		this.sendResponse(req.id);
	}.bind(this));
}

BrowserHandler.prototype["Debugger.pause"] = function(req) {
	this.client.breakpointsActive = true;

	this.client.suspend(function(resp) {
		this.sendResponse(req.id);
	}.bind(this));
}

BrowserHandler.prototype["Debugger.resume"] = function(req) {
	this.client.exitBreak(function(resp) {
		this.sendResponse(req.id);
		this.server.broadcastEvent("Debugger.resumed");
	}.bind(this));
}

BrowserHandler.prototype["Debugger.evaluateOnCallFrame"] = function(req) {
	this.client.evaluate(req.params.expression, req.params.callFrameId, function(resp) {
		// If evaulation succeeded,
		if (resp.success) {
			this.sendResponse(req.id, {
				result: getRemoteObject(resp.body),
				wasThrown: false
			});
		} else {
			this.sendResponse(req.id, {
				result: {
					type: "error",
					description: resp.message
				},
				wasThrown: true
			});
		}
	}.bind(this));
}

BrowserHandler.prototype["Debugger.getScriptSource"] = function(req) {
	var scriptId = req.params.scriptId;

	this.client.getScriptSource(scriptId, function(resp) {
		if (!resp.success || !resp.body[0] || !resp.body[0].source) {
			this.sendResponse(req.id, {
				scriptSource: "Unable to load source file.  Try reloading the page"
			});
		} else {
			// Other info ignored: lineOffset, script name, line count
			var source = resp.body[0].source;

			this.sendResponse(req.id, {
				scriptSource: source
			});
		}
	}.bind(this));
}


//// Profiler Messages

BrowserHandler.prototype["Profiler.causesRecompilation"] = function(req) {
	this.sendResponse(req.id, {result: false});
}

BrowserHandler.prototype["Profiler.isSampling"] = function(req) {
	this.sendResponse(req.id, {result: true});
}

BrowserHandler.prototype["Profiler.hasHeapProfiler"] = function(req) {
	this.sendResponse(req.id, {result: true});
}

BrowserHandler.prototype["Profiler.enable"] = function(req) {
	console.log("Inspect: Enabled Profiler");
	this.sendResponse(req.id);
}

BrowserHandler.prototype["Profiler.start"] = function(req) {
	var uid = this.client.profileCache.getNextUid('CPU');
	var title = "org.webkit.profiles.user-initiated." + uid;
	this.activeTitle = title;

	console.log("Inspect: Start profiling " + title);

	this.client.evaluate('PROFILER.cpuProfiler.startProfiling("' + title + '")', null, function(resp) {
		this.server.broadcastEvent("Profiler.setRecordingProfile", {
			isProfiling: resp.success
		});
	}.bind(this));
}

BrowserHandler.prototype["Profiler.stop"] = function(req) {
	var title = this.activeTitle;

	console.log("Inspect: Stop profiling " + title);

	if (title) {
		this.activeTitle = null;

		this.client.evaluate('PROFILER.cpuProfiler.stopProfiling("' + title + '")', null, function(resp) {
			this.server.broadcastEvent("Profiler.setRecordingProfile", {
				isProfiling: false
			});

			if (resp.success) {
				var obj = reconstructObject(resp);
				var data = JSON.parse(joinData(obj));

				this.client.profileCache.gotHeader('CPU', obj.uid, obj.title);
				this.client.profileCache.set('CPU', obj.uid, data);

				this.sendProfileHeader(obj.title, obj.uid, 'CPU');
			}
		}.bind(this));
	}
}

BrowserSession.prototype.sendProfileHeaders = function() {
	this.client.evaluate("PROFILER.cpuProfiler.getProfileHeaders()", null, function(resp) {
		var obj = reconstructObject(resp);

		console.log("Inspect: Got " + obj.length + " profile headers");

		for (var ii = 0, len = obj.length; ii < len; ++ii) {
			var profile = JSON.parse(obj[ii]);

			this.client.profileCache.gotHeader(profile.typeId, profile.uid, profile.title);

			this.sendProfileHeader(profile.title, profile.uid, profile.typeId);
		}
	}.bind(this));

	// TODO: HEAP
}

BrowserHandler.prototype["Profiler.getProfileHeaders"] = function(req) {
	console.log("Inspect: Get profile headers - ignored.  This is done on load");

	// This is actually not the time to send these.  They should be sent
	// on reconnect so that reconnection is handled properly
}

BrowserHandler.prototype["Profiler.getProfile"] = function(req) {
	console.log("Inspect: Get " + req.params.type + " profile #" + req.params.uid);

	var profile = this.client.profileCache.get(req.params.type, req.params.uid);

	if (profile) {
		if (req.params.type === "CPU") {
			this.sendResponse(req.id, {
				"profile": {
					"head": profile
				}
			});
		} else if (req.params.type === "HEAP") {
			this.sendEvent("Profiler.addHeapSnapshotChunk", {
				uid: profile.snapshot.uid,
				chunk: JSON.stringify(profile)
			});
			this.sendEvent("Profiler.finishHeapSnapshot", {
				uid: profile.snapshot.uid
			});
		}
	} else {
		if (req.params.type === "CPU") {
			this.client.evaluate("PROFILER.cpuProfiler.getProfile(" + req.params.uid + ")", null, function(resp) {
				var obj = reconstructObject(resp);
				var data = JSON.parse(joinData(obj));

				this.sendResponse(req.id, {
					"profile": {
						"head": data
					}
				});

				this.client.profileCache.set(req.params.type, req.params.uid, data);
			}.bind(this));
		} else if (req.params.type === "HEAP") {
			this.client.evaluate("PROFILER.heapProfiler.getProfile(" + req.params.uid + ")", null, function(resp) {
				var obj = reconstructObject(resp);
				var data = JSON.parse(joinData(obj));

				this.sendResponse(req.id, {
					"profile": {
						"head": data
					}
				});

				this.client.profileCache.set(req.params.type, req.params.uid, data);
			}.bind(this));
		}
	}
}

BrowserHandler.prototype["Profiler.removeProfile"] = function(req) {
	console.log("Inspect: Remove profile is not supported by V8");
}

BrowserHandler.prototype["Profiler.clearProfiles"] = function(req) {
	console.log("Inspect: Clear profiles");

	this.client.evaluate("PROFILER.cpuProfiler.deleteAllProfiles()", null, function(resp) {
		this.sendResponse(req.id);
	}.bind(this));

	this.client.evaluate("PROFILER.heapProfiler.deleteAllSnapshots()", null, function(resp) {
		this.sendResponse(req.id);
	}.bind(this));
}

BrowserHandler.prototype["Profiler.takeHeapSnapshot"] = function(req) {
	this.sendResponse(req.id);

	var title = req.params.title;
	console.log("Inspect: Taking heap snapshot " + title);

	this.sendEvent("Profiler.reportHeapSnapshotProgress", {
		done: 10,
		total: 100
	});

	this.client.evaluate('PROFILER.heapProfiler.takeSnapshot("' + title +'")', null, function(resp) {
		console.log("Inspect: Heap snapshot response received.  Repackaging snapshot...");

		this.sendEvent("Profiler.reportHeapSnapshotProgress", {
			done: 70,
			total: 100
		});

		var obj = reconstructObject(resp);
		var str = joinData(obj);
		var data = JSON.parse(str);

		this.sendEvent("Profiler.reportHeapSnapshotProgress", {
			done: 100,
			total: 100
		});

		this.sendProfileHeader(title, data.snapshot.uid, "HEAP");

		this.client.profileCache.set('HEAP', data.snapshot.uid, data);

		console.log("Inspect: Heap snapshot repackaged (" + str.length + " bytes).  Sent profile header to browser");
	}.bind(this));
}

BrowserHandler.prototype["Profiler.getObjectByHeapObjectId"] = function(req) {
	console.log("Inspect: Ignored heap object request.  Not implemented");

	// NOTE: Seems unnecessary
}

BrowserHandler.prototype["Profiler.disable"] = function(req) {
	console.log("Inspect: Ignored request to disable profiler");

	this.sendResponse(req.id);
}


//// Response Callbacks
// Ties a message identifier with a callback

ResponseCallbacks = Class.create();

ResponseCallbacks.prototype.initialize = function() {
	this.id = 1;
	this.callbacks = {};
}

ResponseCallbacks.prototype.insert = function(cb) {
	var id = this.id++;

	this.callbacks[id] = cb;

	return id;
}

ResponseCallbacks.prototype.run = function(id, msg) {
	var cb = this.callbacks[id];

	if (cb) {
		cb(msg);
	}

	delete this.callbacks[id];
}

ResponseCallbacks.prototype.clear = function() {
	this.callbacks = {};
}


//// Deframer
// Interprets framing in the V8 debug protocol

// Header-Blah: Value
// Content-Length: 12
//
// DataDataData

// Deframe will parse this into { headers: [], content }

Deframer = Class.create();

Deframer.prototype.initialize = function(callback) {
	this.callback = callback;
	this.clear();
}

// Eat everything up to and including \r\n\r\n
Deframer.prototype.processHeaders = function() {
	var buffer = this.buffer;
	if (buffer) {
		// Hunt for end of headers
		for (var ii = 0, len = buffer.length - 3; ii < len; ++ii) {

			// If the end marker was found,
			if (buffer[ii] == 13 &&
				buffer[ii+1] == 10 &&
				buffer[ii+2] == 13 &&
				buffer[ii+3] == 10)
			{
				if (ii < 16) {
					console.log("Inspect: !!WARNING!! Invalid frame header; delimiter found too soon");
				}

				// Split header data into lines
				var lines = buffer.slice(0, ii).toString('utf8').split('\r\n');

				// Parse lines into key-value pairs
				this.headers = {};
				for (var jj = 0; jj < lines.length; ++jj) {
					var pair = lines[jj].split(/: +/);

					this.headers[pair[0]] = pair[1];
				}

				// Grab content length or zero
				this.contentLength = +this.headers['Content-Length'];
				this.offset = ii + 4;

				this.syntaxProcessor = this.processContent;
				this.processContent();
				break;
			}
		}
	}
}

Deframer.prototype.processContent = function() {
	var buffer = this.buffer;
	if (buffer) {
		var bufferRemaining = buffer.length - this.offset;

		if (bufferRemaining >= this.contentLength) {
			// Convert content into a JavaScript object
			var content;
			if (this.contentLength > 0) {
				var str = buffer.slice(this.offset, this.offset + this.contentLength).toString('utf8');
				try {
					content = JSON.parse(str);
				} catch (err) {
					console.log("Invalid JSON in response: " + str);
					content = {};
				}
			} else {
				content = {};
			}

			this.callback({
				headers: this.headers,
				content: content
			});

			// Remove this data from the front of the buffer to keep buffer at a reasonable size
			bufferRemaining -= this.contentLength;
			if (bufferRemaining > 0) {
				var nbuffer = new Buffer(bufferRemaining);
				buffer.copy(nbuffer, 0, this.offset + this.contentLength, this.offset + this.contentLength + bufferRemaining);
				this.buffer = nbuffer;
			} else {
				this.buffer = null;
			}

			this.syntaxProcessor = this.processHeaders;

			// Process it if it is there
			this.processHeaders();
		}
	}
}

Deframer.prototype.push = function(data) {
	if (this.buffer) {
		// Append to end of buffer
		var nbuffer = new Buffer(this.buffer.length + data.length);
		this.buffer.copy(nbuffer);
		data.copy(nbuffer, this.buffer.length);
		this.buffer = nbuffer;
	} else {
		this.buffer = data;
	}

	this.syntaxProcessor();
}

Deframer.prototype.clear = function() {
	this.buffer = null;
	this.syntaxProcessor = this.processHeaders;
}


//// ProfileCache
// Cached results from the connected debugger

ProfileCache = Class.create();

ProfileCache.prototype.initialize = function() {
	this.clear();
}

ProfileCache.prototype.get = function(type, uid) {
	return this.cache[type][uid];
}

ProfileCache.prototype.set = function(type, uid, data) {
	this.cache[type][uid] = data;
}

ProfileCache.prototype.getNextUid = function(type) {
	return this.nextUID[type]++;
}

ProfileCache.prototype.gotHeader = function(type, uid, title) {
	if (this.nextUID[type] <= uid) {
		this.nextUID[type] = uid + 1;
	}
}

ProfileCache.prototype.clear = function() {
	this.cache = {
		'CPU': {
		},
		'HEAP': {
		}
	};

	this.nextUID = {
		'CPU': 1,
		'HEAP': 1
	};
}


//// Debug Client
// V8 debug protocol client

Client = Class.create();

Client.prototype.initialize = function(httpd) {
	this.httpd = httpd;

	this.callbacks = new ResponseCallbacks();
	this.pubsub = new PubSub();
	this.deframe = new Deframer(this.message.bind(this));
	this.profileCache = new ProfileCache();

	this.connecting = true;
	this.connected = false;
	this.breakpointsActive = true;

	// Set up socket
	var s = new net.Socket({type: "tcp4"});
	this.socket = s;
	s.on('error', this.error.bind(this));
	s.on('connect', this.connect.bind(this));
	s.on('data', this.data.bind(this));
	s.on('close', this.close.bind(this));
	s.connect(DEBUG_PORT);

	// One browser server accepting multiple browsers
	this.browserServer = new BrowserServer(httpd, this);

	// One control server accepting multiple control connexions
	this.controlServer = new ControlServer(this.browserServer, this);

	console.log("Inspect: Debug client started");
}

Client.prototype.error = function(e) {
	//console.log("Inspect: Debug client error ", JSON.stringify(e));
	if (e.errno === "ECONNREFUSED" && e.syscall === "connect") {
		// NOTE: This also indicates that the USB plug is not connected, but in
		// practice it does not really take any extra CPU time
		child_process.spawn('adb', ['forward', 'tcp:9222', 'tcp:9222']);
	}
}

Client.prototype.connect = function() {
	// This does not mean much because if the cellphone is not running an app
	// with debugging turned on it will connect and then immediately disco.
	// Need to wait for 'connect' message to arrive
}

Client.prototype.data = function(data) {
	this.deframe.push(data);
}

Client.prototype.message = function(msg) {
	// If message is the initial connect notification,
	if (msg.headers.Type == 'connect') {
		// If not already connected,
		if (!this.connected) {
			console.log("Inspect: Debug client connected");

			// Flush profile cache
			this.profileCache.clear();

			// Notify browser sessions
			this.connected = true;
			this.pubsub.publish('connect', msg);
		}
	} else {
		var obj = msg.content || {};

		switch (obj.type) {
		case 'response':
			// If response indicates a failure,
			if (!obj.success) {
				console.log("Inspect: Debug server error response ", obj.message);
			}

			// Pass it to the appropriate callback
			this.callbacks.run(obj.request_seq, obj);
			break;

		case 'event':
			// Handle events
			this.handleEvent(obj);
			break;
		}
	}
}

Client.prototype.close = function() {
	// If was connected and not just retrying a reconnection,
	if (this.connected) {
		console.log("Inspect: Debug client close");

		this.pubsub.publish('close', null);
	}

	this.deframe.clear();

	this.connected = false;
	this.connecting = false;

	// Reconnect every 5 seconds after disco
	var that = this;
	this.reconnectTimeout = setTimeout(function() {
		if (!that.connecting) {
			that.connecting = true;

			that.socket.connect(DEBUG_PORT);
		}

		that.reconnectTimeout = null;
	}, 5000);
}

Client.prototype.request = function(msg, callback) {
	msg.type = 'request';
	msg.seq = this.callbacks.insert(callback);

	var serialized = JSON.stringify(msg);

	// Buffer is built into node.js
	var data = 'Content-Length: ' + Buffer.byteLength(serialized) + '\r\n\r\n' + serialized;

	try {
		this.socket.write(data);
	} catch (err) {
		// Pass
	}
}


//// Client Incoming Messages
// Messages from the debug server are handled here

Client.prototype.handleBreak = function(body) {
	if (this.breakpointsActive) {
		this.backtrace(function(resp) {
			var frames = convertCallFrames(resp.body.frames);

			this.browserServer.broadcastEvent("Debugger.paused", {
				callFrames: frames,
				reason: "Breakpoint @ " + body.script.name + ":" + body.script.lineOffset,
				data: "Source line text: " + body.sourceLineText
			});
		}.bind(this));
	} else {
		this.exitBreak(function(resp) {
			this.browserServer.broadcastEvent("Debugger.resumed");
		}.bind(this));
	}
}

Client.prototype.handleEvent = function(obj) {
	switch (obj.event) {
	case "break":
		this.handleBreak(obj.body);
		break;
	case "afterCompile":
		if (obj.body && obj.body.script) {
			this.browserServer.addConsoleMessage("info", "-- Script compiled: " + obj.body.script.name + " [" + obj.body.script.sourceLength + " bytes]");

			this.browserServer.broadcastEvent("Debugger.scriptParsed", makeScriptInfo(obj.body.script));
		}
		break;
	case "scriptCollected":
		// Ignore script collected (GC?) notifications
		break;
	default:
		console.log("Inspect: Unhandled debugger event ", JSON.stringify(obj));
	}
}


//// Client Outgoing Messages
// Messages for the debug server can be generated easily with these helpers

Client.prototype.version = function(callback) {
	this.request({
		command: 'version',
	}, callback);
}

Client.prototype.setBreakpoint = function(target, line, column, enabled, condition, callback) {
	this.request({
		command: 'setbreakpoint',
		arguments: {
			type: 'scriptId',
			target: target,
			line: line,
			column: column,
			enabled: enabled,
			condition: condition
		}
	}, callback);
}

Client.prototype.setBreakpointByUrl = function(line, url, column, enabled, condition, callback) {
	this.request({
		command: 'setbreakpoint',
		arguments: {
			type: 'script',
			target: url,
			line: line,
			column: column,
			enabled: enabled,
			condition: condition
		}
	}, callback);
}

Client.prototype.resume = function(step, count, callback) {
	this.request({
		command: 'continue',
		arguments: {
			stepaction: step,
			stepcount: count
		}
	}, callback);
}

Client.prototype.exitBreak = function(callback) {
	this.request({
		command: 'continue'
	}, callback);
}

Client.prototype.suspend = function(callback) {
	this.request({
		command: 'suspend',
	}, callback);
}

Client.prototype.backtrace = function(callback) {
	this.request({
		command: 'backtrace',
		arguments: {
			inlineRefs: true
		}
	}, callback);
}

Client.prototype.frame = function(number, callback) {
	this.request({
		command: 'frame',
		arguments: {
			number: number
		}
	}, callback);
}

Client.prototype.scope = function(scopeNumber, frameNumber, callback) {
	this.request({
		command: 'scope',
		arguments: {
			number: scopeNumber,
			frameNumber: frameNumber,
			inlineRefs: true
		}
	}, callback);
}

Client.prototype.scopes = function(frameNumber, callback) {
	this.request({
		command: 'scopes',
		arguments: {
			frameNumber: frameNumber
		}
	}, callback);
}

Client.prototype.source = function(frame, fromLine, toLine, callback) {
	this.request({
		command: 'source',
		arguments: {
			frame: frame,
			fromLine: fromLine,
			toLine: toLine
		}
	}, callback);
}

Client.prototype.changeBreakpoint = function(breakpoint, enabled, condition, ignoreCount, callback) {
	this.request({
		command: 'changebreakpoint',
		arguments: {
			breakpoint: breakpoint,
			enabled: enabled,
			condition: condition,
			ignoreCount: ignoreCount
		}
	}, callback);
}

Client.prototype.clearBreakpoint = function(breakpoint, callback) {
	this.request({
		command: 'clearbreakpoint',
		arguments: {
			breakpoint: breakpoint
		}
	}, callback);
}

Client.prototype.setExceptionBreak = function(type, enabled, callback) {
	this.request({
		command: 'setexceptionbreak',
		arguments: {
			type: type,
			enabled: enabled
		}
	}, callback);
}

Client.prototype.v8flags = function(flags, callback) {
	this.request({
		command: 'v8flags',
		arguments: {
			flags: flags
		}
	}, callback);
}

Client.prototype.disconnect = function(callback) {
	this.request({
		command: 'disconnect'
	}, callback);
}

Client.prototype.listBreakpoints = function(callback) {
	this.request({
		command: 'listbreakpoints'
	}, callback);
}

Client.prototype.references = function(type, handle, callback) {
	this.request({
		command: 'references',
		arguments: {
			type: type,
			handle: handle
		}
	}, callback);
}

Client.prototype.changeLive = function(script_id, preview_only, new_source, callback) {
	this.request({
		command: 'changelive',
		arguments: {
			script_id: script_id,
			preview_only: preview_only,
			new_source: new_source
		}
	}, callback);
}

Client.prototype.getScripts = function(callback) {
	this.request({
		command: 'scripts'
	}, callback);
}

Client.prototype.getScriptSource = function(id, callback) {
	this.request({
		command: 'scripts',
		arguments: {
			includeSource: true,
			types: 4,
			ids: [id]
		}
	}, callback);
}

Client.prototype.evaluate = function(expression, frame, callback) {
	var r = {
		command: 'evaluate',
		arguments: {
			expression: expression,
			global: frame == null,
			disable_break: true,
			maxStringLength: 10000000
		}
	};

	if (frame != null) {
		r.arguments.frame = frame;
	}

	this.request(r, callback);
}

Client.prototype.lookup = function(handles, callback) {
	this.request({
		command: 'lookup',
		arguments: {
			handles: handles,
			includeSource: false
		}
	}, callback);
}


//// Main Engine Ignition!

// One shared debug client for all browsers
var myAwesomeDebugClient = new Client(myAwesomeHTTPD);

// One shared web server
myAwesomeHTTPD.listen(BROWSER_PORT);
console.log("Inspect: Lurking at http://0.0.0.0:" + BROWSER_PORT);
