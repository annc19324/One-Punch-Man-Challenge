import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Pause, Timer, Navigation, Save, ArrowLeft, AlertCircle, Compass, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import { runningService } from '../services/api';

export const RunningTracker: React.FC = () => {
  const navigate = useNavigate();
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [distanceKm, setDistanceKm] = useState<number>(0);
  const [seconds, setSeconds] = useState<number>(0);
  const [route, setRoute] = useState<[number, number][]>([]);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [trackingMode, setTrackingMode] = useState<'outdoor' | 'indoor'>('indoor');
  const [simSpeedKmH, setSimSpeedKmH] = useState<number>(10.0); // 10 km/h Saitama target pace
  const [statusMessage, setStatusMessage] = useState<string>('Sẵn sàng cho thử thách 10km');
  const [gpsError, setGpsError] = useState<string>('');

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const timerRef = useRef<any>(null);
  const simIntervalRef = useRef<any>(null);
  const currentCoordsRef = useRef<[number, number]>([21.0478, 105.7838]); // Hanoi EPU default

  // Calculate distance between two lat/lng points using Haversine formula
  const getDistanceFromLatLonInKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initialCoords: [number, number] = [21.0478, 105.7838];
    currentCoordsRef.current = initialCoords;

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
    }).setView(initialCoords, 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const polyline = L.polyline([], { color: '#ef4444', weight: 5, opacity: 0.85 }).addTo(map);
    const marker = L.circleMarker(initialCoords, {
      radius: 9,
      fillColor: '#3b82f6',
      color: '#ffffff',
      weight: 3,
      opacity: 1,
      fillOpacity: 1,
    }).addTo(map);

    mapRef.current = map;
    polylineRef.current = polyline;
    markerRef.current = marker;

    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    // Try to get user current real position once
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          const userCoord: [number, number] = [latitude, longitude];
          currentCoordsRef.current = userCoord;
          map.setView(userCoord, 16);
          marker.setLatLng(userCoord);
          setGpsAccuracy(Math.round(accuracy));
          setStatusMessage(`Đã lấy vị trí GPS ban đầu (Độ chính xác ±${Math.round(accuracy)}m)`);
        },
        (err) => {
          console.log('Chưa cấp quyền GPS hoặc dùng mạng dây:', err.message);
          setStatusMessage('Khuyên dùng: Chọn "Chế Độ Máy Chạy Bộ / Giả Lập" khi test trên máy tính hoặc trong nhà.');
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Timer interval for elapsed time
  useEffect(() => {
    if (isRunning && !isPaused) {
      timerRef.current = setInterval(() => {
        setSeconds((prev: number) => prev + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isRunning, isPaused]);

  // Simulator loop when in indoor/simulation mode
  useEffect(() => {
    if (isRunning && !isPaused && trackingMode === 'indoor') {
      const stepIntervalMs = 1000;
      simIntervalRef.current = setInterval(() => {
        // Distance added per second: (km/h) / 3600
        const distancePerSec = simSpeedKmH / 3600;
        setDistanceKm((prev) => prev + distancePerSec);

        // Move coordinates slightly in a loop around current position
        const [lat, lng] = currentCoordsRef.current;
        const angle = Date.now() / 8000;
        const deltaLat = Math.sin(angle) * 0.00012;
        const deltaLng = Math.cos(angle) * 0.00012;
        const nextCoord: [number, number] = [lat + deltaLat, lng + deltaLng];
        currentCoordsRef.current = nextCoord;

        setRoute((prevRoute) => {
          const updated = [...prevRoute, nextCoord];
          if (polylineRef.current) polylineRef.current.setLatLngs(updated);
          if (markerRef.current) markerRef.current.setLatLng(nextCoord);
          if (mapRef.current) mapRef.current.panTo(nextCoord);
          return updated;
        });
      }, stepIntervalMs);
    } else {
      clearInterval(simIntervalRef.current);
    }
    return () => clearInterval(simIntervalRef.current);
  }, [isRunning, isPaused, trackingMode, simSpeedKmH]);

  // Start GPS Tracking
  const startRun = () => {
    setGpsError('');
    setIsRunning(true);
    setIsPaused(false);

    if (trackingMode === 'outdoor') {
      if (!navigator.geolocation) {
        setGpsError('Trình duyệt của bạn không hỗ trợ định vị GPS.');
        setIsRunning(false);
        return;
      }

      setStatusMessage('Đang kết nối vệ tinh GPS ngoài trời...');

      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          const newCoord: [number, number] = [latitude, longitude];

          setGpsAccuracy(Math.round(accuracy));
          setStatusMessage(`Tín hiệu GPS tốt (±${Math.round(accuracy)}m)`);

          setRoute((prevRoute: [number, number][]) => {
            if (prevRoute.length > 0) {
              const lastCoord = prevRoute[prevRoute.length - 1];
              const addedDist = getDistanceFromLatLonInKm(
                lastCoord[0],
                lastCoord[1],
                latitude,
                longitude
              );
              // Ignore noise (< 3m)
              if (addedDist > 0.003) {
                setDistanceKm((prevDist: number) => prevDist + addedDist);
              }
            }
            const updated: [number, number][] = [...prevRoute, newCoord];

            if (polylineRef.current) polylineRef.current.setLatLngs(updated);
            if (markerRef.current) markerRef.current.setLatLng(newCoord);
            if (mapRef.current) mapRef.current.panTo(newCoord);

            return updated;
          });
        },
        (err) => {
          console.warn('GPS error:', err.message);
          let errText = 'Không nhận được tín hiệu GPS.';
          if (err.code === 1) {
            errText = 'Vui lòng cấp quyền Vị trí (Location) trong trình duyệt để dùng GPS ngoài trời.';
          } else if (err.code === 2) {
            errText = 'Không thể xác định vị trí vệ tinh. Hãy chuyển sang Chế Độ Máy Chạy Bộ / Giả Lập.';
          }
          setGpsError(errText);
          setStatusMessage(errText);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 1000,
        }
      );
    } else {
      setStatusMessage(`Đang chạy máy / giả lập với tốc độ ${simSpeedKmH} km/h (Mục tiêu 10km)`);
    }
  };

  const pauseRun = () => {
    setIsPaused(true);
    setStatusMessage('Đã tạm dừng');
  };

  const resumeRun = () => {
    setIsPaused(false);
    setStatusMessage('Tiếp tục chạy bộ');
  };

  const stopRun = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (simIntervalRef.current) {
      clearInterval(simIntervalRef.current);
    }
    setIsRunning(false);
    setIsPaused(false);
    setStatusMessage('Đã kết thúc phiên chạy. Bạn có thể bấm Lưu Kết Quả.');
  };

  // Format MM:SS or HH:MM:SS
  const formatTime = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (hrs > 0) {
      return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Pace: min / km
  const getPace = () => {
    if (distanceKm <= 0.02 || seconds === 0) return '--:--';
    const paceMinutes = seconds / 60 / distanceKm;
    const mins = Math.floor(paceMinutes);
    const secs = Math.floor((paceMinutes - mins) * 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const saveRun = async () => {
    try {
      await runningService.logSession({
        distance_km: parseFloat(distanceKm.toFixed(2)),
        duration_seconds: seconds,
        pace_avg: `${getPace()} min/km`,
        gps_route_json: route,
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch {
      alert('Đã ghi nhận phiên chạy (Mock local)');
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center space-x-2 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Về Thử Thách Chính</span>
        </button>

        {/* Mode Selector */}
        <div className="flex items-center bg-gray-900 p-1 rounded-xl border border-gray-800">
          <button
            onClick={() => {
              if (!isRunning) setTrackingMode('indoor');
            }}
            disabled={isRunning}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              trackingMode === 'indoor'
                ? 'bg-amber-500 text-black shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Máy Chạy Bộ / Trong Nhà (Khuyên Dùng)</span>
          </button>

          <button
            onClick={() => {
              if (!isRunning) setTrackingMode('outdoor');
            }}
            disabled={isRunning}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              trackingMode === 'outdoor'
                ? 'bg-red-600 text-white shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>GPS Vệ Tinh Ngoài Trời</span>
          </button>
        </div>
      </div>

      {gpsError && (
        <div className="p-4 rounded-xl bg-red-500/20 border border-red-500/50 text-red-300 text-sm flex items-center space-x-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{gpsError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Live Map */}
        <div className="lg:col-span-2 relative bg-gray-900 rounded-2xl overflow-hidden border border-gray-800 h-[480px] shadow-2xl">
          <div ref={mapContainerRef} className="w-full h-full z-0" />

          {/* Floating GPS Accuracy / Status badge */}
          <div className="absolute top-4 left-4 z-10 bg-gray-950/85 backdrop-blur px-3.5 py-1.5 rounded-full border border-gray-800 text-xs font-semibold text-gray-200 flex items-center space-x-2 shadow-lg">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                trackingMode === 'indoor'
                  ? 'bg-amber-400 animate-pulse'
                  : gpsAccuracy && gpsAccuracy < 30
                  ? 'bg-emerald-500'
                  : 'bg-red-500'
              }`}
            ></span>
            <span>
              {trackingMode === 'indoor'
                ? `Mô phỏng máy chạy: ${simSpeedKmH} km/h`
                : gpsAccuracy
                ? `GPS: ±${gpsAccuracy}m`
                : 'Chờ vệ tinh GPS...'}
            </span>
          </div>

          {/* Status Message at Bottom */}
          <div className="absolute bottom-4 left-4 right-4 z-10 pointer-events-none">
            <div className="bg-gray-950/80 backdrop-blur px-4 py-2 rounded-xl border border-gray-800 text-xs text-gray-300 text-center mx-auto max-w-lg">
              {statusMessage}
            </div>
          </div>
        </div>

        {/* Right Col: Live Stats & Controls */}
        <div className="space-y-6">
          {/* Main Distance Counter */}
          <div className="bg-[#141824] rounded-2xl border border-gray-800 p-6 text-center shadow-xl">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              QUÃNG ĐƯỜNG ĐÃ CHẠY (KM)
            </div>
            <div className="text-6xl font-black text-amber-400 mt-2 font-mono">
              {distanceKm.toFixed(2)}
            </div>
            <div className="text-sm font-semibold text-gray-400 mt-1">
              Mục tiêu thử thách: 10.00 km
            </div>

            {/* Target 10km progress bar */}
            <div className="mt-4 w-full bg-gray-800 rounded-full h-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-amber-500 to-orange-500 h-3 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, (distanceKm / 10) * 100)}%` }}
              ></div>
            </div>
          </div>

          {/* Secondary Stats: Time & Pace */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#141824] rounded-2xl border border-gray-800 p-5 text-center shadow-md">
              <div className="flex items-center justify-center space-x-1 text-gray-400 text-xs font-bold uppercase mb-1">
                <Timer className="w-3.5 h-3.5" />
                <span>Thời Gian</span>
              </div>
              <div className="text-2xl font-black text-white font-mono">
                {formatTime(seconds)}
              </div>
            </div>

            <div className="bg-[#141824] rounded-2xl border border-gray-800 p-5 text-center shadow-md">
              <div className="flex items-center justify-center space-x-1 text-gray-400 text-xs font-bold uppercase mb-1">
                <Navigation className="w-3.5 h-3.5" />
                <span>Tốc Độ (Pace)</span>
              </div>
              <div className="text-2xl font-black text-white font-mono">
                {getPace()}
              </div>
              <div className="text-[10px] text-gray-400">min/km</div>
            </div>
          </div>

          {/* Speed Selector in Indoor Mode */}
          {trackingMode === 'indoor' && !isRunning && (
            <div className="bg-[#141824] rounded-2xl border border-gray-800 p-4 space-y-2">
              <div className="text-xs font-bold text-gray-300 flex justify-between">
                <span>Tốc độ máy chạy (Tùy chỉnh):</span>
                <span className="text-amber-400">{simSpeedKmH} km/h</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[8.0, 10.0, 12.0].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => setSimSpeedKmH(spd)}
                    className={`py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      simSpeedKmH === spd
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                        : 'bg-gray-850 text-gray-400 border-gray-800 hover:text-white'
                    }`}
                  >
                    {spd} km/h
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Control Buttons */}
          <div className="space-y-3">
            {!isRunning ? (
              <button
                onClick={startRun}
                className="w-full flex items-center justify-center space-x-2 py-4 rounded-xl bg-gradient-to-r from-red-600 to-amber-500 hover:opacity-90 text-white font-black text-base shadow-lg shadow-red-600/30 transition-all cursor-pointer"
              >
                <Play className="w-5 h-5 fill-white" />
                <span>Bắt Đầu Chạy Bộ</span>
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {isPaused ? (
                  <button
                    onClick={resumeRun}
                    className="flex items-center justify-center space-x-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-all cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>Tiếp Tục</span>
                  </button>
                ) : (
                  <button
                    onClick={pauseRun}
                    className="flex items-center justify-center space-x-2 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm transition-all cursor-pointer"
                  >
                    <Pause className="w-4 h-4 fill-white" />
                    <span>Tạm Dừng</span>
                  </button>
                )}

                <button
                  onClick={stopRun}
                  className="flex items-center justify-center space-x-2 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm transition-all cursor-pointer"
                >
                  <Square className="w-4 h-4 fill-white" />
                  <span>Kết Thúc</span>
                </button>
              </div>
            )}

            {!isRunning && distanceKm > 0 && (
              <button
                onClick={saveRun}
                className="w-full flex items-center justify-center space-x-2 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-amber-400 font-bold text-sm transition-all border border-gray-700 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Lưu Phiên Chạy Vào Thống Kê</span>
              </button>
            )}
          </div>

          {savedSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold text-center shadow-lg">
              ✅ Đã lưu kết quả chạy {distanceKm.toFixed(2)} km thành công vào hồ sơ anh hùng!
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
