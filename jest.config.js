/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  projects: [
    {
      //displayName: 'backend',
      //testEnvironment: 'node',
      //testMatch: ['<rootDir>/server/src/**/*.test.ts'],
      //setupFiles: ['<rootDir>/server/src/test/setup.ts']
    },
    {
      displayName: 'frontend',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/src/**/*.test.tsx', '<rootDir>/src/**/*.test.ts'],
      moduleNameMapper: {
        '\\.css$': 'identity-obj-proxy'
      },
      setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts']
    }
  ],
  verbose: true
};
