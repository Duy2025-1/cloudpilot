# CloudPilot Security Policy & Threat Model

> Tài liệu mô hình đe dọa (Threat Model), các biện pháp giảm thiểu, danh mục kiểm tra an ninh (Security Checklist) và các rủi ro còn tồn tại của hệ thống **CloudPilot**.

---

## 1. Mô hình Đe dọa (STRIDE Threat Model)

Hệ thống CloudPilot được rà soát và đánh giá an ninh theo phương pháp chuẩn công nghiệp **STRIDE**:

| Danh mục STRIDE                                  | Mối đe dọa tiềm ẩn                                                                                                                                                                                             | Biện pháp giảm thiểu đã triển khai                                                                                                                                                                                                                                                                                                                                                                                                 | Trạng thái   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **Spoofing** (Giả mạo danh tính)                 | - Giả mạo tài khoản qua brute-force mật khẩu<br>- Giả mạo webhook từ GitHub<br>- Session Hijacking                                                                                                             | - Hash mật khẩu bằng **Argon2id** với tham số an toàn cao.<br>- Rate limiting 5 req/min cho `/login` và `/register`.<br>- Xác thực chữ ký webhook bằng **HMAC-SHA256** và so sánh chuỗi bằng `crypto.timingSafeEqual` chống timing attacks.<br>- Session cookie HttpOnly, SameSite, Secure (khi chạy HTTPS).                                                                                                                       | ✅ Đã bảo vệ |
| **Tampering** (Can thiệp dữ liệu)                | - Tiêm shell command qua branch/commit (`Command Injection`)<br>- Thay đổi giá trị biến môi trường trong DB<br>- Sửa đổi commit SHA sau khi build                                                              | - Thực thi Git và Docker bằng `child_process.spawn` với **`shell: false`** tuyệt đối.<br>- Mã hóa biến môi trường bằng **AES-256-GCM** kèm 16-byte authentication tag; bất kỳ sự can thiệp nào vào ciphertext đều khiến giải mã thất bại ngay lập tức.<br>- Cố định commit SHA bất biến (40 ký tự hex) cho mỗi bản deployment.                                                                                                     | ✅ Đã bảo vệ |
| **Repudiation** (Chối bỏ trách nhiệm)            | - Người dùng chối bỏ việc xóa dự án, sửa secret, hủy deploy hoặc kích hoạt rollback                                                                                                                            | - Bảng `audit_logs` lưu vết toàn bộ hành vi nhạy cảm: `USER_LOGIN`, `USER_LOGOUT`, `PROJECT_CREATE`, `PROJECT_DELETE`, `ENV_CREATE`, `ENV_UPDATE`, `ENV_DELETE`, `DEPLOYMENT_TRIGGER`, `DEPLOYMENT_CANCEL`, `DEPLOYMENT_ROLLBACK`, `SECRET_REVEALED`.<br>- Log lưu kèm `userId`, `projectId`, `action`, `metadata`, `createdAt`.                                                                                                   | ✅ Đã bảo vệ |
| **Information Disclosure** (Rò rỉ thông tin)     | - Lộ plaintext secret qua API danh sách biến môi trường<br>- Rò rỉ secret trong logs build<br>- Tấn công SSRF vào mạng nội bộ hoặc cloud metadata service<br>- BOLA / IDOR truy cập trái phép dự án người khác | - API danh sách biến môi trường trả về giá trị đã che mặt nạ (`••••••••`).<br>- Secret chỉ được giải mã trong memory của worker khi build/run container.<br>- Regex SSRF chặn đứng các URL nhắm vào loopback (`127.0.0.1`, `localhost`), dải IP riêng tư RFC1918, và AWS/GCP metadata (`169.254.169.254`).<br>- Object-level access control: Mọi endpoint Deployments và Environments đều xác thực quyền thành viên trong project. | ✅ Đã bảo vệ |
| **Denial of Service** (Từ chối dịch vụ)          | - Spam tạo deployment làm cạn kiệt hàng đợi<br>- Container ứng dụng chiếm dụng toàn bộ RAM/CPU của host<br>- Tấn công Fork bomb trong container (`:(){ :\|:& };:`)<br>- Webhook replay attack                  | - Rate limiting 10 req/min cho các endpoint tạo deployment.<br>- Giới hạn cgroups: `--memory=${memoryLimitMb}m`, `--cpus=${cpuLimit}`.<br>- Ngăn chặn Fork bomb bằng **`--pids-limit=100`**.<br>- Build timeout giới hạn 300s.<br>- Bảng `webhook_deliveries` kiểm tra UUID `X-GitHub-Delivery` để chống xử lý trùng lặp.                                                                                                          | ✅ Đã bảo vệ |
| **Elevation of Privilege** (Leo thang đặc quyền) | - Container escape chiếm quyền root trên máy chủ host<br>- Người dùng thường tự nâng quyền thành Owner                                                                                                         | - Container chạy dưới quyền unprivileged user (`USER node`).<br>- Cờ bảo mật bắt buộc **`--security-opt=no-new-privileges:true`**.<br>- **Tuyệt đối không mount Docker socket** (`/var/run/docker.sock`) vào container người dùng.<br>- Container port chỉ bind vào `127.0.0.1` trên host (không mở trực tiếp ra `0.0.0.0`).<br>- Phân quyền RBAC chặt chẽ: `OWNER`, `ADMIN`, `MEMBER`.                                            | ✅ Đã bảo vệ |

---

## 2. Danh mục Kiểm tra An ninh (Security Checklist)

### 2.1. Authentication & Session

- [x] Mật khẩu được hash bằng **Argon2id** (không sử dụng MD5, SHA-1 hay bcrypt cũ).
- [x] Session cookie có cờ `HttpOnly`, `SameSite: "lax"`, và `Secure` khi chạy production.
- [x] Rate limiting áp dụng cho `/auth/login` và `/auth/register`.
- [x] Endpoint `/auth/logout` xóa bản ghi session trong database và hủy cookie phía client.

### 2.2. Authorization & Object-Level Access Control (BOLA/IDOR)

- [x] Phân quyền dự án qua `ProjectMemberGuard` (hỗ trợ `OWNER`, `ADMIN`, `MEMBER`).
- [x] Người dùng A không thể xem, sửa, xóa dự án, biến môi trường hay deployment của người dùng B.
- [x] Chỉ `OWNER` hoặc `ADMIN` mới có quyền xóa dự án, cấu hình webhook, sửa biến môi trường, reveal secret hoặc thực hiện rollback.
- [x] Danh sách deployment (`GET /deployments`) được filter nghiêm ngặt theo các dự án mà người dùng đang là thành viên.

### 2.3. Secret Management & Cryptography

- [x] Secrets được mã hóa bằng **AES-256-GCM** (khóa 256-bit, IV 12-byte ngẫu nhiên, Auth Tag 16-byte).
- [x] Không bao giờ trả về plaintext secret trong API `GET /environments/:id/vars`.
- [x] Việc xem lại secret (`POST /environments/:id/vars/:key/reveal`) yêu cầu quyền OWNER/ADMIN và luôn ghi lại Audit Log (`SECRET_REVEALED`).
- [x] Khóa bí mật và session secret được kiểm tra định dạng bắt buộc khi ứng dụng khởi động.

### 2.4. Container & Runtime Isolation

- [x] Không sử dụng lệnh shell nối chuỗi (`shell: false` trong toàn bộ `spawn`).
- [x] Ranh giới Docker Socket: `/var/run/docker.sock` không bao giờ được chuyển tiếp vào container ứng dụng.
- [x] Container bị giới hạn RAM, CPU và PIDs (`--pids-limit=100`).
- [x] Container port chỉ bind vào `127.0.0.1` của host.

### 2.5. Tracing & Logging

- [x] Correlation ID (`X-Request-Id`) được sinh tự động hoặc kế thừa xuyên suốt HTTP pipeline.
- [x] Structured HTTP logging ghi nhận IP, status code, latency và Correlation ID.
- [x] Deployment runner ghi nhật ký tuần tự vào `deployment_logs`.

---

## 3. Rủi ro còn tồn tại & Hạn chế Kiến trúc (Residual Risks & Limitations)

Hệ thống **không tự nhận là an toàn tuyệt đối**. Các rủi ro và giới hạn còn tồn tại dưới đây cần được cân nhắc trước khi triển khai quy mô lớn:

### 3.1. Chia sẻ Docker Daemon trên Single-Host (Shared Docker Daemon)

- **Hạn chế**: Hiện tại worker quản lý các container ứng dụng chung một Docker daemon trên cùng máy chủ host. Nếu hạt nhân Linux (Linux Kernel) xuất hiện lỗ hổng zero-day container escape chưa vá, kẻ tấn công có thể thoát khỏi container và truy cập host.
- **Biện pháp khuyến nghị cho Enterprise**: Chuyển đổi runtime container sang **MicroVMs** (AWS Firecracker, Kata Containers hoặc gVisor) hoặc cấp phát node độc lập cho từng tenant.

### 3.2. Kiểm soát Kết nối Mạng Chiều Đi (Egress Network Filtering)

- **Hạn chế**: Container ứng dụng hiện có thể thực hiện kết nối outbound ra internet (cần thiết để tải npm packages, gọi database bên ngoài). Nếu mã nguồn của người dùng chứa mã độc (supply-chain attack), container có thể kết nối ra máy chủ Command & Control (C2).
- **Biện pháp khuyến nghị**: Cấu hình firewall iptables hoặc eBPF (Cilium) để whitelist chỉ các domain tin cậy (như registry.npmjs.org, github.com) hoặc triển khai network proxy kiểm duyệt.

### 3.3. Quy trình Đổi Khóa Mã hóa (Key Rotation)

- **Hạn chế**: Khóa `ENCRYPTION_MASTER_KEY` hiện tại là khóa tĩnh đơn lẻ. Việc thay đổi khóa yêu cầu chạy script migration để giải mã bằng khóa cũ và mã hóa lại bằng khóa mới cho toàn bộ bản ghi `environment_variables` và `oauth_accounts`.
- **Biện pháp khuyến nghị**: Xây dựng cơ chế Key Versioning (lưu `keyVersion` kèm theo ciphertext) để hỗ trợ quá trình luân chuyển khóa không gián đoạn.

### 3.4. Lưu trữ Nhật ký Quy mô Lớn (High-Volume Log Storage)

- **Hạn chế**: Nhật ký deployment hiện lưu trực tiếp trong PostgreSQL (`deployment_logs`). Mặc dù đã có index `[deploymentId, createdAt]` và giới hạn limit, việc hàng nghìn deployment sinh ra hàng triệu dòng log có thể gây phình to database.
- **Biện pháp khuyến nghị**: Tích hợp log storage chuyên dụng như **Grafana Loki**, **Elasticsearch** hoặc lưu log archive nén lên S3 / Object Storage.

---

## 4. Quy trình Báo cáo Lỗ hổng (Vulnerability Disclosure)

Nếu bạn phát hiện bất kỳ lỗ hổng bảo mật nào trong CloudPilot, vui lòng **không tạo public issue** trên GitHub. Hãy gửi email báo cáo chi tiết đến:

📧 **security@cloudpilot.local**
