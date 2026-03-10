import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/custom/Navbar', () => ({
  Navbar: () => <div>navbar</div>,
}));
vi.mock('@/sections/HeroSection', () => ({
  HeroSection: () => <div>hero</div>,
}));
vi.mock('@/sections/TournamentSection', () => ({
  TournamentSection: () => <div>tournaments</div>,
}));
vi.mock('@/sections/UpcomingSection', () => ({
  UpcomingSection: () => <div>upcoming</div>,
}));
vi.mock('@/sections/NewsSection', () => ({
  NewsSection: () => <div>news</div>,
}));
vi.mock('@/sections/CommunitySection', () => ({
  CommunitySection: () => <div>community</div>,
}));
vi.mock('@/sections/Footer', () => ({
  Footer: () => <div>footer</div>,
}));

import App from '@/App';

describe('App shell', () => {
  it('renders sections without issuing top-level data fetches', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(screen.getByText('hero')).toBeInTheDocument();
    expect(screen.getByText('tournaments')).toBeInTheDocument();
    expect(screen.getByText('upcoming')).toBeInTheDocument();
    expect(screen.getByText('news')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
