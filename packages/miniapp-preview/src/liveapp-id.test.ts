import { describe, expect, it } from 'vitest';
import { getStreamedDirectoryName, sanitizeTitleSegment } from './liveapp-id';

describe('liveapp id helpers', () => {
  it('sanitizes title segments consistently', () => {
    expect(sanitizeTitleSegment('  Revenue Report: Q1/Q2  ')).toBe('revenue-report-q1q2');
  });

  it('builds streamed directory names from title and stream id', () => {
    expect(getStreamedDirectoryName('stream-42', '  Revenue Report: Q1/Q2  ')).toBe(
      'revenue-report-q1q2_stream-42',
    );
  });
});
