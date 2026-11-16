import type { TestProject } from 'vitest/node';
import { startRealBackend } from './real-backend';

declare module 'vitest' {
  export interface ProvidedContext {
    apiBaseUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const backend = await startRealBackend({ purpose: 'contract', port: 3610 });
  project.provide('apiBaseUrl', backend.apiBaseUrl);
  return () => backend.stop();
}
