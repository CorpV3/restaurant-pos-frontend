package com.corpv3.restaurantpos;

import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;
import java.io.FileOutputStream;

/**
 * PrinterJSInterface — exposes window.CitaqPrinter.print() directly to JavaScript
 * via Android WebView addJavascriptInterface().
 *
 * This bypasses Capacitor entirely and works on Android 4.x+.
 * Used as primary print path on Citaq H10-3 (serial printer on /dev/ttyS1).
 *
 * The serial port is pre-configured at boot by CITAQ Android distro:
 *   path: /dev/ttyS1, baud: 115200, flow control: enabled
 */
public class PrinterJSInterface {
    private static final String TAG = "CitaqPrinterJS";

    // Try paths in order — /dev/ttyS1 is the H10-3 internal printer
    private static final String[] PATHS = {
        "/dev/ttyS1", "/dev/ttyS2", "/dev/ttyS0",
        "/dev/ttyHSL0", "/dev/ttyHS0", "/dev/ttyUSB0"
    };

    /**
     * print(base64Data) — writes ESC/POS bytes to the built-in serial printer.
     * Called from JS as: window.CitaqPrinter.print(base64String)
     * Returns true on success, false if all paths failed.
     */
    @JavascriptInterface
    public boolean print(String base64Data) {
        byte[] bytes;
        try {
            bytes = Base64.decode(base64Data, Base64.DEFAULT);
        } catch (Exception e) {
            Log.e(TAG, "Base64 decode error: " + e.getMessage());
            return false;
        }

        for (String path : PATHS) {
            try {
                FileOutputStream fos = new FileOutputStream(path);
                fos.write(bytes);
                fos.flush();
                fos.close();
                Log.i(TAG, "Printed " + bytes.length + " bytes to " + path);
                return true;
            } catch (Exception e) {
                Log.w(TAG, "Failed " + path + ": " + e.getMessage());
            }
        }
        Log.e(TAG, "All serial paths failed");
        return false;
    }
}
