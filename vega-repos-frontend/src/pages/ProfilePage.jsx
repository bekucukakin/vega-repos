import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import styles from './ProfilePage.module.css'
import { API_BASE } from '../config/api'


export default function ProfilePage() {
  const { user, getAuthHeader } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [profileMsg, setProfileMsg] = useState('')
  const [profileErr, setProfileErr] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordMsg, setPasswordMsg] = useState('')
  const [passwordErr, setPasswordErr] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  useEffect(() => {
    fetch(`${API_BASE}/users/profile`, { headers: getAuthHeader() })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setProfile(data)
          setFirstName(data.firstName || '')
          setLastName(data.lastName || '')
          setEmail(data.email || '')
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : '??'

  const handleSaveProfile = async (e) => {
    e.preventDefault()
    setProfileErr('')
    setProfileMsg('')
    setSavingProfile(true)
    try {
      const res = await fetch(`${API_BASE}/users/profile`, {
        method: 'PUT',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, email }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || d.message || 'Failed to update profile')
      }
      const updated = await res.json()
      setProfile(updated)
      setProfileMsg('Profile updated successfully')
      setEditMode(false)
      setTimeout(() => setProfileMsg(''), 4000)
    } catch (err) {
      setProfileErr(err.message)
    } finally {
      setSavingProfile(false)
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPasswordErr('')
    setPasswordMsg('')

    if (newPassword.length < 6) {
      setPasswordErr('New password must be at least 6 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordErr('Passwords do not match')
      return
    }

    setSavingPassword(true)
    try {
      const res = await fetch(`${API_BASE}/users/change-password`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || data.message || 'Failed to change password')
      }
      setPasswordMsg('Password changed successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setPasswordMsg(''), 4000)
    } catch (err) {
      setPasswordErr(err.message)
    } finally {
      setSavingPassword(false)
    }
  }

  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—'

  if (loading) return <div className={styles.loading}>Loading profile...</div>

  return (
    <div className={styles.container}>
      <div className={styles.profileHeader}>
        <div className={styles.avatar}>{initials}</div>
        <div className={styles.headerInfo}>
          <h1 className={styles.displayName}>
            {profile?.firstName && profile?.lastName
              ? `${profile.firstName} ${profile.lastName}`
              : user?.username}
          </h1>
          <p className={styles.username}>@{user?.username}</p>
          <p className={styles.memberSince}>Member since {memberSince}</p>
        </div>
      </div>

      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2>Profile Information</h2>
            {!editMode && (
              <button type="button" className={styles.btnOutline} onClick={() => setEditMode(true)}>
                Edit
              </button>
            )}
          </div>

          {profileMsg && <div className={styles.successAlert}>{profileMsg}</div>}
          {profileErr && <div className={styles.errorAlert}>{profileErr}</div>}

          {editMode ? (
            <form onSubmit={handleSaveProfile} className={styles.form}>
              <div className={styles.formRow}>
                <label className={styles.label}>
                  First Name
                  <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={styles.input} />
                </label>
                <label className={styles.label}>
                  Last Name
                  <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className={styles.input} />
                </label>
              </div>
              <label className={styles.label}>
                Email
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={styles.input} />
              </label>
              <div className={styles.formActions}>
                <button type="submit" disabled={savingProfile} className={styles.btnPrimary}>
                  {savingProfile ? 'Saving...' : 'Save Changes'}
                </button>
                <button type="button" className={styles.btnGhost} onClick={() => { setEditMode(false); setProfileErr('') }}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className={styles.infoGrid}>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Username</span>
                <span className={styles.infoValue}>{user?.username}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Email</span>
                <span className={styles.infoValue}>{profile?.email || '—'}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>First Name</span>
                <span className={styles.infoValue}>{profile?.firstName || '—'}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Last Name</span>
                <span className={styles.infoValue}>{profile?.lastName || '—'}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Role</span>
                <span className={styles.infoValue}>
                  <span className={styles.roleBadge}>{profile?.role || 'USER'}</span>
                </span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Status</span>
                <span className={styles.infoValue}>
                  <span className={styles.statusActive}>Active</span>
                </span>
              </div>
            </div>
          )}
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2>Change Password</h2>
          </div>
          <p className={styles.cardHint}>Update your password to keep your account secure.</p>

          {passwordMsg && <div className={styles.successAlert}>{passwordMsg}</div>}
          {passwordErr && <div className={styles.errorAlert}>{passwordErr}</div>}

          <form onSubmit={handleChangePassword} className={styles.form}>
            <label className={styles.label}>
              Current Password
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={styles.input}
                required
                autoComplete="current-password"
              />
            </label>
            <label className={styles.label}>
              New Password
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={styles.input}
                required
                minLength={6}
                placeholder="At least 6 characters"
                autoComplete="new-password"
              />
            </label>
            <label className={styles.label}>
              Confirm New Password
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={styles.input}
                required
                autoComplete="new-password"
              />
            </label>
            <div className={styles.formActions}>
              <button type="submit" disabled={savingPassword} className={styles.btnPrimary}>
                {savingPassword ? 'Changing...' : 'Change Password'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}
