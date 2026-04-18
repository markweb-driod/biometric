const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

interface EnrollFacePayload {
  userId: string;
  image: string; // base64 data URL
}

interface EnrollFaceResponse {
  success: boolean;
  message?: string;
}

export async function enrollFace(
  payload: EnrollFacePayload
): Promise<EnrollFaceResponse> {
  const response = await fetch(`${API_BASE}/enroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: payload.userId,
      image: payload.image,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      body?.message ?? `Enrollment failed (HTTP ${response.status})`
    );
  }

  return response.json();
}
