import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.corpv3.restaurantpos",
  appName: "Restaurant POS",
  webDir: "dist",
  server: {
    androidScheme: "https",
    // Allow the WebView to make network requests to external HTTPS servers
    cleartext: false,
    allowNavigation: ["testenv.corpv3.com"],
  },
  android: {
    buildOptions: {
      keystorePath: "release.keystore",
      keystoreAlias: "pos",
    },
  },
  plugins: {
    BluetoothSerial: {},
  },
};

export default config;
