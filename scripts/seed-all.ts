import admin from "firebase-admin";

const PROJECT_ID = process.env.PROJECT_ID || "novel-ecbcc";

// ─── Genres ──────────────────────────────────────────────────────────────────

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
  { name: "Cổ Đại 2", slug: "co-dai-2" },
];

// ─── Authors ─────────────────────────────────────────────────────────────────

const authors = [
  "Ngô Thanh Hà",
  "Lý Minh Tuấn",
  "Trần Thị Bích",
  "Phạm Văn Dũng",
  "Hoàng Thị Mai",
  "Nguyễn Đức Phong",
  "Vũ Thanh Tùng",
  "Đỗ Thị Lan",
  "Bùi Minh Châu",
  "Lê Hoàng Nam",
];

// ─── Cover URLs (placeholders) ───────────────────────────────────────────────

function coverUrl(id: number): string {
  return `https://picsum.photos/seed/novel${id}/300/400`;
}

// ─── Novel Data ──────────────────────────────────────────────────────────────

interface NovelInput {
  title: string;
  description: string;
  author: string;
  genres: string[];
  status: "ongoing" | "completed" | "hiatus";
  rating: number;
  views: number;
  followers: number;
  price: number | null;
}

const novelsData: NovelInput[] = [
  {
    title: "Phàm Nhân Tu Tiên",
    description: "Một thiếu niên平凡生活在 một làng quê nhỏ, tình cờ phát hiện một viên thuốc tiên cổ xưa, từ đó bước trên con đường tu tiên.",
    author: authors[0],
    genres: ["Tiên Hiệp", "Phiêu Lưu"],
    status: "ongoing",
    rating: 4.5,
    views: 125000,
    followers: 3200,
    price: null,
  },
  {
    title: "Kiếm Vương Già Thế Gian",
    description: "Một kiếm tu bị phế bỏ thiên phú,凭借 một thanh kiếm gãy tái xuất giang hồ, viết nên truyền thuyết.",
    author: authors[1],
    genres: ["Kiếm Hiệp", "Ngược"],
    status: "completed",
    rating: 4.8,
    views: 340000,
    followers: 8900,
    price: null,
  },
  {
    title: "Yêu Anh Từ Cái Nhìn Đầu Tiên",
    description: "Cô gái xinh đẹp nhất trường đại học phải lòng game thủ nghèo, tình yêu nảy nở trong thế giới ảo.",
    author: authors[2],
    genres: ["Ngôn Tình", "Sủng"],
    status: "completed",
    rating: 4.3,
    views: 210000,
    followers: 5600,
    price: null,
  },
  {
    title: "Hệ Thống Sát Thủ",
    description: "Một sát thủ bị sát hại sống lại với hệ thống, mỗi lần hoàn thành nhiệm vụ sẽ nhận được kỹ năng mới.",
    author: authors[3],
    genres: ["Hệ Thống", "Đô Thị"],
    status: "ongoing",
    rating: 4.6,
    views: 180000,
    followers: 4100,
    price: null,
  },
  {
    title: "Xuyên Nhanh: Vai Phản Diện Bị Sủng Lên Mây",
    description: "Cô gái xuyên vào các tiểu thuyết, mỗi thế giới đều có một nam phản diện đẹp trai đem lòng yêu cô.",
    author: authors[4],
    genres: ["Xuyên Nhanh", "Sủng"],
    status: "ongoing",
    rating: 4.7,
    views: 290000,
    followers: 7200,
    price: 50000,
  },
  {
    title: "Đô Thị Tiên Tôn",
    description: "Một tiên nhân chuyển sinh về都市, dùng pháp thuật giải quyết vấn đề đời thường, che giấu thân phận.",
    author: authors[5],
    genres: ["Đô Thị", "Tiên Hiệp"],
    status: "ongoing",
    rating: 4.2,
    views: 95000,
    followers: 2100,
    price: null,
  },
  {
    title: "Trọng Sinh Chi Khoa Học Ma Vương",
    description: "Ma Vương đại thiên cựu thế giới bị đánh bại, trọng sinh làm học sinh cấp ba, dùng kiến thức khoa học chinh phục thế giới mới.",
    author: authors[6],
    genres: ["Trọng Sinh", "Khoa Huyễn"],
    status: "completed",
    rating: 4.4,
    views: 156000,
    followers: 3800,
    price: null,
  },
  {
    title: "Huyền Huyễn: Ta Có Một Cái Nông Trại",
    description: "Xuyên qua thế giới huyền huyễn, mở nông trại thần bí, trồng linh dược, nuôi thần thú, từ từ cường đại.",
    author: authors[7],
    genres: ["Huyền Huyễn", "Điền Văn"],
    status: "ongoing",
    rating: 4.1,
    views: 88000,
    followers: 1900,
    price: null,
  },
  {
    title: "Võng Du: Thiên Hạ Vô Song",
    description: "Game full dive đầu tiên trên thế giới, một thanh niên bình thường trở thành chiến binh huyền thoại.",
    author: authors[8],
    genres: ["Võng Du", "Phiêu Lưu"],
    status: "completed",
    rating: 4.5,
    views: 201000,
    followers: 4500,
    price: null,
  },
  {
    title: "Kinh Dị: Ngôi Nhà Trên Đồi",
    description: "Một gia đình chuyển đến ngôi nhà cổ trên đồi, họ phát hiện ra những bí mật kinh hoàng ẩn giấu bên trong.",
    author: authors[9],
    genres: ["Kinh Dị", "Khủng Bố"],
    status: "completed",
    rating: 4.3,
    views: 145000,
    followers: 3300,
    price: 30000,
  },
  {
    title: "Cổ Đại: Vương Phi Tài Năng",
    description: "Nữ chính xuyên không trở thành vương phi, dùng tài năng và trí tuệ chinh phục cổ đại.",
    author: authors[2],
    genres: ["Cổ Đại", "Ngôn Tình"],
    status: "ongoing",
    rating: 4.6,
    views: 267000,
    followers: 6800,
    price: null,
  },
  {
    title: "Dị Năng: Thế Giới Mới",
    description: "Thảm họa zombie, con người thức tỉnh dị năng, chiến đấu để sinh tồn trong thế giới mới.",
    author: authors[3],
    genres: ["Dị Năng", "Phiêu Lưu"],
    status: "ongoing",
    rating: 4.4,
    views: 178000,
    followers: 4200,
    price: null,
  },
  {
    title: "Ngược: Bạch Nguyệt Quang",
    description: "Cô gái bị người yêu bỏ rơi, sau khi trở thành ngôi sao hàng đầu, anh ta hối hận không kịp.",
    author: authors[4],
    genres: ["Ngược", "Đô Thị"],
    status: "completed",
    rating: 4.2,
    views: 134000,
    followers: 3100,
    price: null,
  },
  {
    title: "Nữ Cường: Thần Y Phó Tổng",
    description: "Nữ y sĩ tài năng kết hôn với tổng tài lạnh lùng, dùng y thuật và trí tuệ làm rung chuyển giới thượng lưu.",
    author: authors[2],
    genres: ["Nữ Cường", "Đô Thị"],
    status: "ongoing",
    rating: 4.7,
    views: 312000,
    followers: 7500,
    price: 45000,
  },
  {
    title: "Linh Dị: Thư Viện Bí Ẩn",
    description: "Một thư viện cũ chứa những cuốn sách có thể đưa người đọc vào thế giới bên trong.",
    author: authors[5],
    genres: ["Linh Dị", "Kinh Dị"],
    status: "ongoing",
    rating: 4.3,
    views: 112000,
    followers: 2600,
    price: null,
  },
  {
    title: "Hài Hước: Ta Là Chúa Tể F5",
    description: "Một nhân viên văn phòng xuyên qua thế giới khác với khả năng F5 mọi thứ, biến thế giới huyền huyễn thành trò chơi.",
    author: authors[8],
    genres: ["Hài Hước", "Huyền Huyễn"],
    status: "ongoing",
    rating: 4.5,
    views: 165000,
    followers: 3900,
    price: null,
  },
  {
    title: "Bách Hợp: Hoa Sen Trắng",
    description: "Hai cô gái gặp nhau trong hoàn cảnh éo le, tình yêu giữa họ vượt qua mọi định kiến.",
    author: authors[2],
    genres: ["Bách Hợp", "Ngôn Tình"],
    status: "completed",
    rating: 4.6,
    views: 198000,
    followers: 5100,
    price: null,
  },
  {
    title: "Đam Mỹ: Vụ Luật Tình Yêu",
    description: "Một luật sư lạnh lùng phải bảo vệ thân chủ đẹp trai trong vụ án phức tạp, tình cảm dần nảy sinh.",
    author: authors[4],
    genres: ["Đam Mỹ", "Đô Thị"],
    status: "ongoing",
    rating: 4.8,
    views: 356000,
    followers: 9200,
    price: 55000,
  },
  {
    title: "Xuyên Không: Hoàng Hậu Ma Pháp",
    description: "Cô gái hiện đại xuyên vào thế giới ma pháp, trở thành hoàng hậu bị ruồng bỏ, dùng kiến thức hiện đại thay đổi cả đế quốc.",
    author: authors[7],
    genres: ["Xuyên Không", "Cổ Đại"],
    status: "completed",
    rating: 4.4,
    views: 189000,
    followers: 4600,
    price: null,
  },
  {
    title: "Thế Giới Đảo Ngược: Người Cuối Cùng",
    description: "Thế giới đảo ngược, người giàu nhất trở thành người nghèo nhất, chỉ có một người nhớ mọi thứ.",
    author: authors[6],
    genres: ["Thế Giới Đảo Ngược", "Khoa Huyễn"],
    status: "ongoing",
    rating: 4.1,
    views: 76000,
    followers: 1700,
    price: null,
  },
  {
    title: "Việt Nam: Hương Rừng Phố Thị",
    description: "Câu chuyện về cuộc sống ở nông thôn Việt Nam, con người và phong tục tập quán.",
    author: authors[9],
    genres: ["Việt Nam", "Điền Văn"],
    status: "completed",
    rating: 4.0,
    views: 67000,
    followers: 1400,
    price: null,
  },
  {
    title: "Quan Trường: Nhất Phẩm Cẩm Y",
    description: "Một thiếu gia thời Minh trở thành quan thần, dùng tài năng và tham vọng leo lên đỉnh cao quyền lực.",
    author: authors[1],
    genres: ["Quan Trường", "Cổ Đại"],
    status: "ongoing",
    rating: 4.5,
    views: 203000,
    followers: 4800,
    price: null,
  },
  {
    title: "Điền Văn: Mật Ong Đắng",
    description: "Cô gái trẻ về nông thôn trồng hoa, cuộc sống bình yên xen lẫn những sóng gió tình cảm.",
    author: authors[7],
    genres: ["Điền Văn", "Tình Cảm"],
    status: "completed",
    rating: 4.2,
    views: 118000,
    followers: 2800,
    price: null,
  },
  {
    title: "Truyện Tranh: One Piece Việt",
    description: "Phiên bản Việt Nam của cuộc phiêu lưu trên biển, nhóm bạn trẻ tìm kho báu huyền thoại.",
    author: authors[8],
    genres: ["Truyện Tranh", "Phiêu Lưu"],
    status: "ongoing",
    rating: 4.3,
    views: 142000,
    followers: 3400,
    price: null,
  },
  {
    title: "Ngôn Tình: Chief Secretary's Love",
    description: "Thư ký tài năng và giám đốc đẹp trai, mối quan hệ công việc dần trở thành tình yêu.",
    author: authors[2],
    genres: ["Ngôn Tình", "Sủng"],
    status: "completed",
    rating: 4.1,
    views: 128000,
    followers: 2900,
    price: null,
  },
  {
    title: "Kiếm Hiệp: Bất Tử Kiếm Thần",
    description: "Một kiếm tu bất tử, sống qua hàng ngàn năm, chứng kiến sự thay đổi của nhân loại.",
    author: authors[1],
    genres: ["Kiếm Hiệp", "Tiên Hiệp"],
    status: "ongoing",
    rating: 4.7,
    views: 275000,
    followers: 6500,
    price: 40000,
  },
  {
    title: "Tiên Hiệp: Ngạo Thế Tiên Đồ",
    description: "Thiếu niên bình thường được tiên nhân truyền thụ, từ đây bắt đầu hành trình tu tiên nghịch thiên.",
    author: authors[0],
    genres: ["Tiên Hiệp", "Phiêu Lưu"],
    status: "completed",
    rating: 4.4,
    views: 198000,
    followers: 4700,
    price: null,
  },
  {
    title: "Hệ Thống: Siêu Cấp Thần Binh",
    description: "Một thợ rèn nhận được hệ thống tạo ra vũ khí thần kỳ, mỗi vũ khí đều có sức mạnh đặc biệt.",
    author: authors[6],
    genres: ["Hệ Thống", "Huyền Huyễn"],
    status: "ongoing",
    rating: 4.6,
    views: 221000,
    followers: 5300,
    price: null,
  },
  {
    title: "Trọng Sinh: Bệ Hạ, Lại Bỏ Trốn Rồi",
    description: "Hoàng đế trọng sinh, lần này quyết tâm làm chủ vận mệnh, nhưng hoàng hậu luôn tìm cách bỏ trốn.",
    author: authors[4],
    genres: ["Trọng Sinh", "Cổ Đại"],
    status: "completed",
    rating: 4.8,
    views: 389000,
    followers: 9800,
    price: 60000,
  },
  {
    title: "Dị Năng: Siêu Nhiên Học Viện",
    description: "Học viện dành cho người có dị năng, mỗi học sinh đều có khả năng đặc biệt, nhưng bí mật lớn đang chờ đợi.",
    author: authors[3],
    genres: ["Dị Năng", "Khoa Huyễn"],
    status: "ongoing",
    rating: 4.3,
    views: 156000,
    followers: 3600,
    price: null,
  },
];

// ─── Chapter Content Generator ───────────────────────────────────────────────

function generateChapterContent(title: string, chapterIndex: number, wordCount = 500): string {
  const paragraphs: string[] = [];
  const paragraphCount = Math.ceil(wordCount / 60);

  const openings = [
    "Ánh nắng chiều chiếu xuyên qua cửa sổ, phủ lên bức tường đá một màu vàng nhạt.",
    "Gió lạnh thổi qua hành lang đá, mang theo mùi hương của núi rừng.",
    "Tiếng chim hót vang vọng khắp cánh rừng, đánh dấu một ngày mới bắt đầu.",
    "Mây đen che phủ bầu trời, dấu hiệu của một trận chiến sắp đến.",
    "Không khí trong lành của buổi sáng sớm khiến tâm hồn cảm thấy bình yên.",
    "Tiếng bước chân vang lên trong hành lang vắng, càng lúc càng gần hơn.",
    "Ánh trăng sáng tỏa xuống sân vườn, phủ lên mọi thứ một lớp bạc.",
    "Mưa rơi tí tách trên mái nhà, tạo nên một bản nhạc du dương.",
    "Cảnh vật xung quanh im lặng đến lạ thường, chỉ có tiếng thở nhẹ của con người.",
    "ánh sáng yếu ớt của ngọn đèn dầu chiếu sáng khuôn mặt mệt mỏi.",
  ];

  const middles = [
    "Hắn ta không thể tin được những gì vừa xảy ra, mọi thứ dường như quá đỗi bất ngờ.",
    "Cô ấy quay người bước đi, không quay lại nhìn dù chỉ một lần.",
    "Cảm giác tuyệt vọng tràn ngập, nhưng sâu thẳm trong lòng vẫn còn một tia hy vọng.",
    "Quá khứ ùa về như một cơn sóng, mang theo những kỷ niệm đẹp và đau thương.",
    "Hắn ta nắm chặt tay, quyết tâm sẽ không bao giờ bỏ cuộc.",
    "Không ai trong số họ nói lời nào, sự im lặng nói lên tất cả.",
    "Thời gian trôi qua, nhưng nỗi đau vẫn còn đó, âm ỉ như ngọn lửa nhỏ.",
    "Họ nhìn nhau, trong đôi mắt ấy chứa đựng cả một thế giới tình cảm.",
    "Trái tim đập nhanh hơn, cảm xúc dâng trào không thể kiềm chế.",
    "Mọi thứ dường như đã được sắp đặt từ trước, như một vòng tròn không có điểm dừng.",
  ];

  const endings = [
    "Và rồi, mọi thứ sẽ thay đổi, chỉ là không ai biết trước được điều đó.",
    "Buổi chiều buông xuống, để lại trong lòng每个人 những suy tư khó tả.",
    "Hắn ta mỉm cười, biết rằng phía trước còn rất nhiều thử thách.",
    "Cánh cửa phía trước từ từ mở ra, ánh sáng chiếu vào.",
    "Trong lòng每个人 đều hiểu rằng, đây chỉ mới là sự khởi đầu.",
    "Đêm buông xuống, nhưng chiến thắng đã thuộc về chúng ta.",
    "Họ bước tiếp trên con đường, không biết tương lai sẽ ra sao.",
    "Và thế là cuộc phiêu lưu mới bắt đầu.",
    "Tất cả đều thay đổi, nhưng tình bạn thì không bao giờ thay đổi.",
    "Bầu trời trong xanh trở lại, mang theo hy vọng cho ngày mai.",
  ];

  for (let i = 0; i < paragraphCount; i++) {
    const opening = openings[i % openings.length];
    const middle = middles[(i + chapterIndex) % middles.length];
    const ending = endings[(i + chapterIndex * 2) % endings.length];
    paragraphs.push(`${opening} ${middle} ${ending}`);
  }

  return paragraphs.join("\n\n");
}

// ─── Users ───────────────────────────────────────────────────────────────────

interface TestUser {
  uid: string;
  email: string;
  displayName: string;
  credits: number;
  role: string;
  favoriteNovels: number[]; // indices into novelsData
  readingHistory: { novelIndex: number; chapters: number[] }[];
  subscriptions: { novelIndex: number; chapterIndex: number }[];
}

const testUsers: TestUser[] = [
  {
    uid: "test-user-001",
    email: "minh@example.com",
    displayName: "Nguyễn Minh",
    credits: 500000,
    role: "user",
    favoriteNovels: [0, 2, 4, 6, 8, 10, 13],
    readingHistory: [
      { novelIndex: 0, chapters: [1, 2, 3, 4, 5] },
      { novelIndex: 2, chapters: [1, 2, 3] },
      { novelIndex: 4, chapters: [1, 2] },
      { novelIndex: 6, chapters: [1, 2, 3, 4] },
    ],
    subscriptions: [
      { novelIndex: 4, chapterIndex: 3 },
      { novelIndex: 4, chapterIndex: 4 },
    ],
  },
  {
    uid: "test-user-002",
    email: "lan@example.com",
    displayName: "Trần Thị Lan",
    credits: 300000,
    role: "user",
    favoriteNovels: [1, 3, 5, 9, 12, 17],
    readingHistory: [
      { novelIndex: 1, chapters: [1, 2, 3, 4, 5, 6] },
      { novelIndex: 3, chapters: [1, 2, 3] },
      { novelIndex: 9, chapters: [1] },
    ],
    subscriptions: [
      { novelIndex: 9, chapterIndex: 2 },
      { novelIndex: 17, chapterIndex: 2 },
    ],
  },
  {
    uid: "test-user-003",
    email: "admin@novel.com",
    displayName: "Admin",
    credits: 1000000,
    role: "admin",
    favoriteNovels: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    readingHistory: [
      { novelIndex: 0, chapters: [1, 2, 3, 4, 5, 6, 7] },
      { novelIndex: 1, chapters: [1, 2, 3, 4, 5] },
      { novelIndex: 2, chapters: [1, 2, 3, 4, 5, 6] },
      { novelIndex: 3, chapters: [1, 2, 3, 4] },
    ],
    subscriptions: [
      { novelIndex: 4, chapterIndex: 2 },
      { novelIndex: 4, chapterIndex: 3 },
      { novelIndex: 4, chapterIndex: 4 },
    ],
  },
];

// ─── Comments per novel ──────────────────────────────────────────────────────

interface CommentInput {
  userIndex: number;
  content: string;
  replies?: { userIndex: number; content: string }[];
}

const commentsPerNovel: CommentInput[][] = [
  [
    { userIndex: 0, content: "Truyện hay quá, đọc không ngừng được!", replies: [{ userIndex: 1, content: "Đúng vậy, mình cũng nghiện luôn" }] },
    { userIndex: 1, content: "Tác giả viết đỉnh thật sự" },
    { userIndex: 2, content: "Chờ chap mới hoài luôn á" },
  ],
  [
    { userIndex: 1, content: "Nam chính quá ngầu, nữ chính cũng xinh" },
    { userIndex: 0, content: "Cốt truyện hấp dẫn, không thể dừng đọc" },
    { userIndex: 2, content: "Hay quá, cho mình xin spoiler được không?" },
  ],
  [
    { userIndex: 2, content: "Tình tiết lãng mạn quá, đọc mà thẹn thùng" },
    { userIndex: 0, content: "Couple này đẹp đôi quá đi mất" },
    { userIndex: 1, content: "Mong tác giả update nhanh nha" },
  ],
  [
    { userIndex: 0, content: "Hệ thống này hay ghê, muốn có thật" },
    { userIndex: 1, content: "Truyện hay nhưng update chậm quá" },
    { userIndex: 2, content: "Thích cách tác giả phát triển nhân vật" },
  ],
  [
    { userIndex: 1, content: "Xuyên nhanh mà hay, mỗi thế giới là một câu chuyện" },
    { userIndex: 0, content: "Nam phản diện dễ thương quá trời luôn" },
    { userIndex: 2, content: "Đáng yêu muốn xỉu luôn á" },
  ],
  [
    { userIndex: 2, content: "Truyện sáng tạo, nội dung mới lạ" },
    { userIndex: 0, content: "Đọc mà muốn làm tiên nhân luôn" },
    { userIndex: 1, content: "Hài hước nữa, đọc cười cả ngày" },
  ],
  [
    { userIndex: 0, content: "Trọng sinh mà viết hay lắm" },
    { userIndex: 1, content: "Thích cách nhân vật chính dùng khoa học" },
    { userIndex: 2, content: "Nội dung hấp dẫn từ đầu đến cuối" },
  ],
  [
    { userIndex: 1, content: "Nông trại dễ thương quá, muốn thử" },
    { userIndex: 0, content: "Truyện nhẹ nhàng, đọc thư giãn tốt" },
    { userIndex: 2, content: "Thần thú trong truyện dễ thương muốn xỉu" },
  ],
  [
    { userIndex: 2, content: "Game hay ghê, muốn chơi game tương tự" },
    { userIndex: 0, content: "Cốt truyện game đỉnh cao" },
    { userIndex: 1, content: "Hành trình của nhân vật chính rất cuốn hút" },
  ],
  [
    { userIndex: 0, content: "Đọc mà sợ muốn rụng tim luôn" },
    { userIndex: 1, content: "Kinh dị hay quá, nhưng đọc ban đêm hơi sợ" },
    { userIndex: 2, content: "Mật mã trong truyện thú vị thật sự" },
  ],
  [
    { userIndex: 1, content: "Nữ chính mạnh mẽ quá, thích lắm" },
    { userIndex: 0, content: "Cổ đại mà viết hiện đại ghê" },
    { userIndex: 2, content: "Tình tiết cung đấu gay cấn quá" },
  ],
  [
    { userIndex: 2, content: "Dị năng hay, zombie đáng sợ thật" },
    { userIndex: 0, content: "Mỗi nhân vật có sức mạnh riêng, thú vị" },
    { userIndex: 1, content: "Truyện hấp dẫn từ đầu đến cuối" },
  ],
  [
    { userIndex: 0, content: "Ngược đọc mà đau lòng quá" },
    { userIndex: 1, content: "Nam chính đáng ghét, nhưng truyện hay" },
    { userIndex: 2, content: "Mong nữ chính tìm được hạnh phúc mới" },
  ],
  [
    { userIndex: 1, content: "Nữ chính vừa đẹp vừa tài năng, ai mà không thích" },
    { userIndex: 0, content: "Tổng tài lạnh lùng dễ thương quá" },
    { userIndex: 2, content: "Truyện hot nhất mùa này, đọc liền đi" },
  ],
  [
    { userIndex: 2, content: "Thư viện bí ẩn đọc mà rợn người luôn" },
    { userIndex: 0, content: "Sách phép thuật hay quá, muốn có thật" },
    { userIndex: 1, content: "Tác giả viết kinh dị đỉnh cao" },
  ],
  [
    { userIndex: 0, content: "F5 mọi thứ有趣 quá ha" },
    { userIndex: 1, content: "Hài hước đọc cười vỡ bụng" },
    { userIndex: 2, content: "Nhân vật chính ngây ngô dễ thương" },
  ],
  [
    { userIndex: 1, content: "Tình yêu đẹp quá, đọc mà cảm động" },
    { userIndex: 0, content: "Hai nhân vật nữ chemistry tốt quá" },
    { userIndex: 2, content: "Truyện tình cảm hay nhất mình từng đọc" },
  ],
  [
    { userIndex: 2, content: "Nam chính luật sư ngầu quá trời" },
    { userIndex: 0, content: "Cặp này đẹp đôi nhất quả đất" },
    { userIndex: 1, content: "Truyện đam mỹ hay nhất từ trước đến giờ" },
  ],
  [
    { userIndex: 0, content: "Xuyên không mà sáng tạo quá" },
    { userIndex: 1, content: "Hoàng hậu thông minh, ai cũng yêu" },
    { userIndex: 2, content: "Thế giới ma pháp vẽ ra sinh động quá" },
  ],
  [
    { userIndex: 1, content: "Thế giới đảo ngược创意 hay ghê" },
    { userIndex: 0, content: "Người cuối cùng nhớ mọi thứ, tội nghiệp quá" },
    { userIndex: 2, content: "Truyện ý nghĩa, đọc suy nghĩ nhiều" },
  ],
  [
    { userIndex: 2, content: "Phong tục Việt Nam được vẽ ra chân thật quá" },
    { userIndex: 0, content: "Đọc mà nhớ quê hương quá" },
    { userIndex: 1, content: "Truyện nhẹ nhàng, đáng yêu" },
  ],
  [
    { userIndex: 0, content: "Quan trường tranh đấu gay cấn quá" },
    { userIndex: 1, content: "Thiếu gia tài giỏi, ai cũng nể phục" },
    { userIndex: 2, content: "Truyện lịch sử hay, muốn đọc thêm" },
  ],
  [
    { userIndex: 1, content: "Nông thôn yên bình, đọc thư giãn tốt" },
    { userIndex: 0, content: "Hoa đẹp, mật ong ngon, truyện hay" },
    { userIndex: 2, content: "Tình cảm nhẹ nhàng, không drama quá" },
  ],
  [
    { userIndex: 2, content: "One Piece Việt hay quá, yêu luôn" },
    { userIndex: 0, content: "Nhóm bạn dễ thương, phiêu lưu thú vị" },
    { userIndex: 1, content: "Truyện vẽ đẹp, nội dung hay" },
  ],
  [
    { userIndex: 0, content: "Secretary cute quá, đọc mà thích" },
    { userIndex: 1, content: "Chief secretary ngầu, couple đẹp" },
    { userIndex: 2, content: "Truyện tình cảm nhẹ nhàng, đáng yêu" },
  ],
  [
    { userIndex: 1, content: "Kiếm thần bất tử ngầu quá trời" },
    { userIndex: 0, content: "Truyện kiếm hiệp hay nhất từ trước đến giờ" },
    { userIndex: 2, content: "Mong tác giả viết dài dài nha" },
  ],
  [
    { userIndex: 2, content: "Thiếu niên tu tiên hay quá, đọc liền" },
    { userIndex: 0, content: "Thiên phú bình thường mà thành tiên, truyền cảm hứng" },
    { userIndex: 1, content: "Truyện tiên hiệp hay nhất mình đọc" },
  ],
  [
    { userIndex: 0, content: "Hệ thống tạo vũ khí thần kỳ, hay quá" },
    { userIndex: 1, content: "Thợ rèn tài giỏi, ai cũng nể" },
    { userIndex: 2, content: "Truyện sáng tạo, nội dung mới lạ" },
  ],
  [
    { userIndex: 1, content: "Hoàng hậu bỏ trốn搞笑 quá ha" },
    { userIndex: 0, content: "Hoàng đế trọng sinh mà dễ thương quá" },
    { userIndex: 2, content: "Truyện hay nhất mình đọc, 10 điểm" },
  ],
  [
    { userIndex: 2, content: "Siêu nhiên học viện hay quá, muốn vào học" },
    { userIndex: 0, content: "Mỗi học sinh có khả năng riêng, thú vị" },
    { userIndex: 1, content: "Truyện hứa hẹn sẽ hay hơn nữa" },
  ],
];

// ─── Seed Functions ──────────────────────────────────────────────────────────

async function clearCollection(db: admin.firestore.Firestore, collectionPath: string) {
  const snapshot = await db.collection(collectionPath).get();
  if (snapshot.empty) return;

  const batch = db.batch();
  let count = 0;
  for (const doc of snapshot.docs) {
    batch.delete(doc.ref);
    count++;
    if (count % 500 === 0) {
      await batch.commit();
    }
  }
  if (count % 500 !== 0) {
    await batch.commit();
  }
  console.log(`  Cleared ${count} docs from ${collectionPath}`);
}

async function clearAllData(db: admin.firestore.Firestore) {
  console.log("Clearing existing data...");

  // Clear genres
  await clearCollection(db, "genres");

  // Clear novels and subcollections
  const novelsSnap = await db.collection("novels").get();
  for (const novelDoc of novelsSnap.docs) {
    // Clear chapters
    await clearCollection(db, `novels/${novelDoc.id}/chapters`);
    // Clear comments
    await clearCollection(db, `novels/${novelDoc.id}/comments`);
    await novelDoc.ref.delete();
  }
  console.log(`  Cleared ${novelsSnap.size} novels with subcollections`);

  // Clear subscriptions
  await clearCollection(db, "subscriptions");

  // Clear credit_transactions
  await clearCollection(db, "credit_transactions");

  // Clear users and subcollections
  const usersSnap = await db.collection("users").get();
  for (const userDoc of usersSnap.docs) {
    await clearCollection(db, `users/${userDoc.id}/favorites`);
    await clearCollection(db, `users/${userDoc.id}/reading_history`);
    await userDoc.ref.delete();
  }
  console.log(`  Cleared ${usersSnap.size} users with subcollections`);

  console.log("All data cleared.\n");
}

async function seedGenres(db: admin.firestore.Firestore) {
  console.log(`Seeding ${genres.length} genres...`);
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
  console.log("  Done.\n");
}

function randomDate(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - Math.floor(Math.random() * daysAgo));
  date.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60), Math.floor(Math.random() * 60));
  return date.toISOString();
}

async function seedNovels(db: admin.firestore.Firestore): Promise<string[]> {
  console.log(`Seeding ${novelsData.length} novels...`);
  const novelIds: string[] = [];
  const now = new Date().toISOString();

  const batch = db.batch();
  let batchCount = 0;

  for (let i = 0; i < novelsData.length; i++) {
    const novel = novelsData[i];
    const slug = novel.title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    const createdAt = randomDate(180);
    const docRef = db.collection("novels").doc();

    batch.set(docRef, {
      slug,
      title: novel.title,
      description: novel.description,
      author: novel.author,
      cover_url: coverUrl(i + 1),
      genre: novel.genres,
      status: novel.status,
      chapter_count: 0,
      total_word_count: 0,
      rating: novel.rating,
      views: novel.views,
      followers: novel.followers,
      comment_count: 0,
      price: novel.price,
      created_at: createdAt,
      updated_at: now,
    });

    novelIds.push(docRef.id);
    batchCount++;

    if (batchCount % 450 === 0) {
      await batch.commit();
    }
  }

  if (batchCount % 450 !== 0) {
    await batch.commit();
  }

  console.log("  Done.\n");
  return novelIds;
}

async function seedChapters(db: admin.firestore.Firestore, novelIds: string[]) {
  console.log(`Seeding chapters for ${novelIds.length} novels...`);
  let totalChapters = 0;

  for (let i = 0; i < novelIds.length; i++) {
    const novelId = novelIds[i];
    const chapterCount = 15 + Math.floor(Math.random() * 6); // 15-20 chapters
    const novelTitle = novelsData[i].title;
    const isFree = novelsData[i].price === null;

    const batch = db.batch();
    let totalWordCount = 0;

    for (let ch = 1; ch <= chapterCount; ch++) {
      const wordCount = 400 + Math.floor(Math.random() * 400); // 400-800 words
      totalWordCount += wordCount;

      let accessType: "free" | "free_auth" | "paid";
      if (isFree) {
        accessType = ch <= 3 ? "free" : "free_auth";
      } else {
        if (ch <= 2) accessType = "free";
        else if (ch <= 5) accessType = "free_auth";
        else accessType = "paid";
      }

      const content = generateChapterContent(novelTitle, ch, wordCount);
      const createdAt = randomDate(120);

      const chapterRef = db.collection("novels").doc(novelId).collection("chapters").doc(String(ch));
      batch.set(chapterRef, {
        index: ch,
        title: `Chương ${ch}`,
        content,
        word_count: wordCount,
        access_type: accessType,
        price: accessType === "paid" ? 5000 + Math.floor(Math.random() * 10000) : 0,
        created_at: createdAt,
        updated_at: createdAt,
      });

      totalChapters++;
    }

    // Update novel counters
    const novelRef = db.collection("novels").doc(novelId);
    batch.update(novelRef, {
      chapter_count: chapterCount,
      total_word_count: totalWordCount,
    });

    await batch.commit();
  }

  console.log(`  Seeded ${totalChapters} chapters total.\n`);
}

async function seedUsers(db: admin.firestore.Firestore): Promise<string[]> {
  console.log(`Seeding ${testUsers.length} users...`);
  const userIds: string[] = [];
  const now = new Date().toISOString();

  for (const user of testUsers) {
    const userRef = db.collection("users").doc(user.uid);
    await userRef.set({
      email: user.email,
      display_name: user.displayName,
      avatar_url: `https://picsum.photos/seed/${user.uid}/100/100`,
      credits: user.credits,
      role: user.role,
      created_at: now,
      updated_at: now,
    });
    userIds.push(user.uid);
  }

  console.log("  Done.\n");
  return userIds;
}

async function seedFavorites(db: admin.firestore.Firestore, novelIds: string[]) {
  console.log("Seeding favorites...");
  let count = 0;

  for (const user of testUsers) {
    for (const novelIdx of user.favoriteNovels) {
      const novelId = novelIds[novelIdx];
      if (!novelId) continue;

      const docRef = db.collection("users").doc(user.uid).collection("favorites").doc(novelId);
      await docRef.set({
        novel_id: novelId,
        added_at: randomDate(60),
      });
      count++;
    }
  }

  console.log(`  Seeded ${count} favorites.\n`);
}

async function seedReadingHistory(db: admin.firestore.Firestore, novelIds: string[]) {
  console.log("Seeding reading history...");
  let count = 0;

  for (const user of testUsers) {
    for (const entry of user.readingHistory) {
      const novelId = novelIds[entry.novelIndex];
      if (!novelId) continue;

      const docRef = db.collection("users").doc(user.uid).collection("reading_history").doc(novelId);
      await docRef.set({
        novel_id: novelId,
        last_chapter_index: entry.chapters[entry.chapters.length - 1],
        last_read_at: randomDate(30),
        read_chapters: entry.chapters,
      });
      count++;
    }
  }

  console.log(`  Seeded ${count} reading history entries.\n`);
}

async function seedSubscriptions(db: admin.firestore.Firestore, novelIds: string[]) {
  console.log("Seeding subscriptions...");
  let count = 0;

  for (const user of testUsers) {
    for (const sub of user.subscriptions) {
      const novelId = novelIds[sub.novelIndex];
      if (!novelId) continue;

      const subId = `${user.uid}::${novelId}::${sub.chapterIndex}`;
      const docRef = db.collection("subscriptions").doc(subId);
      await docRef.set({
        user_id: user.uid,
        novel_id: novelId,
        chapter_index: sub.chapterIndex,
        type: "chapter",
        credits_paid: 5000,
        subscribed_at: randomDate(30),
      });
      count++;
    }
  }

  console.log(`  Seeded ${count} subscriptions.\n`);
}

async function seedComments(db: admin.firestore.Firestore, novelIds: string[]) {
  console.log("Seeding comments...");
  let count = 0;

  for (let i = 0; i < novelIds.length; i++) {
    const novelId = novelIds[i];
    const comments = commentsPerNovel[i % commentsPerNovel.length];
    if (!comments) continue;

    for (const comment of comments) {
      const user = testUsers[comment.userIndex];
      const commentRef = db.collection("novels").doc(novelId).collection("comments").doc();
      await commentRef.set({
        user_id: user.uid,
        user_name: user.displayName,
        user_avatar: `https://picsum.photos/seed/${user.uid}/100/100`,
        content: comment.content,
        created_at: randomDate(30),
        likes: Math.floor(Math.random() * 20),
        parent_id: null,
      });
      count++;

      // Seed replies
      if (comment.replies) {
        for (const reply of comment.replies) {
          const replyUser = testUsers[reply.userIndex];
          const replyRef = db.collection("novels").doc(novelId).collection("comments").doc();
          await replyRef.set({
            user_id: replyUser.uid,
            user_name: replyUser.displayName,
            user_avatar: `https://picsum.photos/seed/${replyUser.uid}/100/100`,
            content: reply.content,
            created_at: randomDate(15),
            likes: Math.floor(Math.random() * 10),
            parent_id: commentRef.id,
          });
          count++;
        }
      }
    }
  }

  // Update comment counts on novels
  console.log("  Updating novel comment counts...");
  for (let i = 0; i < novelIds.length; i++) {
    const novelId = novelIds[i];
    const snapshot = await db.collection("novels").doc(novelId).collection("comments").count().get();
    const commentCount = snapshot.data().count;
    await db.collection("novels").doc(novelId).update({ comment_count: commentCount });
  }

  console.log(`  Seeded ${count} comments total.\n`);
}

async function updateGenreCounts(db: admin.firestore.Firestore) {
  console.log("Updating genre novel counts...");
  const genresSnap = await db.collection("genres").get();
  const batch = db.batch();
  let count = 0;

  for (const genreDoc of genresSnap.docs) {
    const genreName = genreDoc.data().name;
    const novelsSnap = await db
      .collection("novels")
      .where("genre", "array-contains", genreName)
      .count()
      .get();

    batch.update(genreDoc.ref, { novel_count: novelsSnap.data().count });
    count++;

    if (count % 300 === 0) {
      await batch.commit();
    }
  }

  if (count % 300 !== 0) {
    await batch.commit();
  }

  console.log("  Done.\n");
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function seed() {
  admin.initializeApp({
    projectId: PROJECT_ID,
  });

  const db = admin.firestore();

  console.log("=== Starting full seed ===\n");

  await clearAllData(db);
  await seedGenres(db);
  const novelIds = await seedNovels(db);
  await seedChapters(db, novelIds);
  const userIds = await seedUsers(db);
  await seedFavorites(db, novelIds);
  await seedReadingHistory(db, novelIds);
  await seedSubscriptions(db, novelIds);
  await seedComments(db, novelIds);
  await updateGenreCounts(db);

  console.log("=== Seed complete ===");
  console.log(`  Genres: ${genres.length}`);
  console.log(`  Novels: ${novelsData.length}`);
  console.log(`  Users: ${testUsers.length}`);
  console.log(`  Novel IDs: ${novelIds.length} (saved to console)`);

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
