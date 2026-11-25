#!/bin/sh
# Copy the web game into the app bundle. The bytes are not rewritten.
set -eu
SRC="${SRCROOT}/.."
DEST="${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/web"
rm -rf "${DEST}"
mkdir -p "${DEST}"
tar -C "${SRC}" --exclude ios --exclude .github --exclude .git -cf - . | tar -C "${DEST}" -xf -
cmp "${SRC}/main.mjs" "${DEST}/main.mjs"
cmp "${SRC}/index.html" "${DEST}/index.html"
cmp "${SRC}/sw.js" "${DEST}/sw.js"
cmp "${SRC}/precache-list.js" "${DEST}/precache-list.js"
grep -q "BUILD_V='17x30'" "${DEST}/main.mjs"
grep -q "strike-17-17x30" "${DEST}/sw.js"
grep -q 'main.mjs?v=17x30' "${DEST}/index.html"
