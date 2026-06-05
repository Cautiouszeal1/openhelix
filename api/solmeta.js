// Returns Metaplex-style metadata JSON for a Solana token, so explorers/wallets
// can show its name, symbol and logo. Referenced by the token's on-chain `uri`.
// No API key needed. CORS-open so any wallet/explorer can fetch it.

export default function handler(req, res) {
  const { n = "", s = "", img = "" } = req.query;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.setHeader("Content-Type", "application/json");
  res.status(200).json({
    name: String(n).slice(0, 64),
    symbol: String(s).slice(0, 16),
    description: (String(n) || "Token") + " — created with OpenHelix",
    image: String(img)
  });
}
