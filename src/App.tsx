import { useEffect, useState } from 'react';
import { EnrollmentFlow } from './components/EnrollmentFlow';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { StaffLogin } from './components/StaffLogin';
import {
  getStoredStaffUser,
  getStoredToken,
  logoutStaff,
  validateStoredSession,
} from './services/authApi';
import { fetchStudentDetails, StudentProfile } from './services/studentApi';

export default function App() {
  const [isAuthChecking, setIsAuthChecking] = useState(() => Boolean(getStoredToken()));
  const [staffUser, setStaffUser] = useState<string | null>(() =>
    getStoredToken() ? getStoredStaffUser() ?? 'staff' : null
  );
  const [userId, setUserId] = useState('');
  const [started, setStarted] = useState(false);
  
  // Validation State
  const [validationState, setValidationState] = useState<'idle' | 'loading' | 'verified' | 'error'>('idle');
  const [studentData, setStudentData] = useState<StudentProfile | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const isAuthenticated = Boolean(staffUser && getStoredToken());

  useEffect(() => {
    let cancelled = false;

    const verifySession = async () => {
      const token = getStoredToken();
      if (!token) {
        if (!cancelled) setIsAuthChecking(false);
        return;
      }

      const isValid = await validateStoredSession().catch(() => false);
      if (cancelled) return;

      if (!isValid) {
        logoutStaff();
        setStaffUser(null);
        setStarted(false);
        setUserId('');
        setValidationState('idle');
      }

      setIsAuthChecking(false);
    };

    verifySession();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId.trim()) return;

    setValidationState('loading');
    setValidationError(null);

    try {
      const data = await fetchStudentDetails(userId);
      setStudentData(data);
      setValidationState('verified');
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Failed to verify Subject ID.');
      setValidationState('error');
    }
  };

  const handleCancelValidation = () => {
    setValidationState('idle');
    setStudentData(null);
    setUserId('');
  };

  const handleCancelEnrollment = () => {
    setStarted(false);
    setValidationState('idle');
    setStudentData(null);
    setUserId('');
  };

  return (
    <>
      <Navbar
        userId={started ? userId : undefined}
        staffUser={staffUser ?? undefined}
        onLogout={
          isAuthenticated
            ? () => {
                logoutStaff();
                setStarted(false);
                setValidationState('idle');
                setUserId('');
                setStudentData(null);
                setStaffUser(null);
              }
            : undefined
        }
      />

      <main className="page-main">
        {isAuthChecking ? (
          <>
            <div className="page-content-area" style={{ marginTop: '3rem' }}>
              <div className="step-content login-card auth-check-card">
                <span className="spinner" />
                <p>Validating secure session...</p>
              </div>
            </div>
          </>
        ) : !isAuthenticated ? (
          <div className="login-split">
            <div className="login-split-left">
              <div className="login-split-overlay" />
              <img src="/images/login-bg.163a8f84.jpg" alt="" className="login-split-bg" />
              <div className="login-split-content">
                <img src="/images/logo1.png" alt="NSUK" className="login-split-logo" />
                <h1>NSUK Biometrics</h1>
                <p>Nasarawa State University, Keffi</p>
                <div className="login-split-divider" />
                <p className="login-split-tagline">
                  Secure biometric enrollment system for student and staff identity verification.
                </p>
              </div>
            </div>
            <div className="login-split-right">
              <StaffLogin onSuccess={setStaffUser} />
            </div>
          </div>
        ) : !started ? (
          <>
            <div className="page-content-area" style={{ marginTop: '2.5rem' }}>
              <div className="step-content">
                
                {validationState === 'idle' || validationState === 'error' ? (
                  <>
                    <div className="compact-header">
                      <h2>Biometric Enrollment</h2>
                      <p className="step-description">Enter the subject's student or staff ID to begin a new session.</p>
                    </div>

                    {validationState === 'error' && (
                      <div className="status-banner status-error" role="alert">
                        <span className="status-message">{validationError}</span>
                      </div>
                    )}

                    <div className="features-row">
                      <div className="feature-card">
                        <div className="feature-icon">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                            <circle cx="12" cy="13" r="4" />
                          </svg>
                        </div>
                        <span className="feature-title">Verify</span>
                        <span className="feature-desc">Lookup details</span>
                      </div>
                      <div className="feature-card">
                        <div className="feature-icon">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
                            <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
                            <path d="M2 12a10 10 0 0 1 18-6" />
                            <path d="M21.8 16c.2-2 .131-5.354 0-6" />
                            <path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
                          </svg>
                        </div>
                        <span className="feature-title">Capture</span>
                        <span className="feature-desc">Face & Fingerprint</span>
                      </div>
                      <div className="feature-card">
                        <div className="feature-icon">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            <path d="M9 12l2 2 4-4" />
                          </svg>
                        </div>
                        <span className="feature-title">Secure</span>
                        <span className="feature-desc">Identity enrolled</span>
                      </div>
                    </div>

                    <form onSubmit={handleVerify} className="enrollment-form">
                      <div className="form-group">
                        <label className="form-label" htmlFor="user-id">Subject ID (Student / Staff)</label>
                        <input
                          id="user-id"
                          type="text"
                          value={userId}
                          onChange={(e) => setUserId(e.target.value)}
                          placeholder="e.g. NSU/2024/CS/0142"
                          pattern="[A-Za-z0-9/-]{3,30}"
                          title="Enter a valid student or staff ID (letters, numbers, slashes, dashes)"
                          required
                          className="form-input"
                        />
                      </div>
                      <button type="submit" className="btn btn-primary btn-full">
                        Verify Subject ID
                      </button>
                    </form>
                  </>
                ) : validationState === 'loading' ? (
                  <div className="validation-loading-state">
                    <span className="spinner spinner-large" />
                    <h2>Verifying Subject Details...</h2>
                    <p className="step-description">Looking up records for <strong>{userId}</strong> in the central database.</p>
                  </div>
                ) : validationState === 'verified' && studentData ? (
                  <div className="validation-card-wrapper">
                    <h2>Verify Profile</h2>
                    <p className="step-description">Please ensure the individual matches the details retrieved from the school database before proceeding.</p>
                    
                    <div className="student-profile-card">
                      <div className="student-profile-header">
                        {studentData.photoUrl && (
                          <div className="student-avatar-placeholder">
                            <img src={studentData.photoUrl} alt="Student" className="student-avatar-img" />
                          </div>
                        )}
                        <div className="student-header-info">
                          <h3>{studentData.fullName}</h3>
                          <span className={`status-badge ${studentData.status === 'Active' ? 'status-active' : 'status-inactive'}`}>
                            {studentData.status}
                          </span>
                        </div>
                      </div>

                      <div className="student-details-grid">
                        <div className="detail-item">
                          <span className="detail-label">Subject ID</span>
                          <span className="detail-value highlight">{studentData.matricNumber}</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Level / Role</span>
                          <span className="detail-value">{studentData.level}</span>
                        </div>
                        <div className="detail-item full-width">
                          <span className="detail-label">Department</span>
                          <span className="detail-value">{studentData.department}</span>
                        </div>
                        <div className="detail-item full-width">
                          <span className="detail-label">Faculty</span>
                          <span className="detail-value">{studentData.faculty}</span>
                        </div>
                      </div>
                    </div>

                    <div className="validation-actions">
                      <button type="button" className="btn btn-primary btn-full" onClick={() => setStarted(true)}>
                        Confirm & Proceed to Capture
                      </button>
                      <button type="button" className="btn btn-ghost btn-full cancel-link" onClick={handleCancelValidation}>
                        Cancel / Enter Another ID
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="page-content-area" style={{ marginTop: '2.5rem' }}>
              <EnrollmentFlow userId={userId} onCancel={handleCancelEnrollment} />
            </div>
          </>
        )}
      </main>

      <Footer />
    </>
  );
}
