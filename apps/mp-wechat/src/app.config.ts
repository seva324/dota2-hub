export default defineAppConfig({
  pages: [
    'pages/home/index',
    'pages/upcoming/index',
    'pages/tournaments/index',
    'pages/settings/index',
  ],
  subpackages: [
    {
      root: 'packages/tournament',
      pages: ['pages/detail/index'],
    },
    {
      root: 'packages/team',
      pages: ['pages/detail/index'],
    },
    {
      root: 'packages/match',
      pages: ['pages/detail/index'],
    },
  ],
  window: {
    navigationBarTitleText: '\u5200\u5200\u5bf9\u5c40\u96f7\u8fbe\u7ad9',
    navigationBarBackgroundColor: '#0f172a',
    navigationBarTextStyle: 'white',
    backgroundColor: '#020617',
    backgroundTextStyle: 'light',
  },
  tabBar: {
    color: '#94a3b8',
    selectedColor: '#f97316',
    backgroundColor: '#0f172a',
    borderStyle: 'white',
    list: [
      {
        pagePath: 'pages/home/index',
        text: '\u9996\u9875',
      },
      {
        pagePath: 'pages/upcoming/index',
        text: '\u9884\u544a',
      },
      {
        pagePath: 'pages/tournaments/index',
        text: '\u8d5b\u4e8b',
      },
      {
        pagePath: 'pages/settings/index',
        text: '\u5173\u4e8e',
      },
    ],
  },
});
