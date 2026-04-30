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
      <div className="login-form-wrapper">
        <div className="login-form-header">
          <h2>Sign in to continue</h2>
          <p>Enter your authorized staff credentials to access the biometric capture portal.</p>
        </div>

        {error && (
          <div className="status-banner status-error" role="alert">
            <span className="status-message">{error}</span>
          </div>
        )}

        <form className="enrollment-form" onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="staff-username">Username</label>
            <input
              id="staff-username"
              className={`form-input ${username.length > 0 && username.length < 3 ? 'form-input-invalid' : ''} ${username.length >= 3 ? 'form-input-valid' : ''}`}
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter staff username"
              required
            />
            {username.length > 0 && username.length < 3 && (
              <span className="form-error-text">Username must be at least 3 characters.</span>
            )}
          </div>

          <div className="form-group">
            <div className="form-label-row">
              <label className="form-label" htmlFor="staff-password">Password</label>
            </div>
            <input
              id="staff-password"
              className={`form-input ${password.length > 0 && password.length < 5 ? 'form-input-invalid' : ''} ${password.length >= 5 ? 'form-input-valid' : ''}`}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
            {password.length > 0 && password.length < 5 && (
              <span className="form-error-text">Password must be at least 5 characters.</span>
            )}
          </div>

          <button 
            type="submit" 
            className="btn btn-primary btn-full" 
            disabled={isSubmitting || username.length < 3 || password.length < 5}
          >
            {isSubmitting ? (
              <>
                <span className="spinner" /> Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <p className="login-footer-note">
          Access restricted to authorized personnel only.
        </p>
      </div>
    </div>
  );
}
