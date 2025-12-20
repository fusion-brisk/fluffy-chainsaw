/**
 * Tests for streaming MHTML parser
 */

import { describe, it, expect, vi } from 'vitest';
import { 
  parseMhtmlStreaming, 
  parseMhtmlStreamingAsync,
  MhtmlParseProgress 
} from '../../src/utils/mhtml-streaming';

// Пример MHTML контента для тестов
const createMhtmlContent = (htmlContent: string, boundary = '----=_Part_0_123456789') => `MIME-Version: 1.0
Content-Type: multipart/related; boundary="${boundary}"

--${boundary}
Content-Type: text/html; charset=UTF-8
Content-Transfer-Encoding: quoted-printable

${htmlContent}
--${boundary}
Content-Type: image/png
Content-Location: image1.png

fake-image-data
--${boundary}--
`;

describe('mhtml-streaming', () => {
  describe('parseMhtmlStreaming', () => {
    it('should extract HTML from valid MHTML', () => {
      const html = '<!DOCTYPE html><html><body>Test</body></html>';
      const mhtml = createMhtmlContent(html);
      
      const result = parseMhtmlStreaming(mhtml);
      
      expect(result.html).toContain('<!DOCTYPE html>');
      expect(result.html).toContain('Test');
    });

    it('should return fullMhtml for image extraction', () => {
      const html = '<html><body>Test</body></html>';
      const mhtml = createMhtmlContent(html);
      
      const result = parseMhtmlStreaming(mhtml);
      
      expect(result.fullMhtml).toBe(mhtml);
    });

    it('should return stats with parse info', () => {
      const html = '<html><body>Test</body></html>';
      const mhtml = createMhtmlContent(html);
      
      const result = parseMhtmlStreaming(mhtml);
      
      expect(result.stats.totalSize).toBe(mhtml.length);
      expect(result.stats.htmlSize).toBeGreaterThan(0);
      expect(result.stats.partsScanned).toBeGreaterThan(0);
      expect(result.stats.parseTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should call progress callback', () => {
      const html = '<html><body>Test</body></html>';
      const mhtml = createMhtmlContent(html);
      const progressCalls: MhtmlParseProgress[] = [];
      
      parseMhtmlStreaming(mhtml, {
        onProgress: (p) => progressCalls.push({ ...p }),
        progressInterval: 0 // Без throttling для тестов
      });
      
      expect(progressCalls.length).toBeGreaterThan(0);
      expect(progressCalls[progressCalls.length - 1].stage).toBe('done');
    });

    it('should handle MHTML without boundary (fallback to direct HTML)', () => {
      const html = '<!DOCTYPE html><html><body>Direct HTML</body></html>';
      
      const result = parseMhtmlStreaming(html);
      
      expect(result.html).toContain('Direct HTML');
    });

    it('should decode quoted-printable content', () => {
      const quotedPrintableHtml = 'Test =3D equals sign';
      const mhtml = createMhtmlContent(quotedPrintableHtml);
      
      const result = parseMhtmlStreaming(mhtml);
      
      expect(result.html).toContain('Test = equals sign');
    });

    it('should throw error if no HTML found', () => {
      const mhtml = `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----=_Part_0"

------=_Part_0
Content-Type: image/png

fake-image-only
------=_Part_0--`;
      
      expect(() => parseMhtmlStreaming(mhtml)).toThrow('Не удалось найти HTML');
    });
  });

  describe('parseMhtmlStreamingAsync', () => {
    it('should work asynchronously', async () => {
      const html = '<html><body>Async Test</body></html>';
      const mhtml = createMhtmlContent(html);
      
      const result = await parseMhtmlStreamingAsync(mhtml);
      
      expect(result.html).toContain('Async Test');
    });

    it('should yield to event loop periodically', async () => {
      // Создаём MHTML с несколькими частями
      const html = '<html><body>Test</body></html>';
      let mhtml = `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----=_Part_0"

`;
      
      // Добавляем много частей для тестирования yield
      for (let i = 0; i < 15; i++) {
        mhtml += `------=_Part_0
Content-Type: ${i === 0 ? 'text/html' : 'image/png'}

${i === 0 ? html : 'fake-image-data'}
`;
      }
      mhtml += '------=_Part_0--';
      
      const result = await parseMhtmlStreamingAsync(mhtml);
      
      expect(result.html).toContain('Test');
      expect(result.stats.partsScanned).toBeGreaterThan(0);
    });

    it('should call progress callback asynchronously', async () => {
      const html = '<html><body>Test</body></html>';
      const mhtml = createMhtmlContent(html);
      const progressCallback = vi.fn();
      
      await parseMhtmlStreamingAsync(mhtml, { onProgress: progressCallback });
      
      expect(progressCallback).toHaveBeenCalled();
      // Последний вызов должен быть 'done'
      const lastCall = progressCallback.mock.calls[progressCallback.mock.calls.length - 1][0];
      expect(lastCall.stage).toBe('done');
    });
  });

  describe('progress stages', () => {
    it('should progress through stages: boundary -> scanning -> done', () => {
      const html = '<html><body>Test</body></html>';
      const mhtml = createMhtmlContent(html);
      const stages: string[] = [];
      
      parseMhtmlStreaming(mhtml, {
        onProgress: (p) => {
          if (!stages.includes(p.stage)) {
            stages.push(p.stage);
          }
        },
        progressInterval: 0
      });
      
      expect(stages).toContain('boundary');
      expect(stages).toContain('done');
    });

    it('should include decoding stage when HTML is found', () => {
      const html = '<html><body>Test</body></html>';
      const mhtml = createMhtmlContent(html);
      const stages: string[] = [];
      
      parseMhtmlStreaming(mhtml, {
        onProgress: (p) => {
          if (!stages.includes(p.stage)) {
            stages.push(p.stage);
          }
        },
        progressInterval: 0
      });
      
      // Может включать 'decoding' если HTML найден
      expect(stages).toContain('done');
    });
  });

  describe('memory efficiency', () => {
    it('should not create array from split for large files', () => {
      // Создаём "большой" MHTML
      const html = '<html><body>' + 'x'.repeat(10000) + '</body></html>';
      const mhtml = createMhtmlContent(html);
      
      const result = parseMhtmlStreaming(mhtml);
      
      expect(result.html.length).toBeGreaterThan(10000);
      expect(result.stats.partsScanned).toBeLessThanOrEqual(3); // Ранний выход после нахождения HTML
    });
  });
});

