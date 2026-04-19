import { useState } from 'react';
import { EnrollmentFlow } from './components/EnrollmentFlow';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';

export default function App() {
  const [userId, setUserId] = useState('');
  const [started, setStarted] = useState(false);

  return (
    <>
      <Navbar userId={started ? userId : undefined} />

      <main className="page-main">
        {!started ? (
          <>
            <div className="page-hero">
              <span className="page-hero-badge">Biometric System</span>
              <h1>Student Enrollment</h1>
              <p>
                Capture face and fingerprint data for secure identity
                verification at Nasarawa State University, Keffi.
              </p>
            </div>
            <div className="page-content-area">
              <div className="step-content">
                <h2>Get Started</h2>
                <p className="step-description">
                  Enter the student or staff ID to begin biometric enrollment.
                </p>

                <div className="features-row">
                  <div className="feature-card">
                    <div className="feature-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                    </div>
                    <span className="feature-title">Face Capture</span>
                    <span className="feature-desc">AI-guided photo</span>
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
                    <span className="feature-title">Fingerprint</span>
                    <span className="feature-desc">Secure biometrics</span>
                  </div>
                  <div className="feature-card">
                    <div className="feature-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        <path d="M9 12l2 2 4-4" />
                      </svg>
                    </div>
                    <span className="feature-title">Verified</span>
                    <span className="feature-desc">Identity secured</span>
                  </div>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (userId.trim()) setStarted(true);
                  }}
                  className="enrollment-form"
                >
                  <div className="form-group">
                    <label className="form-label" htmlFor="user-id">Student / Staff ID</label>
                    <input
                      id="user-id"
                      type="text"
                      value={userId}
                      onChange={(e) => setUserId(e.target.value)}
                      placeholder="e.g. NSU/2024/CS/0142"
                      pattern="[A-Za-z0-9/\-]{3,30}"
                      title="Enter a valid student or staff ID (letters, numbers, slashes, dashes)"
                      required
                      className="form-input"
                    />
                  </div>
                  <button type="submit" className="btn btn-primary btn-full">
                    Begin Enrollment
                  </button>
                </form>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="page-hero">
              <span className="page-hero-badge">Enrollment In Progress</span>
              <h1>Biometric Capture</h1>
              <p>Enrolling: <strong>{userId}</strong></p>
            </div>
            <div className="page-content-area">
              <EnrollmentFlow userId={userId} onCancel={() => { setStarted(false); setUserId(''); }} />
            </div>
          </>
        )}
      </main>

      <Footer />
    </>
  );
}
