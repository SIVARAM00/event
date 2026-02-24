import fs from "fs";

// =================================
// ENV VARIABLES
// =================================
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.CHAT_ID; // Admin
const COOKIE = process.env.COOKIE;

const URL = "https://bip.bitsathy.ac.in/nova-api/student-activity-masters?page=1";

const HEADERS = {
  cookie: COOKIE,
  "user-agent": "Mozilla/5.0"
};

// =================================
// GLOBALS
// =================================
let lastUpdateId = 0;
let storedEvents = [];
let users = [];

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
}

// =================================
// LOAD / SAVE users.json
// =================================
function loadUsers() {
  if (fs.existsSync("users.json")) {
    const raw = fs.readFileSync("users.json");
    const parsed = JSON.parse(raw);
    users = parsed.users || [];
  }

  // Always ensure admin is included
  if (!users.includes(ADMIN_ID)) {
    users.push(ADMIN_ID);
    saveUsers();
  }
}

function saveUsers() {
  fs.writeFileSync(
    "users.json",
    JSON.stringify({ users }, null, 2)
  );
}

// =================================
// TELEGRAM SEND
// =================================
async function sendMessage(chatId, message) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message
    })
  });
}

// Send to all users
async function broadcast(message) {
  for (const user of users) {
    await sendMessage(user, message);
  }
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
      const fields = extractFields(e.fields || []);

      const event = {
        title: e.title || "",
        event_code: fields.event_code,
        event_category: fields.event_category,
        status: fields.status,
        location: fields.location
      };

      if (!event.event_code) continue;
      if (isValid(event)) validEvents.push(event);
    }

    return { expired: false, events: validEvents };

  } catch (err) {
    console.error("Fetch error:", err);
    return { expired: false, events: [] };
  }
}

// =================================
// CHECK STATUS
// =================================
async function checkStatus(chatId) {
  const result = await fetchEvents();

  if (result.expired) {
    await sendMessage(chatId, "⚠️ Cookie expired!");
  } else {
    await sendMessage(chatId, "✅ Cookie active.");
  }
}

// =================================
// CHECK EVENTS
// =================================
async function checkEvents(manual = false, chatId = null) {
  const result = await fetchEvents();

  if (result.expired) {
    await broadcast("⚠️ Session expired! Update COOKIE.");
    return;
  }

  let newCount = 0;

  for (const event of result.events) {
    if (!storedEvents.some(e => e.event_code === event.event_code)) {

      storedEvents.push(event);
      newCount++;

      await broadcast(
        "🚨 NEW EVENT FOUND\n\n" +
        `${event.title}\n` +
        `Category: ${event.event_category}\n` +
        `Location: ${event.location}`
      );
    }
  }

  if (newCount > 0) {
    saveSeenData();
  } else if (manual && chatId) {
    await sendMessage(chatId, "✅ No new events.");
  }
}

// =================================
// LAST 5
// =================================
async function sendLast5(chatId) {

  if (!storedEvents.length) {
    const result = await fetchEvents();

    if (result.expired) {
      await sendMessage(chatId, "⚠️ Session expired!");
      return;
    }

    storedEvents = result.events.slice(-5);
    saveSeenData();
  }

  const last5 = storedEvents.slice(-5).reverse();

  let message = "📌 Latest 5 Events:\n\n";
  last5.forEach((e, i) => {
    message += `${i + 1}. ${e.title}\n`;
  });

  await sendMessage(chatId, message);
}

// =================================
// TELEGRAM POLLING
// =================================
async function listenCommands() {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}`
    );

    const data = await res.json();
    if (!data.ok) return;

    for (const update of data.result) {
      lastUpdateId = update.update_id;

      const text = update.message?.text;
      const chatId = update.message?.chat?.id?.toString();

      if (!text || !chatId) continue;

      // Register user
      if (!users.includes(chatId)) {
        users.push(chatId);
        saveUsers();
      }

      let message = text.replace("/", "").split("@")[0].toLowerCase();

      switch (message) {

        case "ping":
          await sendMessage(chatId, "🏓 Bot running.");
          break;

        case "check":
          await checkEvents(true, chatId);
          break;

        case "status":
          await checkStatus(chatId);
          break;

        case "last5":
          await sendLast5(chatId);
          break;

        default:
          await sendMessage(
            chatId,
            "Available commands:\n\n" +
            "check\nstatus\nping\nlast5"
          );
      }
    }

  } catch (err) {
    console.error("Telegram error:", err);
  }
}

// =================================
// START
// =================================
async function start() {
  loadSeenData();
  loadUsers();

  console.log("🚀 Event Monitor Running...");

  setInterval(() => checkEvents(false), 5 * 60 * 1000);
  setInterval(listenCommands, 5000);

  await listenCommands();
}

start();
