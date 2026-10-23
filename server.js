const express = require("express");

const app = express();
app.use(express.json({ limit: "20kb" }));

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = 8713995854:AAHXELZnFYd-G-kYBY4ALCoWn_HRpgQZQdQ;
const CHAT_ID = 7246139868;
const FEEDBACK_SECRET = process.env.FEEDBACK_SECRET;

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "Telegram feedback backend" });
});

app.get("/health", (_req, res) => {
  const configured = Boolean(BOT_TOKEN && CHAT_ID && FEEDBACK_SECRET);
  res.status(configured ? 200 : 503).json({
    ok: configured,
    telegramConfigured: Boolean(BOT_TOKEN && CHAT_ID),
    feedbackSecretConfigured: Boolean(FEEDBACK_SECRET)
  });
});

function authorized(req) {
  const provided = req.get("x-feedback-secret");
  return Boolean(FEEDBACK_SECRET && provided && provided === FEEDBACK_SECRET);
}

app.post("/test-feedback", async (req, res) => {
  if (!authorized(req)) {
    return res.status(401).json({ ok: false, error: "Unauthorized: check x-feedback-secret" });
  }
  return sendTelegram("✅ Test feedback: Telegram bot connection is working.", res);
});

app.post("/match-feedback", async (req, res) => {
  if (!authorized(req)) {
    return res.status(401).json({ ok: false, error: "Unauthorized: check x-feedback-secret" });
  }

  const body = req.body || {};
  const rank = clean(body.rank, 80);
  const kills = Number(body.kills);
  const status = clean(body.status, 80);
  const matchTime = clean(body.time, 80);

  if (!rank || !Number.isInteger(kills) || kills < 0 || kills > 200 || !status || !matchTime) {
    return res.status(400).json({
      ok: false,
      error: "Required JSON fields: rank (string), kills (integer >= 0), status (string), time (string)"
    });
  }

  const message = [
    "🎮 Match Feedback",
    `🕒 Time: ${matchTime}`,
    `🏅 Rank: ${rank}`,
    `🔫 Kills: ${kills}`,
    `📊 Status: ${status}`
  ].join("\n");

  return sendTelegram(message, res);
});

function clean(value, maxLen) {
  if (typeof value !== "string") return "";
  return value.replace(/[<>]/g, "").trim().slice(0, maxLen);
}

async function sendTelegram(text, res) {
  if (!BOT_TOKEN || !CHAT_ID) {
    return res.status(503).json({ ok: false, error: "Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in server environment" });
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text })
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.ok) {
      console.error("Telegram API error:", data);
      return res.status(502).json({
        ok: false,
        error: "Telegram rejected the message. Check bot token, chat ID, and channel admin permissions.",
        telegramErrorCode: data.error_code || response.status
      });
    }

    return res.json({ ok: true, message: "Telegram message sent", messageId: data.result?.message_id });
  } catch (error) {
    console.error("Telegram request failed:", error.message);
    return res.status(502).json({ ok: false, error: "Could not reach Telegram API" });
  }
}

app.listen(PORT, () => console.log(`Feedback backend listening on port ${PORT}`));
