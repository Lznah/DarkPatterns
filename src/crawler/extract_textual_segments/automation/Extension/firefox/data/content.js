
function getPageScript() {
  // Intrumentation injection code is based on privacybadgerfirefox
  // https://github.com/EFForg/privacybadgerfirefox/blob/master/data/fingerprinting.js

  // code below is not a content script: no Firefox APIs should be used

  // return a string
  return "(" + function () {
    const OPENWPM_DEBUG = false;
    // from Underscore v1.6.0
    function debounce(func, wait, immediate) {
      var timeout, args, context, timestamp, result;

      var later = function () {
        var last = Date.now() - timestamp;
        if (last < wait) {
          timeout = setTimeout(later, wait - last);
        } else {
          timeout = null;
          if (!immediate) {
            result = func.apply(context, args);
            context = args = null;
          }
        }
      };

      return function () {
        context = this;
        args = arguments;
        timestamp = Date.now();
        var callNow = immediate && !timeout;
        if (!timeout) {
          timeout = setTimeout(later, wait);
        }
        if (callNow) {
          result = func.apply(context, args);
          context = args = null;
        }

        return result;
      };
    }
    // End of Debounce

    // messages the injected script
    var send = (function () {
      var messages = [];
      // debounce sending queued messages
      var _send = debounce(function () {
        document.dispatchEvent(new CustomEvent(event_id, {
          detail: messages
        }));

        // clear the queue
        messages = [];
      }, 100);

      return function (msgType, msg) {
        // queue the message
        messages.push({'type':msgType,'content':msg});
        _send();
      };
    }());

    var event_id = document.currentScript.getAttribute('data-event-id');

    /*
     * Instrumentation helpers
     */

    var testing = document.currentScript.getAttribute('data-testing') === 'true';

    console.log("Currently testing?",testing);

    // Recursively generates a path for an element
    function getPathToDomElement(element, visibilityAttr=false) {
      if(element == document.body)
        return element.tagName;
      if(element.parentNode == null)
        return 'NULL/' + element.tagName;

      var siblingIndex = 1;
      var siblings = element.parentNode.childNodes;
      for (var i = 0; i < siblings.length; i++) {
        var sibling = siblings[i];
        if (sibling == element) {
          var path = getPathToDomElement(element.parentNode, visibilityAttr);
          path += '/' + element.tagName + '[' + siblingIndex;
          path += ',' + element.id;
          path += ',' + element.className;
          if (visibilityAttr) {
            path += ',' + element.hidden;
            path += ',' + element.style.display;
            path += ',' + element.style.visibility;
          }
          if(element.tagName == 'A')
            path += ',' + element.href;
          path += ']';
          return path;
        }
        if (sibling.nodeType == 1 && sibling.tagName == element.tagName)
          siblingIndex++;
      }
    }

    // Helper for JSONifying objects
    function serializeObject(object, stringifyFunctions=false) {

      // Handle permissions errors
      try {
        if(object == null)
          return "null";
        if(typeof object == "function") {
          if (stringifyFunctions)
            return object.toString();
          else
            return "FUNCTION";
        }
        if(typeof object != "object")
          return object;
        var seenObjects = [];
        return JSON.stringify(object, function(key, value) {
          if(value == null)
            return "null";
          if(typeof value == "function") {
            if (stringifyFunctions)
              return value.toString();
            else
              return "FUNCTION";
          }
          if(typeof value == "object") {
            // Remove wrapping on content objects
            if("wrappedJSObject" in value) {
              value = value.wrappedJSObject;
            }

            // Serialize DOM elements
            if(value instanceof HTMLElement)
              return getPathToDomElement(value);

            // Prevent serialization cycles
            if(key == "" || seenObjects.indexOf(value) < 0) {
              seenObjects.push(value);
              return value;
            }
            else
              return typeof value;
          }
          return value;
        });
      } catch(error) {
        console.log("SERIALIZATION ERROR: " + error);
        return "SERIALIZATION ERROR: " + error;
      }
    }

    function logErrorToConsole(error) {
      console.log("Error name: " + error.name);
      console.log("Error message: " + error.message);
      console.log("Error filename: " + error.fileName);
      console.log("Error line number: " + error.lineNumber);
      console.log("Error stack: " + error.stack);
    }

    // Helper to get originating script urls
    function getStackTrace() {
      var stack;

      try {
        throw new Error();
      } catch (err) {
        stack = err.stack;
      }

      return stack;
    }

    // from http://stackoverflow.com/a/5202185
    String.prototype.rsplit = function(sep, maxsplit) {
      var split = this.split(sep);
      return maxsplit ? [split.slice(0, -maxsplit).join(sep)].concat(split.slice(-maxsplit)) : split;
    }

    function getOriginatingScriptContext(getCallStack=false) {
      var trace = getStackTrace().trim().split('\n');
      // return a context object even if there is an error
      var empty_context = {scriptUrl: "",scriptLine: "",
                           scriptCol: "", funcName: "",
                           scriptLocEval: "", callStack: "" };
      if (trace.length < 4) {
        return empty_context;
      }
      // 0, 1 and 2 are OpenWPM's own functions (e.g. getStackTrace), skip them.
      var callSite = trace[3];
      if (!callSite){
        return empty_context;
      }
      /*
       * Stack frame format is simply: FUNC_NAME@FILENAME:LINE_NO:COLUMN_NO
       *
       * If eval or Function is involved we have an additional part after the FILENAME, e.g.:
       * FUNC_NAME@FILENAME line 123 > eval line 1 > eval:LINE_NO:COLUMN_NO
       * or FUNC_NAME@FILENAME line 234 > Function:LINE_NO:COLUMN_NO
       *
       * We store the part between the FILENAME and the LINE_NO in scriptLocEval
       */
      try{
        var scriptUrl = "";
        var scriptLocEval = ""; // for eval or Function calls
        var callSiteParts = callSite.split("@");
        var funcName = callSiteParts[0] || '';
        var items = callSiteParts[1].rsplit(":", 2);
        var columnNo = items[items.length-1];
        var lineNo = items[items.length-2];
        var scriptFileName = items[items.length-3] || '';
        var lineNoIdx = scriptFileName.indexOf(" line ");  // line in the URL means eval or Function
        if (lineNoIdx == -1){
          scriptUrl = scriptFileName;  // TODO: sometimes we have filename only, e.g. XX.js
        }else{
          scriptUrl = scriptFileName.slice(0, lineNoIdx);
          scriptLocEval = scriptFileName.slice(lineNoIdx+1, scriptFileName.length);
        }
        var callContext = {
          scriptUrl: scriptUrl,
          scriptLine: lineNo,
          scriptCol: columnNo,
          funcName: funcName,
          scriptLocEval: scriptLocEval,
          callStack: getCallStack ? trace.slice(3).join("\n").trim() : ""
        };
        return callContext;
      } catch (e) {
        console.log("Error parsing the script context", e, callSite);
        return empty_context;
      }
    }

    // Counter to cap # of calls logged for each script/api combination
    var maxLogCount = 500;
    var logCounter = new Object();
    function updateCounterAndCheckIfOver(scriptUrl, symbol) {
      var key = scriptUrl + '|' + symbol;
      if ((key in logCounter) && (logCounter[key] >= maxLogCount)) {
        return true;
      } else if (!(key in logCounter)) {
        logCounter[key] = 1;
      } else {
        logCounter[key] += 1;
      }
      return false;
    }

    // Prevent logging of gets arising from logging
    var inLog = false;

    // For gets, sets, etc. on a single value
    function logValue(instrumentedVariableName, value, operation, callContext, logSettings) {
      if(inLog)
        return;
      inLog = true;

      var overLimit = updateCounterAndCheckIfOver(callContext.scriptUrl, instrumentedVariableName);
      if (overLimit) {
        inLog = false;
        return;
      }

      var msg = {
        operation: operation,
        symbol: instrumentedVariableName,
        value: serializeObject(value, !!logSettings.logFunctionsAsStrings),
        scriptUrl: callContext.scriptUrl,
        scriptLine: callContext.scriptLine,
        scriptCol: callContext.scriptCol,
        funcName: callContext.funcName,
        scriptLocEval: callContext.scriptLocEval,
        callStack: callContext.callStack
      };

      try {
        send('logValue', msg);
      }
      catch(error) {
        console.log("Unsuccessful value log!");
        logErrorToConsole(error);
      }

      inLog = false;
    }

    // For functions
    function logCall(instrumentedFunctionName, args, callContext, logSettings) {
      if(inLog)
        return;
      inLog = true;

      var overLimit = updateCounterAndCheckIfOver(callContext.scriptUrl, instrumentedFunctionName);
      if (overLimit) {
        inLog = false;
        return;
      }

      try {
        // Convert special arguments array to a standard array for JSONifying
        var serialArgs = [ ];
        for(var i = 0; i < args.length; i++)
          serialArgs.push(serializeObject(args[i], !!logSettings.logFunctionsAsStrings));
        var msg = {
          operation: "call",
          symbol: instrumentedFunctionName,
          args: serialArgs,
          value: "",
          scriptUrl: callContext.scriptUrl,
          scriptLine: callContext.scriptLine,
          scriptCol: callContext.scriptCol,
          funcName: callContext.funcName,
          scriptLocEval: callContext.scriptLocEval,
          callStack: callContext.callStack
        }
        send('logCall', msg);
      }
      catch(error) {
        console.log("Unsuccessful call log: " + instrumentedFunctionName);
        logErrorToConsole(error);
      }
      inLog = false;
    }

    // For mutation summaries
    function logMutation(logType, nodeName, nodeId, innerText,
        visible, style, boundingRect, timeStamp, attrName, oldValue, newValue) {
      if(inLog)
        return;
      inLog = true;

      try {
        // Convert special arguments array to a standard array for JSONifying
        var msg = {
          logType: logType,
          nodeName: nodeName,
          nodeId: nodeId,
          attrName: attrName,
          oldValue: oldValue,
          newValue: newValue,
          visible: visible,
          width: Math.round(boundingRect.width),
          height: Math.round(boundingRect.height),
          top: Math.round(boundingRect.top),
          left: Math.round(boundingRect.left),
          style: style,
          innerText: innerText,
          mutationTimeStamp: timeStamp
        }
        send('logMutation', msg);
      }
      catch(error) {
        console.log("Unsuccessful call log: " + logMutation + "-" + logType);
        logErrorToConsole(error);
      }
      inLog = false;
    }

    // For segmentation results
    function logSegment(nodeName, nodeId, innerText, style, boundingRect, timeStamp, outerHtml,
        longestText, longestTextBoundingRect, longestTextStyle, longestTextBgColor, numButtons, numImgs, numAnchors, bgColor) {
      if(inLog)
        return;
      inLog = true;

      try {
        // Convert special arguments array to a standard array for JSONifying
        var msg = {
          nodeName: nodeName,
          nodeId: nodeId,
          width: Math.round(boundingRect.width),
          height: Math.round(boundingRect.height),
          top: Math.round(boundingRect.top),
          left: Math.round(boundingRect.left),
          style: style,
          innerText: innerText,
          outerHtml: outerHtml,
          longestText: longestText,
          longestTextWidth: Math.round(longestTextBoundingRect.width),
          longestTextHeight: Math.round(longestTextBoundingRect.height),
          longestTextTop: Math.round(longestTextBoundingRect.top),
          longestTextLeft: Math.round(longestTextBoundingRect.left),
          longestTextStyle: longestTextStyle,
          longestTextBgColor: longestTextBgColor,
          numButtons: numButtons,
          numImgs: numImgs,
          numAnchors: numAnchors,
          mutationTimeStamp: timeStamp,
          bgColor: bgColor
        }
        send('logSegment', msg);
      }
      catch(error) {
        console.log("Unsuccessful segment log: " + logSegment + "-" + nodeName);
        logErrorToConsole(error);
      }
      inLog = false;
    }

    function logInteraction(toggleElementCount, selectElementCount) {
      if(inLog)
        return;
      inLog = true;

      try {
        var msg = {
          toggleElementCount: toggleElementCount,
          selectElementCount: selectElementCount
        }

        send('logInteraction', msg);
      }
      catch(error) {
        console.log("Unsuccessful interaction log: " + logInteraction);
        logErrorToConsole(error);
      }
      inLog = false;
    }

    // Rough implementations of Object.getPropertyDescriptor and Object.getPropertyNames
    // See http://wiki.ecmascript.org/doku.php?id=harmony:extended_object_api
    Object.getPropertyDescriptor = function (subject, name) {
      var pd = Object.getOwnPropertyDescriptor(subject, name);
      var proto = Object.getPrototypeOf(subject);
      while (pd === undefined && proto !== null) {
        pd = Object.getOwnPropertyDescriptor(proto, name);
        proto = Object.getPrototypeOf(proto);
      }
      return pd;
    };

    Object.getPropertyNames = function (subject, name) {
      var props = Object.getOwnPropertyNames(subject);
      var proto = Object.getPrototypeOf(subject);
      while (proto !== null) {
        props = props.concat(Object.getOwnPropertyNames(proto));
        proto = Object.getPrototypeOf(proto);
      }
      // FIXME: remove duplicate property names from props
      return props;
    };

    /*
     *  Direct instrumentation of javascript objects
     */

    function isObject(object, propertyName) {
      try {
        var property = object[propertyName];
      } catch(error) {
        return false;
      }
      if (property === null) { // null is type "object"
        return false;
      }
      return typeof property === 'object';
    }

    function instrumentObject(object, objectName, logSettings={}) {
      // Use for objects or object prototypes
      //
      // Parameters
      // ----------
      //   object : Object
      //     Object to instrument
      //   objectName : String
      //     Name of the object to be instrumented (saved to database)
      //   logSettings : Object
      //     (optional) object that can be used to specify additional logging
      //     configurations. See available options below.
      //
      // logSettings options (all optional)
      // -------------------
      //   propertiesToInstrument : Array
      //     An array of properties to instrument on this object. Default is
      //     all properties.
      //   excludedProperties : Array
      //     Properties excluded from instrumentation. Default is an empty
      //     array.
      //   logCallStack : boolean
      //     Set to true save the call stack info with each property call.
      //     Default is `false`.
      //   logFunctionsAsStrings : boolean
      //     Set to true to save functional arguments as strings during
      //     argument serialization. Default is `false`.
      //   preventSets : boolean
      //     Set to true to prevent nested objects and functions from being
      //     overwritten (and thus having their instrumentation removed).
      //     Other properties (static values) can still be set with this is
      //     enabled. Default is `false`.
      //   recursive : boolean
      //     Set to `true` to recursively instrument all object properties of
      //     the given `object`. Default is `false`
      //     NOTE:
      //       (1)`logSettings['propertiesToInstrument']` does not propagate
      //           to sub-objects.
      //       (2) Sub-objects of prototypes can not be instrumented
      //           recursively as these properties can not be accessed
      //           until an instance of the prototype is created.
      //   depth : integer
      //     Recursion limit when instrumenting object recursively.
      //     Default is `5`.
      var properties = logSettings.propertiesToInstrument ?
        logSettings.propertiesToInstrument : Object.getPropertyNames(object);
      for (var i = 0; i < properties.length; i++) {
        if (logSettings.excludedProperties &&
            logSettings.excludedProperties.indexOf(properties[i]) > -1) {
          continue;
        }
        // If `recursive` flag set we want to recursively instrument any
        // object properties that aren't the prototype object. Only recurse if
        // depth not set (at which point its set to default) or not at limit.
        if (!!logSettings.recursive && properties[i] != '__proto__' &&
            isObject(object, properties[i]) &&
            (!('depth' in logSettings) || logSettings.depth > 0)) {

          // set recursion limit to default if not specified
          if (!('depth' in logSettings)) {
            logSettings['depth'] = 5;
          }
          instrumentObject(object[properties[i]], objectName + '.' + properties[i], {
                'excludedProperties': logSettings['excludedProperties'],
                'logCallStack': logSettings['logCallStack'],
                'logFunctionsAsStrings': logSettings['logFunctionsAsStrings'],
                'preventSets': logSettings['preventSets'],
                'recursive': logSettings['recursive'],
                'depth': logSettings['depth'] - 1
          });
        }
        try {
          instrumentObjectProperty(object, objectName, properties[i], logSettings);
        } catch(error) {
          logErrorToConsole(error);
        }
      }
    }
    if (testing) {
      window.instrumentObject = instrumentObject;
    }

    // Log calls to a given function
    // This helper function returns a wrapper around `func` which logs calls
    // to `func`. `objectName` and `methodName` are used strictly to identify
    // which object method `func` is coming from in the logs
    function instrumentFunction(objectName, methodName, func, logSettings) {
      return function () {
        var callContext = getOriginatingScriptContext(!!logSettings.logCallStack);
        logCall(objectName + '.' + methodName, arguments, callContext, logSettings);
        return func.apply(this, arguments);
      };
    }

    // Log properties of prototypes and objects
    function instrumentObjectProperty(object, objectName, propertyName, logSettings={}) {

      // Store original descriptor in closure
      var propDesc = Object.getPropertyDescriptor(object, propertyName);
      if (!propDesc){
        console.error("Property descriptor not found for", objectName, propertyName, object);
        return;
      }

      // Instrument data or accessor property descriptors
      var originalGetter = propDesc.get;
      var originalSetter = propDesc.set;
      var originalValue = propDesc.value;

      // We overwrite both data and accessor properties as an instrumented
      // accessor property
      Object.defineProperty(object, propertyName, {
        configurable: true,
        get: (function() {
          return function() {
            var origProperty;
            var callContext = getOriginatingScriptContext(!!logSettings.logCallStack);

            // get original value
            if (originalGetter) { // if accessor property
              origProperty = originalGetter.call(this);
            } else if ('value' in propDesc) { // if data property
              origProperty = originalValue;
            } else {
              console.error("Property descriptor for",
                            objectName + '.' + propertyName,
                            "doesn't have getter or value?");
              logValue(objectName + '.' + propertyName, "",
                  "get(failed)", callContext, logSettings);
              return;
            }

            // Log `gets` except those that have instrumented return values
            // * All returned functions are instrumented with a wrapper
            // * Returned objects may be instrumented if recursive
            //   instrumentation is enabled and this isn't at the depth limit.
            if (typeof origProperty == 'function') {
              return instrumentFunction(objectName, propertyName, origProperty, logSettings);
            } else if (typeof origProperty == 'object' &&
              !!logSettings.recursive &&
              (!('depth' in logSettings) || logSettings.depth > 0)) {
              return origProperty;
            } else {
              logValue(objectName + '.' + propertyName, origProperty,
                  "get", callContext, logSettings);
              return origProperty;
            }
          }
        })(),
        set: (function() {
          return function(value) {
            var callContext = getOriginatingScriptContext(!!logSettings.logCallStack);
            var returnValue;

            // Prevent sets for functions and objects if enabled
            if (!!logSettings.preventSets && (
                typeof originalValue === 'function' ||
                typeof originalValue === 'object')) {
              logValue(objectName + '.' + propertyName, value,
                  "set(prevented)", callContext, logSettings);
              return value;
            }

            // set new value to original setter/location
            if (originalSetter) { // if accessor property
              returnValue = originalSetter.call(this, value);
            } else if ('value' in propDesc) { // if data property
              originalValue = value;
              returnValue = value;
            } else {
              console.error("Property descriptor for",
                            objectName + '.' + propertyName,
                            "doesn't have setter or value?");
              logValue(objectName + '.' + propertyName, value,
                  "set(failed)", callContext, logSettings);
              return value;
            }

            // log set
            logValue(objectName + '.' + propertyName, value,
                "set", callContext, logSettings);

            // return new value
            return returnValue;
          }
        })()
      });
    }

    /*
     * Start Instrumentation
     */
    // TODO: user should be able to choose what to instrument

    // Access to navigator properties
    var navigatorProperties = [ "appCodeName", "appName", "appVersion",
                                "buildID", "cookieEnabled", "doNotTrack",
                                "geolocation", "language", "languages",
                                "onLine", "oscpu", "platform", "product",
                                "productSub", "userAgent", "vendorSub",
                                "vendor" ];
    navigatorProperties.forEach(function(property) {
      instrumentObjectProperty(window.navigator, "window.navigator", property);
    });

    // Access to screen properties
    //instrumentObject(window.screen, "window.screen");
    // TODO: why do we instrument only two screen properties
    var screenProperties =  [ "pixelDepth", "colorDepth" ];
    screenProperties.forEach(function(property) {
      instrumentObjectProperty(window.screen, "window.screen", property);
    });

    // Access to plugins
    var pluginProperties = [ "name", "filename", "description", "version", "length"];
      for (var i = 0; i < window.navigator.plugins.length; i++) {
      let pluginName = window.navigator.plugins[i].name;
      pluginProperties.forEach(function(property) {
        instrumentObjectProperty(
            window.navigator.plugins[pluginName],
            "window.navigator.plugins[" + pluginName + "]", property);
      });
    }

    // Access to MIMETypes
    var mimeTypeProperties = [ "description", "suffixes", "type"];
    for (var i = 0; i < window.navigator.mimeTypes.length; i++) {
      let mimeTypeName = window.navigator.mimeTypes[i].type;
      mimeTypeProperties.forEach(function(property) {
        instrumentObjectProperty(
            window.navigator.mimeTypes[mimeTypeName],
            "window.navigator.mimeTypes[" + mimeTypeName + "]", property);
      });
    }
    // Name, localStorage, and sessionsStorage logging
    // Instrumenting window.localStorage directly doesn't seem to work, so the Storage
    // prototype must be instrumented instead. Unfortunately this fails to differentiate
    // between sessionStorage and localStorage. Instead, you'll have to look for a sequence
    // of a get for the localStorage object followed by a getItem/setItem for the Storage object.
    var windowProperties = [ "name", "localStorage", "sessionStorage" ];
    windowProperties.forEach(function(property) {
      instrumentObjectProperty(window, "window", property);
    });
    instrumentObject(window.Storage.prototype, "window.Storage");

    // Access to document.cookie
    instrumentObjectProperty(window.document, "window.document", "cookie", {
      logCallStack: true
    });

    // Access to canvas
    instrumentObject(window.HTMLCanvasElement.prototype,"HTMLCanvasElement");

    var excludedProperties = [ "quadraticCurveTo", "lineTo", "transform",
                               "globalAlpha", "moveTo", "drawImage",
                               "setTransform", "clearRect", "closePath",
                               "beginPath", "canvas", "translate" ];
    instrumentObject(
        window.CanvasRenderingContext2D.prototype,
        "CanvasRenderingContext2D",
        {'excludedProperties': excludedProperties}
    );

    // Access to webRTC
    instrumentObject(window.RTCPeerConnection.prototype,"RTCPeerConnection");

    // Access to Audio API
    instrumentObject(window.AudioContext.prototype, "AudioContext");
    instrumentObject(window.OfflineAudioContext.prototype, "OfflineAudioContext");
    instrumentObject(window.OscillatorNode.prototype, "OscillatorNode");
    instrumentObject(window.AnalyserNode.prototype, "AnalyserNode");
    instrumentObject(window.GainNode.prototype, "GainNode");
    instrumentObject(window.ScriptProcessorNode.prototype, "ScriptProcessorNode");
    console.log("Successfully started all instrumentation.");

    /*
     * Mutation Summary Library - Start
     */

    // Copyright 2011 Google Inc.
    //
    // Licensed under the Apache License, Version 2.0 (the "License");
    // you may not use this file except in compliance with the License.
    // You may obtain a copy of the License at
    //
    //         http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing, software
    // distributed under the License is distributed on an "AS IS" BASIS,
    // WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    // See the License for the specific language governing permissions and
    // limitations under the License.
    var __extends = this.__extends || function (d, b) {
        for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
        function __() { this.constructor = d; }
        __.prototype = b.prototype;
        d.prototype = new __();
    };
    var MutationObserverCtor;
    if (typeof WebKitMutationObserver !== 'undefined')
        MutationObserverCtor = WebKitMutationObserver;
    else
        MutationObserverCtor = MutationObserver;
    if (MutationObserverCtor === undefined) {
        console.error('DOM Mutation Observers are required.');
        console.error('https://developer.mozilla.org/en-US/docs/DOM/MutationObserver');
        throw Error('DOM Mutation Observers are required');
    }
    var NodeMap = (function () {
        function NodeMap() {
            this.nodes = [];
            this.values = [];
        }
        NodeMap.prototype.isIndex = function (s) {
            return +s === s >>> 0;
        };
        NodeMap.prototype.nodeId = function (node) {
            var id = node[NodeMap.ID_PROP];
            if (!id)
                id = node[NodeMap.ID_PROP] = NodeMap.nextId_++;
            return id;
        };
        NodeMap.prototype.set = function (node, value) {
            var id = this.nodeId(node);
            this.nodes[id] = node;
            this.values[id] = value;
        };
        NodeMap.prototype.get = function (node) {
            var id = this.nodeId(node);
            return this.values[id];
        };
        NodeMap.prototype.has = function (node) {
            return this.nodeId(node) in this.nodes;
        };
        NodeMap.prototype.delete = function (node) {
            var id = this.nodeId(node);
            delete this.nodes[id];
            this.values[id] = undefined;
        };
        NodeMap.prototype.keys = function () {
            var nodes = [];
            for (var id in this.nodes) {
                if (!this.isIndex(id))
                    continue;
                nodes.push(this.nodes[id]);
            }
            return nodes;
        };
        NodeMap.ID_PROP = '__mutation_summary_node_map_id__';
        NodeMap.nextId_ = 1;
        return NodeMap;
    })();
    /**
     *  var reachableMatchableProduct = [
     *  //  STAYED_OUT,  ENTERED,     STAYED_IN,   EXITED
     *    [ STAYED_OUT,  STAYED_OUT,  STAYED_OUT,  STAYED_OUT ], // STAYED_OUT
     *    [ STAYED_OUT,  ENTERED,     ENTERED,     STAYED_OUT ], // ENTERED
     *    [ STAYED_OUT,  ENTERED,     STAYED_IN,   EXITED     ], // STAYED_IN
     *    [ STAYED_OUT,  STAYED_OUT,  EXITED,      EXITED     ]  // EXITED
     *  ];
     */
    var Movement;
    (function (Movement) {
        Movement[Movement["STAYED_OUT"] = 0] = "STAYED_OUT";
        Movement[Movement["ENTERED"] = 1] = "ENTERED";
        Movement[Movement["STAYED_IN"] = 2] = "STAYED_IN";
        Movement[Movement["REPARENTED"] = 3] = "REPARENTED";
        Movement[Movement["REORDERED"] = 4] = "REORDERED";
        Movement[Movement["EXITED"] = 5] = "EXITED";
    })(Movement || (Movement = {}));
    function enteredOrExited(changeType) {
        return changeType === Movement.ENTERED || changeType === Movement.EXITED;
    }
    var NodeChange = (function () {
        function NodeChange(node, childList, attributes, characterData, oldParentNode, added, attributeOldValues, characterDataOldValue) {
            if (childList === void 0) { childList = false; }
            if (attributes === void 0) { attributes = false; }
            if (characterData === void 0) { characterData = false; }
            if (oldParentNode === void 0) { oldParentNode = null; }
            if (added === void 0) { added = false; }
            if (attributeOldValues === void 0) { attributeOldValues = null; }
            if (characterDataOldValue === void 0) { characterDataOldValue = null; }
            this.node = node;
            this.childList = childList;
            this.attributes = attributes;
            this.characterData = characterData;
            this.oldParentNode = oldParentNode;
            this.added = added;
            this.attributeOldValues = attributeOldValues;
            this.characterDataOldValue = characterDataOldValue;
            this.isCaseInsensitive =
                this.node.nodeType === Node.ELEMENT_NODE &&
                    this.node instanceof HTMLElement &&
                    this.node.ownerDocument instanceof HTMLDocument;
        }
        NodeChange.prototype.getAttributeOldValue = function (name) {
            if (!this.attributeOldValues)
                return undefined;
            if (this.isCaseInsensitive)
                name = name.toLowerCase();
            return this.attributeOldValues[name];
        };
        NodeChange.prototype.getAttributeNamesMutated = function () {
            var names = [];
            if (!this.attributeOldValues)
                return names;
            for (var name in this.attributeOldValues) {
                names.push(name);
            }
            return names;
        };
        NodeChange.prototype.attributeMutated = function (name, oldValue) {
            this.attributes = true;
            this.attributeOldValues = this.attributeOldValues || {};
            if (name in this.attributeOldValues)
                return;
            this.attributeOldValues[name] = oldValue;
        };
        NodeChange.prototype.characterDataMutated = function (oldValue) {
            if (this.characterData)
                return;
            this.characterData = true;
            this.characterDataOldValue = oldValue;
        };
        // Note: is it possible to receive a removal followed by a removal. This
        // can occur if the removed node is added to an non-observed node, that
        // node is added to the observed area, and then the node removed from
        // it.
        NodeChange.prototype.removedFromParent = function (parent) {
            this.childList = true;
            if (this.added || this.oldParentNode)
                this.added = false;
            else
                this.oldParentNode = parent;
        };
        NodeChange.prototype.insertedIntoParent = function () {
            this.childList = true;
            this.added = true;
        };
        // An node's oldParent is
        //   -its present parent, if its parentNode was not changed.
        //   -null if the first thing that happened to it was an add.
        //   -the node it was removed from if the first thing that happened to it
        //      was a remove.
        NodeChange.prototype.getOldParent = function () {
            if (this.childList) {
                if (this.oldParentNode)
                    return this.oldParentNode;
                if (this.added)
                    return null;
            }
            return this.node.parentNode;
        };
        return NodeChange;
    })();
    var ChildListChange = (function () {
        function ChildListChange() {
            this.added = new NodeMap();
            this.removed = new NodeMap();
            this.maybeMoved = new NodeMap();
            this.oldPrevious = new NodeMap();
            this.moved = undefined;
        }
        return ChildListChange;
    })();
    var TreeChanges = (function (_super) {
        __extends(TreeChanges, _super);
        function TreeChanges(rootNode, mutations) {
            _super.call(this);
            this.rootNode = rootNode;
            this.reachableCache = undefined;
            this.wasReachableCache = undefined;
            this.anyParentsChanged = false;
            this.anyAttributesChanged = false;
            this.anyCharacterDataChanged = false;
            for (var m = 0; m < mutations.length; m++) {
                var mutation = mutations[m];
                switch (mutation.type) {
                    case 'childList':
                        this.anyParentsChanged = true;
                        for (var i = 0; i < mutation.removedNodes.length; i++) {
                            var node = mutation.removedNodes[i];
                            this.getChange(node).removedFromParent(mutation.target);
                        }
                        for (var i = 0; i < mutation.addedNodes.length; i++) {
                            var node = mutation.addedNodes[i];
                            this.getChange(node).insertedIntoParent();
                        }
                        break;
                    case 'attributes':
                        this.anyAttributesChanged = true;
                        var change = this.getChange(mutation.target);
                        change.attributeMutated(mutation.attributeName, mutation.oldValue);
                        break;
                    case 'characterData':
                        this.anyCharacterDataChanged = true;
                        var change = this.getChange(mutation.target);
                        change.characterDataMutated(mutation.oldValue);
                        break;
                }
            }
        }
        TreeChanges.prototype.getChange = function (node) {
            var change = this.get(node);
            if (!change) {
                change = new NodeChange(node);
                this.set(node, change);
            }
            return change;
        };
        TreeChanges.prototype.getOldParent = function (node) {
            var change = this.get(node);
            return change ? change.getOldParent() : node.parentNode;
        };
        TreeChanges.prototype.getIsReachable = function (node) {
            if (node === this.rootNode)
                return true;
            if (!node)
                return false;
            this.reachableCache = this.reachableCache || new NodeMap();
            var isReachable = this.reachableCache.get(node);
            if (isReachable === undefined) {
                isReachable = this.getIsReachable(node.parentNode);
                this.reachableCache.set(node, isReachable);
            }
            return isReachable;
        };
        // A node wasReachable if its oldParent wasReachable.
        TreeChanges.prototype.getWasReachable = function (node) {
            if (node === this.rootNode)
                return true;
            if (!node)
                return false;
            this.wasReachableCache = this.wasReachableCache || new NodeMap();
            var wasReachable = this.wasReachableCache.get(node);
            if (wasReachable === undefined) {
                wasReachable = this.getWasReachable(this.getOldParent(node));
                this.wasReachableCache.set(node, wasReachable);
            }
            return wasReachable;
        };
        TreeChanges.prototype.reachabilityChange = function (node) {
            if (this.getIsReachable(node)) {
                return this.getWasReachable(node) ?
                    Movement.STAYED_IN : Movement.ENTERED;
            }
            return this.getWasReachable(node) ?
                Movement.EXITED : Movement.STAYED_OUT;
        };
        return TreeChanges;
    })(NodeMap);
    var MutationProjection = (function () {
        // TOOD(any)
        function MutationProjection(rootNode, mutations, selectors, calcReordered, calcOldPreviousSibling) {
            this.rootNode = rootNode;
            this.mutations = mutations;
            this.selectors = selectors;
            this.calcReordered = calcReordered;
            this.calcOldPreviousSibling = calcOldPreviousSibling;
            this.treeChanges = new TreeChanges(rootNode, mutations);
            this.entered = [];
            this.exited = [];
            this.stayedIn = new NodeMap();
            this.visited = new NodeMap();
            this.childListChangeMap = undefined;
            this.characterDataOnly = undefined;
            this.matchCache = undefined;
            this.processMutations();
        }
        MutationProjection.prototype.processMutations = function () {
            if (!this.treeChanges.anyParentsChanged &&
                !this.treeChanges.anyAttributesChanged)
                return;
            var changedNodes = this.treeChanges.keys();
            for (var i = 0; i < changedNodes.length; i++) {
                this.visitNode(changedNodes[i], undefined);
            }
        };
        MutationProjection.prototype.visitNode = function (node, parentReachable) {
            if (this.visited.has(node))
                return;
            this.visited.set(node, true);
            var change = this.treeChanges.get(node);
            var reachable = parentReachable;
            // node inherits its parent's reachability change unless
            // its parentNode was mutated.
            if ((change && change.childList) || reachable == undefined)
                reachable = this.treeChanges.reachabilityChange(node);
            if (reachable === Movement.STAYED_OUT)
                return;
            // Cache match results for sub-patterns.
            this.matchabilityChange(node);
            if (reachable === Movement.ENTERED) {
                this.entered.push(node);
            }
            else if (reachable === Movement.EXITED) {
                this.exited.push(node);
                this.ensureHasOldPreviousSiblingIfNeeded(node);
            }
            else if (reachable === Movement.STAYED_IN) {
                var movement = Movement.STAYED_IN;
                if (change && change.childList) {
                    if (change.oldParentNode !== node.parentNode) {
                        movement = Movement.REPARENTED;
                        this.ensureHasOldPreviousSiblingIfNeeded(node);
                    }
                    else if (this.calcReordered && this.wasReordered(node)) {
                        movement = Movement.REORDERED;
                    }
                }
                this.stayedIn.set(node, movement);
            }
            if (reachable === Movement.STAYED_IN)
                return;
            // reachable === ENTERED || reachable === EXITED.
            for (var child = node.firstChild; child; child = child.nextSibling) {
                this.visitNode(child, reachable);
            }
        };
        MutationProjection.prototype.ensureHasOldPreviousSiblingIfNeeded = function (node) {
            if (!this.calcOldPreviousSibling)
                return;
            this.processChildlistChanges();
            var parentNode = node.parentNode;
            var nodeChange = this.treeChanges.get(node);
            if (nodeChange && nodeChange.oldParentNode)
                parentNode = nodeChange.oldParentNode;
            var change = this.childListChangeMap.get(parentNode);
            if (!change) {
                change = new ChildListChange();
                this.childListChangeMap.set(parentNode, change);
            }
            if (!change.oldPrevious.has(node)) {
                change.oldPrevious.set(node, node.previousSibling);
            }
        };
        MutationProjection.prototype.getChanged = function (summary, selectors, characterDataOnly) {
            this.selectors = selectors;
            this.characterDataOnly = characterDataOnly;
            for (var i = 0; i < this.entered.length; i++) {
                var node = this.entered[i];
                var matchable = this.matchabilityChange(node);
                if (matchable === Movement.ENTERED || matchable === Movement.STAYED_IN)
                    summary.added.push(node);
            }
            var stayedInNodes = this.stayedIn.keys();
            for (var i = 0; i < stayedInNodes.length; i++) {
                var node = stayedInNodes[i];
                var matchable = this.matchabilityChange(node);
                if (matchable === Movement.ENTERED) {
                    summary.added.push(node);
                }
                else if (matchable === Movement.EXITED) {
                    summary.removed.push(node);
                }
                else if (matchable === Movement.STAYED_IN && (summary.reparented || summary.reordered)) {
                    var movement = this.stayedIn.get(node);
                    if (summary.reparented && movement === Movement.REPARENTED)
                        summary.reparented.push(node);
                    else if (summary.reordered && movement === Movement.REORDERED)
                        summary.reordered.push(node);
                }
            }
            for (var i = 0; i < this.exited.length; i++) {
                var node = this.exited[i];
                var matchable = this.matchabilityChange(node);
                if (matchable === Movement.EXITED || matchable === Movement.STAYED_IN)
                    summary.removed.push(node);
            }
        };
        MutationProjection.prototype.getOldParentNode = function (node) {
            var change = this.treeChanges.get(node);
            if (change && change.childList)
                return change.oldParentNode ? change.oldParentNode : null;
            var reachabilityChange = this.treeChanges.reachabilityChange(node);
            if (reachabilityChange === Movement.STAYED_OUT || reachabilityChange === Movement.ENTERED)
                throw Error('getOldParentNode requested on invalid node.');
            return node.parentNode;
        };
        MutationProjection.prototype.getOldPreviousSibling = function (node) {
            var parentNode = node.parentNode;
            var nodeChange = this.treeChanges.get(node);
            if (nodeChange && nodeChange.oldParentNode)
                parentNode = nodeChange.oldParentNode;
            var change = this.childListChangeMap.get(parentNode);
            if (!change)
                throw Error('getOldPreviousSibling requested on invalid node.');
            return change.oldPrevious.get(node);
        };
        MutationProjection.prototype.getOldAttribute = function (element, attrName) {
            var change = this.treeChanges.get(element);
            if (!change || !change.attributes)
                throw Error('getOldAttribute requested on invalid node.');
            var value = change.getAttributeOldValue(attrName);
            if (value === undefined)
                throw Error('getOldAttribute requested for unchanged attribute name.');
            return value;
        };
        MutationProjection.prototype.attributeChangedNodes = function (includeAttributes) {
            if (!this.treeChanges.anyAttributesChanged)
                return {}; // No attributes mutations occurred.
            var attributeFilter;
            var caseInsensitiveFilter;
            if (includeAttributes) {
                attributeFilter = {};
                caseInsensitiveFilter = {};
                for (var i = 0; i < includeAttributes.length; i++) {
                    var attrName = includeAttributes[i];
                    attributeFilter[attrName] = true;
                    caseInsensitiveFilter[attrName.toLowerCase()] = attrName;
                }
            }
            var result = {};
            var nodes = this.treeChanges.keys();
            for (var i = 0; i < nodes.length; i++) {
                var node = nodes[i];
                var change = this.treeChanges.get(node);
                if (!change.attributes)
                    continue;
                if (Movement.STAYED_IN !== this.treeChanges.reachabilityChange(node) ||
                    Movement.STAYED_IN !== this.matchabilityChange(node)) {
                    continue;
                }
                var element = node;
                var changedAttrNames = change.getAttributeNamesMutated();
                for (var j = 0; j < changedAttrNames.length; j++) {
                    var attrName = changedAttrNames[j];
                    if (attributeFilter &&
                        !attributeFilter[attrName] &&
                        !(change.isCaseInsensitive && caseInsensitiveFilter[attrName])) {
                        continue;
                    }
                    var oldValue = change.getAttributeOldValue(attrName);
                    if (oldValue === element.getAttribute(attrName))
                        continue;
                    if (caseInsensitiveFilter && change.isCaseInsensitive)
                        attrName = caseInsensitiveFilter[attrName];
                    result[attrName] = result[attrName] || [];
                    result[attrName].push(element);
                }
            }
            return result;
        };
        MutationProjection.prototype.getOldCharacterData = function (node) {
            var change = this.treeChanges.get(node);
            if (!change || !change.characterData)
                throw Error('getOldCharacterData requested on invalid node.');
            return change.characterDataOldValue;
        };
        MutationProjection.prototype.getCharacterDataChanged = function () {
            if (!this.treeChanges.anyCharacterDataChanged)
                return []; // No characterData mutations occurred.
            var nodes = this.treeChanges.keys();
            var result = [];
            for (var i = 0; i < nodes.length; i++) {
                var target = nodes[i];
                if (Movement.STAYED_IN !== this.treeChanges.reachabilityChange(target))
                    continue;
                var change = this.treeChanges.get(target);
                if (!change.characterData ||
                    target.textContent == change.characterDataOldValue)
                    continue;
                result.push(target);
            }
            return result;
        };
        MutationProjection.prototype.computeMatchabilityChange = function (selector, el) {
            if (!this.matchCache)
                this.matchCache = [];
            if (!this.matchCache[selector.uid])
                this.matchCache[selector.uid] = new NodeMap();
            var cache = this.matchCache[selector.uid];
            var result = cache.get(el);
            if (result === undefined) {
                result = selector.matchabilityChange(el, this.treeChanges.get(el));
                cache.set(el, result);
            }
            return result;
        };
        MutationProjection.prototype.matchabilityChange = function (node) {
            var _this = this;
            // TODO(rafaelw): Include PI, CDATA?
            // Only include text nodes.
            if (this.characterDataOnly) {
                switch (node.nodeType) {
                    case Node.COMMENT_NODE:
                    case Node.TEXT_NODE:
                        return Movement.STAYED_IN;
                    default:
                        return Movement.STAYED_OUT;
                }
            }
            // No element filter. Include all nodes.
            if (!this.selectors)
                return Movement.STAYED_IN;
            // Element filter. Exclude non-elements.
            if (node.nodeType !== Node.ELEMENT_NODE)
                return Movement.STAYED_OUT;
            var el = node;
            var matchChanges = this.selectors.map(function (selector) {
                return _this.computeMatchabilityChange(selector, el);
            });
            var accum = Movement.STAYED_OUT;
            var i = 0;
            while (accum !== Movement.STAYED_IN && i < matchChanges.length) {
                switch (matchChanges[i]) {
                    case Movement.STAYED_IN:
                        accum = Movement.STAYED_IN;
                        break;
                    case Movement.ENTERED:
                        if (accum === Movement.EXITED)
                            accum = Movement.STAYED_IN;
                        else
                            accum = Movement.ENTERED;
                        break;
                    case Movement.EXITED:
                        if (accum === Movement.ENTERED)
                            accum = Movement.STAYED_IN;
                        else
                            accum = Movement.EXITED;
                        break;
                }
                i++;
            }
            return accum;
        };
        MutationProjection.prototype.getChildlistChange = function (el) {
            var change = this.childListChangeMap.get(el);
            if (!change) {
                change = new ChildListChange();
                this.childListChangeMap.set(el, change);
            }
            return change;
        };
        MutationProjection.prototype.processChildlistChanges = function () {
            if (this.childListChangeMap)
                return;
            this.childListChangeMap = new NodeMap();
            for (var i = 0; i < this.mutations.length; i++) {
                var mutation = this.mutations[i];
                if (mutation.type != 'childList')
                    continue;
                if (this.treeChanges.reachabilityChange(mutation.target) !== Movement.STAYED_IN &&
                    !this.calcOldPreviousSibling)
                    continue;
                var change = this.getChildlistChange(mutation.target);
                var oldPrevious = mutation.previousSibling;
                function recordOldPrevious(node, previous) {
                    if (!node ||
                        change.oldPrevious.has(node) ||
                        change.added.has(node) ||
                        change.maybeMoved.has(node))
                        return;
                    if (previous &&
                        (change.added.has(previous) ||
                            change.maybeMoved.has(previous)))
                        return;
                    change.oldPrevious.set(node, previous);
                }
                for (var j = 0; j < mutation.removedNodes.length; j++) {
                    var node = mutation.removedNodes[j];
                    recordOldPrevious(node, oldPrevious);
                    if (change.added.has(node)) {
                        change.added.delete(node);
                    }
                    else {
                        change.removed.set(node, true);
                        change.maybeMoved.delete(node);
                    }
                    oldPrevious = node;
                }
                recordOldPrevious(mutation.nextSibling, oldPrevious);
                for (var j = 0; j < mutation.addedNodes.length; j++) {
                    var node = mutation.addedNodes[j];
                    if (change.removed.has(node)) {
                        change.removed.delete(node);
                        change.maybeMoved.set(node, true);
                    }
                    else {
                        change.added.set(node, true);
                    }
                }
            }
        };
        MutationProjection.prototype.wasReordered = function (node) {
            if (!this.treeChanges.anyParentsChanged)
                return false;
            this.processChildlistChanges();
            var parentNode = node.parentNode;
            var nodeChange = this.treeChanges.get(node);
            if (nodeChange && nodeChange.oldParentNode)
                parentNode = nodeChange.oldParentNode;
            var change = this.childListChangeMap.get(parentNode);
            if (!change)
                return false;
            if (change.moved)
                return change.moved.get(node);
            change.moved = new NodeMap();
            var pendingMoveDecision = new NodeMap();
            function isMoved(node) {
                if (!node)
                    return false;
                if (!change.maybeMoved.has(node))
                    return false;
                var didMove = change.moved.get(node);
                if (didMove !== undefined)
                    return didMove;
                if (pendingMoveDecision.has(node)) {
                    didMove = true;
                }
                else {
                    pendingMoveDecision.set(node, true);
                    didMove = getPrevious(node) !== getOldPrevious(node);
                }
                if (pendingMoveDecision.has(node)) {
                    pendingMoveDecision.delete(node);
                    change.moved.set(node, didMove);
                }
                else {
                    didMove = change.moved.get(node);
                }
                return didMove;
            }
            var oldPreviousCache = new NodeMap();
            function getOldPrevious(node) {
                var oldPrevious = oldPreviousCache.get(node);
                if (oldPrevious !== undefined)
                    return oldPrevious;
                oldPrevious = change.oldPrevious.get(node);
                while (oldPrevious &&
                    (change.removed.has(oldPrevious) || isMoved(oldPrevious))) {
                    oldPrevious = getOldPrevious(oldPrevious);
                }
                if (oldPrevious === undefined)
                    oldPrevious = node.previousSibling;
                oldPreviousCache.set(node, oldPrevious);
                return oldPrevious;
            }
            var previousCache = new NodeMap();
            function getPrevious(node) {
                if (previousCache.has(node))
                    return previousCache.get(node);
                var previous = node.previousSibling;
                while (previous && (change.added.has(previous) || isMoved(previous)))
                    previous = previous.previousSibling;
                previousCache.set(node, previous);
                return previous;
            }
            change.maybeMoved.keys().forEach(isMoved);
            return change.moved.get(node);
        };
        return MutationProjection;
    })();
    var Summary = (function () {
        function Summary(projection, query) {
            var _this = this;
            this.projection = projection;
            this.added = [];
            this.removed = [];
            this.reparented = query.all || query.element || query.characterData ? [] : undefined;
            this.reordered = query.all ? [] : undefined;
            projection.getChanged(this, query.elementFilter, query.characterData);
            if (query.all || query.attribute || query.attributeList) {
                var filter = query.attribute ? [query.attribute] : query.attributeList;
                var attributeChanged = projection.attributeChangedNodes(filter);
                if (query.attribute) {
                    this.valueChanged = attributeChanged[query.attribute] || [];
                }
                else {
                    this.attributeChanged = attributeChanged;
                    if (query.attributeList) {
                        query.attributeList.forEach(function (attrName) {
                            if (!_this.attributeChanged.hasOwnProperty(attrName))
                                _this.attributeChanged[attrName] = [];
                        });
                    }
                }
            }
            if (query.all || query.characterData) {
                var characterDataChanged = projection.getCharacterDataChanged();
                if (query.characterData)
                    this.valueChanged = characterDataChanged;
                else
                    this.characterDataChanged = characterDataChanged;
            }
            if (this.reordered)
                this.getOldPreviousSibling = projection.getOldPreviousSibling.bind(projection);
        }
        Summary.prototype.getOldParentNode = function (node) {
            return this.projection.getOldParentNode(node);
        };
        Summary.prototype.getOldAttribute = function (node, name) {
            return this.projection.getOldAttribute(node, name);
        };
        Summary.prototype.getOldCharacterData = function (node) {
            return this.projection.getOldCharacterData(node);
        };
        Summary.prototype.getOldPreviousSibling = function (node) {
            return this.projection.getOldPreviousSibling(node);
        };
        return Summary;
    })();
    // TODO(rafaelw): Allow ':' and '.' as valid name characters.
    var validNameInitialChar = /[a-zA-Z_]+/;
    var validNameNonInitialChar = /[a-zA-Z0-9_\-]+/;
    // TODO(rafaelw): Consider allowing backslash in the attrValue.
    // TODO(rafaelw): There's got a to be way to represent this state machine
    // more compactly???
    function escapeQuotes(value) {
        return '"' + value.replace(/"/, '\\\"') + '"';
    }
    var Qualifier = (function () {
        function Qualifier() {
        }
        Qualifier.prototype.matches = function (oldValue) {
            if (oldValue === null)
                return false;
            if (this.attrValue === undefined)
                return true;
            if (!this.contains)
                return this.attrValue == oldValue;
            var tokens = oldValue.split(' ');
            for (var i = 0; i < tokens.length; i++) {
                if (this.attrValue === tokens[i])
                    return true;
            }
            return false;
        };
        Qualifier.prototype.toString = function () {
            if (this.attrName === 'class' && this.contains)
                return '.' + this.attrValue;
            if (this.attrName === 'id' && !this.contains)
                return '#' + this.attrValue;
            if (this.contains)
                return '[' + this.attrName + '~=' + escapeQuotes(this.attrValue) + ']';
            if ('attrValue' in this)
                return '[' + this.attrName + '=' + escapeQuotes(this.attrValue) + ']';
            return '[' + this.attrName + ']';
        };
        return Qualifier;
    })();
    var Selector = (function () {
        function Selector() {
            this.uid = Selector.nextUid++;
            this.qualifiers = [];
        }
        Object.defineProperty(Selector.prototype, "caseInsensitiveTagName", {
            get: function () {
                return this.tagName.toUpperCase();
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Selector.prototype, "selectorString", {
            get: function () {
                return this.tagName + this.qualifiers.join('');
            },
            enumerable: true,
            configurable: true
        });
        Selector.prototype.isMatching = function (el) {
            return el[Selector.matchesSelector](this.selectorString);
        };
        Selector.prototype.wasMatching = function (el, change, isMatching) {
            if (!change || !change.attributes)
                return isMatching;
            var tagName = change.isCaseInsensitive ? this.caseInsensitiveTagName : this.tagName;
            if (tagName !== '*' && tagName !== el.tagName)
                return false;
            var attributeOldValues = [];
            var anyChanged = false;
            for (var i = 0; i < this.qualifiers.length; i++) {
                var qualifier = this.qualifiers[i];
                var oldValue = change.getAttributeOldValue(qualifier.attrName);
                attributeOldValues.push(oldValue);
                anyChanged = anyChanged || (oldValue !== undefined);
            }
            if (!anyChanged)
                return isMatching;
            for (var i = 0; i < this.qualifiers.length; i++) {
                var qualifier = this.qualifiers[i];
                var oldValue = attributeOldValues[i];
                if (oldValue === undefined)
                    oldValue = el.getAttribute(qualifier.attrName);
                if (!qualifier.matches(oldValue))
                    return false;
            }
            return true;
        };
        Selector.prototype.matchabilityChange = function (el, change) {
            var isMatching = this.isMatching(el);
            if (isMatching)
                return this.wasMatching(el, change, isMatching) ? Movement.STAYED_IN : Movement.ENTERED;
            else
                return this.wasMatching(el, change, isMatching) ? Movement.EXITED : Movement.STAYED_OUT;
        };
        Selector.parseSelectors = function (input) {
            var selectors = [];
            var currentSelector;
            var currentQualifier;
            function newSelector() {
                if (currentSelector) {
                    if (currentQualifier) {
                        currentSelector.qualifiers.push(currentQualifier);
                        currentQualifier = undefined;
                    }
                    selectors.push(currentSelector);
                }
                currentSelector = new Selector();
            }
            function newQualifier() {
                if (currentQualifier)
                    currentSelector.qualifiers.push(currentQualifier);
                currentQualifier = new Qualifier();
            }
            var WHITESPACE = /\s/;
            var valueQuoteChar;
            var SYNTAX_ERROR = 'Invalid or unsupported selector syntax.';
            var SELECTOR = 1;
            var TAG_NAME = 2;
            var QUALIFIER = 3;
            var QUALIFIER_NAME_FIRST_CHAR = 4;
            var QUALIFIER_NAME = 5;
            var ATTR_NAME_FIRST_CHAR = 6;
            var ATTR_NAME = 7;
            var EQUIV_OR_ATTR_QUAL_END = 8;
            var EQUAL = 9;
            var ATTR_QUAL_END = 10;
            var VALUE_FIRST_CHAR = 11;
            var VALUE = 12;
            var QUOTED_VALUE = 13;
            var SELECTOR_SEPARATOR = 14;
            var state = SELECTOR;
            var i = 0;
            while (i < input.length) {
                var c = input[i++];
                switch (state) {
                    case SELECTOR:
                        if (c.match(validNameInitialChar)) {
                            newSelector();
                            currentSelector.tagName = c;
                            state = TAG_NAME;
                            break;
                        }
                        if (c == '*') {
                            newSelector();
                            currentSelector.tagName = '*';
                            state = QUALIFIER;
                            break;
                        }
                        if (c == '.') {
                            newSelector();
                            newQualifier();
                            currentSelector.tagName = '*';
                            currentQualifier.attrName = 'class';
                            currentQualifier.contains = true;
                            state = QUALIFIER_NAME_FIRST_CHAR;
                            break;
                        }
                        if (c == '#') {
                            newSelector();
                            newQualifier();
                            currentSelector.tagName = '*';
                            currentQualifier.attrName = 'id';
                            state = QUALIFIER_NAME_FIRST_CHAR;
                            break;
                        }
                        if (c == '[') {
                            newSelector();
                            newQualifier();
                            currentSelector.tagName = '*';
                            currentQualifier.attrName = '';
                            state = ATTR_NAME_FIRST_CHAR;
                            break;
                        }
                        if (c.match(WHITESPACE))
                            break;
                        throw Error(SYNTAX_ERROR);
                    case TAG_NAME:
                        if (c.match(validNameNonInitialChar)) {
                            currentSelector.tagName += c;
                            break;
                        }
                        if (c == '.') {
                            newQualifier();
                            currentQualifier.attrName = 'class';
                            currentQualifier.contains = true;
                            state = QUALIFIER_NAME_FIRST_CHAR;
                            break;
                        }
                        if (c == '#') {
                            newQualifier();
                            currentQualifier.attrName = 'id';
                            state = QUALIFIER_NAME_FIRST_CHAR;
                            break;
                        }
                        if (c == '[') {
                            newQualifier();
                            currentQualifier.attrName = '';
                            state = ATTR_NAME_FIRST_CHAR;
                            break;
                        }
                        if (c.match(WHITESPACE)) {
                            state = SELECTOR_SEPARATOR;
                            break;
                        }
                        if (c == ',') {
                            state = SELECTOR;
                            break;
                        }
                        throw Error(SYNTAX_ERROR);
                    case QUALIFIER:
                        if (c == '.') {
                            newQualifier();
                            currentQualifier.attrName = 'class';
                            currentQualifier.contains = true;
                            state = QUALIFIER_NAME_FIRST_CHAR;
                            break;
                        }
                        if (c == '#') {
                            newQualifier();
                            currentQualifier.attrName = 'id';
                            state = QUALIFIER_NAME_FIRST_CHAR;
                            break;
                        }
                        if (c == '[') {
                            newQualifier();
                            currentQualifier.attrName = '';
                            state = ATTR_NAME_FIRST_CHAR;
                            break;
                        }
                        if (c.match(WHITESPACE)) {
                            state = SELECTOR_SEPARATOR;
                            break;
                        }
                        if (c == ',') {
                            state = SELECTOR;
                            break;
                        }
                        throw Error(SYNTAX_ERROR);
                    case QUALIFIER_NAME_FIRST_CHAR:
                        if (c.match(validNameInitialChar)) {
                            currentQualifier.attrValue = c;
                            state = QUALIFIER_NAME;
                            break;
                        }
                        throw Error(SYNTAX_ERROR);
                    case QUALIFIER_NAME:
                        if (c.match(validNameNonInitialChar)) {
                            currentQualifier.attrValue += c;
                            break;
                        }
                        if (c == '.') {
                            newQualifier();
                            currentQualifier.attrName = 'class';
                            currentQualifier.contains = true;
                            state = QUALIFIER_NAME_FIRST_CHAR;
                            break;
                        }
                        if (c == '#') {
                            newQualifier();
                            currentQualifier.attrName = 'id';
                            state = QUALIFIER_NAME_FIRST_CHAR;
                            break;
                        }
                        if (c == '[') {
                            newQualifier();
                            state = ATTR_NAME_FIRST_CHAR;
                            break;
                        }
                        if (c.match(WHITESPACE)) {
                            state = SELECTOR_SEPARATOR;
                            break;
                        }
                        if (c == ',') {
                            state = SELECTOR;
                            break;
                        }
                        throw Error(SYNTAX_ERROR);
                    case ATTR_NAME_FIRST_CHAR:
                        if (c.match(validNameInitialChar)) {
                            currentQualifier.attrName = c;
                            state = ATTR_NAME;
                            break;
                        }
                        if (c.match(WHITESPACE))
                            break;
                        throw Error(SYNTAX_ERROR);
                    case ATTR_NAME:
                        if (c.match(validNameNonInitialChar)) {
                            currentQualifier.attrName += c;
                            break;
                        }
                        if (c.match(WHITESPACE)) {
                            state = EQUIV_OR_ATTR_QUAL_END;
                            break;
                        }
                        if (c == '~') {
                            currentQualifier.contains = true;
                            state = EQUAL;
                            break;
                        }
                        if (c == '=') {
                            currentQualifier.attrValue = '';
                            state = VALUE_FIRST_CHAR;
                            break;
                        }
                        if (c == ']') {
                            state = QUALIFIER;
                            break;
                        }
                        throw Error(SYNTAX_ERROR);
                    case EQUIV_OR_ATTR_QUAL_END:
                        if (c == '~') {
                            currentQualifier.contains = true;
                            state = EQUAL;
                            break;
                        }
                        if (c == '=') {
                            currentQualifier.attrValue = '';
                            state = VALUE_FIRST_CHAR;
                            break;
                        }
                        if (c == ']') {
                            state = QUALIFIER;
                            break;
                        }
                        if (c.match(WHITESPACE))
                            break;
                        throw Error(SYNTAX_ERROR);
                    case EQUAL:
                        if (c == '=') {
                            currentQualifier.attrValue = '';
                            state = VALUE_FIRST_CHAR;
                            break;
                        }
                        throw Error(SYNTAX_ERROR);
                    case ATTR_QUAL_END:
                        if (c == ']') {
                            state = QUALIFIER;
                            break;
                        }
                        if (c.match(WHITESPACE))
                            break;
                        throw Error(SYNTAX_ERROR);
                    case VALUE_FIRST_CHAR:
                        if (c.match(WHITESPACE))
                            break;
                        if (c == '"' || c == "'") {
                            valueQuoteChar = c;
                            state = QUOTED_VALUE;
                            break;
                        }
                        currentQualifier.attrValue += c;
                        state = VALUE;
                        break;
                    case VALUE:
                        if (c.match(WHITESPACE)) {
                            state = ATTR_QUAL_END;
                            break;
                        }
                        if (c == ']') {
                            state = QUALIFIER;
                            break;
                        }
                        if (c == "'" || c == '"')
                            throw Error(SYNTAX_ERROR);
                        currentQualifier.attrValue += c;
                        break;
                    case QUOTED_VALUE:
                        if (c == valueQuoteChar) {
                            state = ATTR_QUAL_END;
                            break;
                        }
                        currentQualifier.attrValue += c;
                        break;
                    case SELECTOR_SEPARATOR:
                        if (c.match(WHITESPACE))
                            break;
                        if (c == ',') {
                            state = SELECTOR;
                            break;
                        }
                        throw Error(SYNTAX_ERROR);
                }
            }
            switch (state) {
                case SELECTOR:
                case TAG_NAME:
                case QUALIFIER:
                case QUALIFIER_NAME:
                case SELECTOR_SEPARATOR:
                    // Valid end states.
                    newSelector();
                    break;
                default:
                    throw Error(SYNTAX_ERROR);
            }
            if (!selectors.length)
                throw Error(SYNTAX_ERROR);
            return selectors;
        };
        Selector.nextUid = 1;
        Selector.matchesSelector = (function () {
            var element = document.createElement('div');
            if (typeof element['webkitMatchesSelector'] === 'function')
                return 'webkitMatchesSelector';
            if (typeof element['mozMatchesSelector'] === 'function')
                return 'mozMatchesSelector';
            if (typeof element['msMatchesSelector'] === 'function')
                return 'msMatchesSelector';
            return 'matchesSelector';
        })();
        return Selector;
    })();
    var attributeFilterPattern = /^([a-zA-Z:_]+[a-zA-Z0-9_\-:\.]*)$/;
    function validateAttribute(attribute) {
        if (typeof attribute != 'string')
            throw Error('Invalid request opion. attribute must be a non-zero length string.');
        attribute = attribute.trim();
        if (!attribute)
            throw Error('Invalid request opion. attribute must be a non-zero length string.');
        if (!attribute.match(attributeFilterPattern))
            throw Error('Invalid request option. invalid attribute name: ' + attribute);
        return attribute;
    }
    function validateElementAttributes(attribs) {
        if (!attribs.trim().length)
            throw Error('Invalid request option: elementAttributes must contain at least one attribute.');
        var lowerAttributes = {};
        var attributes = {};
        var tokens = attribs.split(/\s+/);
        for (var i = 0; i < tokens.length; i++) {
            var name = tokens[i];
            if (!name)
                continue;
            var name = validateAttribute(name);
            var nameLower = name.toLowerCase();
            if (lowerAttributes[nameLower])
                throw Error('Invalid request option: observing multiple case variations of the same attribute is not supported.');
            attributes[name] = true;
            lowerAttributes[nameLower] = true;
        }
        return Object.keys(attributes);
    }
    function elementFilterAttributes(selectors) {
        var attributes = {};
        selectors.forEach(function (selector) {
            selector.qualifiers.forEach(function (qualifier) {
                attributes[qualifier.attrName] = true;
            });
        });
        return Object.keys(attributes);
    }
    var MutationSummary = (function () {
        function MutationSummary(opts) {
            var _this = this;
            this.connected = false;
            this.options = MutationSummary.validateOptions(opts);
            this.observerOptions = MutationSummary.createObserverOptions(this.options.queries);
            this.root = this.options.rootNode;
            this.callback = this.options.callback;
            this.elementFilter = Array.prototype.concat.apply([], this.options.queries.map(function (query) {
                return query.elementFilter ? query.elementFilter : [];
            }));
            if (!this.elementFilter.length)
                this.elementFilter = undefined;
            this.calcReordered = this.options.queries.some(function (query) {
                return query.all;
            });
            this.queryValidators = []; // TODO(rafaelw): Shouldn't always define this.
            if (MutationSummary.createQueryValidator) {
                this.queryValidators = this.options.queries.map(function (query) {
                    return MutationSummary.createQueryValidator(_this.root, query);
                });
            }
            this.observer = new MutationObserverCtor(function (mutations) {
                _this.observerCallback(mutations);
            });
            this.reconnect();
        }
        MutationSummary.createObserverOptions = function (queries) {
            var observerOptions = {
                childList: true,
                subtree: true
            };
            var attributeFilter;
            function observeAttributes(attributes) {
                if (observerOptions.attributes && !attributeFilter)
                    return; // already observing all.
                observerOptions.attributes = true;
                observerOptions.attributeOldValue = true;
                if (!attributes) {
                    // observe all.
                    attributeFilter = undefined;
                    return;
                }
                // add to observed.
                attributeFilter = attributeFilter || {};
                attributes.forEach(function (attribute) {
                    attributeFilter[attribute] = true;
                    attributeFilter[attribute.toLowerCase()] = true;
                });
            }
            queries.forEach(function (query) {
                if (query.characterData) {
                    observerOptions.characterData = true;
                    observerOptions.characterDataOldValue = true;
                    return;
                }
                if (query.all) {
                    observeAttributes();
                    observerOptions.characterData = true;
                    observerOptions.characterDataOldValue = true;
                    return;
                }
                if (query.attribute) {
                    observeAttributes([query.attribute.trim()]);
                    return;
                }
                var attributes = elementFilterAttributes(query.elementFilter).concat(query.attributeList || []);
                if (attributes.length)
                    observeAttributes(attributes);
            });
            if (attributeFilter)
                observerOptions.attributeFilter = Object.keys(attributeFilter);
            return observerOptions;
        };
        MutationSummary.validateOptions = function (options) {
            for (var prop in options) {
                if (!(prop in MutationSummary.optionKeys))
                    throw Error('Invalid option: ' + prop);
            }
            if (typeof options.callback !== 'function')
                throw Error('Invalid options: callback is required and must be a function');
            if (!options.queries || !options.queries.length)
                throw Error('Invalid options: queries must contain at least one query request object.');
            var opts = {
                callback: options.callback,
                rootNode: options.rootNode || document,
                observeOwnChanges: !!options.observeOwnChanges,
                oldPreviousSibling: !!options.oldPreviousSibling,
                queries: []
            };
            for (var i = 0; i < options.queries.length; i++) {
                var request = options.queries[i];
                // all
                if (request.all) {
                    if (Object.keys(request).length > 1)
                        throw Error('Invalid request option. all has no options.');
                    opts.queries.push({ all: true });
                    continue;
                }
                // attribute
                if ('attribute' in request) {
                    var query = {
                        attribute: validateAttribute(request.attribute)
                    };
                    query.elementFilter = Selector.parseSelectors('*[' + query.attribute + ']');
                    if (Object.keys(request).length > 1)
                        throw Error('Invalid request option. attribute has no options.');
                    opts.queries.push(query);
                    continue;
                }
                // element
                if ('element' in request) {
                    var requestOptionCount = Object.keys(request).length;
                    var query = {
                        element: request.element,
                        elementFilter: Selector.parseSelectors(request.element)
                    };
                    if (request.hasOwnProperty('elementAttributes')) {
                        query.attributeList = validateElementAttributes(request.elementAttributes);
                        requestOptionCount--;
                    }
                    if (requestOptionCount > 1)
                        throw Error('Invalid request option. element only allows elementAttributes option.');
                    opts.queries.push(query);
                    continue;
                }
                // characterData
                if (request.characterData) {
                    if (Object.keys(request).length > 1)
                        throw Error('Invalid request option. characterData has no options.');
                    opts.queries.push({ characterData: true });
                    continue;
                }
                throw Error('Invalid request option. Unknown query request.');
            }
            return opts;
        };
        MutationSummary.prototype.createSummaries = function (mutations) {
            if (!mutations || !mutations.length)
                return [];
            var projection = new MutationProjection(this.root, mutations, this.elementFilter, this.calcReordered, this.options.oldPreviousSibling);
            var summaries = [];
            for (var i = 0; i < this.options.queries.length; i++) {
                summaries.push(new Summary(projection, this.options.queries[i]));
            }
            return summaries;
        };
        MutationSummary.prototype.checkpointQueryValidators = function () {
            this.queryValidators.forEach(function (validator) {
                if (validator)
                    validator.recordPreviousState();
            });
        };
        MutationSummary.prototype.runQueryValidators = function (summaries) {
            this.queryValidators.forEach(function (validator, index) {
                if (validator)
                    validator.validate(summaries[index]);
            });
        };
        MutationSummary.prototype.changesToReport = function (summaries) {
            return summaries.some(function (summary) {
                var summaryProps = ['added', 'removed', 'reordered', 'reparented',
                    'valueChanged', 'characterDataChanged'];
                if (summaryProps.some(function (prop) { return summary[prop] && summary[prop].length; }))
                    return true;
                if (summary.attributeChanged) {
                    var attrNames = Object.keys(summary.attributeChanged);
                    var attrsChanged = attrNames.some(function (attrName) {
                        return !!summary.attributeChanged[attrName].length;
                    });
                    if (attrsChanged)
                        return true;
                }
                return false;
            });
        };
        MutationSummary.prototype.observerCallback = function (mutations) {
            if (!this.options.observeOwnChanges)
                this.observer.disconnect();
            var summaries = this.createSummaries(mutations);
            this.runQueryValidators(summaries);
            if (this.options.observeOwnChanges)
                this.checkpointQueryValidators();
            if (this.changesToReport(summaries))
                this.callback(summaries);
            // disconnect() may have been called during the callback.
            if (!this.options.observeOwnChanges && this.connected) {
                this.checkpointQueryValidators();
                this.observer.observe(this.root, this.observerOptions);
            }
        };
        MutationSummary.prototype.reconnect = function () {
            if (this.connected)
                throw Error('Already connected');
            this.observer.observe(this.root, this.observerOptions);
            this.connected = true;
            this.checkpointQueryValidators();
        };
        MutationSummary.prototype.takeSummaries = function () {
            if (!this.connected)
                throw Error('Not connected');
            var summaries = this.createSummaries(this.observer.takeRecords());
            return this.changesToReport(summaries) ? summaries : undefined;
        };
        MutationSummary.prototype.disconnect = function () {
            var summaries = this.takeSummaries();
            this.observer.disconnect();
            this.connected = false;
            return summaries;
        };
        MutationSummary.NodeMap = NodeMap; // exposed for use in TreeMirror.
        MutationSummary.parseElementFilter = Selector.parseSelectors; // exposed for testing.
        MutationSummary.optionKeys = {
            'callback': true,
            'queries': true,
            'rootNode': true,
            'oldPreviousSibling': true,
            'observeOwnChanges': true
        };
        return MutationSummary;
    })();
    /*
     * Mutation Summary Library - End
     */

    /* Mutation Summary - Begin */
    var observerSummary;

    // simple memoization to cache getDefaultComputedStyle's output
    // should be tested before using with functions with multiple arguments
    // Modified from https://addyosmani.com/blog/faster-javascript-memoization/
    let memoize = function(func){
      let cache = {};
      return function(arg){
        if(arg in cache) {
          return cache[arg];
        }
        cache[arg] = func(arg);
        return cache[arg];
      }
    }

    let getMemoizedDefaultStyle = memoize(getDefaultComputedStyle);

    function getNonDefaultStyles(el){
      let t0 = performance.now();
      let defaultStyle = getMemoizedDefaultStyle(el);
      var t1 = performance.now();
      let computedStyle = getComputedStyle(el);
      if (computedStyle === null)
        return "";
      var t2 = performance.now();
      console.log("Call to getMemoizedDefaultStyle took " + (t1 - t0) + " milliseconds.");
      console.log("Call to getComputedStyle took " + (t2 - t1) + " milliseconds.");
      let nonDefaultStyle = {};
      let prop;  // CSS property
      var t3 = performance.now();
      for (let i = 0; i < computedStyle.length; i++){
        prop = computedStyle[i];
        if (computedStyle[prop] != defaultStyle[prop])
          nonDefaultStyle[prop] = computedStyle[prop];
      }
      var t4 = performance.now();
      console.log("Style comparison took " + (t4 - t3) + " milliseconds.");
      return JSON.stringify(nonDefaultStyle);
    }

    function getComputedStyleAsString(el){
      let t0 = performance.now();
      let computedStyle = getComputedStyle(el);
      if (computedStyle === null)
        return "";
      var t1 = performance.now();
      //console.log("Call to getComputedStyle took " + (t1 - t0) + " milliseconds.");
      let computedStyleObj = {};
      let prop;  // CSS property
      var t2 = performance.now();
      for (let i = 0; i < computedStyle.length; i++){
        prop = computedStyle[i];
        computedStyleObj[prop] = computedStyle[prop];
      }
      let styleConversionDuration = performance.now() - t2;
      if (styleConversionDuration > 500)
        console.log("Style conversion took " + styleConversionDuration + " milliseconds.");
      return JSON.stringify(computedStyleObj);
    }

    const TEXTNODE_NODETYPE = 3
    const ELEMENT_NODETYPE = 1

    function getNodeBoundingClientRect(node) {
      // node can be an element or a TextNode
      if (node.getBoundingClientRect)
        return node.getBoundingClientRect();

      // create a Range to find the bounding rect for textNodes
      // modifed from https://stackoverflow.com/a/6966613
      var range = document.createRange();
      range.selectNodeContents(node);
      if (range.getBoundingClientRect) {
        return range.getBoundingClientRect();
      }
      return null;
    }

    // Modified from https://stackoverflow.com/a/12418814
    function inViewport(node, boundingRect){
      let r = boundingRect,
        html = document.documentElement;
      return (
        !!r && r.bottom >= 0 && r.right >= 0 &&
        r.top <= html.clientHeight &&
        r.left <= html.clientWidth
      );
    }

    // TODO: Add other node types that we want to exclude
    const FILTERED_NODETYPES = ["SCRIPT", "STYLE", "DOCUMENT", "BODY",
      "IFRAME", "POLYGON", "SVG", "PATH", "POLYLINE", "RECT", "BR",
      "IMG", "HTML", "HR"];

    function shouldExclude(logType, node, isTextNode, summary){
      let tagNameToCheck = node.tagName;
      if (node.nodeType !== ELEMENT_NODETYPE && !isTextNode){
        console.log("Excluding element of type", node.tagName,
          node.nodeName, node.nodeType);
        return true;
      }

      if (isTextNode){
        // get parent's tagName for text nodes
        tagNameToCheck = logType == "NodeRemoved" ?
          summary.getOldParentNode(node).tagName:
          node.parentNode.tagName;
      }

      if (FILTERED_NODETYPES.includes(tagNameToCheck.toUpperCase())){
        console.log("Excluding element of type",
          node.tagName, node.nodeName, node.nodeType, tagNameToCheck)
        return true;
      }
      return false;
    }

    function logMutationSummary(logType, node, summary, timeStamp, attrName=""){
      let isTextNode = node.nodeType == TEXTNODE_NODETYPE;
      if (shouldExclude(logType, node, isTextNode, summary))
        return;

      let boundingRect = getNodeBoundingClientRect(node);
      let visible = logType == "NodeRemoved"? false : inViewport(node, boundingRect);
      if (!visible){
        console.log("Node is not in the viewport, will skip");
        return;
      }
      let oldValue = "",  // old char data or attribute value
        newValue = "";  // new attribute value
      if (logType == "CharacterDataChanged"){
        oldValue = summary.getOldCharacterData(node)
      }else if (logType == "AttributeChanged"){
        oldValue = summary.getOldAttribute(node, attrName);
        newValue = node.getAttribute(attrName);
      }
      let style = isTextNode ? "" : getNonDefaultStyles(node) + "";
      let innerText = node.innerText === undefined? "" : node.innerText.trim();
      const ENABLE_MUTATION_LOGS = 0
      if (ENABLE_MUTATION_LOGS)
        console.log(timeStamp, logType,
                  ", NodeName:", node.nodeName,
                  attrName? ", AttrName: " + attrName : "",
                  oldValue? ", Old Value: " + oldValue : "",
                  newValue? ", New Value: " + newValue : "",
                  ", InnerText:", innerText,
                  ", NodeId:", node.__mutation_summary_node_map_id__,
                  ", Visible:", visible,
                  ", Rect:", boundingRect,
                 // ", Style:", style
                    );
      // TODO: pass all the info that we want to store
      logMutation(logType, node.nodeName, node.__mutation_summary_node_map_id__,
          innerText, visible, style, boundingRect, timeStamp,
          attrName, oldValue, newValue);
    }

    const ENABLE_MUTATION_SUMMARY = false;
    if(ENABLE_MUTATION_SUMMARY){
      window.onload = setTimeout(function(){
        observerSummary = new MutationSummary({
          callback: handleSummary, queries: [{all: true}]});
      }, 1000);
    }
    /* Mutation Summary - End */
    /******************************************/

    /******************************************/
    /* Common JS - Start */
    const blockElements = ['div', 'section', 'article', 'aside', 'nav',
      'header', 'footer', 'main', 'form', 'fieldset', 'table'
    ];
    const ignoredElements = ['script', 'style', 'noscript', 'br', 'hr'];

    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;
    const winArea = winWidth * winHeight;

    var getElementArea = function(element) {
      var rect = element.getBoundingClientRect();
      return rect.height * rect.width;
    };

    var getClientRect = function(element) {
      if (element.tagName.toLowerCase() === 'html') {
        var w = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
        var h = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);

        return {
          top: 0,
          left: 0,
          bottom: h,
          right: w,
          width: w,
          height: h,
          x: 0,
          y: 0
        };
      }
      else {
        return element.getBoundingClientRect();
      }
    };

    var getBackgroundColor = function(element) {
      var style = window.getComputedStyle(element);
      var tagName = element.tagName.toLowerCase();

      if (style === null || style.backgroundColor === 'transparent') {
        var parent = element.parentElement;
        return (parent === null || tagName === 'body') ? 'rgb(255, 255, 255)' : getBackgroundColor(parent);
      }
      else {
        return style.backgroundColor;
      }
    };

    var getRandomSubarray = function(arr, size) {
      var shuffled = arr.slice(0),
        i = arr.length,
        temp, index;
      while (i--) {
        index = Math.floor((i + 1) * Math.random());
        temp = shuffled[index];
        shuffled[index] = shuffled[i];
        shuffled[i] = temp;
      }
      return shuffled.slice(0, size);
    };

    var elementCombinations = function(arguments) {
      var r = [],
        arg = arguments,
        max = arg.length - 1;

      function helper(arr, i) {
        for (var j = 0, l = arg[i].length; j < l; j++) {
          var a = arr.slice(0);
          a.push(arg[i][j])
          if (i === max) {
            r.push(a);
          } else
            helper(a, i + 1);
        }
      }
      helper([], 0);

      return r.length === 0 ? arguments : r;
    };

    var getVisibleChildren = function(element) {
      if (element) {
        var children = Array.from(element.children);
        return children.filter(child => isShown(child));
      } else {
        return [];
      }
    };

    var getParents = function(node) {
      const result = [];
      while (node = node.parentElement) {
        result.push(node);
      }
      return result;
    };

    var isShown = function(element) {
      var displayed = function(element, style) {
        if (!style) {
          style = window.getComputedStyle(element);
        }

        if (style.display === 'none') {
          return false;
        } else {
          var parent = element.parentNode;

          if (parent && (parent.nodeType === Node.DOCUMENT_NODE)) {
            return true;
          }

          return parent && displayed(parent, null);
        }
      };

      var getOpacity = function(element, style) {
        if (!style) {
          style = window.getComputedStyle(element);
        }

        if (style.position === 'relative') {
          return 1.0;
        } else {
          return parseFloat(style.opacity);
        }
      };

      var positiveSize = function(element, style) {
        if (!style) {
          style = window.getComputedStyle(element);
        }

        var tagName = element.tagName.toLowerCase();
        var rect = getClientRect(element);
        if (rect.height > 0 && rect.width > 0) {
          return true;
        }

        if (tagName == 'path' && (rect.height > 0 || rect.width > 0)) {
          var strokeWidth = element.strokeWidth;
          return !!strokeWidth && (parseInt(strokeWidth, 10) > 0);
        }

        return style.overflow !== 'hidden' && Array.from(element.childNodes).some(
          n => (n.nodeType === Node.TEXT_NODE && !!filterText(n.nodeValue)) ||
          (n.nodeType === Node.ELEMENT_NODE &&
            positiveSize(n) && window.getComputedStyle(n).display !== 'none')
        );
      };

      var getOverflowState = function(element) {
        var region = getClientRect(element);
        var htmlElem = document.documentElement;
        var bodyElem = document.body;
        var htmlOverflowStyle = window.getComputedStyle(htmlElem).overflow;
        var treatAsFixedPosition;

        function getOverflowParent(e) {
          var position = window.getComputedStyle(e).position;
          if (position === 'fixed') {
            treatAsFixedPosition = true;
            return e == htmlElem ? null : htmlElem;
          } else {
            var parent = e.parentElement;

            while (parent && !canBeOverflowed(parent)) {
              parent = parent.parentElement;
            }

            return parent;
          }

          function canBeOverflowed(container) {
            if (container == htmlElem) {
              return true;
            }

            var style = window.getComputedStyle(container);
            var containerDisplay = style.display;
            if (containerDisplay.startsWith('inline')) {
              return false;
            }

            if (position === 'absolute' && style.position === 'static') {
              return false;
            }

            return true;
          }
        }

        function getOverflowStyles(e) {
          var overflowElem = e;
          if (htmlOverflowStyle === 'visible') {
            if (e == htmlElem && bodyElem) {
              overflowElem = bodyElem;
            } else if (e == bodyElem) {
              return {
                x: 'visible',
                y: 'visible'
              };
            }
          }

          var ostyle = window.getComputedStyle(overflowElem);
          var overflow = {
            x: ostyle.overflowX,
            y: ostyle.overflowY
          };

          if (e == htmlElem) {
            overflow.x = overflow.x === 'visible' ? 'auto' : overflow.x;
            overflow.y = overflow.y === 'visible' ? 'auto' : overflow.y;
          }

          return overflow;
        }

        function getScroll(e) {
          if (e == htmlElem) {
            return {
              x: htmlElem.scrollLeft,
              y: htmlElem.scrollTop
            };
          } else {
            return {
              x: e.scrollLeft,
              y: e.scrollTop
            };
          }
        }

        for (var container = getOverflowParent(element); !!container; container =
          getOverflowParent(container)) {
          var containerOverflow = getOverflowStyles(container);

          if (containerOverflow.x === 'visible' && containerOverflow.y ===
            'visible') {
            continue;
          }

          var containerRect = getClientRect(container);

          if (containerRect.width == 0 || containerRect.height == 0) {
            return 'hidden';
          }

          var underflowsX = region.right < containerRect.left;
          var underflowsY = region.bottom < containerRect.top;

          if ((underflowsX && containerOverflow.x === 'hidden') || (underflowsY &&
              containerOverflow.y === 'hidden')) {
            return 'hidden';
          } else if ((underflowsX && containerOverflow.x !== 'visible') || (
              underflowsY && containerOverflow.y !== 'visible')) {
            var containerScroll = getScroll(container);
            var unscrollableX = region.right < containerRect.left -
              containerScroll.x;
            var unscrollableY = region.bottom < containerRect.top -
              containerScroll.y;
            if ((unscrollableX && containerOverflow.x !== 'visible') || (
                unscrollableY && containerOverflow.x !== 'visible')) {
              return 'hidden';
            }

            var containerState = getOverflowState(container);
            return containerState === 'hidden' ? 'hidden' : 'scroll';
          }

          var overflowsX = region.left >= containerRect.left + containerRect.width;
          var overflowsY = region.top >= containerRect.top + containerRect.height;

          if ((overflowsX && containerOverflow.x === 'hidden') || (overflowsY &&
              containerOverflow.y === 'hidden')) {
            return 'hidden';
          } else if ((overflowsX && containerOverflow.x !== 'visible') || (
              overflowsY && containerOverflow.y !== 'visible')) {
            if (treatAsFixedPosition) {
              var docScroll = getScroll(container);
              if ((region.left >= htmlElem.scrollWidth - docScroll.x) || (
                  region.right >= htmlElem.scrollHeight - docScroll.y)) {
                return 'hidden';
              }
            }

            var containerState = getOverflowState(container);
            return containerState === 'hidden' ? 'hidden' : 'scroll';
          }
        }

        return 'none';
      };

      function hiddenByOverflow(element) {
        return getOverflowState(element) === 'hidden' && Array.from(element.childNodes)
          .every(n => n.nodeType !== Node.ELEMENT_NODE || hiddenByOverflow(n) ||
            !positiveSize(n));
      }

      var tagName = element.tagName.toLowerCase();

      if (tagName === 'body') {
        return true;
      }

      if (tagName === 'input' && element.type.toLowerCase() === 'hidden') {
        return false;
      }

      if (tagName === 'noscript' || tagName === 'script' || tagName === 'style') {
        return false;
      }

      var style = window.getComputedStyle(element);

      if (style == null) {
        return false;
      }

      if (style.visibility === 'hidden' || style.visibility === 'collapse') {
        return false;
      }

      if (!displayed(element, style)) {
        return false;
      }

      if (getOpacity(element, style) === 0.0) {
        return false;
      }

      if (!positiveSize(element, style)) {
        return false;
      }

      return !hiddenByOverflow(element);
    };

    var isInteractable = function(element) {
      function isEnabled(element) {
        var disabledSupportElements = ['button', 'input', 'optgroup', 'option', 'select', 'textarea'];
        var tagName = element.tagName.toLowerCase();

        if (!disabledSupportElements.includes(tagName)) {
          return true;
        }

        if (element.getAttribute('disabled')) {
          return false;
        }

        if (element.parentElement && tagName === 'optgroup' || tagName === 'option') {
          return isEnabled(element.parentElement);
        }

        return true;
      }

      function arePointerEventsDisabled(element) {
        var style = window.getComputedStyle(element);
        if (!style) {
          return false;
        }

        return style.pointerEvents === 'none';
      }

      return isShown(element) && isEnabled(element) && !arePointerEventsDisabled(element);
    };

    var containsTextNodes = function(element) {
      if (element) {
        if (element.hasChildNodes()) {
          var nodes = [];
          for (var cnode of element.childNodes) {
            if (cnode.nodeType === Node.TEXT_NODE) {
              var text = filterText(cnode.nodeValue);
              if (text.length !== 0) {
                nodes.push(text);
              }
            }
          }

          return (nodes.length > 0 ? true : false);
        } else {
          return false;
        }
      } else {
        return false;
      }
    };

    var filterText = function(text) {
      return text.replace(/(\r\n|\n|\r)/gm, '').trim();
    };

    var isPixel = function(element) {
      var rect = element.getBoundingClientRect();
      var height = rect.bottom - rect.top;
      var width = rect.right - rect.left;

      return (height === 1 && width === 1);
    };

    var containsBlockElements = function(element, visibility = true) {
      for (var be of blockElements) {
        var children = Array.from(element.getElementsByTagName(be));
        if (visibility) {
          for (child of children){
            if (isShown(child))
              return true;
          }
        }
        else {
          return children.length > 0 ? true : false;
        }
      }

      return false;
    };

    var removeElement = function(array, element) {
      var index = array.indexOf(element);
      if (index > -1) {
        array.splice(index, 1);
        return array;
      } else {
        return array;
      }
    };

    var findElementWithParent = function(elements) {
      for (var i = 0; i < elements.length; i++) {
        var element = elements[i];
        var arr = elements.slice(0, i).concat(elements.slice(i + 1, elements.length));

        for (var other of arr) {
          if (other.contains(element)) {
            return {
              'element': elements[i],
              'parent': other
            };
          }
        }
      }

      return null;
    };

    var parentRemoval = function(elements, base) {
      var result = Array.from(elements);

      while (true) {
        var ep = findElementWithParent(result);

        if (ep) {
          if (base && ep.parent.tagName.toLowerCase() === base && ep.element
            .tagName.toLowerCase() !== ep.parent.tagName.toLowerCase()
          ) {
            result = removeElement(result, ep.element);
          } else {
            result = removeElement(result, ep.parent);
          }
        } else {
          break;
        }
      }

      return result;
    };

    var getElementsByXPath = function(xpath, parent, doc) {
      let results = [];
      let query = doc.evaluate(xpath,
        parent || doc,
        null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      for (let i = 0, length = query.snapshotLength; i < length; ++i) {
        results.push(query.snapshotItem(i));
      }
      return results;
    };

    var getXPathTo = function(element) {
      if (element.tagName == 'HTML')
        return '/HTML[1]';
      if (element === document.body)
        return '/HTML[1]/BODY[1]';

      var ix = 0;
      var siblings = element.parentNode.childNodes;
      for (var i = 0; i < siblings.length; i++) {
        var sibling = siblings[i];
        if (sibling === element)
          return getXPathTo(element.parentNode) + '/' + element.tagName + '[' + (
            ix + 1) + ']';
        if (sibling.nodeType === 1 && sibling.tagName === element.tagName)
          ix++;
      }
    };

    var getChildren = function(n, skipMe) {
      var r = [];
      for (; n; n = n.nextSibling)
        if (n.nodeType === 1 && n != skipMe)
          r.push(n);
      return r;
    };

    var getSiblings = function(n) {
      return getChildren(n.parentNode.firstChild, n);
    };


    var best = function(iterable, by, isBetter) {
      let bestSoFar, bestKeySoFar;
      let isFirst = true;

      for (var item of iterable) {
        const key = by(item);
        if (isBetter(key, bestKeySoFar) || isFirst) {
          bestSoFar = item;
          bestKeySoFar = key;
          isFirst = false;
        }
      }

      if (isFirst) {
        throw new Error('Tried to call best() on empty iterable');
      }
      return bestSoFar;
    };

    var minC = function(iterable, by = identity) {
      return best(iterable, by, (a, b) => a < b);
    };

    var flattenDeep = function(arr1) {
      return arr1.reduce((acc, val) => Array.isArray(val) ? acc.concat(
        flattenDeep(val)) : acc.concat(val), []);
    };

    var isWhitespace = function(element) {
      return (element.nodeType === element.TEXT_NODE &&
        element.textContent.trim().length === 0);
    };

    /**
     * Return the number of stride nodes between 2 DOM nodes *at the same
     * level of the tree*, without going up or down the tree.
     *
     * ``left`` xor ``right`` may also be undefined.
     */
    var numStrides = function(left, right) {
      let num = 0;

      // Walk right from left node until we hit the right node or run out:
      let sibling = left;
      let shouldContinue = sibling && sibling !== right;
      while (shouldContinue) {
        sibling = sibling.nextSibling;
        if ((shouldContinue = sibling && sibling !== right) &&
          !isWhitespace(sibling)) {
          num += 1;
        }
      }
      if (sibling !== right) { // Don't double-punish if left and right are siblings.
        // Walk left from right node:
        sibling = right;
        while (sibling) {
          sibling = sibling.previousSibling;
          if (sibling && !isWhitespace(sibling)) {
            num += 1;
          }
        }
      }
      return num;
    };

    /**
     * Return a topological distance between 2 DOM nodes or :term:`fnodes<fnode>`
     * weighted according to the similarity of their ancestry in the DOM. For
     * instance, if one node is situated inside ``<div><span><b><theNode>`` and the
     * other node is at ``<differentDiv><span><b><otherNode>``, they are considered
     * close to each other for clustering purposes. This is useful for picking out
     * nodes which have similar purposes.
     *
     * Return ``Number.MAX_VALUE`` if one of the nodes contains the other.
     *
     * This is largely an implementation detail of :func:`clusters`, but you can
     * call it yourself if you wish to implement your own clustering. Takes O(n log
     * n) time.
     *
     * Note that the default costs may change; pass them in explicitly if they are
     * important to you.
     *
     * @arg fnodeA {Node|Fnode}
     * @arg fnodeB {Node|Fnode}
     * @arg differentDepthCost {number} Cost for each level deeper one node is than
     *    the other below their common ancestor
     * @arg differentTagCost {number} Cost for a level below the common ancestor
     *    where tagNames differ
     * @arg sameTagCost {number} Cost for a level below the common ancestor where
     *    tagNames are the same
     * @arg strideCost {number} Cost for each stride node between A and B. Stride
     *     nodes are siblings or siblings-of-ancestors that lie between the 2
     *     nodes. These interposed nodes make it less likely that the 2 nodes
     *     should be together in a cluster.
     * @arg additionalCost {function} Return an additional cost, given 2 fnodes or
     *    nodes.
     *
     */
    var distance = function(fnodeA,
      fnodeB, {
        differentDepthCost = 2,
        differentTagCost = 2,
        sameTagCost = 1,
        strideCost = 1,
        additionalCost = (fnodeA, fnodeB) => 0
      } = {}) {
      // I was thinking of something that adds little cost for siblings. Up
      // should probably be more expensive than down (see middle example in the
      // Nokia paper).

      // TODO: Test and tune default costs. They're off the cuff at the moment.

      if (fnodeA === fnodeB) {
        return 0;
      }

      const elementA = fnodeA;
      const elementB = fnodeB;

      // Stacks that go from the common ancestor all the way to A and B:
      const aAncestors = [elementA];
      const bAncestors = [elementB];

      let aAncestor = elementA;
      let bAncestor = elementB;

      // Ascend to common parent, stacking them up for later reference:
      while (!aAncestor.contains(elementB)) { // Note: an element does contain() itself.
        aAncestor = aAncestor.parentNode;
        aAncestors.push(aAncestor); //aAncestors = [a, b]. aAncestor = b // if a is outer: no loop here; aAncestors = [a]. aAncestor = a.
      }

      // In compareDocumentPosition()'s opinion, inside implies after. Basically,
      // before and after pertain to opening tags.
      const comparison = elementA.compareDocumentPosition(elementB);

      // If either contains the other, abort. We'd either return a misleading
      // number or else walk upward right out of the document while trying to
      // make the ancestor stack.
      if (comparison & (elementA.DOCUMENT_POSITION_CONTAINS | elementA.DOCUMENT_POSITION_CONTAINED_BY)) {
        return Number.MAX_VALUE;
      }
      // Make an ancestor stack for the right node too so we can walk
      // efficiently down to it:
      do {
        bAncestor = bAncestor.parentNode; // Assumes we've early-returned above if A === B. This walks upward from the outer node and up out of the tree. It STARTS OUT with aAncestor === bAncestor!
        bAncestors.push(bAncestor);
      } while (bAncestor !== aAncestor);

      // Figure out which node is left and which is right, so we can follow
      // sibling links in the appropriate directions when looking for stride
      // nodes:
      let left = aAncestors;
      let right = bAncestors;
      let cost = 0;
      if (comparison & elementA.DOCUMENT_POSITION_FOLLOWING) {
        // A is before, so it could contain the other node. What did I mean to do if one contained the other?
        left = aAncestors;
        right = bAncestors;
      } else if (comparison & elementA.DOCUMENT_POSITION_PRECEDING) {
        // A is after, so it might be contained by the other node.
        left = bAncestors;
        right = aAncestors;
      }

      // Descend to both nodes in parallel, discounting the traversal
      // cost iff the nodes we hit look similar, implying the nodes dwell
      // within similar structures.
      while (left.length || right.length) {
        const l = left.pop();
        const r = right.pop();
        if (l === undefined || r === undefined) {
          // Punishment for being at different depths: same as ordinary
          // dissimilarity punishment for now
          cost += differentDepthCost;
        } else {
          // TODO: Consider similarity of classList.
          cost += l.tagName === r.tagName ? sameTagCost : differentTagCost;
        }
        // Optimization: strides might be a good dimension to eliminate.
        if (strideCost !== 0) {
          cost += numStrides(l, r) * strideCost;
        }
      }

      return cost + additionalCost(fnodeA, fnodeB);
    };

    /**
     * Return the spatial distance between 2 fnodes, assuming a rendered page.
     *
     * Specifically, return the distance in pixels between the centers of
     * ``fnodeA.element.getBoundingClientRect()`` and
     * ``fnodeB.element.getBoundingClientRect()``.
     */
    var euclidean = function(fnodeA, fnodeB) {
      /**
       * Return the horizontal distance from the left edge of the viewport to the
       * center of an element, given a DOMRect object for it. It doesn't matter
       * that the distance is affected by the page's scroll offset, since the 2
       * elements have the same offset.
       */
      function xCenter(domRect) {
        return domRect.left + domRect.width / 2;
      }

      function yCenter(domRect) {
        return domRect.top + domRect.height / 2;
      }

      const aRect = fnodeA.element.getBoundingClientRect();
      const bRect = fnodeB.element.getBoundingClientRect();
      return Math.sqrt((xCenter(aRect) - xCenter(bRect)) ** 2 +
        (yCenter(aRect) - yCenter(bRect)) ** 2);
    };

    /** A lower-triangular matrix of inter-cluster distances */
    class DistanceMatrix {
      /**
       * @arg distance {function} Some notion of distance between 2 given nodes
       */
      constructor(elements, distance) {
        // A sparse adjacency matrix:
        // {A => {},
        //  B => {A => 4},
        //  C => {A => 4, B => 4},
        //  D => {A => 4, B => 4, C => 4}
        //  E => {A => 4, B => 4, C => 4, D => 4}}
        //
        // A, B, etc. are arrays of [arrays of arrays of...] nodes, each
        // array being a cluster. In this way, they not only accumulate a
        // cluster but retain the steps along the way.
        //
        // This is an efficient data structure in terms of CPU and memory, in
        // that we don't have to slide a lot of memory around when we delete a
        // row or column from the middle of the matrix while merging. Of
        // course, we lose some practical efficiency by using hash tables, and
        // maps in particular are slow in their early implementations.
        this._matrix = new Map();

        // Convert elements to clusters:
        const clusters = elements.map(el => [el]);

        // Init matrix:
        for (let outerCluster of clusters) {
          const innerMap = new Map();
          for (let innerCluster of this._matrix.keys()) {
            innerMap.set(innerCluster, distance(outerCluster[0],
              innerCluster[0]));
          }
          this._matrix.set(outerCluster, innerMap);
        }
        this._numClusters = clusters.length;
      }

      // Return (distance, a: clusterA, b: clusterB) of closest-together clusters.
      // Replace this to change linkage criterion.
      closest() {
        const self = this;

        if (this._numClusters < 2) {
          throw new Error(
            'There must be at least 2 clusters in order to return the closest() ones.'
          );
        }

        // Return the distances between every pair of clusters.
        function clustersAndDistances() {
          const ret = [];
          for (let [outerKey, row] of self._matrix.entries()) {
            for (let [innerKey, storedDistance] of row.entries()) {
              ret.push({
                a: outerKey,
                b: innerKey,
                distance: storedDistance
              });
            }
          }
          return ret;
        }
        // Optimizing this by inlining the loop and writing it less
        // functionally doesn't help:
        return minC(clustersAndDistances(), x => x.distance);
      }

      // Look up the distance between 2 clusters in me. Try the lookup in the
      // other direction if the first one falls in the nonexistent half of the
      // triangle.
      _cachedDistance(clusterA, clusterB) {
        let ret = this._matrix.get(clusterA).get(clusterB);
        if (ret === undefined) {
          ret = this._matrix.get(clusterB).get(clusterA);
        }
        return ret;
      }

      // Merge two clusters.
      merge(clusterA, clusterB) {
        // An example showing how rows merge:
        //  A: {}
        //  B: {A: 1}
        //  C: {A: 4, B: 4},
        //  D: {A: 4, B: 4, C: 4}
        //  E: {A: 4, B: 4, C: 2, D: 4}}
        //
        // Step 2:
        //  C: {}
        //  D: {C: 4}
        //  E: {C: 2, D: 4}}
        //  AB: {C: 4, D: 4, E: 4}
        //
        // Step 3:
        //  D:  {}
        //  AB: {D: 4}
        //  CE: {D: 4, AB: 4}

        // Construct new row, finding min distances from either subcluster of
        // the new cluster to old clusters.
        //
        // There will be no repetition in the matrix because, after all,
        // nothing pointed to this new cluster before it existed.
        const newRow = new Map();
        for (let outerKey of this._matrix.keys()) {
          if (outerKey !== clusterA && outerKey !== clusterB) {
            newRow.set(outerKey, Math.min(this._cachedDistance(clusterA, outerKey),
              this._cachedDistance(clusterB, outerKey)));
          }
        }

        // Delete the rows of the clusters we're merging.
        this._matrix.delete(clusterA);
        this._matrix.delete(clusterB);

        // Remove inner refs to the clusters we're merging.
        for (let inner of this._matrix.values()) {
          inner.delete(clusterA);
          inner.delete(clusterB);
        }

        // Attach new row.
        this._matrix.set([clusterA, clusterB], newRow);

        // There is a net decrease of 1 cluster:
        this._numClusters -= 1;
      }

      numClusters() {
        return this._numClusters;
      }

      // Return an Array of nodes for each cluster in me.
      clusters() {
        // TODO: Can't get wu.map to work here. Don't know why.
        var result = [];

        for (var k of this._matrix.keys()) {
          result.push(flattenDeep(k));
        }

        return result;
      }
    };

    /**
     * Partition the given nodes into one or more clusters by position in the DOM
     * tree.
     *
     * This implements an agglomerative clustering. It uses single linkage, since
     * we're talking about adjacency here more than Euclidean proximity: the
     * clusters we're talking about in the DOM will tend to be adjacent, not
     * overlapping. We haven't tried other linkage criteria yet.
     *
     * In a later release, we may consider score or notes.
     *
     * @arg {Fnode[]|Node[]} fnodes :term:`fnodes<fnode>` or DOM nodes to group
     *     into clusters
     * @arg {number} splittingDistance The closest-nodes :func:`distance` beyond
     *     which we will not attempt to unify 2 clusters. Make this larger to make
     *     larger clusters.
     * @arg getDistance {function} A function that returns some notion of numerical
     *    distance between 2 nodes. Default: :func:`distance`
     * @return {Array} An Array of Arrays, with each Array containing all the
     *     nodes in one cluster. Note that neither the clusters nor the nodes are
     *     in any particular order. You may find :func:`domSort` helpful to remedy
     *     the latter.
     */
    var clusters = function(fnodes, splittingDistance, getDistance = distance) {
      const matrix = new DistanceMatrix(fnodes, getDistance);
      let closest;

      while (matrix.numClusters() > 1 && (closest = matrix.closest()).distance <
        splittingDistance) {
        matrix.merge(closest.a, closest.b);
      }

      return matrix.clusters();
    };
    /* Common JS - End */
    /******************************************/

    /******************************************/
    /* dismiss_dialogs.js - Start */
    /* This file is used to locate the div element of a web page that might contain
    close buttons to dismiss a modal dialog */

    // Does the element also have the middle element?
    var checkInCenter = function(element) {
        var centerElement = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
        return element.contains(centerElement);
    };


    // Given a list of elements, find one that has the largest z-index
    var maxZindex = function(element_list) {
        var max = -99999999;
        var element;

        for (var i = 0; i < element_list.length; i++) {
            var zindex = window.getComputedStyle(element_list[i]).getPropertyValue('z-index');
            if (+zindex > +max) {
                max = zindex;
                element = element_list[i];
            }
        }

        return element;
    };


    // Given an element and a parent element (not necessarily immediate parent),
    // this function returns true if none of the elements between itself and this
    // parent have z-index values set to a value other than 'auto'
    var domZindexCheck = function(element, parent_element) {
        if (element == parent_element) {
            return true;
        } else {
            var parent = element.parentElement;

            while (parent != parent_element) {
                if (window.getComputedStyle(parent).getPropertyValue('z-index') != 'auto') {
                    return false;
                }

                parent = parent.parentElement;
            }

            return true;
        }
    };


    // Calls the above function on a list of elements and a given parent element
    var getElementsForCheck = function(element_list, parent_element) {
        var result = [];

        for (var i = 0; i < element_list.length; i++) {
            if (domZindexCheck(element_list[i], parent_element)) {
                result.push(element_list[i]);
            }
        }

        return result;
    };


    // Returns a list of divs on the web page that are visible, have a non-static
    // 'position' and a z-index set to not 'auto'
    // Note that z-index values lose their meaning when position is set to static
    // Only considers those divs with position z-index values
    var getDivs = function() {
        var result = [];
        element_list = document.querySelectorAll('div');

        for (var i = 0; i < element_list.length; i++) {
            var element = element_list[i];
            var style = window.getComputedStyle(element);
            if (style == null)
              continue
            var display = style.getPropertyValue('display') != 'none';
            var visibility = style.getPropertyValue('visibility') == 'visible';
            var position = style.getPropertyValue('position') != 'static';
            var zindex = style.getPropertyValue('z-index');
            var inCenter = checkInCenter(element);

            if (display && visibility && position && zindex != 'auto' && +zindex > 0 && inCenter) {
                var height = element.offsetHeight;
                var width = element.offsetWidth;

                if (+height > 150 && +width > 150) {
                    result.push(element);
                }
            }
        }

        return result;
    };

    // Repeatedly filter the list of divs as extracted above until we know it is
    // the element on 'top'
    var getPopupContainer = function() {
      var divs = getDivs();
      var parent = document.body;
      var element;

      while (divs.length != 0) {
          var elements = getElementsForCheck(divs, parent);

          if (elements.length == 0) {
              break;
          }

          element = maxZindex(elements);

          divs = divs.filter(x => x != element && element.contains(x))
          parent = element;
      }

      if (element && element.children.length == 1 && element.children[0].tagName.toLowerCase() == 'iframe') {
          element = element.children[0];
      }

      return element;
    };

    var closeDialog = function(element) {
      var closeElements = ['button', 'a', 'div', 'span', 'img', 'label'];
      var result = [];

      var doc = document;

      if (element.tagName.toLowerCase() === 'iframe') {
        doc = element.contentDocument;
        element = element.contentDocument;
      }

      for (var ce of closeElements) {
        var elements = getElementsByXPath('.//' + ce + '[@*[contains(.,\'close\') and not(contains(.,\'/\'))]]', element, doc);
        elements = elements.concat(getElementsByXPath('.//' + ce + '[@*[contains(.,\'Close\') and not(contains(.,\'/\'))]]', element, doc));
        elements = elements.concat(getElementsByXPath('.//' + ce + '[@*[contains(.,\'dismiss\') and not(contains(.,\'/\'))]]', element, doc));
        elements = elements.concat(getElementsByXPath('.//' + ce + '[@*[contains(.,\'Dismiss\') and not(contains(.,\'/\'))]]', element, doc));

        elements = elements.concat(getElementsByXPath('.//' + ce + '[text()[contains(., \'Agree\')]]', element, doc));
        elements = elements.concat(getElementsByXPath('.//' + ce + '[text()[contains(., \'AGREE\')]]', element, doc));

        elements = elements.concat(getElementsByXPath('.//' + ce + '[text()[contains(., \'ENTER\')]]', element, doc));
        elements = elements.concat(getElementsByXPath('.//' + ce + '[text()[contains(., \'Enter\')]]', element, doc));

        elements = elements.concat(getElementsByXPath('.//' + ce + '[text()[contains(., \'YES\')]]', element, doc));
        elements = elements.concat(getElementsByXPath('.//' + ce + '[text()[contains(., \'Yes\')]]', element, doc));

        elements = elements.concat(getElementsByXPath('.//' + ce + '[text()[contains(., \'No \')]]', element, doc));
        elements = elements.concat(getElementsByXPath('.//' + ce + '[text()[contains(., \'NO \')]]', element, doc));

        result = result.concat(elements.filter(x => isShown(x) && (x.style.offsetHeight !== 0 || x.style.offsetWidth !== 0)));
      }

      result = result.filter(function(item, pos) { return result.indexOf(item)== pos; });

      result = parentRemoval(result, 'button');

      for (var r of result) {
        try {
          r.click();
        }
        catch (err) {

        }
      }
      return result.length;
    };

    //closeDialog(getPopupContainer());

    function dismissDialog() {
      let popup = getPopupContainer();
      if (popup){
        return closeDialog(popup);
      }
      return 0;
    }

    /* dismiss_dialogs.js - End */
    /******************************************/

    /******************************************/
    /* Segmentation algo 2 (old method) - Start */
    var allIgnoreChildren = function(element) {
      if (element.children.length === 0) {
        return false;
      } else {
        for (var child of element.children) {
          if (ignoredElements.includes(child.tagName.toLowerCase())) {
            continue;
          } else {
            return false;
          }
        }
        return true;
      }
    };

    var segments = function(element) {
      if (!element) {
        return [];
      }

      var tag = element.tagName.toLowerCase();
      if (!ignoredElements.includes(tag) && !isPixel(element) && isShown(element)) {
        if (blockElements.includes(tag)) {
          if (!containsBlockElements(element)) {
            if (allIgnoreChildren(element)) {
              return [];
            } else {
              return [element];
            }
          } else if (containsTextNodes(element)) {
            return [element];
          } else {
            var result = [];

            for (var child of element.children) {
              result = result.concat(segments(child));
            }

            return result;
          }
        } else {
          if (containsBlockElements(element, false)) {
            var result = [];

            for (var child of element.children) {
              result = result.concat(segments(child));
            }

            return result;
          } else {
            return [element];
          }
        }
      } else {
        return [];
      }
    };


    //segments(document.body);


    /* Segmentation algo 2 (old method) - End */
    /******************************************/

    /******************************************/
    /* Mutation processing - Start */

    function onNodeAdded(node, summary, timeStamp){
      if ((node.nodeType == TEXTNODE_NODETYPE) && summary.added.includes(node.parentNode)){
        console.log("Will skip the textnode, its parent is also added", node);
        return;
      }
      logMutationSummary("NodeAdded", node, summary, timeStamp);
    }
    const EXCLUDE_NODE_REMOVED = true;  // do not process node removed events
    function onNodeRemoved(node, summary, timeStamp){
      if (!EXCLUDE_NODE_REMOVED)
        logMutationSummary("NodeRemoved", node, summary, timeStamp);
    }

    function onNodeReparented(node, summary, timeStamp){
      logMutationSummary("NodeReparented", node, summary, timeStamp);
    }

    function onNodeReordered(node, summary, timeStamp){
      logMutationSummary("NodeReordered", node, summary, timeStamp);
    }

    function onCharacterDataChanged(node, summary, timeStamp){
      logMutationSummary("CharacterDataChanged", node, summary, timeStamp);
    }

    function removeDuplicates(arr){
      let newSet = new Set(arr);
      let array = [];
      newSet.forEach(v => array.push(v));
      return array;
    }

    function onAttrsChanged(attrChanges, summary, timeStamp){
      for (var attrName in attrChanges){
        var nodes = new Set(attrChanges[attrName]);
        for (var node of nodes){
          logMutationSummary("AttributeChanged", node, summary, timeStamp, attrName);
        }
      }
    }

    function findSegmentParents(nodes, pageSegments){
      // Find and return ancestors that are segments.
      // For nodes without ancestor segments, return the node itself
      let ancestorSegments = [];  //ancestor segments
      let nodesWithoutAncestorSegments = [];  // nodes without ancestor segments

      for (let node of nodes){
        let origNode = node;
        let parentFound = false;
        while(node !== null){
          if (node && pageSegments.includes(node)){
            ancestorSegments.push(node);
            parentFound = true;
            break;
          }else{
            node = node.parentNode;
          }
        }
        if (!parentFound){
          if (origNode.nodeType === TEXTNODE_NODETYPE)
            nodesWithoutAncestorSegments.push(origNode.parentNode);
          else
            nodesWithoutAncestorSegments.push(origNode);
        }
      }
      let combinedSet = new Set(ancestorSegments.concat(nodesWithoutAncestorSegments))
      let combinedArray = [];
      combinedSet.forEach(v => combinedArray.push(v));
      return combinedArray;
    }

    /* Mutation processing - End */
    /******************************************/

    /******************************************/
    /* Segments processing - Start */

    function countNodesOfType(el, nodeType){
        return el.querySelectorAll(nodeType).length;
    }

    function getLongestTextChild(el) {
      let longestTextNode,
        longestTextLen = 0;
      let children = Array.from(el.querySelectorAll("*")); // all descendants, excluding textNodes
      let elInnerText = el.innerText && el.innerText.toLowerCase();
      if (!elInnerText){
        return undefined;
      }

      // return the (only) visible textnode if no children
      if ((!children.length) && elInnerText) {
        return el.childNodes[0];
      }

      let elChildNodes = Array.from(el.childNodes);
      textChildren = elChildNodes.filter(node => (node.nodeType === TEXTNODE_NODETYPE));
      let allChildren = children.concat(textChildren);

      for (let child of allChildren) {
        let nodeAndChildren = Array.from(child.childNodes);
        nodeAndChildren.push(child);
        for (let node of nodeAndChildren) {
          if (node.nodeType !== TEXTNODE_NODETYPE)
            continue;
          let text = node.wholeText.trim();
          if (!text)
            continue

          if ((text.length > longestTextLen) && elInnerText.includes(text.toLowerCase())) {
            longestTextNode = node;
            longestTextLen = text.length;
          }
        }
      }
      return longestTextNode;
    }


    const MAX_RAND_INT = 2**32;
    const GUID_ATTR_NAME = 'openwpm-dp-guid';
    // taken from the no boundaries code
    function addGuid(element) {
      let guid;
      if (element.hasAttribute(GUID_ATTR_NAME))
        return element.getAttribute(GUID_ATTR_NAME);
      guid = Math.floor(Math.random()*MAX_RAND_INT);
      element.setAttribute(GUID_ATTR_NAME, guid);
      return guid;
    }

    function logSegmentDetails(node, timeStamp){
      let longestTextStyle = "",
        longestTextBoundingRect = "",
        longestText = "",
        longestTextBgColor = "";

      //let style = getNonDefaultStyles(node);
      let style = getComputedStyleAsString(node);
      let nodeId = addGuid(node);
      let boundingRect = getNodeBoundingClientRect(node);
      let innerText = node.innerText === undefined? "" : node.innerText.trim();
      let outerHtml = node.outerHTML;
      let bgColor = getBackgroundColor(node);
      let longestTextNode = getLongestTextChild(node);
      if (longestTextNode){
        longestText = longestTextNode.wholeText === undefined? "" : longestTextNode.wholeText.trim();
        let longestTextParent = longestTextNode.parentNode;
        if (node.isSameNode(longestTextParent)){
          // longest text's parent is the segment node itself
          // TODO: should we redundantly store these?
          longestTextStyle = style;
          longestTextBoundingRect = boundingRect;
          longestTextBgColor = bgColor;
        }else{
          //longestTextStyle = getNonDefaultStyles(longestTextParent);
          longestTextStyle = getComputedStyleAsString(longestTextParent);
          longestTextBoundingRect = getNodeBoundingClientRect(longestTextParent);
          longestTextBgColor = getBackgroundColor(longestTextParent);
        }
      }
      let numButtons = countNodesOfType(node, "button");
      let numImgs = countNodesOfType(node, "img");
      let numAnchors = countNodesOfType(node, "a");
      const ENABLE_SEGMENT_LOGS = false;
      if (ENABLE_SEGMENT_LOGS)
        console.log("Segment", timeStamp,
                  ", NodeName:", node.nodeName,
                  ", NodeId:", nodeId,
                  ", boundingRect:", boundingRect,
                  ", innerText:", innerText,
                  ", outerHTML:", outerHtml,
                  // ", Style:", style
                  ", longestText:", longestText,
                  ", longestTextBoundingRect:", longestTextBoundingRect,
                  // ", longestTextStyle:", longestTextStyle,
                  ", longestTextBgColor:", longestTextBgColor,
                  ", numButtons:", numButtons,
                  ", numImgs:", numImgs,
                  ", numAnchors:", numAnchors,
                  ", bgColor:", bgColor,
                    );
      // TODO: pass all the info that we want to store
      logSegment(node.nodeName, nodeId, innerText,
          style, boundingRect, timeStamp, outerHtml, longestText,
          longestTextBoundingRect, longestTextStyle, longestTextBgColor, numButtons, numImgs, numAnchors, bgColor);
    }

    function segmentAndRecord(element){
      let t0 = performance.now();
      let timeStamp = new Date().toISOString();
      var allSegments = segments(element);
      let segmentationDuration = performance.now()-t0;
      if (segmentationDuration > 500)
        console.log("Segmentation took", segmentationDuration, "nSegments", allSegments.length);
      // console.log(allSegments);
      let t1 = performance.now();
      for (var node of allSegments){
        logSegmentDetails(node, timeStamp);
      }
      let segmentationLogDuration = performance.now()-t1;
      if (segmentationLogDuration > 500)
        console.log("Segmentation insertion to DB took", segmentationLogDuration)
      return allSegments;
    }

    function shouldProcessMutationNode(node){
      const excludedNodeTypes = ["SCRIPT", "STYLE", "DOCUMENT", "BODY",
        "IFRAME", "POLYGON", "SVG", "PATH", "POLYLINE", "RECT", "BR",
        "HTML", "HR"];

      // if (node.nodeType !== ELEMENT_NODETYPE || node.nodeType == TEXTNODE_NODETYPE){
      if (node.nodeType !== ELEMENT_NODETYPE && node.nodeType !== TEXTNODE_NODETYPE){
          return false;
      }

      if (node.nodeType === ELEMENT_NODETYPE && excludedNodeTypes.includes(node.tagName.toUpperCase())){
        return false;
      }

      let boundingRect = getNodeBoundingClientRect(node);
      return inViewport(node, boundingRect);
    }

    //https://gist.github.com/eteeselink/81314282c95cd692ea1d
    const openwpmSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    function segmentAndDismissDialog(pageSegments){
      let popup = getPopupContainer();
      if (popup){
        console.log("Found a dialog, will segment and then close the dialog");
        let popupSegment = segmentAndRecord(popup);
        pageSegments = pageSegments.concat(popupSegment);
        pageSegments = removeDuplicates(pageSegments);
        closeDialog(popup);
      }
      console.log("pageSegments.length", pageSegments.length)
      return pageSegments;
    }

    function handleSummary(summaries, pageSegments=[]) {
      // MutationSummary returns one summary for each query - we've one query
      let nodesToSegment = [];
      if (OPENWPM_DEBUG)
        console.log("handleSummary nodesToResegment")
      let timeStamp = new Date().toISOString();
      var summary = summaries[0];
      //added, reparented, reordered, attrsChanged: re-segment the
      // element's (old) segment, take snapshot(s) of the new segments
      let nodesToResegment = summary.added.concat(summary.reparented).concat(summary.reordered);
      for (let attrName in summary.attributeChanged){
        nodesToResegment = nodesToResegment.concat(summary.attributeChanged[attrName])
      }
      if (OPENWPM_DEBUG)
        console.log("handleSummary nodesToResegment", nodesToResegment)

      nodesToResegment = nodesToResegment.filter(node => shouldProcessMutationNode(node));
      let charChangedNodes = summary.characterDataChanged;

      charChangedNodes = charChangedNodes.filter(node => shouldProcessMutationNode(node));
      charChangedNodes = charChangedNodes.filter(node => !nodesToResegment.includes(node));


      // Get the parents
      if (nodesToResegment.length){
        if (OPENWPM_DEBUG)
          console.log("handleSummary findSegmentParents", nodesToResegment.length)
        nodesToSegment = findSegmentParents(nodesToResegment, pageSegments);
        nodesToSegment = nodesToSegment.filter(node => shouldProcessMutationNode(node));
        if (nodesToSegment){
          let t0 = performance.now()
          for (let node of nodesToSegment){
            // call segmentation
            let newSegments = segmentAndRecord(node);
            if (newSegments && newSegments.length){
              pageSegments = pageSegments.concat(newSegments);
              pageSegments = removeDuplicates(pageSegments);
            }
          }
          // console.log("Mutation summary segmentation took", (performance.now() - t0), pageSegments.length);
        }
      }

      if (charChangedNodes.length){
        let nodesToRecord = findSegmentParents(charChangedNodes, pageSegments);

        nodesToRecord = nodesToRecord.filter(
            node => shouldProcessMutationNode(node)).filter(
                node => !nodesToSegment.has(node));
        // record node details
        for (let node of nodesToRecord){
          logSegmentDetails(node, timeStamp);
        }
      }
    }  // end of handleSummary

    const TIME_BEFORE_SEGMENT = 1000;
    const TIME_BEFORE_CLOSING_DIALOGS = 10000;

    function runSegmentationAndMutationSummaryObserver(pageSegments){
      // start segmenting 1s after page load
      // segment all frames, regardless of product page etc.
      setTimeout(() => {
        console.log("Will check for dialogs");
        pageSegments = segmentAndDismissDialog(pageSegments);
        console.log("Will segment the page body");
        pageSegments = pageSegments.concat(segmentAndRecord(document.body));

        observerSummary = new MutationSummary({
          callback: function(summaries){handleSummary(summaries, pageSegments)},
          queries: [{all: true}]})
      }, TIME_BEFORE_SEGMENT);
    }

    window.addEventListener("load", function(){
      let pageSegments = [];  // list of segments, functions in this closure access and update this list
      // run segmentation in all frames
      runSegmentationAndMutationSummaryObserver(pageSegments);
    });

    /* Segments processing - End */
    /******************************************/

  } + "());";
}


function insertScript(text, data) {
  var parent = document.documentElement,
    script = document.createElement('script');
  script.text = text;
  script.async = false;

  for (var key in data) {
    script.setAttribute('data-' + key.replace('_', '-'), data[key]);
  }

  parent.insertBefore(script, parent.firstChild);
  parent.removeChild(script);
}

function emitMsg(type, msg) {
  msg.timeStamp = new Date().toISOString();
  self.port.emit(type, msg);
}

var event_id = Math.random();

// listen for messages from the script we are about to insert
document.addEventListener(event_id, function (e) {
  // pass these on to the background page
  var msgs = e.detail;
  if (Array.isArray(msgs)) {
    msgs.forEach(function (msg) {
      emitMsg(msg['type'],msg['content']);
    });
  } else {
    emitMsg(msgs['type'],msgs['content']);
  }
});

insertScript(getPageScript(), {
  event_id: event_id,
  testing: self.options.testing
});
