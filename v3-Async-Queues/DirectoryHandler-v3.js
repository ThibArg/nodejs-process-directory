/*	DirectoryHandler-v3.js

	Using the async npm module, here, everything is async. even parsing a file object.
	This makes the whole code much more node-spirit than v1 and v2, because it is
	non blocking at all.

	But, as always, the consequance is a code more complicated to read and understand,
	with queues, walker and so on. Thankfully, most of the implementation is done in
	async, so it's ok ;->.

	This class assumes the directory is not modified while being processed. So for
	example, when the full size is calculated, it can be requested later and will return
	the same value

	(c) Nuxeo
	Thibaud Arguillere

	MIT License, do whatever you want with this
*/

(function scope_DirectoryHandler() {
	var fs = require("fs"),
		os = require("os"),
		path = require("path"),
		resolve = path.resolve,
		util = require("util"),
		async = require('async');

	var isMac = false, isLinux = false, isWindows = false;

	if(os.platform().indexOf("win") === 0) {
		isWindows = true;
	} else if(os.platform() === "darwin") {
		isMac = true;
	} else { // Assume linux?
		isLinux = true;
	}

	//--------------------------------------
	//Constants (used internally)
	//--------------------------------------
	const kDEFAULT_CONCURRENCY = 5;
	const kMODULO_FOR_CALLBACK = 100;
	
	//--------------------------------------
	// Private functions
	//--------------------------------------
	function isHidden(inPath, isDirectory) {
		if(isMac || isLinux) {
			// Folder or file, it starts with .
			if(path.basename(inPath).indexOf(".") === 0) {
				return true;
			} else {
				// ? ? ? how to get the properties?
			}
		} else {
			// ? ? ? Windows ? ? ?
		}
		return false;
	}

	//--------------------------------------
	// Constructor and Instance Methods
	//--------------------------------------
	function DirectoryHandler(inPath) {
		var _parsingInfo = {
				path : null,
				fullSizeInBytes : -1,
				countDirectories : -1,
				countFiles : -1,
				totalCountOfObjects : -1,
				ignoredExtensions : null,
				ignoredInvisible : true,
				parsingDone : false,

			// These properties are not enumerables, and some will be Object.Freeze()
			// pathsOfSubDirectories and deepestDirectoryPaths are calculated only
			// once, at first "get"
				treeAsJSON : null,
				pathsOfSubDirectories : null,
				deepestDirectoryPaths: null
			};

		// We don't want to output the array of directory paths, except
		// With a dedicated getter
		Object.defineProperty(_parsingInfo, "pathsOfSubDirectories", { enumerable:false });
		Object.defineProperty(_parsingInfo, "treeAsJSON", { enumerable:false });
		Object.defineProperty(_parsingInfo, "deepestDirectoryPaths", { enumerable:false });


		//--------------------------------------
		// Constructor
		//--------------------------------------
		// We accept only a string, path to the directory
		if(	   typeof inPath === "string"
			&& inPath !== ""
			&& fs.existsSync(inPath)
			&& fs.statSync(inPath).isDirectory() ) {

			_parsingInfo.path = inPath;

		} else {
			throw new TypeError("inPath should be a valid path to a directory");
		}

		//--------------------------------------
		// Properties
		//--------------------------------------
		this.__defineGetter__('path', function() { return _parsingInfo.path; });
		this.__defineSetter__('path', function(inValue) { throw new TypeError("Cannot change the path"); });
		this.__defineGetter__('countDirectories', function() { return _parsingInfo.countDirectories; });
		this.__defineSetter__('countDirectories', function(inValue) { throw new TypeError("Cannot change the countDirectories"); });
		this.__defineGetter__('countFiles', function() { return _parsingInfo.countFiles; });
		this.__defineSetter__('countFiles', function(inValue) { throw new TypeError("Cannot change the countFiles"); });
		this.__defineGetter__('fullSizeInBytes', function() { return _parsingInfo.fullSizeInBytes; });
		this.__defineSetter__('fullSizeInBytes', function(inValue) { throw new TypeError("Cannot change the fullSizeInBytes"); });
		
		//--------------------------------------
		// Private functions
		//--------------------------------------
		function buildSubDirectoryPaths(inDirectory) {
			if(typeof inDirectory === "undefined" || inDirectory == null) {
				// Firs call
				_parsingInfo.pathsOfSubDirectories = [];
				_parsingInfo.treeAsJSON.directories.forEach(function(inDirectory) {
					buildSubDirectoryPaths(inDirectory);
				});
			} else {
				_parsingInfo.pathsOfSubDirectories.push(inDirectory.path);
				inDirectory.directories.forEach(function(inSubFolder) {
					if(inSubFolder.directories.length > 0) {
						buildSubDirectoryPaths(inSubFolder);
					} else {
						_parsingInfo.pathsOfSubDirectories.push(inSubFolder.path);
					}
				});
			}
		}

		function buildDeepestDirectoryPaths(inDirectory) {
			if(typeof inDirectory === "undefined" || inDirectory == null) {
				// Firs call
				_parsingInfo.deepestDirectoryPaths = [];
				_parsingInfo.treeAsJSON.directories.forEach(function(inDirectory) {
					buildDeepestDirectoryPaths(inDirectory);
				});
			} else {
				inDirectory.directories.forEach(function(inSubFolder) {
					if(inSubFolder.directories.length > 0) {
						buildDeepestDirectoryPaths(inSubFolder);
					} else {
						_parsingInfo.deepestDirectoryPaths.push(inSubFolder.path);
					}
				});
			}
		}

		/* ============================================================
		   ========================== PARSING =========================
		   ============================================================ */
		function buildRootObject(inPath) {
			return {
				path: inPath,
				name: path.basename(inPath),
				isDirectory: true,
				directories: [],
				files: [],
			};
		}

		function buildDirectoryObject(inPath, inParent) {
			var obj = {
				path : inPath,
				name: path.basename(inPath),
				isDirectory: true,
				directories: [],
				files: []
			};
			inParent.directories.push(obj);
			return obj;
		}

		function buildFileObject(inPath, inParent) {
			var obj = {
				name: path.basename(inPath),
				isDirectory: false,
				parent: inParent
			};
			inParent.files.push(obj);
			return obj;
		}

		/*	asyncParsingDone() is called when async.queue() has totally finished:
		 *		-> Either with an error (first parameter is the error)
		 *		-> Or just finished
		 *
		 *	So here, we set up the _parsingInfo and run the caller's callback, after setting
		 *	the misc. "done" flags to true.
		 */
		function asyncParsingDone(inObj, inParsingConfig, inMainCallback, inCallBackParameters) {

			if(typeof inObj !== "boolean") {
				inMainCallback(inObj, inCallBackParameters);
			} else {
				_parsingInfo.fullSizeInBytes = inCallBackParameters.fullSizeInBytes;
				_parsingInfo.countDirectories = inCallBackParameters.countDirectories;
				_parsingInfo.countFiles = inCallBackParameters.countFiles;
				_parsingInfo.totalCountOfObjects = inCallBackParameters.countObjects;
				_parsingInfo.ignoredExtensions = inParsingConfig.ignoreInvisible;
				_parsingInfo.ignoredInvisible = inParsingConfig.ignoreExtensions;

				// We freeze the tree so any caller getting it can't change its content.
				_parsingInfo.treeAsJSON = Object.freeze(_parsingInfo.treeAsJSON);

				_parsingInfo.parsingDone = true;

				inCallBackParameters.done = true;
				inMainCallback(null, inCallBackParameters);
			}
		}

		function doParse(inPath, inConfig, inCallback) {

			var callBackParameters = {
				fullSizeInBytes : 0,
				countDirectories : 0,
				countFiles : 0,
				countObjects : 0,
				done : false
			};
			var moduloForCallback = inConfig.moduloForCallback;

			// Quick reminder if you are not familiar with async.queue()
			// The callback must be called everytime a queue has fonoshed its
			// job. It must either pass an error parameter or nothing. This
			// is why you'll find these calls to asyncParsingDone(); or
			// asyncParsingDone()(err); (The callback itself is actually
			// not called.)
			var walker = async.queue(function(inObj, asyncParsingDone) {

		        fs.stat(inObj.path, function(err, stats) {
		        	var canAddObject = true;
		        	var newObj = null;

		            if (err) {
		                asyncParsingDone(err);
		            } else {
		                if (stats.isDirectory()) {

		                	if(canAddObject && inConfig.ignoreInvisible) {
		                		canAddObject = !isHidden(inObj.path, true);
		                	}
		                	if(canAddObject && inConfig.hasCanAddObjectCallback) {
		                		canAddObject = inConfig.canAddObject(inObj.path, stats);
		                	}

		                	if(canAddObject) {
			            		callBackParameters.countDirectories += 1;

			            		newObj = buildDirectoryObject(inObj.path, inObj.parent);

			                    fs.readdir(inObj.path, function(err, files) {
			                        if (err) {
			                            asyncParsingDone(err);
			                        } else {
			                            for (var i = 0; i < files.length; i++) {
			                                walker.push({
			                                	path: resolve(inObj.path, files[i]),
			                                	parent: newObj
			                                });
			                            }
			                            asyncParsingDone();
			                        }
			                    });
		                	} else {
		                		asyncParsingDone();
		                	}
		                } else {
		                	if(canAddObject && inConfig.ignoreInvisible) {

		                		canAddObject = !isHidden(inObj.path, false);
		                	}
		                	if(canAddObject && inConfig.hasIgnoreExtensions) {
		                		inConfig.ignoreExtensions.every(function(inExt) {
		                			if(inExt !== "" && inObj.path.indexOf(inExt, inExt.length - inExt.length) !== -1) {
		                				canAddObject = false;
		                				return false;// Break the "every" loop
		                			}
		                		});
		                	}
		                	if(canAddObject && inConfig.hasCanAddObjectCallback) {
		                		canAddObject = inConfig.canAddObject(inObj.path, stats);
		                	}
		                	if(canAddObject) {
			            		callBackParameters.countFiles += 1;
			            		callBackParameters.fullSizeInBytes += stats.size;

			            		newObj = buildFileObject(inObj.path, inObj.parent);
			            	}
		                    asyncParsingDone();
		                }

		            	callBackParameters.countObjects += 1;
		            	if((callBackParameters.countObjects % moduloForCallback) == 0) {
		            		inCallback(null, callBackParameters);
		            	}
		            }
		        });

		    }, inConfig.concurrency);

			_parsingInfo.treeAsJSON = {
				directories: [],
				files: []
			}
		    walker.push({
		     		path: inPath,
		     		parent: _parsingInfo.treeAsJSON
		     	}
		     );

		    walker.drain = function() {
		        asyncParsingDone(true, inConfig, inCallback, callBackParameters);
		    }
		}
		
		//--------------------------------------
		// Instance methods
		//--------------------------------------
		this.toString = function() {
			return JSON.stringify(_parsingInfo);
		};

		this.getAsJSON = function() {
			return _parsingInfo.treeAsJSON;
		};

		this.getSubDirectoryPaths = function() {
			if(_parsingInfo.pathsOfSubDirectories == null) {
				if(!_parsingInfo.parsingDone) {
					throw new Error("Parsing has not be done yet");
				}
				buildSubDirectoryPaths();
				_parsingInfo.pathsOfSubDirectories = Object.freeze(_parsingInfo.pathsOfSubDirectories.sort());
			}
			return _parsingInfo.pathsOfSubDirectories;
		};

		this.getDeepestDirectoryPaths = function() {
			if(_parsingInfo.deepestDirectoryPaths == null) {
				if(!_parsingInfo.parsingDone) {
					throw new Error("Parsing has not be done yet");
				}
				buildDeepestDirectoryPaths();
				_parsingInfo.deepestDirectoryPaths = Object.freeze(_parsingInfo.deepestDirectoryPaths.sort());
			}
			return _parsingInfo.deepestDirectoryPaths;
		};

		/*
			Warning: This can lead to dozens of MB of RAM of there are a lot of files.
			This is why we don't cache it
		*/
		this.getAllFilePaths = function() {
			var allPaths = [];

			function buildPaths(inDirectory) {
				inDirectory.directories.every(function(theDirectory) {
					buildPaths(theDirectory);
					return true;
				});

				inDirectory.files.every(function(theFile) {
					allPaths.push(resolve(theFile.parent.path, theFile.name));
					return true;
				});
			}

			buildPaths(_parsingInfo.treeAsJSON);

			return allPaths;
		};


		var stopLoop = false;
		var countHandledFiles = 0;
		function doOnFiles(inDirectoryObj, inCB) {
			// Process files
			if(!stopLoop) {
				inDirectoryObj.files.every(function(inFileObj) {
					countHandledFiles += 1;
					inCB(
						null,
						{
							file: resolve(inFileObj.parent.path, inFileObj.name),
							count: countHandledFiles,
							truthCallback: function(inContinue) {
								if(!inContinue) {
									stopLoop = false;
								}
							}
						}
					);
					
					return !stopLoop; // Break this "every" loop if needed
				});
			}

			// Process directories
			if(!stopLoop) {
				process.nextTick(function() {
					inDirectoryObj.directories.forEach(function(inSubDirectoryObj) {
						doOnFiles(inSubDirectoryObj, inCB);
					});
				});
			}
		}
		
		/*	applyToFiles()
		 *
		 *	WARNING: This is a *synchronous* call of iteratorCB on *all* the files
		 *	iteratorCD receives the regular nodejs 2 callback parameters
		 *		error: Here, it will always be null. The callback handles any error.
		 *		data: An object containing
		 *			file: The file to handle
		 *			count: The number of files already handled (including this on)
		 *			truthCallback:
		 *				A function which receives a true/false parameter to tell the
		 *				loop if it cann continue.
		 *				Note: This is the truthCalback nodejs way of working (we could
		 *				just have asked for a callback to *return* true/false)
 		 */
		this.applyToFiles = function(iteratorCB) {
			stopLoop = false;
			countHandledFiles = 0;
			doOnFiles(_parsingInfo.treeAsJSON, iteratorCB);
		}

		/*	parse()
			Return the full size in bytes.
			Calculated only once (assuming the folder never change during the life time
			of the object). So if it was already calculated, the same value is returned
			in the callback
			inConfig can contains:
				ignoreExtensions
					An Array of extension, including the "." to ignore
					Can be null or [].
					Example: [".DS_Store"]
		
				ignoreInvisible
					Boolean.
					IMPORTANT:
						If not passed or null, the default value is true, the invisible elements
						will be ignored
		
				canAddObject
					A function that will be called for all the non-prefiltered elements. Receives
					he full path tot he element *and* the fstats object (so there is no need to call
					fs.stats(thePath), and must returns true (keep it) or false (ignore)

				moduloForCallback
					The callback will be called every time the (count of objects  % moduloForCallback) is 0
					Notice that
						(1) Invisible or not "canAddObject" files are part of the count
						(2) But content of undisplayed folder is not
					Default value is 100. Minimum is 10


				concurrency
					An integer giving the number of threads to use for parallel parsing
					5 by default
					
			The callback receives (error, data), where datais an object with the following properties
					fullSizeInBytes
					countDirectories
					countFiles
						These counts are built after filtering. So for example, if there are
						100 files but 80 only are visible and ignoreInvisible is true, then
						countOfFiles will contain 80
					countObjects
						The total count of objects, directories + files, whetever their state and extension
					done
			The callback is called regularly, so caller can (if in UI fopr example) display
			some information about the progression.
			It is only when the callback returns true in data.done that caller knows all is
			done. In the mean time, the different values (fullSizeInBytes, countDirectories
			countFiles will be incremented)
			In case of error, done stays to false
		*/
		this.parse = function(inConfig, inCallBack) {
			if(_parsingInfo.parsingDone) {
				inCallBack(null, {	fullSizeInBytes : _parsingInfo.fullSizeInBytes,
									countDirectories : _parsingInfo.countDirectories,
									countFiles : _parsingInfo.countFiles,
									countObjects : _parsingInfo.totalCountOfObjects,
									done : true
								});
			} else {
			// Update inConfig
				if(typeof inConfig !=  "object" || inConfig == null) {
					inConfig = {};
				}

				if(! ("ignoreInvisible" in inConfig) || typeof inConfig.ignoreInvisible !== "boolean") {
					inConfig.ignoreInvisible = true;
				}

				if(! ("ignoreExtensions" in inConfig) || !Array.isArray(inConfig.ignoreExtensions)) {
					inConfig.ignoreExtensions = [];
				}
				inConfig.hasIgnoreExtensions = inConfig.ignoreExtensions.length > 0;

				if(! ("canAddObject" in inConfig) || typeof inConfig.canAddObject !==  "function") {
					inConfig.canAddObject = null;
				}
				inConfig.hasCanAddObjectCallback = inConfig.canAddObject !== null;

				if(! ("concurrency" in inConfig) || typeof inConfig.concurrency !== "number" || inConfig.concurrency < 1) {
					inConfig.concurrency = kDEFAULT_CONCURRENCY;
				}

				if(! ("moduloForCallback" in inConfig) || typeof inConfig.moduloForCallback !== "number" || inConfig.moduloForCallback < 1) {
					inConfig.moduloForCallback = kMODULO_FOR_CALLBACK;
				}
				doParse(_parsingInfo.path, inConfig, inCallBack);
			}
		}

	} // function DirectoryHandler
	

	//--------------------------------------
	//Class methods
	//--------------------------------------
	/*
	DirectoryHandler.parseDirectory = function(inPath, inConfig, inCallback) {
		// . . .
	}
	*/
	
	//--------------------------------------
	// Constants. Defined via getter/setter (the setter throw an error)
	//--------------------------------------
	

	
	
	//--------------------------------------
	// Give the object to the CommonJS module
	//--------------------------------------
	module.exports = DirectoryHandler;


}());