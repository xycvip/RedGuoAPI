#!/usr/bin/env python3
"""在 QuickJS 中编译并加载正式热更新脚本，检查 App 宿主依赖的导出契约。

这里只验证脚本可编译、顶层可初始化、导出名称和类型完整；
不访问真实网络，也不把它冒充成接口在线回归测试。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    import quickjs
except ImportError as exc:
    raise SystemExit("缺少 quickjs：请先安装 requirements-ci.txt") from exc

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "script" / "main.js"

# 这些名称来自 HongGuoTV/kotlin-tv/playback-js 的实际调用点。
REQUIRED_FUNCTIONS = (
    "catalogPage",
    "search",
    "detail",
    "resolveMedia",
    "suggestions",
    "danmaku",
    "rankingPage",
    "rankingBoards",
    "seasons",
    "related",
    "theater",
    "theaterFilters",
    "actorRanking",
    "actorWorks",
    "accountCall",
    "resetAccount",
    "currentCookie",
)
REQUIRED_PROPERTIES = ("meta",)


def main() -> None:
    if not SOURCE.is_file():
        raise SystemExit("找不到 script/main.js")

    source = SOURCE.read_text(encoding="utf-8")
    if not source.strip():
        raise SystemExit("script/main.js 为空")

    ctx = quickjs.Context()
    # 宿主桥接桩：任何意外网络请求都返回明确的 599，不访问外网。
    ctx.eval("""
      globalThis.host = {
        fetch: function(spec) {
          return {status: 599, headers: {}, body: "", url: spec && spec.url || ""};
        },
        cacheGet: function() { return null; },
        cacheSet: function() {},
        utf8Encode: function(value) { return Array.from(String(value)).map(function(c) { return c.charCodeAt(0) & 255; }); },
        utf8Decode: function(value) { return String(value || ""); },
        base64Encode: function() { return ""; },
        base64Decode: function() { return []; },
        randomBytes: function(size) { return Array.from({length: size}, function() { return 0; }); }
      };
    """)

    try:
        # QuickJS 真正解析并执行完整脚本，而不是仅用正则检查。
        ctx.eval(source)
    except Exception as exc:
        raise SystemExit(f"QuickJS 加载失败：{exc}") from exc

    probe = {
        "functions": list(REQUIRED_FUNCTIONS),
        "properties": list(REQUIRED_PROPERTIES),
    }
    ctx.eval("globalThis.__contractProbe = " + json.dumps(probe, ensure_ascii=False) + ";")
    result_raw = ctx.eval("""
      (function() {
        var api = globalThis.HongguoAPI;
        if (!api || typeof api !== "object") {
          return JSON.stringify({ok:false, error:"globalThis.HongguoAPI 未初始化"});
        }
        var probe = globalThis.__contractProbe;
        var missing = [];
        var wrongType = [];
        probe.functions.forEach(function(name) {
          if (!(name in api)) missing.push(name);
          else if (typeof api[name] !== "function") wrongType.push(name + " (应为 function)");
        });
        probe.properties.forEach(function(name) {
          if (!(name in api)) missing.push(name);
          else if (name === "meta" && (!api[name] || typeof api[name] !== "object")) {
            wrongType.push(name + " (应为 object)");
          }
        });
        return JSON.stringify({
          ok: missing.length === 0 && wrongType.length === 0,
          missing: missing,
          wrongType: wrongType,
          exports: Object.keys(api).sort()
        });
      })()
    """)
    result = json.loads(result_raw)
    if not result.get("ok"):
        print(json.dumps(result, ensure_ascii=False, indent=2), file=sys.stderr)
        raise SystemExit("App JS 导出契约检查失败")

    print("QuickJS 编译与顶层初始化：通过")
    print("App 宿主导出契约：通过")
    print("已检查导出：" + ", ".join(REQUIRED_FUNCTIONS + REQUIRED_PROPERTIES))


if __name__ == "__main__":
    main()
