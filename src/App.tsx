import { useEffect, useState } from 'react';
import { EnrollmentFlow } from './components/EnrollmentFlow';
import { VerificationFlow } from './components/VerificationFlow';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { StaffLogin } from './components/StaffLogin';
import { ProfilePage } from './components/ProfilePage';
import { AdminPortal } from './components/AdminPortal';
import {
  getStoredStaffUser,
  getStoredStaffRole,
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
  const [staffRole, setStaffRole] = useState<string | null>(() =>
    getStoredToken() ? getStoredStaffRole() : null
  );
  const [userId, setUserId] = useState('');
  const [started, setStarted] = useState(false);
  const [appMode, setAppMode] = useState<'enroll' | 'verify' | 'profile' | 'admin'>('enroll');
  const [adminTab, setAdminTab] = useState<'overview' | 'enrollments' | 'verifications' | 'users' | 'settings'>('overview');

  const [validationState, setValidationState] = useState<'idle' | 'loading' | 'verified' | 'error'>('idle');
  const [studentData, setStudentData] = useState<StudentProfile | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSidebarMobileOpen, setIsSidebarMobileOpen] = useState(false);

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
        setStaffRole(null);
        setStarted(false);
        setAppMode('enroll');
        setUserId('');
        setValidationState('idle');
        setStudentData(null);
      } else {
        setStaffRole(getStoredStaffRole());
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
    setAppMode('enroll');
    setValidationState('idle');
    setStudentData(null);
    setUserId('');
  };

  const handleOpenEnrollment = () => {
    setAppMode('enroll');
    setStarted(false);
    setValidationState('idle');
    setValidationError(null);
    setStudentData(null);
    setUserId('');
  };

  const closeSidebarOnMobile = () => {
    if (typeof window !== 'undefined' && window.innerWidth <= 860) {
      setIsSidebarMobileOpen(false);
    }
  };

  const handleLogout = () => {
    logoutStaff();
    setStarted(false);
    setAppMode('enroll');
    setValidationState('idle');
    setUserId('');
    setStudentData(null);
    setStaffUser(null);
    setStaffRole(null);
  };

  return (
    <>
      {isAuthChecking ? (
        <div className="auth-checking-screen">
          <span className="spinner" />
          <p>Checking your session…</p>
        </div>
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
            <StaffLogin onSuccess={(username) => {
              setStaffUser(username);
              const role = getStoredStaffRole();
              setStaffRole(role);
              if (role === 'admin') { setAppMode('admin'); setAdminTab('overview'); }
              else if (role === 'verify_staff') setAppMode('verify');
              else setAppMode('enroll');
            }} />
          </div>
        </div>
      ) : (
        <div className={`app-shell${isSidebarCollapsed ? ' sidebar-collapsed' : ''}${isSidebarMobileOpen ? ' sidebar-mobile-open' : ''}`}>
          {/* ── Sidebar ── */}
          <aside className="sidebar">
            <div className="sidebar-brand">
              <img src="/images/logo1.png" alt="NSUK" className="sidebar-logo" />
              <div>
                <div className="sidebar-brand-name">NSUK Biometrics</div>
                <div className="sidebar-brand-sub">Nasarawa State University</div>
              </div>
            </div>

            <nav className="sidebar-nav" aria-label="Main navigation">
              {staffRole === 'admin' && (
                <>
                  <button
                    type="button"
                    className={`sidebar-nav-item${appMode === 'admin' && adminTab === 'overview' ? ' is-active' : ''}`}
                    onClick={() => { setAppMode('admin'); setAdminTab('overview'); closeSidebarOnMobile(); }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                    Overview
                  </button>
                  <button
                    type="button"
                    className={`sidebar-nav-item sidebar-nav-item--sub${appMode === 'admin' && adminTab === 'enrollments' ? ' is-active' : ''}`}
                    onClick={() => { setAppMode('admin'); setAdminTab('enrollments'); closeSidebarOnMobile(); }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    Enrollments
                  </button>
                  <button
                    type="button"
                    className={`sidebar-nav-item sidebar-nav-item--sub${appMode === 'admin' && adminTab === 'verifications' ? ' is-active' : ''}`}
                    onClick={() => { setAppMode('admin'); setAdminTab('verifications'); closeSidebarOnMobile(); }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    Verifications
                  </button>
                  <button
                    type="button"
                    className={`sidebar-nav-item sidebar-nav-item--sub${appMode === 'admin' && adminTab === 'users' ? ' is-active' : ''}`}
                    onClick={() => { setAppMode('admin'); setAdminTab('users'); closeSidebarOnMobile(); }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    Staff Users
                  </button>
                  <button
                    type="button"
                    className={`sidebar-nav-item sidebar-nav-item--sub${appMode === 'admin' && adminTab === 'settings' ? ' is-active' : ''}`}
                    onClick={() => { setAppMode('admin'); setAdminTab('settings'); closeSidebarOnMobile(); }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    Settings
                  </button>
                  <div className="sidebar-nav-divider" />
                </>
              )}

              {(staffRole === 'admin' || staffRole === 'capture_staff') && (
                <button
                  type="button"
                  className={`sidebar-nav-item${appMode === 'enroll' ? ' is-active' : ''}`}
                  onClick={() => { handleOpenEnrollment(); closeSidebarOnMobile(); }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                  Register a Student
                </button>
              )}

              {(staffRole === 'admin' || staffRole === 'verify_staff') && (
                <button
                  type="button"
                  className={`sidebar-nav-item${appMode === 'verify' ? ' is-active' : ''}`}
                  onClick={() => { setAppMode('verify'); closeSidebarOnMobile(); }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  Check Identity
                </button>
              )}


              <button
                type="button"
                className={`sidebar-nav-item${appMode === 'profile' ? ' is-active' : ''}`}
                onClick={() => { setAppMode('profile'); closeSidebarOnMobile(); }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                Profile
              </button>

            </nav>

            <div className="sidebar-footer">
              <div className="sidebar-user">
                <div className="sidebar-avatar">{(staffUser ?? 'S')[0].toUpperCase()}</div>
                <div className="sidebar-user-info">
                  <span className="sidebar-user-name">{staffUser}</span>
                  <span className="sidebar-user-role">
                    {staffRole === 'admin' ? 'Administrator' : staffRole === 'capture_staff' ? 'Enrollment Staff' : staffRole === 'verify_staff' ? 'Verification Staff' : 'Staff'}
                  </span>
                </div>
              </div>
              <button type="button" className="sidebar-logout-btn" onClick={handleLogout} aria-label="Sign out">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Sign out
              </button>
            </div>
          </aside>

          {isSidebarMobileOpen && (
            <button
              type="button"
              className="sidebar-backdrop"
              aria-label="Close menu"
              onClick={() => setIsSidebarMobileOpen(false)}
            />
          )}

          {/* ── Main content ── */}
          <div className="app-content">
            <Navbar
              userId={started ? userId : undefined}
              staffUser={staffUser ?? undefined}
              staffRole={staffRole ?? undefined}
              onLogout={handleLogout}
              onOpenProfile={() => {
                setAppMode('profile');
                closeSidebarOnMobile();
              }}
              onToggleSidebar={() => {
                if (typeof window !== 'undefined' && window.innerWidth <= 860) {
                  setIsSidebarMobileOpen((prev) => !prev);
                  return;
                }
                setIsSidebarCollapsed((prev) => !prev);
              }}
              isSidebarCollapsed={isSidebarCollapsed}
            />
            <main className="app-content-body">
            {appMode === 'admin' ? (
              <AdminPortal activeTab={adminTab} onTabChange={setAdminTab} />
            ) : appMode === 'verify' ? (
              <VerificationFlow onCancel={() => setAppMode(staffRole === 'verify_staff' ? 'verify' : 'enroll')} />
            ) : appMode === 'profile' ? (
              <ProfilePage
                staffUser={staffUser ?? undefined}
              />
            ) : appMode === 'enroll' && started ? (
              <EnrollmentFlow userId={userId} onCancel={handleCancelEnrollment} />
            ) : (
              /* Enrollment ID-entry step */
              <div className="step-content enroll-shell">
                {validationState === 'idle' || validationState === 'error' ? (
                  <>
                    <div className="enroll-card-eyebrow">
                      <span className="enroll-card-eyebrow-dot" />
                      New Registration
                    </div>

                    <div className="compact-header">
                      <h2>Register a Student</h2>
                      <p className="step-description">
                        Enter the student's ID to look them up before taking their photo.
                      </p>
                    </div>

                    <div className="enroll-notice" role="status" aria-live="polite">
                      The face scan will start once the camera is ready. Please make sure the student is looking directly at the camera.
                    </div>

                    {validationState === 'error' && (
                      <div className="status-banner status-error" role="alert">
                        <span className="status-message">{validationError}</span>
                      </div>
                    )}

                    <div className="process-rail">
                      <div className="process-step process-step--active">
                        <div className="process-step-num">01</div>
                        <div className="process-step-label">Look up</div>
                        <div className="process-step-sub">Enter ID</div>
                      </div>
                      <div className="process-rail-line" />
                      <div className="process-step">
                        <div className="process-step-num">02</div>
                        <div className="process-step-label">Take photo</div>
                        <div className="process-step-sub">Face scan</div>
                      </div>
                      <div className="process-rail-line" />
                      <div className="process-step">
                        <div className="process-step-num">03</div>
                        <div className="process-step-label">Save</div>
                        <div className="process-step-sub">Record saved</div>
                      </div>
                    </div>

                    <div className="enroll-form-divider" />

                    <form onSubmit={handleVerify} className="enrollment-form">
                      <div className="form-group">
                        <label className="form-label" htmlFor="user-id">Student / Staff ID</label>
                        <div className="form-input-wrap">
                          <span className="form-input-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="2" y="5" width="20" height="14" rx="2" />
                              <line x1="2" y1="10" x2="22" y2="10" />
                            </svg>
                          </span>
                          <input
                            id="user-id"
                            type="text"
                            value={userId}
                            onChange={(e) => setUserId(e.target.value)}
                            placeholder="e.g. NSU/2024/CS/0142"
                            pattern="[A-Za-z0-9\/\-]{3,30}"
                            title="Enter a valid student or staff ID (letters, numbers, slashes, dashes)"
                            autoFocus
                            required
                            className="form-input form-input--prefixed"
                          />
                        </div>
                        <span className="form-input-hint">Enter the matric number or staff ID exactly as printed on the ID card</span>
                      </div>
                      <button type="submit" className="btn btn-primary btn-full btn-validate">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                        Find Student
                      </button>
                    </form>


                  </>
                ) : validationState === 'loading' ? (
                  <div className="validation-loading-state">
                    <span className="spinner spinner-large" />
                    <h2>Verifying Student ID…</h2>
                    <p className="step-description">Checking <strong>{userId}</strong> against the school database. This may take a few seconds.</p>
                  </div>
                ) : validationState === 'verified' && studentData ? (
                  <div className="validation-card-wrapper">
                    <h2>Is this the right person?</h2>
                    <p className="step-description">Check that the details below match the student standing in front of you before continuing.</p>

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
                          <span className="detail-label">ID Number</span>
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
                        Yes, continue to photo
                      </button>
                      <button type="button" className="btn btn-ghost btn-full cancel-link" onClick={handleCancelValidation}>
                        No, search again
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
            </main>
            <Footer />
          </div>
        </div>
      )}
    </>
  );
}
