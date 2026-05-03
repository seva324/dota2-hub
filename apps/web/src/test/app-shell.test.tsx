import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/sections/HomeDashboard', () => ({
  HomeDashboard: () => <div>home dashboard</div>,
}));
vi.mock('@/sections/Footer', () => ({
  Footer: () => <div>footer</div>,
}));

import App from '@/App';

describe('App shell', () => {
  it('renders shell with prototype chrome: nav, mobile nav, login button, no top-level fetches', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(screen.getByText('DotaHub')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '主导航' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '移动端主导航' })).toBeInTheDocument();
    expect(screen.getByText('home dashboard')).toBeInTheDocument();
    expect(screen.getByText('我的')).toBeInTheDocument();
    expect(screen.getByText('登录 / 注册')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
