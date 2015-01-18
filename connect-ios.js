#!/usr/bin/env node
var dgram = require('dgram');
var argv = require('minimist')(process.argv.slice(2));

function abort (msg, code) {
  if (code === void 0) {
    code = 1;
  }

  console.error(process.argv[1], '\n');
  console.error('\t', msg.split('\n').join('\n\t'));

  process.exit(code);
}

if (!(argv.h || argv.host)) {
  abort('Must provide -h [ip] or --host [ip]');
}

// Invocation: node connect-ios.js -h 0.0.0.0
var commandString = JSON.stringify({
  name: 'connect',
  addr: argv.h || argv.host
});

var dm = new Buffer(commandString);
var socket = new dgram.createSocket('udp4');

if (argv.v || argv.verbose) {
  console.log('Sending to NativeInspector -', commandString);
}

// Send datagram to local NativeInspector server with address of the iOS device
socket.send(dm, 0, dm.length, 9320, '127.0.0.1', function(err, bytes) {
  socket.close();
  process.exit(0);
});
