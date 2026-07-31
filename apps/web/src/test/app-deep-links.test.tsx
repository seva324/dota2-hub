import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/sections/HomeDashboard', () => ({
  HomeDashboard: (props: { route: { page: string; overlay: { type: string; matchId?: string; teamName?: string; accountId?: string } | null } }) => {
    const o = props.route.overlay;
    if (o?.type === 'match') return <div>deep match: {o.matchId}</div>;
    if (o?.type === 'team') return <div>deep team: {o.teamName}</div>;
    if (o?.type === 'player') return <div>deep player: {o.accountId}</div>;
    return <div>deep home</div>;
  },
}));
vi.mock('@/sections/Footer', () => ({
  Footer: () => <div>footer</div>,
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

  it('opens a match deep link on first load', () => {
    setHash('#/match/7777');
    render(<App />);
    expect(screen.getByText('deep match: 7777')).toBeInTheDocument();
  });

  it('opens a team deep link on first load', () => {
    setHash('#/team/Team%20Spirit');
    render(<App />);
    expect(screen.getByText('deep team: Team Spirit')).toBeInTheDocument();
  });

  it('opens a player deep link on first load', () => {
    setHash('#/player/898754153');
    render(<App />);
    expect(screen.getByText('deep player: 898754153')).toBeInTheDocument();
  });

  it('closes the overlay back to home when the hash returns to #/', async () => {
    setHash('#/match/7777');
    render(<App />);
    expect(screen.getByText('deep match: 7777')).toBeInTheDocument();

    setHash('#/');
    await waitFor(() => {
      expect(screen.getByText('deep home')).toBeInTheDocument();
    });
  });
});
