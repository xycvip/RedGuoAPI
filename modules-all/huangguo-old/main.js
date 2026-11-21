const frontend = "https://d2pypzndaqisk.cloudfront.net";
const frontendHost = "d2pypzndaqisk.cloudfront.net";
const defaultAPIBase = "https://dr6skssi3nxbk.cloudfront.net";
const apiHosts = [defaultAPIBase, "https://d18ka9rqpfd3lo.cloudfront.net", "https://d37n0wjehmw08f.cloudfront.net"];
const defaultCDN = "https://sjljsla.lkkwip.cn";
const userAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1";
const baseXUserAgent = "BuildID=com.abc.Butterfly;SysType=ios;DevID=00000000000000000000000000000;Ver=1.0.0;DevType=iPhone;DeviceBrand=APPLE;DeviceModel=iPhone;SystemName=iOS;SystemVersion=18.7;Terminal=1;IsH5=1;Sid=00000000000000000000000000000000";
const sessionFile = "huangguo-session.json";
const pageSize = 30;
const requestAttempts = 2;
const failureWindowMs = 60000;
const protocolMaxAgeMs = 86400000;
const zeroTime = "0001-01-01T00:00:00Z";
const invalidPlaylistMessage = "站源未返回有效的播放列表，链接可能已失效";
const goSpaces = /^[\t\n\v\f\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\t\n\v\f\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/g;
const episodePattern = /(?:第[\t\n\f\r ]*0*(\d+)[\t\n\f\r ]*(?:集|话|期)|(?:更新至|共|全)[\t\n\f\r ]*0*(\d+)[\t\n\f\r ]*(?:集|话|期)|(?:episode|ep)[\t\n\f\r ]*#?[\t\n\f\r ]*0*(\d+))/i;
const finishedRemark = /(?:全[\t\n\f\r ]*\d+[\t\n\f\r ]*集|\d+[\t\n\f\r ]*集全|已完结|大结局)/;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function goTrim(value) {
  return String(value).replace(goSpaces, "");
}

function stringField(value) {
  return typeof value === "string" ? value : "";
}

function firstNonEmpty() {
  for (let index = 0; index < arguments.length; index++) {
    const text = typeof arguments[index] === "string" ? goTrim(arguments[index]) : "";
    if (text !== "") return text;
  }
  return "";
}

function byteLength(value) {
  return host.utf8Encode(value).length;
}

function truncate(value, limit) {
  const text = goTrim(value);
  const characters = Array.from(text);
  return characters.length <= limit ? text : characters.slice(0, limit).join("") + "...";
}

function mapString(record) {
  for (let index = 1; index < arguments.length; index++) {
    const key = arguments[index];
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
    const value = record[key];
    if (typeof value === "string") {
      if (goTrim(value) !== "") return goTrim(value);
    } else if (typeof value === "boolean" || typeof value === "number") {
      return String(value);
    }
  }
  return "";
}

function mapStringSlice(record, key) {
  const result = [];
  const add = (raw) => {
    const text = goTrim(raw);
    if (text !== "" && result.indexOf(text) < 0) result.push(text);
  };
  const value = record[key];
  if (typeof value === "string") {
    for (const part of value.split(/[,/，、]/)) add(part);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      if (isRecord(item)) {
        const name = mapString(item, "name", "title", "label", "tag");
        if (name !== "") add(name);
      } else {
        add(item === null ? "<nil>" : String(item));
      }
    }
  }
  return result.length ? result : null;
}

function escapeComponent(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (character) => "%" + character.charCodeAt(0).toString(16).toUpperCase());
}

function pathEscape(value) {
  return escapeComponent(value).replace(/%(24|26|2B|3A|3D|40)/g, (sequence, code) => String.fromCharCode(parseInt(code, 16)));
}

function queryEscape(value) {
  return escapeComponent(value).replace(/%20/g, "+");
}

function tryParseUrl(raw) {
  try { return host.parseUrl(raw); } catch (error) { return null; }
}

function queryValue(rawQuery, name) {
  for (const part of rawQuery.split("&")) {
    if (part === "" || part.indexOf(";") >= 0) continue;
    const separator = part.indexOf("=");
    const rawKey = separator < 0 ? part : part.slice(0, separator);
    const rawValue = separator < 0 ? "" : part.slice(separator + 1);
    try {
      if (decodeURIComponent(rawKey.replace(/\+/g, " ")) !== name) continue;
      return decodeURIComponent(rawValue.replace(/\+/g, " "));
    } catch (error) {
      continue;
    }
  }
  return "";
}

function htmlUnescape(value) {
  const named = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };
  return value.replace(/&(?:#([0-9]+)|#[xX]([0-9a-fA-F]+)|(amp|lt|gt|quot|apos));?/g, (match, decimal, hex, name) => {
    if (name) return named[name];
    const code = decimal ? parseInt(decimal, 10) : parseInt(hex, 16);
    return code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) ? String.fromCodePoint(code) : "\ufffd";
  });
}

function resolveProviderURL(base, ref) {
  let text = goTrim(htmlUnescape(ref));
  if (text === "") return "";
  text = text.split("\\/").join("/");
  if (text.startsWith("//")) return "https:" + text;
  const parsed = tryParseUrl(text);
  if (!parsed) return text;
  if (parsed.scheme) return parsed.scheme === "http" ? "https" + parsed.href.slice(4) : parsed.href;
  let resolved;
  try { resolved = host.resolveUrl(base, text); } catch (error) { return text; }
  return resolved.startsWith("http:") ? "https" + resolved.slice(4) : resolved;
}

function isHTTPMediaURL(raw) {
  const parsed = tryParseUrl(goTrim(raw));
  return !!parsed && (parsed.scheme === "http" || parsed.scheme === "https") && parsed.hostname !== "" && !parsed.userInfo;
}

function timeMs(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(text);
  if (!match) return NaN;
  const date = new Date(0);
  date.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setUTCHours(Number(match[4]), Number(match[5]), Number(match[6]), match[7] ? Math.floor(Number("0." + match[7]) * 1000) : 0);
  const offset = match[8] === "Z" ? 0 : (match[9] === "-" ? -1 : 1) * (Number(match[10]) * 60 + Number(match[11])) * 60000;
  return date.getTime() - offset;
}

function jsonKind(value) {
  if (Array.isArray(value)) return "array";
  if (typeof value === "boolean") return "bool";
  return typeof value;
}

function codeText(value) {
  return value === undefined ? "" : JSON.stringify(value).replace(/^"+|"+$/g, "");
}

function apiError(code, message) {
  const error = new Error("黄果 API 错误 " + code + ": " + message);
  error.apiCode = code;
  return error;
}

function concatBytes() {
  let length = 0;
  for (let index = 0; index < arguments.length; index++) length += arguments[index].length;
  const result = new Uint8Array(length);
  let offset = 0;
  for (let index = 0; index < arguments.length; index++) {
    result.set(arguments[index], offset);
    offset += arguments[index].length;
  }
  return result;
}

function pkcs7Pad(value) {
  const padding = 16 - value.length % 16;
  const result = new Uint8Array(value.length + padding);
  result.set(value);
  result.fill(padding, value.length);
  return result;
}

function pkcs7Unpad(value) {
  if (value.length === 0 || value.length % 16 !== 0) throw new Error("invalid pkcs7 length");
  const padding = value[value.length - 1];
  if (padding === 0 || padding > 16 || padding > value.length) throw new Error("invalid pkcs7 padding");
  for (let index = value.length - padding; index < value.length; index++) {
    if (value[index] !== padding) throw new Error("invalid pkcs7 padding bytes");
  }
  return value.slice(0, value.length - padding);
}

function encryptParam(params, access) {
  const plain = pkcs7Pad(host.utf8Encode(JSON.stringify(params)));
  return host.base64Encode(host.aesCbcEncrypt(host.utf8Encode(access.paramKey), host.utf8Encode(access.paramIV), plain));
}

function decryptResponse(value, interfaceKey) {
  const packed = host.base64Decode(goTrim(value).replace(/[\r\n]/g, ""));
  if (packed.length < 12) throw new Error("encrypted payload too short");
  const combined = concatBytes(host.utf8Encode(interfaceKey), packed.slice(0, 12));
  const half = combined.length >> 1;
  const salt = host.sha256(combined).slice(8, 24);
  const first = host.sha256(concatBytes(salt, combined.slice(0, half)));
  const second = host.sha256(concatBytes(combined.slice(half), salt));
  const key = concatBytes(first.slice(0, 8), second.slice(8, 24), first.slice(24));
  const vector = concatBytes(second.slice(0, 4), first.slice(12, 20), second.slice(28));
  const sealed = packed.slice(12);
  if (sealed.length % 16 !== 0) throw new Error("ciphertext is not block aligned");
  return pkcs7Unpad(sealed.length ? host.aesCbcDecrypt(key, vector, sealed) : sealed);
}

function hashEnabled(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = goTrim(value.toLowerCase());
    return normalized !== "" && normalized !== "false" && normalized !== "0" && normalized !== "null";
  }
  return true;
}

function validToken(token) {
  return byteLength(token) <= 4096 && !/[\r\n\t ]/.test(token);
}

function validProtocol(protocol) {
  return byteLength(protocol.interfaceKey) > 0 && byteLength(protocol.interfaceKey) <= 512 && byteLength(protocol.paramKey) === 16 && byteLength(protocol.paramIV) === 16;
}

function parseProtocol(script) {
  const value = (name) => {
    const match = new RegExp("[\"']" + name + "[\"'][\\t\\n\\f\\r ]*[:,][\\t\\n\\f\\r ]*[\"']([^\"'\\\\\\r\\n]+)[\"']").exec(script);
    return match ? match[1] : "";
  };
  const protocol = { interfaceKey: value("interfaceKey"), paramKey: value("parameterKey"), paramIV: value("parameterIv") };
  if (!validProtocol(protocol)) throw new Error("黄果官网协议已变化，无法识别当前接口参数");
  return protocol;
}

function emptySession() {
  return { version: 1, scope: defaultAPIBase, deviceId: "", token: "", protocol: { interfaceKey: "", paramKey: "", paramIV: "" }, updatedAt: zeroTime };
}

function optionalString(value) {
  return value === undefined || value === null || typeof value === "string";
}

function loadSession() {
  let raw = "";
  try { raw = host.loadState(sessionFile); } catch (error) { return emptySession(); }
  if (!raw || byteLength(raw) > 16384) return emptySession();
  let state;
  try { state = JSON.parse(raw); } catch (error) { return emptySession(); }
  if (!isRecord(state)) return emptySession();
  const protocol = state.protocol === undefined || state.protocol === null ? {} : state.protocol;
  if (!isRecord(protocol) || !optionalString(protocol.interfaceKey) || !optionalString(protocol.paramKey) || !optionalString(protocol.paramIV)) return emptySession();
  if (!optionalString(state.scope) || !optionalString(state.deviceId) || !optionalString(state.token) || !optionalString(state.updatedAt)) return emptySession();
  if (typeof state.updatedAt === "string" && isNaN(timeMs(state.updatedAt))) return emptySession();
  const token = state.token || "";
  if (state.version !== 1 || state.scope !== defaultAPIBase || !/^[A-Fa-f0-9]{16}[0-9]{13}$/.test(state.deviceId || "") || !validToken(token)) return emptySession();
  return {
    version: 1, scope: defaultAPIBase, deviceId: state.deviceId, token,
    protocol: { interfaceKey: protocol.interfaceKey || "", paramKey: protocol.paramKey || "", paramIV: protocol.paramIV || "" },
    updatedAt: state.updatedAt || zeroTime,
  };
}

function saveSession(state) {
  try { host.saveState(sessionFile, JSON.stringify(state)); } catch (error) { host.log("黄果访客会话未能保存，本次会话仍可使用"); }
}

function sessionState() {
  const cached = host.cacheGet("state");
  return cached !== null ? JSON.parse(cached) : loadSession();
}

function frontendScript() {
  const page = host.fetchText({ url: frontend + "/", referer: frontend + "/" }).body;
  const pattern = /<script\b[^>]*\bsrc=["']([^"']+)["']/gi;
  let match;
  while ((match = pattern.exec(page)) !== null) {
    const source = match[1];
    if (source.indexOf("/main-") < 0 || !source.endsWith(".js")) continue;
    const assetURL = resolveProviderURL(frontend + "/", source);
    const asset = tryParseUrl(assetURL);
    if (!asset || asset.hostname !== frontendHost) continue;
    return host.fetchText({ url: assetURL, referer: frontend + "/" }).body;
  }
  throw new Error("黄果官网未提供可识别的接口脚本");
}

function bootstrap(state) {
  let protocol = state.protocol;
  if (!validProtocol(protocol) || Date.now() - timeMs(state.updatedAt) > protocolMaxAgeMs) {
    let script;
    try { script = frontendScript(); } catch (error) { throw new Error("获取黄果官网协议失败: " + error.message); }
    protocol = parseProtocol(script);
    state.protocol = protocol;
    state.updatedAt = new Date().toISOString();
  }
  const access = { interfaceKey: protocol.interfaceKey, paramKey: protocol.paramKey, paramIV: protocol.paramIV, token: "", deviceId: "", anonymous: true };
  if (!validProtocol(access)) throw new Error("黄果 API 协议配置无效，请更新应用后重试");
  if (state.deviceId === "") state.deviceId = host.hexEncode(host.randomBytes(8)).toUpperCase() + String(Date.now());
  access.deviceId = state.deviceId;
  access.token = state.token;
  if (access.token === "") {
    let payload;
    try {
      payload = legacyRequest("POST", "/api/app/mine/login/h5", { devID: access.deviceId, isAppStore: false, sysType: "ios" }, access);
    } catch (error) {
      throw new Error("黄果访客登录失败: " + error.message);
    }
    let login = null;
    try { login = JSON.parse(payload); } catch (error) { login = null; }
    const token = isRecord(login) && typeof login.token === "string" ? login.token : "";
    if (token === "" || !validToken(token)) throw new Error("黄果访客登录未返回有效令牌");
    access.token = token;
    state.token = token;
  }
  saveSession(state);
  return access;
}

function credentials() {
  const cached = host.cacheGet("access");
  if (cached !== null) return JSON.parse(cached);
  return host.exclusive(() => {
    const current = host.cacheGet("access");
    if (current !== null) return JSON.parse(current);
    const failure = host.cacheGet("accessError");
    if (failure !== null) throw new Error(failure);
    const state = sessionState();
    try {
      const access = bootstrap(state);
      host.cacheSet("state", JSON.stringify(state), 0);
      host.cacheSet("access", JSON.stringify(access), 0);
      return access;
    } catch (error) {
      host.cacheSet("state", JSON.stringify(state), 0);
      host.cacheSet("accessError", error.message, failureWindowMs);
      throw error;
    }
  });
}

function invalidateToken(access) {
  host.exclusive(() => {
    const current = host.cacheGet("access");
    if (!access.anonymous || current === null || JSON.parse(current).token !== access.token) return;
    const state = sessionState();
    state.token = "";
    host.cacheSet("state", JSON.stringify(state), 0);
    host.cacheSet("access", null, 0);
    host.cacheSet("accessError", null, 0);
  });
}

function xUserAgent(access) {
  if (access.deviceId === "") return baseXUserAgent;
  return baseXUserAgent.replace("DevID=00000000000000000000000000000", "DevID=" + access.deviceId);
}

function probeAPIHost(base) {
  const response = host.fetch({ method: "GET", url: base + "/api/app/ping/check", headers: { "User-Agent": userAgent }, limit: 65536, timeoutMs: 4000, followRedirects: true, anyStatus: true });
  let healthy = false;
  try {
    const payload = JSON.parse(response.body);
    healthy = isRecord(payload) && payload.code === 200;
  } catch (error) {
    healthy = false;
  }
  if (response.status !== 200 || !healthy) throw new Error(host.parseUrl(base).hostname + " API 健康检查失败 (HTTP " + response.status + ")");
}

function discoverAPIHosts() {
  const script = frontendScript();
  const pattern = /https:\/\/[a-z0-9]+\.cloudfront\.net/g;
  const found = [];
  let match;
  while ((match = pattern.exec(script)) !== null) {
    if (match[0] !== frontend && found.indexOf(match[0]) < 0) {
      found.push(match[0]);
      if (found.length === 8) break;
    }
  }
  const listed = found.filter((address) => apiHosts.indexOf(address) >= 0);
  if (listed.length === 0) throw new Error("官网前端未提供可识别的 API 地址，请稍后重试或更新应用");
  return listed;
}

function apiEndpoint() {
  const saved = host.cacheGet("apiBase");
  if (saved !== null) return saved;
  const tried = {};
  let lastError = null;
  let candidates = apiHosts;
  for (let pass = 0; pass < 2; pass++) {
    if (pass === 1) {
      try { candidates = discoverAPIHosts(); } catch (error) { lastError = error; break; }
    }
    for (const candidate of candidates) {
      if (tried[candidate] || host.cacheGet("apiFailure:" + candidate) !== null) continue;
      tried[candidate] = true;
      try { probeAPIHost(candidate); } catch (error) { lastError = error; continue; }
      host.cacheSet("apiBase", candidate, 0);
      return candidate;
    }
  }
  throw new Error("黄果原 API 的候选域名均不可用: " + (lastError ? lastError.message : "%!w(<nil>)"));
}

function resetAPIEndpoint(failed) {
  host.cacheSet("apiFailure:" + failed, "1", failureWindowMs);
  if (host.cacheGet("apiBase") === failed) host.cacheSet("apiBase", null, 0);
}

function readEnvelope(body, access) {
  let envelope;
  try { envelope = JSON.parse(body); } catch (error) { return { retry: error }; }
  if (envelope === null) envelope = {};
  if (!isRecord(envelope)) return { retry: new Error("json: cannot unmarshal " + jsonKind(envelope) + " into Go value of type apiEnvelope") };
  if (!optionalString(envelope.msg)) return { retry: new Error("json: cannot unmarshal " + jsonKind(envelope.msg) + " into Go struct field apiEnvelope.msg of type string") };
  const code = codeText(envelope.code);
  if (code !== "" && code !== "null" && code !== "200" && code !== "0") {
    let message = firstNonEmpty(envelope.msg, "请检查访问配置或刷新登录凭证");
    if (access.token !== "") message = message.split(access.token).join("[已隐藏]");
    throw apiError(truncate(code, 20), truncate(message, 160));
  }
  const present = Object.prototype.hasOwnProperty.call(envelope, "data");
  let payload = present ? JSON.stringify(envelope.data) : "";
  if (hashEnabled(envelope.hash) && present) {
    const data = envelope.data;
    if (data !== null && typeof data !== "string") return { retry: new Error("json: cannot unmarshal " + jsonKind(data) + " into Go value of type string") };
    try { payload = host.utf8Decode(decryptResponse(data === null ? "" : data, access.interfaceKey)); } catch (error) { return { retry: error }; }
  }
  if (payload === "" || payload === "null") throw new Error("黄果 API 未返回数据，请检查登录凭证或接口是否变更");
  return { payload };
}

function legacyRequest(method, apiPath, params, access) {
  let lastError = null;
  for (let attempt = 1; attempt <= requestAttempts; attempt++) {
    if (attempt > 1) host.sleep(attempt * 1000);
    let path = apiPath;
    let body = "";
    if (params !== null) {
      const encrypted = encryptParam(params, access);
      if (method === "GET") path += (path.indexOf("?") >= 0 ? "&" : "?") + "data=" + queryEscape(encrypted);
      else body = JSON.stringify({ data: encrypted });
    }
    const base = apiEndpoint();
    const headers = { Accept: "application/json", temp: "test", "X-User-Agent": xUserAgent(access), Origin: frontend, Referer: frontend + "/", "User-Agent": userAgent };
    if (access.token !== "") headers.Authorization = access.token;
    if (body !== "") headers["Content-Type"] = "application/json";
    let response;
    try {
      response = host.fetch({ method, url: base + path, headers, body, limit: 20 * 1024 * 1024, timeoutMs: 12000, followRedirects: true });
    } catch (error) {
      lastError = error;
      const status = Number(error && error.status) || 0;
      if (error && error.oversized) throw new Error("API 响应过大");
      if (status === 0) {
        if (error && error.backoff) throw error;
        resetAPIEndpoint(base);
      } else if (status >= 500) {
        resetAPIEndpoint(base);
      } else if (status >= 400) {
        throw error;
      }
      continue;
    }
    const outcome = readEnvelope(response.body, access);
    if (outcome.retry) {
      lastError = outcome.retry;
      continue;
    }
    return outcome.payload;
  }
  throw lastError;
}

function fetchAPI(apiPath, params) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const access = credentials();
    let payload;
    try {
      payload = legacyRequest("GET", apiPath, params, access);
    } catch (error) {
      if (attempt === 0 && access.anonymous && error && error.apiCode === "5005") {
        invalidateToken(access);
        continue;
      }
      throw error;
    }
    return JSON.parse(payload);
  }
  throw new Error("黄果访客登录已失效，请稍后重试");
}

function validCategory(category) {
  return typeof category === "string" && goTrim(category) === category;
}

function validNativeCategory(category) {
  if (category === "") return true;
  if (byteLength(category) > 128 || /[|/\\\u0000\r\n]/.test(category)) return false;
  return validCategory(category);
}

function coverPathFromAny(value) {
  if (typeof value === "string") {
    const text = goTrim(value);
    if (text === "") return "";
    if (text.startsWith("//")) return "https:" + text;
    if (text.startsWith("/api/ui/image")) {
      const parsed = tryParseUrl(text);
      if (parsed) {
        const raw = goTrim(queryValue(parsed.query, "url"));
        if (raw !== "") return raw;
      }
    }
    const parsed = tryParseUrl(text);
    if (parsed && parsed.scheme) return parsed.href;
    return text.replace(/^\/+/, "");
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = coverPathFromAny(item);
      if (found !== "") return found;
    }
    return "";
  }
  if (isRecord(value)) {
    for (const key of ["url", "src", "path", "cover", "coverUrl", "cover_url", "image", "pic", "poster"]) {
      const found = coverPathFromAny(value[key]);
      if (found !== "") return found;
    }
  }
  return "";
}

function legacyCoverURL(value) {
  let address = goTrim(coverPathFromAny(value));
  if (address === "") return "";
  if (address.startsWith("//")) address = "https:" + address;
  const parsed = tryParseUrl(address);
  if (!parsed || parsed.userInfo) return "";
  if (parsed.scheme) return (parsed.scheme === "http" || parsed.scheme === "https") && parsed.hostname !== "" ? address : "";
  if (address.indexOf("..") >= 0 || address.indexOf("://") >= 0) return "";
  address = address.replace(/^\/+/, "");
  if (address.startsWith("upload/") || address.startsWith("upload_01/")) return "https://pic.zdmhyg.cn/" + address;
  return "https://zzzznnn.lkkwip.cn/" + address;
}

function firstCover(record, keys) {
  for (const key of keys) {
    const address = legacyCoverURL(record[key]);
    if (address !== "") return address;
  }
  return "";
}

function releaseStatusFromRemark(remark) {
  if (remark.indexOf("未完结") >= 0 || remark.indexOf("更新至") >= 0 || remark.indexOf("连载") >= 0) return "ongoing";
  if (finishedRemark.test(remark) || remark.indexOf("完结") >= 0) return "finished";
  return "unknown";
}

function episodeIndex(text, fallback) {
  const match = episodePattern.exec(text);
  if (match) {
    for (let index = 1; index < match.length; index++) {
      if (match[index] && Number(match[index]) > 0) return Number(match[index]);
    }
  }
  return fallback;
}

function episodeNumber(chapter, fallback) {
  const value = chapter.currentEpisode;
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string") return episodeIndex(value, fallback);
  return episodeIndex(stringField(chapter.title), fallback);
}

function episodeString(chapter, fallback) {
  const value = chapter.currentEpisode;
  if (typeof value === "string" && goTrim(value) !== "") return goTrim(value);
  if (typeof value === "number" && value > 0) return String(Math.trunc(value));
  return String(fallback);
}

function uniqueChapters(chapters) {
  const seen = {};
  const result = [];
  chapters.forEach((chapter, index) => {
    const key = stringField(chapter.id) || stringField(chapter.videoUrl) || "idx_" + index;
    if (seen[key]) return;
    seen[key] = true;
    result.push(chapter);
  });
  return result;
}

function sortChapters(chapters) {
  return chapters.map((chapter, position) => ({ chapter, position, number: episodeNumber(chapter, position + 1) })).sort((left, right) => {
    if (left.number !== right.number) return left.number - right.number;
    if (left.chapter.id !== right.chapter.id) return left.chapter.id < right.chapter.id ? -1 : 1;
    return left.position - right.position;
  }).map((entry) => entry.chapter);
}

function parseTabs(raw) {
  const list = Array.isArray(raw) ? raw : isRecord(raw) && Array.isArray(raw.list) ? raw.list : [];
  return list.filter(isRecord).map((tab) => ({ id: stringField(tab.id), name: stringField(tab.name) }));
}

function tagList(record) {
  const names = mapStringSlice(record, "tagNames");
  if (names) return names;
  const tags = (mapStringSlice(record, "tags") || []).filter((tag) => !/^[0-9a-f]{24}$/i.test(tag));
  return tags.length ? tags : null;
}

function categories() {
  const tabs = parseTabs(fetchAPI("/api/app/playlet-tab/all", null));
  const result = tabs.filter((tab) => validNativeCategory(tab.id) && tab.id !== "" && tab.name !== "");
  return result.length ? result : null;
}

function catalogDrama(item, tab) {
  const drama = Object.assign({}, item);
  drama.sourceId = item.id;
  drama.source = host.source;
  drama.id = host.dramaId(item.id);
  drama.channelName = tab.name;
  drama.tags = tagList(item);
  drama.categoryName = firstNonEmpty(item.categoryName, item.category_name, item.category, tab.name);
  const cover = firstCover(item, ["coverUrl", "cover_url", "cover", "imageUrl", "image_url", "image", "img", "pic", "picture", "poster", "thumb", "thumbnail"]);
  if (cover !== "") {
    drama.cover = cover;
    drama.coverUrl = cover;
  }
  return drama;
}

function catalogPage(page, category) {
  const tabs = parseTabs(fetchAPI("/api/app/playlet-tab/all", null));
  if (tabs.length === 0) throw new Error("黄果旧 API 未返回可用分类");
  const seen = {};
  const items = [];
  const failures = [];
  let hasMore = false;
  for (const tab of tabs) {
    if (tab.id === "" || category !== "" && category !== tab.id) continue;
    let result;
    try {
      result = fetchAPI("/api/app/playlet/home/tab/" + pathEscape(tab.id), { pageNumber: String(page), pageSize: String(pageSize), tabSortType: "1" });
    } catch (error) {
      failures.push(tab.name + ": " + error.message);
      hasMore = true;
      continue;
    }
    const list = isRecord(result) && Array.isArray(result.list) ? result.list : [];
    hasMore = hasMore || list.length >= pageSize;
    for (const item of list) {
      if (!isRecord(item) || typeof item.id !== "string" || item.id === "" || seen[item.id]) continue;
      seen[item.id] = true;
      items.push(catalogDrama(item, tab));
    }
  }
  if (category !== "" && !tabs.some((tab) => tab.id === category)) throw new Error("此分类已调整，请刷新分类列表");
  return { items: items.length ? items : null, hasMore, warning: failures.join("\n") };
}

function detailDrama(fields, sourceID) {
  const drama = {
    id: host.dramaId(sourceID), source: host.source, sourceId: sourceID,
    title: stringField(fields.title), name: stringField(fields.name),
    desc: mapString(fields, "desc", "description", "summary"), intro: mapString(fields, "intro"),
    categoryName: mapString(fields, "categoryName", "category_name", "typeName", "type_name", "sortName", "sort_name", "category"),
    heat: mapString(fields, "heat"), views: mapString(fields, "views", "play_count"),
    onlineDate: mapString(fields, "onlineDate", "online_date", "issue_date"),
    tags: tagList(fields),
    releaseStatus: mapString(fields, "releaseStatus", "release_status") || releaseStatusFromRemark(mapString(fields, "remark")),
  };
  for (const key of ["cover", "coverUrl", "cover_url", "image", "imageUrl", "image_url", "img", "pic", "picture", "poster", "thumb", "thumbnail",
    "totalEpisode", "total_episode", "episodeCount", "episode_count", "chapterCount", "chapter_count", "total", "episodes"]) {
    if (fields[key] !== undefined) drama[key] = fields[key];
  }
  if (typeof fields.vip === "boolean") drama.vip = fields.vip;
  const cover = firstCover(drama, ["coverUrl", "cover_url", "cover", "imageUrl", "image_url", "image", "img", "pic", "poster"]);
  if (cover !== "") {
    drama.cover = cover;
    drama.coverUrl = cover;
  }
  return drama;
}

function detail(sourceID) {
  const raw = fetchAPI("/api/app/playlet/detail/" + pathEscape(sourceID), null);
  const fields = isRecord(raw) ? raw : {};
  let chapters = Array.isArray(fields.chapters) ? fields.chapters.filter(isRecord) : [];
  if (chapters.length === 0) {
    const listed = fetchAPI("/api/app/playlet-chapter/list/" + pathEscape(sourceID), null);
    if (!Array.isArray(listed)) throw new Error("json: cannot unmarshal " + jsonKind(listed) + " into Go value of type []core.Chapter");
    chapters = listed.filter(isRecord);
  }
  chapters = uniqueChapters(chapters).map((chapter, index) => {
    const value = Object.assign({}, chapter);
    value.source = host.source;
    value.id = host.chapterId(sourceID, firstNonEmpty(chapter.id, String(index + 1)));
    value.referer = frontend + "/";
    if (episodeNumber(value, 0) <= 0) value.currentEpisode = index + 1;
    value.title = firstNonEmpty(chapter.title, "第" + episodeString(value, index + 1) + "集");
    return value;
  });
  chapters = sortChapters(chapters);
  const id = mapString(fields, "id");
  if (id !== "" && id !== sourceID && id !== host.dramaId(sourceID)) throw new Error("黄果旧版详情与请求剧集不符");
  return { drama: detailDrama(fields, sourceID), chapters: chapters.length ? chapters : null };
}

function playlistExpired(error, address) {
  if (!error || error.message !== invalidPlaylistMessage) return false;
  let envelope;
  try {
    const response = host.fetch({ method: "GET", url: address, headers: { Referer: frontend + "/", "User-Agent": userAgent }, limit: 65536, timeoutMs: 12000, followRedirects: true, anyStatus: true });
    envelope = JSON.parse(response.body);
  } catch (failure) {
    return false;
  }
  if (envelope === null) envelope = {};
  return isRecord(envelope) && optionalString(envelope.msg) && codeText(envelope.code) === "5005";
}

function resolveMedia(task) {
  const chapter = isRecord(task) && isRecord(task.chapter) ? task.chapter : {};
  const videoURL = stringField(chapter.videoUrl);
  if (videoURL === "") throw new Error("此分集没有可用的播放地址");
  for (let attempt = 0; attempt < 2; attempt++) {
    const access = credentials();
    const base = apiEndpoint();
    let address = videoURL;
    if (!isHTTPMediaURL(address)) {
      address = base + "/api/app/vid/h5/m3u8/" + pathEscape(address.replace(/^\/+|\/+$/g, "")) + "?c=" + queryEscape(defaultCDN) + "&token=" + queryEscape(access.token);
    }
    let result;
    try {
      result = host.fetchPlaylist({ url: address, referer: frontend + "/" });
    } catch (error) {
      if (attempt === 0 && access.anonymous && playlistExpired(error, address)) {
        invalidateToken(access);
        continue;
      }
      throw error;
    }
    return { url: result.url, playlist: result.playlist, referer: frontend + "/", durationMs: result.durationMs };
  }
  throw new Error("黄果旧 API 的播放会话已失效，请稍后重试");
}

function coverAddress(drama, sourceID) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(sourceID)) throw new Error("无效的黄果剧集 ID");
  const raw = fetchAPI("/api/app/playlet/detail/" + pathEscape(sourceID), null);
  const fields = isRecord(raw) ? raw : {};
  const id = stringField(fields.id);
  if (id !== "" && id !== sourceID && id !== stringField(drama && drama.id)) throw new Error("黄果详情与请求剧集不符");
  const address = firstCover(fields, ["cover", "coverUrl", "cover_url", "image", "imageUrl", "image_url", "img", "pic", "picture", "poster", "thumb", "thumbnail"]);
  if (address !== "") return address;
  throw new Error("详情暂未返回海报地址");
}

module.exports = { validCategory, categories, catalogPage, detail, resolveMedia, coverAddress };
