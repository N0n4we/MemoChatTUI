import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  COMMANDS,
  DOCUMENTED_COMMANDS,
  applySlashCompletion,
  filterCommands,
  slashCompletions,
} from "./commands.ts";

const expectedDocumentedCommands = [
  "/help",
  "/chat",
  "/memo",
  "/sessions",
  "/settings",
  "/market",
  "/market local",
  "/market remote [page]",
  "/market search <text>",
  "/market install <index|id>",
  "/market delete <index|id>",
  "/channel add <url>",
  "/channel select <index|id>",
  "/channel remove <index|id>",
  "/channel login <user> <pass>",
  "/channel register <user> <pass>",
  "/channel me",
  "/pack save-current <name> | <description>",
  "/pack install <index|id>",
  "/pack delete <index|id>",
  "/pack import <path>",
  "/pack export active|<id> <path>",
  "/pack publish active|<index|id>",
  "/set apiKey <key>",
  "/set baseUrl <url>",
  "/set model <id>",
  "/set compactModel <id>",
  "/set reasoning on|off",
  "/set compactReasoning on|off",
  "/system <text>",
  "/rule add <title> | <rule>",
  "/rule del <index>",
  "/memo set <index> <text>",
  "/compact",
  "/new",
  "/save",
  "/load <number>",
  "/delete <number>",
  "/reasoning",
  "/clear",
  "/quit",
];

test("documented slash commands are represented by metadata", () => {
  const usages = new Set(DOCUMENTED_COMMANDS.map((command) => command.usage));
  assert.deepEqual([...usages], expectedDocumentedCommands);
  assert.equal(DOCUMENTED_COMMANDS.length, expectedDocumentedCommands.length);

  for (const command of DOCUMENTED_COMMANDS) {
    assert.ok(command.label, `${command.usage} has a palette label`);
    assert.ok(command.description, `${command.usage} has a description`);
    assert.ok(command.completion !== undefined, `${command.usage} has a completion value`);
    assert.ok(command.dispatch.kind, `${command.usage} has a dispatch target`);
  }
});

test("command palette filtering searches labels, aliases, and descriptions", () => {
  assert.equal(filterCommands("api key").some((command) => command.id === "set-api-key"), true);
  assert.equal(filterCommands("history").some((command) => command.id === "sessions"), true);
  assert.equal(filterCommands("remote install").some((command) => command.id === "market-install"), true);
  assert.equal(filterCommands("definitely absent").length, 0);
});

test("slash completion matches partial commands and applies selected completions", () => {
  const completions = slashCompletions("/mar").map((item) => item.command.usage);
  assert.equal(completions.includes("/market"), true);
  assert.equal(completions.includes("/market install <index|id>"), true);

  const install = DOCUMENTED_COMMANDS.find((command) => command.usage === "/market install <index|id>");
  assert.ok(install);
  assert.deepEqual(applySlashCompletion("/market in", "/market in".length, install), {
    text: "/market install ",
    cursor: "/market install ".length,
  });
});

test("README command reference stays aligned with metadata", () => {
  const readme = fs.readFileSync(new URL("../README.md", import.meta.url), "utf8");
  for (const command of expectedDocumentedCommands) {
    assert.ok(readme.includes(command), `README documents ${command}`);
  }

  const paletteOnly = COMMANDS.filter((command) => !command.documented);
  assert.equal(paletteOnly.some((command) => command.dispatch.kind === "overlay"), true);
});
