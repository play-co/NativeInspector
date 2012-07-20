var net = require('net');
var path = require('path');
var http = require('http');
var paperboy = require('paperboy');
var io = require('socket.io');
var child_process = require('child_process');
var urllib = require('url');

var BROWSER_PORT = 8003;
var DEBUG_PORT = 9222;
var CONTROL_PORT = 9584;
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
}).listen(BROWSER_PORT);

console.log("Inspect: Lurking at http://0.0.0.0:" + BROWSER_PORT);


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
	client.pubsub.subscribe(this, "event", this.onDebuggerEvent.bind(this));
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

BrowserSession.prototype.handleBreak = function(body) {
	this.client.backtrace(function(resp) {
		var frames = convertCallFrames(resp.body.frames);

		this.sendEvent("Debugger.paused", {
			callFrames: frames,
			reason: "Breakpoint @ " + body.script.name + ":" + body.script.lineOffset,
			data: "Source line text: " + body.sourceLineText
		});
	}.bind(this));
}

BrowserSession.prototype.onDebuggerEvent = function(obj) {
	switch (obj.event) {
	case "break":
		this.handleBreak(obj.body);
		break;
	case "afterCompile":
		if (obj.body && obj.body.script) {
			this.addConsoleMessage("info", "-- Script compiled: " + obj.body.script.name + " [" + obj.body.script.sourceLength + " bytes]");
		}
		break;
	default:
		console.log("Inspect: Unhandled debugger event ", JSON.stringify(obj));
	}
}

BrowserSession.prototype.onDebuggerClose = function() {
	console.log("Inspect: Browser notified of debugger close");

	if (this.connected) {
		this.connected = false;

		if (this.loaded) {
			this.addConsoleMessage("error", "--- Device disconnected.");

			// Clear scripts view
			this.sendEvent("Debugger.globalObjectCleared");
		}
	}
}

BrowserSession.prototype.onPingTimer = function() {
	this.socket.send('ping');

	this.pingTimeout = setTimeout(this.onPingTimer.bind(this), 30000);
}

BrowserSession.prototype.message = function(req_str) {
	//console.log("INCOMING " + req_str);

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
			console.log('Inspect: Unhandled ', req.method);
		}
	} else {
		console.log('Inspect: Non-method message ', JSON.stringify(req));
	}
}

BrowserSession.prototype.sendResponse = function(id, success, data) {
	if (data === undefined) {
		data = {};
	}

	//console.log("OUTGOING " + id + " " + success + " " + JSON.stringify(data));

	this.socket.send(JSON.stringify({
		id: id,
		success: success,
		result: data
	}));
}

BrowserSession.prototype.sendEvent = function(name, data) {
	if (data === undefined) {
		data = {};
	}

	//console.log("OUTGOING event " + name + " " + JSON.stringify(data));

	this.socket.send(JSON.stringify({
		type: 'event',
		method: name,
		params: data
	}));
}

// Called whenever loaded and connected just became true, from any other state arriving in any order
BrowserSession.prototype.onLoadAndDebug = function() {
	// Clear scripts view
	this.sendEvent("Debugger.globalObjectCleared");

	this.client.listBreakpoints(function(obj) {
		var breakpoints = obj.body.breakpoints;
		for (var ii = 0; ii < breakpoints.length; ++ii) {
			this.client.clearBreakpoint(breakpoints[ii].number, function(resp) {
				// Ignore response
			}.bind(this));
		}
	}.bind(this));

	this.client.getScripts(function(obj) {
		for (var ii = 0, len = obj.body.length; ii < len; ++ii) {
			var script = obj.body[ii];

			if (script.type === "script") {
				this.sendEvent("Debugger.scriptParsed", {
					scriptId: String(script.id),
					url: (script.name === undefined) ? "<stuff you injected>" : String(script.name),
					startLine: script.lineOffset,
					startColumn: script.columnOffset,
					endLine: script.lineCount,
					endColumn: 0,
					isContentScript: true,
					sourceMapURL: script.name
				});
			}
		}
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

function getRemoteObject(obj) {
	var result = {
		type: obj.type,
		className: obj.className,
		description: obj.text || obj.value,
		objectId: "0:0:" + obj.handle,
		value: obj.text || obj.value
		//subtype: "null"
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

BrowserHandler.prototype["Runtime.releaseObjectGroup"] = function(req) {
	this.sendResponse(req.id, true);
}

BrowserHandler.prototype["Runtime.evaluate"] = function(req) {
	this.client.evaluate(req.params.expression, null, function(resp) {
		// If evaulation succeeded,
		if (resp.success) {
			this.sendResponse(req.id, true, {
				result: getRemoteObject(resp.body),
				wasThrown: false
			});
		} else {
			this.sendResponse(req.id, true, {
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
	console.log("callFunctionOn : " + JSON.stringify(req));
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
			if (resp.body && resp.body.object) {
				for (key in resp.body.object.properties) {
					var property = resp.body.object.properties[key];

					var p = {
						name: String(property.name),
						value: getRemoteObject(refs[property.value.ref])
					};

					objects.push(p);
				}
			}

			this.sendResponse(req.id, resp.success, {result: objects});
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

			this.sendResponse(req.id, resp.success, {result: objects});
		}.bind(this));
	}
}


//// Debugger Messages

BrowserHandler.prototype["Debugger.causesRecompilation"] = function(req) {
	this.sendResponse(req.id, true, {result: false});
}

BrowserHandler.prototype["Debugger.supportsNativeBreakpoints"] = function(req) {
	this.sendResponse(req.id, true, {result: true});
}

BrowserHandler.prototype["Page.canOverrideDeviceMetrics"] = function(req) {
	this.sendResponse(req.id, true, {result: false});

	// Trigger onLoad event
	this.onLoad();
}

BrowserHandler.prototype["Debugger.enable"] = function(req) {
	console.log("Inspect: Enabled Debugger");
	this.sendResponse(req.id, true);
}

BrowserHandler.prototype["Debugger.disable"] = function(req) {
	console.log("Inspect: Disabled Debugger");
	this.sendResponse(req.id, false, {message: "Cannot disable debugger.  It is unstoppable!"});
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
		this.sendResponse(req.id, obj.success);
	}.bind(this));
}

BrowserHandler.prototype["Debugger.setBreakpointsActive"] = function(req) {
	var active = req.params.active;

	console.log("Inspect: setBreakpointsActive(", active, ")");
	this.sendResponse(req.id, true);
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
		this.sendResponse(req.id, true, {
			breakpointId: String(resp.body.breakpoint),
			locations: locations
		});
	}.bind(this));
}

BrowserHandler.prototype["Debugger.removeBreakpoint"] = function(req) {
	var id = req.params.breakpointId;

	this.client.clearBreakpoint(id, function(resp) {
		this.sendResponse(req.id, resp.success);
	}.bind(this));
}

BrowserHandler.prototype["Debugger.stepInto"] = function(req) {
	this.client.resume('in', 1, function(resp) {
		this.sendResponse(req.id, resp.success);
	}.bind(this));
}

BrowserHandler.prototype["Debugger.stepOver"] = function(req) {
	this.client.resume('next', 1, function(resp) {
		this.sendResponse(req.id, resp.success);
	}.bind(this));
}

BrowserHandler.prototype["Debugger.stepOut"] = function(req) {
	this.client.resume('out', 1, function(resp) {
		this.sendResponse(req.id, resp.success);
	}.bind(this));
}

BrowserHandler.prototype["Debugger.pause"] = function(req) {
	this.client.suspend(function(resp) {
		this.sendResponse(req.id, resp.success);
	}.bind(this));
}

BrowserHandler.prototype["Debugger.resume"] = function(req) {
	this.client.exitBreak(function(resp) {
		this.sendResponse(req.id, resp.success);
		this.sendEvent("Debugger.resumed");
	}.bind(this));
}

BrowserHandler.prototype["Debugger.evaluateOnCallFrame"] = function(req) {
	this.client.evaluate(req.params.expression, req.params.callFrameId, function(resp) {
		// If evaulation succeeded,
		if (resp.success) {
			this.sendResponse(req.id, true, {
				result: getRemoteObject(resp.body),
				wasThrown: false
			});
		} else {
			this.sendResponse(req.id, true, {
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
			this.sendResponse(req.id, false, {
				scriptSource: "Unable to load source file.  Try reloading the page"
			});
		} else {
			// Other info ignored: lineOffset, script name, line count
			var source = resp.body[0].source;

			console.log("Inspect: Got source for " + req.params.scriptId + " - " + source.length + " chars");

			this.sendResponse(req.id, resp.success, {
				scriptSource: source
			});
		}
	}.bind(this));
}


//// Profiler Messages

BrowserHandler.prototype["Profiler.causesRecompilation"] = function(req) {
	this.sendResponse(req.id, true, {result: false});
}

BrowserHandler.prototype["Profiler.isSampling"] = function(req) {
	this.sendResponse(req.id, true, {result: true});
}

BrowserHandler.prototype["Profiler.hasHeapProfiler"] = function(req) {
	this.sendResponse(req.id, true, {result: true});
}

BrowserHandler.prototype["Profiler.enable"] = function(req) {
	console.log("Inspect: Enabled Profiler");
	this.sendResponse(req.id, true);
}

BrowserHandler.prototype["Profiler.start"] = function(req) {
	console.log("Inspect: Start profiler");
}

BrowserHandler.prototype["Profiler.stop"] = function(req) {
	console.log("Inspect: Stop profiler");
}

BrowserHandler.prototype["Profiler.getProfileHeaders"] = function(req) {
	console.log("Inspect: Get profile headers");
	this.sendResponse(req.id, true, [
	{
		typeId: 1,
		title: "title",
		uid: 10,
		isTemporary: false
	}
	]);
	// TODO
}

BrowserHandler.prototype["Profiler.getProfile"] = function(req) {
	console.log("Inspect: Get profile");
	// TODO
}

BrowserHandler.prototype["Profiler.removeProfile"] = function(req) {
	console.log("Inspect: Get profile");
}

BrowserHandler.prototype["Profiler.clearProfiles"] = function(req) {
	console.log("Inspect: Clear profiles");
}

BrowserHandler.prototype["Profiler.takeHeapSnapshot"] = function(req) {
	console.log("Inspect: Take heap snapshot");
}

BrowserHandler.prototype["Profiler.getObjectByHeapObjectId"] = function(req) {
	console.log("Inspect: Get heap object");
}

BrowserHandler.prototype["Profiler.disable"] = function(req) {
	this.sendResponse(req.id, false, {message: "Unable to disable profiler. It is unstoppable!"});
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


//// Debug Client
// V8 debug protocol client

Client = Class.create();

Client.prototype.initialize = function() {
	this.callbacks = new ResponseCallbacks();
	this.pubsub = new PubSub();
	this.deframe = new Deframer(this.message.bind(this));

	this.connecting = true;
	this.connected = false;

	// Set up socket
	var s = new net.Socket({type: "tcp4"});
	this.socket = s;
	s.on('error', this.error.bind(this));
	s.on('connect', this.connect.bind(this));
	s.on('data', this.data.bind(this));
	s.on('close', this.close.bind(this));
	s.connect(DEBUG_PORT);

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
			// Notify browser sessions
			this.pubsub.publish('event', obj);
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

	this.socket.write(data);
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
var myAwesomeDebugClient = new Client();

// One browser server accepting multiple browsers
var myAwesomeBrowserServer = new BrowserServer(myAwesomeHTTPD, myAwesomeDebugClient);

// One control server accepting multiple control connexions
var myAwesomeControlServer = new ControlServer(myAwesomeBrowserServer, myAwesomeDebugClient);
