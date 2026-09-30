# Xử lý secret an toàn — runbook

**Ngày:** 2026-09-25
**Bối cảnh:** `backend/.env` từng chứa một `OPENROUTER_API_KEY` trông như hợp lệ, và `.dockerignore` chỉ liệt kê `.env` ở gốc nên `COPY backend/ ./backend/` đã đóng nó vào một layer của image. Git không bị ảnh hưởng (`.gitignore` với pattern không có `/` khớp mọi cấp).

> Không dán giá trị secret vào chat, issue hay commit. Runbook này chỉ dùng tên biến.

## 1. Rotate (bắt buộc)

```bash
# 1. Tạo key mới trong dashboard OpenRouter, vô hiệu key cũ.
# 2. Dán key vào backend/.env — dùng script, KHÔNG gõ thẳng vào lệnh
#    (lệnh sẽ nằm trong ~/.bash_history) và KHÔNG dán vào chat:
node scripts/set-api-key.mjs          # dán rồi Ctrl-D
# 3. Xác nhận app vẫn chạy:
curl -s localhost:3000/api/health | head -c 80
# 4. Xoá bản sao lưu sau khi key mới đã hoạt động (bản sao lưu còn chứa key cũ):
rm -f backend/.env.bak
```

Sau khi rotate, chạy lại `npm run test:ai` để chứng minh provider thật vẫn trả lời.

### 1.1 Phạm vi phơi bày đã kiểm tra (2026-09-26)

| Bề mặt | Kết quả |
|---|---|
| Git (file được track) | **Sạch** — không file nào chứa tiền tố `sk-or-v1` |
| `docker-compose.yml` / `.prod.yml` | Dùng `${OPENROUTER_API_KEY:-}`, **không** hardcode giá trị |
| `.env.example` (tracked) | Để trống, chỉ có dòng comment |
| Docker image | `.dockerignore` chặn `**/.env` — key không nằm trong layer |
| File tạm `/tmp` | Đã làm rò 1 bản sao (`logging.fixed.py`) |
| Nơi hợp lệ duy nhất | `backend/.env` (đã siết quyền `600`) |

Kết luận: key **chưa từng** rò vào git hay image. Việc rotate là biện pháp phòng ngừa
cho một máy dev dùng chung, không phải ứng cứu sự cố.

### 1.2 Lỗi phát hiện khi làm việc này

`backend/.env` để quyền `644` — mọi user trên máy đọc được, kể cả `DB_PASSWORD` và
`JWT_SECRET`. Đã siết còn `600`. Script `set-api-key.mjs` cũng tự siết sau khi ghi
(vì `writeFileSync({ mode })` chỉ áp dụng khi **tạo mới** file, không áp dụng khi ghi
đè file đã tồn tại — đây là cái bẫy đã dính lần đầu).

## 2. Đã sửa trong code (để không lặp lại)

| Chốt | Vị trí |
|---|---|
| `.dockerignore` chặn `**/.env`, `**/.env.*`, `backend/.env`, `**/*.{pem,key,cert,p12}` | `.dockerignore` |
| `NODE_ENV=production` **không** auto-load `backend/.env` nữa | `backend/src/db/index.js` |
| Production thiếu `DATABASE_URL`/`DB_*` thì báo lỗi thay vì đoán DB | `backend/src/db/index.js` |
| Readiness chỉ báo trạng thái, không trả giá trị secret | `backend/src/lib/production-readiness.js` |
| Provider lưu **tên biến môi trường**, không lưu key | `ai_provider_configs.api_key_env` |

## 3. Kiểm chứng tự động

```bash
node tests/e2e/secrets-hygiene.mjs
```

Bộ test này khóa 7 điều kiện: không file nào được track chứa tiền tố credential (sk-or-v1-, sk-proj-, sk-ant-, AIza, ghp_, xoxb-, eyJ…), `.gitignore` phủ env mọi cấp, `.dockerignore` phủ env lồng nhau và file khóa, production không auto-load env cục bộ, provider chỉ tham chiếu tên biến, readiness không rò giá trị, và không `.env` nào được track.

## 4. Xác nhận image sạch (chạy 1 lần sau khi rebuild)

```bash
docker build -t pmo:probe . && \
docker run --rm --entrypoint sh pmo:probe -c 'test ! -e /app/backend/.env && echo PASS-no-env-in-image'
```

## 5. Quy ước vận hành

- Secret chỉ nằm ở: secret manager của hạ tầng, `.env` **cục bộ không track**, CI secret.
- Không `docker commit`, không `docker cp` file env vào container đang chạy.
- Khi thêm biến mới, thêm tên vào `.env.example` với giá trị trống, **không** thêm giá trị thật.
- Rotate định kỳ và ngay sau khi bất kỳ sự cố lộ secret nào.
