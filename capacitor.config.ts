import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tbiz.app',
  appName: 'tbiz',
  webDir: 'dist',
  plugins: {
    SocialLogin: {
      providers: {
        google: true
      }
    }
  }
};

export default config;
