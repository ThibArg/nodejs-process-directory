/*	DirectoryHandler-v2.js

	Naive "standard" async. implementation, with no multi sub-threads
	or whatever.Just calling syncrhnous APIs routines (fs.stat(),
	fs.readdir(), ...).
	So here, the "challenge" is to detect when the parsing is done :->

	This implementation is *partially* not blocking: It is asynch when
	getting a folder(s content), but when building the JSON tree for
	files, it is syncrhronous and blocking. If there are hundreds or
	thousands of files in the current folder, parsing them will block
	the main thred.

	This class assumes the directory is not modified while being processed. So for
	example, when the full size is calculated, it can be requested later and will return
	the same value.

	Small naming convention: Variables whose name start with "dh_" are instance variables

	(c) Nuxeo
	Thibaud Arguillere

	MIT License, do whatever you want with this
*/

(function scope_DirectoryHandler() {
	var fs = require("fs"),
		async = require('async'),
		os = require("os"),
		path = require("path"),
		resolve = path.resolve,
		util = require("util");

	var isMac = false,
		isLinux = false,
		isWindows = false;

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
		var dh_moduloForCallback,
			dh_config,
			dh_mainCallback,
			dh_callbackParameters = {
				fullSizeInBytes : 0,
				countDirectories : 0,
				countFiles : 0,
				countObjects : 0,
				done : false,
				cancelled : false,

				lastError : null
			},
			dh_parsingInfo = {
				path : null,
				fullSizeInBytes : -1,
				countDirectories : -1,
				countFiles : -1,
				totalCountOfObjects : -1,
				ignoredExtensions : null,
				ignoredInvisible : true,
				parsingDone : false,

			// These properties are not enumerables, and some will be Object.Freeze().
			// pathsOfSubDirectories and deepestDirectoryPaths are calculated only
			// once, at first "get"
				treeAsJSON : null,
				pathsOfSubDirectories : null,
				deepestDirectoryPaths: null
			},
			dh_parsingCount = 0,
			dh_continueParsing = true, // will be false if an error occured

			// atf means "Apply To File"
			dh_atfStopLoop = false,
			dh_atfCountFiles = 0;

		// We don't want to output the array of directory paths, except
		// With a dedicated getter
		Object.defineProperty(dh_parsingInfo, "pathsOfSubDirectories", { enumerable:false });
		Object.defineProperty(dh_parsingInfo, "treeAsJSON", { enumerable:false });
		Object.defineProperty(dh_parsingInfo, "deepestDirectoryPaths", { enumerable:false });


		//--------------------------------------
		// Constructor
		//--------------------------------------
		// We accept only a string, path to the directory
		if(	   typeof inPath === "string"
			&& inPath !== ""
			&& fs.existsSync(inPath)
			&& fs.statSync(inPath).isDirectory() ) {

			dh_parsingInfo.path = inPath;

		} else {
			throw new TypeError("inPath should be a valid path to a directory");
		}

		//--------------------------------------
		// Properties
		//--------------------------------------
		this.__defineGetter__('path', function() { return dh_parsingInfo.path; });
		this.__defineSetter__('path', function(inValue) { throw new TypeError("Cannot change the path"); });
		this.__defineGetter__('fullSizeInBytes', function() { return dh_parsingInfo.fullSizeInBytes; });
		this.__defineSetter__('fullSizeInBytes', function(inValue) { throw new TypeError("Cannot change the fullSizeInBytes"); });
		
		//--------------------------------------
		// Private functions
		//--------------------------------------
		/* =====================================
		   ============== PARSING ==============
		   ===================================== */
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

		function canAddCurrentObject(inPath, inStats) {
			var ok = true,
				isDirectory = inStats.isDirectory(),
				lowerCasePath;

			if(ok && dh_config.ignoreInvisible) {
        		ok = !isHidden(inPath, isDirectory);
        	}

        	if(ok && dh_config.hasCanAddObjectCallback) {
        		ok = dh_config.canAddObject(inPath, inStats);
        	}

        	if(ok && !isDirectory) {
        		if(ok && dh_config.hasIgnoreExtensions) {
        			lowerCasePath = inPath.toLowerCase();
            		dh_config.ignoreExtensions.every(function(inExt) {
            			if(inExt !== "" && lowerCasePath.indexOf(inExt, inExt.length - inExt.length) !== -1) {
            				ok = false;
            				return false;// Break the "every" loop
            			}
            		});
            	}
        	}

        	if(!ok && isDirectory) {
        		dh_parsingCount -= 1;
        	}

        	return ok;
		}

		function runCallbackIfNeeded() {
			if(!dh_callbackParameters.cancelled) {
    			dh_callbackParameters.countObjects += 1;
    			if((dh_callbackParameters.countObjects % dh_moduloForCallback) == 0) {
            		dh_mainCallback(
            			null,
            			dh_callbackParameters,
            			function(inDoCancel) {
            				if(inDoCancel) {
            					dh_callbackParameters.cancelled = true;
            					dh_continueParsing = false;
            				}
            			}
            		);
            	}
        	}
		}

		function runFinalCallback(inObj) {
			if(typeof inObj !== "boolean") {
				inMainCallback(inObj, dh_callbackParameters);
			} else {
				dh_parsingInfo.fullSizeInBytes = dh_callbackParameters.fullSizeInBytes;
				dh_parsingInfo.countDirectories = dh_callbackParameters.countDirectories;
				dh_parsingInfo.countFiles = dh_callbackParameters.countFiles;
				dh_parsingInfo.totalCountOfObjects = dh_callbackParameters.countObjects;
				dh_parsingInfo.ignoredExtensions = dh_config.ignoreInvisible;
				dh_parsingInfo.ignoredInvisible = dh_config.ignoreExtensions;

				// We freeze the tree so any caller getting it can't change its content.
				dh_parsingInfo.treeAsJSON = Object.freeze(dh_parsingInfo.treeAsJSON);

				dh_parsingInfo.parsingDone = true;

				dh_callbackParameters.done = true;
				dh_mainCallback(null, dh_callbackParameters);
			}
		}

		function stopParsingOnError(inErr) {
			dh_callbackParameters.lastError = inErr;
			dh_continueParsing = false;

			runFinalCallback(inErr);
		}

		function doParse(inDirectoryObj) {

			if(dh_callbackParameters.cancelled || !dh_continueParsing) {
				return;
			}

			if(inDirectoryObj == null) {
				// First call, 
				dh_parsingInfo.treeAsJSON = {
					directories: [],
					files: []
				}
				dh_parsingCount = 1;
				doParse( buildDirectoryObject(dh_parsingInfo.path, dh_parsingInfo.treeAsJSON) );

			} else {
				
				runCallbackIfNeeded();

				fs.stat(inDirectoryObj.path, function(inErr, inStats) {
					if(inErr) {
						stopParsingOnError(inErr);
					} else if(!inStats.isDirectory()) {
						throw new TypeError("inDirectoryObj.path should be a valid path to a directory while it is: " + inDirectoryObj.path);
					} else {
						if(!dh_callbackParameters.cancelled && canAddCurrentObject(inDirectoryObj.path, inStats)) {
							dh_callbackParameters.countDirectories += 1;
			        		fs.readdir(inDirectoryObj.path, function(inErr, inFilesAnFolders) {
			        			
								if(inFilesAnFolders.length == 0) {
									dh_parsingCount -= 1;
								}

			        			if(inErr) {
			        				stopParsingOnError(inErr);
			        			} else {
									var pending = inFilesAnFolders.length;

			        				// using every() so we can stop the loop
			        				inFilesAnFolders.every(function(inSubFileOrFolder) {
			        					var fullPath;
			        					fullPath = resolve(inDirectoryObj.path, inSubFileOrFolder);
			        					fs.stat(fullPath, function(inErr, inSubStats) {
			        						if(inErr) {
			        							stopParsingOnError(inErr);
			        						} else {
			        							if(inSubStats.isDirectory()) {
													dh_parsingCount += 1;
			        								doParse( buildDirectoryObject(fullPath, inDirectoryObj) );
			        							} else {
			        								runCallbackIfNeeded();
			        								if(canAddCurrentObject(fullPath, inSubStats)) {
							        					dh_callbackParameters.countFiles += 1;
								            			dh_callbackParameters.fullSizeInBytes += inSubStats.size;
							        					/*ignoreObj = */buildFileObject(fullPath, inDirectoryObj);
							        				}
			        							}
			        						}
			        						pending -= 1;
			        						if(pending < 1) {
			        							dh_parsingCount -= 1;
			        							if(dh_parsingCount < 1) {
			        								dh_continueParsing = false;
			        								runFinalCallback(true);
			        							}
			        						}
			        					}); // fs.stat

			        					// Continue or stop the every() loop
			        					return dh_continueParsing || dh_callbackParameters.cancelled;

			        				});  // inFilesAnFolders.every
			        			}
			        		}); // fs.readdir
						}
					}
				}); // fs.stat
			}
		}


		//--------------------------------------
		// Instance methods
		//--------------------------------------
		this.toString = function() {
			return JSON.stringify(dh_parsingInfo);
		};

		this.getAsJSON = function() {
			return dh_parsingInfo.treeAsJSON;
		};

		this.getSubDirectoryPaths = function() {

			function buildSubDirectoryPaths(inFolder) {
				if(typeof inFolder === "undefined" || inFolder == null) {
					// Firs call
					dh_parsingInfo.pathsOfSubDirectories = [];
					dh_parsingInfo.treeAsJSON.directories.forEach(function(inFolder) {
						buildSubDirectoryPaths(inFolder);
					});
				} else {
					dh_parsingInfo.pathsOfSubDirectories.push(inFolder.path);
					inFolder.directories.forEach(function(inSubFolder) {
						if(inSubFolder.directories.length > 0) {
							buildSubDirectoryPaths(inSubFolder);
						} else {
							dh_parsingInfo.pathsOfSubDirectories.push(inSubFolder.path);
						}
					});
				}
			}


			if(dh_parsingInfo.pathsOfSubDirectories == null) {
				if(!dh_parsingInfo.parsingDone) {
					throw new Error("Parsing has not be done yet");
				}
				buildSubDirectoryPaths();
				dh_parsingInfo.pathsOfSubDirectories = Object.freeze(dh_parsingInfo.pathsOfSubDirectories.sort());
			}
			return dh_parsingInfo.pathsOfSubDirectories;
		};

		this.getDeepestDirectoryPaths = function() {

			function buildDeepestDirectoryPaths(inFolder) {
				if(typeof inFolder === "undefined" || inFolder == null) {
					// Firs call
					dh_parsingInfo.deepestDirectoryPaths = [];
					dh_parsingInfo.treeAsJSON.directories.forEach(function(inFolder) {
						buildDeepestDirectoryPaths(inFolder);
					});
				} else {
					inFolder.directories.forEach(function(inSubFolder) {
						if(inSubFolder.directories.length > 0) {
							buildDeepestDirectoryPaths(inSubFolder);
						} else {
							dh_parsingInfo.deepestDirectoryPaths.push(inSubFolder.path);
						}
					});
				}
			}


			if(dh_parsingInfo.deepestDirectoryPaths == null) {
				if(!dh_parsingInfo.parsingDone) {
					throw new Error("Parsing has not be done yet");
				}
				buildDeepestDirectoryPaths();
				dh_parsingInfo.deepestDirectoryPaths = Object.freeze(dh_parsingInfo.deepestDirectoryPaths.sort());
			}
			return dh_parsingInfo.deepestDirectoryPaths;
		};


		function doOnFiles(inFolderObj, inCB) {
			if(!dh_atfStopLoop) {
				inFolderObj.files.every(function(inFileObj) {
					dh_atfCountFiles += 1;
					inCB(
						null,
						{
							file: resolve(inFileObj.parent.path, inFileObj.name),
							count: dh_atfCountFiles,
							truthCallback: function(inContinue) {
								if(!inContinue) {
									dh_atfStopLoop = true;
								}
							}
						}
					);
					
					return !dh_atfStopLoop; // Break this "every" loop if needed
				});
			}

			if(!dh_atfStopLoop) {
				inFolderObj.directories.forEach(function(inSubFolderObj) {
					doOnFiles(inSubFolderObj, inCB);
				});
			}
		}
		
		/*	applyToFilesSync()
		 *
		 *	WARNING: This is a *synchronous* call of iteratorCB on *all* the files
		 *	iteratorCB receives the regular nodejs 2 callback parameters
		 *		error: Here, it will always be null. The callback handles any error.
		 *		data: An object containing
		 *			file: The file to handle
		 *			count: The number of files already handled (including this one)
		 *			truthCallback:
		 *				A function which receives a true/false parameter to tell the
		 *				loop if it can continue.
		 *				Note: This is the truthCalback nodejs way of working (we could
		 *				just have asked for a callback to *return* true/false)
 		 */
		this.applyToFilesSync = function(iteratorCB) {
			if(!dh_parsingInfo.parsingDone) {
				throw new Error("The folder must be parsed before calling applyToFileSync");
			} else {
				dh_atfStopLoop = false;
				dh_atfCountFiles = 0;
				doOnFiles(dh_parsingInfo.treeAsJSON, iteratorCB);
			}
		}

		/*	parse()

			Calculated only once (assuming the folder never change during the life time
			of the object). So if it was already calculated, the same value is returned
			in the callback
			inConfig can contains:
				ignoreExtensions
					An Array of extensions, including the "." to ignore. Case insensitive
					Can be null or [].
					Example: [".DS_Store", ".jpeg"]
		
				ignoreInvisible
					Boolean.
					IMPORTANT:
						If not passed or null, the default value is true, the invisible elements
						will be ignored
		
				canAddObject
					A function that will be called for all the non-prefiltered elements. Receives
					the full path to the element *and* the fstats object (so there is no need to call
					fs.stat(thePath), and must return true (keep it) or false (ignore):
					function canAddObjCallback(inPath, inStats) {
						if(...)
						return true/false
					}

				moduloForCallback
					The callback will be called every time the (count of objects  % moduloForCallback) is 0
					Notice that
						(1) Invisible or not "canAddObject" files are part of the count
						(2) But content of undisplayed folder is not
					Default value is 100. Minimum is 10
					
			The callback receives (error, data), where data is an object with the following properties
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

			var arrayUtil;
			if(dh_parsingInfo.parsingDone) {
				inCallBack(null, {	fullSizeInBytes : dh_parsingInfo.fullSizeInBytes,
									countDirectories : dh_parsingInfo.countDirectories,
									countFiles : dh_parsingInfo.countFiles,
									countObjects : dh_parsingInfo.totalCountOfObjects,
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

				// Comparison is case insensitive. Prepare the array.
				if(! ("ignoreExtensions" in inConfig) || !Array.isArray(inConfig.ignoreExtensions)) {
					inConfig.ignoreExtensions = [];
				}
				arrayUtil = [];
				inConfig.ignoreExtensions.forEach(function(inExt) {
					arrayUtil.push(inExt.toLowerCase());
				});
				inConfig.ignoreExtensions = arrayUtil;
				inConfig.hasIgnoreExtensions = inConfig.ignoreExtensions.length > 0;

				if(! ("canAddObject" in inConfig) || typeof inConfig.canAddObject !==  "function") {
					inConfig.canAddObject = null;
				}
				inConfig.hasCanAddObjectCallback = inConfig.canAddObject !== null;

				if(! ("moduloForCallback" in inConfig) || typeof inConfig.moduloForCallback !== "number" || inConfig.moduloForCallback < 1) {
					inConfig.moduloForCallback = kMODULO_FOR_CALLBACK;
				}
				dh_moduloForCallback = inConfig.moduloForCallback;
				dh_config = inConfig;
				dh_mainCallback = inCallBack;
				doParse();
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