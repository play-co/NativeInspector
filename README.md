# Game Closure Native Inspector

## Overview

The GameClosure Native Inspector is a node.js project that provides:

+ JavaScript debugging
+ Console logs
+ Object inspection
+ Break-on-exception
+ CPU profiling
+ Heap profiling

…all over a network connection with a mobile Android or iOS device.

## How it Works

NativeInspector runs a web server that hosts a modified copy of the bleeding-edge [WebKit Web Inspector code](http://svn.webkit.org/repository/webkit/trunk/Source/WebCore/inspector/front-end/) that is part of the Chrome browser.  We fixed bugs and added features required for use with the SDK.

The general approach is inspired by Danny Coates' [node-inspector](https://github.com/dannycoates/node-inspector) project.  This is a complete cleanroom implementation with different goals.  The primary difference in motivation is that this project is supposed to integrate perfectly with the Game Closure SDK on Android and iOS.

### Network Protocol

When communicating with the devices, the [D8 protocol](http://code.google.com/p/v8/wiki/DebuggerProtocol) is used, which is a very limited subset of the full WebKit debug protocol (which includes DOM, etc). NativeInspector is primarily used to wrap D8 in a WebKit-compatible layer.

Google documentation on remote debugging is available [here](https://developers.google.com/chrome-developer-tools/docs/remote-debugging#protocol).

### Android

NativeInspector actively attempts to use the Android Debug Bridge (adb) to connect to port 9222 on an Android device attached via USB data cable.

On the device side, the Android codebase for Game Closure runs a V8 Debug Server.  This implements nearly all of the features required; we added heap and CPU profiling hooks into our iOS codebase also (such as `PROFILING.getHeaders()`), so that these can be remotely evaluated from the NativeInspector code when profiling is requested in the web interface.

### iOS

NativeInspector also attempts to connect to any IP addresses that have been identified by a simple UDP datagram protocol.  NativeInspector listens on UDP port 9320 on the localhost.  Received datagrams must contain a valid JSON string with the format: `{ "name": "connect", "addr": "10.1.1.123" }`.  This is the approach used to connect to iOS devices on the LAN.

On the device side, the iOS codebase for Game Closure runs a custom debug server written from scratch.  The core of the D8 protocol is implemented in Objective-C++ for this platform, making it mostly feature-complete.  To avoid running the debug server for every game, the debug server will only run in Test App mode.

When the Test App connects to the basil simulation server, the basil server will report the requesting IP address over UDP to the NativeInspector as indicated above.

## Troubleshooting

Try the following steps in order of increasing severity:

1. Refresh the browser
2. Reinstall the app
3. Restart tealeaf serve
4. Close out of everything and restart.

Please let me know if you experience hangs. Most often the following usage patterns may cause an app to hang:

1. Disconnecting USB cable while native inspector is live. You may need to restart tealeaf to fix this one.
2. Allowing the phone to sleep while debugging an "adb install my.apk" kind of app. I observed one case where this caused the native inspector to become unresponsive until the app was brought back into focus again. This is not normal behavior.

## Installation

This is a part of the [Game Closure SDK project](http://docs.gameclosure.com), and does not require configuration when used in conjunction with the normal SDK installation process.

To install the software for stand-alone use and set it up:

~~~
$ git clone git@github.com/gameclosure/NativeInspector
$ cd NativeInspector
$ npm install
~~~

Note that this requires `npm` to install.  This tool is available as part of the `nodejs` package.

The front-end is only confirmed to work with Google Chrome so you may also want to install Chrome.

## Usage

This is a part of the [Game Closure SDK project](http://docs.gameclosure.com), and is part of the Game Closure SDK web interface under `Remote Debug`.

To manually run the software:

~~~
$ node NativeInspector
~~~

Browse to [localhost:9220](http://localhost:9220) to view the web inspector front-end.
