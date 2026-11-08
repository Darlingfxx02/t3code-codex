import { describe, expect, it } from "vite-plus/test";

import { buildThreadTitlePrompt } from "./textGenerationPrompts.ts";

describe("thread title prompts", () => {
  it("keeps an initial title in the user's language", () => {
    const { prompt } = buildThreadTitlePrompt({
      message: "Почини выравнивание заголовка в карточке чата",
    });

    expect(prompt).toContain("Write the title in the same natural language as the user's message");
    expect(prompt).toContain("If the user writes in Russian, the title must be in Russian");
  });

  it("uses the latest user's language when refining a title", () => {
    const { prompt } = buildThreadTitlePrompt({
      message: "USER:\nУбери английский заголовок чата\n\nASSISTANT:\nГотово",
      previousTitle: "Fix chat title",
    });

    expect(prompt).toContain("same natural language as the user's latest explicit goal");
    expect(prompt).toContain("If the user's goal is in Russian, the title must be in Russian");
  });
});
