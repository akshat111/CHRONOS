# CHRONOS ⚡

[![GitHub Repo](https://img.shields.io/badge/GitHub-CHRONOS-blue?style=for-the-badge&logo=github)](https://github.com/akshat111/CHRONOS)
[![Stars](https://img.shields.io/github/stars/akshat111/CHRONOS?style=for-the-badge&logo=github)](https://github.com/akshat111/CHRONOS/stargazers)
[![Forks](https://img.shields.io/github/forks/akshat111/CHRONOS?style=for-the-badge&logo=github)](https://github.com/akshat111/CHRONOS/network/members)
[![Issues](https://img.shields.io/github/issues/akshat111/CHRONOS?style=for-the-badge&logo=github)](https://github.com/akshat111/CHRONOS/issues)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

> A modern, production-ready Job Scheduling System built with Node.js and React.

## Features

- 📅 **Job Scheduling** - Create one-time or recurring jobs
- ⏱️ **Cron Support** - Schedule jobs using cron expressions
- 🔄 **Job Dependencies** - Chain jobs with "depends on" relationships
- ⏸️ **Pause/Resume** - Control job execution
- 📊 **Dashboard** - Real-time monitoring with charts
- 🔐 **Authentication** - Secure signup/login system
- 🗑️ **Auto-Cleanup** - Completed jobs auto-delete after 5 days

## Tech Stack

**Backend:**
- Node.js + Express
- MongoDB + Mongoose
- JWT Authentication
- bcryptjs for password hashing

**Frontend:**
- React 18 + Vite
- Tailwind CSS
- Recharts for visualizations
- Framer Motion animations

## Getting Started

### Prerequisites
- Node.js 18+
- MongoDB

### Installation

1. Clone the repository:
```bash
git clone https://github.com/akshat111/CHRONOS.git
cd CHRONOS
```

2. Install backend dependencies:
```bash
cd backend
npm install
```

3. Install frontend dependencies:
```bash
cd ../frontend
npm install
```

4. Create `.env` file in backend:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/chronos
JWT_SECRET=your_secret_key
```

5. Start the servers:
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

6. Open http://localhost:3000

## Project Structure

```
CHRONOS/
├── backend/
│   ├── controllers/    # Route handlers
│   ├── models/         # MongoDB schemas
│   ├── routes/         # API routes
│   ├── services/       # Business logic
│   └── server.js       # Entry point
│
└── frontend/
    ├── src/
    │   ├── components/ # React components
    │   ├── pages/      # Page components
    │   ├── context/    # React context
    │   └── services/   # API client
    └── index.html
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/signup | Create account |
| POST | /api/auth/login | Login |
| GET | /api/jobs | List all jobs |
| POST | /api/jobs | Create job |
| PUT | /api/jobs/:id | Update job |
| DELETE | /api/jobs/:id | Delete job |
| POST | /api/jobs/:id/pause | Pause job |
| POST | /api/jobs/:id/resume | Resume job |

## License

MIT
