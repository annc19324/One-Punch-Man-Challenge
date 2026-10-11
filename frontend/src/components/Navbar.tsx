import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Flame, Camera, Activity, Trophy, History, LogOut, Smartphone } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isNativeApp } from '../utils/platform';
import { DownloadAppModal } from './DownloadAppModal';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const inApp = isNativeApp();

  const navLinks = [
    { to: '/', label: 'Thử Thách', icon: Activity },
    { to: '/workout', label: 'AI Camera', icon: Camera },
    { to: '/running', label: 'Chạy Bộ GPS', icon: Flame },
    { to: '/leaderboard', label: 'Bảng Phong Thần', icon: Trophy },
    { to: '/history', label: 'Lịch Sử', icon: History },
  ];

  return (
    <header className="sticky top-0 z-50 bg-[#121624]/90 backdrop-blur-md border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link to="/" className="flex items-center space-x-3 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-red-600 flex items-center justify-center font-black text-white text-xl shadow-lg shadow-red-500/20 group-hover:scale-105 transition-transform">
            🥊
          </div>
          <div>
            <div className="text-lg font-black tracking-wider bg-gradient-to-r from-amber-400 via-orange-400 to-red-500 bg-clip-text text-transparent">
              ONE PUNCH MAN
            </div>
            <div className="text-[10px] text-gray-400 font-medium tracking-widest uppercase">
              AI Challenge • EPU
            </div>
          </div>
        </Link>

        {/* Navigation links */}
        <nav className="hidden md:flex items-center space-x-1">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                    : 'text-gray-300 hover:text-white hover:bg-gray-800/60'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-red-400' : 'text-gray-400'}`} />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User stats / Hero Rank / Download App / Auth */}
        <div className="flex items-center space-x-3">
          {/* Download App Button: Only visible when accessed on Web browser */}
          {!inApp && (
            <button
              onClick={() => setShowDownloadModal(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-all shadow-sm"
              title="Cài đặt App Android (APK)"
            >
              <Smartphone className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Tải App Android</span>
              <span className="sm:hidden">App</span>
            </button>
          )}

          {user ? (
            <div className="flex items-center space-x-3">
              {/* Streak */}
              <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold">
                <Flame className="w-3.5 h-3.5 fill-amber-400" />
                <span>{user.current_streak || 0}d</span>
              </div>

              {/* Hero Rank Badge */}
              <div className="px-2.5 py-1 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 text-xs font-black tracking-wide">
                {user.hero_rank || 'Hero C'} (Lv.{user.level || 1})
              </div>

              <button
                onClick={logout}
                title="Đăng xuất"
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-red-600 to-amber-500 text-white hover:opacity-90 shadow-md shadow-red-600/20 transition-all"
            >
              Gia Nhập Hiệp Hội
            </Link>
          )}
        </div>
      </div>
      <DownloadAppModal isOpen={showDownloadModal} onClose={() => setShowDownloadModal(false)} />
    </header>
  );
};
