import { createPRReviewComment, updatePullRequest } from "../index.js";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

// Mock GitHub API responses
const handlers = [
  // PR Review Comment
  http.post("https://api.github.com/repos/:owner/:repo/pulls/:number/comments", async ({ params, request }) => {
    const { owner, repo, number } = params as { owner: string; repo: string; number: string };
    const body = await request.json() as {
      body: string;
      commit_id: string;
      path: string;
      line: number;
      side?: "LEFT" | "RIGHT";
      start_line?: number;
      start_side?: "LEFT" | "RIGHT";
    };

    return HttpResponse.json({
      url: `https://api.github.com/repos/${owner}/${repo}/pulls/comments/1`,
      pull_request_review_id: 1,
      id: 1,
      node_id: "PRR_1",
      diff_hunk: "@@ -1,1 +1,1 @@",
      path: body.path,
      position: body.line,
      original_position: body.line,
      commit_id: body.commit_id,
      original_commit_id: body.commit_id,
      user: {
        login: "test-user",
        id: 1,
        avatar_url: "https://github.com/images/error/test-user.gif",
        url: "https://api.github.com/users/test-user",
        html_url: "https://github.com/test-user"
      },
      body: body.body,
      created_at: "2025-01-07T00:00:00Z",
      updated_at: "2025-01-07T00:00:00Z",
      html_url: `https://github.com/${owner}/${repo}/pull/${number}#discussion_r1`,
      pull_request_url: `https://api.github.com/repos/${owner}/${repo}/pulls/${number}`,
      author_association: "CONTRIBUTOR",
      _links: {
        self: { href: `https://api.github.com/repos/${owner}/${repo}/pulls/comments/1` },
        html: { href: `https://github.com/${owner}/${repo}/pull/${number}#discussion_r1` },
        pull_request: { href: `https://api.github.com/repos/${owner}/${repo}/pulls/${number}` }
      }
    });
  }),

  // Update PR
  http.patch("https://api.github.com/repos/:owner/:repo/pulls/:number", async ({ params, request }) => {
    const { owner, repo, number } = params as { owner: string; repo: string; number: string };
    const body = await request.json() as {
      title?: string;
      body?: string;
      state?: "open" | "closed";
      base?: string;
      maintainer_can_modify?: boolean;
    };

    return HttpResponse.json({
      url: `https://api.github.com/repos/${owner}/${repo}/pulls/${number}`,
      id: 1,
      node_id: "PR_1",
      html_url: `https://github.com/${owner}/${repo}/pull/${number}`,
      diff_url: `https://github.com/${owner}/${repo}/pull/${number}.diff`,
      patch_url: `https://github.com/${owner}/${repo}/pull/${number}.patch`,
      issue_url: `https://api.github.com/repos/${owner}/${repo}/issues/${number}`,
      number: parseInt(number as string),
      state: body.state || "open",
      locked: false,
      title: body.title || "Original Title",
      user: {
        login: "test-user",
        id: 1,
        avatar_url: "https://github.com/images/error/test-user.gif",
        url: "https://api.github.com/users/test-user",
        html_url: "https://github.com/test-user"
      },
      body: body.body || "Original body",
      created_at: "2025-01-07T00:00:00Z",
      updated_at: "2025-01-07T00:00:00Z",
      closed_at: null,
      merged_at: null,
      merge_commit_sha: null,
      assignee: null,
      assignees: [],
      head: {
        label: "test-user:test-branch",
        ref: "test-branch",
        sha: "test-sha",
        user: {
          login: "test-user",
          id: 1,
          avatar_url: "https://github.com/images/error/test-user.gif",
          url: "https://api.github.com/users/test-user",
          html_url: "https://github.com/test-user"
        },
        repo: {
          id: 1,
          name: repo,
          full_name: `${owner}/${repo}`,
          owner: {
            login: owner as string,
            id: 1,
            node_id: "U_1",
            avatar_url: "https://github.com/images/error/test-user.gif",
            url: `https://api.github.com/users/${owner}`,
            html_url: `https://github.com/${owner}`,
            type: "User"
          },
          html_url: `https://github.com/${owner}/${repo}`,
          description: "Test repo",
          url: `https://api.github.com/repos/${owner}/${repo}`,
          private: false,
          fork: false,
          created_at: "2025-01-07T00:00:00Z",
          updated_at: "2025-01-07T00:00:00Z",
          pushed_at: "2025-01-07T00:00:00Z",
          git_url: `git://github.com/${owner}/${repo}.git`,
          ssh_url: `git@github.com:${owner}/${repo}.git`,
          clone_url: `https://github.com/${owner}/${repo}.git`,
          default_branch: "main",
          node_id: "R_1"
        }
      },
      base: {
        label: `${owner}:main`,
        ref: "main",
        sha: "main-sha",
        user: {
          login: owner as string,
          id: 2,
          avatar_url: "https://github.com/images/error/owner.gif",
          url: `https://api.github.com/users/${owner}`,
          html_url: `https://github.com/${owner}`
        },
        repo: {
          id: 2,
          name: repo,
          full_name: `${owner}/${repo}`,
          owner: {
            login: owner as string,
            id: 2,
            node_id: "U_2",
            avatar_url: "https://github.com/images/error/owner.gif",
            url: `https://api.github.com/users/${owner}`,
            html_url: `https://github.com/${owner}`,
            type: "User"
          },
          html_url: `https://github.com/${owner}/${repo}`,
          description: "Test repo",
          url: `https://api.github.com/repos/${owner}/${repo}`,
          private: false,
          fork: false,
          created_at: "2025-01-07T00:00:00Z",
          updated_at: "2025-01-07T00:00:00Z",
          pushed_at: "2025-01-07T00:00:00Z",
          git_url: `git://github.com/${owner}/${repo}.git`,
          ssh_url: `git@github.com:${owner}/${repo}.git`,
          clone_url: `https://github.com/${owner}/${repo}.git`,
          default_branch: "main",
          node_id: "R_2"
        }
      }
    });
  })
];

const server = setupServer(...handlers);

// Start server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

// Reset handlers after each test
afterEach(() => server.resetHandlers());

// Close server after all tests
afterAll(async () => {
  server.close();
  // Close MCP server
  await new Promise<void>((resolve) => {
    // Give it a moment to clean up
    setTimeout(() => {
      process.removeAllListeners();
      resolve();
    }, 100);
  });
});

test("creates a PR review comment", async () => {
  const owner = "test-owner";
  const repo = "test-repo";
  const pullNumber = 123;

  const comment = await createPRReviewComment(
    owner,
    repo,
    pullNumber,
    "This needs improvement",
    "abc123",
    "src/file.ts",
    42,
    "RIGHT"
  );

  expect(comment).toMatchObject({
    body: "This needs improvement",
    path: "src/file.ts",
    position: 42,
    commit_id: "abc123",
    pull_request_review_id: 1,
    user: {
      login: "test-user"
    }
  });
});

test("creates a multi-line PR review comment", async () => {
  const owner = "test-owner";
  const repo = "test-repo";
  const pullNumber = 123;

  const comment = await createPRReviewComment(
    owner,
    repo,
    pullNumber,
    "Consider refactoring this section",
    "abc123",
    "src/file.ts",
    42,
    "RIGHT",
    40,
    "RIGHT"
  );

  expect(comment).toMatchObject({
    body: "Consider refactoring this section",
    path: "src/file.ts",
    position: 42,
    commit_id: "abc123",
    pull_request_review_id: 1,
    user: {
      login: "test-user"
    }
  });
});

test("updates a PR title and body", async () => {
  const owner = "test-owner";
  const repo = "test-repo";
  const pullNumber = 123;

  const updatedPR = await updatePullRequest(
    owner,
    repo,
    pullNumber,
    {
      title: "Updated Title",
      body: "Updated description"
    }
  );

  expect(updatedPR).toMatchObject({
    title: "Updated Title",
    body: "Updated description",
    state: "open"
  });
});

test("updates a PR state", async () => {
  const owner = "test-owner";
  const repo = "test-repo";
  const pullNumber = 123;

  const updatedPR = await updatePullRequest(
    owner,
    repo,
    pullNumber,
    {
      state: "closed"
    }
  );

  expect(updatedPR).toMatchObject({
    state: "closed"
  });
});
