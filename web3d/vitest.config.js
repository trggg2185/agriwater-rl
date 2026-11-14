import { defineConfig } from 'vitest/config';

/**
 * Test cho phần "utils" của web3d (thuần JS, không cần DOM/WebGL).
 * Giữ môi trường node để test chạy nhanh và không kéo three.js vào.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
});
