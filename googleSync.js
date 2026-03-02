const { google } = require("googleapis");
const cron = require("node-cron");

function formatTimestamp(raw) {
  if (!raw) return null;
  const [datePart, timePart = ""] = raw.toString().trim().split(" ");
  const [day, month, year] = datePart.split("/");
  if (day && month && year) {
    return `${year}-${month}-${day}${timePart ? ` ${timePart}` : ""}`;
  }
  return null;
}

function formatDate(raw) {
  if (!raw) return null;

  const cleaned = raw.toString().trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
    return cleaned.split("T")[0];
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(cleaned)) {
    const [day, month, year] = cleaned.split("/");
    return `${year}-${month}-${day}`;
  }

  if (/^\d{2}\/\d{2}\/\d{4}\s/.test(cleaned)) {
    const datePart = cleaned.split(" ")[0];
    const [day, month, year] = datePart.split("/");
    return `${year}-${month}-${day}`;
  }

  return null;
}

function syncGoogleSheet(pool) {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  cron.schedule("*/5 * * * *", async () => {
    console.log("🔄 Syncing Google Sheet...");

    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: "The CRM!A2:O",
      });

      const rows = response.data.values || [];

      for (const row of rows) {
        const [
          timestamp,
          name,
          phone,
          email,
          travel_date,
          number_of_person,
          destination,
          package_selected,
          source,
          lead_id
        ] = row;

        if (!phone) continue;

        const formattedTimestamp = formatTimestamp(timestamp);
        const formattedTravelDate = formatDate(travel_date);

        try {
          await pool.query(
            `
            INSERT INTO leads (
              timestamp,
              name,
              phone,
              email,
              travel_date,
              number_of_person,
              destination,
              package_selected,
              source,
              lead_id
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            ON CONFLICT (phone)
            DO UPDATE SET
              timestamp = EXCLUDED.timestamp,
              name = EXCLUDED.name,
              email = EXCLUDED.email,
              travel_date = EXCLUDED.travel_date,
              number_of_person = EXCLUDED.number_of_person,
              destination = EXCLUDED.destination,
              package_selected = EXCLUDED.package_selected,
              source = EXCLUDED.source,
              lead_id = EXCLUDED.lead_id
          `,
            [
              formattedTimestamp,
              name || null,
              phone,
              email || null,
              formattedTravelDate,
              number_of_person || null,
              destination || null,
              package_selected || null,
              source || null,
              lead_id || null,
            ]
          );
        } catch (err) {
          console.error("Row skipped:", phone, err.message);
        }
      }

      console.log("✅ Sync completed.");
    } catch (error) {
      console.error("❌ Google Sync Error:", error.message);
    }
  });
}

module.exports = syncGoogleSheet;
