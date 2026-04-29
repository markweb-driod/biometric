/**
 * Tests for imageQuality.ts
 *
 * JSDOM does not implement HTMLCanvasElement drawing. We stub the
 * canvas/image layer so each test injects exact pixel data rather than
 * relying on real image decoding, keeping the suite fast and deterministic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { analyzeImageQuality } from './imageQuality';
import type { QualityIssue } from './imageQuality';

// ── Canvas / Image stubs ─────────────────────────────────────────────────────

/** Fill a Uint8ClampedArray with RGBA pixels of a given luminance (grey). */
function greyPixels(count: number, luma: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < count * 4; i += 4) {
    data[i] = luma;
    data[i + 1] = luma;
    data[i + 2] = luma;
    data[i + 3] = 255;
  }
  return data;
}

/**
 * Alternating dark/light stripes so the Laplacian variance is high (sharp).
 * Each pair of consecutive pixels swaps between `low` and `high` luma values,
 * producing maximum edge signal and a well-above-threshold sharpness score.
 */
function stripedPixels(count: number, low = 80, high = 200): Uint8ClampedArray {
  const data = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < count * 4; i += 4) {
    const px = (i / 4) % 2 === 0 ? low : high;
    data[i] = px;
    data[i + 1] = px;
    data[i + 2] = px;
    data[i + 3] = 255;
  }
  return data;
}

/** All-white pixels — triggers overexposure. */
function blownPixels(count: number): Uint8ClampedArray {
  return greyPixels(count, 255);
}

/** Skin-tone pixels in YCbCr-valid range (approx R=200 G=150 B=120). */
function skinPixels(count: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < count * 4; i += 4) {
    data[i] = 200;     // R
    data[i + 1] = 150; // G
    data[i + 2] = 120; // B
    data[i + 3] = 255;
  }
  return data;
}

/**
 * Stub window.Image and document.createElement('canvas') so analyzeImageQuality
 * receives exactly the pixel data we supply.
 *
 * @param opts.w        Source image width reported by HTMLImageElement
 * @param opts.h        Source image height
 * @param opts.pixels   Pixel data returned for face-region getImageData calls
 * @param opts.fullPixels  Pixel data used for the full-frame (sharpness) call.
 *                         Defaults to high-variance stripes so blur never errors.
 */
function stubCanvas(opts: {
  w: number;
  h: number;
  pixels: Uint8ClampedArray;
  fullPixels?: Uint8ClampedArray;
}): void {
  const { w, h, pixels } = opts;
  // Default full-frame data: alternating 80/200 luma stripes → high Laplacian variance.
  const fullPixels = opts.fullPixels ?? stripedPixels(w * h, 80, 200);
  let callCount = 0;

  // Stub HTMLImageElement
  vi.stubGlobal(
    'Image',
    class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = w;
      height = h;
      set src(_: string) {
        // Fire onload synchronously to keep test code simple.
        this.onload?.();
      }
    },
  );

  // Stub document.createElement so 'canvas' returns a minimal mock.
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'canvas') {
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: vi.fn(),
          getImageData: (_x: number, _y: number, pw: number, ph: number) => {
            // First call is the full-frame read (sharpness).
            // Subsequent calls are face-region reads (brightness, skin, etc.).
            callCount += 1;
            const src = callCount === 1 ? fullPixels : pixels;
            return { data: src.slice(0, pw * ph * 4) };
          },
        }),
      } as unknown as HTMLCanvasElement;
    }
    // Fall back to real implementation for anything else.
    return document.createElement.call(document, tag);
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function runQuality(pixels: Uint8ClampedArray, w = 640, h = 480) {
  stubCanvas({ w, h, pixels });
  return analyzeImageQuality('data:image/jpeg;base64,fake');
}

function issuesWith(issues: QualityIssue[], code: string) {
  return issues.filter((i) => i.code === code);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('analyzeImageQuality — resolution checks', () => {
  afterEach(() => vi.restoreAllMocks());

  it('flags error for image below hard minimum (< 240×200)', async () => {
    const pixels = greyPixels(100 * 80, 120);
    const result = await runQuality(pixels, 100, 80);
    const issues = issuesWith(result.issues, 'low-resolution');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(result.passed).toBe(false);
  });

  it('flags warning for image between hard min and recommended min (240×200 – 319×239)', async () => {
    const pixels = greyPixels(280 * 220, 120);
    const result = await runQuality(pixels, 280, 220);
    const issues = issuesWith(result.issues, 'low-resolution');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
  });

  it('no resolution issue for image at or above 320×240', async () => {
    const pixels = greyPixels(320 * 240, 120);
    const result = await runQuality(pixels, 320, 240);
    expect(issuesWith(result.issues, 'low-resolution')).toHaveLength(0);
  });
});

describe('analyzeImageQuality — brightness checks', () => {
  afterEach(() => vi.restoreAllMocks());

  it('flags error-level too-dark for luma < 32', async () => {
    const pixels = greyPixels(640 * 480, 20);
    const result = await runQuality(pixels);
    const issues = issuesWith(result.issues, 'too-dark');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(result.passed).toBe(false);
  });

  it('flags warning-level too-dark for luma between 32 and 50', async () => {
    // Face-region pixels: skin-tone at luma ~40 (32 < luma < 50 → warning only).
    // R=55 G=40 B=30 → Y ≈ 0.299*55 + 0.587*40 + 0.114*30 ≈ 16.4+23.5+3.4 ≈ 43
    // Skin-tone: Cb ≈ 128 - 0.168736*55 - 0.331264*40 + 0.5*30 ≈ 128-9.3-13.3+15 ≈ 120 ✓
    //            Cr ≈ 128 + 0.5*55 - 0.418688*40 - 0.081312*30 ≈ 128+27.5-16.7-2.4 ≈ 136 ✓
    const count = 640 * 480;
    const facePixels = new Uint8ClampedArray(count * 4);
    for (let i = 0; i < count * 4; i += 4) {
      facePixels[i] = 55; facePixels[i + 1] = 40; facePixels[i + 2] = 30; facePixels[i + 3] = 255;
    }
    // Full-frame uses striped high-contrast pixels for adequate sharpness score.
    stubCanvas({ w: 640, h: 480, pixels: facePixels, fullPixels: stripedPixels(640 * 480, 80, 200) });
    const result = await analyzeImageQuality('data:image/jpeg;base64,fake');
    const issues = issuesWith(result.issues, 'too-dark');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    // Warning alone does not block submission.
    expect(result.passed).toBe(true);
  });

  it('no brightness issue for luma >= 50', async () => {
    const pixels = greyPixels(640 * 480, 128);
    const result = await runQuality(pixels);
    expect(issuesWith(result.issues, 'too-dark')).toHaveLength(0);
  });
});

describe('analyzeImageQuality — overexposure checks', () => {
  afterEach(() => vi.restoreAllMocks());

  it('flags error-level too-bright when most pixels are blown out', async () => {
    // All 255 → overexposed ratio = 1.0, well above 0.35 error threshold.
    const result = await runQuality(blownPixels(640 * 480));
    const issues = issuesWith(result.issues, 'too-bright');
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].severity).toBe('error');
    expect(result.passed).toBe(false);
  });

  it('no overexposure issue for normal mid-tone pixels', async () => {
    const result = await runQuality(greyPixels(640 * 480, 128));
    expect(issuesWith(result.issues, 'too-bright')).toHaveLength(0);
  });
});

describe('analyzeImageQuality — face visibility', () => {
  afterEach(() => vi.restoreAllMocks());

  it('flags error face-not-visible when no skin pixels present', async () => {
    // Pure blue pixels — no skin tone match expected.
    const pixels = new Uint8ClampedArray(640 * 480 * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 0;   // R
      pixels[i + 1] = 0;   // G
      pixels[i + 2] = 200; // B
      pixels[i + 3] = 255;
    }
    const result = await runQuality(pixels);
    const issues = issuesWith(result.issues, 'face-not-visible');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(result.passed).toBe(false);
  });
});

describe('analyzeImageQuality — pass/fail logic', () => {
  afterEach(() => vi.restoreAllMocks());

  it('passed = true when no error-severity issues exist', async () => {
    // Striped skin-tone pixels: adequate luma AND high sharpness → no error issues.
    // Skin R=200 G=150 B=120 luma ≈ 161 (well above 50). Alternating rows give
    // high Laplacian variance so no blur error fires.
    const pixels = skinPixels(640 * 480);
    const result = await runQuality(pixels);
    // There may be off-center or distance warnings; the key check is passed.
    expect(result.passed).toBe(true);
  });

  it('passed = false when any issue has severity error', async () => {
    // Very dark flat pixels → brightness error. Sharpness also triggers error,
    // but passed = false is set by any one error, so this still passes the test.
    const result = await runQuality(greyPixels(640 * 480, 10));
    expect(result.passed).toBe(false);
  });

  it('returns no error-severity issues for an ideal capture', async () => {
    // Skin-tone pixels: good luma, high sharpness.
    const pixels = skinPixels(640 * 480);
    const result = await runQuality(pixels);
    const errors = result.issues.filter((i) => i.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('resolves successfully even when image fails to load (onerror path)', async () => {
    vi.stubGlobal(
      'Image',
      class {
        onerror: (() => void) | null = null;
        onload: (() => void) | null = null;
        set src(_: string) {
          this.onerror?.();
        }
      },
    );
    const result = await analyzeImageQuality('data:image/jpeg;base64,bad');
    // Graceful fallback: pass through without crashing.
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
    vi.unstubAllGlobals();
  });
});

describe('analyzeImageQuality — issue deduplication', () => {
  afterEach(() => vi.restoreAllMocks());

  it('never returns more than one issue per code', async () => {
    // Very dark + blown (contradictory but exercises dedup path):
    // use a pixel set that might trigger two brightness codes.
    const pixels = greyPixels(640 * 480, 20);
    const result = await runQuality(pixels);
    const codes = result.issues.map((i) => i.code);
    const unique = new Set(codes);
    expect(codes.length).toBe(unique.size);
  });
});
