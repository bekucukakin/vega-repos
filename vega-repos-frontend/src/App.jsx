import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import RepoListPage from './pages/RepoListPage'
import RepoDetailPage from './pages/RepoDetailPage'
import PullRequestDetailPage from './pages/PullRequestDetailPage'
import CreatePullRequestPage from './pages/CreatePullRequestPage'
import CollaboratorRequestsPage from './pages/CollaboratorRequestsPage'
import VegaAnalyticsDashboard from './pages/VegaAnalyticsDashboard'
import VegaDocsPage from './pages/VegaDocsPage'
import DownloadPage from './pages/DownloadPage'
import ProfilePage from './pages/ProfilePage'
import PeoplePage from './pages/PeoplePage'
import PeopleProfilePage from './pages/PeopleProfilePage'
import AICommitDemoPage from './pages/AICommitDemoPage'

function PrivateRoute({ children }) {
  const { token } = useAuth()
  return token ? children : <Navigate to="/login" replace />
}

/** Logged-in users should not see login/register — send them to the app */
function GuestOnlyRoute({ children }) {
  const { token } = useAuth()
  return token ? <Navigate to="/repos" replace /> : children
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/docs" element={<VegaDocsPage />} />
        <Route path="/download" element={<DownloadPage />} />
        <Route path="/commit-demo" element={<AICommitDemoPage />} />
        <Route path="/" element={<Layout />}>
          <Route index element={<LandingPage />} />
          <Route
            path="login"
            element={
              <GuestOnlyRoute>
                <LoginPage />
              </GuestOnlyRoute>
            }
          />
          <Route
            path="register"
            element={
              <GuestOnlyRoute>
                <RegisterPage />
              </GuestOnlyRoute>
            }
          />
          <Route
            path="repos"
            element={
              <PrivateRoute>
                <RepoListPage />
              </PrivateRoute>
            }
          />
          <Route
            path="collaborator-requests"
            element={
              <PrivateRoute>
                <CollaboratorRequestsPage />
              </PrivateRoute>
            }
          />
          <Route
            path="metrics/analytics"
            element={
              <PrivateRoute>
                <VegaAnalyticsDashboard />
              </PrivateRoute>
            }
          />
          <Route path="metrics" element={<Navigate to="/metrics/analytics" replace />} />
          <Route path="profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
          <Route
            path="people/:username"
            element={
              <PrivateRoute>
                <PeopleProfilePage />
              </PrivateRoute>
            }
          />
          <Route
            path="people"
            element={
              <PrivateRoute>
                <PeoplePage />
              </PrivateRoute>
            }
          />
          <Route
            path="repos/:username/:repoName"
            element={
              <PrivateRoute>
                <RepoDetailPage />
              </PrivateRoute>
            }
          />
          <Route
            path="repos/:username/:repoName/pull-requests/new"
            element={
              <PrivateRoute>
                <CreatePullRequestPage />
              </PrivateRoute>
            }
          />
          <Route
            path="repos/:username/:repoName/pull-requests/:prId"
            element={
              <PrivateRoute>
                <PullRequestDetailPage />
              </PrivateRoute>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}

export default App
