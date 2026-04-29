import { useState } from 'react';
import { loginStaff } from '../services/authApi';

interface StaffLoginProps {
  onSuccess: (username: string) => void;
}

export function StaffLogin({ onSuccess }: StaffLoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await loginStaff(username, password);
      onSuccess(username.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="step-content login-card">
        <h2>Staff Login</h2>
        <p className="step-description">
          Sign in with your authorized staff account to access the biometric capture portal.
        </p>

        {error && (
          <div className="status-banner status-error" role="alert">
            <span className="status-message">{error}</span>
          </div>
        )}

        <form className="enrollment-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="staff-username">Username</label>
            <input
              id="staff-username"
              className="form-input"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter staff username"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="staff-password">Password</label>
            <input
              id="staff-password"
              className="form-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>

          <button type="submit" className="btn btn-primary btn-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <span className="spinner" /> Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
