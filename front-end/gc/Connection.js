var Connection = GCClass(function() {
	this.onReadyStateChange = function(xhr) {
		var target = xhr.target;

		if (target.readyState === 4) {
			if (target.status === 200) {
				try {
					var data = JSON.parse(target.responseText);
					target.cb(false, data);
				} catch (e) {
					console.error("Error parsing response from " + target.url + ": " + xhr.responseText);
				}
			} else {
				target.cb(true);
			}
		}
	};

	this._send = function(url, cb, data, method) {
		var xhr = new XMLHttpRequest();
		xhr.cb = cb;
		xhr.url = url;
		xhr.onreadystatechange = gcbind(this, "onReadyStateChange");
		xhr.open(method, url, true);
		xhr.setRequestHeader("Content-Type", "text/plain");
		xhr.send(data);
	};

	this.get = function(url, data, cb) {
		this._send(url, cb, data, "GET");
	};

	this.post = function(url, data, cb) {
		this._send(url, cb, data, "POST");
	};
});

var Client = GCClass(GCPubSub, function(supr) {
	this.init = function(opts) {
		supr(this, 'init', arguments);

		this._url = opts.url || "http://10.0.0.148:8150/ws/client";
		this._connection = new Connection();

		this._clients = {};
		this._targets = {};
	};

	this.start = function() {
		this._connection.post(
			this._url,
			JSON.stringify({id: "anonymous"}),
			gcbind(this, "onReceiveChannel")
		);
	};

	this.onReceiveChannel = function(err, data) {
		if (err) {
			console.error("Failed to retrieve channel information");
		} else {
			this._channel = data.channel;
			this._pollTime = +new Date();
			this._pollResult = true;
			this._urlChannel = this._url + "/" + data.channel;

			this.publish("ClientRegistered", data.channel);

			setInterval(gcbind(this, "onPoll"), 100);
		}
	};

	this.onPoll = function() {
		if (this._pollResult) {
			var time = +new Date();
			if (time > this._pollTime + 200) {
				this._pollTime = time;
				this._pollResult = false;

				this._connection.get(
					this._urlChannel,
					"",
					gcbind(this, "onPollResult")
				);
			}
		}
	};

	this.onClientEvent = function(data) {
		var publishArgs = gcbind(
				this,
				function(args, name) {
					if (args && args.length) {
						var i = args.length;
						while (i) {
							this.publish(name, args[--i]);
						}
					}
				}
			);

		switch (data.method) {
			case "clientUnregistered":
				//console.log("client unregistered:", data);
				publishArgs(data.args, "ClientUnregistered");
				break;

			case "targetRegistered":
				//console.log("target registered:", data);
				publishArgs(data.args, "TargetRegistered");
				break;

			case "targetUnregistered":
				//console.log("target unregistered:", data);
				publishArgs(data.args, "TargetUnregistered");
				break;

			case "connectionCreated":
				console.log("connection created:", data);
				if (data.args && (data.args.length === 2)) {
					// 0 = channel, 1 = target
					this.publish("ConnectionCreated", data.args[0], data.args[1]);
				}
				break;

			case "connectionDestroyed":
				//console.log("connection destroyed:", data);
				if (data.args && (data.args.length === 2)) {
					// 0 = channel, 1 = target
					this.publish("ConnectionDestroyed", data.args[0], data.args[1]);
				}
				break;
		}
	};

	this.onPollResult = function(err, data) {
		this._pollResult = true;

		if (err) {
			console.error("Failed to poll status");
		} else {
			try {
				data = JSON.parse(data[0]);
				//console.log("Poll:", data.interface, data);

				switch (data.interface) {
					case "WeinreClientEvents":
						this.onClientEvent(data);
						break;
				}
			} catch (e) {
			}
		}
	};

	this.getClients = function() {
		return this._clients;
	};

	this.getTargets = function() {
		return this._targets;
	};
});
