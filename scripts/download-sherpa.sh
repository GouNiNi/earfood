#!/bin/bash
# Download Sherpa-ONNX TTS assets from official sources
# WASM runtime: HuggingFace (k2-fsa)
# Voice models: GitHub releases (k2-fsa/sherpa-onnx)

set -e

DEST="public/sherpa"
HF_BASE="https://huggingface.co/spaces/k2-fsa/web-assembly-tts-sherpa-onnx-en/resolve/main"
GH_BASE="https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models"

mkdir -p "$DEST"

echo "=== Downloading Sherpa-ONNX WASM runtime ==="

for file in sherpa-onnx-wasm-main-tts.js sherpa-onnx-wasm-main-tts.wasm sherpa-onnx-wasm-main-tts.data sherpa-onnx-tts.js; do
  if [ -f "$DEST/$file" ]; then
    echo "  [SKIP] $file (already exists)"
  else
    echo "  [GET]  $file ..."
    curl -L -o "$DEST/$file" "$HF_BASE/$file"
  fi
done

# Patch: expose OfflineTts class globally (needed for Web Worker importScripts)
TTS_JS="$DEST/sherpa-onnx-tts.js"
if ! grep -q "window.OfflineTts" "$TTS_JS" 2>/dev/null; then
  echo "  [PATCH] Adding window.OfflineTts export to sherpa-onnx-tts.js"
  echo "window.OfflineTts = OfflineTts;" >> "$TTS_JS"
fi

echo ""
echo "=== Downloading French voice models ==="

for voice in vits-piper-fr_FR-siwis-medium vits-piper-fr_FR-tom-medium; do
  if [ -d "$DEST/$voice" ]; then
    echo "  [SKIP] $voice (already exists)"
  else
    echo "  [GET]  $voice ..."
    curl -L -o "/tmp/$voice.tar.bz2" "$GH_BASE/$voice.tar.bz2"
    tar -xjf "/tmp/$voice.tar.bz2" -C "$DEST"
    rm -f "/tmp/$voice.tar.bz2"
  fi
done

echo ""
echo "=== Done! ==="
du -sh "$DEST"
