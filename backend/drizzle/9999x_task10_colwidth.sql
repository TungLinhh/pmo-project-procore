-- Task 10 follow-up: ciphertext AES-256-GCM (prefix enc:v1: + base64 iv/tag/data)
-- dai ~60-90 ky tu, vuot qua varchar(20)/(64) cu. Noi rong de GHI duoc khi
-- DATA_ENC_KEY bat. Du lieu cu ngan hon van nam gon. Rank 25.
ALTER TABLE workers ALTER COLUMN phone TYPE varchar(128);
--> statement-breakpoint
ALTER TABLE users ALTER COLUMN zalo_user_id TYPE varchar(256);
--> statement-breakpoint
