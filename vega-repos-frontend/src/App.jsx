import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import { CardSkeleton } from './components/Skeleton'

/* ── Lazy-loaded pages ── */
const LandingPage              = lazy(() => import('./pages/LandingPage'))
const LoginPage                = lazy(() => import('./pages/LoginPage'))
const RegisterPage             = lazy(() => import('./pages/RegisterPage'))
const RepoListPage             = lazy(() => import('./pages/RepoListPage'))
const RepoDetailPage           = lazy(() => import('./pages/RepoDetailPage'))
const PullRequestDetailPage    = lazy(() => import('./pages/PullRequestDetailPage'))
const CreatePullRequestPage    = lazy(() => import('./pages/CreatePullRequestPage'))
const CollaboratorRequestsPage = lazy(() => import('./pages/CollaboratorRequestsPage'))
const VegaAnalyticsDashboard   = lazy(() => import('./pages/VegaAnalyticsDashboard'))
const VegaDocsPage             = lazy(() => import('./pages/VegaDocsPage'))
const DownloadPage             = lazy(() => import('./pages/DownloadPage'))
const ProfilePage              = lazy(() => import('./pages/ProfilePage'))
const PeoplePage               = lazy(() => import('./pages/PeoplePage'))
const PeopleProfilePage        = lazy(() => import('./pages/PeopleProfilePage'))
const AICommitDemoPage         = lazy(() => import('./pages/AICommitDemoPage'))
const NotFoundPage             = lazy(() => import('./pages/NotFoundPage'))

/* ── Page fallback ── */
function PageFallback() {
  return (
    <div style={{ padding: '40px 24px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 800, margin: '0 auto' }}>
      <CardSkeleton lines={2} />
      <CardSkeleton lines={4} />
      <CardSkeleton lines={3} />
    </div>
  )
}

function PrivateRoute({ children }) {
  const { token } = useAuth()
  return token ? children : <Navigate to="/login" replace />
}

function GuestOnlyRoute({ children }) {
  const { token } = useAuth()
  return token ? <Navigate to="/repos" replace /> : children
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ErrorBoundary>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/docs" element={<VegaDocsPage />} />
              <Route path="/download" element={<DownloadPage />} />
              <Route path="/commit-demo" element={<AICommitDemoPage />} />

              <Route path="/" element={<Layout />}>
                <Route index element={<LandingPage />} />

                <Route path="login" element={<GuestOnlyRoute><LoginPage /></GuestOnlyRoute>} />
                <Route path="register" element={<GuestOnlyRoute><RegisterPage /></GuestOnlyRoute>} />

                <Route path="repos" element={<PrivateRoute><RepoListPage /></PrivateRoute>} />
                <Route path="repos/:username/:repoName" element={<PrivateRoute><RepoDetailPage /></PrivateRoute>} />
                <Route path="repos/:username/:repoName/pull-requests/new" element={<PrivateRoute><CreatePullRequestPage /></PrivateRoute>} />
                <Route path="repos/:username/:repoName/pull-requests/:prId" element={<PrivateRoute><PullRequestDetailPage /></PrivateRoute>} />

                <Route path="collaborator-requests" element={<PrivateRoute><CollaboratorRequestsPage /></PrivateRoute>} />

                {/* Metrics */}
                <Route path="metrics" element={<PrivateRoute><VegaAnalyticsDashboard /></PrivateRoute>} />
                <Route path="metrics/analytics" element={<Navigate to="/metrics" replace />} />
                <Route path="metrics/commits"   element={<Navigate to="/metrics" replace />} />
                <Route path="metrics/prs"       element={<Navigate to="/metrics" replace />} />
                <Route path="metrics/overview"  element={<Navigate to="/metrics" replace />} />

                <Route path="profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
                <Route path="people" element={<PrivateRoute><PeoplePage /></PrivateRoute>} />
                <Route path="people/:username" element={<PrivateRoute><PeopleProfilePage /></PrivateRoute>} />

                <Route path="404" element={<NotFoundPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </ToastProvider>
    </AuthProvider>
  )
}

export default App
