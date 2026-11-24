#!/usr/bin/env python3
"""把 script/main.js 发布为 dist/hongguoTV/HongGuoTV.js，并生成 dist/index.json。

设计要点：
  * HongGuoTV.js 是 main.js 的字节级副本，不做拼接、压缩、格式化；
  * 清单只写相对路径，客户端自己拼域名与代理前缀，换 CDN 不用改清单；
  * 体积区间 + HTML 嗅探 + module.exports 三重校验，挡住空文件、错误页、截断；
  * 先写 .tmp 再原子替换，避免半个文件被提交。
"""

import hashlib
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SOURCE = REPO / "script" / "main.js"
TARGET = REPO / "dist" / "hongguoTV" / "HongGuoTV.js"
MANIFEST = REPO / "dist" / "index.json"

PACKAGE_NAME = "com.x.hongguotv.bate"
MIN_BYTES = 200 * 1024
MAX_BYTES = 2 * 1024 * 1024


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(1)


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
    # 只查全文挡不住截断：前段 adapter 里也出现过 module.exports。
    # 模块约定把导出放在文件末尾，所以尾部没有导出即视为半截文件。
    if b"module.exports" not in data[-8192:]:
        fail("脚本尾部缺少 module.exports，文件可能被截断")

    text = data[:4096].decode("utf-8", "replace")
    match = re.search(r"构建时间：(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})", text)
    if match:
        year, month, day, hour, minute = match.groups()
        version = f"{year}.{month}.{day}.{hour}{minute}"
        built_at = f"{year}-{month}-{day}T{hour}:{minute}:00+08:00"
    else:
        version = "0.0.0.0000"
        built_at = ""

    digest = hashlib.sha256(data).hexdigest()

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    temp = TARGET.with_name(TARGET.name + ".tmp")
    temp.write_bytes(data)
    temp.replace(TARGET)

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
    MANIFEST.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"version={version} size={size} sha256={digest}")


if __name__ == "__main__":
    main()
