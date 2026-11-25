#!/usr/bin/env python3
"""在 QuickJS 中验证正式脚本加载、宿主契约和跨 Runtime 分页状态。"""
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

REQUIRED_FUNCTIONS = (
    "catalogPage", "search", "detail", "resolveMedia", "suggestions",
    "danmaku", "rankingPage", "rankingBoards", "seasons", "related",
    "theater", "theaterFilters", "actorRanking", "actorWorks",
    "accountCall", "resetAccount", "currentCookie",
)
REQUIRED_PROPERTIES = ("meta",)


def make_context(source: str, shared_cache: dict[str, str]) -> quickjs.Context:
    """每次创建全新 QuickJS Runtime，但复用模拟宿主 KV，模拟 App 的真实调用方式。"""
    ctx = quickjs.Context()

    def cache_get(key: str):
        return shared_cache.get(str(key))

    def cache_set(key: str, value: str, _ttl=None):
        shared_cache[str(key)] = str(value)

    ctx.add_callable("__test_cache_get", cache_get)
    ctx.add_callable("__test_cache_set", cache_set)
    ctx.eval("""
      globalThis.host = {
        fetch: function(spec) {
          return {status: 599, headers: {}, body: "", url: spec && spec.url || ""};
        },
        cacheGet: function(key) { return __test_cache_get(String(key)); },
        cacheSet: function(key, value, ttl) { __test_cache_set(String(key), String(value), ttl); },
        utf8Encode: function(value) { return Array.from(String(value)).map(function(c) { return c.charCodeAt(0) & 255; }); },
        utf8Decode: function(value) { return String(value || ""); },
        base64Encode: function() { return ""; },
        base64Decode: function() { return []; },
        randomBytes: function(size) { return Array.from({length: size}, function() { return 0; }); }
      };
    """)
    ctx.eval(source)
    return ctx


def run_async(ctx: quickjs.Context, expression: str):
    ctx.eval(
        "(async function(){ globalThis.__testResult = await " + expression + "; })();"
    )
    for _ in range(20000):
        if not ctx.execute_pending_job():
            break
    raw = ctx.eval("JSON.stringify(globalThis.__testResult)")
    if not raw or raw == "undefined":
        raise AssertionError("QuickJS 异步测试没有产生结果")
    return json.loads(raw)


def test_search_state_survives_runtime_restart(source: str) -> None:
    cache: dict[str, str] = {}

    def prepare(ctx: quickjs.Context) -> None:
        ctx.eval("""
          HongguoApp.fetchAppSearchPage = function(query, cursor) {
            var page = Number(cursor && cursor.testPage || 1);
            return {
              list: [{
                vod_id: String(100000000000 + page),
                vod_name: "搜索第" + page + "页",
                vod_episodes: 1,
                vod_remarks: "1集"
              }],
              hasMore: page < 3,
              cursor: {testPage: page + 1}
            };
          };
        """)

    first_runtime = make_context(source, cache)
    prepare(first_runtime)
    first = run_async(first_runtime, "HongguoAPI.search(1, '分页持久化测试')")
    assert first["items"] and first["items"][0]["title"] == "搜索第1页"
    assert first["hasMore"] is True

    # 关键：新建第二个 Runtime，不复用第一个 Runtime 的 Map。
    second_runtime = make_context(source, cache)
    prepare(second_runtime)
    second = run_async(second_runtime, "HongguoAPI.search(2, '分页持久化测试')")
    assert second["items"] and second["items"][0]["title"] == "搜索第2页"
    assert second["hasMore"] is True

    third_runtime = make_context(source, cache)
    prepare(third_runtime)
    third = run_async(third_runtime, "HongguoAPI.search(3, '分页持久化测试')")
    assert third["items"] and third["items"][0]["title"] == "搜索第3页"
    assert third["hasMore"] is False
    print("搜索跨 Runtime 第 1～3 页游标恢复：通过")


def test_feed_state_survives_runtime_restart(source: str) -> None:
    cache: dict[str, str] = {}

    def prepare(ctx: quickjs.Context) -> None:
        ctx.eval("""
          (function() {
            function makeCell(n) {
              var seriesId = String(200000000000 + n);
              var videoId = String(300000000000 + n);
              return {
                cell_id_str: "feed-cell",
                video_data: [{
                  vid: videoId,
                  title: "首页第" + n + "页",
                  episode_cnt: 1,
                  video_detail: {
                    series_id_str: seriesId,
                    series_title: "首页第" + n + "页",
                    episode_cnt: 1,
                    series_intro: "分页回归测试",
                    video_list: [{vid: videoId, vid_index: 1}]
                  }
                }]
              };
            }
            HongguoApp.fetchAppDiscoveryRaw = function(path, params) {
              if (path.indexOf("/tab/v") >= 0) {
                return {data: {tab_item: [{
                  tab_type: 16,
                  session_id: "feed-test-session",
                  next_offset: 1,
                  bottom_unlimited: true,
                  cell_data: [makeCell(1)]
                }]}};
              }
              return {data: {
                cell_view: makeCell(2),
                session_id: "feed-test-session",
                next_offset: 2,
                has_more: false
              }};
            };
          })();
        """)

    first_runtime = make_context(source, cache)
    prepare(first_runtime)
    first = run_async(first_runtime, "HongguoAPI.feed(1, 'feed-persist-test')")
    assert first["items"] and first["items"][0]["title"] == "首页第1页"
    assert first["hasMore"] is True

    second_runtime = make_context(source, cache)
    prepare(second_runtime)
    second = run_async(second_runtime, "HongguoAPI.feed(2, 'feed-persist-test')")
    assert second["items"] and second["items"][0]["title"] == "首页第2页"
    assert second["hasMore"] is False
    print("首页 feed 跨 Runtime 第 1～2 页游标恢复：通过")



def test_detail_web_fallback_after_app_error(source: str) -> None:
    ctx = make_context(source, {})
    ctx.eval("""
      host.fetch = function(spec) {
        return {
          status: 200,
          headers: {"content-type": "text/html; charset=utf-8"},
          body: '<html><script>var detail = {"vid_list":[123456789012345678]}</script></html>',
          url: spec && spec.url || ""
        };
      };
      HongguoApp.fetchAppDetailRaw = function() {
        throw new Error("mock official App detail failure");
      };
    """)
    result = run_async(ctx, "HongguoAPI.detail('123456789012345678')")
    assert result.get("drama") and result["drama"]["title"].startswith("短剧")
    assert result.get("chapters") and len(result["chapters"]) == 1
    print("App 详情接口异常后网页兜底：通过")

def main() -> None:
    if not SOURCE.is_file():
        raise SystemExit("找不到 script/main.js")
    source = SOURCE.read_text(encoding="utf-8")
    if not source.strip():
        raise SystemExit("script/main.js 为空")

    ctx = make_context(source, {})
    probe = {"functions": list(REQUIRED_FUNCTIONS), "properties": list(REQUIRED_PROPERTIES)}
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
    test_search_state_survives_runtime_restart(source)
    test_feed_state_survives_runtime_restart(source)
    test_detail_web_fallback_after_app_error(source)


if __name__ == "__main__":
    main()
