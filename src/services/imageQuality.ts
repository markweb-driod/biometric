/**
 * Client-side face capture quality checks using canvas pixel analysis.
 * Heuristic-only, no external ML dependencies.
 *
 * Tuned for:
 *   - Indoor office / bright lobby environments (fluorescent + natural light)
 *   - USB cameras and built-in laptop webcams (640×480 to 1280×720)
 *   - Balanced strictness: block only on clearly unusable captures,
 *     surface actionable warnings for everything else
 *
 * Threshold reference (adjust THRESHOLDS constant below as needed):
 *   brightness:  0–255 luminance scale
 *   overexposed: 0–1 ratio of blown-out pixels
 *   sharpness:   Laplacian variance (higher = sharper)
 *   skin.ratio:  0–1 fraction of face-region pixels matching skin tone
 *   centerBias:  0–1 fraction of skin pixels in the central zone
 */

export interface QualityIssue {
  code:
    | 'too-dark'
    | 'too-bright'
    | 'blurry'
    | 'off-center'
    | 'face-not-visible'
    | 'too-far'
    | 'too-close'
    | 'low-resolution';
  severity: 'error' | 'warning';
  label: string;
  suggestion: string;
}

export interface QualityResult {
  passed: boolean;
  issues: QualityIssue[];
}

const SAMPLE_W = 180;
const MIN_SOURCE_WIDTH = 320;
const MIN_SOURCE_HEIGHT = 240;

/**
 * All numeric cut-offs in one place for easy per-deployment tuning.
 *
 * Lobby notes:
 *   - Bright overhead + backlit windows → overexpose threshold kept moderate
 *   - Dark corridors → brightness error floor kept at 32 (permissive)
 * Webcam notes:
 *   - 480p webcams produce low sharpness naturally → blur error at 10
 *   - JPEG compression raises blurry false-positives → warning at 22
 * Balanced strictness:
 *   - face-not-visible and off-center downgraded to warning so minor
 *     framing drift never hard-blocks an operator during capture
 */
const T = {
  brightness: { error: 32,  warn: 50  },   // luminance 0–255
  overexpose: { error: 0.35, warn: 0.16 },  // fraction of blown pixels
  blur:       { error: 10,   warn: 22  },   // Laplacian variance
  skinRatio: {
    notVisible:  0.05,  // below this → face-not-visible (warning)
    tooFar:      0.12,  // below this → too-far (warning)
    tooClose:    0.68,  // above this → too-close (warning)
  },
  centerBias: { warn: 0.50 },  // off-center (warning only)
} as const;

export function analyzeImageQuality(dataUrl: string): Promise<QualityResult> {
  return new Promise((resolve) => {
    const img = new Image();

    img.onload = () => {
      const issues: QualityIssue[] = [];

      if (img.width < MIN_SOURCE_WIDTH || img.height < MIN_SOURCE_HEIGHT) {
        issues.push({
          code: 'low-resolution',
          severity: 'warning',
          label: 'Low image resolution',
          suggestion: 'Use a higher-resolution camera or move the subject closer.',
        });
      }

      const scale = SAMPLE_W / img.width;
      const sw = SAMPLE_W;
      const sh = Math.max(1, Math.round(img.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        resolve({ passed: true, issues: [] });
        return;
      }

      ctx.drawImage(img, 0, 0, sw, sh);
      const fullPixels = ctx.getImageData(0, 0, sw, sh).data;

      const faceRect = {
        x: Math.round(sw * 0.25),
        y: Math.round(sh * 0.16),
        w: Math.max(1, Math.round(sw * 0.5)),
        h: Math.max(1, Math.round(sh * 0.68)),
      };

      const facePixels = ctx.getImageData(
        faceRect.x,
        faceRect.y,
        faceRect.w,
        faceRect.h,
      ).data;

      const brightness = avgLuminance(facePixels);
      const overexposed = overexposedRatio(facePixels);
      const sharpness = laplacianVariance(fullPixels, sw, sh);
      const skin = skinStats(facePixels, faceRect.w, faceRect.h);

      // ── Lighting ────────────────────────────────────────────────────────
      if (brightness < T.brightness.error) {
        issues.push({
          code: 'too-dark',
          severity: 'error',
          label: 'Lighting is too low',
          suggestion: 'Direct a light source at the subject and remove any shadows from their face.',
        });
      } else if (brightness < T.brightness.warn) {
        issues.push({
          code: 'too-dark',
          severity: 'warning',
          label: 'Lighting is a bit low',
          suggestion: 'Improve ambient lighting or direct additional light towards the subject.',
        });
      }

      // Lobby environments commonly have bright windows behind the subject.
      // The warning threshold catches this early; the error threshold only
      // triggers when most of the face region is fully blown-out.
      if (overexposed > T.overexpose.error) {
        issues.push({
          code: 'too-bright',
          severity: 'error',
          label: 'Image is overexposed',
          suggestion: 'Move the subject away from backlighting — avoid positioning them in front of windows or bright sources.',
        });
      } else if (overexposed > T.overexpose.warn) {
        issues.push({
          code: 'too-bright',
          severity: 'warning',
          label: 'Image is slightly overexposed',
          suggestion: 'Have the subject turn away from the bright light source or reposition the camera.',
        });
      }

      // ── Sharpness / usability ───────────────────────────────────────────
      // Laptop webcams compress heavily and score lower than USB cameras
      // even at correct focus, so the error floor is kept permissive.
      if (sharpness < T.blur.error) {
        issues.push({
          code: 'blurry',
          severity: 'error',
          label: 'Image is blurry',
          suggestion: 'Ask the subject to stay still, clean the camera lens, and retake.',
        });
      } else if (sharpness < T.blur.warn) {
        issues.push({
          code: 'blurry',
          severity: 'warning',
          label: 'Image is slightly blurry',
          suggestion: 'Keep the camera steady and ensure the subject is not moving.',
        });
      }

      // ── Face visibility & framing ───────────────────────────────────────
      // Balanced mode: visibility + framing issues are warnings, not hard
      // blocks — students should be encouraged to retake but not prevented.
      if (skin.ratio < T.skinRatio.notVisible) {
        issues.push({
          code: 'face-not-visible',
          severity: 'warning',
          label: 'Face is not clearly visible',
          suggestion: "Ensure the subject's full face is inside the oval and is not obscured by hair, mask, or accessories.",
        });
      } else if (skin.ratio < T.skinRatio.tooFar) {
        issues.push({
          code: 'too-far',
          severity: 'warning',
          label: 'Face appears too far from the camera',
          suggestion: 'Move the camera or subject closer so the face fills the oval guide.',
        });
      } else if (skin.ratio > T.skinRatio.tooClose) {
        issues.push({
          code: 'too-close',
          severity: 'warning',
          label: 'Face appears too close',
          suggestion: 'Move the subject or camera slightly back so the full face stays within the oval.',
        });
      }

      // Off-center: warning-only so minor drift does not block enrollment.
      if (
        skin.ratio >= T.skinRatio.notVisible &&
        skin.centerBias < T.centerBias.warn
      ) {
        issues.push({
          code: 'off-center',
          severity: 'warning',
          label: 'Face may be off-center',
          suggestion: "Centre the subject's face within the oval guide.",
        });
      }

      const deduped = dedupeIssues(issues);
      resolve({
        passed: !deduped.some((issue) => issue.severity === 'error'),
        issues: deduped,
      });
    };

    img.onerror = () => resolve({ passed: true, issues: [] });
    img.src = dataUrl;
  });
}

function dedupeIssues(issues: QualityIssue[]): QualityIssue[] {
  const map = new Map<QualityIssue['code'], QualityIssue>();
  for (const issue of issues) {
    const existing = map.get(issue.code);
    if (!existing) {
      map.set(issue.code, issue);
      continue;
    }
    if (existing.severity === 'warning' && issue.severity === 'error') {
      map.set(issue.code, issue);
    }
  }
  return Array.from(map.values());
}

function avgLuminance(data: Uint8ClampedArray): number {
  const n = data.length / 4;
  if (n === 0) return 0;

  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return sum / n;
}

function overexposedRatio(data: Uint8ClampedArray): number {
  const n = data.length / 4;
  if (n === 0) return 0;

  let blown = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) blown++;
  }
  return blown / n;
}

function laplacianVariance(data: Uint8ClampedArray, w: number, h: number): number {
  const gray = new Float32Array(w * h);
  for (let i = 0; i < gray.length; i++) {
    const p = i * 4;
    gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }

  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let row = 1; row < h - 1; row++) {
    for (let col = 1; col < w - 1; col++) {
      const idx = row * w + col;
      const lap =
        gray[idx - w] +
        gray[idx + w] +
        gray[idx - 1] +
        gray[idx + 1] -
        4 * gray[idx];

      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

function skinStats(
  data: Uint8ClampedArray,
  w: number,
  h: number,
): { ratio: number; centerBias: number } {
  let skinCount = 0;
  let centerSkinCount = 0;

  const cxMin = Math.round(w * 0.25);
  const cxMax = Math.round(w * 0.75);
  const cyMin = Math.round(h * 0.2);
  const cyMax = Math.round(h * 0.8);

  const totalPixels = data.length / 4;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      if (!looksLikeSkin(r, g, b)) continue;

      skinCount++;

      if (x >= cxMin && x <= cxMax && y >= cyMin && y <= cyMax) {
        centerSkinCount++;
      }
    }
  }

  const ratio = totalPixels > 0 ? skinCount / totalPixels : 0;
  const centerBias = skinCount > 0 ? centerSkinCount / skinCount : 0;

  return { ratio, centerBias };
}

function looksLikeSkin(r: number, g: number, b: number): boolean {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

  return y > 40 && cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173;
}
