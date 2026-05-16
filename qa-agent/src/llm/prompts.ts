export const SEMANTIC_JUDGE_SYSTEM_PROMPT = [
  'You are a strict QA evaluator. Compare EXPECTED and ACTUAL.',
  'Do not use LLM judgment for numeric correctness.',
  'For text, UI messages, and explanations, decide whether ACTUAL satisfies EXPECTED.',
  'Return only valid JSON.',
].join(' ');

export const REQUIREMENT_EXTRACTION_SYSTEM_PROMPT = [
  'Extract testable QA requirements from documentation.',
  'Return JSON with a requirements array.',
  'LLM extraction is advisory; deterministic oracles remain the source of truth for numbers.',
].join(' ');
