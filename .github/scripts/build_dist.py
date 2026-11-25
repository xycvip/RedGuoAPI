#!/usr/bin/env python3
"""把 script/main.js 发布为 dist 客户端脚本，并生成带完整性信息的清单。

发布原则：
  * HongGuoTV.js 与源码逐字节一致，不拼接、不压缩、不格式化；
  * 版本时间取源码最后一次提交时间（中国标准时间），不再要求手工改 JS 头部；
  * 每次构建重新计算 SHA-256、文件长度，并校验产物与源码完全一致；
  * 临时文件原子替换，避免生成半截发布文件。
"""

import hashlib
import json
import subprocess
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


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def source_commit_time() -> datetime:
    """读取最近一次修改主脚本的提交时间；无 Git 元数据时安全回退到当前 UTC。"""
    try:
        value = subprocess.check_output(
            ["git", "log", "-1", "--format=%cI", "--", "script/main.js"],
            cwd=REPO,
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
        if value:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(TIME_ZONE)
    except (OSError, subprocess.CalledProcessError, ValueError):
        pass
    return datetime.now(timezone.utc).astimezone(TIME_ZONE)


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

    built = source_commit_time()
    version = built.strftime("%Y.%m.%d.%H%M")
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
