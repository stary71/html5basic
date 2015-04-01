/*
* Search for prime numbers using trial division
* by Andrey Glebov
* for HTML5 basic course task
* Have been tested and found satisfying in the following browsers:
	Chrome 41
	IE 11
	Opera 28
	Firefox 37 (too slow!!!)
*/

"use strict";

window._indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
window._IDBTransaction = window.IDBTransaction || window.mosIDBTransaction || window.webkitIDBTransaction || window.msIDBTransaction;
window._IDBKeyRange = window.IDBKeyRange || window.mosIDBKeyRange || window.webkitIDBKeyRange || window.msIDBKeyRange;
if(!(window.Worker && window.localStorage && window._indexedDB && window._IDBTransaction && window._IDBKeyRange)) {
	alert("Sorry, but some of the required features are not supported by your browser. The application can work incorrectly.");
}

window.addEventListener('load', function(e) {
	window.applicationCache.addEventListener('updateready', function(e) {
		if (window.applicationCache.status == window.applicationCache.UPDATEREADY) {
			window.applicationCache.swapCache();
			window.location.reload();
		}
	}, false);

	window.app = new PrimeSearchApp();

}, false);

window.utils = {
	renderVal: function(val, trg) {
		var dom = document.querySelector(trg);
		if (dom && val) {
			if (val.lbl) {
				dom.innerHTML = val.lbl;
			}
			if (val.cl) {
				dom.classList.add(val.cl);
			}
			if (val.oldCl) {
				dom.classList.remove(val.oldCl);
			}
		}
	},
	connectDB: function(fb){
		var self = this,
			storeName = "foundPrimes";
	    var request = _indexedDB.open("primesDB", 1);
	    request.onerror = function(error){
	        console.error(error);
	    };
	    request.onsuccess = function(){
    		fb(request.result);
	    }
	    request.onupgradeneeded = function(e){
	        e.currentTarget.result.createObjectStore(storeName, { autoIncrement: true });
    		self.connectDB(fb);
	    }
	},
	formatTime: function(ts) {
		var x = Math.floor( +ts / 1000 );
		var seconds = x % 60;
		x = Math.floor( x / 60 );
		var minutes = x % 60;
		x = Math.floor( x / 60 );
		var hours = x % 24;
		x = Math.floor( x / 24 );
		var days = Math.floor(x);
		return ((days > 0) ? days + "days " : "") + ((hours > 0 ) ? hours + " hours " : "") + ((minutes > 0) ? minutes + " min " : "") + ((seconds > 0) ? seconds + " sec" : (+ts < 1000) ? ts / 1000 + " sec" : "");
	}
}

function PrimeSearchApp() {
	this.model = new PrimeSearchModel();
	var self = this;
	window.utils.connectDB(function(primesDB) {
		self._primesDB = primesDB;
	});
	this.theWorker.onmessage = function (event) {
		if(event.data.error) {
			console.error(event.data.error);
			return;
		}
		self.model.numbersEnumerated = event.data.n;
		if(event.data.prime) {
			self.model.primesFound = event.data.key;
			self.model.lastPrimeFound = event.data.n;
		}
		self.model.saveToLocalStorage();
		self.render();
		if(self.model.isRunning) {
			self.triggerWorker();
		}
	}
	this.render();
}

PrimeSearchApp.STATE_RUNNING = {cl: "run", lbl: "running", oldCl: "stop"};
PrimeSearchApp.STATE_NOT_RUNNING = {cl: "stop", lbl: "not running", oldCl: "run"};
PrimeSearchApp.RUN = {lbl: "Start", cl: "passive", oldCl: "active"};
PrimeSearchApp.STOP = {lbl: "Stop", cl: "active", oldCl: "passive"};
PrimeSearchApp.RANGE = 10;
PrimeSearchApp.prototype = {
	render: function() {
		var p = this.model;
		utils.renderVal(p.isRunning ? PrimeSearchApp.STATE_RUNNING : PrimeSearchApp.STATE_NOT_RUNNING, "#state");
		utils.renderVal({lbl: p.numbersEnumerated.toString()}, "#numbersEnumerated");
		utils.renderVal({lbl: p.primesFound.toString()}, "#primesFound");
		utils.renderVal({lbl: p.lastPrimeFound.toString()}, "#lastPrimeFound");
		utils.renderVal(p.isRunning ? PrimeSearchApp.STOP : PrimeSearchApp.RUN, "#runBtn");
		utils.renderVal({lbl: p.runNum.toString()}, "#runNum");
		utils.renderVal({lbl: utils.formatTime(p.operatingTime)}, "#operatingTime");
		utils.renderVal({lbl: utils.formatTime(p.maxOperatingTime)}, "#maxOperatingTime");
		utils.renderVal({lbl: utils.formatTime(p.minOperatingTime)}, "#minOperatingTime");
	},
	toggleRunning: function() {
		if(!this._primesDB) return;

		this.model.isRunning = !this.model.isRunning;
		if (this.model.isRunning) {
			// Adding predefined values for the first time:
			if(+this.model.runNum == 0) {
				var self = this;
				var store = this._primesDB.transaction(["foundPrimes"], "readwrite").objectStore("foundPrimes");
		    	store.add(2).onerror = console.error;
		    	store.add(3).onerror = console.error;
		    	var req = store.add(5);
		    	req.onerror = console.error;
		    	req.onsuccess = function() {
		    		self.model.numbersEnumerated = 5,
		    		self.model.primesFound = 3,
		    		self.model.lastPrimeFound = 5,
					self.startTimer();
					self.model.runNum++;
					self.triggerWorker();
		    	};
			} else {
				this.startTimer();
				this.model.runNum++;
				this.triggerWorker();
			}
		} else {
			this.stopTimer();
		}
		this.model.saveToLocalStorage();
		this.render();
	},
	showResultTxt: function(paging) {
		if(!this._primesDB) return;

		if(!paging) {
			if(document.querySelector("#showTxtBtn").classList.contains('shown-content')) {
				utils.renderVal({cl: "hidden-content", oldCl: "shown-content"}, "#showTxtBtn");
			} else {
				utils.renderVal({cl: "shown-content", oldCl: "hidden-content"}, "#showTxtBtn");
			}
		}
		var store = this._primesDB.transaction(["foundPrimes"], "readonly").objectStore("foundPrimes");
		var keyRange = _IDBKeyRange.bound(this.model.startingIndex, this.model.startingIndex + PrimeSearchApp.RANGE - 1);
		var cursor, domString = "";
		store.openCursor(keyRange).onsuccess = function(event) {
			cursor = event.target.result;
			if (cursor) {
				domString += "<tr><td>" + cursor.key + "</td><td>" + cursor.value + "</td></tr>";
				cursor.continue();
			} else {
				utils.renderVal({lbl: domString}, "#txtOutput tbody");
			}
		};
	},
	showResultImg: function() {
		if(!this._primesDB) return;

		var canvas = document.createElement("canvas"),
		    size = Math.ceil(Math.sqrt(this.model.numbersEnumerated));
		    canvas.width = size;
		    canvas.height = size;
		var ctx = canvas.getContext("2d");
		var imgData = ctx.createImageData(size, size);
		var data = imgData.data;
	    var store = this._primesDB.transaction(["foundPrimes"], "readonly").objectStore("foundPrimes");

		store.openCursor().onsuccess = function(event) {
			var cursor = event.target.result;
			if (cursor) {
				// Makes the pixel opaque by setting the alpha value:
				data[(cursor.value - 1)*4 + 3] = 255;
				cursor.continue();
			} else {
				ctx.putImageData(imgData, 0, 0);
				var domTrg = document.querySelector("#canvasContainer");
				domTrg.innerHTML = "";
				domTrg.appendChild(canvas);
			}
		};
	},
	startTimer: function() {
		this._timeStamp = new Date();
		this._currentRunTimeStamp = new Date();
		var self = this;
		this._timer = setInterval(function() {
			self._calculateTime();
			self.render();
			self.model.saveToLocalStorage();
		}, 500);
	},
	stopTimer: function() {
		clearInterval(this._timer);
		this._calculateTime();
		var currentRunTimePast = new Date - this._currentRunTimeStamp;
		if(+this.model.minOperatingTime === 0) {
			this.model.minOperatingTime = currentRunTimePast;
		}
		this.model.minOperatingTime = Math.min(+this.model.minOperatingTime, currentRunTimePast);
		this.render();
		this.model.saveToLocalStorage();
	},
	triggerWorker: function() {
		// There's no reason to check even numbers:
		this.model.numbersEnumerated = +this.model.numbersEnumerated + 2;
		this.theWorker.postMessage(this.model.numbersEnumerated);
	},
	prev: function() {
		var startingIndex = this.model.startingIndex - PrimeSearchApp.RANGE;
		this.model.startingIndex = ( startingIndex > 1 ) ? startingIndex : 1;
		this.showResultTxt(true);
	},
	next: function() {
		var startingIndex = this.model.startingIndex + PrimeSearchApp.RANGE;
		var largestPossibleIndex = this.model.primesFound - PrimeSearchApp.RANGE + 1;
		largestPossibleIndex = (largestPossibleIndex > 1) ? largestPossibleIndex : 1;
		this.model.startingIndex = ( startingIndex < largestPossibleIndex ) ? startingIndex : largestPossibleIndex;
		this.showResultTxt(true);
	},
	first: function() {
		this.model.startingIndex = 1;
		this.showResultTxt(true);
	},
	last: function() {
		var largestPossibleIndex = this.model.primesFound - PrimeSearchApp.RANGE + 1;
		largestPossibleIndex = (largestPossibleIndex > 1) ? largestPossibleIndex : 1;
		this.model.startingIndex = largestPossibleIndex;
		this.showResultTxt(true);
	},
	_calculateTime: function() {
		var newTimestamp = new Date;
		var timePast = newTimestamp - this._timeStamp;
		var currentRunTimePast = newTimestamp - this._currentRunTimeStamp;
		this._timeStamp = newTimestamp;
		this.model.operatingTime = +this.model.operatingTime + timePast;
		this.model.maxOperatingTime = Math.max(+this.model.maxOperatingTime, currentRunTimePast);
	},
	theWorker: new Worker("primes.js")
};

function PrimeSearchModel() {
	this.updateFromLocalStorage();
}

PrimeSearchModel.VALUES_TO_STORE = ["numbersEnumerated", "primesFound", "lastPrimeFound", "runNum", "operatingTime", "maxOperatingTime", "minOperatingTime"];
PrimeSearchModel.prototype = {
	isRunning: false,
	numbersEnumerated: 0,
	primesFound: 0,
	lastPrimeFound: 0,
	runNum: 0,
	operatingTime: 0,
	maxOperatingTime: 0,
	minOperatingTime: 0,
	startingIndex: 1,
	updateFromLocalStorage: function() {
		if(!window.localStorage) return;
		var self = this;
		PrimeSearchModel.VALUES_TO_STORE.forEach(function(val){
			self[val] = localStorage[val] || self[val];
		});
	},
	saveToLocalStorage: function() {
		if(!window.localStorage) return;
		var self = this;
		PrimeSearchModel.VALUES_TO_STORE.forEach(function(val){
			localStorage[val] = self[val];
		});
	}
}
