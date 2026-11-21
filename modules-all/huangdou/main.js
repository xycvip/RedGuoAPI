const baseUrl = "https://ferncider.cc";
const sites = [baseUrl, "https://onyxripple.cc", "https://reeflumen.cc", "https://niniharbor.top", "https://halomeadow.top", "https://larksummit.icu"];
const maxBodyBytes = 20 * 1024 * 1024;
const sourceIdPattern = /^[a-zA-Z0-9_-]{1,100}$/;
const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

function trim(value) {
  return String(value).replace(/^[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/g, "");
}

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hostname(value) {
  value = trim(value).toLowerCase();
  const scheme = value.indexOf("://");
  if (scheme >= 0) value = value.slice(scheme + 3);
  value = value.replace(/^\/\//, "").split(/[/?#]/)[0];
  value = value.slice(value.lastIndexOf("@") + 1);
  const port = value.lastIndexOf(":");
  return (port >= 0 ? value.slice(0, port) : value).replace(/\.$/, "");
}

function knownHost(value) {
  return sites.some((site) => hostname(site) === hostname(value));
}

function text(row, ...keys) {
  if (!record(row)) return "";
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && trim(value) !== "") return trim(value);
    if (typeof value === "boolean" || typeof value === "number") return String(value);
  }
  return "";
}

function first(...values) {
  return values.map(trim).find((value) => value !== "") || "";
}

function integer(value, fallback) {
  value = trim(value);
  if (!/^[+-]?\d+$/.test(value)) return fallback;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : fallback;
}

function list(value) {
  if (Array.isArray(value)) return value.filter(record);
  if (record(value)) {
    for (const key of ["list", "items", "data"]) {
      const rows = list(value[key]);
      if (rows.length > 0) return rows;
    }
  }
  return [];
}

function dataMap(value) {
  return record(value) ? record(value.data) ? value.data : value : {};
}

function tagsOf(row) {
  const result = [];
  const add = (value) => {
    value = trim(value);
    if (value !== "" && !result.includes(value)) result.push(value);
  };
  if (typeof row.tags === "string") row.tags.split(/[,/，、]/).forEach(add);
  else if (Array.isArray(row.tags)) {
    for (const value of row.tags) {
      if (record(value)) {
        const name = text(value, "name", "title", "label", "tag");
        if (name !== "") add(name);
      } else add(value === null ? "<nil>" : Array.isArray(value) ? "[" + value.join(" ") + "]" : value);
    }
  }
  return result.length > 0 ? result : null;
}

function vipEpisodes(row) {
  if (!record(row) || !Array.isArray(row.vip_episodes)) return [];
  return row.vip_episodes.map((value) => trim(value) === String(value) ? integer(value, 0) : 0).filter((value) => value > 0 && value <= 10000);
}

function vipFlag(row) {
  let known = null;
  for (const key of ["is_vip", "isVip"]) {
    const value = text(row, key).toLowerCase();
    if (["true", "1", "y"].includes(value)) return true;
    if (["false", "0", "n"].includes(value)) known = false;
  }
  const pay = text(row, "pay_type").toLowerCase();
  if (pay === "vip") return true;
  if (pay === "free") known = false;
  if (vipEpisodes(row).length > 0) return true;
  if (list(record(row) ? row.episodes : null).some((episode) => text(episode, "type").toLowerCase() === "vip")) return true;
  return known;
}

function episodeVIP(detail, episode, sequence) {
  const type = text(episode, "type").toLowerCase();
  if (type === "vip") return true;
  if (type === "free") return false;
  if (vipEpisodes(detail).includes(sequence)) return true;
  const flag = vipFlag(episode);
  if (flag !== null) return flag;
  if (text(detail, "pay_type").toLowerCase() === "vip") {
    const free = integer(text(detail, "free_episodes"), -1);
    return free >= 0 && sequence > free;
  }
  return false;
}

function releaseStatus(remark) {
  if (/未完结|更新至|连载/.test(remark)) return "ongoing";
  return /全\s*\d+\s*集|\d+\s*集全|已完结|大结局|完结/.test(remark) ? "finished" : "unknown";
}

function views(value) {
  value = trim(value);
  if (value === "" || value.includes("次播放")) return value;
  if (/[w万]/i.test(value)) return value + "次播放";
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) return value;
  const number = Number(value);
  return number > 0 ? fixedNumber(number) + "次播放" : "";
}

function fixedNumber(value) {
  const parts = String(value).split(/e/i);
  if (parts.length === 1) return parts[0];
  const negative = parts[0][0] === "-";
  const mantissa = negative ? parts[0].slice(1) : parts[0];
  const digits = mantissa.replace(".", "");
  const point = (mantissa.indexOf(".") < 0 ? mantissa.length : mantissa.indexOf(".")) + Number(parts[1]);
  return (negative ? "-" : "") + (point <= 0 ? "0." + "0".repeat(-point) + digits : point >= digits.length ? digits + "0".repeat(point - digits.length) : digits.slice(0, point) + "." + digits.slice(point));
}

function releaseDate(value) {
  value = trim(value);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    const stamp = Date.parse(value.replace(",", "."));
    if (!Number.isNaN(stamp)) value = new Date(stamp + 28800000).toISOString().slice(0, 10);
  }
  for (const match of value.matchAll(/(\d{4})-(\d{1,2})-(\d{1,2})/g)) {
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) continue;
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCMonth() === month - 1 ? [match[1], String(month).padStart(2, "0"), String(day).padStart(2, "0")].join("-") : "";
  }
  return "";
}

function dramaFromRow(row) {
  const sourceId = text(row, "id", "drama_id").replace(/^rp_/, "");
  if (sourceId === "") return {};
  const title = first(text(row, "name", "title", "t"), sourceId);
  const cover = text(row, "img_y", "img_x", "img", "cover", "pic");
  const remark = text(row, "update_label", "corner");
  const count = text(row, "episode_count");
  const description = text(row, "description", "summary");
  const drama = {
    id: host.dramaId(sourceId), source: host.source, sourceId, title, name: title,
    desc: description, intro: description, cover, coverUrl: cover,
    categoryName: first(text(row, "category", "category_name", "categoryName"), "未分类"), channelName: "黄豆",
    remark: remark || (count === "" ? "" : "全" + count + "集"),
    totalEpisode: count, episodeCount: count, releaseStatus: releaseStatus(remark),
    heat: text(row, "hot_rate"), views: views(text(row, "click")), onlineDate: releaseDate(text(row, "issue_date")),
  };
  const vip = vipFlag(row), tags = tagsOf(row);
  if (vip !== null) drama.vip = vip;
  if (tags !== null) drama.tags = tags;
  return drama;
}

function concat(...parts) {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function hmac(key, data) {
  if (key.length > 64) key = host.sha256(key);
  const inner = new Uint8Array(64), outer = new Uint8Array(64);
  for (let index = 0; index < 64; index++) {
    inner[index] = (key[index] || 0) ^ 0x36;
    outer[index] = (key[index] || 0) ^ 0x5c;
  }
  return host.sha256(concat(outer, host.sha256(concat(inner, data))));
}

function requestKey(requestId) {
  return hmac(host.utf8Encode("7961beb44246e3012ce228d6b5ced05a"), host.hexDecode(requestId.replace(/-/g, "")));
}

function pad(data) {
  const size = 16 - data.length % 16;
  const padding = new Uint8Array(size);
  padding.fill(size);
  return concat(data, padding);
}

function unpad(data) {
  if (data.length === 0 || data.length % 16 !== 0) throw new Error("invalid pkcs7 length");
  const size = data[data.length - 1];
  if (size === 0 || size > 16 || size > data.length) throw new Error("invalid pkcs7 padding");
  for (let index = data.length - size; index < data.length; index++) {
    if (data[index] !== size) throw new Error("invalid pkcs7 padding bytes");
  }
  return data.subarray(0, data.length - size);
}

function decodeJson(value) {
  JSON.parse(value);
  let encoded = "", quoted = false, escaped = false;
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (quoted) {
      encoded += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') {
      quoted = true;
      encoded += character;
    } else if (character === "-" || character >= "0" && character <= "9") {
      let end = index + 1;
      while (end < value.length && /[0-9eE+.\-]/.test(value[end])) end++;
      encoded += JSON.stringify(value.slice(index, end));
      index = end - 1;
    } else encoded += character;
  }
  return JSON.parse(encoded);
}

function decodeResponse(blob, key) {
  if (blob.length > maxBodyBytes) throw new Error("黄豆响应过大");
  try { return decodeJson(host.utf8Decode(blob)); } catch (error) {}
  if (blob.length < 32) throw new Error("huangdou response too short");
  if ((blob.length - 16) % 16 !== 0) throw new Error("huangdou ciphertext is not block aligned");
  let plain = unpad(host.aesCbcDecrypt(key, blob.subarray(0, 16), blob.subarray(16)));
  if (plain.length >= 2 && plain[0] === 31 && plain[1] === 139) plain = host.gunzip(plain);
  try { return decodeJson(host.utf8Decode(plain)); } catch (error) { throw new Error("黄豆响应格式异常"); }
}

function newClient() {
  const id = host.hexEncode(host.randomBytes(16));
  const preferred = host.cacheGet("preferred-site") || host.preferredSite();
  return { site: knownHost(preferred) ? preferred : baseUrl, sessionId: id, deviceId: id };
}

function apiError(code, message) {
  const error = new Error(message + (["813004", "813005", "813006", "813103"].includes(code) ? "（站点返回权限类错误码 " + code + "，已停止自动重试）" : ""));
  error.api = true;
  return error;
}

function callOnce(client, path, data, timeoutMs) {
  const raw = host.hexEncode(host.randomBytes(16));
  const requestId = [raw.slice(0, 8), raw.slice(8, 12), raw.slice(12, 16), raw.slice(16, 20), raw.slice(20)].join("-");
  const key = requestKey(requestId), iv = host.randomBytes(16);
  const encoded = JSON.stringify({ data, deviceId: client.deviceId, token: "" }).replace(/[<>&\u2028\u2029]/g, (value) => "\\u" + value.charCodeAt(0).toString(16).padStart(4, "0"));
  const body = concat(iv, host.aesCbcEncrypt(key, iv, pad(host.gzip(host.utf8Encode(encoded)))));
  const address = client.site.replace(/\/+$/, "") + "/api" + path;
  const ticket = host.reserve({ url: address });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const sign = host.hexEncode(host.sha256(host.utf8Encode(["Dart", client.sessionId, requestId, timestamp, path].join("|"))));
  const request = {
    method: "POST", url: address, body, binary: true, ticket, limit: maxBodyBytes, timeoutMs, followRedirects: true, anyStatus: true,
    headers: {
      "User-Agent": userAgent, Accept: "*/*", Origin: client.site, Referer: client.site + "/home",
      "Content-Type": "application/octet-stream", version: "2.0.0", deviceType: "web",
      requestId, sessionId: client.sessionId, time: timestamp, sign: sign + "-" + timestamp,
    },
  };
  const response = host.fetch(request);
  if (response.status < 200 || response.status >= 300) {
    const message = Array.from(trim(host.utf8Decode(response.body)));
    throw new Error("huangdou HTTP " + response.status + ": " + message.slice(0, 200).join("") + (message.length > 200 ? "..." : ""));
  }
  const decoded = decodeResponse(response.body, key);
  if (record(decoded)) {
    const status = text(decoded, "status");
    if (status !== "" && status !== "y") throw apiError(text(decoded, "errorCode", "error_code", "code"), "黄豆接口拒绝请求: " + first(text(decoded, "msg", "message", "error"), status));
  }
  host.cacheSet("preferred-site", client.site, 0);
  return decoded;
}

function call(client, path, data) {
  if (typeof host.gzip !== "function") throw new Error("黄豆需要小果影视 2.0.3 或更高版本，请先更新应用");
  path = "/" + path.replace(/^\/+/, "");
  let lastError;
  for (let attempt = 0; attempt < sites.length; attempt++) {
    try { return callOnce(client, path, data, attempt === 0 ? 12000 : 8000); }
    catch (error) {
      if (error.api) throw error;
      lastError = error;
      const index = sites.findIndex((site) => hostname(site) === hostname(client.site));
      client.site = sites[(index + 1) % sites.length];
    }
  }
  throw new Error("黄豆站点连接失败：已尝试 " + sites.length + " 个域名，最后错误：" + lastError.message);
}

function detailRow(id) {
  if (!sourceIdPattern.test(id)) throw new Error("无效的黄豆剧集 ID");
  return host.exclusive(() => {
    const cached = host.cacheGet("detail:" + id);
    if (cached !== null) return decodeJson(cached);
    const row = dataMap(call(newClient(), "/drama/detail", { id }));
    if (text(row, "id", "drama_id").replace(/^rp_/, "") !== id) throw new Error("黄豆详情返回了其他剧集");
    let keys = JSON.parse(host.cacheGet("detail-keys") || "[]");
    if (keys.length >= 128) {
      for (const key of keys) host.cacheSet("detail:" + key, null, 0);
      keys = [];
    }
    host.cacheSet("detail:" + id, JSON.stringify(row), 300000);
    if (!keys.includes(id)) keys.push(id);
    host.cacheSet("detail-keys", JSON.stringify(keys), 0);
    return row;
  });
}

function chaptersOf(row, id) {
  const episodes = list(row.episodes);
  let count = integer(first(text(row, "episode_count"), text(row, "free_episodes")), episodes.length);
  if (count <= 0) count = episodes.length;
  if (count <= 0 || count > 10000) throw new Error("黄豆返回了无效集数: " + count);
  const chapters = (episodes.length > 0 ? episodes : Array.from({ length: count }, () => ({}))).map((episode, index) => {
    let sequence = integer(text(episode, "seq", "episode", "ep"), index + 1);
    if (sequence <= 0) sequence = index + 1;
    return {
      id: host.chapterId(id, String(sequence)), source: host.source,
      title: first(text(episode, "name", "title"), "第" + sequence + "集"),
      currentEpisode: sequence, vip: episodeVIP(row, episode, sequence),
    };
  });
  chapters.sort((a, b) => a.currentEpisode - b.currentEpisode || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const seen = new Set();
  return chapters.filter((chapter) => seen.has(chapter.id) ? false : (seen.add(chapter.id), true));
}

function unescapeHtml(value) {
  const root = host.parseHtml("<span>" + value.replace(/</g, "&lt;") + "</span>");
  const collect = (node) => (node.text || "") + (node.children || []).map(collect).join("");
  return collect(root);
}

function resolveUrl(site, value) {
  value = trim(unescapeHtml(value)).replace(/\\\//g, "/");
  if (value === "") return "";
  if (value.startsWith("//")) return "https:" + value;
  try { return host.resolveUrl(site + "/", value).replace(/^http:/, "https:"); }
  catch (error) { return value; }
}

function httpUrl(value) {
  try {
    const parsed = host.parseUrl(trim(value));
    return ["https", "http"].includes(parsed.scheme) && parsed.hostname !== "" && !parsed.userInfo;
  } catch (error) { return false; }
}

function previewOnly(row, media, site) {
  if (["true", "1", "y"].includes(text(row, "is_preview", "isPreview").toLowerCase())) return true;
  const preview = text(row, "preview_m3u8", "preview_url");
  if (preview !== "" && (media === "" || resolveUrl(site, media) === resolveUrl(site, preview))) return true;
  try { return /(?:^|\/)preview\.(?:mp4|m3u8)$/.test(host.parseUrl(media).path.toLowerCase()); }
  catch (error) { return false; }
}

function episodeString(chapter, fallback) {
  const value = chapter.currentEpisode;
  if (typeof value === "string" && trim(value) !== "") return trim(value);
  if (typeof value === "number" && value > 0) return String(Math.trunc(value));
  return String(fallback);
}

function mergeMetadata(base, extra) {
  for (const key of ["id", "source", "sourceId", "title", "name", "desc", "intro", "cover", "coverUrl", "channelName", "categoryName", "remark", "score", "views", "heat", "onlineDate"]) {
    if (!base[key] || (key === "categoryName" && base[key] === "首页") || (key === "remark" && base[key] === "在线观看")) base[key] = extra[key];
  }
  for (const key of ["totalEpisode", "episodeCount"]) if (!base[key] || base[key] === "0") base[key] = extra[key];
  if (base.vip === undefined && extra.vip !== undefined) base.vip = extra.vip;
  if (!base.tags || base.tags.length === 0) base.tags = extra.tags;
  if (!base.releaseStatus || base.releaseStatus === "unknown") base.releaseStatus = extra.releaseStatus;
  return base;
}

function finishMedia(media) {
  const input = Object.assign({}, media);
  if (input.hlsKey) input.hlsKey = Array.from(host.base64Decode(input.hlsKey));
  const result = JSON.parse(JSON.stringify(host.finishMedia(input)));
  for (const key of ["hlsKey", "cencKey"]) {
    result[key] = result[key] && result[key].length > 0 ? host.base64Encode(result[key]) : null;
  }
  return result;
}

module.exports = {
  validCategory() { return false; },

  categories() { return { items: null, incomplete: true }; },

  catalogPage(page, category) {
    const rows = list(call(newClient(), "/drama/list", { page: String(page), page_size: "30" }));
    return { items: rows.map(dramaFromRow).filter((drama) => drama.id), hasMore: rows.length >= 30 };
  },

  detail(sourceId) {
    const id = trim(sourceId).replace(/^rp_/, "");
    const row = detailRow(id), title = first(text(row, "name", "title", "t"), id);
    const chapters = chaptersOf(row, id);
    let drama = { id: host.dramaId(id), source: host.source, title, name: title };
    try {
      const fresh = dramaFromRow(detailRow(sourceId));
      if (fresh.id === drama.id) {
        drama = fresh;
        if (drama.title === "" || drama.title === "短剧") drama.title = drama.name = title;
      }
    } catch (error) {}
    return { drama, chapters };
  },

  rankingPage(boardId, page) {
    const keys = { "huangdou-all": "all", "huangdou-mogai": "mogai", "huangdou-search": "search", "huangdou-favorite": "favorite", "huangdou-finish": "finish" };
    const row = dataMap(call(newClient(), "/drama/rank", { tab: keys[boardId] || "", page: String(page) }));
    if (!Array.isArray(row.list)) throw new Error("黄豆未返回有效榜单");
    if (row.list.length > 20) throw new Error("黄豆榜单分页格式已变化");
    const seen = new Set();
    const items = row.list.map((item, index) => {
      const id = text(item, "id", "drama_id").replace(/^rp_/, "");
      if (!record(item) || !sourceIdPattern.test(id) || text(item, "name", "title", "t") === "" || seen.has(id)) throw new Error("黄豆榜单包含无效或重复条目");
      seen.add(id);
      const drama = dramaFromRow(item);
      return { rank: (page - 1) * 20 + index + 1, drama, metric: drama.heat === "" ? "" : drama.heat + "热度" };
    });
    return { items, hasMore: row.list.length === 20 };
  },

  resolveMedia(task) {
    const chapter = task.chapter;
    let media = { url: chapter.videoUrl, referer: first(chapter.referer || "", baseUrl + "/") };
    const parts = trim(task.dramaId).split(":");
    const source = trim(parts[0]).toLowerCase();
    const ownSource = source === host.source || ["tideember.cc", "xqjurgek.top"].includes(source) || knownHost(source);
    if (parts.length >= 2 && ownSource && trim(parts.slice(1).join(":")) !== "") {
      const id = trim(parts.slice(1).join(":"));
      const sequence = integer(episodeString(chapter, task.index), 0);
      if (sequence < 1) throw new Error("黄豆集数无效");
      const client = newClient();
      const row = dataMap(call(client, "/drama/play", { id, seq: String(sequence) }));
      let address = text(row, "m3u8", "url", "play_url", "playUrl");
      if (previewOnly(row, address, client.site)) throw new Error("黄豆仅提供试看，未取得该集正片；不会把试看内容当作完整分集");
      if (address === "") {
        address = client.site + "/api/drama/hls/" + encodeURIComponent(id).replace(/%2B/gi, "+").replace(/%3A/gi, ":").replace(/%40/gi, "@") + "/" + sequence + "/play.m3u8?line=free";
        let playlist = "";
        try { playlist = host.fetchText({ url: address, referer: client.site + "/home" }).body; } catch (error) {}
        if (!trim(playlist).startsWith("#EXTM3U")) throw new Error("黄豆未提供有效的播放地址，备用播放列表也不可用");
      }
      address = resolveUrl(client.site, address);
      if (!httpUrl(address)) throw new Error("黄豆播放地址不是 HTTP/HTTPS URL");
      media = { url: address, referer: client.site + "/home" };
      const rawKey = text(row, "hls_key");
      if (rawKey !== "") {
        if (!/^[a-fA-F0-9]{32}$/.test(rawKey)) throw new Error("黄豆返回了无效的 HLS 密钥");
        media.hlsKey = host.base64Encode(host.hexDecode(rawKey));
      }
      const durationText = text(row, "duration");
      const duration = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(durationText) ? Number(durationText) : NaN;
      if (duration > 0) media.durationMs = Math.trunc(duration * 1000);
    }
    return finishMedia(media);
  },

  coverAddress(drama, id) {
    const fresh = dramaFromRow(detailRow(id));
    if (fresh.id !== drama.id) throw new Error("黄豆详情与请求剧集不符");
    const cover = fresh.cover.startsWith("//") ? "https:" + fresh.cover : fresh.cover;
    return httpUrl(cover) ? cover : "";
  },

  coverReferer(address) {
    try {
      const parsed = host.parseUrl(address);
      if (knownHost(parsed.hostname)) return parsed.scheme + "://" + parsed.host + "/home";
    } catch (error) {}
    return (host.cacheGet("preferred-site") || host.preferredSite() || baseUrl) + "/home";
  },

  needsExtraMetadata(drama) { return !drama.heat || drama.vip === null || drama.vip === undefined; },

  extraMetadata(drama, id) {
    let raw = dramaFromRow(detailRow(id));
    if (raw.heat === "" && !drama.heat) {
      const rows = list(call(newClient(), "/drama/list", { keywords: first(raw.title, drama.title), page: "1", page_size: "50" }));
      for (const candidate of rows) {
        if (text(candidate, "id", "drama_id").replace(/^rp_/, "") === id) {
          raw = mergeMetadata(dramaFromRow(candidate), raw);
          break;
        }
      }
    }
    return raw.id === drama.id ? raw : null;
  },
};
