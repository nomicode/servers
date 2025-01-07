import { jest } from "@jest/globals";

// Set up test environment variables
process.env.GITHUB_PERSONAL_ACCESS_TOKEN = "test-token";

// Prevent process.exit() from killing Jest
process.exit = jest.fn() as jest.MockedFunction<typeof process.exit>;
