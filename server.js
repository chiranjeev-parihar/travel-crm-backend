require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const pool = require("./db");
const syncGoogleSheet = require("./googleSync");

const app = express();

// ✅ Allow ALL origins — required so the Render-hosted backend accepts
// requests from both localhost (dev) and the live website URL (prod)
app.use(cors());

app.use(helmet());
app.use(morgan("dev"));
app.use(express.json());

/* ─────────────────────────────────────────
   HEALTH CHECK
───────────────────────────────────────── */
app.get("/", (req, res) => {
  res.json({ message: "Travel CRM Backend Running 🚀" });
});

/* ─────────────────────────────────────────
   GET ALL LEADS  (used by CRM frontend)
───────────────────────────────────────── */
app.get("/leads", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM leads ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ─────────────────────────────────────────
   POST /leads  — Website forms → Supabase
   
   Accepts form submissions from:
   - General Inquiry  (source: "Website - General Inquiry")
   - Group Booking    (source: "Website - Group Booking")
   - Early Bird       (source: "Website - Early Bird")
   - Custom Plan      (source: "Website - Custom Plan")
   - Quick Inquiry    (source: "Website - Quick Inquiry")
───────────────────────────────────────── */
app.post("/leads", async (req, res) => {
  try {
    const {
      name,
      phone,
      email,
      destination,
      message,        // stored in notes column
      source,         // e.g. "Website - General Inquiry"
      number_of_person,
      package_selected,
    } = req.body;

    // Phone is required (it's the unique key in the leads table)
    if (!phone) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    // Always create a NEW lead row — every inquiry is tracked separately in the CRM
    await pool.query(
      `INSERT INTO leads
        (name, phone, email, destination, source, notes, number_of_person, package_selected, lead_status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'New', NOW())`,
      [
        name || null,
        phone,
        email || null,
        destination || null,
        source || "Website",
        message || null,
        number_of_person ? parseInt(number_of_person) : null,
        package_selected || null,
      ]
    );

    res.status(200).json({ success: true, message: "Lead saved successfully ✅" });
  } catch (error) {
    console.error("❌ POST /leads error:", error.message);
    res.status(500).json({ error: "Failed to save lead" });
  }
});

/* ─────────────────────────────────────────
   PUT /leads/:id  (update by CRM user)
───────────────────────────────────────── */
app.put("/leads/:id", async (req, res) => {
  try {
    const { lead_status, notes, assigned_sales_person, payment_status } =
      req.body;

    await pool.query(
      `
      UPDATE leads
      SET lead_status=$1,
          notes=$2,
          assigned_sales_person=$3,
          payment_status=$4
      WHERE id=$5
      `,
      [
        lead_status,
        notes,
        assigned_sales_person,
        payment_status,
        req.params.id,
      ]
    );

    res.json({ message: "Lead Updated Successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ─────────────────────────────────────────
   GET /analytics  (used by CRM Dashboard)
───────────────────────────────────────── */
app.get("/analytics", async (req, res) => {
  try {
    const total = await pool.query("SELECT COUNT(*) FROM leads");
    const closedWon = await pool.query("SELECT COUNT(*) FROM leads WHERE lead_status='Closed Won'");
    const closedLost = await pool.query("SELECT COUNT(*) FROM leads WHERE lead_status='Closed Lost'");

    // Break down by source for the dashboard
    const sourceBreakdown = await pool.query(`
      SELECT source, COUNT(*) as count
      FROM leads
      WHERE source IS NOT NULL
      GROUP BY source
      ORDER BY count DESC
    `);

    const totalLeads = Number(total.rows[0].count);
    const won = Number(closedWon.rows[0].count);

    res.json({
      total: totalLeads,
      closedWon: won,
      closedLost: Number(closedLost.rows[0].count),
      conversion: totalLeads ? ((won / totalLeads) * 100).toFixed(2) : 0,
      sourceBreakdown: sourceBreakdown.rows,  // bonus: per-source stats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ─────────────────────────────────────────
   MANUAL GOOGLE SYNC (test route)
───────────────────────────────────────── */
app.get("/sync-now", async (req, res) => {
  try {
    await syncGoogleSheet(pool);
    res.json({ message: "Manual Google Sheet sync completed ✅" });
  } catch (error) {
    console.error("Manual sync error:", error);
    res.status(500).json({ error: "Manual sync failed ❌" });
  }
});

/* ─────────────────────────────────────────
   START GOOGLE SYNC (cron every 5 min)
───────────────────────────────────────── */
syncGoogleSheet(pool);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
