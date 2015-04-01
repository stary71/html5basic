var openedDB;

onmessage = function (event) {
	self._indexedDB = self.indexedDB || self.mozIndexedDB || self.webkitIndexedDB || self.msIndexedDB;
	if(!self._indexedDB) {
		console.error("Your browser doesn't support using IndexedDB in Web Worker, sorry!");
		postMessage({error: "IndexedDB in Web Worker not supported"});
		return;
	}
	var store, storeName = "foundPrimes";
	if(!openedDB) {
		connectDB(function(db){
			openedDB = db;
			store = openedDB.transaction([storeName], "readwrite").objectStore(storeName);
			checkAPrime(event.data, store);
		});
	} else {
		store = openedDB.transaction([storeName], "readwrite").objectStore(storeName);
		checkAPrime(event.data, store);
	}
};


function checkAPrime(n, store) {
	var t, req, cursor;
	// Starting from "3":
	var keyRange = IDBKeyRange.lowerBound(2);
	store.openCursor(keyRange).onsuccess = function(event) {
		cursor = event.target.result;
		if (cursor) {
			t = cursor.value;
			if (t*t - 1 > n) {
				req = store.add(n);
				req.onerror = console.error;
				req.onsuccess = function() {
					postMessage({n: n, prime: true, key: req.result});
				}
			} else if(n%t == 0) {
				postMessage({n: n, prime: false});
			} else {
				cursor.continue();
			}
		}
	};
}

function connectDB(fb){
    var request = self._indexedDB.open("primesDB", 1);
    request.onerror = function(error){
        console.error("Worker error:", error);
    };
    request.onsuccess = function(){
        fb(request.result);
    }
}
