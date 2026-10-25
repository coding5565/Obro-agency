#!/usr/bin/env bash
# OBRO' Panel rejasini PDF qilib chiqaradi (Chrome headless). Ishga tushirish: bash pdf_chiqarish.sh
cd "$(dirname "$0")"
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
SRC="$(cygpath -w "$PWD/OBRO_Panel_reja.html")"
OUT="$(cygpath -w "$PWD/../../OBRO_Panel_CRM_reja.pdf")"
"$CHROME" --headless=new --disable-gpu --no-pdf-header-footer --allow-file-access-from-files \
  --virtual-time-budget=8000 --print-to-pdf="$OUT" "file:///${SRC//\//}" 2>/dev/null
echo "Tayyor: $OUT"
