interface NavbarProps {
  userId?: string;
  staffUser?: string;
  onLogout?: () => void;
}

export function Navbar({ userId, staffUser, onLogout }: NavbarProps) {
  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <a href="/" className="navbar-brand">
          <div className="navbar-logo">
            <img src="/images/logo1.png" alt="NSUK" />
          </div>
          <div className="navbar-title">
            <span className="navbar-title-main">NSUK Biometrics</span>
            <span className="navbar-title-sub">Nasarawa State University, Keffi</span>
          </div>
        </a>
        <div className="navbar-right">
          {staffUser && (
            <div className="navbar-staff">
              <span className="navbar-staff-user">{staffUser}</span>
              {onLogout && (
                <button type="button" className="navbar-logout" onClick={onLogout}>
                  Sign out
                </button>
              )}
            </div>
          )}
          {userId && (
            <div className="navbar-status">
              <span className="navbar-status-dot" />
              <span className="navbar-status-id">{userId}</span>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
