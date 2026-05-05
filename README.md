# NSUK Biometric Enrollment System

A web-based biometric enrollment portal for Nasarawa State University, Keffi (NSUK). Captures face images and fingerprint data for student/staff identity verification, with **active liveness detection** to prevent spoofing (printed photos, replay video, etc.).

---

## Quickstart

### Frontend (React + Vite)
```bash
npm install
npm run dev
# Opens http://localhost:5173
```

### Backend (Python FastAPI)
```bash
cd faceapp
python run_server.py
# Runs on http://127.0.0.1:8000
```

Both servers must be running. The frontend calls `/api/v1/enroll` on the backend.

---

## Technical Stack

### Libraries

- React ^19.1.0
- React DOM ^19.1.0
- Vite ^6.3.2
- TypeScript ~5.7.2
- @vitejs/plugin-react ^4.4.1
- @types/react ^19.1.2
- @types/react-dom ^19.1.2

### Browser APIs Used

| API                                | Purpose                                              |
| ---------------------------------- | ---------------------------------------------------- |
| `navigator.mediaDevices.getUserMedia` | Camera access for face capture                      |
| `navigator.mediaDevices.enumerateDevices` | List available video/input devices for device selector |
| `HTMLCanvasElement.toDataURL`      | Convert captured video frame to base64 JPEG          |
| `MediaDeviceInfo.getSettings`      | Auto-detect active device ID after stream opens      |

### Notable Design Decisions

- **Zero external UI libraries** — all styling is hand-written CSS (no Tailwind, Bootstrap, or component library).
- **No state management library** — uses React's built-in `useReducer` with a discriminated union state machine for enrollment flow.
- **No routing library** — single-page enrollment flow managed by component state.
- **PostCSS override** — a local empty `postcss.config.mjs` blocks any parent Tailwind config from interfering.

---

## Active Liveness Detection

The system enforces **active liveness** to confirm the subject is physically present during enrollment. This prevents spoofing attacks (printed photos, looped video, etc.).

### How It Works

#### 1. Frontend Frame Collection (CameraCapture.tsx)
- Camera stream runs at 350ms intervals, capturing half-resolution JPEG frames
- Frames are stored in a rolling buffer (max 3 liveness frames)
- Each new frame is compared against the previous one by sampling base64 payload byte differences
- When enough differences are detected, `hasMotionEvidence` is set to `true`
- **Capture button unlocks only when:**
  - ≥ 3 frames collected in buffer
  - **AND** at least one frame transition showed real motion (not identical frames)

The operator sees a live checklist: **Center → Blink → Turn**, which progresses as motion is detected.

#### 2. Submission (enrollmentApi.ts)
- Main enrollment photo + 3 liveness frames are bundled as multipart files
- All 4 images are POSTed to `/api/v1/enroll`
- Frontend validates structure; backend enforces the liveness check server-side

#### 3. Server-Side Enforcement (api/main.py)
```python
MIN_ACTIVE_LIVENESS_FRAMES = 3

# Reject immediately if fewer than 3 liveness frames + main capture
if settings.liveness_enabled and len(frames_content) < MIN_ACTIVE_LIVENESS_FRAMES:
    raise HTTP 400: "Active liveness requires at least 3 frames..."

# Run liveness detector on all 4 frames
liveness_passed, liveness_checked = _compute_liveness(frames_content, settings.liveness_enabled)
if liveness_checked and not liveness_passed:
    raise HTTP 400: "Liveness check failed..."
```

#### 4. Motion Analysis (core/liveness.py)
The `LivenessDetector` uses OpenCV + NumPy (no ML models) to analyze frame sequences:

| Check | Threshold | Rejects |
|---|---|---|
| **Still photo** | `mean_diff < 0.15` | All frames identical (printed photo) |
| **Excessive motion** | `mean_diff > 15.0` | Camera waving / tablet spoofing |
| **Per-frame texture** | Laplacian variance < 50 | Blurry frames (photo-of-screen defence) |

It computes pixel differences between consecutive frames in the face ROI (central 60%), averages them, and requires the result to be in the **natural-motion band** (0.15–15.0). Every frame must also have sufficient sharpness.

#### 5. Failure Path
- If liveness check fails → `HTTP 400` with code `liveness_failed`
- Frontend maps this to `shouldRecapture: true` (disables retry with same image)
- User sees: *"Retake the session and make sure the subject blinks once and turns slightly before capture unlocks."*

### Configuration

**Disable liveness** (for testing only):
```sql
UPDATE system_settings SET liveness_enabled = FALSE;
```

**Frontend mock mode** (for local dev without backend):
```bash
VITE_MOCK_API=true npm run dev
```

⚠️ **Production:** Set `VITE_MOCK_API=false` or liveness pipeline is skipped entirely.

---

### Notable Design Decisions

- **Zero external UI libraries** — all styling is hand-written CSS (no Tailwind, Bootstrap, or component library).
- **No state management library** — uses React's built-in `useReducer` with a discriminated union state machine for enrollment flow.
- **No routing library** — single-page enrollment flow managed by component state.
- **PostCSS override** — a local empty `postcss.config.mjs` blocks any parent Tailwind config from interfering.

---

## Project Structure

```
src/
├── components/
│   ├── CameraCapture.tsx    # Camera access, face guide overlay, capture
│   ├── DeviceSelector.tsx   # Input device picker dropdown (camera/fingerprint)
│   ├── EnrollmentFlow.tsx   # Main orchestrator (state machine, step rendering)
│   ├── FacePreview.tsx      # Captured image preview with retake/submit
│   ├── Footer.tsx           # Minimal footer
│   ├── Navbar.tsx           # Top navigation bar
│   ├── StatusBanner.tsx     # Info/error/success message banners
│   └── StepIndicator.tsx    # 3-step progress indicator
├── services/
│   └── enrollmentApi.ts     # API client (POST /api/enroll)
├── state/
│   └── enrollmentReducer.ts # useReducer state machine (8 states, 12 actions)
├── App.tsx                  # Root layout (navbar, hero, landing/enrollment views)
├── index.css                # All styles (~1200 lines, no preprocessor)
└── main.tsx                 # React DOM entry point
```

---

## Scripts

| Command          | Description                  |
| ---------------- | ---------------------------- |
| `npm run dev`    | Start Vite dev server on port 5173 (HMR)  |
| `npm run build`  | Type-check + production build |
| `npm run preview`| Preview production build      |

---

## Environment Variables

### Frontend (.env)
```
VITE_API_BASE=/api/v1
VITE_API_TOKEN=<optional bearer token>
VITE_MOCK_API=false  # Set to 'false' in production; liveness is mocked if not set
```

### Backend (faceapp/.env or system env)
```
DATABASE_URL=sqlite:///./biometric.db
LIVENESS_ENABLED=1
```

---

## API

### POST /api/v1/enroll

**Request:** Multipart form-data

| Field | Type | Notes |
|---|---|---|
| `external_id` | string | Student/staff ID (3–64 chars) |
| `matric_number` | string | Alternative to `external_id` |
| `files` | file[] | **Required:** Main capture FIRST, then 3 liveness frames |
| `metadata` | JSON | Optional enrollment metadata |

**Response (201):**
```json
{
  "success": true,
  "message": "Face enrollment completed for ...",
  "student_id": 42,
  "external_id": "NSU/2024/CS/0142",
  "liveness_passed": true,
  "liveness_checked": true
}
```

**Errors (400):**
```json
{
  "detail": "Active liveness requires at least 3 frames. Retake while the subject blinks or turns slightly."
}
```
or
```json
{
  "detail": "Liveness check failed. Ensure the subject is physically present and retake."
}
```

---

## Testing

### Frontend
```bash
npm test  # or 'npx vitest run'
```
Tests cover state machine, error mapping, and image quality logic.

### Backend
```bash
cd faceapp
python -m pytest tests/test_enroll_liveness.py tests/test_liveness_unit.py -v
```
Tests verify active liveness enforcement, motion detection, and anti-spoofing thresholds.

---

## Troubleshooting

| Issue | Solution |
|---|---|
| Frontend not reachable on port 5173 | Kill stale process: `taskkill /PID <pid> /F`, then `npm run dev` |
| Backend returns 401 on enrollment | Check staff token in localStorage or `VITE_API_TOKEN` env var |
| Liveness always fails | Check if `LIVENESS_ENABLED=1` in backend; verify camera/motion during capture |
| "Identifier length" error | Subject ID must be 3–64 characters |
