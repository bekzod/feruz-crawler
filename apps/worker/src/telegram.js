// Minimal Telegram Bot API sender. No-op if no token configured.
export function createTelegram(token = process.env.TELEGRAM_BOT_TOKEN) {
  if (!token) return { send: async () => {} };
  return {
    async send(chatId, text) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: false })
      });
    }
  };
}
