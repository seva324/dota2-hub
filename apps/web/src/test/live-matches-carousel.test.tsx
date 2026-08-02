import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LiveMatchesCarousel } from '@/components/custom/LiveMatchesCarousel';

// embla-carousel-react 在 jsdom 中无法正确初始化布局，mock 掉 Carousel 相关组件
vi.mock('@/components/ui/carousel', async () => {
  const React = await import('react');
  return {
    Carousel: ({ children, setApi }: any) => {
      const apiRef = React.useRef<any>(null);
      React.useEffect(() => {
        if (!apiRef.current) {
          apiRef.current = { scrollSnapList: () => [0], selectedScrollSnap: () => 0, on: () => {}, off: () => {}, scrollTo: () => {}, scrollNext: () => {} };
          setApi?.(apiRef.current);
        }
      }, []);
      return React.createElement('div', { 'data-testid': 'carousel' }, children);
    },
    CarouselContent: ({ children }: any) => React.createElement('div', null, children),
    CarouselItem: ({ children }: any) => React.createElement('div', null, children),
  };
});

const LIVE = {
  source: 'mock',
  leagueName: 'DreamLeague S24',
  stage: 'Group Stage',
  bestOf: 3,
  seriesScore: '1:0',
  live: true,
  teams: [
    { side: 'team1' as const, name: 'Team Spirit', logo: null },
    { side: 'team2' as const, name: 'GG', logo: null },
  ],
  maps: [
    { matchId: 90001, label: 'Map 1', status: 'live' as const, team1Score: 18, team2Score: 9, gameTime: 1427 },
  ],
  liveMap: { matchId: 90001, label: 'Map 1', status: 'live' as const, team1Score: 18, team2Score: 9, team1NetWorthLead: 5200, gameTime: 1427 },
};

describe('LiveMatchesCarousel', () => {
  it('renders all live matches as cards', () => {
    render(<LiveMatchesCarousel liveHeroes={[LIVE as any, { ...LIVE, leagueName: 'PGL S7', teams: [{ side: 'team1', name: 'Aurora', logo: null }, { side: 'team2', name: 'Heroic', logo: null }] } as any]} />);
    expect(screen.getAllByText('LIVE').length).toBe(2);
    expect(screen.getByText((content) => content.includes('DreamLeague S24'))).toBeInTheDocument();
    expect(screen.getByText('Team Spirit')).toBeInTheDocument();
    expect(screen.getAllByText('GG').length).toBeGreaterThan(0);
    expect(screen.getAllByText((content) => content.includes('Series 1 : 0')).length).toBe(2);
  });

  it('renders nothing when no live matches', () => {
    render(<LiveMatchesCarousel liveHeroes={[]} />);
    expect(screen.queryByText('LIVE')).not.toBeInTheDocument();
  });
});
