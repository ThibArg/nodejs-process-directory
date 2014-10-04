/*	main-v1.js

	To run this quick test:
		cd /path/to/v1-Naive-Sync
		node main-v1.js
*/
"use strict";
var path = require("path");
var fs = require("fs");
var util = require("util")
var DirectoryHandler = require("./DirectoryHandler-v1.js");
console.log("THE NAIVE-SYNC IMPLEMENTATION");
//var dir = new DirectoryHandler("/Users/thibaud/Desktop/Documents-for-import/");
//var dir = new DirectoryHandler("/Users/thibaud/GitHub/");
//var dir = new DirectoryHandler("/Users/thibaud/Documents");
var dir = new DirectoryHandler("/Users/thibaud/Pictures");

function formatToHumanReadable(inBytes) {
	var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'],
		idx;
    if (inBytes == 0) {
    	return '0';
    }

    idx = parseInt(Math.floor(Math.log(inBytes) / Math.log(1024)));
    return (inBytes / Math.pow(1024, idx)).toFixed(2) + ' ' + sizes[idx];
};

console.log("Ready to parse: " + dir.path);
var kWAIT_DURATION = 3000; // milliseconds
console.log("Waiting " + kWAIT_DURATION + "ms (let you start monitoring for example)");
setTimeout(function() {
	console.log("Parsing " + dir.path + "...");
	DO_IT();
}, kWAIT_DURATION);

function DO_IT() {

	var config = {
		/*
		canAddObject: function(inPath, inStats) {

			inStats = inStats || null;
			if(!inStats) {
				inStats = fs.statSync(inPath);
			}
			if(inStats.isDirectory() && path.basename(inPath) === "bin") {
				return false;
			}
			return true;
		},*/
		ignoreInvisible: true,
		moduloForCallback: 10000 //250
	}

	var deepestFoldersPath = [];
	var deepestFolders = [];
	var tStart = Date.now();
	var tEnd = Date.now();

	dir.parse(config, function(err, data) {

		if(err) {
			console.log("An error occured: " + err);
		} else {
			if(data.done) {
				tEnd = Date.now();
				console.log("DURATION: " + (tEnd - tStart) + "ms");
				console.log("DONE");
				//console.log("= = = = = = = = = ");
				console.log(JSON.stringify(data));
				console.log("= = = = = = = = = ");
				console.log("= = = = = = = = = ");
				//console.log(dir.getDeepestDirectoryPaths());
				console.log("= = = = = = = = = ");
				console.log("= = = = = = = = = ");
				//console.log( util.inspect(dir.getAsJSON(), {depth:null}));	
				console.log("= = = = = = = = = ");
				console.log("= = = = = = = = = ");

			} else {
				console.log("Parsed: " + data.countFiles + " files. Total size: " + formatToHumanReadable(data.fullSizeInBytes));
			}
		}
	});
} // DO_IT

/* To test how node responds to requests in the min thread:
var http = require('http');
http.createServer(function (req, res) {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('Hello World\n');
}).listen(1337, '127.0.0.1');
console.log("http server listening");
*/
