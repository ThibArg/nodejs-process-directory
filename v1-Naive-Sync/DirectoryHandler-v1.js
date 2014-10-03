/*	DirectoryHandler-v1.js

	Naive and *synchronous* implementation: No multi sub-threads
	or whatever. Calling only synchronous sub-routines. Just calling
	synchronous APIs routines (fs.statSync(), fs.readdirSync(), ...).

	Because it's 100% synchronous, it locks the main thread during the whole
	parsing. If, for example, an http server was setup, it will not answer any
	request until the parsing is done.

	Pros: Easy code reading, easy debug. The parsing if the smallest part of
	the code. It is all that is arround (callback to caller, build the JSON
	tree, ...) which becomes the "complicated" part.
	Cons: Blocking. Blocking. Blocking. Not the node spirit

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
	function isHidden(inPath, isFolder) {
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
				cancelled : false
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

			// These properties are not enumerables, and some will be Object.Freeze()
			// pathsOfSubDirectories and deepestDirectoryPaths are calculated only
			// once, at first "get"
				treeAsJSON : null,
				pathsOfSubDirectories : null,
				deepestDirectoryPaths: null
			},

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
		/* ============================================================
		   ========================== PARSING =========================
		   ============================================================ */
		function buildFolderObject(inPath, inParent) {
			var obj = {
				path : inPath,
				name: path.basename(inPath),
				isFolder: true,
				folders: [],
				files: []
			};
			inParent.folders.push(obj);
			return obj;
		}

		function buildFileObject(inPath, inParent) {
			var obj = {
				name: path.basename(inPath),
				isFolder: false,
				parent: inParent
			};
			inParent.files.push(obj);
			return obj;
		}

		function canAddCurrentObject(inPath, inStats) {
			var ok = true,
				isFolder = inStats.isDirectory(),
				lowerCasePath;

			if(ok && dh_config.ignoreInvisible) {
        		ok = !isHidden(inPath, isFolder);
        	}

        	if(ok && dh_config.hasCanAddObjectCallback) {
        		ok = dh_config.canAddObject(inPath, stats);
        	}

        	if(ok && !isFolder) {
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

		function doParseSync(inDirectoryObj) {
			var anObj,
				stats,
				filesAndFolders,
				isDirectory;

			if(dh_callbackParameters.cancelled) {
				return;
			}

			if(inDirectoryObj == null) {
				// First call, 
				dh_parsingInfo.treeAsJSON = {
					folders: [],
					files: []
				}
				anObj = buildFolderObject(dh_parsingInfo.path, dh_parsingInfo.treeAsJSON);
				doParseSync(anObj);

			} else {
				stats = fs.statSync(inDirectoryObj.path);
				isDirectory = stats.isDirectory();
				if(!isDirectory) {
					throw new TypeError("inDirectoryObj.path should be a valid path to a directory while it is: " + inDirectoryObj.path);
				}

				runCallbackIfNeeded();

            	if(!dh_callbackParameters.cancelled && canAddCurrentObject(inDirectoryObj.path, stats)) {
            		dh_callbackParameters.countDirectories += 1;
	        		filesAndFolders = fs.readdirSync(inDirectoryObj.path);
	        		filesAndFolders.every(function(inSubFileOrFolder) {

	        			var fullPath, subStats;

	        			fullPath = resolve(inDirectoryObj.path, inSubFileOrFolder);
	        			subStats = fs.statSync(fullPath);

	        			if(subStats.isDirectory()) {
	        				anObj = buildFolderObject(fullPath, inDirectoryObj);
	        				doParseSync(anObj)
	        			} else {
	        				if(canAddCurrentObject(fullPath, subStats)) {
	        					dh_callbackParameters.countFiles += 1;
		            			dh_callbackParameters.fullSizeInBytes += subStats.size;
	        					anObj = buildFileObject(fullPath, inDirectoryObj);
	        				}
	        			}

	        			runCallbackIfNeeded();
	        			if(dh_callbackParameters.cancelled) {
	        				return false; // Stop the "every" loop
	        			} else {
	        				return true; // Continue the "every" loop
	        			}
    				});
            	}
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
					dh_parsingInfo.treeAsJSON.folders.forEach(function(inFolder) {
						buildSubDirectoryPaths(inFolder);
					});
				} else {
					dh_parsingInfo.pathsOfSubDirectories.push(inFolder.path);
					inFolder.folders.forEach(function(inSubFolder) {
						if(inSubFolder.folders.length > 0) {
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
					dh_parsingInfo.treeAsJSON.folders.forEach(function(inFolder) {
						buildDeepestDirectoryPaths(inFolder);
					});
				} else {
					inFolder.folders.forEach(function(inSubFolder) {
						if(inSubFolder.folders.length > 0) {
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
				inFolderObj.folders.forEach(function(inSubFolderObj) {
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
						The total count of objects, folders + files, whetever their state and extension
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
				doParseSync();
				runFinalCallback(true)
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