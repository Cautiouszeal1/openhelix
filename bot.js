// Telegram bot webhook — handles commands and replies with buttons.
// Token is read from the TELEGRAM_BOT_TOKEN env var in Vercel (never in code).
// Set webhook once (see instructions) to point Telegram at /api/bot.

const SITE = "https://opnhelix.xyz";
const APP_LINK = "https://t.me/OpenHelixAppBot/Openhelix";

export default async function handler(req, res) {
  // Health check / browser visit
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, bot: "OpenHelix", note: "Webhook is live." });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.status(200).json({ ok: false, error: "Missing TELEGRAM_BOT_TOKEN" });

  let update = req.body;
  if (typeof update === "string") { try { update = JSON.parse(update); } catch { update = {}; } }

  const msg = update.message || update.edited_message;
  if (!msg || !msg.text) return res.status(200).json({ ok: true });

  const chatId = msg.chat.id;
  const text = msg.text.trim().toLowerCase().split(/\s+/)[0]; // first token, e.g. "/start"
  const cmd = text.replace(/@.*$/, ""); // strip @BotName in groups

  const send = (body) =>
    fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, parse_mode: "HTML", disable_web_page_preview: false, ...body }),
    });

  const openAppButton = {
    inline_keyboard: [
      [{ text: "🚀 Launch OpenHelix", url: APP_LINK }],
      [{ text: "🌐 Website", url: SITE }, { text: "📄 Whitepaper", url: `${SITE}/whitepaper.html` }],
    ],
  };

  let reply;
  switch (cmd) {
    case "/start":
      reply = {
        text:
          "<b>Welcome to OpenHelix</b> — the Web3 launch operating system.\n\n" +
          "Create tokens, add liquidity, and build trusted projects on BNB Chain & Solana — no code required.\n\n" +
          "Tap below to launch the app.",
        reply_markup: openAppButton,
      };
      break;
    case "/app":
      reply = { text: "Launch the OpenHelix Studio:", reply_markup: { inline_keyboard: [[{ text: "🚀 Open OpenHelix", url: APP_LINK }]] } };
      break;
    case "/website":
      reply = { text: `🌐 Our website: ${SITE}`, reply_markup: { inline_keyboard: [[{ text: "Open website", url: SITE }]] } };
      break;
    case "/whitepaper":
      reply = { text: "📄 Read the OpenHelix whitepaper:", reply_markup: { inline_keyboard: [[{ text: "Open whitepaper", url: `${SITE}/whitepaper.html` }]] } };
      break;
    case "/help":
      reply = {
        text:
          "<b>OpenHelix — Help</b>\n\n" +
          "/start — Welcome & launch button\n" +
          "/app — Open the Studio\n" +
          "/website — Visit the website\n" +
          "/whitepaper — Read the whitepaper\n\n" +
          "Questions? Reach us on X or Telegram, linked from the site.",
        reply_markup: openAppButton,
      };
      break;
    default:
      // Unknown command or plain text
      if (cmd.startsWith("/")) {
        reply = { text: "I didn't recognize that. Try /start, /app, /website, /whitepaper or /help.", reply_markup: openAppButton };
      } else {
        return res.status(200).json({ ok: true }); // ignore non-commands silently
      }
  }

  try { await send(reply); } catch (e) { /* swallow */ }
  return res.status(200).json({ ok: true });
}
