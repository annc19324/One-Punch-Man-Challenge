import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Camera, RefreshCw, CheckCircle, AlertTriangle, Play, Square, Save, ArrowLeft, Volume2, VolumeX, Mic, MicOff, Sparkles, Cpu, Plus } from 'lucide-react';
import { workoutService, AI_WS_URL } from '../services/api';
import { soundEffects } from '../services/soundEffects';
import type { AIWorkoutStatus } from '../types';

// Helper calculate angle in degrees between 3 points
function calculateAngle(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number }
): number {
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) {
    angle = 360.0 - angle;
  }
  return Math.round(angle);
}

export const WorkoutCamera: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialExercise = searchParams.get('exercise') || 'pushup';

  const [exercise, setExercise] = useState<string>(initialExercise);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [aiMode, setAiMode] = useState<'client' | 'websocket'>('client');
  const [aiStatusText, setAiStatusText] = useState<string>('Sẵn sàng');
  
  const [status, setStatus] = useState<AIWorkoutStatus>({
    exercise: initialExercise,
    stage: null,
    total_reps: 0,
    valid_reps: 0,
    invalid_reps: 0,
    form_score: 100,
    feedback: 'Bấm Bắt Đầu để khởi động camera và đếm động tác',
    is_form_valid: true,
  });

  const [detected, setDetected] = useState<boolean>(false);
  const [angles, setAngles] = useState<{
    left_elbow_angle?: number;
    right_elbow_angle?: number;
    left_knee_angle?: number;
    right_knee_angle?: number;
    left_hip_angle?: number;
    right_hip_angle?: number;
  } | null>(null);

  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(soundEffects.isMuted);
  const [isVoice, setIsVoice] = useState<boolean>(soundEffects.isVoiceEnabled);
  const [cameraError, setCameraError] = useState<string>('');

  const lastValidRepsRef = useRef<number>(0);
  const lastInvalidRepsRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const frameIntervalRef = useRef<any>(null);
  const animFrameRef = useRef<number | null>(null);
  const poseDetectorRef = useRef<any>(null);
  const stageRef = useRef<string | null>(null);
  const validRepsRef = useRef<number>(0);
  const totalRepsRef = useRef<number>(0);
  const invalidRepsRef = useRef<number>(0);

  const toggleMute = () => {
    soundEffects.isMuted = !soundEffects.isMuted;
    setIsMuted(soundEffects.isMuted);
  };

  const toggleVoice = () => {
    soundEffects.isVoiceEnabled = !soundEffects.isVoiceEnabled;
    setIsVoice(soundEffects.isVoiceEnabled);
  };

  // Switch exercise
  const handleSelectExercise = (ex: string) => {
    setExercise(ex);
    setSearchParams({ exercise: ex });
    stageRef.current = null;
    lastValidRepsRef.current = 0;
    lastInvalidRepsRef.current = 0;
    validRepsRef.current = 0;
    totalRepsRef.current = 0;
    invalidRepsRef.current = 0;
    setStatus({
      exercise: ex,
      stage: null,
      total_reps: 0,
      valid_reps: 0,
      invalid_reps: 0,
      form_score: 100,
      feedback: `Sẵn sàng cho bài tập ${ex.toUpperCase()}`,
      is_form_valid: true,
    });
  };

  // Local FSM rep counter logic
  const processAnglesAndUpdateRep = useCallback((calculatedAngles: {
    left_elbow: number;
    right_elbow: number;
    left_knee: number;
    right_knee: number;
    left_hip: number;
    right_hip: number;
  }) => {
    const avgElbow = (calculatedAngles.left_elbow + calculatedAngles.right_elbow) / 2;
    const avgKnee = (calculatedAngles.left_knee + calculatedAngles.right_knee) / 2;
    const avgHip = (calculatedAngles.left_hip + calculatedAngles.right_hip) / 2;

    setAngles({
      left_elbow_angle: calculatedAngles.left_elbow,
      right_elbow_angle: calculatedAngles.right_elbow,
      left_knee_angle: calculatedAngles.left_knee,
      right_knee_angle: calculatedAngles.right_knee,
      left_hip_angle: calculatedAngles.left_hip,
      right_hip_angle: calculatedAngles.right_hip,
    });

    if (exercise === 'pushup') {
      // Push-up: Down stage when elbow < 95
      if (avgElbow < 95) {
        if (stageRef.current !== 'down') {
          stageRef.current = 'down';
          const isBackStraight = avgHip > 135;
          const feedbackText = isBackStraight ? 'Độ sâu tốt! Hãy đẩy lên' : 'Giữ lưng thẳng, đừng võng hông!';
          setStatus((prev) => ({
            ...prev,
            stage: 'down',
            feedback: feedbackText,
            is_form_valid: isBackStraight,
          }));
        }
      } else if (avgElbow > 155) {
        // Push-up: Up stage
        if (stageRef.current === 'down') {
          stageRef.current = 'up';
          totalRepsRef.current += 1;
          const isBackStraight = avgHip > 135;

          if (isBackStraight) {
            validRepsRef.current += 1;
            const newValid = validRepsRef.current;
            soundEffects.playRepSuccess(newValid);
            setStatus({
              exercise: 'pushup',
              stage: 'up',
              total_reps: totalRepsRef.current,
              valid_reps: newValid,
              invalid_reps: invalidRepsRef.current,
              form_score: Math.round((newValid / totalRepsRef.current) * 100),
              feedback: `Tuyệt vời! +1 Push-up chuẩn (${newValid})`,
              is_form_valid: true,
            });
          } else {
            invalidRepsRef.current += 1;
            soundEffects.playFormWarning();
            setStatus({
              exercise: 'pushup',
              stage: 'up',
              total_reps: totalRepsRef.current,
              valid_reps: validRepsRef.current,
              invalid_reps: invalidRepsRef.current,
              form_score: Math.round((validRepsRef.current / totalRepsRef.current) * 100),
              feedback: 'Chưa đạt form: Hông bị võng hoặc chưa thẳng lưng',
              is_form_valid: false,
            });
          }
        }
      }
    } else if (exercise === 'squat') {
      // Squat: Down stage when knee < 105
      if (avgKnee < 105) {
        if (stageRef.current !== 'down') {
          stageRef.current = 'down';
          setStatus((prev) => ({
            ...prev,
            stage: 'down',
            feedback: 'Độ sâu Squat hoàn hảo! Đứng lên',
            is_form_valid: true,
          }));
        }
      } else if (avgKnee > 158) {
        // Squat: Up stage
        if (stageRef.current === 'down') {
          stageRef.current = 'up';
          totalRepsRef.current += 1;
          validRepsRef.current += 1;
          const newValid = validRepsRef.current;
          soundEffects.playRepSuccess(newValid);
          setStatus({
            exercise: 'squat',
            stage: 'up',
            total_reps: totalRepsRef.current,
            valid_reps: newValid,
            invalid_reps: invalidRepsRef.current,
            form_score: Math.round((newValid / totalRepsRef.current) * 100),
            feedback: `Squat chuẩn! +1 Rep (${newValid})`,
            is_form_valid: true,
          });
        }
      }
    } else if (exercise === 'situp') {
      // Sit-up: Down stage when hip > 125
      if (avgHip > 125) {
        if (stageRef.current !== 'down') {
          stageRef.current = 'down';
          setStatus((prev) => ({
            ...prev,
            stage: 'down',
            feedback: 'Gập bụng ngồi dậy!',
            is_form_valid: true,
          }));
        }
      } else if (avgHip < 85) {
        // Sit-up: Up stage
        if (stageRef.current === 'down') {
          stageRef.current = 'up';
          totalRepsRef.current += 1;
          validRepsRef.current += 1;
          const newValid = validRepsRef.current;
          soundEffects.playRepSuccess(newValid);
          setStatus({
            exercise: 'situp',
            stage: 'up',
            total_reps: totalRepsRef.current,
            valid_reps: newValid,
            invalid_reps: invalidRepsRef.current,
            form_score: Math.round((newValid / totalRepsRef.current) * 100),
            feedback: `Gập bụng tốt! +1 Rep (${newValid})`,
            is_form_valid: true,
          });
        }
      }
    }
  }, [exercise]);

  // Client-side MediaPipe Pose onResults callback
  const onPoseResults = useCallback((results: any) => {
    if (!canvasRef.current || !videoRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (results.poseLandmarks && results.poseLandmarks.length > 0) {
      setDetected(true);
      const lm = results.poseLandmarks;

      // Draw skeleton lines
      const connections = [
        [11, 12], // shoulders
        [11, 13], [13, 15], // left arm
        [12, 14], [14, 16], // right arm
        [11, 23], [12, 24], // torso
        [23, 24], // hips
        [23, 25], [25, 27], // left leg
        [24, 26], [26, 28], // right leg
      ];

      ctx.lineWidth = 4;
      ctx.strokeStyle = status.is_form_valid ? '#10b981' : '#ef4444';

      connections.forEach(([p1, p2]) => {
        if (lm[p1] && lm[p2] && lm[p1].visibility > 0.4 && lm[p2].visibility > 0.4) {
          ctx.beginPath();
          ctx.moveTo(lm[p1].x * canvas.width, lm[p1].y * canvas.height);
          ctx.lineTo(lm[p2].x * canvas.width, lm[p2].y * canvas.height);
          ctx.stroke();
        }
      });

      // Draw landmark points
      [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].forEach((idx) => {
        const pt = lm[idx];
        if (pt && pt.visibility > 0.4) {
          ctx.beginPath();
          ctx.arc(pt.x * canvas.width, pt.y * canvas.height, 6, 0, 2 * Math.PI);
          ctx.fillStyle = '#f59e0b';
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
        }
      });

      // Compute geometric angles
      const lElbow = calculateAngle(lm[11], lm[13], lm[15]);
      const rElbow = calculateAngle(lm[12], lm[14], lm[16]);
      const lHip = calculateAngle(lm[11], lm[23], lm[25]);
      const rHip = calculateAngle(lm[12], lm[24], lm[26]);
      const lKnee = calculateAngle(lm[23], lm[25], lm[27]);
      const rKnee = calculateAngle(lm[24], lm[26], lm[28]);

      processAnglesAndUpdateRep({
        left_elbow: lElbow,
        right_elbow: rElbow,
        left_knee: lKnee,
        right_knee: rKnee,
        left_hip: lHip,
        right_hip: rHip,
      });
    } else {
      setDetected(false);
    }
  }, [processAnglesAndUpdateRep, status.is_form_valid]);

  // Start Camera and AI Engine
  const startStreaming = async () => {
    setCameraError('');
    try {
      // 1. Get webcam stream with flexible constraints
      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Camera is successfully on!
      setIsCameraActive(true);
      setAiStatusText('Đang khởi tạo AI Pose...');

      // 2. Initialize in-browser MediaPipe Pose
      if ((window as any).Pose) {
        try {
          const pose = new (window as any).Pose({
            locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
          });
          pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            enableSegmentation: false,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
          pose.onResults(onPoseResults);
          poseDetectorRef.current = pose;
          setAiMode('client');
          setAiStatusText('🟢 AI MediaPipe Browser Sẵn Sàng (30 FPS)');

          // Continuous detection loop
          const sendFrameToMediaPipe = async () => {
            if (videoRef.current && videoRef.current.readyState >= 2 && poseDetectorRef.current) {
              try {
                await poseDetectorRef.current.send({ image: videoRef.current });
              } catch {
                // Ignore transient frame send error
              }
            }
            animFrameRef.current = requestAnimationFrame(sendFrameToMediaPipe);
          };
          animFrameRef.current = requestAnimationFrame(sendFrameToMediaPipe);
        } catch (mpErr) {
          console.warn('Could not init MediaPipe Pose in browser, trying WebSocket fallback:', mpErr);
          setupWebSocketFallback();
        }
      } else {
        // MediaPipe not yet loaded via CDN, try WebSocket
        setupWebSocketFallback();
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError('Không thể mở Camera: ' + (err.message || 'Vui lòng kiểm tra quyền truy cập Camera của trình duyệt'));
    }
  };

  // Optional Python WebSocket fallback
  const setupWebSocketFallback = () => {
    try {
      const wsUrl = `${AI_WS_URL}/${exercise}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`🔌 WebSocket connected to AI service for: ${exercise}`);
        setAiMode('websocket');
        setAiStatusText('🟢 Kết nối Python AI Service');

        frameIntervalRef.current = setInterval(() => {
          sendFrameViaWs();
        }, 80);
      };

      ws.onmessage = (event) => {
        try {
          const res = JSON.parse(event.data);
          if (res.counter) {
            if (res.counter.valid_reps > lastValidRepsRef.current) {
              soundEffects.playRepSuccess(res.counter.valid_reps);
              lastValidRepsRef.current = res.counter.valid_reps;
            }
            if (res.counter.invalid_reps > lastInvalidRepsRef.current) {
              soundEffects.playFormWarning();
              lastInvalidRepsRef.current = res.counter.invalid_reps;
            }
            setStatus(res.counter);
          }
          if (res.detected !== undefined) setDetected(res.detected);
          if (res.angles) setAngles(res.angles);
        } catch (e) {
          console.error('Error parsing WS message:', e);
        }
      };

      ws.onerror = () => {
        setAiStatusText('🟡 Chế độ Camera Trực Tiếp (Không cần AI Server)');
      };
    } catch (e) {
      console.warn('WS Init failed:', e);
    }
  };

  const sendFrameViaWs = () => {
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

  const stopStreaming = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
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
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    setIsCameraActive(false);
    setDetected(false);
    setAiStatusText('Đã dừng camera');
  };

  const resetCounter = () => {
    stageRef.current = null;
    lastValidRepsRef.current = 0;
    lastInvalidRepsRef.current = 0;
    validRepsRef.current = 0;
    totalRepsRef.current = 0;
    invalidRepsRef.current = 0;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send('RESET');
    }
    setStatus({
      exercise,
      stage: null,
      total_reps: 0,
      valid_reps: 0,
      invalid_reps: 0,
      form_score: 100,
      feedback: 'Đã thiết lập lại bộ đếm rep',
      is_form_valid: true,
    });
  };

  // Quick Manual Test Rep (+1)
  const handleTestRep = () => {
    totalRepsRef.current += 1;
    validRepsRef.current += 1;
    const newCount = validRepsRef.current;
    soundEffects.playRepSuccess(newCount);
    setStatus({
      exercise,
      stage: 'up',
      total_reps: totalRepsRef.current,
      valid_reps: newCount,
      invalid_reps: invalidRepsRef.current,
      form_score: Math.round((newCount / totalRepsRef.current) * 100),
      feedback: `Test Rep hoàn hảo! +1 (${newCount})`,
      is_form_valid: true,
    });
  };

  // Save workout to backend PostgreSQL
  const saveWorkout = async () => {
    try {
      await workoutService.logResult({
        exercise_type: exercise,
        reps_completed: status.valid_reps,
        form_score: status.form_score,
        reps_valid: status.valid_reps,
        reps_invalid: status.invalid_reps,
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch {
      alert('Đã lưu kết quả bài tập (Mock offline)');
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
      {/* Top Bar with Navigation, Tabs, and Audio Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center space-x-2 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Về Thử Thách Chính</span>
        </button>

        <div className="flex flex-wrap items-center gap-3">
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
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs md:text-sm font-bold transition-all ${
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

          {/* Sound & Voice Coach Controls */}
          <div className="flex items-center space-x-1.5 bg-gray-900 p-1.5 rounded-xl border border-gray-800">
            <button
              onClick={toggleMute}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                !isMuted
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-gray-400 hover:text-white'
              }`}
              title={isMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-gray-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
              <span>{isMuted ? 'Mute' : 'Âm thanh'}</span>
            </button>

            <button
              onClick={toggleVoice}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                isVoice
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-gray-400 hover:text-white'
              }`}
              title={isVoice ? 'Tắt giọng nói HLV' : 'Bật giọng nói HLV'}
            >
              {isVoice ? <Mic className="w-4 h-4 text-amber-400" /> : <MicOff className="w-4 h-4 text-gray-400" />}
              <span>{isVoice ? 'Giọng Đếm' : 'Tắt Giọng'}</span>
            </button>
          </div>
        </div>
      </div>

      {cameraError && (
        <div className="p-4 rounded-xl bg-red-500/20 border border-red-500/50 text-red-300 text-sm flex items-center space-x-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{cameraError}</span>
        </div>
      )}

      {/* Main Camera & HUD Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Camera Feed + Real-time Skeleton Canvas Overlay */}
        <div className="lg:col-span-2 relative bg-black rounded-2xl overflow-hidden border border-gray-800 aspect-[4/3] flex items-center justify-center shadow-2xl">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`w-full h-full object-cover transform -scale-x-100 ${!isCameraActive ? 'hidden' : 'block'}`}
          />
          <canvas
            ref={canvasRef}
            className={`absolute inset-0 w-full h-full object-cover transform -scale-x-100 pointer-events-none ${
              !isCameraActive ? 'hidden' : 'block'
            }`}
          />

          {/* Fallback state when camera is OFF */}
          {!isCameraActive && (
            <div className="absolute inset-0 bg-[#0c101c]/95 flex flex-col items-center justify-center p-6 text-center space-y-4">
              <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 shadow-inner">
                <Camera className="w-10 h-10" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-black text-white">Camera AI Chưa Khởi Động</h3>
                <p className="text-gray-400 text-sm max-w-md">
                  Nhấn nút bên dưới để mở webcam. Bạn chỉ cần đứng cách 1.5 - 2m sao cho thấy toàn thân để AI nhận diện góc khớp chuẩn xác.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  onClick={startStreaming}
                  className="inline-flex items-center space-x-2 px-6 py-3 rounded-xl bg-gradient-to-r from-red-600 to-amber-500 hover:opacity-90 text-white font-black text-base shadow-lg shadow-red-600/30 transition-all cursor-pointer"
                >
                  <Play className="w-5 h-5 fill-white" />
                  <span>Bật Camera & Bắt Đầu</span>
                </button>

                <button
                  onClick={handleTestRep}
                  className="inline-flex items-center space-x-2 px-4 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-amber-400 font-bold text-sm border border-gray-700 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Test Nhanh (+1 Rep)</span>
                </button>
              </div>
            </div>
          )}

          {/* Live Overlay HUD when Camera is Active */}
          {isCameraActive && (
            <div className="absolute inset-0 pointer-events-none p-5 flex flex-col justify-between">
              {/* Top HUD Status */}
              <div className="flex items-center justify-between pointer-events-auto">
                <div className="flex items-center space-x-2 bg-black/75 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10 text-xs">
                  <span className={`w-2.5 h-2.5 rounded-full ${detected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
                  <span className="font-bold text-white">
                    {detected ? 'ĐÃ THẤY TOÀN THÂN (33 KHỚP)' : 'ĐANG TÌM NGƯỜI...'}
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <div className="bg-black/75 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10 text-xs font-bold text-amber-400">
                    GIAI ĐOẠN: {status.stage ? status.stage.toUpperCase() : 'CHUẨN BỊ'}
                  </div>
                  <div className="hidden sm:flex bg-black/75 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-[11px] font-medium text-emerald-400 items-center space-x-1">
                    <Sparkles className="w-3 h-3" />
                    <span>{aiMode === 'client' ? 'MediaPipe Web AI' : 'Python AI'}</span>
                  </div>
                </div>
              </div>

              {/* Center Floating Feedback Banner */}
              <div className="self-center my-auto">
                <div
                  className={`px-6 py-2.5 rounded-2xl backdrop-blur-md text-sm md:text-base font-black shadow-2xl transition-all ${
                    status.is_form_valid
                      ? 'bg-emerald-950/85 border border-emerald-500/60 text-emerald-300'
                      : 'bg-red-950/85 border border-red-500/60 text-red-300'
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
                    className="p-3 rounded-xl bg-red-600/90 hover:bg-red-600 text-white backdrop-blur transition-all shadow-lg shadow-red-600/30 cursor-pointer"
                    title="Dừng Camera"
                  >
                    <Square className="w-5 h-5 fill-white" />
                  </button>
                  <button
                    onClick={resetCounter}
                    className="p-3 rounded-xl bg-gray-900/90 hover:bg-gray-800 text-white backdrop-blur border border-gray-700 transition-all cursor-pointer"
                    title="Reset Reps"
                  >
                    <RefreshCw className="w-5 h-5" />
                  </button>
                  <button
                    onClick={handleTestRep}
                    className="hidden sm:inline-flex items-center space-x-1 px-3 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition-all cursor-pointer"
                    title="Mô phỏng 1 lần hoàn thành để test âm thanh và hệ thống"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+1 Test Rep</span>
                  </button>
                </div>

                <button
                  onClick={saveWorkout}
                  disabled={status.valid_reps === 0}
                  className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-90 disabled:opacity-40 text-black font-black text-sm shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
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
          <div className="bg-[#141824] rounded-2xl border border-gray-800 p-6 text-center relative overflow-hidden shadow-xl">
            <div className="absolute top-0 right-0 p-4 opacity-10 text-8xl">🥊</div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              SỐ LẦN HOÀN THÀNH (REPS)
            </div>
            <div className="text-7xl font-black text-white mt-2 tracking-tight">
              {status.valid_reps}
            </div>
            <div className="mt-2 text-sm text-gray-400">
              Tổng số lần thực hiện: <span className="font-bold text-white">{status.total_reps}</span>
            </div>
          </div>

          {/* Form Quality Analysis */}
          <div className="bg-[#141824] rounded-2xl border border-gray-800 p-6 space-y-4 shadow-xl">
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
                <div className="font-bold text-gray-300 mb-2 flex items-center justify-between">
                  <span>Thông Số Góc Khớp Real-time:</span>
                  <span className="text-[10px] text-emerald-400">MediaPipe Vision</span>
                </div>
                <div className="flex justify-between">
                  <span>Khuỷu tay (Trái / Phải):</span>
                  <span className="font-mono text-amber-400">{angles.left_elbow_angle ?? '--'}° / {angles.right_elbow_angle ?? '--'}°</span>
                </div>
                <div className="flex justify-between">
                  <span>Đầu gối (Trái / Phải):</span>
                  <span className="font-mono text-amber-400">{angles.left_knee_angle ?? '--'}° / {angles.right_knee_angle ?? '--'}°</span>
                </div>
                <div className="flex justify-between">
                  <span>Góc hông:</span>
                  <span className="font-mono text-amber-400">{angles.left_hip_angle ?? '--'}°</span>
                </div>
              </div>
            )}

            <div className="pt-2 text-[11px] text-gray-500 flex items-center space-x-1.5">
              <Cpu className="w-3.5 h-3.5 text-gray-400" />
              <span>{aiStatusText}</span>
            </div>
          </div>

          {savedSuccess && (
            <div className="p-4 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-sm font-semibold flex items-center space-x-2 shadow-lg">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <span>Đã lưu kết quả bài tập vào tiến độ hôm nay!</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
