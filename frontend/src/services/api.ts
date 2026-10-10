import axios from 'axios';

export const API_BASE_URL = 'http://localhost:5000/api';
export const AI_WS_URL = 'ws://localhost:8000/ws/workout';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('opm_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authService = {
  login: (data: any) => api.post('/auth/login', data),
  register: (data: any) => api.post('/auth/register', data),
  getProfile: () => api.get('/auth/profile'),
};

export const challengeService = {
  getLevels: () => api.get('/challenge/levels'),
  getToday: () => api.get('/challenge/today'),
};

export const workoutService = {
  logResult: (data: any) => api.post('/workouts/log', data),
  getHistory: () => api.get('/workouts/history'),
};

export const runningService = {
  logSession: (data: any) => api.post('/running/log', data),
  getSessions: () => api.get('/running/history'),
};

export const statsService = {
  getMe: () => api.get('/stats/me'),
  getLeaderboard: () => api.get('/stats/leaderboard'),
};
