import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Lock, Mail, User as UserIcon } from 'lucide-react';
import { authService } from '../services/api';
import { useAuth } from '../context/AuthContext';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        const res = await authService.register({ username, email, password });
        if (res.data.success) {
          login(res.data.token, res.data.user);
          navigate('/');
        } else {
          setError(res.data.message || 'Đăng ký không thành công');
        }
      } else {
        const res = await authService.login({ usernameOrEmail: username || email, password });
        if (res.data.success) {
          login(res.data.token, res.data.user);
          navigate('/');
        } else {
          setError(res.data.message || 'Đăng nhập không thành công');
        }
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      const serverMsg = err.response?.data?.message;
      if (serverMsg) {
        setError(serverMsg);
      } else if (err.message && err.message.includes('Network Error')) {
        setError('Máy chủ Backend đang khởi động lại (Render cold-start), vui lòng đợi 20-30 giây rồi thử lại!');
      } else {
        setError('Lỗi đăng nhập: ' + (err.message || 'Kiểm tra kết nối mạng'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-[#141824] rounded-2xl border border-gray-800 p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-12 -mt-12 w-48 h-48 bg-red-600/10 rounded-full blur-2xl pointer-events-none"></div>

        <div className="text-center mb-8 relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-red-600 mx-auto flex items-center justify-center font-black text-white text-2xl shadow-lg shadow-red-500/20 mb-3">
            🥊
          </div>
          <h2 className="text-2xl font-black text-white tracking-wide">
            {isRegister ? 'ĐĂNG KÝ GIA NHẬP' : 'HIỆP HỘI ANH HÙNG'}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            {isRegister ? 'Tạo hồ sơ và bắt đầu thử thách 100/100/100/10km' : 'Đăng nhập để tiếp tục chuỗi ngày rèn luyện thể lực'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">
              Tên Anh Hùng (Username)
            </label>
            <div className="relative">
              <UserIcon className="w-4 h-4 text-gray-500 absolute left-3.5 top-3.5" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ví dụ: Saitama"
                className="w-full pl-10 pr-4 py-2.5 bg-gray-900 border border-gray-800 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500 transition-colors"
              />
            </div>
          </div>

          {isRegister && (
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-gray-500 absolute left-3.5 top-3.5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="hero@epu.edu.vn"
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-900 border border-gray-800 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500 transition-colors"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">
              Mật khẩu
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-500 absolute left-3.5 top-3.5" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 bg-gray-900 border border-gray-800 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500 transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-red-600 to-amber-500 hover:opacity-90 text-white font-bold text-sm shadow-lg shadow-red-600/30 transition-all flex items-center justify-center space-x-2 mt-2"
          >
            <Zap className="w-4 h-4 fill-white" />
            <span>{loading ? 'Đang xử lý...' : isRegister ? 'Đăng Ký Hồ Sơ' : 'Vào Luyện Tập'}</span>
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-gray-400 relative z-10">
          {isRegister ? 'Đã có tài khoản?' : 'Chưa có tài khoản anh hùng?'}{' '}
          <button
            onClick={() => setIsRegister(!isRegister)}
            className="text-amber-400 font-bold hover:underline"
          >
            {isRegister ? 'Đăng nhập ngay' : 'Đăng ký ngay'}
          </button>
        </div>
      </div>
    </div>
  );
};
