import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/sections/HomeDashboard', () => ({
  HomeDashboard: (props: { route: { page: string; overlay: { type: string; matchId?: string; teamName?: string; accountId?: string } | null } }) => {
    const o = props.route.overlay;
    if (o?.type === 'match') return <div>deep match: {o.matchId}</div>;
    if (o?.type === 'player') return <div>deep player: {o.accountId}</div>;
    return <div>deep home</div>;
  },
}));
vi.mock('@/sections/Footer', () => ({
  Footer: () => <div>footer</div>,
}));
vi.mock('@/pages/SeriesMatchPage', () => ({
  SeriesMatchPage: (props: { matchId: string; slug?: string }) => <div>series match: {props.matchId}{props.slug ? ` (${props.slug})` : ''}</div>,
}));
vi.mock('@/pages/TeamDetailPage', () => ({
  TeamDetailPage: (props: { teamName: string; teamId?: string }) => (
    <div>team detail: {props.teamName}{props.teamId ? ` (${props.teamId})` : ''}</div>
  ),
}));

import App from '@/App';

function setHash(hash: string) {
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

describe('App deep links', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    window.location.hash = '';
  });

  it('opens a match deep link as the standalone match page', () => {
    setHash('#/match/7777');
    render(<App />);
    expect(screen.getByText('series match: 7777')).toBeInTheDocument();
  });

  it('opens a home match overlay from a home deep link', () => {
    setHash('#/home/match/90001');
    render(<App />);
    expect(screen.getByText('deep match: 90001')).toBeInTheDocument();
  });

  it('opens a team deep link as the standalone team detail page', () => {
    setHash('#/team/Team%20Spirit');
    render(<App />);
    expect(screen.getByText('team detail: Team Spirit')).toBeInTheDocument();
  });

  it('opens a team deep link with teamId query', () => {
    setHash('#/team/Team%20Spirit?teamId=2163');
    render(<App />);
    expect(screen.getByText('team detail: Team Spirit (2163)')).toBeInTheDocument();
  });

  it('opens a player deep link on first load', () => {
    setHash('#/player/898754153');
    render(<App />);
    expect(screen.getByText('deep player: 898754153')).toBeInTheDocument();
  });

  it('closes the overlay back to home when the hash returns to #/', async () => {
    setHash('#/home/match/90001');
    render(<App />);
    expect(screen.getByText('deep match: 90001')).toBeInTheDocument();

    setHash('#/');
    await waitFor(() => {
      expect(screen.getByText('deep home')).toBeInTheDocument();
    });
  });
});
