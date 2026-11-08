#!/usr/bin/env python3
"""Insert model-download step into deploy-pages.yml before npm build."""
from pathlib import Path

path = Path(".github/workflows/deploy-pages.yml")
text = path.read_text(encoding="utf-8")

if "Download self-hosted ONNX model" in text:
    print("deploy-pages.yml already has model download step")
else:
    needle = "      - name: Install dependencies\n        working-directory: family-viewer\n        run: npm ci\n"
    insert = '''      - name: Install dependencies
        working-directory: family-viewer
        run: npm ci

      - name: Download self-hosted ONNX model (for local AI fallback)
        env:
          HF_HUB_ENABLE_HF_TRANSFER: "1"
        run: |
          set -euo pipefail
          python3 -m pip install -q "huggingface_hub[hf_transfer]"
          DEST="family-viewer/public/models/smollm2-360m"
          mkdir -p "$DEST"
          # Prefer compact quant; fall back if a file name differs across repos
          python3 << 'PY'
          from huggingface_hub import snapshot_download
          from pathlib import Path
          import shutil, os

          dest = Path("family-viewer/public/models/smollm2-360m")
          dest.mkdir(parents=True, exist_ok=True)

          # SmolLM2-360M Instruct with official ONNX exports (Transformers.js)
          repo = "HuggingFaceTB/SmolLM2-360M-Instruct"
          allow = [
              "config.json",
              "generation_config.json",
              "tokenizer.json",
              "tokenizer_config.json",
              "special_tokens_map.json",
              "vocab.json",
              "merges.txt",
              "onnx/model_q4f16.onnx",
              "onnx/model_q4.onnx",
              "onnx/model_quantized.onnx",
          ]
          print(f"Downloading subset from {repo} → {dest}")
          cached = snapshot_download(
              repo_id=repo,
              allow_patterns=allow,
              local_dir=str(dest),
          )
          print("Downloaded to", cached)
          # List what we got
          for p in sorted(dest.rglob("*")):
              if p.is_file():
                  print(f"  {p.relative_to(dest)}  ({p.stat().st_size // 1024} KB)")
          if not (dest / "config.json").exists():
              raise SystemExit("config.json missing after download")
          onnx_dir = dest / "onnx"
          if not onnx_dir.exists() or not any(onnx_dir.glob("*.onnx")):
              raise SystemExit("No ONNX weights under onnx/")
          PY
          echo "Self-hosted model ready under $DEST"

'''
    if needle not in text:
        raise SystemExit("Install dependencies block not found")
    text = text.replace(needle, insert, 1)
    path.write_text(text, encoding="utf-8")
    print("Patched deploy-pages.yml")

print("Done.")
