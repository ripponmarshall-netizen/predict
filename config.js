/* config.js — where Predikt keeps its data online: the Supabase project's
   address and publishable key (Supabase → Project Settings → API Keys).
   With both left empty, Predikt runs on each phone only.
   The publishable key is meant to be public: the row-level security in
   supabase/schema.sql decides what anyone can read and write. Never put
   the secret (service role) key here. */
window.PREDIKT_CONFIG = {
  supabaseUrl: "https://mjynccgncbgyfqntodrj.supabase.co",
  supabaseKey: "sb_publishable_uj0Uj8LWeVUIyRytyh_G7Q_M5yTK4gb",
};
