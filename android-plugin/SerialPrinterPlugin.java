package com.corpv3.restaurantpos;

import android.util.Base64;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;

/**
 * SerialPrinterPlugin — writes ESC/POS bytes to an Android serial device file.
 *
 * Citaq H10-3 POS terminal exposes its built-in 75mm thermal printer as a
 * serial character device. Tries the configured path first, then falls back
 * through common Citaq/Android serial device paths automatically.
 *
 * Called from JS via: Capacitor.Plugins.SerialPrinter.print({ path, data })
 */
@CapacitorPlugin(name = "SerialPrinter")
public class SerialPrinterPlugin extends Plugin {

    private static final String TAG = "SerialPrinterPlugin";

    // Ordered by likelihood for Citaq H10-3
    private static final String[] AUTO_PATHS = {
        "/dev/ttyS1", "/dev/ttyS2", "/dev/ttyS0",
        "/dev/ttyHSL0", "/dev/ttyHS0", "/dev/ttyUSB0"
    };

    /**
     * print({ path: string, data: string })
     *   path — serial device path (optional — auto-tries if omitted or fails)
     *   data — base64-encoded ESC/POS byte array
     */
    @PluginMethod
    public void print(PluginCall call) {
        String preferredPath = call.getString("path", "");
        String data = call.getString("data");

        if (data == null || data.isEmpty()) {
            call.reject("No data provided");
            return;
        }

        byte[] bytes;
        try {
            bytes = Base64.decode(data, Base64.DEFAULT);
        } catch (Exception e) {
            call.reject("Base64 decode failed: " + e.getMessage());
            return;
        }

        // Build path list: preferred first, then auto-detect fallbacks
        String[] paths;
        if (preferredPath != null && !preferredPath.isEmpty()) {
            paths = new String[AUTO_PATHS.length + 1];
            paths[0] = preferredPath;
            System.arraycopy(AUTO_PATHS, 0, paths, 1, AUTO_PATHS.length);
        } else {
            paths = AUTO_PATHS;
        }

        StringBuilder errors = new StringBuilder();
        for (String path : paths) {
            File f = new File(path);
            if (!f.exists()) {
                errors.append(path).append(": not found; ");
                continue;
            }
            try {
                FileOutputStream fos = new FileOutputStream(path);
                fos.write(bytes);
                fos.flush();
                fos.close();
                Log.i(TAG, "Printed " + bytes.length + " bytes to " + path);
                JSObject result = new JSObject();
                result.put("success", true);
                result.put("path", path);
                call.resolve(result);
                return;
            } catch (Exception e) {
                String msg = path + ": " + e.getMessage();
                Log.w(TAG, "Print attempt failed: " + msg);
                errors.append(msg).append("; ");
            }
        }

        call.reject("All print paths failed: " + errors.toString());
    }

    /**
     * listPaths() — returns which serial device files exist on this device.
     * UI uses this to let user pick or confirm the correct port.
     */
    @PluginMethod
    public void listPaths(PluginCall call) {
        com.getcapacitor.JSArray available = new com.getcapacitor.JSArray();
        for (String p : AUTO_PATHS) {
            if (new File(p).exists()) available.put(p);
        }
        JSObject result = new JSObject();
        result.put("paths", available);
        call.resolve(result);
    }
}
