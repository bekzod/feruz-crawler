import { execFileSync } from "node:child_process";

// Vercel uses the reverse of a normal check: 0 cancels, 1 builds.
// Only these independent applications/documentation can safely avoid a web build.
// Everything else (including new shared packages, root tooling and configuration)
// is deliberately considered frontend-affecting.
const unrelated = /^(?:apps\/api\/|apps\/worker\/|docs\/|README\.md$|AGENTS\.md$|ARCHITECTURE\.md$|design-qa\.md$)/;

function git(...args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    timeout: 20_000,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function decision() {
  if (!["preview", "production"].includes(process.env.VERCEL_ENV)) {
    return [1, "Development and unknown environments always build"];
  }

  // A promoted feature branch may have only a preview deployment baseline.
  // Never use that baseline to suppress its first production deployment.
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_GIT_COMMIT_REF !== "master") {
    return [1, "Production promotion or unknown production branch; building"];
  }

  let stage = "repository discovery";
  try {
    const root = git("rev-parse", "--show-toplevel").trim();
    process.chdir(root);
    let base = process.env.VERCEL_GIT_PREVIOUS_SHA;
    if (base) {
      // Never replace a missing previous deployment with HEAD^: several commits
      // may have landed since the last successful preview.
      stage = "previous deployment history";
      if (!/^[a-f0-9]{40}$/i.test(base)) throw new Error("Invalid previous SHA");
      git("cat-file", "-e", `${base}^{commit}`);
      // Rollbacks and rewritten histories must build rather than reuse an
      // unrelated baseline. A production first deployment must also build.
      stage = "deployment ancestry";
      git("merge-base", "--is-ancestor", base, "HEAD");
    } else {
      if (process.env.VERCEL_ENV === "production") {
        return [1, "No previous successful production baseline; building"];
      }
      // First preview: compare the entire branch, not just the latest commit.
      // Vercel's shallow checkout may not include master. Fetch only that branch;
      // unavailable history/network/merge base always permits the build.
      stage = "first-preview merge base";
      try {
        base = git("merge-base", "HEAD", "refs/remotes/origin/master").trim();
      } catch {
        stage = "first-preview base fetch";
        git("fetch", "--no-tags", "--depth=100", "origin",
          "+refs/heads/master:refs/remotes/origin/master");
        stage = "first-preview merge base after fetch";
        base = git("merge-base", "HEAD", "refs/remotes/origin/master").trim();
      }
      if (!base) throw new Error("No merge base");
    }
    // NUL delimiters support unusual filenames; no-renames accounts for both
    // sides of moves (especially frontend -> backend).
    stage = "changed-path diff";
    const paths = git("diff", "--name-only", "--no-renames", "-z", base, "HEAD", "--")
      .split("\0").filter(Boolean);
    // Workspace package metadata can change install resolution even outside the web app.
    const affected = paths.find(path => /(?:^|\/)(?:package\.json|bun\.lockb?|yarn\.lock|package-lock\.json|pnpm-lock\.yaml)$/.test(path) || !unrelated.test(path));
    return affected
      ? [1, `Frontend or shared/build input changed: ${JSON.stringify(affected)}`]
      : [0, "No frontend-affecting changes since the deployment baseline"];
  } catch {
    return [1, `Unable to establish a reliable diff (${stage}); building conservatively`];
  }
}

const [code, reason] = decision();
console.log(`[vercel-preview] ${reason}`);
process.exitCode = code;

