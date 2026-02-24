import fs from "fs";

// =================================
// ENV VARIABLES
// =================================
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const COOKIE = process.env.COOKIE;

const URL = "https://bip.bitsathy.ac.in/nova-api/student-activity-masters?page=1";

const HEADERS = {
  "cookie": COOKIE,
  "user-agent": "Mozilla/5.0"
};

// =================================
// GLOBALS
// =================================
let lastUpdateId = 0;
let storedEvents = [];

// =================================
// LOAD / SAVE seen.json
// =================================
function loadSeenData() {
  if (fs.existsSync("seen.json")) {
    const raw = fs.readFileSync("seen.json");
    const parsed = JSON.parse(raw);
    storedEvents = parsed.events || [];
    console.log("📂 Loaded seen.json");
  }
}

function saveSeenData() {
  fs.writeFileSync(
    "seen.json",
    JSON.stringify({ events: storedEvents }, null, 2)
  );
  console.log("💾 seen.json updated");
}

// =================================
// TELEGRAM MESSAGE
// =================================
async function notify(message) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: message
    })
  });
}

// =================================
// EXTRACT FIELDS
// =================================
function extractFields(fields) {
  const data = {};
  for (const f of fields) {
    data[f.validationKey] = f.value;
  }
  return data;
}

// =================================
// FILTER RULES
// =================================
function isValid(event) {
  return (
    event.status === "Active" &&
    ["ONLINE", "OFFLINE"].includes(event.location) &&
    ["Competition", "Paper Presentation", "Events-Attended"]
      .includes(event.event_category)
  );
}

// =================================
// FETCH EVENTS
// =================================
async function fetchEvents() {
  try {
    const res = await fetch(URL, { headers: HEADERS });

    if (res.status !== 200) {
      return { expired: true, events: [] };
    }

    const data = await res.json();
    const validEvents = [];

    for (const e of data.resources) {
      const title = e.title || "";
      const fields = extractFields(e.fields || []);

      const event = {
        title: title,
        event_code: fields.event_code,
        event_category: fields.event_category,
        status: fields.status,
        location: fields.location
      };

      if (!event.event_code) continue;

      if (isValid(event)) {
        validEvents.push(event);
      }
    }

    return { expired: false, events: validEvents };

  } catch (err) {
    console.error("Fetch error:", err);
    return { expired: false, events: [] };
  }
}

// =================================
// CHECK COOKIE STATUS
// =================================
async function checkStatus() {
  const result = await fetchEvents();

  if (result.expired) {
    await notify("⚠️ Cookie expired! Please update it in Railway.");
  } else {
    await notify("✅ Cookie active. Session valid.");
  }
}

// =================================
// CHECK NEW EVENTS (AUTO + MANUAL)
// =================================
async function checkEvents(manual = false) {
  console.log("🔎 Checking events...");

  const result = await fetchEvents();

  if (result.expired) {
    await notify("⚠️ Session expired! Update COOKIE.");
    return;
  }

  const websiteEvents = result.events;
  let newCount = 0;

  for (const event of websiteEvents) {
    if (!storedEvents.some(e => e.event_code === event.event_code)) {

      storedEvents.push(event);
      newCount++;

      await notify(
        "🚨 NEW EVENT FOUND\n\n" +
        `${event.title}\n` +
        `Category: ${event.event_category}\n` +
        `Location: ${event.location}`
      );
    }
  }

  if (newCount > 0) {
    saveSeenData();
  } else if (manual) {
    await notify("✅ No new events found.");
  }
}

// =================================
// LAST 5 EVENTS
// =================================
async function sendLast5() {

  // If empty → fetch and store last 5
  if (!storedEvents.length) {
    const result = await fetchEvents();

    if (result.expired) {
      await notify("⚠️ Session expired!");
      return;
    }

    storedEvents = result.events.slice(-5);
    saveSeenData();
  }

  const last5 = storedEvents.slice(-5).reverse();

  if (!last5.length) {
    await notify("❌ No events available.");
    return;
  }

  let message = "📌 Latest 5 Events:\n\n";

  last5.forEach((event, i) => {
    message += `${i + 1}. ${event.title}\n`;
  });

  await notify(message);
}

// =================================
// TELEGRAM POLLING (5 sec)
// =================================
async function listenCommands() {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}`
    );

    const data = await res.json();

    if (!data.ok || !Array.isArray(data.result)) {
      console.log("⚠️ Telegram response error:", data);
      return;
    }

    for (const update of data.result) {
      lastUpdateId = update.update_id;

      const text = update.message?.text;
      const chatId = update.message?.chat?.id;

      if (!text) continue;

      // Clean command
      let message = text
        .replace("/", "")
        .split("@")[0]
        .trim()
        .toLowerCase();

      console.log("📩 Command received:", message);

      switch (message) {

        case "ping":
          await notify("🏓 Bot is running perfectly.");
          break;

        case "check":
          await checkEvents(true);
          break;

        case "status":
          await checkStatus();
          break;

        case "last5":
          await sendLast5();
          break;

        default:
          await notify(
            "Available commands:\n\n" +
            "check  - Manually check new events\n" +
            "status - Check if cookie expired\n" +
            "ping   - Confirm bot is running\n" +
            "last5  - Fetch latest events"
          );
      }
    }

  } catch (err) {
    console.error("Telegram polling error:", err);
  }
}

// =================================
// START BOT
// =================================
async function start() {
  loadSeenData();

  console.log("🚀 Event Monitor Running...");

  setInterval(() => checkEvents(false), 5 * 60 * 1000);
  setInterval(listenCommands, 5000);

  await listenCommands();
}

start();
