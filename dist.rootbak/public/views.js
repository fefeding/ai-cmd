import { i as __toESM, n as __esmMin, t as __commonJSMin } from "./rolldown-runtime.js";
import { C as createBlock, D as createVNode, E as createTextVNode, F as onMounted, H as withCtx, L as openBlock, N as nextTick, O as defineComponent, P as onBeforeUnmount, Q as ref, R as renderList, S as createBaseVNode, T as createElementBlock, U as withDirectives, V as watch, Z as reactive, _ as vShow, at as toDisplayString, b as Fragment, c as useI18n, f as vModelCheckbox, g as vModelText, h as vModelSelect, it as normalizeStyle, l as init_vue_runtime_esm_bundler, m as vModelRadio, p as vModelDynamic, rt as normalizeClass, s as init_vue_i18n, tt as unref, v as withKeys, w as createCommentVNode, x as computed, y as withModifiers } from "./vue.js";
import { C as subscribe, S as init_eventBus, _ as init_axios, a as init_modal$2, b as init_toast, c as init__plugin_vue_export_helper, d as getLocale, f as i18n, g as init_config, h as config_default, i as showConfirm, l as defineStore, m as setLocale, n as init_modal$1, o as modal_default, p as init_i18n, r as showAlert, s as _plugin_vue_export_helper_default, t as getModalInstance, u as init_pinia, v as axios$1, w as unsubscribe, x as toast } from "./index.js";
import { i as require_xterm, n as require_addon_web_links, r as require_addon_fit, t as init_xterm } from "./xterm.js";
//#region src/utils/request.ts
async function request$1(url, data, option) {
	option = {
		method: "POST",
		withCredentials: true,
		...option,
		headers: { ...option?.headers || {} }
	};
	let res;
	if (option.method === "GET" || option.method === "get") res = await axios.get(url, {
		...option,
		params: {
			...option.params || {},
			...data || {}
		}
	});
	else res = await axios.post(url, data, option);
	return res;
}
var axios;
var init_request = __esmMin((() => {
	init_axios();
	axios = axios$1.create();
})), isNWjs, isVSCode, isChromeExtension, isElectron, isBrowser, UA;
var init_detect = __esmMin((() => {
	isNWjs = typeof process !== "undefined" && process.__nwjs !== void 0;
	isVSCode = typeof acquireVsCodeApi !== "undefined" || typeof process !== "undefined" && {}.VSCODE_PID;
	isChromeExtension = !isNWjs && !isVSCode && (() => {
		try {
			return typeof chrome !== "undefined" && Boolean(chrome?.runtime) && Boolean(chrome?.runtime?.id);
		} catch (e) {
			return false;
		}
	})();
	isElectron = typeof process === "object" && process.versions?.electron !== void 0 || Boolean(typeof window !== "undefined" && window.electronAPI?.isElectron);
	isBrowser = typeof window !== "undefined" && !isNWjs && !isVSCode && !isChromeExtension && !isElectron;
	isBrowser && window.top;
	UA = isBrowser ? navigator.userAgent : "";
	/Mobile/i.test(UA);
	/Windows/i.test(UA);
}));
//#endregion
//#region src/service/base.ts
function getRequestUrl(api) {
	if (/^(http(s)?:)?\/\//.test(api)) return api;
	return `${(config_default.apiUrl || `${location.protocol}//${location.hostname}${[80, 443].includes(Number(location.port)) ? "" : ":" + location.port}`).trim()}${config_default.prefix}${api}`;
}
async function requestServer(url, data, option) {
	if (isElectron && window.electronAPI?.isPackaged) try {
		const apiPath = url.replace(/^(http(s)?:)?\/\//, "").replace(/.*?\/api\//, "/api/");
		console.log(`[requestServer] Calling API via IPC: ${apiPath}`);
		return {
			status: 200,
			statusText: "OK",
			data: await window.electronAPI?.api.request(apiPath, data)
		};
	} catch (error) {
		console.error(`[requestServer] ERROR: ${error.message}`);
		console.error(error.stack);
		return {
			status: 500,
			statusText: "Error",
			data: {
				ret: 500,
				msg: error.message || "执行失败"
			}
		};
	}
	else {
		url = getRequestUrl(url);
		return request$1(url, data, option);
	}
}
async function request(url, data, option) {
	const res = await requestServer(url, data, option);
	if (!res || res instanceof Array) return res;
	if (typeof res !== "object") return res;
	if (res.status !== 200) throw {
		ret: res.status,
		msg: res.data?.msg || res.statusText
	};
	return res.data;
}
var init_base = __esmMin((() => {
	init_request();
	init_config();
	init_detect();
}));
//#endregion
//#region src/service/connection.ts
var ConnectionService;
var init_connection = __esmMin((() => {
	init_base();
	ConnectionService = class {
		async getAllConnections() {
			return request("/api/connection/getConnections", {});
		}
		async getConnectionById(id) {
			return request("/api/connection/getConnection", { id });
		}
		async addConnection(connection) {
			return request("/api/connection/addConnection", connection);
		}
		async updateConnection(id, updates) {
			return request("/api/connection/updateConnection", {
				id,
				...updates
			});
		}
		async deleteConnection(id) {
			return request("/api/connection/deleteConnection", { id });
		}
		async testConnection(connection) {
			return request("/api/connection/testConnection", connection);
		}
	};
}));
//#endregion
//#region src/utils/modal.ts
var ModalHelper, modal;
var init_modal = __esmMin((() => {
	init_vue_runtime_esm_bundler();
	init_modal$1();
	ModalHelper = class {
		getModal() {
			return getModalInstance() || null;
		}
		success(content) {
			return this.getModal()?.success(content) || showAlert(content, "success") || Promise.resolve(true);
		}
		error(content, detail) {
			const msg = content instanceof Error ? content.message : String(content);
			return this.getModal()?.error(msg, detail) || showAlert(msg, "error", detail) || Promise.resolve(true);
		}
		warning(content) {
			return this.getModal()?.warning(content) || showAlert(content, "warning") || Promise.resolve(true);
		}
		info(content) {
			return this.getModal()?.info(content) || showAlert(content, "info") || Promise.resolve(true);
		}
		alert(content) {
			return this.getModal()?.alert(content) || showAlert(content, "info") || Promise.resolve(true);
		}
		confirm(content, options) {
			return this.getModal()?.confirm({
				...options,
				content
			}) || showConfirm(content, options) || Promise.resolve(false);
		}
	};
	modal = new ModalHelper();
}));
//#endregion
//#region src/service/terminal.ts
/**
* 解包 API 响应
*/
function unwrap$5(res) {
	if (res && typeof res === "object" && "ret" in res) {
		if (res.ret !== 0) throw new Error(res.msg || "请求失败");
		return res.data;
	}
	return res;
}
function getSessions() {
	return request("/api/terminal/getSessions", {}).then(unwrap$5);
}
function renameSession(sessionId, name) {
	return request("/api/terminal/renameSession", {
		sessionId,
		name
	}).then(unwrap$5);
}
function deleteSession(sessionId) {
	return request("/api/terminal/deleteSession", { sessionId }).then(unwrap$5);
}
var init_terminal$1 = __esmMin((() => {
	init_base();
}));
//#endregion
//#region src/stores/terminal.ts
function getDefaultState() {
	return {
		connections: [],
		tabs: [],
		activeTabId: null,
		loading: false,
		sidebarCollapsed: false
	};
}
var t, connectionService, useTerminalStore;
var init_terminal = __esmMin((() => {
	init_pinia();
	init_connection();
	init_toast();
	init_modal();
	init_terminal$1();
	init_i18n();
	t = (key) => i18n.global.t(key);
	connectionService = new ConnectionService();
	useTerminalStore = defineStore("terminal", {
		state: () => getDefaultState(),
		getters: {
			activeTab: (state) => state.tabs.find((t) => t.id === state.activeTabId) || null,
			tabCount: (state) => state.tabs.length,
			connectionCount: (state) => state.connections.length
		},
		actions: {
			async loadConnections() {
				this.loading = true;
				try {
					const result = await connectionService.getAllConnections();
					if (result?.ret === 0) this.connections = result.data || [];
					else if (Array.isArray(result)) this.connections = result;
				} catch (e) {
					toast.error(e.message || t("sidebar.loadFailed"));
				} finally {
					this.loading = false;
				}
			},
			async addConnection(connection) {
				return connectionService.addConnection(connection);
			},
			async updateConnection(id, updates) {
				return connectionService.updateConnection(id, updates);
			},
			async deleteConnection(id) {
				if (!await modal.confirm(t("sidebar.deleteConfirm"))) return false;
				try {
					await connectionService.deleteConnection(id);
					this.connections = this.connections.filter((c) => c.id !== id);
					this.tabs = this.tabs.filter((t) => t.connectionId !== id);
					toast.success(t("sidebar.deleted"));
					return true;
				} catch (e) {
					toast.error(e.message || t("sidebar.deleteFailed"));
					return false;
				}
			},
			openTab(connection, customName) {
				const tabId = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
				const tab = {
					id: tabId,
					connectionId: connection.id || "",
					connectionName: customName || connection.name,
					status: "connecting",
					cols: connection.terminal?.cols || 80,
					rows: connection.terminal?.rows || 24
				};
				this.tabs.push(tab);
				this.activeTabId = tabId;
				return tab;
			},
			async closeTab(tabId) {
				const tab = this.tabs.find((t) => t.id === tabId);
				if (tab?.sessionId) try {
					await deleteSession(tab.sessionId);
				} catch (e) {
					console.warn("删除 session 失败:", e);
				}
				const index = this.tabs.findIndex((t) => t.id === tabId);
				if (index === -1) return;
				this.tabs.splice(index, 1);
				if (this.activeTabId === tabId) this.activeTabId = this.tabs.length > 0 ? this.tabs[Math.min(index, this.tabs.length - 1)]?.id || null : null;
			},
			updateTabStatus(tabId, status, sessionId) {
				const tab = this.tabs.find((t) => t.id === tabId);
				if (tab) {
					tab.status = status;
					if (sessionId) tab.sessionId = sessionId;
				}
			},
			switchTab(tabId) {
				this.activeTabId = tabId;
				this.saveTabs();
			},
			toggleSidebar() {
				this.sidebarCollapsed = !this.sidebarCollapsed;
			},
			async cloneTab(tabId) {
				const tab = this.tabs.find((t) => t.id === tabId);
				if (!tab) return;
				if (tab.connectionId === "__local__") this.openLocalShell(tab.connectionName);
				else {
					const conn = this.connections.find((c) => c.id === tab.connectionId);
					if (conn) this.openTab(conn, `${tab.connectionName} - ${t("common.copySuffix")}`);
				}
			},
			async closeOtherTabs(excludeTabId) {
				const tabsToClose = this.tabs.filter((t) => t.id !== excludeTabId);
				for (const tab of tabsToClose) if (tab.sessionId) try {
					await deleteSession(tab.sessionId);
				} catch (e) {
					console.warn("删除 session 失败:", e);
				}
				this.tabs = this.tabs.filter((t) => t.id === excludeTabId);
				this.activeTabId = excludeTabId;
			},
			async closeAllTabs() {
				for (const tab of this.tabs) if (tab.sessionId) try {
					await deleteSession(tab.sessionId);
				} catch (e) {
					console.warn("删除 session 失败:", e);
				}
				this.tabs = [];
				this.activeTabId = null;
			},
			async renameTab(tabId, newName) {
				const tab = this.tabs.find((t) => t.id === tabId);
				if (!tab) return;
				tab.connectionName = newName;
				if (tab.sessionId) try {
					await renameSession(tab.sessionId, newName);
				} catch (e) {
					console.warn("重命名 session 失败:", e);
				}
			},
			saveTabs() {},
			async restoreTabs() {},
			openLocalShell(customName) {
				const LOCAL_SHELL_ID = "__local__";
				const localCount = this.tabs.filter((t) => t.connectionId === LOCAL_SHELL_ID).length;
				const tabName = customName || (localCount === 0 ? t("app.localShell") : `${t("app.localShell")} ${localCount + 1}`);
				const tabId = `tab-local-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
				const tab = {
					id: tabId,
					connectionId: LOCAL_SHELL_ID,
					connectionName: tabName,
					status: "connecting",
					cols: 80,
					rows: 24
				};
				this.tabs.push(tab);
				this.activeTabId = tabId;
				return tab;
			},
			getLocalShellConnection() {
				return {
					id: "__local__",
					name: t("app.localShell"),
					type: "local",
					host: "",
					username: "",
					shell: "",
					terminal: {
						cols: 80,
						rows: 24,
						fontSize: 14,
						fontFamily: "Menlo, Monaco, \"Courier New\", monospace",
						theme: "dark",
						cursorStyle: "block"
					}
				};
			}
		}
	});
}));
//#endregion
//#region src/components/terminal-sidebar.vue?vue&type=script&setup=true&lang.ts
var _hoisted_1$10, _hoisted_2$10, _hoisted_3$9, _hoisted_4$9, _hoisted_5$9, _hoisted_6$9, _hoisted_7$9, _hoisted_8$9, _hoisted_9$9, _hoisted_10$9, _hoisted_11$9, _hoisted_12$9, _hoisted_13$9, _hoisted_14$9, _hoisted_15$9, _hoisted_16$9, _hoisted_17$8, _hoisted_18$8, _hoisted_19$8, _hoisted_20$8, _hoisted_21$7, _hoisted_22$7, _hoisted_23$7, _hoisted_24$7, terminal_sidebar_vue_vue_type_script_setup_true_lang_default;
var init_terminal_sidebar_vue_vue_type_script_setup_true_lang = __esmMin((() => {
	init_vue_runtime_esm_bundler();
	init_vue_i18n();
	init_i18n();
	_hoisted_1$10 = {
		class: "d-flex align-items-center justify-content-between p-2 border-bottom",
		style: { "border-color": "var(--border-color) !important" }
	};
	_hoisted_2$10 = { class: "d-flex gap-1" };
	_hoisted_3$9 = ["title"];
	_hoisted_4$9 = ["title"];
	_hoisted_5$9 = ["title"];
	_hoisted_6$9 = { class: "p-2" };
	_hoisted_7$9 = ["placeholder"];
	_hoisted_8$9 = { class: "flex-grow-1 overflow-auto" };
	_hoisted_9$9 = {
		key: 0,
		class: "text-center p-4",
		style: { "color": "var(--text-secondary)" }
	};
	_hoisted_10$9 = {
		key: 1,
		class: "text-center p-4",
		style: { "color": "var(--text-secondary)" }
	};
	_hoisted_11$9 = { class: "mt-2" };
	_hoisted_12$9 = { key: 2 };
	_hoisted_13$9 = ["onDblclick", "onContextmenu"];
	_hoisted_14$9 = { class: "flex-grow-1 overflow-hidden" };
	_hoisted_15$9 = {
		class: "text-truncate",
		style: { "font-size": "13px" }
	};
	_hoisted_16$9 = {
		class: "text-truncate",
		style: {
			"font-size": "11px",
			"color": "var(--text-secondary)"
		}
	};
	_hoisted_17$8 = ["onClick", "title"];
	_hoisted_18$8 = ["onClick", "title"];
	_hoisted_19$8 = ["onClick", "title"];
	_hoisted_20$8 = {
		class: "p-2 text-center d-flex align-items-center justify-content-between",
		style: {
			"font-size": "11px",
			"color": "var(--text-secondary)",
			"border-top": "1px solid var(--border-color)"
		}
	};
	_hoisted_21$7 = { class: "d-flex gap-1 align-items-center" };
	_hoisted_22$7 = ["title"];
	_hoisted_23$7 = ["title"];
	_hoisted_24$7 = ["title"];
	terminal_sidebar_vue_vue_type_script_setup_true_lang_default = /*@__PURE__*/ defineComponent({
		__name: "terminal-sidebar",
		props: {
			connections: {},
			loading: { type: Boolean },
			collapsed: { type: Boolean }
		},
		emits: [
			"connect",
			"add-connection",
			"edit-connection",
			"delete-connection",
			"refresh",
			"toggle-sidebar",
			"open-ai-settings",
			"open-batch"
		],
		setup(__props) {
			const { t } = useI18n();
			const currentLocale = ref(getLocale());
			function toggleLocale() {
				const next = currentLocale.value === "zh-CN" ? "en-US" : "zh-CN";
				currentLocale.value = next;
				setLocale(next);
			}
			const props = __props;
			const searchQuery = ref("");
			const filteredConnections = computed(() => {
				if (!searchQuery.value) return props.connections;
				const q = searchQuery.value.toLowerCase();
				return props.connections.filter((c) => c.name.toLowerCase().includes(q) || c.host.toLowerCase().includes(q) || c.username.toLowerCase().includes(q));
			});
			return (_ctx, _cache) => {
				return openBlock(), createElementBlock("div", {
					class: "sidebar d-flex flex-column",
					style: normalizeStyle({ width: __props.collapsed ? "0px" : "var(--sidebar-width)" })
				}, [
					createBaseVNode("div", _hoisted_1$10, [_cache[11] || (_cache[11] = createBaseVNode("span", {
						class: "fw-bold",
						style: { "color": "var(--accent)" }
					}, [createBaseVNode("i", { class: "bi bi-terminal me-1" }), createTextVNode("aicmd ")], -1)), createBaseVNode("div", _hoisted_2$10, [
						createBaseVNode("button", {
							class: "btn-toolbar",
							onClick: _cache[0] || (_cache[0] = ($event) => _ctx.$emit("add-connection")),
							title: unref(t)("app.addConnection")
						}, [..._cache[8] || (_cache[8] = [createBaseVNode("i", { class: "bi bi-plus-lg" }, null, -1)])], 8, _hoisted_3$9),
						createBaseVNode("button", {
							class: "btn-toolbar",
							onClick: _cache[1] || (_cache[1] = ($event) => _ctx.$emit("refresh")),
							title: unref(t)("common.refresh")
						}, [..._cache[9] || (_cache[9] = [createBaseVNode("i", { class: "bi bi-arrow-clockwise" }, null, -1)])], 8, _hoisted_4$9),
						createBaseVNode("button", {
							class: "btn-toolbar",
							onClick: _cache[2] || (_cache[2] = ($event) => _ctx.$emit("toggle-sidebar")),
							title: unref(t)("sidebar.collapse")
						}, [..._cache[10] || (_cache[10] = [createBaseVNode("i", { class: "bi bi-chevron-left" }, null, -1)])], 8, _hoisted_5$9)
					])]),
					createBaseVNode("div", _hoisted_6$9, [withDirectives(createBaseVNode("input", {
						type: "text",
						class: "form-control form-control-sm",
						placeholder: unref(t)("sidebar.searchPlaceholder"),
						"onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => searchQuery.value = $event),
						style: {
							"background": "#313244",
							"border-color": "#45475a",
							"color": "var(--text-primary)"
						}
					}, null, 8, _hoisted_7$9), [[vModelText, searchQuery.value]])]),
					createBaseVNode("div", _hoisted_8$9, [__props.loading ? (openBlock(), createElementBlock("div", _hoisted_9$9, [_cache[12] || (_cache[12] = createBaseVNode("div", { class: "spinner-border spinner-border-sm me-2" }, null, -1)), createTextVNode(toDisplayString(unref(t)("common.loading")), 1)])) : filteredConnections.value.length === 0 ? (openBlock(), createElementBlock("div", _hoisted_10$9, [
						_cache[14] || (_cache[14] = createBaseVNode("i", {
							class: "bi bi-inbox",
							style: { "font-size": "24px" }
						}, null, -1)),
						createBaseVNode("div", _hoisted_11$9, toDisplayString(unref(t)("sidebar.noConnections")), 1),
						createBaseVNode("button", {
							class: "btn btn-sm btn-outline-primary mt-2",
							onClick: _cache[4] || (_cache[4] = ($event) => _ctx.$emit("add-connection"))
						}, [_cache[13] || (_cache[13] = createBaseVNode("i", { class: "bi bi-plus me-1" }, null, -1)), createTextVNode(toDisplayString(unref(t)("sidebar.addConnection")), 1)])
					])) : (openBlock(), createElementBlock("div", _hoisted_12$9, [(openBlock(true), createElementBlock(Fragment, null, renderList(filteredConnections.value, (conn) => {
						return openBlock(), createElementBlock("div", {
							key: conn.id,
							class: "connection-item",
							onDblclick: ($event) => _ctx.$emit("connect", conn),
							onContextmenu: withModifiers(($event) => void 0, ["prevent"])
						}, [
							createBaseVNode("i", {
								class: normalizeClass(conn.type === "local" ? "bi bi-terminal" : "bi bi-hdd-network"),
								style: { "color": "var(--accent)" }
							}, null, 2),
							createBaseVNode("div", _hoisted_14$9, [createBaseVNode("div", _hoisted_15$9, toDisplayString(conn.name), 1), createBaseVNode("div", _hoisted_16$9, toDisplayString(conn.type === "local" ? unref(t)("app.localShell") : `${conn.username}@${conn.host}:${conn.port}`), 1)]),
							createBaseVNode("div", {
								class: "d-flex gap-1",
								onClick: _cache[5] || (_cache[5] = withModifiers(() => {}, ["stop"]))
							}, [
								createBaseVNode("button", {
									class: "btn-conn",
									onClick: ($event) => _ctx.$emit("connect", conn),
									title: unref(t)("sidebar.connect")
								}, [..._cache[15] || (_cache[15] = [createBaseVNode("i", { class: "bi bi-play-fill" }, null, -1)])], 8, _hoisted_17$8),
								createBaseVNode("button", {
									class: "btn-conn",
									onClick: ($event) => _ctx.$emit("edit-connection", conn),
									title: unref(t)("common.edit")
								}, [..._cache[16] || (_cache[16] = [createBaseVNode("i", { class: "bi bi-pencil" }, null, -1)])], 8, _hoisted_18$8),
								createBaseVNode("button", {
									class: "btn-conn btn-conn-danger",
									onClick: ($event) => _ctx.$emit("delete-connection", conn),
									title: unref(t)("common.delete")
								}, [..._cache[17] || (_cache[17] = [createBaseVNode("i", { class: "bi bi-trash" }, null, -1)])], 8, _hoisted_19$8)
							])
						], 40, _hoisted_13$9);
					}), 128))]))]),
					createBaseVNode("div", _hoisted_20$8, [createBaseVNode("span", null, toDisplayString(__props.connections.length) + " " + toDisplayString(unref(t)("sidebar.connectionCount")), 1), createBaseVNode("div", _hoisted_21$7, [
						createBaseVNode("button", {
							class: "btn-ai-settings",
							onClick: _cache[6] || (_cache[6] = ($event) => _ctx.$emit("open-ai-settings")),
							title: unref(t)("ai.settings")
						}, [..._cache[18] || (_cache[18] = [createBaseVNode("i", { class: "bi bi-robot" }, null, -1)])], 8, _hoisted_22$7),
						createBaseVNode("button", {
							class: "btn-ai-settings",
							onClick: _cache[7] || (_cache[7] = ($event) => _ctx.$emit("open-batch")),
							title: unref(t)("batch.title")
						}, [..._cache[19] || (_cache[19] = [createBaseVNode("i", { class: "bi bi-hdd-rack" }, null, -1)])], 8, _hoisted_23$7),
						createBaseVNode("button", {
							class: "btn-lang-switch",
							onClick: toggleLocale,
							title: currentLocale.value === "zh-CN" ? "Switch to English" : "切换到中文"
						}, toDisplayString(currentLocale.value === "zh-CN" ? "EN" : "中"), 9, _hoisted_24$7)
					])])
				], 4);
			};
		}
	});
}));
//#endregion
//#region src/components/terminal-sidebar.vue?vue&type=style&index=0&scoped=bcd1a276&lang.css
var init_terminal_sidebar_vue_vue_type_style_index_0_scoped_bcd1a276_lang = __esmMin((() => {}));
//#endregion
//#region src/components/terminal-sidebar.vue
var terminal_sidebar_default;
var init_terminal_sidebar = __esmMin((() => {
	init_terminal_sidebar_vue_vue_type_script_setup_true_lang();
	init_terminal_sidebar_vue_vue_type_script_setup_true_lang();
	init_terminal_sidebar_vue_vue_type_style_index_0_scoped_bcd1a276_lang();
	init__plugin_vue_export_helper();
	terminal_sidebar_default = /*#__PURE__*/ _plugin_vue_export_helper_default(terminal_sidebar_vue_vue_type_script_setup_true_lang_default, [["__scopeId", "data-v-bcd1a276"]]);
}));
//#endregion
//#region node_modules/.pnpm/zmodem.js@0.1.10_patch_hash=dba85ba4b3429ef2b7cf7722dfd1424332618d438b27499a9bc194fae5594a6e/node_modules/zmodem.js/src/zmlib.js
var require_zmlib = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var Zmodem = module.exports;
	var ZDLE = 24;
	var XON = 17;
	var XOFF = 19;
	var XON_HIGH = 145;
	var XOFF_HIGH = 147;
	var CAN = 24;
	/**
	* Tools and constants that are useful for ZMODEM.
	*
	* @exports ZMLIB
	*/
	Zmodem.ZMLIB = {
		/**
		* @property {number} The ZDLE constant, which ZMODEM uses for escaping
		*/
		ZDLE,
		/**
		* @property {number} XON - ASCII XON
		*/
		XON,
		/**
		* @property {number} XOFF - ASCII XOFF
		*/
		XOFF,
		/**
		* @property {number[]} ABORT_SEQUENCE - ZMODEM’s abort sequence
		*/
		ABORT_SEQUENCE: [
			CAN,
			CAN,
			CAN,
			CAN,
			CAN
		],
		/**
		* Remove octet values from the given array that ZMODEM always ignores.
		* This will mutate the given array.
		*
		* @param {number[]} octets - The octet values to transform.
		*      Each array member should be an 8-bit unsigned integer (0-255).
		*      This object is mutated in the function.
		*
		* @returns {number[]} The passed-in array. This is the same object that is
		*      passed in.
		*/
		strip_ignored_bytes: function strip_ignored_bytes(octets) {
			for (var o = octets.length - 1; o >= 0; o--) switch (octets[o]) {
				case XON:
				case XON_HIGH:
				case XOFF:
				case XOFF_HIGH:
					octets.splice(o, 1);
					continue;
			}
			return octets;
		},
		/**
		* Like Array.prototype.indexOf, but searches for a subarray
		* rather than just a particular value.
		*
		* @param {Array} haystack - The array to search, i.e., the bigger.
		*
		* @param {Array} needle - The array whose values to find,
		*      i.e., the smaller.
		*
		* @returns {number} The position in “haystack” where “needle”
		*      first appears—or, -1 if “needle” doesn’t appear anywhere
		*      in “haystack”.
		*/
		find_subarray: function find_subarray(haystack, needle) {
			var h = 0, n;
			HAYSTACK: while (h !== -1) {
				h = haystack.indexOf(needle[0], h);
				if (h === -1) break HAYSTACK;
				for (n = 1; n < needle.length; n++) if (haystack[h + n] !== needle[n]) {
					h++;
					continue HAYSTACK;
				}
				return h;
			}
			return -1;
		}
	};
}));
//#endregion
//#region node_modules/.pnpm/zmodem.js@0.1.10_patch_hash=dba85ba4b3429ef2b7cf7722dfd1424332618d438b27499a9bc194fae5594a6e/node_modules/zmodem.js/src/encode.js
var require_encode = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var Zmodem = module.exports;
	var HEX_DIGITS = [
		48,
		49,
		50,
		51,
		52,
		53,
		54,
		55,
		56,
		57,
		97,
		98,
		99,
		100,
		101,
		102
	];
	var HEX_OCTET_VALUE = {};
	for (var hd = 0; hd < HEX_DIGITS.length; hd++) HEX_OCTET_VALUE[HEX_DIGITS[hd]] = hd;
	/**
	* General, non-ZMODEM-specific encoding logic.
	*
	* @exports ENCODELIB
	*/
	Zmodem.ENCODELIB = {
		/**
		* Return an array with the given number as 2 big-endian bytes.
		*
		* @param {number} number - The number to encode.
		*
		* @returns {number[]} The octet values.
		*/
		pack_u16_be: function pack_u16_be(number) {
			if (number > 65535) throw "Number cannot exceed 16 bits: " + number;
			return [number >> 8, number & 255];
		},
		/**
		* Return an array with the given number as 4 little-endian bytes.
		*
		* @param {number} number - The number to encode.
		*
		* @returns {number[]} The octet values.
		*/
		pack_u32_le: function pack_u32_le(number) {
			var high_bytes = number / 65536;
			return [
				number & 255,
				(number & 65535) >> 8,
				high_bytes & 255,
				high_bytes >> 8
			];
		},
		/**
		* The inverse of pack_u16_be() - i.e., take in 2 octet values
		* and parse them as an unsigned, 2-byte big-endian number.
		*
		* @param {number[]} octets - The octet values (2 of them).
		*
		* @returns {number} The decoded number.
		*/
		unpack_u16_be: function unpack_u16_be(bytes_arr) {
			return (bytes_arr[0] << 8) + bytes_arr[1];
		},
		/**
		* The inverse of pack_u32_le() - i.e., take in a 4-byte sequence
		* and parse it as an unsigned, 4-byte little-endian number.
		*
		* @param {number[]} octets - The octet values (4 of them).
		*
		* @returns {number} The decoded number.
		*/
		unpack_u32_le: function unpack_u32_le(octets) {
			return octets[0] + (octets[1] << 8) + (octets[2] << 16) + octets[3] * 16777216;
		},
		/**
		* Encode a series of octet values to be the octet values that
		* correspond to the ASCII hex characters for each octet. The
		* returned array is suitable for use as binary data.
		*
		* For example:
		*
		*      Original    Hex     Returned
		*      254         fe      102, 101
		*       12         0c      48, 99
		*      129         81      56, 49
		*
		* @param {number[]} octets - The original octet values.
		*
		* @returns {number[]} The octet values that correspond to an ASCII
		*  representation of the given octets.
		*/
		octets_to_hex: function octets_to_hex(octets) {
			var hex = [];
			for (var o = 0; o < octets.length; o++) hex.push(HEX_DIGITS[octets[o] >> 4], HEX_DIGITS[octets[o] & 15]);
			return hex;
		},
		/**
		* The inverse of octets_to_hex(): takes an array
		* of hex octet pairs and returns their octet values.
		*
		* @param {number[]} hex_octets - The hex octet values.
		*
		* @returns {number[]} The parsed octet values.
		*/
		parse_hex_octets: function parse_hex_octets(hex_octets) {
			var octets = new Array(hex_octets.length / 2);
			for (var i = 0; i < octets.length; i++) octets[i] = (HEX_OCTET_VALUE[hex_octets[2 * i]] << 4) + HEX_OCTET_VALUE[hex_octets[1 + 2 * i]];
			return octets;
		}
	};
}));
//#endregion
//#region node_modules/.pnpm/zmodem.js@0.1.10_patch_hash=dba85ba4b3429ef2b7cf7722dfd1424332618d438b27499a9bc194fae5594a6e/node_modules/zmodem.js/src/text.js
var require_text = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var _my_TextEncoder = class {
		encode(text) {
			text = unescape(encodeURIComponent(text));
			var bytes = new Array(text.length);
			for (var b = 0; b < text.length; b++) bytes[b] = text.charCodeAt(b);
			return new Uint8Array(bytes);
		}
	};
	var _my_TextDecoder = class {
		decode(bytes) {
			return decodeURIComponent(escape(String.fromCharCode.apply(String, bytes)));
		}
	};
	var Zmodem = module.exports;
	/**
	* A limited-use compatibility shim for TextEncoder and TextDecoder.
	* Useful because both Edge and node.js still lack support for these
	* as of October 2017.
	*
	* @exports Text
	*/
	Zmodem.Text = {
		Encoder: typeof TextEncoder !== "undefined" ? TextEncoder : _my_TextEncoder,
		Decoder: typeof TextDecoder !== "undefined" ? TextDecoder : _my_TextDecoder
	};
}));
//#endregion
//#region node_modules/.pnpm/zmodem.js@0.1.10_patch_hash=dba85ba4b3429ef2b7cf7722dfd1424332618d438b27499a9bc194fae5594a6e/node_modules/zmodem.js/src/zdle.js
var require_zdle = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var Zmodem = module.exports;
	Object.assign(Zmodem, require_zmlib());
	var encode_cur;
	var encode_todo;
	var ZDLE = Zmodem.ZMLIB.ZDLE;
	/**
	* Class that handles ZDLE encoding and decoding.
	* Encoding is subject to a given configuration--specifically, whether
	* we want to escape all control characters. Decoding is static; however
	* a given string is encoded we can always decode it.
	*/
	Zmodem.ZDLE = class ZmodemZDLE {
		/**
		* Create a ZDLE encoder.
		*
		* @param {object} [config] - The initial configuration.
		* @param {object} config.escape_ctrl_chars - Whether the ZDLE encoder
		*  should escape control characters.
		*/
		constructor(config) {
			this._config = {};
			if (config) this.set_escape_ctrl_chars(!!config.escape_ctrl_chars);
		}
		/**
		* Enable or disable control-character escaping.
		* You should probably enable this for sender sessions.
		*
		* @param {boolean} value - Whether to enable (true) or disable (false).
		*/
		set_escape_ctrl_chars(value) {
			if (typeof value !== "boolean") throw "need boolean!";
			if (value !== this._config.escape_ctrl_chars) {
				this._config.escape_ctrl_chars = value;
				this._setup_zdle_table();
			}
		}
		/**
		* Whether or not control-character escaping is enabled.
		*
		* @return {boolean} Whether the escaping is on (true) or off (false).
		*/
		escapes_ctrl_chars() {
			return !!this._config.escape_ctrl_chars;
		}
		/**
		* Encode an array of octet values and return it.
		* This will mutate the given array.
		*
		* @param {number[]} octets - The octet values to transform.
		*      Each array member should be an 8-bit unsigned integer (0-255).
		*      This object is mutated in the function.
		*
		* @returns {number[]} The passed-in array, transformed. This is the
		*  same object that is passed in.
		*/
		encode(octets) {
			if (!this._zdle_table) throw "No ZDLE encode table configured!";
			var zdle_table = this._zdle_table;
			var last_code = this._lastcode;
			var arrbuf = /* @__PURE__ */ new ArrayBuffer(2 * octets.length);
			var arrbuf_uint8 = new Uint8Array(arrbuf);
			var escctl_yn = this._config.escape_ctrl_chars;
			var arrbuf_i = 0;
			for (encode_cur = 0; encode_cur < octets.length; encode_cur++) {
				encode_todo = zdle_table[octets[encode_cur]];
				if (!encode_todo) {
					console.trace();
					console.error("bad encode() call:", JSON.stringify(octets));
					this._lastcode = last_code;
					throw "Invalid octet: " + octets[encode_cur];
				}
				last_code = octets[encode_cur];
				if (encode_todo === 1) {} else if (escctl_yn || encode_todo === 2 || (last_code & 127) === 64) {
					arrbuf_uint8[arrbuf_i] = ZDLE;
					arrbuf_i++;
					last_code ^= 64;
				}
				arrbuf_uint8[arrbuf_i] = last_code;
				arrbuf_i++;
			}
			this._lastcode = last_code;
			octets.splice(0);
			octets.push.apply(octets, new Uint8Array(arrbuf, 0, arrbuf_i));
			return octets;
		}
		/**
		* Decode an array of octet values and return it.
		* This will mutate the given array.
		*
		* @param {number[]} octets - The octet values to transform.
		*      Each array member should be an 8-bit unsigned integer (0-255).
		*      This object is mutated in the function.
		*
		* @returns {number[]} The passed-in array.
		*  This is the same object that is passed in.
		*/
		static decode(octets) {
			for (var o = octets.length - 1; o >= 0; o--) if (octets[o] === ZDLE) octets.splice(o, 2, octets[o + 1] - 64);
			return octets;
		}
		/**
		* Remove, ZDLE-decode, and return bytes from the passed-in array.
		* If the requested number of ZDLE-encoded bytes isn’t available,
		* then the passed-in array is unmodified (and the return is undefined).
		*
		* @param {number[]} octets - The octet values to transform.
		*      Each array member should be an 8-bit unsigned integer (0-255).
		*      This object is mutated in the function.
		*
		* @param {number} offset - The number of (undecoded) bytes to skip
		*      at the beginning of the “octets” array.
		*
		* @param {number} count - The number of bytes (octet values) to return.
		*
		* @returns {number[]|undefined} An array with the requested number of
		*      decoded octet values, or undefined if that number of decoded
		*      octets isn’t available (given the passed-in offset).
		*/
		static splice(octets, offset, count) {
			var so_far = 0;
			if (!offset) offset = 0;
			for (var i = offset; i < octets.length && so_far < count; i++) {
				so_far++;
				if (octets[i] === ZDLE) i++;
			}
			if (so_far === count) {
				if (octets.length === i - 1) return;
				octets.splice(0, offset);
				return ZmodemZDLE.decode(octets.splice(0, i - offset));
			}
		}
		_setup_zdle_table() {
			var zsendline_tab = new Array(256);
			for (var i = 0; i < zsendline_tab.length; i++) if (i & 96) zsendline_tab[i] = 1;
			else switch (i) {
				case ZDLE:
				case Zmodem.ZMLIB.XOFF:
				case Zmodem.ZMLIB.XON:
				case Zmodem.ZMLIB.XOFF | 128:
				case Zmodem.ZMLIB.XON | 128:
					zsendline_tab[i] = 2;
					break;
				case 16:
				case 144:
					zsendline_tab[i] = this._config.turbo_escape ? 1 : 2;
					break;
				case 13:
				case 141:
					zsendline_tab[i] = this._config.escape_ctrl_chars ? 2 : !this._config.turbo_escape ? 3 : 1;
					break;
				default: zsendline_tab[i] = this._config.escape_ctrl_chars ? 2 : 1;
			}
			this._zdle_table = zsendline_tab;
		}
	};
}));
//#endregion
//#region node_modules/.pnpm/crc-32@1.2.2/node_modules/crc-32/crc32.js
var require_crc32 = /* @__PURE__ */ __commonJSMin(((exports) => {
	/*! crc32.js (C) 2014-present SheetJS -- http://sheetjs.com */
	(function(factory) {
		if (typeof DO_NOT_EXPORT_CRC === "undefined") {
			if ("object" === typeof exports) factory(exports);
			else if ("function" === typeof define && define.amd) define(function() {
				var module$1 = {};
				factory(module$1);
				return module$1;
			});
			else factory({});
		} else factory({});
	})(function(CRC32) {
		CRC32.version = "1.2.2";
		function signed_crc_table() {
			var c = 0, table = new Array(256);
			for (var n = 0; n != 256; ++n) {
				c = n;
				c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1;
				c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1;
				c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1;
				c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1;
				c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1;
				c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1;
				c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1;
				c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1;
				table[n] = c;
			}
			return typeof Int32Array !== "undefined" ? new Int32Array(table) : table;
		}
		var T0 = signed_crc_table();
		function slice_by_16_tables(T) {
			var c = 0, v = 0, n = 0, table = typeof Int32Array !== "undefined" ? /* @__PURE__ */ new Int32Array(4096) : new Array(4096);
			for (n = 0; n != 256; ++n) table[n] = T[n];
			for (n = 0; n != 256; ++n) {
				v = T[n];
				for (c = 256 + n; c < 4096; c += 256) v = table[c] = v >>> 8 ^ T[v & 255];
			}
			var out = [];
			for (n = 1; n != 16; ++n) out[n - 1] = typeof Int32Array !== "undefined" ? table.subarray(n * 256, n * 256 + 256) : table.slice(n * 256, n * 256 + 256);
			return out;
		}
		var TT = slice_by_16_tables(T0);
		var T1 = TT[0], T2 = TT[1], T3 = TT[2], T4 = TT[3], T5 = TT[4];
		var T6 = TT[5], T7 = TT[6], T8 = TT[7], T9 = TT[8], Ta = TT[9];
		var Tb = TT[10], Tc = TT[11], Td = TT[12], Te = TT[13], Tf = TT[14];
		function crc32_bstr(bstr, seed) {
			var C = seed ^ -1;
			for (var i = 0, L = bstr.length; i < L;) C = C >>> 8 ^ T0[(C ^ bstr.charCodeAt(i++)) & 255];
			return ~C;
		}
		function crc32_buf(B, seed) {
			var C = seed ^ -1, L = B.length - 15, i = 0;
			for (; i < L;) C = Tf[B[i++] ^ C & 255] ^ Te[B[i++] ^ C >> 8 & 255] ^ Td[B[i++] ^ C >> 16 & 255] ^ Tc[B[i++] ^ C >>> 24] ^ Tb[B[i++]] ^ Ta[B[i++]] ^ T9[B[i++]] ^ T8[B[i++]] ^ T7[B[i++]] ^ T6[B[i++]] ^ T5[B[i++]] ^ T4[B[i++]] ^ T3[B[i++]] ^ T2[B[i++]] ^ T1[B[i++]] ^ T0[B[i++]];
			L += 15;
			while (i < L) C = C >>> 8 ^ T0[(C ^ B[i++]) & 255];
			return ~C;
		}
		function crc32_str(str, seed) {
			var C = seed ^ -1;
			for (var i = 0, L = str.length, c = 0, d = 0; i < L;) {
				c = str.charCodeAt(i++);
				if (c < 128) C = C >>> 8 ^ T0[(C ^ c) & 255];
				else if (c < 2048) {
					C = C >>> 8 ^ T0[(C ^ (192 | c >> 6 & 31)) & 255];
					C = C >>> 8 ^ T0[(C ^ (128 | c & 63)) & 255];
				} else if (c >= 55296 && c < 57344) {
					c = (c & 1023) + 64;
					d = str.charCodeAt(i++) & 1023;
					C = C >>> 8 ^ T0[(C ^ (240 | c >> 8 & 7)) & 255];
					C = C >>> 8 ^ T0[(C ^ (128 | c >> 2 & 63)) & 255];
					C = C >>> 8 ^ T0[(C ^ (128 | d >> 6 & 15 | (c & 3) << 4)) & 255];
					C = C >>> 8 ^ T0[(C ^ (128 | d & 63)) & 255];
				} else {
					C = C >>> 8 ^ T0[(C ^ (224 | c >> 12 & 15)) & 255];
					C = C >>> 8 ^ T0[(C ^ (128 | c >> 6 & 63)) & 255];
					C = C >>> 8 ^ T0[(C ^ (128 | c & 63)) & 255];
				}
			}
			return ~C;
		}
		CRC32.table = T0;
		CRC32.bstr = crc32_bstr;
		CRC32.buf = crc32_buf;
		CRC32.str = crc32_str;
	});
}));
//#endregion
//#region node_modules/.pnpm/zmodem.js@0.1.10_patch_hash=dba85ba4b3429ef2b7cf7722dfd1424332618d438b27499a9bc194fae5594a6e/node_modules/zmodem.js/src/zerror.js
var require_zerror = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var Zmodem = module.exports;
	function _crc_message(got, expected) {
		this.got = got.slice(0);
		this.expected = expected.slice(0);
		return "CRC check failed! (got: " + got.join() + "; expected: " + expected.join() + ")";
	}
	function _pass(val) {
		return val;
	}
	var TYPE_MESSAGE = {
		aborted: "Session aborted",
		peer_aborted: "Peer aborted session",
		already_aborted: "Session already aborted",
		crc: _crc_message,
		validation: _pass
	};
	function _generate_message(type) {
		const msg = TYPE_MESSAGE[type];
		switch (typeof msg) {
			case "string": return msg;
			case "function":
				var args_after_type = [].slice.call(arguments).slice(1);
				return msg.apply(this, args_after_type);
		}
		return null;
	}
	Zmodem.Error = class ZmodemError extends Error {
		constructor(msg_or_type) {
			super();
			var generated = _generate_message.apply(this, arguments);
			if (generated) {
				this.type = msg_or_type;
				this.message = generated;
			} else this.message = msg_or_type;
		}
	};
}));
//#endregion
//#region node_modules/.pnpm/zmodem.js@0.1.10_patch_hash=dba85ba4b3429ef2b7cf7722dfd1424332618d438b27499a9bc194fae5594a6e/node_modules/zmodem.js/src/zcrc.js
var require_zcrc = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var CRC32_MOD = require_crc32();
	var Zmodem = module.exports;
	Object.assign(Zmodem, require_zerror(), require_encode());
	var _crctab;
	var crc_polynomial = 4129;
	var crc_castmask = 65535;
	var crc_msbmask = 32768;
	function _compute_crctab() {
		_crctab = new Array(256);
		var divident_shift = 8;
		for (var divident = 0; divident < 256; divident++) {
			var currByte = divident << divident_shift & crc_castmask;
			for (var bit = 0; bit < 8; bit++) if ((currByte & crc_msbmask) !== 0) {
				currByte <<= 1;
				currByte ^= crc_polynomial;
			} else currByte <<= 1;
			_crctab[divident] = currByte & crc_castmask;
		}
	}
	function _updcrc(cp, crc) {
		if (!_crctab) _compute_crctab();
		return _crctab[crc >> 8 & 255] ^ (255 & crc) << 8 ^ cp;
	}
	function __verify(expect, got) {
		if (expect.join() !== got.join()) throw new Zmodem.Error("crc", got, expect);
	}
	Zmodem.CRC = {
		/**
		* Deduce a given set of octet values’ CRC16, as per the CRC16
		* variant that ZMODEM uses (CRC-CCITT/XModem).
		*
		* @param {Array} octets - The array of octet values.
		*      Each array member should be an 8-bit unsigned integer (0-255).
		*
		* @returns {Array} crc - The CRC, expressed as an array of octet values.
		*/
		crc16: function crc16(octet_nums) {
			var crc = octet_nums[0];
			for (var b = 1; b < octet_nums.length; b++) crc = _updcrc(octet_nums[b], crc);
			crc = _updcrc(0, _updcrc(0, crc));
			return Zmodem.ENCODELIB.pack_u16_be(crc);
		},
		/**
		* Deduce a given set of octet values’ CRC32.
		*
		* @param {Array} octets - The array of octet values.
		*      Each array member should be an 8-bit unsigned integer (0-255).
		*
		* @returns {Array} crc - The CRC, expressed as an array of octet values.
		*/
		crc32: function crc32(octet_nums) {
			return Zmodem.ENCODELIB.pack_u32_le(CRC32_MOD.buf(octet_nums) >>> 0);
		},
		/**
		* Verify a given set of octet values’ CRC16.
		* An exception is thrown on failure.
		*
		* @param {Array} bytes_arr - The array of octet values.
		*      Each array member should be an 8-bit unsigned integer (0-255).
		*
		* @param {Array} crc - The CRC to check against, expressed as
		*      an array of octet values.
		*/
		verify16: function verify16(bytes_arr, got) {
			return __verify(this.crc16(bytes_arr), got);
		},
		/**
		* Verify a given set of octet values’ CRC32.
		* An exception is thrown on failure.
		*
		* @param {Array} bytes_arr - The array of octet values.
		*      Each array member should be an 8-bit unsigned integer (0-255).
		*
		* @param {Array} crc - The CRC to check against, expressed as
		*      an array of octet values.
		*/
		verify32: function verify32(bytes_arr, crc) {
			try {
				__verify(this.crc32(bytes_arr), crc);
			} catch (err) {
				err.input = bytes_arr.slice(0);
				throw err;
			}
		}
	};
}));
//#endregion
//#region node_modules/.pnpm/zmodem.js@0.1.10_patch_hash=dba85ba4b3429ef2b7cf7722dfd1424332618d438b27499a9bc194fae5594a6e/node_modules/zmodem.js/src/zheader.js
var require_zheader = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var Zmodem = module.exports;
	Object.assign(Zmodem, require_encode(), require_zdle(), require_zmlib(), require_zcrc(), require_zerror());
	var ZPAD = "*".charCodeAt(0);
	var ZBIN = "A".charCodeAt(0);
	var ZHEX = "B".charCodeAt(0);
	var ZBIN32 = "C".charCodeAt(0);
	var HEX_HEADER_CRLF = [13, 10];
	var HEX_HEADER_CRLF_XON = HEX_HEADER_CRLF.slice(0).concat([Zmodem.ZMLIB.XON]);
	var HEX_HEADER_PREFIX = [
		ZPAD,
		ZPAD,
		Zmodem.ZMLIB.ZDLE,
		ZHEX
	];
	var BINARY16_HEADER_PREFIX = [
		ZPAD,
		Zmodem.ZMLIB.ZDLE,
		ZBIN
	];
	var BINARY32_HEADER_PREFIX = [
		ZPAD,
		Zmodem.ZMLIB.ZDLE,
		ZBIN32
	];
	/** Class that represents a ZMODEM header. */
	Zmodem.Header = class ZmodemHeader {
		/**
		* Weed out the leading bytes that aren’t valid to start a ZMODEM header.
		*
		* @param {number[]} ibuffer - The octet values to parse.
		*      Each array member should be an 8-bit unsigned integer (0-255).
		*      This object is mutated in the function.
		*
		* @returns {number[]} The octet values that were removed from the start
		*      of “ibuffer”. Order is preserved.
		*/
		static trim_leading_garbage(ibuffer) {
			var garbage = [], discard_all, parser;
			TRIM_LOOP: while (ibuffer.length && !parser) {
				var first_ZPAD = ibuffer.indexOf(ZPAD);
				if (first_ZPAD === -1) {
					discard_all = true;
					break TRIM_LOOP;
				} else {
					garbage.push.apply(garbage, ibuffer.splice(0, first_ZPAD));
					if (ibuffer.length < 2) break TRIM_LOOP;
					else if (ibuffer[1] === ZPAD) {
						if (ibuffer.length < HEX_HEADER_PREFIX.length) {
							if (ibuffer.join() === HEX_HEADER_PREFIX.slice(0, ibuffer.length).join()) break TRIM_LOOP;
						} else if (ibuffer[2] === HEX_HEADER_PREFIX[2] && ibuffer[3] === HEX_HEADER_PREFIX[3]) parser = _parse_hex;
					} else if (ibuffer[1] === Zmodem.ZMLIB.ZDLE) {
						if (ibuffer.length < BINARY16_HEADER_PREFIX.length) break TRIM_LOOP;
						if (ibuffer[2] === BINARY16_HEADER_PREFIX[2]) parser = _parse_binary16;
						else if (ibuffer[2] === BINARY32_HEADER_PREFIX[2]) parser = _parse_binary32;
					}
					if (!parser) garbage.push(ibuffer.shift());
				}
			}
			if (discard_all) garbage.push.apply(garbage, ibuffer.splice(0));
			return garbage;
		}
		/**
		* Parse out a Header object from a given array of octet values.
		*
		* An exception is thrown if the given bytes are definitively invalid
		* as header values.
		*
		* @param {number[]} octets - The octet values to parse.
		*      Each array member should be an 8-bit unsigned integer (0-255).
		*      This object is mutated in the function.
		*
		* @returns {Header|undefined} An instance of the appropriate Header
		*      subclass, or undefined if not enough octet values are given
		*      to determine whether there is a valid header here or not.
		*/
		static parse(octets) {
			var hdr;
			if (octets[1] === ZPAD) {
				hdr = _parse_hex(octets);
				return hdr && [hdr, 16];
			} else if (octets[2] === ZBIN) {
				hdr = _parse_binary16(octets, 3);
				return hdr && [hdr, 16];
			} else if (octets[2] === ZBIN32) {
				hdr = _parse_binary32(octets);
				return hdr && [hdr, 32];
			}
			if (octets.length < 3) return;
			throw "Unrecognized/unsupported octets: " + octets.join();
		}
		/**
		* Build a Header subclass given a name and arguments.
		*
		* @param {string} name - The header type name, e.g., “ZRINIT”.
		*
		* @param {...*} args - The arguments to pass to the appropriate
		*      subclass constructor. These aren’t documented currently
		*      but are pretty easy to glean from the code.
		*
		* @returns {Header} An instance of the appropriate Header subclass.
		*/
		static build(name) {
			var args = arguments.length === 1 ? [arguments[0]] : Array.apply(null, arguments);
			var Ctr = FRAME_NAME_CREATOR[name];
			if (!Ctr) throw "No frame class “" + name + "” is defined!";
			args.shift();
			return new (Ctr.bind.apply(Ctr, [null].concat(args)))();
		}
		/**
		* Return the octet values array that represents the object
		* in ZMODEM hex encoding.
		*
		* @returns {number[]} An array of octet values suitable for sending
		*      as binary data.
		*/
		to_hex() {
			var to_crc = this._crc_bytes();
			return HEX_HEADER_PREFIX.concat(Zmodem.ENCODELIB.octets_to_hex(to_crc.concat(Zmodem.CRC.crc16(to_crc))), this._hex_header_ending);
		}
		/**
		* Return the octet values array that represents the object
		* in ZMODEM binary encoding with a 16-bit CRC.
		*
		* @param {ZDLE} zencoder - A ZDLE instance to use for
		*      ZDLE encoding.
		*
		* @returns {number[]} An array of octet values suitable for sending
		*      as binary data.
		*/
		to_binary16(zencoder) {
			return this._to_binary(zencoder, BINARY16_HEADER_PREFIX, Zmodem.CRC.crc16);
		}
		/**
		* Return the octet values array that represents the object
		* in ZMODEM binary encoding with a 32-bit CRC.
		*
		* @param {ZDLE} zencoder - A ZDLE instance to use for
		*      ZDLE encoding.
		*
		* @returns {number[]} An array of octet values suitable for sending
		*      as binary data.
		*/
		to_binary32(zencoder) {
			return this._to_binary(zencoder, BINARY32_HEADER_PREFIX, Zmodem.CRC.crc32);
		}
		constructor() {
			if (!this._bytes4) this._bytes4 = [
				0,
				0,
				0,
				0
			];
		}
		_to_binary(zencoder, prefix, crc_func) {
			var to_crc = this._crc_bytes();
			return prefix.concat(zencoder.encode(to_crc.concat(crc_func(to_crc))));
		}
		_crc_bytes() {
			return [this.TYPENUM].concat(this._bytes4);
		}
	};
	Zmodem.Header.prototype._hex_header_ending = HEX_HEADER_CRLF_XON;
	var ZRQINIT_HEADER = class extends Zmodem.Header {};
	var ZRINIT_FLAG = {
		CANFDX: 1,
		CANOVIO: 2,
		CANBRK: 4,
		CANCRY: 8,
		CANLZW: 16,
		CANFC32: 32,
		ESCCTL: 64,
		ESC8: 128
	};
	function _get_ZRINIT_flag_num(fl) {
		if (!ZRINIT_FLAG[fl]) throw new Zmodem.Error("Invalid ZRINIT flag: " + fl);
		return ZRINIT_FLAG[fl];
	}
	var ZRINIT_HEADER = class extends Zmodem.Header {
		constructor(flags_arr, bufsize) {
			super();
			var flags_num = 0;
			if (!bufsize) bufsize = 0;
			flags_arr.forEach(function(fl) {
				flags_num |= _get_ZRINIT_flag_num(fl);
			});
			this._bytes4 = [
				bufsize & 255,
				bufsize >> 8,
				0,
				flags_num
			];
		}
		get_buffer_size() {
			return Zmodem.ENCODELIB.unpack_u16_be(this._bytes4.slice(0, 2)) || void 0;
		}
		can_full_duplex() {
			return !!(this._bytes4[3] & ZRINIT_FLAG.CANFDX);
		}
		can_overlap_io() {
			return !!(this._bytes4[3] & ZRINIT_FLAG.CANOVIO);
		}
		can_break() {
			return !!(this._bytes4[3] & ZRINIT_FLAG.CANBRK);
		}
		can_fcs_32() {
			return !!(this._bytes4[3] & ZRINIT_FLAG.CANFC32);
		}
		escape_ctrl_chars() {
			return !!(this._bytes4[3] & ZRINIT_FLAG.ESCCTL);
		}
		escape_8th_bit() {
			return !!(this._bytes4[3] & ZRINIT_FLAG.ESC8);
		}
	};
	var ZSINIT_FLAG = {
		ESCCTL: 64,
		ESC8: 128
	};
	function _get_ZSINIT_flag_num(fl) {
		if (!ZSINIT_FLAG[fl]) throw "Invalid ZSINIT flag: " + fl;
		return ZSINIT_FLAG[fl];
	}
	var ZSINIT_HEADER = class extends Zmodem.Header {
		constructor(flags_arr, attn_seq_arr) {
			super();
			var flags_num = 0;
			flags_arr.forEach(function(fl) {
				flags_num |= _get_ZSINIT_flag_num(fl);
			});
			this._bytes4 = [
				0,
				0,
				0,
				flags_num
			];
			if (attn_seq_arr) {
				if (attn_seq_arr.length > 31) throw "Attn sequence must be <= 31 bytes";
				if (attn_seq_arr.some(function(num) {
					return num > 255;
				})) throw "Attn sequence (" + attn_seq_arr + ") must be <256";
				this._data = attn_seq_arr.concat([0]);
			}
		}
		escape_ctrl_chars() {
			return !!(this._bytes4[3] & ZSINIT_FLAG.ESCCTL);
		}
		escape_8th_bit() {
			return !!(this._bytes4[3] & ZSINIT_FLAG.ESC8);
		}
	};
	var ZACK_HEADER = class extends Zmodem.Header {
		constructor(payload4) {
			super();
			if (payload4) this._bytes4 = payload4.slice();
		}
	};
	ZACK_HEADER.prototype._hex_header_ending = HEX_HEADER_CRLF;
	var ZFILE_VALUES = {
		extended: { sparse: 64 },
		transport: [
			void 0,
			"compress",
			"encrypt",
			"rle"
		],
		management: [
			void 0,
			"newer_or_longer",
			"crc",
			"append",
			"clobber",
			"newer",
			"mtime_or_length",
			"protect",
			"rename"
		],
		conversion: [
			void 0,
			"binary",
			"text",
			"resume"
		]
	};
	var ZFILE_ORDER = [
		"extended",
		"transport",
		"management",
		"conversion"
	];
	var ZMSKNOLOC = 128;
	var MANAGEMENT_MASK = 31;
	var ZXSPARS = 64;
	var ZFILE_HEADER = class extends Zmodem.Header {
		get_options() {
			var opts = { sparse: !!(this._bytes4[0] & ZXSPARS) };
			var bytes_copy = this._bytes4.slice(0);
			ZFILE_ORDER.forEach(function(key, i) {
				if (ZFILE_VALUES[key] instanceof Array) {
					if (key === "management") {
						opts.skip_if_absent = !!(bytes_copy[i] & ZMSKNOLOC);
						bytes_copy[i] &= MANAGEMENT_MASK;
					}
					opts[key] = ZFILE_VALUES[key][bytes_copy[i]];
				} else for (var extkey in ZFILE_VALUES[key]) {
					opts[extkey] = !!(bytes_copy[i] & ZFILE_VALUES[key][extkey]);
					if (opts[extkey]) bytes_copy[i] ^= ZFILE_VALUES[key][extkey];
				}
				if (!opts[key] && bytes_copy[i]) opts[key] = "unknown:" + bytes_copy[i];
			});
			return opts;
		}
	};
	var ZSKIP_HEADER = class extends Zmodem.Header {};
	var ZABORT_HEADER = class extends Zmodem.Header {};
	var ZFIN_HEADER = class extends Zmodem.Header {};
	var ZFERR_HEADER = class extends Zmodem.Header {};
	ZFIN_HEADER.prototype._hex_header_ending = HEX_HEADER_CRLF;
	var ZOffsetHeader = class extends Zmodem.Header {
		constructor(offset) {
			super();
			this._bytes4 = Zmodem.ENCODELIB.pack_u32_le(offset);
		}
		get_offset() {
			return Zmodem.ENCODELIB.unpack_u32_le(this._bytes4);
		}
	};
	var ZRPOS_HEADER = class extends ZOffsetHeader {};
	var ZDATA_HEADER = class extends ZOffsetHeader {};
	var ZEOF_HEADER = class extends ZOffsetHeader {};
	var FRAME_CLASS_TYPES = [
		[ZRQINIT_HEADER, "ZRQINIT"],
		[ZRINIT_HEADER, "ZRINIT"],
		[ZSINIT_HEADER, "ZSINIT"],
		[ZACK_HEADER, "ZACK"],
		[ZFILE_HEADER, "ZFILE"],
		[ZSKIP_HEADER, "ZSKIP"],
		void 0,
		[ZABORT_HEADER, "ZABORT"],
		[ZFIN_HEADER, "ZFIN"],
		[ZRPOS_HEADER, "ZRPOS"],
		[ZDATA_HEADER, "ZDATA"],
		[ZEOF_HEADER, "ZEOF"],
		[ZFERR_HEADER, "ZFERR"],
		void 0,
		void 0,
		void 0,
		void 0,
		void 0,
		void 0,
		void 0
	];
	var FRAME_NAME_CREATOR = {};
	for (var fc = 0; fc < FRAME_CLASS_TYPES.length; fc++) {
		if (!FRAME_CLASS_TYPES[fc]) continue;
		FRAME_NAME_CREATOR[FRAME_CLASS_TYPES[fc][1]] = FRAME_CLASS_TYPES[fc][0];
		Object.assign(FRAME_CLASS_TYPES[fc][0].prototype, {
			TYPENUM: fc,
			NAME: FRAME_CLASS_TYPES[fc][1]
		});
	}
	var CREATORS = [
		ZRQINIT_HEADER,
		ZRINIT_HEADER,
		ZSINIT_HEADER,
		ZACK_HEADER,
		ZFILE_HEADER,
		ZSKIP_HEADER,
		"ZNAK",
		ZABORT_HEADER,
		ZFIN_HEADER,
		ZRPOS_HEADER,
		ZDATA_HEADER,
		ZEOF_HEADER,
		ZFERR_HEADER,
		"ZCRC",
		"ZCHALLENGE",
		"ZCOMPL",
		"ZCAN",
		"ZFREECNT",
		"ZCOMMAND",
		"ZSTDERR"
	];
	function _get_blank_header(typenum) {
		var creator = CREATORS[typenum];
		if (typeof creator === "string") throw "Received unsupported header: " + creator;
		return _get_blank_header_from_constructor(creator);
	}
	function _get_blank_header_from_constructor(creator) {
		if (creator.prototype instanceof ZOffsetHeader) return new creator(0);
		return new creator([]);
	}
	function _parse_binary16(bytes_arr) {
		var zdle_decoded = Zmodem.ZDLE.splice(bytes_arr, BINARY16_HEADER_PREFIX.length, 7);
		return zdle_decoded && _parse_non_zdle_binary16(zdle_decoded);
	}
	function _parse_non_zdle_binary16(decoded) {
		Zmodem.CRC.verify16(decoded.slice(0, 5), decoded.slice(5));
		var typenum = decoded[0];
		var hdr = _get_blank_header(typenum);
		hdr._bytes4 = decoded.slice(1, 5);
		return hdr;
	}
	function _parse_binary32(bytes_arr) {
		var zdle_decoded = Zmodem.ZDLE.splice(bytes_arr, BINARY32_HEADER_PREFIX.length, 9);
		if (!zdle_decoded) return;
		Zmodem.CRC.verify32(zdle_decoded.slice(0, 5), zdle_decoded.slice(5));
		var typenum = zdle_decoded[0];
		var hdr = _get_blank_header(typenum);
		hdr._bytes4 = zdle_decoded.slice(1, 5);
		return hdr;
	}
	function _parse_hex(bytes_arr) {
		var search_limit = Math.min(bytes_arr.length, 21);
		var lf_pos = -1;
		for (var _si = 0; _si < search_limit; _si++) if (bytes_arr[_si] === 138) {
			lf_pos = _si;
			break;
		}
		if (-1 === lf_pos) {
			for (var _si2 = 0; _si2 < search_limit; _si2++) if (bytes_arr[_si2] === 10) {
				lf_pos = _si2;
				break;
			}
		}
		var hdr_err, hex_bytes;
		if (-1 === lf_pos) {
			if (bytes_arr.length > 11) hdr_err = "Invalid hex header - no LF detected within 21 bytes!";
			return;
		} else {
			hex_bytes = bytes_arr.splice(0, lf_pos);
			bytes_arr.shift();
			if (hex_bytes.length === 19) {
				var preceding = hex_bytes.pop();
				if (preceding !== 13 && preceding !== 141) hdr_err = "Invalid hex header: (CR/)LF doesn’t have CR!";
			} else if (hex_bytes.length !== 18) hdr_err = "Invalid hex header: invalid number of bytes before LF!";
		}
		if (hdr_err) {
			hdr_err += " (" + hex_bytes.length + " bytes: " + hex_bytes.join() + ")";
			throw hdr_err;
		}
		hex_bytes.splice(0, 4);
		return _parse_non_zdle_binary16(Zmodem.ENCODELIB.parse_hex_octets(hex_bytes));
	}
	Zmodem.Header.parse_hex = _parse_hex;
}));
//#endregion
//#region node_modules/.pnpm/zmodem.js@0.1.10_patch_hash=dba85ba4b3429ef2b7cf7722dfd1424332618d438b27499a9bc194fae5594a6e/node_modules/zmodem.js/src/zsubpacket.js
var require_zsubpacket = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var Zmodem = module.exports;
	Object.assign(Zmodem, require_zcrc(), require_zdle(), require_zmlib(), require_zerror());
	var ZCRCE = 104;
	var ZCRCG = 105;
	var ZCRCQ = 106;
	var ZCRCW = 107;
	var SUBPACKET_BUILDER;
	/** Class that represents a ZMODEM data subpacket. */
	Zmodem.Subpacket = class ZmodemSubpacket {
		/**
		* Build a Subpacket subclass given a payload and frame end string.
		*
		* @param {Array} octets - The octet values to parse.
		*      Each array member should be an 8-bit unsigned integer (0-255).
		*
		* @param {string} frameend - One of:
		* - `no_end_no_ack`
		* - `end_no_ack`
		* - `no_end_ack` (unused currently)
		* - `end_ack`
		*
		* @returns {Subpacket} An instance of the appropriate Subpacket subclass.
		*/
		static build(octets, frameend) {
			var Ctr = SUBPACKET_BUILDER[frameend];
			if (!Ctr) throw "No subpacket type “" + frameend + "” is defined! Try one of: " + Object.keys(SUBPACKET_BUILDER).join(", ");
			return new Ctr(octets);
		}
		/**
		* Return the octet values array that represents the object
		* encoded with a 16-bit CRC.
		*
		* @param {ZDLE} zencoder - A ZDLE instance to use for ZDLE encoding.
		*
		* @returns {number[]} An array of octet values suitable for sending
		*      as binary data.
		*/
		encode16(zencoder) {
			return this._encode(zencoder, Zmodem.CRC.crc16);
		}
		/**
		* Return the octet values array that represents the object
		* encoded with a 32-bit CRC.
		*
		* @param {ZDLE} zencoder - A ZDLE instance to use for ZDLE encoding.
		*
		* @returns {number[]} An array of octet values suitable for sending
		*      as binary data.
		*/
		encode32(zencoder) {
			return this._encode(zencoder, Zmodem.CRC.crc32);
		}
		/**
		* Return the subpacket payload’s octet values.
		*
		* NOTE: For speed, this returns the actual data in the subpacket;
		* if you mutate this return value, you alter the Subpacket object
		* internals. This is OK if you won’t need the Subpacket anymore, but
		* just be careful.
		*
		* @returns {number[]} The subpacket’s payload, represented as an
		* array of octet values. **DO NOT ALTER THIS ARRAY** unless you
		* no longer need the Subpacket.
		*/
		get_payload() {
			return this._payload;
		}
		/**
		* Parse out a Subpacket object from a given array of octet values,
		* assuming a 16-bit CRC.
		*
		* An exception is thrown if the given bytes are definitively invalid
		* as subpacket values with 16-bit CRC.
		*
		* @param {number[]} octets - The octet values to parse.
		*      Each array member should be an 8-bit unsigned integer (0-255).
		*      This object is mutated in the function.
		*
		* @returns {Subpacket|undefined} An instance of the appropriate Subpacket
		*      subclass, or undefined if not enough octet values are given
		*      to determine whether there is a valid subpacket here or not.
		*/
		static parse16(octets) {
			return ZmodemSubpacket._parse(octets, 2);
		}
		/**
		* Same as parse16(), but assuming a 32-bit CRC.
		*
		* @param {number[]} octets - The octet values to parse.
		*      Each array member should be an 8-bit unsigned integer (0-255).
		*      This object is mutated in the function.
		*
		* @returns {Subpacket|undefined} An instance of the appropriate Subpacket
		*      subclass, or undefined if not enough octet values are given
		*      to determine whether there is a valid subpacket here or not.
		*/
		static parse32(octets) {
			return ZmodemSubpacket._parse(octets, 4);
		}
		/**
		* Not used directly.
		*/
		constructor(payload) {
			this._payload = payload;
		}
		_encode(zencoder, crc_func) {
			return zencoder.encode(this._payload.slice(0)).concat([Zmodem.ZMLIB.ZDLE, this._frameend_num], zencoder.encode(crc_func(this._payload.concat(this._frameend_num))));
		}
		static _parse(bytes_arr, crc_len) {
			var end_at;
			var creator;
			var _frame_ends_lookup = {
				104: ZEndNoAckSubpacket,
				105: ZNoEndNoAckSubpacket,
				106: ZNoEndAckSubpacket,
				107: ZEndAckSubpacket
			};
			var zdle_at = 0;
			while (zdle_at < bytes_arr.length) {
				zdle_at = bytes_arr.indexOf(Zmodem.ZMLIB.ZDLE, zdle_at);
				if (zdle_at === -1) return;
				creator = _frame_ends_lookup[bytes_arr[zdle_at + 1]];
				if (creator) {
					end_at = zdle_at + 1;
					break;
				}
				zdle_at++;
			}
			if (!creator) return;
			var frameend_num = bytes_arr[end_at];
			if (bytes_arr[end_at - 1] !== Zmodem.ZMLIB.ZDLE) throw "Byte before frame end should be ZDLE, not " + bytes_arr[end_at - 1];
			var zdle_encoded_payload = bytes_arr.splice(0, end_at - 1);
			var got_crc = Zmodem.ZDLE.splice(bytes_arr, 2, crc_len);
			if (!got_crc) {
				bytes_arr.unshift.apply(bytes_arr, zdle_encoded_payload);
				return;
			}
			var payload = Zmodem.ZDLE.decode(zdle_encoded_payload);
			Zmodem.CRC[crc_len === 2 ? "verify16" : "verify32"](payload.concat([frameend_num]), got_crc);
			return new creator(payload, got_crc);
		}
	};
	var ZEndSubpacketBase = class extends Zmodem.Subpacket {
		frame_end() {
			return true;
		}
	};
	var ZNoEndSubpacketBase = class extends Zmodem.Subpacket {
		frame_end() {
			return false;
		}
	};
	var ZEndNoAckSubpacket = class extends ZEndSubpacketBase {
		ack_expected() {
			return false;
		}
	};
	ZEndNoAckSubpacket.prototype._frameend_num = ZCRCE;
	var ZEndAckSubpacket = class extends ZEndSubpacketBase {
		ack_expected() {
			return true;
		}
	};
	ZEndAckSubpacket.prototype._frameend_num = ZCRCW;
	var ZNoEndNoAckSubpacket = class extends ZNoEndSubpacketBase {
		ack_expected() {
			return false;
		}
	};
	ZNoEndNoAckSubpacket.prototype._frameend_num = ZCRCG;
	var ZNoEndAckSubpacket = class extends ZNoEndSubpacketBase {
		ack_expected() {
			return true;
		}
	};
	ZNoEndAckSubpacket.prototype._frameend_num = ZCRCQ;
	SUBPACKET_BUILDER = {
		end_no_ack: ZEndNoAckSubpacket,
		end_ack: ZEndAckSubpacket,
		no_end_no_ack: ZNoEndNoAckSubpacket,
		no_end_ack: ZNoEndAckSubpacket
	};
}));
//#endregion
//#region node_modules/.pnpm/zmodem.js@0.1.10_patch_hash=dba85ba4b3429ef2b7cf7722dfd1424332618d438b27499a9bc194fae5594a6e/node_modules/zmodem.js/src/zvalidation.js
var require_zvalidation = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var Zmodem = module.exports;
	Object.assign(Zmodem, require_zerror());
	var LOOKS_LIKE_ZMODEM_HEADER = /\*\x18[AC]|\*\*\x18B/;
	function _validate_number(key, value) {
		if (value < 0) throw new Zmodem.Error("validation", "“" + key + "” (" + value + ") must be nonnegative.");
		if (value !== Math.floor(value)) throw new Zmodem.Error("validation", "“" + key + "” (" + value + ") must be an integer.");
	}
	/** Validation logic for zmodem.js
	*
	* @exports Validation
	*/
	Zmodem.Validation = { 
	/**
	* Validates and normalizes a set of parameters for an offer to send.
	* NOTE: This returns “mtime” as epoch seconds, not a Date. This is
	* inconsistent with the get_details() method in Session, but it’s
	* more useful for sending over the wire.
	*
	* @param {FileDetails} params - The file details. Some fairly trivial
	* variances from the specification are allowed.
	*
	* @return {FileDetails} The parameters that should be sent. `mtime`
	* will be a Date rather than a number.
	*/
offer_parameters: function offer_parameters(params) {
		if (!params.name) throw new Zmodem.Error("validation", "Need “name”!");
		if (typeof params.name !== "string") throw new Zmodem.Error("validation", "“name” (" + params.name + ") must be a string!");
		params = Object.assign({}, params);
		if (LOOKS_LIKE_ZMODEM_HEADER.test(params.name)) console.warn("The filename " + JSON.stringify(name) + " contains characters that look like a ZMODEM header. This could corrupt the ZMODEM session; consider renaming it so that the filename doesn’t contain control characters.");
		if (params.serial !== null && params.serial !== void 0) throw new Zmodem.Error("validation", "“serial” is meaningless.");
		params.serial = null;
		[
			"size",
			"mode",
			"files_remaining",
			"bytes_remaining"
		].forEach(function(k) {
			var ok;
			switch (typeof params[k]) {
				case "object":
					ok = params[k] === null;
					break;
				case "undefined":
					params[k] = null;
					ok = true;
					break;
				case "number":
					_validate_number(k, params[k]);
					ok = true;
			}
			if (!ok) throw new Zmodem.Error("validation", "“" + k + "” (" + params[k] + ") must be null, undefined, or a number.");
		});
		if (typeof params.mode === "number") params.mode |= 32768;
		if (params.files_remaining === 0) throw new Zmodem.Error("validation", "“files_remaining”, if given, must be positive.");
		var mtime_ok;
		switch (typeof params.mtime) {
			case "object":
				mtime_ok = true;
				if (params.mtime instanceof Date) {
					var date_obj = params.mtime;
					params.mtime = Math.floor(date_obj.getTime() / 1e3);
					if (params.mtime < 0) throw new Zmodem.Error("validation", "“mtime” (" + date_obj + ") must not be earlier than 1970.");
				} else if (params.mtime !== null) mtime_ok = false;
				break;
			case "undefined":
				params.mtime = null;
				mtime_ok = true;
				break;
			case "number":
				_validate_number("mtime", params.mtime);
				mtime_ok = true;
		}
		if (!mtime_ok) throw new Zmodem.Error("validation", "“mtime” (" + params.mtime + ") must be null, undefined, a Date, or a number.");
		return params;
	} };
}));
//#endregion
//#region node_modules/.pnpm/zmodem.js@0.1.10_patch_hash=dba85ba4b3429ef2b7cf7722dfd1424332618d438b27499a9bc194fae5594a6e/node_modules/zmodem.js/src/zsession.js
var require_zsession = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var Zmodem = module.exports;
	/**
	* This is where the protocol-level logic lives: the interaction of ZMODEM
	* headers and subpackets. The logic here is not unlikely to need tweaking
	* as little edge cases crop up.
	*/
	Zmodem.DEBUG = false;
	Object.assign(Zmodem, require_encode(), require_text(), require_zdle(), require_zmlib(), require_zheader(), require_zsubpacket(), require_zvalidation(), require_zerror());
	var KEEPALIVE_INTERVAL = 5e3;
	var ZRINIT_FLAGS = [
		"CANFDX",
		"CANOVIO",
		"CANFC32"
	];
	var DEFAULT_RECEIVE_INPUT_MODE = "spool_uint8array";
	var MAX_CHUNK_LENGTH = 8192;
	var BS = 8;
	var OVER_AND_OUT = [79, 79];
	var ABORT_SEQUENCE = Zmodem.ZMLIB.ABORT_SEQUENCE;
	/**
	* A base class for objects that have events.
	*
	* @private
	*/
	var _Eventer = class {
		/**
		* Not called directly.
		*/
		constructor() {
			this._on_evt = {};
			this._evt_once_index = {};
		}
		_Add_event(evt_name) {
			this._on_evt[evt_name] = [];
			this._evt_once_index[evt_name] = [];
		}
		_get_evt_queue(evt_name) {
			if (!this._on_evt[evt_name]) throw "Bad event: " + evt_name;
			return this._on_evt[evt_name];
		}
		/**
		* Register a callback for a given event.
		*
		* @param {string} evt_name - The name of the event.
		*
		* @param {Function} todo - The function to execute when the event happens.
		*/
		on(evt_name, todo) {
			this._get_evt_queue(evt_name).push(todo);
			return this;
		}
		/**
		* Unregister a callback for a given event.
		*
		* @param {string} evt_name - The name of the event.
		*
		* @param {Function} [todo] - The function to execute when the event
		*  happens. If not given, the last event registered for the event
		*  is unregistered.
		*/
		off(evt_name, todo) {
			var queue = this._get_evt_queue(evt_name);
			if (todo) {
				var at = queue.indexOf(todo);
				if (at === -1) throw "“" + todo + "” is not in the “" + evt_name + "” queue.";
				queue.splice(at, 1);
			} else queue.pop();
			return this;
		}
		_Happen(evt_name) {
			var queue = this._get_evt_queue(evt_name);
			var args = Array.apply(null, arguments);
			args.shift();
			var sess = this;
			queue.forEach(function(cb) {
				cb.apply(sess, args);
			});
			return queue.length;
		}
	};
	/**
	* The Session classes handle the protocol-level logic.
	* These shield the user from dealing with headers and subpackets.
	* This is a base class with functionality common to both Receive
	* and Send subclasses.
	*
	* @extends _Eventer
	*/
	Zmodem.Session = class ZmodemSession extends _Eventer {
		/**
		* Parse out a hex header from the given array.
		* If there’s a ZRQINIT or ZRINIT at the beginning,
		* we’ll return it. If the input isn’t a header,
		* for whatever reason, we return undefined.
		*
		* @param {number[]} octets - The bytes to parse.
		*
		* @return {Session|undefined} A Session object if the beginning
		*      of a session was parsable in “octets”; otherwise undefined.
		*/
		static parse(octets) {
			var hdr;
			try {
				hdr = Zmodem.Header.parse_hex(octets);
			} catch (e) {
				return;
			}
			if (!hdr) return;
			switch (hdr.NAME) {
				case "ZRQINIT": return new Zmodem.Session.Receive();
				case "ZRINIT": return new Zmodem.Session.Send(hdr);
			}
		}
		/**
		* Sets the sender function that a Session object will use.
		*
		* @param {Function} sender_func - The function to call.
		*      It will receive an Array with the relevant octets.
		*
		* @return {Session} The session object (for chaining).
		*/
		set_sender(sender_func) {
			this._sender = sender_func;
			return this;
		}
		/**
		* Whether the current Session has ended.
		*
		* @returns {boolean} The ended state.
		*/
		has_ended() {
			return this._has_ended();
		}
		/**
		* Consumes an array of octets as ZMODEM session input.
		*
		* @param {number[]} octets - The input octets.
		*/
		consume(octets) {
			this._before_consume(octets);
			if (this._aborted) throw new Zmodem.Error("already_aborted");
			if (!octets.length) return;
			this._strip_and_enqueue_input(octets);
			if (!this._check_for_abort_sequence(octets)) this._consume_first();
		}
		/**
		* Whether the current Session has been `abort()`ed.
		*
		* @returns {boolean} The aborted state.
		*/
		aborted() {
			return !!this._aborted;
		}
		/**
		* Not called directly.
		*/
		constructor() {
			super();
			this._config = {};
			this._input_buffer = [];
			this._Add_event("receive");
			this._Add_event("garbage");
			this._Add_event("session_end");
		}
		/**
		* Returns the Session object’s role.
		*
		* @returns {string} One of:
		* - `receive`
		* - `send`
		*/
		get_role() {
			return this.type;
		}
		_trim_leading_garbage_until_header() {
			var garbage = Zmodem.Header.trim_leading_garbage(this._input_buffer);
			if (garbage.length) {
				if (this._Happen("garbage", garbage) === 0) console.debug("Garbage: ", String.fromCharCode.apply(String, garbage), garbage);
			}
		}
		_parse_and_consume_header() {
			this._trim_leading_garbage_until_header();
			var new_header_and_crc = Zmodem.Header.parse(this._input_buffer);
			if (!new_header_and_crc) return;
			if (Zmodem.DEBUG) this._log_header("RECEIVED HEADER", new_header_and_crc[0]);
			this._consume_header(new_header_and_crc[0]);
			this._last_header_name = new_header_and_crc[0].NAME;
			this._last_header_crc = new_header_and_crc[1];
			return new_header_and_crc[0];
		}
		_log_header(label, header) {
			console.debug(this.type, label, header.NAME, header._bytes4.join());
		}
		_consume_header(new_header) {
			this._on_receive(new_header);
			var handler = this._next_header_handler && this._next_header_handler[new_header.NAME];
			if (!handler) {
				console.error("Unhandled header!", new_header, this._next_header_handler);
				throw new Zmodem.Error("Unhandled header: " + new_header.NAME);
			}
			this._next_header_handler = null;
			handler.call(this, new_header);
		}
		_check_for_abort_sequence() {
			var abort_at = Zmodem.ZMLIB.find_subarray(this._input_buffer, ABORT_SEQUENCE);
			if (abort_at !== -1) {
				this._input_buffer.splice(0, abort_at + ABORT_SEQUENCE.length);
				this._aborted = true;
				this._on_session_end();
				throw new Zmodem.Error("peer_aborted");
			}
		}
		_send_header(name) {
			if (!this._sender) throw "Need sender!";
			var args = Array.apply(null, arguments);
			var bytes_hdr = this._create_header_bytes(args);
			if (Zmodem.DEBUG) this._log_header("SENDING HEADER", bytes_hdr[1]);
			this._sender(bytes_hdr[0]);
			this._last_sent_header = bytes_hdr[1];
		}
		_create_header_bytes(name_and_args) {
			var hdr = Zmodem.Header.build.apply(Zmodem.Header, name_and_args);
			return [hdr[this._get_header_formatter(name_and_args[0])](this._zencoder), hdr];
		}
		_strip_and_enqueue_input(input) {
			Zmodem.ZMLIB.strip_ignored_bytes(input);
			this._input_buffer.push.apply(this._input_buffer, input);
		}
		/**
		* **STOP!** You probably want to `skip()` an Offer rather than
		* `abort()`. See below.
		*
		* Abort the current session by sending the ZMODEM abort sequence.
		* This function will cause the Session object to refuse to send
		* any further data.
		*
		* Zmodem.Sentry is configured to send all output to the terminal
		* after a session’s `abort()`. That could result in lots of
		* ZMODEM garble being sent to the JavaScript terminal, which you
		* probably don’t want.
		*
		* `skip()` on an Offer is better because Session will continue to
		* discard data until we reach either another file or the
		* sender-initiated end of the ZMODEM session. So no ZMODEM garble,
		* and the session will end successfully.
		*
		* The behavior of `abort()` is subject to change since it’s not
		* very useful as currently implemented.
		*/
		abort() {
			this._sender(ABORT_SEQUENCE.concat([
				BS,
				BS,
				BS,
				BS,
				BS
			]));
			this._aborted = true;
			this._sender = function() {
				throw new Zmodem.Error("already_aborted");
			};
			this._on_session_end();
		}
		_on_session_end() {
			this._Happen("session_end");
		}
		_on_receive(hdr_or_pkt) {
			this._Happen("receive", hdr_or_pkt);
		}
		_before_consume() {}
	};
	function _trim_OO(array) {
		if (0 === Zmodem.ZMLIB.find_subarray(array, OVER_AND_OUT)) array.splice(0, OVER_AND_OUT.length);
		else if (array[0] === OVER_AND_OUT[OVER_AND_OUT.length - 1]) array.splice(0, 1);
		return array;
	}
	/** A class for ZMODEM receive sessions.
	*
	* @extends Session
	*/
	Zmodem.Session.Receive = class ZmodemReceiveSession extends Zmodem.Session {
		/**
		* Not called directly.
		*/
		constructor() {
			super();
			this._Add_event("offer");
			this._Add_event("data_in");
			this._Add_event("file_end");
		}
		/**
		* Consume input bytes from the sender.
		*
		* @private
		* @param {number[]} octets - The bytes to consume.
		*/
		_before_consume(octets) {
			if (this._bytes_after_OO) throw "PROTOCOL: Session is completed!";
			this._bytes_being_consumed = octets;
		}
		/**
		* Return any bytes that have been `consume()`d but
		* came after the end of the ZMODEM session.
		*
		* @returns {number[]} The trailing bytes.
		*/
		get_trailing_bytes() {
			if (this._aborted) return [];
			if (!this._bytes_after_OO) throw "PROTOCOL: Session is not completed!";
			return this._bytes_after_OO.slice(0);
		}
		_has_ended() {
			return this.aborted() || !!this._bytes_after_OO;
		}
		_get_header_formatter() {
			return "to_hex";
		}
		_parse_and_consume_subpacket() {
			var parse_func;
			if (this._last_header_crc === 16) parse_func = "parse16";
			else parse_func = "parse32";
			var subpacket = Zmodem.Subpacket[parse_func](this._input_buffer);
			if (subpacket) {
				if (Zmodem.DEBUG) console.debug(this.type, "RECEIVED SUBPACKET", subpacket);
				this._consume_data(subpacket);
				if (subpacket.frame_end()) this._next_subpacket_handler = null;
			}
			return subpacket;
		}
		_consume_first() {
			if (this._got_ZFIN) {
				if (this._input_buffer.length < 2) return;
				if (Zmodem.ZMLIB.find_subarray(this._input_buffer, OVER_AND_OUT) === 0) {
					this._bytes_after_OO = _trim_OO(this._bytes_being_consumed.slice(0));
					this._on_session_end();
					return;
				} else throw "PROTOCOL: Only thing after ZFIN should be “OO” (79,79), not: " + this._input_buffer.join();
			}
			var parsed;
			do
				if (this._next_subpacket_handler) parsed = this._parse_and_consume_subpacket();
				else parsed = this._parse_and_consume_header();
			while (parsed && this._input_buffer.length);
		}
		_consume_data(subpacket) {
			this._on_receive(subpacket);
			if (!this._next_subpacket_handler) throw "PROTOCOL: Received unexpected data packet after " + this._last_header_name + " header: " + subpacket.get_payload().join();
			this._next_subpacket_handler.call(this, subpacket);
		}
		_octets_to_string(octets) {
			if (!this._textdecoder) this._textdecoder = new Zmodem.Text.Decoder();
			return this._textdecoder.decode(new Uint8Array(octets));
		}
		_consume_ZFILE_data(hdr, subpacket) {
			if (this._file_info) throw "PROTOCOL: second ZFILE data subpacket received";
			var packet_payload = subpacket.get_payload();
			var nul_at = packet_payload.indexOf(0);
			var fname = this._octets_to_string(packet_payload.slice(0, nul_at));
			var the_rest = this._octets_to_string(packet_payload.slice(1 + nul_at)).split(" ");
			var mtime = the_rest[1] && parseInt(the_rest[1], 8) || void 0;
			if (mtime) mtime = /* @__PURE__ */ new Date(mtime * 1e3);
			this._file_info = {
				name: fname,
				size: the_rest[0] ? parseInt(the_rest[0], 10) : null,
				mtime: mtime || null,
				mode: the_rest[2] && parseInt(the_rest[2], 8) || null,
				serial: the_rest[3] && parseInt(the_rest[3], 10) || null,
				files_remaining: the_rest[4] ? parseInt(the_rest[4], 10) : null,
				bytes_remaining: the_rest[5] ? parseInt(the_rest[5], 10) : null
			};
			var xfer = new Offer(hdr.get_options(), this._file_info, this._accept.bind(this), this._skip.bind(this));
			this._current_transfer = xfer;
		}
		_consume_ZDATA_data(subpacket) {
			if (!this._accepted_offer) throw "PROTOCOL: Received data without accepting!";
			if (!this._offset_ok) {
				console.warn("offset not ok!");
				_send_ZRPOS();
				return;
			}
			this._file_offset += subpacket.get_payload().length;
			this._on_data_in(subpacket);
			if (subpacket.ack_expected() && !subpacket.frame_end()) this._send_header("ZACK", Zmodem.ENCODELIB.pack_u32_le(this._file_offset));
		}
		_make_promise_for_between_files() {
			var sess = this;
			return new Promise(function(res) {
				var between_files_handler = {
					ZFILE: function(hdr) {
						this._next_subpacket_handler = function(subpacket) {
							this._next_subpacket_handler = null;
							this._consume_ZFILE_data(hdr, subpacket);
							this._Happen("offer", this._current_transfer);
							res(this._current_transfer);
						};
					},
					ZSINIT: function(hdr) {
						sess._next_subpacket_handler = function(spkt) {
							sess._next_subpacket_handler = null;
							sess._consume_ZSINIT_data(spkt);
							sess._send_header("ZACK");
							sess._next_header_handler = between_files_handler;
						};
					},
					ZFIN: function() {
						this._consume_ZFIN();
						res();
					}
				};
				sess._next_header_handler = between_files_handler;
			});
		}
		_consume_ZSINIT_data(spkt) {
			this._attn = spkt.get_payload();
		}
		/**
		* Start the ZMODEM session by signaling to the sender that
		* we are ready for the first file offer.
		*
		* @returns {Promise} A promise that resolves with an Offer object
		* or, if the sender closes the session immediately without offering
		* anything, nothing.
		*/
		start() {
			if (this._started) throw "Already started!";
			this._started = true;
			var ret = this._make_promise_for_between_files();
			this._send_ZRINIT();
			return ret;
		}
		_accept(offset) {
			this._accepted_offer = true;
			this._file_offset = offset || 0;
			var sess = this;
			var ret = new Promise(function(resolve_accept) {
				sess._next_header_handler = { ZDATA: function on_ZDATA(hdr) {
					this._consume_ZDATA(hdr);
					this._next_subpacket_handler = this._consume_ZDATA_data;
					this._next_header_handler = { ZEOF: function on_ZEOF(hdr) {
						this._consume_ZEOF(hdr);
						this._next_subpacket_handler = null;
						this._make_promise_for_between_files();
						resolve_accept();
						this._send_ZRINIT();
					} };
				} };
			});
			this._send_ZRPOS();
			return ret;
		}
		_skip() {
			var ret = this._make_promise_for_between_files();
			if (this._accepted_offer) {
				if (!this._current_transfer) return;
				var bound_make_promise_for_between_files = function() {
					this._accepted_offer = false;
					this._next_subpacket_handler = null;
					this._make_promise_for_between_files();
				}.bind(this);
				Object.assign(this._next_header_handler, {
					ZEOF: bound_make_promise_for_between_files,
					ZDATA: function() {
						bound_make_promise_for_between_files();
						this._next_header_handler.ZEOF = bound_make_promise_for_between_files;
					}.bind(this)
				});
			}
			this._file_info = null;
			this._send_header("ZSKIP");
			return ret;
		}
		_send_ZRINIT() {
			this._send_header("ZRINIT", ZRINIT_FLAGS);
		}
		_consume_ZFIN() {
			this._got_ZFIN = true;
			this._send_header("ZFIN");
		}
		_consume_ZEOF(header) {
			if (this._file_offset !== header.get_offset()) throw "ZEOF offset mismatch; unimplemented (local: " + this._file_offset + "; ZEOF: " + header.get_offset() + ")";
			this._on_file_end();
			this._file_info = null;
			this._current_transfer = null;
		}
		_consume_ZDATA(header) {
			if (this._file_offset === header.get_offset()) this._offset_ok = true;
			else throw "Error correction is unimplemented.";
		}
		_send_ZRPOS() {
			this._send_header("ZRPOS", this._file_offset);
		}
		_on_file_end() {
			this._Happen("file_end");
			if (this._current_transfer) {
				this._current_transfer._Happen("complete");
				this._current_transfer = null;
			}
		}
		_on_data_in(subpacket) {
			this._Happen("data_in", subpacket);
			if (this._current_transfer) this._current_transfer._Happen("input", subpacket.get_payload());
		}
	};
	Object.assign(Zmodem.Session.Receive.prototype, { type: "receive" });
	/**
	* @typedef {Object} FileDetails
	*
	* @property {string} name - The name of the file.
	*
	* @property {number} [size] - The file size, in bytes.
	*
	* @property {number} [mode] - The file mode (e.g., 0100644).
	*
	* @property {Date|number} [mtime] - The file’s modification time.
	*  When expressed as a number, the unit is epoch seconds.
	*
	* @property {number} [files_remaining] - Inclusive of the current file,
	*  so this value is never less than 1.
	*
	* @property {number} [bytes_remaining] - Inclusive of the current file.
	*/
	/**
	* Common methods for Transfer and Offer objects.
	*
	* @mixin
	*/
	var Transfer_Offer_Mixin = {
		/**
		* Returns the file details object.
		* @returns {FileDetails} `mtime` is a Date.
		*/
		get_details: function get_details() {
			return Object.assign({}, this._file_info);
		},
		/**
		* Returns a parse of the ZFILE header’s payload.
		*
		* @returns {Object} Members are:
		*
		* - `conversion` (string | undefined)
		* - `management` (string | undefined)
		* - `transfer` (string | undefined)
		* - `sparse` (boolean)
		*/
		get_options: function get_options() {
			return Object.assign({}, this._zfile_opts);
		},
		/**
		* Returns the offset based on the last transferred chunk.
		* @returns {number} The file offset (i.e., number of bytes after
		*  the start of the file).
		*/
		get_offset: function get_offset() {
			return this._file_offset;
		}
	};
	/**
	* A class to represent a sender’s interaction with a single file
	* transfer within a batch. When a receiver accepts an offer, the
	* Session instantiates this class and passes the instance as the
	* promise resolution from send_offer().
	*
	* @mixes Transfer_Offer_Mixin
	*/
	var Transfer = class {
		/**
		* Not called directly.
		*/
		constructor(file_info, offset, send_func, end_func) {
			this._file_info = file_info;
			this._file_offset = offset || 0;
			this._send = send_func;
			this._end = end_func;
		}
		/**
		* Send a (non-terminal) piece of the file.
		*
		* @param { number[] | Uint8Array } array_like - The bytes to send.
		*/
		send(array_like) {
			this._send(array_like);
			this._file_offset += array_like.length;
		}
		/**
		* Complete the file transfer.
		*
		* @param { number[] | Uint8Array } [array_like] - The last bytes to send.
		*
		* @return { Promise } Resolves when the receiver has indicated
		*      acceptance of the end of the file transfer.
		*/
		end(array_like) {
			var ret = this._end(array_like || []);
			if (array_like) this._file_offset += array_like.length;
			return ret;
		}
	};
	Object.assign(Transfer.prototype, Transfer_Offer_Mixin);
	/**
	* A class to represent a receiver’s interaction with a single file
	* transfer offer within a batch. There is functionality here to
	* skip or accept offered files and either to spool the packet
	* payloads or to handle them yourself.
	*
	* @mixes Transfer_Offer_Mixin
	*/
	var Offer = class extends _Eventer {
		/**
		* Not called directly.
		*/
		constructor(zfile_opts, file_info, accept_func, skip_func) {
			super();
			this._zfile_opts = zfile_opts;
			this._file_info = file_info;
			this._accept_func = accept_func;
			this._skip_func = skip_func;
			this._Add_event("input");
			this._Add_event("complete");
			this.on("input", this._input_handler);
		}
		_verify_not_skipped() {
			if (this._skipped) throw new Zmodem.Error("Already skipped!");
		}
		/**
		* Tell the sender that you don’t want the offered file.
		*
		* You can send this in lieu of `accept()` or after it, e.g.,
		* if you find that the transfer is taking too long. Note that,
		* if you `skip()` after you `accept()`, you’ll likely have to
		* wait for buffers to clear out.
		*
		*/
		skip() {
			this._verify_not_skipped();
			this._skipped = true;
			return this._skip_func.apply(this, arguments);
		}
		/**
		* Tell the sender to send the offered file.
		*
		* @param {Object} [opts] - Can be:
		* @param {string} [opts.oninput=spool_uint8array] - Can be:
		*
		* - `spool_uint8array`: Stores the ZMODEM
		*     packet payloads as Uint8Array instances.
		*     This makes for an easy transition to a Blob,
		*     which JavaScript can use to save the file to disk.
		*
		* - `spool_array`: Stores the ZMODEM packet payloads
		*     as Array instances. Each value is an octet value.
		*
		* - (function): A handler that receives each payload
		*     as it arrives. The Offer object does not store
		*     the payloads internally when thus configured.
		*
		* @return { Promise } Resolves when the file is fully received.
		*      If the Offer has been spooling
		*      the packet payloads, the promise resolves with an Array
		*      that contains those payloads.
		*/
		accept(opts) {
			this._verify_not_skipped();
			if (this._accepted) throw new Zmodem.Error("Already accepted!");
			this._accepted = true;
			if (!opts) opts = {};
			this._file_offset = opts.offset || 0;
			switch (opts.on_input) {
				case null:
				case void 0:
				case "spool_array":
				case DEFAULT_RECEIVE_INPUT_MODE:
					this._spool = [];
					break;
				default: if (typeof opts.on_input !== "function") throw "Invalid “on_input”: " + opts.on_input;
			}
			this._input_handler_mode = opts.on_input || DEFAULT_RECEIVE_INPUT_MODE;
			return this._accept_func(this._file_offset).then(this._get_spool.bind(this));
		}
		_input_handler(payload) {
			this._file_offset += payload.length;
			if (typeof this._input_handler_mode === "function") this._input_handler_mode(payload);
			else {
				if (this._input_handler_mode === DEFAULT_RECEIVE_INPUT_MODE) payload = new Uint8Array(payload);
				else if (this._input_handler_mode !== "spool_array") throw new Zmodem.Error("WTF?? _input_handler_mode = " + this._input_handler_mode);
				this._spool.push(payload);
			}
		}
		_get_spool() {
			return this._spool;
		}
	};
	Object.assign(Offer.prototype, Transfer_Offer_Mixin);
	var SENDER_BINARY_HEADER = {
		ZFILE: true,
		ZDATA: true
	};
	/**
	* A class that encapsulates behavior for a ZMODEM sender.
	*
	* @extends Session
	*/
	Zmodem.Session.Send = class ZmodemSendSession extends Zmodem.Session {
		/**
		* Not called directly.
		*/
		constructor(zrinit_hdr) {
			super();
			if (!zrinit_hdr) throw "Need first header!";
			else if (zrinit_hdr.NAME !== "ZRINIT") throw "First header should be ZRINIT, not " + zrinit_hdr.NAME;
			this._last_header_name = "ZRINIT";
			this._subpacket_encode_func = "encode16";
			this._zencoder = new Zmodem.ZDLE();
			this._consume_ZRINIT(zrinit_hdr);
			this._file_offset = 0;
			this._start_keepalive_on_set_sender = true;
		}
		/**
		* Sets the sender function. The first time this is called,
		* it will also initiate a keepalive using ZSINIT until the
		* first file is sent.
		*
		* @param {Function} func - The function to call.
		*  It will receive an Array with the relevant octets.
		*
		* @return {Session} The session object (for chaining).
		*/
		set_sender(func) {
			super.set_sender(func);
			if (this._start_keepalive_on_set_sender) {
				this._start_keepalive_on_set_sender = false;
				this._start_keepalive();
			}
			return this;
		}
		_get_header_formatter(name) {
			return SENDER_BINARY_HEADER[name] ? "to_binary16" : "to_hex";
		}
		_start_keepalive() {
			if (!this._keepalive_promise) {
				var sess = this;
				this._keepalive_promise = new Promise(function(resolve) {
					sess._keepalive_timeout = setTimeout(resolve, KEEPALIVE_INTERVAL);
				}).then(function() {
					sess._next_header_handler = { ZACK: function() {
						sess._got_ZSINIT_ZACK = true;
					} };
					sess._send_ZSINIT();
					sess._keepalive_promise = null;
					sess._start_keepalive();
				});
			}
		}
		_stop_keepalive() {
			if (this._keepalive_promise) {
				clearTimeout(this._keepalive_timeout);
				this._keep_alive_promise = null;
			}
		}
		_send_ZSINIT() {
			var zsinit_flags = [];
			if (this._zencoder.escapes_ctrl_chars()) zsinit_flags.push("ESCCTL");
			this._send_header_and_data(["ZSINIT", zsinit_flags], [0], "end_ack");
		}
		_consume_ZRINIT(hdr) {
			this._last_ZRINIT = hdr;
			if (hdr.get_buffer_size()) throw "Buffer size (" + hdr.get_buffer_size() + ") is unsupported!";
			if (!hdr.can_full_duplex()) throw "Half-duplex I/O is unsupported!";
			if (!hdr.can_overlap_io()) throw "Non-overlap I/O is unsupported!";
			if (hdr.escape_8th_bit()) throw "8-bit escaping is unsupported!";
			this._zencoder.set_escape_ctrl_chars(true);
			if (!hdr.escape_ctrl_chars()) console.debug("Peer didn’t request escape of all control characters. Will send ZSINIT to force recognition of escaped control characters.");
		}
		_ensure_receiver_escapes_ctrl_chars() {
			var promise;
			if (!this._last_ZRINIT.escape_ctrl_chars() && !this._got_ZSINIT_ZACK) {
				var sess = this;
				promise = new Promise(function(res) {
					sess._next_header_handler = { ZACK: (hdr) => {
						res();
					} };
					sess._send_ZSINIT();
				});
			} else promise = Promise.resolve();
			return promise;
		}
		_convert_params_to_offer_payload_array(params) {
			params = Zmodem.Validation.offer_parameters(params);
			var subpacket_payload = params.name + "\0";
			var subpacket_space_pieces = [
				(params.size || 0).toString(10),
				params.mtime ? params.mtime.toString(8) : "0",
				params.mode ? (32768 | params.mode).toString(8) : "0",
				"0"
			];
			if (params.files_remaining) {
				subpacket_space_pieces.push(params.files_remaining);
				if (params.bytes_remaining) subpacket_space_pieces.push(params.bytes_remaining);
			}
			subpacket_payload += subpacket_space_pieces.join(" ");
			return this._string_to_octets(subpacket_payload);
		}
		/**
		* Send an offer to the receiver.
		*
		* @param {FileDetails} params - All about the file you want to transfer.
		*
		* @returns {Promise} If the receiver accepts the offer, then the
		* resolution is a Transfer object; otherwise the resolution is
		* undefined.
		*/
		send_offer(params) {
			if (Zmodem.DEBUG) console.debug("SENDING OFFER", params);
			if (!params) throw "need file params!";
			if (this._sending_file) throw "Already sending file!";
			var payload_array = this._convert_params_to_offer_payload_array(params);
			this._stop_keepalive();
			var sess = this;
			function zrpos_handler_setter_func() {
				sess._next_header_handler = { ZRPOS: function(hdr) {
					if (Zmodem.DEBUG) console.warn("Mid-transfer ZRPOS … implementation error?");
					zrpos_handler_setter_func();
				} };
			}
			var doer_func = function() {
				var handler_setter_promise = new Promise(function(res) {
					sess._next_header_handler = {
						ZSKIP: function() {
							sess._start_keepalive();
							res();
						},
						ZRPOS: function(hdr) {
							sess._sending_file = true;
							zrpos_handler_setter_func();
							res(new Transfer(params, hdr.get_offset(), sess._send_interim_file_piece.bind(sess), sess._end_file.bind(sess)));
						}
					};
				});
				sess._send_header_and_data(["ZFILE"], payload_array, "end_ack");
				delete sess._sent_ZDATA;
				return handler_setter_promise;
			};
			return this._ensure_receiver_escapes_ctrl_chars().then(doer_func);
		}
		_send_header_and_data(hdr_name_and_args, data_arr, frameend) {
			var bytes_hdr = this._create_header_bytes(hdr_name_and_args);
			var data_bytes = this._build_subpacket_bytes(data_arr, frameend);
			bytes_hdr[0].push.apply(bytes_hdr[0], data_bytes);
			if (Zmodem.DEBUG) {
				this._log_header("SENDING HEADER", bytes_hdr[1]);
				console.debug(this.type, "-- HEADER PAYLOAD:", frameend, data_bytes.length);
			}
			this._sender(bytes_hdr[0]);
			this._last_sent_header = bytes_hdr[1];
		}
		_build_subpacket_bytes(bytes_arr, frameend) {
			return Zmodem.Subpacket.build(bytes_arr, frameend)[this._subpacket_encode_func](this._zencoder);
		}
		_build_and_send_subpacket(bytes_arr, frameend) {
			this._sender(this._build_subpacket_bytes(bytes_arr, frameend));
		}
		_string_to_octets(string) {
			if (!this._textencoder) this._textencoder = new Zmodem.Text.Encoder();
			var uint8arr = this._textencoder.encode(string);
			return Array.prototype.slice.call(uint8arr);
		}
		_send_interim_file_piece(bytes_obj) {
			this._send_file_part(bytes_obj, "no_end_no_ack");
			return Promise.resolve();
		}
		_ensure_we_are_sending() {
			if (!this._sending_file) throw "Not sending a file currently!";
		}
		_end_file(bytes_obj) {
			this._ensure_we_are_sending();
			this._send_file_part(bytes_obj, "end_no_ack");
			var sess = this;
			var ret = new Promise(function(res) {
				sess._sending_file = false;
				sess._prepare_to_receive_ZRINIT(res);
			});
			this._send_header("ZEOF", this._file_offset);
			this._file_offset = 0;
			return ret;
		}
		_prepare_to_receive_ZRINIT(after_consume) {
			this._next_header_handler = { ZRINIT: function(hdr) {
				this._consume_ZRINIT(hdr);
				if (after_consume) after_consume();
			} };
		}
		/**
		* Signal to the receiver that the ZMODEM session is wrapping up.
		*
		* @returns {Promise} Resolves when the receiver has responded to
		* our signal that the session is over.
		*/
		close() {
			var ok_to_close = this._last_header_name === "ZRINIT";
			if (!ok_to_close) ok_to_close = this._last_header_name === "ZSKIP";
			if (!ok_to_close) ok_to_close = this._last_sent_header.name === "ZSINIT" && this._last_header_name === "ZACK";
			if (!ok_to_close) throw "Can’t close; last received header was “" + this._last_header_name + "”";
			var sess = this;
			var ret = new Promise(function(res, rej) {
				sess._next_header_handler = { ZFIN: function() {
					sess._sender(OVER_AND_OUT);
					sess._sent_OO = true;
					sess._on_session_end();
					res();
				} };
			});
			this._send_header("ZFIN");
			return ret;
		}
		_has_ended() {
			return this.aborted() || !!this._sent_OO;
		}
		_send_file_part(bytes_obj, final_packetend) {
			if (!this._sent_ZDATA) {
				this._send_header("ZDATA", this._file_offset);
				this._sent_ZDATA = true;
			}
			var obj_offset = 0;
			var bytes_count = bytes_obj.length;
			while (true) {
				var chunk_size = Math.min(obj_offset + MAX_CHUNK_LENGTH, bytes_count) - obj_offset;
				var at_end = chunk_size + obj_offset >= bytes_count;
				var chunk = bytes_obj.slice(obj_offset, obj_offset + chunk_size);
				if (!(chunk instanceof Array)) chunk = Array.prototype.slice.call(chunk);
				this._build_and_send_subpacket(chunk, at_end ? final_packetend : "no_end_no_ack");
				this._file_offset += chunk_size;
				obj_offset += chunk_size;
				if (obj_offset >= bytes_count) break;
			}
		}
		_consume_first() {
			if (!this._parse_and_consume_header()) {
				if (this._input_buffer.join() === "67") throw "Receiver has fallen back to YMODEM.";
			}
		}
		_on_session_end() {
			this._stop_keepalive();
			super._on_session_end();
		}
	};
	Object.assign(Zmodem.Session.Send.prototype, { type: "send" });
}));
//#endregion
//#region node_modules/.pnpm/zmodem.js@0.1.10_patch_hash=dba85ba4b3429ef2b7cf7722dfd1424332618d438b27499a9bc194fae5594a6e/node_modules/zmodem.js/src/zsentry.js
var require_zsentry = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var Zmodem = module.exports;
	Object.assign(Zmodem, require_zmlib(), require_zsession());
	var MAX_ZM_HEX_START_LENGTH = 21;
	var COMMON_ZM_HEX_START = [
		42,
		42,
		24,
		66,
		48
	];
	var SENTRY_CONSTRUCTOR_REQUIRED_ARGS = [
		"to_terminal",
		"on_detect",
		"on_retract",
		"sender"
	];
	/**
	* An instance of this object is passed to the Sentry’s on_detect
	* callback each time the Sentry object sees what looks like the
	* start of a ZMODEM session.
	*
	* Note that it is possible for a detection to be “retracted”
	* if the Sentry consumes bytes afterward that are not ZMODEM.
	* When this happens, the Sentry’s `retract` event will fire,
	* after which the Detection object is no longer usable.
	*/
	var Detection = class {
		/**
		* Not called directly.
		*/
		constructor(session_type, accepter, denier, checker) {
			this._confirmer = accepter;
			this._denier = denier;
			this._is_valid = checker;
			this._session_type = session_type;
		}
		/**
		* Confirm that the detected ZMODEM sequence indicates the
		* start of a ZMODEM session.
		*
		* @return {Session} The ZMODEM Session object (i.e., either a
		*  Send or Receive instance).
		*/
		confirm() {
			return this._confirmer.apply(this, arguments);
		}
		/**
		* Tell the Sentry that the detected bytes sequence is
		* **NOT** intended to be the start of a ZMODEM session.
		*/
		deny() {
			return this._denier.apply(this, arguments);
		}
		/**
		* Tells whether the Detection is still valid; i.e., whether
		* the Sentry has `consume()`d bytes that invalidate the
		* Detection.
		*
		* @returns {boolean} Whether the Detection is valid.
		*/
		is_valid() {
			return this._is_valid.apply(this, arguments);
		}
		/**
		* Gives the session’s role.
		*
		* @returns {string} One of:
		* - `receive`
		* - `send`
		*/
		get_session_role() {
			return this._session_type;
		}
	};
	/**
	* Class that parses an input stream for the beginning of a
	* ZMODEM session. We look for the tell-tale signs
	* of a ZMODEM transfer and allow the client to determine whether
	* it’s really ZMODEM or not.
	*
	* This is the “mother” class for zmodem.js;
	* all other class instances are created, directly or indirectly,
	* by an instance of this class.
	*
	* This logic is not unlikely to need tweaking, and it can never
	* be fully bulletproof; if it could be bulletproof it would be
	* simpler since there wouldn’t need to be the .confirm()/.deny()
	* step.
	*
	* One thing you could do to make things a bit simpler *is* just
	* to make that assumption for your users--i.e., to .confirm()
	* Detection objects automatically. That’ll be one less step
	* for the user, but an unaccustomed user might find that a bit
	* confusing. It’s also then possible to have a “false positive”:
	* a text stream that contains a ZMODEM initialization string but
	* isn’t, in fact, meant to start a ZMODEM session.
	*
	* Workflow:
	*  - parse all input with .consume(). As long as nothing looks
	*      like ZMODEM, all the traffic will go to to_terminal().
	*
	*  - when a “tell-tale” sequence of bytes arrives, we create a
	*      Detection object and pass it to the “on_detect” handler.
	*
	*  - Either .confirm() or .deny() with the Detection object.
	*      This is the user’s chance to say, “yeah, I know those
	*      bytes look like ZMODEM, but they’re not. So back off!”
	*
	*      If you .confirm(), the Session object is returned, and
	*      further input that goes to the Sentry’s .consume() will
	*      go to the (now-active) Session object.
	*
	*  - Sometimes additional traffic arrives that makes it apparent
	*      that no ZMODEM session is intended to start; in this case,
	*      the Sentry marks the Detection as “stale” and calls the
	*      `on_retract` handler. Any attempt from here to .confirm()
	*      on the Detection object will prompt an exception.
	*
	*      (This “retraction” behavior will only happen prior to
	*      .confirm() or .deny() being called on the Detection object.
	*      Beyond that point, either the Session has to deal with the
	*      “garbage”, or it’s back to the terminal anyway.
	*
	*  - Once the Session object is done, the Sentry will again send
	*      all traffic to to_terminal().
	*/
	Zmodem.Sentry = class ZmodemSentry {
		/**
		* Invoked directly. Creates a new Sentry that inspects all
		* traffic before it goes to the terminal.
		*
		* @param {Object} options - The Sentry parameters
		*
		* @param {Function} options.to_terminal - Handler that sends
		* traffic to the terminal object. Receives an iterable object
		* (e.g., an Array) that contains octet numbers.
		*
		* @param {Function} options.on_detect - Handler for new
		* detection events. Receives a new Detection object.
		*
		* @param {Function} options.on_retract - Handler for retraction
		* events. Receives no input.
		*
		* @param {Function} options.sender - Handler that sends traffic to
		* the peer. If, for example, your application uses WebSocket to talk
		* to the peer, use this to send data to the WebSocket instance.
		*/
		constructor(options) {
			if (!options) throw "Need options!";
			var sentry = this;
			SENTRY_CONSTRUCTOR_REQUIRED_ARGS.forEach(function(arg) {
				if (!options[arg]) throw "Need “" + arg + "”!";
				sentry["_" + arg] = options[arg];
			});
			this._cache = [];
		}
		_after_session_end() {
			this._zsession = null;
		}
		/**
		* “Consumes” a piece of input:
		*
		*  - If there is no active or pending ZMODEM session, the text is
		*      all output. (This is regardless of whether we’ve got a new
		*      Detection.)
		*
		*  - If there is no active ZMODEM session and the input **ends** with
		*      a ZRINIT or ZRQINIT, then a new Detection object is created,
		*      and it is passed to the “on_detect” function.
		*      If there was another pending Detection object, it is retracted.
		*
		*  - If there is no active ZMODEM session and the input does NOT end
		*      with a ZRINIT or ZRQINIT, then any pending Detection object is
		*      retracted.
		*
		*  - If there is an active ZMODEM session, the input is passed to it.
		*      Any non-ZMODEM data (i.e., “garbage”) parsed from the input
		*      is sent to output.
		*      If the ZMODEM session ends, any post-ZMODEM part of the input
		*      is sent to output.
		*
		*  @param {number[] | ArrayBuffer} input - Octets to parse as input.
		*/
		consume(input) {
			if (!(input instanceof Array)) input = Array.prototype.slice.call(new Uint8Array(input));
			if (this._zsession) {
				var session_before_consume = this._zsession;
				session_before_consume.consume(input);
				if (session_before_consume.has_ended()) {
					if (session_before_consume.type === "receive") input = session_before_consume.get_trailing_bytes();
					else input = [];
				} else return;
			}
			var new_session = this._parse(input);
			var to_terminal = input;
			if (new_session) {
				if (!!this._parsed_session) {
					if (this._parsed_session.type === new_session.type) to_terminal = [];
					this._on_retract();
				}
				this._parsed_session = new_session;
				var sentry = this;
				function checker() {
					return sentry._parsed_session === new_session;
				}
				function accepter() {
					if (!this.is_valid()) throw "Stale ZMODEM session!";
					new_session.on("garbage", sentry._to_terminal);
					new_session.on("session_end", sentry._after_session_end.bind(sentry));
					new_session.set_sender(sentry._sender);
					delete sentry._parsed_session;
					return sentry._zsession = new_session;
				}
				this._on_detect(new Detection(new_session.type, accepter, this._send_abort.bind(this), checker));
			} else {
				var expired_session = this._parsed_session;
				this._parsed_session = null;
				if (expired_session) {
					if (to_terminal.length === 1 && to_terminal[0] === 67) this._send_abort();
					this._on_retract();
				}
			}
			this._to_terminal(to_terminal);
		}
		/**
		* @return {Session|null} The sentry’s current Session object, or
		*      null if there is none.
		*/
		get_confirmed_session() {
			return this._zsession || null;
		}
		_send_abort() {
			this._sender(Zmodem.ZMLIB.ABORT_SEQUENCE);
		}
		/**
		* Parse an input stream and decide how much of it goes to the
		* terminal or to a new Session object.
		*
		* This will accommodate input strings that are fragmented
		* across calls to this function; e.g., if you send the first
		* two bytes at the end of one parse() call then send the rest
		* at the beginning of the next, parse() will recognize it as
		* the beginning of a ZMODEM session.
		*
		* In order to keep from blocking any actual useful data to the
		* terminal in real-time, this will send on the initial
		* ZRINIT/ZRQINIT bytes to the terminal. They’re meant to go to the
		* terminal anyway, so that should be fine.
		*
		* @private
		*
		* @param {Array|Uint8Array} array_like - The input bytes.
		*      Each member should be a number between 0 and 255 (inclusive).
		*
		* @return {Array} A two-member list:
		*      0) the bytes that should be printed on the terminal
		*      1) the created Session object (if any)
		*/
		_parse(array_like) {
			var cache = this._cache;
			cache.push.apply(cache, array_like);
			while (true) {
				let common_hex_at = Zmodem.ZMLIB.find_subarray(cache, COMMON_ZM_HEX_START);
				if (-1 === common_hex_at) break;
				cache.splice(0, common_hex_at);
				let zsession;
				try {
					zsession = Zmodem.Session.parse(cache);
				} catch (err) {}
				if (!zsession) break;
				if (cache.length === 1 && cache[0] === Zmodem.ZMLIB.XON) cache.shift();
				return cache.length ? null : zsession;
			}
			cache.splice(MAX_ZM_HEX_START_LENGTH);
			return null;
		}
	};
}));
//#endregion
//#region node_modules/.pnpm/zmodem.js@0.1.10_patch_hash=dba85ba4b3429ef2b7cf7722dfd1424332618d438b27499a9bc194fae5594a6e/node_modules/zmodem.js/src/zmodem.js
var require_zmodem = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	Object.assign(module.exports, require_zsentry());
}));
//#endregion
//#region node_modules/.pnpm/zmodem.js@0.1.10_patch_hash=dba85ba4b3429ef2b7cf7722dfd1424332618d438b27499a9bc194fae5594a6e/node_modules/zmodem.js/src/zmodem_browser.js
var require_zmodem_browser = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var Zmodem = module.exports;
	window.Zmodem = Zmodem;
	Object.assign(Zmodem, require_zmodem());
	function _check_aborted(session) {
		if (session.aborted()) throw new Zmodem.Error("aborted");
	}
	/** Browser-specific tools
	*
	* @exports Browser
	*/
	Zmodem.Browser = {
		/**
		* Send a batch of files in sequence. The session is left open
		* afterward, which allows for more files to be sent if desired.
		*
		* @param {Zmodem.Session} session - The send session
		*
		* @param {FileList|Array} files - A list of File objects
		*
		* @param {Object} [options]
		* @param {Function} [options.on_offer_response] - Called when an
		* offer response arrives. Arguments are:
		*
		* - (File) - The File object that corresponds to the offer.
		* - (Transfer|undefined) - If the receiver accepts the offer, then
		* this is a Transfer object; otherwise it’s undefined.
		*
		* @param {Function} [options.on_progress] - Called immediately
		* after a chunk of a file is sent. Arguments are:
		*
		* - (File) - The File object that corresponds to the file.
		* - (Transfer) - The Transfer object for the current transfer.
		* - (Uint8Array) - The chunk of data that was just loaded from disk
		* and sent to the receiver.
		*
		* @param {Function} [options.on_file_complete] - Called immediately
		* after the last file packet is sent. Arguments are:
		*
		* - (File) - The File object that corresponds to the file.
		* - (Transfer) - The Transfer object for the now-completed transfer.
		*
		* @return {Promise} A Promise that fulfills when the batch is done.
		*      Note that skipped files are not considered an error condition.
		*/
		send_files: function send_files(session, files, options) {
			if (!options) options = {};
			var batch = [];
			var total_size = 0;
			for (var f = files.length - 1; f >= 0; f--) {
				var fobj = files[f];
				total_size += fobj.size;
				batch[f] = {
					obj: fobj,
					name: fobj.name,
					size: fobj.size,
					mtime: new Date(fobj.lastModified),
					files_remaining: files.length - f,
					bytes_remaining: total_size
				};
			}
			var file_idx = 0;
			function promise_callback() {
				var cur_b = batch[file_idx];
				if (!cur_b) return Promise.resolve();
				file_idx++;
				return session.send_offer(cur_b).then(function after_send_offer(xfer) {
					if (options.on_offer_response) options.on_offer_response(cur_b.obj, xfer);
					if (xfer === void 0) return promise_callback();
					return new Promise(function(res) {
						var reader = new FileReader();
						reader.onerror = function reader_onerror(e) {
							console.error("file read error", e);
							throw "File read error: " + e;
						};
						var piece;
						reader.onprogress = function reader_onprogress(e) {
							if (e.target.result) {
								piece = new Uint8Array(e.target.result, xfer.get_offset());
								_check_aborted(session);
								xfer.send(piece);
								if (options.on_progress) options.on_progress(cur_b.obj, xfer, piece);
							}
						};
						reader.onload = function reader_onload(e) {
							piece = new Uint8Array(e.target.result, xfer, piece);
							_check_aborted(session);
							xfer.end(piece).then(function() {
								if (options.on_progress && piece.length) options.on_progress(cur_b.obj, xfer, piece);
								if (options.on_file_complete) options.on_file_complete(cur_b.obj, xfer);
								res(promise_callback());
							});
						};
						reader.readAsArrayBuffer(cur_b.obj);
					});
				});
			}
			return promise_callback();
		},
		/**
		* Prompt a user to save the given packets as a file by injecting an
		* `<a>` element (with `display: none` styling) into the page and
		* calling the element’s `click()`
		* method. The element is removed immediately after.
		*
		* @param {Array} packets - Same as the first argument to [Blob’s constructor](https://developer.mozilla.org/en-US/docs/Web/API/Blob).
		* @param {string} name - The name to give the file.
		*/
		save_to_disk: function save_to_disk(packets, name) {
			var blob = new Blob(packets);
			var url = URL.createObjectURL(blob);
			var el = document.createElement("a");
			el.style.display = "none";
			el.href = url;
			el.download = name;
			document.body.appendChild(el);
			el.click();
			document.body.removeChild(el);
		}
	};
}));
//#endregion
//#region src/utils/zmodem.ts
/**
* 创建 ZMODEM Sentry 实例
* Sentry 拦截所有服务器数据，检测 ZMODEM 协议序列
*/
function createSentry(opts) {
	return new import_zmodem_browser.Sentry({
		to_terminal: opts.toTerminal,
		sender: opts.sender,
		on_detect: opts.onDetect,
		on_retract: opts.onRetract
	});
}
/**
* 将 base64 字符串转换为数字数组（octets）
*/
function base64ToOctets(base64) {
	const binary = atob(base64);
	const octets = new Array(binary.length);
	for (let i = 0; i < binary.length; i++) octets[i] = binary.charCodeAt(i);
	return octets;
}
/**
* 将字符串转换为数字数组（octets）
*/
function stringToOctets(str) {
	const uint8 = new TextEncoder().encode(str);
	return Array.from(uint8);
}
/**
* 将数字数组（octets）发送给 WebSocket（base64编码）
*/
function octetsToBase64(octets) {
	const arr = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
	let binary = "";
	for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
	return btoa(binary);
}
/**
* 格式化文件大小
*/
function formatFileSize(bytes) {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = [
		"B",
		"KB",
		"MB",
		"GB"
	];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
var import_zmodem_browser;
var init_zmodem = __esmMin((() => {
	import_zmodem_browser = /* @__PURE__ */ __toESM(require_zmodem_browser());
}));
//#endregion
//#region src/service/ai.ts
/**
* 解包 API 响应
* base.request 返回 {ret, msg, data}，此函数提取 data 字段
* 若 ret !== 0 则抛出异常
*/
function unwrap$4(res) {
	if (res && typeof res === "object" && "ret" in res) {
		if (res.ret !== 0) throw new Error(res.msg || "请求失败");
		return res.data;
	}
	return res;
}
function getAIConfig() {
	return request("/api/ai/getConfig", {}).then(unwrap$4);
}
function updateAIConfig(config) {
	return request("/api/ai/updateConfig", config).then(unwrap$4);
}
function clearHistory(sessionId) {
	return request("/api/ai/clearHistory", { sessionId }).then(unwrap$4);
}
function getDisplayHistory(sessionId) {
	return request("/api/ai/getDisplayHistory", { sessionId }).then(unwrap$4);
}
function saveDisplayHistory(sessionId, messages, sessionName) {
	return request("/api/ai/saveDisplayHistory", {
		sessionId,
		messages,
		sessionName
	}).then(unwrap$4);
}
function listHistories() {
	return request("/api/ai/listHistories", {}).then(unwrap$4);
}
function loadHistory(sessionId) {
	return request("/api/ai/loadHistory", { sessionId }).then(unwrap$4);
}
function getSystemContext(sessionId) {
	return request("/api/ai/getSystemContext", { sessionId }).then(unwrap$4);
}
function getSkills() {
	return request("/api/ai/getSkills", {}).then(unwrap$4);
}
var init_ai = __esmMin((() => {
	init_base();
}));
//#endregion
//#region src/service/audit.ts
function unwrap$3(res) {
	if (res && typeof res === "object" && "ret" in res) {
		if (res.ret !== 0) throw new Error(res.msg || "请求失败");
		return res.data;
	}
	return res;
}
function getAuditLogs(query = {}) {
	return request("/api/audit/list", query).then(unwrap$3);
}
function getAuditStats(date) {
	return request("/api/audit/stats", { date }).then(unwrap$3);
}
function exportAuditLogs(startDate, endDate, format = "json") {
	return request("/api/audit/export", {
		startDate,
		endDate,
		format
	}).then(unwrap$3);
}
var init_audit = __esmMin((() => {
	init_base();
}));
//#endregion
//#region src/utils/clipboard.ts
function copyText(text) {
	const clip = window.electronAPI?.clipboard;
	if (clip) try {
		clip.writeText(text);
		return true;
	} catch {
		return false;
	}
	const textarea = document.createElement("textarea");
	textarea.value = text;
	textarea.setAttribute("readonly", "");
	document.body.appendChild(textarea);
	textarea.select();
	try {
		return document.execCommand("copy");
	} catch {
		return false;
	} finally {
		document.body.removeChild(textarea);
	}
}
async function copy(text) {
	const clip = window.electronAPI?.clipboard;
	if (clip) try {
		clip.writeText(text);
		return true;
	} catch {
		return false;
	}
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return copyText(text);
	}
}
var init_clipboard = __esmMin((() => {}));
//#endregion
//#region src/components/audit-panel/index.vue?vue&type=script&setup=true&lang.ts
var _hoisted_1$9, _hoisted_2$9, _hoisted_3$8, _hoisted_4$8, _hoisted_5$8, _hoisted_6$8, _hoisted_7$8, _hoisted_8$8, _hoisted_9$8, _hoisted_10$8, _hoisted_11$8, _hoisted_12$8, _hoisted_13$8, _hoisted_14$8, _hoisted_15$8, _hoisted_16$8, _hoisted_17$7, _hoisted_18$7, _hoisted_19$7, _hoisted_20$7, _hoisted_21$6, _hoisted_22$6, _hoisted_23$6, _hoisted_24$6, _hoisted_25$6, _hoisted_26$5, _hoisted_27$5, _hoisted_28$5, _hoisted_29$5, _hoisted_30$5, _hoisted_31$5, _hoisted_32$4, _hoisted_33$4, _hoisted_34$3, _hoisted_35$3, _hoisted_36$3, _hoisted_37$3, _hoisted_38$3, _hoisted_39$3, _hoisted_40$2, _hoisted_41$2, index_vue_vue_type_script_setup_true_lang_default$6;
var init_index_vue_vue_type_script_setup_true_lang$6 = __esmMin((() => {
	init_vue_runtime_esm_bundler();
	init_vue_i18n();
	init_audit();
	init_clipboard();
	_hoisted_1$9 = { class: "audit-panel" };
	_hoisted_2$9 = { class: "audit-header" };
	_hoisted_3$8 = { class: "audit-header-left" };
	_hoisted_4$8 = {
		key: 0,
		class: "audit-badge"
	};
	_hoisted_5$8 = { class: "audit-header-right" };
	_hoisted_6$8 = ["title"];
	_hoisted_7$8 = ["title"];
	_hoisted_8$8 = { class: "audit-filters" };
	_hoisted_9$8 = ["placeholder"];
	_hoisted_10$8 = { value: "" };
	_hoisted_11$8 = { value: "success" };
	_hoisted_12$8 = { value: "error" };
	_hoisted_13$8 = { value: "blocked" };
	_hoisted_14$8 = {
		key: 0,
		class: "audit-stats"
	};
	_hoisted_15$8 = { class: "stat-item stat-total" };
	_hoisted_16$8 = { class: "stat-item stat-success" };
	_hoisted_17$7 = { class: "stat-item stat-error" };
	_hoisted_18$7 = {
		key: 0,
		class: "stat-item stat-blocked"
	};
	_hoisted_19$7 = {
		key: 0,
		class: "audit-empty"
	};
	_hoisted_20$7 = {
		key: 1,
		class: "audit-empty"
	};
	_hoisted_21$6 = ["onClick"];
	_hoisted_22$6 = { class: "entry-header" };
	_hoisted_23$6 = { class: "entry-status" };
	_hoisted_24$6 = { class: "entry-command" };
	_hoisted_25$6 = { class: "entry-meta" };
	_hoisted_26$5 = { class: "entry-duration" };
	_hoisted_27$5 = { class: "entry-time" };
	_hoisted_28$5 = {
		key: 0,
		class: "entry-detail"
	};
	_hoisted_29$5 = { class: "detail-row" };
	_hoisted_30$5 = { class: "detail-label" };
	_hoisted_31$5 = { class: "detail-row" };
	_hoisted_32$4 = { class: "detail-label" };
	_hoisted_33$4 = { class: "detail-row" };
	_hoisted_34$3 = { class: "detail-label" };
	_hoisted_35$3 = { class: "detail-code" };
	_hoisted_36$3 = { class: "detail-row" };
	_hoisted_37$3 = { class: "detail-label" };
	_hoisted_38$3 = { class: "detail-code" };
	_hoisted_39$3 = { class: "detail-actions" };
	_hoisted_40$2 = ["onClick"];
	_hoisted_41$2 = ["onClick"];
	index_vue_vue_type_script_setup_true_lang_default$6 = /*@__PURE__*/ defineComponent({
		__name: "index",
		setup(__props, { expose: __expose }) {
			const { t } = useI18n();
			const entries = ref([]);
			const stats = ref(null);
			const loading = ref(false);
			const selectedDate = ref(formatDateStr(/* @__PURE__ */ new Date()));
			const keyword = ref("");
			const statusFilter = ref("");
			const expandedIds = reactive(/* @__PURE__ */ new Set());
			const listRef = ref();
			let debounceTimer = null;
			function formatDateStr(d) {
				return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
			}
			function formatTime(ts) {
				const d = new Date(ts);
				return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
			}
			function formatDuration(ms) {
				if (ms < 1e3) return `${ms}ms`;
				return `${(ms / 1e3).toFixed(1)}s`;
			}
			function statusIcon(status) {
				switch (status) {
					case "success": return "bi bi-check-circle-fill text-success";
					case "error": return "bi bi-x-circle-fill text-danger";
					case "blocked": return "bi bi-shield-x-fill text-warning";
					case "rewritten": return "bi bi-pencil-square text-info";
					default: return "bi bi-question-circle";
				}
			}
			function toggleExpand(id) {
				if (expandedIds.has(id)) expandedIds.delete(id);
				else expandedIds.add(id);
			}
			async function loadLogs() {
				loading.value = true;
				try {
					const res = await getAuditLogs({
						date: selectedDate.value,
						keyword: keyword.value || void 0,
						status: statusFilter.value || void 0,
						limit: 200
					});
					entries.value = res.entries;
					stats.value = await getAuditStats(selectedDate.value);
				} catch (e) {
					console.error("Failed to load audit logs:", e);
				} finally {
					loading.value = false;
				}
			}
			function debouncedLoad() {
				clearTimeout(debounceTimer);
				debounceTimer = setTimeout(loadLogs, 300);
			}
			function refresh() {
				loadLogs();
			}
			async function handleExport() {
				try {
					const date = selectedDate.value;
					const data = await exportAuditLogs(date, date, "json");
					const blob = new Blob([data], { type: "application/json" });
					const url = URL.createObjectURL(blob);
					const a = document.createElement("a");
					a.href = url;
					a.download = `audit-${date}.json`;
					a.click();
					URL.revokeObjectURL(url);
				} catch (e) {
					console.error("Export failed:", e);
				}
			}
			function copyText(text) {
				copy(text);
			}
			/** 添加实时审计条目（从 WebSocket 调用） */
			function addRealtimeEntry(entry) {
				if (selectedDate.value === formatDateStr(/* @__PURE__ */ new Date())) {
					entries.value.unshift(entry);
					if (stats.value) {
						stats.value.total++;
						stats.value.today++;
						if (entry.status === "success") stats.value.success++;
						else if (entry.status === "error") stats.value.error++;
						else if (entry.status === "blocked") stats.value.blocked++;
					}
				}
			}
			onMounted(loadLogs);
			__expose({
				addRealtimeEntry,
				refresh
			});
			return (_ctx, _cache) => {
				return openBlock(), createElementBlock("div", _hoisted_1$9, [
					createBaseVNode("div", _hoisted_2$9, [createBaseVNode("div", _hoisted_3$8, [
						_cache[3] || (_cache[3] = createBaseVNode("i", { class: "bi bi-shield-check me-1" }, null, -1)),
						createBaseVNode("span", null, toDisplayString(unref(t)("audit.title")), 1),
						stats.value ? (openBlock(), createElementBlock("span", _hoisted_4$8, toDisplayString(stats.value.today) + " " + toDisplayString(unref(t)("audit.today")), 1)) : createCommentVNode("", true)
					]), createBaseVNode("div", _hoisted_5$8, [createBaseVNode("button", {
						class: "btn-audit",
						onClick: refresh,
						title: unref(t)("common.refresh")
					}, [..._cache[4] || (_cache[4] = [createBaseVNode("i", { class: "bi bi-arrow-clockwise" }, null, -1)])], 8, _hoisted_6$8), createBaseVNode("button", {
						class: "btn-audit",
						onClick: handleExport,
						title: unref(t)("audit.export")
					}, [..._cache[5] || (_cache[5] = [createBaseVNode("i", { class: "bi bi-download" }, null, -1)])], 8, _hoisted_7$8)])]),
					createBaseVNode("div", _hoisted_8$8, [
						withDirectives(createBaseVNode("input", {
							type: "date",
							class: "filter-input",
							"onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => selectedDate.value = $event),
							onChange: loadLogs
						}, null, 544), [[vModelText, selectedDate.value]]),
						withDirectives(createBaseVNode("input", {
							type: "text",
							class: "filter-input flex-grow-1",
							placeholder: unref(t)("audit.searchPlaceholder"),
							"onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => keyword.value = $event),
							onInput: debouncedLoad
						}, null, 40, _hoisted_9$8), [[vModelText, keyword.value]]),
						withDirectives(createBaseVNode("select", {
							class: "filter-input",
							"onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => statusFilter.value = $event),
							onChange: loadLogs
						}, [
							createBaseVNode("option", _hoisted_10$8, toDisplayString(unref(t)("audit.allStatus")), 1),
							createBaseVNode("option", _hoisted_11$8, toDisplayString(unref(t)("audit.success")), 1),
							createBaseVNode("option", _hoisted_12$8, toDisplayString(unref(t)("audit.error")), 1),
							createBaseVNode("option", _hoisted_13$8, toDisplayString(unref(t)("audit.blocked")), 1)
						], 544), [[vModelSelect, statusFilter.value]])
					]),
					stats.value ? (openBlock(), createElementBlock("div", _hoisted_14$8, [
						createBaseVNode("span", _hoisted_15$8, toDisplayString(stats.value.total) + " " + toDisplayString(unref(t)("audit.total")), 1),
						createBaseVNode("span", _hoisted_16$8, [createTextVNode(toDisplayString(stats.value.success) + " ", 1), _cache[6] || (_cache[6] = createBaseVNode("i", { class: "bi bi-check-circle" }, null, -1))]),
						createBaseVNode("span", _hoisted_17$7, [createTextVNode(toDisplayString(stats.value.error) + " ", 1), _cache[7] || (_cache[7] = createBaseVNode("i", { class: "bi bi-x-circle" }, null, -1))]),
						stats.value.blocked ? (openBlock(), createElementBlock("span", _hoisted_18$7, [createTextVNode(toDisplayString(stats.value.blocked) + " ", 1), _cache[8] || (_cache[8] = createBaseVNode("i", { class: "bi bi-shield-x" }, null, -1))])) : createCommentVNode("", true)
					])) : createCommentVNode("", true),
					createBaseVNode("div", {
						class: "audit-list",
						ref_key: "listRef",
						ref: listRef
					}, [loading.value ? (openBlock(), createElementBlock("div", _hoisted_19$7, [_cache[9] || (_cache[9] = createBaseVNode("i", { class: "bi bi-hourglass-split" }, null, -1)), createTextVNode(" " + toDisplayString(unref(t)("common.loading")), 1)])) : entries.value.length === 0 ? (openBlock(), createElementBlock("div", _hoisted_20$7, [_cache[10] || (_cache[10] = createBaseVNode("i", { class: "bi bi-inbox" }, null, -1)), createTextVNode(" " + toDisplayString(unref(t)("audit.noLogs")), 1)])) : (openBlock(true), createElementBlock(Fragment, { key: 2 }, renderList(entries.value, (entry) => {
						return openBlock(), createElementBlock("div", {
							key: entry.id,
							class: normalizeClass(["audit-entry", "status-" + entry.status]),
							onClick: ($event) => toggleExpand(entry.id)
						}, [createBaseVNode("div", _hoisted_22$6, [
							createBaseVNode("span", _hoisted_23$6, [createBaseVNode("i", { class: normalizeClass(statusIcon(entry.status)) }, null, 2)]),
							createBaseVNode("code", _hoisted_24$6, toDisplayString(entry.command || entry.tool), 1),
							createBaseVNode("span", _hoisted_25$6, [createBaseVNode("span", _hoisted_26$5, toDisplayString(formatDuration(entry.duration)), 1), createBaseVNode("span", _hoisted_27$5, toDisplayString(formatTime(entry.timestamp)), 1)])
						]), expandedIds.has(entry.id) ? (openBlock(), createElementBlock("div", _hoisted_28$5, [
							createBaseVNode("div", _hoisted_29$5, [createBaseVNode("span", _hoisted_30$5, toDisplayString(unref(t)("audit.session")) + ":", 1), createBaseVNode("span", null, toDisplayString(entry.sessionName || entry.sessionId), 1)]),
							createBaseVNode("div", _hoisted_31$5, [createBaseVNode("span", _hoisted_32$4, toDisplayString(unref(t)("audit.userRequest")) + ":", 1), createBaseVNode("span", null, toDisplayString(entry.userMessage), 1)]),
							createBaseVNode("div", _hoisted_33$4, [createBaseVNode("span", _hoisted_34$3, toDisplayString(unref(t)("audit.command")) + ":", 1), createBaseVNode("pre", _hoisted_35$3, toDisplayString(entry.command), 1)]),
							createBaseVNode("div", _hoisted_36$3, [createBaseVNode("span", _hoisted_37$3, toDisplayString(unref(t)("audit.result")) + ":", 1), createBaseVNode("pre", _hoisted_38$3, toDisplayString(entry.result), 1)]),
							createBaseVNode("div", _hoisted_39$3, [createBaseVNode("button", {
								class: "btn-copy",
								onClick: withModifiers(($event) => copyText(entry.command), ["stop"])
							}, [_cache[11] || (_cache[11] = createBaseVNode("i", { class: "bi bi-clipboard" }, null, -1)), createTextVNode(" " + toDisplayString(unref(t)("audit.copyCommand")), 1)], 8, _hoisted_40$2), createBaseVNode("button", {
								class: "btn-copy",
								onClick: withModifiers(($event) => copyText(entry.result), ["stop"])
							}, [_cache[12] || (_cache[12] = createBaseVNode("i", { class: "bi bi-clipboard" }, null, -1)), createTextVNode(" " + toDisplayString(unref(t)("audit.copyResult")), 1)], 8, _hoisted_41$2)])
						])) : createCommentVNode("", true)], 10, _hoisted_21$6);
					}), 128))], 512)
				]);
			};
		}
	});
}));
//#endregion
//#region src/components/audit-panel/index.vue?vue&type=style&index=0&scoped=88945d8c&lang.css
var init_index_vue_vue_type_style_index_0_scoped_88945d8c_lang = __esmMin((() => {}));
//#endregion
//#region src/components/audit-panel/index.vue
var audit_panel_default;
var init_audit_panel = __esmMin((() => {
	init_index_vue_vue_type_script_setup_true_lang$6();
	init_index_vue_vue_type_script_setup_true_lang$6();
	init_index_vue_vue_type_style_index_0_scoped_88945d8c_lang();
	init__plugin_vue_export_helper();
	audit_panel_default = /*#__PURE__*/ _plugin_vue_export_helper_default(index_vue_vue_type_script_setup_true_lang_default$6, [["__scopeId", "data-v-88945d8c"]]);
}));
//#endregion
//#region src/service/monitor.ts
function unwrap$2(res) {
	if (res && typeof res === "object" && "ret" in res) {
		if (res.ret !== 0) throw new Error(res.msg || "请求失败");
		return res.data;
	}
	return res;
}
function startMonitor(sessionId, connectionId, logPath, pattern) {
	return request("/api/monitor/start", {
		sessionId,
		connectionId,
		logPath,
		pattern
	}).then(unwrap$2);
}
function stopMonitor(monitorId) {
	return request("/api/monitor/stop", { monitorId }).then(unwrap$2);
}
function getMonitorBatch(monitorId) {
	return request("/api/monitor/analyze", { monitorId }).then(unwrap$2);
}
var init_monitor = __esmMin((() => {
	init_base();
}));
//#endregion
//#region src/utils/sanitize-html.ts
function isSafeUrl(value) {
	try {
		const trimmed = value.trim();
		if (!trimmed) return false;
		if (trimmed.startsWith("#") || trimmed.startsWith("/")) return true;
		const parsed = new URL(trimmed, window.location.origin);
		return [
			"http:",
			"https:",
			"mailto:"
		].includes(parsed.protocol);
	} catch {
		return false;
	}
}
function sanitizeHtml(input) {
	if (typeof window === "undefined" || typeof DOMParser === "undefined") return input.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
	const doc = new DOMParser().parseFromString(`<div>${input}</div>`, "text/html");
	const root = doc.body.firstElementChild;
	if (!root) return "";
	const walk = (node) => {
		for (const child of Array.from(node.childNodes)) if (child.nodeType === Node.ELEMENT_NODE) {
			const el = child;
			if (!ALLOWED_TAGS.has(el.tagName)) {
				el.replaceWith(doc.createTextNode(el.textContent || ""));
				continue;
			}
			for (const attr of Array.from(el.attributes)) {
				const name = attr.name.toLowerCase();
				const value = attr.value;
				if (name.startsWith("on")) {
					el.removeAttribute(attr.name);
					continue;
				}
				if (URL_ATTRS.has(name)) {
					if (!isSafeUrl(value)) {
						el.removeAttribute(attr.name);
						continue;
					}
					if (el.tagName === "A") {
						el.setAttribute("target", "_blank");
						el.setAttribute("rel", "noopener noreferrer");
					}
					continue;
				}
				if (!GLOBAL_ALLOWED_ATTRS.has(name) && name !== "target" && name !== "rel") el.removeAttribute(attr.name);
			}
			walk(el);
		} else if (child.nodeType === Node.COMMENT_NODE) child.remove();
	};
	walk(root);
	return root.innerHTML;
}
function escapeHtml(text) {
	return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
var ALLOWED_TAGS, GLOBAL_ALLOWED_ATTRS, URL_ATTRS;
var init_sanitize_html = __esmMin((() => {
	ALLOWED_TAGS = /* @__PURE__ */ new Set([
		"A",
		"BR",
		"CODE",
		"EM",
		"H2",
		"H3",
		"H4",
		"LI",
		"OL",
		"PRE",
		"STRONG",
		"TABLE",
		"TBODY",
		"TD",
		"TH",
		"THEAD",
		"TR",
		"UL"
	]);
	GLOBAL_ALLOWED_ATTRS = /* @__PURE__ */ new Set(["class"]);
	URL_ATTRS = /* @__PURE__ */ new Set(["href"]);
}));
//#endregion
//#region src/components/log-monitor/index.vue?vue&type=script&setup=true&lang.ts
var _hoisted_1$8, _hoisted_2$8, _hoisted_3$7, _hoisted_4$7, _hoisted_5$7, _hoisted_6$7, _hoisted_7$7, _hoisted_8$7, _hoisted_9$7, _hoisted_10$7, _hoisted_11$7, _hoisted_12$7, _hoisted_13$7, _hoisted_14$7, _hoisted_15$7, _hoisted_16$7, _hoisted_17$6, _hoisted_18$6, _hoisted_19$6, _hoisted_20$6, index_vue_vue_type_script_setup_true_lang_default$5;
var init_index_vue_vue_type_script_setup_true_lang$5 = __esmMin((() => {
	init_vue_runtime_esm_bundler();
	init_vue_i18n();
	init_monitor();
	init_ai();
	init_sanitize_html();
	_hoisted_1$8 = { class: "monitor-panel" };
	_hoisted_2$8 = { class: "monitor-controls" };
	_hoisted_3$7 = ["placeholder", "disabled"];
	_hoisted_4$7 = ["disabled"];
	_hoisted_5$7 = ["disabled", "title"];
	_hoisted_6$7 = {
		key: 0,
		class: "monitor-status"
	};
	_hoisted_7$7 = { class: "status-stats" };
	_hoisted_8$7 = {
		key: 1,
		class: "monitor-alerts"
	};
	_hoisted_9$7 = ["title"];
	_hoisted_10$7 = {
		key: 0,
		class: "alerts-list"
	};
	_hoisted_11$7 = { class: "alert-header" };
	_hoisted_12$7 = { class: "alert-level" };
	_hoisted_13$7 = { class: "alert-time" };
	_hoisted_14$7 = { class: "alert-message" };
	_hoisted_15$7 = {
		key: 0,
		class: "alert-analysis"
	};
	_hoisted_16$7 = ["innerHTML"];
	_hoisted_17$6 = {
		key: 2,
		class: "monitor-analysis"
	};
	_hoisted_18$6 = { class: "analysis-header" };
	_hoisted_19$6 = ["innerHTML"];
	_hoisted_20$6 = {
		key: 0,
		class: "monitor-empty"
	};
	index_vue_vue_type_script_setup_true_lang_default$5 = /*@__PURE__*/ defineComponent({
		__name: "index",
		props: {
			sessionId: {},
			connectionId: {}
		},
		emits: ["ws-send"],
		setup(__props, { expose: __expose, emit: __emit }) {
			const { t, locale } = useI18n();
			const props = __props;
			const emit = __emit;
			const logPath = ref("/var/log/syslog");
			const isMonitoring = ref(false);
			const monitorId = ref(null);
			const lines = ref([]);
			const alerts = ref([]);
			const showAlerts = ref(true);
			const analyzing = ref(false);
			const aiAnalysisResult = ref("");
			const lineCount = ref(0);
			const outputRef = ref();
			const displayLines = computed(() => {
				return lines.value.slice(-500);
			});
			function getLineClass(line) {
				const lower = line.toLowerCase();
				if (lower.includes("error") || lower.includes("fatal") || lower.includes("critical") || lower.includes("exception")) return "line-error";
				if (lower.includes("warn")) return "line-warning";
				if (lower.includes("debug") || lower.includes("trace")) return "line-debug";
				return "";
			}
			function formatTime(ts) {
				const d = new Date(ts);
				return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
			}
			async function toggleMonitor() {
				if (isMonitoring.value) await stopMonitoring();
				else await startMonitoring();
			}
			async function startMonitoring() {
				if (!logPath.value.trim()) return;
				try {
					const res = await startMonitor(props.sessionId, props.connectionId || "", logPath.value.trim());
					monitorId.value = res.monitorId;
					isMonitoring.value = true;
					lines.value = [];
					alerts.value = [];
					lineCount.value = 0;
				} catch (e) {
					console.error("Failed to start monitor:", e);
					lines.value.push(`[ERROR] ${e.message || "Failed to start monitor"}`);
				}
			}
			async function stopMonitoring() {
				if (monitorId.value) try {
					await stopMonitor(monitorId.value);
				} catch {}
				isMonitoring.value = false;
				monitorId.value = null;
			}
			/**
			* 处理 WebSocket 推送的监控事件
			*/
			function handleMonitorEvent(event) {
				switch (event.type) {
					case "monitor-line":
						if (event.lines) {
							lines.value.push(...event.lines);
							lineCount.value += event.lines.length;
							if (lines.value.length > 2e3) lines.value = lines.value.slice(-2e3);
							nextTick(scrollToBottom);
						}
						break;
					case "monitor-alert":
						if (event.alert) {
							alerts.value.push(event.alert);
							if (alerts.value.length > 200) alerts.value = alerts.value.slice(-200);
						}
						break;
					case "monitor-error":
						lines.value.push(`[ERROR] ${event.error || "Monitor error"}`);
						break;
					case "monitor-stopped":
						isMonitoring.value = false;
						monitorId.value = null;
						lines.value.push("[INFO] Monitor stopped");
				}
			}
			/**
			* 触发 AI 分析
			*/
			async function triggerAIAnalysis() {
				if (!monitorId.value || analyzing.value) return;
				analyzing.value = true;
				aiAnalysisResult.value = "";
				try {
					const batchLines = await getMonitorBatch(monitorId.value);
					if (batchLines.length === 0) {
						aiAnalysisResult.value = t("monitor.noLogsToAnalyze");
						return;
					}
					const analysisPrompt = `Please analyze the following log snippet, identify any anomalies, errors, or potential issues, and provide recommendations:\n\n\`\`\`\n${batchLines.join("\n")}\n\`\`\``;
					emit("ws-send", {
						type: "ai-agent-run",
						data: {
							aiSessionId: props.sessionId,
							message: analysisPrompt,
							context: "",
							locale: locale.value
						}
					});
					aiAnalysisResult.value = t("monitor.analysisInProgress");
				} catch (e) {
					aiAnalysisResult.value = `分析失败: ${e.message}`;
				} finally {
					analyzing.value = false;
				}
			}
			function scrollToBottom() {
				if (outputRef.value) outputRef.value.scrollTop = outputRef.value.scrollHeight;
			}
			function renderSimpleMarkdown(text) {
				if (!text) return "";
				const codeBlocks = [];
				let html = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
					const idx = codeBlocks.length;
					codeBlocks.push(`<pre class="code-block"><code>${escapeHtml(code.trim())}</code></pre>`);
					return `\x00CODEBLOCK${idx}\x00`;
				});
				html = escapeHtml(html).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code class=\"inline-code\">$1</code>").replace(/\n/g, "<br>").replace(/\x00CODEBLOCK(\d+)\x00/g, (_match, idx) => codeBlocks[parseInt(idx)] || "");
				return sanitizeHtml(html);
			}
			__expose({
				handleMonitorEvent,
				stopMonitoring
			});
			return (_ctx, _cache) => {
				return openBlock(), createElementBlock("div", _hoisted_1$8, [
					createBaseVNode("div", _hoisted_2$8, [
						withDirectives(createBaseVNode("input", {
							type: "text",
							class: "monitor-input",
							placeholder: unref(t)("monitor.logPathPlaceholder"),
							"onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => logPath.value = $event),
							disabled: isMonitoring.value
						}, null, 8, _hoisted_3$7), [[vModelText, logPath.value]]),
						createBaseVNode("button", {
							class: normalizeClass(["btn-monitor", { active: isMonitoring.value }]),
							onClick: toggleMonitor,
							disabled: !logPath.value.trim() && !isMonitoring.value
						}, [createBaseVNode("i", { class: normalizeClass(isMonitoring.value ? "bi bi-stop-fill" : "bi bi-play-fill") }, null, 2), createTextVNode(" " + toDisplayString(isMonitoring.value ? unref(t)("monitor.stop") : unref(t)("monitor.start")), 1)], 10, _hoisted_4$7),
						isMonitoring.value ? (openBlock(), createElementBlock("button", {
							key: 0,
							class: "btn-monitor btn-analyze",
							onClick: triggerAIAnalysis,
							disabled: analyzing.value,
							title: unref(t)("monitor.aiAnalyze")
						}, [_cache[4] || (_cache[4] = createBaseVNode("i", { class: "bi bi-robot" }, null, -1)), createTextVNode(" " + toDisplayString(analyzing.value ? unref(t)("monitor.analyzing") : unref(t)("monitor.aiAnalyze")), 1)], 8, _hoisted_5$7)) : createCommentVNode("", true)
					]),
					isMonitoring.value ? (openBlock(), createElementBlock("div", _hoisted_6$7, [
						_cache[5] || (_cache[5] = createBaseVNode("span", { class: "status-indicator active" }, null, -1)),
						createBaseVNode("span", null, toDisplayString(unref(t)("monitor.monitoring")) + ": " + toDisplayString(logPath.value), 1),
						createBaseVNode("span", _hoisted_7$7, toDisplayString(lineCount.value) + " " + toDisplayString(unref(t)("monitor.lines")) + " · " + toDisplayString(alerts.value.length) + " " + toDisplayString(unref(t)("monitor.alerts")), 1)
					])) : createCommentVNode("", true),
					alerts.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_8$7, [createBaseVNode("div", {
						class: "alerts-header",
						onClick: _cache[2] || (_cache[2] = ($event) => showAlerts.value = !showAlerts.value)
					}, [
						createBaseVNode("i", { class: normalizeClass(showAlerts.value ? "bi bi-chevron-down" : "bi bi-chevron-right") }, null, 2),
						_cache[7] || (_cache[7] = createBaseVNode("i", { class: "bi bi-exclamation-triangle-fill alert-icon" }, null, -1)),
						createBaseVNode("span", null, toDisplayString(alerts.value.length) + " " + toDisplayString(unref(t)("monitor.detectedAnomalies")), 1),
						createBaseVNode("button", {
							class: "btn-clear-alerts",
							onClick: _cache[1] || (_cache[1] = withModifiers(($event) => alerts.value = [], ["stop"])),
							title: unref(t)("monitor.clearAlerts")
						}, [..._cache[6] || (_cache[6] = [createBaseVNode("i", { class: "bi bi-x" }, null, -1)])], 8, _hoisted_9$7)
					]), showAlerts.value ? (openBlock(), createElementBlock("div", _hoisted_10$7, [(openBlock(true), createElementBlock(Fragment, null, renderList(alerts.value.slice(-20).reverse(), (alert) => {
						return openBlock(), createElementBlock("div", {
							key: alert.id,
							class: normalizeClass(["alert-item", "level-" + alert.level])
						}, [
							createBaseVNode("div", _hoisted_11$7, [createBaseVNode("span", _hoisted_12$7, toDisplayString(alert.level.toUpperCase()), 1), createBaseVNode("span", _hoisted_13$7, toDisplayString(formatTime(alert.timestamp)), 1)]),
							createBaseVNode("div", _hoisted_14$7, toDisplayString(alert.message), 1),
							alert.aiAnalysis ? (openBlock(), createElementBlock("div", _hoisted_15$7, [_cache[8] || (_cache[8] = createBaseVNode("i", { class: "bi bi-robot" }, null, -1)), createBaseVNode("span", { innerHTML: renderSimpleMarkdown(alert.aiAnalysis) }, null, 8, _hoisted_16$7)])) : createCommentVNode("", true)
						], 2);
					}), 128))])) : createCommentVNode("", true)])) : createCommentVNode("", true),
					aiAnalysisResult.value ? (openBlock(), createElementBlock("div", _hoisted_17$6, [createBaseVNode("div", _hoisted_18$6, [
						_cache[10] || (_cache[10] = createBaseVNode("i", { class: "bi bi-robot" }, null, -1)),
						createBaseVNode("span", null, toDisplayString(unref(t)("monitor.aiAnalysisResult")), 1),
						createBaseVNode("button", {
							class: "btn-clear-alerts",
							onClick: _cache[3] || (_cache[3] = ($event) => aiAnalysisResult.value = "")
						}, [..._cache[9] || (_cache[9] = [createBaseVNode("i", { class: "bi bi-x" }, null, -1)])])
					]), createBaseVNode("div", {
						class: "analysis-content",
						innerHTML: renderSimpleMarkdown(aiAnalysisResult.value)
					}, null, 8, _hoisted_19$6)])) : createCommentVNode("", true),
					createBaseVNode("div", {
						class: "monitor-output",
						ref_key: "outputRef",
						ref: outputRef
					}, [lines.value.length === 0 ? (openBlock(), createElementBlock("div", _hoisted_20$6, [_cache[11] || (_cache[11] = createBaseVNode("i", { class: "bi bi-terminal" }, null, -1)), createBaseVNode("span", null, toDisplayString(isMonitoring.value ? unref(t)("monitor.waitingForLogs") : unref(t)("monitor.notStarted")), 1)])) : createCommentVNode("", true), (openBlock(true), createElementBlock(Fragment, null, renderList(displayLines.value, (line, idx) => {
						return openBlock(), createElementBlock("div", {
							key: idx,
							class: normalizeClass(["log-line", getLineClass(line)])
						}, toDisplayString(line), 3);
					}), 128))], 512)
				]);
			};
		}
	});
}));
//#endregion
//#region src/components/log-monitor/index.vue?vue&type=style&index=0&scoped=0a240680&lang.css
var init_index_vue_vue_type_style_index_0_scoped_0a240680_lang = __esmMin((() => {}));
//#endregion
//#region src/components/log-monitor/index.vue
var log_monitor_default;
var init_log_monitor = __esmMin((() => {
	init_index_vue_vue_type_script_setup_true_lang$5();
	init_index_vue_vue_type_script_setup_true_lang$5();
	init_index_vue_vue_type_style_index_0_scoped_0a240680_lang();
	init__plugin_vue_export_helper();
	log_monitor_default = /*#__PURE__*/ _plugin_vue_export_helper_default(index_vue_vue_type_script_setup_true_lang_default$5, [["__scopeId", "data-v-0a240680"]]);
}));
//#endregion
//#region src/components/ai-chat/index.vue?vue&type=script&setup=true&lang.ts
var _hoisted_1$7, _hoisted_2$7, _hoisted_3$6, _hoisted_4$6, _hoisted_5$6, _hoisted_6$6, _hoisted_7$6, _hoisted_8$6, _hoisted_9$6, _hoisted_10$6, _hoisted_11$6, _hoisted_12$6, _hoisted_13$6, _hoisted_14$6, _hoisted_15$6, _hoisted_16$6, _hoisted_17$5, _hoisted_18$5, _hoisted_19$5, _hoisted_20$5, _hoisted_21$5, _hoisted_22$5, _hoisted_23$5, _hoisted_24$5, _hoisted_25$5, _hoisted_26$4, _hoisted_27$4, _hoisted_28$4, _hoisted_29$4, _hoisted_30$4, _hoisted_31$4, _hoisted_32$3, _hoisted_33$3, _hoisted_34$2, _hoisted_35$2, _hoisted_36$2, _hoisted_37$2, _hoisted_38$2, _hoisted_39$2, _hoisted_40$1, _hoisted_41$1, _hoisted_42$1, _hoisted_43$1, _hoisted_44$1, _hoisted_45$1, _hoisted_46$1, _hoisted_47$1, _hoisted_48$1, index_vue_vue_type_script_setup_true_lang_default$4;
var init_index_vue_vue_type_script_setup_true_lang$4 = __esmMin((() => {
	init_vue_runtime_esm_bundler();
	init_vue_i18n();
	init_ai();
	init_audit_panel();
	init_log_monitor();
	init_sanitize_html();
	_hoisted_1$7 = { class: "ai-chat-header" };
	_hoisted_2$7 = { class: "d-flex align-items-center gap-2" };
	_hoisted_3$6 = { class: "ai-tab-bar" };
	_hoisted_4$6 = { class: "d-flex gap-1" };
	_hoisted_5$6 = ["title"];
	_hoisted_6$6 = ["title"];
	_hoisted_7$6 = ["title"];
	_hoisted_8$6 = ["title"];
	_hoisted_9$6 = ["title"];
	_hoisted_10$6 = {
		key: 0,
		class: "ai-chat-empty"
	};
	_hoisted_11$6 = { class: "ai-message-avatar" };
	_hoisted_12$6 = { class: "ai-message-content" };
	_hoisted_13$6 = {
		key: 0,
		class: "skill-badge"
	};
	_hoisted_14$6 = {
		key: 1,
		class: "agent-steps"
	};
	_hoisted_15$6 = {
		key: 0,
		class: "agent-step thinking-step"
	};
	_hoisted_16$6 = { class: "step-label" };
	_hoisted_17$5 = {
		key: 1,
		class: "agent-step tool-call-step"
	};
	_hoisted_18$5 = ["onClick"];
	_hoisted_19$5 = { class: "step-cmd" };
	_hoisted_20$5 = {
		key: 0,
		class: "step-result"
	};
	_hoisted_21$5 = ["innerHTML"];
	_hoisted_22$5 = {
		key: 0,
		class: "skills-panel"
	};
	_hoisted_23$5 = { class: "skills-panel-header" };
	_hoisted_24$5 = { class: "skills-grid" };
	_hoisted_25$5 = ["onClick"];
	_hoisted_26$4 = { class: "skill-item-header" };
	_hoisted_27$4 = { class: "skill-name" };
	_hoisted_28$4 = {
		key: 0,
		class: "skill-source"
	};
	_hoisted_29$4 = {
		key: 0,
		class: "skill-desc"
	};
	_hoisted_30$4 = {
		key: 0,
		class: "skills-empty"
	};
	_hoisted_31$4 = {
		key: 1,
		class: "history-panel"
	};
	_hoisted_32$3 = { class: "history-panel-header" };
	_hoisted_33$3 = { class: "history-list" };
	_hoisted_34$2 = ["onClick"];
	_hoisted_35$2 = { class: "history-item-top" };
	_hoisted_36$2 = { class: "history-name" };
	_hoisted_37$2 = { class: "history-time" };
	_hoisted_38$2 = { class: "history-preview" };
	_hoisted_39$2 = { class: "history-meta" };
	_hoisted_40$1 = {
		key: 0,
		class: "history-empty"
	};
	_hoisted_41$1 = { class: "ai-audit-wrapper" };
	_hoisted_42$1 = { class: "ai-audit-wrapper" };
	_hoisted_43$1 = {
		key: 2,
		class: "selected-skill-bar"
	};
	_hoisted_44$1 = { class: "selected-skill-tag" };
	_hoisted_45$1 = { class: "ai-chat-input" };
	_hoisted_46$1 = ["title"];
	_hoisted_47$1 = [
		"placeholder",
		"onKeydown",
		"disabled"
	];
	_hoisted_48$1 = ["disabled"];
	index_vue_vue_type_script_setup_true_lang_default$4 = /*@__PURE__*/ defineComponent({
		__name: "index",
		props: {
			sessionId: {},
			sessionName: {},
			connectionId: {},
			isOpen: { type: Boolean },
			getTerminalContext: { type: Function }
		},
		emits: [
			"close",
			"ws-send",
			"open-settings"
		],
		setup(__props, { expose: __expose, emit: __emit }) {
			const { t, locale } = useI18n();
			const props = __props;
			const emit = __emit;
			const activeTab = ref("chat");
			const messagesContainer = ref();
			const inputRef = ref();
			const auditPanelRef = ref();
			const logMonitorRef = ref();
			const inputText = ref("");
			const isAgentRunning = ref(false);
			const messages = ref([]);
			const skills = ref([]);
			const selectedSkill = ref(null);
			const showSkillsPanel = ref(false);
			const showHistoryPanel = ref(false);
			const historyList = ref([]);
			let currentAssistantIdx = -1;
			function ensureAssistantMessage() {
				if (currentAssistantIdx >= 0 && currentAssistantIdx < messages.value.length) return currentAssistantIdx;
				messages.value.push({
					role: "assistant",
					content: "",
					agentSteps: [],
					isRunning: true
				});
				currentAssistantIdx = messages.value.length - 1;
				return currentAssistantIdx;
			}
			function handleAgentEvent(event) {
				if (event.type === "system_info") {
					messages.value.push({
						role: "assistant",
						content: event.content || "",
						isSystemInfo: true,
						isRunning: false
					});
					nextTick(() => scrollToBottom());
					return;
				}
				const idx = ensureAssistantMessage();
				const msg = messages.value[idx];
				if (!msg.agentSteps) msg.agentSteps = [];
				switch (event.type) {
					case "thinking":
						msg.agentSteps = msg.agentSteps.filter((s) => s.type !== "thinking");
						msg.agentSteps.push({ type: "thinking" });
						break;
					case "message":
						msg.agentSteps = msg.agentSteps.filter((s) => s.type !== "thinking");
						msg.content += event.content || "";
						break;
					case "tool_call":
						msg.agentSteps = msg.agentSteps.filter((s) => s.type !== "thinking");
						msg.agentSteps.push({
							type: "tool_call",
							tool: event.tool,
							args: event.args,
							collapsed: true
						});
						break;
					case "tool_result":
						for (let i = msg.agentSteps.length - 1; i >= 0; i--) if (msg.agentSteps[i].type === "tool_call" && msg.agentSteps[i].tool === event.tool && !msg.agentSteps[i].result) {
							msg.agentSteps[i].result = event.result;
							break;
						}
						break;
					case "done":
						msg.isRunning = false;
						msg.agentSteps = msg.agentSteps.filter((s) => s.type !== "thinking");
						if (event.content) msg.content += event.content;
						isAgentRunning.value = false;
						currentAssistantIdx = -1;
						saveDisplayHistory$1();
						break;
					case "audit_entry":
						if (event.auditEntry && auditPanelRef.value) auditPanelRef.value.addRealtimeEntry(event.auditEntry);
						return;
					case "error":
						msg.isRunning = false;
						msg.agentSteps = msg.agentSteps.filter((s) => s.type !== "thinking");
						msg.content += `\n\n**错误**: ${event.error || "未知错误"}`;
						isAgentRunning.value = false;
						currentAssistantIdx = -1;
						saveDisplayHistory$1();
				}
				scrollToBottom();
			}
			async function loadSkills() {
				try {
					const data = await getSkills();
					if (Array.isArray(data)) skills.value = data;
				} catch (e) {
					console.warn("Failed to load skills:", e);
				}
			}
			function toggleSkillsPanel() {
				showSkillsPanel.value = !showSkillsPanel.value;
			}
			function toggleSkill(skill) {
				if (selectedSkill.value?.id === skill.id) selectedSkill.value = null;
				else selectedSkill.value = skill;
				showSkillsPanel.value = false;
			}
			function clearSelectedSkill() {
				selectedSkill.value = null;
			}
			function handleInput() {
				const text = inputText.value;
				if (text.startsWith("/") && !text.includes(" ")) {
					const cmd = text.substring(1).toLowerCase();
					const match = skills.value.find((s) => s.id.toLowerCase() === cmd);
					if (match) {
						selectedSkill.value = match;
						inputText.value = "";
					}
				}
			}
			function handleSend() {
				const text = inputText.value.trim();
				if (!text || isAgentRunning.value) return;
				let actualMessage = text;
				let activeSkill = selectedSkill.value;
				if (text.startsWith("/")) {
					const spaceIdx = text.indexOf(" ");
					const cmd = (spaceIdx > 0 ? text.substring(1, spaceIdx) : text.substring(1)).toLowerCase();
					const match = skills.value.find((s) => s.id.toLowerCase() === cmd);
					if (match) {
						activeSkill = match;
						actualMessage = spaceIdx > 0 ? text.substring(spaceIdx + 1).trim() : match.description || match.name;
						if (!actualMessage) actualMessage = match.name;
					}
				}
				messages.value.push({
					role: "user",
					content: actualMessage,
					skillName: activeSkill?.name
				});
				inputText.value = "";
				scrollToBottom();
				const context = props.getTerminalContext?.() || "";
				isAgentRunning.value = true;
				currentAssistantIdx = -1;
				emit("ws-send", {
					type: "ai-agent-run",
					data: {
						aiSessionId: props.sessionId,
						message: actualMessage,
						context: context.substring(-3e3),
						skillId: activeSkill?.id,
						locale: locale.value
					}
				});
				selectedSkill.value = null;
			}
			function handleStop() {
				emit("ws-send", {
					type: "ai-agent-stop",
					data: { aiSessionId: props.sessionId }
				});
			}
			function handleNewLine() {}
			function handleClear() {
				if (messages.value.length === 0) return;
				messages.value = [];
				currentAssistantIdx = -1;
				clearHistory(props.sessionId).catch(() => {});
			}
			function saveDisplayHistory$1() {
				const toSave = messages.value.map((m) => ({
					role: m.role,
					content: m.content,
					skillName: m.skillName,
					isSystemInfo: m.isSystemInfo,
					agentSteps: m.agentSteps?.filter((s) => s.type === "tool_call").map((s) => ({
						type: "tool_call",
						tool: s.tool,
						args: s.args,
						result: s.result,
						collapsed: true
					}))
				}));
				saveDisplayHistory(props.sessionId, toSave, props.sessionName).catch(() => {});
			}
			async function loadDisplayHistory() {
				try {
					const data = await getDisplayHistory(props.sessionId);
					if (Array.isArray(data) && data.length > 0) {
						messages.value = data.map((m) => ({
							role: m.role,
							content: m.content,
							skillName: m.skillName,
							isSystemInfo: m.isSystemInfo,
							agentSteps: m.agentSteps?.map((s) => ({
								...s,
								collapsed: true
							})),
							isRunning: false
						}));
						nextTick(() => scrollToBottom());
					} else await fetchAndShowSystemInfo();
				} catch (e) {
					console.warn("Failed to load display history:", e);
				}
			}
			/** 主动获取系统环境信息并展示为第一条消息 */
			async function fetchAndShowSystemInfo() {
				try {
					const sysContext = await getSystemContext(props.sessionId);
					if (sysContext && typeof sysContext === "string" && sysContext.trim()) {
						messages.value.push({
							role: "assistant",
							content: sysContext,
							isSystemInfo: true,
							isRunning: false
						});
						nextTick(() => scrollToBottom());
					}
				} catch (e) {
					console.warn("Failed to fetch system context:", e);
				}
			}
			function toggleHistoryPanel() {
				showHistoryPanel.value = !showHistoryPanel.value;
				if (showHistoryPanel.value) fetchHistoryList();
			}
			async function fetchHistoryList() {
				try {
					const data = await listHistories();
					if (Array.isArray(data)) historyList.value = data;
				} catch (e) {
					console.warn("Failed to fetch history list:", e);
				}
			}
			async function loadPastHistory(targetSessionId) {
				try {
					const data = await loadHistory(targetSessionId);
					if (Array.isArray(data) && data.length > 0) {
						messages.value = data.map((m) => ({
							role: m.role,
							content: m.content,
							skillName: m.skillName,
							isSystemInfo: m.isSystemInfo,
							agentSteps: m.agentSteps?.map((s) => ({
								...s,
								collapsed: true
							})),
							isRunning: false
						}));
						showHistoryPanel.value = false;
						nextTick(() => scrollToBottom());
					}
				} catch (e) {
					console.warn("Failed to load past history:", e);
				}
			}
			function formatTime(ts) {
				if (!ts) return "";
				const d = new Date(ts);
				const diff = (/* @__PURE__ */ new Date()).getTime() - d.getTime();
				const mins = Math.floor(diff / 6e4);
				if (mins < 1) return t("ai.justNow");
				if (mins < 60) return `${mins}m`;
				const hours = Math.floor(mins / 60);
				if (hours < 24) return `${hours}h`;
				const days = Math.floor(hours / 24);
				if (days < 7) return `${days}d`;
				return `${d.getMonth() + 1}/${d.getDate()}`;
			}
			function handleClose() {
				emit("close");
			}
			function handleOpenSettings() {
				emit("open-settings");
			}
			function toggleStep(step) {
				step.collapsed = !step.collapsed;
			}
			function getToolDisplayCmd(step) {
				if (step.tool === "execute_command" && step.args?.command) {
					const cmd = step.args.command;
					return cmd.length > 40 ? cmd.substring(0, 40) + "..." : cmd;
				}
				if (step.tool === "read_terminal") return "read terminal output";
				return step.tool || "unknown";
			}
			function renderMarkdown(text) {
				if (typeof text !== "string") return String(text ?? "");
				if (!text) return "";
				const codeBlocks = [];
				let html = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
					const idx = codeBlocks.length;
					codeBlocks.push(`<pre class="code-block"><code class="language-${lang}">${escapeHtml(code.trim())}</code></pre>`);
					return `\x00CODEBLOCK${idx}\x00`;
				});
				html = html.replace(/((?:^|\n)\|.+\|(?:\n\|.+\|)+)/g, (tableBlock) => {
					const rows = tableBlock.trim().split("\n").filter((r) => r.trim());
					if (rows.length < 2) return tableBlock;
					let table = "<table class=\"md-table\">";
					rows.forEach((row, ri) => {
						if (/^\|[\s\-:|]+\|$/.test(row.trim())) return;
						const cells = row.split("|").filter((_, i, arr) => i > 0 && i < arr.length - 1);
						const tag = ri === 0 ? "th" : "td";
						table += "<tr>" + cells.map((c) => `<${tag}>${c.trim()}</${tag}>`).join("") + "</tr>";
					});
					table += "</table>";
					return "\n" + table + "\n";
				});
				html = html.replace(/^### (.+)$/gm, "<h4>$1</h4>");
				html = html.replace(/^## (.+)$/gm, "<h3>$1</h3>");
				html = html.replace(/^# (.+)$/gm, "<h2>$1</h2>");
				html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
				html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
				html = html.replace(/`([^`]+)`/g, "<code class=\"inline-code\">$1</code>");
				html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<a href=\"$2\" target=\"_blank\" rel=\"noopener\">$1</a>");
				html = html.replace(/(^|\n)((?:[-*] .+(?:\n|$))+)/g, (_, pre, block) => {
					return pre + `<ul>${block.trim().split("\n").map((l) => `<li>${l.replace(/^[-*] /, "")}</li>`).join("")}</ul>`;
				});
				html = html.replace(/(^|\n)((?:\d+\. .+(?:\n|$))+)/g, (_, pre, block) => {
					return pre + `<ol>${block.trim().split("\n").map((l) => `<li>${l.replace(/^\d+\. /, "")}</li>`).join("")}</ol>`;
				});
				html = html.replace(/\n/g, "<br>");
				html = html.replace(/\x00CODEBLOCK(\d+)\x00/g, (_, idx) => codeBlocks[parseInt(idx)]);
				return sanitizeHtml(html);
			}
			function scrollToBottom() {
				nextTick(() => {
					if (messagesContainer.value) messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
				});
			}
			/** 处理监控事件（由父组件调用） */
			function handleMonitorEvent(event) {
				if (logMonitorRef.value) logMonitorRef.value.handleMonitorEvent(event);
			}
			watch(() => props.isOpen, (val) => {
				if (val) nextTick(() => {
					inputRef.value?.focus();
					scrollToBottom();
				});
			});
			watch(() => props.sessionId, () => {
				messages.value = [];
				currentAssistantIdx = -1;
				loadDisplayHistory();
			}, { immediate: true });
			onMounted(() => {
				if (props.isOpen) inputRef.value?.focus();
				loadSkills();
			});
			__expose({
				handleAgentEvent,
				scrollToBottom,
				handleMonitorEvent
			});
			return (_ctx, _cache) => {
				return openBlock(), createElementBlock("div", { class: normalizeClass(["ai-chat-panel", { collapsed: !__props.isOpen }]) }, [
					createBaseVNode("div", _hoisted_1$7, [createBaseVNode("div", _hoisted_2$7, [createBaseVNode("div", _hoisted_3$6, [createBaseVNode("button", {
						class: normalizeClass(["ai-tab", { active: activeTab.value === "chat" }]),
						onClick: _cache[0] || (_cache[0] = ($event) => activeTab.value = "chat")
					}, [_cache[6] || (_cache[6] = createBaseVNode("i", { class: "bi bi-robot" }, null, -1)), createTextVNode(" " + toDisplayString(unref(t)("ai.chat")), 1)], 2), createBaseVNode("button", {
						class: normalizeClass(["ai-tab", { active: activeTab.value === "audit" }]),
						onClick: _cache[1] || (_cache[1] = ($event) => activeTab.value = "audit")
					}, [_cache[7] || (_cache[7] = createBaseVNode("i", { class: "bi bi-shield-check" }, null, -1)), createTextVNode(" " + toDisplayString(unref(t)("audit.title")), 1)], 2)])]), createBaseVNode("div", _hoisted_4$6, [activeTab.value === "chat" ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
						createBaseVNode("button", {
							class: "btn-ai-action",
							onClick: handleOpenSettings,
							title: unref(t)("ai.settings")
						}, [..._cache[8] || (_cache[8] = [createBaseVNode("i", { class: "bi bi-gear" }, null, -1)])], 8, _hoisted_5$6),
						createBaseVNode("button", {
							class: normalizeClass(["btn-ai-action", { active: showHistoryPanel.value }]),
							onClick: toggleHistoryPanel,
							title: unref(t)("ai.history")
						}, [..._cache[9] || (_cache[9] = [createBaseVNode("i", { class: "bi bi-clock-history" }, null, -1)])], 10, _hoisted_6$6),
						isAgentRunning.value ? (openBlock(), createElementBlock("button", {
							key: 0,
							class: "btn-ai-action btn-stop",
							onClick: handleStop,
							title: unref(t)("ai.stopAgent")
						}, [..._cache[10] || (_cache[10] = [createBaseVNode("i", { class: "bi bi-stop-circle" }, null, -1)])], 8, _hoisted_7$6)) : createCommentVNode("", true),
						createBaseVNode("button", {
							class: "btn-ai-action",
							onClick: handleClear,
							title: unref(t)("ai.clearHistory")
						}, [..._cache[11] || (_cache[11] = [createBaseVNode("i", { class: "bi bi-trash" }, null, -1)])], 8, _hoisted_8$6)
					], 64)) : createCommentVNode("", true), createBaseVNode("button", {
						class: "btn-ai-action",
						onClick: handleClose,
						title: unref(t)("common.close")
					}, [..._cache[12] || (_cache[12] = [createBaseVNode("i", { class: "bi bi-x-lg" }, null, -1)])], 8, _hoisted_9$6)])]),
					withDirectives(createBaseVNode("div", {
						class: "ai-chat-messages",
						ref_key: "messagesContainer",
						ref: messagesContainer
					}, [messages.value.length === 0 ? (openBlock(), createElementBlock("div", _hoisted_10$6, [_cache[13] || (_cache[13] = createBaseVNode("i", {
						class: "bi bi-robot",
						style: {
							"font-size": "32px",
							"opacity": "0.5"
						}
					}, null, -1)), createBaseVNode("p", null, toDisplayString(unref(t)("ai.agentHint")), 1)])) : createCommentVNode("", true), (openBlock(true), createElementBlock(Fragment, null, renderList(messages.value, (msg, index) => {
						return openBlock(), createElementBlock("div", {
							key: index,
							class: normalizeClass(["ai-message", [msg.role, { "system-info": msg.isSystemInfo }]])
						}, [createBaseVNode("div", _hoisted_11$6, [createBaseVNode("i", { class: normalizeClass(msg.isSystemInfo ? "bi bi-info-circle" : msg.role === "user" ? "bi bi-person" : "bi bi-robot") }, null, 2)]), createBaseVNode("div", _hoisted_12$6, [
							msg.skillName ? (openBlock(), createElementBlock("div", _hoisted_13$6, [_cache[14] || (_cache[14] = createBaseVNode("i", { class: "bi bi-lightning-charge-fill" }, null, -1)), createBaseVNode("span", null, toDisplayString(msg.skillName), 1)])) : createCommentVNode("", true),
							msg.agentSteps && msg.agentSteps.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_14$6, [(openBlock(true), createElementBlock(Fragment, null, renderList(msg.agentSteps, (step, stepIdx) => {
								return openBlock(), createElementBlock(Fragment, { key: stepIdx }, [step.type === "thinking" ? (openBlock(), createElementBlock("div", _hoisted_15$6, [_cache[15] || (_cache[15] = createBaseVNode("div", { class: "ai-loading" }, [
									createBaseVNode("span"),
									createBaseVNode("span"),
									createBaseVNode("span")
								], -1)), createBaseVNode("span", _hoisted_16$6, toDisplayString(unref(t)("ai.agentThinking")), 1)])) : createCommentVNode("", true), step.type === "tool_call" ? (openBlock(), createElementBlock("div", _hoisted_17$5, [createBaseVNode("div", {
									class: "step-header",
									onClick: ($event) => toggleStep(step)
								}, [
									createBaseVNode("i", { class: normalizeClass([step.collapsed ? "bi bi-chevron-right" : "bi bi-chevron-down", "step-chevron"]) }, null, 2),
									_cache[16] || (_cache[16] = createBaseVNode("i", { class: "bi bi-terminal step-icon" }, null, -1)),
									createBaseVNode("code", _hoisted_19$5, toDisplayString(getToolDisplayCmd(step)), 1),
									step.result ? (openBlock(), createElementBlock("i", {
										key: 0,
										class: normalizeClass([step.collapsed ? "bi bi-check-circle" : "bi bi-check-circle-fill", "step-status"])
									}, null, 2)) : createCommentVNode("", true)
								], 8, _hoisted_18$5), !step.collapsed && step.result ? (openBlock(), createElementBlock("div", _hoisted_20$5, [createBaseVNode("pre", null, toDisplayString(step.result), 1)])) : createCommentVNode("", true)])) : createCommentVNode("", true)], 64);
							}), 128))])) : createCommentVNode("", true),
							msg.content ? (openBlock(), createElementBlock("div", {
								key: 2,
								class: "ai-message-text",
								innerHTML: renderMarkdown(msg.content)
							}, null, 8, _hoisted_21$5)) : createCommentVNode("", true)
						])], 2);
					}), 128))], 512), [[vShow, activeTab.value === "chat"]]),
					showSkillsPanel.value ? (openBlock(), createElementBlock("div", _hoisted_22$5, [createBaseVNode("div", _hoisted_23$5, [createBaseVNode("span", null, toDisplayString(unref(t)("ai.selectSkill")), 1), createBaseVNode("button", {
						class: "btn-ai-action",
						onClick: _cache[2] || (_cache[2] = ($event) => showSkillsPanel.value = false)
					}, [..._cache[17] || (_cache[17] = [createBaseVNode("i", { class: "bi bi-x" }, null, -1)])])]), createBaseVNode("div", _hoisted_24$5, [(openBlock(true), createElementBlock(Fragment, null, renderList(skills.value, (skill) => {
						return openBlock(), createElementBlock("div", {
							key: skill.id,
							class: normalizeClass(["skill-item", { active: selectedSkill.value?.id === skill.id }]),
							onClick: ($event) => toggleSkill(skill)
						}, [createBaseVNode("div", _hoisted_26$4, [
							_cache[18] || (_cache[18] = createBaseVNode("i", { class: "bi bi-lightning-charge-fill" }, null, -1)),
							createBaseVNode("span", _hoisted_27$4, toDisplayString(skill.name), 1),
							skill.source === "user" ? (openBlock(), createElementBlock("span", _hoisted_28$4, toDisplayString(unref(t)("ai.userSkill")), 1)) : createCommentVNode("", true)
						]), skill.description ? (openBlock(), createElementBlock("div", _hoisted_29$4, toDisplayString(skill.description), 1)) : createCommentVNode("", true)], 10, _hoisted_25$5);
					}), 128)), skills.value.length === 0 ? (openBlock(), createElementBlock("div", _hoisted_30$4, toDisplayString(unref(t)("ai.noSkills")), 1)) : createCommentVNode("", true)])])) : createCommentVNode("", true),
					showHistoryPanel.value ? (openBlock(), createElementBlock("div", _hoisted_31$4, [createBaseVNode("div", _hoisted_32$3, [createBaseVNode("span", null, toDisplayString(unref(t)("ai.history")), 1), createBaseVNode("button", {
						class: "btn-ai-action",
						onClick: _cache[3] || (_cache[3] = ($event) => showHistoryPanel.value = false)
					}, [..._cache[19] || (_cache[19] = [createBaseVNode("i", { class: "bi bi-x" }, null, -1)])])]), createBaseVNode("div", _hoisted_33$3, [(openBlock(true), createElementBlock(Fragment, null, renderList(historyList.value, (h) => {
						return openBlock(), createElementBlock("div", {
							key: h.sessionId,
							class: "history-item",
							onClick: ($event) => loadPastHistory(h.sessionId)
						}, [
							createBaseVNode("div", _hoisted_35$2, [createBaseVNode("span", _hoisted_36$2, toDisplayString(h.sessionName || h.sessionId.substring(0, 8)), 1), createBaseVNode("span", _hoisted_37$2, toDisplayString(formatTime(h.savedAt)), 1)]),
							createBaseVNode("div", _hoisted_38$2, toDisplayString(h.preview || unref(t)("ai.noHistory")), 1),
							createBaseVNode("div", _hoisted_39$2, toDisplayString(h.messageCount) + " " + toDisplayString(unref(t)("ai.messages")), 1)
						], 8, _hoisted_34$2);
					}), 128)), historyList.value.length === 0 ? (openBlock(), createElementBlock("div", _hoisted_40$1, toDisplayString(unref(t)("ai.noHistory")), 1)) : createCommentVNode("", true)])])) : createCommentVNode("", true),
					withDirectives(createBaseVNode("div", _hoisted_41$1, [createVNode(audit_panel_default, {
						ref_key: "auditPanelRef",
						ref: auditPanelRef
					}, null, 512)], 512), [[vShow, activeTab.value === "audit"]]),
					withDirectives(createBaseVNode("div", _hoisted_42$1, [createVNode(log_monitor_default, {
						ref_key: "logMonitorRef",
						ref: logMonitorRef,
						sessionId: props.sessionId,
						connectionId: props.connectionId,
						onWsSend: _cache[4] || (_cache[4] = (msg) => emit("ws-send", msg))
					}, null, 8, ["sessionId", "connectionId"])], 512), [[vShow, activeTab.value === "monitor"]]),
					selectedSkill.value && activeTab.value === "chat" ? (openBlock(), createElementBlock("div", _hoisted_43$1, [createBaseVNode("div", _hoisted_44$1, [
						_cache[21] || (_cache[21] = createBaseVNode("i", { class: "bi bi-lightning-charge-fill" }, null, -1)),
						createBaseVNode("span", null, toDisplayString(selectedSkill.value.name), 1),
						createBaseVNode("button", {
							onClick: clearSelectedSkill,
							class: "skill-remove"
						}, [..._cache[20] || (_cache[20] = [createBaseVNode("i", { class: "bi bi-x" }, null, -1)])])
					])])) : createCommentVNode("", true),
					withDirectives(createBaseVNode("div", _hoisted_45$1, [
						createBaseVNode("button", {
							class: normalizeClass(["btn-skill-toggle", { active: showSkillsPanel.value }]),
							onClick: toggleSkillsPanel,
							title: unref(t)("ai.skills")
						}, [..._cache[22] || (_cache[22] = [createBaseVNode("i", { class: "bi bi-lightning-charge" }, null, -1)])], 10, _hoisted_46$1),
						withDirectives(createBaseVNode("textarea", {
							ref_key: "inputRef",
							ref: inputRef,
							"onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => inputText.value = $event),
							placeholder: unref(t)("ai.inputPlaceholder"),
							onKeydown: [withKeys(withModifiers(handleSend, ["exact", "prevent"]), ["enter"]), withKeys(withModifiers(handleNewLine, ["shift"]), ["enter"])],
							onInput: handleInput,
							rows: "1",
							disabled: isAgentRunning.value
						}, null, 40, _hoisted_47$1), [[vModelText, inputText.value]]),
						createBaseVNode("button", {
							class: "btn-send",
							onClick: handleSend,
							disabled: !inputText.value.trim() || isAgentRunning.value
						}, [..._cache[23] || (_cache[23] = [createBaseVNode("i", { class: "bi bi-send-fill" }, null, -1)])], 8, _hoisted_48$1)
					], 512), [[vShow, activeTab.value === "chat"]])
				], 2);
			};
		}
	});
}));
//#endregion
//#region src/components/ai-chat/index.vue?vue&type=style&index=0&scoped=eed12088&lang.css
var init_index_vue_vue_type_style_index_0_scoped_eed12088_lang = __esmMin((() => {}));
//#endregion
//#region src/components/ai-chat/index.vue
var ai_chat_default;
var init_ai_chat = __esmMin((() => {
	init_index_vue_vue_type_script_setup_true_lang$4();
	init_index_vue_vue_type_script_setup_true_lang$4();
	init_index_vue_vue_type_style_index_0_scoped_eed12088_lang();
	init__plugin_vue_export_helper();
	ai_chat_default = /*#__PURE__*/ _plugin_vue_export_helper_default(index_vue_vue_type_script_setup_true_lang_default$4, [["__scopeId", "data-v-eed12088"]]);
}));
//#endregion
//#region src/components/file-transfer.vue?vue&type=script&setup=true&lang.ts
var _hoisted_1$6, _hoisted_2$6, _hoisted_3$5, _hoisted_4$5, _hoisted_5$5, _hoisted_6$5, _hoisted_7$5, _hoisted_8$5, _hoisted_9$5, _hoisted_10$5, _hoisted_11$5, _hoisted_12$5, _hoisted_13$5, _hoisted_14$5, _hoisted_15$5, _hoisted_16$5, _hoisted_17$4, _hoisted_18$4, _hoisted_19$4, _hoisted_20$4, _hoisted_21$4, _hoisted_22$4, _hoisted_23$4, _hoisted_24$4, _hoisted_25$4, _hoisted_26$3, _hoisted_27$3, _hoisted_28$3, _hoisted_29$3, _hoisted_30$3, _hoisted_31$3, _hoisted_32$2, _hoisted_33$2, file_transfer_vue_vue_type_script_setup_true_lang_default;
var init_file_transfer_vue_vue_type_script_setup_true_lang = __esmMin((() => {
	init_vue_runtime_esm_bundler();
	init_vue_i18n();
	init_zmodem();
	init_toast();
	_hoisted_1$6 = { class: "ft-title" };
	_hoisted_2$6 = { class: "ft-header-actions" };
	_hoisted_3$5 = ["title"];
	_hoisted_4$5 = ["title"];
	_hoisted_5$5 = { class: "ft-body" };
	_hoisted_6$5 = {
		key: 0,
		class: "d-flex gap-2 mb-2"
	};
	_hoisted_7$5 = { key: 1 };
	_hoisted_8$5 = { class: "ms-2" };
	_hoisted_9$5 = {
		key: 0,
		class: "dest-dir-hint mt-2 px-2 py-1"
	};
	_hoisted_10$5 = { class: "d-flex align-items-center gap-2" };
	_hoisted_11$5 = { class: "text-secondary mb-0 text-nowrap" };
	_hoisted_12$5 = ["disabled"];
	_hoisted_13$5 = {
		class: "mt-1",
		style: { "font-size": "12px" }
	};
	_hoisted_14$5 = {
		key: 0,
		class: "text-secondary"
	};
	_hoisted_15$5 = {
		key: 1,
		class: "text-danger"
	};
	_hoisted_16$5 = {
		key: 2,
		class: "text-warning"
	};
	_hoisted_17$4 = {
		key: 3,
		class: "text-secondary"
	};
	_hoisted_18$4 = { key: 2 };
	_hoisted_19$4 = {
		key: 0,
		class: "text-center py-2"
	};
	_hoisted_20$4 = {
		key: 1,
		class: "mb-2"
	};
	_hoisted_21$4 = ["placeholder"];
	_hoisted_22$4 = ["disabled"];
	_hoisted_23$4 = {
		key: 3,
		class: "mt-2"
	};
	_hoisted_24$4 = { class: "transfer-list" };
	_hoisted_25$4 = {
		key: 0,
		class: "transfer-item"
	};
	_hoisted_26$3 = { class: "d-flex align-items-center justify-content-between mb-1" };
	_hoisted_27$3 = {
		class: "text-truncate",
		style: { "font-size": "12px" }
	};
	_hoisted_28$3 = { style: {
		"font-size": "11px",
		"color": "var(--text-secondary)"
	} };
	_hoisted_29$3 = {
		class: "progress",
		style: { "height": "3px" }
	};
	_hoisted_30$3 = {
		key: 0,
		class: "text-danger",
		style: { "font-size": "11px" }
	};
	_hoisted_31$3 = { class: "d-flex align-items-center justify-content-between" };
	_hoisted_32$2 = {
		class: "text-truncate",
		style: { "font-size": "12px" }
	};
	_hoisted_33$2 = {
		key: 4,
		class: "mt-2 text-center"
	};
	file_transfer_vue_vue_type_script_setup_true_lang_default = /*@__PURE__*/ defineComponent({
		__name: "file-transfer",
		setup(__props, { expose: __expose }) {
			const { t } = useI18n();
			const fileInput = ref();
			const widgetRef = ref();
			const visible = ref(false);
			const isCollapsed = ref(false);
			const dragPos = ref({
				x: 0,
				y: 0
			});
			const isMoved = ref(false);
			const isWidgetDragging = ref(false);
			const dragStyle = computed(() => {
				if (!isMoved.value) return {};
				return {
					left: `${dragPos.value.x}px`,
					top: `${dragPos.value.y}px`,
					bottom: "auto",
					right: "auto"
				};
			});
			let dragStartX = 0, dragStartY = 0, dragStartLeft = 0, dragStartTop = 0;
			function onDragStart(e) {
				if (e.button !== 0) return;
				if (e.target.closest(".ft-btn-icon")) return;
				e.preventDefault();
				const el = widgetRef.value;
				const rect = el.getBoundingClientRect();
				const parentRect = el.parentElement.getBoundingClientRect();
				if (!isMoved.value) {
					dragPos.value = {
						x: rect.left - parentRect.left,
						y: rect.top - parentRect.top
					};
					isMoved.value = true;
				}
				dragStartX = e.clientX;
				dragStartY = e.clientY;
				dragStartLeft = dragPos.value.x;
				dragStartTop = dragPos.value.y;
				isWidgetDragging.value = true;
				const onMouseMove = (ev) => {
					const dx = ev.clientX - dragStartX;
					const dy = ev.clientY - dragStartY;
					dragPos.value = {
						x: dragStartLeft + dx,
						y: dragStartTop + dy
					};
				};
				const onMouseUp = () => {
					isWidgetDragging.value = false;
					document.removeEventListener("mousemove", onMouseMove);
					document.removeEventListener("mouseup", onMouseUp);
				};
				document.addEventListener("mousemove", onMouseMove);
				document.addEventListener("mouseup", onMouseUp);
			}
			const mode = ref("upload");
			const isDragging = ref(false);
			const remoteFilePath = ref("");
			const transferring = ref(false);
			const currentProgress = ref(null);
			const transferHistory = ref([]);
			let zmodemSession = null;
			let zmodemAutoMode = ref(false);
			let activeTermRef = null;
			const destDir = ref("");
			const destDirLoading = ref(false);
			const destDirError = ref("");
			const destDirManual = ref(false);
			const isZmodemSend = ref(false);
			/**
			* 向服务端查询当前终端所在目录。
			* @param zmodem 远端 rz 是否正在等待接收文件。为 true 时服务端禁止向交互式 shell
			*               注入探测命令（否则 Ctrl+C 会打断 rz，注入文本也会被 rz 吞掉）。
			* @param force  强制服务端重新探测，忽略缓存（手动点"重新检测"、上传前兜底时使用）。
			*/
			async function queryCwd(zmodem, force) {
				const sid = activeTermRef?.sessionId;
				if (!sid) return "";
				destDirLoading.value = true;
				destDirError.value = "";
				try {
					const electronApi = window.electronAPI;
					let cwd = "";
					if (electronApi?.api?.getCwd) {
						const res = await electronApi.api.getCwd(sid, !!zmodem, !!force);
						cwd = res?.cwd || "";
						if (!cwd && res?.error) destDirError.value = res.error;
					} else {
						const data = await (await fetch(`/api/cwd?sessionId=${encodeURIComponent(sid)}${zmodem ? "&zmodem=1" : ""}${force ? "&force=1" : ""}`)).json();
						cwd = data?.cwd || "";
						if (!cwd && data?.error) destDirError.value = data.error;
					}
					if (cwd && !destDirManual.value) destDir.value = cwd;
					if (!cwd) destDirManual.value = false;
					return cwd;
				} catch (e) {
					destDirError.value = e?.message || String(e);
					return "";
				} finally {
					destDirLoading.value = false;
				}
			}
			/**
			* 向终端发送数据（自动附带正确的 sessionId）
			*/
			function sendToTerm(data) {
				if (!activeTermRef) return;
				const sid = activeTermRef.sessionId;
				activeTermRef.sendToServer({
					type: "terminal",
					sessionId: sid || void 0,
					data
				});
			}
			/**
			* 注册接收文件的 session 事件处理器
			*/
			function setupReceiveHandlers(session) {
				session.on("offer", (offer) => {
					handleFileOffer(offer);
				});
				session.on("session_end", () => {
					console.log("[FileTransfer] Receive session ended");
					transferring.value = false;
					currentProgress.value = null;
					setTimeout(() => {
						if (!transferring.value) isCollapsed.value = true;
					}, 800);
				});
			}
			/**
			* 显示文件传输面板
			* @param tabId 当前 tab ID
			* @param termRef 终端组件引用
			* @param info ZMODEM session 信息 { role, session, offer? }
			*/
			function show(tabId, termRef, info) {
				activeTermRef = termRef;
				currentProgress.value = null;
				transferHistory.value = [];
				transferring.value = false;
				zmodemAutoMode.value = false;
				visible.value = true;
				isCollapsed.value = false;
				destDir.value = "";
				destDirError.value = "";
				destDirManual.value = false;
				isZmodemSend.value = !!(info && info.role === "send");
				if (info && info.session) {
					zmodemSession = info.session;
					const role = info.role;
					console.log("[FileTransfer] ZMODEM session ready, role:", role);
					if (role === "send") {
						mode.value = "upload";
						zmodemAutoMode.value = true;
						info.markHandlersReady?.();
					} else if (role === "receive") {
						mode.value = "download";
						zmodemAutoMode.value = true;
						setupReceiveHandlers(zmodemSession);
						info.markHandlersReady?.();
						zmodemSession.start?.().then((offerOrUndefined) => {
							if (offerOrUndefined && typeof offerOrUndefined.accept === "function") {
								console.log("[FileTransfer] start() returned offer, handling directly");
								handleFileOffer(offerOrUndefined);
							} else console.log("[FileTransfer] start() resolved without offer (ZFIN)");
						}).catch((err) => {
							console.warn("[FileTransfer] session.start() error:", err);
							toast.error(t("fileTransfer.downloadFailed"));
						});
					}
				} else {
					zmodemSession = null;
					mode.value = "upload";
				}
				if (mode.value === "upload") {
					if (isZmodemSend.value) (async () => {
						await interruptRemoteForeground();
						await queryCwd(false, true);
					})();
					else queryCwd(false);
				}
			}
			function handleClose() {
				if (transferring.value) cancelTransfer();
				else {
					if (activeTermRef) {
						const termRef = activeTermRef;
						const sid = termRef.sessionId;
						const sendAbort = (data) => {
							termRef.sendToServer({
								type: "terminal",
								sessionId: sid || void 0,
								data
							});
						};
						sendAbort("");
						setTimeout(() => sendAbort(""), 100);
						setTimeout(() => sendAbort(""), 300);
					}
					if (zmodemSession) {
						try {
							zmodemSession.abort?.();
						} catch (e) {}
						zmodemSession = null;
					}
				}
				visible.value = false;
				activeTermRef = null;
			}
			function triggerFileInput() {
				fileInput.value?.click();
			}
			function handleDrop(e) {
				isDragging.value = false;
				const files = e.dataTransfer?.files;
				if (files?.length) startUpload(Array.from(files));
			}
			function handleFileSelect(e) {
				const input = e.target;
				if (input.files?.length) {
					startUpload(Array.from(input.files));
					input.value = "";
				}
			}
			/** 目标目录是否已是可用的绝对路径 */
			function hasValidDestDir() {
				return !!destDir.value && destDir.value.startsWith("/");
			}
			/**
			* 中断远端前台进程并清空当前输入行（Ctrl+C x2 + Ctrl+U）。
			* 上传流程本来就要中断 rz 再改用 SFTP 直传，所以这里是安全的；
			* 目录探测失败时也可以先调用它，让 shell 回到提示符后再注入探测命令。
			*/
			async function interruptRemoteForeground() {
				if (!activeTermRef) return;
				sendToTerm("");
				await new Promise((r) => setTimeout(r, 300));
				sendToTerm("");
				await new Promise((r) => setTimeout(r, 200));
				sendToTerm("");
				await new Promise((r) => setTimeout(r, 300));
			}
			/**
			* 上传文件 - 通过 HTTP POST + SFTP 直传
			*/
			async function startUpload(files) {
				if (!activeTermRef) {
					toast.error(t("fileTransfer.terminalNotConnected"));
					return;
				}
				if (!hasValidDestDir() || !destDirManual.value) {
					await interruptRemoteForeground();
					await queryCwd(false, true);
				}
				if (!hasValidDestDir()) {
					toast.warning("未能获取当前终端目录，请在上方填写目标目录（绝对路径）后重试");
					return;
				}
				transferring.value = true;
				try {
					if (zmodemSession) {
						try {
							zmodemSession.abort?.();
						} catch (e) {}
						zmodemSession = null;
					}
					await interruptRemoteForeground();
					for (const file of files) {
						currentProgress.value = {
							direction: "upload",
							fileName: file.name,
							bytesSent: 0,
							bytesTotal: file.size,
							percent: 0,
							state: "transferring"
						};
						const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
						const sid = activeTermRef.sessionId;
						const cwd = destDir.value && destDir.value.startsWith("/") ? destDir.value : "";
						const remoteName = cwd ? `${cwd.replace(/\/$/, "")}/${safeName}` : safeName;
						console.log(`[FileTransfer] HTTP upload: ${file.name} -> ${remoteName}, size=${file.size}, sessionId=${sid}`);
						currentProgress.value = {
							direction: "upload",
							fileName: file.name,
							bytesSent: Math.floor(file.size * .1),
							bytesTotal: file.size,
							percent: 10,
							state: "transferring"
						};
						const result = await httpFileUpload(file, remoteName, sid);
						if (result.success) {
							currentProgress.value = {
								direction: "upload",
								fileName: file.name,
								bytesSent: file.size,
								bytesTotal: file.size,
								percent: 100,
								state: "transferring"
							};
							transferHistory.value.unshift({
								direction: "upload",
								fileName: file.name,
								bytesSent: file.size,
								bytesTotal: file.size,
								percent: 100,
								state: "complete"
							});
						} else throw new Error(result.error || "Upload failed");
						currentProgress.value = null;
					}
					transferring.value = false;
					toast.success(t("fileTransfer.uploadComplete"));
					setTimeout(() => {
						if (!transferring.value) isCollapsed.value = true;
					}, 800);
				} catch (error) {
					console.error("[FileTransfer] Upload error:", error);
					if (currentProgress.value) transferHistory.value.unshift({
						...currentProgress.value,
						state: "error"
					});
					currentProgress.value = null;
					transferring.value = false;
					zmodemSession = null;
					toast.error(error.message || t("fileTransfer.uploadFailed"));
				}
			}
			/**
			* 通过 HTTP POST 上传文件到服务端（Web 模式）
			* 或 IPC 上传到主进程（Electron 模式，app:// 协议下 fetch 不可用）
			*/
			async function httpFileUpload(file, remoteName, sessionId) {
				const electronApi = window.electronAPI;
				if (electronApi?.api?.uploadFile) try {
					const buffer = await file.arrayBuffer();
					console.log(`[FileTransfer] IPC upload: ${file.name} -> ${remoteName}, size=${file.size}`);
					const result = await electronApi.api.uploadFile(sessionId || "", remoteName, buffer);
					console.log(`[FileTransfer] IPC upload result:`, result);
					return result;
				} catch (err) {
					console.error(`[FileTransfer] IPC upload error:`, err);
					return {
						success: false,
						error: err.message || "IPC upload failed"
					};
				}
				try {
					console.log(`[FileTransfer] POST /api/file-upload, size=${file.size}`);
					const data = await (await fetch("/api/file-upload", {
						method: "POST",
						headers: {
							"X-Session-Id": sessionId || "",
							"X-File-Name": remoteName,
							"Content-Type": "application/octet-stream"
						},
						body: file
					})).json();
					console.log(`[FileTransfer] HTTP upload result:`, data);
					return data;
				} catch (err) {
					console.error(`[FileTransfer] HTTP upload error:`, err);
					return {
						success: false,
						error: err.message || "HTTP upload failed"
					};
				}
			}
			/**
			* 处理下载的文件 offer (sz)
			*/
			function handleFileOffer(offer) {
				const details = offer.get_details();
				const fileName = details.name;
				const fileSize = details.size || 0;
				console.log("[FileTransfer] Handling file offer:", fileName, fileSize, "bytes");
				transferring.value = true;
				currentProgress.value = {
					direction: "download",
					fileName,
					bytesSent: 0,
					bytesTotal: fileSize,
					percent: 0,
					state: "transferring"
				};
				let receivedBytes = 0;
				offer.on("input", (payload) => {
					receivedBytes += payload.length;
					currentProgress.value = {
						direction: "download",
						fileName,
						bytesSent: receivedBytes,
						bytesTotal: fileSize,
						percent: fileSize > 0 ? Math.round(receivedBytes / fileSize * 100) : 0,
						state: "transferring"
					};
				});
				offer.accept().then((packets) => {
					console.log("[FileTransfer] File received:", fileName, packets?.length, "packets");
					if (packets && packets.length > 0) import_zmodem_browser.Browser.save_to_disk(packets, fileName);
					transferHistory.value.unshift({
						direction: "download",
						fileName,
						bytesSent: fileSize,
						bytesTotal: fileSize,
						percent: 100,
						state: "complete"
					});
					currentProgress.value = null;
					transferring.value = false;
					toast.success(t("fileTransfer.downloadComplete"));
					setTimeout(() => {
						if (!transferring.value) isCollapsed.value = true;
					}, 2e3);
				}).catch((err) => {
					console.error("[FileTransfer] Offer accept error:", err);
					if (currentProgress.value) transferHistory.value.unshift({
						...currentProgress.value,
						state: "error"
					});
					currentProgress.value = null;
					transferring.value = false;
					toast.error(err.message || t("fileTransfer.downloadFailed"));
				});
			}
			/**
			* 手动下载（非 ZMODEM 自动检测）
			*/
			function startManualDownload() {
				if (!remoteFilePath.value) {
					toast.warning(t("fileTransfer.remotePathRequired"));
					return;
				}
				if (activeTermRef) {
					const cmd = `sz ${remoteFilePath.value}\n`;
					activeTermRef.sendToServer?.({
						type: "terminal",
						sessionId: void 0,
						data: cmd
					});
					toast.info(t("fileTransfer.startDownload"));
				}
				isCollapsed.value = true;
			}
			function cancelTransfer() {
				if (activeTermRef) {
					const termRef = activeTermRef;
					const sid = termRef.sessionId;
					const sendAbort = (data) => {
						termRef.sendToServer({
							type: "terminal",
							sessionId: sid || void 0,
							data
						});
					};
					sendAbort("");
					setTimeout(() => sendAbort(""), 100);
					setTimeout(() => sendAbort(""), 300);
				}
				if (zmodemSession) try {
					zmodemSession.abort?.();
				} catch (e) {}
				transferring.value = false;
				if (currentProgress.value) transferHistory.value.unshift({
					...currentProgress.value,
					state: "error"
				});
				currentProgress.value = null;
				zmodemSession = null;
			}
			function formatSize(bytes) {
				return formatFileSize(bytes);
			}
			__expose({ show });
			return (_ctx, _cache) => {
				return visible.value ? (openBlock(), createElementBlock("div", {
					key: 0,
					ref_key: "widgetRef",
					ref: widgetRef,
					class: normalizeClass(["file-transfer-widget", {
						collapsed: isCollapsed.value,
						dragging: isWidgetDragging.value
					}]),
					style: normalizeStyle(dragStyle.value)
				}, [createBaseVNode("div", {
					class: "ft-header",
					onMousedown: onDragStart,
					onDblclick: _cache[1] || (_cache[1] = ($event) => isCollapsed.value = !isCollapsed.value)
				}, [createBaseVNode("span", _hoisted_1$6, [_cache[10] || (_cache[10] = createBaseVNode("i", { class: "bi bi-cloud-arrow-up me-1" }, null, -1)), transferring.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [createTextVNode(toDisplayString(unref(t)("fileTransfer.transferring")), 1)], 64)) : transferHistory.value.length > 0 ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [createTextVNode(toDisplayString(unref(t)("fileTransfer.title")) + " (" + toDisplayString(transferHistory.value.length) + ") ", 1)], 64)) : (openBlock(), createElementBlock(Fragment, { key: 2 }, [createTextVNode(toDisplayString(unref(t)("fileTransfer.title")), 1)], 64))]), createBaseVNode("div", _hoisted_2$6, [createBaseVNode("button", {
					class: "ft-btn-icon",
					onClick: _cache[0] || (_cache[0] = withModifiers(($event) => isCollapsed.value = !isCollapsed.value, ["stop"])),
					title: isCollapsed.value ? "展开" : "收起"
				}, [createBaseVNode("i", { class: normalizeClass(isCollapsed.value ? "bi bi-chevron-up" : "bi bi-chevron-down") }, null, 2)], 8, _hoisted_3$5), createBaseVNode("button", {
					class: "ft-btn-icon",
					onClick: withModifiers(handleClose, ["stop"]),
					title: unref(t)("common.close")
				}, [..._cache[11] || (_cache[11] = [createBaseVNode("i", { class: "bi bi-x" }, null, -1)])], 8, _hoisted_4$5)])], 32), withDirectives(createBaseVNode("div", _hoisted_5$5, [
					!unref(zmodemAutoMode) ? (openBlock(), createElementBlock("div", _hoisted_6$5, [createBaseVNode("button", {
						class: normalizeClass(["btn btn-sm flex-fill", mode.value === "upload" ? "btn-primary" : "btn-outline-secondary"]),
						onClick: _cache[2] || (_cache[2] = ($event) => mode.value = "upload")
					}, [_cache[12] || (_cache[12] = createBaseVNode("i", { class: "bi bi-upload me-1" }, null, -1)), createTextVNode(toDisplayString(unref(t)("fileTransfer.upload")), 1)], 2), createBaseVNode("button", {
						class: normalizeClass(["btn btn-sm flex-fill", mode.value === "download" ? "btn-primary" : "btn-outline-secondary"]),
						onClick: _cache[3] || (_cache[3] = ($event) => mode.value = "download")
					}, [_cache[13] || (_cache[13] = createBaseVNode("i", { class: "bi bi-download me-1" }, null, -1)), createTextVNode(toDisplayString(unref(t)("fileTransfer.download")), 1)], 2)])) : createCommentVNode("", true),
					mode.value === "upload" ? (openBlock(), createElementBlock("div", _hoisted_7$5, [
						createBaseVNode("div", {
							class: normalizeClass(["drop-zone", { dragging: isDragging.value }]),
							onDragover: _cache[4] || (_cache[4] = withModifiers(($event) => isDragging.value = true, ["prevent"])),
							onDragleave: _cache[5] || (_cache[5] = ($event) => isDragging.value = false),
							onDrop: withModifiers(handleDrop, ["prevent"]),
							onClick: triggerFileInput
						}, [_cache[14] || (_cache[14] = createBaseVNode("i", {
							class: "bi bi-cloud-upload",
							style: { "font-size": "20px" }
						}, null, -1)), createBaseVNode("span", _hoisted_8$5, toDisplayString(unref(t)("fileTransfer.dropZone")), 1)], 34),
						createBaseVNode("input", {
							ref_key: "fileInput",
							ref: fileInput,
							type: "file",
							multiple: "",
							style: { "display": "none" },
							onChange: handleFileSelect
						}, null, 544),
						mode.value === "upload" ? (openBlock(), createElementBlock("div", _hoisted_9$5, [createBaseVNode("div", _hoisted_10$5, [
							createBaseVNode("label", _hoisted_11$5, [_cache[15] || (_cache[15] = createBaseVNode("i", { class: "bi bi-folder2 me-1 text-info" }, null, -1)), createTextVNode(toDisplayString(isZmodemSend.value ? "rz 写入目录" : "目标目录"), 1)]),
							withDirectives(createBaseVNode("input", {
								"onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => destDir.value = $event),
								type: "text",
								class: "form-control form-control-sm",
								placeholder: "/当前/目录（可手动修改）",
								spellcheck: "false",
								onInput: _cache[7] || (_cache[7] = ($event) => destDirManual.value = true)
							}, null, 544), [[vModelText, destDir.value]]),
							createBaseVNode("button", {
								class: "btn btn-sm btn-outline-secondary",
								disabled: destDirLoading.value,
								onClick: _cache[8] || (_cache[8] = ($event) => queryCwd(isZmodemSend.value, true)),
								title: "重新检测当前目录"
							}, [createBaseVNode("i", { class: normalizeClass(["bi", destDirLoading.value ? "bi-hourglass-split" : "bi-arrow-clockwise"]) }, null, 2)], 8, _hoisted_12$5)
						]), createBaseVNode("div", _hoisted_13$5, [destDirLoading.value ? (openBlock(), createElementBlock("span", _hoisted_14$5, [..._cache[16] || (_cache[16] = [createBaseVNode("span", {
							class: "spinner-border spinner-border-sm me-1",
							style: {
								"width": "10px",
								"height": "10px"
							}
						}, null, -1), createTextVNode(" 正在检测当前目录… ", -1)])])) : destDir.value && !destDir.value.startsWith("/") ? (openBlock(), createElementBlock("span", _hoisted_15$5, [..._cache[17] || (_cache[17] = [createBaseVNode("i", { class: "bi bi-exclamation-triangle me-1" }, null, -1), createTextVNode("目录必须是绝对路径（以 / 开头），否则将回退到家目录。 ", -1)])])) : !destDir.value ? (openBlock(), createElementBlock("span", _hoisted_16$5, [_cache[18] || (_cache[18] = createBaseVNode("i", { class: "bi bi-exclamation-triangle me-1" }, null, -1)), createTextVNode(" 未能自动检测当前目录" + toDisplayString(destDirError.value ? "：" + destDirError.value : "") + "，请手动填写目标目录（绝对路径），否则文件会传到家目录。 ", 1)])) : isZmodemSend.value ? (openBlock(), createElementBlock("span", _hoisted_17$4, "上传前会中断远端 rz，文件将直接写入上面目录。")) : createCommentVNode("", true)])])) : createCommentVNode("", true)
					])) : createCommentVNode("", true),
					mode.value === "download" ? (openBlock(), createElementBlock("div", _hoisted_18$4, [unref(zmodemAutoMode) ? (openBlock(), createElementBlock("div", _hoisted_19$4, [_cache[19] || (_cache[19] = createBaseVNode("div", { class: "spinner-border spinner-border-sm text-primary me-2" }, null, -1)), createTextVNode(" " + toDisplayString(unref(t)("fileTransfer.waitingForFiles")), 1)])) : (openBlock(), createElementBlock("div", _hoisted_20$4, [withDirectives(createBaseVNode("input", {
						type: "text",
						class: "form-control form-control-sm",
						"onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => remoteFilePath.value = $event),
						placeholder: unref(t)("fileTransfer.remotePathPlaceholder"),
						style: {
							"background": "#313244",
							"border-color": "#45475a",
							"color": "var(--text-primary)"
						}
					}, null, 8, _hoisted_21$4), [[vModelText, remoteFilePath.value]]), createBaseVNode("button", {
						class: "btn btn-primary btn-sm w-100 mt-2",
						disabled: !remoteFilePath.value || transferring.value,
						onClick: startManualDownload
					}, [_cache[20] || (_cache[20] = createBaseVNode("i", { class: "bi bi-download me-1" }, null, -1)), createTextVNode(toDisplayString(unref(t)("fileTransfer.startDownload")), 1)], 8, _hoisted_22$4)]))])) : createCommentVNode("", true),
					transferring.value || transferHistory.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_23$4, [createBaseVNode("div", _hoisted_24$4, [currentProgress.value ? (openBlock(), createElementBlock("div", _hoisted_25$4, [
						createBaseVNode("div", _hoisted_26$3, [createBaseVNode("span", _hoisted_27$3, [createBaseVNode("i", { class: normalizeClass([currentProgress.value.direction === "upload" ? "bi bi-upload" : "bi bi-download", "me-1"]) }, null, 2), createTextVNode(" " + toDisplayString(currentProgress.value.fileName), 1)]), createBaseVNode("span", _hoisted_28$3, toDisplayString(formatSize(currentProgress.value.bytesSent)) + " / " + toDisplayString(formatSize(currentProgress.value.bytesTotal)), 1)]),
						createBaseVNode("div", _hoisted_29$3, [createBaseVNode("div", {
							class: normalizeClass(["progress-bar", currentProgress.value.state === "error" ? "bg-danger" : "bg-primary"]),
							style: normalizeStyle({ width: currentProgress.value.percent + "%" })
						}, null, 6)]),
						currentProgress.value.state === "error" ? (openBlock(), createElementBlock("div", _hoisted_30$3, toDisplayString(unref(t)("fileTransfer.transferFailed")), 1)) : createCommentVNode("", true)
					])) : createCommentVNode("", true), (openBlock(true), createElementBlock(Fragment, null, renderList(transferHistory.value, (item, idx) => {
						return openBlock(), createElementBlock("div", {
							key: idx,
							class: "transfer-item"
						}, [createBaseVNode("div", _hoisted_31$3, [createBaseVNode("span", _hoisted_32$2, [createBaseVNode("i", { class: normalizeClass([item.direction === "upload" ? "bi bi-upload" : "bi bi-download", "me-1"]) }, null, 2), createTextVNode(" " + toDisplayString(item.fileName), 1)]), createBaseVNode("span", {
							style: { "font-size": "11px" },
							class: normalizeClass(item.state === "complete" ? "text-success" : "text-danger")
						}, toDisplayString(item.state === "complete" ? unref(t)("fileTransfer.complete") : unref(t)("fileTransfer.failed")), 3)])]);
					}), 128))])])) : createCommentVNode("", true),
					transferring.value ? (openBlock(), createElementBlock("div", _hoisted_33$2, [createBaseVNode("button", {
						class: "btn btn-outline-danger btn-sm",
						onClick: cancelTransfer
					}, [_cache[21] || (_cache[21] = createBaseVNode("i", { class: "bi bi-x-circle me-1" }, null, -1)), createTextVNode(toDisplayString(unref(t)("fileTransfer.cancelTransfer")), 1)])])) : createCommentVNode("", true)
				], 512), [[vShow, !isCollapsed.value]])], 6)) : createCommentVNode("", true);
			};
		}
	});
}));
//#endregion
//#region src/components/file-transfer.vue?vue&type=style&index=0&scoped=3c6fba48&lang.css
var init_file_transfer_vue_vue_type_style_index_0_scoped_3c6fba48_lang = __esmMin((() => {}));
//#endregion
//#region src/components/file-transfer.vue
var file_transfer_default;
var init_file_transfer = __esmMin((() => {
	init_file_transfer_vue_vue_type_script_setup_true_lang();
	init_file_transfer_vue_vue_type_script_setup_true_lang();
	init_file_transfer_vue_vue_type_style_index_0_scoped_3c6fba48_lang();
	init__plugin_vue_export_helper();
	file_transfer_default = /*#__PURE__*/ _plugin_vue_export_helper_default(file_transfer_vue_vue_type_script_setup_true_lang_default, [["__scopeId", "data-v-3c6fba48"]]);
}));
//#endregion
//#region src/service/file.ts
function unwrap$1(res) {
	if (res && typeof res === "object" && "ret" in res) {
		if (res.ret !== 0) throw new Error(res.msg || "请求失败");
		return res.data;
	}
	return res;
}
function listDirectory(sessionId, remotePath) {
	return request("/api/file/list", {
		sessionId,
		path: remotePath
	}).then(unwrap$1);
}
function makeDirectory(sessionId, remotePath) {
	return request("/api/file/mkdir", {
		sessionId,
		path: remotePath
	}).then(unwrap$1);
}
function removePath(sessionId, remotePath) {
	return request("/api/file/remove", {
		sessionId,
		path: remotePath
	}).then(unwrap$1);
}
function renamePath(sessionId, oldPath, newPath) {
	return request("/api/file/rename", {
		sessionId,
		oldPath,
		newPath
	}).then(unwrap$1);
}
function getDefaultDir(sessionId) {
	return request("/api/file/defaultDir", { sessionId }).then(unwrap$1);
}
/** 判断当前是否处于 Electron 生产模式（文件二进制走主进程 IPC） */
function isElectronProduction() {
	const api = window.electronAPI;
	return !!(api && api.isElectron && api.isPackaged && api.api);
}
/** 上传本地文件到远程指定路径 */
async function uploadFile(sessionId, remotePath, file) {
	if (isElectronProduction()) {
		const api = window.electronAPI.api;
		const buf = await file.arrayBuffer();
		const res = await api.uploadFile(sessionId, remotePath, buf);
		if (!res || !res.success) throw new Error(res?.error || "上传失败");
		return;
	}
	const url = getRequestUrl("/api/file-upload");
	const resp = await fetch(url, {
		method: "POST",
		headers: {
			"X-Session-Id": sessionId,
			"X-File-Name": remotePath,
			"Content-Type": "application/octet-stream"
		},
		body: file,
		credentials: "include"
	});
	const data = await resp.json().catch(() => ({}));
	if (!resp.ok || !data.success) throw new Error(data.error || "上传失败");
}
/** 下载远程文件到本地 */
async function downloadFile(sessionId, remotePath, fileName) {
	if (isElectronProduction()) {
		const res = await window.electronAPI.api.downloadFile(sessionId, remotePath, fileName);
		if (res && res.canceled) return;
		if (!res || !res.success) throw new Error(res?.error || "下载失败");
		return;
	}
	const params = new URLSearchParams({
		sessionId,
		path: remotePath
	});
	const url = getRequestUrl("/api/file/download") + "?" + params.toString();
	const resp = await fetch(url, { credentials: "include" });
	if (!resp.ok) {
		const errData = await resp.json().catch(() => ({}));
		throw new Error(errData.error || errData.msg || `下载失败 (${resp.status})`);
	}
	const blob = await resp.blob();
	const blobUrl = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = blobUrl;
	a.download = fileName || remotePath.split("/").pop() || "download";
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(blobUrl);
}
var init_file = __esmMin((() => {
	init_base();
}));
//#endregion
//#region src/components/file-manager.vue?vue&type=script&setup=true&lang.ts
var _hoisted_1$5, _hoisted_2$5, _hoisted_3$4, _hoisted_4$4, _hoisted_5$4, _hoisted_6$4, _hoisted_7$4, _hoisted_8$4, _hoisted_9$4, _hoisted_10$4, _hoisted_11$4, _hoisted_12$4, _hoisted_13$4, _hoisted_14$4, _hoisted_15$4, _hoisted_16$4, _hoisted_17$3, _hoisted_18$3, _hoisted_19$3, _hoisted_20$3, _hoisted_21$3, _hoisted_22$3, _hoisted_23$3, _hoisted_24$3, _hoisted_25$3, _hoisted_26$2, _hoisted_27$2, _hoisted_28$2, _hoisted_29$2, _hoisted_30$2, _hoisted_31$2, _hoisted_32$1, _hoisted_33$1, _hoisted_34$1, _hoisted_35$1, _hoisted_36$1, _hoisted_37$1, _hoisted_38$1, _hoisted_39$1, file_manager_vue_vue_type_script_setup_true_lang_default;
var init_file_manager_vue_vue_type_script_setup_true_lang = __esmMin((() => {
	init_vue_runtime_esm_bundler();
	init_vue_i18n();
	init_file();
	init_modal();
	init_toast();
	_hoisted_1$5 = { class: "fm-panel" };
	_hoisted_2$5 = { class: "fm-header" };
	_hoisted_3$4 = { class: "fm-title" };
	_hoisted_4$4 = { class: "fm-header-actions" };
	_hoisted_5$4 = ["title"];
	_hoisted_6$4 = { class: "fm-toolbar" };
	_hoisted_7$4 = ["disabled"];
	_hoisted_8$4 = ["disabled"];
	_hoisted_9$4 = ["title"];
	_hoisted_10$4 = { class: "fm-breadcrumbs" };
	_hoisted_11$4 = ["onClick"];
	_hoisted_12$4 = { class: "fm-table" };
	_hoisted_13$4 = { class: "fm-col-check" };
	_hoisted_14$4 = ["checked"];
	_hoisted_15$4 = { class: "fm-col-size" };
	_hoisted_16$4 = { class: "fm-col-time" };
	_hoisted_17$3 = { class: "fm-col-perm" };
	_hoisted_18$3 = { class: "fm-col-actions" };
	_hoisted_19$3 = ["onClick", "onDblclick"];
	_hoisted_20$3 = { class: "fm-col-check" };
	_hoisted_21$3 = ["checked", "onClick"];
	_hoisted_22$3 = { class: "fm-col-name" };
	_hoisted_23$3 = { class: "fm-file-icon" };
	_hoisted_24$3 = { class: "fm-file-name" };
	_hoisted_25$3 = { class: "fm-col-size" };
	_hoisted_26$2 = { class: "fm-col-time" };
	_hoisted_27$2 = { class: "fm-col-perm" };
	_hoisted_28$2 = { class: "fm-col-actions" };
	_hoisted_29$2 = ["onClick"];
	_hoisted_30$2 = ["onClick"];
	_hoisted_31$2 = ["onClick"];
	_hoisted_32$1 = { key: 0 };
	_hoisted_33$1 = {
		colspan: "6",
		class: "fm-empty"
	};
	_hoisted_34$1 = {
		key: 0,
		class: "fm-loading"
	};
	_hoisted_35$1 = {
		key: 1,
		class: "fm-loading"
	};
	_hoisted_36$1 = {
		key: 2,
		class: "fm-loading"
	};
	_hoisted_37$1 = { class: "fm-prompt" };
	_hoisted_38$1 = { class: "fm-prompt-title" };
	_hoisted_39$1 = { class: "fm-prompt-actions" };
	file_manager_vue_vue_type_script_setup_true_lang_default = /*@__PURE__*/ defineComponent({
		__name: "file-manager",
		props: {
			sessionId: {},
			initialPath: {}
		},
		emits: ["close"],
		setup(__props, { emit: __emit }) {
			const props = __props;
			const emit = __emit;
			const { t } = useI18n();
			const currentPath = ref("");
			const items = ref([]);
			const loading = ref(false);
			const uploading = ref(false);
			const uploadProgress = ref({
				current: 0,
				total: 0
			});
			const downloading = ref(false);
			const selectedItems = ref([]);
			const fileInput = ref(null);
			const promptState = ref(null);
			const promptInput = ref(null);
			let loadSeq = 0;
			const canGoUp = computed(() => currentPath.value !== "/" && currentPath.value !== "");
			const breadcrumbSegments = computed(() => {
				const p = currentPath.value.replace(/\/$/, "");
				if (!p) return [];
				return p.split("/").filter(Boolean).map((name) => ({ name }));
			});
			const allSelected = computed(() => items.value.length > 0 && selectedItems.value.length === items.value.length);
			function pathOf(index) {
				const parts = currentPath.value.replace(/\/$/, "").split("/").filter(Boolean);
				if (index <= 0) return "/";
				return "/" + parts.slice(0, index).join("/");
			}
			function navigateTo(index) {
				currentPath.value = pathOf(index);
				load();
			}
			function goUp() {
				if (!canGoUp.value) return;
				const p = currentPath.value.replace(/\/$/, "");
				const idx = p.lastIndexOf("/");
				currentPath.value = idx <= 0 ? "/" : p.substring(0, idx);
				load();
			}
			async function load(path) {
				if (!props.sessionId) {
					toast.error(t("fileManager.noSession"));
					return;
				}
				const target = path ?? currentPath.value;
				const seq = ++loadSeq;
				loading.value = true;
				try {
					const list = await listDirectory(props.sessionId, target);
					if (seq !== loadSeq) return;
					items.value = list;
					selectedItems.value = [];
				} catch (e) {
					if (seq !== loadSeq) return;
					items.value = [];
					toast.error(t("fileManager.loadFailed", { msg: e?.message || String(e) }));
				} finally {
					if (seq === loadSeq) loading.value = false;
				}
			}
			function isSelected(item) {
				return selectedItems.value.some((i) => i.path === item.path);
			}
			function toggleSelect(item) {
				const idx = selectedItems.value.findIndex((i) => i.path === item.path);
				if (idx >= 0) selectedItems.value.splice(idx, 1);
				else selectedItems.value.push(item);
			}
			function toggleAll() {
				if (allSelected.value) selectedItems.value = [];
				else selectedItems.value = [...items.value];
			}
			function openItem(item) {
				if (item.isDirectory) {
					currentPath.value = item.path;
					load();
				} else downloadItem(item);
			}
			function refresh() {
				load();
			}
			function onUploadClick() {
				fileInput.value?.click();
			}
			async function uploadFiles(files) {
				if (!props.sessionId) return;
				const list = Array.from(files);
				if (!list.length) return;
				uploading.value = true;
				uploadProgress.value = {
					current: 0,
					total: list.length
				};
				let ok = 0;
				for (const file of list) {
					const remotePath = currentPath.value.replace(/\/$/, "") + "/" + file.name;
					try {
						await uploadFile(props.sessionId, remotePath, file);
						ok++;
					} catch (e) {
						toast.error(t("fileManager.uploadFailed", { msg: e?.message || String(e) }));
					}
					uploadProgress.value.current++;
				}
				uploading.value = false;
				if (ok > 0) {
					toast.success(t("fileManager.uploadSuccess", { count: ok }));
					await load();
				}
			}
			function onFileSelected(e) {
				const input = e.target;
				if (input.files) uploadFiles(input.files);
				input.value = "";
			}
			function onDrop(e) {
				if (e.dataTransfer?.files?.length) uploadFiles(e.dataTransfer.files);
			}
			async function downloadItem(item) {
				downloading.value = true;
				try {
					await downloadFile(props.sessionId, item.path, item.name);
				} catch (e) {
					toast.error(e?.message || String(e));
				} finally {
					downloading.value = false;
				}
			}
			function requestNewFolder() {
				promptState.value = {
					mode: "mkdir",
					value: ""
				};
				nextTick(() => promptInput.value?.focus());
			}
			function requestRename(item) {
				promptState.value = {
					mode: "rename",
					value: item.name,
					target: item
				};
				nextTick(() => promptInput.value?.focus());
			}
			async function confirmPrompt() {
				const ps = promptState.value;
				if (!ps) return;
				const name = ps.value.trim();
				if (!name) {
					promptState.value = null;
					return;
				}
				if (name.includes("/")) {
					toast.error(t("fileManager.invalidName"));
					return;
				}
				try {
					if (ps.mode === "mkdir") {
						const remotePath = currentPath.value.replace(/\/$/, "") + "/" + name;
						await makeDirectory(props.sessionId, remotePath);
						toast.success(t("fileManager.created"));
					} else if (ps.target) {
						const parent = ps.target.path.replace(/\/$/, "");
						const idx = parent.lastIndexOf("/");
						const newPath = (idx <= 0 ? "" : parent.substring(0, idx)) + "/" + name;
						await renamePath(props.sessionId, ps.target.path, newPath);
						toast.success(t("fileManager.renamed"));
					}
					promptState.value = null;
					await load();
				} catch (e) {
					toast.error(e?.message || String(e));
				}
			}
			async function removeItem(item) {
				if (!await modal.confirm(t("fileManager.confirmDelete", { name: item.name }))) return;
				try {
					await removePath(props.sessionId, item.path);
					toast.success(t("fileManager.deleted"));
					await load();
				} catch (e) {
					toast.error(e?.message || String(e));
				}
			}
			async function removeSelected() {
				if (!selectedItems.value.length) return;
				if (!await modal.confirm(t("fileManager.confirmDeleteMulti", { count: selectedItems.value.length }))) return;
				for (const item of selectedItems.value) try {
					await removePath(props.sessionId, item.path);
				} catch (e) {
					toast.error(e?.message || String(e));
				}
				toast.success(t("fileManager.deleted"));
				await load();
			}
			function close() {
				emit("close");
			}
			function formatSize(bytes) {
				if (bytes < 1024) return `${bytes} B`;
				const units = [
					"KB",
					"MB",
					"GB",
					"TB"
				];
				let size = bytes / 1024;
				let i = 0;
				while (size >= 1024 && i < units.length - 1) {
					size /= 1024;
					i++;
				}
				return `${size.toFixed(1)} ${units[i]}`;
			}
			function formatTime(ms) {
				if (!ms) return "—";
				const d = new Date(ms);
				if (isNaN(d.getTime())) return "—";
				return d.toLocaleString();
			}
			function iconFor(item) {
				if (item.isDirectory) return "📁";
				if (item.isSymbolicLink) return "🔗";
				return "📄";
			}
			function onKey(e) {
				if (e.key === "Escape") {
					if (promptState.value) promptState.value = null;
					else close();
				}
			}
			onMounted(async () => {
				window.addEventListener("keydown", onKey);
				selectedItems.value = [];
				if (props.initialPath) {
					currentPath.value = props.initialPath;
					await load();
				} else {
					try {
						const dir = await getDefaultDir(props.sessionId);
						currentPath.value = dir || "/";
					} catch {
						currentPath.value = "/";
					}
					await load();
				}
			});
			onBeforeUnmount(() => {
				window.removeEventListener("keydown", onKey);
			});
			return (_ctx, _cache) => {
				return openBlock(), createElementBlock("div", _hoisted_1$5, [
					createBaseVNode("div", _hoisted_2$5, [createBaseVNode("div", _hoisted_3$4, [_cache[7] || (_cache[7] = createBaseVNode("span", { class: "fm-icon" }, "🗂", -1)), createTextVNode(" " + toDisplayString(unref(t)("fileManager.title")), 1)]), createBaseVNode("div", _hoisted_4$4, [createBaseVNode("button", {
						class: "fm-btn fm-close",
						title: unref(t)("common.close"),
						onClick: _cache[0] || (_cache[0] = ($event) => emit("close"))
					}, "✕", 8, _hoisted_5$4)])]),
					createBaseVNode("div", _hoisted_6$4, [
						createBaseVNode("button", {
							class: "fm-btn",
							disabled: !canGoUp.value,
							onClick: goUp
						}, "⬆ " + toDisplayString(unref(t)("fileManager.up")), 9, _hoisted_7$4),
						createBaseVNode("button", {
							class: "fm-btn",
							onClick: refresh
						}, "⟳ " + toDisplayString(unref(t)("fileManager.refresh")), 1),
						createBaseVNode("button", {
							class: "fm-btn",
							onClick: requestNewFolder
						}, "＋ " + toDisplayString(unref(t)("fileManager.newFolder")), 1),
						createBaseVNode("button", {
							class: "fm-btn",
							onClick: onUploadClick
						}, "⬆ " + toDisplayString(unref(t)("fileManager.upload")), 1),
						createBaseVNode("button", {
							class: "fm-btn fm-danger",
							disabled: !selectedItems.value.length,
							onClick: removeSelected
						}, " 🗑 " + toDisplayString(unref(t)("fileManager.deleteSelected")) + " (" + toDisplayString(selectedItems.value.length) + ") ", 9, _hoisted_8$4),
						createBaseVNode("span", {
							class: "fm-cwd",
							title: currentPath.value
						}, toDisplayString(currentPath.value), 9, _hoisted_9$4)
					]),
					createBaseVNode("div", _hoisted_10$4, [createBaseVNode("span", {
						class: "fm-crumb",
						onClick: _cache[1] || (_cache[1] = ($event) => navigateTo(0))
					}, "/"), (openBlock(true), createElementBlock(Fragment, null, renderList(breadcrumbSegments.value, (seg, i) => {
						return openBlock(), createElementBlock(Fragment, { key: i }, [_cache[8] || (_cache[8] = createBaseVNode("span", { class: "fm-sep" }, "/", -1)), createBaseVNode("span", {
							class: "fm-crumb",
							onClick: ($event) => navigateTo(i + 1)
						}, toDisplayString(seg.name), 9, _hoisted_11$4)], 64);
					}), 128))]),
					createBaseVNode("div", {
						class: "fm-list",
						onDragover: _cache[2] || (_cache[2] = withModifiers(() => {}, ["prevent"])),
						onDrop: withModifiers(onDrop, ["prevent"])
					}, [
						createBaseVNode("table", _hoisted_12$4, [createBaseVNode("thead", null, [createBaseVNode("tr", null, [
							createBaseVNode("th", _hoisted_13$4, [createBaseVNode("input", {
								type: "checkbox",
								checked: allSelected.value,
								onChange: toggleAll
							}, null, 40, _hoisted_14$4)]),
							createBaseVNode("th", null, toDisplayString(unref(t)("fileManager.name")), 1),
							createBaseVNode("th", _hoisted_15$4, toDisplayString(unref(t)("fileManager.size")), 1),
							createBaseVNode("th", _hoisted_16$4, toDisplayString(unref(t)("fileManager.modified")), 1),
							createBaseVNode("th", _hoisted_17$3, toDisplayString(unref(t)("fileManager.permissions")), 1),
							createBaseVNode("th", _hoisted_18$3, toDisplayString(unref(t)("fileManager.actions")), 1)
						])]), createBaseVNode("tbody", null, [(openBlock(true), createElementBlock(Fragment, null, renderList(items.value, (item) => {
							return openBlock(), createElementBlock("tr", {
								key: item.path,
								class: normalizeClass({ "fm-selected": isSelected(item) }),
								onClick: ($event) => toggleSelect(item),
								onDblclick: withModifiers(($event) => openItem(item), ["stop"])
							}, [
								createBaseVNode("td", _hoisted_20$3, [createBaseVNode("input", {
									type: "checkbox",
									checked: isSelected(item),
									onClick: withModifiers(($event) => toggleSelect(item), ["stop"])
								}, null, 8, _hoisted_21$3)]),
								createBaseVNode("td", _hoisted_22$3, [createBaseVNode("span", _hoisted_23$3, toDisplayString(iconFor(item)), 1), createBaseVNode("span", _hoisted_24$3, toDisplayString(item.name), 1)]),
								createBaseVNode("td", _hoisted_25$3, toDisplayString(item.isDirectory ? "—" : formatSize(item.size)), 1),
								createBaseVNode("td", _hoisted_26$2, toDisplayString(formatTime(item.mtime)), 1),
								createBaseVNode("td", _hoisted_27$2, toDisplayString(item.permissions), 1),
								createBaseVNode("td", _hoisted_28$2, [
									!item.isDirectory ? (openBlock(), createElementBlock("button", {
										key: 0,
										class: "fm-link",
										onClick: withModifiers(($event) => downloadItem(item), ["stop"])
									}, toDisplayString(unref(t)("fileManager.download")), 9, _hoisted_29$2)) : createCommentVNode("", true),
									createBaseVNode("button", {
										class: "fm-link",
										onClick: withModifiers(($event) => requestRename(item), ["stop"])
									}, toDisplayString(unref(t)("fileManager.rename")), 9, _hoisted_30$2),
									createBaseVNode("button", {
										class: "fm-link fm-link-danger",
										onClick: withModifiers(($event) => removeItem(item), ["stop"])
									}, toDisplayString(unref(t)("fileManager.delete")), 9, _hoisted_31$2)
								])
							], 42, _hoisted_19$3);
						}), 128)), !loading.value && !items.value.length ? (openBlock(), createElementBlock("tr", _hoisted_32$1, [createBaseVNode("td", _hoisted_33$1, toDisplayString(unref(t)("fileManager.empty")), 1)])) : createCommentVNode("", true)])]),
						loading.value ? (openBlock(), createElementBlock("div", _hoisted_34$1, toDisplayString(unref(t)("fileManager.loading")), 1)) : createCommentVNode("", true),
						uploading.value ? (openBlock(), createElementBlock("div", _hoisted_35$1, toDisplayString(unref(t)("fileManager.uploading", {
							current: uploadProgress.value.current,
							total: uploadProgress.value.total
						})), 1)) : createCommentVNode("", true),
						downloading.value ? (openBlock(), createElementBlock("div", _hoisted_36$1, toDisplayString(unref(t)("fileManager.downloading")), 1)) : createCommentVNode("", true)
					], 32),
					createBaseVNode("input", {
						ref_key: "fileInput",
						ref: fileInput,
						type: "file",
						multiple: "",
						hidden: "",
						onChange: onFileSelected
					}, null, 544),
					promptState.value ? (openBlock(), createElementBlock("div", {
						key: 0,
						class: "fm-prompt-mask",
						onClick: _cache[6] || (_cache[6] = withModifiers(($event) => promptState.value = null, ["self"]))
					}, [createBaseVNode("div", _hoisted_37$1, [
						createBaseVNode("div", _hoisted_38$1, toDisplayString(promptState.value.mode === "mkdir" ? unref(t)("fileManager.newFolderPrompt") : unref(t)("fileManager.renamePrompt")), 1),
						withDirectives(createBaseVNode("input", {
							ref_key: "promptInput",
							ref: promptInput,
							"onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => promptState.value.value = $event),
							class: "fm-prompt-input",
							onKeyup: [withKeys(confirmPrompt, ["enter"]), _cache[4] || (_cache[4] = withKeys(($event) => promptState.value = null, ["esc"]))]
						}, null, 544), [[vModelText, promptState.value.value]]),
						createBaseVNode("div", _hoisted_39$1, [createBaseVNode("button", {
							class: "fm-btn",
							onClick: confirmPrompt
						}, toDisplayString(unref(t)("common.confirm")), 1), createBaseVNode("button", {
							class: "fm-btn",
							onClick: _cache[5] || (_cache[5] = ($event) => promptState.value = null)
						}, toDisplayString(unref(t)("common.cancel")), 1)])
					])])) : createCommentVNode("", true)
				]);
			};
		}
	});
}));
//#endregion
//#region src/components/file-manager.vue?vue&type=style&index=0&scoped=aa64e51d&lang.css
var init_file_manager_vue_vue_type_style_index_0_scoped_aa64e51d_lang = __esmMin((() => {}));
//#endregion
//#region src/components/file-manager.vue
var file_manager_default;
var init_file_manager = __esmMin((() => {
	init_file_manager_vue_vue_type_script_setup_true_lang();
	init_file_manager_vue_vue_type_script_setup_true_lang();
	init_file_manager_vue_vue_type_style_index_0_scoped_aa64e51d_lang();
	init__plugin_vue_export_helper();
	file_manager_default = /*#__PURE__*/ _plugin_vue_export_helper_default(file_manager_vue_vue_type_script_setup_true_lang_default, [["__scopeId", "data-v-aa64e51d"]]);
}));
//#endregion
//#region src/components/terminal-tab.vue?vue&type=script&setup=true&lang.ts
var import_xterm, import_addon_fit, import_addon_web_links, _hoisted_1$4, _hoisted_2$4, FM_MIN_WIDTH, FM_MAX_WIDTH_RATIO, MAX_RECONNECT_ATTEMPTS, RECONNECT_BASE_DELAY, AI_CHAT_MIN_WIDTH, AI_CHAT_MAX_WIDTH_RATIO, terminal_tab_vue_vue_type_script_setup_true_lang_default;
var init_terminal_tab_vue_vue_type_script_setup_true_lang = __esmMin((() => {
	init_vue_runtime_esm_bundler();
	init_vue_i18n();
	import_xterm = require_xterm();
	import_addon_fit = require_addon_fit();
	import_addon_web_links = require_addon_web_links();
	init_xterm();
	init_zmodem();
	init_ai_chat();
	init_file_transfer();
	init_file_manager();
	_hoisted_1$4 = ["title"];
	_hoisted_2$4 = ["title"];
	FM_MIN_WIDTH = 280;
	FM_MAX_WIDTH_RATIO = .5;
	MAX_RECONNECT_ATTEMPTS = 5;
	RECONNECT_BASE_DELAY = 2e3;
	AI_CHAT_MIN_WIDTH = 280;
	AI_CHAT_MAX_WIDTH_RATIO = .6;
	terminal_tab_vue_vue_type_script_setup_true_lang_default = /*@__PURE__*/ defineComponent({
		__name: "terminal-tab",
		props: {
			tabId: {},
			connection: {},
			active: { type: Boolean }
		},
		emits: [
			"status-change",
			"zmodem-detected",
			"open-ai-settings"
		],
		setup(__props, { expose: __expose, emit: __emit }) {
			const { t } = useI18n();
			const props = __props;
			const emit = __emit;
			const terminalWrapper = ref();
			const terminalContainer = ref();
			const fileTransferRef = ref();
			const status = ref("connecting");
			const errorMessage = ref("");
			const showAIChat = ref(false);
			const aiChatRef = ref();
			const showFileManager = ref(false);
			const fmWidth = ref(360);
			function startFmResize(e) {
				e.preventDefault();
				const startX = e.clientX;
				const startWidth = fmWidth.value;
				const maxWidth = (terminalWrapper.value?.clientWidth || 800) * FM_MAX_WIDTH_RATIO;
				const onMouseMove = (ev) => {
					const delta = ev.clientX - startX;
					const newWidth = Math.min(Math.max(startWidth + delta, FM_MIN_WIDTH), maxWidth);
					fmWidth.value = newWidth;
				};
				const onMouseUp = () => {
					document.removeEventListener("mousemove", onMouseMove);
					document.removeEventListener("mouseup", onMouseUp);
					document.body.style.cursor = "";
					document.body.style.userSelect = "";
				};
				document.addEventListener("mousemove", onMouseMove);
				document.addEventListener("mouseup", onMouseUp);
				document.body.style.cursor = "col-resize";
				document.body.style.userSelect = "none";
			}
			/** 显示文件传输浮动面板 */
			function showFileTransfer(info) {
				const termRef = {
					sessionId,
					sendToServer,
					getCurrentCwd: inferCurrentCwdFromTerminal
				};
				fileTransferRef.value?.show(props.tabId, termRef, info);
			}
			function inferCurrentCwdFromTerminal() {
				if (!terminal) return "";
				const buffer = terminal.buffer.active;
				const lines = [];
				const start = Math.max(0, buffer.baseY + buffer.cursorY - 80);
				const end = buffer.baseY + buffer.cursorY;
				for (let i = start; i <= end; i++) {
					const line = buffer.getLine(i)?.translateToString(true).trim();
					if (line) lines.push(line);
				}
				for (let i = lines.length - 1; i >= 0; i--) {
					const line = lines[i];
					const userHostPath = line.match(/(?:^|\s)[^\s@]+@[^\s:]+:(\/[^\s#$]+)\s*[#$]\s*$/);
					if (userHostPath?.[1]) return userHostPath[1];
					const plainPath = line.match(/(?:^|\s)(\/[^\s#$]+)\s*[#$]\s*$/);
					if (plainPath?.[1]) return plainPath[1];
				}
				return "";
			}
			let terminal = null;
			let fitAddon = null;
			let ws = null;
			let ipcCleanup = null;
			let sessionId = null;
			const pendingSessionId = `ssh-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
			let resizeObserver = null;
			let sentry = null;
			let zmodemSession = null;
			let zmodemRole = null;
			let fileUploadResultCallback = null;
			function initTerminal() {
				if (!terminalContainer.value) return;
				terminal = new import_xterm.Terminal({
					cols: props.connection.terminal?.cols || 80,
					rows: props.connection.terminal?.rows || 24,
					fontSize: props.connection.terminal?.fontSize || 14,
					fontFamily: props.connection.terminal?.fontFamily || "\"JetBrains Mono\", \"Fira Code\", Menlo, Monaco, \"Courier New\", monospace",
					theme: props.connection.terminal?.theme === "light" ? {
						background: "#eff1f5",
						foreground: "#4c4f69",
						cursor: "#dc8a78",
						cursorAccent: "#eff1f5",
						selectionBackground: "#acb0be40",
						selectionForeground: "#4c4f69",
						black: "#5c5f77",
						red: "#d20f39",
						green: "#40a02b",
						yellow: "#df8e1d",
						blue: "#1e66f5",
						magenta: "#ea76cb",
						cyan: "#179299",
						white: "#acb0be",
						brightBlack: "#6c6f85",
						brightRed: "#d20f39",
						brightGreen: "#40a02b",
						brightYellow: "#df8e1d",
						brightBlue: "#1e66f5",
						brightMagenta: "#ea76cb",
						brightCyan: "#179299",
						brightWhite: "#bcc0cc"
					} : {
						background: "#1e1e2e",
						foreground: "#cdd6f4",
						cursor: "#f5e0dc",
						cursorAccent: "#1e1e2e",
						selectionBackground: "#585b7066",
						selectionForeground: "#cdd6f4",
						black: "#45475a",
						red: "#f38ba8",
						green: "#a6e3a1",
						yellow: "#f9e2af",
						blue: "#89b4fa",
						magenta: "#f5c2e7",
						cyan: "#94e2d5",
						white: "#bac2de",
						brightBlack: "#585b70",
						brightRed: "#f38ba8",
						brightGreen: "#a6e3a1",
						brightYellow: "#f9e2af",
						brightBlue: "#89b4fa",
						brightMagenta: "#f5c2e7",
						brightCyan: "#94e2d5",
						brightWhite: "#a6adc8"
					},
					cursorStyle: props.connection.terminal?.cursorStyle || "block",
					cursorBlink: true,
					cursorInactiveStyle: "outline",
					scrollback: 5e3,
					lineHeight: 1.2,
					letterSpacing: .5,
					wordWrap: true,
					allowProposedApi: true
				});
				fitAddon = new import_addon_fit.FitAddon();
				terminal.loadAddon(fitAddon);
				terminal.loadAddon(new import_addon_web_links.WebLinksAddon());
				terminal.open(terminalContainer.value);
				const termElement = terminalContainer.value?.querySelector(".xterm");
				if (termElement) termElement.addEventListener("contextmenu", showTerminalContextMenu);
				nextTick(() => {
					fitAddon?.fit();
				});
				terminal.onData((data) => {
					sendToServer({
						type: "terminal",
						sessionId: sessionId || pendingSessionId,
						data
					});
				});
				terminal.onBinary((data) => {
					sendToServer({
						type: "terminal",
						sessionId: sessionId || pendingSessionId,
						data
					});
				});
				terminal.onResize(({ cols, rows }) => {
					sendToServer({
						type: "resize",
						sessionId: sessionId || pendingSessionId,
						data: {
							cols,
							rows
						}
					});
				});
				terminal.attachCustomKeyEventHandler((event) => {
					const modKey = window.electronAPI?.platform === "darwin" || navigator.platform.includes("Mac") ? event.metaKey : event.ctrlKey;
					const key = event.key.toLowerCase();
					const isCopyTrigger = modKey && key === "c";
					const isPasteTrigger = modKey && key === "v";
					if (!isCopyTrigger && !isPasteTrigger) return true;
					const clip = window.electronAPI?.clipboard;
					const hasSelection = !!(terminal && terminal.getSelection());
					if (isCopyTrigger) {
						if (hasSelection) {
							const text = terminal.getSelection();
							if (clip) clip.writeText(text);
							else navigator.clipboard?.writeText(text).catch(() => {});
							return false;
						}
						if (event.shiftKey) return false;
						return true;
					}
					if (isPasteTrigger) return false;
					return true;
				});
				initSentry();
			}
			function initSentry() {
				console.log("[ZMODEM] Initializing Sentry...");
				sentry = createSentry({
					toTerminal: (octets) => {
						if (terminal && octets.length > 0) {
							if (octets.length >= 4 && octets.some((_, i) => i + 3 < octets.length && octets[i] === 42 && octets[i + 1] === 42 && octets[i + 2] === 24 && octets[i + 3] === 66)) console.warn("[ZMODEM] !!! Sentry passed ZMODEM bytes to terminal! length:", octets.length, "bytes:", octets.slice(0, 30).join(","));
							terminal.write(new Uint8Array(octets));
						}
					},
					sender: (octets) => {
						const b64 = octetsToBase64(octets);
						if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({
							type: "terminal",
							sessionId: sessionId || pendingSessionId,
							data: b64,
							binary: true
						}));
					},
					onDetect: (detection) => {
						const role = detection.get_session_role();
						console.log("[ZMODEM] >>>> onDetect fired! role:", role, "existingSession:", !!zmodemSession);
						if (zmodemSession) {
							console.warn("[ZMODEM] Ignoring duplicate detection (role:", role, "), session already active");
							try {
								detection.deny();
							} catch (_e) {}
							return;
						}
						console.log("[ZMODEM] Detected:", role, "- auto-confirming immediately");
						try {
							const session = detection.confirm();
							zmodemSession = session;
							zmodemRole = role;
							for (const evt of [
								"offer",
								"data_in",
								"file_end"
							]) if (!session._on_evt || session._on_evt[evt] === void 0) {
								console.log("[ZMODEM] Pre-registering missing event:", evt);
								try {
									session._Add_event(evt);
								} catch (_e) {}
							}
							const _origSessionConsume = session.consume.bind(session);
							const _eventBuffer = [];
							let _handlersReady = false;
							const _origHappen = session._Happen.bind(session);
							session._Happen = function(evt, ...args) {
								if (!_handlersReady) {
									console.log("[ZMODEM] Early event (buffering):", evt);
									_eventBuffer.push({
										evt,
										args
									});
									return;
								}
								return _origHappen(evt, ...args);
							};
							session.consume = function(octets) {
								try {
									return _origSessionConsume(octets);
								} catch (err) {
									console.warn("[ZMODEM] session.consume() error (caught):", err);
								}
							};
							const _origOnSessionEnd = session._on_session_end?.bind(session);
							if (_origOnSessionEnd) session._on_session_end = function() {
								console.log("[ZMODEM] Session ended, cleaning up state");
								zmodemSession = null;
								zmodemRole = null;
								return _origOnSessionEnd();
							};
							const markHandlersReady = () => {
								_handlersReady = true;
								console.log("[ZMODEM] Handlers ready, replaying", _eventBuffer.length, "buffered events");
								for (const item of _eventBuffer) try {
									_origHappen(item.evt, ...item.args);
								} catch (e) {
									console.warn("[ZMODEM] Replay error for", item.evt, ":", e);
								}
								_eventBuffer.length = 0;
							};
							if (role === "send") {
								console.log("[ZMODEM] rz detected (ZRINIT) - browser will send files");
								emit("zmodem-detected", {
									role,
									session,
									markHandlersReady
								});
								showFileTransfer({
									role,
									session,
									markHandlersReady
								});
							} else {
								console.log("[ZMODEM] sz detected (ZRQINIT) - browser will receive files");
								emit("zmodem-detected", {
									role,
									session,
									markHandlersReady
								});
								showFileTransfer({
									role,
									session,
									markHandlersReady
								});
							}
						} catch (err) {
							console.error("[ZMODEM] Auto-confirm error:", err);
							zmodemSession = null;
							zmodemRole = null;
						}
					},
					onRetract: () => {
						console.log("[ZMODEM] Retracted - detection invalidated");
						if (!zmodemSession) zmodemRole = null;
					}
				});
				console.log("[ZMODEM] Sentry initialized:", !!sentry);
			}
			function isElectronIPC() {
				return !!(window.electronAPI?.isElectron && window.electronAPI?.isPackaged);
			}
			/**
			* IPC 适配器 - 在 Electron 中模拟 WebSocket 接口
			* 通过 preload 暴露的 terminalIPC 与主进程通信
			*/
			function createIPCAdapter() {
				const ipc = window.electronAPI.terminalIPC;
				const adapter = {
					readyState: 1,
					send(msg) {
						ipc.send(JSON.parse(msg));
					},
					close() {
						adapter.readyState = 3;
						if (adapter.onclose) adapter.onclose({
							code: 1e3,
							reason: "IPC closed"
						});
					},
					onopen: null,
					onmessage: null,
					onerror: null,
					onclose: null
				};
				const removeListener = ipc.onMessage((msg) => {
					if (adapter.onmessage) adapter.onmessage({ data: JSON.stringify(msg) });
				});
				setTimeout(() => {
					if (adapter.onopen) adapter.onopen({});
				}, 0);
				ipcCleanup = () => {
					removeListener();
					adapter.readyState = 3;
				};
				return adapter;
			}
			function connectWebSocket() {
				if (isElectronIPC()) {
					console.log("[TerminalTab] Using Electron IPC");
					ws = createIPCAdapter();
				} else {
					const protocol = location.protocol === "https:" ? "wss:" : "ws:";
					const token = new URLSearchParams(location.search).get("token");
					const wsUrl = `${protocol}//${location.host}/ws/terminal${token ? `?token=${encodeURIComponent(token)}` : ""}`;
					console.log(`[TerminalTab] Connecting to WebSocket: ${wsUrl}`);
					ws = new WebSocket(wsUrl);
				}
				ws.onopen = () => {
					console.log(`[TerminalTab] WebSocket connected, sending create`);
					sendToServer({
						type: "create",
						sessionId: pendingSessionId,
						data: {
							connectionId: props.connection.id,
							cols: terminal?.cols || 80,
							rows: terminal?.rows || 24,
							name: props.connection.name
						}
					});
				};
				ws.onmessage = (event) => {
					const dataStr = typeof event.data === "string" ? event.data : "[binary]";
					console.log(`[TerminalTab] WS message:`, dataStr.substring(0, 100));
					try {
						handleServerMessage(JSON.parse(event.data));
					} catch (e) {
						console.error("WebSocket message parse error:", e);
					}
				};
				ws.onerror = (err) => {
					console.error("[TerminalTab] WebSocket error:", err);
					setStatus("error", t("tab.wsFailed"));
				};
				ws.onclose = (event) => {
					console.log(`[TerminalTab] WebSocket closed, code: ${event.code}, reason: ${event.reason}`);
					if (status.value !== "disconnected" && status.value !== "reconnecting") setStatus("disconnected");
					scheduleReconnect();
				};
			}
			let reconnectTimer = null;
			let reconnectAttempts = 0;
			function scheduleReconnect() {
				if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
					console.log("[TerminalTab] Max reconnect attempts reached");
					if (terminal) terminal.writeln(`\x1b[31m✗ ${t("tab.maxReconnectReached")}\x1b[0m`);
					return;
				}
				const delay = RECONNECT_BASE_DELAY * Math.pow(1.5, reconnectAttempts);
				console.log(`[TerminalTab] Scheduling reconnect in ${delay}ms (attempt ${reconnectAttempts + 1})`);
				reconnectTimer = setTimeout(() => {
					reconnect();
				}, delay);
			}
			function reconnect() {
				if (reconnectTimer) {
					clearTimeout(reconnectTimer);
					reconnectTimer = null;
				}
				console.log("[TerminalTab] Reconnecting...");
				setStatus("reconnecting");
				reconnectAttempts++;
				if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) connectWebSocket();
				else sendToServer({
					type: "reconnect",
					sessionId: sessionId || pendingSessionId,
					data: {
						connectionId: props.connection.id,
						cols: terminal?.cols || 80,
						rows: terminal?.rows || 24,
						name: props.connection.name
					}
				});
			}
			/** Hex header length (without CR+LF): type(2) + flags(8) + crc(4) = 14 hex chars + 5 prefix = 19, or 18 without CR */
			function detectZmodemFrame(octets) {
				for (let i = 0; i <= octets.length - 20; i++) if (octets[i] === 42 && octets[i + 1] === 42 && octets[i + 2] === 24 && octets[i + 3] === 66 && octets[i + 4] === 48) {
					const searchEnd = Math.min(i + 25, octets.length);
					for (let j = i + 5; j < searchEnd; j++) if (octets[j] === 138 || octets[j] === 10) {
						const hexLen = j - i;
						if (hexLen === 20 && (octets[j - 1] === 13 || octets[j - 1] === 141) || hexLen === 19) {
							const frameLen = j - i + 1;
							const totalLen = j + 1 < octets.length && octets[j + 1] === 17 ? frameLen + 1 : frameLen;
							if (octets[i + 5] === 48) return {
								type: "ZRQINIT",
								offset: i,
								frameLen: totalLen
							};
							if (octets[i + 5] === 49) return {
								type: "ZRINIT",
								offset: i,
								frameLen: totalLen
							};
						}
						break;
					}
				}
				return null;
			}
			/**
			* 手动创建 ZMODEM session 并设置到 sentry
			* 完全绕过 sentry 的检测机制（因为 Vite 缓存导致 _parse_hex patch 不生效）
			*/
			function createManualSession(type, frameOctets) {
				let session;
				let role;
				if (type === "ZRQINIT") {
					session = new import_zmodem_browser.Session.Receive();
					role = "receive";
				} else {
					session = new import_zmodem_browser.Session.Send(import_zmodem_browser.Header.build("ZRINIT", [
						"CANFDX",
						"CANOVIO",
						"CANFC32"
					]));
					role = "send";
				}
				zmodemSession = session;
				zmodemRole = role;
				console.log("[ZMODEM] Manual session created:", role, "(" + type + ")");
				sentry._cache = [];
				sentry._parsed_session = null;
				sentry._zsession = session;
				session.on("garbage", (garbage) => {
					if (terminal && garbage.length > 0) terminal.write(new Uint8Array(garbage));
				});
				session.on("session_end", () => {
					console.log("[ZMODEM] Session ended (via event), cleaning up");
					sentry._zsession = null;
					zmodemSession = null;
					zmodemRole = null;
				});
				session.set_sender((octets) => {
					const b64 = octetsToBase64(octets);
					if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({
						type: "terminal",
						sessionId: sessionId || pendingSessionId,
						data: b64,
						binary: true
					}));
				});
				for (const evt of [
					"offer",
					"data_in",
					"file_end"
				]) if (!session._on_evt || session._on_evt[evt] === void 0) try {
					session._Add_event(evt);
				} catch (_e) {}
				const _eventBuffer = [];
				let _handlersReady = false;
				const _origHappen = session._Happen.bind(session);
				session._Happen = function(evt, ...args) {
					if (!_handlersReady) {
						_eventBuffer.push({
							evt,
							args
						});
						return;
					}
					return _origHappen(evt, ...args);
				};
				const _origSessionConsume = session.consume.bind(session);
				session.consume = function(octets) {
					try {
						return _origSessionConsume(octets);
					} catch (err) {
						console.warn("[ZMODEM] session.consume() error (caught):", err);
						throw err;
					}
				};
				const _origOnSessionEnd = session._on_session_end?.bind(session);
				if (_origOnSessionEnd) session._on_session_end = function() {
					console.log("[ZMODEM] _on_session_end called, cleaning up");
					zmodemSession = null;
					zmodemRole = null;
					return _origOnSessionEnd();
				};
				const markHandlersReady = () => {
					_handlersReady = true;
					console.log("[ZMODEM] Handlers ready, replaying", _eventBuffer.length, "buffered events");
					for (const item of _eventBuffer) try {
						_origHappen(item.evt, ...item.args);
					} catch (e) {}
					_eventBuffer.length = 0;
				};
				emit("zmodem-detected", {
					role,
					session,
					markHandlersReady
				});
				showFileTransfer({
					role,
					session,
					markHandlersReady
				});
			}
			function handleServerMessage(msg) {
				const myId = sessionId || pendingSessionId;
				if (msg.sessionId && myId && msg.sessionId !== myId) return;
				switch (msg.type) {
					case "terminal":
						if (msg.data && sentry) {
							let octets;
							if (msg.binary) octets = base64ToOctets(msg.data);
							else octets = stringToOctets(msg.data);
							try {
								if (zmodemSession) try {
									if (zmodemSession.has_ended?.()) {
										console.log("[ZMODEM] Session already ended, cleaning up and passing data to terminal");
										zmodemSession = null;
										zmodemRole = null;
										sentry._zsession = null;
										sentry._cache = [];
										if (terminal && octets.length > 0) terminal.write(new Uint8Array(octets));
										return;
									}
								} catch (e) {}
								if (!zmodemSession) {
									const frameInfo = detectZmodemFrame(octets);
									if (frameInfo) {
										console.log("[ZMODEM] Manual detection:", frameInfo.type, "at offset", frameInfo.offset, "frameLen:", frameInfo.frameLen);
										if (frameInfo.offset > 0) {
											const textPart = octets.slice(0, frameInfo.offset);
											console.log("[ZMODEM] Writing prefix text to terminal:", textPart.length, "bytes");
											if (terminal) terminal.write(new Uint8Array(textPart));
										}
										const frameData = octets.slice(frameInfo.offset, frameInfo.offset + frameInfo.frameLen);
										createManualSession(frameInfo.type, frameData);
										const trailing = octets.slice(frameInfo.offset + frameInfo.frameLen);
										if (trailing.length > 0) {
											console.log("[ZMODEM] Passing trailing bytes to sentry:", trailing.length);
											sentry.consume(trailing);
										}
										return;
									}
								}
								sentry.consume(octets);
							} catch (err) {
								console.warn("[ZMODEM] handleServerMessage error, force cleanup:", err?.message || err);
								zmodemSession = null;
								zmodemRole = null;
								try {
									sentry._zsession = null;
									sentry._cache = [];
									sentry._parsed_session = null;
								} catch (_) {}
								if (terminal && octets.length > 0) terminal.write(new Uint8Array(octets));
							}
						}
						break;
					case "status":
						if (msg.sessionId) sessionId = msg.sessionId;
						if (msg.data === "connected") {
							reconnectAttempts = 0;
							setStatus("connected", msg.sessionId);
						}
						break;
					case "close":
						setStatus("disconnected");
						break;
					case "error":
						setStatus("error", msg.data || "连接失败");
						break;
					case "conn-log":
						if (terminal && msg.data) terminal.writeln(`\r\n\x1b[36m[SSH] ${msg.data}\x1b[0m`);
						break;
					case "ai-agent-event":
						if (aiChatRef.value && msg.event) aiChatRef.value.handleAgentEvent(msg.event);
						break;
					case "monitor-event":
						if (aiChatRef.value && msg.event) aiChatRef.value.handleMonitorEvent(msg.event);
						break;
					case "file-upload-result": if (fileUploadResultCallback) fileUploadResultCallback(msg);
				}
			}
			function sendToServer(msg) {
				if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
			}
			function writeStatusToTerminal(s, detail) {
				if (!terminal) return;
				const host = props.connection.host || "";
				switch (s) {
					case "connecting":
						terminal.writeln(`\r\n\x1b[33m⚡ ${t("tab.connectingTo", { host })}\x1b[0m`);
						break;
					case "connected": break;
					case "error":
						terminal.writeln(`\x1b[31m✗ ${t("tab.connectionFailed")}: ${detail || errorMessage.value}\x1b[0m`);
						break;
					case "disconnected":
						terminal.writeln(`\x1b[90m⚠ ${t("tab.disconnected")}\x1b[0m`);
						break;
					case "reconnecting": terminal.writeln(`\x1b[33m⟳ ${t("tab.reconnecting")} (${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})\x1b[0m`);
				}
			}
			function setStatus(s, detail) {
				status.value = s;
				if (s === "error" && detail) errorMessage.value = detail;
				writeStatusToTerminal(s, detail);
				emit("status-change", s, sessionId || void 0);
			}
			function focus() {
				terminal?.focus();
			}
			function fit() {
				nextTick(() => {
					fitAddon?.fit();
				});
			}
			function writeToTerminal(data) {
				terminal?.write(data);
			}
			function getTerminal() {
				return terminal;
			}
			function getZmodemSession() {
				return zmodemSession;
			}
			function getZmodemRole() {
				return zmodemRole;
			}
			function getSentry() {
				return sentry;
			}
			watch(() => props.active, (val) => {
				if (val) nextTick(() => {
					fit();
					focus();
				});
			});
			onMounted(() => {
				initTerminal();
				writeStatusToTerminal("connecting");
				document.addEventListener("click", onDocumentClick);
				if (terminalContainer.value) {
					resizeObserver = new ResizeObserver(() => {
						if (props.active) fit();
					});
					resizeObserver.observe(terminalContainer.value);
				}
				connectWebSocket();
			});
			onBeforeUnmount(() => {
				if (reconnectTimer) clearTimeout(reconnectTimer);
				resizeObserver?.disconnect();
				document.removeEventListener("click", onDocumentClick);
				ws?.close();
				ipcCleanup?.();
				terminal?.dispose();
			});
			__expose({
				focus,
				fit,
				writeToTerminal,
				getTerminal,
				getZmodemSession,
				getZmodemRole,
				getSentry,
				sendToServer,
				setFileUploadCallback: (cb) => {
					fileUploadResultCallback = cb;
				},
				_getWsState: () => ws ? ws.readyState === WebSocket.OPEN ? "open" : ws.readyState === WebSocket.CONNECTING ? "connecting" : ws.readyState === WebSocket.CLOSING ? "closing" : "closed" : "null",
				_getWsBufferedAmount: () => ws ? ws.bufferedAmount ?? 0 : 0,
				get sessionId() {
					return sessionId;
				}
			});
			const aiChatWrapperRef = ref();
			const aiChatWidth = ref(380);
			function startResize(e) {
				e.preventDefault();
				const startX = e.clientX;
				const startWidth = aiChatWidth.value;
				const maxWidth = (terminalWrapper.value?.clientWidth || 800) * AI_CHAT_MAX_WIDTH_RATIO;
				const onMouseMove = (ev) => {
					const delta = startX - ev.clientX;
					const newWidth = Math.min(Math.max(startWidth + delta, AI_CHAT_MIN_WIDTH), maxWidth);
					aiChatWidth.value = newWidth;
				};
				const onMouseUp = () => {
					document.removeEventListener("mousemove", onMouseMove);
					document.removeEventListener("mouseup", onMouseUp);
					document.body.style.cursor = "";
					document.body.style.userSelect = "";
				};
				document.addEventListener("mousemove", onMouseMove);
				document.addEventListener("mouseup", onMouseUp);
				document.body.style.cursor = "col-resize";
				document.body.style.userSelect = "none";
			}
			function toggleAIChat() {
				showAIChat.value = !showAIChat.value;
			}
			function getTerminalContext() {
				if (!terminal) return "";
				const buffer = terminal.buffer.active;
				const lines = [];
				for (let i = Math.max(0, buffer.cursorY - 50); i <= buffer.cursorY; i++) {
					const line = buffer.getLine(i);
					if (line) lines.push(line.translateToString(true));
				}
				return lines.join("\n");
			}
			function handleAISend(msg) {
				sendToServer(msg);
			}
			const contextMenuVisible = ref(false);
			const contextMenuX = ref(0);
			const contextMenuY = ref(0);
			function showTerminalContextMenu(event) {
				event.preventDefault();
				event.stopPropagation();
				contextMenuX.value = event.clientX;
				contextMenuY.value = event.clientY;
				contextMenuVisible.value = true;
			}
			function hideTerminalContextMenu() {
				contextMenuVisible.value = false;
			}
			function handleContextCopy() {
				hideTerminalContextMenu();
				if (!terminal) return;
				const selection = terminal.getSelection();
				if (selection) {
					const clip = window.electronAPI?.clipboard;
					if (clip) clip.writeText(selection);
					else navigator.clipboard?.writeText(selection).catch(() => {});
				}
			}
			async function handleContextPaste() {
				hideTerminalContextMenu();
				if (!terminal) return;
				const clip = window.electronAPI?.clipboard;
				let text = "";
				if (clip) {
					text = clip.readText();
					if (!text && clip.readTextAsync) text = await clip.readTextAsync();
				} else try {
					text = await navigator.clipboard.readText();
				} catch {}
				if (text) sendToServer({
					type: "terminal",
					sessionId: sessionId || pendingSessionId,
					data: text
				});
			}
			function onDocumentClick() {
				if (contextMenuVisible.value) hideTerminalContextMenu();
			}
			return (_ctx, _cache) => {
				return openBlock(), createElementBlock("div", {
					class: "terminal-wrapper",
					ref_key: "terminalWrapper",
					ref: terminalWrapper
				}, [
					showFileManager.value && status.value === "connected" ? (openBlock(), createElementBlock("div", {
						key: 0,
						class: "file-manager-wrapper",
						style: normalizeStyle({ width: fmWidth.value + "px" })
					}, [createBaseVNode("div", {
						class: "fm-resize-handle",
						onMousedown: startFmResize
					}, null, 32), createVNode(file_manager_default, {
						sessionId: unref(sessionId) || __props.tabId,
						onClose: _cache[0] || (_cache[0] = ($event) => showFileManager.value = false)
					}, null, 8, ["sessionId"])], 4)) : createCommentVNode("", true),
					createBaseVNode("div", {
						class: "terminal-container",
						ref_key: "terminalContainer",
						ref: terminalContainer
					}, null, 512),
					createVNode(file_transfer_default, {
						ref_key: "fileTransferRef",
						ref: fileTransferRef
					}, null, 512),
					status.value === "connected" ? (openBlock(), createElementBlock("button", {
						key: 1,
						class: normalizeClass(["ai-toggle-btn", { active: showAIChat.value }]),
						style: normalizeStyle(showAIChat.value ? { right: aiChatWidth.value + 12 + "px" } : {}),
						onClick: toggleAIChat,
						title: unref(t)("ai.chat")
					}, [..._cache[5] || (_cache[5] = [createBaseVNode("i", { class: "bi bi-robot" }, null, -1)])], 14, _hoisted_1$4)) : createCommentVNode("", true),
					status.value === "connected" ? (openBlock(), createElementBlock("button", {
						key: 2,
						class: normalizeClass(["ai-toggle-btn", { active: showFileManager.value }]),
						style: normalizeStyle(showAIChat.value ? { right: aiChatWidth.value + 52 + "px" } : { right: "52px" }),
						onClick: _cache[1] || (_cache[1] = ($event) => showFileManager.value = !showFileManager.value),
						title: unref(t)("fileManager.title")
					}, [..._cache[6] || (_cache[6] = [createBaseVNode("i", { class: "bi bi-folder2-open" }, null, -1)])], 14, _hoisted_2$4)) : createCommentVNode("", true),
					withDirectives(createBaseVNode("div", {
						class: "ai-chat-wrapper",
						style: normalizeStyle({ width: aiChatWidth.value + "px" }),
						ref_key: "aiChatWrapperRef",
						ref: aiChatWrapperRef
					}, [createBaseVNode("div", {
						class: "ai-resize-handle",
						onMousedown: startResize
					}, null, 32), createVNode(ai_chat_default, {
						ref_key: "aiChatRef",
						ref: aiChatRef,
						sessionId: unref(sessionId) || __props.tabId,
						sessionName: props.connection.name,
						connectionId: props.connection.id,
						isOpen: showAIChat.value,
						getTerminalContext,
						onClose: _cache[2] || (_cache[2] = ($event) => showAIChat.value = false),
						onWsSend: handleAISend,
						onOpenSettings: _cache[3] || (_cache[3] = ($event) => _ctx.$emit("open-ai-settings"))
					}, null, 8, [
						"sessionId",
						"sessionName",
						"connectionId",
						"isOpen"
					])], 4), [[vShow, showAIChat.value]]),
					contextMenuVisible.value ? (openBlock(), createElementBlock("div", {
						key: 3,
						class: "terminal-context-menu",
						style: normalizeStyle({
							left: contextMenuX.value + "px",
							top: contextMenuY.value + "px"
						}),
						onClick: _cache[4] || (_cache[4] = withModifiers(() => {}, ["stop"]))
					}, [createBaseVNode("div", {
						class: "context-menu-item",
						onClick: handleContextCopy
					}, [_cache[7] || (_cache[7] = createBaseVNode("i", { class: "bi bi-clipboard" }, null, -1)), createTextVNode(toDisplayString(unref(t)("context.copy") || "Copy"), 1)]), createBaseVNode("div", {
						class: "context-menu-item",
						onClick: handleContextPaste
					}, [_cache[8] || (_cache[8] = createBaseVNode("i", { class: "bi bi-clipboard-check" }, null, -1)), createTextVNode(toDisplayString(unref(t)("context.paste") || "Paste"), 1)])], 4)) : createCommentVNode("", true)
				], 512);
			};
		}
	});
}));
//#endregion
//#region src/components/terminal-tab.vue?vue&type=style&index=0&scoped=619623eb&lang.css
var init_terminal_tab_vue_vue_type_style_index_0_scoped_619623eb_lang = __esmMin((() => {}));
//#endregion
//#region src/components/terminal-tab.vue
var terminal_tab_default;
var init_terminal_tab = __esmMin((() => {
	init_terminal_tab_vue_vue_type_script_setup_true_lang();
	init_terminal_tab_vue_vue_type_script_setup_true_lang();
	init_terminal_tab_vue_vue_type_style_index_0_scoped_619623eb_lang();
	init__plugin_vue_export_helper();
	terminal_tab_default = /*#__PURE__*/ _plugin_vue_export_helper_default(terminal_tab_vue_vue_type_script_setup_true_lang_default, [["__scopeId", "data-v-619623eb"]]);
}));
//#endregion
//#region src/components/connection-editor/index.vue?vue&type=script&setup=true&lang.ts
var _hoisted_1$3, _hoisted_2$3, _hoisted_3$3, _hoisted_4$3, _hoisted_5$3, _hoisted_6$3, _hoisted_7$3, _hoisted_8$3, _hoisted_9$3, _hoisted_10$3, _hoisted_11$3, _hoisted_12$3, _hoisted_13$3, _hoisted_14$3, _hoisted_15$3, _hoisted_16$3, _hoisted_17$2, _hoisted_18$2, _hoisted_19$2, _hoisted_20$2, _hoisted_21$2, _hoisted_22$2, _hoisted_23$2, _hoisted_24$2, _hoisted_25$2, _hoisted_26$1, _hoisted_27$1, _hoisted_28$1, _hoisted_29$1, _hoisted_30$1, _hoisted_31$1, _hoisted_32, _hoisted_33, _hoisted_34, _hoisted_35, _hoisted_36, _hoisted_37, _hoisted_38, _hoisted_39, _hoisted_40, _hoisted_41, _hoisted_42, _hoisted_43, _hoisted_44, _hoisted_45, _hoisted_46, _hoisted_47, _hoisted_48, _hoisted_49, _hoisted_50, _hoisted_51, _hoisted_52, _hoisted_53, _hoisted_54, _hoisted_55, _hoisted_56, _hoisted_57, _hoisted_58, _hoisted_59, _hoisted_60, _hoisted_61, _hoisted_62, _hoisted_63, _hoisted_64, _hoisted_65, _hoisted_66, _hoisted_67, _hoisted_68, _hoisted_69, _hoisted_70, _hoisted_71, _hoisted_72, _hoisted_73, index_vue_vue_type_script_setup_true_lang_default$3;
var init_index_vue_vue_type_script_setup_true_lang$3 = __esmMin((() => {
	init_vue_runtime_esm_bundler();
	init_vue_i18n();
	init_modal$2();
	init_connection();
	init_toast();
	_hoisted_1$3 = { class: "mb-3" };
	_hoisted_2$3 = { class: "form-label fw-bold" };
	_hoisted_3$3 = ["placeholder"];
	_hoisted_4$3 = { class: "row mb-3" };
	_hoisted_5$3 = { class: "col-8" };
	_hoisted_6$3 = { class: "form-label fw-bold" };
	_hoisted_7$3 = ["placeholder", "required"];
	_hoisted_8$3 = { class: "col-4" };
	_hoisted_9$3 = { class: "form-label fw-bold" };
	_hoisted_10$3 = { class: "mb-3" };
	_hoisted_11$3 = { class: "form-label fw-bold" };
	_hoisted_12$3 = ["placeholder", "required"];
	_hoisted_13$3 = { class: "mb-3" };
	_hoisted_14$3 = { class: "form-label fw-bold" };
	_hoisted_15$3 = {
		class: "btn-group w-100",
		role: "group"
	};
	_hoisted_16$3 = {
		class: "btn btn-outline-primary",
		for: "auth-auto"
	};
	_hoisted_17$2 = {
		class: "btn btn-outline-primary",
		for: "auth-password"
	};
	_hoisted_18$2 = {
		class: "btn btn-outline-primary",
		for: "auth-key"
	};
	_hoisted_19$2 = {
		key: 0,
		class: "form-text text-muted"
	};
	_hoisted_20$2 = {
		key: 0,
		class: "mb-3"
	};
	_hoisted_21$2 = { class: "form-label fw-bold" };
	_hoisted_22$2 = ["placeholder"];
	_hoisted_23$2 = {
		key: 1,
		class: "mb-3"
	};
	_hoisted_24$2 = { class: "form-label fw-bold" };
	_hoisted_25$2 = ["placeholder"];
	_hoisted_26$1 = { class: "mt-2" };
	_hoisted_27$1 = { class: "form-label" };
	_hoisted_28$1 = ["placeholder"];
	_hoisted_29$1 = { class: "mt-2" };
	_hoisted_30$1 = { class: "card mb-3" };
	_hoisted_31$1 = { class: "card-body" };
	_hoisted_32 = { class: "form-check mb-2" };
	_hoisted_33 = {
		class: "form-check-label",
		for: "forwardAgent"
	};
	_hoisted_34 = { class: "form-text text-muted d-block" };
	_hoisted_35 = ["placeholder"];
	_hoisted_36 = { class: "form-text text-muted mt-1 d-block" };
	_hoisted_37 = { class: "card mb-3" };
	_hoisted_38 = { class: "card-body" };
	_hoisted_39 = { class: "form-check mb-2" };
	_hoisted_40 = {
		class: "form-check-label",
		for: "keepaliveEnabled"
	};
	_hoisted_41 = { class: "form-text text-muted d-block" };
	_hoisted_42 = {
		key: 0,
		class: "row mb-2"
	};
	_hoisted_43 = { class: "col-6" };
	_hoisted_44 = { class: "form-label" };
	_hoisted_45 = ["placeholder"];
	_hoisted_46 = { class: "form-text text-muted" };
	_hoisted_47 = { class: "col-6" };
	_hoisted_48 = { class: "form-label" };
	_hoisted_49 = ["placeholder"];
	_hoisted_50 = { class: "form-text text-muted" };
	_hoisted_51 = { class: "card mb-3" };
	_hoisted_52 = { class: "card-body" };
	_hoisted_53 = { class: "row mb-2" };
	_hoisted_54 = { class: "col-6" };
	_hoisted_55 = { class: "form-label" };
	_hoisted_56 = { class: "col-6" };
	_hoisted_57 = { class: "form-label" };
	_hoisted_58 = { value: "block" };
	_hoisted_59 = { value: "underline" };
	_hoisted_60 = { value: "bar" };
	_hoisted_61 = { class: "row mb-2" };
	_hoisted_62 = { class: "col-6" };
	_hoisted_63 = { class: "form-label" };
	_hoisted_64 = { value: "dark" };
	_hoisted_65 = { value: "light" };
	_hoisted_66 = { class: "col-6" };
	_hoisted_67 = { class: "form-label" };
	_hoisted_68 = { class: "d-flex justify-content-between" };
	_hoisted_69 = ["disabled"];
	_hoisted_70 = {
		key: 0,
		class: "spinner-border spinner-border-sm me-1"
	};
	_hoisted_71 = {
		key: 1,
		class: "bi bi-plug me-1"
	};
	_hoisted_72 = ["disabled"];
	_hoisted_73 = {
		key: 0,
		class: "spinner-border spinner-border-sm me-1"
	};
	index_vue_vue_type_script_setup_true_lang_default$3 = /*@__PURE__*/ defineComponent({
		__name: "index",
		emits: ["saved"],
		setup(__props, { expose: __expose, emit: __emit }) {
			const { t } = useI18n();
			const connectionModal = ref();
			const editingConnection = ref(null);
			const showTerminalConfig = ref(false);
			const showStartupScript = ref(false);
			const showKeepaliveConfig = ref(false);
			const testing = ref(false);
			const saving = ref(false);
			const keepaliveEnabled = ref(true);
			const keepaliveInterval = ref(1e4);
			const keepaliveCountMax = ref(3);
			const defaultForm = () => ({
				name: "",
				type: "ssh",
				host: "",
				port: 22,
				username: "root",
				authType: "auto",
				password: "",
				privateKey: "",
				passphrase: "",
				startupScript: "",
				forwardAgent: false,
				terminal: {
					cols: 80,
					rows: 24,
					fontSize: 14,
					fontFamily: "Menlo, Monaco, \"Courier New\", monospace",
					theme: "dark",
					cursorStyle: "block"
				},
				options: {},
				enabled: true
			});
			const form = reactive(defaultForm());
			const connectionService = new ConnectionService();
			function open(connection) {
				if (connection) {
					editingConnection.value = connection.id;
					Object.assign(form, defaultForm(), connection);
					showStartupScript.value = !!connection.startupScript || !!connection.forwardAgent;
					if (connection.options?.keepaliveInterval !== void 0) keepaliveInterval.value = connection.options.keepaliveInterval;
					else keepaliveInterval.value = 1e4;
					if (connection.options?.keepaliveCountMax !== void 0) keepaliveCountMax.value = connection.options.keepaliveCountMax;
					else keepaliveCountMax.value = 3;
					keepaliveEnabled.value = connection.options?.keepaliveInterval !== void 0 || connection.options?.keepaliveCountMax !== void 0;
					showKeepaliveConfig.value = keepaliveEnabled.value;
				} else {
					editingConnection.value = null;
					Object.assign(form, defaultForm());
					showStartupScript.value = false;
					showKeepaliveConfig.value = false;
					keepaliveEnabled.value = true;
					keepaliveInterval.value = 1e4;
					keepaliveCountMax.value = 3;
				}
				connectionModal.value?.show();
			}
			function close() {
				connectionModal.value?.hide();
			}
			function handleModalClose() {
				editingConnection.value = null;
			}
			async function saveConnection() {
				if (!form.name) {
					toast.warning(t("connection.nameRequired"));
					return;
				}
				if (!form.host || !form.username) {
					toast.warning(t("connection.hostUsernameRequired"));
					return;
				}
				saving.value = true;
				try {
					if (keepaliveEnabled.value) form.options = {
						...form.options,
						keepaliveInterval: keepaliveInterval.value,
						keepaliveCountMax: keepaliveCountMax.value
					};
					else form.options = {
						...form.options,
						keepaliveInterval: 0,
						keepaliveCountMax: 0
					};
					if (editingConnection.value) await connectionService.updateConnection(editingConnection.value, { ...form });
					else await connectionService.addConnection({ ...form });
					toast.success(t("connection.saveSuccess"));
					close();
					emit("saved");
				} catch (e) {
					toast.error(e.message || t("connection.saveFailed"));
				} finally {
					saving.value = false;
				}
			}
			async function testConn() {
				if (!form.host || !form.username) {
					toast.warning(t("connection.hostUsernameTestRequired"));
					return;
				}
				testing.value = true;
				try {
					if (await connectionService.testConnection({ ...form })) toast.success(t("connection.testSuccess"));
					else toast.error(t("connection.testFailed"));
				} catch (e) {
					toast.error(e.message || t("connection.testError"));
				} finally {
					testing.value = false;
				}
			}
			async function loadPrivateKey() {
				const chooser = document.createElement("input");
				chooser.type = "file";
				chooser.accept = ".pem,.key,.pub,.rsa";
				chooser.style.display = "none";
				chooser.addEventListener("change", async () => {
					if (chooser.files?.length) try {
						const text = await chooser.files[0].text();
						form.privateKey = text;
						toast.success(t("connection.privateKeyLoaded"));
					} catch (e) {
						toast.error(e.message || t("connection.privateKeyLoadFailed"));
					}
				});
				document.body.appendChild(chooser);
				chooser.click();
				setTimeout(() => {
					if (chooser.parentNode) document.body.removeChild(chooser);
				}, 0);
			}
			const emit = __emit;
			__expose({
				open,
				close
			});
			return (_ctx, _cache) => {
				return openBlock(), createBlock(modal_default, {
					ref_key: "connectionModal",
					ref: connectionModal,
					title: editingConnection.value ? unref(t)("connection.editTitle") : unref(t)("connection.addTitle"),
					closeButton: {
						text: unref(t)("common.cancel"),
						show: false
					},
					confirmButton: {
						text: "",
						show: false
					},
					dialogStyle: {
						maxWidth: "700px",
						width: "100%"
					},
					onOnClose: handleModalClose
				}, {
					default: withCtx(() => [createBaseVNode("form", {
						onSubmit: withModifiers(saveConnection, ["prevent"]),
						class: "connection-form"
					}, [
						createBaseVNode("div", _hoisted_1$3, [createBaseVNode("label", _hoisted_2$3, [
							_cache[22] || (_cache[22] = createBaseVNode("i", { class: "bi bi-tag me-1" }, null, -1)),
							createTextVNode(toDisplayString(unref(t)("connection.name")) + " ", 1),
							_cache[23] || (_cache[23] = createBaseVNode("span", { class: "text-danger" }, "*", -1))
						]), withDirectives(createBaseVNode("input", {
							type: "text",
							class: "form-control",
							"onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => form.name = $event),
							placeholder: unref(t)("connection.namePlaceholder"),
							required: ""
						}, null, 8, _hoisted_3$3), [[vModelText, form.name]])]),
						createBaseVNode("div", _hoisted_4$3, [createBaseVNode("div", _hoisted_5$3, [createBaseVNode("label", _hoisted_6$3, [
							_cache[24] || (_cache[24] = createBaseVNode("i", { class: "bi bi-server me-1" }, null, -1)),
							createTextVNode(toDisplayString(unref(t)("connection.host")) + " ", 1),
							_cache[25] || (_cache[25] = createBaseVNode("span", { class: "text-danger" }, "*", -1))
						]), withDirectives(createBaseVNode("input", {
							type: "text",
							class: "form-control",
							"onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => form.host = $event),
							placeholder: unref(t)("connection.hostPlaceholder"),
							required: form.type === "ssh"
						}, null, 8, _hoisted_7$3), [[vModelText, form.host]])]), createBaseVNode("div", _hoisted_8$3, [createBaseVNode("label", _hoisted_9$3, [_cache[26] || (_cache[26] = createBaseVNode("i", { class: "bi bi-door-closed me-1" }, null, -1)), createTextVNode(toDisplayString(unref(t)("connection.port")), 1)]), withDirectives(createBaseVNode("input", {
							type: "number",
							class: "form-control",
							"onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => form.port = $event),
							min: "1",
							max: "65535"
						}, null, 512), [[
							vModelText,
							form.port,
							void 0,
							{ number: true }
						]])])]),
						createBaseVNode("div", _hoisted_10$3, [createBaseVNode("label", _hoisted_11$3, [
							_cache[27] || (_cache[27] = createBaseVNode("i", { class: "bi bi-person me-1" }, null, -1)),
							createTextVNode(toDisplayString(unref(t)("connection.username")) + " ", 1),
							_cache[28] || (_cache[28] = createBaseVNode("span", { class: "text-danger" }, "*", -1))
						]), withDirectives(createBaseVNode("input", {
							type: "text",
							class: "form-control",
							"onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => form.username = $event),
							placeholder: unref(t)("connection.usernamePlaceholder"),
							required: form.type === "ssh"
						}, null, 8, _hoisted_12$3), [[vModelText, form.username]])]),
						createBaseVNode("div", _hoisted_13$3, [
							createBaseVNode("label", _hoisted_14$3, [_cache[29] || (_cache[29] = createBaseVNode("i", { class: "bi bi-shield-lock me-1" }, null, -1)), createTextVNode(toDisplayString(unref(t)("connection.authType")), 1)]),
							createBaseVNode("div", _hoisted_15$3, [
								withDirectives(createBaseVNode("input", {
									type: "radio",
									class: "btn-check",
									name: "authType",
									id: "auth-auto",
									value: "auto",
									"onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => form.authType = $event)
								}, null, 512), [[vModelRadio, form.authType]]),
								createBaseVNode("label", _hoisted_16$3, [_cache[30] || (_cache[30] = createBaseVNode("i", { class: "bi bi-magic me-1" }, null, -1)), createTextVNode(toDisplayString(unref(t)("connection.auto")), 1)]),
								withDirectives(createBaseVNode("input", {
									type: "radio",
									class: "btn-check",
									name: "authType",
									id: "auth-password",
									value: "password",
									"onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => form.authType = $event)
								}, null, 512), [[vModelRadio, form.authType]]),
								createBaseVNode("label", _hoisted_17$2, [_cache[31] || (_cache[31] = createBaseVNode("i", { class: "bi bi-key me-1" }, null, -1)), createTextVNode(toDisplayString(unref(t)("connection.password")), 1)]),
								withDirectives(createBaseVNode("input", {
									type: "radio",
									class: "btn-check",
									name: "authType",
									id: "auth-key",
									value: "privateKey",
									"onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => form.authType = $event)
								}, null, 512), [[vModelRadio, form.authType]]),
								createBaseVNode("label", _hoisted_18$2, [_cache[32] || (_cache[32] = createBaseVNode("i", { class: "bi bi-file-earmark-lock me-1" }, null, -1)), createTextVNode(toDisplayString(unref(t)("connection.privateKey")), 1)])
							]),
							form.authType === "auto" ? (openBlock(), createElementBlock("small", _hoisted_19$2, [_cache[33] || (_cache[33] = createBaseVNode("i", { class: "bi bi-info-circle me-1" }, null, -1)), createTextVNode(toDisplayString(unref(t)("connection.autoHint")), 1)])) : createCommentVNode("", true)
						]),
						form.authType === "password" ? (openBlock(), createElementBlock("div", _hoisted_20$2, [createBaseVNode("label", _hoisted_21$2, toDisplayString(unref(t)("connection.passwordLabel")), 1), withDirectives(createBaseVNode("input", {
							type: "password",
							class: "form-control",
							"onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => form.password = $event),
							placeholder: unref(t)("connection.passwordPlaceholder")
						}, null, 8, _hoisted_22$2), [[vModelText, form.password]])])) : createCommentVNode("", true),
						form.authType === "privateKey" ? (openBlock(), createElementBlock("div", _hoisted_23$2, [
							createBaseVNode("label", _hoisted_24$2, toDisplayString(unref(t)("connection.privateKeyContent")), 1),
							withDirectives(createBaseVNode("textarea", {
								class: "form-control",
								"onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => form.privateKey = $event),
								rows: "5",
								placeholder: unref(t)("connection.privateKeyPlaceholder")
							}, null, 8, _hoisted_25$2), [[vModelText, form.privateKey]]),
							createBaseVNode("div", _hoisted_26$1, [createBaseVNode("label", _hoisted_27$1, toDisplayString(unref(t)("connection.passphrase")), 1), withDirectives(createBaseVNode("input", {
								type: "password",
								class: "form-control",
								"onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => form.passphrase = $event),
								placeholder: unref(t)("connection.passphrasePlaceholder")
							}, null, 8, _hoisted_28$1), [[vModelText, form.passphrase]])]),
							createBaseVNode("div", _hoisted_29$1, [createBaseVNode("button", {
								type: "button",
								class: "btn btn-sm btn-outline-secondary",
								onClick: loadPrivateKey
							}, [_cache[34] || (_cache[34] = createBaseVNode("i", { class: "bi bi-folder-open me-1" }, null, -1)), createTextVNode(toDisplayString(unref(t)("connection.loadFromFile")), 1)])])
						])) : createCommentVNode("", true),
						createBaseVNode("div", _hoisted_30$1, [createBaseVNode("div", {
							class: "card-header",
							onClick: _cache[10] || (_cache[10] = ($event) => showStartupScript.value = !showStartupScript.value),
							style: { "cursor": "pointer" }
						}, [
							_cache[35] || (_cache[35] = createBaseVNode("i", { class: "bi bi-lightning-charge me-1" }, null, -1)),
							createTextVNode(toDisplayString(unref(t)("connection.startupScript")) + " ", 1),
							createBaseVNode("i", { class: normalizeClass(showStartupScript.value ? "bi bi-chevron-up float-end" : "bi bi-chevron-down float-end") }, null, 2)
						]), withDirectives(createBaseVNode("div", _hoisted_31$1, [
							createBaseVNode("div", _hoisted_32, [
								withDirectives(createBaseVNode("input", {
									class: "form-check-input",
									type: "checkbox",
									"onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => form.forwardAgent = $event),
									id: "forwardAgent"
								}, null, 512), [[vModelCheckbox, form.forwardAgent]]),
								createBaseVNode("label", _hoisted_33, [_cache[36] || (_cache[36] = createBaseVNode("i", { class: "bi bi-arrow-repeat me-1" }, null, -1)), createTextVNode(toDisplayString(unref(t)("connection.forwardAgent")), 1)]),
								createBaseVNode("small", _hoisted_34, [_cache[37] || (_cache[37] = createBaseVNode("i", { class: "bi bi-info-circle me-1" }, null, -1)), createTextVNode(toDisplayString(unref(t)("connection.forwardAgentHint")), 1)])
							]),
							withDirectives(createBaseVNode("textarea", {
								class: "form-control",
								"onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => form.startupScript = $event),
								rows: "3",
								placeholder: unref(t)("connection.startupScriptPlaceholder")
							}, null, 8, _hoisted_35), [[vModelText, form.startupScript]]),
							createBaseVNode("small", _hoisted_36, [_cache[38] || (_cache[38] = createBaseVNode("i", { class: "bi bi-info-circle me-1" }, null, -1)), createTextVNode(toDisplayString(unref(t)("connection.startupScriptHint")), 1)])
						], 512), [[vShow, showStartupScript.value]])]),
						createBaseVNode("div", _hoisted_37, [createBaseVNode("div", {
							class: "card-header",
							onClick: _cache[13] || (_cache[13] = ($event) => showKeepaliveConfig.value = !showKeepaliveConfig.value),
							style: { "cursor": "pointer" }
						}, [
							_cache[39] || (_cache[39] = createBaseVNode("i", { class: "bi bi-heart-pulse me-1" }, null, -1)),
							createTextVNode(toDisplayString(unref(t)("connection.keepaliveConfig")) + " ", 1),
							createBaseVNode("i", { class: normalizeClass(showKeepaliveConfig.value ? "bi bi-chevron-up float-end" : "bi bi-chevron-down float-end") }, null, 2)
						]), withDirectives(createBaseVNode("div", _hoisted_38, [createBaseVNode("div", _hoisted_39, [
							withDirectives(createBaseVNode("input", {
								class: "form-check-input",
								type: "checkbox",
								"onUpdate:modelValue": _cache[14] || (_cache[14] = ($event) => keepaliveEnabled.value = $event),
								id: "keepaliveEnabled"
							}, null, 512), [[vModelCheckbox, keepaliveEnabled.value]]),
							createBaseVNode("label", _hoisted_40, [_cache[40] || (_cache[40] = createBaseVNode("i", { class: "bi bi-toggle-on me-1" }, null, -1)), createTextVNode(toDisplayString(unref(t)("connection.keepaliveEnabled")), 1)]),
							createBaseVNode("small", _hoisted_41, [_cache[41] || (_cache[41] = createBaseVNode("i", { class: "bi bi-info-circle me-1" }, null, -1)), createTextVNode(toDisplayString(unref(t)("connection.keepaliveEnabledHint")), 1)])
						]), keepaliveEnabled.value ? (openBlock(), createElementBlock("div", _hoisted_42, [createBaseVNode("div", _hoisted_43, [
							createBaseVNode("label", _hoisted_44, toDisplayString(unref(t)("connection.keepaliveInterval")), 1),
							withDirectives(createBaseVNode("input", {
								type: "number",
								class: "form-control form-control-sm",
								"onUpdate:modelValue": _cache[15] || (_cache[15] = ($event) => keepaliveInterval.value = $event),
								min: "1000",
								max: "300000",
								placeholder: unref(t)("connection.keepaliveIntervalPlaceholder")
							}, null, 8, _hoisted_45), [[
								vModelText,
								keepaliveInterval.value,
								void 0,
								{ number: true }
							]]),
							createBaseVNode("small", _hoisted_46, toDisplayString(unref(t)("connection.keepaliveIntervalHint")), 1)
						]), createBaseVNode("div", _hoisted_47, [
							createBaseVNode("label", _hoisted_48, toDisplayString(unref(t)("connection.keepaliveCountMax")), 1),
							withDirectives(createBaseVNode("input", {
								type: "number",
								class: "form-control form-control-sm",
								"onUpdate:modelValue": _cache[16] || (_cache[16] = ($event) => keepaliveCountMax.value = $event),
								min: "1",
								max: "10",
								placeholder: unref(t)("connection.keepaliveCountMaxPlaceholder")
							}, null, 8, _hoisted_49), [[
								vModelText,
								keepaliveCountMax.value,
								void 0,
								{ number: true }
							]]),
							createBaseVNode("small", _hoisted_50, toDisplayString(unref(t)("connection.keepaliveCountMaxHint")), 1)
						])])) : createCommentVNode("", true)], 512), [[vShow, showKeepaliveConfig.value]])]),
						createBaseVNode("div", _hoisted_51, [createBaseVNode("div", {
							class: "card-header",
							onClick: _cache[17] || (_cache[17] = ($event) => showTerminalConfig.value = !showTerminalConfig.value),
							style: { "cursor": "pointer" }
						}, [
							_cache[42] || (_cache[42] = createBaseVNode("i", { class: "bi bi-terminal me-1" }, null, -1)),
							createTextVNode(toDisplayString(unref(t)("connection.terminalConfig")) + " ", 1),
							createBaseVNode("i", { class: normalizeClass(showTerminalConfig.value ? "bi bi-chevron-up float-end" : "bi bi-chevron-down float-end") }, null, 2)
						]), withDirectives(createBaseVNode("div", _hoisted_52, [createBaseVNode("div", _hoisted_53, [createBaseVNode("div", _hoisted_54, [createBaseVNode("label", _hoisted_55, toDisplayString(unref(t)("connection.fontSize")), 1), withDirectives(createBaseVNode("input", {
							type: "number",
							class: "form-control form-control-sm",
							"onUpdate:modelValue": _cache[18] || (_cache[18] = ($event) => form.terminal.fontSize = $event),
							min: "8",
							max: "32"
						}, null, 512), [[
							vModelText,
							form.terminal.fontSize,
							void 0,
							{ number: true }
						]])]), createBaseVNode("div", _hoisted_56, [createBaseVNode("label", _hoisted_57, toDisplayString(unref(t)("connection.cursorStyle")), 1), withDirectives(createBaseVNode("select", {
							class: "form-select form-select-sm",
							"onUpdate:modelValue": _cache[19] || (_cache[19] = ($event) => form.terminal.cursorStyle = $event)
						}, [
							createBaseVNode("option", _hoisted_58, toDisplayString(unref(t)("connection.cursorBlock")), 1),
							createBaseVNode("option", _hoisted_59, toDisplayString(unref(t)("connection.cursorUnderline")), 1),
							createBaseVNode("option", _hoisted_60, toDisplayString(unref(t)("connection.cursorBar")), 1)
						], 512), [[vModelSelect, form.terminal.cursorStyle]])])]), createBaseVNode("div", _hoisted_61, [createBaseVNode("div", _hoisted_62, [createBaseVNode("label", _hoisted_63, toDisplayString(unref(t)("connection.theme")), 1), withDirectives(createBaseVNode("select", {
							class: "form-select form-select-sm",
							"onUpdate:modelValue": _cache[20] || (_cache[20] = ($event) => form.terminal.theme = $event)
						}, [createBaseVNode("option", _hoisted_64, toDisplayString(unref(t)("connection.themeDark")), 1), createBaseVNode("option", _hoisted_65, toDisplayString(unref(t)("connection.themeLight")), 1)], 512), [[vModelSelect, form.terminal.theme]])]), createBaseVNode("div", _hoisted_66, [createBaseVNode("label", _hoisted_67, toDisplayString(unref(t)("connection.fontFamily")), 1), withDirectives(createBaseVNode("input", {
							type: "text",
							class: "form-control form-control-sm",
							"onUpdate:modelValue": _cache[21] || (_cache[21] = ($event) => form.terminal.fontFamily = $event),
							placeholder: "字体"
						}, null, 512), [[vModelText, form.terminal.fontFamily]])])])], 512), [[vShow, showTerminalConfig.value]])]),
						createBaseVNode("div", _hoisted_68, [createBaseVNode("button", {
							type: "button",
							class: "btn btn-outline-secondary",
							onClick: testConn,
							disabled: testing.value
						}, [testing.value ? (openBlock(), createElementBlock("span", _hoisted_70)) : (openBlock(), createElementBlock("i", _hoisted_71)), createTextVNode(" " + toDisplayString(testing.value ? unref(t)("connection.testing") : unref(t)("connection.testConnection")), 1)], 8, _hoisted_69), createBaseVNode("div", null, [createBaseVNode("button", {
							type: "button",
							class: "btn btn-secondary me-2",
							onClick: close
						}, toDisplayString(unref(t)("common.cancel")), 1), createBaseVNode("button", {
							type: "submit",
							class: "btn btn-primary",
							disabled: saving.value
						}, [saving.value ? (openBlock(), createElementBlock("span", _hoisted_73)) : createCommentVNode("", true), createTextVNode(" " + toDisplayString(saving.value ? unref(t)("connection.saving") : unref(t)("common.save")), 1)], 8, _hoisted_72)])])
					], 32)]),
					_: 1
				}, 8, ["title", "closeButton"]);
			};
		}
	});
}));
//#endregion
//#region src/components/connection-editor/index.vue?vue&type=style&index=0&scoped=0db4df7c&lang.css
var init_index_vue_vue_type_style_index_0_scoped_0db4df7c_lang = __esmMin((() => {}));
//#endregion
//#region src/components/connection-editor/index.vue
var connection_editor_default;
var init_connection_editor = __esmMin((() => {
	init_index_vue_vue_type_script_setup_true_lang$3();
	init_index_vue_vue_type_script_setup_true_lang$3();
	init_index_vue_vue_type_style_index_0_scoped_0db4df7c_lang();
	init__plugin_vue_export_helper();
	connection_editor_default = /*#__PURE__*/ _plugin_vue_export_helper_default(index_vue_vue_type_script_setup_true_lang_default$3, [["__scopeId", "data-v-0db4df7c"]]);
}));
//#endregion
//#region src/components/ai-settings/index.vue?vue&type=script&setup=true&lang.ts
var _hoisted_1$2, _hoisted_2$2, _hoisted_3$2, _hoisted_4$2, _hoisted_5$2, _hoisted_6$2, _hoisted_7$2, _hoisted_8$2, _hoisted_9$2, _hoisted_10$2, _hoisted_11$2, _hoisted_12$2, _hoisted_13$2, _hoisted_14$2, _hoisted_15$2, _hoisted_16$2, _hoisted_17$1, _hoisted_18$1, _hoisted_19$1, _hoisted_20$1, _hoisted_21$1, _hoisted_22$1, _hoisted_23$1, _hoisted_24$1, _hoisted_25$1, index_vue_vue_type_script_setup_true_lang_default$2;
var init_index_vue_vue_type_script_setup_true_lang$2 = __esmMin((() => {
	init_vue_runtime_esm_bundler();
	init_vue_i18n();
	init_modal$2();
	init_ai();
	init_toast();
	_hoisted_1$2 = { class: "mb-3" };
	_hoisted_2$2 = { class: "form-label fw-bold" };
	_hoisted_3$2 = { class: "form-text text-muted" };
	_hoisted_4$2 = { class: "mb-3" };
	_hoisted_5$2 = { class: "form-label fw-bold" };
	_hoisted_6$2 = { class: "input-group" };
	_hoisted_7$2 = ["type", "placeholder"];
	_hoisted_8$2 = { class: "form-text text-muted" };
	_hoisted_9$2 = { class: "mb-3" };
	_hoisted_10$2 = { class: "form-label fw-bold" };
	_hoisted_11$2 = ["placeholder"];
	_hoisted_12$2 = { class: "form-text text-muted" };
	_hoisted_13$2 = { class: "mb-3" };
	_hoisted_14$2 = { class: "form-label fw-bold" };
	_hoisted_15$2 = ["placeholder"];
	_hoisted_16$2 = { class: "form-text text-muted" };
	_hoisted_17$1 = { class: "row mb-3" };
	_hoisted_18$1 = { class: "col-6" };
	_hoisted_19$1 = { class: "form-label" };
	_hoisted_20$1 = { class: "col-6" };
	_hoisted_21$1 = { class: "form-label" };
	_hoisted_22$1 = { class: "d-flex justify-content-between" };
	_hoisted_23$1 = { class: "ms-auto" };
	_hoisted_24$1 = ["disabled"];
	_hoisted_25$1 = {
		key: 0,
		class: "spinner-border spinner-border-sm me-1"
	};
	index_vue_vue_type_script_setup_true_lang_default$2 = /*@__PURE__*/ defineComponent({
		__name: "index",
		emits: ["saved"],
		setup(__props, { expose: __expose, emit: __emit }) {
			const { t } = useI18n();
			const aiSettingsModal = ref();
			const showApiKey = ref(false);
			ref(false);
			const saving = ref(false);
			const defaultForm = () => ({
				enabled: true,
				provider: "openai",
				apiKey: "",
				baseUrl: "https://api.openai.com/v1",
				model: "gpt-4o-mini",
				maxTokens: 2e3,
				temperature: .7
			});
			const form = reactive(defaultForm());
			async function open() {
				try {
					const config = await getAIConfig();
					if (config) Object.assign(form, defaultForm(), config);
				} catch (e) {
					console.error("Failed to load AI config:", e);
				}
				aiSettingsModal.value?.show();
			}
			function close() {
				aiSettingsModal.value?.hide();
			}
			function handleModalClose() {}
			async function saveSettings() {
				if (!form.apiKey) {
					toast.warning(t("ai.apiKeyRequired"));
					return;
				}
				saving.value = true;
				try {
					await updateAIConfig({ ...form });
					toast.success(t("ai.saveSuccess"));
					close();
					emit("saved");
				} catch (e) {
					toast.error(e.message || t("ai.saveFailed"));
				} finally {
					saving.value = false;
				}
			}
			const emit = __emit;
			const providerPresets = {
				openai: {
					baseUrl: "https://api.openai.com/v1",
					model: "gpt-4o-mini"
				},
				anthropic: {
					baseUrl: "https://api.anthropic.com",
					model: "claude-3-5-sonnet-20241022"
				},
				tencent: {
					baseUrl: "https://api.hunyuan.cloud.tencent.com/v1",
					model: "hunyuan-lite"
				},
				azure: {
					baseUrl: "",
					model: "gpt-4o-mini"
				},
				custom: {
					baseUrl: "",
					model: ""
				}
			};
			function onProviderChange() {
				const preset = providerPresets[form.provider];
				if (preset) {
					form.baseUrl = preset.baseUrl;
					form.model = preset.model;
				}
			}
			__expose({
				open,
				close
			});
			return (_ctx, _cache) => {
				return openBlock(), createBlock(modal_default, {
					ref_key: "aiSettingsModal",
					ref: aiSettingsModal,
					title: unref(t)("ai.settings"),
					closeButton: {
						text: unref(t)("common.cancel"),
						show: false
					},
					confirmButton: {
						text: "",
						show: false
					},
					dialogStyle: {
						maxWidth: "500px",
						width: "100%"
					},
					onOnHidden: handleModalClose
				}, {
					default: withCtx(() => [createBaseVNode("form", {
						onSubmit: withModifiers(saveSettings, ["prevent"]),
						class: "ai-settings-form"
					}, [
						createBaseVNode("div", _hoisted_1$2, [
							createBaseVNode("label", _hoisted_2$2, [
								_cache[7] || (_cache[7] = createBaseVNode("i", { class: "bi bi-cloud me-1" }, null, -1)),
								createTextVNode(toDisplayString(unref(t)("ai.provider")) + " ", 1),
								_cache[8] || (_cache[8] = createBaseVNode("span", { class: "text-danger" }, "*", -1))
							]),
							withDirectives(createBaseVNode("select", {
								class: "form-select",
								"onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => form.provider = $event),
								onChange: onProviderChange
							}, [..._cache[9] || (_cache[9] = [
								createBaseVNode("option", { value: "openai" }, "OpenAI", -1),
								createBaseVNode("option", { value: "anthropic" }, "Anthropic (Claude)", -1),
								createBaseVNode("option", { value: "tencent" }, "腾讯云", -1),
								createBaseVNode("option", { value: "azure" }, "Azure OpenAI", -1),
								createBaseVNode("option", { value: "custom" }, "自定义", -1)
							])], 544), [[vModelSelect, form.provider]]),
							createBaseVNode("small", _hoisted_3$2, toDisplayString(unref(t)("ai.providerHint")), 1)
						]),
						createBaseVNode("div", _hoisted_4$2, [
							createBaseVNode("label", _hoisted_5$2, [
								_cache[10] || (_cache[10] = createBaseVNode("i", { class: "bi bi-key me-1" }, null, -1)),
								createTextVNode(toDisplayString(unref(t)("ai.apiKey")) + " ", 1),
								_cache[11] || (_cache[11] = createBaseVNode("span", { class: "text-danger" }, "*", -1))
							]),
							createBaseVNode("div", _hoisted_6$2, [withDirectives(createBaseVNode("input", {
								type: showApiKey.value ? "text" : "password",
								class: "form-control",
								"onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => form.apiKey = $event),
								placeholder: unref(t)("ai.apiKeyPlaceholder"),
								required: ""
							}, null, 8, _hoisted_7$2), [[vModelDynamic, form.apiKey]]), createBaseVNode("button", {
								type: "button",
								class: "btn btn-outline-secondary",
								onClick: _cache[2] || (_cache[2] = ($event) => showApiKey.value = !showApiKey.value)
							}, [createBaseVNode("i", { class: normalizeClass(showApiKey.value ? "bi bi-eye-slash" : "bi bi-eye") }, null, 2)])]),
							createBaseVNode("small", _hoisted_8$2, toDisplayString(unref(t)("ai.apiKeyHint")), 1)
						]),
						createBaseVNode("div", _hoisted_9$2, [
							createBaseVNode("label", _hoisted_10$2, [_cache[12] || (_cache[12] = createBaseVNode("i", { class: "bi bi-globe me-1" }, null, -1)), createTextVNode(toDisplayString(unref(t)("ai.baseUrl")), 1)]),
							withDirectives(createBaseVNode("input", {
								type: "text",
								class: "form-control",
								"onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => form.baseUrl = $event),
								placeholder: unref(t)("ai.baseUrlPlaceholder")
							}, null, 8, _hoisted_11$2), [[vModelText, form.baseUrl]]),
							createBaseVNode("small", _hoisted_12$2, toDisplayString(unref(t)("ai.baseUrlHint")), 1)
						]),
						createBaseVNode("div", _hoisted_13$2, [
							createBaseVNode("label", _hoisted_14$2, [_cache[13] || (_cache[13] = createBaseVNode("i", { class: "bi bi-cpu me-1" }, null, -1)), createTextVNode(toDisplayString(unref(t)("ai.model")), 1)]),
							withDirectives(createBaseVNode("input", {
								type: "text",
								class: "form-control",
								"onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => form.model = $event),
								placeholder: unref(t)("ai.modelPlaceholder")
							}, null, 8, _hoisted_15$2), [[vModelText, form.model]]),
							createBaseVNode("small", _hoisted_16$2, toDisplayString(unref(t)("ai.modelHint")), 1)
						]),
						createBaseVNode("div", _hoisted_17$1, [createBaseVNode("div", _hoisted_18$1, [createBaseVNode("label", _hoisted_19$1, toDisplayString(unref(t)("ai.maxTokens")), 1), withDirectives(createBaseVNode("input", {
							type: "number",
							class: "form-control form-control-sm",
							"onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => form.maxTokens = $event),
							min: "100",
							max: "8000"
						}, null, 512), [[
							vModelText,
							form.maxTokens,
							void 0,
							{ number: true }
						]])]), createBaseVNode("div", _hoisted_20$1, [createBaseVNode("label", _hoisted_21$1, toDisplayString(unref(t)("ai.temperature")), 1), withDirectives(createBaseVNode("input", {
							type: "number",
							class: "form-control form-control-sm",
							"onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => form.temperature = $event),
							min: "0",
							max: "2",
							step: "0.1"
						}, null, 512), [[
							vModelText,
							form.temperature,
							void 0,
							{ number: true }
						]])])]),
						createBaseVNode("div", _hoisted_22$1, [createBaseVNode("div", _hoisted_23$1, [createBaseVNode("button", {
							type: "button",
							class: "btn btn-secondary me-2",
							onClick: close
						}, toDisplayString(unref(t)("common.cancel")), 1), createBaseVNode("button", {
							type: "submit",
							class: "btn btn-primary",
							disabled: saving.value
						}, [saving.value ? (openBlock(), createElementBlock("span", _hoisted_25$1)) : createCommentVNode("", true), createTextVNode(" " + toDisplayString(saving.value ? unref(t)("common.processing") : unref(t)("common.save")), 1)], 8, _hoisted_24$1)])])
					], 32)]),
					_: 1
				}, 8, ["title", "closeButton"]);
			};
		}
	});
}));
//#endregion
//#region src/components/ai-settings/index.vue?vue&type=style&index=0&scoped=226da730&lang.css
var init_index_vue_vue_type_style_index_0_scoped_226da730_lang = __esmMin((() => {}));
//#endregion
//#region src/components/ai-settings/index.vue
var ai_settings_default;
var init_ai_settings = __esmMin((() => {
	init_index_vue_vue_type_script_setup_true_lang$2();
	init_index_vue_vue_type_script_setup_true_lang$2();
	init_index_vue_vue_type_style_index_0_scoped_226da730_lang();
	init__plugin_vue_export_helper();
	ai_settings_default = /*#__PURE__*/ _plugin_vue_export_helper_default(index_vue_vue_type_script_setup_true_lang_default$2, [["__scopeId", "data-v-226da730"]]);
}));
//#endregion
//#region src/service/batch.ts
function unwrap(res) {
	if (res && typeof res === "object" && "ret" in res) {
		if (res.ret !== 0) throw new Error(res.msg || "请求失败");
		return res.data;
	}
	return res;
}
function executeBatch(sessionIds, command, timeout) {
	return request("/api/batch/execute", {
		sessionIds,
		command,
		timeout
	}).then(unwrap);
}
function getBatchTasks() {
	return request("/api/batch/tasks", {}).then(unwrap);
}
var init_batch = __esmMin((() => {
	init_base();
}));
//#endregion
//#region src/components/batch-panel/index.vue?vue&type=script&setup=true&lang.ts
var _hoisted_1$1, _hoisted_2$1, _hoisted_3$1, _hoisted_4$1, _hoisted_5$1, _hoisted_6$1, _hoisted_7$1, _hoisted_8$1, _hoisted_9$1, _hoisted_10$1, _hoisted_11$1, _hoisted_12$1, _hoisted_13$1, _hoisted_14$1, _hoisted_15$1, _hoisted_16$1, _hoisted_17, _hoisted_18, _hoisted_19, _hoisted_20, _hoisted_21, _hoisted_22, _hoisted_23, _hoisted_24, _hoisted_25, _hoisted_26, _hoisted_27, _hoisted_28, _hoisted_29, _hoisted_30, _hoisted_31, index_vue_vue_type_script_setup_true_lang_default$1;
var init_index_vue_vue_type_script_setup_true_lang$1 = __esmMin((() => {
	init_vue_runtime_esm_bundler();
	init_vue_i18n();
	init_batch();
	init_terminal$1();
	init_clipboard();
	_hoisted_1$1 = { class: "batch-panel" };
	_hoisted_2$1 = { class: "batch-controls" };
	_hoisted_3$1 = { class: "batch-input-row" };
	_hoisted_4$1 = ["placeholder", "disabled"];
	_hoisted_5$1 = ["disabled"];
	_hoisted_6$1 = { class: "batch-info" };
	_hoisted_7$1 = { class: "session-count" };
	_hoisted_8$1 = {
		key: 0,
		class: "session-selector"
	};
	_hoisted_9$1 = { class: "selector-header" };
	_hoisted_10$1 = { class: "selector-actions" };
	_hoisted_11$1 = { class: "session-list" };
	_hoisted_12$1 = ["onClick"];
	_hoisted_13$1 = { class: "session-name" };
	_hoisted_14$1 = { class: "session-type" };
	_hoisted_15$1 = {
		key: 0,
		class: "session-empty"
	};
	_hoisted_16$1 = {
		key: 1,
		class: "batch-results"
	};
	_hoisted_17 = { class: "results-header" };
	_hoisted_18 = { class: "results-title" };
	_hoisted_19 = { class: "results-summary" };
	_hoisted_20 = { class: "summary-success" };
	_hoisted_21 = {
		key: 0,
		class: "summary-fail"
	};
	_hoisted_22 = { class: "summary-time" };
	_hoisted_23 = { class: "results-list" };
	_hoisted_24 = ["onClick"];
	_hoisted_25 = { class: "result-header" };
	_hoisted_26 = { class: "result-name" };
	_hoisted_27 = { class: "result-duration" };
	_hoisted_28 = {
		key: 0,
		class: "result-output"
	};
	_hoisted_29 = { class: "result-actions" };
	_hoisted_30 = ["onClick"];
	_hoisted_31 = {
		key: 2,
		class: "batch-empty"
	};
	index_vue_vue_type_script_setup_true_lang_default$1 = /*@__PURE__*/ defineComponent({
		__name: "index",
		setup(__props, { expose: __expose }) {
			const { t } = useI18n();
			const command = ref("");
			const executing = ref(false);
			const task = ref(null);
			const availableSessions = ref([]);
			const selectedSessions = ref([]);
			const showSessionSelector = ref(true);
			const expandedResults = reactive(/* @__PURE__ */ new Set());
			const successCount = computed(() => task.value?.results.filter((r) => r.success).length || 0);
			const failCount = computed(() => task.value?.results.filter((r) => !r.success).length || 0);
			const totalDuration = computed(() => {
				if (!task.value?.completedAt || !task.value?.startedAt) return "";
				const ms = task.value.completedAt - task.value.startedAt;
				return ms < 1e3 ? `${ms}ms` : `${(ms / 1e3).toFixed(1)}s`;
			});
			async function loadSessions() {
				try {
					const sessions = await getSessions();
					availableSessions.value = sessions || [];
				} catch (e) {
					console.warn("Failed to load sessions:", e);
				}
			}
			function toggleSession(sessionId) {
				const idx = selectedSessions.value.indexOf(sessionId);
				if (idx >= 0) selectedSessions.value.splice(idx, 1);
				else selectedSessions.value.push(sessionId);
			}
			function selectAll() {
				selectedSessions.value = availableSessions.value.map((s) => s.sessionId);
			}
			function selectNone() {
				selectedSessions.value = [];
			}
			async function handleExecute() {
				if (!command.value.trim() || selectedSessions.value.length === 0) return;
				executing.value = true;
				task.value = null;
				expandedResults.clear();
				try {
					const result = await executeBatch(selectedSessions.value, command.value.trim(), 15e3);
					task.value = result;
					for (const r of result.results) if (!r.success) expandedResults.add(r.sessionId);
				} catch (e) {
					console.error("Batch execute failed:", e);
					task.value = {
						id: "error",
						command: command.value,
						sessionIds: selectedSessions.value,
						results: [],
						status: "failed",
						startedAt: Date.now(),
						completedAt: Date.now()
					};
				} finally {
					executing.value = false;
				}
			}
			function toggleResult(sessionId) {
				if (expandedResults.has(sessionId)) expandedResults.delete(sessionId);
				else expandedResults.add(sessionId);
			}
			function formatDuration(ms) {
				if (ms < 1e3) return `${ms}ms`;
				return `${(ms / 1e3).toFixed(1)}s`;
			}
			function copyText(text) {
				copy(text);
			}
			onMounted(async () => {
				await loadSessions();
				try {
					const tasks = await getBatchTasks();
					if (tasks && tasks.length > 0) task.value = tasks[0];
				} catch {}
			});
			__expose({ loadSessions });
			return (_ctx, _cache) => {
				return openBlock(), createElementBlock("div", _hoisted_1$1, [
					createBaseVNode("div", _hoisted_2$1, [createBaseVNode("div", _hoisted_3$1, [withDirectives(createBaseVNode("textarea", {
						class: "batch-command",
						placeholder: unref(t)("batch.commandPlaceholder"),
						"onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => command.value = $event),
						rows: "2",
						disabled: executing.value
					}, null, 8, _hoisted_4$1), [[vModelText, command.value]]), createBaseVNode("button", {
						class: "btn-batch",
						onClick: handleExecute,
						disabled: !command.value.trim() || selectedSessions.value.length === 0 || executing.value
					}, [createBaseVNode("i", { class: normalizeClass(executing.value ? "bi bi-hourglass-split" : "bi bi-play-fill") }, null, 2), createTextVNode(" " + toDisplayString(executing.value ? unref(t)("batch.executing") : unref(t)("batch.execute")), 1)], 8, _hoisted_5$1)]), createBaseVNode("div", _hoisted_6$1, [createBaseVNode("span", _hoisted_7$1, [_cache[3] || (_cache[3] = createBaseVNode("i", { class: "bi bi-hdd-rack" }, null, -1)), createTextVNode(" " + toDisplayString(selectedSessions.value.length) + " " + toDisplayString(unref(t)("batch.serversSelected")), 1)]), createBaseVNode("button", {
						class: "btn-select-sessions",
						onClick: _cache[1] || (_cache[1] = ($event) => showSessionSelector.value = !showSessionSelector.value)
					}, [_cache[4] || (_cache[4] = createBaseVNode("i", { class: "bi bi-check2-square" }, null, -1)), createTextVNode(" " + toDisplayString(unref(t)("batch.selectServers")), 1)])])]),
					showSessionSelector.value ? (openBlock(), createElementBlock("div", _hoisted_8$1, [createBaseVNode("div", _hoisted_9$1, [createBaseVNode("span", null, toDisplayString(unref(t)("batch.selectServers")), 1), createBaseVNode("div", _hoisted_10$1, [
						createBaseVNode("button", {
							class: "btn-small",
							onClick: selectAll
						}, toDisplayString(unref(t)("batch.selectAll")), 1),
						createBaseVNode("button", {
							class: "btn-small",
							onClick: selectNone
						}, toDisplayString(unref(t)("batch.selectNone")), 1),
						createBaseVNode("button", {
							class: "btn-small",
							onClick: _cache[2] || (_cache[2] = ($event) => showSessionSelector.value = false)
						}, [..._cache[5] || (_cache[5] = [createBaseVNode("i", { class: "bi bi-x" }, null, -1)])])
					])]), createBaseVNode("div", _hoisted_11$1, [(openBlock(true), createElementBlock(Fragment, null, renderList(availableSessions.value, (session) => {
						return openBlock(), createElementBlock("div", {
							key: session.sessionId,
							class: normalizeClass(["session-item", { selected: selectedSessions.value.includes(session.sessionId) }]),
							onClick: ($event) => toggleSession(session.sessionId)
						}, [
							createBaseVNode("i", { class: normalizeClass(selectedSessions.value.includes(session.sessionId) ? "bi bi-check-square-fill" : "bi bi-square") }, null, 2),
							createBaseVNode("span", _hoisted_13$1, toDisplayString(session.name || session.sessionId.substring(0, 8)), 1),
							createBaseVNode("span", _hoisted_14$1, toDisplayString(session.type), 1)
						], 10, _hoisted_12$1);
					}), 128)), availableSessions.value.length === 0 ? (openBlock(), createElementBlock("div", _hoisted_15$1, toDisplayString(unref(t)("batch.noActiveSessions")), 1)) : createCommentVNode("", true)])])) : createCommentVNode("", true),
					task.value ? (openBlock(), createElementBlock("div", _hoisted_16$1, [createBaseVNode("div", _hoisted_17, [createBaseVNode("span", _hoisted_18, [createBaseVNode("code", null, toDisplayString(task.value.command), 1), createBaseVNode("span", { class: normalizeClass(["results-status", "status-" + task.value.status]) }, toDisplayString(task.value.status), 3)]), createBaseVNode("span", _hoisted_19, [
						createBaseVNode("span", _hoisted_20, [createTextVNode(toDisplayString(successCount.value) + " ", 1), _cache[6] || (_cache[6] = createBaseVNode("i", { class: "bi bi-check-circle" }, null, -1))]),
						failCount.value > 0 ? (openBlock(), createElementBlock("span", _hoisted_21, [createTextVNode(toDisplayString(failCount.value) + " ", 1), _cache[7] || (_cache[7] = createBaseVNode("i", { class: "bi bi-x-circle" }, null, -1))])) : createCommentVNode("", true),
						createBaseVNode("span", _hoisted_22, toDisplayString(totalDuration.value), 1)
					])]), createBaseVNode("div", _hoisted_23, [(openBlock(true), createElementBlock(Fragment, null, renderList(task.value.results, (result) => {
						return openBlock(), createElementBlock("div", {
							key: result.sessionId,
							class: normalizeClass(["result-item", {
								success: result.success,
								failed: !result.success,
								expanded: expandedResults.has(result.sessionId)
							}]),
							onClick: ($event) => toggleResult(result.sessionId)
						}, [createBaseVNode("div", _hoisted_25, [
							createBaseVNode("i", { class: normalizeClass(result.success ? "bi bi-check-circle-fill text-success" : "bi bi-x-circle-fill text-danger") }, null, 2),
							createBaseVNode("span", _hoisted_26, toDisplayString(result.sessionName), 1),
							createBaseVNode("span", _hoisted_27, toDisplayString(formatDuration(result.duration)), 1),
							createBaseVNode("i", { class: normalizeClass([expandedResults.has(result.sessionId) ? "bi bi-chevron-up" : "bi bi-chevron-down", "result-expand"]) }, null, 2)
						]), expandedResults.has(result.sessionId) ? (openBlock(), createElementBlock("div", _hoisted_28, [createBaseVNode("pre", null, toDisplayString(result.success ? result.output : result.error || result.output), 1), createBaseVNode("div", _hoisted_29, [createBaseVNode("button", {
							class: "btn-copy",
							onClick: withModifiers(($event) => copyText(result.output), ["stop"])
						}, [_cache[8] || (_cache[8] = createBaseVNode("i", { class: "bi bi-clipboard" }, null, -1)), createTextVNode(" " + toDisplayString(unref(t)("batch.copyOutput")), 1)], 8, _hoisted_30)])])) : createCommentVNode("", true)], 10, _hoisted_24);
					}), 128))])])) : (openBlock(), createElementBlock("div", _hoisted_31, [_cache[9] || (_cache[9] = createBaseVNode("i", { class: "bi bi-hdd-rack" }, null, -1)), createBaseVNode("p", null, toDisplayString(unref(t)("batch.hint")), 1)]))
				]);
			};
		}
	});
}));
//#endregion
//#region src/components/batch-panel/index.vue?vue&type=style&index=0&scoped=3a165556&lang.css
var init_index_vue_vue_type_style_index_0_scoped_3a165556_lang = __esmMin((() => {}));
//#endregion
//#region src/components/batch-panel/index.vue
var batch_panel_default;
var init_batch_panel = __esmMin((() => {
	init_index_vue_vue_type_script_setup_true_lang$1();
	init_index_vue_vue_type_script_setup_true_lang$1();
	init_index_vue_vue_type_style_index_0_scoped_3a165556_lang();
	init__plugin_vue_export_helper();
	batch_panel_default = /*#__PURE__*/ _plugin_vue_export_helper_default(index_vue_vue_type_script_setup_true_lang_default$1, [["__scopeId", "data-v-3a165556"]]);
}));
//#endregion
//#region src/views/index.vue?vue&type=script&setup=true&lang.ts
var _hoisted_1, _hoisted_2, _hoisted_3, _hoisted_4, _hoisted_5, _hoisted_6, _hoisted_7, _hoisted_8, _hoisted_9, _hoisted_10, _hoisted_11, _hoisted_12, _hoisted_13, _hoisted_14, _hoisted_15, _hoisted_16, index_vue_vue_type_script_setup_true_lang_default;
var init_index_vue_vue_type_script_setup_true_lang = __esmMin((() => {
	init_vue_runtime_esm_bundler();
	init_vue_i18n();
	init_eventBus();
	init_terminal();
	init_terminal$1();
	init_terminal_sidebar();
	init_terminal_tab();
	init_connection_editor();
	init_ai_settings();
	init_batch_panel();
	_hoisted_1 = { class: "aicmd-layout" };
	_hoisted_2 = { class: "main-area" };
	_hoisted_3 = ["title"];
	_hoisted_4 = ["onClick", "onContextmenu"];
	_hoisted_5 = ["onBlur", "onKeydown"];
	_hoisted_6 = ["onDblclick"];
	_hoisted_7 = ["onClick"];
	_hoisted_8 = ["title"];
	_hoisted_9 = { class: "terminal-area" };
	_hoisted_10 = {
		key: 1,
		class: "empty-state"
	};
	_hoisted_11 = { style: { "font-size": "18px" } };
	_hoisted_12 = { style: { "font-size": "13px" } };
	_hoisted_13 = { class: "d-flex gap-2 mt-3 justify-content-center" };
	_hoisted_14 = { class: "batch-modal" };
	_hoisted_15 = { class: "batch-modal-header" };
	_hoisted_16 = { class: "batch-modal-body" };
	index_vue_vue_type_script_setup_true_lang_default = /*@__PURE__*/ defineComponent({
		__name: "index",
		setup(__props) {
			const { t } = useI18n();
			const store = useTerminalStore();
			const connectionEditorRef = ref();
			const aiSettingsRef = ref();
			const batchPanelRef = ref();
			const showBatchPanel = ref(false);
			const editingTabId = ref(null);
			const editingTabName = ref("");
			const tabNameInput = ref(null);
			const contextMenuVisible = ref(false);
			const contextMenuX = ref(0);
			const contextMenuY = ref(0);
			const contextMenuTabId = ref(null);
			const renderedTabs = /* @__PURE__ */ new Set();
			const termRefs = /* @__PURE__ */ new Map();
			function setTermRef(tabId, el) {
				if (el) {
					termRefs.set(tabId, el);
					renderedTabs.add(tabId);
				} else {
					termRefs.delete(tabId);
					renderedTabs.delete(tabId);
				}
			}
			function getConnection(connectionId) {
				if (connectionId === "__local__") return store.getLocalShellConnection();
				return store.connections.find((c) => c.id === connectionId) || {
					name: "",
					host: "",
					username: ""
				};
			}
			function handleConnect(conn) {
				store.openTab(conn);
			}
			function handleOpenLocalShell() {
				store.openLocalShell();
			}
			function startRename(tab) {
				editingTabId.value = tab.id;
				editingTabName.value = tab.connectionName;
				nextTick(() => {
					tabNameInput.value?.focus();
					tabNameInput.value?.select();
				});
			}
			function finishRename(tabId) {
				const newName = editingTabName.value.trim();
				if (newName) store.renameTab(tabId, newName);
				editingTabId.value = null;
			}
			function openEditor(conn) {
				connectionEditorRef.value?.open(conn);
			}
			function handleEditorSaved() {
				store.loadConnections();
			}
			async function handleDelete(conn) {
				if (conn.id) await store.deleteConnection(conn.id);
			}
			function handleRefresh() {
				store.loadConnections();
			}
			async function handleCloseTab(tabId) {
				await store.closeTab(tabId);
				termRefs.delete(tabId);
				renderedTabs.delete(tabId);
			}
			function showContextMenu(event, tab) {
				event.preventDefault();
				contextMenuTabId.value = tab.id;
				contextMenuX.value = event.clientX;
				contextMenuY.value = event.clientY;
				contextMenuVisible.value = true;
			}
			function hideContextMenu() {
				contextMenuVisible.value = false;
				contextMenuTabId.value = null;
			}
			async function handleCloneTab() {
				const tabId = contextMenuTabId.value;
				if (tabId) await store.cloneTab(tabId);
				hideContextMenu();
			}
			function handleRenameFromContext() {
				const tabId = contextMenuTabId.value;
				if (tabId) {
					const tab = store.tabs.find((t) => t.id === tabId);
					if (tab) startRename(tab);
				}
				hideContextMenu();
			}
			async function handleCloseFromContext() {
				const tabId = contextMenuTabId.value;
				if (tabId) await handleCloseTab(tabId);
				hideContextMenu();
			}
			async function handleCloseOtherFromContext() {
				const tabId = contextMenuTabId.value;
				if (tabId) {
					await store.closeOtherTabs(tabId);
					const keepIds = /* @__PURE__ */ new Set([tabId]);
					for (const [id] of termRefs) if (!keepIds.has(id)) {
						termRefs.delete(id);
						renderedTabs.delete(id);
					}
				}
				hideContextMenu();
			}
			async function handleCloseAllFromContext() {
				await store.closeAllTabs();
				termRefs.clear();
				renderedTabs.clear();
				hideContextMenu();
			}
			function handleStatusChange(tabId, status, sessionId) {
				store.updateTabStatus(tabId, status, sessionId);
			}
			function openAISettings() {
				aiSettingsRef.value?.open();
			}
			function openBatchPanel() {
				showBatchPanel.value = true;
			}
			function handleKeydown(e) {
				if ((e.ctrlKey || e.metaKey) && e.key === "t") {}
				if ((e.ctrlKey || e.metaKey) && e.key === "w" && store.activeTabId) {
					e.preventDefault();
					handleCloseTab(store.activeTabId);
				}
				if ((e.ctrlKey || e.metaKey) && /^[1-9]$/.test(e.key)) {
					e.preventDefault();
					const idx = parseInt(e.key) - 1;
					if (store.tabs[idx]) store.switchTab(store.tabs[idx].id);
				}
				if ((e.ctrlKey || e.metaKey) && e.key === "b") {
					e.preventDefault();
					store.toggleSidebar();
				}
			}
			let menuNewConnSubId = null;
			onMounted(async () => {
				await store.loadConnections();
				await restoreOrCreateTabs();
				document.addEventListener("keydown", handleKeydown);
				document.addEventListener("click", hideContextMenu);
				menuNewConnSubId = subscribe("MENU_NEW_CONNECTION", () => {
					openEditor();
				});
			});
			onBeforeUnmount(() => {
				document.removeEventListener("keydown", handleKeydown);
				document.removeEventListener("click", hideContextMenu);
				if (menuNewConnSubId) unsubscribe(menuNewConnSubId);
			});
			/**
			* 从 server 端恢复 TAB 信息
			*/
			async function restoreOrCreateTabs() {
				try {
					const sessionList = await getSessions() || [];
					if (sessionList.length > 0) {
						for (const session of sessionList) try {
							await deleteSession(session.sessionId);
						} catch (e) {
							console.warn("删除旧 session 失败:", e);
						}
						for (const session of sessionList) if (session.connectionId === "__local__") store.openLocalShell(session.name);
						else {
							const conn = store.connections.find((c) => c.id === session.connectionId);
							if (conn) store.openTab(conn, session.name);
						}
						if (store.tabs.length > 0) {
							store.switchTab(store.tabs[0].id);
							return;
						}
					}
				} catch (e) {
					console.warn("从 server 恢复 session 失败:", e);
				}
				store.openLocalShell();
			}
			return (_ctx, _cache) => {
				return openBlock(), createElementBlock("div", _hoisted_1, [
					createVNode(terminal_sidebar_default, {
						connections: unref(store).connections,
						loading: unref(store).loading,
						collapsed: unref(store).sidebarCollapsed,
						onConnect: handleConnect,
						onAddConnection: _cache[0] || (_cache[0] = ($event) => openEditor()),
						onEditConnection: openEditor,
						onDeleteConnection: handleDelete,
						onRefresh: handleRefresh,
						onToggleSidebar: _cache[1] || (_cache[1] = ($event) => unref(store).toggleSidebar()),
						onOpenAiSettings: openAISettings,
						onOpenBatch: openBatchPanel
					}, null, 8, [
						"connections",
						"loading",
						"collapsed"
					]),
					createBaseVNode("div", _hoisted_2, [
						unref(store).sidebarCollapsed ? (openBlock(), createElementBlock("button", {
							key: 0,
							class: "sidebar-toggle-btn",
							onClick: _cache[2] || (_cache[2] = ($event) => unref(store).toggleSidebar()),
							title: unref(t)("sidebar.expand")
						}, [..._cache[11] || (_cache[11] = [createBaseVNode("i", { class: "bi bi-chevron-right" }, null, -1)])], 8, _hoisted_3)) : createCommentVNode("", true),
						unref(store).tabs.length > 0 ? (openBlock(), createElementBlock("div", {
							key: 1,
							class: "tab-bar",
							style: { "height": "var(--tab-bar-height)" },
							onContextmenu: _cache[5] || (_cache[5] = withModifiers(() => {}, ["prevent"]))
						}, [(openBlock(true), createElementBlock(Fragment, null, renderList(unref(store).tabs, (tab) => {
							return openBlock(), createElementBlock("div", {
								key: tab.id,
								class: normalizeClass(["tab-item", { active: tab.id === unref(store).activeTabId }]),
								onClick: ($event) => unref(store).switchTab(tab.id),
								onContextmenu: withModifiers(($event) => showContextMenu($event, tab), ["prevent"])
							}, [
								createBaseVNode("span", { class: normalizeClass(["status-dot", tab.status]) }, null, 2),
								editingTabId.value === tab.id ? withDirectives((openBlock(), createElementBlock("input", {
									key: 0,
									ref_for: true,
									ref_key: "tabNameInput",
									ref: tabNameInput,
									"onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => editingTabName.value = $event),
									class: "tab-name-input",
									onBlur: ($event) => finishRename(tab.id),
									onKeydown: withKeys(($event) => finishRename(tab.id), ["enter"]),
									onClick: _cache[4] || (_cache[4] = withModifiers(() => {}, ["stop"]))
								}, null, 40, _hoisted_5)), [[vModelText, editingTabName.value]]) : (openBlock(), createElementBlock("span", {
									key: 1,
									class: "text-truncate flex-grow-1",
									onDblclick: withModifiers(($event) => startRename(tab), ["stop"])
								}, toDisplayString(tab.connectionName), 41, _hoisted_6)),
								createBaseVNode("span", {
									class: "tab-close",
									onClick: withModifiers(($event) => handleCloseTab(tab.id), ["stop"])
								}, [..._cache[12] || (_cache[12] = [createBaseVNode("i", { class: "bi bi-x" }, null, -1)])], 8, _hoisted_7)
							], 42, _hoisted_4);
						}), 128)), createBaseVNode("button", {
							class: "tab-add-btn",
							onClick: handleOpenLocalShell,
							title: unref(t)("app.newLocalShell")
						}, [..._cache[13] || (_cache[13] = [createBaseVNode("i", { class: "bi bi-plus" }, null, -1)])], 8, _hoisted_8)], 32)) : createCommentVNode("", true),
						createBaseVNode("div", _hoisted_9, [unref(store).tabs.length > 0 ? (openBlock(true), createElementBlock(Fragment, { key: 0 }, renderList(unref(store).tabs, (tab) => {
							return openBlock(), createElementBlock("div", {
								key: tab.id,
								class: normalizeClass(["terminal-pane", { active: tab.id === unref(store).activeTabId }])
							}, [tab.id === unref(store).activeTabId || unref(renderedTabs).has(tab.id) ? (openBlock(), createBlock(terminal_tab_default, {
								key: 0,
								ref_for: true,
								ref: (el) => setTermRef(tab.id, el),
								tabId: tab.id,
								connection: getConnection(tab.connectionId),
								active: tab.id === unref(store).activeTabId,
								onStatusChange: (s, sid) => handleStatusChange(tab.id, s, sid),
								onOpenAiSettings: openAISettings
							}, null, 8, [
								"tabId",
								"connection",
								"active",
								"onStatusChange"
							])) : createCommentVNode("", true)], 2);
						}), 128)) : (openBlock(), createElementBlock("div", _hoisted_10, [
							_cache[16] || (_cache[16] = createBaseVNode("i", { class: "bi bi-terminal" }, null, -1)),
							createBaseVNode("div", _hoisted_11, toDisplayString(unref(t)("app.emptyTitle")), 1),
							createBaseVNode("div", _hoisted_12, toDisplayString(unref(t)("app.emptyDesc")), 1),
							createBaseVNode("div", _hoisted_13, [createBaseVNode("button", {
								class: "btn-empty-action",
								onClick: _cache[6] || (_cache[6] = ($event) => openEditor())
							}, [_cache[14] || (_cache[14] = createBaseVNode("i", { class: "bi bi-plus" }, null, -1)), createTextVNode(toDisplayString(unref(t)("app.addConnection")), 1)]), createBaseVNode("button", {
								class: "btn-empty-action btn-empty-success",
								onClick: _cache[7] || (_cache[7] = ($event) => handleOpenLocalShell())
							}, [_cache[15] || (_cache[15] = createBaseVNode("i", { class: "bi bi-terminal" }, null, -1)), createTextVNode(toDisplayString(unref(t)("app.openLocalShell")), 1)])])
						]))])
					]),
					createVNode(connection_editor_default, {
						ref_key: "connectionEditorRef",
						ref: connectionEditorRef,
						onSaved: handleEditorSaved
					}, null, 512),
					createVNode(ai_settings_default, {
						ref_key: "aiSettingsRef",
						ref: aiSettingsRef
					}, null, 512),
					showBatchPanel.value ? (openBlock(), createElementBlock("div", {
						key: 0,
						class: "batch-modal-overlay",
						onClick: _cache[9] || (_cache[9] = withModifiers(($event) => showBatchPanel.value = false, ["self"]))
					}, [createBaseVNode("div", _hoisted_14, [createBaseVNode("div", _hoisted_15, [createBaseVNode("h4", null, [_cache[17] || (_cache[17] = createBaseVNode("i", { class: "bi bi-hdd-rack" }, null, -1)), createTextVNode(" " + toDisplayString(unref(t)("batch.title")), 1)]), createBaseVNode("button", {
						class: "btn-close-modal",
						onClick: _cache[8] || (_cache[8] = ($event) => showBatchPanel.value = false)
					}, [..._cache[18] || (_cache[18] = [createBaseVNode("i", { class: "bi bi-x-lg" }, null, -1)])])]), createBaseVNode("div", _hoisted_16, [createVNode(batch_panel_default, {
						ref_key: "batchPanelRef",
						ref: batchPanelRef
					}, null, 512)])])])) : createCommentVNode("", true),
					contextMenuVisible.value ? (openBlock(), createElementBlock("div", {
						key: 1,
						class: "tab-context-menu",
						style: normalizeStyle({
							left: contextMenuX.value + "px",
							top: contextMenuY.value + "px"
						}),
						onClick: _cache[10] || (_cache[10] = withModifiers(() => {}, ["stop"]))
					}, [
						createBaseVNode("div", {
							class: "tab-context-menu-item",
							onClick: handleCloneTab
						}, [_cache[19] || (_cache[19] = createBaseVNode("i", { class: "bi bi-copy" }, null, -1)), createTextVNode(toDisplayString(unref(t)("tab.clone")), 1)]),
						createBaseVNode("div", {
							class: "tab-context-menu-item",
							onClick: handleRenameFromContext
						}, [_cache[20] || (_cache[20] = createBaseVNode("i", { class: "bi bi-pencil" }, null, -1)), createTextVNode(toDisplayString(unref(t)("tab.rename")), 1)]),
						_cache[24] || (_cache[24] = createBaseVNode("div", { class: "tab-context-menu-divider" }, null, -1)),
						createBaseVNode("div", {
							class: "tab-context-menu-item",
							onClick: handleCloseFromContext
						}, [_cache[21] || (_cache[21] = createBaseVNode("i", { class: "bi bi-x" }, null, -1)), createTextVNode(toDisplayString(unref(t)("tab.close")), 1)]),
						createBaseVNode("div", {
							class: "tab-context-menu-item",
							onClick: handleCloseOtherFromContext
						}, [_cache[22] || (_cache[22] = createBaseVNode("i", { class: "bi bi-x-circle" }, null, -1)), createTextVNode(toDisplayString(unref(t)("tab.closeOther")), 1)]),
						createBaseVNode("div", {
							class: "tab-context-menu-item",
							onClick: handleCloseAllFromContext
						}, [_cache[23] || (_cache[23] = createBaseVNode("i", { class: "bi bi-x-square" }, null, -1)), createTextVNode(toDisplayString(unref(t)("tab.closeAll")), 1)])
					], 4)) : createCommentVNode("", true)
				]);
			};
		}
	});
}));
//#endregion
//#region src/views/index.vue?vue&type=style&index=0&scoped=1c14a0a5&lang.css
var init_index_vue_vue_type_style_index_0_scoped_1c14a0a5_lang = __esmMin((() => {}));
//#endregion
//#region src/views/index.vue
var views_default;
//#endregion
__esmMin((() => {
	init_index_vue_vue_type_script_setup_true_lang();
	init_index_vue_vue_type_script_setup_true_lang();
	init_index_vue_vue_type_style_index_0_scoped_1c14a0a5_lang();
	init__plugin_vue_export_helper();
	views_default = /*#__PURE__*/ _plugin_vue_export_helper_default(index_vue_vue_type_script_setup_true_lang_default, [["__scopeId", "data-v-1c14a0a5"]]);
}))();
export { views_default as default };
