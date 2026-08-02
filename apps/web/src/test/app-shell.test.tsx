import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/sections/HomeDashboard', () => ({
  HomeDashboard: () => (
    <div>home dashboard</div>
  ),
}));
vi.mock('@/sections/Footer', () => ({
  Footer: () => <div>footer</div>,
}));
vi.mock('@/pages/TopLevelPlaceholder', () => ({
  TopLevelPlaceholder: ({ page, onBack }: { page: string; onBack: () => void }) => (
    <div>
      placeholder: {page}
      <button type="button" onClick={onBack}>返回首页</button>
    </div>
  ),
}));

import App from '@/App';

describe('App shell', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  it('renders shell with prototype chrome: nav, mobile nav, login button, no top-level fetches', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(screen.getByText('DotaHub')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '主导航' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '移动端主导航' })).toBeInTheDocument();
    expect(screen.getByText('home dashboard')).toBeInTheDocument();
    expect(screen.getAllByText('新闻').length).toBeGreaterThan(0);
    expect(screen.getAllByText('赛程').length).toBeGreaterThan(0);
    expect(screen.getByText('登录 / 注册')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('navigates to a placeholder page when a top-level nav item is clicked', () => {
    vi.stubGlobal('fetch', vi.fn());
    render(<App />);

    const tournamentsBtn = screen.getAllByRole('button', { name: '赛事' })[0];
    fireEvent.click(tournamentsBtn);

    expect(screen.getByText('placeholder: tournaments')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/tournaments');
  });

  it('returns home when the placeholder back button is clicked', () => {
    vi.stubGlobal('fetch', vi.fn());
    window.location.hash = '#/players';
    render(<App />);

    expect(screen.getByText('placeholder: players')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /返回首页/ }));

    expect(screen.getByText('home dashboard')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/');
  });
});
