/*	Small example showing how to use webworkers to work with dedicated preemptive threads
	trully working in parallel among the avilable CPUs. This comes with drawbakcs, since
	V8 is not thread safe itself, there is no way to share data. So you an't use require()
	for example. The only way to share data is via the postMessage() and onmessage mechanism
	of webworkers. Which is what is used in this example.

	This is released under the MIT license. Do whatever you want with it.
*/
var Worker = require('webworker-threads').Worker;

var kNUMBER_OF_WORKERS = 5; // actually, more than the number of CPUs - 1 (for main thread, is useless)

function doIt() {
	var aWorker,
		allWorkers = [],
		i,
		theQueue = [];

	for(i = 0; i < 20; i++) {
		theQueue.push("File " + i);
	}

	for(i = 0; i < kNUMBER_OF_WORKERS; i++) {
		aWorker = new Worker(function(){
		// =======================================================================
		// FROM NOW WE ARE TOTALLY ISOLATED FROM THE MAIN THREAD. CAN JUST
		// postMessage() and handle onmessage
		// =======================================================================

			// Used for fake duration of the work
			function getRandomInt(min, max) {
				return Math.floor(Math.random() * (max - min + 1)) + min;
			}

			var myId = "worker #" + this.thread.id,
				i, str, max;


			postMessage({kind: "status", message: "Here is " + myId + ". I'm ready"});

			console.log(myId + ": Asking for something to do");
			postMessage({kind: "readyToWork"});

			this.onmessage = function(event) {
				switch(event.data.kind) {
				case "quit":
					console.log(myId + ": Quitting");
					self.close();
					break;

				case "work":
					console.log(myId + ": starting to work on " + event.data.message + "...");
					// Can't use setTimeout() outside the main thread, and we want to see
					// the heavy processing on the CPUs
					max = getRandomInt(30000000, 50000000, 70000000, 100000000);
					for(i = 0; i < max; i++) {
						str = "" + i;
						// Say that every 10,000,000 we update main therad with our status
						if((i % 10000000) == 0) {
							postMessage({kind: "status", message: "work in progress: " + Math.floor((i/max) * 100) + "%'"});
						}
					}
					postMessage({kind: "status", message: "done"});
					// Maybe some cleanup of something
					postMessage({kind: "readyToWork"});
					break;
				}
			};
		});

		aWorker.onmessage = function(event) {
			// Here, the this object is the worker
			var theWorker = this;
			switch(event.data.kind) {

				case "status":
				console.log("RECEIVING STATUS " + event.data.message);
					if(event.data.message == "done") {
						console.log("Worker #" + theWorker.thread.id + " has finished processing an element");
					} else {
						console.log("Satus for worker #" + theWorker.thread.id + ": " + event.data.message);
					}
					break;

				case "readyToWork":
					console.log("Main thread receives the giveMeSomething message from worker " + theWorker.thread.id + ". Lenght of the queue: " + theQueue.length);
					if(theQueue.length > 0) {
						theWorker.postMessage({kind: "work", message: theQueue.shift()});
						console.log("Queue lenght is now: " + theQueue.length)
					} else {
						theWorker.postMessage({kind: "quit"});
					}
					break;

			default:
				console.log("WTF are you telling me?");
				break;
			}
			
		};

		allWorkers.push(aWorker);
	}
}
doIt();
