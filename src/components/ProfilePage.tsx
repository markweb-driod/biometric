import { FormEvent, useMemo, useState } from 'react';
import { changePassword } from '../services/authApi';

interface ProfilePageProps {
  staffUser?: string;
}

function formatName(name?: string): string {
  if (!name) return 'Staff User';
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function ProfilePage({ staffUser }: ProfilePageProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const displayName = useMemo(() => formatName(staffUser), [staffUser]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setErrorMessage('All password fields are required.');
      return;
    }

    if (newPassword.length < 8) {
      setErrorMessage('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('New password and confirmation do not match.');
      return;
    }

    if (currentPassword === newPassword) {
      setErrorMessage('New password must be different from current password.');
      return;
    }

    setIsSubmitting(true);

    try {
      await changePassword(currentPassword, newPassword);
      setSuccessMessage('Password updated successfully. Use the new password next time you sign in.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update password right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="profile-page" aria-label="Profile management">
      <header className="profile-page-header">
        <h1>Account Settings</h1>
        <p>Review your account information and keep your password secure.</p>
      </header>

      <div className="profile-grid">
        <article className="profile-card profile-card-account">
          <div className="profile-card-head">
            <div className="profile-avatar" aria-hidden="true">
              {(staffUser ?? 'S')[0].toUpperCase()}
            </div>
            <div>
              <h2>{displayName}</h2>
              <p>Staff account</p>
            </div>
          </div>

          <div className="profile-section-title">Account Information</div>

          <div className="profile-info-grid">
            <div className="form-group">
              <label className="form-label" htmlFor="profile-username">Username</label>
              <input
                id="profile-username"
                type="text"
                className="form-input"
                value={staffUser ?? 'Not available'}
                readOnly
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="profile-account-status">Account</label>
              <input
                id="profile-account-status"
                type="text"
                className="form-input"
                value="Authenticated"
                readOnly
              />
            </div>

            <p className="profile-help-text">Contact an administrator to update role or username records.</p>
          </div>
        </article>

        <article className="profile-card profile-card-security">
          <div className="profile-security-header">
            <h2>Change Password</h2>
            <p>Use at least 8 characters and avoid reusing your current password.</p>
          </div>

          {errorMessage && (
            <div className="status-banner status-error" role="alert">
              <span className="status-message">{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="status-banner status-success" role="status">
              <span className="status-message">{successMessage}</span>
            </div>
          )}

          <form className="profile-password-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="current-password">Current password</label>
              <input
                id="current-password"
                type="password"
                className="form-input"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="new-password">New password</label>
              <input
                id="new-password"
                type="password"
                className="form-input"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="confirm-password">Confirm new password</label>
              <input
                id="confirm-password"
                type="password"
                className="form-input"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary profile-submit-btn" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <span className="spinner" />
                  Updating Password...
                </>
              ) : (
                'Update Password'
              )}
            </button>
          </form>
        </article>
      </div>
    </section>
  );
}