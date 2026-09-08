import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const TAKING = readFileSync(path.join(ROOT, "lib/modules/aptitude/taking.ts"), "utf8");
const FINALIZE = readFileSync(path.join(ROOT, "lib/modules/aptitude/finalize.ts"), "utf8");

/**
 * The answer key must not reach the browser — same invariant, same reasoning
 * as Assessments' `assessment-answer-key.test.ts`. Split across two files
 * here rather than one: `loadForTaking` (in `taking.ts`) must never select
 * correctness at all, while `finalizeAttempt` (in `finalize.ts`, shared with
 * the worker sweep) legitimately reads it to compute a score, but must never
 * return it to whatever called it.
 */

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

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
    expect(withoutComments(bodyOf(TAKING, "loadForTaking"))).not.toMatch(/isCorrect\s*:/);
    expect(withoutComments(bodyOf(TAKING, "loadForTaking"))).not.toContain("isCorrect");
  });

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
    const types = withoutComments(TAKING.slice(TAKING.indexOf("export type TakingQuestion"), TAKING.indexOf("export type TakingOutcome")));
    expect(types).not.toContain("isCorrect");
    expect(types.toLowerCase()).not.toContain("correct");
  });
});

describe("finalizeAttempt may read the key, because nothing it returns is rendered", () => {
  it("reads correctness only where the result is a total", () => {
    const body = withoutComments(bodyOf(FINALIZE, "finalizeAttempt"));
    expect(body).toMatch(/isCorrect\s*:/);

    // What comes back is numbers and flags, never options or answers.
    const returnStatements = [...body.matchAll(/return \{[^}]*\}/g)];
    expect(returnStatements.length).toBeGreaterThan(0);
    for (const [returned] of returnStatements) {
      expect(returned).not.toContain("isCorrect");
      expect(returned).not.toContain("options");
    }
  });
});

describe("submitResponse never touches correctness directly", () => {
  it("delegates scoring to finalizeAttempt instead of selecting isCorrect itself", () => {
    const body = withoutComments(bodyOf(TAKING, "submitResponse"));
    expect(body).not.toMatch(/isCorrect\s*:/);
  });
});

describe("the public pages", () => {
  it("never mention correctness", () => {
    for (const file of ["app/aptitude/[token]/page.tsx", "app/aptitude/[token]/done/page.tsx"]) {
      const full = path.join(ROOT, file);
      const source = withoutComments(readFileSync(full, "utf8"));
      expect(source, file).not.toContain("isCorrect");
    }
  });
});
