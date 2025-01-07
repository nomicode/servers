#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  CreateBranchOptionsSchema,
  CreateBranchSchema,
  CreateIssueOptionsSchema,
  CreateIssueSchema,
  CreatePRReviewCommentSchema,
  CreateOrUpdateFileSchema,
  CreatePullRequestOptionsSchema,
  CreatePullRequestSchema,
  CreateRepositoryOptionsSchema,
  CreateRepositorySchema,
  ForkRepositorySchema,
  GetFileContentsSchema,
  GetIssueSchema,
  GitHubCommitSchema,
  GitHubContentSchema,
  GitHubCreateUpdateFileResponseSchema,
  GitHubForkSchema,
  GitHubIssueSchema,
  GitHubListCommits,
  GitHubListCommitsSchema,
  GitHubPRReviewCommentSchema,
  GitHubPullRequestSchema,
  GitHubReferenceSchema,
  GitHubRepositorySchema,
  GitHubSearchResponseSchema,
  GitHubTreeSchema,
  IssueCommentSchema,
  ListCommitsSchema,
  ListIssuesOptionsSchema,
  PushFilesSchema,
  SearchCodeResponseSchema,
  SearchCodeSchema,
  SearchIssuesResponseSchema,
  SearchIssuesSchema,
  SearchRepositoriesSchema,
  SearchUsersResponseSchema,
  SearchUsersSchema,
  UpdateIssueOptionsSchema,
  UpdatePullRequestSchema,
  type FileOperation,
  type GitHubCommit,
  type GitHubContent,
  type GitHubCreateUpdateFileResponse,
  type GitHubFork,
  type GitHubIssue,
  type GitHubPullRequest,
  type GitHubReference,
  type GitHubRepository,
  type GitHubSearchResponse,
  type GitHubTree,
  type SearchCodeResponse,
  type SearchIssuesResponse,
  type SearchUsersResponse
} from './schemas.js';

const server = new Server(
  {
    name: "github-mcp-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const GITHUB_PERSONAL_ACCESS_TOKEN = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;

if (!GITHUB_PERSONAL_ACCESS_TOKEN) {
  console.error("GITHUB_PERSONAL_ACCESS_TOKEN environment variable is not set");
  process.exit(1);
}

// Export functions for testing
export async function createPRReviewComment(
  owner: string,
  repo: string,
  pullNumber: number,
  body: string,
  commitId: string,
  path: string,
  line: number,
  side?: "LEFT" | "RIGHT",
  startLine?: number,
  startSide?: "LEFT" | "RIGHT"
): Promise<z.infer<typeof GitHubPRReviewCommentSchema>> {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/comments`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "github-mcp-server",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      body,
      commit_id: commitId,
      path,
      line,
      side: side || "RIGHT",
      start_line: startLine,
      start_side: startSide
    })
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  return GitHubPRReviewCommentSchema.parse(await response.json());
}

export async function updatePullRequest(
  owner: string,
  repo: string,
  pullNumber: number,
  options: Omit<z.infer<typeof UpdatePullRequestSchema>, 'owner' | 'repo' | 'pull_number'>
): Promise<GitHubPullRequest> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "github-mcp-server",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(options)
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  return GitHubPullRequestSchema.parse(await response.json());
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "update_pull_request",
        description: "Update an existing pull request",
        inputSchema: zodToJsonSchema(UpdatePullRequestSchema),
      },
      {
        name: "create_pr_review_comment",
        description: "Create a review comment on a specific line in a pull request",
        inputSchema: zodToJsonSchema(CreatePRReviewCommentSchema),
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    if (!request.params.arguments) {
      throw new Error("Arguments are required");
    }

    switch (request.params.name) {
      case "update_pull_request": {
        const args = UpdatePullRequestSchema.parse(request.params.arguments);
        const { owner, repo, pull_number, ...options } = args;
        const pullRequest = await updatePullRequest(owner, repo, pull_number, options);
        return {
          content: [{ type: "text", text: JSON.stringify(pullRequest, null, 2) }],
        };
      }

      case "create_pr_review_comment": {
        const args = CreatePRReviewCommentSchema.parse(request.params.arguments);
        const { owner, repo, pull_number, body, commit_id, path, line, side, start_line, start_side } = args;
        const comment = await createPRReviewComment(
          owner,
          repo,
          pull_number,
          body,
          commit_id,
          path,
          line,
          side,
          start_line,
          start_side
        );
        return { content: [{ type: "text", text: JSON.stringify(comment, null, 2) }] };
      }

      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(
        `Invalid arguments: ${error.errors
          .map(
            (e: z.ZodError["errors"][number]) =>
              `${e.path.join(".")}: ${e.message}`
          )
          .join(", ")}`
      );
    }
    throw error;
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("GitHub MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
