package com.corpv3.restaurantpos;

import android.util.Log;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.LineNumberReader;

/**
 * LedPlugin — controls the status indicator LEDs on Citaq H10-3 (RK3368).
 *
 * GPIO paths (RK3368 chipset, confirmed from Citaq SDK LEDControl.java):
 *   Red  LED: /sys/class/gpio/gpio124/value
 *   Blue LED: /sys/class/gpio/gpio106/value
 *
 * Write "1" to turn on, "0" to turn off.
 *
 * Called from JS as:
 *   Capacitor.Plugins.Led.setLed({ red: true, blue: false })
 */
@CapacitorPlugin(name = "Led")
public class LedPlugin extends Plugin {
    private static final String TAG = "LedPlugin";

    // RK3368 (H10-3)
    private static final String RED_GPIO_3368  = "/sys/class/gpio/gpio124/value";
    private static final String BLUE_GPIO_3368 = "/sys/class/gpio/gpio106/value";
    // RK3188 fallback
    private static final String RED_GPIO_3188  = "/sys/class/gpio/gpio190/value";
    private static final String BLUE_GPIO_3188 = "/sys/class/gpio/gpio172/value";

    private static String cpuHardware = null;

    private static String getCpuHardware() {
        if (cpuHardware != null) return cpuHardware;
        try {
            Process p = Runtime.getRuntime().exec("cat /proc/cpuinfo");
            BufferedReader reader = new BufferedReader(new InputStreamReader(p.getInputStream()));
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.startsWith("Hardware")) {
                    int idx = line.indexOf(":");
                    if (idx >= 0) {
                        cpuHardware = line.substring(idx + 1).trim();
                        return cpuHardware;
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "getCpuHardware failed: " + e.getMessage());
        }
        cpuHardware = "";
        return cpuHardware;
    }

    @PluginMethod
    public void setLed(PluginCall call) {
        boolean red  = Boolean.TRUE.equals(call.getBoolean("red",  false));
        boolean blue = Boolean.TRUE.equals(call.getBoolean("blue", false));

        String hw = getCpuHardware();
        String redPath, bluePath;
        if (hw.contains("RK3188") || hw.contains("RK30BOARD")) {
            redPath  = RED_GPIO_3188;
            bluePath = BLUE_GPIO_3188;
        } else {
            // RK3368 (H10-3) and default
            redPath  = RED_GPIO_3368;
            bluePath = BLUE_GPIO_3368;
        }

        writeGpio(redPath,  red  ? "1" : "0");
        writeGpio(bluePath, blue ? "1" : "0");
        call.resolve();
    }

    private void writeGpio(String path, String value) {
        try {
            File f = new File(path);
            if (!f.exists()) {
                Log.w(TAG, "GPIO path not found: " + path);
                return;
            }
            FileOutputStream fos = new FileOutputStream(f);
            fos.write(value.getBytes());
            fos.flush();
            fos.close();
            Log.i(TAG, "GPIO " + path + " = " + value);
        } catch (Exception e) {
            Log.w(TAG, "GPIO write failed " + path + ": " + e.getMessage());
        }
    }
}
