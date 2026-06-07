import { Skeleton, Space } from 'antd';

interface PageSkeletonProps {
  /** Число строк-плейсхолдеров под заголовком (имитация таблицы/контента). */
  rows?: number;
}

/**
 * Скелетон уровня страницы — заглушка под Suspense-fallback ленивых маршрутов
 * и под первичную загрузку тяжёлого контента. В отличие от центрированного
 * спиннера держит близкую к реальной высоту → меньше layout shift (CLS) и
 * лучше воспринимаемая скорость.
 */
export default function PageSkeleton({ rows = 6 }: PageSkeletonProps) {
  return (
    <div aria-busy="true" style={{ padding: 24 }}>
      <Skeleton.Input active size="large" style={{ width: 280, marginBottom: 20 }} />
      <Space direction="vertical" size={14} style={{ display: 'flex' }}>
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton.Input key={i} active block size="default" />
        ))}
      </Space>
    </div>
  );
}
