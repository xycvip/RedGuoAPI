// 潮流AV 模块 · 原作者 TNJKL · 1.0.9
const SITES = [
  "https://mjv011.com",
  "https://mjv001.com",
  "https://mjv012.com",
  "https://mjv009.com",
  "https://mjv002.com",
  "https://mjv013.com",
  "https://mjv010.com",
  "https://mjv003.com",
  "https://mjv004.com",
  "https://mjv005.com",
  "https://mjv006.com",
  "https://mjv007.com",
  "https://mjv008.com",
  "https://mjv014.com",
  "https://mjv015.com",
];

const CATS = [
  { id: "chinese" },
  { id: "censored" },
  { id: "uncensored" },
  { id: "reducing-mosaic" },
  { id: "amateurjav" },
  { id: "dt" },
  { id: "animation" },
  { id: "CensoredAnimation" },
  { id: "UncensoredAnimation" },
  { id: "tdAnimation" },
];

const GATE_PATHS = [
  "/zh/chinese_IamOverEighteenYearsOld/19/index.html",
  "/zh/chinese_IamOverEighteenYearsOld/19/",
  "/zh/censored_IamOverEighteenYearsOld/19/index.html",
];

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

function loadState() {
  let st = {};
  try {
    st = JSON.parse(host.loadState("session") || "{}") || {};
  } catch (e) {
    st = {};
  }
  return {
    site: st.site || SITES[0],
    cookie: st.cookie || "YES_Eighteen=IamOverEighteenYearsOld",
    siteIdx: Number(st.siteIdx) || 0,
    gateIdx: Number(st.gateIdx) || 0,
  };
}

function saveState(st) {
  try {
    host.saveState(
      "session",
      JSON.stringify({
        site: st.site,
        cookie: st.cookie,
        siteIdx: st.siteIdx,
        gateIdx: st.gateIdx,
      })
    );
  } catch (e) {}
}

function switchSite(st) {
  st.siteIdx = (st.siteIdx + 1) % SITES.length;
  st.site = SITES[st.siteIdx];
  st.gateIdx = 0;
  saveState(st);
}

function jarMerge(st, raw) {
  if (!raw) return;
  const lines = Array.isArray(raw) ? raw : String(raw).split(/,(?=\s*[A-Za-z0-9_\-]+=)/);
  const jar = {};
  String(st.cookie || "")
    .split(";")
    .forEach((kv) => {
      const i = kv.indexOf("=");
      if (i > 0) jar[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
    });
  for (let i = 0; i < lines.length; i++) {
    const m = String(lines[i]).match(/^\s*([A-Za-z0-9_\-]+)=([^;]*)/);
    if (m) jar[m[1]] = m[2];
  }
  if (!jar.YES_Eighteen) jar.YES_Eighteen = "IamOverEighteenYearsOld";
  st.cookie = Object.keys(jar)
    .map((k) => k + "=" + jar[k])
    .join("; ");
}

function isAgeGate(body) {
  const s = String(body || "");
  if (!s) return false;
  if (s.indexOf("scale_content") >= 0) return true;
  if (s.length < 8000 && (s.indexOf("IamOverEighteenYearsOld") >= 0 || s.indexOf("Eighteen_declaration") >= 0)) {
    return true;
  }
  return false;
}

function looksOffsite(body) {
  const s = String(body || "");
  if (!s || s.length < 400) return false;
  if (isAgeGate(s)) return false;
  const hasSite =
    s.indexOf("_content/") >= 0 ||
    s.indexOf("_list/") >= 0 ||
    s.indexOf("mvarr") >= 0 ||
    s.indexOf("application/ld+json") >= 0 ||
    /class=['"]post/i.test(s) ||
    s.indexOf("chinese_list") >= 0 ||
    s.indexOf("fc_search") >= 0 ||
    s.indexOf("play.php") >= 0 ||
    s.indexOf("numresolution") >= 0 ||
    s.indexOf("jfun_show") >= 0;
  if (hasSite) return false;
  const adHeavy =
    /mavrtracktor|popads|popcash|exoclick|juicyads|propellerads|adsterra|clickadu/i.test(s) ||
    (/window\.location\s*=\s*['"]https?:\/\//i.test(s) && s.length < 3000) ||
    (/<meta[^>]+http-equiv=['"]refresh['"]/i.test(s) && s.length < 3000);
  return adHeavy;
}

function passGate(st, gateBody) {
  const s = String(gateBody || "");
  const links = [];
  const re = /window\.location\s*=\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(s))) {
    let path = m[1];
    if (!/IamOverEighteenYearsOld/i.test(path)) continue;
    const hm = path.match(/^https?:\/\/[^/]+(\/.*)$/i);
    if (hm) path = hm[1];
    if (path.charAt(0) === "/") links.push(path);
  }
  const list = links.concat(GATE_PATHS);
  const max = Math.min(list.length, 2);
  for (let i = 0; i < max; i++) {
    const path = list[(st.gateIdx + i) % list.length];
    st.gateIdx++;
    try {
      const res = host.fetch({
        url: st.site + path,
        method: "GET",
        headers: baseHeaders(st, st.site + "/"),
        timeoutMs: 10000,
        anyStatus: true,
        followRedirects: true,
      });
      if (res && res.headers) jarMerge(st, res.headers["set-cookie"] || res.headers["Set-Cookie"] || "");
      const body = String((res && res.body) || "");
      if (body && !isAgeGate(body) && !looksOffsite(body)) {
        saveState(st);
        return true;
      }
    } catch (e) {}
  }
  saveState(st);
  return false;
}

function baseHeaders(st, referer) {
  return {
    "User-Agent": UA,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Upgrade-Insecure-Requests": "1",
    Referer: referer || st.site + "/",
    Cookie: st.cookie || "YES_Eighteen=IamOverEighteenYearsOld",
  };
}

function stripTags(s) {
  return String(s == null ? "" : s)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unesc(s) {
  return stripTags(
    String(s == null ? "" : s)
      .replace(/&amp;?/g, "&")
      .replace(/&lt;?/g, "<")
      .replace(/&gt;?/g, ">")
      .replace(/&quot;?/g, '"')
      .replace(/&#0?39;?/g, "'")
      .replace(/&nbsp;?/g, " ")
  );
}

function abs(st, u) {
  const s = String(u == null ? "" : u).trim();
  if (!s) return "";
  if (s.startsWith("//")) return "https:" + s;
  if (/^https?:/i.test(s)) return s;
  if (s.startsWith("/")) return st.site + s;
  return st.site + "/" + s;
}

function relPath(path) {
  if (!path) return "/";
  if (/^https?:/i.test(path)) {
    try {
      const u = host.parseUrl(path);
      return (u && u.path) || "/";
    } catch (e) {
      return "/";
    }
  }
  return path.charAt(0) === "/" ? path : "/" + path;
}

function getHtml(st, path, referer, maxRetries) {
  const MAX = Math.max(0, Number(maxRetries));
  let lastMsg = "";
  for (let n = 0; n <= MAX; n++) {
    if (n > 0) switchSite(st);
    const tryPath = relPath(path);
    const url = st.site + tryPath;
    let res;
    try {
      res = host.fetch({
        url: url,
        method: "GET",
        headers: baseHeaders(st, referer || st.site + "/"),
        timeoutMs: 12000,
        anyStatus: true,
        followRedirects: true,
        limit: 6 * 1024 * 1024,
      });
      if (res && res.headers) jarMerge(st, res.headers["set-cookie"] || res.headers["Set-Cookie"] || "");
    } catch (e) {
      lastMsg = String((e && e.message) || e);
      continue;
    }
    const body = String((res && res.body) || "");
    if (!res) {
      lastMsg = "无响应";
      continue;
    }
    if (res.blocked) {
      lastMsg = "拦截页";
      continue;
    }
    if (res.status === 404) throw new Error("页面不存在（可能已下架）");
    if (res.status === 403 || res.status === 503 || res.status === 429) {
      lastMsg = "HTTP " + res.status;
      continue;
    }
    if (res.status >= 400) {
      lastMsg = "HTTP " + res.status;
      continue;
    }
    if (!body) {
      lastMsg = "内容为空";
      continue;
    }
    if (isAgeGate(body)) {
      passGate(st, body);
      lastMsg = "年龄门";
      try {
        res = host.fetch({
          url: st.site + tryPath,
          method: "GET",
          headers: baseHeaders(st, referer || st.site + "/"),
          timeoutMs: 12000,
          anyStatus: true,
          followRedirects: true,
          limit: 6 * 1024 * 1024,
        });
        if (res && res.headers) jarMerge(st, res.headers["set-cookie"] || res.headers["Set-Cookie"] || "");
        const body2 = String((res && res.body) || "");
        if (body2 && !res.blocked && !isAgeGate(body2) && !looksOffsite(body2) && res.status === 200) {
          saveState(st);
          return body2;
        }
      } catch (e) {}
      continue;
    }
    if (looksOffsite(body)) {
      lastMsg = "广告跳板";
      continue;
    }
    saveState(st);
    return body;
  }
  throw new Error("连不上潮流AV" + (lastMsg ? "（" + lastMsg + "）" : ""));
}

function listUrl(type, page) {
  return "/zh/" + type + "_list/all/" + (page > 1 ? page : 1) + ".html";
}

function parseList(st, html) {
  const s = String(html || "");
  const out = [];
  const seen = {};
  const parts = s.split(/<div\s+class=['"]post/i);
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i].slice(0, 2600);
    let hm = seg.match(
      /href=["'](?:https?:)?\/\/[^"']*?\/zh\/([A-Za-z0-9\-]+)_content\/(\d+)\/([^"'\/?#]+?)\.html/i
    );
    if (!hm) hm = seg.match(/href=["']\/?zh\/([A-Za-z0-9\-]+)_content\/(\d+)\/([^"'\/?#]+?)\.html/i);
    if (!hm) continue;
    const id = hm[1] + "_content/" + hm[2] + "/" + hm[3];
    if (seen[id]) continue;
    seen[id] = 1;
    let title = "";
    let tm = seg.match(/<h3[^>]*>[\s\S]{0,200}?<a[^>]*>([\s\S]{1,400}?)<\/a>/i);
    if (!tm) tm = seg.match(/<h3[^>]*>([\s\S]{1,400}?)<\/h3>/i);
    if (tm) title = unesc(tm[1]);
    if (!title) title = hm[3].replace(/-/g, " ");
    let cover = "";
    const imgTag = seg.match(/<img[^>]*>/i);
    if (imgTag) {
      const cm = imgTag[0].match(/(?:data-original|data-src|src)=['"]([^'"]+)['"]/i);
      if (cm) cover = abs(st, cm[1]);
    }
    out.push({
      id: host.dramaId(id),
      source: host.source,
      sourceId: id,
      title: title,
      name: title,
      cover: cover,
      coverUrl: cover,
      channelName: "潮流AV",
      totalEpisode: 1,
      episodeCount: 1,
    });
  }
  return out;
}

function lastPage(html, prefix) {
  let max = 1;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escaped + "/(\\d+)\\.html", "gi");
  let m;
  while ((m = re.exec(String(html || "")))) {
    const n = Number(m[1]);
    if (n > max) max = n;
  }
  return max;
}

function ldInfo(html) {
  const m = String(html || "").match(
    /<script[^>]*type=['"]application\/ld\+json['"][^>]*>([\s\S]*?)<\/script>/i
  );
  if (!m) return {};
  try {
    const data = JSON.parse(m[1]);
    if (Array.isArray(data)) {
      for (let i = 0; i < data.length; i++) {
        if (data[i] && data[i].name) return data[i];
      }
      return data[0] || {};
    }
    return data || {};
  } catch (e) {
    return {};
  }
}

function metaField(html, label) {
  const re = new RegExp(
    label + "[\\s\\S]{0,80}?<[^>]+>([^<]{1,80})<\\/a>|" + label + "[\\s\\S]{0,40}?[:：]\\s*([^<\\n]{1,80})",
    "i"
  );
  const m = String(html || "").match(re);
  return m ? unesc(m[1] || m[2] || "") : "";
}

function parseConsts(html) {
  const s = String(html || "");
  const out = { key: "0123456789abcdef", iv: "0123456789abcdef", base: 11, xor: 18 };
  const keyM =
    s.match(/argdeqweqweqwe\s*=\s*['"]([0-9a-f]{16})['"]/i) ||
    s.match(/hdddedd252\s*=\s*['"]([0-9a-f]{16})['"]/i);
  const ivM =
    s.match(/hdddedg252\s*=\s*['"]([0-9a-f]{16})['"]/i) ||
    s.match(/argdeqweqweqww\s*=\s*['"]([0-9a-f]{16})['"]/i);
  const baseM = s.match(/hcdeedg252\s*=\s*(\d+)/i);
  const xorM = s.match(/hadeedg252\s*=\s*(\d+)/i);
  if (keyM) out.key = keyM[1];
  if (ivM) out.iv = ivM[1];
  if (baseM) out.base = Number(baseM[1]);
  if (xorM) out.xor = Number(xorM[1]);
  if (out.base > 25) out.base = out.base % 25;
  if (out.base < 2) out.base = 11;
  return out;
}

// 增强版：兼容数组/对象写法，过滤空数组，提取最长密文
function parseMvarr(html) {
  const s = String(html || "");
  const out = [];
  const seen = {};

  // 数组形式 mvarr['10_1'] = [ ... '密文' ... ]
  const reArr = /mvarr\[(['"]?)([\w.]+)\1\]\s*=\s*\[([\s\S]*?)\];/g;
  let m;
  while ((m = reArr.exec(s))) {
    const key = m[2];
    if (seen[key]) continue;
    const body = (m[3] || "").trim();
    if (!body) continue;
    let enc = "";
    const sr = /['"]([0-9A-Za-z+/=]{16,})['"]/g;
    let sm;
    while ((sm = sr.exec(body))) {
      if (/^[0-9A-Za-z]+$/.test(sm[1]) && sm[1].length >= 20) {
        if (!enc || sm[1].length > enc.length) enc = sm[1];
      }
    }
    if (!enc) continue;
    seen[key] = 1;
    let res = 720;
    if (/1080/.test(key) || /1080/.test(body)) res = 1080;
    else if (/480/.test(key)) res = 480;
    out.push({ key: key, enc: enc, res: res });
  }

  // 对象形式
  const reObj = /mvarr\[(['"]?)([\w.]+)\1\]\s*=\s*\{([\s\S]*?)\};/g;
  while ((m = reObj.exec(s))) {
    const key = m[2];
    if (seen[key]) continue;
    const body = m[3] || "";
    let enc = "";
    const sr = /['"]([0-9A-Za-z+/=]{16,})['"]/g;
    let sm;
    while ((sm = sr.exec(body))) {
      if (/^[0-9A-Za-z]+$/.test(sm[1]) && sm[1].length >= 20) {
        enc = sm[1];
        break;
      }
    }
    if (!enc) continue;
    seen[key] = 1;
    const resM = body.match(/numresolution=(\d+)/);
    out.push({ key: key, enc: enc, res: resM ? Number(resM[1]) : 1080 });
  }
  return out;
}

// 从页面画质按钮推断有几条线路（仅用于展示，无密文仍不可播）
function parseQualityHints(html) {
  const s = String(html || "");
  const out = [];
  const seen = {};
  // jfun_show_vfcz_1080p / jfun_show_mvinnerHTML('10_1')
  const re = /jfun_show_vfcz_(\d+)p\s*\(\)\s*\{[^}]*jfun_show_mvinnerHTML\(\s*['"]([\w.]+)['"]\s*\)/gi;
  let m;
  while ((m = re.exec(s))) {
    const res = Number(m[1]);
    const key = m[2];
    if (seen[key]) continue;
    seen[key] = 1;
    out.push({ key: key, res: res, enc: "" });
  }
  out.sort((a, b) => b.res - a.res);
  return out;
}

function decrypto(enc, base, xor) {
  base = 25 >= base ? base : base % 25;
  if (base < 2) base = 11;
  const sep = String.fromCharCode(base + 97);
  const parts = String(enc).split(sep);
  let out = "";
  for (let i = 0; i < parts.length; i++) {
    const v = parseInt(parts[i], base);
    if (!isFinite(v)) return "";
    const ch = (v ^ xor) & 0xff;
    if (ch < 32 || ch > 126) return "";
    out += String.fromCharCode(ch);
  }
  return out;
}

function decodePlayId(enc, consts) {
  const candidates = [];
  const primary = decrypto(enc, consts.base, consts.xor);
  if (primary && /^[A-Za-z0-9+/]+={0,2}$/.test(primary)) candidates.push(primary);
  for (let base = 2; base <= 25; base++) {
    for (let xor = 0; xor <= 32; xor++) {
      const t = decrypto(enc, base, xor);
      if (t && t.length >= 16 && /^[A-Za-z0-9+/]+={0,2}$/.test(t) && candidates.indexOf(t) < 0) {
        candidates.push(t);
        if (candidates.length >= 12) break;
      }
    }
    if (candidates.length >= 12) break;
  }
  const keyBytes = host.utf8Encode(consts.key);
  const ivBytes = host.utf8Encode(consts.iv);
  for (let i = 0; i < candidates.length; i++) {
    try {
      const raw = host.base64Decode(candidates[i]);
      let dec = host.aesCbcDecrypt(keyBytes, ivBytes, raw);
      const arr = Array.from(dec);
      if (arr.length) {
        const pad = arr[arr.length - 1];
        if (pad > 0 && pad <= 16 && pad <= arr.length) arr.length -= pad;
      }
      const plain = host.utf8Decode(new Uint8Array(arr));
      const id = String(plain || "").replace(/[^A-Za-z0-9\-_.]/g, "");
      if (id.length >= 12) return id;
    } catch (e) {}
  }
  throw new Error("播放地址解密失败");
}

function parseSources(st, html) {
  const s = String(html || "");
  const out = [];
  const seen = {};
  const re =
    /src:\s*['"]([^'"]+?\.(?:m3u8|mp4)[^'"]*)['"]\s*(?:,\s*type:\s*['"][^'"]*['"]\s*)?(?:,\s*size:\s*(\d+))?/gi;
  let m;
  while ((m = re.exec(s))) {
    if (seen[m[1]]) continue;
    seen[m[1]] = 1;
    out.push({ url: abs(st, m[1]), size: m[2] ? Number(m[2]) : 0 });
  }
  if (!out.length) {
    const re2 = /(https?:\/\/[^'"\s<>]+?\.(?:m3u8|mp4)[^'"\s<>]*)/gi;
    while ((m = re2.exec(s))) {
      if (seen[m[1]]) continue;
      seen[m[1]] = 1;
      out.push({ url: m[1], size: 0 });
    }
  }
  return out;
}

function sourceIdFromTask(task) {
  const prefix = host.source + ":";
  let id = "";
  if (task && task.dramaId && String(task.dramaId).indexOf(prefix) === 0) {
    id = String(task.dramaId).slice(prefix.length).trim();
  }
  if (!id && task && task.chapter && task.chapter.videoUrl) {
    const vu = String(task.chapter.videoUrl);
    const bar = vu.indexOf("|");
    id = bar > 0 ? vu.slice(0, bar) : vu;
  }
  return String(id || "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.html$/, "");
}

function lineKeyFromTask(task) {
  if (task && task.chapter && task.chapter.videoUrl) {
    const vu = String(task.chapter.videoUrl);
    const bar = vu.indexOf("|");
    if (bar > 0) return vu.slice(bar + 1);
  }
  return "";
}

function validCategory(category) {
  if (!category || category === "" || category === "home" || category === "all") return true;
  return CATS.some((c) => c.id === category);
}

function categoryNames(html) {
  const names = {};
  const re =
    /<a[^>]+href=["'][^"']*?\/zh\/([A-Za-z0-9\-]+)_random\/all\/index\.html["'][^>]*>([\s\S]{0,120}?)<\/a>/gi;
  let m;
  while ((m = re.exec(String(html || "")))) {
    const id = m[1];
    if (names[id]) continue;
    const text = unesc(m[2]).split(/[,，、]/)[0].trim();
    if (text) names[id] = text;
  }
  return names;
}

function categories(force) {
  if (!force) {
    try {
      const cached = JSON.parse(host.cacheGet("categories") || "null");
      if (Array.isArray(cached) && cached.length) return cached;
    } catch (e) {}
  }
  let names = {};
  try {
    const st = loadState();
    names = categoryNames(getHtml(st, listUrl("chinese", 1), st.site + "/", 1));
  } catch (e) {
    names = {};
  }
  const items = CATS.map((c) => ({ id: c.id, name: names[c.id] || c.id }));
  try {
    host.cacheSet("categories", JSON.stringify(items), 12 * 60 * 60 * 1000);
  } catch (e) {}
  return items;
}

function catalogPage(page, category) {
  const st = loadState();
  page = Math.max(1, Number(page) || 1);
  let type = String(category || "chinese").trim();
  if (!validCategory(type) || type === "home" || type === "all") type = "chinese";
  const html = getHtml(st, listUrl(type, page), st.site + "/", 1);
  const items = parseList(st, html);
  const max = lastPage(html, "_list/all");
  return {
    items: items,
    page: page,
    hasMore: page < max,
    totalPage: max,
  };
}

function search(page, query) {
  const st = loadState();
  page = Math.max(1, Number(page) || 1);
  const q = String(query || "").trim();
  if (!q) return { items: [], page: 1, hasMore: false };
  const encoded = encodeURIComponent(q).replace(/%20/g, "+");
  const path = "/zh/fc_search/all/" + encoded + "/" + page + ".html";
  const html = getHtml(st, path, st.site + "/", 1);
  const items = parseList(st, html);
  const max = lastPage(html, "fc_search/all/" + encoded);
  return {
    items: items,
    page: page,
    hasMore: page < max,
    totalPage: max,
  };
}

function detail(sourceId) {
  const st = loadState();
  const path = String(sourceId || "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.html$/, "");
  if (!path) throw new Error("缺少影片 id");
  const pageUrl = st.site + "/zh/" + path + ".html";
  const html = getHtml(st, "/zh/" + path + ".html", st.site + "/", 1);
  const ld = ldInfo(html);
  let title = unesc(ld.name || "");
  if (!title) {
    const h1 = html.match(/<h1[^>]*>([\s\S]{1,300}?)<\/h1>/i);
    title = unesc(h1 ? h1[1] : path.split("/").pop());
  }
  const cover = abs(st, ld.thumbnailUrl || "");
  const code = metaField(html, "番號") || "";
  const descLines = [];
  if (ld.description) descLines.push(unesc(ld.description));
  const maker = metaField(html, "發行商");
  const studio = metaField(html, "製作商");
  if (maker && maker !== "未知") descLines.push("發行商：" + maker);
  if (studio && studio !== "未知") descLines.push("製作商：" + studio);

  // 单部作品只显示 1 集。1080P/720P 是同一内容的不同画质，不能拆成两集。
  const lines = parseMvarr(html);
  const hasSource = lines.some(function (l) {
    return l && l.enc;
  });
  const hints = parseQualityHints(html);

  if (!hasSource) {
    if (hints.length > 0) {
      descLines.unshift(
        "站方页面有画质按钮（" +
          hints.map((h) => h.res + "P").join("/") +
          "），但未下发播放密文（mvarr 为空），当前无法在线播放。"
      );
    } else {
      descLines.unshift("站方未下发播放密文，当前无法在线播放。");
    }
  }

  const chapters = [
    {
      id: host.chapterId(path, "1"),
      source: host.source,
      title: "正片",
      name: "正片",
      currentEpisode: 1,
      episode: 1,
      // 不按画质拆集；取流时在 resolveMedia 里自动选最高画质
      videoUrl: path + "|" + (hasSource ? "auto" : "nosource"),
      referer: pageUrl,
      pageUrl: pageUrl,
    },
  ];

  return {
    drama: {
      id: host.dramaId(path),
      source: host.source,
      sourceId: path,
      title: title,
      name: title,
      cover: cover,
      coverUrl: cover,
      intro: descLines.join("\n"),
      desc: descLines.join("\n"),
      remark: code,
      channelName: "潮流AV",
      totalEpisode: 1,
      episodeCount: 1,
    },
    chapters: chapters,
  };
}

function resolveMedia(task) {
  const st = loadState();
  const path = sourceIdFromTask(task);
  const key = lineKeyFromTask(task);

  if (!path) throw new Error("播放信息无效，请返回详情页重试");
  if (key === "nosource") {
    throw new Error("该条目没有可用片源（站方未下发播放密文）");
  }

  const pageUrl = st.site + "/zh/" + path + ".html";
  const html = getHtml(st, "/zh/" + path + ".html", pageUrl, 1);
  const lines = parseMvarr(html).filter(function (l) {
    return l && l.enc;
  });

  if (!lines.length) {
    const hints = parseQualityHints(html);
    if (hints.length > 0) {
      throw new Error(
        "详情页有画质选项（" +
          hints.map((h) => h.res + "P").join("/") +
          "）但无播放密文，站方已屏蔽取流数据"
      );
    }
    throw new Error("该条目没有可用片源（详情页无播放密文）");
  }

  // auto / 未知 key：选最高画质；指定 key 则优先匹配
  let line = null;
  if (key && key !== "auto" && key !== "nosource") {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].key === key) {
        line = lines[i];
        break;
      }
    }
  }
  if (!line) line = lines.slice().sort(function (a, b) {
    return b.res - a.res;
  })[0];
  if (!line || !line.enc) {
    throw new Error("该线路缺少播放密文，无法取流");
  }

  const consts = parseConsts(html);
  const playId = decodePlayId(line.enc, consts);
  const playerPath =
    "/js/player/play.php?numresolution=" +
    (line.res || 720) +
    "&id=" +
    encodeURIComponent(playId);

  let lastErr = "";
  for (let n = 0; n < 2; n++) {
    if (n > 0) switchSite(st);
    const playPage = st.site + "/zh/" + path + ".html";
    try {
      const res = host.fetch({
        url: st.site + playerPath,
        method: "GET",
        headers: baseHeaders(st, playPage),
        timeoutMs: 12000,
        anyStatus: true,
        followRedirects: true,
        limit: 2 * 1024 * 1024,
      });
      if (res && res.headers) jarMerge(st, res.headers["set-cookie"] || res.headers["Set-Cookie"] || "");
      if (res && res.blocked) {
        lastErr = "拦截页";
        continue;
      }
      const playHtml = String((res && res.body) || "");
      if (playHtml && res && res.status < 400) {
        const sources = parseSources(st, playHtml);
        if (sources.length) {
          sources.sort((a, b) => (b.size || 0) - (a.size || 0));
          const best = sources[0];
          if (best.url && /^https?:\/\//i.test(best.url)) {
            saveState(st);
            return host.prepareWebMedia({ url: best.url, referer: playPage }, "潮流AV");
          }
        }
        lastErr = "播放页无地址";
      } else {
        lastErr = "HTTP " + ((res && res.status) || "?");
      }
    } catch (e) {
      lastErr = String((e && e.message) || e);
    }
  }
  throw new Error("播放页没有拿到地址" + (lastErr ? "（" + lastErr + "）" : ""));
}

module.exports = {
  validCategory: validCategory,
  categories: categories,
  catalogPage: catalogPage,
  search: search,
  detail: detail,
  resolveMedia: resolveMedia,
};
