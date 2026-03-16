package com.corpv3.restaurantpos;

import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.FileOutputStream;

/**
 * SerialPrinterPlugin — writes ESC/POS bytes to an Android serial device file.
 *
 * Most Android POS terminals (including H10-3) expose the built-in thermal
 * printer as a serial character device (e.g. /dev/ttyS1). Writing ESC/POS
 * bytes directly to that file triggers printing — no baud-rate setup required
 * because the device OS configures it at boot.
 *
 * Called from JS via: Capacitor.Plugins.SerialPrinter.print({ path, data })
 */
@CapacitorPlugin(name = "SerialPrinter")
public class SerialPrinterPlugin extends Plugin {

    /**
     * print({ path: string, data: string })
     *   path — serial device path, default "/dev/ttyS1"
     *   data — base64-encoded ESC/POS byte array
     */
    @PluginMethod
    public void print(PluginCall call) {
        String path = call.getString("path", "/dev/ttyS1");
        String data = call.getString("data");

        if (data == null || data.isEmpty()) {
            call.reject("No data provided");
            return;
        }

        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            FileOutputStream fos = new FileOutputStream(path);
            fos.write(bytes);
            fos.flush();
            fos.close();
            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Serial print failed: " + e.getMessage());
        }
    }

    /**
     * listPaths() — returns common serial device paths so the UI can let
     * the user pick the correct one if /dev/ttyS1 doesn't work.
     */
    @PluginMethod
    public void listPaths(PluginCall call) {
        String[] candidates = {
            "/dev/ttyS0", "/dev/ttyS1", "/dev/ttyS2",
            "/dev/ttyUSB0", "/dev/ttyHSL0", "/dev/ttyHS0"
        };
        com.getcapacitor.JSArray available = new com.getcapacitor.JSArray();
        for (String p : candidates) {
            java.io.File f = new java.io.File(p);
            if (f.exists()) available.put(p);
        }
        JSObject result = new JSObject();
        result.put("paths", available);
        call.resolve(result);
    }
}
