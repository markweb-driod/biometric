import { useEffect, useState, useCallback } from 'react';
import {
  fetchAdminStats,
  fetchEnrollments,
  fetchStaffUsers,
  fetchVerificationLogs,
  fetchSystemSettings,
  updateEnrollmentStatus,
  deleteEnrollment,
  createStaffUser,
  toggleUserActive,
  deleteStaffUser,
  updateSystemSettings,
  reloadIndex,
  AdminStats,
  EnrollmentItem,
  StaffUser,
  VerificationLogItem,
  VerificationLogsParams,
  SystemSettings,
} from '../services/adminApi';

type AdminTab = 'overview' | 'enrollments' | 'verifications' | 'users' | 'settings';

interface AdminPortalProps {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
}

// ── tiny helpers ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'badge-green',
    rejected: 'badge-red',
    expired: 'badge-gray',
    pending: 'badge-yellow',
  };
  return <span className={`adm-badge ${map[status] ?? 'badge-gray'}`}>{status}</span>;
}

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, string> = {
    admin: 'badge-purple',
    capture_staff: 'badge-blue',
    verify_staff: 'badge-teal',
  };
  const label: Record<string, string> = {
    admin: 'Admin',
    capture_staff: 'Enroll Staff',
    verify_staff: 'Verify Staff',
  };
  return <span className={`adm-badge ${map[role] ?? 'badge-gray'}`}>{label[role] ?? role}</span>;
}

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

function fmtTs(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

// ── stat card ────────────────────────────────────────────────────────────────

interface StatCardProps { label: string; value: string | number; sub?: string; color?: string; icon: React.ReactNode; }

function StatCard({ label, value, sub, color = 'var(--accent)', icon }: StatCardProps) {
  return (
    <div className="adm-stat-card">
      <div className="adm-stat-icon" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>
        {icon}
      </div>
      <div className="adm-stat-body">
        <div className="adm-stat-value" style={{ color }}>{value}</div>
        <div className="adm-stat-label">{label}</div>
        {sub && <div className="adm-stat-sub">{sub}</div>}
      </div>
    </div>
  );
}

// ── confirm modal ─────────────────────────────────────────────────────────────

interface ConfirmProps { message: string; onConfirm: () => void; onCancel: () => void; danger?: boolean; }

function ConfirmModal({ message, onConfirm, onCancel, danger }: ConfirmProps) {
  return (
    <div className="adm-modal-overlay" onClick={onCancel}>
      <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
        <p className="adm-modal-msg">{message}</p>
        <div className="adm-modal-actions">
          <button className="adm-btn adm-btn-ghost" onClick={onCancel}>Cancel</button>
          <button className={`adm-btn ${danger ? 'adm-btn-danger' : 'adm-btn-primary'}`} onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

// ── create user modal ─────────────────────────────────────────────────────────

interface CreateUserModalProps { onClose: () => void; onCreated: () => void; }

function CreateUserModal({ onClose, onCreated }: CreateUserModalProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'capture_staff' | 'verify_staff'>('capture_staff');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await createStaffUser({ username, password, role, is_active: true });
      onCreated();
      onClose();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Failed to create user');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="adm-modal-overlay" onClick={onClose}>
      <div className="adm-modal adm-modal-form" onClick={(e) => e.stopPropagation()}>
        <div className="adm-modal-header">
          <h3>Create Staff Account</h3>
          <button className="adm-modal-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        {err && <div className="adm-error-msg">{err}</div>}
        <form onSubmit={handleSubmit} className="adm-form">
          <div className="adm-form-group">
            <label>Username</label>
            <input className="adm-input" type="text" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} maxLength={40} autoFocus />
          </div>
          <div className="adm-form-group">
            <label>Password</label>
            <input className="adm-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </div>
          <div className="adm-form-group">
            <label>Role</label>
            <select className="adm-input" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
              <option value="capture_staff">Enrollment Staff</option>
              <option value="verify_staff">Verification Staff</option>
            </select>
          </div>
          <div className="adm-modal-actions">
            <button type="button" className="adm-btn adm-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="adm-btn adm-btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create Account'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── enrollment preview modal ──────────────────────────────────────────────────

interface EnrollmentPreviewProps { item: EnrollmentItem; onClose: () => void; }

function EnrollmentPreviewModal({ item, onClose }: EnrollmentPreviewProps) {
  const thumb = item.metadata_json?.thumbnail as string | undefined;
  const meta = item.metadata_json ?? {};
  return (
    <div className="adm-modal-overlay" onClick={onClose}>
      <div className="adm-modal adm-modal-preview" onClick={(e) => e.stopPropagation()}>
        <div className="adm-modal-header">
          <h3>Enrollment Preview</h3>
          <button className="adm-modal-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="adm-preview-body">
          <div className="adm-preview-photo">
            {thumb
              ? <img src={thumb} alt={item.full_name} className="adm-preview-img" />
              : <div className="adm-preview-no-photo">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="40" height="40"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  <span>No photo</span>
                </div>
            }
          </div>
          <div className="adm-preview-details">
            <div className="adm-preview-row"><span className="adm-preview-key">Name</span><span className="adm-preview-val">{item.full_name}</span></div>
            <div className="adm-preview-row"><span className="adm-preview-key">ID</span><span className="adm-preview-val adm-td-id">{item.external_id}</span></div>
            <div className="adm-preview-row"><span className="adm-preview-key">Status</span><span className="adm-preview-val"><StatusBadge status={item.status} /></span></div>
            <div className="adm-preview-row"><span className="adm-preview-key">Enrolled</span><span className="adm-preview-val">{fmtTs(item.created_at)}</span></div>
            <div className="adm-preview-row"><span className="adm-preview-key">Updated</span><span className="adm-preview-val">{fmtTs(item.updated_at)}</span></div>
            {!!meta.engine && <div className="adm-preview-row"><span className="adm-preview-key">Engine</span><span className="adm-preview-val">{String(meta.engine)}</span></div>}
            {meta.frames_received != null && <div className="adm-preview-row"><span className="adm-preview-key">Frames</span><span className="adm-preview-val">{String(meta.frames_received)}</span></div>}
            {meta.liveness_passed != null && <div className="adm-preview-row"><span className="adm-preview-key">Liveness</span><span className="adm-preview-val">{meta.liveness_passed ? '✓ Passed' : '✗ Failed'}</span></div>}
            {!!meta.image_hash && <div className="adm-preview-row adm-preview-row--hash"><span className="adm-preview-key">Hash</span><span className="adm-preview-val adm-preview-hash">{String(meta.image_hash).slice(0, 16)}…</span></div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Verification Detail Modal ─────────────────────────────────────────────────

function VerificationDetailModal({ item, onClose }: { item: VerificationLogItem; onClose: () => void }) {
  const scoreColor = item.match_score >= 75 ? '#16a34a' : item.match_score >= 55 ? '#d97706' : '#dc2626';
  const thresholdPct = typeof item.threshold === 'number' ? item.threshold * 100 : null;
  const metaEntries = Object.entries(item.audit_metadata ?? {}).filter(
    ([k]) => !['operator', 'operator_role', 'threshold', 'raw_confidence', 'decision_reason'].includes(k)
  );

  return (
    <div className="adm-modal-overlay" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="adm-modal adm-vd-modal">
        <div className="adm-modal-header">
          <h3 className="adm-modal-title">Verification Detail</h3>
          <button className="adm-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="adm-vd-body">
          {/* identity row */}
          <div className="adm-vd-section">
            <div className="adm-vd-row">
              <span className="adm-vd-key">Student</span>
              <span className="adm-vd-val">{item.full_name || '—'}</span>
            </div>
            <div className="adm-vd-row">
              <span className="adm-vd-key">External ID</span>
              <span className="adm-vd-val adm-vd-mono">{item.external_id || '—'}</span>
            </div>
            <div className="adm-vd-row">
              <span className="adm-vd-key">Record ID</span>
              <span className="adm-vd-val adm-vd-mono adm-vd-small">{item.id}</span>
            </div>
            <div className="adm-vd-row">
              <span className="adm-vd-key">Timestamp</span>
              <span className="adm-vd-val">{fmtTs(item.timestamp)}</span>
            </div>
          </div>

          {/* biometric result section */}
          <div className="adm-vd-section">
            <div className="adm-vd-section-title">Biometric Result</div>
            <div className="adm-vd-row">
              <span className="adm-vd-key">Mode</span>
              <span className="adm-vd-val">
                <span className={`adm-badge ${item.matching_mode === '1:1' ? 'badge-blue' : 'badge-purple'}`}>{item.matching_mode}</span>
              </span>
            </div>
            <div className="adm-vd-row">
              <span className="adm-vd-key">Decision</span>
              <span className="adm-vd-val">
                {item.is_successful
                  ? <span className="adm-badge badge-green">✓ Match</span>
                  : <span className="adm-badge badge-red">✗ No Match</span>}
              </span>
            </div>
            <div className="adm-vd-row">
              <span className="adm-vd-key">Liveness</span>
              <span className="adm-vd-val">
                {item.liveness_passed
                  ? <span className="adm-badge badge-green">Passed</span>
                  : <span className="adm-badge badge-red">Failed</span>}
              </span>
            </div>
            <div className="adm-vd-row adm-vd-row--conf">
              <span className="adm-vd-key">Confidence</span>
              <span className="adm-vd-val" style={{ flex: 1 }}>
                <div className="adm-conf-cell">
                  <div className="adm-conf-bar-track adm-conf-bar-track--lg">
                    <div className="adm-conf-bar-fill" style={{ width: `${Math.min(item.match_score, 100)}%`, background: scoreColor }} />
                    {thresholdPct != null && (
                      <div className="adm-conf-threshold" style={{ left: `${thresholdPct}%` }} title={`Threshold: ${thresholdPct.toFixed(1)}%`} />
                    )}
                  </div>
                  <span className="adm-conf-label adm-conf-label--lg" style={{ color: scoreColor }}>{item.match_score}%</span>
                </div>
                {thresholdPct != null && (
                  <div className="adm-vd-threshold-note">Threshold active at decision time: {thresholdPct.toFixed(1)}%</div>
                )}
              </span>
            </div>
            {item.decision_reason && (
              <div className="adm-vd-row">
                <span className="adm-vd-key">Reason</span>
                <span className="adm-vd-val adm-vd-reason">{item.decision_reason}</span>
              </div>
            )}
          </div>

          {/* operator section */}
          <div className="adm-vd-section">
            <div className="adm-vd-section-title">Operator</div>
            <div className="adm-vd-row">
              <span className="adm-vd-key">Username</span>
              <span className="adm-vd-val">{item.operator || <em>—</em>}</span>
            </div>
            <div className="adm-vd-row">
              <span className="adm-vd-key">Role</span>
              <span className="adm-vd-val">{item.operator_role || <em>—</em>}</span>
            </div>
          </div>

          {/* extra metadata section */}
          {metaEntries.length > 0 && (
            <div className="adm-vd-section">
              <div className="adm-vd-section-title">Additional Metadata</div>
              {metaEntries.map(([k, v]) => (
                <div className="adm-vd-row" key={k}>
                  <span className="adm-vd-key adm-vd-mono">{k}</span>
                  <span className="adm-vd-val adm-vd-mono adm-vd-small">
                    {typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v ?? '—')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export function AdminPortal({ activeTab: tab, onTabChange: setTab }: AdminPortalProps) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsErr, setStatsErr] = useState('');

  const [enrollments, setEnrollments] = useState<EnrollmentItem[]>([]);
  const [enrollTotal, setEnrollTotal] = useState(0);
  const [enrollPage, setEnrollPage] = useState(0);
  const [enrollSearch, setEnrollSearch] = useState('');
  const [enrollStatusFilter, setEnrollStatusFilter] = useState('');
  const [enrollLoading, setEnrollLoading] = useState(false);
  const ENROLL_PAGE_SIZE = 20;

  const [verifications, setVerifications] = useState<VerificationLogItem[]>([]);
  const [verifyTotal, setVerifyTotal] = useState(0);
  const [verifyPage, setVerifyPage] = useState(0);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifySearch, setVerifySearch] = useState('');
  const [verifyModeFilter, setVerifyModeFilter] = useState<'1:1' | '1:N' | ''>('');
  const [verifyResultFilter, setVerifyResultFilter] = useState<'success' | 'fail' | ''>('');
  const [verifyDateFrom, setVerifyDateFrom] = useState('');
  const [verifyDateTo, setVerifyDateTo] = useState('');
  const [verifyDetailItem, setVerifyDetailItem] = useState<VerificationLogItem | null>(null);
  const VERIFY_PAGE_SIZE = 20;

  const [users, setUsers] = useState<StaffUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);

  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState('');
  const [reloadMsg, setReloadMsg] = useState('');

  const [confirm, setConfirm] = useState<{ message: string; onConfirm: () => void; danger?: boolean } | null>(null);
  const [actionErr, setActionErr] = useState('');
  const [previewItem, setPreviewItem] = useState<EnrollmentItem | null>(null);

  // ── load stats ────────────────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    setStatsErr('');
    try {
      setStats(await fetchAdminStats());
    } catch (e) {
      setStatsErr(e instanceof Error ? e.message : 'Failed to load stats');
    }
  }, []);

  useEffect(() => { if (tab === 'overview') loadStats(); }, [tab, loadStats]);

  // ── load enrollments ──────────────────────────────────────────────────────
  const loadEnrollments = useCallback(async () => {
    setEnrollLoading(true);
    try {
      const res = await fetchEnrollments({
        skip: enrollPage * ENROLL_PAGE_SIZE,
        limit: ENROLL_PAGE_SIZE,
        search: enrollSearch || undefined,
        status_filter: enrollStatusFilter || undefined,
      });
      setEnrollments(res.items);
      setEnrollTotal(res.total);
    } finally {
      setEnrollLoading(false);
    }
  }, [enrollPage, enrollSearch, enrollStatusFilter]);

  useEffect(() => { if (tab === 'enrollments') loadEnrollments(); }, [tab, loadEnrollments]);

  // ── load verifications ────────────────────────────────────────────────────
  const loadVerifications = useCallback(async () => {
    setVerifyLoading(true);
    const params: VerificationLogsParams = {
      skip: verifyPage * VERIFY_PAGE_SIZE,
      limit: VERIFY_PAGE_SIZE,
    };
    if (verifySearch) params.search = verifySearch;
    if (verifyModeFilter) params.mode_filter = verifyModeFilter;
    if (verifyResultFilter) params.result_filter = verifyResultFilter;
    if (verifyDateFrom) params.date_from = verifyDateFrom;
    if (verifyDateTo) params.date_to = verifyDateTo;
    try {
      const res = await fetchVerificationLogs(params);
      setVerifications(res.items);
      setVerifyTotal(res.total);
    } finally {
      setVerifyLoading(false);
    }
  }, [verifyPage, verifySearch, verifyModeFilter, verifyResultFilter, verifyDateFrom, verifyDateTo]);

  useEffect(() => { if (tab === 'verifications') loadVerifications(); }, [tab, loadVerifications]);

  // ── export verifications CSV ───────────────────────────────────────────────
  const exportVerificationsCSV = () => {
    const header = ['ID','Student','Ext ID','Mode','Score%','Confidence','Threshold','Liveness','Result','Decision','Operator','Timestamp'];
    const rows = verifications.map((v) => [
      v.id, v.full_name, v.external_id, v.matching_mode,
      v.match_score, v.raw_confidence,
      typeof v.threshold === 'number' ? v.threshold : '',
      v.liveness_passed ? 'Pass' : 'Fail',
      v.is_successful ? 'Match' : 'No Match',
      v.decision_reason,
      v.operator,
      v.timestamp,
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `verification-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── load users ────────────────────────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      setUsers(await fetchStaffUsers());
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => { if (tab === 'users') loadUsers(); }, [tab, loadUsers]);

  // ── load settings ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab === 'settings') {
      fetchSystemSettings().then(setSettings).catch(() => {});
    }
  }, [tab]);

  // ── enrollment actions ────────────────────────────────────────────────────
  const handleEnrollStatusChange = (item: EnrollmentItem, newStatus: string) => {
    setConfirm({
      message: `Set enrollment for ${item.full_name} (${item.external_id}) to "${newStatus}"?`,
      danger: newStatus !== 'active',
      onConfirm: async () => {
        setConfirm(null);
        setActionErr('');
        try {
          await updateEnrollmentStatus(item.id, newStatus);
          loadEnrollments();
          if (tab === 'overview') loadStats();
        } catch (e) {
          setActionErr(e instanceof Error ? e.message : 'Action failed');
        }
      },
    });
  };

  const handleDeleteEnrollment = (item: EnrollmentItem) => {
    setConfirm({
      message: `Permanently delete enrollment for ${item.full_name} (${item.external_id})? This cannot be undone.`,
      danger: true,
      onConfirm: async () => {
        setConfirm(null);
        setActionErr('');
        try {
          await deleteEnrollment(item.id);
          loadEnrollments();
          loadStats();
        } catch (e) {
          setActionErr(e instanceof Error ? e.message : 'Delete failed');
        }
      },
    });
  };

  // ── user actions ──────────────────────────────────────────────────────────
  const handleToggleUser = (user: StaffUser) => {
    const action = user.is_active ? 'Deactivate' : 'Activate';
    setConfirm({
      message: `${action} account "${user.username}"?`,
      danger: user.is_active,
      onConfirm: async () => {
        setConfirm(null);
        setActionErr('');
        try {
          await toggleUserActive(user.id, !user.is_active);
          loadUsers();
        } catch (e) {
          setActionErr(e instanceof Error ? e.message : 'Action failed');
        }
      },
    });
  };

  const handleDeleteUser = (user: StaffUser) => {
    setConfirm({
      message: `Delete account "${user.username}"? This cannot be undone.`,
      danger: true,
      onConfirm: async () => {
        setConfirm(null);
        setActionErr('');
        try {
          await deleteStaffUser(user.id);
          loadUsers();
        } catch (e) {
          setActionErr(e instanceof Error ? e.message : 'Delete failed');
        }
      },
    });
  };

  // ── settings save ─────────────────────────────────────────────────────────
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSettingsBusy(true);
    setSettingsMsg('');
    try {
      const updated = await updateSystemSettings({
        matching_mode: settings.matching_mode,
        similarity_threshold: settings.similarity_threshold,
        liveness_enabled: settings.liveness_enabled,
        max_attempts: settings.max_attempts,
      });
      setSettings(updated);
      setSettingsMsg('Settings saved successfully.');
    } catch (e) {
      setSettingsMsg(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSettingsBusy(false);
    }
  };

  const handleReloadIndex = async () => {
    setReloadMsg('Reloading…');
    try {
      const r = await reloadIndex();
      setReloadMsg(r.message);
    } catch (e) {
      setReloadMsg(e instanceof Error ? e.message : 'Reload failed');
    }
  };

  const totalEnrollPages = Math.ceil(enrollTotal / ENROLL_PAGE_SIZE);
  const totalVerifyPages = Math.ceil(verifyTotal / VERIFY_PAGE_SIZE);

  return (
    <div className="adm-portal">
      {actionErr && (
        <div className="adm-error-banner" role="alert">
          <span>{actionErr}</span>
          <button onClick={() => setActionErr('')} className="adm-error-dismiss">✕</button>
        </div>
      )}
      <div className="adm-portal-inner">

      {/* ── Overview ─────────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="adm-overview">
          <div className="adm-overview-header">
            <div>
              <h1 className="adm-page-title">Operations Dashboard</h1>
              <p className="adm-page-sub">Live summary of enrollment and verification activity</p>
            </div>
            <button className="adm-btn adm-btn-ghost adm-btn-sm" onClick={loadStats}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              Refresh
            </button>
          </div>

          {statsErr && <div className="adm-error-msg">{statsErr}</div>}

          {stats ? (
            <>
              <div className="adm-stats-grid">
                <StatCard
                  label="Total Students"
                  value={stats.total_students}
                  sub={`${stats.unenrolled_students} pending enrolment`}
                  color="var(--accent)"
                  icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
                />
                <StatCard
                  label="Active Enrollments"
                  value={stats.active_enrollments}
                  sub={`of ${stats.total_students} students`}
                  color="#2563eb"
                  icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>}
                />
                <StatCard
                  label="Verifications Today"
                  value={stats.verifications_today}
                  sub={`${stats.total_verifications} total`}
                  color="#7c3aed"
                  icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>}
                />
                <StatCard
                  label="Success Rate"
                  value={`${stats.success_rate}%`}
                  sub={`${stats.successful_verifications} successful`}
                  color={stats.success_rate >= 80 ? 'var(--accent)' : stats.success_rate >= 50 ? '#d97706' : '#dc2626'}
                  icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>}
                />
                <StatCard
                  label="Staff Accounts"
                  value={stats.total_staff}
                  color="#0891b2"
                  icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
                />
              </div>

              {/* quick links */}
              <div className="adm-quick-actions">
                <button className="adm-quick-action" onClick={() => setTab('enrollments')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                  Manage Enrollments
                </button>
                <button className="adm-quick-action" onClick={() => setTab('verifications')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                  View Logs
                </button>
                <button className="adm-quick-action" onClick={() => setTab('users')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  Staff Accounts
                </button>
                <button className="adm-quick-action" onClick={() => setTab('settings')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                  System Settings
                </button>
              </div>
            </>
          ) : !statsErr ? (
            <div className="adm-loading">Loading statistics…</div>
          ) : null}
        </div>
      )}

      {/* ── Enrollments ──────────────────────────────────────────────────── */}
      {tab === 'enrollments' && (
        <div className="adm-section">
          <div className="adm-section-header">
            <h2 className="adm-section-title">Enrollment Records</h2>
            <span className="adm-section-count">{enrollTotal} total</span>
          </div>

          <div className="adm-filter-row">
            <div className="adm-search-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="adm-search-icon"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                className="adm-search-input"
                type="search"
                placeholder="Search by name or ID…"
                value={enrollSearch}
                onChange={(e) => { setEnrollSearch(e.target.value); setEnrollPage(0); }}
              />
            </div>
            <select className="adm-select" value={enrollStatusFilter} onChange={(e) => { setEnrollStatusFilter(e.target.value); setEnrollPage(0); }}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
              <option value="pending">Pending</option>
            </select>
            <button className="adm-btn adm-btn-ghost adm-btn-sm" onClick={loadEnrollments}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              Refresh
            </button>
          </div>

          {enrollLoading ? (
            <div className="adm-loading">Loading…</div>
          ) : (
            <>
              <div className="adm-table-wrap">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>Photo</th>
                      <th>Student</th>
                      <th>ID</th>
                      <th>Status</th>
                      <th>Enrolled</th>
                      <th>Updated</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrollments.length === 0 ? (
                      <tr><td colSpan={7} className="adm-empty">No enrollments found.</td></tr>
                    ) : enrollments.map((item) => {
                      const thumb = item.metadata_json?.thumbnail as string | undefined;
                      return (
                        <tr key={item.id}>
                          <td className="adm-td-photo">
                            <button className="adm-thumb-btn" onClick={() => setPreviewItem(item)} title="Preview capture">
                              {thumb
                                ? <img src={thumb} alt={item.full_name} className="adm-thumb" />
                                : <span className="adm-thumb-placeholder">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                  </span>
                              }
                            </button>
                          </td>
                          <td className="adm-td-name">{item.full_name}</td>
                          <td className="adm-td-id">{item.external_id}</td>
                          <td><StatusBadge status={item.status} /></td>
                          <td className="adm-td-date">{fmt(item.created_at)}</td>
                          <td className="adm-td-date">{fmt(item.updated_at)}</td>
                          <td>
                            <div className="adm-action-row">
                              {item.status !== 'active' && (
                                <button className="adm-btn adm-btn-success adm-btn-xs" onClick={() => handleEnrollStatusChange(item, 'active')}>
                                  Activate
                                </button>
                              )}
                              {item.status === 'active' && (
                                <button className="adm-btn adm-btn-warn adm-btn-xs" onClick={() => handleEnrollStatusChange(item, 'rejected')}>
                                  Revoke
                                </button>
                              )}
                              {item.status !== 'expired' && (
                                <button className="adm-btn adm-btn-ghost adm-btn-xs" onClick={() => handleEnrollStatusChange(item, 'expired')}>
                                  Expire
                                </button>
                              )}
                              <button className="adm-btn adm-btn-danger adm-btn-xs" onClick={() => handleDeleteEnrollment(item)}>
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {totalEnrollPages > 1 && (
                <div className="adm-pagination">
                  <button className="adm-btn adm-btn-ghost adm-btn-sm" disabled={enrollPage === 0} onClick={() => setEnrollPage((p) => p - 1)}>← Prev</button>
                  <span className="adm-page-info">Page {enrollPage + 1} / {totalEnrollPages}</span>
                  <button className="adm-btn adm-btn-ghost adm-btn-sm" disabled={enrollPage >= totalEnrollPages - 1} onClick={() => setEnrollPage((p) => p + 1)}>Next →</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Verifications ────────────────────────────────────────────────── */}
      {tab === 'verifications' && (
        <div className="adm-section">
          <div className="adm-section-header">
            <div>
              <h2 className="adm-section-title">Verification Audit Log</h2>
              <p className="adm-section-sub">Filterable record of all 1:1 and 1:N biometric verification attempts</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="adm-btn adm-btn-ghost adm-btn-sm" onClick={exportVerificationsCSV} title="Export current page to CSV">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export CSV
              </button>
              <button className="adm-btn adm-btn-ghost adm-btn-sm" onClick={loadVerifications}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                Refresh
              </button>
            </div>
          </div>

          {/* filter bar */}
          <div className="adm-filter-row adm-filter-row--wrap">
            <div className="adm-search-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="adm-search-icon"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                className="adm-search-input"
                type="search"
                placeholder="Search by name or ID…"
                value={verifySearch}
                onChange={(e) => { setVerifySearch(e.target.value); setVerifyPage(0); }}
              />
            </div>
            <select className="adm-select" value={verifyModeFilter} onChange={(e) => { setVerifyModeFilter(e.target.value as '1:1'|'1:N'|''); setVerifyPage(0); }}>
              <option value="">All modes</option>
              <option value="1:1">1:1 Verify</option>
              <option value="1:N">1:N Identify</option>
            </select>
            <select className="adm-select" value={verifyResultFilter} onChange={(e) => { setVerifyResultFilter(e.target.value as 'success'|'fail'|''); setVerifyPage(0); }}>
              <option value="">All results</option>
              <option value="success">Match</option>
              <option value="fail">No Match</option>
            </select>
            <input className="adm-date-input" type="date" value={verifyDateFrom} onChange={(e) => { setVerifyDateFrom(e.target.value); setVerifyPage(0); }} title="From date" />
            <input className="adm-date-input" type="date" value={verifyDateTo} onChange={(e) => { setVerifyDateTo(e.target.value); setVerifyPage(0); }} title="To date" />
            {(verifySearch || verifyModeFilter || verifyResultFilter || verifyDateFrom || verifyDateTo) && (
              <button className="adm-btn adm-btn-ghost adm-btn-xs" onClick={() => {
                setVerifySearch(''); setVerifyModeFilter(''); setVerifyResultFilter('');
                setVerifyDateFrom(''); setVerifyDateTo(''); setVerifyPage(0);
              }}>Clear filters</button>
            )}
            <span className="adm-section-count" style={{ marginLeft: 'auto' }}>{verifyTotal} records</span>
          </div>

          {verifyLoading ? (
            <div className="adm-loading">Loading…</div>
          ) : (
            <>
              <div className="adm-table-wrap">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Ext ID</th>
                      <th>Mode</th>
                      <th style={{ minWidth: 140 }}>Confidence</th>
                      <th>Liveness</th>
                      <th>Decision</th>
                      <th>Operator</th>
                      <th>Timestamp</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {verifications.length === 0 ? (
                      <tr><td colSpan={9} className="adm-empty">No verification records match the current filters.</td></tr>
                    ) : verifications.map((v) => {
                      const scoreColor = v.match_score >= 75 ? '#16a34a' : v.match_score >= 55 ? '#d97706' : '#dc2626';
                      const thresholdPct = typeof v.threshold === 'number' ? v.threshold * 100 : null;
                      return (
                        <tr key={v.id}>
                          <td className="adm-td-name">{v.full_name || <em className="adm-td-unknown">Unknown</em>}</td>
                          <td className="adm-td-id">{v.external_id}</td>
                          <td>
                            <span className={`adm-badge ${v.matching_mode === '1:1' ? 'badge-blue' : 'badge-purple'}`}>
                              {v.matching_mode}
                            </span>
                          </td>
                          <td>
                            <div className="adm-conf-cell">
                              <div className="adm-conf-bar-track">
                                <div className="adm-conf-bar-fill" style={{ width: `${Math.min(v.match_score, 100)}%`, background: scoreColor }} />
                                {thresholdPct != null && (
                                  <div className="adm-conf-threshold" style={{ left: `${thresholdPct}%` }} title={`Threshold: ${thresholdPct.toFixed(0)}%`} />
                                )}
                              </div>
                              <span className="adm-conf-label" style={{ color: scoreColor }}>{v.match_score}%</span>
                            </div>
                          </td>
                          <td>
                            {v.liveness_passed
                              ? <span className="adm-badge badge-green">Pass</span>
                              : <span className="adm-badge badge-red">Fail</span>}
                          </td>
                          <td>
                            {v.is_successful
                              ? <span className="adm-badge badge-green">✓ Match</span>
                              : <span className="adm-badge badge-red">✗ No Match</span>}
                          </td>
                          <td className="adm-td-operator">
                            {v.operator ? (
                              <span className="adm-operator-chip" title={v.operator_role}>{v.operator}</span>
                            ) : <span className="adm-td-unknown">—</span>}
                          </td>
                          <td className="adm-td-date">{fmtTs(v.timestamp)}</td>
                          <td>
                            <button className="adm-btn adm-btn-ghost adm-btn-xs" onClick={() => setVerifyDetailItem(v)}>Detail</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {totalVerifyPages > 1 && (
                <div className="adm-pagination">
                  <button className="adm-btn adm-btn-ghost adm-btn-sm" disabled={verifyPage === 0} onClick={() => setVerifyPage((p) => p - 1)}>← Prev</button>
                  <span className="adm-page-info">Page {verifyPage + 1} / {totalVerifyPages}</span>
                  <button className="adm-btn adm-btn-ghost adm-btn-sm" disabled={verifyPage >= totalVerifyPages - 1} onClick={() => setVerifyPage((p) => p + 1)}>Next →</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Verification Detail Modal ─────────────────────────────────────── */}
      {verifyDetailItem && (
        <VerificationDetailModal item={verifyDetailItem} onClose={() => setVerifyDetailItem(null)} />
      )}

      {/* ── Staff Users ───────────────────────────────────────────────────── */}
      {tab === 'users' && (
        <div className="adm-section">
          <div className="adm-section-header">
            <h2 className="adm-section-title">Staff Accounts</h2>
            <button className="adm-btn adm-btn-primary adm-btn-sm" onClick={() => setShowCreateUser(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Account
            </button>
          </div>

          {usersLoading ? (
            <div className="adm-loading">Loading…</div>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr><td colSpan={5} className="adm-empty">No staff accounts found.</td></tr>
                  ) : users.map((u) => (
                    <tr key={u.id}>
                      <td className="adm-td-name">{u.username}</td>
                      <td><RoleBadge role={u.role} /></td>
                      <td>
                        <span className={`adm-badge ${u.is_active ? 'badge-green' : 'badge-gray'}`}>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="adm-td-date">{fmt(u.created_at)}</td>
                      <td>
                        {u.role !== 'admin' && (
                          <div className="adm-action-row">
                            <button
                              className={`adm-btn adm-btn-xs ${u.is_active ? 'adm-btn-warn' : 'adm-btn-success'}`}
                              onClick={() => handleToggleUser(u)}
                            >
                              {u.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                            <button className="adm-btn adm-btn-danger adm-btn-xs" onClick={() => handleDeleteUser(u)}>
                              Delete
                            </button>
                          </div>
                        )}
                        {u.role === 'admin' && <span className="adm-td-protected">Protected</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {showCreateUser && (
            <CreateUserModal onClose={() => setShowCreateUser(false)} onCreated={loadUsers} />
          )}
        </div>
      )}

      {/* ── Settings ─────────────────────────────────────────────────────── */}
      {tab === 'settings' && (
        <div className="adm-section">
          <div className="adm-section-header">
            <h2 className="adm-section-title">System Settings</h2>
          </div>

          {settings ? (
            <form className="adm-settings-form" onSubmit={handleSaveSettings}>
              <div className="adm-settings-grid">
                <div className="adm-settings-group">
                  <label className="adm-settings-label">Matching Mode</label>
                  <select
                    className="adm-input"
                    value={settings.matching_mode}
                    onChange={(e) => setSettings({ ...settings, matching_mode: e.target.value })}
                  >
                    <option value="1:1">1:1 (Verification)</option>
                    <option value="1:N">1:N (Identification)</option>
                  </select>
                  <span className="adm-settings-hint">1:1 requires a student ID; 1:N searches all records.</span>
                </div>

                <div className="adm-settings-group">
                  <label className="adm-settings-label">Similarity Threshold</label>
                  <div className="adm-range-wrap">
                    <input
                      type="range" min="0.3" max="0.95" step="0.01"
                      value={settings.similarity_threshold}
                      onChange={(e) => setSettings({ ...settings, similarity_threshold: parseFloat(e.target.value) })}
                      className="adm-range"
                    />
                    <span className="adm-range-val">{(settings.similarity_threshold * 100).toFixed(0)}%</span>
                  </div>
                  <span className="adm-settings-hint">Lower = more permissive; higher = stricter. Default 65%.</span>
                </div>

                <div className="adm-settings-group">
                  <label className="adm-settings-label">Max Verification Attempts</label>
                  <input
                    type="number" min="1" max="10" className="adm-input adm-input-sm"
                    value={settings.max_attempts}
                    onChange={(e) => setSettings({ ...settings, max_attempts: parseInt(e.target.value) })}
                  />
                </div>

                <div className="adm-settings-group">
                  <label className="adm-settings-label adm-toggle-label">
                    <span>Liveness Detection</span>
                    <button
                      type="button"
                      className={`adm-toggle ${settings.liveness_enabled ? 'adm-toggle--on' : ''}`}
                      onClick={() => setSettings({ ...settings, liveness_enabled: !settings.liveness_enabled })}
                      role="switch"
                      aria-checked={settings.liveness_enabled}
                    >
                      <span className="adm-toggle-thumb" />
                    </button>
                  </label>
                  <span className="adm-settings-hint">Requires live face movement during enrollment and verification.</span>
                </div>
              </div>

              {settingsMsg && (
                <div className={`adm-settings-msg ${settingsMsg.includes('aved') ? 'adm-settings-msg--ok' : 'adm-settings-msg--err'}`}>
                  {settingsMsg}
                </div>
              )}

              <div className="adm-settings-actions">
                <button type="submit" className="adm-btn adm-btn-primary" disabled={settingsBusy}>
                  {settingsBusy ? 'Saving…' : 'Save Settings'}
                </button>
              </div>
            </form>
          ) : (
            <div className="adm-loading">Loading settings…</div>
          )}

          <div className="adm-settings-divider" />

          <div className="adm-settings-group">
            <div className="adm-section-header">
              <h3 className="adm-subsection-title">FAISS Index</h3>
            </div>
            <p className="adm-settings-hint" style={{ marginBottom: '0.75rem' }}>
              Manually rebuild the in-memory face search index from the database. Do this after restoring a backup or if verification returns unexpected results.
            </p>
            <button type="button" className="adm-btn adm-btn-ghost" onClick={handleReloadIndex}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              Reload Index
            </button>
            {reloadMsg && <p className="adm-settings-hint" style={{ marginTop: '0.5rem', color: 'var(--accent)' }}>{reloadMsg}</p>}
          </div>
        </div>
      )}

      {/* Confirm modal */}
      {confirm && (
        <ConfirmModal
          message={confirm.message}
          danger={confirm.danger}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* Enrollment preview modal */}
      {previewItem && (
        <EnrollmentPreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
      )}
      </div>{/* adm-portal-inner */}
    </div>
  );
}
