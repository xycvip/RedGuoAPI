#!/usr/bin/env python3
"""把 script/main.js 发布为 dist 客户端脚本，并生成带完整性信息的清单。

发布原则：
  * HongGuoTV.js 与源码逐字节一致，不拼接、不压缩、不格式化；
  * 版本号完全由 CI 决定，与 JS 文件里写的任何版本文字无关：
      - workflow_dispatch 手动填写 VERSION_INPUT 时以它为准（统一补 v 前缀）；
      - 否则读取 dist/index.json 里上一版版本号并 +0.0.1；
      - 没有历史版本时从 1.0.0 起步。
  * 版本号日期段取本次构建时间（中国标准时间），不是提交时间，也不是 JS 头部时间；
  * 每次构建重新计算 SHA-256、文件长度，并校验产物与源码完全一致；
  * 临时文件原子替换，避免生成半截发布文件。
"""

import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

REPO = Path(__file__).resolve().parents[2]
SOURCE = REPO / "script" / "main.js"
TARGET = REPO / "dist" / "hongguoTV" / "HongGuoTV.js"
MANIFEST = REPO / "dist" / "index.json"

# 保持现有清单协议与客户端兼容；正式版/测试版的包名策略由客户端协议负责。
PACKAGE_NAME = "com.x.hongguotv.bate"
MIN_BYTES = 200 * 1024
MAX_BYTES = 2 * 1024 * 1024
TIME_ZONE = ZoneInfo("Asia/Shanghai")

# 初始版本号；无历史版本或历史版本无法解析时从这里起步。
INITIAL_VERSION = (1, 0, 0)
# 严格匹配新版语义版本：v1.0.0 / 1.0.0 / v1.0.0-20261128 / 1.0.0-20261128。
# 旧格式（如 2026.11.26.2158）不匹配，会安全回退到 INITIAL_VERSION，
# 不会被误读成 (2026,11,26) 再递增出 v2026.11.27 这种错误版本。
SEMVER_RE = re.compile(r"^v?(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:-\d{8})?$")


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def version_string(parts: tuple[int, int, int], built: datetime) -> str:
    major, minor, patch = parts
    return f"v{major}.{minor}.{patch}-{built.strftime('%Y%m%d')}"


def previous_version() -> tuple[int, int, int] | None:
    """从 dist/index.json 读取上一版语义版本。

    CI 每次都从最新 main 检出，dist/index.json 里就是上一次发布写入的版本，
    因此这里天然形成「上一版 +0.0.1」的递增链，不依赖 git tag 或 run number。
    """
    try:
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        raw = manifest.get("script", {}).get("version", "")
        match = SEMVER_RE.match(str(raw).strip())
        if match:
            return (int(match.group(1)), int(match.group(2)), int(match.group(3)))
    except (OSError, ValueError, TypeError, AttributeError):
        pass
    return None


def resolve_version(built: datetime) -> str:
    """版本号来源优先级：CI 手动输入 > 上一版 +0.0.1 > 初始 1.0.0。"""
    manual = os.environ.get("VERSION_INPUT", "").strip()
    if manual:
        match = SEMVER_RE.match(manual)
        if not match:
            fail(f"版本号格式非法：{manual}（应形如 2.0.0 或 v2.0.0）")
        parts = (int(match.group(1)), int(match.group(2)), int(match.group(3)))
        print(f"version source: 手动输入 {manual}")
        return version_string(parts, built)

    prev = previous_version()
    if prev is not None:
        parts = (prev[0], prev[1], prev[2] + 1)
        print(f"version source: 自动递增 {prev} -> {parts}")
        return version_string(parts, built)

    print(f"version source: 初始版本 {INITIAL_VERSION}")
    return version_string(INITIAL_VERSION, built)


def main() -> None:
    if not SOURCE.is_file():
        fail("找不到 script/main.js")

    data = SOURCE.read_bytes()
    size = len(data)
    if not MIN_BYTES <= size <= MAX_BYTES:
        fail(f"脚本体积异常：{size} 字节（允许 {MIN_BYTES}~{MAX_BYTES}）")

    head = data[:2048].lower()
    if b"<html" in head or b"<!doctype" in head:
        fail("文件开头是 HTML，可能下到了错误页")
    if b"module.exports" not in data:
        fail("缺少 module.exports，不是可加载的脚本")
    if b"module.exports" not in data[-8192:]:
        fail("脚本尾部缺少 module.exports，文件可能被截断")

    # 版本号与日期全部来自本次构建；绝不读取 JS 文件里写的版本文字。
    built = datetime.now(timezone.utc).astimezone(TIME_ZONE)
    version = resolve_version(built)
    built_at = built.isoformat(timespec="minutes")

    digest = hashlib.sha256(data).hexdigest()

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    target_tmp = TARGET.with_name(TARGET.name + ".tmp")
    target_tmp.write_bytes(data)
    target_tmp.replace(TARGET)

    # 发布前再从磁盘读取一次，确保落盘产物确实是源码的字节级副本。
    published = TARGET.read_bytes()
    if published != data:
        fail("发布产物与源码不一致")
    if hashlib.sha256(published).hexdigest() != digest:
        fail("发布产物 SHA-256 校验失败")

    manifest = {
        "schema": 1,
        "packageName": PACKAGE_NAME,
        "script": {
            "version": version,
            "path": "dist/hongguoTV/HongGuoTV.js",
            "size": size,
            "sha256": digest,
            "builtAt": built_at,
        },
    }
    manifest_text = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    manifest_tmp = MANIFEST.with_name(MANIFEST.name + ".tmp")
    manifest_tmp.write_text(manifest_text, encoding="utf-8")
    manifest_tmp.replace(MANIFEST)

    # 再验证清单与实际文件，避免清单字段与产物脱节。
    saved_manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    script = saved_manifest.get("script", {})
    if script.get("size") != len(published) or script.get("sha256") != digest:
        fail("清单与发布文件不匹配")

    print(f"version={version} size={size} sha256={digest}")
    print(f"builtAt={built_at}")
    print("校验通过：源码、发布文件、清单三者一致")


if __name__ == "__main__":
    main()
