import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.corpv3.restaurantpos",
  appName: "Restaurant POS",
  webDir: "dist",
  server: {
    androidScheme: "https",
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
