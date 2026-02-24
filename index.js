import fs from "fs";

const URL =
  "https://bip.bitsathy.ac.in/nova-api/student-activity-masters?page=1";

const COOKIE = (process.env.COOKIE || "")
  .replace(/[\r\n]+/g, "")
  .trim();

const BOT_TOKEN = (process.env.BOT_TOKEN || "").trim();
const CHAT_ID = (process.env.CHAT_ID || "").trim();

if (!COOKIE || !BOT_TOKEN || !CHAT_ID) {
  console.log("❌ Missing environment variables.");
  process.exit(1);
}

console.log("🚀 Event Monitor Running...");

let lastUpdateId = 0;

// ================================
// Telegram Send
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
// Check Events
// ================================
async function checkEvents(manual = false) {
  const response = await fetch(URL, {
    headers: {
      cookie: COOKIE,
      "user-agent": "Mozilla/5.0",
    },
  });

  if (!response.ok) {
    console.log("⚠️ Session expired!");
    await notify("⚠️ Session expired! Refresh cookie.");
    return false;
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
    if (manual) await notify("✅ No new events.");
    return true;
  }

  for (const ev of newEvents) {
    const message = `🚨 NEW EVENT FOUND\n\n${ev.title}`;
    await notify(message);
    seenSet.add(ev.id);
  }

  fs.writeFileSync("seen.json", JSON.stringify([...seenSet], null, 2));
  console.log("💾 Updated seen.json");

  return true;
}

// ================================
// Check Cookie Only
// ================================
async function checkSession() {
  const response = await fetch(URL, {
    headers: {
      cookie: COOKIE,
      "user-agent": "Mozilla/5.0",
    },
  });

  if (!response.ok) {
    await notify("❌ Cookie Session Expired.");
  } else {
    await notify("✅ Cookie Session Active.");
  }
}

// ================================
// Listen Telegram Commands
// ================================
async function listenCommands() {
  const response = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${
      lastUpdateId + 1
    }`
  );

  const data = await response.json();

  for (const update of data.result) {
    lastUpdateId = update.update_id;

    const message = update.message?.text;
    const chatId = update.message?.chat?.id;

    if (!message || chatId.toString() !== CHAT_ID) continue;

    if (message === "/check") {
      await notify("🔎 Checking for new events...");
      await checkEvents(true);
    }

    if (message === "/status") {
      await checkSession();
    }

    if (message === "/ping") {
      await notify("🤖 Bot is alive.");
    }
  }
}

// ================================
// Run
// ================================
(async () => {
  await checkEvents(); // normal scheduled check
  await listenCommands(); // manual control
})();
