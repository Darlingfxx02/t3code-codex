import { describe, expect, it } from "vite-plus/test";

import { createJiraClient, JiraClientError } from "./jiraClient.ts";

const connection = { baseUrl: "https://jira.example.test/jira", token: "private-test-value" };
const field = {
  id: "customfield_10020",
  name: "Sprint",
  schema: { custom: "com.pyxis.greenhopper.jira:gh-sprint" },
};
const sourceIssue = (key: string, overrides: Record<string, unknown> = {}) => ({
  key,
  fields: {
    summary: `Issue ${key}`,
    description: "Task description",
    status: { name: "Ревью", statusCategory: { name: "К выполнению", colorName: "default" } },
    assignee: { name: "designer", displayName: "Designer" },
    priority: { name: "Medium" },
    created: "2026-11-01T09:00:00.000+0300",
    updated: "2026-11-09T12:00:00.000+0300",
    comment: { total: 0, comments: [] },
    attachment: [
      {
        id: "att-1",
        filename: "mock.png",
        content: "https://jira.example.test/secure/attachment/att-1/mock.png",
        mimeType: "image/png",
      },
    ],
    customfield_10020: [
      { id: 11, name: "Sprint 11", state: "active", startDate: "2026-11-02T00:00:00Z" },
    ],
    ...overrides,
  },
});

function transport(
  handler: (url: URL, init: RequestInit) => Response | Promise<Response>,
): typeof fetch {
  return ((url: string | URL | Request, init: RequestInit = {}) =>
    Promise.resolve(
      handler(new URL(url instanceof Request ? url.url : url), init),
    )) as typeof fetch;
}

describe("Jira task adapter", () => {
  it("loads every page, retains custom statuses and separates user identity from display name", async () => {
    const starts: number[] = [];
    const client = createJiraClient(connection, {
      fetch: transport((url, init) => {
        expect(url.origin).toBe("https://jira.example.test");
        expect(url.pathname.startsWith("/jira/rest/api/2/")).toBe(true);
        expect(init.redirect).toBe("error");
        if (url.pathname.endsWith("/field")) return Response.json([field]);
        const body = JSON.parse(String(init.body));
        starts.push(body.startAt);
        expect(body.fields).toContain("attachment");
        expect(body.jql).toBe(
          'assignee = "designer" AND project in ("NEUROKEY") ORDER BY created ASC, key ASC',
        );
        expect(body.jql).not.toContain("statusCategory");
        return Response.json({ total: 2, issues: [sourceIssue(`NEUROKEY-${body.startAt + 1}`)] });
      }),
    });
    const result = await client.searchIssues({ assignee: "designer", projectKeys: ["NEUROKEY"] });
    expect(starts).toEqual([0, 1]);
    expect(result.issues.map((issue) => issue.key)).toEqual(["NEUROKEY-1", "NEUROKEY-2"]);
    expect(result.issues[0]).toMatchObject({
      status: { name: "Ревью", category: "К выполнению" },
      assignee: "Designer",
      assigneeId: "designer",
      createdAt: "2026-11-01T06:00:00.000Z",
      sourceRevision: "2026-11-09T12:00:00.000+0300",
      browseUrl: "https://jira.example.test/jira/browse/NEUROKEY-1",
      attachments: [
        {
          id: "att-1",
          name: "mock.png",
          url: "https://jira.example.test/secure/attachment/att-1/mock.png",
          mimeType: "image/png",
        },
      ],
    });
    expect(result.sprints).toEqual([
      {
        id: "11",
        name: "Sprint 11",
        state: "active",
        startAt: "2026-11-02T00:00:00.000Z",
        endAt: null,
      },
    ]);
  });

  it("reads truncated comments and legacy sprint serialization without dropping the source text", async () => {
    const client = createJiraClient(connection, {
      fetch: transport((url) => {
        if (url.pathname.endsWith("/field")) return Response.json([field]);
        if (url.pathname.endsWith("/comment")) {
          const start = Number(url.searchParams.get("startAt"));
          return Response.json({
            total: 2,
            comments: [
              {
                id: String(start + 1),
                author: { displayName: "Author" },
                body: `Comment ${start + 1}`,
                created: "2026-11-09T10:00:00Z",
              },
            ],
          });
        }
        return Response.json(
          sourceIssue("NEUROKEY-1", {
            comment: { total: 2, comments: [] },
            description: {
              type: "doc",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Do this" }] }],
            },
            customfield_10020: [
              "com.atlassian.greenhopper.service.sprint.Sprint@1[id=7,rapidViewId=2,state=CLOSED,name=Sprint 7,startDate=2026-10-01T00:00:00.000Z,endDate=<null>,completeDate=<null>]",
            ],
          }),
        );
      }),
    });
    const issue = await client.getIssue("NEUROKEY-1");
    expect(issue.comments.map((comment) => comment.body)).toEqual(["Comment 1", "Comment 2"]);
    expect(issue.description).toBe("Do this");
    expect(issue.sprint).toMatchObject({ id: "7", name: "Sprint 7", state: "closed", endAt: null });
  });

  it("rejects incomplete pagination instead of accepting a partial synchronization", async () => {
    const client = createJiraClient(connection, {
      fetch: transport((url) =>
        url.pathname.endsWith("/field")
          ? Response.json([field])
          : Response.json({ total: 2, issues: [] }),
      ),
    });
    await expect(client.searchIssues()).rejects.toMatchObject({ category: "pagination" });
  });

  it("quotes assignee input and never includes response bodies or tokens in errors", async () => {
    let jql = "";
    const client = createJiraClient(connection, {
      fetch: transport((url, init) => {
        if (url.pathname.endsWith("/field")) return Response.json([field]);
        jql = JSON.parse(String(init.body)).jql;
        return new Response("sensitive server diagnostic private-test-value", { status: 403 });
      }),
    });
    const failure = await client
      .searchIssues({ assignee: 'a" OR status = Done' })
      .catch((error: unknown) => error);
    expect(jql).toBe('assignee = "a\\" OR status = Done" ORDER BY created ASC, key ASC');
    expect(failure).toBeInstanceOf(JiraClientError);
    expect(String(failure)).not.toContain("private-test-value");
    expect(String(failure)).not.toContain("sensitive");
  });

  it("refuses a changed Jira revision before writing a local draft", async () => {
    let writes = 0;
    const client = createJiraClient(connection, {
      fetch: transport((url, init) => {
        if (init.method === "PUT") writes++;
        return Response.json(url.pathname.endsWith("/field") ? [field] : sourceIssue("NEUROKEY-1"));
      }),
    });
    await expect(
      client.updateIssue(
        "NEUROKEY-1",
        { summary: "New title", description: "Local draft" },
        "old-revision",
      ),
    ).rejects.toMatchObject({ category: "conflict" });
    expect(writes).toBe(0);
  });

  it("recognizes a previously delivered publication comment after a lost response", async () => {
    const comments: { id: string; body: string }[] = [];
    const client = createJiraClient(connection, {
      fetch: transport((url, init) => {
        expect(url.pathname).toContain("/issue/NEUROKEY-1/comment");
        if (init.method === "POST") {
          const comment = { id: "101", body: JSON.parse(String(init.body)).body };
          comments.push(comment);
          return Response.json(comment);
        }
        return Response.json({ total: comments.length, comments });
      }),
    });
    expect(
      await client.ensureComment("NEUROKEY-1", "Storybook ready", "[t3:publish-one:comment-one]"),
    ).toEqual({ id: "101", created: true });
    expect(
      await client.ensureComment("NEUROKEY-1", "Storybook ready", "[t3:publish-one:comment-one]"),
    ).toEqual({ id: "101", created: false });
    expect(comments).toHaveLength(1);
  });
});
