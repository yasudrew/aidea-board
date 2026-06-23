// ============================================================
// Supabase 接続設定
//   Supabase ダッシュボード > Project Settings > API から
//   URL と anon public key をコピーして貼り付ける。
//   anon キーは公開前提の設計(RLS+RPCで保護)なのでフロントに置いてよい。
// ============================================================
window.APP_CONFIG = {
  SUPABASE_URL: "https://zxniugyktxhyxkybizek.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_l7w_j30npZpdrV_s7obqtQ_0D67wR6u",

  // 部屋作成画面で選べるテーマのプリセット(自由入力も可)。
  // お題(質問形)でも、「〇〇について考える」「〇〇部屋」のような名前でもよい。
  THEME_PRESETS: [
    "最近、仕事で「これ面倒だな」と思ったことは？",
    "AIでできるかもと思ったことを書いてみよう",
    "業務効率化について考える部屋",
    "雑談・アイデア置き場",
  ],
};
