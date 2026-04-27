package com.corpv3.restaurantpos;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register Capacitor plugins before super.onCreate
        registerPlugin(SerialPrinterPlugin.class);
        registerPlugin(SumUpPlugin.class);
        registerPlugin(LedPlugin.class);
        registerPlugin(UpdatePlugin.class);
        super.onCreate(savedInstanceState);
        // Expose CitaqPrinter JS interface directly to the WebView
        getBridge().getWebView().addJavascriptInterface(new PrinterJSInterface(), "CitaqPrinter");
    }
}
