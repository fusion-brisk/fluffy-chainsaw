import { describe, it, expect } from 'vitest';
import {
  assignMasonryPositions,
  MasonryItem,
  MasonryConfig,
} from '../../src/sandbox/feed-page-builder/feed-masonry-layout';

const defaultConfig: MasonryConfig = {
  columns: 3,
  columnWidth: 250,
  gap: 16,
};

const sampleItems: MasonryItem[] = [
  { id: 'a', width: 250, height: 300 },
  { id: 'b', width: 250, height: 200 },
  { id: 'c', width: 250, height: 350 },
  { id: 'd', width: 250, height: 250 },
  { id: 'e', width: 250, height: 180 },
  { id: 'f', width: 250, height: 280 },
];

describe('assignMasonryPositions', () => {
  it('assigns first N items to columns 0..N-1 in order', () => {
    const result = assignMasonryPositions(sampleItems, defaultConfig);
    const first3 = result.positions.slice(0, 3);

    expect(first3[0].column).toBe(0);
    expect(first3[1].column).toBe(1);
    expect(first3[2].column).toBe(2);

    // All start at y=0
    expect(first3[0].y).toBe(0);
    expect(first3[1].y).toBe(0);
    expect(first3[2].y).toBe(0);
  });

  it('places item N+1 in the shortest column', () => {
    // After first 3: col heights = [300, 200, 350] (before gap added for next)
    // With gap: [300+16=316, 200+16=216, 350+16=366]
    // Item d (height=250) goes to col 1 (shortest at 216)
    const result = assignMasonryPositions(sampleItems, defaultConfig);
    const itemD = result.positions.find((p) => p.id === 'd');

    expect(itemD).toBeDefined();
    expect(itemD!.column).toBe(1);
    expect(itemD!.y).toBe(200 + 16); // 216
  });

  it('calculates correct x positions as col * (columnWidth + gap)', () => {
    const result = assignMasonryPositions(sampleItems, defaultConfig);

    for (const pos of result.positions) {
      expect(pos.x).toBe(pos.column * (250 + 16));
    }
  });

  it('calculates correct y positions based on accumulated heights', () => {
    const result = assignMasonryPositions(sampleItems, defaultConfig);

    // Item a: col 0, y=0
    expect(result.positions[0]).toEqual({ id: 'a', x: 0, y: 0, column: 0 });

    // Item b: col 1, y=0
    expect(result.positions[1]).toEqual({ id: 'b', x: 266, y: 0, column: 1 });

    // Item c: col 2, y=0
    expect(result.positions[2]).toEqual({ id: 'c', x: 532, y: 0, column: 2 });

    // Item d: col 1 (shortest=216), y=216
    expect(result.positions[3]).toEqual({ id: 'd', x: 266, y: 216, column: 1 });

    // After d: col heights = [316, 216+250+16=482, 366]
    // Item e: col 0 (shortest=316), y=316
    expect(result.positions[4]).toEqual({ id: 'e', x: 0, y: 316, column: 0 });

    // After e: col heights = [316+180+16=512, 482, 366]
    // Item f: col 2 (shortest=366), y=366
    expect(result.positions[5]).toEqual({ id: 'f', x: 532, y: 366, column: 2 });
  });

  it('calculates total dimensions correctly', () => {
    const result = assignMasonryPositions(sampleItems, defaultConfig);

    // Total width = 3 * 250 + 2 * 16 = 782
    expect(result.totalWidth).toBe(782);

    // Final col heights (including trailing gap): [512, 482, 646]
    // But totalHeight = max - gap = 646 - 16 = 630
    // Col 2 final: 350+16+280+16 = 662, minus trailing gap = 646
    // Actually: col heights after all items:
    //   col 0: 0+300+16+180+16 = 512
    //   col 1: 0+200+16+250+16 = 482
    //   col 2: 0+350+16+280+16 = 662
    // totalHeight = max(512, 482, 662) - 16 = 646
    expect(result.totalHeight).toBe(646);
  });

  it('handles single column as a vertical stack', () => {
    const singleColConfig: MasonryConfig = { columns: 1, columnWidth: 300, gap: 10 };
    const items: MasonryItem[] = [
      { id: 'x', width: 300, height: 100 },
      { id: 'y', width: 300, height: 150 },
      { id: 'z', width: 300, height: 200 },
    ];

    const result = assignMasonryPositions(items, singleColConfig);

    expect(result.positions[0]).toEqual({ id: 'x', x: 0, y: 0, column: 0 });
    expect(result.positions[1]).toEqual({ id: 'y', x: 0, y: 110, column: 0 });
    expect(result.positions[2]).toEqual({ id: 'z', x: 0, y: 270, column: 0 });

    expect(result.totalWidth).toBe(300);
    // col height = 100+10+150+10+200+10 = 480, minus trailing gap = 470
    expect(result.totalHeight).toBe(470);
  });

  it('returns empty result with 0 height for empty input', () => {
    const result = assignMasonryPositions([], defaultConfig);

    expect(result.positions).toEqual([]);
    expect(result.totalHeight).toBe(0);
    expect(result.totalWidth).toBe(782);
  });
});
