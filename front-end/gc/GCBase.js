var GCClass = function(parent, proto) {
	if (!proto) {
		proto = parent;
		parent = null;
	} else {
		if (parent == Error && ErrorParentClass) { parent = ErrorParentClass; }
		proto.prototype = parent.prototype;
	}

	var cls = function() {
			if (this.init) {
				return this.init.apply(this, arguments);
			}
		},
		supr = parent ? function(context, method, args) {
			var f = parent.prototype[method];
			if (!f) { throw new Error('method ' + method + ' does not exist'); }
			return f.apply(context, args || []);
		} : null;

	cls.prototype = new proto(supr, supr);
	cls.prototype.constructor = cls;
	cls.prototype.__parentClass__ = parent;
	if (name) {
		cls.prototype.__class__ = name;
	}
	return cls;
};

var GCPubSub = GCClass(function() {
	this.init = function() {
		this._subscribers = [];
	};

	this.subscribe = function(event, context, func) {
		var subscribers = this._subscribers,
			subscriber,
			i = subscribers.length;

		while (i) {
			subscriber = subscribers[--i];
			if ((subscriber.event === event) && (subscriber.context === context) && (subscriber.func === func)) {
				return;
			}
		}

		subscribers.push(
			{
				event: event,
				context: context,
				func: func
			}
		);
	};

	this.publish = function(event) {
		var subscribers = this._subscribers,
			subscriber,
			i = subscribers.length;

		while (i) {
			subscriber = subscribers[--i];
			if (subscriber.event === event) {
				var args = Array.prototype.slice.call(arguments),
					context = subscriber.context;

				context[subscriber.func].apply(context, args.slice(1, args.length));
			}
		}
	};
});

var gcbind = function(context, method) {
	if (typeof method == 'string') {
		return function __bound() {
			if (context[method]) {
				return context[method].apply(context, arguments);
			} else {
				throw console.error('No method:', method, 'for context', context);
			}
		};
	}
	return function __bound() {
		return method.apply(context, arguments);
	};
}