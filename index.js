import fetch from "node-fetch";
import fs from "fs";

const URL =
  "https://bip.bitsathy.ac.in/nova-api/student-activity-masters?page=1";

const { COOKIE, BOT_TOKEN, CHAT_ID } = process.env;

if (!COOKIE || !BOT_TOKEN || !CHAT_ID) {
  console.log("❌ Missing environment variables.");
  process.exit(1);
}

console.log("🚀 Event Monitor Running...");

// ================================
// Telegram Notification
// ================================
async function notify(message) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: message,
    }),
  });
}

// ================================
// Extract Fields
// ================================
function extractFields(fields) {
  const data = {};
  for (const f of fields) {
    data[f.validationKey] = f.value;
  }
  return data;
}

// ================================
// Filter Rules
// ================================
function isValid(event) {
  return (
    event.status === "Active" &&
    ["ONLINE", "OFFLINE"].includes(event.location) &&
    ["Competition", "Paper Presentation", "Events-Attended"].includes(
      event.event_category
    )
  );
}

// ================================
// Load Seen IDs
// ================================
let seen = [];
try {
  seen = JSON.parse(fs.readFileSync("seen.json", "utf-8"));
} catch {
  seen = [];
}

let seenSet = new Set(seen);

// ================================
// Main Logic
// ================================
async function checkEvents() {
  const response = await fetch(URL, {
    headers: {
      cookie: COOKIE,
      "user-agent": "Mozilla/5.0",
    },
  });

  if (!response.ok) {
    console.log("⚠️ Session expired!");
    await notify("⚠️ Session expired! Refresh cookie.");
    return;
  }

  const data = await response.json();
  let newEvents = [];

  for (const e of data.resources) {
    const title = e.title || "";
    const fields = extractFields(e.fields || []);

    const event = {
      event_code: fields.event_code,
      event_category: fields.event_category,
      status: fields.status,
      location: fields.location,
    };

    if (!event.event_code) continue;

    if (isValid(event) && !seenSet.has(event.event_code)) {
      newEvents.push({
        id: event.event_code,
        title,
      });
    }
  }

  if (newEvents.length === 0) {
    console.log("✅ No new events.");
    return;
  }

  for (const ev of newEvents) {
    const message = `🚨 NEW EVENT FOUND\n\n${ev.title}`;
    console.log(message);
    await notify(message);
    seenSet.add(ev.id);
  }

  // Save updated seen list
  fs.writeFileSync("seen.json", JSON.stringify([...seenSet], null, 2));
  console.log("💾 Updated seen.json");
}

checkEvents();
