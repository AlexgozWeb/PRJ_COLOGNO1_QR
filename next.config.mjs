import { execSync } from "node:child_process";

const APP_RELEASE = "v03.00";

function resolveBuildRef() {
  const envSha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (envSha) return envSha.slice(0, 7);
  try {
    const gitSha = execSync("git rev-parse --short=7 HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    if (gitSha) return gitSha;
  } catch {}
  const dpl = process.env.VERCEL_DEPLOYMENT_ID;
  if (dpl) return dpl.replace(/^dpl_/, "").slice(0, 7);
  return "local";
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_APP_VERSION: `${APP_RELEASE}_${resolveBuildRef()}`,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
