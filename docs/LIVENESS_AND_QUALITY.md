# NSUK Biometric Enrollment — Liveness & Quality Check Technical Reference

**System:** NSUK Biometric Enrollment Portal  
**Version:** 1.0  
**Date:** April 2026  
**Audience:** Backend engineers, deployment engineers, QA testers

---

## Table of Contents

1. [Overview](#1-overview)
2. [System Architecture](#2-system-architecture)
3. [Client-Side Quality Check](#3-client-side-quality-check)
4. [Server-Side Liveness Detection](#4-server-side-liveness-detection)
5. [Integration Flow](#5-integration-flow)
6. [Error Handling & Operator Guidance](#6-error-handling--operator-guidance)
7. [Configuration & Tuning Reference](#7-configuration--tuning-reference)
8. [Limitations & Known Constraints](#8-limitations--known-constraints)

---

## 1. Overview

The enrollment pipeline includes two independent safety mechanisms that run before a face template is committed to the database:

| Mechanism | Where | When | Purpose |
|---|---|---|---|
| **Quality Check** | Browser (client-side) | After capture, before submit | Reject/warn on technically unusable images |
| **Liveness Detection** | Server (backend) | On upload, before embedding extraction | Reject static photos and screen replays |

The two mechanisms are complementary. Quality check runs on a single still image and evaluates its photographic properties. Liveness detection analyses motion between multiple frames captured while the camera was streaming, and evaluates whether the subject is physically present.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (React / TypeScript)                                   │
│                                                                 │
│  CameraCapture.tsx                                              │
│  ├── Camera stream starts                                       │
│  ├── setInterval (350 ms) ──→ captureFrame() → livenessBuffer[] │
│  │                            (rolling 3-frame ring buffer)     │
│  └── Capture button clicked                                     │
│       ├── Snapshot full-res main frame                          │
│       ├── Drain livenessBuffer (0–3 frames)                     │
│       └── Stop stream + interval                                │
│                                                                 │
│  FacePreview.tsx + imageQuality.ts                              │
│  └── analyzeImageQuality(mainFrame)                             │
│       ├── PASS (or warn-only) → enable submit                   │
│       └── ERROR → block submit, show actionable guidance        │
│                                                                 │
│  enrollmentApi.ts                                               │
│  └── POST /api/v1/enroll (multipart)                            │
│       ├── files[0] = main capture.jpg                           │
│       └── files[1..N] = liveness_0..2.jpg                      │
└─────────────────────────────────────────────────────────────────┘
                            │
                      HTTPS / proxy
                            │
┌─────────────────────────────────────────────────────────────────┐
│  FastAPI Backend (Python)                                       │
│                                                                 │
│  POST /api/v1/enroll                                            │
│  ├── Upsert student record (external_id → internal id)          │
│  ├── Validate main image (PIL, min 200×200)                     │
│  ├── Liveness check (if settings.liveness_enabled AND ≥2 files) │
│  │    └── LivenessDetector.check_liveness(all files)            │
│  ├── Normalise image → RGB JPEG                                 │
│  ├── Extract ArcFace embedding (InsightFace buffalo_l)          │
│  ├── Fernet-encrypt template                                    │
│  ├── Persist to SQLite + update FAISS index                     │
│  └── Return { success, liveness_passed, liveness_checked }      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Client-Side Quality Check

**File:** `src/services/imageQuality.ts`  
**Triggered by:** `FacePreview.tsx` via `useEffect` on every new `imageData`  
**Dependencies:** Browser Canvas API only — no external ML libraries

### 3.1 How It Works

The check down-samples the captured image to a 180-pixel-wide canvas for performance, then extracts two pixel regions:

- **Full frame** — used for sharpness (Laplacian variance)
- **Face oval region** (`x=25%, y=16%, w=50%, h=68%` of frame) — used for brightness, overexposure, and skin tone analysis

All checks run synchronously on the pixel arrays. Results are collected as `QualityIssue[]` objects then deduplicated (per-code, keeping highest severity).

### 3.2 Checks Performed

#### Brightness (Luminance)

Measures average luminance of the face-oval pixel region using the BT.601 luma formula:

$$Y = 0.299R + 0.587G + 0.114B$$

| Severity | Condition | Threshold |
|---|---|---|
| `error` | `avgLuminance < 32` | Too dark to extract features |
| `warning` | `avgLuminance < 50` | Marginal lighting, usable but unreliable |

---

#### Overexposure

Counts pixels where all three channels are `> 240` (blown-out white). Returns ratio over total face-region pixels.

| Severity | Condition | Threshold |
|---|---|---|
| `error` | `ratio > 0.35` | >35% of face pixels are blown-out |
| `warning` | `ratio > 0.16` | >16% blown — backlit or glare present |

---

#### Sharpness (Blur)

Applies a discrete 4-neighbour Laplacian kernel across the full-frame grayscale image and computes the variance of the response:

$$\text{Laplacian}(p) = p_{\text{top}} + p_{\text{bottom}} + p_{\text{left}} + p_{\text{right}} - 4p_{\text{center}}$$

$$\text{sharpness} = \text{Var}(\text{Laplacian responses})$$

Higher variance = sharper image.

| Severity | Condition | Threshold |
|---|---|---|
| `error` | `variance < 10` | Extremely blurry, face features indistinguishable |
| `warning` | `variance < 22` | Slightly soft — JPEG compression or minor motion |

*Note: The error floor is kept low (10) because 480p webcams produce lower sharpness scores than higher-resolution cameras even when in focus.*

---

#### Face Visibility & Framing (Skin Tone Ratio)

Counts pixels in the face-oval region that match human skin tone using the YCbCr colour space. The conversion is:

$$Y = 0.299R + 0.587G + 0.114B$$
$$C_b = 128 - 0.168736R - 0.331264G + 0.5B$$
$$C_r = 128 + 0.5R - 0.418688G - 0.081312B$$

A pixel is classified as skin if: `Y > 40`, `77 ≤ Cb ≤ 127`, `133 ≤ Cr ≤ 173`

The **skin ratio** is `skinPixels / totalFaceRegionPixels`.

| Code | Severity | Condition |
|---|---|---|
| `face-not-visible` | `warning` | `skinRatio < 0.05` — face absent or heavily occluded |
| `too-far` | `warning` | `0.05 ≤ skinRatio < 0.12` — face too small in frame |
| `too-close` | `warning` | `skinRatio > 0.68` — face overfills the region |

These are warnings only — they do not hard-block enrollment because skin-tone detection is heuristic and should not prevent a supervised operator from completing a session.

---

#### Off-Centre

Measures the fraction of skin pixels that fall within the central 50%×60% zone of the face oval (`centerBias`).

| Severity | Condition |
|---|---|
| `warning` | `skinRatio ≥ 0.05` AND `centerBias < 0.50` |

Warning-only. Minor framing drift is normal and does not warrant blocking.

---

#### Low Resolution

Checked against source image dimensions before any canvas analysis.

| Severity | Condition |
|---|---|
| `warning` | Source image `width < 320 OR height < 240` |

---

### 3.3 Severity & Pass/Fail Logic

```
passed = true   if no issue has severity === 'error'
passed = false  if ANY issue has severity === 'error'
```

When `passed === false` the submit button is **disabled**. An "Override and submit" button appears as an escape hatch for edge cases (e.g. very dark skin misread, unusual lighting environment).

### 3.4 Issue Deduplication

If the same `code` is raised at both `warning` and `error` severity by different code paths, only the highest-severity instance is kept.

---

## 4. Server-Side Liveness Detection

**File:** `faceapp/core/liveness.py`  
**Class:** `LivenessDetector`  
**Called by:** `POST /api/v1/enroll` when `settings.liveness_enabled = True` and `≥ 2` frames are submitted  
**Dependencies:** OpenCV (`cv2`), NumPy

### 4.1 Input

`check_liveness(frames_bytes: List[bytes], threshold: float = 0.5) → bool`

- `frames_bytes` — ordered list of JPEG/PNG byte strings; `files[0]` is the main capture, `files[1:]` are the liveness background frames
- Minimum usable input: **2 frames**; practical input from frontend: **2–4 frames** (1 main + up to 3 background frames collected at 350 ms intervals)

### 4.2 Algorithm

**Step 1 — Decode and greyscale**

Each byte buffer is decoded with `cv2.imdecode` and converted to greyscale (`cv2.COLOR_BGR2GRAY`). Frames that fail to decode are silently skipped. If fewer than 2 valid greyscale frames remain after decoding, the function returns `False`.

**Step 2 — Inter-frame motion (central ROI)**

For each consecutive pair of frames, an absolute pixel difference is computed:

```
diff = cv2.absdiff(frame[i], frame[i+1])
```

The difference is restricted to the central 60%×60% region of the frame (`h×0.2 → h×0.8`, `w×0.2 → w×0.8`) to focus on the face zone and reduce background noise.

The mean pixel difference across this ROI is collected, and the mean across all consecutive pairs becomes `mean_diff`.

**Step 3 — Motion band check**

| Condition | Decision | Interpretation |
|---|---|---|
| `mean_diff < 0.15` | `False` | Too static — likely a printed photo or frozen replay |
| `0.15 ≤ mean_diff ≤ 15.0` | Continues | Normal micro-motion band (breathing, blinking) |
| `mean_diff > 15.0` | `False` | Too chaotic — camera shaking or spoofing artefact |

**Step 4 — Per-frame texture check (Laplacian variance)**

For each greyscale frame:

```
variance = cv2.Laplacian(frame, cv2.CV_64F).var()
```

If `variance < 50` for **any** frame, the function returns `False`. Very blurry frames indicate a photo-of-a-photo or a low-resolution screen replay where fine facial texture is absent.

**Step 5 — Pass**

If all checks above are satisfied, returns `True`.

### 4.3 Bypass Condition

Liveness is **skipped** (not failed) when:

- `settings.liveness_enabled = False` (admin-configurable via `PUT /admin/settings`)
- Fewer than 2 files are submitted (operator captured before the 350 ms buffer had time to collect frames)

In both bypass cases, `liveness_checked = False` is recorded in the enrollment metadata for audit purposes.

---

## 5. Integration Flow

### 5.1 Frame Collection Timeline

```
t=0 ms     Camera stream starts
t=350 ms   Frame 1 collected → buffer = [F1]
t=700 ms   Frame 2 collected → buffer = [F1, F2]
t=1050 ms  Frame 3 collected → buffer = [F2, F3]  ← rolling, keeps last 3
           ...
t=N ms     Operator clicks Capture
           → livenessFrames snapshot = [...buffer]
           → main frame captured from video element
           → stream + interval stopped
```

### 5.2 Request Structure

```
POST /api/v1/enroll
Content-Type: multipart/form-data

external_id   = "NSU/2024/CS/0142"     (Form field)
full_name     = "Ibrahim Musa"          (Form field, optional)
files[0]      = capture.jpg             (main full-res JPEG)
files[1]      = liveness_0.jpg          (half-res liveness frame)
files[2]      = liveness_1.jpg
files[3]      = liveness_2.jpg
```

Liveness frames are encoded at 70% JPEG quality at half the camera resolution to keep upload size minimal.

### 5.3 Response

```json
{
  "success": true,
  "status": "success",
  "message": "Face enrollment completed",
  "student_id": 42,
  "external_id": "NSU/2024/CS/0142",
  "liveness_passed": true,
  "liveness_checked": true
}
```

### 5.4 Liveness Failure Response

```json
HTTP 400 Bad Request

{
  "detail": "Liveness check failed. Ensure the subject is physically present and not a photo or screen. Ask them to blink or slightly move, then retake."
}
```

The frontend extracts `body.detail` and surfaces it as a `StatusBanner` error with a Retake button. Clicking Retake remounts `CameraCapture` with a fresh buffer — the next attempt collects a new set of liveness frames.

---

## 6. Error Handling & Operator Guidance

### Quality Errors (client-side, block submit)

| Code | Label | Operator Action |
|---|---|---|
| `too-dark` (error) | Lighting is too low | Direct a light source at the subject; remove face shadows |
| `too-bright` (error) | Image is overexposed | Move subject away from windows/bright sources |
| `blurry` (error) | Image is blurry | Ask subject to stay still; clean lens; retake |

### Quality Warnings (client-side, do not block)

| Code | Label | Operator Action |
|---|---|---|
| `too-dark` (warning) | Lighting is a bit low | Improve ambient lighting |
| `too-bright` (warning) | Slightly overexposed | Reposition subject or camera |
| `blurry` (warning) | Slightly blurry | Steady camera; subject still |
| `face-not-visible` | Face not clearly visible | Ensure full face inside oval; remove obstructions |
| `too-far` | Face too far | Move camera or subject closer |
| `too-close` | Face too close | Move subject back slightly |
| `off-center` | Face may be off-center | Centre subject within oval guide |
| `low-resolution` | Low image resolution | Use better camera or move subject closer |

### Liveness Failure (server-side, HTTP 400)

| Likely Cause | Operator Action |
|---|---|
| Static photo or printed image held up | Ensure subject is physically present |
| Camera moved excessively during streaming | Hold camera still and retake |
| Subject moved very fast before capture | Ask subject to stay still and retake |
| Very blurry camera or dirty lens | Clean lens; use higher-quality camera |

---

## 7. Configuration & Tuning Reference

### Quality Thresholds — `src/services/imageQuality.ts`

Edit the `T` constant at the top of the file:

```typescript
const T = {
  brightness: { error: 32,  warn: 50  },   // luminance 0–255
  overexpose: { error: 0.35, warn: 0.16 },  // fraction of blown pixels
  blur:       { error: 10,   warn: 22  },   // Laplacian variance
  skinRatio: {
    notVisible:  0.05,
    tooFar:      0.12,
    tooClose:    0.68,
  },
  centerBias: { warn: 0.50 },
};
```

**Raise brightness error** (e.g. `40`) if dark captures in the field are being hard-blocked incorrectly.  
**Lower blur error** (e.g. `6`) if high-quality cameras are producing false blur failures.  
**Raise overexpose error** (e.g. `0.45`) if outdoor or skylit deployments see frequent hard blocks.

### Liveness Thresholds — `faceapp/core/liveness.py`

Edit the constants inside `check_liveness`:

```python
STILL_PHOTO_THRESHOLD   = 0.15   # raise if fast captures skip liveness too often
EXCESSIVE_MOTION_THRESHOLD = 15.0  # lower if tablet-shaking spoofing is a concern
LAPLACIAN_VARIANCE_MIN  = 50     # lower for cheaper/lower-res cameras
```

### Liveness Enabled/Disabled — Admin API

```
PUT /admin/settings
Content-Type: application/json

{ "liveness_enabled": false }
```

Disabling liveness is useful during initial rollout, hardware testing, or for offline fallback operation. All enrollments still record `liveness_checked: false` in metadata.

### Frame Collection Rate — `src/components/CameraCapture.tsx`

```typescript
livenessIntervalRef.current = setInterval(() => { ... }, 350); // ms
```

Decrease (e.g. `250`) to collect more frames on fast operators. Increase (e.g. `500`) to reduce CPU usage on slow devices.

---

## 8. Limitations & Known Constraints

| Limitation | Detail |
|---|---|
| **No iris/blink detection** | Liveness relies solely on inter-frame pixel motion and Laplacian texture. A high-quality looped video on a high-resolution screen may pass if displayed with slight ambient noise. |
| **Skin tone model breadth** | The YCbCr skin classifier (`Cb: 77–127, Cr: 133–173`) covers the majority of human skin tones but may under-detect at very dark or very pale extremes. This is why `face-not-visible` is a warning, not an error. |
| **Single-frame quality** | Quality analysis operates on one still frame. Issues that are intermittent (brief glare, momentary motion blur) may be missed or over-reported depending on capture timing. |
| **No depth sensor** | No hardware depth data is used. Advanced 3D-mask spoofing is not defended against. |
| **Frame count dependency** | If the operator clicks Capture within the first 350 ms of streaming (before any background frame is collected), liveness is bypassed. This is intentional for supervised staff-operated contexts but should be monitored in audit logs via `liveness_checked`. |
| **Browser security context** | `getUserMedia` requires HTTPS or `localhost`. Deploying on a plain HTTP non-local origin will silently prevent the camera from starting. |
