var weinreMessageDispatcher = null;

var MessageDispatcher = (function() {

	function MessageDispatcher(url, id) {
		weinreMessageDispatcher = this;

		this._url = url;
		this._id = id || "anonymous";
		this.error = null;
		this._opening = false;
		this._opened = false;
		this._closed = false;
		this._interfaces = {};
		this._open();
	}

	MessageDispatcher.setInspectorBackend = function(inspectorBackend) {
		return InspectorBackend = inspectorBackend;
	};

	MessageDispatcher.prototype._open = function() {
		if (this._opened || this._opening) {
			return;
		}
		if (this._closed) {
			throw new Error("socket has already been closed");
		}
		this._opening = true;
		var socket = new WebSocketXhr(this._url, this._id);

		socket.addEventListener("open", Binding(this, "_handleOpen"));
		socket.addEventListener("error", Binding(this, "_handleError"));
		socket.addEventListener("message", Binding(this, "_handleMessage"));
		socket.addEventListener("close", Binding(this, "_handleClose"));

		this._socket = socket;
	};

	MessageDispatcher.prototype.close = function() {
		if (this._closed) {
			return;
		}
		this._opened = false;
		this._closed = true;
		return this._socket.close();
	};

	MessageDispatcher.prototype.send = function(data) {
		return this._socket.send(data);
	};

	MessageDispatcher.prototype.getWebSocket = function() {
		return this._socket;
	};

	MessageDispatcher.prototype._sendMethodInvocation = function(intfName, methodName, args) {
		var data;
		if (typeof intfName !== "string") {
			throw new Error("expecting intf parameter to be a string");
		}
		if (typeof methodName !== "string") {
			throw new Error("expecting method parameter to be a string");
		}
		data = {
			"interface": intfName,
			method: methodName,
			args: args
		};
		data = JSON.stringify(data);
		this._socket.send(data);

		console.log(this.constructor.name + ("[" + this._url + "]: send " + intfName + "." + methodName + "(" + (JSON.stringify(args)) + ")"));
	};

	MessageDispatcher.prototype.getState = function() {
		if (this._opening) {
			return "opening";
		}
		if (this._opened) {
			return "opened";
		}
		if (this._closed) {
			return "closed";
		}
		return "unknown";
	};

	MessageDispatcher.prototype.isOpen = function() {
		return this._opened === true;
	};

	MessageDispatcher.prototype._handleOpen = function(event) {
		this._opening = false;
		this._opened = true;
		this.channel = event.channel;
		//Callback.setConnectorChannel(this.channel); //----------------------------------------------!!!!!!!!!!!!!!!!!!!!
		//return console.log(this.constructor.name + ("[" + this._url + "]: opened"));
	};

	MessageDispatcher.prototype._handleError = function(message) {
		this.error = message;
		this.close();
		//return console.log(this.constructor.name + ("[" + this._url + "]: error: ") + message);
	};

	MessageDispatcher.prototype._handleMessage = function(message) {
		console.log("Receive message: " + message);
		var args, data, intf, intfName, method, methodName, methodSignature, skipErrorForMethods;
		skipErrorForMethods = ['domContentEventFired', 'loadEventFired', 'childNodeRemoved'];
		try {
			data = JSON.parse(message.data);
		} catch (e) {
			throw new Error("invalid JSON data received: " + e + ": '" + message.data + "'");
		}
		intfName = data["interface"];
		methodName = data.method;
		args = data.args;
		methodSignature = "" + intfName + "." + methodName + "()";
		intf = this._interfaces.hasOwnProperty(intfName) && this._interfaces[intfName];
		if (!intf && InspectorBackend && intfName.match(/.*Notify/)) {
			intf = InspectorBackend.getRegisteredDomainDispatcher(intfName.substr(0, intfName.length - 6));
		}
		if (!intf) {
			console.log("weinre: request for non-registered interface: " + methodSignature);
			return;
		}
		methodSignature = intf.constructor.name + ("." + methodName + "()");
		method = intf[methodName];
		if (typeof method !== "function") {
			console.log("not implemented: " + methodSignature);
			return;
		}
		try {
			method.apply(intf, args);
		} catch (e) {
			if (__indexOf.call(skipErrorForMethods, methodName) < 0) {
				console.log(("weinre: invocation exception on " + methodSignature + ": ") + e);
			}
		}
	};

	MessageDispatcher.prototype._handleClose = function() {
		this._reallyClosed = true;
	};

	MessageDispatcher.prototype.getClients = function() {
		console.log('channel:', this._socket.channel);
		if (!this._socket.channel) {
			var self = this;
			setTimeout(function() { self.getClients(); }, 50);
			return;
		}
		console.log('WeinreClientCommands.getClients([' + this._socket.channel + '::1])');
		this._socket.send('WeinreClientCommands.getClients([' + this._socket.channel + '::1])');
	};

	return MessageDispatcher;

	//socket send: {"interface":"WeinreClientCommands","method":"registerClient","args":["c-1::5"]} WebSocketXhr.amd.js:134
	//MessageDispatcher[../ws/client]: send WeinreClientCommands.registerClient(["c-1::5"]) MessageDispatcher.amd.js:119
	//socket send: {"interface":"WeinreClientCommands","method":"getTargets","args":["c-1::6"]} WebSocketXhr.amd.js:134
	//MessageDispatcher[../ws/client]: send WeinreClientCommands.getTargets(["c-1::6"]) MessageDispatcher.amd.js:119
	//socket send: {"interface":"WeinreClientCommands","method":"getClients","args":["c-1::7"]} WebSocketXhr.amd.js:134
	//MessageDispatcher[../ws/client]: send WeinreClientCommands.getClients(["c-1::7"])
})();