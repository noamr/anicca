module.exports = {
  testPathIgnorePatterns: [
    "/node_modules/",
    "cypress"
  ],
  preset: 'ts-jest',
  "transform": {
    "^.+\\.(ts|tsx)$": "ts-jest",
    "^.+\\.ne$": "./src/test-support/nearley-transform-jest"
  },
  testEnvironment: 'node'
};