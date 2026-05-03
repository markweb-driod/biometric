interface NavbarProps {
  userId?: string;
  staffUser?: string;
  staffRole?: string;
  onLogout?: () => void;
  onOpenProfile?: () => void;
  onToggleSidebar?: () => void;
  isSidebarCollapsed?: boolean;
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map(w => w[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatRoleLabel(role?: string): string {
  if (!role) return 'Staff Operator';
  if (role === 'admin') return 'Administrator';
  if (role === 'capture_staff') return 'Enrollment Staff';
  if (role === 'verify_staff') return 'Verification Staff';
  return role
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatStaffName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function Navbar({ userId, staffUser, staffRole, onLogout, onOpenProfile, onToggleSidebar, isSidebarCollapsed }: NavbarProps) {
  const displayName = staffUser ? formatStaffName(staffUser) : '';
  const displayRole = formatRoleLabel(staffRole);

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <div className="navbar-left">
          {onToggleSidebar && (
            <button
              type="button"
              className="navbar-sidebar-toggle"
              onClick={onToggleSidebar}
              aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-pressed={Boolean(isSidebarCollapsed)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          )}

          <div className="navbar-context" aria-label="Page context">
            <span className="navbar-context-kicker">Biometric Console</span>
            <strong className="navbar-context-title">Operations Dashboard</strong>
          </div>
        </div>

        <div className="navbar-right">
          {userId && (
            <div className="navbar-session-chip">
              <span className="navbar-session-dot" />
              <span className="navbar-session-label">Active session</span>
              <span className="navbar-session-id">{userId}</span>
            </div>
          )}

          {staffUser && (
            <>
              <div className="navbar-vdivider" />

              {/* Avatar + user info */}
              <div className="navbar-user" aria-label="Profile">
                <div className="navbar-avatar" aria-hidden="true">
                  {getInitials(staffUser)}
                </div>
                <div className="navbar-user-info">
                  <span className="navbar-user-name">{displayName}</span>
                  <span className="navbar-user-role">{displayRole}</span>
                </div>
                {onOpenProfile && (
                  <button
                    type="button"
                    className="navbar-user-tag"
                    onClick={onOpenProfile}
                    aria-label="Open profile"
                  >
                    Profile
                  </button>
                )}
              </div>

              {onLogout && (
                <>
                  <div className="navbar-vdivider" />
                  <button
                    type="button"
                    className="navbar-logout"
                    onClick={onLogout}
                    aria-label="Sign out"
                  >
                    <svg
                      className="navbar-logout-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    <span>Sign out</span>
                  </button>
                </>
              )}
            </>
          )}
        </div>

      </div>
    </nav>
  );
}
