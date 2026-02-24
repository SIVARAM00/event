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
let lastEventSnapshot = "";

// ================================
// LOAD PREVIOUS SNAPSHOT
// ================================
function loadSeenData() {
  try {
    if (fs.existsSync("seen.json")) {
      const raw = fs.readFileSync("seen.json");
      const parsed = JSON.parse(raw);
      lastEventSnapshot = parsed.lastEventSnapshot || "";
      console.log("📂 Loaded previous snapshot.");
    } else {
      console.log("ℹ️ No seen.json found. Creating new one.");
      saveSeenData();
    }
  } catch (err) {
    console.error("❌ Error loading seen.json:", err);
  }
}

// ================================
// SAVE SNAPSHOT
// ================================
function saveSeenData() {
  try {
    fs.writeFileSync(
      "seen.json",
      JSON.stringify({ lastEventSnapshot }, null, 2)
    );
    console.log("💾 Snapshot saved.");
  } catch (err) {
    console.error("❌ Error saving seen.json:", err);
  }
}

// ================================
// TELEGRAM SEND MESSAGE
// ================================
async function notify(message) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message
      })
    });
  } catch (err) {
    console.error("❌ Telegram Error:", err);
  }
}

// ================================
// CHECK SESSION STATUS
// ================================
async function checkSession() {
  try {
    const res = await fetch(EVENTS_URL, {
      headers: { Cookie: COOKIE }
    });

    if (res.status === 401 || res.status === 403) {
      await notify("⚠️ Session expired. Please update COOKIE in Railway.");
      return false;
    }

    await notify("✅ Session active.");
    return true;

  } catch (err) {
    console.error("❌ Session Check Error:", err);
    return false;
  }
}

// ================================
// CHECK EVENTS
// ================================
async function checkEvents(force = false) {
  try {
    const res = await fetch(EVENTS_URL, {
      headers: { Cookie: COOKIE }
    });

    if (res.status === 401 || res.status === 403) {
      await notify("⚠️ Session expired. Update COOKIE.");
      return;
    }

    const data = await res.text();

    // Simple change detection
    const snapshot = data.slice(0, 1000);

    if (force || snapshot !== lastEventSnapshot) {
      lastEventSnapshot = snapshot;
      saveSeenData();
      await notify("📢 Event update detected!");
    }

  } catch (err) {
    console.error("❌ Event Check Error:", err);
  }
}

// ================================
// TELEGRAM POLLING
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
          await notify("🏓 Pong! Bot running.");
          break;

        case "/check":
          await notify("🔍 Manual event check...");
          await checkEvents(true);
          break;

        case "/status":
          await checkSession();
          break;

        case "/help":
          await notify(
            "🤖 Available Commands:\n\n" +
            "/ping - Check bot\n" +
            "/check - Manual event check\n" +
            "/status - Check login session\n" +
            "/help - Show commands"
          );
          break;

        default:
          await notify("❓ Unknown command. Type /help");
      }
    }

  } catch (err) {
    console.error("❌ Telegram Poll Error:", err);
  }
}

// ================================
// START BOT
// ================================
async function start() {
  loadSeenData();

  await notify("🤖 Event Monitor Started Successfully.");

  // Event check every 5 minutes
  setInterval(() => {
    checkEvents();
  }, 5 * 60 * 1000);

  // Telegram polling every 5 seconds
  setInterval(() => {
    listenCommands();
  }, 5000);

  // Run immediately on startup
  await checkEvents(true);
  await listenCommands();
}

start();
