#!/usr/bin/env bash
# 本地发布：把 main.js 复制成 dist/hongguoTV/HongGuoTV.js，重算 sha256，写清单并推送。
# 用法： ./publish-script.sh [main.js 路径]      （默认读 script/main.js）
set -euo pipefail

cd "$(dirname "$0")"

SRC="${1:-script/main.js}"

if [ ! -f "$SRC" ]; then
  echo "找不到脚本：$SRC"
  exit 1
fi

SIZE=$(wc -c < "$SRC" | tr -d ' ')
if [ "$SIZE" -lt 204800 ]; then
  echo "脚本过小：$SIZE 字节（可能下到了空文件或错误页）"
  exit 1
fi
if [ "$SIZE" -gt 2097152 ]; then
  echo "脚本过大：$SIZE 字节"
  exit 1
fi

if head -c 2048 "$SRC" | grep -qi '<html\|<!doctype'; then
  echo "文件开头是 HTML，拒绝发布"
  exit 1
fi
if ! grep -q 'module.exports' "$SRC"; then
  echo "缺少 module.exports，不是可加载脚本"
  exit 1
fi
if ! tail -c 8192 "$SRC" | grep -q 'module.exports'; then
  echo "脚本尾部缺少 module.exports，文件可能被截断"
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  SHA=$(sha256sum "$SRC" | cut -d' ' -f1)
else
  SHA=$(shasum -a 256 "$SRC" | cut -d' ' -f1)
fi

# 从脚本头部「构建时间：2026-11-24 03:38:11」生成 2026.11.24.0338
VER=$(head -c 4096 "$SRC" \
  | sed -n 's/.*构建时间：\([0-9]\{4\}\)-\([0-9]\{2\}\)-\([0-9]\{2\}\) \([0-9]\{2\}\):\([0-9]\{2\}\).*/\1.\2.\3.\4\5/p' \
  | head -1)
if [ -z "$VER" ]; then
  VER="0.0.0.0000"
fi

mkdir -p dist/hongguoTV
cp "$SRC" dist/hongguoTV/HongGuoTV.js.tmp
mv dist/hongguoTV/HongGuoTV.js.tmp dist/hongguoTV/HongGuoTV.js

cat > dist/index.json <<JSON
{
  "schema": 1,
  "packageName": "com.x.hongguotv.bate",
  "script": {
    "version": "$VER",
    "path": "dist/hongguoTV/HongGuoTV.js",
    "size": $SIZE,
    "sha256": "$SHA"
  }
}
JSON

git add dist
if [ -d script ]; then
  git add script
fi

if git diff --staged --quiet; then
  echo "内容未变化，无需提交"
  exit 0
fi

git commit -m "dist: $VER ($SHA)"
git push

echo "已发布 version=$VER size=$SIZE sha256=$SHA"
