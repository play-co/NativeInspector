0.1.4 "Memory Loss" (Fri Jan 11, 2013)

+ Remote SpiderMonkey/iOS debugging support.
+ Now supports multiple local + remote iOS debug clients.
+ Log messages are now forwarded to web console to support iOS console logs.
+ Supports new "ios" message V8 protocol extension to tell web ui iOS is in use.

Known Issues:
- Android cannot evaluate at console outside of breakpoint call frame.
- iOS does not support CPU Profiling nor Heap Profiling.


0.1.3 "Time Keeps On Slipping" (Tue Sept 18, 2012)

+ Exceptions occurring in JS code injected by native are now handled properly.


0.1.2 "Positive Contact" (Fri Sept 14, 2012)

+ Evaluating in the console no longer truncates the result.

+ Uncaught exceptions are now handled by default and are synched with browser setting.

+ Now displays the heap snapshot size in the list if the snapshot name is re-used.


0.1.1 "Helpful Heaps" (Tue Sep 4, 2012)

* Fixed a number of small issues since initial release

* Changed /shared to /src for Content Script classification to match Basil

* Fixed disconnect issue during moderate to large heap snapshot analysis


0.1.0 "Hello WebKit"  (Thu Jul 19, 2012)

* Initial version based on recent official Google WebKit Web Inspector

