/*	main.js

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

console.log("Ready to parse: " + dir.path);
console.log("Waiting a bit...");
function possiblyDoIt() {
	if(fs.existsSync("/Users/thibaud/Desktop/gogogo.txt")) {
		console.log("Go! Go! Go!");
		ZE_DO_IT();
	} else {
		console.log("NO GO");
		setTimeout(possiblyDoIt, 3000);
	}
}
possiblyDoIt();

function ZE_DO_IT() {

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
		},
		ignoreInvisible: true*/
		ignoreInvisible: true,
		moduloForCallback: 250
	}

	var deepestFoldersPath = [];
	var deepestFolders = [];
	var tStart = Date.now();
	var tEnd = Date.now();

	dir.parse(config, function(err, data) {

		if(err) {
			console.log("Y A ERREUR: " + err);
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
				//console.log(data.countObjects);
			}
		}
	});
} // ZE_DO_IT

/*
var http = require('http');
http.createServer(function (req, res) {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('Hello World\n');
}).listen(1337, '127.0.0.1');
*/
