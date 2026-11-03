# MDUIK — Panduan Pengguna Pentadbir Sekolah

**Edisi Bahasa Melayu · Versi 1.0 · November 2026**

Panduan ini menerangkan cara menggunakan **Sistem Pentadbiran Sekolah MDUIK** bagi peranan **Pentadbir Sekolah**. Ia merangkumi menu, aliran kerja, peraturan perniagaan dan tindakan yang boleh dilakukan oleh Pentadbir Sekolah dalam satu sekolah.

Panduan ini tidak menerangkan secara terperinci peranan Super Admin, Bendahari, Guru atau Ibu bapa. Peranan tersebut disebut hanya apabila berkaitan dengan serahan tugas atau kelulusan.

> **URL produksi:** `https://mduik.mohdzakaria.workers.dev`

Sistem ini dwibahasa. **Bahasa Melayu** ialah bahasa lalai dan **English** boleh dipilih melalui suis **BM / EN** di bar atas atau melalui **Tetapan → Akaun saya → Bahasa pilihan**. Semua tarikh menggunakan kalendar Masihi.

Label menu dan butang dalam panduan ini dinyatakan dalam Bahasa Melayu seperti yang dipaparkan dalam sistem. Istilah Inggeris dinyatakan dalam kurungan hanya apabila membantu.

---

## Kandungan

1. Gambaran sistem
2. Peranan dan skop akses Pentadbir Sekolah
3. Log masuk dan antara muka
4. Papan pemuka
5. Kemasukan
6. Rekod
7. Kewangan
8. Operasi dan laporan
9. Pentadbiran sekolah
10. Tetapan sekolah
11. Peraturan perniagaan utama
12. Rujukan status
13. Keselamatan, privasi dan pengekalan data
14. Penyelesaian masalah
15. Senarai semak operasi
16. Lampiran: istilah antara muka

---

## 1. Gambaran sistem

MDUIK ialah sistem pentadbiran sekolah berbilang penyewa (multi-tenant) untuk **MDUIK Tahfiz** dan **MDUIK Pengajian Islam**. Sistem menghimpunkan kemasukan, temuduga, rekod pelajar dan ibu bapa, yuran, resit, laporan serta komunikasi ibu bapa dalam satu portal.

Modul utama:

- **Kemasukan** — permohonan, temuduga, keputusan jawatankuasa, tawaran senarai menunggu dan pendaftaran pelajar.
- **Rekod** — pelajar, guru, ibu bapa dan pautan ibu bapa–anak.
- **Kewangan** — invois, bayaran, resit, tunggakan, bayaran balik, hapus kira, pelarasan yuran dan lejar am.
- **Operasi** — papan pemuka dan laporan bercetak atau boleh dieksport.
- **Pentadbiran** — pengguna dan peranan, log audit, import data dan pengekalan data.
- **Tetapan** — konfigurasi sekolah, yuran dan akaun pengguna.

Setiap rekod sekolah terikat kepada satu sekolah. Pentadbir Sekolah hanya melihat dan mengurus sekolah yang aktif dalam konteksnya.

### Perkara penting tentang sistem

- **Tiada akaun log masuk untuk pelajar atau pemohon.** Pemohon memohon melalui borang awam dan menyemak status dengan nombor rujukan.
- **Ibu bapa hanya melihat anak yang dipautkan secara eksplisit** kepada rekod ibu bapa mereka.
- **Tiada bayaran dalam talian.** Ibu bapa membayar melalui pindahan bank atau tunai di pejabat sekolah, dan staf sekolah merekodkan bayaran tersebut.
- Sistem tidak menggunakan tempoh intake atau had tempat. Permohonan boleh dihantar sepanjang tahun.
- Semua rekod kewangan dan tindakan sensitif diaudit.

---

## 2. Peranan dan skop akses Pentadbir Sekolah

Pentadbir Sekolah mengurus **satu sekolah pada satu masa**. Dalam konteks sekolah tersebut, Pentadbir Sekolah mempunyai akses penuh kepada modul sekolah yang dibenarkan.

### 2.1 Apa yang Pentadbir Sekolah boleh lakukan

| Bidang | Kebenaran |
| --- | --- |
| Papan pemuka | Melihat ringkasan kemasukan, rekod dan kewangan sekolah |
| Permohonan dan temuduga | Semak permohonan, jadualkan temuduga, pantau markah, rekod keputusan, buat tawaran dan daftarkan pelajar |
| Rekod | Cipta dan kemas kini pelajar, guru dan ibu bapa; pautkan ibu bapa kepada pelajar |
| Invois dan bayaran | Jana invois bulanan dan pendaftaran; rekod bayaran; lihat dan eksport data |
| Resit | Lihat, cetak dan batalkan resit dengan sebab |
| Tunggakan | Semak penuaan dan lepaskan peringatan |
| Bayaran balik | Mohon dan luluskan atau tolak permohonan bayaran balik orang lain |
| Hapus kira | Hapus kira baki tertunggak; tindakan ini tidak boleh dibatalkan |
| Pelarasan yuran | Mohon dan luluskan atau tolak pelarasan yuran |
| Laporan | Semua laporan peringkat sekolah yang dibenarkan untuk peranan ini |
| Pengguna dan peranan | Urus akaun staf dan ibu bapa bagi sekolah sendiri |
| Log audit | Lihat log audit sekolah; log bersifat baca sahaja |
| Import data | Import pelajar, ibu bapa, guru dan baki permulaan melalui CSV |
| Pengekalan data | Semak dan luluskan tindakan pengekalan data sekolah |
| Tetapan | Konfigurasi sekolah, pelan yuran dan akaun sendiri |

### 2.2 Batasan Pentadbir Sekolah

Pentadbir Sekolah **tidak boleh**:

- mencipta, menggantung atau mengaktifkan sekolah lain;
- mengurus data sekolah lain yang bukan konteks aktifnya;
- mengakses portal ibu bapa sebagai ibu bapa;
- mencipta akaun log masuk untuk pelajar atau pemohon;
- memadam akaun pengguna. Akaun hanya **dinyahaktifkan**;
- memadam resit. Resit hanya boleh **dibatalkan** dan nombornya dikekalkan.

### 2.3 Peranan lain yang berkaitan

| Peranan | Tanggungjawab utama | Had utama |
| --- | --- | --- |
| **Bendahari** | Rekod bayaran, lihat rekod dan kewangan, mohon atau luluskan bayaran balik, mohon pelarasan yuran, lihat laporan kewangan | Tidak boleh hapus kira, batalkan resit, jana invois, luluskan pelarasan yuran, urus pengguna atau ubah tetapan sekolah |
| **Guru** | Lihat permohonan dan nilai temuduga yang ditugaskan | Tidak boleh jadualkan temuduga, rekod keputusan, buat tawaran atau daftarkan pelajar |
| **Ibu bapa** | Lihat anak yang dipautkan, invois, resit, arahan bayaran dan jawab tawaran | Hanya melihat anak yang dipautkan; tiada bayaran dalam talian |

Jika seseorang memegang peranan dalam lebih daripada satu sekolah, pemilih sekolah di bar atas menukar konteks sekolah. Sentiasa semak nama sekolah di bar atas sebelum mencipta atau mengubah rekod.

---

## 3. Log masuk dan antara muka

### 3.1 Log masuk

1. Buka URL produksi.
2. Pilih **Log masuk staf** atau pergi terus ke `/login`.
3. Masukkan **e-mel berdaftar** atau **nombor IC** jika akaun anda dipautkan kepada IC.
4. Masukkan **kata laluan**.
5. Pilih **Log masuk**.

Selepas lima percubaan log masuk yang gagal, akaun dikunci sementara selama **15 minit**. Tunggu sehingga tempoh kunci tamat atau hubungi pentadbir sistem.

Jika anda terlupa kata laluan:

1. Pilih **Lupa kata laluan?**
2. Masukkan e-mel anda.
3. Ikuti pautan tetapan semula yang dihantar.

Atas sebab keselamatan, sistem memaparkan mesej pengesahan yang sama sama ada e-mel itu wujud atau tidak.

### 3.2 Bar sisi

Bar sisi mengandungi menu mengikut peranan anda:

- **Menu utama** — Papan pemuka
- **Kemasukan** — Permohonan, Temuduga
- **Rekod** — Pelajar, Guru, Ibu bapa
- **Kewangan** — Invois, Bayaran, Resit, Tunggakan, Bayaran balik, Hapus kira, Pelarasan yuran, Lejar am
- **Operasi** — Laporan
- **Pentadbiran** — Pengguna & peranan, Log audit, Import data, Pengekalan data
- **Tetapan** — Pemberitahuan, Tetapan

Pada skrin kecil, gunakan butang menu untuk membuka bar sisi.

### 3.3 Bar atas

Bar atas mengandungi:

- nama sekolah aktif, atau pemilih sekolah jika anda mempunyai akses ke lebih daripada satu sekolah;
- loceng **Pemberitahuan** dengan bilangan belum dibaca;
- suis bahasa **BM / EN**;
- menu pengguna dengan **Profil saya**, **Pemberitahuan**, **Laman awam** dan **Log keluar**.

### 3.4 Pemberitahuan

Buka **Pemberitahuan** melalui bar sisi atau loceng di bar atas. Pemberitahuan merangkumi kemas kini permohonan, penugasan temuduga, notis invois, kemas kini bayaran dan bayaran balik, serta peringatan pengekalan data.

- Pemberitahuan sentiasa disimpan dalam portal.
- Status e-mel boleh dipaparkan sebagai **Dihantar**, **Dalam baris**, **Gagal** atau **Portal sahaja**.
- Pilih pemberitahuan untuk menandanya sebagai dibaca, atau gunakan **Tanda semua dibaca**.
- Pentadbir Sekolah juga boleh melihat keluar sekolah (outbox) jika dipaparkan.

### 3.5 Tetapan dan bahasa

Buka **Tetapan** untuk:

- **Sekolah** — identiti sekolah, butiran hubungan, butiran bank, arahan bayaran, penjenamaan dan tarikh akhir;
- **Yuran** — pelan yuran, yuran bulanan dan yuran pendaftaran;
- **Akaun saya** — nama, bahasa pilihan dan kata laluan.

Menukar bahasa mengubah antara muka serta-merta. Pilihan disimpan pada akaun pengguna.

### 3.6 Saiz skrin

Antara muka berfungsi pada desktop, tablet dan telefon. Jadual yang lebar boleh ditatal ke sisi di dalam kawasan jadual. Jangan zum keluar halaman untuk melihat jadual.

---

## 4. Papan pemuka

**Papan pemuka** memberi ringkasan operasi sekolah:

- bilangan pelajar aktif dan status pemantauan bulanan;
- yuran yang dikutip bulan ini dan jumlah yuran tertunggak;
- invois terbuka dan tindakan yang menunggu;
- saluran kemasukan dan permohonan terkini;
- temuduga akan datang dan markah yang belum disiapkan;
- resit terkini, penuaan tunggakan serta bayaran balik dan pelarasan yuran yang menunggu kelulusan.

**Tindakan pantas** menyediakan pintasan kepada:

- **Rekod bayaran**;
- **Jana invois bulanan**;
- **Lihat laporan**;
- senarai permohonan.

Semak papan pemuka setiap hari untuk mengenal pasti permohonan baharu, temuduga yang perlu disiapkan, invois tertunggak dan kelulusan yang belum diselesaikan.

---

## 5. Kemasukan

Aliran kerja biasa:

**Permohonan diterima → semakan → temuduga dijadualkan → dua penilai menilai → keputusan jawatankuasa → tawaran (jika senarai menunggu) → pendaftaran**

### 5.1 Semak permohonan

Buka **Kemasukan → Permohonan**.

- Gunakan tab dan tapisan untuk mencari permohonan mengikut status, kategori atau kata kunci.
- Senarai memaparkan rujukan, pemohon, tarikh dihantar dan markah akhir temuduga.
- Buka permohonan untuk melihat butiran pemohon dan ibu bapa, sejarah pendidikan, dokumen sokongan, semakan automatik, sejarah temuduga dan keputusan.

Tab status yang tersedia termasuk:

- **Dihantar**
- **Temuduga**
- **Diterima**
- **Senarai menunggu**
- **Tidak diterima**
- **Berdaftar**
- **Tidak lengkap**

### 5.2 Semakan automatik

Setiap permohonan menjalani semakan automatik:

- **Ruangan belum lengkap**;
- **Umur layak** — pemohon mesti berumur 4 hingga 25 tahun;
- **Dokumen dimuat naik**;
- **Persetujuan direkodkan**;
- **E-mel sah**.

Permohonan yang tidak lengkap masih menerima nombor rujukan, tetapi ditandakan kepada staf untuk tindakan susulan.

### 5.3 Jadualkan temuduga

1. Buka permohonan.
2. Pilih **Jadualkan temuduga**.
3. Masukkan tarikh dan masa, mod (**Bersemuka** atau **Panggilan telefon**), lokasi dan catatan.
4. Pilih **dua penilai** daripada guru sekolah.
5. Simpan.

Status permohonan berubah kepada **Temuduga**. Pemohon dan kedua-dua penilai dimaklumkan. Guru hanya melihat temuduga yang ditugaskan kepada mereka.

### 5.4 Pantau dan nilai temuduga

Buka **Kemasukan → Temuduga** untuk melihat temuduga yang dijadualkan dan kemajuan markah.

- Rubrik temuduga berjumlah **100 markah**.
- Item hafazan dalam Bahagian 5 dan Bahagian 6 dinilai secara berasingan.
- Senarai semak hafazan adalah untuk rujukan dan tidak dinilai.
- Penilai boleh merekod **Masa hafazan**: **Baik (bawah 5 minit)**, **Sederhana (bawah 10 minit)** atau **Lemah (melebihi 10 minit)**.
- Markah penilai lain disembunyikan sehingga penilai menghantar markah sendiri.
- Penilai boleh mengubah markah yang telah dihantar.

Jika anda ditugaskan sebagai penilai:

1. Buka temuduga yang ditugaskan.
2. Masukkan markah bagi setiap item rubrik dalam had maksimum yang dinyatakan.
3. Semak jumlah markah.
4. Pilih **Hantar markah** dan sahkan.

**Markah akhir ialah purata dua penilai.** **Markah lulus ialah 40/100.** Markah di bawah 40 ditandakan kepada jawatankuasa, tetapi jawatankuasa tetap boleh merekod keputusan. Temuduga ditandakan **Selesai** apabila kedua-dua markah diterima.

### 5.5 Rekod keputusan jawatankuasa

1. Buka permohonan.
2. Pilih **Rekod keputusan**.
3. Pilih **Diterima**, **Tidak diterima** atau **Senarai menunggu**.
4. Masukkan **sebab keputusan**. Sebab wajib diisi dan menyokong sebarang rayuan kemudian.
5. Simpan.

Keputusan dimaklumkan kepada pemohon dan status permohonan berubah mengikut keputusan.

### 5.6 Buat tawaran senarai menunggu

Tawaran hanya boleh dibuat untuk pemohon yang keputusannya **Senarai menunggu**.

1. Buka permohonan.
2. Pilih **Buat tawaran senarai menunggu**.
3. Sahkan tawaran.
4. Sistem menetapkan tarikh akhir jawapan **7 hari kalendar** dari tarikh tawaran.
5. Pemohon dimaklumkan. Ibu bapa boleh menerima atau menolak tawaran melalui portal.

Jika ibu bapa menerima, permohonan menjadi **Diterima**. Jika ditolak, jawapan direkodkan dan pemohon kembali ke senarai menunggu. Jika tiada jawapan, tawaran **luput secara automatik** selepas tarikh akhir.

### 5.7 Daftarkan pemohon yang diterima

1. Buka permohonan berstatus **Diterima**.
2. Pilih **Daftarkan pelajar**.
3. Sahkan kelas, yuran bulanan dan maklumat ibu bapa.
4. Simpan.

Pendaftaran akan:

- mencipta rekod pelajar baharu, atau mengaktifkan semula pelajar sedia ada dengan IC yang sama dalam sekolah;
- mencipta atau menggunakan semula rekod ibu bapa dan memautkannya kepada pelajar;
- mencipta **invois yuran pendaftaran bagi tahun kalendar semasa**;
- menandakan permohonan sebagai **Berdaftar**;
- memaparkan amaran tunggakan jika pelajar mendaftar semula, tetapi **tidak menyekat** pendaftaran.

Pendaftaran **tidak** menghidupkan pemantauan yuran bulanan secara automatik. Buka rekod pelajar dan hidupkan **Pemantauan bulanan** apabila yuran bulanan patut bermula. Invois bulanan pertama ialah bagi **1 haribulan berikutnya**.

---

## 6. Rekod

### 6.1 Pelajar

Buka **Rekod → Pelajar**.

- Gunakan carian dan tapisan untuk mencari pelajar mengikut nama, kelas, status atau status pemantauan.
- Buka pelajar untuk melihat maklumat peribadi, pelan yuran, yuran bulanan, baki, ibu bapa atau penjaga, invois, bayaran, pelarasan dan peringatan.
- Pilih **Tambah pelajar** untuk mencipta rekod secara manual.
- Nombor IC disulitkan pada peringkat medan dan dipaparkan bertopeng.
- Pilih **Pautkan ibu bapa** untuk memautkan ibu bapa sedia ada atau mencipta rekod ibu bapa baharu.
- Pilih **Kemas kini pemantauan** untuk menghidupkan atau mematikan pemantauan bulanan.
- Pilih **Jana invois pendaftaran** jika invois pendaftaran tahun semasa belum dicipta.
- Muat turun **Penyata akaun** dalam bentuk PDF.
- Tukar status pelajar kepada **Aktif**, **Berhenti** atau **Graduan** mengikut keadaan.

**Pemantauan bulanan:**

- Menghidupkan pemantauan menetapkan bulan invois pertama kepada **bulan berikutnya**.
- Mematikan pemantauan menghentikan invois bulanan baharu, tetapi invois sedia ada tetap perlu dibayar dan kekal dalam tunggakan.
- Sistem tidak membuat pro-rata. Yuran penuh dikenakan bagi setiap bulan aktif.

**Invois pendaftaran:**

- Dikenakan sekali bagi setiap pelajar bagi setiap tahun kalendar.
- Sistem menghalang invois pendaftaran pendua bagi pelajar dan tahun kalendar yang sama.
- Yuran pendaftaran adalah berasingan daripada pemantauan bulanan.

### 6.2 Guru

Buka **Rekod → Guru**.

- Lihat butiran hubungan guru, penugasan sekolah, akaun log masuk dan tugas temuduga.
- Pilih **Tambah guru** untuk mencipta rekod.
- Pilih **Cipta akaun log masuk** jika guru perlu mengakses sistem.
- Jika **Kata laluan sementara** dibiarkan kosong, kata laluan sementara lalai akan digunakan.
- Guru boleh ditugaskan ke lebih daripada satu sekolah melalui peranan pengguna.
- Apabila guru meninggalkan sekolah, **nyahaktifkan** akaun log masuk. Jangan padam rekod.

### 6.3 Ibu bapa

Buka **Rekod → Ibu bapa**.

- Lihat butiran hubungan ibu bapa dan anak yang dipautkan.
- Cipta atau sunting rekod ibu bapa dan pautkan kepada pelajar.
- Ibu bapa boleh dipautkan kepada lebih daripada seorang anak, termasuk anak di sekolah lain, tetapi portal hanya memaparkan rekod yang dipautkan.
- Minta ibu bapa memastikan telefon, e-mel dan alamat sentiasa terkini. Mereka boleh mengemas kini maklumat tersebut melalui portal.

Ibu bapa **tidak boleh** mencipta pautan kepada anak sendiri. Jika anak tidak kelihatan dalam portal, Pentadbir Sekolah perlu menambah pautan pada rekod ibu bapa atau pelajar.

### 6.4 Kualiti data

- Semak ejaan nama seperti dalam IC atau sijil lahir.
- Pastikan e-mel ibu bapa tepat kerana ia menentukan pautan permohonan dan portal.
- Jangan cipta rekod pendua. Cari menggunakan nama atau IC sebelum menambah pelajar, guru atau ibu bapa.
- Gunakan status **Berhenti** atau **Graduan** untuk pelajar yang tidak lagi aktif. Jangan padam rekod.

---

## 7. Kewangan

Menu **Kewangan** mengandungi:

- **Invois**
- **Bayaran**
- **Resit**
- **Tunggakan**
- **Bayaran balik**
- **Hapus kira**
- **Pelarasan yuran**
- **Lejar am**

### 7.1 Invois

Buka **Kewangan → Invois**.

Jenis invois termasuk:

- **Bulanan**
- **Pendaftaran**
- **Baki permulaan**
- **Pelarasan**

Setiap invois memaparkan nombor invois, pelajar, tempoh, tarikh dikeluarkan, tarikh akhir, jumlah, baki tertunggak dan status.

Peraturan invois:

- **Invois bulanan** dijana untuk bulan bil yang dipilih, biasanya bulan berikutnya.
- **Invois pendaftaran** dijana sekali bagi setiap pelajar bagi setiap tahun kalendar.
- Invois yang telah dikeluarkan mengekalkan tarikh akhir asalnya walaupun tetapan hari akhir sekolah diubah kemudian.
- Sistem tidak membuat pro-rata. Yuran bulanan penuh dikenakan bagi setiap bulan aktif.
- Gunakan pilihan eksport untuk memuat turun invois sebagai CSV atau Excel.

### 7.2 Jana invois

Pentadbir Sekolah boleh menggunakan:

- **Jana invois bulanan**
- **Jana invois pendaftaran**

**Invois bulanan** terpakai kepada pelajar aktif yang mempunyai pemantauan bulanan dihidupkan dan tarikh mula pemantauan pada atau sebelum bulan bil.

**Invois pendaftaran** terpakai kepada pelajar aktif dan menggunakan tahun kalendar semasa.

Menjalankan penjanaan semula adalah selamat. Sistem tidak mencipta invois pendua bagi pelajar, jenis dan tempoh yang sama.

### 7.3 Rekod bayaran

1. Buka **Kewangan → Bayaran** atau gunakan **Rekod bayaran** pada papan pemuka.
2. Pilih pelajar.
3. Masukkan jumlah, tarikh bayaran, kaedah (**Tunai** atau **Pindahan bank**) dan rujukan bank jika berkenaan.
4. Untuk pindahan bank, masukkan rujukan bank dan lampirkan bukti jika ada.
5. Tambah catatan jika perlu.
6. Pilih **Rekod bayaran**.

Peraturan bayaran:

- Bayaran diperuntukkan kepada **invois tertunggak yang paling lama dahulu**.
- Lebihan bayaran disimpan sebagai **kredit pelajar** dan digunakan pada invois akan datang.
- Resit dikeluarkan serta-merta dengan nombor berturutan.
- Untuk invois yang telah dihapus kira, bayaran boleh direkodkan sebagai **Pemulihan baki hapus kira**.

### 7.4 Resit

Buka **Kewangan → Resit**.

- Resit bernombor berturutan dan tiada jurang.
- Resit **tidak pernah dipadam**.
- Pentadbir Sekolah boleh **Batalkan resit** dengan sebab. Nombor resit dikekalkan dan resit ditandakan sebagai dibatalkan.
- Buka resit untuk melihat atau mencetak PDF.

Jangan cuba memadam atau mengeluarkan semula nombor resit yang sama. Pembatalan mesti dilakukan melalui sistem supaya jejak audit kekal lengkap.

### 7.5 Tunggakan

Buka **Kewangan → Tunggakan**.

Invois tertunggak dianalisis mengikut penuaan dari **tarikh akhir asal**:

- **Belum akhir**
- **1–30 hari**
- **31–60 hari**
- **61–90 hari**
- **Melebihi 90 hari**

Peringatan tunggakan dijana pada:

- hari ke-3 selepas tarikh akhir;
- hari ke-14;
- hari ke-30;
- kemudian setiap 30 hari.

Notis rasmi pada hari ke-30 dan seterusnya perlu disemak sebelum dilepaskan. Selepas disemak, gunakan **Lepaskan notis rasmi**.

### 7.6 Bayaran balik

Buka **Kewangan → Bayaran balik**.

1. Pilih **Mohon bayaran balik**.
2. Pilih pelajar, jumlah dan sebab.
3. Jumlah tidak boleh melebihi kredit yang tersedia.
4. Hantar permohonan. Status menjadi **Menunggu**.
5. Orang kedua yang diberi kuasa meluluskan atau menolak permohonan.

Peraturan bayaran balik:

- Pemohon **tidak boleh meluluskan bayaran balik sendiri**.
- Apabila diluluskan, kredit tersedia dikurangkan dan ibu bapa dimaklumkan.
- Jika ditolak, tiada perubahan kewangan berlaku.

### 7.7 Hapus kira

Buka **Kewangan → Hapus kira**.

Hanya **Pentadbir Sekolah** boleh menghapus kira baki.

1. Pilih **Semua invois tertunggak** atau **Pilih invois**.
2. Masukkan **Sebab hapus kira**.
3. Sahkan tindakan.

Apabila disahkan:

- invois yang dipilih ditandakan **Dihapus kira**;
- tindakan direkodkan dalam **Log audit**;
- hapus kira **tidak boleh dibatalkan**.

Jika keluarga kemudian membuat bayaran terhadap invois yang telah dihapus kira, gunakan **Rekod pemulihan** dan pilih invois tersebut. Bayaran pemulihan dijejaki secara berasingan daripada hapus kira asal.

### 7.8 Pelarasan yuran

Buka **Kewangan → Pelarasan yuran**.

- Bendahari atau Pentadbir Sekolah boleh memohon perubahan yuran bulanan pelajar.
- Masukkan **Kadar bulanan baharu**, **Tarikh berkuat kuasa** dan sebab.
- Pentadbir Sekolah meluluskan atau menolak permohonan.
- Selepas diluluskan, yuran bulanan pelajar dikemas kini untuk invois akan datang dan ibu bapa dimaklumkan.

### 7.9 Lejar am

Buka **Kewangan → Lejar am**.

1. Pilih tempoh.
2. Pilih **Jana lejar**.
3. Invois dipaparkan sebagai **Debit**, bayaran sebagai **Kredit**, dan **Baki berjalan** dikira.
4. Pilih **Muat turun lejar** untuk CSV atau Excel jika perlu.

### 7.10 Kawalan kewangan

- Semak invois yang dijana sebelum menghantar peringatan.
- Pastikan setiap bayaran mempunyai kaedah dan rujukan yang betul.
- Jangan batalkan resit tanpa sebab yang jelas dan direkodkan.
- Semak bayaran balik dan pelarasan yuran yang menunggu setiap hari.
- Gunakan **Log audit** untuk menyiasat perubahan kewangan yang luar biasa.
- Hapus kira hanya selepas semakan dan kelulusan dalaman sekolah.

---

## 8. Operasi dan laporan

Buka **Operasi → Laporan**.

Laporan dijana daripada data langsung. Pilih tempoh dan tapisan kelas jika berkaitan, kemudian pilih format:

- **PDF** untuk cetakan;
- **CSV** untuk hamparan;
- **Excel** untuk analisis lanjut.

Laporan peringkat sekolah yang tersedia untuk Pentadbir Sekolah:

- **Saluran kemasukan**
- **Keputusan temuduga**
- **Senarai pendaftaran**
- **Rekod pelajar**
- **Rekod guru**
- **Kutipan yuran**
- **Penuaan tunggakan**
- **Daftar resit**
- **Log bayaran balik**
- **Penugasan guru–sekolah**
- **Log audit**
- **Laporan hapus kira**

**Laporan gabungan negeri** hanya tersedia untuk Super Admin.

Gunakan tapisan **Tempoh** dan **Semua kelas** atau kelas tertentu untuk menyempitkan laporan. Pengguna hanya melihat laporan yang dibenarkan untuk peranan mereka.

---

## 9. Pentadbiran sekolah

### 9.1 Pengguna dan peranan

Buka **Pentadbiran → Pengguna & peranan**.

- Pilih **Tambah pengguna** untuk mencipta akaun staf atau ibu bapa.
- Pilih peranan dan sekolah yang berkaitan.
- Akaun ibu bapa dipautkan kepada rekod ibu bapa. Pautan ini menentukan anak yang boleh dilihat dalam portal.
- Pengguna boleh memegang lebih daripada satu peranan atau peranan dalam lebih daripada satu sekolah.
- Akaun **dinyahaktifkan, tidak dipadam**. Gunakan **Nyahaktif** atau **Aktifkan**.
- Gunakan **Tetapan semula kata laluan** untuk mengeluarkan kata laluan sementara. Kongsi secara selamat; pengguna boleh menukarnya selepas log masuk.

Senarai pengguna memaparkan peranan, sekolah, status dan log masuk terakhir.

### 9.2 Log audit

Buka **Pentadbiran → Log audit**.

Setiap tindakan sensitif merekodkan:

- masa;
- pengguna dan peranan;
- tindakan;
- entiti dan rekod;
- butiran sebelum dan selepas, jika berkenaan;
- alamat IP pelaku.

Log audit bersifat **baca sahaja** dan tidak boleh disunting atau dipadam. Entri audit dikekalkan selama **satu tahun**.

### 9.3 Import data

Buka **Pentadbiran → Import data**.

1. Pilih jenis data:
   - **Pelajar**
   - **Ibu bapa**
   - **Guru**
   - **Baki yuran permulaan**
2. Pilih **Muat turun templat** bagi jenis data tersebut.
3. Pilih fail CSV yang dieksport daripada Excel. Maksimum **2,000 baris** setiap fail.
4. Pilih **Jalankan pengesahan**. Tiada data disimpan semasa percubaan kering.
5. Semak **Laporan pengesahan**: jumlah baris, baris sah, baris gagal dan ralat mengikut baris.
6. Pilih **Sahkan import**. Hanya baris sah ditulis ke pangkalan data; baris gagal tidak disimpan.

Fail sumber disimpan bersama kelompok import untuk rujukan. Sejarah import boleh dilihat dalam **Sejarah import**.

### 9.4 Pengekalan data

Buka **Pentadbiran → Pengekalan data**.

- Peraturan pengekalan menentukan tempoh setiap jenis data disimpan.
- Tugas bulanan menandakan rekod yang melebihi tempoh pengekalan.
- Pentadbir Sekolah menyemak setiap rekod yang ditandakan.
- Pilih salah satu tindakan:
  - **Padam data peribadi**
  - **Anonimkan**
  - **Ketepikan**
- Tiada pemadaman atau anonimisasi berlaku tanpa kelulusan Pentadbir Sekolah.

---

## 10. Tetapan sekolah

Buka **Tetapan**.

### 10.1 Sekolah

Tab **Sekolah** mengandungi:

- identiti sekolah dan nama pendek;
- kategori dan negeri;
- butiran hubungan;
- butiran bank dan arahan bayaran dalam BM dan EN;
- penjenamaan dan URL logo;
- tarikh akhir bil dan pendaftaran.

Nama sekolah dan butiran bayaran digunakan pada borang, resit dan surat. Pastikan semuanya tepat.

### 10.2 Yuran

Tab **Yuran** mengandungi:

- pelan yuran;
- yuran bulanan;
- yuran pendaftaran;
- tambah atau sunting pelan yuran.

Peraturan tetapan yuran:

- Perubahan **hari akhir bulanan** hanya terpakai kepada invois yang dikeluarkan selepas perubahan. Invois sedia ada mengekalkan tarikh akhir asalnya.
- **Yuran pendaftaran** dikenakan sekali bagi setiap pelajar bagi setiap tahun kalendar, tanpa mengira pemantauan bulanan.
- Perubahan yuran tidak mengubah invois yang telah dikeluarkan.

### 10.3 Akaun saya

Tab **Akaun saya** membolehkan anda:

- mengemas kini nama;
- menukar bahasa pilihan;
- menukar kata laluan.

Gunakan kata laluan yang kukuh dan jangan berkongsi akaun. Setiap pengguna perlu mempunyai akaun sendiri supaya log audit kekal tepat.

---

## 11. Peraturan perniagaan utama

Peraturan berikut dikuatkuasakan oleh sistem dan perlu dipatuhi dalam amalan sekolah.

### 11.1 Kemasukan dan temuduga

- Permohonan diterima sepanjang tahun. Tiada tempoh intake atau had tempat.
- Pemohon mesti berumur **4 hingga 25 tahun**.
- Ruangan wajib yang tidak lengkap, e-mel tidak sah, persetujuan tiada atau umur tidak layak menandakan permohonan sebagai **Tidak lengkap**.
- Setiap temuduga mempunyai **dua penilai**.
- Markah akhir ialah **purata dua penilai**.
- Rubrik temuduga berjumlah **100 markah**; markah lulus ialah **40**.
- Markah di bawah 40 ditandakan kepada jawatankuasa, tetapi jawatankuasa tetap merekod keputusan dan sebab.
- Keputusan **wajib** mempunyai sebab.
- Tawaran senarai menunggu sah selama **7 hari kalendar** dan luput secara automatik jika tidak dijawab.
- Hanya pemohon **Diterima** boleh didaftarkan.
- Pendaftaran mencipta atau mengaktifkan semula pelajar, memautkan ibu bapa dan mengeluarkan **satu invois pendaftaran bagi tahun kalendar semasa**.
- Tunggakan tidak menyekat pendaftaran, tetapi Pentadbir Sekolah dan Bendahari dimaklumkan.
- Pemantauan bulanan adalah berasingan daripada pendaftaran dan bermula pada **1 haribulan berikutnya** apabila dihidupkan.

### 11.2 Kewangan

- Bayaran diperuntukkan kepada **invois tertunggak paling lama dahulu**.
- Lebihan bayaran menjadi **kredit pelajar** dan digunakan pada invois akan datang.
- Nombor resit berturutan dan tiada jurang. Resit **dibatalkan**, bukan dipadam.
- Satu invois pendaftaran sahaja dibenarkan bagi setiap pelajar bagi setiap tahun kalendar.
- Yuran bulanan **tidak dipro-rata**; yuran penuh dikenakan bagi setiap bulan aktif.
- Invois yang telah dikeluarkan mengekalkan tarikh akhir asalnya apabila tetapan hari akhir sekolah berubah.
- **Hapus kira** hanya untuk Pentadbir Sekolah dan tidak boleh dibatalkan. Bayaran kemudian terhadap invois yang dihapus kira direkodkan sebagai **pemulihan**.
- **Bayaran balik** memerlukan pelulus kedua, dan pemohon tidak boleh meluluskan bayaran balik sendiri.
- **Pelarasan yuran** dimohon oleh Bendahari atau Pentadbir Sekolah dan diluluskan oleh Pentadbir Sekolah.
- Peringatan tunggakan mengikut hari ke-3, hari ke-14, hari ke-30 dan kemudian setiap 30 hari dari tarikh akhir asal.
- **Lejar am** menunjukkan invois sebagai debit dan bayaran sebagai kredit.

### 11.3 Rekod dan akses

- Pengguna boleh memegang pelbagai peranan dan peranan dalam pelbagai sekolah.
- Akaun **dinyahaktifkan, tidak dipadam**.
- Setiap pertanyaan sekolah terhad kepada sekolah aktif.
- Ibu bapa hanya melihat anak yang dipautkan secara eksplisit.
- Pelajar dan pemohon **tiada akaun log masuk**.
- Nombor IC disulitkan semasa disimpan dan dipaparkan bertopeng.
- Entri audit bersifat baca sahaja dan dikekalkan selama **satu tahun**.

### 11.4 Tarikh dan bayaran

- Semua tarikh menggunakan **kalendar Masihi**.
- **Tiada gerbang bayaran dalam talian**.

---

## 12. Rujukan status

### 12.1 Status permohonan

| Status | Maksud |
| --- | --- |
| **Dihantar** | Permohonan lengkap diterima dan menunggu semakan. |
| **Tidak lengkap** | Maklumat wajib, kelayakan umur, e-mel atau persetujuan perlu tindakan. |
| **Temuduga** | Temuduga telah dijadualkan atau sedang berjalan. |
| **Diterima** | Jawatankuasa menerima pemohon. |
| **Tidak diterima** | Jawatankuasa tidak menerima pemohon. |
| **Senarai menunggu** | Pemohon berada dalam senarai menunggu. |
| **Berdaftar** | Pemohon telah didaftarkan sebagai pelajar. |

### 12.2 Status tawaran

| Status | Maksud |
| --- | --- |
| **Ditawarkan** | Tawaran senarai menunggu dihantar; jawapan diperlukan sebelum tarikh akhir. |
| **Diterima** | Ibu bapa menerima tawaran. |
| **Ditolak** | Ibu bapa menolak tawaran. |
| **Luput** | Tarikh akhir berlalu tanpa jawapan. |

### 12.3 Status invois

| Status | Maksud |
| --- | --- |
| **Belum dibayar** | Tiada bayaran atau kredit digunakan lagi. |
| **Sebahagian** | Sebahagian telah dibayar atau dikreditkan; masih ada baki. |
| **Dibayar** | Telah dijelaskan sepenuhnya. |
| **Dihapus kira** | Baki tertunggak dihapus kira oleh Pentadbir Sekolah. |

### 12.4 Status bayaran balik dan pelarasan

| Status | Maksud |
| --- | --- |
| **Menunggu** | Menunggu pelulus kedua atau semakan Pentadbir Sekolah. |
| **Diluluskan** | Diluluskan dan digunakan. |
| **Ditolak** | Tidak diluluskan; tiada perubahan kewangan. |

### 12.5 Status import

| Status | Maksud |
| --- | --- |
| **Menunggu** | Pengesahan selesai; tiada baris disimpan lagi. |
| **Diluluskan** | Import disahkan; baris sah ditulis ke pangkalan data. |

### 12.6 Status pelajar

| Status | Maksud |
| --- | --- |
| **Aktif** | Pelajar sedang belajar dan boleh menerima invois baharu. |
| **Berhenti** | Pelajar telah berhenti; rekod dikekalkan. |
| **Graduan** | Pelajar telah menamatkan pengajian; rekod dikekalkan. |

---

## 13. Keselamatan, privasi dan pengekalan data

- Sesi log masuk menggunakan kuki selamat dan HTTP-only dalam produksi.
- Kata laluan disimpan menggunakan PBKDF2 dengan garam unik bagi setiap pengguna.
- Nombor IC disulitkan semasa disimpan dan dipaparkan bertopeng dalam respons dan senarai.
- Semakan peranan dikuatkuasakan oleh API serta antara muka.
- Setiap pertanyaan sekolah ditapis mengikut sekolah aktif.
- Entri audit merekod tindakan sensitif dan tidak boleh disunting atau dipadam.
- Dokumen dan bukti bayaran disimpan dalam storan objek peribadi; hanya pengguna yang dibenarkan boleh mengambilnya.
- Pemberitahuan portal sentiasa direkodkan; penghantaran e-mel adalah pilihan dan tidak menghalang mesej portal.
- Data diproses di bawah **Akta Perlindungan Data Peribadi 2010**.
- Ibu bapa boleh meminta akses kepada data anak mereka dan mengemas kini maklumat hubungan sendiri melalui portal.
- Peraturan pengekalan menentukan tempoh setiap jenis data disimpan. Rekod yang ditandakan disemak oleh pentadbir sebelum dipadam atau dianonimkan.
- Entri audit dikekalkan selama **satu tahun**.

Jangan berkongsi akaun atau kata laluan. Gunakan akaun berasingan bagi setiap orang supaya jejak audit kekal tepat.

---

## 14. Penyelesaian masalah

### Saya tidak boleh log masuk

- Semak e-mel atau nombor IC dan kata laluan.
- Selepas lima percubaan gagal, tunggu **15 minit** untuk tempoh kunci tamat.
- Gunakan **Lupa kata laluan?** untuk meminta pautan tetapan semula.
- Jika akaun anda dinyahaktifkan, hubungi Pentadbir Sekolah atau Super Admin.

### Saya tidak boleh melihat sesuatu modul

- Modul bergantung kepada peranan dan sekolah aktif.
- Jika anda memegang peranan dalam lebih daripada satu sekolah, gunakan pemilih sekolah di bar atas.
- Jika akses masih tiada, minta pentadbir menyemak peranan anda.

### Ibu bapa tidak dapat melihat anak

- Anak mesti dipautkan kepada rekod ibu bapa.
- Pentadbir Sekolah boleh menambah pautan melalui rekod ibu bapa atau pelajar.
- Ibu bapa tidak boleh mencipta pautan sendiri.

### Ibu bapa tidak dapat melihat permohonan

- E-mel ibu bapa pada permohonan mesti sepadan dengan e-mel akaun ibu bapa.
- Gunakan nombor rujukan dan betulkan e-mel jika perlu.

### Tawaran telah hilang

- Tawaran senarai menunggu luput selepas **7 hari kalendar**.
- Jika tarikh akhir telah berlalu, tawaran luput. Semak semula permohonan dan rekod keputusan jika perlu.

### Bayaran tidak muncul dalam portal

- Staf merekodkan bayaran secara manual.
- Minta nombor resit dan pastikan bayaran direkodkan terhadap pelajar yang betul.
- Resit tidak pernah dipadam; resit yang dibatalkan kekal kelihatan dengan nombornya.

### Resit perlu dibatalkan

- Hanya Pentadbir Sekolah boleh membatalkan resit.
- Sebab pembatalan wajib diisi.
- Nombor resit dikekalkan. Jangan cuba memadam atau mengeluarkan semula nombor yang sama.

### Invois bulanan tiada

Semak perkara berikut:

- pelajar berstatus **Aktif**;
- **Pemantauan bulanan** dihidupkan;
- bulan mula pemantauan telah dicapai;
- bulan bil yang betul dipilih semasa **Jana invois bulanan**.

Sistem tidak membuat pro-rata dan tidak mencipta invois pendua bagi tempoh yang sama.

### Baki telah dihapus kira tetapi keluarga mahu membayar

Rekod bayaran dan pilih invois yang telah dihapus kira sebagai **Pemulihan baki hapus kira**. Bayaran tersebut dijejaki secara berasingan daripada hapus kira asal.

### Antara muka dalam bahasa yang salah

Gunakan suis **BM / EN** di bar atas atau tukar **Bahasa pilihan** dalam **Tetapan → Akaun saya**.

### Jadual terpotong pada telefon

Jadual boleh ditatal ke sisi di dalam bekasnya. Leret kawasan jadual. Jika halaman itu sendiri melimpah, laporkan halaman dan lebar peranti kepada pentadbir sistem.

### Siapa perlu dihubungi?

- **Kemasukan, rekod atau pautan portal** — Pentadbir Sekolah.
- **Bayaran, resit, bayaran balik atau tunggakan** — Bendahari atau Pentadbir Sekolah.
- **Akaun, peranan, import atau pengekalan data** — Pentadbir Sekolah; isu merentas sekolah — Super Admin.
- **Permintaan privasi** — pejabat sekolah.

---

## 15. Senarai semak operasi

### Harian

- Semak **Papan pemuka** untuk permohonan baharu, temuduga dan tindakan menunggu.
- Semak permohonan **Tidak lengkap** dan hubungi ibu bapa jika perlu.
- Rekod bayaran yang diterima dan pastikan resit dikeluarkan.
- Semak bayaran balik dan pelarasan yuran yang menunggu kelulusan.
- Semak pemberitahuan dan e-mel yang gagal.

### Mingguan

- Semak temuduga akan datang dan pastikan dua penilai ditugaskan.
- Semak markah yang belum disiapkan.
- Semak tunggakan dan peringatan yang perlu dilepaskan.
- Semak rekod pelajar atau ibu bapa yang tidak lengkap.

### Bulanan

- Jana invois bulanan untuk bulan berikutnya.
- Semak invois pendaftaran yang belum dijana.
- Semak laporan **Kutipan yuran**, **Penuaan tunggakan** dan **Daftar resit**.
- Semak hapus kira, bayaran balik dan pelarasan yuran bulan lalu.
- Semak rekod pengekalan data yang ditandakan.
- Semak akaun pengguna yang perlu dinyahaktifkan atau diaktifkan.

### Mengikut keperluan

- Kemas kini tetapan sekolah, butiran bank dan arahan bayaran apabila berlaku perubahan.
- Semak pelan yuran dan yuran pendaftaran sebelum sesi baharu.
- Import data pelajar, ibu bapa atau guru menggunakan pengesahan percubaan kering.
- Semak **Log audit** selepas perubahan kewangan atau data yang luar biasa.

---

## 16. Lampiran: istilah antara muka

| Istilah BM | Istilah Inggeris | Maksud ringkas |
| --- | --- | --- |
| **Papan pemuka** | Dashboard | Ringkasan operasi sekolah |
| **Kemasukan** | Admissions | Permohonan, temuduga, keputusan dan pendaftaran |
| **Permohonan** | Applications | Rekod permohonan kemasukan |
| **Temuduga** | Interviews | Sesi penilaian pemohon |
| **Penilai** | Assessor | Guru yang menilai temuduga |
| **Markah akhir** | Final mark | Purata markah dua penilai |
| **Markah lulus** | Pass mark | 40/100 |
| **Senarai menunggu** | Waiting list | Status pemohon yang menunggu tawaran |
| **Tawaran** | Offer | Tawaran tempat kepada pemohon senarai menunggu |
| **Berdaftar** | Registered | Pemohon telah menjadi pelajar |
| **Rekod** | Records | Pelajar, guru dan ibu bapa |
| **Pemantauan bulanan** | Monthly tracking | Penjanaan invois bulanan bagi pelajar |
| **Invois** | Invoice | Bil yuran |
| **Bayaran** | Payment | Bayaran tunai atau bank yang direkodkan staf |
| **Resit** | Receipt | Bukti bayaran bernombor berturutan |
| **Tunggakan** | Arrears | Baki invois yang belum dibayar |
| **Bayaran balik** | Refund | Pemulangan kredit pelajar |
| **Hapus kira** | Write-off | Penghapusan baki tertunggak oleh Pentadbir Sekolah |
| **Pelarasan yuran** | Fee adjustment | Perubahan yuran bulanan pelajar |
| **Lejar am** | General ledger | Rekod debit, kredit dan baki berjalan |
| **Laporan** | Reports | Laporan PDF, CSV dan Excel |
| **Log audit** | Audit log | Rekod tindakan sensitif yang tidak boleh diubah |
| **Import data** | Data import | Import CSV dengan pengesahan percubaan kering |
| **Pengekalan data** | Data retention | Semakan tempoh simpan dan tindakan data |
| **Pengguna & peranan** | Users & roles | Akaun staf dan ibu bapa |
| **Tetapan** | Settings | Konfigurasi sekolah, yuran dan akaun |
| **Pemberitahuan** | Notifications | Mesej portal dan status e-mel |

---

*Tamat panduan.*
