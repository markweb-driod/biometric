export interface StudentProfile {
  matricNumber: string;
  fullName: string;
  department: string;
  level: string;
  faculty: string;
  status: 'Active' | 'Graduated' | 'Suspended';
  photoUrl?: string;
}

export async function fetchStudentDetails(id: string): Promise<StudentProfile> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 800));

  const normalizedId = id.trim().toUpperCase();

  // Mock implementation for UI testing
  if (normalizedId.includes('STAFF')) {
    return {
      matricNumber: normalizedId,
      fullName: 'Dr. Sarah Ibrahim',
      department: 'Computer Science',
      level: 'Staff',
      faculty: 'Natural & Applied Sciences',
      status: 'Active',
    };
  }

  // Default Mock Student
  return {
    matricNumber: normalizedId,
    fullName: 'Emmanuel O. Ayodele',
    department: 'Computer Science',
    level: '400L',
    faculty: 'Natural & Applied Sciences',
    status: 'Active',
  };
}
