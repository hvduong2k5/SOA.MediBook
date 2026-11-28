import { useQuery } from '@tanstack/react-query';
import { catalogApi } from '@/api/endpoints/catalog';
import { env } from '@/lib/env';

export function HomePage() {
  const specialtiesQuery = useQuery({
    queryKey: ['catalog', 'specialties'],
    queryFn: () => catalogApi.listSpecialties({ page: 1, pageSize: 10 }),
  });

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: 'var(--space-8) var(--space-4)' }}>
      <header style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ margin: 0, color: 'var(--color-navy)' }}>MediBook</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)' }}>
          Setup Core đã sẵn sàng · Nguồn dữ liệu:{' '}
          <strong>{env.VITE_USE_MOCK ? 'MSW Mock' : env.VITE_API_BASE_URL}</strong>
        </p>
      </header>

      <section
        aria-labelledby="specialties-heading"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-card)',
          padding: 'var(--space-6)',
        }}
      >
        <h2 id="specialties-heading" style={{ marginTop: 0 }}>
          Chuyên khoa
        </h2>

        {specialtiesQuery.isLoading && <p>Đang tải danh sách chuyên khoa...</p>}
        {specialtiesQuery.isError && <p role="alert">Không thể tải danh sách chuyên khoa.</p>}
        {specialtiesQuery.isSuccess && specialtiesQuery.data.items.length === 0 && (
          <p>Chưa có chuyên khoa nào.</p>
        )}
        {specialtiesQuery.isSuccess && specialtiesQuery.data.items.length > 0 && (
          <ul>
            {specialtiesQuery.data.items.map((item) => (
              <li key={item.id}>
                <strong>{item.name}</strong> — {item.description}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
