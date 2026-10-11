# CloudPilot Demo Walkthrough & Video Recording Storyboard

> Step-by-step demonstration script, screen recording guide, and bilingual presentation storyboard for presenting CloudPilot in Full-stack & DevOps interviews.

---

## 🎬 Video Recording Checklist & Setup

- **Recommended Resolution**: 1920x1080 (1080p, 60fps).
- **Target Video Duration**: 4 - 5 minutes.
- **Tools**: OBS Studio / Loom / CleanShot X.
- **Browser State**: Clean Chrome profile, Zoom 110%, DevTools closed or placed on secondary monitor.
- **Local Services Running**:
  - Infrastructure: `pnpm dev:infra` (PostgreSQL :5432, Redis :6379).
  - Database: Seeded with `pnpm db:seed`.
  - API: `pnpm api:dev` (:4000).
  - Worker: `pnpm worker:dev`.
  - Frontend: `pnpm web:dev` (:3000).

---

## ⏱️ Video Storyboard & Narration Script

### Scene 1: Introduction & Authentication (0:00 - 0:45)

- **Visual**:
  - Open `http://localhost:3000/login`.
  - Clean developer-focused authentication card.
  - Fill credentials: `dev@cloudpilot.local` / `Dev123!@#`.
  - Click "Sign In".
- **Narration (Tiếng Việt)**:
  > _"Xin chào các bạn và nhà tuyển dụng. Hôm nay mình xin giới thiệu CloudPilot — nền tảng quản lý và tự động hóa triển khai ứng dụng web containerized từ Git repositories._
  > _Hệ thống sử dụng cơ chế session-based authentication với cookie HttpOnly, mã hóa mật khẩu bằng Argon2id và rate limiting chặt chẽ để chống brute-force."_
- **Key Talking Points**:
  - Zero sensitive tokens in `localStorage`.
  - Secure HttpOnly session cookie lifecycle.

---

### Scene 2: Project Dashboard & GitHub Integration (0:45 - 1:30)

- **Visual**:
  - Dashboard displays project cards: "Portfolio Site" (Connected to GitHub) and "Microservice API".
  - Click on "Portfolio Site" to open Project Detail.
  - Show Project Settings tab: GitHub repository link, default branch `main`, commit SHA tracking, auto-deploy toggle.
- **Narration (Tiếng Việt)**:
  > _"Tại trang chi tiết dự án, chúng ta thấy CloudPilot quản lý dự án theo mô hình Role-Based Access Control (RBAC) nghiêm ngặt._
  > _Dự án này được liên kết trực tiếp với GitHub qua OAuth và Webhook. Token GitHub được mã hóa bằng AES-256-GCM trước khi lưu vào database và webhook được xác minh bằng chữ ký HMAC-SHA256 kèm chống replay."_
- **Key Talking Points**:
  - Least-privilege OAuth scopes (`read:user`, `repo`).
  - Immutable repository identifier (`repositoryId`) instead of brittle repo names.

---

### Scene 3: Encrypted Secrets & Audit Logging (1:30 - 2:15)

- **Visual**:
  - Click on "Environment Variables" tab.
  - Observe `DATABASE_URL` and `JWT_SECRET` masked as `••••••••`.
  - Add a new variable: `STRIPE_KEY` with value `sk_test_123456789`, toggle "Secret" ON, click "Save".
  - Click the eye icon next to `STRIPE_KEY` to reveal its value.
- **Narration (Tiếng Việt)**:
  > _"Toàn bộ biến môi trường nhạy cảm đều được mã hóa tại tầng lưu trữ bằng thuật toán AES-256-GCM kèm 16-byte authentication tag._
  > _API danh sách luôn che giá trị để tránh rò rỉ qua log hay màn hình. Chỉ thành viên có quyền Owner hoặc Maintainer mới có thể giải mã để xem, và hành động này sẽ được ghi nhận ngay vào bảng Audit Log."_
- **Key Talking Points**:
  - Object-level authorization prevents unauthorized secret exposure.
  - Tamper-proofing with GCM authentication tags.

---

### Scene 4: Triggering Deployment & Real-time Log Streaming (2:15 - 3:15)

- **Visual**:
  - Click "Deploy Now" button on the top right.
  - Status immediately changes to `QUEUED`, then `CLONING`.
  - Switch to "Deployments" $\to$ click on the active deployment.
  - Watch the live log terminal stream output through the Finite State Machine (FSM):
    - `[CLONE] Repository cloned at commit a1b2c3d`
    - `[BUILD] Executing Docker build with tag cloudpilot/portfolio-site:staging-...`
    - `[DEPLOY] Container booted on port 30042 with limits: memory=512MB, pids=100`
    - `[HEALTHCHECK] Probing http://127.0.0.1:30042/health... HTTP 200 OK`
    - `[SUCCEEDED] Release v2 promoted to ACTIVE.`
- **Narration (Tiếng Việt)**:
  > _"Khi bấm Deploy, API sẽ kiểm tra quyền và đẩy job vào Redis queue qua BullMQ trong chưa đầy 15ms. Worker chạy nền sẽ tiếp nhận job, clone Git an toàn bằng direct process spawn không qua shell, build Docker image với tag duy nhất._
  > _Container được khởi chạy với cgroups giới hạn 512MB RAM, 0.5 CPU và giới hạn 100 process để triệt tiêu nguy cơ fork bomb. Logs được cập nhật tuần tự có thứ tự rõ ràng."_
- **Key Talking Points**:
  - BullMQ queue decoupling.
  - Deterministic FSM lifecycle.
  - Strict security boundary: Docker socket is never mounted into user containers.

---

### Scene 5: Health Check & Zero-Downtime Verification (3:15 - 4:00)

- **Visual**:
  - Show the newly active container port link.
  - Click the link to open the deployed application in a new tab: returns `{"status":"ok","app":"Sample Express App"}`.
  - Show that while the build was progressing, the previous release was still running.
- **Narration (Tiếng Việt)**:
  > _"CloudPilot áp dụng cơ chế Blue-Green release không thời gian chết (zero downtime). Chỉ khi nào container mới vượt qua chu kỳ health check HTTP 200 liên tục, phiên bản mới mới được chuyển sang trạng thái ACTIVE, và phiên bản cũ mới được giải phóng an toàn."_
- **Key Talking Points**:
  - Zero dropped connections during deployment.
  - Localhost binding (`127.0.0.1`) ensures no unauthorized external port probing.

---

### Scene 6: 1-Click Rollback Demonstration (4:00 - 4:45)

- **Visual**:
  - Navigate to "Releases" table showing:
    - Release v2: ACTIVE
    - Release v1: INACTIVE
  - Click "Rollback to Release v1".
  - Watch modal confirmation: "Rollback to Release v1 (Commit: 789abcd)".
  - Click "Confirm Rollback".
  - A new rollback deployment starts, re-uses the pre-built image tag without re-cloning or re-building, verifies healthcheck, and activates Release v1 in just 3 seconds!
- **Narration (Tiếng Việt)**:
  > _"Một trong những tính năng mạnh mẽ nhất của CloudPilot là Rollback 1-click tức thì. Thay vì chỉ đổi cờ trong database, worker sẽ tái triển khai image digest đã được kiểm chứng của Release v1, chạy health check độc lập trước khi chuyển traffic._
  > _Nhờ đó, quá trình rollback diễn ra chỉ trong vài giây và không bao giờ gây gián đoạn hệ thống."_
- **Key Talking Points**:
  - Instant rollback by reusing pre-built validated container images.
  - Safe demotion of faulted releases.

---

### Scene 7: Observability, Audit Trail & Conclusion (4:45 - 5:00)

- **Visual**:
  - Click on "Audit Logs": show complete chronological audit trail:
    - `USER_LOGIN`
    - `SECRET_REVEALED`
    - `DEPLOYMENT_TRIGGER`
    - `DEPLOYMENT_ROLLBACK`
  - Show `/api/v1/health`: latency metrics for PostgreSQL and Redis.
  - Final summary slide.
- **Narration (Tiếng Việt)**:
  > _"Toàn bộ thao tác đều được kiểm soát bởi correlation ID và ghi nhận đầy đủ vào audit trail. Dự án CloudPilot được xây dựng hoàn toàn bằng NestJS, React, TypeScript monorepo, PostgreSQL, Redis BullMQ, Docker và kiểm thử tự động với 76 test suites đạt 100% pass._
  > _Cảm ơn các bạn đã theo dõi!"_
