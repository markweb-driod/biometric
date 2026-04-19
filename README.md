# NSUK Biometric Enrollment System

A web-based biometric enrollment portal for Nasarawa State University, Keffi (NSUK). Captures face images and fingerprint data for student/staff identity verification.

---

## Technical Stack

### Runtime Dependencies

| Library     | Version  | Purpose                                      |
| ----------- | -------- | -------------------------------------------- |
| React       | ^19.1.0  | UI component library (functional components, hooks) |
| React DOM   | ^19.1.0  | DOM rendering for React                      |

### Development Dependencies

| Library               | Version  | Purpose                                         |
| --------------------- | -------- | ----------------------------------------------- |
| Vite                  | ^6.3.2   | Build tool and dev server (ESM-native, HMR)     |
| TypeScript            | ~5.7.2   | Static type checking                             |
| @vitejs/plugin-react  | ^4.4.1   | Vite plugin for React JSX transform and Fast Refresh |
| @types/react          | ^19.1.2  | TypeScript type definitions for React            |
| @types/react-dom      | ^19.1.2  | TypeScript type definitions for React DOM        |

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
| `npm run dev`    | Start Vite dev server (HMR)  |
| `npm run build`  | Type-check + production build |
| `npm run preview`| Preview production build      |

---

## API

The app expects a backend endpoint:

```
POST /api/enroll
Content-Type: application/json

{ "userId": "132132", "image": "data:image/jpeg;base64,..." }
```

Base URL is configurable via the `VITE_API_BASE` environment variable (defaults to `/api`).
