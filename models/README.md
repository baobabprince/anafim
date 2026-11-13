# Self-hosted models for anafim AI editor

The local AI fallback (`local-ai-provider.js`) prefers weights under this folder
before contacting Hugging Face Hub. This avoids `Failed to fetch` when Hub
access is slow or blocked.

## Layout

```text
public/models/
  smollm2-360m/          ← LOCAL_MODEL_NAME in local-ai-provider.js
    config.json
    tokenizer.json
    tokenizer_config.json
    generation_config.json   (if present)
    onnx/
      model_q4.onnx          (or model.onnx / model_quantized.onnx)
      … other ONNX shards if any
```

After `vite build`, files are served from:

```text
https://<pages-host>/anafim/models/smollm2-360m/config.json
```

Detection: the app does a `HEAD` request to `config.json`. If it is **200**,
local mode is used (`allowRemoteModels = false`).

## How to populate (do not commit huge binaries lightly)

### Option A – copy from Hugging Face cache (recommended)

1. Install CLI: `pip install huggingface_hub`
2. Download an ONNX-ready instruct model, e.g.:

```bash
huggingface-cli download onnx-community/SmolLM2-360M-Instruct-ONNX   --local-dir /tmp/smollm2-360m-onnx
```

3. Copy into this tree:

```bash
mkdir -p family-viewer/public/models/smollm2-360m
cp -R /tmp/smollm2-360m-onnx/* family-viewer/public/models/smollm2-360m/
```

4. Ensure `config.json` exists at the root of `smollm2-360m/`.
5. If individual ONNX files exceed **100MB**, use [Git LFS](https://git-lfs.com)
   or host them as **GitHub Release** assets and sync in CI instead of committing.

### Option B – GitHub Release assets

Upload the model archive to a Release, download in a workflow into
`family-viewer/public/models/smollm2-360m/` before `vite build`, so Pages serves
it without bloating git history.

## Size guidance

| Model | Approx. quant size | Notes |
|-------|--------------------|--------|
| SmolLM2-360M Instruct ONNX | ~200–400MB | Good default |
| Qwen2.5-0.5B Instruct ONNX | ~400–800MB | Heavier |

Prefer **one** small quant (`q4` / `q8`) rather than full precision.

## Git policy

- **Do** commit this README and empty folder placeholders.
- **Avoid** committing multi-hundred-MB weights unless the team agrees on LFS.
- `.gitignore` may ignore `*.onnx` under this path if you inject weights only at build time.
