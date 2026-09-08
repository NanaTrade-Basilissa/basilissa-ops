import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const TAKING = readFileSync(path.join(ROOT, "lib/modules/assessments/taking.ts"), "utf8");

/**
 * The answer key must not reach the browser.
 *
 * A Server Component serialises whatever it passes to a Client Component, so a
 * single careless `isCorrect: true` in a select list publishes every answer to
 * anyone who opens developer tools. Nothing would look wrong: the page renders
 * identically, the tests pass, and the assessment is worthless.
 *
 * This is structural because the failure is invisible at runtime. A companion
 * check runs against a real database in the verification pass, asserting the
 * serialised view contains no correctness anywhere.
 */

/**
 * Strips comments, so prose ABOUT the answer key does not read as a leak of
 * it. The first version of this test failed on the comment in `loadForTaking`
 * warning against exactly what the test checks for.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** The body of one exported function, by brace matching. */
function bodyOf(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`);
  expect(start, `${name} not found`).toBeGreaterThan(-1);

  let depth = 0;
  let i = source.indexOf("{", start);
  const from = i;
  for (; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(from, i + 1);
    }
  }
  throw new Error(`unbalanced braces in ${name}`);
}

describe("the function that feeds the taking pages", () => {
  it("never selects correctness", () => {
    // The select syntax, not the bare word: a comment may legitimately warn
    // about the thing this test is enforcing.
    expect(withoutComments(bodyOf(TAKING, "loadForTaking"))).not.toMatch(/isCorrect\s*:/);
    expect(withoutComments(bodyOf(TAKING, "loadForTaking"))).not.toContain("isCorrect");
  });

  // A blanket include would pull every column, correctness among them, without
  // the word appearing anywhere.
  it("does not use include, which would pull it in silently", () => {
    expect(withoutComments(bodyOf(TAKING, "loadForTaking"))).not.toMatch(/\binclude\s*:/);
  });

  it("selects options by id and text only", () => {
    const body = bodyOf(TAKING, "loadForTaking");
    const optionSelects = [...body.matchAll(/select:\s*\{\s*id:\s*true,\s*text:\s*true\s*\}/g)];
    expect(optionSelects.length).toBeGreaterThan(0);
  });
});

describe("the shape handed to the page", () => {
  it("has no field that could carry correctness", () => {
    const types = withoutComments(
      TAKING.slice(
        TAKING.indexOf("export type TakingQuestion"),
        TAKING.indexOf("export type TakingOutcome"),
      ),
    );
    expect(types).not.toContain("isCorrect");
    // Broad on purpose: any field whose name mentions correctness would be
    // carrying the answer key under a different name.
    expect(types.toLowerCase()).not.toContain("correct");
  });
});

describe("scoring may read the key, because nothing it returns is rendered", () => {
  it("reads correctness only where the result is a total", () => {
    const body = withoutComments(bodyOf(TAKING, "submitResponse"));
    expect(body).toMatch(/isCorrect\s*:/);

    // What comes back is numbers and a flag, never options or answers.
    const returned = body.slice(body.lastIndexOf("return {"));
    expect(returned).not.toContain("isCorrect");
    expect(returned).not.toContain("options");
  });
});

describe("the public pages", () => {
  // Belt and braces: even if a select changed, a page that never mentions the
  // word cannot render it.
  it("never mention correctness", () => {
    for (const file of ["app/assessment/[token]/page.tsx", "app/assessment/[token]/done/page.tsx"]) {
      const full = path.join(ROOT, file);
      const source = withoutComments(readFileSync(full, "utf8"));
      expect(source, file).not.toContain("isCorrect");
    }
  });
});
