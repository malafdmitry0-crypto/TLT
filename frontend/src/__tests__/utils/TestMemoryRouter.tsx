import { MemoryRouter, type MemoryRouterProps } from 'react-router-dom';

const ROUTER_FUTURE_FLAGS: MemoryRouterProps['future'] = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
};

export default function TestMemoryRouter({ future, ...props }: MemoryRouterProps) {
  return (
    <MemoryRouter
      {...props}
      future={{ ...ROUTER_FUTURE_FLAGS, ...future }}
    />
  );
}
