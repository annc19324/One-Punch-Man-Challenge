import React, { useRef, useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Camera, RefreshCw, CheckCircle, AlertTriangle, Play, Square, Save, ArrowLeft } from 'lucide-react';
import { workoutService, AI_WS_URL } from '../services/api';
import type { AIWorkoutStatus } from '../types';

export const WorkoutCamera: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialExercise = searchParams.get('exercise') || 'pushup';

  const [exercise, setExercise] = useState<string>(initialExercise);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [status, setStatus] = useState<AIWorkoutStatus>({
    exercise: initialExercise,
    stage: null,
    total_reps: 0,
    valid_reps: 0,
    invalid_reps: 0,
    form_score: 100,
    feedback: 'Nhấn Bắt Đầu để khởi động AI Camera',
    is_form_valid: true,
  });
  const [detected, setDetected] = useState<boolean>(false);
  const [angles, setAngles] = useState<any>(null);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const frameIntervalRef = useRef<any>(null);

  // Switch exercise
  const handleSelectExercise = (ex: string) => {
    if (isStreaming) {
      stopStreaming();
    }
    setExercise(ex);
    setSearchParams({ exercise: ex });
    setStatus({
      exercise: ex,
      stage: null,
      total_reps: 0,
      valid_reps: 0,
      invalid_reps: 0,
      form_score: 100,
      feedback: 'Sẵn sàng tập luyện',
      is_form_valid: true,
    });
  };

  const startStreaming = async () => {
    try {
      // 1. Get webcam stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // 2. Open WebSocket connection to Python AI service
      const wsUrl = `${AI_WS_URL}/${exercise}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`🔌 WebSocket connected to AI service for: ${exercise}`);
        setIsStreaming(true);

        // Send frames every 70ms (~14 FPS)
        frameIntervalRef.current = setInterval(() => {
          sendFrame();
        }, 70);
      };

      ws.onmessage = (event) => {
        try {
          const res = JSON.parse(event.data);
          if (res.counter) {
            setStatus(res.counter);
          }
          if (res.detected !== undefined) {
            setDetected(res.detected);
          }
          if (res.angles) {
            setAngles(res.angles);
          }
        } catch (e) {
          console.error('Error parsing WS message:', e);
        }
      };

      ws.onerror = (err) => {
        console.warn('⚠️ WebSocket error (Python AI service offline or unreachable):', err);
        setStatus((prev) => ({
          ...prev,
          feedback: '⚠️ AI Service chưa khởi động. Hãy đảm bảo python ai-service/main.py đang chạy.',
        }));
      };

      ws.onclose = () => {
        console.log('🔌 WebSocket disconnected.');
      };
    } catch (err: any) {
      alert('Không thể mở Camera: ' + err.message);
    }
  };

  const stopStreaming = () => {
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
  };

  const sendFrame = () => {
    if (!videoRef.current || !canvasRef.current || !wsRef.current) return;
    if (wsRef.current.readyState !== WebSocket.OPEN) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 480;
    canvas.height = 360;
    ctx.drawImage(video, 0, 0, 480, 360);

    const base64Image = canvas.toDataURL('image/jpeg', 0.6);
    wsRef.current.send(base64Image);
  };

  const resetCounter = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send('RESET');
    }
    setStatus((prev) => ({
      ...prev,
      total_reps: 0,
      valid_reps: 0,
      invalid_reps: 0,
      form_score: 100,
      feedback: 'Đã đặt lại số rep',
    }));
  };

  const saveWorkout = async () => {
    try {
      await workoutService.logResult({
        exercise_type: exercise,
        reps_total: status.total_reps,
        reps_valid: status.valid_reps,
        reps_invalid: status.invalid_reps,
        form_score: status.form_score,
        duration_seconds: 60,
        feedback_notes: status.feedback,
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch {
      alert('Đã lưu phiên tập (Mock local)');
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    }
  };

  useEffect(() => {
    return () => {
      stopStreaming();
    };
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Bar with Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center space-x-2 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Về Thử Thách Chính</span>
        </button>

        {/* Exercise Selector Buttons */}
        <div className="flex bg-gray-900 p-1.5 rounded-xl border border-gray-800">
          {[
            { id: 'pushup', label: 'Chống đẩy (Push-up)', icon: '💪' },
            { id: 'squat', label: 'Squat', icon: '🏋️' },
            { id: 'situp', label: 'Gập bụng (Sit-up)', icon: '🔥' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => handleSelectExercise(item.id)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                exercise === item.id
                  ? 'bg-red-600 text-white shadow-md'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Camera & HUD Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Camera Feed + Overlay HUD */}
        <div className="lg:col-span-2 relative bg-black rounded-2xl overflow-hidden border border-gray-800 aspect-[4/3] flex items-center justify-center">
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-cover transform -scale-x-100"
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Fallback state when camera is OFF */}
          {!isStreaming && (
            <div className="absolute inset-0 bg-[#0c101c]/90 flex flex-col items-center justify-center p-6 text-center space-y-4">
              <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500">
                <Camera className="w-10 h-10" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Camera AI Chưa Khởi Động</h3>
                <p className="text-gray-400 text-sm max-w-sm mt-1">
                  Đứng cách camera khoảng 2 mét sao cho toàn bộ cơ thể nằm trong khung hình.
                </p>
              </div>
              <button
                onClick={startStreaming}
                className="inline-flex items-center space-x-2 px-6 py-3 rounded-xl bg-gradient-to-r from-red-600 to-amber-500 hover:opacity-90 text-white font-bold text-base shadow-lg shadow-red-600/30 transition-all"
              >
                <Play className="w-5 h-5 fill-white" />
                <span>Bật Camera & Bắt Đầu</span>
              </button>
            </div>
          )}

          {/* Live Overlay HUD when streaming */}
          {isStreaming && (
            <div className="absolute inset-0 pointer-events-none p-6 flex flex-col justify-between">
              {/* Top HUD */}
              <div className="flex items-center justify-between pointer-events-auto">
                <div className="flex items-center space-x-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                  <span className={`w-3 h-3 rounded-full ${detected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
                  <span className="text-xs font-bold text-white">
                    {detected ? 'ĐÃ NHẬN DIỆN KHỚP' : 'TÌM KIẾM NGƯỜI...'}
                  </span>
                </div>

                <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-xs font-bold text-amber-400">
                  GIAI ĐOẠN: {status.stage ? status.stage.toUpperCase() : 'CHUẨN BỊ'}
                </div>
              </div>

              {/* Center Floating Feedback Banner */}
              <div className="self-center">
                <div
                  className={`px-6 py-2.5 rounded-2xl backdrop-blur-md text-sm md:text-base font-black shadow-xl transition-all ${
                    status.is_form_valid
                      ? 'bg-emerald-950/80 border border-emerald-500/50 text-emerald-300'
                      : 'bg-red-950/80 border border-red-500/50 text-red-300'
                  }`}
                >
                  {status.feedback}
                </div>
              </div>

              {/* Bottom HUD Controls */}
              <div className="flex items-center justify-between pointer-events-auto">
                <div className="flex items-center space-x-3">
                  <button
                    onClick={stopStreaming}
                    className="p-3 rounded-xl bg-red-600/80 hover:bg-red-600 text-white backdrop-blur transition-all"
                    title="Dừng Camera"
                  >
                    <Square className="w-5 h-5 fill-white" />
                  </button>
                  <button
                    onClick={resetCounter}
                    className="p-3 rounded-xl bg-gray-800/80 hover:bg-gray-700 text-white backdrop-blur transition-all"
                    title="Reset Reps"
                  >
                    <RefreshCw className="w-5 h-5" />
                  </button>
                </div>

                <button
                  onClick={saveWorkout}
                  disabled={status.valid_reps === 0}
                  className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-black text-sm shadow-lg shadow-amber-500/20 transition-all"
                >
                  <Save className="w-4 h-4" />
                  <span>Lưu Kết Quả</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Col: AI Stats & Analytics Panel */}
        <div className="space-y-6">
          {/* Big Reps Count Display */}
          <div className="bg-[#141824] rounded-2xl border border-gray-800 p-6 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10 text-8xl">🥊</div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              SỐ LẦN HOÀN THÀNH (REPS)
            </div>
            <div className="text-7xl font-black text-white mt-2 tracking-tight">
              {status.valid_reps}
            </div>
            <div className="mt-2 text-sm text-gray-400">
              Tổng số lần thử: <span className="font-bold text-white">{status.total_reps}</span>
            </div>
          </div>

          {/* Form Quality Analysis */}
          <div className="bg-[#141824] rounded-2xl border border-gray-800 p-6 space-y-4">
            <h4 className="text-base font-bold text-white flex items-center justify-between">
              <span>Đánh Giá Kỹ Thuật (Form)</span>
              <span className="text-sm font-black text-amber-400">{status.form_score}%</span>
            </h4>

            {/* Quality Progress bar */}
            <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all duration-300 ${
                  status.form_score >= 80 ? 'bg-emerald-500' : 'bg-red-500'
                }`}
                style={{ width: `${status.form_score}%` }}
              ></div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
                <div className="text-xs text-emerald-400 font-semibold flex items-center justify-center space-x-1">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Chuẩn Form</span>
                </div>
                <div className="text-2xl font-black text-emerald-400 mt-1">
                  {status.valid_reps}
                </div>
              </div>

              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
                <div className="text-xs text-red-400 font-semibold flex items-center justify-center space-x-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Sai Tư Thế</span>
                </div>
                <div className="text-2xl font-black text-red-400 mt-1">
                  {status.invalid_reps}
                </div>
              </div>
            </div>

            {/* Real-time Angle Metrics */}
            {angles && (
              <div className="mt-4 pt-4 border-t border-gray-800 text-xs text-gray-400 space-y-1.5">
                <div className="font-bold text-gray-300 mb-2">Thông Số Góc Khớp Real-time:</div>
                <div className="flex justify-between">
                  <span>Khuỷu tay (Trái/Phải):</span>
                  <span className="font-mono text-amber-400">{angles.left_elbow_angle}° / {angles.right_elbow_angle}°</span>
                </div>
                <div className="flex justify-between">
                  <span>Đầu gối (Trái/Phải):</span>
                  <span className="font-mono text-amber-400">{angles.left_knee_angle}° / {angles.right_knee_angle}°</span>
                </div>
                <div className="flex justify-between">
                  <span>Góc hông:</span>
                  <span className="font-mono text-amber-400">{angles.left_hip_angle}°</span>
                </div>
              </div>
            )}
          </div>

          {savedSuccess && (
            <div className="p-4 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-sm font-semibold flex items-center space-x-2">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <span>Đã lưu kết quả bài tập vào tiến độ hôm nay!</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
