export const isSettingsFocusRoute = (pathname: string): boolean =>
  pathname === '/settings' || pathname.startsWith('/settings/')
