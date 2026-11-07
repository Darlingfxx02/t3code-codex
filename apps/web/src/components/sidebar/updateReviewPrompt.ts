import type { DesktopUpdateState } from "@t3tools/contracts";

import type { UpdateEverythingRow } from "./updateEverything.logic";

interface UpdateReviewPromptInput {
  readonly currentVersion: string | null;
  readonly targetVersion: string | null;
  readonly providerCount: number;
  readonly rows: ReadonlyArray<UpdateEverythingRow>;
  readonly releaseNotes: DesktopUpdateState["releaseNotes"];
}

function describeRows(rows: ReadonlyArray<UpdateEverythingRow>): string {
  const descriptions = rows.map((row) => {
    const targets = [
      row.app === "this-app" ? "приложение" : null,
      row.app === "server" ? "сервер" : null,
      row.app === "desktop-app" ? "desktop-приложение" : null,
      row.providers.length > 0 ? `провайдеры: ${row.providers.join(", ")}` : null,
    ].filter((part): part is string => part !== null);
    const status =
      row.skipped === null
        ? targets.join(", ") || "изменения не определены"
        : `пропущено: ${row.skipped}`;
    return `- ${row.label}: ${status}`;
  });
  return descriptions.length > 0
    ? descriptions.join("\n")
    : "- список машин и провайдеров не получен";
}

function describeReleaseNotes(releaseNotes: DesktopUpdateState["releaseNotes"]): string {
  const items = releaseNotes.flatMap((release) =>
    release.items.map((item) => `- ${release.version}: ${item}`),
  );
  return items.length > 0
    ? items.join("\n")
    : "- release notes не переданы, проверь изменения через git и upstream";
}

export function buildUpdateReviewPrompt({
  currentVersion,
  targetVersion,
  providerCount,
  rows,
  releaseNotes,
}: UpdateReviewPromptInput): string {
  return [
    "Разбери доступное обновление T3 Code для текущего проекта кастомизации.",
    "",
    "Сейчас нужен только анализ. Не запускай обновление, не устанавливай пакеты, не перезапускай приложение или сервер и не меняй файлы без отдельного решения пользователя.",
    "",
    `Текущая версия: ${currentVersion ?? "неизвестна"}`,
    `Целевая версия: ${targetVersion ?? "неизвестна"}`,
    `Обновлений провайдеров: ${providerCount}`,
    "",
    "Затронутые машины и провайдеры:",
    describeRows(rows),
    "",
    "Доступные release notes:",
    describeReleaseNotes(releaseNotes),
    "",
    "Сопоставь upstream с нашей текущей кастомизацией и разложи результат на три группы.",
    "1. Безопасно внедрить без изменения текущего дизайна и пользовательских потоков.",
    "2. Полезно, но требует ручной адаптации под наши UI-компоненты, русские заголовки, glass-оверлеи или другие кастомные контракты.",
    "3. Лучше отложить из-за риска для совместимости, миграций, провайдеров или производительности.",
    "Для каждой группы укажи конкретные commit SHA, затронутые файлы, зависимости и focused checks. В конце предложи маленькую последовательность внедрения. Жди решения пользователя перед реализацией.",
  ].join("\n");
}
