# Jira Sprint Plan - 4 sprint x 1 week

## Context
- Tong thoi gian: 4 tuan
- Team: 3 nguoi
- Rule: moi sprint 1 tuan
- Muc tieu: scope MVP, uu tien High truoc

## Quy uoc assignee
- `A_BE`: Backend lead
- `B_FE`: Frontend lead
- `C_FS_QA`: Fullstack + QA + release

## Quy uoc Story Points (de nhap vao Jira)
- Dung bo Fibonacci: **1, 2, 3, 5, 8, 13**
- `SP` o day la **uoc luong cho ca "Story chunk"** (gom nhieu PB). Trong Jira ban co 2 cach:
  1. **Cach A (de keo-thả):** tao 1 Story/Epic nho cho moi chunk, gan `Story Points = SP` cua chunk.
  2. **Cach B (sat backlog PB):** tach tung PB thanh Story rieng, gan SP nho hon (tong SP ~ bang SP chunk).
- Day la uoc luong tuong doi cho do an 3 nguoi / 1 tuan. Neu team thay qua tai, hay **cat scope** (giam SP) truoc khi tang thoi gian.

## Cau hinh Jira de lam viec nhanh
1. Tao 4 sprint tren board:
   - `Sprint 1 - Foundation`
   - `Sprint 2 - Asset + Monitoring`
   - `Sprint 3 - Incident + Notification`
   - `Sprint 4 - Reporting + Hardening`
2. Tao labels:
   - `mvp`, `critical`, `nice_to_have`, `week1`, `week2`, `week3`, `week4`
3. Dung 3 trang thai don gian:
   - `To Do`, `In Progress`, `Done`
4. Tao 1 custom filter nhanh:
   - `project = <YOUR_PROJECT> AND labels = mvp ORDER BY priority DESC`

---

## Sprint 1 (Week 1) - Foundation
### Goal
Dang nhap/phan quyen chay duoc + map co ban + CRUD asset toi thieu.

### Story chunks de keo vao sprint (PB + user story)
1. **Authentication core** (Owner: A_BE, Priority: High, Labels: mvp critical week1, **SP: 8**)
   - PB01: "La Nguoi dung, toi muon Truy cap trang dang nhap de vao he thong"
   - PB04: "La Nguoi dung, toi muon Nhan nut dang nhap de gui thong tin"
   - PB09: "La He thong, toi muon Cho phep dang nhap khi thong tin dung"
   - PB11: "La Nguoi dung, toi muon Nhan nut dang xuat de thoat he thong"
   - PB12: "La He thong, toi muon Xoa session dang nhap de bao mat"
2. **Role-based access** (Owner: A_BE, Priority: High, Labels: mvp critical week1, **SP: 8**)
   - PB21: "La He thong, toi muon Xac dinh vai tro nguoi dung sau khi dang nhap"
   - PB22: "La He thong, toi muon Cap quyen truy cap theo vai tro"
   - PB23: "La He thong, toi muon Chan truy cap trai phep vao chuc nang admin"
   - PB25: "La He thong, toi muon Kiem tra quyen truoc moi hanh dong"
3. **Security technical base** (Owner: A_BE, Priority: High, Labels: mvp critical week1, **SP: 5**)
   - PB43: "La He thong, toi muon Ma hoa mat khau truoc khi luu"
   - PB500: "La He thong, toi muon Kiem tra du lieu dau vao API"
   - PB501: "La He thong, toi muon Validate JSON request"
   - PB503: "La He thong, toi muon Xu ly exception global"
4. **Map base + interaction** (Owner: B_FE, Priority: High, Labels: mvp critical week1, **SP: 5**)
   - PB48: "La Nguoi dung, toi muon Mo trang ban do de xem ha tang do thi"
   - PB49: "La He thong, toi muon Tai ban do nen OpenStreetMap"
   - PB50: "La He thong, toi muon Hien thi ban do khi trang duoc tai"
   - PB53: "La Nguoi dung, toi muon Zoom in ban do de xem chi tiet"
   - PB55: "La Nguoi dung, toi muon Keo ban do de xem khu vuc khac"
5. **Device marker + popup** (Owner: B_FE, Priority: High, Labels: mvp critical week1, **SP: 8**)
   - PB58: "La He thong, toi muon Hien thi marker cho moi thiet bi"
   - PB59: "La He thong, toi muon Dat marker dung vi tri GPS"
   - PB63: "La Nguoi dung, toi muon Click vao marker de xem thong tin"
   - PB64: "La He thong, toi muon Hien thi popup khi click marker"
   - PB66: "La He thong, toi muon Hien thi trang thai thiet bi"
6. **Asset CRUD minimum** (Owner: A_BE + B_FE, Priority: High, Labels: mvp critical week1, **SP: 13**)
   - PB91: "La Quan tri vien, toi muon Mo form them thiet bi de nhap thong tin"
   - PB96: "La He thong, toi muon Luu thiet bi vao database"
   - PB100: "La Quan tri vien, toi muon Chinh sua thong tin thiet bi"
   - PB105: "La Quan tri vien, toi muon Xoa thiet bi khong con su dung"
   - PB109: "La Nguoi dung, toi muon Xem danh sach thiet bi"
7. **Tech setup + smoke test** (Owner: C_FS_QA, Priority: Medium, Labels: mvp week1, **SP: 3**)
   - PB482: "La He thong, toi muon Deploy ung dung"
   - PB486: "La He thong, toi muon Kiem tra API"

### Tong uoc luong Sprint 1
- **Tong SP (cac chunk): 50**

## Sprint 2 (Week 2) - Asset finish + Monitoring
### Goal
Hoan tat quan ly thiet bi + nhap/xem monitoring.

### Story chunks de keo vao sprint (PB + user story)
1. **Asset sync + status** (Owner: A_BE, Priority: High, Labels: mvp critical week2, **SP: 8**)
   - PB122: "La He thong, toi muon Danh dau trang thai (hoat dong/loi)"
   - PB124: "La He thong, toi muon Cap nhat trang thai khi co thay doi"
   - PB126: "La He thong, toi muon Cap nhat vi tri khi thay doi"
   - PB127: "La He thong, toi muon Dong bo du lieu thiet bi voi ban do"
2. **Asset validation UX** (Owner: A_BE + B_FE, Priority: High, Labels: mvp critical week2, **SP: 5**)
   - PB138: "La He thong, toi muon Kiem tra du lieu nhap khong bi thieu"
   - PB139: "La He thong, toi muon Kiem tra dinh dang du lieu"
   - PB140: "La He thong, toi muon Canh bao khi nhap sai"
3. **Monitoring input core** (Owner: A_BE + B_FE, Priority: High, Labels: mvp critical week2, **SP: 8**)
   - PB142: "La Nhan vien, toi muon Nhap du lieu tieu thu dien/nuoc"
   - PB144: "La Nhan vien, toi muon Chon thiet bi de nhap du lieu"
   - PB145: "La He thong, toi muon Luu du lieu tieu thu"
   - PB146: "La He thong, toi muon Kiem tra du lieu nhap hop le"
4. **Monitoring query + filter** (Owner: B_FE, Priority: High, Labels: mvp critical week2, **SP: 8**)
   - PB149: "La Nguoi dung, toi muon Xem du lieu tieu thu dien/nuoc"
   - PB151: "La Nguoi dung, toi muon Xem du lieu theo thiet bi"
   - PB152: "La Nguoi dung, toi muon Loc theo thoi gian"
   - PB153: "La He thong, toi muon Hien thi du lieu da loc"
   - PB166: "La Nguoi dung, toi muon Tim kiem du lieu tieu thu"
5. **Monitoring aggregate + chart basic** (Owner: B_FE + C_FS_QA, Priority: High, Labels: mvp critical week2, **SP: 8**)
   - PB157: "La Nguoi dung, toi muon Xem tong tieu thu theo ngay"
   - PB158: "La Nguoi dung, toi muon Xem tong tieu thu theo thang"
   - PB159: "La He thong, toi muon Tinh tong du lieu tieu thu"
   - PB162: "La Nguoi dung, toi muon Xem bieu do tieu thu"
   - PB163: "La He thong, toi muon Ve bieu do theo du lieu"
6. **Logging hardening** (Owner: C_FS_QA, Priority: High, Labels: mvp week2, **SP: 3**)
   - PB455: "La He thong, toi muon Ghi log loi"
   - PB460: "La He thong, toi muon Tranh crash he thong"

### Tong uoc luong Sprint 2
- **Tong SP (cac chunk): 40**

## Sprint 3 (Week 3) - Incident workflow
### Goal
Public bao su co -> nhan vien xem -> admin phan cong -> ky thuat vien cap nhat.

### Story chunks de keo vao sprint (PB + user story)
1. **Public incident report** (Owner: B_FE, Priority: High, Labels: mvp critical week3, **SP: 8**)
   - PB186: "La Nguoi dan, toi muon Gui bao cao su co de thong bao cho he thong"
   - PB187: "La Nguoi dan, toi muon Nhap mo ta su co"
   - PB188: "La Nguoi dan, toi muon Chon loai su co (dien/nuoc)"
   - PB189: "La Nguoi dan, toi muon Chon vi tri su co tren ban do"
2. **Incident API core** (Owner: A_BE, Priority: High, Labels: mvp critical week3, **SP: 13**)
   - PB191: "La He thong, toi muon Luu thong tin su co"
   - PB192: "La He thong, toi muon Kiem tra du lieu bao cao hop le"
   - PB195: "La He thong, toi muon Hien thi danh sach su co"
   - PB197: "La He thong, toi muon Hien thi thong tin chi tiet su co"
   - PB199: "La He thong, toi muon Luu trang thai su co"
3. **Incident map visualization** (Owner: B_FE, Priority: High, Labels: mvp critical week3, **SP: 5**)
   - PB201: "La He thong, toi muon Hien thi su co tren ban do"
   - PB202: "La He thong, toi muon Dat marker tai vi tri su co"
   - PB203: "La Nguoi dung, toi muon Click vao su co de xem chi tiet"
   - PB204: "La He thong, toi muon Hien thi popup su co"
4. **Assignment + work order flow** (Owner: A_BE + C_FS_QA, Priority: High, Labels: mvp critical week3, **SP: 13**)
   - PB205: "La Quan tri vien, toi muon Phan cong ky thuat vien xu ly su co"
   - PB207: "La He thong, toi muon Luu thong tin phan cong"
   - PB209: "La He thong, toi muon Tao phieu cong viec tu su co"
   - PB214: "La Ky thuat vien, toi muon Cap nhat trang thai sua chua"
   - PB217: "La He thong, toi muon Luu tien do cong viec"
5. **Incident management UI** (Owner: C_FS_QA, Priority: High, Labels: mvp critical week3, **SP: 8**)
   - PB194: "La Nhan vien, toi muon Xem danh sach su co"
   - PB196: "La Nhan vien, toi muon Xem chi tiet su co"
   - PB198: "La Nhan vien, toi muon Cap nhat trang thai su co"
6. **Public track status** (Owner: B_FE + C_FS_QA, Priority: High, Labels: mvp week3, **SP: 3**)
   - PB309: "La Nguoi dan, toi muon Xem trang thai xu ly"
   - PB310: "La He thong, toi muon Cap nhat trang thai phan anh"

### Tong uoc luong Sprint 3
- **Tong SP (cac chunk): 50**

## Sprint 4 (Week 4) - Notification + Reporting + hardening
### Goal
Thong bao theo vong doi su co, dashboard tong quan, chot demo on dinh.

### Story chunks de keo vao sprint (PB + user story)
1. **Notification incident lifecycle** (Owner: A_BE + C_FS_QA, Priority: High, Labels: mvp critical week4, **SP: 13**)
   - PB332: "La He thong, toi muon Tao thong bao de gui cho nguoi dung"
   - PB333: "La He thong, toi muon Luu noi dung thong bao"
   - PB337: "La He thong, toi muon Gui thong bao khi co su co moi"
   - PB341: "La He thong, toi muon Gui thong bao khi co phan cong"
   - PB347: "La He thong, toi muon Gui thong bao khi cong viec hoan thanh"
2. **Notification inbox UI** (Owner: C_FS_QA, Priority: High, Labels: mvp critical week4, **SP: 8**)
   - PB335: "La Nguoi dung, toi muon Xem danh sach thong bao"
   - PB336: "La He thong, toi muon Hien thi danh sach thong bao"
   - PB357: "La He thong, toi muon Danh dau thong bao da doc"
   - PB360: "La Nguoi dung, toi muon Xem thong bao chua doc"
3. **Reporting dashboard core** (Owner: C_FS_QA, Priority: High, Labels: mvp critical week4, **SP: 8**)
   - PB379: "La Quan tri vien, toi muon Xem bao cao tong quan he thong"
   - PB380: "La He thong, toi muon Hien thi dashboard tong quan"
   - PB381: "La He thong, toi muon Hien thi so luong thiet bi"
   - PB382: "La He thong, toi muon Hien thi so luong su co"
   - PB383: "La He thong, toi muon Hien thi so luong dang xu ly"
4. **Incident analytics basic** (Owner: A_BE + C_FS_QA, Priority: High, Labels: mvp week4, **SP: 8**)
   - PB389: "La Quan tri vien, toi muon Xem bao cao su co"
   - PB391: "La He thong, toi muon Thong ke theo trang thai"
   - PB392: "La He thong, toi muon Thong ke theo muc do nghiem trong"
5. **Hardening + demo** (Owner: All, Priority: High, Labels: mvp critical week4, **SP: 8**)
   - Cross-epic bugfix, integration test, demo script

### Tong uoc luong Sprint 4
- **Tong SP (cac chunk): 45**

---

## JQL mau de ban loc nhanh trong Jira
- Viec cua A_BE:  
  `project = <YOUR_PROJECT> AND assignee = A_BE AND labels = mvp ORDER BY priority DESC`
- Viec Sprint 2:  
  `project = <YOUR_PROJECT> AND Sprint = "Sprint 2 - Asset + Monitoring" ORDER BY priority DESC`
- Viec chua xong trong sprint hien tai:  
  `project = <YOUR_PROJECT> AND sprint in openSprints() AND status != Done ORDER BY priority DESC`

## Scope cat bo neu tre tien do
- Khong lam trong 4 tuan: route map, PDF export, advanced notification config, rating feedback, import/export nang cao.
