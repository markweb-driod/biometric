import { getStoredToken } from './authApi';

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';

export interface StudentProfile {
  matricNumber: string;
  fullName: string;
  department: string;
  level: string;
  faculty: string;
  status: 'Active' | 'Graduated' | 'Suspended';
  photoUrl?: string;
}

interface ApiStudent {
  id: number;
  external_id: string;
  full_name: string;
  biometric_enrolled: boolean;
}

export async function fetchStudentDetails(id: string): Promise<StudentProfile> {
  const normalizedId = id.trim().toUpperCase();
  if (!normalizedId) {
    throw new Error('Please enter a valid student ID.');
  }

  const token = getStoredToken();
  if (!token) {
    throw new Error('Your session has expired. Please sign in again.');
  }

  const response = await fetch(`${API_BASE}/students/?skip=0&limit=500`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const payload = (await response.json().catch(() => null)) as ApiStudent[] | { detail?: string } | null;

  if (response.status === 401) {
    throw new Error('Your session has expired. Please sign in again.');
  }

  if (!response.ok) {
    const message =
      payload && !Array.isArray(payload) && typeof payload.detail === 'string'
        ? payload.detail
        : `Failed to fetch students (HTTP ${response.status})`;
    throw new Error(message);
  }

  if (!Array.isArray(payload)) {
    throw new Error('Invalid students response from server.');
  }

  const student = payload.find((item) => item.external_id?.toUpperCase() === normalizedId);
  if (!student) {
    throw new Error(`Student ID "${normalizedId}" was not found. Please verify the ID is correct and the student is enrolled in the system.`);
  }

  return {
    matricNumber: student.external_id,
    fullName: student.full_name,
    department: 'Not provided by source',
    level: student.biometric_enrolled ? 'Enrolled' : 'Pending enrollment',
    faculty: 'Not provided by source',
    status: 'Active',
  };
}
