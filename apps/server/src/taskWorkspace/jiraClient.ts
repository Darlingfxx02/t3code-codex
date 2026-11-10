import * as NodeBuffer from "node:buffer";

import type { TaskWorkspaceAttachment, TaskWorkspaceIssue, TaskWorkspaceSprint } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

export interface JiraClientConnection {
  readonly baseUrl: string;
  readonly token: string;
  readonly username?: string | null;
}

export class JiraClientError extends Error {
  readonly category: "configuration" | "response" | "pagination" | "conflict" | "network";
  readonly status: number | null;

  constructor(
    category: "configuration" | "response" | "pagination" | "conflict" | "network",
    status: number | null = null,
  ) {
    super(
      category === "conflict"
        ? "The Jira issue changed. Synchronize it before publishing the local draft."
        : category === "configuration"
          ? "Check the Jira address and server credential."
          : category === "pagination"
            ? "Jira returned an incomplete page. The previous task list has been preserved."
            : category === "network"
              ? "Jira did not answer. Retry synchronization."
              : `Jira rejected the request${status === null ? "." : ` (${status}).`}`,
    );
    this.name = "JiraClientError";
    this.category = category;
    this.status = status;
  }
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function string(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function list(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function date(value: unknown): string | null {
  const parsed = Date.parse(string(value));
  return Number.isNaN(parsed) ? null : DateTime.formatIso(DateTime.makeUnsafe(parsed));
}

function documentText(value: unknown): string {
  if (typeof value === "string") return normalizeJiraText(value);
  const node = object(value);
  if (node.type === "hardBreak") return "\n";
  const children = list(node.content).map(documentText).join("");
  const own = string(node.text);
  return `${own}${children}${["paragraph", "heading", "listItem"].includes(string(node.type)) ? "\n" : ""}`;
}

function normalizeJiraText(value: string): string {
  return value
    .replace(/^h[1-6]\.\s*/gm, "")
    .replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$1 ($2)")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^(?:[-*])\s+/gm, "• ")
    .replace(/\|\|([^\n]+)\|\|/g, "$1")
    .replace(/\|([^|\n]+)\|/g, "$1 ")
    .replace(/!([^!|\n]+)(?:\|[^!\n]*)?!/g, "[attachment: $1]")
    .replace(/\{code(?::[^}]*)?\}/g, "")
    .replace(/\{noformat\}/g, "")
    .replace(/\{color(?::[^}]*)?\}/g, "")
    .replace(/\{\/color\}/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sprint(value: unknown): TaskWorkspaceSprint | null {
  if (typeof value === "string") {
    const id = /(?:\[|,)id=(\d+)/.exec(value)?.[1];
    const name =
      /(?:\[|,)name=(.*?)(?=,(?:startDate|endDate|completeDate|state|rapidViewId|sequence|goal)=|\]$)/.exec(
        value,
      )?.[1];
    if (!id || !name) return null;
    const state = /(?:\[|,)state=(\w+)/.exec(value)?.[1]?.toLowerCase();
    return {
      id,
      name,
      ...(state === "active" || state === "closed" || state === "future" ? { state } : {}),
      startAt: date(/(?:\[|,)startDate=([^,\]]+)/.exec(value)?.[1]),
      endAt: date(/(?:\[|,)endDate=([^,\]]+)/.exec(value)?.[1]),
    };
  }
  const source = object(value);
  const id = typeof source.id === "number" ? String(source.id) : string(source.id);
  const name = string(source.name);
  if (!id || !name) return null;
  const state = string(source.state).toLowerCase();
  return {
    id,
    name,
    ...(state === "active" || state === "closed" || state === "future" ? { state } : {}),
    startAt: date(source.startDate),
    endAt: date(source.endDate),
  };
}

function issueSprint(fields: Record<string, unknown>, sprintField: string | null) {
  const raw = sprintField ? fields[sprintField] : fields.sprint;
  const candidates = (Array.isArray(raw) ? raw : [raw])
    .map(sprint)
    .filter((entry): entry is TaskWorkspaceSprint => entry !== null);
  return candidates.find((entry) => entry.state === "active") ?? candidates.at(-1) ?? null;
}

function normalizeIssue(raw: unknown, base: URL, sprintField: string | null): TaskWorkspaceIssue {
  const source = object(raw);
  const fields = object(source.fields);
  const key = string(source.key);
  const updated = string(fields.updated);
  const updatedAt = date(updated);
  const summary = string(fields.summary);
  if (!key || !summary || !updatedAt) throw new JiraClientError("response");
  const assignee = object(fields.assignee);
  const status = object(fields.status);
  const category = object(status.statusCategory);
  const attachments: TaskWorkspaceAttachment[] = list(fields.attachment).flatMap((rawAttachment) => {
    const attachment = object(rawAttachment);
    const id = string(attachment.id) || string(attachment.filename);
    const name = string(attachment.filename) || id;
    if (!id || !name) return [];
    return [
      {
        id,
        name,
        url: string(attachment.content) || null,
        mimeType: string(attachment.mimeType) || null,
      },
    ];
  });
  return {
    key,
    summary,
    description: documentText(fields.description).trimEnd(),
    browseUrl: new URL(`browse/${encodeURIComponent(key)}`, base).href,
    status: {
      name: string(status.name, "Unknown"),
      category: string(category.name),
      color: string(category.colorName),
    },
    assignee: string(assignee.displayName) || string(assignee.name) || null,
    assigneeId: string(assignee.name) || string(assignee.accountId) || null,
    priority: string(object(fields.priority).name) || null,
    sprint: issueSprint(fields, sprintField),
    createdAt: date(fields.created) ?? updatedAt,
    updatedAt,
    sourceRevision: updated,
    attachments,
    comments: list(object(fields.comment).comments).map((rawComment) => {
      const comment = object(rawComment);
      return {
        id: string(comment.id),
        author: string(object(comment.author).displayName, "Jira"),
        body: documentText(comment.body).trimEnd(),
        createdAt: date(comment.created) ?? updatedAt,
        source: "jira" as const,
      };
    }),
  };
}

function jqlString(value: string): string {
  return JSON.stringify(value);
}

export function createJiraClient(
  connection: JiraClientConnection,
  options: { readonly fetch?: typeof fetch } = {},
) {
  let base: URL;
  try {
    base = new URL(connection.baseUrl.replace(/\/?$/, "/"));
  } catch {
    throw new JiraClientError("configuration");
  }
  if (
    !["https:", "http:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    !connection.token.trim()
  )
    throw new JiraClientError("configuration");
  const fetcher = options.fetch ?? fetch;
  const authorization = connection.username
    ? `Basic ${NodeBuffer.Buffer.from(`${connection.username}:${connection.token}`).toString("base64")}`
    : `Bearer ${connection.token}`;

  async function request(path: string, init: RequestInit = {}): Promise<unknown> {
    let response: Response;
    try {
      response = await fetcher(new URL(`rest/api/2/${path}`, base), {
        ...init,
        redirect: "error",
        signal: init.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(30_000)])
          : AbortSignal.timeout(30_000),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: authorization,
        },
      });
    } catch {
      throw new JiraClientError("network");
    }
    if (!response.ok) throw new JiraClientError("response", response.status);
    if (response.status === 204) return null;
    try {
      return await response.json();
    } catch {
      throw new JiraClientError("response", response.status);
    }
  }

  async function allComments(key: string): Promise<readonly unknown[]> {
    const comments: unknown[] = [];
    for (let page = 0; page < 10_000; page++) {
      const query = new URLSearchParams({ startAt: String(comments.length), maxResults: "100" });
      const data = object(await request(`issue/${encodeURIComponent(key)}/comment?${query}`));
      const batch = list(data.comments);
      if (
        !Number.isSafeInteger(data.total) ||
        Number(data.total) < 0 ||
        !Array.isArray(data.comments)
      ) {
        throw new JiraClientError("response");
      }
      comments.push(...batch);
      if (comments.length >= Number(data.total)) return comments;
      if (batch.length === 0) throw new JiraClientError("pagination");
    }
    throw new JiraClientError("pagination");
  }

  async function completeComments(raw: unknown): Promise<unknown> {
    const source = object(raw);
    const fields = object(source.fields);
    const comment = object(fields.comment);
    if (typeof comment.total !== "number" || list(comment.comments).length >= comment.total)
      return raw;
    return {
      ...source,
      fields: { ...fields, comment: { comments: await allComments(string(source.key)) } },
    };
  }

  async function findSprintField(): Promise<string | null> {
    const fields = list(await request("field"));
    return (
      string(
        object(
          fields.find((raw) => {
            const field = object(raw);
            return (
              string(object(field.schema).custom).endsWith(":gh-sprint") ||
              string(field.name).toLowerCase() === "sprint"
            );
          }),
        ).id,
      ) || null
    );
  }

  async function searchIssues(
    input: {
      readonly assignee?: string | null;
      readonly projectKeys?: readonly string[];
      readonly signal?: AbortSignal;
    } = {},
  ) {
    const sprintField = await findSprintField();
    const assignee = input.assignee?.trim();
    const clauses = [
      `assignee = ${assignee && assignee !== "currentUser()" ? jqlString(assignee) : "currentUser()"}`,
    ];
    if (input.projectKeys?.length)
      clauses.push(`project in (${input.projectKeys.map(jqlString).join(", ")})`);
    const jql = `${clauses.join(" AND ")} ORDER BY created ASC, key ASC`;
    const issues: TaskWorkspaceIssue[] = [];
    const seen = new Set<string>();
    let startAt = 0;
    for (let page = 0; page < 10_000; page++) {
      const data = object(
        await request("search", {
          method: "POST",
          ...(input.signal ? { signal: input.signal } : {}),
          body: JSON.stringify({
            jql,
            startAt,
            maxResults: 50,
            fields: [
              "summary",
              "description",
              "status",
              "assignee",
              "priority",
              "created",
              "updated",
              "comment",
              "attachment",
              ...(sprintField ? [sprintField] : []),
            ],
          }),
        }),
      );
      const batch = list(data.issues);
      if (
        !Number.isSafeInteger(data.total) ||
        Number(data.total) < 0 ||
        !Array.isArray(data.issues)
      ) {
        throw new JiraClientError("response");
      }
      let newCount = 0;
      for (const raw of batch) {
        const issue = normalizeIssue(await completeComments(raw), base, sprintField);
        if (!seen.has(issue.key)) {
          issues.push(issue);
          seen.add(issue.key);
          newCount++;
        }
      }
      startAt += batch.length;
      if (startAt >= Number(data.total)) {
        const sprints = [
          ...new Map(
            issues.flatMap((issue) =>
              issue.sprint ? [[issue.sprint.id, issue.sprint] as const] : [],
            ),
          ).values(),
        ];
        return { issues, sprints };
      }
      if (!newCount) throw new JiraClientError("pagination");
    }
    throw new JiraClientError("pagination");
  }

  async function getIssue(key: string): Promise<TaskWorkspaceIssue> {
    const sprintField = await findSprintField();
    return normalizeIssue(
      await completeComments(await request(`issue/${encodeURIComponent(key)}`)),
      base,
      sprintField,
    );
  }

  async function updateIssue(
    key: string,
    fields: { readonly summary: string; readonly description: string },
    expectedRevision: string,
  ) {
    const current = await getIssue(key);
    if (current.sourceRevision !== expectedRevision) throw new JiraClientError("conflict");
    await request(`issue/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: JSON.stringify({ fields }),
    });
    return getIssue(key);
  }

  async function ensureComment(key: string, body: string, marker: string) {
    if (!marker || marker.includes("\n")) throw new JiraClientError("configuration");
    const existing = (await allComments(key)).find((raw) =>
      documentText(object(raw).body).split("\n").includes(marker),
    );
    if (existing) return { id: string(object(existing).id), created: false };
    const created = object(
      await request(`issue/${encodeURIComponent(key)}/comment`, {
        method: "POST",
        body: JSON.stringify({ body: `${body}\n\n${marker}` }),
      }),
    );
    const id = string(created.id);
    if (!id) throw new JiraClientError("response");
    return { id, created: true };
  }

  return { searchIssues, getIssue, updateIssue, ensureComment };
}
