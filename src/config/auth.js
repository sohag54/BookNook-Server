const { betterAuth } = require("better-auth");
const { mongodbAdapter } = require("better-auth/adapters/mongodb");
const { client } = require("./db");

const dbName = process.env.DB_NAME || "booknook";
const db = client.db(dbName);

/**
 * BetterAuth Express Server Configuration
 * Uses the existing MongoDB connection and mongodbAdapter.
 * Preserves user, account, and session collection compatibility.
 */
const auth = betterAuth({
  database: mongodbAdapter(db),
  secret:
    process.env.BETTER_AUTH_SECRET ||
    "fallback_secret_for_mock_tests_only_must_be_over_32_characters_long",
  baseURL:
    process.env.BETTER_AUTH_URL ||
    "https://booknook-server-1-gmhv.onrender.com",
  trustedOrigins: [
    "http://localhost:3000",
    "https://book-nook-client-red.vercel.app",
    process.env.CLIENT_URL,
    process.env.CLIENT_URL && process.env.CLIENT_URL.replace(/\/$/, ""),
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL &&
      process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, ""),
  ].filter(Boolean),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      enabled: Boolean(
        process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ),
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days session
    updateAge: 60 * 60 * 24, // 1 day update window
  },
});

module.exports = { auth };

