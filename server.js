require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const pool = require("./db");
const syncGoogleSheet = require("./googleSync");

const app = express();

app.use(cors());
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json());

/* HEALTH CHECK */
app.get("/", (req, res) => {
  res.json({ message: "Travel CRM Backend Running 🚀" });
});

/* GET ALL LEADS */
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

/* UPDATE LEAD */
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

/* ANALYTICS */
app.get("/analytics", async (req, res) => {
  try {
    const total = await pool.query("SELECT COUNT(*) FROM leads");
    const closedWon = await pool.query(
      "SELECT COUNT(*) FROM leads WHERE lead_status='Closed Won'"
    );
    const closedLost = await pool.query(
      "SELECT COUNT(*) FROM leads WHERE lead_status='Closed Lost'"
    );

    const totalLeads = Number(total.rows[0].count);
    const won = Number(closedWon.rows[0].count);

    res.json({
      total: totalLeads,
      closedWon: won,
      closedLost: Number(closedLost.rows[0].count),
      conversion: totalLeads
        ? ((won / totalLeads) * 100).toFixed(2)
        : 0,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* MANUAL GOOGLE SYNC (TEMPORARY TEST ROUTE) */
app.get("/sync-now", async (req, res) => {
  try {
    await syncGoogleSheet(pool);
    res.json({ message: "Manual Google Sheet sync completed ✅" });
  } catch (error) {
    console.error("Manual sync error:", error);
    res.status(500).json({ error: "Manual sync failed ❌" });
  }
});
/* START GOOGLE SYNC */
syncGoogleSheet(pool);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});