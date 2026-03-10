import { defineConfig } from '@tarojs/cli';
import devConfig from './dev';
import prodConfig from './prod';

export default defineConfig(async (merge) => {
  const baseConfig = {
    projectName: 'dota2-hub-wechat',
    date: '2026-03-10',
    sourceRoot: 'src',
    outputRoot: 'dist',
    designWidth: 375,
    deviceRatio: {
      375: 2,
      750: 1,
    },
    framework: 'react',
    compiler: 'webpack5',
    plugins: ['@tarojs/plugin-framework-react'],
    defineConstants: {},
    copy: {
      patterns: [],
      options: {},
    },
    mini: {
      webpackChain(chain) {
        chain.merge({
          resolve: {
            alias: {
              '@': require('path').resolve(__dirname, '..', 'src'),
            },
          },
        });
      },
      postcss: {
        pxtransform: {
          enable: true,
          config: {},
        },
        url: {
          enable: true,
          config: {
            limit: 1024,
          },
        },
        cssModules: {
          enable: false,
          config: {
            namingPattern: 'global',
          },
        },
      },
    },
  };

  return merge({}, baseConfig, process.env.NODE_ENV === 'development' ? devConfig : prodConfig);
});
