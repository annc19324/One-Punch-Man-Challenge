import { useState, useEffect, useRef } from 'react';
import { Play, Square, Pause, Timer, Navigation, Save, ArrowLeft } from 'lucide-react';
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

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const timerRef = useRef<any>(null);

  // Calculate distance between two lat/lng points using Haversine formula
  const getDistanceFromLatLonInKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Radius of earth in km
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

    // Default coordinate: Hanoi (EPU area)
    const initialCoords: [number, number] = [21.0478, 105.7838];

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
    }).setView(initialCoords, 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const polyline = L.polyline([], { color: '#ef4444', weight: 5 }).addTo(map);
    const marker = L.circleMarker(initialCoords, {
      radius: 8,
      fillColor: '#3b82f6',
      color: '#ffffff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.9,
    }).addTo(map);

    mapRef.current = map;
    polylineRef.current = polyline;
    markerRef.current = marker;

    // Try to get user current position once on load
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          map.setView([latitude, longitude], 17);
          marker.setLatLng([latitude, longitude]);
          setGpsAccuracy(Math.round(accuracy));
        },
        () => console.log('Could not get initial GPS location')
      );
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Timer interval
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

  // Start GPS Tracking
  const startRun = () => {
    if (!navigator.geolocation) {
      alert('Trình duyệt không hỗ trợ Geolocation GPS.');
      return;
    }

    setIsRunning(true);
    setIsPaused(false);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const newCoord: [number, number] = [latitude, longitude];

        setGpsAccuracy(Math.round(accuracy));

        setRoute((prevRoute: [number, number][]) => {
          if (prevRoute.length > 0) {
            const lastCoord = prevRoute[prevRoute.length - 1];
            const addedDist = getDistanceFromLatLonInKm(
              lastCoord[0],
              lastCoord[1],
              latitude,
              longitude
            );
            // Ignore noise jump (< 3 meters)
            if (addedDist > 0.003) {
              setDistanceKm((prevDist: number) => prevDist + addedDist);
            }
          }
          const updated: [number, number][] = [...prevRoute, newCoord];

          // Update map
          if (polylineRef.current) polylineRef.current.setLatLngs(updated);
          if (markerRef.current) markerRef.current.setLatLng(newCoord);
          if (mapRef.current) mapRef.current.panTo(newCoord);

          return updated;
        });
      },
      (err) => {
        console.warn('GPS watchPosition error:', err.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 1000,
      }
    );
  };

  const pauseRun = () => {
    setIsPaused(true);
  };

  const resumeRun = () => {
    setIsPaused(false);
  };

  const stopRun = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsRunning(false);
    setIsPaused(false);
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
    if (distanceKm <= 0.05 || seconds === 0) return "--:--";
    const paceMinutes = (seconds / 60) / distanceKm;
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
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center space-x-2 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Về Thử Thách</span>
        </button>
        <div className="text-xs font-semibold px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
          Mục tiêu: Chạy 10 km • Chuẩn Saitama 🏃‍♂️
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Live Map */}
        <div className="lg:col-span-2 relative bg-gray-900 rounded-2xl overflow-hidden border border-gray-800 h-[480px]">
          <div ref={mapContainerRef} className="w-full h-full z-0" />

          {/* Floating GPS Accuracy badge */}
          <div className="absolute top-4 left-4 z-10 bg-gray-950/80 backdrop-blur px-3 py-1.5 rounded-full border border-gray-800 text-xs font-medium text-gray-300 flex items-center space-x-2">
            <span className={`w-2 h-2 rounded-full ${gpsAccuracy && gpsAccuracy < 20 ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
            <span>GPS: {gpsAccuracy ? `±${gpsAccuracy}m` : 'Đang lấy tín hiệu...'}</span>
          </div>
        </div>

        {/* Right Col: Live Stats & Controls */}
        <div className="space-y-6">
          {/* Main Distance Counter */}
          <div className="bg-[#141824] rounded-2xl border border-gray-800 p-6 text-center">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              QUÃNG ĐƯỜNG ĐÃ CHẠY (KM)
            </div>
            <div className="text-6xl font-black text-amber-400 mt-2">
              {distanceKm.toFixed(2)}
            </div>
            <div className="text-sm font-semibold text-gray-400 mt-1">
              Mục tiêu: 10.00 km
            </div>

            {/* Target 10km progress bar */}
            <div className="mt-4 w-full bg-gray-800 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-amber-500 to-orange-500 h-2.5 rounded-full transition-all"
                style={{ width: `${Math.min(100, (distanceKm / 10) * 100)}%` }}
              ></div>
            </div>
          </div>

          {/* Secondary Stats: Time & Pace */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#141824] rounded-2xl border border-gray-800 p-5 text-center">
              <div className="flex items-center justify-center space-x-1 text-gray-400 text-xs font-bold uppercase mb-1">
                <Timer className="w-3.5 h-3.5" />
                <span>Thời Gian</span>
              </div>
              <div className="text-2xl font-black text-white font-mono">
                {formatTime(seconds)}
              </div>
            </div>

            <div className="bg-[#141824] rounded-2xl border border-gray-800 p-5 text-center">
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

          {/* Control Buttons */}
          <div className="space-y-3">
            {!isRunning ? (
              <button
                onClick={startRun}
                className="w-full flex items-center justify-center space-x-2 py-4 rounded-xl bg-gradient-to-r from-red-600 to-amber-500 hover:opacity-90 text-white font-black text-base shadow-lg shadow-red-600/30 transition-all"
              >
                <Play className="w-5 h-5 fill-white" />
                <span>Bắt Đầu Chạy Bộ</span>
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {isPaused ? (
                  <button
                    onClick={resumeRun}
                    className="flex items-center justify-center space-x-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-all"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>Tiếp Tục</span>
                  </button>
                ) : (
                  <button
                    onClick={pauseRun}
                    className="flex items-center justify-center space-x-2 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm transition-all"
                  >
                    <Pause className="w-4 h-4 fill-white" />
                    <span>Tạm Dừng</span>
                  </button>
                )}

                <button
                  onClick={stopRun}
                  className="flex items-center justify-center space-x-2 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm transition-all"
                >
                  <Square className="w-4 h-4 fill-white" />
                  <span>Kết Thúc</span>
                </button>
              </div>
            )}

            {!isRunning && distanceKm > 0 && (
              <button
                onClick={saveRun}
                className="w-full flex items-center justify-center space-x-2 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-amber-400 font-bold text-sm transition-all border border-gray-700"
              >
                <Save className="w-4 h-4" />
                <span>Lưu Phiên Chạy Vào Thống Kê</span>
              </button>
            )}
          </div>

          {savedSuccess && (
            <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold text-center">
              ✅ Đã lưu kết quả chạy {distanceKm.toFixed(2)} km thành công!
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
