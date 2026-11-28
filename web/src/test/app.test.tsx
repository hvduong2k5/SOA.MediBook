import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '@/app/App';

describe('App setup core smoke', () => {
  it('renders HomePage and loads specialties from MSW mock', async () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'MediBook' })).toBeInTheDocument();
    expect(await screen.findByText('Nội tổng quát')).toBeInTheDocument();
    expect(screen.getByText('Tim mạch')).toBeInTheDocument();
  });
});
