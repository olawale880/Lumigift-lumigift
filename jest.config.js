const nextJest = require("next/jest");

const createJestConfig = nextJest({ dir: "./" });

/** @type {import('jest').Config} */
const config = {
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testEnvironment: "jest-environment-jsdom",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testPathIgnorePatterns: ["<rootDir>/node_modules/", "<rootDir>/.next/"],
  collectCoverageFrom: ["src/**/*.{ts,tsx}", "!src/**/*.d.ts"],
  coverageThreshold: {
    global: {
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80,
    },
    "./src/server/services/gift.service.ts": {
      lines: 90,
      functions: 90,
      branches: 90,
      statements: 90,
    },
    "./src/server/services/claim.service.ts": {
      lines: 90,
      functions: 90,
      branches: 90,
      statements: 90,
    },
    "./src/server/services/fraud.service.ts": {
      lines: 90,
      functions: 90,
      branches: 90,
      statements: 90,
    },
    "./src/server/services/gift-state-machine.ts": {
      lines: 90,
      functions: 90,
      branches: 90,
      statements: 90,
    },
  },
};

module.exports = createJestConfig(config);
