-- Dữ liệu dự án demo (BTE-WP4-HBC) — sinh tự động, đừng sửa tay.
-- 8228 dòng. Nạp: node scripts/load-demo-seed.mjs
-- Dữ liệu dẫn xuất từ hồ sơ dự án BTE; xem cảnh báo trong scripts/export-demo-seed.mjs.
BEGIN;

-- Kiểm tra khoá ngoại hoãn tới COMMIT: các bảng trong seed có vòng tham chiếu lẫn nhau
-- (construction_schedule_items ↔ work_items), nên không thứ tự COPY nào thoả được.
-- Lệnh này nằm trong BEGIN/COMMIT nên tự rollback — schema sau khi nạp y hệt trước đó.
ALTER TABLE construction_schedule_items ALTER CONSTRAINT construction_schedule_items_project_id_projects_id_fk DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE construction_schedule_items ALTER CONSTRAINT construction_schedule_items_zone_id_zones_id_fk DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE contracts ALTER CONSTRAINT contracts_project_id_projects_id_fk DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE contracts ALTER CONSTRAINT contracts_vendor_id_vendors_id_fk DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE invoices ALTER CONSTRAINT invoices_contract_id_contracts_id_fk DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE kpi_targets ALTER CONSTRAINT kpi_targets_project_id_projects_id_fk DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE kpi_targets ALTER CONSTRAINT kpi_targets_approved_by_users_id_fk DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE materials ALTER CONSTRAINT materials_project_id_projects_id_fk DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE materials ALTER CONSTRAINT materials_zone_id_zones_id_fk DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE payment_requests ALTER CONSTRAINT payment_requests_invoice_id_invoices_id_fk DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE payment_requests ALTER CONSTRAINT payment_requests_approved_by_users_id_fk DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE payments ALTER CONSTRAINT payments_project_id_projects_id_fk DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE payments ALTER CONSTRAINT payments_payment_request_id_payment_requests_id_fk DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE payments ALTER CONSTRAINT payments_vendor_id_vendors_id_fk DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE schedule_baselines ALTER CONSTRAINT schedule_baselines_project_id_projects_id_fk DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE schedule_baselines ALTER CONSTRAINT schedule_baselines_created_by_users_id_fk DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE shop_drawings ALTER CONSTRAINT shop_drawings_project_id_projects_id_fk DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE shop_drawings ALTER CONSTRAINT shop_drawings_zone_id_zones_id_fk DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE shop_drawings ALTER CONSTRAINT shop_drawings_rejected_by_users_id_fk DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE shop_drawings ALTER CONSTRAINT shop_drawings_reverted_to_draft_by_users_id_fk DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE work_items ALTER CONSTRAINT work_items_project_id_projects_id_fk DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE work_items ALTER CONSTRAINT work_items_wbs_id_wbs_id_fk DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE zones ALTER CONSTRAINT zones_project_id_projects_id_fk DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE construction_schedule_items ALTER CONSTRAINT construction_schedule_items_upload_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE shop_drawings ALTER CONSTRAINT shop_drawings_upload_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE materials ALTER CONSTRAINT materials_upload_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE shop_drawings ALTER CONSTRAINT shop_drawings_as_built_by_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE manpower_plans ALTER CONSTRAINT manpower_plans_project_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE manpower_plans ALTER CONSTRAINT manpower_plans_created_by_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE payment_requests ALTER CONSTRAINT payment_requests_retention_released_by_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE schedule_baseline_items ALTER CONSTRAINT schedule_baseline_items_baseline_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE schedule_baseline_items ALTER CONSTRAINT schedule_baseline_items_schedule_item_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE work_items ALTER CONSTRAINT work_items_zone_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE work_items ALTER CONSTRAINT work_items_source_schedule_item_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE construction_schedule_items ALTER CONSTRAINT construction_schedule_items_work_item_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE shop_drawings ALTER CONSTRAINT shop_drawings_work_item_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE materials ALTER CONSTRAINT materials_work_item_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE materials ALTER CONSTRAINT materials_accepted_by_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE schedule_baselines ALTER CONSTRAINT schedule_baselines_source_scenario_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE work_item_productivity ALTER CONSTRAINT work_item_productivity_project_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE work_item_productivity ALTER CONSTRAINT work_item_productivity_work_item_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE work_item_productivity ALTER CONSTRAINT work_item_productivity_source_upload_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE work_item_productivity ALTER CONSTRAINT work_item_productivity_created_by_fkey DEFERRABLE INITIALLY DEFERRED;

-- Zone do `init.js` tạo (19 zone, id 1..19) không phải bộ zone của dữ liệu demo (32 zone).
-- Xoá trước khi nạp để không thành 51 zone trùng lặp. Các bảng con đã nằm trong cùng
-- transaction nên xoá ở đây không vi phạm khoá ngoại (đã hoãn ở trên).
DELETE FROM zones WHERE project_id = (SELECT id FROM projects WHERE code = 'BTE-WP4-HBC');

-- zones — dự án BTE-WP4-HBC
-- Sinh bởi scripts/export-demo-seed.mjs. Nạp bằng: node scripts/load-demo-seed.mjs
-- Ngày giữ nguyên theo hồ sơ gốc; `npm run setup` gọi rebase-demo-dates.mjs để neo về ngày chạy.
COPY zones ("id", "project_id", "code", "name_vi", "name_en", "created_at") FROM stdin;
1	1	BOH	\N	Back of House	2026-09-03 09:06:50.769325
2	1	BPV	\N	Beach Pool Villa	2026-09-03 09:06:50.77434
3	1	BPV-1BR	\N	Beach Pool Villa 1BR	2026-09-03 09:06:50.777077
4	1	BPV-2BR	\N	Beach Pool Villa 2BR	2026-09-03 09:06:50.779329
5	1	BSN	\N	Business	2026-09-03 09:06:50.781353
6	1	BUT	\N	Butler	2026-09-03 09:06:50.783298
7	1	BZONE	\N	Zone B	2026-09-03 09:06:50.785252
8	1	CLU	\N	Cluster Villa	2026-09-03 09:06:50.787669
9	1	GEN	\N	General	2026-09-03 09:06:50.78982
10	1	HPV	\N	HPV	2026-09-03 09:06:50.791874
11	1	HPV-1BR	\N	HPV 1BR	2026-09-03 09:06:50.793859
12	1	HPV-2BR	\N	HPV 2BR	2026-09-03 09:06:50.795854
13	1	INF	\N	Infrastructure	2026-09-03 09:06:50.797814
14	1	KID	\N	Kid Club	2026-09-03 09:06:50.799658
15	1	LOB-SPA	\N	Lobby & Spa	2026-09-03 09:06:50.802002
16	1	RES	\N	Resort	2026-09-03 09:06:50.804396
17	1	RES-3BR	\N	Resort 3BR	2026-09-03 09:06:50.806452
18	1	RES-4BR	\N	Resort 4BR	2026-09-03 09:06:50.8084
19	1	VNR	\N	Vietnam Residences	2026-09-03 09:06:50.810429
20	1	TST-A	TST-A	TST-A	2026-09-03 14:38:54.213933
21	1	TST-B	TST-B	TST-B	2026-09-03 14:38:54.56194
22	1	TST-C	TST-C	TST-C	2026-09-03 14:38:55.051061
23	1	EMPTY	EMPTY	EMPTY	2026-09-03 14:41:01.990949
24	1	GEN-MAT	Material Supply - General	Material Supply - General	2026-09-03 15:14:40.198593
28	1	GEN-SHOP_D	GEN-SHOP_D	GEN-SHOP_D	2026-09-04 05:12:08.510334
29	1	GEN-MATERI	GEN-MATERI	GEN-MATERI	2026-09-04 05:15:12.94681
30	1	GEN-PAYMEN	GEN-PAYMEN	GEN-PAYMEN	2026-09-04 05:19:23.022861
40	1	BSC	BSC	BSC	2026-09-08 04:38:30.529209
41	1	BZN	BZN	BZN	2026-09-08 04:38:31.580744
42	1	FIT	FIT	FIT	2026-09-08 04:38:32.547363
43	1	GEN-SHOP	GEN-SHOP	GEN-SHOP	2026-09-08 04:52:30.307442
45	1	GEN-TD	GEN-TD	GEN-TD	2026-09-08 07:55:46.491125
\.

-- construction_schedule_items — dự án BTE-WP4-HBC
-- Sinh bởi scripts/export-demo-seed.mjs. Nạp bằng: node scripts/load-demo-seed.mjs
-- Ngày giữ nguyên theo hồ sơ gốc; `npm run setup` gọi rebase-demo-dates.mjs để neo về ngày chạy.
COPY construction_schedule_items ("id", "project_id", "zone_id", "source_sheet", "level_roman", "level_arabic", "sublevel", "ordinal", "name_vi", "name_en", "progress_pct", "status", "plan_start_date", "actual_start_date", "plan_end_date", "actual_end_date", "plan_duration_days", "baseline_version", "baseline_id", "created_at", "upload_id", "source_status", "work_item_id") FROM stdin;
5840	1	9	TĐ HPV-1 BR	I.	2	0	2	0.3	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:48.998898	\N	\N	1922
5841	1	9	TĐ HPV-2BR	I.	0	0	14	0.55	\N	0.5	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.007318	\N	\N	1923
4792	1	1	TĐ .BOH	VI	2	0	2	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	0.5	PENDING	2026-03-29	\N	2026-07-29	\N	\N	9	615	2026-09-23 21:47:01.372234	\N	\N	875
4786	1	1	TĐ .BOH	V	1	0	1	Lắp đặt đường ống nước cấp nước thoát/Water supply pipe system installation	\N	0	PENDING	2026-06-04	\N	2026-06-23	\N	20	9	615	2026-09-23 21:47:01.333753	\N	YES	869
4794	1	1	TĐ .BOH	VI	4	0	4	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	0	PENDING	2026-07-17	\N	2026-07-17	\N	1	9	615	2026-09-23 21:47:01.384132	\N	YES	877
3863	1	45	MEP-BTE-CSP-KID		0	0	13	TỔNG TIẾN ĐỘ THI CÔNG	\N	0.5	DONE	2026-05-19	2026-05-19	2026-10-21	2026-10-21	155	9	615	2026-09-08 07:55:46.497592	\N	\N	423
3738	1	14	MEP-BTE-CSP-KID		3	0	3	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	0.35	DONE	2026-07-06	2026-05-22	2026-07-08	2026-05-24	3	9	615	2026-09-08 04:38:35.185486	\N	\N	578
3790	1	17	MEP-BTE-CSP-RES- 3BR		2	0	2	Thi công lắp đặt ống đồng và bảo ôn tầng T2/Installing copper pipe and heat insulation floor2	\N	0	DONE	2026-08-12	2026-08-12	2026-08-12	2026-08-12	1	9	615	2026-09-08 04:38:36.103166	\N	\N	626
4858	1	1	TĐ .BOH	C	18	0	18	Lắp đặt thiết bị điều khiển tầng T2/Installing controling equipment floor2	\N	0	PENDING	2026-06-29	\N	2026-06-29	\N	1	9	615	2026-09-23 21:47:01.74667	\N	YES	941
4800	1	1	TĐ .BOH	A	4	0	4	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T2/Installing sealing water pipe and heat insulation floor2	\N	0	PENDING	2026-04-08	\N	2026-04-10	\N	3	9	615	2026-09-23 21:47:01.418706	\N	YES	883
3818	1	18	MEP-BTE-CSP-RES-4BR		14	0	14	Lắp đặt thiết bị quạt thông gió tầng T2/Installing air duct fan equipment floor2	\N	0	DONE	2026-08-25	2026-08-25	2026-08-25	2026-08-25	1	9	615	2026-09-08 04:38:36.498146	\N	\N	645
3446	1	3	MEP-BTE-CSP-BPV-1BR		1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	1	DONE	2026-05-29	2026-05-29	2026-05-30	2026-05-30	2	9	615	2026-09-08 04:38:29.951906	\N	\N	444
5848	1	9	TĐ BEACH ZONE	I.	1	0	1	0.25	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.052803	\N	\N	1930
5057	1	10	TĐ HPV 1- BR	II	2	0	2	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	0	PENDING	2026-06-09	\N	2026-06-09	\N	1	9	615	2026-09-23 21:47:03.450601	\N	YES	1140
5121	1	13	TĐ INF	V	9	0	9	Thi công hệ thống bơm (nước cấp, nước thoát, bù áp)/ Pump system installtion (water supply, drainage, pump pressure)	\N	0	PENDING	2026-08-28	\N	2026-11-02	\N	67	9	615	2026-09-23 21:47:03.986158	\N	YES	1204
3613	1	11	MEP-BTE-CSP-HPV-1BR		7	0	7	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	0.2	DONE	2026-06-07	2026-06-07	2026-06-07	2026-06-07	1	9	615	2026-09-08 04:38:33.365661	\N	\N	543
5836	1	9	TĐ BPV- 2BR	I.	1	0	1	0.25	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:48.974526	\N	\N	1918
5117	1	13	TĐ INF	V	5	0	5	Thi công đào, lấp đất/Excavation, backfill( Thoát nước)	\N	0	PENDING	2026-02-07	\N	2026-03-23	\N	45	9	615	2026-09-23 21:47:03.965581	\N	YES	1200
3851	1	19	MEP-BTE-CSP-VNR		1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	1	DONE	2026-06-03	2026-06-03	2026-06-04	2026-06-04	2	9	615	2026-09-08 04:38:36.932996	\N	\N	654
4802	1	1	TĐ .BOH	A	6	0	6	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T2/Installing air duct and heat insulation floor2	\N	0	PENDING	2026-06-23	\N	2026-06-25	\N	3	9	615	2026-09-23 21:47:01.430362	\N	YES	885
3358	1	1	MEP-BTE-CSP-BOH		7	0	7	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	1	DONE	2026-06-20	2026-06-20	2026-06-21	2026-06-21	2	9	615	2026-09-08 04:38:29.284489	\N	\N	507
4861	1	1	TĐ .BOH	C	21	0	21	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	0	PENDING	2026-07-19	\N	2026-07-19	\N	1	9	615	2026-09-23 21:47:01.764099	\N	YES	944
4789	1	1	TĐ .BOH	V	4	0	4	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	0	PENDING	2026-07-17	\N	2026-07-17	\N	1	9	615	2026-09-23 21:47:01.352216	\N	YES	872
4835	1	1	TĐ .BOH	B	17	0	17	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	0	PENDING	2026-06-21	\N	2026-06-23	\N	3	9	615	2026-09-23 21:47:01.616659	\N	YES	918
4878	1	1	TĐ .BOH	D	16	0	16	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	0	PENDING	2026-07-05	\N	2026-07-06	\N	2	9	615	2026-09-23 21:47:01.865119	\N	YES	961
4839	1	1	TĐ .BOH	B	21	0	21	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	0	PENDING	2026-07-29	\N	2026-07-29	\N	1	9	615	2026-09-23 21:47:01.639352	\N	YES	922
5877	1	9	TĐ INF	I.	0	0	14	0.55	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.215368	\N	\N	1959
3572	1	8	MEP-BTE-CSP-CLU		7	0	7	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	1	DONE	2026-07-30	2026-07-30	2026-07-30	2026-07-30	1	9	615	2026-09-08 04:38:32.441516	\N	\N	497
3525	1	41	MEP-BTE-CSP-BUT		1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	0.9	DONE	2026-06-12	2026-06-12	2026-06-13	2026-06-13	2	9	615	2026-09-08 04:38:31.942185	\N	\N	498
3558	1	8	MEP-BTE-CSP-CLU	I	0	0	15	Hệ thống cấp thoát nước/Water supply and drainage system35-48)	\N	\N	DONE	2026-04-20	2026-04-20	2026-10-02	2026-10-02	\N	9	615	2026-09-08 04:38:32.40186	\N	\N	680
5843	1	9	TĐ HPV-2BR	I.	2	0	2	0.3	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.023649	\N	\N	1925
3749	1	14	MEP-BTE-CSP-KID		7	0	7	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	0.35	DONE	2026-08-31	2026-07-18	2026-08-31	2026-07-18	1	9	615	2026-09-08 04:38:35.223155	\N	\N	584
3565	1	8	MEP-BTE-CSP-CLU	II	0	0	22	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	DONE	2026-07-16	2026-07-16	2026-09-16	2026-09-16	\N	9	615	2026-09-08 04:38:32.423739	\N	\N	681
3556	1	8	MEP-BTE-CSP-CLU		0	0	13	TỔNG TIẾN ĐỘ THI CÔNG	\N	\N	DONE	2026-04-20	2026-04-20	2026-10-02	2026-10-02	165	9	615	2026-09-08 04:38:32.397046	\N	\N	686
4784	1	1	TĐ .BOH	IV	4	0	4	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	0	PENDING	2026-06-24	\N	2026-06-24	\N	1	9	615	2026-09-23 21:47:01.320547	\N	YES	867
3622	1	12	MEP-BTE-CSP-HPV-2BR		2	0	2	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	0.35	DONE	2026-06-09	2026-06-09	2026-06-09	2026-06-09	1	9	615	2026-09-08 04:38:33.924454	\N	\N	549
4873	1	1	TĐ .BOH	D	11	0	11	Thử áp đường ống đồng tầng T2/Testing pressure copper pipe floor2	\N	0	PENDING	2026-06-29	\N	2026-06-29	\N	1	9	615	2026-09-23 21:47:01.835554	\N	YES	956
5008	1	8	TĐ .CLUSTER VILLA	II	0	0	24	Hệ thống cấp thoát nước/Water supply and drainage system(27-37 & 70-73)	\N	\N	PENDING	2026-05-15	\N	2026-05-15	\N	\N	9	615	2026-09-23 21:47:03.029811	\N	\N	1091
4804	1	1	TĐ .BOH	A	8	0	8	Thi công lắp đặt ống luồn dây tiến hiệu và điều khiển tầng T2/Installing signal of conduit and controlling floor2	\N	0	PENDING	2026-05-03	\N	2026-05-05	\N	3	9	615	2026-09-23 21:47:01.441937	\N	YES	887
4819	1	1	TĐ .BOH	B	1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	0	PENDING	2026-06-20	\N	2026-06-20	\N	1	9	615	2026-09-23 21:47:01.526993	\N	YES	902
3807	1	17	MEP-BTE-CSP-RES- 3BR		0	0	34	Thử kín đường ống nước ngưng tầng T2/Testing sealing water pipe floor2	\N	0	DONE	2026-08-14	2026-08-14	2026-08-14	2026-08-14	1	9	615	2026-09-08 04:38:36.143086	\N	\N	711
3658	1	13	MEP-BTE-CSP-INF	III	0	0	32	Hệ thống cấp thoát nước/Water supply and drainage system(D1)	\N	0.95	DONE	2026-02-21	2026-02-21	2026-02-21	2026-02-20	\N	9	615	2026-09-08 04:38:34.571981	\N	\N	691
3345	1	1	MEP-BTE-CSP-BOH	VI	0	0	39	Hệ thống cấp thoát nước/Water supply and drainage system(Zone D)	\N	1	DONE	2026-06-11	2026-06-11	2026-06-11	2026-06-10	\N	9	615	2026-09-08 04:38:29.233504	\N	\N	668
3542	1	41	MEP-BTE-CSP-BUT		10	0	10	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	0.9	DONE	2026-08-12	2026-08-12	2026-08-12	2026-08-12	1	9	615	2026-09-08 04:38:31.992393	\N	\N	505
3695	1	13	MEP-BTE-CSP-INF	VI	0	0	69	Hệ thống cấp thoát nước/Water supply and drainage system(D8)	\N	0.95	DONE	2026-02-22	2026-02-22	2026-02-22	2026-02-21	\N	9	615	2026-09-08 04:38:34.670016	\N	\N	696
4872	1	1	TĐ .BOH	D	10	0	10	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	0	PENDING	2026-06-23	\N	2026-06-23	\N	1	9	615	2026-09-23 21:47:01.828893	\N	YES	955
3803	1	17	MEP-BTE-CSP-RES- 3BR		0	0	30	Thi công lắp đặt ống luồn dây tiến hiệu và điều khiển tầng T2/Installing signal of conduit and controlling floor2	\N	0	DONE	2026-08-12	2026-08-12	2026-08-12	2026-08-12	1	9	615	2026-09-08 04:38:36.133884	\N	\N	707
3322	1	1	MEP-BTE-CSP-BOH		1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	1	DONE	2026-06-20	2026-06-20	2026-06-21	2026-06-21	2	9	615	2026-09-08 04:38:29.150987	\N	\N	511
3692	1	13	MEP-BTE-CSP-INF		12	0	12	Đổ bê tông hố ga tuyến D6	\N	1	DONE	2026-02-19	2026-02-22	2026-02-26	2026-03-08	8	9	615	2026-09-08 04:38:34.662603	\N	\N	592
5867	1	9	TĐ LOBY	I.	2	0	2	0.3	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.162117	\N	\N	1949
5861	1	9	TĐ RESIDENTIAL VILLA - 3BR	I.	2	0	2	0.3	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.130158	\N	\N	1943
3771	1	15	MEP-BTE-CSP-LOB & SPA		8	0	8	Thi công lắp đặt ống luồn dây tiến hiệu và điều khiển tầng 2 /Installing signal of conduit and controlling floor2	\N	0.8	DONE	2026-09-02	2026-09-02	2026-09-04	2026-09-04	3	9	615	2026-09-08 04:38:35.68982	\N	\N	607
3641	1	13	MEP-BTE-CSP-INF	I	0	0	15	Hệ thống cấp thoát nước/Water supply and drainage system (D5)	\N	0.95	DONE	2026-02-07	2026-02-07	2026-11-02	2026-11-08	\N	9	615	2026-09-08 04:38:34.526649	\N	\N	689
3843	1	18	MEP-BTE-CSP-RES-4BR		17	0	17	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	0	DONE	2026-08-26	2026-08-26	2026-08-26	2026-08-26	1	9	615	2026-09-08 04:38:36.563267	\N	\N	648
5833	1	9	TĐ BPV-1BR	I.	1	0	1	0.25	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:48.955989	\N	\N	1915
3783	1	15	MEP-BTE-CSP-LOB & SPA		20	0	20	Lắp đặt cửa gió tầng 1 /Installing air diffuser baseman floor	\N	1	DONE	2026-10-27	2026-10-27	2026-10-28	2026-10-28	2	9	615	2026-09-08 04:38:35.718514	\N	\N	618
3791	1	17	MEP-BTE-CSP-RES- 3BR		3	0	3	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	0	DONE	2026-08-09	2026-08-09	2026-08-10	2026-08-10	2	9	615	2026-09-08 04:38:36.105805	\N	\N	627
3781	1	15	MEP-BTE-CSP-LOB & SPA		18	0	18	Lắp đặt thiết bị điều khiển tầng 1/Installing controling equipment floor 1	\N	1	DONE	2026-08-23	2026-08-23	2026-08-24	2026-08-24	2	9	615	2026-09-08 04:38:35.713401	\N	\N	614
4811	1	1	TĐ .BOH	A	15	0	15	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	0	PENDING	2026-06-23	\N	2026-06-23	\N	1	9	615	2026-09-23 21:47:01.480905	\N	YES	894
4809	1	1	TĐ .BOH	A	13	0	13	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	0	PENDING	2026-06-23	\N	2026-06-25	\N	3	9	615	2026-09-23 21:47:01.469915	\N	YES	892
3441	1	1	MEP-BTE-CSP-BOH		24	0	24	Lắp đặt thiết bị điều khiển tầng T2/Installing controling equipment floor3	\N	1	DONE	2026-07-09	2026-07-09	2026-07-09	2026-07-09	1	9	615	2026-09-08 04:38:29.522466	\N	\N	453
3786	1	17	MEP-BTE-CSP-RES- 3BR		0	0	13	TỔNG TIẾN ĐỘ THI CÔNG	\N	\N	DONE	2026-05-19	2026-05-19	2026-10-21	2026-10-21	155	9	615	2026-09-08 04:38:36.091349	\N	\N	664
3541	1	41	MEP-BTE-CSP-BUT		9	0	9	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	0	DONE	2026-06-17	2026-06-17	2026-06-17	2026-06-17	1	9	615	2026-09-08 04:38:31.989555	\N	\N	504
4796	1	1	TĐ .BOH	A	0	0	46	Zone A	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 21:47:01.395371	\N	\N	879
5134	1	13	TĐ INF	VI	8	0	8	Kiểm tra hệ thống cấp thoát nước/testing water supply system	\N	0	PENDING	2026-06-28	\N	2026-09-05	\N	70	9	615	2026-09-23 21:47:04.059091	\N	YES	1217
3640	1	13	MEP-BTE-CSP-INF		14	0	14	Nghiêệm thu lắp đặt hố ga tuyến D6	\N	1	DONE	\N	2026-03-22	\N	\N	\N	9	615	2026-09-08 04:38:34.52353	\N	\N	574
3577	1	42	MEP-BTE-CSP-FIT		0	0	13	TỔNG TIẾN ĐỘ THI CÔNG	\N	\N	DONE	2026-05-09	2026-05-09	2026-10-17	2026-10-08	161	9	615	2026-09-08 04:38:32.803377	\N	\N	492
4829	1	1	TĐ .BOH	B	11	0	11	Thử kín đường ống nước ngưng tầng T2/Testing sealing water pipe floor1	\N	0	PENDING	2026-03-30	\N	2026-03-31	\N	2	9	615	2026-09-23 21:47:01.58336	\N	YES	912
3449	1	3	MEP-BTE-CSP-BPV-1BR		4	0	4	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	1	DONE	2026-06-01	2026-06-01	2026-06-02	2026-06-02	2	9	615	2026-09-08 04:38:29.961661	\N	\N	555
5862	1	9	TĐ RESIDENTIAL VILLA - 4BR 	I.	0	0	14	0.55	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.135245	\N	\N	1944
3691	1	13	MEP-BTE-CSP-INF		11	0	11	Gia công lắp đặt nghiệm thu cốp pha hố ga tuyến D6	\N	1	DONE	2026-02-19	2026-02-20	2026-02-26	2026-03-08	8	9	615	2026-09-08 04:38:34.660328	\N	\N	591
3464	1	4	MEP-BTE-CSP-BPV-2BR		0	0	13	TỔNG TIẾN ĐỘ THI CÔNG	\N	\N	DONE	2026-04-06	2026-04-06	2026-10-13	2026-10-13	190	9	615	2026-09-08 04:38:30.381508	\N	\N	562
3826	1	18	MEP-BTE-CSP-RES-4BR	II	0	0	22	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	DONE	2026-07-15	2026-07-15	2026-10-06	2026-10-06	\N	9	615	2026-09-08 04:38:36.518963	\N	\N	702
3880	1	45	MEP-BTE-CSP-KID		8	0	8	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	0.35	DONE	2026-08-31	2026-07-18	2026-08-31	2026-07-18	1	9	615	2026-09-08 07:55:46.599529	\N	\N	431
3752	1	14	MEP-BTE-CSP-KID		10	0	10	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	0.35	DONE	2026-10-15	2026-09-21	2026-10-15	2026-09-21	1	9	615	2026-09-08 04:38:35.234288	\N	\N	594
5859	1	9	TĐ RESIDENTIAL VILLA - 3BR	I.	0	0	14	0.55	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.118623	\N	\N	1941
5069	1	10	TĐ HPV 2- BR	I	1	0	1	Thi công lắp đặt đường ống cấp nước /Installing water pipe	\N	0	PENDING	2026-06-08	\N	2026-07-02	\N	25	9	615	2026-09-23 21:47:03.580582	\N	YES	1152
3782	1	15	MEP-BTE-CSP-LOB & SPA		19	0	19	Lắp đặt thiết bị điều khiển tầng 2 /Installing controling equipment floor1	\N	0.25	DONE	2026-08-31	2026-08-31	2026-08-31	2026-08-31	1	9	615	2026-09-08 04:38:35.716369	\N	\N	615
4821	1	1	TĐ .BOH	B	3	0	3	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	0	PENDING	2026-03-29	\N	2026-03-29	\N	1	9	615	2026-09-23 21:47:01.538017	\N	YES	904
4812	1	1	TĐ .BOH	A	16	0	16	Lắp đặt thiết bị điều hòa không khí tầng T2/Installing air conditional equipment floor2	\N	0	PENDING	2026-06-25	\N	2026-06-28	\N	4	9	615	2026-09-23 21:47:01.486598	\N	YES	895
4880	1	1	TĐ .BOH	D	18	0	18	Lắp đặt thiết bị quạt thông gió tầng mái/Installing air duct fan equipment rooftop	\N	0	PENDING	2026-07-08	\N	2026-07-09	\N	2	9	615	2026-09-23 21:47:01.87603	\N	YES	963
4842	1	1	TĐ .BOH	C	2	0	2	Thi công lắp đặt ống đồng và bảo ôn tầng T2/Installing copper pipe and heat insulation floor2	\N	0	PENDING	2026-06-23	\N	2026-06-24	\N	2	9	615	2026-09-23 21:47:01.656451	\N	YES	925
3864	1	45	MEP-BTE-CSP-KID		0	0	14	Công tác chuẩn bị	\N	1	DONE	2026-05-19	2026-05-19	2026-05-21	2026-05-21	3	9	615	2026-09-08 07:55:46.510047	\N	\N	660
3451	1	3	MEP-BTE-CSP-BPV-1BR		6	0	6	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	1	DONE	2026-05-31	2026-05-31	2026-05-31	2026-05-31	1	9	615	2026-09-08 04:38:29.967667	\N	\N	557
3757	1	15	MEP-BTE-CSP-LOB & SPA		1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng 1 /Installing copper pipe and heat insulation floor 1	\N	1	DONE	2026-08-23	2026-08-23	2026-08-31	2026-08-31	9	9	615	2026-09-08 04:38:35.652715	\N	\N	596
3450	1	3	MEP-BTE-CSP-BPV-1BR		5	0	5	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	1	DONE	2026-06-01	2026-06-01	2026-06-01	2026-06-01	1	9	615	2026-09-08 04:38:29.964721	\N	\N	556
3824	1	18	MEP-BTE-CSP-RES-4BR		5	0	5	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	0	DONE	2026-07-15	2026-07-15	2026-07-17	2026-07-17	3	9	615	2026-09-08 04:38:36.51449	\N	\N	636
3491	1	40	MEP-BTE-CSP-BSC		4	0	4	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	0.15	DONE	2026-06-23	2026-06-23	2026-06-24	2026-06-24	2	9	615	2026-09-08 04:38:31.006666	\N	\N	476
5846	1	9	TĐ CUL	I.	2	0	2	0.3	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.040826	\N	\N	1928
5850	1	9	TĐ KID CLUB	I.	0	0	14	0.55	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.065507	\N	\N	1932
5844	1	9	TĐ CUL	I.	0	0	14	0.55	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.029248	\N	\N	1926
3820	1	18	MEP-BTE-CSP-RES-4BR		1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	0	DONE	2026-08-09	2026-08-09	2026-08-10	2026-08-10	2	9	615	2026-09-08 04:38:36.503253	\N	\N	633
3443	1	3	MEP-BTE-CSP-BPV-1BR		0	0	13	TỔNG TIẾN ĐỘ THI CÔNG	\N	\N	DONE	2026-03-12	2026-03-12	2026-10-11	2026-10-11	213	9	615	2026-09-08 04:38:29.943133	\N	\N	553
4868	1	1	TĐ .BOH	D	6	0	6	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T2/Installing sealing water pipe and heat insulation floor3	\N	0	PENDING	2026-04-06	\N	2026-04-10	\N	5	9	615	2026-09-23 21:47:01.804166	\N	YES	951
3595	1	42	MEP-BTE-CSP-FIT		9	0	9	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	0.15	DONE	2026-10-15	2026-09-21	2026-10-15	2026-09-21	1	9	615	2026-09-08 04:38:32.857158	\N	\N	536
3868	1	45	MEP-BTE-CSP-KID		3	0	3	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	0.35	DONE	2026-07-06	2026-05-22	2026-07-08	2026-05-24	3	9	615	2026-09-08 07:55:46.533116	\N	\N	425
3634	1	12	MEP-BTE-CSP-HPV-2BR		7	0	7	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	0	DONE	2026-06-05	2026-06-05	2026-06-05	2026-06-05	1	9	615	2026-09-08 04:38:33.957799	\N	\N	565
4782	1	1	TĐ .BOH	IV	2	0	2	Kiểm tra thử kín, thử áp hệ thống cấp thoát nước/testing water supply system	\N	0	PENDING	2026-05-25	\N	2026-05-27	\N	3	9	615	2026-09-23 21:47:01.307174	\N	YES	865
4882	1	1	TĐ .BOH	D	20	0	20	Lắp đặt thiết bị điều hòa không khí tầng T2/Installing air conditional equipment floor2	\N	0	PENDING	2026-07-07	\N	2026-07-09	\N	3	9	615	2026-09-23 21:47:01.88767	\N	YES	965
3806	1	17	MEP-BTE-CSP-RES- 3BR		0	0	33	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	0	DONE	2026-08-12	2026-08-12	2026-08-12	2026-08-12	1	9	615	2026-09-08 04:38:36.140726	\N	\N	710
3503	1	40	MEP-BTE-CSP-BSC		9	0	9	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	0.15	DONE	2026-07-19	2026-07-19	2026-07-19	2026-07-19	1	9	615	2026-09-08 04:38:31.044686	\N	\N	481
3576	1	8	MEP-BTE-CSP-CLU		11	0	11	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	0	DONE	2026-09-16	2026-09-16	2026-09-16	2026-09-16	1	9	615	2026-09-08 04:38:32.452008	\N	\N	525
3502	1	40	MEP-BTE-CSP-BSC		8	0	8	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	0.15	DONE	2026-07-18	2026-07-18	2026-07-18	2026-07-18	1	9	615	2026-09-08 04:38:31.041376	\N	\N	480
4801	1	1	TĐ .BOH	A	5	0	5	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	0	PENDING	2026-06-20	\N	2026-06-21	\N	2	9	615	2026-09-23 21:47:01.424403	\N	YES	884
4807	1	1	TĐ .BOH	A	11	0	11	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	0	PENDING	2026-03-31	\N	2026-03-31	\N	1	9	615	2026-09-23 21:47:01.458473	\N	YES	890
3579	1	42	MEP-BTE-CSP-FIT	I	0	0	15	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	DONE	2026-05-09	2026-05-09	2026-10-08	2026-10-08	\N	9	615	2026-09-08 04:38:32.808706	\N	\N	682
5858	1	9	TĐ BUSINESS	I.	2	0	2	0.3	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.113615	\N	\N	1940
5872	1	9	TĐ BUTLER	I.	1	0	1	0.25	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.187677	\N	\N	1954
4862	1	1	TĐ .BOH	D	0	0	112	Zone D	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 21:47:01.769994	\N	YES	945
3865	1	45	MEP-BTE-CSP-KID	I	0	0	15	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	DONE	2026-06-01	2026-06-01	2026-10-21	2026-10-21	\N	9	615	2026-09-08 07:55:46.516429	\N	\N	429
3780	1	15	MEP-BTE-CSP-LOB & SPA		17	0	17	Lắp đặt thiết bị điều hòa không khí tầng 2 /Installing air conditional equipment floor2	\N	0.25	DONE	2026-08-31	2026-08-31	2026-09-03	2026-09-03	4	9	615	2026-09-08 04:38:35.710522	\N	\N	613
3866	1	45	MEP-BTE-CSP-KID		1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	0.35	DONE	2026-08-06	2026-06-23	2026-08-07	2026-06-24	2	9	615	2026-09-08 07:55:46.522235	\N	\N	435
3373	1	1	MEP-BTE-CSP-BOH	B	0	0	67	Zone B	\N	1	DONE	2026-03-29	2026-03-29	2026-03-29	2026-03-29	\N	9	615	2026-09-08 04:38:29.332926	\N	\N	669
3506	1	6	MEP-BTE-CSP-BUT		0	0	13	TỔNG TIẾN ĐỘ THI CÔNG	\N	\N	DONE	2026-05-12	2026-05-12	2026-12-29	2026-12-29	231	9	615	2026-09-08 04:38:31.399218	\N	\N	461
3638	1	12	MEP-BTE-CSP-HPV-2BR		11	0	11	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	0	DONE	2026-08-22	2026-08-22	2026-08-22	2026-08-22	1	9	615	2026-09-08 04:38:33.970213	\N	\N	569
3532	1	41	MEP-BTE-CSP-BUT	A	0	0	23	BEACH RESTAURANT	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-08 04:38:31.963739	\N	\N	554
4779	1	1	TĐ .BOH	III	4	0	4	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	0	PENDING	2026-05-12	\N	2026-05-12	\N	1	9	615	2026-09-23 21:47:01.290586	\N	YES	862
4860	1	1	TĐ .BOH	C	20	0	20	Lắp đặt cửa gió tầng T2/Installing air diffuser floor2	\N	0	PENDING	2026-07-17	\N	2026-07-17	\N	1	9	615	2026-09-23 21:47:01.758215	\N	YES	943
4825	1	1	TĐ .BOH	B	7	0	7	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	0	PENDING	2026-05-01	\N	2026-05-02	\N	2	9	615	2026-09-23 21:47:01.56118	\N	YES	908
5871	1	9	TĐ BUTLER	I.	0	0	14	0.55	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.183118	\N	\N	1953
4857	1	1	TĐ .BOH	C	17	0	17	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	0	PENDING	2026-06-27	\N	2026-06-27	\N	1	9	615	2026-09-23 21:47:01.740417	\N	YES	940
4771	1	1	TĐ .BOH	I	4	0	4	Lắp đặt đường ống cấp, máy bơm,van... /Water supply pipe installation, pumper, valve	\N	0	PENDING	2026-05-08	\N	2026-06-07	\N	31	9	615	2026-09-23 21:47:01.240304	\N	YES	854
4870	1	1	TĐ .BOH	D	8	0	8	Thi công lắp đặt ống luồn dây tiến hiệu và điều khiển tầng T2/Installing signal of conduit and controlling floor2	\N	0	PENDING	2026-06-23	\N	2026-06-27	\N	5	9	615	2026-09-23 21:47:01.816864	\N	YES	953
3763	1	15	MEP-BTE-CSP-LOB & SPA		22	0	22	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	0	DONE	2026-11-02	2026-11-02	2026-11-02	2026-11-02	1	9	615	2026-09-08 04:38:35.670681	\N	\N	603
4843	1	1	TĐ .BOH	C	3	0	3	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	0	PENDING	2026-03-29	\N	2026-03-30	\N	2	9	615	2026-09-23 21:47:01.662092	\N	YES	926
4776	1	1	TĐ .BOH	III	1	0	1	Lắp đặt đường ống nước cấp nước thoát/Water supply pipe system installation	\N	0	PENDING	2026-03-29	\N	2026-04-17	\N	20	9	615	2026-09-23 21:47:01.272908	\N	YES	859
3575	1	8	MEP-BTE-CSP-CLU		10	0	10	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	1	DONE	2026-09-14	2026-09-14	2026-09-14	2026-09-14	1	9	615	2026-09-08 04:38:32.449599	\N	\N	524
4877	1	1	TĐ .BOH	D	15	0	15	Thử kín đường ống nước ngưng tầng T2/Testing sealing water pipe floor3	\N	0	PENDING	2026-04-12	\N	2026-04-12	\N	1	9	615	2026-09-23 21:47:01.859401	\N	YES	960
4849	1	1	TĐ .BOH	C	9	0	9	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	0	PENDING	2026-06-23	\N	2026-06-23	\N	1	9	615	2026-09-23 21:47:01.695302	\N	YES	932
3370	1	1	MEP-BTE-CSP-BOH		19	0	19	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	1	DONE	2026-07-05	2026-07-05	2026-07-06	2026-07-05	2	9	615	2026-09-08 04:38:29.325309	\N	\N	450
5834	1	9	TĐ BPV-1BR	I.	2	0	2	0.3	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:48.962176	\N	\N	1916
3615	1	11	MEP-BTE-CSP-HPV-1BR		9	0	9	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	0.2	DONE	2026-06-07	2026-06-07	2026-06-07	2026-06-07	1	9	615	2026-09-08 04:38:33.372974	\N	\N	545
3473	1	4	MEP-BTE-CSP-BPV-2BR	II	0	0	22	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	DONE	2026-05-29	2026-05-29	2026-08-13	2026-08-13	\N	9	615	2026-09-08 04:38:30.407436	\N	\N	675
4853	1	1	TĐ .BOH	C	13	0	13	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	0	PENDING	2026-04-01	\N	2026-04-01	\N	1	9	615	2026-09-23 21:47:01.717697	\N	YES	936
3501	1	40	MEP-BTE-CSP-BSC		7	0	7	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	0.15	DONE	2026-07-18	2026-07-18	2026-07-18	2026-07-18	1	9	615	2026-09-08 04:38:31.037714	\N	\N	479
3856	1	19	MEP-BTE-CSP-VNR	II	0	0	21	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	DONE	2026-04-22	2026-04-22	2026-11-22	2026-11-23	\N	9	615	2026-09-08 04:38:36.948213	\N	\N	703
3787	1	17	MEP-BTE-CSP-RES- 3BR		0	0	14	Công tác chuẩn bị	\N	1	DONE	2026-05-19	2026-05-19	2026-05-21	2026-05-21	3	9	615	2026-09-08 04:38:36.094495	\N	\N	704
3557	1	8	MEP-BTE-CSP-CLU		0	0	14	Công tác chuẩn bị	\N	1	DONE	2026-05-19	2026-05-19	2026-05-21	2026-05-21	3	9	615	2026-09-08 04:38:32.39962	\N	\N	617
5000	1	8	TĐ .CLUSTER VILLA	A	0	0	15	CLUSTER VILLA	\N	\N	PENDING	2026-04-20	\N	2026-10-17	\N	\N	9	615	2026-09-23 21:47:02.976136	\N	\N	1083
3351	1	1	MEP-BTE-CSP-BOH	A	0	0	45	Zone A	\N	1	DONE	\N	\N	\N	\N	\N	9	615	2026-09-08 04:38:29.258059	\N	\N	666
5873	1	9	TĐ BUTLER	I.	2	0	2	0.3	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.193489	\N	\N	1955
5847	1	9	TĐ BEACH ZONE	I.	0	0	14	0.55	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.046862	\N	\N	1929
3528	1	41	MEP-BTE-CSP-BUT		4	0	4	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	0.9	DONE	2026-06-12	2026-06-12	2026-06-13	2026-06-13	2	9	615	2026-09-08 04:38:31.951634	\N	\N	490
3639	1	13	MEP-BTE-CSP-INF		13	0	13	Nghiêm thu công tác đổ bê tông hố ga tuyến D6	\N	1	DONE	2026-02-24	2026-02-27	2026-03-03	2026-05-13	8	9	615	2026-09-08 04:38:34.520464	\N	\N	571
3645	1	13	MEP-BTE-CSP-INF		4	0	4	Kiểm tra thử kín, thử áp hệ thống cấp thoát nước/testing water supply system	\N	0.35	DONE	2026-07-14	2026-07-14	2026-09-16	2026-07-28	65	9	615	2026-09-08 04:38:34.536779	\N	\N	573
4830	1	1	TĐ .BOH	B	12	0	12	Thử kín đường ống nước ngưng tầng T2/Testing sealing water pipe floor2	\N	0	PENDING	2026-04-01	\N	2026-04-01	\N	1	9	615	2026-09-23 21:47:01.588369	\N	YES	913
3417	1	1	MEP-BTE-CSP-BOH	D	0	0	111	Zone D	\N	1	DONE	2026-03-29	2026-03-29	2026-03-29	2026-03-29	\N	9	615	2026-09-08 04:38:29.457809	\N	\N	670
3580	1	42	MEP-BTE-CSP-FIT		1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	0.15	DONE	2026-08-06	2026-06-23	2026-08-07	2026-06-24	2	9	615	2026-09-08 04:38:32.811373	\N	\N	526
3760	1	15	MEP-BTE-CSP-LOB & SPA		4	0	4	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T2/Installing sealing water pipe and heat insulation floor2	\N	0.8	DONE	2026-09-01	2026-09-01	2026-09-05	2026-09-05	5	9	615	2026-09-08 04:38:35.661528	\N	\N	598
3867	1	45	MEP-BTE-CSP-KID		2	0	2	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	0.35	DONE	2026-08-06	2026-06-23	2026-08-06	2026-06-23	1	9	615	2026-09-08 07:55:46.527717	\N	\N	436
4883	1	1	TĐ .BOH	D	21	0	21	Lắp đặt thiết bị điều hòa không khí tầng mái/Installing air conditional equipment rooftop	\N	0	PENDING	2026-07-10	\N	2026-07-12	\N	3	9	615	2026-09-23 21:47:01.892842	\N	YES	966
4864	1	1	TĐ .BOH	D	2	0	2	Thi công lắp đặt ống đồng và bảo ôn tầng T2/Installing copper pipe and heat insulation floor2	\N	0	PENDING	2026-06-23	\N	2026-06-27	\N	5	9	615	2026-09-23 21:47:01.781622	\N	YES	947
3585	1	42	MEP-BTE-CSP-FIT		6	0	6	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	0.15	DONE	2026-08-08	2026-06-25	2026-08-08	2026-06-25	1	9	615	2026-09-08 04:38:32.824582	\N	\N	533
3741	1	14	MEP-BTE-CSP-KID		6	0	6	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	0.35	DONE	2026-08-08	2026-06-25	2026-08-08	2026-06-25	1	9	615	2026-09-08 04:38:35.195721	\N	\N	583
3462	1	3	MEP-BTE-CSP-BPV-1BR		10	0	10	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	1	DONE	2026-08-12	2026-08-12	2026-08-12	2026-08-12	1	9	615	2026-09-08 04:38:29.998514	\N	\N	455
4884	1	1	TĐ .BOH	D	22	0	22	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	0	PENDING	2026-07-05	\N	2026-07-05	\N	1	9	615	2026-09-23 21:47:01.898942	\N	YES	967
4766	1	1	TĐ .BOH	A	0	0	15	BOH	\N	0	PENDING	2026-01-19	\N	2026-07-29	\N	\N	9	615	2026-09-23 21:47:01.206954	\N	\N	849
3597	1	11	MEP-BTE-CSP-HPV-1BR		0	0	13	TỔNG TIẾN ĐỘ THI CÔNG	\N	\N	DONE	2026-05-12	2026-05-12	2026-09-17	2026-09-17	128	9	615	2026-09-08 04:38:33.30071	\N	\N	494
3509	1	6	MEP-BTE-CSP-BUT		1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	0.1	DONE	2026-07-04	2026-07-04	2026-07-05	2026-07-05	2	9	615	2026-09-08 04:38:31.41312	\N	\N	484
3883	1	45	MEP-BTE-CSP-KID		11	0	11	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	0	DONE	2026-10-17	2026-09-23	2026-10-17	2026-09-23	1	9	615	2026-09-08 07:55:46.620127	\N	\N	434
3447	1	3	MEP-BTE-CSP-BPV-1BR		2	0	2	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	1	DONE	2026-05-29	2026-05-29	2026-05-29	2026-05-29	1	9	615	2026-09-08 04:38:29.95492	\N	\N	446
3325	1	1	MEP-BTE-CSP-BOH		4	0	4	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	1	DONE	2026-03-29	2026-03-29	2026-03-29	2026-03-29	1	9	615	2026-09-08 04:38:29.16045	\N	\N	510
3514	1	6	MEP-BTE-CSP-BUT		6	0	6	Lắp đặt thiết bị điều hòa	\N	0	DONE	2026-12-29	2026-12-29	2026-12-29	2026-12-29	1	9	615	2026-09-08 04:38:31.436017	\N	\N	489
3439	1	1	MEP-BTE-CSP-BOH		22	0	22	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	1	DONE	2026-07-05	2026-07-05	2026-07-05	2026-07-05	1	9	615	2026-09-08 04:38:29.51727	\N	\N	452
3357	1	1	MEP-BTE-CSP-BOH		6	0	6	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T2/Installing sealing water pipe and heat insulation floor3	\N	1	DONE	2026-04-06	2026-04-06	2026-04-10	2026-04-10	5	9	615	2026-09-08 04:38:29.279779	\N	\N	509
3604	1	11	MEP-BTE-CSP-HPV-1BR		5	0	5	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	0.2	DONE	2026-06-09	2026-06-09	2026-06-09	2026-06-09	1	9	615	2026-09-08 04:38:33.330663	\N	\N	622
5835	1	9	TĐ BPV- 2BR	I.	0	0	14	0.55	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:48.968928	\N	\N	1917
5864	1	9	TĐ RESIDENTIAL VILLA - 4BR 	I.	2	0	2	0.3	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.145887	\N	\N	1946
5868	1	9	TĐ VN RES	I.	0	0	14	0.55	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.16738	\N	\N	1950
5875	1	9	TĐ BOH	I.	1	0	1	0.25	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.204039	\N	\N	1957
5015	1	8	TĐ .CLUSTER VILLA	II	0	0	31	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	PENDING	2026-07-16	\N	2026-09-16	\N	\N	9	615	2026-09-23 21:47:03.070809	\N	\N	1098
3329	1	1	MEP-BTE-CSP-BOH		23	0	23	Lắp đặt thiết bị điều khiển tầng T2/Installing controling equipment floor2	\N	1	DONE	2026-07-07	2026-07-07	2026-07-07	2026-07-07	1	9	615	2026-09-08 04:38:29.175249	\N	\N	515
3871	1	45	MEP-BTE-CSP-KID		6	0	6	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	0.35	DONE	2026-08-08	2026-06-25	2026-08-08	2026-06-25	1	9	615	2026-09-08 07:55:46.550119	\N	\N	427
4770	1	1	TĐ .BOH	I	3	0	3	Bể STP: Lắp đặt ống slevee upvc	\N	0.9	IN_PROGRESS	2026-02-07	\N	2026-02-26	\N	20	9	615	2026-09-23 21:47:01.234001	\N	YES	853
4805	1	1	TĐ .BOH	A	9	0	9	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	0	PENDING	2026-06-22	\N	2026-06-23	\N	2	9	615	2026-09-23 21:47:01.447855	\N	YES	888
4822	1	1	TĐ .BOH	B	4	0	4	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T2/Installing sealing water pipe and heat insulation floor2	\N	0	PENDING	2026-03-29	\N	2026-03-30	\N	2	9	615	2026-09-23 21:47:01.543873	\N	YES	905
4793	1	1	TĐ .BOH	VI	3	0	3	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	0	PENDING	2026-07-02	\N	2026-07-16	\N	15	9	615	2026-09-23 21:47:01.37835	\N	YES	876
3581	1	42	MEP-BTE-CSP-FIT		2	0	2	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	0.15	DONE	2026-08-06	2026-06-23	2026-08-06	2026-06-23	1	9	615	2026-09-08 04:38:32.814028	\N	\N	529
3680	1	13	MEP-BTE-CSP-INF	V	0	0	54	Hệ thống cấp thoát nước/Water supply and drainage system(D6)	\N	0.95	DONE	2026-02-07	2026-02-07	2026-02-07	2026-02-06	\N	9	615	2026-09-08 04:38:34.632661	\N	\N	695
5879	1	9	TĐ INF	I.	2	0	2	0.3	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.226098	\N	\N	1961
5839	1	9	TĐ HPV-1 BR	I.	1	0	1	0.25	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:48.992472	\N	\N	1921
5842	1	9	TĐ HPV-2BR	I.	1	0	1	0.25	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.016	\N	\N	1924
4778	1	1	TĐ .BOH	III	3	0	3	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	0	PENDING	2026-04-23	\N	2026-05-12	\N	20	9	615	2026-09-23 21:47:01.284854	\N	YES	861
3359	1	1	MEP-BTE-CSP-BOH		8	0	8	Thi công lắp đặt ống luồn dây tiến hiệu và điều khiển tầng T2/Installing signal of conduit and controlling floor2	\N	1	DONE	2026-06-23	2026-06-23	2026-06-27	2026-06-27	5	9	615	2026-09-08 04:38:29.288614	\N	\N	437
3635	1	12	MEP-BTE-CSP-HPV-2BR		8	0	8	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	0	DONE	2026-06-05	2026-06-05	2026-06-05	2026-06-05	1	9	615	2026-09-08 04:38:33.961571	\N	\N	566
3361	1	1	MEP-BTE-CSP-BOH		10	0	10	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	1	DONE	2026-06-23	2026-06-23	2026-06-23	2026-06-23	1	9	615	2026-09-08 04:38:29.2967	\N	\N	621
4831	1	1	TĐ .BOH	B	13	0	13	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	0	PENDING	2026-04-01	\N	2026-04-02	\N	2	9	615	2026-09-23 21:47:01.594208	\N	YES	914
3600	1	11	MEP-BTE-CSP-HPV-1BR		1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	0.2	DONE	2026-06-06	2026-06-06	2026-06-07	2026-06-07	2	9	615	2026-09-08 04:38:33.314288	\N	\N	538
5005	1	8	TĐ .CLUSTER VILLA	I	4	0	4	Kiểm tra thử kín đường ống thoát nước/Testing drainpipe	\N	0	PENDING	2026-09-25	\N	2026-09-27	\N	3	9	615	2026-09-23 21:47:03.012298	\N	YES	1088
3761	1	15	MEP-BTE-CSP-LOB & SPA		5	0	5	Thi công lắp đặt đường ống thông gió và bảo ôn tầng 1/Installing air duct and heat insulation floor 1	\N	1	DONE	2026-07-12	2026-07-12	2026-07-23	2026-07-23	12	9	615	2026-09-08 04:38:35.664426	\N	\N	599
3442	1	1	MEP-BTE-CSP-BOH		25	0	25	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	1	DONE	2026-07-14	2026-07-14	2026-07-14	2026-07-14	1	9	615	2026-09-08 04:38:29.525485	\N	\N	454
3490	1	40	MEP-BTE-CSP-BSC		3	0	3	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	0.15	DONE	2026-05-22	2026-05-22	2026-05-24	2026-05-24	3	9	615	2026-09-08 04:38:31.003472	\N	\N	475
3486	1	40	MEP-BTE-CSP-BSC		0	0	14	Công tác chuẩn bị	\N	1	DONE	2026-05-19	2026-05-19	2026-05-21	2026-05-21	3	9	615	2026-09-08 04:38:30.99133	\N	\N	581
4840	1	1	TĐ .BOH	C	0	0	90	Zone C	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 21:47:01.644491	\N	YES	923
5013	1	8	TĐ .CLUSTER VILLA	II	5	0	5	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	0	PENDING	2026-07-28	\N	2026-07-28	\N	1	9	615	2026-09-23 21:47:03.059294	\N	YES	1096
4845	1	1	TĐ .BOH	C	5	0	5	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	0	PENDING	2026-06-20	\N	2026-06-21	\N	2	9	615	2026-09-23 21:47:01.672799	\N	YES	928
3539	1	41	MEP-BTE-CSP-BUT		7	0	7	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	0.9	DONE	2026-05-10	2026-05-10	2026-05-10	2026-05-10	1	9	615	2026-09-08 04:38:31.983033	\N	\N	502
3369	1	1	MEP-BTE-CSP-BOH		18	0	18	Lắp đặt thiết bị quạt thông gió tầng mái/Installing air duct fan equipment rooftop	\N	1	DONE	2026-07-08	2026-07-08	2026-07-09	2026-07-09	2	9	615	2026-09-08 04:38:29.322617	\N	\N	449
3879	1	45	MEP-BTE-CSP-KID		7	0	7	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	0.35	DONE	2026-08-31	2026-07-18	2026-08-31	2026-07-18	1	9	615	2026-09-08 07:55:46.59411	\N	\N	428
3810	1	17	MEP-BTE-CSP-RES- 3BR		0	0	37	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	0	DONE	2026-08-22	2026-08-22	2026-08-22	2026-08-22	1	9	615	2026-09-08 04:38:36.149695	\N	\N	714
5849	1	9	TĐ BEACH ZONE	I.	2	0	2	0.3	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.059185	\N	\N	1931
3598	1	11	MEP-BTE-CSP-HPV-1BR		0	0	14	Công tác chuẩn bị	\N	1	DONE	2026-05-19	2026-05-19	2026-05-21	2026-05-21	3	9	615	2026-09-08 04:38:33.305337	\N	\N	495
3583	1	42	MEP-BTE-CSP-FIT		4	0	4	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	0.15	DONE	2026-08-06	2026-06-23	2026-08-07	2026-06-24	2	9	615	2026-09-08 04:38:32.819452	\N	\N	531
3835	1	18	MEP-BTE-CSP-RES-4BR		9	0	9	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	0	DONE	2026-08-12	2026-08-12	2026-08-12	2026-08-12	1	9	615	2026-09-08 04:38:36.542265	\N	\N	640
3363	1	1	MEP-BTE-CSP-BOH		12	0	12	Thử áp đường ống đồng tầng T3/Testing pressure copper pipe floor2	\N	1	DONE	2026-07-05	2026-07-05	2026-07-05	2026-07-05	1	9	615	2026-09-08 04:38:29.30349	\N	\N	440
3483	1	4	MEP-BTE-CSP-BPV-2BR		10	0	10	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	1	DONE	2026-08-12	2026-08-12	2026-08-12	2026-08-12	1	9	615	2026-09-08 04:38:30.43854	\N	\N	471
5854	1	9	TĐ FITNES	I.	1	0	1	0.25	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.087684	\N	\N	1936
3627	1	12	MEP-BTE-CSP-HPV-2BR	II	0	0	22	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	DONE	2026-06-01	2026-06-01	2026-08-22	2026-08-22	\N	9	615	2026-09-08 04:38:33.939628	\N	\N	688
4799	1	1	TĐ .BOH	A	3	0	3	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	0	PENDING	2026-03-29	\N	2026-03-29	\N	1	9	615	2026-09-23 21:47:01.413091	\N	YES	882
4816	1	1	TĐ .BOH	A	20	0	20	Lắp đặt cửa gió tầng T2/Installing air diffuser floor2	\N	0	PENDING	2026-06-30	\N	2026-06-30	\N	1	9	615	2026-09-23 21:47:01.509725	\N	YES	899
5878	1	9	TĐ INF	I.	1	0	1	0.25	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.220573	\N	\N	1960
4875	1	1	TĐ .BOH	D	13	0	13	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	0	PENDING	2026-03-31	\N	2026-03-31	\N	1	9	615	2026-09-23 21:47:01.847937	\N	YES	958
4885	1	1	TĐ .BOH	D	23	0	23	Lắp đặt thiết bị điều khiển tầng T2/Installing controling equipment floor2	\N	0	PENDING	2026-07-07	\N	2026-07-07	\N	1	9	615	2026-09-23 21:47:01.904689	\N	YES	968
4788	1	1	TĐ .BOH	V	3	0	3	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	0	PENDING	2026-06-27	\N	2026-07-11	\N	15	9	615	2026-09-23 21:47:01.346115	\N	YES	871
3789	1	17	MEP-BTE-CSP-RES- 3BR		1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	0	DONE	2026-08-09	2026-08-09	2026-08-10	2026-08-10	2	9	615	2026-09-08 04:38:36.100421	\N	\N	625
3621	1	12	MEP-BTE-CSP-HPV-2BR		1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	0.35	DONE	2026-06-06	2026-06-06	2026-06-07	2026-06-07	2	9	615	2026-09-08 04:38:33.921562	\N	\N	548
3513	1	6	MEP-BTE-CSP-BUT		5	0	5	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	0	DONE	2026-10-04	2026-10-04	2026-10-04	2026-10-04	1	9	615	2026-09-08 04:38:31.430641	\N	\N	488
3578	1	42	MEP-BTE-CSP-FIT		0	0	14	Công tác chuẩn bị	\N	1	DONE	2026-05-19	2026-05-19	2026-05-21	2026-05-21	3	9	615	2026-09-08 04:38:32.805855	\N	\N	493
3644	1	13	MEP-BTE-CSP-INF		3	0	3	Thi công hệ thống valve, vòi, trụ/ Valve system, ejector, pillar installation	\N	0.35	DONE	2026-07-03	2026-07-03	2026-09-10	2026-09-10	70	9	615	2026-09-08 04:38:34.534207	\N	\N	572
3850	1	19	MEP-BTE-CSP-VNR	I	0	0	15	Hệ thống cấp thoát nước/Water supply and drainage system	\N	0.2	DONE	2026-01-29	2026-01-29	2026-08-04	2026-08-04	\N	9	615	2026-09-08 04:38:36.92925	\N	\N	828
5067	1	10	TĐ HPV 2- BR	A	0	0	15	HPV-2BR	\N	\N	PENDING	2026-03-26	\N	2026-09-02	\N	\N	9	615	2026-09-23 21:47:03.567978	\N	\N	1150
3586	1	42	MEP-BTE-CSP-FIT	II	0	0	22	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	DONE	2026-07-06	2026-05-22	2026-10-17	2026-09-23	\N	9	615	2026-09-08 04:38:32.828161	\N	\N	683
3646	1	13	MEP-BTE-CSP-INF		5	0	5	Thi công hệ thống bơm (nước cấp, nước thoát, bù áp)/ Pump system installtion (water supply, drainage, pump pressure)	\N	0.35	DONE	2026-08-10	2026-08-10	2026-10-08	2026-10-08	60	9	615	2026-09-08 04:38:34.539083	\N	\N	570
4963	1	6	TĐ . BULTER	II	8	0	8	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	0	PENDING	2026-07-29	\N	2026-07-29	\N	1	9	615	2026-09-23 21:47:02.617619	\N	YES	1046
3599	1	11	MEP-BTE-CSP-HPV-1BR	I	0	0	15	Hệ thống cấp thoát nước/Water supply and drainage system(1-13)	\N	\N	DONE	2026-05-12	2026-05-12	2026-09-17	2026-09-17	\N	9	615	2026-09-08 04:38:33.309651	\N	\N	684
3870	1	45	MEP-BTE-CSP-KID		5	0	5	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	0.35	DONE	2026-08-09	2026-06-26	2026-08-09	2026-06-26	1	9	615	2026-09-08 07:55:46.544899	\N	\N	426
3755	1	15	MEP-BTE-CSP-LOB & SPA		14	0	14	Lắp đặt thiết bị quạt thông gió tầng T2/Installing air duct fan equipment floor1	\N	0	DONE	2026-08-26	2026-08-26	2026-08-27	2026-08-27	2	9	615	2026-09-08 04:38:35.647147	\N	\N	611
3837	1	18	MEP-BTE-CSP-RES-4BR		11	0	11	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	0	DONE	2026-08-12	2026-08-12	2026-08-12	2026-08-12	1	9	615	2026-09-08 04:38:36.547669	\N	\N	642
5851	1	9	TĐ KID CLUB	I.	1	0	1	0.25	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.07105	\N	\N	1933
3448	1	3	MEP-BTE-CSP-BPV-1BR		3	0	3	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	1	DONE	2026-06-17	2026-06-17	2026-06-18	2026-06-18	2	9	615	2026-09-08 04:38:29.958345	\N	\N	447
3734	1	14	MEP-BTE-CSP-KID		0	0	14	Công tác chuẩn bị	\N	1	DONE	2026-05-19	2026-05-19	2026-05-21	2026-05-21	3	9	615	2026-09-08 04:38:35.169539	\N	\N	663
5863	1	9	TĐ RESIDENTIAL VILLA - 4BR 	I.	1	0	1	0.25	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.140038	\N	\N	1945
3470	1	4	MEP-BTE-CSP-BPV-2BR		4	0	4	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	1	DONE	2026-06-01	2026-06-01	2026-06-02	2026-06-02	2	9	615	2026-09-08 04:38:30.398813	\N	\N	459
3617	1	11	MEP-BTE-CSP-HPV-1BR		11	0	11	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	0	DONE	2026-08-22	2026-08-22	2026-08-22	2026-08-22	1	9	615	2026-09-08 04:38:33.380353	\N	\N	547
3816	1	17	MEP-BTE-CSP-RES- 3BR		9	0	9	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	0	DONE	2026-10-06	2026-10-06	2026-10-06	2026-10-06	1	9	615	2026-09-08 04:38:36.163929	\N	\N	632
4806	1	1	TĐ .BOH	A	10	0	10	Thử áp đường ống đồng tầng T2/Testing pressure copper pipe floor2	\N	0	PENDING	2026-06-26	\N	2026-06-27	\N	2	9	615	2026-09-23 21:47:01.453147	\N	YES	889
3626	1	12	MEP-BTE-CSP-HPV-2BR		6	0	6	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	0	DONE	2026-06-11	2026-06-11	2026-06-11	2026-06-11	1	9	615	2026-09-08 04:38:33.937055	\N	\N	564
4952	1	6	TĐ . BULTER	I	4	0	4	Kiểm tra thử kín đường ống thoát nước/Testing drainpipe	\N	0	PENDING	2026-05-18	\N	2026-05-20	\N	3	9	615	2026-09-23 21:47:02.557433	\N	YES	1035
3809	1	17	MEP-BTE-CSP-RES- 3BR		0	0	36	Lắp đặt thiết bị quạt thông gió tầng T2/Installing air duct fan equipment floor2	\N	0	DONE	2026-08-25	2026-08-25	2026-08-25	2026-08-25	1	9	615	2026-09-08 04:38:36.147243	\N	\N	713
4813	1	1	TĐ .BOH	A	17	0	17	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	0	PENDING	2026-06-30	\N	2026-06-30	\N	1	9	615	2026-09-23 21:47:01.491677	\N	YES	896
3811	1	17	MEP-BTE-CSP-RES- 3BR		0	0	38	Lắp đặt thiết bị điều hòa không khí tầng T2/Installing air conditional equipment floor2	\N	0	DONE	2026-08-24	2026-08-24	2026-08-24	2026-08-24	1	9	615	2026-09-08 04:38:36.152109	\N	\N	841
4810	1	1	TĐ .BOH	A	14	0	14	Lắp đặt thiết bị quạt thông gió tầng T2/Installing air duct fan equipment floor2	\N	0	PENDING	2026-06-27	\N	2026-06-28	\N	2	9	615	2026-09-23 21:47:01.474994	\N	YES	893
3753	1	14	MEP-BTE-CSP-KID		11	0	11	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	0	DONE	2026-10-17	2026-09-23	2026-10-17	2026-09-23	1	9	615	2026-09-08 04:38:35.237557	\N	\N	595
4818	1	1	TĐ .BOH	B	0	0	68	Zone B	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 21:47:01.521053	\N	YES	901
5860	1	9	TĐ RESIDENTIAL VILLA - 3BR	I.	1	0	1	0.25	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.123274	\N	\N	1942
3320	1	1	MEP-BTE-CSP-BOH		14	0	14	Thử kín đường ống nước ngưng tầng T2/Testing sealing water pipe floor2	\N	1	DONE	2026-04-06	2026-04-06	2026-04-06	2026-04-06	1	9	615	2026-09-08 04:38:29.143713	\N	\N	508
3606	1	11	MEP-BTE-CSP-HPV-1BR	II	0	0	22	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	DONE	2026-06-01	2026-06-01	2026-08-22	2026-08-22	\N	9	615	2026-09-08 04:38:33.339294	\N	\N	685
5869	1	9	TĐ VN RES	I.	1	0	1	0.25	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.172375	\N	\N	1951
4772	1	1	TĐ .BOH	I	5	0	5	Lắp đặt bơm nước mưa/Rain water pumper installation	\N	0	PENDING	2026-06-28	\N	2026-07-12	\N	15	9	615	2026-09-23 21:47:01.246592	\N	YES	855
4959	1	6	TĐ . BULTER	II	4	0	4	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	0	PENDING	2026-07-04	\N	2026-07-05	\N	2	9	615	2026-09-23 21:47:02.596397	\N	YES	1042
3788	1	17	MEP-BTE-CSP-RES- 3BR	I	0	0	15	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	DONE	2026-06-18	2026-06-18	2026-10-21	2026-10-21	\N	9	615	2026-09-08 04:38:36.09739	\N	\N	700
5014	1	8	TĐ .CLUSTER VILLA	II	6	0	6	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	0	PENDING	2026-07-21	\N	2026-07-21	\N	1	9	615	2026-09-23 21:47:03.06442	\N	YES	1097
5012	1	8	TĐ .CLUSTER VILLA	II	4	0	4	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	0	PENDING	2026-07-26	\N	2026-07-26	\N	1	9	615	2026-09-23 21:47:03.053516	\N	YES	1095
3564	1	8	MEP-BTE-CSP-CLU		6	0	6	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	1	DONE	2026-07-21	2026-07-21	2026-07-21	2026-07-21	1	9	615	2026-09-08 04:38:32.42132	\N	\N	496
3472	1	4	MEP-BTE-CSP-BPV-2BR		6	0	6	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	1	DONE	2026-05-31	2026-05-31	2026-05-31	2026-05-31	1	9	615	2026-09-08 04:38:30.404451	\N	\N	467
3573	1	8	MEP-BTE-CSP-CLU		8	0	8	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	1	DONE	2026-07-30	2026-07-30	2026-07-30	2026-07-30	1	9	615	2026-09-08 04:38:32.444224	\N	\N	522
3522	1	41	MEP-BTE-CSP-BUT		0	0	13	TỔNG TIẾN ĐỘ THI CÔNG	\N	\N	DONE	2026-02-14	2026-02-14	2026-10-12	2026-10-12	240	9	615	2026-09-08 04:38:31.930496	\N	\N	463
5116	1	13	TĐ INF	V	4	0	4	Kiểm tra hệ thống cấp  nước/testing water supply system	\N	0	PENDING	2026-06-28	\N	2026-09-05	\N	70	9	615	2026-09-23 21:47:03.960285	\N	YES	1199
3647	1	13	MEP-BTE-CSP-INF		6	0	6	Gia công lắp đặt nghiệm thu cốt thép hố ga tuyến D7	\N	0.6	IN_PROGRESS	2026-02-17	2026-03-09	2026-02-21	\N	5	9	615	2026-09-08 04:38:34.542271	\N	\N	424
5078	1	10	TĐ HPV 2- BR	II	3	0	3	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	0	PENDING	2026-06-01	\N	2026-06-03	\N	3	9	615	2026-09-23 21:47:03.633328	\N	YES	1161
5002	1	8	TĐ .CLUSTER VILLA	I	1	0	1	Thi công lắp đặt đường ống cấp nước /Installing water pipe	\N	0	PENDING	2026-07-01	\N	2026-07-15	\N	15	9	615	2026-09-23 21:47:02.992047	\N	YES	1085
5004	1	8	TĐ .CLUSTER VILLA	I	3	0	3	Kiểm tra thử áp đường ống cấp nước/ Testing pressure of drainpipe	\N	0	PENDING	2026-09-25	\N	2026-09-27	\N	3	9	615	2026-09-23 21:47:03.006178	\N	YES	1087
5003	1	8	TĐ .CLUSTER VILLA	I	2	0	2	Thi công lắp đặt đường ống thoát nước/Installing drainpipe	\N	0	PENDING	2026-04-20	\N	2026-04-24	\N	5	9	615	2026-09-23 21:47:02.999396	\N	YES	1086
5024	1	8	TĐ .CLUSTER VILLA	II	9	0	9	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	0	PENDING	2026-07-31	\N	2026-07-31	\N	1	9	615	2026-09-23 21:47:03.122267	\N	YES	1107
5025	1	8	TĐ .CLUSTER VILLA	II	10	0	10	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	0	PENDING	2026-09-14	\N	2026-09-14	\N	1	9	615	2026-09-23 21:47:03.128055	\N	YES	1108
3779	1	15	MEP-BTE-CSP-LOB & SPA		16	0	16	Lắp đặt thiết bị điều hòa không khí tầng 1/Installing air conditional equipment floor 1	\N	1	DONE	2026-08-23	2026-08-23	2026-08-29	2026-08-29	7	9	615	2026-09-08 04:38:35.707738	\N	\N	612
5081	1	10	TĐ HPV 2- BR	II	6	0	6	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	0	PENDING	2026-06-11	\N	2026-06-11	\N	1	9	615	2026-09-23 21:47:03.651134	\N	YES	1164
5082	1	10	TĐ HPV 2- BR	II	7	0	7	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	0	PENDING	2026-06-05	\N	2026-06-05	\N	1	9	615	2026-09-23 21:47:03.657045	\N	YES	1165
5077	1	10	TĐ HPV 2- BR	II	2	0	2	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	0	PENDING	2026-06-09	\N	2026-06-09	\N	1	9	615	2026-09-23 21:47:03.627645	\N	YES	1160
5086	1	10	TĐ HPV 2- BR	II	11	0	11	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	0	PENDING	2026-08-22	\N	2026-08-22	\N	1	9	615	2026-09-23 21:47:03.679752	\N	YES	1169
5083	1	10	TĐ HPV 2- BR	II	8	0	8	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	0	PENDING	2026-06-05	\N	2026-06-05	\N	1	9	615	2026-09-23 21:47:03.662832	\N	YES	1166
5218	1	17	TĐ RES- 3BR	I	0	0	17	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	PENDING	2026-06-18	\N	2026-10-21	\N	\N	9	615	2026-09-23 21:47:04.798556	\N	\N	1301
5220	1	17	TĐ RES- 3BR	I	2	0	2	Thi công lắp đặt đường ống thoát nước/Installing drainpipe	\N	0	PENDING	2026-06-18	\N	2026-06-22	\N	5	9	615	2026-09-23 21:47:04.809825	\N	YES	1303
3651	1	13	MEP-BTE-CSP-INF		10	0	10	Nghiêệm thu lắp đặt hố ga tuyến D7	\N	0	PENDING	\N	2026-06-13	\N	\N	8	9	615	2026-09-08 04:38:34.552918	\N	\N	589
5852	1	9	TĐ KID CLUB	I.	2	0	2	0.3	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.07645	\N	\N	1934
3485	1	40	MEP-BTE-CSP-BSC		0	0	13	TỔNG TIẾN ĐỘ THI CÔNG	\N	\N	DONE	2026-05-12	2026-05-12	2026-09-26	2026-09-26	137	9	615	2026-09-08 04:38:30.988429	\N	\N	528
3530	1	41	MEP-BTE-CSP-BUT		6	0	6	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	0.9	DONE	2026-06-14	2026-06-14	2026-06-14	2026-06-14	1	9	615	2026-09-08 04:38:31.958841	\N	\N	501
3845	1	18	MEP-BTE-CSP-RES-4BR		19	0	19	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	0	DONE	2026-10-04	2026-10-04	2026-10-04	2026-10-04	1	9	615	2026-09-08 04:38:36.567987	\N	\N	650
3507	1	6	MEP-BTE-CSP-BUT		0	0	14	Công tác chuẩn bị	\N	1	DONE	2026-05-19	2026-05-19	2026-05-21	2026-05-21	3	9	615	2026-09-08 04:38:31.40282	\N	\N	462
5235	1	17	TĐ RES- 3BR		0	0	34	Thử áp đường ống đồng tầng T2/Testing pressure copper pipe floor2	\N	0	PENDING	2026-08-14	\N	2026-08-14	\N	1	9	615	2026-09-23 21:47:04.90519	\N	YES	1318
5238	1	17	TĐ RES- 3BR		0	0	37	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	0	PENDING	2026-08-23	\N	2026-08-23	\N	1	9	615	2026-09-23 21:47:04.922668	\N	YES	1321
5242	1	17	TĐ RES- 3BR		0	0	41	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	0	PENDING	2026-08-26	\N	2026-08-26	\N	1	9	615	2026-09-23 21:47:04.943932	\N	YES	1325
5229	1	17	TĐ RES- 3BR	II	4	0	4	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T2/Installing sealing water pipe and heat insulation floor2	\N	0	PENDING	2026-08-12	\N	2026-08-12	\N	1	9	615	2026-09-23 21:47:04.87083	\N	YES	1312
5226	1	17	TĐ RES- 3BR	II	1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	0	PENDING	2026-08-09	\N	2026-08-10	\N	2	9	615	2026-09-23 21:47:04.854938	\N	YES	1309
3649	1	13	MEP-BTE-CSP-INF		8	0	8	Đổ bê tông hố ga tuyến D7	\N	0.6	IN_PROGRESS	2026-02-19	2026-03-11	2026-02-26	\N	8	9	615	2026-09-08 04:38:34.547789	\N	\N	587
4897	1	3	TĐ BPV 1- BR	II	1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	PENDING	2026-05-29	\N	2026-05-30	\N	2	9	615	2026-09-23 21:47:02.050805	\N	YES	980
4901	1	3	TĐ BPV 1- BR	II	5	0	5	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	\N	PENDING	2026-06-01	\N	2026-06-01	\N	1	9	615	2026-09-23 21:47:02.07303	\N	YES	984
4902	1	3	TĐ BPV 1- BR	II	6	0	6	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	\N	PENDING	2026-05-31	\N	2026-05-31	\N	1	9	615	2026-09-23 21:47:02.078051	\N	YES	985
5219	1	17	TĐ RES- 3BR	I	1	0	1	Thi công lắp đặt đường ống cấp nước /Installing water pipe	\N	0	PENDING	2026-08-09	\N	2026-08-18	\N	10	9	615	2026-09-23 21:47:04.804606	\N	YES	1302
5217	1	17	TĐ RES- 3BR	A	0	0	15	RES- 3 BR	\N	\N	PENDING	2026-06-18	\N	2026-10-21	\N	\N	9	615	2026-09-23 21:47:04.792975	\N	\N	1300
5233	1	17	TĐ RES- 3BR		0	0	32	Thi công lắp đặt ống luồn dây tiến hiệu và điều khiển tầng T2/Installing signal of conduit and controlling floor2	\N	0	PENDING	2026-08-12	\N	2026-08-12	\N	1	9	615	2026-09-23 21:47:04.893028	\N	YES	1316
5241	1	17	TĐ RES- 3BR		0	0	40	Lắp đặt thiết bị điều hòa không khí tầng T2/Installing air conditional equipment floor2	\N	0	PENDING	2026-08-24	\N	2026-08-24	\N	1	9	615	2026-09-23 21:47:04.938721	\N	YES	1324
5225	1	17	TĐ RES- 3BR	II	0	0	24	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	PENDING	2026-07-15	\N	2026-10-06	\N	\N	9	615	2026-09-23 21:47:04.84965	\N	\N	1308
5240	1	17	TĐ RES- 3BR		0	0	39	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	0	PENDING	2026-08-22	\N	2026-08-22	\N	1	9	615	2026-09-23 21:47:04.932861	\N	YES	1323
5221	1	17	TĐ RES- 3BR	I	3	0	3	Kiểm tra thử áp đường ống cấp nước/ Testing pressure of drainpipe	\N	0	PENDING	2026-08-19	\N	2026-08-21	\N	3	9	615	2026-09-23 21:47:04.814817	\N	YES	1304
5245	1	17	TĐ RES- 3BR		8	0	8	Lắp đặt cửa gió tầng T2/Installing air diffuser floor2	\N	0	PENDING	2026-10-04	\N	2026-10-04	\N	1	9	615	2026-09-23 21:47:04.959323	\N	YES	1328
4865	1	1	TĐ .BOH	D	3	0	3	Thi công lắp đặt ống đồng và bảo ôn tầng mái/Installing copper pipe and heat insulation floor3	\N	0	PENDING	2026-06-29	\N	2026-07-03	\N	5	9	615	2026-09-23 21:47:01.787205	\N	YES	948
5272	1	18	TĐ RES- 4BR	II	17	0	17	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	0	PENDING	2026-08-26	\N	2026-08-26	\N	1	9	615	2026-09-23 21:47:05.167671	\N	YES	1355
5271	1	18	TĐ RES- 4BR	II	16	0	16	Lắp đặt thiết bị điều hòa không khí tầng T2/Installing air conditional equipment floor2	\N	0	PENDING	2026-08-24	\N	2026-08-24	\N	1	9	615	2026-09-23 21:47:05.161054	\N	YES	1354
5248	1	18	TĐ RES- 4BR	I	0	0	17	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	PENDING	2026-06-18	\N	2026-10-21	\N	\N	9	615	2026-09-23 21:47:05.036985	\N	\N	1331
5268	1	18	TĐ RES- 4BR	II	13	0	13	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	0	PENDING	2026-08-23	\N	2026-08-23	\N	1	9	615	2026-09-23 21:47:05.145288	\N	YES	1351
5274	1	18	TĐ RES- 4BR	II	19	0	19	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	0	PENDING	2026-10-04	\N	2026-10-04	\N	1	9	615	2026-09-23 21:47:05.183682	\N	YES	1357
5256	1	18	TĐ RES- 4BR	II	1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	0	PENDING	2026-08-09	\N	2026-08-10	\N	2	9	615	2026-09-23 21:47:05.07981	\N	YES	1339
4890	1	3	TĐ BPV 1- BR	I	1	0	1	Thi công lắp đặt đường ống cấp nước /Installing water pipe	\N	\N	PENDING	2026-06-16	\N	2026-07-05	\N	20	9	615	2026-09-23 21:47:02.011086	\N	YES	973
5129	1	13	TĐ INF	VI	3	0	3	Thi công hệ thống valve, vòi, trụ/ Valve system, ejector, pillar installation	\N	0	PENDING	2026-06-17	\N	2026-09-04	\N	80	9	615	2026-09-23 21:47:04.03049	\N	YES	1212
5148	1	13	TĐ INF	VIII	0	0	78	Hệ thống cấp thoát nước/Water supply and drainage system(D2)	\N	0	PENDING	2026-02-12	\N	2026-02-12	\N	\N	9	615	2026-09-23 21:47:04.138307	\N	YES	1231
5088	1	13	TĐ INF	I	0	0	17	Hệ thống cấp thoát nước/Water supply and drainage system (D5)	\N	\N	PENDING	2026-02-07	\N	2026-11-02	\N	\N	9	615	2026-09-23 21:47:03.795017	\N	\N	1171
5102	1	13	TĐ INF	III	2	0	2	Thi công hệ thống ống âm đất (cấp nước, thoát nước, thoát nước thải)Underground pipe system execution(water supply, drainage, sewage)	\N	0	PENDING	2026-03-03	\N	2026-07-25	\N	145	9	615	2026-09-23 21:47:03.880024	\N	YES	1185
5097	1	13	TĐ INF	II	3	0	3	Thi công hệ thống valve, vòi, trụ/ Valve system, ejector, pillar installation	\N	0	PENDING	2026-05-28	\N	2026-07-31	\N	65	9	615	2026-09-23 21:47:03.847378	\N	YES	1180
5145	1	13	TĐ INF	VIII	3	0	3	Thi công hệ thống valve, vòi, trụ/ Valve system, ejector, pillar installation	\N	0	PENDING	2026-05-23	\N	2026-07-26	\N	65	9	615	2026-09-23 21:47:04.120791	\N	YES	1228
5112	1	13	TĐ INF	V	0	0	41	Hệ thống cấp thoát nước/Water supply and drainage system(D6)	\N	0	PENDING	2026-02-07	\N	2026-02-07	\N	\N	9	615	2026-09-23 21:47:03.938097	\N	YES	1195
5139	1	13	TĐ INF	VII	3	0	3	Thi công hệ thống valve, vòi, trụ/ Valve system, ejector, pillar installation	\N	0	PENDING	2026-05-23	\N	2026-07-16	\N	55	9	615	2026-09-23 21:47:04.087083	\N	YES	1222
5100	1	13	TĐ INF	III	0	0	29	Hệ thống cấp thoát nước/Water supply and drainage system(D1)	\N	0	PENDING	2026-02-21	\N	2026-02-21	\N	\N	9	615	2026-09-23 21:47:03.86616	\N	YES	1183
5146	1	13	TĐ INF	VIII	4	0	4	Kiểm tra hệ thống cấp thoát nước/testing water supply system	\N	0	PENDING	2026-05-28	\N	2026-07-26	\N	60	9	615	2026-09-23 21:47:04.127204	\N	YES	1229
5107	1	13	TĐ INF	IV	1	0	1	Thi công đào, lấp đất/Excavation, backfill	\N	0	PENDING	2026-02-11	\N	2026-03-17	\N	35	9	615	2026-09-23 21:47:03.907811	\N	YES	1190
5147	1	13	TĐ INF	VIII	5	0	5	Thi công hệ thống bơm (nước cấp, nước thoát, bù áp)/ Pump system installtion (water supply, drainage, pump pressure)	\N	0	PENDING	2026-07-09	\N	2026-09-11	\N	65	9	615	2026-09-23 21:47:04.132381	\N	YES	1230
5114	1	13	TĐ INF	V	2	0	2	Thi công hệ thống ống âm đất (cấp nước,)Underground pipe system execution(water supply)	\N	0.2	IN_PROGRESS	2026-03-04	\N	2026-06-26	\N	115	9	615	2026-09-23 21:47:03.949388	\N	YES	1197
5089	1	13	TĐ INF	I	1	0	1	Thi công đào, lấp đất/Excavation, backfill	\N	0	PENDING	2026-02-07	\N	2026-04-17	\N	70	9	615	2026-09-23 21:47:03.80169	\N	YES	1172
5138	1	13	TĐ INF	VII	2	0	2	Thi công hệ thống ống âm đất (cấp nước, thoát nước, thoát nước thải)Underground pipe system execution(water supply, drainage, sewage)	\N	0	PENDING	2026-03-19	\N	2026-05-17	\N	60	9	615	2026-09-23 21:47:04.081729	\N	YES	1221
5113	1	13	TĐ INF	V	1	0	1	Thi công đào, lấp đất/Excavation, backfill ( Cấp nước d 110)	\N	0.2	IN_PROGRESS	2026-02-07	\N	2026-03-23	\N	45	9	615	2026-09-23 21:47:03.944272	\N	YES	1196
5128	1	13	TĐ INF	VI	2	0	2	Thi công hệ thống ống âm đất (cấp nước,)Underground pipe system execution(water supply)	\N	0.6	IN_PROGRESS	2026-03-04	\N	2026-06-26	\N	115	9	615	2026-09-23 21:47:04.024138	\N	YES	1211
5166	1	14	TĐ . KID CLUB	A	0	0	15	KID CLUB	\N	\N	PENDING	2026-06-01	\N	2026-10-21	\N	\N	9	615	2026-09-23 21:47:04.308557	\N	\N	1249
5169	1	14	TĐ . KID CLUB	I	2	0	2	Thi công lắp đặt đường ống thoát nước/Installing drainpipe	\N	0	PENDING	2026-06-01	\N	2026-06-05	\N	5	9	615	2026-09-23 21:47:04.331954	\N	YES	1252
5173	1	14	TĐ . KID CLUB	I	6	0	6	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	0	PENDING	2026-10-19	\N	2026-10-21	\N	3	9	615	2026-09-23 21:47:04.358293	\N	YES	1256
5180	1	14	TĐ . KID CLUB	II	6	0	6	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	0	PENDING	2026-08-08	\N	2026-08-08	\N	1	9	615	2026-09-23 21:47:04.404383	\N	YES	1263
5181	1	14	TĐ . KID CLUB	II	7	0	7	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	0	PENDING	2026-08-31	\N	2026-08-31	\N	1	9	615	2026-09-23 21:47:04.412104	\N	YES	1264
5172	1	14	TĐ . KID CLUB	I	5	0	5	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	0	PENDING	2026-10-15	\N	2026-10-21	\N	7	9	615	2026-09-23 21:47:04.351428	\N	YES	1255
5029	1	9	TĐ .FITNESS	I	1	0	1	Thi công lắp đặt đường ống cấp nước /Installing water pipe	\N	0	PENDING	2026-07-04	\N	2026-07-13	\N	10	9	615	2026-09-23 21:47:03.213016	\N	YES	1112
5031	1	9	TĐ .FITNESS	I	3	0	3	Kiểm tra thử áp đường ống cấp nước/ Testing pressure of drainpipe	\N	0	PENDING	2026-07-14	\N	2026-07-16	\N	3	9	615	2026-09-23 21:47:03.226802	\N	YES	1114
5038	1	9	TĐ .FITNESS	II	3	0	3	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	0	PENDING	2026-07-06	\N	2026-07-08	\N	3	9	615	2026-09-23 21:47:03.270695	\N	YES	1121
5045	1	9	TĐ .FITNESS	II	10	0	10	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	0	PENDING	2026-10-15	\N	2026-10-15	\N	1	9	615	2026-09-23 21:47:03.316493	\N	YES	1128
5032	1	9	TĐ .FITNESS	I	4	0	4	Kiểm tra thử kín đường ống thoát nước/Testing drainpipe	\N	0	PENDING	2026-05-14	\N	2026-05-16	\N	3	9	615	2026-09-23 21:47:03.23264	\N	YES	1115
5035	1	9	TĐ .FITNESS	II	0	0	24	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	PENDING	2026-07-06	\N	2026-10-17	\N	\N	9	615	2026-09-23 21:47:03.251702	\N	\N	1118
5037	1	9	TĐ .FITNESS	II	2	0	2	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	0	PENDING	2026-08-06	\N	2026-08-06	\N	1	9	615	2026-09-23 21:47:03.264295	\N	YES	1120
3560	1	8	MEP-BTE-CSP-CLU		2	0	2	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	1	DONE	2026-07-19	2026-07-19	2026-07-19	2026-07-19	1	9	615	2026-09-08 04:38:32.407057	\N	\N	517
3754	1	15	MEP-BTE-CSP-LOB & SPA		13	0	13	Lắp đặt thiết bị quạt thông gió tầng 1/Installing air duct fan equipment floor 1	\N	1	DONE	2026-08-23	2026-08-23	2026-08-24	2026-08-24	2	9	615	2026-09-08 04:38:35.644145	\N	\N	601
3481	1	4	MEP-BTE-CSP-BPV-2BR		8	0	8	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	1	DONE	2026-06-01	2026-06-01	2026-06-01	2026-06-01	1	9	615	2026-09-08 04:38:30.432895	\N	\N	469
5084	1	10	TĐ HPV 2- BR	II	9	0	9	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	0	PENDING	2026-06-05	\N	2026-06-05	\N	1	9	615	2026-09-23 21:47:03.668284	\N	YES	1167
3711	1	13	MEP-BTE-CSP-INF	VIII	0	0	85	Hệ thống cấp thoát nước/Water supply and drainage system(D2)	\N	0.95	DONE	2026-02-07	2026-02-07	2026-02-07	2026-02-06	\N	9	615	2026-09-08 04:38:34.716396	\N	\N	692
4850	1	1	TĐ .BOH	C	10	0	10	Thử áp đường ống đồng tầng T2/Testing pressure copper pipe floor2	\N	0	PENDING	2026-06-26	\N	2026-06-26	\N	1	9	615	2026-09-23 21:47:01.700501	\N	YES	933
4851	1	1	TĐ .BOH	C	11	0	11	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	0	PENDING	2026-04-01	\N	2026-04-01	\N	1	9	615	2026-09-23 21:47:01.706566	\N	YES	934
3772	1	15	MEP-BTE-CSP-LOB & SPA		9	0	9	Thử áp đường ống đồng tầng 1 /Testing pressure copper pipe floor 1	\N	1	DONE	2026-09-02	2026-09-02	2026-09-02	2026-09-02	1	9	615	2026-09-08 04:38:35.691972	\N	\N	608
3758	1	15	MEP-BTE-CSP-LOB & SPA		2	0	2	Thi công lắp đặt ống đồng và bảo ôn tầng T2/Installing copper pipe and heat insulation floor2	\N	0.8	DONE	2026-09-02	2026-10-09	2026-09-07	2026-11-27	6	9	615	2026-09-08 04:38:35.655152	\N	\N	597
5209	1	15	TĐ .LOB-SPA	II	15	0	15	Lắp đặt nón che mua tầng mái/Installing air hat roof floor	\N	0	PENDING	2026-08-29	\N	2026-08-30	\N	2	9	615	2026-09-23 21:47:04.677927	\N	YES	1292
5195	1	15	TĐ .LOB-SPA	II	1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng 1 /Installing copper pipe and heat insulation floor 1	\N	0	PENDING	2026-08-23	\N	2026-08-31	\N	9	9	615	2026-09-23 21:47:04.591915	\N	YES	1278
5213	1	15	TĐ .LOB-SPA	II	19	0	19	Lắp đặt thiết bị điều khiển tầng 2 /Installing controling equipment floor1	\N	0	PENDING	2026-08-31	\N	2026-08-31	\N	1	9	615	2026-09-23 21:47:04.703224	\N	YES	1296
5187	1	15	TĐ .LOB-SPA	I	0	0	17	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	PENDING	2026-04-18	\N	2026-10-24	\N	\N	9	615	2026-09-23 21:47:04.542002	\N	\N	1270
5188	1	15	TĐ .LOB-SPA	I	1	0	1	Thi công lắp đặt đường ống cấp nước /Installing water pipe	\N	0	PENDING	2026-08-23	\N	2026-09-01	\N	10	9	615	2026-09-23 21:47:04.548907	\N	YES	1271
4997	1	7	TĐ .BZONE	B	9	0	9	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	0	PENDING	2026-06-17	\N	2026-06-17	\N	1	9	615	2026-09-23 21:47:02.880714	\N	YES	1080
4984	1	7	TĐ .BZONE	A	8	0	8	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	0	PENDING	2026-06-15	\N	2026-06-15	\N	1	9	615	2026-09-23 21:47:02.798205	\N	YES	1067
4982	1	7	TĐ .BZONE	A	6	0	6	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	0	PENDING	2026-06-14	\N	2026-06-14	\N	1	9	615	2026-09-23 21:47:02.78718	\N	YES	1065
4823	1	1	TĐ .BOH	B	5	0	5	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	0	PENDING	2026-06-20	\N	2026-06-21	\N	2	9	615	2026-09-23 21:47:01.549772	\N	YES	906
5075	1	10	TĐ HPV 2- BR	II	0	0	24	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	PENDING	2026-06-01	\N	2026-08-22	\N	\N	9	615	2026-09-23 21:47:03.615232	\N	\N	1158
4780	1	1	TĐ .BOH	IV	0	0	30	Hệ thống cấp thoát nước/Water supply and drainage system(Zone B)	\N	0	PENDING	2026-05-08	\N	2026-05-08	\N	\N	9	615	2026-09-23 21:47:01.296317	\N	YES	863
4834	1	1	TĐ .BOH	B	16	0	16	Lắp đặt thiết bị điều hòa không khí tầng T2/Installing air conditional equipment floor2	\N	0	PENDING	2026-06-21	\N	2026-06-22	\N	2	9	615	2026-09-23 21:47:01.610824	\N	YES	917
3471	1	4	MEP-BTE-CSP-BPV-2BR		5	0	5	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	1	DONE	2026-06-01	2026-06-01	2026-06-01	2026-06-01	1	9	615	2026-09-08 04:38:30.401429	\N	\N	466
4833	1	1	TĐ .BOH	B	15	0	15	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	0	PENDING	2026-06-20	\N	2026-06-21	\N	2	9	615	2026-09-23 21:47:01.605285	\N	YES	916
4859	1	1	TĐ .BOH	C	19	0	19	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	0	PENDING	2026-07-15	\N	2026-07-15	\N	1	9	615	2026-09-23 21:47:01.752325	\N	YES	942
3847	1	18	MEP-BTE-CSP-RES-4BR		21	0	21	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	0	DONE	2026-10-06	2026-10-06	2026-10-06	2026-10-06	1	9	615	2026-09-08 04:38:36.575125	\N	\N	652
3854	1	19	MEP-BTE-CSP-VNR		6	0	6	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	0.1	DONE	2026-08-01	2026-08-01	2026-08-01	2026-08-01	1	9	615	2026-09-08 04:38:36.942693	\N	\N	659
3582	1	42	MEP-BTE-CSP-FIT		3	0	3	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	0.15	DONE	2026-07-06	2026-05-22	2026-07-08	2026-05-24	3	9	615	2026-09-08 04:38:32.816638	\N	\N	530
3468	1	4	MEP-BTE-CSP-BPV-2BR		2	0	2	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	1	DONE	2026-05-29	2026-05-29	2026-05-29	2026-05-29	1	9	615	2026-09-08 04:38:30.392743	\N	\N	457
3510	1	6	MEP-BTE-CSP-BUT		2	0	2	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	0.1	DONE	2026-07-04	2026-07-04	2026-07-04	2026-07-04	1	9	615	2026-09-08 04:38:31.416716	\N	\N	485
3605	1	11	MEP-BTE-CSP-HPV-1BR		6	0	6	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	0.2	DONE	2026-06-11	2026-06-11	2026-06-11	2026-06-11	1	9	615	2026-09-08 04:38:33.335207	\N	\N	542
3574	1	8	MEP-BTE-CSP-CLU		9	0	9	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	0.95	DONE	2026-07-31	2026-07-31	2026-07-31	2026-07-31	1	9	615	2026-09-08 04:38:32.446785	\N	\N	523
4774	1	1	TĐ .BOH	II	1	0	1	Lắp đặt ống Upvc chờ /Sleeve pipe installation installation	\N	0	PENDING	2026-05-01	\N	2026-05-30	\N	30	9	615	2026-09-23 21:47:01.261182	\N	YES	857
4852	1	1	TĐ .BOH	C	12	0	12	Thử kín đường ống nước ngưng tầng T2/Testing sealing water pipe floor2	\N	0	PENDING	2026-04-04	\N	2026-04-04	\N	1	9	615	2026-09-23 21:47:01.712334	\N	YES	935
4948	1	6	TĐ . BULTER	I	0	0	17	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	PENDING	2026-05-12	\N	2026-09-26	\N	\N	9	615	2026-09-23 21:47:02.531243	\N	\N	1031
3460	1	3	MEP-BTE-CSP-BPV-1BR		8	0	8	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	1	DONE	2026-06-01	2026-06-01	2026-06-01	2026-06-01	1	9	615	2026-09-08 04:38:29.993329	\N	\N	559
3602	1	11	MEP-BTE-CSP-HPV-1BR		3	0	3	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	0.2	DONE	2026-06-01	2026-06-01	2026-06-05	2026-06-05	5	9	615	2026-09-08 04:38:33.323228	\N	\N	540
3321	1	1	MEP-BTE-CSP-BOH		15	0	15	Thử kín đường ống nước ngưng tầng T2/Testing sealing water pipe floor3	\N	1	DONE	2026-04-12	2026-04-12	2026-04-12	2026-04-12	1	9	615	2026-09-08 04:38:29.147637	\N	\N	442
3531	1	41	MEP-BTE-CSP-BUT	II	0	0	22	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	DONE	2026-05-07	2026-05-07	2026-08-14	2026-08-14	\N	9	615	2026-09-08 04:38:31.961257	\N	\N	679
3855	1	19	MEP-BTE-CSP-VNR		7	0	7	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	0	DONE	2026-08-04	2026-08-04	2026-08-04	2026-08-04	1	9	615	2026-09-08 04:38:36.94543	\N	\N	653
3452	1	3	MEP-BTE-CSP-BPV-1BR	III	0	0	22	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	DONE	2026-05-29	2026-05-29	2026-08-13	2026-08-13	\N	9	615	2026-09-08 04:38:29.970722	\N	\N	672
3594	1	42	MEP-BTE-CSP-FIT		8	0	8	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	0	DONE	2026-08-31	2026-07-18	2026-08-31	2026-07-18	1	9	615	2026-09-08 04:38:32.853574	\N	\N	535
3459	1	3	MEP-BTE-CSP-BPV-1BR		7	0	7	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	1	DONE	2026-06-20	2026-06-20	2026-06-20	2026-06-20	1	9	615	2026-09-08 04:38:29.990691	\N	\N	558
5007	1	8	TĐ .CLUSTER VILLA	I	6	0	6	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	0	PENDING	2026-09-30	\N	2026-10-02	\N	3	9	615	2026-09-23 21:47:03.024097	\N	YES	1090
3362	1	1	MEP-BTE-CSP-BOH		11	0	11	Thử áp đường ống đồng tầng T2/Testing pressure copper pipe floor2	\N	1	DONE	2026-06-29	2026-06-29	2026-06-29	2026-06-29	1	9	615	2026-09-08 04:38:29.300272	\N	\N	439
4773	1	1	TĐ .BOH	II	0	0	23	Hệ thống cấp thoát nước/Water supply and drainage system( Retaining wall & Car parking)	\N	0	PENDING	2026-03-29	\N	2026-03-29	\N	\N	9	615	2026-09-23 21:47:01.254716	\N	YES	856
3860	1	19	MEP-BTE-CSP-VNR		4	0	4	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	0.85	DONE	2026-06-03	2026-06-03	2026-06-03	2026-06-03	1	9	615	2026-09-08 04:38:36.960346	\N	\N	657
3853	1	19	MEP-BTE-CSP-VNR		3	0	3	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	0.85	DONE	2026-04-22	2026-04-22	2026-04-23	2026-04-23	2	9	615	2026-09-08 04:38:36.939621	\N	\N	656
3625	1	12	MEP-BTE-CSP-HPV-2BR		5	0	5	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	0.35	DONE	2026-06-09	2026-06-09	2026-06-09	2026-06-09	1	9	615	2026-09-08 04:38:33.934373	\N	\N	552
3652	1	13	MEP-BTE-CSP-INF	II	0	0	26	Hệ thống cấp thoát nước/Water supply and drainage system(N2-N3)	\N	0.95	DONE	2026-02-07	2026-02-07	2026-02-07	2026-02-06	\N	9	615	2026-09-08 04:38:34.555343	\N	\N	690
3340	1	1	MEP-BTE-CSP-BOH	V	0	0	34	Hệ thống cấp thoát nước/Water supply and drainage system(Zone C)	\N	1	DONE	2026-05-23	2026-05-23	2026-05-23	2026-05-22	\N	9	615	2026-09-08 04:38:29.21565	\N	\N	665
3793	1	17	MEP-BTE-CSP-RES- 3BR		5	0	5	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	0	DONE	2026-07-15	2026-07-15	2026-07-17	2026-07-17	3	9	615	2026-09-08 04:38:36.111026	\N	\N	629
3465	1	4	MEP-BTE-CSP-BPV-2BR		0	0	14	Công tác chuẩn bị	\N	1	DONE	2026-05-19	2026-05-19	2026-05-21	2026-05-21	3	9	615	2026-09-08 04:38:30.384434	\N	\N	563
3846	1	18	MEP-BTE-CSP-RES-4BR		20	0	20	Lắp đặt cửa gió tầng T2/Installing air diffuser floor2	\N	0	DONE	2026-10-04	2026-10-04	2026-10-04	2026-10-04	1	9	615	2026-09-08 04:38:36.57122	\N	\N	651
3614	1	11	MEP-BTE-CSP-HPV-1BR		8	0	8	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	0.2	DONE	2026-06-07	2026-06-07	2026-06-07	2026-06-07	1	9	615	2026-09-08 04:38:33.369436	\N	\N	544
3774	1	15	MEP-BTE-CSP-LOB & SPA		11	0	11	Thử kín đường ống nước ngưng tầng 1/Testing sealing water pipe floor 1	\N	1	DONE	2026-09-01	2026-09-01	2026-09-01	2026-09-01	1	9	615	2026-09-08 04:38:35.696034	\N	\N	609
3739	1	14	MEP-BTE-CSP-KID		4	0	4	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	0.35	DONE	2026-08-06	2026-06-23	2026-08-07	2026-06-24	2	9	615	2026-09-08 04:38:35.18903	\N	\N	579
5263	1	18	TĐ RES- 4BR	II	8	0	8	Thi công lắp đặt ống luồn dây tiến hiệu và điều khiển tầng T2/Installing signal of conduit and controlling floor2	\N	0	PENDING	2026-08-12	\N	2026-08-12	\N	1	9	615	2026-09-23 21:47:05.118188	\N	YES	1346
5870	1	9	TĐ VN RES	I.	2	0	2	0.3	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.178195	\N	\N	1952
4815	1	1	TĐ .BOH	A	19	0	19	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	0	PENDING	2026-06-25	\N	2026-06-25	\N	1	9	615	2026-09-23 21:47:01.50337	\N	YES	898
4855	1	1	TĐ .BOH	C	15	0	15	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	0	PENDING	2026-06-25	\N	2026-06-25	\N	1	9	615	2026-09-23 21:47:01.729338	\N	YES	938
5856	1	9	TĐ BUSINESS	I.	0	0	14	0.55	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.099342	\N	\N	1938
4798	1	1	TĐ .BOH	A	2	0	2	Thi công lắp đặt ống đồng và bảo ôn tầng T2/Installing copper pipe and heat insulation floor2	\N	0	PENDING	2026-06-22	\N	2026-06-24	\N	3	9	615	2026-09-23 21:47:01.40764	\N	YES	881
4791	1	1	TĐ .BOH	VI	1	0	1	Lắp đặt đường ống nước cấp nước thoát/Water supply pipe system installation	\N	0	PENDING	2026-06-11	\N	2026-06-30	\N	20	9	615	2026-09-23 21:47:01.366022	\N	YES	874
3705	1	13	MEP-BTE-CSP-INF	VII	0	0	79	Hệ thống cấp thoát nước/Water supply and drainage system(D4)	\N	0.95	DONE	2026-02-22	2026-02-22	2026-02-22	2026-02-21	\N	9	615	2026-09-08 04:38:34.696936	\N	\N	698
4814	1	1	TĐ .BOH	A	18	0	18	Lắp đặt thiết bị điều khiển tầng T2/Installing controling equipment floor2	\N	0	PENDING	2026-07-02	\N	2026-07-03	\N	2	9	615	2026-09-23 21:47:01.497671	\N	YES	897
3636	1	12	MEP-BTE-CSP-HPV-2BR		9	0	9	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	0.35	DONE	2026-06-05	2026-06-05	2026-06-05	2026-06-05	1	9	615	2026-09-08 04:38:33.964863	\N	\N	567
5054	1	10	TĐ HPV 1- BR	I	6	0	6	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	0	PENDING	2026-09-11	\N	2026-09-17	\N	7	9	615	2026-09-23 21:47:03.431923	\N	YES	1137
4869	1	1	TĐ .BOH	D	7	0	7	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	0	PENDING	2026-06-20	\N	2026-06-21	\N	2	9	615	2026-09-23 21:47:01.810536	\N	YES	952
4824	1	1	TĐ .BOH	B	6	0	6	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T2/Installing air duct and heat insulation floor2	\N	0	PENDING	2026-06-20	\N	2026-06-21	\N	2	9	615	2026-09-23 21:47:01.555321	\N	YES	907
5865	1	9	TĐ LOBY	I.	0	0	14	0.55	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.151742	\N	\N	1947
3773	1	15	MEP-BTE-CSP-LOB & SPA		10	0	10	Thử áp đường ống đồng tầng 2 /Testing pressure copper pipe floor2	\N	0	DONE	2026-09-09	2026-09-09	2026-09-09	2026-09-09	1	9	615	2026-09-08 04:38:35.693899	\N	\N	577
5832	1	9	TĐ BPV-1BR	I.	0	0	14	0.55	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:48.94509	\N	\N	1914
3515	1	6	MEP-BTE-CSP-BUT	II	0	0	22	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	DONE	2026-06-02	2026-06-02	2026-12-29	2026-12-29	\N	9	615	2026-09-08 04:38:31.440414	\N	\N	677
3623	1	12	MEP-BTE-CSP-HPV-2BR		3	0	3	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	0.35	DONE	2026-06-01	2026-06-01	2026-06-03	2026-06-03	3	9	615	2026-09-08 04:38:33.927971	\N	\N	550
3445	1	3	MEP-BTE-CSP-BPV-1BR	I	0	0	15	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	DONE	2026-03-12	2026-03-12	2026-10-11	2026-10-11	\N	9	615	2026-09-08 04:38:29.949277	\N	\N	673
4828	1	1	TĐ .BOH	B	10	0	10	Thử áp đường ống đồng tầng T2/Testing pressure copper pipe floor2	\N	0	PENDING	2026-06-24	\N	2026-06-24	\N	1	9	615	2026-09-23 21:47:01.577703	\N	YES	911
4847	1	1	TĐ .BOH	C	7	0	7	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	0	PENDING	2026-05-01	\N	2026-05-02	\N	2	9	615	2026-09-23 21:47:01.683681	\N	YES	930
4837	1	1	TĐ .BOH	B	19	0	19	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	0	PENDING	2026-06-21	\N	2026-06-22	\N	2	9	615	2026-09-23 21:47:01.627686	\N	YES	920
3461	1	3	MEP-BTE-CSP-BPV-1BR		9	0	9	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	1	DONE	2026-06-02	2026-06-02	2026-06-02	2026-06-02	1	9	615	2026-09-08 04:38:29.996021	\N	\N	560
3492	1	40	MEP-BTE-CSP-BSC		5	0	5	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	0.15	DONE	2026-06-26	2026-06-26	2026-06-26	2026-06-26	1	9	615	2026-09-08 04:38:31.00975	\N	\N	477
3480	1	4	MEP-BTE-CSP-BPV-2BR		7	0	7	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	1	DONE	2026-06-22	2026-06-22	2026-06-22	2026-06-22	1	9	615	2026-09-08 04:38:30.429548	\N	\N	468
4966	1	6	TĐ . BULTER	II	11	0	11	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	0	PENDING	2026-10-04	\N	2026-10-04	\N	1	9	615	2026-09-23 21:47:02.634464	\N	YES	1049
5231	1	17	TĐ RES- 3BR		0	0	30	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T2/Installing air duct and heat insulation floor2	\N	0	PENDING	2026-07-19	\N	2026-07-19	\N	1	9	615	2026-09-23 21:47:04.882261	\N	YES	1314
5239	1	17	TĐ RES- 3BR		0	0	38	Lắp đặt thiết bị quạt thông gió tầng T2/Installing air duct fan equipment floor2	\N	0	PENDING	2026-08-25	\N	2026-08-25	\N	1	9	615	2026-09-23 21:47:04.927875	\N	YES	1322
5230	1	17	TĐ RES- 3BR	II	5	0	5	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	0	PENDING	2026-07-15	\N	2026-07-17	\N	3	9	615	2026-09-23 21:47:04.876313	\N	YES	1313
5237	1	17	TĐ RES- 3BR		0	0	36	Thử kín đường ống nước ngưng tầng T2/Testing sealing water pipe floor2	\N	0	PENDING	2026-08-14	\N	2026-08-14	\N	1	9	615	2026-09-23 21:47:04.916954	\N	YES	1320
5234	1	17	TĐ RES- 3BR		0	0	33	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	0	PENDING	2026-08-12	\N	2026-08-12	\N	1	9	615	2026-09-23 21:47:04.899033	\N	YES	1317
5224	1	17	TĐ RES- 3BR	I	6	0	6	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	0	PENDING	2026-10-19	\N	2026-10-21	\N	3	9	615	2026-09-23 21:47:04.843894	\N	YES	1307
5223	1	17	TĐ RES- 3BR	I	5	0	5	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	0	PENDING	2026-10-15	\N	2026-10-21	\N	7	9	615	2026-09-23 21:47:04.837003	\N	YES	1306
5222	1	17	TĐ RES- 3BR	I	4	0	4	Kiểm tra thử kín đường ống thoát nước/Testing drainpipe	\N	0	PENDING	2026-06-23	\N	2026-06-25	\N	3	9	615	2026-09-23 21:47:04.825789	\N	YES	1305
5244	1	17	TĐ RES- 3BR		7	0	7	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	0	PENDING	2026-10-04	\N	2026-10-04	\N	1	9	615	2026-09-23 21:47:04.954412	\N	YES	1327
5228	1	17	TĐ RES- 3BR	II	3	0	3	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	0	PENDING	2026-08-09	\N	2026-08-10	\N	2	9	615	2026-09-23 21:47:04.865818	\N	YES	1311
5257	1	18	TĐ RES- 4BR	II	2	0	2	Thi công lắp đặt ống đồng và bảo ôn tầng T2/Installing copper pipe and heat insulation floor2	\N	0	PENDING	2026-08-12	\N	2026-08-12	\N	1	9	615	2026-09-23 21:47:05.084992	\N	YES	1340
5260	1	18	TĐ RES- 4BR	II	5	0	5	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	0	PENDING	2026-07-15	\N	2026-07-17	\N	3	9	615	2026-09-23 21:47:05.101346	\N	YES	1343
5250	1	18	TĐ RES- 4BR	I	2	0	2	Thi công lắp đặt đường ống thoát nước/Installing drainpipe	\N	0	PENDING	2026-06-18	\N	2026-06-22	\N	5	9	615	2026-09-23 21:47:05.048021	\N	YES	1333
5267	1	18	TĐ RES- 4BR	II	12	0	12	Thử kín đường ống nước ngưng tầng T2/Testing sealing water pipe floor2	\N	0	PENDING	2026-08-14	\N	2026-08-14	\N	1	9	615	2026-09-23 21:47:05.139872	\N	YES	1350
5264	1	18	TĐ RES- 4BR	II	9	0	9	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	0	PENDING	2026-08-12	\N	2026-08-12	\N	1	9	615	2026-09-23 21:47:05.123578	\N	YES	1347
5265	1	18	TĐ RES- 4BR	II	10	0	10	Thử áp đường ống đồng tầng T2/Testing pressure copper pipe floor2	\N	0	PENDING	2026-08-14	\N	2026-08-14	\N	1	9	615	2026-09-23 21:47:05.12901	\N	YES	1348
4879	1	1	TĐ .BOH	D	17	0	17	Lắp đặt thiết bị quạt thông gió tầng T2/Installing air duct fan equipment floor2	\N	0	PENDING	2026-07-05	\N	2026-07-06	\N	2	9	615	2026-09-23 21:47:01.870754	\N	YES	962
3637	1	12	MEP-BTE-CSP-HPV-2BR		10	0	10	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	0	DONE	2026-08-20	2026-08-20	2026-08-20	2026-08-20	1	9	615	2026-09-08 04:38:33.967519	\N	\N	568
4769	1	1	TĐ .BOH	I	2	0	2	Lắp đặt đường ống thoát âm sàn phòng bơm/Floor recessed pipe installation for pumper room	\N	0.8	IN_PROGRESS	2026-02-23	\N	2026-03-04	\N	10	9	615	2026-09-23 21:47:01.228207	\N	YES	852
4783	1	1	TĐ .BOH	IV	3	0	3	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	0	PENDING	2026-06-04	\N	2026-06-23	\N	20	9	615	2026-09-23 21:47:01.313622	\N	YES	866
4781	1	1	TĐ .BOH	IV	1	0	1	Lắp đặt đường ống nước cấp nước thoát/Water supply pipe system installation	\N	0	PENDING	2026-05-08	\N	2026-05-27	\N	20	9	615	2026-09-23 21:47:01.302132	\N	YES	864
5142	1	13	TĐ INF	VIII	0	0	72	Hệ thống cấp thoát nước/Water supply and drainage system(D2)	\N	0	PENDING	2026-02-07	\N	2026-02-07	\N	\N	9	615	2026-09-23 21:47:04.103018	\N	YES	1225
4889	1	3	TĐ BPV 1- BR	I	0	0	17	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	PENDING	2026-03-12	\N	2026-10-11	\N	\N	9	615	2026-09-23 21:47:02.005134	\N	\N	972
4894	1	3	TĐ BPV 1- BR	I	5	0	5	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	\N	PENDING	2026-09-16	\N	2026-10-10	\N	25	9	615	2026-09-23 21:47:02.033837	\N	YES	977
4898	1	3	TĐ BPV 1- BR	II	2	0	2	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	PENDING	2026-05-29	\N	2026-05-29	\N	1	9	615	2026-09-23 21:47:02.05649	\N	YES	981
4907	1	3	TĐ BPV 1- BR		0	0	35	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	PENDING	2026-08-13	\N	2026-08-13	\N	1	9	615	2026-09-23 21:47:02.10648	\N	YES	990
3543	1	41	MEP-BTE-CSP-BUT		11	0	11	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	0	DONE	2026-08-14	2026-08-14	2026-08-14	2026-08-14	1	9	615	2026-09-08 04:38:31.99533	\N	\N	506
5127	1	13	TĐ INF	VI	1	0	1	Thi công đào, lấp đất/Excavation, backfill ( Cấp nước d 110)	\N	0.6	IN_PROGRESS	2026-02-07	\N	2026-03-23	\N	45	9	615	2026-09-23 21:47:04.018482	\N	YES	1210
5133	1	13	TĐ INF	VI	7	0	7	Thi công hệ thống valve, vòi, trụ/ Valve system, ejector, pillar installation	\N	0	PENDING	2026-06-17	\N	2026-09-04	\N	80	9	615	2026-09-23 21:47:04.054003	\N	YES	1216
5130	1	13	TĐ INF	VI	4	0	4	Kiểm tra hệ thống cấp  nước/testing water supply system	\N	0	PENDING	2026-06-28	\N	2026-09-05	\N	70	9	615	2026-09-23 21:47:04.036471	\N	YES	1213
5101	1	13	TĐ INF	III	1	0	1	Thi công đào, lấp đất/Excavation, backfill	\N	0	PENDING	2026-02-21	\N	2026-04-21	\N	60	9	615	2026-09-23 21:47:03.872811	\N	YES	1184
5137	1	13	TĐ INF	VII	1	0	1	Thi công đào, lấp đất/Excavation, backfill	\N	0	PENDING	2026-02-22	\N	2026-03-23	\N	30	9	615	2026-09-23 21:47:04.076426	\N	YES	1220
5093	1	13	TĐ INF	I	5	0	5	Thi công hệ thống bơm (nước cấp, nước thoát, bù áp)/ Pump system installtion (water supply, drainage, pump pressure)	\N	0	PENDING	2026-07-02	\N	2026-10-09	\N	100	9	615	2026-09-23 21:47:03.824419	\N	YES	1176
5118	1	13	TĐ INF	V	6	0	6	Thi công hệ thống ống âm đất (thoát nước, thoát nước thải)Underground pipe system execution(water supply, drainage, sewage)	\N	0	PENDING	2026-03-04	\N	2026-06-26	\N	115	9	615	2026-09-23 21:47:03.970769	\N	YES	1201
5123	1	13	TĐ INF	V	11	0	11	Gia công lắp đặt nghiệm thu cốp pha hố ga tuyến D6	\N	0.1	IN_PROGRESS	2026-02-19	\N	2026-02-26	\N	8	9	615	2026-09-23 21:47:03.996909	\N	NO	1206
5125	1	13	TĐ INF	V	13	0	13	Nghiêm thu công tác đổ bê tông hố ga tuyến D6	\N	0	PENDING	2026-02-24	\N	2026-03-03	\N	8	9	615	2026-09-23 21:47:04.00797	\N	NO	1208
5092	1	13	TĐ INF	I	4	0	4	Kiểm tra hệ thống cấp thoát nước/testing water supply system	\N	0	PENDING	2026-03-23	\N	2026-06-10	\N	80	9	615	2026-09-23 21:47:03.818656	\N	YES	1175
5119	1	13	TĐ INF	V	7	0	7	Thi công hệ thống valve, vòi, trụ/ Valve system, ejector, pillar installation	\N	0	PENDING	2026-06-17	\N	2026-09-04	\N	80	9	615	2026-09-23 21:47:03.97646	\N	YES	1202
5156	1	13	TĐ INF	B	2	0	2	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	0	PENDING	2026-06-09	\N	2026-06-09	\N	1	9	615	2026-09-23 21:47:04.18445	\N	YES	1239
3784	1	15	MEP-BTE-CSP-LOB & SPA		21	0	21	Lắp đặt cửa gió tầng 2 /Installing air diffuser floor1	\N	0.35	DONE	2026-10-30	2026-10-30	2026-10-31	2026-10-31	2	9	615	2026-09-08 04:38:35.720634	\N	\N	619
5022	1	8	TĐ .CLUSTER VILLA	II	7	0	7	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	0	PENDING	2026-07-30	\N	2026-07-30	\N	1	9	615	2026-09-23 21:47:03.110581	\N	YES	1105
5131	1	13	TĐ INF	VI	5	0	5	Thi công đào, lấp đất/Excavation, backfill( Thoát nước)	\N	0.5	IN_PROGRESS	2026-02-07	\N	2026-03-23	\N	45	9	615	2026-09-23 21:47:04.042095	\N	YES	1214
5109	1	13	TĐ INF	IV	3	0	3	Thi công hệ thống valve, vòi, trụ/ Valve system, ejector, pillar installation	\N	0	PENDING	2026-04-13	\N	2026-06-11	\N	60	9	615	2026-09-23 21:47:03.919874	\N	YES	1192
5099	1	13	TĐ INF	II	5	0	5	Thi công hệ thống bơm (nước cấp, nước thoát, bù áp)/ Pump system installtion (water supply, drainage, pump pressure)	\N	0	PENDING	2026-08-01	\N	2026-09-29	\N	60	9	615	2026-09-23 21:47:03.859778	\N	NO	1182
5161	1	13	TĐ INF	B	7	0	7	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	0	PENDING	2026-06-07	\N	2026-06-07	\N	1	9	615	2026-09-23 21:47:04.211203	\N	YES	1244
5103	1	13	TĐ INF	III	3	0	3	Thi công hệ thống valve, vòi, trụ/ Valve system, ejector, pillar installation	\N	0	PENDING	2026-07-03	\N	2026-09-10	\N	70	9	615	2026-09-23 21:47:03.885877	\N	YES	1186
5141	1	13	TĐ INF	VII	5	0	5	Thi công hệ thống bơm (nước cấp, nước thoát, bù áp)/ Pump system installtion (water supply, drainage, pump pressure)	\N	0	PENDING	2026-06-22	\N	2026-07-27	\N	36	9	615	2026-09-23 21:47:04.097527	\N	YES	1224
5095	1	13	TĐ INF	II	1	0	1	Thi công đào, lấp đất/Excavation, backfill	\N	0	PENDING	2026-02-07	\N	2026-04-02	\N	55	9	615	2026-09-23 21:47:03.834896	\N	YES	1178
5132	1	13	TĐ INF	VI	6	0	6	Thi công hệ thống ống âm đất (thoát nước, thoát nước thải)Underground pipe system execution(water supply, drainage, sewage)	\N	0.5	IN_PROGRESS	2026-03-04	\N	2026-06-26	\N	115	9	615	2026-09-23 21:47:04.048414	\N	YES	1215
5143	1	13	TĐ INF	VIII	1	0	1	Thi công đào, lấp đất/Excavation, backfill	\N	0	PENDING	2026-02-12	\N	2026-03-18	\N	35	9	615	2026-09-23 21:47:04.108182	\N	YES	1226
5115	1	13	TĐ INF	V	3	0	3	Thi công hệ thống valve, vòi, trụ/ Valve system, ejector, pillar installation	\N	0	PENDING	2026-06-17	\N	2026-09-04	\N	80	9	615	2026-09-23 21:47:03.954273	\N	YES	1198
5140	1	13	TĐ INF	VII	4	0	4	Kiểm tra hệ thống cấp thoát nước/testing water supply system	\N	0	PENDING	2026-06-02	\N	2026-07-18	\N	47	9	615	2026-09-23 21:47:04.091796	\N	YES	1223
5105	1	13	TĐ INF	III	5	0	5	Thi công hệ thống bơm (nước cấp, nước thoát, bù áp)/ Pump system installtion (water supply, drainage, pump pressure)	\N	0	PENDING	2026-08-10	\N	2026-10-08	\N	60	9	615	2026-09-23 21:47:03.896794	\N	YES	1188
5163	1	13	TĐ INF	B	9	0	9	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	0	PENDING	2026-06-07	\N	2026-06-07	\N	1	9	615	2026-09-23 21:47:04.22213	\N	YES	1246
4777	1	1	TĐ .BOH	III	2	0	2	Kiểm tra thử kín, thử áp hệ thống cấp thoát nước/testing water supply system	\N	0	PENDING	2026-04-17	\N	2026-04-19	\N	3	9	615	2026-09-23 21:47:01.279175	\N	YES	860
3844	1	18	MEP-BTE-CSP-RES-4BR		18	0	18	Lắp đặt thiết bị điều khiển tầng T2/Installing controling equipment floor2	\N	0	DONE	2026-08-26	2026-08-26	2026-08-26	2026-08-26	1	9	615	2026-09-08 04:38:36.56559	\N	\N	649
4787	1	1	TĐ .BOH	V	2	0	2	Kiểm tra thử kín, thử áp hệ thống cấp thoát nước/testing water supply system	\N	0	PENDING	2026-05-23	\N	2026-05-25	\N	3	9	615	2026-09-23 21:47:01.339148	\N	YES	870
5052	1	10	TĐ HPV 1- BR	I	4	0	4	Kiểm tra thử kín đường ống thoát nước/Testing drainpipe	\N	0	PENDING	2026-06-05	\N	2026-06-11	\N	7	9	615	2026-09-23 21:47:03.41971	\N	YES	1135
5155	1	13	TĐ INF	B	1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	0	PENDING	2026-06-11	\N	2026-06-12	\N	2	9	615	2026-09-23 21:47:04.17902	\N	YES	1238
5158	1	13	TĐ INF	B	4	0	4	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	0	PENDING	2026-06-06	\N	2026-06-06	\N	1	9	615	2026-09-23 21:47:04.195265	\N	YES	1241
3669	1	13	MEP-BTE-CSP-INF	IV	0	0	43	Hệ thống cấp thoát nước/Water supply and drainage system(D3)	\N	0.95	DONE	2026-02-11	2026-02-11	2026-02-11	2026-02-10	\N	9	615	2026-09-08 04:38:34.604614	\N	\N	693
5196	1	15	TĐ .LOB-SPA	II	2	0	2	Thi công lắp đặt ống đồng và bảo ôn tầng T2/Installing copper pipe and heat insulation floor2	\N	0	PENDING	2026-09-02	\N	2026-09-07	\N	6	9	615	2026-09-23 21:47:04.597111	\N	YES	1279
5194	1	15	TĐ .LOB-SPA	II	0	0	24	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	PENDING	2026-07-12	\N	2026-11-02	\N	\N	9	615	2026-09-23 21:47:04.585998	\N	\N	1277
5215	1	15	TĐ .LOB-SPA	II	21	0	21	Lắp đặt cửa gió tầng 2 /Installing air diffuser floor1	\N	0	PENDING	2026-10-30	\N	2026-10-31	\N	2	9	615	2026-09-23 21:47:04.714952	\N	YES	1298
5199	1	15	TĐ .LOB-SPA	II	5	0	5	Thi công lắp đặt đường ống thông gió và bảo ôn tầng 1/Installing air duct and heat insulation floor 1	\N	0	PENDING	2026-07-12	\N	2026-07-23	\N	12	9	615	2026-09-23 21:47:04.6173	\N	YES	1282
5205	1	15	TĐ .LOB-SPA	II	11	0	11	Thử kín đường ống nước ngưng tầng 1/Testing sealing water pipe floor 1	\N	0	PENDING	2026-09-01	\N	2026-09-01	\N	1	9	615	2026-09-23 21:47:04.653129	\N	YES	1288
5212	1	15	TĐ .LOB-SPA	II	18	0	18	Lắp đặt thiết bị điều khiển tầng 1/Installing controling equipment floor 1	\N	0	PENDING	2026-08-23	\N	2026-08-24	\N	2	9	615	2026-09-23 21:47:04.69748	\N	YES	1295
5198	1	15	TĐ .LOB-SPA	II	4	0	4	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T2/Installing sealing water pipe and heat insulation floor2	\N	0	PENDING	2026-09-01	\N	2026-09-05	\N	5	9	615	2026-09-23 21:47:04.610261	\N	YES	1281
5208	1	15	TĐ .LOB-SPA	II	14	0	14	Lắp đặt thiết bị quạt thông gió tầng T2/Installing air duct fan equipment floor1	\N	0	PENDING	2026-08-26	\N	2026-08-27	\N	2	9	615	2026-09-23 21:47:04.672074	\N	YES	1291
3762	1	15	MEP-BTE-CSP-LOB & SPA		6	0	6	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T2/Installing air duct and heat insulation floor2	\N	0.8	DONE	2026-07-25	2026-07-25	2026-07-31	2026-07-31	7	9	615	2026-09-08 04:38:35.667503	\N	\N	600
4768	1	1	TĐ .BOH	I	1	0	1	Bể nước sinh hoạt, phòng cháy chữa cháy: Lắp đặt ống slevee inox,slevee  ống Upvc/Domestic water tank, Fire fighting, sleeve pipe installation, UPVC pipe	\N	0.65	IN_PROGRESS	2026-01-19	\N	2026-01-20	\N	2	9	615	2026-09-23 21:47:01.222665	\N	YES	851
3616	1	11	MEP-BTE-CSP-HPV-1BR		10	0	10	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	0.2	DONE	2026-08-20	2026-08-20	2026-08-20	2026-08-20	1	9	615	2026-09-08 04:38:33.376525	\N	\N	546
3508	1	6	MEP-BTE-CSP-BUT	I	0	0	15	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	DONE	2026-05-12	2026-05-12	2026-09-26	2026-09-26	\N	9	615	2026-09-08 04:38:31.408156	\N	\N	839
3802	1	17	MEP-BTE-CSP-RES- 3BR		0	0	29	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	0	DONE	2026-08-09	2026-08-09	2026-08-10	2026-08-10	2	9	615	2026-09-08 04:38:36.131681	\N	\N	706
3596	1	42	MEP-BTE-CSP-FIT		10	0	10	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	0	DONE	2026-10-17	2026-09-23	2026-10-17	2026-09-23	1	9	615	2026-09-08 04:38:32.859999	\N	\N	465
4991	1	7	TĐ .BZONE	B	3	0	3	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	0	PENDING	2026-05-07	\N	2026-05-08	\N	2	9	615	2026-09-23 21:47:02.84074	\N	YES	1074
4987	1	7	TĐ .BZONE	A	11	0	11	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	0	PENDING	2026-08-14	\N	2026-08-14	\N	1	9	615	2026-09-23 21:47:02.816185	\N	YES	1070
4969	1	7	TĐ .BZONE	I	1	0	1	Thi công lắp đặt đường ống cấp nước /Installing water pipe	\N	0	PENDING	2026-06-02	\N	2026-06-11	\N	10	9	615	2026-09-23 21:47:02.716197	\N	YES	1052
4989	1	7	TĐ .BZONE	B	1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	0	PENDING	2026-06-12	\N	2026-06-13	\N	2	9	615	2026-09-23 21:47:02.827264	\N	YES	1072
4978	1	7	TĐ .BZONE	A	2	0	2	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	0	PENDING	2026-06-12	\N	2026-06-12	\N	1	9	615	2026-09-23 21:47:02.76517	\N	YES	1061
4998	1	7	TĐ .BZONE	B	10	0	10	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	0	PENDING	2026-08-12	\N	2026-08-12	\N	1	9	615	2026-09-23 21:47:02.888022	\N	YES	1081
5167	1	14	TĐ . KID CLUB	I	0	0	17	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	PENDING	2026-06-01	\N	2026-10-21	\N	\N	9	615	2026-09-23 21:47:04.316252	\N	\N	1250
3395	1	1	MEP-BTE-CSP-BOH	C	0	0	89	Zone C	\N	1	DONE	2026-03-29	2026-03-29	2026-03-30	2026-03-30	\N	9	615	2026-09-08 04:38:29.39379	\N	\N	671
5044	1	9	TĐ .FITNESS	II	9	0	9	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	0	PENDING	2026-08-31	\N	2026-08-31	\N	1	9	615	2026-09-23 21:47:03.310338	\N	YES	1127
5030	1	9	TĐ .FITNESS	I	2	0	2	Thi công lắp đặt đường ống thoát nước/Installing drainpipe	\N	0	PENDING	2026-05-09	\N	2026-05-13	\N	5	9	615	2026-09-23 21:47:03.220081	\N	YES	1113
4790	1	1	TĐ .BOH	VI	0	0	40	Hệ thống cấp thoát nước/Water supply and drainage system(Zone D)	\N	0	PENDING	2026-06-11	\N	2026-06-11	\N	\N	9	615	2026-09-23 21:47:01.358807	\N	YES	873
5036	1	9	TĐ .FITNESS	II	1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	0	PENDING	2026-08-06	\N	2026-08-07	\N	2	9	615	2026-09-23 21:47:03.257526	\N	YES	1119
5001	1	8	TĐ .CLUSTER VILLA	I	0	0	17	Hệ thống cấp thoát nước/Water supply and drainage system35-48)	\N	\N	PENDING	2026-04-20	\N	2026-10-17	\N	\N	9	615	2026-09-23 21:47:02.984135	\N	\N	1084
3869	1	45	MEP-BTE-CSP-KID		4	0	4	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	0.35	DONE	2026-08-06	2026-06-23	2026-08-07	2026-06-24	2	9	615	2026-09-08 07:55:46.538234	\N	\N	620
3872	1	45	MEP-BTE-CSP-KID	II	0	0	22	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	DONE	2026-07-06	2026-05-22	2026-10-17	2026-09-23	\N	9	615	2026-09-08 07:55:46.55449	\N	\N	430
3808	1	17	MEP-BTE-CSP-RES- 3BR		0	0	35	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	0	DONE	2026-08-23	2026-08-23	2026-08-23	2026-08-23	1	9	615	2026-09-08 04:38:36.145124	\N	\N	712
3861	1	19	MEP-BTE-CSP-VNR		5	0	5	Lắp đặt thiết bị điều hòa	\N	0.15	DONE	2026-11-22	2026-11-22	2026-11-22	2026-11-23	1	9	615	2026-09-08 04:38:36.962726	\N	\N	658
4960	1	6	TĐ . BULTER	II	5	0	5	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	0	PENDING	2026-07-07	\N	2026-07-07	\N	1	9	615	2026-09-23 21:47:02.601696	\N	YES	1043
3733	1	14	MEP-BTE-CSP-KID		0	0	13	TỔNG TIẾN ĐỘ THI CÔNG	\N	\N	DONE	2026-05-19	2026-05-19	2026-10-21	2026-10-21	155	9	615	2026-09-08 04:38:35.166499	\N	\N	662
5070	1	10	TĐ HPV 2- BR	I	2	0	2	Thi công lắp đặt đường ống thoát nước/Installing drainpipe	\N	0	PENDING	2026-03-26	\N	2026-03-30	\N	5	9	615	2026-09-23 21:47:03.58596	\N	YES	1153
3838	1	18	MEP-BTE-CSP-RES-4BR		12	0	12	Thử kín đường ống nước ngưng tầng T2/Testing sealing water pipe floor2	\N	0	DONE	2026-08-14	2026-08-14	2026-08-14	2026-08-14	1	9	615	2026-09-08 04:38:36.550344	\N	\N	643
3740	1	14	MEP-BTE-CSP-KID		5	0	5	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	0.35	DONE	2026-08-09	2026-06-26	2026-08-09	2026-06-26	1	9	615	2026-09-08 04:38:35.19245	\N	\N	582
3722	1	13	MEP-BTE-CSP-INF	III	0	0	96	Hệ thống cấp thoát nước/Water supply and drainage system(D7)	\N	0.25	DONE	2026-02-21	2026-02-21	2026-02-21	2026-02-20	\N	9	615	2026-09-08 04:38:34.744009	\N	\N	694
3526	1	41	MEP-BTE-CSP-BUT		2	0	2	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	0.9	DONE	2026-06-12	2026-06-12	2026-06-12	2026-06-12	1	9	615	2026-09-08 04:38:31.945215	\N	\N	491
3467	1	4	MEP-BTE-CSP-BPV-2BR		1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	1	DONE	2026-05-29	2026-05-29	2026-05-30	2026-05-30	2	9	615	2026-09-08 04:38:30.389827	\N	\N	460
5026	1	8	TĐ .CLUSTER VILLA	II	11	0	11	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	0	PENDING	2026-09-16	\N	2026-09-16	\N	1	9	615	2026-09-23 21:47:03.13453	\N	YES	1109
4887	1	1	TĐ .BOH	D	25	0	25	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	0	PENDING	2026-07-14	\N	2026-07-14	\N	1	9	615	2026-09-23 21:47:01.915735	\N	YES	970
4797	1	1	TĐ .BOH	A	1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	0	PENDING	2026-06-20	\N	2026-06-20	\N	1	9	615	2026-09-23 21:47:01.401245	\N	YES	880
4863	1	1	TĐ .BOH	D	1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	0	PENDING	2026-06-20	\N	2026-06-21	\N	2	9	615	2026-09-23 21:47:01.775655	\N	YES	946
3484	1	4	MEP-BTE-CSP-BPV-2BR		11	0	11	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	0.4	DONE	2026-08-13	2026-08-13	2026-08-13	2026-08-13	1	9	615	2026-09-08 04:38:30.440936	\N	\N	472
5122	1	13	TĐ INF	V	10	0	10	Gia công lắp đặt nghiệm thu cốt thép hố ga tuyến D6	\N	0.7058824	IN_PROGRESS	2026-02-17	\N	2026-02-21	\N	5	9	615	2026-09-23 21:47:03.991661	\N	NO	1205
5104	1	13	TĐ INF	III	4	0	4	Kiểm tra thử kín, thử áp hệ thống cấp thoát nước/testing water supply system	\N	0	PENDING	2026-07-14	\N	2026-09-16	\N	65	9	615	2026-09-23 21:47:03.891015	\N	YES	1187
5124	1	13	TĐ INF	V	12	0	12	Đổ bê tông hố ga tuyến D6	\N	0	PENDING	2026-02-19	\N	2026-02-26	\N	8	9	615	2026-09-23 21:47:04.002414	\N	NO	1207
5106	1	13	TĐ INF	IV	0	0	35	Hệ thống cấp thoát nước/Water supply and drainage system(D3)	\N	0	PENDING	2026-02-11	\N	2026-02-11	\N	\N	9	615	2026-09-23 21:47:03.902692	\N	YES	1189
5159	1	13	TĐ INF	B	5	0	5	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	0	PENDING	2026-06-09	\N	2026-06-09	\N	1	9	615	2026-09-23 21:47:04.200716	\N	YES	1242
5096	1	13	TĐ INF	II	2	0	2	Thi công hệ thống ống âm đất (cấp nước, thoát nước, thoát nước thải)Underground pipe system execution(water supply, drainage, sewage)	\N	0	PENDING	2026-02-14	\N	2026-04-04	\N	50	9	615	2026-09-23 21:47:03.84078	\N	YES	1179
5135	1	13	TĐ INF	VI	9	0	9	Thi công hệ thống bơm (nước cấp, nước thoát, bù áp)/ Pump system installtion (water supply, drainage, pump pressure)	\N	0	PENDING	2026-08-28	\N	2026-11-02	\N	67	9	615	2026-09-23 21:47:04.065027	\N	YES	1218
4918	1	4	TĐ BPV 2- BR	II	2	0	2	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	0	PENDING	2026-05-29	\N	2026-05-29	\N	1	9	615	2026-09-23 21:47:02.249072	\N	YES	1001
4921	1	4	TĐ BPV 2- BR	II	5	0	5	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	0	PENDING	2026-06-01	\N	2026-06-01	\N	1	9	615	2026-09-23 21:47:02.265626	\N	YES	1004
5197	1	15	TĐ .LOB-SPA	II	3	0	3	Thi công lắp đặt ống nước ngưng và bảo ôn tầng 1/Installing sealing water pipe and heat insulation floor 1	\N	0	PENDING	2026-08-23	\N	2026-08-30	\N	8	9	615	2026-09-23 21:47:04.603482	\N	YES	1280
5876	1	9	TĐ BOH	I.	2	0	2	0.3	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.209631	\N	\N	1958
4990	1	7	TĐ .BZONE	B	2	0	2	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	0	PENDING	2026-06-12	\N	2026-06-12	\N	1	9	615	2026-09-23 21:47:02.83354	\N	YES	1073
4971	1	7	TĐ .BZONE	I	3	0	3	Kiểm tra thử áp đường ống cấp nước/ Testing pressure of drainpipe	\N	0	PENDING	2026-06-12	\N	2026-06-14	\N	3	9	615	2026-09-23 21:47:02.726839	\N	YES	1054
4938	1	9	TĐ .BUSINES CENTER	II	2	0	2	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	0	PENDING	2026-06-23	\N	2026-06-23	\N	1	9	615	2026-09-23 21:47:02.419627	\N	YES	1021
5179	1	14	TĐ . KID CLUB	II	5	0	5	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	0	PENDING	2026-08-09	\N	2026-08-09	\N	1	9	615	2026-09-23 21:47:04.398171	\N	YES	1262
5175	1	14	TĐ . KID CLUB	II	1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	0	PENDING	2026-08-06	\N	2026-08-07	\N	2	9	615	2026-09-23 21:47:04.37153	\N	YES	1258
5183	1	14	TĐ . KID CLUB	II	9	0	9	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	0	PENDING	2026-08-31	\N	2026-08-31	\N	1	9	615	2026-09-23 21:47:04.429789	\N	YES	1266
5184	1	14	TĐ . KID CLUB	II	10	0	10	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	0	PENDING	2026-10-15	\N	2026-10-15	\N	1	9	615	2026-09-23 21:47:04.43849	\N	YES	1267
5040	1	9	TĐ .FITNESS	II	5	0	5	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	0	PENDING	2026-08-09	\N	2026-08-09	\N	1	9	615	2026-09-23 21:47:03.285349	\N	YES	1123
5041	1	9	TĐ .FITNESS	II	6	0	6	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	0	PENDING	2026-08-08	\N	2026-08-08	\N	1	9	615	2026-09-23 21:47:03.291535	\N	YES	1124
5046	1	9	TĐ .FITNESS	II	11	0	11	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	0	PENDING	2026-10-17	\N	2026-10-17	\N	1	9	615	2026-09-23 21:47:03.322004	\N	YES	1129
3833	1	18	MEP-BTE-CSP-RES-4BR		7	0	7	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	0	DONE	2026-08-09	2026-08-09	2026-08-10	2026-08-10	2	9	615	2026-09-08 04:38:36.537323	\N	\N	638
3817	1	18	MEP-BTE-CSP-RES-4BR		13	0	13	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	0	DONE	2026-08-23	2026-08-23	2026-08-23	2026-08-23	1	9	615	2026-09-08 04:38:36.494469	\N	\N	644
3750	1	14	MEP-BTE-CSP-KID		8	0	8	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	0.35	DONE	2026-08-31	2026-07-18	2026-08-31	2026-07-18	1	9	615	2026-09-08 04:38:35.227502	\N	\N	590
4775	1	1	TĐ .BOH	III	0	0	25	Hệ thống cấp thoát nước/Water supply and drainage system(Zone A)	\N	0	PENDING	2026-03-29	\N	2026-03-29	\N	\N	9	615	2026-09-23 21:47:01.266927	\N	YES	858
4846	1	1	TĐ .BOH	C	6	0	6	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T2/Installing air duct and heat insulation floor2	\N	0	PENDING	2026-06-21	\N	2026-06-22	\N	2	9	615	2026-09-23 21:47:01.678393	\N	YES	929
3842	1	18	MEP-BTE-CSP-RES-4BR		16	0	16	Lắp đặt thiết bị điều hòa không khí tầng T2/Installing air conditional equipment floor2	\N	0	DONE	2026-08-24	2026-08-24	2026-08-24	2026-08-24	1	9	615	2026-09-08 04:38:36.560756	\N	\N	647
3463	1	3	MEP-BTE-CSP-BPV-1BR		11	0	11	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	0.35	DONE	2026-08-13	2026-08-13	2026-08-13	2026-08-13	1	9	615	2026-09-08 04:38:30.001338	\N	\N	456
4817	1	1	TĐ .BOH	A	21	0	21	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	0	PENDING	2026-07-19	\N	2026-07-19	\N	1	9	615	2026-09-23 21:47:01.515134	\N	YES	900
3489	1	40	MEP-BTE-CSP-BSC		2	0	2	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	0.15	DONE	2026-06-23	2026-06-23	2026-06-23	2026-06-23	1	9	615	2026-09-08 04:38:31.000977	\N	\N	474
4856	1	1	TĐ .BOH	C	16	0	16	Lắp đặt thiết bị điều hòa không khí tầng T2/Installing air conditional equipment floor2	\N	0	PENDING	2026-06-28	\N	2026-06-29	\N	2	9	615	2026-09-23 21:47:01.735191	\N	YES	939
5837	1	9	TĐ BPV- 2BR	I.	2	0	2	0.3	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:48.980155	\N	\N	1919
3561	1	8	MEP-BTE-CSP-CLU		3	0	3	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	1	DONE	2026-07-16	2026-07-16	2026-07-17	2026-07-17	2	9	615	2026-09-08 04:38:32.409967	\N	\N	518
3523	1	41	MEP-BTE-CSP-BUT		0	0	14	Công tác chuẩn bị	\N	1	DONE	2026-05-19	2026-05-19	2026-05-21	2026-05-21	3	9	615	2026-09-08 04:38:31.934907	\N	\N	464
3736	1	14	MEP-BTE-CSP-KID		1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	0.35	DONE	2026-08-06	2026-06-23	2026-08-07	2026-06-24	2	9	615	2026-09-08 04:38:35.177194	\N	\N	575
4871	1	1	TĐ .BOH	D	9	0	9	Thi công lắp đặt ống luồn dây tiến hiệu và điều khiển tầng T2/Installing signal of conduit and controlling floor3	\N	0	PENDING	2026-06-29	\N	2026-07-03	\N	5	9	615	2026-09-23 21:47:01.823196	\N	YES	954
3584	1	42	MEP-BTE-CSP-FIT		5	0	5	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	0.15	DONE	2026-08-09	2026-06-26	2026-08-09	2026-06-26	1	9	615	2026-09-08 04:38:32.821905	\N	\N	532
4962	1	6	TĐ . BULTER	II	7	0	7	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	0	PENDING	2026-07-29	\N	2026-07-29	\N	1	9	615	2026-09-23 21:47:02.612404	\N	YES	1045
4785	1	1	TĐ .BOH	V	0	0	35	Hệ thống cấp thoát nước/Water supply and drainage system(Zone C)	\N	0	PENDING	2026-05-23	\N	2026-05-23	\N	\N	9	615	2026-09-23 21:47:01.327549	\N	YES	868
4827	1	1	TĐ .BOH	B	9	0	9	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	0	PENDING	2026-06-21	\N	2026-06-23	\N	3	9	615	2026-09-23 21:47:01.572021	\N	YES	910
4820	1	1	TĐ .BOH	B	2	0	2	Thi công lắp đặt ống đồng và bảo ôn tầng T2/Installing copper pipe and heat insulation floor2	\N	0	PENDING	2026-06-20	\N	2026-06-22	\N	3	9	615	2026-09-23 21:47:01.532122	\N	YES	903
3823	1	18	MEP-BTE-CSP-RES-4BR		4	0	4	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T2/Installing sealing water pipe and heat insulation floor2	\N	0	DONE	2026-08-12	2026-08-12	2026-08-12	2026-08-12	1	9	615	2026-09-08 04:38:36.512017	\N	\N	624
3775	1	15	MEP-BTE-CSP-LOB & SPA		12	0	12	Thử kín đường ống nước ngưng tầng 2/Testing sealing water pipe floor2	\N	0	DONE	2026-09-07	2026-09-07	2026-09-07	2026-09-07	1	9	615	2026-09-08 04:38:35.698105	\N	\N	610
3618	1	12	MEP-BTE-CSP-HPV-2BR		0	0	13	TỔNG TIẾN ĐỘ THI CÔNG	\N	\N	DONE	2026-03-26	2026-03-26	2026-09-02	2026-09-02	160	9	615	2026-09-08 04:38:33.91245	\N	\N	580
3848	1	19	MEP-BTE-CSP-VNR		0	0	13	TỔNG TIẾN ĐỘ THI CÔNG	\N	0.2	DONE	2026-01-29	2026-01-29	2026-11-22	2026-11-23	297	9	615	2026-09-08 04:38:36.92328	\N	\N	844
4951	1	6	TĐ . BULTER	I	3	0	3	Kiểm tra thử áp đường ống cấp nước/ Testing pressure of drainpipe	\N	0	PENDING	2026-07-03	\N	2026-07-05	\N	3	9	615	2026-09-23 21:47:02.550897	\N	YES	1034
3821	1	18	MEP-BTE-CSP-RES-4BR		2	0	2	Thi công lắp đặt ống đồng và bảo ôn tầng T2/Installing copper pipe and heat insulation floor2	\N	0	DONE	2026-08-12	2026-08-12	2026-08-12	2026-08-12	1	9	615	2026-09-08 04:38:36.505859	\N	\N	634
3805	1	17	MEP-BTE-CSP-RES- 3BR		0	0	32	Thử áp đường ống đồng tầng T2/Testing pressure copper pipe floor2	\N	0	DONE	2026-08-14	2026-08-14	2026-08-14	2026-08-14	1	9	615	2026-09-08 04:38:36.138077	\N	\N	709
3642	1	13	MEP-BTE-CSP-INF		1	0	1	Thi công đào, lấp đất/Excavation, backfill(cấp nước)	\N	0.35	DONE	2026-02-21	2026-02-21	2026-04-21	2026-04-21	60	9	615	2026-09-08 04:38:34.529275	\N	\N	623
3493	1	40	MEP-BTE-CSP-BSC		6	0	6	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	0.15	DONE	2026-06-25	2026-06-25	2026-06-25	2026-06-25	1	9	615	2026-09-08 04:38:31.013787	\N	\N	478
3562	1	8	MEP-BTE-CSP-CLU		4	0	4	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	1	DONE	2026-07-26	2026-07-26	2026-07-26	2026-07-26	1	9	615	2026-09-08 04:38:32.414212	\N	\N	519
3563	1	8	MEP-BTE-CSP-CLU		5	0	5	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	1	DONE	2026-07-28	2026-07-28	2026-07-28	2026-07-28	1	9	615	2026-09-08 04:38:32.418224	\N	\N	520
3603	1	11	MEP-BTE-CSP-HPV-1BR		4	0	4	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	0.2	DONE	2026-06-06	2026-06-06	2026-06-06	2026-06-06	1	9	615	2026-09-08 04:38:33.326733	\N	\N	541
3529	1	41	MEP-BTE-CSP-BUT		5	0	5	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	0.9	DONE	2026-06-15	2026-06-15	2026-06-15	2026-06-15	1	9	615	2026-09-08 04:38:31.955117	\N	\N	500
3624	1	12	MEP-BTE-CSP-HPV-2BR		4	0	4	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	0.35	DONE	2026-06-06	2026-06-06	2026-06-07	2026-06-07	2	9	615	2026-09-08 04:38:33.931227	\N	\N	551
3601	1	11	MEP-BTE-CSP-HPV-1BR		2	0	2	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	0.2	DONE	2026-06-09	2026-06-09	2026-06-09	2026-06-09	1	9	615	2026-09-08 04:38:33.319089	\N	\N	539
3544	1	41	MEP-BTE-CSP-BUT	B	0	0	35	BEACH SPORT	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-08 04:38:31.997907	\N	\N	840
3737	1	14	MEP-BTE-CSP-KID		2	0	2	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	0.35	DONE	2026-08-06	2026-06-23	2026-08-06	2026-06-23	1	9	615	2026-09-08 04:38:35.181534	\N	\N	576
5048	1	10	TĐ HPV 1- BR	I	0	0	17	Hệ thống cấp thoát nước/Water supply and drainage system(1-13)	\N	\N	PENDING	2026-05-12	\N	2026-09-17	\N	\N	9	615	2026-09-23 21:47:03.395848	\N	\N	1131
3540	1	41	MEP-BTE-CSP-BUT		8	0	8	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	0.9	DONE	2026-06-15	2026-06-15	2026-06-15	2026-06-15	1	9	615	2026-09-08 04:38:31.98651	\N	\N	503
3360	1	1	MEP-BTE-CSP-BOH		9	0	9	Thi công lắp đặt ống luồn dây tiến hiệu và điều khiển tầng T2/Installing signal of conduit and controlling floor3	\N	1	DONE	2026-06-29	2026-06-29	2026-07-03	2026-07-03	5	9	615	2026-09-08 04:38:29.292308	\N	\N	438
5874	1	9	TĐ BOH	I.	0	0	14	0.55	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.198992	\N	\N	1956
3794	1	17	MEP-BTE-CSP-RES- 3BR		6	0	6	Lắp đặt thiết bị điều khiển tầng T2/Installing controling equipment floor2	\N	0	DONE	2026-08-26	2026-08-26	2026-08-26	2026-08-26	1	9	615	2026-09-08 04:38:36.11339	\N	\N	630
3511	1	6	MEP-BTE-CSP-BUT		3	0	3	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	0.1	DONE	2026-06-02	2026-06-02	2026-06-04	2026-06-04	3	9	615	2026-09-08 04:38:31.421192	\N	\N	486
3371	1	1	MEP-BTE-CSP-BOH		20	0	20	Lắp đặt thiết bị điều hòa không khí tầng T2/Installing air conditional equipment floor2	\N	1	DONE	2026-07-07	2026-07-07	2026-07-09	2026-07-07	3	9	615	2026-09-08 04:38:29.328421	\N	\N	451
3881	1	45	MEP-BTE-CSP-KID		9	0	9	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	0	DONE	2026-08-31	2026-07-19	2026-08-31	2026-07-19	1	9	615	2026-09-08 07:55:46.604374	\N	\N	432
3882	1	45	MEP-BTE-CSP-KID		10	0	10	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	0.35	DONE	2026-10-15	2026-09-21	2026-10-15	2026-09-21	1	9	615	2026-09-08 07:55:46.613289	\N	\N	433
3619	1	12	MEP-BTE-CSP-HPV-2BR		0	0	14	Công tác chuẩn bị	\N	1	DONE	2026-05-19	2026-05-19	2026-05-21	2026-05-21	3	9	615	2026-09-08 04:38:33.916027	\N	\N	661
4956	1	6	TĐ . BULTER	II	1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	0	PENDING	2026-07-04	\N	2026-07-05	\N	2	9	615	2026-09-23 21:47:02.580054	\N	YES	1039
3815	1	17	MEP-BTE-CSP-RES- 3BR		8	0	8	Lắp đặt cửa gió tầng T2/Installing air diffuser floor2	\N	0	DONE	2026-10-04	2026-10-04	2026-10-04	2026-10-04	1	9	615	2026-09-08 04:38:36.161798	\N	\N	604
3834	1	18	MEP-BTE-CSP-RES-4BR		8	0	8	Thi công lắp đặt ống luồn dây tiến hiệu và điều khiển tầng T2/Installing signal of conduit and controlling floor2	\N	0	DONE	2026-08-12	2026-08-12	2026-08-12	2026-08-12	1	9	615	2026-09-08 04:38:36.539938	\N	\N	639
3795	1	17	MEP-BTE-CSP-RES- 3BR	II	0	0	22	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	DONE	2026-07-15	2026-07-15	2026-10-06	2026-10-06	\N	9	615	2026-09-08 04:38:36.115931	\N	\N	701
3504	1	40	MEP-BTE-CSP-BSC		10	0	10	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	0.15	DONE	2026-09-21	2026-09-21	2026-09-21	2026-09-21	1	9	615	2026-09-08 04:38:31.047575	\N	\N	482
3849	1	19	MEP-BTE-CSP-VNR		0	0	14	Công tác chuẩn bị	\N	1	DONE	2026-05-19	2026-05-19	2026-05-21	2026-05-21	3	9	615	2026-09-08 04:38:36.926319	\N	\N	843
3326	1	1	MEP-BTE-CSP-BOH		5	0	5	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T2/Installing sealing water pipe and heat insulation floor2	\N	1	DONE	2026-03-31	2026-03-31	2026-04-04	2026-04-04	5	9	615	2026-09-08 04:38:29.164588	\N	\N	537
4808	1	1	TĐ .BOH	A	12	0	12	Thử kín đường ống nước ngưng tầng T2/Testing sealing water pipe floor2	\N	0	PENDING	2026-04-12	\N	2026-04-12	\N	1	9	615	2026-09-23 21:47:01.46433	\N	YES	891
4866	1	1	TĐ .BOH	D	4	0	4	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	0	PENDING	2026-03-29	\N	2026-03-29	\N	1	9	615	2026-09-23 21:47:01.792974	\N	YES	949
4841	1	1	TĐ .BOH	C	1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	0	PENDING	2026-06-20	\N	2026-06-21	\N	2	9	615	2026-09-23 21:47:01.650564	\N	YES	924
3759	1	15	MEP-BTE-CSP-LOB & SPA		3	0	3	Thi công lắp đặt ống nước ngưng và bảo ôn tầng 1/Installing sealing water pipe and heat insulation floor 1	\N	1	DONE	2026-08-23	2026-08-23	2026-08-30	2026-08-30	8	9	615	2026-09-08 04:38:35.658245	\N	\N	605
3819	1	18	MEP-BTE-CSP-RES-4BR		15	0	15	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	0	DONE	2026-08-22	2026-08-22	2026-08-22	2026-08-22	1	9	615	2026-09-08 04:38:36.500784	\N	\N	646
3323	1	1	MEP-BTE-CSP-BOH		2	0	2	Thi công lắp đặt ống đồng và bảo ôn tầng T2/Installing copper pipe and heat insulation floor2	\N	1	DONE	2026-06-23	2026-06-23	2026-06-27	2026-06-27	5	9	615	2026-09-08 04:38:29.154154	\N	\N	512
5010	1	8	TĐ .CLUSTER VILLA	II	2	0	2	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	0	PENDING	2026-07-19	\N	2026-07-19	\N	1	9	615	2026-09-23 21:47:03.040988	\N	YES	1093
3648	1	13	MEP-BTE-CSP-INF		7	0	7	Gia công lắp đặt nghiệm thu cốp pha hố ga tuyến D7	\N	0.6	IN_PROGRESS	2026-02-19	2026-03-10	2026-02-26	\N	8	9	615	2026-09-08 04:38:34.54508	\N	\N	586
4767	1	1	TĐ .BOH	I	0	0	17	Hệ thống cấp thoát nước/Water supply and drainage system(Basement)( Phần âm)	\N	0	PENDING	2026-01-19	\N	2026-07-17	\N	\N	9	615	2026-09-23 21:47:01.215529	\N	\N	850
3751	1	14	MEP-BTE-CSP-KID		9	0	9	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	0	DONE	2026-08-31	2026-07-19	2026-08-31	2026-07-19	1	9	615	2026-09-08 04:38:35.231189	\N	\N	593
3469	1	4	MEP-BTE-CSP-BPV-2BR		3	0	3	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	1	DONE	2026-06-17	2026-06-17	2026-06-20	2026-06-20	4	9	615	2026-09-08 04:38:30.396302	\N	\N	458
3466	1	4	MEP-BTE-CSP-BPV-2BR	I	0	0	15	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	DONE	2026-04-06	2026-04-06	2026-10-13	2026-10-13	\N	9	615	2026-09-08 04:38:30.387027	\N	\N	674
4886	1	1	TĐ .BOH	D	24	0	24	Lắp đặt thiết bị điều khiển tầng T2/Installing controling equipment floor3	\N	0	PENDING	2026-07-09	\N	2026-07-09	\N	1	9	615	2026-09-23 21:47:01.909616	\N	YES	969
4881	1	1	TĐ .BOH	D	19	0	19	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	0	PENDING	2026-07-05	\N	2026-07-06	\N	2	9	615	2026-09-23 21:47:01.881868	\N	YES	964
4826	1	1	TĐ .BOH	B	8	0	8	Thi công lắp đặt ống luồn dây tiến hiệu và điều khiển tầng T2/Installing signal of conduit and controlling floor2	\N	0	PENDING	2026-05-01	\N	2026-05-03	\N	3	9	615	2026-09-23 21:47:01.566762	\N	YES	909
4832	1	1	TĐ .BOH	B	14	0	14	Lắp đặt thiết bị quạt thông gió tầng T2/Installing air duct fan equipment floor2	\N	0	PENDING	2026-04-22	\N	2026-04-22	\N	1	9	615	2026-09-23 21:47:01.600133	\N	YES	915
4844	1	1	TĐ .BOH	C	4	0	4	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T2/Installing sealing water pipe and heat insulation floor2	\N	0	PENDING	2026-04-01	\N	2026-04-02	\N	2	9	615	2026-09-23 21:47:01.66717	\N	YES	927
3822	1	18	MEP-BTE-CSP-RES-4BR		3	0	3	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	0	DONE	2026-08-09	2026-08-09	2026-08-10	2026-08-10	2	9	615	2026-09-08 04:38:36.509208	\N	\N	635
5866	1	9	TĐ LOBY	I.	1	0	1	0.25	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.156732	\N	\N	1948
5063	1	10	TĐ HPV 1- BR	II	8	0	8	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	0	PENDING	2026-06-07	\N	2026-06-07	\N	1	9	615	2026-09-23 21:47:03.490381	\N	YES	1146
3770	1	15	MEP-BTE-CSP-LOB & SPA		7	0	7	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng 1/Installing signal of conduit and controlling floor 1	\N	1	DONE	2026-08-23	2026-08-23	2026-08-25	2026-08-25	3	9	615	2026-09-08 04:38:35.687428	\N	\N	606
3505	1	40	MEP-BTE-CSP-BSC		11	0	11	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	0	DONE	2026-09-23	2026-09-23	2026-09-23	2026-09-23	1	9	615	2026-09-08 04:38:31.050052	\N	\N	483
3742	1	14	MEP-BTE-CSP-KID	II	0	0	22	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	DONE	2026-07-06	2026-05-22	2026-10-17	2026-09-23	\N	9	615	2026-09-08 04:38:35.1993	\N	\N	699
3324	1	1	MEP-BTE-CSP-BOH		3	0	3	Thi công lắp đặt ống đồng và bảo ôn tầng mái/Installing copper pipe and heat insulation floor3	\N	1	DONE	2026-06-29	2026-06-29	2026-07-03	2026-07-03	5	9	615	2026-09-08 04:38:29.157064	\N	\N	513
5006	1	8	TĐ .CLUSTER VILLA	I	5	0	5	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	0	PENDING	2026-09-22	\N	2026-10-01	\N	10	9	615	2026-09-23 21:47:03.018648	\N	YES	1089
5246	1	17	TĐ RES- 3BR		9	0	9	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	0	PENDING	2026-10-06	\N	2026-10-06	\N	1	9	615	2026-09-23 21:47:04.964346	\N	YES	1329
5247	1	18	TĐ RES- 4BR	A	0	0	15	RES- 4 BR	\N	\N	PENDING	2026-06-18	\N	2026-10-21	\N	\N	9	615	2026-09-23 21:47:05.031445	\N	\N	1330
5087	1	13	TĐ INF	A	0	0	15	Hạ Tầng	\N	\N	PENDING	2026-02-07	\N	2026-11-02	\N	\N	9	615	2026-09-23 21:47:03.789541	\N	\N	1170
3814	1	17	MEP-BTE-CSP-RES- 3BR		7	0	7	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	0	DONE	2026-10-04	2026-10-04	2026-10-04	2026-10-04	1	9	615	2026-09-08 04:38:36.159488	\N	\N	631
3524	1	41	MEP-BTE-CSP-BUT	I	0	0	15	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	DONE	2026-02-14	2026-02-14	2026-10-12	2026-10-12	\N	9	615	2026-09-08 04:38:31.938356	\N	\N	678
4836	1	1	TĐ .BOH	B	18	0	18	Lắp đặt thiết bị điều khiển tầng T2/Installing controling equipment floor2	\N	0	PENDING	2026-06-24	\N	2026-06-24	\N	1	9	615	2026-09-23 21:47:01.622187	\N	YES	919
4876	1	1	TĐ .BOH	D	14	0	14	Thử kín đường ống nước ngưng tầng T2/Testing sealing water pipe floor2	\N	0	PENDING	2026-04-06	\N	2026-04-06	\N	1	9	615	2026-09-23 21:47:01.853328	\N	YES	959
4874	1	1	TĐ .BOH	D	12	0	12	Thử áp đường ống đồng tầng T3/Testing pressure copper pipe floor2	\N	0	PENDING	2026-07-05	\N	2026-07-05	\N	1	9	615	2026-09-23 21:47:01.841873	\N	YES	957
4950	1	6	TĐ . BULTER	I	2	0	2	Thi công lắp đặt đường ống thoát nước/Installing drainpipe	\N	0	PENDING	2026-05-12	\N	2026-05-16	\N	5	9	615	2026-09-23 21:47:02.545122	\N	YES	1033
3643	1	13	MEP-BTE-CSP-INF		2	0	2	Thi công hệ thống ống âm đất (cấp nước, )Underground pipe system execution(water supply, drainage, sewage)	\N	0.35	DONE	2026-03-03	2026-03-03	2026-07-25	2026-06-20	145	9	615	2026-09-08 04:38:34.531822	\N	\N	585
3620	1	12	MEP-BTE-CSP-HPV-2BR	I	0	0	15	Hệ thống cấp thoát nước/Water supply and drainage system(14-26)	\N	\N	DONE	2026-03-26	2026-03-26	2026-09-02	2026-09-02	\N	9	615	2026-09-08 04:38:33.918779	\N	\N	687
4949	1	6	TĐ . BULTER	I	1	0	1	Thi công lắp đặt đường ống cấp nước /Installing water pipe	\N	0	PENDING	2026-06-23	\N	2026-07-02	\N	10	9	615	2026-09-23 21:47:02.538654	\N	YES	1032
4955	1	6	TĐ . BULTER	II	0	0	24	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	PENDING	2026-06-02	\N	2026-10-04	\N	\N	9	615	2026-09-23 21:47:02.574352	\N	\N	1038
4953	1	6	TĐ . BULTER	I	5	0	5	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	0	PENDING	2026-09-20	\N	2026-09-26	\N	7	9	615	2026-09-23 21:47:02.563425	\N	YES	1036
4958	1	6	TĐ . BULTER	II	3	0	3	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	0	PENDING	2026-06-02	\N	2026-06-04	\N	3	9	615	2026-09-23 21:47:02.590529	\N	YES	1041
4961	1	6	TĐ . BULTER	II	6	0	6	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	0	PENDING	2026-07-06	\N	2026-07-06	\N	1	9	615	2026-09-23 21:47:02.606644	\N	YES	1044
4965	1	6	TĐ . BULTER	II	10	0	10	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	0	PENDING	2026-10-02	\N	2026-10-02	\N	1	9	615	2026-09-23 21:47:02.628892	\N	YES	1048
4954	1	6	TĐ . BULTER	I	6	0	6	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	0	PENDING	2026-09-24	\N	2026-09-26	\N	3	9	615	2026-09-23 21:47:02.569241	\N	YES	1037
4964	1	6	TĐ . BULTER	II	9	0	9	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	0	PENDING	2026-07-29	\N	2026-07-29	\N	1	9	615	2026-09-23 21:47:02.622829	\N	YES	1047
5009	1	8	TĐ .CLUSTER VILLA	II	1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	0	PENDING	2026-07-26	\N	2026-07-26	\N	1	9	615	2026-09-23 21:47:03.035497	\N	YES	1092
5838	1	9	TĐ HPV-1 BR	I.	0	0	14	0.55	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:48.986602	\N	\N	1920
5857	1	9	TĐ BUSINESS	I.	1	0	1	0.25	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.105355	\N	\N	1939
3650	1	13	MEP-BTE-CSP-INF		9	0	9	Nghiêm thu công tác đổ bê tông hố ga tuyến D7	\N	0.6	IN_PROGRESS	2026-02-24	2026-03-12	2026-03-03	\N	8	9	615	2026-09-08 04:38:34.550245	\N	\N	588
3812	1	17	MEP-BTE-CSP-RES- 3BR		0	0	39	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	0	DONE	2026-08-26	2026-08-26	2026-08-26	2026-08-26	1	9	615	2026-09-08 04:38:36.154229	\N	\N	842
3825	1	18	MEP-BTE-CSP-RES-4BR		6	0	6	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T2/Installing air duct and heat insulation floor2	\N	0	DONE	2026-07-19	2026-07-19	2026-07-19	2026-07-19	1	9	615	2026-09-08 04:38:36.516728	\N	\N	637
3804	1	17	MEP-BTE-CSP-RES- 3BR		0	0	31	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	0	DONE	2026-08-12	2026-08-12	2026-08-12	2026-08-12	1	9	615	2026-09-08 04:38:36.135972	\N	\N	708
3527	1	41	MEP-BTE-CSP-BUT		3	0	3	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	0.9	DONE	2026-05-07	2026-05-07	2026-05-08	2026-05-08	2	9	615	2026-09-08 04:38:31.947927	\N	\N	499
3559	1	8	MEP-BTE-CSP-CLU		1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	1	DONE	2026-07-26	2026-07-26	2026-07-26	2026-07-26	1	9	615	2026-09-08 04:38:32.404254	\N	\N	516
5011	1	8	TĐ .CLUSTER VILLA	II	3	0	3	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	0	PENDING	2026-07-16	\N	2026-07-17	\N	2	9	615	2026-09-23 21:47:03.047596	\N	YES	1094
3487	1	40	MEP-BTE-CSP-BSC	I	0	0	15	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	DONE	2026-05-12	2026-05-12	2026-09-26	2026-09-26	\N	9	615	2026-09-08 04:38:30.995004	\N	\N	676
4867	1	1	TĐ .BOH	D	5	0	5	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T2/Installing sealing water pipe and heat insulation floor2	\N	0	PENDING	2026-03-31	\N	2026-04-04	\N	5	9	615	2026-09-23 21:47:01.798547	\N	YES	950
4848	1	1	TĐ .BOH	C	8	0	8	Thi công lắp đặt ống luồn dây tiến hiệu và điều khiển tầng T2/Installing signal of conduit and controlling floor2	\N	0	PENDING	2026-05-04	\N	2026-05-06	\N	3	9	615	2026-09-23 21:47:01.689459	\N	YES	931
3444	1	3	MEP-BTE-CSP-BPV-1BR		0	0	14	Công tác chuẩn bị	\N	1	DONE	2026-05-19	2026-05-19	2026-05-21	2026-05-21	3	9	615	2026-09-08 04:38:29.946282	\N	\N	561
3512	1	6	MEP-BTE-CSP-BUT		4	0	4	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	0.1	DONE	2026-07-04	2026-07-04	2026-07-05	2026-07-05	2	9	615	2026-09-08 04:38:31.42645	\N	\N	487
3482	1	4	MEP-BTE-CSP-BPV-2BR		9	0	9	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	0.95	DONE	2026-06-02	2026-06-02	2026-06-02	2026-06-02	1	9	615	2026-09-08 04:38:30.43594	\N	\N	470
3327	1	1	MEP-BTE-CSP-BOH		21	0	21	Lắp đặt thiết bị điều hòa không khí tầng mái/Installing air conditional equipment rooftop	\N	1	DONE	2026-07-10	2026-07-10	2026-07-12	2026-07-10	3	9	615	2026-09-08 04:38:29.168153	\N	\N	514
3801	1	17	MEP-BTE-CSP-RES- 3BR		0	0	28	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T2/Installing air duct and heat insulation floor2	\N	0	DONE	2026-07-19	2026-07-19	2026-07-19	2026-07-19	1	9	615	2026-09-08 04:38:36.129462	\N	\N	705
4854	1	1	TĐ .BOH	C	14	0	14	Lắp đặt thiết bị quạt thông gió tầng T2/Installing air duct fan equipment floor2	\N	0	PENDING	2026-04-22	\N	2026-04-23	\N	2	9	615	2026-09-23 21:47:01.723654	\N	YES	937
5853	1	9	TĐ FITNES	I.	0	0	14	0.55	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.082383	\N	\N	1935
5855	1	9	TĐ FITNES	I.	2	0	2	0.3	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.093307	\N	\N	1937
5068	1	10	TĐ HPV 2- BR	I	0	0	17	Hệ thống cấp thoát nước/Water supply and drainage system(14-26)	\N	\N	PENDING	2026-03-26	\N	2026-09-02	\N	\N	9	615	2026-09-23 21:47:03.574506	\N	\N	1151
5071	1	10	TĐ HPV 2- BR	I	3	0	3	Kiểm tra thử áp đường ống cấp nước/ Testing pressure of drainpipe	\N	0	PENDING	2026-07-03	\N	2026-07-05	\N	3	9	615	2026-09-23 21:47:03.592114	\N	YES	1154
5085	1	10	TĐ HPV 2- BR	II	10	0	10	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	0	PENDING	2026-08-20	\N	2026-08-20	\N	1	9	615	2026-09-23 21:47:03.67369	\N	YES	1168
5076	1	10	TĐ HPV 2- BR	II	1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	0	PENDING	2026-06-06	\N	2026-06-07	\N	2	9	615	2026-09-23 21:47:03.621289	\N	YES	1159
4803	1	1	TĐ .BOH	A	7	0	7	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	0	PENDING	2026-05-01	\N	2026-05-01	\N	1	9	615	2026-09-23 21:47:01.435673	\N	YES	886
4957	1	6	TĐ . BULTER	II	2	0	2	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	0	PENDING	2026-07-04	\N	2026-07-04	\N	1	9	615	2026-09-23 21:47:02.585514	\N	YES	1040
3836	1	18	MEP-BTE-CSP-RES-4BR		10	0	10	Thử áp đường ống đồng tầng T2/Testing pressure copper pipe floor2	\N	0	DONE	2026-08-14	2026-08-14	2026-08-14	2026-08-14	1	9	615	2026-09-08 04:38:36.545413	\N	\N	641
5023	1	8	TĐ .CLUSTER VILLA	II	8	0	8	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	0	PENDING	2026-07-30	\N	2026-07-30	\N	1	9	615	2026-09-23 21:47:03.116635	\N	YES	1106
3367	1	1	MEP-BTE-CSP-BOH		16	0	16	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	1	DONE	2026-07-05	2026-07-05	2026-07-06	2026-07-06	2	9	615	2026-09-08 04:38:29.316499	\N	\N	443
3488	1	40	MEP-BTE-CSP-BSC		1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	0.15	DONE	2026-06-23	2026-06-23	2026-06-24	2026-06-24	2	9	615	2026-09-08 04:38:30.998276	\N	\N	473
5080	1	10	TĐ HPV 2- BR	II	5	0	5	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	0	PENDING	2026-06-09	\N	2026-06-09	\N	1	9	615	2026-09-23 21:47:03.645599	\N	YES	1163
5079	1	10	TĐ HPV 2- BR	II	4	0	4	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	0	PENDING	2026-06-06	\N	2026-06-07	\N	2	9	615	2026-09-23 21:47:03.639568	\N	YES	1162
5073	1	10	TĐ HPV 2- BR	I	5	0	5	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	0	PENDING	2026-08-27	\N	2026-09-02	\N	7	9	615	2026-09-23 21:47:03.603863	\N	YES	1156
5074	1	10	TĐ HPV 2- BR	I	6	0	6	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	0	PENDING	2026-08-31	\N	2026-09-02	\N	3	9	615	2026-09-23 21:47:03.60928	\N	YES	1157
5072	1	10	TĐ HPV 2- BR	I	4	0	4	Kiểm tra thử kín đường ống thoát nước/Testing drainpipe	\N	0	PENDING	2026-03-31	\N	2026-04-02	\N	3	9	615	2026-09-23 21:47:03.59811	\N	YES	1155
3792	1	17	MEP-BTE-CSP-RES- 3BR		4	0	4	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T2/Installing sealing water pipe and heat insulation floor2	\N	0	DONE	2026-08-12	2026-08-12	2026-08-12	2026-08-12	1	9	615	2026-09-08 04:38:36.108513	\N	\N	628
5061	1	10	TĐ HPV 1- BR	II	6	0	6	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	0	PENDING	2026-06-11	\N	2026-06-11	\N	1	9	615	2026-09-23 21:47:03.478657	\N	YES	1144
5055	1	10	TĐ HPV 1- BR	II	0	0	24	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	PENDING	2026-06-01	\N	2026-08-22	\N	\N	9	615	2026-09-23 21:47:03.438194	\N	\N	1138
5064	1	10	TĐ HPV 1- BR	II	9	0	9	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	0	PENDING	2026-06-07	\N	2026-06-07	\N	1	9	615	2026-09-23 21:47:03.496298	\N	YES	1147
5051	1	10	TĐ HPV 1- BR	I	3	0	3	Kiểm tra thử áp đường ống cấp nước/ Testing pressure of drainpipe	\N	0	PENDING	2026-06-01	\N	2026-06-07	\N	7	9	615	2026-09-23 21:47:03.41378	\N	YES	1134
5056	1	10	TĐ HPV 1- BR	II	1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	0	PENDING	2026-06-06	\N	2026-06-07	\N	2	9	615	2026-09-23 21:47:03.444556	\N	YES	1139
5059	1	10	TĐ HPV 1- BR	II	4	0	4	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	0	PENDING	2026-06-06	\N	2026-06-06	\N	1	9	615	2026-09-23 21:47:03.465436	\N	YES	1142
5058	1	10	TĐ HPV 1- BR	II	3	0	3	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	0	PENDING	2026-06-01	\N	2026-06-05	\N	5	9	615	2026-09-23 21:47:03.459676	\N	YES	1141
5062	1	10	TĐ HPV 1- BR	II	7	0	7	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	0	PENDING	2026-06-07	\N	2026-06-07	\N	1	9	615	2026-09-23 21:47:03.485123	\N	YES	1145
5066	1	10	TĐ HPV 1- BR	II	11	0	11	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	0	PENDING	2026-08-22	\N	2026-08-22	\N	1	9	615	2026-09-23 21:47:03.507594	\N	YES	1149
5050	1	10	TĐ HPV 1- BR	I	2	0	2	Thi công lắp đặt đường ống thoát nước/Installing drainpipe	\N	0	PENDING	2026-05-31	\N	2026-06-04	\N	5	9	615	2026-09-23 21:47:03.408093	\N	YES	1133
5053	1	10	TĐ HPV 1- BR	I	5	0	5	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	0	PENDING	2026-08-29	\N	2026-09-17	\N	20	9	615	2026-09-23 21:47:03.425147	\N	YES	1136
5065	1	10	TĐ HPV 1- BR	II	10	0	10	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	0	PENDING	2026-08-20	\N	2026-08-20	\N	1	9	615	2026-09-23 21:47:03.502358	\N	YES	1148
3368	1	1	MEP-BTE-CSP-BOH		17	0	17	Lắp đặt thiết bị quạt thông gió tầng T2/Installing air duct fan equipment floor2	\N	1	DONE	2026-07-05	2026-07-05	2026-07-06	2026-07-06	2	9	615	2026-09-08 04:38:29.31968	\N	\N	448
3852	1	19	MEP-BTE-CSP-VNR		2	0	2	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	1	DONE	2026-06-03	2026-06-03	2026-06-03	2026-06-03	1	9	615	2026-09-08 04:38:36.936666	\N	\N	655
5047	1	10	TĐ HPV 1- BR	A	0	0	15	HPV-1BR	\N	\N	PENDING	2026-05-12	\N	2026-09-17	\N	\N	9	615	2026-09-23 21:47:03.389402	\N	\N	1130
5060	1	10	TĐ HPV 1- BR	II	5	0	5	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	0	PENDING	2026-06-09	\N	2026-06-09	\N	1	9	615	2026-09-23 21:47:03.472153	\N	YES	1143
5227	1	17	TĐ RES- 3BR	II	2	0	2	Thi công lắp đặt ống đồng và bảo ôn tầng T2/Installing copper pipe and heat insulation floor2	\N	0	PENDING	2026-08-12	\N	2026-08-12	\N	1	9	615	2026-09-23 21:47:04.85999	\N	YES	1310
5049	1	10	TĐ HPV 1- BR	I	1	0	1	Thi công lắp đặt đường ống cấp nước /Installing water pipe	\N	0	PENDING	2026-05-12	\N	2026-05-31	\N	20	9	615	2026-09-23 21:47:03.401531	\N	YES	1132
3335	1	1	MEP-BTE-CSP-BOH	IV	0	0	29	Hệ thống cấp thoát nước/Water supply and drainage system(Zone B)	\N	1	DONE	2026-05-08	2026-05-08	2026-05-27	2026-05-27	\N	9	615	2026-09-08 04:38:29.199077	\N	\N	667
4838	1	1	TĐ .BOH	B	20	0	20	Lắp đặt cửa gió tầng T2/Installing air diffuser floor2	\N	0	PENDING	2026-06-26	\N	2026-06-26	\N	1	9	615	2026-09-23 21:47:01.633823	\N	YES	921
3735	1	14	MEP-BTE-CSP-KID	I	0	0	15	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	DONE	2026-06-01	2026-06-01	2026-10-21	2026-10-21	\N	9	615	2026-09-08 04:38:35.173041	\N	\N	697
3494	1	40	MEP-BTE-CSP-BSC	II	0	0	22	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	DONE	2026-05-22	2026-05-22	2026-09-23	2026-09-23	\N	9	615	2026-09-08 04:38:31.017409	\N	\N	521
3756	1	15	MEP-BTE-CSP-LOB & SPA		15	0	15	Lắp đặt nón che mua tầng mái/Installing air hat roof floor	\N	0.35	DONE	2026-08-29	2026-08-29	2026-08-30	2026-08-30	2	9	615	2026-09-08 04:38:35.649749	\N	\N	602
5243	1	17	TĐ RES- 3BR		6	0	6	Lắp đặt thiết bị điều khiển tầng T2/Installing controling equipment floor2	\N	0	PENDING	2026-08-26	\N	2026-08-26	\N	1	9	615	2026-09-23 21:47:04.948824	\N	YES	1326
3593	1	42	MEP-BTE-CSP-FIT		7	0	7	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	0.15	DONE	2026-08-31	2026-07-18	2026-08-31	2026-07-18	1	9	615	2026-09-08 04:38:32.850303	\N	\N	534
5845	1	9	TĐ CUL	I.	1	0	1	0.25	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 22:09:49.035604	\N	\N	1927
5236	1	17	TĐ RES- 3BR		0	0	35	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	0	PENDING	2026-08-12	\N	2026-08-12	\N	1	9	615	2026-09-23 21:47:04.911789	\N	YES	1319
5232	1	17	TĐ RES- 3BR		0	0	31	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	0	PENDING	2026-08-09	\N	2026-08-10	\N	2	9	615	2026-09-23 21:47:04.887731	\N	YES	1315
5262	1	18	TĐ RES- 4BR	II	7	0	7	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	0	PENDING	2026-08-09	\N	2026-08-10	\N	2	9	615	2026-09-23 21:47:05.11299	\N	YES	1345
5269	1	18	TĐ RES- 4BR	II	14	0	14	Lắp đặt thiết bị quạt thông gió tầng T2/Installing air duct fan equipment floor2	\N	0	PENDING	2026-08-25	\N	2026-08-25	\N	1	9	615	2026-09-23 21:47:05.150402	\N	YES	1352
5252	1	18	TĐ RES- 4BR	I	4	0	4	Kiểm tra thử kín đường ống thoát nước/Testing drainpipe	\N	0	PENDING	2026-06-23	\N	2026-06-25	\N	3	9	615	2026-09-23 21:47:05.058704	\N	YES	1335
5255	1	18	TĐ RES- 4BR	II	0	0	24	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	PENDING	2026-07-15	\N	2026-10-06	\N	\N	9	615	2026-09-23 21:47:05.074636	\N	\N	1338
5261	1	18	TĐ RES- 4BR	II	6	0	6	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T2/Installing air duct and heat insulation floor2	\N	0	PENDING	2026-07-19	\N	2026-07-19	\N	1	9	615	2026-09-23 21:47:05.107438	\N	YES	1344
5253	1	18	TĐ RES- 4BR	I	5	0	5	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	0	PENDING	2026-10-15	\N	2026-10-21	\N	7	9	615	2026-09-23 21:47:05.063761	\N	YES	1336
5254	1	18	TĐ RES- 4BR	I	6	0	6	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	0	PENDING	2026-10-19	\N	2026-10-21	\N	3	9	615	2026-09-23 21:47:05.068872	\N	YES	1337
5259	1	18	TĐ RES- 4BR	II	4	0	4	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T2/Installing sealing water pipe and heat insulation floor2	\N	0	PENDING	2026-08-12	\N	2026-08-12	\N	1	9	615	2026-09-23 21:47:05.096009	\N	YES	1342
5251	1	18	TĐ RES- 4BR	I	3	0	3	Kiểm tra thử áp đường ống cấp nước/ Testing pressure of drainpipe	\N	0	PENDING	2026-08-19	\N	2026-08-21	\N	3	9	615	2026-09-23 21:47:05.053055	\N	YES	1334
5273	1	18	TĐ RES- 4BR	II	18	0	18	Lắp đặt thiết bị điều khiển tầng T2/Installing controling equipment floor2	\N	0	PENDING	2026-08-26	\N	2026-08-26	\N	1	9	615	2026-09-23 21:47:05.174775	\N	YES	1356
5258	1	18	TĐ RES- 4BR	II	3	0	3	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	0	PENDING	2026-08-09	\N	2026-08-10	\N	2	9	615	2026-09-23 21:47:05.090888	\N	YES	1341
5270	1	18	TĐ RES- 4BR	II	15	0	15	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	0	PENDING	2026-08-22	\N	2026-08-22	\N	1	9	615	2026-09-23 21:47:05.155624	\N	YES	1353
5275	1	18	TĐ RES- 4BR	II	20	0	20	Lắp đặt cửa gió tầng T2/Installing air diffuser floor2	\N	0	PENDING	2026-10-04	\N	2026-10-04	\N	1	9	615	2026-09-23 21:47:05.190402	\N	YES	1358
5276	1	18	TĐ RES- 4BR	II	21	0	21	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	0	PENDING	2026-10-06	\N	2026-10-06	\N	1	9	615	2026-09-23 21:47:05.196657	\N	YES	1359
5249	1	18	TĐ RES- 4BR	I	1	0	1	Thi công lắp đặt đường ống cấp nước /Installing water pipe	\N	0	PENDING	2026-08-09	\N	2026-08-18	\N	10	9	615	2026-09-23 21:47:05.042777	\N	YES	1332
5266	1	18	TĐ RES- 4BR	II	11	0	11	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	0	PENDING	2026-08-12	\N	2026-08-12	\N	1	9	615	2026-09-23 21:47:05.134473	\N	YES	1349
4899	1	3	TĐ BPV 1- BR	II	3	0	3	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	\N	PENDING	2026-06-17	\N	2026-06-18	\N	2	9	615	2026-09-23 21:47:02.061726	\N	YES	982
4895	1	3	TĐ BPV 1- BR	I	6	0	6	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	\N	PENDING	2026-10-02	\N	2026-10-11	\N	10	9	615	2026-09-23 21:47:02.039185	\N	YES	978
4900	1	3	TĐ BPV 1- BR	II	4	0	4	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	PENDING	2026-06-01	\N	2026-06-02	\N	2	9	615	2026-09-23 21:47:02.067917	\N	YES	983
4903	1	3	TĐ BPV 1- BR	II	7	0	7	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	\N	PENDING	2026-06-20	\N	2026-06-20	\N	1	9	615	2026-09-23 21:47:02.084136	\N	YES	986
4892	1	3	TĐ BPV 1- BR	I	3	0	3	Kiểm tra thử áp đường ống cấp nước/ Testing pressure of drainpipe	\N	\N	PENDING	2026-06-23	\N	2026-07-02	\N	10	9	615	2026-09-23 21:47:02.022949	\N	YES	975
4896	1	3	TĐ BPV 1- BR	II	0	0	24	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	PENDING	2026-05-29	\N	2026-08-13	\N	\N	9	615	2026-09-23 21:47:02.04465	\N	\N	979
4906	1	3	TĐ BPV 1- BR		0	0	34	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	\N	PENDING	2026-08-12	\N	2026-08-12	\N	1	9	615	2026-09-23 21:47:02.100515	\N	YES	989
4893	1	3	TĐ BPV 1- BR	I	4	0	4	Kiểm tra thử kín đường ống thoát nước/Testing drainpipe	\N	\N	PENDING	2026-03-17	\N	2026-03-26	\N	10	9	615	2026-09-23 21:47:02.028224	\N	YES	976
4891	1	3	TĐ BPV 1- BR	I	2	0	2	Thi công lắp đặt đường ống thoát nước/Installing drainpipe	\N	0.05	IN_PROGRESS	2026-03-12	\N	2026-03-16	\N	5	9	615	2026-09-23 21:47:02.016683	\N	YES	974
4904	1	3	TĐ BPV 1- BR		0	0	32	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	\N	PENDING	2026-06-01	\N	2026-06-01	\N	1	9	615	2026-09-23 21:47:02.089522	\N	YES	987
4905	1	3	TĐ BPV 1- BR		0	0	33	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	\N	PENDING	2026-06-02	\N	2026-06-02	\N	1	9	615	2026-09-23 21:47:02.09513	\N	YES	988
4888	1	3	TĐ BPV 1- BR	A	0	0	15	BPV- 1BR	\N	\N	PENDING	2026-03-12	\N	2026-10-11	\N	\N	9	615	2026-09-23 21:47:01.999617	\N	\N	971
5091	1	13	TĐ INF	I	3	0	3	Thi công hệ thống valve, vòi, trụ/ Valve system, ejector, pillar installation	\N	0	PENDING	2026-05-28	\N	2026-07-11	\N	45	9	615	2026-09-23 21:47:03.813691	\N	YES	1174
5144	1	13	TĐ INF	VIII	2	0	2	Thi công hệ thống ống âm đất (cấp nước, thoát nước, thoát nước thải)Underground pipe system execution(water supply, drainage, sewage)	\N	0	PENDING	2026-03-09	\N	2026-06-01	\N	85	9	615	2026-09-23 21:47:04.114562	\N	YES	1227
5110	1	13	TĐ INF	IV	4	0	4	Kiểm tra hệ thống cấp thoát nước/testing water supply system	\N	0	PENDING	2026-04-10	\N	2026-06-13	\N	65	9	615	2026-09-23 21:47:03.926572	\N	YES	1193
5090	1	13	TĐ INF	I	2	0	2	Thi công hệ thống ống âm đất (cấp nước, thoát nước, thoát nước thải)Underground pipe system execution(water supply, drainage, sewage)	\N	0	PENDING	2026-02-16	\N	2026-06-05	\N	110	9	615	2026-09-23 21:47:03.807906	\N	YES	1173
5157	1	13	TĐ INF	B	3	0	3	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	0	PENDING	2026-06-01	\N	2026-06-05	\N	5	9	615	2026-09-23 21:47:04.190092	\N	YES	1240
5120	1	13	TĐ INF	V	8	0	8	Kiểm tra hệ thống cấp thoát nước/testing water supply system	\N	0	PENDING	2026-06-28	\N	2026-09-05	\N	70	9	615	2026-09-23 21:47:03.981445	\N	YES	1203
5160	1	13	TĐ INF	B	6	0	6	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	0	PENDING	2026-06-11	\N	2026-06-11	\N	1	9	615	2026-09-23 21:47:04.206101	\N	YES	1243
5164	1	13	TĐ INF	B	10	0	10	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	0	PENDING	2026-08-20	\N	2026-08-20	\N	1	9	615	2026-09-23 21:47:04.227446	\N	YES	1247
5098	1	13	TĐ INF	II	4	0	4	Kiểm tra hệ thống cấp thoát nước/testing water supply system	\N	0	PENDING	2026-03-23	\N	2026-04-06	\N	15	9	615	2026-09-23 21:47:03.854175	\N	YES	1181
5165	1	13	TĐ INF	B	11	0	11	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	0	PENDING	2026-08-22	\N	2026-08-22	\N	1	9	615	2026-09-23 21:47:04.233268	\N	YES	1248
5126	1	13	TĐ INF	VI	0	0	55	Hệ thống cấp thoát nước/Water supply and drainage system(D8)	\N	0	PENDING	2026-02-22	\N	2026-02-22	\N	\N	9	615	2026-09-23 21:47:04.013621	\N	YES	1209
5108	1	13	TĐ INF	IV	2	0	2	Thi công hệ thống ống âm đất (cấp nước, thoát nước, thoát nước thải)Underground pipe system execution(water supply, drainage, sewage)	\N	0	PENDING	2026-03-08	\N	2026-06-05	\N	90	9	615	2026-09-23 21:47:03.913926	\N	YES	1191
5136	1	13	TĐ INF	VII	0	0	66	Hệ thống cấp thoát nước/Water supply and drainage system(D4)	\N	0	PENDING	2026-02-22	\N	2026-02-22	\N	\N	9	615	2026-09-23 21:47:04.070633	\N	YES	1219
5094	1	13	TĐ INF	II	0	0	23	Hệ thống cấp thoát nước/Water supply and drainage system(N2-N3)	\N	0	PENDING	2026-02-07	\N	2026-02-07	\N	\N	9	615	2026-09-23 21:47:03.830095	\N	YES	1177
5162	1	13	TĐ INF	B	8	0	8	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	0	PENDING	2026-06-07	\N	2026-06-07	\N	1	9	615	2026-09-23 21:47:04.216568	\N	YES	1245
5111	1	13	TĐ INF	IV	5	0	5	Thi công hệ thống bơm (nước cấp, nước thoát, bù áp)/ Pump system installtion (water supply, drainage, pump pressure)	\N	0	PENDING	2026-06-15	\N	2026-08-03	\N	50	9	615	2026-09-23 21:47:03.93231	\N	YES	1194
5154	1	13	TĐ INF	B	0	0	84	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	0	PENDING	2026-06-01	\N	2026-06-01	\N	\N	9	615	2026-09-23 21:47:04.171163	\N	YES	1237
4916	1	4	TĐ BPV 2- BR	II	0	0	24	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	PENDING	2026-05-29	\N	2026-08-13	\N	\N	9	615	2026-09-23 21:47:02.237469	\N	\N	999
4911	1	4	TĐ BPV 2- BR	I	2	0	2	Thi công lắp đặt đường ống thoát nước/Installing drainpipe	\N	0	PENDING	2026-04-06	\N	2026-04-10	\N	5	9	615	2026-09-23 21:47:02.203013	\N	YES	994
4919	1	4	TĐ BPV 2- BR	II	3	0	3	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	0	PENDING	2026-06-17	\N	2026-06-20	\N	4	9	615	2026-09-23 21:47:02.254054	\N	YES	1002
4915	1	4	TĐ BPV 2- BR	I	6	0	6	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	0	PENDING	2026-10-04	\N	2026-10-13	\N	10	9	615	2026-09-23 21:47:02.232144	\N	YES	998
4923	1	4	TĐ BPV 2- BR	II	7	0	7	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	0	PENDING	2026-06-22	\N	2026-06-22	\N	1	9	615	2026-09-23 21:47:02.27654	\N	YES	1006
4927	1	4	TĐ BPV 2- BR	II	11	0	11	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	0	PENDING	2026-08-13	\N	2026-08-13	\N	1	9	615	2026-09-23 21:47:02.298789	\N	YES	1010
4910	1	4	TĐ BPV 2- BR	I	1	0	1	Thi công lắp đặt đường ống cấp nước /Installing water pipe	\N	0	PENDING	2026-06-23	\N	2026-07-12	\N	20	9	615	2026-09-23 21:47:02.195994	\N	YES	993
4914	1	4	TĐ BPV 2- BR	I	5	0	5	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	0	PENDING	2026-09-29	\N	2026-10-13	\N	15	9	615	2026-09-23 21:47:02.22607	\N	YES	997
4913	1	4	TĐ BPV 2- BR	I	4	0	4	Kiểm tra thử kín đường ống thoát nước/Testing drainpipe	\N	0	PENDING	2026-04-11	\N	2026-04-20	\N	10	9	615	2026-09-23 21:47:02.215357	\N	YES	996
4925	1	4	TĐ BPV 2- BR	II	9	0	9	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	0	PENDING	2026-06-02	\N	2026-06-02	\N	1	9	615	2026-09-23 21:47:02.287364	\N	YES	1008
4917	1	4	TĐ BPV 2- BR	II	1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	0	PENDING	2026-05-29	\N	2026-05-30	\N	2	9	615	2026-09-23 21:47:02.243373	\N	YES	1000
4924	1	4	TĐ BPV 2- BR	II	8	0	8	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	0	PENDING	2026-06-01	\N	2026-06-01	\N	1	9	615	2026-09-23 21:47:02.282298	\N	YES	1007
4908	1	4	TĐ BPV 2- BR	A	0	0	15	BPV- 2BR	\N	\N	PENDING	2026-04-06	\N	2026-10-13	\N	\N	9	615	2026-09-23 21:47:02.182153	\N	\N	991
4912	1	4	TĐ BPV 2- BR	I	3	0	3	Kiểm tra thử áp đường ống cấp nước/ Testing pressure of drainpipe	\N	0	PENDING	2026-07-05	\N	2026-07-14	\N	10	9	615	2026-09-23 21:47:02.209491	\N	YES	995
4922	1	4	TĐ BPV 2- BR	II	6	0	6	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	0	PENDING	2026-05-31	\N	2026-05-31	\N	1	9	615	2026-09-23 21:47:02.270863	\N	YES	1005
4920	1	4	TĐ BPV 2- BR	II	4	0	4	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	0	PENDING	2026-06-01	\N	2026-06-02	\N	2	9	615	2026-09-23 21:47:02.260211	\N	YES	1003
4926	1	4	TĐ BPV 2- BR	II	10	0	10	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	0	PENDING	2026-08-12	\N	2026-08-12	\N	1	9	615	2026-09-23 21:47:02.29298	\N	YES	1009
4909	1	4	TĐ BPV 2- BR	I	0	0	17	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	PENDING	2026-04-06	\N	2026-10-13	\N	\N	9	615	2026-09-23 21:47:02.18931	\N	\N	992
5211	1	15	TĐ .LOB-SPA	II	17	0	17	Lắp đặt thiết bị điều hòa không khí tầng 2 /Installing air conditional equipment floor2	\N	0	PENDING	2026-08-31	\N	2026-09-03	\N	4	9	615	2026-09-23 21:47:04.690587	\N	YES	1294
5193	1	15	TĐ .LOB-SPA	I	6	0	6	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	0	PENDING	2026-10-24	\N	2026-10-24	\N	1	9	615	2026-09-23 21:47:04.580091	\N	YES	1276
5214	1	15	TĐ .LOB-SPA	II	20	0	20	Lắp đặt cửa gió tầng 1 /Installing air diffuser baseman floor	\N	0	PENDING	2026-10-27	\N	2026-10-28	\N	2	9	615	2026-09-23 21:47:04.708297	\N	YES	1297
5189	1	15	TĐ .LOB-SPA	I	2	0	2	Thi công lắp đặt đường ống thoát nước/Installing drainpipe	\N	0	PENDING	2026-04-18	\N	2026-04-22	\N	5	9	615	2026-09-23 21:47:04.555482	\N	YES	1272
5186	1	15	TĐ .LOB-SPA	A	0	0	15	LOBBY - SPA BUILDING	\N	\N	PENDING	2026-04-18	\N	2026-11-02	\N	\N	9	615	2026-09-23 21:47:04.53595	\N	\N	1269
5202	1	15	TĐ .LOB-SPA	II	8	0	8	Thi công lắp đặt ống luồn dây tiến hiệu và điều khiển tầng 2 /Installing signal of conduit and controlling floor2	\N	0	PENDING	2026-09-02	\N	2026-09-04	\N	3	9	615	2026-09-23 21:47:04.635305	\N	YES	1285
5210	1	15	TĐ .LOB-SPA	II	16	0	16	Lắp đặt thiết bị điều hòa không khí tầng 1/Installing air conditional equipment floor 1	\N	0	PENDING	2026-08-23	\N	2026-08-29	\N	7	9	615	2026-09-23 21:47:04.684134	\N	YES	1293
5204	1	15	TĐ .LOB-SPA	II	10	0	10	Thử áp đường ống đồng tầng 2 /Testing pressure copper pipe floor2	\N	0	PENDING	2026-09-09	\N	2026-09-09	\N	1	9	615	2026-09-23 21:47:04.647565	\N	YES	1287
5216	1	15	TĐ .LOB-SPA	II	22	0	22	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	0	PENDING	2026-11-02	\N	2026-11-02	\N	1	9	615	2026-09-23 21:47:04.721068	\N	YES	1299
5206	1	15	TĐ .LOB-SPA	II	12	0	12	Thử kín đường ống nước ngưng tầng 2/Testing sealing water pipe floor2	\N	0	PENDING	2026-09-07	\N	2026-09-07	\N	1	9	615	2026-09-23 21:47:04.659366	\N	YES	1289
5191	1	15	TĐ .LOB-SPA	I	4	0	4	Kiểm tra thử kín đường ống thoát nước/Testing drainpipe	\N	0	PENDING	2026-04-23	\N	2026-04-25	\N	3	9	615	2026-09-23 21:47:04.56818	\N	YES	1274
5192	1	15	TĐ .LOB-SPA	I	5	0	5	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	0	PENDING	2026-10-17	\N	2026-10-23	\N	7	9	615	2026-09-23 21:47:04.573846	\N	YES	1275
5190	1	15	TĐ .LOB-SPA	I	3	0	3	Kiểm tra thử áp đường ống cấp nước/ Testing pressure of drainpipe	\N	0	PENDING	2026-09-02	\N	2026-09-04	\N	3	9	615	2026-09-23 21:47:04.562006	\N	YES	1273
5203	1	15	TĐ .LOB-SPA	II	9	0	9	Thử áp đường ống đồng tầng 1 /Testing pressure copper pipe floor 1	\N	0	PENDING	2026-09-02	\N	2026-09-02	\N	1	9	615	2026-09-23 21:47:04.641612	\N	YES	1286
5207	1	15	TĐ .LOB-SPA	II	13	0	13	Lắp đặt thiết bị quạt thông gió tầng 1/Installing air duct fan equipment floor 1	\N	0	PENDING	2026-08-23	\N	2026-08-24	\N	2	9	615	2026-09-23 21:47:04.665334	\N	YES	1290
5200	1	15	TĐ .LOB-SPA	II	6	0	6	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T2/Installing air duct and heat insulation floor2	\N	0	PENDING	2026-07-25	\N	2026-07-31	\N	7	9	615	2026-09-23 21:47:04.623662	\N	YES	1283
5201	1	15	TĐ .LOB-SPA	II	7	0	7	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng 1/Installing signal of conduit and controlling floor 1	\N	0	PENDING	2026-08-23	\N	2026-08-25	\N	3	9	615	2026-09-23 21:47:04.629046	\N	YES	1284
4993	1	7	TĐ .BZONE	B	5	0	5	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	0	PENDING	2026-06-15	\N	2026-06-15	\N	1	9	615	2026-09-23 21:47:02.854062	\N	YES	1076
4986	1	7	TĐ .BZONE	A	10	0	10	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	0	PENDING	2026-08-12	\N	2026-08-12	\N	1	9	615	2026-09-23 21:47:02.811286	\N	YES	1069
4973	1	7	TĐ .BZONE	I	5	0	5	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	0	PENDING	2026-09-28	\N	2026-10-12	\N	15	9	615	2026-09-23 21:47:02.737903	\N	YES	1056
4976	1	7	TĐ .BZONE	A	0	0	25	BEACH RESTAURANT	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 21:47:02.754522	\N	\N	1059
4981	1	7	TĐ .BZONE	A	5	0	5	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	0	PENDING	2026-06-15	\N	2026-06-15	\N	1	9	615	2026-09-23 21:47:02.781635	\N	YES	1064
4988	1	7	TĐ .BZONE	B	0	0	37	BEACH SPORT	\N	\N	PENDING	\N	\N	\N	\N	\N	9	615	2026-09-23 21:47:02.821804	\N	\N	1071
4999	1	7	TĐ .BZONE	B	11	0	11	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	0	PENDING	2026-08-14	\N	2026-08-14	\N	1	9	615	2026-09-23 21:47:02.894613	\N	YES	1082
4983	1	7	TĐ .BZONE	A	7	0	7	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	0	PENDING	2026-05-10	\N	2026-05-10	\N	1	9	615	2026-09-23 21:47:02.79211	\N	YES	1066
4992	1	7	TĐ .BZONE	B	4	0	4	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	0	PENDING	2026-06-12	\N	2026-06-13	\N	2	9	615	2026-09-23 21:47:02.847252	\N	YES	1075
4995	1	7	TĐ .BZONE	B	7	0	7	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	0	PENDING	2026-05-10	\N	2026-05-10	\N	1	9	615	2026-09-23 21:47:02.867334	\N	YES	1078
4980	1	7	TĐ .BZONE	A	4	0	4	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	0	PENDING	2026-06-12	\N	2026-06-13	\N	2	9	615	2026-09-23 21:47:02.775827	\N	YES	1063
4972	1	7	TĐ .BZONE	I	4	0	4	Kiểm tra thử kín đường ống thoát nước/Testing drainpipe	\N	0	PENDING	2026-06-15	\N	2026-06-17	\N	3	9	615	2026-09-23 21:47:02.732443	\N	YES	1055
4979	1	7	TĐ .BZONE	A	3	0	3	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	0	PENDING	2026-05-07	\N	2026-05-08	\N	2	9	615	2026-09-23 21:47:02.770885	\N	YES	1062
4970	1	7	TĐ .BZONE	I	2	0	2	Thi công lắp đặt đường ống thoát nước/Installing drainpipe	\N	0	PENDING	2026-02-14	\N	2026-02-18	\N	5	9	615	2026-09-23 21:47:02.721695	\N	YES	1053
4968	1	7	TĐ .BZONE	I	0	0	17	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	PENDING	2026-02-14	\N	2026-10-12	\N	\N	9	615	2026-09-23 21:47:02.710838	\N	\N	1051
4975	1	7	TĐ .BZONE	II	0	0	24	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	PENDING	2026-05-07	\N	2026-08-14	\N	\N	9	615	2026-09-23 21:47:02.74882	\N	\N	1058
4996	1	7	TĐ .BZONE	B	8	0	8	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	0	PENDING	2026-06-15	\N	2026-06-15	\N	1	9	615	2026-09-23 21:47:02.874423	\N	YES	1079
4994	1	7	TĐ .BZONE	B	6	0	6	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	0	PENDING	2026-06-14	\N	2026-06-14	\N	1	9	615	2026-09-23 21:47:02.860692	\N	YES	1077
4974	1	7	TĐ .BZONE	I	6	0	6	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	0	PENDING	2026-10-10	\N	2026-10-12	\N	3	9	615	2026-09-23 21:47:02.742735	\N	YES	1057
4985	1	7	TĐ .BZONE	A	9	0	9	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	0	PENDING	2026-06-17	\N	2026-06-17	\N	1	9	615	2026-09-23 21:47:02.805689	\N	YES	1068
4967	1	7	TĐ .BZONE	A	0	0	15	BZONE	\N	\N	PENDING	2026-02-14	\N	2026-10-12	\N	\N	9	615	2026-09-23 21:47:02.705252	\N	\N	1050
4977	1	7	TĐ .BZONE	A	1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	0	PENDING	2026-06-12	\N	2026-06-13	\N	2	9	615	2026-09-23 21:47:02.759777	\N	YES	1060
4930	1	9	TĐ .BUSINES CENTER	I	1	0	1	Thi công lắp đặt đường ống cấp nước /Installing water pipe	\N	0	PENDING	2026-06-23	\N	2026-07-02	\N	10	9	615	2026-09-23 21:47:02.371277	\N	YES	1013
4947	1	9	TĐ .BUSINES CENTER	II	11	0	11	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	0	PENDING	2026-09-23	\N	2026-09-23	\N	1	9	615	2026-09-23 21:47:02.468776	\N	YES	1030
4928	1	9	TĐ .BUSINES CENTER	A	0	0	15	BUSINES CENTER	\N	\N	PENDING	2026-05-12	\N	2026-09-26	\N	\N	9	615	2026-09-23 21:47:02.358838	\N	\N	1011
4939	1	9	TĐ .BUSINES CENTER	II	3	0	3	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	0	PENDING	2026-05-22	\N	2026-05-24	\N	3	9	615	2026-09-23 21:47:02.425599	\N	YES	1022
4942	1	9	TĐ .BUSINES CENTER	II	6	0	6	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	0	PENDING	2026-06-25	\N	2026-06-25	\N	1	9	615	2026-09-23 21:47:02.442083	\N	YES	1025
4934	1	9	TĐ .BUSINES CENTER	I	5	0	5	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	0	PENDING	2026-09-20	\N	2026-09-26	\N	7	9	615	2026-09-23 21:47:02.395464	\N	YES	1017
4940	1	9	TĐ .BUSINES CENTER	II	4	0	4	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	0	PENDING	2026-06-23	\N	2026-06-24	\N	2	9	615	2026-09-23 21:47:02.430719	\N	YES	1023
4931	1	9	TĐ .BUSINES CENTER	I	2	0	2	Thi công lắp đặt đường ống thoát nước/Installing drainpipe	\N	0	PENDING	2026-05-12	\N	2026-05-16	\N	5	9	615	2026-09-23 21:47:02.37685	\N	YES	1014
4935	1	9	TĐ .BUSINES CENTER	I	6	0	6	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	0	PENDING	2026-09-24	\N	2026-09-26	\N	3	9	615	2026-09-23 21:47:02.401761	\N	YES	1018
4929	1	9	TĐ .BUSINES CENTER	I	0	0	17	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	PENDING	2026-05-12	\N	2026-09-26	\N	\N	9	615	2026-09-23 21:47:02.365132	\N	\N	1012
3319	1	1	MEP-BTE-CSP-BOH		13	0	13	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	0.5	DONE	2026-03-31	2026-03-31	2026-03-31	2026-03-31	1	9	615	2026-09-08 04:38:29.136228	\N	\N	441
4933	1	9	TĐ .BUSINES CENTER	I	4	0	4	Kiểm tra thử kín đường ống thoát nước/Testing drainpipe	\N	0	PENDING	2026-05-18	\N	2026-05-20	\N	3	9	615	2026-09-23 21:47:02.389712	\N	YES	1016
4932	1	9	TĐ .BUSINES CENTER	I	3	0	3	Kiểm tra thử áp đường ống cấp nước/ Testing pressure of drainpipe	\N	0	PENDING	2026-07-03	\N	2026-07-05	\N	3	9	615	2026-09-23 21:47:02.383013	\N	YES	1015
4936	1	9	TĐ .BUSINES CENTER	II	0	0	24	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	PENDING	2026-05-22	\N	2026-09-23	\N	\N	9	615	2026-09-23 21:47:02.407963	\N	\N	1019
4944	1	9	TĐ .BUSINES CENTER	II	8	0	8	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	0	PENDING	2026-07-18	\N	2026-07-18	\N	1	9	615	2026-09-23 21:47:02.45268	\N	YES	1027
4946	1	9	TĐ .BUSINES CENTER	II	10	0	10	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	0	PENDING	2026-09-21	\N	2026-09-21	\N	1	9	615	2026-09-23 21:47:02.463271	\N	YES	1029
4943	1	9	TĐ .BUSINES CENTER	II	7	0	7	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	0	PENDING	2026-07-18	\N	2026-07-18	\N	1	9	615	2026-09-23 21:47:02.447307	\N	YES	1026
4945	1	9	TĐ .BUSINES CENTER	II	9	0	9	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	0	PENDING	2026-07-19	\N	2026-07-19	\N	1	9	615	2026-09-23 21:47:02.458397	\N	YES	1028
4941	1	9	TĐ .BUSINES CENTER	II	5	0	5	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	0	PENDING	2026-06-26	\N	2026-06-26	\N	1	9	615	2026-09-23 21:47:02.435847	\N	YES	1024
4937	1	9	TĐ .BUSINES CENTER	II	1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	0	PENDING	2026-06-23	\N	2026-06-24	\N	2	9	615	2026-09-23 21:47:02.414232	\N	YES	1020
5171	1	14	TĐ . KID CLUB	I	4	0	4	Kiểm tra thử kín đường ống thoát nước/Testing drainpipe	\N	0	PENDING	2026-06-06	\N	2026-06-08	\N	3	9	615	2026-09-23 21:47:04.344949	\N	YES	1254
5182	1	14	TĐ . KID CLUB	II	8	0	8	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	0	PENDING	2026-08-31	\N	2026-08-31	\N	1	9	615	2026-09-23 21:47:04.421218	\N	YES	1265
5168	1	14	TĐ . KID CLUB	I	1	0	1	Thi công lắp đặt đường ống cấp nước /Installing water pipe	\N	0	PENDING	2026-08-06	\N	2026-08-15	\N	10	9	615	2026-09-23 21:47:04.324772	\N	YES	1251
5178	1	14	TĐ . KID CLUB	II	4	0	4	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	0	PENDING	2026-08-06	\N	2026-08-07	\N	2	9	615	2026-09-23 21:47:04.391543	\N	YES	1261
5170	1	14	TĐ . KID CLUB	I	3	0	3	Kiểm tra thử áp đường ống cấp nước/ Testing pressure of drainpipe	\N	0	PENDING	2026-08-16	\N	2026-08-18	\N	3	9	615	2026-09-23 21:47:04.338712	\N	YES	1253
5174	1	14	TĐ . KID CLUB	II	0	0	24	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	PENDING	2026-07-06	\N	2026-10-17	\N	\N	9	615	2026-09-23 21:47:04.364687	\N	\N	1257
5177	1	14	TĐ . KID CLUB	II	3	0	3	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	0	PENDING	2026-07-06	\N	2026-07-08	\N	3	9	615	2026-09-23 21:47:04.38503	\N	YES	1260
5176	1	14	TĐ . KID CLUB	II	2	0	2	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	0	PENDING	2026-08-06	\N	2026-08-06	\N	1	9	615	2026-09-23 21:47:04.377857	\N	YES	1259
5185	1	14	TĐ . KID CLUB	II	11	0	11	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	0	PENDING	2026-10-17	\N	2026-10-17	\N	1	9	615	2026-09-23 21:47:04.449713	\N	YES	1268
5027	1	9	TĐ .FITNESS	A	0	0	15	FITNESS	\N	\N	PENDING	2026-05-09	\N	2026-10-17	\N	\N	9	615	2026-09-23 21:47:03.198635	\N	\N	1110
5033	1	9	TĐ .FITNESS	I	5	0	5	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	0	PENDING	2026-10-02	\N	2026-10-08	\N	7	9	615	2026-09-23 21:47:03.239168	\N	YES	1116
5034	1	9	TĐ .FITNESS	I	6	0	6	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	0	PENDING	2026-10-06	\N	2026-10-08	\N	3	9	615	2026-09-23 21:47:03.2456	\N	YES	1117
5039	1	9	TĐ .FITNESS	II	4	0	4	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	0	PENDING	2026-08-06	\N	2026-08-07	\N	2	9	615	2026-09-23 21:47:03.277663	\N	YES	1122
5043	1	9	TĐ .FITNESS	II	8	0	8	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	0	PENDING	2026-08-31	\N	2026-08-31	\N	1	9	615	2026-09-23 21:47:03.303829	\N	YES	1126
5042	1	9	TĐ .FITNESS	II	7	0	7	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	0	PENDING	2026-08-31	\N	2026-08-31	\N	1	9	615	2026-09-23 21:47:03.297261	\N	YES	1125
5028	1	9	TĐ .FITNESS	I	0	0	17	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	PENDING	2026-05-09	\N	2026-10-08	\N	\N	9	615	2026-09-23 21:47:03.206002	\N	\N	1111
5277	1	19	TĐ VNR	A	0	0	15	VN RES	\N	\N	PENDING	2026-01-29	\N	2026-08-04	\N	\N	9	615	2026-09-23 21:47:05.255681	\N	\N	1360
5289	1	19	TĐ VNR	II	3	0	3	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	0	PENDING	2026-04-22	\N	2026-04-23	\N	2	9	615	2026-09-23 21:47:05.323117	\N	YES	1372
5283	1	19	TĐ VNR	I	5	0	5	Kiểm tra thử kín đường ống thoát nước/Testing drainpipe	\N	0	PENDING	2026-02-08	\N	2026-02-10	\N	3	9	615	2026-09-23 21:47:05.28859	\N	YES	1366
5278	1	19	TĐ VNR	I	0	0	17	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	PENDING	2026-01-29	\N	2026-08-04	\N	\N	9	615	2026-09-23 21:47:05.261319	\N	\N	1361
5288	1	19	TĐ VNR	II	2	0	2	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	0	PENDING	2026-06-03	\N	2026-06-03	\N	1	9	615	2026-09-23 21:47:05.317406	\N	YES	1371
5279	1	19	TĐ VNR	I	1	0	1	Thi công lắp đặt đường ống cấp nước /Installing water pipe	\N	0	PENDING	2026-06-03	\N	2026-06-12	\N	10	9	615	2026-09-23 21:47:05.267103	\N	YES	1362
5293	1	19	TĐ VNR	II	7	0	7	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	0	PENDING	2026-04-25	\N	2026-04-25	\N	1	9	615	2026-09-23 21:47:05.344438	\N	YES	1376
5284	1	19	TĐ VNR	I	6	0	6	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	0	PENDING	2026-07-30	\N	2026-08-03	\N	5	9	615	2026-09-23 21:47:05.294596	\N	YES	1367
5294	1	19	TĐ VNR	II	8	0	8	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	0	PENDING	2026-06-08	\N	2026-06-08	\N	1	9	615	2026-09-23 21:47:05.349918	\N	YES	1377
5281	1	19	TĐ VNR	I	3	0	3	Kiểm tra thử áp đường ống cấp nước/ Testing pressure of drainpipe	\N	0	PENDING	2026-06-13	\N	2026-06-15	\N	3	9	615	2026-09-23 21:47:05.27755	\N	YES	1364
5297	1	19	TĐ VNR	II	11	0	11	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	0	PENDING	2026-08-01	\N	2026-08-01	\N	1	9	615	2026-09-23 21:47:05.365961	\N	YES	1380
5292	1	19	TĐ VNR	II	6	0	6	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	0	PENDING	2026-06-05	\N	2026-06-05	\N	1	9	615	2026-09-23 21:47:05.339311	\N	YES	1375
5282	1	19	TĐ VNR	I	4	0	4	Thi công lắp đặt slevee hố bơm, bể tách mỡ /Installing water pipe	\N	0.8	IN_PROGRESS	2026-02-13	\N	2026-02-14	\N	2	9	615	2026-09-23 21:47:05.283234	\N	YES	1365
5295	1	19	TĐ VNR	II	9	0	9	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	0	PENDING	2026-06-10	\N	2026-06-10	\N	1	9	615	2026-09-23 21:47:05.355336	\N	YES	1378
5290	1	19	TĐ VNR	II	4	0	4	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	0	PENDING	2026-06-03	\N	2026-06-03	\N	1	9	615	2026-09-23 21:47:05.328438	\N	YES	1373
5280	1	19	TĐ VNR	I	2	0	2	Thi công lắp đặt đường ống thoát nước/Installing drainpipe	\N	0	PENDING	2026-01-29	\N	2026-02-02	\N	5	9	615	2026-09-23 21:47:05.272222	\N	YES	1363
5296	1	19	TĐ VNR	II	10	0	10	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	0	PENDING	2026-07-30	\N	2026-07-30	\N	1	9	615	2026-09-23 21:47:05.360306	\N	YES	1379
5287	1	19	TĐ VNR	II	1	0	1	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	0	PENDING	2026-06-03	\N	2026-06-04	\N	2	9	615	2026-09-23 21:47:05.311828	\N	YES	1370
5286	1	19	TĐ VNR	II	0	0	25	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	PENDING	2026-04-22	\N	2026-08-01	\N	\N	9	615	2026-09-23 21:47:05.306722	\N	\N	1369
5285	1	19	TĐ VNR	I	7	0	7	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	0	PENDING	2026-08-04	\N	2026-08-04	\N	1	9	615	2026-09-23 21:47:05.300423	\N	YES	1368
5291	1	19	TĐ VNR	II	5	0	5	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	0	PENDING	2026-06-06	\N	2026-06-06	\N	1	9	615	2026-09-23 21:47:05.333915	\N	YES	1374
\.

-- work_items — dự án BTE-WP4-HBC
-- Sinh bởi scripts/export-demo-seed.mjs. Nạp bằng: node scripts/load-demo-seed.mjs
-- Ngày giữ nguyên theo hồ sơ gốc; `npm run setup` gọi rebase-demo-dates.mjs để neo về ngày chạy.
COPY work_items ("id", "project_id", "wbs_id", "code", "name_vi", "name_en", "unit", "planned_qty", "actual_qty", "unit_price", "baseline_version", "created_at", "zone_id", "item_type", "planned_start_date", "planned_end_date", "plan_duration_days", "progress_pct", "source_schedule_item_id", "updated_at") FROM stdin;
1066	1	\N	A.7-4983	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.794708	7	TASK	2026-05-10	2026-05-10	1	0	4983	2026-09-25 10:31:23.011818+00
424	1	\N	.6-3647	Gia công lắp đặt nghiệm thu cốt thép hố ga tuyến D7	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	13	TASK	2026-02-17	2026-02-21	5	0.6	3647	2026-09-25 15:05:39.592+00
1071	1	\N	B-4988	BEACH SPORT	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.823826	7	TASK	\N	\N	\N	\N	4988	2026-09-25 10:31:23.040836+00
1059	1	\N	A-4976	BEACH RESTAURANT	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.756851	7	TASK	\N	\N	\N	\N	4976	2026-09-25 10:31:22.973683+00
1062	1	\N	A.3-4979	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.773042	7	TASK	2026-05-07	2026-05-08	2	0	4979	2026-09-25 10:31:22.989268+00
1927	1	\N	I..1-5845	0.25	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.038022	9	TASK	\N	\N	\N	\N	5845	2026-09-25 10:31:20.683086+00
1928	1	\N	I..2-5846	0.3	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.042984	9	TASK	\N	\N	\N	\N	5846	2026-09-25 10:31:20.688248+00
1929	1	\N	I.-5847	0.55	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.049562	9	TASK	\N	\N	\N	\N	5847	2026-09-25 10:31:20.694517+00
1067	1	\N	A.8-4984	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.801879	7	TASK	2026-06-15	2026-06-15	1	0	4984	2026-09-25 10:31:23.018358+00
1170	1	\N	A-5087	Hạ Tầng	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.79213	13	TASK	2026-02-07	2026-11-02	\N	\N	5087	2026-09-25 10:31:23.940039+00
1930	1	\N	I..1-5848	0.25	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.055718	9	TASK	\N	\N	\N	\N	5848	2026-09-25 10:31:20.699949+00
1931	1	\N	I..2-5849	0.3	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.062223	9	TASK	\N	\N	\N	\N	5849	2026-09-25 10:31:20.705292+00
1932	1	\N	I.-5850	0.55	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.067828	9	TASK	\N	\N	\N	\N	5850	2026-09-25 10:31:20.711503+00
1933	1	\N	I..1-5851	0.25	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.073372	9	TASK	\N	\N	\N	\N	5851	2026-09-25 10:31:20.716915+00
1934	1	\N	I..2-5852	0.3	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.079509	9	TASK	\N	\N	\N	\N	5852	2026-09-25 10:31:20.723945+00
1063	1	\N	A.4-4980	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.778603	7	TASK	2026-06-12	2026-06-13	2	0	4980	2026-09-25 10:31:22.994577+00
1935	1	\N	I.-5853	0.55	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.084862	9	TASK	\N	\N	\N	\N	5853	2026-09-25 10:31:20.732583+00
1936	1	\N	I..1-5854	0.25	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.089807	9	TASK	\N	\N	\N	\N	5854	2026-09-25 10:31:20.740402+00
1937	1	\N	I..2-5855	0.3	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.096172	9	TASK	\N	\N	\N	\N	5855	2026-09-25 10:31:20.748434+00
1068	1	\N	A.9-4985	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.80803	7	TASK	2026-06-17	2026-06-17	1	0	4985	2026-09-25 10:31:23.024519+00
1064	1	\N	A.5-4981	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.783699	7	TASK	2026-06-15	2026-06-15	1	0	4981	2026-09-25 10:31:22.999597+00
879	1	\N	A-4796	Zone A	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.398197	1	TASK	\N	\N	\N	\N	4796	2026-09-25 10:31:21.493543+00
1938	1	\N	I.-5856	0.55	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.10216	9	TASK	\N	\N	\N	\N	5856	2026-09-25 10:31:20.759635+00
1939	1	\N	I..1-5857	0.25	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.110571	9	TASK	\N	\N	\N	\N	5857	2026-09-25 10:31:20.768977+00
1940	1	\N	I..2-5858	0.3	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.115854	9	TASK	\N	\N	\N	\N	5858	2026-09-25 10:31:20.780237+00
1941	1	\N	I.-5859	0.55	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.120639	9	TASK	\N	\N	\N	\N	5859	2026-09-25 10:31:20.792084+00
1069	1	\N	A.10-4986	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.81344	7	TASK	2026-08-12	2026-08-12	1	0	4986	2026-09-25 10:31:23.029583+00
1070	1	\N	A.11-4987	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.818834	7	TASK	2026-08-14	2026-08-14	1	0	4987	2026-09-25 10:31:23.035619+00
923	1	\N	C-4840	Zone C	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.647335	1	TASK	\N	\N	\N	\N	4840	2026-09-25 10:31:21.776418+00
901	1	\N	B-4818	Zone B	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.523288	1	TASK	\N	\N	\N	\N	4818	2026-09-25 10:31:21.64165+00
1072	1	\N	B.1-4989	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.829898	7	TASK	2026-06-12	2026-06-13	2	0	4989	2026-09-25 10:31:23.0469+00
1073	1	\N	B.2-4990	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.836915	7	TASK	2026-06-12	2026-06-12	1	0	4990	2026-09-25 10:31:23.052815+00
945	1	\N	D-4862	Zone D	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.772133	1	TASK	\N	\N	\N	\N	4862	2026-09-25 10:31:21.905304+00
1914	1	\N	I.-5832	0.55	\N	\N	\N	\N	\N	1	2026-09-23 22:09:48.950327	9	TASK	\N	\N	\N	\N	5832	2026-09-25 10:31:20.602357+00
1915	1	\N	I..1-5833	0.25	\N	\N	\N	\N	\N	1	2026-09-23 22:09:48.958698	9	TASK	\N	\N	\N	\N	5833	2026-09-25 10:31:20.609435+00
1916	1	\N	I..2-5834	0.3	\N	\N	\N	\N	\N	1	2026-09-23 22:09:48.964739	9	TASK	\N	\N	\N	\N	5834	2026-09-25 10:31:20.615111+00
1917	1	\N	I.-5835	0.55	\N	\N	\N	\N	\N	1	2026-09-23 22:09:48.971407	9	TASK	\N	\N	\N	\N	5835	2026-09-25 10:31:20.620389+00
1074	1	\N	B.3-4991	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.843918	7	TASK	2026-05-07	2026-05-08	2	0	4991	2026-09-25 10:31:23.058447+00
1075	1	\N	B.4-4992	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.850269	7	TASK	2026-06-12	2026-06-13	2	0	4992	2026-09-25 10:31:23.064205+00
1076	1	\N	B.5-4993	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.857128	7	TASK	2026-06-15	2026-06-15	1	0	4993	2026-09-25 10:31:23.070072+00
554	1	\N	A-3532	BEACH RESTAURANT	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	41	TASK	\N	\N	\N	\N	3532	2026-09-23 21:27:05.011382+00
574	1	\N	.14-3640	Nghiêệm thu lắp đặt hố ga tuyến D6	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	13	TASK	\N	\N	\N	1	3640	2026-09-23 21:27:05.011382+00
589	1	\N	.10-3651	Nghiêệm thu lắp đặt hố ga tuyến D7	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	13	TASK	\N	\N	8	0	3651	2026-09-23 21:27:05.011382+00
666	1	\N	A-3351	Zone A	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	1	TASK	\N	\N	\N	1	3351	2026-09-23 21:27:05.011382+00
840	1	\N	B-3544	BEACH SPORT	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	41	TASK	\N	\N	\N	\N	3544	2026-09-23 21:27:05.011382+00
1077	1	\N	B.6-4994	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.863516	7	TASK	2026-06-14	2026-06-14	1	0	4994	2026-09-25 10:31:23.075892+00
1919	1	\N	I..2-5837	0.3	\N	\N	\N	\N	\N	1	2026-09-23 22:09:48.983278	9	TASK	\N	\N	\N	\N	5837	2026-09-25 10:31:20.631611+00
1918	1	\N	I..1-5836	0.25	\N	\N	\N	\N	\N	1	2026-09-23 22:09:48.977091	9	TASK	\N	\N	\N	\N	5836	2026-09-25 10:31:20.625498+00
1078	1	\N	B.7-4995	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.870344	7	TASK	2026-05-10	2026-05-10	1	0	4995	2026-09-25 10:31:23.081657+00
1920	1	\N	I.-5838	0.55	\N	\N	\N	\N	\N	1	2026-09-23 22:09:48.989244	9	TASK	\N	\N	\N	\N	5838	2026-09-25 10:31:20.638542+00
1921	1	\N	I..1-5839	0.25	\N	\N	\N	\N	\N	1	2026-09-23 22:09:48.994616	9	TASK	\N	\N	\N	\N	5839	2026-09-25 10:31:20.644934+00
1922	1	\N	I..2-5840	0.3	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.002288	9	TASK	\N	\N	\N	\N	5840	2026-09-25 10:31:20.651152+00
1079	1	\N	B.8-4996	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.877119	7	TASK	2026-06-15	2026-06-15	1	0	4996	2026-09-25 10:31:23.087075+00
1300	1	\N	A-5217	RES- 3 BR	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.795584	17	TASK	2026-06-18	2026-10-21	\N	\N	5217	2026-09-25 10:31:24.849604+00
1080	1	\N	B.9-4997	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.884287	7	TASK	2026-06-17	2026-06-17	1	0	4997	2026-09-25 10:31:23.092451+00
1081	1	\N	B.10-4998	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.890855	7	TASK	2026-08-12	2026-08-12	1	0	4998	2026-09-25 10:31:23.097745+00
1082	1	\N	B.11-4999	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.897579	7	TASK	2026-08-14	2026-08-14	1	0	4999	2026-09-25 10:31:23.102756+00
1083	1	\N	A-5000	CLUSTER VILLA	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.980337	8	TASK	2026-04-20	2026-10-17	\N	\N	5000	2026-09-25 10:31:23.173065+00
1084	1	\N	I-5001	Hệ thống cấp thoát nước/Water supply and drainage system35-48)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.988617	8	TASK	2026-04-20	2026-10-17	\N	\N	5001	2026-09-25 10:31:23.178666+00
1923	1	\N	I.-5841	0.55	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.010325	9	TASK	\N	\N	\N	\N	5841	2026-09-25 10:31:20.657156+00
1924	1	\N	I..1-5842	0.25	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.019743	9	TASK	\N	\N	\N	\N	5842	2026-09-25 10:31:20.665806+00
1925	1	\N	I..2-5843	0.3	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.025781	9	TASK	\N	\N	\N	\N	5843	2026-09-25 10:31:20.671648+00
1926	1	\N	I.-5844	0.55	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.032524	9	TASK	\N	\N	\N	\N	5844	2026-09-25 10:31:20.67756+00
1085	1	\N	I.1-5002	Thi công lắp đặt đường ống cấp nước /Installing water pipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.995882	8	TASK	2026-07-01	2026-07-15	15	0	5002	2026-09-25 10:31:23.184172+00
1086	1	\N	I.2-5003	Thi công lắp đặt đường ống thoát nước/Installing drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.002754	8	TASK	2026-04-20	2026-04-24	5	0	5003	2026-09-25 10:31:23.189177+00
1087	1	\N	I.3-5004	Kiểm tra thử áp đường ống cấp nước/ Testing pressure of drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.008429	8	TASK	2026-09-25	2026-09-27	3	0	5004	2026-09-25 10:31:23.194474+00
1088	1	\N	I.4-5005	Kiểm tra thử kín đường ống thoát nước/Testing drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.014531	8	TASK	2026-09-25	2026-09-27	3	0	5005	2026-09-25 10:31:23.199524+00
1089	1	\N	I.5-5006	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.021259	8	TASK	2026-09-22	2026-10-01	10	0	5006	2026-09-25 10:31:23.204715+00
1090	1	\N	I.6-5007	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.026799	8	TASK	2026-09-30	2026-10-02	3	0	5007	2026-09-25 10:31:23.209862+00
1091	1	\N	II-5008	Hệ thống cấp thoát nước/Water supply and drainage system(27-37 & 70-73)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.031817	8	TASK	2026-05-15	2026-05-14	\N	\N	5008	2026-09-25 10:31:23.214976+00
1093	1	\N	II.2-5010	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.044538	8	TASK	2026-07-19	2026-07-19	1	0	5010	2026-09-25 10:31:23.263317+00
1095	1	\N	II.4-5012	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.055542	8	TASK	2026-07-26	2026-07-26	1	0	5012	2026-09-25 10:31:23.274055+00
1097	1	\N	II.6-5014	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.06785	8	TASK	2026-07-21	2026-07-21	1	0	5014	2026-09-25 10:31:23.284083+00
1098	1	\N	II-5015	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.072854	8	TASK	2026-07-16	2026-09-16	\N	\N	5015	2026-09-25 10:31:23.253154+00
1092	1	\N	II.1-5009	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.037937	8	TASK	2026-07-26	2026-07-26	1	0	5009	2026-09-25 10:31:23.258436+00
1094	1	\N	II.3-5011	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.050252	8	TASK	2026-07-16	2026-07-17	2	0	5011	2026-09-25 10:31:23.268682+00
1096	1	\N	II.5-5013	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.061668	8	TASK	2026-07-28	2026-07-28	1	0	5013	2026-09-25 10:31:23.279032+00
1058	1	\N	II-4975	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.75104	7	TASK	2026-05-07	2026-08-14	\N	\N	4975	2026-09-25 10:31:22.968598+00
1061	1	\N	A.2-4978	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.767252	7	TASK	2026-06-12	2026-06-12	1	0	4978	2026-09-25 10:31:22.983816+00
1065	1	\N	A.6-4982	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.789348	7	TASK	2026-06-14	2026-06-14	1	0	4982	2026-09-25 10:31:23.005358+00
1116	1	\N	I.5-5033	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.241496	9	TASK	2026-10-02	2026-10-08	7	0	5033	2026-09-25 10:31:23.401648+00
1117	1	\N	I.6-5034	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.247797	9	TASK	2026-10-06	2026-10-08	3	0	5034	2026-09-25 10:31:23.406771+00
1118	1	\N	II-5035	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.254319	9	TASK	2026-07-06	2026-10-17	\N	\N	5035	2026-09-25 10:31:23.415731+00
1119	1	\N	II.1-5036	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.260984	9	TASK	2026-08-06	2026-08-07	2	0	5036	2026-09-25 10:31:23.421391+00
1120	1	\N	II.2-5037	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.26732	9	TASK	2026-08-06	2026-08-06	1	0	5037	2026-09-25 10:31:23.426565+00
1121	1	\N	II.3-5038	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.273113	9	TASK	2026-07-06	2026-07-08	3	0	5038	2026-09-25 10:31:23.432216+00
1122	1	\N	II.4-5039	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.280357	9	TASK	2026-08-06	2026-08-07	2	0	5039	2026-09-25 10:31:23.437123+00
1123	1	\N	II.5-5040	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.28783	9	TASK	2026-08-09	2026-08-09	1	0	5040	2026-09-25 10:31:23.442188+00
1124	1	\N	II.6-5041	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.294215	9	TASK	2026-08-08	2026-08-08	1	0	5041	2026-09-25 10:31:23.447537+00
1125	1	\N	II.7-5042	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.300615	9	TASK	2026-08-31	2026-08-31	1	0	5042	2026-09-25 10:31:23.452473+00
1133	1	\N	I.2-5050	Thi công lắp đặt đường ống thoát nước/Installing drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.410305	10	TASK	2026-05-31	2026-06-04	5	0	5050	2026-09-25 10:31:23.557677+00
850	1	\N	I-4767	Hệ thống cấp thoát nước/Water supply and drainage system(Basement)( Phần âm)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.21817	1	TASK	2026-01-19	2026-07-17	\N	0	4767	2026-09-30 23:09:05.485505+00
849	1	\N	A-4766	BOH	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.210543	1	TASK	2026-01-19	2026-07-29	\N	0	4766	2026-10-01 00:06:55.798603+00
1957	1	\N	I..1-5875	0.25	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.206917	9	TASK	\N	\N	\N	\N	5875	2026-09-25 10:31:20.999509+00
1958	1	\N	I..2-5876	0.3	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.211918	9	TASK	\N	\N	\N	\N	5876	2026-09-25 10:31:21.010434+00
1188	1	\N	III.5-5105	Thi công hệ thống bơm (nước cấp, nước thoát, bù áp)/ Pump system installtion (water supply, drainage, pump pressure)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.898948	13	TASK	2026-08-10	2026-10-08	60	0	5105	2026-09-25 10:31:24.03752+00
851	1	\N	I.1-4768	Bể nước sinh hoạt, phòng cháy chữa cháy: Lắp đặt ống slevee inox,slevee  ống Upvc/Domestic water tank, Fire fighting, sleeve pipe installation, UPVC pipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.224969	1	TASK	2026-01-19	2026-01-20	2	0.65	4768	2026-09-30 23:10:59.769811+00
1226	1	\N	VIII.1-5143	Thi công đào, lấp đất/Excavation, backfill	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.111101	13	TASK	2026-02-12	2026-03-18	35	0	5143	2026-09-25 10:31:24.285657+00
1942	1	\N	I..1-5860	0.25	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.126464	9	TASK	\N	\N	\N	\N	5860	2026-09-25 10:31:20.800661+00
1943	1	\N	I..2-5861	0.3	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.132462	9	TASK	\N	\N	\N	\N	5861	2026-09-25 10:31:20.812641+00
1944	1	\N	I.-5862	0.55	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.137212	9	TASK	\N	\N	\N	\N	5862	2026-09-25 10:31:20.823647+00
1945	1	\N	I..1-5863	0.25	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.143111	9	TASK	\N	\N	\N	\N	5863	2026-09-25 10:31:20.836812+00
1959	1	\N	I.-5877	0.55	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.217547	9	TASK	\N	\N	\N	\N	5877	2026-09-25 10:31:21.018558+00
1960	1	\N	I..1-5878	0.25	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.22335	9	TASK	\N	\N	\N	\N	5878	2026-09-25 10:31:21.026674+00
1961	1	\N	I..2-5879	0.3	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.22842	9	TASK	\N	\N	\N	\N	5879	2026-09-25 10:31:21.034094+00
1126	1	\N	II.8-5043	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.306413	9	TASK	2026-08-31	2026-08-31	1	0	5043	2026-09-25 10:31:23.457485+00
1127	1	\N	II.9-5044	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.312541	9	TASK	2026-08-31	2026-08-31	1	0	5044	2026-09-25 10:31:23.462868+00
882	1	\N	A.3-4799	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.415811	1	TASK	2026-03-29	2026-03-29	1	0	4799	2026-09-25 10:31:21.515138+00
1128	1	\N	II.10-5045	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.318771	9	TASK	2026-10-15	2026-10-15	1	0	5045	2026-09-25 10:31:23.467804+00
1129	1	\N	II.11-5046	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.325383	9	TASK	2026-10-17	2026-10-17	1	0	5046	2026-09-25 10:31:23.472721+00
1130	1	\N	A-5047	HPV-1BR	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.392061	10	TASK	2026-05-12	2026-09-17	\N	\N	5047	2026-09-25 10:31:23.539822+00
1131	1	\N	I-5048	Hệ thống cấp thoát nước/Water supply and drainage system(1-13)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.398515	10	TASK	2026-05-12	2026-09-17	\N	\N	5048	2026-09-25 10:31:23.545444+00
1132	1	\N	I.1-5049	Thi công lắp đặt đường ống cấp nước /Installing water pipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.404738	10	TASK	2026-05-12	2026-05-31	20	0	5049	2026-09-25 10:31:23.550836+00
932	1	\N	C.9-4849	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.697711	1	TASK	2026-06-23	2026-06-23	1	0	4849	2026-09-25 10:31:21.827667+00
952	1	\N	D.7-4869	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.812723	1	TASK	2026-06-20	2026-06-21	2	0	4869	2026-09-25 10:31:21.943133+00
1052	1	\N	I.1-4969	Thi công lắp đặt đường ống cấp nước /Installing water pipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.718311	7	TASK	2026-06-02	2026-06-11	10	0	4969	2026-09-25 10:31:22.936499+00
1946	1	\N	I..2-5864	0.3	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.148213	9	TASK	\N	\N	\N	\N	5864	2026-09-25 10:31:20.853421+00
1947	1	\N	I.-5865	0.55	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.153854	9	TASK	\N	\N	\N	\N	5865	2026-09-25 10:31:20.869099+00
1948	1	\N	I..1-5866	0.25	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.1593	9	TASK	\N	\N	\N	\N	5866	2026-09-25 10:31:20.883571+00
1949	1	\N	I..2-5867	0.3	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.164394	9	TASK	\N	\N	\N	\N	5867	2026-09-25 10:31:20.897627+00
1950	1	\N	I.-5868	0.55	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.169442	9	TASK	\N	\N	\N	\N	5868	2026-09-25 10:31:20.911848+00
1951	1	\N	I..1-5869	0.25	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.175362	9	TASK	\N	\N	\N	\N	5869	2026-09-25 10:31:20.924321+00
1952	1	\N	I..2-5870	0.3	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.180343	9	TASK	\N	\N	\N	\N	5870	2026-09-25 10:31:20.939051+00
1953	1	\N	I.-5871	0.55	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.185051	9	TASK	\N	\N	\N	\N	5871	2026-09-25 10:31:20.951792+00
1954	1	\N	I..1-5872	0.25	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.190553	9	TASK	\N	\N	\N	\N	5872	2026-09-25 10:31:20.965252+00
1955	1	\N	I..2-5873	0.3	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.195624	9	TASK	\N	\N	\N	\N	5873	2026-09-25 10:31:20.97843+00
1956	1	\N	I.-5874	0.55	\N	\N	\N	\N	\N	1	2026-09-23 22:09:49.20122	9	TASK	\N	\N	\N	\N	5874	2026-09-25 10:31:20.98985+00
1134	1	\N	I.3-5051	Kiểm tra thử áp đường ống cấp nước/ Testing pressure of drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.416156	10	TASK	2026-06-01	2026-06-07	7	0	5051	2026-09-25 10:31:23.563358+00
1135	1	\N	I.4-5052	Kiểm tra thử kín đường ống thoát nước/Testing drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.422286	10	TASK	2026-06-05	2026-06-11	7	0	5052	2026-09-25 10:31:23.569762+00
1136	1	\N	I.5-5053	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.428568	10	TASK	2026-08-29	2026-09-17	20	0	5053	2026-09-25 10:31:23.576205+00
1137	1	\N	I.6-5054	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.434347	10	TASK	2026-09-11	2026-09-17	7	0	5054	2026-09-25 10:31:23.582363+00
1138	1	\N	II-5055	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.440494	10	TASK	2026-06-01	2026-08-22	\N	\N	5055	2026-09-25 10:31:23.588441+00
1140	1	\N	II.2-5057	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.4548	10	TASK	2026-06-09	2026-06-09	1	0	5057	2026-09-25 10:31:23.598533+00
1141	1	\N	II.3-5058	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.462475	10	TASK	2026-06-01	2026-06-05	5	0	5058	2026-09-25 10:31:23.603746+00
1142	1	\N	II.4-5059	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.468762	10	TASK	2026-06-06	2026-06-06	1	0	5059	2026-09-25 10:31:23.608701+00
1143	1	\N	II.5-5060	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.474702	10	TASK	2026-06-09	2026-06-09	1	0	5060	2026-09-25 10:31:23.613888+00
1144	1	\N	II.6-5061	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.480923	10	TASK	2026-06-11	2026-06-11	1	0	5061	2026-09-25 10:31:23.619988+00
1145	1	\N	II.7-5062	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.487435	10	TASK	2026-06-07	2026-06-07	1	0	5062	2026-09-25 10:31:23.62503+00
1146	1	\N	II.8-5063	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.493535	10	TASK	2026-06-07	2026-06-07	1	0	5063	2026-09-25 10:31:23.630566+00
1107	1	\N	II.9-5024	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.124956	8	TASK	2026-07-31	2026-07-31	1	0	5024	2026-09-25 10:31:23.299442+00
1108	1	\N	II.10-5025	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.13125	8	TASK	2026-09-14	2026-09-14	1	0	5025	2026-09-25 10:31:23.304694+00
1109	1	\N	II.11-5026	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.136577	8	TASK	2026-09-16	2026-09-16	1	0	5026	2026-09-25 10:31:23.310222+00
1110	1	\N	A-5027	FITNESS	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.2019	9	TASK	2026-05-09	2026-10-17	\N	\N	5027	2026-09-25 10:31:23.37075+00
1114	1	\N	I.3-5031	Kiểm tra thử áp đường ống cấp nước/ Testing pressure of drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.22952	9	TASK	2026-07-14	2026-07-16	3	0	5031	2026-09-25 10:31:23.391489+00
1115	1	\N	I.4-5032	Kiểm tra thử kín đường ống thoát nước/Testing drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.235924	9	TASK	2026-05-14	2026-05-16	3	0	5032	2026-09-25 10:31:23.396551+00
1111	1	\N	I-5028	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.208384	9	TASK	2026-05-09	2026-10-08	\N	\N	5028	2026-09-25 10:31:23.376096+00
1112	1	\N	I.1-5029	Thi công lắp đặt đường ống cấp nước /Installing water pipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.215603	9	TASK	2026-07-04	2026-07-13	10	0	5029	2026-09-25 10:31:23.381143+00
1113	1	\N	I.2-5030	Thi công lắp đặt đường ống thoát nước/Installing drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.222966	9	TASK	2026-05-09	2026-05-13	5	0	5030	2026-09-25 10:31:23.386434+00
1159	1	\N	II.1-5076	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.624121	10	TASK	2026-06-06	2026-06-07	2	0	5076	2026-09-25 10:31:23.764027+00
1160	1	\N	II.2-5077	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.63044	10	TASK	2026-06-09	2026-06-09	1	0	5077	2026-09-25 10:31:23.770017+00
1161	1	\N	II.3-5078	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.635928	10	TASK	2026-06-01	2026-06-03	3	0	5078	2026-09-25 10:31:23.776494+00
1162	1	\N	II.4-5079	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.641748	10	TASK	2026-06-06	2026-06-07	2	0	5079	2026-09-25 10:31:23.783068+00
1163	1	\N	II.5-5080	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.647829	10	TASK	2026-06-09	2026-06-09	1	0	5080	2026-09-25 10:31:23.789892+00
1164	1	\N	II.6-5081	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.654209	10	TASK	2026-06-11	2026-06-11	1	0	5081	2026-09-25 10:31:23.796283+00
1165	1	\N	II.7-5082	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.659439	10	TASK	2026-06-05	2026-06-05	1	0	5082	2026-09-25 10:31:23.801924+00
1166	1	\N	II.8-5083	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.664965	10	TASK	2026-06-05	2026-06-05	1	0	5083	2026-09-25 10:31:23.808739+00
1167	1	\N	II.9-5084	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.670735	10	TASK	2026-06-05	2026-06-05	1	0	5084	2026-09-25 10:31:23.814931+00
1168	1	\N	II.10-5085	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.67672	10	TASK	2026-08-20	2026-08-20	1	0	5085	2026-09-25 10:31:23.821349+00
1169	1	\N	II.11-5086	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.681809	10	TASK	2026-08-22	2026-08-22	1	0	5086	2026-09-25 10:31:23.828218+00
1171	1	\N	I-5088	Hệ thống cấp thoát nước/Water supply and drainage system (D5)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.798346	13	TASK	2026-02-07	2026-11-02	\N	\N	5088	2026-09-25 10:31:23.946194+00
1172	1	\N	I.1-5089	Thi công đào, lấp đất/Excavation, backfill	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.804565	13	TASK	2026-02-07	2026-04-17	70	0	5089	2026-09-25 10:31:23.952792+00
1173	1	\N	I.2-5090	Thi công hệ thống ống âm đất (cấp nước, thoát nước, thoát nước thải)Underground pipe system execution(water supply, drainage, sewage)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.810069	13	TASK	2026-02-16	2026-06-05	110	0	5090	2026-09-25 10:31:23.958301+00
1174	1	\N	I.3-5091	Thi công hệ thống valve, vòi, trụ/ Valve system, ejector, pillar installation	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.815891	13	TASK	2026-05-28	2026-07-11	45	0	5091	2026-09-25 10:31:23.963932+00
1175	1	\N	I.4-5092	Kiểm tra hệ thống cấp thoát nước/testing water supply system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.821493	13	TASK	2026-03-23	2026-06-10	80	0	5092	2026-09-25 10:31:23.969201+00
1176	1	\N	I.5-5093	Thi công hệ thống bơm (nước cấp, nước thoát, bù áp)/ Pump system installtion (water supply, drainage, pump pressure)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.826475	13	TASK	2026-07-02	2026-10-09	100	0	5093	2026-09-25 10:31:23.97424+00
1177	1	\N	II-5094	Hệ thống cấp thoát nước/Water supply and drainage system(N2-N3)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.832188	13	TASK	2026-02-07	2026-02-06	\N	0	5094	2026-09-25 10:31:23.979336+00
1178	1	\N	II.1-5095	Thi công đào, lấp đất/Excavation, backfill	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.837903	13	TASK	2026-02-07	2026-04-02	55	0	5095	2026-09-25 10:31:23.98446+00
1180	1	\N	II.3-5097	Thi công hệ thống valve, vòi, trụ/ Valve system, ejector, pillar installation	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.849969	13	TASK	2026-05-28	2026-07-31	65	0	5097	2026-09-25 10:31:23.9949+00
1181	1	\N	II.4-5098	Kiểm tra hệ thống cấp thoát nước/testing water supply system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.856464	13	TASK	2026-03-23	2026-04-06	15	0	5098	2026-09-25 10:31:24.000209+00
1182	1	\N	II.5-5099	Thi công hệ thống bơm (nước cấp, nước thoát, bù áp)/ Pump system installtion (water supply, drainage, pump pressure)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.862977	13	TASK	2026-08-01	2026-09-29	60	0	5099	2026-09-25 10:31:24.005364+00
1183	1	\N	III-5100	Hệ thống cấp thoát nước/Water supply and drainage system(D1)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.869568	13	TASK	2026-02-21	2026-02-20	\N	0	5100	2026-09-25 10:31:24.010517+00
1184	1	\N	III.1-5101	Thi công đào, lấp đất/Excavation, backfill	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.874978	13	TASK	2026-02-21	2026-04-21	60	0	5101	2026-09-25 10:31:24.015959+00
1185	1	\N	III.2-5102	Thi công hệ thống ống âm đất (cấp nước, thoát nước, thoát nước thải)Underground pipe system execution(water supply, drainage, sewage)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.882282	13	TASK	2026-03-03	2026-07-25	145	0	5102	2026-09-25 10:31:24.02115+00
1186	1	\N	III.3-5103	Thi công hệ thống valve, vòi, trụ/ Valve system, ejector, pillar installation	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.888167	13	TASK	2026-07-03	2026-09-10	70	0	5103	2026-09-25 10:31:24.026459+00
1187	1	\N	III.4-5104	Kiểm tra thử kín, thử áp hệ thống cấp thoát nước/testing water supply system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.893925	13	TASK	2026-07-14	2026-09-16	65	0	5104	2026-09-25 10:31:24.03215+00
1149	1	\N	II.11-5066	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.510174	10	TASK	2026-08-22	2026-08-22	1	0	5066	2026-09-25 10:31:23.646055+00
1150	1	\N	A-5067	HPV-2BR	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.570526	10	TASK	2026-03-26	2026-09-02	\N	\N	5067	2026-09-25 10:31:23.70498+00
1151	1	\N	I-5068	Hệ thống cấp thoát nước/Water supply and drainage system(14-26)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.576601	10	TASK	2026-03-26	2026-09-02	\N	\N	5068	2026-09-25 10:31:23.710267+00
1157	1	\N	I.6-5074	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.612175	10	TASK	2026-08-31	2026-09-02	3	0	5074	2026-09-25 10:31:23.750071+00
1158	1	\N	II-5075	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.617321	10	TASK	2026-06-01	2026-08-22	\N	\N	5075	2026-09-25 10:31:23.757529+00
1153	1	\N	I.2-5070	Thi công lắp đặt đường ống thoát nước/Installing drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.588851	10	TASK	2026-03-26	2026-03-30	5	0	5070	2026-09-25 10:31:23.72223+00
1154	1	\N	I.3-5071	Kiểm tra thử áp đường ống cấp nước/ Testing pressure of drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.594249	10	TASK	2026-07-03	2026-07-05	3	0	5071	2026-09-25 10:31:23.728267+00
1155	1	\N	I.4-5072	Kiểm tra thử kín đường ống thoát nước/Testing drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.600204	10	TASK	2026-03-31	2026-04-02	3	0	5072	2026-09-25 10:31:23.735459+00
1156	1	\N	I.5-5073	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.606461	10	TASK	2026-08-27	2026-09-02	7	0	5073	2026-09-25 10:31:23.742632+00
1198	1	\N	V.3-5115	Thi công hệ thống valve, vòi, trụ/ Valve system, ejector, pillar installation	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.956706	13	TASK	2026-06-17	2026-09-04	80	0	5115	2026-09-25 10:31:24.0969+00
1199	1	\N	V.4-5116	Kiểm tra hệ thống cấp  nước/testing water supply system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.962449	13	TASK	2026-06-28	2026-09-05	70	0	5116	2026-09-25 10:31:24.102113+00
1200	1	\N	V.5-5117	Thi công đào, lấp đất/Excavation, backfill( Thoát nước)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.967859	13	TASK	2026-02-07	2026-03-23	45	0	5117	2026-09-25 10:31:24.107749+00
1201	1	\N	V.6-5118	Thi công hệ thống ống âm đất (thoát nước, thoát nước thải)Underground pipe system execution(water supply, drainage, sewage)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.97346	13	TASK	2026-03-04	2026-06-26	115	0	5118	2026-09-25 10:31:24.112657+00
1202	1	\N	V.7-5119	Thi công hệ thống valve, vòi, trụ/ Valve system, ejector, pillar installation	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.978549	13	TASK	2026-06-17	2026-09-04	80	0	5119	2026-09-25 10:31:24.117476+00
1203	1	\N	V.8-5120	Kiểm tra hệ thống cấp thoát nước/testing water supply system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.9835	13	TASK	2026-06-28	2026-09-05	70	0	5120	2026-09-25 10:31:24.122895+00
1204	1	\N	V.9-5121	Thi công hệ thống bơm (nước cấp, nước thoát, bù áp)/ Pump system installtion (water supply, drainage, pump pressure)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.988355	13	TASK	2026-08-28	2026-11-02	67	0	5121	2026-09-25 10:31:24.128082+00
1205	1	\N	V.10-5122	Gia công lắp đặt nghiệm thu cốt thép hố ga tuyến D6	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.993814	13	TASK	2026-02-17	2026-02-21	5	0.7058824	5122	2026-09-25 10:31:24.133437+00
1206	1	\N	V.11-5123	Gia công lắp đặt nghiệm thu cốp pha hố ga tuyến D6	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.999527	13	TASK	2026-02-19	2026-02-26	8	0.1	5123	2026-09-25 10:31:24.13905+00
1207	1	\N	V.12-5124	Đổ bê tông hố ga tuyến D6	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.004787	13	TASK	2026-02-19	2026-02-26	8	0	5124	2026-09-25 10:31:24.144066+00
1208	1	\N	V.13-5125	Nghiêm thu công tác đổ bê tông hố ga tuyến D6	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.010104	13	TASK	2026-02-24	2026-03-03	8	0	5125	2026-09-25 10:31:24.149197+00
1209	1	\N	VI-5126	Hệ thống cấp thoát nước/Water supply and drainage system(D8)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.015813	13	TASK	2026-02-22	2026-02-21	\N	0	5126	2026-09-25 10:31:24.154674+00
1210	1	\N	VI.1-5127	Thi công đào, lấp đất/Excavation, backfill ( Cấp nước d 110)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.020969	13	TASK	2026-02-07	2026-03-23	45	0.6	5127	2026-09-25 10:31:24.159692+00
1211	1	\N	VI.2-5128	Thi công hệ thống ống âm đất (cấp nước,)Underground pipe system execution(water supply)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.026365	13	TASK	2026-03-04	2026-06-26	115	0.6	5128	2026-09-25 10:31:24.165156+00
1212	1	\N	VI.3-5129	Thi công hệ thống valve, vòi, trụ/ Valve system, ejector, pillar installation	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.03288	13	TASK	2026-06-17	2026-09-04	80	0	5129	2026-09-25 10:31:24.170522+00
1213	1	\N	VI.4-5130	Kiểm tra hệ thống cấp  nước/testing water supply system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.039194	13	TASK	2026-06-28	2026-09-05	70	0	5130	2026-09-25 10:31:24.175547+00
1214	1	\N	VI.5-5131	Thi công đào, lấp đất/Excavation, backfill( Thoát nước)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.044775	13	TASK	2026-02-07	2026-03-23	45	0.5	5131	2026-09-25 10:31:24.180625+00
1215	1	\N	VI.6-5132	Thi công hệ thống ống âm đất (thoát nước, thoát nước thải)Underground pipe system execution(water supply, drainage, sewage)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.050523	13	TASK	2026-03-04	2026-06-26	115	0.5	5132	2026-09-25 10:31:24.186845+00
1216	1	\N	VI.7-5133	Thi công hệ thống valve, vòi, trụ/ Valve system, ejector, pillar installation	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.056325	13	TASK	2026-06-17	2026-09-04	80	0	5133	2026-09-25 10:31:24.192171+00
1217	1	\N	VI.8-5134	Kiểm tra hệ thống cấp thoát nước/testing water supply system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.061764	13	TASK	2026-06-28	2026-09-05	70	0	5134	2026-09-25 10:31:24.197487+00
1218	1	\N	VI.9-5135	Thi công hệ thống bơm (nước cấp, nước thoát, bù áp)/ Pump system installtion (water supply, drainage, pump pressure)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.067186	13	TASK	2026-08-28	2026-11-02	67	0	5135	2026-09-25 10:31:24.203487+00
1219	1	\N	VII-5136	Hệ thống cấp thoát nước/Water supply and drainage system(D4)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.072819	13	TASK	2026-02-22	2026-02-21	\N	0	5136	2026-09-25 10:31:24.208737+00
1220	1	\N	VII.1-5137	Thi công đào, lấp đất/Excavation, backfill	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.078978	13	TASK	2026-02-22	2026-03-23	30	0	5137	2026-09-25 10:31:24.214552+00
1221	1	\N	VII.2-5138	Thi công hệ thống ống âm đất (cấp nước, thoát nước, thoát nước thải)Underground pipe system execution(water supply, drainage, sewage)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.083741	13	TASK	2026-03-19	2026-05-17	60	0	5138	2026-09-25 10:31:24.220259+00
1222	1	\N	VII.3-5139	Thi công hệ thống valve, vòi, trụ/ Valve system, ejector, pillar installation	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.089101	13	TASK	2026-05-23	2026-07-16	55	0	5139	2026-09-25 10:31:24.2257+00
1223	1	\N	VII.4-5140	Kiểm tra hệ thống cấp thoát nước/testing water supply system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.094715	13	TASK	2026-06-02	2026-07-18	47	0	5140	2026-09-25 10:31:24.231715+00
1224	1	\N	VII.5-5141	Thi công hệ thống bơm (nước cấp, nước thoát, bù áp)/ Pump system installtion (water supply, drainage, pump pressure)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.099594	13	TASK	2026-06-22	2026-07-27	36	0	5141	2026-09-25 10:31:24.237595+00
1225	1	\N	VIII-5142	Hệ thống cấp thoát nước/Water supply and drainage system(D2)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.105295	13	TASK	2026-02-07	2026-02-06	\N	0	5142	2026-09-25 10:31:24.244869+00
1189	1	\N	IV-5106	Hệ thống cấp thoát nước/Water supply and drainage system(D3)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.9049	13	TASK	2026-02-11	2026-02-10	\N	0	5106	2026-09-25 10:31:24.043508+00
1190	1	\N	IV.1-5107	Thi công đào, lấp đất/Excavation, backfill	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.910884	13	TASK	2026-02-11	2026-03-17	35	0	5107	2026-09-25 10:31:24.048533+00
1191	1	\N	IV.2-5108	Thi công hệ thống ống âm đất (cấp nước, thoát nước, thoát nước thải)Underground pipe system execution(water supply, drainage, sewage)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.916561	13	TASK	2026-03-08	2026-06-05	90	0	5108	2026-09-25 10:31:24.053819+00
1192	1	\N	IV.3-5109	Thi công hệ thống valve, vòi, trụ/ Valve system, ejector, pillar installation	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.922363	13	TASK	2026-04-13	2026-06-11	60	0	5109	2026-09-25 10:31:24.059615+00
1196	1	\N	V.1-5113	Thi công đào, lấp đất/Excavation, backfill ( Cấp nước d 110)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.946401	13	TASK	2026-02-07	2026-03-23	45	0.2	5113	2026-09-25 10:31:24.085885+00
1197	1	\N	V.2-5114	Thi công hệ thống ống âm đất (cấp nước,)Underground pipe system execution(water supply)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.951531	13	TASK	2026-03-04	2026-06-26	115	0.2	5114	2026-09-25 10:31:24.091793+00
1193	1	\N	IV.4-5110	Kiểm tra hệ thống cấp thoát nước/testing water supply system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.928933	13	TASK	2026-04-10	2026-06-13	65	0	5110	2026-09-25 10:31:24.066568+00
1194	1	\N	IV.5-5111	Thi công hệ thống bơm (nước cấp, nước thoát, bù áp)/ Pump system installtion (water supply, drainage, pump pressure)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.934999	13	TASK	2026-06-15	2026-08-03	50	0	5111	2026-09-25 10:31:24.073263+00
1195	1	\N	V-5112	Hệ thống cấp thoát nước/Water supply and drainage system(D6)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.94082	13	TASK	2026-02-07	2026-02-06	\N	0	5112	2026-09-25 10:31:24.079989+00
877	1	\N	VI.4-4794	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.386493	1	TASK	2026-07-17	2026-07-17	1	0	4794	2026-09-25 10:31:21.480191+00
860	1	\N	III.2-4777	Kiểm tra thử kín, thử áp hệ thống cấp thoát nước/testing water supply system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.281502	1	TASK	2026-04-17	2026-04-19	3	0	4777	2026-09-25 10:31:21.367763+00
861	1	\N	III.3-4778	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.287745	1	TASK	2026-04-23	2026-05-12	20	0	4778	2026-09-25 10:31:21.373643+00
862	1	\N	III.4-4779	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.293115	1	TASK	2026-05-12	2026-05-12	1	0	4779	2026-09-25 10:31:21.379421+00
863	1	\N	IV-4780	Hệ thống cấp thoát nước/Water supply and drainage system(Zone B)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.298531	1	TASK	2026-05-08	2026-05-07	\N	0	4780	2026-09-25 10:31:21.385732+00
864	1	\N	IV.1-4781	Lắp đặt đường ống nước cấp nước thoát/Water supply pipe system installation	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.30445	1	TASK	2026-05-08	2026-05-27	20	0	4781	2026-09-25 10:31:21.391647+00
865	1	\N	IV.2-4782	Kiểm tra thử kín, thử áp hệ thống cấp thoát nước/testing water supply system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.31024	1	TASK	2026-05-25	2026-05-27	3	0	4782	2026-09-25 10:31:21.397389+00
866	1	\N	IV.3-4783	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.316349	1	TASK	2026-06-04	2026-06-23	20	0	4783	2026-09-25 10:31:21.405177+00
867	1	\N	IV.4-4784	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.323278	1	TASK	2026-06-24	2026-06-24	1	0	4784	2026-09-25 10:31:21.412597+00
868	1	\N	V-4785	Hệ thống cấp thoát nước/Water supply and drainage system(Zone C)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.330168	1	TASK	2026-05-23	2026-05-22	\N	0	4785	2026-09-25 10:31:21.420681+00
869	1	\N	V.1-4786	Lắp đặt đường ống nước cấp nước thoát/Water supply pipe system installation	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.336203	1	TASK	2026-06-04	2026-06-23	20	0	4786	2026-09-25 10:31:21.427525+00
870	1	\N	V.2-4787	Kiểm tra thử kín, thử áp hệ thống cấp thoát nước/testing water supply system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.342768	1	TASK	2026-05-23	2026-05-25	3	0	4787	2026-09-25 10:31:21.434712+00
871	1	\N	V.3-4788	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.34853	1	TASK	2026-06-27	2026-07-11	15	0	4788	2026-09-25 10:31:21.441131+00
872	1	\N	V.4-4789	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.354532	1	TASK	2026-07-17	2026-07-17	1	0	4789	2026-09-25 10:31:21.447911+00
873	1	\N	VI-4790	Hệ thống cấp thoát nước/Water supply and drainage system(Zone D)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.361656	1	TASK	2026-06-11	2026-06-10	\N	0	4790	2026-09-25 10:31:21.454085+00
874	1	\N	VI.1-4791	Lắp đặt đường ống nước cấp nước thoát/Water supply pipe system installation	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.368925	1	TASK	2026-06-11	2026-06-30	20	0	4791	2026-09-25 10:31:21.459778+00
880	1	\N	A.1-4797	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.403381	1	TASK	2026-06-20	2026-06-20	1	0	4797	2026-09-25 10:31:21.5004+00
881	1	\N	A.2-4798	Thi công lắp đặt ống đồng và bảo ôn tầng T2/Installing copper pipe and heat insulation floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.409988	1	TASK	2026-06-22	2026-06-24	3	0	4798	2026-09-25 10:31:21.507198+00
883	1	\N	A.4-4800	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T2/Installing sealing water pipe and heat insulation floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.421245	1	TASK	2026-04-08	2026-04-10	3	0	4800	2026-09-25 10:31:21.522427+00
884	1	\N	A.5-4801	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.426675	1	TASK	2026-06-20	2026-06-21	2	0	4801	2026-09-25 10:31:21.529209+00
885	1	\N	A.6-4802	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T2/Installing air duct and heat insulation floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.432784	1	TASK	2026-06-23	2026-06-25	3	0	4802	2026-09-25 10:31:21.535857+00
886	1	\N	A.7-4803	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.438548	1	TASK	2026-05-01	2026-05-01	1	0	4803	2026-09-25 10:31:21.542875+00
887	1	\N	A.8-4804	Thi công lắp đặt ống luồn dây tiến hiệu và điều khiển tầng T2/Installing signal of conduit and controlling floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.444092	1	TASK	2026-05-03	2026-05-05	3	0	4804	2026-09-25 10:31:21.549495+00
888	1	\N	A.9-4805	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.450083	1	TASK	2026-06-22	2026-06-23	2	0	4805	2026-09-25 10:31:21.55604+00
889	1	\N	A.10-4806	Thử áp đường ống đồng tầng T2/Testing pressure copper pipe floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.455678	1	TASK	2026-06-26	2026-06-27	2	0	4806	2026-09-25 10:31:21.563129+00
890	1	\N	A.11-4807	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.460966	1	TASK	2026-03-31	2026-03-31	1	0	4807	2026-09-25 10:31:21.569732+00
875	1	\N	VI.2-4792	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.375287	1	TASK	2026-03-29	2026-07-29	\N	\N	4792	2026-09-25 10:31:21.486528+00
876	1	\N	VI.3-4793	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.38096	1	TASK	2026-07-02	2026-07-16	15	0	4793	2026-09-25 10:31:21.473919+00
852	1	\N	I.2-4769	Lắp đặt đường ống thoát âm sàn phòng bơm/Floor recessed pipe installation for pumper room	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.231033	1	TASK	2026-02-23	2026-03-04	10	0.8	4769	2026-09-25 10:31:21.306451+00
853	1	\N	I.3-4770	Bể STP: Lắp đặt ống slevee upvc	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.23664	1	TASK	2026-02-07	2026-02-26	20	0.9	4770	2026-09-25 10:31:21.31359+00
854	1	\N	I.4-4771	Lắp đặt đường ống cấp, máy bơm,van... /Water supply pipe installation, pumper, valve	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.242643	1	TASK	2026-05-08	2026-06-07	31	0	4771	2026-09-25 10:31:21.320783+00
859	1	\N	III.1-4776	Lắp đặt đường ống nước cấp nước thoát/Water supply pipe system installation	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.275148	1	TASK	2026-03-29	2026-04-17	20	0	4776	2026-09-25 10:31:21.361524+00
855	1	\N	I.5-4772	Lắp đặt bơm nước mưa/Rain water pumper installation	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.248827	1	TASK	2026-06-28	2026-07-12	15	0	4772	2026-09-25 10:31:21.328781+00
856	1	\N	II-4773	Hệ thống cấp thoát nước/Water supply and drainage system( Retaining wall & Car parking)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.257157	1	TASK	2026-03-29	2026-03-28	\N	0	4773	2026-09-25 10:31:21.340228+00
857	1	\N	II.1-4774	Lắp đặt ống Upvc chờ /Sleeve pipe installation installation	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.26391	1	TASK	2026-05-01	2026-05-30	30	0	4774	2026-09-25 10:31:21.347471+00
858	1	\N	III-4775	Hệ thống cấp thoát nước/Water supply and drainage system(Zone A)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.269925	1	TASK	2026-03-29	2026-03-28	\N	0	4775	2026-09-25 10:31:21.355482+00
903	1	\N	B.2-4820	Thi công lắp đặt ống đồng và bảo ôn tầng T2/Installing copper pipe and heat insulation floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.534922	1	TASK	2026-06-20	2026-06-22	3	0	4820	2026-09-25 10:31:21.656492+00
904	1	\N	B.3-4821	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.540241	1	TASK	2026-03-29	2026-03-29	1	0	4821	2026-09-25 10:31:21.663299+00
905	1	\N	B.4-4822	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T2/Installing sealing water pipe and heat insulation floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.546312	1	TASK	2026-03-29	2026-03-30	2	0	4822	2026-09-25 10:31:21.671363+00
906	1	\N	B.5-4823	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.552431	1	TASK	2026-06-20	2026-06-21	2	0	4823	2026-09-25 10:31:21.678621+00
907	1	\N	B.6-4824	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T2/Installing air duct and heat insulation floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.5582	1	TASK	2026-06-20	2026-06-21	2	0	4824	2026-09-25 10:31:21.686199+00
908	1	\N	B.7-4825	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.563299	1	TASK	2026-05-01	2026-05-02	2	0	4825	2026-09-25 10:31:21.692376+00
909	1	\N	B.8-4826	Thi công lắp đặt ống luồn dây tiến hiệu và điều khiển tầng T2/Installing signal of conduit and controlling floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.56926	1	TASK	2026-05-01	2026-05-03	3	0	4826	2026-09-25 10:31:21.699039+00
910	1	\N	B.9-4827	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.574799	1	TASK	2026-06-21	2026-06-23	3	0	4827	2026-09-25 10:31:21.704871+00
911	1	\N	B.10-4828	Thử áp đường ống đồng tầng T2/Testing pressure copper pipe floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.579842	1	TASK	2026-06-24	2026-06-24	1	0	4828	2026-09-25 10:31:21.710255+00
912	1	\N	B.11-4829	Thử kín đường ống nước ngưng tầng T2/Testing sealing water pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.585586	1	TASK	2026-03-30	2026-03-31	2	0	4829	2026-09-25 10:31:21.715728+00
913	1	\N	B.12-4830	Thử kín đường ống nước ngưng tầng T2/Testing sealing water pipe floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.591332	1	TASK	2026-04-01	2026-04-01	1	0	4830	2026-09-25 10:31:21.7211+00
914	1	\N	B.13-4831	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.596345	1	TASK	2026-04-01	2026-04-02	2	0	4831	2026-09-25 10:31:21.726265+00
915	1	\N	B.14-4832	Lắp đặt thiết bị quạt thông gió tầng T2/Installing air duct fan equipment floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.602262	1	TASK	2026-04-22	2026-04-22	1	0	4832	2026-09-25 10:31:21.732175+00
916	1	\N	B.15-4833	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.607951	1	TASK	2026-06-20	2026-06-21	2	0	4833	2026-09-25 10:31:21.737516+00
917	1	\N	B.16-4834	Lắp đặt thiết bị điều hòa không khí tầng T2/Installing air conditional equipment floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.613105	1	TASK	2026-06-21	2026-06-22	2	0	4834	2026-09-25 10:31:21.743112+00
918	1	\N	B.17-4835	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.618779	1	TASK	2026-06-21	2026-06-23	3	0	4835	2026-09-25 10:31:21.748589+00
919	1	\N	B.18-4836	Lắp đặt thiết bị điều khiển tầng T2/Installing controling equipment floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.624657	1	TASK	2026-06-24	2026-06-24	1	0	4836	2026-09-25 10:31:21.753918+00
920	1	\N	B.19-4837	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.630731	1	TASK	2026-06-21	2026-06-22	2	0	4837	2026-09-25 10:31:21.759378+00
921	1	\N	B.20-4838	Lắp đặt cửa gió tầng T2/Installing air diffuser floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.635915	1	TASK	2026-06-26	2026-06-26	1	0	4838	2026-09-25 10:31:21.765352+00
922	1	\N	B.21-4839	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.64169	1	TASK	2026-07-29	2026-07-29	1	0	4839	2026-09-25 10:31:21.771091+00
924	1	\N	C.1-4841	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.652742	1	TASK	2026-06-20	2026-06-21	2	0	4841	2026-09-25 10:31:21.781976+00
925	1	\N	C.2-4842	Thi công lắp đặt ống đồng và bảo ôn tầng T2/Installing copper pipe and heat insulation floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.658777	1	TASK	2026-06-23	2026-06-24	2	0	4842	2026-09-25 10:31:21.78722+00
926	1	\N	C.3-4843	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.664431	1	TASK	2026-03-29	2026-03-30	2	0	4843	2026-09-25 10:31:21.792953+00
927	1	\N	C.4-4844	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T2/Installing sealing water pipe and heat insulation floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.669618	1	TASK	2026-04-01	2026-04-02	2	0	4844	2026-09-25 10:31:21.798935+00
928	1	\N	C.5-4845	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.675115	1	TASK	2026-06-20	2026-06-21	2	0	4845	2026-09-25 10:31:21.804559+00
929	1	\N	C.6-4846	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T2/Installing air duct and heat insulation floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.680795	1	TASK	2026-06-21	2026-06-22	2	0	4846	2026-09-25 10:31:21.810208+00
893	1	\N	A.14-4810	Lắp đặt thiết bị quạt thông gió tầng T2/Installing air duct fan equipment floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.477868	1	TASK	2026-06-27	2026-06-28	2	0	4810	2026-09-25 10:31:21.591963+00
894	1	\N	A.15-4811	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.483132	1	TASK	2026-06-23	2026-06-23	1	0	4811	2026-09-25 10:31:21.59816+00
895	1	\N	A.16-4812	Lắp đặt thiết bị điều hòa không khí tầng T2/Installing air conditional equipment floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.488805	1	TASK	2026-06-25	2026-06-28	4	0	4812	2026-09-25 10:31:21.604288+00
896	1	\N	A.17-4813	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.494581	1	TASK	2026-06-30	2026-06-30	1	0	4813	2026-09-25 10:31:21.610268+00
897	1	\N	A.18-4814	Lắp đặt thiết bị điều khiển tầng T2/Installing controling equipment floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.499829	1	TASK	2026-07-02	2026-07-03	2	0	4814	2026-09-25 10:31:21.615731+00
898	1	\N	A.19-4815	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.506056	1	TASK	2026-06-25	2026-06-25	1	0	4815	2026-09-25 10:31:21.622098+00
899	1	\N	A.20-4816	Lắp đặt cửa gió tầng T2/Installing air diffuser floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.512323	1	TASK	2026-06-30	2026-06-30	1	0	4816	2026-09-25 10:31:21.628038+00
900	1	\N	A.21-4817	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.517915	1	TASK	2026-07-19	2026-07-19	1	0	4817	2026-09-25 10:31:21.635128+00
902	1	\N	B.1-4819	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.529306	1	TASK	2026-06-20	2026-06-20	1	0	4819	2026-09-25 10:31:21.648686+00
942	1	\N	C.19-4859	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.754603	1	TASK	2026-07-15	2026-07-15	1	0	4859	2026-09-25 10:31:21.889175+00
943	1	\N	C.20-4860	Lắp đặt cửa gió tầng T2/Installing air diffuser floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.760729	1	TASK	2026-07-17	2026-07-17	1	0	4860	2026-09-25 10:31:21.894443+00
944	1	\N	C.21-4861	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.766908	1	TASK	2026-07-19	2026-07-19	1	0	4861	2026-09-25 10:31:21.899677+00
946	1	\N	D.1-4863	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.77803	1	TASK	2026-06-20	2026-06-21	2	0	4863	2026-09-25 10:31:21.910672+00
947	1	\N	D.2-4864	Thi công lắp đặt ống đồng và bảo ôn tầng T2/Installing copper pipe and heat insulation floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.784425	1	TASK	2026-06-23	2026-06-27	5	0	4864	2026-09-25 10:31:21.915867+00
948	1	\N	D.3-4865	Thi công lắp đặt ống đồng và bảo ôn tầng mái/Installing copper pipe and heat insulation floor3	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.789335	1	TASK	2026-06-29	2026-07-03	5	0	4865	2026-09-25 10:31:21.921797+00
950	1	\N	D.5-4867	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T2/Installing sealing water pipe and heat insulation floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.801253	1	TASK	2026-03-31	2026-04-04	5	0	4867	2026-09-25 10:31:21.932762+00
951	1	\N	D.6-4868	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T2/Installing sealing water pipe and heat insulation floor3	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.807237	1	TASK	2026-04-06	2026-04-10	5	0	4868	2026-09-25 10:31:21.93813+00
953	1	\N	D.8-4870	Thi công lắp đặt ống luồn dây tiến hiệu và điều khiển tầng T2/Installing signal of conduit and controlling floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.819356	1	TASK	2026-06-23	2026-06-27	5	0	4870	2026-09-25 10:31:21.948156+00
954	1	\N	D.9-4871	Thi công lắp đặt ống luồn dây tiến hiệu và điều khiển tầng T2/Installing signal of conduit and controlling floor3	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.825925	1	TASK	2026-06-29	2026-07-03	5	0	4871	2026-09-25 10:31:21.953444+00
955	1	\N	D.10-4872	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.832464	1	TASK	2026-06-23	2026-06-23	1	0	4872	2026-09-25 10:31:21.958941+00
956	1	\N	D.11-4873	Thử áp đường ống đồng tầng T2/Testing pressure copper pipe floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.838365	1	TASK	2026-06-29	2026-06-29	1	0	4873	2026-09-25 10:31:21.963913+00
957	1	\N	D.12-4874	Thử áp đường ống đồng tầng T3/Testing pressure copper pipe floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.844098	1	TASK	2026-07-05	2026-07-05	1	0	4874	2026-09-25 10:31:21.969282+00
958	1	\N	D.13-4875	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.850479	1	TASK	2026-03-31	2026-03-31	1	0	4875	2026-09-25 10:31:21.974505+00
959	1	\N	D.14-4876	Thử kín đường ống nước ngưng tầng T2/Testing sealing water pipe floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.8565	1	TASK	2026-04-06	2026-04-06	1	0	4876	2026-09-25 10:31:21.979701+00
960	1	\N	D.15-4877	Thử kín đường ống nước ngưng tầng T2/Testing sealing water pipe floor3	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.861733	1	TASK	2026-04-12	2026-04-12	1	0	4877	2026-09-25 10:31:21.985654+00
961	1	\N	D.16-4878	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.867459	1	TASK	2026-07-05	2026-07-06	2	0	4878	2026-09-25 10:31:21.991023+00
962	1	\N	D.17-4879	Lắp đặt thiết bị quạt thông gió tầng T2/Installing air duct fan equipment floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.873233	1	TASK	2026-07-05	2026-07-06	2	0	4879	2026-09-25 10:31:21.99638+00
963	1	\N	D.18-4880	Lắp đặt thiết bị quạt thông gió tầng mái/Installing air duct fan equipment rooftop	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.878688	1	TASK	2026-07-08	2026-07-09	2	0	4880	2026-09-25 10:31:22.001715+00
964	1	\N	D.19-4881	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.884041	1	TASK	2026-07-05	2026-07-06	2	0	4881	2026-09-25 10:31:22.00673+00
965	1	\N	D.20-4882	Lắp đặt thiết bị điều hòa không khí tầng T2/Installing air conditional equipment floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.890064	1	TASK	2026-07-07	2026-07-09	3	0	4882	2026-09-25 10:31:22.012024+00
966	1	\N	D.21-4883	Lắp đặt thiết bị điều hòa không khí tầng mái/Installing air conditional equipment rooftop	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.895942	1	TASK	2026-07-10	2026-07-12	3	0	4883	2026-09-25 10:31:22.01752+00
967	1	\N	D.22-4884	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.901069	1	TASK	2026-07-05	2026-07-05	1	0	4884	2026-09-25 10:31:22.022771+00
968	1	\N	D.23-4885	Lắp đặt thiết bị điều khiển tầng T2/Installing controling equipment floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.906853	1	TASK	2026-07-07	2026-07-07	1	0	4885	2026-09-25 10:31:22.028237+00
969	1	\N	D.24-4886	Lắp đặt thiết bị điều khiển tầng T2/Installing controling equipment floor3	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.912854	1	TASK	2026-07-09	2026-07-09	1	0	4886	2026-09-25 10:31:22.03356+00
933	1	\N	C.10-4850	Thử áp đường ống đồng tầng T2/Testing pressure copper pipe floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.703675	1	TASK	2026-06-26	2026-06-26	1	0	4850	2026-09-25 10:31:21.833478+00
934	1	\N	C.11-4851	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.708626	1	TASK	2026-04-01	2026-04-01	1	0	4851	2026-09-25 10:31:21.840625+00
935	1	\N	C.12-4852	Thử kín đường ống nước ngưng tầng T2/Testing sealing water pipe floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.714519	1	TASK	2026-04-04	2026-04-04	1	0	4852	2026-09-25 10:31:21.847005+00
936	1	\N	C.13-4853	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.720611	1	TASK	2026-04-01	2026-04-01	1	0	4853	2026-09-25 10:31:21.852863+00
940	1	\N	C.17-4857	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.743726	1	TASK	2026-06-27	2026-06-27	1	0	4857	2026-09-25 10:31:21.878186+00
941	1	\N	C.18-4858	Lắp đặt thiết bị điều khiển tầng T2/Installing controling equipment floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.748792	1	TASK	2026-06-29	2026-06-29	1	0	4858	2026-09-25 10:31:21.88364+00
937	1	\N	C.14-4854	Lắp đặt thiết bị quạt thông gió tầng T2/Installing air duct fan equipment floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.726318	1	TASK	2026-04-22	2026-04-23	2	0	4854	2026-09-25 10:31:21.859027+00
938	1	\N	C.15-4855	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.7316	1	TASK	2026-06-25	2026-06-25	1	0	4855	2026-09-25 10:31:21.864395+00
939	1	\N	C.16-4856	Lắp đặt thiết bị điều hòa không khí tầng T2/Installing air conditional equipment floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.737478	1	TASK	2026-06-28	2026-06-29	2	0	4856	2026-09-25 10:31:21.869953+00
982	1	\N	II.3-4899	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.064831	3	TASK	2026-06-17	2026-06-18	2	\N	4899	2026-09-25 10:31:22.170854+00
983	1	\N	II.4-4900	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.070107	3	TASK	2026-06-01	2026-06-02	2	\N	4900	2026-09-25 10:31:22.176781+00
984	1	\N	II.5-4901	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.075283	3	TASK	2026-06-01	2026-06-01	1	\N	4901	2026-09-25 10:31:22.182525+00
985	1	\N	II.6-4902	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.081003	3	TASK	2026-05-31	2026-05-31	1	\N	4902	2026-09-25 10:31:22.188049+00
986	1	\N	II.7-4903	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.086258	3	TASK	2026-06-20	2026-06-20	1	\N	4903	2026-09-25 10:31:22.194096+00
987	1	\N	ROW-32-4904	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.091741	3	TASK	2026-06-01	2026-06-01	1	\N	4904	2026-09-25 10:31:22.199937+00
988	1	\N	ROW-33-4905	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.097741	3	TASK	2026-06-02	2026-06-02	1	\N	4905	2026-09-25 10:31:22.210924+00
989	1	\N	ROW-34-4906	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.103024	3	TASK	2026-08-12	2026-08-12	1	\N	4906	2026-09-25 10:31:22.220039+00
990	1	\N	ROW-35-4907	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.10857	3	TASK	2026-08-13	2026-08-13	1	\N	4907	2026-09-25 10:31:22.226932+00
991	1	\N	A-4908	BPV- 2BR	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.186083	4	TASK	2026-04-06	2026-10-13	\N	\N	4908	2026-09-25 10:31:22.362655+00
992	1	\N	I-4909	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.19227	4	TASK	2026-04-06	2026-10-13	\N	\N	4909	2026-09-25 10:31:22.36981+00
993	1	\N	I.1-4910	Thi công lắp đặt đường ống cấp nước /Installing water pipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.198863	4	TASK	2026-06-23	2026-07-12	20	0	4910	2026-09-25 10:31:22.376011+00
994	1	\N	I.2-4911	Thi công lắp đặt đường ống thoát nước/Installing drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.205697	4	TASK	2026-04-06	2026-04-10	5	0	4911	2026-09-25 10:31:22.381158+00
995	1	\N	I.3-4912	Kiểm tra thử áp đường ống cấp nước/ Testing pressure of drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.211767	4	TASK	2026-07-05	2026-07-14	10	0	4912	2026-09-25 10:31:22.386446+00
996	1	\N	I.4-4913	Kiểm tra thử kín đường ống thoát nước/Testing drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.221088	4	TASK	2026-04-11	2026-04-20	10	0	4913	2026-09-25 10:31:22.392551+00
997	1	\N	I.5-4914	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.228458	4	TASK	2026-09-29	2026-10-13	15	0	4914	2026-09-25 10:31:22.397806+00
998	1	\N	I.6-4915	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.234595	4	TASK	2026-10-04	2026-10-13	10	0	4915	2026-09-25 10:31:22.403322+00
999	1	\N	II-4916	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.240185	4	TASK	2026-05-29	2026-08-13	\N	\N	4916	2026-09-25 10:31:22.408659+00
1000	1	\N	II.1-4917	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.245837	4	TASK	2026-05-29	2026-05-30	2	0	4917	2026-09-25 10:31:22.413638+00
1001	1	\N	II.2-4918	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.251254	4	TASK	2026-05-29	2026-05-29	1	0	4918	2026-09-25 10:31:22.418778+00
1002	1	\N	II.3-4919	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.257046	4	TASK	2026-06-17	2026-06-20	4	0	4919	2026-09-25 10:31:22.424515+00
1003	1	\N	II.4-4920	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.262342	4	TASK	2026-06-01	2026-06-02	2	0	4920	2026-09-25 10:31:22.42954+00
1004	1	\N	II.5-4921	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.268011	4	TASK	2026-06-01	2026-06-01	1	0	4921	2026-09-25 10:31:22.434901+00
1005	1	\N	II.6-4922	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.273653	4	TASK	2026-05-31	2026-05-31	1	0	4922	2026-09-25 10:31:22.440391+00
1006	1	\N	II.7-4923	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.27886	4	TASK	2026-06-22	2026-06-22	1	0	4923	2026-09-25 10:31:22.445198+00
1007	1	\N	II.8-4924	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.284429	4	TASK	2026-06-01	2026-06-01	1	0	4924	2026-09-25 10:31:22.450665+00
1008	1	\N	II.9-4925	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.290181	4	TASK	2026-06-02	2026-06-02	1	0	4925	2026-09-25 10:31:22.456209+00
1009	1	\N	II.10-4926	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.295291	4	TASK	2026-08-12	2026-08-12	1	0	4926	2026-09-25 10:31:22.461223+00
1010	1	\N	II.11-4927	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.300958	4	TASK	2026-08-13	2026-08-13	1	0	4927	2026-09-25 10:31:22.466128+00
1011	1	\N	A-4928	BUSINES CENTER	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.361996	9	TASK	2026-05-12	2026-09-26	\N	\N	4928	2026-09-25 10:31:22.567619+00
1012	1	\N	I-4929	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.367799	9	TASK	2026-05-12	2026-09-26	\N	\N	4929	2026-09-25 10:31:22.574347+00
971	1	\N	A-4888	BPV- 1BR	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.002258	3	TASK	2026-03-12	2026-10-11	\N	\N	4888	2026-09-25 10:31:22.111914+00
972	1	\N	I-4889	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.008017	3	TASK	2026-03-12	2026-10-11	\N	\N	4889	2026-09-25 10:31:22.117441+00
973	1	\N	I.1-4890	Thi công lắp đặt đường ống cấp nước /Installing water pipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.013214	3	TASK	2026-06-16	2026-07-05	20	\N	4890	2026-09-25 10:31:22.122945+00
974	1	\N	I.2-4891	Thi công lắp đặt đường ống thoát nước/Installing drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.019195	3	TASK	2026-03-12	2026-03-16	5	0.05	4891	2026-09-25 10:31:22.128284+00
975	1	\N	I.3-4892	Kiểm tra thử áp đường ống cấp nước/ Testing pressure of drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.025467	3	TASK	2026-06-23	2026-07-02	10	\N	4892	2026-09-25 10:31:22.133301+00
976	1	\N	I.4-4893	Kiểm tra thử kín đường ống thoát nước/Testing drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.030668	3	TASK	2026-03-17	2026-03-26	10	\N	4893	2026-09-25 10:31:22.13857+00
977	1	\N	I.5-4894	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.035935	3	TASK	2026-09-16	2026-10-10	25	\N	4894	2026-09-25 10:31:22.143902+00
978	1	\N	I.6-4895	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.041734	3	TASK	2026-10-02	2026-10-11	10	\N	4895	2026-09-25 10:31:22.149643+00
979	1	\N	II-4896	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.047295	3	TASK	2026-05-29	2026-08-13	\N	\N	4896	2026-09-25 10:31:22.15542+00
981	1	\N	II.2-4898	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.058778	3	TASK	2026-05-29	2026-05-29	1	\N	4898	2026-09-25 10:31:22.16579+00
1025	1	\N	II.6-4942	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.44446	9	TASK	2026-06-25	2026-06-25	1	0	4942	2026-09-25 10:31:22.647967+00
1026	1	\N	II.7-4943	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.449777	9	TASK	2026-07-18	2026-07-18	1	0	4943	2026-09-25 10:31:22.653088+00
1027	1	\N	II.8-4944	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.454976	9	TASK	2026-07-18	2026-07-18	1	0	4944	2026-09-25 10:31:22.6585+00
553	1	\N	ROW-3443-3443	TỔNG TIẾN ĐỘ THI CÔNG	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	3	TASK	2026-03-12	2026-10-11	213	\N	3443	2026-09-23 21:27:05.011382+00
1028	1	\N	II.9-4945	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.4605	9	TASK	2026-07-19	2026-07-19	1	0	4945	2026-09-25 10:31:22.663855+00
1029	1	\N	II.10-4946	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.466028	9	TASK	2026-09-21	2026-09-21	1	0	4946	2026-09-25 10:31:22.668757+00
1030	1	\N	II.11-4947	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.470943	9	TASK	2026-09-23	2026-09-23	1	0	4947	2026-09-25 10:31:22.674302+00
1031	1	\N	I-4948	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.534207	6	TASK	2026-05-12	2026-09-26	\N	\N	4948	2026-09-25 10:31:22.747037+00
1032	1	\N	I.1-4949	Thi công lắp đặt đường ống cấp nước /Installing water pipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.541354	6	TASK	2026-06-23	2026-07-02	10	0	4949	2026-09-25 10:31:22.752803+00
1033	1	\N	I.2-4950	Thi công lắp đặt đường ống thoát nước/Installing drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.547922	6	TASK	2026-05-12	2026-05-16	5	0	4950	2026-09-25 10:31:22.757932+00
1034	1	\N	I.3-4951	Kiểm tra thử áp đường ống cấp nước/ Testing pressure of drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.554413	6	TASK	2026-07-03	2026-07-05	3	0	4951	2026-09-25 10:31:22.763334+00
1035	1	\N	I.4-4952	Kiểm tra thử kín đường ống thoát nước/Testing drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.559746	6	TASK	2026-05-18	2026-05-20	3	0	4952	2026-09-25 10:31:22.768954+00
1036	1	\N	I.5-4953	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.565763	6	TASK	2026-09-20	2026-09-26	7	0	4953	2026-09-25 10:31:22.77431+00
1037	1	\N	I.6-4954	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.571472	6	TASK	2026-09-24	2026-09-26	3	0	4954	2026-09-25 10:31:22.779862+00
1038	1	\N	II-4955	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.576904	6	TASK	2026-06-02	2026-10-04	\N	\N	4955	2026-09-25 10:31:22.785421+00
1039	1	\N	II.1-4956	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.582148	6	TASK	2026-07-04	2026-07-05	2	0	4956	2026-09-25 10:31:22.791061+00
1040	1	\N	II.2-4957	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.587808	6	TASK	2026-07-04	2026-07-04	1	0	4957	2026-09-25 10:31:22.79712+00
1041	1	\N	II.3-4958	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.593085	6	TASK	2026-06-02	2026-06-04	3	0	4958	2026-09-25 10:31:22.802893+00
1042	1	\N	II.4-4959	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.598436	6	TASK	2026-07-04	2026-07-05	2	0	4959	2026-09-25 10:31:22.808271+00
1043	1	\N	II.5-4960	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.603878	6	TASK	2026-07-07	2026-07-07	1	0	4960	2026-09-25 10:31:22.813409+00
1044	1	\N	II.6-4961	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.609292	6	TASK	2026-07-06	2026-07-06	1	0	4961	2026-09-25 10:31:22.81881+00
1045	1	\N	II.7-4962	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.61446	6	TASK	2026-07-29	2026-07-29	1	0	4962	2026-09-25 10:31:22.823661+00
1046	1	\N	II.8-4963	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.619737	6	TASK	2026-07-29	2026-07-29	1	0	4963	2026-09-25 10:31:22.828764+00
1047	1	\N	II.9-4964	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.625598	6	TASK	2026-07-29	2026-07-29	1	0	4964	2026-09-25 10:31:22.835025+00
1048	1	\N	II.10-4965	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.631258	6	TASK	2026-10-02	2026-10-02	1	0	4965	2026-09-25 10:31:22.840843+00
1049	1	\N	II.11-4966	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.636835	6	TASK	2026-10-04	2026-10-04	1	0	4966	2026-09-25 10:31:22.847531+00
1050	1	\N	A-4967	BZONE	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.707915	7	TASK	2026-02-14	2026-10-12	\N	\N	4967	2026-09-25 10:31:22.924051+00
423	1	\N	ROW-3863-3863	TỔNG TIẾN ĐỘ THI CÔNG	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	45	TASK	2026-05-19	2026-10-21	155	\N	3863	2026-09-23 21:27:05.011382+00
425	1	\N	.3-3868	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	45	TASK	2026-07-06	2026-07-08	3	0.35	3868	2026-09-23 21:27:05.011382+00
1014	1	\N	I.2-4931	Thi công lắp đặt đường ống thoát nước/Installing drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.379333	9	TASK	2026-05-12	2026-05-16	5	0	4931	2026-09-25 10:31:22.586586+00
1015	1	\N	I.3-4932	Kiểm tra thử áp đường ống cấp nước/ Testing pressure of drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.385882	9	TASK	2026-07-03	2026-07-05	3	0	4932	2026-09-25 10:31:22.592357+00
1016	1	\N	I.4-4933	Kiểm tra thử kín đường ống thoát nước/Testing drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.392389	9	TASK	2026-05-18	2026-05-20	3	0	4933	2026-09-25 10:31:22.598519+00
1017	1	\N	I.5-4934	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.397923	9	TASK	2026-09-20	2026-09-26	7	0	4934	2026-09-25 10:31:22.603861+00
1018	1	\N	I.6-4935	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.403937	9	TASK	2026-09-24	2026-09-26	3	0	4935	2026-09-25 10:31:22.609144+00
1019	1	\N	II-4936	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.41104	9	TASK	2026-05-22	2026-09-23	\N	\N	4936	2026-09-25 10:31:22.615598+00
1021	1	\N	II.2-4938	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.421949	9	TASK	2026-06-23	2026-06-23	1	0	4938	2026-09-25 10:31:22.62642+00
1022	1	\N	II.3-4939	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.427897	9	TASK	2026-05-22	2026-05-24	3	0	4939	2026-09-25 10:31:22.631864+00
1023	1	\N	II.4-4940	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.432991	9	TASK	2026-06-23	2026-06-24	2	0	4940	2026-09-25 10:31:22.637105+00
1024	1	\N	II.5-4941	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.438058	9	TASK	2026-06-26	2026-06-26	1	0	4941	2026-09-25 10:31:22.642747+00
426	1	\N	.5-3870	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	45	TASK	2026-08-09	2026-08-09	1	0.35	3870	2026-09-23 21:27:05.011382+00
427	1	\N	.6-3871	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	45	TASK	2026-08-08	2026-08-08	1	0.35	3871	2026-09-23 21:27:05.011382+00
428	1	\N	.7-3879	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	45	TASK	2026-08-31	2026-08-31	1	0.35	3879	2026-09-23 21:27:05.011382+00
429	1	\N	I-3865	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	45	TASK	2026-06-01	2026-10-21	\N	\N	3865	2026-09-23 21:27:05.011382+00
430	1	\N	II-3872	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	45	TASK	2026-07-06	2026-10-17	\N	\N	3872	2026-09-23 21:27:05.011382+00
431	1	\N	.8-3880	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	45	TASK	2026-08-31	2026-08-31	1	0.35	3880	2026-09-23 21:27:05.011382+00
432	1	\N	.9-3881	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	45	TASK	2026-08-31	2026-08-31	1	0	3881	2026-09-23 21:27:05.011382+00
433	1	\N	.10-3882	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	45	TASK	2026-10-15	2026-10-15	1	0.35	3882	2026-09-23 21:27:05.011382+00
434	1	\N	.11-3883	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	45	TASK	2026-10-17	2026-10-17	1	0	3883	2026-09-23 21:27:05.011382+00
435	1	\N	.1-3866	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	45	TASK	2026-08-06	2026-08-07	2	0.35	3866	2026-09-23 21:27:05.011382+00
436	1	\N	.2-3867	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	45	TASK	2026-08-06	2026-08-06	1	0.35	3867	2026-09-23 21:27:05.011382+00
437	1	\N	.8-3359	Thi công lắp đặt ống luồn dây tiến hiệu và điều khiển tầng T2/Installing signal of conduit and controlling floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	1	TASK	2026-06-23	2026-06-27	5	1	3359	2026-09-23 21:27:05.011382+00
438	1	\N	.9-3360	Thi công lắp đặt ống luồn dây tiến hiệu và điều khiển tầng T2/Installing signal of conduit and controlling floor3	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	1	TASK	2026-06-29	2026-07-03	5	1	3360	2026-09-23 21:27:05.011382+00
439	1	\N	.11-3362	Thử áp đường ống đồng tầng T2/Testing pressure copper pipe floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	1	TASK	2026-06-29	2026-06-29	1	1	3362	2026-09-23 21:27:05.011382+00
440	1	\N	.12-3363	Thử áp đường ống đồng tầng T3/Testing pressure copper pipe floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	1	TASK	2026-07-05	2026-07-05	1	1	3363	2026-09-23 21:27:05.011382+00
441	1	\N	.13-3319	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	1	TASK	2026-03-31	2026-03-31	1	1	3319	2026-09-23 21:27:05.011382+00
442	1	\N	.15-3321	Thử kín đường ống nước ngưng tầng T2/Testing sealing water pipe floor3	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	1	TASK	2026-04-12	2026-04-12	1	1	3321	2026-09-23 21:27:05.011382+00
443	1	\N	.16-3367	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	1	TASK	2026-07-05	2026-07-06	2	1	3367	2026-09-23 21:27:05.011382+00
444	1	\N	.1-3446	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	3	TASK	2026-05-29	2026-05-30	2	1	3446	2026-09-23 21:27:05.011382+00
446	1	\N	.2-3447	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	3	TASK	2026-05-29	2026-05-29	1	1	3447	2026-09-23 21:27:05.011382+00
447	1	\N	.3-3448	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	3	TASK	2026-06-17	2026-06-18	2	1	3448	2026-09-23 21:27:05.011382+00
448	1	\N	.17-3368	Lắp đặt thiết bị quạt thông gió tầng T2/Installing air duct fan equipment floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	1	TASK	2026-07-05	2026-07-06	2	1	3368	2026-09-23 21:27:05.011382+00
449	1	\N	.18-3369	Lắp đặt thiết bị quạt thông gió tầng mái/Installing air duct fan equipment rooftop	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	1	TASK	2026-07-08	2026-07-09	2	1	3369	2026-09-23 21:27:05.011382+00
450	1	\N	.19-3370	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	1	TASK	2026-07-05	2026-07-06	2	1	3370	2026-09-23 21:27:05.011382+00
451	1	\N	.20-3371	Lắp đặt thiết bị điều hòa không khí tầng T2/Installing air conditional equipment floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	1	TASK	2026-07-07	2026-07-09	3	1	3371	2026-09-23 21:27:05.011382+00
452	1	\N	.22-3439	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	1	TASK	2026-07-05	2026-07-05	1	1	3439	2026-09-23 21:27:05.011382+00
453	1	\N	.24-3441	Lắp đặt thiết bị điều khiển tầng T2/Installing controling equipment floor3	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	1	TASK	2026-07-09	2026-07-09	1	1	3441	2026-09-23 21:27:05.011382+00
454	1	\N	.25-3442	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	1	TASK	2026-07-14	2026-07-14	1	1	3442	2026-09-23 21:27:05.011382+00
455	1	\N	.10-3462	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	3	TASK	2026-08-12	2026-08-12	1	1	3462	2026-09-23 21:27:05.011382+00
456	1	\N	.11-3463	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	3	TASK	2026-08-13	2026-08-13	1	0.35	3463	2026-09-23 21:27:05.011382+00
457	1	\N	.2-3468	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	4	TASK	2026-05-29	2026-05-29	1	1	3468	2026-09-23 21:27:05.011382+00
458	1	\N	.3-3469	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	4	TASK	2026-06-17	2026-06-20	4	1	3469	2026-09-23 21:27:05.011382+00
459	1	\N	.4-3470	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	4	TASK	2026-06-01	2026-06-02	2	1	3470	2026-09-23 21:27:05.011382+00
460	1	\N	.1-3467	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	4	TASK	2026-05-29	2026-05-30	2	1	3467	2026-09-23 21:27:05.011382+00
461	1	\N	ROW-3506-3506	TỔNG TIẾN ĐỘ THI CÔNG	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	6	TASK	2026-05-12	2026-12-29	231	\N	3506	2026-09-23 21:27:05.011382+00
462	1	\N	ROW-3507-3507	Công tác chuẩn bị	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	6	TASK	2026-05-19	2026-05-21	3	1	3507	2026-09-23 21:27:05.011382+00
463	1	\N	ROW-3522-3522	TỔNG TIẾN ĐỘ THI CÔNG	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	41	TASK	2026-02-14	2026-10-12	240	\N	3522	2026-09-23 21:27:05.011382+00
464	1	\N	ROW-3523-3523	Công tác chuẩn bị	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	41	TASK	2026-05-19	2026-05-21	3	1	3523	2026-09-23 21:27:05.011382+00
465	1	\N	.10-3596	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	42	TASK	2026-10-17	2026-10-17	1	0	3596	2026-09-23 21:27:05.011382+00
466	1	\N	.5-3471	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	4	TASK	2026-06-01	2026-06-01	1	1	3471	2026-09-23 21:27:05.011382+00
674	1	\N	I-3466	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	4	TASK	2026-04-06	2026-10-13	\N	\N	3466	2026-09-23 21:27:05.011382+00
467	1	\N	.6-3472	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	4	TASK	2026-05-31	2026-05-31	1	1	3472	2026-09-23 21:27:05.011382+00
468	1	\N	.7-3480	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	4	TASK	2026-06-22	2026-06-22	1	1	3480	2026-09-23 21:27:05.011382+00
469	1	\N	.8-3481	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	4	TASK	2026-06-01	2026-06-01	1	1	3481	2026-09-23 21:27:05.011382+00
470	1	\N	.9-3482	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	4	TASK	2026-06-02	2026-06-02	1	0.95	3482	2026-09-23 21:27:05.011382+00
471	1	\N	.10-3483	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	4	TASK	2026-08-12	2026-08-12	1	1	3483	2026-09-23 21:27:05.011382+00
472	1	\N	.11-3484	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	4	TASK	2026-08-13	2026-08-13	1	0.4	3484	2026-09-23 21:27:05.011382+00
473	1	\N	.1-3488	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	40	TASK	2026-06-23	2026-06-24	2	0.15	3488	2026-09-23 21:27:05.011382+00
474	1	\N	.2-3489	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	40	TASK	2026-06-23	2026-06-23	1	0.15	3489	2026-09-23 21:27:05.011382+00
475	1	\N	.3-3490	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	40	TASK	2026-05-22	2026-05-24	3	0.15	3490	2026-09-23 21:27:05.011382+00
476	1	\N	.4-3491	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	40	TASK	2026-06-23	2026-06-24	2	0.15	3491	2026-09-23 21:27:05.011382+00
477	1	\N	.5-3492	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	40	TASK	2026-06-26	2026-06-26	1	0.15	3492	2026-09-23 21:27:05.011382+00
478	1	\N	.6-3493	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	40	TASK	2026-06-25	2026-06-25	1	0.15	3493	2026-09-23 21:27:05.011382+00
479	1	\N	.7-3501	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	40	TASK	2026-07-18	2026-07-18	1	0.15	3501	2026-09-23 21:27:05.011382+00
480	1	\N	.8-3502	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	40	TASK	2026-07-18	2026-07-18	1	0.15	3502	2026-09-23 21:27:05.011382+00
481	1	\N	.9-3503	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	40	TASK	2026-07-19	2026-07-19	1	0.15	3503	2026-09-23 21:27:05.011382+00
482	1	\N	.10-3504	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	40	TASK	2026-09-21	2026-09-21	1	0.15	3504	2026-09-23 21:27:05.011382+00
483	1	\N	.11-3505	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	40	TASK	2026-09-23	2026-09-23	1	0	3505	2026-09-23 21:27:05.011382+00
484	1	\N	.1-3509	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	6	TASK	2026-07-04	2026-07-05	2	0.1	3509	2026-09-23 21:27:05.011382+00
485	1	\N	.2-3510	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	6	TASK	2026-07-04	2026-07-04	1	0.1	3510	2026-09-23 21:27:05.011382+00
486	1	\N	.3-3511	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	6	TASK	2026-06-02	2026-06-04	3	0.1	3511	2026-09-23 21:27:05.011382+00
487	1	\N	.4-3512	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	6	TASK	2026-07-04	2026-07-05	2	0.1	3512	2026-09-23 21:27:05.011382+00
488	1	\N	.5-3513	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	6	TASK	2026-10-04	2026-10-04	1	0	3513	2026-09-23 21:27:05.011382+00
489	1	\N	.6-3514	Lắp đặt thiết bị điều hòa	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	6	TASK	2026-12-29	2026-12-29	1	0	3514	2026-09-23 21:27:05.011382+00
490	1	\N	.4-3528	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	41	TASK	2026-06-12	2026-06-13	2	0.9	3528	2026-09-23 21:27:05.011382+00
491	1	\N	.2-3526	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	41	TASK	2026-06-12	2026-06-12	1	0.9	3526	2026-09-23 21:27:05.011382+00
492	1	\N	ROW-3577-3577	TỔNG TIẾN ĐỘ THI CÔNG	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	42	TASK	2026-05-09	2026-10-17	161	\N	3577	2026-09-23 21:27:05.011382+00
493	1	\N	ROW-3578-3578	Công tác chuẩn bị	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	42	TASK	2026-05-19	2026-05-21	3	1	3578	2026-09-23 21:27:05.011382+00
494	1	\N	ROW-3597-3597	TỔNG TIẾN ĐỘ THI CÔNG	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	11	TASK	2026-05-12	2026-09-17	128	\N	3597	2026-09-23 21:27:05.011382+00
495	1	\N	ROW-3598-3598	Công tác chuẩn bị	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	11	TASK	2026-05-19	2026-05-21	3	1	3598	2026-09-23 21:27:05.011382+00
496	1	\N	.6-3564	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	8	TASK	2026-07-21	2026-07-21	1	1	3564	2026-09-23 21:27:05.011382+00
497	1	\N	.7-3572	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	8	TASK	2026-07-30	2026-07-30	1	1	3572	2026-09-23 21:27:05.011382+00
498	1	\N	.1-3525	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	41	TASK	2026-06-12	2026-06-13	2	0.9	3525	2026-09-23 21:27:05.011382+00
499	1	\N	.3-3527	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	41	TASK	2026-05-07	2026-05-08	2	0.9	3527	2026-09-23 21:27:05.011382+00
500	1	\N	.5-3529	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	41	TASK	2026-06-15	2026-06-15	1	0.9	3529	2026-09-23 21:27:05.011382+00
501	1	\N	.6-3530	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	41	TASK	2026-06-14	2026-06-14	1	0.9	3530	2026-09-23 21:27:05.011382+00
502	1	\N	.7-3539	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	41	TASK	2026-05-10	2026-05-10	1	0.9	3539	2026-09-23 21:27:05.011382+00
503	1	\N	.8-3540	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	41	TASK	2026-06-15	2026-06-15	1	0.9	3540	2026-09-23 21:27:05.011382+00
504	1	\N	.9-3541	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	41	TASK	2026-06-17	2026-06-17	1	0	3541	2026-09-23 21:27:05.011382+00
505	1	\N	.10-3542	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	41	TASK	2026-08-12	2026-08-12	1	0.9	3542	2026-09-23 21:27:05.011382+00
506	1	\N	.11-3543	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	41	TASK	2026-08-14	2026-08-14	1	0	3543	2026-09-23 21:27:05.011382+00
507	1	\N	.7-3358	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	1	TASK	2026-06-20	2026-06-21	2	1	3358	2026-09-23 21:27:05.011382+00
508	1	\N	.14-3320	Thử kín đường ống nước ngưng tầng T2/Testing sealing water pipe floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	1	TASK	2026-04-06	2026-04-06	1	1	3320	2026-09-23 21:27:05.011382+00
509	1	\N	.6-3357	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T2/Installing sealing water pipe and heat insulation floor3	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	1	TASK	2026-04-06	2026-04-10	5	1	3357	2026-09-23 21:27:05.011382+00
510	1	\N	.4-3325	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	1	TASK	2026-03-29	2026-03-29	1	1	3325	2026-09-23 21:27:05.011382+00
511	1	\N	.1-3322	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	1	TASK	2026-06-20	2026-06-21	2	1	3322	2026-09-23 21:27:05.011382+00
512	1	\N	.2-3323	Thi công lắp đặt ống đồng và bảo ôn tầng T2/Installing copper pipe and heat insulation floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	1	TASK	2026-06-23	2026-06-27	5	1	3323	2026-09-23 21:27:05.011382+00
513	1	\N	.3-3324	Thi công lắp đặt ống đồng và bảo ôn tầng mái/Installing copper pipe and heat insulation floor3	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	1	TASK	2026-06-29	2026-07-03	5	1	3324	2026-09-23 21:27:05.011382+00
514	1	\N	.21-3327	Lắp đặt thiết bị điều hòa không khí tầng mái/Installing air conditional equipment rooftop	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	1	TASK	2026-07-10	2026-07-12	3	1	3327	2026-09-23 21:27:05.011382+00
515	1	\N	.23-3329	Lắp đặt thiết bị điều khiển tầng T2/Installing controling equipment floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	1	TASK	2026-07-07	2026-07-07	1	1	3329	2026-09-23 21:27:05.011382+00
516	1	\N	.1-3559	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	8	TASK	2026-07-26	2026-07-26	1	1	3559	2026-09-23 21:27:05.011382+00
517	1	\N	.2-3560	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	8	TASK	2026-07-19	2026-07-19	1	1	3560	2026-09-23 21:27:05.011382+00
518	1	\N	.3-3561	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	8	TASK	2026-07-16	2026-07-17	2	1	3561	2026-09-23 21:27:05.011382+00
519	1	\N	.4-3562	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	8	TASK	2026-07-26	2026-07-26	1	1	3562	2026-09-23 21:27:05.011382+00
520	1	\N	.5-3563	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	8	TASK	2026-07-28	2026-07-28	1	1	3563	2026-09-23 21:27:05.011382+00
521	1	\N	II-3494	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	40	TASK	2026-05-22	2026-09-23	\N	\N	3494	2026-09-23 21:27:05.011382+00
522	1	\N	.8-3573	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	8	TASK	2026-07-30	2026-07-30	1	1	3573	2026-09-23 21:27:05.011382+00
523	1	\N	.9-3574	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	8	TASK	2026-07-31	2026-07-31	1	0.95	3574	2026-09-23 21:27:05.011382+00
524	1	\N	.10-3575	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	8	TASK	2026-09-14	2026-09-14	1	1	3575	2026-09-23 21:27:05.011382+00
525	1	\N	.11-3576	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	8	TASK	2026-09-16	2026-09-16	1	0	3576	2026-09-23 21:27:05.011382+00
526	1	\N	.1-3580	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	42	TASK	2026-08-06	2026-08-07	2	0.15	3580	2026-09-23 21:27:05.011382+00
528	1	\N	ROW-3485-3485	TỔNG TIẾN ĐỘ THI CÔNG	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	40	TASK	2026-05-12	2026-09-26	137	\N	3485	2026-09-23 21:27:05.011382+00
529	1	\N	.2-3581	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	42	TASK	2026-08-06	2026-08-06	1	0.15	3581	2026-09-23 21:27:05.011382+00
530	1	\N	.3-3582	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	42	TASK	2026-07-06	2026-07-08	3	0.15	3582	2026-09-23 21:27:05.011382+00
531	1	\N	.4-3583	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	42	TASK	2026-08-06	2026-08-07	2	0.15	3583	2026-09-23 21:27:05.011382+00
532	1	\N	.5-3584	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	42	TASK	2026-08-09	2026-08-09	1	0.15	3584	2026-09-23 21:27:05.011382+00
533	1	\N	.6-3585	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	42	TASK	2026-08-08	2026-08-08	1	0.15	3585	2026-09-23 21:27:05.011382+00
534	1	\N	.7-3593	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	42	TASK	2026-08-31	2026-08-31	1	0.15	3593	2026-09-23 21:27:05.011382+00
535	1	\N	.8-3594	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	42	TASK	2026-08-31	2026-08-31	1	0	3594	2026-09-23 21:27:05.011382+00
536	1	\N	.9-3595	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	42	TASK	2026-10-15	2026-10-15	1	0.15	3595	2026-09-23 21:27:05.011382+00
537	1	\N	.5-3326	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T2/Installing sealing water pipe and heat insulation floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	1	TASK	2026-03-31	2026-04-04	5	1	3326	2026-09-23 21:27:05.011382+00
538	1	\N	.1-3600	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	11	TASK	2026-06-06	2026-06-07	2	0.2	3600	2026-09-23 21:27:05.011382+00
539	1	\N	.2-3601	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	11	TASK	2026-06-09	2026-06-09	1	0.2	3601	2026-09-23 21:27:05.011382+00
540	1	\N	.3-3602	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	11	TASK	2026-06-01	2026-06-05	5	0.2	3602	2026-09-23 21:27:05.011382+00
541	1	\N	.4-3603	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	11	TASK	2026-06-06	2026-06-06	1	0.2	3603	2026-09-23 21:27:05.011382+00
542	1	\N	.6-3605	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	11	TASK	2026-06-11	2026-06-11	1	0.2	3605	2026-09-23 21:27:05.011382+00
543	1	\N	.7-3613	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	11	TASK	2026-06-07	2026-06-07	1	0.2	3613	2026-09-23 21:27:05.011382+00
544	1	\N	.8-3614	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	11	TASK	2026-06-07	2026-06-07	1	0.2	3614	2026-09-23 21:27:05.011382+00
545	1	\N	.9-3615	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	11	TASK	2026-06-07	2026-06-07	1	0.2	3615	2026-09-23 21:27:05.011382+00
546	1	\N	.10-3616	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	11	TASK	2026-08-20	2026-08-20	1	0.2	3616	2026-09-23 21:27:05.011382+00
547	1	\N	.11-3617	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	11	TASK	2026-08-22	2026-08-22	1	0	3617	2026-09-23 21:27:05.011382+00
548	1	\N	.1-3621	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	12	TASK	2026-06-06	2026-06-07	2	0.35	3621	2026-09-23 21:27:05.011382+00
549	1	\N	.2-3622	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	12	TASK	2026-06-09	2026-06-09	1	0.35	3622	2026-09-23 21:27:05.011382+00
550	1	\N	.3-3623	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	12	TASK	2026-06-01	2026-06-03	3	0.35	3623	2026-09-23 21:27:05.011382+00
551	1	\N	.4-3624	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	12	TASK	2026-06-06	2026-06-07	2	0.35	3624	2026-09-23 21:27:05.011382+00
552	1	\N	.5-3625	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	12	TASK	2026-06-09	2026-06-09	1	0.35	3625	2026-09-23 21:27:05.011382+00
555	1	\N	.4-3449	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	3	TASK	2026-06-01	2026-06-02	2	1	3449	2026-09-23 21:27:05.011382+00
556	1	\N	.5-3450	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	3	TASK	2026-06-01	2026-06-01	1	1	3450	2026-09-23 21:27:05.011382+00
557	1	\N	.6-3451	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	3	TASK	2026-05-31	2026-05-31	1	1	3451	2026-09-23 21:27:05.011382+00
558	1	\N	.7-3459	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	3	TASK	2026-06-20	2026-06-20	1	1	3459	2026-09-23 21:27:05.011382+00
559	1	\N	.8-3460	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	3	TASK	2026-06-01	2026-06-01	1	1	3460	2026-09-23 21:27:05.011382+00
560	1	\N	.9-3461	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	3	TASK	2026-06-02	2026-06-02	1	1	3461	2026-09-23 21:27:05.011382+00
561	1	\N	ROW-3444-3444	Công tác chuẩn bị	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	3	TASK	2026-05-19	2026-05-21	3	1	3444	2026-09-23 21:27:05.011382+00
562	1	\N	ROW-3464-3464	TỔNG TIẾN ĐỘ THI CÔNG	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	4	TASK	2026-04-06	2026-10-13	190	\N	3464	2026-09-23 21:27:05.011382+00
563	1	\N	ROW-3465-3465	Công tác chuẩn bị	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	4	TASK	2026-05-19	2026-05-21	3	1	3465	2026-09-23 21:27:05.011382+00
564	1	\N	.6-3626	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	12	TASK	2026-06-11	2026-06-11	1	0	3626	2026-09-23 21:27:05.011382+00
565	1	\N	.7-3634	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	12	TASK	2026-06-05	2026-06-05	1	0	3634	2026-09-23 21:27:05.011382+00
566	1	\N	.8-3635	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	12	TASK	2026-06-05	2026-06-05	1	0	3635	2026-09-23 21:27:05.011382+00
567	1	\N	.9-3636	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	12	TASK	2026-06-05	2026-06-05	1	0.35	3636	2026-09-23 21:27:05.011382+00
568	1	\N	.10-3637	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	12	TASK	2026-08-20	2026-08-20	1	0	3637	2026-09-23 21:27:05.011382+00
569	1	\N	.11-3638	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	12	TASK	2026-08-22	2026-08-22	1	0	3638	2026-09-23 21:27:05.011382+00
570	1	\N	.5-3646	Thi công hệ thống bơm (nước cấp, nước thoát, bù áp)/ Pump system installtion (water supply, drainage, pump pressure)	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	13	TASK	2026-08-10	2026-10-08	60	0.35	3646	2026-09-23 21:27:05.011382+00
571	1	\N	.13-3639	Nghiêm thu công tác đổ bê tông hố ga tuyến D6	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	13	TASK	2026-02-24	2026-03-03	8	1	3639	2026-09-23 21:27:05.011382+00
572	1	\N	.3-3644	Thi công hệ thống valve, vòi, trụ/ Valve system, ejector, pillar installation	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	13	TASK	2026-07-03	2026-09-10	70	0.35	3644	2026-09-23 21:27:05.011382+00
573	1	\N	.4-3645	Kiểm tra thử kín, thử áp hệ thống cấp thoát nước/testing water supply system	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	13	TASK	2026-07-14	2026-09-16	65	0.35	3645	2026-09-23 21:27:05.011382+00
575	1	\N	.1-3736	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	14	TASK	2026-08-06	2026-08-07	2	0.35	3736	2026-09-23 21:27:05.011382+00
576	1	\N	.2-3737	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	14	TASK	2026-08-06	2026-08-06	1	0.35	3737	2026-09-23 21:27:05.011382+00
577	1	\N	.10-3773	Thử áp đường ống đồng tầng 2 /Testing pressure copper pipe floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	15	TASK	2026-09-09	2026-09-09	1	0	3773	2026-09-23 21:27:05.011382+00
578	1	\N	.3-3738	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	14	TASK	2026-07-06	2026-07-08	3	0.35	3738	2026-09-23 21:27:05.011382+00
579	1	\N	.4-3739	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	14	TASK	2026-08-06	2026-08-07	2	0.35	3739	2026-09-23 21:27:05.011382+00
580	1	\N	ROW-3618-3618	TỔNG TIẾN ĐỘ THI CÔNG	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	12	TASK	2026-03-26	2026-09-02	160	\N	3618	2026-09-23 21:27:05.011382+00
581	1	\N	ROW-3486-3486	Công tác chuẩn bị	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	40	TASK	2026-05-19	2026-05-21	3	1	3486	2026-09-23 21:27:05.011382+00
582	1	\N	.5-3740	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	14	TASK	2026-08-09	2026-08-09	1	0.35	3740	2026-09-23 21:27:05.011382+00
583	1	\N	.6-3741	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	14	TASK	2026-08-08	2026-08-08	1	0.35	3741	2026-09-23 21:27:05.011382+00
584	1	\N	.7-3749	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	14	TASK	2026-08-31	2026-08-31	1	0.35	3749	2026-09-23 21:27:05.011382+00
585	1	\N	.2-3643	Thi công hệ thống ống âm đất (cấp nước, )Underground pipe system execution(water supply, drainage, sewage)	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	13	TASK	2026-03-03	2026-07-25	145	0.35	3643	2026-09-23 21:27:05.011382+00
586	1	\N	.7-3648	Gia công lắp đặt nghiệm thu cốp pha hố ga tuyến D7	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	13	TASK	2026-02-19	2026-02-26	8	0.6	3648	2026-09-23 21:27:05.011382+00
587	1	\N	.8-3649	Đổ bê tông hố ga tuyến D7	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	13	TASK	2026-02-19	2026-02-26	8	0.6	3649	2026-09-23 21:27:05.011382+00
588	1	\N	.9-3650	Nghiêm thu công tác đổ bê tông hố ga tuyến D7	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	13	TASK	2026-02-24	2026-03-03	8	0.6	3650	2026-09-23 21:27:05.011382+00
590	1	\N	.8-3750	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	14	TASK	2026-08-31	2026-08-31	1	0.35	3750	2026-09-23 21:27:05.011382+00
591	1	\N	.11-3691	Gia công lắp đặt nghiệm thu cốp pha hố ga tuyến D6	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	13	TASK	2026-02-19	2026-02-26	8	1	3691	2026-09-23 21:27:05.011382+00
592	1	\N	.12-3692	Đổ bê tông hố ga tuyến D6	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	13	TASK	2026-02-19	2026-02-26	8	1	3692	2026-09-23 21:27:05.011382+00
593	1	\N	.9-3751	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	14	TASK	2026-08-31	2026-08-31	1	0	3751	2026-09-23 21:27:05.011382+00
594	1	\N	.10-3752	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	14	TASK	2026-10-15	2026-10-15	1	0.35	3752	2026-09-23 21:27:05.011382+00
595	1	\N	.11-3753	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	14	TASK	2026-10-17	2026-10-17	1	0	3753	2026-09-23 21:27:05.011382+00
596	1	\N	.1-3757	Thi công lắp đặt ống đồng và bảo ôn tầng 1 /Installing copper pipe and heat insulation floor 1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	15	TASK	2026-08-23	2026-08-31	9	1	3757	2026-09-23 21:27:05.011382+00
597	1	\N	.2-3758	Thi công lắp đặt ống đồng và bảo ôn tầng T2/Installing copper pipe and heat insulation floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	15	TASK	2026-09-02	2026-09-07	6	0.8	3758	2026-09-23 21:27:05.011382+00
598	1	\N	.4-3760	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T2/Installing sealing water pipe and heat insulation floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	15	TASK	2026-09-01	2026-09-05	5	0.8	3760	2026-09-23 21:27:05.011382+00
599	1	\N	.5-3761	Thi công lắp đặt đường ống thông gió và bảo ôn tầng 1/Installing air duct and heat insulation floor 1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	15	TASK	2026-07-12	2026-07-23	12	1	3761	2026-09-23 21:27:05.011382+00
600	1	\N	.6-3762	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T2/Installing air duct and heat insulation floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	15	TASK	2026-07-25	2026-07-31	7	0.8	3762	2026-09-23 21:27:05.011382+00
601	1	\N	.13-3754	Lắp đặt thiết bị quạt thông gió tầng 1/Installing air duct fan equipment floor 1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	15	TASK	2026-08-23	2026-08-24	2	1	3754	2026-09-23 21:27:05.011382+00
602	1	\N	.15-3756	Lắp đặt nón che mua tầng mái/Installing air hat roof floor	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	15	TASK	2026-08-29	2026-08-30	2	0.35	3756	2026-09-23 21:27:05.011382+00
603	1	\N	.22-3763	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	15	TASK	2026-11-02	2026-11-02	1	0	3763	2026-09-23 21:27:05.011382+00
604	1	\N	.8-3815	Lắp đặt cửa gió tầng T2/Installing air diffuser floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	17	TASK	2026-10-04	2026-10-04	1	0	3815	2026-09-23 21:27:05.011382+00
605	1	\N	.3-3759	Thi công lắp đặt ống nước ngưng và bảo ôn tầng 1/Installing sealing water pipe and heat insulation floor 1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	15	TASK	2026-08-23	2026-08-30	8	1	3759	2026-09-23 21:27:05.011382+00
606	1	\N	.7-3770	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng 1/Installing signal of conduit and controlling floor 1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	15	TASK	2026-08-23	2026-08-25	3	1	3770	2026-09-23 21:27:05.011382+00
607	1	\N	.8-3771	Thi công lắp đặt ống luồn dây tiến hiệu và điều khiển tầng 2 /Installing signal of conduit and controlling floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	15	TASK	2026-09-02	2026-09-04	3	0.8	3771	2026-09-23 21:27:05.011382+00
608	1	\N	.9-3772	Thử áp đường ống đồng tầng 1 /Testing pressure copper pipe floor 1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	15	TASK	2026-09-02	2026-09-02	1	1	3772	2026-09-23 21:27:05.011382+00
609	1	\N	.11-3774	Thử kín đường ống nước ngưng tầng 1/Testing sealing water pipe floor 1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	15	TASK	2026-09-01	2026-09-01	1	1	3774	2026-09-23 21:27:05.011382+00
610	1	\N	.12-3775	Thử kín đường ống nước ngưng tầng 2/Testing sealing water pipe floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	15	TASK	2026-09-07	2026-09-07	1	0	3775	2026-09-23 21:27:05.011382+00
611	1	\N	.14-3755	Lắp đặt thiết bị quạt thông gió tầng T2/Installing air duct fan equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	15	TASK	2026-08-26	2026-08-27	2	0	3755	2026-09-23 21:27:05.011382+00
612	1	\N	.16-3779	Lắp đặt thiết bị điều hòa không khí tầng 1/Installing air conditional equipment floor 1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	15	TASK	2026-08-23	2026-08-29	7	1	3779	2026-09-23 21:27:05.011382+00
613	1	\N	.17-3780	Lắp đặt thiết bị điều hòa không khí tầng 2 /Installing air conditional equipment floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	15	TASK	2026-08-31	2026-09-03	4	0.25	3780	2026-09-23 21:27:05.011382+00
614	1	\N	.18-3781	Lắp đặt thiết bị điều khiển tầng 1/Installing controling equipment floor 1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	15	TASK	2026-08-23	2026-08-24	2	1	3781	2026-09-23 21:27:05.011382+00
615	1	\N	.19-3782	Lắp đặt thiết bị điều khiển tầng 2 /Installing controling equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	15	TASK	2026-08-31	2026-08-31	1	0.25	3782	2026-09-23 21:27:05.011382+00
617	1	\N	ROW-3557-3557	Công tác chuẩn bị	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	8	TASK	2026-05-19	2026-05-21	3	1	3557	2026-09-23 21:27:05.011382+00
618	1	\N	.20-3783	Lắp đặt cửa gió tầng 1 /Installing air diffuser baseman floor	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	15	TASK	2026-10-27	2026-10-28	2	1	3783	2026-09-23 21:27:05.011382+00
619	1	\N	.21-3784	Lắp đặt cửa gió tầng 2 /Installing air diffuser floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	15	TASK	2026-10-30	2026-10-31	2	0.35	3784	2026-09-23 21:27:05.011382+00
620	1	\N	.4-3869	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	45	TASK	2026-08-06	2026-08-07	2	0.35	3869	2026-09-23 21:27:05.011382+00
621	1	\N	.10-3361	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	1	TASK	2026-06-23	2026-06-23	1	1	3361	2026-09-23 21:27:05.011382+00
622	1	\N	.5-3604	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	11	TASK	2026-06-09	2026-06-09	1	0.2	3604	2026-09-23 21:27:05.011382+00
623	1	\N	.1-3642	Thi công đào, lấp đất/Excavation, backfill(cấp nước)	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	13	TASK	2026-02-21	2026-04-21	60	0.35	3642	2026-09-23 21:27:05.011382+00
624	1	\N	.4-3823	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T2/Installing sealing water pipe and heat insulation floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	18	TASK	2026-08-12	2026-08-12	1	0	3823	2026-09-23 21:27:05.011382+00
625	1	\N	.1-3789	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	17	TASK	2026-08-09	2026-08-10	2	0	3789	2026-09-23 21:27:05.011382+00
626	1	\N	.2-3790	Thi công lắp đặt ống đồng và bảo ôn tầng T2/Installing copper pipe and heat insulation floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	17	TASK	2026-08-12	2026-08-12	1	0	3790	2026-09-23 21:27:05.011382+00
627	1	\N	.3-3791	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	17	TASK	2026-08-09	2026-08-10	2	0	3791	2026-09-23 21:27:05.011382+00
628	1	\N	.4-3792	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T2/Installing sealing water pipe and heat insulation floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	17	TASK	2026-08-12	2026-08-12	1	0	3792	2026-09-23 21:27:05.011382+00
629	1	\N	.5-3793	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	17	TASK	2026-07-15	2026-07-17	3	0	3793	2026-09-23 21:27:05.011382+00
630	1	\N	.6-3794	Lắp đặt thiết bị điều khiển tầng T2/Installing controling equipment floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	17	TASK	2026-08-26	2026-08-26	1	0	3794	2026-09-23 21:27:05.011382+00
631	1	\N	.7-3814	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	17	TASK	2026-10-04	2026-10-04	1	0	3814	2026-09-23 21:27:05.011382+00
632	1	\N	.9-3816	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	17	TASK	2026-10-06	2026-10-06	1	0	3816	2026-09-23 21:27:05.011382+00
633	1	\N	.1-3820	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	18	TASK	2026-08-09	2026-08-10	2	0	3820	2026-09-23 21:27:05.011382+00
634	1	\N	.2-3821	Thi công lắp đặt ống đồng và bảo ôn tầng T2/Installing copper pipe and heat insulation floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	18	TASK	2026-08-12	2026-08-12	1	0	3821	2026-09-23 21:27:05.011382+00
635	1	\N	.3-3822	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	18	TASK	2026-08-09	2026-08-10	2	0	3822	2026-09-23 21:27:05.011382+00
636	1	\N	.5-3824	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	18	TASK	2026-07-15	2026-07-17	3	0	3824	2026-09-23 21:27:05.011382+00
637	1	\N	.6-3825	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T2/Installing air duct and heat insulation floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	18	TASK	2026-07-19	2026-07-19	1	0	3825	2026-09-23 21:27:05.011382+00
638	1	\N	.7-3833	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	18	TASK	2026-08-09	2026-08-10	2	0	3833	2026-09-23 21:27:05.011382+00
639	1	\N	.8-3834	Thi công lắp đặt ống luồn dây tiến hiệu và điều khiển tầng T2/Installing signal of conduit and controlling floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	18	TASK	2026-08-12	2026-08-12	1	0	3834	2026-09-23 21:27:05.011382+00
640	1	\N	.9-3835	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	18	TASK	2026-08-12	2026-08-12	1	0	3835	2026-09-23 21:27:05.011382+00
641	1	\N	.10-3836	Thử áp đường ống đồng tầng T2/Testing pressure copper pipe floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	18	TASK	2026-08-14	2026-08-14	1	0	3836	2026-09-23 21:27:05.011382+00
642	1	\N	.11-3837	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	18	TASK	2026-08-12	2026-08-12	1	0	3837	2026-09-23 21:27:05.011382+00
643	1	\N	.12-3838	Thử kín đường ống nước ngưng tầng T2/Testing sealing water pipe floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	18	TASK	2026-08-14	2026-08-14	1	0	3838	2026-09-23 21:27:05.011382+00
644	1	\N	.13-3817	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	18	TASK	2026-08-23	2026-08-23	1	0	3817	2026-09-23 21:27:05.011382+00
645	1	\N	.14-3818	Lắp đặt thiết bị quạt thông gió tầng T2/Installing air duct fan equipment floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	18	TASK	2026-08-25	2026-08-25	1	0	3818	2026-09-23 21:27:05.011382+00
646	1	\N	.15-3819	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	18	TASK	2026-08-22	2026-08-22	1	0	3819	2026-09-23 21:27:05.011382+00
647	1	\N	.16-3842	Lắp đặt thiết bị điều hòa không khí tầng T2/Installing air conditional equipment floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	18	TASK	2026-08-24	2026-08-24	1	0	3842	2026-09-23 21:27:05.011382+00
648	1	\N	.17-3843	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	18	TASK	2026-08-26	2026-08-26	1	0	3843	2026-09-23 21:27:05.011382+00
649	1	\N	.18-3844	Lắp đặt thiết bị điều khiển tầng T2/Installing controling equipment floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	18	TASK	2026-08-26	2026-08-26	1	0	3844	2026-09-23 21:27:05.011382+00
650	1	\N	.19-3845	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	18	TASK	2026-10-04	2026-10-04	1	0	3845	2026-09-23 21:27:05.011382+00
651	1	\N	.20-3846	Lắp đặt cửa gió tầng T2/Installing air diffuser floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	18	TASK	2026-10-04	2026-10-04	1	0	3846	2026-09-23 21:27:05.011382+00
652	1	\N	.21-3847	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	18	TASK	2026-10-06	2026-10-06	1	0	3847	2026-09-23 21:27:05.011382+00
653	1	\N	.7-3855	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	19	TASK	2026-08-04	2026-08-04	1	0	3855	2026-09-23 21:27:05.011382+00
654	1	\N	.1-3851	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	19	TASK	2026-06-03	2026-06-04	2	1	3851	2026-09-23 21:27:05.011382+00
655	1	\N	.2-3852	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	19	TASK	2026-06-03	2026-06-03	1	1	3852	2026-09-23 21:27:05.011382+00
656	1	\N	.3-3853	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	19	TASK	2026-04-22	2026-04-23	2	0.85	3853	2026-09-23 21:27:05.011382+00
657	1	\N	.4-3860	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	19	TASK	2026-06-03	2026-06-03	1	0.85	3860	2026-09-23 21:27:05.011382+00
658	1	\N	.5-3861	Lắp đặt thiết bị điều hòa	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	19	TASK	2026-11-22	2026-11-22	1	0.15	3861	2026-09-23 21:27:05.011382+00
659	1	\N	.6-3854	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	19	TASK	2026-08-01	2026-08-01	1	0.1	3854	2026-09-23 21:27:05.011382+00
660	1	\N	ROW-3864-3864	Công tác chuẩn bị	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	45	TASK	2026-05-19	2026-05-21	3	1	3864	2026-09-23 21:27:05.011382+00
661	1	\N	ROW-3619-3619	Công tác chuẩn bị	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	12	TASK	2026-05-19	2026-05-21	3	1	3619	2026-09-23 21:27:05.011382+00
662	1	\N	ROW-3733-3733	TỔNG TIẾN ĐỘ THI CÔNG	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	14	TASK	2026-05-19	2026-10-21	155	\N	3733	2026-09-23 21:27:05.011382+00
663	1	\N	ROW-3734-3734	Công tác chuẩn bị	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	14	TASK	2026-05-19	2026-05-21	3	1	3734	2026-09-23 21:27:05.011382+00
664	1	\N	ROW-3786-3786	TỔNG TIẾN ĐỘ THI CÔNG	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	17	TASK	2026-05-19	2026-10-21	155	\N	3786	2026-09-23 21:27:05.011382+00
665	1	\N	V-3340	Hệ thống cấp thoát nước/Water supply and drainage system(Zone C)	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	1	TASK	2026-05-23	2026-05-22	\N	1	3340	2026-09-23 21:27:05.011382+00
667	1	\N	IV-3335	Hệ thống cấp thoát nước/Water supply and drainage system(Zone B)	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	1	TASK	2026-05-08	2026-05-27	\N	1	3335	2026-09-23 21:27:05.011382+00
668	1	\N	VI-3345	Hệ thống cấp thoát nước/Water supply and drainage system(Zone D)	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	1	TASK	2026-06-11	2026-06-10	\N	1	3345	2026-09-23 21:27:05.011382+00
669	1	\N	B-3373	Zone B	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	1	TASK	2026-03-29	2026-03-29	\N	1	3373	2026-09-23 21:27:05.011382+00
670	1	\N	D-3417	Zone D	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	1	TASK	2026-03-29	2026-03-29	\N	1	3417	2026-09-23 21:27:05.011382+00
671	1	\N	C-3395	Zone C	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	1	TASK	2026-03-29	2026-03-30	\N	1	3395	2026-09-23 21:27:05.011382+00
672	1	\N	III-3452	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	3	TASK	2026-05-29	2026-08-13	\N	\N	3452	2026-09-23 21:27:05.011382+00
673	1	\N	I-3445	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	3	TASK	2026-03-12	2026-10-11	\N	\N	3445	2026-09-23 21:27:05.011382+00
675	1	\N	II-3473	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	4	TASK	2026-05-29	2026-08-13	\N	\N	3473	2026-09-23 21:27:05.011382+00
676	1	\N	I-3487	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	40	TASK	2026-05-12	2026-09-26	\N	\N	3487	2026-09-23 21:27:05.011382+00
677	1	\N	II-3515	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	6	TASK	2026-06-02	2026-12-29	\N	\N	3515	2026-09-23 21:27:05.011382+00
678	1	\N	I-3524	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	41	TASK	2026-02-14	2026-10-12	\N	\N	3524	2026-09-23 21:27:05.011382+00
679	1	\N	II-3531	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	41	TASK	2026-05-07	2026-08-14	\N	\N	3531	2026-09-23 21:27:05.011382+00
680	1	\N	I-3558	Hệ thống cấp thoát nước/Water supply and drainage system35-48)	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	8	TASK	2026-04-20	2026-10-02	\N	\N	3558	2026-09-23 21:27:05.011382+00
681	1	\N	II-3565	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	8	TASK	2026-07-16	2026-09-16	\N	\N	3565	2026-09-23 21:27:05.011382+00
682	1	\N	I-3579	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	42	TASK	2026-05-09	2026-10-08	\N	\N	3579	2026-09-23 21:27:05.011382+00
683	1	\N	II-3586	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	42	TASK	2026-07-06	2026-10-17	\N	\N	3586	2026-09-23 21:27:05.011382+00
684	1	\N	I-3599	Hệ thống cấp thoát nước/Water supply and drainage system(1-13)	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	11	TASK	2026-05-12	2026-09-17	\N	\N	3599	2026-09-23 21:27:05.011382+00
685	1	\N	II-3606	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	11	TASK	2026-06-01	2026-08-22	\N	\N	3606	2026-09-23 21:27:05.011382+00
686	1	\N	ROW-3556-3556	TỔNG TIẾN ĐỘ THI CÔNG	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	8	TASK	2026-04-20	2026-10-02	165	\N	3556	2026-09-23 21:27:05.011382+00
687	1	\N	I-3620	Hệ thống cấp thoát nước/Water supply and drainage system(14-26)	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	12	TASK	2026-03-26	2026-09-02	\N	\N	3620	2026-09-23 21:27:05.011382+00
688	1	\N	II-3627	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	12	TASK	2026-06-01	2026-08-22	\N	\N	3627	2026-09-23 21:27:05.011382+00
689	1	\N	I-3641	Hệ thống cấp thoát nước/Water supply and drainage system (D5)	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	13	TASK	2026-02-07	2026-11-02	\N	0.95	3641	2026-09-23 21:27:05.011382+00
690	1	\N	II-3652	Hệ thống cấp thoát nước/Water supply and drainage system(N2-N3)	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	13	TASK	2026-02-07	2026-02-06	\N	0.95	3652	2026-09-23 21:27:05.011382+00
691	1	\N	III-3658	Hệ thống cấp thoát nước/Water supply and drainage system(D1)	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	13	TASK	2026-02-21	2026-02-20	\N	0.95	3658	2026-09-23 21:27:05.011382+00
692	1	\N	VIII-3711	Hệ thống cấp thoát nước/Water supply and drainage system(D2)	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	13	TASK	2026-02-07	2026-02-06	\N	0.95	3711	2026-09-23 21:27:05.011382+00
693	1	\N	IV-3669	Hệ thống cấp thoát nước/Water supply and drainage system(D3)	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	13	TASK	2026-02-11	2026-02-10	\N	0.95	3669	2026-09-23 21:27:05.011382+00
694	1	\N	III-3722	Hệ thống cấp thoát nước/Water supply and drainage system(D7)	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	13	TASK	2026-02-21	2026-02-20	\N	0.25	3722	2026-09-23 21:27:05.011382+00
695	1	\N	V-3680	Hệ thống cấp thoát nước/Water supply and drainage system(D6)	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	13	TASK	2026-02-07	2026-02-06	\N	0.95	3680	2026-09-23 21:27:05.011382+00
696	1	\N	VI-3695	Hệ thống cấp thoát nước/Water supply and drainage system(D8)	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	13	TASK	2026-02-22	2026-02-21	\N	0.95	3695	2026-09-23 21:27:05.011382+00
697	1	\N	I-3735	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	14	TASK	2026-06-01	2026-10-21	\N	\N	3735	2026-09-23 21:27:05.011382+00
698	1	\N	VII-3705	Hệ thống cấp thoát nước/Water supply and drainage system(D4)	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	13	TASK	2026-02-22	2026-02-21	\N	0.95	3705	2026-09-23 21:27:05.011382+00
699	1	\N	II-3742	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	14	TASK	2026-07-06	2026-10-17	\N	\N	3742	2026-09-23 21:27:05.011382+00
700	1	\N	I-3788	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	17	TASK	2026-06-18	2026-10-21	\N	\N	3788	2026-09-23 21:27:05.011382+00
701	1	\N	II-3795	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	17	TASK	2026-07-15	2026-10-06	\N	\N	3795	2026-09-23 21:27:05.011382+00
702	1	\N	II-3826	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	18	TASK	2026-07-15	2026-10-06	\N	\N	3826	2026-09-23 21:27:05.011382+00
703	1	\N	II-3856	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	19	TASK	2026-04-22	2026-11-22	\N	\N	3856	2026-09-23 21:27:05.011382+00
704	1	\N	ROW-3787-3787	Công tác chuẩn bị	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	17	TASK	2026-05-19	2026-05-21	3	1	3787	2026-09-23 21:27:05.011382+00
705	1	\N	ROW-3801-3801	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T2/Installing air duct and heat insulation floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	17	TASK	2026-07-19	2026-07-19	1	0	3801	2026-09-23 21:27:05.011382+00
706	1	\N	ROW-3802-3802	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	17	TASK	2026-08-09	2026-08-10	2	0	3802	2026-09-23 21:27:05.011382+00
707	1	\N	ROW-3803-3803	Thi công lắp đặt ống luồn dây tiến hiệu và điều khiển tầng T2/Installing signal of conduit and controlling floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	17	TASK	2026-08-12	2026-08-12	1	0	3803	2026-09-23 21:27:05.011382+00
708	1	\N	ROW-3804-3804	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	17	TASK	2026-08-12	2026-08-12	1	0	3804	2026-09-23 21:27:05.011382+00
709	1	\N	ROW-3805-3805	Thử áp đường ống đồng tầng T2/Testing pressure copper pipe floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	17	TASK	2026-08-14	2026-08-14	1	0	3805	2026-09-23 21:27:05.011382+00
710	1	\N	ROW-3806-3806	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	17	TASK	2026-08-12	2026-08-12	1	0	3806	2026-09-23 21:27:05.011382+00
711	1	\N	ROW-3807-3807	Thử kín đường ống nước ngưng tầng T2/Testing sealing water pipe floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	17	TASK	2026-08-14	2026-08-14	1	0	3807	2026-09-23 21:27:05.011382+00
712	1	\N	ROW-3808-3808	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	17	TASK	2026-08-23	2026-08-23	1	0	3808	2026-09-23 21:27:05.011382+00
713	1	\N	ROW-3809-3809	Lắp đặt thiết bị quạt thông gió tầng T2/Installing air duct fan equipment floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	17	TASK	2026-08-25	2026-08-25	1	0	3809	2026-09-23 21:27:05.011382+00
714	1	\N	ROW-3810-3810	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	17	TASK	2026-08-22	2026-08-22	1	0	3810	2026-09-23 21:27:05.011382+00
839	1	\N	I-3508	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	6	TASK	2026-05-12	2026-09-26	\N	\N	3508	2026-09-23 21:27:05.011382+00
841	1	\N	ROW-3811-3811	Lắp đặt thiết bị điều hòa không khí tầng T2/Installing air conditional equipment floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	17	TASK	2026-08-24	2026-08-24	1	0	3811	2026-09-23 21:27:05.011382+00
842	1	\N	ROW-3812-3812	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	17	TASK	2026-08-26	2026-08-26	1	0	3812	2026-09-23 21:27:05.011382+00
843	1	\N	ROW-3849-3849	Công tác chuẩn bị	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	19	TASK	2026-05-19	2026-05-21	3	1	3849	2026-09-23 21:27:05.011382+00
844	1	\N	ROW-3848-3848	TỔNG TIẾN ĐỘ THI CÔNG	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	19	TASK	2026-01-29	2026-11-22	297	0.2	3848	2026-09-23 21:27:05.011382+00
828	1	\N	I-3850	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	\N	\N	\N	1	2026-09-23 21:27:05.011382	19	TASK	2026-01-29	2026-08-04	\N	0.2	3850	2026-09-23 21:44:54.570363+00
1054	1	\N	I.3-4971	Kiểm tra thử áp đường ống cấp nước/ Testing pressure of drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.729456	7	TASK	2026-06-12	2026-06-14	3	0	4971	2026-09-25 10:31:22.947767+00
1055	1	\N	I.4-4972	Kiểm tra thử kín đường ống thoát nước/Testing drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.734783	7	TASK	2026-06-15	2026-06-17	3	0	4972	2026-09-25 10:31:22.953051+00
1056	1	\N	I.5-4973	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.740058	7	TASK	2026-09-28	2026-10-12	15	0	4973	2026-09-25 10:31:22.958441+00
1057	1	\N	I.6-4974	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.745755	7	TASK	2026-10-10	2026-10-12	3	0	4974	2026-09-25 10:31:22.963566+00
1053	1	\N	I.2-4970	Thi công lắp đặt đường ống thoát nước/Installing drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.724051	7	TASK	2026-02-14	2026-02-18	5	0	4970	2026-09-25 10:31:22.942247+00
1241	1	\N	B.4-5158	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.19778	13	TASK	2026-06-06	2026-06-06	1	0	5158	2026-09-25 10:31:24.335657+00
1247	1	\N	B.10-5164	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.230232	13	TASK	2026-08-20	2026-08-20	1	0	5164	2026-09-25 10:31:24.372464+00
1244	1	\N	B.7-5161	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.213608	13	TASK	2026-06-07	2026-06-07	1	0	5161	2026-09-25 10:31:24.352278+00
1243	1	\N	B.6-5160	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.208449	13	TASK	2026-06-11	2026-06-11	1	0	5160	2026-09-25 10:31:24.34685+00
1246	1	\N	B.9-5163	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.224531	13	TASK	2026-06-07	2026-06-07	1	0	5163	2026-09-25 10:31:24.365418+00
1245	1	\N	B.8-5162	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.218716	13	TASK	2026-06-07	2026-06-07	1	0	5162	2026-09-25 10:31:24.359253+00
1248	1	\N	B.11-5165	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.235375	13	TASK	2026-08-22	2026-08-22	1	0	5165	2026-09-25 10:31:24.379216+00
1249	1	\N	A-5166	KID CLUB	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.312579	14	TASK	2026-06-01	2026-10-21	\N	\N	5166	2026-09-25 10:31:24.443195+00
1250	1	\N	I-5167	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.320068	14	TASK	2026-06-01	2026-10-21	\N	\N	5167	2026-09-25 10:31:24.448479+00
1251	1	\N	I.1-5168	Thi công lắp đặt đường ống cấp nước /Installing water pipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.328603	14	TASK	2026-08-06	2026-08-15	10	0	5168	2026-09-25 10:31:24.453668+00
1252	1	\N	I.2-5169	Thi công lắp đặt đường ống thoát nước/Installing drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.334943	14	TASK	2026-06-01	2026-06-05	5	0	5169	2026-09-25 10:31:24.458727+00
1051	1	\N	I-4968	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.713308	7	TASK	2026-02-14	2026-10-12	\N	\N	4968	2026-09-25 10:31:22.93093+00
1253	1	\N	I.3-5170	Kiểm tra thử áp đường ống cấp nước/ Testing pressure of drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.3415	14	TASK	2026-08-16	2026-08-18	3	0	5170	2026-09-25 10:31:24.463808+00
1254	1	\N	I.4-5171	Kiểm tra thử kín đường ống thoát nước/Testing drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.347341	14	TASK	2026-06-06	2026-06-08	3	0	5171	2026-09-25 10:31:24.469849+00
1255	1	\N	I.5-5172	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.354475	14	TASK	2026-10-15	2026-10-21	7	0	5172	2026-09-25 10:31:24.474978+00
1256	1	\N	I.6-5173	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.361385	14	TASK	2026-10-19	2026-10-21	3	0	5173	2026-09-25 10:31:24.480303+00
1257	1	\N	II-5174	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.368132	14	TASK	2026-07-06	2026-10-17	\N	\N	5174	2026-09-25 10:31:24.485738+00
1258	1	\N	II.1-5175	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.374377	14	TASK	2026-08-06	2026-08-07	2	0	5175	2026-09-25 10:31:24.491365+00
1259	1	\N	II.2-5176	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.38021	14	TASK	2026-08-06	2026-08-06	1	0	5176	2026-09-25 10:31:24.496571+00
1260	1	\N	II.3-5177	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.387525	14	TASK	2026-07-06	2026-07-08	3	0	5177	2026-09-25 10:31:24.502229+00
1261	1	\N	II.4-5178	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.394299	14	TASK	2026-08-06	2026-08-07	2	0	5178	2026-09-25 10:31:24.507396+00
1262	1	\N	II.5-5179	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.400977	14	TASK	2026-08-09	2026-08-09	1	0	5179	2026-09-25 10:31:24.512789+00
1263	1	\N	II.6-5180	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.407823	14	TASK	2026-08-08	2026-08-08	1	0	5180	2026-09-25 10:31:24.518573+00
1264	1	\N	II.7-5181	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.417255	14	TASK	2026-08-31	2026-08-31	1	0	5181	2026-09-25 10:31:24.523611+00
1265	1	\N	II.8-5182	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.424837	14	TASK	2026-08-31	2026-08-31	1	0	5182	2026-09-25 10:31:24.528811+00
1266	1	\N	II.9-5183	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.433578	14	TASK	2026-08-31	2026-08-31	1	0	5183	2026-09-25 10:31:24.534056+00
1267	1	\N	II.10-5184	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.442544	14	TASK	2026-10-15	2026-10-15	1	0	5184	2026-09-25 10:31:24.53884+00
1268	1	\N	II.11-5185	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.453589	14	TASK	2026-10-17	2026-10-17	1	0	5185	2026-09-25 10:31:24.544106+00
1269	1	\N	A-5186	LOBBY - SPA BUILDING	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.538749	15	TASK	2026-04-18	2026-11-02	\N	\N	5186	2026-09-25 10:31:24.616314+00
1270	1	\N	I-5187	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.545158	15	TASK	2026-04-18	2026-10-24	\N	\N	5187	2026-09-25 10:31:24.62164+00
1271	1	\N	I.1-5188	Thi công lắp đặt đường ống cấp nước /Installing water pipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.552356	15	TASK	2026-08-23	2026-09-01	10	0	5188	2026-09-25 10:31:24.62699+00
1230	1	\N	VIII.5-5147	Thi công hệ thống bơm (nước cấp, nước thoát, bù áp)/ Pump system installtion (water supply, drainage, pump pressure)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.135358	13	TASK	2026-07-09	2026-09-11	65	0	5147	2026-09-25 10:31:24.30818+00
1231	1	\N	VIII-5148	Hệ thống cấp thoát nước/Water supply and drainage system(D2)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.140641	13	TASK	2026-02-12	2026-02-11	\N	0	5148	2026-09-25 10:31:24.280305+00
1229	1	\N	VIII.4-5146	Kiểm tra hệ thống cấp thoát nước/testing water supply system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.129469	13	TASK	2026-05-28	2026-07-26	60	0	5146	2026-09-25 10:31:24.302821+00
1237	1	\N	B-5154	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.173832	13	TASK	2026-06-01	2026-05-31	\N	0	5154	2026-09-25 10:31:24.314475+00
1242	1	\N	B.5-5159	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.202852	13	TASK	2026-06-09	2026-06-09	1	0	5159	2026-09-25 10:31:24.341118+00
1238	1	\N	B.1-5155	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.181481	13	TASK	2026-06-11	2026-06-12	2	0	5155	2026-09-25 10:31:24.31957+00
1239	1	\N	B.2-5156	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.186536	13	TASK	2026-06-09	2026-06-09	1	0	5156	2026-09-25 10:31:24.324944+00
1240	1	\N	B.3-5157	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.192535	13	TASK	2026-06-01	2026-06-05	5	0	5157	2026-09-25 10:31:24.330532+00
1284	1	\N	II.7-5201	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng 1/Installing signal of conduit and controlling floor 1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.632144	15	TASK	2026-08-23	2026-08-25	3	0	5201	2026-09-25 10:31:24.695128+00
1285	1	\N	II.8-5202	Thi công lắp đặt ống luồn dây tiến hiệu và điều khiển tầng 2 /Installing signal of conduit and controlling floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.637918	15	TASK	2026-09-02	2026-09-04	3	0	5202	2026-09-25 10:31:24.700859+00
1286	1	\N	II.9-5203	Thử áp đường ống đồng tầng 1 /Testing pressure copper pipe floor 1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.643848	15	TASK	2026-09-02	2026-09-02	1	0	5203	2026-09-25 10:31:24.707255+00
1287	1	\N	II.10-5204	Thử áp đường ống đồng tầng 2 /Testing pressure copper pipe floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.650219	15	TASK	2026-09-09	2026-09-09	1	0	5204	2026-09-25 10:31:24.712855+00
1288	1	\N	II.11-5205	Thử kín đường ống nước ngưng tầng 1/Testing sealing water pipe floor 1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.656229	15	TASK	2026-09-01	2026-09-01	1	0	5205	2026-09-25 10:31:24.718459+00
1289	1	\N	II.12-5206	Thử kín đường ống nước ngưng tầng 2/Testing sealing water pipe floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.661784	15	TASK	2026-09-07	2026-09-07	1	0	5206	2026-09-25 10:31:24.724076+00
1290	1	\N	II.13-5207	Lắp đặt thiết bị quạt thông gió tầng 1/Installing air duct fan equipment floor 1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.667878	15	TASK	2026-08-23	2026-08-24	2	0	5207	2026-09-25 10:31:24.72935+00
1291	1	\N	II.14-5208	Lắp đặt thiết bị quạt thông gió tầng T2/Installing air duct fan equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.674601	15	TASK	2026-08-26	2026-08-27	2	0	5208	2026-09-25 10:31:24.735121+00
1292	1	\N	II.15-5209	Lắp đặt nón che mua tầng mái/Installing air hat roof floor	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.681135	15	TASK	2026-08-29	2026-08-30	2	0	5209	2026-09-25 10:31:24.740559+00
1293	1	\N	II.16-5210	Lắp đặt thiết bị điều hòa không khí tầng 1/Installing air conditional equipment floor 1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.686857	15	TASK	2026-08-23	2026-08-29	7	0	5210	2026-09-25 10:31:24.745626+00
1294	1	\N	II.17-5211	Lắp đặt thiết bị điều hòa không khí tầng 2 /Installing air conditional equipment floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.69313	15	TASK	2026-08-31	2026-09-03	4	0	5211	2026-09-25 10:31:24.751477+00
1295	1	\N	II.18-5212	Lắp đặt thiết bị điều khiển tầng 1/Installing controling equipment floor 1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.700071	15	TASK	2026-08-23	2026-08-24	2	0	5212	2026-09-25 10:31:24.756875+00
1296	1	\N	II.19-5213	Lắp đặt thiết bị điều khiển tầng 2 /Installing controling equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.705389	15	TASK	2026-08-31	2026-08-31	1	0	5213	2026-09-25 10:31:24.761833+00
1297	1	\N	II.20-5214	Lắp đặt cửa gió tầng 1 /Installing air diffuser baseman floor	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.711151	15	TASK	2026-10-27	2026-10-28	2	0	5214	2026-09-25 10:31:24.767178+00
1298	1	\N	II.21-5215	Lắp đặt cửa gió tầng 2 /Installing air diffuser floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.717221	15	TASK	2026-10-30	2026-10-31	2	0	5215	2026-09-25 10:31:24.772171+00
1299	1	\N	II.22-5216	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.723592	15	TASK	2026-11-02	2026-11-02	1	0	5216	2026-09-25 10:31:24.777236+00
1301	1	\N	I-5218	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.801446	17	TASK	2026-06-18	2026-10-21	\N	\N	5218	2026-09-25 10:31:24.855107+00
1302	1	\N	I.1-5219	Thi công lắp đặt đường ống cấp nước /Installing water pipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.806872	17	TASK	2026-08-09	2026-08-18	10	0	5219	2026-09-25 10:31:24.860336+00
1303	1	\N	I.2-5220	Thi công lắp đặt đường ống thoát nước/Installing drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.811765	17	TASK	2026-06-18	2026-06-22	5	0	5220	2026-09-25 10:31:24.865533+00
1304	1	\N	I.3-5221	Kiểm tra thử áp đường ống cấp nước/ Testing pressure of drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.820242	17	TASK	2026-08-19	2026-08-21	3	0	5221	2026-09-25 10:31:24.870709+00
1305	1	\N	I.4-5222	Kiểm tra thử kín đường ống thoát nước/Testing drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.829228	17	TASK	2026-06-23	2026-06-25	3	0	5222	2026-09-25 10:31:24.876166+00
1306	1	\N	I.5-5223	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.840851	17	TASK	2026-10-15	2026-10-21	7	0	5223	2026-09-25 10:31:24.881507+00
1307	1	\N	I.6-5224	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.845967	17	TASK	2026-10-19	2026-10-21	3	0	5224	2026-09-25 10:31:24.88687+00
1308	1	\N	II-5225	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.851804	17	TASK	2026-07-15	2026-10-06	\N	\N	5225	2026-09-25 10:31:24.892346+00
1309	1	\N	II.1-5226	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.857282	17	TASK	2026-08-09	2026-08-10	2	0	5226	2026-09-25 10:31:24.897323+00
1310	1	\N	II.2-5227	Thi công lắp đặt ống đồng và bảo ôn tầng T2/Installing copper pipe and heat insulation floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.862305	17	TASK	2026-08-12	2026-08-12	1	0	5227	2026-09-25 10:31:24.902381+00
1311	1	\N	II.3-5228	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.867905	17	TASK	2026-08-09	2026-08-10	2	0	5228	2026-09-25 10:31:24.907471+00
1312	1	\N	II.4-5229	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T2/Installing sealing water pipe and heat insulation floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.873452	17	TASK	2026-08-12	2026-08-12	1	0	5229	2026-09-25 10:31:24.91274+00
1273	1	\N	I.3-5190	Kiểm tra thử áp đường ống cấp nước/ Testing pressure of drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.56431	15	TASK	2026-09-02	2026-09-04	3	0	5190	2026-09-25 10:31:24.63687+00
1274	1	\N	I.4-5191	Kiểm tra thử kín đường ống thoát nước/Testing drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.570612	15	TASK	2026-04-23	2026-04-25	3	0	5191	2026-09-25 10:31:24.642118+00
1275	1	\N	I.5-5192	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.577017	15	TASK	2026-10-17	2026-10-23	7	0	5192	2026-09-25 10:31:24.647311+00
1276	1	\N	I.6-5193	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.582683	15	TASK	2026-10-24	2026-10-24	1	0	5193	2026-09-25 10:31:24.652247+00
1277	1	\N	II-5194	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.588221	15	TASK	2026-07-12	2026-11-02	\N	\N	5194	2026-09-25 10:31:24.657791+00
1278	1	\N	II.1-5195	Thi công lắp đặt ống đồng và bảo ôn tầng 1 /Installing copper pipe and heat insulation floor 1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.594219	15	TASK	2026-08-23	2026-08-31	9	0	5195	2026-09-25 10:31:24.662772+00
1279	1	\N	II.2-5196	Thi công lắp đặt ống đồng và bảo ôn tầng T2/Installing copper pipe and heat insulation floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.600492	15	TASK	2026-09-02	2026-09-07	6	0	5196	2026-09-25 10:31:24.667894+00
1281	1	\N	II.4-5198	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T2/Installing sealing water pipe and heat insulation floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.612641	15	TASK	2026-09-01	2026-09-05	5	0	5198	2026-09-25 10:31:24.678472+00
1282	1	\N	II.5-5199	Thi công lắp đặt đường ống thông gió và bảo ôn tầng 1/Installing air duct and heat insulation floor 1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.619789	15	TASK	2026-07-12	2026-07-23	12	0	5199	2026-09-25 10:31:24.683365+00
1283	1	\N	II.6-5200	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T2/Installing air duct and heat insulation floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.62612	15	TASK	2026-07-25	2026-07-31	7	0	5200	2026-09-25 10:31:24.68931+00
1324	1	\N	ROW-40-5241	Lắp đặt thiết bị điều hòa không khí tầng T2/Installing air conditional equipment floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.940793	17	TASK	2026-08-24	2026-08-24	1	0	5241	2026-09-25 10:31:24.976921+00
1325	1	\N	ROW-41-5242	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.946123	17	TASK	2026-08-26	2026-08-26	1	0	5242	2026-09-25 10:31:24.982394+00
1326	1	\N	6-5243	Lắp đặt thiết bị điều khiển tầng T2/Installing controling equipment floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.951146	17	TASK	2026-08-26	2026-08-26	1	0	5243	2026-09-25 10:31:24.98823+00
1327	1	\N	7-5244	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.95646	17	TASK	2026-10-04	2026-10-04	1	0	5244	2026-09-25 10:31:24.993477+00
1328	1	\N	8-5245	Lắp đặt cửa gió tầng T2/Installing air diffuser floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.961627	17	TASK	2026-10-04	2026-10-04	1	0	5245	2026-09-25 10:31:24.99866+00
1329	1	\N	9-5246	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.966442	17	TASK	2026-10-06	2026-10-06	1	0	5246	2026-09-25 10:31:25.004133+00
1330	1	\N	A-5247	RES- 4 BR	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.03423	18	TASK	2026-06-18	2026-10-21	\N	\N	5247	2026-09-25 10:31:25.073176+00
1331	1	\N	I-5248	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.039284	18	TASK	2026-06-18	2026-10-21	\N	\N	5248	2026-09-25 10:31:25.07923+00
1332	1	\N	I.1-5249	Thi công lắp đặt đường ống cấp nước /Installing water pipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.044957	18	TASK	2026-08-09	2026-08-18	10	0	5249	2026-09-25 10:31:25.0857+00
1333	1	\N	I.2-5250	Thi công lắp đặt đường ống thoát nước/Installing drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.050184	18	TASK	2026-06-18	2026-06-22	5	0	5250	2026-09-25 10:31:25.091798+00
1334	1	\N	I.3-5251	Kiểm tra thử áp đường ống cấp nước/ Testing pressure of drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.055286	18	TASK	2026-08-19	2026-08-21	3	0	5251	2026-09-25 10:31:25.098088+00
1335	1	\N	I.4-5252	Kiểm tra thử kín đường ống thoát nước/Testing drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.060816	18	TASK	2026-06-23	2026-06-25	3	0	5252	2026-09-25 10:31:25.103757+00
1337	1	\N	I.6-5254	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.071311	18	TASK	2026-10-19	2026-10-21	3	0	5254	2026-09-25 10:31:25.114786+00
1338	1	\N	II-5255	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.07678	18	TASK	2026-07-15	2026-10-06	\N	\N	5255	2026-09-25 10:31:25.119873+00
1339	1	\N	II.1-5256	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.08232	18	TASK	2026-08-09	2026-08-10	2	0	5256	2026-09-25 10:31:25.12484+00
1341	1	\N	II.3-5258	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.09296	18	TASK	2026-08-09	2026-08-10	2	0	5258	2026-09-25 10:31:25.135661+00
1342	1	\N	II.4-5259	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T2/Installing sealing water pipe and heat insulation floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.098613	18	TASK	2026-08-12	2026-08-12	1	0	5259	2026-09-25 10:31:25.140804+00
1344	1	\N	II.6-5261	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T2/Installing air duct and heat insulation floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.109501	18	TASK	2026-07-19	2026-07-19	1	0	5261	2026-09-25 10:31:25.151772+00
1345	1	\N	II.7-5262	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.115328	18	TASK	2026-08-09	2026-08-10	2	0	5262	2026-09-25 10:31:25.157564+00
1346	1	\N	II.8-5263	Thi công lắp đặt ống luồn dây tiến hiệu và điều khiển tầng T2/Installing signal of conduit and controlling floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.120729	18	TASK	2026-08-12	2026-08-12	1	0	5263	2026-09-25 10:31:25.163139+00
1347	1	\N	II.9-5264	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.125636	18	TASK	2026-08-12	2026-08-12	1	0	5264	2026-09-25 10:31:25.168327+00
1348	1	\N	II.10-5265	Thử áp đường ống đồng tầng T2/Testing pressure copper pipe floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.131412	18	TASK	2026-08-14	2026-08-14	1	0	5265	2026-09-25 10:31:25.173598+00
1349	1	\N	II.11-5266	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.136822	18	TASK	2026-08-12	2026-08-12	1	0	5266	2026-09-25 10:31:25.179137+00
1350	1	\N	II.12-5267	Thử kín đường ống nước ngưng tầng T2/Testing sealing water pipe floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.142021	18	TASK	2026-08-14	2026-08-14	1	0	5267	2026-09-25 10:31:25.184323+00
1351	1	\N	II.13-5268	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.147512	18	TASK	2026-08-23	2026-08-23	1	0	5268	2026-09-25 10:31:25.190061+00
1352	1	\N	II.14-5269	Lắp đặt thiết bị quạt thông gió tầng T2/Installing air duct fan equipment floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.152811	18	TASK	2026-08-25	2026-08-25	1	0	5269	2026-09-25 10:31:25.195612+00
1314	1	\N	ROW-30-5231	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T2/Installing air duct and heat insulation floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.884345	17	TASK	2026-07-19	2026-07-19	1	0	5231	2026-09-25 10:31:24.923087+00
1315	1	\N	ROW-31-5232	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.890117	17	TASK	2026-08-09	2026-08-10	2	0	5232	2026-09-25 10:31:24.928203+00
1316	1	\N	ROW-32-5233	Thi công lắp đặt ống luồn dây tiến hiệu và điều khiển tầng T2/Installing signal of conduit and controlling floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.895866	17	TASK	2026-08-12	2026-08-12	1	0	5233	2026-09-25 10:31:24.933321+00
1317	1	\N	ROW-33-5234	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.901147	17	TASK	2026-08-12	2026-08-12	1	0	5234	2026-09-25 10:31:24.938598+00
1318	1	\N	ROW-34-5235	Thử áp đường ống đồng tầng T2/Testing pressure copper pipe floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.907811	17	TASK	2026-08-14	2026-08-14	1	0	5235	2026-09-25 10:31:24.944284+00
1319	1	\N	ROW-35-5236	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.914163	17	TASK	2026-08-12	2026-08-12	1	0	5236	2026-09-25 10:31:24.949533+00
1320	1	\N	ROW-36-5237	Thử kín đường ống nước ngưng tầng T2/Testing sealing water pipe floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.919327	17	TASK	2026-08-14	2026-08-14	1	0	5237	2026-09-25 10:31:24.955077+00
1321	1	\N	ROW-37-5238	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.924731	17	TASK	2026-08-23	2026-08-23	1	0	5238	2026-09-25 10:31:24.960755+00
1322	1	\N	ROW-38-5239	Lắp đặt thiết bị quạt thông gió tầng T2/Installing air duct fan equipment floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.930085	17	TASK	2026-08-25	2026-08-25	1	0	5239	2026-09-25 10:31:24.965726+00
1323	1	\N	ROW-39-5240	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.935228	17	TASK	2026-08-22	2026-08-22	1	0	5240	2026-09-25 10:31:24.971461+00
1343	1	\N	II.5-5260	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.104471	18	TASK	2026-07-15	2026-07-17	3	0	5260	2026-09-25 10:31:25.146469+00
1364	1	\N	I.3-5281	Kiểm tra thử áp đường ống cấp nước/ Testing pressure of drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.279644	19	TASK	2026-06-13	2026-06-15	3	0	5281	2026-09-25 10:31:25.314535+00
1365	1	\N	I.4-5282	Thi công lắp đặt slevee hố bơm, bể tách mỡ /Installing water pipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.28545	19	TASK	2026-02-13	2026-02-14	2	0.8	5282	2026-09-25 10:31:25.320317+00
1366	1	\N	I.5-5283	Kiểm tra thử kín đường ống thoát nước/Testing drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.291577	19	TASK	2026-02-08	2026-02-10	3	0	5283	2026-09-25 10:31:25.325222+00
1367	1	\N	I.6-5284	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.297229	19	TASK	2026-07-30	2026-08-03	5	0	5284	2026-09-25 10:31:25.330305+00
1368	1	\N	I.7-5285	Kiểm tra, chạy thử hệ thống/Teestng and running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.302874	19	TASK	2026-08-04	2026-08-04	1	0	5285	2026-09-25 10:31:25.33596+00
1369	1	\N	II-5286	Hệ thống thông gió và điều hòa không khí/HVAC System	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.308996	19	TASK	2026-04-22	2026-08-01	\N	\N	5286	2026-09-25 10:31:25.34136+00
1370	1	\N	II.1-5287	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.314545	19	TASK	2026-06-03	2026-06-04	2	0	5287	2026-09-25 10:31:25.346953+00
1371	1	\N	II.2-5288	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.319456	19	TASK	2026-06-03	2026-06-03	1	0	5288	2026-09-25 10:31:25.352399+00
1372	1	\N	II.3-5289	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.325288	19	TASK	2026-04-22	2026-04-23	2	0	5289	2026-09-25 10:31:25.35741+00
1374	1	\N	II.5-5291	Thử áp đường ống đồng tầng T1/Testing pressure copper pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.335992	19	TASK	2026-06-06	2026-06-06	1	0	5291	2026-09-25 10:31:25.367766+00
1375	1	\N	II.6-5292	Thử kín đường ống nước ngưng tầng T1/Testing sealing water pipe floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.341453	19	TASK	2026-06-05	2026-06-05	1	0	5292	2026-09-25 10:31:25.372674+00
1376	1	\N	II.7-5293	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.347157	19	TASK	2026-04-25	2026-04-25	1	0	5293	2026-09-25 10:31:25.377525+00
1377	1	\N	II.8-5294	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.352138	19	TASK	2026-06-08	2026-06-08	1	0	5294	2026-09-25 10:31:25.383304+00
1378	1	\N	II.9-5295	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.357454	19	TASK	2026-06-10	2026-06-10	1	0	5295	2026-09-25 10:31:25.388338+00
1379	1	\N	II.10-5296	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.363128	19	TASK	2026-07-30	2026-07-30	1	0	5296	2026-09-25 10:31:25.393591+00
1380	1	\N	II.11-5297	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.368207	19	TASK	2026-08-01	2026-08-01	1	0	5297	2026-09-25 10:31:25.399552+00
891	1	\N	A.12-4808	Thử kín đường ống nước ngưng tầng T2/Testing sealing water pipe floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.466537	1	TASK	2026-04-12	2026-04-12	1	0	4808	2026-09-25 10:31:21.577973+00
892	1	\N	A.13-4809	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.4723	1	TASK	2026-06-23	2026-06-25	3	0	4809	2026-09-25 10:31:21.58504+00
930	1	\N	C.7-4847	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.686266	1	TASK	2026-05-01	2026-05-02	2	0	4847	2026-09-25 10:31:21.815841+00
1060	1	\N	A.1-4977	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.762323	7	TASK	2026-06-12	2026-06-13	2	0	4977	2026-09-25 10:31:22.978854+00
1105	1	\N	II.7-5022	Lắp đặt thiết bị quạt thông gió tầng T1/Installing air duct fan equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.112627	8	TASK	2026-07-30	2026-07-30	1	0	5022	2026-09-25 10:31:23.289465+00
1139	1	\N	II.1-5056	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.447147	10	TASK	2026-06-06	2026-06-07	2	0	5056	2026-09-25 10:31:23.593415+00
1354	1	\N	II.16-5271	Lắp đặt thiết bị điều hòa không khí tầng T2/Installing air conditional equipment floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.163783	18	TASK	2026-08-24	2026-08-24	1	0	5271	2026-09-25 10:31:25.20602+00
1355	1	\N	II.17-5272	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.171485	18	TASK	2026-08-26	2026-08-26	1	0	5272	2026-09-25 10:31:25.211037+00
1356	1	\N	II.18-5273	Lắp đặt thiết bị điều khiển tầng T2/Installing controling equipment floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.178225	18	TASK	2026-08-26	2026-08-26	1	0	5273	2026-09-25 10:31:25.216013+00
1357	1	\N	II.19-5274	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.187147	18	TASK	2026-10-04	2026-10-04	1	0	5274	2026-09-25 10:31:25.22127+00
1358	1	\N	II.20-5275	Lắp đặt cửa gió tầng T2/Installing air diffuser floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.193193	18	TASK	2026-10-04	2026-10-04	1	0	5275	2026-09-25 10:31:25.226561+00
1359	1	\N	II.21-5276	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.198803	18	TASK	2026-10-06	2026-10-06	1	0	5276	2026-09-25 10:31:25.231548+00
1360	1	\N	A-5277	VN RES	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.258487	19	TASK	2026-01-29	2026-08-04	\N	\N	5277	2026-09-25 10:31:25.292867+00
1361	1	\N	I-5278	Hệ thống cấp thoát nước/Water supply and drainage system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.263392	19	TASK	2026-01-29	2026-08-04	\N	\N	5278	2026-09-25 10:31:25.298748+00
1362	1	\N	I.1-5279	Thi công lắp đặt đường ống cấp nước /Installing water pipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.26924	19	TASK	2026-06-03	2026-06-12	10	0	5279	2026-09-25 10:31:25.304313+00
1363	1	\N	I.2-5280	Thi công lắp đặt đường ống thoát nước/Installing drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.274745	19	TASK	2026-01-29	2026-02-02	5	0	5280	2026-09-25 10:31:25.30929+00
931	1	\N	C.8-4848	Thi công lắp đặt ống luồn dây tiến hiệu và điều khiển tầng T2/Installing signal of conduit and controlling floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.691779	1	TASK	2026-05-04	2026-05-06	3	0	4848	2026-09-25 10:31:21.821411+00
970	1	\N	D.25-4887	Kiểm tra, chạy thử hệ thống/Testing, running system	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.91814	1	TASK	2026-07-14	2026-07-14	1	0	4887	2026-09-25 10:31:22.038468+00
980	1	\N	II.1-4897	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.052952	3	TASK	2026-05-29	2026-05-30	2	\N	4897	2026-09-25 10:31:22.160515+00
1013	1	\N	I.1-4930	Thi công lắp đặt đường ống cấp nước /Installing water pipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.373573	9	TASK	2026-06-23	2026-07-02	10	0	4930	2026-09-25 10:31:22.580884+00
949	1	\N	D.4-4866	Thi công lắp đặt ống nước ngưng và bảo ôn tầng T1/Installing sealing water pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:01.795244	1	TASK	2026-03-29	2026-03-29	1	0	4866	2026-09-25 10:31:21.927084+00
1020	1	\N	II.1-4937	Thi công lắp đặt ống đồng và bảo ôn tầng T1/Installing copper pipe and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:02.416701	9	TASK	2026-06-23	2026-06-24	2	0	4937	2026-09-25 10:31:22.620893+00
1147	1	\N	II.9-5064	Lắp đặt thiết bị điều khiển tầng T1/Installing controling equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.499007	10	TASK	2026-06-07	2026-06-07	1	0	5064	2026-09-25 10:31:23.636043+00
1179	1	\N	II.2-5096	Thi công hệ thống ống âm đất (cấp nước, thoát nước, thoát nước thải)Underground pipe system execution(water supply, drainage, sewage)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.842859	13	TASK	2026-02-14	2026-04-04	50	0	5096	2026-09-25 10:31:23.989503+00
1227	1	\N	VIII.2-5144	Thi công hệ thống ống âm đất (cấp nước, thoát nước, thoát nước thải)Underground pipe system execution(water supply, drainage, sewage)	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.116943	13	TASK	2026-03-09	2026-06-01	85	0	5144	2026-09-25 10:31:24.29117+00
1272	1	\N	I.2-5189	Thi công lắp đặt đường ống thoát nước/Installing drainpipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.558209	15	TASK	2026-04-18	2026-04-22	5	0	5189	2026-09-25 10:31:24.631899+00
1280	1	\N	II.3-5197	Thi công lắp đặt ống nước ngưng và bảo ôn tầng 1/Installing sealing water pipe and heat insulation floor 1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.605946	15	TASK	2026-08-23	2026-08-30	8	0	5197	2026-09-25 10:31:24.673026+00
1313	1	\N	II.5-5230	Thi công lắp đặt đường ống thông gió và bảo ôn tầng T1/Installing air duct and heat insulation floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.878635	17	TASK	2026-07-15	2026-07-17	3	0	5230	2026-09-25 10:31:24.917659+00
1340	1	\N	II.2-5257	Thi công lắp đặt ống đồng và bảo ôn tầng T2/Installing copper pipe and heat insulation floor2	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.087417	18	TASK	2026-08-12	2026-08-12	1	0	5257	2026-09-25 10:31:25.130593+00
1353	1	\N	II.15-5270	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.157692	18	TASK	2026-08-22	2026-08-22	1	0	5270	2026-09-25 10:31:25.200714+00
1373	1	\N	II.4-5290	Thi công lắp đặt ống luồn dây tin hiệu và điều khiển tầng T1/Installing signal of conduit and controlling floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.331204	19	TASK	2026-06-03	2026-06-03	1	0	5290	2026-09-25 10:31:25.362342+00
1106	1	\N	II.8-5023	Lắp đặt thiết bị điều hòa không khí tầng T1/Installing air conditional equipment floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.119028	8	TASK	2026-07-30	2026-07-30	1	0	5023	2026-09-25 10:31:23.294319+00
1228	1	\N	VIII.3-5145	Thi công hệ thống valve, vòi, trụ/ Valve system, ejector, pillar installation	\N	\N	\N	\N	\N	1	2026-09-23 21:47:04.12293	13	TASK	2026-05-23	2026-07-26	65	0	5145	2026-09-25 10:31:24.297433+00
1148	1	\N	II.10-5065	Lắp đặt cửa gió tầng T1/Installing air diffuser floor1	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.50441	10	TASK	2026-08-20	2026-08-20	1	0	5065	2026-09-25 10:31:23.641034+00
1152	1	\N	I.1-5069	Thi công lắp đặt đường ống cấp nước /Installing water pipe	\N	\N	\N	\N	\N	1	2026-09-23 21:47:03.582967	10	TASK	2026-06-08	2026-07-02	25	0	5069	2026-09-25 10:31:23.716289+00
1336	1	\N	I.5-5253	Thi công lắp đặt thiết bị vệ sinh/Installig sanitary equipment	\N	\N	\N	\N	\N	1	2026-09-23 21:47:05.066103	18	TASK	2026-10-15	2026-10-21	7	0	5253	2026-09-25 10:31:25.108997+00
\.

-- shop_drawings — dự án BTE-WP4-HBC
-- Sinh bởi scripts/export-demo-seed.mjs. Nạp bằng: node scripts/load-demo-seed.mjs
-- Ngày giữ nguyên theo hồ sơ gốc; `npm run setup` gọi rebase-demo-dates.mjs để neo về ngày chạy.
COPY shop_drawings ("id", "project_id", "zone_id", "source_sheet", "drawing_code", "name_vi", "name_en", "progress_pct", "status", "planned_submit_date", "actual_submit_date", "bql_l1_response", "bql_l1_date", "bql_l1_comment", "bql_l2_response", "bql_l2_date", "bql_l2_comment", "bql_l3_response", "bql_l3_date", "bql_l3_comment", "bql_l4_response", "bql_l4_date", "bql_l4_comment", "bql_l5_response", "bql_l5_date", "bql_l5_comment", "rs1_planned_date", "rs1_actual_date", "rs2_planned_date", "rs2_actual_date", "approval_date", "rejected_reason", "rejected_by", "rejected_at", "reverted_to_draft_at", "reverted_to_draft_by", "created_at", "upload_id", "notes", "as_built_status", "as_built_at", "as_built_by", "as_built_notes", "work_item_id") FROM stdin;
4030	1	1	SHOP BOH	BTE-WP4-HBC-SHD- MEP-PLB-PID-BOH-001	MẶT BẰNG HỆ THỐNG THOÁT NƯỚC THẢI - CAO ĐỘ C\nWASTE WATER DRAINAGE SYSTEM PLAN - LEVEL C	\N	1	DRAFT	2026-02-01	2026-01-31	R	2026-02-01	\N	\N	2026-02-10	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.873196	\N	\N	PENDING	\N	\N	\N	\N
4007	1	1	SHOP BOH	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BOH-011	\N	\N	\N	DRAFT	2026-02-01	2026-02-04	R	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-14	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.801155	\N	\N	PENDING	\N	\N	\N	\N
4042	1	1	SHOP BOH	BTE-WP4-HBC-SHD- MEP-PLB-PL-BOH-009	CHI TIẾT BỂ TỰ HOẠI, BỂ TÁCH DẦU, STP\nDETAIL OF SEPTIC TANK, GREASE TRAP, STP	\N	1	DRAFT	2026-02-01	2026-02-02	R	2026-02-02	\N	\N	2026-02-03	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.909195	\N	\N	PENDING	\N	\N	\N	\N
4008	1	1	SHOP BOH	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BOH-012	\N	\N	\N	DRAFT	2026-02-01	2026-02-04	R	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-14	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.804083	\N	\N	PENDING	\N	\N	\N	\N
4010	1	1	SHOP BOH	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BOH-014	\N	\N	\N	DRAFT	2026-02-01	2026-02-04	R	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-14	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.810537	\N	\N	PENDING	\N	\N	\N	\N
4011	1	1	SHOP BOH	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BOH-015	\N	\N	\N	DRAFT	2026-02-01	2026-02-04	R	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-14	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.814061	\N	\N	PENDING	\N	\N	\N	\N
4012	1	1	SHOP BOH	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BOH-016	\N	\N	\N	DRAFT	2026-02-01	2026-02-04	R	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-14	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.817054	\N	\N	PENDING	\N	\N	\N	\N
4013	1	1	SHOP BOH	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BOH-017	\N	\N	\N	DRAFT	2026-02-01	2026-02-04	R	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-14	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.819849	\N	\N	PENDING	\N	\N	\N	\N
4014	1	1	SHOP BOH	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BOH-018	\N	\N	\N	DRAFT	2026-02-01	2026-02-04	R	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-14	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.822984	\N	\N	PENDING	\N	\N	\N	\N
4015	1	1	SHOP BOH	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BOH-019	\N	\N	\N	DRAFT	2026-02-01	2026-02-04	R	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-14	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.826683	\N	\N	PENDING	\N	\N	\N	\N
4016	1	1	SHOP BOH	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BOH-020	\N	\N	\N	DRAFT	2026-02-01	2026-02-04	R	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-14	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.830477	\N	\N	PENDING	\N	\N	\N	\N
4017	1	1	SHOP BOH	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BOH-021	\N	\N	\N	DRAFT	2026-02-01	2026-02-04	R	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-14	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.83379	\N	\N	PENDING	\N	\N	\N	\N
4018	1	1	SHOP BOH	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BOH-022	\N	\N	\N	DRAFT	2026-02-01	2026-02-04	R	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-14	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.837186	\N	\N	PENDING	\N	\N	\N	\N
4019	1	1	SHOP BOH	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BOH-023	MẶT BẰNG HỆ THỐNG ĐHKK & THÔNG GIÓ - CAO ĐỘ F\nAIR CONDITIONING AND VENTILATION SYSTEM PLAN - LEVEL F	\N	\N	DRAFT	2026-02-01	2026-02-04	R	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-14	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.840633	\N	\N	PENDING	\N	\N	\N	\N
4020	1	1	SHOP BOH	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BOH-024	\N	\N	\N	DRAFT	2026-02-01	2026-02-04	R	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-14	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.844158	\N	\N	PENDING	\N	\N	\N	\N
4021	1	1	SHOP BOH	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BOH-025	\N	\N	\N	DRAFT	2026-02-01	2026-02-04	R	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-14	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.847428	\N	\N	PENDING	\N	\N	\N	\N
4022	1	1	SHOP BOH	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BOH-026	\N	\N	\N	DRAFT	2026-02-01	2026-02-04	R	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-14	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.850201	\N	\N	PENDING	\N	\N	\N	\N
4023	1	1	SHOP BOH	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BOH-027	\N	\N	\N	DRAFT	2026-02-01	2026-02-04	R	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-14	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.852858	\N	\N	PENDING	\N	\N	\N	\N
4024	1	1	SHOP BOH	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BOH-028	\N	\N	\N	DRAFT	2026-02-01	2026-02-04	R	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-14	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.856084	\N	\N	PENDING	\N	\N	\N	\N
4025	1	1	SHOP BOH	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BOH-029	\N	\N	\N	DRAFT	2026-02-01	2026-02-04	R	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-14	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.859138	\N	\N	PENDING	\N	\N	\N	\N
4026	1	1	SHOP BOH	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BOH-030	\N	\N	\N	DRAFT	2026-02-01	2026-02-04	R	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-14	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.862046	\N	\N	PENDING	\N	\N	\N	\N
4028	1	1	SHOP BOH	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BOH-001	MẶT BẰNG HỆ THỐNG CẤP NƯỚC - CAO ĐỘ A, C\nWATER SUPPLY SYSTEM PLAN - LEVEL A, C	\N	1	DRAFT	2026-02-01	2026-01-31	R	2026-02-01	\N	\N	2026-02-10	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.867626	\N	\N	PENDING	\N	\N	\N	\N
4029	1	1	SHOP BOH	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BOH-002	MẶT BẰNG HỆ THỐNG CẤP NƯỚC - CAO ĐỘ E, F\nWATER SUPPLY SYSTEM PLAN - LEVEL E, F	\N	\N	DRAFT	2026-02-21	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-08	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.870471	\N	\N	PENDING	\N	\N	\N	\N
4031	1	1	SHOP BOH	BTE-WP4-HBC-SHD- MEP-PLB-PID-BOH-002	MẶT BẰNG HỆ THỐNG THOÁT NƯỚC THẢI - CAO ĐỘ E, F\nWASTE WATER DRAINAGE SYSTEM PLAN - LEVEL E, F	\N	\N	DRAFT	2026-02-21	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-08	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.875864	\N	\N	PENDING	\N	\N	\N	\N
4034	1	1	SHOP BOH	BTE-WP4-HBC-SHD- MEP-PLB-PID-BOH-004	MẶT BẰNG HỆ THỐNG THOÁT NƯỚC MƯA - CAO ĐÔ F, MÁI\nRAIN WATER DRAINAGE SYSTEM PLAN - LEVEL F, ROOF	\N	\N	DRAFT	2026-02-18	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-08	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.883937	\N	\N	PENDING	\N	\N	\N	\N
4035	1	1	SHOP BOH	BTE-WP4-HBC-SHD- MEP-PLB-PL-BOH-002	CHI TIẾT CẤP THOÁT NƯỚC VỆ SINH - CAO ĐỘ +20.10M & +23.30MM\nSANITARY SEWER DETAILS - LEVEL +20.10M & +23.30MM	\N	\N	DRAFT	2026-02-18	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-08	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.886635	\N	\N	PENDING	\N	\N	\N	\N
4036	1	1	SHOP BOH	BTE-WP4-HBC-SHD- MEP-PLB-PL-BOH-003	CHI TIẾT CẤP THOÁT NƯỚC VỆ SINH - CAO ĐỘ +20.10M & +23.30MM\nSANITARY SEWER DETAILS - LEVEL +20.10M & +23.30MM	\N	\N	DRAFT	2026-02-18	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-08	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.889707	\N	\N	PENDING	\N	\N	\N	\N
4037	1	1	SHOP BOH	BTE-WP4-HBC-SHD- MEP-PLB-PL-BOH-004	CHI TIẾT THOÁT NƯỚC VỆ SINH BẾP\n SANITARY SEWER DETAILS	\N	\N	DRAFT	2026-02-18	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-08	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.892429	\N	\N	PENDING	\N	\N	\N	\N
4038	1	1	SHOP BOH	BTE-WP4-HBC-SHD- MEP-PLB-PL-BOH-005	CHI TIẾT CẤP NƯỚC PHÒNG GIẶT\nPLUMBING & SANITARY DETAILS OF LAUNDRY ROOM	\N	\N	DRAFT	2026-02-18	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-08	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.895533	\N	\N	PENDING	\N	\N	\N	\N
4039	1	1	SHOP BOH	BTE-WP4-HBC-SHD- MEP-PLB-PL-BOH-006	CHI TIẾT THOÁT NƯỚC PHÒNG GIẶT\nPLUMBING & SANITARY DETAILS OF LAUNDRY ROOM	\N	\N	DRAFT	2026-02-18	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-08	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.899142	\N	\N	PENDING	\N	\N	\N	\N
4040	1	1	SHOP BOH	BTE-WP4-HBC-SHD- MEP-PLB-PL-BOH-007	CHI TIẾT BỂ NƯỚC SINH HOẠT + PCCC (1)\nDETAIL OF DOMESTIC WATER TANK,FIRE TANK (1)	\N	\N	DRAFT	2026-02-18	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-08	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.902001	\N	\N	PENDING	\N	\N	\N	\N
4041	1	1	SHOP BOH	BTE-WP4-HBC-SHD- MEP-PLB-PL-BOH-008	CHI TIẾT BỂ NƯỚC SINH HOẠT + PCCC (2)\nDETAIL OF DOMESTIC WATER TANK,FIRE TANK (2)	\N	\N	DRAFT	2026-02-18	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-08	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.905385	\N	\N	PENDING	\N	\N	\N	\N
4032	1	1	SHOP BOH	BTE-WP4-HBC-SHD- MEP-PLB-PID-BOH-003	MẶT BẰNG HỆ THỐNG THOÁT NƯỚC MƯA - CAO ĐÔ E\nRAIN WATER DRAINAGE SYSTEM PLAN - LEVEL E	\N	\N	DRAFT	2026-02-18	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-08	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.878516	\N	\N	PENDING	\N	\N	\N	\N
3998	1	1	SHOP BOH	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BOH-002	\N	\N	\N	DRAFT	2026-02-01	2026-02-04	R	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-14	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.774004	\N	\N	PENDING	\N	\N	\N	\N
3999	1	1	SHOP BOH	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BOH-003	\N	\N	\N	DRAFT	2026-02-01	2026-02-04	R	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-14	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.776474	\N	\N	PENDING	\N	\N	\N	\N
4000	1	1	SHOP BOH	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BOH-004	\N	\N	\N	DRAFT	2026-02-01	2026-02-04	R	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-14	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.778999	\N	\N	PENDING	\N	\N	\N	\N
4001	1	1	SHOP BOH	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BOH-005	\N	\N	\N	DRAFT	2026-02-01	2026-02-04	R	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-14	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.781782	\N	\N	PENDING	\N	\N	\N	\N
4002	1	1	SHOP BOH	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BOH-006	MẶT BẰNG HỆ THỐNG ĐHKK & THÔNG GIÓ - CAO ĐỘ A & B\nAIR CONDITIONING AND VENTILATION SYSTEM PLAN - LEVEL A & B	\N	\N	DRAFT	2026-02-01	2026-02-04	R	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-14	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.784156	\N	\N	PENDING	\N	\N	\N	\N
4004	1	1	SHOP BOH	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BOH-008	\N	\N	\N	DRAFT	2026-02-01	2026-02-04	R	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-14	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.790478	\N	\N	PENDING	\N	\N	\N	\N
4005	1	1	SHOP BOH	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BOH-009	\N	\N	\N	DRAFT	2026-02-01	2026-02-04	R	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-14	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.793758	\N	\N	PENDING	\N	\N	\N	\N
4006	1	1	SHOP BOH	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BOH-010	\N	\N	\N	DRAFT	2026-02-01	2026-02-04	R	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-14	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.797791	\N	\N	PENDING	\N	\N	\N	\N
4003	1	1	SHOP BOH	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BOH-007	\N	\N	\N	DRAFT	2026-02-01	2026-02-04	R	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-14	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.787063	\N	\N	PENDING	\N	\N	\N	\N
4027	1	1	SHOP BOH	BTE-WP4-HBC-SHD- MEP-PLB-PL-BOH-001	SƠ ĐỒ NGUYÊN LÝ HỆ THỐNG CẤP NƯỚC, THOÁT NƯỚC THẢI\nWATER SUPPLY AND DRAINAGE WATER SYSTEM - SINGLE LINE DIAGRAM	\N	1	DRAFT	2026-02-01	2026-01-31	R	2026-02-01	\N	\N	2026-02-10	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.865076	\N	\N	PENDING	\N	\N	\N	\N
3997	1	1	SHOP BOH	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BOH-001	SƠ ĐỒ NGUYÊN LÝ HỆ THỐNG ĐHKK & THÔNG GIÓ\nAIR CONDITIONING AND VENTILATION SYSTEM - SINGLE LINE DIAGRAM	\N	\N	DRAFT	2026-02-01	2026-02-04	R	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-14	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.770592	\N	\N	PENDING	\N	\N	\N	\N
4009	1	1	SHOP BOH	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BOH-013	MẶT BẰNG HỆ THỐNG ĐHKK & THÔNG GIÓ - CAO ĐỘ C,D & E\nAIR CONDITIONING AND VENTILATION SYSTEM PLAN - LEVELC,D & E	\N	\N	DRAFT	2026-02-01	2026-02-04	R	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-14	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 05:41:36.807433	\N	\N	PENDING	\N	\N	\N	\N
5015	1	10	SHOP HPV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-HPV-002	HỆ THỐNG ĐIỀU HÒA KHÔNG KHÍ VÀ THÔNG GIÓ  - SƠ ĐỒ NGUYÊN LÝ - DANH MỤC THIẾT BỊ - MẶT BẰNG\nMVAC SYSTEM - SCHEMATIC DIAGRAM - EQUIPMENT SCHEDULES - MVAC PLAN	\N	\N	DRAFT	2026-02-20	2026-02-22	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.561942	\N	\N	PENDING	\N	\N	\N	\N
5016	1	10	SHOP HPV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-HPV-003	HỆ THỐNG ĐHKK & THÔNG GIÓ - DANH MỤC THIẾT BỊ\nAIR CONDITIONING AND VENTILATION SYSTEM - EQUIPMENT SCHEDULES	\N	\N	DRAFT	2026-02-20	2026-02-22	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.565109	\N	\N	PENDING	\N	\N	\N	\N
5029	1	10	SHOP HPV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-HPV-0016	HỆ THỐNG ĐHKK & THÔNG GIÓ - MẶT CẮT 1-1\nAIR CONDITIONING AND VENTILATION SYSTEM - SECTION 1-1	\N	\N	DRAFT	2026-02-20	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.592334	\N	\N	PENDING	\N	\N	\N	\N
5017	1	10	SHOP HPV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-HPV-004	HỆ THỐNG ĐHKK & THÔNG GIÓ - SƠ ĐỒ NGUYÊN LÝ \nAIR CONDITIONING AND VENTILATION SYSTEM - SCHEMATIC DIAGRAM	\N	\N	DRAFT	2026-02-20	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.567134	\N	\N	PENDING	\N	\N	\N	\N
5018	1	10	SHOP HPV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-HPV-005	HỆ THỐNG ĐHKK & THÔNG GIÓ - MẶT BẰNG TẦNG HẦM & TẦNG TRỆT\nAIR CONDITIONING AND VENTILATION SYSTEM - BASEMENT & GROUND FLOOR PLAN	\N	\N	DRAFT	2026-02-20	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.568759	\N	\N	PENDING	\N	\N	\N	\N
5019	1	10	SHOP HPV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-HPV-006	HỆ THỐNG ĐHKK & THÔNG GIÓ - MẶT CẮT 1-1\nAIR CONDITIONING AND VENTILATION SYSTEM - SECTION 1-1	\N	\N	DRAFT	2026-02-20	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.571043	\N	\N	PENDING	\N	\N	\N	\N
5020	1	10	SHOP HPV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-HPV-007	HỆ THỐNG ĐHKK & THÔNG GIÓ - DANH MỤC THIẾT BỊ\nAIR CONDITIONING AND VENTILATION SYSTEM - EQUIPMENT SCHEDULES	\N	\N	DRAFT	2026-02-20	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.573382	\N	\N	PENDING	\N	\N	\N	\N
5021	1	10	SHOP HPV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-HPV-008	HỆ THỐNG ĐHKK & THÔNG GIÓ - SƠ ĐỒ NGUYÊN LÝ \nAIR CONDITIONING AND VENTILATION SYSTEM - SCHEMATIC DIAGRAM	\N	\N	DRAFT	2026-02-20	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.576686	\N	\N	PENDING	\N	\N	\N	\N
5022	1	10	SHOP HPV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-HPV-009	HỆ THỐNG ĐHKK & THÔNG GIÓ - MẶT BẰNG TẦNG HẦM & TẦNG TRỆT\nAIR CONDITIONING AND VENTILATION SYSTEM - BASEMENT & GROUND FLOOR PLAN	\N	\N	DRAFT	2026-02-20	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.579235	\N	\N	PENDING	\N	\N	\N	\N
5023	1	10	SHOP HPV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-HPV-010	HỆ THỐNG ĐHKK & THÔNG GIÓ - MẶT CẮT 1-1\nAIR CONDITIONING AND VENTILATION SYSTEM - SECTION 1-1	\N	\N	DRAFT	2026-02-20	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.581428	\N	\N	PENDING	\N	\N	\N	\N
5024	1	10	SHOP HPV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-HPV-0011	HỆ THỐNG ĐIỀU HÒA KHÔNG KHÍ VÀ THÔNG GIÓ  - SƠ ĐỒ NGUYÊN LÝ - DANH MỤC THIẾT BỊ - MẶT BẰNG\nMVAC SYSTEM - SCHEMATIC DIAGRAM - EQUIPMENT SCHEDULES - MVAC PLAN	\N	\N	DRAFT	2026-02-20	2026-02-22	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.583154	\N	\N	PENDING	\N	\N	\N	\N
5025	1	10	SHOP HPV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-HPV-0012	HỆ THỐNG ĐIỀU HÒA KHÔNG KHÍ VÀ THÔNG GIÓ  - SƠ ĐỒ NGUYÊN LÝ - DANH MỤC THIẾT BỊ - MẶT BẰNG\nMVAC SYSTEM - SCHEMATIC DIAGRAM - EQUIPMENT SCHEDULES - MVAC PLAN	\N	\N	DRAFT	2026-02-20	2026-02-22	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.584742	\N	\N	PENDING	\N	\N	\N	\N
5026	1	10	SHOP HPV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-HPV-0013	HỆ THỐNG ĐHKK & THÔNG GIÓ - DANH MỤC THIẾT BỊ\nAIR CONDITIONING AND VENTILATION SYSTEM - EQUIPMENT SCHEDULES	\N	\N	DRAFT	2026-02-20	2026-02-22	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.586929	\N	\N	PENDING	\N	\N	\N	\N
5027	1	10	SHOP HPV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-HPV-0014	HỆ THỐNG ĐHKK & THÔNG GIÓ - SƠ ĐỒ NGUYÊN LÝ \nAIR CONDITIONING AND VENTILATION SYSTEM - SCHEMATIC DIAGRAM	\N	\N	DRAFT	2026-02-20	2026-02-22	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.58891	\N	\N	PENDING	\N	\N	\N	\N
5028	1	10	SHOP HPV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-HPV-0015	HỆ THỐNG ĐHKK & THÔNG GIÓ - MẶT BẰNG TẦNG HẦM & TẦNG TRỆT\nAIR CONDITIONING AND VENTILATION SYSTEM - BASEMENT & GROUND FLOOR PLAN	\N	\N	DRAFT	2026-02-20	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.590726	\N	\N	PENDING	\N	\N	\N	\N
5040	1	10	SHOP HPV	BTE-WP4-HBC-SHD- MEP-PLB-PL-HPV - 3BR -001	HỆ THỐNG CẤP THOÁT NƯỚC - SƠ ĐỒ NGUYÊN LÝ\nPLUMBING AND SANITARY SYSTEM - SCHEMATIC DIAGRAM	\N	\N	DRAFT	2026-02-11	2026-02-16	R	2026-02-17	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-07	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.61262	\N	\N	PENDING	\N	\N	\N	\N
5041	1	10	SHOP HPV	BTE-WP4-HBC-SHD- MEP-PLB-PWS-HPV - 3BR -001	HỆ THỐNG CẤP NƯỚC - MẶT BẰNG TẦNG HẦM & TẦNG TRỆT\nWATER SUPPLY SYSTEM - BASEMENT & GROUND FLOOR PLAN	\N	\N	DRAFT	2026-02-11	2026-02-16	R	2026-02-17	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-07	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.614288	\N	\N	PENDING	\N	\N	\N	\N
5042	1	10	SHOP HPV	BTE-WP4-HBC-SHD- MEP-PLB-PID-HPV - 3BR -001	HỆ THỐNG THOÁT NƯỚC - MẶT BẰNG TẦNG HẦM & TẦNG TRỆT\nDRAINAGE WATER SYSTEM - BASEMENT & GROUND FLOOR PLAN	\N	\N	DRAFT	2026-02-11	2026-02-16	R	2026-02-17	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-07	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.615959	\N	\N	PENDING	\N	\N	\N	\N
5043	1	10	SHOP HPV	BTE-WP4-HBC-SHD- MEP-PLB-PL-HPV - 4BR -001	HỆ THỐNG CẤP THOÁT NƯỚC - SƠ ĐỒ NGUYÊN LÝ\nPLUMBING AND SANITARY SYSTEM - SCHEMATIC DIAGRAM	\N	\N	DRAFT	2026-02-11	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-11	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.617506	\N	\N	PENDING	\N	\N	\N	\N
5044	1	10	SHOP HPV	BTE-WP4-HBC-SHD- MEP-PLB-PWS-HPV - 4BR -001	HỆ THỐNG CẤP NƯỚC - MẶT BẰNG TẦNG HẦM & TẦNG TRỆT\nWATER SUPPLY SYSTEM - BASEMENT & GROUND FLOOR PLAN	\N	\N	DRAFT	2026-02-11	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-11	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.619895	\N	\N	PENDING	\N	\N	\N	\N
5045	1	10	SHOP HPV	BTE-WP4-HBC-SHD- MEP-PLB-PID-HPV - 4BR -001	HỆ THỐNG THOÁT NƯỚC - MẶT BẰNG TẦNG HẦM & TẦNG TRỆT\nDRAINAGE WATER SYSTEM - BASEMENT & GROUND FLOOR PLAN	\N	\N	DRAFT	2026-02-11	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-11	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.621691	\N	\N	PENDING	\N	\N	\N	\N
5030	1	10	SHOP HPV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-HPV-0017	HỆ THỐNG ĐHKK & THÔNG GIÓ - DANH MỤC THIẾT BỊ\nAIR CONDITIONING AND VENTILATION SYSTEM - EQUIPMENT SCHEDULES	\N	\N	DRAFT	2026-02-20	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.593989	\N	\N	PENDING	\N	\N	\N	\N
5031	1	10	SHOP HPV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-HPV-0018	HỆ THỐNG ĐHKK & THÔNG GIÓ - SƠ ĐỒ NGUYÊN LÝ \nAIR CONDITIONING AND VENTILATION SYSTEM - SCHEMATIC DIAGRAM	\N	\N	DRAFT	2026-02-20	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.596273	\N	\N	PENDING	\N	\N	\N	\N
5033	1	10	SHOP HPV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-HPV-0020	HỆ THỐNG ĐHKK & THÔNG GIÓ - MẶT CẮT 1-1\nAIR CONDITIONING AND VENTILATION SYSTEM - SECTION 1-1	\N	\N	DRAFT	2026-02-20	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.599354	\N	\N	PENDING	\N	\N	\N	\N
5034	1	10	SHOP HPV	BTE-WP4-HBC-SHD- MEP-PLB-PL-HPV - 1BR -001	HỆ THỐNG CẤP THOÁT NƯỚC - SƠ ĐỒ NGUYÊN LÝ\nPLUMBING AND SANITARY SYSTEM - SCHEMATIC DIAGRAM	\N	\N	DRAFT	2026-02-11	2026-02-16	R	2026-02-17	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-07	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.600903	\N	\N	PENDING	\N	\N	\N	\N
5035	1	10	SHOP HPV	BTE-WP4-HBC-SHD- MEP-PLB-PWS-HPV - 1BR -001	MẶT BẰNG HỆ THỐNG CẤP NƯỚC\nWATER SUPPLY SYSTEM PLAN	\N	\N	DRAFT	2026-02-11	2026-02-16	R	2026-02-17	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-07	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.603343	\N	\N	PENDING	\N	\N	\N	\N
5036	1	10	SHOP HPV	BTE-WP4-HBC-SHD- MEP-PLB-PID-HPV - 1BR -001	MẶT BẰNG HỆ THỐNG THOÁT NƯỚC (01)\nDRAINAGE WATER SYSTEM PLAN (01)	\N	\N	DRAFT	2026-02-11	2026-02-16	R	2026-02-17	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-07	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.605451	\N	\N	PENDING	\N	\N	\N	\N
5037	1	10	SHOP HPV	BTE-WP4-HBC-SHD- MEP-PLB-PID-HPV - 1BR -002	MẶT BẰNG HỆ THỐNG THOÁT NƯỚC (02)\nDRAINAGE WATER SYSTEM PLAN (02)	\N	\N	DRAFT	2026-02-11	2026-02-16	R	2026-02-17	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-07	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.607067	\N	\N	PENDING	\N	\N	\N	\N
5039	1	10	SHOP HPV	BTE-WP4-HBC-SHD- MEP-PLB-PID-HPV - 2BR -001	MẶT BẰNG HỆ THỐNG THOÁT NƯỚC - SƠ ĐỒ NGUYÊN LÝ\nDRAINAGE WATER SYSTEM PLAN - SCHEMATIC DIAGRAM	\N	\N	DRAFT	2026-02-11	2026-02-16	R	2026-02-17	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-07	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.610359	\N	\N	PENDING	\N	\N	\N	\N
5032	1	10	SHOP HPV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-HPV-0019	HỆ THỐNG ĐHKK & THÔNG GIÓ - MẶT BẰNG TẦNG HẦM & TẦNG TRỆT\nAIR CONDITIONING AND VENTILATION SYSTEM - BASEMENT & GROUND FLOOR PLAN	\N	\N	DRAFT	2026-02-20	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.59786	\N	\N	PENDING	\N	\N	\N	\N
5038	1	10	SHOP HPV	BTE-WP4-HBC-SHD- MEP-PLB-PWS-HPV - 2BR -001	MẶT BẰNG HỆ THỐNG CẤP NƯỚC  - SƠ ĐỒ NGUYÊN LÝ \nWATER SUPPLY SYSTEM PLAN - SCHEMATIC DIAGRAM	\N	\N	DRAFT	2026-02-11	2026-02-16	R	2026-02-17	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-07	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.608574	\N	\N	PENDING	\N	\N	\N	\N
5014	1	10	SHOP HPV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-HPV-001	HỆ THỐNG ĐIỀU HÒA KHÔNG KHÍ VÀ THÔNG GIÓ  - SƠ ĐỒ NGUYÊN LÝ - DANH MỤC THIẾT BỊ - MẶT BẰNG\nMVAC SYSTEM - SCHEMATIC DIAGRAM - EQUIPMENT SCHEDULES - MVAC PLAN	\N	\N	DRAFT	2026-02-20	2026-02-22	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.559478	\N	\N	PENDING	\N	\N	\N	\N
4994	1	9	SHOP BUT	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BUT-001	HỆ THỐNG ĐIỀU HÒA KHÔNG KHÍ VÀ THÔNG GIÓ - SƠ ĐỒ NGUYÊN LÝ - DANH MỤC THIẾT BỊ - MẶT BẰNG\nAIR CONDITIONING AND VENTILATION SYSTEM -  SCHEMATIC DIAGRAM - EQUIPMENT SCHEDULES - MVAC PLAN	\N	\N	DRAFT	2026-03-23	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.422757	\N	\N	PENDING	\N	\N	\N	\N
4995	1	9	SHOP BUT	BTE-WP4-HBC-SHD- MEP-PLB-PL-BUT -001	MẶT BẰNG HỆ THỐNG CẤP THOÁT NƯỚC\nPLUMBING AND SANITARY SYSTEM PLAN	\N	\N	DRAFT	2026-03-06	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-16	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.424697	\N	\N	PENDING	\N	\N	\N	\N
5046	1	13	SHOP INF	BTE-WP4-HBC-SHD- MEP-PLB-PL-INF-0001	GHI CHÚ CHUNG, CHÚ THÍCH, KÝ HIỆU & DANH SÁCH BẢN VẼ \nGENERAL NOTES, LEGENDS, SYMBOLS & DRAWING LIST	\N	\N	DRAFT	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.656563	\N	\N	PENDING	\N	\N	\N	\N
5048	1	13	SHOP INF	BTE-WP4-HBC-SHD- MEP-PLB-PED-INF-2001	SƠ ĐỒ NGUYÊN LÝ HỆ THỐNG THOÁT NƯỚC\nWATER SUPPLY SYSTEM SCHEMATIC DIAGRAM	\N	\N	DRAFT	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.661767	\N	\N	PENDING	\N	\N	\N	\N
5047	1	13	SHOP INF	BTE-WP4-HBC-SHD- MEP-PLB-PWS-INF-2001	SƠ ĐỒ NGUYÊN LÝ HỆ THỐNG CẤP NƯỚC\nWATER SUPPLY SYSTEM SCHEMATIC DIAGRAM	\N	\N	DRAFT	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.659357	\N	\N	PENDING	\N	\N	\N	\N
5051	1	13	SHOP INF	BTE-WP4-HBC-SHD- MEP-PLB-PWS-INF-3003	ĐƯỜNG D1 - MẶT BẰNG VÀ TRẮC DỌC CẤP NƯỚC - TỜ 2\nROAD D1 - WATER SUPPLY PLAN AND PROFILE - SHEET 2	\N	1	DRAFT	2026-02-01	2026-01-24	R	2026-01-25	\N	\N	2026-02-12	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-11	\N	\N	\N	\N	\N	2026-02-12	\N	\N	\N	\N	\N	2026-09-23 21:47:00.668042	\N	\N	PENDING	\N	\N	\N	\N
5054	1	13	SHOP INF	BTE-WP4-HBC-SHD- MEP-PLB-PWS-INF-3006	ĐƯỜNG D1 - MẶT BẰNG VÀ TRẮC DỌC CẤP NƯỚC - TỜ 5\nROAD D1 - WATER SUPPLY PLAN AND PROFILE - SHEET 5	\N	\N	DRAFT	2026-02-16	2026-02-16	\N	2026-02-16	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.673504	\N	\N	PENDING	\N	\N	\N	\N
5056	1	13	SHOP INF	BTE-WP4-HBC-SHD- MEP-PLB-PWS-INF-3008	ĐƯỜNG D4 - MẶT BẰNG VÀ TRẮC DỌC CẤP NƯỚC - TỜ 1\nROAD D4 - WATER SUPPLY PLAN AND PROFILE - SHEET 1	\N	\N	DRAFT	2026-01-26	2026-01-26	\N	2026-02-16	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.678202	\N	\N	PENDING	\N	\N	\N	\N
5058	1	13	SHOP INF	BTE-WP4-HBC-SHD- MEP-PLB-PWS-INF-3010	ĐƯỜNG D5 - MẶT BẰNG VÀ TRẮC DỌC CẤP NƯỚC - TỜ 1\nROAD D5 - WATER SUPPLY PLAN AND PROFILE - TỜ 1	\N	\N	DRAFT	2026-01-26	2026-01-26	\N	2026-02-16	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-11	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.681561	\N	\N	PENDING	\N	\N	\N	\N
5060	1	13	SHOP INF	BTE-WP4-HBC-SHD- MEP-PLB-PWS-INF-3012	ĐƯỜNG D5 - MẶT BẰNG VÀ TRẮC DỌC CẤP NƯỚC - TỜ 3\nROAD D5 - WATER SUPPLY PLAN AND PROFILE - SHEET 3	\N	1	DRAFT	2026-02-01	2026-01-24	R	2026-01-25	\N	\N	2026-02-12	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-11	\N	\N	\N	\N	\N	2026-02-12	\N	\N	\N	\N	\N	2026-09-23 21:47:00.68601	\N	\N	PENDING	\N	\N	\N	\N
5055	1	13	SHOP INF	BTE-WP4-HBC-SHD- MEP-PLB-PWS-INF-3007	ĐƯỜNG D2, D3 - MẶT BẰNG VÀ TRẮC DỌC CẤP NƯỚC\nROAD D2, D3 - WATER SUPPLY PLAN AND PROFILE	\N	\N	DRAFT	2026-02-16	2026-02-16	\N	2026-02-16	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.676271	\N	\N	PENDING	\N	\N	\N	\N
5057	1	13	SHOP INF	BTE-WP4-HBC-SHD- MEP-PLB-PWS-INF-3009	ĐƯỜNG D4 - MẶT BẰNG VÀ TRẮC DỌC CẤP NƯỚC - TỜ 2\nROAD D4 - WATER SUPPLY PLAN AND PROFILE - SHEET 2	\N	\N	DRAFT	2026-01-26	2026-01-26	\N	2026-02-16	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.679968	\N	\N	PENDING	\N	\N	\N	\N
5059	1	13	SHOP INF	BTE-WP4-HBC-SHD- MEP-PLB-PWS-INF-3011	ĐƯỜNG D5 - MẶT BẰNG VÀ TRẮC DỌC CẤP NƯỚC - TỜ 2\nROAD D5 - WATER SUPPLY PLAN AND PROFILE - SHEET 2	\N	1	DRAFT	2026-02-01	2026-01-24	R	2026-01-25	\N	\N	2026-02-12	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-11	\N	\N	\N	\N	\N	2026-02-12	\N	\N	\N	\N	\N	2026-09-23 21:47:00.683907	\N	\N	PENDING	\N	\N	\N	\N
5061	1	13	SHOP INF	BTE-WP4-HBC-SHD- MEP-PLB-PWS-INF-3013	ĐƯỜNG D6 - MẶT BẰNG VÀ TRẮC DỌC HỆ THỐNG CẤP NƯỚC\nROAD D6 - WATER SUPPLY PLAN AND PROFILE	\N	1	DRAFT	2026-02-01	2026-01-24	R	2026-01-25	\N	\N	2026-02-12	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-11	\N	\N	\N	\N	\N	2026-02-12	\N	\N	\N	\N	\N	2026-09-23 21:47:00.687673	\N	\N	PENDING	\N	\N	\N	\N
5049	1	13	SHOP INF	BTE-WP4-HBC-SHD- MEP-PLB-PWS-INF-3001	MẶT BẰNG BỐ TRÍ HỆ THỐNG CẤP NƯỚC\nWATER SUPPLY SYSTEM LAYOUT PLAN	\N	\N	DRAFT	2026-02-10	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.663569	\N	\N	PENDING	\N	\N	\N	\N
5052	1	13	SHOP INF	BTE-WP4-HBC-SHD- MEP-PLB-PWS-INF-3004	ĐƯỜNG D1 - MẶT BẰNG VÀ TRẮC DỌC CẤP NƯỚC - TỜ 3\nROAD D1 - WATER SUPPLY PLAN AND PROFILE - SHEET 3	\N	1	DRAFT	2026-02-01	2026-01-24	R	2026-01-25	\N	\N	2026-02-12	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-11	\N	\N	\N	\N	\N	2026-02-12	\N	\N	\N	\N	\N	2026-09-23 21:47:00.670074	\N	\N	PENDING	\N	\N	\N	\N
5063	1	13	SHOP INF	BTE-WP4-HBC-SHD- MEP-PLB-PWS-INF-3015	ĐƯỜNG D7 - MẶT BẰNG VÀ TRẮC DỌC CẤP NƯỚC - TỜ 2\nROAD D7 - WATER SUPPLY PLAN AND PROFILE - SHEET 2	\N	\N	DRAFT	2026-02-16	2026-02-16	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.692018	\N	\N	PENDING	\N	\N	\N	\N
5064	1	13	SHOP INF	BTE-WP4-HBC-SHD- MEP-PLB-PWS-INF-3016	ĐƯỜNG D8 - MẶT BẰNG VÀ TRẮC DỌC CẤP NƯỚC\nROAD D8 - WATER SUPPLY PLAN AND PROFILE	\N	\N	DRAFT	2026-01-21	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.694045	\N	\N	PENDING	\N	\N	\N	\N
5083	1	13	SHOP INF	BTE-WP4-HBC-SHD- MEP-PLB-PL-INF-4001	MẶT BẰNG PHỐI HỢP CẤP THOÁT NƯỚC\nPLUMBING COMBINATION PLAN	\N	\N	DRAFT	2026-02-16	2026-02-16	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.728376	\N	\N	PENDING	\N	\N	\N	\N
5084	1	13	SHOP INF	BTE-WP4-HBC-SHD- MEP-PLB-PL-INF-4002	ĐƯỜNG D1 - MẶT CẮT NGANG TUYẾN ỐNG CẤP, THOÁT NƯỚC ĐIỂN HÌNH\nROAD D1 - TYPICAL SECTION OF WATER SUPPLY, SEWER DRAINAGE ROUTE	\N	1	DRAFT	2026-02-01	2026-01-24	R	2026-01-25	\N	\N	2026-02-12	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-12	\N	\N	\N	\N	\N	2026-09-23 21:47:00.729966	\N	\N	PENDING	\N	\N	\N	\N
5085	1	13	SHOP INF	BTE-WP4-HBC-SHD- MEP-PLB-PL-INF-4003	ĐƯỜNG D2, D3, D4, D5, D6, D8 - MẶT CẮT NGANG TUYẾN ỐNG CẤP, THOÁT NƯỚC ĐIỂN HÌNH\nROAD D2, D3, D4, D5, D6, D8 - TYPICAL SECTION OF WATER SUPPLY, SEWER DRAINAGE ROUTE	\N	1	DRAFT	2026-02-04	2026-01-24	R	2026-01-25	\N	\N	2026-02-12	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-12	\N	\N	\N	\N	\N	2026-09-23 21:47:00.732198	\N	\N	PENDING	\N	\N	\N	\N
5086	1	13	SHOP INF	BTE-WP4-HBC-SHD- MEP-PLB-PL-INF-4004	ĐƯỜNG D7 - MẶT CẮT NGANG TUYẾN ỐNG CẤP, THOÁT NƯỚC ĐIỂN HÌNH\nROAD D7 - TYPICAL SECTION OF WATER SUPPLY, SEWER DRAINAGE ROUTE	\N	1	DRAFT	2026-02-04	2026-01-24	R	2026-01-25	\N	\N	2026-02-12	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-12	\N	\N	\N	\N	\N	2026-09-23 21:47:00.733937	\N	\N	PENDING	\N	\N	\N	\N
5087	1	13	SHOP INF	BTE-WP4-HBC-SHD- MEP-PLB-PL-INF-5001	CHI TIẾT ĐIỂN HÌNH HỆ THỐNG CẤP THOÁT NƯỚC\nTYPICAL DETAILS PLUMBING SYSTEM	\N	\N	DRAFT	2026-01-16	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.735472	\N	\N	PENDING	\N	\N	\N	\N
5088	1	13	SHOP INF	BTE-WP4-HBC-SHD- MEP-PLB-PL-INF-5002	CHI TIẾT ĐIỂN HÌNH  HỐ GA DETAIL PARTICULAR MANHOLE	\N	1	DRAFT	2026-01-16	2026-01-24	A	2026-01-25	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-01-25	\N	\N	\N	\N	\N	2026-09-23 21:47:00.737017	\N	\N	PENDING	\N	\N	\N	\N
5062	1	13	SHOP INF	BTE-WP4-HBC-SHD- MEP-PLB-PWS-INF-3014	ĐƯỜNG D7 - MẶT BẰNG VÀ TRẮC DỌC CẤP NƯỚC - TỜ 1\nROAD D7 - WATER SUPPLY PLAN AND PROFILE - SHEET 1	\N	1	DRAFT	2026-02-01	2026-01-24	R	2026-01-25	\N	\N	2026-02-12	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-11	\N	\N	\N	\N	\N	2026-02-12	\N	\N	\N	\N	\N	2026-09-23 21:47:00.689295	\N	\N	PENDING	\N	\N	\N	\N
5050	1	13	SHOP INF	BTE-WP4-HBC-SHD- MEP-PLB-PWS-INF-3002	ĐƯỜNG D1 - MẶT BẰNG VÀ TRẮC DỌC CẤP NƯỚC - TỜ 1\nROAD D1 - WATER SUPPLY PLAN AND PROFILE - SHEET 1	\N	1	DRAFT	2026-02-01	2026-01-24	R	2026-01-25	\N	\N	2026-02-12	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-11	\N	\N	\N	\N	\N	2026-02-12	\N	\N	\N	\N	\N	2026-09-23 21:47:00.665582	\N	\N	PENDING	\N	\N	\N	\N
5053	1	13	SHOP INF	BTE-WP4-HBC-SHD- MEP-PLB-PWS-INF-3005	ĐƯỜNG D1 - MẶT BẰNG VÀ TRẮC DỌC CẤP NƯỚC - TỜ 4\nROAD D1 - WATER SUPPLY PLAN AND PROFILE - SHEET 4	\N	1	DRAFT	2026-02-01	2026-01-24	R	2026-01-25	\N	\N	2026-02-12	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-11	\N	\N	\N	\N	\N	2026-02-12	\N	\N	\N	\N	\N	2026-09-23 21:47:00.671719	\N	\N	PENDING	\N	\N	\N	\N
4983	1	2	SHOP BPV	BTE-WP4-HBC-SHD- MEP-PLB-PL-BPV-2BR-001	HỆ THỐNG CẤP THOÁT NƯỚC BEACH POOL VILLA - 2BR \n- SƠ ĐỒ NGUYÊN LÝ BEACH POOL VILLA - 2BR\nPLUMBING AND SANITARY SYSTEM BEACH POOL VILLA - 2BR\n - SCHEMATIC DIAGRAM BEACH POOL VILLA - 2BR	\N	\N	DRAFT	2026-01-31	2026-01-31	R	2026-02-01	\N	\N	2026-02-07	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-04	\N	\N	\N	\N	\N	2026-02-07	\N	\N	\N	\N	\N	2026-09-23 21:47:00.357708	\N	\N	PENDING	\N	\N	\N	\N
4985	1	2	SHOP BPV	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-2BR-001	MẶT BẰNG HỆ THỐNG THOÁT NƯỚC BEACH POOL VILLA - 2BR\nDRAINAGE WATER SYSTEM PLAN BEACH POOL VILLA - 2BR	\N	\N	DRAFT	2026-01-31	2026-01-31	R	2026-02-01	\N	\N	2026-02-07	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-04	\N	\N	\N	\N	\N	2026-02-07	\N	\N	\N	\N	\N	2026-09-23 21:47:00.36076	\N	\N	PENDING	\N	\N	\N	\N
4986	1	2	SHOP BPV	BTE-WP4-HBC-SHD- MEP-PLB-PL-BPV - 001	CHI TIẾT LẮP ĐẶT ĐIỂN HÌNH\nTYPICAL INSTALL DETAIL	\N	\N	DRAFT	2026-01-31	2026-01-31	R	2026-02-01	\N	\N	2026-02-07	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-04	\N	\N	\N	\N	\N	2026-02-07	\N	\N	\N	\N	\N	2026-09-23 21:47:00.36325	\N	\N	PENDING	\N	\N	\N	\N
4974	1	2	SHOP BPV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-004	HỆ THỐNG ĐIỀU HÒA KHÔNG KHÍ VÀ THÔNG GIÓ - SƠ ĐỒ NGUYÊN LÝ - DANH MỤC THIẾT BỊ-MẶT BẰNG\nMVAC SYSTEM - SCHEMATIC DIAGRAM - EQUIPMENT SCHEDULES - MVAC PLAN	\N	\N	DRAFT	2026-02-11	2026-02-14	R	2026-02-15	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.341045	\N	\N	PENDING	\N	\N	\N	\N
4975	1	2	SHOP BPV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-005	HỆ THỐNG ĐIỀU HÒA KHÔNG KHÍ VÀ THÔNG GIÓ - SƠ ĐỒ NGUYÊN LÝ - DANH MỤC THIẾT BỊ - MẶT BẰNG\nMVAC SYSTEM - SCHEMATIC DIAGRAM - EQUIPMENT SCHEDULES - MVAC PLAN	\N	\N	DRAFT	2026-02-11	2026-02-14	R	2026-02-15	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.342644	\N	\N	PENDING	\N	\N	\N	\N
4976	1	2	SHOP BPV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-006	HỆ THỐNG ĐIỀU HÒA KHÔNG KHÍ VÀ THÔNG GIÓ - SƠ ĐỒ NGUYÊN LÝ - DANH MỤC THIẾT BỊ - MẶT BẰNG\nMVAC SYSTEM - SCHEMATIC DIAGRAM - EQUIPMENT SCHEDULES - MVAC PLAN	\N	\N	DRAFT	2026-02-11	2026-02-14	R	2026-02-15	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.344129	\N	\N	PENDING	\N	\N	\N	\N
4979	1	2	SHOP BPV	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-1BRA-002	MẶT BẰNG CẤP NƯỚC BEACH POOL VILLA 49\n- SƠ ĐỒ NGUYÊN LÝ BEACH POOL VILLA 49\nWATER SUPPLY PLAN BEACH POOL VILLA 49\n- SCHEMATIC DIAGRAM BEACH POOL VILLA 49	\N	\N	DRAFT	2026-01-31	2026-01-31	R	2026-02-01	\N	\N	2026-02-07	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-04	\N	\N	\N	\N	\N	2026-02-07	\N	\N	\N	\N	\N	2026-09-23 21:47:00.349929	\N	\N	PENDING	\N	\N	\N	\N
4981	1	2	SHOP BPV	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-1BRB-001	MẶT BẰNG CẤP NƯỚC BEACH POOL VILLA - 1BRB\n - SƠ ĐỒ NGUYÊN LÝ BEACH POOL VILLA - 1BRB\nWATER SUPPLY PLAN BEACH POOL VILLA - 1BRB\n- SCHEMATIC DIAGRAM BEACH POOL VILLA - 1BRB	\N	\N	DRAFT	2026-01-31	2026-01-31	R	2026-02-01	\N	\N	2026-02-07	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-04	\N	\N	\N	\N	\N	2026-02-07	\N	\N	\N	\N	\N	2026-09-23 21:47:00.353825	\N	\N	PENDING	\N	\N	\N	\N
4980	1	2	SHOP BPV	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-1BRA-002	MẶT BẰNG THOÁT NƯỚC  BEACH POOL VILLA 49\n - SƠ ĐỒ NGUYÊN LÝ  BEACH POOL VILLA 49\nDRAINAGE WATER SYSTEM PLAN  BEACH POOL VILLA 49\n- SCHEMATIC DIAGRAM  BEACH POOL VILLA 49	\N	\N	DRAFT	2026-01-31	2026-01-31	R	2026-02-01	\N	\N	2026-02-07	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-04	\N	\N	\N	\N	\N	2026-02-07	\N	\N	\N	\N	\N	2026-09-23 21:47:00.351567	\N	\N	PENDING	\N	\N	\N	\N
4977	1	2	SHOP BPV	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-1BRA-001	MẶT BẰNG CẤP NƯỚC BEACH POOL VILLA - 1BRA \n- SƠ ĐỒ NGUYÊN LÝ BEACH POOL VILLA - 1BRA\nWATER SUPPLY PLAN BEACH POOL VILLA - 1BRA \n- SCHEMATIC DIAGRAM BEACH POOL VILLA - 1BRA	\N	\N	DRAFT	2026-01-31	2026-01-31	R	2026-02-01	\N	\N	2026-02-07	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-04	\N	\N	\N	\N	\N	2026-02-07	\N	\N	\N	\N	\N	2026-09-23 21:47:00.346285	\N	\N	PENDING	\N	\N	\N	\N
4971	1	2	SHOP BPV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-001	HỆ THỐNG ĐIỀU HÒA KHÔNG KHÍ VÀ THÔNG GIÓ - SƠ ĐỒ NGUYÊN LÝ - DANH MỤC THIẾT BỊ-MẶT BẰNG\nMVAC SYSTEM - SCHEMATIC DIAGRAM - EQUIPMENT SCHEDULES - MVAC PLAN	\N	\N	DRAFT	2026-02-11	2026-02-14	R	2026-02-15	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.334323	\N	\N	PENDING	\N	\N	\N	\N
4982	1	2	SHOP BPV	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-1BRB-001	MẶT BẰNG THOÁT NƯỚC BEACH POOL VILLA - 1BRB\n- SƠ ĐỒ NGUYÊN LÝ BEACH POOL VILLA - 1BRB\nDRAINAGE WATER SYSTEM PLAN BEACH POOL VILLA - 1BRB\n - SCHEMATIC DIAGRAM BEACH POOL VILLA - 1BRB	\N	\N	DRAFT	2026-01-31	2026-01-31	R	2026-02-01	\N	\N	2026-02-07	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-04	\N	\N	\N	\N	\N	2026-02-07	\N	\N	\N	\N	\N	2026-09-23 21:47:00.356046	\N	\N	PENDING	\N	\N	\N	\N
4984	1	2	SHOP BPV	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-2BR-001	MẶT BẰNG CẤP NƯỚC BEACH POOL VILLA - 2BR\nWATER SUPPLY PLAN BEACH POOL VILLA - 2BR	\N	\N	DRAFT	2026-01-31	2026-01-31	R	2026-02-01	\N	\N	2026-02-07	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-04	\N	\N	\N	\N	\N	2026-02-07	\N	\N	\N	\N	\N	2026-09-23 21:47:00.359244	\N	\N	PENDING	\N	\N	\N	\N
4972	1	2	SHOP BPV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-002	HỆ THỐNG ĐIỀU HÒA KHÔNG KHÍ VÀ THÔNG GIÓ - SƠ ĐỒ NGUYÊN LÝ - DANH MỤC THIẾT BỊ - MẶT BẰNG\nMVAC SYSTEM - SCHEMATIC DIAGRAM - EQUIPMENT SCHEDULES - MVAC PLAN	\N	\N	DRAFT	2026-02-11	2026-02-14	R	2026-02-15	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.33667	\N	\N	PENDING	\N	\N	\N	\N
4973	1	2	SHOP BPV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-003	HỆ THỐNG ĐIỀU HÒA KHÔNG KHÍ VÀ THÔNG GIÓ - SƠ ĐỒ NGUYÊN LÝ - DANH MỤC THIẾT BỊ - MẶT BẰNG\nMVAC SYSTEM - SCHEMATIC DIAGRAM - EQUIPMENT SCHEDULES - MVAC PLAN	\N	\N	DRAFT	2026-02-11	2026-02-14	R	2026-02-15	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.339351	\N	\N	PENDING	\N	\N	\N	\N
4978	1	2	SHOP BPV	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-1BRA-001	MẶT BẰNG THOÁT NƯỚC  BEACH POOL VILLA - 1BRA\n - SƠ ĐỒ NGUYÊN LÝ  BEACH POOL VILLA - 1BRA\nDRAINAGE WATER SYSTEM PLAN  BEACH POOL VILLA - 1BRA\n- SCHEMATIC DIAGRAM  BEACH POOL VILLA - 1BRA	\N	\N	DRAFT	2026-01-31	2026-01-31	R	2026-02-01	\N	\N	2026-02-07	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-04	\N	\N	\N	\N	\N	2026-02-07	\N	\N	\N	\N	\N	2026-09-23 21:47:00.348353	\N	\N	PENDING	\N	\N	\N	\N
4996	1	7	SHOP BZONE	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BZN-003	HỆ THỐNG ĐIỀU HÒA KHÔNG KHÍ VÀ THÔNG GIÓ -SƠ ĐỒ NGUYÊN LÝ - DANH MỤC THIẾT BỊ\nAIR CONDITIONING AND VENTILATION SYSTEM - SCHEMATIC DIAGRAM - EQUIPMENT SCHEDULES	\N	\N	DRAFT	2026-03-15	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.448639	\N	\N	PENDING	\N	\N	\N	\N
4997	1	7	SHOP BZONE	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BZN-004	MẶT BẰNG HỆ THỐNG ĐIỀU HÒA KHÔNG KHÍ VÀ THÔNG GIÓ\nAIR CONDITIONING AND VENTILATION SYSTEM PLAN	\N	\N	DRAFT	2026-03-15	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.451554	\N	\N	PENDING	\N	\N	\N	\N
4998	1	7	SHOP BZONE	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BZN-005	MẶT BẰNG HỆ THỐNG THÔNG GIÓ - SƠ ĐỒ NGUYÊN LÝ\nVENTILATION SYSTEM PLAN - SCHEMATIC DIAGRAM	\N	\N	DRAFT	2026-03-15	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.453456	\N	\N	PENDING	\N	\N	\N	\N
5000	1	7	SHOP BZONE	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BRE -001	MẶT BẰNG HỆ THỐNG CẤP NƯỚC - SƠ ĐỒ NGUYÊN LÝ\nWATER SUPPLY SYSTEM PLAN - SCHEMATIC DIAGRAM	\N	\N	DRAFT	2026-02-14	2026-02-22	R	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-13	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.457063	\N	\N	PENDING	\N	\N	\N	\N
5002	1	7	SHOP BZONE	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BSP -001	MẶT BẰNG HỆ THỐNG CẤP NƯỚC - SƠ ĐỒ NGUYÊN LÝ\nWATER SUPPLY SYSTEM PLAN - SCHEMATIC DIAGRAM	\N	\N	DRAFT	2026-02-14	2026-02-22	R	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-13	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.461908	\N	\N	PENDING	\N	\N	\N	\N
5003	1	7	SHOP BZONE	BTE-WP4-HBC-SHD- MEP-PLB-PID-BSP -001	MẶT BẰNG HỆ THỐNG THOÁT NƯỚC - SƠ ĐỒ NGUYÊN LÝ\nDRAINAGE WATER SYSTEM PLAN -  SCHEMATIC DIAGRAM	\N	\N	DRAFT	2026-02-14	2026-02-22	R	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-13	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.463603	\N	\N	PENDING	\N	\N	\N	\N
5001	1	7	SHOP BZONE	BTE-WP4-HBC-SHD- MEP-PLB-PID-BRE -001	MẶT BẰNG HỆ THỐNG THOÁT NƯỚC - SƠ ĐỒ NGUYÊN LÝ\nDRAINAGE WATER SYSTEM PLAN  - SCHEMATIC DIAGRAM	\N	\N	DRAFT	2026-02-14	2026-02-22	R	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-13	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.459919	\N	\N	PENDING	\N	\N	\N	\N
4999	1	7	SHOP BZONE	BTE-WP4-HBC-SHD- MEP-PLB-PL-BBA -001	MẶT BẰNG HỆ THỐNG CẤP THOÁT NƯỚC\nPLUMBING AND SANITARY SYSTEM PLAN	\N	\N	DRAFT	2026-02-14	2026-02-22	R	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-13	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.455111	\N	\N	PENDING	\N	\N	\N	\N
4989	1	5	SHOP BSN	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-FBC-002	MẶT BẰNG HỆ THỐNG ĐIỀU HÒA KHÔNG KHÍ VÀ THÔNG GIÓ\nAIR CONDITIONING AND VENTILATION SYSTEM PLAN	\N	\N	DRAFT	2026-03-20	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.391271	\N	\N	PENDING	\N	\N	\N	\N
4990	1	5	SHOP BSN	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-FBC-003	MẶT CẮT 1-1, 2-2\nSECTION 1-1, 2-2	\N	\N	DRAFT	2026-03-20	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.393116	\N	\N	PENDING	\N	\N	\N	\N
4991	1	5	SHOP BSN	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-FBC-004	MẶT CẮT 3-3, CHI TIẾT A\nSECTION 3-3, DETAIL A	\N	\N	DRAFT	2026-03-20	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.395919	\N	\N	PENDING	\N	\N	\N	\N
4992	1	5	SHOP BSN	BTE-WP4-HBC-SHD- MEP-PLB-PWS-FBC -001	MẶT BẰNG HỆ THỐNG CẤP NƯỚC - SƠ ĐỒ NGUYÊN LÝ\nWATER SUPPLY SYSTEM PLAN - SCHEMATIC DIAGRAM	\N	\N	DRAFT	2026-02-19	2026-02-26	R	2026-03-01	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-14	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.397792	\N	\N	PENDING	\N	\N	\N	\N
4993	1	5	SHOP BSN	BTE-WP4-HBC-SHD- MEP-PLB-PID-FBC -001	MẶT BẰNG HỆ THỐNG THOÁT NƯỚC - SƠ ĐỒ NGUYÊN LÝ\nDRAINAGE WATER SYSTEM PLAN - SCHEMATIC DIAGRAM	\N	\N	DRAFT	2026-02-19	2026-02-26	R	2026-03-01	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-14	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.399348	\N	\N	PENDING	\N	\N	\N	\N
4987	1	5	SHOP BSN	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-FBC-001	HỆ THỐNG ĐIỀU HÒA KHÔNG KHÍ VÀ THÔNG GIÓ - SƠ ĐỒ NGUYÊN LÝ - DANH MỤC THIẾT BỊ\nAIR CONDITIONING AND VENTILATION SYSTEM - SCHEMATIC DIAGRAM - EQUIPMENT SCHEDULES	\N	\N	DRAFT	2026-03-20	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.386941	\N	\N	PENDING	\N	\N	\N	\N
5004	1	8	SHOP CLU	BTE-WP4-SHD-MEP-HVAC-HVA-CLV-01	HỆ THỐNG ĐIỀU HÒA KHÔNG KHÍ VÀ THÔNG GIÓ - SƠ ĐỒ NGUYÊN LÝ - DANH MỤC THIẾT BỊ-MẶT BẰNG\nMVAC SYSTEM - SCHEMATIC DIAGRAM - EQUIPMENT SCHEDULES - MVAC PLAN	\N	1	DRAFT	2026-02-04	2026-02-03	R	2026-02-03	\N	\N	2026-02-09	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-04	\N	\N	\N	\N	\N	2026-02-09	\N	\N	\N	\N	\N	2026-09-23 21:47:00.487586	\N	\N	PENDING	\N	\N	\N	\N
5009	1	8	SHOP CLU	BTE-WP4-HBC-SHD- MEP-PLB-PWS-CLV-001	MẶT BẰNG HỆ THỐNG CẤP NƯỚC- SƠ ĐỒ NGUYÊN LÝ \nWATER SUPPLY SYSTEM PLAN - WATER SUPPLY SCHEMATIC	\N	\N	DRAFT	2026-02-05	2026-02-07	R	2026-02-08	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-04	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.498042	\N	\N	PENDING	\N	\N	\N	\N
5010	1	8	SHOP CLU	BTE-WP4-HBC-SHD- MEP-PLB-PID-CLV-001	MẶT BẰNG HỆ THỐNG THOÁT NƯỚC - SƠ ĐỒ NGUYÊN LÝ\nDRAINAGE WATER SYSTEM PLAN - SCHEMATIC DIAGRAM	\N	\N	DRAFT	2026-02-05	2026-02-07	R	2026-02-08	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-04	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.500776	\N	\N	PENDING	\N	\N	\N	\N
5011	1	8	SHOP CLU	BTE-WP4-HBC-SHD- MEP-PLB-PL-CLV - 001	CHI TIẾT LẮP ĐẶT ĐIỂN HÌNH\nTYPICAL INSTALL DETAIL	\N	\N	DRAFT	2026-02-05	2026-02-07	R	2026-02-08	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-04	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.502695	\N	\N	PENDING	\N	\N	\N	\N
5005	1	8	SHOP CLU	BTE-WP4-SHD-MEP-HVAC-HVA-CLV-02	\N	\N	1	DRAFT	2026-02-04	2026-02-03	R	2026-02-03	\N	\N	2026-02-09	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-04	\N	\N	\N	\N	\N	2026-02-09	\N	\N	\N	\N	\N	2026-09-23 21:47:00.489926	\N	\N	PENDING	\N	\N	\N	\N
5006	1	8	SHOP CLU	BTE-WP4-SHD-MEP-HVAC-HVA-CLV-03	\N	\N	1	DRAFT	2026-02-04	2026-02-03	R	2026-02-03	\N	\N	2026-02-09	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-04	\N	\N	\N	\N	\N	2026-02-09	\N	\N	\N	\N	\N	2026-09-23 21:47:00.49244	\N	\N	PENDING	\N	\N	\N	\N
5007	1	8	SHOP CLU	BTE-WP4-SHD-MEP-HVAC-HVA-CLV-04	\N	\N	1	DRAFT	2026-02-04	2026-02-03	R	2026-02-03	\N	\N	2026-02-09	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-04	\N	\N	\N	\N	\N	2026-02-09	\N	\N	\N	\N	\N	2026-09-23 21:47:00.494253	\N	\N	PENDING	\N	\N	\N	\N
5008	1	8	SHOP CLU	BTE-WP4-SHD-MEP-HVAC-HVA-CLV-05	\N	\N	1	DRAFT	2026-02-04	2026-02-03	R	2026-02-03	\N	\N	2026-02-09	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-04	\N	\N	\N	\N	\N	2026-02-09	\N	\N	\N	\N	\N	2026-09-23 21:47:00.495906	\N	\N	PENDING	\N	\N	\N	\N
5092	1	14	SHOP KID	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-KID-004	MẶT CẮT 3-3, CHI TIẾT A\nSECTION 3-3, DETAIL A	\N	\N	DRAFT	2026-03-15	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.766179	\N	\N	PENDING	\N	\N	\N	\N
5089	1	14	SHOP KID	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-KID-001	HỆ THỐNG ĐIỀU HÒA KHÔNG KHÍ VÀ THÔNG GIÓ - SƠ ĐỒ NGUYÊN LÝ - DANH MỤC THIẾT BỊ\nAIR CONDITIONING AND VENTILATION SYSTEM - SCHEMATIC DIAGRAM - EQUIPMENT SCHEDULES	\N	\N	DRAFT	2026-03-15	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.75966	\N	\N	PENDING	\N	\N	\N	\N
5090	1	14	SHOP KID	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-KID-002	MẶT BẰNG HỆ THỐNG ĐIỀU HÒA KHÔNG KHÍ VÀ THÔNG GIÓ\nAIR CONDITIONING AND VENTILATION SYSTEM PLAN	\N	\N	DRAFT	2026-03-15	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.761679	\N	\N	PENDING	\N	\N	\N	\N
5091	1	14	SHOP KID	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-KID-003	MẶT CẮT 1-1, 2-2\nSECTION 1-1, 2-2	\N	\N	DRAFT	2026-03-15	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.764113	\N	\N	PENDING	\N	\N	\N	\N
5093	1	14	SHOP KID	BTE-WP4-HBC-SHD- MEP-PLB-PL-KID -001	MẶT BẰNG HỆ THỐNG CẤP THOÁT NƯỚC - SƠ ĐỒ NGUYÊN LÝ\nPLUMBING AND SANITARY SYSTEM PLAN - SCHEMATIC DIAGRAM	\N	\N	DRAFT	2026-02-21	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-15	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.767854	\N	\N	PENDING	\N	\N	\N	\N
5131	1	16	SHOP RESV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-RSD-011	HỆ THỐNG ĐIỀU HÒA KHÔNG KHÍ VÀ THÔNG GIÓ  - SƠ ĐỒ NGUYÊN LÝ - DANH MỤC THIẾT BỊ - MẶT BẰNG\nMVAC SYSTEM - SCHEMATIC DIAGRAM - EQUIPMENT SCHEDULES - MVAC PLAN	\N	\N	DRAFT	2026-02-20	2026-02-22	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.89428	\N	\N	PENDING	\N	\N	\N	\N
5132	1	16	SHOP RESV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-RSD-012	HỆ THỐNG ĐIỀU HÒA KHÔNG KHÍ VÀ THÔNG GIÓ  - SƠ ĐỒ NGUYÊN LÝ - DANH MỤC THIẾT BỊ - MẶT BẰNG\nMVAC SYSTEM - SCHEMATIC DIAGRAM - EQUIPMENT SCHEDULES - MVAC PLAN	\N	\N	DRAFT	2026-02-20	2026-02-22	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.896	\N	\N	PENDING	\N	\N	\N	\N
5133	1	16	SHOP RESV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-RSD-013	HỆ THỐNG ĐHKK & THÔNG GIÓ - DANH MỤC THIẾT BỊ\nAIR CONDITIONING AND VENTILATION SYSTEM - EQUIPMENT SCHEDULES	\N	\N	DRAFT	2026-02-20	2026-02-22	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.897696	\N	\N	PENDING	\N	\N	\N	\N
5134	1	16	SHOP RESV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-RSD-014	HỆ THỐNG ĐHKK & THÔNG GIÓ - SƠ ĐỒ NGUYÊN LÝ \nAIR CONDITIONING AND VENTILATION SYSTEM - SCHEMATIC DIAGRAM	\N	\N	DRAFT	2026-02-20	2026-02-22	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.900131	\N	\N	PENDING	\N	\N	\N	\N
5135	1	16	SHOP RESV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-RSD-015	HỆ THỐNG ĐHKK & THÔNG GIÓ - MẶT BẰNG TẦNG HẦM & TẦNG TRỆT\nAIR CONDITIONING AND VENTILATION SYSTEM - BASEMENT & GROUND FLOOR PLAN	\N	\N	DRAFT	2026-02-20	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.902279	\N	\N	PENDING	\N	\N	\N	\N
5136	1	16	SHOP RESV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-RSD-016	HỆ THỐNG ĐHKK & THÔNG GIÓ - MẶT CẮT 1-1\nAIR CONDITIONING AND VENTILATION SYSTEM - SECTION 1-1	\N	\N	DRAFT	2026-02-20	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.904115	\N	\N	PENDING	\N	\N	\N	\N
5137	1	16	SHOP RESV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-RSD-017	HỆ THỐNG ĐHKK & THÔNG GIÓ - DANH MỤC THIẾT BỊ\nAIR CONDITIONING AND VENTILATION SYSTEM - EQUIPMENT SCHEDULES	\N	\N	DRAFT	2026-02-20	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.905932	\N	\N	PENDING	\N	\N	\N	\N
5138	1	16	SHOP RESV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-RSD-018	HỆ THỐNG ĐHKK & THÔNG GIÓ - SƠ ĐỒ NGUYÊN LÝ \nAIR CONDITIONING AND VENTILATION SYSTEM - SCHEMATIC DIAGRAM	\N	\N	DRAFT	2026-02-20	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.908308	\N	\N	PENDING	\N	\N	\N	\N
5139	1	16	SHOP RESV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-RSD-019	HỆ THỐNG ĐHKK & THÔNG GIÓ - MẶT BẰNG TẦNG HẦM & TẦNG TRỆT\nAIR CONDITIONING AND VENTILATION SYSTEM - BASEMENT & GROUND FLOOR PLAN	\N	\N	DRAFT	2026-02-20	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.910333	\N	\N	PENDING	\N	\N	\N	\N
5140	1	16	SHOP RESV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-RSD-020	HỆ THỐNG ĐHKK & THÔNG GIÓ - MẶT CẮT 1-1\nAIR CONDITIONING AND VENTILATION SYSTEM - SECTION 1-1	\N	\N	DRAFT	2026-02-20	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.91206	\N	\N	PENDING	\N	\N	\N	\N
5123	1	16	SHOP RESV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-RSD-003	HỆ THỐNG ĐHKK & THÔNG GIÓ - DANH MỤC THIẾT BỊ\nAIR CONDITIONING AND VENTILATION SYSTEM - EQUIPMENT SCHEDULES	\N	\N	DRAFT	2026-03-08	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.878099	\N	\N	PENDING	\N	\N	\N	\N
5125	1	16	SHOP RESV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-RSD-005	HỆ THỐNG ĐHKK & THÔNG GIÓ - MẶT BẰNG TẦNG HẦM & TẦNG TRỆT\nAIR CONDITIONING AND VENTILATION SYSTEM - BASEMENT & GROUND FLOOR PLAN	\N	\N	DRAFT	2026-03-08	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.881347	\N	\N	PENDING	\N	\N	\N	\N
5126	1	16	SHOP RESV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-RSD-006	HỆ THỐNG ĐHKK & THÔNG GIÓ - MẶT CẮT 1-1\nAIR CONDITIONING AND VENTILATION SYSTEM - SECTION 1-1	\N	\N	DRAFT	2026-03-08	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.883578	\N	\N	PENDING	\N	\N	\N	\N
5127	1	16	SHOP RESV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-RSD-007	HỆ THỐNG ĐHKK & THÔNG GIÓ - DANH MỤC THIẾT BỊ\nAIR CONDITIONING AND VENTILATION SYSTEM - EQUIPMENT SCHEDULES	\N	\N	DRAFT	2026-03-08	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.885873	\N	\N	PENDING	\N	\N	\N	\N
5128	1	16	SHOP RESV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-RSD-008	HỆ THỐNG ĐHKK & THÔNG GIÓ - SƠ ĐỒ NGUYÊN LÝ \nAIR CONDITIONING AND VENTILATION SYSTEM - SCHEMATIC DIAGRAM	\N	\N	DRAFT	2026-03-08	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.887789	\N	\N	PENDING	\N	\N	\N	\N
5129	1	16	SHOP RESV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-RSD-009	HỆ THỐNG ĐHKK & THÔNG GIÓ - MẶT BẰNG TẦNG HẦM & TẦNG TRỆT\nAIR CONDITIONING AND VENTILATION SYSTEM - BASEMENT & GROUND FLOOR PLAN	\N	\N	DRAFT	2026-03-08	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.889694	\N	\N	PENDING	\N	\N	\N	\N
5130	1	16	SHOP RESV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-RSD-010	HỆ THỐNG ĐHKK & THÔNG GIÓ - MẶT CẮT 1-1\nAIR CONDITIONING AND VENTILATION SYSTEM - SECTION 1-1	\N	\N	DRAFT	2026-03-08	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.892257	\N	\N	PENDING	\N	\N	\N	\N
5124	1	16	SHOP RESV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-RSD-004	HỆ THỐNG ĐHKK & THÔNG GIÓ - SƠ ĐỒ NGUYÊN LÝ \nAIR CONDITIONING AND VENTILATION SYSTEM - SCHEMATIC DIAGRAM	\N	\N	DRAFT	2026-03-08	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.879744	\N	\N	PENDING	\N	\N	\N	\N
5121	1	16	SHOP RESV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-RSD-001	HỆ THỐNG ĐIỀU HÒA KHÔNG KHÍ VÀ THÔNG GIÓ  - SƠ ĐỒ NGUYÊN LÝ - DANH MỤC THIẾT BỊ - MẶT BẰNG\nMVAC SYSTEM - SCHEMATIC DIAGRAM - EQUIPMENT SCHEDULES - MVAC PLAN	\N	\N	DRAFT	2026-03-08	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.873354	\N	\N	PENDING	\N	\N	\N	\N
5122	1	16	SHOP RESV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-RSD-002	HỆ THỐNG ĐIỀU HÒA KHÔNG KHÍ VÀ THÔNG GIÓ  - SƠ ĐỒ NGUYÊN LÝ - DANH MỤC THIẾT BỊ - MẶT BẰNG\nMVAC SYSTEM - SCHEMATIC DIAGRAM - EQUIPMENT SCHEDULES - MVAC PLAN	\N	\N	DRAFT	2026-03-08	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.876116	\N	\N	PENDING	\N	\N	\N	\N
5013	1	9	SHOP GNR	BTE-WP4-HBC-SHD- MEP-PLB-PL-GN-002	CHI TIẾT LẮP ĐẶT\nINSTALLATION DETAIL	\N	\N	DRAFT	2026-03-25	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.526297	\N	\N	PENDING	\N	\N	\N	\N
5012	1	9	SHOP GNR	BTE-WP4-HBC-SHD- MEP-PLB-PL-GN-001	KÝ HIỆU & GHI CHÚ CHUNG\nLEGEND & GENERAL NOTES	\N	\N	DRAFT	2026-03-25	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.524346	\N	\N	PENDING	\N	\N	\N	\N
5094	1	15	SHOP LOB+SPA	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-LOB-001	HỆ THỐNG ĐIỀU HÒA KHÔNG KHÍ - SƠ ĐỒ NGUYÊN LÝ\nAIR CONDITIONING SYSTEM - SCHEMATIC DIAGRAM	\N	\N	DRAFT	2026-03-04	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-17	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.800059	\N	\N	PENDING	\N	\N	\N	\N
5095	1	15	SHOP LOB+SPA	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-LOB-002	HỆ THỐNG THÔNG GIÓ - SƠ ĐỒ NGUYÊN LÝ\nVENTILATION SYSTEM - SCHEMATIC DIAGRAM	\N	\N	DRAFT	2026-03-04	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-17	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.802092	\N	\N	PENDING	\N	\N	\N	\N
5096	1	15	SHOP LOB+SPA	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-LOB-003	SƠ ĐỒ NGUYÊN LÝ TỦ ĐIỆN ĐIỀU HÒA KHÔNG KHÍ\nAIR CONDITIONING PANEL-SINGLE LINE DIAGRAM	\N	\N	DRAFT	2026-03-04	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-17	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.804704	\N	\N	PENDING	\N	\N	\N	\N
5097	1	15	SHOP LOB+SPA	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-LOB-004	DANH MỤC QUẠT\nFANS SCHEDULE	\N	\N	DRAFT	2026-03-04	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-17	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.806754	\N	\N	PENDING	\N	\N	\N	\N
5098	1	15	SHOP LOB+SPA	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-LOB-005	DANH MỤC MÁY LẠNH\nAIR CONDITIONERS SCHEDULE	\N	\N	DRAFT	2026-03-04	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-17	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.808456	\N	\N	PENDING	\N	\N	\N	\N
5099	1	15	SHOP LOB+SPA	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-LOB-006	DANH MỤC MÁY LẠNH\nAIR CONDITIONERS SCHEDULE	\N	\N	DRAFT	2026-03-04	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-17	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.810085	\N	\N	PENDING	\N	\N	\N	\N
5100	1	15	SHOP LOB+SPA	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-LOB-007	HỆ THỐNG ĐIỀU HÒA KHÔNG KHÍ VÀ THÔNG GIÓ - MẶT BẰNG TẦNG HẦM\nAIR CONDITIONING AND VENTILATION SYSTEM PLAN - BASEMENT FLOOR PLAN	\N	\N	DRAFT	2026-03-04	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-17	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.812242	\N	\N	PENDING	\N	\N	\N	\N
5101	1	15	SHOP LOB+SPA	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-LOB-008	HỆ THỐNG ĐIỀU HÒA KHÔNG KHÍ VÀ THÔNG GIÓ - MẶT BẰNG TẦNG TRỆT\nAIR CONDITIONING AND VENTILATION SYSTEM PLAN - GROUND FLOOR PLAN	\N	\N	DRAFT	2026-03-04	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-17	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.814088	\N	\N	PENDING	\N	\N	\N	\N
5102	1	15	SHOP LOB+SPA	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-LOB-009	HỆ THỐNG ĐIỀU HÒA KHÔNG KHÍ VÀ THÔNG GIÓ - MẶT BẰNG TẦNG MÁI\nAIR CONDITIONING AND VENTILATION SYSTEM PLAN - ROOF FLOOR PLAN	\N	\N	DRAFT	2026-03-04	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-17	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.815722	\N	\N	PENDING	\N	\N	\N	\N
5103	1	15	SHOP LOB+SPA	BTE-WP4-HBC-SHD- MEP-PLB-PL-LOB -001	HỆ THỐNG CẤP THOÁT NƯỚC - SƠ ĐỒ NGUYÊN LÝ\nPLUMBING AND SANITARY SYSTEM - SCHEMATIC DIAGRAM	\N	\N	DRAFT	2026-02-25	2026-02-25	R	2026-03-04	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-04	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.817315	\N	\N	PENDING	\N	\N	\N	\N
5104	1	15	SHOP LOB+SPA	BTE-WP4-HBC-SHD- MEP-PLB-PL-LOB -002	SƠ ĐỒ NGUYÊN LÝ TỦ ĐIỆN HỆ THỐNG BƠM & BÌNH NƯỚC NÓNG \nSINGLE LINE DIAGRAM FOR PUMP SYSTEM & WATER HEATER	\N	\N	DRAFT	2026-02-25	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-04	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.819684	\N	\N	PENDING	\N	\N	\N	\N
5105	1	15	SHOP LOB+SPA	BTE-WP4-HBC-SHD- MEP-PLB-PWS-LOB -001	MẶT BẰNG CẤP NƯỚC TẦNG HẦM\nWATER SUPPLY PLAN - BASEMENT FLOOR	\N	\N	DRAFT	2026-02-25	2026-02-25	R	2026-03-04	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-04	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.821621	\N	\N	PENDING	\N	\N	\N	\N
5106	1	15	SHOP LOB+SPA	BTE-WP4-HBC-SHD- MEP-PLB-PWS-LOB -002	MẶT BẰNG CẤP NƯỚC TẦNG TRỆT (1)\nWATER SUPPLY PLAN - GROUND FLOOR (1)	\N	\N	DRAFT	2026-02-25	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-13	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.823173	\N	\N	PENDING	\N	\N	\N	\N
5107	1	15	SHOP LOB+SPA	BTE-WP4-HBC-SHD- MEP-PLB-PWS-LOB -003	MẶT BẰNG CẤP NƯỚC TẦNG TRỆT (2)\nWATER SUPPLY PLAN - GROUND FLOOR (2)	\N	\N	DRAFT	2026-02-25	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-13	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.82469	\N	\N	PENDING	\N	\N	\N	\N
5108	1	15	SHOP LOB+SPA	BTE-WP4-HBC-SHD- MEP-PLB-PWS-LOB -004	MẶT BẰNG CẤP NƯỚC TẦNG TRỆT MÁI\nWATER SUPPLY PLAN - ROOF FLOOR	\N	\N	DRAFT	2026-02-25	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-13	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.826173	\N	\N	PENDING	\N	\N	\N	\N
5109	1	15	SHOP LOB+SPA	BTE-WP4-HBC-SHD- MEP-PLB-PID-LOB -001	MẶT BẰNG THOÁT NƯỚC THẢI TẦNG HẦM\nWASTE WATER DRAINAGE PLAN - BASEMENT FLOOR	\N	\N	DRAFT	2026-02-25	2026-02-12	R	2026-03-04	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-04	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.828516	\N	\N	PENDING	\N	\N	\N	\N
5110	1	15	SHOP LOB+SPA	BTE-WP4-HBC-SHD- MEP-PLB-PID-LOB -002	MẶT BẰNG THOÁT NƯỚC THẢI TẦNG TRỆT \nWASTE WATER DRAINAGE PLAN - GROUND FLOOR	\N	\N	DRAFT	2026-02-25	2026-02-25	R	2026-03-04	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-13	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.830408	\N	\N	PENDING	\N	\N	\N	\N
5114	1	15	SHOP LOB+SPA	BTE-WP4-HBC-SHD- MEP-PLB-PID-LOB -006	MẶT BẰNG THOÁT NƯỚC MƯA TẦNG TRỆT (1)\nRAIN WATER DRAINAGE PLAN - GROUND FLOOR(1)	\N	\N	DRAFT	2026-02-25	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-13	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.837411	\N	\N	PENDING	\N	\N	\N	\N
5116	1	15	SHOP LOB+SPA	BTE-WP4-HBC-SHD- MEP-PLB-PID-LOB -008	MẶT BẰNG THOÁT NƯỚC MƯA TẦNG MÁI\nRAIN WATER DRAINAGE PLAN - ROO FLOOR	\N	\N	DRAFT	2026-02-25	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-13	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.840595	\N	\N	PENDING	\N	\N	\N	\N
5119	1	15	SHOP LOB+SPA	BTE-WP4-HBC-SHD- MEP-PLB-PL-LOB -004	CHI TIẾT THOÁT NƯỚC KHU VỆ SINH\nWASTE WATER DRAINAGE DETAIL FOR WC	\N	\N	DRAFT	2026-02-25	2026-02-25	R	2026-03-04	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-13	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.846128	\N	\N	PENDING	\N	\N	\N	\N
5120	1	15	SHOP LOB+SPA	BTE-WP4-HBC-SHD- MEP-PLB-PL-LOB -005	CHI TIẾT BỆ TỰ HOẠI, BỂ TÁCH MỠ, HỐ BƠM\nDETAIL OF SEPTIC TANK, OIL INTERCEPTOR TANK AND PUMP PIT	\N	\N	DRAFT	2026-02-25	2026-02-12	R	2026-03-04	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-04	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.847652	\N	\N	PENDING	\N	\N	\N	\N
5117	1	15	SHOP LOB+SPA	BTE-WP4-HBC-SHD- MEP-PLB-PL-LOB -003	CHI TIẾT CẤP NƯỚC KHU VỆ SINH\nWATER SUPPLY DETAIL FOR WC	\N	\N	DRAFT	2026-02-25	2026-02-25	R	2026-03-04	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-13	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.842116	\N	\N	PENDING	\N	\N	\N	\N
5113	1	15	SHOP LOB+SPA	BTE-WP4-HBC-SHD- MEP-PLB-PID-LOB -005	MẶT BẰNG THOÁT NƯỚC MƯA TẦNG HẦM (2)\nRAIN WATER DRAINAGE PLAN - BASEMENT FLOOR (2)	\N	\N	DRAFT	2026-02-25	2026-03-04	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-04	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.835589	\N	\N	PENDING	\N	\N	\N	\N
5115	1	15	SHOP LOB+SPA	BTE-WP4-HBC-SHD- MEP-PLB-PID-LOB -007	MẶT BẰNG THOÁT NƯỚC MƯA TẦNG TRỆT (2)\nRAIN WATER DRAINAGE PLAN - GROUND FLOOR(2)	\N	\N	DRAFT	2026-02-25	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-13	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.839056	\N	\N	PENDING	\N	\N	\N	\N
5112	1	15	SHOP LOB+SPA	BTE-WP4-HBC-SHD- MEP-PLB-PID-LOB -004	MẶT BẰNG THOÁT NƯỚC MƯA TẦNG HẦM (1)\nRAIN WATER DRAINAGE PLAN - BASEMENT FLOOR (1)	\N	\N	DRAFT	2026-02-25	2026-03-04	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-04	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.833547	\N	\N	PENDING	\N	\N	\N	\N
5111	1	15	SHOP LOB+SPA	BTE-WP4-HBC-SHD- MEP-PLB-PID-LOB -003	MẶT BẰNG THOÁT NƯỚC THẢI TẦNG MÁI\nWASTE WATER DRAINAGE PLAN - ROOF FLOOR	\N	\N	DRAFT	2026-02-25	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-03-13	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.831954	\N	\N	PENDING	\N	\N	\N	\N
5145	1	19	SHOP VNR	BTE-WP4-HBC-SHD- MEP-PLB-PID-VNR -001	MẶT BẰNG HỆ THỐNG THOÁT NƯỚC - SƠ ĐỒ NGUYÊN LÝ\nDRAINAGE WATER SYSTEM PLAN - SCHEMATIC DIAGRAM	\N	1	DRAFT	2026-01-28	2026-01-26	R	2026-01-27	\N	\N	2026-01-31	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-01-31	\N	\N	\N	\N	\N	2026-09-23 21:47:00.944367	\N	\N	PENDING	\N	\N	\N	\N
5142	1	19	SHOP VNR	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-VNR-002	HỆ THỐNG ĐIỀU HÒA KHÔNG KHÍ VÀ THÔNG GIÓ MẶT BẰNG TẦNG TRỆT\nAIR CONDITIONING AND VENTILATION SYSTEM - GROUND FLOOR PLAN	\N	\N	DRAFT	2026-02-16	2026-02-15	R	2026-02-17	\N	\N	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.937932	\N	\N	PENDING	\N	\N	\N	\N
5143	1	19	SHOP VNR	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-VNR-003	HỆ THỐNG ĐIỀU HÒA KHÔNG KHÍ VÀ THÔNG GIÓ - MẶT BẰNG TẦNG MÁI\nAIR CONDITIONING AND VENTILATION SYSTEM - ROOF FLOOR PLAN	\N	\N	DRAFT	2026-02-16	2026-02-15	R	2026-02-17	\N	\N	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.940236	\N	\N	PENDING	\N	\N	\N	\N
5141	1	19	SHOP VNR	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-VNR-001	HỆ THỐNG ĐIỀU HÒA KHÔNG KHÍ VÀ THÔNG GIÓ - SƠ ĐỒ NGUYÊN LÝ - DANH MỤC THIẾT BỊ\nAIR CONDITIONING AND VENTILATION SYSTEM -  SCHEMATIC DIAGRAM - EQUIPMENT SCHEDULES	\N	\N	DRAFT	2026-02-16	2026-02-15	R	2026-02-17	\N	\N	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-28	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.935994	\N	\N	PENDING	\N	\N	\N	\N
5144	1	19	SHOP VNR	BTE-WP4-HBC-SHD- MEP-PLB-01	MẶT BẰNG HỆ THỐNG CẤP NƯỚC - SƠ ĐỒ NGUYÊN LÝ\nWATER SUPPLY SYSTEM PLAN - SCHEMATIC DIAGRAM	\N	1	DRAFT	2026-01-28	2026-01-26	R	2026-01-27	\N	\N	2026-01-31	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-01-31	\N	\N	\N	\N	\N	2026-09-23 21:47:00.942249	\N	\N	PENDING	\N	\N	\N	\N
\.

-- materials — dự án BTE-WP4-HBC
-- Sinh bởi scripts/export-demo-seed.mjs. Nạp bằng: node scripts/load-demo-seed.mjs
-- Ngày giữ nguyên theo hồ sơ gốc; `npm run setup` gọi rebase-demo-dates.mjs để neo về ngày chạy.
COPY materials ("id", "project_id", "zone_id", "source_sheet", "material_code", "name_vi", "name_en", "progress_pct", "request_date_1", "delivery_date_1", "request_date_2", "delivery_date_2", "request_date_3", "delivery_date_3", "request_date_4", "delivery_date_4", "notes", "created_at", "upload_id", "work_item_id", "procurement_status", "po_number", "po_issued_at", "expected_delivery_at", "delivered_at", "accepted_at", "accepted_by", "acceptance_result", "lifecycle_note", "updated_at") FROM stdin;
288	1	24	Tien Do Vat Tu Moron	HBC	HBG	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:10.143623	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
289	1	24	Tien Do Vat Tu Moron	Dekko, GS	Đệ Nhất	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:10.147339	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
290	1	24	Tien Do Vat Tu Moron	Dekko, Bình Minh	Bình Minh	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:10.149145	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
291	1	24	Tien Do Vat Tu Moron	Good, Equivalent	Tiền Phong	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:10.150827	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
292	1	24	Tien Do Vat Tu Moron	Kitz, Arita	Arita	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:10.152786	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
293	1	24	Tien Do Vat Tu Moron	Asahi, Itron	Asahi	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:10.154623	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
294	1	24	Tien Do Vat Tu Moron	Daikin, Panasonic	Daikin	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:10.156675	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
295	1	24	Tien Do Vat Tu Moron	Hailiang, Toàn Phát	Hailiang	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:10.158442	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
296	1	24	Tien Do Vat Tu Moron	Armaflex, Aeroflex	Aeroflex	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:10.160158	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
297	1	24	Tien Do Vat Tu Moron	Phương Nam, Hoa Sen	Hoa Sen	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:10.16193	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
298	1	24	Tien Do Vat Tu Moron	Systemair, Kruger	Kruger	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:10.1637	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
299	1	24	Tien Do Vat Tu Moron	Cadivi, Thịnh Phát	Cadivi	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:10.165364	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
300	1	24	Tien Do Vat Tu Moron	Hà Bằng, Elek	Elek	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:10.167127	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
301	1	24	Tien Do Vat Tu Moron	Sino, Nano	Sino	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:10.168805	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
302	1	24	Tien Do Vat Tu Moron	Panasonic, Schneider	Panasonic	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:10.170557	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
303	1	24	Tien Do Vat Tu Moron	Tyco, Viking	Tyco	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:10.172347	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
304	1	24	Tien Do Vat Tu Moron	Việt Nam	Thành Công	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:10.174088	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
305	1	24	Tien Do Vat Tu Moron	Ebara	Ebara	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:10.175891	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
306	1	24	Tien Do Vat Tu Moron	Tsurumi	Tsurumi	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:10.177783	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
307	1	24	Tien Do Vat Tu Moron	N/A	Mê Kông	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:10.179595	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
308	1	24	Tien Do Vat Tu Moron	Hòa Phát	Hòa Phát	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:10.181284	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
309	1	24	Tien Do Vat Tu Moron	Hà Tiên	Hà Tiên	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:10.182947	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
310	1	24	Tien Do Vat Tu Moron	Đồng Tâm	Tuynel	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:10.18477	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
313	1	29	Tien Do Vat Tu Moron	Dekko, Bình Minh	Bình Minh	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:15.981861	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
314	1	29	Tien Do Vat Tu Moron	Good, Equivalent	Tiền Phong	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:15.983809	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
315	1	29	Tien Do Vat Tu Moron	Kitz, Arita	Arita	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:15.985652	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
316	1	29	Tien Do Vat Tu Moron	Asahi, Itron	Asahi	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:15.987186	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
317	1	29	Tien Do Vat Tu Moron	Daikin, Panasonic	Daikin	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:15.98879	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
318	1	29	Tien Do Vat Tu Moron	Hailiang, Toàn Phát	Hailiang	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:15.990338	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
319	1	29	Tien Do Vat Tu Moron	Armaflex, Aeroflex	Aeroflex	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:15.992111	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
320	1	29	Tien Do Vat Tu Moron	Phương Nam, Hoa Sen	Hoa Sen	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:15.993637	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
321	1	29	Tien Do Vat Tu Moron	Systemair, Kruger	Kruger	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:15.995559	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
322	1	29	Tien Do Vat Tu Moron	Cadivi, Thịnh Phát	Cadivi	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:15.99703	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
323	1	29	Tien Do Vat Tu Moron	Hà Bằng, Elek	Elek	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:15.998564	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
324	1	29	Tien Do Vat Tu Moron	Sino, Nano	Sino	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:16.000231	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
325	1	29	Tien Do Vat Tu Moron	Panasonic, Schneider	Panasonic	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:16.002007	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
326	1	29	Tien Do Vat Tu Moron	Tyco, Viking	Tyco	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:16.00372	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
327	1	29	Tien Do Vat Tu Moron	Việt Nam	Thành Công	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:16.005389	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
328	1	29	Tien Do Vat Tu Moron	Ebara	Ebara	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:16.007338	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
329	1	29	Tien Do Vat Tu Moron	Tsurumi	Tsurumi	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:16.008996	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
330	1	29	Tien Do Vat Tu Moron	N/A	Mê Kông	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:16.010478	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
331	1	29	Tien Do Vat Tu Moron	Hòa Phát	Hòa Phát	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:16.012178	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
332	1	29	Tien Do Vat Tu Moron	Hà Tiên	Hà Tiên	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:16.013906	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
333	1	29	Tien Do Vat Tu Moron	Đồng Tâm	Tuynel	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:16.0158	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1507	1	15	VẬT TƯ LOB & SPA	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-2BR-001	MẶT BẰNG HỆ THỐNG THOÁT NƯỚC\nDRAINAGE WATER SYSTEM PLAN	\N	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.037571	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.037571+00
311	1	29	Tien Do Vat Tu Moron	HBC	HBG	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:15.978484	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
312	1	29	Tien Do Vat Tu Moron	Dekko, GS	Đệ Nhất	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-04 05:15:15.980301	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1194	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-HVAC-002/	Refrigerant copper pipe/ Ống dẫn môi chất lạnh	\N	0.8	2026-04-13	2026-04-24	2026-04-30	2026-06-11	2026-04-30	2026-06-11	2026-06-15	2026-07-01	Đã giao hàng | NCC: CÔNG TY CỔ PHẦN CƠ ĐIỆN LẠNH HOÀNG BÁCH | HĐ: XNDH | NT: Đã Nghiệm thu | lot?: req=- eta=- actual=-	2026-09-08 04:38:46.364137	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1410	1	1	VẬT TƯ BOH	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-1BRB-001	Ống thoát nước upvc và phụ kiện	\N	1	2026-02-10	2026-02-24	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.544737	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.544737+00
1407	1	1	VẬT TƯ BOH	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-002	Ống nước ngưng và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.536183	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.536183+00
1408	1	1	VẬT TƯ BOH	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-003	Bảo ôn ống đồng, nước ngưng, ống gió	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.538925	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.538925+00
1179	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-PLB--001	PP-R pipe & Fitings/ Ống nhựa PP-R và phụ kiện	\N	1	2026-03-17	2026-04-03	2026-05-10	2026-05-26	\N	2026-07-10	2026-08-22	2026-09-03	Đã giao hàng | NCC: CÔNG TY CP TAM ĐA\r\nSố 123 Ngõ 208 Nguyễn Văn Cừ, Q. Long Biên,Hà Nội | HĐ: HB11 – BTE/2019/HĐNT HB-TĐ | NT: Đã nghiệm thu	2026-09-08 04:38:46.311928	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1180	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-PLB--002	uPVC pipe & Fitings/ Ống nhựa uPVC & phụ kiện	\N	1	2026-02-04	2026-02-24	2026-03-18	2026-04-12	2026-05-10	2026-06-08	2026-06-15	2026-07-03	Đã giao hàng | NCC: Công ty CP Xây dựng Minh Long | HĐ: HB03 – BTE/2019/HĐKT HB-LT | NT: Đã nghiệm thu | lot5: req=HBG-BTE-YCVT-BT-PLB-0.5 eta=2019-10-26 actual=2019-10-28	2026-09-08 04:38:46.316847	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1181	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-PLB--003	HDPE pipe & Fitings/ Ống nhựa HDPE & phụ kiện	\N	1	2026-02-01	2026-02-12	\N	2026-02-15	\N	2026-02-16	\N	2026-02-18	Đã giao hàng | NCC: Công ty TNHH Đại Phát | HĐ: HB01-BTE/2019/HĐNT HB-TĐ | NT: Đã nghiệm thu | lot5: req=- eta=2019-04-26 actual=2019-04-26 | lot6: req=HBG-BTE-YCVT-HDPE-02 eta=2019-05-11 actual=2019-05-11 | lot7: req=- eta=2019-05-27 actual=2019-05-26 | lot8: req=HBG-BTE-YCVT-HDPE-03 eta=2019-06-04 actual=2019-06-05 | lot9: req=HBG-BTE-YCVT-HDPE-04 eta=2019-07-14 actual=2019-07-19	2026-09-08 04:38:46.319966	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1409	1	1	VẬT TƯ BOH	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-1BRA-001	Ống cấp nước ppr và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.541482	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.541482+00
1406	1	1	VẬT TƯ BOH	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-001	Ống đồng và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.532254	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.532254+00
1189	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-PLB-009	Băng cảnh báo	\N	1	2026-02-01	2026-02-15	\N	\N	\N	\N	\N	\N	Đã giao hàng | NT: Đã Nghiệm Thu	2026-09-08 04:38:46.347328	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1205	1	24	RFA-Submission_Delivery	WWTP-135M3/DAY	WWTP-135M3/DAY	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 04:38:46.399358	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1436	1	9	VẬT TƯ GEN	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-003	Bảo ôn ống đồng, nước ngưng, ống gió	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.692002	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.692002+00
1438	1	9	VẬT TƯ GEN	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-1BRA-001	Ống cấp nước ppr và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.695304	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.695304+00
1439	1	9	VẬT TƯ GEN	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-1BRB-001	Ống thoát nước upvc và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.697664	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.697664+00
1440	1	9	VẬT TƯ GEN	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-1BRB-001	Ống cấp nước và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.699403	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.699403+00
1441	1	9	VẬT TƯ GEN	BTE-WP4-HBC-SHD- MEP-PLB-PL-BPV-2BR-001	Bơm	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.700923	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.700923+00
1442	1	9	VẬT TƯ GEN	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-2BR-001	MẶT BẰNG CẤP NƯỚC\nWATER SUPPLY PLAN	\N	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.702571	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.702571+00
1443	1	9	VẬT TƯ GEN	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-2BR-001	MẶT BẰNG HỆ THỐNG THOÁT NƯỚC\nDRAINAGE WATER SYSTEM PLAN	\N	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.704823	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.704823+00
1216	1	24	RFA-Submission_Delivery	WWTP-60M3/DAY	WWTP-60M3/DAY	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 04:38:46.43346	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1219	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-WWTP-003	Tủ điều khiển	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Không thuộc phạm vi	2026-09-08 04:38:46.442811	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1222	1	24	RFA-Submission_Delivery	IPC1 - thanh toán đợt 1	1546064750	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	HĐ: Sun Jun 30 2019 00:00:00 GMT+0000 (Coordinated Universal Time)	2026-09-08 04:38:46.450893	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1223	1	24	RFA-Submission_Delivery	IPC2 - thanh toán đợt 2	1278734087	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	HĐ: Sat Aug 17 2019 00:00:00 GMT+0000 (Coordinated Universal Time)	2026-09-08 04:38:46.453985	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1224	1	24	RFA-Submission_Delivery	IPC3 - thanh toán đợt 3	3423739856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	HĐ: Sat Aug 31 2019 00:00:00 GMT+0000 (Coordinated Universal Time)	2026-09-08 04:38:46.458225	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1225	1	24	RFA-Submission_Delivery	IPC4 - thanh toán đợt 4	4142810847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 04:38:46.461297	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1226	1	24	RFA-Submission_Delivery	IPC5 - thanh toán đợt 5 dự kiến	3555000000	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 04:38:46.463969	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1182	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-PLB--004	Ống Inox ( Sơn Hà)  và phụ kiện (Vin Pro)	\N	1	2026-03-18	2026-04-15	2026-06-02	2026-06-19	\N	\N	\N	\N	Đã giao hàng | NCC: Cty Thái Việt | HĐ: HB12-BTE/HĐKT HB-TV | NT: Đã nghiệm thu	2026-09-08 04:38:46.322852	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1421	1	2	VẬT TƯ BPV	BTE-WP4-HBC-SHD- MEP-PLB-PL-BPV-2BR-001	Bơm	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.600047	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.600047+00
1422	1	2	VẬT TƯ BPV	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-2BR-001	MẶT BẰNG CẤP NƯỚC\nWATER SUPPLY PLAN	\N	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.602687	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.602687+00
1424	1	5	VẬT TƯ BSN	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-001	Ống đồng và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.637385	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.637385+00
1425	1	5	VẬT TƯ BSN	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-002	Ống nước ngưng và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.64003	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.64003+00
1426	1	5	VẬT TƯ BSN	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-003	Bảo ôn ống đồng, nước ngưng, ống gió	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.642704	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.642704+00
1427	1	5	VẬT TƯ BSN	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-1BRA-001	Ống thoát nước hdpe và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.644697	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.644697+00
1428	1	5	VẬT TƯ BSN	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-1BRA-001	Ống cấp nước ppr và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.646698	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.646698+00
1429	1	5	VẬT TƯ BSN	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-1BRB-001	Ống thoát nước upvc và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.650089	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.650089+00
1430	1	5	VẬT TƯ BSN	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-1BRB-001	Ống cấp nước và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.652024	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.652024+00
1431	1	5	VẬT TƯ BSN	BTE-WP4-HBC-SHD- MEP-PLB-PL-BPV-2BR-001	Bơm	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.653686	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.653686+00
1432	1	5	VẬT TƯ BSN	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-2BR-001	MẶT BẰNG CẤP NƯỚC\nWATER SUPPLY PLAN	\N	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.655371	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.655371+00
1433	1	5	VẬT TƯ BSN	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-2BR-001	MẶT BẰNG HỆ THỐNG THOÁT NƯỚC\nDRAINAGE WATER SYSTEM PLAN	\N	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.65765	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.65765+00
1418	1	2	VẬT TƯ BPV	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-1BRA-001	Ống cấp nước ppr và phụ kiện	\N	1	2026-02-10	2026-02-24	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.594283	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.594283+00
1435	1	9	VẬT TƯ GEN	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-002	Ống nước ngưng và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.690368	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.690368+00
1437	1	9	VẬT TƯ GEN	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-1BRA-001	Ống thoát nước hdpe và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.693639	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.693639+00
1413	1	1	VẬT TƯ BOH	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-2BR-001	MẶT BẰNG CẤP NƯỚC\nWATER SUPPLY PLAN	\N	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.552277	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.552277+00
1415	1	2	VẬT TƯ BPV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-001	Ống đồng và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.586832	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.586832+00
1417	1	2	VẬT TƯ BPV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-003	Bảo ôn ống đồng, nước ngưng, ống gió	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.591361	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.591361+00
1419	1	2	VẬT TƯ BPV	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-1BRB-001	Ống thoát nước upvc và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.596036	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.596036+00
1420	1	2	VẬT TƯ BPV	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-1BRB-001	Ống cấp nước và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.597666	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.597666+00
1416	1	2	VẬT TƯ BPV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-002	Ống nước ngưng và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.588846	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.588846+00
1449	1	7	VẬT TƯ BZONE	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-1BRB-001	Ống thoát nước upvc và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.74396	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.74396+00
1453	1	7	VẬT TƯ BZONE	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-2BR-001	MẶT BẰNG HỆ THỐNG THOÁT NƯỚC\nDRAINAGE WATER SYSTEM PLAN	\N	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.751259	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.751259+00
1454	1	8	VẬT TƯ CLU	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-001	Ống đồng và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.782582	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.782582+00
1455	1	8	VẬT TƯ CLU	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-002	Ống nước ngưng và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.78537	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.78537+00
1446	1	7	VẬT TƯ BZONE	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-003	Bảo ôn ống đồng, nước ngưng, ống gió	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.738551	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.738551+00
1447	1	7	VẬT TƯ BZONE	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-1BRA-001	Ống thoát nước hdpe và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.740417	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.740417+00
1450	1	7	VẬT TƯ BZONE	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-1BRB-001	Ống cấp nước và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.746182	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.746182+00
1451	1	7	VẬT TƯ BZONE	BTE-WP4-HBC-SHD- MEP-PLB-PL-BPV-2BR-001	Bơm	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.747825	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.747825+00
1452	1	7	VẬT TƯ BZONE	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-2BR-001	MẶT BẰNG CẤP NƯỚC\nWATER SUPPLY PLAN	\N	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.749534	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.749534+00
1448	1	7	VẬT TƯ BZONE	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-1BRA-001	Ống cấp nước ppr và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.742052	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.742052+00
1412	1	1	VẬT TƯ BOH	BTE-WP4-HBC-SHD- MEP-PLB-PL-BPV-2BR-001	Bơm	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.549845	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.549845+00
1445	1	7	VẬT TƯ BZONE	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-002	Ống nước ngưng và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.736466	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.736466+00
1411	1	1	VẬT TƯ BOH	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-1BRB-001	Ống cấp nước và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.547245	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.547245+00
1444	1	7	VẬT TƯ BZONE	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-001	Ống đồng và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.73393	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.73393+00
1476	1	10	VẬT TƯ HPV	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-1BRA-001	Ống thoát nước hdpe và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.882453	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.882453+00
1477	1	10	VẬT TƯ HPV	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-1BRA-001	Ống cấp nước ppr và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.885432	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.885432+00
1478	1	10	VẬT TƯ HPV	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-1BRB-001	Ống thoát nước upvc và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.887177	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.887177+00
1479	1	10	VẬT TƯ HPV	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-1BRB-001	Ống cấp nước và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.889793	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.889793+00
1480	1	10	VẬT TƯ HPV	BTE-WP4-HBC-SHD- MEP-PLB-PL-BPV-2BR-001	Bơm	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.89186	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.89186+00
1481	1	10	VẬT TƯ HPV	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-2BR-001	MẶT BẰNG CẤP NƯỚC\nWATER SUPPLY PLAN	\N	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.893838	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.893838+00
1482	1	10	VẬT TƯ HPV	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-2BR-001	MẶT BẰNG HỆ THỐNG THOÁT NƯỚC\nDRAINAGE WATER SYSTEM PLAN	\N	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.895662	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.895662+00
1484	1	13	VẬT TƯ GEN	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-1BRB-001	Ống cấp nước và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.926026	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.926026+00
1485	1	13	VẬT TƯ GEN	BTE-WP4-HBC-SHD- MEP-PLB-PL-BPV-2BR-001	Bơm	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.929558	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.929558+00
1486	1	13	VẬT TƯ GEN	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-2BR-001	MẶT BẰNG CẤP NƯỚC\nWATER SUPPLY PLAN	\N	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.932483	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.932483+00
1487	1	13	VẬT TƯ GEN	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-2BR-001	MẶT BẰNG HỆ THỐNG THOÁT NƯỚC\nDRAINAGE WATER SYSTEM PLAN	\N	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.934804	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.934804+00
1488	1	14	VẬT TƯ KID	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-001	Ống đồng và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.969878	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.969878+00
1489	1	14	VẬT TƯ KID	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-002	Ống nước ngưng và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.972172	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.972172+00
1490	1	14	VẬT TƯ KID	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-003	Bảo ôn ống đồng, nước ngưng, ống gió	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.973965	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.973965+00
1491	1	14	VẬT TƯ KID	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-1BRA-001	Ống thoát nước hdpe và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.975757	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.975757+00
1492	1	14	VẬT TƯ KID	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-1BRA-001	Ống cấp nước ppr và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.978401	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.978401+00
1493	1	14	VẬT TƯ KID	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-1BRB-001	Ống thoát nước upvc và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.980333	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.980333+00
1494	1	14	VẬT TƯ KID	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-1BRB-001	Ống cấp nước và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.981969	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.981969+00
1495	1	14	VẬT TƯ KID	BTE-WP4-HBC-SHD- MEP-PLB-PL-BPV-2BR-001	Bơm	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.983441	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.983441+00
1496	1	14	VẬT TƯ KID	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-2BR-001	MẶT BẰNG CẤP NƯỚC\nWATER SUPPLY PLAN	\N	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.986227	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.986227+00
1497	1	14	VẬT TƯ KID	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-2BR-001	MẶT BẰNG HỆ THỐNG THOÁT NƯỚC\nDRAINAGE WATER SYSTEM PLAN	\N	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.988233	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.988233+00
1498	1	15	VẬT TƯ LOB & SPA	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-001	Ống đồng và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.018623	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.018623+00
1499	1	15	VẬT TƯ LOB & SPA	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-002	Ống nước ngưng và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.020595	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.020595+00
1500	1	15	VẬT TƯ LOB & SPA	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-003	Bảo ôn ống đồng, nước ngưng, ống gió	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.022392	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.022392+00
1501	1	15	VẬT TƯ LOB & SPA	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-1BRA-001	Ống thoát nước hdpe và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.023986	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.023986+00
1502	1	15	VẬT TƯ LOB & SPA	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-1BRA-001	Ống cấp nước ppr và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.026647	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.026647+00
1503	1	15	VẬT TƯ LOB & SPA	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-1BRB-001	Ống thoát nước upvc và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.028709	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.028709+00
1504	1	15	VẬT TƯ LOB & SPA	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-1BRB-001	Ống cấp nước và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.030488	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.030488+00
1505	1	15	VẬT TƯ LOB & SPA	BTE-WP4-HBC-SHD- MEP-PLB-PL-BPV-2BR-001	Bơm	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.032501	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.032501+00
1506	1	15	VẬT TƯ LOB & SPA	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-2BR-001	MẶT BẰNG CẤP NƯỚC\nWATER SUPPLY PLAN	\N	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.035351	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.035351+00
1508	1	16	VẬT TƯ RES	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-001	Ống đồng và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.068024	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.068024+00
1509	1	16	VẬT TƯ RES	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-002	Ống nước ngưng và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.070278	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.070278+00
1458	1	8	VẬT TƯ CLU	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-1BRB-001	Ống thoát nước upvc và phụ kiện	\N	1	2026-02-10	2026-02-24	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.792122	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.792122+00
1414	1	1	VẬT TƯ BOH	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-2BR-001	MẶT BẰNG HỆ THỐNG THOÁT NƯỚC\nDRAINAGE WATER SYSTEM PLAN	\N	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.554417	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.554417+00
1456	1	8	VẬT TƯ CLU	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-003	Bảo ôn ống đồng, nước ngưng, ống gió	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.787499	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.787499+00
1462	1	8	VẬT TƯ CLU	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-2BR-001	MẶT BẰNG HỆ THỐNG THOÁT NƯỚC\nDRAINAGE WATER SYSTEM PLAN	\N	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.800898	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.800898+00
1473	1	10	VẬT TƯ HPV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-001	Ống đồng và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.875823	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.875823+00
1474	1	10	VẬT TƯ HPV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-002	Ống nước ngưng và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.877849	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.877849+00
1475	1	10	VẬT TƯ HPV	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-003	Bảo ôn ống đồng, nước ngưng, ống gió	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.879783	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.879783+00
1460	1	8	VẬT TƯ CLU	BTE-WP4-HBC-SHD- MEP-PLB-PL-BPV-2BR-001	Bơm	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.7968	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.7968+00
1459	1	8	VẬT TƯ CLU	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-1BRB-001	Ống cấp nước và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.795008	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.795008+00
1457	1	8	VẬT TƯ CLU	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-1BRA-001	Ống cấp nước ppr và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.789546	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.789546+00
1515	1	16	VẬT TƯ RES	BTE-WP4-HBC-SHD- MEP-PLB-PL-BPV-2BR-001	Bơm	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.083215	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.083215+00
1183	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-PLB--014	Van cổng/ Gate Vale\r\nVan 1 chiều/ Check Value\r\nY lọc/ Y Strainer	\N	0.86	2026-04-16	2026-07-09	2026-06-03	2026-08-12	2026-05-27	2026-08-12	2026-05-27	2026-08-12	Đã giao hàng | NCC: Longsbs Co., Ltd | HĐ: HB20 BTE PLB-011 HDKT HB-SW | NT: Đã nghiệm thu | lot?: req=- eta=2019-09-19 actual=2019-10-04 | lot?: req=RQ-MEP-BTE-HB-01 eta=2019-11-19 actual=2019-12-08 | lot?: req=- eta=2019-01-15 actual=-	2026-09-08 04:38:46.325943	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1516	1	16	VẬT TƯ RES	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-2BR-001	MẶT BẰNG CẤP NƯỚC\nWATER SUPPLY PLAN	\N	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.085019	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.085019+00
1184	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-PLB--011	-Bơm biến tần 01,02 /Booster Pump 01/02	\N	0.33	2026-04-22	2026-09-21	2026-04-30	2026-09-04	2026-05-27	\N	2026-05-27	\N	Đã giao hàng | HĐ: HB20 BTE PLB-011 HDKT HB-WL | NT: Đã nghiệm thu | lot?: req=- eta=2020-01-10 actual=- | lot?: req=- eta=- actual=-	2026-09-08 04:38:46.329423	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1185	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-PLB-015	Bảo ôn	\N	0.67	2026-04-12	2026-04-24	2026-05-22	\N	2026-05-22	2026-08-02	\N	\N	Đã giao hàng | HĐ: HBG18-BTE/HVAC-005/HĐKT HB-AF | NT: Đã nghiệm thu	2026-09-08 04:38:46.33353	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1186	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-PLB-017	Đồng hồ nước/ Water meter	\N	1	2026-04-29	2026-07-14	\N	\N	\N	\N	\N	\N	Đã giao hàng | HĐ: HB27 BTE PLB-017 HDKT HB-PGT | NT: Đã Nghiệm thu	2026-09-08 04:38:46.337205	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1517	1	16	VẬT TƯ RES	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-2BR-001	MẶT BẰNG HỆ THỐNG THOÁT NƯỚC\nDRAINAGE WATER SYSTEM PLAN	\N	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.086701	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.086701+00
1187	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-PLB-012	Bình nước nóng	\N	1	2026-04-12	2026-04-30	2026-04-14	2026-06-09	2026-04-14	2026-08-04	\N	2026-08-11	Đã giao hàng | NCC: Ferroli | HĐ: HBG15-BTE/PLB-012/HĐKT HB-FRL | NT: Đã Nghiệm thu	2026-09-08 04:38:46.340877	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1188	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-PLB-027	Thoát sàn Căn mẫu	\N	1	2026-04-12	2026-05-13	2026-06-01	2026-06-18	2026-08-22	2026-11-05	2026-08-22	2026-09-11	Đã giao hàng | NCC: JKL | HĐ: XNDH | NT: Đã nghiệm thu	2026-09-08 04:38:46.344125	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1190	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-PLB-016	Cầu thu nước mái, thông tắc sàn lần 1	\N	1	2026-06-02	2026-06-23	2026-08-22	2026-09-09	\N	\N	\N	\N	Đã giao hàng | NCC: CÔNG  TY  TNHH  CƠ  KHÍ – CNTT  NGỌC  THẢO | HĐ: HBG36-BTE PLB-016 HĐKT HB-NT | NT: Đã Nghiệm thu	2026-09-08 04:38:46.350814	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1191	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-PLB-031	Nắp gang thoát nước	\N	1	2026-04-30	2026-08-02	2026-06-03	2026-08-02	2026-06-27	2026-09-19	2026-05-28	2026-10-20	Đã giao hàng | HĐ: HBG26 BTE PLB-031 HDKT HB-BSI | NT: Đã Nghiệm thu | lot?: req=- eta=- actual=2019-12-13	2026-09-08 04:38:46.354167	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1192	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-PLB-013	Hệ thống xử lý nước cấp (trọn bộ) 261m3/ ngđ	\N	0	2026-06-11	\N	2026-05-23	\N	2026-05-23	\N	2026-05-23	\N	NCC: Rinco | NT: Đề nghị đưa về công trường, ngày 05/1/2019 | lot?: req=- eta=2019-08-24 actual=- | lot?: req=- eta=2019-08-24 actual=- | lot?: req=- eta=2019-08-24 actual=- | lot?: req=- eta=2019-08-24 actual=- | lot?: req=- eta=2019-08-24 actual=- | lot?: req=- eta=2019-08-24 actual=- | lot?: req=- eta=2019-08-24 actual=- | lot?: req=- eta=2019-08-24 actual=- | lot?: req=- eta=2019-08-24 actual=-	2026-09-08 04:38:46.357343	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1193	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-PLB-014	Hệ thống xử lý nước đón chai (trọn bộ)	\N	0.17	2026-05-27	\N	2026-07-12	\N	2026-08-01	\N	2026-08-10	\N	NT: HBC cấp | lot?: req=- eta=- actual=- | lot?: req=RQ-MEP-BTE-HĐH-01 eta=- actual=2019-12-01	2026-09-08 04:38:46.360332	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1423	1	2	VẬT TƯ BPV	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-2BR-001	MẶT BẰNG HỆ THỐNG THOÁT NƯỚC\nDRAINAGE WATER SYSTEM PLAN	\N	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.604948	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.604948+00
1518	1	19	VẬT TƯ VN RES	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-001	Ống đồng và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.117172	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.117172+00
1519	1	19	VẬT TƯ VN RES	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-002	Ống nước ngưng và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.119299	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.119299+00
1520	1	19	VẬT TƯ VN RES	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-003	Bảo ôn ống đồng, nước ngưng, ống gió	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.122004	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.122004+00
1434	1	9	VẬT TƯ GEN	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-001	Ống đồng và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.687736	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.687736+00
1521	1	19	VẬT TƯ VN RES	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-1BRA-001	Ống cấp nước ppr và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.124235	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.124235+00
1483	1	13	VẬT TƯ GEN	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-1BRA-001	Ống thoát nước hdpe và phụ kiện	\N	1	2026-02-01	2026-02-12	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.923752	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.923752+00
1461	1	8	VẬT TƯ CLU	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-2BR-001	MẶT BẰNG CẤP NƯỚC\nWATER SUPPLY PLAN	\N	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.798436	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:46:59.798436+00
1510	1	16	VẬT TƯ RES	BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BPV-003	Bảo ôn ống đồng, nước ngưng, ống gió	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.071946	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.071946+00
1511	1	16	VẬT TƯ RES	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-1BRA-001	Ống thoát nước hdpe và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.074822	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.074822+00
1512	1	16	VẬT TƯ RES	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-1BRA-001	Ống cấp nước ppr và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.076629	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.076629+00
1513	1	16	VẬT TƯ RES	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-1BRB-001	Ống thoát nước upvc và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.078561	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.078561+00
1514	1	16	VẬT TƯ RES	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-1BRB-001	Ống cấp nước và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.080534	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.080534+00
1523	1	19	VẬT TƯ VN RES	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-1BRB-001	Ống cấp nước và phụ kiện	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.127687	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.127687+00
1524	1	19	VẬT TƯ VN RES	BTE-WP4-HBC-SHD- MEP-PLB-PL-BPV-2BR-001	Bơm	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.130098	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.130098+00
1525	1	19	VẬT TƯ VN RES	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-2BR-001	MẶT BẰNG CẤP NƯỚC\nWATER SUPPLY PLAN	\N	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.132269	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.132269+00
1526	1	19	VẬT TƯ VN RES	BTE-WP4-HBC-SHD- MEP-PLB-PID-BPV-2BR-001	MẶT BẰNG HỆ THỐNG THOÁT NƯỚC\nDRAINAGE WATER SYSTEM PLAN	\N	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.133916	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.133916+00
1195	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-HVAC-005	Insulation copper pipe, Condensate drain pipe, G.I materials sheet ductwork/ Bảo ôn ống Gas, ống nước ngưng, ống gió	\N	0.8	2026-04-12	2026-04-24	2026-04-29	\N	\N	2026-08-02	2026-08-15	2026-08-21	Đã giao hàng | HĐ: HBG18-BTE/HVAC-005/HĐKT HB-AF | NT: Đã nghiệm thu | lot?: req=- eta=- actual=2015-10-01	2026-09-08 04:38:46.368066	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1196	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-HVAC-007	- Quạt gắn trần, gắn tường, hướng trục	\N	0.89	2026-04-03	2026-05-03	2026-04-19	2026-07-09	2026-04-03	2026-05-06	2026-04-19	2026-07-08	Đã giao hàng | NCC: Kruger Ventilation Industries (Vietnam) Co., Ltd | HĐ: HBG14-BTE/HVAC-011/HĐKT HB-KR | NT: Đã Nghiệm thu | lot?: req=- eta=2019-06-05 actual=2019-06-05 | lot?: req=- eta=2019-08-30 actual=2019-09-07 | lot?: req=- eta=- actual=- | lot?: req=- eta=2019-09-11 actual=2019-09-12 | lot?: req=- eta=- actual=2019-12-13	2026-09-08 04:38:46.371131	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1197	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-HVAC-008	Bộ chia Gas	\N	1	2026-04-26	2026-06-02	\N	\N	\N	\N	\N	\N	Đã giao hàng | HĐ: HB22 BTE HVAC-010 HDKT HB-MEVN | NT: Đã Nghiệm thu	2026-09-08 04:38:46.37412	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1200	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-HVAC-009  Dây cáp điều khiển	Dây cáp điện cho hệ thống điều hòa	\N	0.75	2026-04-23	2026-04-28	2026-05-03	2026-06-12	2026-07-28	2026-08-20	2026-11-03	\N	Đã giao hàng | NT: Đã Nghiệm thu	2026-09-08 04:38:46.383042	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1201	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-HVAC-0010 Van gió cửa gió	Register, Diffuser, Grilles, Damper	\N	0.8	2026-04-12	2026-05-08	2026-07-22	2026-08-04	\N	2026-10-04	\N	2026-11-04	Đã giao hàng | NCC: CME TECHNOLOGY Co., Ltd. | HĐ: HBG17-BTE/HVAC-003/HĐKT HB-CME | NT: Đã nghiệm thu | lot?: req=- eta=- actual=-	2026-09-08 04:38:46.38576	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1202	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-HVAC-0011 Ống luồn dây	Ống ghen luồn dây PVC ( ống conduit )	\N	0.67	2026-04-13	\N	2026-05-03	2026-05-13	2026-09-05	2026-09-09	\N	\N	Mượn bên Kadenko | NCC: CÔNG TY TNHH ĐẦU TƯ DỊCH VỤ HƯNG PHÁT | HĐ: Sat Apr 13 2019 00:00:00 GMT+0000 (Coordinated Universal Time)	2026-09-08 04:38:46.389125	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1203	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-HVAC-0012 Tiêu âm	Tiêu âm	\N	1	\N	2026-10-12	\N	\N	\N	\N	\N	\N	Đã giao hàng ( Lover,) Tiêu âm đang gia công | NT: - 03 bộ louver dự kiến ngày 15/12/2019 giao hàng. \r\n- Tiêu âm, tôn soi lỗ, thép hộp đã về công trường ngày 4/12/2019.	2026-09-08 04:38:46.392571	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1204	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-HVAC-0012	Trungking	\N	1	2026-04-29	2026-06-24	2026-07-07	2026-07-18	2026-08-18	2026-09-07	2026-05-28	2026-06-23	Đã giao hàng | HĐ: HBG28-BTE/HVAC-016/HĐKT HB- BHT | NT: Đã Nghiệm thu | lot?: req=HBG-BTE-YCVT-HVAC- eta=2019-09-24 actual=2019-09-24 | lot?: req=HBG-YCVT-BTE-HVAC&PL- eta=2019-11-07 actual=2019-10-30	2026-09-08 04:38:46.395617	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1206	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-WT-001	-Bơm/Pump (Bơm chìm c/s: 7m3/h-H=6m)	\N	0	2026-05-13	\N	\N	\N	\N	\N	\N	\N	NCC: CÔNG TY TNHH MÔI TRƯỜNG CÔNG NGHỆ CÔNG THÀNH | NT: Đề nghị đưa về Ctrg sau tết (5-10/02/2020)	2026-09-08 04:38:46.402311	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1207	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-WT-002	Dosing pupms/ Bơm định lượng	\N	0	2026-05-23	\N	\N	\N	\N	\N	\N	\N	Mr. Nam | NCC: CÔNG TY TNHH MÔI TRƯỜNG CÔNG NGHỆ CÔNG THÀNH	2026-09-08 04:38:46.405034	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1208	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-WT-003	Air Blower/ Máy thổi khí	\N	0	2026-05-23	\N	\N	\N	\N	\N	\N	\N	Mr. Nam | NCC: GREENSO	2026-09-08 04:38:46.408362	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1209	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-WT-004	Air flex dish/ Đãi phân phối khí	\N	0	2026-05-23	\N	\N	\N	\N	\N	\N	\N	Mr. Nam | NCC: GREENSO	2026-09-08 04:38:46.411349	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1210	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-WT-005	Gía thể vi sinh	\N	0	2026-05-23	\N	\N	\N	\N	\N	\N	\N	Mr. Nam | NCC: GREENSO	2026-09-08 04:38:46.414225	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1211	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-WT-007	Thiêt bị đo PH	\N	0	2026-05-23	\N	\N	\N	\N	\N	\N	\N	Mr. Nam | NCC: GREENSO	2026-09-08 04:38:46.417481	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1212	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-WT-008	Tủ điều khiển	\N	0	2026-05-23	\N	\N	\N	\N	\N	\N	\N	Mr. Nam	2026-09-08 04:38:46.42042	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1213	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-WT-009	Bơm lọc áp lực\r\nQ=7M3/h\r\nH=25m	\N	0	2026-05-23	\N	\N	\N	\N	\N	\N	\N	NT: Đề nghị đưa về Ctrg sau tết (5-10/02/2020)	2026-09-08 04:38:46.42374	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1214	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-WT-010	Tháp xử lý mùi\r\n'- Kích thước: D1000mmxH2500mm\r\n- Vật liệu: SS304	\N	0	2026-05-23	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 04:38:46.427447	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1215	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-WT-011	Đồng hồ đo lưu lượng FM01	\N	0	2026-05-23	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-08 04:38:46.430776	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1217	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-WWTP-001	-Bơm/Pump	\N	0	2026-05-13	\N	\N	\N	\N	\N	\N	\N	Đã giao hàng | NCC: CÔNG TY TNHH MÔI TRƯỜNG CÔNG NGHỆ CÔNG THÀNH | NT: Đã Nghiệm thu	2026-09-08 04:38:46.436423	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1218	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-WWTP-002	Dosing pupms/ Bơm định lượng	\N	1	2026-05-13	2026-06-25	\N	\N	\N	\N	\N	\N	Đã giao hàng | NCC: CÔNG TY TNHH MÔI TRƯỜNG CÔNG NGHỆ CÔNG THÀNH | NT: Đã Nghiệm thu	2026-09-08 04:38:46.439947	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1220	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-WWTP-004	Bồn hóa chất	\N	1	2026-06-02	2026-06-25	2026-09-02	2026-09-07	2026-09-05	2026-09-11	\N	\N	Đã giao hàng mẫu	2026-09-08 04:38:46.445622	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1221	1	24	RFA-Submission_Delivery	BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00	Vật tư phụ	\N	1	2026-02-05	2026-02-25	2026-04-09	2026-05-10	2026-05-16	2026-06-14	2026-07-18	2026-08-08	lot?: req=- eta=- actual=2019-08-10 | lot1: req=HBG-YCVT-BT-PLB&HVAC-001 eta=2019-07-07 actual=2019-07-07 | lot?: req=- eta=2019-07-18 actual=2019-07-18 | lot?: req=- eta=2019-07-19 actual=2019-07-19 | lot1: req=HBG-YCVT-BT-PLB&HVAC-001 eta=2019-07-07 actual=2019-07-07 | lot?: req=- eta=2019-10-07 actual=2019-10-08 | lot?: req=- eta=2019-08-10 actual=2019-08-10 | lot?: req=HBG-YCVT-BT-PLB&HVAC-024 eta=2019-08-29 actual=2019-08-29 | lot?: req=- eta=2019-09-19 actual=2019-09-19 | lot?: req=HBG-YCVT-BTE-HVAC&PL- eta=2019-11-04 actual=2019-11-03	2026-09-08 04:38:46.44855	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:30:34.43491+00
1522	1	19	VẬT TƯ VN RES	BTE-WP4-HBC-SHD- MEP-PLB-PWS-BPV-1BRB-001	Ống thoát nước upvc và phụ kiện	\N	1	2026-02-10	2026-02-24	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.125967	\N	\N	REQUESTED	\N	\N	\N	\N	\N	\N	\N	\N	2026-09-23 21:47:00.125967+00
\.

-- schedule_baselines — dự án BTE-WP4-HBC
-- Sinh bởi scripts/export-demo-seed.mjs. Nạp bằng: node scripts/load-demo-seed.mjs
-- Ngày giữ nguyên theo hồ sơ gốc; `npm run setup` gọi rebase-demo-dates.mjs để neo về ngày chạy.
COPY schedule_baselines ("id", "project_id", "version", "effective_date", "created_by", "notes", "created_at", "source_scenario_id", "content_hash", "is_current", "applied_at", "rolled_back_at") FROM stdin;
591	1	6	2026-09-30	1	E2E test baseline	2026-09-30 22:56:01.254356	\N	8d0078749b58ac7011904445a6f121b633dd59b014585235a526c1b5d3c40bdf	f	2026-09-30 22:56:01.254356+00	\N
575	1	4	2026-09-30	1	E2E test baseline	2026-09-30 22:17:23.007166	\N	8d0078749b58ac7011904445a6f121b633dd59b014585235a526c1b5d3c40bdf	f	2026-09-30 22:17:23.007166+00	\N
583	1	5	2026-09-30	1	E2E test baseline	2026-09-30 22:45:48.929569	\N	8d0078749b58ac7011904445a6f121b633dd59b014585235a526c1b5d3c40bdf	f	2026-09-30 22:45:48.929569+00	\N
599	1	7	2026-09-30	1	E2E test baseline	2026-09-30 23:06:27.10091	\N	8d0078749b58ac7011904445a6f121b633dd59b014585235a526c1b5d3c40bdf	f	2026-09-30 23:06:27.10091+00	\N
607	1	8	2026-09-30	1	E2E test baseline	2026-09-30 23:58:41.709559	\N	8d0078749b58ac7011904445a6f121b633dd59b014585235a526c1b5d3c40bdf	f	2026-09-30 23:58:41.709559+00	\N
615	1	9	2026-10-01	1	E2E test baseline	2026-10-01 00:06:50.525248	\N	8d0078749b58ac7011904445a6f121b633dd59b014585235a526c1b5d3c40bdf	t	2026-10-01 00:06:50.525248+00	\N
1	1	1	2033-06-09	\N	Baseline ban đầu (mục 43.9)	2026-08-29 09:48:54	\N	\N	f	\N	\N
22	1	3	2026-09-23	\N	Official baseline bootstrapped from current schedule during 9999ai migration	2026-09-23 21:25:26.209708	\N	86e79e3f572772c77733cebb56de3715	f	2026-09-23 21:25:26.209708+00	\N
\.

-- contracts — dự án BTE-WP4-HBC
-- Sinh bởi scripts/export-demo-seed.mjs. Nạp bằng: node scripts/load-demo-seed.mjs
-- Ngày giữ nguyên theo hồ sơ gốc; `npm run setup` gọi rebase-demo-dates.mjs để neo về ngày chạy.
COPY contracts ("id", "project_id", "vendor_id", "contract_no", "contract_name", "signed_date", "total_value", "status", "created_at") FROM stdin;
195	1	\N	AP-IPC4 - thanh toán đợt 4	5268314371.1	\N	5268314371.10	ACTIVE	2026-09-08 04:38:50.338843
196	1	\N	AP-IPC5 - thanh toán đợt 5	847710047	\N	847710047.00	ACTIVE	2026-09-08 04:38:50.356275
197	1	\N	AP-IPC6 - thanh toán đợt 6	6567935725	\N	6567935725.00	ACTIVE	2026-09-08 04:38:50.369872
198	1	\N	AP-IPC7 - thanh toán đợt 7	3699401495	\N	3699401495.00	ACTIVE	2026-09-08 04:38:50.383608
199	1	\N	AP-IPC8 - thanh toán đợt 8	4089412960	\N	4089412960.00	ACTIVE	2026-09-08 04:38:50.39704
123	1	\N	HB11 – BTE/2019/HĐNT HB-TĐ	PP-R pipe & Fitings/ Ống nhựa PP-R và phụ kiện	2026-03-23	128770399.00	ACTIVE	2026-09-08 04:38:47.640844
124	1	\N	HB03 – BTE/2019/HĐKT HB-LT	uPVC pipe & Fitings/ Ống nhựa uPVC & phụ kiện	2026-02-09	382610197.00	ACTIVE	2026-09-08 04:38:47.722586
125	1	\N	HB01-BTE/2019/HĐNT HB-TĐ	HDPE pipe & Fitings/ Ống nhựa HDPE & phụ kiện	2026-02-07	809883157.00	ACTIVE	2026-09-08 04:38:47.778679
126	1	\N	HB12-BTE/HĐKT HB-TV	Ống Inox ( Sơn Hà)  và phụ kiện (Vin Pro)	2026-03-31	193476800.00	ACTIVE	2026-09-08 04:38:47.86663
127	1	\N	HB20 BTE PLB-011 HDKT HB-SW	Van cổng/ Gate Vale\r\nVan 1 chiều/ Check Value\r\nY lọc/ Y Strainer	2026-05-13	879381800.00	ACTIVE	2026-09-08 04:38:47.886722
128	1	\N	HB20 BTE PLB-011 HDKT HB-WL	-Bơm biến tần 01,02 /Booster Pump 01/02	2026-05-11	662860000.00	ACTIVE	2026-09-08 04:38:47.932147
130	1	\N	HB27 BTE PLB-017 HDKT HB-PGT	Đồng hồ nước/ Water meter	2026-05-13	96376500.00	ACTIVE	2026-09-08 04:38:47.996535
131	1	\N	HBG15-BTE/PLB-012/HĐKT HB-FRL	Bình nước nóng	2026-04-14	\N	ACTIVE	2026-09-08 04:38:48.007742
134	1	\N	HBG36-BTE PLB-016 HĐKT HB-NT	Cầu thu nước mái, thông tắc sàn lần 1	2026-06-07	35244000.00	ACTIVE	2026-09-08 04:38:48.108203
135	1	\N	HBG26 BTE PLB-031 HDKT HB-BSI	Nắp gang thoát nước	2026-05-13	948365000.00	ACTIVE	2026-09-08 04:38:48.131369
136	1	\N	AP-BTE-WP4-HBC-MAA-MEP-PLB-013	Hệ thống xử lý nước cấp (trọn bộ) 261m3/ ngđ	2026-06-11	2961750000.00	ACTIVE	2026-09-08 04:38:48.179917
138	1	\N	AP-BTE-WP4-HBC-MAA-MEP-HVAC-007	Condensate drain pipe/ Ống nước ngưng	2026-03-28	0.00	ACTIVE	2026-09-08 04:38:48.525025
139	1	\N	HBG16-BTE/HVAC-012/HĐNT HB-MH	G.I materials sheet ductwork/ Ống gió  tôn tráng kẽm	2026-04-14	29976613.00	ACTIVE	2026-09-08 04:38:48.550088
140	1	\N	HBG14-BTE/HVAC-011/HĐKT HB-KR	- Quạt gắn trần, gắn tường, hướng trục	2026-04-12	503800000.00	ACTIVE	2026-09-08 04:38:48.662209
141	1	\N	HB22 BTE HVAC-010 HDKT HB-MEVN	Bộ chia Gas	2026-05-09	104876200.00	ACTIVE	2026-09-08 04:38:48.732407
143	1	\N	HBG17-BTE/HVAC-003/HĐKT HB-CME	Register, Diffuser, Grilles, Damper	2026-04-16	83695887.00	ACTIVE	2026-09-08 04:38:48.779318
146	1	\N	HBG28-BTE/HVAC-016/HĐKT HB- BHT	Trungking	2026-04-29	221602462.00	ACTIVE	2026-09-08 04:38:48.864831
148	1	\N	AP-BTE-WP4-HBC-MAA-MEP-WT-001	-Bơm/Pump	2026-05-13	\N	ACTIVE	2026-09-08 04:38:48.916481
159	1	\N	AP-BTE-WP4-HBC-MAA-MEP-WWTP-001	-Bơm/Pump	2026-05-13	267740000.00	ACTIVE	2026-09-08 04:38:49.086905
160	1	\N	AP-BTE-WP4-HBC-MAA-MEP-WWTP-002	Dosing pupms/ Bơm định lượng	2026-05-13	40644153.00	ACTIVE	2026-09-08 04:38:49.102278
161	1	\N	AP-BTE-WP4-HBC-MAA-MEP-WWTP-003	Tủ điều khiển	2026-10-03	194725300.00	ACTIVE	2026-09-08 04:38:49.11794
129	1	\N	HBG18-BTE/HVAC-005/HĐKT HB-AF	Bảo ôn	\N	0.00	ACTIVE	2026-09-08 04:38:47.954894
132	1	\N	XNDH	Thoát sàn Căn mẫu	\N	16860342.00	ACTIVE	2026-09-08 04:38:48.050108
133	1	\N	AP-BTE-WP4-HBC-MAA-MEP-PLB-009	Băng cảnh báo	\N	0.00	ACTIVE	2026-09-08 04:38:48.09647
137	1	\N	AP-BTE-WP4-HBC-MAA-MEP-PLB-014	Hệ thống xử lý nước đón chai (trọn bộ)	\N	165000000.00	ACTIVE	2026-09-08 04:38:48.300895
142	1	\N	AP-BTE-WP4-HBC-MAA-MEP-HVAC-009  Dây cáp điều khiển	Dây cáp điện cho hệ thống điều hòa	\N	0.00	ACTIVE	2026-09-08 04:38:48.744212
144	1	\N	Sat Apr 13 2019 00:00:00 GMT+0000 (Coordinated Universal Time)	Ống ghen luồn dây PVC ( ống conduit )	\N	\N	ACTIVE	2026-09-08 04:38:48.815119
145	1	\N	AP-BTE-WP4-HBC-MAA-MEP-HVAC-0012 Tiêu âm	Tiêu âm	\N	495000000.00	ACTIVE	2026-09-08 04:38:48.854108
147	1	\N	AP-WWTP-135M3/DAY	\N	\N	\N	ACTIVE	2026-09-08 04:38:48.906549
149	1	\N	AP-BTE-WP4-HBC-MAA-MEP-WT-002	Dosing pupms/ Bơm định lượng	\N	\N	ACTIVE	2026-09-08 04:38:48.92918
150	1	\N	AP-BTE-WP4-HBC-MAA-MEP-WT-003	Air Blower/ Máy thổi khí	\N	\N	ACTIVE	2026-09-08 04:38:48.941883
151	1	\N	AP-BTE-WP4-HBC-MAA-MEP-WT-004	Air flex dish/ Đãi phân phối khí	\N	\N	ACTIVE	2026-09-08 04:38:48.954541
152	1	\N	AP-BTE-WP4-HBC-MAA-MEP-WT-005	Gía thể vi sinh	\N	\N	ACTIVE	2026-09-08 04:38:48.965497
153	1	\N	AP-BTE-WP4-HBC-MAA-MEP-WT-007	Thiêt bị đo PH	\N	\N	ACTIVE	2026-09-08 04:38:48.983514
154	1	\N	AP-BTE-WP4-HBC-MAA-MEP-WT-008	Tủ điều khiển	\N	\N	ACTIVE	2026-09-08 04:38:49.004369
155	1	\N	AP-BTE-WP4-HBC-MAA-MEP-WT-009	Bơm lọc áp lực\r\nQ=7M3/h\r\nH=25m	\N	\N	ACTIVE	2026-09-08 04:38:49.024638
156	1	\N	AP-BTE-WP4-HBC-MAA-MEP-WT-010	Tháp xử lý mùi\r\n'- Kích thước: D1000mmxH2500mm\r\n- Vật liệu: SS304	\N	\N	ACTIVE	2026-09-08 04:38:49.044742
157	1	\N	AP-BTE-WP4-HBC-MAA-MEP-WT-011	Đồng hồ đo lưu lượng FM01	\N	\N	ACTIVE	2026-09-08 04:38:49.059372
158	1	\N	AP-WWTP-60M3/DAY	\N	\N	\N	ACTIVE	2026-09-08 04:38:49.070944
162	1	\N	AP-BTE-WP4-HBC-MAA-MEP-WWTP-004	Bồn hóa chất	\N	1180000.00	ACTIVE	2026-09-08 04:38:49.133137
163	1	\N	AP-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00	Vật tư phụ	\N	48739000.00	ACTIVE	2026-09-08 04:38:49.183849
164	1	\N	AP-PP1	\N	\N	22443750.00	ACTIVE	2026-09-08 04:38:49.412615
165	1	\N	AP-PP2	\N	\N	28492450.00	ACTIVE	2026-09-08 04:38:49.426013
166	1	\N	AP-PP3	\N	\N	32090450.00	ACTIVE	2026-09-08 04:38:49.440355
167	1	\N	AP-PP4	\N	\N	32651500.00	ACTIVE	2026-09-08 04:38:49.451361
168	1	\N	AP-PP5	\N	\N	15194690.00	ACTIVE	2026-09-08 04:38:49.46421
169	1	\N	AP-PP6	\N	\N	2653537.00	ACTIVE	2026-09-08 04:38:49.474941
170	1	\N	AP-PP7	\N	\N	10449063.00	ACTIVE	2026-09-08 04:38:49.485572
171	1	\N	AP-PP8	\N	\N	16615877.00	ACTIVE	2026-09-08 04:38:49.495376
172	1	\N	AP-PP9	\N	\N	16615877.00	ACTIVE	2026-09-08 04:38:49.508209
173	1	\N	AP-PP10	\N	\N	17533250.00	ACTIVE	2026-09-08 04:38:49.520435
174	1	\N	AP-PP11	\N	\N	25850550.00	ACTIVE	2026-09-08 04:38:49.532322
175	1	\N	AP-PP12	\N	\N	22449900.00	ACTIVE	2026-09-08 04:38:49.544886
176	1	\N	AP-PP13	\N	\N	\N	ACTIVE	2026-09-08 04:38:49.559004
177	1	\N	AP-PP6 dự kiến	\N	\N	\N	ACTIVE	2026-09-08 04:38:49.789564
178	1	\N	AP-PP2 dự kiến	\N	\N	\N	ACTIVE	2026-09-08 04:38:49.985027
179	1	\N	AP-PP1 dự kiến	\N	\N	\N	ACTIVE	2026-09-08 04:38:50.007607
180	1	\N	AP-PP4 dự kiến	\N	\N	\N	ACTIVE	2026-09-08 04:38:50.05434
181	1	\N	AP-Tháng 03/2019	\N	\N	\N	ACTIVE	2026-09-08 04:38:50.126607
182	1	\N	AP-Tháng 04/2019	\N	\N	\N	ACTIVE	2026-09-08 04:38:50.138299
183	1	\N	AP-Tháng 05/2019	\N	\N	\N	ACTIVE	2026-09-08 04:38:50.150526
184	1	\N	AP-Tháng 06/2019	\N	\N	\N	ACTIVE	2026-09-08 04:38:50.162255
185	1	\N	AP-Tháng 07/2019	\N	\N	\N	ACTIVE	2026-09-08 04:38:50.174711
186	1	\N	AP-Tháng 08/2019	\N	\N	\N	ACTIVE	2026-09-08 04:38:50.185542
187	1	\N	AP-Tháng 09/2019	\N	\N	\N	ACTIVE	2026-09-08 04:38:50.196347
188	1	\N	AP-Tháng 10/2019	\N	\N	\N	ACTIVE	2026-09-08 04:38:50.207035
189	1	\N	AP-Tháng 11/2019	\N	\N	\N	ACTIVE	2026-09-08 04:38:50.221082
190	1	\N	AP-Tháng 12/2019	\N	\N	\N	ACTIVE	2026-09-08 04:38:50.232011
191	1	\N	AP-Tháng 01/2020	\N	\N	\N	ACTIVE	2026-09-08 04:38:50.244441
192	1	\N	Sun Jun 30 2019 00:00:00 GMT+0000 (Coordinated Universal Time)	2001281184.1000001	\N	2001281184.10	ACTIVE	2026-09-08 04:38:50.282677
193	1	\N	Sat Aug 17 2019 00:00:00 GMT+0000 (Coordinated Universal Time)	1629563003.2	\N	1629563003.20	ACTIVE	2026-09-08 04:38:50.30326
194	1	\N	Sat Aug 31 2019 00:00:00 GMT+0000 (Coordinated Universal Time)	4355135075.5	\N	4355135075.50	ACTIVE	2026-09-08 04:38:50.322516
\.

-- payments — dự án BTE-WP4-HBC
-- Sinh bởi scripts/export-demo-seed.mjs. Nạp bằng: node scripts/load-demo-seed.mjs
-- Ngày giữ nguyên theo hồ sơ gốc; `npm run setup` gọi rebase-demo-dates.mjs để neo về ngày chạy.
COPY payments ("id", "project_id", "payment_request_id", "vendor_id", "contract_no", "invoice_no", "amount", "paid_amount", "retention_amount", "retention_held", "vat_amount", "vat_paid", "due_date", "paid_at", "paid_method", "status", "notes", "created_at", "idempotency_key", "retention_released_amount", "retention_released_at") FROM stdin;
28	1	557	\N	Sun Jun 30 2019 00:00:00 GMT+0000 (Coordinated Universal Time)	AP-REQ-IPC1 - thanh toán đợt 1-L1	2001281184.10	1546064750.00	\N	0.00	\N	0.00	\N	2026-04-22 00:00:00	\N	PAID	imported: supplier-AP	2026-09-08 04:38:50.294515	\N	0.00	\N
29	1	558	\N	Sat Aug 17 2019 00:00:00 GMT+0000 (Coordinated Universal Time)	AP-REQ-IPC2 - thanh toán đợt 2-L1	1629563003.20	1278734087.00	\N	0.00	\N	0.00	\N	2026-06-09 00:00:00	\N	PAID	imported: supplier-AP	2026-09-08 04:38:50.315908	\N	0.00	\N
30	1	559	\N	Sat Aug 31 2019 00:00:00 GMT+0000 (Coordinated Universal Time)	AP-REQ-IPC3 - thanh toán đợt 3-L1	4355135075.50	3423739856.00	\N	0.00	\N	0.00	\N	2026-07-14 00:00:00	\N	PAID	imported: supplier-AP	2026-09-08 04:38:50.333456	\N	0.00	\N
31	1	560	\N	AP-IPC4 - thanh toán đợt 4	AP-REQ-IPC4 - thanh toán đợt 4-L1	5268314371.10	4142810847.00	\N	0.00	\N	0.00	\N	2026-08-12 00:00:00	\N	PAID	imported: supplier-AP	2026-09-08 04:38:50.350197	\N	0.00	\N
\.

-- invoices — dự án BTE-WP4-HBC
-- Sinh bởi scripts/export-demo-seed.mjs. Nạp bằng: node scripts/load-demo-seed.mjs
-- Ngày giữ nguyên theo hồ sơ gốc; `npm run setup` gọi rebase-demo-dates.mjs để neo về ngày chạy.
COPY invoices ("id", "contract_id", "invoice_no", "invoice_date", "amount", "vat_amount", "status", "created_at") FROM stdin;
478	169	AP-REQ-PP6-L3	\N	0.00	\N	SUBMITTED	2026-09-08 04:38:49.611263
479	169	AP-REQ-PP6-L4	\N	4500000.00	\N	SUBMITTED	2026-09-08 04:38:49.619682
480	167	AP-REQ-PP4-L2	\N	\N	\N	SUBMITTED	2026-09-08 04:38:49.63544
481	167	AP-REQ-PP4-L3	\N	0.00	\N	SUBMITTED	2026-09-08 04:38:49.644979
482	167	AP-REQ-PP4-L4	\N	\N	\N	SUBMITTED	2026-09-08 04:38:49.655391
483	165	AP-REQ-PP2-L2	\N	\N	\N	SUBMITTED	2026-09-08 04:38:49.668653
484	165	AP-REQ-PP2-L3	\N	\N	\N	SUBMITTED	2026-09-08 04:38:49.676057
485	165	AP-REQ-PP2-L4	\N	\N	\N	SUBMITTED	2026-09-08 04:38:49.683981
486	165	AP-REQ-PP2-L5	\N	\N	\N	SUBMITTED	2026-09-08 04:38:49.694492
487	165	AP-REQ-PP2-L6	\N	\N	\N	SUBMITTED	2026-09-08 04:38:49.703955
488	165	AP-REQ-PP2-L7	\N	\N	\N	SUBMITTED	2026-09-08 04:38:49.712499
489	165	AP-REQ-PP2-L8	\N	\N	\N	SUBMITTED	2026-09-08 04:38:49.721472
490	165	AP-REQ-PP2-L9	\N	0.00	\N	SUBMITTED	2026-09-08 04:38:49.730299
491	165	AP-REQ-PP2-L10	\N	\N	\N	SUBMITTED	2026-09-08 04:38:49.740971
492	165	AP-REQ-PP2-L11	\N	0.00	\N	SUBMITTED	2026-09-08 04:38:49.749809
493	164	AP-REQ-PP1-L2	\N	90963967.00	\N	SUBMITTED	2026-09-08 04:38:49.760105
494	164	AP-REQ-PP1-L3	\N	\N	\N	SUBMITTED	2026-09-08 04:38:49.767377
495	164	AP-REQ-PP1-L4	\N	0.00	\N	SUBMITTED	2026-09-08 04:38:49.77418
496	177	AP-REQ-PP6 dự kiến-L1	\N	\N	\N	SUBMITTED	2026-09-08 04:38:49.793617
497	171	AP-REQ-PP8-L2	\N	\N	\N	SUBMITTED	2026-09-08 04:38:49.805901
498	171	AP-REQ-PP8-L3	\N	\N	\N	SUBMITTED	2026-09-08 04:38:49.81509
499	171	AP-REQ-PP8-L4	\N	0.00	\N	SUBMITTED	2026-09-08 04:38:49.82267
500	168	AP-REQ-PP5-L2	\N	\N	\N	SUBMITTED	2026-09-08 04:38:49.841261
501	168	AP-REQ-PP5-L3	\N	\N	\N	SUBMITTED	2026-09-08 04:38:49.851012
502	168	AP-REQ-PP5-L4	\N	0.00	\N	SUBMITTED	2026-09-08 04:38:49.859231
503	166	AP-REQ-PP3-L2	\N	\N	\N	SUBMITTED	2026-09-08 04:38:49.872558
504	166	AP-REQ-PP3-L3	\N	\N	\N	SUBMITTED	2026-09-08 04:38:49.881598
505	166	AP-REQ-PP3-L4	\N	0.00	\N	SUBMITTED	2026-09-08 04:38:49.890545
506	166	AP-REQ-PP3-L5	\N	0.00	\N	SUBMITTED	2026-09-08 04:38:49.897735
507	166	AP-REQ-PP3-L6	\N	\N	\N	SUBMITTED	2026-09-08 04:38:49.90684
508	166	AP-REQ-PP3-L7	\N	0.00	\N	SUBMITTED	2026-09-08 04:38:49.91495
509	167	AP-REQ-PP4-L5	\N	\N	\N	SUBMITTED	2026-09-08 04:38:49.938439
510	167	AP-REQ-PP4-L6	\N	\N	\N	SUBMITTED	2026-09-08 04:38:49.948222
511	167	AP-REQ-PP4-L7	\N	\N	\N	SUBMITTED	2026-09-08 04:38:49.95773
512	167	AP-REQ-PP4-L8	\N	\N	\N	SUBMITTED	2026-09-08 04:38:49.965774
513	167	AP-REQ-PP4-L9	\N	5600000.00	\N	SUBMITTED	2026-09-08 04:38:49.974499
514	178	AP-REQ-PP2 dự kiến-L1	\N	\N	\N	SUBMITTED	2026-09-08 04:38:49.989883
515	179	AP-REQ-PP1 dự kiến-L1	\N	\N	\N	SUBMITTED	2026-09-08 04:38:50.011209
516	180	AP-REQ-PP4 dự kiến-L1	\N	\N	\N	SUBMITTED	2026-09-08 04:38:50.059155
517	180	AP-REQ-PP4 dự kiến-L2	\N	\N	\N	SUBMITTED	2026-09-08 04:38:50.067259
518	180	AP-REQ-PP4 dự kiến-L3	\N	\N	\N	SUBMITTED	2026-09-08 04:38:50.077318
519	181	AP-REQ-Tháng 03/2019-L1	\N	\N	\N	SUBMITTED	2026-09-08 04:38:50.130825
520	182	AP-REQ-Tháng 04/2019-L1	\N	\N	\N	SUBMITTED	2026-09-08 04:38:50.142216
521	183	AP-REQ-Tháng 05/2019-L1	\N	\N	\N	SUBMITTED	2026-09-08 04:38:50.154726
522	184	AP-REQ-Tháng 06/2019-L1	\N	\N	\N	SUBMITTED	2026-09-08 04:38:50.166401
523	185	AP-REQ-Tháng 07/2019-L1	\N	\N	\N	SUBMITTED	2026-09-08 04:38:50.178267
524	186	AP-REQ-Tháng 08/2019-L1	\N	\N	\N	SUBMITTED	2026-09-08 04:38:50.189306
525	187	AP-REQ-Tháng 09/2019-L1	\N	\N	\N	SUBMITTED	2026-09-08 04:38:50.199618
526	188	AP-REQ-Tháng 10/2019-L1	\N	\N	\N	SUBMITTED	2026-09-08 04:38:50.212612
527	189	AP-REQ-Tháng 11/2019-L1	\N	\N	\N	SUBMITTED	2026-09-08 04:38:50.224687
528	190	AP-REQ-Tháng 12/2019-L1	\N	\N	\N	SUBMITTED	2026-09-08 04:38:50.236146
529	191	AP-REQ-Tháng 01/2020-L1	\N	\N	\N	SUBMITTED	2026-09-08 04:38:50.248311
530	191	AP-REQ-Tháng 01/2020-L2	\N	\N	\N	SUBMITTED	2026-09-08 04:38:50.25698
531	191	AP-REQ-Tháng 01/2020-L3	\N	25584843006.30	\N	SUBMITTED	2026-09-08 04:38:50.266496
532	191	AP-REQ-Tháng 01/2020-L4	\N	\N	\N	SUBMITTED	2026-09-08 04:38:50.275399
533	192	AP-REQ-IPC1 - thanh toán đợt 1-L1	\N	2001281184.10	\N	SUBMITTED	2026-09-08 04:38:50.286622
534	193	AP-REQ-IPC2 - thanh toán đợt 2-L1	\N	1629563003.20	\N	SUBMITTED	2026-09-08 04:38:50.308024
535	194	AP-REQ-IPC3 - thanh toán đợt 3-L1	\N	4355135075.50	\N	SUBMITTED	2026-09-08 04:38:50.32588
536	195	AP-REQ-IPC4 - thanh toán đợt 4-L1	\N	5268314371.10	\N	SUBMITTED	2026-09-08 04:38:50.342749
537	196	AP-REQ-IPC5 - thanh toán đợt 5-L1	\N	847710047.00	\N	SUBMITTED	2026-09-08 04:38:50.36068
538	197	AP-REQ-IPC6 - thanh toán đợt 6-L1	\N	6567935725.00	\N	SUBMITTED	2026-09-08 04:38:50.373971
539	198	AP-REQ-IPC7 - thanh toán đợt 7-L1	\N	3699401495.00	\N	SUBMITTED	2026-09-08 04:38:50.388046
540	199	AP-REQ-IPC8 - thanh toán đợt 8-L1	\N	4089412960.00	\N	SUBMITTED	2026-09-08 04:38:50.401967
541	199	AP-REQ-IPC8 - thanh toán đợt 8-L2	\N	28458753860.90	\N	SUBMITTED	2026-09-08 04:38:50.410683
294	123	HBG-BTE-YCVT-PPR-01	\N	128770399.00	\N	SUBMITTED	2026-09-08 04:38:47.650602
295	123	HBG-YCVT-BT-PLB -02	\N	88015038.00	\N	SUBMITTED	2026-09-08 04:38:47.667664
296	123	HBG-YCVT-BT-PLB -03	\N	106227528.00	\N	SUBMITTED	2026-09-08 04:38:47.677007
297	123	HBG-YCVT-BT-PLB -04	\N	91009908.00	\N	SUBMITTED	2026-09-08 04:38:47.687546
298	123	HBG-YCVT-BT-PLB -05	\N	13684414.00	\N	SUBMITTED	2026-09-08 04:38:47.696088
299	123	HBG-YCVT-BT-PLB -06	\N	57270336.00	\N	SUBMITTED	2026-09-08 04:38:47.705672
300	123	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB--001-L7	\N	\N	\N	SUBMITTED	2026-09-08 04:38:47.714778
301	124	HBG-BTE-YCVT-uPVC-01	\N	382610197.00	\N	SUBMITTED	2026-09-08 04:38:47.726335
302	124	HBG-BTE-YCVT-uPVC-02	\N	263146704.00	\N	SUBMITTED	2026-09-08 04:38:47.736861
303	124	HBG-BTE-YCVT-BT-PLB-0.3	\N	78214675.00	\N	SUBMITTED	2026-09-08 04:38:47.746351
304	124	HBG-BTE-YCVT-BT-PLB-0.4	\N	113968411.00	\N	SUBMITTED	2026-09-08 04:38:47.754392
305	124	HBG-BTE-YCVT-BT-PLB-0.5	\N	109025360.00	\N	SUBMITTED	2026-09-08 04:38:47.762379
306	124	HBG-BTE-YCVT-BT-PLB-0.6	\N	110852243.00	\N	SUBMITTED	2026-09-08 04:38:47.771229
307	125	HBG-BTE-YCVT-HDPE-01	\N	809883157.00	\N	SUBMITTED	2026-09-08 04:38:47.782869
308	125	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB--003-L2	\N	0.00	\N	SUBMITTED	2026-09-08 04:38:47.790955
309	125	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB--003-L3	\N	67063545.00	\N	SUBMITTED	2026-09-08 04:38:47.800653
310	125	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB--003-L4	\N	0.00	\N	SUBMITTED	2026-09-08 04:38:47.808881
311	125	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB--003-L5	\N	4812842.00	\N	SUBMITTED	2026-09-08 04:38:47.817587
312	125	HBG-BTE-YCVT-HDPE-02	\N	270751324.00	\N	SUBMITTED	2026-09-08 04:38:47.825545
313	125	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB--003-L7	\N	22098680.00	\N	SUBMITTED	2026-09-08 04:38:47.834664
314	125	HBG-BTE-YCVT-HDPE-03	\N	494775093.00	\N	SUBMITTED	2026-09-08 04:38:47.842634
315	125	HBG-BTE-YCVT-HDPE-04	\N	32206360.00	\N	SUBMITTED	2026-09-08 04:38:47.851195
316	125	HBG-BTE-YCVT-HDPE-05	\N	197788345.00	\N	SUBMITTED	2026-09-08 04:38:47.859323
317	126	HBG-BTE-YCVT-IN-01	\N	193476800.00	\N	SUBMITTED	2026-09-08 04:38:47.869911
318	126	HBG-BTE-YCVT-IN-02	\N	0.00	\N	SUBMITTED	2026-09-08 04:38:47.877255
319	127	HBG-BTE-YCVT-PLB-VL-01	\N	879381800.00	\N	SUBMITTED	2026-09-08 04:38:47.891225
320	127	HBG-BTE-YCVT-PLB-	\N	224968328.00	\N	SUBMITTED	2026-09-08 04:38:47.899627
321	127	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB--014-LToàn dự án	\N	213154700.00	\N	SUBMITTED	2026-09-08 04:38:47.908459
322	127	RQ-MEP-BTE-HB-01	\N	23583000.00	\N	SUBMITTED	2026-09-08 04:38:47.923438
323	128	HBG-BTE-YCVT-PLB-Pp-01	\N	662860000.00	\N	SUBMITTED	2026-09-08 04:38:47.93694
324	128	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB--011-L2	\N	1402478000.00	\N	SUBMITTED	2026-09-08 04:38:47.946996
325	129	HBG-BTE-YCVT-ISL-01	\N	0.00	\N	SUBMITTED	2026-09-08 04:38:47.958822
326	129	HBG-BTE-YCVT-ISL-02	\N	0.00	\N	SUBMITTED	2026-09-08 04:38:47.968418
327	129	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-015-LToàn dự án	\N	0.00	\N	SUBMITTED	2026-09-08 04:38:47.978324
328	129	HBG-BTE-YCVT-ISL-03	\N	45293908.00	\N	SUBMITTED	2026-09-08 04:38:47.988407
329	130	HBG-BTE-YCVT-PLB-WM-01	\N	96376500.00	\N	SUBMITTED	2026-09-08 04:38:48.000019
330	131	HBG-BTE-YCVT-HP-01	\N	\N	\N	SUBMITTED	2026-09-08 04:38:48.011735
331	131	Đợt 1	\N	418018000.00	\N	SUBMITTED	2026-09-08 04:38:48.020319
332	131	Đợt 2	\N	527594000.00	\N	SUBMITTED	2026-09-08 04:38:48.030025
333	131	Đợt 3	\N	22404000.00	\N	SUBMITTED	2026-09-08 04:38:48.03994
334	132	HBG-BTE-YCVT-PLB-TS-01	\N	16860342.00	\N	SUBMITTED	2026-09-08 04:38:48.054217
335	132	HBG-BTE-YCVT-PLB-TS-	\N	54102500.00	\N	SUBMITTED	2026-09-08 04:38:48.063574
336	132	RQ-BTE-BTE-FD-02	\N	97286323.00	\N	SUBMITTED	2026-09-08 04:38:48.073161
337	132	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-027-L5	\N	\N	\N	SUBMITTED	2026-09-08 04:38:48.087676
338	133	HBG-BTE-YCVT-BCB-01	\N	0.00	\N	SUBMITTED	2026-09-08 04:38:48.099911
339	134	RQ-BTE-BTE-FCO-01	\N	35244000.00	\N	SUBMITTED	2026-09-08 04:38:48.112271
340	134	RQ-BTE-BTE-FCO-02	\N	11253000.00	\N	SUBMITTED	2026-09-08 04:38:48.122077
341	135	HBG-BTE-YCVT-PLB-LHG-01	\N	948365000.00	\N	SUBMITTED	2026-09-08 04:38:48.135681
342	135	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-031-L2	\N	0.00	\N	SUBMITTED	2026-09-08 04:38:48.144593
343	135	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-031-L3	\N	252159250.00	\N	SUBMITTED	2026-09-08 04:38:48.152665
344	135	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-031-LHạ tầng + Lobby	\N	17681400.00	\N	SUBMITTED	2026-09-08 04:38:48.161756
345	135	RQ-BTE-BTE-PLB-	\N	15690400.00	\N	SUBMITTED	2026-09-08 04:38:48.172603
346	136	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-013-L1	\N	2961750000.00	\N	SUBMITTED	2026-09-08 04:38:48.183984
347	136	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-013-L2	\N	97680101.00	\N	SUBMITTED	2026-09-08 04:38:48.193021
348	136	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-013-L3	\N	\N	\N	SUBMITTED	2026-09-08 04:38:48.201155
349	136	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-013-L4	\N	\N	\N	SUBMITTED	2026-09-08 04:38:48.210243
350	136	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-013-L5	\N	\N	\N	SUBMITTED	2026-09-08 04:38:48.21939
351	136	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-013-L6	\N	\N	\N	SUBMITTED	2026-09-08 04:38:48.228186
352	136	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-013-L7	\N	\N	\N	SUBMITTED	2026-09-08 04:38:48.236828
353	136	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-013-L8	\N	\N	\N	SUBMITTED	2026-09-08 04:38:48.245151
354	136	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-013-L9	\N	\N	\N	SUBMITTED	2026-09-08 04:38:48.252895
355	136	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-013-L10	\N	\N	\N	SUBMITTED	2026-09-08 04:38:48.260945
356	136	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-013-L11	\N	\N	\N	SUBMITTED	2026-09-08 04:38:48.269306
357	136	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-013-L12	\N	\N	\N	SUBMITTED	2026-09-08 04:38:48.277148
358	136	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-013-L13	\N	\N	\N	SUBMITTED	2026-09-08 04:38:48.285273
359	136	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-013-L14	\N	\N	\N	SUBMITTED	2026-09-08 04:38:48.292831
360	137	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-014-L1	\N	165000000.00	\N	SUBMITTED	2026-09-08 04:38:48.305641
361	137	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-014-L2	\N	\N	\N	SUBMITTED	2026-09-08 04:38:48.314102
362	137	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-014-L3	\N	\N	\N	SUBMITTED	2026-09-08 04:38:48.322299
363	137	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-014-L4	\N	\N	\N	SUBMITTED	2026-09-08 04:38:48.329945
364	137	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-014-L5	\N	\N	\N	SUBMITTED	2026-09-08 04:38:48.337519
365	137	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-014-L6	\N	\N	\N	SUBMITTED	2026-09-08 04:38:48.344379
366	137	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-014-L7	\N	\N	\N	SUBMITTED	2026-09-08 04:38:48.353271
367	137	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-014-L8	\N	\N	\N	SUBMITTED	2026-09-08 04:38:48.362039
368	137	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-014-L9	\N	\N	\N	SUBMITTED	2026-09-08 04:38:48.369819
369	137	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-014-L10	\N	\N	\N	SUBMITTED	2026-09-08 04:38:48.378643
370	137	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-014-L11	\N	85000000.00	\N	SUBMITTED	2026-09-08 04:38:48.387252
371	137	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-014-L12	\N	160000000.00	\N	SUBMITTED	2026-09-08 04:38:48.396961
372	137	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-014-L13	\N	70000000.00	\N	SUBMITTED	2026-09-08 04:38:48.406107
373	137	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-014-L14	\N	41800000.00	\N	SUBMITTED	2026-09-08 04:38:48.415023
374	137	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-014-L15	\N	98329000.00	\N	SUBMITTED	2026-09-08 04:38:48.423299
375	137	RQ-MEP-BTE-HĐH-01	\N	25872000.00	\N	SUBMITTED	2026-09-08 04:38:48.431693
376	132	HBG-BTE-YCVT-HVAC--003	\N	34100000.00	\N	SUBMITTED	2026-09-08 04:38:48.440255
377	132	HBG-BTE-YCVT-HVAC--13	\N	243642300.00	\N	SUBMITTED	2026-09-08 04:38:48.449083
378	132	HBG-BTE-YCVT-HVAC-035	\N	4095740.00	\N	SUBMITTED	2026-09-08 04:38:48.460195
379	132	HBG-BTE-YCVT-HVAC-036	\N	27238200.00	\N	SUBMITTED	2026-09-08 04:38:48.468866
380	132	HBG-BTE-YCVT-HVAC-037	\N	4273940.00	\N	SUBMITTED	2026-09-08 04:38:48.477654
381	129	HBG-BTE-YCVT-HVAC--04	\N	126323439.00	\N	SUBMITTED	2026-09-08 04:38:48.487541
382	129	HBG-BTE-YCVT-HVAC--016	\N	624465305.00	\N	SUBMITTED	2026-09-08 04:38:48.496192
383	129	AP-REQ-BTE-WP4-HBC-MAA-MEP-HVAC-005-L3	\N	383434700.00	\N	SUBMITTED	2026-09-08 04:38:48.503939
384	129	HBG-BTE-YCVT-HVAC-	\N	148031517.00	\N	SUBMITTED	2026-09-08 04:38:48.515557
385	138	Đặt hàng cùng YCVT cấp	\N	0.00	\N	SUBMITTED	2026-09-08 04:38:48.530524
386	138	AP-REQ-BTE-WP4-HBC-MAA-MEP-HVAC-007-L2	\N	0.00	\N	SUBMITTED	2026-09-08 04:38:48.540935
387	139	HBG-BTE-YCVT-HVAC-001	\N	29976613.00	\N	SUBMITTED	2026-09-08 04:38:48.554816
388	139	AP-REQ-BTE-WP4-HBC-MAA-MEP-HVAC-004-LKL Hợp Đồng	\N	82487417.00	\N	SUBMITTED	2026-09-08 04:38:48.563365
389	139	HBG-BTE-YCVT-HVAC-	\N	0.00	\N	SUBMITTED	2026-09-08 04:38:48.572554
390	139	AP-REQ-BTE-WP4-HBC-MAA-MEP-HVAC-004-LLoby+ CLU+ BOH	\N	85920652.00	\N	SUBMITTED	2026-09-08 04:38:48.581435
391	139	AP-REQ-BTE-WP4-HBC-MAA-MEP-HVAC-004-LBOH	\N	31790793.00	\N	SUBMITTED	2026-09-08 04:38:48.589864
392	139	AP-REQ-BTE-WP4-HBC-MAA-MEP-HVAC-004-LLoby+BOH	\N	342534293.00	\N	SUBMITTED	2026-09-08 04:38:48.598329
393	139	PL01	\N	0.00	\N	SUBMITTED	2026-09-08 04:38:48.609868
394	132	HBG-BTE-YCVT-HVAC--05	\N	7640600.00	\N	SUBMITTED	2026-09-08 04:38:48.632725
395	132	HBG-BTE-YCVT-HVAC--014	\N	25456200.00	\N	SUBMITTED	2026-09-08 04:38:48.64019
396	132	HBG-YCVT-BTE-HVAC&PL-	\N	48554000.00	\N	SUBMITTED	2026-09-08 04:38:48.646826
397	140	HBG-BTE-YCVT-HVAC--001	\N	503800000.00	\N	SUBMITTED	2026-09-08 04:38:48.665735
398	140	HBG-BTE-YCVT-HVAC--8	\N	\N	\N	SUBMITTED	2026-09-08 04:38:48.673245
399	140	HBG-BTE-YCVT-HVAC--9	\N	53977550.00	\N	SUBMITTED	2026-09-08 04:38:48.685541
400	140	AP-REQ-BTE-WP4-HBC-MAA-MEP-HVAC-007-LCăn Mẫu	\N	0.00	\N	SUBMITTED	2026-09-08 04:38:48.694578
401	140	AP-REQ-BTE-WP4-HBC-MAA-MEP-HVAC-007-L7	\N	77480000.00	\N	SUBMITTED	2026-09-08 04:38:48.703102
402	140	AP-REQ-BTE-WP4-HBC-MAA-MEP-HVAC-007-L8	\N	21024000.00	\N	SUBMITTED	2026-09-08 04:38:48.712272
403	140	HBG-BTE-YCVT-HVAC-	\N	32750300.00	\N	SUBMITTED	2026-09-08 04:38:48.721996
404	141	HBG-BTE-YCVT-HVAC--12	\N	104876200.00	\N	SUBMITTED	2026-09-08 04:38:48.73647
405	142	HBG-BTE-YCVT-HVAC--10	\N	0.00	\N	SUBMITTED	2026-09-08 04:38:48.74859
406	142	HBG-BTE-YCVT-HVAC--017	\N	52811124.00	\N	SUBMITTED	2026-09-08 04:38:48.756244
407	142	HBG-BTE-YCVT-HVAC--018	\N	44163900.00	\N	SUBMITTED	2026-09-08 04:38:48.764705
408	142	HBG-BTE-YCVT-HVAC--019	\N	124600000.00	\N	SUBMITTED	2026-09-08 04:38:48.772271
409	143	HBG-BTE-YCVT-HVAC--002	\N	83695887.00	\N	SUBMITTED	2026-09-08 04:38:48.783477
410	143	HBG-BTE-YCVT-HVAC-	\N	107958400.00	\N	SUBMITTED	2026-09-08 04:38:48.792608
411	143	AP-REQ-BTE-WP4-HBC-MAA-MEP-HVAC-0010 Van gió cửa gió-L6	\N	0.00	\N	SUBMITTED	2026-09-08 04:38:48.807399
412	144	AP-REQ-BTE-WP4-HBC-MAA-MEP-HVAC-0011 Ống luồn dây-LCăn mẫu	\N	\N	\N	SUBMITTED	2026-09-08 04:38:48.818345
413	144	HBG-BTE-YCVT-HVAC--017	\N	16903781.00	\N	SUBMITTED	2026-09-08 04:38:48.827031
414	144	HBG-YCVT-BTE-HVAC&PL-	\N	35263124.00	\N	SUBMITTED	2026-09-08 04:38:48.836798
415	144	AP-REQ-BTE-WP4-HBC-MAA-MEP-HVAC-0011 Ống luồn dây-L4	\N	\N	\N	SUBMITTED	2026-09-08 04:38:48.846585
416	145	AP-REQ-BTE-WP4-HBC-MAA-MEP-HVAC-0012 Tiêu âm-L1	\N	495000000.00	\N	SUBMITTED	2026-09-08 04:38:48.857843
417	146	HBG-BTE-YCVT-HVAC--15	\N	221602462.00	\N	SUBMITTED	2026-09-08 04:38:48.868273
418	146	HBG-BTE-YCVT-HVAC-	\N	19986120.00	\N	SUBMITTED	2026-09-08 04:38:48.876626
419	146	AP-REQ-BTE-WP4-HBC-MAA-MEP-HVAC-0012-L4	\N	\N	\N	SUBMITTED	2026-09-08 04:38:48.887366
420	146	HBG-YCVT-BTE-HVAC&PL-	\N	33660000.00	\N	SUBMITTED	2026-09-08 04:38:48.89904
421	147	AP-REQ-WWTP-135M3/DAY-L1	\N	\N	\N	SUBMITTED	2026-09-08 04:38:48.909759
422	148	AP-REQ-BTE-WP4-HBC-MAA-MEP-WT-001-L1	\N	\N	\N	SUBMITTED	2026-09-08 04:38:48.920871
423	149	AP-REQ-BTE-WP4-HBC-MAA-MEP-WT-002-L1	\N	\N	\N	SUBMITTED	2026-09-08 04:38:48.933523
424	150	AP-REQ-BTE-WP4-HBC-MAA-MEP-WT-003-L1	\N	\N	\N	SUBMITTED	2026-09-08 04:38:48.945733
425	151	AP-REQ-BTE-WP4-HBC-MAA-MEP-WT-004-L1	\N	\N	\N	SUBMITTED	2026-09-08 04:38:48.958325
426	152	AP-REQ-BTE-WP4-HBC-MAA-MEP-WT-005-L1	\N	\N	\N	SUBMITTED	2026-09-08 04:38:48.969186
427	153	AP-REQ-BTE-WP4-HBC-MAA-MEP-WT-007-L1	\N	\N	\N	SUBMITTED	2026-09-08 04:38:48.990143
428	154	AP-REQ-BTE-WP4-HBC-MAA-MEP-WT-008-L1	\N	\N	\N	SUBMITTED	2026-09-08 04:38:49.013762
429	155	AP-REQ-BTE-WP4-HBC-MAA-MEP-WT-009-L1	\N	\N	\N	SUBMITTED	2026-09-08 04:38:49.032285
430	156	AP-REQ-BTE-WP4-HBC-MAA-MEP-WT-010-L1	\N	\N	\N	SUBMITTED	2026-09-08 04:38:49.049829
431	157	AP-REQ-BTE-WP4-HBC-MAA-MEP-WT-011-L1	\N	\N	\N	SUBMITTED	2026-09-08 04:38:49.063316
432	158	AP-REQ-WWTP-60M3/DAY-L1	\N	\N	\N	SUBMITTED	2026-09-08 04:38:49.074695
433	159	AP-REQ-BTE-WP4-HBC-MAA-MEP-WWTP-001-L1	\N	267740000.00	\N	SUBMITTED	2026-09-08 04:38:49.09151
434	160	AP-REQ-BTE-WP4-HBC-MAA-MEP-WWTP-002-L1	\N	40644153.00	\N	SUBMITTED	2026-09-08 04:38:49.106511
435	161	HBG-YCVT-BTE-PLB-	\N	194725300.00	\N	SUBMITTED	2026-09-08 04:38:49.123267
436	162	AP-REQ-BTE-WP4-HBC-MAA-MEP-WWTP-004-L1	\N	1180000.00	\N	SUBMITTED	2026-09-08 04:38:49.137904
437	162	HBG-YCVT-BTE-HVAC&PL-	\N	11299200.00	\N	SUBMITTED	2026-09-08 04:38:49.148041
438	162	HBG-YCVT-BTE-PLB-	\N	12754874.00	\N	SUBMITTED	2026-09-08 04:38:49.157191
439	162	AP-REQ-BTE-WP4-HBC-MAA-MEP-WWTP-004-L4	\N	11275000.00	\N	SUBMITTED	2026-09-08 04:38:49.166071
440	162	AP-REQ-BTE-WP4-HBC-MAA-MEP-WWTP-004-L5	\N	4000000.00	\N	SUBMITTED	2026-09-08 04:38:49.175732
441	163	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L1	\N	48739000.00	\N	SUBMITTED	2026-09-08 04:38:49.188763
442	163	HBG-YCVT-BT-PLB&HVAC-001	\N	192225224.00	\N	SUBMITTED	2026-09-08 04:38:49.199087
443	163	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L3	\N	47383721.00	\N	SUBMITTED	2026-09-08 04:38:49.207232
444	163	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L4	\N	132098501.00	\N	SUBMITTED	2026-09-08 04:38:49.214885
445	163	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L5	\N	194434588.00	\N	SUBMITTED	2026-09-08 04:38:49.222306
446	163	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L7	\N	32630400.00	\N	SUBMITTED	2026-09-08 04:38:49.232387
447	163	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L8	\N	56115400.00	\N	SUBMITTED	2026-09-08 04:38:49.241274
448	163	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L10	\N	84768420.00	\N	SUBMITTED	2026-09-08 04:38:49.251445
449	163	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L11	\N	146612438.00	\N	SUBMITTED	2026-09-08 04:38:49.261755
450	163	HBG-YCVT-BT-PLB&HVAC-024	\N	15115320.00	\N	SUBMITTED	2026-09-08 04:38:49.271993
451	163	HBG-YCVT-BT-PLB	\N	25236200.00	\N	SUBMITTED	2026-09-08 04:38:49.280725
452	163	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L14	\N	26034800.00	\N	SUBMITTED	2026-09-08 04:38:49.288244
453	163	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L19	\N	44740080.00	\N	SUBMITTED	2026-09-08 04:38:49.302307
454	163	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L20	\N	15080000.00	\N	SUBMITTED	2026-09-08 04:38:49.311291
455	163	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L2	\N	35490000.00	\N	SUBMITTED	2026-09-08 04:38:49.321691
456	163	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L6	\N	89230000.00	\N	SUBMITTED	2026-09-08 04:38:49.336976
457	163	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L9	\N	45815000.00	\N	SUBMITTED	2026-09-08 04:38:49.34924
458	163	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L12	\N	8880000.00	\N	SUBMITTED	2026-09-08 04:38:49.362675
459	163	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L13	\N	20000000.00	\N	SUBMITTED	2026-09-08 04:38:49.371632
460	163	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L43	\N	0.00	\N	SUBMITTED	2026-09-08 04:38:49.396173
461	163	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L44	\N	0.00	\N	SUBMITTED	2026-09-08 04:38:49.403906
462	164	AP-REQ-PP1-L1	\N	22443750.00	\N	SUBMITTED	2026-09-08 04:38:49.417026
463	165	AP-REQ-PP2-L1	\N	28492450.00	\N	SUBMITTED	2026-09-08 04:38:49.429973
464	166	AP-REQ-PP3-L1	\N	32090450.00	\N	SUBMITTED	2026-09-08 04:38:49.443999
465	167	AP-REQ-PP4-L1	\N	32651500.00	\N	SUBMITTED	2026-09-08 04:38:49.45591
466	168	AP-REQ-PP5-L1	\N	15194690.00	\N	SUBMITTED	2026-09-08 04:38:49.468313
467	169	AP-REQ-PP6-L1	\N	2653537.00	\N	SUBMITTED	2026-09-08 04:38:49.47857
468	170	AP-REQ-PP7-L1	\N	10449063.00	\N	SUBMITTED	2026-09-08 04:38:49.488628
469	171	AP-REQ-PP8-L1	\N	16615877.00	\N	SUBMITTED	2026-09-08 04:38:49.498921
470	172	AP-REQ-PP9-L1	\N	16615877.00	\N	SUBMITTED	2026-09-08 04:38:49.512795
471	173	AP-REQ-PP10-L1	\N	17533250.00	\N	SUBMITTED	2026-09-08 04:38:49.524216
472	174	AP-REQ-PP11-L1	\N	25850550.00	\N	SUBMITTED	2026-09-08 04:38:49.536343
473	175	AP-REQ-PP12-L1	\N	22449900.00	\N	SUBMITTED	2026-09-08 04:38:49.549772
474	176	AP-REQ-PP13-L1	\N	\N	\N	SUBMITTED	2026-09-08 04:38:49.563461
475	176	AP-REQ-PP13-L2	\N	0.00	\N	SUBMITTED	2026-09-08 04:38:49.572364
476	176	AP-REQ-PP13-L3	\N	0.00	\N	SUBMITTED	2026-09-08 04:38:49.582123
477	169	AP-REQ-PP6-L2	\N	\N	\N	SUBMITTED	2026-09-08 04:38:49.603603
\.

-- payment_requests — dự án BTE-WP4-HBC
-- Sinh bởi scripts/export-demo-seed.mjs. Nạp bằng: node scripts/load-demo-seed.mjs
-- Ngày giữ nguyên theo hồ sơ gốc; `npm run setup` gọi rebase-demo-dates.mjs để neo về ngày chạy.
COPY payment_requests ("id", "invoice_id", "request_no", "request_date", "amount", "retention_amount", "due_date", "status", "approved_by", "approved_date", "notes", "created_at", "retention_status", "retention_due_date", "retention_released_amount", "retention_released_at", "retention_released_by") FROM stdin;
325	301	HBG-BTE-YCVT-uPVC-01	\N	382610197.00	0.00	2026-03-30	APPROVED	1	2026-09-08	imported: supplier-AP	2026-09-08 04:38:47.730732	NOT_APPLICABLE	\N	0.00	\N	\N
318	294	HBG-BTE-YCVT-PPR-01	\N	128770399.00	0.00	2026-06-10	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:47.659933	NOT_APPLICABLE	\N	0.00	\N	\N
418	394	HBG-BTE-YCVT-HVAC--05	2026-04-20	7640600.00	0.00	2026-04-20	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.636057	NOT_APPLICABLE	\N	0.00	\N	\N
430	406	HBG-BTE-YCVT-HVAC--017	2026-05-16	52811124.00	0.00	2026-05-16	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.760198	NOT_APPLICABLE	\N	0.00	\N	\N
486	462	AP-REQ-PP1-L1	2026-05-23	22443750.00	0.00	2026-06-02	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.421903	NOT_APPLICABLE	\N	0.00	\N	\N
369	345	RQ-BTE-BTE-PLB-	\N	15690400.00	0.00	2026-11-20	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.176361	NOT_APPLICABLE	\N	0.00	\N	\N
333	309	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB--003-L3	\N	67063545.00	0.00	2026-03-30	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:47.804236	NOT_APPLICABLE	\N	0.00	\N	\N
460	436	AP-REQ-BTE-WP4-HBC-MAA-MEP-WWTP-004-L1	2026-06-25	1180000.00	0.00	2026-06-25	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.142643	NOT_APPLICABLE	\N	0.00	\N	\N
461	437	HBG-YCVT-BTE-HVAC&PL-	\N	11299200.00	0.00	2026-11-04	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.152347	NOT_APPLICABLE	\N	0.00	\N	\N
441	417	HBG-BTE-YCVT-HVAC--15	2026-06-30	221602462.00	0.00	2026-08-14	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.871694	NOT_APPLICABLE	\N	0.00	\N	\N
494	470	AP-REQ-PP9-L1	2026-10-08	16615877.00	0.00	2026-10-18	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.516956	NOT_APPLICABLE	\N	0.00	\N	\N
414	390	AP-REQ-BTE-WP4-HBC-MAA-MEP-HVAC-004-LLoby+ CLU+ BOH	2026-06-30	85920652.00	0.00	2026-07-30	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.585045	NOT_APPLICABLE	\N	0.00	\N	\N
335	311	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB--003-L5	\N	4812842.00	0.00	2026-08-11	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:47.821228	NOT_APPLICABLE	\N	0.00	\N	\N
444	420	HBG-YCVT-BTE-HVAC&PL-	2026-09-20	33660000.00	0.00	2026-10-20	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.902661	NOT_APPLICABLE	\N	0.00	\N	\N
471	447	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L8	2026-06-02	56115400.00	0.00	2026-07-03	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.245004	NOT_APPLICABLE	\N	0.00	\N	\N
322	298	HBG-YCVT-BT-PLB -05	\N	13684414.00	0.00	2026-11-06	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:47.700081	NOT_APPLICABLE	\N	0.00	\N	\N
492	468	AP-REQ-PP7-L1	2026-08-23	10449063.00	0.00	2026-09-04	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.492007	NOT_APPLICABLE	\N	0.00	\N	\N
323	299	HBG-YCVT-BT-PLB -06	\N	57270336.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:47.710034	NOT_APPLICABLE	\N	0.00	\N	\N
324	300	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB--001-L7	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:47.718877	NOT_APPLICABLE	\N	0.00	\N	\N
330	306	HBG-BTE-YCVT-BT-PLB-0.6	\N	110852243.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:47.775112	NOT_APPLICABLE	\N	0.00	\N	\N
332	308	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB--003-L2	\N	0.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:47.79513	NOT_APPLICABLE	\N	0.00	\N	\N
334	310	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB--003-L4	\N	0.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:47.813009	NOT_APPLICABLE	\N	0.00	\N	\N
342	318	HBG-BTE-YCVT-IN-02	\N	0.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:47.882167	NOT_APPLICABLE	\N	0.00	\N	\N
344	320	HBG-BTE-YCVT-PLB-	\N	224968328.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:47.903204	NOT_APPLICABLE	\N	0.00	\N	\N
346	322	RQ-MEP-BTE-HB-01	\N	23583000.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:47.927939	NOT_APPLICABLE	\N	0.00	\N	\N
349	325	HBG-BTE-YCVT-ISL-01	\N	0.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:47.962928	NOT_APPLICABLE	\N	0.00	\N	\N
350	326	HBG-BTE-YCVT-ISL-02	\N	0.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:47.973179	NOT_APPLICABLE	\N	0.00	\N	\N
351	327	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-015-LToàn dự án	\N	0.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:47.982698	NOT_APPLICABLE	\N	0.00	\N	\N
352	328	HBG-BTE-YCVT-ISL-03	\N	45293908.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:47.992592	NOT_APPLICABLE	\N	0.00	\N	\N
354	330	HBG-BTE-YCVT-HP-01	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.015654	NOT_APPLICABLE	\N	0.00	\N	\N
357	333	Đợt 3	\N	22404000.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.04414	NOT_APPLICABLE	\N	0.00	\N	\N
360	336	RQ-BTE-BTE-FD-02	\N	97286323.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.079618	NOT_APPLICABLE	\N	0.00	\N	\N
361	337	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-027-L5	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.092472	NOT_APPLICABLE	\N	0.00	\N	\N
362	338	HBG-BTE-YCVT-BCB-01	\N	0.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.104027	NOT_APPLICABLE	\N	0.00	\N	\N
366	342	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-031-L2	\N	0.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.148508	NOT_APPLICABLE	\N	0.00	\N	\N
370	346	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-013-L1	\N	2961750000.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.188688	NOT_APPLICABLE	\N	0.00	\N	\N
371	347	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-013-L2	\N	97680101.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.196511	NOT_APPLICABLE	\N	0.00	\N	\N
372	348	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-013-L3	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.205471	NOT_APPLICABLE	\N	0.00	\N	\N
373	349	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-013-L4	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.214418	NOT_APPLICABLE	\N	0.00	\N	\N
374	350	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-013-L5	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.223442	NOT_APPLICABLE	\N	0.00	\N	\N
375	351	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-013-L6	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.232348	NOT_APPLICABLE	\N	0.00	\N	\N
376	352	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-013-L7	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.24073	NOT_APPLICABLE	\N	0.00	\N	\N
377	353	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-013-L8	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.248971	NOT_APPLICABLE	\N	0.00	\N	\N
378	354	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-013-L9	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.256642	NOT_APPLICABLE	\N	0.00	\N	\N
379	355	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-013-L10	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.265124	NOT_APPLICABLE	\N	0.00	\N	\N
380	356	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-013-L11	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.272646	NOT_APPLICABLE	\N	0.00	\N	\N
381	357	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-013-L12	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.280981	NOT_APPLICABLE	\N	0.00	\N	\N
382	358	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-013-L13	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.288502	NOT_APPLICABLE	\N	0.00	\N	\N
383	359	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-013-L14	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.296524	NOT_APPLICABLE	\N	0.00	\N	\N
338	314	HBG-BTE-YCVT-HDPE-03	\N	494775093.00	0.00	2026-07-31	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:47.847014	NOT_APPLICABLE	\N	0.00	\N	\N
384	360	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-014-L1	\N	165000000.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.30946	NOT_APPLICABLE	\N	0.00	\N	\N
385	361	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-014-L2	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.318416	NOT_APPLICABLE	\N	0.00	\N	\N
386	362	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-014-L3	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.325674	NOT_APPLICABLE	\N	0.00	\N	\N
387	363	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-014-L4	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.333459	NOT_APPLICABLE	\N	0.00	\N	\N
388	364	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-014-L5	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.34069	NOT_APPLICABLE	\N	0.00	\N	\N
389	365	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-014-L6	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.348144	NOT_APPLICABLE	\N	0.00	\N	\N
390	366	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-014-L7	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.357315	NOT_APPLICABLE	\N	0.00	\N	\N
391	367	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-014-L8	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.365686	NOT_APPLICABLE	\N	0.00	\N	\N
392	368	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-014-L9	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.373569	NOT_APPLICABLE	\N	0.00	\N	\N
393	369	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-014-L10	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.382602	NOT_APPLICABLE	\N	0.00	\N	\N
394	370	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-014-L11	\N	85000000.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.391648	NOT_APPLICABLE	\N	0.00	\N	\N
395	371	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-014-L12	\N	160000000.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.400803	NOT_APPLICABLE	\N	0.00	\N	\N
396	372	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-014-L13	\N	70000000.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.410095	NOT_APPLICABLE	\N	0.00	\N	\N
397	373	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-014-L14	\N	41800000.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.418546	NOT_APPLICABLE	\N	0.00	\N	\N
398	374	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-014-L15	\N	98329000.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.426973	NOT_APPLICABLE	\N	0.00	\N	\N
399	375	RQ-MEP-BTE-HĐH-01	\N	25872000.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.435689	NOT_APPLICABLE	\N	0.00	\N	\N
403	379	HBG-BTE-YCVT-HVAC-036	\N	27238200.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.472764	NOT_APPLICABLE	\N	0.00	\N	\N
404	380	HBG-BTE-YCVT-HVAC-037	\N	4273940.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.482533	NOT_APPLICABLE	\N	0.00	\N	\N
409	385	Đặt hàng cùng YCVT cấp	\N	0.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.535229	NOT_APPLICABLE	\N	0.00	\N	\N
410	386	AP-REQ-BTE-WP4-HBC-MAA-MEP-HVAC-007-L2	\N	0.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.545503	NOT_APPLICABLE	\N	0.00	\N	\N
411	387	HBG-BTE-YCVT-HVAC-001	\N	29976613.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.55871	NOT_APPLICABLE	\N	0.00	\N	\N
412	388	AP-REQ-BTE-WP4-HBC-MAA-MEP-HVAC-004-LKL Hợp Đồng	\N	82487417.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.567695	NOT_APPLICABLE	\N	0.00	\N	\N
413	389	HBG-BTE-YCVT-HVAC-	\N	0.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.576774	NOT_APPLICABLE	\N	0.00	\N	\N
417	393	PL01	\N	0.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.613385	NOT_APPLICABLE	\N	0.00	\N	\N
422	398	HBG-BTE-YCVT-HVAC--8	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.67668	NOT_APPLICABLE	\N	0.00	\N	\N
423	399	HBG-BTE-YCVT-HVAC--9	\N	53977550.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.689888	NOT_APPLICABLE	\N	0.00	\N	\N
424	400	AP-REQ-BTE-WP4-HBC-MAA-MEP-HVAC-007-LCăn Mẫu	\N	0.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.698709	NOT_APPLICABLE	\N	0.00	\N	\N
426	402	AP-REQ-BTE-WP4-HBC-MAA-MEP-HVAC-007-L8	\N	21024000.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.716543	NOT_APPLICABLE	\N	0.00	\N	\N
429	405	HBG-BTE-YCVT-HVAC--10	\N	0.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.75236	NOT_APPLICABLE	\N	0.00	\N	\N
432	408	HBG-BTE-YCVT-HVAC--019	\N	124600000.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.775721	NOT_APPLICABLE	\N	0.00	\N	\N
435	411	AP-REQ-BTE-WP4-HBC-MAA-MEP-HVAC-0010 Van gió cửa gió-L6	\N	0.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.811471	NOT_APPLICABLE	\N	0.00	\N	\N
436	412	AP-REQ-BTE-WP4-HBC-MAA-MEP-HVAC-0011 Ống luồn dây-LCăn mẫu	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.82229	NOT_APPLICABLE	\N	0.00	\N	\N
439	415	AP-REQ-BTE-WP4-HBC-MAA-MEP-HVAC-0011 Ống luồn dây-L4	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.850184	NOT_APPLICABLE	\N	0.00	\N	\N
440	416	AP-REQ-BTE-WP4-HBC-MAA-MEP-HVAC-0012 Tiêu âm-L1	\N	495000000.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.861425	NOT_APPLICABLE	\N	0.00	\N	\N
443	419	AP-REQ-BTE-WP4-HBC-MAA-MEP-HVAC-0012-L4	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.89144	NOT_APPLICABLE	\N	0.00	\N	\N
445	421	AP-REQ-WWTP-135M3/DAY-L1	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.912964	NOT_APPLICABLE	\N	0.00	\N	\N
446	422	AP-REQ-BTE-WP4-HBC-MAA-MEP-WT-001-L1	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.925152	NOT_APPLICABLE	\N	0.00	\N	\N
447	423	AP-REQ-BTE-WP4-HBC-MAA-MEP-WT-002-L1	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.937494	NOT_APPLICABLE	\N	0.00	\N	\N
448	424	AP-REQ-BTE-WP4-HBC-MAA-MEP-WT-003-L1	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.95028	NOT_APPLICABLE	\N	0.00	\N	\N
449	425	AP-REQ-BTE-WP4-HBC-MAA-MEP-WT-004-L1	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.96201	NOT_APPLICABLE	\N	0.00	\N	\N
450	426	AP-REQ-BTE-WP4-HBC-MAA-MEP-WT-005-L1	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.976713	NOT_APPLICABLE	\N	0.00	\N	\N
451	427	AP-REQ-BTE-WP4-HBC-MAA-MEP-WT-007-L1	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.99649	NOT_APPLICABLE	\N	0.00	\N	\N
452	428	AP-REQ-BTE-WP4-HBC-MAA-MEP-WT-008-L1	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.019697	NOT_APPLICABLE	\N	0.00	\N	\N
453	429	AP-REQ-BTE-WP4-HBC-MAA-MEP-WT-009-L1	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.039539	NOT_APPLICABLE	\N	0.00	\N	\N
454	430	AP-REQ-BTE-WP4-HBC-MAA-MEP-WT-010-L1	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.054948	NOT_APPLICABLE	\N	0.00	\N	\N
455	431	AP-REQ-BTE-WP4-HBC-MAA-MEP-WT-011-L1	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.067193	NOT_APPLICABLE	\N	0.00	\N	\N
456	432	AP-REQ-WWTP-60M3/DAY-L1	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.080574	NOT_APPLICABLE	\N	0.00	\N	\N
457	433	AP-REQ-BTE-WP4-HBC-MAA-MEP-WWTP-001-L1	\N	267740000.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.097208	NOT_APPLICABLE	\N	0.00	\N	\N
459	435	HBG-YCVT-BTE-PLB-	\N	194725300.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.128355	NOT_APPLICABLE	\N	0.00	\N	\N
462	438	HBG-YCVT-BTE-PLB-	\N	12754874.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.160959	NOT_APPLICABLE	\N	0.00	\N	\N
463	439	AP-REQ-BTE-WP4-HBC-MAA-MEP-WWTP-004-L4	\N	11275000.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.170706	NOT_APPLICABLE	\N	0.00	\N	\N
464	440	AP-REQ-BTE-WP4-HBC-MAA-MEP-WWTP-004-L5	\N	4000000.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.179759	NOT_APPLICABLE	\N	0.00	\N	\N
477	453	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L19	\N	44740080.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.305714	NOT_APPLICABLE	\N	0.00	\N	\N
478	454	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L20	\N	15080000.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.315604	NOT_APPLICABLE	\N	0.00	\N	\N
483	459	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L13	\N	20000000.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.375694	NOT_APPLICABLE	\N	0.00	\N	\N
484	460	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L43	\N	0.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.399812	NOT_APPLICABLE	\N	0.00	\N	\N
485	461	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L44	\N	0.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.408415	NOT_APPLICABLE	\N	0.00	\N	\N
498	474	AP-REQ-PP13-L1	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.567465	NOT_APPLICABLE	\N	0.00	\N	\N
499	475	AP-REQ-PP13-L2	\N	0.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.577172	NOT_APPLICABLE	\N	0.00	\N	\N
500	476	AP-REQ-PP13-L3	\N	0.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.586077	NOT_APPLICABLE	\N	0.00	\N	\N
501	477	AP-REQ-PP6-L2	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.607298	NOT_APPLICABLE	\N	0.00	\N	\N
502	478	AP-REQ-PP6-L3	\N	0.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.615193	NOT_APPLICABLE	\N	0.00	\N	\N
504	480	AP-REQ-PP4-L2	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.639334	NOT_APPLICABLE	\N	0.00	\N	\N
505	481	AP-REQ-PP4-L3	\N	0.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.649984	NOT_APPLICABLE	\N	0.00	\N	\N
506	482	AP-REQ-PP4-L4	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.659775	NOT_APPLICABLE	\N	0.00	\N	\N
507	483	AP-REQ-PP2-L2	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.672207	NOT_APPLICABLE	\N	0.00	\N	\N
508	484	AP-REQ-PP2-L3	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.679331	NOT_APPLICABLE	\N	0.00	\N	\N
509	485	AP-REQ-PP2-L4	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.6888	NOT_APPLICABLE	\N	0.00	\N	\N
510	486	AP-REQ-PP2-L5	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.69919	NOT_APPLICABLE	\N	0.00	\N	\N
511	487	AP-REQ-PP2-L6	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.707681	NOT_APPLICABLE	\N	0.00	\N	\N
512	488	AP-REQ-PP2-L7	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.71664	NOT_APPLICABLE	\N	0.00	\N	\N
513	489	AP-REQ-PP2-L8	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.725483	NOT_APPLICABLE	\N	0.00	\N	\N
514	490	AP-REQ-PP2-L9	\N	0.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.734609	NOT_APPLICABLE	\N	0.00	\N	\N
515	491	AP-REQ-PP2-L10	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.745229	NOT_APPLICABLE	\N	0.00	\N	\N
518	494	AP-REQ-PP1-L3	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.770554	NOT_APPLICABLE	\N	0.00	\N	\N
520	496	AP-REQ-PP6 dự kiến-L1	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.797886	NOT_APPLICABLE	\N	0.00	\N	\N
521	497	AP-REQ-PP8-L2	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.810213	NOT_APPLICABLE	\N	0.00	\N	\N
522	498	AP-REQ-PP8-L3	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.818705	NOT_APPLICABLE	\N	0.00	\N	\N
523	499	AP-REQ-PP8-L4	\N	0.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.826443	NOT_APPLICABLE	\N	0.00	\N	\N
524	500	AP-REQ-PP5-L2	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.845996	NOT_APPLICABLE	\N	0.00	\N	\N
525	501	AP-REQ-PP5-L3	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.854598	NOT_APPLICABLE	\N	0.00	\N	\N
527	503	AP-REQ-PP3-L2	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.876243	NOT_APPLICABLE	\N	0.00	\N	\N
528	504	AP-REQ-PP3-L3	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.885678	NOT_APPLICABLE	\N	0.00	\N	\N
529	505	AP-REQ-PP3-L4	\N	0.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.894069	NOT_APPLICABLE	\N	0.00	\N	\N
530	506	AP-REQ-PP3-L5	\N	0.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.900973	NOT_APPLICABLE	\N	0.00	\N	\N
531	507	AP-REQ-PP3-L6	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.910794	NOT_APPLICABLE	\N	0.00	\N	\N
533	509	AP-REQ-PP4-L5	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.943434	NOT_APPLICABLE	\N	0.00	\N	\N
534	510	AP-REQ-PP4-L6	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.952542	NOT_APPLICABLE	\N	0.00	\N	\N
535	511	AP-REQ-PP4-L7	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.961417	NOT_APPLICABLE	\N	0.00	\N	\N
536	512	AP-REQ-PP4-L8	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.969622	NOT_APPLICABLE	\N	0.00	\N	\N
538	514	AP-REQ-PP2 dự kiến-L1	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.993835	NOT_APPLICABLE	\N	0.00	\N	\N
539	515	AP-REQ-PP1 dự kiến-L1	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:50.014825	NOT_APPLICABLE	\N	0.00	\N	\N
540	516	AP-REQ-PP4 dự kiến-L1	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:50.062945	NOT_APPLICABLE	\N	0.00	\N	\N
541	517	AP-REQ-PP4 dự kiến-L2	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:50.071812	NOT_APPLICABLE	\N	0.00	\N	\N
543	519	AP-REQ-Tháng 03/2019-L1	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:50.134743	NOT_APPLICABLE	\N	0.00	\N	\N
544	520	AP-REQ-Tháng 04/2019-L1	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:50.146412	NOT_APPLICABLE	\N	0.00	\N	\N
545	521	AP-REQ-Tháng 05/2019-L1	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:50.158334	NOT_APPLICABLE	\N	0.00	\N	\N
546	522	AP-REQ-Tháng 06/2019-L1	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:50.170764	NOT_APPLICABLE	\N	0.00	\N	\N
547	523	AP-REQ-Tháng 07/2019-L1	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:50.182068	NOT_APPLICABLE	\N	0.00	\N	\N
548	524	AP-REQ-Tháng 08/2019-L1	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:50.19299	NOT_APPLICABLE	\N	0.00	\N	\N
549	525	AP-REQ-Tháng 09/2019-L1	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:50.203061	NOT_APPLICABLE	\N	0.00	\N	\N
550	526	AP-REQ-Tháng 10/2019-L1	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:50.217159	NOT_APPLICABLE	\N	0.00	\N	\N
551	527	AP-REQ-Tháng 11/2019-L1	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:50.228519	NOT_APPLICABLE	\N	0.00	\N	\N
552	528	AP-REQ-Tháng 12/2019-L1	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:50.240366	NOT_APPLICABLE	\N	0.00	\N	\N
553	529	AP-REQ-Tháng 01/2020-L1	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:50.25205	NOT_APPLICABLE	\N	0.00	\N	\N
554	530	AP-REQ-Tháng 01/2020-L2	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:50.261567	NOT_APPLICABLE	\N	0.00	\N	\N
555	531	AP-REQ-Tháng 01/2020-L3	\N	25584843006.30	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:50.270466	NOT_APPLICABLE	\N	0.00	\N	\N
556	532	AP-REQ-Tháng 01/2020-L4	\N	\N	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:50.2789	NOT_APPLICABLE	\N	0.00	\N	\N
557	533	AP-REQ-IPC1 - thanh toán đợt 1-L1	\N	2001281184.10	0.00	\N	PAID	\N	\N	imported: supplier-AP	2026-09-08 04:38:50.290632	NOT_APPLICABLE	\N	0.00	\N	\N
558	534	AP-REQ-IPC2 - thanh toán đợt 2-L1	\N	1629563003.20	0.00	\N	PAID	\N	\N	imported: supplier-AP	2026-09-08 04:38:50.312113	NOT_APPLICABLE	\N	0.00	\N	\N
559	535	AP-REQ-IPC3 - thanh toán đợt 3-L1	\N	4355135075.50	0.00	\N	PAID	\N	\N	imported: supplier-AP	2026-09-08 04:38:50.329211	NOT_APPLICABLE	\N	0.00	\N	\N
560	536	AP-REQ-IPC4 - thanh toán đợt 4-L1	\N	5268314371.10	0.00	\N	PAID	\N	\N	imported: supplier-AP	2026-09-08 04:38:50.346389	NOT_APPLICABLE	\N	0.00	\N	\N
561	537	AP-REQ-IPC5 - thanh toán đợt 5-L1	\N	847710047.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:50.365748	NOT_APPLICABLE	\N	0.00	\N	\N
562	538	AP-REQ-IPC6 - thanh toán đợt 6-L1	\N	6567935725.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:50.378614	NOT_APPLICABLE	\N	0.00	\N	\N
563	539	AP-REQ-IPC7 - thanh toán đợt 7-L1	\N	3699401495.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:50.39226	NOT_APPLICABLE	\N	0.00	\N	\N
564	540	AP-REQ-IPC8 - thanh toán đợt 8-L1	\N	4089412960.00	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:50.405676	NOT_APPLICABLE	\N	0.00	\N	\N
565	541	AP-REQ-IPC8 - thanh toán đợt 8-L2	\N	28458753860.90	0.00	\N	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:50.416462	NOT_APPLICABLE	\N	0.00	\N	\N
517	493	AP-REQ-PP1-L2	\N	90963967.00	0.00	2026-10-20	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.763487	NOT_APPLICABLE	\N	0.00	\N	\N
526	502	AP-REQ-PP5-L4	\N	0.00	0.00	2026-08-06	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.863059	NOT_APPLICABLE	\N	0.00	\N	\N
532	508	AP-REQ-PP3-L7	\N	0.00	0.00	2026-09-02	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.919028	NOT_APPLICABLE	\N	0.00	\N	\N
537	513	AP-REQ-PP4-L9	\N	5600000.00	0.00	2026-04-14	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.978423	NOT_APPLICABLE	\N	0.00	\N	\N
542	518	AP-REQ-PP4 dự kiến-L3	\N	\N	0.00	2026-08-08	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:50.082238	NOT_APPLICABLE	\N	0.00	\N	\N
516	492	AP-REQ-PP2-L11	2026-02-13	0.00	0.00	2026-02-23	APPROVED	1	2026-09-10	imported: supplier-AP	2026-09-08 04:38:49.754193	NOT_APPLICABLE	\N	0.00	\N	\N
519	495	AP-REQ-PP1-L4	2026-03-18	0.00	0.00	2026-03-28	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.777453	NOT_APPLICABLE	\N	0.00	\N	\N
355	331	Đợt 1	2026-06-22	418018000.00	0.00	2026-08-21	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.024613	NOT_APPLICABLE	\N	0.00	\N	\N
480	456	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L6	2026-05-08	89230000.00	0.00	2026-06-05	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.341037	NOT_APPLICABLE	\N	0.00	\N	\N
339	315	HBG-BTE-YCVT-HDPE-04	\N	32206360.00	0.00	2026-07-19	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:47.854525	NOT_APPLICABLE	\N	0.00	\N	\N
331	307	HBG-BTE-YCVT-HDPE-01	\N	809883157.00	0.00	2026-05-10	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:47.786317	NOT_APPLICABLE	\N	0.00	\N	\N
421	397	HBG-BTE-YCVT-HVAC--001	2026-07-16	503800000.00	0.00	2026-09-09	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.66912	NOT_APPLICABLE	\N	0.00	\N	\N
329	305	HBG-BTE-YCVT-BT-PLB-0.5	2026-09-09	109025360.00	0.00	2026-10-09	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:47.767008	NOT_APPLICABLE	\N	0.00	\N	\N
321	297	HBG-YCVT-BT-PLB -04	2026-09-13	91009908.00	0.00	2026-10-28	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:47.691502	NOT_APPLICABLE	\N	0.00	\N	\N
345	321	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB--014-LToàn dự án	2026-08-30	213154700.00	0.00	2026-10-14	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:47.912419	NOT_APPLICABLE	\N	0.00	\N	\N
490	466	AP-REQ-PP5-L1	2026-07-24	15194690.00	0.00	2026-08-03	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.471693	NOT_APPLICABLE	\N	0.00	\N	\N
327	303	HBG-BTE-YCVT-BT-PLB-0.3	2026-06-11	78214675.00	0.00	2026-07-11	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:47.750091	NOT_APPLICABLE	\N	0.00	\N	\N
496	472	AP-REQ-PP11-L1	2026-11-04	25850550.00	0.00	2026-11-14	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.540419	NOT_APPLICABLE	\N	0.00	\N	\N
468	444	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L4	2026-08-10	132098501.00	0.00	2026-09-11	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.21827	NOT_APPLICABLE	\N	0.00	\N	\N
470	446	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L7	2026-06-02	32630400.00	0.00	2026-07-03	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.236948	NOT_APPLICABLE	\N	0.00	\N	\N
469	445	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L5	2026-06-17	194434588.00	0.00	2026-07-17	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.226209	NOT_APPLICABLE	\N	0.00	\N	\N
367	343	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-031-L3	\N	252159250.00	0.00	2026-11-17	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.15629	NOT_APPLICABLE	\N	0.00	\N	\N
491	467	AP-REQ-PP6-L1	2026-08-08	2653537.00	0.00	2026-09-04	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.482295	NOT_APPLICABLE	\N	0.00	\N	\N
364	340	RQ-BTE-BTE-FCO-02	2026-10-08	11253000.00	0.00	2026-11-07	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.127504	NOT_APPLICABLE	\N	0.00	\N	\N
415	391	AP-REQ-BTE-WP4-HBC-MAA-MEP-HVAC-004-LBOH	2026-06-30	31790793.00	0.00	2026-07-30	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.59395	NOT_APPLICABLE	\N	0.00	\N	\N
482	458	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L12	2026-08-08	8880000.00	0.00	2026-09-05	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.36672	NOT_APPLICABLE	\N	0.00	\N	\N
438	414	HBG-YCVT-BTE-HVAC&PL-	2026-09-22	35263124.00	0.00	2026-11-06	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.841817	NOT_APPLICABLE	\N	0.00	\N	\N
465	441	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L1	2026-02-21	48739000.00	0.00	2026-02-21	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.193908	NOT_APPLICABLE	\N	0.00	\N	\N
363	339	RQ-BTE-BTE-FCO-01	2026-06-21	35244000.00	0.00	2026-06-21	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.115712	NOT_APPLICABLE	\N	0.00	\N	\N
368	344	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-031-LHạ tầng + Lobby	\N	17681400.00	0.00	2026-11-20	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.167673	NOT_APPLICABLE	\N	0.00	\N	\N
359	335	HBG-BTE-YCVT-PLB-TS-	2026-06-20	54102500.00	0.00	2026-07-20	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.067344	NOT_APPLICABLE	\N	0.00	\N	\N
434	410	HBG-BTE-YCVT-HVAC-	2026-08-15	107958400.00	0.00	2026-09-14	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.797059	NOT_APPLICABLE	\N	0.00	\N	\N
407	383	AP-REQ-BTE-WP4-HBC-MAA-MEP-HVAC-005-L3	2026-08-05	383434700.00	0.00	2026-09-19	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.508412	NOT_APPLICABLE	\N	0.00	\N	\N
405	381	HBG-BTE-YCVT-HVAC--04	2026-04-30	126323439.00	0.00	2026-06-25	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.491811	NOT_APPLICABLE	\N	0.00	\N	\N
401	377	HBG-BTE-YCVT-HVAC--13	2026-06-13	243642300.00	0.00	2026-07-28	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.453579	NOT_APPLICABLE	\N	0.00	\N	\N
343	319	HBG-BTE-YCVT-PLB-VL-01	2026-07-29	879381800.00	0.00	2026-09-08	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:47.89525	NOT_APPLICABLE	\N	0.00	\N	\N
479	455	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L2	2026-03-08	35490000.00	0.00	2026-04-05	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.326203	NOT_APPLICABLE	\N	0.00	\N	\N
328	304	HBG-BTE-YCVT-BT-PLB-0.4	2026-07-14	113968411.00	0.00	2026-08-13	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:47.757806	NOT_APPLICABLE	\N	0.00	\N	\N
472	448	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L10	2026-08-17	84768420.00	0.00	2026-09-16	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.256402	NOT_APPLICABLE	\N	0.00	\N	\N
420	396	HBG-YCVT-BTE-HVAC&PL-	2026-09-23	48554000.00	0.00	2026-10-23	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.651014	NOT_APPLICABLE	\N	0.00	\N	\N
406	382	HBG-BTE-YCVT-HVAC--016	2026-06-26	624465305.00	0.00	2026-08-10	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.499625	NOT_APPLICABLE	\N	0.00	\N	\N
402	378	HBG-BTE-YCVT-HVAC-035	2026-07-12	4095740.00	0.00	2026-08-11	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.464479	NOT_APPLICABLE	\N	0.00	\N	\N
365	341	HBG-BTE-YCVT-PLB-LHG-01	2026-08-06	948365000.00	0.00	2026-09-17	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.140116	NOT_APPLICABLE	\N	0.00	\N	\N
474	450	HBG-YCVT-BT-PLB&HVAC-024	2026-07-12	15115320.00	0.00	2026-09-01	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.275794	NOT_APPLICABLE	\N	0.00	\N	\N
497	473	AP-REQ-PP12-L1	2026-11-13	22449900.00	0.00	2026-11-23	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.554155	NOT_APPLICABLE	\N	0.00	\N	\N
475	451	HBG-YCVT-BT-PLB	2026-08-02	25236200.00	0.00	2026-09-01	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.284349	NOT_APPLICABLE	\N	0.00	\N	\N
347	323	HBG-BTE-YCVT-PLB-Pp-01	\N	662860000.00	0.00	2026-10-18	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:47.942461	NOT_APPLICABLE	\N	0.00	\N	\N
476	452	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L14	2026-09-11	26034800.00	0.00	2026-10-11	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.291944	NOT_APPLICABLE	\N	0.00	\N	\N
353	329	HBG-BTE-YCVT-PLB-WM-01	2026-08-30	96376500.00	0.00	2026-10-14	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.003993	NOT_APPLICABLE	\N	0.00	\N	\N
425	401	AP-REQ-BTE-WP4-HBC-MAA-MEP-HVAC-007-L7	2026-07-16	77480000.00	0.00	2026-08-15	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.707005	NOT_APPLICABLE	\N	0.00	\N	\N
400	376	HBG-BTE-YCVT-HVAC--003	2026-04-26	34100000.00	0.00	2026-06-10	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.444345	NOT_APPLICABLE	\N	0.00	\N	\N
481	457	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L9	2026-06-24	45815000.00	0.00	2026-07-22	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.352913	NOT_APPLICABLE	\N	0.00	\N	\N
326	302	HBG-BTE-YCVT-uPVC-02	2026-04-16	263146704.00	0.00	2026-05-16	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:47.741199	NOT_APPLICABLE	\N	0.00	\N	\N
433	409	HBG-BTE-YCVT-HVAC--002	2026-05-08	83695887.00	0.00	2026-05-08	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.787296	NOT_APPLICABLE	\N	0.00	\N	\N
348	324	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB--011-L2	\N	1402478000.00	0.00	2026-10-18	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:47.950773	NOT_APPLICABLE	\N	0.00	\N	\N
428	404	HBG-BTE-YCVT-HVAC--12	2026-05-24	104876200.00	0.00	2026-05-24	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.739831	NOT_APPLICABLE	\N	0.00	\N	\N
320	296	HBG-YCVT-BT-PLB -03	2026-07-14	106227528.00	0.00	2026-08-28	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:47.682044	NOT_APPLICABLE	\N	0.00	\N	\N
442	418	HBG-BTE-YCVT-HVAC-	2026-07-15	19986120.00	0.00	2026-07-15	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.880325	NOT_APPLICABLE	\N	0.00	\N	\N
431	407	HBG-BTE-YCVT-HVAC--018	2026-08-18	44163900.00	0.00	2026-08-18	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.768165	NOT_APPLICABLE	\N	0.00	\N	\N
419	395	HBG-BTE-YCVT-HVAC--014	\N	25456200.00	0.00	2026-08-11	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.643249	NOT_APPLICABLE	\N	0.00	\N	\N
467	443	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L3	2026-06-25	47383721.00	0.00	2026-07-25	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.210979	NOT_APPLICABLE	\N	0.00	\N	\N
319	295	HBG-YCVT-BT-PLB -02	\N	88015038.00	0.00	2026-07-11	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:47.67206	NOT_APPLICABLE	\N	0.00	\N	\N
358	334	HBG-BTE-YCVT-PLB-TS-01	\N	16860342.00	0.00	2026-08-11	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.058288	NOT_APPLICABLE	\N	0.00	\N	\N
495	471	AP-REQ-PP10-L1	2026-10-26	17533250.00	0.00	2026-11-05	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.528442	NOT_APPLICABLE	\N	0.00	\N	\N
488	464	AP-REQ-PP3-L1	2026-06-23	32090450.00	0.00	2026-07-03	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.447821	NOT_APPLICABLE	\N	0.00	\N	\N
336	312	HBG-BTE-YCVT-HDPE-02	\N	270751324.00	0.00	2026-05-20	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:47.829823	NOT_APPLICABLE	\N	0.00	\N	\N
493	469	AP-REQ-PP8-L1	2016-09-27	16615877.00	0.00	2016-10-07	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.50261	NOT_APPLICABLE	\N	0.00	\N	\N
341	317	HBG-BTE-YCVT-IN-01	2026-05-03	193476800.00	0.00	2026-06-17	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:47.873254	NOT_APPLICABLE	\N	0.00	\N	\N
487	463	AP-REQ-PP2-L1	2026-06-07	28492450.00	0.00	2026-06-17	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.436204	NOT_APPLICABLE	\N	0.00	\N	\N
437	413	HBG-BTE-YCVT-HVAC--017	2026-06-02	16903781.00	0.00	2026-07-02	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.831191	NOT_APPLICABLE	\N	0.00	\N	\N
337	313	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB--003-L7	\N	22098680.00	0.00	2026-06-02	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:47.838013	NOT_APPLICABLE	\N	0.00	\N	\N
466	442	HBG-YCVT-BT-PLB&HVAC-001	2026-05-11	192225224.00	0.00	2026-06-10	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.203087	NOT_APPLICABLE	\N	0.00	\N	\N
503	479	AP-REQ-PP6-L4	\N	4500000.00	0.00	2026-03-17	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.623675	NOT_APPLICABLE	\N	0.00	\N	\N
416	392	AP-REQ-BTE-WP4-HBC-MAA-MEP-HVAC-004-LLoby+BOH	2026-07-28	342534293.00	0.00	2026-08-27	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.601558	NOT_APPLICABLE	\N	0.00	\N	\N
458	434	AP-REQ-BTE-WP4-HBC-MAA-MEP-WWTP-002-L1	2026-06-25	40644153.00	0.00	2026-06-25	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.112449	NOT_APPLICABLE	\N	0.00	\N	\N
340	316	HBG-BTE-YCVT-HDPE-05	2026-10-26	197788345.00	0.00	2026-12-25	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:47.863312	NOT_APPLICABLE	\N	0.00	\N	\N
427	403	HBG-BTE-YCVT-HVAC-	2026-08-04	32750300.00	0.00	2026-09-03	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.725923	NOT_APPLICABLE	\N	0.00	\N	\N
356	332	Đợt 2	2026-08-05	527594000.00	0.00	2026-10-04	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.034951	NOT_APPLICABLE	\N	0.00	\N	\N
489	465	AP-REQ-PP4-L1	2026-07-08	32651500.00	0.00	2026-07-18	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.459916	NOT_APPLICABLE	\N	0.00	\N	\N
473	449	AP-REQ-BTE-WP4-HBC-MAA-MEP-PLB-026 -REV 00-L11	2026-06-23	146612438.00	0.00	2026-09-01	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:49.267106	NOT_APPLICABLE	\N	0.00	\N	\N
408	384	HBG-BTE-YCVT-HVAC-	\N	148031517.00	0.00	2026-10-08	PENDING	\N	\N	imported: supplier-AP	2026-09-08 04:38:48.519577	NOT_APPLICABLE	\N	0.00	\N	\N
\.

-- schedule_baseline_items — dự án BTE-WP4-HBC
-- Sinh bởi scripts/export-demo-seed.mjs. Nạp bằng: node scripts/load-demo-seed.mjs
-- Ngày giữ nguyên theo hồ sơ gốc; `npm run setup` gọi rebase-demo-dates.mjs để neo về ngày chạy.
COPY schedule_baseline_items ("baseline_id", "schedule_item_id", "plan_start_date", "plan_end_date", "plan_duration_days", "progress_pct", "status") FROM stdin;
583	3319	2026-03-31	2026-03-31	1	0.5	DONE
583	3320	2026-04-06	2026-04-06	1	1	DONE
583	3321	2026-04-12	2026-04-12	1	1	DONE
583	3322	2026-06-20	2026-06-21	2	1	DONE
583	3323	2026-06-23	2026-06-27	5	1	DONE
583	3324	2026-06-29	2026-07-03	5	1	DONE
583	3325	2026-03-29	2026-03-29	1	1	DONE
583	3326	2026-03-31	2026-04-04	5	1	DONE
583	3327	2026-07-10	2026-07-12	3	1	DONE
583	3329	2026-07-07	2026-07-07	1	1	DONE
583	3335	2026-05-08	2026-05-27	\N	1	DONE
583	3340	2026-05-23	2026-05-23	\N	1	DONE
583	3345	2026-06-11	2026-06-11	\N	1	DONE
583	3351	\N	\N	\N	1	DONE
583	3357	2026-04-06	2026-04-10	5	1	DONE
583	3358	2026-06-20	2026-06-21	2	1	DONE
583	3359	2026-06-23	2026-06-27	5	1	DONE
583	3360	2026-06-29	2026-07-03	5	1	DONE
583	3361	2026-06-23	2026-06-23	1	1	DONE
583	3362	2026-06-29	2026-06-29	1	1	DONE
583	3363	2026-07-05	2026-07-05	1	1	DONE
583	3367	2026-07-05	2026-07-06	2	1	DONE
583	3368	2026-07-05	2026-07-06	2	1	DONE
583	3369	2026-07-08	2026-07-09	2	1	DONE
583	3370	2026-07-05	2026-07-06	2	1	DONE
583	3371	2026-07-07	2026-07-09	3	1	DONE
583	3373	2026-03-29	2026-03-29	\N	1	DONE
583	3395	2026-03-29	2026-03-30	\N	1	DONE
583	3417	2026-03-29	2026-03-29	\N	1	DONE
583	3439	2026-07-05	2026-07-05	1	1	DONE
583	3441	2026-07-09	2026-07-09	1	1	DONE
583	3442	2026-07-14	2026-07-14	1	1	DONE
583	3443	2026-03-12	2026-10-11	213	\N	DONE
583	3444	2026-05-19	2026-05-21	3	1	DONE
583	3445	2026-03-12	2026-10-11	\N	\N	DONE
583	3446	2026-05-29	2026-05-30	2	1	DONE
583	3447	2026-05-29	2026-05-29	1	1	DONE
583	3448	2026-06-17	2026-06-18	2	1	DONE
583	3449	2026-06-01	2026-06-02	2	1	DONE
583	3450	2026-06-01	2026-06-01	1	1	DONE
583	3451	2026-05-31	2026-05-31	1	1	DONE
583	3452	2026-05-29	2026-08-13	\N	\N	DONE
583	3459	2026-06-20	2026-06-20	1	1	DONE
583	3460	2026-06-01	2026-06-01	1	1	DONE
583	3461	2026-06-02	2026-06-02	1	1	DONE
583	3462	2026-08-12	2026-08-12	1	1	DONE
583	3463	2026-08-13	2026-08-13	1	0.35	DONE
583	3464	2026-04-06	2026-10-13	190	\N	DONE
583	3465	2026-05-19	2026-05-21	3	1	DONE
583	3466	2026-04-06	2026-10-13	\N	\N	DONE
583	3467	2026-05-29	2026-05-30	2	1	DONE
583	3468	2026-05-29	2026-05-29	1	1	DONE
583	3469	2026-06-17	2026-06-20	4	1	DONE
583	3470	2026-06-01	2026-06-02	2	1	DONE
22	3532	\N	\N	\N	\N	PENDING
583	3471	2026-06-01	2026-06-01	1	1	DONE
583	3472	2026-05-31	2026-05-31	1	1	DONE
583	3473	2026-05-29	2026-08-13	\N	\N	DONE
583	3480	2026-06-22	2026-06-22	1	1	DONE
583	3481	2026-06-01	2026-06-01	1	1	DONE
583	3482	2026-06-02	2026-06-02	1	0.95	DONE
583	3483	2026-08-12	2026-08-12	1	1	DONE
583	3484	2026-08-13	2026-08-13	1	0.4	DONE
583	3485	2026-05-12	2026-09-26	137	\N	DONE
583	3486	2026-05-19	2026-05-21	3	1	DONE
583	3487	2026-05-12	2026-09-26	\N	\N	DONE
583	3488	2026-06-23	2026-06-24	2	0.15	DONE
583	3489	2026-06-23	2026-06-23	1	0.15	DONE
583	3490	2026-05-22	2026-05-24	3	0.15	DONE
583	3491	2026-06-23	2026-06-24	2	0.15	DONE
583	3492	2026-06-26	2026-06-26	1	0.15	DONE
583	3493	2026-06-25	2026-06-25	1	0.15	DONE
583	3494	2026-05-22	2026-09-23	\N	\N	DONE
583	3501	2026-07-18	2026-07-18	1	0.15	DONE
583	3502	2026-07-18	2026-07-18	1	0.15	DONE
583	3503	2026-07-19	2026-07-19	1	0.15	DONE
583	3504	2026-09-21	2026-09-21	1	0.15	DONE
583	3505	2026-09-23	2026-09-23	1	0	DONE
583	3506	2026-05-12	2026-12-29	231	\N	DONE
583	3507	2026-05-19	2026-05-21	3	1	DONE
583	3508	2026-05-12	2026-09-26	\N	\N	DONE
583	3509	2026-07-04	2026-07-05	2	0.1	DONE
583	3510	2026-07-04	2026-07-04	1	0.1	DONE
583	3511	2026-06-02	2026-06-04	3	0.1	DONE
583	3512	2026-07-04	2026-07-05	2	0.1	DONE
583	3513	2026-10-04	2026-10-04	1	0	DONE
583	3514	2026-12-29	2026-12-29	1	0	DONE
583	3515	2026-06-02	2026-12-29	\N	\N	DONE
583	3522	2026-02-14	2026-10-12	240	\N	DONE
583	3523	2026-05-19	2026-05-21	3	1	DONE
583	3524	2026-02-14	2026-10-12	\N	\N	DONE
583	3525	2026-06-12	2026-06-13	2	0.9	DONE
583	3526	2026-06-12	2026-06-12	1	0.9	DONE
583	3527	2026-05-07	2026-05-08	2	0.9	DONE
583	3528	2026-06-12	2026-06-13	2	0.9	DONE
583	3529	2026-06-15	2026-06-15	1	0.9	DONE
583	3530	2026-06-14	2026-06-14	1	0.9	DONE
583	3531	2026-05-07	2026-08-14	\N	\N	DONE
583	3532	\N	\N	\N	\N	PENDING
583	3539	2026-05-10	2026-05-10	1	0.9	DONE
583	3540	2026-06-15	2026-06-15	1	0.9	DONE
583	3541	2026-06-17	2026-06-17	1	0	DONE
583	3542	2026-08-12	2026-08-12	1	0.9	DONE
583	3543	2026-08-14	2026-08-14	1	0	DONE
583	3544	\N	\N	\N	\N	PENDING
583	3556	2026-04-20	2026-10-02	165	\N	DONE
583	3557	2026-05-19	2026-05-21	3	1	DONE
583	3558	2026-04-20	2026-10-02	\N	\N	DONE
583	3559	2026-07-26	2026-07-26	1	1	DONE
583	3560	2026-07-19	2026-07-19	1	1	DONE
583	3561	2026-07-16	2026-07-17	2	1	DONE
583	3562	2026-07-26	2026-07-26	1	1	DONE
583	3563	2026-07-28	2026-07-28	1	1	DONE
583	3564	2026-07-21	2026-07-21	1	1	DONE
583	3565	2026-07-16	2026-09-16	\N	\N	DONE
583	3572	2026-07-30	2026-07-30	1	1	DONE
583	3573	2026-07-30	2026-07-30	1	1	DONE
583	3574	2026-07-31	2026-07-31	1	0.95	DONE
583	3575	2026-09-14	2026-09-14	1	1	DONE
583	3576	2026-09-16	2026-09-16	1	0	DONE
583	3577	2026-05-09	2026-10-17	161	\N	DONE
583	3578	2026-05-19	2026-05-21	3	1	DONE
583	3579	2026-05-09	2026-10-08	\N	\N	DONE
583	3580	2026-08-06	2026-08-07	2	0.15	DONE
583	3581	2026-08-06	2026-08-06	1	0.15	DONE
583	3582	2026-07-06	2026-07-08	3	0.15	DONE
583	3583	2026-08-06	2026-08-07	2	0.15	DONE
583	3584	2026-08-09	2026-08-09	1	0.15	DONE
583	3585	2026-08-08	2026-08-08	1	0.15	DONE
583	3586	2026-07-06	2026-10-17	\N	\N	DONE
583	3593	2026-08-31	2026-08-31	1	0.15	DONE
583	3594	2026-08-31	2026-08-31	1	0	DONE
22	3651	\N	\N	8	0	PENDING
583	3595	2026-10-15	2026-10-15	1	0.15	DONE
583	3596	2026-10-17	2026-10-17	1	0	DONE
583	3597	2026-05-12	2026-09-17	128	\N	DONE
583	3598	2026-05-19	2026-05-21	3	1	DONE
583	3599	2026-05-12	2026-09-17	\N	\N	DONE
583	3600	2026-06-06	2026-06-07	2	0.2	DONE
583	3601	2026-06-09	2026-06-09	1	0.2	DONE
583	3602	2026-06-01	2026-06-05	5	0.2	DONE
583	3603	2026-06-06	2026-06-06	1	0.2	DONE
583	3604	2026-06-09	2026-06-09	1	0.2	DONE
583	3605	2026-06-11	2026-06-11	1	0.2	DONE
583	3606	2026-06-01	2026-08-22	\N	\N	DONE
583	3613	2026-06-07	2026-06-07	1	0.2	DONE
583	3614	2026-06-07	2026-06-07	1	0.2	DONE
583	3615	2026-06-07	2026-06-07	1	0.2	DONE
583	3616	2026-08-20	2026-08-20	1	0.2	DONE
583	3617	2026-08-22	2026-08-22	1	0	DONE
583	3618	2026-03-26	2026-09-02	160	\N	DONE
583	3619	2026-05-19	2026-05-21	3	1	DONE
583	3620	2026-03-26	2026-09-02	\N	\N	DONE
583	3621	2026-06-06	2026-06-07	2	0.35	DONE
583	3622	2026-06-09	2026-06-09	1	0.35	DONE
583	3623	2026-06-01	2026-06-03	3	0.35	DONE
583	3624	2026-06-06	2026-06-07	2	0.35	DONE
583	3625	2026-06-09	2026-06-09	1	0.35	DONE
583	3626	2026-06-11	2026-06-11	1	0	DONE
583	3627	2026-06-01	2026-08-22	\N	\N	DONE
583	3634	2026-06-05	2026-06-05	1	0	DONE
583	3635	2026-06-05	2026-06-05	1	0	DONE
583	3636	2026-06-05	2026-06-05	1	0.35	DONE
583	3637	2026-08-20	2026-08-20	1	0	DONE
583	3638	2026-08-22	2026-08-22	1	0	DONE
583	3639	2026-02-24	2026-03-03	8	1	DONE
583	3640	\N	\N	\N	1	DONE
583	3641	2026-02-07	2026-11-02	\N	0.95	DONE
583	3642	2026-02-21	2026-04-21	60	0.35	DONE
583	3643	2026-03-03	2026-07-25	145	0.35	DONE
583	3644	2026-07-03	2026-09-10	70	0.35	DONE
583	3645	2026-07-14	2026-09-16	65	0.35	DONE
583	3646	2026-08-10	2026-10-08	60	0.35	DONE
583	3647	2026-02-17	2026-02-21	5	0.6	IN_PROGRESS
583	3648	2026-02-19	2026-02-26	8	0.6	IN_PROGRESS
583	3649	2026-02-19	2026-02-26	8	0.6	IN_PROGRESS
583	3650	2026-02-24	2026-03-03	8	0.6	IN_PROGRESS
583	3651	\N	\N	8	0	PENDING
583	3652	2026-02-07	2026-02-07	\N	0.95	DONE
583	3658	2026-02-21	2026-02-21	\N	0.95	DONE
583	3669	2026-02-11	2026-02-11	\N	0.95	DONE
583	3680	2026-02-07	2026-02-07	\N	0.95	DONE
583	3691	2026-02-19	2026-02-26	8	1	DONE
583	3692	2026-02-19	2026-02-26	8	1	DONE
583	3695	2026-02-22	2026-02-22	\N	0.95	DONE
583	3705	2026-02-22	2026-02-22	\N	0.95	DONE
583	3711	2026-02-07	2026-02-07	\N	0.95	DONE
583	3722	2026-02-21	2026-02-21	\N	0.25	DONE
583	3733	2026-05-19	2026-10-21	155	\N	DONE
583	3734	2026-05-19	2026-05-21	3	1	DONE
583	3735	2026-06-01	2026-10-21	\N	\N	DONE
583	3736	2026-08-06	2026-08-07	2	0.35	DONE
583	3737	2026-08-06	2026-08-06	1	0.35	DONE
583	3738	2026-07-06	2026-07-08	3	0.35	DONE
583	3739	2026-08-06	2026-08-07	2	0.35	DONE
583	3740	2026-08-09	2026-08-09	1	0.35	DONE
583	3741	2026-08-08	2026-08-08	1	0.35	DONE
583	3742	2026-07-06	2026-10-17	\N	\N	DONE
583	3749	2026-08-31	2026-08-31	1	0.35	DONE
583	3750	2026-08-31	2026-08-31	1	0.35	DONE
583	3751	2026-08-31	2026-08-31	1	0	DONE
583	3752	2026-10-15	2026-10-15	1	0.35	DONE
583	3753	2026-10-17	2026-10-17	1	0	DONE
583	3754	2026-08-23	2026-08-24	2	1	DONE
583	3755	2026-08-26	2026-08-27	2	0	DONE
583	3756	2026-08-29	2026-08-30	2	0.35	DONE
583	3757	2026-08-23	2026-08-31	9	1	DONE
583	3758	2026-09-02	2026-09-07	6	0.8	DONE
583	3759	2026-08-23	2026-08-30	8	1	DONE
583	3760	2026-09-01	2026-09-05	5	0.8	DONE
583	3761	2026-07-12	2026-07-23	12	1	DONE
583	3762	2026-07-25	2026-07-31	7	0.8	DONE
583	3763	2026-11-02	2026-11-02	1	0	DONE
583	3770	2026-08-23	2026-08-25	3	1	DONE
583	3771	2026-09-02	2026-09-04	3	0.8	DONE
583	3772	2026-09-02	2026-09-02	1	1	DONE
583	3773	2026-09-09	2026-09-09	1	0	DONE
583	3774	2026-09-01	2026-09-01	1	1	DONE
583	3775	2026-09-07	2026-09-07	1	0	DONE
583	3779	2026-08-23	2026-08-29	7	1	DONE
583	3780	2026-08-31	2026-09-03	4	0.25	DONE
583	3781	2026-08-23	2026-08-24	2	1	DONE
583	3782	2026-08-31	2026-08-31	1	0.25	DONE
583	3783	2026-10-27	2026-10-28	2	1	DONE
583	3784	2026-10-30	2026-10-31	2	0.35	DONE
583	3786	2026-05-19	2026-10-21	155	\N	DONE
583	3787	2026-05-19	2026-05-21	3	1	DONE
583	3788	2026-06-18	2026-10-21	\N	\N	DONE
583	3789	2026-08-09	2026-08-10	2	0	DONE
583	3790	2026-08-12	2026-08-12	1	0	DONE
22	3351	\N	\N	\N	1	DONE
583	3791	2026-08-09	2026-08-10	2	0	DONE
583	3792	2026-08-12	2026-08-12	1	0	DONE
583	3793	2026-07-15	2026-07-17	3	0	DONE
583	3794	2026-08-26	2026-08-26	1	0	DONE
583	3795	2026-07-15	2026-10-06	\N	\N	DONE
583	3801	2026-07-19	2026-07-19	1	0	DONE
583	3802	2026-08-09	2026-08-10	2	0	DONE
583	3803	2026-08-12	2026-08-12	1	0	DONE
583	3804	2026-08-12	2026-08-12	1	0	DONE
583	3805	2026-08-14	2026-08-14	1	0	DONE
583	3806	2026-08-12	2026-08-12	1	0	DONE
583	3807	2026-08-14	2026-08-14	1	0	DONE
22	3640	\N	\N	\N	1	DONE
583	3808	2026-08-23	2026-08-23	1	0	DONE
583	3809	2026-08-25	2026-08-25	1	0	DONE
583	3810	2026-08-22	2026-08-22	1	0	DONE
583	3811	2026-08-24	2026-08-24	1	0	DONE
583	3812	2026-08-26	2026-08-26	1	0	DONE
583	3814	2026-10-04	2026-10-04	1	0	DONE
583	3815	2026-10-04	2026-10-04	1	0	DONE
583	3816	2026-10-06	2026-10-06	1	0	DONE
583	3817	2026-08-23	2026-08-23	1	0	DONE
583	3818	2026-08-25	2026-08-25	1	0	DONE
583	3819	2026-08-22	2026-08-22	1	0	DONE
583	3820	2026-08-09	2026-08-10	2	0	DONE
583	3821	2026-08-12	2026-08-12	1	0	DONE
583	3822	2026-08-09	2026-08-10	2	0	DONE
583	3823	2026-08-12	2026-08-12	1	0	DONE
583	3824	2026-07-15	2026-07-17	3	0	DONE
583	3825	2026-07-19	2026-07-19	1	0	DONE
583	3826	2026-07-15	2026-10-06	\N	\N	DONE
583	3833	2026-08-09	2026-08-10	2	0	DONE
583	3834	2026-08-12	2026-08-12	1	0	DONE
583	3835	2026-08-12	2026-08-12	1	0	DONE
583	3836	2026-08-14	2026-08-14	1	0	DONE
583	3837	2026-08-12	2026-08-12	1	0	DONE
583	3838	2026-08-14	2026-08-14	1	0	DONE
583	3842	2026-08-24	2026-08-24	1	0	DONE
583	3843	2026-08-26	2026-08-26	1	0	DONE
583	3844	2026-08-26	2026-08-26	1	0	DONE
583	3845	2026-10-04	2026-10-04	1	0	DONE
583	3846	2026-10-04	2026-10-04	1	0	DONE
583	3847	2026-10-06	2026-10-06	1	0	DONE
583	3848	2026-01-29	2026-11-22	297	0.2	DONE
583	3849	2026-05-19	2026-05-21	3	1	DONE
583	3850	2026-01-29	2026-08-04	\N	0.2	DONE
583	3851	2026-06-03	2026-06-04	2	1	DONE
583	3852	2026-06-03	2026-06-03	1	1	DONE
583	3853	2026-04-22	2026-04-23	2	0.85	DONE
583	3854	2026-08-01	2026-08-01	1	0.1	DONE
583	3855	2026-08-04	2026-08-04	1	0	DONE
583	3856	2026-04-22	2026-11-22	\N	\N	DONE
583	3860	2026-06-03	2026-06-03	1	0.85	DONE
583	3861	2026-11-22	2026-11-22	1	0.15	DONE
583	3863	2026-05-19	2026-10-21	155	0.5	DONE
583	3864	2026-05-19	2026-05-21	3	1	DONE
583	3865	2026-06-01	2026-10-21	\N	\N	DONE
583	3866	2026-08-06	2026-08-07	2	0.35	DONE
583	3867	2026-08-06	2026-08-06	1	0.35	DONE
583	3868	2026-07-06	2026-07-08	3	0.35	DONE
583	3869	2026-08-06	2026-08-07	2	0.35	DONE
583	3870	2026-08-09	2026-08-09	1	0.35	DONE
583	3871	2026-08-08	2026-08-08	1	0.35	DONE
583	3872	2026-07-06	2026-10-17	\N	\N	DONE
22	3544	\N	\N	\N	\N	PENDING
583	3879	2026-08-31	2026-08-31	1	0.35	DONE
583	3880	2026-08-31	2026-08-31	1	0.35	DONE
583	3881	2026-08-31	2026-08-31	1	0	DONE
583	3882	2026-10-15	2026-10-15	1	0.35	DONE
583	3883	2026-10-17	2026-10-17	1	0	DONE
583	4766	2026-01-19	2026-07-29	\N	0	PENDING
583	4767	2026-01-19	2026-07-17	\N	0	PENDING
583	4768	2026-01-19	2026-01-20	2	0.65	IN_PROGRESS
583	4769	2026-02-23	2026-03-04	10	0.8	IN_PROGRESS
583	4770	2026-02-07	2026-02-26	20	0.9	IN_PROGRESS
583	4771	2026-05-08	2026-06-07	31	0	PENDING
583	4772	2026-06-28	2026-07-12	15	0	PENDING
583	4773	2026-03-29	2026-03-29	\N	0	PENDING
583	4774	2026-05-01	2026-05-30	30	0	PENDING
583	4775	2026-03-29	2026-03-29	\N	0	PENDING
583	4776	2026-03-29	2026-04-17	20	0	PENDING
583	4777	2026-04-17	2026-04-19	3	0	PENDING
583	4778	2026-04-23	2026-05-12	20	0	PENDING
583	4779	2026-05-12	2026-05-12	1	0	PENDING
583	4780	2026-05-08	2026-05-08	\N	0	PENDING
583	4781	2026-05-08	2026-05-27	20	0	PENDING
583	4782	2026-05-25	2026-05-27	3	0	PENDING
583	4783	2026-06-04	2026-06-23	20	0	PENDING
583	4784	2026-06-24	2026-06-24	1	0	PENDING
583	4785	2026-05-23	2026-05-23	\N	0	PENDING
583	4786	2026-06-04	2026-06-23	20	0	PENDING
583	4787	2026-05-23	2026-05-25	3	0	PENDING
583	4788	2026-06-27	2026-07-11	15	0	PENDING
583	4789	2026-07-17	2026-07-17	1	0	PENDING
583	4790	2026-06-11	2026-06-11	\N	0	PENDING
583	4791	2026-06-11	2026-06-30	20	0	PENDING
583	4792	2026-03-29	2026-07-29	\N	0.5	PENDING
583	4793	2026-07-02	2026-07-16	15	0	PENDING
583	4794	2026-07-17	2026-07-17	1	0	PENDING
583	4796	\N	\N	\N	\N	PENDING
583	4797	2026-06-20	2026-06-20	1	0	PENDING
583	4798	2026-06-22	2026-06-24	3	0	PENDING
583	4799	2026-03-29	2026-03-29	1	0	PENDING
583	4800	2026-04-08	2026-04-10	3	0	PENDING
583	4801	2026-06-20	2026-06-21	2	0	PENDING
583	4802	2026-06-23	2026-06-25	3	0	PENDING
583	4803	2026-05-01	2026-05-01	1	0	PENDING
583	4804	2026-05-03	2026-05-05	3	0	PENDING
583	4805	2026-06-22	2026-06-23	2	0	PENDING
583	4806	2026-06-26	2026-06-27	2	0	PENDING
583	4807	2026-03-31	2026-03-31	1	0	PENDING
583	4808	2026-04-12	2026-04-12	1	0	PENDING
583	4809	2026-06-23	2026-06-25	3	0	PENDING
583	4810	2026-06-27	2026-06-28	2	0	PENDING
583	4811	2026-06-23	2026-06-23	1	0	PENDING
583	4812	2026-06-25	2026-06-28	4	0	PENDING
583	4813	2026-06-30	2026-06-30	1	0	PENDING
583	4814	2026-07-02	2026-07-03	2	0	PENDING
583	4815	2026-06-25	2026-06-25	1	0	PENDING
583	4816	2026-06-30	2026-06-30	1	0	PENDING
583	4817	2026-07-19	2026-07-19	1	0	PENDING
583	4818	\N	\N	\N	\N	PENDING
583	4819	2026-06-20	2026-06-20	1	0	PENDING
583	4820	2026-06-20	2026-06-22	3	0	PENDING
583	4821	2026-03-29	2026-03-29	1	0	PENDING
583	4822	2026-03-29	2026-03-30	2	0	PENDING
583	4823	2026-06-20	2026-06-21	2	0	PENDING
583	4824	2026-06-20	2026-06-21	2	0	PENDING
583	4825	2026-05-01	2026-05-02	2	0	PENDING
583	4826	2026-05-01	2026-05-03	3	0	PENDING
583	4827	2026-06-21	2026-06-23	3	0	PENDING
583	4828	2026-06-24	2026-06-24	1	0	PENDING
583	4829	2026-03-30	2026-03-31	2	0	PENDING
583	4830	2026-04-01	2026-04-01	1	0	PENDING
583	4831	2026-04-01	2026-04-02	2	0	PENDING
583	4832	2026-04-22	2026-04-22	1	0	PENDING
583	4833	2026-06-20	2026-06-21	2	0	PENDING
583	4834	2026-06-21	2026-06-22	2	0	PENDING
583	4835	2026-06-21	2026-06-23	3	0	PENDING
583	4836	2026-06-24	2026-06-24	1	0	PENDING
583	4837	2026-06-21	2026-06-22	2	0	PENDING
583	4838	2026-06-26	2026-06-26	1	0	PENDING
583	4839	2026-07-29	2026-07-29	1	0	PENDING
583	4840	\N	\N	\N	\N	PENDING
583	4841	2026-06-20	2026-06-21	2	0	PENDING
583	4842	2026-06-23	2026-06-24	2	0	PENDING
583	4843	2026-03-29	2026-03-30	2	0	PENDING
583	4844	2026-04-01	2026-04-02	2	0	PENDING
583	4845	2026-06-20	2026-06-21	2	0	PENDING
583	4846	2026-06-21	2026-06-22	2	0	PENDING
583	4847	2026-05-01	2026-05-02	2	0	PENDING
583	4848	2026-05-04	2026-05-06	3	0	PENDING
583	4849	2026-06-23	2026-06-23	1	0	PENDING
583	4850	2026-06-26	2026-06-26	1	0	PENDING
583	4851	2026-04-01	2026-04-01	1	0	PENDING
583	4852	2026-04-04	2026-04-04	1	0	PENDING
583	4853	2026-04-01	2026-04-01	1	0	PENDING
583	4854	2026-04-22	2026-04-23	2	0	PENDING
583	4855	2026-06-25	2026-06-25	1	0	PENDING
583	4856	2026-06-28	2026-06-29	2	0	PENDING
583	4857	2026-06-27	2026-06-27	1	0	PENDING
583	4858	2026-06-29	2026-06-29	1	0	PENDING
583	4859	2026-07-15	2026-07-15	1	0	PENDING
583	4860	2026-07-17	2026-07-17	1	0	PENDING
583	4861	2026-07-19	2026-07-19	1	0	PENDING
583	4862	\N	\N	\N	\N	PENDING
583	4863	2026-06-20	2026-06-21	2	0	PENDING
583	4864	2026-06-23	2026-06-27	5	0	PENDING
583	4865	2026-06-29	2026-07-03	5	0	PENDING
583	4866	2026-03-29	2026-03-29	1	0	PENDING
583	4867	2026-03-31	2026-04-04	5	0	PENDING
583	4868	2026-04-06	2026-04-10	5	0	PENDING
583	4869	2026-06-20	2026-06-21	2	0	PENDING
583	4870	2026-06-23	2026-06-27	5	0	PENDING
583	4871	2026-06-29	2026-07-03	5	0	PENDING
583	4872	2026-06-23	2026-06-23	1	0	PENDING
583	4873	2026-06-29	2026-06-29	1	0	PENDING
583	4874	2026-07-05	2026-07-05	1	0	PENDING
583	4875	2026-03-31	2026-03-31	1	0	PENDING
583	4876	2026-04-06	2026-04-06	1	0	PENDING
583	4877	2026-04-12	2026-04-12	1	0	PENDING
583	4878	2026-07-05	2026-07-06	2	0	PENDING
583	4879	2026-07-05	2026-07-06	2	0	PENDING
583	4880	2026-07-08	2026-07-09	2	0	PENDING
583	4881	2026-07-05	2026-07-06	2	0	PENDING
583	4882	2026-07-07	2026-07-09	3	0	PENDING
583	4883	2026-07-10	2026-07-12	3	0	PENDING
583	4884	2026-07-05	2026-07-05	1	0	PENDING
583	4885	2026-07-07	2026-07-07	1	0	PENDING
583	4886	2026-07-09	2026-07-09	1	0	PENDING
583	4887	2026-07-14	2026-07-14	1	0	PENDING
583	4888	2026-03-12	2026-10-11	\N	\N	PENDING
583	4889	2026-03-12	2026-10-11	\N	\N	PENDING
583	4890	2026-06-16	2026-07-05	20	\N	PENDING
583	4891	2026-03-12	2026-03-16	5	0.05	IN_PROGRESS
583	4892	2026-06-23	2026-07-02	10	\N	PENDING
583	4893	2026-03-17	2026-03-26	10	\N	PENDING
583	4894	2026-09-16	2026-10-10	25	\N	PENDING
583	4895	2026-10-02	2026-10-11	10	\N	PENDING
583	4896	2026-05-29	2026-08-13	\N	\N	PENDING
583	4897	2026-05-29	2026-05-30	2	\N	PENDING
583	4898	2026-05-29	2026-05-29	1	\N	PENDING
583	4899	2026-06-17	2026-06-18	2	\N	PENDING
583	4900	2026-06-01	2026-06-02	2	\N	PENDING
583	4901	2026-06-01	2026-06-01	1	\N	PENDING
583	4902	2026-05-31	2026-05-31	1	\N	PENDING
583	4903	2026-06-20	2026-06-20	1	\N	PENDING
583	4904	2026-06-01	2026-06-01	1	\N	PENDING
583	4905	2026-06-02	2026-06-02	1	\N	PENDING
583	4906	2026-08-12	2026-08-12	1	\N	PENDING
583	4907	2026-08-13	2026-08-13	1	\N	PENDING
583	4908	2026-04-06	2026-10-13	\N	\N	PENDING
583	4909	2026-04-06	2026-10-13	\N	\N	PENDING
583	4910	2026-06-23	2026-07-12	20	0	PENDING
583	4911	2026-04-06	2026-04-10	5	0	PENDING
583	4912	2026-07-05	2026-07-14	10	0	PENDING
583	4913	2026-04-11	2026-04-20	10	0	PENDING
583	4914	2026-09-29	2026-10-13	15	0	PENDING
583	4915	2026-10-04	2026-10-13	10	0	PENDING
583	4916	2026-05-29	2026-08-13	\N	\N	PENDING
583	4917	2026-05-29	2026-05-30	2	0	PENDING
583	4918	2026-05-29	2026-05-29	1	0	PENDING
583	4919	2026-06-17	2026-06-20	4	0	PENDING
583	4920	2026-06-01	2026-06-02	2	0	PENDING
583	4921	2026-06-01	2026-06-01	1	0	PENDING
583	4922	2026-05-31	2026-05-31	1	0	PENDING
583	4923	2026-06-22	2026-06-22	1	0	PENDING
583	4924	2026-06-01	2026-06-01	1	0	PENDING
583	4925	2026-06-02	2026-06-02	1	0	PENDING
583	4926	2026-08-12	2026-08-12	1	0	PENDING
583	4927	2026-08-13	2026-08-13	1	0	PENDING
583	4928	2026-05-12	2026-09-26	\N	\N	PENDING
583	4929	2026-05-12	2026-09-26	\N	\N	PENDING
583	4930	2026-06-23	2026-07-02	10	0	PENDING
583	4931	2026-05-12	2026-05-16	5	0	PENDING
583	4932	2026-07-03	2026-07-05	3	0	PENDING
583	4933	2026-05-18	2026-05-20	3	0	PENDING
583	4934	2026-09-20	2026-09-26	7	0	PENDING
583	4935	2026-09-24	2026-09-26	3	0	PENDING
583	4936	2026-05-22	2026-09-23	\N	\N	PENDING
583	4937	2026-06-23	2026-06-24	2	0	PENDING
583	4938	2026-06-23	2026-06-23	1	0	PENDING
583	4939	2026-05-22	2026-05-24	3	0	PENDING
583	4940	2026-06-23	2026-06-24	2	0	PENDING
583	4941	2026-06-26	2026-06-26	1	0	PENDING
583	4942	2026-06-25	2026-06-25	1	0	PENDING
583	4943	2026-07-18	2026-07-18	1	0	PENDING
583	4944	2026-07-18	2026-07-18	1	0	PENDING
583	4945	2026-07-19	2026-07-19	1	0	PENDING
583	4946	2026-09-21	2026-09-21	1	0	PENDING
583	4947	2026-09-23	2026-09-23	1	0	PENDING
583	4948	2026-05-12	2026-09-26	\N	\N	PENDING
583	4949	2026-06-23	2026-07-02	10	0	PENDING
583	4950	2026-05-12	2026-05-16	5	0	PENDING
583	4951	2026-07-03	2026-07-05	3	0	PENDING
583	4952	2026-05-18	2026-05-20	3	0	PENDING
583	4953	2026-09-20	2026-09-26	7	0	PENDING
583	4954	2026-09-24	2026-09-26	3	0	PENDING
583	4955	2026-06-02	2026-10-04	\N	\N	PENDING
583	4956	2026-07-04	2026-07-05	2	0	PENDING
583	4957	2026-07-04	2026-07-04	1	0	PENDING
583	4958	2026-06-02	2026-06-04	3	0	PENDING
583	4959	2026-07-04	2026-07-05	2	0	PENDING
583	4960	2026-07-07	2026-07-07	1	0	PENDING
583	4961	2026-07-06	2026-07-06	1	0	PENDING
583	4962	2026-07-29	2026-07-29	1	0	PENDING
583	4963	2026-07-29	2026-07-29	1	0	PENDING
583	4964	2026-07-29	2026-07-29	1	0	PENDING
583	4965	2026-10-02	2026-10-02	1	0	PENDING
583	4966	2026-10-04	2026-10-04	1	0	PENDING
583	4967	2026-02-14	2026-10-12	\N	\N	PENDING
583	4968	2026-02-14	2026-10-12	\N	\N	PENDING
583	4969	2026-06-02	2026-06-11	10	0	PENDING
583	4970	2026-02-14	2026-02-18	5	0	PENDING
583	4971	2026-06-12	2026-06-14	3	0	PENDING
583	4972	2026-06-15	2026-06-17	3	0	PENDING
583	4973	2026-09-28	2026-10-12	15	0	PENDING
583	4974	2026-10-10	2026-10-12	3	0	PENDING
583	4975	2026-05-07	2026-08-14	\N	\N	PENDING
583	4976	\N	\N	\N	\N	PENDING
583	4977	2026-06-12	2026-06-13	2	0	PENDING
583	4978	2026-06-12	2026-06-12	1	0	PENDING
583	4979	2026-05-07	2026-05-08	2	0	PENDING
583	4980	2026-06-12	2026-06-13	2	0	PENDING
583	4981	2026-06-15	2026-06-15	1	0	PENDING
583	4982	2026-06-14	2026-06-14	1	0	PENDING
583	4983	2026-05-10	2026-05-10	1	0	PENDING
583	4984	2026-06-15	2026-06-15	1	0	PENDING
583	4985	2026-06-17	2026-06-17	1	0	PENDING
583	4986	2026-08-12	2026-08-12	1	0	PENDING
583	4987	2026-08-14	2026-08-14	1	0	PENDING
583	4988	\N	\N	\N	\N	PENDING
583	4989	2026-06-12	2026-06-13	2	0	PENDING
583	4990	2026-06-12	2026-06-12	1	0	PENDING
583	4991	2026-05-07	2026-05-08	2	0	PENDING
583	4992	2026-06-12	2026-06-13	2	0	PENDING
583	4993	2026-06-15	2026-06-15	1	0	PENDING
583	4994	2026-06-14	2026-06-14	1	0	PENDING
583	4995	2026-05-10	2026-05-10	1	0	PENDING
583	4996	2026-06-15	2026-06-15	1	0	PENDING
583	4997	2026-06-17	2026-06-17	1	0	PENDING
583	4998	2026-08-12	2026-08-12	1	0	PENDING
583	4999	2026-08-14	2026-08-14	1	0	PENDING
583	5000	2026-04-20	2026-10-17	\N	\N	PENDING
583	5001	2026-04-20	2026-10-17	\N	\N	PENDING
583	5002	2026-07-01	2026-07-15	15	0	PENDING
583	5003	2026-04-20	2026-04-24	5	0	PENDING
583	5004	2026-09-25	2026-09-27	3	0	PENDING
583	5005	2026-09-25	2026-09-27	3	0	PENDING
583	5006	2026-09-22	2026-10-01	10	0	PENDING
583	5007	2026-09-30	2026-10-02	3	0	PENDING
583	5008	2026-05-15	2026-05-15	\N	\N	PENDING
583	5009	2026-07-26	2026-07-26	1	0	PENDING
583	5010	2026-07-19	2026-07-19	1	0	PENDING
583	5011	2026-07-16	2026-07-17	2	0	PENDING
583	5012	2026-07-26	2026-07-26	1	0	PENDING
583	5013	2026-07-28	2026-07-28	1	0	PENDING
583	5014	2026-07-21	2026-07-21	1	0	PENDING
583	5015	2026-07-16	2026-09-16	\N	\N	PENDING
583	5022	2026-07-30	2026-07-30	1	0	PENDING
583	5023	2026-07-30	2026-07-30	1	0	PENDING
583	5024	2026-07-31	2026-07-31	1	0	PENDING
583	5025	2026-09-14	2026-09-14	1	0	PENDING
583	5026	2026-09-16	2026-09-16	1	0	PENDING
583	5027	2026-05-09	2026-10-17	\N	\N	PENDING
583	5028	2026-05-09	2026-10-08	\N	\N	PENDING
583	5029	2026-07-04	2026-07-13	10	0	PENDING
583	5030	2026-05-09	2026-05-13	5	0	PENDING
583	5031	2026-07-14	2026-07-16	3	0	PENDING
583	5032	2026-05-14	2026-05-16	3	0	PENDING
583	5033	2026-10-02	2026-10-08	7	0	PENDING
583	5034	2026-10-06	2026-10-08	3	0	PENDING
583	5035	2026-07-06	2026-10-17	\N	\N	PENDING
583	5036	2026-08-06	2026-08-07	2	0	PENDING
583	5037	2026-08-06	2026-08-06	1	0	PENDING
583	5038	2026-07-06	2026-07-08	3	0	PENDING
583	5039	2026-08-06	2026-08-07	2	0	PENDING
583	5040	2026-08-09	2026-08-09	1	0	PENDING
583	5041	2026-08-08	2026-08-08	1	0	PENDING
583	5042	2026-08-31	2026-08-31	1	0	PENDING
583	5043	2026-08-31	2026-08-31	1	0	PENDING
583	5044	2026-08-31	2026-08-31	1	0	PENDING
583	5045	2026-10-15	2026-10-15	1	0	PENDING
583	5046	2026-10-17	2026-10-17	1	0	PENDING
583	5047	2026-05-12	2026-09-17	\N	\N	PENDING
583	5048	2026-05-12	2026-09-17	\N	\N	PENDING
583	5049	2026-05-12	2026-05-31	20	0	PENDING
583	5050	2026-05-31	2026-06-04	5	0	PENDING
583	5051	2026-06-01	2026-06-07	7	0	PENDING
583	5052	2026-06-05	2026-06-11	7	0	PENDING
583	5053	2026-08-29	2026-09-17	20	0	PENDING
583	5054	2026-09-11	2026-09-17	7	0	PENDING
583	5055	2026-06-01	2026-08-22	\N	\N	PENDING
583	5056	2026-06-06	2026-06-07	2	0	PENDING
583	5057	2026-06-09	2026-06-09	1	0	PENDING
583	5058	2026-06-01	2026-06-05	5	0	PENDING
583	5059	2026-06-06	2026-06-06	1	0	PENDING
583	5060	2026-06-09	2026-06-09	1	0	PENDING
583	5061	2026-06-11	2026-06-11	1	0	PENDING
583	5062	2026-06-07	2026-06-07	1	0	PENDING
583	5063	2026-06-07	2026-06-07	1	0	PENDING
583	5064	2026-06-07	2026-06-07	1	0	PENDING
583	5065	2026-08-20	2026-08-20	1	0	PENDING
583	5066	2026-08-22	2026-08-22	1	0	PENDING
583	5067	2026-03-26	2026-09-02	\N	\N	PENDING
583	5068	2026-03-26	2026-09-02	\N	\N	PENDING
583	5069	2026-06-08	2026-07-02	25	0	PENDING
583	5070	2026-03-26	2026-03-30	5	0	PENDING
583	5071	2026-07-03	2026-07-05	3	0	PENDING
583	5072	2026-03-31	2026-04-02	3	0	PENDING
583	5073	2026-08-27	2026-09-02	7	0	PENDING
583	5074	2026-08-31	2026-09-02	3	0	PENDING
583	5075	2026-06-01	2026-08-22	\N	\N	PENDING
583	5076	2026-06-06	2026-06-07	2	0	PENDING
583	5077	2026-06-09	2026-06-09	1	0	PENDING
583	5078	2026-06-01	2026-06-03	3	0	PENDING
583	5079	2026-06-06	2026-06-07	2	0	PENDING
583	5080	2026-06-09	2026-06-09	1	0	PENDING
583	5081	2026-06-11	2026-06-11	1	0	PENDING
583	5082	2026-06-05	2026-06-05	1	0	PENDING
583	5083	2026-06-05	2026-06-05	1	0	PENDING
583	5084	2026-06-05	2026-06-05	1	0	PENDING
583	5085	2026-08-20	2026-08-20	1	0	PENDING
583	5086	2026-08-22	2026-08-22	1	0	PENDING
583	5087	2026-02-07	2026-11-02	\N	\N	PENDING
583	5088	2026-02-07	2026-11-02	\N	\N	PENDING
583	5089	2026-02-07	2026-04-17	70	0	PENDING
583	5090	2026-02-16	2026-06-05	110	0	PENDING
583	5091	2026-05-28	2026-07-11	45	0	PENDING
583	5092	2026-03-23	2026-06-10	80	0	PENDING
583	5093	2026-07-02	2026-10-09	100	0	PENDING
583	5094	2026-02-07	2026-02-07	\N	0	PENDING
583	5095	2026-02-07	2026-04-02	55	0	PENDING
583	5096	2026-02-14	2026-04-04	50	0	PENDING
583	5097	2026-05-28	2026-07-31	65	0	PENDING
583	5098	2026-03-23	2026-04-06	15	0	PENDING
583	5099	2026-08-01	2026-09-29	60	0	PENDING
583	5100	2026-02-21	2026-02-21	\N	0	PENDING
583	5101	2026-02-21	2026-04-21	60	0	PENDING
583	5102	2026-03-03	2026-07-25	145	0	PENDING
583	5103	2026-07-03	2026-09-10	70	0	PENDING
583	5104	2026-07-14	2026-09-16	65	0	PENDING
583	5105	2026-08-10	2026-10-08	60	0	PENDING
583	5106	2026-02-11	2026-02-11	\N	0	PENDING
583	5107	2026-02-11	2026-03-17	35	0	PENDING
583	5108	2026-03-08	2026-06-05	90	0	PENDING
583	5109	2026-04-13	2026-06-11	60	0	PENDING
583	5110	2026-04-10	2026-06-13	65	0	PENDING
583	5111	2026-06-15	2026-08-03	50	0	PENDING
583	5112	2026-02-07	2026-02-07	\N	0	PENDING
583	5113	2026-02-07	2026-03-23	45	0.2	IN_PROGRESS
583	5114	2026-03-04	2026-06-26	115	0.2	IN_PROGRESS
583	5115	2026-06-17	2026-09-04	80	0	PENDING
583	5116	2026-06-28	2026-09-05	70	0	PENDING
583	5117	2026-02-07	2026-03-23	45	0	PENDING
583	5118	2026-03-04	2026-06-26	115	0	PENDING
583	5119	2026-06-17	2026-09-04	80	0	PENDING
583	5120	2026-06-28	2026-09-05	70	0	PENDING
583	5121	2026-08-28	2026-11-02	67	0	PENDING
583	5122	2026-02-17	2026-02-21	5	0.7058824	IN_PROGRESS
583	5123	2026-02-19	2026-02-26	8	0.1	IN_PROGRESS
583	5124	2026-02-19	2026-02-26	8	0	PENDING
583	5125	2026-02-24	2026-03-03	8	0	PENDING
583	5126	2026-02-22	2026-02-22	\N	0	PENDING
583	5127	2026-02-07	2026-03-23	45	0.6	IN_PROGRESS
583	5128	2026-03-04	2026-06-26	115	0.6	IN_PROGRESS
583	5129	2026-06-17	2026-09-04	80	0	PENDING
583	5130	2026-06-28	2026-09-05	70	0	PENDING
583	5131	2026-02-07	2026-03-23	45	0.5	IN_PROGRESS
583	5132	2026-03-04	2026-06-26	115	0.5	IN_PROGRESS
583	5133	2026-06-17	2026-09-04	80	0	PENDING
583	5134	2026-06-28	2026-09-05	70	0	PENDING
583	5135	2026-08-28	2026-11-02	67	0	PENDING
583	5136	2026-02-22	2026-02-22	\N	0	PENDING
583	5137	2026-02-22	2026-03-23	30	0	PENDING
583	5138	2026-03-19	2026-05-17	60	0	PENDING
583	5139	2026-05-23	2026-07-16	55	0	PENDING
583	5140	2026-06-02	2026-07-18	47	0	PENDING
583	5141	2026-06-22	2026-07-27	36	0	PENDING
583	5142	2026-02-07	2026-02-07	\N	0	PENDING
583	5143	2026-02-12	2026-03-18	35	0	PENDING
583	5144	2026-03-09	2026-06-01	85	0	PENDING
583	5145	2026-05-23	2026-07-26	65	0	PENDING
583	5146	2026-05-28	2026-07-26	60	0	PENDING
583	5147	2026-07-09	2026-09-11	65	0	PENDING
583	5148	2026-02-12	2026-02-12	\N	0	PENDING
583	5154	2026-06-01	2026-06-01	\N	0	PENDING
583	5155	2026-06-11	2026-06-12	2	0	PENDING
583	5156	2026-06-09	2026-06-09	1	0	PENDING
583	5157	2026-06-01	2026-06-05	5	0	PENDING
583	5158	2026-06-06	2026-06-06	1	0	PENDING
583	5159	2026-06-09	2026-06-09	1	0	PENDING
583	5160	2026-06-11	2026-06-11	1	0	PENDING
583	5161	2026-06-07	2026-06-07	1	0	PENDING
583	5162	2026-06-07	2026-06-07	1	0	PENDING
583	5163	2026-06-07	2026-06-07	1	0	PENDING
583	5164	2026-08-20	2026-08-20	1	0	PENDING
583	5165	2026-08-22	2026-08-22	1	0	PENDING
583	5166	2026-06-01	2026-10-21	\N	\N	PENDING
583	5167	2026-06-01	2026-10-21	\N	\N	PENDING
583	5168	2026-08-06	2026-08-15	10	0	PENDING
583	5169	2026-06-01	2026-06-05	5	0	PENDING
583	5170	2026-08-16	2026-08-18	3	0	PENDING
583	5171	2026-06-06	2026-06-08	3	0	PENDING
583	5172	2026-10-15	2026-10-21	7	0	PENDING
583	5173	2026-10-19	2026-10-21	3	0	PENDING
583	5174	2026-07-06	2026-10-17	\N	\N	PENDING
583	5175	2026-08-06	2026-08-07	2	0	PENDING
583	5176	2026-08-06	2026-08-06	1	0	PENDING
583	5177	2026-07-06	2026-07-08	3	0	PENDING
583	5178	2026-08-06	2026-08-07	2	0	PENDING
583	5179	2026-08-09	2026-08-09	1	0	PENDING
583	5180	2026-08-08	2026-08-08	1	0	PENDING
583	5181	2026-08-31	2026-08-31	1	0	PENDING
583	5182	2026-08-31	2026-08-31	1	0	PENDING
583	5183	2026-08-31	2026-08-31	1	0	PENDING
583	5184	2026-10-15	2026-10-15	1	0	PENDING
583	5185	2026-10-17	2026-10-17	1	0	PENDING
583	5186	2026-04-18	2026-11-02	\N	\N	PENDING
583	5187	2026-04-18	2026-10-24	\N	\N	PENDING
583	5188	2026-08-23	2026-09-01	10	0	PENDING
583	5189	2026-04-18	2026-04-22	5	0	PENDING
583	5190	2026-09-02	2026-09-04	3	0	PENDING
583	5191	2026-04-23	2026-04-25	3	0	PENDING
583	5192	2026-10-17	2026-10-23	7	0	PENDING
583	5193	2026-10-24	2026-10-24	1	0	PENDING
583	5194	2026-07-12	2026-11-02	\N	\N	PENDING
583	5195	2026-08-23	2026-08-31	9	0	PENDING
583	5196	2026-09-02	2026-09-07	6	0	PENDING
583	5197	2026-08-23	2026-08-30	8	0	PENDING
583	5198	2026-09-01	2026-09-05	5	0	PENDING
583	5199	2026-07-12	2026-07-23	12	0	PENDING
583	5200	2026-07-25	2026-07-31	7	0	PENDING
583	5201	2026-08-23	2026-08-25	3	0	PENDING
583	5202	2026-09-02	2026-09-04	3	0	PENDING
583	5203	2026-09-02	2026-09-02	1	0	PENDING
583	5204	2026-09-09	2026-09-09	1	0	PENDING
583	5205	2026-09-01	2026-09-01	1	0	PENDING
583	5206	2026-09-07	2026-09-07	1	0	PENDING
583	5207	2026-08-23	2026-08-24	2	0	PENDING
583	5208	2026-08-26	2026-08-27	2	0	PENDING
583	5209	2026-08-29	2026-08-30	2	0	PENDING
583	5210	2026-08-23	2026-08-29	7	0	PENDING
583	5211	2026-08-31	2026-09-03	4	0	PENDING
583	5212	2026-08-23	2026-08-24	2	0	PENDING
583	5213	2026-08-31	2026-08-31	1	0	PENDING
583	5214	2026-10-27	2026-10-28	2	0	PENDING
583	5215	2026-10-30	2026-10-31	2	0	PENDING
583	5216	2026-11-02	2026-11-02	1	0	PENDING
583	5217	2026-06-18	2026-10-21	\N	\N	PENDING
583	5218	2026-06-18	2026-10-21	\N	\N	PENDING
583	5219	2026-08-09	2026-08-18	10	0	PENDING
583	5220	2026-06-18	2026-06-22	5	0	PENDING
583	5221	2026-08-19	2026-08-21	3	0	PENDING
583	5222	2026-06-23	2026-06-25	3	0	PENDING
583	5223	2026-10-15	2026-10-21	7	0	PENDING
583	5224	2026-10-19	2026-10-21	3	0	PENDING
583	5225	2026-07-15	2026-10-06	\N	\N	PENDING
583	5226	2026-08-09	2026-08-10	2	0	PENDING
583	5227	2026-08-12	2026-08-12	1	0	PENDING
583	5228	2026-08-09	2026-08-10	2	0	PENDING
583	5229	2026-08-12	2026-08-12	1	0	PENDING
583	5230	2026-07-15	2026-07-17	3	0	PENDING
583	5231	2026-07-19	2026-07-19	1	0	PENDING
583	5232	2026-08-09	2026-08-10	2	0	PENDING
583	5233	2026-08-12	2026-08-12	1	0	PENDING
583	5234	2026-08-12	2026-08-12	1	0	PENDING
583	5235	2026-08-14	2026-08-14	1	0	PENDING
583	5236	2026-08-12	2026-08-12	1	0	PENDING
583	5237	2026-08-14	2026-08-14	1	0	PENDING
583	5238	2026-08-23	2026-08-23	1	0	PENDING
583	5239	2026-08-25	2026-08-25	1	0	PENDING
583	5240	2026-08-22	2026-08-22	1	0	PENDING
583	5241	2026-08-24	2026-08-24	1	0	PENDING
583	5242	2026-08-26	2026-08-26	1	0	PENDING
583	5243	2026-08-26	2026-08-26	1	0	PENDING
583	5244	2026-10-04	2026-10-04	1	0	PENDING
583	5245	2026-10-04	2026-10-04	1	0	PENDING
583	5246	2026-10-06	2026-10-06	1	0	PENDING
583	5247	2026-06-18	2026-10-21	\N	\N	PENDING
583	5248	2026-06-18	2026-10-21	\N	\N	PENDING
583	5249	2026-08-09	2026-08-18	10	0	PENDING
583	5250	2026-06-18	2026-06-22	5	0	PENDING
583	5251	2026-08-19	2026-08-21	3	0	PENDING
583	5252	2026-06-23	2026-06-25	3	0	PENDING
583	5253	2026-10-15	2026-10-21	7	0	PENDING
583	5254	2026-10-19	2026-10-21	3	0	PENDING
583	5255	2026-07-15	2026-10-06	\N	\N	PENDING
583	5256	2026-08-09	2026-08-10	2	0	PENDING
583	5257	2026-08-12	2026-08-12	1	0	PENDING
583	5258	2026-08-09	2026-08-10	2	0	PENDING
583	5259	2026-08-12	2026-08-12	1	0	PENDING
583	5260	2026-07-15	2026-07-17	3	0	PENDING
583	5261	2026-07-19	2026-07-19	1	0	PENDING
583	5262	2026-08-09	2026-08-10	2	0	PENDING
583	5263	2026-08-12	2026-08-12	1	0	PENDING
583	5264	2026-08-12	2026-08-12	1	0	PENDING
583	5265	2026-08-14	2026-08-14	1	0	PENDING
583	5266	2026-08-12	2026-08-12	1	0	PENDING
583	5267	2026-08-14	2026-08-14	1	0	PENDING
583	5268	2026-08-23	2026-08-23	1	0	PENDING
583	5269	2026-08-25	2026-08-25	1	0	PENDING
583	5270	2026-08-22	2026-08-22	1	0	PENDING
583	5271	2026-08-24	2026-08-24	1	0	PENDING
583	5272	2026-08-26	2026-08-26	1	0	PENDING
583	5273	2026-08-26	2026-08-26	1	0	PENDING
583	5274	2026-10-04	2026-10-04	1	0	PENDING
583	5275	2026-10-04	2026-10-04	1	0	PENDING
583	5276	2026-10-06	2026-10-06	1	0	PENDING
583	5277	2026-01-29	2026-08-04	\N	\N	PENDING
583	5278	2026-01-29	2026-08-04	\N	\N	PENDING
583	5279	2026-06-03	2026-06-12	10	0	PENDING
583	5280	2026-01-29	2026-02-02	5	0	PENDING
583	5281	2026-06-13	2026-06-15	3	0	PENDING
583	5282	2026-02-13	2026-02-14	2	0.8	IN_PROGRESS
583	5283	2026-02-08	2026-02-10	3	0	PENDING
583	5284	2026-07-30	2026-08-03	5	0	PENDING
583	5285	2026-08-04	2026-08-04	1	0	PENDING
583	5286	2026-04-22	2026-08-01	\N	\N	PENDING
583	5287	2026-06-03	2026-06-04	2	0	PENDING
583	5288	2026-06-03	2026-06-03	1	0	PENDING
583	5289	2026-04-22	2026-04-23	2	0	PENDING
583	5290	2026-06-03	2026-06-03	1	0	PENDING
583	5291	2026-06-06	2026-06-06	1	0	PENDING
583	5292	2026-06-05	2026-06-05	1	0	PENDING
583	5293	2026-04-25	2026-04-25	1	0	PENDING
583	5294	2026-06-08	2026-06-08	1	0	PENDING
583	5295	2026-06-10	2026-06-10	1	0	PENDING
583	5296	2026-07-30	2026-07-30	1	0	PENDING
583	5297	2026-08-01	2026-08-01	1	0	PENDING
583	5832	\N	\N	\N	\N	PENDING
583	5833	\N	\N	\N	\N	PENDING
583	5834	\N	\N	\N	\N	PENDING
583	5835	\N	\N	\N	\N	PENDING
583	5836	\N	\N	\N	\N	PENDING
583	5837	\N	\N	\N	\N	PENDING
583	5838	\N	\N	\N	\N	PENDING
583	5839	\N	\N	\N	\N	PENDING
583	5840	\N	\N	\N	\N	PENDING
583	5841	\N	\N	\N	0.5	PENDING
583	5842	\N	\N	\N	\N	PENDING
583	5843	\N	\N	\N	\N	PENDING
583	5844	\N	\N	\N	\N	PENDING
583	5845	\N	\N	\N	\N	PENDING
583	5846	\N	\N	\N	\N	PENDING
583	5847	\N	\N	\N	\N	PENDING
583	5848	\N	\N	\N	\N	PENDING
583	5849	\N	\N	\N	\N	PENDING
583	5850	\N	\N	\N	\N	PENDING
583	5851	\N	\N	\N	\N	PENDING
583	5852	\N	\N	\N	\N	PENDING
583	5853	\N	\N	\N	\N	PENDING
583	5854	\N	\N	\N	\N	PENDING
583	5855	\N	\N	\N	\N	PENDING
583	5856	\N	\N	\N	\N	PENDING
583	5857	\N	\N	\N	\N	PENDING
583	5858	\N	\N	\N	\N	PENDING
583	5859	\N	\N	\N	\N	PENDING
583	5860	\N	\N	\N	\N	PENDING
583	5861	\N	\N	\N	\N	PENDING
583	5862	\N	\N	\N	\N	PENDING
583	5863	\N	\N	\N	\N	PENDING
583	5864	\N	\N	\N	\N	PENDING
583	5865	\N	\N	\N	\N	PENDING
583	5866	\N	\N	\N	\N	PENDING
583	5867	\N	\N	\N	\N	PENDING
583	5868	\N	\N	\N	\N	PENDING
583	5869	\N	\N	\N	\N	PENDING
583	5870	\N	\N	\N	\N	PENDING
583	5871	\N	\N	\N	\N	PENDING
583	5872	\N	\N	\N	\N	PENDING
583	5873	\N	\N	\N	\N	PENDING
583	5874	\N	\N	\N	\N	PENDING
583	5875	\N	\N	\N	\N	PENDING
583	5876	\N	\N	\N	\N	PENDING
583	5877	\N	\N	\N	\N	PENDING
583	5878	\N	\N	\N	\N	PENDING
583	5879	\N	\N	\N	\N	PENDING
591	3319	2026-03-31	2026-03-31	1	0.5	DONE
591	3320	2026-04-06	2026-04-06	1	1	DONE
591	3321	2026-04-12	2026-04-12	1	1	DONE
591	3322	2026-06-20	2026-06-21	2	1	DONE
591	3323	2026-06-23	2026-06-27	5	1	DONE
591	3324	2026-06-29	2026-07-03	5	1	DONE
591	3325	2026-03-29	2026-03-29	1	1	DONE
591	3326	2026-03-31	2026-04-04	5	1	DONE
591	3327	2026-07-10	2026-07-12	3	1	DONE
591	3329	2026-07-07	2026-07-07	1	1	DONE
591	3335	2026-05-08	2026-05-27	\N	1	DONE
591	3340	2026-05-23	2026-05-23	\N	1	DONE
591	3345	2026-06-11	2026-06-11	\N	1	DONE
591	3351	\N	\N	\N	1	DONE
591	3357	2026-04-06	2026-04-10	5	1	DONE
591	3358	2026-06-20	2026-06-21	2	1	DONE
591	3359	2026-06-23	2026-06-27	5	1	DONE
591	3360	2026-06-29	2026-07-03	5	1	DONE
591	3361	2026-06-23	2026-06-23	1	1	DONE
591	3362	2026-06-29	2026-06-29	1	1	DONE
591	3363	2026-07-05	2026-07-05	1	1	DONE
591	3367	2026-07-05	2026-07-06	2	1	DONE
591	3368	2026-07-05	2026-07-06	2	1	DONE
591	3369	2026-07-08	2026-07-09	2	1	DONE
591	3370	2026-07-05	2026-07-06	2	1	DONE
591	3371	2026-07-07	2026-07-09	3	1	DONE
591	3373	2026-03-29	2026-03-29	\N	1	DONE
591	3395	2026-03-29	2026-03-30	\N	1	DONE
591	3417	2026-03-29	2026-03-29	\N	1	DONE
591	3439	2026-07-05	2026-07-05	1	1	DONE
591	3441	2026-07-09	2026-07-09	1	1	DONE
591	3442	2026-07-14	2026-07-14	1	1	DONE
591	3443	2026-03-12	2026-10-11	213	\N	DONE
591	3444	2026-05-19	2026-05-21	3	1	DONE
591	3445	2026-03-12	2026-10-11	\N	\N	DONE
591	3446	2026-05-29	2026-05-30	2	1	DONE
591	3447	2026-05-29	2026-05-29	1	1	DONE
591	3448	2026-06-17	2026-06-18	2	1	DONE
591	3449	2026-06-01	2026-06-02	2	1	DONE
591	3450	2026-06-01	2026-06-01	1	1	DONE
591	3451	2026-05-31	2026-05-31	1	1	DONE
591	3452	2026-05-29	2026-08-13	\N	\N	DONE
591	3459	2026-06-20	2026-06-20	1	1	DONE
591	3460	2026-06-01	2026-06-01	1	1	DONE
591	3461	2026-06-02	2026-06-02	1	1	DONE
591	3462	2026-08-12	2026-08-12	1	1	DONE
591	3463	2026-08-13	2026-08-13	1	0.35	DONE
591	3464	2026-04-06	2026-10-13	190	\N	DONE
591	3465	2026-05-19	2026-05-21	3	1	DONE
591	3466	2026-04-06	2026-10-13	\N	\N	DONE
591	3467	2026-05-29	2026-05-30	2	1	DONE
591	3468	2026-05-29	2026-05-29	1	1	DONE
591	3469	2026-06-17	2026-06-20	4	1	DONE
591	3470	2026-06-01	2026-06-02	2	1	DONE
591	3471	2026-06-01	2026-06-01	1	1	DONE
591	3472	2026-05-31	2026-05-31	1	1	DONE
591	3473	2026-05-29	2026-08-13	\N	\N	DONE
591	3480	2026-06-22	2026-06-22	1	1	DONE
591	3481	2026-06-01	2026-06-01	1	1	DONE
591	3482	2026-06-02	2026-06-02	1	0.95	DONE
591	3483	2026-08-12	2026-08-12	1	1	DONE
591	3484	2026-08-13	2026-08-13	1	0.4	DONE
591	3485	2026-05-12	2026-09-26	137	\N	DONE
591	3486	2026-05-19	2026-05-21	3	1	DONE
591	3487	2026-05-12	2026-09-26	\N	\N	DONE
591	3488	2026-06-23	2026-06-24	2	0.15	DONE
591	3489	2026-06-23	2026-06-23	1	0.15	DONE
591	3490	2026-05-22	2026-05-24	3	0.15	DONE
591	3491	2026-06-23	2026-06-24	2	0.15	DONE
591	3492	2026-06-26	2026-06-26	1	0.15	DONE
591	3493	2026-06-25	2026-06-25	1	0.15	DONE
591	3494	2026-05-22	2026-09-23	\N	\N	DONE
591	3501	2026-07-18	2026-07-18	1	0.15	DONE
591	3502	2026-07-18	2026-07-18	1	0.15	DONE
591	3503	2026-07-19	2026-07-19	1	0.15	DONE
591	3504	2026-09-21	2026-09-21	1	0.15	DONE
591	3505	2026-09-23	2026-09-23	1	0	DONE
591	3506	2026-05-12	2026-12-29	231	\N	DONE
591	3507	2026-05-19	2026-05-21	3	1	DONE
591	3508	2026-05-12	2026-09-26	\N	\N	DONE
591	3509	2026-07-04	2026-07-05	2	0.1	DONE
591	3510	2026-07-04	2026-07-04	1	0.1	DONE
591	3511	2026-06-02	2026-06-04	3	0.1	DONE
591	3512	2026-07-04	2026-07-05	2	0.1	DONE
591	3513	2026-10-04	2026-10-04	1	0	DONE
591	3514	2026-12-29	2026-12-29	1	0	DONE
591	3515	2026-06-02	2026-12-29	\N	\N	DONE
591	3522	2026-02-14	2026-10-12	240	\N	DONE
591	3523	2026-05-19	2026-05-21	3	1	DONE
591	3524	2026-02-14	2026-10-12	\N	\N	DONE
591	3525	2026-06-12	2026-06-13	2	0.9	DONE
591	3526	2026-06-12	2026-06-12	1	0.9	DONE
591	3527	2026-05-07	2026-05-08	2	0.9	DONE
591	3528	2026-06-12	2026-06-13	2	0.9	DONE
591	3529	2026-06-15	2026-06-15	1	0.9	DONE
591	3530	2026-06-14	2026-06-14	1	0.9	DONE
591	3531	2026-05-07	2026-08-14	\N	\N	DONE
591	3532	\N	\N	\N	\N	PENDING
591	3539	2026-05-10	2026-05-10	1	0.9	DONE
591	3540	2026-06-15	2026-06-15	1	0.9	DONE
591	3541	2026-06-17	2026-06-17	1	0	DONE
591	3542	2026-08-12	2026-08-12	1	0.9	DONE
591	3543	2026-08-14	2026-08-14	1	0	DONE
591	3544	\N	\N	\N	\N	PENDING
591	3556	2026-04-20	2026-10-02	165	\N	DONE
591	3557	2026-05-19	2026-05-21	3	1	DONE
591	3558	2026-04-20	2026-10-02	\N	\N	DONE
591	3559	2026-07-26	2026-07-26	1	1	DONE
591	3560	2026-07-19	2026-07-19	1	1	DONE
591	3561	2026-07-16	2026-07-17	2	1	DONE
591	3562	2026-07-26	2026-07-26	1	1	DONE
591	3563	2026-07-28	2026-07-28	1	1	DONE
591	3564	2026-07-21	2026-07-21	1	1	DONE
591	3565	2026-07-16	2026-09-16	\N	\N	DONE
591	3572	2026-07-30	2026-07-30	1	1	DONE
591	3573	2026-07-30	2026-07-30	1	1	DONE
591	3574	2026-07-31	2026-07-31	1	0.95	DONE
591	3575	2026-09-14	2026-09-14	1	1	DONE
591	3576	2026-09-16	2026-09-16	1	0	DONE
591	3577	2026-05-09	2026-10-17	161	\N	DONE
591	3578	2026-05-19	2026-05-21	3	1	DONE
591	3579	2026-05-09	2026-10-08	\N	\N	DONE
591	3580	2026-08-06	2026-08-07	2	0.15	DONE
591	3581	2026-08-06	2026-08-06	1	0.15	DONE
591	3582	2026-07-06	2026-07-08	3	0.15	DONE
591	3583	2026-08-06	2026-08-07	2	0.15	DONE
591	3584	2026-08-09	2026-08-09	1	0.15	DONE
591	3585	2026-08-08	2026-08-08	1	0.15	DONE
591	3586	2026-07-06	2026-10-17	\N	\N	DONE
591	3593	2026-08-31	2026-08-31	1	0.15	DONE
591	3594	2026-08-31	2026-08-31	1	0	DONE
591	3595	2026-10-15	2026-10-15	1	0.15	DONE
591	3596	2026-10-17	2026-10-17	1	0	DONE
591	3597	2026-05-12	2026-09-17	128	\N	DONE
591	3598	2026-05-19	2026-05-21	3	1	DONE
591	3599	2026-05-12	2026-09-17	\N	\N	DONE
591	3600	2026-06-06	2026-06-07	2	0.2	DONE
591	3601	2026-06-09	2026-06-09	1	0.2	DONE
591	3602	2026-06-01	2026-06-05	5	0.2	DONE
591	3603	2026-06-06	2026-06-06	1	0.2	DONE
591	3604	2026-06-09	2026-06-09	1	0.2	DONE
591	3605	2026-06-11	2026-06-11	1	0.2	DONE
591	3606	2026-06-01	2026-08-22	\N	\N	DONE
591	3613	2026-06-07	2026-06-07	1	0.2	DONE
591	3614	2026-06-07	2026-06-07	1	0.2	DONE
591	3615	2026-06-07	2026-06-07	1	0.2	DONE
591	3616	2026-08-20	2026-08-20	1	0.2	DONE
591	3617	2026-08-22	2026-08-22	1	0	DONE
591	3618	2026-03-26	2026-09-02	160	\N	DONE
591	3619	2026-05-19	2026-05-21	3	1	DONE
591	3620	2026-03-26	2026-09-02	\N	\N	DONE
591	3621	2026-06-06	2026-06-07	2	0.35	DONE
591	3622	2026-06-09	2026-06-09	1	0.35	DONE
591	3623	2026-06-01	2026-06-03	3	0.35	DONE
591	3624	2026-06-06	2026-06-07	2	0.35	DONE
591	3625	2026-06-09	2026-06-09	1	0.35	DONE
591	3626	2026-06-11	2026-06-11	1	0	DONE
591	3627	2026-06-01	2026-08-22	\N	\N	DONE
591	3634	2026-06-05	2026-06-05	1	0	DONE
591	3635	2026-06-05	2026-06-05	1	0	DONE
591	3636	2026-06-05	2026-06-05	1	0.35	DONE
591	3637	2026-08-20	2026-08-20	1	0	DONE
591	3638	2026-08-22	2026-08-22	1	0	DONE
591	3639	2026-02-24	2026-03-03	8	1	DONE
591	3640	\N	\N	\N	1	DONE
591	3641	2026-02-07	2026-11-02	\N	0.95	DONE
591	3642	2026-02-21	2026-04-21	60	0.35	DONE
591	3643	2026-03-03	2026-07-25	145	0.35	DONE
591	3644	2026-07-03	2026-09-10	70	0.35	DONE
591	3645	2026-07-14	2026-09-16	65	0.35	DONE
591	3646	2026-08-10	2026-10-08	60	0.35	DONE
591	3647	2026-02-17	2026-02-21	5	0.6	IN_PROGRESS
591	3648	2026-02-19	2026-02-26	8	0.6	IN_PROGRESS
591	3649	2026-02-19	2026-02-26	8	0.6	IN_PROGRESS
591	3650	2026-02-24	2026-03-03	8	0.6	IN_PROGRESS
591	3651	\N	\N	8	0	PENDING
591	3652	2026-02-07	2026-02-07	\N	0.95	DONE
591	3658	2026-02-21	2026-02-21	\N	0.95	DONE
591	3669	2026-02-11	2026-02-11	\N	0.95	DONE
591	3680	2026-02-07	2026-02-07	\N	0.95	DONE
591	3691	2026-02-19	2026-02-26	8	1	DONE
591	3692	2026-02-19	2026-02-26	8	1	DONE
591	3695	2026-02-22	2026-02-22	\N	0.95	DONE
591	3705	2026-02-22	2026-02-22	\N	0.95	DONE
591	3711	2026-02-07	2026-02-07	\N	0.95	DONE
591	3722	2026-02-21	2026-02-21	\N	0.25	DONE
591	3733	2026-05-19	2026-10-21	155	\N	DONE
591	3734	2026-05-19	2026-05-21	3	1	DONE
591	3735	2026-06-01	2026-10-21	\N	\N	DONE
591	3736	2026-08-06	2026-08-07	2	0.35	DONE
591	3737	2026-08-06	2026-08-06	1	0.35	DONE
591	3738	2026-07-06	2026-07-08	3	0.35	DONE
591	3739	2026-08-06	2026-08-07	2	0.35	DONE
591	3740	2026-08-09	2026-08-09	1	0.35	DONE
591	3741	2026-08-08	2026-08-08	1	0.35	DONE
591	3742	2026-07-06	2026-10-17	\N	\N	DONE
591	3749	2026-08-31	2026-08-31	1	0.35	DONE
591	3750	2026-08-31	2026-08-31	1	0.35	DONE
591	3751	2026-08-31	2026-08-31	1	0	DONE
591	3752	2026-10-15	2026-10-15	1	0.35	DONE
591	3753	2026-10-17	2026-10-17	1	0	DONE
591	3754	2026-08-23	2026-08-24	2	1	DONE
591	3755	2026-08-26	2026-08-27	2	0	DONE
591	3756	2026-08-29	2026-08-30	2	0.35	DONE
591	3757	2026-08-23	2026-08-31	9	1	DONE
591	3758	2026-09-02	2026-09-07	6	0.8	DONE
591	3759	2026-08-23	2026-08-30	8	1	DONE
591	3760	2026-09-01	2026-09-05	5	0.8	DONE
591	3761	2026-07-12	2026-07-23	12	1	DONE
591	3762	2026-07-25	2026-07-31	7	0.8	DONE
591	3763	2026-11-02	2026-11-02	1	0	DONE
591	3770	2026-08-23	2026-08-25	3	1	DONE
591	3771	2026-09-02	2026-09-04	3	0.8	DONE
591	3772	2026-09-02	2026-09-02	1	1	DONE
591	3773	2026-09-09	2026-09-09	1	0	DONE
591	3774	2026-09-01	2026-09-01	1	1	DONE
591	3775	2026-09-07	2026-09-07	1	0	DONE
591	3779	2026-08-23	2026-08-29	7	1	DONE
591	3780	2026-08-31	2026-09-03	4	0.25	DONE
591	3781	2026-08-23	2026-08-24	2	1	DONE
591	3782	2026-08-31	2026-08-31	1	0.25	DONE
591	3783	2026-10-27	2026-10-28	2	1	DONE
591	3784	2026-10-30	2026-10-31	2	0.35	DONE
591	3786	2026-05-19	2026-10-21	155	\N	DONE
591	3787	2026-05-19	2026-05-21	3	1	DONE
591	3788	2026-06-18	2026-10-21	\N	\N	DONE
591	3789	2026-08-09	2026-08-10	2	0	DONE
591	3790	2026-08-12	2026-08-12	1	0	DONE
591	3791	2026-08-09	2026-08-10	2	0	DONE
591	3792	2026-08-12	2026-08-12	1	0	DONE
591	3793	2026-07-15	2026-07-17	3	0	DONE
591	3794	2026-08-26	2026-08-26	1	0	DONE
591	3795	2026-07-15	2026-10-06	\N	\N	DONE
591	3801	2026-07-19	2026-07-19	1	0	DONE
591	3802	2026-08-09	2026-08-10	2	0	DONE
591	3803	2026-08-12	2026-08-12	1	0	DONE
591	3804	2026-08-12	2026-08-12	1	0	DONE
591	3805	2026-08-14	2026-08-14	1	0	DONE
591	3806	2026-08-12	2026-08-12	1	0	DONE
591	3807	2026-08-14	2026-08-14	1	0	DONE
591	3808	2026-08-23	2026-08-23	1	0	DONE
591	3809	2026-08-25	2026-08-25	1	0	DONE
591	3810	2026-08-22	2026-08-22	1	0	DONE
591	3811	2026-08-24	2026-08-24	1	0	DONE
591	3812	2026-08-26	2026-08-26	1	0	DONE
591	3814	2026-10-04	2026-10-04	1	0	DONE
591	3815	2026-10-04	2026-10-04	1	0	DONE
591	3816	2026-10-06	2026-10-06	1	0	DONE
591	3817	2026-08-23	2026-08-23	1	0	DONE
591	3818	2026-08-25	2026-08-25	1	0	DONE
591	3819	2026-08-22	2026-08-22	1	0	DONE
591	3820	2026-08-09	2026-08-10	2	0	DONE
591	3821	2026-08-12	2026-08-12	1	0	DONE
591	3822	2026-08-09	2026-08-10	2	0	DONE
591	3823	2026-08-12	2026-08-12	1	0	DONE
591	3824	2026-07-15	2026-07-17	3	0	DONE
591	3825	2026-07-19	2026-07-19	1	0	DONE
591	3826	2026-07-15	2026-10-06	\N	\N	DONE
591	3833	2026-08-09	2026-08-10	2	0	DONE
591	3834	2026-08-12	2026-08-12	1	0	DONE
591	3835	2026-08-12	2026-08-12	1	0	DONE
591	3836	2026-08-14	2026-08-14	1	0	DONE
591	3837	2026-08-12	2026-08-12	1	0	DONE
591	3838	2026-08-14	2026-08-14	1	0	DONE
591	3842	2026-08-24	2026-08-24	1	0	DONE
591	3843	2026-08-26	2026-08-26	1	0	DONE
591	3844	2026-08-26	2026-08-26	1	0	DONE
591	3845	2026-10-04	2026-10-04	1	0	DONE
591	3846	2026-10-04	2026-10-04	1	0	DONE
591	3847	2026-10-06	2026-10-06	1	0	DONE
591	3848	2026-01-29	2026-11-22	297	0.2	DONE
591	3849	2026-05-19	2026-05-21	3	1	DONE
591	3850	2026-01-29	2026-08-04	\N	0.2	DONE
591	3851	2026-06-03	2026-06-04	2	1	DONE
591	3852	2026-06-03	2026-06-03	1	1	DONE
591	3853	2026-04-22	2026-04-23	2	0.85	DONE
591	3854	2026-08-01	2026-08-01	1	0.1	DONE
591	3855	2026-08-04	2026-08-04	1	0	DONE
591	3856	2026-04-22	2026-11-22	\N	\N	DONE
591	3860	2026-06-03	2026-06-03	1	0.85	DONE
591	3861	2026-11-22	2026-11-22	1	0.15	DONE
591	3863	2026-05-19	2026-10-21	155	0.5	DONE
591	3864	2026-05-19	2026-05-21	3	1	DONE
591	3865	2026-06-01	2026-10-21	\N	\N	DONE
591	3866	2026-08-06	2026-08-07	2	0.35	DONE
591	3867	2026-08-06	2026-08-06	1	0.35	DONE
591	3868	2026-07-06	2026-07-08	3	0.35	DONE
591	3869	2026-08-06	2026-08-07	2	0.35	DONE
591	3870	2026-08-09	2026-08-09	1	0.35	DONE
591	3871	2026-08-08	2026-08-08	1	0.35	DONE
591	3872	2026-07-06	2026-10-17	\N	\N	DONE
591	3879	2026-08-31	2026-08-31	1	0.35	DONE
591	3880	2026-08-31	2026-08-31	1	0.35	DONE
591	3881	2026-08-31	2026-08-31	1	0	DONE
591	3882	2026-10-15	2026-10-15	1	0.35	DONE
591	3883	2026-10-17	2026-10-17	1	0	DONE
591	4766	2026-01-19	2026-07-29	\N	0	PENDING
591	4767	2026-01-19	2026-07-17	\N	0	PENDING
591	4768	2026-01-19	2026-01-20	2	0.65	IN_PROGRESS
591	4769	2026-02-23	2026-03-04	10	0.8	IN_PROGRESS
591	4770	2026-02-07	2026-02-26	20	0.9	IN_PROGRESS
591	4771	2026-05-08	2026-06-07	31	0	PENDING
591	4772	2026-06-28	2026-07-12	15	0	PENDING
591	4773	2026-03-29	2026-03-29	\N	0	PENDING
591	4774	2026-05-01	2026-05-30	30	0	PENDING
591	4775	2026-03-29	2026-03-29	\N	0	PENDING
591	4776	2026-03-29	2026-04-17	20	0	PENDING
591	4777	2026-04-17	2026-04-19	3	0	PENDING
591	4778	2026-04-23	2026-05-12	20	0	PENDING
591	4779	2026-05-12	2026-05-12	1	0	PENDING
591	4780	2026-05-08	2026-05-08	\N	0	PENDING
591	4781	2026-05-08	2026-05-27	20	0	PENDING
591	4782	2026-05-25	2026-05-27	3	0	PENDING
591	4783	2026-06-04	2026-06-23	20	0	PENDING
591	4784	2026-06-24	2026-06-24	1	0	PENDING
591	4785	2026-05-23	2026-05-23	\N	0	PENDING
591	4786	2026-06-04	2026-06-23	20	0	PENDING
591	4787	2026-05-23	2026-05-25	3	0	PENDING
591	4788	2026-06-27	2026-07-11	15	0	PENDING
591	4789	2026-07-17	2026-07-17	1	0	PENDING
591	4790	2026-06-11	2026-06-11	\N	0	PENDING
591	4791	2026-06-11	2026-06-30	20	0	PENDING
591	4792	2026-03-29	2026-07-29	\N	0.5	PENDING
591	4793	2026-07-02	2026-07-16	15	0	PENDING
591	4794	2026-07-17	2026-07-17	1	0	PENDING
591	4796	\N	\N	\N	\N	PENDING
591	4797	2026-06-20	2026-06-20	1	0	PENDING
591	4798	2026-06-22	2026-06-24	3	0	PENDING
591	4799	2026-03-29	2026-03-29	1	0	PENDING
591	4800	2026-04-08	2026-04-10	3	0	PENDING
591	4801	2026-06-20	2026-06-21	2	0	PENDING
591	4802	2026-06-23	2026-06-25	3	0	PENDING
591	4803	2026-05-01	2026-05-01	1	0	PENDING
591	4804	2026-05-03	2026-05-05	3	0	PENDING
591	4805	2026-06-22	2026-06-23	2	0	PENDING
591	4806	2026-06-26	2026-06-27	2	0	PENDING
591	4807	2026-03-31	2026-03-31	1	0	PENDING
591	4808	2026-04-12	2026-04-12	1	0	PENDING
591	4809	2026-06-23	2026-06-25	3	0	PENDING
591	4810	2026-06-27	2026-06-28	2	0	PENDING
591	4811	2026-06-23	2026-06-23	1	0	PENDING
591	4812	2026-06-25	2026-06-28	4	0	PENDING
591	4813	2026-06-30	2026-06-30	1	0	PENDING
591	4814	2026-07-02	2026-07-03	2	0	PENDING
591	4815	2026-06-25	2026-06-25	1	0	PENDING
591	4816	2026-06-30	2026-06-30	1	0	PENDING
591	4817	2026-07-19	2026-07-19	1	0	PENDING
591	4818	\N	\N	\N	\N	PENDING
591	4819	2026-06-20	2026-06-20	1	0	PENDING
591	4820	2026-06-20	2026-06-22	3	0	PENDING
591	4821	2026-03-29	2026-03-29	1	0	PENDING
591	4822	2026-03-29	2026-03-30	2	0	PENDING
591	4823	2026-06-20	2026-06-21	2	0	PENDING
591	4824	2026-06-20	2026-06-21	2	0	PENDING
591	4825	2026-05-01	2026-05-02	2	0	PENDING
591	4826	2026-05-01	2026-05-03	3	0	PENDING
591	4827	2026-06-21	2026-06-23	3	0	PENDING
591	4828	2026-06-24	2026-06-24	1	0	PENDING
591	4829	2026-03-30	2026-03-31	2	0	PENDING
591	4830	2026-04-01	2026-04-01	1	0	PENDING
591	4831	2026-04-01	2026-04-02	2	0	PENDING
591	4832	2026-04-22	2026-04-22	1	0	PENDING
591	4833	2026-06-20	2026-06-21	2	0	PENDING
591	4834	2026-06-21	2026-06-22	2	0	PENDING
591	4835	2026-06-21	2026-06-23	3	0	PENDING
591	4836	2026-06-24	2026-06-24	1	0	PENDING
591	4837	2026-06-21	2026-06-22	2	0	PENDING
591	4838	2026-06-26	2026-06-26	1	0	PENDING
591	4839	2026-07-29	2026-07-29	1	0	PENDING
591	4840	\N	\N	\N	\N	PENDING
591	4841	2026-06-20	2026-06-21	2	0	PENDING
591	4842	2026-06-23	2026-06-24	2	0	PENDING
591	4843	2026-03-29	2026-03-30	2	0	PENDING
591	4844	2026-04-01	2026-04-02	2	0	PENDING
591	4845	2026-06-20	2026-06-21	2	0	PENDING
591	4846	2026-06-21	2026-06-22	2	0	PENDING
591	4847	2026-05-01	2026-05-02	2	0	PENDING
591	4848	2026-05-04	2026-05-06	3	0	PENDING
591	4849	2026-06-23	2026-06-23	1	0	PENDING
591	4850	2026-06-26	2026-06-26	1	0	PENDING
591	4851	2026-04-01	2026-04-01	1	0	PENDING
591	4852	2026-04-04	2026-04-04	1	0	PENDING
591	4853	2026-04-01	2026-04-01	1	0	PENDING
591	4854	2026-04-22	2026-04-23	2	0	PENDING
591	4855	2026-06-25	2026-06-25	1	0	PENDING
591	4856	2026-06-28	2026-06-29	2	0	PENDING
591	4857	2026-06-27	2026-06-27	1	0	PENDING
591	4858	2026-06-29	2026-06-29	1	0	PENDING
591	4859	2026-07-15	2026-07-15	1	0	PENDING
591	4860	2026-07-17	2026-07-17	1	0	PENDING
591	4861	2026-07-19	2026-07-19	1	0	PENDING
591	4862	\N	\N	\N	\N	PENDING
591	4863	2026-06-20	2026-06-21	2	0	PENDING
591	4864	2026-06-23	2026-06-27	5	0	PENDING
591	4865	2026-06-29	2026-07-03	5	0	PENDING
591	4866	2026-03-29	2026-03-29	1	0	PENDING
591	4867	2026-03-31	2026-04-04	5	0	PENDING
591	4868	2026-04-06	2026-04-10	5	0	PENDING
591	4869	2026-06-20	2026-06-21	2	0	PENDING
591	4870	2026-06-23	2026-06-27	5	0	PENDING
591	4871	2026-06-29	2026-07-03	5	0	PENDING
591	4872	2026-06-23	2026-06-23	1	0	PENDING
591	4873	2026-06-29	2026-06-29	1	0	PENDING
591	4874	2026-07-05	2026-07-05	1	0	PENDING
591	4875	2026-03-31	2026-03-31	1	0	PENDING
591	4876	2026-04-06	2026-04-06	1	0	PENDING
591	4877	2026-04-12	2026-04-12	1	0	PENDING
591	4878	2026-07-05	2026-07-06	2	0	PENDING
591	4879	2026-07-05	2026-07-06	2	0	PENDING
591	4880	2026-07-08	2026-07-09	2	0	PENDING
591	4881	2026-07-05	2026-07-06	2	0	PENDING
591	4882	2026-07-07	2026-07-09	3	0	PENDING
591	4883	2026-07-10	2026-07-12	3	0	PENDING
591	4884	2026-07-05	2026-07-05	1	0	PENDING
591	4885	2026-07-07	2026-07-07	1	0	PENDING
591	4886	2026-07-09	2026-07-09	1	0	PENDING
591	4887	2026-07-14	2026-07-14	1	0	PENDING
591	4888	2026-03-12	2026-10-11	\N	\N	PENDING
591	4889	2026-03-12	2026-10-11	\N	\N	PENDING
591	4890	2026-06-16	2026-07-05	20	\N	PENDING
591	4891	2026-03-12	2026-03-16	5	0.05	IN_PROGRESS
591	4892	2026-06-23	2026-07-02	10	\N	PENDING
591	4893	2026-03-17	2026-03-26	10	\N	PENDING
591	4894	2026-09-16	2026-10-10	25	\N	PENDING
591	4895	2026-10-02	2026-10-11	10	\N	PENDING
591	4896	2026-05-29	2026-08-13	\N	\N	PENDING
591	4897	2026-05-29	2026-05-30	2	\N	PENDING
591	4898	2026-05-29	2026-05-29	1	\N	PENDING
591	4899	2026-06-17	2026-06-18	2	\N	PENDING
591	4900	2026-06-01	2026-06-02	2	\N	PENDING
591	4901	2026-06-01	2026-06-01	1	\N	PENDING
591	4902	2026-05-31	2026-05-31	1	\N	PENDING
591	4903	2026-06-20	2026-06-20	1	\N	PENDING
591	4904	2026-06-01	2026-06-01	1	\N	PENDING
591	4905	2026-06-02	2026-06-02	1	\N	PENDING
591	4906	2026-08-12	2026-08-12	1	\N	PENDING
591	4907	2026-08-13	2026-08-13	1	\N	PENDING
591	4908	2026-04-06	2026-10-13	\N	\N	PENDING
591	4909	2026-04-06	2026-10-13	\N	\N	PENDING
591	4910	2026-06-23	2026-07-12	20	0	PENDING
591	4911	2026-04-06	2026-04-10	5	0	PENDING
591	4912	2026-07-05	2026-07-14	10	0	PENDING
591	4913	2026-04-11	2026-04-20	10	0	PENDING
591	4914	2026-09-29	2026-10-13	15	0	PENDING
591	4915	2026-10-04	2026-10-13	10	0	PENDING
591	4916	2026-05-29	2026-08-13	\N	\N	PENDING
591	4917	2026-05-29	2026-05-30	2	0	PENDING
591	4918	2026-05-29	2026-05-29	1	0	PENDING
591	4919	2026-06-17	2026-06-20	4	0	PENDING
591	4920	2026-06-01	2026-06-02	2	0	PENDING
591	4921	2026-06-01	2026-06-01	1	0	PENDING
591	4922	2026-05-31	2026-05-31	1	0	PENDING
591	4923	2026-06-22	2026-06-22	1	0	PENDING
591	4924	2026-06-01	2026-06-01	1	0	PENDING
591	4925	2026-06-02	2026-06-02	1	0	PENDING
591	4926	2026-08-12	2026-08-12	1	0	PENDING
591	4927	2026-08-13	2026-08-13	1	0	PENDING
591	4928	2026-05-12	2026-09-26	\N	\N	PENDING
591	4929	2026-05-12	2026-09-26	\N	\N	PENDING
591	4930	2026-06-23	2026-07-02	10	0	PENDING
591	4931	2026-05-12	2026-05-16	5	0	PENDING
591	4932	2026-07-03	2026-07-05	3	0	PENDING
591	4933	2026-05-18	2026-05-20	3	0	PENDING
591	4934	2026-09-20	2026-09-26	7	0	PENDING
591	4935	2026-09-24	2026-09-26	3	0	PENDING
591	4936	2026-05-22	2026-09-23	\N	\N	PENDING
591	4937	2026-06-23	2026-06-24	2	0	PENDING
591	4938	2026-06-23	2026-06-23	1	0	PENDING
591	4939	2026-05-22	2026-05-24	3	0	PENDING
591	4940	2026-06-23	2026-06-24	2	0	PENDING
591	4941	2026-06-26	2026-06-26	1	0	PENDING
591	4942	2026-06-25	2026-06-25	1	0	PENDING
591	4943	2026-07-18	2026-07-18	1	0	PENDING
591	4944	2026-07-18	2026-07-18	1	0	PENDING
591	4945	2026-07-19	2026-07-19	1	0	PENDING
591	4946	2026-09-21	2026-09-21	1	0	PENDING
591	4947	2026-09-23	2026-09-23	1	0	PENDING
591	4948	2026-05-12	2026-09-26	\N	\N	PENDING
591	4949	2026-06-23	2026-07-02	10	0	PENDING
591	4950	2026-05-12	2026-05-16	5	0	PENDING
591	4951	2026-07-03	2026-07-05	3	0	PENDING
591	4952	2026-05-18	2026-05-20	3	0	PENDING
591	4953	2026-09-20	2026-09-26	7	0	PENDING
591	4954	2026-09-24	2026-09-26	3	0	PENDING
591	4955	2026-06-02	2026-10-04	\N	\N	PENDING
591	4956	2026-07-04	2026-07-05	2	0	PENDING
591	4957	2026-07-04	2026-07-04	1	0	PENDING
591	4958	2026-06-02	2026-06-04	3	0	PENDING
591	4959	2026-07-04	2026-07-05	2	0	PENDING
591	4960	2026-07-07	2026-07-07	1	0	PENDING
591	4961	2026-07-06	2026-07-06	1	0	PENDING
591	4962	2026-07-29	2026-07-29	1	0	PENDING
591	4963	2026-07-29	2026-07-29	1	0	PENDING
591	4964	2026-07-29	2026-07-29	1	0	PENDING
591	4965	2026-10-02	2026-10-02	1	0	PENDING
591	4966	2026-10-04	2026-10-04	1	0	PENDING
591	4967	2026-02-14	2026-10-12	\N	\N	PENDING
591	4968	2026-02-14	2026-10-12	\N	\N	PENDING
591	4969	2026-06-02	2026-06-11	10	0	PENDING
591	4970	2026-02-14	2026-02-18	5	0	PENDING
591	4971	2026-06-12	2026-06-14	3	0	PENDING
591	4972	2026-06-15	2026-06-17	3	0	PENDING
591	4973	2026-09-28	2026-10-12	15	0	PENDING
591	4974	2026-10-10	2026-10-12	3	0	PENDING
591	4975	2026-05-07	2026-08-14	\N	\N	PENDING
591	4976	\N	\N	\N	\N	PENDING
591	4977	2026-06-12	2026-06-13	2	0	PENDING
591	4978	2026-06-12	2026-06-12	1	0	PENDING
591	4979	2026-05-07	2026-05-08	2	0	PENDING
591	4980	2026-06-12	2026-06-13	2	0	PENDING
591	4981	2026-06-15	2026-06-15	1	0	PENDING
591	4982	2026-06-14	2026-06-14	1	0	PENDING
591	4983	2026-05-10	2026-05-10	1	0	PENDING
591	4984	2026-06-15	2026-06-15	1	0	PENDING
591	4985	2026-06-17	2026-06-17	1	0	PENDING
591	4986	2026-08-12	2026-08-12	1	0	PENDING
591	4987	2026-08-14	2026-08-14	1	0	PENDING
591	4988	\N	\N	\N	\N	PENDING
591	4989	2026-06-12	2026-06-13	2	0	PENDING
591	4990	2026-06-12	2026-06-12	1	0	PENDING
591	4991	2026-05-07	2026-05-08	2	0	PENDING
591	4992	2026-06-12	2026-06-13	2	0	PENDING
591	4993	2026-06-15	2026-06-15	1	0	PENDING
591	4994	2026-06-14	2026-06-14	1	0	PENDING
591	4995	2026-05-10	2026-05-10	1	0	PENDING
591	4996	2026-06-15	2026-06-15	1	0	PENDING
591	4997	2026-06-17	2026-06-17	1	0	PENDING
591	4998	2026-08-12	2026-08-12	1	0	PENDING
591	4999	2026-08-14	2026-08-14	1	0	PENDING
591	5000	2026-04-20	2026-10-17	\N	\N	PENDING
591	5001	2026-04-20	2026-10-17	\N	\N	PENDING
591	5002	2026-07-01	2026-07-15	15	0	PENDING
591	5003	2026-04-20	2026-04-24	5	0	PENDING
591	5004	2026-09-25	2026-09-27	3	0	PENDING
591	5005	2026-09-25	2026-09-27	3	0	PENDING
591	5006	2026-09-22	2026-10-01	10	0	PENDING
591	5007	2026-09-30	2026-10-02	3	0	PENDING
591	5008	2026-05-15	2026-05-15	\N	\N	PENDING
591	5009	2026-07-26	2026-07-26	1	0	PENDING
591	5010	2026-07-19	2026-07-19	1	0	PENDING
591	5011	2026-07-16	2026-07-17	2	0	PENDING
591	5012	2026-07-26	2026-07-26	1	0	PENDING
591	5013	2026-07-28	2026-07-28	1	0	PENDING
591	5014	2026-07-21	2026-07-21	1	0	PENDING
591	5015	2026-07-16	2026-09-16	\N	\N	PENDING
591	5022	2026-07-30	2026-07-30	1	0	PENDING
591	5023	2026-07-30	2026-07-30	1	0	PENDING
591	5024	2026-07-31	2026-07-31	1	0	PENDING
591	5025	2026-09-14	2026-09-14	1	0	PENDING
591	5026	2026-09-16	2026-09-16	1	0	PENDING
591	5027	2026-05-09	2026-10-17	\N	\N	PENDING
591	5028	2026-05-09	2026-10-08	\N	\N	PENDING
591	5029	2026-07-04	2026-07-13	10	0	PENDING
591	5030	2026-05-09	2026-05-13	5	0	PENDING
591	5031	2026-07-14	2026-07-16	3	0	PENDING
591	5032	2026-05-14	2026-05-16	3	0	PENDING
591	5033	2026-10-02	2026-10-08	7	0	PENDING
591	5034	2026-10-06	2026-10-08	3	0	PENDING
591	5035	2026-07-06	2026-10-17	\N	\N	PENDING
591	5036	2026-08-06	2026-08-07	2	0	PENDING
591	5037	2026-08-06	2026-08-06	1	0	PENDING
591	5038	2026-07-06	2026-07-08	3	0	PENDING
591	5039	2026-08-06	2026-08-07	2	0	PENDING
591	5040	2026-08-09	2026-08-09	1	0	PENDING
591	5041	2026-08-08	2026-08-08	1	0	PENDING
591	5042	2026-08-31	2026-08-31	1	0	PENDING
591	5043	2026-08-31	2026-08-31	1	0	PENDING
591	5044	2026-08-31	2026-08-31	1	0	PENDING
591	5045	2026-10-15	2026-10-15	1	0	PENDING
591	5046	2026-10-17	2026-10-17	1	0	PENDING
591	5047	2026-05-12	2026-09-17	\N	\N	PENDING
591	5048	2026-05-12	2026-09-17	\N	\N	PENDING
591	5049	2026-05-12	2026-05-31	20	0	PENDING
591	5050	2026-05-31	2026-06-04	5	0	PENDING
591	5051	2026-06-01	2026-06-07	7	0	PENDING
591	5052	2026-06-05	2026-06-11	7	0	PENDING
591	5053	2026-08-29	2026-09-17	20	0	PENDING
591	5054	2026-09-11	2026-09-17	7	0	PENDING
591	5055	2026-06-01	2026-08-22	\N	\N	PENDING
591	5056	2026-06-06	2026-06-07	2	0	PENDING
591	5057	2026-06-09	2026-06-09	1	0	PENDING
591	5058	2026-06-01	2026-06-05	5	0	PENDING
591	5059	2026-06-06	2026-06-06	1	0	PENDING
591	5060	2026-06-09	2026-06-09	1	0	PENDING
591	5061	2026-06-11	2026-06-11	1	0	PENDING
591	5062	2026-06-07	2026-06-07	1	0	PENDING
591	5063	2026-06-07	2026-06-07	1	0	PENDING
591	5064	2026-06-07	2026-06-07	1	0	PENDING
591	5065	2026-08-20	2026-08-20	1	0	PENDING
591	5066	2026-08-22	2026-08-22	1	0	PENDING
591	5067	2026-03-26	2026-09-02	\N	\N	PENDING
591	5068	2026-03-26	2026-09-02	\N	\N	PENDING
591	5069	2026-06-08	2026-07-02	25	0	PENDING
591	5070	2026-03-26	2026-03-30	5	0	PENDING
591	5071	2026-07-03	2026-07-05	3	0	PENDING
591	5072	2026-03-31	2026-04-02	3	0	PENDING
591	5073	2026-08-27	2026-09-02	7	0	PENDING
591	5074	2026-08-31	2026-09-02	3	0	PENDING
591	5075	2026-06-01	2026-08-22	\N	\N	PENDING
591	5076	2026-06-06	2026-06-07	2	0	PENDING
591	5077	2026-06-09	2026-06-09	1	0	PENDING
591	5078	2026-06-01	2026-06-03	3	0	PENDING
591	5079	2026-06-06	2026-06-07	2	0	PENDING
591	5080	2026-06-09	2026-06-09	1	0	PENDING
591	5081	2026-06-11	2026-06-11	1	0	PENDING
591	5082	2026-06-05	2026-06-05	1	0	PENDING
591	5083	2026-06-05	2026-06-05	1	0	PENDING
591	5084	2026-06-05	2026-06-05	1	0	PENDING
591	5085	2026-08-20	2026-08-20	1	0	PENDING
591	5086	2026-08-22	2026-08-22	1	0	PENDING
591	5087	2026-02-07	2026-11-02	\N	\N	PENDING
591	5088	2026-02-07	2026-11-02	\N	\N	PENDING
591	5089	2026-02-07	2026-04-17	70	0	PENDING
591	5090	2026-02-16	2026-06-05	110	0	PENDING
591	5091	2026-05-28	2026-07-11	45	0	PENDING
591	5092	2026-03-23	2026-06-10	80	0	PENDING
591	5093	2026-07-02	2026-10-09	100	0	PENDING
591	5094	2026-02-07	2026-02-07	\N	0	PENDING
591	5095	2026-02-07	2026-04-02	55	0	PENDING
591	5096	2026-02-14	2026-04-04	50	0	PENDING
591	5097	2026-05-28	2026-07-31	65	0	PENDING
591	5098	2026-03-23	2026-04-06	15	0	PENDING
591	5099	2026-08-01	2026-09-29	60	0	PENDING
591	5100	2026-02-21	2026-02-21	\N	0	PENDING
591	5101	2026-02-21	2026-04-21	60	0	PENDING
591	5102	2026-03-03	2026-07-25	145	0	PENDING
591	5103	2026-07-03	2026-09-10	70	0	PENDING
591	5104	2026-07-14	2026-09-16	65	0	PENDING
591	5105	2026-08-10	2026-10-08	60	0	PENDING
591	5106	2026-02-11	2026-02-11	\N	0	PENDING
591	5107	2026-02-11	2026-03-17	35	0	PENDING
591	5108	2026-03-08	2026-06-05	90	0	PENDING
591	5109	2026-04-13	2026-06-11	60	0	PENDING
591	5110	2026-04-10	2026-06-13	65	0	PENDING
591	5111	2026-06-15	2026-08-03	50	0	PENDING
591	5112	2026-02-07	2026-02-07	\N	0	PENDING
591	5113	2026-02-07	2026-03-23	45	0.2	IN_PROGRESS
591	5114	2026-03-04	2026-06-26	115	0.2	IN_PROGRESS
591	5115	2026-06-17	2026-09-04	80	0	PENDING
591	5116	2026-06-28	2026-09-05	70	0	PENDING
591	5117	2026-02-07	2026-03-23	45	0	PENDING
591	5118	2026-03-04	2026-06-26	115	0	PENDING
591	5119	2026-06-17	2026-09-04	80	0	PENDING
591	5120	2026-06-28	2026-09-05	70	0	PENDING
591	5121	2026-08-28	2026-11-02	67	0	PENDING
591	5122	2026-02-17	2026-02-21	5	0.7058824	IN_PROGRESS
591	5123	2026-02-19	2026-02-26	8	0.1	IN_PROGRESS
591	5124	2026-02-19	2026-02-26	8	0	PENDING
591	5125	2026-02-24	2026-03-03	8	0	PENDING
591	5126	2026-02-22	2026-02-22	\N	0	PENDING
591	5127	2026-02-07	2026-03-23	45	0.6	IN_PROGRESS
591	5128	2026-03-04	2026-06-26	115	0.6	IN_PROGRESS
591	5129	2026-06-17	2026-09-04	80	0	PENDING
591	5130	2026-06-28	2026-09-05	70	0	PENDING
591	5131	2026-02-07	2026-03-23	45	0.5	IN_PROGRESS
591	5132	2026-03-04	2026-06-26	115	0.5	IN_PROGRESS
591	5133	2026-06-17	2026-09-04	80	0	PENDING
591	5134	2026-06-28	2026-09-05	70	0	PENDING
591	5135	2026-08-28	2026-11-02	67	0	PENDING
591	5136	2026-02-22	2026-02-22	\N	0	PENDING
591	5137	2026-02-22	2026-03-23	30	0	PENDING
591	5138	2026-03-19	2026-05-17	60	0	PENDING
591	5139	2026-05-23	2026-07-16	55	0	PENDING
591	5140	2026-06-02	2026-07-18	47	0	PENDING
591	5141	2026-06-22	2026-07-27	36	0	PENDING
591	5142	2026-02-07	2026-02-07	\N	0	PENDING
591	5143	2026-02-12	2026-03-18	35	0	PENDING
591	5144	2026-03-09	2026-06-01	85	0	PENDING
591	5145	2026-05-23	2026-07-26	65	0	PENDING
591	5146	2026-05-28	2026-07-26	60	0	PENDING
591	5147	2026-07-09	2026-09-11	65	0	PENDING
591	5148	2026-02-12	2026-02-12	\N	0	PENDING
591	5154	2026-06-01	2026-06-01	\N	0	PENDING
591	5155	2026-06-11	2026-06-12	2	0	PENDING
591	5156	2026-06-09	2026-06-09	1	0	PENDING
591	5157	2026-06-01	2026-06-05	5	0	PENDING
591	5158	2026-06-06	2026-06-06	1	0	PENDING
591	5159	2026-06-09	2026-06-09	1	0	PENDING
591	5160	2026-06-11	2026-06-11	1	0	PENDING
591	5161	2026-06-07	2026-06-07	1	0	PENDING
591	5162	2026-06-07	2026-06-07	1	0	PENDING
591	5163	2026-06-07	2026-06-07	1	0	PENDING
591	5164	2026-08-20	2026-08-20	1	0	PENDING
591	5165	2026-08-22	2026-08-22	1	0	PENDING
591	5166	2026-06-01	2026-10-21	\N	\N	PENDING
591	5167	2026-06-01	2026-10-21	\N	\N	PENDING
591	5168	2026-08-06	2026-08-15	10	0	PENDING
591	5169	2026-06-01	2026-06-05	5	0	PENDING
591	5170	2026-08-16	2026-08-18	3	0	PENDING
591	5171	2026-06-06	2026-06-08	3	0	PENDING
591	5172	2026-10-15	2026-10-21	7	0	PENDING
591	5173	2026-10-19	2026-10-21	3	0	PENDING
591	5174	2026-07-06	2026-10-17	\N	\N	PENDING
591	5175	2026-08-06	2026-08-07	2	0	PENDING
591	5176	2026-08-06	2026-08-06	1	0	PENDING
591	5177	2026-07-06	2026-07-08	3	0	PENDING
591	5178	2026-08-06	2026-08-07	2	0	PENDING
591	5179	2026-08-09	2026-08-09	1	0	PENDING
591	5180	2026-08-08	2026-08-08	1	0	PENDING
591	5181	2026-08-31	2026-08-31	1	0	PENDING
591	5182	2026-08-31	2026-08-31	1	0	PENDING
591	5183	2026-08-31	2026-08-31	1	0	PENDING
591	5184	2026-10-15	2026-10-15	1	0	PENDING
591	5185	2026-10-17	2026-10-17	1	0	PENDING
591	5186	2026-04-18	2026-11-02	\N	\N	PENDING
591	5187	2026-04-18	2026-10-24	\N	\N	PENDING
591	5188	2026-08-23	2026-09-01	10	0	PENDING
591	5189	2026-04-18	2026-04-22	5	0	PENDING
591	5190	2026-09-02	2026-09-04	3	0	PENDING
591	5191	2026-04-23	2026-04-25	3	0	PENDING
591	5192	2026-10-17	2026-10-23	7	0	PENDING
591	5193	2026-10-24	2026-10-24	1	0	PENDING
591	5194	2026-07-12	2026-11-02	\N	\N	PENDING
591	5195	2026-08-23	2026-08-31	9	0	PENDING
591	5196	2026-09-02	2026-09-07	6	0	PENDING
591	5197	2026-08-23	2026-08-30	8	0	PENDING
591	5198	2026-09-01	2026-09-05	5	0	PENDING
591	5199	2026-07-12	2026-07-23	12	0	PENDING
591	5200	2026-07-25	2026-07-31	7	0	PENDING
591	5201	2026-08-23	2026-08-25	3	0	PENDING
591	5202	2026-09-02	2026-09-04	3	0	PENDING
591	5203	2026-09-02	2026-09-02	1	0	PENDING
591	5204	2026-09-09	2026-09-09	1	0	PENDING
591	5205	2026-09-01	2026-09-01	1	0	PENDING
591	5206	2026-09-07	2026-09-07	1	0	PENDING
591	5207	2026-08-23	2026-08-24	2	0	PENDING
591	5208	2026-08-26	2026-08-27	2	0	PENDING
591	5209	2026-08-29	2026-08-30	2	0	PENDING
591	5210	2026-08-23	2026-08-29	7	0	PENDING
591	5211	2026-08-31	2026-09-03	4	0	PENDING
591	5212	2026-08-23	2026-08-24	2	0	PENDING
591	5213	2026-08-31	2026-08-31	1	0	PENDING
591	5214	2026-10-27	2026-10-28	2	0	PENDING
591	5215	2026-10-30	2026-10-31	2	0	PENDING
591	5216	2026-11-02	2026-11-02	1	0	PENDING
591	5217	2026-06-18	2026-10-21	\N	\N	PENDING
591	5218	2026-06-18	2026-10-21	\N	\N	PENDING
591	5219	2026-08-09	2026-08-18	10	0	PENDING
591	5220	2026-06-18	2026-06-22	5	0	PENDING
591	5221	2026-08-19	2026-08-21	3	0	PENDING
591	5222	2026-06-23	2026-06-25	3	0	PENDING
591	5223	2026-10-15	2026-10-21	7	0	PENDING
591	5224	2026-10-19	2026-10-21	3	0	PENDING
591	5225	2026-07-15	2026-10-06	\N	\N	PENDING
591	5226	2026-08-09	2026-08-10	2	0	PENDING
591	5227	2026-08-12	2026-08-12	1	0	PENDING
591	5228	2026-08-09	2026-08-10	2	0	PENDING
591	5229	2026-08-12	2026-08-12	1	0	PENDING
591	5230	2026-07-15	2026-07-17	3	0	PENDING
591	5231	2026-07-19	2026-07-19	1	0	PENDING
591	5232	2026-08-09	2026-08-10	2	0	PENDING
591	5233	2026-08-12	2026-08-12	1	0	PENDING
591	5234	2026-08-12	2026-08-12	1	0	PENDING
591	5235	2026-08-14	2026-08-14	1	0	PENDING
591	5236	2026-08-12	2026-08-12	1	0	PENDING
591	5237	2026-08-14	2026-08-14	1	0	PENDING
591	5238	2026-08-23	2026-08-23	1	0	PENDING
591	5239	2026-08-25	2026-08-25	1	0	PENDING
591	5240	2026-08-22	2026-08-22	1	0	PENDING
591	5241	2026-08-24	2026-08-24	1	0	PENDING
591	5242	2026-08-26	2026-08-26	1	0	PENDING
591	5243	2026-08-26	2026-08-26	1	0	PENDING
591	5244	2026-10-04	2026-10-04	1	0	PENDING
591	5245	2026-10-04	2026-10-04	1	0	PENDING
591	5246	2026-10-06	2026-10-06	1	0	PENDING
591	5247	2026-06-18	2026-10-21	\N	\N	PENDING
591	5248	2026-06-18	2026-10-21	\N	\N	PENDING
591	5249	2026-08-09	2026-08-18	10	0	PENDING
591	5250	2026-06-18	2026-06-22	5	0	PENDING
591	5251	2026-08-19	2026-08-21	3	0	PENDING
591	5252	2026-06-23	2026-06-25	3	0	PENDING
591	5253	2026-10-15	2026-10-21	7	0	PENDING
591	5254	2026-10-19	2026-10-21	3	0	PENDING
591	5255	2026-07-15	2026-10-06	\N	\N	PENDING
591	5256	2026-08-09	2026-08-10	2	0	PENDING
591	5257	2026-08-12	2026-08-12	1	0	PENDING
591	5258	2026-08-09	2026-08-10	2	0	PENDING
591	5259	2026-08-12	2026-08-12	1	0	PENDING
591	5260	2026-07-15	2026-07-17	3	0	PENDING
591	5261	2026-07-19	2026-07-19	1	0	PENDING
591	5262	2026-08-09	2026-08-10	2	0	PENDING
591	5263	2026-08-12	2026-08-12	1	0	PENDING
591	5264	2026-08-12	2026-08-12	1	0	PENDING
591	5265	2026-08-14	2026-08-14	1	0	PENDING
591	5266	2026-08-12	2026-08-12	1	0	PENDING
591	5267	2026-08-14	2026-08-14	1	0	PENDING
591	5268	2026-08-23	2026-08-23	1	0	PENDING
591	5269	2026-08-25	2026-08-25	1	0	PENDING
591	5270	2026-08-22	2026-08-22	1	0	PENDING
591	5271	2026-08-24	2026-08-24	1	0	PENDING
591	5272	2026-08-26	2026-08-26	1	0	PENDING
591	5273	2026-08-26	2026-08-26	1	0	PENDING
591	5274	2026-10-04	2026-10-04	1	0	PENDING
591	5275	2026-10-04	2026-10-04	1	0	PENDING
591	5276	2026-10-06	2026-10-06	1	0	PENDING
591	5277	2026-01-29	2026-08-04	\N	\N	PENDING
591	5278	2026-01-29	2026-08-04	\N	\N	PENDING
591	5279	2026-06-03	2026-06-12	10	0	PENDING
591	5280	2026-01-29	2026-02-02	5	0	PENDING
591	5281	2026-06-13	2026-06-15	3	0	PENDING
591	5282	2026-02-13	2026-02-14	2	0.8	IN_PROGRESS
591	5283	2026-02-08	2026-02-10	3	0	PENDING
591	5284	2026-07-30	2026-08-03	5	0	PENDING
591	5285	2026-08-04	2026-08-04	1	0	PENDING
591	5286	2026-04-22	2026-08-01	\N	\N	PENDING
591	5287	2026-06-03	2026-06-04	2	0	PENDING
591	5288	2026-06-03	2026-06-03	1	0	PENDING
591	5289	2026-04-22	2026-04-23	2	0	PENDING
591	5290	2026-06-03	2026-06-03	1	0	PENDING
591	5291	2026-06-06	2026-06-06	1	0	PENDING
591	5292	2026-06-05	2026-06-05	1	0	PENDING
591	5293	2026-04-25	2026-04-25	1	0	PENDING
591	5294	2026-06-08	2026-06-08	1	0	PENDING
591	5295	2026-06-10	2026-06-10	1	0	PENDING
591	5296	2026-07-30	2026-07-30	1	0	PENDING
591	5297	2026-08-01	2026-08-01	1	0	PENDING
591	5832	\N	\N	\N	\N	PENDING
591	5833	\N	\N	\N	\N	PENDING
591	5834	\N	\N	\N	\N	PENDING
591	5835	\N	\N	\N	\N	PENDING
591	5836	\N	\N	\N	\N	PENDING
591	5837	\N	\N	\N	\N	PENDING
591	5838	\N	\N	\N	\N	PENDING
591	5839	\N	\N	\N	\N	PENDING
591	5840	\N	\N	\N	\N	PENDING
591	5841	\N	\N	\N	0.5	PENDING
591	5842	\N	\N	\N	\N	PENDING
591	5843	\N	\N	\N	\N	PENDING
591	5844	\N	\N	\N	\N	PENDING
591	5845	\N	\N	\N	\N	PENDING
591	5846	\N	\N	\N	\N	PENDING
591	5847	\N	\N	\N	\N	PENDING
591	5848	\N	\N	\N	\N	PENDING
591	5849	\N	\N	\N	\N	PENDING
591	5850	\N	\N	\N	\N	PENDING
591	5851	\N	\N	\N	\N	PENDING
591	5852	\N	\N	\N	\N	PENDING
591	5853	\N	\N	\N	\N	PENDING
591	5854	\N	\N	\N	\N	PENDING
591	5855	\N	\N	\N	\N	PENDING
591	5856	\N	\N	\N	\N	PENDING
591	5857	\N	\N	\N	\N	PENDING
591	5858	\N	\N	\N	\N	PENDING
591	5859	\N	\N	\N	\N	PENDING
591	5860	\N	\N	\N	\N	PENDING
591	5861	\N	\N	\N	\N	PENDING
591	5862	\N	\N	\N	\N	PENDING
591	5863	\N	\N	\N	\N	PENDING
591	5864	\N	\N	\N	\N	PENDING
591	5865	\N	\N	\N	\N	PENDING
591	5866	\N	\N	\N	\N	PENDING
591	5867	\N	\N	\N	\N	PENDING
591	5868	\N	\N	\N	\N	PENDING
591	5869	\N	\N	\N	\N	PENDING
591	5870	\N	\N	\N	\N	PENDING
591	5871	\N	\N	\N	\N	PENDING
591	5872	\N	\N	\N	\N	PENDING
591	5873	\N	\N	\N	\N	PENDING
591	5874	\N	\N	\N	\N	PENDING
591	5875	\N	\N	\N	\N	PENDING
591	5876	\N	\N	\N	\N	PENDING
591	5877	\N	\N	\N	\N	PENDING
591	5878	\N	\N	\N	\N	PENDING
591	5879	\N	\N	\N	\N	PENDING
599	3319	2026-03-31	2026-03-31	1	0.5	DONE
599	3320	2026-04-06	2026-04-06	1	1	DONE
599	3321	2026-04-12	2026-04-12	1	1	DONE
599	3322	2026-06-20	2026-06-21	2	1	DONE
599	3323	2026-06-23	2026-06-27	5	1	DONE
599	3324	2026-06-29	2026-07-03	5	1	DONE
599	3325	2026-03-29	2026-03-29	1	1	DONE
599	3326	2026-03-31	2026-04-04	5	1	DONE
599	3327	2026-07-10	2026-07-12	3	1	DONE
599	3329	2026-07-07	2026-07-07	1	1	DONE
599	3335	2026-05-08	2026-05-27	\N	1	DONE
599	3340	2026-05-23	2026-05-23	\N	1	DONE
599	3345	2026-06-11	2026-06-11	\N	1	DONE
599	3351	\N	\N	\N	1	DONE
599	3357	2026-04-06	2026-04-10	5	1	DONE
599	3358	2026-06-20	2026-06-21	2	1	DONE
599	3359	2026-06-23	2026-06-27	5	1	DONE
599	3360	2026-06-29	2026-07-03	5	1	DONE
599	3361	2026-06-23	2026-06-23	1	1	DONE
599	3362	2026-06-29	2026-06-29	1	1	DONE
599	3363	2026-07-05	2026-07-05	1	1	DONE
599	3367	2026-07-05	2026-07-06	2	1	DONE
599	3368	2026-07-05	2026-07-06	2	1	DONE
599	3369	2026-07-08	2026-07-09	2	1	DONE
599	3370	2026-07-05	2026-07-06	2	1	DONE
599	3371	2026-07-07	2026-07-09	3	1	DONE
599	3373	2026-03-29	2026-03-29	\N	1	DONE
599	3395	2026-03-29	2026-03-30	\N	1	DONE
599	3417	2026-03-29	2026-03-29	\N	1	DONE
599	3439	2026-07-05	2026-07-05	1	1	DONE
599	3441	2026-07-09	2026-07-09	1	1	DONE
599	3442	2026-07-14	2026-07-14	1	1	DONE
599	3443	2026-03-12	2026-10-11	213	\N	DONE
599	3444	2026-05-19	2026-05-21	3	1	DONE
599	3445	2026-03-12	2026-10-11	\N	\N	DONE
599	3446	2026-05-29	2026-05-30	2	1	DONE
599	3447	2026-05-29	2026-05-29	1	1	DONE
599	3448	2026-06-17	2026-06-18	2	1	DONE
599	3449	2026-06-01	2026-06-02	2	1	DONE
599	3450	2026-06-01	2026-06-01	1	1	DONE
599	3451	2026-05-31	2026-05-31	1	1	DONE
599	3452	2026-05-29	2026-08-13	\N	\N	DONE
599	3459	2026-06-20	2026-06-20	1	1	DONE
599	3460	2026-06-01	2026-06-01	1	1	DONE
599	3461	2026-06-02	2026-06-02	1	1	DONE
599	3462	2026-08-12	2026-08-12	1	1	DONE
599	3463	2026-08-13	2026-08-13	1	0.35	DONE
599	3464	2026-04-06	2026-10-13	190	\N	DONE
599	3465	2026-05-19	2026-05-21	3	1	DONE
599	3466	2026-04-06	2026-10-13	\N	\N	DONE
599	3467	2026-05-29	2026-05-30	2	1	DONE
599	3468	2026-05-29	2026-05-29	1	1	DONE
599	3469	2026-06-17	2026-06-20	4	1	DONE
599	3470	2026-06-01	2026-06-02	2	1	DONE
599	3471	2026-06-01	2026-06-01	1	1	DONE
599	3472	2026-05-31	2026-05-31	1	1	DONE
599	3473	2026-05-29	2026-08-13	\N	\N	DONE
599	3480	2026-06-22	2026-06-22	1	1	DONE
599	3481	2026-06-01	2026-06-01	1	1	DONE
599	3482	2026-06-02	2026-06-02	1	0.95	DONE
599	3483	2026-08-12	2026-08-12	1	1	DONE
599	3484	2026-08-13	2026-08-13	1	0.4	DONE
599	3485	2026-05-12	2026-09-26	137	\N	DONE
599	3486	2026-05-19	2026-05-21	3	1	DONE
599	3487	2026-05-12	2026-09-26	\N	\N	DONE
599	3488	2026-06-23	2026-06-24	2	0.15	DONE
599	3489	2026-06-23	2026-06-23	1	0.15	DONE
599	3490	2026-05-22	2026-05-24	3	0.15	DONE
599	3491	2026-06-23	2026-06-24	2	0.15	DONE
599	3492	2026-06-26	2026-06-26	1	0.15	DONE
599	3493	2026-06-25	2026-06-25	1	0.15	DONE
599	3494	2026-05-22	2026-09-23	\N	\N	DONE
599	3501	2026-07-18	2026-07-18	1	0.15	DONE
599	3502	2026-07-18	2026-07-18	1	0.15	DONE
599	3503	2026-07-19	2026-07-19	1	0.15	DONE
599	3504	2026-09-21	2026-09-21	1	0.15	DONE
599	3505	2026-09-23	2026-09-23	1	0	DONE
599	3506	2026-05-12	2026-12-29	231	\N	DONE
599	3507	2026-05-19	2026-05-21	3	1	DONE
599	3508	2026-05-12	2026-09-26	\N	\N	DONE
599	3509	2026-07-04	2026-07-05	2	0.1	DONE
599	3510	2026-07-04	2026-07-04	1	0.1	DONE
599	3511	2026-06-02	2026-06-04	3	0.1	DONE
599	3512	2026-07-04	2026-07-05	2	0.1	DONE
599	3513	2026-10-04	2026-10-04	1	0	DONE
599	3514	2026-12-29	2026-12-29	1	0	DONE
599	3515	2026-06-02	2026-12-29	\N	\N	DONE
599	3522	2026-02-14	2026-10-12	240	\N	DONE
599	3523	2026-05-19	2026-05-21	3	1	DONE
599	3524	2026-02-14	2026-10-12	\N	\N	DONE
599	3525	2026-06-12	2026-06-13	2	0.9	DONE
599	3526	2026-06-12	2026-06-12	1	0.9	DONE
599	3527	2026-05-07	2026-05-08	2	0.9	DONE
599	3528	2026-06-12	2026-06-13	2	0.9	DONE
599	3529	2026-06-15	2026-06-15	1	0.9	DONE
599	3530	2026-06-14	2026-06-14	1	0.9	DONE
599	3531	2026-05-07	2026-08-14	\N	\N	DONE
599	3532	\N	\N	\N	\N	PENDING
599	3539	2026-05-10	2026-05-10	1	0.9	DONE
599	3540	2026-06-15	2026-06-15	1	0.9	DONE
599	3541	2026-06-17	2026-06-17	1	0	DONE
599	3542	2026-08-12	2026-08-12	1	0.9	DONE
599	3543	2026-08-14	2026-08-14	1	0	DONE
599	3544	\N	\N	\N	\N	PENDING
599	3556	2026-04-20	2026-10-02	165	\N	DONE
599	3557	2026-05-19	2026-05-21	3	1	DONE
599	3558	2026-04-20	2026-10-02	\N	\N	DONE
599	3559	2026-07-26	2026-07-26	1	1	DONE
599	3560	2026-07-19	2026-07-19	1	1	DONE
599	3561	2026-07-16	2026-07-17	2	1	DONE
599	3562	2026-07-26	2026-07-26	1	1	DONE
599	3563	2026-07-28	2026-07-28	1	1	DONE
599	3564	2026-07-21	2026-07-21	1	1	DONE
599	3565	2026-07-16	2026-09-16	\N	\N	DONE
599	3572	2026-07-30	2026-07-30	1	1	DONE
599	3573	2026-07-30	2026-07-30	1	1	DONE
599	3574	2026-07-31	2026-07-31	1	0.95	DONE
599	3575	2026-09-14	2026-09-14	1	1	DONE
599	3576	2026-09-16	2026-09-16	1	0	DONE
599	3577	2026-05-09	2026-10-17	161	\N	DONE
599	3578	2026-05-19	2026-05-21	3	1	DONE
599	3579	2026-05-09	2026-10-08	\N	\N	DONE
599	3580	2026-08-06	2026-08-07	2	0.15	DONE
599	3581	2026-08-06	2026-08-06	1	0.15	DONE
599	3582	2026-07-06	2026-07-08	3	0.15	DONE
599	3583	2026-08-06	2026-08-07	2	0.15	DONE
599	3584	2026-08-09	2026-08-09	1	0.15	DONE
599	3585	2026-08-08	2026-08-08	1	0.15	DONE
599	3586	2026-07-06	2026-10-17	\N	\N	DONE
599	3593	2026-08-31	2026-08-31	1	0.15	DONE
599	3594	2026-08-31	2026-08-31	1	0	DONE
599	3595	2026-10-15	2026-10-15	1	0.15	DONE
599	3596	2026-10-17	2026-10-17	1	0	DONE
599	3597	2026-05-12	2026-09-17	128	\N	DONE
599	3598	2026-05-19	2026-05-21	3	1	DONE
599	3599	2026-05-12	2026-09-17	\N	\N	DONE
599	3600	2026-06-06	2026-06-07	2	0.2	DONE
599	3601	2026-06-09	2026-06-09	1	0.2	DONE
599	3602	2026-06-01	2026-06-05	5	0.2	DONE
599	3603	2026-06-06	2026-06-06	1	0.2	DONE
599	3604	2026-06-09	2026-06-09	1	0.2	DONE
599	3605	2026-06-11	2026-06-11	1	0.2	DONE
599	3606	2026-06-01	2026-08-22	\N	\N	DONE
599	3613	2026-06-07	2026-06-07	1	0.2	DONE
599	3614	2026-06-07	2026-06-07	1	0.2	DONE
599	3615	2026-06-07	2026-06-07	1	0.2	DONE
599	3616	2026-08-20	2026-08-20	1	0.2	DONE
599	3617	2026-08-22	2026-08-22	1	0	DONE
599	3618	2026-03-26	2026-09-02	160	\N	DONE
599	3619	2026-05-19	2026-05-21	3	1	DONE
599	3620	2026-03-26	2026-09-02	\N	\N	DONE
599	3621	2026-06-06	2026-06-07	2	0.35	DONE
599	3622	2026-06-09	2026-06-09	1	0.35	DONE
599	3623	2026-06-01	2026-06-03	3	0.35	DONE
599	3624	2026-06-06	2026-06-07	2	0.35	DONE
599	3625	2026-06-09	2026-06-09	1	0.35	DONE
599	3626	2026-06-11	2026-06-11	1	0	DONE
599	3627	2026-06-01	2026-08-22	\N	\N	DONE
599	3634	2026-06-05	2026-06-05	1	0	DONE
599	3635	2026-06-05	2026-06-05	1	0	DONE
599	3636	2026-06-05	2026-06-05	1	0.35	DONE
599	3637	2026-08-20	2026-08-20	1	0	DONE
599	3638	2026-08-22	2026-08-22	1	0	DONE
599	3639	2026-02-24	2026-03-03	8	1	DONE
599	3640	\N	\N	\N	1	DONE
599	3641	2026-02-07	2026-11-02	\N	0.95	DONE
599	3642	2026-02-21	2026-04-21	60	0.35	DONE
599	3643	2026-03-03	2026-07-25	145	0.35	DONE
599	3644	2026-07-03	2026-09-10	70	0.35	DONE
599	3645	2026-07-14	2026-09-16	65	0.35	DONE
599	3646	2026-08-10	2026-10-08	60	0.35	DONE
599	3647	2026-02-17	2026-02-21	5	0.6	IN_PROGRESS
599	3648	2026-02-19	2026-02-26	8	0.6	IN_PROGRESS
599	3649	2026-02-19	2026-02-26	8	0.6	IN_PROGRESS
599	3650	2026-02-24	2026-03-03	8	0.6	IN_PROGRESS
599	3651	\N	\N	8	0	PENDING
599	3652	2026-02-07	2026-02-07	\N	0.95	DONE
599	3658	2026-02-21	2026-02-21	\N	0.95	DONE
599	3669	2026-02-11	2026-02-11	\N	0.95	DONE
599	3680	2026-02-07	2026-02-07	\N	0.95	DONE
599	3691	2026-02-19	2026-02-26	8	1	DONE
599	3692	2026-02-19	2026-02-26	8	1	DONE
599	3695	2026-02-22	2026-02-22	\N	0.95	DONE
599	3705	2026-02-22	2026-02-22	\N	0.95	DONE
599	3711	2026-02-07	2026-02-07	\N	0.95	DONE
599	3722	2026-02-21	2026-02-21	\N	0.25	DONE
599	3733	2026-05-19	2026-10-21	155	\N	DONE
599	3734	2026-05-19	2026-05-21	3	1	DONE
599	3735	2026-06-01	2026-10-21	\N	\N	DONE
599	3736	2026-08-06	2026-08-07	2	0.35	DONE
599	3737	2026-08-06	2026-08-06	1	0.35	DONE
599	3738	2026-07-06	2026-07-08	3	0.35	DONE
599	3739	2026-08-06	2026-08-07	2	0.35	DONE
599	3740	2026-08-09	2026-08-09	1	0.35	DONE
599	3741	2026-08-08	2026-08-08	1	0.35	DONE
599	3742	2026-07-06	2026-10-17	\N	\N	DONE
599	3749	2026-08-31	2026-08-31	1	0.35	DONE
599	3750	2026-08-31	2026-08-31	1	0.35	DONE
599	3751	2026-08-31	2026-08-31	1	0	DONE
599	3752	2026-10-15	2026-10-15	1	0.35	DONE
599	3753	2026-10-17	2026-10-17	1	0	DONE
599	3754	2026-08-23	2026-08-24	2	1	DONE
599	3755	2026-08-26	2026-08-27	2	0	DONE
599	3756	2026-08-29	2026-08-30	2	0.35	DONE
599	3757	2026-08-23	2026-08-31	9	1	DONE
599	3758	2026-09-02	2026-09-07	6	0.8	DONE
599	3759	2026-08-23	2026-08-30	8	1	DONE
599	3760	2026-09-01	2026-09-05	5	0.8	DONE
599	3761	2026-07-12	2026-07-23	12	1	DONE
599	3762	2026-07-25	2026-07-31	7	0.8	DONE
599	3763	2026-11-02	2026-11-02	1	0	DONE
599	3770	2026-08-23	2026-08-25	3	1	DONE
599	3771	2026-09-02	2026-09-04	3	0.8	DONE
599	3772	2026-09-02	2026-09-02	1	1	DONE
599	3773	2026-09-09	2026-09-09	1	0	DONE
599	3774	2026-09-01	2026-09-01	1	1	DONE
599	3775	2026-09-07	2026-09-07	1	0	DONE
599	3779	2026-08-23	2026-08-29	7	1	DONE
599	3780	2026-08-31	2026-09-03	4	0.25	DONE
599	3781	2026-08-23	2026-08-24	2	1	DONE
599	3782	2026-08-31	2026-08-31	1	0.25	DONE
599	3783	2026-10-27	2026-10-28	2	1	DONE
599	3784	2026-10-30	2026-10-31	2	0.35	DONE
599	3786	2026-05-19	2026-10-21	155	\N	DONE
599	3787	2026-05-19	2026-05-21	3	1	DONE
599	3788	2026-06-18	2026-10-21	\N	\N	DONE
599	3789	2026-08-09	2026-08-10	2	0	DONE
599	3790	2026-08-12	2026-08-12	1	0	DONE
599	3791	2026-08-09	2026-08-10	2	0	DONE
599	3792	2026-08-12	2026-08-12	1	0	DONE
599	3793	2026-07-15	2026-07-17	3	0	DONE
599	3794	2026-08-26	2026-08-26	1	0	DONE
599	3795	2026-07-15	2026-10-06	\N	\N	DONE
599	3801	2026-07-19	2026-07-19	1	0	DONE
599	3802	2026-08-09	2026-08-10	2	0	DONE
599	3803	2026-08-12	2026-08-12	1	0	DONE
599	3804	2026-08-12	2026-08-12	1	0	DONE
599	3805	2026-08-14	2026-08-14	1	0	DONE
599	3806	2026-08-12	2026-08-12	1	0	DONE
599	3807	2026-08-14	2026-08-14	1	0	DONE
599	3808	2026-08-23	2026-08-23	1	0	DONE
599	3809	2026-08-25	2026-08-25	1	0	DONE
599	3810	2026-08-22	2026-08-22	1	0	DONE
599	3811	2026-08-24	2026-08-24	1	0	DONE
599	3812	2026-08-26	2026-08-26	1	0	DONE
599	3814	2026-10-04	2026-10-04	1	0	DONE
599	3815	2026-10-04	2026-10-04	1	0	DONE
599	3816	2026-10-06	2026-10-06	1	0	DONE
599	3817	2026-08-23	2026-08-23	1	0	DONE
599	3818	2026-08-25	2026-08-25	1	0	DONE
599	3819	2026-08-22	2026-08-22	1	0	DONE
599	3820	2026-08-09	2026-08-10	2	0	DONE
599	3821	2026-08-12	2026-08-12	1	0	DONE
599	3822	2026-08-09	2026-08-10	2	0	DONE
599	3823	2026-08-12	2026-08-12	1	0	DONE
599	3824	2026-07-15	2026-07-17	3	0	DONE
599	3825	2026-07-19	2026-07-19	1	0	DONE
599	3826	2026-07-15	2026-10-06	\N	\N	DONE
599	3833	2026-08-09	2026-08-10	2	0	DONE
599	3834	2026-08-12	2026-08-12	1	0	DONE
599	3835	2026-08-12	2026-08-12	1	0	DONE
599	3836	2026-08-14	2026-08-14	1	0	DONE
599	3837	2026-08-12	2026-08-12	1	0	DONE
599	3838	2026-08-14	2026-08-14	1	0	DONE
599	3842	2026-08-24	2026-08-24	1	0	DONE
599	3843	2026-08-26	2026-08-26	1	0	DONE
599	3844	2026-08-26	2026-08-26	1	0	DONE
599	3845	2026-10-04	2026-10-04	1	0	DONE
599	3846	2026-10-04	2026-10-04	1	0	DONE
599	3847	2026-10-06	2026-10-06	1	0	DONE
599	3848	2026-01-29	2026-11-22	297	0.2	DONE
599	3849	2026-05-19	2026-05-21	3	1	DONE
599	3850	2026-01-29	2026-08-04	\N	0.2	DONE
599	3851	2026-06-03	2026-06-04	2	1	DONE
575	3319	2026-03-31	2026-03-31	1	0.5	DONE
575	3320	2026-04-06	2026-04-06	1	1	DONE
575	3321	2026-04-12	2026-04-12	1	1	DONE
575	3322	2026-06-20	2026-06-21	2	1	DONE
575	3323	2026-06-23	2026-06-27	5	1	DONE
575	3324	2026-06-29	2026-07-03	5	1	DONE
575	3325	2026-03-29	2026-03-29	1	1	DONE
575	3326	2026-03-31	2026-04-04	5	1	DONE
575	3327	2026-07-10	2026-07-12	3	1	DONE
575	3329	2026-07-07	2026-07-07	1	1	DONE
575	3335	2026-05-08	2026-05-27	\N	1	DONE
575	3340	2026-05-23	2026-05-23	\N	1	DONE
575	3345	2026-06-11	2026-06-11	\N	1	DONE
575	3351	\N	\N	\N	1	DONE
575	3357	2026-04-06	2026-04-10	5	1	DONE
575	3358	2026-06-20	2026-06-21	2	1	DONE
575	3359	2026-06-23	2026-06-27	5	1	DONE
575	3360	2026-06-29	2026-07-03	5	1	DONE
575	3361	2026-06-23	2026-06-23	1	1	DONE
575	3362	2026-06-29	2026-06-29	1	1	DONE
575	3363	2026-07-05	2026-07-05	1	1	DONE
575	3367	2026-07-05	2026-07-06	2	1	DONE
575	3368	2026-07-05	2026-07-06	2	1	DONE
575	3369	2026-07-08	2026-07-09	2	1	DONE
575	3370	2026-07-05	2026-07-06	2	1	DONE
575	3371	2026-07-07	2026-07-09	3	1	DONE
575	3373	2026-03-29	2026-03-29	\N	1	DONE
575	3395	2026-03-29	2026-03-30	\N	1	DONE
575	3417	2026-03-29	2026-03-29	\N	1	DONE
575	3439	2026-07-05	2026-07-05	1	1	DONE
575	3441	2026-07-09	2026-07-09	1	1	DONE
575	3442	2026-07-14	2026-07-14	1	1	DONE
575	3443	2026-03-12	2026-10-11	213	\N	DONE
575	3444	2026-05-19	2026-05-21	3	1	DONE
575	3445	2026-03-12	2026-10-11	\N	\N	DONE
575	3446	2026-05-29	2026-05-30	2	1	DONE
575	3447	2026-05-29	2026-05-29	1	1	DONE
575	3448	2026-06-17	2026-06-18	2	1	DONE
575	3449	2026-06-01	2026-06-02	2	1	DONE
575	3450	2026-06-01	2026-06-01	1	1	DONE
575	3451	2026-05-31	2026-05-31	1	1	DONE
575	3452	2026-05-29	2026-08-13	\N	\N	DONE
575	3459	2026-06-20	2026-06-20	1	1	DONE
599	3852	2026-06-03	2026-06-03	1	1	DONE
575	3460	2026-06-01	2026-06-01	1	1	DONE
575	3461	2026-06-02	2026-06-02	1	1	DONE
575	3462	2026-08-12	2026-08-12	1	1	DONE
575	3463	2026-08-13	2026-08-13	1	0.35	DONE
575	3464	2026-04-06	2026-10-13	190	\N	DONE
599	3853	2026-04-22	2026-04-23	2	0.85	DONE
575	3465	2026-05-19	2026-05-21	3	1	DONE
575	3466	2026-04-06	2026-10-13	\N	\N	DONE
575	3467	2026-05-29	2026-05-30	2	1	DONE
575	3468	2026-05-29	2026-05-29	1	1	DONE
575	3469	2026-06-17	2026-06-20	4	1	DONE
575	3470	2026-06-01	2026-06-02	2	1	DONE
575	3471	2026-06-01	2026-06-01	1	1	DONE
575	3472	2026-05-31	2026-05-31	1	1	DONE
575	3473	2026-05-29	2026-08-13	\N	\N	DONE
575	3480	2026-06-22	2026-06-22	1	1	DONE
575	3481	2026-06-01	2026-06-01	1	1	DONE
575	3482	2026-06-02	2026-06-02	1	0.95	DONE
575	3483	2026-08-12	2026-08-12	1	1	DONE
575	3484	2026-08-13	2026-08-13	1	0.4	DONE
575	3485	2026-05-12	2026-09-26	137	\N	DONE
575	3486	2026-05-19	2026-05-21	3	1	DONE
575	3487	2026-05-12	2026-09-26	\N	\N	DONE
575	3488	2026-06-23	2026-06-24	2	0.15	DONE
575	3489	2026-06-23	2026-06-23	1	0.15	DONE
575	3490	2026-05-22	2026-05-24	3	0.15	DONE
575	3491	2026-06-23	2026-06-24	2	0.15	DONE
575	3492	2026-06-26	2026-06-26	1	0.15	DONE
575	3493	2026-06-25	2026-06-25	1	0.15	DONE
575	3494	2026-05-22	2026-09-23	\N	\N	DONE
575	3501	2026-07-18	2026-07-18	1	0.15	DONE
575	3502	2026-07-18	2026-07-18	1	0.15	DONE
575	3503	2026-07-19	2026-07-19	1	0.15	DONE
575	3504	2026-09-21	2026-09-21	1	0.15	DONE
575	3505	2026-09-23	2026-09-23	1	0	DONE
575	3506	2026-05-12	2026-12-29	231	\N	DONE
575	3507	2026-05-19	2026-05-21	3	1	DONE
575	3508	2026-05-12	2026-09-26	\N	\N	DONE
575	3509	2026-07-04	2026-07-05	2	0.1	DONE
575	3510	2026-07-04	2026-07-04	1	0.1	DONE
575	3511	2026-06-02	2026-06-04	3	0.1	DONE
575	3512	2026-07-04	2026-07-05	2	0.1	DONE
575	3513	2026-10-04	2026-10-04	1	0	DONE
575	3514	2026-12-29	2026-12-29	1	0	DONE
575	3515	2026-06-02	2026-12-29	\N	\N	DONE
575	3522	2026-02-14	2026-10-12	240	\N	DONE
575	3523	2026-05-19	2026-05-21	3	1	DONE
575	3524	2026-02-14	2026-10-12	\N	\N	DONE
575	3525	2026-06-12	2026-06-13	2	0.9	DONE
575	3526	2026-06-12	2026-06-12	1	0.9	DONE
575	3527	2026-05-07	2026-05-08	2	0.9	DONE
575	3528	2026-06-12	2026-06-13	2	0.9	DONE
575	3529	2026-06-15	2026-06-15	1	0.9	DONE
575	3530	2026-06-14	2026-06-14	1	0.9	DONE
575	3531	2026-05-07	2026-08-14	\N	\N	DONE
575	3532	\N	\N	\N	\N	PENDING
575	3539	2026-05-10	2026-05-10	1	0.9	DONE
575	3540	2026-06-15	2026-06-15	1	0.9	DONE
575	3541	2026-06-17	2026-06-17	1	0	DONE
575	3542	2026-08-12	2026-08-12	1	0.9	DONE
575	3543	2026-08-14	2026-08-14	1	0	DONE
575	3544	\N	\N	\N	\N	PENDING
575	3556	2026-04-20	2026-10-02	165	\N	DONE
575	3557	2026-05-19	2026-05-21	3	1	DONE
575	3558	2026-04-20	2026-10-02	\N	\N	DONE
575	3559	2026-07-26	2026-07-26	1	1	DONE
599	3854	2026-08-01	2026-08-01	1	0.1	DONE
575	3560	2026-07-19	2026-07-19	1	1	DONE
575	3561	2026-07-16	2026-07-17	2	1	DONE
575	3562	2026-07-26	2026-07-26	1	1	DONE
575	3563	2026-07-28	2026-07-28	1	1	DONE
575	3564	2026-07-21	2026-07-21	1	1	DONE
575	3565	2026-07-16	2026-09-16	\N	\N	DONE
575	3572	2026-07-30	2026-07-30	1	1	DONE
575	3573	2026-07-30	2026-07-30	1	1	DONE
575	3574	2026-07-31	2026-07-31	1	0.95	DONE
575	3575	2026-09-14	2026-09-14	1	1	DONE
575	3576	2026-09-16	2026-09-16	1	0	DONE
575	3577	2026-05-09	2026-10-17	161	\N	DONE
575	3578	2026-05-19	2026-05-21	3	1	DONE
575	3579	2026-05-09	2026-10-08	\N	\N	DONE
575	3580	2026-08-06	2026-08-07	2	0.15	DONE
575	3581	2026-08-06	2026-08-06	1	0.15	DONE
575	3582	2026-07-06	2026-07-08	3	0.15	DONE
575	3583	2026-08-06	2026-08-07	2	0.15	DONE
575	3584	2026-08-09	2026-08-09	1	0.15	DONE
575	3585	2026-08-08	2026-08-08	1	0.15	DONE
575	3586	2026-07-06	2026-10-17	\N	\N	DONE
575	3593	2026-08-31	2026-08-31	1	0.15	DONE
575	3594	2026-08-31	2026-08-31	1	0	DONE
575	3595	2026-10-15	2026-10-15	1	0.15	DONE
575	3596	2026-10-17	2026-10-17	1	0	DONE
575	3597	2026-05-12	2026-09-17	128	\N	DONE
575	3598	2026-05-19	2026-05-21	3	1	DONE
575	3599	2026-05-12	2026-09-17	\N	\N	DONE
575	3600	2026-06-06	2026-06-07	2	0.2	DONE
575	3601	2026-06-09	2026-06-09	1	0.2	DONE
599	3855	2026-08-04	2026-08-04	1	0	DONE
575	3602	2026-06-01	2026-06-05	5	0.2	DONE
575	3603	2026-06-06	2026-06-06	1	0.2	DONE
575	3604	2026-06-09	2026-06-09	1	0.2	DONE
575	3605	2026-06-11	2026-06-11	1	0.2	DONE
575	3606	2026-06-01	2026-08-22	\N	\N	DONE
575	3613	2026-06-07	2026-06-07	1	0.2	DONE
575	3614	2026-06-07	2026-06-07	1	0.2	DONE
575	3615	2026-06-07	2026-06-07	1	0.2	DONE
575	3616	2026-08-20	2026-08-20	1	0.2	DONE
575	3617	2026-08-22	2026-08-22	1	0	DONE
575	3618	2026-03-26	2026-09-02	160	\N	DONE
575	3619	2026-05-19	2026-05-21	3	1	DONE
575	3620	2026-03-26	2026-09-02	\N	\N	DONE
575	3621	2026-06-06	2026-06-07	2	0.35	DONE
575	3622	2026-06-09	2026-06-09	1	0.35	DONE
575	3623	2026-06-01	2026-06-03	3	0.35	DONE
575	3624	2026-06-06	2026-06-07	2	0.35	DONE
575	3625	2026-06-09	2026-06-09	1	0.35	DONE
575	3626	2026-06-11	2026-06-11	1	0	DONE
575	3627	2026-06-01	2026-08-22	\N	\N	DONE
575	3634	2026-06-05	2026-06-05	1	0	DONE
575	3635	2026-06-05	2026-06-05	1	0	DONE
575	3636	2026-06-05	2026-06-05	1	0.35	DONE
575	3637	2026-08-20	2026-08-20	1	0	DONE
575	3638	2026-08-22	2026-08-22	1	0	DONE
575	3639	2026-02-24	2026-03-03	8	1	DONE
575	3640	\N	\N	\N	1	DONE
575	3641	2026-02-07	2026-11-02	\N	0.95	DONE
575	3642	2026-02-21	2026-04-21	60	0.35	DONE
575	3643	2026-03-03	2026-07-25	145	0.35	DONE
575	3644	2026-07-03	2026-09-10	70	0.35	DONE
575	3645	2026-07-14	2026-09-16	65	0.35	DONE
575	3646	2026-08-10	2026-10-08	60	0.35	DONE
575	3647	2026-02-17	2026-02-21	5	0.6	IN_PROGRESS
575	3648	2026-02-19	2026-02-26	8	0.6	IN_PROGRESS
575	3649	2026-02-19	2026-02-26	8	0.6	IN_PROGRESS
575	3650	2026-02-24	2026-03-03	8	0.6	IN_PROGRESS
575	3651	\N	\N	8	0	PENDING
575	3652	2026-02-07	2026-02-07	\N	0.95	DONE
575	3658	2026-02-21	2026-02-21	\N	0.95	DONE
575	3669	2026-02-11	2026-02-11	\N	0.95	DONE
575	3680	2026-02-07	2026-02-07	\N	0.95	DONE
575	3691	2026-02-19	2026-02-26	8	1	DONE
575	3692	2026-02-19	2026-02-26	8	1	DONE
575	3695	2026-02-22	2026-02-22	\N	0.95	DONE
575	3705	2026-02-22	2026-02-22	\N	0.95	DONE
575	3711	2026-02-07	2026-02-07	\N	0.95	DONE
575	3722	2026-02-21	2026-02-21	\N	0.25	DONE
575	3733	2026-05-19	2026-10-21	155	\N	DONE
575	3734	2026-05-19	2026-05-21	3	1	DONE
575	3735	2026-06-01	2026-10-21	\N	\N	DONE
575	3736	2026-08-06	2026-08-07	2	0.35	DONE
575	3737	2026-08-06	2026-08-06	1	0.35	DONE
575	3738	2026-07-06	2026-07-08	3	0.35	DONE
575	3739	2026-08-06	2026-08-07	2	0.35	DONE
575	3740	2026-08-09	2026-08-09	1	0.35	DONE
575	3741	2026-08-08	2026-08-08	1	0.35	DONE
575	3742	2026-07-06	2026-10-17	\N	\N	DONE
575	3749	2026-08-31	2026-08-31	1	0.35	DONE
575	3750	2026-08-31	2026-08-31	1	0.35	DONE
575	3751	2026-08-31	2026-08-31	1	0	DONE
575	3752	2026-10-15	2026-10-15	1	0.35	DONE
575	3753	2026-10-17	2026-10-17	1	0	DONE
575	3754	2026-08-23	2026-08-24	2	1	DONE
575	3755	2026-08-26	2026-08-27	2	0	DONE
575	3756	2026-08-29	2026-08-30	2	0.35	DONE
575	3757	2026-08-23	2026-08-31	9	1	DONE
575	3758	2026-09-02	2026-09-07	6	0.8	DONE
575	3759	2026-08-23	2026-08-30	8	1	DONE
575	3760	2026-09-01	2026-09-05	5	0.8	DONE
575	3761	2026-07-12	2026-07-23	12	1	DONE
575	3762	2026-07-25	2026-07-31	7	0.8	DONE
575	3763	2026-11-02	2026-11-02	1	0	DONE
575	3770	2026-08-23	2026-08-25	3	1	DONE
575	3771	2026-09-02	2026-09-04	3	0.8	DONE
575	3772	2026-09-02	2026-09-02	1	1	DONE
575	3773	2026-09-09	2026-09-09	1	0	DONE
575	3774	2026-09-01	2026-09-01	1	1	DONE
575	3775	2026-09-07	2026-09-07	1	0	DONE
575	3779	2026-08-23	2026-08-29	7	1	DONE
575	3780	2026-08-31	2026-09-03	4	0.25	DONE
575	3781	2026-08-23	2026-08-24	2	1	DONE
575	3782	2026-08-31	2026-08-31	1	0.25	DONE
575	3783	2026-10-27	2026-10-28	2	1	DONE
575	3784	2026-10-30	2026-10-31	2	0.35	DONE
575	3786	2026-05-19	2026-10-21	155	\N	DONE
575	3787	2026-05-19	2026-05-21	3	1	DONE
575	3788	2026-06-18	2026-10-21	\N	\N	DONE
575	3789	2026-08-09	2026-08-10	2	0	DONE
575	3790	2026-08-12	2026-08-12	1	0	DONE
575	3791	2026-08-09	2026-08-10	2	0	DONE
575	3792	2026-08-12	2026-08-12	1	0	DONE
575	3793	2026-07-15	2026-07-17	3	0	DONE
575	3794	2026-08-26	2026-08-26	1	0	DONE
575	3795	2026-07-15	2026-10-06	\N	\N	DONE
575	3801	2026-07-19	2026-07-19	1	0	DONE
575	3802	2026-08-09	2026-08-10	2	0	DONE
575	3803	2026-08-12	2026-08-12	1	0	DONE
575	3804	2026-08-12	2026-08-12	1	0	DONE
575	3805	2026-08-14	2026-08-14	1	0	DONE
575	3806	2026-08-12	2026-08-12	1	0	DONE
575	3807	2026-08-14	2026-08-14	1	0	DONE
575	3808	2026-08-23	2026-08-23	1	0	DONE
575	3809	2026-08-25	2026-08-25	1	0	DONE
575	3810	2026-08-22	2026-08-22	1	0	DONE
575	3811	2026-08-24	2026-08-24	1	0	DONE
575	3812	2026-08-26	2026-08-26	1	0	DONE
575	3814	2026-10-04	2026-10-04	1	0	DONE
575	3815	2026-10-04	2026-10-04	1	0	DONE
575	3816	2026-10-06	2026-10-06	1	0	DONE
575	3817	2026-08-23	2026-08-23	1	0	DONE
575	3818	2026-08-25	2026-08-25	1	0	DONE
575	3819	2026-08-22	2026-08-22	1	0	DONE
575	3820	2026-08-09	2026-08-10	2	0	DONE
575	3821	2026-08-12	2026-08-12	1	0	DONE
575	3822	2026-08-09	2026-08-10	2	0	DONE
575	3823	2026-08-12	2026-08-12	1	0	DONE
575	3824	2026-07-15	2026-07-17	3	0	DONE
575	3825	2026-07-19	2026-07-19	1	0	DONE
575	3826	2026-07-15	2026-10-06	\N	\N	DONE
575	3833	2026-08-09	2026-08-10	2	0	DONE
575	3834	2026-08-12	2026-08-12	1	0	DONE
575	3835	2026-08-12	2026-08-12	1	0	DONE
575	3836	2026-08-14	2026-08-14	1	0	DONE
575	3837	2026-08-12	2026-08-12	1	0	DONE
575	3838	2026-08-14	2026-08-14	1	0	DONE
575	3842	2026-08-24	2026-08-24	1	0	DONE
575	3843	2026-08-26	2026-08-26	1	0	DONE
575	3844	2026-08-26	2026-08-26	1	0	DONE
599	3856	2026-04-22	2026-11-22	\N	\N	DONE
575	3845	2026-10-04	2026-10-04	1	0	DONE
575	3846	2026-10-04	2026-10-04	1	0	DONE
575	3847	2026-10-06	2026-10-06	1	0	DONE
575	3848	2026-01-29	2026-11-22	297	0.2	DONE
575	3849	2026-05-19	2026-05-21	3	1	DONE
575	3850	2026-01-29	2026-08-04	\N	0.2	DONE
575	3851	2026-06-03	2026-06-04	2	1	DONE
575	3852	2026-06-03	2026-06-03	1	1	DONE
575	3853	2026-04-22	2026-04-23	2	0.85	DONE
575	3854	2026-08-01	2026-08-01	1	0.1	DONE
575	3855	2026-08-04	2026-08-04	1	0	DONE
575	3856	2026-04-22	2026-11-22	\N	\N	DONE
575	3860	2026-06-03	2026-06-03	1	0.85	DONE
575	3861	2026-11-22	2026-11-22	1	0.15	DONE
575	3863	2026-05-19	2026-10-21	155	0.5	DONE
575	3864	2026-05-19	2026-05-21	3	1	DONE
575	3865	2026-06-01	2026-10-21	\N	\N	DONE
575	3866	2026-08-06	2026-08-07	2	0.35	DONE
575	3867	2026-08-06	2026-08-06	1	0.35	DONE
575	3868	2026-07-06	2026-07-08	3	0.35	DONE
575	3869	2026-08-06	2026-08-07	2	0.35	DONE
575	3870	2026-08-09	2026-08-09	1	0.35	DONE
599	3860	2026-06-03	2026-06-03	1	0.85	DONE
575	3871	2026-08-08	2026-08-08	1	0.35	DONE
575	3872	2026-07-06	2026-10-17	\N	\N	DONE
575	3879	2026-08-31	2026-08-31	1	0.35	DONE
575	3880	2026-08-31	2026-08-31	1	0.35	DONE
575	3881	2026-08-31	2026-08-31	1	0	DONE
575	3882	2026-10-15	2026-10-15	1	0.35	DONE
575	3883	2026-10-17	2026-10-17	1	0	DONE
575	4766	2026-01-19	2026-07-29	\N	0	PENDING
575	4767	2026-01-19	2026-07-17	\N	0	PENDING
575	4768	2026-01-19	2026-01-20	2	0.65	IN_PROGRESS
575	4769	2026-02-23	2026-03-04	10	0.8	IN_PROGRESS
575	4770	2026-02-07	2026-02-26	20	0.9	IN_PROGRESS
575	4771	2026-05-08	2026-06-07	31	0	PENDING
575	4772	2026-06-28	2026-07-12	15	0	PENDING
575	4773	2026-03-29	2026-03-29	\N	0	PENDING
575	4774	2026-05-01	2026-05-30	30	0	PENDING
575	4775	2026-03-29	2026-03-29	\N	0	PENDING
575	4776	2026-03-29	2026-04-17	20	0	PENDING
575	4777	2026-04-17	2026-04-19	3	0	PENDING
575	4778	2026-04-23	2026-05-12	20	0	PENDING
575	4779	2026-05-12	2026-05-12	1	0	PENDING
599	3861	2026-11-22	2026-11-22	1	0.15	DONE
575	4780	2026-05-08	2026-05-08	\N	0	PENDING
575	4781	2026-05-08	2026-05-27	20	0	PENDING
575	4782	2026-05-25	2026-05-27	3	0	PENDING
575	4783	2026-06-04	2026-06-23	20	0	PENDING
575	4784	2026-06-24	2026-06-24	1	0	PENDING
575	4785	2026-05-23	2026-05-23	\N	0	PENDING
575	4786	2026-06-04	2026-06-23	20	0	PENDING
575	4787	2026-05-23	2026-05-25	3	0	PENDING
575	4788	2026-06-27	2026-07-11	15	0	PENDING
575	4789	2026-07-17	2026-07-17	1	0	PENDING
575	4790	2026-06-11	2026-06-11	\N	0	PENDING
575	4791	2026-06-11	2026-06-30	20	0	PENDING
575	4792	2026-03-29	2026-07-29	\N	0.5	PENDING
575	4793	2026-07-02	2026-07-16	15	0	PENDING
575	4794	2026-07-17	2026-07-17	1	0	PENDING
575	4796	\N	\N	\N	\N	PENDING
575	4797	2026-06-20	2026-06-20	1	0	PENDING
575	4798	2026-06-22	2026-06-24	3	0	PENDING
575	4799	2026-03-29	2026-03-29	1	0	PENDING
575	4800	2026-04-08	2026-04-10	3	0	PENDING
575	4801	2026-06-20	2026-06-21	2	0	PENDING
575	4802	2026-06-23	2026-06-25	3	0	PENDING
575	4803	2026-05-01	2026-05-01	1	0	PENDING
575	4804	2026-05-03	2026-05-05	3	0	PENDING
575	4805	2026-06-22	2026-06-23	2	0	PENDING
575	4806	2026-06-26	2026-06-27	2	0	PENDING
575	4807	2026-03-31	2026-03-31	1	0	PENDING
575	4808	2026-04-12	2026-04-12	1	0	PENDING
575	4809	2026-06-23	2026-06-25	3	0	PENDING
575	4810	2026-06-27	2026-06-28	2	0	PENDING
575	4811	2026-06-23	2026-06-23	1	0	PENDING
575	4812	2026-06-25	2026-06-28	4	0	PENDING
575	4813	2026-06-30	2026-06-30	1	0	PENDING
575	4814	2026-07-02	2026-07-03	2	0	PENDING
575	4815	2026-06-25	2026-06-25	1	0	PENDING
575	4816	2026-06-30	2026-06-30	1	0	PENDING
575	4817	2026-07-19	2026-07-19	1	0	PENDING
575	4818	\N	\N	\N	\N	PENDING
575	4819	2026-06-20	2026-06-20	1	0	PENDING
575	4820	2026-06-20	2026-06-22	3	0	PENDING
575	4821	2026-03-29	2026-03-29	1	0	PENDING
575	4822	2026-03-29	2026-03-30	2	0	PENDING
575	4823	2026-06-20	2026-06-21	2	0	PENDING
575	4824	2026-06-20	2026-06-21	2	0	PENDING
575	4825	2026-05-01	2026-05-02	2	0	PENDING
575	4826	2026-05-01	2026-05-03	3	0	PENDING
575	4827	2026-06-21	2026-06-23	3	0	PENDING
575	4828	2026-06-24	2026-06-24	1	0	PENDING
575	4829	2026-03-30	2026-03-31	2	0	PENDING
575	4830	2026-04-01	2026-04-01	1	0	PENDING
575	4831	2026-04-01	2026-04-02	2	0	PENDING
575	4832	2026-04-22	2026-04-22	1	0	PENDING
575	4833	2026-06-20	2026-06-21	2	0	PENDING
575	4834	2026-06-21	2026-06-22	2	0	PENDING
575	4835	2026-06-21	2026-06-23	3	0	PENDING
575	4836	2026-06-24	2026-06-24	1	0	PENDING
575	4837	2026-06-21	2026-06-22	2	0	PENDING
575	4838	2026-06-26	2026-06-26	1	0	PENDING
575	4839	2026-07-29	2026-07-29	1	0	PENDING
575	4840	\N	\N	\N	\N	PENDING
575	4841	2026-06-20	2026-06-21	2	0	PENDING
575	4842	2026-06-23	2026-06-24	2	0	PENDING
575	4843	2026-03-29	2026-03-30	2	0	PENDING
575	4844	2026-04-01	2026-04-02	2	0	PENDING
575	4845	2026-06-20	2026-06-21	2	0	PENDING
575	4846	2026-06-21	2026-06-22	2	0	PENDING
575	4847	2026-05-01	2026-05-02	2	0	PENDING
575	4848	2026-05-04	2026-05-06	3	0	PENDING
575	4849	2026-06-23	2026-06-23	1	0	PENDING
575	4850	2026-06-26	2026-06-26	1	0	PENDING
575	4851	2026-04-01	2026-04-01	1	0	PENDING
575	4852	2026-04-04	2026-04-04	1	0	PENDING
575	4853	2026-04-01	2026-04-01	1	0	PENDING
575	4854	2026-04-22	2026-04-23	2	0	PENDING
575	4855	2026-06-25	2026-06-25	1	0	PENDING
575	4856	2026-06-28	2026-06-29	2	0	PENDING
575	4857	2026-06-27	2026-06-27	1	0	PENDING
575	4858	2026-06-29	2026-06-29	1	0	PENDING
575	4859	2026-07-15	2026-07-15	1	0	PENDING
575	4860	2026-07-17	2026-07-17	1	0	PENDING
575	4861	2026-07-19	2026-07-19	1	0	PENDING
575	4862	\N	\N	\N	\N	PENDING
575	4863	2026-06-20	2026-06-21	2	0	PENDING
575	4864	2026-06-23	2026-06-27	5	0	PENDING
575	4865	2026-06-29	2026-07-03	5	0	PENDING
575	4866	2026-03-29	2026-03-29	1	0	PENDING
575	4867	2026-03-31	2026-04-04	5	0	PENDING
575	4868	2026-04-06	2026-04-10	5	0	PENDING
575	4869	2026-06-20	2026-06-21	2	0	PENDING
575	4870	2026-06-23	2026-06-27	5	0	PENDING
575	4871	2026-06-29	2026-07-03	5	0	PENDING
575	4872	2026-06-23	2026-06-23	1	0	PENDING
575	4873	2026-06-29	2026-06-29	1	0	PENDING
575	4874	2026-07-05	2026-07-05	1	0	PENDING
575	4875	2026-03-31	2026-03-31	1	0	PENDING
575	4876	2026-04-06	2026-04-06	1	0	PENDING
575	4877	2026-04-12	2026-04-12	1	0	PENDING
575	4878	2026-07-05	2026-07-06	2	0	PENDING
575	4879	2026-07-05	2026-07-06	2	0	PENDING
575	4880	2026-07-08	2026-07-09	2	0	PENDING
575	4881	2026-07-05	2026-07-06	2	0	PENDING
575	4882	2026-07-07	2026-07-09	3	0	PENDING
575	4883	2026-07-10	2026-07-12	3	0	PENDING
575	4884	2026-07-05	2026-07-05	1	0	PENDING
575	4885	2026-07-07	2026-07-07	1	0	PENDING
575	4886	2026-07-09	2026-07-09	1	0	PENDING
575	4887	2026-07-14	2026-07-14	1	0	PENDING
575	4888	2026-03-12	2026-10-11	\N	\N	PENDING
575	4889	2026-03-12	2026-10-11	\N	\N	PENDING
575	4890	2026-06-16	2026-07-05	20	\N	PENDING
575	4891	2026-03-12	2026-03-16	5	0.05	IN_PROGRESS
575	4892	2026-06-23	2026-07-02	10	\N	PENDING
575	4893	2026-03-17	2026-03-26	10	\N	PENDING
575	4894	2026-09-16	2026-10-10	25	\N	PENDING
575	4895	2026-10-02	2026-10-11	10	\N	PENDING
575	4896	2026-05-29	2026-08-13	\N	\N	PENDING
575	4897	2026-05-29	2026-05-30	2	\N	PENDING
575	4898	2026-05-29	2026-05-29	1	\N	PENDING
575	4899	2026-06-17	2026-06-18	2	\N	PENDING
575	4900	2026-06-01	2026-06-02	2	\N	PENDING
575	4901	2026-06-01	2026-06-01	1	\N	PENDING
575	4902	2026-05-31	2026-05-31	1	\N	PENDING
575	4903	2026-06-20	2026-06-20	1	\N	PENDING
575	4904	2026-06-01	2026-06-01	1	\N	PENDING
575	4905	2026-06-02	2026-06-02	1	\N	PENDING
575	4906	2026-08-12	2026-08-12	1	\N	PENDING
575	4907	2026-08-13	2026-08-13	1	\N	PENDING
575	4908	2026-04-06	2026-10-13	\N	\N	PENDING
575	4909	2026-04-06	2026-10-13	\N	\N	PENDING
575	4910	2026-06-23	2026-07-12	20	0	PENDING
575	4911	2026-04-06	2026-04-10	5	0	PENDING
575	4912	2026-07-05	2026-07-14	10	0	PENDING
575	4913	2026-04-11	2026-04-20	10	0	PENDING
575	4914	2026-09-29	2026-10-13	15	0	PENDING
599	3863	2026-05-19	2026-10-21	155	0.5	DONE
575	4915	2026-10-04	2026-10-13	10	0	PENDING
575	4916	2026-05-29	2026-08-13	\N	\N	PENDING
575	4917	2026-05-29	2026-05-30	2	0	PENDING
575	4918	2026-05-29	2026-05-29	1	0	PENDING
575	4919	2026-06-17	2026-06-20	4	0	PENDING
575	4920	2026-06-01	2026-06-02	2	0	PENDING
575	4921	2026-06-01	2026-06-01	1	0	PENDING
575	4922	2026-05-31	2026-05-31	1	0	PENDING
575	4923	2026-06-22	2026-06-22	1	0	PENDING
575	4924	2026-06-01	2026-06-01	1	0	PENDING
575	4925	2026-06-02	2026-06-02	1	0	PENDING
575	4926	2026-08-12	2026-08-12	1	0	PENDING
575	4927	2026-08-13	2026-08-13	1	0	PENDING
575	4928	2026-05-12	2026-09-26	\N	\N	PENDING
575	4929	2026-05-12	2026-09-26	\N	\N	PENDING
575	4930	2026-06-23	2026-07-02	10	0	PENDING
575	4931	2026-05-12	2026-05-16	5	0	PENDING
575	4932	2026-07-03	2026-07-05	3	0	PENDING
575	4933	2026-05-18	2026-05-20	3	0	PENDING
575	4934	2026-09-20	2026-09-26	7	0	PENDING
575	4935	2026-09-24	2026-09-26	3	0	PENDING
575	4936	2026-05-22	2026-09-23	\N	\N	PENDING
575	4937	2026-06-23	2026-06-24	2	0	PENDING
575	4938	2026-06-23	2026-06-23	1	0	PENDING
575	4939	2026-05-22	2026-05-24	3	0	PENDING
575	4940	2026-06-23	2026-06-24	2	0	PENDING
575	4941	2026-06-26	2026-06-26	1	0	PENDING
575	4942	2026-06-25	2026-06-25	1	0	PENDING
575	4943	2026-07-18	2026-07-18	1	0	PENDING
575	4944	2026-07-18	2026-07-18	1	0	PENDING
575	4945	2026-07-19	2026-07-19	1	0	PENDING
575	4946	2026-09-21	2026-09-21	1	0	PENDING
575	4947	2026-09-23	2026-09-23	1	0	PENDING
575	4948	2026-05-12	2026-09-26	\N	\N	PENDING
575	4949	2026-06-23	2026-07-02	10	0	PENDING
575	4950	2026-05-12	2026-05-16	5	0	PENDING
575	4951	2026-07-03	2026-07-05	3	0	PENDING
575	4952	2026-05-18	2026-05-20	3	0	PENDING
575	4953	2026-09-20	2026-09-26	7	0	PENDING
575	4954	2026-09-24	2026-09-26	3	0	PENDING
575	4955	2026-06-02	2026-10-04	\N	\N	PENDING
575	4956	2026-07-04	2026-07-05	2	0	PENDING
575	4957	2026-07-04	2026-07-04	1	0	PENDING
575	4958	2026-06-02	2026-06-04	3	0	PENDING
575	4959	2026-07-04	2026-07-05	2	0	PENDING
575	4960	2026-07-07	2026-07-07	1	0	PENDING
575	4961	2026-07-06	2026-07-06	1	0	PENDING
575	4962	2026-07-29	2026-07-29	1	0	PENDING
575	4963	2026-07-29	2026-07-29	1	0	PENDING
575	4964	2026-07-29	2026-07-29	1	0	PENDING
575	4965	2026-10-02	2026-10-02	1	0	PENDING
575	4966	2026-10-04	2026-10-04	1	0	PENDING
575	4967	2026-02-14	2026-10-12	\N	\N	PENDING
575	4968	2026-02-14	2026-10-12	\N	\N	PENDING
575	4969	2026-06-02	2026-06-11	10	0	PENDING
575	4970	2026-02-14	2026-02-18	5	0	PENDING
575	4971	2026-06-12	2026-06-14	3	0	PENDING
575	4972	2026-06-15	2026-06-17	3	0	PENDING
575	4973	2026-09-28	2026-10-12	15	0	PENDING
575	4974	2026-10-10	2026-10-12	3	0	PENDING
575	4975	2026-05-07	2026-08-14	\N	\N	PENDING
575	4976	\N	\N	\N	\N	PENDING
575	4977	2026-06-12	2026-06-13	2	0	PENDING
575	4978	2026-06-12	2026-06-12	1	0	PENDING
575	4979	2026-05-07	2026-05-08	2	0	PENDING
575	4980	2026-06-12	2026-06-13	2	0	PENDING
575	4981	2026-06-15	2026-06-15	1	0	PENDING
575	4982	2026-06-14	2026-06-14	1	0	PENDING
575	4983	2026-05-10	2026-05-10	1	0	PENDING
575	4984	2026-06-15	2026-06-15	1	0	PENDING
575	4985	2026-06-17	2026-06-17	1	0	PENDING
575	4986	2026-08-12	2026-08-12	1	0	PENDING
575	4987	2026-08-14	2026-08-14	1	0	PENDING
575	4988	\N	\N	\N	\N	PENDING
575	4989	2026-06-12	2026-06-13	2	0	PENDING
575	4990	2026-06-12	2026-06-12	1	0	PENDING
575	4991	2026-05-07	2026-05-08	2	0	PENDING
575	4992	2026-06-12	2026-06-13	2	0	PENDING
575	4993	2026-06-15	2026-06-15	1	0	PENDING
575	4994	2026-06-14	2026-06-14	1	0	PENDING
575	4995	2026-05-10	2026-05-10	1	0	PENDING
575	4996	2026-06-15	2026-06-15	1	0	PENDING
575	4997	2026-06-17	2026-06-17	1	0	PENDING
575	4998	2026-08-12	2026-08-12	1	0	PENDING
575	4999	2026-08-14	2026-08-14	1	0	PENDING
575	5000	2026-04-20	2026-10-17	\N	\N	PENDING
575	5001	2026-04-20	2026-10-17	\N	\N	PENDING
575	5002	2026-07-01	2026-07-15	15	0	PENDING
575	5003	2026-04-20	2026-04-24	5	0	PENDING
575	5004	2026-09-25	2026-09-27	3	0	PENDING
575	5005	2026-09-25	2026-09-27	3	0	PENDING
575	5006	2026-09-22	2026-10-01	10	0	PENDING
575	5007	2026-09-30	2026-10-02	3	0	PENDING
575	5008	2026-05-15	2026-05-15	\N	\N	PENDING
575	5009	2026-07-26	2026-07-26	1	0	PENDING
575	5010	2026-07-19	2026-07-19	1	0	PENDING
575	5011	2026-07-16	2026-07-17	2	0	PENDING
575	5012	2026-07-26	2026-07-26	1	0	PENDING
575	5013	2026-07-28	2026-07-28	1	0	PENDING
575	5014	2026-07-21	2026-07-21	1	0	PENDING
575	5015	2026-07-16	2026-09-16	\N	\N	PENDING
575	5022	2026-07-30	2026-07-30	1	0	PENDING
575	5023	2026-07-30	2026-07-30	1	0	PENDING
575	5024	2026-07-31	2026-07-31	1	0	PENDING
575	5025	2026-09-14	2026-09-14	1	0	PENDING
575	5026	2026-09-16	2026-09-16	1	0	PENDING
575	5027	2026-05-09	2026-10-17	\N	\N	PENDING
575	5028	2026-05-09	2026-10-08	\N	\N	PENDING
575	5029	2026-07-04	2026-07-13	10	0	PENDING
575	5030	2026-05-09	2026-05-13	5	0	PENDING
575	5031	2026-07-14	2026-07-16	3	0	PENDING
575	5032	2026-05-14	2026-05-16	3	0	PENDING
575	5033	2026-10-02	2026-10-08	7	0	PENDING
575	5034	2026-10-06	2026-10-08	3	0	PENDING
575	5035	2026-07-06	2026-10-17	\N	\N	PENDING
575	5036	2026-08-06	2026-08-07	2	0	PENDING
575	5037	2026-08-06	2026-08-06	1	0	PENDING
575	5038	2026-07-06	2026-07-08	3	0	PENDING
575	5039	2026-08-06	2026-08-07	2	0	PENDING
575	5040	2026-08-09	2026-08-09	1	0	PENDING
575	5041	2026-08-08	2026-08-08	1	0	PENDING
575	5042	2026-08-31	2026-08-31	1	0	PENDING
575	5043	2026-08-31	2026-08-31	1	0	PENDING
575	5044	2026-08-31	2026-08-31	1	0	PENDING
575	5045	2026-10-15	2026-10-15	1	0	PENDING
575	5046	2026-10-17	2026-10-17	1	0	PENDING
575	5047	2026-05-12	2026-09-17	\N	\N	PENDING
575	5048	2026-05-12	2026-09-17	\N	\N	PENDING
575	5049	2026-05-12	2026-05-31	20	0	PENDING
575	5050	2026-05-31	2026-06-04	5	0	PENDING
575	5051	2026-06-01	2026-06-07	7	0	PENDING
575	5052	2026-06-05	2026-06-11	7	0	PENDING
575	5053	2026-08-29	2026-09-17	20	0	PENDING
575	5054	2026-09-11	2026-09-17	7	0	PENDING
575	5055	2026-06-01	2026-08-22	\N	\N	PENDING
575	5056	2026-06-06	2026-06-07	2	0	PENDING
575	5057	2026-06-09	2026-06-09	1	0	PENDING
575	5058	2026-06-01	2026-06-05	5	0	PENDING
575	5059	2026-06-06	2026-06-06	1	0	PENDING
575	5060	2026-06-09	2026-06-09	1	0	PENDING
575	5061	2026-06-11	2026-06-11	1	0	PENDING
575	5062	2026-06-07	2026-06-07	1	0	PENDING
575	5063	2026-06-07	2026-06-07	1	0	PENDING
575	5064	2026-06-07	2026-06-07	1	0	PENDING
575	5065	2026-08-20	2026-08-20	1	0	PENDING
575	5066	2026-08-22	2026-08-22	1	0	PENDING
575	5067	2026-03-26	2026-09-02	\N	\N	PENDING
575	5068	2026-03-26	2026-09-02	\N	\N	PENDING
575	5069	2026-06-08	2026-07-02	25	0	PENDING
575	5070	2026-03-26	2026-03-30	5	0	PENDING
575	5071	2026-07-03	2026-07-05	3	0	PENDING
575	5072	2026-03-31	2026-04-02	3	0	PENDING
575	5073	2026-08-27	2026-09-02	7	0	PENDING
575	5074	2026-08-31	2026-09-02	3	0	PENDING
575	5075	2026-06-01	2026-08-22	\N	\N	PENDING
575	5076	2026-06-06	2026-06-07	2	0	PENDING
575	5077	2026-06-09	2026-06-09	1	0	PENDING
575	5078	2026-06-01	2026-06-03	3	0	PENDING
575	5079	2026-06-06	2026-06-07	2	0	PENDING
575	5080	2026-06-09	2026-06-09	1	0	PENDING
575	5081	2026-06-11	2026-06-11	1	0	PENDING
575	5082	2026-06-05	2026-06-05	1	0	PENDING
575	5083	2026-06-05	2026-06-05	1	0	PENDING
575	5084	2026-06-05	2026-06-05	1	0	PENDING
575	5085	2026-08-20	2026-08-20	1	0	PENDING
575	5086	2026-08-22	2026-08-22	1	0	PENDING
575	5087	2026-02-07	2026-11-02	\N	\N	PENDING
575	5088	2026-02-07	2026-11-02	\N	\N	PENDING
575	5089	2026-02-07	2026-04-17	70	0	PENDING
575	5090	2026-02-16	2026-06-05	110	0	PENDING
575	5091	2026-05-28	2026-07-11	45	0	PENDING
575	5092	2026-03-23	2026-06-10	80	0	PENDING
575	5093	2026-07-02	2026-10-09	100	0	PENDING
575	5094	2026-02-07	2026-02-07	\N	0	PENDING
575	5095	2026-02-07	2026-04-02	55	0	PENDING
575	5096	2026-02-14	2026-04-04	50	0	PENDING
575	5097	2026-05-28	2026-07-31	65	0	PENDING
575	5098	2026-03-23	2026-04-06	15	0	PENDING
575	5099	2026-08-01	2026-09-29	60	0	PENDING
575	5100	2026-02-21	2026-02-21	\N	0	PENDING
575	5101	2026-02-21	2026-04-21	60	0	PENDING
575	5102	2026-03-03	2026-07-25	145	0	PENDING
575	5103	2026-07-03	2026-09-10	70	0	PENDING
575	5104	2026-07-14	2026-09-16	65	0	PENDING
575	5105	2026-08-10	2026-10-08	60	0	PENDING
575	5106	2026-02-11	2026-02-11	\N	0	PENDING
575	5107	2026-02-11	2026-03-17	35	0	PENDING
575	5108	2026-03-08	2026-06-05	90	0	PENDING
575	5109	2026-04-13	2026-06-11	60	0	PENDING
575	5110	2026-04-10	2026-06-13	65	0	PENDING
575	5111	2026-06-15	2026-08-03	50	0	PENDING
575	5112	2026-02-07	2026-02-07	\N	0	PENDING
575	5113	2026-02-07	2026-03-23	45	0.2	IN_PROGRESS
575	5114	2026-03-04	2026-06-26	115	0.2	IN_PROGRESS
575	5115	2026-06-17	2026-09-04	80	0	PENDING
575	5116	2026-06-28	2026-09-05	70	0	PENDING
575	5117	2026-02-07	2026-03-23	45	0	PENDING
575	5118	2026-03-04	2026-06-26	115	0	PENDING
575	5119	2026-06-17	2026-09-04	80	0	PENDING
575	5120	2026-06-28	2026-09-05	70	0	PENDING
575	5121	2026-08-28	2026-11-02	67	0	PENDING
575	5122	2026-02-17	2026-02-21	5	0.7058824	IN_PROGRESS
575	5123	2026-02-19	2026-02-26	8	0.1	IN_PROGRESS
575	5124	2026-02-19	2026-02-26	8	0	PENDING
575	5125	2026-02-24	2026-03-03	8	0	PENDING
575	5126	2026-02-22	2026-02-22	\N	0	PENDING
575	5127	2026-02-07	2026-03-23	45	0.6	IN_PROGRESS
575	5128	2026-03-04	2026-06-26	115	0.6	IN_PROGRESS
575	5129	2026-06-17	2026-09-04	80	0	PENDING
575	5130	2026-06-28	2026-09-05	70	0	PENDING
575	5131	2026-02-07	2026-03-23	45	0.5	IN_PROGRESS
575	5132	2026-03-04	2026-06-26	115	0.5	IN_PROGRESS
575	5133	2026-06-17	2026-09-04	80	0	PENDING
575	5134	2026-06-28	2026-09-05	70	0	PENDING
575	5135	2026-08-28	2026-11-02	67	0	PENDING
575	5136	2026-02-22	2026-02-22	\N	0	PENDING
575	5137	2026-02-22	2026-03-23	30	0	PENDING
575	5138	2026-03-19	2026-05-17	60	0	PENDING
575	5139	2026-05-23	2026-07-16	55	0	PENDING
575	5140	2026-06-02	2026-07-18	47	0	PENDING
575	5141	2026-06-22	2026-07-27	36	0	PENDING
575	5142	2026-02-07	2026-02-07	\N	0	PENDING
575	5143	2026-02-12	2026-03-18	35	0	PENDING
575	5144	2026-03-09	2026-06-01	85	0	PENDING
575	5145	2026-05-23	2026-07-26	65	0	PENDING
575	5146	2026-05-28	2026-07-26	60	0	PENDING
575	5147	2026-07-09	2026-09-11	65	0	PENDING
575	5148	2026-02-12	2026-02-12	\N	0	PENDING
575	5154	2026-06-01	2026-06-01	\N	0	PENDING
575	5155	2026-06-11	2026-06-12	2	0	PENDING
575	5156	2026-06-09	2026-06-09	1	0	PENDING
575	5157	2026-06-01	2026-06-05	5	0	PENDING
575	5158	2026-06-06	2026-06-06	1	0	PENDING
575	5159	2026-06-09	2026-06-09	1	0	PENDING
575	5160	2026-06-11	2026-06-11	1	0	PENDING
575	5161	2026-06-07	2026-06-07	1	0	PENDING
575	5162	2026-06-07	2026-06-07	1	0	PENDING
575	5163	2026-06-07	2026-06-07	1	0	PENDING
575	5164	2026-08-20	2026-08-20	1	0	PENDING
575	5165	2026-08-22	2026-08-22	1	0	PENDING
575	5166	2026-06-01	2026-10-21	\N	\N	PENDING
575	5167	2026-06-01	2026-10-21	\N	\N	PENDING
575	5168	2026-08-06	2026-08-15	10	0	PENDING
575	5169	2026-06-01	2026-06-05	5	0	PENDING
575	5170	2026-08-16	2026-08-18	3	0	PENDING
575	5171	2026-06-06	2026-06-08	3	0	PENDING
575	5172	2026-10-15	2026-10-21	7	0	PENDING
575	5173	2026-10-19	2026-10-21	3	0	PENDING
575	5174	2026-07-06	2026-10-17	\N	\N	PENDING
575	5175	2026-08-06	2026-08-07	2	0	PENDING
575	5176	2026-08-06	2026-08-06	1	0	PENDING
575	5177	2026-07-06	2026-07-08	3	0	PENDING
575	5178	2026-08-06	2026-08-07	2	0	PENDING
575	5179	2026-08-09	2026-08-09	1	0	PENDING
575	5180	2026-08-08	2026-08-08	1	0	PENDING
575	5181	2026-08-31	2026-08-31	1	0	PENDING
575	5182	2026-08-31	2026-08-31	1	0	PENDING
575	5183	2026-08-31	2026-08-31	1	0	PENDING
575	5184	2026-10-15	2026-10-15	1	0	PENDING
575	5185	2026-10-17	2026-10-17	1	0	PENDING
575	5186	2026-04-18	2026-11-02	\N	\N	PENDING
575	5187	2026-04-18	2026-10-24	\N	\N	PENDING
575	5188	2026-08-23	2026-09-01	10	0	PENDING
575	5189	2026-04-18	2026-04-22	5	0	PENDING
575	5190	2026-09-02	2026-09-04	3	0	PENDING
575	5191	2026-04-23	2026-04-25	3	0	PENDING
575	5192	2026-10-17	2026-10-23	7	0	PENDING
575	5193	2026-10-24	2026-10-24	1	0	PENDING
575	5194	2026-07-12	2026-11-02	\N	\N	PENDING
575	5195	2026-08-23	2026-08-31	9	0	PENDING
575	5196	2026-09-02	2026-09-07	6	0	PENDING
575	5197	2026-08-23	2026-08-30	8	0	PENDING
575	5198	2026-09-01	2026-09-05	5	0	PENDING
575	5199	2026-07-12	2026-07-23	12	0	PENDING
575	5200	2026-07-25	2026-07-31	7	0	PENDING
575	5201	2026-08-23	2026-08-25	3	0	PENDING
575	5202	2026-09-02	2026-09-04	3	0	PENDING
575	5203	2026-09-02	2026-09-02	1	0	PENDING
575	5204	2026-09-09	2026-09-09	1	0	PENDING
575	5205	2026-09-01	2026-09-01	1	0	PENDING
575	5206	2026-09-07	2026-09-07	1	0	PENDING
575	5207	2026-08-23	2026-08-24	2	0	PENDING
575	5208	2026-08-26	2026-08-27	2	0	PENDING
575	5209	2026-08-29	2026-08-30	2	0	PENDING
575	5210	2026-08-23	2026-08-29	7	0	PENDING
575	5211	2026-08-31	2026-09-03	4	0	PENDING
575	5212	2026-08-23	2026-08-24	2	0	PENDING
575	5213	2026-08-31	2026-08-31	1	0	PENDING
575	5214	2026-10-27	2026-10-28	2	0	PENDING
575	5215	2026-10-30	2026-10-31	2	0	PENDING
575	5216	2026-11-02	2026-11-02	1	0	PENDING
575	5217	2026-06-18	2026-10-21	\N	\N	PENDING
575	5218	2026-06-18	2026-10-21	\N	\N	PENDING
575	5219	2026-08-09	2026-08-18	10	0	PENDING
575	5220	2026-06-18	2026-06-22	5	0	PENDING
575	5221	2026-08-19	2026-08-21	3	0	PENDING
575	5222	2026-06-23	2026-06-25	3	0	PENDING
575	5223	2026-10-15	2026-10-21	7	0	PENDING
575	5224	2026-10-19	2026-10-21	3	0	PENDING
575	5225	2026-07-15	2026-10-06	\N	\N	PENDING
575	5226	2026-08-09	2026-08-10	2	0	PENDING
575	5227	2026-08-12	2026-08-12	1	0	PENDING
575	5228	2026-08-09	2026-08-10	2	0	PENDING
575	5229	2026-08-12	2026-08-12	1	0	PENDING
575	5230	2026-07-15	2026-07-17	3	0	PENDING
575	5231	2026-07-19	2026-07-19	1	0	PENDING
575	5232	2026-08-09	2026-08-10	2	0	PENDING
575	5233	2026-08-12	2026-08-12	1	0	PENDING
575	5234	2026-08-12	2026-08-12	1	0	PENDING
599	3864	2026-05-19	2026-05-21	3	1	DONE
599	3865	2026-06-01	2026-10-21	\N	\N	DONE
599	3866	2026-08-06	2026-08-07	2	0.35	DONE
599	3867	2026-08-06	2026-08-06	1	0.35	DONE
599	3868	2026-07-06	2026-07-08	3	0.35	DONE
599	3869	2026-08-06	2026-08-07	2	0.35	DONE
599	3870	2026-08-09	2026-08-09	1	0.35	DONE
599	3871	2026-08-08	2026-08-08	1	0.35	DONE
599	3872	2026-07-06	2026-10-17	\N	\N	DONE
599	3879	2026-08-31	2026-08-31	1	0.35	DONE
599	3880	2026-08-31	2026-08-31	1	0.35	DONE
599	3881	2026-08-31	2026-08-31	1	0	DONE
599	3882	2026-10-15	2026-10-15	1	0.35	DONE
599	3883	2026-10-17	2026-10-17	1	0	DONE
599	4766	2026-01-19	2026-07-29	\N	0	PENDING
599	4767	2026-01-19	2026-07-17	\N	0	PENDING
599	4768	2026-01-19	2026-01-20	2	0.65	IN_PROGRESS
599	4769	2026-02-23	2026-03-04	10	0.8	IN_PROGRESS
599	4770	2026-02-07	2026-02-26	20	0.9	IN_PROGRESS
599	4771	2026-05-08	2026-06-07	31	0	PENDING
599	4772	2026-06-28	2026-07-12	15	0	PENDING
599	4773	2026-03-29	2026-03-29	\N	0	PENDING
599	4774	2026-05-01	2026-05-30	30	0	PENDING
599	4775	2026-03-29	2026-03-29	\N	0	PENDING
599	4776	2026-03-29	2026-04-17	20	0	PENDING
599	4777	2026-04-17	2026-04-19	3	0	PENDING
599	4778	2026-04-23	2026-05-12	20	0	PENDING
599	4779	2026-05-12	2026-05-12	1	0	PENDING
599	4780	2026-05-08	2026-05-08	\N	0	PENDING
599	4781	2026-05-08	2026-05-27	20	0	PENDING
599	4782	2026-05-25	2026-05-27	3	0	PENDING
599	4783	2026-06-04	2026-06-23	20	0	PENDING
599	4784	2026-06-24	2026-06-24	1	0	PENDING
599	4785	2026-05-23	2026-05-23	\N	0	PENDING
599	4786	2026-06-04	2026-06-23	20	0	PENDING
575	5235	2026-08-14	2026-08-14	1	0	PENDING
575	5236	2026-08-12	2026-08-12	1	0	PENDING
575	5237	2026-08-14	2026-08-14	1	0	PENDING
575	5238	2026-08-23	2026-08-23	1	0	PENDING
575	5239	2026-08-25	2026-08-25	1	0	PENDING
575	5240	2026-08-22	2026-08-22	1	0	PENDING
575	5241	2026-08-24	2026-08-24	1	0	PENDING
575	5242	2026-08-26	2026-08-26	1	0	PENDING
575	5243	2026-08-26	2026-08-26	1	0	PENDING
575	5244	2026-10-04	2026-10-04	1	0	PENDING
575	5245	2026-10-04	2026-10-04	1	0	PENDING
575	5246	2026-10-06	2026-10-06	1	0	PENDING
575	5247	2026-06-18	2026-10-21	\N	\N	PENDING
575	5248	2026-06-18	2026-10-21	\N	\N	PENDING
575	5249	2026-08-09	2026-08-18	10	0	PENDING
575	5250	2026-06-18	2026-06-22	5	0	PENDING
575	5251	2026-08-19	2026-08-21	3	0	PENDING
575	5252	2026-06-23	2026-06-25	3	0	PENDING
575	5253	2026-10-15	2026-10-21	7	0	PENDING
575	5254	2026-10-19	2026-10-21	3	0	PENDING
575	5255	2026-07-15	2026-10-06	\N	\N	PENDING
575	5256	2026-08-09	2026-08-10	2	0	PENDING
575	5257	2026-08-12	2026-08-12	1	0	PENDING
575	5258	2026-08-09	2026-08-10	2	0	PENDING
575	5259	2026-08-12	2026-08-12	1	0	PENDING
575	5260	2026-07-15	2026-07-17	3	0	PENDING
575	5261	2026-07-19	2026-07-19	1	0	PENDING
575	5262	2026-08-09	2026-08-10	2	0	PENDING
575	5263	2026-08-12	2026-08-12	1	0	PENDING
575	5264	2026-08-12	2026-08-12	1	0	PENDING
575	5265	2026-08-14	2026-08-14	1	0	PENDING
575	5266	2026-08-12	2026-08-12	1	0	PENDING
575	5267	2026-08-14	2026-08-14	1	0	PENDING
575	5268	2026-08-23	2026-08-23	1	0	PENDING
575	5269	2026-08-25	2026-08-25	1	0	PENDING
575	5270	2026-08-22	2026-08-22	1	0	PENDING
575	5271	2026-08-24	2026-08-24	1	0	PENDING
575	5272	2026-08-26	2026-08-26	1	0	PENDING
575	5273	2026-08-26	2026-08-26	1	0	PENDING
575	5274	2026-10-04	2026-10-04	1	0	PENDING
575	5275	2026-10-04	2026-10-04	1	0	PENDING
575	5276	2026-10-06	2026-10-06	1	0	PENDING
575	5277	2026-01-29	2026-08-04	\N	\N	PENDING
575	5278	2026-01-29	2026-08-04	\N	\N	PENDING
575	5279	2026-06-03	2026-06-12	10	0	PENDING
575	5280	2026-01-29	2026-02-02	5	0	PENDING
575	5281	2026-06-13	2026-06-15	3	0	PENDING
575	5282	2026-02-13	2026-02-14	2	0.8	IN_PROGRESS
575	5283	2026-02-08	2026-02-10	3	0	PENDING
575	5284	2026-07-30	2026-08-03	5	0	PENDING
575	5285	2026-08-04	2026-08-04	1	0	PENDING
575	5286	2026-04-22	2026-08-01	\N	\N	PENDING
575	5287	2026-06-03	2026-06-04	2	0	PENDING
575	5288	2026-06-03	2026-06-03	1	0	PENDING
575	5289	2026-04-22	2026-04-23	2	0	PENDING
575	5290	2026-06-03	2026-06-03	1	0	PENDING
575	5291	2026-06-06	2026-06-06	1	0	PENDING
575	5292	2026-06-05	2026-06-05	1	0	PENDING
575	5293	2026-04-25	2026-04-25	1	0	PENDING
575	5294	2026-06-08	2026-06-08	1	0	PENDING
575	5295	2026-06-10	2026-06-10	1	0	PENDING
575	5296	2026-07-30	2026-07-30	1	0	PENDING
575	5297	2026-08-01	2026-08-01	1	0	PENDING
575	5832	\N	\N	\N	\N	PENDING
575	5833	\N	\N	\N	\N	PENDING
575	5834	\N	\N	\N	\N	PENDING
575	5835	\N	\N	\N	\N	PENDING
575	5836	\N	\N	\N	\N	PENDING
575	5837	\N	\N	\N	\N	PENDING
575	5838	\N	\N	\N	\N	PENDING
575	5839	\N	\N	\N	\N	PENDING
575	5840	\N	\N	\N	\N	PENDING
575	5841	\N	\N	\N	0.5	PENDING
575	5842	\N	\N	\N	\N	PENDING
575	5843	\N	\N	\N	\N	PENDING
575	5844	\N	\N	\N	\N	PENDING
575	5845	\N	\N	\N	\N	PENDING
575	5846	\N	\N	\N	\N	PENDING
575	5847	\N	\N	\N	\N	PENDING
575	5848	\N	\N	\N	\N	PENDING
575	5849	\N	\N	\N	\N	PENDING
575	5850	\N	\N	\N	\N	PENDING
575	5851	\N	\N	\N	\N	PENDING
575	5852	\N	\N	\N	\N	PENDING
575	5853	\N	\N	\N	\N	PENDING
575	5854	\N	\N	\N	\N	PENDING
575	5855	\N	\N	\N	\N	PENDING
575	5856	\N	\N	\N	\N	PENDING
575	5857	\N	\N	\N	\N	PENDING
575	5858	\N	\N	\N	\N	PENDING
575	5859	\N	\N	\N	\N	PENDING
575	5860	\N	\N	\N	\N	PENDING
575	5861	\N	\N	\N	\N	PENDING
575	5862	\N	\N	\N	\N	PENDING
575	5863	\N	\N	\N	\N	PENDING
575	5864	\N	\N	\N	\N	PENDING
575	5865	\N	\N	\N	\N	PENDING
575	5866	\N	\N	\N	\N	PENDING
599	4787	2026-05-23	2026-05-25	3	0	PENDING
575	5867	\N	\N	\N	\N	PENDING
575	5868	\N	\N	\N	\N	PENDING
575	5869	\N	\N	\N	\N	PENDING
575	5870	\N	\N	\N	\N	PENDING
575	5871	\N	\N	\N	\N	PENDING
599	4788	2026-06-27	2026-07-11	15	0	PENDING
575	5872	\N	\N	\N	\N	PENDING
575	5873	\N	\N	\N	\N	PENDING
575	5874	\N	\N	\N	\N	PENDING
575	5875	\N	\N	\N	\N	PENDING
575	5876	\N	\N	\N	\N	PENDING
575	5877	\N	\N	\N	\N	PENDING
575	5878	\N	\N	\N	\N	PENDING
575	5879	\N	\N	\N	\N	PENDING
599	4789	2026-07-17	2026-07-17	1	0	PENDING
599	4790	2026-06-11	2026-06-11	\N	0	PENDING
599	4791	2026-06-11	2026-06-30	20	0	PENDING
599	4792	2026-03-29	2026-07-29	\N	0.5	PENDING
599	4793	2026-07-02	2026-07-16	15	0	PENDING
599	4794	2026-07-17	2026-07-17	1	0	PENDING
599	4796	\N	\N	\N	\N	PENDING
599	4797	2026-06-20	2026-06-20	1	0	PENDING
599	4798	2026-06-22	2026-06-24	3	0	PENDING
599	4799	2026-03-29	2026-03-29	1	0	PENDING
599	4800	2026-04-08	2026-04-10	3	0	PENDING
599	4801	2026-06-20	2026-06-21	2	0	PENDING
599	4802	2026-06-23	2026-06-25	3	0	PENDING
599	4803	2026-05-01	2026-05-01	1	0	PENDING
599	4804	2026-05-03	2026-05-05	3	0	PENDING
599	4805	2026-06-22	2026-06-23	2	0	PENDING
599	4806	2026-06-26	2026-06-27	2	0	PENDING
599	4807	2026-03-31	2026-03-31	1	0	PENDING
599	4808	2026-04-12	2026-04-12	1	0	PENDING
599	4809	2026-06-23	2026-06-25	3	0	PENDING
599	4810	2026-06-27	2026-06-28	2	0	PENDING
599	4811	2026-06-23	2026-06-23	1	0	PENDING
599	4812	2026-06-25	2026-06-28	4	0	PENDING
599	4813	2026-06-30	2026-06-30	1	0	PENDING
599	4814	2026-07-02	2026-07-03	2	0	PENDING
599	4815	2026-06-25	2026-06-25	1	0	PENDING
599	4816	2026-06-30	2026-06-30	1	0	PENDING
599	4817	2026-07-19	2026-07-19	1	0	PENDING
599	4818	\N	\N	\N	\N	PENDING
599	4819	2026-06-20	2026-06-20	1	0	PENDING
599	4820	2026-06-20	2026-06-22	3	0	PENDING
599	4821	2026-03-29	2026-03-29	1	0	PENDING
599	4822	2026-03-29	2026-03-30	2	0	PENDING
599	4823	2026-06-20	2026-06-21	2	0	PENDING
599	4824	2026-06-20	2026-06-21	2	0	PENDING
599	4825	2026-05-01	2026-05-02	2	0	PENDING
599	4826	2026-05-01	2026-05-03	3	0	PENDING
599	4827	2026-06-21	2026-06-23	3	0	PENDING
599	4828	2026-06-24	2026-06-24	1	0	PENDING
599	4829	2026-03-30	2026-03-31	2	0	PENDING
599	4830	2026-04-01	2026-04-01	1	0	PENDING
599	4831	2026-04-01	2026-04-02	2	0	PENDING
599	4832	2026-04-22	2026-04-22	1	0	PENDING
599	4833	2026-06-20	2026-06-21	2	0	PENDING
599	4834	2026-06-21	2026-06-22	2	0	PENDING
599	4835	2026-06-21	2026-06-23	3	0	PENDING
599	4836	2026-06-24	2026-06-24	1	0	PENDING
599	4837	2026-06-21	2026-06-22	2	0	PENDING
599	4838	2026-06-26	2026-06-26	1	0	PENDING
599	4839	2026-07-29	2026-07-29	1	0	PENDING
599	4840	\N	\N	\N	\N	PENDING
599	4841	2026-06-20	2026-06-21	2	0	PENDING
599	4842	2026-06-23	2026-06-24	2	0	PENDING
599	4843	2026-03-29	2026-03-30	2	0	PENDING
599	4844	2026-04-01	2026-04-02	2	0	PENDING
599	4845	2026-06-20	2026-06-21	2	0	PENDING
599	4846	2026-06-21	2026-06-22	2	0	PENDING
599	4847	2026-05-01	2026-05-02	2	0	PENDING
599	4848	2026-05-04	2026-05-06	3	0	PENDING
599	4849	2026-06-23	2026-06-23	1	0	PENDING
599	4850	2026-06-26	2026-06-26	1	0	PENDING
599	4851	2026-04-01	2026-04-01	1	0	PENDING
599	4852	2026-04-04	2026-04-04	1	0	PENDING
599	4853	2026-04-01	2026-04-01	1	0	PENDING
599	4854	2026-04-22	2026-04-23	2	0	PENDING
599	4855	2026-06-25	2026-06-25	1	0	PENDING
599	4856	2026-06-28	2026-06-29	2	0	PENDING
599	4857	2026-06-27	2026-06-27	1	0	PENDING
599	4858	2026-06-29	2026-06-29	1	0	PENDING
599	4859	2026-07-15	2026-07-15	1	0	PENDING
599	4860	2026-07-17	2026-07-17	1	0	PENDING
599	4861	2026-07-19	2026-07-19	1	0	PENDING
599	4862	\N	\N	\N	\N	PENDING
599	4863	2026-06-20	2026-06-21	2	0	PENDING
599	4864	2026-06-23	2026-06-27	5	0	PENDING
599	4865	2026-06-29	2026-07-03	5	0	PENDING
599	4866	2026-03-29	2026-03-29	1	0	PENDING
599	4867	2026-03-31	2026-04-04	5	0	PENDING
599	4868	2026-04-06	2026-04-10	5	0	PENDING
599	4869	2026-06-20	2026-06-21	2	0	PENDING
599	4870	2026-06-23	2026-06-27	5	0	PENDING
599	4871	2026-06-29	2026-07-03	5	0	PENDING
599	4872	2026-06-23	2026-06-23	1	0	PENDING
599	4873	2026-06-29	2026-06-29	1	0	PENDING
599	4874	2026-07-05	2026-07-05	1	0	PENDING
599	4875	2026-03-31	2026-03-31	1	0	PENDING
599	4876	2026-04-06	2026-04-06	1	0	PENDING
599	4877	2026-04-12	2026-04-12	1	0	PENDING
599	4878	2026-07-05	2026-07-06	2	0	PENDING
599	4879	2026-07-05	2026-07-06	2	0	PENDING
599	4880	2026-07-08	2026-07-09	2	0	PENDING
599	4881	2026-07-05	2026-07-06	2	0	PENDING
599	4882	2026-07-07	2026-07-09	3	0	PENDING
599	4883	2026-07-10	2026-07-12	3	0	PENDING
599	4884	2026-07-05	2026-07-05	1	0	PENDING
599	4885	2026-07-07	2026-07-07	1	0	PENDING
599	4886	2026-07-09	2026-07-09	1	0	PENDING
599	4887	2026-07-14	2026-07-14	1	0	PENDING
599	4888	2026-03-12	2026-10-11	\N	\N	PENDING
599	4889	2026-03-12	2026-10-11	\N	\N	PENDING
599	4890	2026-06-16	2026-07-05	20	\N	PENDING
599	4891	2026-03-12	2026-03-16	5	0.05	IN_PROGRESS
599	4892	2026-06-23	2026-07-02	10	\N	PENDING
599	4893	2026-03-17	2026-03-26	10	\N	PENDING
599	4894	2026-09-16	2026-10-10	25	\N	PENDING
599	4895	2026-10-02	2026-10-11	10	\N	PENDING
599	4896	2026-05-29	2026-08-13	\N	\N	PENDING
599	4897	2026-05-29	2026-05-30	2	\N	PENDING
599	4898	2026-05-29	2026-05-29	1	\N	PENDING
599	4899	2026-06-17	2026-06-18	2	\N	PENDING
599	4900	2026-06-01	2026-06-02	2	\N	PENDING
599	4901	2026-06-01	2026-06-01	1	\N	PENDING
599	4902	2026-05-31	2026-05-31	1	\N	PENDING
599	4903	2026-06-20	2026-06-20	1	\N	PENDING
599	4904	2026-06-01	2026-06-01	1	\N	PENDING
599	4905	2026-06-02	2026-06-02	1	\N	PENDING
599	4906	2026-08-12	2026-08-12	1	\N	PENDING
599	4907	2026-08-13	2026-08-13	1	\N	PENDING
599	4908	2026-04-06	2026-10-13	\N	\N	PENDING
599	4909	2026-04-06	2026-10-13	\N	\N	PENDING
599	4910	2026-06-23	2026-07-12	20	0	PENDING
599	4911	2026-04-06	2026-04-10	5	0	PENDING
599	4912	2026-07-05	2026-07-14	10	0	PENDING
599	4913	2026-04-11	2026-04-20	10	0	PENDING
599	4914	2026-09-29	2026-10-13	15	0	PENDING
599	4915	2026-10-04	2026-10-13	10	0	PENDING
599	4916	2026-05-29	2026-08-13	\N	\N	PENDING
599	4917	2026-05-29	2026-05-30	2	0	PENDING
599	4918	2026-05-29	2026-05-29	1	0	PENDING
599	4919	2026-06-17	2026-06-20	4	0	PENDING
599	4920	2026-06-01	2026-06-02	2	0	PENDING
599	4921	2026-06-01	2026-06-01	1	0	PENDING
599	4922	2026-05-31	2026-05-31	1	0	PENDING
599	4923	2026-06-22	2026-06-22	1	0	PENDING
599	4924	2026-06-01	2026-06-01	1	0	PENDING
599	4925	2026-06-02	2026-06-02	1	0	PENDING
599	4926	2026-08-12	2026-08-12	1	0	PENDING
599	4927	2026-08-13	2026-08-13	1	0	PENDING
599	4928	2026-05-12	2026-09-26	\N	\N	PENDING
599	4929	2026-05-12	2026-09-26	\N	\N	PENDING
599	4930	2026-06-23	2026-07-02	10	0	PENDING
599	4931	2026-05-12	2026-05-16	5	0	PENDING
599	4932	2026-07-03	2026-07-05	3	0	PENDING
599	4933	2026-05-18	2026-05-20	3	0	PENDING
599	4934	2026-09-20	2026-09-26	7	0	PENDING
599	4935	2026-09-24	2026-09-26	3	0	PENDING
599	4936	2026-05-22	2026-09-23	\N	\N	PENDING
599	4937	2026-06-23	2026-06-24	2	0	PENDING
599	4938	2026-06-23	2026-06-23	1	0	PENDING
599	4939	2026-05-22	2026-05-24	3	0	PENDING
599	4940	2026-06-23	2026-06-24	2	0	PENDING
599	4941	2026-06-26	2026-06-26	1	0	PENDING
599	4942	2026-06-25	2026-06-25	1	0	PENDING
599	4943	2026-07-18	2026-07-18	1	0	PENDING
599	4944	2026-07-18	2026-07-18	1	0	PENDING
599	4945	2026-07-19	2026-07-19	1	0	PENDING
599	4946	2026-09-21	2026-09-21	1	0	PENDING
599	4947	2026-09-23	2026-09-23	1	0	PENDING
599	4948	2026-05-12	2026-09-26	\N	\N	PENDING
599	4949	2026-06-23	2026-07-02	10	0	PENDING
599	4950	2026-05-12	2026-05-16	5	0	PENDING
599	4951	2026-07-03	2026-07-05	3	0	PENDING
599	4952	2026-05-18	2026-05-20	3	0	PENDING
599	4953	2026-09-20	2026-09-26	7	0	PENDING
599	4954	2026-09-24	2026-09-26	3	0	PENDING
599	4955	2026-06-02	2026-10-04	\N	\N	PENDING
599	4956	2026-07-04	2026-07-05	2	0	PENDING
599	4957	2026-07-04	2026-07-04	1	0	PENDING
599	4958	2026-06-02	2026-06-04	3	0	PENDING
599	4959	2026-07-04	2026-07-05	2	0	PENDING
599	4960	2026-07-07	2026-07-07	1	0	PENDING
599	4961	2026-07-06	2026-07-06	1	0	PENDING
599	4962	2026-07-29	2026-07-29	1	0	PENDING
599	4963	2026-07-29	2026-07-29	1	0	PENDING
599	4964	2026-07-29	2026-07-29	1	0	PENDING
599	4965	2026-10-02	2026-10-02	1	0	PENDING
599	4966	2026-10-04	2026-10-04	1	0	PENDING
599	4967	2026-02-14	2026-10-12	\N	\N	PENDING
599	4968	2026-02-14	2026-10-12	\N	\N	PENDING
599	4969	2026-06-02	2026-06-11	10	0	PENDING
599	4970	2026-02-14	2026-02-18	5	0	PENDING
599	4971	2026-06-12	2026-06-14	3	0	PENDING
599	4972	2026-06-15	2026-06-17	3	0	PENDING
599	4973	2026-09-28	2026-10-12	15	0	PENDING
599	4974	2026-10-10	2026-10-12	3	0	PENDING
599	4975	2026-05-07	2026-08-14	\N	\N	PENDING
599	4976	\N	\N	\N	\N	PENDING
599	4977	2026-06-12	2026-06-13	2	0	PENDING
599	4978	2026-06-12	2026-06-12	1	0	PENDING
599	4979	2026-05-07	2026-05-08	2	0	PENDING
599	4980	2026-06-12	2026-06-13	2	0	PENDING
599	4981	2026-06-15	2026-06-15	1	0	PENDING
599	4982	2026-06-14	2026-06-14	1	0	PENDING
599	4983	2026-05-10	2026-05-10	1	0	PENDING
599	4984	2026-06-15	2026-06-15	1	0	PENDING
599	4985	2026-06-17	2026-06-17	1	0	PENDING
599	4986	2026-08-12	2026-08-12	1	0	PENDING
599	4987	2026-08-14	2026-08-14	1	0	PENDING
599	4988	\N	\N	\N	\N	PENDING
599	4989	2026-06-12	2026-06-13	2	0	PENDING
599	4990	2026-06-12	2026-06-12	1	0	PENDING
599	4991	2026-05-07	2026-05-08	2	0	PENDING
599	4992	2026-06-12	2026-06-13	2	0	PENDING
599	4993	2026-06-15	2026-06-15	1	0	PENDING
599	4994	2026-06-14	2026-06-14	1	0	PENDING
599	4995	2026-05-10	2026-05-10	1	0	PENDING
599	4996	2026-06-15	2026-06-15	1	0	PENDING
599	4997	2026-06-17	2026-06-17	1	0	PENDING
599	4998	2026-08-12	2026-08-12	1	0	PENDING
599	4999	2026-08-14	2026-08-14	1	0	PENDING
599	5000	2026-04-20	2026-10-17	\N	\N	PENDING
599	5001	2026-04-20	2026-10-17	\N	\N	PENDING
599	5002	2026-07-01	2026-07-15	15	0	PENDING
599	5003	2026-04-20	2026-04-24	5	0	PENDING
599	5004	2026-09-25	2026-09-27	3	0	PENDING
599	5005	2026-09-25	2026-09-27	3	0	PENDING
599	5006	2026-09-22	2026-10-01	10	0	PENDING
599	5007	2026-09-30	2026-10-02	3	0	PENDING
599	5008	2026-05-15	2026-05-15	\N	\N	PENDING
599	5009	2026-07-26	2026-07-26	1	0	PENDING
599	5010	2026-07-19	2026-07-19	1	0	PENDING
599	5011	2026-07-16	2026-07-17	2	0	PENDING
599	5012	2026-07-26	2026-07-26	1	0	PENDING
599	5013	2026-07-28	2026-07-28	1	0	PENDING
599	5014	2026-07-21	2026-07-21	1	0	PENDING
599	5015	2026-07-16	2026-09-16	\N	\N	PENDING
599	5022	2026-07-30	2026-07-30	1	0	PENDING
599	5023	2026-07-30	2026-07-30	1	0	PENDING
599	5024	2026-07-31	2026-07-31	1	0	PENDING
599	5025	2026-09-14	2026-09-14	1	0	PENDING
599	5026	2026-09-16	2026-09-16	1	0	PENDING
599	5027	2026-05-09	2026-10-17	\N	\N	PENDING
599	5028	2026-05-09	2026-10-08	\N	\N	PENDING
599	5029	2026-07-04	2026-07-13	10	0	PENDING
599	5030	2026-05-09	2026-05-13	5	0	PENDING
599	5031	2026-07-14	2026-07-16	3	0	PENDING
599	5032	2026-05-14	2026-05-16	3	0	PENDING
599	5033	2026-10-02	2026-10-08	7	0	PENDING
599	5034	2026-10-06	2026-10-08	3	0	PENDING
599	5035	2026-07-06	2026-10-17	\N	\N	PENDING
599	5036	2026-08-06	2026-08-07	2	0	PENDING
599	5037	2026-08-06	2026-08-06	1	0	PENDING
599	5038	2026-07-06	2026-07-08	3	0	PENDING
599	5039	2026-08-06	2026-08-07	2	0	PENDING
599	5040	2026-08-09	2026-08-09	1	0	PENDING
599	5041	2026-08-08	2026-08-08	1	0	PENDING
599	5042	2026-08-31	2026-08-31	1	0	PENDING
599	5043	2026-08-31	2026-08-31	1	0	PENDING
599	5044	2026-08-31	2026-08-31	1	0	PENDING
599	5045	2026-10-15	2026-10-15	1	0	PENDING
599	5046	2026-10-17	2026-10-17	1	0	PENDING
599	5047	2026-05-12	2026-09-17	\N	\N	PENDING
599	5048	2026-05-12	2026-09-17	\N	\N	PENDING
599	5049	2026-05-12	2026-05-31	20	0	PENDING
599	5050	2026-05-31	2026-06-04	5	0	PENDING
599	5051	2026-06-01	2026-06-07	7	0	PENDING
599	5052	2026-06-05	2026-06-11	7	0	PENDING
599	5053	2026-08-29	2026-09-17	20	0	PENDING
599	5054	2026-09-11	2026-09-17	7	0	PENDING
599	5055	2026-06-01	2026-08-22	\N	\N	PENDING
599	5056	2026-06-06	2026-06-07	2	0	PENDING
599	5057	2026-06-09	2026-06-09	1	0	PENDING
599	5058	2026-06-01	2026-06-05	5	0	PENDING
599	5059	2026-06-06	2026-06-06	1	0	PENDING
599	5060	2026-06-09	2026-06-09	1	0	PENDING
599	5061	2026-06-11	2026-06-11	1	0	PENDING
599	5062	2026-06-07	2026-06-07	1	0	PENDING
599	5063	2026-06-07	2026-06-07	1	0	PENDING
599	5064	2026-06-07	2026-06-07	1	0	PENDING
599	5065	2026-08-20	2026-08-20	1	0	PENDING
599	5066	2026-08-22	2026-08-22	1	0	PENDING
599	5067	2026-03-26	2026-09-02	\N	\N	PENDING
599	5068	2026-03-26	2026-09-02	\N	\N	PENDING
599	5069	2026-06-08	2026-07-02	25	0	PENDING
599	5070	2026-03-26	2026-03-30	5	0	PENDING
599	5071	2026-07-03	2026-07-05	3	0	PENDING
599	5072	2026-03-31	2026-04-02	3	0	PENDING
599	5073	2026-08-27	2026-09-02	7	0	PENDING
599	5074	2026-08-31	2026-09-02	3	0	PENDING
599	5075	2026-06-01	2026-08-22	\N	\N	PENDING
599	5076	2026-06-06	2026-06-07	2	0	PENDING
599	5077	2026-06-09	2026-06-09	1	0	PENDING
599	5078	2026-06-01	2026-06-03	3	0	PENDING
599	5079	2026-06-06	2026-06-07	2	0	PENDING
599	5080	2026-06-09	2026-06-09	1	0	PENDING
599	5081	2026-06-11	2026-06-11	1	0	PENDING
599	5082	2026-06-05	2026-06-05	1	0	PENDING
599	5083	2026-06-05	2026-06-05	1	0	PENDING
599	5084	2026-06-05	2026-06-05	1	0	PENDING
599	5085	2026-08-20	2026-08-20	1	0	PENDING
599	5086	2026-08-22	2026-08-22	1	0	PENDING
599	5087	2026-02-07	2026-11-02	\N	\N	PENDING
599	5088	2026-02-07	2026-11-02	\N	\N	PENDING
599	5089	2026-02-07	2026-04-17	70	0	PENDING
599	5090	2026-02-16	2026-06-05	110	0	PENDING
599	5091	2026-05-28	2026-07-11	45	0	PENDING
599	5092	2026-03-23	2026-06-10	80	0	PENDING
599	5093	2026-07-02	2026-10-09	100	0	PENDING
599	5094	2026-02-07	2026-02-07	\N	0	PENDING
599	5095	2026-02-07	2026-04-02	55	0	PENDING
599	5096	2026-02-14	2026-04-04	50	0	PENDING
599	5097	2026-05-28	2026-07-31	65	0	PENDING
599	5098	2026-03-23	2026-04-06	15	0	PENDING
599	5099	2026-08-01	2026-09-29	60	0	PENDING
599	5100	2026-02-21	2026-02-21	\N	0	PENDING
599	5101	2026-02-21	2026-04-21	60	0	PENDING
599	5102	2026-03-03	2026-07-25	145	0	PENDING
599	5103	2026-07-03	2026-09-10	70	0	PENDING
599	5104	2026-07-14	2026-09-16	65	0	PENDING
599	5105	2026-08-10	2026-10-08	60	0	PENDING
599	5106	2026-02-11	2026-02-11	\N	0	PENDING
599	5107	2026-02-11	2026-03-17	35	0	PENDING
599	5108	2026-03-08	2026-06-05	90	0	PENDING
599	5109	2026-04-13	2026-06-11	60	0	PENDING
599	5110	2026-04-10	2026-06-13	65	0	PENDING
599	5111	2026-06-15	2026-08-03	50	0	PENDING
599	5112	2026-02-07	2026-02-07	\N	0	PENDING
599	5113	2026-02-07	2026-03-23	45	0.2	IN_PROGRESS
599	5114	2026-03-04	2026-06-26	115	0.2	IN_PROGRESS
599	5115	2026-06-17	2026-09-04	80	0	PENDING
599	5116	2026-06-28	2026-09-05	70	0	PENDING
599	5117	2026-02-07	2026-03-23	45	0	PENDING
599	5118	2026-03-04	2026-06-26	115	0	PENDING
599	5119	2026-06-17	2026-09-04	80	0	PENDING
599	5120	2026-06-28	2026-09-05	70	0	PENDING
599	5121	2026-08-28	2026-11-02	67	0	PENDING
599	5122	2026-02-17	2026-02-21	5	0.7058824	IN_PROGRESS
599	5123	2026-02-19	2026-02-26	8	0.1	IN_PROGRESS
599	5124	2026-02-19	2026-02-26	8	0	PENDING
599	5125	2026-02-24	2026-03-03	8	0	PENDING
599	5126	2026-02-22	2026-02-22	\N	0	PENDING
599	5127	2026-02-07	2026-03-23	45	0.6	IN_PROGRESS
599	5128	2026-03-04	2026-06-26	115	0.6	IN_PROGRESS
599	5129	2026-06-17	2026-09-04	80	0	PENDING
599	5130	2026-06-28	2026-09-05	70	0	PENDING
599	5131	2026-02-07	2026-03-23	45	0.5	IN_PROGRESS
599	5132	2026-03-04	2026-06-26	115	0.5	IN_PROGRESS
599	5133	2026-06-17	2026-09-04	80	0	PENDING
599	5134	2026-06-28	2026-09-05	70	0	PENDING
599	5135	2026-08-28	2026-11-02	67	0	PENDING
599	5136	2026-02-22	2026-02-22	\N	0	PENDING
599	5137	2026-02-22	2026-03-23	30	0	PENDING
599	5138	2026-03-19	2026-05-17	60	0	PENDING
599	5139	2026-05-23	2026-07-16	55	0	PENDING
599	5140	2026-06-02	2026-07-18	47	0	PENDING
599	5141	2026-06-22	2026-07-27	36	0	PENDING
599	5142	2026-02-07	2026-02-07	\N	0	PENDING
599	5143	2026-02-12	2026-03-18	35	0	PENDING
599	5144	2026-03-09	2026-06-01	85	0	PENDING
599	5145	2026-05-23	2026-07-26	65	0	PENDING
599	5146	2026-05-28	2026-07-26	60	0	PENDING
599	5147	2026-07-09	2026-09-11	65	0	PENDING
599	5148	2026-02-12	2026-02-12	\N	0	PENDING
599	5154	2026-06-01	2026-06-01	\N	0	PENDING
599	5155	2026-06-11	2026-06-12	2	0	PENDING
599	5156	2026-06-09	2026-06-09	1	0	PENDING
599	5157	2026-06-01	2026-06-05	5	0	PENDING
599	5158	2026-06-06	2026-06-06	1	0	PENDING
599	5159	2026-06-09	2026-06-09	1	0	PENDING
599	5160	2026-06-11	2026-06-11	1	0	PENDING
599	5161	2026-06-07	2026-06-07	1	0	PENDING
599	5162	2026-06-07	2026-06-07	1	0	PENDING
599	5163	2026-06-07	2026-06-07	1	0	PENDING
599	5164	2026-08-20	2026-08-20	1	0	PENDING
599	5165	2026-08-22	2026-08-22	1	0	PENDING
599	5166	2026-06-01	2026-10-21	\N	\N	PENDING
599	5167	2026-06-01	2026-10-21	\N	\N	PENDING
599	5168	2026-08-06	2026-08-15	10	0	PENDING
599	5169	2026-06-01	2026-06-05	5	0	PENDING
599	5170	2026-08-16	2026-08-18	3	0	PENDING
599	5171	2026-06-06	2026-06-08	3	0	PENDING
599	5172	2026-10-15	2026-10-21	7	0	PENDING
599	5173	2026-10-19	2026-10-21	3	0	PENDING
599	5174	2026-07-06	2026-10-17	\N	\N	PENDING
599	5175	2026-08-06	2026-08-07	2	0	PENDING
599	5176	2026-08-06	2026-08-06	1	0	PENDING
599	5177	2026-07-06	2026-07-08	3	0	PENDING
599	5178	2026-08-06	2026-08-07	2	0	PENDING
599	5179	2026-08-09	2026-08-09	1	0	PENDING
599	5180	2026-08-08	2026-08-08	1	0	PENDING
599	5181	2026-08-31	2026-08-31	1	0	PENDING
599	5182	2026-08-31	2026-08-31	1	0	PENDING
599	5183	2026-08-31	2026-08-31	1	0	PENDING
599	5184	2026-10-15	2026-10-15	1	0	PENDING
599	5185	2026-10-17	2026-10-17	1	0	PENDING
599	5186	2026-04-18	2026-11-02	\N	\N	PENDING
599	5187	2026-04-18	2026-10-24	\N	\N	PENDING
599	5188	2026-08-23	2026-09-01	10	0	PENDING
599	5189	2026-04-18	2026-04-22	5	0	PENDING
599	5190	2026-09-02	2026-09-04	3	0	PENDING
599	5191	2026-04-23	2026-04-25	3	0	PENDING
599	5192	2026-10-17	2026-10-23	7	0	PENDING
599	5193	2026-10-24	2026-10-24	1	0	PENDING
599	5194	2026-07-12	2026-11-02	\N	\N	PENDING
599	5195	2026-08-23	2026-08-31	9	0	PENDING
599	5196	2026-09-02	2026-09-07	6	0	PENDING
599	5197	2026-08-23	2026-08-30	8	0	PENDING
599	5198	2026-09-01	2026-09-05	5	0	PENDING
599	5199	2026-07-12	2026-07-23	12	0	PENDING
599	5200	2026-07-25	2026-07-31	7	0	PENDING
599	5201	2026-08-23	2026-08-25	3	0	PENDING
599	5202	2026-09-02	2026-09-04	3	0	PENDING
599	5203	2026-09-02	2026-09-02	1	0	PENDING
599	5204	2026-09-09	2026-09-09	1	0	PENDING
599	5205	2026-09-01	2026-09-01	1	0	PENDING
599	5206	2026-09-07	2026-09-07	1	0	PENDING
599	5207	2026-08-23	2026-08-24	2	0	PENDING
599	5208	2026-08-26	2026-08-27	2	0	PENDING
599	5209	2026-08-29	2026-08-30	2	0	PENDING
599	5210	2026-08-23	2026-08-29	7	0	PENDING
599	5211	2026-08-31	2026-09-03	4	0	PENDING
599	5212	2026-08-23	2026-08-24	2	0	PENDING
599	5213	2026-08-31	2026-08-31	1	0	PENDING
599	5214	2026-10-27	2026-10-28	2	0	PENDING
599	5215	2026-10-30	2026-10-31	2	0	PENDING
599	5216	2026-11-02	2026-11-02	1	0	PENDING
599	5217	2026-06-18	2026-10-21	\N	\N	PENDING
599	5218	2026-06-18	2026-10-21	\N	\N	PENDING
599	5219	2026-08-09	2026-08-18	10	0	PENDING
599	5220	2026-06-18	2026-06-22	5	0	PENDING
599	5221	2026-08-19	2026-08-21	3	0	PENDING
599	5222	2026-06-23	2026-06-25	3	0	PENDING
599	5223	2026-10-15	2026-10-21	7	0	PENDING
599	5224	2026-10-19	2026-10-21	3	0	PENDING
599	5225	2026-07-15	2026-10-06	\N	\N	PENDING
599	5226	2026-08-09	2026-08-10	2	0	PENDING
599	5227	2026-08-12	2026-08-12	1	0	PENDING
599	5228	2026-08-09	2026-08-10	2	0	PENDING
599	5229	2026-08-12	2026-08-12	1	0	PENDING
599	5230	2026-07-15	2026-07-17	3	0	PENDING
599	5231	2026-07-19	2026-07-19	1	0	PENDING
599	5232	2026-08-09	2026-08-10	2	0	PENDING
599	5233	2026-08-12	2026-08-12	1	0	PENDING
599	5234	2026-08-12	2026-08-12	1	0	PENDING
599	5235	2026-08-14	2026-08-14	1	0	PENDING
599	5236	2026-08-12	2026-08-12	1	0	PENDING
599	5237	2026-08-14	2026-08-14	1	0	PENDING
599	5238	2026-08-23	2026-08-23	1	0	PENDING
599	5239	2026-08-25	2026-08-25	1	0	PENDING
599	5240	2026-08-22	2026-08-22	1	0	PENDING
599	5241	2026-08-24	2026-08-24	1	0	PENDING
599	5242	2026-08-26	2026-08-26	1	0	PENDING
599	5243	2026-08-26	2026-08-26	1	0	PENDING
599	5244	2026-10-04	2026-10-04	1	0	PENDING
599	5245	2026-10-04	2026-10-04	1	0	PENDING
599	5246	2026-10-06	2026-10-06	1	0	PENDING
599	5247	2026-06-18	2026-10-21	\N	\N	PENDING
599	5248	2026-06-18	2026-10-21	\N	\N	PENDING
599	5249	2026-08-09	2026-08-18	10	0	PENDING
599	5250	2026-06-18	2026-06-22	5	0	PENDING
599	5251	2026-08-19	2026-08-21	3	0	PENDING
599	5252	2026-06-23	2026-06-25	3	0	PENDING
599	5253	2026-10-15	2026-10-21	7	0	PENDING
599	5254	2026-10-19	2026-10-21	3	0	PENDING
599	5255	2026-07-15	2026-10-06	\N	\N	PENDING
599	5256	2026-08-09	2026-08-10	2	0	PENDING
599	5257	2026-08-12	2026-08-12	1	0	PENDING
599	5258	2026-08-09	2026-08-10	2	0	PENDING
599	5259	2026-08-12	2026-08-12	1	0	PENDING
599	5260	2026-07-15	2026-07-17	3	0	PENDING
599	5261	2026-07-19	2026-07-19	1	0	PENDING
599	5262	2026-08-09	2026-08-10	2	0	PENDING
599	5263	2026-08-12	2026-08-12	1	0	PENDING
599	5264	2026-08-12	2026-08-12	1	0	PENDING
599	5265	2026-08-14	2026-08-14	1	0	PENDING
599	5266	2026-08-12	2026-08-12	1	0	PENDING
599	5267	2026-08-14	2026-08-14	1	0	PENDING
599	5268	2026-08-23	2026-08-23	1	0	PENDING
599	5269	2026-08-25	2026-08-25	1	0	PENDING
599	5270	2026-08-22	2026-08-22	1	0	PENDING
599	5271	2026-08-24	2026-08-24	1	0	PENDING
599	5272	2026-08-26	2026-08-26	1	0	PENDING
599	5273	2026-08-26	2026-08-26	1	0	PENDING
599	5274	2026-10-04	2026-10-04	1	0	PENDING
599	5275	2026-10-04	2026-10-04	1	0	PENDING
599	5276	2026-10-06	2026-10-06	1	0	PENDING
599	5277	2026-01-29	2026-08-04	\N	\N	PENDING
599	5278	2026-01-29	2026-08-04	\N	\N	PENDING
599	5279	2026-06-03	2026-06-12	10	0	PENDING
599	5280	2026-01-29	2026-02-02	5	0	PENDING
599	5281	2026-06-13	2026-06-15	3	0	PENDING
599	5282	2026-02-13	2026-02-14	2	0.8	IN_PROGRESS
599	5283	2026-02-08	2026-02-10	3	0	PENDING
599	5284	2026-07-30	2026-08-03	5	0	PENDING
599	5285	2026-08-04	2026-08-04	1	0	PENDING
599	5286	2026-04-22	2026-08-01	\N	\N	PENDING
599	5287	2026-06-03	2026-06-04	2	0	PENDING
599	5288	2026-06-03	2026-06-03	1	0	PENDING
599	5289	2026-04-22	2026-04-23	2	0	PENDING
599	5290	2026-06-03	2026-06-03	1	0	PENDING
599	5291	2026-06-06	2026-06-06	1	0	PENDING
599	5292	2026-06-05	2026-06-05	1	0	PENDING
599	5293	2026-04-25	2026-04-25	1	0	PENDING
599	5294	2026-06-08	2026-06-08	1	0	PENDING
599	5295	2026-06-10	2026-06-10	1	0	PENDING
599	5296	2026-07-30	2026-07-30	1	0	PENDING
599	5297	2026-08-01	2026-08-01	1	0	PENDING
599	5832	\N	\N	\N	\N	PENDING
599	5833	\N	\N	\N	\N	PENDING
599	5834	\N	\N	\N	\N	PENDING
599	5835	\N	\N	\N	\N	PENDING
599	5836	\N	\N	\N	\N	PENDING
599	5837	\N	\N	\N	\N	PENDING
599	5838	\N	\N	\N	\N	PENDING
599	5839	\N	\N	\N	\N	PENDING
599	5840	\N	\N	\N	\N	PENDING
599	5841	\N	\N	\N	0.5	PENDING
599	5842	\N	\N	\N	\N	PENDING
599	5843	\N	\N	\N	\N	PENDING
599	5844	\N	\N	\N	\N	PENDING
599	5845	\N	\N	\N	\N	PENDING
599	5846	\N	\N	\N	\N	PENDING
599	5847	\N	\N	\N	\N	PENDING
599	5848	\N	\N	\N	\N	PENDING
599	5849	\N	\N	\N	\N	PENDING
599	5850	\N	\N	\N	\N	PENDING
599	5851	\N	\N	\N	\N	PENDING
599	5852	\N	\N	\N	\N	PENDING
599	5853	\N	\N	\N	\N	PENDING
599	5854	\N	\N	\N	\N	PENDING
599	5855	\N	\N	\N	\N	PENDING
599	5856	\N	\N	\N	\N	PENDING
599	5857	\N	\N	\N	\N	PENDING
599	5858	\N	\N	\N	\N	PENDING
599	5859	\N	\N	\N	\N	PENDING
599	5860	\N	\N	\N	\N	PENDING
599	5861	\N	\N	\N	\N	PENDING
599	5862	\N	\N	\N	\N	PENDING
599	5863	\N	\N	\N	\N	PENDING
599	5864	\N	\N	\N	\N	PENDING
599	5865	\N	\N	\N	\N	PENDING
599	5866	\N	\N	\N	\N	PENDING
599	5867	\N	\N	\N	\N	PENDING
599	5868	\N	\N	\N	\N	PENDING
599	5869	\N	\N	\N	\N	PENDING
599	5870	\N	\N	\N	\N	PENDING
599	5871	\N	\N	\N	\N	PENDING
599	5872	\N	\N	\N	\N	PENDING
599	5873	\N	\N	\N	\N	PENDING
599	5874	\N	\N	\N	\N	PENDING
599	5875	\N	\N	\N	\N	PENDING
599	5876	\N	\N	\N	\N	PENDING
599	5877	\N	\N	\N	\N	PENDING
599	5878	\N	\N	\N	\N	PENDING
599	5879	\N	\N	\N	\N	PENDING
607	3319	2026-03-31	2026-03-31	1	0.5	DONE
607	3320	2026-04-06	2026-04-06	1	1	DONE
607	3321	2026-04-12	2026-04-12	1	1	DONE
607	3322	2026-06-20	2026-06-21	2	1	DONE
607	3323	2026-06-23	2026-06-27	5	1	DONE
607	3324	2026-06-29	2026-07-03	5	1	DONE
607	3325	2026-03-29	2026-03-29	1	1	DONE
607	3326	2026-03-31	2026-04-04	5	1	DONE
607	3327	2026-07-10	2026-07-12	3	1	DONE
607	3329	2026-07-07	2026-07-07	1	1	DONE
607	3335	2026-05-08	2026-05-27	\N	1	DONE
607	3340	2026-05-23	2026-05-23	\N	1	DONE
607	3345	2026-06-11	2026-06-11	\N	1	DONE
607	3351	\N	\N	\N	1	DONE
607	3357	2026-04-06	2026-04-10	5	1	DONE
607	3358	2026-06-20	2026-06-21	2	1	DONE
607	3359	2026-06-23	2026-06-27	5	1	DONE
607	3360	2026-06-29	2026-07-03	5	1	DONE
607	3361	2026-06-23	2026-06-23	1	1	DONE
607	3362	2026-06-29	2026-06-29	1	1	DONE
607	3363	2026-07-05	2026-07-05	1	1	DONE
607	3367	2026-07-05	2026-07-06	2	1	DONE
607	3368	2026-07-05	2026-07-06	2	1	DONE
607	3369	2026-07-08	2026-07-09	2	1	DONE
607	3370	2026-07-05	2026-07-06	2	1	DONE
607	3371	2026-07-07	2026-07-09	3	1	DONE
607	3373	2026-03-29	2026-03-29	\N	1	DONE
607	3395	2026-03-29	2026-03-30	\N	1	DONE
607	3417	2026-03-29	2026-03-29	\N	1	DONE
607	3439	2026-07-05	2026-07-05	1	1	DONE
607	3441	2026-07-09	2026-07-09	1	1	DONE
607	3442	2026-07-14	2026-07-14	1	1	DONE
607	3443	2026-03-12	2026-10-11	213	\N	DONE
607	3444	2026-05-19	2026-05-21	3	1	DONE
607	3445	2026-03-12	2026-10-11	\N	\N	DONE
607	3446	2026-05-29	2026-05-30	2	1	DONE
607	3447	2026-05-29	2026-05-29	1	1	DONE
607	3448	2026-06-17	2026-06-18	2	1	DONE
607	3449	2026-06-01	2026-06-02	2	1	DONE
607	3450	2026-06-01	2026-06-01	1	1	DONE
607	3451	2026-05-31	2026-05-31	1	1	DONE
607	3452	2026-05-29	2026-08-13	\N	\N	DONE
607	3459	2026-06-20	2026-06-20	1	1	DONE
607	3460	2026-06-01	2026-06-01	1	1	DONE
607	3461	2026-06-02	2026-06-02	1	1	DONE
607	3462	2026-08-12	2026-08-12	1	1	DONE
607	3463	2026-08-13	2026-08-13	1	0.35	DONE
607	3464	2026-04-06	2026-10-13	190	\N	DONE
607	3465	2026-05-19	2026-05-21	3	1	DONE
607	3466	2026-04-06	2026-10-13	\N	\N	DONE
607	3467	2026-05-29	2026-05-30	2	1	DONE
607	3468	2026-05-29	2026-05-29	1	1	DONE
607	3469	2026-06-17	2026-06-20	4	1	DONE
607	3470	2026-06-01	2026-06-02	2	1	DONE
607	3471	2026-06-01	2026-06-01	1	1	DONE
607	3472	2026-05-31	2026-05-31	1	1	DONE
607	3473	2026-05-29	2026-08-13	\N	\N	DONE
607	3480	2026-06-22	2026-06-22	1	1	DONE
607	3481	2026-06-01	2026-06-01	1	1	DONE
607	3482	2026-06-02	2026-06-02	1	0.95	DONE
607	3483	2026-08-12	2026-08-12	1	1	DONE
607	3484	2026-08-13	2026-08-13	1	0.4	DONE
607	3485	2026-05-12	2026-09-26	137	\N	DONE
607	3486	2026-05-19	2026-05-21	3	1	DONE
607	3487	2026-05-12	2026-09-26	\N	\N	DONE
607	3488	2026-06-23	2026-06-24	2	0.15	DONE
607	3489	2026-06-23	2026-06-23	1	0.15	DONE
607	3490	2026-05-22	2026-05-24	3	0.15	DONE
607	3491	2026-06-23	2026-06-24	2	0.15	DONE
607	3492	2026-06-26	2026-06-26	1	0.15	DONE
607	3493	2026-06-25	2026-06-25	1	0.15	DONE
607	3494	2026-05-22	2026-09-23	\N	\N	DONE
607	3501	2026-07-18	2026-07-18	1	0.15	DONE
607	3502	2026-07-18	2026-07-18	1	0.15	DONE
607	3503	2026-07-19	2026-07-19	1	0.15	DONE
607	3504	2026-09-21	2026-09-21	1	0.15	DONE
607	3505	2026-09-23	2026-09-23	1	0	DONE
607	3506	2026-05-12	2026-12-29	231	\N	DONE
607	3507	2026-05-19	2026-05-21	3	1	DONE
607	3508	2026-05-12	2026-09-26	\N	\N	DONE
607	3509	2026-07-04	2026-07-05	2	0.1	DONE
607	3510	2026-07-04	2026-07-04	1	0.1	DONE
607	3511	2026-06-02	2026-06-04	3	0.1	DONE
607	3512	2026-07-04	2026-07-05	2	0.1	DONE
607	3513	2026-10-04	2026-10-04	1	0	DONE
607	3514	2026-12-29	2026-12-29	1	0	DONE
607	3515	2026-06-02	2026-12-29	\N	\N	DONE
607	3522	2026-02-14	2026-10-12	240	\N	DONE
607	3523	2026-05-19	2026-05-21	3	1	DONE
607	3524	2026-02-14	2026-10-12	\N	\N	DONE
607	3525	2026-06-12	2026-06-13	2	0.9	DONE
607	3526	2026-06-12	2026-06-12	1	0.9	DONE
607	3527	2026-05-07	2026-05-08	2	0.9	DONE
607	3528	2026-06-12	2026-06-13	2	0.9	DONE
607	3529	2026-06-15	2026-06-15	1	0.9	DONE
607	3530	2026-06-14	2026-06-14	1	0.9	DONE
607	3531	2026-05-07	2026-08-14	\N	\N	DONE
607	3532	\N	\N	\N	\N	PENDING
607	3539	2026-05-10	2026-05-10	1	0.9	DONE
607	3540	2026-06-15	2026-06-15	1	0.9	DONE
607	3541	2026-06-17	2026-06-17	1	0	DONE
607	3542	2026-08-12	2026-08-12	1	0.9	DONE
607	3543	2026-08-14	2026-08-14	1	0	DONE
607	3544	\N	\N	\N	\N	PENDING
607	3556	2026-04-20	2026-10-02	165	\N	DONE
607	3557	2026-05-19	2026-05-21	3	1	DONE
607	3558	2026-04-20	2026-10-02	\N	\N	DONE
607	3559	2026-07-26	2026-07-26	1	1	DONE
607	3560	2026-07-19	2026-07-19	1	1	DONE
607	3561	2026-07-16	2026-07-17	2	1	DONE
607	3562	2026-07-26	2026-07-26	1	1	DONE
607	3563	2026-07-28	2026-07-28	1	1	DONE
607	3564	2026-07-21	2026-07-21	1	1	DONE
607	3565	2026-07-16	2026-09-16	\N	\N	DONE
607	3572	2026-07-30	2026-07-30	1	1	DONE
607	3573	2026-07-30	2026-07-30	1	1	DONE
607	3574	2026-07-31	2026-07-31	1	0.95	DONE
607	3575	2026-09-14	2026-09-14	1	1	DONE
607	3576	2026-09-16	2026-09-16	1	0	DONE
607	3577	2026-05-09	2026-10-17	161	\N	DONE
607	3578	2026-05-19	2026-05-21	3	1	DONE
607	3579	2026-05-09	2026-10-08	\N	\N	DONE
607	3580	2026-08-06	2026-08-07	2	0.15	DONE
607	3581	2026-08-06	2026-08-06	1	0.15	DONE
607	3582	2026-07-06	2026-07-08	3	0.15	DONE
607	3583	2026-08-06	2026-08-07	2	0.15	DONE
607	3584	2026-08-09	2026-08-09	1	0.15	DONE
607	3585	2026-08-08	2026-08-08	1	0.15	DONE
607	3586	2026-07-06	2026-10-17	\N	\N	DONE
607	3593	2026-08-31	2026-08-31	1	0.15	DONE
607	3594	2026-08-31	2026-08-31	1	0	DONE
607	3595	2026-10-15	2026-10-15	1	0.15	DONE
607	3596	2026-10-17	2026-10-17	1	0	DONE
607	3597	2026-05-12	2026-09-17	128	\N	DONE
607	3598	2026-05-19	2026-05-21	3	1	DONE
607	3599	2026-05-12	2026-09-17	\N	\N	DONE
607	3600	2026-06-06	2026-06-07	2	0.2	DONE
607	3601	2026-06-09	2026-06-09	1	0.2	DONE
607	3602	2026-06-01	2026-06-05	5	0.2	DONE
607	3603	2026-06-06	2026-06-06	1	0.2	DONE
607	3604	2026-06-09	2026-06-09	1	0.2	DONE
607	3605	2026-06-11	2026-06-11	1	0.2	DONE
607	3606	2026-06-01	2026-08-22	\N	\N	DONE
607	3613	2026-06-07	2026-06-07	1	0.2	DONE
607	3614	2026-06-07	2026-06-07	1	0.2	DONE
607	3615	2026-06-07	2026-06-07	1	0.2	DONE
607	3616	2026-08-20	2026-08-20	1	0.2	DONE
607	3617	2026-08-22	2026-08-22	1	0	DONE
607	3618	2026-03-26	2026-09-02	160	\N	DONE
607	3619	2026-05-19	2026-05-21	3	1	DONE
607	3620	2026-03-26	2026-09-02	\N	\N	DONE
607	3621	2026-06-06	2026-06-07	2	0.35	DONE
607	3622	2026-06-09	2026-06-09	1	0.35	DONE
607	3623	2026-06-01	2026-06-03	3	0.35	DONE
607	3624	2026-06-06	2026-06-07	2	0.35	DONE
607	3625	2026-06-09	2026-06-09	1	0.35	DONE
607	3626	2026-06-11	2026-06-11	1	0	DONE
607	3627	2026-06-01	2026-08-22	\N	\N	DONE
607	3634	2026-06-05	2026-06-05	1	0	DONE
607	3635	2026-06-05	2026-06-05	1	0	DONE
607	3636	2026-06-05	2026-06-05	1	0.35	DONE
607	3637	2026-08-20	2026-08-20	1	0	DONE
607	3638	2026-08-22	2026-08-22	1	0	DONE
607	3639	2026-02-24	2026-03-03	8	1	DONE
607	3640	\N	\N	\N	1	DONE
607	3641	2026-02-07	2026-11-02	\N	0.95	DONE
607	3642	2026-02-21	2026-04-21	60	0.35	DONE
607	3643	2026-03-03	2026-07-25	145	0.35	DONE
607	3644	2026-07-03	2026-09-10	70	0.35	DONE
607	3645	2026-07-14	2026-09-16	65	0.35	DONE
607	3646	2026-08-10	2026-10-08	60	0.35	DONE
607	3647	2026-02-17	2026-02-21	5	0.6	IN_PROGRESS
607	3648	2026-02-19	2026-02-26	8	0.6	IN_PROGRESS
607	3649	2026-02-19	2026-02-26	8	0.6	IN_PROGRESS
607	3650	2026-02-24	2026-03-03	8	0.6	IN_PROGRESS
607	3651	\N	\N	8	0	PENDING
607	3652	2026-02-07	2026-02-07	\N	0.95	DONE
607	3658	2026-02-21	2026-02-21	\N	0.95	DONE
607	3669	2026-02-11	2026-02-11	\N	0.95	DONE
607	3680	2026-02-07	2026-02-07	\N	0.95	DONE
607	3691	2026-02-19	2026-02-26	8	1	DONE
607	3692	2026-02-19	2026-02-26	8	1	DONE
607	3695	2026-02-22	2026-02-22	\N	0.95	DONE
607	3705	2026-02-22	2026-02-22	\N	0.95	DONE
607	3711	2026-02-07	2026-02-07	\N	0.95	DONE
607	3722	2026-02-21	2026-02-21	\N	0.25	DONE
607	3733	2026-05-19	2026-10-21	155	\N	DONE
607	3734	2026-05-19	2026-05-21	3	1	DONE
607	3735	2026-06-01	2026-10-21	\N	\N	DONE
607	3736	2026-08-06	2026-08-07	2	0.35	DONE
607	3737	2026-08-06	2026-08-06	1	0.35	DONE
607	3738	2026-07-06	2026-07-08	3	0.35	DONE
607	3739	2026-08-06	2026-08-07	2	0.35	DONE
607	3740	2026-08-09	2026-08-09	1	0.35	DONE
607	3741	2026-08-08	2026-08-08	1	0.35	DONE
607	3742	2026-07-06	2026-10-17	\N	\N	DONE
607	3749	2026-08-31	2026-08-31	1	0.35	DONE
607	3750	2026-08-31	2026-08-31	1	0.35	DONE
607	3751	2026-08-31	2026-08-31	1	0	DONE
607	3752	2026-10-15	2026-10-15	1	0.35	DONE
607	3753	2026-10-17	2026-10-17	1	0	DONE
607	3754	2026-08-23	2026-08-24	2	1	DONE
607	3755	2026-08-26	2026-08-27	2	0	DONE
607	3756	2026-08-29	2026-08-30	2	0.35	DONE
607	3757	2026-08-23	2026-08-31	9	1	DONE
607	3758	2026-09-02	2026-09-07	6	0.8	DONE
607	3759	2026-08-23	2026-08-30	8	1	DONE
607	3760	2026-09-01	2026-09-05	5	0.8	DONE
607	3761	2026-07-12	2026-07-23	12	1	DONE
607	3762	2026-07-25	2026-07-31	7	0.8	DONE
607	3763	2026-11-02	2026-11-02	1	0	DONE
607	3770	2026-08-23	2026-08-25	3	1	DONE
607	3771	2026-09-02	2026-09-04	3	0.8	DONE
607	3772	2026-09-02	2026-09-02	1	1	DONE
607	3773	2026-09-09	2026-09-09	1	0	DONE
607	3774	2026-09-01	2026-09-01	1	1	DONE
607	3775	2026-09-07	2026-09-07	1	0	DONE
607	3779	2026-08-23	2026-08-29	7	1	DONE
607	3780	2026-08-31	2026-09-03	4	0.25	DONE
607	3781	2026-08-23	2026-08-24	2	1	DONE
607	3782	2026-08-31	2026-08-31	1	0.25	DONE
607	3783	2026-10-27	2026-10-28	2	1	DONE
607	3784	2026-10-30	2026-10-31	2	0.35	DONE
607	3786	2026-05-19	2026-10-21	155	\N	DONE
607	3787	2026-05-19	2026-05-21	3	1	DONE
607	3788	2026-06-18	2026-10-21	\N	\N	DONE
607	3789	2026-08-09	2026-08-10	2	0	DONE
607	3790	2026-08-12	2026-08-12	1	0	DONE
607	3791	2026-08-09	2026-08-10	2	0	DONE
607	3792	2026-08-12	2026-08-12	1	0	DONE
607	3793	2026-07-15	2026-07-17	3	0	DONE
607	3794	2026-08-26	2026-08-26	1	0	DONE
607	3795	2026-07-15	2026-10-06	\N	\N	DONE
607	3801	2026-07-19	2026-07-19	1	0	DONE
607	3802	2026-08-09	2026-08-10	2	0	DONE
607	3803	2026-08-12	2026-08-12	1	0	DONE
607	3804	2026-08-12	2026-08-12	1	0	DONE
607	3805	2026-08-14	2026-08-14	1	0	DONE
607	3806	2026-08-12	2026-08-12	1	0	DONE
607	3807	2026-08-14	2026-08-14	1	0	DONE
607	3808	2026-08-23	2026-08-23	1	0	DONE
607	3809	2026-08-25	2026-08-25	1	0	DONE
607	3810	2026-08-22	2026-08-22	1	0	DONE
607	3811	2026-08-24	2026-08-24	1	0	DONE
607	3812	2026-08-26	2026-08-26	1	0	DONE
607	3814	2026-10-04	2026-10-04	1	0	DONE
607	3815	2026-10-04	2026-10-04	1	0	DONE
607	3816	2026-10-06	2026-10-06	1	0	DONE
607	3817	2026-08-23	2026-08-23	1	0	DONE
607	3818	2026-08-25	2026-08-25	1	0	DONE
607	3819	2026-08-22	2026-08-22	1	0	DONE
607	3820	2026-08-09	2026-08-10	2	0	DONE
607	3821	2026-08-12	2026-08-12	1	0	DONE
607	3822	2026-08-09	2026-08-10	2	0	DONE
607	3823	2026-08-12	2026-08-12	1	0	DONE
607	3824	2026-07-15	2026-07-17	3	0	DONE
607	3825	2026-07-19	2026-07-19	1	0	DONE
607	3826	2026-07-15	2026-10-06	\N	\N	DONE
607	3833	2026-08-09	2026-08-10	2	0	DONE
607	3834	2026-08-12	2026-08-12	1	0	DONE
607	3835	2026-08-12	2026-08-12	1	0	DONE
607	3836	2026-08-14	2026-08-14	1	0	DONE
607	3837	2026-08-12	2026-08-12	1	0	DONE
607	3838	2026-08-14	2026-08-14	1	0	DONE
607	3842	2026-08-24	2026-08-24	1	0	DONE
607	3843	2026-08-26	2026-08-26	1	0	DONE
607	3844	2026-08-26	2026-08-26	1	0	DONE
607	3845	2026-10-04	2026-10-04	1	0	DONE
607	3846	2026-10-04	2026-10-04	1	0	DONE
607	3847	2026-10-06	2026-10-06	1	0	DONE
607	3848	2026-01-29	2026-11-22	297	0.2	DONE
607	3849	2026-05-19	2026-05-21	3	1	DONE
607	3850	2026-01-29	2026-08-04	\N	0.2	DONE
607	3851	2026-06-03	2026-06-04	2	1	DONE
607	3852	2026-06-03	2026-06-03	1	1	DONE
607	3853	2026-04-22	2026-04-23	2	0.85	DONE
607	3854	2026-08-01	2026-08-01	1	0.1	DONE
607	3855	2026-08-04	2026-08-04	1	0	DONE
607	3856	2026-04-22	2026-11-22	\N	\N	DONE
607	3860	2026-06-03	2026-06-03	1	0.85	DONE
607	3861	2026-11-22	2026-11-22	1	0.15	DONE
607	3863	2026-05-19	2026-10-21	155	0.5	DONE
607	3864	2026-05-19	2026-05-21	3	1	DONE
607	3865	2026-06-01	2026-10-21	\N	\N	DONE
607	3866	2026-08-06	2026-08-07	2	0.35	DONE
607	3867	2026-08-06	2026-08-06	1	0.35	DONE
607	3868	2026-07-06	2026-07-08	3	0.35	DONE
607	3869	2026-08-06	2026-08-07	2	0.35	DONE
607	3870	2026-08-09	2026-08-09	1	0.35	DONE
607	3871	2026-08-08	2026-08-08	1	0.35	DONE
607	3872	2026-07-06	2026-10-17	\N	\N	DONE
607	3879	2026-08-31	2026-08-31	1	0.35	DONE
607	3880	2026-08-31	2026-08-31	1	0.35	DONE
607	3881	2026-08-31	2026-08-31	1	0	DONE
607	3882	2026-10-15	2026-10-15	1	0.35	DONE
607	3883	2026-10-17	2026-10-17	1	0	DONE
607	4766	2026-01-19	2026-07-29	\N	0	PENDING
607	4767	2026-01-19	2026-07-17	\N	0	PENDING
607	4768	2026-01-19	2026-01-20	2	0.65	IN_PROGRESS
607	4769	2026-02-23	2026-03-04	10	0.8	IN_PROGRESS
607	4770	2026-02-07	2026-02-26	20	0.9	IN_PROGRESS
607	4771	2026-05-08	2026-06-07	31	0	PENDING
607	4772	2026-06-28	2026-07-12	15	0	PENDING
607	4773	2026-03-29	2026-03-29	\N	0	PENDING
607	4774	2026-05-01	2026-05-30	30	0	PENDING
607	4775	2026-03-29	2026-03-29	\N	0	PENDING
607	4776	2026-03-29	2026-04-17	20	0	PENDING
607	4777	2026-04-17	2026-04-19	3	0	PENDING
607	4778	2026-04-23	2026-05-12	20	0	PENDING
607	4779	2026-05-12	2026-05-12	1	0	PENDING
607	4780	2026-05-08	2026-05-08	\N	0	PENDING
607	4781	2026-05-08	2026-05-27	20	0	PENDING
607	4782	2026-05-25	2026-05-27	3	0	PENDING
607	4783	2026-06-04	2026-06-23	20	0	PENDING
607	4784	2026-06-24	2026-06-24	1	0	PENDING
607	4785	2026-05-23	2026-05-23	\N	0	PENDING
607	4786	2026-06-04	2026-06-23	20	0	PENDING
607	4787	2026-05-23	2026-05-25	3	0	PENDING
607	4788	2026-06-27	2026-07-11	15	0	PENDING
607	4789	2026-07-17	2026-07-17	1	0	PENDING
607	4790	2026-06-11	2026-06-11	\N	0	PENDING
607	4791	2026-06-11	2026-06-30	20	0	PENDING
607	4792	2026-03-29	2026-07-29	\N	0.5	PENDING
607	4793	2026-07-02	2026-07-16	15	0	PENDING
607	4794	2026-07-17	2026-07-17	1	0	PENDING
607	4796	\N	\N	\N	\N	PENDING
607	4797	2026-06-20	2026-06-20	1	0	PENDING
607	4798	2026-06-22	2026-06-24	3	0	PENDING
607	4799	2026-03-29	2026-03-29	1	0	PENDING
607	4800	2026-04-08	2026-04-10	3	0	PENDING
607	4801	2026-06-20	2026-06-21	2	0	PENDING
607	4802	2026-06-23	2026-06-25	3	0	PENDING
607	4803	2026-05-01	2026-05-01	1	0	PENDING
607	4804	2026-05-03	2026-05-05	3	0	PENDING
607	4805	2026-06-22	2026-06-23	2	0	PENDING
607	4806	2026-06-26	2026-06-27	2	0	PENDING
607	4807	2026-03-31	2026-03-31	1	0	PENDING
607	4808	2026-04-12	2026-04-12	1	0	PENDING
607	4809	2026-06-23	2026-06-25	3	0	PENDING
607	4810	2026-06-27	2026-06-28	2	0	PENDING
607	4811	2026-06-23	2026-06-23	1	0	PENDING
607	4812	2026-06-25	2026-06-28	4	0	PENDING
607	4813	2026-06-30	2026-06-30	1	0	PENDING
607	4814	2026-07-02	2026-07-03	2	0	PENDING
607	4815	2026-06-25	2026-06-25	1	0	PENDING
607	4816	2026-06-30	2026-06-30	1	0	PENDING
607	4817	2026-07-19	2026-07-19	1	0	PENDING
607	4818	\N	\N	\N	\N	PENDING
607	4819	2026-06-20	2026-06-20	1	0	PENDING
607	4820	2026-06-20	2026-06-22	3	0	PENDING
607	4821	2026-03-29	2026-03-29	1	0	PENDING
607	4822	2026-03-29	2026-03-30	2	0	PENDING
607	4823	2026-06-20	2026-06-21	2	0	PENDING
607	4824	2026-06-20	2026-06-21	2	0	PENDING
607	4825	2026-05-01	2026-05-02	2	0	PENDING
607	4826	2026-05-01	2026-05-03	3	0	PENDING
607	4827	2026-06-21	2026-06-23	3	0	PENDING
607	4828	2026-06-24	2026-06-24	1	0	PENDING
607	4829	2026-03-30	2026-03-31	2	0	PENDING
607	4830	2026-04-01	2026-04-01	1	0	PENDING
607	4831	2026-04-01	2026-04-02	2	0	PENDING
607	4832	2026-04-22	2026-04-22	1	0	PENDING
607	4833	2026-06-20	2026-06-21	2	0	PENDING
607	4834	2026-06-21	2026-06-22	2	0	PENDING
607	4835	2026-06-21	2026-06-23	3	0	PENDING
607	4836	2026-06-24	2026-06-24	1	0	PENDING
607	4837	2026-06-21	2026-06-22	2	0	PENDING
607	4838	2026-06-26	2026-06-26	1	0	PENDING
607	4839	2026-07-29	2026-07-29	1	0	PENDING
607	4840	\N	\N	\N	\N	PENDING
607	4841	2026-06-20	2026-06-21	2	0	PENDING
607	4842	2026-06-23	2026-06-24	2	0	PENDING
607	4843	2026-03-29	2026-03-30	2	0	PENDING
607	4844	2026-04-01	2026-04-02	2	0	PENDING
607	4845	2026-06-20	2026-06-21	2	0	PENDING
607	4846	2026-06-21	2026-06-22	2	0	PENDING
607	4847	2026-05-01	2026-05-02	2	0	PENDING
607	4848	2026-05-04	2026-05-06	3	0	PENDING
607	4849	2026-06-23	2026-06-23	1	0	PENDING
607	4850	2026-06-26	2026-06-26	1	0	PENDING
607	4851	2026-04-01	2026-04-01	1	0	PENDING
607	4852	2026-04-04	2026-04-04	1	0	PENDING
607	4853	2026-04-01	2026-04-01	1	0	PENDING
607	4854	2026-04-22	2026-04-23	2	0	PENDING
607	4855	2026-06-25	2026-06-25	1	0	PENDING
607	4856	2026-06-28	2026-06-29	2	0	PENDING
607	4857	2026-06-27	2026-06-27	1	0	PENDING
607	4858	2026-06-29	2026-06-29	1	0	PENDING
607	4859	2026-07-15	2026-07-15	1	0	PENDING
607	4860	2026-07-17	2026-07-17	1	0	PENDING
607	4861	2026-07-19	2026-07-19	1	0	PENDING
607	4862	\N	\N	\N	\N	PENDING
607	4863	2026-06-20	2026-06-21	2	0	PENDING
607	4864	2026-06-23	2026-06-27	5	0	PENDING
607	4865	2026-06-29	2026-07-03	5	0	PENDING
607	4866	2026-03-29	2026-03-29	1	0	PENDING
607	4867	2026-03-31	2026-04-04	5	0	PENDING
607	4868	2026-04-06	2026-04-10	5	0	PENDING
607	4869	2026-06-20	2026-06-21	2	0	PENDING
607	4870	2026-06-23	2026-06-27	5	0	PENDING
607	4871	2026-06-29	2026-07-03	5	0	PENDING
607	4872	2026-06-23	2026-06-23	1	0	PENDING
607	4873	2026-06-29	2026-06-29	1	0	PENDING
607	4874	2026-07-05	2026-07-05	1	0	PENDING
607	4875	2026-03-31	2026-03-31	1	0	PENDING
607	4876	2026-04-06	2026-04-06	1	0	PENDING
607	4877	2026-04-12	2026-04-12	1	0	PENDING
607	4878	2026-07-05	2026-07-06	2	0	PENDING
607	4879	2026-07-05	2026-07-06	2	0	PENDING
607	4880	2026-07-08	2026-07-09	2	0	PENDING
607	4881	2026-07-05	2026-07-06	2	0	PENDING
607	4882	2026-07-07	2026-07-09	3	0	PENDING
607	4883	2026-07-10	2026-07-12	3	0	PENDING
607	4884	2026-07-05	2026-07-05	1	0	PENDING
607	4885	2026-07-07	2026-07-07	1	0	PENDING
607	4886	2026-07-09	2026-07-09	1	0	PENDING
607	4887	2026-07-14	2026-07-14	1	0	PENDING
607	4888	2026-03-12	2026-10-11	\N	\N	PENDING
607	4889	2026-03-12	2026-10-11	\N	\N	PENDING
607	4890	2026-06-16	2026-07-05	20	\N	PENDING
607	4891	2026-03-12	2026-03-16	5	0.05	IN_PROGRESS
607	4892	2026-06-23	2026-07-02	10	\N	PENDING
607	4893	2026-03-17	2026-03-26	10	\N	PENDING
607	4894	2026-09-16	2026-10-10	25	\N	PENDING
607	4895	2026-10-02	2026-10-11	10	\N	PENDING
607	4896	2026-05-29	2026-08-13	\N	\N	PENDING
607	4897	2026-05-29	2026-05-30	2	\N	PENDING
607	4898	2026-05-29	2026-05-29	1	\N	PENDING
607	4899	2026-06-17	2026-06-18	2	\N	PENDING
607	4900	2026-06-01	2026-06-02	2	\N	PENDING
607	4901	2026-06-01	2026-06-01	1	\N	PENDING
607	4902	2026-05-31	2026-05-31	1	\N	PENDING
607	4903	2026-06-20	2026-06-20	1	\N	PENDING
607	4904	2026-06-01	2026-06-01	1	\N	PENDING
607	4905	2026-06-02	2026-06-02	1	\N	PENDING
607	4906	2026-08-12	2026-08-12	1	\N	PENDING
607	4907	2026-08-13	2026-08-13	1	\N	PENDING
607	4908	2026-04-06	2026-10-13	\N	\N	PENDING
607	4909	2026-04-06	2026-10-13	\N	\N	PENDING
607	4910	2026-06-23	2026-07-12	20	0	PENDING
607	4911	2026-04-06	2026-04-10	5	0	PENDING
607	4912	2026-07-05	2026-07-14	10	0	PENDING
607	4913	2026-04-11	2026-04-20	10	0	PENDING
607	4914	2026-09-29	2026-10-13	15	0	PENDING
607	4915	2026-10-04	2026-10-13	10	0	PENDING
607	4916	2026-05-29	2026-08-13	\N	\N	PENDING
607	4917	2026-05-29	2026-05-30	2	0	PENDING
607	4918	2026-05-29	2026-05-29	1	0	PENDING
607	4919	2026-06-17	2026-06-20	4	0	PENDING
607	4920	2026-06-01	2026-06-02	2	0	PENDING
607	4921	2026-06-01	2026-06-01	1	0	PENDING
607	4922	2026-05-31	2026-05-31	1	0	PENDING
607	4923	2026-06-22	2026-06-22	1	0	PENDING
607	4924	2026-06-01	2026-06-01	1	0	PENDING
607	4925	2026-06-02	2026-06-02	1	0	PENDING
607	4926	2026-08-12	2026-08-12	1	0	PENDING
607	4927	2026-08-13	2026-08-13	1	0	PENDING
607	4928	2026-05-12	2026-09-26	\N	\N	PENDING
607	4929	2026-05-12	2026-09-26	\N	\N	PENDING
607	4930	2026-06-23	2026-07-02	10	0	PENDING
607	4931	2026-05-12	2026-05-16	5	0	PENDING
607	4932	2026-07-03	2026-07-05	3	0	PENDING
607	4933	2026-05-18	2026-05-20	3	0	PENDING
607	4934	2026-09-20	2026-09-26	7	0	PENDING
607	4935	2026-09-24	2026-09-26	3	0	PENDING
607	4936	2026-05-22	2026-09-23	\N	\N	PENDING
607	4937	2026-06-23	2026-06-24	2	0	PENDING
607	4938	2026-06-23	2026-06-23	1	0	PENDING
607	4939	2026-05-22	2026-05-24	3	0	PENDING
607	4940	2026-06-23	2026-06-24	2	0	PENDING
607	4941	2026-06-26	2026-06-26	1	0	PENDING
607	4942	2026-06-25	2026-06-25	1	0	PENDING
607	4943	2026-07-18	2026-07-18	1	0	PENDING
607	4944	2026-07-18	2026-07-18	1	0	PENDING
607	4945	2026-07-19	2026-07-19	1	0	PENDING
607	4946	2026-09-21	2026-09-21	1	0	PENDING
607	4947	2026-09-23	2026-09-23	1	0	PENDING
607	4948	2026-05-12	2026-09-26	\N	\N	PENDING
607	4949	2026-06-23	2026-07-02	10	0	PENDING
607	4950	2026-05-12	2026-05-16	5	0	PENDING
607	4951	2026-07-03	2026-07-05	3	0	PENDING
607	4952	2026-05-18	2026-05-20	3	0	PENDING
607	4953	2026-09-20	2026-09-26	7	0	PENDING
607	4954	2026-09-24	2026-09-26	3	0	PENDING
607	4955	2026-06-02	2026-10-04	\N	\N	PENDING
607	4956	2026-07-04	2026-07-05	2	0	PENDING
607	4957	2026-07-04	2026-07-04	1	0	PENDING
607	4958	2026-06-02	2026-06-04	3	0	PENDING
607	4959	2026-07-04	2026-07-05	2	0	PENDING
607	4960	2026-07-07	2026-07-07	1	0	PENDING
607	4961	2026-07-06	2026-07-06	1	0	PENDING
607	4962	2026-07-29	2026-07-29	1	0	PENDING
607	4963	2026-07-29	2026-07-29	1	0	PENDING
607	4964	2026-07-29	2026-07-29	1	0	PENDING
607	4965	2026-10-02	2026-10-02	1	0	PENDING
607	4966	2026-10-04	2026-10-04	1	0	PENDING
607	4967	2026-02-14	2026-10-12	\N	\N	PENDING
607	4968	2026-02-14	2026-10-12	\N	\N	PENDING
607	4969	2026-06-02	2026-06-11	10	0	PENDING
607	4970	2026-02-14	2026-02-18	5	0	PENDING
607	4971	2026-06-12	2026-06-14	3	0	PENDING
607	4972	2026-06-15	2026-06-17	3	0	PENDING
607	4973	2026-09-28	2026-10-12	15	0	PENDING
607	4974	2026-10-10	2026-10-12	3	0	PENDING
607	4975	2026-05-07	2026-08-14	\N	\N	PENDING
607	4976	\N	\N	\N	\N	PENDING
607	4977	2026-06-12	2026-06-13	2	0	PENDING
607	4978	2026-06-12	2026-06-12	1	0	PENDING
607	4979	2026-05-07	2026-05-08	2	0	PENDING
607	4980	2026-06-12	2026-06-13	2	0	PENDING
607	4981	2026-06-15	2026-06-15	1	0	PENDING
607	4982	2026-06-14	2026-06-14	1	0	PENDING
607	4983	2026-05-10	2026-05-10	1	0	PENDING
607	4984	2026-06-15	2026-06-15	1	0	PENDING
607	4985	2026-06-17	2026-06-17	1	0	PENDING
607	4986	2026-08-12	2026-08-12	1	0	PENDING
607	4987	2026-08-14	2026-08-14	1	0	PENDING
607	4988	\N	\N	\N	\N	PENDING
607	4989	2026-06-12	2026-06-13	2	0	PENDING
607	4990	2026-06-12	2026-06-12	1	0	PENDING
607	4991	2026-05-07	2026-05-08	2	0	PENDING
607	4992	2026-06-12	2026-06-13	2	0	PENDING
607	4993	2026-06-15	2026-06-15	1	0	PENDING
607	4994	2026-06-14	2026-06-14	1	0	PENDING
607	4995	2026-05-10	2026-05-10	1	0	PENDING
607	4996	2026-06-15	2026-06-15	1	0	PENDING
607	4997	2026-06-17	2026-06-17	1	0	PENDING
607	4998	2026-08-12	2026-08-12	1	0	PENDING
607	4999	2026-08-14	2026-08-14	1	0	PENDING
607	5000	2026-04-20	2026-10-17	\N	\N	PENDING
607	5001	2026-04-20	2026-10-17	\N	\N	PENDING
607	5002	2026-07-01	2026-07-15	15	0	PENDING
607	5003	2026-04-20	2026-04-24	5	0	PENDING
607	5004	2026-09-25	2026-09-27	3	0	PENDING
607	5005	2026-09-25	2026-09-27	3	0	PENDING
607	5006	2026-09-22	2026-10-01	10	0	PENDING
607	5007	2026-09-30	2026-10-02	3	0	PENDING
607	5008	2026-05-15	2026-05-15	\N	\N	PENDING
607	5009	2026-07-26	2026-07-26	1	0	PENDING
607	5010	2026-07-19	2026-07-19	1	0	PENDING
607	5011	2026-07-16	2026-07-17	2	0	PENDING
607	5012	2026-07-26	2026-07-26	1	0	PENDING
607	5013	2026-07-28	2026-07-28	1	0	PENDING
607	5014	2026-07-21	2026-07-21	1	0	PENDING
607	5015	2026-07-16	2026-09-16	\N	\N	PENDING
607	5022	2026-07-30	2026-07-30	1	0	PENDING
607	5023	2026-07-30	2026-07-30	1	0	PENDING
607	5024	2026-07-31	2026-07-31	1	0	PENDING
607	5025	2026-09-14	2026-09-14	1	0	PENDING
607	5026	2026-09-16	2026-09-16	1	0	PENDING
607	5027	2026-05-09	2026-10-17	\N	\N	PENDING
607	5028	2026-05-09	2026-10-08	\N	\N	PENDING
607	5029	2026-07-04	2026-07-13	10	0	PENDING
607	5030	2026-05-09	2026-05-13	5	0	PENDING
607	5031	2026-07-14	2026-07-16	3	0	PENDING
607	5032	2026-05-14	2026-05-16	3	0	PENDING
607	5033	2026-10-02	2026-10-08	7	0	PENDING
607	5034	2026-10-06	2026-10-08	3	0	PENDING
607	5035	2026-07-06	2026-10-17	\N	\N	PENDING
607	5036	2026-08-06	2026-08-07	2	0	PENDING
607	5037	2026-08-06	2026-08-06	1	0	PENDING
607	5038	2026-07-06	2026-07-08	3	0	PENDING
607	5039	2026-08-06	2026-08-07	2	0	PENDING
607	5040	2026-08-09	2026-08-09	1	0	PENDING
607	5041	2026-08-08	2026-08-08	1	0	PENDING
607	5042	2026-08-31	2026-08-31	1	0	PENDING
607	5043	2026-08-31	2026-08-31	1	0	PENDING
607	5044	2026-08-31	2026-08-31	1	0	PENDING
607	5045	2026-10-15	2026-10-15	1	0	PENDING
607	5046	2026-10-17	2026-10-17	1	0	PENDING
607	5047	2026-05-12	2026-09-17	\N	\N	PENDING
607	5048	2026-05-12	2026-09-17	\N	\N	PENDING
607	5049	2026-05-12	2026-05-31	20	0	PENDING
607	5050	2026-05-31	2026-06-04	5	0	PENDING
607	5051	2026-06-01	2026-06-07	7	0	PENDING
607	5052	2026-06-05	2026-06-11	7	0	PENDING
607	5053	2026-08-29	2026-09-17	20	0	PENDING
607	5054	2026-09-11	2026-09-17	7	0	PENDING
607	5055	2026-06-01	2026-08-22	\N	\N	PENDING
607	5056	2026-06-06	2026-06-07	2	0	PENDING
607	5057	2026-06-09	2026-06-09	1	0	PENDING
607	5058	2026-06-01	2026-06-05	5	0	PENDING
607	5059	2026-06-06	2026-06-06	1	0	PENDING
607	5060	2026-06-09	2026-06-09	1	0	PENDING
607	5061	2026-06-11	2026-06-11	1	0	PENDING
607	5062	2026-06-07	2026-06-07	1	0	PENDING
607	5063	2026-06-07	2026-06-07	1	0	PENDING
607	5064	2026-06-07	2026-06-07	1	0	PENDING
607	5065	2026-08-20	2026-08-20	1	0	PENDING
607	5066	2026-08-22	2026-08-22	1	0	PENDING
607	5067	2026-03-26	2026-09-02	\N	\N	PENDING
607	5068	2026-03-26	2026-09-02	\N	\N	PENDING
607	5069	2026-06-08	2026-07-02	25	0	PENDING
607	5070	2026-03-26	2026-03-30	5	0	PENDING
607	5071	2026-07-03	2026-07-05	3	0	PENDING
607	5072	2026-03-31	2026-04-02	3	0	PENDING
607	5073	2026-08-27	2026-09-02	7	0	PENDING
607	5074	2026-08-31	2026-09-02	3	0	PENDING
607	5075	2026-06-01	2026-08-22	\N	\N	PENDING
607	5076	2026-06-06	2026-06-07	2	0	PENDING
607	5077	2026-06-09	2026-06-09	1	0	PENDING
607	5078	2026-06-01	2026-06-03	3	0	PENDING
607	5079	2026-06-06	2026-06-07	2	0	PENDING
607	5080	2026-06-09	2026-06-09	1	0	PENDING
607	5081	2026-06-11	2026-06-11	1	0	PENDING
607	5082	2026-06-05	2026-06-05	1	0	PENDING
607	5083	2026-06-05	2026-06-05	1	0	PENDING
607	5084	2026-06-05	2026-06-05	1	0	PENDING
607	5085	2026-08-20	2026-08-20	1	0	PENDING
607	5086	2026-08-22	2026-08-22	1	0	PENDING
607	5087	2026-02-07	2026-11-02	\N	\N	PENDING
607	5088	2026-02-07	2026-11-02	\N	\N	PENDING
607	5089	2026-02-07	2026-04-17	70	0	PENDING
607	5090	2026-02-16	2026-06-05	110	0	PENDING
607	5091	2026-05-28	2026-07-11	45	0	PENDING
607	5092	2026-03-23	2026-06-10	80	0	PENDING
607	5093	2026-07-02	2026-10-09	100	0	PENDING
607	5094	2026-02-07	2026-02-07	\N	0	PENDING
607	5095	2026-02-07	2026-04-02	55	0	PENDING
607	5096	2026-02-14	2026-04-04	50	0	PENDING
607	5097	2026-05-28	2026-07-31	65	0	PENDING
607	5098	2026-03-23	2026-04-06	15	0	PENDING
607	5099	2026-08-01	2026-09-29	60	0	PENDING
607	5100	2026-02-21	2026-02-21	\N	0	PENDING
607	5101	2026-02-21	2026-04-21	60	0	PENDING
607	5102	2026-03-03	2026-07-25	145	0	PENDING
607	5103	2026-07-03	2026-09-10	70	0	PENDING
607	5104	2026-07-14	2026-09-16	65	0	PENDING
607	5105	2026-08-10	2026-10-08	60	0	PENDING
607	5106	2026-02-11	2026-02-11	\N	0	PENDING
607	5107	2026-02-11	2026-03-17	35	0	PENDING
607	5108	2026-03-08	2026-06-05	90	0	PENDING
607	5109	2026-04-13	2026-06-11	60	0	PENDING
607	5110	2026-04-10	2026-06-13	65	0	PENDING
607	5111	2026-06-15	2026-08-03	50	0	PENDING
607	5112	2026-02-07	2026-02-07	\N	0	PENDING
607	5113	2026-02-07	2026-03-23	45	0.2	IN_PROGRESS
607	5114	2026-03-04	2026-06-26	115	0.2	IN_PROGRESS
607	5115	2026-06-17	2026-09-04	80	0	PENDING
607	5116	2026-06-28	2026-09-05	70	0	PENDING
607	5117	2026-02-07	2026-03-23	45	0	PENDING
607	5118	2026-03-04	2026-06-26	115	0	PENDING
607	5119	2026-06-17	2026-09-04	80	0	PENDING
607	5120	2026-06-28	2026-09-05	70	0	PENDING
607	5121	2026-08-28	2026-11-02	67	0	PENDING
607	5122	2026-02-17	2026-02-21	5	0.7058824	IN_PROGRESS
607	5123	2026-02-19	2026-02-26	8	0.1	IN_PROGRESS
607	5124	2026-02-19	2026-02-26	8	0	PENDING
607	5125	2026-02-24	2026-03-03	8	0	PENDING
607	5126	2026-02-22	2026-02-22	\N	0	PENDING
607	5127	2026-02-07	2026-03-23	45	0.6	IN_PROGRESS
607	5128	2026-03-04	2026-06-26	115	0.6	IN_PROGRESS
607	5129	2026-06-17	2026-09-04	80	0	PENDING
607	5130	2026-06-28	2026-09-05	70	0	PENDING
607	5131	2026-02-07	2026-03-23	45	0.5	IN_PROGRESS
607	5132	2026-03-04	2026-06-26	115	0.5	IN_PROGRESS
607	5133	2026-06-17	2026-09-04	80	0	PENDING
607	5134	2026-06-28	2026-09-05	70	0	PENDING
607	5135	2026-08-28	2026-11-02	67	0	PENDING
607	5136	2026-02-22	2026-02-22	\N	0	PENDING
607	5137	2026-02-22	2026-03-23	30	0	PENDING
607	5138	2026-03-19	2026-05-17	60	0	PENDING
607	5139	2026-05-23	2026-07-16	55	0	PENDING
607	5140	2026-06-02	2026-07-18	47	0	PENDING
607	5141	2026-06-22	2026-07-27	36	0	PENDING
607	5142	2026-02-07	2026-02-07	\N	0	PENDING
607	5143	2026-02-12	2026-03-18	35	0	PENDING
607	5144	2026-03-09	2026-06-01	85	0	PENDING
607	5145	2026-05-23	2026-07-26	65	0	PENDING
607	5146	2026-05-28	2026-07-26	60	0	PENDING
607	5147	2026-07-09	2026-09-11	65	0	PENDING
607	5148	2026-02-12	2026-02-12	\N	0	PENDING
607	5154	2026-06-01	2026-06-01	\N	0	PENDING
607	5155	2026-06-11	2026-06-12	2	0	PENDING
607	5156	2026-06-09	2026-06-09	1	0	PENDING
607	5157	2026-06-01	2026-06-05	5	0	PENDING
607	5158	2026-06-06	2026-06-06	1	0	PENDING
607	5159	2026-06-09	2026-06-09	1	0	PENDING
607	5160	2026-06-11	2026-06-11	1	0	PENDING
607	5161	2026-06-07	2026-06-07	1	0	PENDING
607	5162	2026-06-07	2026-06-07	1	0	PENDING
607	5163	2026-06-07	2026-06-07	1	0	PENDING
607	5164	2026-08-20	2026-08-20	1	0	PENDING
607	5165	2026-08-22	2026-08-22	1	0	PENDING
607	5166	2026-06-01	2026-10-21	\N	\N	PENDING
607	5167	2026-06-01	2026-10-21	\N	\N	PENDING
607	5168	2026-08-06	2026-08-15	10	0	PENDING
607	5169	2026-06-01	2026-06-05	5	0	PENDING
607	5170	2026-08-16	2026-08-18	3	0	PENDING
607	5171	2026-06-06	2026-06-08	3	0	PENDING
607	5172	2026-10-15	2026-10-21	7	0	PENDING
607	5173	2026-10-19	2026-10-21	3	0	PENDING
607	5174	2026-07-06	2026-10-17	\N	\N	PENDING
607	5175	2026-08-06	2026-08-07	2	0	PENDING
607	5176	2026-08-06	2026-08-06	1	0	PENDING
607	5177	2026-07-06	2026-07-08	3	0	PENDING
607	5178	2026-08-06	2026-08-07	2	0	PENDING
607	5179	2026-08-09	2026-08-09	1	0	PENDING
607	5180	2026-08-08	2026-08-08	1	0	PENDING
607	5181	2026-08-31	2026-08-31	1	0	PENDING
607	5182	2026-08-31	2026-08-31	1	0	PENDING
607	5183	2026-08-31	2026-08-31	1	0	PENDING
607	5184	2026-10-15	2026-10-15	1	0	PENDING
607	5185	2026-10-17	2026-10-17	1	0	PENDING
607	5186	2026-04-18	2026-11-02	\N	\N	PENDING
607	5187	2026-04-18	2026-10-24	\N	\N	PENDING
607	5188	2026-08-23	2026-09-01	10	0	PENDING
607	5189	2026-04-18	2026-04-22	5	0	PENDING
607	5190	2026-09-02	2026-09-04	3	0	PENDING
607	5191	2026-04-23	2026-04-25	3	0	PENDING
607	5192	2026-10-17	2026-10-23	7	0	PENDING
607	5193	2026-10-24	2026-10-24	1	0	PENDING
607	5194	2026-07-12	2026-11-02	\N	\N	PENDING
607	5195	2026-08-23	2026-08-31	9	0	PENDING
607	5196	2026-09-02	2026-09-07	6	0	PENDING
607	5197	2026-08-23	2026-08-30	8	0	PENDING
607	5198	2026-09-01	2026-09-05	5	0	PENDING
607	5199	2026-07-12	2026-07-23	12	0	PENDING
607	5200	2026-07-25	2026-07-31	7	0	PENDING
607	5201	2026-08-23	2026-08-25	3	0	PENDING
607	5202	2026-09-02	2026-09-04	3	0	PENDING
607	5203	2026-09-02	2026-09-02	1	0	PENDING
607	5204	2026-09-09	2026-09-09	1	0	PENDING
607	5205	2026-09-01	2026-09-01	1	0	PENDING
607	5206	2026-09-07	2026-09-07	1	0	PENDING
607	5207	2026-08-23	2026-08-24	2	0	PENDING
607	5208	2026-08-26	2026-08-27	2	0	PENDING
607	5209	2026-08-29	2026-08-30	2	0	PENDING
607	5210	2026-08-23	2026-08-29	7	0	PENDING
607	5211	2026-08-31	2026-09-03	4	0	PENDING
607	5212	2026-08-23	2026-08-24	2	0	PENDING
607	5213	2026-08-31	2026-08-31	1	0	PENDING
607	5214	2026-10-27	2026-10-28	2	0	PENDING
607	5215	2026-10-30	2026-10-31	2	0	PENDING
607	5216	2026-11-02	2026-11-02	1	0	PENDING
607	5217	2026-06-18	2026-10-21	\N	\N	PENDING
607	5218	2026-06-18	2026-10-21	\N	\N	PENDING
607	5219	2026-08-09	2026-08-18	10	0	PENDING
607	5220	2026-06-18	2026-06-22	5	0	PENDING
607	5221	2026-08-19	2026-08-21	3	0	PENDING
607	5222	2026-06-23	2026-06-25	3	0	PENDING
607	5223	2026-10-15	2026-10-21	7	0	PENDING
607	5224	2026-10-19	2026-10-21	3	0	PENDING
607	5225	2026-07-15	2026-10-06	\N	\N	PENDING
607	5226	2026-08-09	2026-08-10	2	0	PENDING
607	5227	2026-08-12	2026-08-12	1	0	PENDING
607	5228	2026-08-09	2026-08-10	2	0	PENDING
607	5229	2026-08-12	2026-08-12	1	0	PENDING
607	5230	2026-07-15	2026-07-17	3	0	PENDING
607	5231	2026-07-19	2026-07-19	1	0	PENDING
607	5232	2026-08-09	2026-08-10	2	0	PENDING
607	5233	2026-08-12	2026-08-12	1	0	PENDING
607	5234	2026-08-12	2026-08-12	1	0	PENDING
607	5235	2026-08-14	2026-08-14	1	0	PENDING
607	5236	2026-08-12	2026-08-12	1	0	PENDING
607	5237	2026-08-14	2026-08-14	1	0	PENDING
607	5238	2026-08-23	2026-08-23	1	0	PENDING
607	5239	2026-08-25	2026-08-25	1	0	PENDING
607	5240	2026-08-22	2026-08-22	1	0	PENDING
607	5241	2026-08-24	2026-08-24	1	0	PENDING
607	5242	2026-08-26	2026-08-26	1	0	PENDING
607	5243	2026-08-26	2026-08-26	1	0	PENDING
607	5244	2026-10-04	2026-10-04	1	0	PENDING
607	5245	2026-10-04	2026-10-04	1	0	PENDING
607	5246	2026-10-06	2026-10-06	1	0	PENDING
607	5247	2026-06-18	2026-10-21	\N	\N	PENDING
607	5248	2026-06-18	2026-10-21	\N	\N	PENDING
607	5249	2026-08-09	2026-08-18	10	0	PENDING
607	5250	2026-06-18	2026-06-22	5	0	PENDING
607	5251	2026-08-19	2026-08-21	3	0	PENDING
607	5252	2026-06-23	2026-06-25	3	0	PENDING
607	5253	2026-10-15	2026-10-21	7	0	PENDING
607	5254	2026-10-19	2026-10-21	3	0	PENDING
607	5255	2026-07-15	2026-10-06	\N	\N	PENDING
607	5256	2026-08-09	2026-08-10	2	0	PENDING
607	5257	2026-08-12	2026-08-12	1	0	PENDING
607	5258	2026-08-09	2026-08-10	2	0	PENDING
607	5259	2026-08-12	2026-08-12	1	0	PENDING
607	5260	2026-07-15	2026-07-17	3	0	PENDING
607	5261	2026-07-19	2026-07-19	1	0	PENDING
607	5262	2026-08-09	2026-08-10	2	0	PENDING
607	5263	2026-08-12	2026-08-12	1	0	PENDING
607	5264	2026-08-12	2026-08-12	1	0	PENDING
607	5265	2026-08-14	2026-08-14	1	0	PENDING
607	5266	2026-08-12	2026-08-12	1	0	PENDING
607	5267	2026-08-14	2026-08-14	1	0	PENDING
607	5268	2026-08-23	2026-08-23	1	0	PENDING
607	5269	2026-08-25	2026-08-25	1	0	PENDING
607	5270	2026-08-22	2026-08-22	1	0	PENDING
607	5271	2026-08-24	2026-08-24	1	0	PENDING
607	5272	2026-08-26	2026-08-26	1	0	PENDING
607	5273	2026-08-26	2026-08-26	1	0	PENDING
607	5274	2026-10-04	2026-10-04	1	0	PENDING
607	5275	2026-10-04	2026-10-04	1	0	PENDING
607	5276	2026-10-06	2026-10-06	1	0	PENDING
607	5277	2026-01-29	2026-08-04	\N	\N	PENDING
607	5278	2026-01-29	2026-08-04	\N	\N	PENDING
607	5279	2026-06-03	2026-06-12	10	0	PENDING
607	5280	2026-01-29	2026-02-02	5	0	PENDING
607	5281	2026-06-13	2026-06-15	3	0	PENDING
607	5282	2026-02-13	2026-02-14	2	0.8	IN_PROGRESS
607	5283	2026-02-08	2026-02-10	3	0	PENDING
607	5284	2026-07-30	2026-08-03	5	0	PENDING
607	5285	2026-08-04	2026-08-04	1	0	PENDING
607	5286	2026-04-22	2026-08-01	\N	\N	PENDING
607	5287	2026-06-03	2026-06-04	2	0	PENDING
607	5288	2026-06-03	2026-06-03	1	0	PENDING
607	5289	2026-04-22	2026-04-23	2	0	PENDING
607	5290	2026-06-03	2026-06-03	1	0	PENDING
607	5291	2026-06-06	2026-06-06	1	0	PENDING
607	5292	2026-06-05	2026-06-05	1	0	PENDING
607	5293	2026-04-25	2026-04-25	1	0	PENDING
607	5294	2026-06-08	2026-06-08	1	0	PENDING
607	5295	2026-06-10	2026-06-10	1	0	PENDING
607	5296	2026-07-30	2026-07-30	1	0	PENDING
607	5297	2026-08-01	2026-08-01	1	0	PENDING
607	5832	\N	\N	\N	\N	PENDING
607	5833	\N	\N	\N	\N	PENDING
607	5834	\N	\N	\N	\N	PENDING
607	5835	\N	\N	\N	\N	PENDING
607	5836	\N	\N	\N	\N	PENDING
607	5837	\N	\N	\N	\N	PENDING
607	5838	\N	\N	\N	\N	PENDING
607	5839	\N	\N	\N	\N	PENDING
607	5840	\N	\N	\N	\N	PENDING
607	5841	\N	\N	\N	0.5	PENDING
607	5842	\N	\N	\N	\N	PENDING
607	5843	\N	\N	\N	\N	PENDING
607	5844	\N	\N	\N	\N	PENDING
607	5845	\N	\N	\N	\N	PENDING
607	5846	\N	\N	\N	\N	PENDING
607	5847	\N	\N	\N	\N	PENDING
607	5848	\N	\N	\N	\N	PENDING
607	5849	\N	\N	\N	\N	PENDING
607	5850	\N	\N	\N	\N	PENDING
607	5851	\N	\N	\N	\N	PENDING
607	5852	\N	\N	\N	\N	PENDING
607	5853	\N	\N	\N	\N	PENDING
607	5854	\N	\N	\N	\N	PENDING
607	5855	\N	\N	\N	\N	PENDING
607	5856	\N	\N	\N	\N	PENDING
607	5857	\N	\N	\N	\N	PENDING
607	5858	\N	\N	\N	\N	PENDING
607	5859	\N	\N	\N	\N	PENDING
607	5860	\N	\N	\N	\N	PENDING
607	5861	\N	\N	\N	\N	PENDING
607	5862	\N	\N	\N	\N	PENDING
607	5863	\N	\N	\N	\N	PENDING
607	5864	\N	\N	\N	\N	PENDING
607	5865	\N	\N	\N	\N	PENDING
607	5866	\N	\N	\N	\N	PENDING
607	5867	\N	\N	\N	\N	PENDING
607	5868	\N	\N	\N	\N	PENDING
607	5869	\N	\N	\N	\N	PENDING
607	5870	\N	\N	\N	\N	PENDING
607	5871	\N	\N	\N	\N	PENDING
607	5872	\N	\N	\N	\N	PENDING
607	5873	\N	\N	\N	\N	PENDING
607	5874	\N	\N	\N	\N	PENDING
607	5875	\N	\N	\N	\N	PENDING
607	5876	\N	\N	\N	\N	PENDING
607	5877	\N	\N	\N	\N	PENDING
607	5878	\N	\N	\N	\N	PENDING
607	5879	\N	\N	\N	\N	PENDING
615	3319	2026-03-31	2026-03-31	1	0.5	DONE
615	3320	2026-04-06	2026-04-06	1	1	DONE
615	3321	2026-04-12	2026-04-12	1	1	DONE
615	3322	2026-06-20	2026-06-21	2	1	DONE
615	3323	2026-06-23	2026-06-27	5	1	DONE
615	3324	2026-06-29	2026-07-03	5	1	DONE
615	3325	2026-03-29	2026-03-29	1	1	DONE
615	3326	2026-03-31	2026-04-04	5	1	DONE
615	3327	2026-07-10	2026-07-12	3	1	DONE
615	3329	2026-07-07	2026-07-07	1	1	DONE
615	3335	2026-05-08	2026-05-27	\N	1	DONE
615	3340	2026-05-23	2026-05-23	\N	1	DONE
615	3345	2026-06-11	2026-06-11	\N	1	DONE
615	3351	\N	\N	\N	1	DONE
615	3357	2026-04-06	2026-04-10	5	1	DONE
615	3358	2026-06-20	2026-06-21	2	1	DONE
615	3359	2026-06-23	2026-06-27	5	1	DONE
615	3360	2026-06-29	2026-07-03	5	1	DONE
615	3361	2026-06-23	2026-06-23	1	1	DONE
615	3362	2026-06-29	2026-06-29	1	1	DONE
615	3363	2026-07-05	2026-07-05	1	1	DONE
615	3367	2026-07-05	2026-07-06	2	1	DONE
615	3368	2026-07-05	2026-07-06	2	1	DONE
615	3369	2026-07-08	2026-07-09	2	1	DONE
615	3370	2026-07-05	2026-07-06	2	1	DONE
615	3371	2026-07-07	2026-07-09	3	1	DONE
615	3373	2026-03-29	2026-03-29	\N	1	DONE
615	3395	2026-03-29	2026-03-30	\N	1	DONE
615	3417	2026-03-29	2026-03-29	\N	1	DONE
615	3439	2026-07-05	2026-07-05	1	1	DONE
615	3441	2026-07-09	2026-07-09	1	1	DONE
615	3442	2026-07-14	2026-07-14	1	1	DONE
615	3443	2026-03-12	2026-10-11	213	\N	DONE
615	3444	2026-05-19	2026-05-21	3	1	DONE
615	3445	2026-03-12	2026-10-11	\N	\N	DONE
615	3446	2026-05-29	2026-05-30	2	1	DONE
615	3447	2026-05-29	2026-05-29	1	1	DONE
615	3448	2026-06-17	2026-06-18	2	1	DONE
615	3449	2026-06-01	2026-06-02	2	1	DONE
615	3450	2026-06-01	2026-06-01	1	1	DONE
615	3451	2026-05-31	2026-05-31	1	1	DONE
615	3452	2026-05-29	2026-08-13	\N	\N	DONE
615	3459	2026-06-20	2026-06-20	1	1	DONE
615	3460	2026-06-01	2026-06-01	1	1	DONE
615	3461	2026-06-02	2026-06-02	1	1	DONE
615	3462	2026-08-12	2026-08-12	1	1	DONE
615	3463	2026-08-13	2026-08-13	1	0.35	DONE
615	3464	2026-04-06	2026-10-13	190	\N	DONE
615	3465	2026-05-19	2026-05-21	3	1	DONE
615	3466	2026-04-06	2026-10-13	\N	\N	DONE
615	3467	2026-05-29	2026-05-30	2	1	DONE
615	3468	2026-05-29	2026-05-29	1	1	DONE
615	3469	2026-06-17	2026-06-20	4	1	DONE
615	3470	2026-06-01	2026-06-02	2	1	DONE
615	3471	2026-06-01	2026-06-01	1	1	DONE
615	3472	2026-05-31	2026-05-31	1	1	DONE
615	3473	2026-05-29	2026-08-13	\N	\N	DONE
615	3480	2026-06-22	2026-06-22	1	1	DONE
615	3481	2026-06-01	2026-06-01	1	1	DONE
615	3482	2026-06-02	2026-06-02	1	0.95	DONE
615	3483	2026-08-12	2026-08-12	1	1	DONE
615	3484	2026-08-13	2026-08-13	1	0.4	DONE
615	3485	2026-05-12	2026-09-26	137	\N	DONE
615	3486	2026-05-19	2026-05-21	3	1	DONE
615	3487	2026-05-12	2026-09-26	\N	\N	DONE
615	3488	2026-06-23	2026-06-24	2	0.15	DONE
615	3489	2026-06-23	2026-06-23	1	0.15	DONE
615	3490	2026-05-22	2026-05-24	3	0.15	DONE
615	3491	2026-06-23	2026-06-24	2	0.15	DONE
615	3492	2026-06-26	2026-06-26	1	0.15	DONE
615	3493	2026-06-25	2026-06-25	1	0.15	DONE
615	3494	2026-05-22	2026-09-23	\N	\N	DONE
615	3501	2026-07-18	2026-07-18	1	0.15	DONE
615	3502	2026-07-18	2026-07-18	1	0.15	DONE
615	3503	2026-07-19	2026-07-19	1	0.15	DONE
615	3504	2026-09-21	2026-09-21	1	0.15	DONE
615	3505	2026-09-23	2026-09-23	1	0	DONE
615	3506	2026-05-12	2026-12-29	231	\N	DONE
615	3507	2026-05-19	2026-05-21	3	1	DONE
615	3508	2026-05-12	2026-09-26	\N	\N	DONE
615	3509	2026-07-04	2026-07-05	2	0.1	DONE
615	3510	2026-07-04	2026-07-04	1	0.1	DONE
615	3511	2026-06-02	2026-06-04	3	0.1	DONE
615	3512	2026-07-04	2026-07-05	2	0.1	DONE
615	3513	2026-10-04	2026-10-04	1	0	DONE
615	3514	2026-12-29	2026-12-29	1	0	DONE
615	3515	2026-06-02	2026-12-29	\N	\N	DONE
615	3522	2026-02-14	2026-10-12	240	\N	DONE
615	3523	2026-05-19	2026-05-21	3	1	DONE
615	3524	2026-02-14	2026-10-12	\N	\N	DONE
615	3525	2026-06-12	2026-06-13	2	0.9	DONE
615	3526	2026-06-12	2026-06-12	1	0.9	DONE
615	3527	2026-05-07	2026-05-08	2	0.9	DONE
615	3528	2026-06-12	2026-06-13	2	0.9	DONE
615	3529	2026-06-15	2026-06-15	1	0.9	DONE
615	3530	2026-06-14	2026-06-14	1	0.9	DONE
615	3531	2026-05-07	2026-08-14	\N	\N	DONE
615	3532	\N	\N	\N	\N	PENDING
615	3539	2026-05-10	2026-05-10	1	0.9	DONE
615	3540	2026-06-15	2026-06-15	1	0.9	DONE
615	3541	2026-06-17	2026-06-17	1	0	DONE
615	3542	2026-08-12	2026-08-12	1	0.9	DONE
615	3543	2026-08-14	2026-08-14	1	0	DONE
615	3544	\N	\N	\N	\N	PENDING
615	3556	2026-04-20	2026-10-02	165	\N	DONE
615	3557	2026-05-19	2026-05-21	3	1	DONE
615	3558	2026-04-20	2026-10-02	\N	\N	DONE
615	3559	2026-07-26	2026-07-26	1	1	DONE
615	3560	2026-07-19	2026-07-19	1	1	DONE
615	3561	2026-07-16	2026-07-17	2	1	DONE
615	3562	2026-07-26	2026-07-26	1	1	DONE
615	3563	2026-07-28	2026-07-28	1	1	DONE
615	3564	2026-07-21	2026-07-21	1	1	DONE
615	3565	2026-07-16	2026-09-16	\N	\N	DONE
615	3572	2026-07-30	2026-07-30	1	1	DONE
615	3573	2026-07-30	2026-07-30	1	1	DONE
615	3574	2026-07-31	2026-07-31	1	0.95	DONE
615	3575	2026-09-14	2026-09-14	1	1	DONE
615	3576	2026-09-16	2026-09-16	1	0	DONE
615	3577	2026-05-09	2026-10-17	161	\N	DONE
615	3578	2026-05-19	2026-05-21	3	1	DONE
615	3579	2026-05-09	2026-10-08	\N	\N	DONE
615	3580	2026-08-06	2026-08-07	2	0.15	DONE
615	3581	2026-08-06	2026-08-06	1	0.15	DONE
615	3582	2026-07-06	2026-07-08	3	0.15	DONE
615	3583	2026-08-06	2026-08-07	2	0.15	DONE
615	3584	2026-08-09	2026-08-09	1	0.15	DONE
615	3585	2026-08-08	2026-08-08	1	0.15	DONE
615	3586	2026-07-06	2026-10-17	\N	\N	DONE
615	3593	2026-08-31	2026-08-31	1	0.15	DONE
615	3594	2026-08-31	2026-08-31	1	0	DONE
615	3595	2026-10-15	2026-10-15	1	0.15	DONE
615	3596	2026-10-17	2026-10-17	1	0	DONE
615	3597	2026-05-12	2026-09-17	128	\N	DONE
615	3598	2026-05-19	2026-05-21	3	1	DONE
615	3599	2026-05-12	2026-09-17	\N	\N	DONE
615	3600	2026-06-06	2026-06-07	2	0.2	DONE
615	3601	2026-06-09	2026-06-09	1	0.2	DONE
615	3602	2026-06-01	2026-06-05	5	0.2	DONE
615	3603	2026-06-06	2026-06-06	1	0.2	DONE
615	3604	2026-06-09	2026-06-09	1	0.2	DONE
615	3605	2026-06-11	2026-06-11	1	0.2	DONE
615	3606	2026-06-01	2026-08-22	\N	\N	DONE
615	3613	2026-06-07	2026-06-07	1	0.2	DONE
615	3614	2026-06-07	2026-06-07	1	0.2	DONE
615	3615	2026-06-07	2026-06-07	1	0.2	DONE
615	3616	2026-08-20	2026-08-20	1	0.2	DONE
615	3617	2026-08-22	2026-08-22	1	0	DONE
615	3618	2026-03-26	2026-09-02	160	\N	DONE
615	3619	2026-05-19	2026-05-21	3	1	DONE
615	3620	2026-03-26	2026-09-02	\N	\N	DONE
615	3621	2026-06-06	2026-06-07	2	0.35	DONE
615	3622	2026-06-09	2026-06-09	1	0.35	DONE
615	3623	2026-06-01	2026-06-03	3	0.35	DONE
615	3624	2026-06-06	2026-06-07	2	0.35	DONE
615	3625	2026-06-09	2026-06-09	1	0.35	DONE
615	3626	2026-06-11	2026-06-11	1	0	DONE
615	3627	2026-06-01	2026-08-22	\N	\N	DONE
615	3634	2026-06-05	2026-06-05	1	0	DONE
615	3635	2026-06-05	2026-06-05	1	0	DONE
615	3636	2026-06-05	2026-06-05	1	0.35	DONE
615	3637	2026-08-20	2026-08-20	1	0	DONE
615	3638	2026-08-22	2026-08-22	1	0	DONE
615	3639	2026-02-24	2026-03-03	8	1	DONE
615	3640	\N	\N	\N	1	DONE
615	3641	2026-02-07	2026-11-02	\N	0.95	DONE
615	3642	2026-02-21	2026-04-21	60	0.35	DONE
615	3643	2026-03-03	2026-07-25	145	0.35	DONE
615	3644	2026-07-03	2026-09-10	70	0.35	DONE
615	3645	2026-07-14	2026-09-16	65	0.35	DONE
615	3646	2026-08-10	2026-10-08	60	0.35	DONE
615	3647	2026-02-17	2026-02-21	5	0.6	IN_PROGRESS
615	3648	2026-02-19	2026-02-26	8	0.6	IN_PROGRESS
615	3649	2026-02-19	2026-02-26	8	0.6	IN_PROGRESS
615	3650	2026-02-24	2026-03-03	8	0.6	IN_PROGRESS
615	3651	\N	\N	8	0	PENDING
615	3652	2026-02-07	2026-02-07	\N	0.95	DONE
615	3658	2026-02-21	2026-02-21	\N	0.95	DONE
615	3669	2026-02-11	2026-02-11	\N	0.95	DONE
615	3680	2026-02-07	2026-02-07	\N	0.95	DONE
615	3691	2026-02-19	2026-02-26	8	1	DONE
615	3692	2026-02-19	2026-02-26	8	1	DONE
615	3695	2026-02-22	2026-02-22	\N	0.95	DONE
615	3705	2026-02-22	2026-02-22	\N	0.95	DONE
615	3711	2026-02-07	2026-02-07	\N	0.95	DONE
615	3722	2026-02-21	2026-02-21	\N	0.25	DONE
615	3733	2026-05-19	2026-10-21	155	\N	DONE
615	3734	2026-05-19	2026-05-21	3	1	DONE
615	3735	2026-06-01	2026-10-21	\N	\N	DONE
615	3736	2026-08-06	2026-08-07	2	0.35	DONE
615	3737	2026-08-06	2026-08-06	1	0.35	DONE
615	3738	2026-07-06	2026-07-08	3	0.35	DONE
615	3739	2026-08-06	2026-08-07	2	0.35	DONE
615	3740	2026-08-09	2026-08-09	1	0.35	DONE
615	3741	2026-08-08	2026-08-08	1	0.35	DONE
615	3742	2026-07-06	2026-10-17	\N	\N	DONE
615	3749	2026-08-31	2026-08-31	1	0.35	DONE
615	3750	2026-08-31	2026-08-31	1	0.35	DONE
615	3751	2026-08-31	2026-08-31	1	0	DONE
615	3752	2026-10-15	2026-10-15	1	0.35	DONE
615	3753	2026-10-17	2026-10-17	1	0	DONE
615	3754	2026-08-23	2026-08-24	2	1	DONE
615	3755	2026-08-26	2026-08-27	2	0	DONE
615	3756	2026-08-29	2026-08-30	2	0.35	DONE
615	3757	2026-08-23	2026-08-31	9	1	DONE
615	3758	2026-09-02	2026-09-07	6	0.8	DONE
615	3759	2026-08-23	2026-08-30	8	1	DONE
615	3760	2026-09-01	2026-09-05	5	0.8	DONE
615	3761	2026-07-12	2026-07-23	12	1	DONE
615	3762	2026-07-25	2026-07-31	7	0.8	DONE
615	3763	2026-11-02	2026-11-02	1	0	DONE
615	3770	2026-08-23	2026-08-25	3	1	DONE
615	3771	2026-09-02	2026-09-04	3	0.8	DONE
615	3772	2026-09-02	2026-09-02	1	1	DONE
615	3773	2026-09-09	2026-09-09	1	0	DONE
615	3774	2026-09-01	2026-09-01	1	1	DONE
615	3775	2026-09-07	2026-09-07	1	0	DONE
615	3779	2026-08-23	2026-08-29	7	1	DONE
615	3780	2026-08-31	2026-09-03	4	0.25	DONE
615	3781	2026-08-23	2026-08-24	2	1	DONE
615	3782	2026-08-31	2026-08-31	1	0.25	DONE
615	3783	2026-10-27	2026-10-28	2	1	DONE
615	3784	2026-10-30	2026-10-31	2	0.35	DONE
615	3786	2026-05-19	2026-10-21	155	\N	DONE
615	3787	2026-05-19	2026-05-21	3	1	DONE
615	3788	2026-06-18	2026-10-21	\N	\N	DONE
615	3789	2026-08-09	2026-08-10	2	0	DONE
615	3790	2026-08-12	2026-08-12	1	0	DONE
615	3791	2026-08-09	2026-08-10	2	0	DONE
615	3792	2026-08-12	2026-08-12	1	0	DONE
615	3793	2026-07-15	2026-07-17	3	0	DONE
615	3794	2026-08-26	2026-08-26	1	0	DONE
615	3795	2026-07-15	2026-10-06	\N	\N	DONE
615	3801	2026-07-19	2026-07-19	1	0	DONE
615	3802	2026-08-09	2026-08-10	2	0	DONE
615	3803	2026-08-12	2026-08-12	1	0	DONE
615	3804	2026-08-12	2026-08-12	1	0	DONE
615	3805	2026-08-14	2026-08-14	1	0	DONE
615	3806	2026-08-12	2026-08-12	1	0	DONE
615	3807	2026-08-14	2026-08-14	1	0	DONE
615	3808	2026-08-23	2026-08-23	1	0	DONE
615	3809	2026-08-25	2026-08-25	1	0	DONE
615	3810	2026-08-22	2026-08-22	1	0	DONE
615	3811	2026-08-24	2026-08-24	1	0	DONE
615	3812	2026-08-26	2026-08-26	1	0	DONE
615	3814	2026-10-04	2026-10-04	1	0	DONE
615	3815	2026-10-04	2026-10-04	1	0	DONE
615	3816	2026-10-06	2026-10-06	1	0	DONE
615	3817	2026-08-23	2026-08-23	1	0	DONE
615	3818	2026-08-25	2026-08-25	1	0	DONE
615	3819	2026-08-22	2026-08-22	1	0	DONE
615	3820	2026-08-09	2026-08-10	2	0	DONE
615	3821	2026-08-12	2026-08-12	1	0	DONE
615	3822	2026-08-09	2026-08-10	2	0	DONE
615	3823	2026-08-12	2026-08-12	1	0	DONE
615	3824	2026-07-15	2026-07-17	3	0	DONE
615	3825	2026-07-19	2026-07-19	1	0	DONE
615	3826	2026-07-15	2026-10-06	\N	\N	DONE
615	3833	2026-08-09	2026-08-10	2	0	DONE
615	3834	2026-08-12	2026-08-12	1	0	DONE
615	3835	2026-08-12	2026-08-12	1	0	DONE
615	3836	2026-08-14	2026-08-14	1	0	DONE
615	3837	2026-08-12	2026-08-12	1	0	DONE
615	3838	2026-08-14	2026-08-14	1	0	DONE
615	3842	2026-08-24	2026-08-24	1	0	DONE
615	3843	2026-08-26	2026-08-26	1	0	DONE
615	3844	2026-08-26	2026-08-26	1	0	DONE
615	3845	2026-10-04	2026-10-04	1	0	DONE
615	3846	2026-10-04	2026-10-04	1	0	DONE
615	3847	2026-10-06	2026-10-06	1	0	DONE
615	3848	2026-01-29	2026-11-22	297	0.2	DONE
615	3849	2026-05-19	2026-05-21	3	1	DONE
615	3850	2026-01-29	2026-08-04	\N	0.2	DONE
615	3851	2026-06-03	2026-06-04	2	1	DONE
615	3852	2026-06-03	2026-06-03	1	1	DONE
615	3853	2026-04-22	2026-04-23	2	0.85	DONE
615	3854	2026-08-01	2026-08-01	1	0.1	DONE
615	3855	2026-08-04	2026-08-04	1	0	DONE
615	3856	2026-04-22	2026-11-22	\N	\N	DONE
615	3860	2026-06-03	2026-06-03	1	0.85	DONE
615	3861	2026-11-22	2026-11-22	1	0.15	DONE
615	3863	2026-05-19	2026-10-21	155	0.5	DONE
615	3864	2026-05-19	2026-05-21	3	1	DONE
615	3865	2026-06-01	2026-10-21	\N	\N	DONE
615	3866	2026-08-06	2026-08-07	2	0.35	DONE
615	3867	2026-08-06	2026-08-06	1	0.35	DONE
615	3868	2026-07-06	2026-07-08	3	0.35	DONE
615	3869	2026-08-06	2026-08-07	2	0.35	DONE
615	3870	2026-08-09	2026-08-09	1	0.35	DONE
615	3871	2026-08-08	2026-08-08	1	0.35	DONE
615	3872	2026-07-06	2026-10-17	\N	\N	DONE
615	3879	2026-08-31	2026-08-31	1	0.35	DONE
615	3880	2026-08-31	2026-08-31	1	0.35	DONE
615	3881	2026-08-31	2026-08-31	1	0	DONE
615	3882	2026-10-15	2026-10-15	1	0.35	DONE
615	3883	2026-10-17	2026-10-17	1	0	DONE
615	4766	2026-01-19	2026-07-29	\N	0	PENDING
615	4767	2026-01-19	2026-07-17	\N	0	PENDING
615	4768	2026-01-19	2026-01-20	2	0.65	IN_PROGRESS
615	4769	2026-02-23	2026-03-04	10	0.8	IN_PROGRESS
615	4770	2026-02-07	2026-02-26	20	0.9	IN_PROGRESS
615	4771	2026-05-08	2026-06-07	31	0	PENDING
615	4772	2026-06-28	2026-07-12	15	0	PENDING
615	4773	2026-03-29	2026-03-29	\N	0	PENDING
615	4774	2026-05-01	2026-05-30	30	0	PENDING
615	4775	2026-03-29	2026-03-29	\N	0	PENDING
615	4776	2026-03-29	2026-04-17	20	0	PENDING
615	4777	2026-04-17	2026-04-19	3	0	PENDING
615	4778	2026-04-23	2026-05-12	20	0	PENDING
615	4779	2026-05-12	2026-05-12	1	0	PENDING
615	4780	2026-05-08	2026-05-08	\N	0	PENDING
615	4781	2026-05-08	2026-05-27	20	0	PENDING
615	4782	2026-05-25	2026-05-27	3	0	PENDING
615	4783	2026-06-04	2026-06-23	20	0	PENDING
615	4784	2026-06-24	2026-06-24	1	0	PENDING
615	4785	2026-05-23	2026-05-23	\N	0	PENDING
615	4786	2026-06-04	2026-06-23	20	0	PENDING
615	4787	2026-05-23	2026-05-25	3	0	PENDING
615	4788	2026-06-27	2026-07-11	15	0	PENDING
615	4789	2026-07-17	2026-07-17	1	0	PENDING
615	4790	2026-06-11	2026-06-11	\N	0	PENDING
615	4791	2026-06-11	2026-06-30	20	0	PENDING
615	4792	2026-03-29	2026-07-29	\N	0.5	PENDING
615	4793	2026-07-02	2026-07-16	15	0	PENDING
615	4794	2026-07-17	2026-07-17	1	0	PENDING
615	4796	\N	\N	\N	\N	PENDING
615	4797	2026-06-20	2026-06-20	1	0	PENDING
615	4798	2026-06-22	2026-06-24	3	0	PENDING
615	4799	2026-03-29	2026-03-29	1	0	PENDING
615	4800	2026-04-08	2026-04-10	3	0	PENDING
615	4801	2026-06-20	2026-06-21	2	0	PENDING
615	4802	2026-06-23	2026-06-25	3	0	PENDING
615	4803	2026-05-01	2026-05-01	1	0	PENDING
615	4804	2026-05-03	2026-05-05	3	0	PENDING
615	4805	2026-06-22	2026-06-23	2	0	PENDING
615	4806	2026-06-26	2026-06-27	2	0	PENDING
615	4807	2026-03-31	2026-03-31	1	0	PENDING
615	4808	2026-04-12	2026-04-12	1	0	PENDING
615	4809	2026-06-23	2026-06-25	3	0	PENDING
615	4810	2026-06-27	2026-06-28	2	0	PENDING
615	4811	2026-06-23	2026-06-23	1	0	PENDING
615	4812	2026-06-25	2026-06-28	4	0	PENDING
615	4813	2026-06-30	2026-06-30	1	0	PENDING
615	4814	2026-07-02	2026-07-03	2	0	PENDING
615	4815	2026-06-25	2026-06-25	1	0	PENDING
615	4816	2026-06-30	2026-06-30	1	0	PENDING
615	4817	2026-07-19	2026-07-19	1	0	PENDING
615	4818	\N	\N	\N	\N	PENDING
615	4819	2026-06-20	2026-06-20	1	0	PENDING
615	4820	2026-06-20	2026-06-22	3	0	PENDING
615	4821	2026-03-29	2026-03-29	1	0	PENDING
615	4822	2026-03-29	2026-03-30	2	0	PENDING
615	4823	2026-06-20	2026-06-21	2	0	PENDING
615	4824	2026-06-20	2026-06-21	2	0	PENDING
615	4825	2026-05-01	2026-05-02	2	0	PENDING
615	4826	2026-05-01	2026-05-03	3	0	PENDING
615	4827	2026-06-21	2026-06-23	3	0	PENDING
615	4828	2026-06-24	2026-06-24	1	0	PENDING
615	4829	2026-03-30	2026-03-31	2	0	PENDING
615	4830	2026-04-01	2026-04-01	1	0	PENDING
615	4831	2026-04-01	2026-04-02	2	0	PENDING
615	4832	2026-04-22	2026-04-22	1	0	PENDING
615	4833	2026-06-20	2026-06-21	2	0	PENDING
615	4834	2026-06-21	2026-06-22	2	0	PENDING
615	4835	2026-06-21	2026-06-23	3	0	PENDING
615	4836	2026-06-24	2026-06-24	1	0	PENDING
615	4837	2026-06-21	2026-06-22	2	0	PENDING
615	4838	2026-06-26	2026-06-26	1	0	PENDING
615	4839	2026-07-29	2026-07-29	1	0	PENDING
615	4840	\N	\N	\N	\N	PENDING
615	4841	2026-06-20	2026-06-21	2	0	PENDING
615	4842	2026-06-23	2026-06-24	2	0	PENDING
615	4843	2026-03-29	2026-03-30	2	0	PENDING
615	4844	2026-04-01	2026-04-02	2	0	PENDING
615	4845	2026-06-20	2026-06-21	2	0	PENDING
615	4846	2026-06-21	2026-06-22	2	0	PENDING
615	4847	2026-05-01	2026-05-02	2	0	PENDING
615	4848	2026-05-04	2026-05-06	3	0	PENDING
615	4849	2026-06-23	2026-06-23	1	0	PENDING
615	4850	2026-06-26	2026-06-26	1	0	PENDING
615	4851	2026-04-01	2026-04-01	1	0	PENDING
615	4852	2026-04-04	2026-04-04	1	0	PENDING
615	4853	2026-04-01	2026-04-01	1	0	PENDING
615	4854	2026-04-22	2026-04-23	2	0	PENDING
615	4855	2026-06-25	2026-06-25	1	0	PENDING
615	4856	2026-06-28	2026-06-29	2	0	PENDING
615	4857	2026-06-27	2026-06-27	1	0	PENDING
615	4858	2026-06-29	2026-06-29	1	0	PENDING
615	4859	2026-07-15	2026-07-15	1	0	PENDING
615	4860	2026-07-17	2026-07-17	1	0	PENDING
615	4861	2026-07-19	2026-07-19	1	0	PENDING
615	4862	\N	\N	\N	\N	PENDING
615	4863	2026-06-20	2026-06-21	2	0	PENDING
615	4864	2026-06-23	2026-06-27	5	0	PENDING
615	4865	2026-06-29	2026-07-03	5	0	PENDING
615	4866	2026-03-29	2026-03-29	1	0	PENDING
615	4867	2026-03-31	2026-04-04	5	0	PENDING
615	4868	2026-04-06	2026-04-10	5	0	PENDING
615	4869	2026-06-20	2026-06-21	2	0	PENDING
615	4870	2026-06-23	2026-06-27	5	0	PENDING
615	4871	2026-06-29	2026-07-03	5	0	PENDING
615	4872	2026-06-23	2026-06-23	1	0	PENDING
615	4873	2026-06-29	2026-06-29	1	0	PENDING
615	4874	2026-07-05	2026-07-05	1	0	PENDING
615	4875	2026-03-31	2026-03-31	1	0	PENDING
615	4876	2026-04-06	2026-04-06	1	0	PENDING
615	4877	2026-04-12	2026-04-12	1	0	PENDING
615	4878	2026-07-05	2026-07-06	2	0	PENDING
615	4879	2026-07-05	2026-07-06	2	0	PENDING
615	4880	2026-07-08	2026-07-09	2	0	PENDING
615	4881	2026-07-05	2026-07-06	2	0	PENDING
615	4882	2026-07-07	2026-07-09	3	0	PENDING
615	4883	2026-07-10	2026-07-12	3	0	PENDING
615	4884	2026-07-05	2026-07-05	1	0	PENDING
615	4885	2026-07-07	2026-07-07	1	0	PENDING
615	4886	2026-07-09	2026-07-09	1	0	PENDING
615	4887	2026-07-14	2026-07-14	1	0	PENDING
615	4888	2026-03-12	2026-10-11	\N	\N	PENDING
615	4889	2026-03-12	2026-10-11	\N	\N	PENDING
615	4890	2026-06-16	2026-07-05	20	\N	PENDING
615	4891	2026-03-12	2026-03-16	5	0.05	IN_PROGRESS
615	4892	2026-06-23	2026-07-02	10	\N	PENDING
615	4893	2026-03-17	2026-03-26	10	\N	PENDING
615	4894	2026-09-16	2026-10-10	25	\N	PENDING
615	4895	2026-10-02	2026-10-11	10	\N	PENDING
615	4896	2026-05-29	2026-08-13	\N	\N	PENDING
615	4897	2026-05-29	2026-05-30	2	\N	PENDING
615	4898	2026-05-29	2026-05-29	1	\N	PENDING
615	4899	2026-06-17	2026-06-18	2	\N	PENDING
615	4900	2026-06-01	2026-06-02	2	\N	PENDING
615	4901	2026-06-01	2026-06-01	1	\N	PENDING
615	4902	2026-05-31	2026-05-31	1	\N	PENDING
615	4903	2026-06-20	2026-06-20	1	\N	PENDING
615	4904	2026-06-01	2026-06-01	1	\N	PENDING
615	4905	2026-06-02	2026-06-02	1	\N	PENDING
615	4906	2026-08-12	2026-08-12	1	\N	PENDING
615	4907	2026-08-13	2026-08-13	1	\N	PENDING
615	4908	2026-04-06	2026-10-13	\N	\N	PENDING
615	4909	2026-04-06	2026-10-13	\N	\N	PENDING
615	4910	2026-06-23	2026-07-12	20	0	PENDING
615	4911	2026-04-06	2026-04-10	5	0	PENDING
615	4912	2026-07-05	2026-07-14	10	0	PENDING
615	4913	2026-04-11	2026-04-20	10	0	PENDING
615	4914	2026-09-29	2026-10-13	15	0	PENDING
615	4915	2026-10-04	2026-10-13	10	0	PENDING
615	4916	2026-05-29	2026-08-13	\N	\N	PENDING
615	4917	2026-05-29	2026-05-30	2	0	PENDING
615	4918	2026-05-29	2026-05-29	1	0	PENDING
615	4919	2026-06-17	2026-06-20	4	0	PENDING
615	4920	2026-06-01	2026-06-02	2	0	PENDING
615	4921	2026-06-01	2026-06-01	1	0	PENDING
615	4922	2026-05-31	2026-05-31	1	0	PENDING
615	4923	2026-06-22	2026-06-22	1	0	PENDING
615	4924	2026-06-01	2026-06-01	1	0	PENDING
615	4925	2026-06-02	2026-06-02	1	0	PENDING
615	4926	2026-08-12	2026-08-12	1	0	PENDING
615	4927	2026-08-13	2026-08-13	1	0	PENDING
615	4928	2026-05-12	2026-09-26	\N	\N	PENDING
615	4929	2026-05-12	2026-09-26	\N	\N	PENDING
615	4930	2026-06-23	2026-07-02	10	0	PENDING
615	4931	2026-05-12	2026-05-16	5	0	PENDING
615	4932	2026-07-03	2026-07-05	3	0	PENDING
615	4933	2026-05-18	2026-05-20	3	0	PENDING
615	4934	2026-09-20	2026-09-26	7	0	PENDING
615	4935	2026-09-24	2026-09-26	3	0	PENDING
615	4936	2026-05-22	2026-09-23	\N	\N	PENDING
615	4937	2026-06-23	2026-06-24	2	0	PENDING
615	4938	2026-06-23	2026-06-23	1	0	PENDING
615	4939	2026-05-22	2026-05-24	3	0	PENDING
615	4940	2026-06-23	2026-06-24	2	0	PENDING
615	4941	2026-06-26	2026-06-26	1	0	PENDING
615	4942	2026-06-25	2026-06-25	1	0	PENDING
615	4943	2026-07-18	2026-07-18	1	0	PENDING
615	4944	2026-07-18	2026-07-18	1	0	PENDING
615	4945	2026-07-19	2026-07-19	1	0	PENDING
615	4946	2026-09-21	2026-09-21	1	0	PENDING
615	4947	2026-09-23	2026-09-23	1	0	PENDING
615	4948	2026-05-12	2026-09-26	\N	\N	PENDING
615	4949	2026-06-23	2026-07-02	10	0	PENDING
615	4950	2026-05-12	2026-05-16	5	0	PENDING
615	4951	2026-07-03	2026-07-05	3	0	PENDING
615	4952	2026-05-18	2026-05-20	3	0	PENDING
615	4953	2026-09-20	2026-09-26	7	0	PENDING
615	4954	2026-09-24	2026-09-26	3	0	PENDING
615	4955	2026-06-02	2026-10-04	\N	\N	PENDING
615	4956	2026-07-04	2026-07-05	2	0	PENDING
615	4957	2026-07-04	2026-07-04	1	0	PENDING
615	4958	2026-06-02	2026-06-04	3	0	PENDING
615	4959	2026-07-04	2026-07-05	2	0	PENDING
615	4960	2026-07-07	2026-07-07	1	0	PENDING
615	4961	2026-07-06	2026-07-06	1	0	PENDING
615	4962	2026-07-29	2026-07-29	1	0	PENDING
615	4963	2026-07-29	2026-07-29	1	0	PENDING
615	4964	2026-07-29	2026-07-29	1	0	PENDING
615	4965	2026-10-02	2026-10-02	1	0	PENDING
615	4966	2026-10-04	2026-10-04	1	0	PENDING
615	4967	2026-02-14	2026-10-12	\N	\N	PENDING
615	4968	2026-02-14	2026-10-12	\N	\N	PENDING
615	4969	2026-06-02	2026-06-11	10	0	PENDING
615	4970	2026-02-14	2026-02-18	5	0	PENDING
615	4971	2026-06-12	2026-06-14	3	0	PENDING
615	4972	2026-06-15	2026-06-17	3	0	PENDING
615	4973	2026-09-28	2026-10-12	15	0	PENDING
615	4974	2026-10-10	2026-10-12	3	0	PENDING
615	4975	2026-05-07	2026-08-14	\N	\N	PENDING
615	4976	\N	\N	\N	\N	PENDING
615	4977	2026-06-12	2026-06-13	2	0	PENDING
615	4978	2026-06-12	2026-06-12	1	0	PENDING
615	4979	2026-05-07	2026-05-08	2	0	PENDING
615	4980	2026-06-12	2026-06-13	2	0	PENDING
615	4981	2026-06-15	2026-06-15	1	0	PENDING
615	4982	2026-06-14	2026-06-14	1	0	PENDING
615	4983	2026-05-10	2026-05-10	1	0	PENDING
615	4984	2026-06-15	2026-06-15	1	0	PENDING
615	4985	2026-06-17	2026-06-17	1	0	PENDING
615	4986	2026-08-12	2026-08-12	1	0	PENDING
615	4987	2026-08-14	2026-08-14	1	0	PENDING
615	4988	\N	\N	\N	\N	PENDING
615	4989	2026-06-12	2026-06-13	2	0	PENDING
615	4990	2026-06-12	2026-06-12	1	0	PENDING
615	4991	2026-05-07	2026-05-08	2	0	PENDING
615	4992	2026-06-12	2026-06-13	2	0	PENDING
615	4993	2026-06-15	2026-06-15	1	0	PENDING
615	4994	2026-06-14	2026-06-14	1	0	PENDING
615	4995	2026-05-10	2026-05-10	1	0	PENDING
615	4996	2026-06-15	2026-06-15	1	0	PENDING
615	4997	2026-06-17	2026-06-17	1	0	PENDING
615	4998	2026-08-12	2026-08-12	1	0	PENDING
615	4999	2026-08-14	2026-08-14	1	0	PENDING
615	5000	2026-04-20	2026-10-17	\N	\N	PENDING
615	5001	2026-04-20	2026-10-17	\N	\N	PENDING
615	5002	2026-07-01	2026-07-15	15	0	PENDING
615	5003	2026-04-20	2026-04-24	5	0	PENDING
615	5004	2026-09-25	2026-09-27	3	0	PENDING
615	5005	2026-09-25	2026-09-27	3	0	PENDING
615	5006	2026-09-22	2026-10-01	10	0	PENDING
615	5007	2026-09-30	2026-10-02	3	0	PENDING
615	5008	2026-05-15	2026-05-15	\N	\N	PENDING
615	5009	2026-07-26	2026-07-26	1	0	PENDING
615	5010	2026-07-19	2026-07-19	1	0	PENDING
615	5011	2026-07-16	2026-07-17	2	0	PENDING
615	5012	2026-07-26	2026-07-26	1	0	PENDING
615	5013	2026-07-28	2026-07-28	1	0	PENDING
615	5014	2026-07-21	2026-07-21	1	0	PENDING
615	5015	2026-07-16	2026-09-16	\N	\N	PENDING
615	5022	2026-07-30	2026-07-30	1	0	PENDING
615	5023	2026-07-30	2026-07-30	1	0	PENDING
615	5024	2026-07-31	2026-07-31	1	0	PENDING
615	5025	2026-09-14	2026-09-14	1	0	PENDING
615	5026	2026-09-16	2026-09-16	1	0	PENDING
615	5027	2026-05-09	2026-10-17	\N	\N	PENDING
615	5028	2026-05-09	2026-10-08	\N	\N	PENDING
615	5029	2026-07-04	2026-07-13	10	0	PENDING
615	5030	2026-05-09	2026-05-13	5	0	PENDING
615	5031	2026-07-14	2026-07-16	3	0	PENDING
615	5032	2026-05-14	2026-05-16	3	0	PENDING
615	5033	2026-10-02	2026-10-08	7	0	PENDING
615	5034	2026-10-06	2026-10-08	3	0	PENDING
615	5035	2026-07-06	2026-10-17	\N	\N	PENDING
615	5036	2026-08-06	2026-08-07	2	0	PENDING
615	5037	2026-08-06	2026-08-06	1	0	PENDING
615	5038	2026-07-06	2026-07-08	3	0	PENDING
615	5039	2026-08-06	2026-08-07	2	0	PENDING
615	5040	2026-08-09	2026-08-09	1	0	PENDING
615	5041	2026-08-08	2026-08-08	1	0	PENDING
615	5042	2026-08-31	2026-08-31	1	0	PENDING
615	5043	2026-08-31	2026-08-31	1	0	PENDING
615	5044	2026-08-31	2026-08-31	1	0	PENDING
615	5045	2026-10-15	2026-10-15	1	0	PENDING
615	5046	2026-10-17	2026-10-17	1	0	PENDING
615	5047	2026-05-12	2026-09-17	\N	\N	PENDING
615	5048	2026-05-12	2026-09-17	\N	\N	PENDING
615	5049	2026-05-12	2026-05-31	20	0	PENDING
615	5050	2026-05-31	2026-06-04	5	0	PENDING
615	5051	2026-06-01	2026-06-07	7	0	PENDING
615	5052	2026-06-05	2026-06-11	7	0	PENDING
615	5053	2026-08-29	2026-09-17	20	0	PENDING
615	5054	2026-09-11	2026-09-17	7	0	PENDING
615	5055	2026-06-01	2026-08-22	\N	\N	PENDING
615	5056	2026-06-06	2026-06-07	2	0	PENDING
615	5057	2026-06-09	2026-06-09	1	0	PENDING
615	5058	2026-06-01	2026-06-05	5	0	PENDING
615	5059	2026-06-06	2026-06-06	1	0	PENDING
615	5060	2026-06-09	2026-06-09	1	0	PENDING
615	5061	2026-06-11	2026-06-11	1	0	PENDING
615	5062	2026-06-07	2026-06-07	1	0	PENDING
615	5063	2026-06-07	2026-06-07	1	0	PENDING
615	5064	2026-06-07	2026-06-07	1	0	PENDING
615	5065	2026-08-20	2026-08-20	1	0	PENDING
615	5066	2026-08-22	2026-08-22	1	0	PENDING
615	5067	2026-03-26	2026-09-02	\N	\N	PENDING
615	5068	2026-03-26	2026-09-02	\N	\N	PENDING
615	5069	2026-06-08	2026-07-02	25	0	PENDING
615	5070	2026-03-26	2026-03-30	5	0	PENDING
615	5071	2026-07-03	2026-07-05	3	0	PENDING
615	5072	2026-03-31	2026-04-02	3	0	PENDING
615	5073	2026-08-27	2026-09-02	7	0	PENDING
615	5074	2026-08-31	2026-09-02	3	0	PENDING
615	5075	2026-06-01	2026-08-22	\N	\N	PENDING
615	5076	2026-06-06	2026-06-07	2	0	PENDING
615	5077	2026-06-09	2026-06-09	1	0	PENDING
615	5078	2026-06-01	2026-06-03	3	0	PENDING
615	5079	2026-06-06	2026-06-07	2	0	PENDING
615	5080	2026-06-09	2026-06-09	1	0	PENDING
615	5081	2026-06-11	2026-06-11	1	0	PENDING
615	5082	2026-06-05	2026-06-05	1	0	PENDING
615	5083	2026-06-05	2026-06-05	1	0	PENDING
615	5084	2026-06-05	2026-06-05	1	0	PENDING
615	5085	2026-08-20	2026-08-20	1	0	PENDING
615	5086	2026-08-22	2026-08-22	1	0	PENDING
615	5087	2026-02-07	2026-11-02	\N	\N	PENDING
615	5088	2026-02-07	2026-11-02	\N	\N	PENDING
615	5089	2026-02-07	2026-04-17	70	0	PENDING
615	5090	2026-02-16	2026-06-05	110	0	PENDING
615	5091	2026-05-28	2026-07-11	45	0	PENDING
615	5092	2026-03-23	2026-06-10	80	0	PENDING
615	5093	2026-07-02	2026-10-09	100	0	PENDING
615	5094	2026-02-07	2026-02-07	\N	0	PENDING
615	5095	2026-02-07	2026-04-02	55	0	PENDING
615	5096	2026-02-14	2026-04-04	50	0	PENDING
615	5097	2026-05-28	2026-07-31	65	0	PENDING
615	5098	2026-03-23	2026-04-06	15	0	PENDING
615	5099	2026-08-01	2026-09-29	60	0	PENDING
615	5100	2026-02-21	2026-02-21	\N	0	PENDING
615	5101	2026-02-21	2026-04-21	60	0	PENDING
615	5102	2026-03-03	2026-07-25	145	0	PENDING
615	5103	2026-07-03	2026-09-10	70	0	PENDING
615	5104	2026-07-14	2026-09-16	65	0	PENDING
615	5105	2026-08-10	2026-10-08	60	0	PENDING
615	5106	2026-02-11	2026-02-11	\N	0	PENDING
615	5107	2026-02-11	2026-03-17	35	0	PENDING
615	5108	2026-03-08	2026-06-05	90	0	PENDING
615	5109	2026-04-13	2026-06-11	60	0	PENDING
615	5110	2026-04-10	2026-06-13	65	0	PENDING
615	5111	2026-06-15	2026-08-03	50	0	PENDING
615	5112	2026-02-07	2026-02-07	\N	0	PENDING
615	5113	2026-02-07	2026-03-23	45	0.2	IN_PROGRESS
615	5114	2026-03-04	2026-06-26	115	0.2	IN_PROGRESS
615	5115	2026-06-17	2026-09-04	80	0	PENDING
615	5116	2026-06-28	2026-09-05	70	0	PENDING
615	5117	2026-02-07	2026-03-23	45	0	PENDING
615	5118	2026-03-04	2026-06-26	115	0	PENDING
615	5119	2026-06-17	2026-09-04	80	0	PENDING
615	5120	2026-06-28	2026-09-05	70	0	PENDING
615	5121	2026-08-28	2026-11-02	67	0	PENDING
615	5122	2026-02-17	2026-02-21	5	0.7058824	IN_PROGRESS
615	5123	2026-02-19	2026-02-26	8	0.1	IN_PROGRESS
615	5124	2026-02-19	2026-02-26	8	0	PENDING
615	5125	2026-02-24	2026-03-03	8	0	PENDING
615	5126	2026-02-22	2026-02-22	\N	0	PENDING
615	5127	2026-02-07	2026-03-23	45	0.6	IN_PROGRESS
615	5128	2026-03-04	2026-06-26	115	0.6	IN_PROGRESS
615	5129	2026-06-17	2026-09-04	80	0	PENDING
615	5130	2026-06-28	2026-09-05	70	0	PENDING
615	5131	2026-02-07	2026-03-23	45	0.5	IN_PROGRESS
615	5132	2026-03-04	2026-06-26	115	0.5	IN_PROGRESS
615	5133	2026-06-17	2026-09-04	80	0	PENDING
615	5134	2026-06-28	2026-09-05	70	0	PENDING
615	5135	2026-08-28	2026-11-02	67	0	PENDING
615	5136	2026-02-22	2026-02-22	\N	0	PENDING
615	5137	2026-02-22	2026-03-23	30	0	PENDING
615	5138	2026-03-19	2026-05-17	60	0	PENDING
615	5139	2026-05-23	2026-07-16	55	0	PENDING
615	5140	2026-06-02	2026-07-18	47	0	PENDING
615	5141	2026-06-22	2026-07-27	36	0	PENDING
615	5142	2026-02-07	2026-02-07	\N	0	PENDING
615	5143	2026-02-12	2026-03-18	35	0	PENDING
615	5144	2026-03-09	2026-06-01	85	0	PENDING
615	5145	2026-05-23	2026-07-26	65	0	PENDING
615	5146	2026-05-28	2026-07-26	60	0	PENDING
615	5147	2026-07-09	2026-09-11	65	0	PENDING
615	5148	2026-02-12	2026-02-12	\N	0	PENDING
615	5154	2026-06-01	2026-06-01	\N	0	PENDING
615	5155	2026-06-11	2026-06-12	2	0	PENDING
615	5156	2026-06-09	2026-06-09	1	0	PENDING
615	5157	2026-06-01	2026-06-05	5	0	PENDING
615	5158	2026-06-06	2026-06-06	1	0	PENDING
615	5159	2026-06-09	2026-06-09	1	0	PENDING
615	5160	2026-06-11	2026-06-11	1	0	PENDING
615	5161	2026-06-07	2026-06-07	1	0	PENDING
615	5162	2026-06-07	2026-06-07	1	0	PENDING
615	5163	2026-06-07	2026-06-07	1	0	PENDING
615	5164	2026-08-20	2026-08-20	1	0	PENDING
615	5165	2026-08-22	2026-08-22	1	0	PENDING
615	5166	2026-06-01	2026-10-21	\N	\N	PENDING
615	5167	2026-06-01	2026-10-21	\N	\N	PENDING
615	5168	2026-08-06	2026-08-15	10	0	PENDING
615	5169	2026-06-01	2026-06-05	5	0	PENDING
615	5170	2026-08-16	2026-08-18	3	0	PENDING
615	5171	2026-06-06	2026-06-08	3	0	PENDING
615	5172	2026-10-15	2026-10-21	7	0	PENDING
615	5173	2026-10-19	2026-10-21	3	0	PENDING
615	5174	2026-07-06	2026-10-17	\N	\N	PENDING
615	5175	2026-08-06	2026-08-07	2	0	PENDING
615	5176	2026-08-06	2026-08-06	1	0	PENDING
615	5177	2026-07-06	2026-07-08	3	0	PENDING
615	5178	2026-08-06	2026-08-07	2	0	PENDING
615	5179	2026-08-09	2026-08-09	1	0	PENDING
615	5180	2026-08-08	2026-08-08	1	0	PENDING
615	5181	2026-08-31	2026-08-31	1	0	PENDING
615	5182	2026-08-31	2026-08-31	1	0	PENDING
615	5183	2026-08-31	2026-08-31	1	0	PENDING
615	5184	2026-10-15	2026-10-15	1	0	PENDING
615	5185	2026-10-17	2026-10-17	1	0	PENDING
615	5186	2026-04-18	2026-11-02	\N	\N	PENDING
615	5187	2026-04-18	2026-10-24	\N	\N	PENDING
615	5188	2026-08-23	2026-09-01	10	0	PENDING
615	5189	2026-04-18	2026-04-22	5	0	PENDING
615	5190	2026-09-02	2026-09-04	3	0	PENDING
615	5191	2026-04-23	2026-04-25	3	0	PENDING
615	5192	2026-10-17	2026-10-23	7	0	PENDING
615	5193	2026-10-24	2026-10-24	1	0	PENDING
615	5194	2026-07-12	2026-11-02	\N	\N	PENDING
615	5195	2026-08-23	2026-08-31	9	0	PENDING
615	5196	2026-09-02	2026-09-07	6	0	PENDING
615	5197	2026-08-23	2026-08-30	8	0	PENDING
615	5198	2026-09-01	2026-09-05	5	0	PENDING
615	5199	2026-07-12	2026-07-23	12	0	PENDING
615	5200	2026-07-25	2026-07-31	7	0	PENDING
615	5201	2026-08-23	2026-08-25	3	0	PENDING
615	5202	2026-09-02	2026-09-04	3	0	PENDING
615	5203	2026-09-02	2026-09-02	1	0	PENDING
615	5204	2026-09-09	2026-09-09	1	0	PENDING
615	5205	2026-09-01	2026-09-01	1	0	PENDING
615	5206	2026-09-07	2026-09-07	1	0	PENDING
615	5207	2026-08-23	2026-08-24	2	0	PENDING
615	5208	2026-08-26	2026-08-27	2	0	PENDING
615	5209	2026-08-29	2026-08-30	2	0	PENDING
615	5210	2026-08-23	2026-08-29	7	0	PENDING
615	5211	2026-08-31	2026-09-03	4	0	PENDING
615	5212	2026-08-23	2026-08-24	2	0	PENDING
615	5213	2026-08-31	2026-08-31	1	0	PENDING
615	5214	2026-10-27	2026-10-28	2	0	PENDING
615	5215	2026-10-30	2026-10-31	2	0	PENDING
615	5216	2026-11-02	2026-11-02	1	0	PENDING
615	5217	2026-06-18	2026-10-21	\N	\N	PENDING
615	5218	2026-06-18	2026-10-21	\N	\N	PENDING
615	5219	2026-08-09	2026-08-18	10	0	PENDING
615	5220	2026-06-18	2026-06-22	5	0	PENDING
615	5221	2026-08-19	2026-08-21	3	0	PENDING
615	5222	2026-06-23	2026-06-25	3	0	PENDING
615	5223	2026-10-15	2026-10-21	7	0	PENDING
615	5224	2026-10-19	2026-10-21	3	0	PENDING
615	5225	2026-07-15	2026-10-06	\N	\N	PENDING
615	5226	2026-08-09	2026-08-10	2	0	PENDING
615	5227	2026-08-12	2026-08-12	1	0	PENDING
615	5228	2026-08-09	2026-08-10	2	0	PENDING
615	5229	2026-08-12	2026-08-12	1	0	PENDING
615	5230	2026-07-15	2026-07-17	3	0	PENDING
615	5231	2026-07-19	2026-07-19	1	0	PENDING
615	5232	2026-08-09	2026-08-10	2	0	PENDING
615	5233	2026-08-12	2026-08-12	1	0	PENDING
615	5234	2026-08-12	2026-08-12	1	0	PENDING
615	5235	2026-08-14	2026-08-14	1	0	PENDING
615	5236	2026-08-12	2026-08-12	1	0	PENDING
615	5237	2026-08-14	2026-08-14	1	0	PENDING
615	5238	2026-08-23	2026-08-23	1	0	PENDING
615	5239	2026-08-25	2026-08-25	1	0	PENDING
615	5240	2026-08-22	2026-08-22	1	0	PENDING
615	5241	2026-08-24	2026-08-24	1	0	PENDING
615	5242	2026-08-26	2026-08-26	1	0	PENDING
615	5243	2026-08-26	2026-08-26	1	0	PENDING
615	5244	2026-10-04	2026-10-04	1	0	PENDING
615	5245	2026-10-04	2026-10-04	1	0	PENDING
615	5246	2026-10-06	2026-10-06	1	0	PENDING
615	5247	2026-06-18	2026-10-21	\N	\N	PENDING
615	5248	2026-06-18	2026-10-21	\N	\N	PENDING
615	5249	2026-08-09	2026-08-18	10	0	PENDING
615	5250	2026-06-18	2026-06-22	5	0	PENDING
615	5251	2026-08-19	2026-08-21	3	0	PENDING
615	5252	2026-06-23	2026-06-25	3	0	PENDING
615	5253	2026-10-15	2026-10-21	7	0	PENDING
615	5254	2026-10-19	2026-10-21	3	0	PENDING
615	5255	2026-07-15	2026-10-06	\N	\N	PENDING
615	5256	2026-08-09	2026-08-10	2	0	PENDING
615	5257	2026-08-12	2026-08-12	1	0	PENDING
615	5258	2026-08-09	2026-08-10	2	0	PENDING
615	5259	2026-08-12	2026-08-12	1	0	PENDING
615	5260	2026-07-15	2026-07-17	3	0	PENDING
615	5261	2026-07-19	2026-07-19	1	0	PENDING
615	5262	2026-08-09	2026-08-10	2	0	PENDING
615	5263	2026-08-12	2026-08-12	1	0	PENDING
615	5264	2026-08-12	2026-08-12	1	0	PENDING
615	5265	2026-08-14	2026-08-14	1	0	PENDING
615	5266	2026-08-12	2026-08-12	1	0	PENDING
615	5267	2026-08-14	2026-08-14	1	0	PENDING
615	5268	2026-08-23	2026-08-23	1	0	PENDING
615	5269	2026-08-25	2026-08-25	1	0	PENDING
615	5270	2026-08-22	2026-08-22	1	0	PENDING
615	5271	2026-08-24	2026-08-24	1	0	PENDING
615	5272	2026-08-26	2026-08-26	1	0	PENDING
615	5273	2026-08-26	2026-08-26	1	0	PENDING
615	5274	2026-10-04	2026-10-04	1	0	PENDING
615	5275	2026-10-04	2026-10-04	1	0	PENDING
615	5276	2026-10-06	2026-10-06	1	0	PENDING
615	5277	2026-01-29	2026-08-04	\N	\N	PENDING
615	5278	2026-01-29	2026-08-04	\N	\N	PENDING
615	5279	2026-06-03	2026-06-12	10	0	PENDING
615	5280	2026-01-29	2026-02-02	5	0	PENDING
615	5281	2026-06-13	2026-06-15	3	0	PENDING
615	5282	2026-02-13	2026-02-14	2	0.8	IN_PROGRESS
615	5283	2026-02-08	2026-02-10	3	0	PENDING
615	5284	2026-07-30	2026-08-03	5	0	PENDING
615	5285	2026-08-04	2026-08-04	1	0	PENDING
615	5286	2026-04-22	2026-08-01	\N	\N	PENDING
615	5287	2026-06-03	2026-06-04	2	0	PENDING
615	5288	2026-06-03	2026-06-03	1	0	PENDING
615	5289	2026-04-22	2026-04-23	2	0	PENDING
615	5290	2026-06-03	2026-06-03	1	0	PENDING
615	5291	2026-06-06	2026-06-06	1	0	PENDING
615	5292	2026-06-05	2026-06-05	1	0	PENDING
615	5293	2026-04-25	2026-04-25	1	0	PENDING
615	5294	2026-06-08	2026-06-08	1	0	PENDING
615	5295	2026-06-10	2026-06-10	1	0	PENDING
615	5296	2026-07-30	2026-07-30	1	0	PENDING
615	5297	2026-08-01	2026-08-01	1	0	PENDING
615	5832	\N	\N	\N	\N	PENDING
615	5833	\N	\N	\N	\N	PENDING
615	5834	\N	\N	\N	\N	PENDING
615	5835	\N	\N	\N	\N	PENDING
615	5836	\N	\N	\N	\N	PENDING
615	5837	\N	\N	\N	\N	PENDING
615	5838	\N	\N	\N	\N	PENDING
615	5839	\N	\N	\N	\N	PENDING
615	5840	\N	\N	\N	\N	PENDING
615	5841	\N	\N	\N	0.5	PENDING
615	5842	\N	\N	\N	\N	PENDING
615	5843	\N	\N	\N	\N	PENDING
615	5844	\N	\N	\N	\N	PENDING
615	5845	\N	\N	\N	\N	PENDING
615	5846	\N	\N	\N	\N	PENDING
615	5847	\N	\N	\N	\N	PENDING
615	5848	\N	\N	\N	\N	PENDING
615	5849	\N	\N	\N	\N	PENDING
615	5850	\N	\N	\N	\N	PENDING
615	5851	\N	\N	\N	\N	PENDING
615	5852	\N	\N	\N	\N	PENDING
615	5853	\N	\N	\N	\N	PENDING
615	5854	\N	\N	\N	\N	PENDING
615	5855	\N	\N	\N	\N	PENDING
615	5856	\N	\N	\N	\N	PENDING
615	5857	\N	\N	\N	\N	PENDING
615	5858	\N	\N	\N	\N	PENDING
615	5859	\N	\N	\N	\N	PENDING
615	5860	\N	\N	\N	\N	PENDING
615	5861	\N	\N	\N	\N	PENDING
615	5862	\N	\N	\N	\N	PENDING
615	5863	\N	\N	\N	\N	PENDING
615	5864	\N	\N	\N	\N	PENDING
615	5865	\N	\N	\N	\N	PENDING
615	5866	\N	\N	\N	\N	PENDING
615	5867	\N	\N	\N	\N	PENDING
615	5868	\N	\N	\N	\N	PENDING
615	5869	\N	\N	\N	\N	PENDING
615	5870	\N	\N	\N	\N	PENDING
615	5871	\N	\N	\N	\N	PENDING
615	5872	\N	\N	\N	\N	PENDING
615	5873	\N	\N	\N	\N	PENDING
615	5874	\N	\N	\N	\N	PENDING
615	5875	\N	\N	\N	\N	PENDING
615	5876	\N	\N	\N	\N	PENDING
615	5877	\N	\N	\N	\N	PENDING
615	5878	\N	\N	\N	\N	PENDING
615	5879	\N	\N	\N	\N	PENDING
22	3646	2026-08-10	2026-10-08	60	0.35	DONE
22	3585	2026-08-08	2026-08-08	1	0.15	DONE
22	3790	2026-08-12	2026-08-12	1	0	DONE
22	3753	2026-10-17	2026-10-17	1	0	DONE
22	3559	2026-07-26	2026-07-26	1	1	DONE
22	3787	2026-05-19	2026-05-21	3	1	DONE
22	3578	2026-05-19	2026-05-21	3	1	DONE
22	3863	2026-05-19	2026-10-21	155	\N	DONE
22	3755	2026-08-26	2026-08-27	2	0	DONE
22	3816	2026-10-06	2026-10-06	1	0	DONE
22	3542	2026-08-12	2026-08-12	1	0.9	DONE
22	3597	2026-05-12	2026-09-17	128	\N	DONE
22	3487	2026-05-12	2026-09-26	138	\N	DONE
22	3557	2026-05-19	2026-05-21	3	1	DONE
22	3734	2026-05-19	2026-05-21	3	1	DONE
22	3788	2026-06-18	2026-10-21	126	\N	DONE
22	3460	2026-06-01	2026-06-01	1	1	DONE
22	3881	2026-08-31	2026-08-31	1	0	DONE
22	3737	2026-08-06	2026-08-06	1	0.35	DONE
22	3329	2026-07-07	2026-07-07	1	1	DONE
22	3620	2026-03-26	2026-09-02	161	\N	DONE
22	3464	2026-04-06	2026-10-13	190	\N	DONE
22	3789	2026-08-09	2026-08-10	2	0	DONE
22	3624	2026-06-06	2026-06-07	2	0.35	DONE
22	3462	2026-08-12	2026-08-12	1	1	DONE
22	3599	2026-05-12	2026-09-17	129	\N	DONE
22	3855	2026-08-04	2026-08-04	1	0	DONE
22	3757	2026-08-23	2026-08-31	9	1	DONE
22	3735	2026-06-01	2026-10-21	143	\N	DONE
22	3680	2026-02-07	2026-02-06	0	0.95	DONE
22	3461	2026-06-02	2026-06-02	1	1	DONE
22	3360	2026-06-29	2026-07-03	5	1	DONE
22	3539	2026-05-10	2026-05-10	1	0.9	DONE
22	3447	2026-05-29	2026-05-29	1	1	DONE
22	3617	2026-08-22	2026-08-22	1	0	DONE
22	3324	2026-06-29	2026-07-03	5	1	DONE
22	3489	2026-06-23	2026-06-23	1	0.15	DONE
22	3742	2026-07-06	2026-10-17	104	\N	DONE
22	3513	2026-10-04	2026-10-04	1	0	DONE
22	3444	2026-05-19	2026-05-21	3	1	DONE
22	3449	2026-06-01	2026-06-02	2	1	DONE
22	3814	2026-10-04	2026-10-04	1	0	DONE
22	3528	2026-06-12	2026-06-13	2	0.9	DONE
22	3596	2026-10-17	2026-10-17	1	0	DONE
22	3691	2026-02-19	2026-02-26	8	1	DONE
22	3773	2026-09-09	2026-09-09	1	0	DONE
22	3504	2026-09-21	2026-09-21	1	0.15	DONE
22	3522	2026-02-14	2026-10-12	240	\N	DONE
22	3754	2026-08-23	2026-08-24	2	1	DONE
22	3741	2026-08-08	2026-08-08	1	0.35	DONE
22	3880	2026-08-31	2026-08-31	1	0.35	DONE
22	3623	2026-06-01	2026-06-03	3	0.35	DONE
22	3619	2026-05-19	2026-05-21	3	1	DONE
22	3325	2026-03-29	2026-03-29	1	1	DONE
22	3615	2026-06-07	2026-06-07	1	0.2	DONE
22	3488	2026-06-23	2026-06-24	2	0.15	DONE
22	3321	2026-04-12	2026-04-12	1	1	DONE
22	3627	2026-06-01	2026-08-22	83	\N	DONE
22	3505	2026-09-23	2026-09-23	1	0	DONE
22	3815	2026-10-04	2026-10-04	1	0	DONE
22	3576	2026-09-16	2026-09-16	1	0	DONE
22	3818	2026-08-25	2026-08-25	1	0	DONE
22	3756	2026-08-29	2026-08-30	2	0.35	DONE
22	3577	2026-05-09	2026-10-17	161	\N	DONE
22	3833	2026-08-09	2026-08-10	2	0	DONE
22	3641	2026-02-07	2026-11-02	269	0.95	DONE
22	3575	2026-09-14	2026-09-14	1	1	DONE
22	3472	2026-05-31	2026-05-31	1	1	DONE
22	3763	2026-11-02	2026-11-02	1	0	DONE
22	3526	2026-06-12	2026-06-12	1	0.9	DONE
22	3806	2026-08-12	2026-08-12	1	0	DONE
22	3501	2026-07-18	2026-07-18	1	0.15	DONE
22	3357	2026-04-06	2026-04-10	5	1	DONE
22	3469	2026-06-17	2026-06-20	4	1	DONE
22	3543	2026-08-14	2026-08-14	1	0	DONE
22	3783	2026-10-27	2026-10-28	2	1	DONE
22	3802	2026-08-09	2026-08-10	2	0	DONE
22	3848	2026-01-29	2026-11-22	297	0.2	DONE
22	3635	2026-06-05	2026-06-05	1	0	DONE
22	3506	2026-05-12	2026-12-29	231	\N	DONE
22	3772	2026-09-02	2026-09-02	1	1	DONE
22	3558	2026-04-20	2026-10-02	166	\N	DONE
22	3602	2026-06-01	2026-06-05	5	0.2	DONE
22	3573	2026-07-30	2026-07-30	1	1	DONE
22	3822	2026-08-09	2026-08-10	2	0	DONE
22	3442	2026-07-14	2026-07-14	1	1	DONE
22	3865	2026-06-01	2026-10-21	143	\N	DONE
22	3642	2026-02-21	2026-04-21	60	0.35	DONE
22	3845	2026-10-04	2026-10-04	1	0	DONE
22	3762	2026-07-25	2026-07-31	7	0.8	DONE
22	3751	2026-08-31	2026-08-31	1	0	DONE
22	3448	2026-06-17	2026-06-18	2	1	DONE
22	3345	2026-06-11	2026-06-10	0	1	DONE
22	3514	2026-12-29	2026-12-29	1	0	DONE
22	3692	2026-02-19	2026-02-26	8	1	DONE
22	3480	2026-06-22	2026-06-22	1	1	DONE
22	3811	2026-08-24	2026-08-24	1	0	DONE
22	3648	2026-02-19	2026-02-26	8	0.6	IN_PROGRESS
22	3486	2026-05-19	2026-05-21	3	1	DONE
22	3595	2026-10-15	2026-10-15	1	0.15	DONE
22	3527	2026-05-07	2026-05-08	2	0.9	DONE
22	3750	2026-08-31	2026-08-31	1	0.35	DONE
22	3786	2026-05-19	2026-10-21	155	\N	DONE
22	3512	2026-07-04	2026-07-05	2	0.1	DONE
22	3494	2026-05-22	2026-09-23	125	\N	DONE
22	3574	2026-07-31	2026-07-31	1	0.95	DONE
22	3645	2026-07-14	2026-09-16	65	0.35	DONE
22	3361	2026-06-23	2026-06-23	1	1	DONE
22	3711	2026-02-07	2026-02-06	0	0.95	DONE
22	3869	2026-08-06	2026-08-07	2	0.35	DONE
22	3836	2026-08-14	2026-08-14	1	0	DONE
22	3634	2026-06-05	2026-06-05	1	0	DONE
22	3649	2026-02-19	2026-02-26	8	0.6	IN_PROGRESS
22	3451	2026-05-31	2026-05-31	1	1	DONE
22	3770	2026-08-23	2026-08-25	3	1	DONE
22	3625	2026-06-09	2026-06-09	1	0.35	DONE
22	3860	2026-06-03	2026-06-03	1	0.85	DONE
22	3752	2026-10-15	2026-10-15	1	0.35	DONE
22	3856	2026-04-22	2026-11-22	215	\N	DONE
22	3879	2026-08-31	2026-08-31	1	0.35	DONE
22	3613	2026-06-07	2026-06-07	1	0.2	DONE
22	3872	2026-07-06	2026-10-17	104	\N	DONE
22	3736	2026-08-06	2026-08-07	2	0.35	DONE
22	3466	2026-04-06	2026-10-13	191	\N	DONE
22	3580	2026-08-06	2026-08-07	2	0.15	DONE
22	3616	2026-08-20	2026-08-20	1	0.2	DONE
22	3327	2026-07-10	2026-07-12	3	1	DONE
22	3621	2026-06-06	2026-06-07	2	0.35	DONE
22	3540	2026-06-15	2026-06-15	1	0.9	DONE
22	3780	2026-08-31	2026-09-03	4	0.25	DONE
22	3695	2026-02-22	2026-02-21	0	0.95	DONE
22	3583	2026-08-06	2026-08-07	2	0.15	DONE
22	3864	2026-05-19	2026-05-21	3	1	DONE
22	3821	2026-08-12	2026-08-12	1	0	DONE
22	3601	2026-06-09	2026-06-09	1	0.2	DONE
22	3740	2026-08-09	2026-08-09	1	0.35	DONE
22	3584	2026-08-09	2026-08-09	1	0.15	DONE
22	3467	2026-05-29	2026-05-30	2	1	DONE
22	3722	2026-02-21	2026-02-20	0	0.25	DONE
22	3868	2026-07-06	2026-07-08	3	0.35	DONE
22	3493	2026-06-25	2026-06-25	1	0.15	DONE
22	3791	2026-08-09	2026-08-10	2	0	DONE
22	3618	2026-03-26	2026-09-02	160	\N	DONE
22	3843	2026-08-26	2026-08-26	1	0	DONE
22	3643	2026-03-03	2026-07-25	145	0.35	DONE
22	3468	2026-05-29	2026-05-29	1	1	DONE
22	3417	2026-03-29	2026-03-29	1	1	DONE
22	3563	2026-07-28	2026-07-28	1	1	DONE
22	3473	2026-05-29	2026-08-13	77	\N	DONE
22	3636	2026-06-05	2026-06-05	1	0.35	DONE
22	3870	2026-08-09	2026-08-09	1	0.35	DONE
22	3761	2026-07-12	2026-07-23	12	1	DONE
22	3774	2026-09-01	2026-09-01	1	1	DONE
22	3758	2026-09-02	2026-09-07	6	0.8	DONE
22	3579	2026-05-09	2026-10-08	153	\N	DONE
22	3465	2026-05-19	2026-05-21	3	1	DONE
22	3650	2026-02-24	2026-03-03	8	0.6	IN_PROGRESS
22	3560	2026-07-19	2026-07-19	1	1	DONE
22	3363	2026-07-05	2026-07-05	1	1	DONE
22	3801	2026-07-19	2026-07-19	1	0	DONE
22	3326	2026-03-31	2026-04-04	5	1	DONE
22	3850	2026-01-29	2026-08-04	188	0.2	DONE
22	3844	2026-08-26	2026-08-26	1	0	DONE
22	3561	2026-07-16	2026-07-17	2	1	DONE
22	3445	2026-03-12	2026-10-11	214	\N	DONE
22	3824	2026-07-15	2026-07-17	3	0	DONE
22	3452	2026-05-29	2026-08-13	77	\N	DONE
22	3604	2026-06-09	2026-06-09	1	0.2	DONE
22	3810	2026-08-22	2026-08-22	1	0	DONE
22	3835	2026-08-12	2026-08-12	1	0	DONE
22	3705	2026-02-22	2026-02-21	0	0.95	DONE
22	3359	2026-06-23	2026-06-27	5	1	DONE
22	3883	2026-10-17	2026-10-17	1	0	DONE
22	3564	2026-07-21	2026-07-21	1	1	DONE
22	3606	2026-06-01	2026-08-22	83	\N	DONE
22	3541	2026-06-17	2026-06-17	1	0	DONE
22	3852	2026-06-03	2026-06-03	1	1	DONE
22	3809	2026-08-25	2026-08-25	1	0	DONE
22	3470	2026-06-01	2026-06-02	2	1	DONE
22	3446	2026-05-29	2026-05-30	2	1	DONE
22	3626	2026-06-11	2026-06-11	1	0	DONE
22	3439	2026-07-05	2026-07-05	1	1	DONE
22	3882	2026-10-15	2026-10-15	1	0.35	DONE
22	3395	2026-03-29	2026-03-30	2	1	DONE
22	3849	2026-05-19	2026-05-21	3	1	DONE
22	3510	2026-07-04	2026-07-04	1	0.1	DONE
22	3335	2026-05-08	2026-05-27	20	1	DONE
22	3760	2026-09-01	2026-09-05	5	0.8	DONE
22	3450	2026-06-01	2026-06-01	1	1	DONE
22	3463	2026-08-13	2026-08-13	1	0.35	DONE
22	3652	2026-02-07	2026-02-06	0	0.95	DONE
22	3817	2026-08-23	2026-08-23	1	0	DONE
22	3644	2026-07-03	2026-09-10	70	0.35	DONE
22	3851	2026-06-03	2026-06-04	2	1	DONE
22	3771	2026-09-02	2026-09-04	3	0.8	DONE
22	3795	2026-07-15	2026-10-06	84	\N	DONE
22	3805	2026-08-14	2026-08-14	1	0	DONE
22	3638	2026-08-22	2026-08-22	1	0	DONE
22	3323	2026-06-23	2026-06-27	5	1	DONE
22	3647	2026-02-17	2026-02-21	5	0.6	IN_PROGRESS
22	3370	2026-07-05	2026-07-06	2	1	DONE
22	3320	2026-04-06	2026-04-06	1	1	DONE
22	3871	2026-08-08	2026-08-08	1	0.35	DONE
22	3565	2026-07-16	2026-09-16	63	\N	DONE
22	3368	2026-07-05	2026-07-06	2	1	DONE
22	3485	2026-05-12	2026-09-26	137	\N	DONE
22	3515	2026-06-02	2026-12-29	211	\N	DONE
22	3562	2026-07-26	2026-07-26	1	1	DONE
22	3823	2026-08-12	2026-08-12	1	0	DONE
22	3600	2026-06-06	2026-06-07	2	0.2	DONE
22	3524	2026-02-14	2026-10-12	241	\N	DONE
22	3781	2026-08-23	2026-08-24	2	1	DONE
22	3509	2026-07-04	2026-07-05	2	0.1	DONE
22	3482	2026-06-02	2026-06-02	1	0.95	DONE
22	3459	2026-06-20	2026-06-20	1	1	DONE
22	3803	2026-08-12	2026-08-12	1	0	DONE
22	3622	2026-06-09	2026-06-09	1	0.35	DONE
22	3483	2026-08-12	2026-08-12	1	1	DONE
22	3854	2026-08-01	2026-08-01	1	0.1	DONE
22	3484	2026-08-13	2026-08-13	1	0.4	DONE
22	3367	2026-07-05	2026-07-06	2	1	DONE
22	3319	2026-03-31	2026-03-31	1	1	DONE
22	3322	2026-06-20	2026-06-21	2	1	DONE
22	3586	2026-07-06	2026-10-17	104	\N	DONE
22	3808	2026-08-23	2026-08-23	1	0	DONE
22	3358	2026-06-20	2026-06-21	2	1	DONE
22	3340	2026-05-23	2026-05-22	0	1	DONE
22	3471	2026-06-01	2026-06-01	1	1	DONE
22	3847	2026-10-06	2026-10-06	1	0	DONE
22	3779	2026-08-23	2026-08-29	7	1	DONE
22	3738	2026-07-06	2026-07-08	3	0.35	DONE
22	3812	2026-08-26	2026-08-26	1	0	DONE
22	3784	2026-10-30	2026-10-31	2	0.35	DONE
22	3669	2026-02-11	2026-02-10	0	0.95	DONE
22	3793	2026-07-15	2026-07-17	3	0	DONE
22	3749	2026-08-31	2026-08-31	1	0.35	DONE
22	3556	2026-04-20	2026-10-02	165	\N	DONE
22	3867	2026-08-06	2026-08-06	1	0.35	DONE
22	3362	2026-06-29	2026-06-29	1	1	DONE
22	3531	2026-05-07	2026-08-14	100	\N	DONE
22	3820	2026-08-09	2026-08-10	2	0	DONE
22	3369	2026-07-08	2026-07-09	2	1	DONE
22	3759	2026-08-23	2026-08-30	8	1	DONE
22	3637	2026-08-20	2026-08-20	1	0	DONE
22	3443	2026-03-12	2026-10-11	213	\N	DONE
22	3614	2026-06-07	2026-06-07	1	0.2	DONE
22	3502	2026-07-18	2026-07-18	1	0.15	DONE
22	3739	2026-08-06	2026-08-07	2	0.35	DONE
22	3523	2026-05-19	2026-05-21	3	1	DONE
22	3373	2026-03-29	2026-03-29	1	1	DONE
22	3782	2026-08-31	2026-08-31	1	0.25	DONE
22	3508	2026-05-12	2026-09-26	138	\N	DONE
22	3530	2026-06-14	2026-06-14	1	0.9	DONE
22	3572	2026-07-30	2026-07-30	1	1	DONE
22	3866	2026-08-06	2026-08-07	2	0.35	DONE
22	3792	2026-08-12	2026-08-12	1	0	DONE
22	3582	2026-07-06	2026-07-08	3	0.15	DONE
22	3593	2026-08-31	2026-08-31	1	0.15	DONE
22	3503	2026-07-19	2026-07-19	1	0.15	DONE
22	3491	2026-06-23	2026-06-24	2	0.15	DONE
22	3529	2026-06-15	2026-06-15	1	0.9	DONE
22	3371	2026-07-07	2026-07-09	3	1	DONE
22	3598	2026-05-19	2026-05-21	3	1	DONE
22	3658	2026-02-21	2026-02-20	0	0.95	DONE
22	3775	2026-09-07	2026-09-07	1	0	DONE
22	3581	2026-08-06	2026-08-06	1	0.15	DONE
22	3807	2026-08-14	2026-08-14	1	0	DONE
22	3603	2026-06-06	2026-06-06	1	0.2	DONE
22	3490	2026-05-22	2026-05-24	3	0.15	DONE
22	3804	2026-08-12	2026-08-12	1	0	DONE
22	3492	2026-06-26	2026-06-26	1	0.15	DONE
22	3819	2026-08-22	2026-08-22	1	0	DONE
22	3834	2026-08-12	2026-08-12	1	0	DONE
22	3861	2026-11-22	2026-11-22	1	0.15	DONE
22	3507	2026-05-19	2026-05-21	3	1	DONE
22	3525	2026-06-12	2026-06-13	2	0.9	DONE
22	3794	2026-08-26	2026-08-26	1	0	DONE
22	3846	2026-10-04	2026-10-04	1	0	DONE
22	3605	2026-06-11	2026-06-11	1	0.2	DONE
22	3594	2026-08-31	2026-08-31	1	0	DONE
22	3481	2026-06-01	2026-06-01	1	1	DONE
22	3441	2026-07-09	2026-07-09	1	1	DONE
22	3842	2026-08-24	2026-08-24	1	0	DONE
22	3639	2026-02-24	2026-03-03	8	1	DONE
22	3511	2026-06-02	2026-06-04	3	0.1	DONE
22	3838	2026-08-14	2026-08-14	1	0	DONE
22	3825	2026-07-19	2026-07-19	1	0	DONE
22	3826	2026-07-15	2026-10-06	84	\N	DONE
22	3837	2026-08-12	2026-08-12	1	0	DONE
22	3853	2026-04-22	2026-04-23	2	0.85	DONE
22	3733	2026-05-19	2026-10-21	155	\N	DONE
\.

COMMIT;
