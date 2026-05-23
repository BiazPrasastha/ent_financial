import type { Config } from 'jest';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.test or .env
const envPath = path.resolve(__dirname, '.env.test');
dotenv.config({ path: envPath });
dotenv.config(); // fallback to .env

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: './tsconfig.json' }],
  },
};
export default config;
