import test from "node:test";
import assert from "node:assert/strict";
import { parseTriageAnswer } from "../server/triage.js";
const response = () => ({
  reply: "Olá!",
  triage: {
    summary: "Precisa automatizar atendimento.",
    next_action: "Perguntar o orçamento.",
    disqualified: false,
    criteria: {
      budget: { score: null as number | null, evidence: "Não informado" },
      need: { score: 100, evidence: "Pediu automação" },
      authority: { score: 100, evidence: "Confirmou ser decisor" },
      timing: { score: 100, evidence: "Precisa este mês" },
    },
  },
});
test("unknown information cannot qualify a customer even when numeric threshold is reached", () => {
  const result = parseTriageAnswer(JSON.stringify(response()), 75);
  assert.equal(result.triage.score, 75);
  assert.equal(result.triage.status, "qualifying");
  assert.equal(result.triage.criteria.budget.score, null);
});
test("explicit disqualification overrides score; fabricated fields are discarded", () => {
  const input = response();
  input.triage.criteria.budget.score = 100;
  input.triage.disqualified = true;
  const result = parseTriageAnswer(
    JSON.stringify({ ...input, secret: "untrusted", score: 999 }),
    75,
  );
  assert.equal(result.triage.status, "unqualified");
  assert.equal("secret" in result, false);
});
test("invalid, incomplete and unbounded AI results are rejected", () => {
  for (const raw of [
    "not JSON",
    "{}",
    "null",
    JSON.stringify({ ...response(), reply: "" }),
    JSON.stringify({ ...response(), reply: "x".repeat(16001) }),
  ])
    assert.throws(() => parseTriageAnswer(raw, 75));
  for (const score of [-1, 101, 1.5, "100", undefined]) {
    const input = response();
    Object.assign(input.triage.criteria.need, { score });
    assert.throws(() => parseTriageAnswer(JSON.stringify(input), 75));
  }
});
