const { Pool } = require("pg");

const pool = new Pool({
  user: "postgres.jtinsnkrygdipqhbennl",  // IMPORTANT (copy exact)
  host: "aws-1-ap-northeast-1.pooler.supabase.com",
  database: "postgres",
  password: "Thetravelsguru@1",  // your original password (no encoding needed here)
  port: 5432,  // use exactly what Supabase shows
  ssl: { rejectUnauthorized: false }
});

pool.on("connect", () => {  
  console.log("✅ Connected to Supabase PostgreSQL");
});

pool.on("error", (err) => {
  console.error("❌ DB Error:", err);
});

module.exports = pool;