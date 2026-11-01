import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const script = fileURLToPath(new URL("./ignore-vercel-preview.mjs", import.meta.url));
function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), "vercel-preview-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-b", "master");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  function commit(path, content = "change") {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), content);
    git("add", ".");
    git("commit", "-m", "fixture");
    return git("rev-parse", "HEAD");
  }
  const base = commit("apps/web/src/app.ts", "initial");
  mkdirSync(join(cwd, "apps/web/scripts"), { recursive: true });
  const run = (env = {}, dir = join(cwd, "apps/web")) => spawnSync(process.execPath, [script], {
    cwd: dir, encoding: "utf8",
    env: { ...process.env, VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "master", VERCEL_GIT_PREVIOUS_SHA: base, ...env },
  });
  return { cwd, git, commit, base, run };
}

for (const path of ["apps/api/example.js","apps/worker/example.js","docs/example.js"]) {
  test(`skips independent change: ${path}`, t => {
    const f = fixture(t); f.commit(path);
    assert.equal(f.run().status, 0);
  });
}
for (const path of ["apps/web/src/shared/model.ts", "apps/web/bun.lock", "apps/web/package.json", "apps/web/vite.config.ts", "apps/web/vercel.json", "apps/web/scripts/build.mjs", "package.json", "bun.lock", "shared/api.ts", "packages/types/index.ts", "scripts/build.sh", ".npmrc", ".github/workflows/ci.yml", "vercel.json", "apps/web/src/file with\nnewline.ts"]) {
  test(`builds apps/web/shared/tooling change: ${JSON.stringify(path)}`, t => {
    const f = fixture(t); f.commit(path);
    assert.equal(f.run().status, 1);
    assert.match(f.run().stdout, /input changed/);
  });
}
test("development and missing environment always build", t => {
  const f = fixture(t); f.commit("apps/api/server.js");
  for (const VERCEL_ENV of ["development", ""]) {
    assert.equal(f.run({ VERCEL_ENV }).status, 1);
  }
});
test("compares cumulative commits, not HEAD parent", t => {
  const f = fixture(t); f.commit("apps/web/src/app.ts", "new UI"); f.commit("apps/api/server.js");
  assert.equal(f.run().status, 1);
});
test("already deployed apps/web followed by backend change skips", t => {
  const f = fixture(t); const deployed = f.commit("apps/web/src/app.ts", "new UI"); f.commit("apps/api/server.js");
  assert.equal(f.run({ VERCEL_GIT_PREVIOUS_SHA: deployed }).status, 0);
});
test("missing or malformed previous commit builds conservatively", t => {
  const f = fixture(t); f.commit("apps/api/server.js");
  for (const VERCEL_GIT_PREVIOUS_SHA of ["f".repeat(40), "--help"]) {
    const r = f.run({ VERCEL_GIT_PREVIOUS_SHA });
    assert.equal(r.status, 1); assert.match(r.stdout, /conservatively/);
  }
});
test("rename out of apps/web and apps/web deletion both build", t => {
  const f = fixture(t); mkdirSync(join(f.cwd, "apps/api"), { recursive: true });
  f.git("mv", "apps/web/src/app.ts", "apps/api/app.ts"); f.git("commit", "-am", "move");
  assert.equal(f.run().status, 1);
  f.git("reset", "--hard", f.base); f.git("rm", "apps/web/src/app.ts"); f.git("commit", "-m", "delete");
  assert.equal(f.run({}, f.cwd).status, 1);
});
test("no previous deployment uses whole branch merge base", t => {
  const f = fixture(t);
  f.git("remote", "add", "origin", f.cwd);
  f.git("checkout", "-b", "feature");
  f.commit("apps/api/server.js");
  assert.equal(f.run({ VERCEL_GIT_PREVIOUS_SHA: "" }).status, 0);
  f.commit("apps/web/src/app.ts", "new UI"); f.commit("apps/api/server.js", "later");
  assert.equal(f.run({ VERCEL_GIT_PREVIOUS_SHA: "" }).status, 1);
});
test("first preview without accessible base builds rather than guessing", t => {
  const f = fixture(t); f.commit("apps/api/server.js");
  assert.equal(f.run({ VERCEL_GIT_PREVIOUS_SHA: "" }).status, 1);
});
test("git failure builds conservatively", t => {
  const f = fixture(t);
  assert.equal(f.run({ PATH: "/missing" }).status, 1);
});
test("first preview does not mistake master-only apps/web changes for branch changes", t => {
  const f = fixture(t); f.git("remote", "add", "origin", f.cwd);
  f.git("checkout", "-b", "feature"); f.commit("apps/api/server.js");
  f.git("checkout", "master"); f.commit("apps/web/src/app.ts", "master-only UI");
  f.git("checkout", "feature");
  assert.equal(f.run({ VERCEL_GIT_PREVIOUS_SHA: "" }).status, 0);
});
test("a genuinely shallow clone missing the deployed SHA builds conservatively", t => {
  const f = fixture(t); f.commit("apps/web/src/app.ts", "not yet deployed");
  f.commit("apps/api/server.js"); f.commit("apps/api/server.js", "latest");
  const shallow = mkdtempSync(join(tmpdir(), "vercel-shallow-"));
  t.after(() => rmSync(shallow, { recursive: true, force: true }));
  execFileSync("git", ["clone", "--depth=2", `file://${f.cwd}`, shallow], { stdio: "ignore" });
  const r = f.run({}, join(shallow, "apps/web"));
  assert.equal(r.status, 1); assert.match(r.stdout, /conservatively/);
});
test("first preview uses existing master history without network credentials", t => {
  const f = fixture(t); f.git("update-ref", "refs/remotes/origin/master", f.base);
  f.commit("apps/api/server.js");
  assert.equal(f.run({ VERCEL_GIT_PREVIOUS_SHA: "" }).status, 0);
});

test("workspace manifests in otherwise independent apps still build", t => {
 const f = fixture(t); f.commit("apps/api/package.json"); assert.equal(f.run().status, 1);
});


test("production skips only a reliable unrelated cumulative diff", t => {
  const f = fixture(t); f.commit("apps/api/server.js");
  assert.equal(f.run({ VERCEL_ENV: "production" }).status, 0);
  assert.equal(f.run({ VERCEL_ENV: "production", VERCEL_GIT_PREVIOUS_SHA: "" }).status, 1);
  f.commit("shared/new-input.js");
  assert.equal(f.run({ VERCEL_ENV: "production" }).status, 1);
});
test("rollback and rewritten deployment history always build", t => {
  const f = fixture(t); const later = f.commit("apps/api/server.js");
  f.git("reset", "--hard", f.base);
  for (const VERCEL_ENV of ["preview", "production"]) {
    assert.equal(f.run({ VERCEL_ENV, VERCEL_GIT_PREVIOUS_SHA: later }).status, 1);
  }
});

test("production promotions and missing branch metadata always build", t => {
 const f = fixture(t);
 for (const VERCEL_GIT_COMMIT_REF of ["feature", ""]) {
  assert.equal(f.run({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF }).status, 1);
 }
});
