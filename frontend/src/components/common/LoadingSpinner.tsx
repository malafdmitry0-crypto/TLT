export default function LoadingSpinner() {
  return (
    <div
      aria-busy="true"
      style={{
        display: 'flex',
        justifyContent: 'center',
        padding: 24,
        color: '#5f6b7a',
        fontSize: 14,
      }}
    >
      Загрузка...
    </div>
  );
}
