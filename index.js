import fs from "fs";

// ================================
// ENV VARIABLES
// ================================
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const EVENTS_URL = process.env.EVENTS_URL;
const COOKIE = process.env.COOKIE;

// ================================
// GLOBAL VARIABLES
// ================================
let lastUpdateId = 0;
let storedEvents = [];

// ================================
// LOAD SEEN DATA
// ================================
function loadSeenData() {
  try {
    if (fs.existsSync("seen.json")) {
      const raw = fs.readFileSync("seen.json");
      const parsed = JSON.parse(raw);
      storedEvents = parsed.events || [];
      console.log("📂 Loaded seen.json");
    } else {
      saveSeenData();
    }
  } catch (err) {
    console.error("Error loading seen.json:", err);
  }
}

// ================================
// SAVE SEEN DATA
// ================================
function saveSeenData() {
  try {
    fs.writeFileSync(
      "seen.json",
      JSON.stringify({ events: storedEvents }, null, 2)
    );
    console.log("💾 seen.json updated");
  } catch (err) {
    console.error("Error saving seen.json:", err);
  }
}

// ================================
// TELEGRAM MESSAGE
// ================================
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

// ================================
// FETCH EVENTS FROM WEBSITE
// ================================
async function fetchEventsFromWebsite() {
  try {
    const res = await fetch(EVENTS_URL, {
      headers: { Cookie: COOKIE }
    });

    if (res.status === 401 || res.status === 403) {
      await notify("⚠️ Session expired. Update COOKIE.");
      return [];
    }

    const data = await res.json(); // assuming JSON API

    return data.events || data;

  } catch (err) {
    console.error("Fetch error:", err);
    return [];
  }
}

// ================================
// CHECK EVENTS (5 MIN)
// ================================
async function checkEvents() {
  const websiteEvents = await fetchEventsFromWebsite();
  if (!websiteEvents.length) return;

  const newEvents = websiteEvents.filter(
    ev => !storedEvents.some(stored => stored.id === ev.id)
  );

  if (newEvents.length > 0) {
    storedEvents = websiteEvents;
    saveSeenData();
    await notify(`📢 ${newEvents.length} new event(s) detected!`);
  }
}

// ================================
// /last5 COMMAND
// ================================
async function sendLast5() {
  // If seen.json is empty
  if (!storedEvents.length) {
    console.log("📥 seen.json empty. Fetching from website...");

    const websiteEvents = await fetchEventsFromWebsite();

    if (!websiteEvents.length) {
      await notify("❌ No events found.");
      return;
    }

    // Take last 5
    storedEvents = websiteEvents.slice(-5);
    saveSeenData();
  }

  const last5 = storedEvents.slice(-5).reverse();

  let message = "📌 Last 5 Events:\n\n";

  last5.forEach((event, index) => {
    message += `${index + 1}. ${event.title || event.name}\n`;
  });

  await notify(message);
}

// ================================
// SESSION STATUS
// ================================
async function checkSession() {
  const res = await fetch(EVENTS_URL, {
    headers: { Cookie: COOKIE }
  });

  if (res.status === 401 || res.status === 403) {
    await notify("⚠️ Session expired.");
  } else {
    await notify("✅ Session active.");
  }
}

// ================================
// TELEGRAM POLLING (5 sec)
// ================================
async function listenCommands() {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}`
    );

    const data = await res.json();

    for (const update of data.result) {
      lastUpdateId = update.update_id;

      const message = update.message?.text;
      const chatId = update.message?.chat?.id;

      if (!message || chatId.toString() !== CHAT_ID) continue;

      switch (message) {
        case "/ping":
          await notify("🏓 Pong!");
          break;

        case "/check":
          await notify("🔍 Checking events...");
          await checkEvents();
          break;

        case "/last5":
          await sendLast5();
          break;

        case "/status":
          await checkSession();
          break;

        case "/help":
          await notify(
            "🤖 Commands:\n\n" +
            "/ping\n" +
            "/check\n" +
            "/last5\n" +
            "/status"
          );
          break;

        default:
          await notify("Unknown command. Use /help");
      }
    }

  } catch (err) {
    console.error("Telegram polling error:", err);
  }
}

// ================================
// START BOT
// ================================
async function start() {
  loadSeenData();

  await notify("🤖 Event Monitor Started.");

  setInterval(checkEvents, 5 * 60 * 1000);
  setInterval(listenCommands, 5000);

  await listenCommands();
}

start();
