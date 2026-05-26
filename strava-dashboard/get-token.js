#!/usr/bin/env node
/**
 * One-time OAuth helper — run this once to get your refresh_token.
 *
 * Usage:
 *   1. node get-token.js
 *   2. Open the printed URL in a browser and authorize
 *   3. Copy the `code` from the redirect URL (http://localhost/?code=XXXX)
 *   4. Paste the code when prompted
 *   5. Your refresh_token will be printed — save it in .env
 */

const https = require("https");
const readline = require("readline");
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, "utf8")
      .split("\n")
      .forEach((line) => {
        const [key, ...rest] = line.split("=");
        if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
      });
  }
}

loadEnv();

const CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET in .env first.");
  process.exit(1);
}

const authUrl =
  `https://www.strava.com/oauth/authorize` +
  `?client_id=${CLIENT_ID}` +
  `&response_type=code` +
  `&redirect_uri=http://localhost` +
  `&scope=read,activity:read` +
  `&approval_prompt=force`;

console.log("\n── Strava OAuth Token Setup ──────────────────────────────");
console.log("\n1. Open this URL in your browser:\n");
console.log("   " + authUrl);
console.log("\n2. Authorize the app.");
console.log("3. You'll be redirected to http://localhost/?code=XXXX&scope=...");
console.log("4. Copy ONLY the `code` value from the URL.\n");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question("Paste the authorization code here: ", async (code) => {
  rl.close();
  code = code.trim();

  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
  }).toString();

  const options = {
    hostname: "www.strava.com",
    path: "/oauth/token",
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(body),
    },
  };

  const req = https.request(options, (res) => {
    let data = "";
    res.on("data", (c) => (data += c));
    res.on("end", () => {
      const json = JSON.parse(data);
      if (json.refresh_token) {
        console.log("\n── Success! ──────────────────────────────────────────────");
        console.log(`\nAccess token:  ${json.access_token}`);
        console.log(`Refresh token: ${json.refresh_token}`);
        console.log(`Athlete:       ${json.athlete?.firstname} ${json.athlete?.lastname}`);
        console.log("\nAdd to your .env file:");
        console.log(`STRAVA_REFRESH_TOKEN=${json.refresh_token}`);

        // Auto-write to .env if it exists
        const envPath = path.join(__dirname, ".env");
        if (fs.existsSync(envPath)) {
          let env = fs.readFileSync(envPath, "utf8");
          if (env.includes("STRAVA_REFRESH_TOKEN=")) {
            env = env.replace(
              /STRAVA_REFRESH_TOKEN=.*/,
              `STRAVA_REFRESH_TOKEN=${json.refresh_token}`
            );
          } else {
            env += `\nSTRAVA_REFRESH_TOKEN=${json.refresh_token}\n`;
          }
          fs.writeFileSync(envPath, env);
          console.log("\n.env updated automatically!");
        }
      } else {
        console.error("\nFailed:", JSON.stringify(json, null, 2));
      }
    });
  });

  req.on("error", (e) => console.error("Request error:", e.message));
  req.write(body);
  req.end();
});
