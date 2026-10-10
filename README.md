# 🥊 ONE PUNCH MAN CHALLENGE – AI FITNESS TRACKER

> **Đồ Án Tốt Nghiệp / Dự Án Khoa Học Máy Tính - Đại Học Điện Lực (EPU)**  
> Ứng dụng theo dõi và đánh giá thử thách thể lực thông minh kết hợp Computer Vision, Machine Learning và GPS Tracking.

---

## 🌟 1. Giới Thiệu Dự Án

Lấy cảm hứng từ chế độ luyện tập huyền thoại của Saitama trong bộ truyện *One Punch Man*:
- **100 Push-up** (Chống đẩy)
- **100 Sit-up** (Gập bụng)
- **100 Squat** (Ngồi xổm)
- **Chạy 10 km**

Hệ thống được thiết kế toàn diện với 3 trụ cột chính:
1. **AI Computer Vision (MediaPipe + Scikit-Learn):** Tự động nhận diện tư thế qua Camera, tính toán góc khớp thời gian thực, đếm số lần hoàn thành (reps) và chấm điểm chuẩn form (Form score).
2. **GPS Running Tracker (HTML5 Geolocation + Leaflet):** Theo dõi quãng đường chạy thực tế, vẽ lộ trình trên bản đồ, tính Pace và thời gian chạy.
3. **Gamification & Hero Ranking:** Hệ thống cấp bậc Hiệp hội Anh hùng (Tân binh -> Hero Class C -> B -> A -> S), chuỗi ngày luyện tập (Streak) và Bảng phong thần.

---

## 🏗️ 2. Kiến Trúc Hệ Thống (System Architecture)

```
                            [ USER ]
                                │
                                ▼
                   [ REACT + VITE FRONTEND ]
                    (Port 3000 - Tailwind UI)
                                │
        ┌───────────────────────┴───────────────────────┐
        │ HTTP / REST API                               │ WebSocket (15 FPS)
        ▼                                               ▼
[ NODE.JS EXPRESS BACKEND ]                   [ PYTHON FASTAPI AI SERVICE ]
 (Port 5000 - JWT & Business)                  (Port 8000 - CV & Machine Learning)
        │                                               │
        ▼                                               ├── MediaPipe Pose (33 Landmarks)
  [ POSTGRESQL ]                                        ├── Feature Extractor (Góc khớp)
 (Users, Workouts, Logs, GPS)                           ├── Random Forest (Phân loại tư thế)
                                                        └── FSM Rep Counter & Form Checker
```

---

## 📁 3. Cấu Trúc Thư Mục

```text
One Punch Man Challenge/
├── frontend/                  # Giao diện người dùng (React 19 + Vite + Tailwind CSS + Leaflet)
│   ├── src/
│   │   ├── components/        # Navbar, HUD, Layout
│   │   ├── pages/             # Dashboard, WorkoutCamera, RunningTracker, Leaderboard, History, Login
│   │   ├── context/           # AuthContext
│   │   ├── services/          # API & WebSocket client
│   │   └── types/             # TypeScript definitions
│   └── package.json
│
├── backend/                   # REST API máy chủ (Node.js + Express + PostgreSQL)
│   ├── src/
│   │   ├── config/            # Kết nối PostgreSQL (db.js)
│   │   ├── controllers/       # Auth, Workout, Running, Challenge, Stats
│   │   ├── middlewares/       # JWT Auth Middleware
│   │   ├── models/            # schema.sql (DDL cơ sở dữ liệu)
│   │   ├── routes/            # Express router
│   │   └── server.js          # Entrypoint máy chủ
│   ├── .env.example
│   └── package.json
│
├── ai-service/                # Dịch vụ trí tuệ nhân tạo (Python 3.12 + FastAPI)
│   ├── models/                # File mô hình (.joblib, .task) và evaluation_report.json
│   ├── dataset/               # Dữ liệu góc động tác (exercise_angles.csv)
│   ├── pose_detector.py       # Trích xuất 33 điểm MediaPipe Tasks Pose
│   ├── feature_extractor.py   # Tính toán vector đặc trưng các góc khớp
│   ├── rep_counter.py         # Finite State Machine đếm rep & kiểm tra form
│   ├── train.py               # Script huấn luyện Random Forest & xuất ma trận nhầm lẫn
│   ├── main.py                # FastAPI Server (WebSocket + REST + Webcam local test)
│   ├── requirements.txt
│   └── venv/                  # Python Virtual Environment đã cài sẵn thư viện
│
├── start-all.bat              # Script 1-click khởi chạy toàn bộ 3 dịch vụ
├── package.json               # Root scripts
└── README.md
```

---

## 🚀 4. Hướng Dẫn Khởi Chạy

### Cách 1: Khởi chạy 1-Click (Khuyến nghị trên Windows)
Chỉ cần nhấp đúp chuột vào file:
```text
start-all.bat
```
Hệ thống sẽ tự động mở 3 cửa sổ console chạy đồng thời:
- **Python AI Service:** `http://localhost:8000`
- **Node.js Backend:** `http://localhost:5000`
- **React Frontend:** `http://localhost:3000`

---

### Cách 2: Khởi chạy thủ công từng dịch vụ

#### 1. Khởi động AI Service (Python):
```powershell
cd ai-service
.\venv\Scripts\python main.py
```
> **Mẹo:** Bạn có thể kiểm tra webcam trực tiếp bằng lệnh:
> ```powershell
> .\venv\Scripts\python main.py --test-cam pushup
> ```

#### 2. Khởi động Backend API (Node.js):
```powershell
cd backend
npm run dev
```

#### 3. Khởi động Frontend (React):
```powershell
cd frontend
npm run dev
```
Truy cập trình duyệt tại: `http://localhost:3000`

---

## 🧠 5. Điểm Nhấn Học Thuật & Machine Learning (Cho Báo Cáo Đồ Án)

Mô hình phân loại tư thế được huấn luyện bằng thuật toán **Random Forest Classifier**:
- **Vector đặc trưng (9 góc hình học):**
  - Góc khuỷu tay trái & phải (vai - khuỷu - cổ tay)
  - Góc vai trái & phải (khuỷu - vai - hông)
  - Góc hông trái & phải (vai - hông - đầu gối)
  - Góc đầu gối trái & phải (hông - gối - cổ chân)
  - Góc nghiêng thân trên (đường nối vai-hông so với trục đứng)
- **Bộ nhãn động tác (7 trạng thái):**
  - `pushup_down`, `pushup_up`
  - `squat_down`, `squat_up`
  - `situp_down`, `situp_up`
  - `standing_idle`
- **Kết quả thực nghiệm trên tập kiểm tra (Test Set):**
  - **Accuracy:** `95.51%`
  - **F1-Score bình quân:** `0.96`
  - Báo cáo chi tiết và Confusion Matrix đã được lưu tại: `ai-service/models/evaluation_report.json`
