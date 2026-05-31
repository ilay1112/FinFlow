import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.finflow.app',
  appName: 'FinFlow',
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
