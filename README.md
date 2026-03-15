# VEGA Repos

Repository management service for VEGA — AI-Powered Version Control. Lists and browses repositories stored on Hadoop HDFS.

## Project Structure

```
vega-repos/
├── vega-repos-backend/   # Spring Boot 3.x (Java 17)
├── vega-repos-frontend/  # React (Vite)
├── docker-compose.yml    # PostgreSQL (optional)
└── README.md
```

## Prerequisites

- Java 17
- Node.js 18+
- Docker (for PostgreSQL)
- vega-user-service running on http://localhost:8085
- Hadoop HDFS (for repo data, default hdfs://localhost:9000)

## Quick Start

### 1. Start PostgreSQL (optional, for future use)

```bash
docker-compose up -d
```

### 2. Start vega-user-service

Ensure vega-user-service is running on port 8085 for login.

### 3. Backend

```bash
cd vega-repos-backend
./mvnw spring-boot:run
```

Configurable via environment variables:
- `VEGA_USER_SERVICE_URL` — User service URL (default: http://localhost:8085)
- `HDFS_URI` — HDFS URI (default: hdfs://localhost:9000)
- `HDFS_USERNAME` — HDFS user (default: hdfs)

### 4. Frontend

```bash
cd vega-repos-frontend
npm install
npm run dev
```

Open http://localhost:5173

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/login | Login (proxies to vega-user-service) |
| GET | /api/repos/{username} | List repositories |
| GET | /api/repos/{username}/{repoName} | Repo detail |
| GET | /api/repos/{username}/{repoName}/branches | List branches |
| GET | /api/repos/{username}/{repoName}/commits?limit=20 | List commits |

## HDFS Structure

Repositories are expected at: `/vega/repositories/{username}/{repoName}/`

VEGA metadata: `.vega/refs/heads/`, `.vega/objects/`
