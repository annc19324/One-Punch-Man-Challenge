import axios from 'axios';

const isLocal = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const defaultBackendUrl = isLocal 
  ? 'http://localhost:5000/api' 
  : 'https://one-punch-man-challenge.onrender.com/api';

const defaultWsUrl = isLocal 
  ? 'ws://localhost:8000/ws/workout' 
  : 'wss://opm-challenge-ai-service.onrender.com/ws/workout';

const rawApiUrl = (import.meta.env.VITE_API_URL as string) || defaultBackendUrl;
export const API_BASE_URL = rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`;
export const AI_WS_URL = (import.meta.env.VITE_AI_WS_URL as string) || defaultWsUrl;

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
