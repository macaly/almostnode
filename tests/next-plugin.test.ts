import { describe, it, expect } from 'vitest';
import { getServiceWorkerContent, getServiceWorkerPath, getWorkerContent, getWorkerPath } from '../src/next-plugin';
import * as fs from 'fs';

describe('next-plugin', () => {
  describe('getServiceWorkerPath', () => {
    it('should return a valid file path', () => {
      const swPath = getServiceWorkerPath();
      expect(typeof swPath).toBe('string');
      expect(swPath).toContain('__sw__.js');
    });

    it('should return a path that exists', () => {
      const swPath = getServiceWorkerPath();
      expect(fs.existsSync(swPath)).toBe(true);
    });
  });

  describe('getServiceWorkerContent', () => {
    it('should return service worker content as a string', () => {
      const content = getServiceWorkerContent();
      expect(typeof content).toBe('string');
      expect(content.length).toBeGreaterThan(0);
    });

    it('should return valid JavaScript content', () => {
      const content = getServiceWorkerContent();
      // Service worker should contain typical SW code patterns
      expect(content).toContain('self');
    });

    it('should match the file content from getServiceWorkerPath', () => {
      const content = getServiceWorkerContent();
      const swPath = getServiceWorkerPath();
      const fileContent = fs.readFileSync(swPath, 'utf-8');
      expect(content).toBe(fileContent);
    });
  });

  describe('getWorkerPath', () => {
    it('should return a valid file path', () => {
      const workerPath = getWorkerPath();
      expect(typeof workerPath).toBe('string');
      expect(workerPath).toContain('runtime-worker.js');
    });

    it('should return a path that exists', () => {
      const workerPath = getWorkerPath();
      expect(fs.existsSync(workerPath)).toBe(true);
    });
  });

  describe('getWorkerContent', () => {
    it('should return worker content as a string', () => {
      const content = getWorkerContent();
      expect(typeof content).toBe('string');
      expect(content.length).toBeGreaterThan(0);
    });

    it('should match the file content from getWorkerPath', () => {
      const content = getWorkerContent();
      const workerPath = getWorkerPath();
      const fileContent = fs.readFileSync(workerPath, 'utf-8');
      expect(content).toBe(fileContent);
    });
  });
});
