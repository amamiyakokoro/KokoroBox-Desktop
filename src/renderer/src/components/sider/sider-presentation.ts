export const isSettingsFocusRoute = (pathname: string): boolean =>
  pathname === '/settings' || pathname.startsWith('/settings/')

export const resolveSiderPresentationWidth = (
  pathname: string,
  userWidth: number,
  narrowWidth: number
): number => (isSettingsFocusRoute(pathname) ? narrowWidth : userWidth)
