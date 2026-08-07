import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TournamentNameLink } from '@/components/custom/TournamentNameLink';

describe('TournamentNameLink', () => {
  it('renders a link to the internal event detail page when slug is present', () => {
    render(<TournamentNameLink slug="ti-2026" name="The International 2026" />);
    const link = screen.getByRole('link', { name: 'The International 2026' });
    expect(link.getAttribute('href')).toBe('#/event/ti-2026');
  });

  it('falls back to a plain span when no slug is available', () => {
    render(<TournamentNameLink slug={null} name="Some Event" />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Some Event')).toBeTruthy();
  });

  it('does not trigger the enclosing card click when clicked', () => {
    const onCardClick = vi.fn();
    render(
      <button type="button" onClick={onCardClick}>
        <TournamentNameLink slug="ev" name="Event" />
      </button>,
    );
    fireEvent.click(screen.getByRole('link', { name: 'Event' }));
    expect(onCardClick).not.toHaveBeenCalled();
  });
});
