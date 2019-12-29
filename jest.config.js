module.exports = {
  testPathIgnorePatterns: [
    "/node_modules/",
    "cypress"
  ],
  preset: 'ts-jest',
  transform: {
    "^.+\\.ne$": "./src/test-support/nearley-transform-jest"
  },
  testEnvironment: 'node'
};