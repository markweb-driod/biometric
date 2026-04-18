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
            <div className="step-content" style={{ maxWidth: 420 }}>
              <h2>Get Started</h2>
              <p className="step-description">
                Enter the student or staff ID to begin biometric enrollment.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (userId.trim()) setStarted(true);
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                }}
              >
                <div className="form-group">
                  <label className="form-label" htmlFor="user-id">Student / Staff ID</label>
                  <input
                    id="user-id"
                    type="text"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    placeholder="e.g. NSU/2024/CS/0142"
                    required
                    className="form-input"
                  />
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                  Begin Enrollment
                </button>
              </form>
            </div>
          </>
        ) : (
          <>
            <div className="page-hero">
              <span className="page-hero-badge">Enrollment In Progress</span>
              <h1>Biometric Capture</h1>
              <p>Enrolling: <strong>{userId}</strong></p>
            </div>
            <EnrollmentFlow userId={userId} />
          </>
        )}
      </main>

      <Footer />
    </>
  );
}
