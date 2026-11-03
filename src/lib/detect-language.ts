const ID_WORDS = new Set(
  (
    "yang dan aku saya kamu dia mereka kita kami utang hutang pinjem pinjam minjem bayar bayarin dibayarin nalangin " +
    "udah udh sudah belum blm ke dari di ini itu buat untuk utk berapa siapa tolong ada gak nggak ngga ga tidak " +
    "mau lagi kemarin kemaren tadi sama dong deh sih ya iya yg nya catat catet hapus ubah ganti setujui tolak " +
    "ribu rb juta jt apa gimana bagaimana bisa lunas lunasin patungan tagih ingetin ingatkan semua grup orang " +
    "minggu bulan hari besok baru jadi kok aja saja punya kasih"
  ).split(" "),
);
const EN_WORDS = new Set(
  (
    "the and i you he she they we my me your his her it this that is are was were owe owes owed paid pay borrowed " +
    "lent to from for how much many what who please yes no delete record approve reject remind all group with " +
    "did do does can could would should have has had be will just yesterday today tomorrow week month back " +
    "money bill split thanks thank"
  ).split(" "),
);

export type ChatLang = "id" | "en";

export function detectLang(text: string): ChatLang | null {
  let id = 0;
  let en = 0;
  for (const w of text.toLowerCase().split(/[^a-z]+/)) {
    if (!w) continue;
    if (ID_WORDS.has(w)) id++;
    if (EN_WORDS.has(w)) en++;
  }
  if (id === en) return null;
  return id > en ? "id" : "en";
}
