// Preload route chunks to make tab navigation feel instant on mobile.
// These dynamic imports keep code-splitting intact (Vite will create separate chunks).

export const preloadRoute = (path) => {
  switch (path) {
    case '/':
      return import('@/pages/Feed')
    case '/explore':
      return import('@/pages/Explore')
    case '/messages':
      return import('@/pages/Messages')
    case '/work-requests':
      return import('@/pages/WorkRequests')
    case '/notifications':
      return import('@/pages/Notifications')
    case '/settings':
      return import('@/pages/Settings')
    case '/wallet':
      return import('@/pages/Wallet')
    default:
      return null
  }
}

export const preloadMainTabs = () =>
  Promise.allSettled([
    import('@/pages/Feed'),
    import('@/pages/Explore'),
    import('@/pages/Messages'),
    import('@/pages/WorkRequests'),
  ])
