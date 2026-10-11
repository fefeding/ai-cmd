const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./views.js","./rolldown-runtime.js","./vue.js","./xterm.js","./xterm.css","./views.css"])))=>i.map(i=>d[i]);
import { i as __toESM, n as __esmMin, r as __exportAll, t as __commonJSMin } from "./rolldown-runtime.js";
import { $ as toRaw, A as hasInjectionContext, B as resolveComponent, C as createBlock, D as createVNode, E as createTextVNode, F as onMounted, G as getCurrentScope, I as onUnmounted, J as isRef, L as openBlock, M as inject, N as nextTick, O as defineComponent, P as onBeforeUnmount, Q as ref, R as renderList, S as createBaseVNode, T as createElementBlock, V as watch, W as effectScope, X as onScopeDispose, Y as markRaw, Z as reactive, a as init_vue_router, at as toDisplayString, b as Fragment, c as useI18n, et as toRefs, i as createWebHistory, it as normalizeStyle, k as getCurrentInstance, l as init_vue_runtime_esm_bundler, n as useTitle, o as createI18n, q as isReactive, r as createRouter, rt as normalizeClass, s as init_vue_i18n, t as init_core, tt as unref, u as createApp, w as createCommentVNode, x as computed, z as renderSlot } from "./vue.js";
import { i as init_bootstrap, n as init_bootstrap_esm, r as init_bootstrap_icons, t as Modal } from "./bootstrap.js";
//#region \0vite/modulepreload-polyfill.js
(function polyfill() {
	const relList = document.createElement("link").relList;
	if (relList && relList.supports && relList.supports("modulepreload")) return;
	for (const link of document.querySelectorAll("link[rel=\"modulepreload\"]")) processPreload(link);
	new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			if (mutation.type !== "childList") continue;
			for (const node of mutation.addedNodes) if (node.tagName === "LINK" && node.rel === "modulepreload") processPreload(node);
		}
	}).observe(document, {
		childList: true,
		subtree: true
	});
	function getFetchOpts(link) {
		const fetchOpts = {};
		if (link.integrity) fetchOpts.integrity = link.integrity;
		if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
		if (link.crossOrigin === "use-credentials") fetchOpts.credentials = "include";
		else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
		else fetchOpts.credentials = "same-origin";
		return fetchOpts;
	}
	function processPreload(link) {
		if (link.ep) return;
		link.ep = true;
		const fetchOpts = getFetchOpts(link);
		fetch(link.href, fetchOpts);
	}
})();
//#endregion
//#region node_modules/.pnpm/eventemitter3@5.0.4/node_modules/eventemitter3/index.js
var require_eventemitter3 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var has = Object.prototype.hasOwnProperty;
	var prefix = "~";
	/**
	* Constructor to create a storage for our `EE` objects.
	* An `Events` instance is a plain object whose properties are event names.
	*
	* @constructor
	* @private
	*/
	function Events() {}
	if (Object.create) {
		Events.prototype = Object.create(null);
		if (!new Events().__proto__) prefix = false;
	}
	/**
	* Representation of a single event listener.
	*
	* @param {Function} fn The listener function.
	* @param {*} context The context to invoke the listener with.
	* @param {Boolean} [once=false] Specify if the listener is a one-time listener.
	* @constructor
	* @private
	*/
	function EE(fn, context, once) {
		this.fn = fn;
		this.context = context;
		this.once = once || false;
	}
	/**
	* Add a listener for a given event.
	*
	* @param {EventEmitter} emitter Reference to the `EventEmitter` instance.
	* @param {(String|Symbol)} event The event name.
	* @param {Function} fn The listener function.
	* @param {*} context The context to invoke the listener with.
	* @param {Boolean} once Specify if the listener is a one-time listener.
	* @returns {EventEmitter}
	* @private
	*/
	function addListener(emitter, event, fn, context, once) {
		if (typeof fn !== "function") throw new TypeError("The listener must be a function");
		var listener = new EE(fn, context || emitter, once), evt = prefix ? prefix + event : event;
		if (!emitter._events[evt]) emitter._events[evt] = listener, emitter._eventsCount++;
		else if (!emitter._events[evt].fn) emitter._events[evt].push(listener);
		else emitter._events[evt] = [emitter._events[evt], listener];
		return emitter;
	}
	/**
	* Clear event by name.
	*
	* @param {EventEmitter} emitter Reference to the `EventEmitter` instance.
	* @param {(String|Symbol)} evt The Event name.
	* @private
	*/
	function clearEvent(emitter, evt) {
		if (--emitter._eventsCount === 0) emitter._events = new Events();
		else delete emitter._events[evt];
	}
	/**
	* Minimal `EventEmitter` interface that is molded against the Node.js
	* `EventEmitter` interface.
	*
	* @constructor
	* @public
	*/
	function EventEmitter() {
		this._events = new Events();
		this._eventsCount = 0;
	}
	/**
	* Return an array listing the events for which the emitter has registered
	* listeners.
	*
	* @returns {Array}
	* @public
	*/
	EventEmitter.prototype.eventNames = function eventNames() {
		var names = [], events, name;
		if (this._eventsCount === 0) return names;
		for (name in events = this._events) if (has.call(events, name)) names.push(prefix ? name.slice(1) : name);
		if (Object.getOwnPropertySymbols) return names.concat(Object.getOwnPropertySymbols(events));
		return names;
	};
	/**
	* Return the listeners registered for a given event.
	*
	* @param {(String|Symbol)} event The event name.
	* @returns {Array} The registered listeners.
	* @public
	*/
	EventEmitter.prototype.listeners = function listeners(event) {
		var evt = prefix ? prefix + event : event, handlers = this._events[evt];
		if (!handlers) return [];
		if (handlers.fn) return [handlers.fn];
		for (var i = 0, l = handlers.length, ee = new Array(l); i < l; i++) ee[i] = handlers[i].fn;
		return ee;
	};
	/**
	* Return the number of listeners listening to a given event.
	*
	* @param {(String|Symbol)} event The event name.
	* @returns {Number} The number of listeners.
	* @public
	*/
	EventEmitter.prototype.listenerCount = function listenerCount(event) {
		var evt = prefix ? prefix + event : event, listeners = this._events[evt];
		if (!listeners) return 0;
		if (listeners.fn) return 1;
		return listeners.length;
	};
	/**
	* Calls each of the listeners registered for a given event.
	*
	* @param {(String|Symbol)} event The event name.
	* @returns {Boolean} `true` if the event had listeners, else `false`.
	* @public
	*/
	EventEmitter.prototype.emit = function emit(event, a1, a2, a3, a4, a5) {
		var evt = prefix ? prefix + event : event;
		if (!this._events[evt]) return false;
		var listeners = this._events[evt], len = arguments.length, args, i;
		if (listeners.fn) {
			if (listeners.once) this.removeListener(event, listeners.fn, void 0, true);
			switch (len) {
				case 1: return listeners.fn.call(listeners.context), true;
				case 2: return listeners.fn.call(listeners.context, a1), true;
				case 3: return listeners.fn.call(listeners.context, a1, a2), true;
				case 4: return listeners.fn.call(listeners.context, a1, a2, a3), true;
				case 5: return listeners.fn.call(listeners.context, a1, a2, a3, a4), true;
				case 6: return listeners.fn.call(listeners.context, a1, a2, a3, a4, a5), true;
			}
			for (i = 1, args = new Array(len - 1); i < len; i++) args[i - 1] = arguments[i];
			listeners.fn.apply(listeners.context, args);
		} else {
			var length = listeners.length, j;
			for (i = 0; i < length; i++) {
				if (listeners[i].once) this.removeListener(event, listeners[i].fn, void 0, true);
				switch (len) {
					case 1:
						listeners[i].fn.call(listeners[i].context);
						break;
					case 2:
						listeners[i].fn.call(listeners[i].context, a1);
						break;
					case 3:
						listeners[i].fn.call(listeners[i].context, a1, a2);
						break;
					case 4:
						listeners[i].fn.call(listeners[i].context, a1, a2, a3);
						break;
					default:
						if (!args) for (j = 1, args = new Array(len - 1); j < len; j++) args[j - 1] = arguments[j];
						listeners[i].fn.apply(listeners[i].context, args);
				}
			}
		}
		return true;
	};
	/**
	* Add a listener for a given event.
	*
	* @param {(String|Symbol)} event The event name.
	* @param {Function} fn The listener function.
	* @param {*} [context=this] The context to invoke the listener with.
	* @returns {EventEmitter} `this`.
	* @public
	*/
	EventEmitter.prototype.on = function on(event, fn, context) {
		return addListener(this, event, fn, context, false);
	};
	/**
	* Add a one-time listener for a given event.
	*
	* @param {(String|Symbol)} event The event name.
	* @param {Function} fn The listener function.
	* @param {*} [context=this] The context to invoke the listener with.
	* @returns {EventEmitter} `this`.
	* @public
	*/
	EventEmitter.prototype.once = function once(event, fn, context) {
		return addListener(this, event, fn, context, true);
	};
	/**
	* Remove the listeners of a given event.
	*
	* @param {(String|Symbol)} event The event name.
	* @param {Function} fn Only remove the listeners that match this function.
	* @param {*} context Only remove the listeners that have this context.
	* @param {Boolean} once Only remove one-time listeners.
	* @returns {EventEmitter} `this`.
	* @public
	*/
	EventEmitter.prototype.removeListener = function removeListener(event, fn, context, once) {
		var evt = prefix ? prefix + event : event;
		if (!this._events[evt]) return this;
		if (!fn) {
			clearEvent(this, evt);
			return this;
		}
		var listeners = this._events[evt];
		if (listeners.fn) {
			if (listeners.fn === fn && (!once || listeners.once) && (!context || listeners.context === context)) clearEvent(this, evt);
		} else {
			for (var i = 0, events = [], length = listeners.length; i < length; i++) if (listeners[i].fn !== fn || once && !listeners[i].once || context && listeners[i].context !== context) events.push(listeners[i]);
			if (events.length) this._events[evt] = events.length === 1 ? events[0] : events;
			else clearEvent(this, evt);
		}
		return this;
	};
	/**
	* Remove all listeners, or those of the specified event.
	*
	* @param {(String|Symbol)} [event] The event name.
	* @returns {EventEmitter} `this`.
	* @public
	*/
	EventEmitter.prototype.removeAllListeners = function removeAllListeners(event) {
		var evt;
		if (event) {
			evt = prefix ? prefix + event : event;
			if (this._events[evt]) clearEvent(this, evt);
		} else {
			this._events = new Events();
			this._eventsCount = 0;
		}
		return this;
	};
	EventEmitter.prototype.off = EventEmitter.prototype.removeListener;
	EventEmitter.prototype.addListener = EventEmitter.prototype.on;
	EventEmitter.prefixed = prefix;
	EventEmitter.EventEmitter = EventEmitter;
	if ("undefined" !== typeof module) module.exports = EventEmitter;
}));
//#endregion
//#region node_modules/.pnpm/eventemitter3@5.0.4/node_modules/eventemitter3/index.mjs
var import_eventemitter3, eventemitter3_default;
var init_eventemitter3 = __esmMin((() => {
	import_eventemitter3 = /* @__PURE__ */ __toESM(require_eventemitter3(), 1);
	eventemitter3_default = import_eventemitter3.default;
}));
//#endregion
//#region node_modules/.pnpm/@fefeding+eventemitter@1.0.5/node_modules/@fefeding/eventemitter/dist/index.js
var JEventEmitter;
var init_dist = __esmMin((() => {
	init_eventemitter3();
	JEventEmitter = class JEventEmitter extends eventemitter3_default {
		/**
		* 唯一标识
		*/
		key = "";
		/**
		* 私有方法，用于规范化事件名
		* @param name - 可以是字符串、符号或字符串数组
		* @returns 返回符号或字符串数组
		*/
		normalizeEventNames(name) {
			if (!name) return [];
			if (typeof name === "string") return name.split(" ");
			return Array.isArray(name) ? name : [name];
		}
		/**
		* 为给定的事件添加一个监听器
		* @param event - 事件名，可以是字符串、符号或字符串数组
		* @param fn - 监听函数，参数列表为可变参数
		* @param context - 可选，上下文对象
		* @returns 返回 EventEmitter 实例
		*/
		on(event, fn, context) {
			const events = this.normalizeEventNames(event);
			for (const name of events) name && super.on(name, fn, context);
			return this;
		}
		/**
		* 移除给定的事件的一个监听器
		* @param event - 事件名，可以是字符串、符号或字符串数组
		* @param fn - 可选，监听函数，参数列表为可变参数
		* @param context - 可选，上下文对象
		* @param once - 可选，是否只执行一次
		* @returns 返回 EventEmitter 实例
		*/
		off(event, fn, context, once) {
			const events = this.normalizeEventNames(event);
			for (const name of events) name && super.off(name, fn, context);
			return this;
		}
		/**
		* 消毁
		*/
		destory() {
			this.removeAllListeners();
			if (this.key) JEventEmitter.removeEmitter(this.key);
		}
		static emitters = /* @__PURE__ */ new Map();
		static getEmitter(key) {
			let emmiter = this.emitters.get(key);
			if (!emmiter) {
				emmiter = new JEventEmitter();
				emmiter.key = key;
				this.emitters.set(key, emmiter);
			}
			return emmiter;
		}
		static removeEmitter(key) {
			if (this.emitters.has(key)) return this.emitters.delete(key);
			return false;
		}
	};
}));
//#endregion
//#region src/base/eventBus.ts
function subscribe(name, callback) {
	const id = typeof name === "symbol" ? name : Symbol(name);
	GlobalEventBusCache.set(id, {
		name,
		callback
	});
	GlobalEventBus.on(name, callback);
	return id;
}
function unsubscribe(eventId) {
	const event = GlobalEventBusCache.get(eventId);
	if (event) {
		GlobalEventBus.off(event.name, event.callback);
		GlobalEventBusCache.delete(eventId);
		return true;
	}
	return false;
}
function publish(name, data) {
	return GlobalEventBus.emit(name, data);
}
var GlobalEventBus, GlobalEventBusCache;
var init_eventBus = __esmMin((() => {
	init_dist();
	GlobalEventBus = new JEventEmitter();
	GlobalEventBusCache = /* @__PURE__ */ new Map();
}));
//#endregion
//#region src/utils/toast.ts
function setGlobalToast(toast) {
	globalToast = toast;
}
var globalToast, ToastHelper, toast;
var init_toast$2 = __esmMin((() => {
	init_vue_runtime_esm_bundler();
	globalToast = null;
	ToastHelper = class {
		getToast() {
			if (globalToast) return globalToast;
			const instance = getCurrentInstance();
			if (!instance) return null;
			return instance.appContext.config?.globalProperties?.$toast || null;
		}
		success(message, title = "", duration = 3e3) {
			this.getToast()?.success(message, title, duration);
		}
		error(message, title = "", duration = 3e3) {
			this.getToast()?.error(message, title, duration);
		}
		warning(message, title = "", duration = 3e3) {
			this.getToast()?.warning(message, title, duration);
		}
		info(message, title = "", duration = 3e3) {
			this.getToast()?.info(message, title, duration);
		}
	};
	toast = new ToastHelper();
}));
//#endregion
//#region src/platform/App.vue?vue&type=script&setup=true&lang.ts
var App_vue_vue_type_script_setup_true_lang_default;
var init_App_vue_vue_type_script_setup_true_lang = __esmMin((() => {
	init_vue_runtime_esm_bundler();
	init_vue_i18n();
	init_eventBus();
	init_toast$2();
	App_vue_vue_type_script_setup_true_lang_default = /*@__PURE__*/ defineComponent({
		__name: "App",
		setup(__props) {
			const { t } = useI18n();
			let unsubscribeUpdate = null;
			let unsubscribeMenu = null;
			onMounted(() => {
				if (!window.electronAPI?.updater) return;
				unsubscribeUpdate = window.electronAPI.updater.onEvent((msg) => {
					const { event, data } = msg;
					if (event === "available" && data?.version) {
						const version = data.version;
						data.downloadUrl;
						toast.info(t("update.available", { version }), t("update.newVersion"), 8e3);
					}
				});
				unsubscribeMenu = window.electronAPI.updater.onMenuAction((action) => {
					if (action === "check-update") window.electronAPI?.updater?.checkForUpdates();
					else if (action === "new-connection") publish("MENU_NEW_CONNECTION");
				});
			});
			onBeforeUnmount(() => {
				unsubscribeUpdate?.();
				unsubscribeMenu?.();
			});
			return (_ctx, _cache) => {
				const _component_router_view = resolveComponent("router-view");
				return openBlock(), createBlock(_component_router_view);
			};
		}
	});
}));
//#endregion
//#region src/platform/App.vue?vue&type=style&index=0&lang.css
var init_App_vue_vue_type_style_index_0_lang = __esmMin((() => {}));
//#endregion
//#region src/platform/App.vue
var App_default;
var init_App = __esmMin((() => {
	init_App_vue_vue_type_script_setup_true_lang();
	init_App_vue_vue_type_script_setup_true_lang();
	init_App_vue_vue_type_style_index_0_lang();
	App_default = App_vue_vue_type_script_setup_true_lang_default;
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/helpers/bind.js
/**
* Create a bound version of a function with a specified `this` context
*
* @param {Function} fn - The function to bind
* @param {*} thisArg - The value to be passed as the `this` parameter
* @returns {Function} A new function that will call the original function with the specified `this` context
*/
function bind(fn, thisArg) {
	return function wrap() {
		return fn.apply(thisArg, arguments);
	};
}
var init_bind = __esmMin((() => {}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/utils.js
/**
* Determine if a value is a Buffer
*
* @param {*} val The value to test
*
* @returns {boolean} True if value is a Buffer, otherwise false
*/
function isBuffer(val) {
	return val !== null && !isUndefined(val) && val.constructor !== null && !isUndefined(val.constructor) && isFunction$1(val.constructor.isBuffer) && val.constructor.isBuffer(val);
}
/**
* Determine if a value is a view on an ArrayBuffer
*
* @param {*} val The value to test
*
* @returns {boolean} True if value is a view on an ArrayBuffer, otherwise false
*/
function isArrayBufferView(val) {
	let result;
	if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView) result = ArrayBuffer.isView(val);
	else result = val && val.buffer && isArrayBuffer(val.buffer);
	return result;
}
/**
* Determine if a value is a FormData
*
* @param {*} thing The value to test
*
* @returns {boolean} True if value is an FormData, otherwise false
*/
function getGlobal() {
	if (typeof globalThis !== "undefined") return globalThis;
	if (typeof self !== "undefined") return self;
	if (typeof window !== "undefined") return window;
	if (typeof global !== "undefined") return global;
	return {};
}
/**
* Iterate over an Array or an Object invoking a function for each item.
*
* If `obj` is an Array callback will be called passing
* the value, index, and complete array for each item.
*
* If 'obj' is an Object callback will be called passing
* the value, key, and complete object for each property.
*
* @param {Object|Array<unknown>} obj The object to iterate
* @param {Function} fn The callback to invoke for each item
*
* @param {Object} [options]
* @param {Boolean} [options.allOwnKeys = false]
* @returns {any}
*/
function forEach(obj, fn, { allOwnKeys = false } = {}) {
	if (obj === null || typeof obj === "undefined") return;
	let i;
	let l;
	if (typeof obj !== "object") obj = [obj];
	if (isArray(obj)) for (i = 0, l = obj.length; i < l; i++) fn.call(null, obj[i], i, obj);
	else {
		if (isBuffer(obj)) return;
		const keys = allOwnKeys ? Object.getOwnPropertyNames(obj) : Object.keys(obj);
		const len = keys.length;
		let key;
		for (i = 0; i < len; i++) {
			key = keys[i];
			fn.call(null, obj[key], key, obj);
		}
	}
}
/**
* Finds a key in an object, case-insensitive, returning the actual key name.
* Returns null if the object is a Buffer or if no match is found.
*
* @param {Object} obj - The object to search.
* @param {string} key - The key to find (case-insensitive).
* @returns {?string} The actual key name if found, otherwise null.
*/
function findKey(obj, key) {
	if (isBuffer(obj)) return null;
	key = key.toLowerCase();
	const keys = Object.keys(obj);
	let i = keys.length;
	let _key;
	while (i-- > 0) {
		_key = keys[i];
		if (key === _key.toLowerCase()) return _key;
	}
	return null;
}
/**
* Accepts varargs expecting each argument to be an object, then
* immutably merges the properties of each object and returns result.
*
* When multiple objects contain the same key the later object in
* the arguments list will take precedence.
*
* Example:
*
* ```js
* const result = merge({foo: 123}, {foo: 456});
* console.log(result.foo); // outputs 456
* ```
*
* @param {Object} obj1 Object to merge
*
* @returns {Object} Result of all merge properties
*/
function merge(...objs) {
	const { caseless, skipUndefined } = isContextDefined(this) && this || {};
	const result = {};
	const assignValue = (val, key) => {
		if (key === "__proto__" || key === "constructor" || key === "prototype") return;
		const targetKey = caseless && typeof key === "string" && findKey(result, key) || key;
		const existing = hasOwnProperty(result, targetKey) ? result[targetKey] : void 0;
		if (isPlainObject$1(existing) && isPlainObject$1(val)) result[targetKey] = merge(existing, val);
		else if (isPlainObject$1(val)) result[targetKey] = merge({}, val);
		else if (isArray(val)) result[targetKey] = val.slice();
		else if (!skipUndefined || !isUndefined(val)) result[targetKey] = val;
	};
	for (let i = 0, l = objs.length; i < l; i++) {
		const source = objs[i];
		if (!source || isBuffer(source)) continue;
		forEach(source, assignValue);
		if (typeof source !== "object" || isArray(source)) continue;
		const symbols = Object.getOwnPropertySymbols(source);
		for (let j = 0; j < symbols.length; j++) {
			const symbol = symbols[j];
			if (propertyIsEnumerable.call(source, symbol)) assignValue(source[symbol], symbol);
		}
	}
	return result;
}
/**
* If the thing is a FormData object, return true, otherwise return false.
*
* @param {unknown} thing - The thing to check.
*
* @returns {boolean}
*/
function isSpecCompliantForm(thing) {
	return !!(thing && isFunction$1(thing.append) && thing[toStringTag] === "FormData" && thing[iterator]);
}
var toString, getPrototypeOf, iterator, toStringTag, hasOwnProperty, isUnsafeObjectKey, isPrototypeBoundary, isSafeAndFullyMutable, hasOwnInPrototypeChain, getSafeProp, toSafeFlatObject, kindOf, kindOfTest, typeOfTest, isArray, isUndefined, isArrayBuffer, isString, isFunction$1, isNumber, isObject, isBoolean, isPlainObject$1, isEmptyObject, isDate, isFile, isReactNativeBlob, isReactNative, isBlob, isFileList, isSet, isStream, G, FormDataCtor, isFormData, isURLSearchParams, isReadableStream, isRequest, isResponse, isHeaders, trim, _global$1, isContextDefined, extend, stripBOM, inherits, toFlatObject, endsWith, toArray, isTypedArray, forEachEntry, matchAll, isHTMLForm, toCamelCase, propertyIsEnumerable, isRegExp, reduceDescriptors, freezeMethods, toObjectSet, noop$1, toFiniteNumber, toJSONObject, isAsyncFn, isThenable, _setImmediate, asap, isIterable, isSafeIterable, utils_default;
var init_utils$1 = __esmMin((() => {
	init_bind();
	({toString} = Object.prototype);
	({getPrototypeOf} = Object);
	({iterator, toStringTag} = Symbol);
	hasOwnProperty = (({ hasOwnProperty }) => (obj, prop) => hasOwnProperty.call(obj, prop))(Object.prototype);
	isUnsafeObjectKey = (prop) => typeof prop === "string" && (prop === "__proto__" || prop === "constructor" || prop === "prototype");
	isPrototypeBoundary = (obj, prototype, source) => obj === Object.prototype || !source && prototype === null;
	isSafeAndFullyMutable = (obj) => {
		if (!Object.isExtensible(obj)) return false;
		const props = Object.getOwnPropertyNames(obj);
		if (Object.getOwnPropertySymbols) props.push(...Object.getOwnPropertySymbols(obj));
		return props.every((prop) => {
			if (isUnsafeObjectKey(prop)) return false;
			const descriptor = Object.getOwnPropertyDescriptor(obj, prop);
			return !!descriptor && descriptor.configurable && descriptor.writable === true;
		});
	};
	hasOwnInPrototypeChain = (thing, prop) => {
		let obj = thing;
		const seen = [];
		while (obj != null) {
			if (seen.indexOf(obj) !== -1) return false;
			seen.push(obj);
			const prototype = getPrototypeOf(obj);
			if (isPrototypeBoundary(obj, prototype, obj === thing)) return false;
			if (hasOwnProperty(obj, prop)) return true;
			obj = prototype;
		}
		return false;
	};
	getSafeProp = (obj, prop) => obj != null && hasOwnInPrototypeChain(obj, prop) ? obj[prop] : void 0;
	toSafeFlatObject = (thing) => {
		if (thing == null || typeof thing !== "object" && typeof thing !== "function") return thing;
		const sourcePrototype = getPrototypeOf(thing);
		if (sourcePrototype === null && isSafeAndFullyMutable(thing)) return thing;
		const result = Object.create(null);
		const merged = Object.create(null);
		const seen = [];
		let current = thing;
		while (current != null) {
			if (seen.indexOf(current) !== -1) break;
			seen.push(current);
			const prototype = current === thing ? sourcePrototype : getPrototypeOf(current);
			if (isPrototypeBoundary(current, prototype, current === thing)) break;
			const props = Object.getOwnPropertyNames(current);
			if (Object.getOwnPropertySymbols) props.push(...Object.getOwnPropertySymbols(current));
			for (const prop of props) {
				if (isUnsafeObjectKey(prop)) continue;
				if (!hasOwnProperty(merged, prop)) {
					result[prop] = thing[prop];
					merged[prop] = true;
				}
			}
			current = prototype;
		}
		return result;
	};
	kindOf = ((cache) => (thing) => {
		const str = toString.call(thing);
		return cache[str] || (cache[str] = str.slice(8, -1).toLowerCase());
	})(Object.create(null));
	kindOfTest = (type) => {
		type = type.toLowerCase();
		return (thing) => kindOf(thing) === type;
	};
	typeOfTest = (type) => (thing) => typeof thing === type;
	({isArray} = Array);
	isUndefined = typeOfTest("undefined");
	isArrayBuffer = kindOfTest("ArrayBuffer");
	isString = typeOfTest("string");
	isFunction$1 = typeOfTest("function");
	isNumber = typeOfTest("number");
	isObject = (thing) => thing !== null && typeof thing === "object";
	isBoolean = (thing) => thing === true || thing === false;
	isPlainObject$1 = (val) => {
		if (!isObject(val)) return false;
		const prototype = getPrototypeOf(val);
		return (prototype === null || prototype === Object.prototype || getPrototypeOf(prototype) === null) && !hasOwnInPrototypeChain(val, toStringTag) && !hasOwnInPrototypeChain(val, iterator);
	};
	isEmptyObject = (val) => {
		if (!isObject(val) || isBuffer(val)) return false;
		try {
			return Object.keys(val).length === 0 && Object.getPrototypeOf(val) === Object.prototype;
		} catch (e) {
			return false;
		}
	};
	isDate = kindOfTest("Date");
	isFile = kindOfTest("File");
	isReactNativeBlob = (value) => {
		return !!(value && typeof value.uri !== "undefined");
	};
	isReactNative = (formData) => formData && typeof formData.getParts !== "undefined";
	isBlob = kindOfTest("Blob");
	isFileList = kindOfTest("FileList");
	isSet = kindOfTest("Set");
	isStream = (val) => isObject(val) && isFunction$1(val.pipe);
	G = getGlobal();
	FormDataCtor = typeof G.FormData !== "undefined" ? G.FormData : void 0;
	isFormData = (thing) => {
		if (!thing) return false;
		if (FormDataCtor && thing instanceof FormDataCtor) return true;
		const proto = getPrototypeOf(thing);
		if (!proto || proto === Object.prototype) return false;
		if (!isFunction$1(thing.append)) return false;
		const kind = kindOf(thing);
		return kind === "formdata" || kind === "object" && isFunction$1(thing.toString) && thing.toString() === "[object FormData]";
	};
	isURLSearchParams = kindOfTest("URLSearchParams");
	[isReadableStream, isRequest, isResponse, isHeaders] = [
		"ReadableStream",
		"Request",
		"Response",
		"Headers"
	].map(kindOfTest);
	trim = (str) => {
		return str.trim ? str.trim() : str.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, "");
	};
	_global$1 = (() => {
		if (typeof globalThis !== "undefined") return globalThis;
		return typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : global;
	})();
	isContextDefined = (context) => !isUndefined(context) && context !== _global$1;
	extend = (a, b, thisArg, { allOwnKeys } = {}) => {
		forEach(b, (val, key) => {
			if (thisArg && isFunction$1(val)) Object.defineProperty(a, key, {
				__proto__: null,
				value: bind(val, thisArg),
				writable: true,
				enumerable: true,
				configurable: true
			});
			else Object.defineProperty(a, key, {
				__proto__: null,
				value: val,
				writable: true,
				enumerable: true,
				configurable: true
			});
		}, { allOwnKeys });
		return a;
	};
	stripBOM = (content) => {
		if (content.charCodeAt(0) === 65279) content = content.slice(1);
		return content;
	};
	inherits = (constructor, superConstructor, props, descriptors) => {
		constructor.prototype = Object.create(superConstructor.prototype, descriptors);
		Object.defineProperty(constructor.prototype, "constructor", {
			__proto__: null,
			value: constructor,
			writable: true,
			enumerable: false,
			configurable: true
		});
		Object.defineProperty(constructor, "super", {
			__proto__: null,
			value: superConstructor.prototype
		});
		props && Object.assign(constructor.prototype, props);
	};
	toFlatObject = (sourceObj, destObj, filter, propFilter) => {
		let props;
		let i;
		let prop;
		const merged = {};
		destObj = destObj || {};
		if (sourceObj == null) return destObj;
		do {
			props = Object.getOwnPropertyNames(sourceObj);
			i = props.length;
			while (i-- > 0) {
				prop = props[i];
				if ((!propFilter || propFilter(prop, sourceObj, destObj)) && !merged[prop]) {
					destObj[prop] = sourceObj[prop];
					merged[prop] = true;
				}
			}
			sourceObj = filter !== false && getPrototypeOf(sourceObj);
		} while (sourceObj && (!filter || filter(sourceObj, destObj)) && sourceObj !== Object.prototype);
		return destObj;
	};
	endsWith = (str, searchString, position) => {
		str = String(str);
		if (position === void 0 || position > str.length) position = str.length;
		position -= searchString.length;
		const lastIndex = str.indexOf(searchString, position);
		return lastIndex !== -1 && lastIndex === position;
	};
	toArray = (thing) => {
		if (!thing) return null;
		if (isArray(thing)) return thing;
		let i = thing.length;
		if (!isNumber(i)) return null;
		const arr = new Array(i);
		while (i-- > 0) arr[i] = thing[i];
		return arr;
	};
	isTypedArray = ((TypedArray) => {
		return (thing) => {
			return TypedArray && thing instanceof TypedArray;
		};
	})(typeof Uint8Array !== "undefined" && getPrototypeOf(Uint8Array));
	forEachEntry = (obj, fn) => {
		const _iterator = (obj && obj[iterator]).call(obj);
		let result;
		while ((result = _iterator.next()) && !result.done) {
			const pair = result.value;
			fn.call(obj, pair[0], pair[1]);
		}
	};
	matchAll = (regExp, str) => {
		let matches;
		const arr = [];
		while ((matches = regExp.exec(str)) !== null) arr.push(matches);
		return arr;
	};
	isHTMLForm = kindOfTest("HTMLFormElement");
	toCamelCase = (str) => {
		return str.toLowerCase().replace(/[-_\s]([a-z\d])(\w*)/g, function replacer(m, p1, p2) {
			return p1.toUpperCase() + p2;
		});
	};
	({propertyIsEnumerable} = Object.prototype);
	isRegExp = kindOfTest("RegExp");
	reduceDescriptors = (obj, reducer) => {
		const descriptors = Object.getOwnPropertyDescriptors(obj);
		const reducedDescriptors = {};
		forEach(descriptors, (descriptor, name) => {
			let ret;
			if ((ret = reducer(descriptor, name, obj)) !== false) reducedDescriptors[name] = ret || descriptor;
		});
		Object.defineProperties(obj, reducedDescriptors);
	};
	freezeMethods = (obj) => {
		reduceDescriptors(obj, (descriptor, name) => {
			if (isFunction$1(obj) && [
				"arguments",
				"caller",
				"callee"
			].includes(name)) return false;
			const value = obj[name];
			if (!isFunction$1(value)) return;
			descriptor.enumerable = false;
			if ("writable" in descriptor) {
				descriptor.writable = false;
				return;
			}
			if (!descriptor.set) descriptor.set = () => {
				throw Error("Can not rewrite read-only method '" + name + "'");
			};
		});
	};
	toObjectSet = (arrayOrString, delimiter) => {
		const obj = {};
		const define = (arr) => {
			arr.forEach((value) => {
				obj[value] = true;
			});
		};
		isArray(arrayOrString) ? define(arrayOrString) : define(String(arrayOrString).split(delimiter));
		return obj;
	};
	noop$1 = () => {};
	toFiniteNumber = (value, defaultValue) => {
		return value != null && Number.isFinite(value = +value) ? value : defaultValue;
	};
	toJSONObject = (obj) => {
		const visited = /* @__PURE__ */ new WeakSet();
		const visit = (source) => {
			if (isObject(source)) {
				if (visited.has(source)) return;
				if (isBuffer(source)) return source;
				if (!("toJSON" in source)) {
					visited.add(source);
					let target;
					if (isSet(source)) {
						target = [];
						for (const value of source) {
							const reducedValue = visit(value);
							!isUndefined(reducedValue) && target.push(reducedValue);
						}
					} else {
						target = isArray(source) ? [] : {};
						forEach(source, (value, key) => {
							const reducedValue = visit(value);
							!isUndefined(reducedValue) && (target[key] = reducedValue);
						});
					}
					visited.delete(source);
					return target;
				}
			}
			return source;
		};
		return visit(obj);
	};
	isAsyncFn = kindOfTest("AsyncFunction");
	isThenable = (thing) => thing && (isObject(thing) || isFunction$1(thing)) && isFunction$1(thing.then) && isFunction$1(thing.catch);
	_setImmediate = ((setImmediateSupported, postMessageSupported) => {
		if (setImmediateSupported) return setImmediate;
		return postMessageSupported ? ((token, callbacks) => {
			_global$1.addEventListener("message", ({ source, data }) => {
				if (source === _global$1 && data === token) callbacks.length && callbacks.shift()();
			}, false);
			return (cb) => {
				callbacks.push(cb);
				_global$1.postMessage(token, "*");
			};
		})(`axios@${Math.random()}`, []) : (cb) => setTimeout(cb);
	})(typeof setImmediate === "function", isFunction$1(_global$1.postMessage));
	asap = typeof queueMicrotask !== "undefined" ? queueMicrotask.bind(_global$1) : typeof process !== "undefined" && process.nextTick || _setImmediate;
	isIterable = (thing) => thing != null && isFunction$1(thing[iterator]);
	isSafeIterable = (thing) => thing != null && hasOwnInPrototypeChain(thing, iterator) && isIterable(thing);
	utils_default = {
		isArray,
		isArrayBuffer,
		isBuffer,
		isFormData,
		isArrayBufferView,
		isString,
		isNumber,
		isBoolean,
		isObject,
		isPlainObject: isPlainObject$1,
		isEmptyObject,
		isReadableStream,
		isRequest,
		isResponse,
		isHeaders,
		isUndefined,
		isDate,
		isFile,
		isReactNativeBlob,
		isReactNative,
		isBlob,
		isRegExp,
		isFunction: isFunction$1,
		isStream,
		isURLSearchParams,
		isTypedArray,
		isFileList,
		forEach,
		merge,
		extend,
		trim,
		stripBOM,
		inherits,
		toFlatObject,
		kindOf,
		kindOfTest,
		endsWith,
		toArray,
		forEachEntry,
		matchAll,
		isHTMLForm,
		hasOwnProperty,
		hasOwnProp: hasOwnProperty,
		hasOwnInPrototypeChain,
		getSafeProp,
		toSafeFlatObject,
		reduceDescriptors,
		freezeMethods,
		toObjectSet,
		toCamelCase,
		noop: noop$1,
		toFiniteNumber,
		findKey,
		global: _global$1,
		isContextDefined,
		isSpecCompliantForm,
		toJSONObject,
		isAsyncFn,
		isThenable,
		setImmediate: _setImmediate,
		asap,
		isIterable,
		isSafeIterable
	};
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/helpers/parseHeaders.js
var ignoreDuplicateOf, parseHeaders_default;
var init_parseHeaders = __esmMin((() => {
	init_utils$1();
	ignoreDuplicateOf = utils_default.toObjectSet([
		"age",
		"authorization",
		"content-length",
		"content-type",
		"etag",
		"expires",
		"from",
		"host",
		"if-modified-since",
		"if-unmodified-since",
		"last-modified",
		"location",
		"max-forwards",
		"proxy-authorization",
		"referer",
		"retry-after",
		"user-agent"
	]);
	parseHeaders_default = (rawHeaders) => {
		const parsed = {};
		let key;
		let val;
		let i;
		rawHeaders && rawHeaders.split("\n").forEach(function parser(line) {
			i = line.indexOf(":");
			key = line.substring(0, i).trim().toLowerCase();
			val = line.substring(i + 1).trim();
			const hasKey = utils_default.hasOwnProp(parsed, key);
			if (!key || hasKey && utils_default.hasOwnProp(ignoreDuplicateOf, key)) return;
			if (key === "set-cookie") {
				if (hasKey) parsed[key].push(val);
				else parsed[key] = [val];
			} else parsed[key] = hasKey ? parsed[key] + ", " + val : val;
		});
		return parsed;
	};
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/helpers/sanitizeHeaderValue.js
function trimSPorHTAB(str) {
	let start = 0;
	let end = str.length;
	while (start < end) {
		const code = str.charCodeAt(start);
		if (code !== 9 && code !== 32) break;
		start += 1;
	}
	while (end > start) {
		const code = str.charCodeAt(end - 1);
		if (code !== 9 && code !== 32) break;
		end -= 1;
	}
	return start === 0 && end === str.length ? str : str.slice(start, end);
}
function sanitizeValue(value, invalidChars) {
	if (utils_default.isArray(value)) return value.map((item) => sanitizeValue(item, invalidChars));
	return trimSPorHTAB(String(value).replace(invalidChars, ""));
}
function toByteStringHeaderObject(headers) {
	const byteStringHeaders = Object.create(null);
	utils_default.forEach(headers.toJSON(), (value, header) => {
		byteStringHeaders[header] = sanitizeByteStringHeaderValue(value);
	});
	return byteStringHeaders;
}
var INVALID_UNICODE_HEADER_VALUE_CHARS, INVALID_BYTE_STRING_HEADER_VALUE_CHARS, sanitizeHeaderValue, sanitizeByteStringHeaderValue;
var init_sanitizeHeaderValue = __esmMin((() => {
	init_utils$1();
	INVALID_UNICODE_HEADER_VALUE_CHARS = /* @__PURE__ */ new RegExp("[\\u0000-\\u0008\\u000a-\\u001f\\u007f]+", "g");
	INVALID_BYTE_STRING_HEADER_VALUE_CHARS = /* @__PURE__ */ new RegExp("[^\\u0009\\u0020-\\u007e\\u0080-\\u00ff]+", "g");
	sanitizeHeaderValue = (value) => sanitizeValue(value, INVALID_UNICODE_HEADER_VALUE_CHARS);
	sanitizeByteStringHeaderValue = (value) => sanitizeValue(value, INVALID_BYTE_STRING_HEADER_VALUE_CHARS);
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/core/AxiosHeaders.js
function normalizeHeader(header) {
	return header && String(header).trim().toLowerCase();
}
function normalizeValue(value) {
	if (value === false || value == null) return value;
	return utils_default.isArray(value) ? value.map(normalizeValue) : sanitizeHeaderValue(String(value));
}
function parseTokens(str) {
	const tokens = Object.create(null);
	const tokensRE = /([^\s,;=]+)\s*(?:=\s*([^,;]+))?/g;
	let match;
	while (match = tokensRE.exec(str)) tokens[match[1]] = match[2];
	return tokens;
}
function trimOWS(value) {
	let start = 0;
	let end = value.length;
	while (start < end) {
		const code = value.charCodeAt(start);
		if (code !== 9 && code !== 32) break;
		start += 1;
	}
	while (end > start) {
		const code = value.charCodeAt(end - 1);
		if (code !== 9 && code !== 32) break;
		end -= 1;
	}
	return start === 0 && end === value.length ? value : value.slice(start, end);
}
function decodeQuotedString(value) {
	const last = value.length - 1;
	if (last < 1 || value.charCodeAt(0) !== 34 || value.charCodeAt(last) !== 34) return value;
	let decoded = "";
	for (let i = 1; i < last; i++) {
		const code = value.charCodeAt(i);
		if (code === 34) return value;
		if (code === 92) {
			i += 1;
			if (i >= last) return value;
		}
		decoded += value[i];
	}
	return decoded;
}
function parseParameters(value) {
	const parameters = Object.create(null);
	const str = String(value);
	let start = 0;
	let quoted = false;
	let escaped = false;
	function parseParameter(end) {
		const part = trimOWS(str.slice(start, end));
		const equals = part.indexOf("=");
		if (equals < 1) return;
		const name = trimOWS(part.slice(0, equals));
		if (!parameterNameRE.test(name)) return;
		const normalizedName = name.toLowerCase();
		if (normalizedName === "__proto__" || normalizedName === "constructor" || normalizedName === "prototype") return;
		const parameterValue = trimOWS(part.slice(equals + 1));
		parameters[normalizedName] = decodeQuotedString(parameterValue);
	}
	for (let i = 0; i < str.length; i++) {
		const code = str.charCodeAt(i);
		if (quoted) {
			if (escaped) escaped = false;
			else if (code === 92) escaped = true;
			else if (code === 34) quoted = false;
		} else if (code === 34) quoted = true;
		else if (code === 44 || code === 59) {
			parseParameter(i);
			start = i + 1;
		}
	}
	parseParameter(str.length);
	return parameters;
}
function matchHeaderValue(context, value, header, filter, isHeaderNameFilter) {
	if (utils_default.isFunction(filter)) return filter.call(this, value, header);
	if (isHeaderNameFilter) value = header;
	if (!utils_default.isString(value)) return;
	if (utils_default.isString(filter)) return value.indexOf(filter) !== -1;
	if (utils_default.isRegExp(filter)) return filter.test(value);
}
function formatHeader(header) {
	return header.trim().toLowerCase().replace(/([a-z\d])(\w*)/g, (w, char, str) => {
		return char.toUpperCase() + str;
	});
}
function buildAccessors(obj, header) {
	const accessorName = utils_default.toCamelCase(" " + header);
	[
		"get",
		"set",
		"has"
	].forEach((methodName) => {
		Object.defineProperty(obj, methodName + accessorName, {
			__proto__: null,
			value: function(arg1, arg2, arg3) {
				return this[methodName].call(this, header, arg1, arg2, arg3);
			},
			configurable: true
		});
	});
}
var $internals$1, parameterNameRE, isValidHeaderName, AxiosHeaders;
var init_AxiosHeaders = __esmMin((() => {
	init_utils$1();
	init_parseHeaders();
	init_sanitizeHeaderValue();
	$internals$1 = Symbol("internals");
	parameterNameRE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
	isValidHeaderName = (str) => /^[-_a-zA-Z0-9^`|~,!#$%&'*+.]+$/.test(str.trim());
	AxiosHeaders = class {
		constructor(headers) {
			headers && this.set(headers);
		}
		set(header, valueOrRewrite, rewrite) {
			const self = this;
			function setHeader(_value, _header, _rewrite) {
				const lHeader = normalizeHeader(_header);
				if (!lHeader) return;
				const key = utils_default.findKey(self, lHeader);
				if (!key || self[key] === void 0 || _rewrite === true || _rewrite === void 0 && self[key] !== false) self[key || _header] = normalizeValue(_value);
			}
			const setHeaders = (headers, _rewrite) => utils_default.forEach(headers, (_value, _header) => setHeader(_value, _header, _rewrite));
			if (utils_default.isPlainObject(header) || header instanceof this.constructor) setHeaders(header, valueOrRewrite);
			else if (utils_default.isString(header) && (header = header.trim()) && !isValidHeaderName(header)) setHeaders(parseHeaders_default(header), valueOrRewrite);
			else if (utils_default.isObject(header) && utils_default.isSafeIterable(header)) {
				let obj = Object.create(null), dest, key;
				for (const entry of header) {
					if (!utils_default.isArray(entry)) throw new TypeError("Object iterator must return a key-value pair");
					key = entry[0];
					if (utils_default.hasOwnProp(obj, key)) {
						dest = obj[key];
						obj[key] = utils_default.isArray(dest) ? [...dest, entry[1]] : [dest, entry[1]];
					} else obj[key] = entry[1];
				}
				setHeaders(obj, valueOrRewrite);
			} else header != null && setHeader(valueOrRewrite, header, rewrite);
			return this;
		}
		get(header, parser) {
			header = normalizeHeader(header);
			if (header) {
				const key = utils_default.findKey(this, header);
				if (key) {
					const value = this[key];
					if (!parser) return value;
					if (parser === true) return parseTokens(value);
					if (utils_default.isFunction(parser)) return parser.call(this, value, key);
					if (utils_default.isRegExp(parser)) return parser.exec(value);
					throw new TypeError("parser must be boolean|regexp|function");
				}
			}
		}
		has(header, matcher) {
			header = normalizeHeader(header);
			if (header) {
				const key = utils_default.findKey(this, header);
				return !!(key && this[key] !== void 0 && (!matcher || matchHeaderValue(this, this[key], key, matcher)));
			}
			return false;
		}
		delete(header, matcher) {
			const self = this;
			let deleted = false;
			function deleteHeader(_header) {
				_header = normalizeHeader(_header);
				if (_header) {
					const key = utils_default.findKey(self, _header);
					if (key && (!matcher || matchHeaderValue(self, self[key], key, matcher))) {
						delete self[key];
						deleted = true;
					}
				}
			}
			if (utils_default.isArray(header)) header.forEach(deleteHeader);
			else deleteHeader(header);
			return deleted;
		}
		clear(matcher) {
			const keys = Object.keys(this);
			let i = keys.length;
			let deleted = false;
			while (i--) {
				const key = keys[i];
				if (!matcher || matchHeaderValue(this, this[key], key, matcher, true)) {
					delete this[key];
					deleted = true;
				}
			}
			return deleted;
		}
		normalize(format) {
			const self = this;
			const headers = {};
			utils_default.forEach(this, (value, header) => {
				const key = utils_default.findKey(headers, header);
				if (key) {
					self[key] = normalizeValue(value);
					delete self[header];
					return;
				}
				const normalized = format ? formatHeader(header) : String(header).trim();
				if (normalized !== header) delete self[header];
				self[normalized] = normalizeValue(value);
				headers[normalized] = true;
			});
			return this;
		}
		concat(...targets) {
			return this.constructor.concat(this, ...targets);
		}
		toJSON(asStrings) {
			const obj = Object.create(null);
			utils_default.forEach(this, (value, header) => {
				value != null && value !== false && (obj[header] = asStrings && utils_default.isArray(value) ? value.join(", ") : value);
			});
			return obj;
		}
		[Symbol.iterator]() {
			return Object.entries(this.toJSON())[Symbol.iterator]();
		}
		toString() {
			return Object.entries(this.toJSON()).map(([header, value]) => header + ": " + value).join("\n");
		}
		getSetCookie() {
			const value = this.get("set-cookie");
			return utils_default.isArray(value) ? value : value == null || value === false ? [] : [value];
		}
		get [Symbol.toStringTag]() {
			return "AxiosHeaders";
		}
		static from(thing) {
			return thing instanceof this ? thing : new this(thing);
		}
		static parseParameters(value) {
			return parseParameters(value);
		}
		static concat(first, ...targets) {
			const computed = new this(first);
			targets.forEach((target) => computed.set(target));
			return computed;
		}
		static accessor(header) {
			const accessors = (this[$internals$1] = this[$internals$1] = { accessors: {} }).accessors;
			const prototype = this.prototype;
			function defineAccessor(_header) {
				const lHeader = normalizeHeader(_header);
				if (!accessors[lHeader]) {
					buildAccessors(prototype, _header);
					accessors[lHeader] = true;
				}
			}
			utils_default.isArray(header) ? header.forEach(defineAccessor) : defineAccessor(header);
			return this;
		}
	};
	AxiosHeaders.accessor([
		"Content-Type",
		"Content-Length",
		"Accept",
		"Accept-Encoding",
		"User-Agent",
		"Authorization"
	]);
	utils_default.reduceDescriptors(AxiosHeaders.prototype, ({ value }, key) => {
		let mapped = key[0].toUpperCase() + key.slice(1);
		return {
			get: () => value,
			set(headerValue) {
				this[mapped] = headerValue;
			}
		};
	});
	utils_default.freezeMethods(AxiosHeaders);
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/core/AxiosError.js
function hasOwnOrPrototypeToJSON(source) {
	if (utils_default.hasOwnProp(source, "toJSON")) return true;
	let prototype = Object.getPrototypeOf(source);
	while (prototype && prototype !== Object.prototype) {
		if (utils_default.hasOwnProp(prototype, "toJSON")) return true;
		prototype = Object.getPrototypeOf(prototype);
	}
	return false;
}
function redactConfig(config, redactKeys) {
	const lowerKeys = new Set(redactKeys.map((k) => String(k).toLowerCase()));
	const seen = [];
	const visit = (source) => {
		if (source === null || typeof source !== "object") return source;
		if (utils_default.isBuffer(source)) return source;
		if (seen.indexOf(source) !== -1) return void 0;
		if (source instanceof AxiosHeaders) source = source.toJSON();
		seen.push(source);
		let result;
		if (utils_default.isArray(source)) {
			result = [];
			source.forEach((v, i) => {
				const reducedValue = visit(v);
				if (!utils_default.isUndefined(reducedValue)) result[i] = reducedValue;
			});
		} else {
			if (!utils_default.isPlainObject(source) && hasOwnOrPrototypeToJSON(source)) {
				seen.pop();
				return source;
			}
			result = Object.create(null);
			for (const [key, value] of Object.entries(source)) {
				const reducedValue = lowerKeys.has(key.toLowerCase()) ? REDACTED : visit(value);
				if (!utils_default.isUndefined(reducedValue)) result[key] = reducedValue;
			}
		}
		seen.pop();
		return result;
	};
	return visit(config);
}
function stringifySafely$1(value) {
	try {
		return String(value);
	} catch (err) {
		return "";
	}
}
function aggregateErrorMessage(error) {
	return error.errors.map((entry) => {
		try {
			return entry && entry.message ? stringifySafely$1(entry.message) : stringifySafely$1(entry);
		} catch (err) {
			return "";
		}
	}).filter(Boolean).join("; ") || error.name || "AggregateError";
}
var REDACTED, AxiosError;
var init_AxiosError = __esmMin((() => {
	init_utils$1();
	init_AxiosHeaders();
	REDACTED = "[REDACTED ****]";
	AxiosError = class AxiosError extends Error {
		static from(error, code, config, request, response, customProps) {
			let message = error.message;
			if (!message && utils_default.isArray(error.errors) && error.errors.length) message = aggregateErrorMessage(error);
			const axiosError = new AxiosError(message, code || error.code, config, request, response);
			Object.defineProperty(axiosError, "cause", {
				__proto__: null,
				value: error,
				writable: true,
				enumerable: false,
				configurable: true
			});
			axiosError.name = error.name;
			if (error.status != null && axiosError.status == null) axiosError.status = error.status;
			customProps && Object.assign(axiosError, customProps);
			return axiosError;
		}
		/**
		* Create an Error with the specified message, config, error code, request and response.
		*
		* @param {string} message The error message.
		* @param {string} [code] The error code (for example, 'ECONNABORTED').
		* @param {Object} [config] The config.
		* @param {Object} [request] The request.
		* @param {Object} [response] The response.
		*
		* @returns {Error} The created error.
		*/
		constructor(message, code, config, request, response) {
			super(message);
			Object.defineProperty(this, "message", {
				__proto__: null,
				value: message,
				enumerable: true,
				writable: true,
				configurable: true
			});
			this.name = "AxiosError";
			this.isAxiosError = true;
			code && (this.code = code);
			config && (this.config = config);
			request && (this.request = request);
			if (response) {
				this.response = response;
				this.status = response.status;
			}
		}
		toJSON() {
			const config = this.config;
			const redactKeys = config && utils_default.hasOwnProp(config, "redact") ? config.redact : void 0;
			const serializedConfig = utils_default.isArray(redactKeys) && redactKeys.length > 0 ? redactConfig(config, redactKeys) : utils_default.toJSONObject(config);
			return {
				message: this.message,
				name: this.name,
				description: this.description,
				number: this.number,
				fileName: this.fileName,
				lineNumber: this.lineNumber,
				columnNumber: this.columnNumber,
				stack: this.stack,
				config: serializedConfig,
				code: this.code,
				status: this.status
			};
		}
	};
	AxiosError.ERR_BAD_OPTION_VALUE = "ERR_BAD_OPTION_VALUE";
	AxiosError.ERR_BAD_OPTION = "ERR_BAD_OPTION";
	AxiosError.ECONNABORTED = "ECONNABORTED";
	AxiosError.ETIMEDOUT = "ETIMEDOUT";
	AxiosError.ECONNREFUSED = "ECONNREFUSED";
	AxiosError.ERR_NETWORK = "ERR_NETWORK";
	AxiosError.ERR_FR_TOO_MANY_REDIRECTS = "ERR_FR_TOO_MANY_REDIRECTS";
	AxiosError.ERR_DEPRECATED = "ERR_DEPRECATED";
	AxiosError.ERR_BAD_RESPONSE = "ERR_BAD_RESPONSE";
	AxiosError.ERR_BAD_REQUEST = "ERR_BAD_REQUEST";
	AxiosError.ERR_CANCELED = "ERR_CANCELED";
	AxiosError.ERR_NOT_SUPPORT = "ERR_NOT_SUPPORT";
	AxiosError.ERR_INVALID_URL = "ERR_INVALID_URL";
	AxiosError.ERR_FORM_DATA_DEPTH_EXCEEDED = "ERR_FORM_DATA_DEPTH_EXCEEDED";
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/helpers/null.js
var init_null = __esmMin((() => {}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/helpers/toFormData.js
/**
* Determines if the given thing is a array or js object.
*
* @param {string} thing - The object or array to be visited.
*
* @returns {boolean}
*/
function isVisitable(thing) {
	return utils_default.isPlainObject(thing) || utils_default.isArray(thing);
}
/**
* It removes the brackets from the end of a string
*
* @param {string} key - The key of the parameter.
*
* @returns {string} the key without the brackets.
*/
function removeBrackets(key) {
	return utils_default.endsWith(key, "[]") ? key.slice(0, -2) : key;
}
/**
* It takes a path, a key, and a boolean, and returns a string
*
* @param {string} path - The path to the current key.
* @param {string} key - The key of the current object being iterated over.
* @param {string} dots - If true, the key will be rendered with dots instead of brackets.
*
* @returns {string} The path to the current key.
*/
function renderKey(path, key, dots) {
	if (!path) return key;
	return path.concat(key).map(function each(token, i) {
		token = removeBrackets(token);
		return !dots && i ? "[" + token + "]" : token;
	}).join(dots ? "." : "");
}
/**
* If the array is an array and none of its elements are visitable, then it's a flat array.
*
* @param {Array<any>} arr - The array to check
*
* @returns {boolean}
*/
function isFlatArray(arr) {
	return utils_default.isArray(arr) && !arr.some(isVisitable);
}
/**
* Convert a data object to FormData
*
* @param {Object} obj
* @param {?Object} [formData]
* @param {?Object} [options]
* @param {Function} [options.visitor]
* @param {Boolean} [options.metaTokens = true]
* @param {Boolean} [options.dots = false]
* @param {?Boolean} [options.indexes = false]
*
* @returns {Object}
**/
/**
* It converts an object into a FormData object
*
* @param {Object<any, any>} obj - The object to convert to form data.
* @param {string} formData - The FormData object to append to.
* @param {Object<string, any>} options
*
* @returns
*/
function toFormData(obj, formData, options) {
	if (!utils_default.isObject(obj)) throw new TypeError("target must be an object");
	formData = formData || new FormData();
	const option = (name, fallback) => {
		const value = utils_default.getSafeProp(options, name);
		return utils_default.isUndefined(value) ? fallback : value;
	};
	const metaTokens = option("metaTokens", true);
	const visitor = option("visitor") || defaultVisitor;
	const dots = option("dots", false);
	const indexes = option("indexes", false);
	const _Blob = option("Blob") || typeof Blob !== "undefined" && Blob;
	const maxDepth = option("maxDepth", 100);
	const useBlob = _Blob && utils_default.isSpecCompliantForm(formData);
	const stack = [];
	if (!utils_default.isFunction(visitor)) throw new TypeError("visitor must be a function");
	function convertValue(value) {
		if (value === null) return "";
		if (utils_default.isDate(value)) return value.toISOString();
		if (utils_default.isBoolean(value)) return value.toString();
		if (!useBlob && utils_default.isBlob(value)) throw new AxiosError("Blob is not supported. Use a Buffer instead.");
		if (utils_default.isArrayBuffer(value) || utils_default.isTypedArray(value)) {
			if (useBlob && typeof _Blob === "function") return new _Blob([value]);
			throw new AxiosError("Blob is not supported. Use a Buffer instead.", AxiosError.ERR_NOT_SUPPORT);
		}
		return value;
	}
	function throwIfMaxDepthExceeded(depth) {
		if (depth > maxDepth) throw new AxiosError("Object is too deeply nested (" + depth + " levels). Max depth: " + maxDepth, AxiosError.ERR_FORM_DATA_DEPTH_EXCEEDED);
	}
	function stringifyWithDepthLimit(value, depth) {
		if (maxDepth === Infinity) return JSON.stringify(value);
		const ancestors = [];
		return JSON.stringify(value, function limitDepth(_key, currentValue) {
			if (!utils_default.isObject(currentValue)) return currentValue;
			while (ancestors.length && ancestors[ancestors.length - 1] !== this) ancestors.pop();
			ancestors.push(currentValue);
			throwIfMaxDepthExceeded(depth + ancestors.length - 1);
			return currentValue;
		});
	}
	/**
	* Default visitor.
	*
	* @param {*} value
	* @param {String|Number} key
	* @param {Array<String|Number>} path
	* @this {FormData}
	*
	* @returns {boolean} return true to visit the each prop of the value recursively
	*/
	function defaultVisitor(value, key, path) {
		let arr = value;
		if (utils_default.isReactNative(formData) && utils_default.isReactNativeBlob(value)) {
			formData.append(renderKey(path, key, dots), convertValue(value));
			return false;
		}
		if (value && !path && typeof value === "object") {
			if (utils_default.endsWith(key, "{}")) {
				key = metaTokens ? key : key.slice(0, -2);
				value = stringifyWithDepthLimit(value, 1);
			} else if (utils_default.isArray(value) && isFlatArray(value) || (utils_default.isFileList(value) || utils_default.endsWith(key, "[]")) && (arr = utils_default.toArray(value))) {
				key = removeBrackets(key);
				arr.forEach(function each(el, index) {
					!(utils_default.isUndefined(el) || el === null) && formData.append(indexes === true ? renderKey([key], index, dots) : indexes === null ? key : key + "[]", convertValue(el));
				});
				return false;
			}
		}
		if (isVisitable(value)) return true;
		formData.append(renderKey(path, key, dots), convertValue(value));
		return false;
	}
	const exposedHelpers = Object.assign(predicates, {
		defaultVisitor,
		convertValue,
		isVisitable
	});
	function build(value, path, depth = 0) {
		if (utils_default.isUndefined(value)) return;
		throwIfMaxDepthExceeded(depth);
		if (stack.indexOf(value) !== -1) throw new Error("Circular reference detected in " + path.join("."));
		stack.push(value);
		utils_default.forEach(value, function each(el, key) {
			if ((!(utils_default.isUndefined(el) || el === null) && visitor.call(formData, el, utils_default.isString(key) ? key.trim() : key, path, exposedHelpers)) === true) build(el, path ? path.concat(key) : [key], depth + 1);
		});
		stack.pop();
	}
	if (!utils_default.isObject(obj)) throw new TypeError("data must be an object");
	build(obj);
	return formData;
}
var predicates;
var init_toFormData = __esmMin((() => {
	init_utils$1();
	init_AxiosError();
	init_null();
	predicates = utils_default.toFlatObject(utils_default, {}, null, function filter(prop) {
		return /^is[A-Z]/.test(prop);
	});
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/helpers/AxiosURLSearchParams.js
/**
* It encodes a string by replacing all characters that are not in the unreserved set with
* their percent-encoded equivalents
*
* @param {string} str - The string to encode.
*
* @returns {string} The encoded string.
*/
function encode$1(str) {
	const charMap = {
		"!": "%21",
		"'": "%27",
		"(": "%28",
		")": "%29",
		"~": "%7E",
		"%20": "+"
	};
	return encodeURIComponent(str).replace(/[!'()~]|%20/g, function replacer(match) {
		return charMap[match];
	});
}
/**
* It takes a params object and converts it to a FormData object
*
* @param {Object<string, any>} params - The parameters to be converted to a FormData object.
* @param {Object<string, any>} options - The options object passed to the Axios constructor.
*
* @returns {void}
*/
function AxiosURLSearchParams(params, options) {
	this._pairs = [];
	params && toFormData(params, this, options);
}
var prototype;
var init_AxiosURLSearchParams = __esmMin((() => {
	init_toFormData();
	prototype = AxiosURLSearchParams.prototype;
	prototype.append = function append(name, value) {
		this._pairs.push([name, value]);
	};
	prototype.toString = function toString(encoder) {
		const _encode = encoder ? (value) => encoder.call(this, value, encode$1) : encode$1;
		return this._pairs.map(function each(pair) {
			return _encode(pair[0]) + "=" + _encode(pair[1]);
		}, "").join("&");
	};
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/helpers/buildURL.js
/**
* It replaces URL-encoded forms of `:`, `$`, `,`, and spaces with
* their plain counterparts (`:`, `$`, `,`, `+`).
*
* @param {string} val The value to be encoded.
*
* @returns {string} The encoded value.
*/
function encode(val) {
	return encodeURIComponent(val).replace(/%3A/gi, ":").replace(/%24/g, "$").replace(/%2C/gi, ",").replace(/%20/g, "+");
}
/**
* Build a URL by appending params to the end
*
* @param {string} url The base of the url (e.g., http://www.google.com)
* @param {object} [params] The params to be appended
* @param {?(object|Function)} options
*
* @returns {string} The formatted url
*/
function buildURL(url, params, options) {
	if (!params) return url;
	url = url || "";
	const _options = utils_default.isFunction(options) ? { serialize: options } : options;
	const _encode = utils_default.getSafeProp(_options, "encode") || encode;
	const serializeFn = utils_default.getSafeProp(_options, "serialize");
	let serializedParams;
	if (serializeFn) serializedParams = serializeFn(params, _options);
	else serializedParams = utils_default.isURLSearchParams(params) ? params.toString() : new AxiosURLSearchParams(params, _options).toString(_encode);
	if (serializedParams) {
		const hashmarkIndex = url.indexOf("#");
		if (hashmarkIndex !== -1) url = url.slice(0, hashmarkIndex);
		url += (url.indexOf("?") === -1 ? "?" : "&") + serializedParams;
	}
	return url;
}
var init_buildURL = __esmMin((() => {
	init_utils$1();
	init_AxiosURLSearchParams();
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/core/InterceptorManager.js
function countHandlers(handlers) {
	return handlers ? handlers.length : 0;
}
function trimHandlers(handlers) {
	if (!handlers) return;
	while (handlers.length && handlers[handlers.length - 1] === null) handlers.pop();
}
function syncHandlerEntries(manager, internals) {
	const handlers = manager.handlers;
	const length = countHandlers(handlers);
	if (handlers !== internals.handlersRef) {
		internals.handlersRef = handlers;
		internals.handlerEntries.clear();
	} else if (length !== internals.handlersLength) {
		if (!length) internals.handlerEntries.clear();
		else internals.handlerEntries.forEach(function removeStaleEntry(entry, id) {
			if (handlers[entry.index] !== entry.handler) internals.handlerEntries.delete(id);
		});
	}
	internals.handlersLength = length;
}
var $internals, InterceptorManager;
var init_InterceptorManager = __esmMin((() => {
	init_utils$1();
	$internals = Symbol("internals");
	InterceptorManager = class {
		constructor() {
			this.handlers = [];
			this[$internals] = {
				handlersRef: this.handlers,
				handlersLength: this.handlers.length,
				handlerEntries: /* @__PURE__ */ new Map(),
				iterationDepth: 0,
				nextId: 0
			};
		}
		/**
		* Add a new interceptor to the stack
		*
		* @param {Function} fulfilled The function to handle `then` for a `Promise`
		* @param {Function} rejected The function to handle `reject` for a `Promise`
		* @param {Object} options The options for the interceptor, synchronous and runWhen
		*
		* @return {Number} An ID used to remove interceptor later
		*/
		use(fulfilled, rejected, options) {
			const handler = {
				fulfilled,
				rejected,
				synchronous: options ? options.synchronous : false,
				runWhen: options ? options.runWhen : null
			};
			const internals = this[$internals];
			if (this.handlers == null) this.handlers = [];
			syncHandlerEntries(this, internals);
			const id = internals.nextId++;
			this.handlers.push(handler);
			internals.handlerEntries.set(id, {
				handler,
				index: this.handlers.length - 1
			});
			internals.handlersLength = this.handlers.length;
			return id;
		}
		/**
		* Remove an interceptor from the stack
		*
		* @param {Number} id The ID that was returned by `use`
		*
		* @returns {void}
		*/
		eject(id) {
			const internals = this[$internals];
			syncHandlerEntries(this, internals);
			const entry = internals.handlerEntries.get(id);
			if (entry) {
				internals.handlerEntries.delete(id);
				if (this.handlers[entry.index] !== entry.handler) return;
				this.handlers[entry.index] = null;
				if (!internals.iterationDepth) {
					trimHandlers(this.handlers);
					internals.handlersLength = this.handlers.length;
				}
			}
		}
		/**
		* Clear all interceptors from the stack
		*
		* @returns {void}
		*/
		clear() {
			if (this.handlers) {
				this.handlers = [];
				syncHandlerEntries(this, this[$internals]);
			}
		}
		/**
		* Iterate over all the registered interceptors
		*
		* This method is particularly useful for skipping over any
		* interceptors that may have become `null` calling `eject`.
		*
		* @param {Function} fn The function to call for each interceptor
		*
		* @returns {void}
		*/
		forEach(fn) {
			const internals = this[$internals];
			syncHandlerEntries(this, internals);
			internals.iterationDepth++;
			try {
				utils_default.forEach(this.handlers, function forEachHandler(h) {
					if (h !== null) fn(h);
				});
			} finally {
				if (!--internals.iterationDepth) {
					syncHandlerEntries(this, internals);
					trimHandlers(this.handlers);
					internals.handlersLength = countHandlers(this.handlers);
				}
			}
		}
	};
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/defaults/transitional.js
var transitional_default;
var init_transitional = __esmMin((() => {
	transitional_default = {
		silentJSONParsing: true,
		forcedJSONParsing: true,
		clarifyTimeoutError: false,
		legacyInterceptorReqResOrdering: true,
		advertiseZstdAcceptEncoding: false,
		validateStatusUndefinedResolves: true
	};
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/platform/browser/classes/URLSearchParams.js
var URLSearchParams_default;
var init_URLSearchParams = __esmMin((() => {
	init_AxiosURLSearchParams();
	URLSearchParams_default = typeof URLSearchParams !== "undefined" ? URLSearchParams : AxiosURLSearchParams;
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/platform/browser/classes/FormData.js
var FormData_default;
var init_FormData = __esmMin((() => {
	FormData_default = typeof FormData !== "undefined" ? FormData : null;
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/platform/browser/classes/Blob.js
var Blob_default;
var init_Blob = __esmMin((() => {
	Blob_default = typeof Blob !== "undefined" ? Blob : null;
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/platform/browser/index.js
var browser_default;
var init_browser = __esmMin((() => {
	init_URLSearchParams();
	init_FormData();
	init_Blob();
	browser_default = {
		isBrowser: true,
		classes: {
			URLSearchParams: URLSearchParams_default,
			FormData: FormData_default,
			Blob: Blob_default
		},
		protocols: [
			"http",
			"https",
			"file",
			"blob",
			"url",
			"data"
		]
	};
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/platform/common/utils.js
var utils_exports = /* @__PURE__ */ __exportAll({
	hasBrowserEnv: () => hasBrowserEnv,
	hasStandardBrowserEnv: () => hasStandardBrowserEnv,
	hasStandardBrowserWebWorkerEnv: () => hasStandardBrowserWebWorkerEnv,
	navigator: () => _navigator$1,
	origin: () => origin
});
var hasBrowserEnv, _navigator$1, hasStandardBrowserEnv, hasStandardBrowserWebWorkerEnv, origin;
var init_utils = __esmMin((() => {
	hasBrowserEnv = typeof window !== "undefined" && typeof document !== "undefined";
	_navigator$1 = typeof navigator === "object" && navigator || void 0;
	hasStandardBrowserEnv = hasBrowserEnv && (!_navigator$1 || [
		"ReactNative",
		"NativeScript",
		"NS"
	].indexOf(_navigator$1.product) < 0);
	hasStandardBrowserWebWorkerEnv = (() => {
		return typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope && typeof self.importScripts === "function";
	})();
	origin = hasBrowserEnv && window.location.href || "http://localhost";
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/platform/index.js
var platform_default;
var init_platform = __esmMin((() => {
	init_browser();
	init_utils();
	platform_default = {
		...utils_exports,
		...browser_default
	};
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/helpers/toURLEncodedForm.js
function toURLEncodedForm(data, options) {
	return toFormData(data, new platform_default.classes.URLSearchParams(), {
		visitor: function(value, key, path, helpers) {
			if (platform_default.isNode && utils_default.isBuffer(value)) {
				this.append(key, value.toString("base64"));
				return false;
			}
			return helpers.defaultVisitor.apply(this, arguments);
		},
		...options
	});
}
var init_toURLEncodedForm = __esmMin((() => {
	init_utils$1();
	init_toFormData();
	init_platform();
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/helpers/formDataToJSON.js
function throwIfDepthExceeded(index) {
	if (index > MAX_DEPTH) throw new AxiosError("FormData field is too deeply nested (" + index + " levels). Max depth: " + MAX_DEPTH, AxiosError.ERR_FORM_DATA_DEPTH_EXCEEDED);
}
/**
* It takes a string like `foo[x][y][z]` and returns an array like `['foo', 'x', 'y', 'z']
*
* @param {string} name - The name of the property to get.
*
* @returns An array of strings.
*/
function parsePropPath(name) {
	const path = [];
	const pattern = /[^.[\]]+|\[([^.[\]]*)]/g;
	let match;
	while ((match = pattern.exec(name)) !== null) {
		throwIfDepthExceeded(path.length);
		path.push(match[0] === "[]" ? "" : match[1] || match[0]);
	}
	return path;
}
/**
* Convert an array to an object.
*
* @param {Array<any>} arr - The array to convert to an object.
*
* @returns An object with the same keys and values as the array.
*/
function arrayToObject(arr) {
	const obj = {};
	const keys = Object.keys(arr);
	let i;
	const len = keys.length;
	let key;
	for (i = 0; i < len; i++) {
		key = keys[i];
		obj[key] = arr[key];
	}
	return obj;
}
/**
* It takes a FormData object and returns a JavaScript object
*
* @param {string} formData The FormData object to convert to JSON.
*
* @returns {Object<string, any> | null} The converted object.
*/
function formDataToJSON(formData) {
	function buildPath(path, value, target, index) {
		throwIfDepthExceeded(index);
		let name = path[index++];
		if (name === "__proto__") return true;
		const isNumericKey = Number.isFinite(+name);
		const isLast = index >= path.length;
		name = !name && utils_default.isArray(target) ? target.length : name;
		if (isLast) {
			if (utils_default.hasOwnProp(target, name)) target[name] = utils_default.isArray(target[name]) ? target[name].concat(value) : [target[name], value];
			else target[name] = value;
			return !isNumericKey;
		}
		if (!utils_default.hasOwnProp(target, name) || !utils_default.isObject(target[name])) target[name] = [];
		if (buildPath(path, value, target[name], index) && utils_default.isArray(target[name])) target[name] = arrayToObject(target[name]);
		return !isNumericKey;
	}
	if (utils_default.isFormData(formData) && utils_default.isFunction(formData.entries)) {
		const obj = {};
		utils_default.forEachEntry(formData, (name, value) => {
			buildPath(parsePropPath(name), value, obj, 0);
		});
		return obj;
	}
	return null;
}
var MAX_DEPTH;
var init_formDataToJSON = __esmMin((() => {
	init_utils$1();
	init_AxiosError();
	init_toFormData();
	MAX_DEPTH = 100;
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/core/methodList.js
var methodList;
var init_methodList = __esmMin((() => {
	methodList = Object.freeze([
		"get",
		"delete",
		"head",
		"options",
		"post",
		"put",
		"patch",
		"purge",
		"link",
		"unlink",
		"query"
	]);
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/defaults/index.js
/**
* It takes a string, tries to parse it, and if it fails, it returns the stringified version
* of the input
*
* @param {any} rawValue - The value to be stringified.
* @param {Function} parser - A function that parses a string into a JavaScript object.
* @param {Function} encoder - A function that takes a value and returns a string.
*
* @returns {string} A stringified version of the rawValue.
*/
function stringifySafely(rawValue, parser, encoder) {
	if (utils_default.isString(rawValue)) try {
		(parser || JSON.parse)(rawValue);
		return utils_default.trim(rawValue);
	} catch (e) {
		if (e.name !== "SyntaxError") throw e;
	}
	return (encoder || JSON.stringify)(rawValue);
}
var own, defaults;
var init_defaults = __esmMin((() => {
	init_utils$1();
	init_AxiosError();
	init_transitional();
	init_toFormData();
	init_toURLEncodedForm();
	init_platform();
	init_formDataToJSON();
	init_methodList();
	own = (obj, key) => obj != null && utils_default.hasOwnProp(obj, key) ? obj[key] : void 0;
	defaults = {
		transitional: transitional_default,
		adapter: [
			"xhr",
			"http",
			"fetch"
		],
		transformRequest: [function transformRequest(data, headers) {
			const contentType = headers.getContentType() || "";
			const hasJSONContentType = contentType.indexOf("application/json") > -1;
			const isObjectPayload = utils_default.isObject(data);
			if (isObjectPayload && utils_default.isHTMLForm(data)) data = new FormData(data);
			if (utils_default.isFormData(data)) return hasJSONContentType ? JSON.stringify(formDataToJSON(data)) : data;
			if (utils_default.isArrayBuffer(data) || utils_default.isBuffer(data) || utils_default.isStream(data) || utils_default.isFile(data) || utils_default.isBlob(data) || utils_default.isReadableStream(data)) return data;
			if (utils_default.isArrayBufferView(data)) return data.buffer;
			if (utils_default.isURLSearchParams(data)) {
				headers.setContentType("application/x-www-form-urlencoded;charset=utf-8", false);
				return data.toString();
			}
			let isFileList;
			if (isObjectPayload) {
				const formSerializer = own(this, "formSerializer");
				if (contentType.indexOf("application/x-www-form-urlencoded") > -1) return toURLEncodedForm(data, formSerializer).toString();
				if ((isFileList = utils_default.isFileList(data)) || contentType.indexOf("multipart/form-data") > -1) {
					const env = own(this, "env");
					const _FormData = env && env.FormData;
					return toFormData(isFileList ? { "files[]": data } : data, _FormData && new _FormData(), formSerializer);
				}
			}
			if (isObjectPayload || hasJSONContentType) {
				headers.setContentType("application/json", false);
				return stringifySafely(data);
			}
			return data;
		}],
		transformResponse: [function transformResponse(data) {
			const transitional = own(this, "transitional") || defaults.transitional;
			const forcedJSONParsing = transitional && transitional.forcedJSONParsing;
			const responseType = own(this, "responseType");
			const JSONRequested = responseType === "json";
			if (utils_default.isResponse(data) || utils_default.isReadableStream(data)) return data;
			if (data && utils_default.isString(data) && (forcedJSONParsing && !responseType || JSONRequested)) {
				const strictJSONParsing = !(transitional && transitional.silentJSONParsing) && JSONRequested;
				try {
					return JSON.parse(data, own(this, "parseReviver"));
				} catch (e) {
					if (strictJSONParsing) {
						if (e.name === "SyntaxError") throw AxiosError.from(e, AxiosError.ERR_BAD_RESPONSE, this, null, own(this, "response"));
						throw e;
					}
				}
			}
			return data;
		}],
		/**
		* A timeout in milliseconds to abort a request. If set to 0 (default) a
		* timeout is not created.
		*/
		timeout: 0,
		xsrfCookieName: "XSRF-TOKEN",
		xsrfHeaderName: "X-XSRF-TOKEN",
		maxContentLength: -1,
		maxBodyLength: -1,
		env: {
			FormData: platform_default.classes.FormData,
			Blob: platform_default.classes.Blob
		},
		validateStatus: function validateStatus(status) {
			return status >= 200 && status < 300;
		},
		headers: { common: {
			Accept: "application/json, text/plain, */*",
			"Content-Type": void 0
		} }
	};
	utils_default.forEach(methodList, (method) => {
		defaults.headers[method] = {};
	});
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/core/transformData.js
/**
* Transform the data for a request or a response
*
* @param {Array|Function} fns A single function or Array of functions
* @param {?Object} response The response object
*
* @returns {*} The resulting transformed data
*/
function transformData(fns, response) {
	const config = this || defaults;
	const context = response || config;
	const headers = AxiosHeaders.from(context.headers);
	let data = context.data;
	utils_default.forEach(fns, function transform(fn) {
		data = fn.call(config, data, headers.normalize(), response ? response.status : void 0);
	});
	headers.normalize();
	return data;
}
var init_transformData = __esmMin((() => {
	init_utils$1();
	init_defaults();
	init_AxiosHeaders();
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/cancel/isCancel.js
function isCancel(value) {
	return !!(value && value.__CANCEL__);
}
var init_isCancel = __esmMin((() => {}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/cancel/CanceledError.js
var CanceledError;
var init_CanceledError = __esmMin((() => {
	init_AxiosError();
	CanceledError = class extends AxiosError {
		/**
		* A `CanceledError` is an object that is thrown when an operation is canceled.
		*
		* @param {string=} message The message.
		* @param {Object=} config The config.
		* @param {Object=} request The request.
		*
		* @returns {CanceledError} The created error.
		*/
		constructor(message, config, request) {
			super(message == null ? "canceled" : message, AxiosError.ERR_CANCELED, config, request);
			this.name = "CanceledError";
			this.__CANCEL__ = true;
		}
	};
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/core/settle.js
/**
* Resolve or reject a Promise based on response status.
*
* @param {Function} resolve A function that resolves the promise.
* @param {Function} reject A function that rejects the promise.
* @param {object} response The response.
*
* @returns {object} The response.
*/
function settle(resolve, reject, response) {
	const validateStatus = response.config.validateStatus;
	if (!response.status || !validateStatus || validateStatus(response.status)) resolve(response);
	else reject(new AxiosError("Request failed with status code " + response.status, response.status >= 400 && response.status < 500 ? AxiosError.ERR_BAD_REQUEST : AxiosError.ERR_BAD_RESPONSE, response.config, response.request, response));
}
var init_settle = __esmMin((() => {
	init_AxiosError();
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/helpers/normalizeURLForProtocolCheck.js
/**
* Match WHATWG URL preprocessing before checking a URL's protocol.
*
* @param {string} url
*
* @returns {string}
*/
function normalizeURLForProtocolCheck(url) {
	if (typeof url !== "string") return url;
	let start = 0;
	while (start < url.length && url.charCodeAt(start) <= 32) start++;
	return url.slice(start).replace(urlParserControlCharacters, "");
}
var urlParserControlCharacters;
var init_normalizeURLForProtocolCheck = __esmMin((() => {
	urlParserControlCharacters = /[\t\n\r]/g;
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/helpers/parseProtocol.js
function parseProtocol(url) {
	const match = /^([-+\w]{1,25}):(?:\/\/)?/.exec(url);
	return match && match[1] || "";
}
var init_parseProtocol = __esmMin((() => {}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/helpers/speedometer.js
/**
* Calculate data maxRate
* @param {Number} [samplesCount= 10]
* @param {Number} [min= 1000]
* @returns {Function}
*/
function speedometer(samplesCount, min) {
	samplesCount = samplesCount || 10;
	const bytes = new Array(samplesCount);
	const timestamps = new Array(samplesCount);
	let head = 0;
	let tail = 0;
	let firstSampleTS;
	min = min !== void 0 ? min : 1e3;
	return function push(chunkLength) {
		const now = Date.now();
		const startedAt = timestamps[tail];
		if (!firstSampleTS) firstSampleTS = now;
		bytes[head] = chunkLength;
		timestamps[head] = now;
		let i = tail;
		let bytesCount = 0;
		while (i !== head) {
			bytesCount += bytes[i++];
			i = i % samplesCount;
		}
		head = (head + 1) % samplesCount;
		if (head === tail) tail = (tail + 1) % samplesCount;
		if (now - firstSampleTS < min) return;
		const passed = startedAt && now - startedAt;
		return passed ? Math.round(bytesCount * 1e3 / passed) : void 0;
	};
}
var init_speedometer = __esmMin((() => {}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/helpers/throttle.js
/**
* Throttle decorator
* @param {Function} fn
* @param {Number} freq
* @return {Array<Function>}
*/
function throttle(fn, freq) {
	let timestamp = 0;
	let threshold = 1e3 / freq;
	let lastArgs;
	let timer;
	const invoke = (args, now = Date.now()) => {
		timestamp = now;
		lastArgs = null;
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		fn(...args);
	};
	const throttled = (...args) => {
		const now = Date.now();
		const passed = now - timestamp;
		if (passed >= threshold) invoke(args, now);
		else {
			lastArgs = args;
			if (!timer) timer = setTimeout(() => {
				timer = null;
				invoke(lastArgs);
			}, threshold - passed);
		}
	};
	const flush = () => lastArgs && invoke(lastArgs);
	const flushWith = (...args) => invoke(args);
	return [
		throttled,
		flush,
		flushWith
	];
}
var init_throttle = __esmMin((() => {}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/helpers/progressEventReducer.js
var progressEventReducer, progressEventDecorator, asyncDecorator;
var init_progressEventReducer = __esmMin((() => {
	init_speedometer();
	init_throttle();
	init_utils$1();
	progressEventReducer = (listener, isDownloadStream, freq = 3) => {
		let bytesNotified = 0;
		const _speedometer = speedometer(50, 250);
		return throttle((e) => {
			if (!e || !utils_default.isNumber(e.loaded)) return;
			const rawLoaded = e.loaded;
			const total = e.lengthComputable ? e.total : void 0;
			const loaded = Math.max(0, total != null ? Math.min(rawLoaded, total) : rawLoaded);
			const progressBytes = Math.max(0, loaded - bytesNotified);
			const rate = _speedometer(progressBytes);
			bytesNotified = Math.max(bytesNotified, loaded);
			listener({
				loaded,
				total,
				progress: total ? loaded / total : void 0,
				bytes: progressBytes,
				rate: rate ? rate : void 0,
				estimated: rate && total ? (total - loaded) / rate : void 0,
				event: e,
				lengthComputable: total != null,
				[isDownloadStream ? "download" : "upload"]: true
			});
		}, freq);
	};
	progressEventDecorator = (total, throttled) => {
		const lengthComputable = total != null;
		return [(loaded) => throttled[0]({
			lengthComputable,
			total,
			loaded
		}), throttled[1]];
	};
	asyncDecorator = (fn, scheduler = utils_default.asap) => (...args) => scheduler(() => fn(...args));
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/helpers/isURLSameOrigin.js
var isURLSameOrigin_default;
var init_isURLSameOrigin = __esmMin((() => {
	init_platform();
	isURLSameOrigin_default = platform_default.hasStandardBrowserEnv ? ((origin, isMSIE) => (url) => {
		url = new URL(url, platform_default.origin);
		return origin.protocol === url.protocol && origin.host === url.host && (isMSIE || origin.port === url.port);
	})(new URL(platform_default.origin), platform_default.navigator && /(msie|trident)/i.test(platform_default.navigator.userAgent)) : () => true;
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/helpers/cookies.js
var cookies_default;
var init_cookies = __esmMin((() => {
	init_utils$1();
	init_platform();
	cookies_default = platform_default.hasStandardBrowserEnv ? {
		write(name, value, expires, path, domain, secure, sameSite) {
			if (typeof document === "undefined") return;
			const cookie = [`${name}=${encodeURIComponent(value)}`];
			if (utils_default.isNumber(expires)) cookie.push(`expires=${new Date(expires).toUTCString()}`);
			if (utils_default.isString(path)) cookie.push(`path=${path}`);
			if (utils_default.isString(domain)) cookie.push(`domain=${domain}`);
			if (secure === true) cookie.push("secure");
			if (utils_default.isString(sameSite)) cookie.push(`SameSite=${sameSite}`);
			document.cookie = cookie.join("; ");
		},
		read(name) {
			if (typeof document === "undefined") return null;
			const cookies = document.cookie.split(";");
			for (let i = 0; i < cookies.length; i++) {
				const cookie = cookies[i].replace(/^\s+/, "");
				const eq = cookie.indexOf("=");
				if (eq !== -1 && cookie.slice(0, eq) === name) try {
					return decodeURIComponent(cookie.slice(eq + 1));
				} catch (e) {
					return cookie.slice(eq + 1);
				}
			}
			return null;
		},
		remove(name) {
			this.write(name, "", Date.now() - 864e5, "/");
		}
	} : {
		write() {},
		read() {
			return null;
		},
		remove() {}
	};
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/helpers/isAbsoluteURL.js
/**
* Determines whether the specified URL is absolute
*
* @param {string} url The URL to test
*
* @returns {boolean} True if the specified URL is absolute, otherwise false
*/
function isAbsoluteURL(url) {
	if (typeof url !== "string") return false;
	return /^([a-z][a-z\d+\-.]*:)?\/\//i.test(url);
}
var init_isAbsoluteURL = __esmMin((() => {}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/helpers/combineURLs.js
/**
* Creates a new URL by combining the specified URLs
*
* @param {string} baseURL The base URL
* @param {string} relativeURL The relative URL
*
* @returns {string} The combined URL
*/
function combineURLs(baseURL, relativeURL) {
	if (!relativeURL) return baseURL;
	let end = baseURL.length;
	while (end > 0 && baseURL.charCodeAt(end - 1) === 47) end--;
	return baseURL.slice(0, end) + "/" + relativeURL.replace(/^\/+/, "");
}
var init_combineURLs = __esmMin((() => {}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/core/buildFullPath.js
function redactFragment(fragment) {
	if (!fragment) return fragment;
	return fragment.replace(/(^|&)([^=&]*=)?[^&]+/g, (match, separator, parameterName = "") => {
		return `${separator}${parameterName}${REDACTED}`;
	});
}
function redactSensitiveURLParts(url) {
	const redactedURL = url.replace(/^(https?:\/{0,2})[^/?#]*@/i, `$1${REDACTED}@`);
	const fragmentIndex = redactedURL.indexOf("#");
	const redactedURLWithoutFragment = (fragmentIndex === -1 ? redactedURL : redactedURL.slice(0, fragmentIndex)).replace(/([?&][^=&#]*=)[^&#]*/g, `$1${REDACTED}`);
	if (fragmentIndex === -1) return redactedURLWithoutFragment;
	return `${redactedURLWithoutFragment}#${redactFragment(redactedURL.slice(fragmentIndex + 1))}`;
}
function assertValidHttpProtocolURL(url, config) {
	if (typeof url === "string") {
		const normalizedURL = normalizeURLForProtocolCheck(url);
		if (malformedHttpProtocol.test(normalizedURL)) throw new AxiosError(`Invalid URL ${JSON.stringify(redactSensitiveURLParts(normalizedURL))}: missing "//" after protocol`, AxiosError.ERR_INVALID_URL, config);
	}
}
/**
* Creates a new URL by combining the baseURL with the requestedURL,
* only when the requestedURL is not already an absolute URL.
* If the requestURL is absolute, this function returns the requestedURL untouched.
*
* @param {string} baseURL The base URL
* @param {string} requestedURL Absolute or relative URL to combine
*
* @returns {string} The combined full path
*/
function buildFullPath(baseURL, requestedURL, allowAbsoluteUrls, config) {
	assertValidHttpProtocolURL(requestedURL, config);
	let isRelativeUrl = !isAbsoluteURL(requestedURL);
	if (baseURL && (isRelativeUrl || allowAbsoluteUrls === false)) {
		assertValidHttpProtocolURL(baseURL, config);
		return combineURLs(baseURL, requestedURL);
	}
	return requestedURL;
}
var malformedHttpProtocol;
var init_buildFullPath = __esmMin((() => {
	init_AxiosError();
	init_isAbsoluteURL();
	init_combineURLs();
	init_normalizeURLForProtocolCheck();
	malformedHttpProtocol = /^https?:(?!\/\/)/i;
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/core/mergeConfig.js
/**
* Config-specific merge-function which creates a new config-object
* by merging two configuration objects together.
*
* @param {Object} config1
* @param {Object} config2
*
* @returns {Object} New object resulting from merging config2 to config1
*/
function mergeConfig(config1, config2) {
	config1 = config1 || {};
	config2 = config2 || {};
	const config = Object.create(null);
	Object.defineProperty(config, "hasOwnProperty", {
		__proto__: null,
		value: Object.prototype.hasOwnProperty,
		enumerable: false,
		writable: true,
		configurable: true
	});
	function getMergedValue(target, source, prop, caseless) {
		if (utils_default.isPlainObject(target) && utils_default.isPlainObject(source)) return utils_default.merge.call({ caseless }, target, source);
		else if (utils_default.isPlainObject(source)) return utils_default.merge({}, source);
		else if (utils_default.isArray(source)) return source.slice();
		return source;
	}
	function mergeDeepProperties(a, b, prop, caseless) {
		if (!utils_default.isUndefined(b)) return getMergedValue(a, b, prop, caseless);
		else if (!utils_default.isUndefined(a)) return getMergedValue(void 0, a, prop, caseless);
	}
	function valueFromConfig2(a, b) {
		if (!utils_default.isUndefined(b)) return getMergedValue(void 0, b);
	}
	function defaultToConfig2(a, b) {
		if (!utils_default.isUndefined(b)) return getMergedValue(void 0, b);
		else if (!utils_default.isUndefined(a)) return getMergedValue(void 0, a);
	}
	function getMergedTransitionalOption(prop) {
		const transitional2 = utils_default.hasOwnProp(config2, "transitional") ? config2.transitional : void 0;
		if (!utils_default.isUndefined(transitional2)) {
			if (utils_default.isPlainObject(transitional2)) {
				if (utils_default.hasOwnProp(transitional2, prop)) return transitional2[prop];
			} else return;
		}
		const transitional1 = utils_default.hasOwnProp(config1, "transitional") ? config1.transitional : void 0;
		if (utils_default.isPlainObject(transitional1) && utils_default.hasOwnProp(transitional1, prop)) return transitional1[prop];
	}
	function mergeDirectKeys(a, b, prop) {
		if (utils_default.hasOwnProp(config2, prop)) return getMergedValue(a, b);
		else if (utils_default.hasOwnProp(config1, prop)) return getMergedValue(void 0, a);
	}
	const mergeMap = {
		url: valueFromConfig2,
		method: valueFromConfig2,
		data: valueFromConfig2,
		baseURL: defaultToConfig2,
		transformRequest: defaultToConfig2,
		transformResponse: defaultToConfig2,
		paramsSerializer: defaultToConfig2,
		timeout: defaultToConfig2,
		timeoutErrorMessage: defaultToConfig2,
		withCredentials: defaultToConfig2,
		withXSRFToken: defaultToConfig2,
		adapter: defaultToConfig2,
		responseType: defaultToConfig2,
		xsrfCookieName: defaultToConfig2,
		xsrfHeaderName: defaultToConfig2,
		onUploadProgress: defaultToConfig2,
		onDownloadProgress: defaultToConfig2,
		decompress: defaultToConfig2,
		maxContentLength: defaultToConfig2,
		maxBodyLength: defaultToConfig2,
		beforeRedirect: defaultToConfig2,
		transport: defaultToConfig2,
		httpAgent: defaultToConfig2,
		httpsAgent: defaultToConfig2,
		cancelToken: defaultToConfig2,
		socketPath: defaultToConfig2,
		allowedSocketPaths: defaultToConfig2,
		responseEncoding: defaultToConfig2,
		validateStatus: mergeDirectKeys,
		headers: (a, b, prop) => mergeDeepProperties(headersToObject(a), headersToObject(b), prop, true)
	};
	utils_default.forEach(ownEnumerableKeys({
		...config1,
		...config2
	}), function computeConfigValue(prop) {
		if (prop === "__proto__" || prop === "constructor" || prop === "prototype") return;
		const merge = utils_default.hasOwnProp(mergeMap, prop) ? mergeMap[prop] : mergeDeepProperties;
		const configValue = merge(utils_default.hasOwnProp(config1, prop) ? config1[prop] : void 0, utils_default.hasOwnProp(config2, prop) ? config2[prop] : void 0, prop);
		utils_default.isUndefined(configValue) && merge !== mergeDirectKeys || (config[prop] = configValue);
	});
	if (utils_default.hasOwnProp(config2, "validateStatus") && utils_default.isUndefined(config2.validateStatus) && getMergedTransitionalOption("validateStatusUndefinedResolves") === false) {
		if (utils_default.hasOwnProp(config1, "validateStatus")) config.validateStatus = getMergedValue(void 0, config1.validateStatus);
		else delete config.validateStatus;
	}
	return config;
}
var headersToObject, ownEnumerableKeys;
var init_mergeConfig = __esmMin((() => {
	init_utils$1();
	init_AxiosHeaders();
	headersToObject = (thing) => thing instanceof AxiosHeaders ? { ...thing } : thing;
	ownEnumerableKeys = (thing) => {
		if (Object.getOwnPropertySymbols && Object.getOwnPropertyDescriptor) return Object.keys(thing).concat(Object.getOwnPropertySymbols(thing).filter((symbol) => Object.getOwnPropertyDescriptor(thing, symbol).enumerable));
		return Object.keys(thing);
	};
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/core/setFormDataHeaders.js
/**
* Apply the headers generated by a FormData implementation to the request headers,
* honoring the `formDataHeaderPolicy` option: with 'content-only', copy only the
* content-* headers; otherwise merge all of them.
*
* @param {AxiosHeaders} headers - the request headers to mutate
* @param {Object | null | undefined} formHeaders - headers produced by the FormData implementation
* @param {String} [policy] - the resolved `formDataHeaderPolicy` config value
*
* @returns {void}
*/
function setFormDataHeaders(headers, formHeaders, policy) {
	if (policy !== "content-only") {
		headers.set(formHeaders);
		return;
	}
	Object.entries(formHeaders || {}).forEach(([key, val]) => {
		if (FORM_DATA_CONTENT_HEADERS.includes(key.toLowerCase())) headers.set(key, val);
	});
}
var FORM_DATA_CONTENT_HEADERS;
var init_setFormDataHeaders = __esmMin((() => {
	FORM_DATA_CONTENT_HEADERS = ["content-type", "content-length"];
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/helpers/resolveConfig.js
function resolveConfig(config) {
	const newConfig = mergeConfig({}, config);
	const own = (key) => utils_default.hasOwnProp(newConfig, key) ? newConfig[key] : void 0;
	const data = own("data");
	let withXSRFToken = own("withXSRFToken");
	const xsrfHeaderName = own("xsrfHeaderName");
	const xsrfCookieName = own("xsrfCookieName");
	let headers = own("headers");
	const auth = own("auth");
	const baseURL = own("baseURL");
	const allowAbsoluteUrls = own("allowAbsoluteUrls");
	const url = own("url");
	newConfig.headers = headers = AxiosHeaders.from(headers);
	newConfig.url = buildURL(buildFullPath(baseURL, url, allowAbsoluteUrls, newConfig), own("params"), own("paramsSerializer"));
	if (auth) {
		const username = utils_default.getSafeProp(auth, "username") || "";
		const password = utils_default.getSafeProp(auth, "password") || "";
		try {
			headers.set("Authorization", "Basic " + btoa(username + ":" + (password ? encodeUTF8$1(password) : "")));
		} catch (e) {
			throw AxiosError.from(e, AxiosError.ERR_BAD_OPTION_VALUE, config);
		}
	}
	if (utils_default.isFormData(data)) {
		const getHeaders = utils_default.getSafeProp(data, "getHeaders");
		if (platform_default.hasStandardBrowserEnv || platform_default.hasStandardBrowserWebWorkerEnv || utils_default.isReactNative(data)) headers.setContentType(void 0);
		else if (utils_default.isFunction(getHeaders)) setFormDataHeaders(headers, getHeaders.call(data), own("formDataHeaderPolicy"));
	}
	if (platform_default.hasStandardBrowserEnv) {
		if (utils_default.isFunction(withXSRFToken)) withXSRFToken = withXSRFToken(newConfig);
		if (withXSRFToken === true || withXSRFToken == null && isURLSameOrigin_default(newConfig.url)) {
			const xsrfValue = xsrfHeaderName && xsrfCookieName && cookies_default.read(xsrfCookieName);
			if (xsrfValue) headers.set(xsrfHeaderName, xsrfValue);
		}
	}
	return newConfig;
}
var encodeUTF8$1;
var init_resolveConfig = __esmMin((() => {
	init_platform();
	init_utils$1();
	init_AxiosError();
	init_isURLSameOrigin();
	init_cookies();
	init_buildFullPath();
	init_mergeConfig();
	init_AxiosHeaders();
	init_setFormDataHeaders();
	init_buildURL();
	encodeUTF8$1 = (str) => encodeURIComponent(str).replace(/%([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/adapters/xhr.js
var isXHRAdapterSupported, xhr_default;
var init_xhr = __esmMin((() => {
	init_utils$1();
	init_settle();
	init_transitional();
	init_AxiosError();
	init_CanceledError();
	init_normalizeURLForProtocolCheck();
	init_parseProtocol();
	init_platform();
	init_AxiosHeaders();
	init_progressEventReducer();
	init_resolveConfig();
	init_sanitizeHeaderValue();
	isXHRAdapterSupported = typeof XMLHttpRequest !== "undefined";
	xhr_default = isXHRAdapterSupported && function(config) {
		return new Promise(function dispatchXhrRequest(resolve, reject) {
			const _config = resolveConfig(config);
			let requestData = _config.data;
			const requestHeaders = AxiosHeaders.from(_config.headers).normalize();
			let { responseType, onUploadProgress, onDownloadProgress } = _config;
			let onCanceled;
			let uploadThrottled, downloadThrottled;
			let flushUpload, flushDownload, flushDownloadWithEvent;
			function done() {
				flushUpload && flushUpload();
				flushDownload && flushDownload();
				_config.cancelToken && _config.cancelToken.unsubscribe(onCanceled);
				_config.signal && _config.signal.removeEventListener("abort", onCanceled);
			}
			let request = new XMLHttpRequest();
			request.open(_config.method.toUpperCase(), _config.url, true);
			request.timeout = _config.timeout;
			function onloadend(event) {
				if (!request) return;
				if (request.status === 0 && (parseProtocol(normalizeURLForProtocolCheck(_config.url)) || parseProtocol(platform_default.origin)) !== "file" && !(request.responseURL && request.responseURL.startsWith("file:"))) {
					reject(new AxiosError("Request aborted", AxiosError.ECONNABORTED, config, request));
					done();
					request = null;
					return;
				}
				try {
					if (event) flushDownloadWithEvent && flushDownloadWithEvent(event);
					else flushDownload && flushDownload();
				} catch (err) {
					setTimeout(() => {
						throw err;
					});
				}
				if (!request) return;
				const responseHeaders = AxiosHeaders.from("getAllResponseHeaders" in request && request.getAllResponseHeaders());
				settle(function _resolve(value) {
					resolve(value);
					done();
				}, function _reject(err) {
					reject(err);
					done();
				}, {
					data: !responseType || responseType === "text" || responseType === "json" ? request.responseText : request.response,
					status: request.status,
					statusText: request.statusText,
					headers: responseHeaders,
					config,
					request
				});
				request = null;
			}
			if ("onloadend" in request) request.onloadend = onloadend;
			else request.onreadystatechange = function handleLoad() {
				if (!request || request.readyState !== 4) return;
				if (request.status === 0 && !(request.responseURL && request.responseURL.startsWith("file:"))) return;
				setTimeout(onloadend);
			};
			request.onabort = function handleAbort() {
				if (!request) return;
				reject(new AxiosError("Request aborted", AxiosError.ECONNABORTED, config, request));
				done();
				request = null;
			};
			request.onerror = function handleError(event) {
				const msg = event && event.message ? event.message : "Network Error";
				const err = new AxiosError(msg, AxiosError.ERR_NETWORK, config, request);
				err.event = event || null;
				reject(err);
				done();
				request = null;
			};
			request.ontimeout = function handleTimeout() {
				let timeoutErrorMessage = _config.timeout ? "timeout of " + _config.timeout + "ms exceeded" : "timeout exceeded";
				const transitional = _config.transitional || transitional_default;
				if (_config.timeoutErrorMessage) timeoutErrorMessage = _config.timeoutErrorMessage;
				reject(new AxiosError(timeoutErrorMessage, transitional.clarifyTimeoutError ? AxiosError.ETIMEDOUT : AxiosError.ECONNABORTED, config, request));
				done();
				request = null;
			};
			requestData === void 0 && requestHeaders.setContentType(null);
			if ("setRequestHeader" in request) utils_default.forEach(toByteStringHeaderObject(requestHeaders), function setRequestHeader(val, key) {
				request.setRequestHeader(key, val);
			});
			if (!utils_default.isUndefined(_config.withCredentials)) request.withCredentials = !!_config.withCredentials;
			if (responseType && responseType !== "json") request.responseType = _config.responseType;
			if (onDownloadProgress) {
				[downloadThrottled, flushDownload, flushDownloadWithEvent] = progressEventReducer(onDownloadProgress, true);
				request.addEventListener("progress", downloadThrottled);
			}
			if (onUploadProgress && request.upload) {
				[uploadThrottled, flushUpload] = progressEventReducer(onUploadProgress);
				request.upload.addEventListener("progress", uploadThrottled);
				request.upload.addEventListener("loadend", flushUpload);
			}
			if (_config.cancelToken || _config.signal) {
				onCanceled = (cancel) => {
					if (!request) return;
					reject(!cancel || cancel.type ? new CanceledError(null, config, request) : cancel);
					request.abort();
					done();
					request = null;
				};
				_config.cancelToken && _config.cancelToken.subscribe(onCanceled);
				if (_config.signal) _config.signal.aborted ? onCanceled() : _config.signal.addEventListener("abort", onCanceled);
			}
			const protocol = parseProtocol(_config.url);
			if (protocol && !platform_default.protocols.includes(protocol)) {
				reject(new AxiosError("Unsupported protocol " + protocol + ":", AxiosError.ERR_BAD_REQUEST, config));
				done();
				return;
			}
			request.send(requestData || null);
		});
	};
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/helpers/composeSignals.js
var composeSignals;
var init_composeSignals = __esmMin((() => {
	init_CanceledError();
	init_AxiosError();
	init_utils$1();
	composeSignals = (signals, timeout) => {
		signals = signals ? signals.filter(Boolean) : [];
		if (!timeout && !signals.length) return;
		const controller = new AbortController();
		let aborted = false;
		const onabort = function(reason) {
			if (!aborted) {
				aborted = true;
				unsubscribe();
				const err = reason instanceof Error ? reason : this.reason;
				controller.abort(err instanceof AxiosError ? err : new CanceledError(err instanceof Error ? err.message : err));
			}
		};
		let timer = timeout && setTimeout(() => {
			timer = null;
			onabort(new AxiosError(`timeout of ${timeout}ms exceeded`, AxiosError.ETIMEDOUT));
		}, timeout);
		const unsubscribe = () => {
			if (!signals) return;
			timer && clearTimeout(timer);
			timer = null;
			signals.forEach((signal) => {
				signal.unsubscribe ? signal.unsubscribe(onabort) : signal.removeEventListener("abort", onabort);
			});
			signals = null;
		};
		signals.forEach((signal) => {
			if (aborted) return;
			if (signal.aborted) {
				onabort.call(signal);
				return;
			}
			signal.addEventListener("abort", onabort, { once: true });
		});
		const { signal } = controller;
		signal.unsubscribe = () => utils_default.asap(unsubscribe);
		return signal;
	};
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/helpers/trackStream.js
var streamChunk, readBytes, readStream, trackStream;
var init_trackStream = __esmMin((() => {
	streamChunk = function* (chunk, chunkSize) {
		let len = chunk.byteLength;
		if (!chunkSize || len < chunkSize) {
			yield chunk;
			return;
		}
		let pos = 0;
		let end;
		while (pos < len) {
			end = pos + chunkSize;
			yield chunk.slice(pos, end);
			pos = end;
		}
	};
	readBytes = async function* (iterable, chunkSize) {
		for await (const chunk of readStream(iterable)) yield* streamChunk(chunk, chunkSize);
	};
	readStream = async function* (stream) {
		if (stream[Symbol.asyncIterator]) {
			yield* stream;
			return;
		}
		const reader = stream.getReader();
		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				yield value;
			}
		} finally {
			await reader.cancel();
		}
	};
	trackStream = (stream, chunkSize, onProgress, onFinish) => {
		const iterator = readBytes(stream, chunkSize);
		let bytes = 0;
		let done;
		let _onFinish = (e) => {
			if (!done) {
				done = true;
				onFinish && onFinish(e);
			}
		};
		return new ReadableStream({
			async pull(controller) {
				try {
					const { done, value } = await iterator.next();
					if (done) {
						_onFinish();
						controller.close();
						return;
					}
					let len = value.byteLength;
					if (onProgress) onProgress(bytes += len);
					controller.enqueue(new Uint8Array(value));
				} catch (err) {
					_onFinish(err);
					throw err;
				}
			},
			cancel(reason) {
				_onFinish(reason);
				return iterator.return();
			}
		}, { highWaterMark: 2 });
	};
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/helpers/estimateDataURLDecodedBytes.js
/**
* Estimate the percent-decoded payload size used by Fetch data: URLs.
*
* @param {string} url
* @returns {number}
*/
function estimateDataURLDecodedBytes(url) {
	const fragmentIndex = typeof url === "string" ? url.indexOf("#") : -1;
	return estimateDataURLBytes(fragmentIndex === -1 ? url : url.slice(0, fragmentIndex), estimatePercentDecodedBase64Bytes);
}
var isHexDigit, isPercentEncodedByte, hexValue, isBase64Char, isBase64Whitespace, base64Bytes, estimateBase64BufferAllocation, estimatePercentDecodedBase64Bytes, estimateDataURLBytes;
var init_estimateDataURLDecodedBytes = __esmMin((() => {
	isHexDigit = (charCode) => charCode >= 48 && charCode <= 57 || charCode >= 65 && charCode <= 70 || charCode >= 97 && charCode <= 102;
	isPercentEncodedByte = (str, i, len) => i + 2 < len && isHexDigit(str.charCodeAt(i + 1)) && isHexDigit(str.charCodeAt(i + 2));
	hexValue = (charCode) => charCode <= 57 ? charCode - 48 : (charCode & 223) - 55;
	isBase64Char = (charCode) => charCode >= 65 && charCode <= 90 || charCode >= 97 && charCode <= 122 || charCode >= 48 && charCode <= 57 || charCode === 43 || charCode === 47 || charCode === 45 || charCode === 95;
	isBase64Whitespace = (charCode) => charCode === 9 || charCode === 10 || charCode === 12 || charCode === 13 || charCode === 32;
	base64Bytes = (significant) => {
		const groups = Math.floor(significant / 4);
		const remainder = significant % 4;
		return groups * 3 + (remainder === 2 ? 1 : remainder === 3 ? 2 : 0);
	};
	estimateBase64BufferAllocation = (body) => {
		const len = body.length;
		let padding = 0;
		if (len > 0 && body.charCodeAt(len - 1) === 61) {
			padding++;
			if (len > 1 && body.charCodeAt(len - 2) === 61) padding++;
		}
		return Math.floor((len - padding) * 3 / 4);
	};
	estimatePercentDecodedBase64Bytes = (body) => {
		const len = body.length;
		let significant = 0;
		let padding = 0;
		let invalid = false;
		for (let i = 0; i < len; i++) {
			let code = body.charCodeAt(i);
			if (code === 37 && isPercentEncodedByte(body, i, len)) {
				code = hexValue(body.charCodeAt(i + 1)) * 16 + hexValue(body.charCodeAt(i + 2));
				i += 2;
			}
			if (isBase64Whitespace(code)) continue;
			if (code === 61) {
				padding++;
				continue;
			}
			if (!isBase64Char(code) || padding > 0) {
				invalid = true;
				continue;
			}
			significant++;
		}
		if (invalid || padding > 2 || padding > 0 && (significant + padding) % 4 !== 0 || significant % 4 === 1) return estimateBase64BufferAllocation(body);
		return base64Bytes(significant);
	};
	estimateDataURLBytes = (url, estimateBase64) => {
		if (!url || typeof url !== "string") return 0;
		if (!url.startsWith("data:")) return 0;
		const comma = url.indexOf(",");
		if (comma < 0) return 0;
		const meta = url.slice(5, comma);
		const body = url.slice(comma + 1);
		if (/;base64/i.test(meta)) return estimateBase64(body);
		let bytes = 0;
		for (let i = 0, len = body.length; i < len; i++) {
			const c = body.charCodeAt(i);
			if (c === 37 && isPercentEncodedByte(body, i, len)) {
				bytes += 1;
				i += 2;
			} else if (c < 128) bytes += 1;
			else if (c < 2048) bytes += 2;
			else if (c >= 55296 && c <= 56319 && i + 1 < len) {
				const next = body.charCodeAt(i + 1);
				if (next >= 56320 && next <= 57343) {
					bytes += 4;
					i++;
				} else bytes += 3;
			} else bytes += 3;
		}
		return bytes;
	};
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/env/data.js
var VERSION;
var init_data = __esmMin((() => {
	VERSION = "1.20.0";
})), DEFAULT_CHUNK_SIZE, DEFAULT_REQUEST_OPTIONS, isFunction, encodeUTF8, decodeURIComponentSafe, test, maybeWithAuthCredentials, factory, seedCache, getFetch;
var init_fetch = __esmMin((() => {
	init_platform();
	init_utils$1();
	init_AxiosError();
	init_composeSignals();
	init_trackStream();
	init_AxiosHeaders();
	init_progressEventReducer();
	init_resolveConfig();
	init_settle();
	init_estimateDataURLDecodedBytes();
	init_data();
	init_sanitizeHeaderValue();
	DEFAULT_CHUNK_SIZE = 65536;
	DEFAULT_REQUEST_OPTIONS = {
		cache: "default",
		redirect: "follow",
		referrer: "about:client",
		referrerPolicy: "",
		mode: "cors",
		integrity: "",
		keepalive: false,
		priority: "auto",
		window: null
	};
	({isFunction} = utils_default);
	encodeUTF8 = (str) => encodeURIComponent(str).replace(/%([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
	decodeURIComponentSafe = (value) => {
		if (!utils_default.isString(value)) return value;
		try {
			return decodeURIComponent(value);
		} catch (error) {
			return value;
		}
	};
	test = (fn, ...args) => {
		try {
			return !!fn(...args);
		} catch (e) {
			return false;
		}
	};
	maybeWithAuthCredentials = (url) => {
		const protocolIndex = url.indexOf("://");
		let urlToCheck = url;
		if (protocolIndex !== -1) urlToCheck = urlToCheck.slice(protocolIndex + 3);
		return urlToCheck.includes("@") || urlToCheck.includes(":");
	};
	factory = (env) => {
		const globalObject = utils_default.global !== void 0 && utils_default.global !== null ? utils_default.global : globalThis;
		const { ReadableStream, TextEncoder } = globalObject;
		env = utils_default.merge.call({ skipUndefined: true }, {
			Request: globalObject.Request,
			Response: globalObject.Response
		}, env);
		const { fetch: envFetch, Request, Response } = env;
		const isFetchSupported = envFetch ? isFunction(envFetch) : typeof fetch === "function";
		const isRequestSupported = isFunction(Request);
		const isResponseSupported = isFunction(Response);
		if (!isFetchSupported) return false;
		const isReadableStreamSupported = isFetchSupported && isFunction(ReadableStream);
		const encodeText = isFetchSupported && (typeof TextEncoder === "function" ? ((encoder) => (str) => encoder.encode(str))(new TextEncoder()) : async (str) => new Uint8Array(await new Request(str).arrayBuffer()));
		const supportsRequestStream = isRequestSupported && isReadableStreamSupported && test(() => {
			let duplexAccessed = false;
			const request = new Request(platform_default.origin, {
				body: new ReadableStream(),
				method: "POST",
				get duplex() {
					duplexAccessed = true;
					return "half";
				}
			});
			const hasContentType = request.headers.has("Content-Type");
			if (request.body != null) request.body.cancel();
			return duplexAccessed && !hasContentType;
		});
		const supportsResponseStream = isResponseSupported && isReadableStreamSupported && test(() => utils_default.isReadableStream(new Response("").body));
		const resolvers = { stream: supportsResponseStream && ((res) => res.body) };
		isFetchSupported && (() => {
			[
				"text",
				"arrayBuffer",
				"blob",
				"formData",
				"stream"
			].forEach((type) => {
				!resolvers[type] && (resolvers[type] = (res, config) => {
					let method = res && res[type];
					if (method) return method.call(res);
					throw new AxiosError(`Response type '${type}' is not supported`, AxiosError.ERR_NOT_SUPPORT, config);
				});
			});
		})();
		const getBodyLength = async (body) => {
			if (body == null) return 0;
			if (utils_default.isBlob(body)) return body.size;
			if (utils_default.isSpecCompliantForm(body)) return (await new Request(platform_default.origin, {
				method: "POST",
				body
			}).arrayBuffer()).byteLength;
			if (utils_default.isArrayBufferView(body) || utils_default.isArrayBuffer(body)) return body.byteLength;
			if (utils_default.isURLSearchParams(body)) body = body + "";
			if (utils_default.isString(body)) return (await encodeText(body)).byteLength;
		};
		const resolveBodyLength = async (headers, body) => {
			const length = utils_default.toFiniteNumber(headers.getContentLength());
			return length == null ? getBodyLength(body) : length;
		};
		return async (config) => {
			let { url, method, data, signal, cancelToken, timeout, onDownloadProgress, onUploadProgress, responseType, headers, withCredentials = "same-origin", fetchOptions, maxContentLength, maxBodyLength, maxRedirects } = resolveConfig(config);
			const hasMaxContentLength = utils_default.isNumber(maxContentLength) && maxContentLength > -1;
			const hasMaxBodyLength = utils_default.isNumber(maxBodyLength) && maxBodyLength > -1;
			const own = (key) => utils_default.hasOwnProp(config, key) ? config[key] : void 0;
			let _fetch = envFetch || fetch;
			responseType = responseType ? (responseType + "").toLowerCase() : "text";
			let composedSignal = composeSignals([signal, cancelToken && cancelToken.toAbortSignal()], timeout);
			let request = null;
			const unsubscribe = composedSignal && composedSignal.unsubscribe && (() => {
				composedSignal.unsubscribe();
			});
			let requestContentLength;
			let pendingBodyError = null;
			const maxBodyLengthError = () => new AxiosError("Request body larger than maxBodyLength limit", AxiosError.ERR_BAD_REQUEST, config, request);
			try {
				let auth = void 0;
				const configAuth = own("auth");
				if (configAuth) auth = {
					username: utils_default.getSafeProp(configAuth, "username") || "",
					password: utils_default.getSafeProp(configAuth, "password") || ""
				};
				if (maybeWithAuthCredentials(url)) {
					const parsedURL = new URL(url, platform_default.origin);
					if (!auth && (parsedURL.username || parsedURL.password)) auth = {
						username: decodeURIComponentSafe(parsedURL.username),
						password: decodeURIComponentSafe(parsedURL.password)
					};
					if (parsedURL.username || parsedURL.password) {
						parsedURL.username = "";
						parsedURL.password = "";
						url = parsedURL.href;
					}
				}
				if (auth) {
					headers.delete("authorization");
					headers.set("Authorization", "Basic " + btoa(encodeUTF8((auth.username || "") + ":" + (auth.password || ""))));
				}
				if (hasMaxContentLength && typeof url === "string" && url.startsWith("data:")) {
					if (estimateDataURLDecodedBytes(url) > maxContentLength) throw new AxiosError("maxContentLength size of " + maxContentLength + " exceeded", AxiosError.ERR_BAD_RESPONSE, config, request);
				}
				if (hasMaxBodyLength && method !== "get" && method !== "head") {
					const outboundLength = await getBodyLength(data);
					if (typeof outboundLength === "number" && isFinite(outboundLength)) {
						requestContentLength = outboundLength;
						if (outboundLength > maxBodyLength) throw maxBodyLengthError();
					}
				}
				const mustEnforceStreamBody = hasMaxBodyLength && (utils_default.isReadableStream(data) || utils_default.isStream(data));
				const trackRequestStream = (stream, onProgress, flush) => trackStream(stream, DEFAULT_CHUNK_SIZE, (loadedBytes) => {
					if (hasMaxBodyLength && loadedBytes > maxBodyLength) throw pendingBodyError = maxBodyLengthError();
					onProgress && onProgress(loadedBytes);
				}, flush);
				if (supportsRequestStream && method !== "get" && method !== "head" && (onUploadProgress || mustEnforceStreamBody)) {
					requestContentLength = requestContentLength == null ? await resolveBodyLength(headers, data) : requestContentLength;
					if (requestContentLength !== 0 || mustEnforceStreamBody) {
						let _request = new Request(url, {
							method: "POST",
							body: data,
							duplex: "half"
						});
						let contentTypeHeader;
						if (utils_default.isFormData(data) && (contentTypeHeader = _request.headers.get("content-type"))) headers.setContentType(contentTypeHeader);
						if (_request.body) {
							const [onProgress, flush] = onUploadProgress && progressEventDecorator(requestContentLength, progressEventReducer(asyncDecorator(onUploadProgress))) || [];
							data = trackRequestStream(_request.body, onProgress, flush);
						}
					}
				} else if (mustEnforceStreamBody && !isRequestSupported && isReadableStreamSupported && method !== "get" && method !== "head") data = trackRequestStream(data);
				else if (mustEnforceStreamBody && isRequestSupported && !supportsRequestStream && method !== "get" && method !== "head") throw new AxiosError("Stream request bodies are not supported by the current fetch implementation", AxiosError.ERR_NOT_SUPPORT, config, request);
				if (!utils_default.isString(withCredentials)) withCredentials = withCredentials ? "include" : "omit";
				const isCredentialsSupported = isRequestSupported && "credentials" in Request.prototype;
				if (utils_default.isFormData(data)) {
					const contentType = headers.getContentType();
					if (contentType && /^multipart\/form-data/i.test(contentType) && !/boundary=/i.test(contentType)) headers.delete("content-type");
				}
				headers.set("User-Agent", "axios/" + VERSION, false);
				const safeFetchOptions = fetchOptions == null ? fetchOptions : Object.assign(Object.create(null), fetchOptions);
				if (safeFetchOptions) {
					delete safeFetchOptions.body;
					delete safeFetchOptions.headers;
					delete safeFetchOptions.method;
					delete safeFetchOptions.signal;
					delete safeFetchOptions.duplex;
					delete safeFetchOptions.credentials;
				}
				const resolvedOptions = Object.assign(Object.create(null), safeFetchOptions, {
					signal: composedSignal,
					method: method.toUpperCase(),
					headers: toByteStringHeaderObject(headers.normalize()),
					body: data,
					duplex: "half",
					credentials: isCredentialsSupported ? withCredentials : void 0
				});
				if (isRequestSupported) {
					utils_default.forEach(DEFAULT_REQUEST_OPTIONS, (value, key) => {
						if (resolvedOptions[key] === void 0) resolvedOptions[key] = value;
					});
					if (resolvedOptions.signal === void 0) resolvedOptions.signal = null;
					if (resolvedOptions.body === void 0) resolvedOptions.body = null;
				}
				if (maxRedirects === 0) {
					resolvedOptions.redirect = "manual";
					if (safeFetchOptions) safeFetchOptions.redirect = "manual";
				}
				request = isRequestSupported && new Request(url, resolvedOptions);
				let response = await (isRequestSupported ? _fetch(request, safeFetchOptions) : _fetch(url, resolvedOptions));
				const responseHeaders = AxiosHeaders.from(response.headers);
				if (hasMaxContentLength) {
					const declaredLength = utils_default.toFiniteNumber(responseHeaders.getContentLength());
					if (declaredLength != null && declaredLength > maxContentLength) throw new AxiosError("maxContentLength size of " + maxContentLength + " exceeded", AxiosError.ERR_BAD_RESPONSE, config, request);
				}
				const isStreamResponse = supportsResponseStream && (responseType === "stream" || responseType === "response");
				if (supportsResponseStream && response.body && (onDownloadProgress || hasMaxContentLength || isStreamResponse && unsubscribe)) {
					const options = {};
					[
						"status",
						"statusText",
						"headers"
					].forEach((prop) => {
						options[prop] = response[prop];
					});
					const responseContentLength = utils_default.toFiniteNumber(responseHeaders.getContentLength());
					const [onProgress, flush] = onDownloadProgress && progressEventDecorator(responseContentLength, progressEventReducer(asyncDecorator(onDownloadProgress), true)) || [];
					let bytesRead = 0;
					const onChunkProgress = (loadedBytes) => {
						if (hasMaxContentLength) {
							bytesRead = loadedBytes;
							if (bytesRead > maxContentLength) throw new AxiosError("maxContentLength size of " + maxContentLength + " exceeded", AxiosError.ERR_BAD_RESPONSE, config, request);
						}
						onProgress && onProgress(loadedBytes);
					};
					response = new Response(trackStream(response.body, DEFAULT_CHUNK_SIZE, onChunkProgress, () => {
						flush && flush();
						unsubscribe && unsubscribe();
					}), options);
				}
				responseType = responseType || "text";
				let responseData = await resolvers[utils_default.findKey(resolvers, responseType) || "text"](response, config);
				if (hasMaxContentLength && !supportsResponseStream && !isStreamResponse) {
					let materializedSize;
					if (responseData != null) {
						if (typeof responseData.byteLength === "number") materializedSize = responseData.byteLength;
						else if (typeof responseData.size === "number") materializedSize = responseData.size;
						else if (typeof responseData === "string") materializedSize = typeof TextEncoder === "function" ? new TextEncoder().encode(responseData).byteLength : responseData.length;
					}
					if (typeof materializedSize === "number" && materializedSize > maxContentLength) throw new AxiosError("maxContentLength size of " + maxContentLength + " exceeded", AxiosError.ERR_BAD_RESPONSE, config, request);
				}
				!isStreamResponse && unsubscribe && unsubscribe();
				return await new Promise((resolve, reject) => {
					settle(resolve, reject, {
						data: responseData,
						headers: AxiosHeaders.from(response.headers),
						status: response.status,
						statusText: response.statusText,
						config,
						request
					});
				});
			} catch (err) {
				unsubscribe && unsubscribe();
				if (composedSignal && composedSignal.aborted && composedSignal.reason instanceof AxiosError) {
					const canceledError = composedSignal.reason;
					canceledError.config = config;
					request && (canceledError.request = request);
					if (err !== canceledError) Object.defineProperty(canceledError, "cause", {
						__proto__: null,
						value: err,
						writable: true,
						enumerable: false,
						configurable: true
					});
					throw canceledError;
				}
				if (pendingBodyError) {
					request && !pendingBodyError.request && (pendingBodyError.request = request);
					throw pendingBodyError;
				}
				if (err instanceof AxiosError) {
					request && !err.request && (err.request = request);
					throw err;
				}
				if (err && err.name === "TypeError" && /Load failed|fetch/i.test(err.message)) {
					const networkError = new AxiosError("Network Error", AxiosError.ERR_NETWORK, config, request, err && err.response);
					Object.defineProperty(networkError, "cause", {
						__proto__: null,
						value: err.cause || err,
						writable: true,
						enumerable: false,
						configurable: true
					});
					throw networkError;
				}
				throw AxiosError.from(err, err && err.code, config, request, err && err.response);
			}
		};
	};
	seedCache = /* @__PURE__ */ new Map();
	getFetch = (config) => {
		let env = config && config.env || {};
		const { fetch, Request, Response } = env;
		const seeds = [
			Request,
			Response,
			fetch
		];
		let i = seeds.length, seed, target, map = seedCache;
		while (i--) {
			seed = seeds[i];
			target = map.get(seed);
			target === void 0 && map.set(seed, target = i ? /* @__PURE__ */ new Map() : factory(env));
			map = target;
		}
		return target;
	};
	getFetch();
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/adapters/adapters.js
/**
* Get the first suitable adapter from the provided list.
* Tries each adapter in order until a supported one is found.
* Throws an AxiosError if no adapter is suitable.
*
* @param {Array<string|Function>|string|Function} adapters - Adapter(s) by name or function.
* @param {Object} config - Axios request configuration
* @throws {AxiosError} If no suitable adapter is available
* @returns {Function} The resolved adapter function
*/
function getAdapter(adapters, config) {
	adapters = utils_default.isArray(adapters) ? adapters : [adapters];
	const { length } = adapters;
	let nameOrAdapter;
	let adapter;
	const rejectedReasons = {};
	for (let i = 0; i < length; i++) {
		nameOrAdapter = adapters[i];
		let id;
		adapter = nameOrAdapter;
		if (!isResolvedHandle(nameOrAdapter)) {
			adapter = knownAdapters[(id = String(nameOrAdapter)).toLowerCase()];
			if (adapter === void 0) throw new AxiosError(`Unknown adapter '${id}'`);
		}
		if (adapter && (utils_default.isFunction(adapter) || (adapter = adapter.get(config)))) break;
		rejectedReasons[id || "#" + i] = adapter;
	}
	if (!adapter) {
		const reasons = Object.entries(rejectedReasons).map(([id, state]) => `adapter ${id} ` + (state === false ? "is not supported by the environment" : "is not available in the build"));
		let s = length ? reasons.length > 1 ? "since :\n" + reasons.map(renderReason).join("\n") : " " + renderReason(reasons[0]) : "as no adapter specified";
		throw new AxiosError(`There is no suitable adapter to dispatch the request ` + s, AxiosError.ERR_NOT_SUPPORT);
	}
	return adapter;
}
var knownAdapters, renderReason, isResolvedHandle, adapters_default;
var init_adapters = __esmMin((() => {
	init_utils$1();
	init_null();
	init_xhr();
	init_fetch();
	init_AxiosError();
	knownAdapters = {
		http: null,
		xhr: xhr_default,
		fetch: { get: getFetch }
	};
	utils_default.forEach(knownAdapters, (fn, value) => {
		if (fn) {
			try {
				Object.defineProperty(fn, "name", {
					__proto__: null,
					value
				});
			} catch (e) {}
			Object.defineProperty(fn, "adapterName", {
				__proto__: null,
				value
			});
		}
	});
	renderReason = (reason) => `- ${reason}`;
	isResolvedHandle = (adapter) => utils_default.isFunction(adapter) || adapter === null || adapter === false;
	adapters_default = {
		/**
		* Resolve an adapter from a list of adapter names or functions.
		* @type {Function}
		*/
		getAdapter,
		/**
		* Exposes all known adapters
		* @type {Object<string, Function|Object>}
		*/
		adapters: knownAdapters
	};
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/core/dispatchRequest.js
/**
* Throws a `CanceledError` if cancellation has been requested.
*
* @param {Object} config The config that is to be used for the request
*
* @returns {void}
*/
function throwIfCancellationRequested(config) {
	if (config.cancelToken) config.cancelToken.throwIfRequested();
	if (config.signal && config.signal.aborted) throw new CanceledError(null, config);
}
/**
* Dispatch a request to the server using the configured adapter.
*
* @param {object} config The config that is to be used for the request
*
* @returns {Promise} The Promise to be fulfilled
*/
function dispatchRequest(_config) {
	const config = utils_default.toSafeFlatObject(_config);
	throwIfCancellationRequested(config);
	config.headers = AxiosHeaders.from(utils_default.getSafeProp(config, "headers"));
	config.data = transformData.call(config, config.transformRequest);
	if ([
		"post",
		"put",
		"patch"
	].indexOf(config.method) !== -1) config.headers.setContentType("application/x-www-form-urlencoded", false);
	return adapters_default.getAdapter(config.adapter || defaults.adapter, config)(config).then(function onAdapterResolution(response) {
		throwIfCancellationRequested(config);
		config.response = response;
		try {
			response.data = transformData.call(config, config.transformResponse, response);
		} finally {
			delete config.response;
		}
		response.headers = AxiosHeaders.from(response.headers);
		return response;
	}, function onAdapterRejection(reason) {
		if (!isCancel(reason)) {
			throwIfCancellationRequested(config);
			if (reason && reason.response) {
				config.response = reason.response;
				try {
					reason.response.data = transformData.call(config, config.transformResponse, reason.response);
				} finally {
					delete config.response;
				}
				reason.response.headers = AxiosHeaders.from(reason.response.headers);
			}
		}
		return Promise.reject(reason);
	});
}
var init_dispatchRequest = __esmMin((() => {
	init_transformData();
	init_isCancel();
	init_defaults();
	init_CanceledError();
	init_AxiosHeaders();
	init_adapters();
	init_utils$1();
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/helpers/validator.js
/**
* Assert object's properties type
*
* @param {object} options
* @param {object} schema
* @param {boolean?} allowUnknown
*
* @returns {object}
*/
function assertOptions(options, schema, allowUnknown) {
	if (typeof options !== "object" || options === null) throw new AxiosError("options must be an object", AxiosError.ERR_BAD_OPTION_VALUE);
	const keys = Object.keys(options);
	let i = keys.length;
	while (i-- > 0) {
		const opt = keys[i];
		const validator = Object.prototype.hasOwnProperty.call(schema, opt) ? schema[opt] : void 0;
		if (validator) {
			const value = options[opt];
			const result = value === void 0 || validator(value, opt, options);
			if (result !== true) throw new AxiosError("option " + opt + " must be " + result, AxiosError.ERR_BAD_OPTION_VALUE);
			continue;
		}
		if (allowUnknown !== true) throw new AxiosError("Unknown option " + opt, AxiosError.ERR_BAD_OPTION);
	}
}
var validators$1, deprecatedWarnings, validator_default;
var init_validator = __esmMin((() => {
	init_data();
	init_AxiosError();
	validators$1 = {};
	[
		"object",
		"boolean",
		"number",
		"function",
		"string",
		"symbol"
	].forEach((type, i) => {
		validators$1[type] = function validator(thing) {
			return typeof thing === type || "a" + (i < 1 ? "n " : " ") + type;
		};
	});
	deprecatedWarnings = {};
	/**
	* Transitional option validator
	*
	* @param {function|boolean?} validator - set to false if the transitional option has been removed
	* @param {string?} version - deprecated version / removed since version
	* @param {string?} message - some message with additional info
	*
	* @returns {function}
	*/
	validators$1.transitional = function transitional(validator, version, message) {
		function formatMessage(opt, desc) {
			return "[Axios v" + VERSION + "] Transitional option '" + opt + "'" + desc + (message ? ". " + message : "");
		}
		return (value, opt, opts) => {
			if (validator === false) throw new AxiosError(formatMessage(opt, " has been removed" + (version ? " in " + version : "")), AxiosError.ERR_DEPRECATED);
			if (version && !deprecatedWarnings[opt]) {
				deprecatedWarnings[opt] = true;
				console.warn(formatMessage(opt, " has been deprecated since v" + version + " and will be removed in the near future"));
			}
			return validator ? validator(value, opt, opts) : true;
		};
	};
	validators$1.spelling = function spelling(correctSpelling) {
		return (value, opt) => {
			console.warn(`${opt} is likely a misspelling of ${correctSpelling}`);
			return true;
		};
	};
	validator_default = {
		assertOptions,
		validators: validators$1
	};
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/core/Axios.js
var validators, Axios;
var init_Axios = __esmMin((() => {
	init_utils$1();
	init_buildURL();
	init_InterceptorManager();
	init_dispatchRequest();
	init_mergeConfig();
	init_buildFullPath();
	init_methodList();
	init_validator();
	init_AxiosHeaders();
	init_transitional();
	validators = validator_default.validators;
	Axios = class {
		constructor(instanceConfig) {
			this.defaults = instanceConfig || {};
			this.interceptors = {
				request: new InterceptorManager(),
				response: new InterceptorManager()
			};
		}
		/**
		* Dispatch a request
		*
		* @param {String|Object} configOrUrl The config specific for this request (merged with this.defaults)
		* @param {?Object} config
		*
		* @returns {Promise} The Promise to be fulfilled
		*/
		async request(configOrUrl, config) {
			try {
				return await this._request(configOrUrl, config);
			} catch (err) {
				if (err instanceof Error) try {
					let dummy = {};
					Error.captureStackTrace ? Error.captureStackTrace(dummy) : dummy = /* @__PURE__ */ new Error();
					const dummyStack = dummy.stack;
					let stack = "";
					if (typeof dummyStack === "string") {
						const firstNewlineIndex = dummyStack.indexOf("\n");
						stack = firstNewlineIndex === -1 ? "" : dummyStack.slice(firstNewlineIndex + 1);
					}
					if (!err.stack) err.stack = stack;
					else if (stack) {
						const firstNewlineIndex = stack.indexOf("\n");
						const secondNewlineIndex = firstNewlineIndex === -1 ? -1 : stack.indexOf("\n", firstNewlineIndex + 1);
						const stackWithoutTwoTopLines = secondNewlineIndex === -1 ? "" : stack.slice(secondNewlineIndex + 1);
						if (!String(err.stack).endsWith(stackWithoutTwoTopLines)) err.stack += "\n" + stack;
					}
				} catch (e) {}
				throw err;
			}
		}
		_request(configOrUrl, config) {
			if (typeof configOrUrl === "string") {
				config = config || {};
				config.url = configOrUrl;
			} else config = configOrUrl || {};
			config = mergeConfig(this.defaults, config);
			const { transitional, paramsSerializer, headers } = config;
			if (transitional !== void 0) validator_default.assertOptions(transitional, {
				silentJSONParsing: validators.transitional(validators.boolean),
				forcedJSONParsing: validators.transitional(validators.boolean),
				clarifyTimeoutError: validators.transitional(validators.boolean),
				legacyInterceptorReqResOrdering: validators.transitional(validators.boolean),
				advertiseZstdAcceptEncoding: validators.transitional(validators.boolean),
				validateStatusUndefinedResolves: validators.transitional(validators.boolean)
			}, false);
			if (paramsSerializer != null) {
				if (utils_default.isFunction(paramsSerializer)) config.paramsSerializer = { serialize: paramsSerializer };
				else validator_default.assertOptions(paramsSerializer, {
					encode: validators.function,
					serialize: validators.function
				}, true);
			}
			if (config.allowAbsoluteUrls !== void 0) {} else if (this.defaults.allowAbsoluteUrls !== void 0) config.allowAbsoluteUrls = this.defaults.allowAbsoluteUrls;
			else config.allowAbsoluteUrls = true;
			validator_default.assertOptions(config, {
				baseUrl: validators.spelling("baseURL"),
				withXsrfToken: validators.spelling("withXSRFToken")
			}, true);
			config.method = (utils_default.getSafeProp(config, "method") || utils_default.getSafeProp(this.defaults, "method") || "get").toLowerCase();
			let contextHeaders = headers && utils_default.merge(headers.common, headers[config.method]);
			headers && utils_default.forEach(methodList.concat("common"), (method) => {
				delete headers[method];
			});
			config.headers = AxiosHeaders.concat(contextHeaders, headers);
			const requestInterceptorChain = [];
			let synchronousRequestInterceptors = true;
			this.interceptors.request.forEach(function unshiftRequestInterceptors(interceptor) {
				if (typeof interceptor.runWhen === "function" && interceptor.runWhen(config) === false) return;
				synchronousRequestInterceptors = synchronousRequestInterceptors && interceptor.synchronous;
				const transitional = config.transitional || transitional_default;
				if (transitional && transitional.legacyInterceptorReqResOrdering) requestInterceptorChain.unshift(interceptor.fulfilled, interceptor.rejected);
				else requestInterceptorChain.push(interceptor.fulfilled, interceptor.rejected);
			});
			const responseInterceptorChain = [];
			this.interceptors.response.forEach(function pushResponseInterceptors(interceptor) {
				responseInterceptorChain.push(interceptor.fulfilled, interceptor.rejected);
			});
			let promise;
			let i = 0;
			let len;
			if (!synchronousRequestInterceptors) {
				const chain = [dispatchRequest.bind(this), void 0];
				chain.unshift(...requestInterceptorChain);
				chain.push(...responseInterceptorChain);
				len = chain.length;
				promise = Promise.resolve(config);
				while (i < len) promise = promise.then(chain[i++], chain[i++]);
				return promise;
			}
			len = requestInterceptorChain.length;
			let newConfig = config;
			while (i < len) {
				const onFulfilled = requestInterceptorChain[i++];
				const onRejected = requestInterceptorChain[i++];
				try {
					newConfig = onFulfilled ? onFulfilled(newConfig) : newConfig;
				} catch (error) {
					if (!onRejected) {
						promise = Promise.reject(error);
						break;
					}
					try {
						const rejectedResult = onRejected.call(this, error);
						if (utils_default.isThenable(rejectedResult)) promise = Promise.resolve(rejectedResult).then(() => dispatchRequest.call(this, newConfig));
					} catch (rejectedError) {
						promise = Promise.reject(rejectedError);
					}
					break;
				}
			}
			if (!promise) try {
				promise = dispatchRequest.call(this, newConfig);
			} catch (error) {
				promise = Promise.reject(error);
			}
			i = 0;
			len = responseInterceptorChain.length;
			while (i < len) promise = promise.then(responseInterceptorChain[i++], responseInterceptorChain[i++]);
			return promise;
		}
		getUri(config) {
			config = mergeConfig(this.defaults, config);
			return buildURL(buildFullPath(config.baseURL, config.url, config.allowAbsoluteUrls, config), config.params, config.paramsSerializer);
		}
	};
	utils_default.forEach([
		"delete",
		"get",
		"head",
		"options"
	], function forEachMethodNoData(method) {
		Axios.prototype[method] = function(url, config) {
			return this.request(mergeConfig(config || {}, {
				method,
				url,
				data: config && utils_default.hasOwnProp(config, "data") ? config.data : void 0
			}));
		};
	});
	utils_default.forEach([
		"post",
		"put",
		"patch",
		"query"
	], function forEachMethodWithData(method) {
		function generateHTTPMethod(isForm) {
			return function httpMethod(url, data, config) {
				return this.request(mergeConfig(config || {}, {
					method,
					headers: isForm ? { "Content-Type": "multipart/form-data" } : {},
					url,
					data
				}));
			};
		}
		Axios.prototype[method] = generateHTTPMethod();
		if (method !== "query") Axios.prototype[method + "Form"] = generateHTTPMethod(true);
	});
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/cancel/CancelToken.js
var CancelToken;
var init_CancelToken = __esmMin((() => {
	init_CanceledError();
	CancelToken = class CancelToken {
		constructor(executor) {
			if (typeof executor !== "function") throw new TypeError("executor must be a function.");
			let resolvePromise;
			this.promise = new Promise(function promiseExecutor(resolve) {
				resolvePromise = resolve;
			});
			const token = this;
			this.promise.then((cancel) => {
				if (!token._listeners) return;
				let i = token._listeners.length;
				while (i-- > 0) token._listeners[i](cancel);
				token._listeners = null;
			});
			this.promise.then = (onfulfilled) => {
				let _resolve;
				const promise = new Promise((resolve) => {
					token.subscribe(resolve);
					_resolve = resolve;
				}).then(onfulfilled);
				promise.cancel = function reject() {
					token.unsubscribe(_resolve);
				};
				return promise;
			};
			executor(function cancel(message, config, request) {
				if (token.reason) return;
				token.reason = new CanceledError(message, config, request);
				resolvePromise(token.reason);
			});
		}
		/**
		* Throws a `CanceledError` if cancellation has been requested.
		*/
		throwIfRequested() {
			if (this.reason) throw this.reason;
		}
		/**
		* Subscribe to the cancel signal
		*/
		subscribe(listener) {
			if (this.reason) {
				listener(this.reason);
				return;
			}
			if (this._listeners) this._listeners.push(listener);
			else this._listeners = [listener];
		}
		/**
		* Unsubscribe from the cancel signal
		*/
		unsubscribe(listener) {
			if (!this._listeners) return;
			const index = this._listeners.indexOf(listener);
			if (index !== -1) this._listeners.splice(index, 1);
		}
		toAbortSignal() {
			const controller = new AbortController();
			const abort = (err) => {
				controller.abort(err);
			};
			this.subscribe(abort);
			controller.signal.unsubscribe = () => this.unsubscribe(abort);
			return controller.signal;
		}
		/**
		* Returns an object that contains a new `CancelToken` and a function that, when called,
		* cancels the `CancelToken`.
		*/
		static source() {
			let cancel;
			return {
				token: new CancelToken(function executor(c) {
					cancel = c;
				}),
				cancel
			};
		}
	};
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/helpers/spread.js
/**
* Syntactic sugar for invoking a function and expanding an array for arguments.
*
* Common use case would be to use `Function.prototype.apply`.
*
*  ```js
*  function f(x, y, z) {}
*  const args = [1, 2, 3];
*  f.apply(null, args);
*  ```
*
* With `spread` this example can be re-written.
*
*  ```js
*  spread(function(x, y, z) {})([1, 2, 3]);
*  ```
*
* @param {Function} callback
*
* @returns {Function}
*/
function spread(callback) {
	return function wrap(arr) {
		return callback.apply(null, arr);
	};
}
var init_spread = __esmMin((() => {}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/helpers/isAxiosError.js
/**
* Determines whether the payload is an error thrown by Axios
*
* @param {*} payload The value to test
*
* @returns {boolean} True if the payload is an error thrown by Axios, otherwise false
*/
function isAxiosError(payload) {
	return utils_default.isObject(payload) && payload.isAxiosError === true;
}
var init_isAxiosError = __esmMin((() => {
	init_utils$1();
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/helpers/HttpStatusCode.js
var HttpStatusCode;
var init_HttpStatusCode = __esmMin((() => {
	HttpStatusCode = {
		Continue: 100,
		SwitchingProtocols: 101,
		Processing: 102,
		EarlyHints: 103,
		Ok: 200,
		Created: 201,
		Accepted: 202,
		NonAuthoritativeInformation: 203,
		NoContent: 204,
		ResetContent: 205,
		PartialContent: 206,
		MultiStatus: 207,
		AlreadyReported: 208,
		ImUsed: 226,
		MultipleChoices: 300,
		MovedPermanently: 301,
		Found: 302,
		SeeOther: 303,
		NotModified: 304,
		UseProxy: 305,
		Unused: 306,
		TemporaryRedirect: 307,
		PermanentRedirect: 308,
		BadRequest: 400,
		Unauthorized: 401,
		PaymentRequired: 402,
		Forbidden: 403,
		NotFound: 404,
		MethodNotAllowed: 405,
		NotAcceptable: 406,
		ProxyAuthenticationRequired: 407,
		RequestTimeout: 408,
		Conflict: 409,
		Gone: 410,
		LengthRequired: 411,
		PreconditionFailed: 412,
		/**
		* @deprecated Use `ContentTooLarge` instead.
		*/
		PayloadTooLarge: 413,
		ContentTooLarge: 413,
		UriTooLong: 414,
		UnsupportedMediaType: 415,
		RangeNotSatisfiable: 416,
		ExpectationFailed: 417,
		ImATeapot: 418,
		MisdirectedRequest: 421,
		/**
		* @deprecated Use `UnprocessableContent` instead.
		*/
		UnprocessableEntity: 422,
		UnprocessableContent: 422,
		Locked: 423,
		FailedDependency: 424,
		TooEarly: 425,
		UpgradeRequired: 426,
		PreconditionRequired: 428,
		TooManyRequests: 429,
		RequestHeaderFieldsTooLarge: 431,
		UnavailableForLegalReasons: 451,
		InternalServerError: 500,
		NotImplemented: 501,
		BadGateway: 502,
		ServiceUnavailable: 503,
		GatewayTimeout: 504,
		HttpVersionNotSupported: 505,
		VariantAlsoNegotiates: 506,
		InsufficientStorage: 507,
		LoopDetected: 508,
		NotExtended: 510,
		NetworkAuthenticationRequired: 511,
		WebServerReturnsAnUnknownError: 520,
		WebServerIsDown: 521,
		ConnectionTimedOut: 522,
		OriginIsUnreachable: 523,
		TimeoutOccurred: 524,
		SslHandshakeFailed: 525,
		InvalidSslCertificate: 526
	};
	Object.entries(HttpStatusCode).forEach(([key, value]) => {
		if (HttpStatusCode[value] === void 0) HttpStatusCode[value] = key;
	});
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/lib/axios.js
/**
* Create an instance of Axios
*
* @param {Object} defaultConfig The default config for the instance
*
* @returns {Axios} A new instance of Axios
*/
function createInstance(defaultConfig) {
	const context = new Axios(defaultConfig);
	const instance = bind(Axios.prototype.request, context);
	utils_default.extend(instance, Axios.prototype, context, { allOwnKeys: true });
	utils_default.extend(instance, context, null, { allOwnKeys: true });
	instance.create = function create(instanceConfig) {
		return createInstance(mergeConfig(defaultConfig, instanceConfig));
	};
	return instance;
}
var axios;
var init_axios$1 = __esmMin((() => {
	init_utils$1();
	init_bind();
	init_Axios();
	init_mergeConfig();
	init_defaults();
	init_formDataToJSON();
	init_CanceledError();
	init_CancelToken();
	init_isCancel();
	init_data();
	init_toFormData();
	init_AxiosError();
	init_spread();
	init_isAxiosError();
	init_AxiosHeaders();
	init_adapters();
	init_HttpStatusCode();
	axios = createInstance(defaults);
	axios.Axios = Axios;
	axios.CanceledError = CanceledError;
	axios.CancelToken = CancelToken;
	axios.isCancel = isCancel;
	axios.VERSION = VERSION;
	axios.toFormData = toFormData;
	axios.AxiosError = AxiosError;
	axios.Cancel = axios.CanceledError;
	axios.all = function all(promises) {
		return Promise.all(promises);
	};
	axios.spread = spread;
	axios.isAxiosError = isAxiosError;
	axios.mergeConfig = mergeConfig;
	axios.AxiosHeaders = AxiosHeaders;
	axios.formToJSON = (thing) => formDataToJSON(utils_default.isHTMLForm(thing) ? new FormData(thing) : thing);
	axios.getAdapter = adapters_default.getAdapter;
	axios.HttpStatusCode = HttpStatusCode;
	axios.default = axios;
}));
//#endregion
//#region node_modules/.pnpm/axios@1.20.0/node_modules/axios/index.js
var init_axios = __esmMin((() => {
	init_axios$1();
}));
//#endregion
//#region src/base/config.ts
var state, config, prefix, apiUrl, config_default;
var init_config = __esmMin((() => {
	state = window.__INITIAL_STATE__ || {};
	config = state.config || {};
	prefix = config.prefix || "";
	apiUrl = config.apiUrl || "";
	config_default = {
		...config,
		state,
		prefix,
		apiUrl,
		baseURL: `${location.origin}` + prefix,
		timeout: 3e4
	};
}));
//#endregion
//#region src/adapter/ajax.ts
function getPendingKey(config) {
	const { url, method, params } = config;
	let { data } = config;
	if (typeof data === "string") data = JSON.parse(data);
	return [
		url,
		method,
		JSON.stringify(params),
		JSON.stringify(data)
	].join("&");
}
function addPending(config) {
	const pendingKey = getPendingKey(config);
	const controller = new AbortController();
	config.signal = controller.signal;
	pendingMap.set(pendingKey, controller);
}
function removePending(config) {
	const pendingKey = getPendingKey(config);
	if (pendingMap.has(pendingKey)) pendingMap.delete(pendingKey);
}
function abortAllPending() {
	for (const [key, value] of pendingMap.entries()) {
		value.abort();
		pendingMap.delete(key);
	}
}
function getHttpErrorMsg(error) {
	if (axios.isCancel(error)) {
		console.error(`重复请求：${error.config.url} ${error.message}`);
		return error.message;
	}
	if (error?.message?.includes("timeout")) return "网络请求超时！";
	if (error?.message?.includes("Network")) return window.navigator.onLine ? "服务端异常！" : "您断网了！";
	if (error?.response) switch (error.response.status) {
		case 401: return "未授权，请重新登录！";
		case 403: return "没有权限操作！";
		case 504: return "服务暂时无法访问，请稍后再试！";
		default: return "异常问题，请联系管理员！";
	}
	return error?.message || "未知错误";
}
var pendingMap, service;
var init_ajax = __esmMin((() => {
	init_axios();
	init_config();
	pendingMap = /* @__PURE__ */ new Map();
	service = axios.create({
		baseURL: `${config_default.baseURL}`,
		timeout: 3e4
	});
	service.interceptors.request.use((config) => {
		const pendingKey = getPendingKey(config);
		if (pendingMap.has(pendingKey)) pendingMap.get(pendingKey).abort();
		else addPending(config);
		return config;
	}, (error) => Promise.reject(error));
	service.interceptors.response.use((response) => {
		removePending(response.config);
		return response;
	}, (error) => {
		error.config && removePending(error.config);
		error.message = getHttpErrorMsg(error);
		return Promise.reject(error);
	});
}));
//#endregion
//#region src/locales/zh-CN.ts
var zh_CN_default;
var init_zh_CN = __esmMin((() => {
	zh_CN_default = {
		common: {
			confirm: "确定",
			cancel: "取消",
			close: "关闭",
			save: "保存",
			delete: "删除",
			edit: "编辑",
			add: "新增",
			search: "搜索",
			refresh: "刷新",
			loading: "加载中...",
			success: "成功",
			failed: "失败",
			error: "错误",
			warning: "警告",
			processing: "处理中...",
			rename: "重命名",
			clone: "复制连接",
			copy: "复制",
			test: "测试",
			copySuffix: "副本"
		},
		app: {
			title: "AICmd 终端",
			emptyTitle: "AICmd 终端",
			emptyDesc: "从左侧选择连接，或创建新的 SSH 连接开始",
			addConnection: "新增连接",
			openLocalShell: "打开本地 Shell",
			localShell: "本地 Shell",
			newLocalShell: "新建本地 Shell"
		},
		sidebar: {
			searchPlaceholder: "搜索连接...",
			noConnections: "暂无连接",
			addConnection: "添加连接",
			connectionCount: "个连接",
			collapse: "收起侧边栏",
			expand: "展开侧边栏",
			connect: "连接",
			deleteConfirm: "确定删除该连接？",
			deleted: "已删除",
			deleteFailed: "删除失败",
			loadFailed: "加载连接列表失败"
		},
		tab: {
			clone: "复制连接",
			rename: "重命名",
			close: "关闭标签",
			closeOther: "关闭其他标签",
			closeAll: "关闭所有标签",
			connecting: "正在连接...",
			connected: "已连接",
			disconnected: "连接已断开",
			connectionFailed: "连接失败",
			wsFailed: "WebSocket 连接失败",
			reconnect: "重连",
			reconnecting: "正在重连...",
			connectingTo: "正在连接到 {host}...",
			connectionEstablished: "连接已建立",
			maxReconnectReached: "已达最大重连次数，请关闭标签后重新打开"
		},
		connection: {
			addTitle: "新增连接",
			editTitle: "编辑连接",
			name: "连接名称",
			namePlaceholder: "为连接起一个名称",
			host: "主机地址",
			hostPlaceholder: "服务器 IP 或域名",
			port: "端口",
			username: "用户名",
			usernamePlaceholder: "SSH 用户名",
			authType: "认证方式",
			auto: "自动（本机密钥）",
			autoHint: "自动使用本机 SSH 密钥（~/.ssh 目录下的私钥文件）",
			password: "密码",
			privateKey: "私钥",
			passwordLabel: "密码",
			passwordPlaceholder: "SSH 密码",
			privateKeyContent: "私钥内容",
			privateKeyPlaceholder: "粘贴私钥内容或选择文件...",
			passphrase: "私钥密码（可选）",
			passphrasePlaceholder: "如果私钥有密码保护",
			loadFromFile: "从文件加载",
			privateKeyLoaded: "私钥已加载",
			privateKeyLoadFailed: "读取私钥文件失败",
			terminalConfig: "终端配置",
			fontSize: "字体大小",
			cursorStyle: "光标样式",
			cursorBlock: "方块",
			cursorUnderline: "下划线",
			cursorBar: "竖线",
			theme: "主题",
			themeDark: "暗色",
			themeLight: "亮色",
			fontFamily: "字体",
			testConnection: "测试连接",
			testing: "测试中...",
			saving: "保存中...",
			saveSuccess: "保存成功",
			saveFailed: "保存失败",
			testSuccess: "连接成功",
			testFailed: "连接失败",
			testError: "测试失败",
			nameRequired: "请填写连接名称",
			hostUsernameRequired: "请填写主机地址和用户名",
			hostUsernameTestRequired: "请先填写主机和用户名",
			startupScript: "连接后自动执行脚本",
			startupScriptPlaceholder: "跳板机示例：ssh 192.168.1.100\n其他示例：cd /data && source env.sh",
			startupScriptHint: "SSH 连接建立后自动执行的命令，常用于跳板机跳转、自动切换目录等场景",
			forwardAgent: "SSH Agent 转发",
			forwardAgentHint: "将本机 SSH 密钥转发到远程服务器，用于跳板机跳转时的密钥认证",
			keepaliveConfig: "连接保活",
			keepaliveInterval: "心跳间隔",
			keepaliveIntervalPlaceholder: "10000",
			keepaliveIntervalHint: "每隔多少毫秒发送一次心跳包（默认 10000ms）",
			keepaliveCountMax: "最大失败次数",
			keepaliveCountMaxPlaceholder: "3",
			keepaliveCountMaxHint: "连续多少次心跳失败后断开连接（默认 3 次）",
			keepaliveEnabled: "启用保活",
			keepaliveEnabledHint: "定期发送心跳包保持 SSH 连接活跃，防止因长时间无操作而断开"
		},
		fileTransfer: {
			title: "文件传输",
			transferring: "传输中...",
			upload: "上传文件 (rz)",
			download: "下载文件 (sz)",
			dropZone: "拖放文件到此处，或点击选择文件",
			multiFileSupport: "支持多文件同时上传",
			remotePath: "远程文件路径",
			remotePathPlaceholder: "/path/to/remote/file",
			startDownload: "开始下载",
			transferHistory: "传输记录",
			transferFailed: "传输失败",
			complete: "完成",
			failed: "失败",
			cancelTransfer: "取消传输",
			terminalNotConnected: "终端未连接",
			remotePathRequired: "请输入远程文件路径",
			uploadComplete: "文件上传完成",
			uploadFailed: "上传失败",
			downloadComplete: "文件下载完成",
			downloadFailed: "下载失败",
			waitingForFiles: "等待远程发送文件..."
		},
		modal: {
			close: "关闭",
			confirm: "确定",
			processing: "处理中..."
		},
		toast: {
			success: "成功",
			error: "错误",
			warning: "警告",
			info: "提示"
		},
		ai: {
			settings: "AI 设置",
			chat: "AI 助手",
			enableAI: "启用 AI 功能",
			enableHint: "启用后可在终端中使用 AI 助手",
			provider: "AI 提供商",
			providerHint: "选择 AI 服务提供商",
			apiKey: "API Key",
			apiKeyPlaceholder: "sk-...",
			apiKeyHint: "OpenAI 或兼容服务的 API Key",
			apiKeyRequired: "请填写 API Key",
			baseUrl: "API 地址",
			baseUrlPlaceholder: "https://api.openai.com/v1",
			baseUrlHint: "支持 OpenAI 兼容的 API 地址（如 DeepSeek、通义千问等）",
			model: "模型",
			modelPlaceholder: "gpt-4o-mini",
			modelHint: "填写模型名称",
			maxTokens: "最大 Token 数",
			temperature: "Temperature",
			testConnection: "测试连接",
			testing: "测试中...",
			testSuccess: "AI 连接测试成功",
			testFailed: "AI 连接测试失败",
			saveSuccess: "AI 配置已保存",
			saveFailed: "保存失败",
			clearHistory: "清空对话",
			emptyHint: "告诉 AI 你想做什么，它会自动帮你操作终端",
			inputPlaceholder: "描述任务，按 Enter 发送...",
			executeCommand: "执行命令",
			agentHint: "AI Agent 可以直接操作你的终端 Shell\n试试说：“帮我查看当前目录” 或 “查找占用 80 端口的进程”",
			agentThinking: "思考中...",
			executingCommand: "执行命令",
			stopAgent: "停止",
			agentDone: "任务完成",
			agentError: "执行出错",
			maxIterations: "已达到最大执行次数",
			skills: "技能",
			selectSkill: "选择技能",
			activeSkill: "已选技能",
			noSkills: "暂无可用技能",
			userSkill: "自定义",
			history: "历史记录",
			noHistory: "暂无历史对话",
			messages: "条消息",
			justNow: "刚刚"
		},
		audit: {
			title: "审计",
			today: "今天",
			searchPlaceholder: "搜索命令、结果...",
			allStatus: "全部状态",
			success: "成功",
			error: "失败",
			blocked: "拦截",
			total: "总计",
			noLogs: "暂无审计记录",
			session: "会话",
			userRequest: "用户请求",
			command: "命令",
			result: "结果",
			copyCommand: "复制命令",
			copyResult: "复制结果",
			export: "导出"
		},
		monitor: {
			title: "监控",
			logPathPlaceholder: "日志文件路径，如 /var/log/syslog",
			start: "开始监控",
			stop: "停止",
			monitoring: "监控中",
			lines: "行",
			alerts: "告警",
			detectedAnomalies: "个异常",
			clearAlerts: "清除告警",
			aiAnalyze: "AI 分析",
			analyzing: "分析中...",
			aiAnalysisResult: "AI 分析结果",
			noLogsToAnalyze: "暂无日志可分析",
			analysisInProgress: "AI 正在分析日志...",
			waitingForLogs: "等待日志数据...",
			notStarted: "输入日志文件路径并点击开始监控"
		},
		batch: {
			title: "批量操作",
			commandPlaceholder: "输入要在所有服务器上执行的命令...",
			execute: "执行",
			executing: "执行中...",
			serversSelected: "台服务器已选择",
			selectServers: "选择服务器",
			selectAll: "全选",
			selectNone: "取消全选",
			noActiveSessions: "暂无活跃会话",
			hint: "选择多个服务器，输入命令并执行，可同时操作多台服务器",
			copyOutput: "复制输出"
		},
		update: {
			newVersion: "发现新版本",
			available: "发现新版本 v{version}，请前往 GitHub 下载更新。"
		},
		context: {
			copy: "复制",
			paste: "粘贴"
		},
		fileManager: {
			title: "文件管理",
			up: "上级",
			refresh: "刷新",
			newFolder: "新建文件夹",
			upload: "上传",
			deleteSelected: "删除选中",
			path: "路径",
			name: "名称",
			size: "大小",
			modified: "修改时间",
			permissions: "权限",
			actions: "操作",
			download: "下载",
			rename: "重命名",
			delete: "删除",
			open: "打开",
			loading: "加载中...",
			empty: "空目录",
			root: "根目录",
			newFolderPrompt: "请输入文件夹名称",
			renamePrompt: "请输入新的名称",
			confirmDelete: "确定要删除 “{name}” 吗？此操作不可恢复。",
			confirmDeleteMulti: "确定要删除选中的 {count} 个项目吗？此操作不可恢复。",
			created: "文件夹已创建",
			deleted: "已删除",
			renamed: "已重命名",
			uploadSuccess: "上传成功：{count} 个文件",
			uploadFailed: "上传失败：{msg}",
			loadFailed: "加载失败：{msg}",
			openInTerminal: "在终端中打开",
			invalidName: "名称不能包含 “/”",
			folderExists: "文件夹已存在",
			noSession: "当前没有可用的会话",
			uploading: "上传中... ({current}/{total})",
			downloading: "下载中...",
			downloadFailed: "下载失败：{msg}"
		}
	};
}));
//#endregion
//#region src/locales/en-US.ts
var en_US_default;
var init_en_US = __esmMin((() => {
	en_US_default = {
		common: {
			confirm: "Confirm",
			cancel: "Cancel",
			close: "Close",
			save: "Save",
			delete: "Delete",
			edit: "Edit",
			add: "Add",
			search: "Search",
			refresh: "Refresh",
			loading: "Loading...",
			success: "Success",
			failed: "Failed",
			error: "Error",
			warning: "Warning",
			processing: "Processing...",
			rename: "Rename",
			clone: "Clone Connection",
			copy: "Copy",
			test: "Test",
			copySuffix: "Copy"
		},
		app: {
			title: "AICmd Terminal",
			emptyTitle: "AICmd Terminal",
			emptyDesc: "Select a connection from the left, or create a new SSH connection to start",
			addConnection: "New Connection",
			openLocalShell: "Open Local Shell",
			localShell: "Local Shell",
			newLocalShell: "New Local Shell"
		},
		sidebar: {
			searchPlaceholder: "Search connections...",
			noConnections: "No connections",
			addConnection: "Add Connection",
			connectionCount: "connections",
			collapse: "Collapse Sidebar",
			expand: "Expand Sidebar",
			connect: "Connect",
			deleteConfirm: "Are you sure you want to delete this connection?",
			deleted: "Deleted",
			deleteFailed: "Delete failed",
			loadFailed: "Failed to load connections"
		},
		tab: {
			clone: "Clone Connection",
			rename: "Rename",
			close: "Close Tab",
			closeOther: "Close Other Tabs",
			closeAll: "Close All Tabs",
			connecting: "Connecting...",
			connected: "Connected",
			disconnected: "Disconnected",
			connectionFailed: "Connection failed",
			wsFailed: "WebSocket connection failed",
			reconnect: "Reconnect",
			reconnecting: "Reconnecting...",
			connectingTo: "Connecting to {host}...",
			connectionEstablished: "Connection established",
			maxReconnectReached: "Max reconnect attempts reached. Please close and reopen the tab."
		},
		connection: {
			addTitle: "New Connection",
			editTitle: "Edit Connection",
			name: "Connection Name",
			namePlaceholder: "Give your connection a name",
			host: "Host Address",
			hostPlaceholder: "Server IP or domain",
			port: "Port",
			username: "Username",
			usernamePlaceholder: "SSH username",
			authType: "Authentication",
			auto: "Auto (Local Key)",
			autoHint: "Automatically use local SSH keys from ~/.ssh directory",
			password: "Password",
			privateKey: "Private Key",
			passwordLabel: "Password",
			passwordPlaceholder: "SSH password",
			privateKeyContent: "Private Key Content",
			privateKeyPlaceholder: "Paste private key content or select a file...",
			passphrase: "Key Passphrase (Optional)",
			passphrasePlaceholder: "If the key is password-protected",
			loadFromFile: "Load from File",
			privateKeyLoaded: "Private key loaded",
			privateKeyLoadFailed: "Failed to read private key file",
			terminalConfig: "Terminal Config",
			fontSize: "Font Size",
			cursorStyle: "Cursor Style",
			cursorBlock: "Block",
			cursorUnderline: "Underline",
			cursorBar: "Bar",
			theme: "Theme",
			themeDark: "Dark",
			themeLight: "Light",
			fontFamily: "Font",
			testConnection: "Test Connection",
			testing: "Testing...",
			saving: "Saving...",
			saveSuccess: "Saved successfully",
			saveFailed: "Save failed",
			testSuccess: "Connection successful",
			testFailed: "Connection failed",
			testError: "Test failed",
			nameRequired: "Please enter a connection name",
			hostUsernameRequired: "Please enter host address and username",
			hostUsernameTestRequired: "Please enter host and username first",
			startupScript: "Startup Script",
			startupScriptPlaceholder: "Jump host example: ssh 192.168.1.100\nOther example: cd /data && source env.sh",
			startupScriptHint: "Command to execute after SSH connection is established. Useful for jump host hopping, auto cd to working directory, etc.",
			forwardAgent: "SSH Agent Forwarding",
			forwardAgentHint: "Forward local SSH keys to remote server for key-based authentication on jump host hops",
			keepaliveConfig: "Keepalive",
			keepaliveInterval: "Heartbeat Interval",
			keepaliveIntervalPlaceholder: "10000",
			keepaliveIntervalHint: "How often to send keepalive packets in milliseconds (default: 10000ms)",
			keepaliveCountMax: "Max Failures",
			keepaliveCountMaxPlaceholder: "3",
			keepaliveCountMaxHint: "Disconnect after this many consecutive keepalive failures (default: 3)",
			keepaliveEnabled: "Enable Keepalive",
			keepaliveEnabledHint: "Send periodic keepalive packets to maintain SSH connection and prevent timeout"
		},
		fileTransfer: {
			title: "File Transfer",
			transferring: "Transferring...",
			upload: "Upload (rz)",
			download: "Download (sz)",
			dropZone: "Drag files here or click to select",
			multiFileSupport: "Supports multiple files",
			remotePath: "Remote File Path",
			remotePathPlaceholder: "/path/to/remote/file",
			startDownload: "Start Download",
			transferHistory: "Transfer History",
			transferFailed: "Transfer failed",
			complete: "Complete",
			failed: "Failed",
			cancelTransfer: "Cancel Transfer",
			terminalNotConnected: "Terminal not connected",
			remotePathRequired: "Please enter remote file path",
			uploadComplete: "File upload complete",
			uploadFailed: "Upload failed",
			downloadComplete: "File download complete",
			downloadFailed: "Download failed",
			waitingForFiles: "Waiting for files from remote..."
		},
		modal: {
			close: "Close",
			confirm: "Confirm",
			processing: "Processing..."
		},
		toast: {
			success: "Success",
			error: "Error",
			warning: "Warning",
			info: "Info"
		},
		ai: {
			settings: "AI Settings",
			chat: "AI Assistant",
			enableAI: "Enable AI",
			enableHint: "Enable to use AI assistant in terminal",
			provider: "AI Provider",
			providerHint: "Select AI service provider",
			apiKey: "API Key",
			apiKeyPlaceholder: "sk-...",
			apiKeyHint: "OpenAI or compatible service API Key",
			apiKeyRequired: "Please enter API Key",
			baseUrl: "API Base URL",
			baseUrlPlaceholder: "https://api.openai.com/v1",
			baseUrlHint: "Supports OpenAI compatible API (DeepSeek, Qwen, etc.)",
			model: "Model",
			modelPlaceholder: "gpt-4o-mini",
			modelHint: "Enter model name",
			maxTokens: "Max Tokens",
			temperature: "Temperature",
			testConnection: "Test Connection",
			testing: "Testing...",
			testSuccess: "AI connection test successful",
			testFailed: "AI connection test failed",
			saveSuccess: "AI settings saved",
			saveFailed: "Save failed",
			clearHistory: "Clear History",
			emptyHint: "Tell AI what you want to do, it will operate the terminal for you",
			inputPlaceholder: "Describe your task, press Enter...",
			executeCommand: "Execute Command",
			agentHint: "AI Agent can directly operate your terminal Shell\nTry: \"list current directory\" or \"find process using port 80\"",
			agentThinking: "Thinking...",
			executingCommand: "Executing",
			stopAgent: "Stop",
			agentDone: "Task Complete",
			agentError: "Execution Error",
			maxIterations: "Maximum iterations reached",
			skills: "Skills",
			selectSkill: "Select Skill",
			activeSkill: "Active Skill",
			noSkills: "No skills available",
			userSkill: "Custom",
			history: "History",
			noHistory: "No history",
			messages: "messages",
			justNow: "Just now"
		},
		audit: {
			title: "Audit",
			today: "today",
			searchPlaceholder: "Search commands, results...",
			allStatus: "All Status",
			success: "Success",
			error: "Error",
			blocked: "Blocked",
			total: "Total",
			noLogs: "No audit logs",
			session: "Session",
			userRequest: "User Request",
			command: "Command",
			result: "Result",
			copyCommand: "Copy Command",
			copyResult: "Copy Result",
			export: "Export"
		},
		monitor: {
			title: "Monitor",
			logPathPlaceholder: "Log file path, e.g. /var/log/syslog",
			start: "Start",
			stop: "Stop",
			monitoring: "Monitoring",
			lines: "lines",
			alerts: "alerts",
			detectedAnomalies: "anomalies detected",
			clearAlerts: "Clear Alerts",
			aiAnalyze: "AI Analyze",
			analyzing: "Analyzing...",
			aiAnalysisResult: "AI Analysis Result",
			noLogsToAnalyze: "No logs to analyze",
			analysisInProgress: "AI is analyzing logs...",
			waitingForLogs: "Waiting for log data...",
			notStarted: "Enter log file path and click Start"
		},
		batch: {
			title: "Batch",
			commandPlaceholder: "Enter command to execute on all servers...",
			execute: "Execute",
			executing: "Executing...",
			serversSelected: "servers selected",
			selectServers: "Select Servers",
			selectAll: "Select All",
			selectNone: "Clear",
			noActiveSessions: "No active sessions",
			hint: "Select multiple servers, enter a command and execute to operate on multiple servers at once",
			copyOutput: "Copy Output"
		},
		update: {
			newVersion: "New Version Available",
			available: "New version v{version} is available. Please download from GitHub."
		},
		context: {
			copy: "Copy",
			paste: "Paste"
		},
		fileManager: {
			title: "File Manager",
			up: "Up",
			refresh: "Refresh",
			newFolder: "New Folder",
			upload: "Upload",
			deleteSelected: "Delete Selected",
			path: "Path",
			name: "Name",
			size: "Size",
			modified: "Modified",
			permissions: "Permissions",
			actions: "Actions",
			download: "Download",
			rename: "Rename",
			delete: "Delete",
			open: "Open",
			loading: "Loading...",
			empty: "Empty directory",
			root: "root",
			newFolderPrompt: "Enter folder name",
			renamePrompt: "Enter new name",
			confirmDelete: "Delete \"{name}\"? This cannot be undone.",
			confirmDeleteMulti: "Delete the selected {count} items? This cannot be undone.",
			created: "Folder created",
			deleted: "Deleted",
			renamed: "Renamed",
			uploadSuccess: "Uploaded {count} files",
			uploadFailed: "Upload failed: {msg}",
			loadFailed: "Failed to load: {msg}",
			openInTerminal: "Open in Terminal",
			invalidName: "Name cannot contain \"/\"",
			folderExists: "Folder already exists",
			noSession: "No active session available",
			uploading: "Uploading... ({current}/{total})",
			downloading: "Downloading...",
			downloadFailed: "Download failed: {msg}"
		}
	};
}));
//#endregion
//#region src/utils/i18n.ts
function setLocale(locale) {
	i18n.global.locale.value = locale;
	localStorage.setItem("aicmd-locale", locale);
}
function getLocale() {
	return i18n.global.locale.value;
}
var savedLocale, i18n;
var init_i18n = __esmMin((() => {
	init_vue_i18n();
	init_zh_CN();
	init_en_US();
	savedLocale = localStorage.getItem("aicmd-locale") || "en-US";
	i18n = createI18n({
		locale: savedLocale,
		fallbackLocale: "en-US",
		legacy: false,
		messages: {
			"zh-CN": zh_CN_default,
			"en-US": en_US_default
		}
	});
}));
//#endregion
//#region \0vite/preload-helper.js
var scriptRel, assetsURL, seen, __vitePreload;
var init_preload_helper = __esmMin((() => {
	scriptRel = "modulepreload";
	assetsURL = function(dep, importerUrl) {
		return new URL(dep, importerUrl).href;
	};
	seen = {};
	__vitePreload = function preload(baseModule, deps, importerUrl) {
		let promise = Promise.resolve();
		if (deps && deps.length > 0) {
			const links = document.getElementsByTagName("link");
			const cspNonceMeta = document.querySelector("meta[property=csp-nonce]");
			const cspNonce = cspNonceMeta?.nonce || cspNonceMeta?.getAttribute("nonce");
			function allSettled(promises) {
				return Promise.all(promises.map((p) => Promise.resolve(p).then((value) => ({
					status: "fulfilled",
					value
				}), (reason) => ({
					status: "rejected",
					reason
				}))));
			}
			function importMetaResolve(specifier) {
				if (import.meta.resolve) return import.meta.resolve(specifier);
				return new URL(
					specifier,
					/** #__KEEP__ */
					import.meta.url
				).href;
			}
			promise = allSettled(deps.map((dep) => {
				dep = assetsURL(dep, importerUrl);
				dep = importMetaResolve(dep);
				if (dep in seen) return;
				seen[dep] = true;
				const isCss = dep.endsWith(".css");
				for (let i = links.length - 1; i >= 0; i--) {
					const link = links[i];
					if (link.href === dep && (!isCss || link.rel === "stylesheet")) return;
				}
				const link = document.createElement("link");
				link.rel = isCss ? "stylesheet" : scriptRel;
				if (!isCss) link.as = "script";
				link.crossOrigin = "";
				link.href = dep;
				if (cspNonce) link.setAttribute("nonce", cspNonce);
				document.head.appendChild(link);
				if (isCss) return new Promise((res, rej) => {
					link.addEventListener("load", res);
					link.addEventListener("error", () => rej(/* @__PURE__ */ new Error(`Unable to preload CSS for ${dep}`)));
				});
			}));
		}
		function handlePreloadError(err) {
			const e = new Event("vite:preloadError", { cancelable: true });
			e.payload = err;
			window.dispatchEvent(e);
			if (!e.defaultPrevented) throw err;
		}
		return promise.then((res) => {
			for (const item of res || []) {
				if (item.status !== "rejected") continue;
				handlePreloadError(item.reason);
			}
			return baseModule().catch(handlePreloadError);
		});
	};
}));
//#endregion
//#region src/platform/router.ts
var router;
var init_router = __esmMin((() => {
	init_vue_router();
	init_core();
	init_ajax();
	init_i18n();
	init_preload_helper();
	router = createRouter({
		history: createWebHistory("./"),
		routes: [{
			path: "/:pathMatch(.*)*",
			name: "terminal",
			component: () => __vitePreload(() => import("./views.js"), __vite__mapDeps([0,1,2,3,4,5]), import.meta.url),
			meta: { titleKey: "app.title" }
		}]
	});
	router.beforeEach((_to, _from, next) => {
		abortAllPending();
		next();
	});
	router.afterEach((to) => {
		if (to.meta?.titleKey) useTitle(i18n.global.t(to.meta.titleKey));
		else if (to.meta?.title) useTitle(to.meta.title);
	});
}));
//#endregion
//#region node_modules/.pnpm/pinia@3.0.4_typescript@5.9.3_vue@3.5.42_typescript@5.9.3_/node_modules/pinia/dist/pinia.mjs
/*!
* pinia v3.0.4
* (c) 2025 Eduardo San Martin Morote
* @license MIT
*/
function isPlainObject(o) {
	return o && typeof o === "object" && Object.prototype.toString.call(o) === "[object Object]" && typeof o.toJSON !== "function";
}
function bom(blob, { autoBom = false } = {}) {
	if (autoBom && /^\s*(?:text\/\S*|application\/xml|\S*\/\S*\+xml)\s*;.*charset\s*=\s*utf-8/i.test(blob.type)) return new Blob([String.fromCharCode(65279), blob], { type: blob.type });
	return blob;
}
function download(url, name, opts) {
	const xhr = new XMLHttpRequest();
	xhr.open("GET", url);
	xhr.responseType = "blob";
	xhr.onload = function() {
		saveAs(xhr.response, name, opts);
	};
	xhr.onerror = function() {
		console.error("could not download file");
	};
	xhr.send();
}
function corsEnabled(url) {
	const xhr = new XMLHttpRequest();
	xhr.open("HEAD", url, false);
	try {
		xhr.send();
	} catch (e) {}
	return xhr.status >= 200 && xhr.status <= 299;
}
function click(node) {
	try {
		node.dispatchEvent(new MouseEvent("click"));
	} catch (e) {
		const evt = new MouseEvent("click", {
			bubbles: true,
			cancelable: true,
			view: window,
			detail: 0,
			screenX: 80,
			screenY: 20,
			clientX: 80,
			clientY: 20,
			ctrlKey: false,
			altKey: false,
			shiftKey: false,
			metaKey: false,
			button: 0,
			relatedTarget: null
		});
		node.dispatchEvent(evt);
	}
}
function downloadSaveAs(blob, name = "download", opts) {
	const a = document.createElement("a");
	a.download = name;
	a.rel = "noopener";
	if (typeof blob === "string") {
		a.href = blob;
		if (a.origin !== location.origin) {
			if (corsEnabled(a.href)) download(blob, name, opts);
			else {
				a.target = "_blank";
				click(a);
			}
		} else click(a);
	} else {
		a.href = URL.createObjectURL(blob);
		setTimeout(function() {
			URL.revokeObjectURL(a.href);
		}, 4e4);
		setTimeout(function() {
			click(a);
		}, 0);
	}
}
function msSaveAs(blob, name = "download", opts) {
	if (typeof blob === "string") {
		if (corsEnabled(blob)) download(blob, name, opts);
		else {
			const a = document.createElement("a");
			a.href = blob;
			a.target = "_blank";
			setTimeout(function() {
				click(a);
			});
		}
	} else navigator.msSaveOrOpenBlob(bom(blob, opts), name);
}
function fileSaverSaveAs(blob, name, opts, popup) {
	popup = popup || open("", "_blank");
	if (popup) popup.document.title = popup.document.body.innerText = "downloading...";
	if (typeof blob === "string") return download(blob, name, opts);
	const force = blob.type === "application/octet-stream";
	const isSafari = /constructor/i.test(String(_global.HTMLElement)) || "safari" in _global;
	const isChromeIOS = /CriOS\/[\d]+/.test(navigator.userAgent);
	if ((isChromeIOS || force && isSafari || isMacOSWebView) && typeof FileReader !== "undefined") {
		const reader = new FileReader();
		reader.onloadend = function() {
			let url = reader.result;
			if (typeof url !== "string") {
				popup = null;
				throw new Error("Wrong reader.result type");
			}
			url = isChromeIOS ? url : url.replace(/^data:[^;]*;/, "data:attachment/file;");
			if (popup) popup.location.href = url;
			else location.assign(url);
			popup = null;
		};
		reader.readAsDataURL(blob);
	} else {
		const url = URL.createObjectURL(blob);
		if (popup) popup.location.assign(url);
		else location.href = url;
		popup = null;
		setTimeout(function() {
			URL.revokeObjectURL(url);
		}, 4e4);
	}
}
/**
* Creates a Pinia instance to be used by the application
*/
function createPinia() {
	const scope = effectScope(true);
	const state = scope.run(() => ref({}));
	let _p = [];
	let toBeInstalled = [];
	const pinia = markRaw({
		install(app) {
			setActivePinia(pinia);
			pinia._a = app;
			app.provide(piniaSymbol, pinia);
			app.config.globalProperties.$pinia = pinia;
			toBeInstalled.forEach((plugin) => _p.push(plugin));
			toBeInstalled = [];
		},
		use(plugin) {
			if (!this._a) toBeInstalled.push(plugin);
			else _p.push(plugin);
			return this;
		},
		_p,
		_a: null,
		_e: scope,
		_s: /* @__PURE__ */ new Map(),
		state
	});
	return pinia;
}
function addSubscription(subscriptions, callback, detached, onCleanup = noop) {
	subscriptions.add(callback);
	const removeSubscription = () => {
		subscriptions.delete(callback) && onCleanup();
	};
	if (!detached && getCurrentScope()) onScopeDispose(removeSubscription);
	return removeSubscription;
}
function triggerSubscriptions(subscriptions, ...args) {
	subscriptions.forEach((callback) => {
		callback(...args);
	});
}
function mergeReactiveObjects(target, patchToApply) {
	if (target instanceof Map && patchToApply instanceof Map) patchToApply.forEach((value, key) => target.set(key, value));
	else if (target instanceof Set && patchToApply instanceof Set) patchToApply.forEach(target.add, target);
	for (const key in patchToApply) {
		if (!patchToApply.hasOwnProperty(key)) continue;
		const subPatch = patchToApply[key];
		const targetValue = target[key];
		if (isPlainObject(targetValue) && isPlainObject(subPatch) && target.hasOwnProperty(key) && !isRef(subPatch) && !isReactive(subPatch)) target[key] = mergeReactiveObjects(targetValue, subPatch);
		else target[key] = subPatch;
	}
	return target;
}
/**
* Returns whether a value should be hydrated
*
* @param obj - target variable
* @returns true if `obj` should be hydrated
*/
function shouldHydrate(obj) {
	return !isPlainObject(obj) || !Object.prototype.hasOwnProperty.call(obj, skipHydrateSymbol);
}
function isComputed(o) {
	return !!(isRef(o) && o.effect);
}
function createOptionsStore(id, options, pinia, hot) {
	const { state, actions, getters } = options;
	const initialState = pinia.state.value[id];
	let store;
	function setup() {
		if (!initialState && true)
 /* istanbul ignore if */
		pinia.state.value[id] = state ? state() : {};
		const localState = toRefs(pinia.state.value[id]);
		return assign(localState, actions, Object.keys(getters || {}).reduce((computedGetters, name) => {
			computedGetters[name] = markRaw(computed(() => {
				setActivePinia(pinia);
				const store = pinia._s.get(id);
				return getters[name].call(store, store);
			}));
			return computedGetters;
		}, {}));
	}
	store = createSetupStore(id, setup, options, pinia, hot, true);
	return store;
}
function createSetupStore($id, setup, options = {}, pinia, hot, isOptionsStore) {
	let scope;
	const optionsForPlugin = assign({ actions: {} }, options);
	const $subscribeOptions = { deep: true };
	let isListening;
	let isSyncListening;
	let subscriptions = /* @__PURE__ */ new Set();
	let actionSubscriptions = /* @__PURE__ */ new Set();
	let debuggerEvents;
	const initialState = pinia.state.value[$id];
	if (!isOptionsStore && !initialState && true)
 /* istanbul ignore if */
	pinia.state.value[$id] = {};
	ref({});
	let activeListener;
	function $patch(partialStateOrMutator) {
		let subscriptionMutation;
		isListening = isSyncListening = false;
		if (typeof partialStateOrMutator === "function") {
			partialStateOrMutator(pinia.state.value[$id]);
			subscriptionMutation = {
				type: MutationType.patchFunction,
				storeId: $id,
				events: debuggerEvents
			};
		} else {
			mergeReactiveObjects(pinia.state.value[$id], partialStateOrMutator);
			subscriptionMutation = {
				type: MutationType.patchObject,
				payload: partialStateOrMutator,
				storeId: $id,
				events: debuggerEvents
			};
		}
		const myListenerId = activeListener = Symbol();
		nextTick().then(() => {
			if (activeListener === myListenerId) isListening = true;
		});
		isSyncListening = true;
		triggerSubscriptions(subscriptions, subscriptionMutation, pinia.state.value[$id]);
	}
	const $reset = isOptionsStore ? function $reset() {
		const { state } = options;
		const newState = state ? state() : {};
		this.$patch(($state) => {
			assign($state, newState);
		});
	} : noop;
	function $dispose() {
		scope.stop();
		subscriptions.clear();
		actionSubscriptions.clear();
		pinia._s.delete($id);
	}
	/**
	* Helper that wraps function so it can be tracked with $onAction
	* @param fn - action to wrap
	* @param name - name of the action
	*/
	const action = (fn, name = "") => {
		if (ACTION_MARKER in fn) {
			fn[ACTION_NAME] = name;
			return fn;
		}
		const wrappedAction = function() {
			setActivePinia(pinia);
			const args = Array.from(arguments);
			const afterCallbackSet = /* @__PURE__ */ new Set();
			const onErrorCallbackSet = /* @__PURE__ */ new Set();
			function after(callback) {
				afterCallbackSet.add(callback);
			}
			function onError(callback) {
				onErrorCallbackSet.add(callback);
			}
			triggerSubscriptions(actionSubscriptions, {
				args,
				name: wrappedAction[ACTION_NAME],
				store,
				after,
				onError
			});
			let ret;
			try {
				ret = fn.apply(this && this.$id === $id ? this : store, args);
			} catch (error) {
				triggerSubscriptions(onErrorCallbackSet, error);
				throw error;
			}
			if (ret instanceof Promise) return ret.then((value) => {
				triggerSubscriptions(afterCallbackSet, value);
				return value;
			}).catch((error) => {
				triggerSubscriptions(onErrorCallbackSet, error);
				return Promise.reject(error);
			});
			triggerSubscriptions(afterCallbackSet, ret);
			return ret;
		};
		wrappedAction[ACTION_MARKER] = true;
		wrappedAction[ACTION_NAME] = name;
		return wrappedAction;
	};
	const partialStore = {
		_p: pinia,
		$id,
		$onAction: addSubscription.bind(null, actionSubscriptions),
		$patch,
		$reset,
		$subscribe(callback, options = {}) {
			const removeSubscription = addSubscription(subscriptions, callback, options.detached, () => stopWatcher());
			const stopWatcher = scope.run(() => watch(() => pinia.state.value[$id], (state) => {
				if (options.flush === "sync" ? isSyncListening : isListening) callback({
					storeId: $id,
					type: MutationType.direct,
					events: debuggerEvents
				}, state);
			}, assign({}, $subscribeOptions, options)));
			return removeSubscription;
		},
		$dispose
	};
	const store = reactive(partialStore);
	pinia._s.set($id, store);
	const setupStore = (pinia._a && pinia._a.runWithContext || fallbackRunWithContext)(() => pinia._e.run(() => (scope = effectScope()).run(() => setup({ action }))));
	for (const key in setupStore) {
		const prop = setupStore[key];
		if (isRef(prop) && !isComputed(prop) || isReactive(prop)) {
			if (!isOptionsStore) {
				if (initialState && shouldHydrate(prop)) {
					if (isRef(prop)) prop.value = initialState[key];
					else mergeReactiveObjects(prop, initialState[key]);
				}
				pinia.state.value[$id][key] = prop;
			}
		} else if (typeof prop === "function") {
			setupStore[key] = action(prop, key);
			optionsForPlugin.actions[key] = prop;
		}
	}
	/* istanbul ignore if */
	assign(store, setupStore);
	assign(toRaw(store), setupStore);
	Object.defineProperty(store, "$state", {
		get: () => pinia.state.value[$id],
		set: (state) => {
			$patch(($state) => {
				assign($state, state);
			});
		}
	});
	pinia._p.forEach((extender) => {
		assign(store, scope.run(() => extender({
			store,
			app: pinia._a,
			pinia,
			options: optionsForPlugin
		})));
	});
	if (initialState && isOptionsStore && options.hydrate) options.hydrate(store.$state, initialState);
	isListening = true;
	isSyncListening = true;
	return store;
}
/*! #__NO_SIDE_EFFECTS__ */
function defineStore(id, setup, setupOptions) {
	let options;
	const isSetupStore = typeof setup === "function";
	options = isSetupStore ? setupOptions : setup;
	function useStore(pinia, hot) {
		const hasContext = hasInjectionContext();
		pinia = pinia || (hasContext ? inject(piniaSymbol, null) : null);
		if (pinia) setActivePinia(pinia);
		pinia = activePinia;
		if (!pinia._s.has(id)) {
			if (isSetupStore) createSetupStore(id, setup, options, pinia);
			else createOptionsStore(id, options, pinia);
		}
		return pinia._s.get(id);
	}
	useStore.$id = id;
	return useStore;
}
var IS_CLIENT, activePinia, setActivePinia, piniaSymbol, MutationType, _global, _navigator, isMacOSWebView, saveAs, assign$1, noop, fallbackRunWithContext, ACTION_MARKER, ACTION_NAME, skipHydrateSymbol, assign;
var init_pinia = __esmMin((() => {
	init_vue_runtime_esm_bundler();
	IS_CLIENT = typeof window !== "undefined";
	setActivePinia = (pinia) => activePinia = pinia;
	piniaSymbol = Symbol();
	(function(MutationType) {
		/**
		* Direct mutation of the state:
		*
		* - `store.name = 'new name'`
		* - `store.$state.name = 'new name'`
		* - `store.list.push('new item')`
		*/
		MutationType["direct"] = "direct";
		/**
		* Mutated the state with `$patch` and an object
		*
		* - `store.$patch({ name: 'newName' })`
		*/
		MutationType["patchObject"] = "patch object";
		/**
		* Mutated the state with `$patch` and a function
		*
		* - `store.$patch(state => state.name = 'newName')`
		*/
		MutationType["patchFunction"] = "patch function";
	})(MutationType || (MutationType = {}));
	_global = /*#__PURE__*/ (() => typeof window === "object" && window.window === window ? window : typeof self === "object" && self.self === self ? self : typeof global === "object" && global.global === global ? global : typeof globalThis === "object" ? globalThis : { HTMLElement: null })();
	_navigator = typeof navigator === "object" ? navigator : { userAgent: "" };
	isMacOSWebView = /*#__PURE__*/ (() => /Macintosh/.test(_navigator.userAgent) && /AppleWebKit/.test(_navigator.userAgent) && !/Safari/.test(_navigator.userAgent))();
	saveAs = !IS_CLIENT ? () => {} : typeof HTMLAnchorElement !== "undefined" && "download" in HTMLAnchorElement.prototype && !isMacOSWebView ? downloadSaveAs : "msSaveOrOpenBlob" in _navigator ? msSaveAs : fileSaverSaveAs;
	({assign: assign$1} = Object);
	noop = () => {};
	fallbackRunWithContext = (fn) => fn();
	ACTION_MARKER = Symbol();
	ACTION_NAME = Symbol();
	skipHydrateSymbol = Symbol();
	({assign} = Object);
}));
//#endregion
//#region src/assets/main.css
var init_main = __esmMin((() => {}));
//#endregion
//#region src/components/toast/toast.vue?vue&type=script&setup=true&lang.ts
var _hoisted_1$2, _hoisted_2$2, _hoisted_3$1, _hoisted_4$1, _hoisted_5$1, toast_vue_vue_type_script_setup_true_lang_default;
var init_toast_vue_vue_type_script_setup_true_lang = __esmMin((() => {
	init_vue_runtime_esm_bundler();
	_hoisted_1$2 = { class: "toast-container position-fixed top-0 start-50 translate-middle-x p-3" };
	_hoisted_2$2 = {
		key: 0,
		class: "toast-header"
	};
	_hoisted_3$1 = { class: "me-auto" };
	_hoisted_4$1 = ["onClick"];
	_hoisted_5$1 = { class: "toast-body" };
	toast_vue_vue_type_script_setup_true_lang_default = /*@__PURE__*/ defineComponent({
		__name: "toast",
		setup(__props, { expose: __expose }) {
			const toasts = reactive([]);
			const addToast = (title, message, type = "success", duration = 3e3) => {
				const toast = {
					title,
					message,
					type,
					removed: false
				};
				toasts.push(toast);
				setTimeout(() => removeToast(toast), duration);
			};
			const removeToast = (toast) => {
				const index = toasts.indexOf(toast);
				if (index < 0) return;
				toasts[index].removed = true;
				setTimeout(() => {
					toasts.splice(index, 1);
				}, 1e3);
			};
			__expose({ addToast });
			return (_ctx, _cache) => {
				return openBlock(), createElementBlock("div", _hoisted_1$2, [(openBlock(true), createElementBlock(Fragment, null, renderList(toasts, (toast, index) => {
					return openBlock(), createElementBlock("div", {
						class: normalizeClass(`toast show bg-${toast.type === "error" ? "danger" : toast.type}-subtle ${toast.removed ? "fade-out" : ""}`),
						role: "alert",
						key: index
					}, [toast.title ? (openBlock(), createElementBlock("div", _hoisted_2$2, [createBaseVNode("strong", _hoisted_3$1, toDisplayString(toast.title), 1), createBaseVNode("button", {
						type: "button",
						class: "btn-close",
						onClick: ($event) => removeToast(index)
					}, null, 8, _hoisted_4$1)])) : createCommentVNode("", true), createBaseVNode("div", _hoisted_5$1, toDisplayString(toast.message), 1)], 2);
				}), 128))]);
			};
		}
	});
}));
//#endregion
//#region src/components/toast/toast.vue?vue&type=style&index=0&scoped=c107e129&lang.css
var init_toast_vue_vue_type_style_index_0_scoped_c107e129_lang = __esmMin((() => {}));
//#endregion
//#region \0plugin-vue:export-helper
var _plugin_vue_export_helper_default;
var init__plugin_vue_export_helper = __esmMin((() => {
	_plugin_vue_export_helper_default = (sfc, props) => {
		const target = sfc.__vccOpts || sfc;
		for (const [key, val] of props) target[key] = val;
		return target;
	};
}));
//#endregion
//#region src/components/toast/toast.vue
var toast_default$1;
var init_toast$1 = __esmMin((() => {
	init_toast_vue_vue_type_script_setup_true_lang();
	init_toast_vue_vue_type_script_setup_true_lang();
	init_toast_vue_vue_type_style_index_0_scoped_c107e129_lang();
	init__plugin_vue_export_helper();
	toast_default$1 = /*#__PURE__*/ _plugin_vue_export_helper_default(toast_vue_vue_type_script_setup_true_lang_default, [["__scopeId", "data-v-c107e129"]]);
}));
//#endregion
//#region src/components/toast/index.ts
var toast_default;
var init_toast = __esmMin((() => {
	init_vue_runtime_esm_bundler();
	init_toast$1();
	init_toast$2();
	init_i18n();
	toast_default = {
		install(app) {
			const toastMount = document.createElement("div");
			document.body.appendChild(toastMount);
			const toastApp = createApp(toast_default$1);
			toastApp.use(i18n);
			const toastInstance = toastApp.mount(toastMount);
			const toastMethods = {
				show: (message, title, type, duration = 3e3) => toastInstance.addToast(title, message, type, duration),
				success: (msg, title, duration = 3e3) => toastInstance.addToast(title, msg, "success", duration),
				error: (msg, title, duration = 3e3) => toastInstance.addToast(title, msg, "danger", duration),
				warning: (msg, title, duration = 3e3) => toastInstance.addToast(title, msg, "warning", duration),
				info: (msg, title, duration = 3e3) => toastInstance.addToast(title, msg, "info", duration)
			};
			setGlobalToast(toastMethods);
			app.config.globalProperties.$toast = toastMethods;
		},
		getToast() {
			const instance = getCurrentInstance();
			if (!instance) return null;
			return instance.appContext.config?.globalProperties?.$toast;
		}
	};
}));
//#endregion
//#region src/components/loading/index.vue?vue&type=script&setup=true&lang.ts
var _hoisted_1$1, _hoisted_2$1, index_vue_vue_type_script_setup_true_lang_default$1;
var init_index_vue_vue_type_script_setup_true_lang$1 = __esmMin((() => {
	init_vue_runtime_esm_bundler();
	_hoisted_1$1 = {
		key: 0,
		class: "loading-overlay"
	};
	_hoisted_2$1 = {
		key: 0,
		class: "m-3 text-primary"
	};
	index_vue_vue_type_script_setup_true_lang_default$1 = /*@__PURE__*/ defineComponent({
		__name: "index",
		props: {
			isLoading: {
				type: Boolean,
				default: false
			},
			message: {
				type: String,
				default: "加载中..."
			}
		},
		setup(__props) {
			return (_ctx, _cache) => {
				return __props.isLoading ? (openBlock(), createElementBlock("div", _hoisted_1$1, [_cache[0] || (_cache[0] = createBaseVNode("div", { class: "loading-spinner" }, [createBaseVNode("div", {
					class: "spinner-border text-primary",
					role: "status"
				}, [createBaseVNode("span", { class: "visually-hidden" }, "Loading...")])], -1)), __props.message ? (openBlock(), createElementBlock("p", _hoisted_2$1, toDisplayString(__props.message), 1)) : createCommentVNode("", true)])) : createCommentVNode("", true);
			};
		}
	});
}));
//#endregion
//#region src/components/loading/index.vue?vue&type=style&index=0&scoped=9c56e9be&lang.css
var init_index_vue_vue_type_style_index_0_scoped_9c56e9be_lang = __esmMin((() => {}));
//#endregion
//#region src/components/loading/index.vue
var loading_default;
var init_loading = __esmMin((() => {
	init_index_vue_vue_type_script_setup_true_lang$1();
	init_index_vue_vue_type_script_setup_true_lang$1();
	init_index_vue_vue_type_style_index_0_scoped_9c56e9be_lang();
	init__plugin_vue_export_helper();
	loading_default = /*#__PURE__*/ _plugin_vue_export_helper_default(index_vue_vue_type_script_setup_true_lang_default$1, [["__scopeId", "data-v-9c56e9be"]]);
}));
//#endregion
//#region src/components/modal/index.vue?vue&type=script&setup=true&lang.ts
var _hoisted_1, _hoisted_2, _hoisted_3, _hoisted_4, _hoisted_5, _hoisted_6, index_vue_vue_type_script_setup_true_lang_default;
var init_index_vue_vue_type_script_setup_true_lang = __esmMin((() => {
	init_vue_runtime_esm_bundler();
	init_bootstrap_esm();
	init_loading();
	init_vue_i18n();
	_hoisted_1 = {
		class: "modal-title d-flex align-items-center",
		id: "modalLabel"
	};
	_hoisted_2 = {
		key: 0,
		class: "modal-body text-wrap"
	};
	_hoisted_3 = { key: 1 };
	_hoisted_4 = { class: "d-flex align-items-center mb-3" };
	_hoisted_5 = { class: "flex-grow-1 text-wrap" };
	_hoisted_6 = { class: "modal-footer" };
	index_vue_vue_type_script_setup_true_lang_default = /*@__PURE__*/ defineComponent({
		__name: "index",
		props: {
			title: {
				type: String,
				default: ""
			},
			closeButton: {
				type: Object,
				default: () => ({
					text: "",
					show: false
				})
			},
			confirmButton: {
				type: Object,
				default: () => ({
					text: "",
					show: true
				})
			},
			isLoading: {
				type: Boolean,
				default: false
			},
			loadingMessage: {
				type: String,
				default: ""
			},
			visible: {
				type: Boolean,
				default: false
			},
			isFullScreen: {
				type: Boolean,
				default: false
			},
			dialogStyle: {
				type: Object,
				default: () => ({})
			}
		},
		emits: [
			"onConfirm",
			"onClose",
			"onCancel",
			"onHidden"
		],
		setup(__props, { expose: __expose, emit: __emit }) {
			const { t } = useI18n();
			const modalId = `modal-${Date.now()}-${Math.floor(Math.random() * 1e3)}`;
			const props = __props;
			const dynamicOptions = ref({});
			const dynamicTitle = ref("");
			const dynamicContent = ref("");
			const dynamicType = ref("");
			const dynamicConfirmText = ref("");
			const dynamicCancelText = ref("");
			const dynamicShowCancel = ref(false);
			const typeIcon = computed(() => {
				return {
					success: "bi bi-check-circle-fill text-success",
					error: "bi bi-x-circle-fill text-danger",
					warning: "bi bi-exclamation-triangle-fill text-warning",
					info: "bi bi-info-circle-fill text-info"
				}[dynamicType.value] || "";
			});
			const headerClass = computed(() => {
				return {
					success: "bg-success text-white",
					error: "bg-danger text-white",
					warning: "bg-warning text-dark",
					info: "bg-info text-white"
				}[dynamicType.value] || "";
			});
			const contentClass = computed(() => dynamicType.value ? `modal-${dynamicType.value}` : "");
			const confirmButtonClass = computed(() => {
				return {
					success: "btn-success",
					error: "btn-danger",
					warning: "btn-warning",
					info: "btn-info"
				}[dynamicType.value] || "btn-primary";
			});
			const emits = __emit;
			const modalShow = ref(false);
			const modalContainer = ref(null);
			let modal = null;
			function getModal() {
				if (modal) return modal;
				if (!modalContainer.value) return null;
				const m = new Modal(modalContainer.value, {
					backdrop: "static",
					keyboard: false
				});
				modalContainer.value.addEventListener("hidden.bs.modal", () => {
					modalShow.value = false;
					emits("onHidden");
				});
				modalContainer.value.addEventListener("show.bs.modal", () => {
					modalShow.value = true;
				});
				return m;
			}
			function show() {
				const m = getModal();
				if (m) {
					m.show();
					return Promise.resolve();
				}
				return Promise.resolve();
			}
			function hide() {
				const m = getModal();
				if (m) m.hide();
				return Promise.resolve();
			}
			function confirm() {
				document.activeElement?.blur?.();
				emits("onConfirm");
				dynamicOptions.value?.onConfirm?.();
			}
			function cancel() {
				document.activeElement?.blur?.();
				hide();
				emits("onCancel");
				dynamicOptions.value?.onCancel?.();
			}
			watch(() => props.visible, (visible) => {
				visible ? show() : hide();
			});
			onMounted(() => {
				modal = getModal();
			});
			onUnmounted(() => {
				if (modal) modal.dispose();
			});
			__expose({
				show,
				open: show,
				hide,
				close: hide,
				modalId,
				setTitle: (t) => dynamicTitle.value = t,
				setContent: (c) => dynamicContent.value = c,
				setType: (t) => dynamicType.value = t,
				setConfirmText: (t) => dynamicConfirmText.value = t,
				setCancelText: (t) => dynamicCancelText.value = t,
				setShowCancel: (s) => dynamicShowCancel.value = s,
				setOptions: (options) => {
					if (options.title) dynamicTitle.value = options.title;
					if (options.content) dynamicContent.value = options.content;
					if (options.type) dynamicType.value = options.type;
					if (options.confirmText) dynamicConfirmText.value = options.confirmText;
					if (options.cancelText) dynamicCancelText.value = options.cancelText;
					if (options.showCancel !== void 0) dynamicShowCancel.value = options.showCancel;
					dynamicOptions.value = options;
				}
			});
			return (_ctx, _cache) => {
				return openBlock(), createElementBlock("div", {
					class: "modal fade",
					id: modalId,
					ref_key: "modalContainer",
					ref: modalContainer,
					tabindex: "-1",
					"aria-labelledby": "modalLabel"
				}, [createBaseVNode("div", {
					class: normalizeClass(["modal-dialog modal-dialog-centered", { "modal-fullscreen": __props.isFullScreen }]),
					style: normalizeStyle(__props.dialogStyle)
				}, [createBaseVNode("div", { class: normalizeClass(["modal-content", contentClass.value]) }, [
					createBaseVNode("div", { class: normalizeClass(["modal-header", headerClass.value]) }, [createBaseVNode("h5", _hoisted_1, [typeIcon.value ? (openBlock(), createElementBlock("i", {
						key: 0,
						class: normalizeClass([typeIcon.value, "me-2"])
					}, null, 2)) : createCommentVNode("", true), createTextVNode(" " + toDisplayString(dynamicTitle.value || props.title), 1)]), createBaseVNode("button", {
						type: "button",
						class: "btn-close",
						"aria-label": "Close",
						onClick: cancel
					})], 2),
					modalShow.value ? (openBlock(), createElementBlock("div", _hoisted_2, [_ctx.$slots.default ? renderSlot(_ctx.$slots, "default", {}, void 0, true, 0) : (openBlock(), createElementBlock("div", _hoisted_3, [createBaseVNode("div", _hoisted_4, [typeIcon.value ? (openBlock(), createElementBlock("i", {
						key: 0,
						class: normalizeClass([typeIcon.value, "me-3 fs-1"])
					}, null, 2)) : createCommentVNode("", true), createBaseVNode("div", _hoisted_5, toDisplayString(dynamicContent.value), 1)])]))])) : createCommentVNode("", true),
					createBaseVNode("div", _hoisted_6, [_ctx.$slots.footer ? renderSlot(_ctx.$slots, "footer", {}, void 0, true, 0) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [dynamicShowCancel.value || props.closeButton.show ? (openBlock(), createElementBlock("button", {
						key: 0,
						type: "button",
						class: "btn btn-secondary",
						onClick: cancel
					}, toDisplayString(dynamicCancelText.value || props.closeButton.text || unref(t)("modal.close")), 1)) : createCommentVNode("", true), props.confirmButton.show ? (openBlock(), createElementBlock("button", {
						key: 1,
						type: "button",
						class: normalizeClass(["btn", confirmButtonClass.value]),
						onClick: confirm
					}, toDisplayString(dynamicConfirmText.value || props.confirmButton.text || unref(t)("modal.confirm")), 3)) : createCommentVNode("", true)], 64))]),
					createVNode(loading_default, {
						isLoading: props.isLoading,
						message: props.loadingMessage || unref(t)("modal.processing")
					}, null, 8, ["isLoading", "message"])
				], 2)], 6)], 512);
			};
		}
	});
}));
//#endregion
//#region src/components/modal/index.vue?vue&type=style&index=0&scoped=4d31732a&lang.css
var init_index_vue_vue_type_style_index_0_scoped_4d31732a_lang = __esmMin((() => {}));
//#endregion
//#region src/components/modal/index.vue
var modal_default$1;
var init_modal$1 = __esmMin((() => {
	init_index_vue_vue_type_script_setup_true_lang();
	init_index_vue_vue_type_script_setup_true_lang();
	init_index_vue_vue_type_style_index_0_scoped_4d31732a_lang();
	init__plugin_vue_export_helper();
	modal_default$1 = /*#__PURE__*/ _plugin_vue_export_helper_default(index_vue_vue_type_script_setup_true_lang_default, [["__scopeId", "data-v-4d31732a"]]);
}));
//#endregion
//#region src/components/modal/index.ts
var t, globalModalInstance, modalInstance, modal_default, getModalInstance, showModal, showAlert, showConfirm;
var init_modal = __esmMin((() => {
	init_vue_runtime_esm_bundler();
	init_modal$1();
	init_i18n();
	t = (key) => i18n.global.t(key);
	globalModalInstance = null;
	modal_default = {
		install(app) {
			const mount = document.createElement("div");
			document.body.appendChild(mount);
			const modalApp = createApp(modal_default$1);
			modalApp.use(i18n);
			globalModalInstance = modalApp.mount(mount);
			app.config.globalProperties.$modal = modalInstance = {
				show: () => globalModalInstance.show(),
				hide: () => globalModalInstance.hide(),
				open: () => globalModalInstance.show(),
				close: () => globalModalInstance.hide(),
				alert(options) {
					const opts = typeof options === "string" ? {
						content: options,
						type: "info",
						showCancel: false
					} : {
						...options,
						showCancel: false
					};
					return showModal(opts);
				},
				confirm(options) {
					const opts = typeof options === "string" ? {
						content: options,
						type: "warning"
					} : {
						...options,
						showCancel: true
					};
					return showModal(opts);
				},
				success(content) {
					return this.alert({
						content,
						type: "success"
					});
				},
				error(content, details) {
					return this.alert({
						content,
						type: "error",
						details
					});
				},
				warning(content) {
					return this.alert({
						content,
						type: "warning"
					});
				},
				info(content) {
					return this.alert({
						content,
						type: "info"
					});
				}
			};
		},
		get() {
			const instance = getCurrentInstance();
			if (!instance) return null;
			return instance.appContext.config?.globalProperties?.$modal;
		}
	};
	getModalInstance = () => modalInstance;
	showModal = (options) => {
		if (!globalModalInstance) return Promise.resolve(false);
		return new Promise((resolve) => {
			const finalOptions = {
				title: t("toast.info"),
				confirmText: t("common.confirm"),
				cancelText: t("common.cancel"),
				showCancel: false,
				type: "info",
				...options,
				onConfirm: () => {
					options.onConfirm?.();
					globalModalInstance.hide();
					nextTick(() => resolve(true));
				},
				onCancel: () => {
					options.onCancel?.();
					globalModalInstance.hide();
					nextTick(() => resolve(false));
				}
			};
			globalModalInstance.setOptions?.(finalOptions);
			globalModalInstance.show?.();
		});
	};
	showAlert = (content, type = "info", details) => {
		return showModal({
			content,
			type,
			showCancel: false,
			details
		});
	};
	showConfirm = (content, options) => {
		return showModal({
			title: t("common.confirm"),
			content,
			type: "warning",
			showCancel: true,
			...options
		});
	};
}));
(/* @__PURE__ */ __commonJSMin((() => {
	init_vue_runtime_esm_bundler();
	init_App();
	init_router();
	init_pinia();
	init_i18n();
	init_bootstrap();
	init_bootstrap_icons();
	init_main();
	init_bootstrap_esm();
	init_toast();
	init_modal();
	var app = createApp(App_default);
	var pinia = createPinia();
	app.use(router);
	app.use(pinia);
	app.use(i18n);
	app.use(toast_default);
	app.use(modal_default);
	app.mount("#app");
})))();
//#endregion
export { subscribe as C, init_eventBus as S, init_axios as _, init_modal$1 as a, init_toast$2 as b, init__plugin_vue_export_helper as c, getLocale as d, i18n as f, init_config as g, config_default as h, showConfirm as i, defineStore as l, setLocale as m, init_modal as n, modal_default$1 as o, init_i18n as p, showAlert as r, _plugin_vue_export_helper_default as s, getModalInstance as t, init_pinia as u, axios as v, unsubscribe as w, toast as x, init_axios$1 as y };
