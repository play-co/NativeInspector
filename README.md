Native Inspector
================

The GameClosure Web Inspector port for native Android JavaScript debugging, CPU
profiling and heap profiling.


Installation
============

This is a part of the Basil project, and does not require configuration when
used in conjunction with the normal Basil installation process.

To install the software for stand-alone use and set it up:
```shell
git clone https://github.com/gameclosure/NativeInspector.git
cd NativeInspector
npm install
cd ..
```

To run the software:
```shell
node NativeInspector
```


Change Log
==========

0.1.1 "Helpful Heaps" (Tue Sep 4, 2012)

* Fixed a number of small issues since initial release

* Changed /shared to /src for Content Script classification to match Basil

* Fixed disconnect issue during moderate to large heap snapshot analysis


0.1.0 "Hello WebKit"  (Thu Jul 19, 2012)

* Initial version based on recent official Google WebKit Web Inspector

