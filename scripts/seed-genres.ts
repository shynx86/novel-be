import admin from "firebase-admin";

const PROJECT_ID = process.env.PROJECT_ID || "novel-ecbcc";

const genres = [
  { name: "Tiên Hiệp", slug: "tien-hiep" },
  { name: "Kiếm Hiệp", slug: "kiem-hiep" },
  { name: "Ngôn Tình", slug: "ngon-tinh" },
  { name: "Đam Mỹ", slug: "dam-my" },
  { name: "Huyền Huyễn", slug: "huyen-huyen" },
  { name: "Đô Thị", slug: "do-thi" },
  { name: "Võng Du", slug: "vong-du" },
  { name: "Khoa Huyễn", slug: "khoa-huyen" },
  { name: "Xuyên Không", slug: "xuyen-khong" },
  { name: "Trọng Sinh", slug: "trong-sinh" },
  { name: "Cổ Đại", slug: "co-dai" },
  { name: "Điền Văn", slug: "dien-van" },
  { name: "Linh Dị", slug: "linh-di" },
  { name: "Quan Trường", slug: "quan-truong" },
  { name: "Hệ Thống", slug: "he-thong" },
  { name: "Dị Năng", slug: "di-nang" },
  { name: "Tình Cảm", slug: "tinh-cam" },
  { name: "Hài Hước", slug: "hai-huoc" },
  { name: "Khủng Bố", slug: "khung-bo" },
  { name: "Phiêu Lưu", slug: "phieu-luu" },
  { name: "Kinh Dị", slug: "kinh-di" },
  { name: "Việt Nam", slug: "viet-nam" },
  { name: "Truyện Tranh", slug: "truyen-tranh" },
  { name: "Ngược", slug: "nguoc" },
  { name: "Sủng", slug: "sung" },
  { name: "Nữ Cường", slug: "nu-cuong" },
  { name: "Xuyên Nhanh", slug: "xuyen-nhanh" },
  { name: "Thế Giới Đảo Ngược", slug: "the-gioi-dao-nguoc" },
  { name: "Bách Hợp", slug: "bach-hop" },
  { name: "Cổ Đại", slug: "co-dai-2" },
];

async function seed() {
  admin.initializeApp({
    projectId: PROJECT_ID,
  });

  const db = admin.firestore();

  const batch = db.batch();
  for (const genre of genres) {
    const ref = db.collection("genres").doc(genre.slug);
    batch.set(ref, {
      name: genre.name,
      slug: genre.slug,
      novel_count: 0,
    });
  }

  await batch.commit();
  console.log(`Seeded ${genres.length} genres`);

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
