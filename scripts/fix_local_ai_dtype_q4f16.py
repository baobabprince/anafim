#!/usr/bin/env python3
from pathlib import Path
p = Path("family-viewer/src/local-ai-provider.js")
t = p.read_text(encoding="utf-8")
old = """  if (device === 'webgpu') {
    opts.dtype = 'q4';
  } else {
    opts.dtype = 'q8';
  }"""
new = """  // CI ships model_q4f16.onnx only — prefer that dtype on all devices
  opts.dtype = 'q4f16';"""
if old not in t:
    if "opts.dtype = 'q4f16'" in t:
        print("already q4f16")
    else:
        raise SystemExit("dtype block not found")
else:
    p.write_text(t.replace(old, new, 1), encoding="utf-8")
    print("updated dtype to q4f16")
