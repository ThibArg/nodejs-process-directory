/*	main-v2.js

*/
"use strict";
var path = require("path");
var fs = require("fs");
var util = require("util")
var DirectoryHandler = require("./DirectoryHandler-v2.js");
console.log("THE NAIVE-SYNC IMPLEMENTATION");
var dir = new DirectoryHandler("/Users/thibaud/Desktop/Documents-for-import/");
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
		
		canAddObject: function(inPath, inStats) {

			inStats = inStats || null;
			if(!inStats) {
				inStats = fs.statSync(inPath);
			}
			if(inStats.isDirectory() && path.basename(inPath) === "Lorem ipsum pdfs") {
				return false;
			}

			if(!inStats.isDirectory() && path.basename(inPath).indexOf("brochure-") == 0) {
				return false;
			}
			return true;
		},
		ignoreInvisible: true,
		moduloForCallback: 50
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

				/*
				dir.applyToFilesSync(function(inErr, inData) {
					console.log(inData.file);
					console.log(inData.count);
					if(inData.count % 200 == 0) {
						inData.truthCallback(false);
					}
				});
				*/			

				/*
				console.log("= = = = = = = = = ");
				console.log("= = = = = = = = = ");
				console.log(dir.pathOfSubDirectories);
				console.log("= = = = = = = = = ");
				console.log("= = = = = = = = = ");
				console.log("= = = = = = = = = ");
				console.log("= = = = = = = = = ");
				console.log(dir.deepestDirectoryPaths);
				*/
				
				//console.log(dir.pathOfSubDirectories);
				/*
				console.log("= = = = = = = = = ");
				console.log("= = = = = = = = = ");
				console.log("= = = = = = = = = ");
				console.log("= = = = = = = = = ");
				console.log(dir.getSubDirectoryPaths().length);
				console.log(dir.getDeepestDirectoryPaths().length);
				console.log("= = = = = = = = = ");
				console.log("= = = = = = = = = ");
				*/

				/*
				var c = 0;
				var d = 0;
				dir.applyToFiles(function(err, data) {
					if(err) {
						console.log("ERROR ? " + err);
					} else {
						c += 1;
						if(fs.statSync(data.file).isDirectory()) {
							d -= 1000000;
						} else {
							d += 2;
						}
						if((data.count) % 10000 === 0) {
							console.log(data.count);
						}
						data.truthCallback(true);
					}
				});

				console.log("Et hop: " + c + " - " + d);
				*/
				
				/*
				var a = dir.pathOfSubDirectories;
				var b = dir.getTOTO();
				var i;
				if(a.length !== b.length) {
					console.log("zob " + a.length  + " / " + b.length );
				} else {
					for(i = 0; i < a.length; i++) {
						if(a[i] !== b[i]) {
							console.log("Zob à indice " + i);
						}
					}
					console.log("DONE");
				}
				*/

			} else {
				//console.log(data.countObjects);
			}
		}
	});
} // ZE_DO_IT

var http = require('http');
http.createServer(function (req, res) {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('Hello World\n');
}).listen(1337, '127.0.0.1');

