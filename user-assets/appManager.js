var AppManager = (function () {
    function AppManager() {
        this.logEvent("Starting application");
    }

	AppManager.prototype.pollingMonitor = function() {

		function runPollingMonitorFunction() {
			if (window.cti && (typeof window.cti.fnPollingMonitor === "function")) {
				window.cti.fnPollingMonitor();
			}
		}

		function runAuthCheckMonitor() {
		    if (window.cti && (typeof window.cti.fnAuthCheckMonitor === "function")) {
		        window.cti.fnAuthCheckMonitor();
		    }
		}

	    //var monitorInterval = parseInt(getMetadataValue('MonitorInterval', 10000), 10000);
		var monitorInterval = 10000;

		runPollingMonitorFunction();
		setInterval(function () {
			runPollingMonitorFunction();
		}, monitorInterval);

		runAuthCheckMonitor();
		setInterval(function () {
		    runAuthCheckMonitor();
		}, 2000);
	}
	
	// Log an event to console and append to the event log buffer, which can be displayed to in the UI if required
	//   message : Message text t be logged
	//   category : Message category. Free text, but suggest - debug | info | warning | error
    AppManager.prototype.logEvent = function (message, category) {
        var t = this.dateTimeDisplayStr();
        var c = (category || 'debug');
		var entry = c + (":: " + t + "  " + message);
		console.log(entry);
		var store = this.getCti(true);
		if (!store) { returns; }
		if (store.log == undefined) { store.log = []; }
		store.log.splice(0, 0, { "time": t, "type": c, "message": message });
		var l = store.log.length;
		var m = 200;
		if (l > m) {
		    store.log.splice(m, l-m);
		}
    }

    // Log an event to console and append to the event log buffer, which can be displayed to in the UI if required
    //   message : Message text t be logged
    //   errObjectOrString : err object - designed to deal with error processing from a callback function
    //   category : Message category. Free text, but suggest - debug | info | warning | error
    AppManager.prototype.logError = function (message, errObjectOrString, category) {
        var error = (typeof errObjectOrString === "object") ? JSON.stringify(errObjectOrString) : errObjectOrString;
        var logMessage = message;
        if (logMessage === undefined || logMessage == '') {
            logMessage = error || '(undefined error)';
        }
        else if (error !== undefined && error != '') {
            logMessage += ('; ' + error);
        }
        this.logEvent(logMessage, (category || 'error'));
    }

    AppManager.prototype.uploadFile = function (serverUri, fileURL) {
        var instance = this;

        function win(r) {
            var category = "error";
            if (r.responseCode == 200) {
                category = "info";
            }
            instance.logError("uploadFile complete", r, category);
        }

        function fail(error) {
            instance.logError("Error during uploadFile", error);
        }

        instance.logEvent("Upload file " + fileURL + " to " + serverUri, e);
        var uri = encodeURI(serverUri);

        try {
            var options = new FileUploadOptions();
            options.fileKey = "file";
            options.fileName = fileURL.substr(fileURL.lastIndexOf('/') + 1);
            options.mimeType = "text/plain";
            options.headers = instance.newHeaderData();

            var ft = new FileTransfer();
            ft.onprogress = function (progressEvent) {
            };
            ft.upload(fileURL, uri, win, fail, options);
        }
        catch (e) {
            instance.logError("Exception in uploadFile", e);
        }
    }

    // Helper function to compare if two dates are the same (ignoring time)
    AppManager.prototype.areDatesEqual = function (date1, date2) {
        var d1 = (typeof date1 === "string") ? new Date(date1) : date1;
        var d2 = (typeof date2 === "string") ? new Date(date2) : date2;
        return (d1 !== undefined && d2 !== undefined && d1.getFullYear() == d2.getFullYear() && d1.getMonth() == d2.getMonth() && d1.getDate() == d2.getDate());
    }

	// Gets a display friendly date time - for logging etc
	AppManager.prototype.dateTimeDisplayStr = function() {
		var d = new Date();
		var min = d.getMinutes();
		var sec = d.getSeconds();
		if (min < 10) {
			min = "0" + min;
		}
		if (sec < 10) {
			sec = "0" + sec;
		}
		var dateStr = d.getDate() + '/' + (d.getMonth()+1) + '/' + d.getFullYear();  
		return dateStr + ' ' + (d.getHours() + ':' + min + ':' + sec + '.' + d.getMilliseconds());
	}
	
	// Create a new guid. Obs.
	AppManager.prototype.newGuid = function() {
	  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
		var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
		return v.toString(16);
	  });  		
	}
	
	// Initialise an object with all of the default stuff we need in the API headers for every call
	AppManager.prototype.newHeaderData = function () {
		var details = {
			"messageid": this.newGuid(),
			"messagedate": moment().format()
		}
		var store = this.getCti(true);
		if (!store) { return details; }
		details.applicationkey = store.schema.metadata.applicationkey;
        if (!store.currentProfile) { return details; }
		details.authtoken = store.currentProfile.token;
		return details;
	}

    // Is there a message of the given operation type already pending?
    // (Used to help us ensure we don't have more than one per type if we need to constrain in that way)
	AppManager.prototype.tracePendingByOperation = function (operation) {
	    var store = this.getCti(true);
	    if (!store || !store.messageTrace || store.messageTrace.length == 0) { return false; }

        // THis supposes that messages are deleted from the trace when concluded
	    for (var k in store.messageTrace) {
	        if (store.messageTrace[k].operation == operation) {
	            return true;
	        }
	    }
	    return false;
	}

    // Call this method to help with tracing the state of a message
	AppManager.prototype.traceMessageStart = function (operation, headers) {
	    var store = this.getCti(true);
	    if (!store) { return false; }
	    if (!store.messageTrace) { store.messageTrace = []; }

	    store.messageTrace.push({
	        "time": new Date().getTime(),
	        "operation": operation,
            "messageid": headers.messageid
	    });
	}

    // Call this method to complete tracing of the message
	AppManager.prototype.traceMessageComplete = function (messageid) {
	    return this._traceMessageCompleteByProperty('messageid', messageid);
	}

    // Call this method to complete tracing of the message
	AppManager.prototype.traceMessageCompleteByOperation = function (operation) {
	    return this._traceMessageCompleteByProperty('operation', operation);
	}

	AppManager.prototype._traceMessageCompleteByProperty = function (propertyName, propertyValue) {
	    var store = this.getCti(true);
	    if (!store || !store.messageTrace || store.messageTrace.length == 0) { return false; }
	    for (var k in store.messageTrace) {
	        if (store.messageTrace[k][propertyName] == propertyValue) {
	            store.messageTrace.splice(k, 1);
	            return true;
	        }
	    }
	    return false;
	}

	// Retrieve a keyed item from the app metadata
	AppManager.prototype.getMetadataValue = function(key, defaultValue) {
		var result = defaultValue;
		if (window.cti !== undefined && window.cti.store !== undefined && window.cti.store.schema.metadata !== undefined) {
			result = window.cti.store.schema.metadata[key];
			if (result == undefined || result == '') {
				result = defaultValue;
			}
		}
		logEvent('Retrieve metadata: ' + key + ' = ' + result);
		return result;
	}

	AppManager.prototype.getCti = function(useStore) {
	    var result = (window.cti === undefined) ? undefined : window.cti;
	    if (!result) { return undefined; }
	    return (useStore) ? result.store : result;
	}
	
	AppManager.prototype.saveToDatabase = function (recordKey, recordData, onSuccess, onFail) {
	    var pouch = new PouchDB("InfinityAppManager");
	    pouch.get(recordKey)
            .then(function (doc) {
                // Already have that key, it's an update
                pouch.put({ _id: recordKey, _rev: doc._rev, data: recordData })
                    .then(function (response) {
                        onSuccess(doc._rev);
                    })
                    .catch(function (err) {
                        onFail("Failed to update record", err);
                    });
            })
            .catch(function (err) {
                if (err.status == 404) {
                    pouch.put({ _id: recordKey, data: recordData })
                        .then(function (response) {
                            onSuccess("(new)");
                        })
                        .catch(function (err2) {
                            onFail("Failed to add record", err2);
                        })
                }
                else {
                    onFail("Failed to retrieve record", err);
                }
            })
	}

	AppManager.prototype.loadFromDatabase = function (recordKey, onSuccess, onFail) {
	    var pouch = new PouchDB("InfinityAppManager");
	    pouch.get(recordKey)
            .then(function (doc) {
                onSuccess(doc);
            })
            .catch(function (err) {
                if (err.status == 404) {
                    onFail("Record does not exist", err);
                }
                else {
                    onFail("Failed to retrieve record", err);
                }
            })
	}

	AppManager.prototype.deleteFromDatabase = function (recordKey, onSuccess, onFail) {
	    debugger;
	    var pouch = new PouchDB("InfinityAppManager");
	    pouch.get(recordKey)
            .then(function (doc) {
                db.remove(doc._id, doc._rev);
                onSuccess(doc._rev);
            })
            .catch(function (err) {
                if (err.status == 404) {
                    onSuccess("(none)");
                }
                else {
                    onFail("Failed to retrieve record", err);
                }
            })
	}

    return AppManager;
}());

function setStatusBarColor() {
    if (!window.device) {
        return false;
    }
    StatusBar.show();
    StatusBar.styleLightContent();
    StatusBar.backgroundColorByHexString("#dc4f10");
}

function startAppManager() {
    console.log("Starting appManager");
    setStatusBarColor();
	
	window.appManager = new AppManager();
	setTimeout(window.appManager.pollingMonitor, 100);
}

if (!window.device) {
    console.log("No device, manually start appManager");
    window.setTimeout(function () {
		startAppManager();
    }, 100);
}

document.removeEventListener('deviceready', startAppManager);
document.addEventListener('deviceready', startAppManager, true);
