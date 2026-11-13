#!/usr/bin/env node

/**
 * commit-msg hook: validates commit message against project convention.
 *
 * Format: `:<emoji>: <type>(<scope>): <subject>`
 * Example: `:sparkles: feat(auth): add OAuth login support`
 *
 * Rules:
 * - Must start with :<emoji-name>:
 * - Must contain <type>(<scope>): <subject>
 * - type must be one of the known types
 * - subject must be lowercase, no period at end
 * - First line max 72 characters
 * - No Chinese characters in the first line
 */

import { readFileSync } from "node:fs";

const COMMIT_TYPES = [
  "feat",
  "fix",
  "docs",
  "style",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
  "revert",
  "security",
  "a11y",
  "i18n",
  "release",
  "hotfix",
];

const EMOJI_PATTERN = /^:[a-z0-9_+-]+:\s+/;
const FORMAT_PATTERN = /^:[a-z0-9_+-]+:\s+([a-z0-9]+)(\([a-z0-9_-]+\))?(!)?:\s+.+/;

function validate(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter(Boolean);

  if (lines.length === 0) {
    error("提交信息不能为空");
  }

  const firstLine = lines[0];
  const restLines = lines.slice(1);

  // Check first line length
  if (firstLine.length > 72) {
    error(`提交信息第一行超过 72 个字符（当前 ${firstLine.length}）`);
  }

  // Check emoji prefix
  if (!EMOJI_PATTERN.test(firstLine)) {
    error(`提交信息必须以 :emoji: 开头，如 ':sparkles: feat(auth): xxx'`);
  }

  // Check format
  const match = firstLine.match(FORMAT_PATTERN);
  if (!match) {
    error(
      `提交信息格式错误。\n` +
        `格式: :<emoji>: <type>(<scope>): <subject>\n` +
        `示例: :sparkles: feat(auth): add OAuth login support`,
    );
  }

  if (match) {
    const type = match[1];
    if (!COMMIT_TYPES.includes(type)) {
      error(`未知的 type "${type}"。\n` + `允许的值: ${COMMIT_TYPES.join(", ")}`);
    }
  }

  // Check no Chinese characters in first line
  const chinesePattern = /[一-鿿㐀-䶿]/;
  if (chinesePattern.test(firstLine)) {
    error("提交信息第一行不能包含中文字符，请使用英文");
  }

  // Check no trailing period on first line
  if (firstLine.endsWith(".")) {
    error("提交信息第一行不能以句号结尾");
  }

  // body lines should be wrapped at 72 characters
  for (let i = 0; i < restLines.length; i++) {
    const line = restLines[i];
    // Skip blank lines and comment lines
    if (line === "" || line.startsWith("#")) continue;
    if (line.length > 72) {
      error(`第 ${i + 2} 行超过 72 个字符（当前 ${line.length}）`);
    }
  }

  process.exit(0);
}

function error(msg) {
  console.error(`\n❌ 提交信息格式检查未通过:\n   ${msg}\n`);
  console.error(
    "正确的格式: :<emoji>: <type>(<scope>): <subject>\n" +
      "示例:\n" +
      "  :sparkles: feat(auth): add OAuth login support\n" +
      "  :bug: fix(navbar): resolve mobile overflow\n" +
      "  :recycle: refactor(utils): extract date formatting\n",
  );
  process.exit(1);
}

validate(process.argv[2]);
