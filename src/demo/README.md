# Demo Signal Assets

Place your `.raw` PCG and ECG recordings here, then run the converter to
replace the placeholder files.

## Folder contents

| File | Purpose |
|---|---|
| `pcg_aortic.json` | PCG signal played on every Heart Sound capture in demo mode |
| `ecg_aortic.json` | ECG signal played on every Heart Rhythm capture in demo mode |
| `convert.js` | One-command converter from `.raw` → `.json` |
| `index.ts` | App entry point — set `DEMO_MODE = true/false` here |

## How to add your recording

### Step 1 — Export your signal as `.raw` PCM

From your recording tool, export as:
- **Format**: raw PCM (no header)
- **Encoding**: 16-bit signed integer, little-endian (int16 LE)  
  *(or 32-bit IEEE 754 float — pass `float32` as the 4th argument to convert.js)*
- **Channels**: mono (single channel)

### Step 2 — Drop the file in this folder

```
DiagnosticApp/src/demo/
  aortic_pcg.raw    ← your PCG recording
  aortic_ecg.raw    ← your ECG recording
```

### Step 3 — Convert

```bash
# From the DiagnosticApp root:
node src/demo/convert.js src/demo/aortic_pcg.raw src/demo/pcg_aortic.json 4000 int16
node src/demo/convert.js src/demo/aortic_ecg.raw src/demo/ecg_aortic.json 500 int16
```

Replace `4000` / `500` with your actual sample rates.

### Step 4 — Rebuild

```bash
npx react-native run-android
```

The waveform on the Capture screen will now scroll your real recording on loop.

## Toggling demo mode

Open `src/demo/index.ts` and flip the constant:

```typescript
export const DEMO_MODE = true;   // demo: uses pcg_aortic.json + ecg_aortic.json
export const DEMO_MODE = false;  // live: uses synthetic waveform generator
```

## Python alternative (if you have scipy)

```python
import json, numpy as np
from scipy.io import wavfile

rate, data = wavfile.read('aortic_pcg.wav')
if data.ndim > 1:
    data = data[:, 0]           # take first channel if stereo
normalized = (data / np.iinfo(data.dtype).max).tolist()
with open('pcg_aortic.json', 'w') as f:
    json.dump({'label': 'Aortic PCG', 'sampleRate': rate, 'samples': normalized}, f)
```
