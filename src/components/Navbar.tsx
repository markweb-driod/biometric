interface NavbarProps {
  userId?: string;
}

export function Navbar({ userId }: NavbarProps) {
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
        <div className="navbar-nav">
          <a href="/" className="active">Enrollment</a>
        </div>
        {userId && (
          <div className="navbar-status">
            <span className="navbar-status-badge">
              <span className="navbar-status-dot" />
              Enrolling
            </span>
            <span className="navbar-status-id">{userId}</span>
          </div>
        )}
      </div>
    </nav>
  );
}
