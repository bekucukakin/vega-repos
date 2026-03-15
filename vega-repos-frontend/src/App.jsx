import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import RepoListPage from './pages/RepoListPage'
import RepoDetailPage from './pages/RepoDetailPage'
import PullRequestDetailPage from './pages/PullRequestDetailPage'
import CollaboratorRequestsPage from './pages/CollaboratorRequestsPage'
import CommitMetricsPage from './pages/CommitMetricsPage'
import PrMetricsPage from './pages/PrMetricsPage'
import VegaDocsPage from './pages/VegaDocsPage'
import ProfilePage from './pages/ProfilePage'

function PrivateRoute({ children }) {
  const { token } = useAuth()
  return token ? children : <Navigate to="/login" replace />
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/docs" element={<VegaDocsPage />} />
        <Route path="/" element={<Layout />}>
          <Route index element={<LandingPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
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
            path="metrics/commits"
            element={
              <PrivateRoute>
                <CommitMetricsPage />
              </PrivateRoute>
            }
          />
          <Route
            path="metrics/pr-reviews"
            element={
              <PrivateRoute>
                <PrMetricsPage />
              </PrivateRoute>
            }
          />
          <Route path="metrics" element={<Navigate to="/metrics/commits" replace />} />
          <Route path="profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
          <Route
            path="repos/:username/:repoName"
            element={
              <PrivateRoute>
                <RepoDetailPage />
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
