// ================================
// ENV VARIABLES
// ================================
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const EVENTS_URL = process.env.EVENTS_URL;

// Paste your manual cookie in Railway ENV
let COOKIE = process.env.COOKIE;

let lastUpdateId = 0;
let lastEventSnapshot = "";

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
    console.error("Telegram Error:", err);
  }
}

// ================================
// CHECK SESSION
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
    console.error(err);
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
    const snapshot = data.slice(0, 800);

    if (force || snapshot !== lastEventSnapshot) {
      lastEventSnapshot = snapshot;
      await notify("📢 Event update detected!");
    }

  } catch (err) {
    console.error("Event Check Error:", err);
  }
}

// ================================
// TELEGRAM COMMAND LISTENER
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

      if (message === "/ping") {
        await notify("🏓 Pong! Bot running perfectly.");
      }

      if (message === "/check") {
        await notify("🔍 Manual event check...");
        await checkEvents(true);
      }

      if (message === "/status") {
        await checkSession();
      }

      if (message === "/help") {
        await notify(
          "Commands:\n" +
          "/ping - Check bot\n" +
          "/check - Manual event check\n" +
          "/status - Check login session\n" +
          "/help - Show commands"
        );
      }
    }

  } catch (err) {
    console.error("Telegram Poll Error:", err);
  }
}

// ================================
// START BOT
// ================================
async function start() {
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
