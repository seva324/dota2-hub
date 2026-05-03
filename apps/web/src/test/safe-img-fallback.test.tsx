import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SafeImg } from '@/components/custom/SafeImg';

describe('SafeImg', () => {
  it('renders img when src is provided', () => {
    render(
      <SafeImg
        src="/test.png"
        alt="Test"
        className="test-class"
        fallback={<div data-testid="fallback">FB</div>}
      />
    );

    const img = screen.getByRole('img', { name: 'Test' });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/test.png');
    expect(img).toHaveClass('test-class');
    expect(screen.queryByTestId('fallback')).not.toBeInTheDocument();
  });

  it('renders fallback when src is null', () => {
    render(
      <SafeImg
        src={null}
        alt="Test"
        fallback={<div data-testid="fallback">FB</div>}
      />
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByTestId('fallback')).toBeInTheDocument();
    expect(screen.getByText('FB')).toBeInTheDocument();
  });

  it('renders fallback when src is undefined', () => {
    render(
      <SafeImg
        src={undefined}
        alt="Test"
        fallback={<div data-testid="fallback">FB</div>}
      />
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByTestId('fallback')).toBeInTheDocument();
  });

  it('swaps to fallback on image load error', () => {
    render(
      <SafeImg
        src="/broken-image.png"
        alt="Broken"
        className="img-to-break"
        fallback={<div data-testid="fallback">Fallback Content</div>}
      />
    );

    const img = screen.getByRole('img', { name: 'Broken' });
    expect(img).toBeInTheDocument();

    fireEvent.error(img);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByTestId('fallback')).toBeInTheDocument();
    expect(screen.getByText('Fallback Content')).toBeInTheDocument();
  });

  it('tries the image again when src changes after an error', () => {
    const { rerender } = render(
      <SafeImg
        src="/broken-image.png"
        alt="Logo"
        fallback={<div data-testid="fallback">Fallback</div>}
      />
    );

    fireEvent.error(screen.getByRole('img', { name: 'Logo' }));
    expect(screen.getByTestId('fallback')).toBeInTheDocument();

    rerender(
      <SafeImg
        src="/next-image.png"
        alt="Logo"
        fallback={<div data-testid="fallback">Fallback</div>}
      />
    );

    expect(screen.getByRole('img', { name: 'Logo' })).toHaveAttribute('src', '/next-image.png');
    expect(screen.queryByTestId('fallback')).not.toBeInTheDocument();
  });

  it('renders initials fallback for team logo pattern', () => {
    render(
      <SafeImg
        src={null}
        alt="Xtreme Gaming"
        className="size-11 object-contain"
        fallback={<div className="size-11 rounded-full bg-slate-800" data-testid="initials-fallback" />}
      />
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByTestId('initials-fallback')).toHaveClass('rounded-full');
    expect(screen.getByTestId('initials-fallback')).toHaveClass('bg-slate-800');
  });

  it('renders colored placeholder fallback for hero cells', () => {
    render(
      <SafeImg
        src={null}
        alt="Anti-Mage"
        className="h-full w-full object-cover"
        fallback={
          <div className="h-full w-full flex items-center justify-center" style={{ background: 'hsl(67, 35%, 18%)' }}>
            <span className="text-[9px] text-slate-300">Anti-Mage</span>
          </div>
        }
      />
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Anti-Mage')).toBeInTheDocument();
  });

  it('renders colored placeholder fallback for item cells', () => {
    render(
      <SafeImg
        src={null}
        alt="Boots of Speed"
        className="w-full h-full object-contain"
        fallback={
          <div className="w-full h-full flex items-center justify-center" style={{ background: 'hsl(200, 30%, 22%)' }}>
            <span className="text-[7px] text-slate-400">BOS</span>
          </div>
        }
      />
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('BOS')).toBeInTheDocument();
  });
});
